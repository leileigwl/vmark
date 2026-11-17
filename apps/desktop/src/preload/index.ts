import { contextBridge, ipcRenderer } from 'electron';
import type {
  ContextMenuOptions,
  ElectronAPI,
  ExportArticleOptions,
  ImageBedConfig,
  PlatformId,
  StartupConfig,
} from '@vcat/shared';

const api: ElectronAPI = {
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
  getWorkspacePath: () => ipcRenderer.invoke('workspace:get'),
  getRecentWorkspaces: () => ipcRenderer.invoke('workspace:recent'),
  switchWorkspace: (dirPath: string) => ipcRenderer.invoke('workspace:switch', dirPath),
  showInFinder: (relativePath?: string) => ipcRenderer.invoke('workspace:showInFinder', relativePath),
  listArticles: () => ipcRenderer.invoke('articles:list'),
  listFolders: () => ipcRenderer.invoke('folders:list'),
  createFolder: (folderName: string) => ipcRenderer.invoke('folders:create', folderName),
  deleteFolder: (folderPath: string) => ipcRenderer.invoke('folders:delete', folderPath),
  moveFolder: (oldFolderPath: string, targetParentFolder: string) =>
    ipcRenderer.invoke('folders:move', oldFolderPath, targetParentFolder),
  readArticle: (relativePath: string) => ipcRenderer.invoke('articles:read', relativePath),
  saveArticle: (relativePath: string, content: string) =>
    ipcRenderer.invoke('articles:save', relativePath, content),
  createArticle: (fileName?: string) => ipcRenderer.invoke('articles:create', fileName),
  renameArticle: (oldRelativePath: string, newFileName: string) =>
    ipcRenderer.invoke('articles:rename', oldRelativePath, newFileName),
  moveArticle: (oldRelativePath: string, targetFolder: string) =>
    ipcRenderer.invoke('articles:move', oldRelativePath, targetFolder),
  deleteArticle: (relativePath: string) => ipcRenderer.invoke('articles:delete', relativePath),
  duplicateArticle: (relativePath: string) => ipcRenderer.invoke('articles:duplicate', relativePath),
  searchArticlesContent: (query: string) => ipcRenderer.invoke('articles:search', query),
  saveLocalImage: (base64Data: string, ext: string) =>
    ipcRenderer.invoke('image:saveLocal', base64Data, ext),
  getImageBedConfig: () => ipcRenderer.invoke('config:getImageBed'),
  saveImageBedConfig: (config: ImageBedConfig) =>
    ipcRenderer.invoke('config:saveImageBed', config),
  testImageBedUpload: (config: ImageBedConfig) =>
    ipcRenderer.invoke('config:testImageBed', config),
  getStartupConfig: () => ipcRenderer.invoke('config:getStartup'),
  saveStartupConfig: (config: StartupConfig) => ipcRenderer.invoke('config:saveStartup', config),
  openPlatformLogin: (platformId: PlatformId, loginUrl: string) =>
    ipcRenderer.invoke('platform:openLogin', platformId, loginUrl),
  getPlatformAuthStates: () => ipcRenderer.invoke('platform:authStates'),
  getGitStatus: () => ipcRenderer.invoke('git:status'),
  pushGitWorkspace: (commitMessage: string) =>
    ipcRenderer.invoke('git:push', commitMessage),
  onMenuAction: (callback: (action: string, payload?: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string, payload?: string) =>
      callback(action, payload);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
  showEditorContextMenu: (options: ContextMenuOptions) =>
    ipcRenderer.invoke('editor:contextMenu', options),
  importTyporaThemeCss: () => ipcRenderer.invoke('theme:importTyporaCss'),
  exportArticle: (options: ExportArticleOptions) =>
    ipcRenderer.invoke('file:export', options),
  setRecentFiles: (paths: string[]) =>
    ipcRenderer.send('menu:setRecentFiles', paths),
  copyImage: (src: string) =>
    ipcRenderer.invoke('image:copy', src),
  saveImageAs: (src: string) =>
    ipcRenderer.invoke('image:saveAs', src),
  openWorkspaceLink: (href: string, currentRelativePath?: string) =>
    ipcRenderer.invoke('workspace:openLink', href, currentRelativePath),
  publishWeixinDraft: (payload: Parameters<NonNullable<ElectronAPI['publishWeixinDraft']>>[0]) =>
    ipcRenderer.invoke('publish:weixinDraft', payload),
};

contextBridge.exposeInMainWorld('electronAPI', api);
