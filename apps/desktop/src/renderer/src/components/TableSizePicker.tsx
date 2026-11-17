import { useState } from 'react';

interface TableSizePickerProps {
  /** Position (viewport coords) where the picker should appear */
  x: number;
  y: number;
  onConfirm: (cols: number, rows: number) => void;
  onClose: () => void;
}

const MAX_COLS = 8;
const MAX_ROWS = 8;

/** Typora-style grid table size picker. Hover to preview, click to confirm. */
export function TableSizePicker({ x, y, onConfirm, onClose }: TableSizePickerProps) {
  const [hoverCol, setHoverCol] = useState(0);
  const [hoverRow, setHoverRow] = useState(0);

  const confirmSize = (cols: number, rows: number) => {
    if (cols > 0 && rows > 0) onConfirm(cols, rows);
    onClose();
  };

  return (
    <>
      {/* Invisible backdrop to close on outside click */}
      <div
        className="fixed inset-0 z-[9998]"
        onMouseDown={() => onClose()}
      />
      <div
        className="fixed z-[9999] rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel,var(--bg-main))] p-2.5 shadow-xl"
        style={{ left: x, top: y }}
        onMouseLeave={() => { setHoverCol(0); setHoverRow(0); }}
      >
        {/* Grid */}
        <div className="flex flex-col gap-0.5">
          {Array.from({ length: MAX_ROWS }, (_, rowIdx) => (
            <div key={rowIdx} className="flex gap-0.5">
              {Array.from({ length: MAX_COLS }, (_, colIdx) => {
                const isActive = colIdx < hoverCol && rowIdx < hoverRow;
                return (
                  <div
                    key={colIdx}
                    className={`h-5 w-5 cursor-pointer rounded-sm border transition-colors ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent)]/20'
                        : 'border-[var(--border-color)] bg-[var(--bg-hover,#f5f5f5)]'
                    }`}
                    onMouseEnter={() => { setHoverCol(colIdx + 1); setHoverRow(rowIdx + 1); }}
                    onMouseDown={(e) => { e.preventDefault(); confirmSize(colIdx + 1, rowIdx + 1); }}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Size label */}
        <div className="mt-2 text-center text-[11.5px] font-medium text-[var(--control-text-color)]">
          {hoverCol > 0 && hoverRow > 0
            ? `${hoverRow} 行 × ${hoverCol} 列`
            : '悬停选择大小'}
        </div>
      </div>
    </>
  );
}
