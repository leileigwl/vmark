import assert from 'node:assert/strict';
import test from 'node:test';
import { JUEJIN_CATEGORIES, JuejinAdapter } from './juejin.ts';
import type { FetchLike } from './weixin.ts';

type Call = { url: string; init?: RequestInit };

function mock(handler: (url: string, init?: RequestInit) => unknown, calls: Call[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    const body = handler(url, init);
    return { ok: body !== undefined, status: body === undefined ? 500 : 200, text: async () => '', json: async () => body };
  };
}

test('JuejinAdapter.listCategories: POST query_category_list 并返回 id + 名称', async () => {
  const calls: Call[] = [];
  const adapter = new JuejinAdapter({
    fetchFn: mock(
      () => ({
        err_no: 0,
        data: [
          { category_id: '6809637767543259144', category: { category_name: '前端' } },
          { category_id: '6809637769959178254', category: { category_name: '后端' } },
        ],
      }),
      calls
    ),
  });
  const list = await adapter.listCategories();
  assert.deepEqual(list, [
    { id: '6809637767543259144', name: '前端' },
    { id: '6809637769959178254', name: '后端' },
  ]);
  assert.equal(calls[0].url, 'https://api.juejin.cn/tag_api/v1/query_category_list');
  assert.equal(calls[0].init?.method, 'POST');
});

test('JuejinAdapter.listCategories: 接口失败或返回空时退回内置分类表', async () => {
  const failing = new JuejinAdapter({ fetchFn: mock(() => undefined) });
  assert.deepEqual(await failing.listCategories(), JUEJIN_CATEGORIES);
  const errNo = new JuejinAdapter({ fetchFn: mock(() => ({ err_no: 2, err_msg: '请求路由不存在', data: '' })) });
  assert.deepEqual(await errNo.listCategories(), JUEJIN_CATEGORIES);
});

test('JUEJIN_CATEGORIES: 与 2026-11-23 公开接口返回的 8 个分类一致', () => {
  assert.equal(JUEJIN_CATEGORIES.length, 8);
  assert.ok(JUEJIN_CATEGORIES.some((c) => c.id === '6809637767543259144' && c.name === '前端'));
  assert.ok(JUEJIN_CATEGORIES.every((c) => /^\d{19}$/.test(c.id)));
});

test('JuejinAdapter.push: 草稿创建请求带上所选分类 category_id', async () => {
  let sent: Record<string, unknown> = {};
  const adapter = new JuejinAdapter({
    fetchFn: mock((url, init) => {
      if (url.endsWith('/article_draft/create')) {
        sent = JSON.parse(String(init?.body));
        return { err_no: 0, data: { id: '7300' } };
      }
      return {};
    }),
  });
  const res = await adapter.push({ title: 't', markdown: 'm', html: '', tags: [], mode: 'draft', categoryId: '6809637767543259144' });
  assert.equal(sent.category_id, '6809637767543259144');
  assert.equal(res.postId, '7300');
});
