import path from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** 发布弹窗用例的最小 electronAPI 假实现：记录推送内容，可预置勾选的平台与主题。 */
export interface PublishSetup {
  md: string;
  /** 已登录的平台。 */
  auth: Record<string, boolean>;
  /** 预置勾选（写进本地记住的发布设置）。 */
  selected: string[];
  /** 预置其他发布设置（如摘要），同样写进本地记住的设置。 */
  saved?: Record<string, unknown>;
  theme?: 'apple-light' | 'bloom-ink-dark';
}

export type PublishCall = {
  title: string;
  digest?: string;
  tags?: string[];
  coverImageUrl?: string;
  socialCoverImagePath?: string;
  weixinSquareCoverImagePath?: string;
  author?: string;
  sourceUrl?: string;
  juejinCategoryId?: string;
  targets: Array<{ platformId: string; mode: string }>;
};

export async function openPublishWith(page: Page, s: PublishSetup): Promise<void> {
  const theme = s.theme ?? 'apple-light';
  await page.addInitScript(
    ({ md, auth, selected, saved, theme: t }) => {
      const meta = { id: 'c', title: 'content', relativePath: 'content.md', folder: '', wordCount: 40, updatedAt: Date.now(), imageCount: 1, hasFrontmatter: false, excerpt: '' };
      const w = window as unknown as { __calls: unknown[]; electronAPI: Record<string, unknown> };
      w.__calls = [];
      w.electronAPI = {
        getWorkspacePath: async () => '/tmp/vmark-content',
        getRecentWorkspaces: async () => ['/tmp/vmark-content'],
        listArticles: async () => [meta],
        listFolders: async () => [],
        getImageBedConfig: async () => ({ strategy: 'platform_private' }),
        getStartupConfig: async () => ({ lastArticlePath: 'content.md', theme: t }),
        getPlatformAuthStates: async () => ({ ...auth }),
        getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
        readArticle: async () => md,
        saveArticle: async () => ({ ok: true }),
        saveStartupConfig: async () => ({ ok: true }),
        saveLocalImage: async () => ({ relativeMarkdownPath: './assets/up.png', fullPath: '/tmp/vmark-content/assets/up.png' }),
        setRecentFiles: () => {},
        onMenuAction: () => () => {},
        onPlatformAuthUpdated: () => () => {},
        publishMultiPlatform: async (payload: { targets: Array<{ platformId: string; mode: string }> }) => {
          w.__calls.push(payload);
          return { results: payload.targets.map((x) => ({ platformId: x.platformId, ok: true, mode: x.mode, message: '已推送' })) };
        },
      };
      localStorage.setItem('vmark.publishDraft.v1:content.md', JSON.stringify({ ...saved, selected }));
    },
    { md: s.md, auth: s.auth, selected: s.selected, saved: s.saved ?? {}, theme }
  );
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

export async function publishedCalls(page: Page): Promise<Record<string, PublishCall>> {
  const calls = await page.evaluate(() => (window as unknown as { __calls: PublishCall[] }).__calls);
  return Object.fromEntries(calls.map((c) => [c.targets[0].platformId, c]));
}

/** 截图存到 PW_SCREENSHOT_DIR（没设就放进本次用例的输出目录），不做像素断言。 */
export async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const dir = process.env.PW_SCREENSHOT_DIR;
  await page.screenshot({ path: dir ? path.join(dir, `${name}.png`) : testInfo.outputPath(`${name}.png`) });
}

export const THEMES = [
  ['light', 'apple-light'],
  ['dark', 'bloom-ink-dark'],
] as const;
