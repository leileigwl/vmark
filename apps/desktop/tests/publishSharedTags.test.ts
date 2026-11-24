import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPlatform, createDraft, resolveFor, setOverride, type PublishDraft } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { SPEC_BY_ID } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';
import { buildPayload, type CoverCropper } from '../src/renderer/src/features/publish-flow/runPublish.ts';

const MD = '# 标题够长的一篇文章\n\n正文。\n\n![图](./assets/a.png)\n';
const DIGEST = '这是一段写给掘金的摘要，长度刚好落在五十到一百字之间，所以这里多写几句话，说明这篇文章讲的是多平台发布流程的设计。';
const TAGS = ['前端', '工具', '效率', 'React', 'Electron'];
const crop: CoverCropper = async (src) => src;
const draft = (patch: Partial<PublishDraft> = {}): PublishDraft => ({ ...createDraft(MD, 'f', DIGEST), tags: TAGS, juejinCategoryId: 'c', ...patch });

test('通用标签一份：超过掘金 3 个上限只提示，默认取前 3 个，不挡推送', () => {
  const d = draft();
  assert.deepEqual(checkPlatform(d, SPEC_BY_ID.juejin!, true), [{ level: 'warn', field: 'tags', message: '标签超 2 个（取前 3 个）' }]);
  assert.deepEqual(resolveFor(d, 'juejin').tags, ['前端', '工具', '效率']);
  // 上限够的平台照用全部通用标签
  assert.deepEqual(resolveFor(d, 'csdn').tags, TAGS);
  assert.deepEqual(checkPlatform(d, SPEC_BY_ID.csdn!, true).filter((i) => i.field === 'tags'), []);
});

test('推送内容：掘金带截取后的 3 个标签，其他平台带全部通用标签', async () => {
  const d = draft();
  assert.deepEqual((await buildPayload(d, MD, 'juejin', '', crop, new Map())).tags, ['前端', '工具', '效率']);
  assert.deepEqual((await buildPayload(d, MD, 'bilibili', '', crop, new Map())).tags, TAGS);
});

test('在掘金行里挑选的标签按挑选的推送；挑选仍超上限才挡住', () => {
  const base = draft();
  const picked = { ...base, overrides: setOverride(base, 'juejin', { tags: ['React', 'Electron'] }) };
  assert.deepEqual(resolveFor(picked, 'juejin').tags, ['React', 'Electron']);
  assert.deepEqual(checkPlatform(picked, SPEC_BY_ID.juejin!, true), []);
  const tooMany = { ...base, overrides: setOverride(base, 'juejin', { tags: TAGS.slice(0, 4) }) };
  assert.deepEqual(checkPlatform(tooMany, SPEC_BY_ID.juejin!, true), [{ level: 'error', field: 'tags', message: '标签多 1 个' }]);
});

test('通用标签为空时掘金仍报「缺标签」（必填）', () => {
  assert.deepEqual(checkPlatform(draft({ tags: [] }), SPEC_BY_ID.juejin!, true), [{ level: 'error', field: 'tags', message: '缺标签' }]);
});
