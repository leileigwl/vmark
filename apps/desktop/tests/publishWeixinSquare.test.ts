import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDraft } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { buildPayload, type CoverCropper } from '../src/renderer/src/features/publish-flow/runPublish.ts';
import { resolveWeixinCovers } from '../src/main/publishWeixinCover.ts';

const MD = '# 一篇文章\n\n正文开头。\n\n![图](./assets/a.png)\n';

test('公众号上传封面：按焦点另裁一张 1:1 方图，放进 weixinSquareCoverImagePath', async () => {
  const seen: Array<{ ratio: string; focus: { x: number; y: number } }> = [];
  const crop: CoverCropper = async (_src, ratio, focus) => {
    seen.push({ ratio, focus });
    return `assets/crop-${ratio}.jpg`;
  };
  const d = { ...createDraft(MD, 'f', ''), coverUpload: 'assets/up.jpg', coverFocus: { x: 80, y: 20 } };
  const cache = new Map();
  const wx = await buildPayload(d, MD, 'weixin', './assets/a.png', crop, cache);
  assert.equal(wx.coverImageUrl, 'assets/crop-2.35:1.jpg');
  assert.equal(wx.weixinSquareCoverImagePath, 'assets/crop-1:1.jpg');
  assert.deepEqual(seen, [
    { ratio: '2.35:1', focus: { x: 80, y: 20 } },
    { ratio: '1:1', focus: { x: 80, y: 20 } },
  ]);
  const zhihu = await buildPayload(d, MD, 'zhihu', './assets/a.png', crop, cache);
  assert.equal(zhihu.weixinSquareCoverImagePath, undefined);
});

test('公众号没上传封面（用正文首图）不带方图；方图裁剪失败退回上传原图', async () => {
  const ok: CoverCropper = async (_s, ratio) => `assets/crop-${ratio}.jpg`;
  const body = await buildPayload(createDraft(MD, 'f', ''), MD, 'weixin', './assets/a.png', ok, new Map());
  assert.equal(body.coverImageUrl, './assets/a.png');
  assert.equal(body.weixinSquareCoverImagePath, undefined);
  const fail: CoverCropper = async () => {
    throw new Error('canvas');
  };
  const up = { ...createDraft(MD, 'f', ''), coverUpload: 'assets/up.jpg' };
  const wx = await buildPayload(up, MD, 'weixin', '', fail, new Map());
  assert.equal(wx.weixinSquareCoverImagePath, 'assets/up.jpg');
});

test('主进程：封面与 1:1 方图分别上传，返回两个 mmbiz 地址；没有方图时 squareUrl 为空', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wxsq-'));
  await fs.mkdir(path.join(root, 'assets'));
  await fs.writeFile(path.join(root, 'assets/wide.jpg'), 'W');
  await fs.writeFile(path.join(root, 'assets/sq.jpg'), 'S');
  const uploads: string[] = [];
  const upload = async (buf: Buffer, name: string) => {
    uploads.push(`${name}:${buf.toString()}`);
    return `https://mmbiz.qpic.cn/${name}`;
  };
  const both = await resolveWeixinCovers({
    coverImageUrl: 'assets/wide.jpg',
    squareImagePath: 'assets/sq.jpg',
    workspacePath: root,
    upload,
    includeRemote: true,
  });
  assert.deepEqual(both, { ok: true, url: 'https://mmbiz.qpic.cn/wide.jpg', squareUrl: 'https://mmbiz.qpic.cn/sq.jpg' });
  assert.deepEqual(uploads, ['wide.jpg:W', 'sq.jpg:S']);
  const wideOnly = await resolveWeixinCovers({ coverImageUrl: 'assets/wide.jpg', workspacePath: root, upload, includeRemote: true });
  assert.deepEqual(wideOnly, { ok: true, url: 'https://mmbiz.qpic.cn/wide.jpg', squareUrl: undefined });
  const bad = await resolveWeixinCovers({ squareImagePath: '../etc/passwd', workspacePath: root, upload, includeRemote: true });
  assert.equal(bad.ok, false);
});
