import assert from 'node:assert/strict';
import test from 'node:test';
import type { MultiPlatformPublishResultItem } from '@vcat/shared';
import { DRAFT_LINKS, confirmDraftDelivered, withDraftLink } from '../src/main/draftLinks.ts';

const ok = (p: Partial<MultiPlatformPublishResultItem>): MultiPlatformPublishResultItem => ({ platformId: 'juejin', ok: true, mode: 'draft', message: '', ...p });

test('拿到草稿 id 时「打开草稿」指向这篇草稿的编辑页（掘金 /editor/drafts/<id>）', () => {
  const r = withDraftLink(ok({ postId: '7441', url: 'https://juejin.cn/editor/drafts/7441' }));
  assert.equal(r.url, 'https://juejin.cn/editor/drafts/7441');
  assert.equal(r.urlKind, 'draft');
});

test('适配器给了 id 但没给 URL：按表拼出编辑页', () => {
  const r = withDraftLink(ok({ postId: '7441' }));
  assert.equal(r.url, 'https://juejin.cn/editor/drafts/7441');
  assert.equal(r.urlKind, 'draft');
});

test('没有草稿 id 时才退回草稿列表页，并标记为 list', () => {
  const r = withDraftLink(ok({ platformId: 'xiaohongshu', url: 'https://creator.xiaohongshu.com/publish/publish?target=image' }));
  assert.equal(r.urlKind, 'list');
  assert.equal(r.url, DRAFT_LINKS.xiaohongshu?.list);
});

test('失败的推送不给任何打开链接', () => {
  const r = withDraftLink(ok({ ok: false, url: 'https://juejin.cn/creator/content/article/drafts' }));
  assert.equal(r.url, undefined);
  assert.equal(r.urlKind, undefined);
});

test('每个草稿平台都有列表页兜底；有 id 的平台编辑页模板与适配器一致', () => {
  for (const id of ['weixin', 'juejin', 'csdn', 'zhihu', 'cnblogs', 'baijiahao', 'weibo', 'bilibili', 'xiaohongshu', 'douyin'] as const) {
    assert.match(DRAFT_LINKS[id]?.list ?? '', /^https:\/\//, id);
  }
  assert.equal(DRAFT_LINKS.csdn?.edit?.('9'), 'https://editor.csdn.net/md?articleId=9');
  assert.equal(DRAFT_LINKS.zhihu?.edit?.('9'), 'https://zhuanlan.zhihu.com/p/9/edit');
  assert.equal(DRAFT_LINKS.cnblogs?.edit?.('9'), 'https://i.cnblogs.com/posts/edit;postId=9');
  assert.equal(DRAFT_LINKS.douyin?.list, 'https://creator.douyin.com/creator-micro/content/upload?default-tab=3');
});

test('推送后回查草稿：查不到时不算假成功，提示可能有延迟；回查超时同样处理', async () => {
  assert.deepEqual(await confirmDraftDelivered(async () => true, 50), { verified: true, note: '' });
  const miss = await confirmDraftDelivered(async () => false, 50);
  assert.equal(miss.verified, false);
  assert.match(miss.note, /草稿箱暂未查到/);
  const slow = await confirmDraftDelivered(() => new Promise((r) => setTimeout(() => r(true), 500)), 50);
  assert.equal(slow.verified, false);
});
