import { useEffect, useState } from 'react';
import { RotateCw, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export interface LightboxPayload {
  type: 'image' | 'mermaid';
  src?: string;
  alt?: string;
  svgHtml?: string;
}

interface MediaLightboxProps {
  item: LightboxPayload | null;
  onClose: () => void;
}

/** Adaptive Lightbox for images and Mermaid diagrams with wheel-zoom, drag-pan, rotate, and ESC/A close. */
export function MediaLightbox({ item, onClose }: MediaLightboxProps) {
  const [scale, setScale] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!item) return;
    setScale(item.type === 'mermaid' ? 120 : 100);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setScale((s) => Math.min(400, s + 20));
      } else if (e.key === '-') {
        e.preventDefault();
        setScale((s) => Math.max(25, s - 20));
      } else if (e.key === '0') {
        e.preventDefault();
        setScale(100);
        setRotation(0);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      onClick={onClose}
      onWheel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 15 : -15;
        setScale((s) => Math.min(400, Math.max(25, s + delta)));
      }}
      onMouseMove={(e) => {
        if (!dragging) return;
        setPan({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md select-none"
    >
      {/* Top floating glass control bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed top-5 z-50 flex items-center gap-1.5 rounded-full border border-white/15 bg-[#1c1c1e]/90 px-3.5 py-1.5 text-xs text-white shadow-2xl backdrop-blur-xl"
      >
        <button
          type="button"
          title="缩小 (-)"
          onClick={() => setScale((s) => Math.max(25, s - 20))}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="点击重置为 100%"
          onClick={() => {
            setScale(100);
            setRotation(0);
            setPan({ x: 0, y: 0 });
          }}
          className="min-w-[52px] rounded px-1.5 py-0.5 text-center font-mono text-[11.5px] hover:bg-white/15"
        >
          {scale}%
        </button>
        <button
          type="button"
          title="放大 (+)"
          onClick={() => setScale((s) => Math.min(400, s + 20))}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-3.5 w-[1px] bg-white/20" />
        <button
          type="button"
          title="顺时针旋转 90°"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 hover:bg-white/15"
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span>旋转</span>
        </button>
        <button
          type="button"
          title="重置位置与角度"
          onClick={() => {
            setScale(100);
            setRotation(0);
            setPan({ x: 0, y: 0 });
          }}
          className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/15"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>复位</span>
        </button>
        <div className="mx-1 h-3.5 w-[1px] bg-white/20" />
        <button
          type="button"
          title="关闭预览 (快捷键: ESC 或 A)"
          onClick={onClose}
          className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-medium text-white hover:bg-[#ff3b30]"
        >
          <X className="h-3.5 w-3.5" />
          <span>关闭 (ESC / A)</span>
        </button>
      </div>

      {/* Adaptive viewport container */}
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          setDragging(true);
          setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale / 100}) rotate(${rotation}deg)`,
          transition: dragging ? 'none' : 'transform 0.12s ease-out',
        }}
        className={`flex max-h-[82vh] max-w-[88vw] items-center justify-center ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {item.type === 'image' ? (
          <img
            src={item.src}
            alt={item.alt || '预览图片'}
            draggable={false}
            className="max-h-[80vh] max-w-[86vw] rounded-lg object-contain shadow-2xl"
          />
        ) : (
          <div
            className="vcat-lightbox-mermaid max-h-[82vh] max-w-[88vw] overflow-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] p-8 text-[var(--text-main)] shadow-2xl"
            dangerouslySetInnerHTML={{ __html: item.svgHtml || '' }}
          />
        )}
      </div>

      {/* Bottom hint pill */}
      <div className="pointer-events-none fixed bottom-4 rounded-full bg-black/50 px-3.5 py-1 text-[11px] text-white/75 backdrop-blur-md">
        滚轮缩放 · 按住拖拽平移 · 按 ESC / A 或点击空白处关闭
      </div>
    </div>
  );
}
