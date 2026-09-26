// Shared builders for typing zoom tests, so every suite describes keystrokes, carets and clicks
// the same way.
import type { CursorTelemetryPoint, InputEvent, InputEventSidecar } from '~/api/types/capture-session';
import type { CaretSample, TypingKeystroke, TypingTelemetry } from '../typing-zoom-types';

export const keystrokesAt = (timesMs: readonly number[], producesCharacter = true): TypingKeystroke[] =>
  timesMs.map((timeMs) => ({ timeMs, producesCharacter }));

/** A steady run of typing from `firstMs` to `lastMs`, one key every `everyMs`. */
export const typingRun = (firstMs: number, lastMs: number, everyMs = 200): TypingKeystroke[] =>
  keystrokesAt(
    Array.from({ length: Math.floor((lastMs - firstMs) / everyMs) + 1 }, (_, index) => firstMs + index * everyMs),
  );

export const caretAt = (timeMs: number, cx: number, cy: number): CaretSample => ({ timeMs, cx, cy });

export const clickAt = (
  timeMs: number,
  cx: number,
  cy: number,
  interactionType: CursorTelemetryPoint['interactionType'] = 'click',
): CursorTelemetryPoint => ({ timeMs, cx, cy, interactionType });

export const typingTelemetry = (overrides: Partial<TypingTelemetry> = {}): TypingTelemetry => ({
  keystrokes: [],
  caretTrack: [],
  keystrokeLimitReached: false,
  caretLimitReached: false,
  caretAutomationUnavailable: false,
  ...overrides,
});

export const sidecarOf = (events: InputEvent[]): InputEventSidecar => ({ version: 2, events });
