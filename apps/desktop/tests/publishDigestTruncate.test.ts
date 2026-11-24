import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPlatform, createDraft, resolveFor, setOverride, type PublishDraft } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { SPEC_BY_ID } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';
import { buildPayload, type CoverCropper } from '../src/renderer/src/features/publish-flow/runPublish.ts';

const MD = '# 标题够长的一篇文章\n\n正文。\n\n![图](./assets/a.png)\n';
const crop: CoverCropper = async (src) => src;
const LONG_DIGEST = '这是一段写给所有平台共用的摘要，'.repeat(5); // 80 字
const draft = (patch: Partial<PublishDraft> = {}): PublishDraft => ({ ...createDraft(MD, 'f', LONG_DIGEST), tags: ['前端'], ...patch });
const chars = (s: string) => [...s].length;

test('通用摘要超过微博上限：只提示「摘要超 N 字」，不挡推送', () => {
  assert.equal(chars(LONG_DIGEST), 80);
  const issues = checkPlatform(draft(), SPEC_BY_ID.weibo!, true, './assets/a.png');
  assert.deepEqual(issues, [{ level: 'warn', field: 'digest', message: '摘要超 36 字（自动截取）' }]);
});

test('默认推送时自动截取到该平台上限（末尾省略号算在上限内）', async () => {
  const v = resolveFor(draft(), 'weibo');
  assert.equal(chars(v.digest), 44);
  assert.equal(v.digest, [...LONG_DIGEST].slice(0, 43).join('') + '…');
  const payload = await buildPayload(draft(), MD, 'weibo', './assets/a.png', crop, new Map());
  assert.equal(payload.digest, v.digest);
  // 没超限的平台原样不动
  assert.equal(resolveFor(draft(), 'csdn').digest, LONG_DIGEST);
  assert.deepEqual(checkPlatform(draft(), SPEC_BY_ID.csdn!, true, './assets/a.png').filter((i) => i.field === 'digest'), []);
});

test('掘金：通用摘要超 100 字自动截取，截取后仍满足 50 字下限，不再报错', () => {
  const d = draft({ digest: '掘'.repeat(130), juejinCategoryId: 'c' });
  const issues = checkPlatform(d, SPEC_BY_ID.juejin!, true);
  assert.deepEqual(issues, [{ level: 'warn', field: 'digest', message: '摘要超 30 字（自动截取）' }]);
  assert.equal(chars(resolveFor(d, 'juejin').digest), 100);
});

test('用户在平台行里单独改写的摘要按原样推送；改写仍超长时才挡住', () => {
  const base = draft();
  const own = { ...base, overrides: setOverride(base, 'weibo', { digest: '微博专用的短摘要' }) };
  assert.equal(resolveFor(own, 'weibo').digest, '微博专用的短摘要');
  assert.deepEqual(checkPlatform(own, SPEC_BY_ID.weibo!, true, './assets/a.png'), []);
  const tooLong = { ...base, overrides: setOverride(base, 'weibo', { digest: '长'.repeat(50) }) };
  assert.deepEqual(checkPlatform(tooLong, SPEC_BY_ID.weibo!, true, './assets/a.png'), [{ level: 'error', field: 'digest', message: '摘要超 6 字' }]);
});
