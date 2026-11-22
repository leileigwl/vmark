import { useMemo, useState } from 'react';
import type { SocialImageMode } from '@vcat/shared';
import {
  GENRE_META,
  PLATFORM_COVER_SPECS,
  SOCIAL_CARD_PRESETS,
  getSocialCardTheme,
  renderBaijiahaoHtml,
  renderXiaohongshuCards,
  renderZhihuHtml,
  type PlatformCoverRatio,
  type WeixinRenderedResult,
} from '@vcat/core';

export type PreviewPlatform = 'weixin' | 'zhihu' | 'baijiahao' | 'xiaohongshu' | 'douyin';

const PREVIEW_TABS: Array<{ id: PreviewPlatform; label: string; imageGuide: string }> = [
  { id: 'weixin', label: '微信公众号', imageGuide: '配图建议：封面头图 900×383 (2.35:1)，正文配图宽 ≥ 640px' },
  { id: 'zhihu', label: '知乎专栏', imageGuide: '配图建议：专栏封面图 16:9 (1200×675)，正文配图自动转存' },
  { id: 'baijiahao', label: '百家号', imageGuide: '配图建议：封面图 16:9 或三图模式，正文首图可作封面' },
  { id: 'xiaohongshu', label: '小红书 3:4 卡片', imageGuide: '配图建议：3:4 (1080×1440) 或长文 2:3 (1080×1620)，默认苹果备忘录流式排版' },
  { id: 'douyin', label: '抖音 3:4 图文', imageGuide: '配图建议：3:4 (1080×1440) 或 9:16 全屏图文，默认极简杂志/备忘录清晰排版' },
];

const THEME_OPTIONS = Object.values(SOCIAL_CARD_PRESETS);
const RATIO_OPTIONS: PlatformCoverRatio[] = ['3:4', '2:3', '9:16', '16:9', '2.35:1'];

interface PlatformPreviewPaneProps {
  markdown: string;
  title?: string;
  weixinRendered: WeixinRenderedResult;
  socialThemeId?: string | null;
  socialCoverRatio?: PlatformCoverRatio;
  socialImageMode?: SocialImageMode;
  onSocialThemeChange?: (themeId: string) => void;
  onSocialCoverRatioChange?: (ratio: PlatformCoverRatio) => void;
  onSocialImageModeChange?: (mode: SocialImageMode) => void;
}

/** Rewrites relative workspace image paths to `vcat-asset://local/...` for renderer preview only. */
function rewritePreviewLocalImages(html: string): string {
  return html.replace(/<img([^>]*?)\ssrc=(["'])([^"']+)\2/gi, (full, attrs, quote, rawSrc) => {
    const trimmed = String(rawSrc).trim();
    if (!trimmed || /^(https?:|data:|vcat-asset:|blob:|#|\/)/i.test(trimmed)) {
      return full;
    }
    const cleanRel = trimmed.replace(/^\.\//, '');
    return `<img${attrs} src=${quote}vcat-asset://local/${cleanRel}${quote}`;
  });
}

function cleanPreviewLine(raw: string): string {
  return raw
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Multi-platform pre-publish layout preview pane (WeChat, Zhihu, Baijiahao, Xiaohongshu & Douyin). */
export function PlatformPreviewPane({
  markdown,
  title,
  weixinRendered,
  socialThemeId,
  socialCoverRatio,
  socialImageMode,
  onSocialThemeChange,
  onSocialCoverRatioChange,
  onSocialImageModeChange,
}: PlatformPreviewPaneProps) {
  const [platform, setPlatform] = useState<PreviewPlatform>('weixin');
  const [internalThemeId, setInternalThemeId] = useState<string | null>(null);
  const [internalCoverRatio, setInternalCoverRatio] = useState<PlatformCoverRatio>('3:4');
  const [internalImageMode, setInternalImageMode] = useState<SocialImageMode>('cards');

  const customThemeId = socialThemeId !== undefined ? socialThemeId : internalThemeId;
  const coverRatio = socialCoverRatio ?? internalCoverRatio;
  const imageMode = socialImageMode ?? internalImageMode;

  const updateThemeId = (next: string) => {
    setInternalThemeId(next);
    onSocialThemeChange?.(next);
  };

  const updateCoverRatio = (next: PlatformCoverRatio) => {
    setInternalCoverRatio(next);
    onSocialCoverRatioChange?.(next);
  };

  const updateImageMode = (next: SocialImageMode) => {
    setInternalImageMode(next);
    onSocialImageModeChange?.(next);
  };

  const zhihuRendered = useMemo(
    () => (platform === 'zhihu' ? renderZhihuHtml(markdown) : null),
    [markdown, platform]
  );
  const baijiahaoRendered = useMemo(
    () => (platform === 'baijiahao' ? renderBaijiahaoHtml(markdown) : null),
    [markdown, platform]
  );

  const isSocialCardPlatform = platform === 'xiaohongshu' || platform === 'douyin';
  const socialPayload = useMemo(
    () =>
      isSocialCardPlatform
        ? renderXiaohongshuCards(markdown, {
            fallbackTitle: title || '个人随笔',
            coverRatio,
          })
        : null,
    [markdown, isSocialCardPlatform, title, coverRatio]
  );

  const activeThemeId = useMemo(() => {
    if (customThemeId) return customThemeId;
    if (platform === 'douyin') return 'minimalist-magazine';
    return 'ios-memo';
  }, [customThemeId, platform]);

  const tokens = useMemo(() => getSocialCardTheme(activeThemeId), [activeThemeId]);

  const handleSelectPlatform = (nextPlatform: PreviewPlatform) => {
    setPlatform(nextPlatform);
    if (!customThemeId) {
      updateCoverRatio('3:4');
    }
  };

  return (
    <div className="flex min-h-[360px] min-w-0 w-full flex-col overflow-hidden rounded-lg border border-[var(--border-color)] bg-white text-[#333]">
      <div className="flex flex-wrap items-center gap-1 border-b border-black/10 bg-[#f7f7f7] px-2.5 py-1.5">
        {PREVIEW_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelectPlatform(item.id)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
              platform === item.id
                ? 'bg-[var(--accent)] text-white'
                : 'text-[#555] hover:bg-black/5'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {platform === 'weixin' && (
        <>
          <div className="border-b border-black/10 bg-[#fafafa] px-3 py-1.5 text-[11px] text-[#555]">
            <div>公众号行内 CSS 排版预览（外链已转为文末脚注：{weixinRendered.footnotes.length} 条）</div>
            <div className="text-[10px] text-[#777]">{PREVIEW_TABS[0].imageGuide}</div>
          </div>
          <div
            data-testid="weixin-preview"
            className="flex-1 overflow-y-auto p-3"
            dangerouslySetInnerHTML={{ __html: rewritePreviewLocalImages(weixinRendered.html) }}
          />
        </>
      )}

      {platform === 'zhihu' && zhihuRendered && (
        <>
          <div className="border-b border-black/10 bg-[#fafafa] px-3 py-1.5 text-[11px] text-[#555]">
            <div>知乎专栏原生 HTML 排版预览（H1 已降级为 H2，保留代码块语言标识）</div>
            <div className="text-[10px] text-[#777]">{PREVIEW_TABS[1].imageGuide}</div>
          </div>
          <div
            data-testid="zhihu-preview"
            className="flex-1 space-y-2 overflow-y-auto p-3 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: rewritePreviewLocalImages(zhihuRendered.html) }}
          />
        </>
      )}

      {platform === 'baijiahao' && baijiahaoRendered && (
        <>
          <div className="border-b border-black/10 bg-[#fafafa] px-3 py-1.5 text-[11px] text-[#555]">
            <div>百家号语义 HTML 排版预览</div>
            <div className="text-[10px] text-[#777]">{PREVIEW_TABS[2].imageGuide}</div>
          </div>
          <div
            data-testid="baijiahao-preview"
            className="flex-1 space-y-2 overflow-y-auto p-3 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: rewritePreviewLocalImages(baijiahaoRendered.html) }}
          />
        </>
      )}

      {isSocialCardPlatform && socialPayload && (
        <>
          <div className="space-y-1.5 border-b border-black/10 bg-[#fafafa] px-3 py-2 text-[11px] text-[#555]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-[#222]">
                {platform === 'xiaohongshu' ? '小红书' : '抖音'}流式文字卡片预览（共 {socialPayload.cards.length} 张 · 题材：
                <span className="ml-1 rounded bg-black/5 px-1.5 py-0.5 font-semibold text-[#111]">
                  {GENRE_META[socialPayload.genre].badge}
                </span>
                ）
              </div>
              <div className="text-[10px] text-[#666]">
                {socialPayload.coverImage
                  ? `🖼 已关联封面：${socialPayload.coverImage}`
                  : `✨ 当前模板：${tokens.name} · ${PLATFORM_COVER_SPECS[coverRatio].label}`}
              </div>
            </div>

            <div className="space-y-1.5 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="shrink-0 text-[10px] text-[#777]">内页模板：</span>
                {THEME_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => updateThemeId(t.id)}
                    className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                      activeThemeId === t.id
                        ? 'bg-[#1c1c1e] text-white'
                        : 'border border-black/10 bg-white text-[#555] hover:bg-black/5'
                    }`}
                  >
                    {t.name.split(' ')[0]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="shrink-0 text-[10px] text-[#777]">页面比例：</span>
                {RATIO_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => updateCoverRatio(r)}
                    className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-mono transition ${
                      coverRatio === r
                        ? 'bg-[var(--accent)] text-white'
                        : 'border border-black/10 bg-white text-[#555] hover:bg-black/5'
                    }`}
                  >
                    {r}
                  </button>
                ))}
                <span className="ml-1 shrink-0 text-[10px] text-[#777]">分发配图：</span>
                <button
                  type="button"
                  data-testid="social-image-mode-cards"
                  onClick={() => updateImageMode('cards')}
                  className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                    imageMode === 'cards'
                      ? 'bg-[#1c1c1e] text-white'
                      : 'border border-black/10 bg-white text-[#555] hover:bg-black/5'
                  }`}
                >
                  视觉卡片(默认)
                </button>
                <button
                  type="button"
                  data-testid="social-image-mode-article"
                  onClick={() => updateImageMode('article_images')}
                  className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                    imageMode === 'article_images'
                      ? 'bg-[#1c1c1e] text-white'
                      : 'border border-black/10 bg-white text-[#555] hover:bg-black/5'
                  }`}
                >
                  仅发正文原图
                </button>
              </div>
            </div>
          </div>

          <div
            data-testid={platform === 'xiaohongshu' ? 'xiaohongshu-preview' : 'douyin-preview'}
            data-theme-id={activeThemeId}
            data-cover-ratio={coverRatio}
            className="flex-1 space-y-3 overflow-y-auto bg-[#e5e5ea] p-3"
          >
            <div className="grid min-w-0 grid-cols-2 gap-3">
              {socialPayload.cards.map((card, idx) => {
                const isCover = card.type === 'cover';
                const isCode = card.type === 'code';
                const isMemo = tokens.chrome === 'ios-memo';
                const isMag = tokens.chrome === 'minimalist-magazine';
                const aspectClass =
                  isCover && coverRatio === '16:9'
                    ? 'col-span-2 aspect-[16/9]'
                    : isCover && coverRatio === '2.35:1'
                      ? 'col-span-2 aspect-[2.35/1]'
                      : coverRatio === '2:3'
                        ? 'aspect-[2/3]'
                        : isCover && coverRatio === '9:16'
                          ? 'aspect-[9/16]'
                          : 'aspect-[3/4]';

                return (
                  <div
                    key={`${card.type}-${idx}`}
                    style={{
                      backgroundColor: tokens.paper,
                      color: tokens.ink,
                      fontFamily: tokens.fontBody,
                    }}
                    className={`flex min-w-0 ${aspectClass} flex-col justify-between overflow-hidden rounded-xl border border-black/10 p-2.5 shadow-sm`}
                  >
                    {/* iOS Notes Top Navigation Bar (only for ios-memo) */}
                    {isMemo && (
                      <div className="flex shrink-0 items-center justify-between px-1 pb-1 text-[9px] font-medium">
                        <span className="shrink-0" style={{ color: tokens.accent }}>‹ 备忘录</span>
                        <span style={{ color: tokens.textMuted }} className="truncate px-1 text-[8px]">
                          Vmark 笔记
                        </span>
                        <span className="shrink-0" style={{ color: tokens.accent }}>完成</span>
                      </div>
                    )}

                    {/* Inner Sheet / Flowing Content Area */}
                    <div
                      style={{
                        backgroundColor: isMemo ? tokens.sheetBg : 'transparent',
                        backgroundImage: isMemo
                          ? `repeating-linear-gradient(to bottom, transparent 0px, transparent 17px, ${tokens.ruledLineColor} 17px, ${tokens.ruledLineColor} 18px)`
                          : undefined,
                        borderTop: isMag ? `1px solid ${tokens.line}` : undefined,
                        borderBottom: isMag ? `1px solid ${tokens.line}` : undefined,
                      }}
                      className={`flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-1.5 overflow-hidden ${
                        isMemo ? 'rounded-lg p-2.5 shadow-2xs' : 'py-2'
                      }`}
                    >
                      <div
                        style={{ color: tokens.headingInk, fontFamily: tokens.fontDisplay }}
                        className="shrink-0 break-words text-xs font-extrabold leading-[1.35]"
                      >
                        <div className="line-clamp-2">{card.title}</div>
                      </div>

                      {card.quote && (
                        <div
                          style={{
                            backgroundColor: tokens.quoteBg,
                            borderLeftColor: tokens.lineStrong,
                            color: tokens.textSecondary,
                          }}
                          className="shrink-0 rounded border-l-2 px-2 py-1 text-[9px] italic leading-[1.45]"
                        >
                          <div className="line-clamp-2 break-words">{cleanPreviewLine(card.quote)}</div>
                        </div>
                      )}

                      {isCode ? (
                        <div
                          style={{
                            backgroundColor: '#18181B',
                            color: '#F4F4F5',
                          }}
                          className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-lg p-2 font-mono text-[8.5px]"
                        >
                          <div className="mb-1 flex shrink-0 items-center justify-between border-b border-white/10 pb-1">
                            <span className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f56]" />
                              <span className="h-1.5 w-1.5 rounded-full bg-[#ffbd2e]" />
                              <span className="h-1.5 w-1.5 rounded-full bg-[#27c93f]" />
                            </span>
                            <span className="text-[8px] uppercase opacity-75">
                              {card.codeLang || 'TS'}
                            </span>
                          </div>
                          <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
                            {card.bodyLines.slice(0, 6).map((line, i) => (
                              <div key={i} className="flex gap-1.5 leading-tight">
                                <span className="select-none opacity-40">
                                  {String(i + 1).padStart(2, '0')}
                                </span>
                                <span className="break-words whitespace-pre-wrap">{line}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="min-h-0 min-w-0 flex-1 space-y-1.5 overflow-hidden text-[9px] leading-[1.5]">
                          {card.bodyLines.slice(0, card.quote ? 2 : 3).map((line, i) => (
                            <p key={i} className="line-clamp-2 [overflow-wrap:anywhere] text-justify">
                              {cleanPreviewLine(line)}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Subtle Right-Aligned Page Number */}
                    <div
                      style={{ color: tokens.textMuted }}
                      className="shrink-0 pt-1 pr-1 text-right text-[8.5px]"
                    >
                      {idx + 1} / {socialPayload.cards.length}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-2.5 text-[11px] text-[#555]">
              <div className="mb-1 flex items-center justify-between font-medium text-[#222]">
                <span>配文摘要与话题标签</span>
                <span className="font-mono text-[10px] text-[#888]">
                  画幅规格：{PLATFORM_COVER_SPECS[coverRatio].label}
                </span>
              </div>
              <div className="line-clamp-3 whitespace-pre-wrap">{socialPayload.captionText}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
