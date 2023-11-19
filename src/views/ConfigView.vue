<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NForm, NFormItem, NButton, NInputNumber, NDynamicInput, NDynamicTags, NCard, NDivider, NSpace, useMessage } from 'naive-ui';
import type { FormRules, FormItemRule, FormInst, FormValidationError } from 'naive-ui';

import { getConfig, updateConfig, resetConfig, getUploadEndpoints, setUploadEndpoints, getCmdFilterSet, setCmdFilter, resetCmdFilter } from '@/utils/configs';
import type { Config } from '@/utils/configs';
import { resetUploadSuccess } from '@/utils/database';

import PopconfirmButton from '@/components/PopconfirmButton.vue';

const messager = useMessage();
const { t } = useI18n();

type FormConfig = {
  config: Config,
  uploadEndpoints: string[],
  ignoreCMDs: string[],
  dedupCMDs: string[],
};

const formRef: Ref<FormInst | null> = ref(null);

const formConfig: Ref<FormConfig | null> = ref(null);
const loadedConfigJson: Ref<string | null> = ref(null);

const dbUsage: Ref<number | null> = ref(null);

const loadFormConfig = async (keys?: (keyof FormConfig)[]) => {
  keys = keys || ['config', 'ignoreCMDs', 'dedupCMDs'];
  const current: FormConfig = {
    config: await getConfig(true),
    uploadEndpoints: (await getUploadEndpoints()).map(i => i.toString()),
    ignoreCMDs: Array.from(await getCmdFilterSet('ignore')).sort(),
    dedupCMDs: Array.from(await getCmdFilterSet('dedup')).sort(),
  };
  formConfig.value = { ...current, ...formConfig.value, };
  loadedConfigJson.value = JSON.stringify(current);
  for (const key of keys) formConfig.value[key] = current[key] as any;
  formConfig.value.config.showAdvConfig = current.config.showAdvConfig;
}

const saveFormConfig = async () => {
  if (formConfig.value && formRef.value) {
    try {
      await formRef.value.validate()
    } catch (e) {
      console.warn('invalid config form', e as FormValidationError);
      messager.error(t('configs.invalidForm'));
      return;
    }
    await updateConfig(formConfig.value.config);
    formConfig.value.uploadEndpoints = formConfig.value.uploadEndpoints.map(i => (/^https?:\/\//.test(i))? i : `http://${i}`);
    await setUploadEndpoints(formConfig.value.uploadEndpoints);
    await setCmdFilter('ignore', formConfig.value.ignoreCMDs);
    await setCmdFilter('dedup', formConfig.value.dedupCMDs);
  }
  await loadFormConfig();
};

const resetAllConfig = async () => {
  await resetConfig();
  await resetCmdFilter('ignore');
  await resetCmdFilter('dedup');
  await loadFormConfig();
  messager.info(t('configs.resetConfigDone'));
};
const resetIgnoreCMDs = async () => {
  await resetCmdFilter('ignore');
  await loadFormConfig(['ignoreCMDs']);
  messager.info(t('configs.resetIgnoreDone'));
};
const resetDedupCMDs = async () => {
  await resetCmdFilter('dedup');
  await loadFormConfig(['dedupCMDs']);
  messager.info(t('configs.resetDedupDone'));
};
const resetUpload = async () => {
  await resetUploadSuccess();
  messager.info(t('configs.resetUploadDone'));
};

const hideAdvConfig = async () => {
  await updateConfig({ showAdvConfig: false });
  await loadFormConfig([]);
  messager.info(t('configs.advConfigDisabled'))
};

const triggerArchive = async () => {
  await chrome.runtime.sendMessage({ type: 'trigger', target: 'archive'});
}

const formChanged = computed({
  get() {
    if (formConfig.value && loadedConfigJson.value) {
      return JSON.stringify(formConfig.value) !== loadedConfigJson.value;
    }
    return false;
  },
  set() { },
});


const numRule: FormItemRule = {
  type: 'number',
  required: true,
  trigger: ['blur', 'change'],
  message: t('configs.required'),
}

const validateRules: FormRules = {
  config: {
    archiveKeepDays: numRule,
    webArchiveKeepDays: numRule,
    roomNumLimit: numRule,
  }
}


loadFormConfig();
navigator.storage.estimate().then(r => {
  dbUsage.value = (r as { usageDetails?: { indexedDB?: number } }).usageDetails?.indexedDB || r.usage || null;
});

</script>

<template>
  <div class="body" v-if="formConfig">
    <n-form ref="formRef" :model="formConfig" :rules="validateRules" :show-require-mark="false" label-placement="left"
      label-width="auto">
      <n-space>
        <n-button @click="saveFormConfig" :type="formChanged ? 'primary' : undefined">
          {{ $t('configs.save') }}
        </n-button>
        <PopconfirmButton type="error" :button-text="t('configs.resetConfig')" :pop-text="t('configs.confirmResetConfig')"
          :on-positive="resetAllConfig" />
      </n-space>
      <n-divider />
      <n-form-item :label="$t('configs.keepDays')" path="config.archiveKeepDays">
        <n-input-number v-model:value="formConfig.config.archiveKeepDays" :min="1" :precision="0" />
      </n-form-item>
      <n-form-item :label="$t('configs.webKeepDays')" path="config.webArchiveKeepDays">
        <n-input-number v-model:value="formConfig.config.webArchiveKeepDays" :min="1" :precision="0" />
      </n-form-item>

      <div v-if="dbUsage" class="usage-stats">
        {{ $t('configs.dbUsage', { usageMB: Math.round(dbUsage / 1024 / 1024) }) }}
      </div>

      <n-divider />
      <n-form-item size="small">
        <n-space>
          <PopconfirmButton size="small" :button-text="t('configs.resetIgnore')"
            :pop-text="t('configs.confirmResetIgnore')" :on-positive="resetIgnoreCMDs" />
          <PopconfirmButton size="small" :button-text="t('configs.resetDedup')" :pop-text="t('configs.confirmResetDedup')"
            :on-positive="resetDedupCMDs" />
        </n-space>
      </n-form-item>
      <n-form-item :label="$t('configs.ignoreCMDs')" path="ignoreCMDs">
        <n-card size="small">
          <n-dynamic-tags size="small" v-model:value="formConfig.ignoreCMDs" />
        </n-card>
      </n-form-item>
      <n-form-item :label="$t('configs.dedupCMDs')" path="dedupCMDs">
        <n-card size="small">
          <n-dynamic-tags size="small" v-model:value="formConfig.dedupCMDs" />
        </n-card>
      </n-form-item>

      <n-divider />
      <n-form-item size="small">
        <n-space>
          <n-button size="small" @click="triggerArchive">{{ $t('configs.triggerArchive') }}</n-button>
          <PopconfirmButton size="small" :button-text="t('configs.resetUpload')" :pop-text="t('configs.confirmResetUpload')"
            :on-positive="resetUpload" />
        </n-space>
      </n-form-item>
      <n-form-item :label="$t('configs.uploadEndpoints')" path="uploadEndpoints">
        <n-dynamic-input v-model:value="formConfig.uploadEndpoints" placeholder="https://..."/>
      </n-form-item>

      <span v-if="formConfig.config.showAdvConfig">
        <n-divider />
        <n-form-item size="small">
          <n-button size="small" @click="hideAdvConfig">{{ $t('configs.hideAdvConfig') }}</n-button>
        </n-form-item>
        <n-form-item :label="$t('configs.roomNumLimit')" path="config.roomNumLimit">
          <n-input-number v-model:value="formConfig.config.roomNumLimit" :min="1" :precision="0" />
        </n-form-item>
        <n-form-item :label="$t('configs.fetchTimeout')" path="config.fetchTimeout">
          <n-input-number v-model:value="formConfig.config.fetchTimeout" :min="3" :max="25" :precision="0" />
        </n-form-item>
        <n-form-item :label="$t('configs.uploadSliceSize')" path="config.uploadSliceSize">
          <n-input-number v-model:value="formConfig.config.uploadSliceSize" :min="100" :precision="0" />
        </n-form-item>
      </span>
    </n-form>
  </div>
</template>

<style scoped>
.body {
  max-width: 800px;
  margin: auto;
}

.usage-stats {
  margin-bottom: 4px;
}

.n-divider {
  margin-top: 10px;
}

.n-dynamic-tags {
  font-family: Consolas, monospace;
}
</style>