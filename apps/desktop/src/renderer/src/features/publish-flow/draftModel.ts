import type { PlatformId } from '@vcat/shared';
import { SPEC_BY_ID, type CoverRatio, type PlatformSpec } from './platformSpecs';

/** 一篇文章的发布设置：通用字段 + 各平台覆盖值。 */
export interface PublishDraft {
  title: string;
  digest: string;
  tags: string[];
  /** 封面原图：工作区相对路径或 https 地址。 */
  coverSource: string;
  /** 封面焦点（0–100），裁剪时以此为中心。 */
  coverFocus: { x: number; y: number };
  /** 按比例裁好的封面，值为工作区相对路径。 */
  coverCrops: Partial<Record<CoverRatio, string>>;
  overrides: Partial<Record<PlatformId, { title?: string; digest?: string; tags?: string[] }>>;
  selected: PlatformId[];
  socialThemeId: string | null;
  includeRemoteImages: boolean;
}

export interface Issue {
  level: 'error' | 'warn';
  field: 'title' | 'digest' | 'cover' | 'tags' | 'auth';
  message: string;
}

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

/** 正文里出现的图片，作为封面候选。 */
export function extractImages(md: string): string[] {
  const out: string[] = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) if (!out.includes(m[1])) out.push(m[1]);
  const fmCover = readFrontMatter(md).coverImageUrl || readFrontMatter(md).cover;
  if (fmCover && !out.includes(fmCover)) out.unshift(fmCover);
  return out;
}

export function createDraft(md: string, fileTitle: string, digest: string): PublishDraft {
  const images = extractImages(md);
  return {
    title: deriveTitle(md, fileTitle),
    digest,
    tags: deriveTags(md),
    coverSource: images[0] ?? '',
    coverFocus: { x: 50, y: 50 },
    coverCrops: {},
    overrides: {},
    selected: [],
    socialThemeId: null,
    includeRemoteImages: true,
  };
}

/** 某平台最终使用的值（覆盖值优先，否则用通用值）。 */
export function resolveFor(draft: PublishDraft, id: PlatformId) {
  const o = draft.overrides[id] ?? {};
  const spec = SPEC_BY_ID[id];
  const ratio = spec?.cover?.ratio;
  return {
    title: o.title ?? draft.title,
    digest: o.digest ?? draft.digest,
    tags: o.tags ?? draft.tags,
    cover: ratio ? draft.coverCrops[ratio] ?? draft.coverSource : draft.coverSource,
    coverCropped: ratio ? Boolean(draft.coverCrops[ratio]) : false,
  };
}

const len = (s: string) => [...s.trim()].length;

/** 检查某平台是否可以推送；error 会阻止推送，warn 只提醒。 */
export function checkPlatform(draft: PublishDraft, spec: PlatformSpec, signedIn: boolean): Issue[] {
  const v = resolveFor(draft, spec.id);
  const issues: Issue[] = [];
  if (!signedIn && spec.kind !== 'site') issues.push({ level: 'error', field: 'auth', message: '未登录' });
  const t = len(v.title);
  if (t === 0) issues.push({ level: 'error', field: 'title', message: '缺少标题' });
  else if (t > spec.title.max) issues.push({ level: 'error', field: 'title', message: `标题 ${t} 字，超过 ${spec.title.max} 字上限` });
  else if (spec.title.min && t < spec.title.min) issues.push({ level: 'error', field: 'title', message: `标题至少 ${spec.title.min} 字` });
  if (spec.digest) {
    const d = len(v.digest);
    if (spec.digest.required && d === 0) issues.push({ level: 'error', field: 'digest', message: '缺少摘要' });
    else if (d > spec.digest.max) issues.push({ level: 'error', field: 'digest', message: `摘要超过 ${spec.digest.max} 字` });
    else if (spec.digest.min && d > 0 && d < spec.digest.min) issues.push({ level: 'error', field: 'digest', message: `摘要至少 ${spec.digest.min} 字` });
  }
  if (spec.cover) {
    if (!v.cover) {
      if (spec.cover.required) issues.push({ level: 'error', field: 'cover', message: `缺少 ${spec.cover.ratio} 封面` });
    } else if (!v.coverCropped) {
      issues.push({ level: 'warn', field: 'cover', message: `封面未裁成 ${spec.cover.ratio}，平台可能自动裁切` });
    }
  }
  if (spec.tags?.required && v.tags.length === 0) issues.push({ level: 'error', field: 'tags', message: '至少需要 1 个标签' });
  if (spec.tags && v.tags.length > spec.tags.max) issues.push({ level: 'error', field: 'tags', message: `标签最多 ${spec.tags.max} 个` });
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
