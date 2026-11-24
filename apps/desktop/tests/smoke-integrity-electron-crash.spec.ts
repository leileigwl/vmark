import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import { caretAtEnd, editorText, hardKill, launch, makeEnv, releaseLaunchedApps, shotWin, waitForExit, type IntegrityEnv } from './support/integrityElectron';

/**
 * 冒烟测试 @smoke —— 数据完整性 C2：崩溃 / 被强杀 / 卡死后重开，用户最后的输入能找回，
 * 原文件绝不被截断或写坏。参考 Vim swap 文件（停手 4 秒写一次）与 VS Code hot exit 备份：
 * 这里要求「停手 1 秒后」发生的崩溃不丢字。
 * 运行层级：L3 真 Electron（Playwright _electron，Linux 下用 xvfb-run）。
 */
const ORIGINAL = '# 笔记\n\n第一段。\n';
const MARK = '崩溃前的字';
const PAUSE_MS = 1000;

async function typeThenPause(win: Page): Promise<void> {
  await caretAtEnd(win);
  await win.keyboard.type(MARK);
  await win.waitForTimeout(PAUSE_MS);
}

/** Disk must hold either the old file or the old file plus the edit — never anything else. */
function expectNotCorrupted(env: IntegrityEnv): void {
  const disk = fs.readFileSync(env.file, 'utf8');
  expect([ORIGINAL, ORIGINAL.replace('第一段。', `第一段。${MARK}`)]).toContain(disk);
}

/** After relaunch the edit is recoverable: on disk, or restored into the editor. */
async function expectRecovered(env: IntegrityEnv, name: string): Promise<void> {
  const { app, win } = await launch(env);
  try {
    await expect
      .poll(async () => fs.readFileSync(env.file, 'utf8').includes(MARK) || (await editorText(win)).includes(MARK), {
        timeout: 8000,
      })
      .toBe(true);
    await shotWin(win, name);
  } finally {
    await app.close().catch(() => undefined);
  }
}

async function run(abrupt: (app: ElectronApplication, win: Page) => Promise<void>, name: string): Promise<void> {
  const env = makeEnv(ORIGINAL);
  try {
    const { app, win } = await launch(env);
    await typeThenPause(win);
    await abrupt(app, win);
    expectNotCorrupted(env);
    await expectRecovered(env, name);
    expectNotCorrupted(env);
  } finally {
    env.cleanup();
  }
}

// 已知失败：没有崩溃恢复备份，自动保存要停手约 1.8 秒才写盘。
// 维护者 2026-11-24 决定暂不做崩溃恢复（撤回 #98），这里保留为 test.fail 记录现状；以后要做时改回 test。
test.describe('@smoke 数据完整性 C2：崩溃 / 强杀 / 卡死后可恢复（真 Electron）', () => {
  // 用例结束时放开所有启动过的 Electron（含被强杀的），避免 worker 退出时等残留进程超时。
  test.afterEach(async () => releaseLaunchedApps());

  test.fail('渲染进程崩溃（forcefullyCrashRenderer）后退出再打开：输入可找回', async () => {
    await run(async (app) => {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer());
      await new Promise((r) => setTimeout(r, 500));
      await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined);
      if (!(await waitForExit(app, 5000))) await hardKill(app);
    }, 'C2-renderer-crash-relaunch');
  });

  test.fail('主进程被 SIGKILL（强制退出 / 断电）后再打开：输入可找回', async () => {
    await run(async (app) => {
      await hardKill(app);
    }, 'C2-sigkill-relaunch');
  });

  test.fail('渲染进程卡死（死循环）后被强制结束再打开：输入可找回', async () => {
    await run(async (app, win) => {
      await win.evaluate(() => {
        setTimeout(() => {
          for (;;) {
            // busy loop: the renderer never answers again
          }
        }, 0);
      });
      await new Promise((r) => setTimeout(r, 1500));
      await hardKill(app);
    }, 'C2-frozen-relaunch');
  });
});
