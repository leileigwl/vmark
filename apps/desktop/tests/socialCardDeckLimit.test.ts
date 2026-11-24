import assert from 'node:assert/strict';
import test from 'node:test';
import { SOCIAL_MAX_CARDS } from '@vcat/shared';
import { renderCardDeck, type CardPageDriver } from '../src/main/socialCardRasterizer.ts';

/** 不测浏览器排版：测量返回非数组时走估算高度，只看张数上限是否用的是平台常量。 */
const fakeDriver: CardPageDriver = {
  load: async () => {},
  evaluate: async () => null,
  capture: async () => Buffer.from([0]),
};

const LONG = Array.from({ length: 60 }, (_, i) => `## 第 ${i + 1} 节\n\n${'这是一段足够长的正文，用来把卡片撑满。'.repeat(12)}`).join('\n\n');

test('卡片张数上限来自 SOCIAL_MAX_CARDS：抖音不会被核心库默认的 18 张截断', async () => {
  const max = SOCIAL_MAX_CARDS.douyin ?? 0;
  assert.ok(max > 18);
  const { images } = await renderCardDeck(fakeDriver, { markdown: LONG, maxCards: max });
  assert.equal(images.length, max);
});

test('没传 maxCards 时按小红书上限，而不是写死 9 张', async () => {
  const { images } = await renderCardDeck(fakeDriver, { markdown: LONG });
  assert.equal(images.length, SOCIAL_MAX_CARDS.xiaohongshu);
});
