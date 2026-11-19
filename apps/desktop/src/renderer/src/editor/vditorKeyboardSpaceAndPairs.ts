import { PAIR_MAP } from './editorHelpers';
import type { KeyboardCaptureContext } from './vditorKeyboard';

/** Handles immediate Space-triggered Markdown rendering (`1.`, `-`, `>`, `[]`, headings). */
export function handleSpaceMarkdownSpin(
  e: KeyboardEvent,
  ctx: KeyboardCaptureContext,
  isImeComposing: boolean
): boolean {
  if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isImeComposing) {
    return false;
  }
  const { el, instance } = ctx;
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false;

  const range = sel.getRangeAt(0);
  const sc = range.startContainer;
  const anchorEl = sc instanceof Element ? sc : sc.parentElement;
  if (!anchorEl || !el.contains(anchorEl) || anchorEl.closest('pre:not(.vditor-reset), code, .vditor-ir__marker--info, table')) {
    return false;
  }

  const curBlock =
    (anchorEl.closest('.vditor-ir__node, p, h1, h2, h3, h4, h5, h6, li') as HTMLElement | null) ??
    anchorEl;
  if (!curBlock || !el.contains(curBlock) || curBlock.classList.contains('vditor-reset')) {
    return false;
  }

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
    const matchQuote = !inQuote && preText === '>';
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
    if (!isHit) return false;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    ctx.pushVditorUndo();
    preRange.deleteContents();

    let mdToInsert = '';
    if (inQuote && matchOl) mdToInsert = `${matchOl[1]}. `;
    else if (inQuote && matchUl) mdToInsert = '- ';
    else if (matchNestedQuoteOl) mdToInsert = `> ${matchNestedQuoteOl[1]}. `;
    else if (matchNestedQuoteUl) mdToInsert = '> - ';
    else if (matchOl) mdToInsert = `${matchOl[1]}. `;
    else if (matchUl) mdToInsert = '- ';
    else if (matchQuote) mdToInsert = '> ';
    else if (matchTask) mdToInsert = '- [ ] ';
    else if (matchHeading) mdToInsert = `${matchHeading[1]} `;

    const v = (
      instance as unknown as {
        vditor?: { lute?: { SpinVditorIRDOM: (html: string) => string }; ir?: { element: HTMLElement } };
      }
    ).vditor;

    if (v?.lute?.SpinVditorIRDOM) {
      const textNode = document.createTextNode(mdToInsert);
      const wbrNode = document.createElement('wbr');
      preRange.insertNode(wbrNode);
      preRange.insertNode(textNode);

      const spinTarget = (curBlock.closest('blockquote') as HTMLElement | null) ?? curBlock;
      const spunHtml = v.lute.SpinVditorIRDOM(spinTarget.outerHTML);
      const temp = document.createElement('div');
      temp.innerHTML = spunHtml;
      const newNodes = Array.from(temp.childNodes);
      if (newNodes.length > 0) spinTarget.replaceWith(...newNodes);

      const resetContainer =
        el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset') ?? el;
      const wbr = resetContainer.querySelector('wbr');
      if (wbr && wbr.parentNode) {
        const newRange = document.createRange();
        const parent = wbr.parentNode as HTMLElement;
        const idx = Array.prototype.indexOf.call(parent.childNodes, wbr);
        wbr.remove();
        if (parent.tagName === 'LI' && parent.childNodes.length === 0) {
          parent.appendChild(document.createElement('br'));
        }
        newRange.setStart(parent, Math.min(idx, parent.childNodes.length));
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      if (!el.contains(document.activeElement)) instance.focus();
    } else {
      instance.focus();
      instance.insertValue(mdToInsert);
    }
    ctx.pushVditorUndo();
    ctx.onChangeValue(instance.getValue());
    return true;
  } catch (err) {
    console.error('[vcat] space-render error:', err);
    return false;
  }
}

/** Handles Delete/Backspace boundary guards and Enter navigation inside table cells. */
export function handleTableCellKeyDown(
  e: KeyboardEvent,
  ctx: KeyboardCaptureContext,
  isImeComposing: boolean
): boolean {
  const { el, instance } = ctx;
  const sel = window.getSelection();
  const anchorEl = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
  const activeCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;
  if (!activeCell || !el.contains(activeCell)) return false;

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
        return true;
      }
    }
    if (sel && sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const cellPreRange = document.createRange();
      cellPreRange.setStart(activeCell, 0);
      try { cellPreRange.setEnd(range.startContainer, range.startOffset); } catch { /* ignore */ }
      if (e.key === 'Backspace' && cellPreRange.toString().replace(/[\u200b\ufeff]/g, '').length === 0) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return true;
      }
      if (e.key === 'Delete') {
        const cellPostRange = document.createRange();
        try {
          cellPostRange.setStart(range.startContainer, range.startOffset);
          cellPostRange.setEnd(activeCell, activeCell.childNodes.length);
        } catch { /* ignore */ }
        if (cellPostRange.toString().replace(/[\u200b\ufeff]/g, '').length === 0) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return true;
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
    return true;
  }

  if ((e.metaKey || e.ctrlKey) && (e.shiftKey || e.altKey || e.key === 'Enter')) {
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  return false;
}

/** Handles bracket/quote auto-pairing and overtype jump for closing delimiters. */
export function handleBracketAutoPair(e: KeyboardEvent, ctx: KeyboardCaptureContext): void {
  if (
    !ctx.autoPairBrackets ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    (!PAIR_MAP[e.key] && !Object.values(PAIR_MAP).includes(e.key))
  ) {
    return;
  }
  const { el } = ctx;
  const selNow = window.getSelection();
  if (!selNow || selNow.rangeCount === 0) return;

  const range = selNow.getRangeAt(0);
  if (range.collapsed && Object.values(PAIR_MAP).includes(e.key)) {
    const sc = range.startContainer;
    let targetNode: Node | null = null;
    let targetOffset = 0;
    if (sc.nodeType === Node.TEXT_NODE) {
      const val = sc.nodeValue || '';
      if (val.slice(range.startOffset, range.startOffset + 1) === e.key) {
        targetNode = sc;
        targetOffset = range.startOffset + 1;
      } else if (
        range.startOffset === val.length &&
        sc.nextSibling?.nodeType === Node.TEXT_NODE &&
        (sc.nextSibling.nodeValue || '').startsWith(e.key)
      ) {
        targetNode = sc.nextSibling;
        targetOffset = 1;
      }
    }
    if (targetNode) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const nextRange = document.createRange();
      nextRange.setStart(targetNode, targetOffset);
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
      const textNode = document.createTextNode(`${e.key}${selectedText}${closeChar}`);
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
    ctx.onChangeValue(ctx.instance.getValue());
  }
}
