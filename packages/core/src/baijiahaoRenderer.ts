export interface BaijiahaoRenderedResult {
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

/** Renders Markdown into Baijiahao (百家号) compatible semantic HTML. */
export function renderBaijiahaoHtml(markdown: string): BaijiahaoRenderedResult {
  const imageUrls: string[] = [];
  const cleanMd = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const lines = cleanMd.split(/\r?\n/);

  const renderInline = (raw: string): string => {
    let s = raw.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      const cleanUrl = url.trim();
      imageUrls.push(cleanUrl);
      return `<p style="text-align: center;"><img src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(alt)}" style="max-width: 100%; border-radius: 4px;" /></p>`;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
      return `<a href="${escapeHtml(url.trim())}">${escapeHtml(text)}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s;
  };

  const out: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeMarker = '';
  let codeLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    const codeMatch = trimmedLine.match(/^(`{3,}|~{3,})(.*)$/);
    if (codeMatch && !inCode) {
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

    if (!line.trim()) continue;

    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = Math.min(Math.max(hMatch[1].length, 2), 4);
      out.push(`<h${level}>${renderInline(hMatch[2])}</h${level}>`);
      continue;
    }

    if (line.startsWith('>')) {
      out.push(`<blockquote><p>${renderInline(line.replace(/^>\s?/, ''))}</p></blockquote>`);
      continue;
    }

    out.push(`<p>${renderInline(line)}</p>`);
  }

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
