import { expect, test } from '@playwright/test';
import { getCalls, installMockWorkspace, openEditor, placeCaretAtEnd, sendMenu } from './support/mockWorkspace';

/**
 * Ctrl/Cmd+S、Ctrl/Cmd+N 按一次只触发一次。
 * 同一次按键会从两条路到达渲染进程：渲染进程自己的 keydown，以及 Electron 菜单加速键
 * （主进程点菜单项时带上 `accelerator` 标记再发 onMenuAction）。以前靠「300ms 内只认一次」去重，
 * 新建/保存让主线程忙过 300ms 后菜单那一份才到，就会再保存一次、再新建一篇。
 * 运行层级：L2 无头 Chromium + mock 工作区；菜单加速键那一份用 `sendMenu(..., 'accelerator')` 重放。
 * Windows 上两条路的真实先后与延迟需要真机确认。
 */
const ACCELERATOR = 'accelerator';

async function open(page: import('@playwright/test').Page) {
  await installMockWorkspace(page, { files: { 'a.md': 'hello\n' } });
  const reset = await openEditor(page);
  await reset.click();
  await placeCaretAtEnd(page);
}

test.describe('快捷键只触发一次（菜单加速键回声不重复执行）', () => {
  test('Ctrl/Cmd+N 后菜单加速键回声晚到（>300ms）：只新建一篇', async ({ page }) => {
    await open(page);
    await page.keyboard.press('ControlOrMeta+n');
    await expect.poll(async () => (await getCalls(page, 'createArticle')).length).toBe(1);
    await page.waitForTimeout(600);
    await sendMenu(page, 'file:new', ACCELERATOR);
    await page.waitForTimeout(400);
    expect(await getCalls(page, 'createArticle')).toHaveLength(1);
  });

  test('Ctrl/Cmd+S 后菜单加速键回声晚到（>300ms）：只保存一次', async ({ page }) => {
    await open(page);
    await page.keyboard.type('x');
    await page.waitForTimeout(400);
    const before = (await getCalls(page, 'saveArticle')).length;
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(async () => (await getCalls(page, 'saveArticle')).length).toBe(before + 1);
    await page.waitForTimeout(600);
    await sendMenu(page, 'file:save', ACCELERATOR);
    await page.waitForTimeout(400);
    expect(await getCalls(page, 'saveArticle')).toHaveLength(before + 1);
  });

  test('连按两次 Ctrl/Cmd+N（间隔 >300ms），两份回声随后才到：正好两篇', async ({ page }) => {
    await open(page);
    await page.keyboard.press('ControlOrMeta+n');
    await expect.poll(async () => (await getCalls(page, 'createArticle')).length).toBe(1);
    await page.waitForTimeout(400);
    await page.keyboard.press('ControlOrMeta+n');
    await expect.poll(async () => (await getCalls(page, 'createArticle')).length).toBe(2);
    await page.waitForTimeout(400);
    await sendMenu(page, 'file:new', ACCELERATOR);
    await sendMenu(page, 'file:new', ACCELERATOR);
    await page.waitForTimeout(400);
    expect(await getCalls(page, 'createArticle')).toHaveLength(2);
  });

  test('渲染进程没收到按键、只有菜单加速键到达：仍执行一次', async ({ page }) => {
    await open(page);
    await sendMenu(page, 'file:new', ACCELERATOR);
    await expect.poll(async () => (await getCalls(page, 'createArticle')).length).toBe(1);
    await page.waitForTimeout(700);
    await sendMenu(page, 'file:new', ACCELERATOR);
    await expect.poll(async () => (await getCalls(page, 'createArticle')).length).toBe(2);
  });

  test('鼠标点菜单「新建文章」（无加速键标记）不受按键影响：照常执行', async ({ page }) => {
    await open(page);
    await page.keyboard.press('ControlOrMeta+n');
    await expect.poll(async () => (await getCalls(page, 'createArticle')).length).toBe(1);
    await page.waitForTimeout(600);
    await sendMenu(page, 'file:new');
    await expect.poll(async () => (await getCalls(page, 'createArticle')).length).toBe(2);
  });

  test('弹窗打开时 Ctrl/Cmd+S、Ctrl/Cmd+N 及其菜单回声都不执行', async ({ page }) => {
    await open(page);
    await sendMenu(page, 'publish:open');
    await expect(page.locator('[role="dialog"]').first()).toBeVisible();
    const saves = (await getCalls(page, 'saveArticle')).length;
    await page.keyboard.press('ControlOrMeta+s');
    await page.keyboard.press('ControlOrMeta+n');
    await sendMenu(page, 'file:save', ACCELERATOR);
    await sendMenu(page, 'file:new', ACCELERATOR);
    await page.waitForTimeout(500);
    expect(await getCalls(page, 'saveArticle')).toHaveLength(saves);
    expect(await getCalls(page, 'createArticle')).toHaveLength(0);
  });
});
