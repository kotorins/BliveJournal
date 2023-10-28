/// <reference types="chrome-types"/>
/// <reference types="./browsers.d.ts" />

import { getCmd, sanitizeData, filterData } from "./filter-data";
import { commitDanmakuItems, commitRoomMeta, archiveDanmaku } from './database';
import type { DanmakuStoreKeys, DanmakuData } from './database';

const chromeVersion = Number((navigator.userAgent.match(/Chrome\/(\d+)/) || [0, 0])[1]);
const objNumKeys = (obj: object) => Object.keys(obj).map(key => Number(key)).filter(key => !Number.isNaN(key));
const randomElement = <T>(array: T[]): T => array[Math.floor(Math.random() * array.length)];
const randomNum = (min: number, max: number) => min + (max - min) * Math.random();

const getDefault = <Key extends keyof any, Value>(obj: { [key in Key]: Value }, key: Key, defaultValue: Value) => {
  if (!(key in obj)) obj[key] = defaultValue;
  return obj[key];
};
const timestampDayFloor = (timestamp?: number, days?: number) => {
  const dayCount = Math.floor(((timestamp || Date.now()) + 28800e3) / 86400e3);
  return (dayCount - (days || 0)) * 86400e3 - 28800e3;
};


const gzipJson = async (json: string, method?: CompressionFormat | undefined): Promise<Blob> => {
  const jsonBlob = new Blob([json], { type: "application/json" });
  return await new Response(jsonBlob.stream().pipeThrough(new CompressionStream(method || 'gzip'))).blob();
};
const gzipObj = async (obj: object, method?: CompressionFormat | undefined): Promise<Blob> => {
  return await gzipJson(JSON.stringify(obj), method);
};
const unzipJson = async (gzipped: Blob, method?: CompressionFormat | undefined): Promise<string> => {
  return await new Response(gzipped.stream().pipeThrough(new DecompressionStream(method || 'gzip'))).text();
};
const unzipObj = async (gzipped: Blob, method?: CompressionFormat | undefined): Promise<any> => {
  return JSON.parse(await unzipJson(gzipped, method));
};

const asyncSleep = async (sleep: number) => new Promise(r => setTimeout(r, sleep));
const runOnStart = (func: () => void) => {
  chrome.runtime.onStartup.addListener(func);
  func();
};
const runWorker = (func: () => void | number | Promise<void | number>, timeout?: number) => {
  let workerPromise: Promise<void> | null = null;
  const startWorker = () => {
    if (!workerPromise) workerPromise = (async () => {
      for (; ;) {
        try {
          let returnedTimeout = func();
          returnedTimeout = (returnedTimeout instanceof Promise) ? (await returnedTimeout) : returnedTimeout;
          await asyncSleep(returnedTimeout || timeout || 3e3);
        } catch (e) {
          console.error(e);
          await asyncSleep(Math.max(timeout || 0, 300e3));
        }
      }
    })();
  }
  runOnStart(startWorker);
};


runWorker(async () => { await asyncSleep(randomNum(10e3, 30e3)); await archiveDanmaku(); }, 7200e3);

let danmakuBuffer: { [key in DanmakuStoreKeys]: DanmakuData[] } = {
  danmaku: [],
  hookedDanmaku: []
};
runWorker(() => {
  const buffered = danmakuBuffer;
  danmakuBuffer = { danmaku: [], hookedDanmaku: [] };
  commitDanmakuItems(buffered);
  const bufferLength = Object.values(buffered).map(i => i.length).reduce((a, b) => a + b, 0);
  return (bufferLength < 20) ? 3000 : 1000
});


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
      }).catch(console.error);
    }
    self.onmessage = () => { };
    runOnStart(createOffscreen);
  }
};


const saveDanmakuData = (roomid: number, data: any, storeName?: DanmakuStoreKeys) => {
  try {
    sanitizeData(data);
    const json = JSON.stringify(data);
    storeName = storeName || 'danmaku';
    if (filterData(roomid, getCmd(data), json, storeName)) {
      danmakuBuffer[storeName].push({ roomid, timestamp: Date.now(), json });
    }
  } catch (e) {
    console.error(e);
  }
};
const saveRoomMeta = (roomid: number, data: any) => {
  gzipObj(data).then(gzipped => {
    commitRoomMeta({ roomid, timestamp: Date.now(), gzipped });
  }).catch(console.error);
};


export type RoomInfo = {
  roomid: number,
  shortid: number,
  uid: number,
};

export type RoomsInfo = {
  [key: number]: RoomInfo,
};

const addRoomid = async (roomid: number) => {
  const roomsInfo: RoomsInfo = (await chrome.storage.local.get()).roomsInfo || {};
  try {
    if (Object.values(roomsInfo).filter(i => i.roomid === roomid || i.shortid === roomid).length) {
      console.warn(`roomid ${roomid} already added`);
      return;
    }
    const r = await fetch(`https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${roomid}&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&dolby=5&panorama=1`).then(r => r.json());
    if (r.code === 0) {
      const roominfo: RoomInfo = {
        roomid: r.data.room_id,
        shortid: r.data.short_id || r.data.room_id,
        uid: r.data.uid,
      };
      roomsInfo[roominfo.roomid] = roominfo;
      await chrome.storage.local.set({ roomsInfo });
      loadRoomMeta(roominfo.roomid);
      return roomsInfo;
    } else {
      console.error(r.message);
      return { error: r.message };
    }
  } catch (e) {
    console.error(e);
    return { error: e };
  }
};

const removeRoomid = async (roomid: number) => {
  const roomsInfo: RoomsInfo = (await chrome.storage.local.get()).roomsInfo || {};
  try {
    if (!roomsInfo[roomid]) console.warn(`roomid ${roomid} is not added`);
    delete roomsInfo[roomid];
    await chrome.storage.local.set({ roomsInfo });
    return roomsInfo;
  } catch (e) {
    console.error(e);
    return { error: e };
  }
};

export type RoomMeta = {
  uname: string,
  title: string,
  area: string,
  cover: string,
  avatar: string,
  lastFetch: number,
  isLive: boolean,
};

export type RoomsMeta = {
  [key: number]: RoomMeta,
};

const getRoomsMeta = async () => {
  const roomsMeta: RoomsMeta = (await chrome.storage.local.get()).roomsMeta || {};
  return roomsMeta;
};

const updateRoomMeta = async (roomid: number, update: Partial<RoomMeta>) => {
  const roomsMeta = await getRoomsMeta();
  roomsMeta[roomid] = { ...(roomsMeta[roomid] || {}), ...update };
  await chrome.storage.local.set({ roomsMeta });
};

const loadRoomMeta = async (roomid: number) => {
  try {
    const r = await fetch(
      `https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${roomid}`).then(r => r.json());
    if (r.code === 0) {
      const roominfo = r.data.room_info;
      saveRoomMeta(roomid, r.data);
      const roomMeta: RoomMeta = {
        uname: r.data.anchor_info.base_info.uname,
        title: roominfo.title,
        area: roominfo.area_name,
        cover: roominfo.cover,
        avatar: r.data.anchor_info.base_info.face,
        lastFetch: Date.now(),
        isLive: roominfo.live_status === 1,
      };
      updateRoomMeta(roomid, roomMeta);
      return roomMeta;
    } else {
      console.error(r.message);
      return { error: r.message };
    }
  } catch (e) {
    console.error(e);
    return { error: e };
  }
};


let disconnects: number[] = [];
const updateDisconnect = (disconnected: boolean) => {
  if (disconnected) disconnects.push(Date.now());
  disconnects = disconnects.filter(i => i > Date.now() - 60e3);
  chrome.action.setBadgeText({ text: disconnects.length ? disconnects.length.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: (disconnects.length > 3) ? [238, 49, 49, 255] : [240, 173, 78, 200] });
};


const getRooms = async () => {
  const storage = await chrome.storage.local.get(['roomsInfo', 'roomsMeta']);
  const roomsInfo: RoomsInfo = storage.roomsInfo || {};
  const roomsMeta: RoomsMeta = storage.roomsMeta || {};
  return objNumKeys(roomsInfo).map(roomid => ({ ...roomsInfo[roomid], ...roomsMeta[roomid] }));
};


export {
  chromeVersion,
  objNumKeys,
  randomElement,
  getDefault,
  timestampDayFloor,
  gzipObj,
  unzipObj,
  asyncSleep,
  runOnStart,
  applyPersist,
  addRoomid,
  removeRoomid,
  getRooms,
  saveDanmakuData,
  updateDisconnect,
  getRoomsMeta,
  updateRoomMeta,
  loadRoomMeta,
};
