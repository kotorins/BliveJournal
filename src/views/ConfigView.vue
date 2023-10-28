<script setup lang="ts">
import { ref } from 'vue';
import type { Ref } from 'vue';

import { getConfig, updateConfig } from '../utils/configs';
import type { Config } from '../utils/configs';

const config: Ref<Config | null> = ref(null);
getConfig().then(r => { config.value = r; });

const saveConfig = () => {
  if (config.value) updateConfig(config.value).then(() => {
    getConfig().then(r => { console.debug('config updated', r) });
  });
}

</script>

<template>
  <span>
    <button v-on:click="saveConfig">Save</button>
  </span>
  <span v-if="config">
    <p>
      <label for="archive-days">Days to keep danmaku archive</label>
      <input type="number" name="archive-days" v-model="config.archiveKeepDays" />
    </p>
    <p>
      <label for="webarchive-days">Days to keep danmaku archive from webpage</label>
      <input type="number" name="webarchive-days" v-model="config.webArchiveKeepDays" />
    </p>
  </span>
</template>
