import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import { computeCrc32Hex, signAws4Request } from './imagexSign.ts';
import type { FetchLike } from './weixin.ts';

const IMAGEX_AID = '2608';
const IMAGEX_SERVICE_ID = '73owjymdk6';

export interface JuejinCategory {
  id: string;
  name: string;
}

/**
 * 掘金文章分类（草稿创建请求里的 category_id）。
 * 来源：POST https://api.juejin.cn/tag_api/v1/query_category_list（2026-11-23 抓取，err_no=0）。
 * 运行时优先用 listCategories() 拉最新列表，拉不到时用这一份。
 */
export const JUEJIN_CATEGORIES: readonly JuejinCategory[] = [
  { id: '6809637769959178254', name: '后端' },
  { id: '6809637767543259144', name: '前端' },
  { id: '6809635626879549454', name: 'Android' },
  { id: '6809635626661445640', name: 'iOS' },
  { id: '6809637773935378440', name: '人工智能' },
  { id: '6809637771511070734', name: '开发工具' },
  { id: '6809637776263217160', name: '代码人生' },
  { id: '6809637772874219534', name: '阅读' },
];

export interface JuejinOptions {
  fetchFn?: FetchLike;
}

interface ImageXToken {
  AccessKeyId: string;
  SecretAccessKey: string;
  SessionToken: string;
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
  private readonly uuid: string = `${Date.now()}${Math.floor(Math.random() * 100000)}`;

  constructor(options: JuejinOptions = {}) {
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  async checkAuth(): Promise<boolean> {
    try {
      const res = await this.fetchFn('https://api.juejin.cn/user_api/v1/user/get', {
        headers: {
          Origin: 'https://juejin.cn',
          Referer: 'https://juejin.cn/',
        },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { err_no: number; data?: { user_id?: string | number } };
      const userId = String(data.data?.user_id ?? '').trim();
      return data.err_no === 0 && Boolean(userId) && userId !== '0';
    } catch {
      return false;
    }
  }

  /** 拉取掘金文章分类；接口失败或返回空时退回内置 JUEJIN_CATEGORIES。 */
  async listCategories(): Promise<JuejinCategory[]> {
    try {
      const res = await this.fetchFn('https://api.juejin.cn/tag_api/v1/query_category_list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://juejin.cn', Referer: 'https://juejin.cn/' },
        body: '{}',
      });
      if (!res.ok) return [...JUEJIN_CATEGORIES];
      const data = (await res.json()) as {
        err_no?: number;
        data?: Array<{ category_id?: string; category?: { category_name?: string } }>;
      };
      const list = (Array.isArray(data.data) ? data.data : [])
        .map((c) => ({ id: String(c.category_id ?? ''), name: c.category?.category_name ?? '' }))
        .filter((c) => c.id && c.name);
      return data.err_no === 0 && list.length > 0 ? list : [...JUEJIN_CATEGORIES];
    } catch {
      return [...JUEJIN_CATEGORIES];
    }
  }

  /** Obtains ByteDance SecSDK CSRF token if available to prevent 403 request rejections. */
  async getCsrfToken(): Promise<string> {
    try {
      const res = await this.fetchFn('https://api.juejin.cn/user_api/v1/sys/token', {
        method: 'HEAD',
        headers: {
          'x-secsdk-csrf-request': '1',
          'x-secsdk-csrf-version': '1.2.10',
        },
      });
      const wareToken = res.headers?.get('x-ware-csrf-token');
      if (!wareToken) return '';
      const parts = wareToken.split(',');
      return parts[1] || '';
    } catch {
      return '';
    }
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const tokenRes = await this.fetchFn(
      `https://api.juejin.cn/imagex/v2/gen_token?aid=${IMAGEX_AID}&uuid=${this.uuid}&client=web`,
      { headers: { Referer: 'https://juejin.cn/', Origin: 'https://juejin.cn' } }
    );
    if (!tokenRes.ok) {
      throw new Error(`掘金获取 ImageX 凭证失败: HTTP ${tokenRes.status}`);
    }
    const tokenJson = (await tokenRes.json()) as {
      err_no?: number;
      err_msg?: string;
      data?: { token?: ImageXToken };
    };
    const token = tokenJson.data?.token;
    if ((tokenJson.err_no && tokenJson.err_no !== 0) || !token?.AccessKeyId || !token.SecretAccessKey) {
      throw new Error(`掘金 ImageX 凭证无效: ${tokenJson.err_msg || '请检查登录状态'}`);
    }

    const applyUrl = `https://imagex.bytedanceapi.com/?Action=ApplyImageUpload&Version=2018-08-01&ServiceId=${IMAGEX_SERVICE_ID}`;
    const applyHeaders = signAws4Request({
      method: 'GET',
      url: applyUrl,
      accessKeyId: token.AccessKeyId,
      secretAccessKey: token.SecretAccessKey,
      securityToken: token.SessionToken,
    });
    const applyRes = await this.fetchFn(applyUrl, { method: 'GET', headers: applyHeaders });
    if (!applyRes.ok) {
      throw new Error(`掘金 ImageX 申请上传失败: HTTP ${applyRes.status}`);
    }
    const applyData = (await applyRes.json()) as {
      Result?: {
        UploadAddress?: {
          SessionKey: string;
          UploadHosts: string[];
          StoreInfos: Array<{ StoreUri: string; Auth: string }>;
        };
      };
    };
    const uploadAddr = applyData.Result?.UploadAddress;
    const storeInfo = uploadAddr?.StoreInfos?.[0];
    const uploadHost = uploadAddr?.UploadHosts?.[0];
    if (!uploadAddr?.SessionKey || !storeInfo?.StoreUri || !uploadHost) {
      throw new Error('掘金 ImageX 上传地址响应无效');
    }

    const bytes = new Uint8Array(buffer);
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    const tosRes = await this.fetchFn(`https://${uploadHost}/${storeInfo.StoreUri}`, {
      method: 'PUT',
      headers: {
        Authorization: storeInfo.Auth,
        'Content-Type': mime,
        'Content-CRC32': computeCrc32Hex(bytes),
      },
      body: new Blob([bytes], { type: mime }),
    });
    if (!tosRes.ok) {
      throw new Error(`掘金 TOS 图片上传失败: HTTP ${tosRes.status}`);
    }

    const commitUrl = `https://imagex.bytedanceapi.com/?Action=CommitImageUpload&Version=2018-08-01&SessionKey=${encodeURIComponent(uploadAddr.SessionKey)}&ServiceId=${IMAGEX_SERVICE_ID}`;
    const commitHeaders = signAws4Request({
      method: 'POST',
      url: commitUrl,
      accessKeyId: token.AccessKeyId,
      secretAccessKey: token.SecretAccessKey,
      securityToken: token.SessionToken,
    });
    const commitRes = await this.fetchFn(commitUrl, {
      method: 'POST',
      headers: commitHeaders,
    });
    if (!commitRes.ok) {
      throw new Error(`掘金 ImageX 提交上传失败: HTTP ${commitRes.status}`);
    }

    const urlRes = await this.fetchFn(
      `https://api.juejin.cn/imagex/v2/get_img_url?aid=${IMAGEX_AID}&uuid=${this.uuid}&uri=${encodeURIComponent(storeInfo.StoreUri)}&img_type=private`,
      { headers: { Referer: 'https://juejin.cn/', Origin: 'https://juejin.cn' } }
    );
    if (!urlRes.ok) {
      throw new Error(`掘金获取图片链接失败: HTTP ${urlRes.status}`);
    }
    const urlData = (await urlRes.json()) as { data?: { main_url?: string; backup_url?: string } };
    const finalUrl = urlData.data?.main_url || urlData.data?.backup_url;
    if (!finalUrl) {
      throw new Error('掘金图片上传响应中缺失图片 URL');
    }
    return finalUrl;
  }

  /**
   * 标签名换成掘金 tag_id：POST tag_api/v1/query_tag_list 按关键词搜，名称完全相同的优先，否则取第一个结果；
   * 搜不到或接口出错的标签跳过。掘金一篇最多 3 个标签。
   */
  async resolveTagIds(names: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      if (ids.length >= 3) break;
      try {
        const res = await this.fetchFn('https://api.juejin.cn/tag_api/v1/query_tag_list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://juejin.cn', Referer: 'https://juejin.cn/' },
          body: JSON.stringify({ cursor: '0', key_word: name, limit: 10, sort_type: 1 }),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { err_no?: number; data?: Array<{ tag_id?: string; tag?: { tag_name?: string } }> };
        const list = data.err_no === 0 && Array.isArray(data.data) ? data.data : [];
        const hit = list.find((t) => t.tag?.tag_name === name) ?? list[0];
        if (hit?.tag_id && !ids.includes(hit.tag_id)) ids.push(hit.tag_id);
      } catch {
        /* 单个标签查不到不影响存草稿 */
      }
    }
    return ids;
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const csrfToken = await this.getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Origin: 'https://juejin.cn',
      Referer: 'https://juejin.cn/',
    };
    if (csrfToken) {
      headers['x-secsdk-csrf-token'] = csrfToken;
    }

    const res = await this.fetchFn('https://api.juejin.cn/content_api/v1/article_draft/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        brief_content: payload.digest?.trim() ?? '',
        category_id: payload.categoryId || '0',
        cover_image: '',
        edit_type: 10,
        html_content: 'deprecated',
        link_url: '',
        mark_content: payload.markdown,
        tag_ids: await this.resolveTagIds(payload.tags),
        title: payload.title,
      }),
    });

    if (!res.ok) {
      throw new Error(`掘金草稿创建失败: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { err_no: number; err_msg?: string; data?: { id: string } };
    if (data.err_no !== 0 || !data.data?.id) {
      if (data.err_no === 403 || data.err_msg?.toLowerCase().includes('must login')) {
        throw new Error('掘金登录态已失效（must login），请先在「偏好设置 → 平台授权托管」重新登录稀土掘金');
      }
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
