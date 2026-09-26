import { computed, ref, type Ref } from 'vue';
import { capture } from '~/api/capture';
import type { PreferenceSettings } from '~/api/types/capture-api';
import type { InteractionAccessViewState } from './interaction-access-types';

export type TypingDetectionAvailability = 'available' | 'checking' | 'needs-keyboard-access' | 'unsupported-platform';

/**
 * Whether keystroke timing can be recorded. Linux's input helper filters plain typing out before
 * it reaches the engine, so Linux cannot record it yet. Elsewhere the keys are read the same way
 * as keyboard shortcuts, so they need the same keyboard access.
 */
export function typingDetectionAvailability(
  platform: string,
  accessState: InteractionAccessViewState['state'],
): TypingDetectionAvailability {
  if (platform === 'linux') return 'unsupported-platform';
  if (accessState === 'checking') return 'checking';
  return accessState === 'available' ? 'available' : 'needs-keyboard-access';
}

export function useTypingDetection(platform: string, accessStatus: Ref<InteractionAccessViewState>) {
  const enabled = ref(false);
  const availability = computed(() => typingDetectionAvailability(platform, accessStatus.value.state));

  const hydrate = (preferences: PreferenceSettings) => {
    enabled.value = preferences.typingDetection?.enabled === true;
  };

  // Switching on is refused where it cannot work, so the switch never claims a setting the
  // recording would not honour. Switching off is always allowed.
  const setEnabled = async (value: boolean) => {
    if (value && availability.value !== 'available') return;
    enabled.value = value;
    await capture.updatePreferences({ typingDetection: { enabled: value } });
  };

  const recordingEnabled = computed(() => enabled.value && availability.value === 'available');

  return { enabled, availability, recordingEnabled, hydrate, setEnabled };
}
