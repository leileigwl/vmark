import type { Page } from '@playwright/test';

/**
 * Helpers shared by the data-integrity smoke suite (`smoke-integrity-*.spec.ts`).
 * The rule every case checks: what reaches disk is exactly the user's text plus the
 * one change they asked for — never a dropped character, a stray newline or a rewrite.
 */

/** Bytes of `rel` in the mocked workspace (what `saveArticle` last wrote). */
export function diskContent(page: Page, rel = 'a.md'): Promise<string | undefined> {
  return page.evaluate((r) => (window as unknown as { __vcatFiles: Record<string, string> }).__vcatFiles[r], rel);
}

/** Waits out the 320ms input debounce, presses ⌘S / Ctrl+S, returns what is on disk. */
export async function saveAndRead(page: Page, rel = 'a.md'): Promise<string | undefined> {
  await page.waitForTimeout(400);
  await page.keyboard.press('ControlOrMeta+s');
  await page.waitForTimeout(400);
  return diskContent(page, rel);
}

/**
 * Puts the caret right after the first occurrence of `needle` in the editor text
 * (or right before it when `before` is set).
 */
export async function caretAt(page: Page, needle: string, before = false): Promise<void> {
  const found = await page.evaluate(
    ({ n, b }) => {
      const root = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
      root.focus();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue ?? '';
        const idx = text.indexOf(n);
        if (idx < 0) continue;
        const r = document.createRange();
        r.setStart(node, b ? idx : idx + n.length);
        r.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
        return true;
      }
      return false;
    },
    { n: needle, b: before }
  );
  if (!found) throw new Error(`caretAt: "${needle}" not found in editor`);
}

/** Selects the first occurrence of `needle` (must sit inside one text node). */
export async function selectText(page: Page, needle: string): Promise<void> {
  const found = await page.evaluate((n) => {
    const root = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
    root.focus();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const idx = (node.nodeValue ?? '').indexOf(n);
      if (idx < 0) continue;
      const r = document.createRange();
      r.setStart(node, idx);
      r.setEnd(node, idx + n.length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      return true;
    }
    return false;
  }, needle);
  if (!found) throw new Error(`selectText: "${needle}" not found in editor`);
}

/**
 * Optional evidence screenshot: only when VMARK_SHOT_DIR is set, never fails a test.
 * Overlays the mocked on-disk bytes so the picture shows what was saved.
 */
export async function shot(page: Page, name: string, rel = 'a.md'): Promise<void> {
  const dir = process.env.VMARK_SHOT_DIR;
  if (!dir) return;
  try {
    const disk = await diskContent(page, rel);
    await page.evaluate((text) => {
      const box = document.createElement('pre');
      box.setAttribute('data-smoke-overlay', '');
      box.style.cssText =
        'position:fixed;right:8px;bottom:8px;z-index:9999;background:#fffbe6;border:1px solid #e5c07b;padding:8px;font-size:12px;max-width:520px;max-height:300px;overflow:auto;white-space:pre-wrap';
      box.textContent = `磁盘上的文件（JSON 转义）\n${JSON.stringify(text)}`;
      document.body.appendChild(box);
    }, disk ?? null);
    await page.screenshot({ path: `${dir}/${name}.png` });
    await page.evaluate(() => document.querySelector('[data-smoke-overlay]')?.remove());
  } catch {
    // Evidence only.
  }
}
