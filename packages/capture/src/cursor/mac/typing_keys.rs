//! macOS virtual key codes polled for typing detection, and the category each belongs to.
//!
//! Names and values are Apple's `kVK_` constants from HIToolbox `Events.h` (macOS 11.3 SDK),
//! read on 25 September 2026. They are written out here because no crate this package depends
//! on exports them; the names are kept so each value can be checked against the header.

use crate::input::TypingKeyCategory::{
    self, Backspace, Digit, Enter, Escape, ForwardDelete, Function, Letter, Navigation,
    NumpadDigit, NumpadSymbol, Punctuation, Space, Tab,
};

const K_VK_ANSI_A: u16 = 0x00;
const K_VK_ANSI_S: u16 = 0x01;
const K_VK_ANSI_D: u16 = 0x02;
const K_VK_ANSI_F: u16 = 0x03;
const K_VK_ANSI_H: u16 = 0x04;
const K_VK_ANSI_G: u16 = 0x05;
const K_VK_ANSI_Z: u16 = 0x06;
const K_VK_ANSI_X: u16 = 0x07;
const K_VK_ANSI_C: u16 = 0x08;
const K_VK_ANSI_V: u16 = 0x09;
const K_VK_ISO_SECTION: u16 = 0x0A;
const K_VK_ANSI_B: u16 = 0x0B;
const K_VK_ANSI_Q: u16 = 0x0C;
const K_VK_ANSI_W: u16 = 0x0D;
const K_VK_ANSI_E: u16 = 0x0E;
const K_VK_ANSI_R: u16 = 0x0F;
const K_VK_ANSI_Y: u16 = 0x10;
const K_VK_ANSI_T: u16 = 0x11;
const K_VK_ANSI_1: u16 = 0x12;
const K_VK_ANSI_2: u16 = 0x13;
const K_VK_ANSI_3: u16 = 0x14;
const K_VK_ANSI_4: u16 = 0x15;
const K_VK_ANSI_6: u16 = 0x16;
const K_VK_ANSI_5: u16 = 0x17;
const K_VK_ANSI_EQUAL: u16 = 0x18;
const K_VK_ANSI_9: u16 = 0x19;
const K_VK_ANSI_7: u16 = 0x1A;
const K_VK_ANSI_MINUS: u16 = 0x1B;
const K_VK_ANSI_8: u16 = 0x1C;
const K_VK_ANSI_0: u16 = 0x1D;
const K_VK_ANSI_RIGHT_BRACKET: u16 = 0x1E;
const K_VK_ANSI_O: u16 = 0x1F;
const K_VK_ANSI_U: u16 = 0x20;
const K_VK_ANSI_LEFT_BRACKET: u16 = 0x21;
const K_VK_ANSI_I: u16 = 0x22;
const K_VK_ANSI_P: u16 = 0x23;
const K_VK_RETURN: u16 = 0x24;
const K_VK_ANSI_L: u16 = 0x25;
const K_VK_ANSI_J: u16 = 0x26;
const K_VK_ANSI_QUOTE: u16 = 0x27;
const K_VK_ANSI_K: u16 = 0x28;
const K_VK_ANSI_SEMICOLON: u16 = 0x29;
const K_VK_ANSI_BACKSLASH: u16 = 0x2A;
const K_VK_ANSI_COMMA: u16 = 0x2B;
const K_VK_ANSI_SLASH: u16 = 0x2C;
const K_VK_ANSI_N: u16 = 0x2D;
const K_VK_ANSI_M: u16 = 0x2E;
const K_VK_ANSI_PERIOD: u16 = 0x2F;
const K_VK_TAB: u16 = 0x30;
const K_VK_SPACE: u16 = 0x31;
const K_VK_ANSI_GRAVE: u16 = 0x32;
const K_VK_DELETE: u16 = 0x33;
const K_VK_ESCAPE: u16 = 0x35;
const K_VK_ANSI_KEYPAD_DECIMAL: u16 = 0x41;
const K_VK_ANSI_KEYPAD_MULTIPLY: u16 = 0x43;
const K_VK_ANSI_KEYPAD_PLUS: u16 = 0x45;
const K_VK_ANSI_KEYPAD_DIVIDE: u16 = 0x4B;
const K_VK_ANSI_KEYPAD_ENTER: u16 = 0x4C;
const K_VK_ANSI_KEYPAD_MINUS: u16 = 0x4E;
const K_VK_ANSI_KEYPAD_EQUALS: u16 = 0x51;
const K_VK_ANSI_KEYPAD_0: u16 = 0x52;
const K_VK_ANSI_KEYPAD_1: u16 = 0x53;
const K_VK_ANSI_KEYPAD_2: u16 = 0x54;
const K_VK_ANSI_KEYPAD_3: u16 = 0x55;
const K_VK_ANSI_KEYPAD_4: u16 = 0x56;
const K_VK_ANSI_KEYPAD_5: u16 = 0x57;
const K_VK_ANSI_KEYPAD_6: u16 = 0x58;
const K_VK_ANSI_KEYPAD_7: u16 = 0x59;
const K_VK_ANSI_KEYPAD_8: u16 = 0x5B;
const K_VK_ANSI_KEYPAD_9: u16 = 0x5C;
const K_VK_JIS_YEN: u16 = 0x5D;
const K_VK_JIS_UNDERSCORE: u16 = 0x5E;
const K_VK_JIS_KEYPAD_COMMA: u16 = 0x5F;
const K_VK_F5: u16 = 0x60;
const K_VK_F6: u16 = 0x61;
const K_VK_F7: u16 = 0x62;
const K_VK_F3: u16 = 0x63;
const K_VK_F8: u16 = 0x64;
const K_VK_F9: u16 = 0x65;
const K_VK_F11: u16 = 0x67;
const K_VK_F10: u16 = 0x6D;
const K_VK_F12: u16 = 0x6F;
/// The key in the Insert position on an Apple extended keyboard; Beam's shortcut table already
/// treats it as Insert.
const K_VK_HELP: u16 = 0x72;
const K_VK_HOME: u16 = 0x73;
const K_VK_PAGE_UP: u16 = 0x74;
const K_VK_FORWARD_DELETE: u16 = 0x75;
const K_VK_F4: u16 = 0x76;
const K_VK_END: u16 = 0x77;
const K_VK_F2: u16 = 0x78;
const K_VK_PAGE_DOWN: u16 = 0x79;
const K_VK_F1: u16 = 0x7A;
const K_VK_LEFT_ARROW: u16 = 0x7B;
const K_VK_RIGHT_ARROW: u16 = 0x7C;
const K_VK_DOWN_ARROW: u16 = 0x7D;
const K_VK_UP_ARROW: u16 = 0x7E;

/// `kVK_Delete` is the key labelled delete that erases backwards, so it is Backspace here;
/// `kVK_ForwardDelete` is the one that erases forwards.
pub(crate) const MAC_TYPING_KEYS: &[(u16, TypingKeyCategory)] = &[
    (K_VK_ANSI_A, Letter),
    (K_VK_ANSI_B, Letter),
    (K_VK_ANSI_C, Letter),
    (K_VK_ANSI_D, Letter),
    (K_VK_ANSI_E, Letter),
    (K_VK_ANSI_F, Letter),
    (K_VK_ANSI_G, Letter),
    (K_VK_ANSI_H, Letter),
    (K_VK_ANSI_I, Letter),
    (K_VK_ANSI_J, Letter),
    (K_VK_ANSI_K, Letter),
    (K_VK_ANSI_L, Letter),
    (K_VK_ANSI_M, Letter),
    (K_VK_ANSI_N, Letter),
    (K_VK_ANSI_O, Letter),
    (K_VK_ANSI_P, Letter),
    (K_VK_ANSI_Q, Letter),
    (K_VK_ANSI_R, Letter),
    (K_VK_ANSI_S, Letter),
    (K_VK_ANSI_T, Letter),
    (K_VK_ANSI_U, Letter),
    (K_VK_ANSI_V, Letter),
    (K_VK_ANSI_W, Letter),
    (K_VK_ANSI_X, Letter),
    (K_VK_ANSI_Y, Letter),
    (K_VK_ANSI_Z, Letter),
    (K_VK_ANSI_0, Digit),
    (K_VK_ANSI_1, Digit),
    (K_VK_ANSI_2, Digit),
    (K_VK_ANSI_3, Digit),
    (K_VK_ANSI_4, Digit),
    (K_VK_ANSI_5, Digit),
    (K_VK_ANSI_6, Digit),
    (K_VK_ANSI_7, Digit),
    (K_VK_ANSI_8, Digit),
    (K_VK_ANSI_9, Digit),
    (K_VK_ANSI_EQUAL, Punctuation),
    (K_VK_ANSI_MINUS, Punctuation),
    (K_VK_ANSI_RIGHT_BRACKET, Punctuation),
    (K_VK_ANSI_LEFT_BRACKET, Punctuation),
    (K_VK_ANSI_QUOTE, Punctuation),
    (K_VK_ANSI_SEMICOLON, Punctuation),
    (K_VK_ANSI_BACKSLASH, Punctuation),
    (K_VK_ANSI_COMMA, Punctuation),
    (K_VK_ANSI_SLASH, Punctuation),
    (K_VK_ANSI_PERIOD, Punctuation),
    (K_VK_ANSI_GRAVE, Punctuation),
    (K_VK_ISO_SECTION, Punctuation),
    (K_VK_JIS_YEN, Punctuation),
    (K_VK_JIS_UNDERSCORE, Punctuation),
    (K_VK_SPACE, Space),
    (K_VK_RETURN, Enter),
    (K_VK_ANSI_KEYPAD_ENTER, Enter),
    (K_VK_DELETE, Backspace),
    (K_VK_FORWARD_DELETE, ForwardDelete),
    (K_VK_ANSI_KEYPAD_0, NumpadDigit),
    (K_VK_ANSI_KEYPAD_1, NumpadDigit),
    (K_VK_ANSI_KEYPAD_2, NumpadDigit),
    (K_VK_ANSI_KEYPAD_3, NumpadDigit),
    (K_VK_ANSI_KEYPAD_4, NumpadDigit),
    (K_VK_ANSI_KEYPAD_5, NumpadDigit),
    (K_VK_ANSI_KEYPAD_6, NumpadDigit),
    (K_VK_ANSI_KEYPAD_7, NumpadDigit),
    (K_VK_ANSI_KEYPAD_8, NumpadDigit),
    (K_VK_ANSI_KEYPAD_9, NumpadDigit),
    (K_VK_ANSI_KEYPAD_DECIMAL, NumpadSymbol),
    (K_VK_ANSI_KEYPAD_MULTIPLY, NumpadSymbol),
    (K_VK_ANSI_KEYPAD_PLUS, NumpadSymbol),
    (K_VK_ANSI_KEYPAD_DIVIDE, NumpadSymbol),
    (K_VK_ANSI_KEYPAD_MINUS, NumpadSymbol),
    (K_VK_ANSI_KEYPAD_EQUALS, NumpadSymbol),
    (K_VK_JIS_KEYPAD_COMMA, NumpadSymbol),
    (K_VK_TAB, Tab),
    (K_VK_ESCAPE, Escape),
    (K_VK_UP_ARROW, Navigation),
    (K_VK_DOWN_ARROW, Navigation),
    (K_VK_LEFT_ARROW, Navigation),
    (K_VK_RIGHT_ARROW, Navigation),
    (K_VK_HOME, Navigation),
    (K_VK_END, Navigation),
    (K_VK_PAGE_UP, Navigation),
    (K_VK_PAGE_DOWN, Navigation),
    (K_VK_HELP, Navigation),
    (K_VK_F1, Function),
    (K_VK_F2, Function),
    (K_VK_F3, Function),
    (K_VK_F4, Function),
    (K_VK_F5, Function),
    (K_VK_F6, Function),
    (K_VK_F7, Function),
    (K_VK_F8, Function),
    (K_VK_F9, Function),
    (K_VK_F10, Function),
    (K_VK_F11, Function),
    (K_VK_F12, Function),
];

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn every_key_code_appears_once() {
        let distinct: HashSet<u16> = MAC_TYPING_KEYS
            .iter()
            .map(|(native_key_code, _)| *native_key_code)
            .collect();
        assert_eq!(distinct.len(), MAC_TYPING_KEYS.len());
    }

    #[test]
    fn every_category_has_at_least_one_key() {
        let present: HashSet<TypingKeyCategory> = MAC_TYPING_KEYS
            .iter()
            .map(|(_, category)| *category)
            .collect();
        for category in TypingKeyCategory::ALL {
            assert!(present.contains(&category), "{category:?}");
        }
    }

    #[test]
    fn the_backwards_delete_key_is_backspace() {
        assert!(MAC_TYPING_KEYS.contains(&(K_VK_DELETE, Backspace)));
        assert!(MAC_TYPING_KEYS.contains(&(K_VK_FORWARD_DELETE, ForwardDelete)));
    }
}
