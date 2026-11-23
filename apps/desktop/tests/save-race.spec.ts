import { expect, test, type Page } from '@playwright/test';
import { getCalls, installMockWorkspace, openEditor, placeCaretAtEnd } from './support/mockWorkspace';

/** Delays `readArticle` for one file, to reproduce a slow load while switching articles. */
async function delayRead(page: Page, rel: string, ms: number): Promise<void> {
  await page.addInitScript(
    ({ target, delay }: { target: string; delay: number }) => {
      const api = (window as unknown as { electronAPI: { readArticle: (r: string) => Promise<string> } }).electronAPI;
      const original = api.readArticle;
      api.readArticle = async (r: string) => {
        if (r === target) await new Promise((res) => setTimeout(res, delay));
        return original(r);
      };
    },
    { target: rel, delay: ms }
  );
}

function fileContent(page: Page, rel: string): Promise<string | undefined> {
  return page.evaluate((r) => (window as unknown as { __vcatFiles: Record<string, string> }).__vcatFiles[r], rel);
}

async function openInSidebar(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: title, exact: true }).first().click();
}

test.describe('保存竞态：不丢输入、不串文章', () => {
  test('自动保存进行中继续输入，保存完成后新输入仍会被保存', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '甲乙丙\n' }, saveDelayMs: 1500 });
    await openEditor(page);
    await placeCaretAtEnd(page);
    await page.keyboard.type('第一段');
    // 等自动保存请求发出（尚未返回，保存延迟 1500ms），在保存过程中继续输入。
    await expect.poll(async () => (await getCalls(page, 'saveArticle')).length, { timeout: 5000 }).toBe(1);
    await page.keyboard.type('第二段');
    await page.waitForTimeout(5000);
    expect(await fileContent(page, 'a.md')).toContain('第二段');
  });

  test('切换文章时，最后不到 320ms 的输入也会写入原文章', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '甲乙丙\n', 'b.md': '乙文章\n' } });
    await openEditor(page);
    await placeCaretAtEnd(page);
    await page.keyboard.type('尾巴');
    await openInSidebar(page, 'b.md');
    await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('乙文章');
    await page.waitForTimeout(600);
    expect(await fileContent(page, 'a.md')).toContain('尾巴');
  });

  test('新文章加载慢时，自动保存不会把旧文章内容写进新文章', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '甲乙丙\n', 'b.md': '乙文章\n' } });
    await delayRead(page, 'b.md', 2500);
    await openEditor(page);
    await placeCaretAtEnd(page);
    await page.keyboard.type('改动');
    await expect(page.getByText('未保存')).toBeVisible();
    await openInSidebar(page, 'b.md');
    await page.waitForTimeout(3500);
    expect(await fileContent(page, 'b.md')).toBe('乙文章\n');
    expect(await fileContent(page, 'a.md')).toContain('改动');
    await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('乙文章');
  });
});
