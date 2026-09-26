import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '~/api/types/capture-api';
import type { InteractionAccessViewState } from './interaction-access-types';
import { typingDetectionAvailability, useTypingDetection } from './useTypingDetection';

const capture = vi.hoisted(() => ({ updatePreferences: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));

const access = (state: InteractionAccessViewState['state']): InteractionAccessViewState =>
  ({
    state,
    canRequest: state !== 'available',
    clicks: false,
    shortcuts: false,
    recordsText: false,
  }) as InteractionAccessViewState;

const preferences = (typingDetection?: PreferenceSettings['typingDetection']) =>
  ({ typingDetection }) as PreferenceSettings;

beforeEach(() => capture.updatePreferences.mockReset().mockResolvedValue(undefined));

describe('typingDetectionAvailability', () => {
  it('is available on Windows and macOS once keyboard access is available', () => {
    expect(typingDetectionAvailability('win32', 'available')).toBe('available');
    expect(typingDetectionAvailability('darwin', 'available')).toBe('available');
  });

  it('is not yet supported on Linux, whatever the keyboard access', () => {
    expect(typingDetectionAvailability('linux', 'available')).toBe('unsupported-platform');
    expect(typingDetectionAvailability('linux', 'permission-required')).toBe('unsupported-platform');
  });

  it('waits while keyboard access is being checked', () => {
    expect(typingDetectionAvailability('darwin', 'checking')).toBe('checking');
  });

  it('needs keyboard access when it has not been granted', () => {
    for (const state of ['permission-required', 'denied', 'unavailable'] as const)
      expect(typingDetectionAvailability('darwin', state)).toBe('needs-keyboard-access');
  });
});

describe('useTypingDetection', () => {
  it('starts off, and stays off for preferences saved before the setting existed', () => {
    const detection = useTypingDetection('win32', ref(access('available')));
    expect(detection.enabled.value).toBe(false);
    detection.hydrate(preferences(undefined));
    expect(detection.enabled.value).toBe(false);
  });

  it('takes the saved setting', () => {
    const detection = useTypingDetection('win32', ref(access('available')));
    detection.hydrate(preferences({ enabled: true }));
    expect(detection.enabled.value).toBe(true);
    expect(detection.recordingEnabled.value).toBe(true);
  });

  it('saves a change and records typing only while it is available', async () => {
    const accessState = ref(access('available'));
    const detection = useTypingDetection('darwin', accessState);
    await detection.setEnabled(true);
    expect(capture.updatePreferences).toHaveBeenCalledWith({ typingDetection: { enabled: true } });
    expect(detection.recordingEnabled.value).toBe(true);
    accessState.value = access('denied');
    expect(detection.recordingEnabled.value).toBe(false);
  });

  it('refuses to switch on where it cannot work, and saves nothing', async () => {
    const detection = useTypingDetection('linux', ref(access('available')));
    await detection.setEnabled(true);
    expect(detection.enabled.value).toBe(false);
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });

  it('can always be switched off', async () => {
    const detection = useTypingDetection('linux', ref(access('available')));
    detection.hydrate(preferences({ enabled: true }));
    await detection.setEnabled(false);
    expect(detection.enabled.value).toBe(false);
    expect(capture.updatePreferences).toHaveBeenCalledWith({ typingDetection: { enabled: false } });
  });
});
