const fs = require('fs');
// The Rust writer's build script reads the same file, so the engine and this reader cannot
// disagree about any bound. `package.json` packages it with the application.
const inputSidecarLimits = require('../../packages/capture/contracts/input-sidecar-limits.json');

const supportedVersions = new Set([1, 2]);

// Version 2 names every field an event may carry. Anything else is refused rather than dropped:
// a keystroke may say when and whether it typed a character, and a caret where it was, and a
// field that could say which key, what text or which window must never be accepted, however it
// got there.
const version2EventFields = {
  'mouse-button': ['event', 'sessionNs', 'button', 'pressed'],
  shortcut: ['event', 'sessionNs', 'pressed', 'modifiers', 'key'],
  keystroke: ['event', 'sessionNs', 'producesCharacter'],
  'keystroke-limit-reached': ['event', 'sessionNs'],
  caret: ['event', 'sessionNs', 'normalizedX', 'normalizedY'],
  'caret-limit-reached': ['event', 'sessionNs'],
  'caret-automation-unavailable': ['event', 'sessionNs'],
};

// Typing detection's events, each with the message its refusal carries.
const typingEventRefusals = {
  keystroke: 'Frappe input invalide',
  'keystroke-limit-reached': 'Frappe input invalide',
  caret: 'Caret input invalide',
  'caret-limit-reached': 'Caret input invalide',
  'caret-automation-unavailable': 'Caret input invalide',
};

// The engine writes each of these at most once; a second one means the file did not come from it.
const singleMarkers = new Set(['keystroke-limit-reached', 'caret-limit-reached', 'caret-automation-unavailable']);

const hasExactlyFields = (value, fields) =>
  Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));

const modifiers = new Set(['control', 'shift', 'alt', 'meta']);
const keys = new Set([
  ...'abcdefghijklmnopqrstuvwxyz',
  ...Array.from({ length: 10 }, (_, index) => `digit${index}`),
  'arrow-up',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'escape',
  'enter',
  'tab',
  'backspace',
  'delete',
  'insert',
  'home',
  'end',
  'page-up',
  'page-down',
  'space',
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
]);

const sessionTimestamp = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Timestamp input invalide');
  return value;
};

const normalizeInteractionEvent = (event) => {
  if (typeof event.pressed !== 'boolean') throw new Error('Événement input invalide');
  const sessionNs = sessionTimestamp(event.sessionNs);
  if (event.event === 'mouse-button') {
    if (!Number.isInteger(event.button) || event.button < 0 || event.button > 31)
      throw new Error('Bouton input invalide');
    return { event: 'mouse-button', sessionNs, button: event.button, pressed: event.pressed };
  }
  if (
    event.event !== 'shortcut' ||
    !Array.isArray(event.modifiers) ||
    event.modifiers.some((modifier) => !modifiers.has(modifier)) ||
    new Set(event.modifiers).size !== event.modifiers.length ||
    !keys.has(event.key)
  )
    throw new Error('Raccourci input invalide');
  return {
    event: 'shortcut',
    sessionNs,
    pressed: event.pressed,
    modifiers: [...event.modifiers],
    key: event.key,
  };
};

const isTypingEvent = (event) => Object.hasOwn(typingEventRefusals, event.event);

// The engine drops a caret outside the captured area rather than clamping it, so a position
// outside it here did not come from the engine.
const isCapturedAreaFraction = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const normalizeTypingEvent = (event, markersSeen) => {
  const refusal = typingEventRefusals[event.event];
  const sessionNs = sessionTimestamp(event.sessionNs);
  if (singleMarkers.has(event.event)) {
    if (markersSeen.has(event.event)) throw new Error(refusal);
    markersSeen.add(event.event);
    return { event: event.event, sessionNs };
  }
  if (event.event === 'caret') {
    if (!isCapturedAreaFraction(event.normalizedX) || !isCapturedAreaFraction(event.normalizedY))
      throw new Error(refusal);
    return { event: 'caret', sessionNs, normalizedX: event.normalizedX, normalizedY: event.normalizedY };
  }
  if (typeof event.producesCharacter !== 'boolean') throw new Error(refusal);
  return { event: 'keystroke', sessionNs, producesCharacter: event.producesCharacter };
};

const normalizeEvent = (event, version, markersSeen) => {
  if (!event || typeof event !== 'object') throw new Error('Événement input invalide');
  if (version >= 2) {
    const fields = version2EventFields[event.event];
    if (!fields) throw new Error('Événement input invalide');
    if (!hasExactlyFields(event, fields))
      throw new Error(isTypingEvent(event) ? typingEventRefusals[event.event] : 'Événement input invalide');
  }
  if (isTypingEvent(event)) {
    if (version < 2) throw new Error('Événement input invalide');
    return normalizeTypingEvent(event, markersSeen);
  }
  return normalizeInteractionEvent(event);
};

const normalizeInputSidecar = (value, limits = inputSidecarLimits) => {
  if (!value || typeof value !== 'object' || !supportedVersions.has(value.version) || !Array.isArray(value.events))
    throw new Error('Sidecar input invalide');
  if (value.version >= 2 && !hasExactlyFields(value, ['version', 'events'])) throw new Error('Sidecar input invalide');
  // Counted before any event is looked at, so an oversized file costs no per-event work.
  if (value.events.length > limits.maximumSidecarEvents)
    throw Object.assign(new Error('Sidecar input trop volumineux'), { code: 'too-many-events' });
  const markersSeen = new Set();
  return {
    version: value.version,
    events: value.events.map((event) => normalizeEvent(event, value.version, markersSeen)),
  };
};

const refused = (reason, byteLength) => ({ status: 'refused', reason, byteLength });

// The engine replaces `input.json` atomically, so the file cannot grow while it is read. One
// spare byte is still read past the size it reported, so a file that did change is refused
// rather than parsed from a partial read.
const readBoundedText = (filePath, maximumBytes) => {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const byteLength = fs.fstatSync(descriptor).size;
    if (byteLength > maximumBytes) return { outcome: refused('too-large', byteLength) };
    const buffer = Buffer.alloc(byteLength + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunkLength = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (chunkLength === 0) break;
      bytesRead += chunkLength;
    }
    if (bytesRead !== byteLength) return { outcome: refused('unreadable', byteLength) };
    return { text: buffer.toString('utf8', 0, byteLength), byteLength };
  } finally {
    fs.closeSync(descriptor);
  }
};

/**
 * Reads a session's input sidecar within the contract's bounds. A missing file is `absent`, not
 * a failure: a recording made without interaction capture has none. Every other failure is
 * `refused` with a reason category and the file's length, so a caller can report it without
 * logging any of its contents.
 */
const readInputSidecar = (filePath, limits = inputSidecarLimits) => {
  let bounded;
  try {
    bounded = readBoundedText(filePath, limits.maximumSidecarBytes);
  } catch (error) {
    return error?.code === 'ENOENT' ? { status: 'absent' } : refused('unreadable', 0);
  }
  if (bounded.outcome) return bounded.outcome;
  try {
    return { status: 'read', sidecar: normalizeInputSidecar(JSON.parse(bounded.text), limits) };
  } catch (error) {
    return refused(error?.code === 'too-many-events' ? 'too-many-events' : 'invalid', bounded.byteLength);
  }
};

const recordedPlatform = (value) => {
  if (value === 'windows' || value === 'macos' || value === 'linux') return value;
  return null;
};

const emptyInteractions = () => ({ version: 1, events: [] });

/**
 * A session's interactions for the editor. A refused sidecar loses its keyboard captions and
 * typing zooms, so it is reported once and its reason is passed on; the report carries the
 * reason and size only, because the file holds input timing that must not reach a log.
 */
const sessionInteractionsFrom = (filePath, sessionId, reportRefusal = console.warn) => {
  const result = readInputSidecar(filePath);
  if (result.status === 'read') return { interactions: result.sidecar };
  if (result.status === 'absent') return { interactions: emptyInteractions() };
  reportRefusal(
    `[Beam input] Input sidecar refused for session ${sessionId}: ${result.reason}, ${result.byteLength} bytes`,
  );
  return { interactions: emptyInteractions(), interactionsRefusedReason: result.reason };
};

module.exports = {
  inputSidecarLimits,
  normalizeInputSidecar,
  readInputSidecar,
  recordedPlatform,
  sessionInteractionsFrom,
};
