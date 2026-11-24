import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlatformId } from '@vcat/shared';
import { checkPlatform, coverFor, createDraft, mergeSaved, resolveFor, setOverride, type PublishDraft } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { PLATFORM_SPECS, SPEC_BY_ID, coverGuide } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';
import { buildPayload, type CoverCropper } from '../src/renderer/src/features/publish-flow/runPublish.ts';

const MD = '# 一篇关于多平台内容分发流程设计与实现的长文\n\n正文。\n\n![图](./assets/a.png)\n';
const LONG = '一篇关于多平台内容分发流程设计与实现的长文';
const draft = (patch: Partial<PublishDraft> = {}): PublishDraft => ({ ...createDraft(MD, 'f', '摘要'), tags: ['独立开发', '效率'], ...patch });
const specs = (...ids: PlatformId[]) => PLATFORM_SPECS.filter((s) => ids.includes(s.id));
const crop: CoverCropper = async (src, ratio) => `${src}@${ratio}`;

test('小红书/抖音：标题超 20 字时截取前 20 字并提示（不挡推送），话题用通用标签；在平台行里改写后用改写的', () => {
  const d = draft();
  assert.equal(d.title, LONG);
  const over = [...LONG].length - 20;
  for (const id of ['xiaohongshu', 'douyin'] as const) {
    const v = resolveFor(d, id);
    assert.equal(v.title, [...LONG].slice(0, 20).join(''));
    assert.deepEqual(v.tags, ['独立开发', '效率']);
    assert.equal(v.digest, '', '正文留空，由主进程从文章转纯文本');
    assert.deepEqual(checkPlatform(d, SPEC_BY_ID[id]!, true).map((i) => [i.level, i.message]), [['warn', `标题超 ${over} 字（自动截取）`]]);
  }
  const own = draft({ overrides: setOverride(d, 'xiaohongshu', { title: '自己的短标题' }) });
  assert.equal(resolveFor(own, 'xiaohongshu').title, '自己的短标题');
  assert.deepEqual(checkPlatform(own, SPEC_BY_ID.xiaohongshu!, true), []);
  // 其他平台只用通用值
  assert.equal(resolveFor(own, 'zhihu').title, LONG);
  assert.deepEqual(resolveFor(own, 'zhihu').tags, ['独立开发', '效率']);
});

test('小红书/抖音封面用通用封面（插到第一张卡前）；没传就第一张卡片做封面', () => {
  const d = draft({ coverUpload: 'assets/general.jpg' });
  assert.deepEqual(coverFor(d, SPEC_BY_ID.xiaohongshu!, ''), { kind: 'upload', src: 'assets/general.jpg' });
  assert.deepEqual(coverFor(d, SPEC_BY_ID.zhihu!, ''), { kind: 'upload', src: 'assets/general.jpg' });
  assert.deepEqual(coverFor(draft(), SPEC_BY_ID.douyin!, './assets/a.png'), { kind: 'card' });
});

test('推送内容：公众号不带作者与阅读原文；小红书用截取后的通用标题、通用标签、通用封面（按焦点裁 3:4），不传正文；知乎只用通用值', async () => {
  const d = draft({ coverUpload: 'assets/general.jpg', coverFocus: { x: 30, y: 40 } });
  const crop2: CoverCropper = async (src, ratio, f) => `${src}@${ratio}@${f.x},${f.y}`;
  const cache = new Map();
  const wx = await buildPayload(d, MD, 'weixin', './assets/a.png', crop2, cache);
  assert.equal(wx.author, undefined);
  assert.equal(wx.sourceUrl, undefined);
  const zh = await buildPayload(d, MD, 'zhihu', './assets/a.png', crop2, cache);
  assert.equal(zh.title, LONG);
  assert.equal(zh.coverImageUrl, 'assets/general.jpg@16:9@30,40');
  const xhs = await buildPayload(d, MD, 'xiaohongshu', './assets/a.png', crop2, cache);
  assert.equal(xhs.title, [...LONG].slice(0, 20).join(''));
  assert.equal(xhs.socialBody, undefined, '正文由主进程从文章生成纯文本');
  assert.deepEqual(xhs.tags, ['独立开发', '效率']);
  assert.equal(xhs.socialCoverImagePath, 'assets/general.jpg@3:4@30,40');
  assert.equal(xhs.coverImageUrl, undefined);
  // 没传通用封面：第一张卡片就是封面
  const plain = await buildPayload(draft(), MD, 'douyin', '', crop, new Map());
  assert.equal(plain.socialCoverImagePath, undefined);
});

test('各平台封面比例取自 platformSpecs：公众号 2.35:1 + 1:1，小红书/抖音 3:4，百家号/微博 16:9 必需', () => {
  assert.deepEqual(coverGuide(SPEC_BY_ID.weixin!, 'x')?.slots, [{ ratio: '2.35:1', label: '列表大图' }, { ratio: '1:1', label: '转发小图' }]);
  for (const s of specs('xiaohongshu', 'douyin')) assert.deepEqual(s.cover?.ratios, ['3:4']);
  for (const s of specs('baijiahao', 'weibo')) assert.deepEqual(s.cover, { ratios: ['16:9'], mode: 'required' });
});

test('合并本地记住的设置：丢弃旧版的公众号作者/阅读原文，以及小红书抖音、公众号单独填的标题/正文/话题/封面', () => {
  const legacy: Record<string, unknown> = {
    weixinAuthor: 'A',
    weixinSourceUrl: 'https://x',
    social: { title: 'T', body: 'B', topics: ['t'], cover: 'assets/xhs.jpg' },
    weixin: { cover: 'assets/wx.jpg', focus: { x: 10, y: 90 } },
    title: '记住的标题',
  };
  const merged = mergeSaved(draft(), legacy as Partial<PublishDraft>);
  for (const k of ['weixinAuthor', 'weixinSourceUrl', 'social', 'weixin']) assert.equal(k in merged, false, k);
  assert.equal(merged.title, '记住的标题');
  assert.deepEqual(coverFor(merged, SPEC_BY_ID.xiaohongshu!, ''), { kind: 'card' });
});
