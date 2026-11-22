import { RotateCcw } from 'lucide-react';
import { Button, Field, Input, Switch, Textarea } from '../../ui';
import type { PublishDraft } from './draftModel';
import { CoverEditor } from './CoverEditor';
import { TagInput } from './TagInput';
import type { CoverRatio } from './platformSpecs';

interface CommonPanelProps {
  draft: PublishDraft;
  autoDigest: string;
  candidates: string[];
  ratios: Array<{ ratio: CoverRatio; platforms: string[] }>;
  onChange: (patch: Partial<PublishDraft>) => void;
}

/** 通用信息：所有平台默认共用，个别平台可在自己的页面里覆盖。 */
export function CommonPanel({ draft, autoDigest, candidates, ratios, onChange }: CommonPanelProps) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <Header title="通用信息" desc="所有平台默认使用这里的内容；需要不同写法时，到左侧对应平台单独修改。" />
        <Field label="标题" htmlFor="pub-title" count={{ value: [...draft.title].length }} required>
          <Input id="pub-title" value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field
          label="摘要"
          htmlFor="pub-digest"
          count={{ value: [...draft.digest].length }}
          hint="默认从正文开头提取。"
        >
          <div className="relative">
            <Textarea id="pub-digest" value={draft.digest} onChange={(e) => onChange({ digest: e.target.value })} />
            {draft.digest !== autoDigest ? (
              <Button variant="ghost" size="sm" className="absolute bottom-1.5 right-1.5" onClick={() => onChange({ digest: autoDigest })}>
                <RotateCcw />
                重新提取
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label="标签" htmlFor="pub-tags" hint="回车添加。掘金、CSDN 必填。">
          <TagInput id="pub-tags" value={draft.tags} onChange={(tags) => onChange({ tags })} placeholder="如：前端, Markdown" />
        </Field>
      </section>

      <section className="space-y-3">
        <Header title="封面" desc="选一张图，自动裁出各平台需要的比例。" />
        <CoverEditor draft={draft} candidates={candidates} ratios={ratios} onChange={onChange} />
      </section>

      <section className="space-y-3">
        <Header title="图片" />
        <label className="flex items-start justify-between gap-4 rounded-[var(--radius-ui)] border border-line p-3">
          <span>
            <span className="block text-[13px] text-ink">自动转存正文图片</span>
            <span className="block text-[11px] text-muted">本地图片和外链图片会上传到各平台自己的图床，避免显示不出来。</span>
          </span>
          <Switch checked={draft.includeRemoteImages} onCheckedChange={(v) => onChange({ includeRemoteImages: v })} aria-label="自动转存正文图片" />
        </label>
      </section>
    </div>
  );
}

export function Header({ title, desc }: { title: string; desc?: string }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      {desc ? <p className="mt-0.5 text-[11px] text-muted">{desc}</p> : null}
    </div>
  );
}
