import { useEffect, useRef, useState } from 'react';

interface TableSizePickerProps {
  /** Unused position props kept for backward-compatibility */
  x?: number;
  y?: number;
  onConfirm: (cols: number, rows: number) => void;
  onClose: () => void;
}

/**
 * 插入表格弹窗（居中浮层 Modal）
 * 100% 对标设计稿：
 * 标题：“插入表格”
 * 内容：列 [ 3 ]   行 [ 4 ]
 * 底部分割线
 * 按钮：[ 取消 ]  [ 确定 ]
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/25 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[300px] select-none rounded-2xl border border-[var(--border-color,#e5e7eb)] bg-white p-5 shadow-2xl transition-all dark:bg-[#252526]"
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
        <h3 className="mb-5 text-center text-[16px] font-semibold text-[var(--text-main,#111827)] dark:text-gray-100">
          插入表格
        </h3>

        <div className="mb-6 flex items-center justify-center gap-6 text-[14px] text-[var(--text-main,#374151)] dark:text-gray-200">
          <div className="flex items-center gap-2">
            <span>列</span>
            <input
              ref={colInputRef}
              type="number"
              min={1}
              max={30}
              value={cols}
              onChange={(e) => setCols(parseInt(e.target.value, 10) || 1)}
              className="h-8 w-16 rounded-md border border-gray-300 bg-transparent text-center text-[14px] font-medium text-[var(--text-main)] shadow-2xs focus:border-[#007aff] focus:outline-none dark:border-gray-600 dark:text-gray-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <span>行</span>
            <input
              type="number"
              min={1}
              max={100}
              value={rows}
              onChange={(e) => setRows(parseInt(e.target.value, 10) || 1)}
              className="h-8 w-16 rounded-md border border-gray-300 bg-transparent text-center text-[14px] font-medium text-[var(--text-main)] shadow-2xs focus:border-[#007aff] focus:outline-none dark:border-gray-600 dark:text-gray-100"
            />
          </div>
        </div>

        <div className="mb-4 border-t border-gray-200 dark:border-gray-700" />

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-[13px] font-normal text-gray-700 shadow-2xs hover:bg-gray-50 active:bg-gray-100 dark:border-gray-600 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/5"
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
