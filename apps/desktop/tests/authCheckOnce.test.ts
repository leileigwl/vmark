import assert from 'node:assert/strict';
import test from 'node:test';
import { createSharedCheck } from '../src/main/authCheckOnce.ts';

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
