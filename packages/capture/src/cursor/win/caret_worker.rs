//! Runs the caret reader on its own thread. A slow application can take milliseconds to answer
//! UI Automation, and the cursor loop samples every 8 ms, so the two cannot share a thread.
//! Events come back over a channel and the cursor thread writes them, so the input sidecar keeps
//! a single writer.

use std::{
    sync::mpsc::{self, Receiver, RecvTimeoutError, Sender},
    thread::JoinHandle,
    time::Instant,
};

use crate::{
    CaptureError,
    cursor::{CaptureRegion, map_coordinates},
    input::{CARET_SAMPLE_INTERVAL, CaretTracker, InputEvent, LastKeystroke},
};

use super::caret::WindowsCaretReader;
use super::dpi::PhysicalCoordinates;

pub(super) fn session_ns_since(segment_start_ns: u64, started: Instant) -> u64 {
    segment_start_ns.saturating_add(u64::try_from(started.elapsed().as_nanos()).unwrap_or(u64::MAX))
}

pub(super) struct CaretWorker {
    stop: Option<Sender<()>>,
    events: Receiver<InputEvent>,
    thread: Option<JoinHandle<()>>,
}

impl CaretWorker {
    pub(super) fn start(
        region: CaptureRegion,
        segment_start_ns: u64,
        started: Instant,
        last_keystroke: LastKeystroke,
    ) -> Result<Self, CaptureError> {
        let (stop_sender, stop_receiver) = mpsc::channel();
        let (event_sender, event_receiver) = mpsc::channel();
        let thread = std::thread::Builder::new()
            .name("capture-windows-caret".into())
            .spawn(move || {
                read_caret_until_stopped(
                    region,
                    segment_start_ns,
                    started,
                    &last_keystroke,
                    &stop_receiver,
                    &event_sender,
                );
            })
            .map_err(|error| {
                CaptureError::Backend(format!("caret reader failed to start: {error}"))
            })?;
        Ok(Self {
            stop: Some(stop_sender),
            events: event_receiver,
            thread: Some(thread),
        })
    }

    pub(super) fn drain(&self) -> impl Iterator<Item = InputEvent> + '_ {
        self.events.try_iter()
    }

    /// Stops the reader and returns whatever it produced after the last drain.
    pub(super) fn stop(mut self) -> Vec<InputEvent> {
        self.join_reader();
        self.events.try_iter().collect()
    }

    fn join_reader(&mut self) {
        // Dropping the sender wakes the reader at once rather than after its next interval.
        self.stop.take();
        if let Some(thread) = self.thread.take() {
            let _joined = thread.join();
        }
    }
}

impl Drop for CaretWorker {
    fn drop(&mut self) {
        // The cursor loop can leave early on a write error; the reader must not outlive it.
        self.join_reader();
    }
}

fn read_caret_until_stopped(
    region: CaptureRegion,
    segment_start_ns: u64,
    started: Instant,
    last_keystroke: &LastKeystroke,
    stop: &Receiver<()>,
    events: &Sender<InputEvent>,
) {
    // Caret rectangles must be in the physical pixels the capture region is measured in; without
    // that a scaled display would place every caret in the wrong spot. Rather than record a track
    // that is quietly wrong, the reader says it could not start and records none.
    let Ok(_physical_coordinates) = PhysicalCoordinates::enter() else {
        let _sent = events.send(InputEvent::CaretAutomationUnavailable {
            session_ns: session_ns_since(segment_start_ns, started),
        });
        return;
    };
    let reader = WindowsCaretReader::new();
    if !reader.automation_available() {
        let _sent = events.send(InputEvent::CaretAutomationUnavailable {
            session_ns: session_ns_since(segment_start_ns, started),
        });
    }
    let mut tracker = CaretTracker::default();
    while let Err(RecvTimeoutError::Timeout) = stop.recv_timeout(CARET_SAMPLE_INTERVAL) {
        let session_ns = session_ns_since(segment_start_ns, started);
        let read_caret = || {
            reader
                .caret_screen_point()
                .and_then(|point| map_coordinates(point.x, point.y, region).ok())
        };
        if let Some(event) = tracker.step(session_ns, last_keystroke.session_ns(), read_caret)
            && events.send(event).is_err()
        {
            return;
        }
    }
}
