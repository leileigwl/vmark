import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type Electron from 'electron';
import type { PlatformId } from '@vcat/shared';
import { CHROME_DESKTOP_UA, normalizeProxyRules } from './browserStealth.ts';

export const ISOLATED_PROFILE_PLATFORMS = new Set<PlatformId>(['xiaohongshu', 'douyin']);

export function isIsolatedProfilePlatform(platformId: PlatformId): boolean {
  return ISOLATED_PROFILE_PLATFORMS.has(platformId);
}

export function getIsolatedProfileDir(userDataPath: string, platformId: PlatformId): string {
  return path.join(userDataPath, 'browser_profiles', platformId);
}

/** Locates a local system Chrome/Edge/Chromium executable for real-browser profile isolation. */
export function findSystemChromePath(platform: NodeJS.Platform = process.platform): string | undefined {
  const candidates =
    platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

  return candidates.find((p) => existsSync(p));
}

export interface PlaywrightCookieLike {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface PlaywrightPageLike {
  goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
  isClosed(): boolean;
  on(event: 'close', listener: () => void): void;
}

export interface PlaywrightContextLike {
  pages(): PlaywrightPageLike[];
  newPage(): Promise<PlaywrightPageLike>;
  addInitScript(script: string): Promise<void>;
  cookies(urls?: string | string[]): Promise<PlaywrightCookieLike[]>;
  close(): Promise<void>;
  on(event: 'close', listener: () => void): void;
}

export interface PlaywrightLaunchOptions {
  headless?: boolean;
  executablePath?: string;
  channel?: string;
  proxy?: { server: string };
  viewport?: { width: number; height: number };
  locale?: string;
  timezoneId?: string;
  userAgent?: string;
  args?: string[];
  ignoreDefaultArgs?: string[];
}

export interface PlaywrightChromiumLike {
  launchPersistentContext(
    userDataDir: string,
    options: PlaywrightLaunchOptions
  ): Promise<PlaywrightContextLike>;
}

export interface BrowserProfileManagerDeps {
  userDataPath: string;
  loadChromium?: () => Promise<PlaywrightChromiumLike>;
  findChromePath?: () => string | undefined;
}

async function defaultLoadChromium(): Promise<PlaywrightChromiumLike> {
  const req = createRequire(import.meta.url);
  for (const modName of ['playwright-core', '@playwright/test']) {
    try {
      const mod = req(modName) as { chromium?: PlaywrightChromiumLike };
      if (mod?.chromium) return mod.chromium;
    } catch {
      // try next candidate
    }
  }
  throw new Error('未找到可用的 Playwright Chromium 引擎（playwright-core）');
}

const PROFILE_STEALTH_INIT_SCRIPT = `
(() => {
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'], configurable: true });
  } catch {}
})();
`;

/**
 * Manages isolated real-Chrome persistent browser profiles (小V猫-style) for high-risk platforms.
 */
export class BrowserProfileManager {
  private readonly userDataPath: string;
  private readonly loadChromium: () => Promise<PlaywrightChromiumLike>;
  private readonly findChromePath: () => string | undefined;

  constructor(deps: BrowserProfileManagerDeps) {
    this.userDataPath = deps.userDataPath;
    this.loadChromium = deps.loadChromium ?? defaultLoadChromium;
    this.findChromePath = deps.findChromePath ?? (() => findSystemChromePath());
  }

  getProfileDir(platformId: PlatformId): string {
    return getIsolatedProfileDir(this.userDataPath, platformId);
  }

  /** Launches a persistent real-Chrome context bound to `<userData>/browser_profiles/<platformId>`. */
  async launchProfileContext(
    platformId: PlatformId,
    options: { proxyUrl?: string; headless?: boolean } = {}
  ): Promise<PlaywrightContextLike> {
    const chromium = await this.loadChromium();
    const profileDir = this.getProfileDir(platformId);
    await fs.mkdir(profileDir, { recursive: true });

    const executablePath = this.findChromePath();
    const proxyServer = normalizeProxyRules(options.proxyUrl);

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: options.headless ?? false,
      ...(executablePath ? { executablePath } : { channel: 'chrome' }),
      ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
      viewport: { width: 1280, height: 820 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      userAgent: CHROME_DESKTOP_UA,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-checks',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    await context.addInitScript(PROFILE_STEALTH_INIT_SCRIPT);
    return context;
  }

  /** Runs a short-lived task inside the platform's persistent real-Chrome profile and closes cleanly. */
  async runWithProfile<T>(
    platformId: PlatformId,
    task: (context: PlaywrightContextLike, page: PlaywrightPageLike) => Promise<T>,
    options: { proxyUrl?: string; headless?: boolean } = {}
  ): Promise<T> {
    const context = await this.launchProfileContext(platformId, options);
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      return await task(context, page);
    } finally {
      await context.close().catch(() => {});
    }
  }

  /** Opens an interactive real-Chrome window for login and syncs cookies into Electron's partition. */
  async openIsolatedLogin(params: {
    platformId: PlatformId;
    loginUrl: string;
    proxyUrl?: string;
    targetSession?: Electron.Session;
    checkAuth?: () => Promise<boolean>;
    onAuthorized?: () => Promise<void> | void;
  }): Promise<{ authorized: boolean; profileDir: string }> {
    const { platformId, loginUrl, proxyUrl, targetSession, checkAuth, onAuthorized } = params;
    const profileDir = this.getProfileDir(platformId);
    const context = await this.launchProfileContext(platformId, { proxyUrl, headless: false });

    const syncCookiesToElectron = async () => {
      if (!targetSession) return;
      const cookies = await context.cookies();
      for (const c of cookies) {
        const cleanDomain = c.domain.replace(/^\./, '');
        const url = `https://${cleanDomain}${c.path || '/'}`;
        try {
          await targetSession.cookies.set({
            url,
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            secure: c.secure,
            httpOnly: c.httpOnly,
            ...(c.expires > 0 ? { expirationDate: c.expires } : {}),
          });
        } catch {
          // ignore individual malformed cookie
        }
      }
      await targetSession.cookies.flushStore();
    };

    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearInterval(pollTimer);
          resolve();
        };

        const pollTimer = setInterval(async () => {
          try {
            await syncCookiesToElectron();
            if (checkAuth && (await checkAuth())) {
              await onAuthorized?.();
            }
          } catch {
            // ignore transient polling errors while user logs in
          }
        }, 2500);

        page.on('close', finish);
        context.on('close', finish);
      });

      await syncCookiesToElectron();
      const authorized = checkAuth ? await checkAuth() : false;
      return { authorized, profileDir };
    } finally {
      await context.close().catch(() => {});
    }
  }
}
