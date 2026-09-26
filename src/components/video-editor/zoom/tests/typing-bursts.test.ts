// Behaviour ported from Recordly's `typingBurstUtils.test.ts` at abb4c507, pinned so it cannot
// drift. One deliberate difference: a burst with a caret needs no click at all.
import { describe, expect, it } from 'vitest';
import {
  buildTypingBurstCandidates,
  deriveTypingBurstFocus,
  detectTypingBursts,
  TYPING_ANCHOR_WINDOW_MS,
  TYPING_BURST_MERGE_GAP_MS,
  TYPING_BURST_MIN_KEYSTROKES,
  TYPING_SESSION_CARRY_MS,
} from '../typing-bursts';
import { CLICK_CLUSTER_GAP_MS } from '../zoom-suggestion-timing';
import { caretAt, clickAt, keystrokesAt, typingRun } from './typing-fixtures';

const burstFrom = (firstKeystrokeMs: number, lastKeystrokeMs: number, keystrokeCount = 3) => ({
  firstKeystrokeMs,
  lastKeystrokeMs,
  keystrokeCount,
});

describe('typing burst thresholds', () => {
  it('uses the values Recordly settled on, with the click clustering gap as the burst gap', () => {
    expect(TYPING_BURST_MIN_KEYSTROKES).toBe(3);
    expect(TYPING_BURST_MERGE_GAP_MS).toBe(CLICK_CLUSTER_GAP_MS);
    expect(TYPING_BURST_MERGE_GAP_MS).toBe(2_500);
    expect(TYPING_ANCHOR_WINDOW_MS).toBe(2_500);
    expect(TYPING_SESSION_CARRY_MS).toBe(10_000);
  });
});

describe('detectTypingBursts', () => {
  it('finds no burst in a recording with no typing', () => {
    expect(detectTypingBursts([])).toEqual([]);
  });

  it('needs at least three character keystrokes to call it typing', () => {
    expect(detectTypingBursts(keystrokesAt([100, 200]))).toEqual([]);
    expect(detectTypingBursts(keystrokesAt([100, 200, 300]))).toEqual([burstFrom(100, 300, 3)]);
  });

  it('makes one burst from a sustained run, not one per key', () => {
    expect(detectTypingBursts(typingRun(1_000, 5_000))).toEqual([burstFrom(1_000, 5_000, 21)]);
  });

  it('splits at a pause longer than the gap and keeps a pause exactly at it', () => {
    expect(detectTypingBursts(keystrokesAt([0, 100, 200, 2_700, 2_800, 2_900]))).toEqual([burstFrom(0, 2_900, 6)]);
    expect(detectTypingBursts(keystrokesAt([0, 100, 200, 2_701, 2_800, 2_900]))).toEqual([
      burstFrom(0, 200),
      burstFrom(2_701, 2_900),
    ]);
  });

  it('counts only keystrokes that produce a character, so shortcuts and navigation are not typing', () => {
    const keystrokes = [...keystrokesAt([100, 200]), ...keystrokesAt([300, 400, 500], false)];
    expect(detectTypingBursts(keystrokes)).toEqual([]);
  });

  it('orders keystrokes in time before grouping them', () => {
    expect(detectTypingBursts(keystrokesAt([300, 100, 200]))).toEqual([burstFrom(100, 300)]);
  });
});

describe('deriveTypingBurstFocus', () => {
  const burst = burstFrom(5_000, 6_000);

  it('anchors to the latest left click before the burst, at the click', () => {
    expect(deriveTypingBurstFocus(burst, [clickAt(3_000, 0.1, 0.1), clickAt(4_000, 0.3, 0.4)])).toEqual({
      focus: { cx: 0.3, cy: 0.4 },
      rule: 'anchored-to-preceding-click',
      anchorClickTimeMs: 4_000,
    });
  });

  it('accepts a double click as the anchor', () => {
    expect(deriveTypingBurstFocus(burst, [clickAt(4_500, 0.6, 0.6, 'double-click')]).focus).toEqual({
      cx: 0.6,
      cy: 0.6,
    });
  });

  it('declines when the only preceding click is a right or middle click, which puts no caret in a field', () => {
    for (const interactionType of ['right-click', 'middle-click'] as const) {
      expect(deriveTypingBurstFocus(burst, [clickAt(4_500, 0.6, 0.6, interactionType)]).rule).toBe(
        'no-trustworthy-focus',
      );
    }
  });

  it('accepts a click exactly at the anchor window and declines one just outside it', () => {
    expect(deriveTypingBurstFocus(burst, [clickAt(5_000 - TYPING_ANCHOR_WINDOW_MS, 0.2, 0.2)]).focus).toEqual({
      cx: 0.2,
      cy: 0.2,
    });
    expect(deriveTypingBurstFocus(burst, [clickAt(5_000 - TYPING_ANCHOR_WINDOW_MS - 1, 0.2, 0.2)]).focus).toBeNull();
  });

  it('does not anchor to a click after the first keystroke, even inside the burst', () => {
    expect(deriveTypingBurstFocus(burst, [clickAt(5_500, 0.7, 0.7)]).focus).toBeNull();
  });

  it('never takes the pointer position during the typing as the focus', () => {
    expect(
      deriveTypingBurstFocus(burst, [
        { timeMs: 5_200, cx: 0.9, cy: 0.9, interactionType: 'move' },
        { timeMs: 4_900, cx: 0.8, cy: 0.8 },
      ]).focus,
    ).toBeNull();
  });
});

describe('buildTypingBurstCandidates', () => {
  it('produces one candidate per burst with its focus rule', () => {
    expect(buildTypingBurstCandidates(typingRun(5_000, 6_000), [clickAt(4_000, 0.3, 0.4)], [])).toEqual([
      {
        burst: burstFrom(5_000, 6_000, 6),
        focus: { cx: 0.3, cy: 0.4 },
        focusRule: 'anchored-to-preceding-click',
        anchorClickTimeMs: 4_000,
      },
    ]);
  });

  it('produces nothing for a recording with clicks and no typing', () => {
    expect(buildTypingBurstCandidates([], [clickAt(1_000, 0.5, 0.5)], [])).toEqual([]);
  });

  it('takes the focus from the caret when there is one, with no click needed at all', () => {
    const [candidate] = buildTypingBurstCandidates(typingRun(5_000, 6_000), [], [caretAt(5_100, 0.7, 0.2)]);
    expect(candidate).toMatchObject({ focus: { cx: 0.7, cy: 0.2 }, focusRule: 'taken-from-the-caret' });
  });

  it('prefers the caret to a click, because the click is only a guess at the field', () => {
    const [candidate] = buildTypingBurstCandidates(
      typingRun(5_000, 6_000),
      [clickAt(4_500, 0.1, 0.1)],
      [caretAt(5_400, 0.7, 0.2)],
    );
    expect(candidate).toMatchObject({ focus: { cx: 0.7, cy: 0.2 }, focusRule: 'taken-from-the-caret' });
  });

  it('ignores a caret from other typing, before or after the burst', () => {
    const [candidate] = buildTypingBurstCandidates(
      typingRun(5_000, 6_000),
      [clickAt(4_500, 0.1, 0.1)],
      [caretAt(4_999, 0.7, 0.2), caretAt(6_001, 0.8, 0.8)],
    );
    expect(candidate).toMatchObject({ focus: { cx: 0.1, cy: 0.1 }, focusRule: 'anchored-to-preceding-click' });
  });

  it('refuses a burst with neither a caret nor a click, and still reports it', () => {
    expect(buildTypingBurstCandidates(typingRun(5_000, 6_000), [], [])).toEqual([
      expect.objectContaining({ focus: null, focusRule: 'no-trustworthy-focus', anchorClickTimeMs: null }),
    ]);
  });
});

describe('a typing session that pauses keeps the field it was typing into', () => {
  const firstBurst = typingRun(5_000, 6_000);

  it('gives a later burst the focus of the one before when no click came between', () => {
    const candidates = buildTypingBurstCandidates(
      [...firstBurst, ...typingRun(10_700, 11_500)],
      [clickAt(4_500, 0.3, 0.3)],
      [],
    );
    expect(candidates[1]).toMatchObject({
      focus: { cx: 0.3, cy: 0.3 },
      focusRule: 'inherited-from-typing-session',
      anchorClickTimeMs: 4_500,
    });
  });

  it('keeps the focus at exactly the carry window and not a moment past it', () => {
    const atWindow = buildTypingBurstCandidates(
      [...firstBurst, ...typingRun(6_000 + TYPING_SESSION_CARRY_MS, 6_000 + TYPING_SESSION_CARRY_MS + 400)],
      [clickAt(4_500, 0.3, 0.3)],
      [],
    );
    expect(atWindow[1]?.focusRule).toBe('inherited-from-typing-session');
    const pastWindow = buildTypingBurstCandidates(
      [...firstBurst, ...typingRun(6_001 + TYPING_SESSION_CARRY_MS, 6_001 + TYPING_SESSION_CARRY_MS + 400)],
      [clickAt(4_500, 0.3, 0.3)],
      [],
    );
    expect(pastWindow[1]?.focusRule).toBe('no-trustworthy-focus');
  });

  it('does not carry across a click, because that click is the better anchor', () => {
    const candidates = buildTypingBurstCandidates(
      [...firstBurst, ...typingRun(10_700, 11_500)],
      [clickAt(4_500, 0.3, 0.3), clickAt(7_000, 0.9, 0.9)],
      [],
    );
    expect(candidates[1]?.focusRule).toBe('no-trustworthy-focus');
  });

  it('does not carry a focus the previous burst never had', () => {
    const candidates = buildTypingBurstCandidates([...firstBurst, ...typingRun(10_700, 11_500)], [], []);
    expect(candidates.map((candidate) => candidate.focusRule)).toEqual([
      'no-trustworthy-focus',
      'no-trustworthy-focus',
    ]);
  });
});
