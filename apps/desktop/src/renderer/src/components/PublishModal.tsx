import { useEffect, useMemo, useState } from 'react';
import { extractWeixinDigest, renderWeixinHtml } from '@vcat/core/weixin';
import type {
  ArticleMeta,
  GitStatusInfo,
  MultiPlatformPublishResultItem,
  PlatformId,
  PublishMode,
  SocialCoverRatio,
} from '@vcat/shared';
import {
  PlatformPreviewPane,
  PreflightBanner,
  PublishResultRow,
  VISIBLE_PLATFORM_CATALOG,
} from '../features/publish-drawer';

interface PublishModalProps {
  activeArticle: ArticleMeta | null;
  gitStatus: GitStatusInfo;
  gitPushLog: string;
  markdown: string;
  onClose: () => void;
  onGitPush: () => void;
  onSaveArticle: (content: string) => void;
}

const PLATFORM_BROWSER_META: Partial<
  Record<PlatformId, { badge: string; color: string; dashboardUrl: string; loginUrl: string }>
> = {
  github_static: { badge: 'GH', color: '#24292f', dashboardUrl: 'https://github.com/', loginUrl: 'https://github.com/login' },
  weixin: { badge: '微信', color: '#07c160', dashboardUrl: 'https://mp.weixin.qq.com/', loginUrl: 'https://mp.weixin.qq.com/' },
  cnblogs: { badge: '博', color: '#2e64b0', dashboardUrl: 'https://i.cnblogs.com/posts', loginUrl: 'https://account.cnblogs.com/signin' },
  juejin: { badge: '掘', color: '#1e80ff', dashboardUrl: 'https://juejin.cn/creator/content/article/drafts', loginUrl: 'https://juejin.cn/login' },
  csdn: { badge: 'C', color: '#fc5531', dashboardUrl: 'https://mp.csdn.net/mp_blog/manage/article', loginUrl: 'https://passport.csdn.net/login' },
  zhihu: { badge: '知', color: '#0066ff', dashboardUrl: 'https://www.zhihu.com/creator', loginUrl: 'https://www.zhihu.com/signin' },
  baijiahao: { badge: '百', color: '#2932e1', dashboardUrl: 'https://baijiahao.baidu.com/', loginUrl: 'https://baijiahao.baidu.com/builder/theme/bjh/login' },
  weibo: { badge: '微', color: '#e6162d', dashboardUrl: 'https://card.weibo.com/article/v3/editor', loginUrl: 'https://weibo.com/login.php' },
  bilibili: { badge: 'B', color: '#fb7299', dashboardUrl: 'https://member.bilibili.com/platform/home', loginUrl: 'https://passport.bilibili.com/login' },
  douyin: { badge: '抖', color: '#111827', dashboardUrl: 'https://creator.douyin.com/', loginUrl: 'https://creator.douyin.com/' },
  xiaohongshu: { badge: '红', color: '#ff2442', dashboardUrl: 'https://creator.xiaohongshu.com/', loginUrl: 'https://creator.xiaohongshu.com/login' },
};

const MODAL_TABS: Array<{ id: 'weixin' | 'git' | 'browser'; label: string }> = [
  { id: 'weixin', label: '微信公众号排版' },
  { id: 'git', label: '多平台分发 / Git' },
  { id: 'browser', label: '🌐 平台快捷浏览器' },
];

/** Multi-platform publish, inline-CSS/social card preview & built-in sandbox browser hub modal. */
export function PublishModal({
  activeArticle,
  gitStatus,
  markdown,
  onClose,
  onGitPush,
  onSaveArticle,
}: PublishModalProps) {
  const [tab, setTab] = useState<'weixin' | 'git' | 'browser'>('weixin');
  const [author, setAuthor] = useState('');
  const [digest, setDigest] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [showCoverInBody, setShowCoverInBody] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [pushingWeixin, setPushingWeixin] = useState(false);
  const [weixinPushMsg, setWeixinPushMsg] = useState('');

  const [authStates, setAuthStates] = useState<Partial<Record<PlatformId, boolean>>>({});
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(['weixin']);
  const [platformModes, setPlatformModes] = useState<Record<string, PublishMode>>(() =>
    Object.fromEntries(VISIBLE_PLATFORM_CATALOG.map((p) => [p.id, p.defaultMode]))
  );
  const [includeRemoteImages, setIncludeRemoteImages] = useState(true);
  const [socialThemeId, setSocialThemeId] = useState<string | null>(null);
  const [socialCoverRatio, setSocialCoverRatio] = useState<SocialCoverRatio>('3:4');
  const [pushingMulti, setPushingMulti] = useState(false);
  const [multiResults, setMultiResults] = useState<MultiPlatformPublishResultItem[]>([]);
  const [preflightBlocked, setPreflightBlocked] = useState<{
    faultyPlatforms: PlatformId[];
    healthyPlatforms: PlatformId[];
  } | null>(null);

  const refreshAuthStates = async () => {
    if (!window.electronAPI?.getPlatformAuthStates) return;
    setCheckingAuth(true);
    try {
      const states = await window.electronAPI.getPlatformAuthStates();
      setAuthStates(states ?? {});
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    void refreshAuthStates();
    const unsub = window.electronAPI?.onPlatformAuthUpdated?.((states) => {
      setAuthStates((prev) => ({ ...prev, ...states }));
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (tab === 'git' || tab === 'browser') {
      void refreshAuthStates();
    }
  }, [tab]);

  const togglePlatform = (id: PlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openBuiltInBrowser = async (platformId: PlatformId, online: boolean) => {
    const meta = PLATFORM_BROWSER_META[platformId];
    const targetUrl = online ? meta?.dashboardUrl : meta?.loginUrl;
    if (!targetUrl || !window.electronAPI?.openPlatformLogin) return;
    await window.electronAPI.openPlatformLogin(platformId, targetUrl);
    await refreshAuthStates();
  };

  const executePublishToTargets = async (targets: PlatformId[]) => {
    if (!window.electronAPI?.publishMultiPlatform || targets.length === 0) return;
    setPushingMulti(true);
    setMultiResults([]);
    setPreflightBlocked(null);
    try {
      const res = await window.electronAPI.publishMultiPlatform({
        title: activeArticle?.title || '未命名文章',
        markdown,
        author: author.trim() || undefined,
        digest: digest.trim() || undefined,
        coverImageUrl: coverUrl.trim() || undefined,
        showCoverInBody,
        sourceUrl: sourceUrl.trim() || undefined,
        includeRemoteImages,
        socialThemeId: socialThemeId ?? undefined,
        socialCoverRatio,
        targets: targets.map((platformId) => ({
          platformId,
          mode: platformModes[platformId] ?? 'direct',
        })),
      });
      setMultiResults(res.results ?? []);
    } finally {
      setPushingMulti(false);
    }
  };

  const handlePushMultiPlatform = async () => {
    if (selectedPlatforms.length === 0) return;
    const faulty = selectedPlatforms.filter((id) => !authStates[id]);
    const healthy = selectedPlatforms.filter((id) => Boolean(authStates[id]));
    if (faulty.length > 0) {
      setPreflightBlocked({ faultyPlatforms: faulty, healthyPlatforms: healthy });
      return;
    }
    await executePublishToTargets(selectedPlatforms);
  };

  const handleExcludeFaultyAndPublish = async () => {
    if (!preflightBlocked) return;
    const healthy = preflightBlocked.healthyPlatforms;
    setSelectedPlatforms(healthy);
    await executePublishToTargets(healthy);
  };

  const handlePushWeixinDraft = async () => {
    if (!window.electronAPI?.publishWeixinDraft) {
      setWeixinPushMsg('当前环境不支持直接推送，请使用「一键复制公众号富文本」');
      return;
    }
    setPushingWeixin(true);
    setWeixinPushMsg('正在上传图片并推送至公众号草稿箱…');
    try {
      const res = await window.electronAPI.publishWeixinDraft({
        title: activeArticle?.title || '未命名文章',
        markdown,
        author: author.trim() || undefined,
        digest: digest.trim() || undefined,
        coverImageUrl: coverUrl.trim() || undefined,
        showCoverInBody,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setWeixinPushMsg(
        res.ok ? `已推送至公众号草稿箱（ID: ${res.postId}${res.verified ? ' · 已校验' : ''}）` : res.message
      );
    } catch (err) {
      setWeixinPushMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPushingWeixin(false);
    }
  };

  const autoDigest = useMemo(() => extractWeixinDigest(markdown), [markdown]);
  const weixinRendered = useMemo(
    () => renderWeixinHtml(markdown, { coverImageUrl: coverUrl, showCoverInBody }),
    [markdown, coverUrl, showCoverInBody]
  );

  const handleCopyWeixinRichText = async () => {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([weixinRendered.html], { type: 'text/html' }),
            'text/plain': new Blob([markdown], { type: 'text/plain' }),
          }),
        ]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(weixinRendered.html);
      }
      setCopyStatus('已复制公众号富文本 ✓');
      setTimeout(() => setCopyStatus(''), 2500);
    } catch {
      setCopyStatus('复制失败，请检查剪贴板权限');
    }
  };

  const handleSaveAndClose = () => {
    onSaveArticle(markdown);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-xs">
      <div className="flex max-h-[88vh] w-[860px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-semibold">
          <span className="truncate pr-2">合并分发（{activeArticle?.title ?? '未选择文章'}）</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {MODAL_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  tab === item.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onClose}
              className="ml-2 text-xs text-[var(--control-text-color)] hover:text-[var(--text-main)]"
            >
              关闭
            </button>
          </div>
        </div>

        {tab === 'weixin' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
            <div className="space-y-3 text-xs">
              <div className="space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3">
                <div className="font-semibold text-[var(--text-main)]">头图与副文本元信息</div>
                {([
                  ['头图 / 封面图 URL（建议 2.35:1 如 900×383）', coverUrl, setCoverUrl, 'https://... 或 ./assets/cover.png'],
                  ['作者', author, setAuthor, '选填，如：Vmark 作者'],
                  ['阅读原文链接', sourceUrl, setSourceUrl, 'https://...'],
                ] as const).map(([label, val, setter, placeholder], idx) => (
                  <div key={label} className="space-y-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-[var(--control-text-color)]">{label}</span>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => setter(e.target.value)}
                        placeholder={placeholder}
                        className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    {idx === 0 && (
                      <label className="flex items-center gap-2 text-[11px] text-[var(--control-text-color)]">
                        <input type="checkbox" checked={showCoverInBody} onChange={(e) => setShowCoverInBody(e.target.checked)} />
                        在正文顶部同时展示封面图
                      </label>
                    )}
                    {idx === 1 && (
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-[var(--control-text-color)]">摘要（留空将自动提取正文前 120 字）</span>
                        <textarea
                          rows={3}
                          value={digest}
                          onChange={(e) => setDigest(e.target.value)}
                          placeholder={autoDigest || '文章摘要…'}
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void handleCopyWeixinRichText()} className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                  一键复制公众号富文本
                </button>
                <button type="button" disabled={pushingWeixin} onClick={() => void handlePushWeixinDraft()} className="rounded border border-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] disabled:opacity-50">
                  {pushingWeixin ? '推送中…' : '推送到公众号草稿箱'}
                </button>
                {activeArticle && (
                  <button type="button" onClick={handleSaveAndClose} className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-main)] hover:bg-[var(--bg-hover)]">
                    保存本地文章
                  </button>
                )}
                {copyStatus && <span className="text-xs text-[var(--accent)]">{copyStatus}</span>}
                {weixinPushMsg && <div className="w-full text-[11px] text-[var(--accent)]">{weixinPushMsg}</div>}
              </div>
            </div>
            <PlatformPreviewPane
              markdown={markdown}
              title={activeArticle?.title}
              weixinRendered={weixinRendered}
              socialThemeId={socialThemeId}
              socialCoverRatio={socialCoverRatio}
              onSocialThemeChange={setSocialThemeId}
              onSocialCoverRatioChange={setSocialCoverRatio}
            />
          </div>
        )}

        {tab === 'git' && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-[13px] text-[var(--control-text-color)]">
            {gitStatus.isGitRepo && (
              <div className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2">
                <div>
                  <div className="font-medium text-[var(--text-main)]">GitHub 静态博客 ({gitStatus.branch})</div>
                  <div className="text-[11px]">{gitStatus.changedFiles} 项改动待推送</div>
                </div>
                <button
                  type="button"
                  onClick={onGitPush}
                  className="rounded bg-[var(--accent)] px-2.5 py-1 text-xs text-white hover:opacity-90"
                >
                  Commit & Push
                </button>
              </div>
            )}
            {preflightBlocked && (
              <PreflightBanner
                faultyPlatforms={preflightBlocked.faultyPlatforms}
                healthyCount={preflightBlocked.healthyPlatforms.length}
                disabled={pushingMulti}
                onExcludeAndPublish={() => void handleExcludeFaultyAndPublish()}
                onDismiss={() => setPreflightBlocked(null)}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-[var(--text-main)]">
                <input
                  type="checkbox"
                  checked={includeRemoteImages}
                  onChange={(e) => setIncludeRemoteImages(e.target.checked)}
                />
                自动转存第三方防盗链外链图片与本地图片（带平台 Referer 抓取并重写）
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedPlatforms(VISIBLE_PLATFORM_CATALOG.filter((p) => Boolean(authStates[p.id])).map((p) => p.id))}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-[11px] text-[var(--text-main)] hover:border-[var(--accent)]"
                >
                  全选已授权
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlatforms(VISIBLE_PLATFORM_CATALOG.map((p) => p.id))}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-[11px] text-[var(--text-main)] hover:border-[var(--accent)]"
                >
                  全选全部
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlatforms([])}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-[11px] text-[var(--control-text-color)] hover:text-[var(--text-main)]"
                >
                  清空
                </button>
                <button
                  type="button"
                  disabled={checkingAuth}
                  onClick={() => void refreshAuthStates()}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-[11px] text-[var(--text-main)] hover:border-[var(--accent)]"
                >
                  {checkingAuth ? '检测中…' : '刷新账号检测状态'}
                </button>
              </div>
            </div>

            <div className="divide-y divide-[var(--border-color)] rounded-lg border border-[var(--border-color)]">
              {VISIBLE_PLATFORM_CATALOG.map((p) => {
                const checked = selectedPlatforms.includes(p.id);
                const online = Boolean(authStates[p.id]);
                const currentMode = platformModes[p.id] ?? p.defaultMode;
                const result = multiResults.find((r) => r.platformId === p.id);
                return (
                  <div key={p.id} className="flex flex-col gap-1 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-2 font-medium text-[var(--text-main)]">
                        <input type="checkbox" checked={checked} onChange={() => togglePlatform(p.id)} />
                        <span>{p.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${online ? 'bg-[#dafbe1] text-[#116329]' : 'bg-[var(--bg-elevated)] text-[var(--control-text-color)]'}`}>
                          {online ? '● 已授权' : '未登录'}
                        </span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openBuiltInBrowser(p.id, online)}
                          title="在 Vmark 内置多标签沙箱浏览器中打开该平台后台/草稿箱"
                          className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-0.5 text-[11px] text-[var(--control-text-color)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          内置浏览器
                        </button>
                        <select
                          aria-label={`${p.name} 发布模式`}
                          value={currentMode}
                          disabled={p.supportedModes.length <= 1}
                          onChange={(e) => setPlatformModes((prev) => ({ ...prev, [p.id]: e.target.value as PublishMode }))}
                          className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-0.5 text-[11px] text-[var(--text-main)]"
                        >
                          {p.supportedModes.includes('draft') && <option value="draft">推入草稿箱</option>}
                          {p.supportedModes.includes('direct') && <option value="direct">直接发布</option>}
                        </select>
                      </div>
                    </div>
                    {result && <PublishResultRow result={result} />}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                disabled={pushingMulti || selectedPlatforms.length === 0}
                onClick={() => void handlePushMultiPlatform()}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pushingMulti ? '正在并行分发…' : `一键分发至所选平台 (${selectedPlatforms.length})`}
              </button>
              {activeArticle && (
                <button type="button" onClick={handleSaveAndClose} className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-main)] hover:bg-[var(--bg-hover)]">
                  保存本地文章
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'browser' && (
          <div data-testid="platform-browser-grid" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2.5">
              <div>
                <div className="font-semibold text-[var(--text-main)]">多平台沙箱快捷浏览器宫格</div>
                <div className="text-[11px] text-[var(--control-text-color)]">
                  点击任意平台卡片直接启动 Vmark 内置多标签沙箱浏览器（保留各平台独立 Cookie，顶栏可跨平台切换 Tab）。
                </div>
              </div>
              <button type="button" disabled={checkingAuth} onClick={() => void refreshAuthStates()} className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-[11px] text-[var(--text-main)] hover:border-[var(--accent)]">
                {checkingAuth ? '检测中…' : '刷新授权状态'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {VISIBLE_PLATFORM_CATALOG.map((p) => {
                const online = Boolean(authStates[p.id]);
                const meta = PLATFORM_BROWSER_META[p.id] ?? { badge: p.name.slice(0, 1), color: '#007aff' };
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void openBuiltInBrowser(p.id, online)}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3.5 text-center transition hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
                  >
                    <div style={{ backgroundColor: meta.color }} className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white shadow-xs">
                      {meta.badge}
                    </div>
                    <div className="font-semibold text-[var(--text-main)]">{p.name}</div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${online ? 'bg-[#dafbe1] text-[#116329]' : 'bg-[var(--bg-main)] text-[var(--control-text-color)]'}`}>
                      {online ? '● 已授权 · 进后台' : '未登录 · 点此授权'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
