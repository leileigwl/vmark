import { expect, test, type Page } from '@playwright/test';
import { openPublishWith, publishedCalls } from './support/publishMock';

/**
 * A 层 QA（2026-11-26，推广前）：封面 + 推草稿箱的渲染/IPC 路径（mock IPC，不真推）。
 * 关注 #112 各平台单独封面互不串、通用内容一致、某个平台推送失败时其它平台不受影响。
 */
const MD = '# 推广文章：本地测试与云端 CI\n\n正文第一段。\n\n![配图](./assets/demo.png)\n';
const COMMON = 'assets/common.png';
const AUTH = { weixin: true, zhihu: true, xiaohongshu: true, douyin: true };

/** 让某些平台的推送返回失败（在 publishMock 装好 electronAPI 之后替换推送函数）。 */
async function failPlatforms(page: Page, failing: string[]) {
  await page.addInitScript((ids: string[]) => {
    let api: Record<string, unknown> | undefined;
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      get: () => api,
      set: (v: Record<string, unknown>) => {
        const w = window as unknown as { __calls: unknown[] };
        v.publishMultiPlatform = async (payload: { targets: Array<{ platformId: string; mode: string }> }) => {
          w.__calls.push(payload);
          return {
            results: payload.targets.map((x) =>
              ids.includes(x.platformId)
                ? { platformId: x.platformId, ok: false, mode: x.mode, message: '登录已失效，请重新登录' }
                : { platformId: x.platformId, ok: true, mode: x.mode, message: '已推送' }
            ),
          };
        };
        api = v;
      },
    });
  }, failing);
}

test.describe('A 层：封面与推草稿箱', () => {
  test('公众号、小红书、抖音各自的单独封面互不串，知乎用通用封面；标题/正文对所有平台一致', async ({ page }) => {
    await openPublishWith(page, {
      md: MD,
      auth: AUTH,
      selected: ['weixin', 'zhihu', 'xiaohongshu', 'douyin'],
      saved: {
        title: '推广文章：本地测试与云端 CI',
        coverUpload: COMMON,
        ownCovers: {
          weixin: { cover: 'assets/wx.png', focus: { x: 50, y: 50 } },
          xiaohongshu: { cover: 'assets/xhs.png', focus: { x: 30, y: 40 } },
          douyin: { cover: 'assets/dy.png', focus: { x: 70, y: 60 } },
        },
      },
    });
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(4);
    const calls = await publishedCalls(page);
    expect(calls.weixin.coverImageUrl).toBe('assets/wx.png');
    expect(calls.xiaohongshu.socialCoverImagePath).toBe('assets/xhs.png');
    expect(calls.douyin.socialCoverImagePath).toBe('assets/dy.png');
    expect(calls.zhihu.coverImageUrl).toBe(COMMON);
    const titles = new Set(Object.values(calls).map((c) => (c as unknown as { title?: string }).title));
    expect(titles.size).toBe(1);
  });

  test('只设通用封面：抖音和小红书都用通用封面（插在卡片最前）', async ({ page }) => {
    await openPublishWith(page, {
      md: MD,
      auth: AUTH,
      selected: ['xiaohongshu', 'douyin'],
      saved: { title: '推广文章：本地测试与云端 CI', coverUpload: COMMON },
    });
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = await publishedCalls(page);
    expect(calls.xiaohongshu.socialCoverImagePath).toBe(COMMON);
    expect(calls.douyin.socialCoverImagePath).toBe(COMMON);
  });

  test('一个平台推送失败：结果里单独标红并给出原因，其它平台照常成功', async ({ page }) => {
    await failPlatforms(page, ['zhihu']);
    await openPublishWith(page, {
      md: MD,
      auth: AUTH,
      selected: ['weixin', 'zhihu'],
      saved: { title: '推广文章：本地测试与云端 CI', coverUpload: COMMON },
    });
    await page.getByTestId('publish-start').click();
    const results = page.getByTestId('publish-results');
    await expect(results.locator('[data-state="ok"]')).toHaveCount(1);
    await expect(results).toContainText('登录已失效，请重新登录');
    await expect(results.locator('[data-state="ok"]')).not.toContainText('知乎');
  });
});
