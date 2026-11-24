import assert from 'node:assert/strict';
import test from 'node:test';
import { JUEJIN_CATEGORIES } from '@vcat/adapters';
import { fetchJuejinCategories } from '../src/main/juejinCategoryRuntime.ts';

test('fetchJuejinCategories 成功时返回远端新分类列表', async () => {
  const remote = [
    { id: 'live-1', name: '云原生' },
    { id: 'live-2', name: 'AI 工程' },
  ];
  const res = await fetchJuejinCategories(async () => remote, 500);
  assert.deepEqual(res, remote);
});

test('fetchJuejinCategories 接口返回空、报错或超时时退回内置 JUEJIN_CATEGORIES 且不抛异常', async () => {
  const fromEmpty = await fetchJuejinCategories(async () => [], 500);
  assert.deepEqual(fromEmpty, [...JUEJIN_CATEGORIES]);

  const fromError = await fetchJuejinCategories(async () => {
    throw new Error('network down');
  }, 500);
  assert.deepEqual(fromError, [...JUEJIN_CATEGORIES]);

  const fromTimeout = await fetchJuejinCategories(
    () => new Promise((resolve) => setTimeout(() => resolve([{ id: 'late', name: '太慢' }]), 200)),
    20
  );
  assert.deepEqual(fromTimeout, [...JUEJIN_CATEGORIES]);
});
