import { describe, expect, it } from 'vitest';
import { caretFocusAt } from '../caret-follow';
import { caretAt } from './typing-fixtures';

const track = [caretAt(1_000, 0.1, 0.1), caretAt(2_000, 0.2, 0.2), caretAt(3_000, 0.3, 0.3)];

describe('caretFocusAt', () => {
  it('has no caret to follow without a track', () => {
    expect(caretFocusAt([], 5_000, 0)).toBeNull();
  });

  it('is the latest caret at or before the time asked for', () => {
    expect(caretFocusAt(track, 2_000, 0)).toEqual({ cx: 0.2, cy: 0.2 });
    expect(caretFocusAt(track, 2_999, 0)).toEqual({ cx: 0.2, cy: 0.2 });
  });

  it('holds the last caret through a gap rather than easing towards the next, which has not happened yet', () => {
    expect(caretFocusAt(track, 2_500, 0)).toEqual({ cx: 0.2, cy: 0.2 });
    expect(caretFocusAt(track, 60_000, 0)).toEqual({ cx: 0.3, cy: 0.3 });
  });

  it('ignores carets from before the zoom began, which belong to other typing', () => {
    expect(caretFocusAt(track, 2_500, 1_500)).toEqual({ cx: 0.2, cy: 0.2 });
    expect(caretFocusAt(track, 1_900, 1_500)).toBeNull();
    expect(caretFocusAt(track, 2_000, 2_000)).toEqual({ cx: 0.2, cy: 0.2 });
  });

  it('has nothing before the first caret', () => {
    expect(caretFocusAt(track, 999, 0)).toBeNull();
  });
});
