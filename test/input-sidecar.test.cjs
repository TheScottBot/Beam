const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeInputSidecar, recordedPlatform } = require('../electron/projects/input-sidecar.cjs');

const sidecarWith = (event) => ({ version: 1, events: [event] });

test('normalizes a valid input sidecar without mutating it', () => {
  const input = {
    version: 1,
    events: [
      { event: 'mouse-button', sessionNs: 0, button: 1, pressed: true },
      {
        event: 'shortcut',
        sessionNs: 1_234_567,
        pressed: true,
        modifiers: ['control', 'shift'],
        key: 'digit0',
      },
      {
        event: 'shortcut',
        sessionNs: 2_000_000,
        pressed: false,
        modifiers: ['control', 'shift'],
        key: 'arrow-left',
      },
    ],
  };
  const before = structuredClone(input);

  const normalized = normalizeInputSidecar(input);

  assert.deepEqual(normalized, input);
  assert.deepEqual(input, before);
  assert.notStrictEqual(normalized.events, input.events);
  assert.notStrictEqual(normalized.events[1].modifiers, input.events[1].modifiers);
});

test('rejects absent sidecars and unsupported versions', () => {
  for (const value of [null, undefined, {}, { version: 3, events: [] }, { version: 1, events: null }]) {
    assert.throws(() => normalizeInputSidecar(value), /Sidecar input invalide/);
  }
});

test('rejects invalid timestamps and event envelopes', () => {
  for (const sessionNs of [-1, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, 1.5]) {
    assert.throws(
      () =>
        normalizeInputSidecar(
          sidecarWith({
            event: 'shortcut',
            sessionNs,
            pressed: true,
            modifiers: [],
            key: 'a',
          }),
        ),
      /Timestamp input invalide/,
    );
  }

  for (const event of [
    null,
    { event: 'shortcut', sessionNs: 0, modifiers: [], key: 'a' },
    { event: 'unknown', sessionNs: 0, pressed: true, modifiers: [], key: 'a' },
  ]) {
    assert.throws(() => normalizeInputSidecar(sidecarWith(event)), /Événement input invalide|Raccourci input invalide/);
  }
});

test('rejects invalid modifiers, keys, and mouse buttons', () => {
  for (const event of [
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: ['command'], key: 'a' },
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: ['control', 'control'], key: 'a' },
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: 'control', key: 'a' },
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: [], key: 'unknown' },
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: [], key: 'A' },
    { event: 'mouse-button', sessionNs: 0, button: -1, pressed: true },
    { event: 'mouse-button', sessionNs: 0, button: 32, pressed: true },
  ]) {
    assert.throws(() => normalizeInputSidecar(sidecarWith(event)), /Raccourci input invalide|Bouton input invalide/);
  }
});

test('normalizes recorded platforms and rejects unknown values', () => {
  assert.equal(recordedPlatform('windows'), 'windows');
  assert.equal(recordedPlatform('macos'), 'macos');
  assert.equal(recordedPlatform('linux'), 'linux');
  assert.equal(recordedPlatform('freebsd'), null);
  assert.equal(recordedPlatform(undefined), null);
});

const {
  caretAutomationUnavailableEvent,
  caretEvent,
  caretLimitReachedEvent,
  keystrokeEvent,
  keystrokeLimitReachedEvent,
  mouseButtonEvent,
  shortcutEvent,
  sidecarVersion2,
  smallLimits,
} = require('./input-sidecar-fixtures.cjs');

test('reads a version 2 sidecar holding keystrokes and the limit marker', () => {
  const input = sidecarVersion2([
    mouseButtonEvent(0),
    shortcutEvent(1),
    keystrokeEvent(2, true),
    keystrokeEvent(3, false),
    keystrokeLimitReachedEvent(4),
  ]);
  const before = structuredClone(input);

  const normalized = normalizeInputSidecar(input);

  assert.deepEqual(normalized, input);
  assert.deepEqual(input, before);
  assert.notStrictEqual(normalized.events[2], input.events[2]);
});

test('still reads a version 1 sidecar and returns it as version 1', () => {
  const normalized = normalizeInputSidecar({ version: 1, events: [shortcutEvent(5)] });
  assert.equal(normalized.version, 1);
  assert.deepEqual(normalized.events, [shortcutEvent(5)]);
});

test('refuses keystrokes in a version 1 sidecar, which predates them', () => {
  for (const event of [keystrokeEvent(0), keystrokeLimitReachedEvent(0)]) {
    assert.throws(() => normalizeInputSidecar({ version: 1, events: [event] }), /Événement input invalide/);
  }
});

test('refuses a keystroke that carries anything identifying the key', () => {
  for (const extra of [{ key: 'a' }, { code: 65 }, { modifiers: [] }, { text: 'a' }]) {
    assert.throws(
      () => normalizeInputSidecar(sidecarVersion2([{ ...keystrokeEvent(0), ...extra }])),
      /Frappe input invalide/,
      JSON.stringify(extra),
    );
  }
});

test('refuses a keystroke whose character flag is missing or not a boolean', () => {
  for (const producesCharacter of [undefined, null, 1, 'true']) {
    assert.throws(
      () => normalizeInputSidecar(sidecarVersion2([{ event: 'keystroke', sessionNs: 0, producesCharacter }])),
      /Frappe input invalide/,
    );
  }
});

test('refuses unknown fields anywhere in a version 2 sidecar', () => {
  // The same events without the extra field are valid, so each refusal below is the field's doing.
  assert.equal(
    normalizeInputSidecar(sidecarVersion2([mouseButtonEvent(0), shortcutEvent(0), keystrokeLimitReachedEvent(0)]))
      .events.length,
    3,
  );
  assert.throws(() => normalizeInputSidecar({ ...sidecarVersion2([]), note: 'unexpected' }), /Sidecar input invalide/);
  for (const event of [
    { ...mouseButtonEvent(0), label: 'left' },
    { ...shortcutEvent(0), text: 's' },
    { ...keystrokeLimitReachedEvent(0), count: 1 },
  ]) {
    assert.throws(() => normalizeInputSidecar(sidecarVersion2([event])), /input invalide/, JSON.stringify(event));
  }
});

test('refuses a second keystroke limit marker', () => {
  assert.throws(
    () => normalizeInputSidecar(sidecarVersion2([keystrokeLimitReachedEvent(1), keystrokeLimitReachedEvent(2)])),
    /Frappe input invalide/,
  );
});

test('accepts exactly the event limit and refuses one more, before reading any event', () => {
  const atLimit = sidecarVersion2([keystrokeEvent(0), keystrokeEvent(1), keystrokeEvent(2)]);
  assert.equal(normalizeInputSidecar(atLimit, smallLimits).events.length, 3);

  // Empty placeholders, none of them a valid event: the refusal can only come from counting them.
  const overLimit = sidecarVersion2(Array.from({ length: smallLimits.maximumSidecarEvents + 1 }));
  assert.throws(
    () => normalizeInputSidecar(overLimit, smallLimits),
    (error) => error.code === 'too-many-events',
  );
});

test('reads caret positions and the caret markers in a version 2 sidecar', () => {
  const input = sidecarVersion2([
    caretEvent(1, 0, 0),
    caretEvent(2, 0.999, 1),
    caretLimitReachedEvent(3),
    caretAutomationUnavailableEvent(0),
  ]);
  assert.deepEqual(normalizeInputSidecar(input), input);
});

test('refuses caret events in a version 1 sidecar, which predates them', () => {
  for (const event of [caretEvent(0), caretLimitReachedEvent(0), caretAutomationUnavailableEvent(0)]) {
    assert.throws(() => normalizeInputSidecar({ version: 1, events: [event] }), /Événement input invalide/);
  }
});

test('refuses a caret position outside the captured area or not a number', () => {
  for (const [normalizedX, normalizedY] of [
    [-0.01, 0.5],
    [0.5, 1.01],
    [Number.NaN, 0.5],
    [0.5, Infinity],
    ['0.5', 0.5],
    [0.5, null],
  ]) {
    assert.throws(
      () => normalizeInputSidecar(sidecarVersion2([caretEvent(0, normalizedX, normalizedY)])),
      /Caret input invalide/,
      `${normalizedX}, ${normalizedY}`,
    );
  }
});

test('refuses a caret event that carries anything beyond its time and position', () => {
  for (const extra of [{ text: 'a' }, { windowTitle: 'Notes' }, { fieldName: 'password' }]) {
    assert.throws(
      () => normalizeInputSidecar(sidecarVersion2([{ ...caretEvent(0), ...extra }])),
      /Caret input invalide/,
      JSON.stringify(extra),
    );
  }
});

test('refuses a second caret limit marker or a second automation marker', () => {
  for (const marker of [caretLimitReachedEvent, caretAutomationUnavailableEvent]) {
    assert.throws(
      () => normalizeInputSidecar(sidecarVersion2([marker(1), marker(2)])),
      /Caret input invalide/,
      marker(0).event,
    );
  }
});
