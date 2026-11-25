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

type ThemeTokenName = 'surface' | 'line' | 'ink' | 'muted' | 'hover' | 'primary';
export type LoginBarTheme = { scheme: 'light' | 'dark'; tokens: Record<ThemeTokenName, string> };

/** 读不到 app 主题时的回落配色（apple-light / 深色主题公共值）。 */
const FALLBACK: Record<LoginBarTheme['scheme'], LoginBarTheme['tokens']> = {
  light: { surface: '#fafafa', line: '#e5e5ea', ink: '#1d1d1f', muted: '#6e6e73', hover: '#eceef1', primary: '#007aff' },
  dark: { surface: '#1a1c1f', line: 'rgba(221,225,230,.12)', ink: '#dde1e6', muted: '#a0a6ad', hover: '#26292d', primary: '#0a84ff' },
};

/**
 * 在 Vmark 主界面里执行，读出当前 app 主题（<html data-theme>）及顶栏要用的语义色。
 * 与 styles/ui-tokens.css 的映射一致：surface=--bg-elevated、line=--border-color、ink=--text-main ……
 */
const THEME_SNAPSHOT_FN = `() => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (n) => cs.getPropertyValue(n).trim();
  return { themeId: root.dataset.theme || '', tokens: { surface: v('--bg-elevated'), line: v('--border-color'), ink: v('--text-main'), muted: v('--control-text-color'), hover: v('--bg-hover'), primary: v('--accent') } };
}`;
export const RENDERER_THEME_PROBE = `(${THEME_SNAPSHOT_FN})()`;

/**
 * 在 Vmark 主界面里执行：等 app 主题（<html data-theme>）不再是 knownThemeId 时返回新快照；
 * 60 秒内没变返回 null（主进程据此接着等）。登录窗口开着时靠它让顶栏实时跟随主题。
 */
export function buildRendererThemeWatch(knownThemeId: string): string {
  return `new Promise((resolve) => {
  const snapshot = ${THEME_SNAPSHOT_FN};
  const root = document.documentElement;
  const known = ${JSON.stringify(knownThemeId)};
  if ((root.dataset.theme || '') !== known) return resolve(snapshot());
  const obs = new MutationObserver(() => {
    if ((root.dataset.theme || '') === known) return;
    obs.disconnect();
    clearTimeout(timer);
    resolve(snapshot());
  });
  const timer = setTimeout(() => { obs.disconnect(); resolve(null); }, 60000);
  obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
})`;
}

/** 快照里的主题 id（读不到时为空串）。 */
export function appThemeIdOf(snapshot: unknown): string {
  const id = snapshot && typeof snapshot === 'object' ? (snapshot as { themeId?: unknown }).themeId : '';
  return typeof id === 'string' ? id : '';
}

/** 只接受颜色写法（#hex、rgb()/color-mix() 等），拒绝能跳出 CSS 声明的字符。 */
const SAFE_COLOR = /^[#a-z0-9(),.%\s-]{1,120}$/i;

/**
 * 把主界面读到的主题快照变成顶栏配色：深浅只看 app 主题 id（与 themes.css 的 [data-theme*='-dark'] 一致），
 * 与系统 prefers-color-scheme 无关；缺失或可疑的颜色回落到对应深浅的默认值。
 */
export function resolveLoginBarTheme(snapshot: unknown): LoginBarTheme {
  const snap = (snapshot && typeof snapshot === 'object' ? snapshot : {}) as { themeId?: unknown; tokens?: unknown };
  const scheme = typeof snap.themeId === 'string' && snap.themeId.includes('-dark') ? 'dark' : 'light';
  const raw = (snap.tokens && typeof snap.tokens === 'object' ? snap.tokens : {}) as Record<string, unknown>;
  const tokens = { ...FALLBACK[scheme] };
  for (const key of Object.keys(tokens) as ThemeTokenName[]) {
    const value = raw[key];
    if (typeof value === 'string' && SAFE_COLOR.test(value.trim())) tokens[key] = value.trim();
  }
  return { scheme, tokens };
}

/** 登录窗口底色（顶栏加载前和站点页面背后露出的颜色）。 */
export function loginWindowBackground(theme: LoginBarTheme): string {
  return theme.scheme === 'dark' ? '#18191c' : '#ffffff';
}

/** 在已打开的顶栏里换配色的脚本：只替换 #bar-theme 里的令牌（值已经过 SAFE_COLOR 校验）。 */
export function buildLoginBarThemeScript(theme: LoginBarTheme): string {
  return `(() => { const s = document.getElementById('bar-theme'); if (s) s.textContent = ${JSON.stringify(themeCss(theme))}; })();`;
}

function themeCss({ scheme, tokens: t }: LoginBarTheme): string {
  return `:root{color-scheme:${scheme};--bg:${t.surface};--line:${t.line};--ink:${t.ink};--muted:${t.muted};--hover:${t.hover};--primary:${t.primary};--on-primary:#fff}`;
}

export type LoginBarAction = 'back' | 'reload' | 'done' | 'close';

/** 解析顶栏按钮触发的 URL（兼容旧 vmark-nav://<action> 与 data: 页内 hash #vmark-nav://<action>:<ts>）。 */
export function parseLoginBarActionUrl(targetUrl: string): LoginBarAction | null {
  const m = targetUrl.match(/^(?:vmark-nav:\/\/|.*#vmark-nav:\/\/)(back|reload|done|close)(?::\d+)?$/);
  return (m?.[1] as LoginBarAction | undefined) ?? null;
}

/**
 * 登录窗口的统一顶栏：平台名 + 状态提示 + 「登录完成」+ 关闭，配色取自 Vmark 内当前选中的主题（不跟随系统深浅色）。
 * 按钮通过页内 hash `#vmark-nav://<action>:<ts>` 通知主进程（Electron `data:text/html` 下 `did-navigate-in-page` 稳定可达），顶栏页面本身没有任何权限。
 */
export function buildLoginBarHtml(options: { platformId: PlatformId; signedInAtOpen: boolean; appTheme?: unknown }): string {
  const name = loginWindowName(options.platformId);
  const hint = options.signedInAtOpen ? '已登录' : '在下方页面登录，完成后会自动返回';
  const doneLabel = options.signedInAtOpen ? '完成' : '登录完成';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style id="bar-theme">${themeCss(resolveLoginBarTheme(options.appTheme))}</style><style>
*{box-sizing:border-box}
html,body{margin:0;height:${LOGIN_BAR_HEIGHT}px;overflow:hidden}
body{display:flex;align-items:center;gap:12px;padding:0 12px 0 16px;background:var(--bg);border-bottom:1px solid var(--line);color:var(--ink);font:13px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;user-select:none}
button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;min-width:36px;border:0;border-radius:8px;background:transparent;color:var(--muted);font:inherit;cursor:pointer;white-space:nowrap}
button:hover{background:var(--hover);color:var(--ink)}
button:focus-visible{outline:2px solid color-mix(in srgb,var(--primary) 45%,transparent);outline-offset:1px}
.name{font-weight:600;white-space:nowrap}
.status{flex:1;min-width:0;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.primary{padding:0 16px;background:var(--primary);color:var(--on-primary);font-weight:500}
.primary:hover{background:var(--primary);color:var(--on-primary);filter:brightness(1.08)}
</style></head>
<body>
  <button onclick="location.hash='vmark-nav://back:'+Date.now()" aria-label="后退" title="后退">${ICON_BACK}</button>
  <button onclick="location.hash='vmark-nav://reload:'+Date.now()" aria-label="刷新" title="刷新">${ICON_RELOAD}</button>
  <span class="name">${name}</span>
  <span id="bar-status" class="status" role="status">${hint}</span>
  <button class="primary" onclick="location.hash='vmark-nav://done:'+Date.now()">${doneLabel}</button>
  <button onclick="location.hash='vmark-nav://close:'+Date.now()" aria-label="关闭" title="关闭">${ICON_CLOSE}</button>
</body>
</html>`;
}
