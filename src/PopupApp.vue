<script setup lang="ts">
import { ref } from 'vue';
import { NCard, NAlert, NSpace, NButton, NIcon, NMessageProvider } from 'naive-ui';
import { ExternalLink } from '@vicons/tabler';

import RoomsView from './views/RoomsView.vue';

const disconnectCount = ref(0);
chrome.storage.local.get('disconnectCount').then(storage => {
  disconnectCount.value = storage.disconnectCount || 0;
});
</script>

<template>
  <n-message-provider>
    <n-card size="small" :bordered="false" class="body">
      <n-space justify="center">
        <n-button type="primary" ghost size="small" tag="a" href="index.html" target="_blank" class="option-button">
          {{ $t('pages.more') }}
          <n-icon :component="ExternalLink" />
        </n-button>
      </n-space>
      <n-alert v-if="disconnectCount" :type="(disconnectCount > 3) ? 'error' : 'warning'" :show-icon="false">
        {{ $t('pages.disconnectWarn', { count: disconnectCount }) }}
      </n-alert>
      <RoomsView :compact="true" />
    </n-card>
  </n-message-provider>
</template>

<style scoped lang="scss">
.body {
  max-height: 600px;
  overflow: auto;
}

.n-alert {
  margin-top: 3px;
  margin-bottom: 6px;

  :deep(.n-alert-body) {
    padding: 5px 15px;
  }
}

.option-button {
  margin-bottom: 3px;
}
</style>