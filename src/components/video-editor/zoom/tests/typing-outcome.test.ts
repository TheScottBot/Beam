import { describe, expect, it } from 'vitest';
import { typingOutcomeNotices } from '../typing-outcome';
import { sidecarOf } from './typing-fixtures';

const summary = (overrides = {}) => ({
  burstsDetected: 4,
  burstsApplied: 4,
  burstsDeclinedForFocus: 0,
  burstsLimitedByClick: 0,
  ...overrides,
});

describe('typingOutcomeNotices', () => {
  it('says nothing when typing worked, or when there was no typing', () => {
    expect(typingOutcomeNotices({ summary: summary() })).toEqual([]);
    expect(typingOutcomeNotices({ summary: null })).toEqual([]);
  });

  it('counts typing that produced no zoom because nothing recorded where it was', () => {
    expect(typingOutcomeNotices({ summary: summary({ burstsDeclinedForFocus: 2 }) })).toEqual([
      { key: 'typingDeclined', params: { declined: 2, detected: 4 } },
    ]);
  });

  it('counts typing zooms shortened to make room for other zooms', () => {
    expect(typingOutcomeNotices({ summary: summary({ burstsLimitedByClick: 1 }) })).toEqual([
      { key: 'typingLimited', params: { count: 1 } },
    ]);
  });

  it('explains a caret track cut short first, because it reads as a fault otherwise', () => {
    expect(
      typingOutcomeNotices({
        summary: summary({ burstsDeclinedForFocus: 1 }),
        interactions: sidecarOf([{ event: 'caret-limit-reached', sessionNs: 5 }]),
      }).map((notice) => notice.key),
    ).toEqual(['caretLimitReached', 'typingDeclined']);
  });

  it('explains every marker the engine wrote', () => {
    expect(
      typingOutcomeNotices({
        summary: null,
        interactions: sidecarOf([
          { event: 'keystroke-limit-reached', sessionNs: 1 },
          { event: 'caret-automation-unavailable', sessionNs: 0 },
        ]),
      }).map((notice) => notice.key),
    ).toEqual(['keystrokeLimitReached', 'caretAutomationUnavailable']);
  });

  it('explains a keyboard data file that could not be read, and nothing else', () => {
    expect(typingOutcomeNotices({ summary: null, interactionsRefusedReason: 'too-large' })).toEqual([
      { key: 'interactionsRefused' },
    ]);
  });
});
