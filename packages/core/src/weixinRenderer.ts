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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isWeixinDomain(url: string): boolean {
  return /^https?:\/\/([^/]+\.)?(mp\.weixin\.qq\.com|weixin\.qq\.com)(\/|$)/i.test(url.trim());
}

function highlightWeixinCodeTokens(code: string, _lang: string): string {
  const lines = code.split('\n');
  const KEYWORDS = new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'default', 'break', 'continue', 'import', 'from', 'export',
    'class', 'extends', 'super', 'new', 'this', 'typeof', 'instanceof', 'void',
    'async', 'await', 'try', 'catch', 'finally', 'throw', 'interface', 'type',
    'def', 'elif', 'pass', 'lambda', 'with', 'as', 'in', 'is', 'not', 'and', 'or',
    'fn', 'pub', 'mut', 'impl', 'struct', 'enum', 'trait', 'match', 'package', 'func',
  ]);
  const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'nil']);

  const highlightedLines = lines.map((line) => {
    const escaped = escapeHtml(line);
    const trimmed = escaped.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
      return `<span style="color: #6a737d; font-style: italic;">${escaped}</span>`;
    }

    return escaped.replace(
      /(\/\/[^\n]*|#[^\n]*)|(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;|`[\s\S]*?`)|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*\b)/g,
      (match, comment, str, num, word) => {
        if (comment) return `<span style="color: #6a737d; font-style: italic;">${comment}</span>`;
        if (str) return `<span style="color: #032f62;">${str}</span>`;
        if (num) return `<span style="color: #005cc5;">${num}</span>`;
        if (word) {
          if (KEYWORDS.has(word)) return `<span style="color: #d73a49; font-weight: 600;">${word}</span>`;
          if (LITERALS.has(word)) return `<span style="color: #005cc5; font-weight: 600;">${word}</span>`;
        }
        return match;
      }
    );
  });

  return highlightedLines.join('\n');
}

/** Extracts clean plain-text digest (max 120 chars) from Markdown body. */
export function extractWeixinDigest(markdown: string, maxLength = 120): string {
  const withoutFrontmatter = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const plain = withoutFrontmatter
    .replace(/(?:```|~~~)[\s\S]*?(?:```|~~~)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?(\[![A-Z]+\])?\s?/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/[>|#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1)}…`;
}

/** Renders Markdown into WeChat Official Account compatible inline-styled HTML. */
export function renderWeixinHtml(
  markdown: string,
  options: WeixinRenderOptions = {}
): WeixinRenderedResult {
  const accent = options.accentColor || '#007aff';
  const fontSize = options.fontSize || 15;
  const convertLinks = options.convertExternalLinksToFootnotes ?? true;
  const footnotes: WeixinFootnote[] = [];
  const imageUrls: string[] = [];

  const cleanMd = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const lines = cleanMd.split(/\r?\n/);

  const renderInline = (raw: string): string => {
    const codeSlots: string[] = [];
    let s = raw.replace(/`([^`]+)`/g, (_m, code) => {
      const idx = codeSlots.length;
      codeSlots.push(
        `<code style="font-family: Menlo, Monaco, Consolas, monospace; font-size: 0.88em; padding: 2px 6px; border-radius: 4px; background-color: rgba(0, 122, 255, 0.08); color: ${accent};">${escapeHtml(code)}</code>`
      );
      return `\u0000CODE_${idx}\u0000`;
    });

    // Images inside inline text
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      const cleanUrl = url.trim();
      imageUrls.push(cleanUrl);
      return `<img src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(alt)}" style="display: block; max-width: 100%; height: auto; margin: 16px auto; border-radius: 8px;" />`;
    });

    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
      const cleanUrl = url.trim();
      if (isWeixinDomain(cleanUrl) || cleanUrl.startsWith('#')) {
        return `<a href="${escapeHtml(cleanUrl)}" style="color: ${accent}; text-decoration: none; border-bottom: 1px solid ${accent};">${escapeHtml(text)}</a>`;
      }
      if (!convertLinks) {
        return `<span style="color: ${accent};">${escapeHtml(text)}</span>`;
      }
      const existing = footnotes.find((f) => f.url === cleanUrl);
      const idx = existing ? existing.index : footnotes.length + 1;
      if (!existing) {
        footnotes.push({ index: idx, text, url: cleanUrl });
      }
      return `<span style="color: ${accent};">${escapeHtml(text)}</span><sup style="color: ${accent}; font-size: 0.75em;">[${idx}]</sup>`;
    });

    s = escapeHtml(s)
      .replace(/&lt;(img|span|sup|a|code)\b/g, '<$1')
      .replace(/&lt;\/(span|sup|a|code)&gt;/g, '</$1>')
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      // Restore inline HTML tags we just constructed safely
      ;

    // Actually process inline formatting on raw before escaping, or escape text segments cleanly:
    // Let's re-run cleanly without double escaping by processing segments!
    return renderInlineSafe(raw, accent, convertLinks, footnotes, imageUrls);
  };

  // Suppress unused variable lint if needed
  void renderInline;

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
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const info = fenceMatch[2].trim();
      const rawLang = info.split(/\s+/)[0] || '';
      const lang = rawLang.toLowerCase().replace(/[^a-zA-Z0-9_+#.-]/g, '') || 'text';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextTrimmed = lines[i].trim();
        if (nextTrimmed.startsWith(marker[0].repeat(marker.length))) {
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const codeHtml = highlightWeixinCodeTokens(codeLines.join('\n'), lang);
      blocks.push(
        `<section style="margin: 16px 0; border-radius: 10px; border: 1px solid rgba(0, 0, 0, 0.08); background-color: #f6f8fa; overflow: hidden;">` +
          `<section style="display: flex; align-items: center; padding: 8px 12px; background-color: #eef1f5; border-bottom: 1px solid rgba(0, 0, 0, 0.06); font-size: 12px; color: #666;">` +
          `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #ff5f56; margin-right: 6px;"></span>` +
          `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #ffbd2e; margin-right: 6px;"></span>` +
          `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #27c93f; margin-right: 10px;"></span>` +
          `<span style="font-family: Menlo, Monaco, Consolas, monospace;">${escapeHtml(lang)}</span>` +
          `</section>` +
          `<pre style="margin: 0; padding: 14px 16px; overflow-x: auto; white-space: pre; font-family: Menlo, Monaco, Consolas, monospace; font-size: 13px; line-height: 1.6; color: #24292f;"><code>${codeHtml}</code></pre>` +
          `</section>`
      );
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

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const innerHtml = quoteLines
        .filter((ql) => ql.length > 0)
        .map(
          (ql) =>
            `<p style="margin: 0 0 6px 0; font-size: ${fontSize - 0.5}px; line-height: 1.7; color: #4a4a4a;">${renderInlineSafe(ql, accent, convertLinks, footnotes, imageUrls)}</p>`
        )
        .join('');
      blocks.push(
        `<blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 4px solid ${accent}; border-radius: 8px; background-color: rgba(0, 122, 255, 0.05);">${innerHtml}</blockquote>`
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

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      const liHtml = items
        .map(
          (item) =>
            `<li style="margin: 0 0 6px 0; line-height: 1.75; font-size: ${fontSize}px; color: #333;">${renderInlineSafe(item, accent, convertLinks, footnotes, imageUrls)}</li>`
        )
        .join('');
      blocks.push(`<ol style="margin: 12px 0; padding-left: 22px;">${liHtml}</ol>`);
      continue;
    }

    // Unordered / Task list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const rawItem = lines[i].trim().replace(/^[-*]\s+/, '');
        const taskMatch = rawItem.match(/^\[( |x|X)\]\s+(.*)$/);
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === 'x';
          items.push(`${checked ? '☑' : '☐'} ${taskMatch[2]}`);
        } else {
          items.push(rawItem);
        }
        i++;
      }
      const liHtml = items
        .map(
          (item) =>
            `<li style="margin: 0 0 6px 0; line-height: 1.75; font-size: ${fontSize}px; color: #333;">${renderInlineSafe(item, accent, convertLinks, footnotes, imageUrls)}</li>`
        )
        .join('');
      blocks.push(`<ul style="margin: 12px 0; padding-left: 22px;">${liHtml}</ul>`);
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
      !/^(#{1,4}\s+|```|>|[-*]\s+|\d+\.\s+|\||---|\*\*\*)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    const pHtml = renderInlineSafe(paraLines.join(' '), accent, convertLinks, footnotes, imageUrls);
    blocks.push(
      `<p style="margin: 0 0 14px 0; font-size: ${fontSize}px; line-height: 1.75; color: #333333; letter-spacing: 0.02em;">${pHtml}</p>`
    );
  }

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

  const html = `<section style="padding: 4px 6px; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif; color: #333333; word-break: break-word;">${blocks.join('')}</section>`;

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
        const cleanUrl = m[2].trim();
        imageUrls.push(cleanUrl);
        out += `<img src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(m[1])}" style="display: block; max-width: 100%; height: auto; margin: 12px auto; border-radius: 8px;" />`;
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
