//! Windows virtual keys polled for typing detection, and the category each belongs to. Taken
//! from the `windows` crate 0.62.2 constants so no key code is written by hand.

use windows::Win32::UI::Input::KeyboardAndMouse::{
    VIRTUAL_KEY, VK_0, VK_1, VK_2, VK_3, VK_4, VK_5, VK_6, VK_7, VK_8, VK_9, VK_A, VK_ADD, VK_B,
    VK_BACK, VK_C, VK_D, VK_DECIMAL, VK_DELETE, VK_DIVIDE, VK_DOWN, VK_E, VK_END, VK_ESCAPE, VK_F,
    VK_F1, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8, VK_F9, VK_F10, VK_F11, VK_F12, VK_G,
    VK_H, VK_HOME, VK_I, VK_INSERT, VK_J, VK_K, VK_L, VK_LEFT, VK_M, VK_MULTIPLY, VK_N, VK_NEXT,
    VK_NUMPAD0, VK_NUMPAD1, VK_NUMPAD2, VK_NUMPAD3, VK_NUMPAD4, VK_NUMPAD5, VK_NUMPAD6, VK_NUMPAD7,
    VK_NUMPAD8, VK_NUMPAD9, VK_O, VK_OEM_1, VK_OEM_2, VK_OEM_3, VK_OEM_4, VK_OEM_5, VK_OEM_6,
    VK_OEM_7, VK_OEM_8, VK_OEM_102, VK_OEM_COMMA, VK_OEM_MINUS, VK_OEM_PERIOD, VK_OEM_PLUS, VK_P,
    VK_PRIOR, VK_Q, VK_R, VK_RETURN, VK_RIGHT, VK_S, VK_SEPARATOR, VK_SPACE, VK_SUBTRACT, VK_T,
    VK_TAB, VK_U, VK_UP, VK_V, VK_W, VK_X, VK_Y, VK_Z,
};

use crate::input::TypingKeyCategory::{
    self, Backspace, Digit, Enter, Escape, ForwardDelete, Function, Letter, Navigation,
    NumpadDigit, NumpadSymbol, Punctuation, Space, Tab,
};

const fn entry(key: VIRTUAL_KEY, category: TypingKeyCategory) -> (u16, TypingKeyCategory) {
    (key.0, category)
}

/// `VK_RETURN` covers both Enter keys: Windows gives the keypad Enter no virtual key of its own.
pub(crate) const WINDOWS_TYPING_KEYS: &[(u16, TypingKeyCategory)] = &[
    entry(VK_A, Letter),
    entry(VK_B, Letter),
    entry(VK_C, Letter),
    entry(VK_D, Letter),
    entry(VK_E, Letter),
    entry(VK_F, Letter),
    entry(VK_G, Letter),
    entry(VK_H, Letter),
    entry(VK_I, Letter),
    entry(VK_J, Letter),
    entry(VK_K, Letter),
    entry(VK_L, Letter),
    entry(VK_M, Letter),
    entry(VK_N, Letter),
    entry(VK_O, Letter),
    entry(VK_P, Letter),
    entry(VK_Q, Letter),
    entry(VK_R, Letter),
    entry(VK_S, Letter),
    entry(VK_T, Letter),
    entry(VK_U, Letter),
    entry(VK_V, Letter),
    entry(VK_W, Letter),
    entry(VK_X, Letter),
    entry(VK_Y, Letter),
    entry(VK_Z, Letter),
    entry(VK_0, Digit),
    entry(VK_1, Digit),
    entry(VK_2, Digit),
    entry(VK_3, Digit),
    entry(VK_4, Digit),
    entry(VK_5, Digit),
    entry(VK_6, Digit),
    entry(VK_7, Digit),
    entry(VK_8, Digit),
    entry(VK_9, Digit),
    entry(VK_OEM_1, Punctuation),
    entry(VK_OEM_2, Punctuation),
    entry(VK_OEM_3, Punctuation),
    entry(VK_OEM_4, Punctuation),
    entry(VK_OEM_5, Punctuation),
    entry(VK_OEM_6, Punctuation),
    entry(VK_OEM_7, Punctuation),
    entry(VK_OEM_8, Punctuation),
    entry(VK_OEM_102, Punctuation),
    entry(VK_OEM_COMMA, Punctuation),
    entry(VK_OEM_MINUS, Punctuation),
    entry(VK_OEM_PERIOD, Punctuation),
    entry(VK_OEM_PLUS, Punctuation),
    entry(VK_SPACE, Space),
    entry(VK_RETURN, Enter),
    entry(VK_BACK, Backspace),
    entry(VK_DELETE, ForwardDelete),
    entry(VK_NUMPAD0, NumpadDigit),
    entry(VK_NUMPAD1, NumpadDigit),
    entry(VK_NUMPAD2, NumpadDigit),
    entry(VK_NUMPAD3, NumpadDigit),
    entry(VK_NUMPAD4, NumpadDigit),
    entry(VK_NUMPAD5, NumpadDigit),
    entry(VK_NUMPAD6, NumpadDigit),
    entry(VK_NUMPAD7, NumpadDigit),
    entry(VK_NUMPAD8, NumpadDigit),
    entry(VK_NUMPAD9, NumpadDigit),
    entry(VK_MULTIPLY, NumpadSymbol),
    entry(VK_ADD, NumpadSymbol),
    entry(VK_SEPARATOR, NumpadSymbol),
    entry(VK_SUBTRACT, NumpadSymbol),
    entry(VK_DECIMAL, NumpadSymbol),
    entry(VK_DIVIDE, NumpadSymbol),
    entry(VK_TAB, Tab),
    entry(VK_ESCAPE, Escape),
    entry(VK_UP, Navigation),
    entry(VK_DOWN, Navigation),
    entry(VK_LEFT, Navigation),
    entry(VK_RIGHT, Navigation),
    entry(VK_HOME, Navigation),
    entry(VK_END, Navigation),
    entry(VK_PRIOR, Navigation),
    entry(VK_NEXT, Navigation),
    entry(VK_INSERT, Navigation),
    entry(VK_F1, Function),
    entry(VK_F2, Function),
    entry(VK_F3, Function),
    entry(VK_F4, Function),
    entry(VK_F5, Function),
    entry(VK_F6, Function),
    entry(VK_F7, Function),
    entry(VK_F8, Function),
    entry(VK_F9, Function),
    entry(VK_F10, Function),
    entry(VK_F11, Function),
    entry(VK_F12, Function),
];

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    fn category_of(key: VIRTUAL_KEY) -> Option<TypingKeyCategory> {
        WINDOWS_TYPING_KEYS
            .iter()
            .find(|(native_key_code, _)| *native_key_code == key.0)
            .map(|(_, category)| *category)
    }

    #[test]
    fn every_virtual_key_appears_once() {
        let distinct: HashSet<u16> = WINDOWS_TYPING_KEYS
            .iter()
            .map(|(native_key_code, _)| *native_key_code)
            .collect();
        assert_eq!(distinct.len(), WINDOWS_TYPING_KEYS.len());
    }

    #[test]
    fn every_category_has_at_least_one_key() {
        let present: HashSet<TypingKeyCategory> = WINDOWS_TYPING_KEYS
            .iter()
            .map(|(_, category)| *category)
            .collect();
        for category in TypingKeyCategory::ALL {
            assert!(present.contains(&category), "{category:?}");
        }
    }

    #[test]
    fn punctuation_and_the_number_pad_count_as_typing() {
        for key in [VK_OEM_1, VK_OEM_COMMA, VK_OEM_102, VK_NUMPAD5, VK_DECIMAL] {
            assert!(
                category_of(key).is_some_and(TypingKeyCategory::produces_character),
                "{}",
                key.0
            );
        }
    }

    #[test]
    fn modifiers_are_not_polled_as_typing_keys() {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
        };
        for key in [VK_CONTROL, VK_SHIFT, VK_MENU, VK_LWIN, VK_RWIN] {
            assert_eq!(category_of(key), None, "{}", key.0);
        }
    }
}
