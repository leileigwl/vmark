import { useEffect, useMemo, useState } from 'react';
import { PLATFORM_CATALOG } from '@vcat/adapters';
import { extractWeixinDigest, renderWeixinHtml } from '@vcat/core/weixin';
import type {
  ArticleMeta,
  GitStatusInfo,
  MultiPlatformPublishResultItem,
  PlatformId,
  PublishMode,
} from '@vcat/shared';

interface PublishModalProps {
  activeArticle: ArticleMeta | null;
  gitStatus: GitStatusInfo;
  gitPushLog: string;
  markdown: string;
  onClose: () => void;
  onGitPush: () => void;
  onSaveArticle: (content: string) => void;
}

/** Multi-platform publish, WeChat Official Account inline-CSS preview & local Git push modal. */
export function PublishModal({
  activeArticle,
  gitStatus,
  gitPushLog,
  markdown,
  onClose,
  onGitPush,
  onSaveArticle,
}: PublishModalProps) {
  const [tab, setTab] = useState<'weixin' | 'git'>('weixin');
  const [author, setAuthor] = useState('');
  const [digest, setDigest] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [showCoverInBody, setShowCoverInBody] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [pushingWeixin, setPushingWeixin] = useState(false);
  const [weixinPushMsg, setWeixinPushMsg] = useState('');

  // Multi-platform batch dispatch state
  const [authStates, setAuthStates] = useState<Partial<Record<PlatformId, boolean>>>({});
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(['weixin']);
  const [platformModes, setPlatformModes] = useState<Record<string, PublishMode>>(() =>
    Object.fromEntries(PLATFORM_CATALOG.map((p) => [p.id, p.defaultMode]))
  );
  const [includeRemoteImages, setIncludeRemoteImages] = useState(true);
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
    if (tab === 'git') {
      void refreshAuthStates();
    }
  }, [tab]);

  const togglePlatform = (id: PlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
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
      if (res.ok) {
        setWeixinPushMsg(`已推送至公众号草稿箱（ID: ${res.postId}${res.verified ? ' · 已校验' : ''}）`);
      } else {
        setWeixinPushMsg(res.message);
      }
    } catch (err) {
      setWeixinPushMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPushingWeixin(false);
    }
  };

  const autoDigest = useMemo(() => extractWeixinDigest(markdown), [markdown]);
  const weixinRendered = useMemo(
    () =>
      renderWeixinHtml(markdown, {
        coverImageUrl: coverUrl,
        showCoverInBody,
      }),
    [markdown, coverUrl, showCoverInBody]
  );

  const handleCopyWeixinRichText = async () => {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const htmlBlob = new Blob([weixinRendered.html], { type: 'text/html' });
        const textBlob = new Blob([markdown], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-xs">
      <div className="flex max-h-[88vh] w-[820px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-semibold">
          <span>合并分发（{activeArticle?.title ?? '未选择文章'}）</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('weixin')}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                tab === 'weixin'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              微信公众号排版
            </button>
            <button
              type="button"
              onClick={() => setTab('git')}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                tab === 'git'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              多平台分发 / Git
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 text-xs text-[var(--control-text-color)] hover:text-[var(--text-main)]"
            >
              关闭
            </button>
          </div>
        </div>

        {tab === 'weixin' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
            <div className="space-y-3 text-xs">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3">
                <div className="mb-2 font-semibold text-[var(--text-main)]">头图与副文本元信息</div>
                <label className="mb-2 block">
                  <span className="mb-1 block text-[11px] text-[var(--control-text-color)]">
                    头图 / 封面图 URL（建议 2.35:1 如 900×383）
                  </span>
                  <input
                    type="text"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://... 或 ./assets/cover.png"
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="mb-2 flex items-center gap-2 text-[11px] text-[var(--control-text-color)]">
                  <input
                    type="checkbox"
                    checked={showCoverInBody}
                    onChange={(e) => setShowCoverInBody(e.target.checked)}
                  />
                  在正文顶部同时展示封面图
                </label>
                <label className="mb-2 block">
                  <span className="mb-1 block text-[11px] text-[var(--control-text-color)]">作者</span>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="选填，如：Vmark 作者"
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="mb-2 block">
                  <span className="mb-1 block text-[11px] text-[var(--control-text-color)]">
                    摘要（留空将自动提取正文前 120 字）
                  </span>
                  <textarea
                    rows={3}
                    value={digest}
                    onChange={(e) => setDigest(e.target.value)}
                    placeholder={autoDigest || '文章摘要…'}
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-[var(--control-text-color)]">阅读原文链接</span>
                  <input
                    type="text"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyWeixinRichText()}
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  一键复制公众号富文本
                </button>
                <button
                  type="button"
                  disabled={pushingWeixin}
                  onClick={() => void handlePushWeixinDraft()}
                  className="rounded border border-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  {pushingWeixin ? '推送中…' : '推送到公众号草稿箱'}
                </button>
                {activeArticle && (
                  <button
                    type="button"
                    onClick={() => {
                      onSaveArticle(markdown);
                      onClose();
                    }}
                    className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
                  >
                    保存本地文章
                  </button>
                )}
                {copyStatus && <span className="text-xs text-[var(--accent)]">{copyStatus}</span>}
                {weixinPushMsg && <div className="w-full text-[11px] text-[var(--accent)]">{weixinPushMsg}</div>}
              </div>
            </div>

            <div className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-[var(--border-color)] bg-white text-[#333]">
              <div className="border-b border-black/10 bg-[#f7f7f7] px-3 py-2 text-[11px] font-medium text-[#555]">
                公众号行内 CSS 排版预览（外链已转为文末脚注：{weixinRendered.footnotes.length} 条）
              </div>
              <div
                data-testid="weixin-preview"
                className="flex-1 overflow-y-auto p-3"
                dangerouslySetInnerHTML={{ __html: weixinRendered.html }}
              />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-[13px] text-[var(--control-text-color)]">
            {gitStatus.isGitRepo && (
              <div className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2">
                <div>
                  <div className="font-medium text-[var(--text-main)]">
                    GitHub 静态博客 ({gitStatus.branch})
                  </div>
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
              <div className="rounded-lg border border-[#cf222e] bg-[#ffebe9] p-3 text-xs text-[#cf222e]">
                <div className="font-semibold">
                  ⚠️ 前置强校验拦截：检测到以下已勾选平台尚未完成授权登录
                </div>
                <div className="mt-1 text-[11px] text-[#24292f]">
                  已拦截本次分发，防止出现「部分平台成功、部分平台失败」的不一致脏状态：
                  <span className="ml-1 font-medium text-[#cf222e]">
                    {preflightBlocked.faultyPlatforms
                      .map((id) => PLATFORM_CATALOG.find((p) => p.id === id)?.name || id)
                      .join('、')}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={preflightBlocked.healthyPlatforms.length === 0 || pushingMulti}
                    onClick={() => void handleExcludeFaultyAndPublish()}
                    className="rounded bg-[#cf222e] px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    一键排除故障平台，继续发布健康平台 ({preflightBlocked.healthyPlatforms.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreflightBlocked(null)}
                    className="rounded border border-[#cf222e]/30 bg-white px-2 py-1 text-[11px] text-[#24292f] hover:bg-[#f6f8fa]"
                  >
                    暂缓发布，先去授权
                  </button>
                </div>
              </div>
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
              <button
                type="button"
                disabled={checkingAuth}
                onClick={() => void refreshAuthStates()}
                className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-[11px] text-[var(--text-main)] hover:border-[var(--accent)]"
              >
                {checkingAuth ? '检测中…' : '刷新账号检测状态'}
              </button>
            </div>

            <div className="divide-y divide-[var(--border-color)] rounded-lg border border-[var(--border-color)]">
              {PLATFORM_CATALOG.map((p) => {
                const checked = selectedPlatforms.includes(p.id);
                const online = Boolean(authStates[p.id]);
                const currentMode = platformModes[p.id] ?? p.defaultMode;
                const result = multiResults.find((r) => r.platformId === p.id);
                return (
                  <div key={p.id} className="flex flex-col gap-1 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-2 font-medium text-[var(--text-main)]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePlatform(p.id)}
                        />
                        <span>{p.name}</span>
                        {online ? (
                          <span className="rounded-full bg-[#dafbe1] px-2 py-0.5 text-[10px] text-[#116329]">
                            ● 已授权
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--control-text-color)]">
                            未登录
                          </span>
                        )}
                      </label>
                      <select
                        aria-label={`${p.name} 发布模式`}
                        value={currentMode}
                        disabled={p.supportedModes.length <= 1}
                        onChange={(e) =>
                          setPlatformModes((prev) => ({
                            ...prev,
                            [p.id]: e.target.value as PublishMode,
                          }))
                        }
                        className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-0.5 text-[11px] text-[var(--text-main)]"
                      >
                        {p.supportedModes.includes('draft') && <option value="draft">推入草稿箱</option>}
                        {p.supportedModes.includes('direct') && <option value="direct">直接发布</option>}
                      </select>
                    </div>
                    {result && (
                      <div
                        className={`pl-6 text-[11px] ${
                          result.ok ? 'text-[#116329]' : 'text-[#cf222e]'
                        }`}
                      >
                        {result.ok ? '✓ ' : '✗ '}
                        {result.message}
                        {result.postId ? `（ID: ${result.postId}）` : ''}
                      </div>
                    )}
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
                {pushingMulti
                  ? '正在并行分发…'
                  : `一键分发至所选平台 (${selectedPlatforms.length})`}
              </button>
              {activeArticle && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveArticle(markdown);
                    onClose();
                  }}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
                >
                  保存本地文章
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
