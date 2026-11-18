import assert from 'node:assert/strict';
import test from 'node:test';
import { WeixinAdapter, type FetchLike } from './weixin.ts';

test('WeixinAdapter 5-step flow: checkAuth -> uploadImage -> push draft -> verifyDelivery', async () => {
  const calls: string[] = [];
  const mockFetch: FetchLike = async (url, init) => {
    calls.push(`${init?.method || 'GET'} ${url}`);
    if (url === 'https://mp.weixin.qq.com/') {
      return {
        ok: true,
        status: 200,
        text: async () =>
          'window.wx = { data: { t: "tk_123" }, ticket: "tkt_456", user_name: "gh_abc", nick_name: "VmarkLab", time: "1700000000" };',
        json: async () => ({}),
      };
    }
    if (url.includes('action=upload_material')) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          base_resp: { err_msg: 'ok', ret: 0 },
          cdn_url: 'https://mmbiz.qpic.cn/mmbiz_png/mock123/0',
        }),
      };
    }
    if (url.includes('operate_appmsg')) {
      const bodyStr = String(init?.body || '');
      assert.ok(bodyStr.includes('author0=VmarkAuthor'));
      assert.ok(bodyStr.includes('digest0='));
      assert.ok(bodyStr.includes('cdn_235_1_url0='));
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ appMsgId: '10086', base_resp: { ret: 0, err_msg: 'ok' } }),
      };
    }
    if (url.includes('appmsgid=10086')) {
      return {
        ok: true,
        status: 200,
        text: async () => '<html>ok</html>',
        json: async () => ({}),
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const adapter = new WeixinAdapter(mockFetch);
  const authed = await adapter.checkAuth();
  assert.equal(authed, true);
  assert.equal(adapter.getAuthMeta()?.nickName, 'VmarkLab');

  const cdnUrl = await adapter.uploadImage(Buffer.from('png'), 'cover.png');
  assert.equal(cdnUrl, 'https://mmbiz.qpic.cn/mmbiz_png/mock123/0');

  const result = await adapter.push({
    title: 'Vmark 测试文章',
    markdown: '# 测试',
    html: '<section><h1>测试</h1></section>',
    tags: [],
    mode: 'draft',
    author: 'VmarkAuthor',
    digest: '自定义摘要',
    coverImageUrl: cdnUrl,
    showCoverInBody: true,
    sourceUrl: 'https://github.com/leileigwl/vmark',
  });

  assert.equal(result.postId, '10086');
  assert.equal(result.mode, 'draft');
  assert.equal(result.verified, true);
  assert.ok(result.url.includes('appmsgid=10086'));
  assert.equal(calls.length, 4);
});
