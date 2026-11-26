import path from 'node:path';
import { BrowserWindow, WebContentsView, type Session } from 'electron';
import type { PlatformId } from '@vcat/shared';
import {
  applyChromeHeadersToRecord,
  CHROME_DESKTOP_UA,
  encodeFingerprintArg,
  getPlatformFingerprintProfile,
} from './browserStealth';
import {
  LOGIN_BAR_HEIGHT,
  appThemeIdOf,
  buildLoginBarHtml,
  buildLoginBarThemeScript,
  loginWindowBackground,
  loginWindowName,
  nextLoginBarAction,
  parseLoginBarActionUrl,
  resolveLoginBarTheme,
} from './loginWindowBar';

const TOOLBAR_HEIGHT = LOGIN_BAR_HEIGHT;
const AUTH_CHECK_TIMEOUT_MS = 15000;

const configuredStealthPartitions = new Set<string>();

function buildLoadErrorHtml(errorCode: number, errorDescription: string, validatedURL: string): string {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>网络连接失败</title></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#1e293b;">
    <div style="background:white;padding:36px 32px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.06);text-align:center;max-width:440px;border:1px solid #e2e8f0;">
      <div style="font-size:42px;margin-bottom:12px;">⚠️</div>
      <h2 style="margin:0 0 8px 0;font-size:18px;font-weight:600;">无法连接授权页面</h2>
      <p style="margin:0 0 18px 0;font-size:13px;color:#64748b;line-height:1.6;">
        连接至平台登录服务超时或受阻（错误码: <code>${errorCode}</code> ${errorDescription}）<br/>
        <span style="font-size:11px;color:#94a3b8;word-break:break-all;">${validatedURL}</span>
      </p>
      <button onclick="window.location.href='${validatedURL}'" style="background:#007aff;color:white;border:none;padding:9px 24px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">重新尝试连接</button>
    </div>
  </body>
</html>`;
}

/** Ensures Electron partition sends realistic Chrome UA + Sec-CH-UA* headers and strips frame blockers. */
export function attachInternalBrowserStealth(targetSession: Session, partition: string): void {
  if (configuredStealthPartitions.has(partition)) return;
  configuredStealthPartitions.add(partition);

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

function getStealthPreloadPath(): string {
  return path.join(__dirname, '../preload/stealthLogin.js');
}

/**
 * Manages Vmark's single global built-in isolated browser window and silent background runner.
 */
export class InternalBrowserManager {
  private activeWindow: BrowserWindow | null = null;
  private activeToolbarView: WebContentsView | null = null;
  private activeSiteView: WebContentsView | null = null;

  /**
   * Opens the single Vmark login window for one platform: a unified top bar (platform name, 「登录完成」, close)
   * above the platform's isolated site view. When opened signed-out, it closes itself as soon as sign-in is detected.
   */
  async openPlatformBrowser(params: {
    platformId: PlatformId;
    loginUrl: string;
    targetSession: Session;
    checkAuth: () => Promise<boolean>;
    /** 仅凭本地 Cookie 预判是否可能已登录：未登录时跳过启动前网络检测，也能避免登录中匿名 Cookie 触发高频远端校验。 */
    hasAuthCookies?: () => Promise<boolean>;
    onAuthorized?: () => Promise<void> | void;
    /** Vmark 主界面当前主题快照（RENDERER_THEME_PROBE 的结果），顶栏按它配色而不是跟随系统。 */
    appTheme?: unknown;
    /** 等 Vmark 主题从 knownThemeId 变成别的后返回新快照（没变返回 null，读不到就抛错），窗口开着时顶栏据此实时换色。 */
    watchAppTheme?: (knownThemeId: string) => Promise<unknown>;
  }): Promise<boolean> {
    const { platformId, loginUrl, targetSession, checkAuth, hasAuthCookies, onAuthorized, appTheme, watchAppTheme } = params;
    const barTheme = resolveLoginBarTheme(appTheme);
    const title = `${loginWindowName(platformId)} · 登录`;
    const verify = () =>
      Promise.race([
        checkAuth().catch(() => false),
        new Promise<boolean>((r) => setTimeout(() => r(false), AUTH_CHECK_TIMEOUT_MS)),
      ]);
    const signedInAtOpen = hasAuthCookies
      ? (await hasAuthCookies().catch(() => false))
        ? await verify()
        : false
      : await verify();

    if (this.activeWindow && !this.activeWindow.isDestroyed()) {
      // 同一时间只有一个登录窗口：换平台时关掉旧的，旧调用方会在 closed 时拿到自己的结果。
      this.activeWindow.destroy();
    }
    const win = new BrowserWindow({ width: 1120, height: 780, backgroundColor: loginWindowBackground(barTheme), title });
    const toolbarView = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false } });
    win.contentView.addChildView(toolbarView);
    this.activeWindow = win;
    this.activeToolbarView = toolbarView;

    const layoutViews = () => {
      if (win.isDestroyed()) return;
      const [width, height] = win.getContentSize();
      toolbarView.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT });
      this.activeSiteView?.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
    };
    const keepTitle = (e: Electron.Event) => e.preventDefault();
    win.on('resize', layoutViews);
    win.on('page-title-updated', keepTitle);
    // 本窗口自己的释放清单（不挂在 manager 上：换平台时旧窗口的 closed 可能晚于新窗口创建，不能误清新窗口）。
    const disposers: Array<() => void> = [];
    let siteView: WebContentsView | null = null;
    // 'closed' 对用户点关闭（close→closed）和 win.destroy()（只发 closed）都会触发；'close' 对 destroy() 不触发。
    win.once('closed', () => {
      for (const dispose of disposers.splice(0)) dispose();
      win.off('resize', layoutViews);
      win.off('page-title-updated', keepTitle);
      // WebContentsView 的 webContents 不会随窗口销毁，必须显式 close()，否则渲染进程和内存残留。
      for (const view of [siteView, toolbarView]) {
        if (!view) continue;
        if (!win.isDestroyed()) win.contentView.removeChildView(view);
        if (!view.webContents.isDestroyed()) view.webContents.close();
      }
      if (this.activeWindow === win) {
        this.activeSiteView = null;
        this.activeToolbarView = null;
        this.activeWindow = null;
      }
    });

    const setStatus = (text: string) => {
      if (win.isDestroyed() || toolbarView.webContents.isDestroyed()) return;
      void toolbarView.webContents
        .executeJavaScript(`(() => { const s = document.getElementById('bar-status'); if (s) s.textContent = ${JSON.stringify(text)}; })();`)
        .catch(() => {});
    };
    let closing = false;
    let checkingAuth = false;
    let pendingDone = false;
    let closeTimer: NodeJS.Timeout | null = null;
    disposers.push(() => {
      if (closeTimer) clearTimeout(closeTimer);
    });
    const handleAuth = async (trigger: 'cookie' | 'done') => {
      if (closing || win.isDestroyed()) return;
      if (trigger === 'done' && signedInAtOpen) {
        closing = true;
        win.destroy();
        return;
      }
      if (checkingAuth) {
        if (trigger === 'done') {
          pendingDone = true;
          setStatus('正在检测登录状态…');
        }
        return;
      }
      if (trigger !== 'done' && !signedInAtOpen && hasAuthCookies) {
        const hasCookies = await hasAuthCookies().catch(() => false);
        if (!hasCookies) return;
      }
      if (trigger === 'done') setStatus('正在检测登录状态…');
      checkingAuth = true;
      try {
        const signedIn = await verify();
        if (signedIn && !signedInAtOpen) await onAuthorized?.();
        const action = nextLoginBarAction({ signedInAtOpen, signedIn, trigger });
        if (action.status) setStatus(action.status);
        if (action.close) {
          closing = true;
          closeTimer = setTimeout(() => {
            if (!win.isDestroyed()) win.destroy();
          }, action.status ? 600 : 0);
        }
      } finally {
        checkingAuth = false;
        if (pendingDone && !closing && !win.isDestroyed()) {
          pendingDone = false;
          void handleAuth('done');
        }
      }
    };

    void toolbarView.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(buildLoginBarHtml({ platformId, signedInAtOpen, appTheme }))}`
    );
    // 窗口开着时跟随 Vmark 主题：每次主题变化就给顶栏换令牌；窗口关了或读不到主题就停止。
    let followingTheme = true;
    disposers.push(() => {
      followingTheme = false;
    });
    const followAppTheme = async (knownThemeId: string) => {
      while (followingTheme && watchAppTheme) {
        let snapshot: unknown;
        try {
          snapshot = await watchAppTheme(knownThemeId);
        } catch {
          return;
        }
        if (!followingTheme || win.isDestroyed()) return;
        if (!snapshot) continue;
        knownThemeId = appThemeIdOf(snapshot);
        const next = resolveLoginBarTheme(snapshot);
        win.setBackgroundColor(loginWindowBackground(next));
        if (!toolbarView.webContents.isDestroyed()) {
          void toolbarView.webContents.executeJavaScript(buildLoginBarThemeScript(next)).catch(() => {});
        }
      }
    };
    void followAppTheme(appThemeIdOf(appTheme));
    const dispatchToolbarAction = (targetUrl: string, event?: Electron.Event) => {
      const action = parseLoginBarActionUrl(targetUrl);
      if (!action) return;
      if (targetUrl.startsWith('vmark-nav://')) event?.preventDefault();
      const siteWc = siteView?.webContents;
      if (action === 'back' && siteWc?.canGoBack()) siteWc.goBack();
      else if (action === 'reload') siteWc?.reload();
      else if (action === 'done') void handleAuth('done');
      else if (action === 'close' && !win.isDestroyed()) win.destroy();
    };
    const onToolbarNavigate = (event: Electron.Event, targetUrl: string) => dispatchToolbarAction(targetUrl, event);
    const onToolbarInPage = (event: Electron.Event, targetUrl: string) => dispatchToolbarAction(targetUrl, event);
    const onToolbarTitle = (event: Electron.Event, titleText: string) => dispatchToolbarAction(titleText, event);
    toolbarView.webContents.on('will-navigate', onToolbarNavigate);
    toolbarView.webContents.on('did-navigate-in-page', onToolbarInPage);
    toolbarView.webContents.on('page-title-updated', onToolbarTitle);
    disposers.push(() => {
      toolbarView.webContents.off('will-navigate', onToolbarNavigate);
      toolbarView.webContents.off('did-navigate-in-page', onToolbarInPage);
      toolbarView.webContents.off('page-title-updated', onToolbarTitle);
    });

    const partition = `persist:platform_${platformId}`;
    attachInternalBrowserStealth(targetSession, partition);
    siteView = new WebContentsView({
      webPreferences: {
        partition,
        preload: getStealthPreloadPath(),
        additionalArguments: [encodeFingerprintArg(getPlatformFingerprintProfile(platformId))],
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const siteWc = siteView.webContents;
    siteView.setBackgroundColor('#ffffff');
    this.activeSiteView = siteView;
    win.contentView.addChildView(siteView);
    layoutViews();

    siteWc.setUserAgent(CHROME_DESKTOP_UA);
    // Keep target=_blank / window.open links inside the same view so no unclosable popups spawn
    siteWc.setWindowOpenHandler((details) => {
      if (details.url) void siteWc.loadURL(details.url);
      return { action: 'deny' };
    });
    // Prevent editor pages' beforeunload prompts from blocking the close button
    const allowUnload = (event: Electron.Event) => event.preventDefault();
    const onFailLoad = (_ev: Electron.Event, errorCode: number, errorDescription: string, validatedURL: string) => {
      if (errorCode === -3) return;
      void siteWc.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(buildLoadErrorHtml(errorCode, errorDescription, validatedURL))}`
      );
    };
    siteWc.on('will-prevent-unload', allowUnload);
    siteWc.on('did-fail-load', onFailLoad);
    disposers.push(() => {
      siteWc.off('will-prevent-unload', allowUnload);
      siteWc.off('did-fail-load', onFailLoad);
    });

    let authCheckTimer: NodeJS.Timeout | null = null;
    const scheduleAuthCheck = (delayMs: number) => {
      if (authCheckTimer) return;
      authCheckTimer = setTimeout(() => {
        authCheckTimer = null;
        void handleAuth('cookie');
      }, delayMs);
    };
    const cookieListener = (_ev: Electron.Event, _cookie: Electron.Cookie, _cause: unknown, removed?: boolean) => {
      if (removed) return;
      scheduleAuthCheck(1500);
    };
    const onSiteNavigate = () => {
      if (!signedInAtOpen) scheduleAuthCheck(350);
    };
    targetSession.cookies.on('changed', cookieListener);
    siteWc.on('did-navigate', onSiteNavigate);
    disposers.push(() => {
      if (authCheckTimer) clearTimeout(authCheckTimer);
      authCheckTimer = null;
      targetSession.cookies.removeListener('changed', cookieListener);
      siteWc.off('did-navigate', onSiteNavigate);
    });

    void siteWc.loadURL(loginUrl).catch(() => {});

    return new Promise<boolean>((resolve) => {
      win.once('closed', () => {
        if (closing) {
          resolve(true);
          return;
        }
        const finalize = async () => {
          if (hasAuthCookies && !(await hasAuthCookies().catch(() => false))) return false;
          return verify();
        };
        void finalize().then(resolve);
      });
    });
  }

  /** Runs a silent background browser task inside the platform's isolated internal environment. */
  async runInPlatformBrowser<T>(params: {
    platformId: PlatformId;
    url: string;
    targetSession: Session;
    task: (webContents: Electron.WebContents) => Promise<T>;
  }): Promise<T> {
    const { platformId, url, targetSession, task } = params;
    const partition = `persist:platform_${platformId}`;
    attachInternalBrowserStealth(targetSession, partition);

    const fpArg = encodeFingerprintArg(getPlatformFingerprintProfile(platformId));
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 820,
      webPreferences: {
        partition,
        preload: getStealthPreloadPath(),
        additionalArguments: [fpArg],
        webSecurity: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    try {
      win.webContents.setUserAgent(CHROME_DESKTOP_UA);
      win.webContents.on('will-prevent-unload', (event) => event.preventDefault());
      await win.loadURL(url);
      return await task(win.webContents);
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }
}
