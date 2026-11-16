import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Vditor from 'vditor';

export interface VditorEditorHandle {
  applyFormat: (cmd: string) => void;
  applyTableAction: (action: string) => void;
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
        input: (md) => {
          onChangeRef.current(md);
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

      // Resolve relative local ./assets/* images & polish <details>/<summary> HTML blocks
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

      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const target = e.target as HTMLElement | null;
        lastSelectionElRef.current = target;
        const inTable = Boolean(target?.closest('table'));
        const sel = window.getSelection();
        const hasSelection = Boolean(sel && !sel.isCollapsed);
        void window.electronAPI?.showEditorContextMenu?.({ inTable, hasSelection });
      };
      el.addEventListener('contextmenu', handleContextMenu);

      return () => {
        el.removeEventListener('contextmenu', handleContextMenu);
        observer.disconnect();
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

    return <div ref={containerRef} className="h-full w-full" />;
  }
);
