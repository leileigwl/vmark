import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { caretAtEnd, launch, makeEnv, shotWin } from './support/integrityElectron';

/**
 * 冒烟测试 @smoke —— 数据完整性 C3：写盘失败（磁盘满 ENOSPC / 无权限 EACCES）时，
 * 原文件不能被截断，且必须明确告诉用户「保存失败」。参考 Sublime atomic_save、
 * Vim writebackup：先写临时文件，成功后再 rename 覆盖。
 * 运行层级：L3 真 Electron。ENOSPC 通过替换主进程 fs/promises.writeFile 模拟内核行为：
 * 以截断方式打开目标、只写进去一部分、然后抛 ENOSPC（这正是磁盘写满时原地写入会发生的事）。
 */
const ORIGINAL = '# 重要文档\n\n这一段绝对不能丢。\n';

// 已知失败（preview/latest 4b7aa55 实测）：主进程原地 fs.writeFile 会先截断原文件；保存失败时界面无任何提示。修复见 stacked PR 分支 fix/integrity-atomic-save；
// 修复合入后 test.fail 必须改回 test。
test.describe('@smoke 数据完整性 C3：写盘失败不截断原文件并提示（真 Electron）', () => {
  test.fail('磁盘写满（ENOSPC，写到一半失败）：原文件完好，界面提示保存失败', async () => {
    const env = makeEnv(ORIGINAL);
    const { app, win } = await launch(env);
    try {
      await app.evaluate(() => {
        const req = (process as unknown as { getBuiltinModule: (id: string) => unknown }).getBuiltinModule.bind(process);
        const fsp = req('node:fs/promises') as typeof import('node:fs/promises');
        const fsSync = req('node:fs') as typeof import('node:fs');
        const g = globalThis as unknown as { __realWriteFile?: typeof fsp.writeFile };
        g.__realWriteFile = fsp.writeFile;
        (fsp as { writeFile: unknown }).writeFile = async (target: string, data: string) => {
          const fd = fsSync.openSync(target, 'w');
          fsSync.writeSync(fd, String(data).slice(0, 3));
          fsSync.closeSync(fd);
          throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
        };
      });
      await caretAtEnd(win);
      await win.keyboard.type('新增内容');
      await win.waitForTimeout(400);
      await win.keyboard.press('ControlOrMeta+s');
      await win.waitForTimeout(800);
      expect(fs.readFileSync(env.file, 'utf8')).toBe(ORIGINAL);
      await expect(win.getByText(/保存失败/).first()).toBeVisible({ timeout: 3000 });
      await shotWin(win, 'C3-enospc');
      await app.evaluate(() => {
        const req = (process as unknown as { getBuiltinModule: (id: string) => unknown }).getBuiltinModule.bind(process);
        const fsp = req('node:fs/promises') as { writeFile: unknown };
        fsp.writeFile = (globalThis as unknown as { __realWriteFile: unknown }).__realWriteFile;
      });
      await win.keyboard.press('ControlOrMeta+s');
      await expect.poll(() => fs.readFileSync(env.file, 'utf8'), { timeout: 4000 }).toBe(ORIGINAL.replace('不能丢。', '不能丢。新增内容'));
    } finally {
      await app.close().catch(() => undefined);
      env.cleanup();
    }
  });

  test.fail('文件只读（EACCES）：原文件完好、不被绕过权限覆盖，界面提示保存失败', async () => {
    const env = makeEnv(ORIGINAL);
    const { app, win } = await launch(env);
    try {
      fs.chmodSync(env.file, 0o444);
      await caretAtEnd(win);
      await win.keyboard.type('新增内容');
      await win.waitForTimeout(400);
      await win.keyboard.press('ControlOrMeta+s');
      await win.waitForTimeout(800);
      expect(fs.readFileSync(env.file, 'utf8')).toBe(ORIGINAL);
      expect(fs.statSync(env.file).mode & 0o777).toBe(0o444);
      await expect(win.getByText(/保存失败/).first()).toBeVisible({ timeout: 3000 });
      await shotWin(win, 'C3-eacces');
    } finally {
      fs.chmodSync(env.file, 0o644);
      await app.close().catch(() => undefined);
      env.cleanup();
    }
  });
});
