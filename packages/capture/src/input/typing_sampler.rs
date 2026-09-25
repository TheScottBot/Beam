//! Typing detection: turns polled key state into keystroke timings.
//!
//! Each platform supplies a table from its native key codes to a [`TypingKeyCategory`]. The
//! category is the only thing about a key that survives sampling, and only as the one boolean
//! [`TypingKeyCategory::produces_character`]; the native code never leaves this module. Keeping
//! the rule here, apart from any platform, lets the Linux input helper share it later.

use std::collections::HashSet;

use crate::input::{InputEvent, InputModifier, MAXIMUM_KEYSTROKE_EVENTS};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum TypingKeyCategory {
    Letter,
    Digit,
    Punctuation,
    Space,
    Enter,
    Backspace,
    ForwardDelete,
    NumpadDigit,
    NumpadSymbol,
    Tab,
    Escape,
    Navigation,
    Function,
}

impl TypingKeyCategory {
    pub const ALL: [Self; 13] = [
        Self::Letter,
        Self::Digit,
        Self::Punctuation,
        Self::Space,
        Self::Enter,
        Self::Backspace,
        Self::ForwardDelete,
        Self::NumpadDigit,
        Self::NumpadSymbol,
        Self::Tab,
        Self::Escape,
        Self::Navigation,
        Self::Function,
    ];

    /// Keys that change the text in a field. Tab moves focus, Escape dismisses, and navigation
    /// and function keys move the caret or run commands; a burst of those is not typing.
    #[must_use]
    pub const fn produces_character(self) -> bool {
        !matches!(
            self,
            Self::Tab | Self::Escape | Self::Navigation | Self::Function
        )
    }
}

#[derive(Debug)]
pub struct TypingSampler {
    previously_pressed: HashSet<u16>,
    keystrokes_recorded: u64,
    maximum_keystroke_events: u64,
    limit_reached: bool,
}

impl Default for TypingSampler {
    fn default() -> Self {
        Self::with_maximum_keystroke_events(MAXIMUM_KEYSTROKE_EVENTS)
    }
}

impl TypingSampler {
    #[must_use]
    pub fn with_maximum_keystroke_events(maximum_keystroke_events: u64) -> Self {
        Self {
            previously_pressed: HashSet::new(),
            keystrokes_recorded: 0,
            maximum_keystroke_events,
            limit_reached: false,
        }
    }

    #[must_use]
    pub fn maximum_keystroke_events(&self) -> u64 {
        self.maximum_keystroke_events
    }

    /// Records one keystroke per key that went down since the previous sample. A held key is
    /// not repeated, so operating system auto repeat never counts as typing.
    pub fn sample(
        &mut self,
        session_ns: u64,
        typing_keys: &[(u16, TypingKeyCategory)],
        modifier_pressed: impl Fn(InputModifier) -> bool,
        key_pressed: impl Fn(u16) -> bool,
    ) -> Vec<InputEvent> {
        // Control, Alt or Meta turn a letter into a command, so it types nothing. Shift does not.
        let command_modifier_held = [
            InputModifier::Control,
            InputModifier::Alt,
            InputModifier::Meta,
        ]
        .into_iter()
        .any(&modifier_pressed);
        let mut events = Vec::new();
        for &(native_key_code, category) in typing_keys {
            let pressed = key_pressed(native_key_code);
            let went_down = pressed && self.previously_pressed.insert(native_key_code);
            if !pressed {
                self.previously_pressed.remove(&native_key_code);
            }
            if !went_down {
                continue;
            }
            if self.keystrokes_recorded >= self.maximum_keystroke_events {
                if !self.limit_reached {
                    self.limit_reached = true;
                    events.push(InputEvent::KeystrokeLimitReached { session_ns });
                }
                continue;
            }
            self.keystrokes_recorded += 1;
            events.push(InputEvent::Keystroke {
                session_ns,
                produces_character: category.produces_character() && !command_modifier_held,
            });
        }
        events
    }
}
