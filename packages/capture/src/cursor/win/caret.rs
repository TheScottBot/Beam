//! Reads where the text caret is on Windows, as a screen point. Never the text around it: only
//! the caret's rectangle is asked for.
//!
//! Two sources, in order. UI Automation's text pattern on the focused element answers in most
//! modern applications and is the only one that follows a page as it scrolls. The classic caret
//! from `GetGUIThreadInfo` answers in classic Win32 editors and costs almost nothing. Recordly's
//! probe of 23 September 2026 found the two agree where both answer; that has not been rerun for
//! Beam.

use std::mem::size_of;

use windows::Win32::{
    Foundation::POINT,
    Graphics::Gdi::ClientToScreen,
    System::{
        Com::{
            CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
            CoUninitialize, SAFEARRAY,
        },
        Ole::{
            SafeArrayAccessData, SafeArrayDestroy, SafeArrayGetLBound, SafeArrayGetUBound,
            SafeArrayUnaccessData,
        },
    },
    UI::{
        Accessibility::{
            CUIAutomation, IUIAutomation, IUIAutomationTextPattern, TextUnit_Character,
            UIA_TextPatternId,
        },
        WindowsAndMessaging::{GUITHREADINFO, GetGUIThreadInfo},
    },
};

/// Past this an application is reporting that it does not know where the caret is, not a caret.
const LARGEST_BELIEVABLE_COORDINATE: f64 = 1_000_000.0;
const LARGEST_BELIEVABLE_CARET_EXTENT: f64 = 10_000.0;

/// The centre of the rectangle UI Automation reports for the character at the caret, or `None`
/// when the rectangle is not one a real caret could have.
pub(super) fn rectangle_centre(left: f64, top: f64, width: f64, height: f64) -> Option<POINT> {
    let believable_position =
        |value: f64| value.is_finite() && value.abs() < LARGEST_BELIEVABLE_COORDINATE;
    let believable_extent =
        |value: f64| value.is_finite() && (0.0..LARGEST_BELIEVABLE_CARET_EXTENT).contains(&value);
    if !(believable_position(left)
        && believable_position(top)
        && believable_extent(width)
        && believable_extent(height))
    {
        return None;
    }
    // Both values are bounded above, so the conversion cannot overflow an i32.
    #[allow(clippy::cast_possible_truncation)]
    let centre = POINT {
        x: (left + width / 2.0).round() as i32,
        y: (top + height / 2.0).round() as i32,
    };
    Some(centre)
}

/// COM for the reader's thread. The caret thread does blocking calls and pumps no messages, so
/// it joins the multithreaded apartment. Only a successful join is left again.
struct ComApartment {
    joined: bool,
}

impl ComApartment {
    fn join() -> Self {
        // SAFETY: no reserved pointer is passed, and the apartment is left on this same thread.
        let joined = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
        Self { joined }
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        if self.joined {
            // SAFETY: balances the successful CoInitializeEx on this thread.
            unsafe { CoUninitialize() };
        }
    }
}

pub(super) struct WindowsCaretReader {
    // Declared before the apartment so it is released while COM is still initialised.
    automation: Option<IUIAutomation>,
    _apartment: ComApartment,
}

impl WindowsCaretReader {
    /// Must be created and used on one thread: the thread that joined the apartment.
    pub(super) fn new() -> Self {
        let apartment = ComApartment::join();
        let automation = if apartment.joined {
            // SAFETY: COM is initialised on this thread; the class and interface match.
            unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }.ok()
        } else {
            None
        };
        Self {
            automation,
            _apartment: apartment,
        }
    }

    pub(super) fn automation_available(&self) -> bool {
        self.automation.is_some()
    }

    pub(super) fn caret_screen_point(&self) -> Option<POINT> {
        self.automation
            .as_ref()
            .and_then(text_pattern_caret)
            .or_else(classic_caret)
    }
}

fn text_pattern_caret(automation: &IUIAutomation) -> Option<POINT> {
    // SAFETY: every call is on a live interface owned by this function, on the apartment thread.
    unsafe {
        let focused = automation.GetFocusedElement().ok()?;
        let text_pattern: IUIAutomationTextPattern =
            focused.GetCurrentPatternAs(UIA_TextPatternId).ok()?;
        let selection = text_pattern.GetSelection().ok()?;
        if selection.Length().ok()? < 1 {
            return None;
        }
        let range = selection.GetElement(0).ok()?;
        // A caret is an empty range and an empty range has no rectangle, so it is widened to the
        // character at the caret before it is measured.
        range.ExpandToEnclosingUnit(TextUnit_Character).ok()?;
        first_rectangle_centre(range.GetBoundingRectangles().ok()?)
    }
}

/// Reads the first rectangle of the array UI Automation returned, then destroys the array. A
/// range that wraps a line reports several rectangles; the first is where the caret is.
fn first_rectangle_centre(rectangles: *mut SAFEARRAY) -> Option<POINT> {
    if rectangles.is_null() {
        return None;
    }
    // SAFETY: `rectangles` is a one dimensional array of doubles owned by this function, accessed
    // only between a successful SafeArrayAccessData and its matching SafeArrayUnaccessData, and
    // destroyed exactly once on every path below.
    unsafe {
        let centre = (|| {
            let lower_bound = SafeArrayGetLBound(rectangles, 1).ok()?;
            let upper_bound = SafeArrayGetUBound(rectangles, 1).ok()?;
            // Doubles in groups of four: left, top, width, height.
            if upper_bound.saturating_sub(lower_bound).saturating_add(1) < 4 {
                return None;
            }
            let mut values: *mut core::ffi::c_void = std::ptr::null_mut();
            SafeArrayAccessData(rectangles, &raw mut values).ok()?;
            let doubles = values.cast::<f64>();
            let centre = rectangle_centre(
                doubles.read(),
                doubles.add(1).read(),
                doubles.add(2).read(),
                doubles.add(3).read(),
            );
            let _unaccessed = SafeArrayUnaccessData(rectangles);
            centre
        })();
        let _destroyed = SafeArrayDestroy(rectangles);
        centre
    }
}

fn classic_caret() -> Option<POINT> {
    let mut info = GUITHREADINFO {
        cbSize: u32::try_from(size_of::<GUITHREADINFO>()).ok()?,
        ..GUITHREADINFO::default()
    };
    // SAFETY: `info` is sized for the call and writable; thread zero means the foreground thread.
    unsafe { GetGUIThreadInfo(0, &raw mut info) }.ok()?;
    if info.hwndCaret.is_invalid() {
        return None;
    }
    let caret = info.rcCaret;
    if caret.right <= caret.left && caret.bottom <= caret.top {
        return None;
    }
    // rcCaret is in the client coordinates of the caret's window.
    let mut point = POINT {
        x: caret.left + (caret.right - caret.left) / 2,
        y: caret.top + (caret.bottom - caret.top) / 2,
    };
    // SAFETY: the window handle came from the system just now and `point` is writable.
    unsafe { ClientToScreen(info.hwndCaret, &raw mut point) }
        .as_bool()
        .then_some(point)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]

    use super::*;

    #[test]
    fn the_centre_of_a_real_character_rectangle_is_the_caret() {
        let centre = rectangle_centre(100.0, 200.0, 8.0, 20.0).expect("a real rectangle");
        assert_eq!((centre.x, centre.y), (104, 210));
    }

    #[test]
    fn a_caret_on_a_monitor_left_of_the_primary_keeps_its_negative_position() {
        let centre = rectangle_centre(-1920.0, -40.0, 2.0, 18.0).expect("a real rectangle");
        assert_eq!((centre.x, centre.y), (-1919, -31));
    }

    #[test]
    fn an_infinite_or_missing_number_is_not_a_caret() {
        for (left, top, width, height) in [
            (f64::NAN, 0.0, 1.0, 1.0),
            (0.0, f64::INFINITY, 1.0, 1.0),
            (0.0, 0.0, f64::NEG_INFINITY, 1.0),
            (0.0, 0.0, 1.0, f64::NAN),
        ] {
            assert!(rectangle_centre(left, top, width, height).is_none());
        }
    }

    #[test]
    fn an_absurd_rectangle_is_an_application_saying_it_does_not_know() {
        for (left, top, width, height) in [
            (0.0, 0.0, -1.0, 10.0),
            (0.0, 0.0, 10.0, 10_000.0),
            (2_000_000.0, 0.0, 1.0, 1.0),
            (0.0, -2_000_000.0, 1.0, 1.0),
        ] {
            assert!(rectangle_centre(left, top, width, height).is_none());
        }
    }

    #[test]
    fn a_zero_width_rectangle_is_still_a_caret() {
        assert!(rectangle_centre(10.0, 10.0, 0.0, 16.0).is_some());
    }
}
