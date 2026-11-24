import assert from 'node:assert/strict';
import test from 'node:test';
import { checkEachWithTimeout, createSharedCheck } from '../src/main/authCheckOnce.ts';

test('并发的账号检测（心跳 / 窗口聚焦 / 刷新按钮）只跑一次，所有调用方拿到同一份结果', async () => {
  let runs = 0;
  let release: (v: Record<string, boolean>) => void = () => {};
  const check = createSharedCheck(() => {
    runs++;
    return new Promise<Record<string, boolean>>((r) => (release = r));
  });
  const a = check();
  const b = check();
  const c = check();
  release({ juejin: true });
  assert.deepEqual(await Promise.all([a, b, c]), [{ juejin: true }, { juejin: true }, { juejin: true }]);
  assert.equal(runs, 1);
});

test('上一轮结束后再调用会重新检测；失败不会卡住后续检测', async () => {
  let runs = 0;
  const check = createSharedCheck(async () => {
    runs++;
    if (runs === 1) throw new Error('network');
    return { zhihu: false };
  });
  await assert.rejects(check(), /network/);
  assert.deepEqual(await check(), { zhihu: false });
  assert.equal(runs, 2);
});

test('点「刷新」时心跳那轮还没结束：强制重新检测，旧一轮被标记为过期（不再广播旧结果覆盖新结果）', async () => {
  const runs: Array<{ isLatest: () => boolean; release: (v: Record<string, boolean>) => void }> = [];
  const check = createSharedCheck(
    (ctx) => new Promise<Record<string, boolean>>((release) => runs.push({ isLatest: ctx.isLatest, release }))
  );
  const heartbeat = check();
  const refresh = check({ fresh: true });
  assert.equal(runs.length, 2, '刷新必须开新一轮，不能复用心跳那轮（它可能在用户登录之前就开始了）');
  assert.equal(runs[0].isLatest(), false);
  assert.equal(runs[1].isLatest(), true);
  // 刷新进行中，心跳 / 窗口聚焦再来：复用刷新这一轮
  const focus = check();
  assert.equal(runs.length, 2);
  runs[1].release({ weibo: true });
  runs[0].release({ weibo: false });
  assert.deepEqual(await refresh, { weibo: true });
  assert.deepEqual(await focus, { weibo: true });
  assert.deepEqual(await heartbeat, { weibo: false });
});

test('每个平台独立超时：卡住的平台（如微博）不阻塞其他平台，其他平台回来就立即回调', async () => {
  const seen: Array<[string, boolean]> = [];
  const started = Date.now();
  const res = await checkEachWithTimeout(
    ['zhihu', 'weibo', 'juejin'],
    (id) => (id === 'weibo' ? new Promise<boolean>(() => {}) : Promise.resolve(id === 'zhihu')),
    {
      timeoutMs: 80,
      onResult: (id, ok) => {
        seen.push([id, ok]);
        assert.ok(Date.now() - started < 60, `${id} 应该在微博超时前就回调`);
      },
    }
  );
  assert.deepEqual(seen.sort(), [['juejin', false], ['zhihu', true]]);
  assert.deepEqual(res.states, { zhihu: true, juejin: false });
  assert.deepEqual(res.timedOut, ['weibo']);
});

test('单个平台检测抛错按未登录处理，不影响其他平台', async () => {
  const res = await checkEachWithTimeout(['csdn', 'zhihu'], async (id) => {
    if (id === 'csdn') throw new Error('boom');
    return true;
  }, { timeoutMs: 50 });
  assert.deepEqual(res.states, { csdn: false, zhihu: true });
  assert.deepEqual(res.timedOut, []);
});
