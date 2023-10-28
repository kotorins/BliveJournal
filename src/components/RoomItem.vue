<script setup lang="ts">
  import { loadRoomMeta, removeRoomid } from '@/utils/utils';
  import type { RoomInfo, RoomMeta } from '@/utils/utils';

  defineProps<{
    room: RoomInfo & RoomMeta,
  }>();
</script>

<template>
  <span>
    <a target="_blank" :href="`https://live.bilibili.com/${room.roomid}`">{{ room.uname || `Room: ${room.roomid}` }}</a>
    <br />
    <span :class="room.isLive? 'live' : 'offlive'">{{ room.title }}</span>
    <br />
    <button @click="loadRoomMeta(room.roomid)">Refresh</button>
    <button @click="removeRoomid(room.roomid)">Remove</button>
  </span>
</template>

<style scoped>
  .live {
    color: rgb(251, 114, 153);
  }
  .offlive {
    color: #6d757a;
  }
</style>