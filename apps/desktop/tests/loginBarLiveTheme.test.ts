import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { register } from 'node:module';
import test from 'node:test';
import type { Session } from 'electron';

// 登录窗口开着时切换 Vmark 主题，顶栏要跟着变（用假 Electron 跑真实的 InternalBrowserManager）。
register('./support/electronStubLoader.mjs', import.meta.url);
Object.assign(globalThis, { __dirname: import.meta.dirname });
const { InternalBrowserManager } = await import('../src/main/internalBrowserManager.ts');
const { registry } = (await import('./support/electronStub.mjs')) as {
  registry: {
    windows: Array<EventEmitter & { isDestroyed(): boolean; destroy(): void; close(): void; backgroundColors: string[] }>;
    views: Array<{ webContents: EventEmitter & { scripts: string[] } }>;
  };
};

const DARK = {
  themeId: 'bloom-ink-dark',
  tokens: { surface: '#232428', line: 'rgba(255, 255, 255, 0.12)', ink: '#e6e8eb', muted: '#9ba1a6', hover: 'rgba(255, 255, 255, 0.08)', primary: '#7f91a8' },
};
const LIGHT = {
  themeId: 'apple-light',
  tokens: { surface: '#fafafa', line: '#e5e5ea', ink: '#1d1d1f', muted: '#6e6e73', hover: '#eceef1', primary: '#007aff' },
};

function fakeSession() {
  const s = { cookies: new EventEmitter(), setUserAgent() {}, webRequest: { onHeadersReceived() {}, onBeforeSendHeaders() {} } };
  return s as unknown as Session;
}

/** 可以手动推送主题变化的 watchAppTheme：每次调用返回一个等待下一次推送的 Promise。 */
function themeFeed() {
  let calls = 0;
  let pending: { resolve: (v: unknown) => void; reject: (e: unknown) => void } | null = null;
  return {
    get calls() {
      return calls;
    },
    watch: () => {
      calls += 1;
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
      });
    },
    push(snapshot: unknown) {
      pending?.resolve(snapshot);
      pending = null;
    },
    fail() {
      pending?.reject(new Error('main window gone'));
      pending = null;
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

async function open(feed: ReturnType<typeof themeFeed>) {
  const w0 = registry.windows.length;
  const v0 = registry.views.length;
  const done = new InternalBrowserManager().openPlatformBrowser({
    platformId: 'zhihu',
    loginUrl: 'https://example.com/login',
    targetSession: fakeSession(),
    checkAuth: async () => false,
    appTheme: LIGHT,
    watchAppTheme: feed.watch,
  });
  await tick();
  return { win: registry.windows[w0], toolbar: registry.views[v0], done };
}

test('登录窗口开着时切到深色主题：顶栏立即换成深色配色，窗口底色也跟着变', async () => {
  const feed = themeFeed();
  const { win, toolbar, done } = await open(feed);
  assert.equal(feed.calls, 1, '打开后开始监听 Vmark 主题');
  const before = toolbar.webContents.scripts.length;

  feed.push(DARK);
  await tick();
  const applied = toolbar.webContents.scripts.slice(before).join('\n');
  assert.match(applied, /color-scheme/);
  assert.match(applied, /#232428/, '顶栏背景换成深色主题的 surface');
  assert.match(applied, /#7f91a8/, '主按钮换成深色主题的 accent');
  assert.equal(win.backgroundColors.at(-1), '#18191c', '窗口底色换成深色');
  assert.equal(feed.calls, 2, '换完继续监听下一次切换');

  feed.push(LIGHT);
  await tick();
  assert.match(toolbar.webContents.scripts.at(-1) ?? '', /#fafafa/, '再切回浅色也跟随');
  assert.equal(win.backgroundColors.at(-1), '#ffffff');

  win.close();
  await done;
  feed.push(DARK);
  await tick();
  assert.equal(feed.calls, 3, '关窗后不再继续监听');
});

test('读不到 Vmark 主题（主窗口没了）时停止监听，不会空转', async () => {
  const feed = themeFeed();
  const { win, done } = await open(feed);
  feed.fail();
  await tick();
  assert.equal(feed.calls, 1, '失败后不再重试');
  win.close();
  await done;
});

test('监听超时（主题没变）时只是继续等，不改顶栏', async () => {
  const feed = themeFeed();
  const { win, toolbar, done } = await open(feed);
  const before = toolbar.webContents.scripts.length;
  feed.push(null);
  await tick();
  assert.equal(toolbar.webContents.scripts.length, before, '没有变化就不动顶栏');
  assert.equal(feed.calls, 2, '继续等下一次');
  win.close();
  await done;
});
