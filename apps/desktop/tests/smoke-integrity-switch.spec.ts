import { expect, test, type Page } from '@playwright/test';
import { getCalls, installMockWorkspace, openEditor, placeCaretAtEnd } from './support/mockWorkspace';
import { diskContent } from './support/integrity';

/**
 * 冒烟测试 @smoke —— 数据完整性 C：切换文件时最后输入落盘。
 * 在 A 里打字后 100ms 内点开 B：A 的磁盘内容必须含这次输入，且 A 的内容绝不能写进 B。
 * 运行层级：L2 无头 Chromium + mock 工作区（`window.__vcatFiles` 即磁盘）。
 */

const A = '# 甲文章\n\n第一段。\n';
const B = '# 乙文章\n\n乙的正文。\n';

async function openInSidebar(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: title, exact: true }).first().click();
}

async function typeInAThenOpenB(page: Page, text: string): Promise<void> {
  await placeCaretAtEnd(page);
  await page.keyboard.type(text);
  await page.waitForTimeout(50); // 仍在 320ms 输入防抖与 1.5s 自动保存之内
  await openInSidebar(page, 'b.md');
  await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('乙的正文');
}

test.describe('@smoke 数据完整性 C：切换文件不丢最后输入、不串文件', () => {
  test('A 中输入后 100ms 内点 B：B 一打开，A 的磁盘内容就含这次输入，B 逐字节不变', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A, 'b.md': B } });
    await openEditor(page);
    await typeInAThenOpenB(page, '尾巴');
    expect(await diskContent(page, 'a.md')).toBe(A.replace('第一段。', '第一段。尾巴'));
    expect(await diskContent(page, 'b.md')).toBe(B);
  });

  test('切到 B 后等过防抖与自动保存：A 的内容不会被写进 B', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A, 'b.md': B } });
    await openEditor(page);
    await typeInAThenOpenB(page, '尾巴');
    await page.waitForTimeout(2500);
    expect(await diskContent(page, 'a.md')).toBe(A.replace('第一段。', '第一段。尾巴'));
    expect(await diskContent(page, 'b.md')).toBe(B);
    const writesToB = (await getCalls(page, 'saveArticle')).filter((c) => c.args[0] === 'b.md');
    expect(writesToB.map((c) => c.args[1])).toEqual(writesToB.map(() => B));
  });

  test('A 的自动保存还在写盘时继续输入再点 B：A 最终含两次输入，B 不变', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A, 'b.md': B }, saveDelayMs: 800 });
    await openEditor(page);
    await placeCaretAtEnd(page);
    await page.keyboard.type('一');
    await expect.poll(async () => (await getCalls(page, 'saveArticle')).length, { timeout: 5000 }).toBe(1);
    await typeInAThenOpenB(page, '二');
    await page.waitForTimeout(2500);
    expect(await diskContent(page, 'a.md')).toBe(A.replace('第一段。', '第一段。一二'));
    expect(await diskContent(page, 'b.md')).toBe(B);
  });

  test('切到 B 立刻打字：字只进 B，A 只多原来那次输入', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A, 'b.md': B } });
    await openEditor(page);
    await typeInAThenOpenB(page, '尾巴');
    await placeCaretAtEnd(page);
    await page.keyboard.type('乙尾');
    // Vditor 800ms 后才回报输入，再经 320ms 防抖与 1.5s 自动保存。
    await page.waitForTimeout(4000);
    expect(await diskContent(page, 'a.md')).toBe(A.replace('第一段。', '第一段。尾巴'));
    expect(await diskContent(page, 'b.md')).toBe(B.replace('乙的正文。', '乙的正文。乙尾'));
  });

  test('A→B→A 快速来回：回到 A 时编辑器和磁盘都有刚才的输入', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A, 'b.md': B } });
    await openEditor(page);
    await typeInAThenOpenB(page, '尾巴');
    await openInSidebar(page, 'a.md');
    await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('第一段。尾巴');
    await page.waitForTimeout(2500);
    expect(await diskContent(page, 'a.md')).toBe(A.replace('第一段。', '第一段。尾巴'));
    expect(await diskContent(page, 'b.md')).toBe(B);
  });

  test('A 的输入回报还在防抖里时点 B：B 的大纲与发布内容不会变成 A 的文字', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A, 'b.md': B } });
    await openEditor(page);
    await placeCaretAtEnd(page);
    await page.keyboard.type('尾巴');
    // Vditor 在最后一次按键 800ms 后回报文本，编辑器再防抖 320ms 才通知外层：
    // 在 800–1120ms 之间切到 B，A 的这次回报还没送出。
    await page.waitForTimeout(950);
    await openInSidebar(page, 'b.md');
    await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('乙的正文');
    await page.waitForTimeout(1000);
    await page.getByText('大纲', { exact: true }).first().click();
    // 编辑器之外（大纲面板）出现的标题：只能是 B 的。
    const headingsOutsideEditor = () =>
      page.evaluate(() => {
        const texts = Array.from(document.querySelectorAll('body *'))
          .filter((el) => !el.closest('.vditor-ir') && el.children.length === 0)
          .map((el) => (el.textContent ?? '').trim());
        return [...new Set(texts.filter((t) => t === '甲文章' || t === '乙文章'))];
      });
    await expect.poll(headingsOutsideEditor).toEqual(['乙文章']);
    await page.waitForTimeout(2000);
    expect(await diskContent(page, 'a.md')).toBe(A.replace('第一段。', '第一段。尾巴'));
    expect(await diskContent(page, 'b.md')).toBe(B);
  });
});
