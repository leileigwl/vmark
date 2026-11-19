import type Vditor from 'vditor';
import { handleCodeBlockIndentKey } from './codeBlockIndent';
import { getCodeBlockLang } from './vditorDomEnhancer';
import { handleBacktickKeyDown, handleInfoMarkerKeyDown } from './vditorKeyboardCodeBlock';
import { handleEmptyPairBackspace, handleProtectedBlockDelete } from './vditorKeyboardProtectedDelete';
import {
  handleBracketAutoPair,
  handleSpaceMarkdownSpin,
  handleTableCellKeyDown,
} from './vditorKeyboardSpaceAndPairs';

export interface KeyboardCaptureContext {
  el: HTMLElement;
  instance: Vditor;
  readOnly: boolean;
  autoPairBrackets: boolean;
  slashMenuOpen: boolean;
  lastActiveInfoMarkerRef: { current: HTMLElement | null };
  hintNavigatedByArrowRef: { current: boolean };
  activeZoomImgRef: { current: HTMLElement | null };
  setVditorRecentLang: (lang: string) => void;
  commitCodeBlockLanguage: (infoMarker: HTMLElement, rawLang: string) => void;
  pushVditorUndo: () => void;
  toggleInlineWrap: (cmd: 'bold' | 'italic') => void;
  rerenderBrokenMermaid: () => void;
  onChangeValue: (md: string) => void;
  toggleLightboxFromActive: () => void;
  closeLightbox: () => void;
  onSlashKeyDown: (e: KeyboardEvent) => boolean;
  ensureCodeBlockInfoMarkers?: () => void;
  undo: () => void;
  redo: () => void;
}

/** Handles capture-phase keyboard shortcuts, code-block indentation, table guards, and bracket pairing. */
export function processVditorKeyDownCapture(e: KeyboardEvent, ctx: KeyboardCaptureContext): void {
  const { el, instance } = ctx;
  const isImeComposing = e.isComposing || e.keyCode === 229;
  const targetNode = e.target as HTMLElement | null;
  if (targetNode && (targetNode.tagName === 'INPUT' || targetNode.tagName === 'TEXTAREA')) return;

  if (ctx.readOnly) {
    if (
      e.key === ' ' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      ctx.activeZoomImgRef.current &&
      el.contains(ctx.activeZoomImgRef.current)
    ) {
      e.preventDefault();
      e.stopPropagation();
      ctx.toggleLightboxFromActive();
    }
    return;
  }

  if (ctx.slashMenuOpen && ctx.onSlashKeyDown(e)) return;

  const selInfo = window.getSelection();
  const selAnchorEl =
    selInfo?.anchorNode instanceof Element ? selInfo.anchorNode : selInfo?.anchorNode?.parentElement;
  const infoMarker =
    (selAnchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null) ??
    (targetNode?.closest('.vditor-ir__marker--info') as HTMLElement | null);

  if (
    infoMarker &&
    el.contains(infoMarker) &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    handleInfoMarkerKeyDown(e, ctx, infoMarker, selInfo, isImeComposing)
  ) {
    return;
  }

  const codeBodyEl = selAnchorEl?.closest('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
  if (codeBodyEl && el.contains(codeBodyEl) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const codeBlock = codeBodyEl.closest('.vditor-ir__node[data-type="code-block"]');
    const lang = codeBlock ? getCodeBlockLang(codeBlock) : '';
    if (handleCodeBlockIndentKey(e, codeBodyEl, lang)) return;
  }

  if (
    e.key === ' ' &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.shiftKey &&
    ctx.activeZoomImgRef.current &&
    el.contains(ctx.activeZoomImgRef.current)
  ) {
    e.preventDefault();
    e.stopPropagation();
    ctx.toggleLightboxFromActive();
    return;
  }

  if (
    (e.key === 'Backspace' || e.key === 'Delete') &&
    ctx.activeZoomImgRef.current &&
    el.contains(ctx.activeZoomImgRef.current) &&
    ctx.activeZoomImgRef.current.tagName === 'IMG'
  ) {
    e.preventDefault();
    e.stopPropagation();
    ctx.pushVditorUndo();
    const activeImg = ctx.activeZoomImgRef.current;
    const imgWrapper = activeImg.closest('.vditor-ir__node[data-type="img"]') ?? activeImg;
    imgWrapper.remove();
    ctx.activeZoomImgRef.current = null;
    ctx.closeLightbox();
    ctx.pushVditorUndo();
    ctx.onChangeValue(instance.getValue());
    return;
  }

  if (!el.contains(targetNode)) return;
  if (handleEmptyPairBackspace(e, ctx, isImeComposing)) return;
  if (handleProtectedBlockDelete(e, ctx, isImeComposing)) return;
  if (handleSpaceMarkdownSpin(e, ctx, isImeComposing)) return;
  if (handleTableCellKeyDown(e, ctx, isImeComposing)) return;

  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      ctx.toggleInlineWrap(k === 'b' ? 'bold' : 'italic');
      return;
    } else if (k === 'z' || k === 'y') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (k === 'y') ctx.redo();
      else ctx.undo();
      setTimeout(ctx.rerenderBrokenMermaid, 50);
      return;
    }
  } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    ctx.redo();
    setTimeout(ctx.rerenderBrokenMermaid, 50);
    return;
  }

  if (handleBacktickKeyDown(e, ctx, isImeComposing)) return;
  handleBracketAutoPair(e, ctx);
}
