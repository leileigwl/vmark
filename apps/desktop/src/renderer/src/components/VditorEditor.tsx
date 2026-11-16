import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Vditor from 'vditor';

export interface VditorEditorHandle {
  applyFormat: (cmd: string) => void;
  applyTableAction: (action: string) => void;
  getValue: () => string;
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

    useImperativeHandle(ref, () => ({
      applyFormat(cmd: string) {
        const instance = vditorRef.current;
        if (!instance || !isReadyRef.current) return;
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

        if (action === 'row-above' || action === 'row-below') {
          const newRow = document.createElement('tr');
          for (let i = 0; i < colCount; i++) {
            const td = document.createElement('td');
            td.innerHTML = ' ';
            newRow.appendChild(td);
          }
          if (action === 'row-above') {
            row.parentNode?.insertBefore(newRow, row);
          } else {
            row.parentNode?.insertBefore(newRow, row.nextSibling);
          }
        } else if (action === 'row-delete') {
          if (table.rows.length > 1) row.remove();
        } else if (action === 'col-left' || action === 'col-right') {
          Array.from(table.rows).forEach((r, idx) => {
            const newCell = document.createElement(idx === 0 ? 'th' : 'td');
            newCell.innerHTML = idx === 0 ? '列' : ' ';
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
            instance.setValue(pendingValueRef.current);
          }
        },
        // Debounce React state sync so typing & Cmd+Z undo remain 0ms lag on 68KB+ docs
        input: (md) => {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            onChangeRef.current(md);
          }, 220);
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

      const enhanceDom = () => {
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
      };

      const observer = new MutationObserver(enhanceDom);
      observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

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

      el.addEventListener('mousedown', handleMouseDownCapture, true);
      el.addEventListener('click', handleClickCapture, true);
      el.addEventListener('contextmenu', handleContextMenu);

      return () => {
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
          instance.setValue(value);
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
