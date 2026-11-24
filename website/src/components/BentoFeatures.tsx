import {
  FolderKanban,
  GitBranch,
  Image as ImageIcon,
  Palette,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { BentoFeature, Lang, SiteContent } from '../data/types';
import { BentoMiniScenes } from './scenes/BentoMiniScenes';

interface BentoFeaturesProps {
  content: SiteContent;
  lang: Lang;
}

const CARD_THEMES: Record<
  BentoFeature['icon'],
  { card: string; iconBox: string; cat: string; title: string; desc: string; chip: string; divider: string }
> = {
  folder: {
    card: 'border-sky-200/80 bg-[#EDF5FD] dark:border-sky-900/50 dark:bg-[#15202B]',
    iconBox: 'border-sky-200 bg-white text-[#2563EB] dark:border-sky-800 dark:bg-[#1D2D3D] dark:text-sky-300',
    cat: 'text-sky-700/80 dark:text-sky-300/80',
    title: 'text-stone-900 dark:text-stone-50',
    desc: 'text-stone-600 dark:text-stone-300',
    chip: 'border-sky-200/80 bg-white/80 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-200',
    divider: 'border-sky-200/60 dark:border-sky-900/50',
  },
  sparkles: {
    card: 'border-amber-200/80 bg-[#FDF3E7] dark:border-amber-900/50 dark:bg-[#241C14]',
    iconBox: 'border-amber-200 bg-white text-amber-700 dark:border-amber-800 dark:bg-[#32251A] dark:text-amber-300',
    cat: 'text-amber-800/80 dark:text-amber-300/80',
    title: 'text-stone-900 dark:text-stone-50',
    desc: 'text-stone-600 dark:text-stone-300',
    chip: 'border-amber-200/80 bg-white/80 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-200',
    divider: 'border-amber-200/60 dark:border-amber-900/50',
  },
  diagram: {
    card: 'border-emerald-200/80 bg-[#ECF6F0] dark:border-emerald-900/50 dark:bg-[#13221B]',
    iconBox: 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-800 dark:bg-[#1A3025] dark:text-emerald-300',
    cat: 'text-emerald-800/80 dark:text-emerald-300/80',
    title: 'text-stone-900 dark:text-stone-50',
    desc: 'text-stone-600 dark:text-stone-300',
    chip: 'border-emerald-200/80 bg-white/80 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-200',
    divider: 'border-emerald-200/60 dark:border-emerald-900/50',
  },
  palette: {
    card: 'border-rose-200/80 bg-[#FDF0F3] dark:border-rose-900/50 dark:bg-[#25171C]',
    iconBox: 'border-rose-200 bg-white text-rose-600 dark:border-rose-800 dark:bg-[#351F26] dark:text-rose-300',
    cat: 'text-rose-700/80 dark:text-rose-300/80',
    title: 'text-stone-900 dark:text-stone-50',
    desc: 'text-stone-600 dark:text-stone-300',
    chip: 'border-rose-200/80 bg-white/80 text-rose-900 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-200',
    divider: 'border-rose-200/60 dark:border-rose-900/50',
  },
  image: {
    card: 'border-violet-200/80 bg-[#F3EFFD] dark:border-violet-900/50 dark:bg-[#1D1829]',
    iconBox: 'border-violet-200 bg-white text-violet-700 dark:border-violet-800 dark:bg-[#2A223B] dark:text-violet-300',
    cat: 'text-violet-700/80 dark:text-violet-300/80',
    title: 'text-stone-900 dark:text-stone-50',
    desc: 'text-stone-600 dark:text-stone-300',
    chip: 'border-violet-200/80 bg-white/80 text-violet-900 dark:border-violet-800/70 dark:bg-violet-950/60 dark:text-violet-200',
    divider: 'border-violet-200/60 dark:border-violet-900/50',
  },
  shield: {
    card: 'border-stone-800 bg-[#1E1B18] dark:border-stone-700 dark:bg-[#1B1917]',
    iconBox: 'border-stone-700 bg-stone-800 text-amber-400',
    cat: 'text-amber-300/90',
    title: 'text-stone-50',
    desc: 'text-stone-300',
    chip: 'border-stone-700 bg-stone-800/90 text-stone-200',
    divider: 'border-stone-800',
  },
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

export function BentoFeatures({ content, lang }: BentoFeaturesProps) {
  const { bento } = content;

  return (
    <section
      id="features"
      className="border-b border-stone-200/90 bg-white py-20 sm:py-28 dark:border-stone-800/90 dark:bg-[#141210]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold tracking-widest text-[#2E6EA8] uppercase dark:text-sky-400">
            {bento.eyebrow}
          </p>
          <h2 className="mt-2.5 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
            {bento.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-400">
            {bento.subtitle}
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-6">
          {bento.items.map((item, idx) => {
            const theme = CARD_THEMES[item.icon];
            const spanClass =
              idx === 0
                ? 'md:col-span-3 lg:col-span-4'
                : idx === 5
                  ? 'md:col-span-3 lg:col-span-6'
                  : 'md:col-span-3 lg:col-span-2';
            return (
              <article
                key={item.id}
                className={`flex flex-col justify-between rounded-3xl border p-6 transition-transform duration-200 hover:-translate-y-0.5 ${
                  theme.card
                } ${spanClass}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border shadow-2xs ${theme.iconBox}`}
                    >
                      {renderIcon(item.icon)}
                    </span>
                    <span className={`font-mono text-[11px] font-semibold ${theme.cat}`}>
                      {item.category}
                    </span>
                  </div>

                  <h3 className={`mt-5 text-lg font-semibold tracking-tight ${theme.title}`}>
                    {item.title}
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${theme.desc}`}>
                    {item.description}
                  </p>

                  <BentoMiniScenes icon={item.icon} lang={lang} />
                </div>

                <div className={`mt-5 flex flex-wrap gap-2 border-t pt-4 ${theme.divider}`}>
                  {item.bullets.map((bullet) => (
                    <span
                      key={bullet}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium ${theme.chip}`}
                    >
                      {bullet}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
