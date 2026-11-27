import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPlatform, coverFocusFor, coverFor, createDraft, mergeSaved, setOwnCover, type PublishDraft } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { PLATFORM_SPECS, SPEC_BY_ID, ownCoverEligible } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';
import { buildPayload, type CoverCropper } from '../src/renderer/src/features/publish-flow/runPublish.ts';

const MD = '# 公众号文章\n\n正文。\n\n![图](./assets/a.png)\n';
const crop: CoverCropper = async (src, ratio, f) => `${src}@${ratio}@${f.x},${f.y}`;
const draft = (patch: Partial<PublishDraft> = {}): PublishDraft => ({ ...createDraft(MD, 'f', '摘要'), ...patch });
const wx = SPEC_BY_ID.weixin!;

test('公众号不再有作者 / 阅读原文：新草稿没有这两个字段，旧版本记住的值合并时丢弃，推送不带', async () => {
  const d = draft();
  assert.equal('weixinAuthor' in d, false);
  assert.equal('weixinSourceUrl' in d, false);
  const legacy: Record<string, unknown> = { weixinAuthor: '旧作者', weixinSourceUrl: 'https://old' };
  const merged = mergeSaved(d, legacy as Partial<PublishDraft>);
  assert.equal('weixinAuthor' in merged, false);
  const payload = await buildPayload(merged, MD, 'weixin', './assets/a.png', crop, new Map());
  assert.equal(payload.author, undefined);
  assert.equal(payload.sourceUrl, undefined);
});

test('哪些平台有「单独封面」入口：仅公众号（小红书/抖音后台自带封面裁切，不再设单独封面入口）', () => {
  const eligible = PLATFORM_SPECS.filter(ownCoverEligible).map((s) => s.id);
  assert.deepEqual(eligible, ['weixin']);
});

test('公众号封面：单独封面优先，其次通用封面，再次正文首图；单独封面只给公众号', () => {
  assert.deepEqual(draft().ownCovers, {});
  const own = draft({ coverUpload: 'assets/g.jpg', ownCovers: setOwnCover(draft(), 'weixin', 'assets/wx.jpg') });
  assert.deepEqual(own.ownCovers.weixin, { cover: 'assets/wx.jpg', focus: { x: 50, y: 50 } });
  assert.deepEqual(coverFor(own, wx, './assets/a.png'), { kind: 'upload', src: 'assets/wx.jpg' });
  assert.deepEqual(coverFor(draft({ coverUpload: 'assets/g.jpg' }), wx, './assets/a.png'), { kind: 'upload', src: 'assets/g.jpg' });
  assert.deepEqual(coverFor(draft(), wx, './assets/a.png'), { kind: 'body', src: './assets/a.png' });
  assert.deepEqual(coverFor(own, SPEC_BY_ID.zhihu!, ''), { kind: 'upload', src: 'assets/g.jpg' });
  assert.deepEqual(coverFor(draft({ ownCovers: own.ownCovers }), SPEC_BY_ID.zhihu!, ''), { kind: 'none' });
  // 正文没图、没通用封面，但有公众号单独封面：不报缺封面
  assert.deepEqual(checkPlatform(draft({ ownCovers: own.ownCovers }), wx, true, ''), []);
  // 比例和通用封面相同的平台（知乎 16:9）即使存了单独封面也不用
  const zhOwn = draft({ coverUpload: 'assets/g.jpg', ownCovers: { zhihu: { cover: 'assets/zh.jpg', focus: { x: 1, y: 1 } } } });
  assert.deepEqual(coverFor(zhOwn, SPEC_BY_ID.zhihu!, ''), { kind: 'upload', src: 'assets/g.jpg' });
});

test('推送：公众号按单独封面的焦点裁 2.35:1 与 1:1；其他平台仍用通用封面与它的焦点；不设单独封面时公众号用通用封面', async () => {
  const d = draft({ coverUpload: 'assets/g.jpg', coverFocus: { x: 60, y: 70 }, ownCovers: { weixin: { cover: 'assets/wx.jpg', focus: { x: 20, y: 30 } } } });
  assert.deepEqual(coverFocusFor(d, wx), { x: 20, y: 30 });
  const cache = new Map();
  const p = await buildPayload(d, MD, 'weixin', './assets/a.png', crop, cache);
  assert.equal(p.coverImageUrl, 'assets/wx.jpg@2.35:1@20,30');
  assert.equal(p.weixinSquareCoverImagePath, 'assets/wx.jpg@1:1@20,30');
  const zh = await buildPayload(d, MD, 'zhihu', './assets/a.png', crop, cache);
  assert.equal(zh.coverImageUrl, 'assets/g.jpg@16:9@60,70');
  const common = await buildPayload(draft({ coverUpload: 'assets/g.jpg', coverFocus: { x: 60, y: 70 } }), MD, 'weixin', './assets/a.png', crop, new Map());
  assert.equal(common.coverImageUrl, 'assets/g.jpg@2.35:1@60,70');
  assert.equal(common.weixinSquareCoverImagePath, 'assets/g.jpg@1:1@60,70');
});

test('小红书/抖音：直接用通用封面原图插到卡片最前，不做 3:4 裁剪', async () => {
  const d = draft({ coverUpload: 'assets/g.jpg', ownCovers: setOwnCover(draft(), 'xiaohongshu', 'assets/xhs.jpg') });
  const cache = new Map();
  assert.equal((await buildPayload(d, MD, 'xiaohongshu', '', crop, cache)).socialCoverImagePath, 'assets/g.jpg');
  assert.equal((await buildPayload(d, MD, 'douyin', '', crop, cache)).socialCoverImagePath, 'assets/g.jpg');
});

test('迁移：旧版本记住的公众号单独封面与焦点保留下来；旧版小红书/抖音分区上传的封面也保留给这两个平台', () => {
  const legacy: Record<string, unknown> = {
    weixin: { cover: 'assets/wx.jpg', focus: { x: 10, y: 90 } },
    social: { title: 'T', cover: 'assets/xhs.jpg' },
  };
  const merged = mergeSaved(draft(), legacy as Partial<PublishDraft>);
  assert.deepEqual(merged.ownCovers.weixin, { cover: 'assets/wx.jpg', focus: { x: 10, y: 90 } });
  assert.deepEqual(merged.ownCovers.xiaohongshu, { cover: 'assets/xhs.jpg', focus: { x: 50, y: 50 } });
  assert.deepEqual(merged.ownCovers.douyin, { cover: 'assets/xhs.jpg', focus: { x: 50, y: 50 } });
  for (const k of ['weixin', 'social']) assert.equal(k in merged, false, k);
  assert.deepEqual(coverFor(merged, wx, ''), { kind: 'upload', src: 'assets/wx.jpg' });
  // 旧版没传过单独封面（空字符串）：不生成单独封面
  const empty = mergeSaved(draft(), { weixin: { cover: '', focus: { x: 50, y: 50 } }, social: { cover: '' } } as unknown as Partial<PublishDraft>);
  assert.deepEqual(empty.ownCovers, {});
  // 新版本已存的单独封面不会被旧字段覆盖
  const both = mergeSaved(draft(), { ownCovers: { weixin: { cover: 'assets/new.jpg', focus: { x: 1, y: 2 } } }, weixin: { cover: 'assets/wx.jpg', focus: { x: 10, y: 90 } } } as unknown as Partial<PublishDraft>);
  assert.equal(both.ownCovers.weixin?.cover, 'assets/new.jpg');
});
