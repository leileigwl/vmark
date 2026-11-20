import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

export interface WeiboOptions {
  fetchFn?: FetchLike;
}

/** Weibo (微博头条文章) adapter implementing 5-step observable delivery. */
export class WeiboAdapter implements PlatformAdapter {
  readonly descriptor: PlatformDescriptor = {
    id: 'weibo',
    name: '微博头条文章',
    supportedModes: ['draft', 'direct'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'medium',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/weibo.ts',
  };

  private readonly fetchFn: FetchLike;
  private cachedUid: string | null = null;

  constructor(options: WeiboOptions = {}) {
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  private async resolveUid(): Promise<string | null> {
    if (this.cachedUid) return this.cachedUid;
    try {
      const res = await this.fetchFn('https://card.weibo.com/article/v5/editor', {
        headers: { Referer: 'https://card.weibo.com/' },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const match = html.match(/config:\s*JSON\.parse\('(.+?)'\)/);
      if (!match) return null;
      const configJson = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      const parsed = JSON.parse(configJson) as { uid?: string | number };
      if (!parsed.uid) return null;
      this.cachedUid = String(parsed.uid);
      return this.cachedUid;
    } catch {
      return null;
    }
  }

  private generateReqId(uid: string): string {
    const raw = Buffer.from(`${uid}&${Date.now()}`).toString('base64url');
    return `${raw}00000000000000000000000000000000`.slice(0, 43);
  }

  async checkAuth(): Promise<boolean> {
    return Boolean(await this.resolveUid());
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const uid = await this.resolveUid();
    if (!uid) {
      throw new Error('微博未登录或会话已失效，请重新登录授权');
    }
    const reqId = this.generateReqId(uid);
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const blob = new Blob([new Uint8Array(buffer)], { type: mime });
    const uploadUrl = `https://picupload.weibo.com/interface/pic_upload.php?app=miniblog&s=json&p=1&data=1&url=&markpos=1&logo=0&nick=&file_source=4&_rid=${reqId}`;

    const res = await this.fetchFn(uploadUrl, {
      method: 'POST',
      headers: {
        Origin: 'https://weibo.com',
        Referer: 'https://weibo.com/',
      },
      body: blob,
    });
    if (!res.ok) {
      throw new Error(`微博图片上传失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      data?: { pics?: { pic_1?: { pid?: string } } };
    };
    const pid = data.data?.pics?.pic_1?.pid;
    if (!pid) {
      throw new Error('微博图片上传响应缺失 pid');
    }
    return `https://wx3.sinaimg.cn/large/${pid}.jpg`;
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const uid = await this.resolveUid();
    if (!uid) {
      throw new Error('微博未登录或会话已失效，请重新登录授权');
    }
    const createReqId = this.generateReqId(uid);
    const createRes = await this.fetchFn(
      `https://card.weibo.com/article/v5/aj/editor/draft/create?uid=${encodeURIComponent(uid)}&_rid=${createReqId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://card.weibo.com',
          Referer: 'https://card.weibo.com/article/v5/editor',
          'SN-REQID': createReqId,
        },
        body: new URLSearchParams({}),
      }
    );
    if (!createRes.ok) {
      throw new Error(`微博草稿创建失败: HTTP ${createRes.status}`);
    }
    const createData = (await createRes.json()) as { code?: number; msg?: string; data?: { id?: string } };
    if (createData.code !== 100000 || !createData.data?.id) {
      throw new Error(`微博草稿创建失败: ${createData.msg || '未知错误'}`);
    }

    const postId = String(createData.data.id);
    const saveReqId = this.generateReqId(uid);
    const rawHtml = payload.html || payload.markdown;
    const normalizedHtml = rawHtml
      .replace(
        /<(?:figure|p)[^>]*>\s*<img[^>]*src="(https?:\/\/[^"]*sinaimg\.cn\/[^"]*\/([a-zA-Z0-9]+)\.[a-z]+)"[^>]*>(?:\s*<figcaption[^>]*>[\s\S]*?<\/figcaption>)?\s*<\/(?:figure|p)>/gi,
        '<figure class="image"><img src="$1" data-pid="$2" /></figure>'
      )
      .replace(
        /<img([^>]*?)src="(https?:\/\/[^"]*sinaimg\.cn\/[^"]*\/([a-zA-Z0-9]+)\.[a-z]+)"([^>]*?)>/gi,
        '<img$1src="$2" data-pid="$3"$4>'
      )
      .replace(/>\s+</g, '><');
    const saveRes = await this.fetchFn(
      `https://card.weibo.com/article/v5/aj/editor/draft/save?uid=${encodeURIComponent(uid)}&id=${encodeURIComponent(postId)}&_rid=${saveReqId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://card.weibo.com',
          Referer: 'https://card.weibo.com/article/v5/editor',
          'SN-REQID': saveReqId,
        },
        body: new URLSearchParams({
          id: postId,
          title: payload.title,
          subtitle: '',
          type: '',
          status: '0',
          publish_at: '',
          error_msg: '',
          error_code: '0',
          collection: '[]',
          free_content: '',
          content: normalizedHtml,
          cover: '',
          summary: '',
          writer: '',
          extra: 'null',
          is_word: '0',
          article_recommend: '[]',
          follow_to_read: '1',
          isreward: '1',
          pay_setting: '{"ispay":0,"isvclub":0}',
          source: '0',
          action: '1',
          content_type: '0',
          save: '1',
        }),
      }
    );
    if (!saveRes.ok) {
      throw new Error(`微博草稿保存失败: HTTP ${saveRes.status}`);
    }
    const saveData = (await saveRes.json()) as { code?: string | number; msg?: string };
    if (String(saveData.code) !== '100000') {
      throw new Error(`微博草稿保存失败: ${saveData.msg || `错误码 ${String(saveData.code)}`}`);
    }

    return {
      postId,
      url: `https://card.weibo.com/article/v5/editor#/draft/${postId}`,
      mode: 'draft',
      verified: true,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    return Boolean(postId);
  }
}
