import { useEffect, useState } from 'react';
import type { PlatformId, ThemeId } from '@vcat/shared';
import { VISIBLE_PLATFORM_CATALOG } from '../../features/publish-drawer';

const THEME_ITEMS: Array<{ id: ThemeId; name: string; desc: string }> = [
  { id: 'apple-light', name: 'Apple Light（默认）', desc: 'SF Pro · 系统蓝' },
  { id: 'bloom-lapis', name: 'Bloom Lapis', desc: '文档蓝 · 护眼浅蓝' },
  { id: 'bloom-lapis-dark', name: 'Bloom Lapis Dark', desc: '文档蓝 · 深邃夜蓝' },
  { id: 'bloom-wheat', name: 'Bloom Wheat', desc: '象牙纸张 · 暖白' },
  { id: 'bloom-wheat-dark', name: 'Bloom Wheat Dark', desc: '象牙暖棕 · 暗色' },
  { id: 'bloom-amber', name: 'Bloom Amber', desc: '琥珀暖光' },
  { id: 'bloom-amber-dark', name: 'Bloom Amber Dark', desc: '琥珀暗夜' },
  { id: 'bloom-cinnabar', name: 'Bloom Cinnabar', desc: '朱砂红韵' },
  { id: 'bloom-cinnabar-dark', name: 'Bloom Cinnabar Dark', desc: '朱砂暗夜' },
  { id: 'bloom-ink', name: 'Bloom Ink', desc: '水墨清灰' },
  { id: 'bloom-ink-dark', name: 'Bloom Ink Dark', desc: '水墨玄黑' },
  { id: 'bloom-mist', name: 'Bloom Mist', desc: '薄雾青蓝' },
  { id: 'bloom-mist-dark', name: 'Bloom Mist Dark', desc: '薄雾暗夜' },
  { id: 'bloom-petal', name: 'Bloom Petal', desc: '花瓣樱粉' },
  { id: 'bloom-petal-dark', name: 'Bloom Petal Dark', desc: '花瓣暗夜' },
  { id: 'bloom-ripple', name: 'Bloom Ripple', desc: '涟漪湖青' },
  { id: 'bloom-ripple-dark', name: 'Bloom Ripple Dark', desc: '涟漪暗夜' },
  { id: 'bloom-sage', name: 'Bloom Sage', desc: '鼠尾草绿' },
  { id: 'bloom-sage-dark', name: 'Bloom Sage Dark', desc: '鼠尾暗夜' },
  { id: 'bloom-spring', name: 'Bloom Spring', desc: '春芽嫩绿' },
  { id: 'bloom-spring-dark', name: 'Bloom Spring Dark', desc: '春芽暗夜' },
  { id: 'bloom-stone', name: 'Bloom Stone', desc: '岩石暖灰' },
  { id: 'bloom-stone-dark', name: 'Bloom Stone Dark', desc: '岩石暗夜' },
  { id: 'bloom-verdant', name: 'Bloom Verdant', desc: '苍翠深绿' },
  { id: 'bloom-verdant-dark', name: 'Bloom Verdant Dark', desc: '苍翠暗夜' },
];

/** Theme selection grid & custom CSS theme importer panel. */
export function SettingsThemeSection({
  theme,
  customThemeName,
  onSelectTheme,
  onImportTyporaTheme,
}: {
  theme: ThemeId;
  customThemeName: string;
  onSelectTheme: (t: ThemeId) => void;
  onImportTyporaTheme: () => void;
}) {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">外观主题（默认 Apple Light · 完整收录 Bloom 24 套）</h2>
        <p className="mt-1 text-xs text-[var(--control-text-color)]">
          也可随时通过 macOS 顶部菜单栏「主题」快速切换；基础色彩方案参考开源社区 Bloom / GitHub 主题规范。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
        {THEME_ITEMS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTheme(t.id)}
            className={`rounded-lg border p-3 text-left transition ${
              theme === t.id
                ? 'border-[var(--accent)] bg-[var(--accent)]/12'
                : 'border-[var(--border-color)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <div className="font-semibold text-[var(--text-main)]">{t.name}</div>
            <div className="mt-0.5 text-[11px] text-[var(--control-text-color)]">{t.desc}</div>
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2 border-t border-[var(--border-color)] pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onImportTyporaTheme}
            className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            导入自定义 CSS 样式文件（覆盖主题配色与排版）...
          </button>
          {customThemeName && (
            <span className="text-xs text-[var(--accent)]">
              当前已加载：{customThemeName}.css
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--control-text-color)]">
          支持标准 CSS 变量（如 <code>--bg-main</code>、<code>--text-main</code>、<code>--accent</code>、<code>--side-bar-bg-color</code>）及 <code>.vditor-reset</code> 选择器覆盖，导入后实时生效。
        </p>
      </div>
    </div>
  );
}

/** Multi-platform sandbox authentication status & login/logout/proxy panel. */
export function SettingsPlatformsSection({
  authStates,
  onPlatformLogin,
  onPlatformLogout,
}: {
  authStates: Partial<Record<PlatformId, boolean>>;
  onPlatformLogin: (platformId: PlatformId) => void;
  onPlatformLogout?: (platformId: PlatformId) => void;
}) {
  const [proxyDrafts, setProxyDrafts] = useState<Partial<Record<PlatformId, string>>>({});
  const [proxyEditorId, setProxyEditorId] = useState<PlatformId | null>(null);
  const [proxyMsg, setProxyMsg] = useState<string>('');

  useEffect(() => {
    void window.electronAPI?.getPlatformAccounts?.().then((accounts) => {
      if (!accounts) return;
      const loaded: Partial<Record<PlatformId, string>> = {};
      for (const [pid, rec] of Object.entries(accounts)) {
        const proxyUrl = (rec as { proxyUrl?: string })?.proxyUrl;
        if (proxyUrl) loaded[pid as PlatformId] = proxyUrl;
      }
      setProxyDrafts(loaded);
    });
  }, []);

  const handleSaveProxy = async (platformId: PlatformId, nextProxy: string) => {
    if (!window.electronAPI?.setPlatformProxy) return;
    try {
      const res = await window.electronAPI.setPlatformProxy(platformId, nextProxy);
      setProxyDrafts((prev) => ({ ...prev, [platformId]: res.proxyUrl ?? '' }));
      setProxyEditorId(null);
      setProxyMsg(res.proxyUrl ? `已保存 ${platformId} 独立代理` : `已清除 ${platformId} 代理配置`);
      setTimeout(() => setProxyMsg(''), 2500);
    } catch (err) {
      setProxyMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold">外部平台隔离沙箱托管</h2>
      <p className="mt-1 mb-4 text-xs text-[var(--control-text-color)]">
        常规平台使用加固版 Electron <code>persist:platform_*</code> 沙箱；高风控平台（小红书/抖音）优先启动独立真实 Chrome Profile，支持按平台配置独立网络代理。
      </p>
      {proxyMsg && (
        <div className="mb-3 rounded border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs text-[var(--accent)]">
          {proxyMsg}
        </div>
      )}
      <div className="divide-y divide-[var(--border-color)] rounded border border-[var(--border-color)]">
        {VISIBLE_PLATFORM_CATALOG.map((p) => {
          const online = Boolean(authStates[p.id]);
          const savedProxy = proxyDrafts[p.id] ?? '';
          const editingProxy = proxyEditorId === p.id;
          return (
            <div key={p.id} className="px-4 py-3 hover:bg-[var(--bg-hover)]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                    <span>{p.name}</span>
                    {p.authChannel === 'isolated_profile' && (
                      <span className="rounded-full bg-[#ddf4ff] px-2 py-0.5 text-[10px] font-medium text-[#0969da]">
                        独立 Chrome Profile
                      </span>
                    )}
                    {online ? (
                      <span className="rounded-full bg-[#dafbe1] px-2 py-0.5 text-[11px] text-[#116329]">
                        ● 已授权
                      </span>
                    ) : (
                      <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--control-text-color)]">
                        未登录
                      </span>
                    )}
                    {savedProxy && (
                      <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--control-text-color)]">
                        代理: {savedProxy}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--control-text-color)]">
                    默认模式：{p.defaultMode === 'draft' ? '推入草稿箱' : '直接发布'} · 参考：{p.referenceSource}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProxyEditorId(editingProxy ? null : p.id)}
                    className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--control-text-color)] hover:border-[var(--accent)] hover:text-[var(--text-main)]"
                  >
                    {editingProxy ? '收起代理' : '独立代理'}
                  </button>
                  {online && (
                    <button
                      type="button"
                      onClick={() => onPlatformLogout?.(p.id)}
                      title="清除该平台沙箱内所有持久化 Cookie 并退出登录"
                      className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-red-500 hover:border-red-500 hover:bg-red-500/10 cursor-pointer"
                    >
                      退出授权
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onPlatformLogin(p.id)}
                    className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {online ? '更新/切换账号' : '打开登录窗授权'}
                  </button>
                </div>
              </div>
              {editingProxy && (
                <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--border-color)]/60 pt-2.5">
                  <input
                    type="text"
                    value={savedProxy}
                    onChange={(e) =>
                      setProxyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    placeholder="可选，如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
                    className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-xs outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveProxy(p.id, savedProxy)}
                    className="rounded bg-[var(--accent)] px-2.5 py-1 text-xs text-white hover:opacity-90"
                  >
                    保存代理
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveProxy(p.id, '')}
                    className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-xs text-[var(--control-text-color)] hover:text-[var(--text-main)]"
                  >
                    直连
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
