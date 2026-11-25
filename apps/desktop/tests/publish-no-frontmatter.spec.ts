import { expect, test } from '@playwright/test';
import { openPublishWith, publishedCalls } from './support/publishMock';

const MD_WITH_FM = [
  '---',
  'title: "不该读取的 Frontmatter 标题"',
  'tags: [前端架构, TypeScript, Markdown]',
  'digest: "不该读取的 Frontmatter 摘要"',
  'coverImageUrl: "./assets/pipeline-architecture.png"',
  'showCoverInBody: true',
  '---',
  '',
  '# 正文一级标题',
  '',
  '正文段落内容。',
  '',
  '![正文配图](./assets/body.png)',
  '',
].join('\n');

const PNG = { name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') };

test.describe('隐藏 YAML Frontmatter 且发布弹窗不做自动推断', () => {
  test('编辑器隐藏 Frontmatter 块；发布弹窗标题/摘要/标签/封面默认全空，手动填写后可正常推送', async ({ page }) => {
    await openPublishWith(page, {
      md: MD_WITH_FM,
      auth: { weixin: true, juejin: true },
      selected: ['weixin'],
      saved: {},
    });

    // 编辑器中 YAML Frontmatter 块被隐藏（不渲染显示）
    const fmNodes = page.locator('.vditor-ir [data-type="yaml-front-matter"]');
    if ((await fmNodes.count()) > 0) {
      await expect(fmNodes.first()).toBeHidden();
    }

    // 标题、摘要、标签、封面均不从 Frontmatter 或正文推断，默认全空，且不在「需要单独处理」重复弹出缺项框
    await expect(page.locator('#pub-title')).toHaveValue('');
    await expect(page.locator('#pub-digest')).toHaveValue('');
    await expect(page.getByTestId('attention-list')).toHaveCount(0);
    await expect(page.getByTestId('cover-hint')).toHaveText('推荐 16:9，公众号需封面');
    await expect(page.getByTestId('section-weixin')).toContainText('缺封面');
    await expect(page.getByTestId('publish-start')).toBeDisabled();

    // 用户手动填写标题并上传封面后即可推送
    await page.locator('#pub-title').fill('手动填写的标题');
    await page.getByTestId('cover-input').setInputFiles(PNG);
    await expect(page.getByTestId('publish-start')).toBeEnabled();
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(1);

    const calls = await publishedCalls(page);
    expect(calls.weixin.title).toBe('手动填写的标题');
    expect(calls.weixin.coverImageUrl).toMatch(/assets\/up\.png$/);
  });
});
