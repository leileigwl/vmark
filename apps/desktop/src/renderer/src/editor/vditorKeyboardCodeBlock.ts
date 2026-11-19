import type { KeyboardCaptureContext } from './vditorKeyboard';

/** Handles key events inside `.vditor-ir__marker--info` (language hint navigation, commit, delete guard). */
export function handleInfoMarkerKeyDown(
  e: KeyboardEvent,
  ctx: KeyboardCaptureContext,
  infoMarker: HTMLElement,
  selInfo: Selection | null,
  isImeComposing: boolean
): boolean {
  const { el, instance } = ctx;
  if (isImeComposing) return true;
  ctx.lastActiveInfoMarkerRef.current = infoMarker;

  // Prefer Vditor native hint.select for ArrowDown/ArrowUp
  const v = (
    instance as unknown as {
      vditor?: { hint?: { select?: (ev: KeyboardEvent, vd: unknown) => boolean; element?: HTMLElement } };
    }
  ).vditor;
  if (v?.hint?.select && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    if (v.hint.select(e, v)) {
      return true;
    }
  }

  const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
  const hintButtons = hintEl ? Array.from(hintEl.querySelectorAll('button')) : [];
  const hintVisible = Boolean(
    hintEl &&
    hintEl.getBoundingClientRect().height > 0 &&
    window.getComputedStyle(hintEl).display !== 'none' &&
    hintButtons.length > 0
  );

  if (e.key.length === 1 && (infoMarker.textContent || '').replace(/\u200b/g, '').trim() === 'text') {
    infoMarker.textContent = '';
  } else if (
    e.key.length === 1 &&
    selInfo &&
    !selInfo.isCollapsed &&
    selInfo.rangeCount > 0 &&
    infoMarker.contains(selInfo.anchorNode)
  ) {
    selInfo.getRangeAt(0).deleteContents();
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    ctx.hintNavigatedByArrowRef.current = false;
    ctx.setVditorRecentLang('');
    const curLangText = (infoMarker.textContent || '').replace(/\u200b/g, '');
    if (e.key === 'Backspace' && curLangText.length === 0) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (infoMarker.textContent !== '\u200b') infoMarker.textContent = '\u200b';
      return true;
    }
    queueMicrotask(() => {
      if ((infoMarker.textContent || '').replace(/\u200b/g, '').trim() === '') {
        ctx.setVditorRecentLang('');
        if (infoMarker.textContent !== '\u200b') infoMarker.textContent = '\u200b';
        infoMarker.closest('.vditor-ir__node[data-type="code-block"]')?.setAttribute('data-CodeLang', 'text');
      }
    });
  }

  if (hintVisible && (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    ctx.hintNavigatedByArrowRef.current = true;
    const curIdx = hintButtons.findIndex((b) => b.classList.contains('vditor-hint--current'));
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const nextIdx =
      curIdx < 0
        ? delta > 0
          ? 0
          : hintButtons.length - 1
        : (curIdx + delta + hintButtons.length) % hintButtons.length;
    hintButtons.forEach((b, i) => b.classList.toggle('vditor-hint--current', i === nextIdx));
    hintButtons[nextIdx]?.scrollIntoView({ block: 'nearest' });
    return true;
  }

  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const rawCurText = (infoMarker.textContent || '').replace(/\u200b/g, '').trim();
    const shouldUseHint = hintVisible && (rawCurText.length > 0 || ctx.hintNavigatedByArrowRef.current);
    const chosenBtn = shouldUseHint
      ? hintButtons.find((b) => b.classList.contains('vditor-hint--current')) ?? hintButtons[0]
      : null;
    const rawChoice = chosenBtn
      ? chosenBtn.getAttribute('data-value') || chosenBtn.textContent || ''
      : rawCurText;
    ctx.commitCodeBlockLanguage(infoMarker, (rawChoice || 'text').trim());

    const codeBlock = infoMarker.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null;
    requestAnimationFrame(() => {
      const activeBlock =
        codeBlock && codeBlock.isConnected
          ? codeBlock
          : (ctx.lastActiveInfoMarkerRef.current?.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null);
      const codeBody = activeBlock?.querySelector(
        'pre.vditor-ir__marker--pre > code, pre:not(.vditor-ir__preview) code, code'
      ) as HTMLElement | null;
      if (codeBody) {
        instance.focus();
        const range = document.createRange();
        if (codeBody.firstChild) {
          range.setStart(codeBody.firstChild, 0);
          range.collapse(true);
        } else {
          range.selectNodeContents(codeBody);
          range.collapse(true);
        }
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
    return true;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    ctx.commitCodeBlockLanguage(infoMarker, infoMarker.textContent || '');
    return true;
  }

  if (e.key.length === 1) {
    ctx.hintNavigatedByArrowRef.current = false;
  }
  return false;
}

/** Handles literal 1:1 backtick entry and triple-backtick code block expansion. */
export function handleBacktickKeyDown(
  e: KeyboardEvent,
  ctx: KeyboardCaptureContext,
  isImeComposing: boolean
): boolean {
  if (!ctx.autoPairBrackets || e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey || isImeComposing) {
    return false;
  }
  const { el, instance } = ctx;
  const selNow = window.getSelection();
  if (!selNow || selNow.rangeCount === 0) return false;

  const range = selNow.getRangeAt(0);
  const anchorNode =
    range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;

  const inCodeBody = Boolean(anchorNode?.closest('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code'));
  const inInfoMk = Boolean(anchorNode?.closest('.vditor-ir__marker--info'));
  const inTable = Boolean(anchorNode?.closest('table'));
  if (inCodeBody || inInfoMk || inTable || !anchorNode || !el.contains(anchorNode)) {
    return false;
  }

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if (!range.collapsed) {
    const selectedText = range.toString();
    document.execCommand('insertText', false, `\`${selectedText}\``);
    ctx.onChangeValue(instance.getValue());
    return true;
  }

  const curBlock =
    (anchorNode.closest('.vditor-ir__node, p, h1, h2, h3, h4, h5, h6, li') as HTMLElement | null) ??
    anchorNode;
  const preRange = document.createRange();
  preRange.setStart(curBlock, 0);
  preRange.setEnd(range.startContainer, range.startOffset);
  const preClean = preRange.toString().replace(/[\u200b\ufeff]/g, '');
  const sc = range.startContainer;

  if (preClean.endsWith('``')) {
    if (sc.nodeType === Node.TEXT_NODE && range.startOffset >= 2) {
      const delRange = document.createRange();
      delRange.setStart(sc, range.startOffset - 2);
      delRange.setEnd(sc, range.startOffset);
      selNow.removeAllRanges();
      selNow.addRange(delRange);
      document.execCommand('delete', false);
    } else {
      document.execCommand('delete', false);
      document.execCommand('delete', false);
    }

    ctx.pushVditorUndo();
    const prevCbs = new Set(Array.from(el.querySelectorAll('.vditor-ir__node[data-type="code-block"]')));
    instance.focus();
    instance.insertValue('```ts\n\n```\n');
    setTimeout(() => {
      ctx.ensureCodeBlockInfoMarkers?.();
      const allCbs = Array.from(el.querySelectorAll('.vditor-ir__node[data-type="code-block"]'));
      const targetCb =
        (allCbs.find((cb) => !prevCbs.has(cb)) as HTMLElement | undefined) ??
        (allCbs[allCbs.length - 1] as HTMLElement | undefined);
      const infoSpan = targetCb?.querySelector('.vditor-ir__marker--info') as HTMLElement | null;
      if (targetCb && infoSpan) {
        targetCb.classList.add('vditor-ir__node--expand');
        ctx.lastActiveInfoMarkerRef.current = infoSpan;
        const r = document.createRange();
        r.selectNodeContents(infoSpan);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
    }, 60);
    ctx.pushVditorUndo();
    ctx.onChangeValue(instance.getValue());
    return true;
  }

  document.execCommand('insertText', false, '`');
  ctx.onChangeValue(instance.getValue());
  return true;
}
