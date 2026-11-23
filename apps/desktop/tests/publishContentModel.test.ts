import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlatformId } from '@vcat/shared';
import { checkPlatform, coverFor, createDraft, mergeSaved, resolveFor, type PublishDraft } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { PLATFORM_SPECS, SPEC_BY_ID, generalCoverHint } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';
import { buildPayload, type CoverCropper } from '../src/renderer/src/features/publish-flow/runPublish.ts';

const MD = '# 一篇关于多平台内容分发流程设计与实现的长文\n\n正文。\n\n![图](./assets/a.png)\n';
const LONG = '一篇关于多平台内容分发流程设计与实现的长文';
const draft = (patch: Partial<PublishDraft> = {}): PublishDraft => ({ ...createDraft(MD, 'f', '摘要'), tags: ['独立开发', '效率'], ...patch });
const specs = (...ids: PlatformId[]) => PLATFORM_SPECS.filter((s) => ids.includes(s.id));
const crop: CoverCropper = async (src, ratio) => `${src}@${ratio}`;

test('小红书/抖音：标题默认从通用标题截取到 20 字，话题默认用通用标签；单独填写后用自己的', () => {
  const d = draft();
  assert.equal(d.title, LONG);
  for (const id of ['xiaohongshu', 'douyin'] as const) {
    const v = resolveFor(d, id);
    assert.equal(v.title, [...LONG].slice(0, 20).join(''));
    assert.deepEqual(v.tags, ['独立开发', '效率']);
    assert.deepEqual(checkPlatform(d, SPEC_BY_ID[id]!, true), [], '默认截取后不应报标题超长');
  }
  const own = draft({ social: { title: '自己的短标题', topics: ['小红书话题'], body: '纯文本正文', cover: '' } });
  assert.deepEqual(resolveFor(own, 'douyin').tags, ['小红书话题']);
  assert.equal(resolveFor(own, 'xiaohongshu').title, '自己的短标题');
  // 其他平台只用通用值
  assert.equal(resolveFor(own, 'zhihu').title, LONG);
  assert.deepEqual(resolveFor(own, 'zhihu').tags, ['独立开发', '效率']);
});

test('小红书/抖音封面只认它们分区里上传的图（插到第一张卡前），与通用封面分开', () => {
  const d = draft({ coverUpload: 'assets/general.jpg', social: { cover: 'assets/xhs.jpg' } });
  assert.deepEqual(coverFor(d, SPEC_BY_ID.xiaohongshu!, ''), { kind: 'upload', src: 'assets/xhs.jpg' });
  assert.deepEqual(coverFor(d, SPEC_BY_ID.zhihu!, ''), { kind: 'upload', src: 'assets/general.jpg' });
});

test('推送内容：公众号不带作者与阅读原文；小红书带自己的标题/正文/话题/封面；知乎只用通用值', async () => {
  const d = draft({
    coverUpload: 'assets/general.jpg',
    social: { title: '卡片标题', body: '  我自己写的正文  ', topics: ['话题'], cover: 'assets/xhs.jpg' },
  });
  const cache = new Map();
  const wx = await buildPayload(d, MD, 'weixin', './assets/a.png', crop, cache);
  assert.equal(wx.author, undefined);
  assert.equal(wx.sourceUrl, undefined);
  const zh = await buildPayload(d, MD, 'zhihu', './assets/a.png', crop, cache);
  assert.equal(zh.author, undefined);
  assert.equal(zh.sourceUrl, undefined);
  assert.equal(zh.title, LONG);
  assert.equal(zh.coverImageUrl, 'assets/general.jpg@16:9');
  const xhs = await buildPayload(d, MD, 'xiaohongshu', './assets/a.png', crop, cache);
  assert.equal(xhs.title, '卡片标题');
  assert.equal(xhs.socialBody, '我自己写的正文');
  assert.deepEqual(xhs.tags, ['话题']);
  assert.equal(xhs.socialCoverImagePath, 'assets/xhs.jpg@3:4');
  // 没填正文：不传 socialBody，由主进程从正文生成纯文本
  const plain = await buildPayload(draft(), MD, 'douyin', '', crop, new Map());
  assert.equal(plain.socialBody, undefined);
  assert.equal(plain.socialCoverImagePath, undefined);
});

test('通用封面只留一句短提示，比例取自 platformSpecs；没有需要自动裁的平台时不显示', () => {
  assert.equal(generalCoverHint(specs('weixin', 'zhihu', 'baijiahao', 'xiaohongshu')), '其他平台按需自动裁 16:9');
  assert.equal(generalCoverHint(specs('weixin', 'xiaohongshu', 'cnblogs')), null);
});

test('合并本地记住的设置：保留小红书抖音分区，丢弃旧版的公众号作者/阅读原文', () => {
  const legacy: Record<string, unknown> = { weixinAuthor: 'A', weixinSourceUrl: 'https://x', social: { title: 'T', cover: '' } };
  const merged = mergeSaved(draft(), legacy as Partial<PublishDraft>);
  assert.equal('weixinAuthor' in merged, false);
  assert.equal('weixinSourceUrl' in merged, false);
  assert.equal(merged.social.title, 'T');
});
