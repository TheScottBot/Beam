// Where typing zooms go. Ported from Recordly's `buildTypingRegions` at abb4c507.
//
// Typing zooms are placed after every click zoom and reserved zoom, and take only the room left:
// a click zoom is the stronger claim about what someone was looking at. A burst is never pushed
// aside or shrunk to one stretch. It is split around whatever is in the way, because switching
// windows or tabs is a click, and carrying on typing somewhere else is the ordinary case.

import type { ZoomPlacementInterval } from './zoom-placement';
import type { CaretSample, TypingBurstCandidate, TypingZoomRegion } from './typing-zoom-types';
import type { ZoomFocus } from './zoom-types';
import { ZOOM_REGION_PADDING_MS } from './zoom-suggestion-timing';

/** Shorter than this, a typing zoom would flash past between its neighbours. */
export const MIN_TYPING_REGION_MS = 400;

/** The parts of `span` nothing in `occupied` claims, in order. */
export function freeStretchesWithin(
  span: ZoomPlacementInterval,
  occupied: readonly ZoomPlacementInterval[],
): ZoomPlacementInterval[] {
  const blocking = occupied
    .filter((interval) => interval.startMs < span.endMs && interval.endMs > span.startMs)
    .sort((earlier, later) => earlier.startMs - later.startMs);
  const stretches: ZoomPlacementInterval[] = [];
  let cursorMs = span.startMs;
  for (const interval of blocking) {
    if (interval.startMs > cursorMs) stretches.push({ startMs: cursorMs, endMs: interval.startMs });
    cursorMs = Math.max(cursorMs, interval.endMs);
  }
  if (cursorMs < span.endMs) stretches.push({ startMs: cursorMs, endMs: span.endMs });
  return stretches;
}

const caretWithin = (stretch: ZoomPlacementInterval, caretTrack: readonly CaretSample[]): ZoomFocus | null => {
  const sample = caretTrack.find((caret) => caret.timeMs >= stretch.startMs && caret.timeMs <= stretch.endMs);
  return sample ? { cx: sample.cx, cy: sample.cy } : null;
};

export function buildTypingZoomRegions(params: {
  candidates: readonly TypingBurstCandidate[];
  occupied: readonly ZoomPlacementInterval[];
  caretTrack: readonly CaretSample[];
  timelineDurationMs: number;
}): { regions: TypingZoomRegion[]; burstsApplied: number; burstsLimitedByClick: number } {
  const occupied = [...params.occupied];
  const regions: TypingZoomRegion[] = [];
  let burstsApplied = 0;
  let burstsLimitedByClick = 0;
  for (const candidate of params.candidates) {
    if (!candidate.focus) continue;
    // No pad ahead of the typing: nothing on screen moves before the first keystroke, so a camera
    // already zoomed reads as a fault. The pad after stays, so the camera does not cut away the
    // moment someone reads back what they typed.
    const requested = {
      startMs: Math.max(0, candidate.burst.firstKeystrokeMs),
      endMs: Math.min(params.timelineDurationMs, candidate.burst.lastKeystrokeMs + ZOOM_REGION_PADDING_MS),
    };
    const usable = freeStretchesWithin(requested, occupied).filter(
      (stretch) => stretch.endMs - stretch.startMs >= MIN_TYPING_REGION_MS,
    );
    // Losing the pad is no loss; losing time someone spent typing is, and so is losing everything.
    const coveredMs = usable.reduce((total, stretch) => total + stretch.endMs - stretch.startMs, 0);
    const typedMs = candidate.burst.lastKeystrokeMs - candidate.burst.firstKeystrokeMs;
    if (usable.length === 0 || coveredMs < typedMs) burstsLimitedByClick += 1;
    if (usable.length > 0) burstsApplied += 1;
    for (const stretch of usable) {
      // Each stretch is its own moment; switching tabs moves the caret, so a burst carried across
      // a click must not keep pointing where it started.
      const region = { ...stretch, focus: caretWithin(stretch, params.caretTrack) ?? candidate.focus };
      regions.push(region);
      occupied.push(stretch);
    }
  }
  return { regions, burstsApplied, burstsLimitedByClick };
}
