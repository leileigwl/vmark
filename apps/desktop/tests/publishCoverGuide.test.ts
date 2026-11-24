import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlatformId } from '@vcat/shared';
import { checkPlatform, createDraft } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { COVER_RATIO_HINT, PLATFORM_SPECS, SPEC_BY_ID, coverGuide, coverGuideLines } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';

const specs = (...ids: PlatformId[]) => PLATFORM_SPECS.filter((s) => ids.includes(s.id));
const text = (l: ReturnType<typeof coverGuideLines>[number]) =>
  `${l.names.join('、')}：${l.required ? '必需' : '可选'} · ${l.slots.map((s) => (s.label ? `${s.label} ${s.ratio}` : s.ratio)).join(' + ')} · ${l.fallback}${l.needUpload ? ' · 需上传' : ''}`;

test('封面指引：每种平台的文案与比例都来自 platformSpecs', () => {
  const lines = coverGuideLines(specs('weixin', 'xiaohongshu', 'douyin', 'zhihu', 'juejin', 'csdn', 'bilibili', 'baijiahao', 'weibo'), './a.png');
  assert.deepEqual(lines.map(text), [
    '公众号：可选 · 列表大图 2.35:1 + 转发小图 1:1 · 不传用正文首图自动裁',
    '知乎、掘金、CSDN、B 站：可选 · 列表右侧小图 16:9 · 不传就不放',
    '百家号、微博：必需 · 16:9 · 不传用正文首图',
    '小红书、抖音：可选 · 第一张卡片就是封面 3:4 · 传了插到卡片最前',
  ]);
  // 比例与 spec.cover.ratios 一致，不另写一份
  for (const l of lines) for (const id of l.ids) assert.deepEqual(l.slots.map((s) => s.ratio), SPEC_BY_ID[id]?.cover?.ratios);
});

test('封面指引：博客园 / GitHub 博客不显示；只勾一个平台只列一行', () => {
  assert.deepEqual(coverGuideLines(specs('cnblogs', 'github_static'), './a.png'), []);
  assert.equal(coverGuide(SPEC_BY_ID.cnblogs!, ''), null);
  assert.deepEqual(coverGuideLines(specs('cnblogs', 'zhihu'), '').map(text), ['知乎：可选 · 列表右侧小图 16:9 · 不传就不放']);
});

test('封面指引：正文无图时必需平台标「需上传」，可选的知乎/卡片平台不标', () => {
  const lines = coverGuideLines(specs('baijiahao', 'weibo', 'zhihu', 'xiaohongshu'), '');
  const by = Object.fromEntries(lines.map((l) => [l.names.join('、'), l.needUpload]));
  assert.deepEqual(by, { '知乎': false, '百家号、微博': true, '小红书': false });
  assert.equal(coverGuideLines(specs('baijiahao'), './a.png')[0].needUpload, false);
});

test('封面指引与校验同源：标「需上传」的平台，checkPlatform 一定报缺封面（会出现在“需要单独处理”）', () => {
  const d = createDraft('# 无图\n\n文字', 'f', '摘要');
  for (const s of PLATFORM_SPECS) {
    const g = coverGuide(s, '');
    const missing = checkPlatform(d, s, true, '').some((i) => i.field === 'cover');
    assert.equal(Boolean(g?.needUpload), missing, s.id);
  }
});

test('比例悬停提示文案', () => {
  assert.equal(COVER_RATIO_HINT, '按平台常见显示方式，未逐个后台核对');
});
