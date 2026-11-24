import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPlatform, coverFor, createDraft, mergeSaved, type PublishDraft } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { SPEC_BY_ID } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';
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

test('公众号封面只有一份：通用封面优先，没传就用正文首图', () => {
  assert.deepEqual(coverFor(draft({ coverUpload: 'assets/g.jpg' }), wx, './assets/a.png'), { kind: 'upload', src: 'assets/g.jpg' });
  assert.deepEqual(coverFor(draft(), wx, './assets/a.png'), { kind: 'body', src: './assets/a.png' });
  assert.deepEqual(checkPlatform(draft(), wx, true, '').map((i) => i.message), ['缺封面']);
});

test('推送：公众号按通用封面的焦点裁 2.35:1 与 1:1，和其他平台同一个焦点', async () => {
  const d = draft({ coverUpload: 'assets/g.jpg', coverFocus: { x: 20, y: 30 } });
  const cache = new Map();
  const p = await buildPayload(d, MD, 'weixin', './assets/a.png', crop, cache);
  assert.equal(p.coverImageUrl, 'assets/g.jpg@2.35:1@20,30');
  assert.equal(p.weixinSquareCoverImagePath, 'assets/g.jpg@1:1@20,30');
  const zh = await buildPayload(d, MD, 'zhihu', './assets/a.png', crop, cache);
  assert.equal(zh.coverImageUrl, 'assets/g.jpg@16:9@20,30');
});

test('合并本地记住的设置：旧版公众号块单独上传的封面丢弃，改用通用封面 / 正文首图', () => {
  const merged = mergeSaved(draft(), { weixin: { cover: 'assets/wx.jpg', focus: { x: 10, y: 90 } } } as Partial<PublishDraft>);
  assert.equal('weixin' in merged, false);
  assert.deepEqual(coverFor(merged, wx, './assets/a.png'), { kind: 'body', src: './assets/a.png' });
});
