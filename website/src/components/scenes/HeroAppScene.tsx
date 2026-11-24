import { useState } from 'react';
import { FileText, Folder, Hash, Image as ImageIcon, Search, Send, Sparkles } from 'lucide-react';
import type { Lang } from '../../data/types';

type BloomPresetId = 'apple' | 'matcha' | 'paper' | 'midnight';

interface BloomPreset {
  id: BloomPresetId;
  labelZh: string;
  labelEn: string;
  swatch: string;
  chromeBg: string;
  sidebarBg: string;
  canvasBg: string;
  borderColor: string;
  inkPrimary: string;
  inkMuted: string;
  accentBg: string;
  accentText: string;
  calloutBg: string;
  calloutBorder: string;
  isDark: boolean;
}

const BLOOM_PRESETS: BloomPreset[] = [
  {
    id: 'apple',
    labelZh: 'Apple Light · 苹果白',
    labelEn: 'Apple Light',
    swatch: '#3B7CC4',
    chromeBg: '#F6F5F2',
    sidebarBg: '#F9F8F6',
    canvasBg: '#FFFFFF',
    borderColor: '#E7E5E4',
    inkPrimary: '#1C1917',
    inkMuted: '#6B6661',
    accentBg: '#EBF4FC',
    accentText: '#2563EB',
    calloutBg: '#F2F7FD',
    calloutBorder: '#3B7CC4',
    isDark: false,
  },
  {
    id: 'matcha',
    labelZh: 'Bloom Matcha · 抹茶护眼',
    labelEn: 'Bloom Matcha',
    swatch: '#2E8B57',
    chromeBg: '#EDF4EE',
    sidebarBg: '#F2F7F3',
    canvasBg: '#FBFDFB',
    borderColor: '#D6E6D9',
    inkPrimary: '#17281E',
    inkMuted: '#4C6B57',
    accentBg: '#DFF0E4',
    accentText: '#1F7A4C',
    calloutBg: '#EEF8F1',
    calloutBorder: '#2E8B57',
    isDark: false,
  },
  {
    id: 'paper',
    labelZh: 'Warm Ivory · 暖纸书卷',
    labelEn: 'Warm Ivory',
    swatch: '#C26A36',
    chromeBg: '#F4EDE2',
    sidebarBg: '#F7F1E7',
    canvasBg: '#FFFDF8',
    borderColor: '#E7DCCB',
    inkPrimary: '#2B2118',
    inkMuted: '#786655',
    accentBg: '#FAEBDD',
    accentText: '#B45309',
    calloutBg: '#FDF5EB',
    calloutBorder: '#C26A36',
    isDark: false,
  },
  {
    id: 'midnight',
    labelZh: 'Bloom Dark · 暗夜代码',
    labelEn: 'Bloom Dark',
    swatch: '#60A5FA',
    chromeBg: '#191C22',
    sidebarBg: '#1E222A',
    canvasBg: '#15181E',
    borderColor: '#2D323E',
    inkPrimary: '#F3F4F6',
    inkMuted: '#9CA3AF',
    accentBg: '#253247',
    accentText: '#60A5FA',
    calloutBg: '#1D283A',
    calloutBorder: '#60A5FA',
    isDark: true,
  },
];

interface HeroAppSceneProps {
  lang: Lang;
}

export function HeroAppScene({ lang }: HeroAppSceneProps) {
  const [presetId, setPresetId] = useState<BloomPresetId>('apple');
  const t = BLOOM_PRESETS.find((p) => p.id === presetId) ?? BLOOM_PRESETS[0];
  const isZh = lang === 'zh';

  const folders = isZh
    ? [
        { name: '产品思考', open: true, files: ['本地优先写作法则.md', '双栏大纲交互设计.md'] },
        { name: '技术架构', open: true, files: ['多平台 AST 渲染管线.md', '防盗链图片转存策略.md'] },
        { name: '读书札记', open: false, files: [] },
      ]
    : [
        { name: 'Product Notes', open: true, files: ['local-first-principles.md', 'outline-craft.md'] },
        { name: 'Architecture', open: true, files: ['ast-render-pipeline.md', 'image-proxy-design.md'] },
        { name: 'Reading Logs', open: false, files: [] },
      ];

  return (
    <div className="mx-auto mt-10 max-w-5xl">
      {/* 4-Theme Interactive Bloom Switcher */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        {BLOOM_PRESETS.map((preset) => {
          const active = preset.id === presetId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => setPresetId(preset.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                active
                  ? 'border-stone-900 bg-stone-900 text-white shadow-xs dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950'
                  : 'border-stone-200/90 bg-white/90 text-stone-700 hover:border-stone-300 hover:bg-white dark:border-stone-800 dark:bg-[#1E1C1A] dark:text-stone-300'
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: preset.swatch }}
              />
              <span>{isZh ? preset.labelZh : preset.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* Crafted Vmark Desktop Window */}
      <div
        className="overflow-hidden rounded-2xl border shadow-2xl shadow-stone-900/10 transition-colors duration-300 dark:shadow-black/50"
        style={{ borderColor: t.borderColor, backgroundColor: t.canvasBg }}
      >
        {/* Window Chrome */}
        <div
          className="flex h-10 items-center justify-between border-b px-4 transition-colors duration-300"
          style={{ borderColor: t.borderColor, backgroundColor: t.chromeBg }}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
          </div>
          <div className="hidden items-center gap-2 font-mono text-[11px] sm:flex" style={{ color: t.inkMuted }}>
            <span>~/Notes/</span>
            <span className="font-semibold" style={{ color: t.inkPrimary }}>
              {isZh ? '多平台 AST 渲染管线.md' : 'ast-render-pipeline.md'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] sm:inline" style={{ color: t.inkMuted }}>
              {isZh ? '3,420 词 · 已保存' : '3,420 words · Saved'}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-white shadow-2xs"
              style={{ backgroundColor: t.swatch }}
            >
              <Send className="h-3 w-3" />
              <span>{isZh ? '分发草稿' : 'Dispatch'}</span>
            </span>
          </div>
        </div>

        {/* App Body */}
        <div className="grid min-h-[390px] md:grid-cols-12">
          {/* Left Workspace Sidebar */}
          <aside
            className="hidden border-r p-4 transition-colors duration-300 md:col-span-4 md:block lg:col-span-3"
            style={{ borderColor: t.borderColor, backgroundColor: t.sidebarBg }}
          >
            <div className="mb-4 flex items-center justify-between text-[11px] font-medium" style={{ color: t.inkMuted }}>
              <span className="flex items-center gap-1.5">
                <Folder className="h-3.5 w-3.5" style={{ color: t.swatch }} />
                <span>{isZh ? '文件 (18)' : 'Files (18)'}</span>
              </span>
              <span className="flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" />
                <span>{isZh ? '大纲' : 'Outline'}</span>
              </span>
              <Search className="h-3.5 w-3.5" />
            </div>

            <div className="space-y-2.5 text-left text-xs">
              {folders.map((folder) => (
                <div key={folder.name}>
                  <div className="flex items-center gap-1.5 py-1 font-medium" style={{ color: t.inkPrimary }}>
                    <Folder className="h-3.5 w-3.5 opacity-70" />
                    <span>{folder.name}</span>
                  </div>
                  {folder.open && (
                    <div className="ml-3 space-y-1 border-l pl-2.5" style={{ borderColor: t.borderColor }}>
                      {folder.files.map((file, i) => {
                        const activeFile = folder.name === folders[1].name && i === 0;
                        return (
                          <div
                            key={file}
                            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium"
                            style={{
                              backgroundColor: activeFile ? t.accentBg : 'transparent',
                              color: activeFile ? t.accentText : t.inkMuted,
                            }}
                          >
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate">{file}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div
              className="mt-6 rounded-xl border p-3 text-left"
              style={{ borderColor: t.borderColor, backgroundColor: t.canvasBg }}
            >
              <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: t.inkMuted }}>
                {isZh ? '本地资产状态' : 'Local Storage'}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px]" style={{ color: t.inkPrimary }}>
                <span>./assets/</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">6 PNGs · Offline</span>
              </div>
            </div>
          </aside>

          {/* Main Instant-Rendered Markdown Canvas */}
          <div className="p-6 text-left sm:p-8 md:col-span-8 lg:col-span-9" style={{ color: t.inkPrimary }}>
            <div className="mx-auto max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-medium" style={{ color: t.inkMuted }}>
                <span
                  className="rounded-md px-2 py-0.5 font-mono"
                  style={{ backgroundColor: t.accentBg, color: t.accentText }}
                >
                  {isZh ? '即时渲染 IR' : 'Instant Render'}
                </span>
                <span>•</span>
                <span>{isZh ? '本地目录：~/Notes/技术架构' : 'Workspace: ~/Notes/Architecture'}</span>
              </div>

              <h3 className="text-xl font-bold tracking-tight sm:text-2xl">
                {isZh
                  ? '本地优先笔记工作流：一次书写，多端优雅成稿'
                  : 'Local-First Note Workflow: Write Once, Publish Cleanly'}
              </h3>

              {/* Callout Block */}
              <div
                className="mt-4 rounded-xl border-l-4 p-4 text-xs leading-relaxed sm:text-sm"
                style={{
                  backgroundColor: t.calloutBg,
                  borderLeftColor: t.calloutBorder,
                }}
              >
                <div className="mb-1 flex items-center gap-1.5 font-semibold" style={{ color: t.accentText }}>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isZh ? '[!TIP] 笔记即资产' : '[!TIP] Notes Stay Local'}</span>
                </div>
                <p style={{ color: t.inkMuted }}>
                  {isZh
                    ? '所有正文保存为标准 .md 纯文本，粘贴配图自动就近落盘至 ./assets/8f2a.png。断网亦可流畅检索、大纲跳转与 Git 版本归档。'
                    : 'Every document saves as plain .md with images stored locally in ./assets/8f2a.png — 100% offline-capable and Git-friendly.'}
                </p>
              </div>

              {/* Embedded Local Asset Preview + Formula */}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div
                  className="rounded-xl border p-3.5"
                  style={{ borderColor: t.borderColor, backgroundColor: t.sidebarBg }}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: t.inkMuted }}>
                    <ImageIcon className="h-3.5 w-3.5" style={{ color: t.swatch }} />
                    <span className="font-mono">./assets/pipeline-diagram.png</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 text-[11px] font-medium">
                    <span className="rounded-md px-2 py-1" style={{ backgroundColor: t.accentBg, color: t.accentText }}>
                      Markdown AST
                    </span>
                    <span style={{ color: t.inkMuted }}>→</span>
                    <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
                      {isZh ? '公众号 / 知乎 / 卡片' : 'WeChat / Zhihu / Cards'}
                    </span>
                  </div>
                </div>

                <div
                  className="rounded-xl border p-3.5"
                  style={{ borderColor: t.borderColor, backgroundColor: t.sidebarBg }}
                >
                  <div className="text-[11px] font-medium" style={{ color: t.inkMuted }}>
                    {isZh ? 'KaTeX 公式与行内代码高亮' : 'KaTeX Math & Inline Code'}
                  </div>
                  <div className="mt-2 font-mono text-xs" style={{ color: t.inkPrimary }}>
                    <span>Throughput = </span>
                    <span style={{ color: t.accentText }}>∑(Notes) / Friction</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
