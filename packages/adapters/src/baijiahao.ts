import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

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

  constructor(options: BaijiahaoOptions = {}) {
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  async checkAuth(): Promise<boolean> {
    try {
      const res = await this.fetchFn('https://baijiahao.baidu.com/builder/author/register/get_user_info');
      if (!res.ok) return false;
      const data = (await res.json()) as { errno?: number; data?: { app_id?: string } };
      return data.errno === 0 && Boolean(data.data?.app_id);
    } catch {
      return false;
    }
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)]);
    formData.append('media', blob, fileName);

    const res = await this.fetchFn('https://baijiahao.baidu.com/builderinner/open/resource/query/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`百家号图片上传失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { errno?: number; data?: { url?: string } };
    const url = data.data?.url;
    if (!url) {
      throw new Error('百家号图片上传响应中缺失图片 URL');
    }
    return url;
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
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
      const res = await this.fetchFn(`https://baijiahao.baidu.com/builderinner/open/resource/article/detail?article_id=${postId}`);
      if (!res.ok) return false;
      const data = (await res.json()) as { errno?: number };
      return data.errno === 0;
    } catch {
      return false;
    }
  }
}
