//! Turns caret readings into the caret track: when to read, what to keep, and when to stop.
//!
//! Platform neutral, so each operating system supplies only a function that reads the caret.
//! Reading is not free (a slow application can take several milliseconds to answer), so the
//! caret is read only while someone is typing, and each reading costs nothing once the cap is hit.

use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use crate::{
    cursor::CursorCoordinates,
    input::{InputEvent, MAXIMUM_CARET_EVENTS},
};

/// How long after the last keystroke the caret is still read. Matched to the gap that ends a
/// typing burst in the editor, so sampling covers a burst and stops with it. It outlives the last
/// keystroke on purpose: a page still scrolling after the typing moves the caret, and that is
/// exactly the movement a typing zoom should follow.
pub const CARET_SAMPLING_QUIET_NS: u64 = 2_500_000_000;

/// Four readings a second: enough to follow text down a page, few enough that a slow
/// application answering the accessibility interface is not asked continuously.
pub const CARET_SAMPLE_INTERVAL: Duration = Duration::from_millis(250);

/// The time of the latest keystroke, written by the thread that polls the keyboard and read by
/// the one that reads the caret. Only the time crosses: the caret reader never learns anything
/// about the key.
#[derive(Debug, Clone)]
pub struct LastKeystroke(Arc<AtomicU64>);

/// No real session reaches this, so it can stand for "no keystroke yet" without a second atomic.
const NO_KEYSTROKE_YET: u64 = u64::MAX;

impl Default for LastKeystroke {
    fn default() -> Self {
        Self(Arc::new(AtomicU64::new(NO_KEYSTROKE_YET)))
    }
}

impl LastKeystroke {
    pub fn note(&self, session_ns: u64) {
        self.0.store(session_ns, Ordering::Release);
    }

    #[must_use]
    pub fn session_ns(&self) -> Option<u64> {
        let session_ns = self.0.load(Ordering::Acquire);
        (session_ns != NO_KEYSTROKE_YET).then_some(session_ns)
    }
}

#[derive(Debug)]
pub struct CaretTracker {
    last_recorded_pixel: Option<(i32, i32)>,
    caret_events_recorded: u64,
    maximum_caret_events: u64,
    limit_reached: bool,
}

impl Default for CaretTracker {
    fn default() -> Self {
        Self::with_maximum_caret_events(MAXIMUM_CARET_EVENTS)
    }
}

impl CaretTracker {
    #[must_use]
    pub fn with_maximum_caret_events(maximum_caret_events: u64) -> Self {
        Self {
            last_recorded_pixel: None,
            caret_events_recorded: 0,
            maximum_caret_events,
            limit_reached: false,
        }
    }

    #[must_use]
    pub fn maximum_caret_events(&self) -> u64 {
        self.maximum_caret_events
    }

    /// One sampling tick. `read_caret` is called only while typing, and returns `None` when no
    /// caret could be found; the track then holds its last position rather than recording a gap.
    pub fn step(
        &mut self,
        session_ns: u64,
        last_keystroke_ns: Option<u64>,
        read_caret: impl FnOnce() -> Option<CursorCoordinates>,
    ) -> Option<InputEvent> {
        if self.limit_reached {
            return None;
        }
        // A keystroke stamped a moment after this tick, by the other thread's clock, is typing.
        let typing = last_keystroke_ns.is_some_and(|keystroke_ns| {
            session_ns.saturating_sub(keystroke_ns) <= CARET_SAMPLING_QUIET_NS
        });
        if !typing {
            // Forgetting the last position means the first caret of the next burst is always
            // recorded, even where the previous burst left it.
            self.last_recorded_pixel = None;
            return None;
        }
        let caret = read_caret()?;
        // Dropped rather than clamped: a clamped caret would pin the camera to the frame's edge
        // for as long as someone typed into another window.
        if !caret.inside {
            return None;
        }
        let pixel = (caret.pixel_x, caret.pixel_y);
        if self.last_recorded_pixel == Some(pixel) {
            return None;
        }
        if self.caret_events_recorded >= self.maximum_caret_events {
            self.limit_reached = true;
            return Some(InputEvent::CaretLimitReached { session_ns });
        }
        self.caret_events_recorded += 1;
        self.last_recorded_pixel = Some(pixel);
        Some(InputEvent::Caret {
            session_ns,
            normalized_x: caret.normalized_x,
            normalized_y: caret.normalized_y,
        })
    }
}
