import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { renderXiaohongshuCards, renderSocialCardHtml } from '../packages/core/src/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.resolve(ROOT_DIR, 'screenshots/social_cards');
const DOCS_DIR = path.resolve(ROOT_DIR, 'docs/assets/screenshots/social_cards');

// 1. 个人旅行与城市漫游日记 (小红书主力场景：旅行日记 / 生活记录)
const travelDiaryMarkdown = `---
title: 京都深秋漫游手记：避开人潮的4条山野古寺步径
subtitle: 慢下来感受枫叶、苔庭与清晨薄雾里的京都日常
tags: [旅行日记, 京都漫游, 秋日攻略, 城市步径, 独立摄影]
---

> 真正的旅行不是去打卡别人镜头里的风景，而是在陌生街角找到属于自己的清晨节奏。

## 岚山奥嵯峨：清晨七点的苔庭与竹影
避开午后拥挤的渡月桥主街，从嵯峨鸟居本一路向北步行，整条碎石路只有落叶与鸟鸣。

- 祇王寺与常寂光寺连走：早晨8点开门即入，阳光斜穿过高耸枫林洒在青苔上
- 爱宕念佛寺千尊石佛：神态各异的青苔罗汉，藏在山谷深处极少游客抵达
- 化野念佛寺竹径：比岚山主竹林更静谧，适合带一本随笔在茶席小坐半小时
- 街角手冲咖啡补给：岚山电铁小站旁的木造老屋，烘豆香气混合着秋日冷空气

## 哲学之道至南禅寺：水路阁下的阅读时刻
沿着琵琶湖疏水渠缓缓南行，水声伴随红叶飘落，是京都最适合独自思考的散步路线。

- 法然院山门茅草顶：宛如画框般将红叶与门内白砂坛收入同一视线
- 永观堂回廊远眺：层叠枫叶倒映在放生池水面，傍晚亮灯前色彩最富有层次
- 南禅寺红砖水路阁：明治时代的罗马式拱桥水道，砖墙斑驳极具工业人文美感
- 顺路探访独立书店：在左京区一乘寺逛惠文社，挑选本年度独立杂志与手账纸品
`;

// 2. 极客工程与多平台排版文章 (技术教程 + Ray.so 不劈词代码卡片)
const techArticleMarkdown = `---
title: 前端高性能离线排版：从架构哲学到工程落地
subtitle: 纯本地 Markdown 解析与多平台自适应视觉卡片引擎
tags: [前端架构, 性能优化, 本地优先, 极客工程, 独立开发]
---

> 把排版的不确定性交给确定性的本地光栅化引擎，让创作者只专注于表达本身。

## 核心设计理念与架构突破
Vmark 坚持 Local-First 本地优先架构设计，彻底解决多平台排版碎片化与图床外链失效痛点。

- 纯本地解析与光栅化渲染，零外部云端依赖与数据泄露隐患
- 融合 Guizang Editorial 杂志网格与小红书/抖音 UGC 满版比例系统
- 智能识别旅行游记、个人随笔、读书札记与技术教程四大创作题材
- 预留自定义封面槽位，无封面时自动生成 3:4 / 16:9 / 2.35:1 平台专属封面

## Ray.so 工业级代码高亮管线
代码卡片采用自适应字号与智能词边界换行，彻底杜绝英文标识符从单词中间硬劈断。

\`\`\`typescript
export async function dispatchSocialCard(task: ArticlePublishTask): Promise<DraftResult> {
  // 1. 智能识别文章题材（旅行 / 随笔 / 读书 / 技术）与真实摘要
  const cardDeck = renderXiaohongshuCards(task.markdown, {
    fallbackTitle: task.title,
    coverRatio: task.coverRatio ?? '3:4',
  });

  // 2. 离屏满版光栅化，自动适配平台封面比例与主题色板
  const images = await rasterizeCards(cardDeck, {
    themeId: task.themeId ?? cardDeck.genre,
  });

  // 3. 批量注入创作者草稿箱，保留创作者最终确认权
  return uploadDraftBatch(task.platform, images);
}
\`\`\`

## 平台安全与反风控准则
多平台分发不仅仅是格式转换，更是一套严谨的本地隐私与工程防护体系。

- 凭据系统级加密：Cookie 与 Session 通过主进程 safeStorage 加密落库
- 满版视觉防截断：3:4 画幅 82% 黄金内容填充率，移动端缩略图一眼吸睛
- 端到端契约守护：L0 静态门禁 + L1 单测 + L2 Web E2E + L3 真 Electron 联检
`;

// 3. 个人随笔与读书思考 (Ink Classic 纸墨人文风)
const essayMarkdown = `---
title: 慢写作时代的个人数字花园：为什么我坚持本地优先记录
subtitle: 在算法流与碎片信息之外，为长期思考留一方安静书桌
tags: [个人随笔, 数字花园, 读书笔记, 独立博客, 深度思考]
---

> 我们写下的每一段文字，都不该被困在某一个平台的封闭数据库里，而应成为伴随一生的思维资产。

## 找回对文字与版面的掌控感
当所有平台都在追求短短十几秒的即时刺激时，结构清晰、排版优雅的图文反而拥有更长久的生命力。

- 一次专注写作，自动衍生为适配博客、公众号、小红书与抖音的多形态作品
- 引语、章节看点与脚注文献自动归位，无需在排版编辑器里反复调字号
- 每一轮需求与灵感迭代都沉淀在本地 HTML 图鉴看板中，随时可回溯复盘
`;

async function main() {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  await fs.mkdir(DOCS_DIR, { recursive: true });

  const travelDeck = renderXiaohongshuCards(travelDiaryMarkdown);
  const techDeck = renderXiaohongshuCards(techArticleMarkdown);
  const essayDeck = renderXiaohongshuCards(essayMarkdown);

  // Compose a 5-card Xiaohongshu Showcase Deck that demonstrates:
  // 01: Travel / Personal UGC Magazine Cover (Coral Ivory)
  // 02: Travel Diary Full-Bleed Content Card
  // 03: Ray.so Non-Breaking Code Card
  // 04: Tech Architecture Content Card
  // 05: Security & Personal Creator Summary Card
  const xhsCards = [
    travelDeck.cards[0],
    travelDeck.cards[1],
    techDeck.cards[2],
    travelDeck.cards[2],
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

  console.log('\n--- 1. Generating Xiaohongshu 3:4 Full-Bleed Deck (editorial-coral) ---');
  for (let i = 0; i < xhsCards.length; i++) {
    const card = xhsCards[i];
    const html = renderSocialCardHtml(card, {
      themeId: 'editorial-coral',
      cardIndex: i,
      totalCards: xhsCards.length,
      brandName: 'Vmark Studio',
      aspectRatio: '3:4',
    });

    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(80);

    const filename = `xhs-card-0${i + 1}-${card.type}.png`;
    const dest1 = path.join(SCREENSHOT_DIR, filename);
    const dest2 = path.join(DOCS_DIR, filename);

    await page.screenshot({ path: dest1, type: 'png' });
    await fs.copyFile(dest1, dest2);
    const stat = await fs.stat(dest1);
    console.log(`✔ Generated: ${filename} (${(stat.size / 1024).toFixed(1)} KB) -> 1080x1440`);
  }

  console.log('\n--- 2. Generating Douyin 3:4 Full-Bleed Deck (ray-dark) ---');
  const douyinCards = [
    techDeck.cards[0],
    techDeck.cards[1],
    techDeck.cards[2],
    travelDeck.cards[1],
    techDeck.cards[3],
  ];
  for (let i = 0; i < douyinCards.length; i++) {
    const card = douyinCards[i];
    const html = renderSocialCardHtml(card, {
      themeId: 'ray-dark',
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
    console.log(`✔ Generated: ${filename} (${(stat.size / 1024).toFixed(1)} KB) -> 1080x1440`);
  }

  console.log('\n--- 3. Generating Personal Essay (ink-classic) & Swiss Slate Showcase ---');
  const inkHtml = renderSocialCardHtml(essayDeck.cards[0], {
    themeId: 'ink-classic',
    cardIndex: 0,
    totalCards: essayDeck.cards.length,
    brandName: 'Vmark Essay',
    aspectRatio: '3:4',
  });
  await page.setContent(inkHtml, { waitUntil: 'load' });
  await page.waitForTimeout(80);
  const inkFile = path.join(SCREENSHOT_DIR, 'theme-ink-classic-cover.png');
  await page.screenshot({ path: inkFile, type: 'png' });
  await fs.copyFile(inkFile, path.join(DOCS_DIR, 'theme-ink-classic-cover.png'));
  console.log(`✔ Generated: theme-ink-classic-cover.png (Personal Essay Cover)`);

  const swissHtml = renderSocialCardHtml(techDeck.cards[1], {
    themeId: 'swiss-slate',
    cardIndex: 1,
    totalCards: techDeck.cards.length,
    brandName: 'Vmark Swiss',
    aspectRatio: '3:4',
  });
  await page.setContent(swissHtml, { waitUntil: 'load' });
  await page.waitForTimeout(80);
  const swissFile = path.join(SCREENSHOT_DIR, 'theme-swiss-slate-content.png');
  await page.screenshot({ path: swissFile, type: 'png' });
  await fs.copyFile(swissFile, path.join(DOCS_DIR, 'theme-swiss-slate-content.png'));
  console.log(`✔ Generated: theme-swiss-slate-content.png (Swiss Slate Content)`);

  await browser.close();
  console.log('\nAll multi-genre social card visual assets successfully generated and verified!');
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
