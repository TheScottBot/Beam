use serde::{Deserialize, Serialize};

/// Version 2 added `keystroke` and `keystroke-limit-reached` events for typing detection.
/// Readers still accept version 1, which holds neither.
pub const INPUT_SIDECAR_VERSION: u8 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InputModifier {
    Control,
    Shift,
    Alt,
    Meta,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InputKey {
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
    L,
    M,
    N,
    O,
    P,
    Q,
    R,
    S,
    T,
    U,
    V,
    W,
    X,
    Y,
    Z,
    Digit0,
    Digit1,
    Digit2,
    Digit3,
    Digit4,
    Digit5,
    Digit6,
    Digit7,
    Digit8,
    Digit9,
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    Escape,
    Enter,
    Tab,
    Backspace,
    Delete,
    Insert,
    Home,
    End,
    PageUp,
    PageDown,
    Space,
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "event",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum InputEvent {
    MouseButton {
        session_ns: u64,
        button: u8,
        pressed: bool,
    },
    Shortcut {
        session_ns: u64,
        pressed: bool,
        modifiers: Vec<InputModifier>,
        key: InputKey,
    },
    /// A key press recorded for typing detection. It deliberately carries no key identity: the
    /// time and whether the key would have produced a character are all the editor needs to
    /// find typing, and anything more could help reconstruct what was typed.
    Keystroke {
        session_ns: u64,
        produces_character: bool,
    },
    /// Written once, when a session reaches the contract's keystroke cap, so a typing zoom that
    /// stops appearing late in a long recording can be explained rather than looking broken.
    KeystrokeLimitReached { session_ns: u64 },
}

impl InputEvent {
    #[must_use]
    pub fn session_ns(&self) -> u64 {
        match self {
            Self::MouseButton { session_ns, .. }
            | Self::Shortcut { session_ns, .. }
            | Self::Keystroke { session_ns, .. }
            | Self::KeystrokeLimitReached { session_ns } => *session_ns,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputEventSidecar {
    pub version: u8,
    pub events: Vec<InputEvent>,
}

impl InputEventSidecar {
    #[must_use]
    pub fn new(events: Vec<InputEvent>) -> Self {
        Self {
            version: INPUT_SIDECAR_VERSION,
            events,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "event",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum NativeInputEvent {
    MouseMotion {
        monotonic_ns: u64,
        delta_x: i32,
        delta_y: i32,
    },
    MouseButton {
        monotonic_ns: u64,
        button: u8,
        pressed: bool,
    },
    Shortcut {
        monotonic_ns: u64,
        pressed: bool,
        modifiers: Vec<InputModifier>,
        key: InputKey,
    },
}

impl NativeInputEvent {
    #[must_use]
    pub fn monotonic_ns(&self) -> u64 {
        match self {
            Self::MouseMotion { monotonic_ns, .. }
            | Self::MouseButton { monotonic_ns, .. }
            | Self::Shortcut { monotonic_ns, .. } => *monotonic_ns,
        }
    }
}
