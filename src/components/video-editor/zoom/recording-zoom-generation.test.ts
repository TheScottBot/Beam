import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createComposition } from '../composition/engine/clip-engine';
import type { ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import type { CursorTelemetryPoint } from '~/api/types/capture-session';
import type { ZoomElement } from './zoom-types';
import { generateRecordingZoomPlan, generateRecordingZooms } from './recording-zoom-generation';
import { caretAt, typingRun, typingTelemetry } from './tests/typing-fixtures';

const asset = (id: string, sessionId: string): MediaAsset => ({
  id,
  kind: 'video',
  name: id,
  fileName: `${id}.webm`,
  durationMs: 60_000,
  width: 1_920,
  height: 1_080,
  src: `/media/${id}.webm`,
  origin: 'session',
  sessionId,
});

const screen = (id: string, assetId: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'screen',
  name: id,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 5_000,
  sourceInMs: 0,
  sourceDurationMs: 5_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: `${id}-track`,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const composition = (clips: VisualClip[], assets: MediaAsset[]): ClipComposition => createComposition(assets, clips);

const click = (timeMs: number, cx = 0.25, cy = 0.75): CursorTelemetryPoint => ({
  timeMs,
  cx,
  cy,
  interactionType: 'click',
});

const manualZoom = (id: string, startMs: number, endMs: number, sessionId = 'session'): ZoomElement => ({
  id,
  sessionId,
  startMs,
  endMs,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
});

describe('generateRecordingZooms', () => {
  it('maps trimmed source telemetry into the clip timeline using playback rate and offset', () => {
    const result = generateRecordingZooms(
      composition(
        [
          screen('trimmed-screen', 'screen-asset', {
            timelineStartMs: 4_000,
            timelineDurationMs: 2_000,
            sourceInMs: 3_000,
            sourceDurationMs: 4_000,
            playbackRate: 2,
          }),
        ],
        [asset('screen-asset', 'session')],
      ),
      'session',
      [click(2_999), click(4_000, 0.4, 0.6), click(7_001)],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      linkedClipId: 'trimmed-screen',
      startMs: 4_000,
      endMs: 5_000,
      focus: { cx: 0.4, cy: 0.6 },
      mode: 'auto',
      sessionId: 'session',
    });
  });

  it('places generated zooms around the click while respecting reserved timeline space', () => {
    const result = generateRecordingZooms(
      composition([screen('screen', 'screen-asset')], [asset('screen-asset', 'session')]),
      'session',
      [click(1_000)],
      [manualZoom('reserved', 0, 750)],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ linkedClipId: 'screen', startMs: 750, endMs: 1_750 });
  });

  it('generates only for screen assets belonging to the requested recording session', () => {
    const result = generateRecordingZooms(
      composition(
        [screen('current-screen', 'current-asset'), screen('other-screen', 'other-asset')],
        [asset('current-asset', 'session'), asset('other-asset', 'other-session')],
      ),
      'session',
      [click(1_000)],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ linkedClipId: 'current-screen', sessionId: 'session' });
    expect(result.every((zoom) => zoom.linkedClipId !== 'other-screen')).toBe(true);
  });
});

it('keeps generated IDs unique across recording copies and retained detached zooms', () => {
  const comp = composition(
    [screen('one', 'asset'), screen('two', 'asset', { timelineStartMs: 6000 })],
    [asset('asset', 'session')],
  );
  const reserved = { ...manualZoom('auto:session:1000:one', 3000, 4000), mode: 'auto' as const, linkedClipId: null };
  const generated = generateRecordingZooms(comp, 'session', [click(1000)], [reserved]);
  expect(generated).toHaveLength(2);
  expect(new Set([reserved, ...generated].map((zoom) => zoom.id)).size).toBe(3);
  expect(generated.map((zoom) => zoom.linkedClipId)).toEqual(['one', 'two']);
});

describe('generateRecordingZoomPlan with typing', () => {
  const trimmedComposition = () =>
    composition(
      [
        screen('trimmed-screen', 'screen-asset', {
          timelineStartMs: 4_000,
          timelineDurationMs: 2_000,
          sourceInMs: 3_000,
          sourceDurationMs: 4_000,
          playbackRate: 2,
        }),
      ],
      [asset('screen-asset', 'session')],
    );

  it('maps keystrokes and the caret into the clip timeline exactly as it maps the cursor', () => {
    const { elements } = generateRecordingZoomPlan(
      trimmedComposition(),
      'session',
      [],
      [],
      typingTelemetry({ keystrokes: typingRun(3_000, 5_000), caretTrack: [caretAt(3_400, 0.7, 0.2)] }),
    );
    expect(elements).toEqual([
      expect.objectContaining({
        linkedClipId: 'trimmed-screen',
        trigger: 'typing',
        startMs: 4_000,
        endMs: 5_500,
        focus: { cx: 0.7, cy: 0.2 },
      }),
    ]);
  });

  it('ignores typing outside the part of the recording the clip uses', () => {
    const { elements, typing } = generateRecordingZoomPlan(
      trimmedComposition(),
      'session',
      [],
      [],
      typingTelemetry({ keystrokes: typingRun(8_000, 9_000), caretTrack: [caretAt(8_100, 0.7, 0.2)] }),
    );
    expect(elements).toEqual([]);
    expect(typing).toBeUndefined();
  });

  it('adds up what typing did across every clip of the recording', () => {
    const twoClips = composition(
      [screen('one', 'asset'), screen('two', 'asset', { timelineStartMs: 6_000 })],
      [asset('asset', 'session')],
    );
    const { typing } = generateRecordingZoomPlan(
      twoClips,
      'session',
      [],
      [],
      typingTelemetry({ keystrokes: typingRun(1_000, 2_000) }),
    );
    expect(typing).toEqual({ burstsDetected: 2, burstsApplied: 0, burstsDeclinedForFocus: 2, burstsLimitedByClick: 0 });
  });

  it('returns the same elements generateRecordingZooms does', () => {
    const typingInput = typingTelemetry({
      keystrokes: typingRun(3_000, 5_000),
      caretTrack: [caretAt(3_400, 0.7, 0.2)],
    });
    expect(generateRecordingZooms(trimmedComposition(), 'session', [click(4_000)], [], typingInput)).toEqual(
      generateRecordingZoomPlan(trimmedComposition(), 'session', [click(4_000)], [], typingInput).elements,
    );
  });
});
