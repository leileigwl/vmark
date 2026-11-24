import { expect, test, type Page } from '@playwright/test';
import { getCalls, installMockWorkspace, openEditor } from './support/mockWorkspace';

const TASKS = '- [ ] 任务一\n- [ ] 任务二\n';

function fileContent(page: Page, rel = 'a.md'): Promise<string | undefined> {
  return page.evaluate((r) => (window as unknown as { __vcatFiles: Record<string, string> }).__vcatFiles[r], rel);
}

/** Optional evidence screenshot (set VMARK_SHOT_DIR); never affects the test result. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.VMARK_SHOT_DIR;
  if (!dir) return;
  await page
    .evaluate((files) => {
      const box = document.createElement('pre');
      box.style.cssText =
        'position:fixed;right:8px;bottom:8px;z-index:9999;background:#fffbe6;border:1px solid #e5c07b;padding:8px;font-size:13px;max-width:460px;white-space:pre-wrap';
      box.textContent = '磁盘上的文件（mock）\n' + Object.entries(files).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
      document.body.appendChild(box);
    }, await page.evaluate(() => (window as unknown as { __vcatFiles: Record<string, string> }).__vcatFiles))
    .catch(() => undefined);
  await page.screenshot({ path: `${dir}/${name}.png` }).catch(() => undefined);
}

function checkbox(page: Page, index: number) {
  return page.locator('.vditor-ir .vditor-reset input[type="checkbox"]').nth(index);
}

test.describe('任务列表复选框', () => {
  test('点击复选框会自动保存，且保持 `- [x] ` 原格式', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': TASKS } });
    await openEditor(page);
    await checkbox(page, 0).click();
    // 与普通输入一致：点击后约 1.5s 自动保存（修复前要等 Vditor undoDelay 800ms + 320ms + 1500ms）。
    await page.waitForTimeout(2200);
    await shot(page, '1-click-autosaves');
    expect((await getCalls(page, 'saveArticle')).length).toBeGreaterThan(0);
    expect(await fileContent(page)).toBe('- [x] 任务一\n- [ ] 任务二\n');
  });

  test('手动保存不把勾选改写成 `- [X]  `（大写 + 双空格）', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '- [x] 任务一\n- [ ] 任务二\n' } });
    await openEditor(page);
    await checkbox(page, 1).click();
    await page.keyboard.press('ControlOrMeta+s');
    await page.waitForTimeout(400);
    await shot(page, '2-manual-save-format');
    expect(await fileContent(page)).toBe('- [x] 任务一\n- [x] 任务二\n');
  });

  test('连点两个复选框后撤销一次只撤回最后一次点击', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': TASKS } });
    await openEditor(page);
    await checkbox(page, 0).click();
    await page.waitForTimeout(100);
    await checkbox(page, 1).click();
    await page.waitForTimeout(100);
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(2500);
    await shot(page, '3-undo-one-click');
    await expect(checkbox(page, 0)).toBeChecked();
    await expect(checkbox(page, 1)).not.toBeChecked();
    expect(await fileContent(page)).toBe('- [x] 任务一\n- [ ] 任务二\n');
  });
});

test('查找替换「全部替换」后内容会落盘', async ({ page }) => {
  await installMockWorkspace(page, { files: { 'a.md': '苹果和苹果\n\n香蕉\n' } });
  await openEditor(page);
  await page.evaluate(() => (window as unknown as { __vcatMenu: (a: string) => void }).__vcatMenu('editor:find'));
  await page.getByPlaceholder('查找正文...').fill('苹果');
  await page.getByTitle('展开替换栏').click();
  await page.getByPlaceholder('替换为...').fill('橙子');
  await page.getByRole('button', { name: '全部替换' }).click();
  await expect(page.getByText('已替换 2 处')).toBeVisible();
  await page.waitForTimeout(2500);
  await shot(page, '4-replace-all-persists');
  expect((await getCalls(page, 'saveArticle')).length).toBeGreaterThan(0);
  expect(await fileContent(page)).toBe('橙子和橙子\n\n香蕉\n');
});
