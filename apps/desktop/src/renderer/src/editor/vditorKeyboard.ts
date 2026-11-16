import type Vditor from 'vditor';
import { handleCodeBlockIndentKey } from './codeBlockIndent';
import { PAIR_MAP } from './editorHelpers';
import { getCodeBlockLang } from './vditorDomEnhancer';

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
}

/** Handles capture-phase keyboard shortcuts, code-block indentation, table guards, and bracket pairing. */
export function processVditorKeyDownCapture(e: KeyboardEvent, ctx: KeyboardCaptureContext): void {
  const { el, instance } = ctx;
  const targetNode = e.target as HTMLElement | null;
  if (targetNode && (targetNode.tagName === 'INPUT' || targetNode.tagName === 'TEXTAREA')) {
    return;
  }

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

  if (ctx.slashMenuOpen && ctx.onSlashKeyDown(e)) {
    return;
  }

  const selInfo = window.getSelection();
  const selAnchorEl =
    selInfo?.anchorNode instanceof Element ? selInfo.anchorNode : selInfo?.anchorNode?.parentElement;
  const infoMarker =
    (selAnchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null) ??
    (targetNode?.closest('.vditor-ir__marker--info') as HTMLElement | null);

  if (infoMarker && el.contains(infoMarker) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (ctx.lastActiveInfoMarkerRef.current !== infoMarker) {
      ctx.hintNavigatedByArrowRef.current = false;
    }
    ctx.lastActiveInfoMarkerRef.current = infoMarker;
    const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
    const hintButtons = hintEl ? Array.from(hintEl.querySelectorAll('button')) : [];
    const hintVisible = Boolean(hintEl && hintEl.style.display !== 'none' && hintButtons.length > 0);

    if (e.key === 'Backspace' || e.key === 'Delete') {
      ctx.hintNavigatedByArrowRef.current = false;
      ctx.setVditorRecentLang('');
      const curLangText = (infoMarker.textContent || '').replace(/\u200b/g, '');
      if (e.key === 'Backspace' && curLangText.length === 0) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (infoMarker.textContent !== '\u200b') infoMarker.textContent = '\u200b';
        return;
      }
      queueMicrotask(() => {
        if ((infoMarker.textContent || '').replace(/\u200b/g, '').trim() === '') {
          ctx.setVditorRecentLang('');
          if (infoMarker.textContent !== '\u200b') infoMarker.textContent = '\u200b';
          infoMarker.closest('.vditor-ir__node[data-type="code-block"]')?.setAttribute('data-CodeLang', 'text');
        }
      });
    }

    if (hintVisible && (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      ctx.hintNavigatedByArrowRef.current = true;
      const curIdx = hintButtons.findIndex((b) => b.classList.contains('vditor-hint--current'));
      const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      const nextIdx =
        curIdx < 0
          ? delta > 0
            ? 0
            : hintButtons.length - 1
          : (curIdx + delta + hintButtons.length) % hintButtons.length;
      hintButtons.forEach((b, i) => b.classList.toggle('vditor-hint--current', i === nextIdx));
      hintButtons[nextIdx]?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const rawCurText = (infoMarker.textContent || '').replace(/\u200b/g, '').trim();
      const shouldUseHint = hintVisible && (rawCurText.length > 0 || ctx.hintNavigatedByArrowRef.current);
      const chosenBtn = shouldUseHint
        ? hintButtons.find((b) => b.classList.contains('vditor-hint--current')) ?? hintButtons[0]
        : null;
      const rawChoice = chosenBtn
        ? chosenBtn.getAttribute('data-value') || chosenBtn.textContent || ''
        : rawCurText;
      ctx.commitCodeBlockLanguage(infoMarker, rawChoice);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      ctx.commitCodeBlockLanguage(infoMarker, infoMarker.textContent || '');
      return;
    }

    if (e.key.length === 1) {
      ctx.hintNavigatedByArrowRef.current = false;
    }
  }

  // Code block language-aware indentation (Tab, Shift+Tab, Enter auto-indent)
  const codeBodyEl = selAnchorEl?.closest('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
  if (codeBodyEl && el.contains(codeBodyEl) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const codeBlock = codeBodyEl.closest('.vditor-ir__node[data-type="code-block"]');
    const lang = codeBlock ? getCodeBlockLang(codeBlock) : '';
    if (handleCodeBlockIndentKey(e, codeBodyEl, lang)) {
      return;
    }
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

  const sel = window.getSelection();
  const anchorEl =
    sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
  const activeCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;

  if (activeCell && el.contains(activeCell)) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const cellImg = activeCell.querySelector('.vditor-ir__node[data-type="img"], img');
      if (cellImg && (!sel || sel.isCollapsed)) {
        const visibleText = Array.from(activeCell.childNodes)
          .filter((n) => !(n instanceof HTMLElement && (n.matches('.vditor-ir__node[data-type="img"], img') || n.querySelector('img'))))
          .map((n) => n.textContent || '')
          .join('')
          .trim();
        if (!visibleText) {
          e.preventDefault();
          e.stopPropagation();
          ctx.pushVditorUndo();
          cellImg.remove();
          ctx.pushVditorUndo();
          ctx.onChangeValue(instance.getValue());
          return;
        }
      }
    }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const tr = activeCell.parentElement as HTMLTableRowElement | null;
      const table = activeCell.closest('table');
      if (tr && table) {
        const allRows = Array.from(table.querySelectorAll('tr'));
        const rIdx = allRows.indexOf(tr);
        const cIdx = Array.from(tr.cells).indexOf(activeCell);
        const nextRow = allRows[rIdx + 1];
        const targetCell = nextRow?.cells[cIdx] ?? nextRow?.cells[0];
        if (targetCell && sel) {
          const range = document.createRange();
          range.selectNodeContents(targetCell);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.shiftKey || e.altKey || e.key === 'Enter')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

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
      setTimeout(ctx.rerenderBrokenMermaid, 50);
    }
  } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
    setTimeout(ctx.rerenderBrokenMermaid, 50);
    return;
  }

  if (
    ctx.autoPairBrackets &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    (PAIR_MAP[e.key] || Object.values(PAIR_MAP).includes(e.key))
  ) {
    const selNow = window.getSelection();
    if (selNow && selNow.rangeCount > 0) {
      const range = selNow.getRangeAt(0);
      if (range.collapsed && Object.values(PAIR_MAP).includes(e.key)) {
        const sc = range.startContainer;
        const nextChar =
          sc.nodeType === Node.TEXT_NODE
            ? (sc.nodeValue || '').slice(range.startOffset, range.startOffset + 1)
            : '';
        if (nextChar === e.key) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const nextRange = document.createRange();
          nextRange.setStart(sc, range.startOffset + 1);
          nextRange.collapse(true);
          selNow.removeAllRanges();
          selNow.addRange(nextRange);
          return;
        }
      }

      const closeChar = PAIR_MAP[e.key];
      if (!closeChar) return;
      const anchorNode =
        range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      if (e.key === '`' || anchorNode?.closest('.vditor-ir__marker--info')) return;
      if (el.contains(anchorNode)) {
        const selectedText = range.toString();
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (selectedText) {
          const wrapped = `${e.key}${selectedText}${closeChar}`;
          const textNode = document.createTextNode(wrapped);
          range.deleteContents();
          range.insertNode(textNode);
          const nextRange = document.createRange();
          nextRange.setStart(textNode, 1);
          nextRange.setEnd(textNode, 1 + selectedText.length);
          selNow.removeAllRanges();
          selNow.addRange(nextRange);
        } else {
          const textNode = document.createTextNode(`${e.key}${closeChar}`);
          range.deleteContents();
          range.insertNode(textNode);
          const nextRange = document.createRange();
          nextRange.setStart(textNode, 1);
          nextRange.collapse(true);
          selNow.removeAllRanges();
          selNow.addRange(nextRange);
        }
        ctx.onChangeValue(instance.getValue());
      }
    }
  }
}
