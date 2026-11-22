import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, FileText, FolderOpen, Search, X } from 'lucide-react';
import type { ArticleMeta } from '@vcat/shared';

interface QuickOpenModalProps {
  open: boolean;
  articles: ArticleMeta[];
  recentArticlePaths: string[];
  activeArticlePath?: string | null;
  onClose: () => void;
  onSelectArticle: (article: ArticleMeta) => void;
  onSelectWorkspace: () => void;
  onClearRecent: () => void;
}

/** Command-palette Quick Open modal (Cmd+Shift+O) with Recent 5 Files and workspace search. */
export function QuickOpenModal({
  open,
  articles,
  recentArticlePaths,
  activeArticlePath,
  onClose,
  onSelectArticle,
  onSelectWorkspace,
  onClearRecent,
}: QuickOpenModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const recentArticles = useMemo(() => {
    const map = new Map(articles.map((a) => [a.relativePath, a]));
    return recentArticlePaths
      .slice(0, 5)
      .map((p) => map.get(p))
      .filter((a): a is ArticleMeta => Boolean(a));
  }, [articles, recentArticlePaths]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const recentSet = new Set(recentArticles.map((a) => a.relativePath));
      const rest = articles.filter((a) => !recentSet.has(a.relativePath));
      return [...recentArticles, ...rest].slice(0, 40);
    }
    return articles
      .filter(
        (a) =>
          a.relativePath.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [articles, recentArticles, query]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (!open) return null;

  const recentSet = new Set(recentArticles.map((a) => a.relativePath));

  return (
    <div
      role="dialog" aria-modal="true" data-vcat-quick-open="1"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[14vh] backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[540px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-[var(--border-color)] px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-[var(--control-text-color)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => (items.length ? (i + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
              } else if (e.key === 'Enter' && items[selectedIndex]) {
                e.preventDefault();
                onSelectArticle(items[selectedIndex]);
                onClose();
              }
            }}
            placeholder="快速打开文章（输入标题或路径，↑↓ 选择，Enter 打开）..."
            className="flex-1 bg-transparent text-[13px] text-[var(--text-main)] outline-none placeholder:text-[var(--control-text-color)]/70"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--control-text-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
            title="关闭 (ESC)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-[340px] overflow-y-auto py-1.5">
          {!query.trim() && recentArticles.length > 0 && (
            <div className="flex items-center justify-between px-3.5 py-1 text-[11px] font-medium text-[var(--control-text-color)]">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> 最近打开（最多 5 篇）
              </span>
              <button
                type="button"
                onClick={onClearRecent}
                className="text-[11px] hover:text-[var(--text-main)]"
              >
                清除
              </button>
            </div>
          )}

          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--control-text-color)]">
              没有匹配的文章
            </div>
          ) : (
            items.map((art, idx) => {
              const isSelected = idx === selectedIndex;
              const isRecent = !query.trim() && recentSet.has(art.relativePath);
              const isActive = art.relativePath === activeArticlePath;
              return (
                <button
                  key={art.relativePath}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    onSelectArticle(art);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[12.5px] ${
                    isSelected
                      ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
                      : 'text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {isRecent ? (
                      <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--control-text-color)]" />
                    )}
                    <span className="truncate font-medium">{art.relativePath}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--control-text-color)]">
                    {isActive ? '当前' : `${art.wordCount} 词`}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-color)] px-3.5 py-2 text-[11.5px] text-[var(--control-text-color)]">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectWorkspace();
            }}
            className="flex items-center gap-1.5 rounded px-2 py-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
          >
            <FolderOpen className="h-3.5 w-3.5" /> 打开本地工作区...
          </button>
          <span>⇧⌘O 快速打开</span>
        </div>
      </div>
    </div>
  );
}
