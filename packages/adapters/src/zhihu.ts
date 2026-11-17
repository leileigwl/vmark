import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

export interface ZhihuOptions {
  fetchFn?: FetchLike;
}

/** Zhihu (知乎专栏) adapter implementing 5-step delivery pipeline. */
export class ZhihuAdapter implements PlatformAdapter {
  readonly descriptor: PlatformDescriptor = {
    id: 'zhihu',
    name: '知乎',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'low',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/zhihu.ts',
  };

  private readonly fetchFn: FetchLike;

  constructor(options: ZhihuOptions = {}) {
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  async checkAuth(): Promise<boolean> {
    try {
      const res = await this.fetchFn('https://www.zhihu.com/api/v4/me', {
        headers: {
          'x-requested-with': 'fetch',
        },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { id?: string; uid?: string };
      return Boolean(data.id || data.uid);
    } catch {
      return false;
    }
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)]);
    formData.append('picture', blob, fileName);
    formData.append('source', 'article');

    const res = await this.fetchFn('https://zhuanlan.zhihu.com/api/uploaded_images', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`知乎图片上传失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { src?: string; url?: string };
    const url = data.src || data.url;
    if (!url) {
      throw new Error('知乎图片上传响应中缺失图片 URL');
    }
    return url;
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const res = await this.fetchFn('https://zhuanlan.zhihu.com/api/articles/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: payload.title,
        content: payload.html,
        delta_time: 0,
      }),
    });

    if (!res.ok) {
      throw new Error(`知乎草稿创建失败: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { id: string | number; url?: string };
    const postId = String(data.id);
    const draftUrl = data.url || `https://zhuanlan.zhihu.com/p/${postId}/edit`;

    return {
      postId,
      url: draftUrl,
      mode: 'draft',
      verified: true,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    try {
      const res = await this.fetchFn(`https://zhuanlan.zhihu.com/api/articles/${postId}/draft`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
