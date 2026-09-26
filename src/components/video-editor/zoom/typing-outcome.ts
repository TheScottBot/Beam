// What to tell someone about typing zooms that did not appear, or stopped following. Ported from
// Recordly's `typingSuggestionMessage.ts` at abb4c507: silence where everything worked, and a
// sentence only when something did not, so a notice means something when it appears.

import type { InputEventSidecar, InputSidecarRefusedReason } from '~/api/types/capture-session';
import { typingTelemetryFromInput } from './typing-telemetry';
import type { TypingSuggestionSummary } from './typing-zoom-types';

export type TypingOutcomeNotice =
  | { key: 'interactionsRefused' }
  | { key: 'caretLimitReached' }
  | { key: 'keystrokeLimitReached' }
  | { key: 'caretAutomationUnavailable' }
  | { key: 'typingDeclined'; params: { declined: number; detected: number } }
  | { key: 'typingLimited'; params: { count: number } };

export function typingOutcomeNotices(input: {
  summary: TypingSuggestionSummary | null;
  interactions?: InputEventSidecar;
  interactionsRefusedReason?: InputSidecarRefusedReason;
}): TypingOutcomeNotice[] {
  // With the file refused there is no typing data at all, so nothing else can be said about it.
  if (input.interactionsRefusedReason) return [{ key: 'interactionsRefused' }];
  const telemetry = typingTelemetryFromInput(input.interactions);
  const notices: TypingOutcomeNotice[] = [];
  // First, because a zoom that starts well and then stops following reads as a fault rather
  // than as a limit being reached.
  if (telemetry.caretLimitReached) notices.push({ key: 'caretLimitReached' });
  if (telemetry.keystrokeLimitReached) notices.push({ key: 'keystrokeLimitReached' });
  if (telemetry.caretAutomationUnavailable) notices.push({ key: 'caretAutomationUnavailable' });
  const summary = input.summary;
  if (summary && summary.burstsDeclinedForFocus > 0)
    notices.push({
      key: 'typingDeclined',
      params: { declined: summary.burstsDeclinedForFocus, detected: summary.burstsDetected },
    });
  // Not a fault: a click zoom is the stronger claim about what someone was looking at.
  if (summary && summary.burstsLimitedByClick > 0)
    notices.push({ key: 'typingLimited', params: { count: summary.burstsLimitedByClick } });
  return notices;
}
