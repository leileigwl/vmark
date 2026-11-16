import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { transformTableMatrix, type TableEditAction } from '@vcat/core';
import Vditor from 'vditor';
import { MediaLightbox, type LightboxPayload } from './MediaLightbox';

export interface FindOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface VditorEditorHandle {
  applyFormat: (cmd: string) => void;
  applyTableAction: (action: string) => void;
  insertTableWithSize: (cols: number, rows: number) => void;
  getValue: () => string;
  findMatches: (findStr: string, opts?: FindOptions) => number;
  jumpToMatch: (findStr: string, index: number, opts?: FindOptions) => number;
  clearFindHighlights: () => void;
  replaceAllText: (findStr: string, replaceStr: string, opts?: FindOptions) => number;
}

interface VditorEditorProps {
  value: string;
  articleKey: string;
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
  function VditorEditor({ value, articleKey, onChange, onSave }, ref) {
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

    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    pendingValueRef.current = value;

    const toggleInlineWrap = (cmd: 'bold' | 'italic' | 'strike' | 'inline-code') => {
      const instance = vditorRef.current;
      const el = containerRef.current;
      if (!instance || !el || !isReadyRef.current) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const spec = {
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
      }[cmd];

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

      const matchedEl =
        anchorEl?.closest(selector) ||
        focusEl?.closest(selector) ||
        commonEl?.closest(selector) ||
        (range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer.querySelector(selector)
          : null);

      if (matchedEl && el.contains(matchedEl) && !matchedEl.closest('pre')) {
        const wrapperNode =
          matchedEl.closest(`span.vditor-ir__node[data-type="${spec.dataType}"]`) ?? matchedEl;
        const innerTag = wrapperNode.querySelector(`${spec.tag}, ${spec.altTag}`);
        const rawText = innerTag ? innerTag.textContent || '' : wrapperNode.textContent || '';
        const cleanText = rawText
          .replace(/^\*\*|\*\*$/g, '')
          .replace(/^\*|\*$/g, '')
          .replace(/^~~|~~$/g, '')
          .replace(/^`|`$/g, '');
        const textNode = document.createTextNode(cleanText);
        wrapperNode.replaceWith(textNode);

        const nextRange = document.createRange();
        nextRange.selectNodeContents(textNode);
        sel.removeAllRanges();
        sel.addRange(nextRange);
        onChangeRef.current(instance.getValue());
        return;
      }

      if (sel.isCollapsed) return;
      const selectedText = sel.toString();
      if (!selectedText.trim()) return;

      const leading = selectedText.match(/^\s*/)?.[0] ?? '';
      const trailing = selectedText.match(/\s*$/)?.[0] ?? '';
      const core = selectedText
        .trim()
        .replace(/^\*\*|\*\*$/g, '')
        .replace(/^\*|\*$/g, '');
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
      onChangeRef.current(instance.getValue());
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
        // When inserting a block element (like a table) while cursor is inside an existing table,
        // jump out after the table first so it doesn't corrupt cells!
        if (cmd === 'table' || cmd === 'code-block' || cmd === 'line') {
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
        const el = containerRef.current;
        const target = lastSelectionElRef.current;
        if (!el || !target) return;
        const cell = target.closest('td, th') as HTMLTableCellElement | null;
        const row = target.closest('tr') as HTMLTableRowElement | null;
        const table = target.closest('table') as HTMLTableElement | null;
        if (!cell || !row || !table) return;

        const allRows = Array.from(table.rows);
        const rowIndex = allRows.indexOf(row);
        const colIndex = cell.cellIndex;
        const colCount = Math.max(1, ...allRows.map((r) => r.cells.length));

        if (action === 'table-copy') {
          const mdRows = allRows.map((r) =>
            `| ${Array.from(r.cells).map((c) => (c.textContent || '').trim()).join(' | ')} |`
          );
          if (mdRows.length > 0) {
            const sep = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`;
            mdRows.splice(1, 0, sep);
            void navigator.clipboard.writeText(mdRows.join('\n'));
          }
          return;
        }

        if (action === 'table-delete') {
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          table.parentNode?.insertBefore(p, table);
          table.remove();
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          el.querySelector('.vditor-reset')?.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }

        const matrix = allRows.map((r) =>
          Array.from(r.cells).map((c) => (c.innerHTML || '').trim())
        );
        const nextMatrix = transformTableMatrix(matrix, action as TableEditAction, rowIndex, colIndex);
        if (!nextMatrix) {
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          table.parentNode?.insertBefore(p, table);
          table.remove();
          el.querySelector('.vditor-reset')?.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }

        // Rebuild a 100% valid <thead> + <tbody> table so Vditor Lute never breaks pipes
        const newTable = document.createElement('table');
        const thead = document.createElement('thead');
        const headTr = document.createElement('tr');
        nextMatrix[0].forEach((html) => {
          const th = document.createElement('th');
          th.innerHTML = html || '列';
          headTr.appendChild(th);
        });
        thead.appendChild(headTr);
        newTable.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (let r = 1; r < nextMatrix.length; r++) {
          const tr = document.createElement('tr');
          nextMatrix[r].forEach((html) => {
            const td = document.createElement('td');
            td.innerHTML = html || ' ';
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        }
        newTable.appendChild(tbody);
        table.replaceWith(newTable);

        const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');
        resetEl?.dispatchEvent(new Event('input', { bubbles: true }));
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      isReadyRef.current = false;

      const cdnBase = window.location.protocol === 'file:' ? './vditor' : '/vditor';

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
              instance.insertValue(`![${file.name}](${saved.relativeMarkdownPath})\n`);
            }
            return null;
          },
        },
      });

      vditorRef.current = instance;

      let rafId = 0;
      const enhanceDom = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const imgs = el.querySelectorAll('img');
          imgs.forEach((img) => {
            const rawSrc = img.getAttribute('src');
            if (!rawSrc || /^(https?:|data:|vcat-asset:|blob:)/i.test(rawSrc)) return;
            const cleanRel = rawSrc.replace(/^\.\//, '');
            img.src = `vcat-asset://local/${cleanRel}`;
          });

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
      observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

      const handleKeyDownCapture = (e: KeyboardEvent) => {
        const sel = window.getSelection();
        const anchorEl =
          sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
        const activeCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;

        // Prevent accidental table column splitting or row corruption inside table cells
        if (activeCell && el.contains(activeCell)) {
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
          }
        }
      };

      // Click image or Mermaid diagram to open Lightbox (with wheel-zoom & ESC/A close); rapid double-click Mermaid to edit code in-place
      const clearActiveZoomTarget = () => {
        if (activeZoomImgRef.current) {
          activeZoomImgRef.current.style.outline = '';
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
          if (e.clientX - rect.left <= 68 && e.clientY - rect.top <= 30) {
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
          mermaidEl.style.outline = '2px solid var(--accent)';
          mermaidEl.style.outlineOffset = '4px';
          mermaidEl.style.borderRadius = '8px';

          const svgSnapshot = mermaidEl.innerHTML;
          mermaidClickTimerRef.current = setTimeout(() => {
            mermaidClickTimerRef.current = null;
            setLightboxItem({
              type: 'mermaid',
              svgHtml: svgSnapshot,
            });
          }, 210);
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

      const handleWheel = (e: WheelEvent) => {
        const activeEl = activeZoomImgRef.current as HTMLElement | null;
        if (!activeEl || !el.contains(activeEl)) return;
        const isMermaid = activeEl.classList.contains('language-mermaid');
        const targetEl = e.target as HTMLElement | null;
        const matchedTarget = isMermaid
          ? targetEl?.closest('.language-mermaid')
          : targetEl?.closest('img');
        if (matchedTarget !== activeEl && !e.ctrlKey && !e.metaKey) return;
        e.preventDefault();

        const delta = e.deltaY < 0 ? 5 : -5;
        if (isMermaid) {
          const currentPct = Number.parseFloat(activeEl.dataset.zoomPct || '100') || 100;
          const nextPct = Math.min(150, Math.max(50, currentPct + delta));
          activeEl.dataset.zoomPct = String(nextPct);
          activeEl.style.zoom = `${nextPct}%`;
          return;
        }

        const currentPct = Number.parseFloat(activeEl.dataset.zoomPct || '50') || 50;
        const nextPct = Math.min(100, Math.max(15, currentPct + delta));
        activeEl.dataset.zoomPct = String(nextPct);
        activeEl.style.width = `${nextPct}%`;
        activeEl.style.maxWidth = `${nextPct}%`;
      };

      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const target = e.target as HTMLElement | null;
        lastSelectionElRef.current = target;
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

      el.addEventListener('paste', handlePasteCapture, true);
      el.addEventListener('keydown', handleKeyDownCapture, true);
      el.addEventListener('mousedown', handleMouseDownCapture, true);
      el.addEventListener('click', handleClickCapture, true);
      el.addEventListener('wheel', handleWheel, { passive: false });
      el.addEventListener('contextmenu', handleContextMenu);

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        el.removeEventListener('paste', handlePasteCapture, true);
        el.removeEventListener('keydown', handleKeyDownCapture, true);
        el.removeEventListener('mousedown', handleMouseDownCapture, true);
        el.removeEventListener('click', handleClickCapture, true);
        el.removeEventListener('wheel', handleWheel);
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
    }, [articleKey]);

    return (
      <>
        <div ref={containerRef} className="h-full w-full" />
        <MediaLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      </>
    );
  }
);
