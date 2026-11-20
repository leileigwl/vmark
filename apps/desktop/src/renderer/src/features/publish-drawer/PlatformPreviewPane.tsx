import { useMemo, useState } from 'react';
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
  { id: 'xiaohongshu', label: '小红书 3:4 卡片', imageGuide: '配图建议：3:4 竖版黄金画幅 (1080×1440)，无封面时自动生成 UGC 杂志封面' },
  { id: 'douyin', label: '抖音 3:4 图文', imageGuide: '配图建议：3:4 (1080×1440) 或 9:16 全屏图文，高对比极客/杂志风' },
];

const THEME_OPTIONS = Object.values(SOCIAL_CARD_PRESETS);
const RATIO_OPTIONS: PlatformCoverRatio[] = ['3:4', '9:16', '16:9', '2.35:1'];

interface PlatformPreviewPaneProps {
  markdown: string;
  title?: string;
  weixinRendered: WeixinRenderedResult;
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

/** Multi-platform pre-publish layout preview pane (WeChat, Zhihu, Baijiahao, Xiaohongshu & Douyin 3:4 cards). */
export function PlatformPreviewPane({
  markdown,
  title,
  weixinRendered,
}: PlatformPreviewPaneProps) {
  const [platform, setPlatform] = useState<PreviewPlatform>('weixin');
  const [customThemeId, setCustomThemeId] = useState<string | null>(null);
  const [coverRatio, setCoverRatio] = useState<PlatformCoverRatio>('3:4');

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
    if (platform === 'douyin') return 'ray-dark';
    if (socialPayload) return GENRE_META[socialPayload.genre].defaultTheme;
    return 'editorial-coral';
  }, [customThemeId, platform, socialPayload]);

  const tokens = useMemo(() => getSocialCardTheme(activeThemeId), [activeThemeId]);

  const handleSelectPlatform = (nextPlatform: PreviewPlatform) => {
    setPlatform(nextPlatform);
    if (nextPlatform === 'douyin' && !customThemeId) {
      setCoverRatio('3:4');
    } else if (nextPlatform === 'xiaohongshu' && !customThemeId) {
      setCoverRatio('3:4');
    }
  };

  return (
    <div className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border border-[var(--border-color)] bg-white text-[#333]">
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
                {platform === 'xiaohongshu' ? '小红书' : '抖音'}满版杂志卡片预览（共 {socialPayload.cards.length} 张 · 自动识别题材：
                <span className="ml-1 rounded bg-black/5 px-1.5 py-0.5 font-semibold text-[#111]">
                  {GENRE_META[socialPayload.genre].badge}
                </span>
                ）
              </div>
              <div className="text-[10px] text-[#666]">
                {socialPayload.coverImage
                  ? `🖼 已关联封面：${socialPayload.coverImage}`
                  : `✨ 未设手动封面 -> 自动启用 ${PLATFORM_COVER_SPECS[coverRatio].label} UGC 模板`}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] text-[#777]">主题色板：</span>
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCustomThemeId(t.id)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                    activeThemeId === t.id
                      ? 'bg-[#222] text-white'
                      : 'border border-black/10 bg-white text-[#555] hover:bg-black/5'
                  }`}
                >
                  {t.name.split(' ')[0]}
                </button>
              ))}
              <span className="ml-1 text-[10px] text-[#777]">封面比例：</span>
              {RATIO_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setCoverRatio(r)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition ${
                    coverRatio === r
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-black/10 bg-white text-[#555] hover:bg-black/5'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div
            data-testid={platform === 'xiaohongshu' ? 'xiaohongshu-preview' : 'douyin-preview'}
            data-theme-id={activeThemeId}
            data-cover-ratio={coverRatio}
            className="flex-1 space-y-3 overflow-y-auto bg-[#f2efe9] p-3"
          >
            <div className="grid grid-cols-2 gap-3">
              {socialPayload.cards.map((card, idx) => {
                const isCover = card.type === 'cover';
                const isCode = card.type === 'code';
                const genreBadge = GENRE_META[card.genre || socialPayload.genre].badge;
                const aspectClass =
                  isCover && coverRatio === '16:9'
                    ? 'col-span-2 aspect-[16/9]'
                    : isCover && coverRatio === '2.35:1'
                      ? 'col-span-2 aspect-[2.35/1]'
                      : isCover && coverRatio === '9:16'
                        ? 'aspect-[9/16]'
                        : 'aspect-[3/4]';

                return (
                  <div
                    key={`${card.type}-${idx}`}
                    style={{
                      backgroundColor: tokens.paper,
                      color: tokens.ink,
                      borderColor: tokens.line,
                    }}
                    className={`flex ${aspectClass} flex-col justify-between overflow-hidden rounded-xl border p-3.5 shadow-sm`}
                  >
                    {/* Top Masthead */}
                    <div
                      style={{ borderColor: tokens.line }}
                      className="flex items-center justify-between border-b pb-1.5 text-[9px] font-bold tracking-wider uppercase"
                    >
                      <span className="flex items-center gap-1">
                        <span
                          style={{ backgroundColor: tokens.accent }}
                          className="inline-block h-1.5 w-1.5 rounded-full"
                        />
                        <span>VMARK STUDIO</span>
                      </span>
                      <span
                        style={{
                          backgroundColor: tokens.accentSurface,
                          color: tokens.accentInk,
                        }}
                        className="rounded-full px-2 py-0.5 font-mono text-[9px]"
                      >
                        {genreBadge} · {String(idx + 1).padStart(2, '0')}/{String(socialPayload.cards.length).padStart(2, '0')}
                      </span>
                    </div>

                    {/* Full-Bleed Editorial Body */}
                    <div className="my-1.5 flex flex-1 flex-col justify-between gap-1.5 overflow-hidden">
                      <div>
                        <div
                          style={{ color: tokens.accentInk }}
                          className="mb-0.5 truncate text-[9px] font-bold tracking-widest uppercase"
                        >
                          {isCover
                            ? `— ${card.subtitle || GENRE_META[socialPayload.genre].kicker}`
                            : isCode
                              ? `SECTION §0${idx + 1} • CODE SNAPSHOT`
                              : `CHAPTER §0${idx + 1} • ${genreBadge}`}
                        </div>
                        <div className="line-clamp-2 text-xs font-extrabold leading-snug">
                          {card.title}
                        </div>
                      </div>

                      {card.quote && (
                        <div
                          style={{
                            backgroundColor: tokens.quoteBg,
                            borderLeftColor: tokens.accent,
                            color: tokens.textSecondary,
                          }}
                          className="line-clamp-2 rounded-md border-l-2 px-2 py-1 text-[9px] leading-relaxed"
                        >
                          “{card.quote}”
                        </div>
                      )}

                      {isCode ? (
                        <div
                          style={{
                            backgroundColor: tokens.codeBg,
                            color: tokens.codeInk,
                            borderColor: tokens.codeBorder,
                          }}
                          className="flex flex-1 flex-col justify-between overflow-hidden rounded-lg border p-2 font-mono text-[9px]"
                        >
                          <div className="mb-1 flex items-center justify-between border-b border-white/10 pb-1">
                            <span className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f56]" />
                              <span className="h-1.5 w-1.5 rounded-full bg-[#ffbd2e]" />
                              <span className="h-1.5 w-1.5 rounded-full bg-[#27c93f]" />
                            </span>
                            <span className="text-[8px] uppercase opacity-75">
                              {card.codeLang || 'TS'}
                            </span>
                          </div>
                          <div className="space-y-0.5 overflow-hidden">
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
                        <div
                          style={{
                            backgroundColor: tokens.cardBg,
                            borderColor: tokens.line,
                          }}
                          className="flex flex-1 flex-col justify-evenly rounded-lg border p-2 text-[10px]"
                        >
                          {card.bodyLines.slice(0, 4).map((line, i) => (
                            <div key={i} className="flex items-start gap-1.5 py-0.5">
                              <span
                                style={{
                                  backgroundColor: tokens.accentSurface,
                                  color: tokens.accentInk,
                                }}
                                className="mt-0.5 rounded px-1 font-mono text-[8px] font-bold"
                              >
                                0{i + 1}
                              </span>
                              <span className="line-clamp-2 flex-1 leading-snug">
                                {line.replace(/^[•-]\s*/, '')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {card.tags && card.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {card.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              style={{
                                backgroundColor: tokens.accentSurface,
                                color: tokens.accentInk,
                              }}
                              className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div
                      style={{ borderColor: tokens.line, color: tokens.textMuted }}
                      className="flex items-center justify-between border-t pt-1.5 text-[8px]"
                    >
                      <span className="truncate">{GENRE_META[socialPayload.genre].footerTag}</span>
                      <span style={{ color: tokens.accent }} className="font-bold">
                        {idx === socialPayload.cards.length - 1 ? 'Done ➔' : 'Swipe ➔'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-2.5 text-[11px] text-[#555]">
              <div className="mb-1 flex items-center justify-between font-medium text-[#222]">
                <span>配文摘要与话题标签</span>
                <span className="font-mono text-[10px] text-[#888]">
                  封面规格：{PLATFORM_COVER_SPECS[coverRatio].label}
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
