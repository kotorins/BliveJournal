<script setup lang="ts">
import { ref } from 'vue';
import type { Ref } from 'vue';

import { NTabs, NTabPane, NGrid, NGridItem, NCard, NSkeleton, NButton } from 'naive-ui';

import { recordTypes, getRecordRooms } from '@/utils/database';
import type { RecordType } from '@/utils/database';
import { getRoomsMeta, fetchRoomMeta } from '@/utils/utils';
import type { RoomsMeta } from '@/utils/utils';

import RoomRecord from '@/components/RoomRecord.vue';

const roomsMeta: Ref<RoomsMeta> = ref({});
const recordRooms: Ref<{ [type in RecordType]?: number[] }> = ref({});
const showDelete = ref(false);


const loadRoomsMeta = async () => {
  roomsMeta.value = await getRoomsMeta();
};
const loadRecordRooms = async (type: RecordType) => {
  await loadRoomsMeta();
  const roomids = Array.from(await getRecordRooms(type)).sort();
  recordRooms.value[type] = roomids;
  for (const roomid of roomids) {
    if (!roomsMeta.value[roomid]?.uname) {
      await fetchRoomMeta(roomid);
      await loadRoomsMeta();
    }
  }
};

(async () => {
  for (const type of recordTypes) {
    await loadRecordRooms(type);
  }
})();

</script>

<template>
  <n-tabs type="bar" size="small" class="body">
    <n-tab-pane v-for="recType in recordTypes" :key="recType" display-directive="show" :name="recType"
      :tab="$t(`recdata.${recType}Tab`)">
      <n-skeleton v-if="!(recType in recordRooms)" :repeat="3" text />
      <n-grid v-else x-gap="12" y-gap="8" cols="1 800:2 1200:3">
        <n-grid-item v-for="roomid in recordRooms[recType]" :key="`${recType}:${roomid}`">
          <n-card size="small" class="room-record">
            <RoomRecord :roomid="roomid" :meta="roomsMeta[roomid]" :type="recType" :show-delete="showDelete" />
          </n-card>
        </n-grid-item>
      </n-grid>
    </n-tab-pane>
    <template #suffix>
      <n-button type="error" :ghost="!showDelete" @click="showDelete = !showDelete"
        :class="showDelete ? '' : 'show-delete-idle'">
        {{ $t('recdata.showDelete') }}
      </n-button>
    </template>
  </n-tabs>
</template>

<style scoped lang="scss">
.body {
  padding: 10px 20px;
}

.room-record {
  max-width: 450px;
  margin: auto;
}

.show-delete-idle {
  color: #333639;

  :deep(.n-button__border) {
    border-color: #e0e0e6;
  }
}
</style>