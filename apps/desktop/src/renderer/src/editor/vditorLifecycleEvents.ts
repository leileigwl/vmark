import type { MutableRefObject } from 'react';
import type { EditorPreferences } from '@vcat/shared';
import type Vditor from 'vditor';
import type { LightboxPayload } from '../components/MediaLightbox';
import { getPreviewBlockTarget } from './editorHelpers';
import type { InlineWrapCommand } from './inlineFormat';
import { runVditorRedo, runVditorUndo } from './vditorHandleFactory';
import { processVditorKeyDownCapture } from './vditorKeyboard';
import {
  handleEditorContextMenu,
  handleEditorCopyCapture,
  handleEditorCutCapture,
  handleEditorDragStartCapture,
  handleEditorDropCapture,
  handleEditorGapClickCapture,
  handleEditorMouseDownCapture,
  handleEditorPasteCapture,
  type PointerEventContext,
} from './vditorPointerEvents';
import { handleSlashMenuKeyDown, type SlashMenuState } from './vditorSlashMenu';
import { ensureTaskListOutputPatched, handleTaskCheckboxClickCapture } from './vditorTaskList';
import type { SlashCommandItem } from './slashCommands';

/** Attaches DOM, capture-phase keyboard/pointer, selection, and MutationObserver listeners to a Vditor instance. */
export function bindVditorEditorEvents(params: {
  el: HTMLElement;
  instance: Vditor;
  readOnlyRef: MutableRefObject<boolean>;
  prefsRef: MutableRefObject<EditorPreferences>;
  slashStateRef: MutableRefObject<SlashMenuState>;
  setSlashState: React.Dispatch<React.SetStateAction<SlashMenuState>>;
  applySlashCommand: (item: SlashCommandItem) => void;
  detectSlashCommand: () => void;
  lastActiveInfoMarkerRef: { current: HTMLElement | null };
  hintNavigatedByArrowRef: { current: boolean };
  lastSelectionElRef: MutableRefObject<HTMLElement | null>;
  activeZoomImgRef: MutableRefObject<HTMLImageElement | null>;
  mermaidClickTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  suppressPreviewClickUntilRef: { current: number };
  setLightboxItem: React.Dispatch<React.SetStateAction<LightboxPayload | null>>;
  commitCodeBlockLanguage: (infoMarker: HTMLElement, rawLang: string) => void;
  setVditorRecentLang: (lang: string) => void;
  ensureCodeBlockInfoMarkers: () => void;
  pushVditorUndo: () => void;
  toggleInlineWrap: (cmd: InlineWrapCommand) => void;
  rerenderBrokenMermaid: () => void;
  renderLatexBlocks: () => void;
  onChangeRef: MutableRefObject<(md: string) => void>;
  onOpenLinkRef: MutableRefObject<((href: string) => void) | undefined>;
  toggleLightboxFromActive: () => void;
  clearActiveZoomTarget: () => void;
  collapseExpandedCodeBlocks: (exceptBlock?: Element | null) => void;
  cleanupUnusedTempGapParagraphs: (activeNode?: Node | null) => void;
  syncCodeCopyOverlays: () => void;
  enhanceDom: () => void;
}): () => void {
  const { el, instance } = params;

  const handleKeyDownCapture = (e: KeyboardEvent) => {
    processVditorKeyDownCapture(e, {
      el,
      instance,
      readOnly: params.readOnlyRef.current,
      autoPairBrackets: params.prefsRef.current.autoPairSymbols,
      slashMenuOpen: params.slashStateRef.current.open,
      lastActiveInfoMarkerRef: params.lastActiveInfoMarkerRef,
      hintNavigatedByArrowRef: params.hintNavigatedByArrowRef,
      activeZoomImgRef: params.activeZoomImgRef,
      setVditorRecentLang: params.setVditorRecentLang,
      commitCodeBlockLanguage: params.commitCodeBlockLanguage,
      ensureCodeBlockInfoMarkers: params.ensureCodeBlockInfoMarkers,
      pushVditorUndo: params.pushVditorUndo,
      toggleInlineWrap: params.toggleInlineWrap,
      rerenderBrokenMermaid: params.rerenderBrokenMermaid,
      onChangeValue: (md) => params.onChangeRef.current(md),
      toggleLightboxFromActive: params.toggleLightboxFromActive,
      closeLightbox: () => params.setLightboxItem(null),
      undo: () => runVditorUndo(instance, (md) => params.onChangeRef.current(md)),
      redo: () => runVditorRedo(instance, (md) => params.onChangeRef.current(md)),
      onSlashKeyDown: (ev) =>
        handleSlashMenuKeyDown(ev, params.slashStateRef, params.setSlashState, params.applySlashCommand),
    });
  };

  const pendingGapMouseDownRef = { current: null as { x: number; y: number; resetEl: HTMLElement } | null };
  const pointerCtx: PointerEventContext = {
    el,
    instance,
    get readOnly() {
      return params.readOnlyRef.current;
    },
    prefsRef: params.prefsRef,
    lastActiveInfoMarkerRef: params.lastActiveInfoMarkerRef,
    lastSelectionElRef: params.lastSelectionElRef,
    activeZoomImgRef: params.activeZoomImgRef,
    mermaidClickTimerRef: params.mermaidClickTimerRef,
    pendingGapMouseDownRef,
    suppressPreviewClickUntilRef: params.suppressPreviewClickUntilRef,
    setLightboxItem: params.setLightboxItem,
    commitCodeBlockLanguage: params.commitCodeBlockLanguage,
    clearActiveZoomTarget: params.clearActiveZoomTarget,
    collapseExpandedCodeBlocks: params.collapseExpandedCodeBlocks,
    cleanupUnusedTempGapParagraphs: params.cleanupUnusedTempGapParagraphs,
  };

  const handleMouseDownCapture = (e: MouseEvent) => handleEditorMouseDownCapture(e, pointerCtx);

  const handleClickCapture = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('.vditor-hint button')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }
    if (handleEditorGapClickCapture(e, pointerCtx)) return;
    if (Date.now() < params.suppressPreviewClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }
    const taskCtx = { el, instance, readOnly: params.readOnlyRef.current, pushVditorUndo: params.pushVditorUndo };
    if (handleTaskCheckboxClickCapture(e, { ...taskCtx, onChange: (md) => params.onChangeRef.current(md) })) return;
    const imgEl = target?.closest('img');
    const previewTarget = imgEl ? null : getPreviewBlockTarget(target);
    if (imgEl || previewTarget) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }
    const linkAnchor = target?.closest('a, .vditor-ir__link') as HTMLElement | null;
    const linkNode = target?.closest('.vditor-ir__node[data-type="a"]') as HTMLElement | null;
    if ((linkAnchor || linkNode) && (params.readOnlyRef.current || e.metaKey || e.ctrlKey)) {
      const href =
        linkAnchor?.getAttribute('href') ||
        linkNode?.querySelector('.vditor-ir__marker--link')?.textContent?.trim() ||
        linkNode?.querySelector('a')?.getAttribute('href') ||
        '';
      if (href) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        params.onOpenLinkRef.current?.(href);
      }
    }
  };

  const handleContextMenu = (e: MouseEvent) => handleEditorContextMenu(e, pointerCtx);
  const handlePasteCapture = (e: ClipboardEvent) => handleEditorPasteCapture(e, instance);
  const handleCopyCapture = (e: ClipboardEvent) => handleEditorCopyCapture(e, el, instance, params.prefsRef);
  const handleCutCapture = (e: ClipboardEvent) => handleEditorCutCapture(e, el, instance, params.prefsRef);

  const handleMouseUpCapture = (e: MouseEvent) => {
    if (Date.now() < params.suppressPreviewClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  const handleDblClickCapture = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (Date.now() < params.suppressPreviewClickUntilRef.current || getPreviewBlockTarget(target)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }

    const htmlBlock = target?.closest('.vditor-ir__node[data-type="html-block"]') as HTMLElement | null;
    if (htmlBlock) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const summary = target?.closest('summary') as HTMLElement | null;
      const details = target?.closest('details') as HTMLElement | null;
      const selectTarget = summary ?? details ?? htmlBlock.querySelector('.vditor-ir__preview') ?? htmlBlock;
      const range = document.createRange();
      range.selectNodeContents(selectTarget);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }

    const codeBlock = target?.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null;
    if (codeBlock) {
      if (target?.closest('.vditor-copy, .vditor-ir__marker--info')) return;
      const codeEl =
        (codeBlock.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null) ??
        (codeBlock.querySelector('pre.vditor-ir__preview > code') as HTMLElement | null) ??
        (codeBlock.querySelector('pre.vditor-ir__marker--pre') as HTMLElement | null);
      if (codeEl) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  const handleSelectionChange = () => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
    params.cleanupUnusedTempGapParagraphs(sel.anchorNode);
    const anchorEl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement;
    const curInfo = anchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null;
    if (curInfo && el.contains(curInfo)) {
      params.lastActiveInfoMarkerRef.current = curInfo;
    }
    const curCodeBlock = anchorEl?.closest(
      '.vditor-ir__node[data-type="code-block"], .vditor-ir__node[data-type="math-block"]'
    ) as HTMLElement | null;
    params.collapseExpandedCodeBlocks(curCodeBlock);
    requestAnimationFrame(() => {
      params.renderLatexBlocks();
      params.rerenderBrokenMermaid();
    });
  };

  const handleCompositionEnd = () => {
    params.ensureCodeBlockInfoMarkers();
    requestAnimationFrame(params.ensureCodeBlockInfoMarkers);
  };

  const handleInputCapture = (e: Event) => {
    const sel = window.getSelection();
    if (sel && sel.isCollapsed && sel.rangeCount > 0) {
      const sc = sel.getRangeAt(0).startContainer;
      const anchorEl = sc instanceof Element ? sc : sc.parentElement;
      if (anchorEl && el.contains(anchorEl) && !anchorEl.closest('pre:not(.vditor-reset), code, table')) {
        const curBlock = anchorEl.closest('p, li') as HTMLElement | null;
        if ((curBlock?.textContent || '').replace(/[\u200b\ufeff]/g, '') === '>') {
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
      }
    }
    params.detectSlashCommand();
  };

  const observer = new MutationObserver(() => {
    ensureTaskListOutputPatched(instance);
    params.enhanceDom();
  });
  observer.observe(el, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['src', 'style', 'class'],
  });
  params.enhanceDom();

  document.addEventListener('selectionchange', handleSelectionChange);
  el.addEventListener('compositionend', handleCompositionEnd, true);
  el.addEventListener('copy', handleCopyCapture, true);
  el.addEventListener('cut', handleCutCapture, true);
  el.addEventListener('paste', handlePasteCapture, true);
  el.addEventListener('dragstart', handleEditorDragStartCapture, true);
  el.addEventListener('drop', handleEditorDropCapture, true);
  window.addEventListener('keydown', handleKeyDownCapture, true);
  el.addEventListener('mousedown', handleMouseDownCapture, true);
  el.addEventListener('mouseup', handleMouseUpCapture, true);
  el.addEventListener('dblclick', handleDblClickCapture, true);
  el.addEventListener('click', handleClickCapture, true);
  el.addEventListener('input', handleInputCapture, true);
  el.addEventListener('keyup', params.detectSlashCommand, true);
  el.addEventListener('contextmenu', handleContextMenu);
  el.addEventListener('scroll', params.syncCodeCopyOverlays, { capture: true, passive: true });
  window.addEventListener('resize', params.syncCodeCopyOverlays);

  return () => {
    document.removeEventListener('selectionchange', handleSelectionChange);
    el.removeEventListener('input', handleInputCapture, true);
    el.removeEventListener('keyup', params.detectSlashCommand, true);
    el.removeEventListener('compositionend', handleCompositionEnd, true);
    el.removeEventListener('copy', handleCopyCapture, true);
    el.removeEventListener('cut', handleCutCapture, true);
    el.removeEventListener('paste', handlePasteCapture, true);
    el.removeEventListener('dragstart', handleEditorDragStartCapture, true);
    el.removeEventListener('drop', handleEditorDropCapture, true);
    window.removeEventListener('keydown', handleKeyDownCapture, true);
    el.removeEventListener('mousedown', handleMouseDownCapture, true);
    el.removeEventListener('mouseup', handleMouseUpCapture, true);
    el.removeEventListener('dblclick', handleDblClickCapture, true);
    el.removeEventListener('click', handleClickCapture, true);
    el.removeEventListener('contextmenu', handleContextMenu);
    el.removeEventListener('scroll', params.syncCodeCopyOverlays, true);
    window.removeEventListener('resize', params.syncCodeCopyOverlays);
    observer.disconnect();
  };
}
