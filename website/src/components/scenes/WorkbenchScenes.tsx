import { CheckCircle2, FileCode2, GitBranch, Sparkles } from 'lucide-react';
import type { Lang, ShowcaseTab } from '../../data/types';

interface WorkbenchScenesProps {
  activeId: ShowcaseTab['id'];
  lang: Lang;
  cardLabels: {
    xhsCover: string;
    inkCover: string;
    swissContent: string;
    douyinCode: string;
  };
}

export function WorkbenchScenes({ activeId, lang, cardLabels }: WorkbenchScenesProps) {
  const isZh = lang === 'zh';

  if (activeId === 'editor') {
    return (
      <div className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-[#F1F8F4] via-white to-[#EDF5FC] p-5 shadow-sm sm:p-6 dark:border-emerald-900/50 dark:from-[#15211B] dark:via-[#1C1B1A] dark:to-[#16202B]">
        {/* Crisp Mermaid Flow Scene */}
        <div className="rounded-xl border border-stone-200/80 bg-white/95 p-4 shadow-2xs dark:border-stone-800 dark:bg-[#141312]">
          <div className="mb-3 flex items-center justify-between text-[11px] font-medium text-stone-500 dark:text-stone-400">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
              <GitBranch className="h-3.5 w-3.5" />
              <span>mermaid · {isZh ? '实时流程图渲染' : 'Live Flowchart'}</span>
            </span>
            <span className="font-mono">IR Mode</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 py-2 text-xs font-medium">
            <span className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
              {isZh ? '本地笔记 .md' : 'Local Note .md'}
            </span>
            <span className="text-stone-400">→</span>
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
              {isZh ? 'AST 语法树解析' : 'AST Compiler'}
            </span>
            <span className="text-stone-400">→</span>
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              {isZh ? '平台草稿 / 3:4 卡片' : 'Drafts / 3:4 Cards'}
            </span>
          </div>
        </div>

        {/* Syntax Highlighted Code Block */}
        <div className="mt-4 overflow-hidden rounded-xl border border-stone-800 bg-[#1B1D23] p-4 text-left shadow-sm">
          <div className="mb-2.5 flex items-center justify-between text-[11px] text-stone-400">
            <span className="inline-flex items-center gap-1.5">
              <FileCode2 className="h-3.5 w-3.5 text-sky-400" />
              <span className="font-mono">pipeline.ts</span>
            </span>
            <span className="font-mono text-emerald-400">Token Highlight</span>
          </div>
          <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-stone-200">
            <code>
              <span className="text-purple-400">export async function</span>{' '}
              <span className="text-sky-300">publishToDraft</span>(note: LocalMarkdown) {'{\n'}
              {'  '}<span className="text-purple-400">const</span> images ={' '}
              <span className="text-amber-300">await</span> migrateAssets(note.assets);{'\n'}
              {'  '}<span className="text-purple-400">return</span> dispatchDraft(note.ast, images);{'\n'}
              {'}'}
            </code>
          </pre>
        </div>
      </div>
    );
  }

  if (activeId === 'manager') {
    const rows = isZh
      ? [
          { title: '本地优先笔记工作流实践', words: '4,280 词', imgs: '6 张', tag: '纯本地 .md', tone: 'sky' },
          { title: '多 Agent 编排模式与容错拆解', words: '8,150 词', imgs: '4 张', tag: '已推公众号草稿', tone: 'emerald' },
          { title: '京都深秋漫游手记：山野古寺步径', words: '2,640 词', imgs: '9 张', tag: '已生成 3:4 卡片', tone: 'rose' },
          { title: '前端构建性能优化复盘笔记', words: '3,910 词', imgs: '2 张', tag: '从知乎回流本地', tone: 'amber' },
        ]
      : [
          { title: 'Local-First Note-Taking Workflow', words: '4,280 w', imgs: '6 imgs', tag: 'Local .md', tone: 'sky' },
          { title: 'Multi-Agent Orchestration Patterns', words: '8,150 w', imgs: '4 imgs', tag: 'WeChat Draft', tone: 'emerald' },
          { title: 'Kyoto Autumn Trail Field Notes', words: '2,640 w', imgs: '9 imgs', tag: '3:4 Cards Ready', tone: 'rose' },
          { title: 'Frontend Build Latency Postmortem', words: '3,910 w', imgs: '2 imgs', tag: 'Imported Home', tone: 'amber' },
        ];

    const tagClass: Record<string, string> = {
      sky: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
      rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
      amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    };

    return (
      <div className="overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-[#FDF6EC] via-white to-[#F5EFE6] p-5 shadow-sm sm:p-6 dark:border-amber-900/40 dark:from-[#221D16] dark:via-[#1C1B1A] dark:to-[#181716]">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: isZh ? '本地文章' : 'Local Notes', val: '24', color: 'text-sky-600 dark:text-sky-400' },
            { label: isZh ? './assets/ 配图' : './assets/ Media', val: '86', color: 'text-emerald-600 dark:text-emerald-400' },
            { label: isZh ? '支持平台' : 'Platforms', val: '11+', color: 'text-amber-600 dark:text-amber-400' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 text-left dark:border-stone-800 dark:bg-[#141312]"
            >
              <div className="text-[11px] text-stone-500 dark:text-stone-400">{stat.label}</div>
              <div className={`mt-0.5 text-lg font-semibold ${stat.color}`}>{stat.val}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-[#141312]">
          <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
            {rows.map((row) => (
              <div key={row.title} className="flex items-center justify-between gap-3 px-4 py-3 text-left">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-stone-900 sm:text-sm dark:text-stone-100">
                    {row.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                    {row.words} · {row.imgs}
                  </div>
                </div>
                <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${tagClass[row.tone]}`}>
                  {row.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-200/70 bg-gradient-to-br from-[#FDF1F4] via-[#FAF6F0] to-[#EEF5FC] p-5 shadow-sm sm:p-6 dark:border-rose-900/40 dark:from-[#24181C] dark:via-[#1C1B1A] dark:to-[#161E29]">
      <div className="mb-3 flex items-center justify-between text-xs font-medium text-stone-600 dark:text-stone-300">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-rose-500" />
          <span>{isZh ? '1080×1440 高保真卡片实拍输出' : '1080×1440 Visual Cards Output'}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{isZh ? '离线光栅化' : 'Offline Rasterized'}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { src: '/images/xhs-card-cover.png', label: cardLabels.xhsCover },
          { src: '/images/theme-ink-cover.png', label: cardLabels.inkCover },
          { src: '/images/theme-swiss-content.png', label: cardLabels.swissContent },
          { src: '/images/douyin-card-code.png', label: cardLabels.douyinCode },
        ].map((card) => (
          <figure
            key={card.src}
            className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-sm transition-transform duration-200 hover:-translate-y-1 dark:border-stone-800 dark:bg-stone-950"
          >
            <img
              src={card.src}
              alt={card.label}
              loading="lazy"
              className="aspect-[3/4] w-full object-cover"
            />
            <figcaption className="border-t border-stone-200/80 px-2 py-2 text-center text-[11px] font-medium text-stone-700 dark:border-stone-800 dark:text-stone-300">
              {card.label}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
