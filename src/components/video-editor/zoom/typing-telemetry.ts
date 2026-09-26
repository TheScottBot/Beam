import type { InputEventSidecar } from '~/api/types/capture-session';
import type { TypingTelemetry } from './typing-zoom-types';

/** The engine writes cursor telemetry as `session_ns / 1_000_000`, rounded down; typing matches it. */
export const sessionNsToTelemetryMs = (sessionNs: number) => Math.floor(sessionNs / 1_000_000);

/**
 * The typing detection part of a session's input sidecar. Electron has already validated the
 * sidecar, so this only selects and converts; a version 1 sidecar holds no typing.
 */
export function typingTelemetryFromInput(sidecar: InputEventSidecar | undefined): TypingTelemetry {
  const telemetry: TypingTelemetry = {
    keystrokes: [],
    caretTrack: [],
    keystrokeLimitReached: false,
    caretLimitReached: false,
    caretAutomationUnavailable: false,
  };
  for (const event of sidecar?.events ?? []) {
    if (event.event === 'keystroke')
      telemetry.keystrokes.push({
        timeMs: sessionNsToTelemetryMs(event.sessionNs),
        producesCharacter: event.producesCharacter,
      });
    else if (event.event === 'caret')
      telemetry.caretTrack.push({
        timeMs: sessionNsToTelemetryMs(event.sessionNs),
        cx: event.normalizedX,
        cy: event.normalizedY,
      });
    else if (event.event === 'keystroke-limit-reached') telemetry.keystrokeLimitReached = true;
    else if (event.event === 'caret-limit-reached') telemetry.caretLimitReached = true;
    else if (event.event === 'caret-automation-unavailable') telemetry.caretAutomationUnavailable = true;
  }
  telemetry.keystrokes.sort((earlier, later) => earlier.timeMs - later.timeMs);
  telemetry.caretTrack.sort((earlier, later) => earlier.timeMs - later.timeMs);
  return telemetry;
}
