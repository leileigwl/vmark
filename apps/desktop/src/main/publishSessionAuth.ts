import type Electron from 'electron';
import {
  BaijiahaoAdapter,
  CsdnAdapter,
  JuejinAdapter,
  WeixinAdapter,
  ZhihuAdapter,
  type FetchLike,
} from '@vcat/adapters';
import type { ImageBedConfig, PlatformId } from '@vcat/shared';
import { buildChromeBrowserHeaders, CHROME_DESKTOP_UA } from './browserStealth.ts';

export interface PublishAppConfig {
  workspacePath: string | null;
  imageBed: ImageBedConfig;
}

/** Wraps an Electron Session's fetch method into the FetchLike contract expected by adapters. */
export function createSessionFetch(targetSession: Electron.Session): FetchLike {
  const browserHeaders = buildChromeBrowserHeaders();
  try {
    targetSession.setUserAgent(browserHeaders['User-Agent']);
  } catch {
    // ignore user-agent override failure in mock/headless sessions
  }
  return async (input, init) => {
    const customInit = ({ ...init }) as Parameters<typeof targetSession.fetch>[1];
    const headers = new Headers(customInit?.headers || {});
    for (const [key, value] of Object.entries(browserHeaders)) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', CHROME_DESKTOP_UA);
    }
    const res = await targetSession.fetch(input, {
      ...customInit,
      credentials: customInit?.credentials ?? 'include',
      headers,
    });
    return {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
      text: () => res.text(),
      json: () => res.json(),
    };
  };
}

/** Verifies exact platform auth tickets when available. Returns false if no ticket is found. */
export async function hasSessionAuthCookies(
  session: typeof Electron.session,
  platformId: PlatformId
): Promise<boolean> {
  const cookies = await session.fromPartition(`persist:platform_${platformId}`).cookies.get({});
  if (!cookies || cookies.length === 0) {
    return false;
  }

  const hasCookie = (matcher: (name: string, value: string, domain?: string) => boolean) =>
    cookies.some(
      (c) =>
        matcher(c.name, c.value || '', c.domain) &&
        typeof c.value === 'string' &&
        c.value.trim().length > 0
    );

  switch (platformId) {
    case 'weixin':
      // Weixin Official Account requires BOTH slave_user and slave_sid on weixin.qq.com
      return (
        hasCookie((n, _, d) => n === 'slave_user' && (!d || d.includes('weixin.qq.com'))) &&
        hasCookie((n, _, d) => n === 'slave_sid' && (!d || d.includes('weixin.qq.com')))
      );

    case 'csdn':
      // CSDN session may carry UserName or UserToken*; live getBaseInfo verifies real auth
      return (
        hasCookie((n, _, d) => n === 'UserName' && (!d || d.includes('csdn.net'))) ||
        hasCookie((n, _, d) => n.startsWith('UserToken') && (!d || d.includes('csdn.net')))
      );

    case 'zhihu':
      return hasCookie((n, _, d) => n === 'z_c0' && (!d || d.includes('zhihu.com')));

    case 'cnblogs':
      return hasCookie(
        (n, _, d) =>
          (n === '.CNBlogsCookie' ||
            n === '.Cnblogs.AspNetCore.Cookies' ||
            n === 'Cnblogs.AspNetCore.Cookies') &&
          (!d || d.includes('cnblogs.com'))
      );

    case 'juejin':
      return hasCookie((n, _, d) => (n === 'sessionid' || n === 'sessionid_ss') && (!d || d.includes('juejin.cn')));

    case 'bilibili':
      return hasCookie(
        (n, _, d) =>
          n === 'SESSDATA' && (!d || d.includes('bilibili.com') || d.includes('bilibili.cn'))
      );

    case 'baijiahao':
      return hasCookie(
        (n, _, d) => (n === 'BDUSS' || n === 'BDUSS_BFESS') && (!d || d.includes('baidu.com'))
      );

    case 'xiaohongshu':
      return hasCookie((n, _, d) => n === 'web_session' && (!d || d.includes('xiaohongshu.com')));

    case 'weibo':
      return hasCookie(
        (n, _, d) => n === 'SUB' && (!d || d.includes('weibo.com') || d.includes('weibo.cn'))
      );

    case 'douyin':
      return hasCookie((n, _, d) => (n === 'sessionid' || n === 'sessionid_ss') && (!d || d.includes('douyin.com')));

    case 'linuxdo':
      // _forum_session is issued to anonymous visitors; _t is the authenticated Discourse session token
      return hasCookie((n, _, d) => n === '_t' && (!d || d.includes('linux.do')));

    case 'x':
      return (
        hasCookie((n, _, d) => n === 'auth_token' && (!d || d.includes('x.com') || d.includes('twitter.com'))) &&
        hasCookie((n, _, d) => n === 'ct0' && (!d || d.includes('x.com') || d.includes('twitter.com')))
      );

    case 'github_static':
      return hasCookie((n) => n.startsWith('ghp_') || n.startsWith('github_pat_'));

    default:
      return false;
  }
}

/** Verifies true authentication for a single platform via cookies and live API check when available. */
export async function verifyPlatformAuth(params: {
  session: typeof Electron.session;
  platformId: PlatformId;
  getAppConfig: () => Promise<PublishAppConfig>;
}): Promise<boolean> {
  const { session, platformId, getAppConfig } = params;
  try {
    if (platformId === 'github_static') {
      const cfg = await getAppConfig();
      const hasConfig =
        cfg.imageBed.provider === 'github' &&
        Boolean(cfg.imageBed.repo?.trim() && cfg.imageBed.token?.trim());
      return hasConfig || (await hasSessionAuthCookies(session, platformId));
    }

    const hasCookies = await hasSessionAuthCookies(session, platformId);
    if (!hasCookies) return false;

    if (platformId === 'weixin') {
      const wxSession = session.fromPartition('persist:platform_weixin');
      const adapter = new WeixinAdapter(createSessionFetch(wxSession));
      return await Promise.race([
        adapter.checkAuth(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    if (platformId === 'cnblogs') {
      const cbSession = session.fromPartition('persist:platform_cnblogs');
      const sFetch = createSessionFetch(cbSession);
      return await Promise.race([
        sFetch('https://i.cnblogs.com/api/user', {
          headers: { Referer: 'https://i.cnblogs.com/' },
        }).then((res) => res.ok),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    if (platformId === 'bilibili') {
      const bSession = session.fromPartition('persist:platform_bilibili');
      const sFetch = createSessionFetch(bSession);
      return await Promise.race([
        sFetch('https://api.bilibili.com/x/web-interface/nav').then(async (res) => {
          if (!res.ok) return false;
          const data = (await res.json()) as { code?: number; data?: { isLogin?: boolean } };
          return data.code === 0 && Boolean(data.data?.isLogin);
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    if (platformId === 'juejin') {
      const jSession = session.fromPartition('persist:platform_juejin');
      const sFetch = createSessionFetch(jSession);
      const adapter = new JuejinAdapter({ fetchFn: sFetch });
      const verifyJuejinDraftAuth = async (): Promise<boolean> => {
        if (!(await adapter.checkAuth())) return false;
        const draftRes = await sFetch('https://api.juejin.cn/content_api/v1/article_draft/query_list', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://juejin.cn',
            Referer: 'https://juejin.cn/',
          },
          body: JSON.stringify({ page_no: 1, page_size: 1 }),
        });
        if (!draftRes.ok) return false;
        const draftData = (await draftRes.json()) as { err_no?: number };
        return draftData.err_no === 0;
      };
      return await Promise.race([
        verifyJuejinDraftAuth(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    if (platformId === 'zhihu') {
      const zSession = session.fromPartition('persist:platform_zhihu');
      const adapter = new ZhihuAdapter({ fetchFn: createSessionFetch(zSession) });
      return await Promise.race([
        adapter.checkAuth(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    if (platformId === 'csdn') {
      const cSession = session.fromPartition('persist:platform_csdn');
      const adapter = new CsdnAdapter({ fetchFn: createSessionFetch(cSession) });
      return await Promise.race([
        adapter.checkAuth(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    if (platformId === 'baijiahao') {
      const bSession = session.fromPartition('persist:platform_baijiahao');
      const adapter = new BaijiahaoAdapter({ fetchFn: createSessionFetch(bSession) });
      return await Promise.race([
        adapter.checkAuth(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);
    }

    if (platformId === 'linuxdo') {
      const lSession = session.fromPartition('persist:platform_linuxdo');
      const sFetch = createSessionFetch(lSession);
      return await Promise.race([
        sFetch('https://linux.do/session/current.json', {
          headers: { Referer: 'https://linux.do/' },
        }).then(async (res) => {
          // Cloudflare JS challenge (403/503) on net.fetch should not invalidate a verified _t session cookie
          if (res.status === 403 || res.status === 503) return true;
          if (!res.ok) return false;
          const data = (await res.json()) as { current_user?: { id?: number } };
          return Boolean(data.current_user?.id);
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    if (platformId === 'weibo') {
      const wSession = session.fromPartition('persist:platform_weibo');
      const sFetch = createSessionFetch(wSession);
      return await Promise.race([
        sFetch('https://m.weibo.cn/api/config', {
          headers: { Referer: 'https://m.weibo.cn/' },
        }).then(async (res) => {
          if (!res.ok) return false;
          const data = (await res.json()) as { ok?: number; data?: { login?: boolean } };
          return Boolean(data.data?.login);
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    if (platformId === 'douyin') {
      const dSession = session.fromPartition('persist:platform_douyin');
      const sFetch = createSessionFetch(dSession);
      return await Promise.race([
        sFetch('https://creator.douyin.com/web/api/media/user/info/', {
          headers: { Referer: 'https://creator.douyin.com/' },
        }).then(async (res) => {
          if (!res.ok) return false;
          const data = (await res.json()) as { status_code?: number; user?: { uid?: string } };
          return Boolean(data.user?.uid) || data.status_code === 0;
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    if (platformId === 'xiaohongshu') {
      const xSession = session.fromPartition('persist:platform_xiaohongshu');
      const sFetch = createSessionFetch(xSession);
      return await Promise.race([
        sFetch('https://edith.xiaohongshu.com/api/sns/web/v2/user/me', {
          headers: {
            Origin: 'https://www.xiaohongshu.com',
            Referer: 'https://www.xiaohongshu.com/',
          },
        }).then(async (res) => {
          if (!res.ok) return false;
          const data = (await res.json()) as {
            success?: boolean;
            data?: { guest?: boolean; user_id?: string };
          };
          return Boolean(data.success) && !data.data?.guest && Boolean(data.data?.user_id);
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    }

    return true;
  } catch {
    return false;
  }
}

/** Checks real authentication status across all supported platforms. */
export async function checkPlatformAuthStates(params: {
  session: typeof Electron.session;
  getAppConfig: () => Promise<PublishAppConfig>;
}): Promise<Partial<Record<PlatformId, boolean>>> {
  const { session, getAppConfig } = params;
  const ids: PlatformId[] = [
    'github_static',
    'weixin',
    'cnblogs',
    'linuxdo',
    'juejin',
    'csdn',
    'zhihu',
    'baijiahao',
    'weibo',
    'bilibili',
    'douyin',
    'x',
    'xiaohongshu',
  ];

  const entries = await Promise.all(
    ids.map(async (id): Promise<[PlatformId, boolean]> => {
      const ok = await verifyPlatformAuth({ session, platformId: id, getAppConfig });
      return [id, ok];
    })
  );

  return Object.fromEntries(entries) as Partial<Record<PlatformId, boolean>>;
}
