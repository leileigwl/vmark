const FOUR_SPACE_LANGS = new Set(['python', 'py', 'rust', 'rs', 'java', 'c', 'cpp', 'csharp', 'cs', 'php', 'sql']);

export function getCodeIndentUnit(lang: string): string {
  return FOUR_SPACE_LANGS.has(lang.toLowerCase()) ? '    ' : '  ';
}

/**
 * Handles Tab, Shift+Tab, and Enter auto-indentation inside a Vditor code block `<code>` element.
 * Returns true if the event was handled and prevented.
 */
export function handleCodeBlockIndentKey(
  e: KeyboardEvent,
  codeEl: HTMLElement,
  lang: string
): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !codeEl.contains(sel.anchorNode)) return false;

  const indentUnit = getCodeIndentUnit(lang);
  const range = sel.getRangeAt(0);

  // Measure character offsets from start of codeEl
  const preStart = document.createRange();
  preStart.selectNodeContents(codeEl);
  preStart.setEnd(range.startContainer, range.startOffset);
  const startOffset = preStart.toString().length;

  const preEnd = document.createRange();
  preEnd.selectNodeContents(codeEl);
  preEnd.setEnd(range.endContainer, range.endOffset);
  const endOffset = preEnd.toString().length;

  const fullText = codeEl.textContent || '';

  const setCaretRange = (newStart: number, newEnd: number) => {
    const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    let pos = 0;
    let sNode: Text | null = null;
    let sOff = 0;
    let eNode: Text | null = null;
    let eOff = 0;

    while (node) {
      const len = node.nodeValue?.length ?? 0;
      if (!sNode && pos + len >= newStart) {
        sNode = node;
        sOff = Math.max(0, newStart - pos);
      }
      if (!eNode && pos + len >= newEnd) {
        eNode = node;
        eOff = Math.max(0, newEnd - pos);
        break;
      }
      pos += len;
      node = walker.nextNode() as Text | null;
    }

    if (sNode && eNode) {
      const r = document.createRange();
      r.setStart(sNode, sOff);
      r.setEnd(eNode, eOff);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  if (e.key === 'Tab') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (startOffset === endOffset && !e.shiftKey) {
      const nextText = fullText.slice(0, startOffset) + indentUnit + fullText.slice(endOffset);
      codeEl.textContent = nextText;
      setCaretRange(startOffset + indentUnit.length, startOffset + indentUnit.length);
      return true;
    }

    const lineStart = fullText.lastIndexOf('\n', Math.max(0, startOffset - 1)) + 1;
    const lineEndIdx = fullText.indexOf('\n', endOffset);
    const blockEnd = lineEndIdx === -1 ? fullText.length : lineEndIdx;
    const segment = fullText.slice(lineStart, blockEnd);
    const lines = segment.split('\n');

    let firstLineDelta = 0;
    let totalDelta = 0;
    const updatedLines = lines.map((line, i) => {
      if (e.shiftKey) {
        const m = line.match(new RegExp(`^(?:\\t| {1,${indentUnit.length}})`));
        const removed = m ? m[0].length : 0;
        if (i === 0) firstLineDelta = -removed;
        totalDelta -= removed;
        return line.slice(removed);
      }
      if (i === 0) firstLineDelta = indentUnit.length;
      totalDelta += indentUnit.length;
      return indentUnit + line;
    });

    const nextText = fullText.slice(0, lineStart) + updatedLines.join('\n') + fullText.slice(blockEnd);
    codeEl.textContent = nextText;
    const nextStart = Math.max(lineStart, startOffset + firstLineDelta);
    const nextEnd = Math.max(nextStart, endOffset + totalDelta);
    setCaretRange(nextStart, nextEnd);
    return true;
  }

  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const lineStart = fullText.lastIndexOf('\n', Math.max(0, startOffset - 1)) + 1;
    const beforeCaretOnLine = fullText.slice(lineStart, startOffset).replace(/\u200b/g, '');
    const indentMatch = beforeCaretOnLine.match(/^[ \t]*/);
    const baseIndent = indentMatch ? indentMatch[0] : '';
    const trimmed = beforeCaretOnLine.trimEnd();
    const shouldExtraIndent = /[{:(\[]$/.test(trimmed);
    const insertion = '\n' + baseIndent + (shouldExtraIndent ? indentUnit : '');
    if (insertion.length > 1) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const nextText = fullText.slice(0, startOffset) + insertion + fullText.slice(endOffset);
      codeEl.textContent = nextText;
      const newPos = startOffset + insertion.length;
      setCaretRange(newPos, newPos);
      return true;
    }
  }

  return false;
}
