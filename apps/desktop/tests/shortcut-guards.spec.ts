import { expect, test, type Page } from '@playwright/test';
import { getCalls, installMockWorkspace, openEditor, placeCaretAtEnd, sendMenu } from './support/mockWorkspace';

async function createUndoableFile(page: Page): Promise<string> {
  await sendMenu(page, 'file:new');
  await expect.poll(async () => (await getCalls(page, 'createArticle')).length).toBe(1);
  const created = (await getCalls(page, 'createArticle'))[0].args[0] as string;
  await page.waitForTimeout(200);
  return created;
}

async function editorText(page: Page): Promise<string> {
  return page.evaluate(() =>
    (document.querySelector('.vditor-ir .vditor-reset')?.textContent || '').replace(/[\u200b\ufeff]/g, '')
  );
}

test.describe('快捷键与撤销守卫（文件撤销绝不意外触发）', () => {
  test('焦点在顶部普通按钮上按 Cmd/Ctrl+Z：不撤销文件操作', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': 'hello' } });
    await openEditor(page);
    await createUndoableFile(page);

    await page.locator('button[title*="快速打开"]').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(200);
    expect(await getCalls(page, 'deleteArticle')).toHaveLength(0);

    await sendMenu(page, 'edit:undo');
    await page.waitForTimeout(200);
    expect(await getCalls(page, 'deleteArticle')).toHaveLength(0);
  });

  test('焦点在设置页复选框上触发菜单「撤销」：既不撤销文件操作，也不改动正文', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': 'hello' } });
    await openEditor(page);
    await page.locator('.vditor-ir .vditor-reset p').first().click();
    await placeCaretAtEnd(page);
    await page.keyboard.type(' world');
    await page.waitForTimeout(400);
    const before = await editorText(page);
    expect(before).toContain('hello world');
    await createUndoableFile(page);

    await sendMenu(page, 'view:settings');
    await page.getByRole('button', { name: '编辑与导出' }).click();
    await page.locator('label:has-text("自动匹配符号") input[type="checkbox"]').focus();
    await sendMenu(page, 'edit:undo');
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(250);
    expect(await getCalls(page, 'deleteArticle')).toHaveLength(0);
    await sendMenu(page, 'file:openRecent', 'a.md');
    await page.waitForTimeout(300);
    expect(await editorText(page)).toBe(before);
  });

  test('焦点在侧边栏文件树时 Cmd/Ctrl+Z 仍可撤销文件操作（显式语境）', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': 'hello' } });
    await openEditor(page);
    const created = await createUndoableFile(page);

    await page.locator('aside [tabindex="0"]').first().focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await getCalls(page, 'deleteArticle')).map((c) => c.args[0])).toEqual([created]);
  });

  test('菜单「撤销」在文件树聚焦时撤销一次文件操作，在编辑器聚焦时只撤销正文', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': 'hello' } });
    const reset = await openEditor(page);
    await createUndoableFile(page);

    await reset.click();
    await sendMenu(page, 'edit:undo');
    await page.waitForTimeout(200);
    expect(await getCalls(page, 'deleteArticle')).toHaveLength(0);

    await page.locator('aside [tabindex="0"]').first().focus();
    await sendMenu(page, 'edit:undo');
    await expect.poll(async () => (await getCalls(page, 'deleteArticle')).length).toBe(1);
  });

  test('弹窗打开时 Cmd/Ctrl+N / S / , 不作用于弹窗背后的应用', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': 'hello' } });
    await openEditor(page);
    await page.locator('button[title*="快速打开"]').click();
    const quickInput = page.getByPlaceholder('快速打开文章', { exact: false });
    await expect(quickInput).toBeVisible();
    await quickInput.focus();

    await page.keyboard.press('ControlOrMeta+n');
    await page.keyboard.press('ControlOrMeta+s');
    await page.keyboard.press('ControlOrMeta+,');
    await sendMenu(page, 'file:new');
    await sendMenu(page, 'editor:format', 'h1');
    await page.waitForTimeout(250);

    expect(await getCalls(page, 'createArticle')).toHaveLength(0);
    expect(await getCalls(page, 'saveArticle')).toHaveLength(0);
    await expect(quickInput).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    expect(await page.locator('.vditor-ir .vditor-reset h1').count()).toBe(0);
  });

  test('焦点在查找输入框时菜单加粗/标题快捷键不改动正文', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': 'hello world' } });
    const reset = await openEditor(page);
    await reset.click();
    await page.evaluate(() => {
      const reset = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
      const r = document.createRange();
      r.selectNodeContents(reset.querySelector('p') as HTMLElement);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    });
    await sendMenu(page, 'editor:find');
    const findInput = page.locator('input[placeholder*="查找"]').first();
    await findInput.focus();
    await findInput.type('wor');

    await sendMenu(page, 'editor:format', 'bold');
    await sendMenu(page, 'editor:format', 'h2');
    await page.waitForTimeout(250);

    expect(await page.locator('.vditor-ir .vditor-reset strong, .vditor-ir .vditor-reset h2').count()).toBe(0);
    await expect(findInput).toHaveValue('wor');
  });

  test('同一次按键同时到达渲染层与菜单加速键时只执行一次（新建 / 切换侧边栏）', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': 'hello' } });
    await openEditor(page);

    await page.keyboard.press('ControlOrMeta+n');
    await sendMenu(page, 'file:new');
    await page.waitForTimeout(300);
    expect(await getCalls(page, 'createArticle')).toHaveLength(1);

    const aside = page.locator('aside').first();
    const widthBefore = await aside.evaluate((el) => (el as HTMLElement).style.width);
    await page.locator('button[title*="快速打开"]').focus();
    await page.keyboard.press('ControlOrMeta+Shift+l');
    await sendMenu(page, 'view:toggleSidebar');
    await page.waitForTimeout(300);
    const widthAfter = await aside.evaluate((el) => (el as HTMLElement).style.width);
    expect(widthAfter).not.toBe(widthBefore);
    expect(widthAfter).toBe('0px');
  });

  test('按住 Cmd/Ctrl+N 自动重复时不会连续新建多篇文章', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': 'hello' } });
    await openEditor(page);
    await page.evaluate(() => {
      const fire = (repeat: boolean) =>
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, metaKey: true, repeat, bubbles: true, cancelable: true })
        );
      fire(false);
      fire(true);
      fire(true);
    });
    await page.waitForTimeout(300);
    expect(await getCalls(page, 'createArticle')).toHaveLength(1);
  });
});
