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
  ensureCodeBlockInfoMarkers?: () => void;
  undo: () => void;
  redo: () => void;
}

/** Handles capture-phase keyboard shortcuts, code-block indentation, table guards, and bracket pairing. */
export function processVditorKeyDownCapture(e: KeyboardEvent, ctx: KeyboardCaptureContext): void {
  const { el, instance } = ctx;
  const isImeComposing = e.isComposing || e.keyCode === 229;
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
    if (isImeComposing) return;
    if (ctx.lastActiveInfoMarkerRef.current !== infoMarker) {
      ctx.hintNavigatedByArrowRef.current = false;
    }
    ctx.lastActiveInfoMarkerRef.current = infoMarker;
    const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
    const hintButtons = hintEl ? Array.from(hintEl.querySelectorAll('button')) : [];
    const hintVisible = Boolean(
      hintEl &&
      hintEl.offsetParent !== null &&
      window.getComputedStyle(hintEl).display !== 'none' &&
      hintButtons.length > 0
    );

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

  // Block Deletion Isolation: Prevent Backspace at start of heading/paragraph from merging into Callout/blockquote/code/table
  if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey && !isImeComposing) {
    const sel = window.getSelection();
    if (sel && sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const anchorNode =
        range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');

      let curBlock = anchorNode?.closest('.vditor-ir__node') as HTMLElement | null;
      while (
        curBlock &&
        curBlock.parentElement &&
        curBlock.parentElement !== resetEl &&
        curBlock.parentElement.closest('.vditor-reset')
      ) {
        const parentBlock = curBlock.parentElement.closest('.vditor-ir__node') as HTMLElement | null;
        if (!parentBlock) break;
        curBlock = parentBlock;
      }

      if (curBlock && resetEl && resetEl.contains(curBlock)) {
        const preRange = document.createRange();
        preRange.setStart(curBlock, 0);
        preRange.setEnd(range.startContainer, range.startOffset);
        const preText = preRange.toString().replace(/[\u200b\ufeff]/g, '');

        const isAtBlockStart = preText.length === 0 || /^#{1,6}\s*$/.test(preText);
        if (isAtBlockStart) {
          const prevBlock = curBlock.previousElementSibling as HTMLElement | null;
          if (prevBlock && prevBlock.matches('.vditor-ir__node')) {
            const prevType = prevBlock.getAttribute('data-type');
            const isolatedTypes = ['blockquote', 'code-block', 'table', 'hr', 'html-block', 'math-block'];
            if (prevType && isolatedTypes.includes(prevType)) {
              const curContent = (curBlock.textContent || '')
                .replace(/^#{1,6}\s*/, '')
                .replace(/[\u200b\ufeff\s]/g, '');
              if (curContent.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
              }
            }
          }
        }
      }
    }
  }

  const sel = window.getSelection();
  const anchorEl =
    sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
  const activeCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;

  if (activeCell && el.contains(activeCell)) {
    if ((e.key === 'Backspace' || e.key === 'Delete') && !isImeComposing) {
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
      if (sel && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const cellPreRange = document.createRange();
        cellPreRange.setStart(activeCell, 0);
        cellPreRange.setEnd(range.startContainer, range.startOffset);
        const cellPreText = cellPreRange.toString().replace(/[\u200b\ufeff]/g, '');
        if (e.key === 'Backspace' && cellPreText.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
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

  // Space key instant markdown block formatting triggers
  if (
    e.key === ' ' &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.shiftKey &&
    !isImeComposing
  ) {
    const sel = window.getSelection();
    if (sel && sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const anchorEl = node instanceof Element ? node : node.parentElement;

      if (anchorEl && el.contains(anchorEl) && !anchorEl.closest('pre, code, .vditor-ir__marker--info, table')) {
        const curBlock =
          (anchorEl.closest('.vditor-ir__node, p, h1, h2, h3, h4, h5, h6, li, blockquote') as HTMLElement | null) ??
          anchorEl;
        if (curBlock && el.contains(curBlock)) {
          const preRange = document.createRange();
          preRange.setStart(curBlock, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const preText = preRange.toString().replace(/[\u200b\ufeff]/g, '');

          const matchNestedQuoteOl = preText.match(/^>\s*(\d+)\.$/);
          const matchNestedQuoteUl = preText.match(/^>\s*[-*]$/);
          const matchOl = preText.match(/^(\d+)\.$/);
          const matchUl = preText.match(/^[-*]$/);
          const matchQuote = preText === '>';
          const matchTask = preText === '[]' || preText === '[ ]' || preText === '- [ ]';
          const matchHeading = preText.match(/^(#{1,6})$/);

          if (matchNestedQuoteOl || matchNestedQuoteUl || matchOl || matchUl || matchQuote || matchTask || matchHeading) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            ctx.pushVditorUndo();

            preRange.deleteContents();

            if (matchNestedQuoteOl) {
              instance.insertValue(`> ${matchNestedQuoteOl[1]}. `);
            } else if (matchNestedQuoteUl) {
              instance.insertValue('> - ');
            } else if (matchOl) {
              instance.insertValue(`${matchOl[1]}. `);
            } else if (matchUl) {
              instance.insertValue('- ');
            } else if (matchQuote) {
              instance.insertValue('> ');
            } else if (matchTask) {
              instance.insertValue('- [ ] ');
            } else if (matchHeading) {
              instance.insertValue(`${matchHeading[1]} `);
            }

            ctx.pushVditorUndo();
            ctx.onChangeValue(instance.getValue());
            return;
          }
        }
      }
    }
  }

  // Backtick auto-pair (`` with cursor in middle) and triple-backtick (```) code-block expansion
  if (
    ctx.autoPairBrackets &&
    e.key === '`' &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !isImeComposing
  ) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const anchorNode =
        range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      if (anchorNode && el.contains(anchorNode) && !anchorNode.closest('pre, code, .vditor-ir__marker--info')) {
        if (!range.collapsed) {
          const selectedText = range.toString();
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const wrapped = `\`${selectedText}\``;
          const textNode = document.createTextNode(wrapped);
          range.deleteContents();
          range.insertNode(textNode);
          const nextRange = document.createRange();
          nextRange.setStart(textNode, 1);
          nextRange.setEnd(textNode, 1 + selectedText.length);
          sel.removeAllRanges();
          sel.addRange(nextRange);
          ctx.onChangeValue(instance.getValue());
          return;
        } else {
          const sc = range.startContainer;
          const beforeText =
            sc.nodeType === Node.TEXT_NODE ? (sc.nodeValue || '').slice(0, range.startOffset) : '';
          const afterText =
            sc.nodeType === Node.TEXT_NODE ? (sc.nodeValue || '').slice(range.startOffset) : '';

          // If cursor is right before a closing backtick, step over it
          if (afterText.startsWith('`') && !beforeText.endsWith('`')) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const nextRange = document.createRange();
            nextRange.setStart(sc, range.startOffset + 1);
            nextRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(nextRange);
            return;
          }

          // If typing 3rd backtick (already has two backticks before cursor):
          if (beforeText.endsWith('``')) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const delRange = document.createRange();
            delRange.setStart(sc, range.startOffset - 2);
            delRange.setEnd(sc, range.startOffset);
            delRange.deleteContents();
            ctx.pushVditorUndo();
            instance.insertValue('```ts\n\n```');
            setTimeout(() => {
              ctx.ensureCodeBlockInfoMarkers?.();
              const codeBlocks = Array.from(el.querySelectorAll('.vditor-ir__node[data-type="code-block"]'));
              const lastCb = codeBlocks.pop() as HTMLElement | undefined;
              const infoSpan = lastCb?.querySelector('.vditor-ir__marker--info') as HTMLElement | null;
              if (lastCb && infoSpan) {
                lastCb.classList.add('vditor-ir__node--expand');
                ctx.lastActiveInfoMarkerRef.current = infoSpan;
                const r = document.createRange();
                r.selectNodeContents(infoSpan);
                const s = window.getSelection();
                s?.removeAllRanges();
                s?.addRange(r);
              }
            }, 60);
            return;
          }

          // Otherwise, insert paired `` with cursor in middle
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const textNode = document.createTextNode('``');
          range.deleteContents();
          range.insertNode(textNode);
          const nextRange = document.createRange();
          nextRange.setStart(textNode, 1);
          nextRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(nextRange);
          ctx.onChangeValue(instance.getValue());
          return;
        }
      }
    }
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
