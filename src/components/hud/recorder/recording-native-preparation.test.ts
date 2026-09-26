import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingConfiguration } from './recording-types';
import { prepareNativeRecording } from './recording-native-preparation';

const capture = vi.hoisted(() => ({ prepareRecording: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));

const configuration = (overrides: Partial<RecordingConfiguration> = {}): RecordingConfiguration => ({
  screenKind: 'display',
  cameraId: '',
  microphoneId: '',
  systemAudio: false,
  targetFps: 60,
  countdownSeconds: 0,
  recordingBarVisibility: 'always',
  ...overrides,
});

beforeEach(() => capture.prepareRecording.mockReset().mockResolvedValue({ sessionId: 'session' }));

describe('prepareNativeRecording typing detection', () => {
  it('passes typing detection on to the engine when the recording asks for it', async () => {
    await prepareNativeRecording(configuration({ detectTyping: true }));
    expect(capture.prepareRecording).toHaveBeenCalledWith(expect.objectContaining({ detectTyping: true }));
  });

  it('sends it off unless the recording asked for exactly true', async () => {
    await prepareNativeRecording(configuration());
    expect(capture.prepareRecording).toHaveBeenLastCalledWith(expect.objectContaining({ detectTyping: false }));
  });

  it('keeps it apart from keyboard shortcut recording', async () => {
    await prepareNativeRecording(configuration({ recordInteractions: true, detectTyping: false }));
    expect(capture.prepareRecording).toHaveBeenLastCalledWith(
      expect.objectContaining({ recordInteractions: true, detectTyping: false }),
    );
  });
});
