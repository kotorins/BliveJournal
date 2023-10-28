const getCmd = (data: any) => data.cmd;

const lastData: { [roomid: number]: { [cmd: string]: string } } = {};
const filterDuplicate = (roomid: number, cmd: string, json: string): boolean => {
  const roomLast = lastData[roomid] = lastData[roomid] || {};
  if (roomLast[cmd] === json) return false;
  roomLast[cmd] = json;
  return true;
}


const IGNORE_CMDS = new Set([
  "STOP_LIVE_ROOM_LIST",
]);

const DEDUP_CMDS = new Set([
  "ONLINE_RANK_COUNT",
  "WATCHED_CHANGE",
  "ONLINE_RANK_V2",
]);

const sanitizeData = (data: any): any => {
  try {
    if (data.cmd === 'DANMU_MSG') {
      if (data.info[0][15].extra.match(/^{"send_from_me":true,/)) {
        data.info[0][15].extra = data.info[0][15].extra.replace(/^{"send_from_me":true,/, '{"send_from_me":false,');
      }
    }
  } catch (e) {
    //
  }
  return data;
};


const filterData = (roomid: number, cmd: string, json: string, storeName: string): boolean => {
  if (IGNORE_CMDS.has(cmd)) {
    console.debug('ignore cmd', roomid, json);
    return false;
  }
  if (DEDUP_CMDS.has(cmd)) {
    if (!filterDuplicate(roomid, `${storeName}:${cmd}`, json)) {
      console.debug('ignore duplicate', roomid, json);
      return false;
    }
  }
  return true;
}

export {
  getCmd,
  sanitizeData,
  filterData,
};
