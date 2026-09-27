// Where the camera looks during a typing zoom. Ported from Recordly's `caretFollowCamera.ts` at
// abb4c507 (TD22), after Beam's safe zone follow camera left the text off centre and jittery on
// the author's first recording.
//
// Following the caret exactly would never be still: it jumps a character and a line at a time.
// So a target holds while the caret is comfortably inside the frame and moves only when the caret
// would otherwise leave it, by the least it can; the camera then travels towards that target at a
// speed that rises with how far it has to go, so no frame throws it across the picture and no
// relocation leaves the viewer waiting.
//
// Pure and deterministic: the path is folded from the start of the region on every call, never
// carried between frames, so preview and every export path agree.

import type { CaretSample } from './typing-zoom-types';
import type { ZoomFocus } from './zoom-types';
import { clampFocusToScale } from './zoom-playback';

/**
 * How far the caret may stray from where the camera points before the camera moves, as a
 * fraction of the visible half extent. Recordly's starting value, to be tuned against recordings.
 */
export const CARET_DEADZONE_RATIO = 0.5;

/**
 * Camera speed per second, as a multiple of the distance still to cover. Following text down a
 * page is a movement and should be unhurried; typing over a selection relocates the caret, and a
 * camera that crawled after it would miss the typing. Speed rising with distance settles both.
 */
export const CARET_PAN_RESPONSIVENESS = 4;

/**
 * The floor closes the last sliver of a gap instead of approaching it forever; the ceiling keeps
 * a long jump quick without making it a one frame lurch.
 */
export const CARET_MIN_PAN_PER_SECOND = 0.05;
export const CARET_MAX_PAN_PER_SECOND = 2.5;

/** Moves `target` the least it can so `caret` sits no further than `deadzone` from it. */
const easeTowards = (target: number, caret: number, deadzone: number) => {
  const distance = caret - target;
  if (distance > deadzone) return caret - deadzone;
  if (distance < -deadzone) return caret + deadzone;
  return target;
};

/** Travels at most `maxDistance` along the straight line, so a diagonal is no faster than a side. */
const travelTowards = (from: ZoomFocus, to: ZoomFocus, maxDistance: number): ZoomFocus => {
  const distance = Math.hypot(to.cx - from.cx, to.cy - from.cy);
  if (distance <= maxDistance || distance === 0) return to;
  const fraction = maxDistance / distance;
  return { cx: from.cx + (to.cx - from.cx) * fraction, cy: from.cy + (to.cy - from.cy) * fraction };
};

export function resolveCaretFollowFocus(params: {
  caretTrack: readonly CaretSample[];
  /** Samples before this belong to earlier typing. */
  regionStartMs: number;
  /** Samples after this belong to later typing. */
  regionEndMs: number;
  timeMs: number;
  /** Where the zoom was focused when it was suggested. */
  anchorFocus: ZoomFocus;
  zoomScale: number;
}): ZoomFocus {
  const deadzone = CARET_DEADZONE_RATIO * (1 / (2 * params.zoomScale));
  const samplesInRegion = params.caretTrack.filter(
    (sample) => sample.timeMs >= params.regionStartMs && sample.timeMs <= params.regionEndMs,
  );
  const firstCaret = samplesInRegion[0];
  // The zoom opens already pointed at the text instead of sliding across to it, as a click zoom
  // opens on a click that has not happened yet. Only the first caret is looked ahead to; every
  // later one is a movement the viewer watches happen.
  let target: ZoomFocus = firstCaret ? { cx: firstCaret.cx, cy: firstCaret.cy } : params.anchorFocus;
  let camera = target;
  let lastTimeMs = params.regionStartMs;

  const travel = (untilMs: number) => {
    const elapsedMs = Math.max(0, untilMs - lastTimeMs);
    // Speed comes from the gap at the start of the stretch, keeping this a fold, not a simulation.
    const remaining = Math.hypot(target.cx - camera.cx, target.cy - camera.cy);
    const speed = Math.min(
      CARET_MAX_PAN_PER_SECOND,
      Math.max(CARET_MIN_PAN_PER_SECOND, remaining * CARET_PAN_RESPONSIVENESS),
    );
    camera = travelTowards(camera, target, (speed * elapsedMs) / 1_000);
    lastTimeMs = untilMs;
  };

  for (const sample of samplesInRegion) {
    // The first caret already aimed the camera; reading it through the dead zone would move it off.
    if (sample === firstCaret) continue;
    // Past the opening, the camera cannot see the future.
    if (sample.timeMs > params.timeMs) break;
    travel(sample.timeMs);
    target = { cx: easeTowards(target.cx, sample.cx, deadzone), cy: easeTowards(target.cy, sample.cy, deadzone) };
  }
  // A gap in the track lands here too: the camera finishes travelling to the last caret it trusted.
  travel(params.timeMs);
  return clampFocusToScale(camera, params.zoomScale);
}
