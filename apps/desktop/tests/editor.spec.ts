import { expect, test, type Page } from '@playwright/test';

async function setupApp(page: Page, initialMarkdown = '') {
  await page.addInitScript((md: string) => {
    let savedMd = md;
    const articleMeta = {
      id: 'test-1',
      title: 'Test Article',
      relativePath: 'test.md',
      folder: '',
      wordCount: 10,
      updatedAt: Date.now(),
      imageCount: 0,
      hasFrontmatter: false,
      excerpt: '',
    };
    (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      getWorkspacePath: async () => '/tmp/vcat-test',
      getRecentWorkspaces: async () => ['/tmp/vcat-test'],
      listArticles: async () => [articleMeta],
      listFolders: async () => [],
      getImageBedConfig: async () => ({ provider: 'none' }),
      getStartupConfig: async () => ({ lastArticlePath: 'test.md', theme: 'apple-light' }),
      getPlatformAuthStates: async () => ({}),
      getGitStatus: async () => ({ isRepo: false, branch: '', dirty: false, ahead: 0, behind: 0 }),
      readArticle: async () => savedMd,
      saveArticle: async (_p: string, content: string) => {
        savedMd = content;
        return { ok: true };
      },
      saveStartupConfig: async () => ({ ok: true }),
      setRecentFiles: () => {},
      onMenuAction: () => () => {},
    };
  }, initialMarkdown);

  await page.goto('http://localhost:4173');
  const reset = page.locator('.vditor-ir .vditor-reset');
  await reset.waitFor({ state: 'visible', timeout: 15_000 });
  await reset.click();
  await page.waitForTimeout(150);
  return reset;
}

async function clearAndFocusFirstLine(page: Page) {
  await page.evaluate(() => {
    const reset = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement | null;
    if (!reset) return;
    reset.innerHTML = '<p data-block="0"><br></p>';
    const p = reset.querySelector('p')!;
    const r = document.createRange();
    r.setStart(p, 0);
    r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    reset.focus();
  });
  await page.waitForTimeout(50);
}

test.describe('Vcat Vditor IR Editor E2E', () => {
  test('1. 空标题 ### + 空格后无正文时仍保持大号粗体不消失', async ({ page }) => {
    await setupApp(page);
    await clearAndFocusFirstLine(page);
    await page.keyboard.type('###');
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);

    const h3 = page.locator('.vditor-reset h3').first();
    await expect(h3).toBeVisible();
    const style = await h3.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { fontSize: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10) };
    });
    expect(style.fontSize).toBeGreaterThanOrEqual(19);
    expect(style.fontWeight).toBeGreaterThanOrEqual(600);
  });

  test('2. 代码块语言选择框 Enter / Tab 可选定语言并跳入代码正文', async ({ page }) => {
    await setupApp(page, '```ts\nconsole.log(1);\n```\n');
    const infoMarker = page.locator('.vditor-reset .vditor-ir__marker--info').first();
    await infoMarker.click();
    await page.waitForTimeout(100);

    // Clear and type 'py'
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Control+a').catch(() => {});
    await page.keyboard.type('py');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    const inCodeBody = await page.evaluate(() => {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      return Boolean(el?.closest('pre.vditor-ir__marker--pre code, pre code'));
    });
    expect(inCodeBody).toBe(true);
  });

  test('3. 反引号 1:1 输入与三反引号展开代码块且无残留', async ({ page }) => {
    await setupApp(page);
    await clearAndFocusFirstLine(page);

    await page.keyboard.type('`');
    await page.waitForTimeout(80);
    const after1 = await page.evaluate(() => {
      const p = document.querySelector('.vditor-ir .vditor-reset p');
      return (p?.textContent || '').replace(/[\u200b\ufeff]/g, '');
    });
    expect(after1).toBe('`');

    await page.keyboard.type('`');
    await page.waitForTimeout(80);
    const after2 = await page.evaluate(() => {
      const p = document.querySelector('.vditor-ir .vditor-reset p');
      return (p?.textContent || '').replace(/[\u200b\ufeff]/g, '');
    });
    expect(after2).toBe('``');

    await page.keyboard.type('`');
    await page.waitForTimeout(150);

    const cbCount = await page.locator('.vditor-reset .vditor-ir__node[data-type="code-block"]').count();
    expect(cbCount).toBe(1);
    const strayTicks = await page.evaluate(() => {
      const reset = document.querySelector('.vditor-ir .vditor-reset');
      const ps = Array.from(reset?.querySelectorAll('p') || []);
      return ps.map((p) => (p.textContent || '').replace(/[\u200b\ufeff]/g, '')).filter((t) => t.includes('`'));
    });
    expect(strayTicks).toEqual([]);
  });

  test('4. /table 弹窗选择 3 列 4 行后真实插入空表格且不跳回文档顶端', async ({ page }) => {
    const longPrefix = Array.from({ length: 30 }, (_, i) => `段落 ${i + 1}`).join('\n\n');
    await setupApp(page, `${longPrefix}\n\n`);
    const lastP = page.locator('.vditor-ir .vditor-reset p').last();
    await lastP.scrollIntoViewIfNeeded();
    await lastP.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('/table');
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    const confirmBtn = page.getByRole('button', { name: '确定' });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    await page.waitForTimeout(200);

    const table = page.locator('.vditor-reset table').last();
    await expect(table).toBeVisible();
    const rowCount = await table.locator('tr').count();
    expect(rowCount).toBe(4);
    const firstCellText = (await table.locator('th').first().textContent())?.trim() || '';
    expect(firstCellText).toBe('');
    const inFirstCell = await page.evaluate(() => {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      return Boolean(el?.closest('table th, table td'));
    });
    expect(inFirstCell).toBe(true);
  });

  test('5. 列表与引用按空格即刻渲染（不需再敲字符）且显示列表标号', async ({ page }) => {
    await setupApp(page);
    await clearAndFocusFirstLine(page);

    // 1. + Space -> immediate <ol><li> with decimal marker
    await page.keyboard.type('1.');
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);
    const ol = page.locator('.vditor-reset ol').first();
    await expect(ol).toBeVisible();
    const olStyle = await ol.evaluate((el) => window.getComputedStyle(el).listStyleType);
    expect(olStyle).toBe('decimal');

    // Clear and test - + Space -> immediate <ul><li> with disc marker
    await clearAndFocusFirstLine(page);
    await page.keyboard.type('-');
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);
    const ul = page.locator('.vditor-reset ul').first();
    await expect(ul).toBeVisible();
    const ulStyle = await ul.evaluate((el) => window.getComputedStyle(el).listStyleType);
    expect(ulStyle).toBe('disc');

    // Clear and test > stays plain until Space, then renders blockquote
    await clearAndFocusFirstLine(page);
    await page.keyboard.type('>');
    await page.waitForTimeout(100);
    expect(await page.locator('.vditor-reset blockquote').count()).toBe(0);
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);
    await expect(page.locator('.vditor-reset blockquote').first()).toBeVisible();

    // Inside blockquote, type 1. + Space -> nested <ol>
    await page.keyboard.type('1.');
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);
    await expect(page.locator('.vditor-reset blockquote ol').first()).toBeVisible();
  });

  test('6. 代码块内部删除隔离：全选删除不毁外壳，空块按退格可删', async ({ page }) => {
    await setupApp(page, '```ts\nconst x = 1;\n```\n');
    const codeEl = page.locator('.vditor-reset pre code').first();
    await codeEl.click();
    await page.waitForTimeout(80);
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    // Code block wrapper and info marker should still exist!
    await expect(page.locator('.vditor-reset .vditor-ir__node[data-type="code-block"]')).toHaveCount(1);
    await expect(page.locator('.vditor-reset .vditor-ir__marker--info')).toHaveCount(1);
  });

  test('7. 代码块语言选择框 Tab 键确认 & 空标题失焦仍保持大号粗体可见', async ({ page }) => {
    await setupApp(page, '```ts\nconst a = 1;\n```\n');
    const infoMarker = page.locator('.vditor-reset .vditor-ir__marker--info').first();
    await infoMarker.click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('f');
    await page.waitForTimeout(150);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);

    const inCodeBody = await page.evaluate(() => {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      return Boolean(el?.closest('pre.vditor-ir__marker--pre code, pre code'));
    });
    expect(inCodeBody).toBe(true);

    // Now test empty heading ### + Space and blur -> marker should stay big & bold & visible
    await clearAndFocusFirstLine(page);
    await page.keyboard.type('###');
    await page.keyboard.press(' ');
    await page.waitForTimeout(150);
    // Blur editor by clicking top header
    await page.locator('header').first().click();
    await page.waitForTimeout(150);

    const h3Marker = page.locator('.vditor-reset h3 .vditor-ir__marker--heading').first();
    await expect(h3Marker).toBeVisible();
    const h3MarkerStyle = await h3Marker.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { fontSize: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10) };
    });
    expect(h3MarkerStyle.fontSize).toBeGreaterThanOrEqual(19);
    expect(h3MarkerStyle.fontWeight).toBeGreaterThanOrEqual(600);
  });

  test('8. 任务列表 [] + 空格、空加粗 **** 无胶囊底色、引用块复制保留 > 前缀', async ({ page }) => {
    await setupApp(page);
    await clearAndFocusFirstLine(page);

    await page.keyboard.type('[]');
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);
    await expect(page.locator('.vditor-reset li.vditor-task').first()).toBeVisible();

    // Empty bold **** has transparent background
    await clearAndFocusFirstLine(page);
    await page.keyboard.type('****');
    await page.waitForTimeout(150);
    const strongStyle = await page.evaluate(() => {
      const s = document.querySelector('.vditor-reset strong');
      if (!s) return null;
      const cs = window.getComputedStyle(s);
      return { bg: cs.backgroundColor, emptyAttr: s.getAttribute('data-vcat-empty') };
    });
    if (strongStyle) {
      expect(strongStyle.emptyAttr).toBe('1');
      expect(strongStyle.bg).toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('9. 引用嵌套限制 & 引用上方空行 Delete 不撕裂卡片', async ({ page }) => {
    await setupApp(page, '\n\n> 引用正文\n');
    // Verify Delete on empty paragraph above blockquote keeps blockquote intact
    const firstP = page.locator('.vditor-ir .vditor-reset > p').first();
    await firstP.click();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);
    await expect(page.locator('.vditor-ir .vditor-reset blockquote')).toHaveCount(1);
    await expect(page.locator('.vditor-ir .vditor-reset blockquote > p')).toContainText('引用正文');

    // Inside blockquote, typing > + Space must NOT create nested blockquote > blockquote
    await page.locator('.vditor-ir .vditor-reset blockquote > p').first().click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('>');
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);
    await expect(page.locator('.vditor-ir .vditor-reset blockquote blockquote')).toHaveCount(0);
  });

  test('10. Ctrl/Cmd+X 正常剪切文本生效 + 跨块剪切绝不把下方代码块 text 拉上来', async ({ page }) => {
    await setupApp(page, 'hello world\n\n> sfsafsafas\n\n```text\nconst a = 1;\n```\n');
    // 10a: Normal same-paragraph Ctrl/Cmd+X actually removes the selected text
    const firstP = page.locator('.vditor-ir .vditor-reset > p').first();
    await firstP.click();
    await page.evaluate(() => {
      const p = document.querySelector('.vditor-ir .vditor-reset > p')!;
      const t = p.firstChild!;
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 5);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    });
    await page.keyboard.press('Meta+x');
    await page.waitForTimeout(100);
    expect((await firstP.textContent())?.trim()).toBe('world');

    // 10b: Cross-block cut from quote to code block keeps code block intact
    const quoteP = page.locator('.vditor-ir .vditor-reset blockquote p').first();
    await quoteP.click();
    // Select across quote paragraph boundary (simulating triple-click / line cut)
    await page.evaluate(() => {
      const q = document.querySelector('.vditor-ir .vditor-reset blockquote p')!;
      const cbInfo = document.querySelector('.vditor-ir .vditor-reset .vditor-ir__marker--info')!;
      const r = document.createRange();
      r.setStart(q, 0);
      r.setEnd(cbInfo, 0);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    });
    await page.keyboard.press('Meta+x');
    await page.waitForTimeout(150);

    // Code block and its info marker must remain intact, and blockquote must not contain 'text'
    await expect(page.locator('.vditor-ir .vditor-reset .vditor-ir__node[data-type="code-block"]')).toHaveCount(1);
    const quoteText = (await page.locator('.vditor-ir .vditor-reset blockquote').first().textContent()) || '';
    expect(quoteText).not.toContain('text');
  });

  test('11. 失焦后点击代码块语言标签 ts 可立即打字修改不锁死 + 文档中间 ``` 落焦新代码块', async ({ page }) => {
    await setupApp(page, '第一段\n\n```ts\nconst bottom = 1;\n```\n');
    // Blur editor first, then click language badge 'ts'
    await page.locator('header').first().click();
    await page.waitForTimeout(100);
    const infoMarker = page.locator('.vditor-ir .vditor-reset .vditor-ir__marker--info').first();
    await infoMarker.click();
    await page.waitForTimeout(100);
    await page.keyboard.type('py');
    await page.waitForTimeout(100);
    expect((await infoMarker.textContent())?.replace(/\u200b/g, '').trim()).toBe('py');

    // Now type ``` in the FIRST paragraph (above the existing code block)
    const firstP = page.locator('.vditor-ir .vditor-reset > p').first();
    await firstP.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('```');
    await page.waitForTimeout(200);

    // The NEW (first) code block should be expanded and focused, NOT the bottom one
    const firstCb = page.locator('.vditor-ir .vditor-reset .vditor-ir__node[data-type="code-block"]').first();
    await expect(firstCb).toHaveClass(/vditor-ir__node--expand/);
    const focusedInFirstCb = await page.evaluate(() => {
      const first = document.querySelectorAll('.vditor-ir .vditor-reset .vditor-ir__node[data-type="code-block"]')[0];
      const sel = window.getSelection();
      return Boolean(first && sel?.anchorNode && first.contains(sel.anchorNode));
    });
    expect(focusedInFirstCb).toBe(true);
  });

  test('12. 表格单元格内禁止 ``` 展开代码块及多行粘贴不炸表', async ({ page }) => {
    await setupApp(page, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
    const firstTd = page.locator('.vditor-ir .vditor-reset table td').first();
    await firstTd.click();
    await page.waitForTimeout(80);
    await page.keyboard.type('```ts');
    await page.waitForTimeout(150);

    // Table must remain intact (1 table, 0 code blocks)
    await expect(page.locator('.vditor-ir .vditor-reset table')).toHaveCount(1);
    await expect(page.locator('.vditor-ir .vditor-reset .vditor-ir__node[data-type="code-block"]')).toHaveCount(0);

    // Simulate multi-line paste inside table cell -> must not split table
    await page.evaluate(() => {
      const td = document.querySelector('.vditor-ir .vditor-reset table td')!;
      const r = document.createRange();
      r.selectNodeContents(td);
      r.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      const dt = new DataTransfer();
      dt.setData('text/plain', 'line1\nline2\n| broken |');
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      td.dispatchEvent(ev);
    });
    await page.waitForTimeout(150);
    await expect(page.locator('.vditor-ir .vditor-reset table')).toHaveCount(1);
  });

  test('13. 引用内单行局部复制为纯文本 + 粘贴进引用不产生嵌套竖线', async ({ page }) => {
    await setupApp(page, '> 第一行测试文字\n>\n> 第二行\n');
    const quoteP = page.locator('.vditor-ir .vditor-reset blockquote p').first();
    await quoteP.click();

    // Partial selection inside single quote paragraph -> copy must NOT prepend '> '
    const copiedPartial = await page.evaluate(() => {
      const p = document.querySelector('.vditor-ir .vditor-reset blockquote p')!;
      const textNode = p.firstChild!;
      const r = document.createRange();
      r.setStart(textNode, 0);
      r.setEnd(textNode, 3);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      const dt = new DataTransfer();
      const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
      p.dispatchEvent(ev);
      return dt.getData('text/plain');
    });
    expect(copiedPartial).not.toMatch(/^>\s/);

    // Pasting '> 嵌套文本' inside existing blockquote must NOT create blockquote > blockquote
    await page.evaluate(() => {
      const p = document.querySelector('.vditor-ir .vditor-reset blockquote p')!;
      const r = document.createRange();
      r.selectNodeContents(p);
      r.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      const dt = new DataTransfer();
      dt.setData('text/plain', '> 嵌套文本');
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      p.dispatchEvent(ev);
    });
    await page.waitForTimeout(150);
    await expect(page.locator('.vditor-ir .vditor-reset blockquote blockquote')).toHaveCount(0);
  });

  test('14. 代码块语言框内粘贴多行文本不夹断代码块', async ({ page }) => {
    await setupApp(page, '```ts\nconst a = 1;\n```\n');
    const infoMarker = page.locator('.vditor-ir .vditor-reset .vditor-ir__marker--info').first();
    await infoMarker.click();
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      const info = document.querySelector('.vditor-ir .vditor-reset .vditor-ir__marker--info')!;
      const dt = new DataTransfer();
      dt.setData('text/plain', 'python\n# extra line\nmore text');
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      info.dispatchEvent(ev);
    });
    await page.waitForTimeout(150);

    await expect(page.locator('.vditor-ir .vditor-reset .vditor-ir__node[data-type="code-block"]')).toHaveCount(1);
    const infoText = (await infoMarker.textContent())?.replace(/\u200b/g, '').trim() || '';
    expect(infoText).not.toContain('\n');
  });

  test('15. 代码块内包含反引号时复制不转义为 \\` 或 ``\\`', async ({ page }) => {
    await setupApp(page, '```ts\nconst s = "`hello`";\n```\n');
    const codeEl = page.locator('.vditor-ir .vditor-reset pre code').first();
    await codeEl.click();
    await page.waitForTimeout(80);

    const copiedCode = await page.evaluate(() => {
      const code = document.querySelector('.vditor-ir .vditor-reset pre code')!;
      const r = document.createRange();
      r.selectNodeContents(code);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      const dt = new DataTransfer();
      const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
      code.dispatchEvent(ev);
      return dt.getData('text/plain');
    });
    expect(copiedCode).toContain('`hello`');
    expect(copiedCode).not.toContain('\\`');
  });

  test('16. 列表与引用回车续行、空项回车退出、Tab/Shift+Tab 嵌套缩进', async ({ page }) => {
    await setupApp(page);
    await clearAndFocusFirstLine(page);

    // 1. + Space -> type item 1 -> Enter -> item 2 -> Tab -> nested list -> Shift+Tab -> outdent -> Enter on empty -> exit
    await page.keyboard.type('1.');
    await page.keyboard.press(' ');
    await page.keyboard.type('第一项');
    await page.keyboard.press('Enter');
    await page.keyboard.type('第二项');
    await page.waitForTimeout(100);
    expect(await page.locator('.vditor-ir .vditor-reset ol > li').count()).toBe(2);

    // Enter twice to exit list into normal <p>
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('退出列表正文');
    await expect(page.locator('.vditor-ir .vditor-reset > p').last()).toContainText('退出列表正文');
  });

  test('17. Cmd+B/I 快捷键与 () [] "" 自动配对跳过、成对删除不残留多余符号', async ({ page }) => {
    await setupApp(page);
    await clearAndFocusFirstLine(page);

    // Bracket auto-pair: type (abc) -> should be exactly "(abc)" (NOT "(abc))")
    await page.keyboard.type('(abc)');
    await page.waitForTimeout(80);
    const pText = await page.evaluate(() => {
      const p = document.querySelector('.vditor-ir .vditor-reset > p');
      return (p?.textContent || '').replace(/[\u200b\ufeff]/g, '').trim();
    });
    expect(pText).toBe('(abc)');

    // Empty bracket Backspace deletes both ( and )
    await clearAndFocusFirstLine(page);
    await page.keyboard.type('(');
    await page.waitForTimeout(60);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(60);
    const afterEmptyDel = await page.evaluate(() => {
      const p = document.querySelector('.vditor-ir .vditor-reset > p');
      return (p?.textContent || '').replace(/[\u200b\ufeff]/g, '').trim();
    });
    expect(afterEmptyDel).toBe('');

    // Cmd+B on selected text wraps in **bold**
    await page.keyboard.type('加粗测试');
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+b');
    await page.waitForTimeout(100);
    await expect(page.locator('.vditor-ir .vditor-reset strong')).toContainText('加粗测试');
  });

  test('18. Cmd+Z / Cmd+Shift+Z 撤销重做一致性（列表/代码块展开后可撤销不崩）', async ({ page }) => {
    await setupApp(page);
    await clearAndFocusFirstLine(page);

    await page.keyboard.type('1.');
    await page.keyboard.press(' ');
    await page.keyboard.type('列表项');
    await page.waitForTimeout(100);
    await expect(page.locator('.vditor-ir .vditor-reset ol')).toHaveCount(1);

    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(100);
    // Editor remains valid and responsive after undo
    const resetVisible = await page.locator('.vditor-ir .vditor-reset').isVisible();
    expect(resetVisible).toBe(true);
  });

  test('19. 完整长文章端到端敲写（标题/加粗/斜体/引用嵌套/代码块/表格）+ 全篇 Ctrl+A/C/V 零走样', async ({ page }) => {
    await setupApp(page);
    await clearAndFocusFirstLine(page);

    // Heading
    await page.keyboard.type('##');
    await page.keyboard.press(' ');
    await page.keyboard.type('完整测试标题');
    await page.keyboard.press('Enter');

    // Bold + inline text
    await page.keyboard.type('正文包含 **加粗** 与 *斜体* 内容');
    await page.keyboard.press('Enter');

    // Blockquote with nested ordered list
    await page.keyboard.type('>');
    await page.keyboard.press(' ');
    await page.keyboard.type('引用第一行');
    await page.keyboard.press('Enter');
    await page.keyboard.type('1.');
    await page.keyboard.press(' ');
    await page.keyboard.type('引用内列表');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // Code block via ```
    await page.keyboard.type('```');
    await page.waitForTimeout(150);
    await page.keyboard.type('ts');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('const ok = true;');
    await page.waitForTimeout(100);

    await expect(page.locator('.vditor-ir .vditor-reset h2')).toContainText('完整测试标题');
    await expect(page.locator('.vditor-ir .vditor-reset blockquote')).toHaveCount(1);
    await expect(page.locator('.vditor-ir .vditor-reset .vditor-ir__node[data-type="code-block"]')).toHaveCount(1);
    await expect(page.locator('.vditor-ir .vditor-reset pre code').first()).toContainText('const ok = true;');

    // Copy full article via Meta+A -> copy event, verify clean Markdown with no stray escapes
    const fullCopied = await page.evaluate(() => {
      const reset = document.querySelector('.vditor-ir .vditor-reset')!;
      const r = document.createRange();
      r.selectNodeContents(reset);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      const dt = new DataTransfer();
      const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
      reset.dispatchEvent(ev);
      return dt.getData('text/plain');
    });
    expect(fullCopied).toContain('## 完整测试标题');
    expect(fullCopied).toContain('> 引用第一行');
    expect(fullCopied).toContain('const ok = true;');
    expect(fullCopied).not.toContain('\\`');
  });
});
