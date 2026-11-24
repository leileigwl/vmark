import { CALLOUT_LABELS, closesFence, matchCallout, matchFence, takeQuoteRun, type CalloutKind } from './markdownQuote.ts';
import {
  DISPLAY_MATH_ONLY,
  displayMathBlock,
  escapeHtml,
  fillMath,
  holdMath,
  isListLine,
  renderWeixinCodeBlock,
  renderWeixinList,
} from './weixinBlocks.ts';

const CALLOUT_STYLES: Record<CalloutKind, { label: string; color: string; bg: string }> = {
  NOTE: { label: CALLOUT_LABELS.NOTE, color: '#0969da', bg: 'rgba(9, 105, 218, 0.06)' },
  TIP: { label: CALLOUT_LABELS.TIP, color: '#1a7f37', bg: 'rgba(26, 127, 55, 0.06)' },
  IMPORTANT: { label: CALLOUT_LABELS.IMPORTANT, color: '#8250df', bg: 'rgba(130, 80, 223, 0.06)' },
  WARNING: { label: CALLOUT_LABELS.WARNING, color: '#9a6700', bg: 'rgba(154, 103, 0, 0.07)' },
  CAUTION: { label: CALLOUT_LABELS.CAUTION, color: '#cf222e', bg: 'rgba(207, 34, 46, 0.06)' },
};

/** 引用内容递归渲染时共享的脚注/图片收集器；quote=true 时段落用引用样式，且不输出外层包裹与脚注区。 */
interface NestedRender {
  footnotes: WeixinFootnote[];
  imageUrls: string[];
}

export interface WeixinRenderOptions {
  /** Primary accent color (hex), defaults to #007aff */
  accentColor?: string;
  /** Base paragraph font size in px, defaults to 15 */
  fontSize?: number;
  /** Convert non-WeChat external links into numbered footnotes at the bottom */
  convertExternalLinksToFootnotes?: boolean;
  /** Optional cover image URL to render at top when showCoverInBody is enabled */
  coverImageUrl?: string;
  /** Whether to inject cover image at the top of the article body */
  showCoverInBody?: boolean;
  /** 把公式渲染成可直接粘贴的 HTML（如 MathJax 内联 SVG）；不给或返回空时保留 $ 源码原文。 */
  renderMath?: (tex: string, display: boolean) => string | undefined;
}

export interface WeixinFootnote {
  index: number;
  text: string;
  url: string;
}

export interface WeixinRenderedResult {
  html: string;
  digest: string;
  footnotes: WeixinFootnote[];
  imageUrls: string[];
}

function isWeixinDomain(url: string): boolean {
  return /^https?:\/\/([^/]+\.)?(mp\.weixin\.qq\.com|weixin\.qq\.com)(\/|$)/i.test(url.trim());
}

import { extractPlainDigest } from './digest.ts';

/** Extracts clean plain-text digest (max 120 chars) from Markdown body. */
export function extractWeixinDigest(markdown: string, maxLength = 120): string {
  return extractPlainDigest(markdown, maxLength);
}

/** Renders Markdown into WeChat Official Account compatible inline-styled HTML. */
export function renderWeixinHtml(markdown: string, options: WeixinRenderOptions = {}): WeixinRenderedResult {
  return renderWeixin(markdown, options);
}

function renderWeixin(markdown: string, options: WeixinRenderOptions, nested?: NestedRender): WeixinRenderedResult {
  const accent = options.accentColor || '#007aff';
  const fontSize = options.fontSize || 15;
  const convertLinks = options.convertExternalLinksToFootnotes ?? true;
  const footnotes: WeixinFootnote[] = nested?.footnotes ?? [];
  const imageUrls: string[] = nested?.imageUrls ?? [];
  const paragraphStyle = nested
    ? `margin: 0 0 6px 0; font-size: ${fontSize - 0.5}px; line-height: 1.7; color: #4a4a4a;`
    : `margin: 0 0 14px 0; font-size: ${fontSize}px; line-height: 1.75; color: #333333; letter-spacing: 0.02em;`;

  const cleanMd = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  // 只在最外层藏公式；引用递归渲染时拿到的已经是占位符。
  const math = nested ? undefined : holdMath(cleanMd);
  const lines = (math ? math.text : cleanMd).split(/\r?\n/);
  const inline = (raw: string) => renderInlineSafe(raw, accent, convertLinks, footnotes, imageUrls);

  const blocks: string[] = [];

  if (options.showCoverInBody && options.coverImageUrl?.trim()) {
    const coverUrl = options.coverImageUrl.trim();
    imageUrls.push(coverUrl);
    blocks.push(
      `<p style="margin: 0 0 18px 0; text-align: center;"><img src="${escapeHtml(coverUrl)}" alt="cover" style="display: block; width: 100%; max-width: 100%; height: auto; border-radius: 10px;" /></p>`
    );
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block (GFM 3+ backticks or 3+ tildes, optional language, info string, c++, c#)
    const fenceMatch = matchFence(trimmed);
    if (fenceMatch) {
      const marker = fenceMatch.marker;
      const info = fenceMatch.info;
      const rawLang = info.split(/\s+/)[0] || '';
      const lang = rawLang.toLowerCase().replace(/[^a-zA-Z0-9_+#.-]/g, '') || 'text';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        if (closesFence(lines[i].trim(), marker)) break;
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      // 空的（含未闭合的）围栏不输出，避免留下一个空代码框或残留的反引号。
      if (!codeLines.some((l) => l.trim())) continue;
      blocks.push(renderWeixinCodeBlock(codeLines.join('\n'), lang));
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(`<hr style="border: none; border-top: 1px solid rgba(0, 0, 0, 0.12); margin: 22px 0;" />`);
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizes = [22, 19, 17, 15.5];
      const fs = sizes[level - 1] ?? 15.5;
      const borderStyle =
        level <= 2 ? ` border-bottom: 1px solid rgba(0, 0, 0, 0.08); padding-bottom: 6px;` : '';
      const content = renderInlineSafe(headingMatch[2], accent, convertLinks, footnotes, imageUrls);
      blocks.push(
        `<h${level} style="margin: 22px 0 12px 0; font-size: ${fs}px; font-weight: 700; line-height: 1.4; color: #1d1d1f;${borderStyle}"><span style="border-left: 3px solid ${accent}; padding-left: 8px;">${content}</span></h${level}>`
      );
      i++;
      continue;
    }

    // Blockquote / GitHub-style Callout
    if (trimmed.startsWith('>')) {
      // 去掉一层 `>` 后按普通 Markdown 递归渲染：嵌套引用、引用里的代码块、列表都能正确显示。
      const run = takeQuoteRun(lines, i);
      i = run.next;
      const callout = matchCallout(run.inner[0]);
      const style = callout ? CALLOUT_STYLES[callout.kind] : undefined;
      const body = callout ? [callout.rest, ...run.inner.slice(1)] : run.inner;
      const headerHtml = style
        ? `<p style="margin: 0 0 6px 0; font-size: ${fontSize - 0.5}px; font-weight: 700; line-height: 1.5; color: ${style.color};">${style.label}</p>`
        : '';
      const innerHtml = renderWeixin(body.join('\n'), { ...options, showCoverInBody: false }, { footnotes, imageUrls }).html;
      if (!headerHtml && !innerHtml) continue;
      const borderColor = style ? style.color : accent;
      const bgColor = style ? style.bg : 'rgba(0, 122, 255, 0.05)';
      // 用 section 而不是 blockquote：新版公众号编辑器会清掉 blockquote 上的样式。
      blocks.push(
        `<section style="margin: 16px 0; padding: 12px 16px; border-left: 4px solid ${borderColor}; border-radius: 8px; background-color: ${bgColor};">${headerHtml}${innerHtml}</section>`
      );
      continue;
    }

    // Table
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      const parseRow = (rowLine: string) =>
        rowLine
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const headers = parseRow(trimmed);
      i += 2; // skip header and separator
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        bodyRows.push(parseRow(lines[i]));
        i++;
      }
      const thHtml = headers
        .map(
          (h) =>
            `<th style="padding: 8px 10px; border: 1px solid rgba(0, 0, 0, 0.12); background-color: rgba(0, 122, 255, 0.07); text-align: left; font-weight: 600; font-size: 14px; color: #1d1d1f;">${renderInlineSafe(h, accent, convertLinks, footnotes, imageUrls)}</th>`
        )
        .join('');
      const trHtml = bodyRows
        .map((row, rIdx) => {
          const bg = rIdx % 2 === 1 ? ' background-color: #fafafa;' : '';
          const tds = headers
            .map((_, cIdx) => {
              const cell = row[cIdx] ?? '';
              return `<td style="padding: 8px 10px; border: 1px solid rgba(0, 0, 0, 0.1); font-size: 14px; color: #333;${bg}">${renderInlineSafe(cell, accent, convertLinks, footnotes, imageUrls)}</td>`;
            })
            .join('');
          return `<tr>${tds}</tr>`;
        })
        .join('');
      blocks.push(
        `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; border-radius: 6px; overflow: hidden;"><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table>`
      );
      continue;
    }

    // 列表（含多级、有序起始编号、任务列表）：不用原生 ul/ol/li，公众号编辑器会重写它们。
    if (isListLine(line)) {
      const list = renderWeixinList(lines, i, { accent, fontSize, inline });
      blocks.push(list.html);
      i = list.next;
      continue;
    }

    // Standalone image paragraph
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const cleanUrl = imgMatch[2].trim();
      imageUrls.push(cleanUrl);
      blocks.push(
        `<p style="margin: 16px 0; text-align: center;"><img src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(imgMatch[1])}" style="display: block; max-width: 100%; height: auto; margin: 0 auto; border-radius: 8px;" /></p>`
      );
      i++;
      continue;
    }

    // Normal paragraph
    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !matchFence(lines[i].trim()) &&
      !/^(#{1,4}\s+|```|>|\||---|\*\*\*)/.test(lines[i].trim()) &&
      !isListLine(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    const paraText = paraLines.join(' ');
    if (DISPLAY_MATH_ONLY.test(paraText)) {
      blocks.push(displayMathBlock(paraText));
      continue;
    }
    blocks.push(`<p style="${paragraphStyle}">${inline(paraText)}</p>`);
  }

  if (nested) return { html: blocks.join(''), digest: '', footnotes, imageUrls };

  if (footnotes.length > 0) {
    const fnItems = footnotes
      .map(
        (fn) =>
          `<p style="margin: 0 0 4px 0; font-size: 12px; line-height: 1.6; color: #666;">[${fn.index}] ${escapeHtml(fn.text)}：${escapeHtml(fn.url)}</p>`
      )
      .join('');
    blocks.push(
      `<section style="margin-top: 24px; padding-top: 12px; border-top: 1px dashed rgba(0, 0, 0, 0.14);"><p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #444;">参考链接</p>${fnItems}</section>`
    );
  }

  const html = fillMath(`<section style="padding: 4px 6px; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif; color: #333333; word-break: break-word;">${blocks.join('')}</section>`,
    math?.slots ?? [],
    options.renderMath
  );

  return {
    html,
    digest: extractWeixinDigest(markdown),
    footnotes,
    imageUrls,
  };
}

function renderInlineSafe(
  raw: string,
  accent: string,
  convertLinks: boolean,
  footnotes: WeixinFootnote[],
  imageUrls: string[]
): string {
  const tokenPattern =
    /(`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*)/g;
  let out = '';
  let lastIndex = 0;

  for (const match of raw.matchAll(tokenPattern)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      out += escapeHtml(raw.slice(lastIndex, idx));
    }
    const tok = match[0];

    if (tok.startsWith('`') && tok.endsWith('`')) {
      const code = tok.slice(1, -1);
      out += `<code style="font-family: Menlo, Monaco, Consolas, monospace; font-size: 0.88em; padding: 2px 6px; border-radius: 4px; background-color: rgba(0, 122, 255, 0.08); color: ${accent};">${escapeHtml(code)}</code>`;
    } else if (tok.startsWith('![')) {
      const m = tok.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (m) {
        const alt = m[1];
        const cleanUrl = m[2].trim();
        imageUrls.push(cleanUrl);
        if (alt === 'vmark-latex-inline') {
          out += `<img src="${escapeHtml(cleanUrl)}" alt="formula" style="display: inline-block; vertical-align: middle; height: 1.25em; width: auto; margin: 0 2px;" />`;
        } else if (alt === 'vmark-latex-block') {
          out += `<img src="${escapeHtml(cleanUrl)}" alt="formula" style="display: block; max-width: 100%; height: auto; margin: 12px auto;" />`;
        } else {
          out += `<img src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(alt)}" style="display: block; max-width: 100%; height: auto; margin: 12px auto; border-radius: 8px;" />`;
        }
      }
    } else if (tok.startsWith('[')) {
      const m = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) {
        const text = m[1];
        const cleanUrl = m[2].trim();
        if (isWeixinDomain(cleanUrl) || cleanUrl.startsWith('#')) {
          out += `<a href="${escapeHtml(cleanUrl)}" style="color: ${accent}; text-decoration: none; border-bottom: 1px solid ${accent};">${escapeHtml(text)}</a>`;
        } else if (!convertLinks) {
          out += `<span style="color: ${accent};">${escapeHtml(text)}</span>`;
        } else {
          const existing = footnotes.find((f) => f.url === cleanUrl);
          const fnIdx = existing ? existing.index : footnotes.length + 1;
          if (!existing) {
            footnotes.push({ index: fnIdx, text, url: cleanUrl });
          }
          out += `<span style="color: ${accent};">${escapeHtml(text)}</span><sup style="color: ${accent}; font-size: 0.75em;">[${fnIdx}]</sup>`;
        }
      }
    } else if (tok.startsWith('**') && tok.endsWith('**')) {
      out += `<strong style="font-weight: 700; color: #1d1d1f;">${escapeHtml(tok.slice(2, -2))}</strong>`;
    } else if (tok.startsWith('~~') && tok.endsWith('~~')) {
      out += `<del style="color: #888; text-decoration: line-through;">${escapeHtml(tok.slice(2, -2))}</del>`;
    } else if (tok.startsWith('*') && tok.endsWith('*')) {
      out += `<em style="font-style: italic; color: #444;">${escapeHtml(tok.slice(1, -1))}</em>`;
    }
    lastIndex = idx + tok.length;
  }

  if (lastIndex < raw.length) {
    out += escapeHtml(raw.slice(lastIndex));
  }
  return out;
}
