<script setup lang="ts">
import { ref } from 'vue';
import { NSpace, NButton, NIcon, NSpin, useMessage } from 'naive-ui';
import { MdDownload } from '@vicons/ionicons4';


const props = defineProps<{
  onClick: () => Promise<void>,
  filename: string,
  disabled?: boolean,
}>();

const messager = useMessage();
const loading = ref(false);

const handleDonwload = async () => {
  loading.value = true;
  try {
    await props.onClick();
  } catch (e) {
    messager.error((e as any).toString());
  }
  loading.value = false;
}

</script>

<template>
  <n-spin :show="loading" size="small">
    <n-button text @click="handleDonwload" :disabled="loading || disabled">
      <n-space size="small">
        <span>
          {{ filename }}
        </span>
        <n-icon :component="MdDownload" />
      </n-space>
    </n-button>
  </n-spin>
</template>