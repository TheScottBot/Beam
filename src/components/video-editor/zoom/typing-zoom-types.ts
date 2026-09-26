import type { ZoomFocus } from './zoom-types';

/** A key press on the cursor telemetry clock. Never which key: see `PRIVACY.md`. */
export interface TypingKeystroke {
  timeMs: number;
  producesCharacter: boolean;
}

/** Where the text caret was, as a fraction of the captured area, on the cursor telemetry clock. */
export interface CaretSample {
  timeMs: number;
  cx: number;
  cy: number;
}

/** A session's typing detection data, ready for zoom suggestions. */
export interface TypingTelemetry {
  keystrokes: TypingKeystroke[];
  caretTrack: CaretSample[];
  keystrokeLimitReached: boolean;
  caretLimitReached: boolean;
  caretAutomationUnavailable: boolean;
}

export interface TypingBurst {
  firstKeystrokeMs: number;
  lastKeystrokeMs: number;
  keystrokeCount: number;
}

export type TypingFocusRule =
  | 'taken-from-the-caret'
  | 'anchored-to-preceding-click'
  | 'inherited-from-typing-session'
  | 'no-trustworthy-focus';

export interface TypingBurstFocus {
  focus: ZoomFocus | null;
  rule: TypingFocusRule;
  anchorClickTimeMs: number | null;
}

/** Every burst becomes a candidate, including those without a focus, so declines can be counted. */
export interface TypingBurstCandidate {
  burst: TypingBurst;
  focus: ZoomFocus | null;
  focusRule: TypingFocusRule;
  anchorClickTimeMs: number | null;
}

export interface TypingZoomRegion {
  startMs: number;
  endMs: number;
  focus: ZoomFocus;
}

/**
 * What typing did in one generation. `burstsLimitedByClick` counts bursts that lost typed time,
 * or all their room, to a click zoom or a reserved zoom: a click zoom always keeps its region.
 */
export interface TypingSuggestionSummary {
  burstsDetected: number;
  burstsApplied: number;
  burstsDeclinedForFocus: number;
  burstsLimitedByClick: number;
}
