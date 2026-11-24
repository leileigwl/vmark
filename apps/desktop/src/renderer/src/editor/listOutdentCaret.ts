/**
 * Shift+Tab outdent for nested list items wherever the caret is.
 *
 * Why: Vditor only outdents a list item when the caret sits on its first
 * character (`fixList` in vditor/util/fixBrowserBehavior). With the caret
 * anywhere else Shift+Tab silently does nothing. We move the caret to the item
 * start before Vditor's own keydown listener runs, let Vditor do the outdent
 * (so its DOM, undo stack and markdown output stay the single source of truth),
 * then put the caret back at the same character of the item text.
 */

const ZWSP = /\u200b/g;

/** Text nodes that belong to `li` itself (not to a nested list inside it). */
function ownTextNodes(li: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const nested = n.parentElement?.closest('ul, ol');
      return nested && li.contains(nested) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

/** Caret offset in the item's own text, ignoring zero-width spaces; -1 when the caret is not in it. */
function caretTextOffset(nodes: Text[], container: Node, offset: number): number {
  let total = 0;
  for (const t of nodes) {
    const v = t.nodeValue ?? '';
    if (t === container) return total + v.slice(0, offset).replace(ZWSP, '').length;
    total += v.replace(ZWSP, '').length;
  }
  return -1;
}

function placeCaret(node: Node, offset: number): void {
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

/** Sets the caret `target` visible characters into the item that holds the caret now. */
function restoreCaret(target: number): void {
  const sel = window.getSelection();
  const anchor = sel?.anchorNode;
  const li = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('li') as HTMLElement | null;
  if (!li) return;
  let left = target;
  for (const t of ownTextNodes(li)) {
    const v = t.nodeValue ?? '';
    for (let i = 0; i <= v.length; i++) {
      if (left === 0 && (i === v.length || v[i] !== '\u200b')) return placeCaret(t, i);
      if (i < v.length && v[i] !== '\u200b') left -= 1;
    }
  }
}

/**
 * Handles Shift+Tab with a collapsed caret inside a nested list item that is not
 * on its first character. Returns true when it prepared the outdent; the event is
 * left to Vditor (not prevented) so Vditor performs the actual outdent.
 */
export function prepareListOutdent(e: KeyboardEvent, root: HTMLElement): boolean {
  if (e.key !== 'Tab' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const start = range.startContainer;
  const li = (start instanceof Element ? start : start.parentElement)?.closest('li') as HTMLElement | null;
  if (!li || !root.contains(li) || !li.parentElement?.closest('li')) return false;
  const nodes = ownTextNodes(li);
  const first = nodes[0];
  if (!first) return false;
  const offset = caretTextOffset(nodes, start, range.startOffset);
  if (offset <= 0) return false; // already at the start (Vditor handles it) or caret outside the item text
  const prev = first.previousSibling;
  const isTask = li.classList.contains('vditor-task') && prev instanceof HTMLInputElement;
  // Vditor's "first character" test: text node offset 0 without a previous sibling, or offset 1 after a task checkbox.
  if (!isTask && prev) return false;
  placeCaret(first, isTask ? 1 : 0);
  restoreAfterVditor(offset);
  return true;
}

/**
 * Puts the caret back once Vditor's own keydown listener (on the editor element,
 * bubble phase) has outdented the item: a bubble-phase listener on `window` runs
 * after it within the same dispatch, so the very next keystroke already lands at
 * the original character. The timeout only covers a dispatch whose propagation
 * was stopped before reaching `window`.
 */
function restoreAfterVditor(offset: number): void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', run);
    restoreCaret(offset);
  };
  window.addEventListener('keydown', run);
  setTimeout(run, 0);
}
