import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_EVENT_CHANNELS,
  IPC_INVOKE_CHANNELS,
  IPC_SEND_CHANNELS,
  type ContextMenuOptions,
  type ElectronAPI,
  type ExportArticleOptions,
  type ImageBedConfig,
  type PlatformId,
  type StartupConfig,
} from '@vcat/shared';

const api: ElectronAPI = {
  selectWorkspace: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.selectWorkspace),
  getWorkspacePath: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.getWorkspacePath),
  getRecentWorkspaces: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.getRecentWorkspaces),
  switchWorkspace: (dirPath: string) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.switchWorkspace, dirPath),
  showInFinder: (relativePath?: string) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.showInFinder, relativePath),
  listArticles: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.listArticles),
  listFolders: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.listFolders),
  createFolder: (folderName: string) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.createFolder, folderName),
  deleteFolder: (folderPath: string) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.deleteFolder, folderPath),
  moveFolder: (oldFolderPath: string, targetParentFolder: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.moveFolder, oldFolderPath, targetParentFolder),
  readArticle: (relativePath: string) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.readArticle, relativePath),
  saveArticle: (relativePath: string, content: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.saveArticle, relativePath, content),
  createArticle: (fileName?: string) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.createArticle, fileName),
  renameArticle: (oldRelativePath: string, newFileName: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.renameArticle, oldRelativePath, newFileName),
  moveArticle: (oldRelativePath: string, targetFolder: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.moveArticle, oldRelativePath, targetFolder),
  deleteArticle: (relativePath: string) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.deleteArticle, relativePath),
  duplicateArticle: (relativePath: string) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.duplicateArticle, relativePath),
  searchArticlesContent: (query: string) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.searchArticlesContent, query),
  saveLocalImage: (base64Data: string, ext: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.saveLocalImage, base64Data, ext),
  uploadRemoteImage: (base64Data: string, fileName: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.uploadRemoteImage, base64Data, fileName),
  getImageBedConfig: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.getImageBedConfig),
  saveImageBedConfig: (config: ImageBedConfig) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.saveImageBedConfig, config),
  testImageBedUpload: (config: ImageBedConfig) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.testImageBedUpload, config),
  getStartupConfig: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.getStartupConfig),
  saveStartupConfig: (config: StartupConfig) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.saveStartupConfig, config),
  openPlatformLogin: (platformId: PlatformId, loginUrl: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.openPlatformLogin, platformId, loginUrl),
  logoutPlatform: (platformId: PlatformId) => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.logoutPlatform, platformId),
  getPlatformAuthStates: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.getPlatformAuthStates),
  getGitStatus: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.getGitStatus),
  pushGitWorkspace: (commitMessage: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.pushGitWorkspace, commitMessage),
  onMenuAction: (callback: (action: string, payload?: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string, payload?: string) =>
      callback(action, payload);
    ipcRenderer.on(IPC_EVENT_CHANNELS.onMenuAction, handler);
    return () => ipcRenderer.removeListener(IPC_EVENT_CHANNELS.onMenuAction, handler);
  },
  showEditorContextMenu: (options: ContextMenuOptions) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.showEditorContextMenu, options),
  importTyporaThemeCss: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.importTyporaThemeCss),
  exportArticle: (options: ExportArticleOptions) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.exportArticle, options),
  setRecentFiles: (paths: string[]) =>
    ipcRenderer.send(IPC_SEND_CHANNELS.setRecentFiles, paths),
  copyImage: (src: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.copyImage, src),
  saveImageAs: (src: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.saveImageAs, src),
  openWorkspaceLink: (href: string, currentRelativePath?: string) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.openWorkspaceLink, href, currentRelativePath),
  publishWeixinDraft: (payload: Parameters<NonNullable<ElectronAPI['publishWeixinDraft']>>[0]) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.publishWeixinDraft, payload),
  publishMultiPlatform: (payload: Parameters<NonNullable<ElectronAPI['publishMultiPlatform']>>[0]) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNELS.publishMultiPlatform, payload),
  listJuejinCategories: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.listJuejinCategories),
  getPlatformAccounts: () => ipcRenderer.invoke(IPC_INVOKE_CHANNELS.getPlatformAccounts),
  onPlatformAuthUpdated: (callback: (states: Partial<Record<PlatformId, boolean>>) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      states: Partial<Record<PlatformId, boolean>>
    ) => callback(states);
    ipcRenderer.on(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, handler);
    return () => ipcRenderer.removeListener(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
