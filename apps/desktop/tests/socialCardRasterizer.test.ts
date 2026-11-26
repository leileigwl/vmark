import assert from 'node:assert/strict';
import test from 'node:test';
import { rasterizeSocialCards, renderCardDeck, type CardPageDriver } from '../src/main/socialCardRasterizer.ts';
import { renderXiaohongshuCards, type CardMathRenderer } from '@vcat/core';

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

test('renderCardDeck 把同一个公式渲染器传给测量页和出图，相对图片按 imageBaseDir 解析且不越界', async () => {
  const loaded: string[] = [];
  const driver: CardPageDriver = {
    load: async (html) => {
      loaded.push(html);
    },
    // 测量页返回与块数相同的高度；出图阶段返回 overflow 1
    evaluate: async (script) => {
      const last = loaded[loaded.length - 1] ?? '';
      if (script.includes('[data-b]')) return Array.from(last.matchAll(/data-b="\d+"/g)).map(() => 120);
      return 1;
    },
    capture: async () => Buffer.from('png'),
  };
  const math: CardMathRenderer = {
    render: (tex, display) => `<span class="katex">FAKE-${display ? 'D' : 'I'}:${tex}</span>`,
    css: '.katex{font-family:FakeKatex}',
  };
  const markdown = '# 公式测试\n\n正文段落。\n\n$$E=mc^2$$\n\n![配图](./assets/a.png)\n\n![越界](../secret.png)\n';
  const { payload, images } = await renderCardDeck(driver, { markdown, maxCards: 9, imageBaseDir: '/tmp/vmark-ws' }, math);
  assert.ok(images.length >= 1);
  assert.notEqual(payload.cards[0]?.type, 'cover', '出图不自动生成第 1 张标题封面卡');
  const measurePages = loaded.filter((h) => h.includes('data-b="'));
  assert.ok(measurePages.length >= 1, '至少有一轮浏览器实测');
  assert.ok(measurePages.some((h) => h.includes('FAKE-D:E=mc^2')), '测量页用 KaTeX 渲染公式，实测高度包含公式排版');
  const cardPages = loaded.filter((h) => !h.includes('data-b="'));
  assert.ok(cardPages.some((h) => h.includes('FAKE-D:E=mc^2') && h.includes('FakeKatex')), '出图页用同一个公式渲染器并内联样式');
  const all = loaded.join('\n');
  assert.ok(all.includes('file:///tmp/vmark-ws/assets/a.png'), '工作区内的相对图片解析为 file://');
  assert.ok(!all.includes('file:///tmp/secret.png'), '../ 越界路径不解析');
});
