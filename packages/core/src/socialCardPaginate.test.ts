import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCardBlocks, type CardBlock } from './socialCardBlocks.ts';
import { estimateCardBlockHeight, paginateCardBlocks, type CardPageLayout } from './socialCardPaginate.ts';
import { SAMPLE } from './socialCardSample.fixture.ts';

const PAGE_H = 1300;
const WIDTH = 1040;
const estimate = (b: CardBlock) => estimateCardBlockHeight(b, WIDTH);

function assertFill(pages: CardPageLayout[], minFill: number) {
  pages.slice(0, -1).forEach((p, i) => {
    assert.ok(p.used >= PAGE_H * minFill, `page ${i + 1} fill ${(p.used / PAGE_H).toFixed(2)} < ${minFill}`);
  });
}

function assertNoOrphanHeading(pages: CardPageLayout[]) {
  pages.slice(0, -1).forEach((p, i) => {
    assert.notEqual(p.blocks[p.blocks.length - 1].block.kind, 'heading', `page ${i + 1} ends with a heading`);
  });
}

/** Deterministic pseudo-random generator so adversarial layouts are reproducible. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe('social card pagination by measured height', () => {
  it('fills every page except the last above the minimum and never ends a page with a heading', () => {
    const blocks = parseCardBlocks(SAMPLE.replace(/^---[\s\S]*?---\n/, '').repeat(3));
    const pages = paginateCardBlocks(blocks, { pageHeight: PAGE_H, measure: estimate, minFill: 0.6 });
    assert.ok(pages.length >= 3);
    assertFill(pages, 0.6);
    assertNoOrphanHeading(pages);
    pages.forEach((p, i) => assert.ok(p.used <= PAGE_H, `page ${i + 1} overflows: ${p.used}`));
  });

  it('holds the same guarantees under adversarial measured heights', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const blocks: CardBlock[] = [];
      for (let i = 0; i < 40; i++) {
        const roll = r();
        if (roll < 0.2) blocks.push({ kind: 'heading', level: 2, text: `小节 ${i}` });
        else if (roll < 0.3) blocks.push({ kind: 'image', src: `img${i}.png`, alt: '' });
        else if (roll < 0.4) blocks.push({ kind: 'code', lang: 'ts', lines: Array.from({ length: 3 + Math.floor(r() * 10) }, (_, k) => `line ${k}`) });
        else blocks.push({ kind: 'paragraph', text: '一句话。'.repeat(2 + Math.floor(r() * 30)) });
      }
      const heights = new Map<CardBlock, number>();
      const measure = (b: CardBlock) => {
        if (!heights.has(b)) heights.set(b, b.kind === 'image' ? 300 + r() * 1200 : estimate(b) * (0.8 + r() * 0.5));
        return heights.get(b) as number;
      };
      const pages = paginateCardBlocks(blocks, { pageHeight: PAGE_H, measure, minFill: 0.5 });
      assertFill(pages, 0.5);
      assertNoOrphanHeading(pages);
      for (const p of pages) {
        assert.ok(p.used <= PAGE_H + 0.5, `seed ${seed} overflow ${p.used}`);
        for (const pb of p.blocks) {
          if (pb.block.kind === 'image') assert.ok((pb.imageMaxHeight ?? Infinity) <= PAGE_H, 'image taller than page');
        }
      }
    }
  });

  it('splits text only at sentence boundaries, so no rendered line is cut and no text is lost', () => {
    const para = '第一句话讲背景。第二句话讲问题。第三句话讲方案。第四句话讲结果。'.repeat(8);
    const blocks: CardBlock[] = [{ kind: 'paragraph', text: '开头的一段铺垫文字，占一些空间。'.repeat(14) }, { kind: 'paragraph', text: para }];
    const pages = paginateCardBlocks(blocks, { pageHeight: PAGE_H, measure: estimate });
    const texts = pages.flatMap((p) => p.blocks.map((b) => (b.block.kind === 'paragraph' ? b.block.text : '')));
    assert.equal(texts.join(''), blocks.map((b) => (b.kind === 'paragraph' ? b.text : '')).join(''));
    assert.ok(texts.every((t) => /[。]$/.test(t)), 'every piece ends at a sentence boundary');
  });


  it('keeps small tables and short code whole, and continues line numbers when long code splits', () => {
    const filler: CardBlock = { kind: 'paragraph', text: '铺垫文字占据页面的大部分空间。'.repeat(30) };
    const table: CardBlock = { kind: 'table', header: ['a', 'b'], rows: [['1', '2'], ['3', '4'], ['5', '6']] };
    const pagesT = paginateCardBlocks([filler, table], { pageHeight: PAGE_H, measure: estimate });
    assert.equal(pagesT.flatMap((p) => p.blocks).filter((b) => b.block.kind === 'table').length, 1);

    const code: CardBlock = { kind: 'code', lang: 'ts', lines: Array.from({ length: 30 }, (_, i) => `const v${i} = ${i};`) };
    const pagesC = paginateCardBlocks([filler, code], { pageHeight: PAGE_H, measure: estimate });
    const parts = pagesC.flatMap((p) => p.blocks.map((b) => b.block)).filter((b) => b.kind === 'code');
    assert.ok(parts.length >= 2);
    let next = 1;
    for (const part of parts) {
      assert.ok(part.kind === 'code' && part.lines.length >= 4);
      assert.equal(part.kind === 'code' ? part.start ?? 1 : 0, next);
      next += part.kind === 'code' ? part.lines.length : 0;
    }
    assert.equal(next, 31);
  });
});
