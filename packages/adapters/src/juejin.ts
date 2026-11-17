import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

export interface JuejinOptions {
  fetchFn?: FetchLike;
}

/** Juejin (稀土掘金) adapter implementing 5-step delivery pipeline. */
export class JuejinAdapter implements PlatformAdapter {
  readonly descriptor: PlatformDescriptor = {
    id: 'juejin',
    name: '稀土掘金',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'low',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/juejin.ts',
  };

  private readonly fetchFn: FetchLike;

  constructor(options: JuejinOptions = {}) {
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  async checkAuth(): Promise<boolean> {
    try {
      const res = await this.fetchFn('https://api.juejin.cn/user_api/v1/user/get');
      if (!res.ok) return false;
      const data = (await res.json()) as { err_no: number; data?: { user_id?: string } };
      return data.err_no === 0 && Boolean(data.data?.user_id);
    } catch {
      return false;
    }
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)]);
    formData.append('file', blob, fileName);

    const res = await this.fetchFn('https://api.juejin.cn/web/upload_image', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`掘金图片上传失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { err_no?: number; data?: string; url?: string };
    const url = data.data || data.url;
    if (!url) {
      throw new Error('掘金图片上传响应中缺失图片 URL');
    }
    return url;
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const res = await this.fetchFn('https://api.juejin.cn/content_api/v1/article_draft/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: payload.title,
        mark_content: payload.markdown,
        category_id: payload.categoryId || '6809637767543259144',
      }),
    });

    if (!res.ok) {
      throw new Error(`掘金草稿创建失败: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { err_no: number; err_msg?: string; data?: { id: string } };
    if (data.err_no !== 0 || !data.data?.id) {
      throw new Error(`掘金草稿接口返回错误: ${data.err_msg || '未知错误'}`);
    }

    const postId = data.data.id;
    return {
      postId,
      url: `https://juejin.cn/editor/drafts/${postId}`,
      mode: 'draft',
      verified: true,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    try {
      const res = await this.fetchFn('https://api.juejin.cn/content_api/v1/article_draft/detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: postId }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { err_no: number };
      return data.err_no === 0;
    } catch {
      return false;
    }
  }
}
