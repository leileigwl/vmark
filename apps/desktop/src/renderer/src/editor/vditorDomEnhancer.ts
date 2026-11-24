import Vditor from 'vditor';

export function getCodeBlockLang(codeBlock: Element): string {
  const infoEl = codeBlock.querySelector('.vditor-ir__marker--info');
  const infoLang = (infoEl?.textContent || '').replace(/\u200b/g, '').trim().toLowerCase();
  if (infoLang) return infoLang;
  const codeEl = codeBlock.querySelector('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code');
  const match = codeEl?.className.match(/language-([^\s]+)/);
  return match ? match[1].toLowerCase() : '';
}

function ensurePreviewPre(codeBlock: Element): HTMLElement {
  let previewPre = codeBlock.querySelector('pre.vditor-ir__preview') as HTMLElement | null;
  if (!previewPre) {
    previewPre = document.createElement('pre');
    previewPre.className = 'vditor-ir__preview';
    previewPre.setAttribute('contenteditable', 'false');
    const markerPre = codeBlock.querySelector('pre.vditor-ir__marker--pre');
    if (markerPre) {
      markerPre.insertAdjacentElement('afterend', previewPre);
    } else {
      codeBlock.appendChild(previewPre);
    }
  }
  return previewPre;
}

export function ensureCodeBlockInfoMarkers(el: HTMLElement): void {
  const blocks = el.querySelectorAll('.vditor-ir__node[data-type="code-block"]');
  const sel = window.getSelection();
  blocks.forEach((codeBlock) => {
    const existingInfo = codeBlock.querySelector('.vditor-ir__marker--info') as HTMLElement | null;
    const editCode = codeBlock.querySelector('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code');
    const match = editCode?.className.match(/language-([^\s]+)/);
    const attrLang = codeBlock.getAttribute('data-CodeLang');
    const fallbackLang =
      match?.[1] || (attrLang && attrLang !== 'text' ? attrLang : '');
    if (existingInfo) {
      const existingLang = (existingInfo.textContent || '').replace(/\u200b/g, '').trim();
      if (existingLang) {
        codeBlock.setAttribute('data-CodeLang', existingLang);
        return;
      }
      const cursorInInfo = Boolean(sel?.anchorNode && existingInfo.contains(sel.anchorNode));
      if (!cursorInInfo && fallbackLang) {
        existingInfo.textContent = `\u200b${fallbackLang}`;
      }
      return;
    }
    const infoSpan = document.createElement('span');
    infoSpan.className = 'vditor-ir__marker vditor-ir__marker--info';
    infoSpan.setAttribute('data-type', 'code-block-info');
    infoSpan.textContent = fallbackLang ? `\u200b${fallbackLang}` : '\u200b';
    const markerPre = codeBlock.querySelector('pre.vditor-ir__marker--pre');
    if (markerPre) {
      codeBlock.insertBefore(infoSpan, markerPre);
    } else {
      codeBlock.prepend(infoSpan);
    }
  });
}

export function cleanStrayCodeBlockFences(el: HTMLElement): void {
  const editCodes = el.querySelectorAll('.vditor-ir__node[data-type="code-block"] pre.vditor-ir__marker--pre > code');
  editCodes.forEach((node) => {
    const text = node.textContent || '';
    if (/^[\u200b\s]*`{3,}[\u200b\s]*$/.test(text)) {
      node.textContent = '\u200b';
    }
  });
}

export function rerenderBrokenMermaid(el: HTMLElement, cdnBase: string): void {
  const vditorStatic = Vditor as unknown as {
    mermaidRender?: (el: HTMLElement, cdn?: string) => void;
  };
  const codeBlocks = el.querySelectorAll('.vditor-ir__node[data-type="code-block"]');
  codeBlocks.forEach((codeBlock) => {
    if (codeBlock.classList.contains('vditor-ir__node--expand')) return;
    if (getCodeBlockLang(codeBlock) !== 'mermaid') return;
    const editCode = codeBlock.querySelector('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code');
    const previewPre = ensurePreviewPre(codeBlock);
    const srcText = (editCode?.textContent || previewPre.textContent || '').replace(/\u200b/g, '');
    if (!srcText.trim()) return;

    let mermaidDiv = previewPre.querySelector('div.language-mermaid') as HTMLElement | null;
    if (!mermaidDiv) {
      previewPre.innerHTML = '';
      mermaidDiv = document.createElement('div');
      mermaidDiv.className = 'language-mermaid';
      previewPre.appendChild(mermaidDiv);
    }
    if (!mermaidDiv.querySelector('svg') || previewPre.dataset.vcatMermaidSrc !== srcText) {
      previewPre.dataset.vcatMermaidSrc = srcText;
      if (!mermaidDiv.querySelector('svg') || mermaidDiv.textContent !== srcText) {
        mermaidDiv.textContent = srcText;
        mermaidDiv.removeAttribute('data-processed');
      }
      previewPre.setAttribute('data-render', '2');
      vditorStatic.mermaidRender?.(previewPre, cdnBase);
    }
  });
}

export function renderLatexBlocks(el: HTMLElement, cdnBase: string): void {
  const vditorStatic = Vditor as unknown as {
    mathRender?: (
      element: HTMLElement,
      options?: { cdn?: string; math?: { engine?: string; inlineDigit?: boolean } }
    ) => void;
  };
  const katexGlobal = (window as unknown as {
    katex?: { renderToString?: (tex: string, opts: Record<string, unknown>) => string };
  }).katex;

  const codeBlocks = el.querySelectorAll('.vditor-ir__node[data-type="code-block"]');
  codeBlocks.forEach((codeBlock) => {
    if (codeBlock.classList.contains('vditor-ir__node--expand')) return;
    const lang = getCodeBlockLang(codeBlock);
    if (lang !== 'latex' && lang !== 'tex' && lang !== 'math') return;
    const editCode = codeBlock.querySelector('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code');
    const previewPre = ensurePreviewPre(codeBlock);
    const srcText = (editCode?.textContent || previewPre.textContent || '').replace(/\u200b/g, '');
    if (!srcText.trim()) {
      previewPre.dataset.vcatMathSrc = '';
      return;
    }
    if (!previewPre.querySelector('.katex') || previewPre.dataset.vcatMathSrc !== srcText) {
      previewPre.setAttribute('data-render', '2');
      if (katexGlobal?.renderToString) {
        previewPre.dataset.vcatMathSrc = srcText;
        previewPre.innerHTML = '';
        const mathDiv = document.createElement('div');
        mathDiv.className = 'language-math';
        mathDiv.setAttribute('data-math', srcText);
        mathDiv.innerHTML = katexGlobal.renderToString(srcText, {
          displayMode: true,
          output: 'html',
          throwOnError: false,
        });
        previewPre.appendChild(mathDiv);
      } else {
        previewPre.innerHTML = '';
        const previewCode = document.createElement('code');
        previewCode.className = 'language-math';
        previewCode.textContent = srcText;
        previewPre.appendChild(previewCode);
        vditorStatic.mathRender?.(previewPre, {
          cdn: cdnBase,
          math: { engine: 'KaTeX', inlineDigit: true },
        });
      }
    }
  });

  const standaloneMath = el.querySelectorAll(
    '.vditor-ir__preview code.language-latex, .vditor-ir__preview code.language-tex, .vditor-ir__preview code.language-math'
  );
  standaloneMath.forEach((codeEl) => {
    if (codeEl.closest('.vditor-ir__node[data-type="code-block"]')) return;
    if (codeEl.closest('.vditor-ir__node--expand')) return;
    const previewPre = codeEl.closest('pre.vditor-ir__preview') as HTMLElement | null;
    if (!previewPre) return;
    if (!codeEl.classList.contains('language-math')) {
      codeEl.classList.add('language-math');
    }
    if (!previewPre.querySelector('.katex')) {
      vditorStatic.mathRender?.(previewPre, {
        cdn: cdnBase,
        math: { engine: 'KaTeX', inlineDigit: true },
      });
    }
  });
}

export function cleanEmptyInlineNodes(el: HTMLElement): void {
  const sel = window.getSelection();
  const anchorNode = sel?.anchorNode ?? null;
  const focusNode = sel?.focusNode ?? null;

  function isCursorInsideNode(node: Element): boolean {
    if (!sel || sel.rangeCount === 0) return false;
    if (anchorNode && (node === anchorNode || node.contains(anchorNode))) return true;
    if (focusNode && (node === focusNode || node.contains(focusNode))) return true;
    if (node.closest('.vditor-ir__node--expand')) return true;
    if (node.classList.contains('vditor-ir__node--expand')) return true;
    try {
      const range = sel.getRangeAt(0);
      return range.intersectsNode(node);
    } catch {
      return false;
    }
  }

  // 标记空标题（仅含 # 标记无正文内容），防止失焦后被 Vditor 隐藏导致视觉消失
  el.querySelectorAll('.vditor-reset h1, .vditor-reset h2, .vditor-reset h3, .vditor-reset h4, .vditor-reset h5, .vditor-reset h6').forEach((h) => {
    const bodyText = (h.textContent || '').replace(/[\u200b\ufeff\s#]/g, '');
    if (bodyText.length === 0) {
      h.setAttribute('data-vcat-empty-heading', '1');
    } else {
      h.removeAttribute('data-vcat-empty-heading');
    }
  });

  // 标记所有空行内格式节点（含仅含零宽字符 \u200b / \ufeff 的情况），供 CSS 彻底去胶囊色块
  const allInlineTags = el.querySelectorAll(
    '.vditor-reset strong, .vditor-reset b, .vditor-reset em, .vditor-reset i, .vditor-reset s, .vditor-reset del, .vditor-reset :not(pre) > code'
  );
  allInlineTags.forEach((tag) => {
    const clean = (tag.textContent || '').replace(/[\u200b\ufeff]/g, '');
    if (clean.length === 0) {
      tag.setAttribute('data-vcat-empty', '1');
    } else {
      tag.removeAttribute('data-vcat-empty');
    }
  });

  const inlineNodes = el.querySelectorAll(
    'span.vditor-ir__node[data-type="strong"], span.vditor-ir__node[data-type="em"], span.vditor-ir__node[data-type="s"], span.vditor-ir__node[data-type="code"]'
  );
  inlineNodes.forEach((node) => {
    // 保护正在编辑、展开态、或光标在内的节点，绝对不清理
    if (isCursorInsideNode(node)) {
      return;
    }
    // 如果节点带有 marker（如包含 **），说明保留有 markdown 语法占位，保护空加粗 **** 绝对不要清理
    if (node.querySelector('.vditor-ir__marker')) {
      return;
    }
    const inner = node.querySelector('strong, b, em, i, s, del, code');
    const innerText = (inner?.textContent || '').replace(/\u200b/g, '');
    if (innerText.length === 0) {
      const parent = node.parentNode;
      node.remove();
      if (parent instanceof HTMLElement && parent.childNodes.length === 0) {
        parent.innerHTML = '<br>';
      }
    }
  });
}

export function cleanupUnusedTempGapParagraphs(el: HTMLElement, activeNode?: Node | null): void {
  const tempParas = el.querySelectorAll('p[data-vcat-temp-gap="1"]');
  tempParas.forEach((p) => {
    const text = (p.textContent || '').replace(/\u200b/g, '').trim();
    const hasMedia = Boolean(p.querySelector('img, svg, code, strong, em'));
    if (text || hasMedia) {
      p.removeAttribute('data-vcat-temp-gap');
      return;
    }
    if (!activeNode || !p.contains(activeNode)) {
      p.remove();
    }
  });
}
