import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import { IPC_EVENT_CHANNELS, IPC_INVOKE_CHANNELS, type PlatformId } from '@vcat/shared';
import {
  batchSyncHeartbeatResults,
  readAccountDatabase,
  upsertAccountRecord,
} from '../../accountStore';
import { BrowserProfileManager, isIsolatedProfilePlatform } from '../../browserProfileManager';
import {
  applyChromeHeadersToRecord,
  applySessionProxy,
  CHROME_DESKTOP_UA,
  normalizeProxyRules,
} from '../../browserStealth';
import { checkPlatformAuthStates, verifyPlatformAuth } from '../../publishHandlers';
import type { MainIpcContext } from '../context';

export { CHROME_DESKTOP_UA };

let heartbeatTimer: NodeJS.Timeout | null = null;
const configuredHeaderPartitions = new Set<string>();

function getStealthPreloadPath(): string {
  return path.join(__dirname, '../preload/stealthLogin.js');
}

function createProfileManager(): BrowserProfileManager {
  return new BrowserProfileManager({ userDataPath: app.getPath('userData') });
}

function attachBrowserStealthHooks(targetSession: Electron.Session, partition: string): void {
  if (configuredHeaderPartitions.has(partition)) return;
  configuredHeaderPartitions.add(partition);

  targetSession.setUserAgent(CHROME_DESKTOP_UA);
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase();
      if (
        lower === 'x-frame-options' ||
        lower === 'content-security-policy' ||
        lower === 'content-security-policy-report-only'
      ) {
        delete responseHeaders[key];
      }
    }
    callback({ cancel: false, responseHeaders });
  });

  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = applyChromeHeadersToRecord(details.requestHeaders);
    callback({ cancel: false, requestHeaders });
  });
}

async function applySavedProxiesToSessions(): Promise<void> {
  const db = await readAccountDatabase();
  for (const [pid, record] of Object.entries(db)) {
    if (!record.proxyUrl) continue;
    try {
      const targetSession = session.fromPartition(`persist:platform_${pid}`);
      await applySessionProxy(targetSession, record.proxyUrl);
    } catch {
      // ignore invalid saved proxy during background startup
    }
  }
}

/** Starts periodic background heartbeat sync for platform session cookies. */
export function startHeartbeatEngine(ctx: MainIpcContext): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  const runHeartbeat = async () => {
    try {
      await applySavedProxiesToSessions();
      const states = await checkPlatformAuthStates({ session, getAppConfig: ctx.readAppConfig });
      await batchSyncHeartbeatResults(states);
      ctx.getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, states);
    } catch {
      // transient heartbeat error ignored
    }
  };
  setTimeout(runHeartbeat, 3000);
  heartbeatTimer = setInterval(runHeartbeat, 30_000);
}

/** Stops background heartbeat timer cleanly during window shutdown. */
export function stopHeartbeatEngine(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function buildLoadErrorHtml(errorCode: number, errorDescription: string, validatedURL: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>网络连接失败</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b;">
        <div style="background: white; padding: 36px 32px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); text-align: center; max-width: 440px; border: 1px solid #e2e8f0;">
          <div style="font-size: 42px; margin-bottom: 12px;">⚠️</div>
          <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">无法连接授权页面</h2>
          <p style="margin: 0 0 18px 0; font-size: 13px; color: #64748b; line-height: 1.6;">
            连接至平台登录服务超时或受阻（错误码: <code>${errorCode}</code> ${errorDescription}）<br/>
            <span style="font-size: 11px; color: #94a3b8; word-break: break-all;">${validatedURL}</span>
          </p>
          <button onclick="window.location.href='${validatedURL}'" style="background: #007aff; color: white; border: none; padding: 9px 24px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; box-shadow: 0 2px 6px rgba(0,122,255,0.25);">
            重新尝试连接
          </button>
        </div>
      </body>
    </html>
  `;
}

/** Registers isolated Electron partition & real-Chrome profile login/logout/proxy IPC handlers. */
export function registerPlatformAuthIpc(ctx: MainIpcContext): void {
  const { ipcMain, readAppConfig, getMainWindow } = ctx;

  ipcMain.handle(
    IPC_INVOKE_CHANNELS.setPlatformProxy,
    async (_event, platformId: PlatformId, proxyUrl: string) => {
      const normalized = normalizeProxyRules(proxyUrl);
      const targetSession = session.fromPartition(`persist:platform_${platformId}`);
      await applySessionProxy(targetSession, normalized);
      await upsertAccountRecord(platformId, { proxyUrl: normalized ?? '' });
      return { ok: true, proxyUrl: normalized };
    }
  );

  ipcMain.handle(
    IPC_INVOKE_CHANNELS.openPlatformLogin,
    async (_event, platformId: PlatformId, loginUrl: string) => {
      const partition = `persist:platform_${platformId}`;
      const targetSession = session.fromPartition(partition);
      const db = await readAccountDatabase();
      const proxyUrl = db[platformId]?.proxyUrl;

      attachBrowserStealthHooks(targetSession, partition);
      await applySessionProxy(targetSession, proxyUrl).catch(() => {});

      if (isIsolatedProfilePlatform(platformId)) {
        const profileManager = createProfileManager();
        try {
          const { authorized, profileDir } = await profileManager.openIsolatedLogin({
            platformId,
            loginUrl,
            proxyUrl,
            targetSession,
            checkAuth: () => verifyPlatformAuth({ session, platformId, getAppConfig: readAppConfig }),
            onAuthorized: async () => {
              await upsertAccountRecord(platformId, {
                authorized: true,
                profileDir,
                statusMessage: '独立 Chrome Profile 授权有效',
              });
              getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, { [platformId]: true });
            },
          });
          await upsertAccountRecord(platformId, {
            authorized,
            profileDir,
            statusMessage: authorized ? '独立 Chrome Profile 授权有效' : '未登录或已失效',
          });
          const allStates = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
          await batchSyncHeartbeatResults(allStates);
          getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, allStates);
          return authorized;
        } catch {
          // Fallback to stealth-hardened Electron BrowserWindow if local Chrome is unavailable
        }
      }

      const stealthPreload = getStealthPreloadPath();
      const loginWin = new BrowserWindow({
        width: 1040,
        height: 740,
        title: `平台授权登录 - ${platformId}`,
        webPreferences: {
          partition,
          preload: stealthPreload,
          webSecurity: false,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      loginWin.webContents.setUserAgent(CHROME_DESKTOP_UA);
      loginWin.webContents.setWindowOpenHandler(() => ({
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            partition,
            preload: stealthPreload,
            webSecurity: false,
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      }));

      loginWin.webContents.on('did-create-window', (childWin) => {
        childWin.webContents.setUserAgent(CHROME_DESKTOP_UA);
      });

      loginWin.webContents.on('did-fail-load', (_ev, errorCode, errorDescription, validatedURL) => {
        if (errorCode === -3) return;
        const errorHtml = buildLoadErrorHtml(errorCode, errorDescription, validatedURL);
        void loginWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
      });

      let authCheckTimer: NodeJS.Timeout | null = null;
      const cookieListener = (_ev: Electron.Event, _cookie: Electron.Cookie, _cause: unknown, removed?: boolean) => {
        if (removed) return;
        if (authCheckTimer) clearTimeout(authCheckTimer);
        authCheckTimer = setTimeout(async () => {
          const isAuthorized = await verifyPlatformAuth({ session, platformId, getAppConfig: readAppConfig });
          if (isAuthorized) {
            await upsertAccountRecord(platformId, { authorized: true, statusMessage: '授权有效' });
            getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, { [platformId]: true });
          }
        }, 1200);
      };
      targetSession.cookies.on('changed', cookieListener);

      try {
        await loginWin.loadURL(loginUrl);
      } catch {
        // Handled by did-fail-load
      }

      return new Promise<boolean>((resolve) => {
        loginWin.on('closed', async () => {
          if (authCheckTimer) clearTimeout(authCheckTimer);
          targetSession.cookies.removeListener('changed', cookieListener);
          const isAuthorized = await verifyPlatformAuth({ session, platformId, getAppConfig: readAppConfig });
          await upsertAccountRecord(platformId, {
            authorized: isAuthorized,
            statusMessage: isAuthorized ? '授权有效' : '未登录或已失效',
          });
          const allStates = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
          await batchSyncHeartbeatResults(allStates);
          getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, allStates);
          resolve(isAuthorized);
        });
      });
    }
  );

  ipcMain.handle(IPC_INVOKE_CHANNELS.logoutPlatform, async (_event, platformId: PlatformId) => {
    const partition = `persist:platform_${platformId}`;
    const targetSession = session.fromPartition(partition);
    await targetSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
    });
    await targetSession.clearCache();
    await targetSession.clearAuthCache();
    await targetSession.cookies.flushStore();

    if (isIsolatedProfilePlatform(platformId)) {
      const profileDir = createProfileManager().getProfileDir(platformId);
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }

    await upsertAccountRecord(platformId, {
      authorized: false,
      statusMessage: '未授权或已退出登录',
    });
    const states = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
    states[platformId] = false;
    await batchSyncHeartbeatResults(states, { [platformId]: '未授权或已退出登录' });
    getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, states);
    return true;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.getPlatformAuthStates, async () => {
    await applySavedProxiesToSessions();
    const states = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
    await batchSyncHeartbeatResults(states);
    return states;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.getPlatformAccounts, async () => readAccountDatabase());
}
