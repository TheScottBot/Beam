// Behaviour ported from Recordly's `zoomSuggestionUtils.typing.test.ts` at abb4c507, expressed
// against Beam's intervals.
import { describe, expect, it } from 'vitest';
import { buildTypingZoomRegions, freeStretchesWithin, MIN_TYPING_REGION_MS } from '../typing-zoom-regions';
import type { TypingBurstCandidate } from '../typing-zoom-types';
import { ZOOM_REGION_PADDING_MS } from '../zoom-suggestion-timing';
import { caretAt } from './typing-fixtures';

const candidate = (
  firstKeystrokeMs: number,
  lastKeystrokeMs: number,
  focus: TypingBurstCandidate['focus'] = { cx: 0.4, cy: 0.6 },
): TypingBurstCandidate => ({
  burst: { firstKeystrokeMs, lastKeystrokeMs, keystrokeCount: 5 },
  focus,
  focusRule: focus ? 'anchored-to-preceding-click' : 'no-trustworthy-focus',
  anchorClickTimeMs: focus ? firstKeystrokeMs - 500 : null,
});

const regionsFor = (
  candidates: TypingBurstCandidate[],
  occupied: Array<{ startMs: number; endMs: number }> = [],
  caretTrack = [] as ReturnType<typeof caretAt>[],
  timelineDurationMs = 60_000,
) => buildTypingZoomRegions({ candidates, occupied, caretTrack, timelineDurationMs });

describe('freeStretchesWithin', () => {
  it('returns the whole span when nothing is in the way', () => {
    expect(freeStretchesWithin({ startMs: 0, endMs: 1_000 }, [])).toEqual([{ startMs: 0, endMs: 1_000 }]);
  });

  it('returns the gaps around what is in the way, in order', () => {
    expect(
      freeStretchesWithin({ startMs: 0, endMs: 10_000 }, [
        { startMs: 6_000, endMs: 7_000 },
        { startMs: 2_000, endMs: 3_000 },
      ]),
    ).toEqual([
      { startMs: 0, endMs: 2_000 },
      { startMs: 3_000, endMs: 6_000 },
      { startMs: 7_000, endMs: 10_000 },
    ]);
  });

  it('returns nothing when the span is covered, and ignores intervals that only touch it', () => {
    expect(freeStretchesWithin({ startMs: 1_000, endMs: 2_000 }, [{ startMs: 0, endMs: 5_000 }])).toEqual([]);
    expect(
      freeStretchesWithin({ startMs: 1_000, endMs: 2_000 }, [
        { startMs: 0, endMs: 1_000 },
        { startMs: 2_000, endMs: 3_000 },
      ]),
    ).toEqual([{ startMs: 1_000, endMs: 2_000 }]);
  });
});

describe('where a typing region begins and ends', () => {
  it('begins at the first keystroke, with no pad ahead, and ends a pad after the last', () => {
    expect(regionsFor([candidate(5_000, 8_000)]).regions).toEqual([
      { startMs: 5_000, endMs: 8_000 + ZOOM_REGION_PADDING_MS, focus: { cx: 0.4, cy: 0.6 } },
    ]);
  });

  it('stops at the end of the timeline', () => {
    expect(regionsFor([candidate(5_000, 8_000)], [], [], 8_200).regions).toEqual([
      { startMs: 5_000, endMs: 8_200, focus: { cx: 0.4, cy: 0.6 } },
    ]);
  });
});

describe('typing gives way to what is already there', () => {
  it('gives every free stretch of a long burst its own region, never overlapping what it avoids', () => {
    const occupied = [{ startMs: 6_000, endMs: 7_000 }];
    const { regions } = regionsFor([candidate(5_000, 10_000)], occupied);
    expect(regions.map(({ startMs, endMs }) => ({ startMs, endMs }))).toEqual([
      { startMs: 5_000, endMs: 6_000 },
      { startMs: 7_000, endMs: 10_000 + ZOOM_REGION_PADDING_MS },
    ]);
    for (const region of regions)
      for (const interval of occupied)
        expect(region.endMs <= interval.startMs || region.startMs >= interval.endMs).toBe(true);
  });

  it('takes each stretch its focus from the caret inside it, falling back to the burst focus', () => {
    const { regions } = regionsFor(
      [candidate(5_000, 10_000)],
      [{ startMs: 6_000, endMs: 7_000 }],
      [caretAt(8_000, 0.9, 0.1)],
    );
    expect(regions.map((region) => region.focus)).toEqual([
      { cx: 0.4, cy: 0.6 },
      { cx: 0.9, cy: 0.1 },
    ]);
  });

  it('drops a stretch too short to be worth a zoom', () => {
    const { regions } = regionsFor(
      [candidate(5_000, 10_000)],
      [{ startMs: 5_000 + MIN_TYPING_REGION_MS - 1, endMs: 7_000 }],
    );
    expect(regions.map(({ startMs }) => startMs)).toEqual([7_000]);
    expect(MIN_TYPING_REGION_MS).toBe(400);
  });

  it('keeps a later burst clear of an earlier burst it has already placed', () => {
    const { regions } = regionsFor([candidate(5_000, 6_000), candidate(6_200, 7_000)]);
    expect(regions.map(({ startMs, endMs }) => ({ startMs, endMs }))).toEqual([
      { startMs: 5_000, endMs: 6_500 },
      { startMs: 6_500, endMs: 7_500 },
    ]);
  });
});

describe('what the counts say', () => {
  it('places nothing for a burst with no trustworthy focus, and does not call it limited', () => {
    expect(regionsFor([candidate(5_000, 6_000, null)])).toEqual({
      regions: [],
      burstsApplied: 0,
      burstsLimitedByClick: 0,
    });
  });

  it('counts a burst split into several regions as one burst applied, and as limited', () => {
    expect(regionsFor([candidate(5_000, 10_000)], [{ startMs: 6_000, endMs: 7_000 }])).toMatchObject({
      burstsApplied: 1,
      burstsLimitedByClick: 1,
    });
  });

  it('counts a burst with no room at all as limited and not applied', () => {
    expect(regionsFor([candidate(5_000, 6_000)], [{ startMs: 4_000, endMs: 9_000 }])).toMatchObject({
      regions: [],
      burstsApplied: 0,
      burstsLimitedByClick: 1,
    });
  });

  it('does not count a burst that only lost its trailing pad as limited', () => {
    expect(regionsFor([candidate(5_000, 6_000)], [{ startMs: 6_200, endMs: 9_000 }])).toMatchObject({
      burstsApplied: 1,
      burstsLimitedByClick: 0,
    });
  });
});
