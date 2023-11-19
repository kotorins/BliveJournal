<script setup lang="ts">
import { ref } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import fileDownload from 'js-file-download';
import { NSpace, NList, NListItem, NSkeleton, NThing, NButton, NIcon, useMessage, type MessageReactive } from 'naive-ui';
import { MdTrash, MdRemoveCircle, IosArrowUp } from '@vicons/ionicons4';

import type { RoomMeta } from '@/utils/utils';
import { getRoomTimestamps, getDanmakuEntries, deleteRoomEntries } from '@/utils/database';
import type { RecordType, DanmakuData } from '@/utils/database';

import RecordEntryButton from './RecordEntryButton.vue';

const messager = useMessage();
const { t } = useI18n();

const props = defineProps<{
  roomid: number,
  type: RecordType,
  meta: Partial<RoomMeta>,
  showDelete: boolean,
}>();

const timestamps: Ref<number[] | null> = ref(null);
const collapsed: Ref<boolean> = ref(true);

const loadTimestamps = async (refresh?: boolean) => {
  if (refresh || !timestamps.value) {
    timestamps.value = Array.from(await getRoomTimestamps(props.roomid, props.type)).sort();
  }
};

const formatTimestamp = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '');
};
const getFilename = (timestamp: number) => {
  return `${props.roomid}-${(props.type === 'danmaku') ? '' : 'webpage-'}${formatTimestamp(timestamp)}.jsonl`;
};

const toJsonl = (entries: DanmakuData[]) => {
  return entries.map(i => `[${i.timestamp},${i.json}]`).join('\n');
};
const triggerDownload = async (timestamp: number) => {
  console.debug('generating download for', props.roomid, props.type, timestamp);
  const entries = await getDanmakuEntries(props.roomid, props.type, timestamp);
  console.debug('generating download with entries', entries.length);
  fileDownload(toJsonl(entries), getFilename(timestamp));
};

const delayedMsg = async (runner: () => Promise<any>, msg: string, delay?: number) => {
  let msgReactive: MessageReactive | null = null;
  const timeout = setTimeout(() => { msgReactive = messager.loading(msg, { duration: 0 }) }, delay || 500);
  await runner();
  clearTimeout(timeout);
  if (msgReactive) (msgReactive as MessageReactive).destroy();
};

const deleteRoom = async () => {
  console.debug('delete', props.roomid, props.type);
  if (timestamps.value) timestamps.value = [];
  await delayedMsg(() => deleteRoomEntries(props.roomid, props.type), t('recdata.deleting'));
}

const deleteSingleRecord = async (timestamp: number) => {
  console.debug('delete', props.roomid, props.type, timestamp);
  if (timestamps.value) timestamps.value = timestamps.value.filter(i => i !== timestamp);
  await delayedMsg(() => deleteRoomEntries(props.roomid, props.type, timestamp), t('recdata.deleting'));
};

const handleCollapse = async () => {
  collapsed.value = !collapsed.value;
  await loadTimestamps();
};
</script>

<template>
  <n-thing>
    <template #header>
      <n-space size="small">
        <n-button text @click="handleCollapse" class="header-uname">
          <template #icon>
            <n-icon :component="IosArrowUp" :class="collapsed ? 'header-icon collapsed' : 'header-icon expanded'" />
          </template>
          {{ (meta?.uname) ? `${meta.uname}` : `${roomid}` }}
        </n-button>
        <span v-if="meta?.uname" class="roomid">{{ roomid }}</span>
      </n-space>
    </template>
    <template v-if="showDelete" #header-extra>
      <NButton ghost type="error" size="small" @click="deleteRoom">
        <template #icon>
          <n-icon :component="MdTrash" />
        </template>
      </NButton>
    </template>
    <template v-if="!collapsed" #default>
      <n-skeleton v-if="!timestamps" :repeat="3" text />
      <n-list v-else hoverable :show-divider="false">
        <n-list-item v-for="timestamp in timestamps" :key="timestamp">
          <n-space>
            <n-button v-if="showDelete" type="error" ghost text @click="() => deleteSingleRecord(timestamp)"
              class="entry-delete-button">
              <template #icon>
                <n-icon :component="MdRemoveCircle" />
              </template>
            </n-button>
            <RecordEntryButton :on-click="() => triggerDownload(timestamp)" :filename="getFilename(timestamp)"
              :disabled="showDelete" />
          </n-space>
        </n-list-item>
      </n-list>
    </template>
  </n-thing>
</template>

<style scoped lang="scss">
.header-uname {
  font-size: 18px;

  .header-icon.expanded {
    transform: scaleY(-1);
  }
}

.roomid {
  padding-left: 4px;
  font-size: 12px;
  color: #999;
}

.entry-delete-button {
  vertical-align: text-bottom;
}

.n-thing {
  :deep(.n-thing-main__content) {
    margin-top: 0px;
  }
}

.n-list .n-list-item {
  padding: 8px 10px;
}
</style>