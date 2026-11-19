import { PAIR_MAP } from './editorHelpers';
import type { KeyboardCaptureContext } from './vditorKeyboard';

function getTopBlock(target: Node, resetEl: Element): HTMLElement | null {
  let cur: Node | null = target;
  while (cur && cur.parentElement !== resetEl) {
    if (!cur.parentElement) return null;
    cur = cur.parentElement;
  }
  return cur instanceof HTMLElement && resetEl.contains(cur) ? cur : null;
}

const PROTECTED_TAGS = new Set(['blockquote', 'pre', 'table', 'hr']);

function isProtectedBlock(el: Element): boolean {
  if (PROTECTED_TAGS.has(el.tagName.toLowerCase())) return true;
  const dt = el.getAttribute('data-type');
  if (!dt) return false;
  return ['blockquote', 'code-block', 'table', 'hr', 'html-block', 'math-block'].includes(dt);
}

/** Handles empty bracket pair Backspace (e.g. `(|)` deletes both). */
export function handleEmptyPairBackspace(
  e: KeyboardEvent,
  ctx: KeyboardCaptureContext,
  isImeComposing: boolean
): boolean {
  if (!ctx.autoPairBrackets || e.key !== 'Backspace' || e.metaKey || e.ctrlKey || e.altKey || isImeComposing) {
    return false;
  }
  const selBp = window.getSelection();
  if (!selBp || !selBp.isCollapsed || selBp.rangeCount === 0) return false;

  const rBp = selBp.getRangeAt(0);
  const scBp = rBp.startContainer;
  if (scBp.nodeType !== Node.TEXT_NODE || rBp.startOffset < 1) return false;

  const val = scBp.nodeValue || '';
  const prevCh = val.slice(rBp.startOffset - 1, rBp.startOffset);
  const expectedClose = PAIR_MAP[prevCh];
  if (!expectedClose) return false;

  const nextInSame = val.slice(rBp.startOffset, rBp.startOffset + 1);
  if (nextInSame === expectedClose) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const delR = document.createRange();
    delR.setStart(scBp, rBp.startOffset - 1);
    delR.setEnd(scBp, rBp.startOffset + 1);
    selBp.removeAllRanges();
    selBp.addRange(delR);
    document.execCommand('delete', false);
    ctx.onChangeValue(ctx.instance.getValue());
    return true;
  }

  if (
    rBp.startOffset === val.length &&
    scBp.nextSibling?.nodeType === Node.TEXT_NODE &&
    (scBp.nextSibling.nodeValue || '').startsWith(expectedClose)
  ) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const delR = document.createRange();
    delR.setStart(scBp, rBp.startOffset - 1);
    delR.setEnd(scBp.nextSibling, 1);
    selBp.removeAllRanges();
    selBp.addRange(delR);
    document.execCommand('delete', false);
    ctx.onChangeValue(ctx.instance.getValue());
    return true;
  }
  return false;
}

/** Enforces isolation rules on Backspace/Delete inside and adjacent to protected blocks. */
export function handleProtectedBlockDelete(
  e: KeyboardEvent,
  ctx: KeyboardCaptureContext,
  isImeComposing: boolean
): boolean {
  if ((e.key !== 'Backspace' && e.key !== 'Delete') || e.metaKey || e.ctrlKey || e.altKey || isImeComposing) {
    return false;
  }
  const { el, instance } = ctx;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;

  const range = sel.getRangeAt(0);
  const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');
  if (!resetEl) return false;

  const startTop = getTopBlock(range.startContainer, resetEl);
  const endTop = getTopBlock(range.endContainer, resetEl);

  if (!sel.isCollapsed && startTop && startTop === endTop && isProtectedBlock(startTop)) {
    const isCodeBlock = startTop.getAttribute('data-type') === 'code-block' || startTop.tagName === 'PRE';
    if (isCodeBlock) {
      const codeEl = startTop.querySelector(
        'pre.vditor-ir__marker--pre > code, pre:not(.vditor-ir__preview) code, code'
      ) as HTMLElement | null;
      if (codeEl && codeEl.contains(range.startContainer) && codeEl.contains(range.endContainer)) {
        const selectedAll =
          range.toString().replace(/[\u200b\ufeff\n]/g, '') ===
          (codeEl.textContent || '').replace(/[\u200b\ufeff\n]/g, '');
        if (selectedAll) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          ctx.pushVditorUndo();
          codeEl.textContent = '\n';
          const nr = document.createRange();
          nr.setStart(codeEl, 0);
          nr.collapse(true);
          sel.removeAllRanges();
          sel.addRange(nr);
          ctx.pushVditorUndo();
          ctx.onChangeValue(instance.getValue());
          return true;
        }
      } else {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return true;
      }
    }
  }

  if (!sel.isCollapsed) return false;

  const topBlock = getTopBlock(range.startContainer, resetEl);
  if (!topBlock) return false;

  if (isProtectedBlock(topBlock)) {
    const isCodeBlock = topBlock.getAttribute('data-type') === 'code-block' || topBlock.tagName === 'PRE';
    if (isCodeBlock) {
      const anchorNodeEl =
        range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const inInfoMarker = Boolean(anchorNodeEl?.closest('.vditor-ir__marker--info'));
      const codeEl = topBlock.querySelector(
        'pre.vditor-ir__marker--pre > code, pre:not(.vditor-ir__preview) code, code'
      ) as HTMLElement | null;
      const codeText = (codeEl?.textContent || '').replace(/[\u200b\ufeff\s]/g, '');

      if (e.key === 'Delete') {
        if (inInfoMarker) {
          const infoMarker = anchorNodeEl?.closest('.vditor-ir__marker--info') as HTMLElement | null;
          if (infoMarker) {
            try {
              const postInfoRange = document.createRange();
              postInfoRange.setStart(range.startContainer, range.startOffset);
              postInfoRange.setEnd(infoMarker, infoMarker.childNodes.length);
              if (postInfoRange.toString().replace(/[\u200b\ufeff]/g, '').length === 0) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return true;
              }
            } catch { /* range boundary fallback */ }
          }
        } else if (codeEl && codeEl.contains(range.startContainer)) {
          try {
            const postCodeRange = document.createRange();
            postCodeRange.setStart(range.startContainer, range.startOffset);
            postCodeRange.setEnd(codeEl, codeEl.childNodes.length);
            if (postCodeRange.toString().replace(/[\u200b\ufeff\n]/g, '').length === 0) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return true;
            }
          } catch { /* range boundary fallback */ }
        }
      }

      if (e.key === 'Backspace' && !inInfoMarker && codeText.length === 0) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        ctx.pushVditorUndo();
        const prev = topBlock.previousElementSibling;
        const p = document.createElement('p');
        p.setAttribute('data-block', '0');
        p.innerHTML = '<br>';
        topBlock.replaceWith(p);
        const target = prev ?? p;
        const newRange = document.createRange();
        newRange.selectNodeContents(target);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);
        ctx.pushVditorUndo();
        ctx.onChangeValue(instance.getValue());
        return true;
      }

      if (e.key === 'Backspace' && !inInfoMarker && codeEl && codeEl.contains(range.startContainer)) {
        try {
          const preCodeRange = document.createRange();
          preCodeRange.setStart(codeEl, 0);
          preCodeRange.setEnd(range.startContainer, range.startOffset);
          if (preCodeRange.toString().replace(/[\u200b\ufeff]/g, '').length === 0) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return true;
          }
        } catch { /* range boundary fallback */ }
      }

      if (e.key === 'Backspace' && inInfoMarker) {
        const infoMarker = anchorNodeEl?.closest('.vditor-ir__marker--info') as HTMLElement | null;
        if (infoMarker) {
          try {
            const preInfoRange = document.createRange();
            preInfoRange.setStart(infoMarker, 0);
            preInfoRange.setEnd(range.startContainer, range.startOffset);
            if (preInfoRange.toString().replace(/[\u200b\ufeff]/g, '').length === 0) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return true;
            }
          } catch { /* range boundary fallback */ }
        }
      }
    } else if (e.key === 'Backspace') {
      const rawText = (topBlock.textContent || '').replace(/[\u200b\ufeff\s]/g, '');
      if (rawText.length === 0) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        ctx.pushVditorUndo();
        const prev = topBlock.previousElementSibling;
        const p = document.createElement('p');
        p.setAttribute('data-block', '0');
        p.innerHTML = '<br>';
        topBlock.replaceWith(p);
        const target = prev ?? p;
        const newRange = document.createRange();
        newRange.selectNodeContents(target);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);
        ctx.pushVditorUndo();
        ctx.onChangeValue(instance.getValue());
        return true;
      }
    }
    return false;
  }

  if (e.key === 'Backspace') {
    try {
      const preRange = document.createRange();
      preRange.setStart(topBlock, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      const preClean = preRange.toString().replace(/[\u200b\ufeff\s]/g, '');
      const isAtStart = preClean.length === 0 || /^#{1,6}$/.test(preClean);
      if (isAtStart) {
        const prevSib = topBlock.previousElementSibling;
        if (prevSib && isProtectedBlock(prevSib)) {
          const fullText = (topBlock.textContent || '').replace(/[\u200b\ufeff\s]/g, '');
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (fullText.length > 0) return true;
          ctx.pushVditorUndo();
          topBlock.remove();
          const newRange = document.createRange();
          const leafTarget =
            (prevSib.querySelector('p:last-of-type, li:last-of-type, code, td, th') as HTMLElement | null) ??
            prevSib;
          newRange.selectNodeContents(leafTarget);
          newRange.collapse(false);
          sel.removeAllRanges();
          sel.addRange(newRange);
          ctx.pushVditorUndo();
          ctx.onChangeValue(instance.getValue());
          return true;
        }
      }
    } catch { /* range boundary fallback */ }
  } else if (e.key === 'Delete') {
    try {
      const postRange = document.createRange();
      postRange.setStart(range.startContainer, range.startOffset);
      postRange.setEnd(topBlock, topBlock.childNodes.length);
      if (postRange.toString().replace(/[\u200b\ufeff\s]/g, '').length === 0) {
        const nextSib = topBlock.nextElementSibling;
        if (nextSib && isProtectedBlock(nextSib)) {
          const fullText = (topBlock.textContent || '').replace(/[\u200b\ufeff\s]/g, '');
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (fullText.length === 0) {
            ctx.pushVditorUndo();
            topBlock.remove();
            const newRange = document.createRange();
            const leafTarget =
              (nextSib.querySelector('p, li, code, td, th') as HTMLElement | null) ?? nextSib;
            newRange.selectNodeContents(leafTarget);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            ctx.pushVditorUndo();
            ctx.onChangeValue(instance.getValue());
          }
          return true;
        }
      }
    } catch { /* range boundary fallback */ }
  }
  return false;
}
