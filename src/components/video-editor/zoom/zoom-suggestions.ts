import type { CursorTelemetryPoint } from '../../../api/types/capture-session';
import {
  DEFAULT_ZOOM_DEPTH,
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_INTENSITY,
  DEFAULT_ZOOM_TILT_PRESET,
  DEFAULT_ZOOM_TILT_VERTICAL,
  type ZoomElement,
  type ZoomFocus,
} from './zoom-types';
import { fitZoomPlacement } from './zoom-placement';
import { suggestAutomaticTilt } from './automatic-tilt';
import { buildTypingBurstCandidates } from './typing-bursts';
import { buildTypingZoomRegions } from './typing-zoom-regions';
import type { TypingSuggestionSummary, TypingTelemetry } from './typing-zoom-types';
import { CLICK_CLUSTER_GAP_MS, ZOOM_REGION_PADDING_MS } from './zoom-suggestion-timing';

export const ZOOM_ALGORITHM_VERSION = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const explicitClickTypes = new Set(['click', 'double-click', 'right-click', 'middle-click']);

export function normalizeCursorTelemetry(samples: CursorTelemetryPoint[], durationMs: number): CursorTelemetryPoint[] {
  return samples
    .filter((sample) => Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy))
    .map((sample) => ({
      ...sample,
      timeMs: clamp(sample.timeMs, 0, durationMs),
      cx: clamp(sample.cx, 0, 1),
      cy: clamp(sample.cy, 0, 1),
    }))
    .sort((left, right) => left.timeMs - right.timeMs);
}

function interactionStrength(sample: CursorTelemetryPoint) {
  if (sample.interactionType === 'double-click') return 1500;
  if (sample.interactionType === 'right-click' || sample.interactionType === 'middle-click') return 1200;
  return 900;
}

interface ClickCluster {
  firstMs: number;
  lastMs: number;
  focus: ZoomFocus;
  focusTimeMs: number;
}

function clusterClicks(samples: CursorTelemetryPoint[]): ClickCluster[] {
  const clicks = samples.filter((sample) => explicitClickTypes.has(sample.interactionType ?? ''));
  if (clicks.length === 0) return [];
  const clusters: ClickCluster[] = [];
  let members = [clicks[0]];
  const flush = () => {
    const best = members.reduce((winner, sample) =>
      interactionStrength(sample) > interactionStrength(winner) ? sample : winner,
    );
    clusters.push({
      firstMs: members[0].timeMs,
      lastMs: members.at(-1)?.timeMs ?? members[0].timeMs,
      focus: { cx: best.cx, cy: best.cy },
      focusTimeMs: best.timeMs,
    });
  };
  for (const click of clicks.slice(1)) {
    if (click.timeMs - (members.at(-1)?.timeMs ?? click.timeMs) <= CLICK_CLUSTER_GAP_MS) members.push(click);
    else {
      flush();
      members = [click];
    }
  }
  flush();
  return clusters;
}

export interface AutomaticZoomPlan {
  elements: ZoomElement[];
  /** Present only when the recording held keystrokes, so a recording without typing is unchanged. */
  typing?: TypingSuggestionSummary;
}

export function buildAutomaticZoomPlan(params: {
  telemetry: CursorTelemetryPoint[];
  sessionId: string;
  durationMs: number;
  reserved?: ZoomElement[];
  typing?: TypingTelemetry;
}): AutomaticZoomPlan {
  if (params.durationMs <= 0) return { elements: [] };
  const reserved = params.reserved ?? [];
  const telemetry = normalizeCursorTelemetry(params.telemetry, params.durationMs);
  const clickElements = clusterClicks(telemetry).flatMap((cluster) => {
    const requestedStartMs = Math.round(clamp(cluster.firstMs - ZOOM_REGION_PADDING_MS, 0, params.durationMs));
    const requestedEndMs = Math.round(clamp(cluster.lastMs + ZOOM_REGION_PADDING_MS, 0, params.durationMs));
    const placement = fitZoomPlacement({
      anchorMs: (cluster.firstMs + cluster.lastMs) / 2,
      preferredDurationMs: requestedEndMs - requestedStartMs,
      timelineDurationMs: params.durationMs,
      occupied: reserved,
    });
    if (!placement) return [];
    const tilt = suggestAutomaticTilt(telemetry, cluster.focusTimeMs, cluster.focus);
    return [
      {
        id: `auto:${params.sessionId}:${Math.round(cluster.firstMs)}`,
        sessionId: params.sessionId,
        startMs: placement.startMs,
        endMs: placement.endMs,
        focus: cluster.focus,
        depth: DEFAULT_ZOOM_DEPTH,
        mode: 'auto' as const,
        projection: '2d' as const,
        tiltIntensity: tilt?.intensity ?? DEFAULT_ZOOM_TILT_INTENSITY,
        tiltHorizontal: tilt?.horizontal ?? DEFAULT_ZOOM_TILT_HORIZONTAL,
        tiltVertical: tilt?.vertical ?? DEFAULT_ZOOM_TILT_VERTICAL,
        tiltPreset: 'custom' as const,
      },
    ];
  });
  const insideTimeline = (sample: { timeMs: number }) => sample.timeMs >= 0 && sample.timeMs <= params.durationMs;
  const keystrokes = params.typing?.keystrokes.filter(insideTimeline) ?? [];
  if (keystrokes.length === 0) return { elements: clickElements };
  const caretTrack = params.typing?.caretTrack.filter(insideTimeline) ?? [];
  const candidates = buildTypingBurstCandidates(keystrokes, telemetry, caretTrack);
  // Placed after the click zooms, so typing takes only the room clicks and reserved zooms leave.
  const placed = buildTypingZoomRegions({
    candidates,
    occupied: [...reserved, ...clickElements],
    caretTrack,
    timelineDurationMs: params.durationMs,
  });
  const typingElements: ZoomElement[] = placed.regions.map((region) => ({
    id: `auto:${params.sessionId}:typing:${Math.round(region.startMs)}`,
    sessionId: params.sessionId,
    startMs: Math.round(region.startMs),
    endMs: Math.round(region.endMs),
    focus: region.focus,
    depth: DEFAULT_ZOOM_DEPTH,
    mode: 'auto',
    trigger: 'typing',
    projection: '2d',
    // No pointer movement says anything about perspective while someone types.
    tiltIntensity: DEFAULT_ZOOM_TILT_INTENSITY,
    tiltHorizontal: DEFAULT_ZOOM_TILT_HORIZONTAL,
    tiltVertical: DEFAULT_ZOOM_TILT_VERTICAL,
    tiltPreset: DEFAULT_ZOOM_TILT_PRESET,
  }));
  return {
    elements: [...clickElements, ...typingElements].sort((earlier, later) => earlier.startMs - later.startMs),
    typing: {
      burstsDetected: candidates.length,
      burstsApplied: placed.burstsApplied,
      burstsDeclinedForFocus: candidates.filter((candidate) => candidate.focusRule === 'no-trustworthy-focus').length,
      burstsLimitedByClick: placed.burstsLimitedByClick,
    },
  };
}

/** The zooms alone, for callers with no use for the typing summary. */
export const buildAutomaticZoomElements = (params: Parameters<typeof buildAutomaticZoomPlan>[0]): ZoomElement[] =>
  buildAutomaticZoomPlan(params).elements;
