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

const COVER_RULE: Record<CoverMode, string> = {
  weixin: '封面 2.35:1（列表）+ 1:1（转发），默认正文首图',
  card: '第一张卡片即封面 3:4',
  required: '封面 16:9 必填，默认正文首图',
  optional: '封面 16:9 可选',
};

/** 平台规则的一句话说明，放在悬停提示里，不占版面。 */
export function requirementText(spec: PlatformSpec): string {
  const r = [`标题 ${spec.title.min ? `${spec.title.min}–` : '≤ '}${spec.title.max} 字`];
  if (spec.digest) r.push(`摘要${spec.digest.required ? '必填' : ''} ${spec.digest.min ? `${spec.digest.min}–` : '≤ '}${spec.digest.max} 字`);
  if (spec.cover) r.push(COVER_RULE[spec.cover.mode]);
  if (spec.tags) r.push(`标签${spec.tags.required ? '必填' : ''}最多 ${spec.tags.max} 个`);
  if (spec.category) r.push(`分类${spec.category.required ? '必选' : '可选'}`);
  if (spec.maxCards) r.push(`最多 ${spec.maxCards} 张图`);
  if (spec.note) r.push(spec.note);
  if (!spec.verified) r.push('规则待核实');
  return r.join(' · ');
}
