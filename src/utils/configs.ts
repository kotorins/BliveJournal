/// <reference types="chrome-types"/>

export type Config = {
  version: number,
  archiveKeepDays: number,
  webArchiveKeepDays: number,
  roomNumLimit: number,
};

const configVersion = 1;
const defaultConfig: Config = {
  version: configVersion,
  archiveKeepDays: 10,
  webArchiveKeepDays: 5,
  roomNumLimit: 20,
};

const getConfig = async () => {
  const localConfig: Partial<Config> = (await chrome.storage.local.get('config')).config;
  return { ...defaultConfig, ...localConfig };
};

const updateConfig = async (updates: Partial<Config>) => {
  const newConfig: Partial<Config> = { ...(await getConfig()), ...updates, version: configVersion };
  chrome.storage.local.set({ config: newConfig });
}

export {
  getConfig,
  updateConfig,
};
