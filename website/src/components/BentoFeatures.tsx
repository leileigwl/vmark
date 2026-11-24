import {
  FolderKanban,
  GitBranch,
  Image as ImageIcon,
  Palette,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { BentoFeature, SiteContent } from '../data/types';

interface BentoFeaturesProps {
  content: SiteContent;
}

const ACCENT_STYLES: Record<BentoFeature['icon'], string> = {
  folder: 'bg-sky-50 border-sky-200/80 text-[#2E6EA8] dark:bg-sky-950/50 dark:border-sky-900/60 dark:text-sky-300',
  sparkles: 'bg-amber-50 border-amber-200/80 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-300',
  diagram: 'bg-emerald-50 border-emerald-200/80 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300',
  palette: 'bg-rose-50 border-rose-200/80 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300',
  image: 'bg-indigo-50 border-indigo-200/80 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900/60 dark:text-indigo-300',
  shield: 'bg-teal-50 border-teal-200/80 text-teal-700 dark:bg-teal-950/40 dark:border-teal-900/60 dark:text-teal-300',
};

function renderIcon(icon: BentoFeature['icon']) {
  const cls = 'h-5 w-5';
  switch (icon) {
    case 'folder':
      return <FolderKanban className={cls} />;
    case 'sparkles':
      return <Sparkles className={cls} />;
    case 'diagram':
      return <GitBranch className={cls} />;
    case 'palette':
      return <Palette className={cls} />;
    case 'image':
      return <ImageIcon className={cls} />;
    case 'shield':
      return <ShieldCheck className={cls} />;
  }
}

export function BentoFeatures({ content }: BentoFeaturesProps) {
  const { bento } = content;

  return (
    <section
      id="features"
      className="border-b border-stone-200/90 bg-[#FAF9F6] py-20 sm:py-28 dark:border-stone-800/90 dark:bg-[#141312]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold tracking-widest text-[#3B7CC4] uppercase dark:text-sky-400">
            {bento.eyebrow}
          </p>
          <h2 className="mt-2.5 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
            {bento.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-400">
            {bento.subtitle}
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-6">
          {bento.items.map((item) => (
            <article
              key={item.id}
              className={`group flex flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs transition-all hover:border-stone-300 hover:shadow-sm dark:border-stone-800 dark:bg-[#1C1B1A] dark:hover:border-stone-700 ${
                item.span === 'wide' ? 'md:col-span-3' : 'md:col-span-3 lg:col-span-2'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${ACCENT_STYLES[item.icon]}`}
                  >
                    {renderIcon(item.icon)}
                  </span>
                  <span className="font-mono text-[11px] font-medium text-stone-500 dark:text-stone-400">
                    {item.category}
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                  {item.description}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 border-t border-stone-100 pt-4 dark:border-stone-800/80">
                {item.bullets.map((bullet) => (
                  <span
                    key={bullet}
                    className="rounded-md border border-stone-200/80 bg-[#FAF9F6] px-2.5 py-1 text-xs font-medium text-stone-700 dark:border-stone-800 dark:bg-[#141312] dark:text-stone-300"
                  >
                    {bullet}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
