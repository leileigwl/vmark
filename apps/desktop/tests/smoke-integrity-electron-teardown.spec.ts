import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { hardKill, launch, makeEnv } from './support/integrityElectron';

/**
 * 冒烟测试 @smoke —— L3 测试夹具自检：强杀 Electron 之后，Playwright 必须能收到进程的 'close'
 * （stdout/stderr 全部关闭）。否则 worker 退出时 Playwright 会一直等这个进程，CI 报
 * 「Worker teardown timeout of 45000ms exceeded」（#103 的 L3 两次都这样，用例本身全过）。
 * 这里用一个 setsid 脱离进程组、继承了主进程 stdout/stderr 的子进程（类似 crashpad handler）模拟占着管道的残留进程。
 * 运行层级：L3 真 Electron（Playwright _electron，Linux 下用 xvfb-run）。
 */
test.describe('@smoke L3 夹具自检：强杀后不留占着 stdio 的进程', () => {
  test('强杀后脱离进程组的子进程仍占着 stdout：夹具把它清掉，进程 close 事件按时到达', async () => {
    const env = makeEnv('# 夹具自检\n');
    try {
      const strayLog = path.join(env.userData, 'stray.log');
      fs.writeFileSync(strayLog, '', 'utf8');
      const { app } = await launch(env);
      const strayPid = await app.evaluate((_electron, file) => {
        const cp = process.getBuiltinModule('node:child_process');
        const child = cp.spawn('tail', ['-f', file], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
        child.unref();
        return child.pid ?? -1;
      }, strayLog);
      expect(strayPid).toBeGreaterThan(0);

      const proc = app.process();
      let closed = false;
      proc.once('close', () => {
        closed = true;
      });
      await hardKill(app);

      await expect.poll(() => closed, { timeout: 8000 }).toBe(true);
      await expect.poll(() => isAlive(strayPid), { timeout: 3000 }).toBe(false);
    } finally {
      env.cleanup();
    }
  });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}
