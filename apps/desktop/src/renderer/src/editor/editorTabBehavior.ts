import { prepareListIndent, prepareListOutdent } from './listOutdentCaret';
import type { KeyboardCaptureContext } from './vditorKeyboard';

function stopEvent(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

interface VditorUndoState {
  undoStack: Array<Array<{ diffs: Array<[number, string]> }>>;
  redoStack: unknown[];
  lastText: string;
}

interface VditorUndoInternals {
  currentMode?: string;
  undo?: Record<string, unknown> & { recordFirstPosition?: (v: unknown, ev: KeyboardEvent) => void };
}

/**
 * Tab / Shift+Tab on a list item moves the caret to the item start so Vditor indents the item.
 * When this is the first edit since the file was opened, Vditor's own keydown handler then
 * remembers that moved caret as the "before" position and undo lands at the item start.
 * Record the user's real caret now, and put it back once Vditor's handler has run (a bubble
 * listener on window runs after it in the same dispatch), before the debounced snapshot.
 */
function keepUndoFirstPosition(ctx: KeyboardCaptureContext, e: KeyboardEvent): void {
  const vditor = (ctx.instance as unknown as { vditor?: VditorUndoInternals }).vditor;
  const undo = vditor?.undo;
  if (!vditor || !undo?.recordFirstPosition || !vditor.currentMode) return;
  const state = undo[vditor.currentMode] as VditorUndoState | undefined;
  if (!state || state.undoStack.length !== 1) return;
  undo.recordFirstPosition(vditor, e);
  const first = state.lastText;
  if (!first.includes('<wbr>')) return;
  let done = false;
  const restore = (): void => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', restore);
    const head = state.undoStack[0]?.[0]?.diffs?.[0];
    if (state.undoStack.length !== 1 || state.redoStack.length > 0 || !head) return;
    if (head[1].replace('<wbr>', '') !== first.replace('<wbr>', '')) return;
    head[1] = first;
    state.lastText = first;
  };
  window.addEventListener('keydown', restore);
  setTimeout(restore, 0);
}

function moveToTableCell(cell: HTMLTableCellElement, backward: boolean): void {
  const table = cell.closest('table');
  const sel = window.getSelection();
  if (!table || !sel) return;
  const cells = Array.from(table.querySelectorAll('th, td')) as HTMLTableCellElement[];
  const idx = cells.indexOf(cell);
  if (idx === -1) return;
  const next = cells[idx + (backward ? -1 : 1)];
  if (!next) return;
  const range = document.createRange();
  range.selectNodeContents(next);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertTwoSpaces(ctx: KeyboardCaptureContext): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  ctx.pushVditorUndo();
  range.deleteContents();
  const textNode = document.createTextNode('  ');
  range.insertNode(textNode);
  const nextRange = document.createRange();
  nextRange.setStart(textNode, 2);
  nextRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nextRange);
  ctx.pushVditorUndo();
  ctx.onChangeValue(ctx.instance.getValue());
}

/**
 * 统一处理编辑器正文中的 Tab / Shift+Tab（代码块已在上游 codeBlockIndent 中单独处理）：
 * - 表格单元格：Tab 跳至下一格，Shift+Tab 跳至上一格，首尾边界停在原地。
 * - 列表项：Tab 在有前一项时缩进为子列表（无前一项拦截）；Shift+Tab 对二级及以上反缩进，一级拦截。
 * - 普通正文段落：Tab 插入 2 个普通空格（不插大制表符），Shift+Tab 拦截保持焦距不跑出编辑器。
 */
export function handleEditorTabKey(e: KeyboardEvent, ctx: KeyboardCaptureContext): boolean {
  if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return false;
  const { el } = ctx;
  const sel = window.getSelection();
  const anchorEl = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
  if (!anchorEl || !el.contains(anchorEl)) return false;

  const cell = anchorEl.closest('td, th') as HTMLTableCellElement | null;
  if (cell && el.contains(cell)) {
    stopEvent(e);
    moveToTableCell(cell, e.shiftKey);
    return true;
  }

  const li = anchorEl.closest('li') as HTMLElement | null;
  if (li && el.contains(li)) {
    if (e.shiftKey) {
      if (li.parentElement?.closest('li')) keepUndoFirstPosition(ctx, e);
      if (li.parentElement?.closest('li') && prepareListOutdent(e, el)) {
        return true;
      }
      stopEvent(e);
      return true;
    }
    const prevLi = li.previousElementSibling;
    if (prevLi?.tagName === 'LI') keepUndoFirstPosition(ctx, e);
    if (prevLi?.tagName === 'LI' && prepareListIndent(li)) {
      return true;
    }
    stopEvent(e);
    return true;
  }

  stopEvent(e);
  if (!e.shiftKey) {
    insertTwoSpaces(ctx);
  }
  return true;
}
