import { useState } from 'react';
import { ArrowRight, Download, Moon, Sun } from 'lucide-react';
import type { SiteContent } from '../data/types';

interface HeroSectionProps {
  content: SiteContent;
}

const RELEASES_URL = 'https://github.com/leileigwl/vmark/releases/latest';
const REPO_URL = 'https://github.com/leileigwl/vmark';

export function HeroSection({ content }: HeroSectionProps) {
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light');
  const { hero } = content;

  return (
    <section className="relative overflow-hidden border-b border-stone-200/90 bg-[#FAF9F6] pt-16 pb-20 sm:pt-24 sm:pb-28 dark:border-stone-800/90 dark:bg-[#141312]">
      <div className="bg-paper-grid pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 py-1 text-[11px] font-medium text-stone-700 shadow-2xs sm:text-xs dark:border-stone-800 dark:bg-[#1C1B1A] dark:text-stone-300">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3B7CC4]" />
            <span>{hero.eyebrow}</span>
          </div>

          <h1 className="text-[1.7rem] font-semibold tracking-tight text-stone-900 leading-[1.24] sm:text-5xl lg:text-[3.35rem] lg:leading-[1.14] dark:text-stone-50">
            <span className="block">{hero.titleLine1}</span>
            <span className="mt-1.5 block text-[#3B7CC4] dark:text-sky-400">
              {hero.titleLine2}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg dark:text-stone-400">
            {hero.subtitle}
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-6 text-sm font-medium text-stone-800 shadow-2xs transition-colors hover:bg-stone-100/70 sm:w-auto dark:border-stone-800 dark:bg-[#1C1B1A] dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <span>{hero.secondaryCta}</span>
              <ArrowRight className="h-4 w-4 text-stone-400" />
            </a>
          </div>

          <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
            {hero.osNote}
          </p>
        </div>

        {/* Desktop App Window Showcase */}
        <div className="mx-auto mt-12 max-w-5xl">
          <div className="mb-4 flex items-center justify-center">
            <div
              role="group"
              aria-label="Editor theme screenshot toggle"
              className="inline-flex rounded-xl border border-stone-200 bg-white p-1 shadow-2xs dark:border-stone-800 dark:bg-[#1C1B1A]"
            >
              <button
                type="button"
                onClick={() => setPreviewMode('light')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                  previewMode === 'light'
                    ? 'bg-[#FAF9F6] text-stone-900 shadow-2xs ring-1 ring-stone-200 dark:bg-stone-800 dark:text-stone-50 dark:ring-stone-700'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                <span>{hero.previewLightLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('dark')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                  previewMode === 'dark'
                    ? 'bg-[#FAF9F6] text-stone-900 shadow-2xs ring-1 ring-stone-200 dark:bg-stone-800 dark:text-stone-50 dark:ring-stone-700'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                <span>{hero.previewDarkLabel}</span>
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-xl shadow-stone-900/5 dark:border-stone-800 dark:bg-[#1C1B1A] dark:shadow-black/40">
            <div className="flex h-9 items-center justify-between border-b border-stone-200/80 bg-[#F5F4F0] px-4 dark:border-stone-800 dark:bg-[#232120]">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-600" />
                <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-600" />
                <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-600" />
              </div>
              <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
                Vmark — ~/Documents/Notes/06_orchestration_test.md
              </span>
              <span className="w-10" />
            </div>

            <div className="relative bg-white dark:bg-[#0D1117]">
              <img
                src={
                  previewMode === 'light'
                    ? '/images/editor-light.png'
                    : '/images/editor-dark-mermaid.png'
                }
                alt={
                  previewMode === 'light'
                    ? hero.previewLightAlt
                    : hero.previewDarkAlt
                }
                className="block h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Three Core Note-Taking Pillars */}
        <div className="mx-auto mt-14 grid max-w-5xl gap-4 sm:grid-cols-3">
          {hero.pillars.map((pillar) => (
            <div
              key={pillar.tag}
              className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs transition-colors hover:border-stone-300 dark:border-stone-800 dark:bg-[#1C1B1A] dark:hover:border-stone-700"
            >
              <div className="font-mono text-[11px] font-medium tracking-wider text-[#3B7CC4] uppercase dark:text-sky-400">
                {pillar.tag}
              </div>
              <h2 className="mt-2 text-base font-semibold text-stone-900 dark:text-stone-100">
                {pillar.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
