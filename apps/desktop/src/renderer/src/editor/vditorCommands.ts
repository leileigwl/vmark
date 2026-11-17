import type Vditor from 'vditor';
import type { LightboxPayload } from '../components/MediaLightbox';
import type { InlineWrapCommand } from './inlineFormat';

export const FORMAT_SNIPPETS: Record<string, string> = {
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

export function applyFormatAction(
  cmd: string,
  instance: Vditor,
  el: HTMLElement,
  toggleInlineWrap: (c: InlineWrapCommand) => void,
  pushVditorUndo: () => void,
  onChange: (md: string) => void
): void {
  if (cmd === 'bold' || cmd === 'italic' || cmd === 'strike' || cmd === 'inline-code') {
    toggleInlineWrap(cmd);
    return;
  }
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
        onChange(instance.getValue());
        return;
      }
    }
  }
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
      onChange(instance.getValue());
    }
    return;
  }
  const snippet = FORMAT_SNIPPETS[cmd];
  if (snippet) {
    instance.focus();
    instance.insertValue(snippet);
  }
}

export function insertTableWithSizeAction(
  cols: number,
  rows: number,
  instance: Vditor,
  el: HTMLElement
): void {
  const safeCols = Math.max(1, Math.min(20, cols));
  // Total rows includes 1 header row + (rows - 1) body rows
  const safeBodyRows = Math.max(1, Math.min(50, rows - 1));
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
  const bodyRows = Array.from({ length: safeBodyRows }, () =>
    `| ${Array.from({ length: safeCols }, () => ' ').join(' | ')} |`
  );
  const tableMd = `\n${[header, sep, ...bodyRows].join('\n')}\n`;

  instance.focus();
  const inst = instance as unknown as {
    insertMD?: (md: string) => void;
    insertValue: (v: string) => void;
  };
  if (typeof inst.insertMD === 'function') {
    inst.insertMD(tableMd);
  } else {
    instance.insertValue(tableMd);
  }

  // Focus the first table cell after render
  setTimeout(() => {
    const allTables = el.querySelectorAll('.vditor-ir__node[data-type="table"] table, table');
    const lastTable = allTables[allTables.length - 1];
    const firstCell = lastTable?.querySelector('th, td') as HTMLElement | null;
    if (firstCell) {
      const range = document.createRange();
      range.selectNodeContents(firstCell);
      range.collapse(false);
      const selNow = window.getSelection();
      selNow?.removeAllRanges();
      selNow?.addRange(range);
    }
  }, 60);
}

export function applyImageActionInEditor(
  action: string,
  activeZoomImgRef: { current: HTMLImageElement | null },
  lastSelectionElRef: { current: HTMLElement | null },
  setLightboxItem: (item: LightboxPayload | null) => void,
  pushVditorUndo: () => void,
  commitValue: () => void
): void {
  const imgEl =
    (activeZoomImgRef.current instanceof HTMLImageElement ? activeZoomImgRef.current : null) ??
    (lastSelectionElRef.current?.closest('img') as HTMLImageElement | null);
  if (!imgEl) return;

  if (action === 'preview') {
    setLightboxItem({ type: 'image', src: imgEl.src, alt: imgEl.alt });
    return;
  }
  if (action === 'copy') {
    void window.electronAPI?.copyImage?.(imgEl.src);
    return;
  }
  if (action === 'save') {
    void window.electronAPI?.saveImageAs?.(imgEl.src);
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
    commitValue();
  }
}
