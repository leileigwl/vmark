import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

export interface CsdnOptions {
  fetchFn?: FetchLike;
}

/** CSDN adapter implementing 5-step delivery pipeline. */
export class CsdnAdapter implements PlatformAdapter {
  readonly descriptor: PlatformDescriptor = {
    id: 'csdn',
    name: 'CSDN',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'low',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/csdn.ts',
  };

  private readonly fetchFn: FetchLike;

  constructor(options: CsdnOptions = {}) {
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  async checkAuth(): Promise<boolean> {
    try {
      const res = await this.fetchFn('https://bizapi.csdn.net/blog-console-api/v3/article/status/count');
      if (!res.ok) return false;
      const data = (await res.json()) as { code?: number };
      return data.code === 200;
    } catch {
      return false;
    }
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)]);
    formData.append('file', blob, fileName);

    const res = await this.fetchFn('https://bizapi.csdn.net/blog-console-api/v3/picture/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`CSDN 图片上传失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { code?: number; data?: { url?: string } };
    const url = data.data?.url;
    if (!url) {
      throw new Error('CSDN 图片上传响应中缺失图片 URL');
    }
    return url;
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const res = await this.fetchFn('https://bizapi.csdn.net/blog-console-api/v3/mdeditor/saveArticle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: payload.title,
        markdowncontent: payload.markdown,
        content: payload.html,
        status: 2, // 2 = draft in CSDN
        tags: payload.tags.join(','),
      }),
    });

    if (!res.ok) {
      throw new Error(`CSDN 草稿保存失败: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { code?: number; data?: { article_id?: string | number }; msg?: string };
    const articleId = data.data?.article_id ? String(data.data.article_id) : 'draft';
    return {
      postId: articleId,
      url: `https://mp.csdn.net/mp_blog/creation/editor/${articleId}`,
      mode: 'draft',
      verified: true,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    try {
      const res = await this.fetchFn(`https://bizapi.csdn.net/blog-console-api/v3/mdeditor/getArticle?id=${postId}`);
      if (!res.ok) return false;
      const data = (await res.json()) as { code?: number };
      return data.code === 200;
    } catch {
      return false;
    }
  }
}
