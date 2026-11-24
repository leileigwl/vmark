import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlatformId } from '@vcat/shared';
import { allPushableSelected, selectPushable, togglePushable } from '../src/renderer/src/features/publish-flow/platformSelection.ts';

const status = (signedIn: PlatformId[], checking: PlatformId[] = []) => (id: PlatformId) =>
  signedIn.includes(id) ? 'signedIn' : checking.includes(id) ? 'checking' : 'signedOut';

test('全选可推送：勾上所有已登录的草稿平台，未登录 / 检测中的不勾', () => {
  const next = selectPushable(['weixin'], status(['weixin', 'zhihu', 'xiaohongshu'], ['weibo']));
  assert.deepEqual(next, ['weixin', 'zhihu', 'xiaohongshu']);
});

test('全选可推送：已勾选但未登录的平台被取消（推不出去）；GitHub 博客会直接上线，不被自动勾上，已勾的保留', () => {
  assert.deepEqual(selectPushable(['csdn'], status(['zhihu'])), ['zhihu']);
  assert.deepEqual(selectPushable([], status(['zhihu'])), ['zhihu']);
  assert.deepEqual(selectPushable(['github_static'], status(['zhihu'])), ['zhihu', 'github_static']);
});

test('全选可推送是切换：已登录的都勾上时算「已全选」，再点全部取消；没全选时等同全选可推送', () => {
  const st = status(['weixin', 'zhihu']);
  assert.equal(allPushableSelected(['weixin'], st), false);
  assert.equal(allPushableSelected(['weixin', 'zhihu'], st), true);
  assert.equal(allPushableSelected(['weixin', 'zhihu', 'github_static'], st), true);
  assert.equal(allPushableSelected([], status([])), false);
  assert.deepEqual(togglePushable(['weixin'], st), ['weixin', 'zhihu']);
  assert.deepEqual(togglePushable(['weixin', 'zhihu'], st), []);
  assert.deepEqual(togglePushable(['weixin', 'zhihu', 'github_static'], st), []);
});
