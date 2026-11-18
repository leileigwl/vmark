import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { saveImageToAssets } from './index.ts';
import { resolveRefererForUrl, uploadLocalImagesForPublish } from './uploader.ts';

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

test('uploadLocalImagesForPublish downloads anti-hotlink remote images with Referer and skips trusted hosts', async () => {
  const capturedReferers: Record<string, string | null> = {};
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    capturedReferers[url] = headers.get('Referer');
    return new Response(Buffer.from('remote-img-bytes'), {
      status: 200,
      headers: { 'content-type': 'image/webp' },
    });
  };

  const md = [
    '![zhihu](https://pic1.zhimg.com/v2-abc.jpg)',
    '![wx](https://mmbiz.qpic.cn/mmbiz_png/already-wx/0?wx_fmt=png)',
  ].join('\n');

  const res = await uploadLocalImagesForPublish({
    markdown: md,
    config: { strategy: 'platform_private' },
    includeRemote: true,
    skipHosts: ['mmbiz.qpic.cn'],
    fetchFn: mockFetch,
    uploadFn: async (_buf, fileName) => `https://mmbiz.qpic.cn/reuploaded/${fileName}`,
  });

  assert.equal(res.uploadedCount, 1);
  assert.equal(res.errors.length, 0);
  assert.equal(capturedReferers['https://pic1.zhimg.com/v2-abc.jpg'], 'https://www.zhihu.com/');
  assert.equal(capturedReferers['https://mmbiz.qpic.cn/mmbiz_png/already-wx/0?wx_fmt=png'], undefined);
  assert.ok(res.markdown.includes('https://mmbiz.qpic.cn/reuploaded/v2-abc.jpg'));
  assert.ok(res.markdown.includes('https://mmbiz.qpic.cn/mmbiz_png/already-wx/0?wx_fmt=png'));
  assert.equal(resolveRefererForUrl('https://img-blog.csdnimg.cn/123.png'), 'https://blog.csdn.net/');
});
