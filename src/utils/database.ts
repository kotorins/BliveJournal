import { getConfig } from './configs';
import { getDefault, timestampDayFloor, objNumKeys, unzipObj, gzipObj, asyncSleep } from './utils';

export type DanmakuStoreKeys = 'danmaku' | 'hookedDanmaku';
export type DanmakuArchiveStoreKeys = 'danmakuArchive' | 'hookedDanmakuArchive';
export type DanmakuDBKeys = DanmakuStoreKeys | DanmakuArchiveStoreKeys | 'roominfo';

type DBOpener = (onerror?: (e: Error) => void) => IDBOpenDBRequest

const openDanmakuDB: DBOpener = (onerror?: (e: Error) => void) => {
  const request = indexedDB.open('DanmakuStore', 8);
  request.onblocked = (e) => { console.error(e); onerror && onerror(new Error(e.toString())) };
  request.onerror = (e) => { console.error(e); onerror && onerror(new Error(e.toString())) };
  request.onupgradeneeded = (event) => {
    const db = request.result;
    const createIndex = (objStore: IDBObjectStore, indexPath: string | string[]) => {
      if (indexPath instanceof Array) {
        objStore.createIndex(indexPath.join(', '), indexPath);
      } else {
        objStore.createIndex(indexPath, indexPath);
      }
    };
    const createIncStore = (storeName: string, indicies: (string | string[])[]) => {
      const objStore = db.createObjectStore(storeName, { autoIncrement: true });
      indicies.forEach(indexPath => { createIndex(objStore, indexPath) });
      return objStore;
    };
    const addIndexToStore = (storeName: string, indicies: (string | string[])[]) => {
      const transaction = request.transaction;
      if (transaction) {
        const objStore = transaction.objectStore(storeName);
        indicies.forEach(indexPath => { createIndex(objStore, indexPath) });
      } else {
        throw new Error(`failed to add index to store ${storeName}, db transaction is null`);
      }
    };
    if (event.oldVersion < 8) {
      createIncStore('danmaku', ['roomid', 'timestamp', ['roomid', 'timestamp']]);
      createIncStore('hookedDanmaku', ['roomid', 'timestamp', ['roomid', 'timestamp']]);
      createIncStore('roominfo', ['roomid', 'timestamp']);
      createIncStore('danmakuArchive', ['roomid', 'timestamp', 'cleaned', ['roomid', 'timestamp']]);
      createIncStore('hookedDanmakuArchive', ['roomid', 'timestamp', 'cleaned', ['roomid', 'timestamp']]);
    }
  }
  return request;
};

const openTransaction = (request: IDBOpenDBRequest, storeNames: string | string[], mode: IDBTransactionMode, onerror?: (e: Error) => void) => {
  const transaction = request.result.transaction(storeNames, mode);
  transaction.onerror = (e) => { console.error(e); onerror && onerror(new Error(e.toString())) };
  transaction.onabort = (e) => { console.error(e); onerror && onerror(new Error(e.toString())) };
  return transaction;
};

const toAsync = <V, T extends unknown[]>(func: (callback: (values: V) => void, onerror: (e: Error) => void, ...args: T) => void): (...args: T) => Promise<V> => {
  return ((...args) => new Promise((resolve, reject) => {
    func(resolve, reject, ...args);
  }));
};

const commitToIDB = toAsync((oncomplete: (v: void) => void, onerror, opener: DBOpener, data: { [storeName in DanmakuDBKeys]?: any[] }) => {
  if (!Object.values(data).filter(items => items.length).length) return;
  const request = opener(onerror);
  request.onsuccess = () => {
    const transaction = openTransaction(request, Object.keys(data), 'readwrite', onerror);
    transaction.oncomplete = () => {
      console.debug(`${Object.keys(data)} commit completed`);
      request.result.close();
      oncomplete();
    };

    Object.keys(data).forEach((storeName) => {
      const objStore = transaction.objectStore(storeName);
      (data[storeName as DanmakuDBKeys] || []).forEach((item: any) => {
        const action = objStore.add(item);
        action.onerror = console.error;
        action.onsuccess = () => { console.debug(`data added to ${storeName}`, item); };
      });
    });
  };
});

const removeFromIDB = toAsync((oncomplete: (v: void) => void, onerror, opener: DBOpener, entryKeys: { [storeName in DanmakuDBKeys]?: number[] }) => {
  if (!Object.values(entryKeys).filter(items => items.length).length) return;
  const request = opener(onerror);
  request.onsuccess = () => {
    const transaction = openTransaction(request, Object.keys(entryKeys), 'readwrite', onerror);
    transaction.oncomplete = () => {
      console.debug(`${Object.keys(entryKeys)} commit completed`);
      request.result.close();
      oncomplete();
    };

    Object.keys(entryKeys).forEach((storeName) => {
      const objStore = transaction.objectStore(storeName);
      const keys = entryKeys[storeName as DanmakuDBKeys] || [];
      const removeKeys = () => {
        const key = keys.shift();
        if (key) {
          const action = objStore.delete(key);
          action.onerror = (e) => { console.error(e); onerror(new Error(e.toString())) };
          action.onsuccess = () => {
            console.debug(`entry deleted from ${storeName}`);
            removeKeys();
          };
        }
      };
      removeKeys();
    });
  };
});


const removeEntriesByIndex = toAsync((oncomplete: (v: void) => void, onerror, opener: DBOpener, storeName: DanmakuStoreKeys | DanmakuArchiveStoreKeys, indexName: string, query?: IDBKeyRange) => {
  const request = opener(onerror);
  request.onsuccess = () => {
    const transaction = openTransaction(request, storeName, 'readwrite', onerror);
    transaction.oncomplete = () => {
      console.debug(`${storeName} old removal completed`);
      request.result.close();
      oncomplete();
    };
    const idx = transaction.objectStore(storeName).index(indexName);
    const cursorReq = idx.openCursor(query);
    cursorReq.onerror = console.error;
    cursorReq.onsuccess = (event) => {
      const cursor = (event as Event & { target?: { result?: IDBCursor } }).target?.result;
      if (cursor) {
        cursor.delete();
        console.debug(`removed entry ${cursor.primaryKey} from ${storeName}`);
        cursor.continue();
      }
    };
  };
});


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
export type ArchiveDanmakuData = DanmakuData & { key: number };
export type ArchiveGzipData = GzippedData & { cleaned: 0 | 1 };

const commitDanmakuItems = (data: { [storeName in DanmakuStoreKeys]?: DanmakuData[] }) => {
  commitToIDB(openDanmakuDB, data);
};
const commitRoomMeta = (data: GzippedData) => { commitToIDB(openDanmakuDB, { roominfo: [data] }); };


const queryDBWithCursor = toAsync(<V>(callback: (entries: V) => void, onerror: (e: Error) => void, opener: DBOpener, storeName: string, entries: V, oncursor: (entries: V, cursor: IDBCursorWithValue) => boolean, indexName?: string, query?: IDBKeyRange, direction?: IDBCursorDirection, mode?: IDBTransactionMode) => {
  const request = opener(onerror);
  request.onsuccess = () => {
    const transaction = openTransaction(request, storeName, mode || 'readonly', onerror);
    transaction.oncomplete = () => {
      request.result.close();
      callback(entries);
    };

    const objStore = transaction.objectStore(storeName);
    const cursorReq = (indexName ? objStore.index(indexName) : objStore).openCursor(query, direction);
    cursorReq.onerror = console.error;
    cursorReq.onsuccess = (event) => {
      const cursor = (event as Event & { target?: { result?: IDBCursorWithValue } }).target?.result;
      if (cursor) {
        if (oncursor(entries, cursor)) cursor.continue();
      }
    };
  };
});


const queryDBValues = toAsync(<V>(callback: (entries: V[]) => void, onerror: (e: Error) => void, opener: DBOpener, storeName: string, indexName?: string, query?: IDBKeyRange) => {
  const request = opener(onerror);
  request.onsuccess = () => {
    const transaction = openTransaction(request, storeName, 'readonly', onerror);
    let entries: V[] = [];

    transaction.oncomplete = () => {
      request.result.close();
      callback(entries);
    };

    const objStore = transaction.objectStore(storeName);
    const queryReq = (indexName ? objStore.index(indexName) : objStore).getAll(query);
    queryReq.onerror = console.error;
    queryReq.onsuccess = () => {
      entries = queryReq.result;
    };
  };
});


const queryStoreRooms = async (opener: DBOpener, storeName: DanmakuStoreKeys | DanmakuArchiveStoreKeys) => {
  const oncursor = (entries: number[], cursor: IDBCursor) => {
    entries.push(Number(cursor.key));
    return true;
  };
  return await queryDBWithCursor(opener, storeName, [] as number[], oncursor, 'roomid', undefined, 'nextunique');
};

const queryDanmakuTimestamps = toAsync((callback: (entries: Set<number>) => void, onerror: (e: Error) => void, opener: DBOpener, storeName: DanmakuStoreKeys, archiveStoreName: DanmakuArchiveStoreKeys, roomid: number) => {
  const request = opener(onerror);
  request.onsuccess = () => {
    const transaction = openTransaction(request, [storeName, archiveStoreName], 'readonly', onerror);

    const timestamps: Set<number> = new Set();

    transaction.oncomplete = () => {
      request.result.close();
      callback(timestamps);
    };

    const addTimestamp = (timestamp: number) => {
      if (!isNaN(timestamp)) timestamps.add(timestamp);
    };

    const queryArchive = () => {
      const idx = transaction.objectStore(archiveStoreName).index('roomid, timestamp');
      const cursorReq = idx.openKeyCursor(IDBKeyRange.bound([roomid, 0], [roomid, Date.now()]), 'nextunique');
      cursorReq.onerror = console.error;
      cursorReq.onsuccess = (event) => {
        const cursor = (event as Event & { target?: { result?: IDBCursor } }).target?.result;
        if (cursor) {
          const timestamp = (cursor.key as IDBValidKey[])[1];
          addTimestamp(Number(timestamp));
          cursor.continue();
        }
      };
    };

    const queryCurrent = () => {
      const idx = transaction.objectStore(storeName).index('roomid');
      ['next', 'prev'].forEach(direction => {
        idx.openCursor(IDBKeyRange.only(roomid), direction as IDBCursorDirection).onsuccess = (event) => {
          const cursor = (event as Event & { target?: { result?: IDBCursorWithValue } }).target?.result;
          if (cursor) {
            const timestamp = Number((cursor.value as DanmakuData).timestamp);
            if (!isNaN(timestamp)) addTimestamp(timestampDayFloor(timestamp));
          }
        }
      });
    };
    queryCurrent();
    queryArchive();
  };
});


export type QueriedDanmaku = { [roomid: number]: ArchiveDanmakuData[] };

const queryDanmakuData = async (opener: DBOpener, storeName: string, indexName?: string, query?: IDBKeyRange) => {
  const oncursor = (entries: QueriedDanmaku, cursor: IDBCursorWithValue) => {
    const item: DanmakuData = cursor.value;
    getDefault(entries, item.roomid, []).push({ key: Number(cursor.primaryKey), ...item });
    return true;
  }
  return await queryDBWithCursor(opener, storeName, {} as QueriedDanmaku, oncursor, indexName, query);
};


const updateCleaned = async (opener: DBOpener, archiveStoreName: DanmakuArchiveStoreKeys, entries: { key: number }[]) => {
  const primaryKeys = new Set(Object.values(entries).map(i => i.key));
  const oncursor = (entries: [], cursor: IDBCursorWithValue) => {
    const item: ArchiveGzipData = cursor.value;
    if (primaryKeys.has(Number(cursor.primaryKey))) {
      item.cleaned = 1;
      cursor.update(item);
    }
    return true;
  };
  await queryDBWithCursor(opener, archiveStoreName, [], oncursor, 'cleaned', IDBKeyRange.only(0), undefined, 'readwrite');
}


const removeArchivedEntries = async (opener: DBOpener, srcName: DanmakuStoreKeys, targetName: DanmakuArchiveStoreKeys) => {
  const oncursor = (entries: (ArchiveGzipData & { key: number })[], cursor: IDBCursorWithValue) => {
    const item: ArchiveGzipData = cursor.value;
    entries.push({ ...item, key: Number(cursor.primaryKey) });
    return true;
  }
  const archivedEntries = await queryDBWithCursor(
    opener, targetName, [] as (ArchiveGzipData & { key: number })[], oncursor, 'cleaned', IDBKeyRange.only(0));

  for (const entry of archivedEntries) {
    const entries: ArchiveDanmakuData[] = await unzipObj(entry.gzipped);
    let primaryKeys = entries.map(i => i.key);
    while (primaryKeys.length) {
      await removeFromIDB(opener, { [srcName]: primaryKeys.slice(0, 100) });
      await asyncSleep(100);
      primaryKeys = primaryKeys.slice(100);
    }
  }
  await updateCleaned(opener, targetName, archivedEntries);
};


const archiveDanmakuEntries = async (opener: DBOpener, srcName: DanmakuStoreKeys, targetName: DanmakuArchiveStoreKeys, allroomsEntries: QueriedDanmaku) => {
  for (const roomid of objNumKeys(allroomsEntries)) {
    const entriesByDay: { [floorTs: number]: ArchiveDanmakuData[] } = {};
    allroomsEntries[roomid].forEach(entry => {
      getDefault(entriesByDay, timestampDayFloor(entry.timestamp), []).push(entry);
    });
    console.debug('parsed entries for room ', srcName, roomid);
    const archiveEntries: ArchiveGzipData[] = [];
    for (const timestamp of objNumKeys(entriesByDay)) {
      archiveEntries.push({ roomid, timestamp, gzipped: await gzipObj(entriesByDay[timestamp]), cleaned: 0 });
    }
    console.debug('gzipped entries for room ', srcName, roomid);
    await commitToIDB(opener, { [targetName]: archiveEntries });
    await removeArchivedEntries(opener, srcName, targetName);
  }
};

const removeOldArchiveEntries = async (opener: DBOpener, storeName: DanmakuArchiveStoreKeys, keepDays: number) => {
  const timestamp = timestampDayFloor(Date.now(), keepDays);
  removeEntriesByIndex(opener, storeName, 'timestamp', IDBKeyRange.upperBound(timestamp, true));
};

const archiveDanmakuData = async (opener: DBOpener, srcName: DanmakuStoreKeys, targetName: DanmakuArchiveStoreKeys) => {
  await removeArchivedEntries(opener, srcName, targetName);
  const allroomEntries = await queryDanmakuData(opener, srcName, 'timestamp', IDBKeyRange.upperBound(timestampDayFloor(0), true));
  console.debug('queried entries from ', srcName, allroomEntries);
  await archiveDanmakuEntries(opener, srcName, targetName, allroomEntries);
};

const archiveDanmaku = async () => {
  console.debug('archiving loose danmaku records');
  await archiveDanmakuData(openDanmakuDB, 'danmaku', 'danmakuArchive');
  await removeOldArchiveEntries(openDanmakuDB, 'danmakuArchive', (await getConfig()).archiveKeepDays);
  await archiveDanmakuData(openDanmakuDB, 'hookedDanmaku', 'hookedDanmakuArchive');
  await removeOldArchiveEntries(openDanmakuDB, 'hookedDanmakuArchive', (await getConfig()).webArchiveKeepDays);
};


export type RecordType = 'danmaku' | 'hookedDanmaku'
const getRecordRooms = async (type: RecordType) => {
  let roomids: number[] = [];
  if (type === 'danmaku') {
    roomids = roomids.concat(await queryStoreRooms(openDanmakuDB, 'danmaku'))
    roomids = roomids.concat(await queryStoreRooms(openDanmakuDB, 'danmakuArchive'))
    return new Set(roomids);
  } else {
    roomids = roomids.concat(await queryStoreRooms(openDanmakuDB, 'hookedDanmaku'))
    roomids = roomids.concat(await queryStoreRooms(openDanmakuDB, 'hookedDanmakuArchive'))
    return new Set(roomids);
  }
};

const getRoomTimestamps = (roomid: number, type: RecordType) => {
  if (type === 'danmaku') {
    return queryDanmakuTimestamps(openDanmakuDB, 'danmaku', 'danmakuArchive', roomid)
  } else {
    return queryDanmakuTimestamps(openDanmakuDB, 'hookedDanmaku', 'hookedDanmakuArchive', roomid)
  }
};


const queryArchiveEntries = async (opener: DBOpener, roomid: number, archiveStoreName: DanmakuArchiveStoreKeys, timestamp: number) => {
  console.debug('getting archive data entries', roomid, archiveStoreName, timestamp);
  const archiveEntries = await queryDBValues<ArchiveGzipData>(opener, archiveStoreName, 'roomid, timestamp', IDBKeyRange.only([roomid, timestamp]));
  console.debug('retrived archive data entries', roomid, archiveEntries.length);
  let entries: ArchiveDanmakuData[] = [];
  for (const archive of archiveEntries) {
    entries = entries.concat(await unzipObj(archive.gzipped));
  }
  console.debug('flattened archive data entries', roomid, entries.length);
  return entries;
};
const queryDanmakuEntries = async (opener: DBOpener, roomid: number, storeName: DanmakuStoreKeys, timestamp: number) => {
  console.debug('getting danmaku data entries', roomid, storeName, timestamp);
  const entries = await queryDBValues<DanmakuData>(opener, storeName, 'roomid, timestamp', IDBKeyRange.bound([roomid, timestamp], [roomid, timestamp + 86400e3], false, true));
  console.debug('retrived danmaku data entries', roomid, entries.length);
  return entries;
};
const getDanmakuEntries = (roomid: number, type: RecordType, timestamp: number) => {
  const getEntries = async (storeName: DanmakuStoreKeys, archiveStoreName: DanmakuArchiveStoreKeys) => {
    return (await queryDanmakuEntries(openDanmakuDB, roomid, storeName, timestamp)).concat(
      await queryArchiveEntries(openDanmakuDB, roomid, archiveStoreName, timestamp)
    ).sort((a, b) => a.timestamp - b.timestamp);
  };
  if (type === 'danmaku') {
    return getEntries('danmaku', 'danmakuArchive');
  } else {
    return getEntries('hookedDanmaku', 'hookedDanmakuArchive');
  }
};
const deleteRoomEntries = async (roomid: number, type: RecordType, timestamp?: number) => {
  const deleteWithQuery = async (indexName: string, query: IDBKeyRange) => {
    if (type === 'danmaku') {
      await removeEntriesByIndex(openDanmakuDB, 'danmaku', indexName, query);
      await removeEntriesByIndex(openDanmakuDB, 'danmakuArchive', indexName, query);
    } else {
      await removeEntriesByIndex(openDanmakuDB, 'hookedDanmaku', indexName, query);
      await removeEntriesByIndex(openDanmakuDB, 'hookedDanmakuArchive', indexName, query);
    }
  };
  if (timestamp) {
    await deleteWithQuery('roomid, timestamp', IDBKeyRange.bound([roomid, timestamp], [roomid, timestamp + 86400e3], false, true));
  } else {
    await deleteWithQuery('roomid', IDBKeyRange.only(roomid));
  }
}

export {
  commitDanmakuItems,
  commitRoomMeta,
  archiveDanmaku,
  getRecordRooms,
  getRoomTimestamps,
  getDanmakuEntries,
  deleteRoomEntries,
};
