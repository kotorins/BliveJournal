import { getCmdFilterSet } from './configs';

const getCmd = (data: any) => data.cmd;

const lastData: { [roomid: number]: { [cmd: string]: string } } = {};
const filterDuplicate = (roomid: number, cmd: string, json: string): boolean => {
  const roomLast = lastData[roomid] = lastData[roomid] || {};
  if (roomLast[cmd] === json) return false;
  roomLast[cmd] = json;
  return true;
}


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


const filterData = async (roomid: number, data: any, json: string, storeType: string): Promise<boolean> => {
  const cmd = getCmd(data);
  if ((await getCmdFilterSet('ignore')).has(cmd)) {
    return false;
  }
  if ((await getCmdFilterSet('dedup')).has(cmd)) {
    if (!filterDuplicate(roomid, `${storeType}:${cmd}`, json)) {
      return false;
    }
  }
  return true;
}

export {
  sanitizeData,
  filterData,
};
