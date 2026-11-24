import { ArrowRight, Download } from 'lucide-react';
import type { Lang, SiteContent } from '../data/types';
import { HeroAppScene } from './scenes/HeroAppScene';

interface HeroSectionProps {
  content: SiteContent;
  lang: Lang;
}

const RELEASES_URL = 'https://github.com/leileigwl/vmark/releases/latest';
const REPO_URL = 'https://github.com/leileigwl/vmark';

const PILLAR_THEMES = [
  'border-sky-200/80 bg-[#EDF5FD]/85 dark:border-sky-900/50 dark:bg-[#15202B]/90',
  'border-emerald-200/80 bg-[#ECF6F0]/85 dark:border-emerald-900/50 dark:bg-[#13221B]/90',
  'border-amber-200/80 bg-[#FDF2E9]/85 dark:border-amber-900/50 dark:bg-[#261C15]/90',
];

const PILLAR_TAGS = [
  'text-[#2563EB] dark:text-sky-400',
  'text-[#1F7A4C] dark:text-emerald-400',
  'text-[#B45309] dark:text-amber-400',
];

export function HeroSection({ content, lang }: HeroSectionProps) {
  const { hero } = content;

  return (
    <section className="craft-hero-wash relative overflow-hidden border-b border-stone-200/90 pt-14 pb-20 sm:pt-22 sm:pb-28 dark:border-stone-800/90">
      <div className="bg-paper-grid pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stone-200/90 bg-white/90 px-3.5 py-1 text-[11px] font-medium text-stone-700 shadow-2xs backdrop-blur-xs sm:text-xs dark:border-stone-800 dark:bg-[#1E1C1A]/90 dark:text-stone-300">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3B7CC4]" />
            <span>{hero.eyebrow}</span>
          </div>

          <h1 className="text-[1.7rem] leading-[1.24] font-semibold tracking-tight text-stone-900 sm:text-5xl lg:text-[3.35rem] lg:leading-[1.14] dark:text-stone-50">
            <span className="block">{hero.titleLine1}</span>
            <span className="mt-1.5 block text-[#2E6EA8] dark:text-sky-400">
              {hero.titleLine2}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg dark:text-stone-300">
            {hero.subtitle}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1C1917] px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-stone-800 sm:w-auto dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
            >
              <Download className="h-4 w-4" />
              <span>{hero.primaryCta}</span>
            </a>

            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-200/90 bg-white/90 px-6 text-sm font-medium text-stone-800 shadow-2xs backdrop-blur-xs transition-colors hover:bg-white sm:w-auto dark:border-stone-700 dark:bg-[#1E1C1A]/90 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <span>{hero.secondaryCta}</span>
              <ArrowRight className="h-4 w-4 text-stone-400" />
            </a>
          </div>

          <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
            {hero.osNote}
          </p>
        </div>

        {/* Interactive 4-Bloom-Theme Vmark Artboard */}
        <HeroAppScene lang={lang} />

        {/* Three Color-Tinted Craft Pillars */}
        <div className="mx-auto mt-14 grid max-w-5xl gap-4 sm:grid-cols-3">
          {hero.pillars.map((pillar, idx) => (
            <div
              key={pillar.tag}
              className={`rounded-2xl border p-6 shadow-2xs backdrop-blur-xs transition-transform duration-200 hover:-translate-y-0.5 ${
                PILLAR_THEMES[idx % PILLAR_THEMES.length]
              }`}
            >
              <div
                className={`font-mono text-[11px] font-semibold tracking-wider uppercase ${
                  PILLAR_TAGS[idx % PILLAR_TAGS.length]
                }`}
              >
                {pillar.tag}
              </div>
              <h2 className="mt-2 text-base font-semibold text-stone-900 dark:text-stone-100">
                {pillar.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
