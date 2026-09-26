import { describe, expect, it } from 'vitest';
import { sessionNsToTelemetryMs, typingTelemetryFromInput } from '../typing-telemetry';
import { sidecarOf, typingTelemetry } from './typing-fixtures';

describe('sessionNsToTelemetryMs', () => {
  it('rounds down, exactly as the engine does when it writes cursor telemetry', () => {
    expect(sessionNsToTelemetryMs(0)).toBe(0);
    expect(sessionNsToTelemetryMs(1_999_999)).toBe(1);
    expect(sessionNsToTelemetryMs(2_000_000)).toBe(2);
  });
});

describe('typingTelemetryFromInput', () => {
  it('has no typing for a session without interactions', () => {
    expect(typingTelemetryFromInput(undefined)).toEqual(typingTelemetry());
  });

  it('has no typing for a version 1 sidecar, which predates typing detection', () => {
    expect(
      typingTelemetryFromInput({
        version: 1,
        events: [{ event: 'shortcut', sessionNs: 1, pressed: true, modifiers: ['control'], key: 's' }],
      }),
    ).toEqual(typingTelemetry());
  });

  it('takes keystrokes and carets on the cursor telemetry clock and ignores shortcuts and clicks', () => {
    const telemetry = typingTelemetryFromInput(
      sidecarOf([
        { event: 'mouse-button', sessionNs: 500_000_000, button: 1, pressed: true },
        { event: 'shortcut', sessionNs: 600_000_000, pressed: true, modifiers: ['control'], key: 's' },
        { event: 'keystroke', sessionNs: 1_000_900_000, producesCharacter: true },
        { event: 'keystroke', sessionNs: 1_200_000_000, producesCharacter: false },
        { event: 'caret', sessionNs: 1_100_000_000, normalizedX: 0.25, normalizedY: 0.75 },
      ]),
    );
    expect(telemetry.keystrokes).toEqual([
      { timeMs: 1_000, producesCharacter: true },
      { timeMs: 1_200, producesCharacter: false },
    ]);
    expect(telemetry.caretTrack).toEqual([{ timeMs: 1_100, cx: 0.25, cy: 0.75 }]);
  });

  it('orders keystrokes and carets in time whatever order they were written in', () => {
    const telemetry = typingTelemetryFromInput(
      sidecarOf([
        { event: 'keystroke', sessionNs: 3_000_000, producesCharacter: true },
        { event: 'keystroke', sessionNs: 1_000_000, producesCharacter: true },
        { event: 'caret', sessionNs: 9_000_000, normalizedX: 0.9, normalizedY: 0.9 },
        { event: 'caret', sessionNs: 2_000_000, normalizedX: 0.1, normalizedY: 0.1 },
      ]),
    );
    expect(telemetry.keystrokes.map((keystroke) => keystroke.timeMs)).toEqual([1, 3]);
    expect(telemetry.caretTrack.map((sample) => sample.timeMs)).toEqual([2, 9]);
  });

  it('carries each marker the engine wrote, so a thin track can be explained', () => {
    expect(
      typingTelemetryFromInput(
        sidecarOf([
          { event: 'keystroke-limit-reached', sessionNs: 1 },
          { event: 'caret-limit-reached', sessionNs: 2 },
          { event: 'caret-automation-unavailable', sessionNs: 0 },
        ]),
      ),
    ).toEqual(
      typingTelemetry({ keystrokeLimitReached: true, caretLimitReached: true, caretAutomationUnavailable: true }),
    );
  });
});
