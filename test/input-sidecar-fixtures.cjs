// Shared builders for input sidecar tests, so every suite describes events the same way the Rust
// engine writes them (`packages/capture/src/input/types.rs`).

const mouseButtonEvent = (sessionNs = 0) => ({ event: 'mouse-button', sessionNs, button: 1, pressed: true });

const shortcutEvent = (sessionNs = 0) => ({
  event: 'shortcut',
  sessionNs,
  pressed: true,
  modifiers: ['control'],
  key: 's',
});

const keystrokeEvent = (sessionNs = 0, producesCharacter = true) => ({
  event: 'keystroke',
  sessionNs,
  producesCharacter,
});

const keystrokeLimitReachedEvent = (sessionNs = 0) => ({ event: 'keystroke-limit-reached', sessionNs });

const sidecarVersion2 = (events) => ({ version: 2, events });

const smallLimits = { maximumSidecarBytes: 4096, maximumSidecarEvents: 3, maximumKeystrokeEvents: 2 };

module.exports = {
  keystrokeEvent,
  keystrokeLimitReachedEvent,
  mouseButtonEvent,
  shortcutEvent,
  sidecarVersion2,
  smallLimits,
};
