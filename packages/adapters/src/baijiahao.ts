import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

export interface BaijiahaoUserInfo {
  userid: string;
  name: string;
  avatar?: string;
  app_id?: string;
}

export interface BaijiahaoOptions {
  fetchFn?: FetchLike;
}

/** Baijiahao (百家号) adapter implementing 5-step delivery pipeline. */
export class BaijiahaoAdapter implements PlatformAdapter {
  readonly descriptor: PlatformDescriptor = {
    id: 'baijiahao',
    name: '百家号',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'medium',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/baijiahao.ts',
  };

  private readonly fetchFn: FetchLike;
  private appId: string = '';
  private userInfo: BaijiahaoUserInfo | null = null;

  constructor(options: BaijiahaoOptions = {}) {
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  getAppId(): string {
    return this.appId;
  }

  getUserInfo(): BaijiahaoUserInfo | null {
    return this.userInfo;
  }

  async checkAuth(): Promise<boolean> {
    const defaultHeaders = {
      Referer: 'https://baijiahao.baidu.com/',
      Origin: 'https://baijiahao.baidu.com',
    };

    // Primary check: official author info endpoint
    try {
      const res = await this.fetchFn(`https://baijiahao.baidu.com/builder/app/appinfo?_=${Date.now()}`, {
        headers: defaultHeaders,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          errno?: number;
          errmsg?: string;
          data?: {
            user?: { userid?: string; name?: string; avatar?: string };
            app_id?: string | number;
            userid?: string;
            name?: string;
          } | null;
        };
        const isSuccess = data.errno === 0 || data.errmsg === 'success';
        const userObj = data.data?.user;
        const appId = data.data?.app_id ? String(data.data.app_id) : '';
        const name = userObj?.name || (typeof data.data?.name === 'string' ? data.data.name : '');
        const userid = userObj?.userid || (typeof data.data?.userid === 'string' ? data.data.userid : '');
        const avatar = userObj?.avatar;

        const hasAuthor = Boolean(appId || (userObj && (userid || name)) || userid || name);
        if (isSuccess && hasAuthor) {
          this.appId = appId;
          this.userInfo = {
            userid: userid || appId,
            name: name || '百家号创作者',
            avatar,
            app_id: appId,
          };
          return true;
        }
      }
    } catch {
      // ignore and try fallback
    }

    // Fallback 1: author currentuser endpoint
    try {
      const res = await this.fetchFn(`https://baijiahao.baidu.com/builder/author/app/currentuser?_=${Date.now()}`, {
        headers: defaultHeaders,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          errno?: number;
          errmsg?: string;
          data?: { app_id?: string | number; user?: { userid?: string; name?: string }; name?: string } | null;
        };
        if ((data.errno === 0 || data.errmsg === 'success') && data.data) {
          const appId = data.data.app_id ? String(data.data.app_id) : '';
          const name = data.data.user?.name || data.data.name || '';
          const userid = data.data.user?.userid || appId || '';
          if (appId || name || userid) {
            this.appId = appId;
            this.userInfo = {
              userid: userid || appId,
              name: name || '百家号创作者',
              app_id: appId,
            };
            return true;
          }
        }
      }
    } catch {
      // ignore
    }

    // Fallback 2: author registration user info endpoint
    try {
      const res = await this.fetchFn('https://baijiahao.baidu.com/builder/author/register/get_user_info', {
        headers: defaultHeaders,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          errno?: number;
          data?: { app_id?: string | number; user?: { userid?: string; name?: string } } | null;
        };
        const appId = data.data?.app_id ? String(data.data.app_id) : '';
        const hasUser = Boolean(data.data?.user?.userid || data.data?.user?.name);
        if (data.errno === 0 && (Boolean(appId) || hasUser)) {
          this.appId = appId;
          this.userInfo = {
            userid: data.data?.user?.userid || appId,
            name: data.data?.user?.name || '百家号创作者',
            app_id: appId,
          };
          return true;
        }
      }
    } catch {
      // ignore
    }

    return false;
  }

  private async fetchAuthToken(): Promise<string> {
    try {
      const response = await this.fetchFn('https://baijiahao.baidu.com/builder/rc/edit', {
        headers: {
          Referer: 'https://baijiahao.baidu.com/',
        },
      });
      const html = await response.text();
      const match = html.match(/(?:window\.__BJH__INIT__AUTH__|["']?__BJH__INIT__AUTH__["']?)\s*[:=]\s*['"]([^'"]+)['"]/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const effectiveAppId = this.appId || '1589639493090963';
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)]);
    formData.append('media', blob, fileName);
    formData.append('type', 'image');
    formData.append('app_id', effectiveAppId);
    formData.append('is_waterlog', '1');
    formData.append('save_material', '1');
    formData.append('no_compress', '0');
    formData.append('is_events', '');
    formData.append('article_type', 'news');

    // 1. Try modern pcui picture upload proxy
    try {
      const res = await this.fetchFn('https://baijiahao.baidu.com/pcui/picture/uploadproxy', {
        method: 'POST',
        headers: {
          Referer: 'https://baijiahao.baidu.com/',
          Origin: 'https://baijiahao.baidu.com',
        },
        body: formData,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          errno?: number;
          errmsg?: string;
          ret?: { https_url?: string; url?: string };
          data?: { url?: string; https_url?: string };
        };
        const url = data.ret?.https_url || data.ret?.url || data.data?.https_url || data.data?.url;
        if (url && (data.errno === 0 || data.errmsg === 'success' || data.errno === undefined)) {
          return url;
        }
      }
    } catch {
      // ignore and try fallback
    }

    // 2. Fallback to builderinner upload
    const fallbackRes = await this.fetchFn('https://baijiahao.baidu.com/builderinner/open/resource/query/upload', {
      method: 'POST',
      body: formData,
    });

    if (!fallbackRes.ok) {
      throw new Error(`百家号图片上传失败: HTTP ${fallbackRes.status}`);
    }
    const data = (await fallbackRes.json()) as { errno?: number; data?: { url?: string } };
    const url = data.data?.url;
    if (!url) {
      throw new Error('百家号图片上传响应中缺失图片 URL');
    }
    return url;
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const token = await this.fetchAuthToken();

    // 1. Try pcui article save endpoint
    try {
      const formBody = new URLSearchParams({
        title: payload.title,
        content: payload.html,
        feed_cat: '1',
        len: String((payload.html || '').length),
        activity_list: JSON.stringify([{ id: 408, is_checked: 0 }]),
        source_reprinted_allow: '0',
        original_status: '0',
        original_handler_status: '1',
        isBeautify: 'false',
        subtitle: '',
        bjhtopic_id: '',
        bjhtopic_info: '',
        type: 'news',
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://baijiahao.baidu.com/',
        Origin: 'https://baijiahao.baidu.com',
      };
      if (token) {
        headers['token'] = token;
      }

      const res = await this.fetchFn('https://baijiahao.baidu.com/pcui/article/save?callback=bjhdraft', {
        method: 'POST',
        headers,
        body: formBody.toString(),
      });

      if (res.ok) {
        const text = await res.text();
        const jsonStr = text.trim().replace(/^bjhdraft\s*\(/, '').replace(/\);?\s*$/, '').trim();
        const data = JSON.parse(jsonStr) as {
          errno?: number;
          errmsg?: string;
          ret?: { article_id?: string | number };
          data?: { article_id?: string | number };
        };
        const articleId = data.ret?.article_id || data.data?.article_id;
        if ((data.errno === 0 || data.errmsg === 'success') && articleId) {
          const idStr = String(articleId);
          return {
            postId: idStr,
            url: `https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=${idStr}`,
            mode: 'draft',
            verified: true,
          };
        }
      }
    } catch {
      // try fallback endpoint
    }

    // 2. Fallback to builderinner article save
    const res = await this.fetchFn('https://baijiahao.baidu.com/builderinner/open/resource/article/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: payload.title,
        content: payload.html,
        is_draft: 1, // 1 = draft
      }),
    });

    if (!res.ok) {
      throw new Error(`百家号草稿保存失败: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { errno?: number; data?: { article_id?: string | number }; errmsg?: string };
    if (data.errno !== 0 && data.errno !== undefined) {
      throw new Error(`百家号草稿接口返回错误: ${data.errmsg || '未知错误'}`);
    }

    const articleId = data.data?.article_id ? String(data.data.article_id) : 'draft';
    return {
      postId: articleId,
      url: `https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=${articleId}`,
      mode: 'draft',
      verified: true,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    try {
      const res = await this.fetchFn(
        `https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=${postId}`,
        {
          headers: {
            Referer: 'https://baijiahao.baidu.com/',
          },
        }
      );
      if (res.ok && res.status === 200) {
        return true;
      }
    } catch {
      // try fallback
    }

    try {
      const res = await this.fetchFn(
        `https://baijiahao.baidu.com/builderinner/open/resource/article/detail?article_id=${postId}`
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { errno?: number };
      return data.errno === 0;
    } catch {
      return false;
    }
  }
}
