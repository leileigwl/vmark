import { Lock } from 'lucide-react';
import type { SiteContent } from '../data/types';

interface PlatformMatrixProps {
  content: SiteContent;
}

export function PlatformMatrix({ content }: PlatformMatrixProps) {
  const { platforms } = content;

  return (
    <section
      id="platforms"
      className="border-b border-stone-200/90 bg-white py-20 sm:py-28 dark:border-stone-800/90 dark:bg-[#181716]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold tracking-widest text-[#3B7CC4] uppercase dark:text-sky-400">
            {platforms.eyebrow}
          </p>
          <h2 className="mt-2.5 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
            {platforms.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-400">
            {platforms.subtitle}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {platforms.groups.map((group) => (
            <div
              key={group.mode}
              className="flex flex-col rounded-2xl border border-stone-200/90 bg-[#FAF9F6] p-6 dark:border-stone-800 dark:bg-[#1C1B1A]"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-50">
                  {group.mode}
                </h3>
                <span className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[11px] font-medium text-[#2E6EA8] dark:border-sky-900/60 dark:bg-sky-950/60 dark:text-sky-300">
                  {group.badge}
                </span>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                {group.description}
              </p>

              <ul className="mt-5 divide-y divide-stone-200/70 border-t border-stone-200/70 dark:divide-stone-800 dark:border-stone-800">
                {group.platforms.map((item) => (
                  <li key={item.name} className="py-3">
                    <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
                      {item.name}
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                      {item.detail}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3 rounded-xl border border-stone-200 bg-[#FAF9F6] px-4 py-3 text-xs text-stone-600 sm:text-sm dark:border-stone-800 dark:bg-[#1C1B1A] dark:text-stone-400">
          <Lock className="h-4 w-4 shrink-0 text-[#3B7CC4] dark:text-sky-400" />
          <span>{platforms.safetyNote}</span>
        </div>
      </div>
    </section>
  );
}
