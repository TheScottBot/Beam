import { describe, expect, it } from 'vitest';
import { buildAutomaticZoomElements, buildAutomaticZoomPlan, ZOOM_ALGORITHM_VERSION } from '../zoom-suggestions';
import { DEFAULT_ZOOM_DEPTH } from '../zoom-types';
import { caretAt, clickAt, keystrokesAt, typingRun, typingTelemetry } from './typing-fixtures';

const plan = (params: Partial<Parameters<typeof buildAutomaticZoomPlan>[0]> = {}) =>
  buildAutomaticZoomPlan({ telemetry: [], sessionId: 'session', durationMs: 30_000, ...params });

describe('recordings without typing are untouched', () => {
  const clicksOnly = [clickAt(1_000, 0.2, 0.3), clickAt(9_000, 0.8, 0.7, 'double-click')];

  it('produces exactly the zooms it did before typing detection existed', () => {
    const before = buildAutomaticZoomElements({ telemetry: clicksOnly, sessionId: 'session', durationMs: 30_000 });
    expect(plan({ telemetry: clicksOnly }).elements).toEqual(before);
    expect(plan({ telemetry: clicksOnly, typing: typingTelemetry() }).elements).toEqual(before);
    for (const zoom of before) expect(zoom).not.toHaveProperty('trigger');
  });

  it('reports no typing summary when the recording holds no keystrokes', () => {
    expect(plan({ telemetry: clicksOnly }).typing).toBeUndefined();
    expect(plan({ telemetry: clicksOnly, typing: typingTelemetry() }).typing).toBeUndefined();
  });

  it('keeps the algorithm version, so existing projects keep their zooms (TD6)', () => {
    expect(ZOOM_ALGORITHM_VERSION).toBe(8);
  });
});

describe('typing zooms', () => {
  it('sits beside the click zoom, focused where the click was, marked as typing', () => {
    const { elements, typing } = plan({
      telemetry: [clickAt(4_000, 0.25, 0.75)],
      typing: typingTelemetry({ keystrokes: typingRun(5_000, 8_000) }),
    });
    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({ startMs: 3_500, endMs: 4_500, focus: { cx: 0.25, cy: 0.75 } });
    expect(elements[0]).not.toHaveProperty('trigger');
    expect(elements[1]).toMatchObject({
      startMs: 5_000,
      endMs: 8_500,
      focus: { cx: 0.25, cy: 0.75 },
      trigger: 'typing',
      mode: 'auto',
      depth: DEFAULT_ZOOM_DEPTH,
      projection: '2d',
      sessionId: 'session',
    });
    expect(typing).toEqual({ burstsDetected: 1, burstsApplied: 1, burstsDeclinedForFocus: 0, burstsLimitedByClick: 0 });
  });

  it('zooms onto typing that had no click at all, when the caret says where it was', () => {
    const { elements } = plan({
      typing: typingTelemetry({ keystrokes: typingRun(5_000, 8_000), caretTrack: [caretAt(5_200, 0.6, 0.4)] }),
    });
    expect(elements).toEqual([expect.objectContaining({ trigger: 'typing', focus: { cx: 0.6, cy: 0.4 } })]);
  });

  it('suggests nothing for typing with neither a click nor a caret, and counts the decline', () => {
    const { elements, typing } = plan({ typing: typingTelemetry({ keystrokes: typingRun(5_000, 8_000) }) });
    expect(elements).toEqual([]);
    expect(typing).toEqual({ burstsDetected: 1, burstsApplied: 0, burstsDeclinedForFocus: 1, burstsLimitedByClick: 0 });
  });

  it('ignores presses that type nothing', () => {
    const { typing } = plan({
      telemetry: [clickAt(4_000, 0.5, 0.5)],
      typing: typingTelemetry({ keystrokes: keystrokesAt([5_000, 5_100, 5_200, 5_300], false) }),
    });
    expect(typing).toEqual({ burstsDetected: 0, burstsApplied: 0, burstsDeclinedForFocus: 0, burstsLimitedByClick: 0 });
  });

  it('gives way to a reserved zoom and picks up again after it', () => {
    const reserved = [
      {
        id: 'manual',
        sessionId: 'session',
        startMs: 6_000,
        endMs: 7_000,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 2 as const,
        mode: 'manual' as const,
      },
    ];
    const { elements } = plan({
      telemetry: [clickAt(4_900, 0.25, 0.75)],
      typing: typingTelemetry({ keystrokes: typingRun(5_700, 8_900) }),
      reserved,
    });
    const typingZooms = elements.filter((zoom) => zoom.trigger === 'typing');
    expect(typingZooms.map(({ startMs, endMs }) => ({ startMs, endMs }))).toEqual([{ startMs: 7_000, endMs: 9_400 }]);
  });

  it('gives each typing zoom its own identifier, apart from the click zooms', () => {
    const { elements } = plan({
      telemetry: [clickAt(4_000, 0.25, 0.75), clickAt(7_000, 0.25, 0.75)],
      typing: typingTelemetry({ keystrokes: typingRun(5_000, 9_000) }),
    });
    const ids = elements.map((zoom) => zoom.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(elements.filter((zoom) => zoom.trigger === 'typing').length).toBeGreaterThan(1);
  });
});
