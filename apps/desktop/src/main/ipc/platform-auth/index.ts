import { session } from 'electron';
import { IPC_EVENT_CHANNELS, IPC_INVOKE_CHANNELS, type PlatformId } from '@vcat/shared';
import {
  batchSyncHeartbeatResults,
  readAccountDatabase,
  upsertAccountRecord,
} from '../../accountStore';
import { CHROME_DESKTOP_UA } from '../../browserStealth';
import { InternalBrowserManager } from '../../internalBrowserManager';
import { checkPlatformAuthStates, verifyPlatformAuth } from '../../publishHandlers';
import type { MainIpcContext } from '../context';

export { CHROME_DESKTOP_UA };

let heartbeatTimer: NodeJS.Timeout | null = null;
const browserManager = new InternalBrowserManager();

/** Starts periodic background heartbeat sync for platform session cookies. */
export function startHeartbeatEngine(ctx: MainIpcContext): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  const runHeartbeat = async () => {
    try {
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

/** Registers built-in isolated platform browser login/logout & auth-state IPC handlers. */
export function registerPlatformAuthIpc(ctx: MainIpcContext): void {
  const { ipcMain, readAppConfig, getMainWindow } = ctx;

  ipcMain.handle(
    IPC_INVOKE_CHANNELS.openPlatformLogin,
    async (_event, platformId: PlatformId, loginUrl: string) => {
      const targetSession = session.fromPartition(`persist:platform_${platformId}`);
      const isAuthorized = await browserManager.openPlatformBrowser({
        platformId,
        loginUrl,
        targetSession,
        checkAuth: () => verifyPlatformAuth({ session, platformId, getAppConfig: readAppConfig }),
        onAuthorized: async () => {
          await upsertAccountRecord(platformId, {
            authorized: true,
            statusMessage: '授权有效',
          });
          getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, { [platformId]: true });
        },
      });

      await upsertAccountRecord(platformId, {
        authorized: isAuthorized,
        statusMessage: isAuthorized ? '授权有效' : '未登录或已失效',
      });
      const allStates = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
      await batchSyncHeartbeatResults(allStates);
      getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, allStates);
      return isAuthorized;
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
    const states = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
    await batchSyncHeartbeatResults(states);
    return states;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.getPlatformAccounts, async () => readAccountDatabase());
}
