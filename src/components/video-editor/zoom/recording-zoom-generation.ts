import type { ClipComposition } from '~/media/shared/composition-types';
import type { CursorTelemetryPoint } from '~/api/types/capture-session';
import type { ZoomElement } from './zoom-types';
import type { TypingSuggestionSummary, TypingTelemetry } from './typing-zoom-types';
import { buildAutomaticZoomPlan, type AutomaticZoomPlan } from './zoom-suggestions';

const addTypingSummaries = (
  total: TypingSuggestionSummary | undefined,
  next: TypingSuggestionSummary | undefined,
): TypingSuggestionSummary | undefined =>
  !total || !next
    ? (total ?? next)
    : {
        burstsDetected: total.burstsDetected + next.burstsDetected,
        burstsApplied: total.burstsApplied + next.burstsApplied,
        burstsDeclinedForFocus: total.burstsDeclinedForFocus + next.burstsDeclinedForFocus,
        burstsLimitedByClick: total.burstsLimitedByClick + next.burstsLimitedByClick,
      };

export function generateRecordingZoomPlan(
  composition: ClipComposition,
  sessionId: string,
  telemetry: CursorTelemetryPoint[],
  reserved: ZoomElement[],
  typing?: TypingTelemetry,
): AutomaticZoomPlan {
  const assets = new Set(composition.assets.filter((asset) => asset.sessionId === sessionId).map((asset) => asset.id));
  const ids = new Set(reserved.map((zoom) => zoom.id));
  const allocateId = (base: string) => {
    let id = base;
    let suffix = 1;
    while (ids.has(id)) id = `${base}:${suffix++}`;
    ids.add(id);
    return id;
  };
  let typingSummary: TypingSuggestionSummary | undefined;
  const elements = composition.clips.flatMap((clip) => {
    if (clip.kind !== 'screen' || !assets.has(clip.assetId)) return [];
    const rate = clip.playbackRate;
    const durationMs = clip.timelineDurationMs;
    // Cursor, keystrokes and caret all move onto the clip's own clock the same way.
    const inClip = (point: { timeMs: number }) =>
      point.timeMs >= clip.sourceInMs && point.timeMs < clip.sourceInMs + clip.sourceDurationMs;
    const toClipTime = <Sample extends { timeMs: number }>(point: Sample): Sample => ({
      ...point,
      timeMs: (point.timeMs - clip.sourceInMs) / rate,
    });
    const samples = telemetry.filter(inClip).map(toClipTime);
    const clipTyping: TypingTelemetry | undefined = typing && {
      ...typing,
      keystrokes: typing.keystrokes.filter(inClip).map(toClipTime),
      caretTrack: typing.caretTrack.filter(inClip).map(toClipTime),
    };
    const occupied = reserved
      .filter((zoom) => zoom.startMs < clip.timelineStartMs + durationMs && zoom.endMs > clip.timelineStartMs)
      .map((zoom) => ({
        ...zoom,
        startMs: Math.max(0, zoom.startMs - clip.timelineStartMs),
        endMs: Math.min(durationMs, zoom.endMs - clip.timelineStartMs),
      }));
    const plan = buildAutomaticZoomPlan({
      sessionId,
      telemetry: samples,
      durationMs,
      reserved: occupied,
      typing: clipTyping,
    });
    typingSummary = addTypingSummaries(typingSummary, plan.typing);
    return plan.elements.map((zoom) => ({
      ...zoom,
      id: allocateId(`${zoom.id}:${clip.id}`),
      linkedClipId: clip.id,
      startMs: zoom.startMs + clip.timelineStartMs,
      endMs: zoom.endMs + clip.timelineStartMs,
    }));
  });
  return typingSummary ? { elements, typing: typingSummary } : { elements };
}

/** The zooms alone, for callers with no use for the typing summary. */
export const generateRecordingZooms = (...params: Parameters<typeof generateRecordingZoomPlan>): ZoomElement[] =>
  generateRecordingZoomPlan(...params).elements;
