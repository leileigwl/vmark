export interface ZhihuRenderOptions {
  /** Demote H1 to H2 and H2 to H3 to match Zhihu column outline hierarchy */
  demoteHeadings?: boolean;
}

export interface ZhihuRenderedResult {
  html: string;
  digest: string;
  imageUrls: string[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Extracts clean plain-text digest (max 100 chars) for Zhihu draft cards. */
export function extractZhihuDigest(markdown: string, maxLength = 100): string {
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

/**
 * Renders Markdown into Zhihu Column (知乎专栏) native article HTML.
 * Zhihu requirements:
 * 1. Headings: H1 is demoted to H2, H2 to H3.
 * 2. Code blocks: native `<pre><code class="language-*">...</code></pre>` for Zhihu Prism.
 * 3. Images: `<figure><img src="..." data-actualsrc="..." data-size="normal"/></figure>`.
 * 4. Links: standard clickable `<a>` tags.
 */
export function renderZhihuHtml(
  markdown: string,
  options: ZhihuRenderOptions = {}
): ZhihuRenderedResult {
  const demote = options.demoteHeadings ?? true;
  const imageUrls: string[] = [];

  const cleanMd = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const lines = cleanMd.split(/\r?\n/);

  const renderInline = (raw: string): string => {
    const codeSlots: string[] = [];
    let s = raw.replace(/`([^`]+)`/g, (_m, code) => {
      const idx = codeSlots.length;
      codeSlots.push(`<code>${escapeHtml(code)}</code>`);
      return `\u0000CODE_${idx}\u0000`;
    });

    // Images
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      const cleanUrl = url.trim();
      imageUrls.push(cleanUrl);
      const escaped = escapeHtml(cleanUrl);
      return `<figure><img src="${escaped}" data-actualsrc="${escaped}" data-size="normal" alt="${escapeHtml(alt)}"/></figure>`;
    });

    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
      return `<a href="${escapeHtml(url.trim())}">${escapeHtml(text)}</a>`;
    });

    // Bold & italic
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    s = s.replace(/\u0000CODE_(\d+)\u0000/g, (_m, idx) => codeSlots[Number(idx)]);
    return s;
  };

  const out: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeFenceMarker = '';
  let codeLines: string[] = [];
  let inBlockquote = false;
  let quoteLines: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const flushBlockquote = (): void => {
    if (!inBlockquote) return;
    const body = quoteLines.map((l) => `<p>${renderInline(l)}</p>`).join('');
    out.push(`<blockquote>${body}</blockquote>`);
    inBlockquote = false;
    quoteLines = [];
  };

  const flushTable = (): void => {
    if (!inTable) return;
    if (tableRows.length > 0) {
      const [header, ...body] = tableRows;
      const headHtml = `<thead><tr>${header.map((c) => `<th>${renderInline(c)}</th>`).join('')}</tr></thead>`;
      const bodyHtml =
        body.length > 0
          ? `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
          : '';
      out.push(`<table>${headHtml}${bodyHtml}</table>`);
    }
    inTable = false;
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks (supports 3+ backticks/tildes, info strings, and c++/c#)
    const trimmedLine = line.trim();
    const codeMatch = trimmedLine.match(/^(`{3,}|~{3,})(.*)$/);
    if (codeMatch && !inCodeBlock) {
      flushBlockquote();
      flushTable();
      inCodeBlock = true;
      codeFenceMarker = codeMatch[1];
      const info = codeMatch[2].trim();
      const rawLang = info.split(/\s+/)[0] || '';
      codeLang = rawLang.toLowerCase().replace(/[^a-zA-Z0-9_+#.-]/g, '');
      codeLines = [];
      continue;
    }
    if (
      codeFenceMarker &&
      trimmedLine.startsWith(codeFenceMarker[0].repeat(codeFenceMarker.length)) &&
      inCodeBlock
    ) {
      inCodeBlock = false;
      const langClass = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
      const escapedCode = escapeHtml(codeLines.join('\n'));
      out.push(`<pre><code${langClass}>${escapedCode}</code></pre>`);
      codeLines = [];
      codeLang = '';
      codeFenceMarker = '';
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Tables
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushBlockquote();
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        continue; // delimiter row
      }
      inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Blockquotes
    if (line.startsWith('>')) {
      inBlockquote = true;
      quoteLines.push(line.replace(/^>\s?/, ''));
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // Empty lines
    if (!line.trim()) {
      continue;
    }

    // Headings (H1 -> H2, H2 -> H3 when demote is true)
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const targetLevel = demote ? Math.min(level + 1, 6) : level;
      out.push(`<h${targetLevel}>${renderInline(hMatch[2])}</h${targetLevel}>`);
      continue;
    }

    // Standalone image
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const cleanUrl = imgMatch[2].trim();
      imageUrls.push(cleanUrl);
      const escaped = escapeHtml(cleanUrl);
      out.push(
        `<figure><img src="${escaped}" data-actualsrc="${escaped}" data-size="normal" alt="${escapeHtml(imgMatch[1])}"/></figure>`
      );
      continue;
    }

    // Paragraph
    out.push(`<p>${renderInline(line)}</p>`);
  }

  flushBlockquote();
  flushTable();

  return {
    html: out.join(''),
    digest: extractZhihuDigest(markdown),
    imageUrls,
  };
}
