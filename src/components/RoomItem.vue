<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import { NThing, NLayout, NLayoutContent, NLayoutSider, NSpace, NButton, NButtonGroup, NSwitch, NAvatar, NBadge, NImage, NIcon, useMessage } from 'naive-ui';
import { MdRefresh, MdTrash } from '@vicons/ionicons4';

import { fetchRoomMeta, removeRoomid } from '@/utils/utils';
import type { RoomInfo, RoomMeta } from '@/utils/utils';
import { getRoomConfig, updateRoomConfig } from '@/utils/configs';
import type { RoomConfig } from '@/utils/configs';
import type { DanmakuStats } from '@/utils/live-ws';

const messager = useMessage();

const props = defineProps<{
  room: RoomInfo & RoomMeta,
  onChange?: () => any,
  showStat?: 'danmaku' | 'cmd',
  stats?: DanmakuStats,
  compact?: boolean,
}>();

const badgeStats = computed({
  get() {
    if (props.stats && props.showStat) {
      if (props.showStat === 'danmaku') {
        return (props.stats.danmakuCount[props.room.roomid]) || 0;
      } else if (props.showStat === 'cmd') {
        return (props.stats.cmdCount[props.room.roomid]) || 0;
      }
    }
    return 0;
  },
  set() { },
})
const roomConfig: Ref<RoomConfig | null> = ref(null);
getRoomConfig(props.room.roomid).then(r => { roomConfig.value = r });

const saveConfig = async () => {
  if (roomConfig.value) {
    await updateRoomConfig(props.room.roomid, roomConfig.value);
    props.onChange && props.onChange();
  }
};

const removeRoom = async () => {
  await removeRoomid(props.room.roomid).catch(e => { messager.error(e.message) });
  props.onChange && props.onChange();
};
const refreshRoom = async () => {
  await fetchRoomMeta(props.room.roomid).catch(e => { messager.error(e.message) });
  props.onChange && props.onChange();
}

</script>

<template>
  <n-layout :has-sider="!compact" sider-placement="right">
    <n-layout-content>
      <n-thing>
        <template v-if="!compact" #avatar>
          <a target="_blank" :href="room.uid ? `https://space.bilibili.com/${room.uid}/` : 'javascript:void()'">
            <n-avatar round :size="36" :src="room.avatar" />
          </a>
        </template>
        <template v-if="!compact" #header>
          <a class="uname-large" target="_blank" :href="`https://live.bilibili.com/${room.roomid}`">
            {{ room.uname || `Room: ${room.roomid}` }}
          </a>
          <div class="roomid">
            <n-badge :value="badgeStats" :class="showStat || 'hide'" show-zero />
            <span>
              {{ (room.shortid === room.roomid) ? room.roomid : `${room.shortid} / ${room.roomid}` }}
            </span>
          </div>
        </template>
        <template v-if="!compact" #header-extra>
          <n-button @click="refreshRoom" size="small" :style="{ marginRight: '6px' }">
            <template #icon>
              <n-icon size="22" :component="MdRefresh" />
            </template>
          </n-button>
          <n-button @click="removeRoom" size="small" class="delete-button" type="error" ghost>
            <template #icon>
              <n-icon size="22" :component="MdTrash" />
            </template>
          </n-button>
        </template>
        <template #default>
          <span v-if="compact">
            <n-space justify="space-between" class="compact-title">
              <n-space size="small">
                <a target="_blank" :href="`https://live.bilibili.com/${room.roomid}`">
                  {{ room.uname || `Room: ${room.roomid}` }}
                </a>
                <span class="roomid">{{ room.shortid }}</span>
              </n-space>
              <n-button-group>
                <n-button @click="refreshRoom" size="tiny" ghost>
                  <n-icon size="18" :component="MdRefresh" />
                </n-button>
                <n-button @click="removeRoom" size="tiny" class="delete-button" type="error" ghost>
                  <n-icon size="18" :component="MdTrash" />
                </n-button>
              </n-button-group>
            </n-space>
          </span>
          <div :class="room.isLive ? 'live' : 'offlive'">{{ room.title }}</div>
        </template>
      </n-thing>
    </n-layout-content>
    <n-layout-sider width="180" :native-scrollbar="false">
      <n-space justify="end">
        <n-image v-if="!compact" :src="room.cover" width="160" object-fit="cover" />
      </n-space>
    </n-layout-sider>
  </n-layout>
  <n-space v-if="roomConfig && !compact" class="switches">
    <n-switch size="small" v-model:value="roomConfig.enableDanmaku" @update:value="saveConfig" />
    <span class="switch-label">{{ $t('roomitem.enableDanmaku') }}</span>
    <n-switch size="small" v-model:value="roomConfig.enableNotification" @update:value="saveConfig"
      :disabled="!roomConfig.enableDanmaku" />
    <span class="switch-label">{{ $t('roomitem.enableNotification') }}</span>
  </n-space>
</template>

<style scoped lang="scss">
.live {
  color: rgb(251, 114, 153);
}

.offlive {
  color: #6d757a;
}

a,
a:visited {
  color: #222;
  transition: color .15s cubic-bezier(.4, 0, .2, 1);
}

a:hover {
  color: #17a9d9;
}

a.uname-large {
  font-size: 18px;
  font-family: Arial, "Microsoft YaHei", "Microsoft Sans Serif", "Microsoft SanSerf", "微软雅黑", "Hiragino Sans GB", "WenQuanYi Micro Hei", Helvetica, sans-serif;
  text-decoration: none;
}

.roomid {
  font-size: 12px;
  line-height: 12px;
  color: #888;

  span, .n-badge {
    vertical-align: middle;
    vertical-align: -webkit-baseline-middle;
  }
  .n-badge {
    margin: -5px 0px;
    margin-right: 4px;
  }
  .n-badge.hide {
    display: none;
  }

  .n-badge.danmaku {
    --n-color: #18a058 !important;
  }

  .n-badge.cmd {
    --n-color: grey !important;
  }
}

.delete-button {
  color: #333639;

  :deep(.n-button__border) {
    border-color: #e0e0e6;
  }
}

.n-space.compact-title {
  margin-bottom: -3px;
}

.switches {
  .switch-label {
    vertical-align: text-top;
    margin-left: -5px;
  }

  .n-switch {
    vertical-align: middle;
  }
}

.n-thing {
  :deep(.n-thing-header) {
    min-height: 90%;
  }
}</style>