#![allow(clippy::expect_used)]

//! Typing detection records when keys were pressed and whether each would have produced a
//! character, and nothing that identifies the key. These tests hold that line, and hold the
//! keystroke cap to the value in the shared input sidecar contract.

use std::collections::{BTreeSet, HashSet};

use capture::{
    catalog::{CatalogSnapshot, validate_request},
    input::{
        INPUT_SIDECAR_VERSION, InputEvent, InputEventSidecar, InputModifier, MAXIMUM_CARET_EVENTS,
        MAXIMUM_INPUT_SIDECAR_BYTES, MAXIMUM_INPUT_SIDECAR_EVENTS, MAXIMUM_KEYSTROKE_EVENTS,
        TypingKeyCategory, TypingSampler, finalize_input_events,
    },
    model::*,
};

const LETTER_KEY: u16 = 10;
const SECOND_LETTER_KEY: u16 = 11;
const ARROW_KEY: u16 = 20;
const PUNCTUATION_KEY: u16 = 30;

const TEST_TYPING_KEYS: &[(u16, TypingKeyCategory)] = &[
    (LETTER_KEY, TypingKeyCategory::Letter),
    (SECOND_LETTER_KEY, TypingKeyCategory::Letter),
    (ARROW_KEY, TypingKeyCategory::Navigation),
    (PUNCTUATION_KEY, TypingKeyCategory::Punctuation),
];

fn sample_with(
    sampler: &mut TypingSampler,
    session_ns: u64,
    held_modifiers: &[InputModifier],
    pressed_keys: &[u16],
) -> Vec<InputEvent> {
    let held_modifier_set: HashSet<InputModifier> = held_modifiers.iter().copied().collect();
    let pressed_key_set: HashSet<u16> = pressed_keys.iter().copied().collect();
    sampler.sample(
        session_ns,
        TEST_TYPING_KEYS,
        |modifier| held_modifier_set.contains(&modifier),
        |native_key_code| pressed_key_set.contains(&native_key_code),
    )
}

fn keystroke(session_ns: u64, produces_character: bool) -> InputEvent {
    InputEvent::Keystroke {
        session_ns,
        produces_character,
    }
}

fn json_field_names(event: &InputEvent) -> BTreeSet<String> {
    serde_json::to_value(event)
        .expect("serialise event")
        .as_object()
        .expect("event serialises as an object")
        .keys()
        .cloned()
        .collect()
}

#[test]
fn only_keys_that_edit_text_are_classified_as_producing_a_character() {
    let producing: BTreeSet<TypingKeyCategory> = TypingKeyCategory::ALL
        .into_iter()
        .filter(|category| category.produces_character())
        .collect();
    let expected: BTreeSet<TypingKeyCategory> = [
        TypingKeyCategory::Letter,
        TypingKeyCategory::Digit,
        TypingKeyCategory::Punctuation,
        TypingKeyCategory::Space,
        TypingKeyCategory::Enter,
        TypingKeyCategory::Backspace,
        TypingKeyCategory::ForwardDelete,
        TypingKeyCategory::NumpadDigit,
        TypingKeyCategory::NumpadSymbol,
    ]
    .into_iter()
    .collect();
    assert_eq!(producing, expected);
}

#[test]
fn keys_that_only_move_or_leave_are_classified_as_producing_no_character() {
    for category in [
        TypingKeyCategory::Tab,
        TypingKeyCategory::Escape,
        TypingKeyCategory::Navigation,
        TypingKeyCategory::Function,
    ] {
        assert!(!category.produces_character(), "{category:?}");
    }
}

#[test]
fn a_held_key_is_recorded_once_on_its_press() {
    let mut sampler = TypingSampler::default();
    assert_eq!(
        sample_with(&mut sampler, 100, &[], &[LETTER_KEY]),
        vec![keystroke(100, true)]
    );
    assert!(sample_with(&mut sampler, 108, &[], &[LETTER_KEY]).is_empty());
    assert!(sample_with(&mut sampler, 116, &[], &[LETTER_KEY]).is_empty());
}

#[test]
fn releasing_a_key_records_nothing_and_pressing_it_again_records_again() {
    let mut sampler = TypingSampler::default();
    sample_with(&mut sampler, 100, &[], &[LETTER_KEY]);
    assert!(sample_with(&mut sampler, 108, &[], &[]).is_empty());
    assert_eq!(
        sample_with(&mut sampler, 116, &[], &[LETTER_KEY]),
        vec![keystroke(116, true)]
    );
}

#[test]
fn a_navigation_key_is_recorded_as_producing_no_character() {
    let mut sampler = TypingSampler::default();
    assert_eq!(
        sample_with(&mut sampler, 100, &[], &[ARROW_KEY]),
        vec![keystroke(100, false)]
    );
}

#[test]
fn a_letter_pressed_with_control_alt_or_meta_produces_no_character() {
    for modifier in [
        InputModifier::Control,
        InputModifier::Alt,
        InputModifier::Meta,
    ] {
        let mut sampler = TypingSampler::default();
        assert_eq!(
            sample_with(&mut sampler, 100, &[modifier], &[LETTER_KEY]),
            vec![keystroke(100, false)],
            "{modifier:?}"
        );
    }
}

#[test]
fn a_letter_pressed_with_shift_still_produces_a_character() {
    let mut sampler = TypingSampler::default();
    assert_eq!(
        sample_with(
            &mut sampler,
            100,
            &[InputModifier::Shift],
            &[PUNCTUATION_KEY]
        ),
        vec![keystroke(100, true)]
    );
}

#[test]
fn keys_pressed_within_one_sample_are_each_recorded() {
    let mut sampler = TypingSampler::default();
    assert_eq!(
        sample_with(&mut sampler, 100, &[], &[LETTER_KEY, SECOND_LETTER_KEY]),
        vec![keystroke(100, true), keystroke(100, true)]
    );
}

#[test]
fn a_key_outside_the_typing_table_is_never_recorded() {
    let mut sampler = TypingSampler::default();
    assert!(sample_with(&mut sampler, 100, &[], &[999]).is_empty());
}

#[test]
fn keystrokes_stop_at_the_limit_and_the_limit_is_recorded_once() {
    let mut sampler = TypingSampler::with_maximum_keystroke_events(2);
    assert_eq!(
        sample_with(&mut sampler, 100, &[], &[LETTER_KEY, SECOND_LETTER_KEY]),
        vec![keystroke(100, true), keystroke(100, true)]
    );
    sample_with(&mut sampler, 108, &[], &[]);
    assert_eq!(
        sample_with(&mut sampler, 116, &[], &[LETTER_KEY]),
        vec![InputEvent::KeystrokeLimitReached { session_ns: 116 }]
    );
    sample_with(&mut sampler, 124, &[], &[]);
    assert!(sample_with(&mut sampler, 132, &[], &[LETTER_KEY]).is_empty());
}

#[test]
fn a_limit_of_zero_records_the_limit_and_no_keystroke() {
    let mut sampler = TypingSampler::with_maximum_keystroke_events(0);
    assert_eq!(
        sample_with(&mut sampler, 100, &[], &[LETTER_KEY]),
        vec![InputEvent::KeystrokeLimitReached { session_ns: 100 }]
    );
}

#[test]
fn the_default_sampler_uses_the_contract_keystroke_limit() {
    assert_eq!(
        TypingSampler::default().maximum_keystroke_events(),
        MAXIMUM_KEYSTROKE_EVENTS
    );
}

#[test]
fn a_serialised_keystroke_holds_only_its_time_and_the_character_flag() {
    let serialised = serde_json::to_value(keystroke(42, true)).expect("serialise keystroke");
    assert_eq!(
        serialised,
        serde_json::json!({ "event": "keystroke", "sessionNs": 42, "producesCharacter": true })
    );
    assert_eq!(
        json_field_names(&keystroke(42, false)),
        ["event", "producesCharacter", "sessionNs"]
            .into_iter()
            .map(String::from)
            .collect()
    );
}

#[test]
fn a_serialised_limit_marker_holds_only_its_time() {
    assert_eq!(
        serde_json::to_value(InputEvent::KeystrokeLimitReached { session_ns: 7 })
            .expect("serialise limit marker"),
        serde_json::json!({ "event": "keystroke-limit-reached", "sessionNs": 7 })
    );
}

#[test]
fn the_sidecar_version_is_two_now_that_it_can_hold_keystrokes() {
    assert_eq!(INPUT_SIDECAR_VERSION, 2);
    assert_eq!(InputEventSidecar::new(Vec::new()).version, 2);
}

#[test]
fn finalising_keeps_keystrokes_and_the_limit_marker_in_time_order() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let partial = directory.path().join("input.partial.jsonl");
    let destination = directory.path().join("input.json");
    let lines = [
        serde_json::to_string(&InputEvent::KeystrokeLimitReached { session_ns: 30 }),
        serde_json::to_string(&keystroke(10, true)),
        serde_json::to_string(&keystroke(20, false)),
    ]
    .map(|line| line.expect("serialise line"))
    .join("\n");
    std::fs::write(&partial, lines).expect("write partial");

    finalize_input_events(&partial, &destination).expect("finalise");

    let sidecar: InputEventSidecar =
        serde_json::from_slice(&std::fs::read(&destination).expect("read sidecar"))
            .expect("parse sidecar");
    assert_eq!(
        sidecar,
        InputEventSidecar::new(vec![
            keystroke(10, true),
            keystroke(20, false),
            InputEvent::KeystrokeLimitReached { session_ns: 30 },
        ])
    );
}

#[test]
fn the_built_limits_equal_the_shared_contract_file() {
    let contract: serde_json::Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/contracts/input-sidecar-limits.json"
    )))
    .expect("parse contract");
    assert_eq!(
        contract,
        serde_json::json!({
            "maximumSidecarBytes": MAXIMUM_INPUT_SIDECAR_BYTES,
            "maximumSidecarEvents": MAXIMUM_INPUT_SIDECAR_EVENTS,
            "maximumKeystrokeEvents": MAXIMUM_KEYSTROKE_EVENTS,
            "maximumCaretEvents": MAXIMUM_CARET_EVENTS,
        })
    );
}

#[test]
fn typing_detection_is_off_when_the_request_does_not_ask_for_it() {
    let selection: CursorSelection = serde_json::from_value(serde_json::json!({
        "mode": "separate",
        "captureClicks": true,
        "captureShortcuts": true,
        "captureShape": true,
    }))
    .expect("parse cursor selection");
    assert!(matches!(
        selection,
        CursorSelection::Separate {
            capture_typing: false,
            ..
        }
    ));
}

#[test]
fn typing_detection_is_on_only_when_the_request_asks_for_it() {
    let selection: CursorSelection = serde_json::from_value(serde_json::json!({
        "mode": "separate",
        "captureClicks": true,
        "captureShortcuts": false,
        "captureTyping": true,
        "captureShape": true,
    }))
    .expect("parse cursor selection");
    assert!(matches!(
        selection,
        CursorSelection::Separate {
            capture_typing: true,
            ..
        }
    ));
}

fn typing_request_against(capabilities: CaptureCapabilities) -> Result<(), capture::CaptureError> {
    let display = SourceDescriptor {
        id: SourceId::new("display:1").expect("valid source id"),
        kind: SourceKind::Display,
        label: "display:1".into(),
        is_default: false,
        selection_mode: SourceSelectionMode::Direct,
        display_id: None,
        capabilities: SourceCapabilities::default(),
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities,
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: vec![display.clone()],
    };
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: Some(ScreenSelection::Source {
            source_id: display.id,
        }),
        system_audio: None,
        cursor: CursorSelection::Separate {
            capture_clicks: false,
            capture_shortcuts: false,
            capture_typing: true,
            capture_shape: false,
        },
        recording: RecordingSettings::default(),
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    };
    validate_request(&request, &snapshot)
}

#[test]
fn typing_detection_is_refused_where_the_platform_cannot_capture_it() {
    assert!(matches!(
        typing_request_against(CaptureCapabilities {
            display_capture: true,
            separate_cursor: true,
            input_typing: false,
            ..CaptureCapabilities::default()
        }),
        Err(capture::CaptureError::Unsupported(_))
    ));
}

#[test]
fn typing_detection_is_accepted_where_the_platform_can_capture_it() {
    assert!(
        typing_request_against(CaptureCapabilities {
            display_capture: true,
            separate_cursor: true,
            input_typing: true,
            ..CaptureCapabilities::default()
        })
        .is_ok()
    );
}
