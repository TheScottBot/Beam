#![allow(clippy::expect_used)]

//! The caret track records where the text caret was while someone typed, and nothing else. These
//! tests hold when it samples, what it keeps, and the cap from the shared sidecar contract.

use std::cell::Cell;

use capture::{
    cursor::CursorCoordinates,
    input::{
        CARET_SAMPLING_QUIET_NS, CaretTracker, InputEvent, LastKeystroke, MAXIMUM_CARET_EVENTS,
        MAXIMUM_INPUT_SIDECAR_EVENTS, MAXIMUM_KEYSTROKE_EVENTS,
    },
};

const SECOND_NS: u64 = 1_000_000_000;

fn inside(pixel_x: i32, pixel_y: i32) -> CursorCoordinates {
    CursorCoordinates {
        pixel_x,
        pixel_y,
        normalized_x: f64::from(pixel_x) / 1000.0,
        normalized_y: f64::from(pixel_y) / 1000.0,
        inside: true,
    }
}

fn outside() -> CursorCoordinates {
    CursorCoordinates {
        pixel_x: -5,
        pixel_y: 20,
        normalized_x: -0.005,
        normalized_y: 0.02,
        inside: false,
    }
}

fn caret_event(session_ns: u64, coordinates: CursorCoordinates) -> InputEvent {
    InputEvent::Caret {
        session_ns,
        normalized_x: coordinates.normalized_x,
        normalized_y: coordinates.normalized_y,
    }
}

#[test]
fn nothing_is_read_before_the_first_keystroke() {
    let mut tracker = CaretTracker::default();
    let reads = Cell::new(0);
    let event = tracker.step(SECOND_NS, None, || {
        reads.set(reads.get() + 1);
        Some(inside(10, 10))
    });
    assert_eq!(event, None);
    assert_eq!(reads.get(), 0);
}

#[test]
fn a_caret_inside_the_capture_is_recorded_while_typing() {
    let mut tracker = CaretTracker::default();
    assert_eq!(
        tracker.step(SECOND_NS, Some(SECOND_NS), || Some(inside(100, 200))),
        Some(caret_event(SECOND_NS, inside(100, 200)))
    );
}

#[test]
fn sampling_continues_up_to_the_quiet_period_and_stops_after_it() {
    let mut tracker = CaretTracker::default();
    let last_keystroke_ns = SECOND_NS;
    assert!(
        tracker
            .step(
                last_keystroke_ns + CARET_SAMPLING_QUIET_NS,
                Some(last_keystroke_ns),
                || Some(inside(1, 1)),
            )
            .is_some()
    );
    let reads = Cell::new(0);
    let event = tracker.step(
        last_keystroke_ns + CARET_SAMPLING_QUIET_NS + 1,
        Some(last_keystroke_ns),
        || {
            reads.set(reads.get() + 1);
            Some(inside(2, 2))
        },
    );
    assert_eq!(event, None);
    assert_eq!(reads.get(), 0);
}

#[test]
fn the_quiet_period_matches_the_gap_that_ends_a_typing_burst() {
    assert_eq!(CARET_SAMPLING_QUIET_NS, 2_500_000_000);
}

#[test]
fn a_caret_that_has_not_moved_is_not_recorded_again() {
    let mut tracker = CaretTracker::default();
    tracker.step(SECOND_NS, Some(SECOND_NS), || Some(inside(100, 200)));
    assert_eq!(
        tracker.step(SECOND_NS + 1, Some(SECOND_NS), || Some(inside(100, 200))),
        None
    );
    assert_eq!(
        tracker.step(SECOND_NS + 2, Some(SECOND_NS), || Some(inside(101, 200))),
        Some(caret_event(SECOND_NS + 2, inside(101, 200)))
    );
}

#[test]
fn the_first_caret_of_a_new_burst_is_recorded_even_where_the_last_one_was() {
    let mut tracker = CaretTracker::default();
    tracker.step(SECOND_NS, Some(SECOND_NS), || Some(inside(100, 200)));
    let quiet_time = SECOND_NS + CARET_SAMPLING_QUIET_NS + 1;
    tracker.step(quiet_time, Some(SECOND_NS), || Some(inside(100, 200)));
    let next_burst = quiet_time + SECOND_NS;
    assert_eq!(
        tracker.step(next_burst, Some(next_burst), || Some(inside(100, 200))),
        Some(caret_event(next_burst, inside(100, 200)))
    );
}

#[test]
fn a_caret_outside_the_capture_is_dropped_rather_than_clamped() {
    let mut tracker = CaretTracker::default();
    assert_eq!(
        tracker.step(SECOND_NS, Some(SECOND_NS), || Some(outside())),
        None
    );
}

#[test]
fn a_dropped_or_missing_caret_does_not_replace_the_last_one_recorded() {
    let mut tracker = CaretTracker::default();
    tracker.step(SECOND_NS, Some(SECOND_NS), || Some(inside(100, 200)));
    assert_eq!(
        tracker.step(SECOND_NS + 1, Some(SECOND_NS), || Some(outside())),
        None
    );
    assert_eq!(tracker.step(SECOND_NS + 2, Some(SECOND_NS), || None), None);
    assert_eq!(
        tracker.step(SECOND_NS + 3, Some(SECOND_NS), || Some(inside(100, 200))),
        None
    );
}

#[test]
fn a_keystroke_timed_after_the_sample_still_counts_as_typing() {
    let mut tracker = CaretTracker::default();
    assert!(
        tracker
            .step(SECOND_NS, Some(SECOND_NS + 5), || Some(inside(3, 3)))
            .is_some()
    );
}

#[test]
fn caret_events_stop_at_the_limit_and_the_limit_is_recorded_once() {
    let mut tracker = CaretTracker::with_maximum_caret_events(1);
    assert!(
        tracker
            .step(SECOND_NS, Some(SECOND_NS), || Some(inside(1, 1)))
            .is_some()
    );
    assert_eq!(
        tracker.step(SECOND_NS + 1, Some(SECOND_NS), || Some(inside(2, 2))),
        Some(InputEvent::CaretLimitReached {
            session_ns: SECOND_NS + 1
        })
    );
    assert_eq!(
        tracker.step(SECOND_NS + 2, Some(SECOND_NS), || Some(inside(3, 3))),
        None
    );
}

#[test]
fn once_the_limit_is_reached_the_caret_is_no_longer_read() {
    let mut tracker = CaretTracker::with_maximum_caret_events(0);
    tracker.step(SECOND_NS, Some(SECOND_NS), || Some(inside(1, 1)));
    let reads = Cell::new(0);
    tracker.step(SECOND_NS + 1, Some(SECOND_NS), || {
        reads.set(reads.get() + 1);
        Some(inside(2, 2))
    });
    assert_eq!(reads.get(), 0);
}

#[test]
fn the_default_tracker_uses_the_contract_caret_limit() {
    assert_eq!(
        CaretTracker::default().maximum_caret_events(),
        MAXIMUM_CARET_EVENTS
    );
}

#[test]
fn keystroke_and_caret_caps_together_leave_room_inside_the_event_limit() {
    const {
        assert!(MAXIMUM_KEYSTROKE_EVENTS + MAXIMUM_CARET_EVENTS < MAXIMUM_INPUT_SIDECAR_EVENTS);
    }
}

#[test]
fn a_serialised_caret_holds_only_its_time_and_position() {
    assert_eq!(
        serde_json::to_value(caret_event(9, inside(250, 500))).expect("serialise caret"),
        serde_json::json!({
            "event": "caret",
            "sessionNs": 9,
            "normalizedX": 0.25,
            "normalizedY": 0.5,
        })
    );
}

#[test]
fn the_caret_markers_hold_only_their_time() {
    assert_eq!(
        serde_json::to_value(InputEvent::CaretLimitReached { session_ns: 4 })
            .expect("serialise limit"),
        serde_json::json!({ "event": "caret-limit-reached", "sessionNs": 4 })
    );
    assert_eq!(
        serde_json::to_value(InputEvent::CaretAutomationUnavailable { session_ns: 5 })
            .expect("serialise unavailable"),
        serde_json::json!({ "event": "caret-automation-unavailable", "sessionNs": 5 })
    );
}

#[test]
fn no_keystroke_is_known_until_one_is_noted() {
    assert_eq!(LastKeystroke::default().session_ns(), None);
}

#[test]
fn the_latest_noted_keystroke_is_seen_by_every_clone() {
    let written_by_the_cursor_thread = LastKeystroke::default();
    let read_by_the_caret_thread = written_by_the_cursor_thread.clone();
    written_by_the_cursor_thread.note(10);
    written_by_the_cursor_thread.note(20);
    assert_eq!(read_by_the_caret_thread.session_ns(), Some(20));
}

#[test]
fn a_keystroke_at_the_very_start_of_a_session_is_still_known() {
    let last_keystroke = LastKeystroke::default();
    last_keystroke.note(0);
    assert_eq!(last_keystroke.session_ns(), Some(0));
}
