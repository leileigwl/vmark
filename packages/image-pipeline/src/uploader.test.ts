import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { saveImageToAssets } from './index.ts';
import { uploadLocalImagesForPublish } from './uploader.ts';

test('uploadLocalImagesForPublish uploads local assets and rewrites markdown in memory', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-upload-test-'));
  try {
    const saved = await saveImageToAssets(tmpDir, Buffer.from('fake-png-bytes'), 'png');
    const originalMd = `# Demo\n\n![pic](${saved.relativeMarkdownPath})\n\n![remote](https://cdn.example.com/a.png)\n`;

    const res = await uploadLocalImagesForPublish({
      workspacePath: tmpDir,
      markdown: originalMd,
      config: { strategy: 'platform_private' },
      uploadFn: async (_buf, fileName) => `https://mmbiz.qpic.cn/mock/${fileName}`,
    });

    assert.equal(res.uploadedCount, 1);
    assert.equal(res.errors.length, 0);
    assert.ok(res.markdown.includes('https://mmbiz.qpic.cn/mock/'));
    assert.ok(res.markdown.includes('https://cdn.example.com/a.png'));
    assert.ok(!res.markdown.includes(saved.relativeMarkdownPath));
    // Original string untouched
    assert.ok(originalMd.includes(saved.relativeMarkdownPath));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('uploadLocalImagesForPublish records error for missing image without crashing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-upload-err-'));
  try {
    const res = await uploadLocalImagesForPublish({
      workspacePath: tmpDir,
      markdown: '![missing](./assets/does-not-exist.png)',
      config: { strategy: 'custom_oss', provider: 'github' },
      uploadFn: async () => 'https://example.com/unused.png',
    });

    assert.equal(res.uploadedCount, 0);
    assert.equal(res.errors.length, 1);
    assert.ok(res.errors[0].includes('does-not-exist.png'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
