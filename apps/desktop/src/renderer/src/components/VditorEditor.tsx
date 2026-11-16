import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EditorPreferences } from '@vcat/shared';
import Vditor from 'vditor';
import { applyCodeSyntaxHighlights } from '../editor/codeHighlight';
import { toggleInlineWrapInEditor, type InlineWrapCommand } from '../editor/inlineFormat';
import { executeTableAction } from '../editor/tableActions';
import { MediaLightbox, type LightboxPayload } from './MediaLightbox';

export interface FindOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface VditorEditorHandle {
  applyFormat: (cmd: string) => void;
  applyTableAction: (action: string) => void;
  applyImageAction: (action: string) => void;
  insertTableWithSize: (cols: number, rows: number) => void;
  getValue: () => string;
  getHTML: () => string;
  findMatches: (findStr: string, opts?: FindOptions) => number;
  jumpToMatch: (findStr: string, index: number, opts?: FindOptions) => number;
  clearFindHighlights: () => void;
  replaceAllText: (findStr: string, replaceStr: string, opts?: FindOptions) => number;
}

interface VditorEditorProps {
  value: string;
  articleKey: string;
  loadSeq?: number;
  preferences?: EditorPreferences;
  onChange: (markdown: string) => void;
  onSave?: (markdown: string) => void;
}

const FORMAT_SNIPPETS: Record<string, string> = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  h4: '#### ',
  h5: '##### ',
  h6: '###### ',
  bold: '**加粗文本**',
  italic: '*斜体文本*',
  strike: '~~删除线~~',
  'inline-code': '`code`',
  link: '[链接文本](https://)',
  quote: '> ',
  list: '- ',
  'ordered-list': '1. ',
  check: '- [ ] ',
  table: '\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n',
  'code-block': '\n```python\n\n```\n',
  line: '\n---\n',
};

/** Typora-style Instant Rendering (IR) Markdown editor powered by local Vditor assets. */
export const VditorEditor = forwardRef<VditorEditorHandle, VditorEditorProps>(
  function VditorEditor({ value, articleKey, loadSeq, preferences, onChange, onSave }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const vditorRef = useRef<Vditor | null>(null);
    const isReadyRef = useRef(false);
    const pendingValueRef = useRef<string | null>(null);
    const lastSelectionElRef = useRef<HTMLElement | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mermaidClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeZoomImgRef = useRef<HTMLImageElement | null>(null);
    const [lightboxItem, setLightboxItem] = useState<LightboxPayload | null>(null);

    const onChangeRef = useRef(onChange);
    const onSaveRef = useRef(onSave);
    const prefsRef = useRef<EditorPreferences>({
      autoPairSymbols: preferences?.autoPairSymbols ?? true,
      copyFormat: preferences?.copyFormat ?? 'markdown',
      defaultExportFormat: preferences?.defaultExportFormat ?? 'pdf',
    });

    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    prefsRef.current = {
      autoPairSymbols: preferences?.autoPairSymbols ?? true,
      copyFormat: preferences?.copyFormat ?? 'markdown',
      defaultExportFormat: preferences?.defaultExportFormat ?? 'pdf',
    };
    pendingValueRef.current = value;

    const pushVditorUndo = () => {
      const instance = vditorRef.current as unknown as {
        vditor?: { undo?: { addToUndoStack?: (v: unknown) => void } };
      } | null;
      if (instance?.vditor?.undo?.addToUndoStack) {
        instance.vditor.undo.addToUndoStack(instance.vditor);
      }
    };

    const toggleInlineWrap = (cmd: InlineWrapCommand) => {
      const instance = vditorRef.current;
      const el = containerRef.current;
      if (!instance || !el || !isReadyRef.current) return;
      toggleInlineWrapInEditor(el, cmd, pushVditorUndo, () => {
        onChangeRef.current(instance.getValue());
      });
    };

    useImperativeHandle(ref, () => ({
      applyFormat(cmd: string) {
        const instance = vditorRef.current;
        const el = containerRef.current;
        if (!instance || !el || !isReadyRef.current) return;
        if (cmd === 'bold' || cmd === 'italic' || cmd === 'strike' || cmd === 'inline-code') {
          toggleInlineWrap(cmd);
          return;
        }
        // When applying H1-H6 inside an existing heading, replace its heading marker instead of stacking ####
        if (/^h[1-6]$/.test(cmd)) {
          const sel = window.getSelection();
          const anchorEl =
            sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
          const existingH = anchorEl?.closest('h1, h2, h3, h4, h5, h6') as HTMLElement | null;
          if (existingH && el.contains(existingH)) {
            const marker = existingH.querySelector('.vditor-ir__marker--heading');
            if (marker) {
              pushVditorUndo();
              marker.textContent = FORMAT_SNIPPETS[cmd];
              pushVditorUndo();
              onChangeRef.current(instance.getValue());
              return;
            }
          }
        }
        // When inserting a block element (like a table) while cursor is inside an existing table,
        // jump out after the table first so it doesn't corrupt cells!
        if (cmd === 'table' || cmd === 'code-block' || cmd === 'line') {
          const sel = window.getSelection();
          const anchorEl =
            sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
          const blockWrapper = anchorEl?.closest('table, ul, ol, blockquote');
          if (blockWrapper && el.contains(blockWrapper)) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            blockWrapper.parentNode?.insertBefore(p, blockWrapper.nextSibling);
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }
        if (cmd === 'line') {
          const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');
          const sel = window.getSelection();
          if (resetEl && sel) {
            pushVditorUndo();
            const anchorEl =
              sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
            const blockEl =
              (anchorEl?.closest('table, ul, ol, blockquote, p, h1, h2, h3, h4, h5, h6, pre') as HTMLElement | null) ??
              null;
            const hr = document.createElement('hr');
            hr.setAttribute('data-block', '0');
            const nextP = document.createElement('p');
            nextP.innerHTML = '<br>';
            if (blockEl && resetEl.contains(blockEl) && blockEl.parentNode === resetEl) {
              resetEl.insertBefore(hr, blockEl.nextSibling);
              resetEl.insertBefore(nextP, hr.nextSibling);
            } else {
              resetEl.appendChild(hr);
              resetEl.appendChild(nextP);
            }
            const range = document.createRange();
            range.selectNodeContents(nextP);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            pushVditorUndo();
            onChangeRef.current(instance.getValue());
          }
          return;
        }
        const snippet = FORMAT_SNIPPETS[cmd];
        if (snippet) {
          instance.focus();
          instance.insertValue(snippet);
        }
      },
      getValue() {
        const instance = vditorRef.current;
        return instance && isReadyRef.current ? instance.getValue() : value;
      },
      getHTML() {
        const instance = vditorRef.current;
        return instance && isReadyRef.current ? instance.getHTML() : '';
      },
      insertTableWithSize(cols: number, rows: number) {
        const instance = vditorRef.current;
        const el = containerRef.current;
        if (!instance || !el || !isReadyRef.current) return;
        const safeCols = Math.max(1, Math.min(20, cols));
        const safeRows = Math.max(1, Math.min(50, rows));

        const sel = window.getSelection();
        const anchorEl =
          sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
        const existingTable = anchorEl?.closest('table');
        if (existingTable && el.contains(existingTable)) {
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          existingTable.parentNode?.insertBefore(p, existingTable.nextSibling);
          const range = document.createRange();
          range.selectNodeContents(p);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }

        const header = `| ${Array.from({ length: safeCols }, (_, i) => `列 ${i + 1}`).join(' | ')} |`;
        const sep = `| ${Array.from({ length: safeCols }, () => '---').join(' | ')} |`;
        const bodyRows = Array.from({ length: safeRows }, () =>
          `| ${Array.from({ length: safeCols }, () => ' ').join(' | ')} |`
        );
        instance.focus();
        instance.insertValue(`\n${[header, sep, ...bodyRows].join('\n')}\n`);
      },
      findMatches(findStr: string, opts?: FindOptions) {
        const el = containerRef.current;
        if (!el || !findStr) {
          (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights?.delete('vcat-find');
          return 0;
        }
        const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');
        if (!resetEl) return 0;

        let re: RegExp;
        try {
          const flags = opts?.caseSensitive ? 'g' : 'gi';
          const escaped = opts?.regex ? findStr : findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = opts?.wholeWord ? `\\b${escaped}\\b` : escaped;
          re = new RegExp(pattern, flags);
        } catch {
          return 0;
        }

        const walker = document.createTreeWalker(resetEl, NodeFilter.SHOW_TEXT);
        const ranges: Range[] = [];
        let curr = walker.nextNode() as Text | null;
        while (curr) {
          const val = curr.nodeValue || '';
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(val)) !== null) {
            if (m[0].length === 0) {
              re.lastIndex++;
              continue;
            }
            const r = document.createRange();
            r.setStart(curr, m.index);
            r.setEnd(curr, m.index + m[0].length);
            ranges.push(r);
          }
          curr = walker.nextNode() as Text | null;
        }

        const cssApi = (globalThis as unknown as {
          CSS?: { highlights?: Map<string, unknown> };
          Highlight?: new (...ranges: Range[]) => unknown;
        });
        if (cssApi.CSS?.highlights && cssApi.Highlight) {
          if (ranges.length > 0) {
            cssApi.CSS.highlights.set('vcat-find', new cssApi.Highlight(...ranges));
          } else {
            cssApi.CSS.highlights.delete('vcat-find');
          }
        }
        return ranges.length;
      },
      clearFindHighlights() {
        (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights?.delete('vcat-find');
      },
      jumpToMatch(findStr: string, targetIndex: number, opts?: FindOptions) {
        const el = containerRef.current;
        if (!el || !findStr) return 0;
        const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');
        if (!resetEl) return 0;

        let re: RegExp;
        try {
          const flags = opts?.caseSensitive ? 'g' : 'gi';
          const escaped = opts?.regex ? findStr : findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = opts?.wholeWord ? `\\b${escaped}\\b` : escaped;
          re = new RegExp(pattern, flags);
        } catch {
          return 0;
        }

        const walker = document.createTreeWalker(resetEl, NodeFilter.SHOW_TEXT);
        const ranges: Range[] = [];
        let curr = walker.nextNode() as Text | null;
        while (curr) {
          const val = curr.nodeValue || '';
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(val)) !== null) {
            if (m[0].length === 0) {
              re.lastIndex++;
              continue;
            }
            const r = document.createRange();
            r.setStart(curr, m.index);
            r.setEnd(curr, m.index + m[0].length);
            ranges.push(r);
          }
          curr = walker.nextNode() as Text | null;
        }
        if (ranges.length === 0) return 0;
        const safeIdx = ((targetIndex % ranges.length) + ranges.length) % ranges.length;
        const hitRange = ranges[safeIdx];
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(hitRange);
        const parentEl =
          hitRange.startContainer instanceof Element
            ? hitRange.startContainer
            : hitRange.startContainer.parentElement;
        parentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return ranges.length;
      },
      replaceAllText(findStr: string, replaceStr: string, opts?: FindOptions) {
        const instance = vditorRef.current;
        if (!instance || !isReadyRef.current || !findStr) return 0;
        const current = instance.getValue();
        try {
          const flags = opts?.caseSensitive ? 'g' : 'gi';
          const escaped = opts?.regex ? findStr : findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = opts?.wholeWord ? `\\b${escaped}\\b` : escaped;
          const re = new RegExp(pattern, flags);
          const matches = current.match(re);
          const count = matches ? matches.length : 0;
          if (count > 0) {
            const next = current.replace(re, replaceStr);
            instance.setValue(next, false);
            onChangeRef.current(next);
          }
          return count;
        } catch {
          return 0;
        }
      },
      applyTableAction(action: string) {
        if (!containerRef.current) return;
        executeTableAction(action, {
          target: lastSelectionElRef.current,
          pushUndo: pushVditorUndo,
          commitMarkdown: () => onChangeRef.current(vditorRef.current?.getValue() ?? value),
        });
      },
      applyImageAction(action: string) {
        const imgEl =
          (activeZoomImgRef.current instanceof HTMLImageElement ? activeZoomImgRef.current : null) ??
          (lastSelectionElRef.current?.closest('img') as HTMLImageElement | null);
        if (!imgEl) return;

        if (action === 'preview') {
          setLightboxItem({
            type: 'image',
            src: imgEl.src,
            alt: imgEl.alt,
          });
          return;
        }

        if (action.startsWith('scale:')) {
          const pct = Number(action.slice(6));
          if (pct > 0 && pct <= 100) {
            imgEl.dataset.vcatScale = String(pct);
            imgEl.style.maxWidth = `${pct}%`;
            imgEl.style.width = `${pct}%`;
          }
          return;
        }

        if (action === 'delete') {
          pushVditorUndo();
          const imgNode = imgEl.closest('.vditor-ir__node[data-type="img"]') ?? imgEl;
          imgNode.remove();
          if (activeZoomImgRef.current === imgEl) {
            activeZoomImgRef.current = null;
          }
          pushVditorUndo();
          onChangeRef.current(vditorRef.current?.getValue() ?? value);
        }
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      isReadyRef.current = false;

      const cdnBase = window.location.protocol === 'file:' ? './vditor' : '/vditor';

      // Ensure local KaTeX stylesheet is loaded upfront so math formulas never render unstyled
      if (!document.getElementById('vcat-katex-css')) {
        const link = document.createElement('link');
        link.id = 'vcat-katex-css';
        link.rel = 'stylesheet';
        link.href = `${cdnBase}/dist/js/katex/katex.min.css`;
        document.head.appendChild(link);
      }

      const instance = new Vditor(el, {
        mode: 'ir',
        cdn: cdnBase,
        height: '100%',
        cache: { enable: false },
        toolbar: [],
        outline: { enable: false, position: 'left' },
        preview: {
          markdown: {
            autoSpace: true,
            mark: true,
            gfmAutoLink: true,
          },
          hljs: {
            enable: true,
            style: 'github',
            lineNumber: false,
          },
          math: {
            engine: 'KaTeX',
            inlineDigit: true,
          },
        },
        value,
        after: () => {
          isReadyRef.current = true;
          if (pendingValueRef.current !== null && pendingValueRef.current !== instance.getValue()) {
            instance.setValue(pendingValueRef.current, true);
          }
          instance.clearStack();
        },
        // Debounce React state sync so typing & Cmd+Z undo remain instant on 68KB+ docs
        input: (md) => {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            onChangeRef.current(md);
          }, 320);
        },
        ctrlEnter: (md) => {
          onSaveRef.current?.(md);
        },
        upload: {
          accept: 'image/*',
          handler: async (files: File[]) => {
            for (const file of files) {
              const buffer = await file.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = '';
              for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const base64 = btoa(binary);
              const ext = file.name.split('.').pop() || 'png';
              const saved = await window.electronAPI.saveLocalImage(base64, ext);

              const sel = window.getSelection();
              const anchorEl =
                sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
              const activeCell = anchorEl?.closest('td, th') as HTMLElement | null;

              // Inside a table cell, insert an inline Lute IR image node without trailing newline
              // so it never breaks the table row into an extra row!
              if (activeCell && el.contains(activeCell)) {
                pushVditorUndo();
                const cleanRel = saved.relativeMarkdownPath.replace(/^\.\//, '');
                const irImg = document.createElement('span');
                irImg.className = 'vditor-ir__node';
                irImg.setAttribute('data-type', 'img');
                irImg.innerHTML =
                  `<span class="vditor-ir__marker">!</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--bracket">[</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--bracket">${file.name}</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--bracket">]</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--paren">(</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--link">${saved.relativeMarkdownPath}</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--paren">)</span>` +
                  `<img src="vcat-asset://local/${cleanRel}" alt="${file.name}" />`;
                if (sel && sel.rangeCount > 0 && activeCell.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                  const r = sel.getRangeAt(0);
                  r.deleteContents();
                  r.insertNode(irImg);
                  r.setStartAfter(irImg);
                  r.collapse(true);
                } else {
                  activeCell.appendChild(irImg);
                }
                pushVditorUndo();
                onChangeRef.current(instance.getValue());
              } else {
                instance.insertValue(`![${file.name}](${saved.relativeMarkdownPath})\n`);
              }
            }
            return null;
          },
        },
      });

      vditorRef.current = instance;

      let rafId = 0;
      const rewriteLocalImagesSync = () => {
        const imgs = el.querySelectorAll('img');
        imgs.forEach((img) => {
          const rawSrc = img.getAttribute('src');
          if (!rawSrc || /^(https?:|data:|vcat-asset:|blob:)/i.test(rawSrc)) return;
          const cleanRel = rawSrc.replace(/^\.\//, '');
          img.src = `vcat-asset://local/${cleanRel}`;
        });
      };

      const rerenderBrokenMermaid = () => {
        const mermaidPreviews = el.querySelectorAll('.vditor-ir__preview div.language-mermaid');
        mermaidPreviews.forEach((node) => {
          const mermaidDiv = node as HTMLElement;
          const irNode = mermaidDiv.closest('.vditor-ir__node');
          if (irNode?.classList.contains('vditor-ir__node--expand')) return;
          if (!mermaidDiv.querySelector('svg') && (mermaidDiv.textContent || '').trim()) {
            mermaidDiv.removeAttribute('data-processed');
            const previewPre = mermaidDiv.parentElement as HTMLElement | null;
            if (previewPre) {
              previewPre.setAttribute('data-render', '2');
              const vditorStatic = Vditor as unknown as {
                mermaidRender?: (el: HTMLElement, cdn?: string) => void;
              };
              vditorStatic.mermaidRender?.(previewPre, cdnBase);
            }
          }
        });
      };

      const renderLatexBlocks = () => {
        const latexCodes = el.querySelectorAll(
          '.vditor-ir__preview code.language-latex, .vditor-ir__preview code.language-tex, .vditor-ir__preview code.language-math'
        );
        latexCodes.forEach((codeEl) => {
          const previewPre = codeEl.closest('pre.vditor-ir__preview') as HTMLElement | null;
          if (!previewPre) return;
          if (!codeEl.classList.contains('language-math')) {
            codeEl.classList.add('language-math');
          }
          if (!previewPre.querySelector('.katex')) {
            const vditorStatic = Vditor as unknown as {
              mathRender?: (
                element: HTMLElement,
                options?: { cdn?: string; math?: { engine?: string; inlineDigit?: boolean } }
              ) => void;
            };
            vditorStatic.mathRender?.(previewPre, {
              cdn: cdnBase,
              math: { engine: 'KaTeX', inlineDigit: true },
            });
          }
        });
      };

      const positionLanguageHint = () => {
        const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
        if (!hintEl || hintEl.style.display === 'none' || hintEl.childElementCount === 0) return;
        const selNow = window.getSelection();
        const anchorEl =
          selNow?.anchorNode instanceof Element ? selNow.anchorNode : selNow?.anchorNode?.parentElement;
        const infoMarker =
          (anchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null) ??
          (document.activeElement?.closest?.('.vditor-ir__marker--info') as HTMLElement | null);
        if (!infoMarker || !el.contains(infoMarker)) return;

        const infoRect = infoMarker.getBoundingClientRect();
        const hintParent = (hintEl.offsetParent as HTMLElement | null) ?? el;
        const parentRect = hintParent.getBoundingClientRect();
        const hintH = hintEl.offsetHeight || 220;
        const spaceBelow = window.innerHeight - infoRect.bottom - 12;
        const topPx =
          spaceBelow >= Math.min(hintH, 160)
            ? infoRect.bottom - parentRect.top + 4
            : Math.max(4, infoRect.top - parentRect.top - hintH - 4);
        hintEl.style.top = `${Math.round(topPx)}px`;
        hintEl.style.left = `${Math.max(4, Math.round(infoRect.left - parentRect.left))}px`;
        hintEl.style.marginTop = '0px';
      };

      const cleanEmptyInlineNodes = () => {
        const inlineNodes = el.querySelectorAll(
          'span.vditor-ir__node[data-type="strong"], span.vditor-ir__node[data-type="em"], span.vditor-ir__node[data-type="s"], span.vditor-ir__node[data-type="code"]'
        );
        inlineNodes.forEach((node) => {
          const inner = node.querySelector('strong, b, em, i, s, del, code');
          const innerText = (inner?.textContent || '').replace(/\u200b/g, '');
          if (innerText.length === 0) {
            const parent = node.parentNode;
            node.remove();
            if (parent instanceof HTMLElement && parent.childNodes.length === 0) {
              parent.innerHTML = '<br>';
            }
          }
        });
      };

      const enhanceDom = () => {
        rewriteLocalImagesSync();
        positionLanguageHint();
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rewriteLocalImagesSync();
          positionLanguageHint();
          cleanEmptyInlineNodes();
          applyCodeSyntaxHighlights(el);
          renderLatexBlocks();
          const htmlNodes = el.querySelectorAll('.vditor-ir__node[data-type="html-block"]');
          htmlNodes.forEach((node) => {
            const rawText = (node.textContent || '').trim();
            if (rawText === '</details>' || rawText === '<details>') {
              node.classList.add('vcat-details-boundary');
            } else {
              node.classList.remove('vcat-details-boundary');
            }
          });
        });
      };

      const observer = new MutationObserver(enhanceDom);
      observer.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['src'],
      });
      enhanceDom();

      const handleKeyDownCapture = (e: KeyboardEvent) => {
        const targetNode = e.target as HTMLElement | null;
        if (targetNode && (targetNode.tagName === 'INPUT' || targetNode.tagName === 'TEXTAREA')) {
          return;
        }

        // Inside code block language tag (.vditor-ir__marker--info):
        // - ArrowUp/Down/Left/Right navigate .vditor-hint candidates
        // - Enter or Tab picks highlighted (or 1st) candidate and moves caret into code/LaTeX box
        const infoMarker = targetNode?.closest('.vditor-ir__marker--info') as HTMLElement | null;
        if (infoMarker && el.contains(infoMarker) && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
          const hintButtons = hintEl
            ? Array.from(hintEl.querySelectorAll('button'))
            : [];
          const hintVisible = Boolean(
            hintEl && hintEl.style.display !== 'none' && hintButtons.length > 0
          );

          if (hintVisible && (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
            e.preventDefault();
            e.stopPropagation();
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

          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            const codeBlockNode = infoMarker.closest('.vditor-ir__node[data-type="code-block"]');
            const codeEl = codeBlockNode?.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
            if (hintVisible) {
              const chosenBtn =
                hintButtons.find((b) => b.classList.contains('vditor-hint--current')) ?? hintButtons[0];
              const chosenLang = (chosenBtn?.textContent || '').trim();
              if (chosenLang) {
                infoMarker.textContent = `\u200b${chosenLang}`;
                if (codeEl) {
                  codeEl.className = `language-${chosenLang}`;
                }
                const previewCode = codeBlockNode?.querySelector('pre.vditor-ir__preview > code');
                if (previewCode) {
                  previewCode.className = `language-${chosenLang}`;
                }
              }
              if (hintEl) hintEl.style.display = 'none';
              onChangeRef.current(instance.getValue());
            }
            if (codeEl) {
              const selNow = window.getSelection();
              if (selNow) {
                const range = document.createRange();
                range.selectNodeContents(codeEl);
                range.collapse(true);
                selNow.removeAllRanges();
                selNow.addRange(range);
              }
            }
            return;
          }
        }

        // Space key toggles Lightbox when an image or Mermaid diagram is currently selected
        // (and prevents page-down scrolling when pressing Space repeatedly!)
        if (
          e.key === ' ' &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          !e.shiftKey &&
          activeZoomImgRef.current &&
          el.contains(activeZoomImgRef.current)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const activeEl = activeZoomImgRef.current as HTMLElement;
          setLightboxItem((prev) => {
            if (prev) return null;
            if (activeEl.classList.contains('language-mermaid')) {
              return { type: 'mermaid', svgHtml: activeEl.innerHTML };
            }
            const img = activeEl as HTMLImageElement;
            return { type: 'image', src: img.src, alt: img.alt };
          });
          return;
        }

        // Backspace or Delete removes a selected image immediately
        if (
          (e.key === 'Backspace' || e.key === 'Delete') &&
          activeZoomImgRef.current &&
          el.contains(activeZoomImgRef.current) &&
          activeZoomImgRef.current.tagName === 'IMG'
        ) {
          e.preventDefault();
          e.stopPropagation();
          pushVditorUndo();
          const activeImg = activeZoomImgRef.current;
          const imgWrapper = activeImg.closest('.vditor-ir__node[data-type="img"]') ?? activeImg;
          imgWrapper.remove();
          activeZoomImgRef.current = null;
          setLightboxItem(null);
          pushVditorUndo();
          onChangeRef.current(instance.getValue());
          return;
        }

        if (!el.contains(targetNode)) return;

        const sel = window.getSelection();
        const anchorEl =
          sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
        const activeCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;

        // Prevent accidental table column splitting or row corruption inside table cells
        if (activeCell && el.contains(activeCell)) {
          // Allow Backspace/Delete inside a table cell to delete an image inside that cell
          if (e.key === 'Backspace' || e.key === 'Delete') {
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
                pushVditorUndo();
                cellImg.remove();
                pushVditorUndo();
                onChangeRef.current(instance.getValue());
                return;
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
          // Block Vditor built-in table column/row split hotkeys (Cmd/Ctrl+Shift+L/R/U/D/Enter)
          if ((e.metaKey || e.ctrlKey) && (e.shiftKey || e.altKey || e.key === 'Enter')) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }

        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === 'b') {
            e.preventDefault();
            e.stopPropagation();
            toggleInlineWrap('bold');
          } else if (k === 'i') {
            e.preventDefault();
            e.stopPropagation();
            toggleInlineWrap('italic');
          } else if (k === 'z' || k === 'y') {
            setTimeout(rerenderBrokenMermaid, 50);
          }
        } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
          setTimeout(rerenderBrokenMermaid, 50);
          return;
        }

        // Auto-pair matching brackets/quotes when enabled (exclude backtick ` so typing ``` code fences works natively)
        const PAIR_MAP: Record<string, string> = {
          '(': ')',
          '[': ']',
          '{': '}',
          '"': '"',
          "'": "'",
          '（': '）',
          '【': '】',
          '「': '」',
        };
        if (
          prefsRef.current.autoPairSymbols &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          PAIR_MAP[e.key] &&
          targetNode &&
          el.contains(targetNode) &&
          !targetNode.closest('.vditor-ir__marker--info')
        ) {
          const selNow = window.getSelection();
          if (selNow && selNow.rangeCount > 0) {
            const range = selNow.getRangeAt(0);
            const selectedText = range.toString();
            const closeChar = PAIR_MAP[e.key];
            e.preventDefault();
            e.stopPropagation();
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
            onChangeRef.current(instance.getValue());
          }
        }
      };

      // Single-click image or Mermaid diagram opens Lightbox (same as Space); rapid double-click Mermaid edits code in-place
      const clearActiveZoomTarget = () => {
        if (activeZoomImgRef.current) {
          activeZoomImgRef.current.style.outline = '';
          activeZoomImgRef.current.closest('.vditor-ir__node')?.classList.remove('vcat-mermaid-active');
          activeZoomImgRef.current = null;
        }
      };

      const getMermaidPreviewEl = (target: HTMLElement | null): HTMLElement | null => {
        const mermaidEl = target?.closest('.vditor-ir__preview div.language-mermaid') as HTMLElement | null;
        if (!mermaidEl) return null;
        const irNode = mermaidEl.closest('.vditor-ir__node') as HTMLElement | null;
        if (irNode?.classList.contains('vditor-ir__node--expand')) return null;
        return mermaidEl;
      };

      const handleMouseDownCapture = (e: MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;

        // Clicking the 3 macOS dots at top-left of a code block highlights & focuses its language tag
        const codeBlockNode = target?.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null;
        if (codeBlockNode) {
          const rect = codeBlockNode.getBoundingClientRect();
          const relX = e.clientX - rect.left;
          const relY = e.clientY - rect.top;
          if (relX >= 4 && relX <= 68 && relY >= 4 && relY <= 30) {
            const infoSpan = codeBlockNode.querySelector('.vditor-ir__marker--info') as HTMLElement | null;
            if (infoSpan) {
              e.preventDefault();
              e.stopPropagation();
              codeBlockNode.classList.add('vditor-ir__node--expand');
              const sel = window.getSelection();
              if (sel) {
                const range = document.createRange();
                range.selectNodeContents(infoSpan);
                sel.removeAllRanges();
                sel.addRange(range);
              }
              return;
            }
          }
        }

        const imgEl = target?.closest('img') as HTMLImageElement | null;
        const mermaidEl = imgEl ? null : getMermaidPreviewEl(target);

        if (mermaidEl) {
          e.preventDefault();
          e.stopPropagation();
          if (mermaidClickTimerRef.current) {
            clearTimeout(mermaidClickTimerRef.current);
            mermaidClickTimerRef.current = null;
          }
          if (e.detail >= 2) {
            clearActiveZoomTarget();
            setLightboxItem(null);
            const irNode = mermaidEl.closest('.vditor-ir__node') as HTMLElement | null;
            const codeEl = irNode?.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
            if (irNode && codeEl) {
              irNode.classList.add('vditor-ir__node--expand');
              const sel = window.getSelection();
              if (sel) {
                const range = document.createRange();
                range.selectNodeContents(codeEl);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
            return;
          }
          if (activeZoomImgRef.current && activeZoomImgRef.current !== mermaidEl) {
            clearActiveZoomTarget();
          }
          activeZoomImgRef.current = mermaidEl as unknown as HTMLImageElement;
          mermaidEl.closest('.vditor-ir__node')?.classList.add('vcat-mermaid-active');

          const svgSnapshot = mermaidEl.innerHTML;
          mermaidClickTimerRef.current = setTimeout(() => {
            mermaidClickTimerRef.current = null;
            setLightboxItem({
              type: 'mermaid',
              svgHtml: svgSnapshot,
            });
          }, 200);
          return;
        }

        if (activeZoomImgRef.current && activeZoomImgRef.current !== imgEl) {
          clearActiveZoomTarget();
        }
        if (imgEl) {
          e.preventDefault();
          e.stopPropagation();
          activeZoomImgRef.current = imgEl;
          imgEl.style.outline = '2px solid var(--accent)';
          imgEl.style.outlineOffset = '2px';
          setLightboxItem({
            type: 'image',
            src: imgEl.src,
            alt: imgEl.alt,
          });
        }
      };

      const handleClickCapture = (e: MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        const imgEl = target?.closest('img');
        const mermaidEl = imgEl ? null : getMermaidPreviewEl(target);
        if (imgEl || mermaidEl) {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const target = e.target as HTMLElement | null;
        lastSelectionElRef.current = target;
        const imgEl = target?.closest('img') as HTMLImageElement | null;
        if (imgEl) {
          activeZoomImgRef.current = imgEl;
          const rawScale = Number(imgEl.dataset.vcatScale || '');
          const rootScale = Number(
            document.documentElement.style.getPropertyValue('--vcat-img-max-width').replace('%', '') || 50
          );
          const imageScale = rawScale > 0 ? rawScale : rootScale;
          void window.electronAPI?.showEditorContextMenu?.({
            inTable: Boolean(target?.closest('table')),
            inImage: true,
            imageScale,
            hasSelection: false,
          });
          return;
        }
        const inTable = Boolean(target?.closest('table'));
        const sel = window.getSelection();
        const hasSelection = Boolean(sel && !sel.isCollapsed);
        void window.electronAPI?.showEditorContextMenu?.({ inTable, hasSelection });
      };

      const handlePasteCapture = (e: ClipboardEvent) => {
        const html = e.clipboardData?.getData('text/html') ?? '';
        const plain = e.clipboardData?.getData('text/plain') ?? '';
        // Strip external editor internal HTML/SVG wrappers (e.g. .md-fences, .md-diagram, <svg)
        // so pasting produces clean Markdown/code instead of raw HTML or black SVG boxes
        if (plain && /(md-fences|md-diagram|mdtype=|<svg\b)/i.test(html)) {
          e.preventDefault();
          e.stopPropagation();
          instance.insertValue(plain);
        }
      };

      const handleCopyCapture = (e: ClipboardEvent) => {
        const mode = prefsRef.current.copyFormat;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !el.contains(sel.anchorNode)) return;
        const plain = sel.toString();
        if (!plain) return;

        if (mode === 'plain') {
          e.preventDefault();
          e.stopPropagation();
          e.clipboardData?.setData('text/plain', plain);
          return;
        }
        if (mode === 'markdown') {
          const frag = sel.getRangeAt(0).cloneContents();
          const tmp = document.createElement('div');
          tmp.appendChild(frag);
          const md = instance.html2md(tmp.innerHTML).trim() || plain;
          e.preventDefault();
          e.stopPropagation();
          e.clipboardData?.setData('text/plain', md);
        }
      };

      el.addEventListener('copy', handleCopyCapture, true);
      el.addEventListener('paste', handlePasteCapture, true);
      window.addEventListener('keydown', handleKeyDownCapture, true);
      el.addEventListener('mousedown', handleMouseDownCapture, true);
      el.addEventListener('click', handleClickCapture, true);
      el.addEventListener('contextmenu', handleContextMenu);

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        el.removeEventListener('copy', handleCopyCapture, true);
        el.removeEventListener('paste', handlePasteCapture, true);
        window.removeEventListener('keydown', handleKeyDownCapture, true);
        el.removeEventListener('mousedown', handleMouseDownCapture, true);
        el.removeEventListener('click', handleClickCapture, true);
        el.removeEventListener('contextmenu', handleContextMenu);
        observer.disconnect();
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        if (mermaidClickTimerRef.current) clearTimeout(mermaidClickTimerRef.current);
        isReadyRef.current = false;
        try {
          vditorRef.current?.destroy();
        } catch {
          // Ignore teardown race when unmounting before Vditor finishes async lute load
        }
        vditorRef.current = null;
      };
    }, []);

    useEffect(() => {
      const instance = vditorRef.current;
      if (!instance || !isReadyRef.current) return;
      try {
        if (instance.getValue() !== value) {
          instance.setValue(value, true);
          instance.clearStack();
        }
      } catch {
        // Fallback handled by pendingValueRef in after()
      }
    }, [articleKey, loadSeq]);

    return (
      <>
        <div ref={containerRef} className="h-full w-full" />
        <MediaLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      </>
    );
  }
);
