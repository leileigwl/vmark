import path from 'node:path';
import { BrowserWindow, session, WebContentsView, type Session } from 'electron';
import type { PlatformId } from '@vcat/shared';
import {
  applyChromeHeadersToRecord,
  CHROME_DESKTOP_UA,
  encodeFingerprintArg,
  getPlatformFingerprintProfile,
} from './browserStealth';

const TOOLBAR_HEIGHT = 82;
const configuredStealthPartitions = new Set<string>();

const PLATFORM_ENTRY_URLS: Array<{ id: PlatformId; label: string; url: string }> = [
  { id: 'weixin', label: '微信公众号', url: 'https://mp.weixin.qq.com/' },
  { id: 'zhihu', label: '知乎专栏', url: 'https://www.zhihu.com/creator' },
  { id: 'juejin', label: '稀土掘金', url: 'https://juejin.cn/creator/content/article/drafts' },
  { id: 'csdn', label: 'CSDN', url: 'https://mp.csdn.net/mp_blog/manage/article' },
  { id: 'cnblogs', label: '博客园', url: 'https://i.cnblogs.com/posts' },
  { id: 'baijiahao', label: '百家号', url: 'https://baijiahao.baidu.com/' },
  { id: 'bilibili', label: 'B 站专栏', url: 'https://member.bilibili.com/platform/home' },
  { id: 'weibo', label: '微博', url: 'https://card.weibo.com/article/v3/editor' },
  { id: 'douyin', label: '抖音创作者', url: 'https://creator.douyin.com/' },
  { id: 'xiaohongshu', label: '小红书创作', url: 'https://creator.xiaohongshu.com/' },
  { id: 'github_static', label: 'GitHub', url: 'https://github.com/' },
];

export function buildPlatformToolbarHtml(options: {
  platformId: PlatformId;
  url: string;
}): string {
  const safeUrl = options.url.replace(/[<>"'&]/g, '');
  const tabsHtml = PLATFORM_ENTRY_URLS.map((item) => {
    const active = item.id === options.platformId;
    const tabStyle = active
      ? 'background:#fff;color:#0f172a;font-weight:600;border:1px solid #cbd5e1;border-bottom-color:#fff;box-shadow:0 -1px 3px rgba(0,0,0,0.04);'
      : 'background:transparent;color:#475569;font-weight:500;border:1px solid transparent;';
    const dotColor = active ? '#22c55e' : '#94a3b8';
    return `<button onclick="location.href='vmark-nav://switch/${item.id}'" data-platform-tab="${item.id}" style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:8px 8px 0 0;font-size:11.5px;white-space:nowrap;cursor:pointer;${tabStyle}"><span style="width:6px;height:6px;border-radius:50%;background:${dotColor};display:inline-block;"></span>${item.label}</button>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><style>*::-webkit-scrollbar{height:0;width:0;}</style></head>
  <body style="margin:0;height:82px;display:flex;flex-direction:column;background:#eef2f7;border-bottom:1px solid #cbd5e1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-sizing:border-box;user-select:none;">
    <div style="height:38px;display:flex;align-items:flex-end;gap:4px;padding:4px 10px 0;overflow-x:auto;border-bottom:1px solid #cbd5e1;">
      ${tabsHtml}
    </div>
    <div style="height:43px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#fff;">
      <button onclick="location.href='vmark-nav://back'" title="后退" style="border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;color:#334155;">←</button>
      <button onclick="location.href='vmark-nav://forward'" title="前进" style="border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;color:#334155;">→</button>
      <button onclick="location.href='vmark-nav://reload'" title="刷新" style="border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;color:#334155;">↻</button>
      <span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;font-size:11px;color:#334155;font-family:monospace;white-space:nowrap;">沙箱: persist:platform_${options.platformId}</span>
      <div id="url-pill" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:5px 10px;font-size:12px;color:#475569;">${safeUrl}</div>
      <button onclick="location.href='vmark-nav://close'" title="关闭浏览器" style="border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;color:#475569;">完成关闭</button>
    </div>
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
 * Manages Vmark's single global built-in isolated browser window and silent background runner.
 */
export class InternalBrowserManager {
  private activeWindow: BrowserWindow | null = null;
  private activeToolbarView: WebContentsView | null = null;
  private activeSiteView: WebContentsView | null = null;
  private cleanupActiveSite: (() => void) | null = null;

  /** Opens or switches the single global Vmark browser window to the target platform's isolated environment. */
  async openPlatformBrowser(params: {
    platformId: PlatformId;
    loginUrl: string;
    targetSession: Session;
    checkAuth: () => Promise<boolean>;
    onAuthorized?: () => Promise<void> | void;
  }): Promise<boolean> {
    const { platformId, loginUrl, checkAuth, onAuthorized } = params;

    if (!this.activeWindow || this.activeWindow.isDestroyed()) {
      this.activeWindow = new BrowserWindow({
        width: 1120,
        height: 780,
        backgroundColor: '#ffffff',
        title: `Vmark 内置浏览器 - ${platformId}`,
      });
      this.activeToolbarView = new WebContentsView({
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });
      this.activeWindow.contentView.addChildView(this.activeToolbarView);

      const layoutViews = () => {
        if (!this.activeWindow || this.activeWindow.isDestroyed()) return;
        const [width, height] = this.activeWindow.getContentSize();
        this.activeToolbarView?.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT });
        this.activeSiteView?.setBounds({
          x: 0,
          y: TOOLBAR_HEIGHT,
          width,
          height: Math.max(0, height - TOOLBAR_HEIGHT),
        });
      };
      this.activeWindow.on('resize', layoutViews);
      this.activeWindow.on('close', () => {
        this.cleanupActiveSite?.();
        this.cleanupActiveSite = null;
        this.activeSiteView = null;
        this.activeToolbarView = null;
        this.activeWindow = null;
      });
    } else {
      this.activeWindow.setTitle(`Vmark 内置浏览器 - ${platformId}`);
      this.activeWindow.focus();
    }

    const win = this.activeWindow;
    const toolbarView = this.activeToolbarView!;

    const mountPlatformSite = (
      pid: PlatformId,
      targetUrl: string,
      siteSession: Session,
      verifyFn: () => Promise<boolean>,
      notifyFn?: () => Promise<void> | void
    ) => {
      this.cleanupActiveSite?.();
      this.cleanupActiveSite = null;

      if (this.activeSiteView && !win.isDestroyed()) {
        win.contentView.removeChildView(this.activeSiteView);
        if (!this.activeSiteView.webContents.isDestroyed()) {
          this.activeSiteView.webContents.close();
        }
      }

      const partition = `persist:platform_${pid}`;
      attachInternalBrowserStealth(siteSession, partition);
      const fpArg = encodeFingerprintArg(getPlatformFingerprintProfile(pid));

      const siteView = new WebContentsView({
        webPreferences: {
          partition,
          preload: getStealthPreloadPath(),
          additionalArguments: [fpArg],
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      siteView.setBackgroundColor('#ffffff');
      this.activeSiteView = siteView;
      win.contentView.addChildView(siteView);
      win.setTitle(`Vmark 内置浏览器 - ${pid}`);

      const [width, height] = win.getContentSize();
      toolbarView.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT });
      siteView.setBounds({
        x: 0,
        y: TOOLBAR_HEIGHT,
        width,
        height: Math.max(0, height - TOOLBAR_HEIGHT),
      });

      let lastDisplayedUrl = targetUrl;
      let urlUpdateTimer: NodeJS.Timeout | null = null;
      const updateToolbarUrl = (url: string) => {
        if (url === lastDisplayedUrl || win.isDestroyed() || toolbarView.webContents.isDestroyed()) return;
        lastDisplayedUrl = url;
        if (urlUpdateTimer) clearTimeout(urlUpdateTimer);
        urlUpdateTimer = setTimeout(() => {
          if (win.isDestroyed() || toolbarView.webContents.isDestroyed()) return;
          void toolbarView.webContents
            .executeJavaScript(
              `(() => { const u = document.getElementById('url-pill'); if (u) u.textContent = ${JSON.stringify(lastDisplayedUrl)}; })();`
            )
            .catch(() => {});
        }, 150);
      };

      void toolbarView.webContents.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          buildPlatformToolbarHtml({ platformId: pid, url: targetUrl })
        )}`
      );

      siteView.webContents.setUserAgent(CHROME_DESKTOP_UA);
      // Keep target=_blank / window.open links inside the same browser view so no unclosable popups spawn
      siteView.webContents.setWindowOpenHandler((details) => {
        if (details.url) {
          void siteView.webContents.loadURL(details.url);
        }
        return { action: 'deny' };
      });
      // Prevent editor pages' beforeunload prompts from blocking the close button
      siteView.webContents.on('will-prevent-unload', (event) => {
        event.preventDefault();
      });
      siteView.webContents.on('did-navigate', (_ev, url) => updateToolbarUrl(url));
      siteView.webContents.on('did-navigate-in-page', (_ev, url) => updateToolbarUrl(url));
      siteView.webContents.on('did-fail-load', (_ev, errorCode, errorDescription, validatedURL) => {
        if (errorCode === -3) return;
        void siteView.webContents.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(buildLoadErrorHtml(errorCode, errorDescription, validatedURL))}`
        );
      });

      let authCheckTimer: NodeJS.Timeout | null = null;
      const cookieListener = (_ev: Electron.Event, _cookie: Electron.Cookie, _cause: unknown, removed?: boolean) => {
        if (removed || authCheckTimer) return;
        authCheckTimer = setTimeout(async () => {
          authCheckTimer = null;
          if (win.isDestroyed()) return;
          const ok = await verifyFn().catch(() => false);
          if (ok) await notifyFn?.();
        }, 3000);
      };
      siteSession.cookies.on('changed', cookieListener);

      this.cleanupActiveSite = () => {
        if (urlUpdateTimer) clearTimeout(urlUpdateTimer);
        if (authCheckTimer) clearTimeout(authCheckTimer);
        siteSession.cookies.removeListener('changed', cookieListener);
      };

      void siteView.webContents.loadURL(targetUrl).catch(() => {});
    };

    toolbarView.webContents.removeAllListeners('will-navigate');
    toolbarView.webContents.on('will-navigate', (event, targetUrl) => {
      if (!targetUrl.startsWith('vmark-nav://')) return;
      event.preventDefault();
      const siteWc = this.activeSiteView?.webContents;
      if (targetUrl === 'vmark-nav://back' && siteWc?.canGoBack()) {
        siteWc.goBack();
      } else if (targetUrl === 'vmark-nav://forward' && siteWc?.canGoForward()) {
        siteWc.goForward();
      } else if (targetUrl === 'vmark-nav://reload') {
        siteWc?.reload();
      } else if (targetUrl === 'vmark-nav://close') {
        if (!win.isDestroyed()) win.destroy();
      } else if (targetUrl.startsWith('vmark-nav://switch/')) {
        const nextId = targetUrl.replace('vmark-nav://switch/', '') as PlatformId;
        const entry = PLATFORM_ENTRY_URLS.find((item) => item.id === nextId);
        if (entry) {
          const nextSession = session.fromPartition(`persist:platform_${nextId}`);
          mountPlatformSite(
            nextId,
            entry.url,
            nextSession,
            nextId === platformId ? checkAuth : async () => false,
            nextId === platformId ? onAuthorized : undefined
          );
        }
      }
    });

    mountPlatformSite(platformId, loginUrl, params.targetSession, checkAuth, onAuthorized);

    return new Promise<boolean>((resolve) => {
      win.once('closed', async () => {
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
      win.webContents.on('will-prevent-unload', (event) => event.preventDefault());
      await win.loadURL(url);
      return await task(win.webContents);
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }
}
