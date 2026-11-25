import { previewSrc } from './coverCrop';
import { coverFocusFor, coverFor, ownCoverOf, type Issue, type PublishDraft } from './draftModel';
import { OwnCoverField } from './OwnCoverField';
import { RATIO_VALUE, SPEC_BY_ID } from './platformSpecs';
import { SectionCard } from './SectionCard';

interface WeixinSectionProps {
  draft: PublishDraft;
  bodyImage: string;
  issues: Issue[];
  onChange: (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;
}

/**
 * 公众号块：封面推荐 2.35:1（900×383），可单独上传一张封面；没传就用通用封面或正文首图。
 */
export function WeixinSection({ draft, bodyImage, issues, onChange }: WeixinSectionProps) {
  const spec = SPEC_BY_ID.weixin!;
  const cover = coverFor(draft, spec, bodyImage);
  const src = cover && (cover.kind === 'upload' || cover.kind === 'body') ? cover.src : '';
  const focus = cover?.kind === 'upload' ? coverFocusFor(draft, spec) : { x: 50, y: 50 };
  const source = ownCoverOf(draft, spec)
    ? '使用单独封面'
    : draft.coverUpload
      ? '使用通用封面'
      : src
        ? '使用正文首图'
        : '请上传一张封面（推荐 2.35:1，900×383）';
  const summary = issues.length ? issues.map((i) => i.message).join(' · ') : source;

  return (
    <SectionCard id="weixin" title="公众号" summary={summary} warn={issues.length > 0}>
      <OwnCoverField
        draft={draft}
        spec={spec}
        onChange={onChange}
        title="单独封面（可选）"
        hint="推荐 2.35:1（900×383），不传则用通用封面或正文首图"
        uploadLabel="上传图片"
      />
      <div className="space-y-3" data-testid="weixin-cover">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink">封面裁剪</div>
          <p className="mt-0.5 text-[11px] text-muted">2.35:1（900×383）· {source}</p>
        </div>
        {src ? (
          <figure className="space-y-1">
            <div className="h-20 overflow-hidden rounded-md border border-line bg-hover" style={{ aspectRatio: String(RATIO_VALUE['2.35:1']) }}>
              <img src={previewSrc(src)} alt="2.35:1 封面预览" className="size-full object-cover" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} />
            </div>
            <figcaption className="text-[11px] text-muted">2.35:1</figcaption>
          </figure>
        ) : null}
      </div>
    </SectionCard>
  );
}
