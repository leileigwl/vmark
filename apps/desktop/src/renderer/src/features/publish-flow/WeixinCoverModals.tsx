import { useEffect, useState, type PointerEvent } from 'react';
import { Button, Dialog } from '../../ui';
import { cropCover, previewSrc } from './coverCrop';
import { RATIO_VALUE } from './platformSpecs';

interface ZoomProps {
  open: boolean;
  src: string;
  onClose: () => void;
  onOpenCrop: () => void;
}

/** 公众号封面大图预览弹窗，支持直接跳转 2.35:1 裁剪。 */
export function WeixinCoverZoomDialog({ open, src, onClose, onOpenCrop }: ZoomProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="封面大图预览"
      description="如需调整公众号列表显示区域，可点击下方「裁剪 2.35:1」"
      className="w-[720px]"
      footer={
        <>
          <div className="flex-1" />
          <Button
            variant="ghost"
            className="h-9"
            onClick={() => {
              onClose();
              onOpenCrop();
            }}
          >
            裁剪 2.35:1
          </Button>
          <Button variant="primary" className="h-9" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-center bg-surface p-6" data-testid="weixin-cover-zoom">
        <img src={previewSrc(src)} alt="公众号封面大图" className="max-h-[65vh] w-auto max-w-full rounded-md border border-line object-contain" />
      </div>
    </Dialog>
  );
}

interface CropProps {
  open: boolean;
  src: string;
  initialFocus: { x: number; y: number };
  onClose: () => void;
  onApply: (path: string, focus: { x: number; y: number }) => void;
}

/** 按 2.35:1（900×383）选择裁切区域并保存为公众号单独封面。 */
export function WeixinCoverCropDialog({ open, src, initialFocus, onClose, onApply }: CropProps) {
  const [focus, setFocus] = useState(initialFocus);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setFocus(initialFocus);
  }, [open, initialFocus]);

  const updateFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * 100)));
    const y = Math.min(100, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * 100)));
    setFocus({ x, y });
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const cropped = await cropCover(src, '2.35:1', focus).catch(() => src);
      onApply(cropped, focus);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) onClose();
      }}
      title="裁剪公众号封面（2.35:1）"
      description="点击或拖动定位裁切中心，确认后保存为公众号单独封面（推荐 900×383）"
      className="w-[680px]"
      footer={
        <>
          <div className="flex-1 text-xs text-muted">焦点：{focus.x}%, {focus.y}%</div>
          <Button variant="ghost" className="h-9" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" className="h-9" loading={saving} onClick={() => void handleConfirm()} data-testid="weixin-crop-confirm">
            确认裁剪
          </Button>
        </>
      }
    >
      <div className="space-y-5 p-6" data-testid="weixin-cover-crop">
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative w-fit cursor-crosshair select-none overflow-hidden rounded-md border border-line bg-hover"
            data-testid="weixin-crop-stage"
            onPointerDown={(e) => {
              setDragging(true);
              updateFromPointer(e);
            }}
            onPointerMove={(e) => {
              if (dragging) updateFromPointer(e);
            }}
            onPointerUp={() => setDragging(false)}
            onPointerLeave={() => setDragging(false)}
          >
            <img src={previewSrc(src)} alt="裁剪原图" className="max-h-[42vh] w-auto max-w-full object-contain" draggable={false} />
            <span
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-2 ring-primary"
              style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
            />
          </div>
          <div className="w-full max-w-[320px] space-y-1">
            <div className="text-xs font-medium text-ink">裁切效果预览（2.35:1）</div>
            <div className="w-full overflow-hidden rounded-md border border-line bg-hover" style={{ aspectRatio: String(RATIO_VALUE['2.35:1']) }}>
              <img src={previewSrc(src)} alt="2.35:1 裁切预览" className="size-full object-cover" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
