const HIGHLIGHTABLE_LANGS = new Set([
  'python',
  'py',
  'javascript',
  'js',
  'typescript',
  'ts',
  'tsx',
  'jsx',
  'json',
  'jsonc',
  'bash',
  'sh',
  'zsh',
  'shell',
  'css',
  'scss',
  'less',
  'html',
  'xml',
  'sql',
  'go',
  'golang',
  'rust',
  'rs',
  'java',
  'c',
  'cpp',
  'cc',
  'cxx',
  'yaml',
  'yml',
  'toml',
  'markdown',
  'md',
  'mermaid',
  'diff',
  'dockerfile',
  'nginx',
]);

const CODE_TOKEN_REGEX =
  /(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(def|class|function)\s+([A-Za-z_]\w*)|\b(async|await|return|if|elif|else|for|while|in|not|and|or|try|except|finally|raise|import|from|as|def|class|with|pass|break|continue|lambda|yield|const|let|var|function|export|default|interface|type|new|typeof|subgraph|direction|flowchart|sequenceDiagram|end)\b|\b(True|False|None|true|false|null|undefined|self|cls|\d+(?:\.\d+)?)\b|(@[A-Za-z_]\w*|\b(?:str|int|float|bool|list|dict|set|tuple|Any|Optional|Annotated|Field|Tool|ToolContext|ValidationError|ValueError|KeyError|Exception|Promise|Record|Array)\b)|\b([A-Za-z_]\w*)(?=\s*\()/g;

/**
 * Extracts normalized language name from a Vditor code block element.
 */
function detectCodeLanguage(codeEl: HTMLElement): string {
  const classMatch = codeEl.className.match(/language-([A-Za-z0-9_+-]+)/i);
  if (classMatch?.[1]) {
    return classMatch[1].toLowerCase();
  }
  const irNode = codeEl.closest('.vditor-ir__node[data-type="code-block"]');
  const infoText = irNode?.querySelector('.vditor-ir__marker--info')?.textContent ?? '';
  return infoText.replace(/\u200b/g, '').trim().toLowerCase();
}

/**
 * Applies native CSS Custom Highlight API syntax coloring onto single-layer editable
 * `<pre><code>` text nodes without inserting extra DOM elements.
 * Plain text formats (`txt`, `text`, `plain`, `plaintext`, `log`, or unannotated) are skipped.
 */
export function applyCodeSyntaxHighlights(containerEl: HTMLElement): void {
  const cssApi = globalThis as unknown as {
    CSS?: { highlights?: Map<string, unknown> };
    Highlight?: new (...ranges: Range[]) => unknown;
  };
  if (!cssApi.CSS?.highlights || !cssApi.Highlight) return;

  const cmtRanges: Range[] = [];
  const strRanges: Range[] = [];
  const kwRanges: Range[] = [];
  const fnRanges: Range[] = [];
  const numRanges: Range[] = [];
  const typeRanges: Range[] = [];

  const codeEls = containerEl.querySelectorAll(
    '.vditor-ir__node[data-type="code-block"] > pre.vditor-ir__marker--pre > code'
  );

  codeEls.forEach((codeNode) => {
    const codeEl = codeNode as HTMLElement;
    const lang = detectCodeLanguage(codeEl);
    if (!lang || !HIGHLIGHTABLE_LANGS.has(lang)) return;
    if (lang === 'mermaid' && !codeEl.closest('.vditor-ir__node--expand')) {
      return;
    }

    const segments: Array<{ node: Text; start: number; end: number }> = [];
    let fullText = '';
    const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
    let tNode = walker.nextNode() as Text | null;
    while (tNode) {
      const len = (tNode.nodeValue || '').length;
      if (len > 0) {
        segments.push({ node: tNode, start: fullText.length, end: fullText.length + len });
        fullText += tNode.nodeValue;
      }
      tNode = walker.nextNode() as Text | null;
    }
    if (!fullText) return;

    const addRange = (bucket: Range[], startOffset: number, endOffset: number) => {
      if (endOffset <= startOffset) return;
      for (const seg of segments) {
        if (seg.end <= startOffset) continue;
        if (seg.start >= endOffset) break;
        const s = Math.max(0, startOffset - seg.start);
        const eOff = Math.min(seg.end - seg.start, endOffset - seg.start);
        if (eOff > s) {
          const r = document.createRange();
          r.setStart(seg.node, s);
          r.setEnd(seg.node, eOff);
          bucket.push(r);
        }
      }
    };

    CODE_TOKEN_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CODE_TOKEN_REGEX.exec(fullText)) !== null) {
      const idx = m.index;
      const full = m[0];
      if (m[1]) {
        addRange(cmtRanges, idx, idx + full.length);
      } else if (m[2]) {
        addRange(strRanges, idx, idx + full.length);
      } else if (m[3] && m[4]) {
        addRange(kwRanges, idx, idx + m[3].length);
        const nameStart = idx + full.lastIndexOf(m[4]);
        addRange(fnRanges, nameStart, nameStart + m[4].length);
      } else if (m[5]) {
        addRange(kwRanges, idx, idx + full.length);
      } else if (m[6]) {
        addRange(numRanges, idx, idx + full.length);
      } else if (m[7]) {
        addRange(typeRanges, idx, idx + full.length);
      } else if (m[8]) {
        addRange(fnRanges, idx, idx + full.length);
      }
    }
  });

  const setOrClear = (name: string, ranges: Range[]) => {
    if (ranges.length > 0 && cssApi.Highlight) {
      cssApi.CSS?.highlights?.set(name, new cssApi.Highlight(...ranges));
    } else {
      cssApi.CSS?.highlights?.delete(name);
    }
  };
  setOrClear('vcat-hl-comment', cmtRanges);
  setOrClear('vcat-hl-string', strRanges);
  setOrClear('vcat-hl-keyword', kwRanges);
  setOrClear('vcat-hl-title', fnRanges);
  setOrClear('vcat-hl-number', numRanges);
  setOrClear('vcat-hl-builtin', typeRanges);
}
