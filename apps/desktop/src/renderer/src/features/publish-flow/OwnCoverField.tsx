import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '../../ui';
import { FocusImage, useImageUpload } from './CoverField';
import { setOwnCover, type PublishDraft } from './draftModel';
import { ownCoverEligible, type PlatformSpec } from './platformSpecs';

type Update = (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;

interface OwnCoverFieldProps {
  draft: PublishDraft;
  spec: PlatformSpec;
  onChange: Update;
  title: string;
  /** 没传单独封面时的说明。 */
  hint: string;
  /** 没传时上传按钮的文字。 */
  uploadLabel: string;
}

/** 某平台的单独封面：上传 / 更换 / 移除，传了就点图设焦点。没传就用通用封面按该平台比例裁。 */
export function OwnCoverField({ draft, spec, onChange, title, hint, uploadLabel }: OwnCoverFieldProps) {
  const own = draft.ownCovers[spec.id];
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (cover: string, focus?: { x: number; y: number }) => onChange((d) => ({ ownCovers: setOwnCover(d, spec.id, cover, focus) }));
  const { upload, error, busy } = useImageUpload((path) => set(path), fileRef);
  return (
    <div className="space-y-2" data-testid={`own-cover-${spec.id}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink">{title}</div>
          <p className="mt-0.5 text-[11px] text-muted">{own ? `已单独设置 ${spec.cover?.ratios[0]} · 点图片设置焦点` : hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {own ? (
            <Button variant="ghost" className="h-9" onClick={() => set('')}>
              移除
            </Button>
          ) : null}
          <Button className="h-9" loading={busy} onClick={() => fileRef.current?.click()}>
            {!busy ? <ImagePlus /> : null}
            {own ? '更换' : uploadLabel}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          data-testid={`own-cover-input-${spec.id}`}
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {own ? <FocusImage src={own.cover} focus={own.focus} onFocus={(f) => set(own.cover, f)} className="h-20" /> : null}
    </div>
  );
}

/**
 * 除公众号（在公众号块里）外，封面比例与通用封面不同的平台各给一个「为该平台单独设置封面」入口。
 * 哪些平台出现完全由 platformSpecs 的封面比例决定；放在平台自己的块里（小红书/抖音块、平台专属），通用区不出现比例。
 */
export function OwnCoverEntries({ draft, specs, onChange }: { draft: PublishDraft; specs: PlatformSpec[]; onChange: Update }) {
  const list = specs.filter((s) => s.id !== 'weixin' && ownCoverEligible(s));
  if (list.length === 0) return null;
  return (
    <div className="space-y-3 border-l-2 border-line pl-4" data-testid="own-cover-entries">
      {list.map((spec) => (
        <OwnCoverField
          key={spec.id}
          draft={draft}
          spec={spec}
          onChange={onChange}
          title={`${spec.short}单独封面（可选）`}
          hint={`比例和通用封面不同，没传就用通用封面按 ${spec.cover?.ratios[0]} 裁`}
          uploadLabel={`为${spec.short}单独设置封面`}
        />
      ))}
    </div>
  );
}
