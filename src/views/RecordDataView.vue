<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import type { Ref } from 'vue';
import { getRecordRooms, deleteRoomEntries } from '@/utils/database';
import type { RecordType } from '@/utils/database';
import { getRoomsMeta, loadRoomMeta } from '@/utils/utils';
import type { RoomsMeta } from '@/utils/utils';

import RoomRecord from '@/components/RoomRecord.vue';

export default defineComponent({
  components: {
    RoomRecord,
  },
  setup() {
    let roomsMeta: Ref<RoomsMeta> = ref({});
    let recordRooms: Ref<{ [type in RecordType]?: number[] }> = ref({});
    let shownType: Ref<RecordType> = ref('danmaku');
    const isHooked = computed({
      get() {
        return (shownType.value === 'hookedDanmaku');
      },
      set(v) {
        shownType.value = v ? 'hookedDanmaku' : 'danmaku';
        updateRecordRoomlist();
      }
    })

    const updateMeta = () => { getRoomsMeta().then((r) => { roomsMeta.value = r; }) };
    chrome.storage.local.onChanged.addListener(changes => {
      if (changes.roomsMeta) updateMeta();
    });
    updateMeta();

    const updateRecordRoomlist = (refresh?: boolean) => {
      if (refresh || !recordRooms.value[shownType.value]) getRecordRooms(shownType.value).then(async (r) => {
        const roomids = recordRooms.value[shownType.value] = Array.from(r).sort();
        for (const roomid of roomids) {
          if (!roomsMeta.value[roomid]?.uname) await loadRoomMeta(roomid);
        }
      });
    }
    updateRecordRoomlist();

    const deleteRoom = async (roomid: number, type: RecordType) => {
      console.debug('delete', roomid, type);
      await deleteRoomEntries(roomid, type);
      updateRecordRoomlist(true);
    };

    return { roomsMeta, recordRooms, shownType, isHooked, showDelete: ref(false), deleteRoom };
  },
})
</script>

<template>
  <div>
    <p>
      <input type="checkbox" name="type" v-model="isHooked" />
      <label for="type">Record from webpage</label>
    </p>
    <p>
      <input type="checkbox" name="show-delete" v-model="showDelete" />
      <label for="type">Show delete</label>
    </p>
  </div>
  <ul>
    <span v-for="recType in (Object.keys(recordRooms) as RecordType[])" :key="recType" v-show="recType === shownType">
      <li v-for="roomid in recordRooms[recType]" :key="`${recType}:${roomid}`">
        <button v-show="showDelete" v-on:click="deleteRoom(roomid, recType)">Delete</button>
        <RoomRecord :roomid="roomid" :meta="roomsMeta[roomid]" :type="recType" :show-delete="showDelete" />
      </li>
    </span>
    <span v-if="!(shownType in recordRooms)">Loading</span>
  </ul>
</template>
