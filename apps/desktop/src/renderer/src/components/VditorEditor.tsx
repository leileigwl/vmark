import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Vditor from 'vditor';

export interface VditorEditorHandle {
  applyFormat: (cmd: string) => void;
  applyTableAction: (action: string) => void;
  getValue: () => string;
  findMatches: (findStr: string) => number;
  jumpToMatch: (findStr: string, index: number) => number;
  replaceAllText: (findStr: string, replaceStr: string) => number;
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
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [zoomedSvgHtml, setZoomedSvgHtml] = useState<string | null>(null);
    const [zoomedImgSrc, setZoomedImgSrc] = useState<string | null>(null);

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
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const selectedText = sel.toString();
      if (!selectedText.trim()) return;

      const markerMap = {
        bold: { tag: 'STRONG', altTag: 'B', marker: '**' },
        italic: { tag: 'EM', altTag: 'I', marker: '*' },
        strike: { tag: 'DEL', altTag: 'S', marker: '~~' },
        'inline-code': { tag: 'CODE', altTag: 'CODE', marker: '`' },
      }[cmd];

      const anchorEl =
        sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const existingNode = anchorEl?.closest(
        `${markerMap.tag.toLowerCase()}, ${markerMap.altTag.toLowerCase()}, span[data-type="${cmd}"]`
      );

      if (existingNode && el.contains(existingNode)) {
        const plainText = (existingNode.textContent || '')
          .replace(/^\*\*|\*\*$/g, '')
          .replace(/^\*|\*$/g, '')
          .replace(/^~~|~~$/g, '')
          .replace(/^`|`$/g, '');
        const range = document.createRange();
        range.selectNode(existingNode);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, plainText);
        return;
      }

      // Preserve leading/trailing spaces outside markers so "*3 *" never breaks CommonMark italic/bold
      const leading = selectedText.match(/^\s*/)?.[0] ?? '';
      const trailing = selectedText.match(/\s*$/)?.[0] ?? '';
      const core = selectedText.trim();
      if (!core) return;
      document.execCommand(
        'insertText',
        false,
        `${leading}${markerMap.marker}${core}${markerMap.marker}${trailing}`
      );
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
      findMatches(findStr: string) {
        const el = containerRef.current;
        if (!el || !findStr) return 0;
        const resetEl = el.querySelector('.vditor-reset');
        if (!resetEl) return 0;
        const text = resetEl.textContent || '';
        const lowerText = text.toLowerCase();
        const lowerQuery = findStr.toLowerCase();
        let count = 0;
        let idx = lowerText.indexOf(lowerQuery);
        while (idx !== -1) {
          count++;
          idx = lowerText.indexOf(lowerQuery, idx + lowerQuery.length);
        }
        return count;
      },
      jumpToMatch(findStr: string, targetIndex: number) {
        const el = containerRef.current;
        if (!el || !findStr) return 0;
        const resetEl = el.querySelector('.vditor-reset');
        if (!resetEl) return 0;

        const walker = document.createTreeWalker(resetEl, NodeFilter.SHOW_TEXT);
        const lowerQuery = findStr.toLowerCase();
        const hits: Array<{ node: Text; start: number; end: number }> = [];
        let curr = walker.nextNode() as Text | null;
        while (curr) {
          const val = curr.nodeValue || '';
          const lowerVal = val.toLowerCase();
          let pos = lowerVal.indexOf(lowerQuery);
          while (pos !== -1) {
            hits.push({ node: curr, start: pos, end: pos + findStr.length });
            pos = lowerVal.indexOf(lowerQuery, pos + lowerQuery.length);
          }
          curr = walker.nextNode() as Text | null;
        }
        if (hits.length === 0) return 0;
        const safeIdx = ((targetIndex % hits.length) + hits.length) % hits.length;
        const hit = hits[safeIdx];
        const range = document.createRange();
        range.setStart(hit.node, hit.start);
        range.setEnd(hit.node, hit.end);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        const parentEl = hit.node.parentElement;
        parentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return hits.length;
      },
      replaceAllText(findStr: string, replaceStr: string) {
        const instance = vditorRef.current;
        if (!instance || !isReadyRef.current || !findStr) return 0;
        const current = instance.getValue();
        const parts = current.split(findStr);
        const count = parts.length - 1;
        if (count > 0) {
          const next = parts.join(replaceStr);
          instance.setValue(next);
          onChangeRef.current(next);
        }
        return count;
      },
      applyTableAction(action: string) {
        const el = containerRef.current;
        const target = lastSelectionElRef.current;
        if (!el || !target) return;
        const cell = target.closest('td, th') as HTMLTableCellElement | null;
        const row = target.closest('tr') as HTMLTableRowElement | null;
        const table = target.closest('table') as HTMLTableElement | null;
        if (!cell || !row || !table) return;

        const colIndex = cell.cellIndex;
        const colCount = row.cells.length;

        if (action === 'table-copy') {
          const mdRows = Array.from(table.rows).map((r) =>
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
          const tableNode = table.closest('.vditor-ir__node') ?? table;
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNode(tableNode);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('delete');
          }
          if (tableNode.isConnected) {
            tableNode.remove();
            el.querySelector('.vditor-reset')?.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return;
        } else if (action === 'row-above' || action === 'row-below') {
          const newRow = document.createElement('tr');
          for (let i = 0; i < colCount; i++) {
            const td = document.createElement('td');
            td.textContent = ' ';
            newRow.appendChild(td);
          }
          const inHead = row.parentElement?.tagName === 'THEAD';
          const tbody = table.tBodies[0] ?? table.createTBody();
          if (inHead) {
            tbody.insertBefore(newRow, tbody.firstChild);
          } else if (action === 'row-above') {
            row.parentNode?.insertBefore(newRow, row);
          } else {
            row.parentNode?.insertBefore(newRow, row.nextSibling);
          }
        } else if (action === 'row-delete') {
          const inHead = row.parentElement?.tagName === 'THEAD';
          const tbody = table.tBodies[0];
          if (!inHead && tbody && tbody.rows.length > 1) {
            row.remove();
          } else if (!inHead && (!tbody || tbody.rows.length <= 1)) {
            const tableNode = table.closest('.vditor-ir__node') ?? table;
            tableNode.remove();
          }
        } else if (action === 'col-left' || action === 'col-right') {
          Array.from(table.rows).forEach((r) => {
            const isHead = r.parentElement?.tagName === 'THEAD';
            const newCell = document.createElement(isHead ? 'th' : 'td');
            newCell.textContent = isHead ? '列' : ' ';
            const refCell = r.cells[colIndex];
            if (action === 'col-left') {
              r.insertBefore(newCell, refCell ?? null);
            } else {
              r.insertBefore(newCell, refCell?.nextSibling ?? null);
            }
          });
        } else if (action === 'col-delete') {
          if (colCount > 1) {
            Array.from(table.rows).forEach((r) => {
              r.cells[colIndex]?.remove();
            });
          } else {
            const tableNode = table.closest('.vditor-ir__node') ?? table;
            tableNode.remove();
          }
        }

        const resetEl = el.querySelector('.vditor-reset');
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

      // Single-click Mermaid/Image -> Lightbox zoom (without expanding raw source); Double-click -> edit source
      const handleMouseDownCapture = (e: MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        const mermaidBox = target?.closest('.language-mermaid');
        const imgEl = target?.closest('img') as HTMLImageElement | null;
        if (!mermaidBox && !imgEl) return;

        if (e.detail === 1) {
          e.preventDefault();
          e.stopPropagation();
          if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
          clickTimerRef.current = setTimeout(() => {
            if (mermaidBox) {
              setZoomedSvgHtml(mermaidBox.innerHTML);
            } else if (imgEl) {
              setZoomedImgSrc(imgEl.src);
            }
          }, 210);
        } else if (e.detail >= 2) {
          if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
        }
      };

      const handleClickCapture = (e: MouseEvent) => {
        if (e.button !== 0 || e.detail !== 1) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest('.language-mermaid') || target?.closest('img')) {
          e.preventDefault();
          e.stopPropagation();
        }
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

      el.addEventListener('keydown', handleKeyDownCapture, true);
      el.addEventListener('mousedown', handleMouseDownCapture, true);
      el.addEventListener('click', handleClickCapture, true);
      el.addEventListener('contextmenu', handleContextMenu);

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        el.removeEventListener('keydown', handleKeyDownCapture, true);
        el.removeEventListener('mousedown', handleMouseDownCapture, true);
        el.removeEventListener('click', handleClickCapture, true);
        el.removeEventListener('contextmenu', handleContextMenu);
        observer.disconnect();
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
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
        {(zoomedSvgHtml || zoomedImgSrc) && (
          <div
            onClick={() => {
              setZoomedSvgHtml(null);
              setZoomedImgSrc(null);
            }}
            className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/45 p-8 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[90vw] overflow-auto rounded-xl bg-white p-6 shadow-2xl"
            >
              {zoomedSvgHtml && (
                <div
                  className="min-w-[60vw] [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[80vh] [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: zoomedSvgHtml }}
                />
              )}
              {zoomedImgSrc && (
                <img src={zoomedImgSrc} alt="Preview" className="max-h-[82vh] max-w-[85vw] rounded" />
              )}
            </div>
          </div>
        )}
      </>
    );
  }
);
