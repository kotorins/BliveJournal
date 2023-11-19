<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NInputGroup, NInput, NButton, NList, NListItem, NGrid, NGi, NCard, NSpace, NBadge, useMessage } from 'naive-ui';

import { getConfig, updateConfig } from '@/utils/configs';
import { getRooms, addRoomid } from '@/utils/utils';
import type { RoomInfo, RoomMeta } from '@/utils/utils';
import type { DanmakuStats } from '@/utils/live-ws';

import RoomItem from '../components/RoomItem.vue';


const messager = useMessage();
const { t } = useI18n();

const props = defineProps<{
  compact: boolean,
}>();

const roomlist: Ref<(RoomInfo & RoomMeta)[] | null> = ref(null);
const roomLimit: Ref<number | null> = ref(null);
const roomStats: Ref<DanmakuStats | undefined> = ref(undefined);
const linkRoomid: Ref<number | undefined> = ref(undefined);
const showStat: Ref<'danmaku' | 'cmd' | undefined> = ref(undefined);
const link = ref('');


const parseRoomlink = (roomlink: string): number | undefined => {
  const match = /https:\/\/live\.bilibili\.com\/(?:blanc\/|h5\/)?(\d+)\/?(?:[?#]|$)/.exec(roomlink.toString());
  if (match) return Number(match[1]);
};
const isToomany = computed({
  get: () => Boolean(roomLimit.value && (roomlist.value || []).length >= roomLimit.value),
  set: () => { },
});
const roomlink = computed({
  get: () => link.value,
  set: (value) => {
    link.value = value;
    linkRoomid.value = parseRoomlink(value);
    if (!props.compact && value === 'whosyourdaddy') {
      link.value = '';
      updateConfig({ showAdvConfig: true }).then(() => {
        messager.info(t('configs.advConfigEnabled'));
      });
    }
  },
});
const statsTotal = computed({
  get() {
    if (!roomStats.value) return null;
    return {
      cmdTotal: Object.values(roomStats.value.cmdCount).reduce((a, b) => a + b, 0),
      danmakuTotal: Object.values(roomStats.value.danmakuCount).reduce((a, b) => a + b, 0),
    }
  },
  set() { },
});


const addRoom = async () => {
  if (linkRoomid.value) {
    await addRoomid(linkRoomid.value).catch(e => { messager.error(e.message); });
    await updateRooms();
  }
  roomlink.value = '';
};

const updateRooms = async () => {
  roomLimit.value = (await getConfig()).roomNumLimit;
  roomlist.value = await getRooms();
  roomStats.value = (await chrome.storage.local.get('danmakuStats')).danmakuStats;
};

setInterval(() => {
  updateRooms();
}, 10e3);
updateRooms();

</script>

<template>
  <div :style="{ maxWidth: '1200px', margin: 'auto' }">
    <n-space vertical size="small" :style="{ maxWidth: '550px', margin: 'auto' }">
      <n-input-group :style="{ flexWrap: compact ? 'wrap' : undefined }"
        :class="compact ? 'compact-link-input' : 'link-input'">
        <n-input v-model:value="roomlink" type="text" :size="$props.compact ? 'tiny' : 'medium'"
          placeholder="https://live.bilibili.com/xxx" clearable show-count
          :status="(roomlink && !linkRoomid) ? 'warning' : undefined"
          :disabled="Boolean(roomlist && roomLimit && roomlist.length >= roomLimit)">
          <template #count>{{ `${(roomlist || []).length}/${roomLimit}` }}</template>
        </n-input>
        <n-button type="primary" :ghost="compact" @click="addRoom" :disabled="!linkRoomid || isToomany"
          :size="$props.compact ? 'tiny' : 'medium'" name="add-room">
          {{ isToomany ? $t('roomlist.toomany') : !roomlink ? $t('roomlist.pasteHint') : linkRoomid ?
            $t('roomlist.addLink', { linkRoomid }) : $t('roomlist.invalidLink') }}
        </n-button>
      </n-input-group>
      <n-input-group v-if="!compact">
        <n-button quaternary size="tiny" @click="showStat = showStat === 'cmd' ? undefined : 'cmd'">
          <span :style="{ marginRight: '4px' }"> {{ $t('roomlist.cmdStats') }} </span>
          <n-badge :value="statsTotal?.cmdTotal || 0" show-zero color="grey" />
        </n-button>
        <n-button quaternary size="tiny" @click="showStat = showStat === 'danmaku' ? undefined : 'danmaku'">
          <span :style="{ marginRight: '4px' }"> {{ $t('roomlist.danmakuStats') }} </span>
          <n-badge :value="statsTotal?.danmakuTotal || 0" show-zero type="success" />
        </n-button>
      </n-input-group>
    </n-space>

    <span v-if="roomlist">
      <n-list v-if="$props.compact" size="small" class="compact-list">
        <n-list-item v-for="room in roomlist" :key="room.roomid">
          <RoomItem :room="room" :on-change="updateRooms" :compact="$props.compact" />
        </n-list-item>
      </n-list>
      <n-grid v-else cols="1 1000:2" x-gap="20" y-gap="8" class="roomlist-grid" :style="{ marginTop: '18px' }">
        <n-gi v-for="room in roomlist" :key="room.roomid">
          <n-card size="small">
            <RoomItem :room="room" :on-change="updateRooms" :show-stat="showStat" :stats="roomStats"
              :compact="$props.compact" />
          </n-card>
        </n-gi>
      </n-grid>
    </span>
  </div>
</template>

<style scoped lang="scss">
.compact-link-input {
  justify-content: flex-end;
}

.link-input {
  justify-content: center;

  .n-button {
    min-width: 120px;
  }
}

.compact-link-input {
  .n-button {
    min-width: 85px;
  }
}

.compact-list {
  margin-top: 4px;

  .n-list-item {
    padding-top: 9px;
    padding-bottom: 3px;
  }
}

.roomlist-grid {
  .n-card {
    margin: auto;
    max-width: 600px;
  }
}
</style>
