import type { PlatformId } from '@vcat/shared';

/** 每个平台的品牌色、简称与登录/后台地址。 */
export const PLATFORM_LINKS: Partial<
  Record<PlatformId, { short: string; color: string; loginUrl: string; dashboardUrl: string }>
> = {
  github_static: { short: 'GH', color: '#24292f', loginUrl: 'https://github.com/login', dashboardUrl: 'https://github.com/' },
  weixin: { short: '微', color: '#07c160', loginUrl: 'https://mp.weixin.qq.com/', dashboardUrl: 'https://mp.weixin.qq.com/' },
  cnblogs: { short: '园', color: '#2e64b0', loginUrl: 'https://account.cnblogs.com/signin', dashboardUrl: 'https://i.cnblogs.com/posts' },
  juejin: { short: '掘', color: '#1e80ff', loginUrl: 'https://juejin.cn/login', dashboardUrl: 'https://juejin.cn/creator/content/article/drafts' },
  csdn: { short: 'C', color: '#fc5531', loginUrl: 'https://passport.csdn.net/login', dashboardUrl: 'https://mp.csdn.net/mp_blog/manage/article' },
  zhihu: { short: '知', color: '#0066ff', loginUrl: 'https://www.zhihu.com/signin', dashboardUrl: 'https://www.zhihu.com/creator' },
  baijiahao: { short: '百', color: '#2932e1', loginUrl: 'https://baijiahao.baidu.com/builder/theme/bjh/login', dashboardUrl: 'https://baijiahao.baidu.com/' },
  weibo: { short: '博', color: '#e6162d', loginUrl: 'https://weibo.com/login.php', dashboardUrl: 'https://card.weibo.com/article/v3/editor' },
  bilibili: { short: 'B', color: '#fb7299', loginUrl: 'https://passport.bilibili.com/login', dashboardUrl: 'https://member.bilibili.com/platform/home' },
  douyin: { short: '抖', color: '#111827', loginUrl: 'https://creator.douyin.com/', dashboardUrl: 'https://creator.douyin.com/' },
  xiaohongshu: { short: '红', color: '#ff2442', loginUrl: 'https://creator.xiaohongshu.com/login', dashboardUrl: 'https://creator.xiaohongshu.com/' },
};
