import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SOCIAL_MAX_CARDS } from '../../../packages/shared/src/index.ts';
import { getSocialCardTheme, SOCIAL_CARD_PRESETS } from '@vcat/core';
import {
  pickSocialTheme,
  resolveSocialCoverImage,
  resolveSocialUploadImages,
  type CardRasterizer,
} from '../src/main/socialUploadImages.ts';

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-social-upload-'));
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(dir, 'assets', 'body.png'), 'body');
  await fs.writeFile(path.join(dir, 'assets', 'cover.jpg'), 'cover');
  return dir;
}

function fakeRasterizer(total: number) {
  const calls: Array<{ maxCards: number; themeId: string }> = [];
  const rasterize: CardRasterizer = async (p) => {
    calls.push({ maxCards: p.maxCards, themeId: p.themeId });
    return { imagePaths: Array.from({ length: Math.min(total, p.maxCards) }, (_, i) => `/tmp/card_${i + 1}.png`) };
  };
  return { rasterize, calls };
}

const MD_WITH_LOCAL_IMAGE = '# 标题\n\n正文第一段\n\n![配图](./assets/body.png)\n';

test('正文里有本地图片时，上传的仍然是生成的卡片，而不是正文原图', async () => {
  const ws = await makeWorkspace();
  const { rasterize, calls } = fakeRasterizer(5);
  const files = await resolveSocialUploadImages(
    { workspacePath: ws, markdown: MD_WITH_LOCAL_IMAGE, themeId: 'ios-memo', maxCards: 18 },
    rasterize
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(files, ['/tmp/card_1.png', '/tmp/card_2.png', '/tmp/card_3.png', '/tmp/card_4.png', '/tmp/card_5.png']);
  assert.ok(!files.some((f) => f.endsWith('body.png')));
});

test('卡片上限按平台传入：小红书 18、抖音 35，不再写死 9', async () => {
  assert.equal(SOCIAL_MAX_CARDS.xiaohongshu, 18);
  assert.equal(SOCIAL_MAX_CARDS.douyin, 35);
  const ws = await makeWorkspace();
  const xhs = fakeRasterizer(40);
  const xhsFiles = await resolveSocialUploadImages(
    { workspacePath: ws, markdown: '# a', themeId: 'ios-memo', maxCards: SOCIAL_MAX_CARDS.xiaohongshu ?? 0 },
    xhs.rasterize
  );
  assert.equal(xhs.calls[0].maxCards, 18);
  assert.equal(xhsFiles.length, 18);

  const dy = fakeRasterizer(40);
  const dyFiles = await resolveSocialUploadImages(
    { workspacePath: ws, markdown: '# a', themeId: 'ios-memo', maxCards: SOCIAL_MAX_CARDS.douyin ?? 0 },
    dy.rasterize
  );
  assert.equal(dy.calls[0].maxCards, 35);
  assert.equal(dyFiles.length, 35);
});

test('上传的封面作为第 1 张图插在卡片前，总数仍不超过平台上限', async () => {
  const ws = await makeWorkspace();
  const { rasterize, calls } = fakeRasterizer(40);
  const files = await resolveSocialUploadImages(
    { workspacePath: ws, markdown: '# a', themeId: 'ios-memo', maxCards: 18, coverImagePath: 'assets/cover.jpg' },
    rasterize
  );
  assert.equal(files.length, 18);
  assert.equal(files[0], path.join(ws, 'assets', 'cover.jpg'));
  assert.equal(files[1], '/tmp/card_1.png');
  assert.equal(calls[0].maxCards, 17);
});

test('封面路径接受 ./ 前缀；不存在、越出工作区或不是图片时忽略', async () => {
  const ws = await makeWorkspace();
  assert.equal(await resolveSocialCoverImage(ws, './assets/cover.jpg'), path.join(ws, 'assets', 'cover.jpg'));
  assert.equal(await resolveSocialCoverImage(ws, 'assets/missing.jpg'), null);
  assert.equal(await resolveSocialCoverImage(ws, '../../etc/passwd'), null);
  assert.equal(await resolveSocialCoverImage(ws, '../outside.png'), null);
  assert.equal(await resolveSocialCoverImage(ws, 'notes.md'), null);
  assert.equal(await resolveSocialCoverImage(null, 'assets/cover.jpg'), null);
  assert.equal(await resolveSocialCoverImage(ws, undefined), null);
});

test('卡片生成失败或为空时返回空列表（不会只传一张封面）', async () => {
  const ws = await makeWorkspace();
  const failing: CardRasterizer = async () => {
    throw new Error('offscreen failed');
  };
  assert.deepEqual(
    await resolveSocialUploadImages({ workspacePath: ws, markdown: '# a', themeId: 'ios-memo', maxCards: 18, coverImagePath: 'assets/cover.jpg' }, failing),
    []
  );
  const empty = fakeRasterizer(0);
  assert.deepEqual(
    await resolveSocialUploadImages({ workspacePath: ws, markdown: '', themeId: 'ios-memo', maxCards: 18, coverImagePath: 'assets/cover.jpg' }, empty.rasterize),
    []
  );
});

test('卡片模板沿用界面里选的模板，没选时用平台默认', () => {
  assert.equal(pickSocialTheme('minimalist-magazine', 'ios-memo'), 'minimalist-magazine');
  assert.equal(pickSocialTheme(undefined, 'minimalist-magazine'), 'minimalist-magazine');
  assert.equal(pickSocialTheme('  ', 'minimalist-magazine'), 'minimalist-magazine');
  for (const id of Object.keys(SOCIAL_CARD_PRESETS)) assert.equal(pickSocialTheme(id, 'ios-memo'), id);
});

test('旧版保存的模板名（别名）与发布弹窗缩略图解析成同一套模板，所见即所发（来自 #42）', () => {
  // 缩略图 CardStrip 用 renderSocialCardHtml → getSocialCardTheme 解析模板；发布必须和它一致
  assert.equal(pickSocialTheme('ink-classic', 'ios-memo'), 'minimalist-magazine');
  assert.equal(pickSocialTheme('forest-journal', 'minimalist-magazine'), 'elegant-book');
  for (const legacy of ['ink-classic', 'modern-minimal', 'mint-gradient', 'warm-note', 'not-a-theme']) {
    assert.equal(pickSocialTheme(legacy, 'minimalist-magazine'), getSocialCardTheme(legacy).id);
  }
});
