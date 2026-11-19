import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

export interface BilibiliOptions {
  csrfToken?: string;
  fetchFn?: FetchLike;
}

/** Bilibili Column (B站专栏) adapter implementing 5-step observable delivery. */
export class BilibiliAdapter implements PlatformAdapter {
  readonly descriptor: PlatformDescriptor = {
    id: 'bilibili',
    name: 'B 站专栏',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'low',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/bilibili.ts',
  };

  private readonly csrfToken: string;
  private readonly fetchFn: FetchLike;

  constructor(options: BilibiliOptions = {}) {
    this.csrfToken = options.csrfToken ?? '';
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  async checkAuth(): Promise<boolean> {
    try {
      const res = await this.fetchFn('https://api.bilibili.com/x/web-interface/nav', {
        headers: { Referer: 'https://member.bilibili.com/' },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { code?: number; data?: { isLogin?: boolean } };
      return data.code === 0 && Boolean(data.data?.isLogin);
    } catch {
      return false;
    }
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const formData = new FormData();
    formData.append('binary', new Blob([new Uint8Array(buffer)]), fileName);
    if (this.csrfToken) {
      formData.append('csrf', this.csrfToken);
    }

    const res = await this.fetchFn('https://api.bilibili.com/x/article/creative/article/upcover', {
      method: 'POST',
      headers: {
        Origin: 'https://member.bilibili.com',
        Referer: 'https://member.bilibili.com/',
      },
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`B 站专栏图片上传失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { code?: number; message?: string; data?: { url?: string } };
    if (data.code !== 0 || !data.data?.url) {
      throw new Error(`B 站专栏图片上传失败: ${data.message || '响应缺少图片 URL'}`);
    }
    return data.data.url.startsWith('//') ? `https:${data.data.url}` : data.data.url;
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const body = new URLSearchParams({
      title: payload.title,
      content: payload.html || payload.markdown,
      category: payload.categoryId || '0',
      summary: payload.markdown.replace(/[#>*`!\[\]()-]/g, '').trim().slice(0, 120),
      csrf: this.csrfToken,
    });

    const res = await this.fetchFn('https://api.bilibili.com/x/article/creative/draft/addupdate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://member.bilibili.com',
        Referer: 'https://member.bilibili.com/',
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`B 站专栏草稿保存失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { code?: number; message?: string; data?: { aid?: number | string } };
    if (data.code !== 0 || !data.data?.aid) {
      throw new Error(`B 站专栏草稿接口返回错误: ${data.message || '未知错误'}`);
    }

    const postId = String(data.data.aid);
    const verified = await this.verifyDelivery(postId);
    return {
      postId,
      url: `https://member.bilibili.com/article-text/home?aid=${encodeURIComponent(postId)}`,
      mode: 'draft',
      verified,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    if (!postId) return false;
    try {
      const res = await this.fetchFn(
        `https://api.bilibili.com/x/article/creative/draft/view?aid=${encodeURIComponent(postId)}`,
        { headers: { Referer: 'https://member.bilibili.com/' } }
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { code?: number };
      return data.code === 0;
    } catch {
      return false;
    }
  }
}
