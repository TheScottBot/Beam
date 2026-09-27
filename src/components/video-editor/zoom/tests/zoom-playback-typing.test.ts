import { describe, expect, it } from 'vitest';
import { zoomAtTime } from '../zoom-playback';
import type { ZoomElement } from '../zoom-types';

const zoom = (overrides: Partial<ZoomElement>): ZoomElement => ({
  id: 'zoom',
  sessionId: 'session',
  startMs: 1_000,
  endMs: 6_000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'auto',
  ...overrides,
});

describe('what a zoom follows', () => {
  it('follows the pointer for an automatic click zoom, as before', () => {
    expect(zoomAtTime([zoom({})], 3_500)).toMatchObject({ tracksCursor: true, tracksCaret: false });
  });

  it('follows the caret, not the pointer, for an automatic typing zoom, and says where it began', () => {
    expect(zoomAtTime([zoom({ trigger: 'typing' })], 3_500)).toMatchObject({
      tracksCursor: false,
      tracksCaret: true,
      regionStartMs: 1_000,
    });
  });

  it('follows nothing for a typing zoom someone has made manual', () => {
    expect(zoomAtTime([zoom({ trigger: 'typing', mode: 'manual' })], 3_500)).toMatchObject({
      tracksCursor: false,
      tracksCaret: false,
    });
  });
});

describe('what a typing zoom tells the caret camera', () => {
  it('reports where it ends and its full depth, whatever the transition strength', () => {
    expect(zoomAtTime([zoom({ trigger: 'typing', depth: 3 })], 1_500)).toMatchObject({
      regionStartMs: 1_000,
      regionEndMs: 6_000,
      regionScale: 1.8,
    });
  });
});

describe('connected handovers involving a typing zoom hold their zoom (TD29)', () => {
  const clickAt = (startMs: number, endMs: number, cy = 0.3) =>
    zoom({ id: `click-${startMs}`, startMs, endMs, focus: { cx: 0.4, cy } });
  const typingAt = (startMs: number, endMs: number, cy = 0.6) =>
    zoom({ id: `typing-${startMs}`, startMs, endMs, focus: { cx: 0.4, cy }, trigger: 'typing' });
  const lowestScale = (zooms: ZoomElement[], fromMs: number, toMs: number) => {
    let lowest = Number.POSITIVE_INFINITY;
    for (let timeMs = fromMs; timeMs <= toMs; timeMs += 20) lowest = Math.min(lowest, zoomAtTime(zooms, timeMs)!.scale);
    return lowest;
  };

  it('stays fully zoomed from a click zoom into the typing zoom it connects to', () => {
    expect(lowestScale([clickAt(2_000, 4_000), typingAt(4_000, 7_000)], 3_300, 5_300)).toBeCloseTo(1.5, 9);
  });

  it('stays fully zoomed from a typing zoom into the click zoom it connects to', () => {
    expect(lowestScale([typingAt(2_000, 4_000), clickAt(4_000, 7_000)], 3_300, 5_300)).toBeCloseTo(1.5, 9);
  });

  it('still arrives at the next zoom when the pan ends', () => {
    const arrived = zoomAtTime([clickAt(2_000, 4_000), typingAt(4_000, 7_000)], 5_200)!;
    expect(arrived.focus.cy).toBeCloseTo(0.6, 6);
    expect(arrived.scale).toBeCloseTo(1.5, 9);
  });

  it('holds a short typing zoom at its peak rather than letting it fade before the pan', () => {
    // A zoom this short peaks at 2850 ms, after its own end, so the hold is checked from there.
    expect(lowestScale([typingAt(2_000, 2_800), clickAt(2_800, 5_000)], 2_850, 4_000)).toBeCloseTo(1.5, 9);
  });

  it('leaves two connected click zooms with their existing timing', () => {
    expect(lowestScale([clickAt(2_000, 4_000), clickAt(4_000, 7_000, 0.6)], 3_300, 5_300)).toBeLessThan(1.4);
  });

  it('still zooms a typing zoom out when nothing follows it closely', () => {
    expect(zoomAtTime([typingAt(2_000, 4_000), clickAt(6_000, 8_000)], 3_800)!.scale).toBeLessThan(1.45);
  });
});
