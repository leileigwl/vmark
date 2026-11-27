import { expect, test, type Page } from '@playwright/test';

async function setupWorkspaceMock(page: Page) {
  await page.addInitScript(() => {
    const articles = [
      {
        relativePath: 'readme.md',
        fullPath: '/tmp/ws-a/readme.md',
        title: '初始文章',
        wordCount: 12,
        localImageCount: 0,
        updatedAt: Date.now(),
        syncRecords: {},
      },
    ];
    const contents: Record<string, string> = {
      'readme.md': '# 初始文章\n\n原始正文。\n',
      'sub/imported.md': '# 导入文章\n\n导入正文。\n',
      'external.md': '# 外部文件\n\n外部内容。\n',
      'pasted.md': '# 粘贴文章\n\n粘贴正文。\n',
    };
    let workspacePath = '/tmp/ws-a';
    let folders = ['sub'];
    let onWorkspaceChangedCb: (() => void) | null = null;
    const w = window as unknown as {
      __fileOpsCalls: Array<{ op: string; args: unknown[] }>;
      __triggerWsChange?: () => void;
      electronAPI: Record<string, unknown>;
      electronFileBridge?: { getPathForFile: (file: File) => string };
    };
    w.__fileOpsCalls = [];
    w.__triggerWsChange = () => onWorkspaceChangedCb?.();
    w.electronFileBridge = {
      getPathForFile: (file: File) => `/tmp/external/${file.name}`,
    };

    w.electronAPI = {
      getWorkspacePath: async () => workspacePath,
      getRecentWorkspaces: async () => [workspacePath],
      listArticles: async () => [...articles],
      listFolders: async () => [...folders],
      getImageBedConfig: async () => ({ strategy: 'platform_private' }),
      getStartupConfig: async () => ({ mode: 'last_opened', lastArticlePath: 'readme.md', theme: 'apple-light' }),
      getPlatformAuthStates: async () => ({}),
      getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
      readArticle: async (rel: string) => contents[rel] ?? '# Empty',
      saveArticle: async () => ({ updatedAt: Date.now() }),
      saveStartupConfig: async () => {},
      setRecentFiles: () => {},
      onMenuAction: () => () => {},
      onPlatformAuthUpdated: () => () => {},
      onWorkspaceChanged: (cb: () => void) => {
        onWorkspaceChangedCb = cb;
        return () => {
          onWorkspaceChangedCb = null;
        };
      },
      onOpenExternalFile: () => () => {},
      openExternalFile: async (filePath?: string) => {
        w.__fileOpsCalls.push({ op: 'openExternalFile', args: [filePath] });
        workspacePath = '/tmp/ws-ext';
        articles.splice(0, articles.length, {
          relativePath: 'external.md',
          fullPath: '/tmp/ws-ext/external.md',
          title: '外部文件',
          wordCount: 10,
          localImageCount: 0,
          updatedAt: Date.now(),
          syncRecords: {},
        });
        return { workspacePath, relativePath: 'external.md' };
      },
      importExternalFiles: async (filePaths: string[], targetFolder = '') => {
        w.__fileOpsCalls.push({ op: 'importExternalFiles', args: [filePaths, targetFolder] });
        const meta = {
          relativePath: 'sub/imported.md',
          fullPath: '/tmp/ws-a/sub/imported.md',
          title: '导入文章',
          wordCount: 10,
          localImageCount: 0,
          updatedAt: Date.now(),
          syncRecords: {},
        };
        articles.push(meta);
        return { importedArticles: [meta], importedFolders: [], skipped: [] };
      },
      copyFilesToClipboard: async (relativePaths: string[]) => {
        w.__fileOpsCalls.push({ op: 'copyFilesToClipboard', args: [relativePaths] });
        return true;
      },
      pasteClipboardFiles: async (targetFolder = '') => {
        w.__fileOpsCalls.push({ op: 'pasteClipboardFiles', args: [targetFolder] });
        const meta = {
          relativePath: 'pasted.md',
          fullPath: '/tmp/ws-a/pasted.md',
          title: '粘贴文章',
          wordCount: 10,
          localImageCount: 0,
          updatedAt: Date.now(),
          syncRecords: {},
        };
        articles.push(meta);
        return { importedArticles: [meta], importedFolders: [], skipped: [] };
      },
    };
  });

  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('外部文件打开、拖拽导入、右键复制粘贴与外部变更自动刷新', () => {
  test('侧边栏右键菜单支持复制、粘贴与打开外部文件，且工作区变更事件自动刷新文件树', async ({ page }) => {
    await setupWorkspaceMock(page);

    // 1. 右键文件项 -> 复制
    const row = page.locator('[data-article-path="readme.md"]');
    await row.click({ button: 'right' });
    const menu = page.locator('[data-sidebar-context-menu="1"]');
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: '复制', exact: true }).click();

    // 2. 右键空白区 -> 粘贴
    await page.locator('[data-vcat-file-tree="1"] [tabindex="0"]').click({ button: 'right', position: { x: 20, y: 240 } });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: '打开文件...' })).toBeVisible();
    await menu.getByRole('button', { name: '粘贴', exact: true }).click();
    await expect(page.locator('[data-article-path="pasted.md"]')).toBeVisible();

    // 3. 模拟外部向文件夹拉入文件后主进程推送 workspace:changed -> 自动刷新列表
    await page.evaluate(() => {
      const w = window as unknown as {
        __triggerWsChange?: () => void;
        electronAPI: { listArticles: () => Promise<Array<Record<string, unknown>>> };
      };
      const origList = w.electronAPI.listArticles;
      w.electronAPI.listArticles = async () => [
        ...(await origList()),
        {
          relativePath: 'sub/external-dropped.md',
          fullPath: '/tmp/ws-a/sub/external-dropped.md',
          title: '外部拖入文件夹的文章',
          wordCount: 8,
          localImageCount: 0,
          updatedAt: Date.now(),
          syncRecords: {},
        },
      ];
      w.__triggerWsChange?.();
    });
    await expect(page.locator('[data-article-path="sub/external-dropped.md"]')).toBeVisible();

    // 4. 右键空白区点击「打开文件...」-> 切换并打开外部文件
    await page.locator('[data-vcat-file-tree="1"] [tabindex="0"]').click({ button: 'right', position: { x: 20, y: 240 } });
    await menu.getByRole('button', { name: '打开文件...' }).click();
    await expect(page.locator('[data-article-path="external.md"]')).toBeVisible();
    await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('外部内容');

    const calls = await page.evaluate(() => (window as unknown as { __fileOpsCalls: Array<{ op: string }> }).__fileOpsCalls);
    expect(calls.map((c) => c.op)).toEqual(['copyFilesToClipboard', 'pasteClipboardFiles', 'openExternalFile']);
  });

  test('拖入 .md 文件到编辑器区域会打开该文件；拖入文件夹到侧边栏文件夹会复制到该文件夹', async ({ page }) => {
    await setupWorkspaceMock(page);

    // 1. 拖入外部 .md 到侧边栏文件夹 sub
    await page.evaluate(() => {
      const folderBtn = document.querySelector('[data-folder-path="sub"]');
      if (!folderBtn) throw new Error('missing sub folder');
      const dt = new DataTransfer();
      dt.items.add(new File(['# Imported'], 'imported.md', { type: 'text/markdown' }));
      folderBtn.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(page.locator('[data-article-path="sub/imported.md"]')).toBeVisible();

    // 2. 拖入外部 .md 到编辑器区域 -> 触发 openExternalFile
    await page.evaluate(() => {
      const editor = document.querySelector('.vditor-ir .vditor-reset');
      if (!editor) throw new Error('missing editor');
      const dt = new DataTransfer();
      dt.items.add(new File(['# Ext'], 'external.md', { type: 'text/markdown' }));
      editor.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(page.locator('[data-article-path="external.md"]')).toBeVisible();

    const calls = await page.evaluate(() => (window as unknown as { __fileOpsCalls: Array<{ op: string; args: unknown[] }> }).__fileOpsCalls);
    expect(calls.map((c) => c.op)).toEqual(['importExternalFiles', 'openExternalFile']);
    expect(calls[0].args).toEqual([['/tmp/external/imported.md'], 'sub']);
    expect(calls[1].args).toEqual(['/tmp/external/external.md']);
  });
});
