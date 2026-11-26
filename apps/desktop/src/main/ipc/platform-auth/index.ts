import { session } from 'electron';
import { IPC_EVENT_CHANNELS, IPC_INVOKE_CHANNELS, type PlatformId } from '@vcat/shared';
import {
  batchSyncHeartbeatResults,
  readAccountDatabase,
  upsertAccountRecord,
} from '../../accountStore';
import { CHROME_DESKTOP_UA } from '../../browserStealth';
import { InternalBrowserManager } from '../../internalBrowserManager';
import { RENDERER_THEME_PROBE, buildRendererThemeWatch } from '../../loginWindowBar';
import { checkPlatformAuthStates, verifyPlatformAuth } from '../../publishHandlers';
import { hasSessionAuthCookies } from '../../publishSessionAuth';
import { noticeSessionCredentialStorage, type MainIpcContext } from '../context';
import { createSharedCheck } from '../../authCheckOnce';

export { CHROME_DESKTOP_UA };

let heartbeatTimer: NodeJS.Timeout | null = null;
const browserManager = new InternalBrowserManager();
let sharedCheck: ReturnType<typeof createSharedCheck<Partial<Record<PlatformId, boolean>>>> | null = null;

/**
 * 全部平台账号检测的唯一入口（心跳、窗口聚焦、渲染层刷新共用）：并发时只检测一次，
 * 每个平台一出结果就单独推给渲染层（不等最慢的平台），结束后落库并广播整份结果。
 * fresh=true（用户点「刷新」/打开发布弹窗）时不复用已在跑的那一轮，旧一轮的结果不再广播。
 */
export function checkAuthStatesOnce(
  ctx: Pick<MainIpcContext, 'readAppConfig' | 'getMainWindow'>,
  opts?: { fresh?: boolean }
): Promise<Partial<Record<PlatformId, boolean>>> {
  sharedCheck ??= createSharedCheck(async ({ isLatest }) => {
    const send = (states: Partial<Record<PlatformId, boolean>>) => {
      if (isLatest()) ctx.getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, states);
    };
    const states = await checkPlatformAuthStates({
      session,
      getAppConfig: ctx.readAppConfig,
      onResult: (id, ok) => send({ [id]: ok }),
    });
    if (isLatest()) await batchSyncHeartbeatResults(states);
    send(states);
    return states;
  });
  return sharedCheck(opts);
}

/** Starts periodic background heartbeat sync for platform session cookies. */
export function startHeartbeatEngine(ctx: MainIpcContext): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  const runHeartbeat = async () => {
    try {
      await checkAuthStatesOnce(ctx);
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
    async (event, platformId: PlatformId, loginUrl: string) => {
      // 登录 Cookie 由内置浏览器落盘、加密依赖系统钥匙串：不可用时先明确提示（不阻止登录）。
      void noticeSessionCredentialStorage();
      // 登录窗口顶栏跟随 app 内主题：从发起调用的 Vmark 界面读当前主题，读不到就用默认浅色。
      const appTheme = await Promise.race([
        event.sender.executeJavaScript(RENDERER_THEME_PROBE).catch(() => null),
        new Promise((r) => setTimeout(() => r(null), 500)),
      ]);
      const targetSession = session.fromPartition(`persist:platform_${platformId}`);
      const isAuthorized = await browserManager.openPlatformBrowser({
        platformId,
        loginUrl,
        targetSession,
        appTheme,
        watchAppTheme: (knownThemeId) => event.sender.executeJavaScript(buildRendererThemeWatch(knownThemeId)),
        hasAuthCookies: () => hasSessionAuthCookies(session, platformId),
        checkAuth: () => verifyPlatformAuth({ session, platformId, getAppConfig: readAppConfig }),
        onAuthorized: async () => {
          sharedCheck?.invalidate();
          await upsertAccountRecord(platformId, {
            authorized: true,
            statusMessage: '授权有效',
          });
          getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, { [platformId]: true });
        },
      });

      sharedCheck?.invalidate();
      await upsertAccountRecord(platformId, {
        authorized: isAuthorized,
        statusMessage: isAuthorized ? '授权有效' : '未登录或已失效',
      });
      getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.onPlatformAuthUpdated, { [platformId]: isAuthorized });
      return isAuthorized;
    }
  );

  ipcMain.handle(IPC_INVOKE_CHANNELS.logoutPlatform, async (_event, platformId: PlatformId) => {
    sharedCheck?.invalidate();
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

  // 渲染层主动刷新：强制开新一轮，避免拿到用户登录前就开始的旧检测。
  ipcMain.handle(IPC_INVOKE_CHANNELS.getPlatformAuthStates, () => checkAuthStatesOnce(ctx, { fresh: true }));

  ipcMain.handle(IPC_INVOKE_CHANNELS.getPlatformAccounts, async () => readAccountDatabase());
}
