import type { CaretSample } from './typing-zoom-types';
import type { ZoomFocus } from './zoom-types';

/**
 * Where a typing zoom's caret is at `timeMs`: the latest caret at or before it, and no earlier
 * than `sinceMs`, the moment the zoom began, since an older caret belongs to other typing.
 *
 * The caret is held rather than interpolated. It jumps a character or a line at a time, and
 * easing towards the next sample would move the camera before the caret had moved. The safe zone
 * and spring in `auto-follow-camera.ts` then decide whether and how smoothly the camera follows.
 */
export function caretFocusAt(caretTrack: readonly CaretSample[], timeMs: number, sinceMs: number): ZoomFocus | null {
  let lower = 0;
  let upper = caretTrack.length - 1;
  let latestIndex = -1;
  while (lower <= upper) {
    const middle = (lower + upper) >> 1;
    if (caretTrack[middle]!.timeMs <= timeMs) {
      latestIndex = middle;
      lower = middle + 1;
    } else upper = middle - 1;
  }
  const latest = caretTrack[latestIndex];
  if (!latest || latest.timeMs < sinceMs) return null;
  return { cx: latest.cx, cy: latest.cy };
}
