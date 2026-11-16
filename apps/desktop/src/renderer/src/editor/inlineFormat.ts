export type InlineWrapCommand = 'bold' | 'italic' | 'strike' | 'inline-code';

interface InlineSpec {
  dataType: string;
  tag: string;
  altTag: string;
  marker: string;
  markerClass: string;
  stripRegex: RegExp;
}

const INLINE_SPECS: Record<InlineWrapCommand, InlineSpec> = {
  bold: {
    dataType: 'strong',
    tag: 'strong',
    altTag: 'b',
    marker: '**',
    markerClass: 'vditor-ir__marker vditor-ir__marker--bi',
    stripRegex: /\*{2,}/g,
  },
  italic: {
    dataType: 'em',
    tag: 'em',
    altTag: 'i',
    marker: '*',
    markerClass: 'vditor-ir__marker vditor-ir__marker--bi',
    stripRegex: /(?<!\*)\*(?!\*)/g,
  },
  strike: {
    dataType: 's',
    tag: 's',
    altTag: 'del',
    marker: '~~',
    markerClass: 'vditor-ir__marker',
    stripRegex: /~~+/g,
  },
  'inline-code': {
    dataType: 'code',
    tag: 'code',
    altTag: 'code',
    marker: '`',
    markerClass: 'vditor-ir__marker',
    stripRegex: /`+/g,
  },
};

const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, td, th';
const CODE_CONTEXT = 'pre:not(.vditor-reset), .vditor-ir__node[data-type="code-block"], .vditor-ir__marker--info';
const INLINE_IR_NODE = 'span.vditor-ir__node[data-type="strong"], span.vditor-ir__node[data-type="em"], span.vditor-ir__node[data-type="s"], span.vditor-ir__node[data-type="code"]';

function findOuterInlineWrapper(
  node: Node | null,
  selector: string,
  containerEl: HTMLElement
): HTMLElement | null {
  const el = node instanceof Element ? node : node?.parentElement;
  if (!el) return null;
  const hit = el.closest(selector) as HTMLElement | null;
  if (!hit || !containerEl.contains(hit) || hit.closest('pre:not(.vditor-reset)')) return null;
  return hit;
}

/**
 * Removes ONLY the target command's IR wrappers & syntax markers inside `frag`
 * while preserving other inline formatting nodes (e.g. keeps **bold** when toggling *italic*).
 */
function stripTargetWrappersInFragment(
  frag: DocumentFragment,
  selector: string,
  spec: InlineSpec
): void {
  // Unwrap matching inline IR nodes from innermost/outermost cleanly
  let guard = 0;
  while (guard++ < 20) {
    const node = frag.querySelector(selector) as HTMLElement | null;
    if (!node) break;
    const irNode = node.closest(`span.vditor-ir__node[data-type="${spec.dataType}"]`) as HTMLElement | null;
    const targetNode = irNode ?? node;
    const innerContent = irNode
      ? irNode.querySelector(`${spec.tag}, ${spec.altTag}`)
      : targetNode;
    const replacementFrag = document.createDocumentFragment();
    if (innerContent) {
      while (innerContent.firstChild) {
        replacementFrag.appendChild(innerContent.firstChild);
      }
    }
    targetNode.replaceWith(replacementFrag);
  }

  // Strip literal marker text nodes for this command only
  const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
  let t = walker.nextNode() as Text | null;
  while (t) {
    if (t.nodeValue) {
      t.nodeValue = t.nodeValue.replace(/\u200b/g, '').replace(spec.stripRegex, '');
    }
    t = walker.nextNode() as Text | null;
  }
}

function hasUnformattedTextOutsideWrappers(
  frag: DocumentFragment,
  selector: string,
  spec: InlineSpec
): boolean {
  const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
  let cur = walker.nextNode() as Text | null;
  while (cur) {
    if (!cur.parentElement?.closest(selector)) {
      const stripped = (cur.nodeValue || '')
        .replace(/\u200b/g, '')
        .replace(spec.stripRegex, '')
        .trim();
      if (stripped.length > 0) {
        return true;
      }
    }
    cur = walker.nextNode() as Text | null;
  }
  return false;
}

function stripAdjacentMarkerBoundary(range: Range, spec: InlineSpec): void {
  if (spec.dataType !== 'strong' && spec.dataType !== 'em') return;
  const stripEnd = (str: string) =>
    spec.dataType === 'strong' ? str.replace(/\*{2,}$/, '') : str.replace(/(?<!\*)\*$/, '');
  const stripStart = (str: string) =>
    spec.dataType === 'strong' ? str.replace(/^\*{2,}/, '') : str.replace(/^\*(?!\*)/, '');

  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const t = range.startContainer as Text;
    const head = (t.nodeValue || '').slice(0, range.startOffset);
    const cleanedHead = stripEnd(head);
    if (cleanedHead !== head) {
      const tail = (t.nodeValue || '').slice(range.startOffset);
      t.nodeValue = cleanedHead + tail;
      range.setStart(t, cleanedHead.length);
    } else if (range.startOffset === 0 && t.previousSibling?.nodeType === Node.TEXT_NODE && t.previousSibling.nodeValue) {
      t.previousSibling.nodeValue = stripEnd(t.previousSibling.nodeValue);
    }
  }
  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const t = range.endContainer as Text;
    const tail = (t.nodeValue || '').slice(range.endOffset);
    const cleanedTail = stripStart(tail);
    if (cleanedTail !== tail) {
      const head = (t.nodeValue || '').slice(0, range.endOffset);
      t.nodeValue = head + cleanedTail;
    } else if (range.endOffset === (t.nodeValue || '').length && t.nextSibling?.nodeType === Node.TEXT_NODE && t.nextSibling.nodeValue) {
      t.nextSibling.nodeValue = stripStart(t.nextSibling.nodeValue);
    }
  }
}

function expandRangeToEnclosingWrappers(
  range: Range,
  selector: string,
  containerEl: HTMLElement
): void {
  const startWrapper = findOuterInlineWrapper(range.startContainer, selector, containerEl);
  const endWrapper = findOuterInlineWrapper(range.endContainer, selector, containerEl);
  if (startWrapper && startWrapper.parentNode) {
    const topStart = startWrapper.closest(INLINE_IR_NODE) ?? startWrapper;
    if (topStart.parentNode && containerEl.contains(topStart)) {
      range.setStartBefore(topStart);
    }
  }
  if (endWrapper && endWrapper.parentNode) {
    const topEnd = endWrapper.closest(INLINE_IR_NODE) ?? endWrapper;
    if (topEnd.parentNode && containerEl.contains(topEnd)) {
      range.setEndAfter(topEnd);
    }
  }
}

function isRangeFullyWrapped(
  range: Range,
  cmd: InlineWrapCommand,
  selector: string,
  spec: InlineSpec
): boolean {
  const rawSelected = range.toString();
  const trimmedRaw = rawSelected.trim();
  if (!trimmedRaw) return false;

  if (
    (cmd === 'bold' && /^\*\*[^*]+[\s\S]*\*\*$/.test(trimmedRaw) && !trimmedRaw.slice(2, -2).includes('**')) ||
    (cmd === 'italic' && /^\*[^*]+\*$/.test(trimmedRaw)) ||
    (cmd === 'strike' && /^~~[\s\S]+~~$/.test(trimmedRaw) && !trimmedRaw.slice(2, -2).includes('~~')) ||
    (cmd === 'inline-code' && /^`[^`]+`$/.test(trimmedRaw))
  ) {
    return true;
  }

  const frag = range.cloneContents();
  const wrapperNodes = Array.from(frag.querySelectorAll(selector));
  return wrapperNodes.length > 0 && !hasUnformattedTextOutsideWrappers(frag, selector, spec);
}

function toggleSingleRange(
  containerEl: HTMLElement,
  range: Range,
  cmd: InlineWrapCommand,
  spec: InlineSpec,
  selector: string,
  forceUnwrap?: boolean
): Node | null {
  // Expand to ANY enclosing inline IR node so we never bisect a **strong** or *em* node
  expandRangeToEnclosingWrappers(range, `${selector}, ${INLINE_IR_NODE}`, containerEl);
  if (range.collapsed) return null;

  const rawSelected = range.toString();
  if (!rawSelected.trim()) return null;

  if (
    cmd === 'bold' &&
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    const tNode = range.startContainer as Text;
    const fullStr = tNode.nodeValue || '';
    const before = fullStr.slice(0, range.startOffset);
    const after = fullStr.slice(range.endOffset);
    if (/\*{2,}$/.test(before) && /^\*{2,}/.test(after)) {
      const cleanBefore = before.replace(/\*{2,}$/, '');
      const cleanAfter = after.replace(/^\*{2,}/, '');
      const mid = rawSelected.replace(spec.stripRegex, '');
      tNode.nodeValue = `${cleanBefore}${mid}${cleanAfter}`;
      const r = document.createRange();
      r.setStart(tNode, cleanBefore.length);
      r.setEnd(tNode, cleanBefore.length + mid.length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      return tNode;
    }
  }

  const shouldUnwrap = forceUnwrap ?? isRangeFullyWrapped(range, cmd, selector, spec);

  stripAdjacentMarkerBoundary(range, spec);
  const extracted = range.extractContents();
  stripTargetWrappersInFragment(extracted, selector, spec);

  if (!(extracted.textContent || '').trim()) return null;

  if (shouldUnwrap) {
    const nodes = Array.from(extracted.childNodes);
    const parent = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentNode
      : range.startContainer;
    range.insertNode(extracted);
    if (nodes.length === 1) return nodes[0];
    if (parent && nodes.length > 1) return nodes[0];
    return null;
  }

  const irSpan = document.createElement('span');
  irSpan.setAttribute('data-type', spec.dataType);
  irSpan.className = 'vditor-ir__node';

  const openMarker = document.createElement('span');
  openMarker.className = spec.markerClass;
  openMarker.textContent = spec.marker;

  const contentEl = document.createElement(spec.tag);
  contentEl.setAttribute('data-newline', '1');
  contentEl.appendChild(extracted);

  const closeMarker = document.createElement('span');
  closeMarker.className = spec.markerClass;
  closeMarker.textContent = spec.marker;

  irSpan.append(openMarker, contentEl, closeMarker);
  range.insertNode(irSpan);

  return contentEl;
}

/**
 * Toggles bold/italic/strike/inline-code directly on Vditor IR DOM nodes
 * with code-block protection, composable bold+italic, per-block multi-line support, and strict binary toggling.
 */
export function toggleInlineWrapInEditor(
  containerEl: HTMLElement,
  cmd: InlineWrapCommand,
  pushUndo: () => void,
  commitMarkdown: () => void
): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const spec = INLINE_SPECS[cmd];
  const selector = `span.vditor-ir__node[data-type="${spec.dataType}"], ${spec.tag}, ${spec.altTag}`;
  const range = sel.getRangeAt(0);
  const anchorEl =
    sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
  const focusEl =
    sel.focusNode instanceof Element ? sel.focusNode : sel.focusNode?.parentElement;
  const commonEl =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  if (anchorEl?.closest(CODE_CONTEXT) || focusEl?.closest(CODE_CONTEXT) || commonEl?.closest(CODE_CONTEXT)) {
    return;
  }

  const anchorCell = anchorEl?.closest('td, th') as HTMLElement | null;
  if (anchorCell && !anchorCell.contains(range.commonAncestorContainer)) {
    range.selectNodeContents(anchorCell);
  }

  const startEl =
    range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const endEl =
    range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
  const startBlock = startEl?.closest(BLOCK_SELECTOR) as HTMLElement | null;
  const endBlock = endEl?.closest(BLOCK_SELECTOR) as HTMLElement | null;

  if (
    !range.collapsed &&
    startBlock &&
    endBlock &&
    startBlock !== endBlock &&
    containerEl.contains(startBlock) &&
    containerEl.contains(endBlock)
  ) {
    const blocks = Array.from(containerEl.querySelectorAll(BLOCK_SELECTOR)).filter((b) => {
      if (b.closest(CODE_CONTEXT)) return false;
      if (cmd === 'bold' && /^H[1-6]$/.test(b.tagName)) return false;
      return range.intersectsNode(b);
    }) as HTMLElement[];

    const subRanges: Range[] = [];
    for (const blk of blocks) {
      const sub = document.createRange();
      if (blk === startBlock) {
        sub.setStart(range.startContainer, range.startOffset);
      } else {
        sub.setStart(blk, 0);
      }
      if (blk === endBlock) {
        sub.setEnd(range.endContainer, range.endOffset);
      } else {
        sub.setEnd(blk, blk.childNodes.length);
      }
      if (/^H[1-6]$/.test(blk.tagName)) {
        const headingMarker = blk.querySelector('.vditor-ir__marker--heading');
        if (headingMarker && sub.intersectsNode(headingMarker)) {
          sub.setStartAfter(headingMarker);
        }
      }
      expandRangeToEnclosingWrappers(sub, `${selector}, ${INLINE_IR_NODE}`, containerEl);
      if (sub.toString().trim()) {
        subRanges.push(sub);
      }
    }
    if (subRanges.length === 0) return;

    const allWrapped = subRanges.every((sr) => isRangeFullyWrapped(sr, cmd, selector, spec));

    pushUndo();
    const resultNodes: Node[] = [];
    for (const sr of subRanges) {
      const out = toggleSingleRange(containerEl, sr, cmd, spec, selector, allWrapped);
      if (out) resultNodes.push(out);
    }
    if (resultNodes.length > 0) {
      const finalRange = document.createRange();
      finalRange.setStart(resultNodes[0], 0);
      const last = resultNodes[resultNodes.length - 1];
      finalRange.setEnd(last, last.nodeType === Node.TEXT_NODE ? (last.nodeValue || '').length : last.childNodes.length);
      sel.removeAllRanges();
      sel.addRange(finalRange);
    }
    pushUndo();
    commitMarkdown();
    return;
  }

  const headingEl =
    anchorEl?.closest('h1, h2, h3, h4, h5, h6') ??
    focusEl?.closest('h1, h2, h3, h4, h5, h6') ??
    null;
  if (headingEl) {
    if (cmd === 'bold') return;
    const headingMarker = headingEl.querySelector('.vditor-ir__marker--heading');
    if (headingMarker && range.intersectsNode(headingMarker)) {
      range.setStartAfter(headingMarker);
    }
    if (!headingEl.contains(range.endContainer)) {
      range.setEnd(headingEl, headingEl.childNodes.length);
    }
  }

  pushUndo();
  const resultNode = toggleSingleRange(containerEl, range, cmd, spec, selector);
  if (!resultNode) return;

  const nextRange = document.createRange();
  nextRange.selectNodeContents(resultNode);
  sel.removeAllRanges();
  sel.addRange(nextRange);
  pushUndo();
  commitMarkdown();
}
