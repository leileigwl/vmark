import type { PlatformId } from '@vcat/shared';

/** 登录窗口顶栏高度（像素），站点页面从它下方开始。 */
export const LOGIN_BAR_HEIGHT = 52;

const NAMES: Partial<Record<PlatformId, string>> = {
  weixin: '微信公众号',
  zhihu: '知乎专栏',
  juejin: '稀土掘金',
  csdn: 'CSDN',
  cnblogs: '博客园',
  baijiahao: '百家号',
  weibo: '微博头条文章',
  bilibili: 'B 站专栏',
  xiaohongshu: '小红书',
  douyin: '抖音图文',
  github_static: 'GitHub',
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** 窗口与顶栏上显示的平台名（已转义）。 */
export function loginWindowName(platformId: PlatformId): string {
  return escapeHtml(NAMES[platformId] ?? String(platformId));
}

const LOGGED_IN = '登录成功，正在返回…';
const NOT_YET = '还没检测到登录，请在下方页面完成登录';

/**
 * 登录状态变化后顶栏该做什么：
 * - 未登录时打开，检测到已登录（自动检测或点「登录完成」）→ 关闭窗口，回到 Vmark 刷新状态；
 * - 点「登录完成」但还没登录 → 留在窗口里提示；
 * - 已登录时打开（去后台/草稿箱）→ 不自动关，点「完成」直接关。
 */
export function nextLoginBarAction(p: { signedInAtOpen: boolean; signedIn: boolean; trigger: 'cookie' | 'done' }): {
  close: boolean;
  status: string | null;
} {
  if (p.signedInAtOpen) return { close: p.trigger === 'done', status: null };
  if (p.signedIn) return { close: true, status: LOGGED_IN };
  return { close: false, status: p.trigger === 'done' ? NOT_YET : null };
}

const ICON_BACK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
const ICON_RELOAD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/**
 * 登录窗口的统一顶栏：平台名 + 状态提示 + 「登录完成」+ 关闭，配色与 Vmark 界面一致并跟随系统深色模式。
 * 按钮通过 vmark-nav:// 链接通知主进程，顶栏页面本身没有任何权限。
 */
export function buildLoginBarHtml(options: { platformId: PlatformId; signedInAtOpen: boolean }): string {
  const name = loginWindowName(options.platformId);
  const hint = options.signedInAtOpen ? '已登录' : '在下方页面登录，完成后会自动返回';
  const doneLabel = options.signedInAtOpen ? '完成' : '登录完成';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>
:root{--bg:#fafafa;--line:#e5e5ea;--ink:#1d1d1f;--muted:#6e6e73;--hover:#eceef1;--primary:#007aff;--on-primary:#fff}
@media (prefers-color-scheme: dark){:root{--bg:#1a1c1f;--line:rgba(221,225,230,.12);--ink:#dde1e6;--muted:#a0a6ad;--hover:#26292d;--primary:#0a84ff;--on-primary:#fff}}
*{box-sizing:border-box}
body{margin:0;height:${LOGIN_BAR_HEIGHT}px;display:flex;align-items:center;gap:12px;padding:0 12px 0 16px;background:var(--bg);border-bottom:1px solid var(--line);color:var(--ink);font:13px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;user-select:none}
button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;min-width:36px;border:0;border-radius:8px;background:transparent;color:var(--muted);font:inherit;cursor:pointer;white-space:nowrap}
button:hover{background:var(--hover);color:var(--ink)}
button:focus-visible{outline:2px solid color-mix(in srgb,var(--primary) 45%,transparent);outline-offset:1px}
.name{font-weight:600;white-space:nowrap}
.status{flex:1;min-width:0;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.primary{padding:0 16px;background:var(--primary);color:var(--on-primary);font-weight:500}
.primary:hover{background:var(--primary);color:var(--on-primary);filter:brightness(1.08)}
</style></head>
<body>
  <button onclick="location.href='vmark-nav://back'" aria-label="后退" title="后退">${ICON_BACK}</button>
  <button onclick="location.href='vmark-nav://reload'" aria-label="刷新" title="刷新">${ICON_RELOAD}</button>
  <span class="name">${name}</span>
  <span id="bar-status" class="status" role="status">${hint}</span>
  <button class="primary" onclick="location.href='vmark-nav://done'">${doneLabel}</button>
  <button onclick="location.href='vmark-nav://close'" aria-label="关闭" title="关闭">${ICON_CLOSE}</button>
</body>
</html>`;
}
