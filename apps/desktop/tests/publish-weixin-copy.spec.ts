import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { THEMES, openPublishWith, shot } from './support/publishMock';

/** 覆盖公众号排版里最容易在粘贴后走样的几类内容。 */
const MD = [
  '# 公众号复制保真',
  '',
  '## 二级标题',
  '',
  '> 外层引用',
  '> > 内层引用',
  '',
  '> [!WARNING]',
  '> 注意事项',
  '',
  '```js',
  'function f() {',
  '    return 1;',
  '}',
  '```',
  '',
  '| 列A | 列B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '- 一级',
  '  - 二级',
  '',
  '3. 第三',
  '4. 第四',
  '',
  '行内公式 $a*b*c$ 结束。',
  '',
  '$$',
  'E = mc^2',
  '$$',
].join('\n');

const base = { md: MD, auth: { weixin: true }, selected: ['weixin'] };

async function captureClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied?: string };
    const fake = {
      write: async (items: ClipboardItem[]) => {
        const blob = await items[0].getType('text/html');
        w.__copied = await blob.text();
      },
      writeText: async () => {},
    };
    Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true });
  });
}

/** 模拟公众号粘贴清洗（删 <style>/<script>、class、id）后，检查剩下的结构与内联样式。 */
function auditPasted(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script').forEach((n) => n.remove());
  doc.querySelectorAll('[class], [id]').forEach((n) => {
    n.removeAttribute('class');
    n.removeAttribute('id');
  });
  const body = doc.body;
  const all = Array.from(body.querySelectorAll('*'));
  const bare = all
    .filter((el) => !el.closest('svg') && !['BR', 'TR', 'THEAD', 'TBODY'].includes(el.tagName))
    .filter((el) => !(el.getAttribute('style') ?? '').trim())
    .map((el) => el.tagName);
  const rowPad = (text: string) => {
    const p = Array.from(body.querySelectorAll('p')).find((x) => x.textContent?.includes(text));
    return parseFloat((p?.getAttribute('style') ?? '').match(/padding-left: ([\d.]+)em/)?.[1] ?? 'NaN');
  };
  const code = Array.from(body.querySelectorAll('p')).find((p) => p.textContent?.includes('function'));
  const quotes = all.filter((el) => (el.getAttribute('style') ?? '').includes('border-left: 4px solid'));
  return {
    rewritten: ['ul', 'ol', 'li', 'blockquote', 'pre'].filter((t) => body.querySelector(t)),
    bare,
    codeBr: code?.querySelectorAll('br').length ?? 0,
    codeIndent: code?.textContent?.includes('\u00a0\u00a0\u00a0\u00a0return') ?? false,
    codeKeywordColor: !!code?.querySelector('span[style*="#d73a49"]'),
    nestedListDeeper: rowPad('二级') > rowPad('一级'),
    orderedFrom3: /3\.\s*第三/.test(body.textContent ?? '') && !/1\.\s*第三/.test(body.textContent ?? ''),
    quoteBoxes: quotes.length,
    nestedQuote: quotes.some((q) => quotes.some((o) => o !== q && q.contains(o))),
    calloutColor: quotes.some((q) => (q.getAttribute('style') ?? '').includes('#9a6700')),
    tableCellsStyled: Array.from(body.querySelectorAll('th, td')).every((c) => (c.getAttribute('style') ?? '').includes('border')),
    svgCount: body.querySelectorAll('svg').length,
    rawDollar: (body.textContent ?? '').includes('$'),
  };
}

test.describe('公众号「复制富文本」：粘贴进公众号编辑器后样式不丢', () => {
  test('复制出的 HTML 只靠内联样式：没有会被公众号改写的 ul/ol/li/blockquote/pre，公式是内联 SVG', async ({ page }) => {
    await captureClipboard(page);
    await openPublishWith(page, base);
    await page.getByTestId('section-weixin').getByRole('button', { expanded: false }).click();
    const preview = page.getByTestId('weixin-preview');
    await preview.getByRole('button', { name: '复制富文本' }).click();
    await expect(preview.getByRole('button', { name: '已复制' })).toBeVisible();
    const html = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? '');
    expect(html).not.toContain('class=');
    expect(html).not.toContain('<style');
    const r = await page.evaluate(auditPasted, html);
    expect(r.rewritten).toEqual([]);
    expect(r.bare).toEqual([]);
    expect(r.codeBr).toBe(2);
    expect(r.codeIndent).toBe(true);
    expect(r.codeKeywordColor).toBe(true);
    expect(r.nestedListDeeper).toBe(true);
    expect(r.orderedFrom3).toBe(true);
    expect(r.quoteBoxes).toBe(3);
    expect(r.nestedQuote).toBe(true);
    expect(r.calloutColor).toBe(true);
    expect(r.tableCellsStyled).toBe(true);
    expect(r.svgCount).toBe(2);
    expect(r.rawDollar).toBe(false);
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：公众号排版预览（引用、代码、列表、表格、公式）`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await openPublishWith(page, { ...base, theme });
      await page.getByTestId('section-weixin').getByRole('button', { expanded: false }).click();
      const preview = page.getByTestId('weixin-preview');
      await expect(preview.locator('iframe')).toHaveAttribute('srcdoc', /<svg/, { timeout: 15_000 });
      await preview.scrollIntoViewIfNeeded();
      await shot(page, testInfo, `weixin-copy-${mode}`);
      // 整篇排版（预览 iframe 的 srcdoc 原样放进独立页面整页截图；这部分不随应用主题变，公众号里也是白底）。
      const srcdoc = (await preview.locator('iframe').getAttribute('srcdoc')) ?? '';
      const article = await page.context().newPage();
      await article.setViewportSize({ width: 640, height: 800 });
      await article.setContent(srcdoc);
      const dir = process.env.PW_SCREENSHOT_DIR;
      const name = `weixin-copy-${mode}-full.png`;
      await article.screenshot({ path: dir ? path.join(dir, name) : testInfo.outputPath(name), fullPage: true });
      await article.close();
    });
  }
});
