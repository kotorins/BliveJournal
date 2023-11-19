<script setup lang="ts">
import { NPopconfirm, NButton, NIcon } from 'naive-ui';
import type { Size, Type } from 'naive-ui/es/button/src/interface';
import { useI18n } from 'vue-i18n';
import { MdWarning } from '@vicons/ionicons4';

const { t } = useI18n();

defineProps<{
  buttonText: string,
  popText: string,
  onPositive: () => any,
  type?: Type,
  size?: Size,
}>();

</script>

<template>
  <n-popconfirm :positive-text="t('configs.confirmPositive')" :negative-text="t('configs.confirmNegative')"
    :on-positive-click="onPositive" :positive-button-props="{ type: type || 'warning' }">
    <template #icon>
      <n-icon v-if="type === 'error'" color="#de576d" :component="MdWarning" />
    </template>
    <template #trigger>
      <n-button class="confirm-button" :type="type || 'warning'" ghost :size="size">
        {{ buttonText }}
      </n-button>
    </template>
    {{ popText }}
  </n-popconfirm>
</template>

<style scoped lang="scss">
.confirm-button {
  color: #333639;

  :deep(.n-button__border) {
    border-color: #e0e0e6;
  }
}
</style>