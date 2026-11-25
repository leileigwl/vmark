import type Vditor from 'vditor';
import type { EditorPreferences } from '@vcat/shared';
import type { LightboxPayload } from '../components/MediaLightbox';
import { getPreviewBlockTarget } from './editorHelpers';

export interface PointerEventContext {
  el: HTMLElement;
  instance: Vditor;
  readOnly: boolean;
  prefsRef: { current: EditorPreferences };
  lastActiveInfoMarkerRef: { current: HTMLElement | null };
  lastSelectionElRef: { current: HTMLElement | null };
  activeZoomImgRef: { current: HTMLImageElement | null };
  mermaidClickTimerRef: { current: ReturnType<typeof setTimeout> | null };
  pendingGapMouseDownRef: { current: { x: number; y: number; resetEl: HTMLElement } | null };
  suppressPreviewClickUntilRef: { current: number };
  setLightboxItem: (item: LightboxPayload | null) => void;
  commitCodeBlockLanguage: (infoMarker: HTMLElement, rawLang: string) => void;
  clearActiveZoomTarget: () => void;
  collapseExpandedCodeBlocks: (exceptBlock?: Element | null) => void;
  cleanupUnusedTempGapParagraphs: (activeNode?: Node | null) => void;
}

export function handleEditorMouseDownCapture(e: MouseEvent, ctx: PointerEventContext): void {
  const { el } = ctx;
  ctx.pendingGapMouseDownRef.current = null;
  if (e.button !== 0) return;
  const target = e.target as HTMLElement | null;

  const hintBtn = target?.closest('.vditor-hint button') as HTMLElement | null;
  if (hintBtn) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const rawVal = hintBtn.getAttribute('data-value') || hintBtn.textContent || '';
    const selNow = window.getSelection();
    const selEl =
      selNow?.anchorNode instanceof Element ? selNow.anchorNode : selNow?.anchorNode?.parentElement;
    const activeInfo =
      (selEl?.closest('.vditor-ir__marker--info') as HTMLElement | null) ??
      (ctx.lastActiveInfoMarkerRef.current && el.contains(ctx.lastActiveInfoMarkerRef.current)
        ? ctx.lastActiveInfoMarkerRef.current
        : null) ??
      (el.querySelector('.vditor-ir__node--expand .vditor-ir__marker--info') as HTMLElement | null) ??
      (el.querySelector('.vditor-ir__marker--info') as HTMLElement | null);
    if (activeInfo && el.contains(activeInfo)) {
      ctx.commitCodeBlockLanguage(activeInfo, rawVal);
    }
    return;
  }

  const codeBlockNode = target?.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null;
  if (codeBlockNode && !ctx.readOnly) {
    const clickedInfo = target?.closest('.vditor-ir__marker--info') as HTMLElement | null;
    const rect = codeBlockNode.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    if (clickedInfo || (relX >= 4 && relX <= 68 && relY >= 4 && relY <= 30)) {
      const infoSpan = codeBlockNode.querySelector('.vditor-ir__marker--info') as HTMLElement | null;
      if (infoSpan) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        ctx.lastActiveInfoMarkerRef.current = infoSpan;
        ctx.clearActiveZoomTarget();
        ctx.collapseExpandedCodeBlocks(codeBlockNode);
        codeBlockNode.classList.add('vditor-ir__node--expand');
        (el.querySelector('.vditor-ir .vditor-reset') as HTMLElement | null)?.focus({ preventScroll: true });
        setTimeout(() => {
          const sel = window.getSelection();
          if (sel && infoSpan.isConnected) {
            const range = document.createRange();
            range.selectNodeContents(infoSpan);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }, 30);
        return;
      }
    }
  }

  const imgEl = target?.closest('img') as HTMLImageElement | null;
  const previewTarget = imgEl ? null : getPreviewBlockTarget(target);

  if (previewTarget) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    ctx.cleanupUnusedTempGapParagraphs(target);
    if (ctx.mermaidClickTimerRef.current) {
      clearTimeout(ctx.mermaidClickTimerRef.current);
      ctx.mermaidClickTimerRef.current = null;
    }
    ctx.collapseExpandedCodeBlocks(previewTarget.irNode);

    if (e.detail >= 2 && !ctx.readOnly) {
      ctx.suppressPreviewClickUntilRef.current = Date.now() + 350;
      ctx.clearActiveZoomTarget();
      ctx.setLightboxItem(null);
      previewTarget.irNode.classList.add('vditor-ir__node--expand');
      (el.querySelector('.vditor-ir .vditor-reset') as HTMLElement | null)?.focus({ preventScroll: true });
      const editEl =
        (previewTarget.irNode.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null) ??
        (previewTarget.irNode.querySelector('pre.vditor-ir__marker--pre') as HTMLElement | null);
      if (editEl) {
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(editEl);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      return;
    }

    ctx.clearActiveZoomTarget();
    previewTarget.irNode.classList.add('vcat-mermaid-active');

    if (previewTarget.kind === 'mermaid') {
      const mermaidDiv = previewTarget.previewPre.querySelector('div.language-mermaid') as HTMLElement | null;
      if (mermaidDiv) {
        ctx.activeZoomImgRef.current = mermaidDiv as unknown as HTMLImageElement;
        const svgSnapshot = mermaidDiv.innerHTML;
        ctx.mermaidClickTimerRef.current = setTimeout(() => {
          ctx.mermaidClickTimerRef.current = null;
          ctx.setLightboxItem({
            type: 'mermaid',
            svgHtml: svgSnapshot,
          });
        }, ctx.readOnly ? 40 : 200);
      }
    }
    return;
  }

  if (!ctx.readOnly && target && target.classList.contains('vditor-reset')) {
    const children = Array.from(target.children) as HTMLElement[];
    const hitInsideChild = children.some((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (!hitInsideChild) {
      // Do not preventDefault on mousedown so upward/downward drag-selection can start in blank margins.
      ctx.pendingGapMouseDownRef.current = { x: e.clientX, y: e.clientY, resetEl: target };
      return;
    }
  }

  ctx.cleanupUnusedTempGapParagraphs(target);
  ctx.collapseExpandedCodeBlocks(codeBlockNode ?? target?.closest('.vditor-ir__node[data-type="math-block"]'));

  if (ctx.activeZoomImgRef.current && ctx.activeZoomImgRef.current !== imgEl) {
    ctx.clearActiveZoomTarget();
  } else if (!imgEl) {
    el.querySelectorAll('.vditor-ir__node.vcat-mermaid-active').forEach((n) => {
      n.classList.remove('vcat-mermaid-active');
    });
  }
  if (imgEl) {
    e.preventDefault();
    e.stopPropagation();
    ctx.activeZoomImgRef.current = imgEl;
    imgEl.style.outline = '2px solid var(--accent)';
    imgEl.style.outlineOffset = '2px';
    ctx.setLightboxItem({
      type: 'image',
      src: imgEl.src,
      alt: imgEl.alt,
    });
  }
}

/** Creates/focuses a paragraph only on a genuine blank-gap click (not after a drag selection). */
export function handleEditorGapClickCapture(e: MouseEvent, ctx: PointerEventContext): boolean {
  const pending = ctx.pendingGapMouseDownRef.current;
  ctx.pendingGapMouseDownRef.current = null;
  if (!pending || ctx.readOnly) return false;
  if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) >= 5) return false;
  const currentSel = window.getSelection();
  if (currentSel && !currentSel.isCollapsed) return false;

  const target = pending.resetEl;
  const children = Array.from(target.children) as HTMLElement[];
  const nextChild = children.find((c) => c.getBoundingClientRect().top > e.clientY) ?? null;
  const prevChild = nextChild
    ? (nextChild.previousElementSibling as HTMLElement | null)
    : children[children.length - 1] ?? null;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  ctx.clearActiveZoomTarget();
  ctx.collapseExpandedCodeBlocks(null);

  const isEmptyPara = (node: HTMLElement | null) =>
    Boolean(node && node.tagName === 'P' && (node.textContent || '').replace(/\u200b/g, '').trim() === '');

  let targetPara: HTMLElement | null = null;
  if (isEmptyPara(prevChild)) {
    targetPara = prevChild;
  } else if (isEmptyPara(nextChild)) {
    targetPara = nextChild;
  } else {
    targetPara = document.createElement('p');
    targetPara.setAttribute('data-block', '0');
    targetPara.setAttribute('data-vcat-temp-gap', '1');
    targetPara.textContent = '\u200b';
    if (nextChild) {
      target.insertBefore(targetPara, nextChild);
    } else {
      target.appendChild(targetPara);
    }
  }

  ctx.cleanupUnusedTempGapParagraphs(targetPara);
  target.focus({ preventScroll: true });
  if (targetPara) {
    if (!targetPara.firstChild) targetPara.textContent = '\u200b';
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(targetPara);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  return true;
}

export function handleEditorContextMenu(e: MouseEvent, ctx: PointerEventContext): void {
  e.preventDefault();
  const target = e.target as HTMLElement | null;
  ctx.lastSelectionElRef.current = target;
  const imgEl = target?.closest('img') as HTMLImageElement | null;
  if (imgEl) {
    ctx.activeZoomImgRef.current = imgEl;
    const rawScale = Number(imgEl.dataset.vcatScale || '');
    const rootScale = Number(
      document.documentElement.style.getPropertyValue('--vcat-img-max-width').replace('%', '') || 50
    );
    const imageScale = rawScale > 0 ? rawScale : rootScale;
    void window.electronAPI?.showEditorContextMenu?.({
      inTable: Boolean(target?.closest('table')),
      inImage: true,
      imageScale,
      hasSelection: false,
      readOnly: ctx.readOnly,
    });
    return;
  }
  if (ctx.readOnly) return;
  const inTable = Boolean(target?.closest('table'));
  const sel = window.getSelection();
  const hasSelection = Boolean(sel && !sel.isCollapsed);
  void window.electronAPI?.showEditorContextMenu?.({ inTable, hasSelection });
}

export function handleEditorPasteCapture(e: ClipboardEvent, instance: Vditor): void {
  const html = e.clipboardData?.getData('text/html') ?? '';
  const plain = e.clipboardData?.getData('text/plain') ?? '';
  const sel = window.getSelection();
  const anchorEl =
    sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;

  // 1. 语言标签框内粘贴：强制清洗换行为单行纯文本，绝不撕裂代码块
  if (anchorEl?.closest('.vditor-ir__marker--info')) {
    if (plain) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const singleLine = plain.replace(/[\r\n]+/g, ' ').trim();
      document.execCommand('insertText', false, singleLine);
    }
    return;
  }

  // 2. 表格单元格内粘贴：清洗换行与管道符，防止多行文本/Markdown 块炸毁表格
  if (anchorEl?.closest('td, th') && plain && (/[\r\n]/.test(plain) || /(?:^|\s)```/.test(plain))) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const safeCellText = plain.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
    document.execCommand('insertText', false, safeCellText);
    return;
  }

  // 3. 引用块内粘贴带有 '> ' 前缀的内容：剥离外层 '> '，杜绝出现嵌套 blockquote 左竖线
  if (anchorEl?.closest('blockquote') && !anchorEl.closest('pre:not(.vditor-reset), code') && plain && /^>\s?/m.test(plain)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const stripped = plain.replace(/\r\n?/g, '\n').replace(/^>\s?/gm, '');
    if (!stripped.includes('\n')) {
      document.execCommand('insertText', false, stripped);
      return;
    }
    // execCommand('insertText') turns each "\n" into a new paragraph (= an extra blank "> " line in the file);
    // insert a raw text node so Vditor keeps the soft line breaks of the quoted paragraph.
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (!range) return;
    range.deleteContents();
    const textNode = document.createTextNode(stripped);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    textNode.parentElement?.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    return;
  }

  if (plain && /(md-fences|md-diagram|mdtype=|<svg\b)/i.test(html)) {
    e.preventDefault();
    e.stopPropagation();
    instance.insertValue(plain);
  }
}

export function handleEditorCopyCapture(
  e: ClipboardEvent,
  el: HTMLElement,
  instance: Vditor,
  prefsRef: { current: EditorPreferences }
): void {
  const mode = prefsRef.current.copyFormat;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !el.contains(sel.anchorNode)) return;
  const plain = sel.toString();
  if (!plain) return;

  if (mode === 'plain') {
    e.preventDefault();
    e.stopPropagation();
    e.clipboardData?.setData('text/plain', plain);
    return;
  }
  if (mode === 'markdown') {
    const range = sel.getRangeAt(0);
    const frag = range.cloneContents();
    const tmp = document.createElement('div');
    tmp.appendChild(frag);

    // 若选区完全落在某个 blockquote / list / table 内部，cloneContents() 会丢失外层容器标签，需还原包裹以保留完整 Markdown 语义
    const commonEl =
      range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;

    // 选区完全落在代码块内部时，直接复制原始代码文本，避免 html2md 转义反引号产生 ``\`
    if (commonEl?.closest('pre.vditor-ir__marker--pre, pre.vditor-ir__preview')) {
      e.preventDefault();
      e.stopPropagation();
      e.clipboardData?.setData('text/plain', plain);
      return;
    }

    if (commonEl) {
      const listAncestor = commonEl.closest('ul, ol');
      if (listAncestor && !tmp.querySelector('ul, ol') && tmp.querySelector('li')) {
        const listWrap = document.createElement(listAncestor.tagName.toLowerCase());
        while (tmp.firstChild) listWrap.appendChild(tmp.firstChild);
        tmp.appendChild(listWrap);
      }

      const tableAncestor = commonEl.closest('table');
      if (tableAncestor && !tmp.querySelector('table') && tmp.querySelector('tr, th, td')) {
        const tableWrap = document.createElement('table');
        while (tmp.firstChild) tableWrap.appendChild(tmp.firstChild);
        tmp.appendChild(tableWrap);
      }

      const quoteAncestor = commonEl.closest('blockquote');
      if (quoteAncestor && !tmp.querySelector('blockquote')) {
        // 仅当选区跨多段或完整选中引用块内容时才保留 > 前缀；单行局部文字复制保留纯文本
        const quoteBlocks = tmp.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6');
        const fullQuoteClean = (quoteAncestor.textContent || '').replace(/[\u200b\ufeff\s]/g, '');
        const selClean = plain.replace(/[\u200b\ufeff\s]/g, '');
        const isWholeQuote = fullQuoteClean.length > 0 && selClean === fullQuoteClean;
        if (quoteBlocks.length > 1 || isWholeQuote) {
          const quoteWrap = document.createElement('blockquote');
          while (tmp.firstChild) quoteWrap.appendChild(tmp.firstChild);
          tmp.appendChild(quoteWrap);
        }
      }
    }

    const v = (instance as unknown as {
      vditor?: { lute?: { VditorIRDOM2Md?: (html: string) => string } };
    }).vditor;
    const hasIrDom = Boolean(tmp.querySelector('.vditor-ir__node, .vditor-ir__marker, [data-block]'));
    const md =
      (hasIrDom && v?.lute?.VditorIRDOM2Md
        ? v.lute.VditorIRDOM2Md(tmp.innerHTML).trim()
        : instance.html2md(tmp.innerHTML).trim()) || plain;
    e.preventDefault();
    e.stopPropagation();
    e.clipboardData?.setData('text/plain', md);
  }
}

export function handleEditorDragStartCapture(e: DragEvent): void {
  const target = e.target as HTMLElement | null;
  if (target?.closest('.vditor-ir__marker--info, .vditor-copy, .vcat-code-copy-btn')) {
    e.preventDefault();
    e.stopPropagation();
  }
}

export function handleEditorDropCapture(e: DragEvent): void {
  const target = e.target as HTMLElement | null;
  if (target?.closest('.vditor-ir__marker--info, .vditor-copy, .vcat-code-copy-btn')) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function getTopBlockForCut(target: Node, resetEl: Element): HTMLElement | null {
  let cur: Node | null = target;
  while (cur && cur.parentElement !== resetEl) {
    if (!cur.parentElement) return null;
    cur = cur.parentElement;
  }
  return cur instanceof HTMLElement && resetEl.contains(cur) ? cur : null;
}

function isProtectedBlockForCut(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (['blockquote', 'pre', 'table', 'hr'].includes(tag)) return true;
  const dt = el.getAttribute('data-type');
  return Boolean(dt && ['blockquote', 'code-block', 'table', 'hr', 'html-block', 'math-block'].includes(dt));
}

export function handleEditorCutCapture(
  e: ClipboardEvent,
  el: HTMLElement,
  instance: Vditor,
  prefsRef: { current: EditorPreferences }
): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;

  const range = sel.getRangeAt(0);
  const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');
  if (!resetEl) return;

  const startTop = getTopBlockForCut(range.startContainer, resetEl);
  const endTop = getTopBlockForCut(range.endContainer, resetEl);

  // 先执行与 Copy 相同的剪贴板写入（注意：Copy 内部会调用 e.preventDefault()，因此后续必须显式执行删除）
  handleEditorCopyCapture(e, el, instance, prefsRef);

  // 若选区跨越受保护块边界（如引用末尾拖选到下方代码块），阻断原生剪切合并，仅安全删除起点块内选中内容
  if (startTop && endTop && startTop !== endTop && (isProtectedBlockForCut(startTop) || isProtectedBlockForCut(endTop))) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    try {
      const safeRange = document.createRange();
      safeRange.setStart(range.startContainer, range.startOffset);
      safeRange.setEnd(startTop, startTop.childNodes.length);
      safeRange.deleteContents();
      if ((startTop.textContent || '').replace(/[\u200b\ufeff\s]/g, '').length === 0) {
        if (startTop.tagName === 'BLOCKQUOTE') {
          startTop.innerHTML = '<p data-block="0"><br></p>';
        } else {
          startTop.innerHTML = '<br>';
        }
      }
      const leaf = (startTop.querySelector('p, li, code') as HTMLElement | null) ?? startTop;
      const nr = document.createRange();
      nr.selectNodeContents(leaf);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
    } catch {
      // ignore range error
    }
    return;
  }

  // 普通同块内剪切：因 handleEditorCopyCapture 阻止了默认行为以写入 Markdown，需显式删除选中内容
  if (e.defaultPrevented) {
    document.execCommand('delete', false);
  }
}
