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
  let codeLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        inCode = false;
        out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
      } else {
        inCode = true;
        codeLines = [];
      }
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
    .replace(/```[\s\S]*?```/g, ' ')
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
