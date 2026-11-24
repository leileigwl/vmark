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

let sessionNoticeShown = false;

/**
 * 各平台登录 Cookie / 会话数据由内置浏览器（Chromium 分区 persist:platform_*）保存，不经主进程写盘；
 * 其中 Cookie 的加密同样依赖系统钥匙串。钥匙串不可用时在打开登录窗口前明确提示一次（不阻止登录）。
 */
export async function noticeSessionCredentialStorage(): Promise<void> {
  if (sessionNoticeShown) return;
  const cipher = await getSafeStorageCipher();
  if (cipher.available) return;
  sessionNoticeShown = true;
  const message = '系统钥匙串不可用，平台登录 Cookie 无法加密保护。';
  const detail = `各平台的登录 Cookie 和会话数据由内置浏览器保存在本机，加密依赖系统钥匙串（macOS 钥匙串 / Windows DPAPI / Linux libsecret）。原因：${cipher.reason}。仍可正常登录，但这些数据只有弱保护；在系统里启用钥匙串后重启 Vmark 即可恢复加密。`;
  console.warn(`[secretStore] ${message} ${detail}`);
  await dialog
    .showMessageBox({ type: 'warning', title: 'Vmark 凭据保存', message, detail, buttons: ['知道了'] })
    .catch((err) => console.warn(`[secretStore] 提示弹窗失败：${errText(err)}`));
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
