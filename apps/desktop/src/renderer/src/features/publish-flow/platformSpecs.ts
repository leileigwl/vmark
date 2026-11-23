import { SOCIAL_MAX_CARDS, type PlatformId } from '@vcat/shared';

export type CoverRatio = '2.35:1' | '16:9' | '3:4' | '1:1';
export type PlatformKind = 'article' | 'cards' | 'site';

/**
 * 封面在信息流里的用法，决定“没上传封面时用什么”：
 * - weixin：列表 2.35:1 + 转发 1:1，必须有；默认用正文首图。
 * - card：第一张卡片就是封面 3:4；上传的封面插为第 1 张。
 * - required：16:9 必须有；默认用正文首图。
 * - optional：16:9 可不填；默认不设封面。
 */
export type CoverMode = 'weixin' | 'card' | 'required' | 'optional';

/**
 * 每个平台的发布要求。界面上的必填、字数上限、封面比例全部从这里读。
 * verified=false 的数字是常见经验值，需维护者在各平台后台核实后改为 true。
 * 每个数字的官方出处 / 待核实项与后台核实方法见 platformSpecSources.ts。
 */
export interface PlatformSpec {
  id: PlatformId;
  name: string;
  /** 行内提示用的短名，如“掘金：摘要差 12 字”。 */
  short: string;
  kind: PlatformKind;
  title: { max: number; min?: number };
  digest?: { max: number; min?: number; required?: boolean };
  /** 没有 cover 的平台（博客园、GitHub 博客）不显示封面项。 */
  cover?: { ratios: CoverRatio[]; mode: CoverMode };
  tags?: { required: boolean; max: number };
  /** 需要选文章分类的平台（掘金）。 */
  category?: { required: boolean };
  /** 卡片类平台的图片张数上限（含封面）。 */
  maxCards?: number;
  /** 默认发布方式：除静态博客外一律进草稿箱。 */
  mode: 'draft' | 'direct';
  verified: boolean;
  note?: string;
}

const WIDE: CoverRatio[] = ['16:9'];

export const PLATFORM_SPECS: PlatformSpec[] = [
  { id: 'weixin', name: '微信公众号', short: '公众号', kind: 'article', title: { max: 64 }, digest: { max: 120 }, cover: { ratios: ['2.35:1', '1:1'], mode: 'weixin' }, mode: 'draft', verified: false },
  { id: 'zhihu', name: '知乎专栏', short: '知乎', kind: 'article', title: { max: 100 }, cover: { ratios: WIDE, mode: 'optional' }, mode: 'draft', verified: false },
  { id: 'juejin', name: '稀土掘金', short: '掘金', kind: 'article', title: { max: 100 }, digest: { min: 50, max: 100, required: true }, cover: { ratios: WIDE, mode: 'optional' }, tags: { required: true, max: 3 }, category: { required: true }, mode: 'draft', verified: false },
  { id: 'csdn', name: 'CSDN', short: 'CSDN', kind: 'article', title: { min: 5, max: 100 }, digest: { max: 256 }, cover: { ratios: WIDE, mode: 'optional' }, tags: { required: true, max: 7 }, mode: 'draft', verified: false },
  { id: 'cnblogs', name: '博客园', short: '博客园', kind: 'article', title: { max: 100 }, digest: { max: 200 }, mode: 'draft', verified: false },
  { id: 'baijiahao', name: '百家号', short: '百家号', kind: 'article', title: { min: 8, max: 30 }, cover: { ratios: WIDE, mode: 'required' }, mode: 'draft', verified: false },
  { id: 'weibo', name: '微博头条文章', short: '微博', kind: 'article', title: { max: 32 }, digest: { max: 44 }, cover: { ratios: WIDE, mode: 'required' }, mode: 'draft', verified: false },
  { id: 'bilibili', name: 'B 站专栏', short: 'B 站', kind: 'article', title: { max: 40 }, cover: { ratios: WIDE, mode: 'optional' }, tags: { required: false, max: 10 }, mode: 'draft', verified: false },
  { id: 'xiaohongshu', name: '小红书', short: '小红书', kind: 'cards', title: { max: 20 }, digest: { max: 1000 }, cover: { ratios: ['3:4'], mode: 'card' }, tags: { required: false, max: 10 }, maxCards: SOCIAL_MAX_CARDS.xiaohongshu, mode: 'draft', verified: false, note: '正文转成 3:4 文字卡片' },
  { id: 'douyin', name: '抖音图文', short: '抖音', kind: 'cards', title: { max: 20 }, digest: { max: 1000 }, cover: { ratios: ['3:4'], mode: 'card' }, tags: { required: false, max: 5 }, maxCards: SOCIAL_MAX_CARDS.douyin, mode: 'draft', verified: false, note: '正文转成 3:4 文字卡片' },
  { id: 'github_static', name: 'GitHub 博客', short: 'GitHub 博客', kind: 'site', title: { max: 120 }, digest: { max: 300 }, tags: { required: false, max: 10 }, mode: 'direct', verified: true, note: '推送到仓库后直接上线' },
];

export const SPEC_BY_ID = Object.fromEntries(PLATFORM_SPECS.map((s) => [s.id, s])) as Partial<Record<PlatformId, PlatformSpec>>;

export const RATIO_VALUE: Record<CoverRatio, number> = { '2.35:1': 2.35, '16:9': 16 / 9, '3:4': 3 / 4, '1:1': 1 };

/**
 * 各封面用法的说明：未上传封面时逐平台列出，也用在平台悬停提示里。
 * 比例取自 spec.cover.ratios，这里只给每个比例在信息流里的叫法。
 */
const COVER_GUIDE: Record<CoverMode, { required: boolean; label: Partial<Record<CoverRatio, string>>; fallback: string }> = {
  weixin: { required: false, label: { '2.35:1': '列表大图', '1:1': '转发小图' }, fallback: '不传用正文首图自动裁' },
  optional: { required: false, label: { '16:9': '列表右侧小图' }, fallback: '不传就不放' },
  required: { required: true, label: {}, fallback: '不传用正文首图' },
  card: { required: false, label: { '3:4': '第一张卡片就是封面' }, fallback: '传了插到卡片最前' },
};

/** 比例旁的悬停提示：比例来自各平台常见显示方式。 */
export const COVER_RATIO_HINT = '按平台常见显示方式，未逐个后台核对';

export interface CoverGuide {
  mode: CoverMode;
  required: boolean;
  slots: Array<{ ratio: CoverRatio; label: string }>;
  fallback: string;
  /** 不传就没有封面可用、会挡住推送（正文没图且平台要用正文首图）。 */
  needUpload: boolean;
}

/** 某平台“要不要封面、什么比例、不传会怎样”。没有封面项的平台（博客园、GitHub 博客）返回 null。 */
export function coverGuide(spec: PlatformSpec, bodyImage: string): CoverGuide | null {
  if (!spec.cover) return null;
  const g = COVER_GUIDE[spec.cover.mode];
  const usesBody = spec.cover.mode === 'weixin' || spec.cover.mode === 'required';
  return {
    mode: spec.cover.mode,
    required: g.required,
    slots: spec.cover.ratios.map((ratio) => ({ ratio, label: g.label[ratio] ?? '' })),
    fallback: g.fallback,
    needUpload: usesBody && !bodyImage,
  };
}

export interface CoverGuideLine extends CoverGuide {
  ids: PlatformId[];
  names: string[];
}

/** 已勾选平台的封面指引，同一用法的平台合成一行（如“百家号、微博：必需 · 16:9”），按平台列表顺序。 */
export function coverGuideLines(specs: PlatformSpec[], bodyImage: string): CoverGuideLine[] {
  const lines: CoverGuideLine[] = [];
  for (const spec of specs) {
    const g = coverGuide(spec, bodyImage);
    if (!g) continue;
    const same = lines.find((l) => l.mode === g.mode);
    if (same) {
      same.ids.push(spec.id);
      same.names.push(spec.short);
    } else lines.push({ ...g, ids: [spec.id], names: [spec.short] });
  }
  return lines;
}

/**
 * 通用封面下的一句短提示（不再逐平台列长列表）：已勾选平台里需要从通用封面自动裁的比例，
 * 公众号与小红书/抖音在各自分区里处理，不算在内。比例取自 spec.cover.ratios。
 */
export function generalCoverHint(specs: PlatformSpec[]): string | null {
  const ratios = new Set<CoverRatio>();
  for (const s of specs) if (s.cover && (s.cover.mode === 'optional' || s.cover.mode === 'required')) s.cover.ratios.forEach((r) => ratios.add(r));
  return ratios.size ? `其他平台按需自动裁 ${[...ratios].join('、')}` : null;
}

function coverRule(spec: PlatformSpec): string {
  const g = coverGuide(spec, 'x');
  if (!g) return '';
  const slots = g.slots.map((s) => (s.label ? `${s.label} ${s.ratio}` : s.ratio)).join(' + ');
  return `封面${g.required ? '必需' : '可选'} ${slots}，${g.fallback}`;
}

/** 平台规则的一句话说明，放在悬停提示里，不占版面。 */
export function requirementText(spec: PlatformSpec): string {
  const r = [`标题 ${spec.title.min ? `${spec.title.min}–` : '≤ '}${spec.title.max} 字`];
  if (spec.digest) r.push(`摘要${spec.digest.required ? '必填' : ''} ${spec.digest.min ? `${spec.digest.min}–` : '≤ '}${spec.digest.max} 字`);
  if (spec.cover) r.push(coverRule(spec));
  if (spec.tags) r.push(`标签${spec.tags.required ? '必填' : ''}最多 ${spec.tags.max} 个`);
  if (spec.category) r.push(`分类${spec.category.required ? '必选' : '可选'}`);
  if (spec.maxCards) r.push(`最多 ${spec.maxCards} 张图`);
  if (spec.note) r.push(spec.note);
  if (!spec.verified) r.push('规则待核实');
  return r.join(' · ');
}
