import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { register } from 'node:module';
import test from 'node:test';
import type { Session } from 'electron';

// 用假 Electron 跑真实的 InternalBrowserManager（node --test 里没有 Electron 运行时）。
register('./support/electronStubLoader.mjs', import.meta.url);
// 主进程按 CJS 打包，preload 路径用 __dirname 拼；ESM 测试里补一个全局值（只用于拼路径）。
Object.assign(globalThis, { __dirname: import.meta.dirname });
const { InternalBrowserManager } = await import('../src/main/internalBrowserManager.ts');
const { registry } = (await import('./support/electronStub.mjs')) as {
  registry: { windows: FakeWindow[]; views: Array<{ webContents: FakeContents }> };
};

interface FakeContents extends EventEmitter {
  isDestroyed(): boolean;
  closeCalls: number;
}
interface FakeWindow extends EventEmitter {
  isDestroyed(): boolean;
  destroy(): void;
  close(): void;
}

function fakeSession() {
  const cookies = new EventEmitter();
  const s = {
    cookies,
    setUserAgent() {},
    webRequest: { onHeadersReceived() {}, onBeforeSendHeaders() {} },
  };
  return { session: s as unknown as Session, cookies };
}

/** 打开一个登录窗口，返回这一次新建的窗口、顶栏和站点 view。 */
async function openLoginWindow(manager: InstanceType<typeof InternalBrowserManager>, platformId: 'zhihu' | 'weixin' = 'zhihu') {
  const { session, cookies } = fakeSession();
  const w0 = registry.windows.length;
  const v0 = registry.views.length;
  const done = manager.openPlatformBrowser({
    platformId,
    loginUrl: 'https://example.com/login',
    targetSession: session,
    checkAuth: async () => false,
  });
  await new Promise((r) => setImmediate(r));
  const win = registry.windows[w0];
  const [toolbar, site] = registry.views.slice(v0, v0 + 2);
  assert.ok(win && toolbar && site, '应创建窗口、顶栏和站点 view');
  return { win, toolbar, site, cookies, done };
}

function assertReleased(o: Awaited<ReturnType<typeof openLoginWindow>>) {
  assert.equal(o.cookies.listenerCount('changed'), 0, '会话 cookie 监听已移除');
  assert.equal(o.win.isDestroyed(), true, 'BrowserWindow 已销毁');
  assert.equal(o.site.webContents.isDestroyed(), true, '站点 view 的 webContents 已 close()（不会随窗口自动销毁）');
  assert.equal(o.toolbar.webContents.isDestroyed(), true, '顶栏 view 的 webContents 已 close()');
  assert.equal(o.site.webContents.listenerCount('did-fail-load'), 0, '站点 webContents 监听已清空');
  assert.equal(o.toolbar.webContents.listenerCount('will-navigate'), 0, '顶栏 webContents 监听已清空');
  assert.equal(o.win.listenerCount('resize'), 0, '窗口监听已清空');
}

test('登录窗口：用户点系统关闭按钮（close → closed）后释放全部资源', async () => {
  const o = await openLoginWindow(new InternalBrowserManager());
  assert.equal(o.cookies.listenerCount('changed'), 1);
  o.win.close();
  assert.equal(await o.done, false);
  assertReleased(o);
});

test('登录窗口：顶栏「关闭」走 win.destroy()（只发 closed、不发 close）也要释放全部资源', async () => {
  const o = await openLoginWindow(new InternalBrowserManager());
  o.toolbar.webContents.emit('will-navigate', { preventDefault() {} }, 'vmark-nav://close');
  assert.equal(await o.done, false);
  assertReleased(o);
});

test('登录窗口：换平台打开新窗口时，旧窗口被销毁并释放，新窗口的监听不受影响', async () => {
  const manager = new InternalBrowserManager();
  const first = await openLoginWindow(manager, 'zhihu');
  const second = await openLoginWindow(manager, 'weixin');
  assert.equal(await first.done, false);
  assertReleased(first);
  assert.equal(second.win.isDestroyed(), false);
  assert.equal(second.cookies.listenerCount('changed'), 1, '新窗口的 cookie 监听还在');
  second.win.close();
  await second.done;
  assertReleased(second);
});

test('登录窗口：cookie 变化排队的检测定时器在关窗后被清掉，不会在关窗后再去检测', async () => {
  const { session, cookies } = fakeSession();
  let checks = 0;
  const manager = new InternalBrowserManager();
  const w0 = registry.windows.length;
  const done = manager.openPlatformBrowser({
    platformId: 'zhihu',
    loginUrl: 'https://example.com/login',
    targetSession: session,
    checkAuth: async () => {
      checks += 1;
      return false;
    },
  });
  await new Promise((r) => setImmediate(r));
  const win = registry.windows[w0];
  cookies.emit('changed', {}, { name: 'z_c0' }, 'explicit', false);
  win.destroy();
  await done;
  const afterClose = checks;
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(checks, afterClose, '关窗后不应再触发登录检测');
});

test('登录窗口：顶栏 did-navigate-in-page Hash 事件可关闭窗口；hasAuthCookies=false 时秒开且匿名 Cookie 不发远端请求', async () => {
  const { session, cookies } = fakeSession();
  let checks = 0;
  const manager = new InternalBrowserManager();
  const w0 = registry.windows.length;
  const v0 = registry.views.length;
  const done = manager.openPlatformBrowser({
    platformId: 'weixin',
    loginUrl: 'https://mp.weixin.qq.com/',
    targetSession: session,
    hasAuthCookies: async () => false,
    checkAuth: async () => {
      checks += 1;
      return false;
    },
  });
  await new Promise((r) => setImmediate(r));
  const win = registry.windows[w0];
  const toolbar = registry.views[v0];
  assert.equal(checks, 0, '无登录 Cookie 时开窗不阻塞远端 checkAuth');

  cookies.emit('changed', {}, { name: 'uuid' }, 'explicit', false);
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(checks, 0, '扫码过程中的匿名 Cookie 变化不打 mp.weixin.qq.com');

  toolbar.webContents.emit('did-navigate-in-page', {}, 'data:text/html,x#vmark-nav://close:12345');
  assert.equal(await done, false);
  assert.equal(checks, 0, '无登录 Cookie 关窗秒返回，不拖延');
  assert.equal(win.isDestroyed(), true);
});
