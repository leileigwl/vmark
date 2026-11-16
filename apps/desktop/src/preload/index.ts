import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI, ImageBedConfig } from '@vcat/shared';

const api: ElectronAPI = {
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
  getWorkspacePath: () => ipcRenderer.invoke('workspace:get'),
  listArticles: () => ipcRenderer.invoke('articles:list'),
  readArticle: (relativePath: string) => ipcRenderer.invoke('articles:read', relativePath),
  saveArticle: (relativePath: string, content: string) =>
    ipcRenderer.invoke('articles:save', relativePath, content),
  createArticle: (fileName: string) => ipcRenderer.invoke('articles:create', fileName),
  saveLocalImage: (base64Data: string, ext: string) =>
    ipcRenderer.invoke('image:saveLocal', base64Data, ext),
  getImageBedConfig: () => ipcRenderer.invoke('config:getImageBed'),
  saveImageBedConfig: (config: ImageBedConfig) =>
    ipcRenderer.invoke('config:saveImageBed', config),
};

contextBridge.exposeInMainWorld('electronAPI', api);
