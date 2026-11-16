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
    stripRegex: /\*+/g,
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

function extractCleanText(frag: DocumentFragment, spec: InlineSpec): string {
  const clone = frag.cloneNode(true) as DocumentFragment;
  // Remove IR marker spans that represent the target syntax markers (e.g. **, ~~, `)
  clone.querySelectorAll('.vditor-ir__marker').forEach((m) => {
    const txt = (m.textContent || '').trim();
    if (
      (spec.dataType === 'strong' && /^\*{2,}$/.test(txt)) ||
      (spec.dataType === 'em' && /^\*+$/.test(txt)) ||
      (spec.dataType === 's' && /^~~+$/.test(txt)) ||
      (spec.dataType === 'code' && /^`+$/.test(txt))
    ) {
      m.remove();
    }
  });
  return (clone.textContent || '')
    .replace(/\u200b/g, '')
    .replace(spec.stripRegex, '');
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
  const checkBefore = (node: Node | null) => {
    if (node && node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      node.nodeValue = node.nodeValue.replace(/\*+$/, '');
    }
  };
  const checkAfter = (node: Node | null) => {
    if (node && node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      node.nodeValue = node.nodeValue.replace(/^\*+/, '');
    }
  };
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const t = range.startContainer as Text;
    const head = (t.nodeValue || '').slice(0, range.startOffset);
    if (/\*+$/.test(head)) {
      const cleanedHead = head.replace(/\*+$/, '');
      const tail = (t.nodeValue || '').slice(range.startOffset);
      t.nodeValue = cleanedHead + tail;
      range.setStart(t, cleanedHead.length);
    } else if (range.startOffset === 0) {
      checkBefore(t.previousSibling);
    }
  }
  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const t = range.endContainer as Text;
    const tail = (t.nodeValue || '').slice(range.endOffset);
    if (/^\*+/.test(tail)) {
      const cleanedTail = tail.replace(/^\*+/, '');
      const head = (t.nodeValue || '').slice(0, range.endOffset);
      t.nodeValue = head + cleanedTail;
    } else if (range.endOffset === (t.nodeValue || '').length) {
      checkAfter(t.nextSibling);
    }
  }
}

/**
 * Toggles bold/italic/strike/inline-code directly on Vditor IR DOM nodes
 * with code-block protection, clean nested-bold normalization, and strict binary toggling.
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

  // Never allow inline formatting inside fenced code blocks or code language badges
  const codeContext = 'pre:not(.vditor-reset), .vditor-ir__node[data-type="code-block"], .vditor-ir__marker--info';
  if (anchorEl?.closest(codeContext) || focusEl?.closest(codeContext) || commonEl?.closest(codeContext)) {
    return;
  }

  const anchorCell = anchorEl?.closest('td, th') as HTMLElement | null;
  if (anchorCell && !anchorCell.contains(range.commonAncestorContainer)) {
    range.selectNodeContents(anchorCell);
  }

  // Never wrap/delete a heading's `#### ` marker; also disallow bold inside H1-H6
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

  // Expand selection boundaries to full enclosing target IR nodes so partial selection never leaves dangling **
  const startWrapper = findOuterInlineWrapper(range.startContainer, selector, containerEl);
  const endWrapper = findOuterInlineWrapper(range.endContainer, selector, containerEl);
  if (startWrapper) {
    const outerStart =
      startWrapper.closest(`span.vditor-ir__node[data-type="${spec.dataType}"]`) ?? startWrapper;
    range.setStartBefore(outerStart);
  }
  if (endWrapper) {
    const outerEnd =
      endWrapper.closest(`span.vditor-ir__node[data-type="${spec.dataType}"]`) ?? endWrapper;
    range.setEndAfter(outerEnd);
  }

  if (range.collapsed) return;

  const rawSelected = range.toString();
  if (!rawSelected.trim()) return;

  // Check if plain text within one Text node is directly flanked by **...** (e.g. legacy marker residue)
  if (
    cmd === 'bold' &&
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    const tNode = range.startContainer as Text;
    const fullStr = tNode.nodeValue || '';
    const before = fullStr.slice(0, range.startOffset);
    const after = fullStr.slice(range.endOffset);
    if (/\*+$/.test(before) && /^\*+/.test(after)) {
      pushUndo();
      const cleanBefore = before.replace(/\*+$/, '');
      const cleanAfter = after.replace(/^\*+/, '');
      const mid = rawSelected.replace(spec.stripRegex, '');
      tNode.nodeValue = `${cleanBefore}${mid}${cleanAfter}`;
      const nextRange = document.createRange();
      nextRange.setStart(tNode, cleanBefore.length);
      nextRange.setEnd(tNode, cleanBefore.length + mid.length);
      sel.removeAllRanges();
      sel.addRange(nextRange);
      pushUndo();
      commitMarkdown();
      return;
    }
  }

  const frag = range.cloneContents();
  const wrapperNodes = Array.from(frag.querySelectorAll(selector));
  const cleanText = extractCleanText(frag, spec);
  if (!cleanText.trim()) return;

  const trimmedRaw = rawSelected.trim();
  const isLiteralWrapped =
    (cmd === 'bold' && /^\*\*[^*]+[\s\S]*\*\*$/.test(trimmedRaw) && !trimmedRaw.slice(2, -2).includes('**')) ||
    (cmd === 'italic' && /^\*[^*]+\*$/.test(trimmedRaw)) ||
    (cmd === 'strike' && /^~~[\s\S]+~~$/.test(trimmedRaw) && !trimmedRaw.slice(2, -2).includes('~~')) ||
    (cmd === 'inline-code' && /^`[^`]+`$/.test(trimmedRaw));

  const isFullyWrapped =
    isLiteralWrapped ||
    (wrapperNodes.length > 0 && !hasUnformattedTextOutsideWrappers(frag, selector, spec));

  pushUndo();
  stripAdjacentMarkerBoundary(range, spec);
  range.deleteContents();

  if (isFullyWrapped) {
    const textNode = document.createTextNode(cleanText);
    range.insertNode(textNode);
    const nextRange = document.createRange();
    nextRange.selectNodeContents(textNode);
    sel.removeAllRanges();
    sel.addRange(nextRange);
    pushUndo();
    commitMarkdown();
    return;
  }

  // Merge mixed / partial bold selections cleanly into a single wrapper node without stray ** markers
  const leading = cleanText.match(/^\s*/)?.[0] ?? '';
  const trailing = cleanText.match(/\s*$/)?.[0] ?? '';
  const core = cleanText.trim();
  if (!core) return;

  const irSpan = document.createElement('span');
  irSpan.setAttribute('data-type', spec.dataType);
  irSpan.className = 'vditor-ir__node';

  const openMarker = document.createElement('span');
  openMarker.className = spec.markerClass;
  openMarker.textContent = spec.marker;

  const contentEl = document.createElement(spec.tag);
  contentEl.setAttribute('data-newline', '1');
  contentEl.textContent = core;

  const closeMarker = document.createElement('span');
  closeMarker.className = spec.markerClass;
  closeMarker.textContent = spec.marker;

  irSpan.append(openMarker, contentEl, closeMarker);

  const outFrag = document.createDocumentFragment();
  if (leading) outFrag.appendChild(document.createTextNode(leading));
  outFrag.appendChild(irSpan);
  if (trailing) outFrag.appendChild(document.createTextNode(trailing));
  range.insertNode(outFrag);

  const nextRange = document.createRange();
  nextRange.selectNodeContents(contentEl);
  sel.removeAllRanges();
  sel.addRange(nextRange);
  pushUndo();
  commitMarkdown();
}
