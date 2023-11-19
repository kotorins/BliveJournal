/// <reference types="chrome-types"/>
/// <reference types="./browsers.d.ts" />

import { getConfig } from './configs';
import { commitRoomMeta } from './database';

const chromeVersion = Number((navigator.userAgent.match(/Chrome\/(\d+)/) || [0, 0])[1]);
const objNumKeys = (obj: { [key: number]: any }) => Object.keys(obj).map(key => Number(key)).filter(key => !Number.isNaN(key));
const randomElement = <T>(array: T[]): T => array[Math.floor(Math.random() * array.length)];
const randomNum = (min: number, max: number) => min + (max - min) * Math.random();

const objKeys = <T extends { [key: string]: any }>(obj: T): (keyof T)[] => {
  const keys: (keyof T)[] = [];
  for (const key in obj) {
    if (key in obj) keys.push(key);
  }
  return keys;
};


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
const blobToBase64 = async (data: Blob): Promise<string> => {
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      reject(reader.error);
    }
    reader.readAsDataURL(data);
  });
};

const asyncSleep = (sleep: number): Promise<void> => new Promise(r => setTimeout(r, sleep));
const runOnStart = (func: () => void) => {
  chrome.runtime.onStartup.addListener(func);
  func();
};

const runWorker = (func: () => void | number | Promise<void | number>, timeout?: number) => {
  let workerPromise: Promise<void> | null = null;
  let interrput: () => void = () => { };
  const interruptableSleep = (sleep: number) => new Promise((resolve) => {
    const id = setTimeout(resolve, sleep);
    interrput = () => {
      clearTimeout(id);
      resolve(null);
    };
  })
  const startWorker = () => {
    if (!workerPromise) workerPromise = (async () => {
      for (; ;) {
        try {
          let returnedTimeout = func();
          returnedTimeout = (returnedTimeout instanceof Promise) ? (await returnedTimeout) : returnedTimeout;
          await interruptableSleep(returnedTimeout || timeout || 3e3);
        } catch (e) {
          console.error(e);
          await interruptableSleep(Math.max(timeout || 0, 300e3));
        }
      }
    })();
  }
  runOnStart(startWorker);
  return () => { interrput(); };
};


const timedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const timeoutSec = Math.min(25, ((await getConfig()).fetchTimeout || 25));
  return await fetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutSec * 1000),
  });
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
  if (Object.values(roomsInfo).filter(i => i.roomid === roomid || i.shortid === roomid).length) {
    console.warn(`roomid ${roomid} already added`);
    throw new Error(`roomid ${roomid} already added`);
  }
  const r = await timedFetch(`https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${roomid}&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&dolby=5&panorama=1`).then(r => r.json());
  if (r.code === 0) {
    const roominfo: RoomInfo = {
      roomid: r.data.room_id,
      shortid: r.data.short_id || r.data.room_id,
      uid: r.data.uid,
    };
    roomsInfo[roominfo.roomid] = roominfo;
    await chrome.storage.local.set({ roomsInfo });
    fetchRoomMeta(roominfo.roomid);
    return roomsInfo;
  } else {
    console.error(r.message);
    throw new Error(r.message);
  }
};

const removeRoomid = async (roomid: number) => {
  const roomsInfo: RoomsInfo = (await chrome.storage.local.get()).roomsInfo || {};
  if (!roomsInfo[roomid]) console.warn(`roomid ${roomid} is not added`);
  delete roomsInfo[roomid];
  await chrome.storage.local.set({ roomsInfo });
  return roomsInfo;
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

const fetchRoomMeta = async (roomid: number) => {
  const r = await timedFetch(
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
    throw new Error(r.message);
  }
};


let disconnects: number[] = [];
const updateDisconnect = (disconnected: boolean) => {
  if (disconnected) disconnects.push(Date.now());
  disconnects = disconnects.filter(i => i > Date.now() - 60e3);
  chrome.action.setBadgeText({ text: disconnects.length ? disconnects.length.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: (disconnects.length > 3) ? [238, 49, 49, 255] : [240, 173, 78, 200] });
  chrome.storage.local.set({ disconnectCount: disconnects.length });
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
  randomNum,
  objKeys,
  getDefault,
  timestampDayFloor,
  gzipObj,
  unzipObj,
  blobToBase64,
  asyncSleep,
  runOnStart,
  timedFetch,
  runWorker,
  addRoomid,
  removeRoomid,
  getRooms,
  updateDisconnect,
  getRoomsMeta,
  updateRoomMeta,
  fetchRoomMeta,
};
