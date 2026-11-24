import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Lang, ShowcaseTab, SiteContent } from '../data/types';
import { WorkbenchScenes } from './scenes/WorkbenchScenes';

interface WorkbenchShowcaseProps {
  content: SiteContent;
  lang: Lang;
}

export function WorkbenchShowcase({ content, lang }: WorkbenchShowcaseProps) {
  const [activeId, setActiveId] = useState<ShowcaseTab['id']>('editor');
  const { showcase } = content;
  const activeTab =
    showcase.tabs.find((tab) => tab.id === activeId) ?? showcase.tabs[0];

  return (
    <section
      id="workbench"
      className="border-b border-stone-200/90 bg-[#F5EFE6] py-20 sm:py-28 dark:border-stone-800/90 dark:bg-[#1B1917]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold tracking-widest text-[#B45309] uppercase dark:text-amber-400">
            {showcase.eyebrow}
          </p>
          <h2 className="mt-2.5 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
            {showcase.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-300">
            {showcase.subtitle}
          </p>
        </div>

        {/* Tab Bar */}
        <div className="mt-10 flex flex-wrap gap-2">
          {showcase.tabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'border-[#1C1917] bg-[#1C1917] text-white shadow-xs dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950'
                    : 'border-stone-300/80 bg-white/80 text-stone-700 hover:border-stone-400 hover:bg-white dark:border-stone-700 dark:bg-[#24211E] dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Showcase Panel */}
        <div className="mt-8 grid items-center gap-8 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm lg:grid-cols-12 lg:p-8 dark:border-stone-800 dark:bg-[#141312]">
          <div className="lg:col-span-5">
            <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
              {activeTab.badge}
            </span>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              {activeTab.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-600 sm:text-base dark:text-stone-400">
              {activeTab.description}
            </p>
            <ul className="mt-6 space-y-3">
              {activeTab.highlights.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm text-stone-700 dark:text-stone-300"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2E6EA8] dark:text-sky-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-7">
            <WorkbenchScenes
              activeId={activeTab.id}
              lang={lang}
              cardLabels={showcase.cardLabels}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
