import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CnblogsAdapter,
  ZhihuAdapter,
  JuejinAdapter,
  CsdnAdapter,
  BaijiahaoAdapter,
  WeixinAdapter,
  type FetchLike,
} from './index.ts';

const BENCHMARK_PAYLOAD = {
  title: '深入解析现代前端富文本与 AST 渲染管线',
  markdown: `---
title: "深入解析现代前端富文本与 AST 渲染管线"
tags: [前端架构, TypeScript, Markdown]
---
# 深入解析现代前端富文本与 AST 渲染管线
现代技术创作者通常面临严峻的内容分发割裂困境。
\`\`\`typescript
export function transform(): string { return 'ok'; }
\`\`\`
`,
  html: '<p>深入解析现代前端富文本与 AST 渲染管线</p>',
  tags: ['前端架构', 'TypeScript', 'Markdown'],
};

test('Benchmark Publishing: verifies draft payload structures across authorized platforms', async () => {
  // 1. Zhihu Draft
  const zhihuRequests: string[] = [];
  const zhihuFetch: FetchLike = async (url, init) => {
    zhihuRequests.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.includes('/api/v4/me')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'zh_user' }) };
    }
    if (url.includes('articles/drafts')) {
      const body = JSON.parse(String(init?.body || '{}')) as { title: string; content: string };
      assert.equal(body.title, BENCHMARK_PAYLOAD.title);
      assert.ok(body.content.length > 0);
      return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'zh_draft_99' }) };
    }
    if (url.includes('articles/zh_draft_99/draft')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'zh_draft_99' }) };
    }
    throw new Error(`Unexpected zhihu url: ${url}`);
  };
  const zhihuAdapter = new ZhihuAdapter({ fetchFn: zhihuFetch });
  assert.equal(await zhihuAdapter.checkAuth(), true);
  const zhPush = await zhihuAdapter.push({
    title: BENCHMARK_PAYLOAD.title,
    markdown: BENCHMARK_PAYLOAD.markdown,
    html: BENCHMARK_PAYLOAD.html,
    tags: BENCHMARK_PAYLOAD.tags,
    mode: 'draft',
  });
  assert.equal(zhPush.postId, 'zh_draft_99');
  assert.equal(await zhihuAdapter.verifyDelivery('zh_draft_99'), true);

  // 2. Juejin Draft
  const juejinFetch: FetchLike = async (url, init) => {
    if (url.includes('user/get')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ err_no: 0, data: { user_id: 'j_1' } }) };
    }
    if (url.includes('sys/token')) {
      return { ok: true, status: 200, headers: { get: () => '1,csrf_token_test' }, text: async () => '', json: async () => ({}) };
    }
    if (url.includes('article_draft/create')) {
      const body = JSON.parse(String(init?.body || '{}')) as { title: string; mark_content: string };
      assert.equal(body.title, BENCHMARK_PAYLOAD.title);
      assert.ok(body.mark_content.includes('```typescript'));
      return { ok: true, status: 200, text: async () => '', json: async () => ({ err_no: 0, data: { id: 'jj_draft_88' } }) };
    }
    if (url.includes('article_draft/detail')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ err_no: 0, data: { draft_id: 'jj_draft_88' } }) };
    }
    throw new Error(`Unexpected juejin url: ${url}`);
  };
  const juejinAdapter = new JuejinAdapter({ fetchFn: juejinFetch });
  assert.equal(await juejinAdapter.checkAuth(), true);
  const jjPush = await juejinAdapter.push({
    title: BENCHMARK_PAYLOAD.title,
    markdown: BENCHMARK_PAYLOAD.markdown,
    html: '',
    tags: BENCHMARK_PAYLOAD.tags,
    mode: 'draft',
  });
  assert.equal(jjPush.postId, 'jj_draft_88');
  assert.equal(await juejinAdapter.verifyDelivery('jj_draft_88'), true);

  // 3. CSDN Draft
  const csdnFetch: FetchLike = async (url, init) => {
    if (url.includes('getBaseInfo')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ code: 200, data: { name: 'c_user' } }) };
    }
    if (url.includes('saveArticle')) {
      const body = JSON.parse(String(init?.body || '{}')) as { title: string; markdowncontent: string; status: number };
      assert.equal(body.title, BENCHMARK_PAYLOAD.title);
      assert.equal(body.status, 2); // 2 = draft
      assert.ok(body.markdowncontent.includes('```typescript'));
      return { ok: true, status: 200, text: async () => '', json: async () => ({ code: 200, data: { id: 'csdn_draft_77' } }) };
    }
    throw new Error(`Unexpected csdn url: ${url}`);
  };
  const csdnAdapter = new CsdnAdapter({ fetchFn: csdnFetch });
  assert.equal(await csdnAdapter.checkAuth(), true);
  const csdnPush = await csdnAdapter.push({
    title: BENCHMARK_PAYLOAD.title,
    markdown: BENCHMARK_PAYLOAD.markdown,
    html: '',
    tags: BENCHMARK_PAYLOAD.tags,
    mode: 'draft',
  });
  assert.equal(csdnPush.postId, 'csdn_draft_77');
  assert.equal(await csdnAdapter.verifyDelivery('csdn_draft_77'), true);

  // 4. Baijiahao Draft
  const bjhFetch: FetchLike = async (url, init) => {
    if (url.includes('author/register/get_user_info')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ errno: 0, data: { app_id: 'bjh_1' } }) };
    }
    if (url.includes('resource/article/save')) {
      const body = JSON.parse(String(init?.body || '{}')) as { title: string; content: string; is_draft: number };
      assert.equal(body.title, BENCHMARK_PAYLOAD.title);
      assert.equal(body.is_draft, 1);
      return { ok: true, status: 200, text: async () => '', json: async () => ({ errno: 0, data: { article_id: 'bjh_draft_66' } }) };
    }
    if (url.includes('resource/article/detail')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ errno: 0 }) };
    }
    throw new Error(`Unexpected bjh url: ${url}`);
  };
  const bjhAdapter = new BaijiahaoAdapter({ fetchFn: bjhFetch });
  assert.equal(await bjhAdapter.checkAuth(), true);
  const bjhPush = await bjhAdapter.push({
    title: BENCHMARK_PAYLOAD.title,
    markdown: BENCHMARK_PAYLOAD.markdown,
    html: BENCHMARK_PAYLOAD.html,
    tags: BENCHMARK_PAYLOAD.tags,
    mode: 'draft',
  });
  assert.equal(bjhPush.postId, 'bjh_draft_66');
  assert.equal(await bjhAdapter.verifyDelivery('bjh_draft_66'), true);

  // 5. Cnblogs Draft
  const cnblogsFetch: FetchLike = async (url) => {
    if (url === 'https://rpc.cnblogs.com/metaweblog/leileigwl') {
      return {
        ok: true,
        status: 200,
        text: async () =>
          '<?xml version="1.0"?><methodResponse><params><param><value><string>post_12345</string></value></param></params></methodResponse>',
        json: async () => ({}),
      };
    }
    throw new Error(`Unexpected cnblogs url: ${url}`);
  };
  const cnblogsAdapter = new CnblogsAdapter({
    blogUrl: 'https://rpc.cnblogs.com/metaweblog/leileigwl',
    username: 'leileigwl',
    token: 'token123',
    fetchFn: cnblogsFetch,
  });
  assert.equal(await cnblogsAdapter.checkAuth(), true);
  const cbPush = await cnblogsAdapter.push({
    title: BENCHMARK_PAYLOAD.title,
    markdown: BENCHMARK_PAYLOAD.markdown,
    html: BENCHMARK_PAYLOAD.html,
    tags: BENCHMARK_PAYLOAD.tags,
    mode: 'draft',
  });
  assert.equal(cbPush.postId, 'post_12345');
  assert.equal(await cnblogsAdapter.verifyDelivery('post_12345'), true);

  // 6. Weixin Draft
  const weixinFetch: FetchLike = async (url) => {
    if (url === 'https://mp.weixin.qq.com/') {
      return {
        ok: true,
        status: 200,
        text: async () => 'window.wx = { data: { t: "wx_tok_123" } };',
        json: async () => ({}),
      };
    }
    if (url.includes('operate_appmsg')) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ appMsgId: '98765', ret: 0 }),
      };
    }
    if (url.includes('appmsg?t=media/appmsg_edit')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
    }
    throw new Error(`Unexpected weixin url: ${url}`);
  };
  const weixinAdapter = new WeixinAdapter(weixinFetch);
  assert.equal(await weixinAdapter.checkAuth(), true);
  const wxPush = await weixinAdapter.push({
    title: BENCHMARK_PAYLOAD.title,
    markdown: BENCHMARK_PAYLOAD.markdown,
    html: BENCHMARK_PAYLOAD.html,
    tags: BENCHMARK_PAYLOAD.tags,
    mode: 'draft',
  });
  assert.equal(wxPush.postId, '98765');
  assert.equal(await weixinAdapter.verifyDelivery('98765'), true);
});
