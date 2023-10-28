<script setup lang="ts">
  import { ref } from 'vue';
  import type { Ref } from 'vue';
  import fileDownload from 'js-file-download';

  import type { RoomMeta } from '@/utils/utils';
  import { getRoomTimestamps, getDanmakuEntries, deleteRoomEntries } from '@/utils/database';
  import type { RecordType, DanmakuData } from '@/utils/database';

  const props = defineProps<{
    roomid: number,
    type: RecordType,
    meta: Partial<RoomMeta>,
    showDelete: boolean,
  }>();

  const timestamps: Ref<number[] | null> = ref(null);
  const collapsed: Ref<boolean> = ref(false);

  const loadTimestamps = (refresh?: boolean) => {
    if (refresh || !timestamps.value) getRoomTimestamps(props.roomid, props.type).then(v => {
      timestamps.value = Array.from(v).sort();
    });
  };
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).replace(/\//g, '');
  };
  const getFilename = (roomid: number, type: RecordType, timestamp: number) => {
    return `${roomid}-${(type === 'danmaku')? '' : 'webpage-'}${formatTimestamp(timestamp)}.jsonl`;
  }
  const toJsonl = (entries: DanmakuData[]) => {
    return entries.map(i => `[${i.timestamp},${i.json}]`).join('\n');
  }
  const triggerDownload = (roomid: number, type: RecordType, timestamp: number) => {
    console.debug('generating download for', roomid, type, timestamp);
    getDanmakuEntries(roomid, type, timestamp).then(entries => {
      console.debug('generating download with entries', entries.length);
      fileDownload(toJsonl(entries), getFilename(roomid, type, timestamp));
    }).catch(console.error);
  }

  const deleteRoomRecord = async (roomid: number, type: RecordType, timestamp: number) => {
    console.debug('delete', roomid, type, timestamp);
    await deleteRoomEntries(roomid, type, timestamp);
    loadTimestamps(true);
  };
</script>

<template>
  <span>
    <a v-on:click="collapsed = !collapsed; loadTimestamps()">{{ (meta?.uname)? `${meta.uname} (${roomid})` : `${roomid}` }}</a>
    <span v-if="collapsed">
      <br />
      <ul>
        <span v-if="timestamps">
          <li v-for="timestamp in (timestamps || [123])" :key="timestamp">
            <button v-show="showDelete" v-on:click="deleteRoomRecord(roomid, type, timestamp)">Delete</button>
            <a v-on:click="triggerDownload(roomid, type, timestamp)">{{ getFilename(roomid, type, timestamp) }}</a>
          </li>
        </span>
        <span v-else>Loading</span>
      </ul>
    </span>
  </span>
</template>

<style scoped>
</style>