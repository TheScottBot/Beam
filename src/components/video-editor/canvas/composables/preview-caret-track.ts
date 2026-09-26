import type { InputEventSidecar } from '~/api/types/capture-session';
import { typingTelemetryFromInput } from '../../zoom/typing-telemetry';
import type { CaretSample } from '../../zoom/typing-zoom-types';

/**
 * Reads a session's caret track once per interactions object. The preview rebuilds its camera
 * whenever an input's identity changes, so a track read afresh every frame would rebuild it every
 * frame.
 */
export function createCaretTrackReader() {
  let readFrom: InputEventSidecar | undefined;
  let caretTrack: CaretSample[] = [];
  return (interactions: InputEventSidecar | undefined): CaretSample[] => {
    if (interactions !== readFrom) {
      readFrom = interactions;
      caretTrack = typingTelemetryFromInput(interactions).caretTrack;
    }
    return caretTrack;
  };
}
