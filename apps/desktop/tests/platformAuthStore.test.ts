import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetPlatformAuthForTests,
  getPlatformAuthSnapshot,
  refreshPlatformAuth,
  statusOf,
  subscribePlatformAuth,
} from '../src/renderer/src/features/platform-auth/store.ts';

type States = Record<string, boolean>;

/** 模拟主进程：invoke 返回值由测试控制，逐平台的 onPlatformAuthUpdated 事件也由测试推送。 */
function fakeMain() {
  let push: (s: States) => void = () => {};
  let resolveInvoke: (s: States) => void = () => {};
  let invokes = 0;
  (globalThis as unknown as { window: unknown }).window = {
    electronAPI: {
      getPlatformAuthStates: () => {
        invokes++;
        return new Promise<States>((r) => (resolveInvoke = r));
      },
      onPlatformAuthUpdated: (cb: (s: States) => void) => {
        push = cb;
        return () => {};
      },
    },
  };
  return { push: (s: States) => push(s), finish: (s: States) => resolveInvoke(s), invokes: () => invokes };
}

test('点刷新：每一行立刻变「检测中」（不再显示上一次的旧值）', async () => {
  __resetPlatformAuthForTests();
  const main = fakeMain();
  const first = refreshPlatformAuth();
  main.finish({ weibo: false, zhihu: true });
  await first;
  assert.equal(statusOf('weibo'), 'signedOut');

  void refreshPlatformAuth();
  assert.equal(statusOf('weibo'), 'checking');
  assert.equal(statusOf('zhihu'), 'checking');
  assert.equal(statusOf('douyin'), 'checking', '没检测过的平台也显示检测中');
});

test('刷新后某个平台的结果一回来就更新界面，不等全部平台', async () => {
  __resetPlatformAuthForTests();
  const main = fakeMain();
  let renders = 0;
  const off = subscribePlatformAuth(() => renders++);
  const done = refreshPlatformAuth();
  const before = renders;
  main.push({ weibo: true });
  assert.ok(renders > before, '收到逐平台事件必须通知订阅者重渲染');
  assert.equal(statusOf('weibo'), 'signedIn');
  assert.equal(statusOf('zhihu'), 'checking', '其他平台仍在检测');
  main.finish({ weibo: true, zhihu: false });
  await done;
  assert.equal(statusOf('zhihu'), 'signedOut');
  assert.equal(getPlatformAuthSnapshot().checking, false);
  off();
});

test('主进程那轮结束时还没回来的平台（单平台超时）标为「检测失败」，不会一直转圈', async () => {
  __resetPlatformAuthForTests();
  const main = fakeMain();
  const done = refreshPlatformAuth();
  main.finish({ zhihu: true });
  await done;
  assert.equal(statusOf('zhihu'), 'signedIn');
  assert.equal(statusOf('weibo'), 'error');
  assert.match(getPlatformAuthSnapshot().error ?? '', /超时/);
});

test('从未登录变为已登录：刷新结果覆盖旧值', async () => {
  __resetPlatformAuthForTests();
  const main = fakeMain();
  const a = refreshPlatformAuth();
  main.finish({ juejin: false });
  await a;
  const b = refreshPlatformAuth();
  main.finish({ juejin: true });
  await b;
  assert.equal(statusOf('juejin'), 'signedIn');
  assert.equal(main.invokes(), 2);
});
