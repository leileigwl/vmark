import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react';
import type { FindOptions } from './VditorEditor';

interface FindReplaceBarProps {
  findQuery: string;
  replaceQuery: string;
  matchIndex: number;
  matchTotal: number;
  replaceNotice: string;
  findOptions: FindOptions;
  onChangeFindQuery: (q: string) => void;
  onChangeReplaceQuery: (q: string) => void;
  onChangeOptions: (opts: FindOptions) => void;
  onPrev: () => void;
  onNext: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

/** Typora-style floating Find & Replace bar with Case, Whole Word, Regex toggles and hover tooltips. */
export function FindReplaceBar({
  findQuery,
  replaceQuery,
  matchIndex,
  matchTotal,
  replaceNotice,
  findOptions,
  onChangeFindQuery,
  onChangeReplaceQuery,
  onChangeOptions,
  onPrev,
  onNext,
  onReplaceAll,
  onClose,
}: FindReplaceBarProps) {
  const [expanded, setExpanded] = useState(false);
  const noResults = Boolean(findQuery.trim()) && matchTotal === 0;

  return (
    <div className="absolute top-2.5 right-6 z-40 flex flex-col gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]/95 px-2.5 py-2 text-xs text-[var(--text-main)] shadow-xl backdrop-blur-md">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title={expanded ? '收起替换栏' : '展开替换栏'}
          onClick={() => setExpanded((v) => !v)}
          className="flex h-6 w-5 items-center justify-center rounded text-[var(--control-text-color)] hover:bg-[var(--bg-hover)]"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <div
          className={`flex items-center rounded-lg border bg-[var(--bg-elevated)] px-1.5 py-0.5 transition ${
            noResults
              ? 'border-[#d1d5db] text-[#9ca3af]'
              : 'border-[var(--border-color)] focus-within:border-[var(--accent)]'
          }`}
        >
          <input
            type="text"
            autoFocus
            placeholder="查找正文..."
            value={findQuery}
            onChange={(e) => onChangeFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && findQuery) {
                e.preventDefault();
                if (e.shiftKey) onPrev();
                else onNext();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            className={`w-36 bg-transparent px-1 py-0.5 text-xs outline-none ${
              noResults ? 'text-[#9ca3af]' : 'text-[var(--text-main)]'
            }`}
          />

          {/* Case Sensitive */}
          <div className="group relative">
            <button
              type="button"
              onClick={() =>
                onChangeOptions({ ...findOptions, caseSensitive: !findOptions.caseSensitive })
              }
              className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-semibold transition ${
                findOptions.caseSensitive
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40'
                  : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              Aa
            </button>
            <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-main)] opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              区分大小写
            </span>
          </div>

          {/* Whole Word */}
          <div className="group relative">
            <button
              type="button"
              onClick={() => onChangeOptions({ ...findOptions, wholeWord: !findOptions.wholeWord })}
              className={`ml-0.5 flex h-6 w-6 items-center justify-center rounded text-[11px] font-semibold transition ${
                findOptions.wholeWord
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40'
                  : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <span className="border-b border-current px-0.5 font-mono text-[10px] leading-none">ab</span>
            </button>
            <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-main)] opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              查找整个单词
            </span>
          </div>

          {/* Regular Expression */}
          <div className="group relative">
            <button
              type="button"
              onClick={() => onChangeOptions({ ...findOptions, regex: !findOptions.regex })}
              className={`ml-0.5 flex h-6 w-6 items-center justify-center rounded font-mono text-[10px] font-semibold transition ${
                findOptions.regex
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40'
                  : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              (.*)
            </button>
            <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-main)] opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              正则表达式
            </span>
          </div>
        </div>

        <span
          className={`min-w-[52px] text-center text-[11px] tabular-nums ${
            noResults ? 'rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[#9ca3af]' : 'text-[var(--control-text-color)]'
          }`}
        >
          {!findQuery.trim() ? '' : noResults ? '无结果' : `${matchIndex + 1} / ${matchTotal}`}
        </span>

        <button
          type="button"
          title="上一个 (Shift+Enter)"
          disabled={noResults || !findQuery.trim()}
          onClick={onPrev}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--control-text-color)] hover:bg-[var(--bg-hover)] disabled:opacity-35"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="下一个 (Enter)"
          disabled={noResults || !findQuery.trim()}
          onClick={onNext}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--control-text-color)] hover:bg-[var(--bg-hover)] disabled:opacity-35"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="关闭 (Esc)"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--control-text-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="flex items-center gap-1.5 pl-6">
          <input
            type="text"
            placeholder="替换为..."
            value={replaceQuery}
            onChange={(e) => onChangeReplaceQuery(e.target.value)}
            className="w-44 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            disabled={noResults || !findQuery.trim()}
            onClick={onReplaceAll}
            className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            全部替换
          </button>
          {replaceNotice && <span className="text-[11px] text-[var(--accent)]">{replaceNotice}</span>}
        </div>
      )}
    </div>
  );
}
