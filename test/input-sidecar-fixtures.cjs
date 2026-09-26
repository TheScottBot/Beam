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

const caretEvent = (sessionNs = 0, normalizedX = 0.25, normalizedY = 0.5) => ({
  event: 'caret',
  sessionNs,
  normalizedX,
  normalizedY,
});

const caretLimitReachedEvent = (sessionNs = 0) => ({ event: 'caret-limit-reached', sessionNs });

const caretAutomationUnavailableEvent = (sessionNs = 0) => ({ event: 'caret-automation-unavailable', sessionNs });

const sidecarVersion2 = (events) => ({ version: 2, events });

const smallLimits = {
  maximumSidecarBytes: 4096,
  maximumSidecarEvents: 3,
  maximumKeystrokeEvents: 2,
  maximumCaretEvents: 1,
};

module.exports = {
  caretAutomationUnavailableEvent,
  caretEvent,
  caretLimitReachedEvent,
  keystrokeEvent,
  keystrokeLimitReachedEvent,
  mouseButtonEvent,
  shortcutEvent,
  sidecarVersion2,
  smallLimits,
};
