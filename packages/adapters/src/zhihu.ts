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
          'referer': 'https://www.zhihu.com/',
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
      headers: {
        'x-requested-with': 'fetch',
        'referer': 'https://zhuanlan.zhihu.com/write',
        'origin': 'https://zhuanlan.zhihu.com',
      },
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
    // 步骤 1：创建知乎专栏草稿容器（获取草稿 ID）
    const createRes = await this.fetchFn('https://zhuanlan.zhihu.com/api/articles/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'fetch',
        'referer': 'https://zhuanlan.zhihu.com/write',
        'origin': 'https://zhuanlan.zhihu.com',
      },
      body: JSON.stringify({
        title: payload.title,
        content: '',
        delta_time: 0,
      }),
    });

    if (!createRes.ok) {
      throw new Error(`知乎草稿创建失败: HTTP ${createRes.status}`);
    }

    const createData = (await createRes.json()) as { id: string | number; url?: string };
    const postId = String(createData.id);

    // 步骤 2：对知乎草稿执行 PATCH 更新富文本内容（知乎后台要求二次 PATCH 才能落盘正文）
    const updateRes = await this.fetchFn(`https://zhuanlan.zhihu.com/api/articles/${postId}/draft`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'fetch',
        'referer': `https://zhuanlan.zhihu.com/p/${postId}/edit`,
        'origin': 'https://zhuanlan.zhihu.com',
      },
      body: JSON.stringify({
        title: payload.title,
        content: payload.html,
      }),
    });

    if (!updateRes.ok) {
      throw new Error(`知乎草稿内容保存失败: HTTP ${updateRes.status}`);
    }

    const draftUrl = `https://zhuanlan.zhihu.com/p/${postId}/edit`;

    return {
      postId,
      url: draftUrl,
      mode: 'draft',
      verified: true,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    try {
      const res = await this.fetchFn(`https://zhuanlan.zhihu.com/api/articles/${postId}/draft`, {
        headers: {
          'x-requested-with': 'fetch',
          'referer': `https://zhuanlan.zhihu.com/p/${postId}/edit`,
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
