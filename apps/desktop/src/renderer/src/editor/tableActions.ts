import { transformTableMatrix, type TableEditAction } from '@vcat/core';

export interface TableActionContext {
  target: HTMLElement | null;
  pushUndo: () => void;
  commitMarkdown: () => void;
}

/**
 * Executes a table row/column/copy/delete action on the active table cell
 * and rebuilds a valid `<thead> + <tbody>` table structure for Vditor IR.
 */
export function executeTableAction(action: string, ctx: TableActionContext): void {
  const { target, pushUndo, commitMarkdown } = ctx;
  if (!target) return;
  const cell = target.closest('td, th') as HTMLTableCellElement | null;
  const row = target.closest('tr') as HTMLTableRowElement | null;
  const table = target.closest('table') as HTMLTableElement | null;
  if (!cell || !row || !table) return;

  const allRows = Array.from(table.rows);
  const rowIndex = allRows.indexOf(row);
  const colIndex = cell.cellIndex;
  const colCount = Math.max(1, ...allRows.map((r) => r.cells.length));

  if (action === 'table-copy') {
    const mdRows = allRows.map(
      (r) => `| ${Array.from(r.cells).map((c) => (c.textContent || '').trim()).join(' | ')} |`
    );
    if (mdRows.length > 0) {
      const sep = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`;
      mdRows.splice(1, 0, sep);
      void navigator.clipboard.writeText(mdRows.join('\n'));
    }
    return;
  }

  if (action === 'table-delete') {
    pushUndo();
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
    pushUndo();
    commitMarkdown();
    return;
  }

  pushUndo();
  const matrix = allRows.map((r) =>
    Array.from(r.cells).map((c) => (c.innerHTML || '').trim())
  );
  const nextMatrix = transformTableMatrix(matrix, action as TableEditAction, rowIndex, colIndex);
  if (!nextMatrix) {
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    table.parentNode?.insertBefore(p, table);
    table.remove();
    pushUndo();
    commitMarkdown();
    return;
  }

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

  pushUndo();
  commitMarkdown();
}
