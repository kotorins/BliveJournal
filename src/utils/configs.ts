/// <reference types="chrome-types"/>


export type Config = {
  version: number,
  showAdvConfig: boolean,
  archiveKeepDays: number,
  webArchiveKeepDays: number,
  roomNumLimit: number,
  fetchTimeout: number,
  uploadSliceSize: number,
  uploadLogKeepDays: number,
};

export type RoomConfig = {
  version: number,
  enableNotification: boolean,
  enableDanmaku: boolean,
};

const configVersion = 1;
const roomConfigVersion = 1;

const defaultConfig: Config = {
  version: configVersion,
  showAdvConfig: false,
  archiveKeepDays: 14,
  webArchiveKeepDays: 7,
  roomNumLimit: 20,
  fetchTimeout: 25,
  uploadSliceSize: 20000,
  uploadLogKeepDays: 7,
};

const defaultRoomConfig: RoomConfig = {
  version: roomConfigVersion,
  enableNotification: false,
  enableDanmaku: true,
};

type FilterCMDTypes = 'ignore' | 'dedup';


const defaultIgnoreCMDs = [
  "STOP_LIVE_ROOM_LIST",
];

const defaultDedupCMDs = [
  "ONLINE_RANK_COUNT",
  "WATCHED_CHANGE",
  "ONLINE_RANK_V2",
];

const defaultFilterCMDs: Record<FilterCMDTypes, string[]> = {
  ignore: defaultIgnoreCMDs,
  dedup: defaultDedupCMDs,
}
const defaultFilterCmdKeys = Object.keys(defaultFilterCMDs) as FilterCMDTypes[];

const filterByDefault = <T extends { [key: string]: any }>(partial: Partial<T>, defaults: T): Partial<T> => {
  for (const key in partial) {
    if (typeof partial[key] !== typeof defaults[key]) delete partial[key];
  }
  return partial;
};

const toStringSet = (data: any | void, filterType: FilterCMDTypes): Set<string> => {
  const array = Array.from((data instanceof Array) ? data : defaultFilterCMDs[filterType]);
  return new Set(array.map(i => i.toString()));
};
const toFilterCMDKey = (filterType: FilterCMDTypes): string => `filterCMD-${filterType}`;

const toUrlArray = (items: any): URL[] => {
  const urls: URL[] = [];
  if (urls instanceof Array) {
    for (const item of items) {
      if (typeof item === 'string') urls.push(new URL(item));
    }
  }
  return urls;
};

class ConfigManager {
  config: Partial<Config> = {};
  roomConfigs: { [roomid: number]: Partial<RoomConfig> } = {};
  uploadEndpoints: URL[] = [];
  filterCMDs: Record<FilterCMDTypes, Set<string>> = {
    ignore: new Set(),
    dedup: new Set(),
  };
  ignoreCMDs: Set<string> = new Set();
  dedupCMDs: Set<string> = new Set();

  constructor() {
    chrome.storage.local.onChanged.addListener(changes => {
      if (changes.config) this.config = changes.config.newValue;
      if (changes.roomConfigs) this.roomConfigs = changes.roomConfigs.newValue;
      if (changes.uploadEndpoints) this.uploadEndpoints = toUrlArray(changes.uploadEndpoints.newValue);
      defaultFilterCmdKeys.forEach(filterType => {
        const storeKey = toFilterCMDKey(filterType);
        if (changes[storeKey]) this.filterCMDs[filterType] = toStringSet(changes[storeKey].newValue, filterType);
      });
    });
  }

  async init() {
    const storage = await chrome.storage.local.get();
    this.config = storage.config || {};
    this.roomConfigs = storage.roomConfigs || {};
    this.uploadEndpoints = toUrlArray(storage.uploadEndpoints || []);
    defaultFilterCmdKeys.forEach(filterType => {
      this.filterCMDs[filterType] = toStringSet(storage[toFilterCMDKey(filterType)], filterType);
    });
  }

  async getConfig(refresh: boolean): Promise<Config> {
    if (refresh) this.config = (await chrome.storage.local.get('config')).config || {};
    return {
      ...defaultConfig,
      ...filterByDefault(this.config, defaultConfig),
    };
  }
  async updateConfig(updates: Partial<Config>): Promise<void> {
    const config: Partial<Config> = {
      ...(await this.getConfig(true)),
      ...filterByDefault(updates, defaultConfig),
      version: configVersion,
    };
    this.config = config;
    await chrome.storage.local.set({ config });
  }

  async getRoomConfigs(refresh: boolean): Promise<{ [roomid: number]: Partial<RoomConfig> }> {
    if (refresh) this.roomConfigs = (await chrome.storage.local.get('roomConfigs')).roomConfigs || {};
    return this.roomConfigs;
  }
  async getRoomConfig(roomid: number, refresh: boolean): Promise<RoomConfig> {
    return {
      ...defaultRoomConfig,
      ...filterByDefault((await this.getRoomConfigs(refresh))[roomid], defaultRoomConfig),
    };
  }
  async updateRoomConfig(roomid: number, updates: Partial<RoomConfig>): Promise<void> {
    const roomConfigs = await this.getRoomConfigs(true);
    roomConfigs[roomid] = {
      ...roomConfigs[roomid],
      ...filterByDefault(updates, defaultRoomConfig),
      version: roomConfigVersion
    };
    this.roomConfigs = roomConfigs;
    await chrome.storage.local.set({ roomConfigs });
  }

  async getUploadEndpoints(): Promise<URL[]> {
    return this.uploadEndpoints;
  }
  async setUploadEndpoints(endpoints: string[]): Promise<void> {
    const urls = toUrlArray(endpoints);
    this.uploadEndpoints = urls;
    await chrome.storage.local.set({ uploadEndpoints: urls.map(i => i.toString()) });
  }

  async getFilterCMDSet(type: FilterCMDTypes): Promise<Set<string>> {
    return this.filterCMDs[type];
  }
  async setFilterCMDs(type: FilterCMDTypes, newList: string[]) {
    this.filterCMDs[type] = toStringSet(newList, type);
    await chrome.storage.local.set({ [toFilterCMDKey(type)]: Array.from(newList) });
  }

  async resetConfig() {
    this.config = {};
    await chrome.storage.local.remove('config');
  }
  async resetRoomConfigs() {
    this.roomConfigs = {};
    await chrome.storage.local.remove('roomConfigs');
  }
  async resetFilterCMDs(type: FilterCMDTypes) {
    this.filterCMDs[type] = toStringSet(null, type);
    await chrome.storage.local.remove(toFilterCMDKey(type));
  }
}

let configManager: ConfigManager | null = null;

const getConfigManager = async (): Promise<ConfigManager> => {
  if (configManager) return configManager;
  const manager = new ConfigManager();
  await manager.init();
  return configManager = manager;
};


const getConfig = async (refresh?: boolean): Promise<Config> => {
  const manager = await getConfigManager();
  return await manager.getConfig(refresh || false);
};
const updateConfig = async (updates: Partial<Config>) => {
  const manager = await getConfigManager();
  await manager.updateConfig(updates);
};
const resetConfig = async () => {
  const manager = await getConfigManager();
  await manager.resetConfig();
};
const getRoomConfig = async (roomid: number, refresh?: boolean): Promise<RoomConfig> => {
  const manager = await getConfigManager();
  return await manager.getRoomConfig(roomid, refresh || false);
};
const updateRoomConfig = async (roomid: number, updates: Partial<RoomConfig>) => {
  const manager = await getConfigManager();
  await manager.updateRoomConfig(roomid, updates);
};
const getUploadEndpoints = async (): Promise<URL[]> => {
  const manager = await getConfigManager();
  return await manager.getUploadEndpoints();
};
const setUploadEndpoints = async (endpoints: string[]) => {
  const manager = await getConfigManager();
  await manager.setUploadEndpoints(endpoints);
};
const resetRoomConfigs = async () => {
  const manager = await getConfigManager();
  await manager.resetRoomConfigs();
};
const getCmdFilterSet = async (type: FilterCMDTypes): Promise<Set<string>> => {
  const manager = await getConfigManager();
  return await manager.getFilterCMDSet(type);
};
const setCmdFilter = async (type: FilterCMDTypes, newList: string[]) => {
  if (!(newList instanceof Array)) {
    console.warn('got non-array CMD filter to set', newList);
  } else {
    const manager = await getConfigManager();
    await manager.setFilterCMDs(type, Array.from(newList));
  }
};
const resetCmdFilter = async (type: FilterCMDTypes) => {
  const manager = await getConfigManager();
  await manager.resetFilterCMDs(type);
};

export {
  getConfig,
  updateConfig,
  resetConfig,
  getRoomConfig,
  updateRoomConfig,
  resetRoomConfigs,
  getUploadEndpoints,
  setUploadEndpoints,
  getCmdFilterSet,
  setCmdFilter,
  resetCmdFilter,
};
