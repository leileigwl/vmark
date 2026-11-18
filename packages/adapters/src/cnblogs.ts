import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

export interface CnblogsOptions {
  blogUrl: string;
  username: string;
  token: string;
  fetchFn?: FetchLike;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildMethodCall(methodName: string, paramsXml: string[]): string {
  const params = paramsXml.map((p) => `<param><value>${p}</value></param>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><methodCall><methodName>${escapeXml(methodName)}</methodName><params>${params}</params></methodCall>`;
}

function hasXmlFault(xml: string): boolean {
  return /<fault>/i.test(xml);
}

function extractFaultMessage(xml: string): string {
  const match = xml.match(/<name>faultString<\/name>\s*<value>(?:<string>)?([\s\S]*?)(?:<\/string>)?<\/value>/i);
  return match?.[1]?.trim() || 'MetaWeblog XML-RPC fault';
}

function extractMemberValue(xml: string, memberName: string): string | null {
  const pattern = new RegExp(
    `<name>${memberName}<\\/name>\\s*<value>(?:<(?:string|int|i4)>)?([\\s\\S]*?)(?:<\\/(?:string|int|i4)>)?<\\/value>`,
    'i'
  );
  const match = xml.match(pattern);
  return match?.[1]?.trim() || null;
}

function extractSingleParamValue(xml: string): string | null {
  const match = xml.match(
    /<params>\s*<param>\s*<value>(?:<(?:string|int|i4)>)?([\s\S]*?)(?:<\/(?:string|int|i4)>)?<\/value>\s*<\/param>\s*<\/params>/i
  );
  return match?.[1]?.trim() || null;
}

function inferMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/png';
}

/** Cnblogs MetaWeblog XML-RPC adapter implementing 5-step observable delivery. */
export class CnblogsAdapter implements PlatformAdapter {
  readonly descriptor: PlatformDescriptor = {
    id: 'cnblogs',
    name: '博客园 (Cnblogs)',
    supportedModes: ['draft', 'direct'],
    defaultMode: 'draft',
    authChannel: 'metaweblog',
    riskLevel: 'low',
    referenceSource: 'references/siyuan-plugin-publisher/src/adaptors/api/cnblogs',
  };

  private readonly blogUrl: string;
  private readonly username: string;
  private readonly token: string;
  private readonly fetchFn: FetchLike;
  private blogId: string;

  constructor(options: CnblogsOptions) {
    this.blogUrl = options.blogUrl.replace(/\/+$/, '');
    this.username = options.username;
    this.token = options.token;
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
    this.blogId = options.username;
  }

  private async callRpc(methodName: string, paramsXml: string[]): Promise<string> {
    const body = buildMethodCall(methodName, paramsXml);
    const res = await this.fetchFn(this.blogUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`博客园 MetaWeblog 请求失败 (${methodName}): HTTP ${res.status}`);
    }
    const xml = await res.text();
    if (hasXmlFault(xml)) {
      throw new Error(`博客园 MetaWeblog 返回错误 (${methodName}): ${extractFaultMessage(xml)}`);
    }
    return xml;
  }

  async checkAuth(): Promise<boolean> {
    if (!this.blogUrl || !this.username || !this.token) return false;
    try {
      const xml = await this.callRpc('blogger.getUsersBlogs', [
        '<string></string>',
        `<string>${escapeXml(this.username)}</string>`,
        `<string>${escapeXml(this.token)}</string>`,
      ]);
      const parsedBlogId = extractMemberValue(xml, 'blogid');
      if (parsedBlogId) {
        this.blogId = parsedBlogId;
      }
      return /<methodResponse>/i.test(xml);
    } catch {
      return false;
    }
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const mimeType = inferMimeType(fileName);
    const mediaStruct = [
      '<struct>',
      `<member><name>name</name><value><string>${escapeXml(fileName)}</string></value></member>`,
      `<member><name>type</name><value><string>${escapeXml(mimeType)}</string></value></member>`,
      `<member><name>bits</name><value><base64>${buffer.toString('base64')}</base64></value></member>`,
      '</struct>',
    ].join('');

    const xml = await this.callRpc('metaWeblog.newMediaObject', [
      `<string>${escapeXml(this.blogId)}</string>`,
      `<string>${escapeXml(this.username)}</string>`,
      `<string>${escapeXml(this.token)}</string>`,
      mediaStruct,
    ]);

    const url = extractMemberValue(xml, 'url');
    if (!url) {
      throw new Error('博客园图片上传失败: 响应中缺少 url 字段');
    }
    return url;
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const categoriesXml = payload.tags
      .map((tag) => `<value><string>${escapeXml(tag)}</string></value>`)
      .join('');
    const content = payload.html || payload.markdown;
    const publish = payload.mode === 'direct';

    const postStruct = [
      '<struct>',
      `<member><name>title</name><value><string>${escapeXml(payload.title)}</string></value></member>`,
      `<member><name>description</name><value><string>${escapeXml(content)}</string></value></member>`,
      `<member><name>categories</name><value><array><data>${categoriesXml}</data></array></value></member>`,
      '</struct>',
    ].join('');

    const xml = await this.callRpc('metaWeblog.newPost', [
      `<string>${escapeXml(this.blogId)}</string>`,
      `<string>${escapeXml(this.username)}</string>`,
      `<string>${escapeXml(this.token)}</string>`,
      postStruct,
      `<boolean>${publish ? '1' : '0'}</boolean>`,
    ]);

    const postId = extractSingleParamValue(xml);
    if (!postId) {
      throw new Error('博客园文章推送失败: 响应中缺少 postId');
    }

    const verified = await this.verifyDelivery(postId);
    const url = `https://www.cnblogs.com/${encodeURIComponent(this.username)}/p/${encodeURIComponent(postId)}.html`;

    return {
      postId,
      url,
      mode: payload.mode,
      verified,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    if (!postId) return false;
    try {
      const xml = await this.callRpc('metaWeblog.getPost', [
        `<string>${escapeXml(postId)}</string>`,
        `<string>${escapeXml(this.username)}</string>`,
        `<string>${escapeXml(this.token)}</string>`,
      ]);
      return /<methodResponse>/i.test(xml) && !hasXmlFault(xml);
    } catch {
      return false;
    }
  }
}
