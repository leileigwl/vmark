import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { caretAtEnd, launch, makeEnv, shotWin, waitForExit } from './support/integrityElectron';

/**
 * 冒烟测试 @smoke —— 数据完整性 C1：正常关闭窗口 / 退出应用时，最后一次输入必须落盘。
 * 参考：Sublime/VS Code 的 hot exit、Typora/Obsidian 的自动保存——关窗不应丢掉还在防抖里的输入。
 * 运行层级：L3 真 Electron（Playwright _electron，Linux 下用 xvfb-run），真实主进程写盘。
 */
const ORIGINAL = '# 笔记\n\n第一段。\n';
const EXPECTED = '# 笔记\n\n第一段。刚打的字\n';

// 已知失败（preview/latest 4b7aa55 实测）：关窗/退出时没有把防抖里的输入写盘。修复见 stacked PR 分支 fix/integrity-flush-on-close；
// 修复合入后 test.fail 必须改回 test。
test.describe('@smoke 数据完整性 C1：关窗 / 退出不丢最后输入（真 Electron）', () => {
  test.fail('输入后立刻关闭窗口：最后输入写入磁盘，且只多这几个字', async () => {
    const env = makeEnv(ORIGINAL);
    const { app, win } = await launch(env);
    try {
      await caretAtEnd(win);
      await win.keyboard.type('刚打的字');
      await shotWin(win, 'C1-before-close');
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      await waitForExit(app);
      expect(fs.readFileSync(env.file, 'utf8')).toBe(EXPECTED);
    } finally {
      await app.close().catch(() => undefined);
      env.cleanup();
    }
  });

  test.fail('输入后立刻退出应用（⌘Q / app.quit）：最后输入写入磁盘', async () => {
    const env = makeEnv(ORIGINAL);
    const { app, win } = await launch(env);
    try {
      await caretAtEnd(win);
      await win.keyboard.type('刚打的字');
      await app.evaluate(({ app: electronApp }) => electronApp.quit());
      await waitForExit(app);
      expect(fs.readFileSync(env.file, 'utf8')).toBe(EXPECTED);
    } finally {
      await app.close().catch(() => undefined);
      env.cleanup();
    }
  });
});
