<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import type { Ref } from 'vue';
import { getConfig } from '@/utils/configs';
import { getRooms, addRoomid } from '@/utils/utils';
import type { RoomInfo, RoomMeta } from '@/utils/utils';

import RoomItem from '../components/RoomItem.vue';

const parseRoomlink = (roomlink: string): number | undefined => {
  const match = /https:\/\/live\.bilibili\.com\/(?:blanc\/|h5\/)?(\d+)\/?(?:[?#]|$)/.exec(roomlink.toString());
  if (match) return Number(match[1]);
};

export default defineComponent({
  components: {
    RoomItem,
  },
  setup() {
    let roomlist: Ref<(RoomInfo & RoomMeta)[]> = ref([]);
    let roomLimit: Ref<number | null> = ref(null);
    let linkRoomid: Ref<number | undefined> = ref(undefined);
    let link = ref('');
    let roomlink = computed({
      get: () => link.value,
      set: (val) => {
        link.value = val;
        linkRoomid.value = parseRoomlink(val);
      },
    });
    const updateRooms = () => {
      getConfig().then(config => { roomLimit.value = config.roomNumLimit });
      getRooms().then((r: any) => { roomlist.value = r; })
    };
    chrome.storage.local.onChanged.addListener(changes => {
      if (changes.roomsInfo || changes.roomsMeta) updateRooms();
    })
    updateRooms();
    const addRoom = () => {
      linkRoomid.value && addRoomid(linkRoomid.value);
      roomlink.value = '';
    };

    return { roomlist, roomLimit, roomlink, linkRoomid, addRoom };
  },
})
</script>

<template>
  <div>
    <input v-model="roomlink" placeholder="https://live.bilibili.com/xxx" />
    <span v-if="!roomLimit || roomlist.length < roomLimit">
      <button @click="addRoom" :disabled="!linkRoomid" name="add-room" type="button">
        {{ roomlink ? (linkRoomid ? `Add ${linkRoomid}` : 'Invalid link') : 'paste link to add' }}
      </button>
    </span>
    <span v-else>
      Adding too many rooms will cause connections to become unstable
    </span>
  </div>
  <span>
    <p>{{ `${roomlist.length}/${roomLimit}` }}</p>
    <ul>
      <li v-for="room in roomlist" :key="room.roomid">
        <RoomItem :room="room" />
      </li>
    </ul>
  </span>
</template>
