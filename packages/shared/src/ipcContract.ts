/**
 * Single Source of Truth (SSOT) for Desktop Main <-> Preload <-> Renderer IPC channels.
 */
export const IPC_INVOKE_CHANNELS = {
  selectWorkspace: 'workspace:select',
  getWorkspacePath: 'workspace:get',
  getRecentWorkspaces: 'workspace:recent',
  switchWorkspace: 'workspace:switch',
  showInFinder: 'workspace:showInFinder',
  openWorkspaceLink: 'workspace:openLink',
  listArticles: 'articles:list',
  readArticle: 'articles:read',
  saveArticle: 'articles:save',
  createArticle: 'articles:create',
  renameArticle: 'articles:rename',
  moveArticle: 'articles:move',
  deleteArticle: 'articles:delete',
  duplicateArticle: 'articles:duplicate',
  searchArticlesContent: 'articles:search',
  listFolders: 'folders:list',
  createFolder: 'folders:create',
  deleteFolder: 'folders:delete',
  moveFolder: 'folders:move',
  saveLocalImage: 'image:saveLocal',
  uploadRemoteImage: 'image:uploadRemote',
  copyImage: 'image:copy',
  saveImageAs: 'image:saveAs',
  getImageBedConfig: 'config:getImageBed',
  saveImageBedConfig: 'config:saveImageBed',
  testImageBedUpload: 'config:testImageBed',
  getStartupConfig: 'config:getStartup',
  saveStartupConfig: 'config:saveStartup',
  openPlatformLogin: 'platform:openLogin',
  logoutPlatform: 'platform:logout',
  setPlatformProxy: 'platform:setProxy',
  getPlatformAuthStates: 'platform:authStates',
  getPlatformAccounts: 'platform:getAccounts',
  getGitStatus: 'git:status',
  pushGitWorkspace: 'git:push',
  showEditorContextMenu: 'editor:contextMenu',
  importTyporaThemeCss: 'theme:importTyporaCss',
  exportArticle: 'file:export',
  publishWeixinDraft: 'publish:weixinDraft',
  publishMultiPlatform: 'publish:multiPlatform',
} as const;

export const IPC_SEND_CHANNELS = {
  setRecentFiles: 'menu:setRecentFiles',
} as const;

export const IPC_EVENT_CHANNELS = {
  onMenuAction: 'menu:action',
  onPlatformAuthUpdated: 'platform:authStatesUpdated',
} as const;

export type IpcInvokeMethod = keyof typeof IPC_INVOKE_CHANNELS;
export type IpcInvokeChannel = (typeof IPC_INVOKE_CHANNELS)[IpcInvokeMethod];
export type IpcSendChannel = (typeof IPC_SEND_CHANNELS)[keyof typeof IPC_SEND_CHANNELS];
export type IpcEventChannel = (typeof IPC_EVENT_CHANNELS)[keyof typeof IPC_EVENT_CHANNELS];

export interface IpcParityReport {
  ok: boolean;
  errors: string[];
}

/** Validates 3-end parity across shared ElectronAPI contract, preload bridge, and main IPC handlers. */
export function verifyIpcParity(input: {
  electronApiMethods: readonly string[];
  contractInvokeMap: Record<string, string>;
  contractSendMap: Record<string, string>;
  contractEventMap: Record<string, string>;
  preloadInvokeChannels: readonly string[];
  preloadSendChannels: readonly string[];
  preloadEventChannels: readonly string[];
  mainHandleChannels: readonly string[];
  mainOnChannels: readonly string[];
}): IpcParityReport {
  const errors: string[] = [];
  const contractMethods = new Set([
    ...Object.keys(input.contractInvokeMap),
    ...Object.keys(input.contractSendMap),
    ...Object.keys(input.contractEventMap),
  ]);
  const apiMethods = new Set(input.electronApiMethods);

  for (const method of apiMethods) {
    if (!contractMethods.has(method)) {
      errors.push(`ElectronAPI method "${method}" is missing from ipcContract maps.`);
    }
  }
  for (const method of contractMethods) {
    if (!apiMethods.has(method)) {
      errors.push(`ipcContract method "${method}" does not exist on ElectronAPI.`);
    }
  }

  const expectedInvoke = new Set(Object.values(input.contractInvokeMap));
  const actualPreloadInvoke = new Set(input.preloadInvokeChannels);
  const actualMainHandle = new Set(input.mainHandleChannels);

  for (const ch of expectedInvoke) {
    if (!actualPreloadInvoke.has(ch)) {
      errors.push(`Preload missing ipcRenderer.invoke for contract channel "${ch}".`);
    }
    if (!actualMainHandle.has(ch)) {
      errors.push(`Main process missing ipcMain.handle for contract channel "${ch}".`);
    }
  }
  for (const ch of actualPreloadInvoke) {
    if (!expectedInvoke.has(ch)) {
      errors.push(`Preload invokes unregistered channel "${ch}".`);
    }
  }
  for (const ch of actualMainHandle) {
    if (!expectedInvoke.has(ch)) {
      errors.push(`Main registers unregistered ipcMain.handle channel "${ch}".`);
    }
  }

  const expectedSend = new Set(Object.values(input.contractSendMap));
  const actualPreloadSend = new Set(input.preloadSendChannels);
  const actualMainOn = new Set(input.mainOnChannels);
  for (const ch of expectedSend) {
    if (!actualPreloadSend.has(ch)) errors.push(`Preload missing ipcRenderer.send for "${ch}".`);
    if (!actualMainOn.has(ch)) errors.push(`Main missing ipcMain.on for "${ch}".`);
  }
  for (const ch of actualPreloadSend) {
    if (!expectedSend.has(ch)) errors.push(`Preload sends unregistered channel "${ch}".`);
  }
  for (const ch of actualMainOn) {
    if (!expectedSend.has(ch)) errors.push(`Main registers unregistered ipcMain.on channel "${ch}".`);
  }

  const expectedEvents = new Set(Object.values(input.contractEventMap));
  const actualPreloadEvents = new Set(input.preloadEventChannels);
  for (const ch of expectedEvents) {
    if (!actualPreloadEvents.has(ch)) errors.push(`Preload missing ipcRenderer.on for "${ch}".`);
  }
  for (const ch of actualPreloadEvents) {
    if (!expectedEvents.has(ch)) errors.push(`Preload listens to unregistered event "${ch}".`);
  }

  return { ok: errors.length === 0, errors };
}
