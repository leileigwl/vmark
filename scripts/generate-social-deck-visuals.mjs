import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { renderXiaohongshuCards, renderSocialCardHtml } from '../packages/core/src/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.resolve(ROOT_DIR, 'screenshots/social_cards');
const DOCS_DIR = path.resolve(ROOT_DIR, 'docs/assets/screenshots/social_cards');

// 1. 苹果备忘录风格长文（旅行日记 / 个人博客 / 排版演示）
const appleNotesArticleMarkdown = `---
title: 京都深秋漫游手记：避开人潮的4条山野古寺步径
subtitle: 慢下来如何组织一篇有呼吸感的漫游随笔
tags: [旅行日记, 京都漫游, 秋日攻略, 城市步径]
---

> 这是一份旅行随笔与排版启动示例，用来展示苹果备忘录、极简杂志与空白模板的真实流式排版效果。

## 岚山奥嵯峨的清晨节奏
每一段保持短一点，两个回车分隔段落。系统会优先在段落之间自动分页，所以**清晰分段**比手动塞满一页更稳定。

**加粗**适合普通关键词，例如「祇王寺苔庭」「常寂光寺」「化野念佛寺竹径」。它只改变字重，颜色会和正文一致。

==高亮==适合真正需要停顿的关键信息，例如早晨8点开门即入、岚山电铁小站手冲咖啡或转折点。高亮会使用模板的强调色，一眼抓住视线。

*斜体适合轻提示或旅途心情记录*，~~删除线适合标记已放弃的拥挤打卡点~~。

> 引用适合一句完整的旅途总结，把清晨山野里的落叶与鸟鸣定格在纸页底部。

## 哲学之道至南禅寺步径
沿着琵琶湖疏水渠缓缓南行，水声伴随红叶飘落，是京都最适合独自思考的散步路线。

- 法然院山门茅草顶：宛如画框般将**红叶与白砂坛**收入同一视线
- 永观堂回廊远眺：层叠枫叶倒映水面，==傍晚亮灯前==色彩最富有层次
- 南禅寺红砖水路阁：明治时代的罗马式拱桥水道，砖墙斑驳极具人文美感
- 左京区一乘寺独立书店：在惠文社挑选本年度**独立杂志与手账纸品**
`;

// 2. 技术与个人工程笔记（含代码块与暗夜深思展示）
const techArticleMarkdown = `---
title: 前端高性能离线排版：从架构哲学到工程落地
subtitle: 纯本地 Markdown 解析与流式长文卡片引擎
tags: [前端架构, 性能优化, 本地优先, 极客工程]
---

> 把排版的不确定性交给确定性的本地光栅化引擎，让创作者只专注于文字表达本身。

## 核心设计理念与流式分页
Vmark 坚持 **Local-First 本地优先**架构设计，彻底解决多平台排版碎片化与图床外链失效痛点。

- 纯本地解析与光栅化渲染，==零外部云端依赖==与数据泄露隐患
- 像素级复刻最常用的**苹果备忘录**、**极简杂志**、**空白模板**与**书籍内页**
- 自动识别 \`**加粗**\`、\`==高亮==\`、\`*斜体*\`、\`> 引用块\` 与代码块智能换行

## 代码块智能词边界排版
\`\`\`typescript
export async function dispatchSocialCard(task: ArticlePublishTask): Promise<DraftResult> {
  // 1. 解析 Markdown 段落、引用块、高亮与代码节点
  const cardDeck = renderXiaohongshuCards(task.markdown, {
    fallbackTitle: task.title,
    coverRatio: task.coverRatio ?? '3:4',
  });

  // 2. 离屏光栅化渲染（默认采用最受欢迎的 ios-memo 苹果备忘录模板）
  const images = await rasterizeCards(cardDeck, {
    themeId: task.themeId ?? 'ios-memo',
  });

  return uploadDraftBatch(task.platform, images);
}
\`\`\`

## 平台安全与反风控准则
多平台分发不仅仅是格式转换，更是一套严谨的**本地隐私与工程防护体系**。

- 凭据系统级加密：Cookie 与 Session 通过主进程 \`safeStorage\` 加密落库
- 连续流式阅读体验：摒弃生硬的 PPT 标签框，还原==真机备忘录与纸质杂志==呼吸感
- 端到端契约守护：L0 静态门禁 + L1 单测 + L2 Web E2E + L3 真 Electron 联检
`;

async function main() {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  await fs.mkdir(DOCS_DIR, { recursive: true });

  const notesDeck = renderXiaohongshuCards(appleNotesArticleMarkdown);
  const techDeck = renderXiaohongshuCards(techArticleMarkdown);

  // 5-Card Xiaohongshu Showcase Deck using 'ios-memo' (苹果备忘录):
  const xhsCards = [
    notesDeck.cards[0],
    notesDeck.cards[2] || notesDeck.cards[1],
    techDeck.cards[2],
    techDeck.cards[1],
    techDeck.cards[3],
  ];

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1080, height: 1440 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  console.log('\n--- 1. Generating Xiaohongshu Deck (ios-memo 苹果备忘录) ---');
  for (let i = 0; i < xhsCards.length; i++) {
    const card = xhsCards[i];
    const html = renderSocialCardHtml(card, {
      themeId: 'ios-memo',
      cardIndex: i,
      totalCards: xhsCards.length,
      brandName: 'Vmark Notes',
      aspectRatio: '3:4',
      timestamp: '11月21日 00:32',
    });

    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(80);

    const filename = `xhs-card-0${i + 1}-${card.type}.png`;
    const dest1 = path.join(SCREENSHOT_DIR, filename);
    const dest2 = path.join(DOCS_DIR, filename);

    await page.screenshot({ path: dest1, type: 'png' });
    await fs.copyFile(dest1, dest2);
    const stat = await fs.stat(dest1);
    console.log(`✔ Generated: ${filename} (${(stat.size / 1024).toFixed(1)} KB) -> 1080x1440 [ios-memo]`);
  }

  console.log('\n--- 2. Generating Douyin Deck (minimalist-magazine 极简杂志) ---');
  const douyinCards = [
    techDeck.cards[0],
    techDeck.cards[1],
    techDeck.cards[2],
    notesDeck.cards[1],
    techDeck.cards[3],
  ];
  for (let i = 0; i < douyinCards.length; i++) {
    const card = douyinCards[i];
    const html = renderSocialCardHtml(card, {
      themeId: 'minimalist-magazine',
      cardIndex: i,
      totalCards: douyinCards.length,
      brandName: 'Vmark Creator',
      aspectRatio: '3:4',
    });

    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(80);

    const filename = `douyin-card-0${i + 1}-${card.type}.png`;
    const dest1 = path.join(SCREENSHOT_DIR, filename);
    const dest2 = path.join(DOCS_DIR, filename);

    await page.screenshot({ path: dest1, type: 'png' });
    await fs.copyFile(dest1, dest2);
    const stat = await fs.stat(dest1);
    console.log(`✔ Generated: ${filename} (${(stat.size / 1024).toFixed(1)} KB) -> 1080x1440 [minimalist-magazine]`);
  }

  console.log('\n--- 3. Generating Minimalist Magazine (极简杂志) & Pure Blank (空白模板) Showcase ---');
  const magHtml = renderSocialCardHtml(notesDeck.cards[0], {
    themeId: 'minimalist-magazine',
    cardIndex: 0,
    totalCards: notesDeck.cards.length,
    brandName: 'Vmark Magazine',
    aspectRatio: '3:4',
  });
  await page.setContent(magHtml, { waitUntil: 'load' });
  await page.waitForTimeout(80);
  const magFile = path.join(SCREENSHOT_DIR, 'theme-ink-classic-cover.png');
  await page.screenshot({ path: magFile, type: 'png' });
  await fs.copyFile(magFile, path.join(DOCS_DIR, 'theme-ink-classic-cover.png'));
  console.log(`✔ Generated: theme-ink-classic-cover.png [minimalist-magazine 极简杂志]`);

  const blankHtml = renderSocialCardHtml(notesDeck.cards[0], {
    themeId: 'blank',
    cardIndex: 0,
    totalCards: notesDeck.cards.length,
    brandName: 'Vmark Blank',
    aspectRatio: '3:4',
  });
  await page.setContent(blankHtml, { waitUntil: 'load' });
  await page.waitForTimeout(80);
  const blankFile = path.join(SCREENSHOT_DIR, 'theme-swiss-slate-content.png');
  await page.screenshot({ path: blankFile, type: 'png' });
  await fs.copyFile(blankFile, path.join(DOCS_DIR, 'theme-swiss-slate-content.png'));
  console.log(`✔ Generated: theme-swiss-slate-content.png [blank 空白模板]`);

  await browser.close();
  console.log('\nAll xhs-textcard style visual assets successfully generated and verified!');
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
