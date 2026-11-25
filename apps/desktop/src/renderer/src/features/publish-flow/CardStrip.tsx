import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PLATFORM_COVER_SPECS, fitCardDisplayMath, fitCardOverflow, renderSocialCardHtml, renderXiaohongshuCards, SOCIAL_CARD_PRESETS } from '@vcat/core';
import { cn } from '../../ui';
import { cardMath } from './cardMath';

const THUMB_W = 132;
/** 缩略图按真实输出尺寸（3:4 → 1242×1656）排版后整体缩放，与光栅化出图保持一致。 */
const { width: CARD_W, height: CARD_H } = PLATFORM_COVER_SPECS['3:4'];
const THEMES = Object.values(SOCIAL_CARD_PRESETS);

interface CardStripProps {
  markdown: string;
  title: string;
  themeId: string;
  onThemeChange: (id: string) => void;
  maxCards?: number;
}

/**
 * 与出图同一套兜底：换行后仍太宽的行间公式缩小；正文按估算高度分页，实际排版比估算高时整页缩到内容框内，
 * 页底文字和图片不被裁掉。iframe 禁止脚本，由外层在字体、图片加载后执行。
 */
function fitThumb(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc) return;
  const fit = () => {
    fitCardDisplayMath(doc);
    fitCardOverflow(doc);
  };
  // 还没加载完的图片在加载成功或失败后都再算一次；已加载完的由下面字体就绪后的那次覆盖。
  doc.querySelectorAll('img').forEach((img) => {
    if (img.complete) return;
    img.addEventListener('load', fit, { once: true });
    img.addEventListener('error', fit, { once: true });
  });
  void doc.fonts.ready.then(fit);
}

/** 卡片平台：选模板 + 看前几张卡片缩略图和总张数。卡片 HTML 自带全局样式，放进 iframe 隔离（不允许脚本）。 */
export function CardStrip({ markdown, title, themeId, onThemeChange, maxCards }: CardStripProps) {
  const payload = useMemo(
    // 按所选模板的内容框分页（各模板页边距不同），与出图一致。
    () => renderXiaohongshuCards(markdown, { fallbackTitle: title, coverRatio: '3:4', themeId, maxCards }),
    [markdown, title, themeId, maxCards]
  );
  const total = payload.totalCards;
  const kept = payload.cards.length;
  const shown = payload.cards.slice(0, 4);
  const scale = THUMB_W / CARD_W;
  return (
    <div className="space-y-3" data-testid="card-strip">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="卡片模板">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={themeId === t.id}
            onClick={() => onThemeChange(t.id)}
            className={cn(
              'whitespace-nowrap rounded-full border px-2.5 py-1 text-xs',
              themeId === t.id ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:text-ink'
            )}
          >
            {t.name.replace(/\s*\(.*\)$/, '')}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {shown.map((card, i) => (
          <div
            key={i}
            className="relative shrink-0 overflow-hidden rounded-md border border-line bg-canvas"
            style={{ width: THUMB_W, height: (THUMB_W * CARD_H) / CARD_W }}
          >
            <iframe
              title={`卡片 ${i + 1}`}
              tabIndex={-1}
              sandbox="allow-same-origin"
              className="pointer-events-none origin-top-left border-0"
              style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})` }}
              srcDoc={renderSocialCardHtml(card, { themeId, cardIndex: i, totalCards: kept, aspectRatio: '3:4', math: cardMath })}
              onLoad={(e) => fitThumb(e.currentTarget)}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        共 {total} 张 3:4 卡片{maxCards ? `，平台上限 ${maxCards} 张` : ''}
      </p>
      {payload.droppedCards > 0 ? (
        <p role="status" className="flex items-start gap-1.5 rounded-[var(--radius-ui)] bg-warning-soft px-3 py-2 text-xs text-ink">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
          <span>
            超出平台上限：只发布前 {kept} 张，后 {payload.droppedCards} 张（第 {kept + 1}–{total} 张）不会发布。请精简正文或拆成两篇。
          </span>
        </p>
      ) : null}
    </div>
  );
}
