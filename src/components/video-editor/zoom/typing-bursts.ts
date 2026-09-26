// Typing bursts, and the focus each may take. Ported from Recordly's `typingBurstUtils.ts` at
// abb4c507.
//
// A keystroke says only that a key went down and when; it has no position, so a burst is never
// zoomed to wherever the pointer happened to be parked. The evidence for where typing was is, in
// order: the caret inside the burst; a left or double click shortly before it, on the reasoning
// that a person clicks into a field before typing into it; the previous burst's focus, after a
// pause with no click. A burst with none of those gets no zoom: a missing zoom is neutral, a
// wrong one is a defect.

import type { CursorTelemetryPoint } from '~/api/types/capture-session';
import type {
  CaretSample,
  TypingBurst,
  TypingBurstCandidate,
  TypingBurstFocus,
  TypingKeystroke,
} from './typing-zoom-types';
import { CLICK_CLUSTER_GAP_MS } from './zoom-suggestion-timing';

/** Fewer presses than this is a shortcut or a stray key, not typing. */
export const TYPING_BURST_MIN_KEYSTROKES = 3;
/** The click clustering gap, so the product has one sense of when a moment has ended. */
export const TYPING_BURST_MERGE_GAP_MS = CLICK_CLUSTER_GAP_MS;
/** How long before the first keystroke a click may be and still be the field that was typed into. */
export const TYPING_ANCHOR_WINDOW_MS = 2_500;
/**
 * How long someone may pause and still be typing into the same field. Recordly set it from a
 * recording of 23 September 2026 in which a 4.7 s think pause split one piece of typing in two.
 */
export const TYPING_SESSION_CARRY_MS = 10_000;

// Right and middle clicks do not put a caret in a field.
const isAnchorClick = (sample: CursorTelemetryPoint) =>
  sample.interactionType === 'click' || sample.interactionType === 'double-click';

export function detectTypingBursts(keystrokes: readonly TypingKeystroke[]): TypingBurst[] {
  const typed = keystrokes
    .filter((keystroke) => keystroke.producesCharacter)
    .map((keystroke) => keystroke.timeMs)
    .sort((earlier, later) => earlier - later);
  const clusters: number[][] = [];
  for (const timeMs of typed) {
    const cluster = clusters.at(-1);
    if (cluster && timeMs - cluster[cluster.length - 1]! <= TYPING_BURST_MERGE_GAP_MS) cluster.push(timeMs);
    else clusters.push([timeMs]);
  }
  return clusters
    .filter((cluster) => cluster.length >= TYPING_BURST_MIN_KEYSTROKES)
    .map((cluster) => ({
      firstKeystrokeMs: cluster[0]!,
      lastKeystrokeMs: cluster[cluster.length - 1]!,
      keystrokeCount: cluster.length,
    }));
}

export function deriveTypingBurstFocus(burst: TypingBurst, samples: readonly CursorTelemetryPoint[]): TypingBurstFocus {
  const earliestAcceptableClickMs = burst.firstKeystrokeMs - TYPING_ANCHOR_WINDOW_MS;
  let anchorClick: CursorTelemetryPoint | null = null;
  for (const sample of samples) {
    if (!isAnchorClick(sample)) continue;
    if (sample.timeMs > burst.firstKeystrokeMs || sample.timeMs < earliestAcceptableClickMs) continue;
    if (!anchorClick || sample.timeMs > anchorClick.timeMs) anchorClick = sample;
  }
  if (!anchorClick) return { focus: null, rule: 'no-trustworthy-focus', anchorClickTimeMs: null };
  return {
    focus: { cx: anchorClick.cx, cy: anchorClick.cy },
    rule: 'anchored-to-preceding-click',
    anchorClickTimeMs: anchorClick.timeMs,
  };
}

/** The first caret inside the burst: where the typing actually was, not a guess from a click. */
const caretForBurst = (burst: TypingBurst, caretTrack: readonly CaretSample[]) =>
  caretTrack.find((sample) => sample.timeMs >= burst.firstKeystrokeMs && sample.timeMs <= burst.lastKeystrokeMs);

export function buildTypingBurstCandidates(
  keystrokes: readonly TypingKeystroke[],
  samples: readonly CursorTelemetryPoint[],
  caretTrack: readonly CaretSample[],
): TypingBurstCandidate[] {
  const candidates: TypingBurstCandidate[] = [];
  let previous: { burst: TypingBurst; focus: TypingBurstFocus } | null = null;
  for (const burst of detectTypingBursts(keystrokes)) {
    const caret = caretForBurst(burst, caretTrack);
    // The caret wins outright. Unlike Recordly, a burst with a caret needs no click at all.
    let focus: TypingBurstFocus = caret
      ? { focus: { cx: caret.cx, cy: caret.cy }, rule: 'taken-from-the-caret', anchorClickTimeMs: null }
      : deriveTypingBurstFocus(burst, samples);
    if (!focus.focus && previous?.focus.focus) {
      const previousBurst: TypingBurst = previous.burst;
      const pauseMs = burst.firstKeystrokeMs - previousBurst.lastKeystrokeMs;
      // A click inside the anchor window would already have been found above and is always the
      // better anchor, so one here means the person moved on to something else.
      const clickIntervened = samples.some(
        (sample) =>
          isAnchorClick(sample) &&
          sample.timeMs > previousBurst.lastKeystrokeMs &&
          sample.timeMs <= burst.firstKeystrokeMs,
      );
      if (pauseMs <= TYPING_SESSION_CARRY_MS && !clickIntervened)
        focus = {
          focus: previous.focus.focus,
          rule: 'inherited-from-typing-session',
          anchorClickTimeMs: previous.focus.anchorClickTimeMs,
        };
    }
    candidates.push({
      burst,
      focus: focus.focus,
      focusRule: focus.rule,
      anchorClickTimeMs: focus.anchorClickTimeMs,
    });
    previous = { burst, focus };
  }
  return candidates;
}
