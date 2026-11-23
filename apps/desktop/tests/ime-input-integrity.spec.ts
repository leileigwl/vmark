import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { installMockWorkspace, openEditor } from './support/mockWorkspace';

/** Puts the caret at the end of the last non-empty text node inside `selector`. */
async function caretAtEndOf(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const root = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
    const target = root.querySelector(sel) as HTMLElement;
    root.focus();
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    let n: Node | null;
    while ((n = walker.nextNode())) if ((n.nodeValue || '').replace(/\u200b/g, '').trim()) last = n as Text;
    const r = document.createRange();
    if (last) r.setStart(last, (last.nodeValue || '').replace(/\n$/, '').length);
    else r.selectNodeContents(target);
    r.collapse(true);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  }, selector);
}

/**
 * Reproduces a pinyin IME session: real composition via CDP, then the keydown the
 * IME sends when the user presses `key` to confirm the candidate (isComposing=true,
 * keyCode 229), then the commit. Returns whether the app cancelled that keydown.
 */
async function composeAndConfirmWith(page: Page, client: CDPSession, pinyin: string, commit: string, key: string) {
  for (let i = 1; i <= pinyin.length; i++) {
    await client.send('Input.imeSetComposition', { text: pinyin.slice(0, i), selectionStart: i, selectionEnd: i });
  }
  const prevented = await page.evaluate((k) => {
    const target = (window.getSelection()?.anchorNode?.parentElement ?? document.activeElement) as HTMLElement;
    const ev = new KeyboardEvent('keydown', { key: k, code: k, isComposing: true, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: () => 229 });
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  }, key);
  await client.send('Input.insertText', { text: commit });
  await page.waitForTimeout(350);
  return prevented;
}

async function saveAndRead(page: Page, rel = 'a.md'): Promise<string> {
  await page.waitForTimeout(400);
  await page.keyboard.press('ControlOrMeta+s');
  await page.waitForTimeout(300);
  return page.evaluate((r) => (window as unknown as { __vcatFiles: Record<string, string> }).__vcatFiles[r], rel);
}

test.describe('中文输入法 / 粘贴输入完整性（不乱插换行、不丢字）', () => {
  test('代码块缩进行内：输入法组字时按 Enter 确认候选，不插入换行与缩进', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '```py\ndef f():\n    x = 1\n```\n' } });
    await openEditor(page);
    await caretAtEndOf(page, 'pre.vditor-ir__marker--pre > code');
    const client = await page.context().newCDPSession(page);

    const prevented = await composeAndConfirmWith(page, client, 'zhongwen', '中文', 'Enter');

    expect(prevented).toBe(false);
    const code = await page.locator('pre.vditor-ir__marker--pre > code').first().textContent();
    expect((code || '').replace(/\u200b/g, '').replace(/\n$/, '')).toBe('def f():\n    x = 1中文');
  });

  test('表格单元格内：输入法组字时按 Enter 确认候选，光标不跳到下一行、文字留在原单元格', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '| a | b |\n| - | - |\n| c | d |\n| e | f |\n' } });
    await openEditor(page);
    await caretAtEndOf(page, 'tbody tr:first-child td');
    const client = await page.context().newCDPSession(page);

    const prevented = await composeAndConfirmWith(page, client, 'zhong', '中', 'Enter');

    expect(prevented).toBe(false);
    const cells = await page.locator('.vditor-ir .vditor-reset tbody td').allTextContents();
    expect(cells.map((c) => c.replace(/\u200b/g, '').trim())).toEqual(['c中', 'd', 'e', 'f']);
  });

  test('输入法组字/中文标点时按 ( 不自动补全成对括号（避免「(（)」乱码）', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '正文' } });
    await openEditor(page);
    await caretAtEndOf(page, 'p');
    const client = await page.context().newCDPSession(page);

    const prevented = await composeAndConfirmWith(page, client, 'zuo', '（', '(');

    expect(prevented).toBe(false);
    const text = await page.locator('.vditor-ir .vditor-reset p').first().textContent();
    expect((text || '').replace(/\u200b/g, '')).toBe('正文（');
  });

  test('引用内粘贴带 > 前缀的多行文本（含 Windows CRLF）不额外插入空引用行', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '> quote\n\nafter\n' } });
    await openEditor(page);
    await caretAtEndOf(page, 'blockquote p');
    await page.evaluate(() => {
      const p = document.querySelector('.vditor-ir .vditor-reset blockquote p') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('text/plain', '> 甲\r\n> 乙');
      p.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
    await page.keyboard.type('丙');

    expect(await saveAndRead(page)).toBe('> quote甲\n> 乙丙\n\nafter\n');
    await expect(page.locator('.vditor-ir .vditor-reset blockquote blockquote')).toHaveCount(0);
  });
});
