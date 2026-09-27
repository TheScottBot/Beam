// Ported from Recordly's `caretFollowCamera.test.ts` at abb4c507 (TD22), pinned so the feel the
// author chose cannot drift.
import { describe, expect, it } from 'vitest';
import {
  CARET_DEADZONE_RATIO,
  CARET_MAX_PAN_PER_SECOND,
  CARET_PAN_RESPONSIVENESS,
  resolveCaretFollowFocus,
} from '../caret-follow-camera';
import type { CaretSample } from '../typing-zoom-types';
import { caretAt } from './typing-fixtures';

// Inside the valid focus bounds at every scale these tests use, so the clamp is not silently doing
// the work an assertion is meant to check.
const ANCHOR = { cx: 0.4, cy: 0.4 };
const SCALE = 1.5;
/** Half the visible extent at this scale, which the dead zone is measured against. */
const HALF_EXTENT = 1 / (2 * SCALE);
const DEADZONE = CARET_DEADZONE_RATIO * HALF_EXTENT;

const follow = (caretTrack: CaretSample[], timeMs: number, zoomScale = SCALE) =>
  resolveCaretFollowFocus({
    caretTrack,
    regionStartMs: 0,
    regionEndMs: 30_000,
    timeMs,
    anchorFocus: ANCHOR,
    zoomScale,
  });

describe('resolveCaretFollowFocus', () => {
  it('keeps the anchor when there is no track at all', () => {
    expect(follow([], 1_000)).toEqual(ANCHOR);
  });

  it('keeps the anchor when the track holds nothing for this region', () => {
    expect(
      resolveCaretFollowFocus({
        caretTrack: [caretAt(40_000, 0.8, 0.8)],
        regionStartMs: 0,
        regionEndMs: 30_000,
        timeMs: 1_000,
        anchorFocus: ANCHOR,
        zoomScale: SCALE,
      }),
    ).toEqual(ANCHOR);
  });

  // The zoom opens already pointed at the text rather than sliding across to it, as a click
  // zoom opens pointed at a click that has not happened yet.
  it('opens already pointed at the first caret of the region, before that caret arrives', () => {
    const track = [caretAt(900, 0.6, 0.62)];
    expect(follow(track, 0)).toEqual({ cx: 0.6, cy: 0.62 });
    expect(follow(track, 500)).toEqual({ cx: 0.6, cy: 0.62 });
  });

  it('holds still while the caret moves about inside the dead zone', () => {
    const held = follow(
      [
        caretAt(100, 0.5, 0.5),
        caretAt(350, 0.5 + DEADZONE * 0.9, 0.5),
        caretAt(600, 0.5 - DEADZONE * 0.9, 0.5),
        caretAt(850, 0.5, 0.5 + DEADZONE * 0.9),
      ],
      5_000,
    );
    expect(held).toEqual({ cx: 0.5, cy: 0.5 });
  });

  // The least move that brings the caret back to the dead zone's edge; recentring would throw the
  // camera across the frame at every line break.
  it('follows a caret that leaves the dead zone, trailing it by the dead zone', () => {
    const followed = follow([caretAt(100, 0.5, 0.5), caretAt(350, 0.5, 0.5 + DEADZONE * 2)], 5_000);
    expect(followed.cy).toBeCloseTo(0.5 + DEADZONE, 6);
    expect(followed.cx).toBeCloseTo(0.5, 6);
  });

  // Typing over a selection relocates the caret; a camera that crawled after it would miss the
  // typing. Speed rises with distance.
  it('closes a long jump far faster than a short one', () => {
    const longTravelled = Math.abs(follow([caretAt(100, 0.4, 0.75), caretAt(350, 0.4, 0.25)], 600).cy - 0.75);
    const shortTravelled = Math.abs(follow([caretAt(100, 0.4, 0.75), caretAt(350, 0.4, 0.7)], 600).cy - 0.75);
    expect(longTravelled).toBeGreaterThan(shortTravelled * 4);
  });

  it('has a long jump essentially done within half a second', () => {
    const destination = 0.25 + DEADZONE;
    const remaining = Math.abs(follow([caretAt(0, 0.4, 0.75), caretAt(100, 0.4, 0.25)], 600).cy - destination);
    expect(remaining).toBeLessThan(0.05);
  });

  // Quick is not instant: a camera that jumped to each sample would lurch.
  it('never moves faster than the ceiling allows, however far the caret goes', () => {
    const track = [caretAt(100, 0.4, 0.4), caretAt(350, 0.95, 0.95)];
    let previous = follow(track, 0);
    let worstStep = 0;
    for (let timeMs = 16; timeMs <= 4_000; timeMs += 16) {
      const focus = follow(track, timeMs);
      worstStep = Math.max(worstStep, Math.hypot(focus.cx - previous.cx, focus.cy - previous.cy));
      previous = focus;
    }
    expect(worstStep).toBeLessThanOrEqual((CARET_MAX_PAN_PER_SECOND * 16) / 1_000 + 1e-9);
  });

  // While a page scrolls the caret holds one place on screen, so the camera must hold too.
  it('stops moving once a scrolling page pins the caret in place', () => {
    const climbing = [
      caretAt(100, 0.4, 0.45),
      caretAt(350, 0.4, 0.55),
      caretAt(600, 0.4, 0.65),
      caretAt(850, 0.4, 0.75),
    ];
    const pinned = Array.from({ length: 60 }, (_unused, index) => caretAt(1_100 + index * 250, 0.4, 0.75));
    expect(follow([...climbing, ...pinned], 14_000)).toEqual(follow([...climbing, ...pinned], 6_000));
  });

  it('ignores samples from before the region, which belong to earlier typing', () => {
    const track = [caretAt(100, 0.4, 0.9), caretAt(5_000, 0.55, 0.45)];
    expect(
      resolveCaretFollowFocus({
        caretTrack: track,
        regionStartMs: 4_000,
        regionEndMs: 30_000,
        timeMs: 9_000,
        anchorFocus: ANCHOR,
        zoomScale: SCALE,
      }),
    ).toEqual({ cx: 0.55, cy: 0.45 });
    expect(follow(track, 9_000).cy).toBeGreaterThan(0.45);
  });

  it('keeps the responsiveness and the ceiling in a sane relation to each other', () => {
    // A ceiling so low it undid the proportional speed would bring the crawl back.
    expect(CARET_MAX_PAN_PER_SECOND).toBeGreaterThanOrEqual(CARET_PAN_RESPONSIVENESS * 0.5);
  });

  it('follows sooner at a deeper zoom, where less of the frame is visible', () => {
    const track = [caretAt(100, 0.4, 0.4), caretAt(350, 0.4, 0.4 + DEADZONE * 0.7)];
    expect(follow(track, 6_000, 1.5).cy).toBeCloseTo(0.4, 6);
    expect(follow(track, 6_000, 3).cy).toBeGreaterThan(0.4);
  });

  it('never lets the frame leave the video', () => {
    const focus = follow([caretAt(100, 0, 1)], 20_000);
    expect(focus.cx).toBeGreaterThanOrEqual(HALF_EXTENT - 1e-9);
    expect(focus.cy).toBeLessThanOrEqual(1 - HALF_EXTENT + 1e-9);
  });
});
