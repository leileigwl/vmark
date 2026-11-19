import { useMemo, useState } from 'react';
import {
  renderBaijiahaoHtml,
  renderXiaohongshuCards,
  renderZhihuHtml,
  type WeixinRenderedResult,
} from '@vcat/core';

export type PreviewPlatform = 'weixin' | 'zhihu' | 'baijiahao' | 'xiaohongshu';

const PREVIEW_TABS: Array<{ id: PreviewPlatform; label: string }> = [
  { id: 'weixin', label: '微信公众号' },
  { id: 'zhihu', label: '知乎专栏' },
  { id: 'baijiahao', label: '百家号' },
  { id: 'xiaohongshu', label: '小红书 3:4 卡片' },
];

interface PlatformPreviewPaneProps {
  markdown: string;
  title?: string;
  weixinRendered: WeixinRenderedResult;
}

/** Multi-platform pre-publish layout preview pane (WeChat, Zhihu, Baijiahao, Xiaohongshu 3:4 cards). */
export function PlatformPreviewPane({
  markdown,
  title,
  weixinRendered,
}: PlatformPreviewPaneProps) {
  const [platform, setPlatform] = useState<PreviewPlatform>('weixin');

  const zhihuRendered = useMemo(
    () => (platform === 'zhihu' ? renderZhihuHtml(markdown) : null),
    [markdown, platform]
  );
  const baijiahaoRendered = useMemo(
    () => (platform === 'baijiahao' ? renderBaijiahaoHtml(markdown) : null),
    [markdown, platform]
  );
  const xhsPayload = useMemo(
    () => (platform === 'xiaohongshu' ? renderXiaohongshuCards(markdown, title || '技术笔记') : null),
    [markdown, platform, title]
  );

  return (
    <div className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-[var(--border-color)] bg-white text-[#333]">
      <div className="flex flex-wrap items-center gap-1 border-b border-black/10 bg-[#f7f7f7] px-2.5 py-1.5">
        {PREVIEW_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPlatform(item.id)}
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
            公众号行内 CSS 排版预览（外链已转为文末脚注：{weixinRendered.footnotes.length} 条）
          </div>
          <div
            data-testid="weixin-preview"
            className="flex-1 overflow-y-auto p-3"
            dangerouslySetInnerHTML={{ __html: weixinRendered.html }}
          />
        </>
      )}

      {platform === 'zhihu' && zhihuRendered && (
        <>
          <div className="border-b border-black/10 bg-[#fafafa] px-3 py-1.5 text-[11px] text-[#555]">
            知乎专栏原生 HTML 排版预览（H1 已降级为 H2，保留代码块语言标识）
          </div>
          <div
            data-testid="zhihu-preview"
            className="flex-1 space-y-2 overflow-y-auto p-3 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: zhihuRendered.html }}
          />
        </>
      )}

      {platform === 'baijiahao' && baijiahaoRendered && (
        <>
          <div className="border-b border-black/10 bg-[#fafafa] px-3 py-1.5 text-[11px] text-[#555]">
            百家号语义 HTML 排版预览
          </div>
          <div
            data-testid="baijiahao-preview"
            className="flex-1 space-y-2 overflow-y-auto p-3 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: baijiahaoRendered.html }}
          />
        </>
      )}

      {platform === 'xiaohongshu' && xhsPayload && (
        <>
          <div className="border-b border-black/10 bg-[#fafafa] px-3 py-1.5 text-[11px] text-[#555]">
            小红书 3:4 知识卡片预览（共 {xhsPayload.cards.length} 张）
          </div>
          <div data-testid="xiaohongshu-preview" className="flex-1 space-y-3 overflow-y-auto bg-[#f5f5f5] p-3">
            <div className="grid grid-cols-2 gap-2.5">
              {xhsPayload.cards.map((card, idx) => (
                <div
                  key={`${card.type}-${idx}`}
                  className={`flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-lg border p-3 shadow-xs ${
                    card.type === 'cover'
                      ? 'border-[#ff2442]/30 bg-gradient-to-br from-[#fff5f6] to-white'
                      : card.type === 'code'
                        ? 'border-[#30363d] bg-[#161b22] text-[#e6edf3]'
                        : 'border-black/10 bg-white text-[#222]'
                  }`}
                >
                  <div className="space-y-1.5 overflow-hidden">
                    <div className="flex items-center justify-between text-[10px] opacity-70">
                      <span>{card.type === 'cover' ? '封面' : card.type === 'code' ? `代码 ${card.codeLang || ''}` : '正文'}</span>
                      <span>{idx + 1}/{xhsPayload.cards.length}</span>
                    </div>
                    <div className="line-clamp-2 text-xs font-bold leading-snug">{card.title}</div>
                    {card.subtitle && <div className="text-[10px] opacity-75">{card.subtitle}</div>}
                    <div className="space-y-1 pt-1 text-[10px] leading-relaxed opacity-90">
                      {card.bodyLines.slice(0, 6).map((line, i) => (
                        <div key={i} className={card.type === 'code' ? 'truncate font-mono' : 'line-clamp-2'}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                  {card.tags && card.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {card.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded bg-[#ff2442]/10 px-1.5 py-0.5 text-[9px] text-[#ff2442]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="rounded border border-black/10 bg-white p-2 text-[11px] text-[#555]">
              <div className="mb-1 font-medium text-[#222]">配文摘要</div>
              <div className="line-clamp-3 whitespace-pre-wrap">{xhsPayload.captionText}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
