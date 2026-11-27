import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkPlatform,
  coverFor,
  createDraft,
  firstBodyImage,
  mergeSaved,
  setOverride,
  type PublishDraft,
} from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { PLATFORM_SPECS, SPEC_BY_ID, requirementText, type PlatformSpec } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';
import { buildPayload, type CoverCropper } from '../src/renderer/src/features/publish-flow/runPublish.ts';

const spec = (id: string): PlatformSpec => {
  const s = SPEC_BY_ID[id as keyof typeof SPEC_BY_ID];
  assert.ok(s, id);
  return s;
};
const MD = '# 一篇文章\n\n正文开头。\n\n![图](./assets/a.png)\n';
const draft = (patch: Partial<PublishDraft> = {}): PublishDraft => ({ ...createDraft(MD, 'f', '摘要'), ...patch });

test('问题是短句：掘金“摘要差 N 字”“缺标签”，小红书“标题超 N 字”', () => {
  const d = draft({ digest: '一'.repeat(38), title: '一二三四五六七八九十一二三四五六七八九十一二' });
  assert.deepEqual(checkPlatform(d, spec('juejin'), true).map((i) => i.message), ['摘要差 12 字', '缺标签', '缺分类']);
  // 小红书标题默认从通用标题截取，只提示不挡推送；用户在小红书行里自己改写的超长才报错
  assert.deepEqual(checkPlatform(d, spec('xiaohongshu'), true).map((i) => [i.level, i.message]), [['warn', '标题超 2 字（自动截取）']]);
  assert.deepEqual(checkPlatform({ ...d, overrides: { xiaohongshu: { title: d.title } } }, spec('xiaohongshu'), true).map((i) => [i.level, i.message]), [['error', '标题超 2 字']]);
  assert.deepEqual(checkPlatform(d, spec('zhihu'), false).map((i) => i.message), ['未登录']);
  assert.deepEqual(checkPlatform(d, spec('github_static'), false), []);
});

test('封面默认值按平台：公众号/百家号/微博用正文首图，知乎等不设，卡片用第一张卡，博客园没有封面项；上传后全部用通用封面', () => {
  const body = firstBodyImage(MD);
  assert.equal(body, './assets/a.png');
  const d = draft();
  assert.deepEqual(coverFor(d, spec('weixin'), body), { kind: 'body', src: body });
  assert.deepEqual(coverFor(d, spec('baijiahao'), body), { kind: 'body', src: body });
  assert.deepEqual(coverFor(d, spec('weibo'), body), { kind: 'body', src: body });
  for (const id of ['zhihu', 'juejin', 'csdn', 'bilibili']) assert.deepEqual(coverFor(d, spec(id), body), { kind: 'none' });
  for (const id of ['xiaohongshu', 'douyin']) assert.deepEqual(coverFor(d, spec(id), body), { kind: 'card' });
  assert.equal(coverFor(d, spec('cnblogs'), body), null);
  assert.equal(coverFor(d, spec('github_static'), body), null);
  const up = draft({ coverUpload: 'assets/up.jpg' });
  for (const id of ['weixin', 'zhihu']) assert.deepEqual(coverFor(up, spec(id), body), { kind: 'upload', src: 'assets/up.jpg' });
  // 小红书/抖音也用通用封面：插到卡片最前
  for (const id of ['xiaohongshu', 'douyin']) assert.deepEqual(coverFor(up, spec(id), body), { kind: 'upload', src: 'assets/up.jpg' });
});

test('正文没图又没上传：公众号/百家号缺封面，知乎不报', () => {
  const d = draft();
  assert.deepEqual(checkPlatform(d, spec('weixin'), true, '').map((i) => i.message), ['缺封面']);
  assert.ok(checkPlatform(d, spec('baijiahao'), true, '').some((i) => i.field === 'cover' && i.message === '缺封面（16:9 必需）'));
  assert.deepEqual(checkPlatform(d, spec('zhihu'), true, ''), []);
  assert.deepEqual(checkPlatform(draft({ coverUpload: 'assets/up.jpg' }), spec('weixin'), true, ''), []);
});

test('单独改写与通用值相同时自动清掉，不留“改过”的痕迹', () => {
  const d = draft();
  const o1 = setOverride(d, 'xiaohongshu', { title: '短标题' });
  assert.deepEqual(o1, { xiaohongshu: { title: '短标题' } });
  const o2 = setOverride({ ...d, overrides: o1 }, 'xiaohongshu', { title: d.title });
  assert.deepEqual(o2, {});
});

test('合并本地记住的设置时丢弃旧字段与未知平台', () => {
  const saved = { title: '记住的标题', coverSource: 'x.png', coverCrops: { '16:9': 'y' }, selected: ['zhihu', 'nope'] } as unknown as Partial<PublishDraft>;
  const merged = mergeSaved(draft(), saved);
  assert.equal(merged.title, '记住的标题');
  assert.deepEqual(merged.selected, ['zhihu']);
  assert.ok(!('coverSource' in merged));
  assert.ok(!('coverCrops' in merged));
});

test('推送内容：上传封面按平台比例裁一次并复用；卡片平台直接带通用封面原图（平台自带裁切）', async () => {
  const crops: string[] = [];
  const crop: CoverCropper = async (_src, ratio) => {
    crops.push(ratio);
    return `assets/crop-${ratio}.jpg`;
  };
  const cache = new Map();
  const d = draft({ coverUpload: 'assets/up.jpg' });
  const zhihu = await buildPayload(d, MD, 'zhihu', './assets/a.png', crop, cache);
  const csdn = await buildPayload(d, MD, 'csdn', './assets/a.png', crop, cache);
  const wx = await buildPayload(d, MD, 'weixin', './assets/a.png', crop, cache);
  const xhs = await buildPayload(d, MD, 'xiaohongshu', './assets/a.png', crop, cache);
  assert.equal(zhihu.coverImageUrl, 'assets/crop-16:9.jpg');
  assert.equal(csdn.coverImageUrl, 'assets/crop-16:9.jpg');
  assert.equal(wx.coverImageUrl, 'assets/crop-2.35:1.jpg');
  assert.equal(xhs.coverImageUrl, undefined);
  assert.equal(xhs.socialCoverImagePath, 'assets/up.jpg');
  assert.equal(xhs.socialCoverRatio, '3:4');
  assert.deepEqual(crops, ['16:9', '2.35:1', '1:1']);
  assert.equal(wx.targets[0].mode, 'draft');
});

test('推送内容：没上传时公众号带正文首图，知乎不带，小红书不插封面；裁剪失败退回原图', async () => {
  const d = draft();
  const failCrop: CoverCropper = async () => {
    throw new Error('canvas');
  };
  const cache = new Map();
  assert.equal((await buildPayload(d, MD, 'weixin', './assets/a.png', failCrop, cache)).coverImageUrl, './assets/a.png');
  assert.equal((await buildPayload(d, MD, 'zhihu', './assets/a.png', failCrop, cache)).coverImageUrl, undefined);
  assert.equal((await buildPayload(d, MD, 'xiaohongshu', './assets/a.png', failCrop, cache)).socialCoverImagePath, undefined);
  const up = draft({ coverUpload: 'assets/up.jpg' });
  assert.equal((await buildPayload(up, MD, 'zhihu', '', failCrop, new Map())).coverImageUrl, 'assets/up.jpg');
});

test('除 GitHub 博客外全部默认推草稿箱；规则说明可读', () => {
  for (const s of PLATFORM_SPECS) assert.equal(s.mode, s.id === 'github_static' ? 'direct' : 'draft', s.id);
  assert.match(requirementText(spec('juejin')), /摘要必填 50–100 字/);
  assert.match(requirementText(spec('weixin')), /2\.35:1.*1:1/);
});
