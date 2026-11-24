import { Check, FolderOpen, Lock } from 'lucide-react';
import type { BentoFeature, Lang } from '../../data/types';

interface BentoMiniScenesProps {
  icon: BentoFeature['icon'];
  lang: Lang;
}

export function BentoMiniScenes({ icon, lang }: BentoMiniScenesProps) {
  const isZh = lang === 'zh';

  if (icon === 'folder') {
    return (
      <div className="mt-4 rounded-xl border border-sky-200/70 bg-white/85 p-3 text-[11px] dark:border-sky-900/50 dark:bg-[#141312]/80">
        <div className="flex items-center justify-between font-mono text-stone-700 dark:text-stone-300">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <FolderOpen className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <span>~/Notes/design-system.md</span>
          </span>
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
            Git ✓
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-stone-500 dark:text-stone-400">
          <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
            ./assets/cover-8f2a.png
          </span>
          <span>100% Offline</span>
        </div>
      </div>
    );
  }

  if (icon === 'sparkles') {
    return (
      <div className="mt-4 rounded-xl border border-amber-200/70 bg-white/85 p-3 text-left text-[11px] dark:border-amber-900/50 dark:bg-[#141312]/80">
        <div className="font-mono text-[10px] text-stone-400">## {isZh ? '核心设计原则' : 'Core Principles'}</div>
        <div className="mt-1 text-xs font-semibold text-stone-900 dark:text-stone-100">
          {isZh ? '核心设计原则' : 'Core Principles'}
        </div>
        <div className="mt-1.5 rounded-md border-l-2 border-amber-500 bg-amber-50/80 px-2 py-1 text-[10px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          [!NOTE] {isZh ? '所写即所得，无需分屏' : 'Instant rendering, zero split view'}
        </div>
      </div>
    );
  }

  if (icon === 'diagram') {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200/70 bg-white/85 p-3 text-[11px] dark:border-emerald-900/50 dark:bg-[#141312]/80">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            Input
          </span>
          <span className="text-stone-400">→</span>
          <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-900 dark:bg-sky-950 dark:text-sky-300">
            Mermaid
          </span>
        </div>
        <span className="font-mono text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
          ∫ f(x)dx · KaTeX
        </span>
      </div>
    );
  }

  if (icon === 'palette') {
    const swatches = ['#3B7CC4', '#2E8B57', '#D97706', '#E11D48', '#7C3AED', '#1C1917'];
    return (
      <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-rose-200/70 bg-white/85 p-3 dark:border-rose-900/50 dark:bg-[#141312]/80">
        <div className="flex items-center -space-x-1.5">
          {swatches.map((hex) => (
            <span
              key={hex}
              className="h-6 w-6 rounded-full border-2 border-white shadow-2xs dark:border-stone-900"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        <span className="rounded-md bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          + custom.css
        </span>
      </div>
    );
  }

  if (icon === 'image') {
    return (
      <div className="mt-4 flex items-center justify-between gap-1.5 rounded-xl border border-indigo-200/70 bg-white/85 p-3 font-mono text-[10px] dark:border-indigo-900/50 dark:bg-[#141312]/80">
        <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
          ./assets/
        </span>
        <span className="text-stone-400">→</span>
        <span className="rounded bg-stone-100 px-2 py-1 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
          Referer Proxy
        </span>
        <span className="text-stone-400">→</span>
        <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          CDN ✓
        </span>
      </div>
    );
  }

  // shield (deep espresso contrast card)
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {[
        {
          name: isZh ? '微信公众号 · 独立沙箱' : 'WeChat · Isolated Partition',
          status: isZh ? '已推入草稿箱' : 'Draft Box Ready',
        },
        {
          name: isZh ? '知乎专栏 · 独立沙箱' : 'Zhihu · Isolated Partition',
          status: isZh ? '链接已回查 ✓' : 'URL Verified ✓',
        },
      ].map((item) => (
        <div
          key={item.name}
          className="flex items-center justify-between rounded-xl border border-stone-700/80 bg-stone-900/90 px-3 py-2.5 text-[11px] text-stone-200"
        >
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-amber-400" />
            <span>{item.name}</span>
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
            <Check className="h-3 w-3" />
            <span>{item.status}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
