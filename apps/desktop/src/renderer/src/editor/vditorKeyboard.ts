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

/** Returns the direct child of resetEl that contains the given target, or null. */
function getTopBlock(target: Node, resetEl: Element): HTMLElement | null {
  let cur: Node | null = target;
  while (cur && cur.parentElement !== resetEl) {
    if (!cur.parentElement) return null;
    cur = cur.parentElement;
  }
  return cur instanceof HTMLElement && resetEl.contains(cur) ? cur : null;
}

/** Protected blocks that should NEVER be merged into or accidentally deleted from below */
const PROTECTED_TAGS = new Set(['blockquote', 'pre', 'table', 'hr']);
function isProtectedBlock(el: Element): boolean {
  if (PROTECTED_TAGS.has(el.tagName.toLowerCase())) return true;
  const dt = el.getAttribute('data-type');
  if (!dt) return false;
  return ['blockquote', 'code-block', 'table', 'hr', 'html-block', 'math-block'].includes(dt);
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

  // ─── Code Block Language Picker (ArrowUp/Down, Enter, Tab, Escape) ─────────
  if (infoMarker && el.contains(infoMarker) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (isImeComposing) return;
    ctx.lastActiveInfoMarkerRef.current = infoMarker;

    // 优先尝试使用 Vditor 原生 hint.select 处理上下方向键
    const v = (instance as unknown as { vditor?: { hint?: { select?: (ev: KeyboardEvent, vd: unknown) => boolean; element?: HTMLElement } } }).vditor;
    if (v?.hint?.select && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const handled = v.hint.select(e, v);
      if (handled) {
        return;
      }
    }

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

    // 回车/Tab：提交语言，且立刻切入代码块正文第 1 行！
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
      ctx.commitCodeBlockLanguage(infoMarker, (rawChoice || 'text').trim());

      // 选完语言后，立刻把光标移入代码正文第一行
      const codeBlock = infoMarker.closest('.vditor-ir__node[data-type="code-block"]');
      const codeBody = codeBlock?.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
      if (codeBody) {
        requestAnimationFrame(() => {
          const range = document.createRange();
          range.selectNodeContents(codeBody);
          range.collapse(false);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        });
      }
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

  // ─── Block Deletion Isolation ──────────────────────────────────────────────
  // 严格隔离：光标在受保护块（Callout/引用/代码块/表格）下方的行首按 Backspace 时，
  // 无论当前行有无文字，都坚决禁止浏览器向上吞并删除，永不破坏上方的 Callout 容器！
  if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey && !isImeComposing) {
    const sel = window.getSelection();
    if (sel && sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');

      if (resetEl) {
        const topBlock = getTopBlock(range.startContainer, resetEl);
        if (topBlock) {
          try {
            const preRange = document.createRange();
            preRange.setStart(topBlock, 0);
            preRange.setEnd(range.startContainer, range.startOffset);
            const preClean = preRange.toString().replace(/[\u200b\ufeff\s]/g, '');
            const isAtStart = preClean.length === 0 || /^#{1,6}$/.test(preClean);
            if (isAtStart) {
              const prevSib = topBlock.previousElementSibling;
              if (prevSib && isProtectedBlock(prevSib)) {
                // 阻断浏览器默认向上合并或连带删除 Callout 行为
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
              }
            }
          } catch {
            // ignore range errors
          }
        }
      }
    }
  }

  // ─── Space 即刻触发 Markdown 渲染（1.、-、*、>、[] 等及引用内嵌套）───────
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
      const sc = range.startContainer;
      const anchorEl = sc instanceof Element ? sc : sc.parentElement;

      // 仅在非代码块、非表格、非语言提示框中处理
      if (anchorEl && el.contains(anchorEl) && !anchorEl.closest('pre, code, .vditor-ir__marker--info, table')) {
        const curBlock =
          (anchorEl.closest('.vditor-ir__node, p, h1, h2, h3, h4, h5, h6, li') as HTMLElement | null) ??
          anchorEl;

        if (curBlock && el.contains(curBlock)) {
          try {
            const preRange = document.createRange();
            preRange.setStart(curBlock, 0);
            preRange.setEnd(range.startContainer, range.startOffset);
            const preText = preRange.toString().replace(/[\u200b\ufeff]/g, '');

            const inQuote = Boolean(curBlock.closest('blockquote'));
            const matchNestedQuoteOl = preText.match(/^>\s*(\d+)\.$/);
            const matchNestedQuoteUl = preText.match(/^>\s*[-*]$/);
            const matchOl = preText.match(/^(\d+)\.$/);
            const matchUl = preText.match(/^[-*]$/);
            const matchQuote = preText === '>';
            const matchTask = preText === '[]' || preText === '[ ]' || preText === '- []' || preText === '- [ ]';
            const matchHeading = preText.match(/^(#{1,6})$/);

            const isHit =
              matchNestedQuoteOl ||
              matchNestedQuoteUl ||
              matchOl ||
              matchUl ||
              matchQuote ||
              matchTask ||
              matchHeading;

            if (isHit) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              ctx.pushVditorUndo();

              const lute = (instance as unknown as { vditor?: { lute?: { Md2VditorIRDOM: (md: string) => string } } }).vditor?.lute;

              let mdToCompile = '';
              if (inQuote && matchOl) {
                // 在已有引用内部输入 1. -> 引用内嵌套有序列表
                mdToCompile = `${matchOl[1]}. \n`;
              } else if (inQuote && matchUl) {
                // 在已有引用内部输入 - -> 引用内嵌套无序列表
                mdToCompile = '- \n';
              } else if (matchNestedQuoteOl) {
                mdToCompile = `> ${matchNestedQuoteOl[1]}. \n`;
              } else if (matchNestedQuoteUl) {
                mdToCompile = '> - \n';
              } else if (matchOl) {
                mdToCompile = `${matchOl[1]}. \n`;
              } else if (matchUl) {
                mdToCompile = '- \n';
              } else if (matchQuote) {
                mdToCompile = '> \n';
              } else if (matchTask) {
                mdToCompile = '- [ ] \n';
              } else if (matchHeading) {
                mdToCompile = `${matchHeading[1]} \n`;
              }

              if (lute && typeof lute.Md2VditorIRDOM === 'function') {
                const html = lute.Md2VditorIRDOM(mdToCompile);
                const tpl = document.createElement('template');
                tpl.innerHTML = html;
                const newBlock = tpl.content.firstElementChild;
                if (newBlock) {
                  curBlock.replaceWith(newBlock);
                  const targetToFocus =
                    newBlock.querySelector('p, li, h1, h2, h3, h4, h5, h6') ?? newBlock;
                  const newRange = document.createRange();
                  newRange.selectNodeContents(targetToFocus);
                  newRange.collapse(false);
                  sel.removeAllRanges();
                  sel.addRange(newRange);
                  ctx.pushVditorUndo();
                  ctx.onChangeValue(instance.getValue());
                  return;
                }
              }

              // Fallback
              preRange.deleteContents();
              instance.insertValue(mdToCompile);
              ctx.pushVditorUndo();
              ctx.onChangeValue(instance.getValue());
              return;
            }
          } catch {
            // ignore range error
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
    // ─── Table Cell Delete/Backspace Guard ──────────────────────────────────
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
        // Backspace at start of cell → prevent merging cells
        const cellPreRange = document.createRange();
        cellPreRange.setStart(activeCell, 0);
        try { cellPreRange.setEnd(range.startContainer, range.startOffset); } catch { /* ignore */ }
        const cellPreText = cellPreRange.toString().replace(/[\u200b\ufeff]/g, '');
        if (e.key === 'Backspace' && cellPreText.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        // Delete at end of cell → prevent merging cells
        if (e.key === 'Delete') {
          const cellPostRange = document.createRange();
          try {
            cellPostRange.setStart(range.startContainer, range.startOffset);
            cellPostRange.setEnd(activeCell, activeCell.childNodes.length);
          } catch { /* ignore */ }
          const cellPostText = cellPostRange.toString().replace(/[\u200b\ufeff]/g, '');
          if (cellPostText.length === 0) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
          }
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

  // ─── Backtick auto-pair (`) ────────────────────────────────────────────────
  // 1. 空白处敲第 1 个成对产生 `` 且光标居中
  // 2. 光标紧邻已有反引号时，只打单个反引号字符（不重复成对）
  // 3. 累计输入到第 3 个反引号时，瞬间整体删除前导并展开为代码块
  if (
    ctx.autoPairBrackets &&
    e.key === '`' &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !isImeComposing
  ) {
    const selNow = window.getSelection();
    if (selNow && selNow.rangeCount > 0) {
      const range = selNow.getRangeAt(0);
      const anchorNode =
        range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;

      const inCodeBody = Boolean(anchorNode?.closest('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code'));
      const inInfoMk = Boolean(anchorNode?.closest('.vditor-ir__marker--info'));
      if (!inCodeBody && !inInfoMk && anchorNode && el.contains(anchorNode)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!range.collapsed) {
          const selectedText = range.toString();
          document.execCommand('insertText', false, `\`${selectedText}\``);
          ctx.onChangeValue(instance.getValue());
          return;
        }

        const curBlock =
          (anchorNode.closest('.vditor-ir__node, p, h1, h2, h3, h4, h5, h6, li') as HTMLElement | null) ??
          anchorNode;
        const preRange = document.createRange();
        preRange.setStart(curBlock, 0);
        preRange.setEnd(range.startContainer, range.startOffset);
        const preClean = preRange.toString().replace(/[\u200b\ufeff]/g, '');

        const sc = range.startContainer;
        const afterText =
          sc.nodeType === Node.TEXT_NODE ? (sc.nodeValue || '').slice(range.startOffset) : '';

        // 场景 1: 前面已有两个连续反引号（preClean 以 `` 结尾），敲击第 3 个反引号 -> 展开代码块！
        if (preClean.endsWith('``')) {
          document.execCommand('delete', false);
          document.execCommand('delete', false);

          ctx.pushVditorUndo();
          const lute = (instance as unknown as { vditor?: { lute?: { Md2VditorIRDOM: (md: string) => string } } }).vditor?.lute;
          if (lute && typeof lute.Md2VditorIRDOM === 'function') {
            const html = lute.Md2VditorIRDOM('```ts\n\n```\n');
            const tpl = document.createElement('template');
            tpl.innerHTML = html;
            const newCb = tpl.content.firstElementChild;
            if (newCb) {
              curBlock.replaceWith(newCb);
              setTimeout(() => {
                ctx.ensureCodeBlockInfoMarkers?.();
                const infoSpan = newCb.querySelector('.vditor-ir__marker--info') as HTMLElement | null;
                if (infoSpan) {
                  newCb.classList.add('vditor-ir__node--expand');
                  ctx.lastActiveInfoMarkerRef.current = infoSpan;
                  const r = document.createRange();
                  r.selectNodeContents(infoSpan);
                  r.collapse(false);
                  const s = window.getSelection();
                  s?.removeAllRanges();
                  s?.addRange(r);
                }
              }, 60);
              ctx.pushVditorUndo();
              ctx.onChangeValue(instance.getValue());
              return;
            }
          }

          instance.insertValue('```ts\n\n```\n');
          return;
        }

        // 场景 2: 如果光标紧邻反引号（前面以 ` 结尾，或后面以 ` 开头），只打单个反引号，不重复成对
        if (preClean.endsWith('`') || afterText.startsWith('`')) {
          if (afterText.startsWith('`') && !preClean.endsWith('`')) {
            const nextRange = document.createRange();
            nextRange.setStart(sc, range.startOffset + 1);
            nextRange.collapse(true);
            selNow.removeAllRanges();
            selNow.addRange(nextRange);
            return;
          }
          document.execCommand('insertText', false, '`');
          ctx.onChangeValue(instance.getValue());
          return;
        }

        // 场景 3: 独立空白处输入第 1 个反引号 -> 成对出现 `` 且光标居中
        document.execCommand('insertText', false, '``');
        const selAfter = window.getSelection();
        if (selAfter && selAfter.rangeCount > 0) {
          const r = selAfter.getRangeAt(0);
          const sc2 = r.startContainer;
          if (sc2.nodeType === Node.TEXT_NODE && r.startOffset > 0) {
            const nr = document.createRange();
            nr.setStart(sc2, r.startOffset - 1);
            nr.collapse(true);
            selAfter.removeAllRanges();
            selAfter.addRange(nr);
          }
        }
        ctx.onChangeValue(instance.getValue());
        return;
      }
    }
  }

  // ─── Bracket auto-pair (excluding backtick, handled above) ────────────────
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
