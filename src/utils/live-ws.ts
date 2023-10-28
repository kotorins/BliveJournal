/// <reference types="chrome-types"/>
import { LiveWS } from "bilibili-live-ws/browser";

import { randomElement, objNumKeys, saveDanmakuData, updateDisconnect, loadRoomMeta, updateRoomMeta } from "./utils";
import type { RoomsInfo } from "./utils";

const getUid = async (): Promise<number> => {
  const uid_cookie = await chrome.cookies.get({ name: "DedeUserID", url: "https://bilibili.com" });
  if (uid_cookie) return Number(uid_cookie.value);
  const r = await fetch('https://api.bilibili.com/x/web-interface/nav').then(r => r.json());
  return Number(r.data?.mid || 0);
}

const getBuvid = async (): Promise<string> => {
  const buvid_cookie = await chrome.cookies.get({ name: "buvid3", url: "https://bilibili.com" });
  return buvid_cookie?.value || '';
}

const getHandshakeInfo = async (roomid: number) => {
  const r = await fetch(`https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id=${roomid}&type=0`).then(r => r.json());
  return {
    uid: await getUid(),
    buvid: await getBuvid(),
    key: r.data.token,
    address: (i => `wss://${i.host}:${i.wss_port}/sub`)(randomElement(r.data.host_list)),
  }
}

class WSRoomWrapper {
  public roomid: number;
  public closed: boolean = false;
  private client: LiveWS | null = null;
  private connectedMs: number = 0;

  constructor(roomid: number, delay?: number | undefined) {
    this.roomid = roomid;
    setTimeout(() => { this.startRoom(); this.loadMeta(); }, delay || 0);
  }

  private async loadMeta() {
    if (this.closed) return;
    await loadRoomMeta(this.roomid).catch(e => console.error(e));
    setTimeout(() => { this.loadMeta(); }, 300e3);
  }

  public async startRoom() {
    try {
      if (this.client && !this.client.closed) this.client.close();
      console.info(`getting handshake info for room ${this.roomid}`);
      const handshakeData = await getHandshakeInfo(this.roomid);
      console.info(`connecting to danmaku server for room ${this.roomid}`);
      this.connectedMs = Date.now();
      this.client = new LiveWS(this.roomid, { protover: 3, ...handshakeData });
      this.client.on('closed', () => { this.reconnect(); });
      this.client.on('heartbeat', (online) => { (online !== 1) && this.client && this.client.emit('msg', { cmd: 'popularity', online }) });
      this.client.on('msg', data => {
        saveDanmakuData(this.roomid, data);
        if (data.cmd === 'LIVE') updateRoomMeta(this.roomid, { isLive: true });
        if (data.cmd === 'PREPARING') updateRoomMeta(this.roomid, { isLive: false });
      });
      this.client.on('LOG_IN_NOTICE', () => { this.on_login_notice(); });
    } catch (e) {
      console.error('Error while trying to start danmaku connection, retry in 3s\n', e);
      setTimeout(this.startRoom, 3000);
    }
  }

  private on_login_notice() {
    if (this.client && Date.now() > this.connectedMs + 300 * 1000) this.client.close();
  }

  public reconnect() {
    if (!this.closed) this.startRoom();
    updateDisconnect(true);
  }

  public close() {
    this.closed = true;
    if (this.client) this.client.close();
  }

}


class RoomManager {
  rooms: { [key: number]: WSRoomWrapper } = {};
  closed: boolean = false;

  constructor() {
    this.rooms = {};
    chrome.storage.onChanged.addListener((changes) => { this.roomInfoListener(changes) });
    this.syncRooms();
  }

  roomInfoListener(changes: { [name: string]: chrome.storage.StorageChange }) {
    if (!this.closed && changes.roomsInfo) {
      console.debug('got room list change');
      this.syncRooms();
    }
  }

  public async syncRooms() {
    const roomsInfo: RoomsInfo = (await chrome.storage.local.get()).roomsInfo || {};
    this.add_rooms(objNumKeys(roomsInfo).filter(roomid => !(roomid in this.rooms)));
    this.remove_rooms(objNumKeys(this.rooms).filter(roomid => !(roomid in roomsInfo)));
  }

  public add_rooms(roomids: number[]) {
    let delay = 0;
    roomids.forEach(roomid => {
      console.info(`adding room ${roomid}`);
      this.rooms[roomid] = new WSRoomWrapper(roomid, delay);
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

export { WSRoomWrapper, RoomManager };
