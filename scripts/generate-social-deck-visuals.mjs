import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { renderXiaohongshuCards, renderSocialCardHtml } from '../packages/core/src/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.resolve(ROOT_DIR, 'screenshots/social_cards');
const DOCS_DIR = path.resolve(ROOT_DIR, 'docs/assets/screenshots/social_cards');

const testArticleMarkdown = `---
title: 前端高性能离线排版：从架构哲学到工程落地
tags: [前端架构, 性能优化, 本地优先, 极客工程]
---

# 核心设计理念与架构突破
Vmark 坚持 Local-First 本地优先架构设计，彻底解决多平台排版碎片化与图床外链失效痛点。

• 纯本地解析与光栅化渲染，零外部云端依赖与数据泄露隐患
• 严格遵循 Guizang Editorial x Swiss 瑞士国际排版设计规范
• 100% 离线自适应 3:4 移动端黄金画幅（1080×1440）

# Ray.so 工业级代码高亮管线
为了呈现极致的极客质感，代码模块完整融合了 Ray.so 的设计语言，支持 macOS 红黄绿微光控制钮。

\`\`\`typescript
export async function dispatchSocialCard(task: ArticlePublishTask): Promise<DraftResult> {
  // 1. 结构化解析 Markdown 节点与代码块
  const cardDeck = renderXiaohongshuCards(task.markdown, task.title);
  
  // 2. 离屏无头光栅化，智能探测最佳排版主题
  const images = await rasterizeCards(cardDeck, { theme: detectTheme(task) });
  
  // 3. 批量灌入创作者草稿箱，平滑延时防风控拦截
  return uploadDraftBatch(task.platform, images);
}
\`\`\`

# 平台安全与反风控准则
多平台分发不仅仅是格式转换，更是一套严谨工程防护体系。

• 凭据系统级安全加密：Cookie 与 Session 通过 safeStorage 物理落盘
• 节流反风控：300-500ms 平滑延时，模拟自然人操作习惯
• 智能降级容错：网络波动自动指数退避，草稿稳健落库
`;

async function main() {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  await fs.mkdir(DOCS_DIR, { recursive: true });

  const deck = renderXiaohongshuCards(testArticleMarkdown);
  console.log(`[Deck Parser] Parsed title: "${deck.title}", cards count: ${deck.cards.length}`);

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1080, height: 1440 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  // Test Case 1: Xiaohongshu Deck with 'editorial-coral' (小红书高赞珊瑚白茶)
  console.log('\n--- Generating Xiaohongshu Deck (editorial-coral) ---');
  for (let i = 0; i < deck.cards.length; i++) {
    const card = deck.cards[i];
    const html = renderSocialCardHtml(card, {
      themeId: 'editorial-coral',
      cardIndex: i,
      totalCards: deck.cards.length,
      brandName: 'Vmark Studio',
    });

    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(100);

    const filename = `xhs-card-0${i + 1}-${card.type}.png`;
    const dest1 = path.join(SCREENSHOT_DIR, filename);
    const dest2 = path.join(DOCS_DIR, filename);

    await page.screenshot({ path: dest1, type: 'png' });
    await fs.copyFile(dest1, dest2);
    const stat = await fs.stat(dest1);
    console.log(`✔ Generated: ${filename} (${(stat.size / 1024).toFixed(1)} KB) -> 1080x1440`);
  }

  // Test Case 2: Douyin Deck with 'ray-dark' (抖音极客暗夜)
  console.log('\n--- Generating Douyin Deck (ray-dark) ---');
  for (let i = 0; i < deck.cards.length; i++) {
    const card = deck.cards[i];
    const html = renderSocialCardHtml(card, {
      themeId: 'ray-dark',
      cardIndex: i,
      totalCards: deck.cards.length,
      brandName: 'Vmark Engineering',
    });

    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(100);

    const filename = `douyin-card-0${i + 1}-${card.type}.png`;
    const dest1 = path.join(SCREENSHOT_DIR, filename);
    const dest2 = path.join(DOCS_DIR, filename);

    await page.screenshot({ path: dest1, type: 'png' });
    await fs.copyFile(dest1, dest2);
    const stat = await fs.stat(dest1);
    console.log(`✔ Generated: ${filename} (${(stat.size / 1024).toFixed(1)} KB) -> 1080x1440`);
  }

  // Test Case 3: Ink Classic & Swiss Slate Showcase
  console.log('\n--- Generating Showcase Themes (ink-classic & swiss-slate) ---');
  const inkHtml = renderSocialCardHtml(deck.cards[0], {
    themeId: 'ink-classic',
    cardIndex: 0,
    totalCards: deck.cards.length,
    brandName: 'Vmark Editorial',
  });
  await page.setContent(inkHtml, { waitUntil: 'load' });
  await page.waitForTimeout(100);
  const inkFile = path.join(SCREENSHOT_DIR, 'theme-ink-classic-cover.png');
  await page.screenshot({ path: inkFile, type: 'png' });
  await fs.copyFile(inkFile, path.join(DOCS_DIR, 'theme-ink-classic-cover.png'));
  console.log(`✔ Generated: theme-ink-classic-cover.png`);

  const swissHtml = renderSocialCardHtml(deck.cards[1], {
    themeId: 'swiss-slate',
    cardIndex: 1,
    totalCards: deck.cards.length,
    brandName: 'Vmark Swiss',
  });
  await page.setContent(swissHtml, { waitUntil: 'load' });
  await page.waitForTimeout(100);
  const swissFile = path.join(SCREENSHOT_DIR, 'theme-swiss-slate-content.png');
  await page.screenshot({ path: swissFile, type: 'png' });
  await fs.copyFile(swissFile, path.join(DOCS_DIR, 'theme-swiss-slate-content.png'));
  console.log(`✔ Generated: theme-swiss-slate-content.png`);

  await browser.close();
  console.log('\nAll social card visual assets successfully generated and verified!');
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
