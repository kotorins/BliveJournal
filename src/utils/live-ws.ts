/// <reference types="chrome-types"/>
import { LiveWS } from "bilibili-live-ws/browser";

import { randomElement, objNumKeys, blobToBase64, timedFetch, updateDisconnect, fetchRoomMeta, updateRoomMeta, getRoomsMeta } from "./utils";
import type { RoomsInfo, RoomMeta } from "./utils";
import { getRoomConfig } from "./configs";
import type { RecordType } from "./database";

export type SaveDanmakuData = (roomid: number, data: any, type?: RecordType) => Promise<void>

const getUid = async (): Promise<number> => {
  const uid_cookie = await chrome.cookies.get({ name: "DedeUserID", url: "https://bilibili.com" });
  if (uid_cookie) return Number(uid_cookie.value);
  const r = await timedFetch('https://api.bilibili.com/x/web-interface/nav').then(r => r.json());
  return Number(r.data?.mid || 0);
}

const getBuvid = async (): Promise<string> => {
  const buvid_cookie = await chrome.cookies.get({ name: "buvid3", url: "https://bilibili.com" });
  return buvid_cookie?.value || '';
}

const getHandshakeInfo = async (roomid: number) => {
  const r = await timedFetch(`https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id=${roomid}&type=0`).then(r => r.json());
  return {
    uid: await getUid(),
    buvid: await getBuvid(),
    key: r.data.token,
    address: (i => `wss://${i.host}:${i.wss_port}/sub`)(randomElement(r.data.host_list)),
  }
}

const liveNotifies: { [roomid: number]: { id: string, listener: (id: string) => void } } = {};
const lastLiveNofifies: { [roomid: number]: number } = {};
const clearNotification = async (roomid: number) => {
  if (liveNotifies[roomid]) {
    const { id, listener } = liveNotifies[roomid];
    delete liveNotifies[roomid];
    await new Promise((resolve) => {
      chrome.notifications.clear(id, resolve);
      chrome.notifications.onClicked.removeListener(listener);
    });
  }
};

const onLiveStart = async (roomid: number, msg?: any) => {
  updateRoomMeta(roomid, { isLive: true });
  if (Date.now() < (lastLiveNofifies[roomid] || 0) + 5e3) return;
  lastLiveNofifies[roomid] = Date.now();

  const roomMeta = (await fetchRoomMeta(roomid).catch(console.error)) || (await getRoomsMeta())[roomid] as RoomMeta | undefined;
  if ((await getRoomConfig(roomid)).enableNotification) {
    await clearNotification(roomid);
    const avatarUrl = roomMeta ? await timedFetch(roomMeta.avatar).then(r => r.blob()).then(blob => blobToBase64(blob)).catch(console.error) : null;
    chrome.notifications.create((msg?.live_key || '').toString(), {
      title: `${roomMeta?.uname || roomid}开播了`,
      message: roomMeta?.title || '',
      iconUrl: avatarUrl || './fallback.png',
      type: 'basic',
    }, notificationId => {
      liveNotifies[roomid] = {
        id: notificationId,
        listener: (id: string) => {
          if (id === notificationId) {
            chrome.tabs.create({ url: `https://live.bilibili.com/${roomid}` });
            chrome.notifications.onClicked.removeListener(liveNotifies[roomid].listener);
          }
        }
      };
      chrome.notifications.onClicked.addListener(liveNotifies[roomid].listener);
    });
  }
};

const onLiveEnd = async (roomid: number) => {
  updateRoomMeta(roomid, { isLive: false });
  await clearNotification(roomid);
}


class WSRoomWrapper {
  public manager: RoomManager;
  public roomid: number;
  public closed: boolean = false;
  private client: LiveWS | null = null;
  private connectedMs: number = 0;
  private lastMsgMs: number = 0;
  private lastHeartbeat: number = 0;

  constructor(manager: RoomManager, roomid: number, delay?: number | undefined) {
    this.manager = manager;
    this.roomid = roomid;
    this.lastHeartbeat = this.lastMsgMs = Date.now();
    setTimeout(() => {
      this.startRoom();
      this.loadMeta();
    }, delay || 0);
  }

  private loadMeta() {
    if (this.closed) return;
    setTimeout(() => { this.loadMeta(); }, 300e3);
    fetchRoomMeta(this.roomid);
  }

  public async startRoom() {
    try {
      if (this.client && !this.client.closed) this.client.close();
      console.info(`fetching handshake info for room ${this.roomid}`);
      const handshakeData = await getHandshakeInfo(this.roomid);
      console.info(`connecting to danmaku server for room ${this.roomid}`);
      this.connectedMs = Date.now();
      this.client = new LiveWS(this.roomid, { protover: 3, ...handshakeData });
      this.client.on('closed', () => { this.reconnect(); });
      this.client.on('heartbeat', (online) => {
        this.lastHeartbeat = Date.now();
        if (online !== 1 && this.client) this.client.emit('msg', { cmd: 'popularity', online });
        console.debug(`${this.roomid} heartbeat received, last msg at ${Date.now() - this.lastMsgMs}`);
      });
      this.client.on('msg', data => {
        this.lastMsgMs = Date.now();
        this.manager.saveDanmakuData(this.roomid, data);
        if (data.cmd === 'LIVE') onLiveStart(this.roomid, data);
        if (data.cmd === 'PREPARING') onLiveEnd(this.roomid);
      });
      this.client.on('LOG_IN_NOTICE', () => { this.on_login_notice(); });
    } catch (e) {
      console.error('Error while trying to start danmaku connection, retry in 3s\n', e);
      setTimeout(() => { this.startRoom() }, 3000);
    }
  }

  private on_login_notice() {
    if (this.client && Date.now() > this.connectedMs + 300 * 1000) this.client.close();
  }

  public reconnect() {
    if (!this.closed) this.startRoom();
    updateDisconnect(true);
  }

  public checkMsg() {
    if (Date.now() > this.lastHeartbeat + 45e3) {
      console.info('heartbeat timed out, reconnecting stale room', this.roomid, this.roomid, Date.now() - this.lastMsgMs, Date.now() - this.lastHeartbeat);
      this.reconnect();
    } else if (Date.now() > this.lastMsgMs + 600e3) {
      console.info('msg timed out, reconnecting stale room', this.roomid, this.roomid, Date.now() - this.lastMsgMs, Date.now() - this.lastHeartbeat);
      this.reconnect();
    }
  }

  public close() {
    this.closed = true;
    if (this.client) this.client.close();
  }

}


class RoomManager {
  rooms: { [key: number]: WSRoomWrapper } = {};
  closed: boolean = false;
  saveDanmakuData: SaveDanmakuData;

  constructor(saveDanmakuData: SaveDanmakuData) {
    this.saveDanmakuData = saveDanmakuData;
    this.rooms = {};
    chrome.storage.onChanged.addListener((changes) => { this.roomInfoListener(changes) });
    this.syncRooms();
    this.checkRooms();
  }

  public checkRooms() {
    if (this.closed) return;
    setTimeout(() => { this.checkRooms(); }, 20e3);
    updateDisconnect(false);
    console.debug('running rooms:', this, objNumKeys(this.rooms));
    objNumKeys(this.rooms).forEach(roomid => { this.rooms[roomid].checkMsg(); });
  }

  roomInfoListener(changes: { [name: string]: chrome.storage.StorageChange }) {
    if (!this.closed && (changes.roomsInfo || changes.roomConfigs)) {
      console.debug('got room list change');
      this.syncRooms();
    }
  }

  public async syncRooms() {
    const roomsInfo: RoomsInfo = (await chrome.storage.local.get()).roomsInfo || {};
    const roomids: number[] = [];
    let refreshRoomConfig = true;
    for (const roomid of objNumKeys(roomsInfo)) {
      if ((await getRoomConfig(roomid, refreshRoomConfig)).enableDanmaku) roomids.push(roomid);
      refreshRoomConfig = false;
    }
    this.add_rooms(roomids.filter(roomid => !(roomid in this.rooms)));
    this.remove_rooms(objNumKeys(this.rooms).filter(roomid => !(roomids.includes(roomid))));
  }

  public add_rooms(roomids: number[]) {
    let delay = 0;
    roomids.forEach(roomid => {
      console.info(`adding room ${roomid}`);
      this.rooms[roomid] = new WSRoomWrapper(this, roomid, delay);
      delay += 1500;
    });
  }

  public remove_rooms(roomids: number[]) {
    roomids.forEach(roomid => {
      if (this.rooms[roomid]) {
        console.info(`removing room ${roomid}`);
        this.rooms[roomid].close();
        delete this.rooms[roomid];
      }
    })
  }

  public close() {
    console.info('closing room manager');
    this.closed = true;
    this.remove_rooms(objNumKeys(this.rooms));
  }
}

export type DanmakuStats = {
  cmdCount: { [roomid: number]: number },
  danmakuCount: { [roomid: number]: number },
};
class RoomStatTracker {
  manager: RoomManager;
  danmakuCount: { [roomid: number]: number } = {};
  cmdCount: { [roomid: number]: number } = {};
  danmakuHistory: { [roomid: number]: number[] } = {};
  cmdHistory: { [roomid: number]: number[] } = {};
  private historyInterval = 10e3;
  private maxHistory = 7;

  constructor(manager: RoomManager) {
    this.manager = manager;
    this.updateStats();
  }

  async updateStats() {
    setTimeout(() => { this.updateStats() }, this.historyInterval);
    this.cmdHistory = this.getNewHistory(this.cmdCount, this.cmdHistory);
    this.danmakuHistory = this.getNewHistory(this.danmakuCount, this.danmakuHistory);
    const danmakuStats: DanmakuStats = {
      cmdCount: this.getStats(this.cmdHistory),
      danmakuCount: this.getStats(this.danmakuHistory),
    };
    await chrome.storage.local.set({ danmakuStats });
  }

  private getStats(history: { [roomid: number]: number[] }) {
    const stats: { [roomid: number]: number } = {};
    objNumKeys(history).forEach(roomid => {
      const roomHistory = history[roomid];
      stats[roomid] = roomHistory[roomHistory.length - 1] - roomHistory[0];
    });
    return stats;
  }

  private getNewHistory(count: { [roomid: number]: number }, history: { [roomid: number]: number[] }) {
    const newHistory: { [roomid: number]: number[] } = {};
    objNumKeys(this.manager.rooms).forEach(roomid => {
      newHistory[roomid] = history[roomid] || [];
      newHistory[roomid].push(count[roomid] || 0);
      while (newHistory[roomid].length > this.maxHistory) {
        newHistory[roomid].shift();
      }
    });
    return newHistory;
  }

  countSaved(roomid: number, cmd?: string) {
    this.cmdCount[roomid] = (this.cmdCount[roomid] || 0) + 1;
    if (cmd === 'DANMU_MSG') this.danmakuCount[roomid] = (this.danmakuCount[roomid] || 0) + 1;
  }
}


export { RoomManager, RoomStatTracker };
