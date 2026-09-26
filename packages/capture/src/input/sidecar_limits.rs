//! Bounds on the input sidecar. `build.rs` generates these from
//! `contracts/input-sidecar-limits.json`, the same file Electron's reader loads, so the writer
//! and the reader cannot disagree about where the limits are.

include!(concat!(env!("OUT_DIR"), "/input_sidecar_limits.rs"));

// Keystrokes and caret positions are capped so typing alone can never push a sidecar past the
// event bound, which would make a reader refuse the whole file and lose its keyboard captions
// with it. A contract file that breaks this fails the build rather than a recording.
const _: () =
    assert!(MAXIMUM_KEYSTROKE_EVENTS + MAXIMUM_CARET_EVENTS < MAXIMUM_INPUT_SIDECAR_EVENTS);
