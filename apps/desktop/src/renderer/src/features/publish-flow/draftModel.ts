import type { PlatformId } from '@vcat/shared';
import { SPEC_BY_ID, ownCoverEligible, type PlatformSpec } from './platformSpecs.ts';

type Override = { title?: string; digest?: string; tags?: string[] };
type Focus = { x: number; y: number };

/** 某平台单独设置的封面（工作区相对路径）与它的焦点。 */
export interface OwnCover {
  cover: string;
  focus: Focus;
}

/**
 * 一篇文章的发布设置：所有平台共用一份标题/摘要/标签/封面，个别平台超限时在「需要单独处理」里单独改写。
 * 小红书/抖音也用这一份：标题自动截取，正文由主进程从文章转纯文本，话题用通用标签。
 * 封面默认用通用封面；封面比例不同的平台（公众号、小红书/抖音）可以单独设一张（ownCovers）。
 */
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
  /** 封面比例不同的平台单独设置的封面；没有就用通用封面按该平台比例裁。 */
  ownCovers: Partial<Record<PlatformId, OwnCover>>;
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
    ownCovers: {},
  };
}

const KNOWN_KEYS: Array<keyof PublishDraft> = [
  'title', 'digest', 'tags', 'coverUpload', 'coverFocus', 'overrides', 'selected', 'socialThemeId', 'includeRemoteImages', 'juejinCategoryId',
  'ownCovers',
];

const CENTER: Focus = { x: 50, y: 50 };

/** 旧版本把公众号单独封面存在 weixin、小红书/抖音分区封面存在 social；迁移成 ownCovers，不丢用户传过的图。 */
function legacyOwnCovers(saved: Record<string, unknown>): Partial<Record<PlatformId, OwnCover>> {
  const out: Partial<Record<PlatformId, OwnCover>> = {};
  const wx = saved.weixin as { cover?: unknown; focus?: Focus } | undefined;
  if (typeof wx?.cover === 'string' && wx.cover) out.weixin = { cover: wx.cover, focus: wx.focus ?? CENTER };
  const social = saved.social as { cover?: unknown } | undefined;
  if (typeof social?.cover === 'string' && social.cover) {
    out.xiaohongshu = { cover: social.cover, focus: CENTER };
    out.douyin = { cover: social.cover, focus: CENTER };
  }
  return out;
}

/**
 * 合并本地记住的设置。旧版本留下的字段（如 coverSource/coverCrops、公众号作者/阅读原文、小红书抖音单独的标题/正文/话题）丢弃；
 * 旧版单独上传的封面（公众号块、小红书/抖音分区）迁移到 ownCovers。
 */
export function mergeSaved(base: PublishDraft, saved: Partial<PublishDraft> | null): PublishDraft {
  if (!saved) return base;
  const out: PublishDraft = { ...base };
  for (const k of KNOWN_KEYS) if (saved[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = saved[k];
  out.selected = out.selected.filter((id) => SPEC_BY_ID[id]);
  out.ownCovers = { ...legacyOwnCovers(saved as Record<string, unknown>), ...out.ownCovers };
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

/** 设置（cover 为空字符串时移除）某平台的单独封面，返回新的 ownCovers。 */
export function setOwnCover(draft: PublishDraft, id: PlatformId, cover: string, focus: Focus = CENTER): PublishDraft['ownCovers'] {
  const next = { ...draft.ownCovers };
  if (cover) next[id] = { cover, focus };
  else delete next[id];
  return next;
}

/** 该平台生效的单独封面：只有封面比例与通用封面不同的平台才用。 */
export function ownCoverOf(draft: PublishDraft, spec: PlatformSpec): OwnCover | null {
  const own = draft.ownCovers[spec.id];
  return own?.cover && ownCoverEligible(spec) ? own : null;
}

/** 某平台的封面来源，按“用户在信息流里怎么看到它”决定默认值。没有封面项的平台返回 null。 */
export function coverFor(draft: PublishDraft, spec: PlatformSpec, bodyImage: string): CoverSource | null {
  if (!spec.cover) return null;
  // 该平台单独设置的封面优先（公众号、小红书/抖音等比例不同的平台）。
  const own = ownCoverOf(draft, spec);
  if (own) return { kind: 'upload', src: own.cover };
  // 卡片平台：通用封面插到卡片最前；没传就第一张卡片做封面。
  if (spec.cover.mode === 'card') return draft.coverUpload ? { kind: 'upload', src: draft.coverUpload } : { kind: 'card' };
  if (draft.coverUpload) return { kind: 'upload', src: draft.coverUpload };
  if (spec.cover.mode === 'optional' || !bodyImage) return { kind: 'none' };
  return { kind: 'body', src: bodyImage };
}

/** 裁切上传封面时用的焦点：单独封面用它自己的焦点，其余用通用封面的焦点。 */
export function coverFocusFor(draft: PublishDraft, spec: PlatformSpec): Focus {
  return ownCoverOf(draft, spec)?.focus ?? draft.coverFocus;
}

/**
 * 某平台最终使用的值：单独改写优先，否则用通用值（超限的摘要/标签自动截取）。
 * 小红书/抖音：标题超上限时截取前 N 字；正文留空，由主进程从文章生成纯文本。
 */
export function resolveFor(draft: PublishDraft, id: PlatformId) {
  const o = draft.overrides[id] ?? {};
  const spec = SPEC_BY_ID[id];
  if (spec?.kind === 'cards') {
    return { title: o.title ?? [...draft.title.trim()].slice(0, spec.title.max).join(''), digest: '', tags: o.tags ?? fitTags(draft.tags, spec.tags?.max) };
  }
  return { title: o.title ?? draft.title, digest: o.digest ?? fitDigest(draft.digest, spec?.digest?.max), tags: o.tags ?? fitTags(draft.tags, spec?.tags?.max) };
}

/** 沿用通用标签时：超出平台上限默认取前 max 个。 */
const fitTags = (tags: string[], max: number | undefined) => (max !== undefined && tags.length > max ? tags.slice(0, max) : tags);

/** 该平台是否沿用通用标签（没在平台行里单独挑选）。 */
export function usesSharedTags(draft: PublishDraft, spec: PlatformSpec): boolean {
  return draft.overrides[spec.id]?.tags === undefined;
}

const len = (s: string) => [...s.trim()].length;

/** 通用摘要超出平台上限时自动截取（末尾“…”算在上限内）；平台行里单独改写的摘要不截取。 */
export function fitDigest(digest: string, max: number | undefined): string {
  if (max === undefined || len(digest) <= max) return digest;
  return [...digest.trim()].slice(0, max - 1).join('') + '…';
}

/** 检查某平台是否可以推送；error 会阻止推送。消息是短句，如“摘要差 12 字”。 */
export function checkPlatform(draft: PublishDraft, spec: PlatformSpec, signedIn: boolean, bodyImage = ''): Issue[] {
  const v = resolveFor(draft, spec.id);
  const issues: Issue[] = [];
  const err = (field: IssueField, message: string) => issues.push({ level: 'error', field, message });
  if (!signedIn && spec.kind !== 'site') err('auth', '未登录');
  const t = len(v.title);
  // 小红书/抖音沿用通用标题且超长：只提示，推送时自动截取（resolveFor 已截好），不挡推送。
  const sharedTitle = spec.kind === 'cards' && draft.overrides[spec.id]?.title === undefined ? len(draft.title) : 0;
  if (sharedTitle > spec.title.max) issues.push({ level: 'warn', field: 'title', message: `标题超 ${sharedTitle - spec.title.max} 字（自动截取）` });
  if (t === 0) err('title', '缺标题');
  else if (t > spec.title.max) err('title', `标题超 ${t - spec.title.max} 字`);
  else if (spec.title.min && t < spec.title.min) err('title', `标题差 ${spec.title.min - t} 字`);
  if (spec.digest) {
    const d = len(v.digest);
    // 沿用通用摘要且超长：只提示，推送时自动截取（resolveFor 已截好），不挡推送。
    const shared = spec.kind !== 'cards' && draft.overrides[spec.id]?.digest === undefined ? len(draft.digest) : 0;
    if (shared > spec.digest.max) issues.push({ level: 'warn', field: 'digest', message: `摘要超 ${shared - spec.digest.max} 字（自动截取）` });
    if (spec.digest.required && d === 0) err('digest', '缺摘要');
    else if (d > spec.digest.max) err('digest', `摘要超 ${d - spec.digest.max} 字`);
    else if (spec.digest.min && d > 0 && d < spec.digest.min) err('digest', `摘要差 ${spec.digest.min - d} 字`);
  }
  if (coverFor(draft, spec, bodyImage)?.kind === 'none' && spec.cover && spec.cover.mode !== 'optional') {
    err('cover', spec.cover.mode === 'required' ? `缺封面（${spec.cover.ratios.join('/')} 必需）` : '缺封面');
  }
  if (spec.tags && usesSharedTags(draft, spec) && draft.tags.length > spec.tags.max) {
    issues.push({ level: 'warn', field: 'tags', message: `标签超 ${draft.tags.length - spec.tags.max} 个（取前 ${spec.tags.max} 个）` });
  }
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
