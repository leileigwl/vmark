export interface BaijiahaoRenderedResult {
  html: string;
  digest: string;
  imageUrls: string[];
}

export interface BaijiahaoRenderOptions {
  /** Use `'list'` for rich editors (like Bilibili) that strip `<table>` tags. */
  tableMode?: 'html' | 'list';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders Markdown into Baijiahao (百家号) / compatible semantic HTML. */
export function renderBaijiahaoHtml(
  markdown: string,
  options: BaijiahaoRenderOptions = {}
): BaijiahaoRenderedResult {
  const imageUrls: string[] = [];
  const cleanMd = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const lines = cleanMd.split(/\r?\n/);

  const renderInline = (raw: string): string => {
    const protectedSlots: string[] = [];
    const protect = (html: string): string => {
      const idx = protectedSlots.length;
      protectedSlots.push(html);
      return `\u0000SLOT_${idx}\u0000`;
    };

    let s = raw.replace(/`([^`]+)`/g, (_m, code) => protect(`<code>${escapeHtml(code)}</code>`));
    s = s.replace(/\$([^$\n]+)\$/g, (_m, tex) => protect(`<code>$${escapeHtml(tex)}$</code>`));
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      const cleanUrl = url.trim();
      imageUrls.push(cleanUrl);
      if (alt === 'vmark-latex-inline') {
        return protect(
          `<img src="${escapeHtml(cleanUrl)}" alt="formula" style="display: inline-block; vertical-align: middle; height: 1.25em; width: auto; margin: 0 2px;" />`
        );
      }
      if (alt === 'vmark-latex-block') {
        return protect(
          `<p style="text-align: center;"><img src="${escapeHtml(cleanUrl)}" alt="formula" style="max-width: 100%; height: auto;" /></p>`
        );
      }
      return `<p style="text-align: center;"><img src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(alt)}" style="max-width: 100%; border-radius: 4px;" /></p>`;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
      return `<a href="${escapeHtml(url.trim())}">${escapeHtml(text)}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s.replace(/\u0000SLOT_(\d+)\u0000/g, (_m, idx) => protectedSlots[Number(idx)] ?? '');
  };

  const CALLOUT_LABELS: Record<string, string> = {
    NOTE: 'ℹ️ 提示',
    TIP: '💡 技巧',
    IMPORTANT: '📌 重要',
    WARNING: '⚠️ 注意',
    CAUTION: '🚨 警告',
  };

  const out: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeMarker = '';
  let codeLines: string[] = [];
  let inMath = false;
  let mathLines: string[] = [];
  let quoteLines: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }
    const itemsHtml = listItems.map((item) => `<li>${renderInline(item)}</li>`).join('');
    out.push(`<${listType}>${itemsHtml}</${listType}>`);
    listType = null;
    listItems = [];
  };

  const flushTable = () => {
    if (!inTable || tableRows.length === 0) {
      inTable = false;
      tableRows = [];
      return;
    }
    const [header, ...body] = tableRows;
    if (options.tableMode === 'list') {
      const rowsHtml = body
        .map((r) => {
          const pairs = r.map((cell, idx) =>
            idx === 0
              ? `<strong>${renderInline(cell)}</strong>`
              : `${escapeHtml(header[idx] ?? '')}: ${renderInline(cell)}`
          );
          return `<p>• ${pairs.join(' ｜ ')}</p>`;
        })
        .join('');
      out.push(`<blockquote>${rowsHtml || `<p>${header.map((c) => renderInline(c)).join(' ｜ ')}</p>`}</blockquote>`);
      inTable = false;
      tableRows = [];
      return;
    }
    const headHtml = `<thead><tr>${header.map((c) => `<th>${renderInline(c)}</th>`).join('')}</tr></thead>`;
    const bodyHtml =
      body.length > 0
        ? `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
        : '';
    out.push(`<table>${headHtml}${bodyHtml}</table>`);
    inTable = false;
    tableRows = [];
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    const calloutMatch = quoteLines[0]?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
    const label = calloutMatch ? CALLOUT_LABELS[calloutMatch[1].toUpperCase()] : undefined;
    const bodyLines = calloutMatch
      ? [...(calloutMatch[2].trim() ? [calloutMatch[2].trim()] : []), ...quoteLines.slice(1)]
      : quoteLines;
    const headerHtml = label ? `<p><strong>${label}</strong></p>` : '';
    const bodyHtml = bodyLines.filter((l) => l.length > 0).map((l) => `<p>${renderInline(l)}</p>`).join('');
    out.push(`<blockquote>${headerHtml}${bodyHtml}</blockquote>`);
    quoteLines = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    const codeMatch = trimmedLine.match(/^(`{3,}|~{3,})(.*)$/);
    if (codeMatch && !inCode) {
      flushQuote();
      flushTable();
      flushList();
      inCode = true;
      codeMarker = codeMatch[1];
      const info = codeMatch[2].trim();
      const rawLang = info.split(/\s+/)[0] || '';
      codeLang = rawLang.toLowerCase().replace(/[^a-zA-Z0-9_+#.-]/g, '');
      codeLines = [];
      continue;
    }
    if (codeMarker && trimmedLine.startsWith(codeMarker[0].repeat(codeMarker.length)) && inCode) {
      inCode = false;
      const langClass = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
      out.push(`<pre><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      codeLines = [];
      codeLang = '';
      codeMarker = '';
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (trimmedLine === '$$') {
      flushQuote();
      flushTable();
      flushList();
      if (!inMath) {
        inMath = true;
        mathLines = [];
      } else {
        inMath = false;
        out.push(`<pre><code>${escapeHtml(mathLines.join('\n'))}</code></pre>`);
        mathLines = [];
      }
      continue;
    }
    if (inMath) {
      mathLines.push(line);
      continue;
    }

    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      flushQuote();
      flushList();
      const cells = trimmedLine.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (line.startsWith('>')) {
      flushList();
      quoteLines.push(line.replace(/^>\s?/, ''));
      continue;
    }
    flushQuote();

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmedLine)) {
      flushList();
      out.push('<hr />');
      continue;
    }

    const taskMatch = trimmedLine.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      const checked = taskMatch[1].toLowerCase() === 'x';
      listItems.push(`${checked ? '☑' : '☐'} ${taskMatch[2]}`);
      continue;
    }

    const ulMatch = trimmedLine.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(ulMatch[1]);
      continue;
    }

    const olMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(olMatch[1]);
      continue;
    }

    flushList();

    if (!trimmedLine) continue;

    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = Math.min(Math.max(hMatch[1].length, 2), 6);
      out.push(`<h${level}>${renderInline(hMatch[2])}</h${level}>`);
      continue;
    }

    out.push(`<p>${renderInline(line)}</p>`);
  }
  flushQuote();
  flushTable();
  flushList();

  const plain = cleanMd
    .replace(/(?:```|~~~)[\s\S]*?(?:```|~~~)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const digest = plain.length > 120 ? `${plain.slice(0, 119)}…` : plain;

  return {
    html: out.join(''),
    digest,
    imageUrls,
  };
}
