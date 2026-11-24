import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPlatform, createDraft, type PublishDraft } from '../src/renderer/src/features/publish-flow/draftModel.ts';
import { SPEC_BY_ID, rowCoverHint } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';

const MD = '# 没有配图的文章标题够长\n\n只有文字。\n';
const draft = (patch: Partial<PublishDraft> = {}): PublishDraft => ({ ...createDraft(MD, 'f', '短摘要'), ...patch });

test('百家号/微博缺封面时在行里写明 16:9 必需；公众号缺封面仍是短句（比例在公众号块里）', () => {
  for (const id of ['baijiahao', 'weibo'] as const) {
    const cover = checkPlatform(draft(), SPEC_BY_ID[id]!, true, '').find((i) => i.field === 'cover');
    assert.deepEqual(cover, { level: 'error', field: 'cover', message: '缺封面（16:9 必需）' });
  }
  assert.equal(checkPlatform(draft(), SPEC_BY_ID.weixin!, true, '').find((i) => i.field === 'cover')?.message, '缺封面');
});

test('平台行里的封面提示：必需 16:9 的平台说明用哪张图裁，其余平台没有', () => {
  assert.equal(rowCoverHint(SPEC_BY_ID.baijiahao!, { kind: 'none' }), '封面必需 16:9 · 正文没有图片，请上传一张');
  assert.equal(rowCoverHint(SPEC_BY_ID.weibo!, { kind: 'body', src: 'a.png' }), '封面必需 16:9 · 用正文首图自动裁');
  assert.equal(rowCoverHint(SPEC_BY_ID.weibo!, { kind: 'upload', src: 'g.png' }), '封面必需 16:9 · 用通用封面按焦点裁');
  for (const id of ['zhihu', 'juejin', 'weixin', 'xiaohongshu', 'cnblogs'] as const) assert.equal(rowCoverHint(SPEC_BY_ID[id]!, { kind: 'none' }), null);
});
