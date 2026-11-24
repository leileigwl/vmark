import type { MultiPlatformPublishResultItem, PlatformId } from '@vcat/shared';

/**
 * 推草稿成功后「打开草稿」用哪个地址：拿到草稿 id 就打开这篇草稿的编辑页，拿不到才退回草稿列表页。
 * edit 模板与各适配器 push() 返回的 url 一致（适配器给了 url 时以适配器为准）；
 * 列表页里标「未核实」的见 docs/platform-rules-todo.md 真机清单。
 */
export const DRAFT_LINKS: Partial<Record<PlatformId, { list: string; edit?: (id: string) => string }>> = {
  // 公众号编辑页需要登录 token，只能用适配器返回的 url；列表页为后台首页（草稿在「内容管理 → 草稿箱」）。
  weixin: { list: 'https://mp.weixin.qq.com/' },
  juejin: { list: 'https://juejin.cn/creator/content/article/drafts', edit: (id) => `https://juejin.cn/editor/drafts/${id}` },
  csdn: { list: 'https://mp.csdn.net/mp_blog/manage/article', edit: (id) => `https://editor.csdn.net/md?articleId=${id}` },
  zhihu: { list: 'https://www.zhihu.com/creator', edit: (id) => `https://zhuanlan.zhihu.com/p/${id}/edit` },
  cnblogs: { list: 'https://i.cnblogs.com/posts', edit: (id) => `https://i.cnblogs.com/posts/edit;postId=${id}` },
  baijiahao: { list: 'https://baijiahao.baidu.com/', edit: (id) => `https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=${id}` },
  weibo: { list: 'https://card.weibo.com/article/v5/editor', edit: (id) => `https://card.weibo.com/article/v5/editor#/draft/${id}` },
  bilibili: { list: 'https://member.bilibili.com/platform/home', edit: (id) => `https://member.bilibili.com/platform/upload/text/new-edit?aid=${encodeURIComponent(id)}` },
  // 小红书图文草稿存在发布页所在浏览器本地（同一个 persist:platform_xiaohongshu 分区），没有草稿 id，只能打开发布页的草稿箱。
  xiaohongshu: { list: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=image' },
  douyin: { list: 'https://creator.douyin.com/creator-micro/content/manage' },
};

export type DraftUrlKind = 'draft' | 'list';

/** 给推送结果补上「打开草稿」地址：失败不给链接；有草稿 id → 编辑页（draft）；否则 → 列表页（list）。 */
export function withDraftLink(item: MultiPlatformPublishResultItem): MultiPlatformPublishResultItem {
  if (!item.ok) return { ...item, url: undefined, urlKind: undefined };
  if (item.mode !== 'draft') return item;
  const links = DRAFT_LINKS[item.platformId];
  if (item.postId) {
    const url = item.url || links?.edit?.(item.postId);
    if (url) return { ...item, url, urlKind: 'draft' };
  }
  return { ...item, url: links?.list ?? item.url, urlKind: 'list' };
}

/** 推送后回查草稿是否真的在草稿箱；查不到或超时都不算已核实，给一句提示而不是报失败。 */
export async function confirmDraftDelivered(verify: () => Promise<boolean>, timeoutMs = 5000): Promise<{ verified: boolean; note: string }> {
  const found = await Promise.race([verify().catch(() => false), new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs))]);
  return found ? { verified: true, note: '' } : { verified: false, note: '（草稿已提交，草稿箱暂未查到，平台可能有延迟，请稍后在草稿箱确认）' };
}
