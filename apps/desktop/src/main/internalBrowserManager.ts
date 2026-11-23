import path from 'node:path';
import { BrowserWindow, WebContentsView, type Session } from 'electron';
import type { PlatformId } from '@vcat/shared';
import {
  applyChromeHeadersToRecord,
  CHROME_DESKTOP_UA,
  encodeFingerprintArg,
  getPlatformFingerprintProfile,
} from './browserStealth';
import { LOGIN_BAR_HEIGHT, buildLoginBarHtml, loginWindowName, nextLoginBarAction, resolveLoginBarTheme } from './loginWindowBar';

const TOOLBAR_HEIGHT = LOGIN_BAR_HEIGHT;
const AUTH_CHECK_TIMEOUT_MS = 3000;

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
  private cleanupActiveSite: (() => void) | null = null;

  /**
   * Opens the single Vmark login window for one platform: a unified top bar (platform name, 「登录完成」, close)
   * above the platform's isolated site view. When opened signed-out, it closes itself as soon as sign-in is detected.
   */
  async openPlatformBrowser(params: {
    platformId: PlatformId;
    loginUrl: string;
    targetSession: Session;
    checkAuth: () => Promise<boolean>;
    onAuthorized?: () => Promise<void> | void;
    /** Vmark 主界面当前主题快照（RENDERER_THEME_PROBE 的结果），顶栏按它配色而不是跟随系统。 */
    appTheme?: unknown;
  }): Promise<boolean> {
    const { platformId, loginUrl, targetSession, checkAuth, onAuthorized, appTheme } = params;
    const barTheme = resolveLoginBarTheme(appTheme);
    const title = `${loginWindowName(platformId)} · 登录`;
    const verify = () =>
      Promise.race([
        checkAuth().catch(() => false),
        new Promise<boolean>((r) => setTimeout(() => r(false), AUTH_CHECK_TIMEOUT_MS)),
      ]);
    const signedInAtOpen = await verify();

    if (this.activeWindow && !this.activeWindow.isDestroyed()) {
      // 同一时间只有一个登录窗口：换平台时关掉旧的，旧调用方会在 closed 时拿到自己的结果。
      this.activeWindow.destroy();
    }
    const win = new BrowserWindow({ width: 1120, height: 780, backgroundColor: barTheme.scheme === 'dark' ? '#18191c' : '#ffffff', title });
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
    win.on('resize', layoutViews);
    win.on('page-title-updated', (e) => e.preventDefault());
    win.on('close', () => {
      this.cleanupActiveSite?.();
      this.cleanupActiveSite = null;
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
    const handleAuth = async (trigger: 'cookie' | 'done') => {
      if (closing || win.isDestroyed()) return;
      const signedIn = await verify();
      if (signedIn && !signedInAtOpen) await onAuthorized?.();
      const action = nextLoginBarAction({ signedInAtOpen, signedIn, trigger });
      if (action.status) setStatus(action.status);
      if (action.close) {
        closing = true;
        setTimeout(() => {
          if (!win.isDestroyed()) win.destroy();
        }, action.status ? 600 : 0);
      }
    };

    void toolbarView.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(buildLoginBarHtml({ platformId, signedInAtOpen, appTheme }))}`
    );
    toolbarView.webContents.on('will-navigate', (event, targetUrl) => {
      if (!targetUrl.startsWith('vmark-nav://')) return;
      event.preventDefault();
      const siteWc = this.activeSiteView?.webContents;
      if (targetUrl === 'vmark-nav://back' && siteWc?.canGoBack()) siteWc.goBack();
      else if (targetUrl === 'vmark-nav://reload') siteWc?.reload();
      else if (targetUrl === 'vmark-nav://done') void handleAuth('done');
      else if (targetUrl === 'vmark-nav://close' && !win.isDestroyed()) win.destroy();
    });

    const partition = `persist:platform_${platformId}`;
    attachInternalBrowserStealth(targetSession, partition);
    const siteView = new WebContentsView({
      webPreferences: {
        partition,
        preload: getStealthPreloadPath(),
        additionalArguments: [encodeFingerprintArg(getPlatformFingerprintProfile(platformId))],
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    siteView.setBackgroundColor('#ffffff');
    this.activeSiteView = siteView;
    win.contentView.addChildView(siteView);
    layoutViews();

    siteView.webContents.setUserAgent(CHROME_DESKTOP_UA);
    // Keep target=_blank / window.open links inside the same view so no unclosable popups spawn
    siteView.webContents.setWindowOpenHandler((details) => {
      if (details.url) void siteView.webContents.loadURL(details.url);
      return { action: 'deny' };
    });
    // Prevent editor pages' beforeunload prompts from blocking the close button
    siteView.webContents.on('will-prevent-unload', (event) => event.preventDefault());
    siteView.webContents.on('did-fail-load', (_ev, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return;
      void siteView.webContents.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(buildLoadErrorHtml(errorCode, errorDescription, validatedURL))}`
      );
    });

    let authCheckTimer: NodeJS.Timeout | null = null;
    const cookieListener = (_ev: Electron.Event, _cookie: Electron.Cookie, _cause: unknown, removed?: boolean) => {
      if (removed || authCheckTimer) return;
      authCheckTimer = setTimeout(() => {
        authCheckTimer = null;
        void handleAuth('cookie');
      }, 1500);
    };
    targetSession.cookies.on('changed', cookieListener);
    this.cleanupActiveSite = () => {
      if (authCheckTimer) clearTimeout(authCheckTimer);
      targetSession.cookies.removeListener('changed', cookieListener);
    };

    void siteView.webContents.loadURL(loginUrl).catch(() => {});

    return new Promise<boolean>((resolve) => {
      win.once('closed', () => {
        void verify().then(resolve);
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
