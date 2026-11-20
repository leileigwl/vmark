import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyChromeHeadersToRecord,
  applySessionProxy,
  buildChromeBrowserHeaders,
  CHROME_MAJOR_VERSION,
  normalizeProxyRules,
} from '../src/main/browserStealth.ts';
import {
  BrowserProfileManager,
  isIsolatedProfilePlatform,
  type PlaywrightLaunchOptions,
} from '../src/main/browserProfileManager.ts';

test('buildChromeBrowserHeaders and applyChromeHeadersToRecord normalize UA and Sec-CH-UA* headers', () => {
  const macHeaders = buildChromeBrowserHeaders('darwin');
  assert.match(macHeaders['User-Agent'], new RegExp(`Chrome/${CHROME_MAJOR_VERSION}\\.0\\.0\\.0`));
  assert.equal(macHeaders['Sec-CH-UA-Platform'], '"macOS"');
  assert.equal(macHeaders['Sec-CH-UA-Mobile'], '?0');
  assert.ok(macHeaders['Sec-CH-UA'].includes(`v="${CHROME_MAJOR_VERSION}"`));

  const merged = applyChromeHeadersToRecord(
    { 'user-agent': 'Electron/33', 'sec-ch-ua': '"Electron"', Referer: 'https://www.xiaohongshu.com/' },
    'win32'
  );
  assert.equal(merged['user-agent'], undefined);
  assert.equal(merged['sec-ch-ua'], undefined);
  assert.equal(merged['Sec-CH-UA-Platform'], '"Windows"');
  assert.equal(merged.Referer, 'https://www.xiaohongshu.com/');
});

test('normalizeProxyRules validates schemes and applySessionProxy configures or clears Electron session proxy', async () => {
  assert.equal(normalizeProxyRules('  '), undefined);
  assert.equal(normalizeProxyRules('http://127.0.0.1:7890/'), 'http://127.0.0.1:7890');
  assert.equal(normalizeProxyRules('socks5://127.0.0.1:1080'), 'socks5://127.0.0.1:1080');
  assert.throws(() => normalizeProxyRules('ftp://127.0.0.1:21'));
  assert.throws(() => normalizeProxyRules('not-a-url'));

  const calls: Array<{ proxyRules?: string; mode?: string }> = [];
  const mockSession = {
    setProxy: async (cfg: { proxyRules?: string; mode?: string }) => {
      calls.push(cfg);
    },
  };
  await applySessionProxy(mockSession, 'http://127.0.0.1:7890');
  await applySessionProxy(mockSession, '');
  assert.deepEqual(calls, [{ proxyRules: 'http://127.0.0.1:7890' }, { mode: 'direct' }]);
});

test('BrowserProfileManager isolates profile dirs, launches stealth Chrome context, and syncs cookies', async () => {
  assert.equal(isIsolatedProfilePlatform('xiaohongshu'), true);
  assert.equal(isIsolatedProfilePlatform('douyin'), true);
  assert.equal(isIsolatedProfilePlatform('weixin'), false);

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-profile-test-'));
  let capturedDir = '';
  let capturedOpts: PlaywrightLaunchOptions | undefined;
  let initScriptCount = 0;
  const setCookies: Array<{ name: string; value: string; url: string }> = [];
  let flushed = false;

  const manager = new BrowserProfileManager({
    userDataPath: tmpRoot,
    findChromePath: () => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    loadChromium: async () => ({
      launchPersistentContext: async (userDataDir, options) => {
        capturedDir = userDataDir;
        capturedOpts = options;
        let closeHandler: (() => void) | undefined;
        return {
          pages: () => [],
          newPage: async () => ({
            goto: async () => {
              setTimeout(() => closeHandler?.(), 10);
            },
            isClosed: () => false,
            on: (event, listener) => {
              if (event === 'close') closeHandler = listener;
            },
          }),
          addInitScript: async () => {
            initScriptCount++;
          },
          cookies: async () => [
            {
              name: 'web_session',
              value: 'xhs_real_cookie',
              domain: '.xiaohongshu.com',
              path: '/',
              expires: -1,
              httpOnly: true,
              secure: true,
            },
          ],
          close: async () => {},
          on: () => {},
        };
      },
    }),
  });

  const mockElectronSession = {
    cookies: {
      set: async (c: { name: string; value: string; url: string }) => {
        setCookies.push(c);
      },
      flushStore: async () => {
        flushed = true;
      },
    },
  };

  try {
    const result = await manager.openIsolatedLogin({
      platformId: 'xiaohongshu',
      loginUrl: 'https://creator.xiaohongshu.com/login',
      proxyUrl: 'socks5://127.0.0.1:1080',
      targetSession: mockElectronSession as never,
      checkAuth: async () => setCookies.some((c) => c.name === 'web_session'),
    });

    assert.equal(result.authorized, true);
    assert.equal(capturedDir, path.join(tmpRoot, 'browser_profiles', 'xiaohongshu'));
    assert.equal(capturedOpts?.executablePath, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    assert.deepEqual(capturedOpts?.proxy, { server: 'socks5://127.0.0.1:1080' });
    assert.ok(capturedOpts?.args?.includes('--disable-blink-features=AutomationControlled'));
    assert.deepEqual(capturedOpts?.ignoreDefaultArgs, ['--enable-automation']);
    assert.equal(initScriptCount, 1);
    assert.equal(setCookies[0]?.name, 'web_session');
    assert.equal(flushed, true);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
