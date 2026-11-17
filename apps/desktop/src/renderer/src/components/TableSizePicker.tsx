import { useEffect, useRef, useState } from 'react';

interface TableSizePickerProps {
  x?: number;
  y?: number;
  onConfirm: (cols: number, rows: number) => void;
  onClose: () => void;
}

/**
 * 插入表格弹窗（居中浮层 Modal）
 * 全量使用 CSS 变量，完美自适应浅色与暗黑模式（消除白底白字）
 */
export function TableSizePicker({ onConfirm, onClose }: TableSizePickerProps) {
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(4);
  const colInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    colInputRef.current?.focus();
    colInputRef.current?.select();
  }, []);

  const handleConfirm = () => {
    const c = Math.max(1, Math.min(Number(cols) || 3, 30));
    const r = Math.max(1, Math.min(Number(rows) || 4, 100));
    onConfirm(c, r);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[300px] select-none rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] p-5 shadow-2xl transition-all"
        style={{ color: 'var(--text-main)' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h3 className="mb-5 text-center text-[16px] font-semibold text-[var(--text-main)]">
          插入表格
        </h3>

        <div className="mb-6 flex items-center justify-center gap-6 text-[14px] text-[var(--text-main)]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-main)]">列</span>
            <input
              ref={colInputRef}
              type="number"
              min={1}
              max={30}
              value={cols}
              onChange={(e) => setCols(parseInt(e.target.value, 10) || 1)}
              className="h-8 w-16 rounded-md border border-[var(--border-color)] bg-[var(--bg-hover)] text-center text-[14px] font-medium text-[var(--text-main)] shadow-2xs focus:border-[#007aff] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-main)]">行</span>
            <input
              type="number"
              min={1}
              max={100}
              value={rows}
              onChange={(e) => setRows(parseInt(e.target.value, 10) || 1)}
              className="h-8 w-16 rounded-md border border-[var(--border-color)] bg-[var(--bg-hover)] text-center text-[14px] font-medium text-[var(--text-main)] shadow-2xs focus:border-[#007aff] focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-4 border-t border-[var(--border-color)]" />

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-hover)] px-4 py-1.5 text-[13px] font-normal text-[var(--text-main)] shadow-2xs hover:opacity-80 active:opacity-70"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-[#007aff] px-4 py-1.5 text-[13px] font-medium text-white shadow-2xs hover:bg-[#0066d6] active:bg-[#005bb5]"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
