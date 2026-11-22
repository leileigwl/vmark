import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCardBlocks, type CardBlock } from './socialCardBlocks.ts';
import { estimateLineCount } from './socialCardLayout.ts';
import { extractPlainDigest } from './digest.ts';
import { SAMPLE } from './socialCardSample.fixture.ts';

describe('social card block parsing', () => {
  it('keeps every markdown construct as its own block and drops the title heading and rules', () => {
    const blocks = parseCardBlocks(SAMPLE.replace(/^---[\s\S]*?---\n/, ''), { title: '一个人的效率系统：三年实践复盘' });
    const kinds = new Set(blocks.map((b) => b.kind));
    for (const k of ['heading', 'paragraph', 'list-item', 'quote', 'code', 'image', 'table', 'math']) {
      assert.ok(kinds.has(k as CardBlock['kind']), `missing ${k}`);
    }
    assert.ok(!blocks.some((b) => b.kind === 'heading' && b.text.includes('三年实践复盘')));
    const table = blocks.find((b) => b.kind === 'table');
    assert.ok(table && table.kind === 'table');
    assert.deepEqual(table.header, ['清单', '放什么', '多久看一次']);
    assert.equal(table.rows.length, 3);
  });

  it('pre-splits very long paragraphs at sentence ends without losing text', () => {
    const long = '这是一句用来测试的长句子，包含一些逗号和停顿。'.repeat(20);
    const blocks = parseCardBlocks(long, { maxParagraphChars: 120 });
    assert.ok(blocks.length > 1);
    assert.equal(blocks.map((b) => (b.kind === 'paragraph' ? b.text : '')).join(''), long);
    assert.ok(blocks.every((b) => b.kind === 'paragraph' && b.text.endsWith('。')));
  });
});

describe('card text metrics', () => {
  it('counts CJK as full width and latin as narrower', () => {
    assert.equal(estimateLineCount('一'.repeat(25), 40, 1000), 2);
    assert.equal(estimateLineCount('a'.repeat(25), 40, 1000), 1);
  });
});

describe('digest excludes table text', () => {
  it('extractPlainDigest skips table cells', () => {
    const digest = extractPlainDigest(SAMPLE, 400);
    assert.ok(digest.includes('三年前我开始认真整理'));
    assert.ok(!digest.includes('多久看一次'));
    assert.ok(!digest.includes('必须今天完成的事'));
  });
});
