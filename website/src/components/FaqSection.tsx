import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SiteContent } from '../data/types';

interface FaqSectionProps {
  content: SiteContent;
}

export function FaqSection({ content }: FaqSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const { faq } = content;

  return (
    <section
      id="faq"
      className="border-b border-stone-200/90 bg-[#FAF9F6] py-20 sm:py-28 dark:border-stone-800/90 dark:bg-[#141312]"
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center">
          <p className="font-mono text-xs font-semibold tracking-widest text-[#3B7CC4] uppercase dark:text-sky-400">
            {faq.eyebrow}
          </p>
          <h2 className="mt-2.5 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
            {faq.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-stone-600 dark:text-stone-400">
            {faq.subtitle}
          </p>
        </div>

        <div className="mt-12 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-[#1C1B1A]">
          {faq.items.map((item, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div key={item.question} className="px-6 py-5">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <span className="text-sm font-semibold text-stone-900 sm:text-base dark:text-stone-100">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                    {item.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
