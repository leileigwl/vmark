import path from 'node:path';
import { BrowserWindow, WebContentsView, type Session } from 'electron';
import type { PlatformId } from '@vcat/shared';
import {
  applyChromeHeadersToRecord,
  CHROME_DESKTOP_UA,
  encodeFingerprintArg,
  getPlatformFingerprintProfile,
} from './browserStealth';

const TOOLBAR_HEIGHT = 44;
const configuredStealthPartitions = new Set<string>();

export function buildPlatformToolbarHtml(options: {
  platformId: PlatformId;
  url: string;
  authorized: boolean;
}): string {
  const safeUrl = options.url.replace(/[<>"'&]/g, '');
  const badgeBg = options.authorized ? '#dafbe1' : '#f1f5f9';
  const badgeFg = options.authorized ? '#116329' : '#475569';
  const badgeText = options.authorized ? '● 已授权' : '未登录';
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;height:44px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-sizing:border-box;user-select:none;">
    <button onclick="location.href='vmark-nav://back'" title="后退" style="border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;">←</button>
    <button onclick="location.href='vmark-nav://forward'" title="前进" style="border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;">→</button>
    <button onclick="location.href='vmark-nav://reload'" title="刷新" style="border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;">↻</button>
    <div id="url-pill" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;font-size:12px;color:#334155;">${safeUrl}</div>
    <span id="auth-pill" style="border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;background:${badgeBg};color:${badgeFg};white-space:nowrap;">${options.platformId} · ${badgeText}</span>
  </body>
</html>`;
}

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
 * Manages Vmark's built-in isolated per-platform browser environments (UI login view + silent runner).
 */
export class InternalBrowserManager {
  /** Opens an in-app isolated browser window with toolbar and per-platform fingerprint isolation. */
  async openPlatformBrowser(params: {
    platformId: PlatformId;
    loginUrl: string;
    targetSession: Session;
    checkAuth: () => Promise<boolean>;
    onAuthorized?: () => Promise<void> | void;
  }): Promise<boolean> {
    const { platformId, loginUrl, targetSession, checkAuth, onAuthorized } = params;
    const partition = `persist:platform_${platformId}`;
    attachInternalBrowserStealth(targetSession, partition);

    const fpArg = encodeFingerprintArg(getPlatformFingerprintProfile(platformId));
    const stealthPreload = getStealthPreloadPath();
    const initialAuthed = await checkAuth().catch(() => false);

    const win = new BrowserWindow({
      width: 1120,
      height: 780,
      title: `Vmark 独立浏览器 - ${platformId}`,
    });

    const toolbarView = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    const siteView = new WebContentsView({
      webPreferences: {
        partition,
        preload: stealthPreload,
        additionalArguments: [fpArg],
        webSecurity: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.contentView.addChildView(toolbarView);
    win.contentView.addChildView(siteView);

    const layoutViews = () => {
      const [width, height] = win.getContentSize();
      toolbarView.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT });
      siteView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
    };
    layoutViews();
    win.on('resize', layoutViews);

    let currentUrl = loginUrl;
    let currentAuthed = initialAuthed;
    const refreshToolbar = () => {
      if (win.isDestroyed()) return;
      void toolbarView.webContents
        .executeJavaScript(
          `(() => {
            const u = document.getElementById('url-pill');
            if (u) u.textContent = ${JSON.stringify(currentUrl)};
            const b = document.getElementById('auth-pill');
            if (b) {
              b.textContent = ${JSON.stringify(`${platformId} · ${currentAuthed ? '● 已授权' : '未登录'}`)};
              b.style.background = ${JSON.stringify(currentAuthed ? '#dafbe1' : '#f1f5f9')};
              b.style.color = ${JSON.stringify(currentAuthed ? '#116329' : '#475569')};
            }
          })();`
        )
        .catch(() => {});
    };

    toolbarView.webContents.on('will-navigate', (event, targetUrl) => {
      if (!targetUrl.startsWith('vmark-nav://')) return;
      event.preventDefault();
      if (targetUrl === 'vmark-nav://back' && siteView.webContents.canGoBack()) {
        siteView.webContents.goBack();
      } else if (targetUrl === 'vmark-nav://forward' && siteView.webContents.canGoForward()) {
        siteView.webContents.goForward();
      } else if (targetUrl === 'vmark-nav://reload') {
        siteView.webContents.reload();
      }
    });

    void toolbarView.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        buildPlatformToolbarHtml({ platformId, url: loginUrl, authorized: initialAuthed })
      )}`
    );

    siteView.webContents.setUserAgent(CHROME_DESKTOP_UA);
    siteView.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          partition,
          preload: stealthPreload,
          additionalArguments: [fpArg],
          webSecurity: false,
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    }));

    siteView.webContents.on('did-create-window', (childWin) => {
      childWin.webContents.setUserAgent(CHROME_DESKTOP_UA);
    });
    siteView.webContents.on('did-navigate', (_ev, url) => {
      currentUrl = url;
      refreshToolbar();
    });
    siteView.webContents.on('did-navigate-in-page', (_ev, url) => {
      currentUrl = url;
      refreshToolbar();
    });
    siteView.webContents.on('did-fail-load', (_ev, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return;
      void siteView.webContents.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(buildLoadErrorHtml(errorCode, errorDescription, validatedURL))}`
      );
    });

    let authCheckTimer: NodeJS.Timeout | null = null;
    const cookieListener = (_ev: Electron.Event, _cookie: Electron.Cookie, _cause: unknown, removed?: boolean) => {
      if (removed) return;
      if (authCheckTimer) clearTimeout(authCheckTimer);
      authCheckTimer = setTimeout(async () => {
        const ok = await checkAuth().catch(() => false);
        currentAuthed = ok;
        refreshToolbar();
        if (ok) await onAuthorized?.();
      }, 1200);
    };
    targetSession.cookies.on('changed', cookieListener);

    try {
      await siteView.webContents.loadURL(loginUrl);
    } catch {
      // Handled by did-fail-load
    }

    return new Promise<boolean>((resolve) => {
      win.on('closed', async () => {
        if (authCheckTimer) clearTimeout(authCheckTimer);
        targetSession.cookies.removeListener('changed', cookieListener);
        const ok = await checkAuth().catch(() => false);
        resolve(ok);
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
      await win.loadURL(url);
      return await task(win.webContents);
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }
}
