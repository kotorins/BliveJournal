import { inflates } from "bilibili-live-ws/src/inflate/browser";
import { makeDecoder } from "bilibili-live-ws/src/buffer";


const decodeBuffer = async (data: ArrayBuffer) => {
  const buffer = inflates.Buffer.from(data);
  // @ts-ignore
  const packs = await makeDecoder(inflates)(buffer);
  packs.forEach(pack => {
    if (pack.type === 'heartbeat' && pack.data !== 1) {
      pack.data = { cmd: 'popularity', online: pack.data };
      pack.type = 'message';
    }
  });
  return packs.filter(i => i.type == 'message');
}

const parseSentData = (data: ArrayBuffer) => {
  const intArray = new Uint8Array(data);
  if (intArray[11] === 7) return JSON.parse((new TextDecoder()).decode(intArray.slice(16)));
};

const parseMsgData = (roomid: number, data: ArrayBuffer) => {
  decodeBuffer(data).then(packs => packs.forEach(pack => {
    console.debug('WS msg', pack.type, pack.data);
    document.dispatchEvent(new CustomEvent('onDanmakuMsgPack', { detail: { roomid, json: JSON.stringify(pack.data) } }));
  }));
};

class HookedWebSocket extends WebSocket {
  roomid: number | null = null;
  protover: number = 3;

  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    this.addEventListener('message', (event: MessageEvent) => {
      console.debug('WS msg event', this.roomid, event.data);
      if (!this.roomid) {
        console.error('expect roomid sent before receiving response');
        return;
      }
      if (this.protover > 3) {
        console.error('unexpected protover', this.protover);
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        parseMsgData(this.roomid, event.data);
      } else {
        console.error('unexpected msg type', event.data);
      }
    })
  }
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    super.send(data);
    if (data instanceof ArrayBuffer) {
      const parsed = parseSentData(data);
      if (parsed) {
        console.debug('WS sent handshake', parsed);
        this.roomid = parsed.roomid;
        this.protover = parsed.protover;
      }
    } else {
      console.error('unexpected data type sent', data);
    }
  }
}
window.WebSocket = HookedWebSocket;
