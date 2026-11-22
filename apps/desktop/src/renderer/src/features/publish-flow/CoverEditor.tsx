import { useRef, useState } from 'react';
import { Check, ImagePlus, Crop } from 'lucide-react';
import { Button, cn } from '../../ui';
import { cropCover, importLocalImage, previewSrc } from './coverCrop';
import { RATIO_VALUE, type CoverRatio } from './platformSpecs';
import type { PublishDraft } from './draftModel';

interface CoverEditorProps {
  draft: PublishDraft;
  candidates: string[];
  /** 需要生成的比例及使用它的平台名。 */
  ratios: Array<{ ratio: CoverRatio; platforms: string[] }>;
  onChange: (patch: Partial<PublishDraft>) => void;
}

/** 封面：选一张原图 → 点图设焦点 → 一次裁出所有平台需要的比例。 */
export function CoverEditor({ draft, candidates, ratios, onChange }: CoverEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = draft.coverSource;

  const setSource = (next: string) => onChange({ coverSource: next, coverCrops: {}, coverFocus: { x: 50, y: 50 } });

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setError(null);
    try {
      setSource(await importLocalImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCropAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const crops: PublishDraft['coverCrops'] = {};
      for (const { ratio } of ratios) crops[ratio] = await cropCover(src, ratio, draft.coverFocus);
      onChange({ coverCrops: crops });
    } catch (e) {
      setError(`裁剪失败：${e instanceof Error ? e.message : String(e)}。将使用原图，由平台自动裁切。`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {candidates.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setSource(c)}
            className={cn(
              'relative size-14 overflow-hidden rounded-md border bg-hover',
              src === c ? 'border-primary ring-2 ring-primary/30' : 'border-line hover:border-muted'
            )}
            aria-label="用这张图做封面"
          >
            <img src={previewSrc(c)} alt="" className="size-full object-cover" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-line text-[10px] text-muted hover:border-muted hover:text-ink"
        >
          <ImagePlus className="size-4" />
          上传
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void handleUpload(e.target.files?.[0])} />
      </div>

      {src ? (
        <>
          <p className="text-[11px] text-muted">点击下方原图设置焦点，各比例会以焦点为中心裁切。</p>
          <div
            className="relative max-h-48 cursor-crosshair overflow-hidden rounded-md border border-line bg-hover"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const x = Math.round(((e.clientX - r.left) / r.width) * 100);
              const y = Math.round(((e.clientY - r.top) / r.height) * 100);
              onChange({ coverFocus: { x, y }, coverCrops: {} });
            }}
          >
            <img src={previewSrc(src)} alt="封面原图" className="mx-auto max-h-48 object-contain" />
            <span
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
              style={{ left: `${draft.coverFocus.x}%`, top: `${draft.coverFocus.y}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {ratios.map(({ ratio, platforms }) => (
              <div key={ratio} className="space-y-1">
                <div
                  className="overflow-hidden rounded-md border border-line bg-hover"
                  style={{ aspectRatio: String(RATIO_VALUE[ratio]) }}
                >
                  <img
                    src={previewSrc(draft.coverCrops[ratio] ?? src)}
                    alt={`${ratio} 封面预览`}
                    className="size-full object-cover"
                    style={draft.coverCrops[ratio] ? undefined : { objectPosition: `${draft.coverFocus.x}% ${draft.coverFocus.y}%` }}
                  />
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="font-medium text-ink">{ratio}</span>
                  {draft.coverCrops[ratio] ? <Check className="size-3 text-success" aria-label="已裁剪" /> : null}
                </div>
                <div className="truncate text-[11px] text-muted" title={platforms.join('、')}>
                  {platforms.join('、')}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void handleCropAll()} loading={busy} disabled={ratios.length === 0}>
              {!busy ? <Crop /> : null}
              {Object.keys(draft.coverCrops).length ? '重新裁剪' : '裁剪全部比例'}
            </Button>
            {error ? <span className="text-[11px] text-danger">{error}</span> : null}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-muted">正文里没有图片，请上传一张作为封面。</p>
      )}
    </div>
  );
}
