import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlatformId } from '@vcat/shared';
import { selectPushable } from '../src/renderer/src/features/publish-flow/platformSelection.ts';

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
