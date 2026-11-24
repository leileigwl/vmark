import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPlatform, createDraft, mergeSaved } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { SPEC_BY_ID, requirementText } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';
import { buildPayload, type CoverCropper } from '../src/renderer/src/features/publish-flow/runPublish.ts';
import { buildJuejinPush } from '../src/main/publishJuejinDraft.ts';

const MD = '# 一篇文章\n\n正文开头。\n';
const DIGEST = '这是一段专门为掘金准备的摘要，长度需要落在五十到一百字之间，所以这里多写几句，说明这篇文章讲的是多平台发布流程的设计与实现。';
const juejin = SPEC_BY_ID.juejin!;
const noCrop: CoverCropper = async (src) => src;

test('掘金没选分类时报“缺分类”，选了之后不再报；规则说明写明分类必选', () => {
  const d = { ...createDraft(MD, 'f', DIGEST), tags: ['前端'] };
  assert.deepEqual(checkPlatform(d, juejin, true).map((i) => [i.field, i.message]), [['category', '缺分类']]);
  assert.deepEqual(checkPlatform({ ...d, juejinCategoryId: '6809637767543259144' }, juejin, true), []);
  assert.deepEqual(checkPlatform(d, SPEC_BY_ID.zhihu!, true), []);
  assert.match(requirementText(juejin), /分类必选/);
});

test('所选分类只随掘金的推送内容走，并被本地记住', async () => {
  const d = { ...createDraft(MD, 'f', DIGEST), juejinCategoryId: '6809637767543259144' };
  assert.equal((await buildPayload(d, MD, 'juejin', '', noCrop, new Map())).juejinCategoryId, '6809637767543259144');
  assert.equal((await buildPayload(d, MD, 'weixin', '', noCrop, new Map())).juejinCategoryId, undefined);
  assert.equal(mergeSaved(createDraft(MD, 'f', ''), { juejinCategoryId: '6809637769959178254' }).juejinCategoryId, '6809637769959178254');
});

test('主进程：掘金推送带上分类、摘要和标签', () => {
  const push = buildJuejinPush(
    { title: 'T', markdown: 'raw', digest: DIGEST, tags: ['前端'], juejinCategoryId: '6809637767543259144', targets: [{ platformId: 'juejin', mode: 'draft' }] },
    'uploaded'
  );
  assert.deepEqual(push, { title: 'T', markdown: 'uploaded', html: '', tags: ['前端'], digest: DIGEST, categoryId: '6809637767543259144', mode: 'draft' });
});
