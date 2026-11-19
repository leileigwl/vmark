import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type Vditor from 'vditor';
import { filterSlashCommands, type SlashCommandItem } from './slashCommands';

export interface SlashMenuState {
  open: boolean;
  x: number;
  y: number;
  query: string;
  selectedIndex: number;
}

/** Updates slash menu open state & coordinates based on cursor text prefix. */
export function detectSlashCommandInEl(params: {
  el: HTMLElement;
  readOnly: boolean;
  slashStateRef: MutableRefObject<SlashMenuState>;
  setSlashState: Dispatch<SetStateAction<SlashMenuState>>;
}): void {
  const { el, readOnly, slashStateRef, setSlashState } = params;
  if (readOnly) return;

  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode || !el.contains(sel.anchorNode)) {
    if (slashStateRef.current.open) setSlashState((s) => ({ ...s, open: false }));
    return;
  }
  const anchorNode = sel.anchorNode;
  const anchorEl = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
  if (!anchorEl || anchorEl.closest('pre:not(.vditor-reset), code, .vditor-ir__marker--info')) {
    if (slashStateRef.current.open) setSlashState((s) => ({ ...s, open: false }));
    return;
  }
  if (anchorNode.nodeType !== Node.TEXT_NODE) {
    if (slashStateRef.current.open) setSlashState((s) => ({ ...s, open: false }));
    return;
  }
  const before = (anchorNode.nodeValue || '').slice(0, sel.anchorOffset).replace(/\u200b/g, '');
  const match = before.match(/(?:^|\s)\/([a-zA-Z0-9\u4e00-\u9fa5_-]{0,20})$/);
  if (!match) {
    if (slashStateRef.current.open) setSlashState((s) => ({ ...s, open: false }));
    return;
  }
  const r = document.createRange();
  const slashOffset = Math.max(0, sel.anchorOffset - match[0].trimStart().length);
  r.setStart(anchorNode, slashOffset);
  r.setEnd(anchorNode, Math.min(anchorNode.nodeValue?.length ?? sel.anchorOffset, slashOffset + 1));
  let rect = r.getBoundingClientRect();
  if (!rect || (rect.left === 0 && rect.bottom === 0)) {
    rect = sel.getRangeAt(0).getClientRects()[0] || anchorEl.getBoundingClientRect();
  }
  const x = rect.left || anchorEl.getBoundingClientRect().left || 80;
  const y = (rect.bottom || anchorEl.getBoundingClientRect().bottom || 120) + 6;
  setSlashState((prev) => ({
    open: true,
    x,
    y,
    query: match[1],
    selectedIndex: prev.query === match[1] ? prev.selectedIndex : 0,
  }));
}

/** Inserts the chosen slash command snippet, table size picker, or code block with language focus. */
export function applySlashCommandInEl(
  item: SlashCommandItem,
  ctx: {
    el: HTMLElement;
    instance: Vditor;
    setSlashState: Dispatch<SetStateAction<SlashMenuState>>;
    savedTableRangeRef: MutableRefObject<Range | null>;
    setTablePicker: Dispatch<SetStateAction<{ open: boolean; x: number; y: number }>>;
    ensureCodeBlockInfoMarkers: () => void;
    collapseExpandedCodeBlocks: (except?: Element | null) => void;
    lastActiveInfoMarkerRef: { current: HTMLElement | null };
  }
): void {
  const { el, instance, setSlashState, savedTableRangeRef, setTablePicker } = ctx;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.anchorNode?.nodeType === Node.TEXT_NODE) {
    const tNode = sel.anchorNode as Text;
    const raw = tNode.nodeValue || '';
    const before = raw.slice(0, sel.anchorOffset);
    const m = before.match(/\/[a-zA-Z0-9\u4e00-\u9fa5_-]{0,20}$/);
    if (m && m.index !== undefined) {
      const delRange = document.createRange();
      delRange.setStart(tNode, m.index);
      delRange.setEnd(tNode, sel.anchorOffset);
      delRange.deleteContents();
      sel.removeAllRanges();
      sel.addRange(delRange);
    }
  }
  setSlashState((s) => ({ ...s, open: false, query: '', selectedIndex: 0 }));

  const slashAnchorEl = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
  if (
    slashAnchorEl?.closest('table') &&
    ['table', 'code', 'quote', 'callout-tip', 'hr', 'mermaid', 'math'].includes(item.id)
  ) {
    return;
  }

  if (item.id === 'table') {
    savedTableRangeRef.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const placeholder = document.createElement('span');
      placeholder.id = 'vcat-table-placeholder';
      placeholder.style.display = 'none';
      range.insertNode(placeholder);
    }
    setTablePicker({ open: true, x: 0, y: 0 });
    return;
  }

  instance.focus();
  instance.insertValue(item.insertText);
  if (item.id === 'code') {
    const focusLanguageMarker = () => {
      ctx.ensureCodeBlockInfoMarkers();
      const selNow = window.getSelection();
      const anchorEl =
        selNow?.anchorNode instanceof Element ? selNow.anchorNode : selNow?.anchorNode?.parentElement;
      const cb =
        (anchorEl?.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null) ??
        (Array.from(el.querySelectorAll('.vditor-ir__node[data-type="code-block"]')).pop() as HTMLElement | null);
      const infoSpan = cb?.querySelector('.vditor-ir__marker--info') as HTMLElement | null;
      if (cb && infoSpan) {
        ctx.collapseExpandedCodeBlocks(cb);
        cb.classList.add('vditor-ir__node--expand');
        ctx.lastActiveInfoMarkerRef.current = infoSpan;
        const range = document.createRange();
        range.selectNodeContents(infoSpan);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(range);
      }
    };
    requestAnimationFrame(focusLanguageMarker);
    setTimeout(focusLanguageMarker, 60);
  } else if (item.id === 'ol' || item.id === 'ul' || item.id === 'task') {
    const placeCursorInListItem = () => {
      const selNow = window.getSelection();
      const anchor =
        selNow?.anchorNode instanceof Element ? selNow.anchorNode : selNow?.anchorNode?.parentElement;
      const li = anchor?.closest('li') as HTMLElement | null;
      if (li) {
        const pNode = li.querySelector('.vditor-ir__node[data-type="p"], p') ?? li;
        const range = document.createRange();
        range.selectNodeContents(pNode);
        range.collapse(false);
        selNow?.removeAllRanges();
        selNow?.addRange(range);
      }
    };
    requestAnimationFrame(placeCursorInListItem);
    setTimeout(placeCursorInListItem, 50);
  }
}

/** Handles keyboard navigation and selection when the slash menu is open. */
export function handleSlashMenuKeyDown(
  ev: KeyboardEvent,
  slashStateRef: MutableRefObject<SlashMenuState>,
  setSlashState: Dispatch<SetStateAction<SlashMenuState>>,
  applySlashCommand: (item: SlashCommandItem) => void
): boolean {
  if (ev.isComposing || ev.keyCode === 229) return false;
  const items = filterSlashCommands(slashStateRef.current.query);
  if (ev.key === 'Escape') {
    ev.preventDefault();
    ev.stopPropagation();
    setSlashState((s) => ({ ...s, open: false }));
    return true;
  }
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    ev.stopPropagation();
    if (items.length === 0) return true;
    const delta = ev.key === 'ArrowDown' ? 1 : -1;
    setSlashState((s) => ({
      ...s,
      selectedIndex: (s.selectedIndex + delta + items.length) % items.length,
    }));
    return true;
  }
  if (ev.key === 'Enter' || ev.key === 'Tab') {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    const chosen = items[slashStateRef.current.selectedIndex] ?? items[0];
    if (chosen) applySlashCommand(chosen);
    return true;
  }
  return false;
}
