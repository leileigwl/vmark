import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  resolveSocialThemeId,
  resolveSocialUploadImages,
} from '../src/main/socialDraftHelpers.ts';
import { rasterizeSocialCards } from '../src/main/socialCardRasterizer.ts';
import { renderXiaohongshuCards } from '@vcat/core';

test('renderXiaohongshuCards parses technical markdown into structured cards', () => {
  const md = `---
title: 测试长文卡片
tags: [前端, 架构]
---

# 第一部分：背景与设计
这是第一部分的正文内容。

\`\`\`typescript
const greet = (name: string) => \`Hello, \${name}\`;
console.log(greet('Vmark'));
\`\`\`

# 第二部分：核心实现
- 要点一：本地优先
- 要点二：完全无外链
`;

  const payload = renderXiaohongshuCards(md);
  assert.equal(payload.title, '测试长文卡片');
  assert.ok(payload.cards.length >= 3);
  assert.equal(payload.cards[0].type, 'cover');
  assert.ok(payload.cards.some((c) => c.type === 'code'));
  assert.ok(payload.captionText.includes('#前端'));
});

test('rasterizeSocialCards returns empty images when markdown has no cards', async () => {
  const result = await rasterizeSocialCards({
    markdown: '',
    maxCards: 0,
  });
  assert.deepEqual(result.imagePaths, []);
});

test('rasterizeSocialCards coordinates window lifecycle and writes PNG files', async () => {
  let destroyed = false;
  let loadedUrl = '';
  const mockWin: any = {
    loadURL: async (url: string) => {
      loadedUrl = url;
    },
    webContents: {
      capturePage: async () => ({
        toPNG: () => Buffer.from('fake-png-data'),
      }),
    },
    isDestroyed: () => destroyed,
    destroy: () => {
      destroyed = true;
    },
  };

  const result = await rasterizeSocialCards({
    markdown: '# 架构设计\n- 核心要点',
    themeId: 'minimalist-magazine',
    aspectRatio: '2:3',
    maxCards: 1,
    browserWindowFactory: (opts) => {
      assert.equal(opts.width, 1080);
      assert.equal(opts.height, 1620);
      return mockWin;
    },
  });

  assert.ok(result.imagePaths.length > 0);
  assert.ok(result.imagePaths[0].endsWith('.png'));
  assert.ok(loadedUrl.includes('data:text/html'));
  assert.ok(decodeURIComponent(loadedUrl).includes('1620px'));
  assert.equal(destroyed, true);
});

test('resolveSocialThemeId preserves all 4 current templates and falls back per platform default', () => {
  assert.equal(resolveSocialThemeId('ios-memo'), 'ios-memo');
  assert.equal(resolveSocialThemeId('minimalist-magazine'), 'minimalist-magazine');
  assert.equal(resolveSocialThemeId('blank'), 'blank');
  assert.equal(resolveSocialThemeId('elegant-book'), 'elegant-book');
  assert.equal(resolveSocialThemeId('ink-classic'), 'minimalist-magazine');
  assert.equal(resolveSocialThemeId(undefined, 'minimalist-magazine'), 'minimalist-magazine');
  assert.equal(resolveSocialThemeId(undefined, 'ios-memo'), 'ios-memo');
});

test('resolveSocialUploadImages respects cards (default) vs article_images dual switch', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-social-mode-'));
  try {
    const imgPath = path.join(tmpDir, 'demo.png');
    await fs.writeFile(imgPath, Buffer.from('png-stub'));
    const md = '# 标题\n\n![插图](./demo.png)\n\n正文内容';

    let capturedTheme = '';
    const cardFiles = await resolveSocialUploadImages({
      workspacePath: tmpDir,
      markdown: md,
      themeId: 'blank',
      imageMode: 'cards',
      rasterizeFn: async (opts) => {
        capturedTheme = opts.themeId ?? '';
        return { imagePaths: ['/tmp/card_01.png'], captionText: 'c', tags: [] };
      },
    });
    assert.deepEqual(cardFiles, ['/tmp/card_01.png']);
    assert.equal(capturedTheme, 'blank');

    const articleFiles = await resolveSocialUploadImages({
      workspacePath: tmpDir,
      markdown: md,
      themeId: 'blank',
      imageMode: 'article_images',
      rasterizeFn: async () => {
        throw new Error('should not rasterize when local article images exist');
      },
    });
    assert.deepEqual(articleFiles, [imgPath]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
