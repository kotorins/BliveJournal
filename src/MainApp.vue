<script setup lang="ts">
import { ref, computed } from 'vue';
import { NCard, NTabs, NTabPane, NMessageProvider } from 'naive-ui';

import RoomsView from '@/views/RoomsView.vue';
import RecordDataView from '@/views/RecordDataView.vue';
import ConfigView from '@/views/ConfigView.vue';

const validKeys = [
  'rooms',
  'records',
  'configs',
];
const keyFromHash = () => {
  const hashName = (/^#([a-z]+)/.exec(location.hash) || ['', ''])[1];
  if (validKeys.includes(hashName)) return hashName;
};

const tabKey = ref(keyFromHash() || 'rooms');
const proxiedKey = computed({
  get: () => tabKey.value,
  set: (value: string) => {
    tabKey.value = value;
    const newUrl = new URL(location.href);
    newUrl.hash = value;
    location.replace(newUrl);
  }
});

</script>

<template>
  <n-message-provider>
    <n-card :bordered="false" :style="{ maxWidth: '1300px', margin: 'auto', paddingTop: '20px' }">
      <n-tabs justify-content="space-evenly" type="line" size="large" v-model:value="proxiedKey">
        <n-tab-pane name="rooms" :tab="$t('pages.rooms')" display-directive="if">
          <RoomsView :compact="false" />
        </n-tab-pane>
        <n-tab-pane name="records" :tab="$t('pages.records')" display-directive="show">
          <RecordDataView />
        </n-tab-pane>
        <n-tab-pane name="configs" :tab="$t('pages.configs')" display-directive="if">
          <ConfigView />
        </n-tab-pane>
      </n-tabs>
    </n-card>
  </n-message-provider>
</template>

