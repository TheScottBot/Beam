<script setup lang="ts">
import { computed } from 'vue';
import { Keyboard, Lock } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { normalizeZoomProjection, type ZoomElement } from '../zoom/zoom-types';

const props = defineProps<{
  zoom: ZoomElement;
  /** The zoom's scale, already formatted for its title. */
  level: string;
}>();

const { t } = useTranslate('TimelineTracks');

// A typing zoom keeps its keyboard mark once made manual, because that is where it came from;
// its label says what it does now, and only an automatic one follows the caret.
const isTyping = computed(() => props.zoom.trigger === 'typing');
const modeLabel = computed(() => {
  if (props.zoom.mode === 'manual') return t('zoomModeManual');
  return isTyping.value ? t('zoomModeTyping') : t('zoomModeAuto');
});
</script>

<template>
  <span class="zoom-clip-labels">
    <Lock v-if="zoom.locked" :size="12" :aria-label="t('locked')" />
    <span class="zoom-meta-badge zoom-projection-badge">
      {{ normalizeZoomProjection(zoom.projection) === '3d' ? '3D' : '2D' }}
    </span>
    <span class="clip-center-title zoom-title">
      {{ t('zoomTitle', { level }) }}
    </span>
    <span class="zoom-meta-badge zoom-mode-badge">
      <Keyboard v-if="isTyping" class="zoom-typing-icon" :size="8" aria-hidden="true" />
      {{ modeLabel }}
    </span>
  </span>
</template>

<style scoped src="./timeline-zoom-badges.css"></style>
