import assert from 'node:assert/strict';
import test from 'node:test';
import { WeixinAdapter, type FetchLike } from './weixin.ts';

test('WeixinAdapter 5-step flow: checkAuth -> uploadImage -> push draft -> verifyDelivery', async () => {
  const calls: string[] = [];
  const mockFetch: FetchLike = async (url, init) => {
    calls.push(`${init?.method || 'GET'} ${url}`);
    if (url === 'https://mp.weixin.qq.com/' || url.includes('/cgi-bin/home?t=home/index')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          'window.wx = { data: { t: "1577889912" }, ticket: "tkt_456", user_name: "gh_abc", nick_name: "VmarkLab", time: "1700000000" };',
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
      const headers = (init?.headers ?? {}) as Record<string, string>;
      assert.equal(headers.Origin, 'https://mp.weixin.qq.com');
      assert.ok(headers.Referer?.startsWith('https://mp.weixin.qq.com/'));
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
  // 首页 + 带 token 复核后台首页 + 上传 + 保存草稿 + 回查
  assert.equal(calls.length, 5);
});

test('WeixinAdapter push: 1:1 转发图用按焦点裁好的方图，2.35:1 列表图保持原封面', async () => {
  let body = '';
  const mockFetch: FetchLike = async (url, init) => {
    if (url === 'https://mp.weixin.qq.com/' || url.includes('/cgi-bin/home')) {
      return { ok: true, status: 200, text: async () => 'data: { t: "1577889912" }, ticket: "t", user_name: "u", time: "1"', json: async () => ({}) };
    }
    if (url.includes('operate_appmsg')) {
      body = String(init?.body || '');
      return { ok: true, status: 200, text: async () => '', json: async () => ({ appMsgId: '1' }) };
    }
    return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
  };
  const adapter = new WeixinAdapter(mockFetch);
  await adapter.push({
    title: 't',
    markdown: '',
    html: '<p>x</p>',
    tags: [],
    mode: 'draft',
    coverImageUrl: 'https://mmbiz.qpic.cn/wide/0',
    coverSquareImageUrl: 'https://mmbiz.qpic.cn/square/0',
  });
  const form = new URLSearchParams(body);
  assert.equal(form.get('cdn_url0'), 'https://mmbiz.qpic.cn/wide/0');
  assert.equal(form.get('cdn_235_1_url0'), 'https://mmbiz.qpic.cn/wide/0');
  assert.equal(form.get('cdn_1_1_url0'), 'https://mmbiz.qpic.cn/square/0');
});

test('WeixinAdapter push: 没有方图时 1:1 仍退回原封面（交给微信居中裁）', async () => {
  let body = '';
  const mockFetch: FetchLike = async (url, init) => {
    if (url === 'https://mp.weixin.qq.com/' || url.includes('/cgi-bin/home')) {
      return { ok: true, status: 200, text: async () => 'data: { t: "1577889912" }', json: async () => ({}) };
    }
    if (url.includes('operate_appmsg')) body = String(init?.body || '');
    return { ok: true, status: 200, text: async () => '', json: async () => ({ appMsgId: '1' }) };
  };
  await new WeixinAdapter(mockFetch).push({ title: 't', markdown: '', html: '', tags: [], mode: 'draft', coverImageUrl: 'https://mmbiz.qpic.cn/wide/0' });
  assert.equal(new URLSearchParams(body).get('cdn_1_1_url0'), 'https://mmbiz.qpic.cn/wide/0');
});

/**
 * 复现「公众号未登录却显示已登录」：会话过期后 slave_user/slave_sid cookie 还在，
 * mp.weixin.qq.com/ 返回的是扫码登录页。登录页脚本里也有 `data: {`，旧正则非贪婪地跨键匹配，
 * 把 `content: "..."` 末尾的 `t:` 当成 token，于是误判为已登录。
 * （以下 HTML 是按这一结构手写的复现样本，不是真实抓包。）
 */
const LOGGED_OUT_LOGIN_PAGE = `<!DOCTYPE html><html><head><title>微信公众平台</title></head><body>
<div class="login__type__container">请使用微信扫描二维码登录</div>
<script>window.wx = { data: { uin: "", user_name: "", t: "", lang: "zh_CN" }, commonData: {} };
var loginConf = { scene: "login", content: "使用账号登录", redirect_url: "/cgi-bin/home" };</script>
</body></html>`;

function loginPageFetch(calls: string[]): FetchLike {
  return async (url, init) => {
    calls.push(`${init?.method || 'GET'} ${url}`);
    return { ok: true, status: 200, url: 'https://mp.weixin.qq.com/', text: async () => LOGGED_OUT_LOGIN_PAGE, json: async () => ({}) };
  };
}

test('WeixinAdapter checkAuth: 过期会话返回扫码登录页 → 未登录（不能把别的键末尾的 t: 当 token）', async () => {
  const adapter = new WeixinAdapter(loginPageFetch([]));
  assert.equal(await adapter.checkAuth(), false);
  assert.equal(adapter.getAuthMeta(), null);
});

test('WeixinAdapter checkAuth: 首页给出 token 但带 token 打开后台被重定向回登录页 → 未登录', async () => {
  const mockFetch: FetchLike = async (url) => {
    if (url === 'https://mp.weixin.qq.com/') {
      return { ok: true, status: 200, url, text: async () => 'window.wx = { data: { t: "1577889912", ticket: "tk" } };', json: async () => ({}) };
    }
    // 带 token 访问后台首页：会话已失效，被跳回登录页
    return { ok: true, status: 200, url: 'https://mp.weixin.qq.com/', text: async () => LOGGED_OUT_LOGIN_PAGE, json: async () => ({}) };
  };
  const adapter = new WeixinAdapter(mockFetch);
  assert.equal(await adapter.checkAuth(), false);
  assert.equal(adapter.getAuthMeta(), null);
});

test('WeixinAdapter push/uploadImage: 未登录时直接报「未登录」，绝不调用保存草稿接口', async () => {
  const calls: string[] = [];
  const adapter = new WeixinAdapter(loginPageFetch(calls));
  await assert.rejects(
    adapter.push({ title: 't', markdown: '', html: '<p>x</p>', tags: [], mode: 'draft' }),
    /未登录/
  );
  await assert.rejects(adapter.uploadImage(Buffer.from('png'), 'a.png'), /未登录/);
  assert.equal(calls.some((c) => c.includes('operate_appmsg') || c.includes('filetransfer')), false);
});

test('WeixinAdapter push: 接口返回 base_resp.ret≠0（如 200003 invalid session）时即使带 appMsgId 也算失败', async () => {
  const mockFetch: FetchLike = async (url) => {
    if (url === 'https://mp.weixin.qq.com/' || url.includes('/cgi-bin/home')) {
      return { ok: true, status: 200, text: async () => 'window.wx = { data: { t: "1577889912" } };', json: async () => ({}) };
    }
    if (url.includes('operate_appmsg')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ appMsgId: '0', base_resp: { ret: 200003, err_msg: 'invalid session' } }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  await assert.rejects(
    new WeixinAdapter(mockFetch).push({ title: 't', markdown: '', html: '<p>x</p>', tags: [], mode: 'draft' }),
    /invalid session/
  );
});
