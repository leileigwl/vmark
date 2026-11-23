import { Field, Input, Textarea } from '../../ui';
import { previewSrc } from './coverCrop';
import { FocusImage } from './CoverField';
import { resolveFor, setOverride, type Issue, type PublishDraft } from './draftModel';
import { RATIO_VALUE, SPEC_BY_ID, coverGuide } from './platformSpecs';
import { SectionCard } from './SectionCard';
import { WeixinPreview } from './WeixinPreview';

interface WeixinSectionProps {
  draft: PublishDraft;
  markdown: string;
  bodyImage: string;
  issues: Issue[];
  onChange: (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;
}

/** 公众号专属：标题/摘要（不填沿用通用）、作者、阅读原文、2.35:1 + 1:1 裁切预览与焦点、排版预览与复制富文本。 */
export function WeixinSection({ draft, markdown, bodyImage, issues, onChange }: WeixinSectionProps) {
  const spec = SPEC_BY_ID.weixin!;
  const guide = coverGuide(spec, bodyImage);
  const v = resolveFor(draft, 'weixin');
  const o = draft.overrides.weixin ?? {};
  // 清空 = 回到通用值（setOverride 会把与通用值相同的改写删掉）
  const override = (patch: { title?: string; digest?: string }) =>
    onChange((d) => ({ overrides: setOverride(d, 'weixin', { title: patch.title === '' ? d.title : patch.title, digest: patch.digest === '' ? d.digest : patch.digest }) }));
  const own = [o.title !== undefined && '标题', o.digest !== undefined && '摘要', draft.weixinAuthor && '作者', draft.weixinSourceUrl && '阅读原文'].filter(Boolean);
  const summary = issues.length ? issues.map((i) => i.message).join(' · ') : own.length ? `单独设置了${own.join('、')}` : '沿用通用内容 · 点开设置作者、阅读原文、看排版';
  const ratios = spec.cover?.ratios ?? [];

  return (
    <SectionCard id="weixin" title="公众号" summary={summary} warn={issues.length > 0}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Field label="公众号标题" htmlFor="wx-title" count={{ value: [...v.title.trim()].length, max: spec.title.max }} className="col-span-2">
          <Input id="wx-title" className="h-9" value={o.title ?? ''} placeholder={`沿用通用：${draft.title}`} onChange={(e) => override({ title: e.target.value })} />
        </Field>
        <Field label="公众号摘要" htmlFor="wx-digest" count={{ value: [...v.digest.trim()].length, max: spec.digest?.max }} className="col-span-2">
          <Textarea id="wx-digest" value={o.digest ?? ''} placeholder="沿用通用摘要" onChange={(e) => override({ digest: e.target.value })} />
        </Field>
        <Field label="作者" htmlFor="wx-author">
          <Input id="wx-author" className="h-9" value={draft.weixinAuthor} placeholder="可不填" onChange={(e) => onChange({ weixinAuthor: e.target.value })} />
        </Field>
        <Field label="阅读原文" htmlFor="wx-source">
          <Input id="wx-source" className="h-9" value={draft.weixinSourceUrl} placeholder="https://…（可不填）" onChange={(e) => onChange({ weixinSourceUrl: e.target.value })} />
        </Field>
      </div>
      <div className="space-y-2" data-testid="weixin-cover">
        <div className="text-xs font-medium text-ink">封面裁切</div>
        {draft.coverUpload ? (
          <div className="flex flex-wrap items-end gap-4">
            <FocusImage src={draft.coverUpload} focus={draft.coverFocus} onFocus={(coverFocus) => onChange({ coverFocus })} className="h-20" />
            {ratios.map((ratio) => (
              <figure key={ratio} className="space-y-1">
                <div className="h-20 overflow-hidden rounded-md border border-line bg-hover" style={{ aspectRatio: String(RATIO_VALUE[ratio]) }}>
                  <img
                    src={previewSrc(draft.coverUpload)}
                    alt={`${ratio} 封面预览`}
                    className="size-full object-cover"
                    style={{ objectPosition: `${draft.coverFocus.x}% ${draft.coverFocus.y}%` }}
                  />
                </div>
                <figcaption className="text-[11px] text-muted">
                  {guide?.slots.find((s) => s.ratio === ratio)?.label} {ratio}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted">
            未上传封面：{guide?.needUpload ? '正文没有图片，请在上方通用封面上传一张' : `用正文首图自动裁成 ${ratios.join(' + ')}`}
          </p>
        )}
      </div>
      <WeixinPreview markdown={markdown} />
    </SectionCard>
  );
}
