/// <reference types="vite/client" />
import type { ElectronAPI } from '@vcat/shared';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    electronFileBridge?: {
      getPathForFile: (file: File) => string;
    };
  }
}
