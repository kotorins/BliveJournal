/// <reference types="chrome-types"/>

import { RoomManager } from "./utils/live-ws";
import { runOnStart, applyPersist, saveDanmakuData, updateDisconnect } from "./utils/utils";

chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse: (x: any) => void) => {
    if (request.type === 'heartbeat') {
      sendResponse(null);
    } else if (request.type === 'danmaku') {
      sendResponse(null);
      saveDanmakuData(request.data.roomid, request.data.data, 'hookedDanmaku');
    } else {
      sendResponse(null);
    }
    return undefined;
  }
);


let roomManager: RoomManager | null = null;

const loadRoomManager = () => {
  roomManager = roomManager || new RoomManager();
  setInterval(() => { updateDisconnect(false); }, 20e3);
};
runOnStart(loadRoomManager);
applyPersist();

