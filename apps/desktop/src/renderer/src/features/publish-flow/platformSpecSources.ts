import type { PlatformId } from '@vcat/shared';
import type { PlatformSpec } from './platformSpecs';

/**
 * platformSpecs.ts 里每个数字的出处。
 * - SPEC_EVIDENCE：已在平台官方/一手文档里查到、且与 PLATFORM_SPECS 当前值一致的字段。
 * - SPEC_PENDING：官方公开文档查不到或互相矛盾，只能登录真实后台确认的字段，附“去哪看”。
 * 规则（由 tests/platformSpecSources.test.ts 守住）：
 *   1. 证据里的值必须等于 PLATFORM_SPECS 的当前值；
 *   2. 每个平台出现的字段，要么有证据，要么在待核实清单里；
 *   3. 只有待核实清单为空的平台才能 verified=true（自有站点 kind='site' 除外）。
 * 核查日：2026-11-23（Asia/Shanghai），只读公开文档，未登录任何平台。
 */
export type SpecField =
  | 'title.max'
  | 'title.min'
  | 'digest.max'
  | 'digest.min'
  | 'digest.required'
  | 'cover.ratios'
  | 'cover.mode'
  | 'tags.max'
  | 'tags.required'
  | 'maxCards';

export interface SpecEvidence {
  field: SpecField;
  value: unknown;
  url: string;
  /** 文档原话（节选）。 */
  quote: string;
  checked: string;
}

export interface SpecPending {
  field: SpecField;
  /** 为什么公开文档定不下来。 */
  why: string;
  /** 在创作者后台哪里能看到/试出这个限制。 */
  howToCheck: string;
}

const CHECKED = '2026-11-23';
const WX_DRAFT_ADD = 'https://developers.weixin.qq.com/doc/service/api/draftbox/draftmanage/api_draft_add.html';
const BJH_OPEN = 'https://baijiahao.baidu.com/builder/author/openauth/openauthProtection';
const WB_MANUAL = 'https://js.t.sinajs.cn/t6/article/publish/dist/js/static/faq.pdf';
const BILI_OPEN = 'https://openhome.bilibili.com/doc/4/b14b77b6-8889-8c8b-2e83-17c5a4c550fb';
const XHS_POSTNOTE = 'https://miniapp.xiaohongshu.com/doc/DC604617';
const DY_OPEN = 'https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/video-management/douyin/create-image-text/create-image-text/';

const ev = (field: SpecField, value: unknown, url: string, quote: string): SpecEvidence => ({ field, value, url, quote, checked: CHECKED });
const todo = (field: SpecField, why: string, howToCheck: string): SpecPending => ({ field, why, howToCheck });

const NO_DOC = '平台没有公开的发文接口/帮助文档写明此限制';

export const SPEC_EVIDENCE: Partial<Record<PlatformId, SpecEvidence[]>> = {
  weixin: [
    ev('digest.max', 120, WX_DRAFT_ADD, '图文消息的摘要，总长度不超过120个字（变更日志 2026-07-14：api摘要长度限制对齐mp端120字）'),
    ev('cover.ratios', ['2.35:1', '1:1'], WX_DRAFT_ADD, '裁剪比例。图文消息（news）仅支持“2.35_1”“1_1”'),
    ev('cover.mode', 'weixin', WX_DRAFT_ADD, 'thumb_media_id：article_type为图文消息（news）时必填'),
  ],
  baijiahao: [ev('title.min', 8, BJH_OPEN, 'title：文章标题，限定8-40个中英文字符以内')],
  weibo: [
    ev('title.max', 32, WB_MANUAL, '输入标题（必填）：最多可以输入 32 个中文字符'),
    ev('digest.max', 44, WB_MANUAL, '输入导语（选填）：最多可以输入 44 个中文字符'),
    ev('cover.ratios', ['16:9'], WB_MANUAL, '选择一张不小于 1000*562 像素的本地图片……当图片不是 16：9 的时候，拖动图片调整剪裁区域'),
  ],
  bilibili: [
    ev('title.max', 40, BILI_OPEN, 'title：文章标题，建议30字以内，最多不超过40字'),
    ev('cover.mode', 'optional', BILI_OPEN, 'template_id 5-封面无图且banner_url/top_video_bvid都为空，平台生成默认封面'),
    ev('tags.required', false, BILI_OPEN, 'tags | false | 用户自定义标签'),
  ],
  xiaohongshu: [
    ev('title.max', 20, XHS_POSTNOTE, 'title：笔记标题，最大长度 20 个字符，超出会触发 error'),
    ev('digest.max', 1000, XHS_POSTNOTE, 'content：笔记内容，最大长度 1000 个字符，超出会触发 error'),
    ev('maxCards', 18, XHS_POSTNOTE, '图片可以多张（1-18）'),
    ev('tags.required', false, XHS_POSTNOTE, 'tags | string | 否 | 笔记发布的话题'),
  ],
  douyin: [
    ev('digest.max', 1000, DY_OPEN, '错误码 2114001：标题文字不得多于 1000 个'),
    ev('tags.required', false, DY_OPEN, '话题写在 text 里（“title1#话题1 #话题2”），text 非必填'),
  ],
};

export const SPEC_PENDING: Partial<Record<PlatformId, SpecPending[]>> = {
  weixin: [
    todo('title.max', '官方三处说法不一：draft/add 接口“不超过32个字”；mp 编辑器帮助“不超过64字”；群发规则“64个字节（即32个汉字）”。本应用走 mp 网页后台，不走 draft/add', 'mp.weixin.qq.com → 内容管理 → 草稿箱 → 新建图文，标题框输入 33 个和 64 个汉字各试一次，看计数器与保存是否报错'),
  ],
  zhihu: [
    todo('title.max', NO_DOC, 'zhuanlan.zhihu.com/write 标题框粘贴 101 字，看是否截断/报错'),
    todo('cover.ratios', NO_DOC, '写文章页“添加封面”，看裁剪框比例'),
    todo('cover.mode', NO_DOC, '不加封面直接存草稿/发布，看是否拦截'),
  ],
  juejin: [
    todo('title.max', NO_DOC, 'juejin.cn/editor/drafts/new 标题框输入 101 字，看是否截断'),
    todo('digest.min', '只有第三方抓包文章称 brief_content 需 50–100 字，无官方文档', '编辑器 → 发布 → 摘要框，输入 49 字点“确定并发布”，看提示'),
    todo('digest.max', '同上', '摘要框输入 101 字，看计数器上限'),
    todo('digest.required', '同上', '摘要留空点“确定并发布”，看是否拦截'),
    todo('cover.ratios', NO_DOC, '发布弹窗“添加封面”，看裁剪比例'),
    todo('cover.mode', NO_DOC, '不传封面发布，看是否拦截'),
    todo('tags.required', NO_DOC, '发布弹窗不选标签，看是否拦截'),
    todo('tags.max', '第三方说法互相矛盾（2 个 / 3 个）', '发布弹窗连续添加标签，看第几个起无法添加'),
  ],
  csdn: [
    todo('title.min', NO_DOC, 'mp.csdn.net/mp_blog/creation/editor 标题输入 4 字保存，看提示'),
    todo('title.max', NO_DOC, '标题框输入 101 字，看计数器'),
    todo('digest.max', NO_DOC, '发布设置 → 文章摘要框，看计数器上限'),
    todo('cover.ratios', NO_DOC, '发布设置 → 添加封面，看裁剪比例'),
    todo('cover.mode', NO_DOC, '不加封面发布，看是否拦截'),
    todo('tags.required', NO_DOC, '发布设置不加标签，看是否拦截'),
    todo('tags.max', NO_DOC, '发布设置 → 文章标签，看可添加个数'),
  ],
  cnblogs: [
    todo('title.max', NO_DOC, 'i.cnblogs.com/posts/edit 标题输入 101 字保存为草稿'),
    todo('digest.max', NO_DOC, '编辑页“摘要”框输入 201 字保存，看提示'),
  ],
  baijiahao: [
    todo('title.max', '开放接口写 8–40 字，网页编辑器限额未公开（第三方多称 30）；本应用走网页后台', 'baijiahao.baidu.com → 发布 → 图文，标题框输入 31 字，看计数器上限'),
    todo('cover.ratios', '开放接口只写“封面图尺寸不小于218*146”（约 3:2），未写 16:9', '图文编辑页 → 封面“单图”，看裁剪框比例'),
    todo('cover.mode', '开放接口写“没有封面图的内容将会进入草稿”，即发布时必填、草稿不必填', '不选封面点发布，看是否拦截'),
  ],
  weibo: [
    todo('cover.mode', '官方使用手册未写封面必填；旧版头条文章开放接口（已作废）列 cover 为必填', 'card.weibo.com/article/v5/editor 不加封面点“下一步/发布”，看是否拦截'),
  ],
  bilibili: [
    todo('cover.ratios', '开放接口头图推荐 960×540（16:9），但列表封面单图推荐 640×188；本应用走网页后台 upcover', 'member.bilibili.com 专栏编辑器 → 发布设置 → 自定义封面，看裁剪比例'),
    todo('tags.max', NO_DOC, '专栏编辑器 → 话题/标签，看可添加个数'),
  ],
  xiaohongshu: [
    todo('cover.mode', '官方文档未写首图即封面', '发布笔记页上传多图，看封面是否默认取第 1 张、能否单独换'),
    todo('cover.ratios', '官方 postNote 文档未写图片比例', 'creator.xiaohongshu.com → 发布笔记 → 上传图文，看裁剪可选比例'),
    todo('tags.max', '官方 postNote 文档只说话题用逗号分隔，未写上限', '发布笔记页正文里连续添加 #话题，看第几个起被拦截'),
  ],
  douyin: [
    todo('title.max', '开放接口只有合并的 text 字段（≤1000），网页端标题上限无官方文档', 'creator.douyin.com → 发布图文，标题框输入 21 字，看计数器'),
    todo('maxCards', '开放接口“每次最多上传 30 张”，抖店学习中心（官方）写“最多35张”；未核实前 packages/shared 的 SOCIAL_MAX_CARDS 取保守值 30', 'creator.douyin.com → 发布图文，连续上传 36 张，看第几张起被拒'),
    todo('cover.mode', '抖店学习中心称上传后可“设置封面”，未写默认首图', '发布图文页上传多图，看封面默认取哪张'),
    todo('cover.ratios', NO_DOC, '发布图文页上传竖图，看推荐比例提示'),
    todo('tags.max', NO_DOC, '发布图文页添加 #话题，看第几个起被拦截'),
  ],
};

/** 读出 spec 上某个字段的当前值；字段不存在时返回 undefined。 */
export function specFieldValue(spec: PlatformSpec, field: SpecField): unknown {
  switch (field) {
    case 'title.max': return spec.title.max;
    case 'title.min': return spec.title.min;
    case 'digest.max': return spec.digest?.max;
    case 'digest.min': return spec.digest?.min;
    case 'digest.required': return spec.digest?.required;
    case 'cover.ratios': return spec.cover?.ratios;
    case 'cover.mode': return spec.cover?.mode;
    case 'tags.max': return spec.tags?.max;
    case 'tags.required': return spec.tags?.required;
    case 'maxCards': return spec.maxCards;
  }
}
