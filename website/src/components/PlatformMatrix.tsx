import { Lock } from 'lucide-react';
import type { SiteContent } from '../data/types';

interface PlatformMatrixProps {
  content: SiteContent;
}

const PLATFORM_DOT_COLORS: Record<string, string> = {
  微信公众号: '#07C160',
  'WeChat Official Account': '#07C160',
  知乎专栏: '#0066FF',
  'Zhihu Column': '#0066FF',
  稀土掘金: '#1E80FF',
  Juejin: '#1E80FF',
  CSDN: '#FC5531',
  百家号: '#2932E1',
  Baijiahao: '#2932E1',
  'B 站专栏': '#FB7299',
  'Bilibili Column': '#FB7299',
  '小红书 / 抖音 / 微博': '#FF2442',
  'Xiaohongshu / Douyin / Weibo': '#FF2442',
  'GitHub 静态博客': '#24292F',
  'GitHub Static Blogs': '#24292F',
  博客园: '#2E7ACC',
  Cnblogs: '#2E7ACC',
  小红书图文卡片: '#FF2442',
  'Xiaohongshu Slides': '#FF2442',
  '抖音 / 朋友圈长图': '#FE2C55',
  'Douyin / Social Carousel': '#FE2C55',
};

const GROUP_BADGE_THEMES = [
  'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300',
  'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/60 dark:text-sky-300',
  'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300',
];

export function PlatformMatrix({ content }: PlatformMatrixProps) {
  const { platforms } = content;

  return (
    <section
      id="platforms"
      className="border-b border-stone-200/90 bg-[#F8F5F0] py-20 sm:py-28 dark:border-stone-800/90 dark:bg-[#191715]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold tracking-widest text-[#1F7A4C] uppercase dark:text-emerald-400">
            {platforms.eyebrow}
          </p>
          <h2 className="mt-2.5 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
            {platforms.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-300">
            {platforms.subtitle}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {platforms.groups.map((group, idx) => (
            <div
              key={group.mode}
              className="flex flex-col rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs dark:border-stone-800 dark:bg-[#1E1C1A]"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-50">
                  {group.mode}
                </h3>
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${
                    GROUP_BADGE_THEMES[idx % GROUP_BADGE_THEMES.length]
                  }`}
                >
                  {group.badge}
                </span>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                {group.description}
              </p>

              <ul className="mt-5 divide-y divide-stone-100 border-t border-stone-100 dark:divide-stone-800 dark:border-stone-800">
                {group.platforms.map((item) => {
                  const dotColor = PLATFORM_DOT_COLORS[item.name] || '#3B7CC4';
                  return (
                    <li key={item.name} className="py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span>{item.name}</span>
                      </div>
                      <div className="mt-0.5 pl-4 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                        {item.detail}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3 rounded-xl border border-stone-200/90 bg-white px-4 py-3 text-xs text-stone-600 sm:text-sm dark:border-stone-800 dark:bg-[#1E1C1A] dark:text-stone-400">
          <Lock className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{platforms.safetyNote}</span>
        </div>
      </div>
    </section>
  );
}
