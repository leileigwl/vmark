import type { KeyboardCaptureContext } from './vditorKeyboard';

const INLINE_WRAP_TYPES = new Set(['strong', 'em', 's', 'code', 'code-span', 'mark', 'math-inline']);
const ZWSP_RE = /\u200b/g;

function findBoundaryInlineNode(
  container: Node,
  otherContainer: Node,
  resetEl: Element
): HTMLElement | null {
  let cur: Node | null = container;
  let outer: HTMLElement | null = null;
  while (cur && cur !== resetEl) {
    if (cur instanceof HTMLElement && cur.classList.contains('vditor-ir__node')) {
      const dt = cur.getAttribute('data-type') ?? '';
      if (INLINE_WRAP_TYPES.has(dt) && !cur.contains(otherContainer)) {
        outer = cur;
      }
    }
    cur = cur.parentNode;
  }
  return outer;
}

function getContentRange(node: HTMLElement): Range | null {
  const nonMarkers = Array.from(node.childNodes).filter(
    (c) => !(c instanceof Element && c.classList.contains('vditor-ir__marker'))
  );
  if (nonMarkers.length === 0) return null;
  const r = document.createRange();
  r.setStartBefore(nonMarkers[0]);
  r.setEndAfter(nonMarkers[nonMarkers.length - 1]);
  return r;
}

function measureContentOffsets(
  contentRange: Range,
  container: Node,
  offset: number
): { beforeLen: number; afterLen: number } {
  const fullLen = contentRange.toString().replace(ZWSP_RE, '').length;
  const cmp = contentRange.comparePoint(container, offset);
  if (cmp < 0) return { beforeLen: 0, afterLen: fullLen };
  if (cmp > 0) return { beforeLen: fullLen, afterLen: 0 };

  const pre = document.createRange();
  pre.setStart(contentRange.startContainer, contentRange.startOffset);
  pre.setEnd(container, offset);
  const beforeLen = pre.toString().replace(ZWSP_RE, '').length;

  const post = document.createRange();
  post.setStart(container, offset);
  post.setEnd(contentRange.endContainer, contentRange.endOffset);
  const afterLen = post.toString().replace(ZWSP_RE, '').length;
  return { beforeLen, afterLen };
}

type BoundaryAction =
  | { node: HTMLElement; mode: 'after' | 'before' }
  | { node: HTMLElement; mode: 'trim-tail'; contentRange: Range; cutContainer: Node; cutOffset: number }
  | { node: HTMLElement; mode: 'trim-head'; contentRange: Range; cutContainer: Node; cutOffset: number };

function planStartAction(node: HTMLElement, range: Range): BoundaryAction {
  const contentRange = getContentRange(node);
  if (!contentRange) return { node, mode: 'before' };
  const { beforeLen, afterLen } = measureContentOffsets(contentRange, range.startContainer, range.startOffset);
  if (afterLen === 0) return { node, mode: 'after' };
  if (beforeLen === 0) return { node, mode: 'before' };
  return {
    node,
    mode: 'trim-tail',
    contentRange,
    cutContainer: range.startContainer,
    cutOffset: range.startOffset,
  };
}

function planEndAction(node: HTMLElement, range: Range): BoundaryAction {
  const contentRange = getContentRange(node);
  if (!contentRange) return { node, mode: 'after' };
  const { beforeLen, afterLen } = measureContentOffsets(contentRange, range.endContainer, range.endOffset);
  if (beforeLen === 0) return { node, mode: 'before' };
  if (afterLen === 0) return { node, mode: 'after' };
  return {
    node,
    mode: 'trim-head',
    contentRange,
    cutContainer: range.endContainer,
    cutOffset: range.endOffset,
  };
}

/**
 * Protects Vditor IR inline markers (bold, italic, strike, inline code, math) when a
 * cross-boundary non-collapsed selection is deleted with Backspace/Delete. Without this,
 * deleting a range starting at the end of `` `dev` `` or inside `**bold**` deletes only
 * the hidden closing marker and leaves orphaned syntax markers behind.
 */
export function normalizeInlineRangeForDelete(
  e: KeyboardEvent,
  ctx: KeyboardCaptureContext,
  resetEl: Element,
  sel: Selection
): boolean {
  if (sel.isCollapsed || sel.rangeCount === 0) return false;
  const orig = sel.getRangeAt(0);
  const startNode = findBoundaryInlineNode(orig.startContainer, orig.endContainer, resetEl);
  const endNode = findBoundaryInlineNode(orig.endContainer, orig.startContainer, resetEl);
  if (!startNode && !endNode) return false;

  const startAction = startNode ? planStartAction(startNode, orig) : null;
  const endAction = endNode ? planEndAction(endNode, orig) : null;
  const needsTrim = startAction?.mode === 'trim-tail' || endAction?.mode === 'trim-head';
  if (needsTrim) ctx.pushVditorUndo();

  // Execute end trim before start trim; both nodes are disjoint so neither invalidates the other.
  if (endAction?.mode === 'trim-head') {
    const head = document.createRange();
    head.setStart(endAction.contentRange.startContainer, endAction.contentRange.startOffset);
    head.setEnd(endAction.cutContainer, endAction.cutOffset);
    head.deleteContents();
  }
  if (startAction?.mode === 'trim-tail') {
    const tail = document.createRange();
    tail.setStart(startAction.cutContainer, startAction.cutOffset);
    tail.setEnd(startAction.contentRange.endContainer, startAction.contentRange.endOffset);
    tail.deleteContents();
  }

  const next = document.createRange();
  if (!startAction) {
    next.setStart(orig.startContainer, orig.startOffset);
  } else if (startAction.mode === 'before') {
    next.setStartBefore(startAction.node);
  } else {
    next.setStartAfter(startAction.node);
  }

  if (!endAction) {
    next.setEnd(orig.endContainer, orig.endOffset);
  } else if (endAction.mode === 'after') {
    next.setEndAfter(endAction.node);
  } else {
    next.setEndBefore(endAction.node);
  }

  sel.removeAllRanges();
  sel.addRange(next);

  if (next.collapsed) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    ctx.pushVditorUndo();
    ctx.onChangeValue(ctx.instance.getValue());
    return true;
  }

  return false;
}
