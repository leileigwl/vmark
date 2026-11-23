import type { PlatformId } from '@vcat/shared';
import { SPEC_BY_ID, type PlatformSpec } from './platformSpecs.ts';

type Override = { title?: string; digest?: string; tags?: string[] };

/** 小红书 + 抖音单独一个分区：自己的标题 / 纯文本正文 / 话题 / 封面（插到第一张卡前）。没填的用默认。 */
export interface SocialDraft {
  /** 空=从通用标题截取到平台上限。 */
  title?: string;
  /** 空=主进程从正文生成纯文本。 */
  body?: string;
  /** 空=用通用标签。 */
  topics?: string[];
  /** 上传的封面（工作区相对路径），空字符串=第一张卡片就是封面。 */
  cover: string;
}

/** 一篇文章的发布设置：所有平台共用的标题/摘要/标签/封面，个别平台需要时单独改写。 */
export interface PublishDraft {
  title: string;
  digest: string;
  tags: string[];
  /** 用户上传的封面（工作区相对路径）；空字符串表示没上传，用各平台默认。 */
  coverUpload: string;
  /** 封面焦点（0–100），各比例以此为中心裁切。 */
  coverFocus: { x: number; y: number };
  overrides: Partial<Record<PlatformId, Override>>;
  selected: PlatformId[];
  socialThemeId: string | null;
  includeRemoteImages: boolean;
  /** 掘金文章分类 id；空字符串表示还没选。 */
  juejinCategoryId: string;
  /** 公众号专属：作者、阅读原文链接（空字符串=不填）。 */
  weixinAuthor: string;
  weixinSourceUrl: string;
  social: SocialDraft;
}

export type IssueField = 'title' | 'digest' | 'cover' | 'tags' | 'category' | 'auth';
export interface Issue {
  level: 'error' | 'warn';
  field: IssueField;
  /** 短句，直接拼在“掘金：”后面。 */
  message: string;
}

/** 某平台封面的来源：上传的图 / 正文首图 / 第一张卡片 / 不设封面。 */
export type CoverSource = { kind: 'upload' | 'body'; src: string } | { kind: 'card' | 'none' };

const FRONT_MATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

function readFrontMatter(md: string): Record<string, string> {
  const m = md.match(FRONT_MATTER_RE);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/** 标题优先级：front matter title → 第一个一级标题 → 文件名。 */
export function deriveTitle(md: string, fileTitle: string): string {
  const fm = readFrontMatter(md);
  if (fm.title) return fm.title;
  const h1 = md.replace(FRONT_MATTER_RE, '').match(/^#\s+(.+)$/m);
  return (h1?.[1] ?? fileTitle).trim();
}

export function deriveTags(md: string): string[] {
  const raw = readFrontMatter(md).tags;
  if (!raw) return [];
  return raw.replace(/^\[|\]$/g, '').split(/[,，]/).map((t) => t.trim()).filter(Boolean);
}

/** 正文首图（front matter 的 cover 优先），作为需要封面的平台的默认封面。 */
export function firstBodyImage(md: string): string {
  const fm = readFrontMatter(md);
  const fmCover = fm.coverImageUrl || fm.cover;
  if (fmCover) return fmCover;
  return md.match(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/)?.[1] ?? '';
}

export function createDraft(md: string, fileTitle: string, digest: string): PublishDraft {
  return {
    title: deriveTitle(md, fileTitle),
    digest,
    tags: deriveTags(md),
    coverUpload: '',
    coverFocus: { x: 50, y: 50 },
    overrides: {},
    selected: ['weixin'],
    socialThemeId: null,
    includeRemoteImages: true,
    juejinCategoryId: '',
    weixinAuthor: '',
    weixinSourceUrl: '',
    social: { cover: '' },
  };
}

const KNOWN_KEYS: Array<keyof PublishDraft> = [
  'title', 'digest', 'tags', 'coverUpload', 'coverFocus', 'overrides', 'selected', 'socialThemeId', 'includeRemoteImages', 'juejinCategoryId',
  'weixinAuthor', 'weixinSourceUrl', 'social',
];

/** 合并本地记住的设置；旧版本留下的字段（如 coverSource/coverCrops）丢弃。 */
export function mergeSaved(base: PublishDraft, saved: Partial<PublishDraft> | null): PublishDraft {
  if (!saved) return base;
  const out: PublishDraft = { ...base };
  for (const k of KNOWN_KEYS) if (saved[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = saved[k];
  out.selected = out.selected.filter((id) => SPEC_BY_ID[id]);
  out.social = { ...out.social, cover: out.social?.cover ?? '' };
  return out;
}

/** 平台单独改写：和通用值相同的字段自动删掉，不留“看起来改过”的覆盖值。 */
export function setOverride(draft: PublishDraft, id: PlatformId, patch: Override): PublishDraft['overrides'] {
  const next: Override = { ...(draft.overrides[id] ?? {}), ...patch };
  if (next.title === draft.title) delete next.title;
  if (next.digest === draft.digest) delete next.digest;
  if (next.tags && next.tags.join('\u0000') === draft.tags.join('\u0000')) delete next.tags;
  const all = { ...draft.overrides };
  if (Object.keys(next).length) all[id] = next;
  else delete all[id];
  return all;
}

/** 某平台的封面来源，按“用户在信息流里怎么看到它”决定默认值。没有封面项的平台返回 null。 */
export function coverFor(draft: PublishDraft, spec: PlatformSpec, bodyImage: string): CoverSource | null {
  if (!spec.cover) return null;
  // 卡片平台只认它们分区里上传的封面，通用封面不插进卡片。
  if (spec.cover.mode === 'card') return draft.social.cover ? { kind: 'upload', src: draft.social.cover } : { kind: 'card' };
  if (draft.coverUpload) return { kind: 'upload', src: draft.coverUpload };
  if (spec.cover.mode === 'optional' || !bodyImage) return { kind: 'none' };
  return { kind: 'body', src: bodyImage };
}

/** 某平台最终使用的值：小红书/抖音用自己分区的值（标题默认截取通用标题）；其他平台单独改写优先，否则用通用值。 */
export function resolveFor(draft: PublishDraft, id: PlatformId) {
  const o = draft.overrides[id] ?? {};
  const spec = SPEC_BY_ID[id];
  if (spec?.kind === 'cards') {
    const s = draft.social;
    const title = s.title?.trim() ? s.title : o.title ?? [...draft.title.trim()].slice(0, spec.title.max).join('');
    return { title, digest: s.body ?? '', tags: s.topics ?? o.tags ?? draft.tags };
  }
  return { title: o.title ?? draft.title, digest: o.digest ?? draft.digest, tags: o.tags ?? draft.tags };
}

const len = (s: string) => [...s.trim()].length;

/** 检查某平台是否可以推送；error 会阻止推送。消息是短句，如“摘要差 12 字”。 */
export function checkPlatform(draft: PublishDraft, spec: PlatformSpec, signedIn: boolean, bodyImage = ''): Issue[] {
  const v = resolveFor(draft, spec.id);
  const issues: Issue[] = [];
  const err = (field: IssueField, message: string) => issues.push({ level: 'error', field, message });
  if (!signedIn && spec.kind !== 'site') err('auth', '未登录');
  const t = len(v.title);
  if (t === 0) err('title', '缺标题');
  else if (t > spec.title.max) err('title', `标题超 ${t - spec.title.max} 字`);
  else if (spec.title.min && t < spec.title.min) err('title', `标题差 ${spec.title.min - t} 字`);
  if (spec.digest) {
    const d = len(v.digest);
    if (spec.digest.required && d === 0) err('digest', '缺摘要');
    else if (d > spec.digest.max) err('digest', `摘要超 ${d - spec.digest.max} 字`);
    else if (spec.digest.min && d > 0 && d < spec.digest.min) err('digest', `摘要差 ${spec.digest.min - d} 字`);
  }
  if (coverFor(draft, spec, bodyImage)?.kind === 'none' && spec.cover?.mode !== 'optional') err('cover', '缺封面');
  if (spec.tags?.required && v.tags.length === 0) err('tags', '缺标签');
  else if (spec.tags && v.tags.length > spec.tags.max) err('tags', `标签多 ${v.tags.length - spec.tags.max} 个`);
  if (spec.category?.required && !draft.juejinCategoryId) err('category', '缺分类');
  return issues;
}

const STORAGE_PREFIX = 'vmark.publishDraft.v1:';

export function loadDraft(articlePath: string): Partial<PublishDraft> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + articlePath);
    return raw ? (JSON.parse(raw) as Partial<PublishDraft>) : null;
  } catch {
    return null;
  }
}

export function saveDraft(articlePath: string, draft: PublishDraft): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + articlePath, JSON.stringify(draft));
  } catch {
    /* 存储满或不可用时忽略，不影响发布 */
  }
}
