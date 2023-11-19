import Dixie, { type Table } from 'dexie';

import { getConfig, getUploadEndpoints, type Config } from './configs';
import { objKeys, getDefault, timestampDayFloor, objNumKeys, gzipObj, unzipObj, timedFetch } from './utils';

export type DanmakuStoreKeys = 'danmaku' | 'hookedDanmaku';
export type DanmakuArchiveStoreKeys = 'danmakuArchive' | 'hookedDanmakuArchive';
export type DanmakuDBKeys = DanmakuStoreKeys | DanmakuArchiveStoreKeys | 'roominfo' | 'uploadLog' | 'uploadSuccess';



export type RecordType = 'danmaku' | 'hookedDanmaku'
const recordTypes: RecordType[] = ['danmaku', 'hookedDanmaku'];
const typeToStore: Record<RecordType, { store: DanmakuStoreKeys, archive: DanmakuArchiveStoreKeys }> = {
  danmaku: {
    store: 'danmaku',
    archive: 'danmakuArchive',
  },
  hookedDanmaku: {
    store: 'hookedDanmaku',
    archive: 'hookedDanmakuArchive',
  }
};

export type DanmakuData = {
  roomid: number,
  timestamp: number,
  json: string,
};
export type GzippedData = {
  roomid: number,
  timestamp: number,
  gzipped: Blob,
};
export type ArchiveGzipData = GzippedData & { cleaned: 0 | 1 };

type UploadSuccessData = {
  roomid: number,
  timestamp: number,
  type: RecordType,
  endpoint: string,
  success: boolean,
};
type LogData = {
  timestamp: number,
  level: string,
  msg: string,
};


type AutoIncTable<T> = Table<T, number>;
class DanmakuDB extends Dixie {
  danmaku!: AutoIncTable<DanmakuData>;
  hookedDanmaku!: AutoIncTable<DanmakuData>;
  danmakuArchive!: AutoIncTable<ArchiveGzipData>;
  hookedDanmakuArchive!: AutoIncTable<ArchiveGzipData>;
  roominfo!: AutoIncTable<GzippedData>;
  uploadSuccess!: AutoIncTable<UploadSuccessData>;
  uploadLog!: AutoIncTable<LogData>

  constructor() {
    super('DanmakuStore');
    this.version(14).stores({
      danmaku: '++, roomid, timestamp, [roomid+timestamp]',
      hookedDanmaku: '++, roomid, timestamp, [roomid+timestamp]',
      danmakuArchive: '++, roomid, timestamp, cleaned, [roomid+timestamp]',
      hookedDanmakuArchive: '++, roomid, timestamp, cleaned, [roomid+timestamp]',
      roominfo: '++, roomid, timestamp, [roomid+timestamp]',
      uploadSuccess: '++, roomid, type, timestamp, endpoint, [type+timestamp], &[roomid+type+timestamp+endpoint]',
      uploadLog: '++, timestamp, level',
    });
  }
}

const db = new DanmakuDB();
console.debug(db);


const commitDanmakuItems = async (data: { [type in RecordType]: DanmakuData[] }) => {
  for (const type of objKeys(data)) {
    await db[typeToStore[type].store].bulkAdd(data[type]);
  }
};

const commitRoomMeta = async (data: GzippedData) => {
  await db.roominfo.add(data);
};

const getRecordRooms = async (type: RecordType): Promise<Set<number>> => {
  const roomids = (await db[typeToStore[type].store].orderBy('roomid').uniqueKeys()).concat(
    await db[typeToStore[type].archive].orderBy('roomid').uniqueKeys()
  );
  return new Set(roomids as number[]);
};

const getRoomTimestamps = async (roomid: number, type: RecordType): Promise<Set<number>> => {
  const stores = typeToStore[type];
  const timestamps: Set<number> = new Set();
  const addTs = (data?: { timestamp: number }) => {
    data && timestamps.add(timestampDayFloor(data.timestamp));
  }
  const store = db[stores.store].where(['roomid', 'timestamp']).between([roomid, 0], [roomid, Date.now()]);
  addTs(await store.first());
  addTs(await store.last());

  const archive = db[stores.archive].where(['roomid', 'timestamp']).between([roomid, 0], [roomid, Date.now()]);
  await archive.eachUniqueKey((key, cursor) => {
    addTs({ timestamp: (key as number[])[1] });
  });
  return timestamps
};


const getDanmakuEntries = async (roomid: number, type: RecordType, timestamp: number) => {
  const stores = typeToStore[type];
  let entries: DanmakuData[] = [];

  const archiveEntries = await db[stores.archive].where(['roomid', 'timestamp']).equals([roomid, timestamp]).toArray();
  for (const archive of archiveEntries) {
    entries = entries.concat(await unzipObj(archive.gzipped));
  }
  entries = entries.concat(
    await db[stores.store].where(['roomid', 'timestamp']).between([roomid, timestamp], [roomid, timestamp + 86400e3], true, false).toArray()
  );
  if (type === 'danmaku') {
    const roominfoEntries = await db.roominfo.where(['roomid', 'timestamp']).between([roomid, timestamp], [roomid, timestamp + 86400e3], true, false).toArray();
    for (const roominfo of roominfoEntries) {
      entries.push({
        roomid: roomid,
        timestamp: roominfo.timestamp,
        json: JSON.stringify({ cmd: 'getInfoByRoom', data: await unzipObj(roominfo.gzipped) }),
      });
    }
  }

  return entries.sort((a, b) => a.timestamp - b.timestamp);
};

const deleteRoomEntries = async (roomid: number, type: RecordType, timestamp?: number) => {
  const stores = typeToStore[type];
  for (const store of [stores.store, stores.archive]) {
    if (timestamp) {
      await db[store].where(['roomid', 'timestamp']).between([roomid, timestamp], [roomid, timestamp + 86400e3], true, false).delete();
    } else {
      await db[store].where('roomid').equals(roomid).delete();
    }
  }
};


const resetUploadSuccess = async () => {
  await db.uploadSuccess.clear();
};


type ArchiveDanmakuData = DanmakuData & { key: number };
type QueriedDanmaku = { [roomid: number]: ArchiveDanmakuData[] };

const removeArchivedEntries = async (type: RecordType) => {
  const archivedEntries: { [archivePK: number]: ArchiveGzipData } = {};

  await db[typeToStore[type].archive].where('cleaned').equals(0).each((obj, cursor) => {
    archivedEntries[cursor.primaryKey] = obj;
  });

  for (const archivePK of objNumKeys(archivedEntries)) {
    const entries: ArchiveDanmakuData[] = await unzipObj(archivedEntries[archivePK].gzipped)
    await db[typeToStore[type].store].bulkDelete(entries.map(entry => entry.key));
    await db[typeToStore[type].archive].update(archivePK, { cleaned: 1 });
  }
};

const archiveDanmakuData = async (type: RecordType) => {
  await removeArchivedEntries(type);

  const entries: QueriedDanmaku = {};
  await db[typeToStore[type].store].where('timestamp').below(timestampDayFloor()).each((entry, cursor) => {
    getDefault(entries, entry.roomid, []).push({ key: cursor.primaryKey, ...entry });
  });

  for (const roomid of objNumKeys(entries)) {
    const entriesByDay: { [floorTs: number]: ArchiveDanmakuData[] } = {};
    entries[roomid].forEach(entry => {
      getDefault(entriesByDay, timestampDayFloor(entry.timestamp), []).push(entry);
    });
    for (const timestamp of objNumKeys(entriesByDay)) {
      await db[typeToStore[type].archive].add({
        roomid, timestamp, cleaned: 0, gzipped: await gzipObj(entriesByDay[timestamp]),
      });
    }
    await removeArchivedEntries(type);
  }
};

const typeToKeepDays: Record<RecordType, keyof Config> = {
  danmaku: 'archiveKeepDays',
  hookedDanmaku: 'webArchiveKeepDays',
};
const removeOldEntries = async (type: RecordType, config: Config) => {
  const keepDays = config[typeToKeepDays[type]] as number;
  const timestamp = timestampDayFloor(Date.now(), keepDays);
  await db[typeToStore[type].archive].where('timestamp').below(timestamp).delete();
  await db.uploadSuccess.where(['type', 'timestamp']).between([type, 0], [type, timestamp], false, false).delete();
};


const sourceNames: Record<RecordType, string> = {
  danmaku: 'background',
  hookedDanmaku: 'webpage',
};
const uploadEntry = async (roomid: number, type: RecordType, timestamp: number) => {
  let entries: DanmakuData[] | null = null;
  const step = (await getConfig()).uploadSliceSize;

  const logUploadResult = async (level: string, msg: string) => {
    await db.uploadLog.add({ timestamp: Date.now(), level, msg: `[${roomid}-${type}-${timestamp}] ${msg}` });
  }
  const uploadEntryToEndpoint = async (endpoint: URL) => {
    if (!entries) entries = await getDanmakuEntries(roomid, type, timestamp);
    let page = 0;
    const rand = Math.round(Math.random() * 1e6);
    try {
      while (page * step < entries.length) {
        const jsonl = entries.slice(page * step, (page + 1) * step).map(i => `[${i.timestamp},${i.json}]`).join('\n');
        const r = await timedFetch(endpoint, {
          method: 'PUT',
          mode: 'cors',
          headers: { 'Content-Encoding': 'deflate' },
          body: await gzipObj({
            roomid,
            src: sourceNames[type],
            timestamp,
            rand,
            page,
            size: step,
            length: entries.length,
            jsonl,
          }, 'deflate'),
        });
        if (r.status !== 200) throw new Error(`HTTP status ${r.status}: ${(await r.text()).slice(0, 3000)}`);
        const rsp = await r.json();
        if (rsp.code) throw new Error(`non-zero code ${rsp.code}: ${rsp.msg || ''}`);
        page += 1;
      }
      await logUploadResult('INFO', `Successfully uploaded to "${endpoint}"`);
      return true;
    } catch (e) {
      await logUploadResult('ERROR', `Fetch error while uploading to "${endpoint}": ${(e as any).message}`);
    }
  };

  for (const endpoint of (await getUploadEndpoints())) {
    if (!((await db.uploadSuccess.get({roomid, type, timestamp, endpoint: endpoint.toString()}))?.success)) {
      if (await uploadEntryToEndpoint(endpoint)) {
        await db.uploadSuccess.put({roomid, type, timestamp, endpoint: endpoint.toString(), success: true});
      }
    }
  }
};


const uploadAllEntries = async (type: RecordType) => {
  const keys: any[] = await db[typeToStore[type].archive].orderBy(['roomid', 'timestamp']).uniqueKeys();
  console.debug('start uploading to remote for ', type);
  for (const key of (keys as number[][])) {
    const roomid = Number(key[0]);
    const timestamp = Number(key[1]);
    await uploadEntry(roomid, type, timestamp);
  }
};


const archiveDanmaku = async () => {
  console.debug('start archiving and uploading');
  const config = await getConfig();
  for (const type of objKeys(typeToStore)) {
    await archiveDanmakuData(type);
    await removeOldEntries(type, config);
    await uploadAllEntries(type);
  }
  await db.uploadLog.where('timestamp').below(timestampDayFloor(undefined, config.uploadLogKeepDays)).delete();
  await db.roominfo.where('timestamp').below(timestampDayFloor(undefined, config.archiveKeepDays)).delete();
};


export {
  recordTypes,
  commitDanmakuItems,
  commitRoomMeta,
  getRecordRooms,
  getRoomTimestamps,
  getDanmakuEntries,
  deleteRoomEntries,
  resetUploadSuccess,
  archiveDanmaku,
};
