import { app, dialog, safeStorage, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createConfigStore, errText } from '../configStore';
import type { SecretCipher } from '../secretStore';
import {
  DEFAULT_CONFIG,
  recordRecentWorkspace,
  resolveSafePath,
  type AppConfig,
} from './pathUtils';

export { recordRecentWorkspace, resolveSafePath, type AppConfig };

/** Resolves the persistent JSON config path under Electron userData. */
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'vcat-config.json');
}

/**
 * Electron safeStorage 作为凭据加密后端。Linux 上只有 basic_text（没有 keyring，密钥是写死的）
 * 等于没加密，按不可用处理；VMARK_ALLOW_WEAK_SAFESTORAGE=1 仅供 L3 测试在无 keyring 的 CI 上走加密路径。
 */
async function getSafeStorageCipher(): Promise<SecretCipher> {
  await app.whenReady();
  const allowWeak = process.platform === 'linux' && process.env.VMARK_ALLOW_WEAK_SAFESTORAGE === '1';
  if (allowWeak) safeStorage.setUsePlainTextEncryption(true);
  if (!safeStorage.isEncryptionAvailable()) {
    const backend = process.platform === 'linux' ? `（safeStorage 后端为 ${safeStorage.getSelectedStorageBackend()}）` : '';
    return { available: false, reason: `safeStorage 不可用${backend}` };
  }
  if (process.platform === 'linux' && !allowWeak) {
    const backend = safeStorage.getSelectedStorageBackend();
    if (backend === 'basic_text' || backend === 'unknown') {
      return { available: false, reason: `Linux 未检测到 keyring（safeStorage 后端为 ${backend}）` };
    }
  }
  return {
    available: true,
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (stored) => safeStorage.decryptString(Buffer.from(stored, 'base64')),
  };
}

function configStore() {
  return createConfigStore({
    filePath: getConfigPath(),
    getCipher: getSafeStorageCipher,
    log: (message) => console.warn(message),
    notify: (_kind, message, detail) => {
      void dialog.showMessageBox({ type: 'warning', title: 'Vmark 凭据保存', message, detail, buttons: ['知道了'] }).catch((err) => console.warn(`[secretStore] 提示弹窗失败：${errText(err)}`));
    },
  });
}

/** Loads persisted app config (credentials decrypted) or initializes the default VCatBlogs workspace folder. */
export async function readAppConfig(): Promise<AppConfig> {
  try {
    const stored = await configStore().read();
    if (stored) return { ...DEFAULT_CONFIG, ...stored } as AppConfig;
  } catch (err) {
    console.warn(`[config] 读取配置失败，使用默认配置：${errText(err)}`);
  }
  const defaultDir = path.join(app.getPath('documents'), 'VCatBlogs');
  await fs.mkdir(defaultDir, { recursive: true });
  return { ...DEFAULT_CONFIG, workspacePath: defaultDir };
}

/** Writes updated app config atomically; image-bed credentials are encrypted via the OS keychain. */
export async function writeAppConfig(config: AppConfig): Promise<void> {
  await configStore().write({ ...config });
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
