import { SOCIAL_MAX_CARDS, type PlatformId } from '@vcat/shared';

export type CoverRatio = '2.35:1' | '16:9' | '3:4' | '1:1';
export type PlatformKind = 'article' | 'cards' | 'site';

/**
 * 每个平台的发布要求。界面上的必填、字数上限、封面比例全部从这里读。
 * verified=false 的数字是常见经验值，需维护者在各平台后台核实后改为 true。
 */
export interface PlatformSpec {
  id: PlatformId;
  name: string;
  kind: PlatformKind;
  title: { max: number; min?: number };
  digest?: { max: number; min?: number; required?: boolean };
  cover?: { ratio: CoverRatio; required: boolean };
  tags?: { required: boolean; max: number };
  /** 卡片类平台的图片张数上限。 */
  maxCards?: number;
  /** 默认发布方式：除静态博客外一律进草稿箱。 */
  mode: 'draft' | 'direct';
  verified: boolean;
  note?: string;
}

export const PLATFORM_SPECS: PlatformSpec[] = [
  { id: 'weixin', name: '微信公众号', kind: 'article', title: { max: 64 }, digest: { max: 120 }, cover: { ratio: '2.35:1', required: true }, mode: 'draft', verified: false, note: '转发卡片会再裁一张 1:1' },
  { id: 'zhihu', name: '知乎专栏', kind: 'article', title: { max: 100 }, cover: { ratio: '16:9', required: false }, mode: 'draft', verified: false },
  { id: 'juejin', name: '稀土掘金', kind: 'article', title: { max: 100 }, digest: { min: 50, max: 100, required: true }, cover: { ratio: '16:9', required: false }, tags: { required: true, max: 3 }, mode: 'draft', verified: false, note: '发布时还需选分类' },
  { id: 'csdn', name: 'CSDN', kind: 'article', title: { min: 5, max: 100 }, digest: { max: 256 }, cover: { ratio: '16:9', required: false }, tags: { required: true, max: 7 }, mode: 'draft', verified: false },
  { id: 'cnblogs', name: '博客园', kind: 'article', title: { max: 100 }, digest: { max: 200 }, mode: 'draft', verified: false },
  { id: 'baijiahao', name: '百家号', kind: 'article', title: { min: 8, max: 30 }, cover: { ratio: '16:9', required: true }, mode: 'draft', verified: false },
  { id: 'weibo', name: '微博头条文章', kind: 'article', title: { max: 32 }, digest: { max: 44 }, cover: { ratio: '16:9', required: true }, mode: 'draft', verified: false },
  { id: 'bilibili', name: 'B 站专栏', kind: 'article', title: { max: 40 }, cover: { ratio: '16:9', required: false }, tags: { required: false, max: 10 }, mode: 'draft', verified: false },
  { id: 'xiaohongshu', name: '小红书', kind: 'cards', title: { max: 20 }, digest: { max: 1000 }, cover: { ratio: '3:4', required: true }, tags: { required: false, max: 10 }, maxCards: SOCIAL_MAX_CARDS.xiaohongshu, mode: 'draft', verified: false, note: '正文转成 3:4 文字卡片' },
  { id: 'douyin', name: '抖音图文', kind: 'cards', title: { max: 20 }, digest: { max: 1000 }, cover: { ratio: '3:4', required: true }, tags: { required: false, max: 5 }, maxCards: SOCIAL_MAX_CARDS.douyin, mode: 'draft', verified: false, note: '正文转成 3:4 文字卡片' },
  { id: 'github_static', name: 'GitHub 博客', kind: 'site', title: { max: 120 }, digest: { max: 300 }, tags: { required: false, max: 10 }, mode: 'direct', verified: true, note: '推送到仓库后直接上线' },
];

export const SPEC_BY_ID = Object.fromEntries(PLATFORM_SPECS.map((s) => [s.id, s])) as Partial<Record<PlatformId, PlatformSpec>>;

export const RATIO_VALUE: Record<CoverRatio, number> = { '2.35:1': 2.35, '16:9': 16 / 9, '3:4': 3 / 4, '1:1': 1 };

export const KIND_LABEL: Record<PlatformKind, string> = {
  article: '长文',
  cards: '图文卡片',
  site: '个人站点',
};
