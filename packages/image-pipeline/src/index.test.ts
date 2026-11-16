import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractImageRefs, replaceImagesInMemory, saveImageToAssets } from './index.ts';

test('extractImageRefs classifies local vs remote URLs', () => {
  const md = '![a](./assets/1.png) and ![b](https://cdn.example.com/2.jpg)';
  const refs = extractImageRefs(md);
  assert.equal(refs.length, 2);
  assert.equal(refs[0].isLocal, true);
  assert.equal(refs[1].isLocal, false);
});

test('saveImageToAssets writes binary image and returns relative assets path', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vcat-img-'));
  try {
    const res = await saveImageToAssets(tmpDir, Buffer.from('fake-png-bytes'), 'png');
    assert.ok(res.relativeMarkdownPath.startsWith('./assets/'));
    assert.ok(res.relativeMarkdownPath.endsWith('.png'));
    const stat = await fs.stat(res.fullPath);
    assert.ok(stat.size > 0);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('replaceImagesInMemory rewrites mapped URLs without mutating original string', () => {
  const original = '# Test\n![img](./assets/demo.png)';
  const cloned = replaceImagesInMemory(original, {
    './assets/demo.png': 'https://mmbiz.qpic.cn/demo.png',
  });
  assert.equal(original, '# Test\n![img](./assets/demo.png)');
  assert.equal(cloned, '# Test\n![img](https://mmbiz.qpic.cn/demo.png)');
});
