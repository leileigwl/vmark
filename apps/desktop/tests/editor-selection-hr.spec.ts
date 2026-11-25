import { expect, test } from '@playwright/test';
import { installMockWorkspace, openEditor } from './support/mockWorkspace';
import { caretAt, saveAndRead } from './support/integrity';

async function open(page: import('@playwright/test').Page, content: string) {
  await installMockWorkspace(page, { files: { 'a.md': content } });
  await openEditor(page);
}

test.describe('编辑器拖选空白区向上选区 & 水平分割线退格删除', () => {
  test('从下方空白区域向上拖拽框选列表与正文后按 Backspace 可正常删除', async ({ page }) => {
    const doc = '第一段文字\n\n- 列表一\n- 列表二\n\n---\n';
    await open(page, doc);

    const coords = await page.evaluate(() => {
      const reset = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
      const items = reset.querySelectorAll('li');
      const firstLi = items[0] as HTMLElement;
      const resetRect = reset.getBoundingClientRect();
      const hr = reset.querySelector('hr') as HTMLElement;
      const hrRect = hr.getBoundingClientRect();
      const firstRect = firstLi.getBoundingClientRect();
      return {
        startX: Math.round(resetRect.left + 80),
        startY: Math.round(hrRect.bottom + 40),
        endX: Math.round(firstRect.left + 4),
        endY: Math.round(firstRect.top + firstRect.height / 2),
      };
    });

    await page.mouse.move(coords.startX, coords.startY);
    await page.mouse.down();
    await page.mouse.move(coords.endX, coords.endY, { steps: 10 });
    await page.mouse.up();

    const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selectedText).toContain('列表二');

    await page.keyboard.press('Backspace');
    const after = await saveAndRead(page);
    expect(after).not.toContain('列表二');
  });

  test('空白区域单击（不拖拽）仍能自动落位新段落输入', async ({ page }) => {
    const doc = '第一段\n\n---\n';
    await open(page, doc);

    const pt = await page.evaluate(() => {
      const reset = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
      const hr = reset.querySelector('hr') as HTMLElement;
      const r = hr.getBoundingClientRect();
      return { x: Math.round(r.left + 60), y: Math.round(r.bottom + 40) };
    });

    await page.mouse.click(pt.x, pt.y);
    await page.keyboard.type('新段落');
    expect(await saveAndRead(page)).toContain('新段落');
  });

  test('水平分割线下方空行按 Backspace：删除分割线且光标落在上方末尾（不在最前面）', async ({ page }) => {
    const doc = '- 列表一\n- 列表二\n\n---\n\n';
    await open(page, doc);

    // 确认分割线下方有空段并把光标放进去
    await page.evaluate(() => {
      const reset = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
      const hr = reset.querySelector('hr') as HTMLElement;
      let nextP = hr.nextElementSibling as HTMLElement | null;
      if (!nextP || nextP.tagName !== 'P') {
        nextP = document.createElement('p');
        nextP.setAttribute('data-block', '0');
        nextP.innerHTML = '<br>';
        hr.insertAdjacentElement('afterend', nextP);
      }
      reset.focus();
      const r = document.createRange();
      r.selectNodeContents(nextP);
      r.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    });

    await page.keyboard.press('Backspace');
    await page.keyboard.type('X');
    const saved = await saveAndRead(page);
    expect(saved).not.toContain('---');
    expect(saved).toContain('- 列表二X');
  });

  test('水平分割线上方段落末尾按 Delete：直接删除分割线且不丢正文', async ({ page }) => {
    const doc = '上方文字\n\n---\n\n下方文字\n';
    await open(page, doc);

    await caretAt(page, '上方文字');
    await page.keyboard.press('Delete');
    const saved = await saveAndRead(page);
    expect(saved).not.toContain('---');
    expect(saved).toContain('上方文字');
    expect(saved).toContain('下方文字');
  });
});
