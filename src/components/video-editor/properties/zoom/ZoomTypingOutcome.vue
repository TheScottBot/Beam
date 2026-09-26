<script setup lang="ts">
import { Keyboard } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { TypingOutcomeNotice } from '~/components/video-editor/zoom/typing-outcome';

defineProps<{ notices: readonly TypingOutcomeNotice[] }>();

const { t } = useTranslate('ZoomPanel');
</script>

<template>
  <div v-if="notices.length" class="hint-card typing-outcome" role="status">
    <Keyboard :size="13" class="hint-icon" aria-hidden="true" />
    <span class="typing-outcome-sentences">
      <span v-for="notice in notices" :key="notice.key" class="typing-outcome-sentence">
        {{ 'params' in notice ? t(notice.key, notice.params) : t(notice.key) }}
      </span>
    </span>
  </div>
</template>

<style scoped src="./zoom-hint-card.css"></style>
<style scoped>
.typing-outcome-sentences {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
