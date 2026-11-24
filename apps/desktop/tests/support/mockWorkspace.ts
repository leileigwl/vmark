import type { Page } from '@playwright/test';

/**
 * Stateful in-page `window.electronAPI` mock for writing-stability e2e specs.
 * Records every file-system call in `window.__vcatCalls` and exposes the menu
 * callback as `window.__vcatMenu(action, payload)` so tests can replay what an
 * Electron menu accelerator would send to the renderer.
 */
export interface MockWorkspaceOptions {
  files?: Record<string, string>;
  /** Artificial latency (ms) for saveArticle, to reproduce save/typing races. */
  saveDelayMs?: number;
}

export async function installMockWorkspace(page: Page, opts: MockWorkspaceOptions = {}): Promise<void> {
  const files = opts.files ?? { 'test.md': '' };
  await page.addInitScript(
    ({ initialFiles, saveDelayMs }: { initialFiles: Record<string, string>; saveDelayMs: number }) => {
      const store: Record<string, string> = { ...initialFiles };
      const calls: Array<{ fn: string; args: unknown[] }> = [];
      let menuCb: ((action: string, payload?: string) => void) | null = null;
      let createSeq = 0;
      const meta = (rel: string) => ({
        id: rel,
        title: rel.replace(/\.md$/i, ''),
        relativePath: rel,
        folder: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '',
        wordCount: (store[rel] ?? '').length,
        updatedAt: Date.now(),
        imageCount: 0,
        localImageCount: 0,
        hasFrontmatter: false,
        excerpt: '',
      });
      const list = () => Object.keys(store).sort().map(meta);
      const rec = (fn: string, ...args: unknown[]) => calls.push({ fn, args });
      const w = window as unknown as Record<string, unknown>;
      w.__vcatCalls = calls;
      w.__vcatFiles = store;
      w.__vcatMenu = (action: string, payload?: string) => menuCb?.(action, payload);
      w.electronAPI = {
        getWorkspacePath: async () => '/tmp/vcat-test',
        getRecentWorkspaces: async () => ['/tmp/vcat-test'],
        listArticles: async () => list(),
        listFolders: async () => [],
        getImageBedConfig: async () => ({ provider: 'none' }),
        getStartupConfig: async () => ({ lastArticlePath: Object.keys(initialFiles)[0], theme: 'apple-light' }),
        getPlatformAuthStates: async () => ({}),
        getGitStatus: async () => ({ isGitRepo: false, changedFiles: 0 }),
        readArticle: async (rel: string) => {
          rec('readArticle', rel);
          return store[rel] ?? '';
        },
        saveArticle: async (rel: string, content: string) => {
          rec('saveArticle', rel, content);
          if (saveDelayMs > 0) await new Promise((r) => setTimeout(r, saveDelayMs));
          store[rel] = content;
          return { ok: true };
        },
        createArticle: async (rel?: string) => {
          createSeq += 1;
          const name = rel ?? `未命名-${createSeq}.md`;
          rec('createArticle', name);
          store[name] = '';
          return meta(name);
        },
        deleteArticle: async (rel: string) => {
          rec('deleteArticle', rel);
          delete store[rel];
          return { ok: true };
        },
        renameArticle: async (oldRel: string, next: string) => {
          rec('renameArticle', oldRel, next);
          store[next] = store[oldRel] ?? '';
          delete store[oldRel];
          return meta(next);
        },
        searchArticlesContent: async () => [],
        saveStartupConfig: async () => ({ ok: true }),
        setRecentFiles: () => {},
        showEditorContextMenu: async () => undefined,
        onMenuAction: (cb: (action: string, payload?: string) => void) => {
          menuCb = cb;
          return () => {
            if (menuCb === cb) menuCb = null;
          };
        },
        onPlatformAuthUpdated: () => () => {},
      };
    },
    { initialFiles: files, saveDelayMs: opts.saveDelayMs ?? 0 }
  );
}

export async function openEditor(page: Page) {
  await page.goto('/');
  const reset = page.locator('.vditor-ir .vditor-reset');
  await reset.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(150);
  return reset;
}

export async function getCalls(page: Page, fn?: string): Promise<Array<{ fn: string; args: unknown[] }>> {
  return page.evaluate((name) => {
    const calls = (window as unknown as { __vcatCalls: Array<{ fn: string; args: unknown[] }> }).__vcatCalls;
    return name ? calls.filter((c) => c.fn === name) : calls.slice();
  }, fn);
}

export async function sendMenu(page: Page, action: string, payload?: string): Promise<void> {
  await page.evaluate(
    ([a, p]) => (window as unknown as { __vcatMenu: (a: string, p?: string) => void }).__vcatMenu(a, p),
    [action, payload] as const
  );
}

/**
 * Puts the caret at the end of the last text block. (Clicking the blank area below
 * the content creates a temporary gap paragraph by design, so tests must not rely on
 * `reset.click()` to land in existing text.)
 */
export async function placeCaretAtEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const reset = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
    reset.focus();
    const blocks = reset.querySelectorAll(':scope > :not([data-vcat-temp-gap])');
    const last = (blocks[blocks.length - 1] as HTMLElement | undefined) ?? reset;
    const r = document.createRange();
    r.selectNodeContents(last);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  });
}
