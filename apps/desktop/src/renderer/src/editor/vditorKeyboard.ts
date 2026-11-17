import type Vditor from 'vditor';
import { handleCodeBlockIndentKey } from './codeBlockIndent';
import { PAIR_MAP } from './editorHelpers';
import { getCodeBlockLang } from './vditorDomEnhancer';

export interface KeyboardCaptureContext {
  el: HTMLElement;
  instance: Vditor;
  readOnly: boolean;
  autoPairBrackets: boolean;
  slashMenuOpen: boolean;
  lastActiveInfoMarkerRef: { current: HTMLElement | null };
  hintNavigatedByArrowRef: { current: boolean };
  activeZoomImgRef: { current: HTMLElement | null };
  setVditorRecentLang: (lang: string) => void;
  commitCodeBlockLanguage: (infoMarker: HTMLElement, rawLang: string) => void;
  pushVditorUndo: () => void;
  toggleInlineWrap: (cmd: 'bold' | 'italic') => void;
  rerenderBrokenMermaid: () => void;
  onChangeValue: (md: string) => void;
  toggleLightboxFromActive: () => void;
  closeLightbox: () => void;
  onSlashKeyDown: (e: KeyboardEvent) => boolean;
  ensureCodeBlockInfoMarkers?: () => void;
  undo: () => void;
  redo: () => void;
}

/** Returns the direct child of resetEl that contains the given target, or null. */
function getTopBlock(target: Node, resetEl: Element): HTMLElement | null {
  let cur: Node | null = target;
  while (cur && cur.parentElement !== resetEl) {
    if (!cur.parentElement) return null;
    cur = cur.parentElement;
  }
  return cur instanceof HTMLElement && resetEl.contains(cur) ? cur : null;
}

/** Protected blocks that should NEVER be merged into or accidentally deleted from below */
const PROTECTED_TAGS = new Set(['blockquote', 'pre', 'table', 'hr']);
function isProtectedBlock(el: Element): boolean {
  if (PROTECTED_TAGS.has(el.tagName.toLowerCase())) return true;
  const dt = el.getAttribute('data-type');
  if (!dt) return false;
  return ['blockquote', 'code-block', 'table', 'hr', 'html-block', 'math-block'].includes(dt);
}

/** Handles capture-phase keyboard shortcuts, code-block indentation, table guards, and bracket pairing. */
export function processVditorKeyDownCapture(e: KeyboardEvent, ctx: KeyboardCaptureContext): void {
  const { el, instance } = ctx;
  const isImeComposing = e.isComposing || e.keyCode === 229;
  const targetNode = e.target as HTMLElement | null;
  if (targetNode && (targetNode.tagName === 'INPUT' || targetNode.tagName === 'TEXTAREA')) {
    return;
  }

  if (ctx.readOnly) {
    if (
      e.key === ' ' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      ctx.activeZoomImgRef.current &&
      el.contains(ctx.activeZoomImgRef.current)
    ) {
      e.preventDefault();
      e.stopPropagation();
      ctx.toggleLightboxFromActive();
    }
    return;
  }

  if (ctx.slashMenuOpen && ctx.onSlashKeyDown(e)) {
    return;
  }

  const selInfo = window.getSelection();
  const selAnchorEl =
    selInfo?.anchorNode instanceof Element ? selInfo.anchorNode : selInfo?.anchorNode?.parentElement;
  const infoMarker =
    (selAnchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null) ??
    (targetNode?.closest('.vditor-ir__marker--info') as HTMLElement | null);

  // ─── Code Block Language Picker (ArrowUp/Down, Enter, Tab, Escape) ─────────
  if (infoMarker && el.contains(infoMarker) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (isImeComposing) return;
    ctx.lastActiveInfoMarkerRef.current = infoMarker;

    // 优先尝试使用 Vditor 原生 hint.select 处理上下方向键
    const v = (instance as unknown as { vditor?: { hint?: { select?: (ev: KeyboardEvent, vd: unknown) => boolean; element?: HTMLElement } } }).vditor;
    if (v?.hint?.select && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const handled = v.hint.select(e, v);
      if (handled) {
        return;
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
        return;
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
      return;
    }

    // 回车/Tab：提交语言，且立刻切入代码块正文第 1 行！
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

      // 选完语言后，立刻把光标移入代码正文第一行
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
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      ctx.commitCodeBlockLanguage(infoMarker, infoMarker.textContent || '');
      return;
    }

    if (e.key.length === 1) {
      ctx.hintNavigatedByArrowRef.current = false;
    }
  }

  // Code block language-aware indentation (Tab, Shift+Tab, Enter auto-indent)
  const codeBodyEl = selAnchorEl?.closest('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
  if (codeBodyEl && el.contains(codeBodyEl) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const codeBlock = codeBodyEl.closest('.vditor-ir__node[data-type="code-block"]');
    const lang = codeBlock ? getCodeBlockLang(codeBlock) : '';
    if (handleCodeBlockIndentKey(e, codeBodyEl, lang)) {
      return;
    }
  }

  if (
    e.key === ' ' &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.shiftKey &&
    ctx.activeZoomImgRef.current &&
    el.contains(ctx.activeZoomImgRef.current)
  ) {
    e.preventDefault();
    e.stopPropagation();
    ctx.toggleLightboxFromActive();
    return;
  }

  if (
    (e.key === 'Backspace' || e.key === 'Delete') &&
    ctx.activeZoomImgRef.current &&
    el.contains(ctx.activeZoomImgRef.current) &&
    ctx.activeZoomImgRef.current.tagName === 'IMG'
  ) {
    e.preventDefault();
    e.stopPropagation();
    ctx.pushVditorUndo();
    const activeImg = ctx.activeZoomImgRef.current;
    const imgWrapper = activeImg.closest('.vditor-ir__node[data-type="img"]') ?? activeImg;
    imgWrapper.remove();
    ctx.activeZoomImgRef.current = null;
    ctx.closeLightbox();
    ctx.pushVditorUndo();
    ctx.onChangeValue(instance.getValue());
    return;
  }

  if (!el.contains(targetNode)) return;

  // ─── Block Deletion Isolation & Free Internal Deletion ─────────────────────
  // 严格隔离：
  // 1. 代码块内部：选区删除/Delete/Backspace 仅清除代码正文内容（绝不连带删掉语言标签、mac圆点或整块）；
  //    仅当代码正文原本就已为空且光标在空代码块内再按 Backspace 时才移除整个代码块；
  // 2. Callout / 引用内部：若内部已完全删空，按退格安全清理该空块为普通段落；
  // 3. 光标在受保护块下方的普通段落/标题行首且有文本，坚决禁止向上吞并破坏上方容器；若该行为纯空行则安全删除该空行。
  if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey && !e.altKey && !isImeComposing) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');

      if (resetEl) {
        const startTop = getTopBlock(range.startContainer, resetEl);
        const endTop = getTopBlock(range.endContainer, resetEl);

        // 非折叠选区：如果选区起点/终点均在同一个代码块内部，安全清理选中代码文本，绝不摧毁代码块外壳
        if (!sel.isCollapsed && startTop && startTop === endTop && isProtectedBlock(startTop)) {
          const isCodeBlock =
            startTop.getAttribute('data-type') === 'code-block' || startTop.tagName === 'PRE';
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
                return;
              }
            } else {
              // 跨语言标签与正文选区删除：阻断防止撕裂语言标签与 mac 圆点
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return;
            }
          }
        }
      }

      if (sel.isCollapsed && resetEl) {
        const topBlock = getTopBlock(range.startContainer, resetEl);
        if (topBlock) {
          // 场景 A：如果光标就在受保护块内部（例如在 Callout、代码块、引用内部）：
          if (isProtectedBlock(topBlock)) {
            const isCodeBlock =
              topBlock.getAttribute('data-type') === 'code-block' || topBlock.tagName === 'PRE';

            if (isCodeBlock) {
              const anchorNodeEl =
                range.startContainer instanceof Element
                  ? range.startContainer
                  : range.startContainer.parentElement;
              const inInfoMarker = Boolean(anchorNodeEl?.closest('.vditor-ir__marker--info'));
              const codeEl = topBlock.querySelector(
                'pre.vditor-ir__marker--pre > code, pre:not(.vditor-ir__preview) code, code'
              ) as HTMLElement | null;
              const codeText = (codeEl?.textContent || '').replace(/[\u200b\ufeff\s]/g, '');

              if (e.key === 'Delete') {
                // Delete 键在语言框末尾或代码正文末尾时阻止向下/跨节点吞并撕裂
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
                        return;
                      }
                    } catch {
                      // ignore
                    }
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
                      return;
                    }
                  } catch {
                    // ignore
                  }
                }
              }

              if (e.key === 'Backspace' && !inInfoMarker && codeText.length === 0) {
                // 代码块正文原本就已为空，按 Backspace 干净删除整个代码块转为普通空段落
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
                return;
              }

              // 代码块正文尚有内容且光标在正文行首时，严禁 Backspace 向上合并撕裂语言标签与圆点
              if (e.key === 'Backspace' && !inInfoMarker && codeEl && codeEl.contains(range.startContainer)) {
                try {
                  const preCodeRange = document.createRange();
                  preCodeRange.setStart(codeEl, 0);
                  preCodeRange.setEnd(range.startContainer, range.startOffset);
                  const preCodeClean = preCodeRange.toString().replace(/[\u200b\ufeff]/g, '');
                  if (preCodeClean.length === 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return;
                  }
                } catch {
                  // ignore range errors
                }
              }

              // 光标在语言标签行首时，也不允许 Backspace 向上吞并 ``` 标记
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
                      return;
                    }
                  } catch {
                    // ignore range errors
                  }
                }
              }
            } else if (e.key === 'Backspace') {
              const rawText = (topBlock.textContent || '').replace(/[\u200b\ufeff\s]/g, '');
              // 如果 Callout / 引用内部文字已被删空，按 Backspace 干净将其转为普通空白段落
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
                return;
              }
            }
            // 内部尚有内容且非边界时，允许代码块/Callout 内自由删除，绝不阻断
          } else if (e.key === 'Backspace') {
            // 场景 B：当前块是普通段落/标题等（!isProtectedBlock(topBlock)）
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
                  if (fullText.length > 0) {
                    // 正文段落有内容，坚决阻止向上吞并破坏上方容器
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return;
                  }
                  // 正文是纯空行，允许删除该空行并聚焦上方块末尾
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
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
                  return;
                }
              }
            } catch {
              // ignore range errors
            }
          } else if (e.key === 'Delete') {
            // 场景 C：当前块在受保护块上方，行尾按 Delete 禁止向下吞并撕裂下方代码块/引用块/表格
            try {
              const postRange = document.createRange();
              postRange.setStart(range.startContainer, range.startOffset);
              postRange.setEnd(topBlock, topBlock.childNodes.length);
              const postClean = postRange.toString().replace(/[\u200b\ufeff\s]/g, '');
              if (postClean.length === 0) {
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
                  return;
                }
              }
            } catch {
              // ignore range errors
            }
          }
        }
      }
    }
  }

  // ─── Space 即刻触发 Markdown 渲染（1.、-、*、>、[] 等及引用内嵌套）───────
  if (
    e.key === ' ' &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.shiftKey &&
    !isImeComposing
  ) {
    const sel = window.getSelection();
    if (sel && sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const sc = range.startContainer;
      const anchorEl = sc instanceof Element ? sc : sc.parentElement;

      // 仅在非代码块、非表格、非语言提示框中处理（排除根容器 pre.vditor-reset）
      if (anchorEl && el.contains(anchorEl) && !anchorEl.closest('pre:not(.vditor-reset), code, .vditor-ir__marker--info, table')) {
        const curBlock =
          (anchorEl.closest('.vditor-ir__node, p, h1, h2, h3, h4, h5, h6, li') as HTMLElement | null) ??
          anchorEl;

        if (curBlock && el.contains(curBlock) && !curBlock.classList.contains('vditor-reset')) {
          try {
            const preRange = document.createRange();
            preRange.setStart(curBlock, 0);
            preRange.setEnd(range.startContainer, range.startOffset);
            const preText = preRange.toString().replace(/[\u200b\ufeff]/g, '');

            const inQuote = Boolean(curBlock.closest('blockquote'));
            const matchNestedQuoteOl = preText.match(/^>\s*(\d+)\.$/);
            const matchNestedQuoteUl = preText.match(/^>\s*[-*]$/);
            const matchOl = preText.match(/^(\d+)\.$/);
            const matchUl = preText.match(/^[-*]$/);
            const matchQuote = !inQuote && preText === '>';
            const matchTask = preText === '[]' || preText === '[ ]' || preText === '- []' || preText === '- [ ]';
            const matchHeading = preText.match(/^(#{1,6})$/);

            const isHit =
              matchNestedQuoteOl ||
              matchNestedQuoteUl ||
              matchOl ||
              matchUl ||
              matchQuote ||
              matchTask ||
              matchHeading;

            if (isHit) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              ctx.pushVditorUndo();

              // 删除前缀文本并插入目标 Markdown + <wbr>，直接调用 Vditor Lute SpinVditorIRDOM 即刻编译
              preRange.deleteContents();

              let mdToInsert = '';
              if (inQuote && matchOl) {
                mdToInsert = `${matchOl[1]}. `;
              } else if (inQuote && matchUl) {
                mdToInsert = '- ';
              } else if (matchNestedQuoteOl) {
                mdToInsert = `> ${matchNestedQuoteOl[1]}. `;
              } else if (matchNestedQuoteUl) {
                mdToInsert = '> - ';
              } else if (matchOl) {
                mdToInsert = `${matchOl[1]}. `;
              } else if (matchUl) {
                mdToInsert = '- ';
              } else if (matchQuote) {
                mdToInsert = '> ';
              } else if (matchTask) {
                mdToInsert = '- [ ] ';
              } else if (matchHeading) {
                mdToInsert = `${matchHeading[1]} `;
              }

              const v = (instance as unknown as {
                vditor?: {
                  lute?: { SpinVditorIRDOM: (html: string) => string };
                  ir?: { element: HTMLElement };
                };
              }).vditor;

              if (v?.lute?.SpinVditorIRDOM) {
                const textNode = document.createTextNode(mdToInsert);
                const wbrNode = document.createElement('wbr');
                preRange.insertNode(wbrNode);
                preRange.insertNode(textNode);

                const spinTarget = (curBlock.closest('blockquote') as HTMLElement | null) ?? curBlock;
                const spunHtml = v.lute.SpinVditorIRDOM(spinTarget.outerHTML);
                const temp = document.createElement('div');
                temp.innerHTML = spunHtml;
                const newNodes = Array.from(temp.childNodes);
                if (newNodes.length > 0) {
                  spinTarget.replaceWith(...newNodes);
                }

                const resetContainer =
                  el.querySelector('.vditor-ir .vditor-reset') ??
                  el.querySelector('.vditor-reset') ??
                  el;
                const wbr = resetContainer.querySelector('wbr');
                if (wbr && wbr.parentNode) {
                  const newRange = document.createRange();
                  const parent = wbr.parentNode as HTMLElement;
                  const idx = Array.prototype.indexOf.call(parent.childNodes, wbr);
                  wbr.remove();
                  if (parent.tagName === 'LI' && parent.childNodes.length === 0) {
                    parent.appendChild(document.createElement('br'));
                  }
                  newRange.setStart(parent, Math.min(idx, parent.childNodes.length));
                  newRange.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(newRange);
                }
                if (!el.contains(document.activeElement)) {
                  instance.focus();
                }
              } else {
                instance.focus();
                instance.insertValue(mdToInsert);
              }
              ctx.pushVditorUndo();
              ctx.onChangeValue(instance.getValue());
              return;
            }
          } catch (err) {
            console.error('[vcat] space-render error:', err);
          }
        }
      }
    }
  }

  const sel = window.getSelection();
  const anchorEl =
    sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
  const activeCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;

  if (activeCell && el.contains(activeCell)) {
    // ─── Table Cell Delete/Backspace Guard ──────────────────────────────────
    if ((e.key === 'Backspace' || e.key === 'Delete') && !isImeComposing) {
      const cellImg = activeCell.querySelector('.vditor-ir__node[data-type="img"], img');
      if (cellImg && (!sel || sel.isCollapsed)) {
        const visibleText = Array.from(activeCell.childNodes)
          .filter((n) => !(n instanceof HTMLElement && (n.matches('.vditor-ir__node[data-type="img"], img') || n.querySelector('img'))))
          .map((n) => n.textContent || '')
          .join('')
          .trim();
        if (!visibleText) {
          e.preventDefault();
          e.stopPropagation();
          ctx.pushVditorUndo();
          cellImg.remove();
          ctx.pushVditorUndo();
          ctx.onChangeValue(instance.getValue());
          return;
        }
      }
      if (sel && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        // Backspace at start of cell → prevent merging cells
        const cellPreRange = document.createRange();
        cellPreRange.setStart(activeCell, 0);
        try { cellPreRange.setEnd(range.startContainer, range.startOffset); } catch { /* ignore */ }
        const cellPreText = cellPreRange.toString().replace(/[\u200b\ufeff]/g, '');
        if (e.key === 'Backspace' && cellPreText.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        // Delete at end of cell → prevent merging cells
        if (e.key === 'Delete') {
          const cellPostRange = document.createRange();
          try {
            cellPostRange.setStart(range.startContainer, range.startOffset);
            cellPostRange.setEnd(activeCell, activeCell.childNodes.length);
          } catch { /* ignore */ }
          const cellPostText = cellPostRange.toString().replace(/[\u200b\ufeff]/g, '');
          if (cellPostText.length === 0) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
          }
        }
      }
    }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const tr = activeCell.parentElement as HTMLTableRowElement | null;
      const table = activeCell.closest('table');
      if (tr && table) {
        const allRows = Array.from(table.querySelectorAll('tr'));
        const rIdx = allRows.indexOf(tr);
        const cIdx = Array.from(tr.cells).indexOf(activeCell);
        const nextRow = allRows[rIdx + 1];
        const targetCell = nextRow?.cells[cIdx] ?? nextRow?.cells[0];
        if (targetCell && sel) {
          const range = document.createRange();
          range.selectNodeContents(targetCell);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.shiftKey || e.altKey || e.key === 'Enter')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      ctx.toggleInlineWrap(k === 'b' ? 'bold' : 'italic');
      return;
    } else if (k === 'z' || k === 'y') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (k === 'y') ctx.redo();
      else ctx.undo();
      setTimeout(ctx.rerenderBrokenMermaid, 50);
      return;
    }
  } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    ctx.redo();
    setTimeout(ctx.rerenderBrokenMermaid, 50);
    return;
  }

  // ─── Backtick (`) 1:1 输入与三反引号展开代码块 ─────────────────────────────
  // 1. 第 1 下、第 2 下正常输入单个 `（不提前成对插入右侧 ` 导致多余光标）
  // 2. 累计输入到第 3 个反引号时，清除左侧 2 个反引号并直接展开为代码块
  if (
    ctx.autoPairBrackets &&
    e.key === '`' &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !isImeComposing
  ) {
    const selNow = window.getSelection();
    if (selNow && selNow.rangeCount > 0) {
      const range = selNow.getRangeAt(0);
      const anchorNode =
        range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;

      const inCodeBody = Boolean(anchorNode?.closest('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code'));
      const inInfoMk = Boolean(anchorNode?.closest('.vditor-ir__marker--info'));
      const inTable = Boolean(anchorNode?.closest('table'));
      if (!inCodeBody && !inInfoMk && !inTable && anchorNode && el.contains(anchorNode)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!range.collapsed) {
          const selectedText = range.toString();
          document.execCommand('insertText', false, `\`${selectedText}\``);
          ctx.onChangeValue(instance.getValue());
          return;
        }

        const curBlock =
          (anchorNode.closest('.vditor-ir__node, p, h1, h2, h3, h4, h5, h6, li') as HTMLElement | null) ??
          anchorNode;
        const preRange = document.createRange();
        preRange.setStart(curBlock, 0);
        preRange.setEnd(range.startContainer, range.startOffset);
        const preClean = preRange.toString().replace(/[\u200b\ufeff]/g, '');

        const sc = range.startContainer;

        // 累计已有两个连续反引号（preClean 以 `` 结尾），敲击第 3 个反引号 -> 清除左侧 2 个并展开代码块！
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
          return;
        }

        // 第 1 下、第 2 下：按几下出几个反引号，绝不擅自成对插入右侧反引号
        document.execCommand('insertText', false, '`');
        ctx.onChangeValue(instance.getValue());
        return;
      }
    }
  }

  // ─── Bracket auto-pair (excluding backtick, handled above) ────────────────
  if (
    ctx.autoPairBrackets &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    (PAIR_MAP[e.key] || Object.values(PAIR_MAP).includes(e.key))
  ) {
    const selNow = window.getSelection();
    if (selNow && selNow.rangeCount > 0) {
      const range = selNow.getRangeAt(0);
      if (range.collapsed && Object.values(PAIR_MAP).includes(e.key)) {
        const sc = range.startContainer;
        const nextChar =
          sc.nodeType === Node.TEXT_NODE
            ? (sc.nodeValue || '').slice(range.startOffset, range.startOffset + 1)
            : '';
        if (nextChar === e.key) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const nextRange = document.createRange();
          nextRange.setStart(sc, range.startOffset + 1);
          nextRange.collapse(true);
          selNow.removeAllRanges();
          selNow.addRange(nextRange);
          return;
        }
      }

      const closeChar = PAIR_MAP[e.key];
      if (!closeChar) return;
      const anchorNode =
        range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      if (e.key === '`' || anchorNode?.closest('.vditor-ir__marker--info')) return;
      if (el.contains(anchorNode)) {
        const selectedText = range.toString();
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (selectedText) {
          const wrapped = `${e.key}${selectedText}${closeChar}`;
          const textNode = document.createTextNode(wrapped);
          range.deleteContents();
          range.insertNode(textNode);
          const nextRange = document.createRange();
          nextRange.setStart(textNode, 1);
          nextRange.setEnd(textNode, 1 + selectedText.length);
          selNow.removeAllRanges();
          selNow.addRange(nextRange);
        } else {
          const textNode = document.createTextNode(`${e.key}${closeChar}`);
          range.deleteContents();
          range.insertNode(textNode);
          const nextRange = document.createRange();
          nextRange.setStart(textNode, 1);
          nextRange.collapse(true);
          selNow.removeAllRanges();
          selNow.addRange(nextRange);
        }
        ctx.onChangeValue(instance.getValue());
      }
    }
  }
}
