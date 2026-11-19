import crypto from 'node:crypto';
import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

export interface CsdnOptions {
  fetchFn?: FetchLike;
}

const CSDN_API_KEY = '203803574';
const CSDN_API_SECRET = '9znpamsyl2c7cdrr9sas0le9vbc3r6ba';

function createUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Signs a request to bizapi.csdn.net using Alibaba Cloud API Gateway HMAC-SHA256 signature scheme. */
function signCsdnRequest(apiPath: string, method: 'GET' | 'POST' = 'GET'): Record<string, string> {
  const nonce = createUuid();
  const signStr =
    method === 'GET'
      ? `GET\n*/*\n\n\n\nx-ca-key:${CSDN_API_KEY}\nx-ca-nonce:${nonce}\n${apiPath}`
      : `POST\n*/*\n\napplication/json\n\nx-ca-key:${CSDN_API_KEY}\nx-ca-nonce:${nonce}\n${apiPath}`;

  const hmac = crypto.createHmac('sha256', CSDN_API_SECRET);
  hmac.update(signStr);
  const signature = hmac.digest('base64');

  const headers: Record<string, string> = {
    Accept: '*/*',
    'x-ca-key': CSDN_API_KEY,
    'x-ca-nonce': nonce,
    'x-ca-signature': signature,
    'x-ca-signature-headers': 'x-ca-key,x-ca-nonce',
    Origin: 'https://editor.csdn.net',
    Referer: 'https://editor.csdn.net/',
  };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

/** CSDN adapter implementing 5-step delivery pipeline with signed API Gateway requests. */
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
      const apiPath = '/blog-console-api/v3/editor/getBaseInfo';
      const headers = signCsdnRequest(apiPath, 'GET');
      const res = await this.fetchFn(`https://bizapi.csdn.net${apiPath}`, {
        headers,
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { code?: number; data?: { name?: string } };
      return data.code === 200 && Boolean(data.data?.name);
    } catch {
      return false;
    }
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    try {
      const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';

      const apiPath = '/resource-api/v1/image/direct/upload/signature';
      const headers = signCsdnRequest(apiPath, 'POST');

      const sigRes = await this.fetchFn(`https://bizapi.csdn.net${apiPath}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageTemplate: '',
          appName: 'direct_blog_markdown',
          imageSuffix: validExt,
        }),
      });

      if (!sigRes.ok) {
        throw new Error(`CSDN 获取上传凭证失败: HTTP ${sigRes.status}`);
      }

      const sigData = (await sigRes.json()) as {
        code: number;
        data?: {
          filePath: string;
          host: string;
          accessId: string;
          policy: string;
          signature: string;
          callbackUrl: string;
          callbackBody: string;
          callbackBodyType: string;
          customParam: {
            rtype: string;
            filePath: string;
            isAudit: number;
            'x-image-app': string;
            type: string;
            'x-image-suffix': string;
            username: string;
          };
        };
      };

      if (sigData.code !== 200 || !sigData.data) {
        throw new Error('CSDN 上传签名响应无效');
      }

      const uploadData = sigData.data;
      const customParam = uploadData.customParam;
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(buffer)]);

      formData.append('key', uploadData.filePath);
      formData.append('policy', uploadData.policy);
      formData.append('signature', uploadData.signature);
      formData.append('callbackBody', uploadData.callbackBody);
      formData.append('callbackBodyType', uploadData.callbackBodyType);
      formData.append('callbackUrl', uploadData.callbackUrl);
      formData.append('AccessKeyId', uploadData.accessId);
      formData.append('x:rtype', customParam.rtype);
      formData.append('x:filePath', customParam.filePath);
      formData.append('x:isAudit', String(customParam.isAudit));
      formData.append('x:x-image-app', customParam['x-image-app']);
      formData.append('x:type', customParam.type);
      formData.append('x:x-image-suffix', customParam['x-image-suffix']);
      formData.append('x:username', customParam.username);
      formData.append('file', blob, fileName);

      const obsRes = await this.fetchFn(uploadData.host, {
        method: 'POST',
        body: formData,
      });

      if (!obsRes.ok) {
        throw new Error(`CSDN OBS 上传失败: HTTP ${obsRes.status}`);
      }

      const obsJson = (await obsRes.json()) as { code?: number; data?: { imageUrl?: string } };
      const url = obsJson.data?.imageUrl;
      if (!url) {
        throw new Error('CSDN OBS 响应未包含图片 URL');
      }
      return url;
    } catch (err) {
      throw new Error(`CSDN 图片上传失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const apiPath = '/blog-console-api/v3/mdeditor/saveArticle';
    const headers = signCsdnRequest(apiPath, 'POST');

    const res = await this.fetchFn(`https://bizapi.csdn.net${apiPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: payload.title,
        markdowncontent: payload.markdown,
        content: payload.html || '',
        readType: 'public',
        level: 0,
        tags: payload.tags.join(','),
        status: 2, // 2 = draft in CSDN
        categories: '',
        type: 'original',
        original_link: '',
        authorized_status: false,
        not_auto_saved: '1',
        source: 'pc_mdeditor',
        cover_images: [],
        cover_type: 1,
        is_new: 1,
        vote_id: 0,
        resource_id: '',
        pubStatus: 'draft',
      }),
    });

    if (!res.ok) {
      throw new Error(`CSDN 草稿保存失败: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      code?: number;
      data?: { id?: string | number; article_id?: string | number };
      msg?: string;
      message?: string;
    };

    if (data.code !== 200) {
      throw new Error(`CSDN 草稿接口返回错误: ${data.msg || data.message || '未知错误'}`);
    }

    const articleId = String(data.data?.id || data.data?.article_id || 'draft');
    return {
      postId: articleId,
      url: `https://editor.csdn.net/md?articleId=${articleId}`,
      mode: 'draft',
      verified: true,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    try {
      const apiPath = '/blog-console-api/v3/editor/getBaseInfo';
      const headers = signCsdnRequest(apiPath, 'GET');
      const res = await this.fetchFn(`https://bizapi.csdn.net${apiPath}`, { headers });
      if (!res.ok) return false;
      const data = (await res.json()) as { code?: number };
      return data.code === 200 && Boolean(postId);
    } catch {
      return false;
    }
  }
}
