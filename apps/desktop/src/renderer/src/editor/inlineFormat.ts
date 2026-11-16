export type InlineWrapCommand = 'bold' | 'italic' | 'strike' | 'inline-code';

const INLINE_SPECS: Record<
  InlineWrapCommand,
  { dataType: string; tag: string; altTag: string; marker: string; markerClass: string }
> = {
  bold: {
    dataType: 'strong',
    tag: 'strong',
    altTag: 'b',
    marker: '**',
    markerClass: 'vditor-ir__marker vditor-ir__marker--bi',
  },
  italic: {
    dataType: 'em',
    tag: 'em',
    altTag: 'i',
    marker: '*',
    markerClass: 'vditor-ir__marker vditor-ir__marker--bi',
  },
  strike: {
    dataType: 's',
    tag: 's',
    altTag: 'del',
    marker: '~~',
    markerClass: 'vditor-ir__marker',
  },
  'inline-code': {
    dataType: 'code',
    tag: 'code',
    altTag: 'code',
    marker: '`',
    markerClass: 'vditor-ir__marker',
  },
};

/**
 * Toggles bold/italic/strike/inline-code directly on Vditor IR DOM nodes
 * with table-cell clamping and clean unwrap without double-wrapping.
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

  const anchorCell = anchorEl?.closest('td, th') as HTMLElement | null;
  if (anchorCell && !anchorCell.contains(range.commonAncestorContainer)) {
    range.selectNodeContents(anchorCell);
  }

  // Never wrap/delete a heading's `#### ` marker when applying bold/italic/etc. inside H1-H6
  const headingEl =
    anchorEl?.closest('h1, h2, h3, h4, h5, h6') ??
    focusEl?.closest('h1, h2, h3, h4, h5, h6') ??
    null;
  if (headingEl) {
    const headingMarker = headingEl.querySelector('.vditor-ir__marker--heading');
    if (headingMarker && range.intersectsNode(headingMarker)) {
      range.setStartAfter(headingMarker);
    }
    if (!headingEl.contains(range.endContainer)) {
      range.setEnd(headingEl, headingEl.childNodes.length);
    }
  }

  const commonEl =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  let matchedEl =
    anchorEl?.closest(selector) ||
    focusEl?.closest(selector) ||
    commonEl?.closest(selector) ||
    null;

  if (!matchedEl && commonEl) {
    const candidates = Array.from(commonEl.querySelectorAll(selector));
    matchedEl = candidates.find((node) => range.intersectsNode(node)) ?? null;
  }

  if (matchedEl && containerEl.contains(matchedEl) && !matchedEl.closest('pre')) {
    pushUndo();
    const wrapperNode =
      matchedEl.closest(`span.vditor-ir__node[data-type="${spec.dataType}"]`) ?? matchedEl;
    const innerTag = wrapperNode.querySelector(`${spec.tag}, ${spec.altTag}`);
    const rawText = innerTag ? innerTag.textContent || '' : wrapperNode.textContent || '';
    const cleanText = rawText
      .replace(/^\*+|\*+$/g, '')
      .replace(/^~~|~~$/g, '')
      .replace(/^`|`$/g, '');
    const textNode = document.createTextNode(cleanText);
    wrapperNode.replaceWith(textNode);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(textNode);
    sel.removeAllRanges();
    sel.addRange(nextRange);
    pushUndo();
    commitMarkdown();
    return;
  }

  if (sel.isCollapsed) return;
  if (cmd === 'bold' && headingEl) {
    // Headings (H1-H6) are already bold; disallow adding extra **...** inside headings to protect structure
    return;
  }
  const selectedText = range.toString();
  if (!selectedText.trim()) return;

  pushUndo();

  const trimmedSel = selectedText.trim();
  if (
    (cmd === 'bold' && /^\*\*[\s\S]+\*\*$/.test(trimmedSel)) ||
    (cmd === 'italic' && /^\*[\s\S]+\*$/.test(trimmedSel))
  ) {
    const stripped = trimmedSel.replace(/^\*+|\*+$/g, '');
    const textNode = document.createTextNode(stripped);
    range.deleteContents();
    range.insertNode(textNode);
    const nextRange = document.createRange();
    nextRange.selectNodeContents(textNode);
    sel.removeAllRanges();
    sel.addRange(nextRange);
    pushUndo();
    commitMarkdown();
    return;
  }

  const leading = selectedText.match(/^\s*/)?.[0] ?? '';
  const trailing = selectedText.match(/\s*$/)?.[0] ?? '';
  const core = selectedText.trim().replace(/^\*+|\*+$/g, '');
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

  range.deleteContents();
  const frag = document.createDocumentFragment();
  if (leading) frag.appendChild(document.createTextNode(leading));
  frag.appendChild(irSpan);
  if (trailing) frag.appendChild(document.createTextNode(trailing));
  range.insertNode(frag);

  const nextRange = document.createRange();
  nextRange.selectNodeContents(contentEl);
  sel.removeAllRanges();
  sel.addRange(nextRange);
  pushUndo();
  commitMarkdown();
}
