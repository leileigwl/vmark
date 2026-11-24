import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ShowcaseTab, SiteContent } from '../data/types';

interface WorkbenchShowcaseProps {
  content: SiteContent;
}

export function WorkbenchShowcase({ content }: WorkbenchShowcaseProps) {
  const [activeId, setActiveId] = useState<ShowcaseTab['id']>('editor');
  const { showcase } = content;
  const activeTab =
    showcase.tabs.find((tab) => tab.id === activeId) ?? showcase.tabs[0];

  return (
    <section
      id="workbench"
      className="border-b border-stone-200/90 bg-white py-20 sm:py-28 dark:border-stone-800/90 dark:bg-[#181716]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold tracking-widest text-[#3B7CC4] uppercase dark:text-sky-400">
            {showcase.eyebrow}
          </p>
          <h2 className="mt-2.5 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
            {showcase.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-400">
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
                    : 'border-stone-200 bg-[#FAF9F6] text-stone-700 hover:border-stone-300 hover:text-stone-950 dark:border-stone-800 dark:bg-[#1C1B1A] dark:text-stone-300 dark:hover:border-stone-700 dark:hover:text-stone-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Showcase Panel */}
        <div className="mt-8 grid items-center gap-8 rounded-3xl border border-stone-200/90 bg-[#FAF9F6] p-6 shadow-xs lg:grid-cols-12 lg:p-8 dark:border-stone-800 dark:bg-[#1C1B1A]">
          <div className="lg:col-span-5">
            <span className="inline-flex rounded-md border border-stone-200 bg-white px-2.5 py-1 font-mono text-[11px] font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
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
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#3B7CC4] dark:text-sky-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-7">
            {activeTab.id === 'editor' && (
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-md dark:border-stone-800 dark:bg-stone-950">
                <img
                  src="/images/editor-dark-mermaid.png"
                  alt={activeTab.title}
                  loading="lazy"
                  className="block h-auto w-full object-cover"
                />
              </div>
            )}

            {activeTab.id === 'manager' && (
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-md dark:border-stone-800 dark:bg-stone-950">
                <img
                  src="/images/article-manager.png"
                  alt={activeTab.title}
                  loading="lazy"
                  className="block h-auto w-full object-cover"
                />
              </div>
            )}

            {activeTab.id === 'cards' && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    src: '/images/xhs-card-cover.png',
                    label: showcase.cardLabels.xhsCover,
                  },
                  {
                    src: '/images/theme-ink-cover.png',
                    label: showcase.cardLabels.inkCover,
                  },
                  {
                    src: '/images/theme-swiss-content.png',
                    label: showcase.cardLabels.swissContent,
                  },
                  {
                    src: '/images/douyin-card-code.png',
                    label: showcase.cardLabels.douyinCode,
                  },
                ].map((card) => (
                  <figure
                    key={card.src}
                    className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950"
                  >
                    <img
                      src={card.src}
                      alt={card.label}
                      loading="lazy"
                      className="aspect-[3/4] w-full object-cover"
                    />
                    <figcaption className="border-t border-stone-200/80 px-2.5 py-2 text-center text-[11px] font-medium text-stone-600 dark:border-stone-800 dark:text-stone-400">
                      {card.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
