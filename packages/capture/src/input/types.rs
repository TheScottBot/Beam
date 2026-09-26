use serde::{Deserialize, Serialize};

/// Version 2 added typing detection: `keystroke`, `keystroke-limit-reached`, `caret`,
/// `caret-limit-reached` and `caret-automation-unavailable` events. Readers still accept
/// version 1, which holds none of them.
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

/// Not `Eq`: a caret position is a fraction of the captured area.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    /// Where the text caret was while someone typed, as a fraction of the captured area, so a
    /// typing zoom can follow text that moves. A position only: never the text around it, the
    /// field, or the window it belongs to.
    Caret {
        session_ns: u64,
        normalized_x: f64,
        normalized_y: f64,
    },
    /// Written once, when a session reaches the contract's caret cap, so a typing zoom that stops
    /// following the text late in a long recording can be explained.
    CaretLimitReached { session_ns: u64 },
    /// Written once, when the caret reader could not start fully. If the platform's accessibility
    /// interface failed, the caret is read only where the older caret interface answers, so
    /// fewer applications report one; if screen coordinates could not be made physical, no caret
    /// is recorded at all rather than one in the wrong place. Either way, this says why the track
    /// is thin or missing rather than leaving the gap unexplained.
    CaretAutomationUnavailable { session_ns: u64 },
}

impl InputEvent {
    #[must_use]
    pub fn session_ns(&self) -> u64 {
        match self {
            Self::MouseButton { session_ns, .. }
            | Self::Shortcut { session_ns, .. }
            | Self::Keystroke { session_ns, .. }
            | Self::KeystrokeLimitReached { session_ns }
            | Self::Caret { session_ns, .. }
            | Self::CaretLimitReached { session_ns }
            | Self::CaretAutomationUnavailable { session_ns } => *session_ns,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
