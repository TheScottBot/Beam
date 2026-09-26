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
