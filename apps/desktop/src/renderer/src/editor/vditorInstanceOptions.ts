import type Vditor from 'vditor';
import { applyCodeSyntaxHighlights } from './codeHighlight';
import { safeDecode } from './languageHint';

/** Preloads local KaTeX stylesheet & script so math blocks render synchronously. */
export function ensureKatexAssets(cdnBase: string): void {
  if (!document.getElementById('vcat-katex-css')) {
    const link = document.createElement('link');
    link.id = 'vcat-katex-css';
    link.rel = 'stylesheet';
    link.href = `${cdnBase}/dist/js/katex/katex.min.css`;
    document.head.appendChild(link);
  }
  if (!document.getElementById('vcat-katex-js')) {
    const script = document.createElement('script');
    script.id = 'vcat-katex-js';
    script.src = `${cdnBase}/dist/js/katex/katex.min.js`;
    document.head.appendChild(script);
  }
}

/** Handles pasted/dropped image upload into local workspace `./assets/` and IR insertion. */
export async function handleVditorImageUpload(params: {
  files: File[];
  el: HTMLElement;
  getInstance: () => Vditor | null;
  pushVditorUndo: () => void;
  onChangeValue: (md: string) => void;
}): Promise<null> {
  const { files, el, getInstance, pushVditorUndo, onChangeValue } = params;
  const instance = getInstance();
  if (!instance) return null;

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const ext = file.name.split('.').pop() || 'png';
    const saved = await window.electronAPI.saveLocalImage(base64, ext);

    const sel = window.getSelection();
    const anchorEl = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const activeCell = anchorEl?.closest('td, th') as HTMLElement | null;

    if (activeCell && el.contains(activeCell)) {
      pushVditorUndo();
      const cleanRel = saved.relativeMarkdownPath.replace(/^\.\//, '');
      const irImg = document.createElement('span');
      irImg.className = 'vditor-ir__node';
      irImg.setAttribute('data-type', 'img');
      irImg.innerHTML =
        `<span class="vditor-ir__marker">!</span>` +
        `<span class="vditor-ir__marker vditor-ir__marker--bracket">[</span>` +
        `<span class="vditor-ir__marker vditor-ir__marker--bracket">${file.name}</span>` +
        `<span class="vditor-ir__marker vditor-ir__marker--bracket">]</span>` +
        `<span class="vditor-ir__marker vditor-ir__marker--paren">(</span>` +
        `<span class="vditor-ir__marker vditor-ir__marker--link">${saved.relativeMarkdownPath}</span>` +
        `<span class="vditor-ir__marker vditor-ir__marker--paren">)</span>` +
        `<img src="vcat-asset://local/${cleanRel}" alt="${file.name}" />`;
      if (sel && sel.rangeCount > 0 && activeCell.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const r = sel.getRangeAt(0);
        r.deleteContents();
        r.insertNode(irImg);
        r.setStartAfter(irImg);
        r.collapse(true);
      } else {
        activeCell.appendChild(irImg);
      }
      pushVditorUndo();
      onChangeValue(instance.getValue());
    } else {
      instance.insertValue(`![${file.name}](${saved.relativeMarkdownPath})\n`);
    }
  }
  return null;
}

/** Commits chosen code-block language marker and re-renders syntax/LaTeX/Mermaid previews. */
export function commitCodeBlockLanguageInEl(params: {
  el: HTMLElement;
  instance: Vditor;
  infoMarker: HTMLElement;
  rawLang: string;
  lastActiveInfoMarkerRef: { current: HTMLElement | null };
  hintNavigatedByArrowRef: { current: boolean };
  setVditorRecentLang: (lang: string) => void;
  cleanStrayCodeBlockFences: () => void;
  renderLatexBlocks: () => void;
  rerenderBrokenMermaid: () => void;
  onChangeValue: (md: string) => void;
}): void {
  const { el, instance, infoMarker, rawLang } = params;
  const cleanLang = safeDecode(rawLang).replace(/\u200b/g, '').trim();
  params.lastActiveInfoMarkerRef.current = infoMarker;
  params.hintNavigatedByArrowRef.current = false;
  params.setVditorRecentLang(cleanLang);
  infoMarker.textContent = cleanLang ? `\u200b${cleanLang}` : '\u200b';

  const codeBlock = infoMarker.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null;
  if (codeBlock) {
    codeBlock.setAttribute('data-CodeLang', cleanLang || 'text');
    const codeEl = codeBlock.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
    const previewCodeEl = codeBlock.querySelector('pre.vditor-ir__preview > code') as HTMLElement | null;
    if (codeEl) {
      codeEl.className = cleanLang ? `language-${cleanLang}` : '';
      if (/^[\u200b\s]*`{3,}[\u200b\s]*$/.test(codeEl.textContent || '')) codeEl.textContent = '\u200b';
    }
    if (previewCodeEl) previewCodeEl.className = cleanLang ? `language-${cleanLang}` : '';
    const previewPre = codeBlock.querySelector('pre.vditor-ir__preview') as HTMLElement | null;
    if (previewPre) {
      delete previewPre.dataset.vcatMathSrc;
      delete previewPre.dataset.vcatMermaidSrc;
    }
  }

  const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
  if (hintEl) hintEl.style.display = 'none';

  if (codeBlock) {
    codeBlock.classList.add('vditor-ir__node--expand');
    const codeEl = codeBlock.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
    if (codeEl) {
      if (!codeEl.firstChild || (codeEl.textContent || '').length === 0) codeEl.textContent = '\u200b';
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }

  requestAnimationFrame(() => {
    params.cleanStrayCodeBlockFences();
    applyCodeSyntaxHighlights(el);
    params.renderLatexBlocks();
    params.rerenderBrokenMermaid();
    try {
      params.onChangeValue(instance.getValue());
    } catch { /* ignore teardown serialization race */ }
  });
}

/** Measures visible code blocks to position floating copy button overlays cleanly. */
export function collectCodeCopyOverlays(
  el: HTMLElement,
  wrapper: HTMLElement | null
): Array<{ id: number; top: number; left: number; code: string }> | null {
  if (!wrapper) return null;
  const wRect = wrapper.getBoundingClientRect();
  const next: Array<{ id: number; top: number; left: number; code: string }> = [];
  el.querySelectorAll('.vditor-ir__node[data-type="code-block"]').forEach((cb, idx) => {
    const rect = cb.getBoundingClientRect();
    if (rect.height < 20 || rect.bottom < wRect.top + 8 || rect.top > wRect.bottom - 24) return;
    const codeEl = cb.querySelector('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code');
    next.push({
      id: idx,
      top: Math.max(8, rect.top - wRect.top + 8),
      left: rect.right - wRect.left - 12,
      code: (codeEl?.textContent || '').replace(/\u200b/g, '').replace(/\n$/, ''),
    });
  });
  return next;
}

/** Collapses expanded code/math blocks except `exceptBlock` and re-renders LaTeX/Mermaid. */
export function collapseExpandedCodeBlocksInEl(
  el: HTMLElement,
  renderLatexBlocks: () => void,
  rerenderBrokenMermaid: () => void,
  exceptBlock?: Element | null
): void {
  const expanded = el.querySelectorAll(
    '.vditor-ir__node--expand[data-type="code-block"], .vditor-ir__node--expand[data-type="math-block"]'
  );
  let changed = false;
  expanded.forEach((node) => {
    if (node !== exceptBlock) {
      node.classList.remove('vditor-ir__node--expand');
      changed = true;
    }
  });
  if (changed) {
    renderLatexBlocks();
    rerenderBrokenMermaid();
    requestAnimationFrame(() => {
      renderLatexBlocks();
      rerenderBrokenMermaid();
    });
  }
}
