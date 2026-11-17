import type { AdapterPushPayload, AdapterPushResult, PlatformAdapter, PlatformDescriptor } from './index.ts';
import type { FetchLike } from './weixin.ts';

export interface GitHubStaticOptions {
  repo: string;
  branch?: string;
  token: string;
  baseDir?: string;
  fetchFn?: FetchLike;
}

function toSlug(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `post-${Date.now()}`;
}

function encodeRepoPath(filePath: string): string {
  return filePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildMarkdownDocument(payload: AdapterPushPayload): string {
  const trimmed = payload.markdown.trimStart();
  if (trimmed.startsWith('---')) {
    return payload.markdown;
  }

  const tagsYaml = payload.tags.length > 0 ? `[${payload.tags.map((t) => JSON.stringify(t)).join(', ')}]` : '[]';
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(payload.title)}`,
    `draft: ${payload.mode === 'draft' ? 'true' : 'false'}`,
    `tags: ${tagsYaml}`,
    '---',
    '',
  ].join('\n');

  return `${frontmatter}${payload.markdown}`;
}

/** GitHub static blog adapter using the GitHub Contents REST API. */
export class GitHubStaticAdapter implements PlatformAdapter {
  readonly descriptor: PlatformDescriptor = {
    id: 'github_static',
    name: 'GitHub 静态博客 (CI/CD)',
    supportedModes: ['direct', 'draft'],
    defaultMode: 'direct',
    authChannel: 'git_token',
    riskLevel: 'low',
    referenceSource: 'references/siyuan-plugin-publisher/src/adaptors/api/hexo & git-push',
  };

  private readonly repo: string;
  private readonly branch: string;
  private readonly token: string;
  private readonly baseDir: string;
  private readonly fetchFn: FetchLike;

  constructor(options: GitHubStaticOptions) {
    this.repo = options.repo.replace(/^\/+|\/+$/g, '');
    this.branch = options.branch?.trim() || 'main';
    this.token = options.token;
    this.baseDir = (options.baseDir ?? 'posts').replace(/^\/+|\/+$/g, '');
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  private buildHeaders(includeJsonContentType = false): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'vmark-publisher',
    };
    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  async checkAuth(): Promise<boolean> {
    if (!this.repo || !this.token) return false;
    const res = await this.fetchFn(`https://api.github.com/repos/${this.repo}`, {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    return res.ok;
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const cleanName = fileName.replace(/^\/+/, '');
    const filePath = `assets/${cleanName}`;
    const url = `https://api.github.com/repos/${this.repo}/contents/${encodeRepoPath(filePath)}`;

    const res = await this.fetchFn(url, {
      method: 'PUT',
      headers: this.buildHeaders(true),
      body: JSON.stringify({
        message: `Upload asset ${cleanName}`,
        content: buffer.toString('base64'),
        branch: this.branch,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub 图片上传失败: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      content?: {
        download_url?: string;
        html_url?: string;
        path?: string;
      };
    };

    return (
      json.content?.download_url ||
      `https://raw.githubusercontent.com/${this.repo}/${encodeURIComponent(this.branch)}/${encodeRepoPath(filePath)}`
    );
  }

  async push(payload: AdapterPushPayload): Promise<AdapterPushResult> {
    const slug = toSlug(payload.title);
    const filePath = this.baseDir ? `${this.baseDir}/${slug}.md` : `${slug}.md`;
    const url = `https://api.github.com/repos/${this.repo}/contents/${encodeRepoPath(filePath)}`;
    const document = buildMarkdownDocument(payload);

    const res = await this.fetchFn(url, {
      method: 'PUT',
      headers: this.buildHeaders(true),
      body: JSON.stringify({
        message: `Publish: ${payload.title}`,
        content: Buffer.from(document, 'utf8').toString('base64'),
        branch: this.branch,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub 文章推送失败: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      content?: {
        path?: string;
        html_url?: string;
      };
    };

    const postId = json.content?.path || filePath;
    const htmlUrl =
      json.content?.html_url ||
      `https://github.com/${this.repo}/blob/${encodeURIComponent(this.branch)}/${encodeRepoPath(postId)}`;
    const verified = await this.verifyDelivery(postId);

    return {
      postId,
      url: htmlUrl,
      mode: payload.mode,
      verified,
    };
  }

  async verifyDelivery(postId: string): Promise<boolean> {
    if (!postId) return false;
    const url = `https://api.github.com/repos/${this.repo}/contents/${encodeRepoPath(postId)}?ref=${encodeURIComponent(this.branch)}`;
    const res = await this.fetchFn(url, {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    return res.ok;
  }
}
