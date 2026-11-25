import { expect, test, type Page } from '@playwright/test';
import zlib from 'node:zlib';

const ALL_PLATFORMS = [
  'github_static',
  'weixin',
  'cnblogs',
  'juejin',
  'csdn',
  'zhihu',
  'baijiahao',
  'weibo',
  'bilibili',
  'douyin',
  'xiaohongshu',
] as const;

const COMPLEX_MD = `---
title: Vmark 多平台复杂字段实测文章
---

# Vmark 多平台复杂字段实测文章

导语包含 **加粗文本**、\`inlineCode()\` 与行内公式 $E = mc^2$，并引用 [项目主页](https://github.com/leileigwl/vmark)。

> [!TIP]
> 多图比例（16:9 / 2.35:1 / 3:4 / 1:1）自动按焦点裁剪并随文推送到各平台草稿箱。

![系统架构图](./assets/diagram.png)

| 模块 | 责任 | 比例要求 |
| :--- | :--- | :--- |
| 公众号 | 内联样式 + 脚注 | 2.35:1 + 1:1 |
| 小红书/抖音 | 3:4 卡片栅格化 | 3:4 |
| 知乎/掘金 | AST 转换 | 16:9 |

1. 本地写完无需手动传图
2. 复杂字段自动校验
   - 支持嵌套列表
   - 支持公式与 Mermaid

$$
\\sum_{i=1}^{n} x_i^2 = \\|x\\|_2^2
$$

\`\`\`mermaid
flowchart LR
  Edit[本地写作] --> Publish[多平台草稿箱]
\`\`\`

\`\`\`ts
export function publishCheck(ready: boolean): string {
  return ready ? 'ready-for-draft' : 'needs-fields';
}
\`\`\`
`;

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])), 0);
  return Buffer.concat([len, tag, data, crc]);
}

/** Pure-Node valid RGB PNG generator for any pixel ratio (e.g. 16:9, 2.35:1, 3:4, 1:1). */
function createSolidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const px = row + 1 + x * 3;
      raw[px] = rgb[0];
      raw[px + 1] = rgb[1];
      raw[px + 2] = rgb[2];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

interface RecordedPayload {
  title: string;
  markdown: string;
  digest?: string;
  tags?: string[];
  coverImageUrl?: string;
  socialCoverImagePath?: string;
  weixinSquareCoverImagePath?: string;
  juejinCategoryId?: string;
  targets: Array<{ platformId: string; mode: string }>;
}

async function setupMatrixPage(page: Page) {
  await page.addInitScript(
    ({ platforms, md }: { platforms: readonly string[]; md: string }) => {
      const authMap = Object.fromEntries(platforms.map((id) => [id, true]));
      const meta = {
        id: 'complex-1',
        title: 'Vmark 多平台复杂字段实测文章',
        relativePath: 'complex-matrix.md',
        folder: '',
        wordCount: 380,
        updatedAt: Date.now(),
        imageCount: 1,
        hasFrontmatter: true,
        excerpt: '多比例封面与复杂字段联动验证',
      };
      const w = window as unknown as {
        __matrixPayloads: RecordedPayload[];
        __savedBlobs: Record<string, { ext: string; dataUrl: string }>;
        electronAPI: Record<string, unknown>;
      };
      w.__matrixPayloads = [];
      w.__savedBlobs = {};
      let seq = 0;

      w.electronAPI = {
        getWorkspacePath: async () => '/tmp/vmark-matrix',
        getRecentWorkspaces: async () => ['/tmp/vmark-matrix'],
        listArticles: async () => [meta],
        listFolders: async () => [],
        getImageBedConfig: async () => ({ strategy: 'platform_private', provider: 'smms' }),
        getStartupConfig: async () => ({ lastArticlePath: 'complex-matrix.md', theme: 'apple-light' }),
        getPlatformAuthStates: async () => ({ ...authMap }),
        getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
        readArticle: async () => md,
        saveArticle: async () => ({ ok: true }),
        saveStartupConfig: async () => ({ ok: true }),
        saveLocalImage: async (base64: string, ext: string) => {
          seq += 1;
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
          const dataUrl = `data:${mime};base64,${base64}`;
          w.__savedBlobs[`img-${seq}`] = { ext, dataUrl };
          return { relativeMarkdownPath: dataUrl, fullPath: `/tmp/vmark-matrix/assets/img-${seq}.${ext}` };
        },
        setRecentFiles: () => {},
        onMenuAction: () => () => {},
        onPlatformAuthUpdated: () => () => {},
        listJuejinCategories: async () => [
          { id: 'cat-fe', name: '前端' },
          { id: 'cat-be', name: '后端' },
        ],
        publishMultiPlatform: async (payload: RecordedPayload) => {
          w.__matrixPayloads.push(payload);
          return {
            results: payload.targets.map((t) => ({
              platformId: t.platformId,
              ok: true,
              mode: t.mode,
              postId: `draft-${t.platformId}`,
              url: `https://example.com/${t.platformId}/draft`,
              verified: true,
              message: `已推至 ${t.platformId}`,
            })),
          };
        },
      };
    },
    { platforms: ALL_PLATFORMS, md: COMPLEX_MD }
  );
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('全平台多比例真实配图与复杂正文全链路验证', () => {
  test('16:9 / 2.35:1 / 3:4 / 1:1 真实 PNG 焦点裁剪 + 11 平台复杂字段推送全部校验通过', async ({ page }) => {
    test.setTimeout(60_000);
    await setupMatrixPage(page);

    const png16x9 = createSolidPng(1280, 720, [79, 140, 255]);
    const png235x1 = createSolidPng(940, 400, [46, 164, 79]);
    const png3x4 = createSolidPng(900, 1200, [255, 138, 76]);
    const png1x1 = createSolidPng(800, 800, [130, 80, 223]);

    // 1. 打开高级发布弹窗，全选所有可推送平台
    await page.getByRole('button', { name: '发布', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    for (const id of ALL_PLATFORMS) {
      const box = page.getByTestId(`platform-row-${id}`).getByRole('checkbox');
      if ((await box.getAttribute('data-state')) !== 'checked') await box.click();
    }

    // 2. 先填 7 字短标题以触发百家号单条处理项，再补齐 50–100 字摘要、标签与 16:9 通用封面 + 点击焦点
    await page.locator('#pub-title').fill('Vmark分发');
    await page.locator('#pub-digest').fill(
      '这是一篇覆盖复杂公式、表格、流程图、代码块、16:9 与 2.35:1 及 3:4 多比例封面的多平台发布校验长文，确保各平台参数全部精准落库。'
    );
    await page.locator('#pub-tags').fill('Markdown');
    await page.locator('#pub-tags').press('Enter');
    await page.getByTestId('cover-input').setInputFiles({
      name: 'cover-16x9.png',
      mimeType: 'image/png',
      buffer: png16x9,
    });
    await expect(page.getByTestId('cover-field').getByTestId('cover-focus')).toBeVisible();
    await page.getByTestId('cover-field').getByTestId('cover-focus').click({ position: { x: 40, y: 20 } });

    // 3. 公众号单独上传 2.35:1 封面、小红书/抖音单独上传 3:4 封面，再补充 1:1 兼容图测裁剪
    const wx = page.getByTestId('section-weixin');
    await wx.getByRole('button', { expanded: false }).click();
    await wx.getByTestId('own-cover-input-weixin').setInputFiles({
      name: 'wx-235.png',
      mimeType: 'image/png',
      buffer: png235x1,
    });
    await expect(wx.getByTestId('own-cover-weixin')).toBeVisible();

    const social = page.getByTestId('section-social');
    await social.getByRole('button', { expanded: false }).click();
    await expect(social).toContainText('卡片');
    await social.getByTestId('own-cover-input-xiaohongshu').setInputFiles({
      name: 'xhs-34.png',
      mimeType: 'image/png',
      buffer: png3x4,
    });

    // 验证 1:1 方图也能顺利上传并通过焦点裁切（作为通用图再切回 16:9 以验证 4 种比例全覆盖）
    await page.getByTestId('cover-input').setInputFiles({
      name: 'cover-1x1.png',
      mimeType: 'image/png',
      buffer: png1x1,
    });
    await page.getByTestId('cover-input').setInputFiles({
      name: 'cover-16x9-final.png',
      mimeType: 'image/png',
      buffer: png16x9,
    });

    // 4. 补齐掘金分类、百家号短标题、微博摘要
    await page.getByTestId('attention-baijiahao').getByRole('button', { expanded: false }).click();
    await page.locator('#t-baijiahao').fill('Vmark 多比例实战指南');
    await page.getByTestId('attention-weibo').getByRole('button', { expanded: false }).click();
    await page.locator('#d-weibo').fill('多比例封面与复杂正文全链路发布测试');
    await page.getByTestId('attention-juejin').getByRole('button', { expanded: false }).click();
    await page.getByTestId('attention-juejin').getByRole('radio', { name: '前端' }).click();

    await expect(page.getByTestId('publish-start')).toHaveText(`推送到 ${ALL_PLATFORMS.length} 个草稿箱`);
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(ALL_PLATFORMS.length, {
      timeout: 15_000,
    });

    // 5. 逐平台校验载荷、复杂 Markdown 正文与按比例裁剪出来的实际图片宽高比
    const summary = await page.evaluate(async () => {
      const payloads = (window as unknown as { __matrixPayloads: RecordedPayload[] }).__matrixPayloads;
      const measure = (src: string) =>
        new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error('load failed'));
          img.src = src;
        });
      const out: Record<string, { title: string; hasMath: boolean; hasMermaid: boolean; coverRatio?: number; squareRatio?: number; socialRatio?: number; juejinCategoryId?: string }> = {};
      for (const p of payloads) {
        const id = p.targets[0].platformId;
        const coverDim = p.coverImageUrl ? await measure(p.coverImageUrl) : null;
        const sqDim = p.weixinSquareCoverImagePath ? await measure(p.weixinSquareCoverImagePath) : null;
        const socialDim = p.socialCoverImagePath ? await measure(p.socialCoverImagePath) : null;
        out[id] = {
          title: p.title,
          hasMath: p.markdown.includes('E = mc^2') && p.markdown.includes('\\sum_{i=1}^{n}'),
          hasMermaid: p.markdown.includes('flowchart LR'),
          coverRatio: coverDim ? Number((coverDim.w / coverDim.h).toFixed(2)) : undefined,
          squareRatio: sqDim ? Number((sqDim.w / sqDim.h).toFixed(2)) : undefined,
          socialRatio: socialDim ? Number((socialDim.w / socialDim.h).toFixed(2)) : undefined,
          juejinCategoryId: p.juejinCategoryId,
        };
      }
      return out;
    });

    expect(Object.keys(summary)).toHaveLength(ALL_PLATFORMS.length);
    for (const id of ALL_PLATFORMS) {
      expect(summary[id].hasMath).toBe(true);
      expect(summary[id].hasMermaid).toBe(true);
    }
    expect(summary.weixin.coverRatio).toBeCloseTo(2.35, 1);
    expect(summary.weixin.squareRatio).toBeCloseTo(1.0, 1);
    expect(summary.zhihu.coverRatio).toBeCloseTo(1.78, 1);
    expect(summary.juejin.juejinCategoryId).toBe('cat-fe');
    expect(summary.xiaohongshu.socialRatio).toBeCloseTo(0.75, 1);
    expect(summary.douyin.socialRatio).toBeCloseTo(0.75, 1);
  });
});
