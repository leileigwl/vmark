import { app, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_CONFIG,
  recordRecentWorkspace,
  resolveSafePath,
  type AppConfig,
} from './pathUtils';

export { DEFAULT_CONFIG, recordRecentWorkspace, resolveSafePath, type AppConfig };

/** Resolves the persistent JSON config path under Electron userData. */
export function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'vcat-config.json');
}

/** Loads persisted app config or initializes the default VCatBlogs workspace folder. */
export async function readAppConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    const defaultDir = path.join(app.getPath('documents'), 'VCatBlogs');
    await fs.mkdir(defaultDir, { recursive: true });
    return { ...DEFAULT_CONFIG, workspacePath: defaultDir };
  }
}

/** Writes updated app config atomically to Electron userData. */
export async function writeAppConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export interface MainIpcContext {
  ipcMain: Electron.IpcMain;
  getMainWindow: () => BrowserWindow | null;
  sendMenuAction: (action: string, payload?: string) => void;
  buildApplicationMenu: (recentFiles?: string[]) => void;
  readAppConfig: () => Promise<AppConfig>;
  writeAppConfig: (config: AppConfig) => Promise<void>;
  recordRecentWorkspace: (cfg: AppConfig, dirPath: string) => void;
  resolveSafePath: (workspaceRoot: string, relativePath: string) => string;
}
