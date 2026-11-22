import assert from 'node:assert/strict';
import test from 'node:test';
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
  // Short sections flow onto one card instead of one near-empty card per heading.
  assert.ok(payload.cards.length >= 2);
  assert.equal(payload.cards[0].type, 'cover');
  assert.ok(payload.cards.some((c) => c.type === 'code' && (c.blocks ?? []).some((p) => p.block.kind === 'code')));
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
      executeJavaScript: async () => undefined,
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
