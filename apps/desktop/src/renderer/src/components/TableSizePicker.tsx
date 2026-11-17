import { useEffect, useRef, useState } from 'react';

interface TableSizePickerProps {
  x?: number;
  y?: number;
  onConfirm: (cols: number, rows: number) => void;
  onClose: () => void;
}

/**
 * 插入表格弹窗（居中浮层 Modal）
 * 全量使用 CSS 语义变量与深浅自适应样式，完美适配暗黑与浅色模式
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[310px] select-none rounded-2xl border p-5 shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--bg-elevated, var(--bg-main, #1e1e22))',
          borderColor: 'var(--border-color, rgba(255, 255, 255, 0.14))',
          color: 'var(--text-main, #f0f0f2)',
        }}
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
        <h3
          className="mb-5 text-center text-[16px] font-semibold"
          style={{ color: 'var(--text-main, #f0f0f2)' }}
        >
          插入表格
        </h3>

        <div className="mb-6 flex items-center justify-center gap-6 text-[14px]">
          <div className="flex items-center gap-2">
            <span className="font-medium opacity-90">列</span>
            <input
              ref={colInputRef}
              type="number"
              min={1}
              max={30}
              value={cols}
              onChange={(e) => setCols(parseInt(e.target.value, 10) || 1)}
              className="h-8 w-16 rounded-md border text-center text-[14px] font-medium shadow-2xs focus:border-[#007aff] focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-hover, rgba(125, 125, 125, 0.15))',
                borderColor: 'var(--border-color, rgba(255, 255, 255, 0.14))',
                color: 'var(--text-main, inherit)',
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium opacity-90">行</span>
            <input
              type="number"
              min={1}
              max={100}
              value={rows}
              onChange={(e) => setRows(parseInt(e.target.value, 10) || 1)}
              className="h-8 w-16 rounded-md border text-center text-[14px] font-medium shadow-2xs focus:border-[#007aff] focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-hover, rgba(125, 125, 125, 0.15))',
                borderColor: 'var(--border-color, rgba(255, 255, 255, 0.14))',
                color: 'var(--text-main, inherit)',
              }}
            />
          </div>
        </div>

        <div
          className="mb-4 border-t"
          style={{ borderColor: 'var(--border-color, rgba(255, 255, 255, 0.1))' }}
        />

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-1.5 text-[13px] font-normal shadow-2xs hover:opacity-80 active:opacity-70"
            style={{
              backgroundColor: 'var(--bg-hover, rgba(125, 125, 125, 0.12))',
              borderColor: 'var(--border-color, rgba(255, 255, 255, 0.15))',
              color: 'var(--text-main, inherit)',
            }}
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
