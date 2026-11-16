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

    const lastFormatRef = useRef<{ cmd: string; ts: number }>({ cmd: '', ts: 0 });
    const toggleInlineWrap = (cmd: InlineWrapCommand) => {
      const now = Date.now();
      if (lastFormatRef.current.cmd === cmd && now - lastFormatRef.current.ts < 80) {
        return;
      }
      lastFormatRef.current = { cmd, ts: now };
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

      // Ensure local KaTeX stylesheet & script are loaded upfront so math formulas render synchronously
      if (!document.getElementById('vcat-katex-css')) {
        const link = document.createElement('link');
        link.id = 'vcat-katex-css';
        link.rel = 'stylesheet';
        link.href = `${cdnBase}/dist/js/katex/katex.min.css`;
        document.head.appendChild(link);
      }
      if (!document.getElementById('vcat-katex-js')) {
        const script = document.createElement('script');
        script.id = 'vcat-katex-js';
        script.src = `${cdnBase}/dist/js/katex/katex.min.js`;
        document.head.appendChild(script);
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

      let lastActiveInfoMarker: HTMLElement | null = null;
      let hintNavigatedByArrow = false;

      const setVditorRecentLang = (lang: string) => {
        const internal = instance as unknown as {
          vditor?: { hint?: { recentLanguage?: string } };
        };
        if (internal.vditor?.hint) {
          internal.vditor.hint.recentLanguage = lang;
        }
      };

      const safeDecode = (raw: string): string => {
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      };

      const getCodeBlockLang = (codeBlock: Element): string => {
        const infoEl = codeBlock.querySelector('.vditor-ir__marker--info');
        const infoLang = (infoEl?.textContent || '').replace(/\u200b/g, '').trim().toLowerCase();
        if (infoLang) return infoLang;
        const codeEl = codeBlock.querySelector('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code');
        const match = codeEl?.className.match(/language-([^\s]+)/);
        return match ? match[1].toLowerCase() : '';
      };

      const ensurePreviewPre = (codeBlock: Element): HTMLElement => {
        let previewPre = codeBlock.querySelector('pre.vditor-ir__preview') as HTMLElement | null;
        if (!previewPre) {
          previewPre = document.createElement('pre');
          previewPre.className = 'vditor-ir__preview';
          previewPre.setAttribute('contenteditable', 'false');
          const markerPre = codeBlock.querySelector('pre.vditor-ir__marker--pre');
          if (markerPre) {
            markerPre.insertAdjacentElement('afterend', previewPre);
          } else {
            codeBlock.appendChild(previewPre);
          }
        }
        return previewPre;
      };

      const cleanStrayCodeBlockFences = () => {
        const editCodes = el.querySelectorAll('.vditor-ir__node[data-type="code-block"] pre.vditor-ir__marker--pre > code');
        editCodes.forEach((node) => {
          const text = node.textContent || '';
          if (/^[\u200b\s]*`{3,}[\u200b\s]*$/.test(text)) {
            node.textContent = '\u200b';
          }
        });
      };

      const rerenderBrokenMermaid = () => {
        const vditorStatic = Vditor as unknown as {
          mermaidRender?: (el: HTMLElement, cdn?: string) => void;
        };
        const codeBlocks = el.querySelectorAll('.vditor-ir__node[data-type="code-block"]');
        codeBlocks.forEach((codeBlock) => {
          if (codeBlock.classList.contains('vditor-ir__node--expand')) return;
          if (getCodeBlockLang(codeBlock) !== 'mermaid') return;
          const editCode = codeBlock.querySelector('pre.vditor-ir__marker--pre > code');
          const previewPre = ensurePreviewPre(codeBlock);
          const srcText = (editCode?.textContent || previewPre.textContent || '').replace(/\u200b/g, '');
          if (!srcText.trim()) return;

          let mermaidDiv = previewPre.querySelector('div.language-mermaid') as HTMLElement | null;
          if (!mermaidDiv) {
            previewPre.innerHTML = '';
            mermaidDiv = document.createElement('div');
            mermaidDiv.className = 'language-mermaid';
            previewPre.appendChild(mermaidDiv);
          }
          if (!mermaidDiv.querySelector('svg') || previewPre.dataset.vcatMermaidSrc !== srcText) {
            previewPre.dataset.vcatMermaidSrc = srcText;
            if (!mermaidDiv.querySelector('svg') || mermaidDiv.textContent !== srcText) {
              mermaidDiv.textContent = srcText;
              mermaidDiv.removeAttribute('data-processed');
            }
            previewPre.setAttribute('data-render', '2');
            vditorStatic.mermaidRender?.(previewPre, cdnBase);
          }
        });
      };

      const renderLatexBlocks = () => {
        const vditorStatic = Vditor as unknown as {
          mathRender?: (
            element: HTMLElement,
            options?: { cdn?: string; math?: { engine?: string; inlineDigit?: boolean } }
          ) => void;
        };
        const katexGlobal = (window as unknown as {
          katex?: { renderToString?: (tex: string, opts: Record<string, unknown>) => string };
        }).katex;

        const codeBlocks = el.querySelectorAll('.vditor-ir__node[data-type="code-block"]');
        codeBlocks.forEach((codeBlock) => {
          const lang = getCodeBlockLang(codeBlock);
          if (lang !== 'latex' && lang !== 'tex' && lang !== 'math') return;
          const editCode = codeBlock.querySelector('pre.vditor-ir__marker--pre > code');
          const previewPre = ensurePreviewPre(codeBlock);
          const srcText = (editCode?.textContent || previewPre.textContent || '').replace(/\u200b/g, '');
          if (!srcText.trim()) {
            previewPre.dataset.vcatMathSrc = '';
            return;
          }
          if (!previewPre.querySelector('.katex') || previewPre.dataset.vcatMathSrc !== srcText) {
            previewPre.setAttribute('data-render', '2');
            if (katexGlobal?.renderToString) {
              previewPre.dataset.vcatMathSrc = srcText;
              previewPre.innerHTML = '';
              const mathDiv = document.createElement('div');
              mathDiv.className = 'language-math';
              mathDiv.setAttribute('data-math', srcText);
              mathDiv.innerHTML = katexGlobal.renderToString(srcText, {
                displayMode: true,
                output: 'html',
                throwOnError: false,
              });
              previewPre.appendChild(mathDiv);
            } else {
              previewPre.innerHTML = '';
              const previewCode = document.createElement('code');
              previewCode.className = 'language-math';
              previewCode.textContent = srcText;
              previewPre.appendChild(previewCode);
              vditorStatic.mathRender?.(previewPre, {
                cdn: cdnBase,
                math: { engine: 'KaTeX', inlineDigit: true },
              });
            }
          }
        });

        const standaloneMath = el.querySelectorAll(
          '.vditor-ir__preview code.language-latex, .vditor-ir__preview code.language-tex, .vditor-ir__preview code.language-math'
        );
        standaloneMath.forEach((codeEl) => {
          if (codeEl.closest('.vditor-ir__node[data-type="code-block"]')) return;
          const previewPre = codeEl.closest('pre.vditor-ir__preview') as HTMLElement | null;
          if (!previewPre) return;
          if (!codeEl.classList.contains('language-math')) {
            codeEl.classList.add('language-math');
          }
          if (!previewPre.querySelector('.katex')) {
            vditorStatic.mathRender?.(previewPre, {
              cdn: cdnBase,
              math: { engine: 'KaTeX', inlineDigit: true },
            });
          }
        });
      };

      const commitCodeBlockLanguage = (infoMarker: HTMLElement, rawLang: string) => {
        const cleanLang = safeDecode(rawLang).replace(/\u200b/g, '').trim();
        lastActiveInfoMarker = infoMarker;
        hintNavigatedByArrow = false;
        setVditorRecentLang(cleanLang);
        infoMarker.textContent = cleanLang ? `\u200b${cleanLang}` : '\u200b';

        const codeBlock = infoMarker.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null;
        if (codeBlock) {
          codeBlock.setAttribute('data-CodeLang', cleanLang || 'text');
          const codeEl = codeBlock.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
          const previewCodeEl = codeBlock.querySelector('pre.vditor-ir__preview > code') as HTMLElement | null;
          if (codeEl) {
            codeEl.className = cleanLang ? `language-${cleanLang}` : '';
            const rawCode = codeEl.textContent || '';
            if (/^[\u200b\s]*`{3,}[\u200b\s]*$/.test(rawCode)) {
              codeEl.textContent = '\u200b';
            }
          }
          if (previewCodeEl) {
            previewCodeEl.className = cleanLang ? `language-${cleanLang}` : '';
          }
          const previewPre = codeBlock.querySelector('pre.vditor-ir__preview') as HTMLElement | null;
          if (previewPre) {
            delete previewPre.dataset.vcatMathSrc;
            delete previewPre.dataset.vcatMermaidSrc;
          }
        }

        const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
        if (hintEl) {
          hintEl.style.display = 'none';
        }

        if (codeBlock) {
          codeBlock.classList.add('vditor-ir__node--expand');
          const codeEl = codeBlock.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
          if (codeEl) {
            if (!codeEl.firstChild || (codeEl.textContent || '').length === 0) {
              codeEl.textContent = '\u200b';
            }
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(codeEl);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }

        requestAnimationFrame(() => {
          cleanStrayCodeBlockFences();
          applyCodeSyntaxHighlights(el);
          renderLatexBlocks();
          rerenderBrokenMermaid();
          try {
            onChangeRef.current(instance.getValue());
          } catch {
            // ignore serialization race while tearing down
          }
        });
      };

      const COMMON_CODE_LANGUAGES = [
        'c', 'cpp', 'csharp', 'css', 'csv', 'cmake', 'clojure', 'coffeescript',
        'python', 'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx',
        'json', 'latex', 'tex', 'math', 'mermaid', 'echarts', 'mindmap', 'flowchart', 'plantuml', 'graphviz',
        'yaml', 'yml', 'toml', 'ini', 'sql', 'bash', 'sh', 'shell', 'zsh', 'powershell',
        'html', 'xml', 'markdown', 'md', 'go', 'rust', 'java', 'kotlin', 'swift', 'ruby', 'php',
        'dockerfile', 'makefile', 'nginx', 'graphql', 'diff', 'text', 'plaintext', 'txt',
      ];

      let isRepositioningHint = false;
      const positionLanguageHint = () => {
        if (isRepositioningHint) return;
        const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
        if (!hintEl || hintEl.style.display === 'none' || hintEl.childElementCount === 0) return;
        const selNow = window.getSelection();
        const anchorEl =
          selNow?.anchorNode instanceof Element ? selNow.anchorNode : selNow?.anchorNode?.parentElement;
        const infoMarker =
          (anchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null) ??
          (document.activeElement?.closest?.('.vditor-ir__marker--info') as HTMLElement | null) ??
          (lastActiveInfoMarker && el.contains(lastActiveInfoMarker) ? lastActiveInfoMarker : null);
        if (!infoMarker || !el.contains(infoMarker)) return;
        lastActiveInfoMarker = infoMarker;

        const curKey = (infoMarker.textContent || '').replace(/\u200b/g, '').trim().toLowerCase();
        if (curKey && (hintEl.dataset.vcatSortedFor !== curKey || !hintEl.querySelector('button[data-vcat-sorted]'))) {
          hintEl.dataset.vcatSortedFor = curKey;
          const existingVals = Array.from(hintEl.querySelectorAll('button')).map((b) =>
            safeDecode(b.getAttribute('data-value') || b.textContent || '').replace(/\u200b/g, '').trim()
          );
          const hljsLangs =
            (window as unknown as { hljs?: { listLanguages?: () => string[] } }).hljs?.listLanguages?.() ?? [];
          const seen = new Set<string>();
          const pool: string[] = [];
          for (const raw of [...COMMON_CODE_LANGUAGES, ...hljsLangs, ...existingVals]) {
            const v = raw.trim();
            if (!v) continue;
            const low = v.toLowerCase();
            if (!seen.has(low) && low.includes(curKey)) {
              seen.add(low);
              pool.push(v);
            }
          }
          pool.sort((a, b) => {
            const al = a.toLowerCase();
            const bl = b.toLowerCase();
            const aRank = al === curKey ? 0 : al.startsWith(curKey) ? 1 : 2;
            const bRank = bl === curKey ? 0 : bl.startsWith(curKey) ? 1 : 2;
            if (aRank !== bRank) return aRank - bRank;
            if (al.length !== bl.length) return al.length - bl.length;
            return al.localeCompare(bl);
          });
          const topLangs = pool.slice(0, 8);
          if (topLangs.length > 0) {
            isRepositioningHint = true;
            hintEl.innerHTML = '';
            topLangs.forEach((lang, idx) => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.setAttribute('data-vcat-sorted', '1');
              btn.setAttribute('data-value', `${encodeURIComponent(lang)} `);
              if (idx === 0) btn.className = 'vditor-hint--current';
              const low = lang.toLowerCase();
              const matchPos = low.indexOf(curKey);
              btn.appendChild(document.createTextNode(' '));
              if (matchPos >= 0) {
                if (matchPos > 0) btn.appendChild(document.createTextNode(lang.slice(0, matchPos)));
                const bEl = document.createElement('b');
                bEl.textContent = lang.slice(matchPos, matchPos + curKey.length);
                btn.appendChild(bEl);
                if (matchPos + curKey.length < lang.length) {
                  btn.appendChild(document.createTextNode(lang.slice(matchPos + curKey.length)));
                }
              } else {
                btn.appendChild(document.createTextNode(lang));
              }
              hintEl.appendChild(btn);
            });
          }
        } else if (!curKey) {
          delete hintEl.dataset.vcatSortedFor;
        }

        const infoRect = infoMarker.getBoundingClientRect();
        if (infoRect.width === 0 && infoRect.height === 0) {
          isRepositioningHint = false;
          return;
        }
        const hintH = hintEl.offsetHeight || 220;
        const spaceBelow = window.innerHeight - infoRect.bottom - 12;
        const topPx =
          spaceBelow >= Math.min(hintH, 140)
            ? Math.round(infoRect.bottom + 4)
            : Math.max(8, Math.round(infoRect.top - hintH - 4));
        const leftPx = Math.max(8, Math.round(infoRect.left));
        isRepositioningHint = true;
        hintEl.style.position = 'fixed';
        hintEl.style.top = `${topPx}px`;
        hintEl.style.left = `${leftPx}px`;
        hintEl.style.marginTop = '0px';
        queueMicrotask(() => {
          isRepositioningHint = false;
        });
      };

      const normalizeEmojiAndCalloutIcons = () => {
        const resetEl = el.querySelector('.vditor-ir .vditor-reset');
        if (!resetEl) return;
        const activeNode = window.getSelection()?.anchorNode ?? null;
        // Monochrome text-presentation icons lacking \uFE0F variant selector -> upgrade to Apple Color Emoji
        const MONO_TO_COLOR_RE =
          /([\u26A0\u23F1\u23F2\u23F0\u2699\u2696\u270D\u26F0\u26A1\u2139\u2764\u2708\u2702\u270F\u2600\u2601\u2602\u2603\u2611\u267B\u2714\u2716\u203C\u2049\u{1F5C2}\u{1F3D7}\u{1F6E0}\u{1F5BC}\u{1F441}\u{1F3F7}\u{1F5DD}\u{1F5C3}\u{1F5C4}\u{1F5D1}\u{1F5D3}\u{1F5D2}])(?!\uFE0F)/gu;
        const TIGHT_INLINE_ICON_RE =
          /((?:[\u26A0\u23F1\u23F2\u23F0\u2699\u2696\u270D\u26F0\u26A1\u2139\u2764\u2708\u2702\u270F\u2600\u2601\u2602\u2603\u2611\u267B\u2714\u2716\u{1F300}-\u{1FAFF}])\uFE0F?)(?=[\p{Script=Han}A-Za-z0-9])/gu;
        const ENDS_WITH_ICON_RE =
          /(?:[\u26A0\u23F1\u23F2\u23F0\u2699\u2696\u270D\u26F0\u26A1\u2139\u2764\u2708\u2702\u270F\u2600\u2601\u2602\u2603\u2611\u267B\u2714\u2716\u{1F300}-\u{1FAFF}])\uFE0F?$/u;

        const walker = document.createTreeWalker(resetEl, NodeFilter.SHOW_TEXT);
        let tNode = walker.nextNode() as Text | null;
        while (tNode) {
          if (
            tNode !== activeNode &&
            !tNode.parentElement?.closest('pre:not(.vditor-reset), code, .katex, .vditor-ir__marker')
          ) {
            const orig = tNode.nodeValue || '';
            let nextVal = orig.replace(MONO_TO_COLOR_RE, '$1\uFE0F');
            nextVal = nextVal.replace(TIGHT_INLINE_ICON_RE, '$1 ');
            // Also add a space when an emoji/icon ends a text node immediately before an inline element (e.g. ⚠️**学习者**)
            if (
              ENDS_WITH_ICON_RE.test(nextVal) &&
              tNode.nextSibling instanceof Element &&
              tNode.nextSibling.tagName !== 'BR' &&
              !(tNode.nextSibling.textContent || '').startsWith(' ')
            ) {
              nextVal = `${nextVal} `;
            }
            if (nextVal !== orig) {
              tNode.nodeValue = nextVal;
            }
          }
          tNode = walker.nextNode() as Text | null;
        }
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
        // Strip literal orphaned **** markers left when bold text inside was deleted
        const resetEl = el.querySelector('.vditor-ir .vditor-reset');
        if (resetEl) {
          const walker = document.createTreeWalker(resetEl, NodeFilter.SHOW_TEXT);
          let tNode = walker.nextNode() as Text | null;
          while (tNode) {
            const val = tNode.nodeValue || '';
            if (val.includes('****') && !tNode.parentElement?.closest('pre:not(.vditor-reset), code')) {
              tNode.nodeValue = val.replace(/\*{4,}/g, '');
            }
            tNode = walker.nextNode() as Text | null;
          }
        }
      };

      const enhanceDom = () => {
        rewriteLocalImagesSync();
        positionLanguageHint();
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rewriteLocalImagesSync();
          positionLanguageHint();
          cleanStrayCodeBlockFences();
          cleanEmptyInlineNodes();
          normalizeEmojiAndCalloutIcons();
          applyCodeSyntaxHighlights(el);
          renderLatexBlocks();
          rerenderBrokenMermaid();
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
        attributeFilter: ['src', 'style', 'class'],
      });
      enhanceDom();

      const handleKeyDownCapture = (e: KeyboardEvent) => {
        const targetNode = e.target as HTMLElement | null;
        if (targetNode && (targetNode.tagName === 'INPUT' || targetNode.tagName === 'TEXTAREA')) {
          return;
        }

        // Inside code block language tag (.vditor-ir__marker--info):
        // Use selection anchorNode (e.target in contenteditable is outer .vditor-reset, not inner span!)
        const selInfo = window.getSelection();
        const selAnchorEl =
          selInfo?.anchorNode instanceof Element
            ? selInfo.anchorNode
            : selInfo?.anchorNode?.parentElement;
        const infoMarker =
          (selAnchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null) ??
          (targetNode?.closest('.vditor-ir__marker--info') as HTMLElement | null);
        if (infoMarker && el.contains(infoMarker) && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (lastActiveInfoMarker !== infoMarker) {
            hintNavigatedByArrow = false;
          }
          lastActiveInfoMarker = infoMarker;
          const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
          const hintButtons = hintEl
            ? Array.from(hintEl.querySelectorAll('button'))
            : [];
          const hintVisible = Boolean(
            hintEl && hintEl.style.display !== 'none' && hintButtons.length > 0
          );

          if (e.key === 'Backspace' || e.key === 'Delete') {
            hintNavigatedByArrow = false;
            setVditorRecentLang('');
            const curLangText = (infoMarker.textContent || '').replace(/\u200b/g, '');
            if (e.key === 'Backspace' && curLangText.length === 0) {
              // Keep the marker span intact when already empty so Backspace never deletes the badge node
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              if (infoMarker.textContent !== '\u200b') {
                infoMarker.textContent = '\u200b';
              }
              return;
            }
            queueMicrotask(() => {
              if ((infoMarker.textContent || '').replace(/\u200b/g, '').trim() === '') {
                setVditorRecentLang('');
                if (infoMarker.textContent !== '\u200b') {
                  infoMarker.textContent = '\u200b';
                }
                infoMarker.closest('.vditor-ir__node[data-type="code-block"]')?.setAttribute('data-CodeLang', 'text');
              }
            });
          }

          if (hintVisible && (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            hintNavigatedByArrow = true;
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
            e.stopImmediatePropagation();
            const rawCurText = (infoMarker.textContent || '').replace(/\u200b/g, '').trim();
            const shouldUseHint = hintVisible && (rawCurText.length > 0 || hintNavigatedByArrow);
            const chosenBtn = shouldUseHint
              ? hintButtons.find((b) => b.classList.contains('vditor-hint--current')) ?? hintButtons[0]
              : null;
            const rawChoice = chosenBtn
              ? chosenBtn.getAttribute('data-value') || chosenBtn.textContent || ''
              : rawCurText;
            commitCodeBlockLanguage(infoMarker, rawChoice);
            return;
          }

          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            commitCodeBlockLanguage(infoMarker, infoMarker.textContent || '');
            return;
          }

          if (e.key.length === 1) {
            hintNavigatedByArrow = false;
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
          if (k === 'b' || k === 'i') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (e.repeat) return;
            toggleInlineWrap(k === 'b' ? 'bold' : 'italic');
            return;
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
        const CLOSE_CHARS = new Set(Object.values(PAIR_MAP));
        if (
          prefsRef.current.autoPairSymbols &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          !e.isComposing &&
          targetNode &&
          el.contains(targetNode) &&
          !selAnchorEl?.closest('.vditor-ir__marker--info') &&
          !targetNode.closest('.vditor-ir__marker--info')
        ) {
          const selNow = window.getSelection();
          if (selNow && selNow.rangeCount > 0) {
            const range = selNow.getRangeAt(0);

            // Overtype skip: if the next character immediately after the collapsed caret matches the typed closing symbol, step over it
            if (CLOSE_CHARS.has(e.key) && range.collapsed) {
              const container = range.startContainer;
              const offset = range.startOffset;
              if (container.nodeType === Node.TEXT_NODE) {
                const text = container.nodeValue || '';
                if (text.charAt(offset) === e.key) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                  const nextRange = document.createRange();
                  nextRange.setStart(container, offset + 1);
                  nextRange.collapse(true);
                  selNow.removeAllRanges();
                  selNow.addRange(nextRange);
                  return;
                }
                if (
                  offset === text.length &&
                  container.nextSibling?.nodeType === Node.TEXT_NODE &&
                  (container.nextSibling.nodeValue || '').startsWith(e.key)
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                  const nextRange = document.createRange();
                  nextRange.setStart(container.nextSibling, 1);
                  nextRange.collapse(true);
                  selNow.removeAllRanges();
                  selNow.addRange(nextRange);
                  return;
                }
              }
            }

            if (PAIR_MAP[e.key]) {
              const selectedText = range.toString();
              const closeChar = PAIR_MAP[e.key];
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
              onChangeRef.current(instance.getValue());
            }
          }
        }
      };

      // Single-click image or Mermaid diagram opens Lightbox; single-click LaTeX focuses silently without source flash; double-click edits source
      const clearActiveZoomTarget = () => {
        if (activeZoomImgRef.current) {
          activeZoomImgRef.current.style.outline = '';
          activeZoomImgRef.current.closest('.vditor-ir__node')?.classList.remove('vcat-mermaid-active');
          activeZoomImgRef.current = null;
        }
        el.querySelectorAll('.vditor-ir__node.vcat-mermaid-active').forEach((n) => {
          n.classList.remove('vcat-mermaid-active');
        });
      };

      const collapseExpandedCodeBlocks = (exceptBlock?: Element | null) => {
        const expanded = el.querySelectorAll('.vditor-ir__node--expand[data-type="code-block"], .vditor-ir__node--expand[data-type="math-block"]');
        let changed = false;
        expanded.forEach((node) => {
          if (node !== exceptBlock) {
            node.classList.remove('vditor-ir__node--expand');
            changed = true;
          }
        });
        if (changed) {
          renderLatexBlocks();
          rerenderBrokenMermaid();
          requestAnimationFrame(() => {
            renderLatexBlocks();
            rerenderBrokenMermaid();
          });
        }
      };

      const getPreviewBlockTarget = (
        target: HTMLElement | null
      ): { kind: 'mermaid' | 'math'; previewPre: HTMLElement; irNode: HTMLElement } | null => {
        if (!target || target.closest('.vditor-copy')) return null;
        const irNode = target.closest('.vditor-ir__node') as HTMLElement | null;
        if (!irNode || irNode.classList.contains('vditor-ir__node--expand')) return null;
        const previewPre =
          (target.closest('pre.vditor-ir__preview') as HTMLElement | null) ??
          (irNode.querySelector('pre.vditor-ir__preview') as HTMLElement | null);
        if (!previewPre) return null;
        const nodeType = irNode.getAttribute('data-type');
        if (nodeType === 'math-block') {
          return { kind: 'math', previewPre, irNode };
        }
        if (nodeType === 'code-block') {
          const lang = getCodeBlockLang(irNode);
          if (lang === 'mermaid') {
            return { kind: 'mermaid', previewPre, irNode };
          }
          if (lang === 'latex' || lang === 'tex' || lang === 'math') {
            return { kind: 'math', previewPre, irNode };
          }
        }
        return null;
      };

      let handledGapClick = false;

      const handleMouseDownCapture = (e: MouseEvent) => {
        handledGapClick = false;
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;

        // Intercept language autocomplete click BEFORE focus leaves contenteditable marker--info
        const hintBtn = target?.closest('.vditor-hint button') as HTMLElement | null;
        if (hintBtn) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const rawVal = hintBtn.getAttribute('data-value') || hintBtn.textContent || '';
          const selNow = window.getSelection();
          const selEl =
            selNow?.anchorNode instanceof Element
              ? selNow.anchorNode
              : selNow?.anchorNode?.parentElement;
          const activeInfo =
            (selEl?.closest('.vditor-ir__marker--info') as HTMLElement | null) ??
            (lastActiveInfoMarker && el.contains(lastActiveInfoMarker) ? lastActiveInfoMarker : null) ??
            (el.querySelector('.vditor-ir__node--expand .vditor-ir__marker--info') as HTMLElement | null) ??
            (el.querySelector('.vditor-ir__marker--info') as HTMLElement | null);
          if (activeInfo && el.contains(activeInfo)) {
            commitCodeBlockLanguage(activeInfo, rawVal);
          }
          return;
        }

        // Clicking the 3 macOS dots or language badge at top-left of a code block expands & focuses its language tag
        const codeBlockNode = target?.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null;
        if (codeBlockNode) {
          const clickedInfo = target?.closest('.vditor-ir__marker--info') as HTMLElement | null;
          const rect = codeBlockNode.getBoundingClientRect();
          const relX = e.clientX - rect.left;
          const relY = e.clientY - rect.top;
          if (clickedInfo || (relX >= 4 && relX <= 68 && relY >= 4 && relY <= 30)) {
            const infoSpan = codeBlockNode.querySelector('.vditor-ir__marker--info') as HTMLElement | null;
            if (infoSpan) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              lastActiveInfoMarker = infoSpan;
              clearActiveZoomTarget();
              collapseExpandedCodeBlocks(codeBlockNode);
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
        const previewTarget = imgEl ? null : getPreviewBlockTarget(target);

        if (previewTarget) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (mermaidClickTimerRef.current) {
            clearTimeout(mermaidClickTimerRef.current);
            mermaidClickTimerRef.current = null;
          }
          collapseExpandedCodeBlocks(previewTarget.irNode);

          // Double-click any rendered LaTeX / Mermaid card to expand source editor intentionally
          if (e.detail >= 2) {
            clearActiveZoomTarget();
            setLightboxItem(null);
            previewTarget.irNode.classList.add('vditor-ir__node--expand');
            (el.querySelector('.vditor-ir .vditor-reset') as HTMLElement | null)?.focus({ preventScroll: true });
            const editEl =
              (previewTarget.irNode.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null) ??
              (previewTarget.irNode.querySelector('pre.vditor-ir__marker--pre') as HTMLElement | null);
            if (editEl) {
              const sel = window.getSelection();
              if (sel) {
                const range = document.createRange();
                range.selectNodeContents(editEl);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
            return;
          }

          clearActiveZoomTarget();
          previewTarget.irNode.classList.add('vcat-mermaid-active');

          if (previewTarget.kind === 'mermaid') {
            const mermaidDiv = previewTarget.previewPre.querySelector('div.language-mermaid') as HTMLElement | null;
            if (mermaidDiv) {
              activeZoomImgRef.current = mermaidDiv as unknown as HTMLImageElement;
              const svgSnapshot = mermaidDiv.innerHTML;
              mermaidClickTimerRef.current = setTimeout(() => {
                mermaidClickTimerRef.current = null;
                setLightboxItem({
                  type: 'mermaid',
                  svgHtml: svgSnapshot,
                });
              }, 200);
            }
          }
          return;
        }

        // Clicking a vertical gap between blocks or blank space below/above blocks inserts/focuses an editable paragraph
        // Measure child rects BEFORE collapsing any expanded code blocks so click Y matches what the user saw
        if (target && target.classList.contains('vditor-reset')) {
          const children = Array.from(target.children) as HTMLElement[];
          const hitInsideChild = children.some((c) => {
            const r = c.getBoundingClientRect();
            return e.clientY >= r.top && e.clientY <= r.bottom;
          });
          if (!hitInsideChild) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            handledGapClick = true;
            clearActiveZoomTarget();
            const nextChild = children.find((c) => c.getBoundingClientRect().top > e.clientY) ?? null;
            const prevChild = nextChild ? (nextChild.previousElementSibling as HTMLElement | null) : children[children.length - 1] ?? null;
            collapseExpandedCodeBlocks(null);
            const isEmptyPara = (node: HTMLElement | null) =>
              Boolean(node && node.tagName === 'P' && (node.textContent || '').replace(/\u200b/g, '').trim() === '');

            let targetPara: HTMLElement | null = null;
            if (isEmptyPara(prevChild)) {
              targetPara = prevChild;
            } else if (isEmptyPara(nextChild)) {
              targetPara = nextChild;
            } else {
              targetPara = document.createElement('p');
              targetPara.setAttribute('data-block', '0');
              targetPara.textContent = '\u200b';
              if (nextChild) {
                target.insertBefore(targetPara, nextChild);
              } else {
                target.appendChild(targetPara);
              }
            }

            target.focus({ preventScroll: true });
            if (targetPara) {
              if (!targetPara.firstChild) {
                targetPara.textContent = '\u200b';
              }
              const sel = window.getSelection();
              if (sel) {
                const range = document.createRange();
                range.selectNodeContents(targetPara);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
            onChangeRef.current(instance.getValue());
            return;
          }
        }

        collapseExpandedCodeBlocks(codeBlockNode ?? target?.closest('.vditor-ir__node[data-type="math-block"]'));

        if (activeZoomImgRef.current && activeZoomImgRef.current !== imgEl) {
          clearActiveZoomTarget();
        } else if (!imgEl) {
          el.querySelectorAll('.vditor-ir__node.vcat-mermaid-active').forEach((n) => {
            n.classList.remove('vcat-mermaid-active');
          });
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
        if (target?.closest('.vditor-hint button')) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        if (handledGapClick) {
          handledGapClick = false;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        const imgEl = target?.closest('img');
        const previewTarget = imgEl ? null : getPreviewBlockTarget(target);
        if (imgEl || previewTarget) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
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

      const handleSelectionChange = () => {
        const sel = window.getSelection();
        if (!sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
        const anchorEl =
          sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement;
        const curInfo = anchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null;
        if (curInfo && el.contains(curInfo)) {
          lastActiveInfoMarker = curInfo;
        }
        const curCodeBlock = anchorEl?.closest('.vditor-ir__node[data-type="code-block"], .vditor-ir__node[data-type="math-block"]') as HTMLElement | null;
        collapseExpandedCodeBlocks(curCodeBlock);
        requestAnimationFrame(() => {
          renderLatexBlocks();
          rerenderBrokenMermaid();
        });
      };

      document.addEventListener('selectionchange', handleSelectionChange);
      el.addEventListener('copy', handleCopyCapture, true);
      el.addEventListener('paste', handlePasteCapture, true);
      window.addEventListener('keydown', handleKeyDownCapture, true);
      el.addEventListener('mousedown', handleMouseDownCapture, true);
      el.addEventListener('click', handleClickCapture, true);
      el.addEventListener('contextmenu', handleContextMenu);

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        document.removeEventListener('selectionchange', handleSelectionChange);
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
