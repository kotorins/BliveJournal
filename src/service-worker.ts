/// <reference types="chrome-types"/>

import { RoomManager, RoomStatTracker } from "./utils/live-ws";
import { chromeVersion, randomNum, asyncSleep, runOnStart, runWorker } from "./utils/utils";
import { sanitizeData, filterData } from "./utils/filter-data";
import { commitDanmakuItems, archiveDanmaku, type RecordType, type DanmakuData } from "./utils/database";


const applyPersist = () => {
  if (chromeVersion >= 110) {
    const keepAliveByAPI = () => setInterval(chrome.runtime.getPlatformInfo, 20e3);
    runOnStart(keepAliveByAPI);
  }
  if (chromeVersion >= 109) {
    const createOffscreen = async () => {
      await chrome.offscreen.createDocument({
        url: 'keep-alive.html',
        reasons: ['BLOBS'],
        justification: 'keep service worker running',
      }).catch(e => {
        if (e.message !== 'Only a single offscreen document may be created.') {
          console.error(e);
        }
      });
    }
    self.onmessage = () => { };
    runOnStart(createOffscreen);
  }
};



const triggerArchiveWorker = runWorker(async () => {
  await asyncSleep(randomNum(10e3, 30e3));
  await archiveDanmaku();
}, 7200e3);


let danmakuBuffer: Record<RecordType, DanmakuData[]> = {
  danmaku: [],
  hookedDanmaku: []
};
runWorker(async () => {
  const buffered = danmakuBuffer;
  danmakuBuffer = { danmaku: [], hookedDanmaku: [] };
  await commitDanmakuItems(buffered);
  const bufferLength = Object.values(buffered).map(i => i.length).reduce((a, b) => a + b, 0);
  return (bufferLength < 20) ? 3000 : 1000
});


let countSaved = (roomid: number, cmd?: string) => { };
const saveDanmakuData = async (roomid: number, data: any, type?: RecordType) => {
  try {
    sanitizeData(data);
    const json = JSON.stringify(data);
    type = type || 'danmaku';
    if (await filterData(roomid, data, json, type)) {
      danmakuBuffer[type].push({ roomid, timestamp: Date.now(), json });
      countSaved(roomid, data.cmd);
    }
  } catch (e) {
    console.error(e, (e as Error).message);
  }
};


chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse: (x: any) => void) => {
    if (request.type === 'heartbeat') {
      sendResponse(null);
    } else if (request.type === 'danmaku') {
      sendResponse(null);
      saveDanmakuData(request.data.roomid, request.data.data, 'hookedDanmaku');
    } else if (request.type === 'trigger') {
      sendResponse(null);
      if (request.target === 'archive') triggerArchiveWorker();
    } else {
      sendResponse(null);
    }
    return undefined;
  }
);


let roomManager: RoomManager | null = null;
let statTracker: RoomStatTracker | null = null;
runOnStart(() => {
  roomManager = roomManager || new RoomManager(saveDanmakuData);
  statTracker = statTracker || new RoomStatTracker(roomManager);
  countSaved = (roomid: number, cmd?: string) => { statTracker!.countSaved(roomid, cmd); };
});

applyPersist();

