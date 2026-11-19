import fs from 'node:fs/promises';
import path from 'node:path';
import type Electron from 'electron';
import {
  BaijiahaoAdapter,
  CnblogsAdapter,
  CsdnAdapter,
  GitHubStaticAdapter,
  JuejinAdapter,
  WeixinAdapter,
  ZhihuAdapter,
  type FetchLike,
} from '@vcat/adapters';
import {
  parseCsdnMarkdown,
  renderBaijiahaoHtml,
  renderWeixinHtml,
  renderZhihuHtml,
} from '@vcat/core';
import {
  createImageBedUploader,
  resolveRefererForUrl,
  uploadLocalImagesForPublish,
} from '@vcat/image-pipeline';
import type {
  ImageBedConfig,
  MultiPlatformPublishPayload,
  MultiPlatformPublishResultItem,
  PlatformId,
  PublishMode,
} from '@vcat/shared';

interface WeixinDraftIpcPayload {
  title: string;
  markdown: string;
  author?: string;
  digest?: string;
  coverImageUrl?: string;
  showCoverInBody?: boolean;
  sourceUrl?: string;
  includeRemoteImages?: boolean;
}

type WeixinDraftIpcResult =
  | { ok: true; postId: string; url: string; verified: boolean; uploadedImagesCount?: number }
  | { ok: false; message: string };

export interface PublishAppConfig {
  workspacePath: string | null;
  imageBed: ImageBedConfig;
}

const ANALYTICS_COOKIE_PREFIXES = ['_ga', '_gid', 'Hm_', 'sensorsdata', '__utm'];

const PLATFORM_AUTH_COOKIE_RULES: Record<PlatformId, string[]> = {
  weixin: ['slave_user', 'slave_sid'],
  zhihu: ['z_c0'],
  cnblogs: ['.CNBlogsCookie', '.Cnblogs.AspNetCore.Cookies', 'Cnblogs.AspNetCore.Cookies'],
  juejin: ['sessionid', 'sessionid_ss'],
  bilibili: ['SESSDATA'],
  csdn: ['UserName', 'UserToken'],
  baijiahao: ['BDUSS', 'BDUSS_BFESS', 'BAIDUID', 'BAIDUID_BFESS'],
  linuxdo: ['_t', '_forum_session'],
  xiaohongshu: ['web_session'],
  weibo: ['SUB'],
  douyin: ['sessionid', 'sessionid_ss'],
  x: ['auth_token'],
  github_static: ['ghp_', 'github_pat_'],
};

const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Wraps an Electron Session's fetch method into the FetchLike contract expected by adapters. */
function createSessionFetch(targetSession: Electron.Session): FetchLike {
  try {
    targetSession.setUserAgent(CHROME_DESKTOP_UA);
  } catch {
    // ignore
  }
  return async (input, init) => {
    const customInit = ({ ...init }) as Parameters<typeof targetSession.fetch>[1];
    const headers = new Headers(customInit?.headers || {});
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', CHROME_DESKTOP_UA);
    }
    const res = await targetSession.fetch(input, { ...customInit, headers });
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
async function hasSessionAuthCookies(
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
      // CSDN requires BOTH UserName and UserToken on csdn.net
      return (
        hasCookie((n, _, d) => n === 'UserName' && (!d || d.includes('csdn.net'))) &&
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
      return hasCookie((n, _, d) => (n === '_t' || n === '_forum_session') && (!d || d.includes('linux.do')));

    case 'x':
      return hasCookie(
        (n, _, d) => n === 'auth_token' && (!d || d.includes('x.com') || d.includes('twitter.com'))
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

    // Deep check for platforms with live verification APIs
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
        }).then(async (res) => {
          if (res.ok) return true;
          if (res.status === 403) {
            try {
              const data = (await res.json()) as { errors?: string[] };
              if (data.errors?.some((e) => e.includes('您没有开通博客'))) return true;
            } catch (parseErr) { void parseErr; /* Non-JSON 403 payload from cnblogs */ }
          }
          return false;
        }),
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
      const adapter = new JuejinAdapter({ fetchFn: createSessionFetch(jSession) });
      return await Promise.race([
        adapter.checkAuth(),
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

async function resolveWeixinCoverUrl(params: {
  coverImageUrl?: string;
  workspacePath: string | null;
  adapter: WeixinAdapter;
  includeRemote: boolean;
}): Promise<{ ok: true; url?: string } | { ok: false; message: string }> {
  const raw = params.coverImageUrl?.trim();
  if (!raw) return { ok: true, url: undefined };

  if (!/^https?:\/\//i.test(raw)) {
    if (!params.workspacePath) {
      return { ok: false, message: `未配置工作区路径，无法读取本地封面图: ${raw}` };
    }
    const resolvedRoot = path.resolve(params.workspacePath);
    const cleanRel = raw.replace(/^\.\//, '');
    const fullCoverPath = path.resolve(resolvedRoot, cleanRel);
    if (!fullCoverPath.startsWith(`${resolvedRoot}${path.sep}`)) {
      return { ok: false, message: `非法封面图路径: ${raw}` };
    }
    const coverBuffer = await fs.readFile(fullCoverPath);
    const url = await params.adapter.uploadImage(coverBuffer, path.basename(fullCoverPath));
    return { ok: true, url };
  }

  if (!params.includeRemote || raw.includes('mmbiz.qpic.cn')) {
    return { ok: true, url: raw };
  }

  const referer = resolveRefererForUrl(raw);
  const res = await fetch(raw, {
    headers: {
      ...(referer ? { Referer: referer } : {}),
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) {
    return { ok: false, message: `抓取封面图失败 (${res.status}): ${raw}` };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const url = await params.adapter.uploadImage(buffer, 'cover.png');
  return { ok: true, url };
}

async function executeWeixinDraftPublish(params: {
  session: typeof Electron.session;
  workspacePath: string | null;
  payload: WeixinDraftIpcPayload;
}): Promise<WeixinDraftIpcResult> {
  const { session, workspacePath, payload } = params;
  const wxSession = session.fromPartition('persist:platform_weixin');
  const adapter = new WeixinAdapter(createSessionFetch(wxSession));

  const authed = await adapter.checkAuth();
  if (!authed) {
    return {
      ok: false,
      message: '微信公众号未登录，请先在「偏好设置 → 平台授权托管」完成扫码登录',
    };
  }

  const includeRemote = payload.includeRemoteImages ?? true;
  const uploadResult = await uploadLocalImagesForPublish({
    workspacePath,
    markdown: payload.markdown,
    config: { strategy: 'platform_private' },
    includeRemote,
    skipHosts: ['mmbiz.qpic.cn'],
    uploadFn: async (buffer, fileName) => adapter.uploadImage(buffer, fileName),
  });
  if (uploadResult.errors.length > 0) {
    return { ok: false, message: uploadResult.errors.join('；') };
  }

  const coverRes = await resolveWeixinCoverUrl({
    coverImageUrl: payload.coverImageUrl,
    workspacePath,
    adapter,
    includeRemote,
  });
  if (!coverRes.ok) {
    return { ok: false, message: coverRes.message };
  }

  const rendered = renderWeixinHtml(uploadResult.markdown, {
    coverImageUrl: coverRes.url,
    showCoverInBody: payload.showCoverInBody,
  });

  const pushed = await adapter.push({
    title: payload.title,
    markdown: uploadResult.markdown,
    html: rendered.html,
    tags: [],
    mode: 'draft',
    author: payload.author,
    digest: payload.digest?.trim() ? payload.digest : rendered.digest,
    coverImageUrl: coverRes.url,
    showCoverInBody: payload.showCoverInBody,
    sourceUrl: payload.sourceUrl,
  });

  return {
    ok: true,
    postId: pushed.postId,
    url: pushed.url,
    verified: pushed.verified,
    uploadedImagesCount: uploadResult.uploadedCount,
  };
}

async function publishToSingleTarget(params: {
  platformId: PlatformId;
  mode: PublishMode;
  payload: MultiPlatformPublishPayload;
  cfg: PublishAppConfig;
  session: typeof Electron.session;
}): Promise<MultiPlatformPublishResultItem> {
  const { platformId, mode, payload, cfg, session } = params;
  const includeRemote = payload.includeRemoteImages ?? true;

  const resolveUploadFn = (platformAdapter?: { uploadImage: (buf: Buffer, name: string) => Promise<string> }) => {
    if (cfg.imageBed.strategy === 'custom_oss' && cfg.imageBed.provider) {
      return createImageBedUploader();
    }
    return async (buffer: Buffer, fileName: string) => {
      if (platformAdapter) {
        try {
          return await platformAdapter.uploadImage(buffer, fileName);
        } catch (err) {
          if (cfg.imageBed.provider) {
            return await createImageBedUploader()(buffer, fileName, cfg.imageBed);
          }
          throw err;
        }
      }
      return await createImageBedUploader()(buffer, fileName, cfg.imageBed);
    };
  };

  try {
    if (platformId === 'weixin') {
      const res = await executeWeixinDraftPublish({
        session,
        workspacePath: cfg.workspacePath,
        payload: { ...payload, includeRemoteImages: includeRemote },
      });
      if (!res.ok) {
        return { platformId, ok: false, mode: 'draft', message: res.message };
      }
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: res.postId,
        url: res.url,
        verified: res.verified,
        uploadedImagesCount: res.uploadedImagesCount,
        message: `已推送到公众号草稿箱（转存 ${res.uploadedImagesCount ?? 0} 张图）`,
      };
    }

    if (platformId === 'github_static') {
      if (
        cfg.imageBed.provider !== 'github' ||
        !cfg.imageBed.repo?.trim() ||
        !cfg.imageBed.token?.trim()
      ) {
        return {
          platformId,
          ok: false,
          mode,
          message: '请先在「偏好设置 → 图像与图床 → GitHub」配置仓库与 Token',
        };
      }
      const adapter = new GitHubStaticAdapter({
        repo: cfg.imageBed.repo,
        branch: cfg.imageBed.branch || 'main',
        token: cfg.imageBed.token,
      });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return { platformId, ok: false, mode, message: 'GitHub Token 鉴权失败，请检查权限与仓库名' };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode, message: uploadResult.errors.join('；') };
      }
      const pushed = await adapter.push({
        title: payload.title,
        markdown: uploadResult.markdown,
        html: '',
        tags: payload.tags ?? [],
        mode,
      });
      return {
        platformId,
        ok: true,
        mode,
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送至 GitHub 仓库（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    if (platformId === 'cnblogs') {
      const cnblogsSession = session.fromPartition('persist:platform_cnblogs');
      const hasCookies = await hasSessionAuthCookies(session, 'cnblogs');
      if (!hasCookies) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录博客园，请先在「偏好设置 → 平台授权托管」完成登录授权',
        };
      }

      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: createImageBedUploader(),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }

      const sFetch = createSessionFetch(cnblogsSession);
      const res = await sFetch('https://i.cnblogs.com/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Referer': 'https://i.cnblogs.com/posts/edit',
        },
        body: JSON.stringify({
          title: payload.title,
          postType: 1,
          postBody: uploadResult.markdown,
          isDraft: true,
          isMarkdown: true,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try {
          const json = JSON.parse(errText);
          if (json.errors && json.errors.length > 0) errMsg = json.errors.join(', ');
        } catch (parseErr) { void parseErr; /* Non-JSON cnblogs error response */ }
        if (errMsg.includes('您没有开通博客')) {
          errMsg = '博客园账号尚未开通个人博客空间，请访问 https://i.cnblogs.com/ 申请开通后重试';
        }
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: `博客园发布接口返回失败: ${errMsg}`,
        };
      }

      const postData = (await res.json()) as { id?: string | number };
      const postId = postData.id ? String(postData.id) : 'draft';
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId,
        url: `https://i.cnblogs.com/posts/edit;postId=${postId}`,
        verified: true,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已成功保存至博客园草稿箱（文章 ID: ${postId}）`,
      };
    }

    if (platformId === 'zhihu') {
      const targetSession = session.fromPartition('persist:platform_zhihu');
      const adapter = new ZhihuAdapter({ fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录知乎，请先在「偏好设置 → 平台授权托管」完成扫码授权',
        };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      const rendered = renderZhihuHtml(uploadResult.markdown);
      const pushed = await adapter.push({
        title: payload.title,
        markdown: uploadResult.markdown,
        html: rendered.html,
        tags: payload.tags ?? [],
        mode: 'draft',
      });
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送到知乎专栏草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    if (platformId === 'juejin') {
      const targetSession = session.fromPartition('persist:platform_juejin');
      const adapter = new JuejinAdapter({ fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录稀土掘金，请先在「偏好设置 → 平台授权托管」完成登录授权',
        };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      const pushed = await adapter.push({
        title: payload.title,
        markdown: uploadResult.markdown,
        html: '',
        tags: payload.tags ?? [],
        mode: 'draft',
      });
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送到稀土掘金草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    if (platformId === 'csdn') {
      const targetSession = session.fromPartition('persist:platform_csdn');
      const adapter = new CsdnAdapter({ fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录 CSDN，请先在「偏好设置 → 平台授权托管」完成扫码授权',
        };
      }
      const parsed = parseCsdnMarkdown(payload.markdown, payload.title);
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: parsed.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: async (buffer, fileName) => adapter.uploadImage(buffer, fileName),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      try {
        const pushed = await adapter.push({
          title: payload.title || parsed.title,
          markdown: uploadResult.markdown,
          html: '',
          tags: payload.tags && payload.tags.length > 0 ? payload.tags : parsed.tags,
          mode: 'draft',
        });
        return {
          platformId,
          ok: true,
          mode: 'draft',
          postId: pushed.postId,
          url: pushed.url,
          verified: pushed.verified,
          uploadedImagesCount: uploadResult.uploadedCount,
          message: `已推送到 CSDN 草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
        };
      } catch (err) {
        let msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('博主不存在')) {
          msg = 'CSDN 账号尚未激活博主身份，请访问 https://mp.csdn.net/ 完善博主昵称与博客开通后重试';
        }
        return { platformId, ok: false, mode: 'draft', message: msg };
      }
    }

    if (platformId === 'baijiahao') {
      const targetSession = session.fromPartition('persist:platform_baijiahao');
      const adapter = new BaijiahaoAdapter({ fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录百家号，请先在「偏好设置 → 平台授权托管」完成登录授权',
        };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      const rendered = renderBaijiahaoHtml(uploadResult.markdown);
      const pushed = await adapter.push({
        title: payload.title,
        markdown: uploadResult.markdown,
        html: rendered.html,
        tags: payload.tags ?? [],
        mode: 'draft',
      });
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送到百家号草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    const authed = await hasSessionAuthCookies(session, platformId);
    if (!authed) {
      return {
        platformId,
        ok: false,
        mode,
        message: '未登录，请先在「偏好设置 → 平台授权托管」完成授权',
      };
    }

    let uploadedCount = 0;
    if (cfg.imageBed.strategy === 'custom_oss') {
      const uploader = createImageBedUploader();
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: uploader,
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode, message: uploadResult.errors.join('；') };
      }
      uploadedCount = uploadResult.uploadedCount;
    }

    return {
      platformId,
      ok: true,
      mode,
      verified: true,
      uploadedImagesCount: uploadedCount,
      message: `授权与防盗链图片转存校验就绪（已转存 ${uploadedCount} 张图，待接入该平台直发接口）`,
    };
  } catch (err) {
    return {
      platformId,
      ok: false,
      mode,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Registers main-process IPC handlers for publishing articles to external platforms. */
export function registerPublishHandlers(params: {
  ipcMain: Electron.IpcMain;
  session: typeof Electron.session;
  getAppConfig: () => Promise<PublishAppConfig>;
}): void {
  const { ipcMain, session, getAppConfig } = params;

  ipcMain.handle(
    'publish:weixinDraft',
    async (_event, payload: WeixinDraftIpcPayload): Promise<WeixinDraftIpcResult> => {
      try {
        const cfg = await getAppConfig();
        return await executeWeixinDraftPublish({
          session,
          workspacePath: cfg.workspacePath,
          payload,
        });
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );

  ipcMain.handle(
    'publish:multiPlatform',
    async (
      _event,
      payload: MultiPlatformPublishPayload
    ): Promise<{ results: MultiPlatformPublishResultItem[] }> => {
      const cfg = await getAppConfig();
      const results = await Promise.all(
        payload.targets.map((target) =>
          publishToSingleTarget({
            platformId: target.platformId,
            mode: target.mode,
            payload,
            cfg,
            session,
          })
        )
      );
      return { results };
    }
  );
}
