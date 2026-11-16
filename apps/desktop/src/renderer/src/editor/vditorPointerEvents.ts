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
  handledGapClickRef: { current: boolean };
  suppressPreviewClickUntilRef: { current: number };
  setLightboxItem: (item: LightboxPayload | null) => void;
  commitCodeBlockLanguage: (infoMarker: HTMLElement, rawLang: string) => void;
  clearActiveZoomTarget: () => void;
  collapseExpandedCodeBlocks: (exceptBlock?: Element | null) => void;
  cleanupUnusedTempGapParagraphs: (activeNode?: Node | null) => void;
}

export function handleEditorMouseDownCapture(e: MouseEvent, ctx: PointerEventContext): void {
  const { el } = ctx;
  ctx.handledGapClickRef.current = false;
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
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(infoSpan);
          sel.removeAllRanges();
          sel.addRange(range);
        }
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
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      ctx.handledGapClickRef.current = true;
      ctx.clearActiveZoomTarget();
      const nextChild = children.find((c) => c.getBoundingClientRect().top > e.clientY) ?? null;
      const prevChild = nextChild
        ? (nextChild.previousElementSibling as HTMLElement | null)
        : children[children.length - 1] ?? null;
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
        if (!targetPara.firstChild) {
          targetPara.textContent = '\u200b';
        }
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(targetPara);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
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
    const frag = sel.getRangeAt(0).cloneContents();
    const tmp = document.createElement('div');
    tmp.appendChild(frag);
    const md = instance.html2md(tmp.innerHTML).trim() || plain;
    e.preventDefault();
    e.stopPropagation();
    e.clipboardData?.setData('text/plain', md);
  }
}
