import { describe, expect, it, vi } from 'vitest';
import {
  cameraTiltForControls,
  createCompositionCameraEvaluator,
  MAX_CAMERA_TILT_RADIANS,
  type CameraSample,
} from './composition-camera';
import type { ZoomElement } from './zoom-types';

const zooms: ZoomElement[] = [
  {
    id: 'zoom',
    sessionId: 'session',
    startMs: 200,
    endMs: 1_800,
    focus: { cx: 0.8, cy: 0.25 },
    depth: 3,
    mode: 'manual',
  },
];

const expectSampleClose = (actual: CameraSample, expected: CameraSample) => {
  expect(actual.scale).toBeCloseTo(expected.scale, 8);
  expect(actual.focus.cx).toBeCloseTo(expected.focus.cx, 8);
  expect(actual.focus.cy).toBeCloseTo(expected.focus.cy, 8);
};

const autoZoom: ZoomElement = {
  id: 'auto-follow',
  sessionId: 'session',
  startMs: 0,
  endMs: 5_000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'auto',
};

const autoFollow = { safeZone: 0.5, responsiveness: 0.55, directionLock: true } as const;

describe('composition camera evaluator', () => {
  it('keeps an auto zoom stable while the cursor remains inside its safe zone', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [autoZoom],
      telemetry: [
        { timeMs: 0, cx: 0.58, cy: 0.42 },
        { timeMs: 5_000, cx: 0.58, cy: 0.42 },
      ],
      autoFollow,
    });

    expect(evaluator.sample(2_500).focus).toEqual({ cx: 0.5, cy: 0.5 });
  });

  it('corrects the minimum required axes when an auto-zoom cursor leaves the safe zone', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [autoZoom],
      telemetry: [
        { timeMs: 0, cx: 0.9, cy: 0.5 },
        { timeMs: 5_000, cx: 0.9, cy: 0.5 },
      ],
      autoFollow,
    });

    const sample = evaluator.sample(2_500);
    expect(sample.focus.cx).toBeGreaterThan(0.5);
    expect(sample.focus.cy).toBe(0.5);
  });

  it('samples cursor telemetry through the active screen source-time mapping', () => {
    const telemetry = [
      { timeMs: 0, cx: 0.5, cy: 0.5 },
      { timeMs: 1_000, cx: 0.5, cy: 0.5 },
      { timeMs: 2_000, cx: 0.9, cy: 0.5 },
      { timeMs: 5_000, cx: 0.9, cy: 0.5 },
    ];
    const timelineTime = createCompositionCameraEvaluator({ zooms: [autoZoom], telemetry, autoFollow });
    const mapTelemetryTime = vi.fn((timeMs: number) => timeMs + 2_000);
    const sourceTime = createCompositionCameraEvaluator({
      zooms: [autoZoom],
      telemetry,
      autoFollow,
      mapTelemetryTime,
    });

    expect(sourceTime.sample(1_000).focus.cx).toBeGreaterThan(timelineTime.sample(1_000).focus.cx);
    expect(mapTelemetryTime).toHaveBeenCalled();
  });

  it('returns deterministic samples for sequential, direct and non-sequential access', () => {
    const create = () =>
      createCompositionCameraEvaluator({
        zooms: [autoZoom],
        telemetry: [
          { timeMs: 0, cx: 0.9, cy: 0.5 },
          { timeMs: 1_000, cx: 0.9, cy: 0.5 },
          { timeMs: 2_000, cx: 0.5, cy: 0.9 },
          { timeMs: 5_000, cx: 0.5, cy: 0.9 },
        ],
        autoFollow,
      });
    const expected = create().sample(2_500);
    const sequential = create();
    for (let timeMs = 0; timeMs <= 2_500; timeMs += 1000 / 60) sequential.sample(timeMs);
    expectSampleClose(sequential.sample(2_500), expected);

    const nonSequential = create();
    nonSequential.sample(4_000);
    nonSequential.sample(750);
    expectSampleClose(nonSequential.sample(2_500), expected);
  });

  it('returns the same sample for sequential playback, direct seek, backward seek and export frame rates', () => {
    const sequential = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    for (let time = 0; time <= 1_250; time += 1_000 / 60) sequential.sample(time);
    const expected = sequential.sample(1_250);

    expectSampleClose(createCompositionCameraEvaluator({ zooms, telemetry: [] }).sample(1_250), expected);

    const backward = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    backward.sample(1_700);
    expectSampleClose(backward.sample(1_250), expected);

    for (const fps of [30, 60]) {
      const exported = createCompositionCameraEvaluator({ zooms, telemetry: [] });
      for (let frame = 0; frame <= Math.round(1.25 * fps); frame += 1) exported.sample((frame / fps) * 1_000);
      expectSampleClose(exported.sample(1_250), expected);
    }
  });

  it('rebuilds deterministic checkpoints when invalidated', () => {
    const evaluator = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    const before = evaluator.sample(1_375);
    evaluator.invalidate();
    expectSampleClose(evaluator.sample(1_375), before);
  });

  it('keeps legacy zooms flat when projection fields are missing', () => {
    const sample = createCompositionCameraEvaluator({ zooms, telemetry: [] }).sample(1_000);

    expect(sample.tiltX).toBe(0);
    expect(sample.tiltY).toBe(0);
  });

  it('interpolates finite tilt for a 3D zoom', () => {
    const sample = createCompositionCameraEvaluator({
      zooms: [{ ...zooms[0]!, projection: '3d', tiltIntensity: 1 }],
      telemetry: [],
    }).sample(1_000);

    expect(Number.isFinite(sample.tiltX)).toBe(true);
    expect(Number.isFinite(sample.tiltY)).toBe(true);
    expect(Math.abs(sample.tiltX ?? 0)).toBeLessThanOrEqual(MAX_CAMERA_TILT_RADIANS);
    expect(Math.abs(sample.tiltY ?? 0)).toBeLessThanOrEqual(MAX_CAMERA_TILT_RADIANS);
  });

  it.each([
    ['left', -1, 0, 0, -MAX_CAMERA_TILT_RADIANS],
    ['right', 1, 0, 0, MAX_CAMERA_TILT_RADIANS],
    ['up', 0, -1, -MAX_CAMERA_TILT_RADIANS, 0],
    ['down', 0, 1, MAX_CAMERA_TILT_RADIANS, 0],
    ['left/up diagonal', -1, -1, -MAX_CAMERA_TILT_RADIANS / Math.SQRT2, -MAX_CAMERA_TILT_RADIANS / Math.SQRT2],
    ['right/down diagonal', 1, 1, MAX_CAMERA_TILT_RADIANS / Math.SQRT2, MAX_CAMERA_TILT_RADIANS / Math.SQRT2],
  ])(
    'maps %s controls to signed tilt axes at the 62° maximum',
    (_label, horizontal, vertical, expectedX, expectedY) => {
      const result = cameraTiltForControls(1, horizontal, vertical);

      expect(result.tiltX).toBeCloseTo(expectedX, 12);
      expect(result.tiltY).toBeCloseTo(expectedY, 12);
    },
  );

  it('clamps intensity and both signed axes before applying the 62° maximum', () => {
    const horizontal = cameraTiltForControls(4, -3, 0);
    const vertical = cameraTiltForControls(4, 0, 2);

    expect(horizontal.tiltX).toBe(0);
    expect(horizontal.tiltY).toBeCloseTo(-MAX_CAMERA_TILT_RADIANS, 12);
    expect(vertical.tiltX).toBeCloseTo(MAX_CAMERA_TILT_RADIANS, 12);
    expect(vertical.tiltY).toBe(0);
    expect(Math.abs(horizontal.tiltY)).toBeLessThanOrEqual(MAX_CAMERA_TILT_RADIANS);
    expect(Math.abs(vertical.tiltX)).toBeLessThanOrEqual(MAX_CAMERA_TILT_RADIANS);
  });

  it('keeps tilt deterministic when sampled through 30 and 60 fps playback', () => {
    const threeDZoom: ZoomElement = {
      ...zooms[0]!,
      projection: '3d',
      tiltIntensity: 1,
      tiltHorizontal: 0.9,
      tiltVertical: -0.8,
    };
    const reference = createCompositionCameraEvaluator({ zooms: [threeDZoom], telemetry: [] });
    const expected = reference.sample(1_250);

    for (const fps of [30, 60]) {
      const evaluator = createCompositionCameraEvaluator({ zooms: [threeDZoom], telemetry: [] });
      for (let frame = 0; frame <= Math.round((1_250 / 1_000) * fps); frame += 1)
        evaluator.sample((frame / fps) * 1_000);
      const actual = evaluator.sample(1_250);

      expect(actual.tiltX ?? 0).toBeCloseTo(expected.tiltX ?? 0, 8);
      expect(actual.tiltY ?? 0).toBeCloseTo(expected.tiltY ?? 0, 8);
    }
  });
});

describe('composition camera following the caret', () => {
  const typingZoom: ZoomElement = { ...autoZoom, id: 'typing', trigger: 'typing' };
  const pointerFarRight = [
    { timeMs: 0, cx: 0.95, cy: 0.5 },
    { timeMs: 5_000, cx: 0.95, cy: 0.5 },
  ];

  it('moves a typing zoom when the caret leaves the safe zone, and ignores the pointer', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [typingZoom],
      telemetry: pointerFarRight,
      caretTrack: [{ timeMs: 2_000, cx: 0.5, cy: 0.9 }],
      autoFollow,
    });
    const sample = evaluator.sample(4_000);
    expect(sample.focus.cy).toBeGreaterThan(0.5);
    expect(sample.focus.cx).toBe(0.5);
  });

  // Replaced under TD23: a typing zoom now opens on its first caret (Recordly's camera, TD22)
  // instead of holding its saved focus while the caret is near it.
  it('opens a typing zoom on its first caret and holds while the caret stays near it', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [typingZoom],
      telemetry: pointerFarRight,
      caretTrack: [
        { timeMs: 2_000, cx: 0.55, cy: 0.45 },
        { timeMs: 2_500, cx: 0.57, cy: 0.45 },
      ],
      autoFollow,
    });
    const sample = evaluator.sample(4_000);
    expect(sample.focus.cx).toBeCloseTo(0.55, 6);
    expect(sample.focus.cy).toBeCloseTo(0.45, 6);
  });

  it('holds a typing zoom on its own focus when there is no caret track at all', () => {
    const evaluator = createCompositionCameraEvaluator({ zooms: [typingZoom], telemetry: pointerFarRight, autoFollow });
    expect(evaluator.sample(4_000).focus).toEqual({ cx: 0.5, cy: 0.5 });
  });

  it('does not follow a caret recorded before the typing zoom began', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [{ ...typingZoom, startMs: 3_000 }],
      telemetry: pointerFarRight,
      caretTrack: [{ timeMs: 2_900, cx: 0.5, cy: 0.9 }],
      autoFollow,
    });
    expect(evaluator.sample(4_900).focus).toEqual({ cx: 0.5, cy: 0.5 });
  });

  it('reads the caret through the active screen source time mapping, like the pointer', () => {
    const mapTelemetryTime = vi.fn((timeMs: number) => timeMs + 10_000);
    const evaluator = createCompositionCameraEvaluator({
      zooms: [typingZoom],
      telemetry: pointerFarRight,
      caretTrack: [{ timeMs: 12_000, cx: 0.5, cy: 0.9 }],
      autoFollow,
      mapTelemetryTime,
    });
    expect(evaluator.sample(4_000).focus.cy).toBeGreaterThan(0.5);
    expect(mapTelemetryTime).toHaveBeenCalled();
  });

  it('lets a manual typing zoom stay exactly where it was put', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [{ ...typingZoom, mode: 'manual', focus: { cx: 0.6, cy: 0.4 } }],
      telemetry: pointerFarRight,
      caretTrack: [{ timeMs: 2_000, cx: 0.1, cy: 0.9 }],
      autoFollow,
    });
    const sample = evaluator.sample(4_000);
    expect(sample.focus.cx).toBeCloseTo(0.6, 6);
    expect(sample.focus.cy).toBeCloseTo(0.4, 6);
  });
});

describe('composition camera with the ported caret camera (TD22)', () => {
  const typingZoom: ZoomElement = { ...autoZoom, id: 'typing', trigger: 'typing' };

  it('centres a typing zoom on the text, where the safe zone camera left it off centre', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [typingZoom],
      telemetry: [],
      caretTrack: [{ timeMs: 2_000, cx: 0.5, cy: 0.62 }],
      autoFollow,
    });
    expect(evaluator.sample(4_000).focus.cy).toBeCloseTo(0.62, 6);
  });

  it('follows the text down the page by the least move, trailing it by the dead zone', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [typingZoom],
      telemetry: [],
      caretTrack: [
        { timeMs: 1_000, cx: 0.5, cy: 0.4 },
        { timeMs: 3_000, cx: 0.5, cy: 0.62 },
      ],
      autoFollow,
    });
    // Depth 2 is 1.5x, so the dead zone is half of a third of the frame.
    expect(evaluator.sample(4_800).focus.cy).toBeCloseTo(0.62 - 0.5 / 3, 2);
  });

  it('leaves a click zoom on the safe zone camera, following the pointer', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [autoZoom],
      telemetry: [
        { timeMs: 0, cx: 0.58, cy: 0.42 },
        { timeMs: 5_000, cx: 0.58, cy: 0.42 },
      ],
      caretTrack: [{ timeMs: 2_000, cx: 0.5, cy: 0.62 }],
      autoFollow,
    });
    expect(evaluator.sample(2_500).focus).toEqual({ cx: 0.5, cy: 0.5 });
  });
});

describe('the caret camera on a sped up clip', () => {
  const typingZoom: ZoomElement = { ...autoZoom, id: 'typing', trigger: 'typing', endMs: 10_000 };
  const track = [
    { timeMs: 1_000, cx: 0.5, cy: 0.4 },
    { timeMs: 2_000, cx: 0.5, cy: 0.66 },
  ];
  const cyAt = (timelineMs: number, rate: number) =>
    createCompositionCameraEvaluator({
      zooms: [typingZoom],
      telemetry: [],
      caretTrack: track,
      autoFollow,
      mapTelemetryTime: (timeMs) => timeMs * rate,
    }).sample(timelineMs).focus.cy;

  // Recordly's speeds are per second of recording, so on a clip played at twice the rate the
  // caret camera's target moves twice as fast on the timeline. Beam's zoom spring, which carries the
  // view into that target, runs on the timeline, so the two clips do not match exactly. Recorded as
  // the behaviour, not a choice: a clip played faster shows the typing faster too.
  it('follows on the recording clock, so a clip at twice the rate has moved further by the same moment', () => {
    expect(cyAt(1_600, 2)).toBeGreaterThan(cyAt(1_600, 1) + 0.01);
  });
});
