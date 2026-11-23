import test from 'node:test';
import assert from 'node:assert/strict';
import type Electron from 'electron';
import { hasSessionAuthCookies, verifyPlatformAuth } from '../src/main/publishSessionAuth.ts';

interface CookieStub {
  name: string;
  value: string;
  domain?: string;
}

function createMockSession(
  cookiesByPartition: Record<string, CookieStub[]>,
  fetchHandler?: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
): typeof Electron.session {
  return {
    fromPartition(partition: string) {
      return {
        setUserAgent() {},
        cookies: {
          async get() {
            return cookiesByPartition[partition] ?? [];
          },
        },
        async fetch(input: string) {
          if (fetchHandler) {
            const res = await fetchHandler(String(input));
            return {
              ...res,
              headers: new Headers(),
              text: async () => JSON.stringify(await res.json()),
            };
          }
          return {
            ok: false,
            status: 404,
            headers: new Headers(),
            text: async () => '',
            json: async () => ({}),
          };
        },
      };
    },
  } as unknown as typeof Electron.session;
}

const dummyConfig = async () => ({
  workspacePath: null,
  imageBed: { strategy: 'platform_private' as const, provider: 'smms' as const },
});

test('hasSessionAuthCookies rejects anonymous linuxdo _forum_session and requires _t; x requires auth_token + ct0', async () => {
  const guestSession = createMockSession({
    'persist:platform_linuxdo': [{ name: '_forum_session', value: 'anon', domain: 'linux.do' }],
    'persist:platform_x': [{ name: 'auth_token', value: 'tok', domain: '.x.com' }],
  });
  assert.equal(await hasSessionAuthCookies(guestSession, 'linuxdo'), false);
  assert.equal(await hasSessionAuthCookies(guestSession, 'x'), false);

  const authedSession = createMockSession({
    'persist:platform_linuxdo': [{ name: '_t', value: 'real_token', domain: 'linux.do' }],
    'persist:platform_x': [
      { name: 'auth_token', value: 'tok', domain: '.x.com' },
      { name: 'ct0', value: 'csrf', domain: '.x.com' },
    ],
  });
  assert.equal(await hasSessionAuthCookies(authedSession, 'linuxdo'), true);
  assert.equal(await hasSessionAuthCookies(authedSession, 'x'), true);
});

test('verifyPlatformAuth validates live API for linuxdo, weibo, xiaohongshu, and cnblogs', async () => {
  const sessionWithGuestResponses = createMockSession(
    {
      'persist:platform_linuxdo': [{ name: '_t', value: 'stale', domain: 'linux.do' }],
      'persist:platform_weibo': [{ name: 'SUB', value: 'guest_sub', domain: '.weibo.com' }],
      'persist:platform_xiaohongshu': [{ name: 'web_session', value: 'guest_ws', domain: '.xiaohongshu.com' }],
      'persist:platform_cnblogs': [{ name: '.Cnblogs.AspNetCore.Cookies', value: 'cb', domain: '.cnblogs.com' }],
    },
    async (url) => {
      if (url.includes('linux.do/session/current.json')) {
        return { ok: true, status: 200, json: async () => ({ current_user: null }) };
      }
      if (url.includes('m.weibo.cn/api/config')) {
        return { ok: true, status: 200, json: async () => ({ ok: 1, data: { login: false } }) };
      }
      if (url.includes('edith.xiaohongshu.com')) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: { guest: true, user_id: 'g1' } }) };
      }
      if (url.includes('i.cnblogs.com/api/user')) {
        return { ok: false, status: 403, json: async () => ({ errors: ['您没有开通博客'] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }
  );

  assert.equal(await verifyPlatformAuth({ session: sessionWithGuestResponses, platformId: 'linuxdo', getAppConfig: dummyConfig }), false);
  assert.equal(await verifyPlatformAuth({ session: sessionWithGuestResponses, platformId: 'weibo', getAppConfig: dummyConfig }), false);
  assert.equal(await verifyPlatformAuth({ session: sessionWithGuestResponses, platformId: 'xiaohongshu', getAppConfig: dummyConfig }), false);
  assert.equal(await verifyPlatformAuth({ session: sessionWithGuestResponses, platformId: 'cnblogs', getAppConfig: dummyConfig }), true);

  const sessionWithAuthedResponses = createMockSession(
    {
      'persist:platform_linuxdo': [{ name: '_t', value: 'valid', domain: 'linux.do' }],
      'persist:platform_weibo': [{ name: 'SUB', value: 'valid_sub', domain: '.weibo.com' }],
      'persist:platform_xiaohongshu': [{ name: 'web_session', value: 'valid_ws', domain: '.xiaohongshu.com' }],
    },
    async (url) => {
      if (url.includes('linux.do/session/current.json')) {
        return { ok: true, status: 200, json: async () => ({ current_user: { id: 101 } }) };
      }
      if (url.includes('m.weibo.cn/api/config')) {
        return { ok: true, status: 200, json: async () => ({ ok: 1, data: { login: true } }) };
      }
      if (url.includes('edith.xiaohongshu.com')) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: { guest: false, user_id: 'u1' } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }
  );

  assert.equal(await verifyPlatformAuth({ session: sessionWithAuthedResponses, platformId: 'linuxdo', getAppConfig: dummyConfig }), true);
  assert.equal(await verifyPlatformAuth({ session: sessionWithAuthedResponses, platformId: 'weibo', getAppConfig: dummyConfig }), true);
  assert.equal(await verifyPlatformAuth({ session: sessionWithAuthedResponses, platformId: 'xiaohongshu', getAppConfig: dummyConfig }), true);

  const linuxdoCloudflareSession = createMockSession(
    { 'persist:platform_linuxdo': [{ name: '_t', value: 'valid', domain: 'linux.do' }] },
    async () => ({ ok: false, status: 403, json: async () => ({}) })
  );
  assert.equal(await verifyPlatformAuth({ session: linuxdoCloudflareSession, platformId: 'linuxdo', getAppConfig: dummyConfig }), true);

  const xhsCreatorSession = createMockSession(
    {
      'persist:platform_xiaohongshu': [
        { name: 'galaxy_creator_session_id', value: 'creator_sid', domain: 'creator.xiaohongshu.com' },
      ],
    },
    async (url) => {
      if (url.includes('creator.xiaohongshu.com/api/galaxy/user/info')) {
        return { ok: true, status: 200, json: async () => ({ success: true, code: 0, data: { userId: 'xhs_u1' } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }
  );
  assert.equal(await verifyPlatformAuth({ session: xhsCreatorSession, platformId: 'xiaohongshu', getAppConfig: dummyConfig }), true);
});

test('verifyPlatformAuth weixin: 过期会话（slave_user/slave_sid 仍在，首页是扫码登录页）判为未登录', async () => {
  const loginPage = `<script>window.wx = { data: { uin: "", t: "", lang: "zh_CN" } };
var loginConf = { content: "使用账号登录", redirect_url: "/cgi-bin/home" };</script>`;
  const staleSession = {
    fromPartition() {
      return {
        cookies: {
          async get() {
            return [
              { name: 'slave_user', value: 'gh_stale', domain: 'mp.weixin.qq.com' },
              { name: 'slave_sid', value: 'stale_sid', domain: 'mp.weixin.qq.com' },
            ];
          },
        },
        async fetch() {
          return { ok: true, status: 200, url: 'https://mp.weixin.qq.com/', headers: new Headers(), text: async () => loginPage, json: async () => ({}) };
        },
      };
    },
  } as unknown as typeof Electron.session;

  assert.equal(await hasSessionAuthCookies(staleSession, 'weixin'), true, 'cookie 还在，所以只看 cookie 会误判');
  assert.equal(await verifyPlatformAuth({ session: staleSession, platformId: 'weixin', getAppConfig: dummyConfig }), false);
});
