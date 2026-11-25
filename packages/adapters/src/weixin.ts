import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';

export interface WeixinAuthMeta {
  token: string;
  userName: string;
  nickName: string;
  ticket: string;
  svrTime: number;
}

export interface WeixinDraftPayload extends AdapterPushPayload {
  author?: string;
  digest?: string;
  coverImageUrl?: string;
  /**
   * 1:1 转发/分享图：按用户选的焦点裁好的方图（已上传到 mmbiz 的地址）。
   * 公众号网页后台的 operate_appmsg 用 `cdn_1_1_url0` 接收现成的 1:1 裁剪图；不传则退回 coverImageUrl，由微信居中裁。
   */
  coverSquareImageUrl?: string;
  coverFileId?: string;
  showCoverInBody?: boolean;
  sourceUrl?: string;
  needOpenComment?: boolean;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  /** 跟随重定向后的最终地址（可选；能拿到时用来识别「被跳回登录页」）。 */
  url?: string;
  headers?: { get: (name: string) => string | null };
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

/**
 * 从公众号后台页面脚本 `window.wx = { data: { t: "<token>", ... } }` 里取 token。
 * 只认 data 对象里独立的 `t` 键（前面是 `{`、`,` 或空白），值必须是纯数字（公众号 token 都是数字）；
 * 旧写法 `data:\s*\{[\s\S]*?t:` 会跨键匹配到 `content: "..."` 这类键末尾的 `t:`，把登录页误判成已登录。
 */
export function extractWeixinTokenFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/[?&]token=(\d+)(?:&|#|$)/);
  return m ? m[1] : null;
}

export function parseWeixinToken(html: string): string | null {
  const m = html.match(/data:\s*\{[^{}]*?(?:^|[{,\s])t\s*:\s*["']?(\d{4,})["']?/);
  if (m) return m[1];
  const cgi = html.match(/\bwx\.cgiData\b[\s\S]{0,400}?(?:[{,\s])t\s*:\s*["']?(\d{4,})["']?/);
  return cgi ? cgi[1] : null;
}

/** WeChat Official Account draft-box adapter following the 5-step observable contract. */
export class WeixinAdapter implements PlatformAdapter {
  readonly descriptor: PlatformDescriptor = {
    id: 'weixin',
    name: '微信公众号',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'low',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/weixin.ts',
  };

  private meta: WeixinAuthMeta | null = null;
  private readonly fetchFn: FetchLike;

  constructor(fetchFn: FetchLike = globalThis.fetch as unknown as FetchLike) {
    this.fetchFn = fetchFn;
  }

  getAuthMeta(): WeixinAuthMeta | null {
    return this.meta;
  }

  async checkAuth(): Promise<boolean> {
    this.meta = null;
    const res = await this.fetchFn('https://mp.weixin.qq.com/', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const html = await res.text();
    const urlToken = res.url?.includes('/cgi-bin/home') ? extractWeixinTokenFromUrl(res.url) : null;
    const token = parseWeixinToken(html) ?? urlToken;
    if (!token) return false;
    // cookie 还在、首页也像有 token 不代表会话有效：带 token 打开后台首页，
    // 会话失效时会被跳回登录页（最终地址不再带这个 token，页面里也取不到同一个 token）。
    const alreadyAtHome = Boolean(res.url?.includes('/cgi-bin/home') && urlToken === token);
    if (!alreadyAtHome && !(await this.confirmToken(token))) return false;
    const ticketMatch = html.match(/ticket:\s*["']([^"']+)["']/);
    const userNameMatch = html.match(/user_name:\s*["']([^"']+)["']/);
    const nickNameMatch = html.match(/nick_name:\s*["']([^"']+)["']/);
    const timeMatch = html.match(/time:\s*["'](\d+)["']/);

    this.meta = {
      token,
      userName: userNameMatch?.[1] ?? '',
      nickName: nickNameMatch?.[1] ?? '',
      ticket: ticketMatch?.[1] ?? '',
      svrTime: timeMatch ? Number(timeMatch[1]) : Math.floor(Date.now() / 1000),
    };
    return true;
  }

  private async confirmToken(token: string): Promise<boolean> {
    const res = await this.fetchFn(
      `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN&token=${encodeURIComponent(token)}`,
      { method: 'GET', credentials: 'include' }
    );
    if (!res.ok) return false;
    if (res.url && !res.url.includes(`token=${token}`)) return false;
    const homeHtml = await res.text();
    return (
      parseWeixinToken(homeHtml) === token ||
      (Boolean(res.url?.includes('/cgi-bin/home')) && extractWeixinTokenFromUrl(res.url) === token)
    );
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    if (!this.meta) {
      const ok = await this.checkAuth();
      if (!ok || !this.meta) throw new Error('微信公众号未登录，请先在独立沙箱扫码登录');
    }

    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: 'image/png' });
    form.append('type', 'image/png');
    form.append('name', fileName);
    form.append('size', String(buffer.length));
    form.append('file', blob, fileName);

    const { token, userName, ticket, svrTime } = this.meta;
    const url = `https://mp.weixin.qq.com/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1&ticket_id=${encodeURIComponent(userName)}&ticket=${encodeURIComponent(ticket)}&svr_time=${svrTime}&token=${encodeURIComponent(token)}&lang=zh_CN&seq=${Date.now()}`;

    const response = await this.fetchFn(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Origin: 'https://mp.weixin.qq.com',
        Referer: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&token=${encodeURIComponent(token)}&lang=zh_CN`,
      },
      body: form,
    });
    const json = (await response.json()) as {
      cdn_url?: string;
      base_resp?: { err_msg?: string; ret?: number };
    };
    if (json.base_resp?.err_msg !== 'ok' || !json.cdn_url) {
      throw new Error(`微信素材上传失败: ${json.base_resp?.err_msg || 'unknown error'}`);
    }
    return json.cdn_url;
  }

  async push(payload: WeixinDraftPayload): Promise<AdapterPushResult> {
    if (!this.meta) {
      const ok = await this.checkAuth();
      if (!ok || !this.meta) throw new Error('微信公众号未登录，请先在独立沙箱扫码登录');
    }

    const body = new URLSearchParams({
      token: this.meta.token,
      lang: 'zh_CN',
      f: 'json',
      ajax: '1',
      AppMsgId: '',
      count: '1',
      data_seq: '0',
      operate_from: 'Chrome',
      isnew: '0',
      title0: payload.title,
      author0: payload.author ?? '',
      fileid0: payload.coverFileId ?? '',
      digest0: payload.digest ?? '',
      auto_gen_digest0: payload.digest?.trim() ? '0' : '1',
      content0: payload.html,
      sourceurl0: payload.sourceUrl ?? '',
      need_open_comment0: payload.needOpenComment === false ? '0' : '1',
      only_fans_can_comment0: '0',
      cdn_url0: payload.coverImageUrl ?? '',
      cdn_235_1_url0: payload.coverImageUrl ?? '',
      cdn_1_1_url0: payload.coverSquareImageUrl || payload.coverImageUrl || '',
      show_cover_pic0: payload.showCoverInBody ? '1' : '0',
      copyright_type0: '0',
    });

    const response = await this.fetchFn(
      `https://mp.weixin.qq.com/cgi-bin/operate_appmsg?t=ajax-response&sub=create&type=77&token=${encodeURIComponent(this.meta.token)}&lang=zh_CN`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://mp.weixin.qq.com',
          Referer: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&token=${encodeURIComponent(this.meta.token)}&lang=zh_CN`,
        },
        body,
      }
    );

    const res = (await response.json()) as {
      appMsgId?: string;
      ret?: number;
      base_resp?: { ret?: number; err_msg?: string };
    };

    const ret = res.base_resp?.ret ?? res.ret;
    if (!res.appMsgId || (typeof ret === 'number' && ret !== 0)) {
      throw new Error(`微信草稿保存失败: ${res.base_resp?.err_msg || `ret=${ret}`}`);
    }

    const draftUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&appmsgid=${res.appMsgId}&token=${this.meta.token}&lang=zh_CN`;
    const verified = await this.verifyDelivery(res.appMsgId);

    return {
      postId: res.appMsgId,
      url: draftUrl,
      mode: 'draft',
      verified,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    if (!postId || !this.meta) return false;
    const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&appmsgid=${encodeURIComponent(postId)}&token=${encodeURIComponent(this.meta.token)}&lang=zh_CN`;
    const res = await this.fetchFn(url, { method: 'GET', credentials: 'include' });
    // 被跳回登录页（最终地址不再指向这篇草稿）不算送达
    return res.ok && (!res.url || res.url.includes(`appmsgid=${postId}`));
  }
}
