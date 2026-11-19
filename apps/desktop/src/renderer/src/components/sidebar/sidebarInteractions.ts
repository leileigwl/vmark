import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ArticleMeta } from '@vcat/shared';

interface SidebarListKeyParams {
  e: React.KeyboardEvent;
  sideTab: 'files' | 'outline';
  renamingPath: string | null;
  creatingItem: unknown;
  filteredArticles: ArticleMeta[];
  activeArticle: ArticleMeta | null;
  expandedDirs: Record<string, boolean>;
  selectedPaths: string[];
  articles: ArticleMeta[];
  folders: string[];
  setExpandedDirs: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSelectedPaths: Dispatch<SetStateAction<string[]>>;
  onOpenArticle: (art: ArticleMeta) => void;
  onRenameStart: (art: ArticleMeta) => void;
  onDeleteArticle: (art: ArticleMeta) => Promise<void>;
  onDeleteFolder?: (folderPath: string) => Promise<void>;
  onBatchDeleteArticles?: (targets: ArticleMeta[]) => Promise<void>;
  onBatchDeleteItems?: (articles: ArticleMeta[], folders: string[]) => Promise<void>;
}

/** Handles keyboard navigation, rename, and batch deletion in the sidebar file list. */
export function handleSidebarListKeyDown(p: SidebarListKeyParams): void {
  const { e } = p;
  if (p.sideTab !== 'files' || p.renamingPath || p.creatingItem) return;
  if (p.filteredArticles.length === 0) return;

  const idx = p.filteredArticles.findIndex((a) => a.relativePath === p.activeArticle?.relativePath);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = p.filteredArticles[Math.min(p.filteredArticles.length - 1, idx + 1)] ?? p.filteredArticles[0];
    if (next) p.onOpenArticle(next);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = p.filteredArticles[Math.max(0, idx - 1)] ?? p.filteredArticles[0];
    if (prev) p.onOpenArticle(prev);
  } else if (e.key === 'ArrowLeft') {
    const currentPath = p.activeArticle?.relativePath ?? '';
    const parentDir = currentPath.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '';
    if (parentDir) {
      e.preventDefault();
      p.setExpandedDirs((prev) => ({ ...prev, [parentDir]: false }));
    }
  } else if (e.key === 'ArrowRight') {
    const currentPath = p.activeArticle?.relativePath ?? '';
    const parentDir = currentPath.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '';
    if (parentDir && p.expandedDirs[parentDir] === false) {
      e.preventDefault();
      p.setExpandedDirs((prev) => ({ ...prev, [parentDir]: true }));
    }
  } else if (e.key === 'Enter' || e.key === 'F2') {
    if (p.activeArticle) {
      e.preventDefault();
      p.onRenameStart(p.activeArticle);
    }
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    if (p.selectedPaths.length > 1) {
      e.preventDefault();
      const selectedSet = new Set(p.selectedPaths);
      const targetArticles = p.articles.filter((a) => selectedSet.has(a.relativePath));
      const targetFolders = p.folders.filter((f) => selectedSet.has(f));
      if (targetFolders.length > 0 && p.onBatchDeleteItems) {
        void p.onBatchDeleteItems(targetArticles, targetFolders);
      } else if (targetArticles.length > 0 && p.onBatchDeleteArticles) {
        void p.onBatchDeleteArticles(targetArticles);
      }
      p.setSelectedPaths([]);
    } else if (p.selectedPaths.length === 1) {
      const single = p.selectedPaths[0];
      if (p.folders.includes(single)) {
        e.preventDefault();
        void p.onDeleteFolder?.(single);
        p.setSelectedPaths([]);
      } else {
        const targetArt = p.articles.find((a) => a.relativePath === single) ?? p.activeArticle;
        if (targetArt) {
          e.preventDefault();
          void p.onDeleteArticle(targetArt);
          p.setSelectedPaths([]);
        }
      }
    } else if (p.activeArticle) {
      e.preventDefault();
      void p.onDeleteArticle(p.activeArticle);
    }
  }
}

/** Starts drag marquee selection across visible sidebar rows. */
export function startSidebarMarqueeSelection(params: {
  e: React.MouseEvent;
  sideTab: 'files' | 'outline';
  renamingPath: string | null;
  creatingItem: unknown;
  fileListRef: MutableRefObject<HTMLDivElement | null>;
  suppressNextClickRef: MutableRefObject<boolean>;
  setMarqueeRect: Dispatch<SetStateAction<{ left: number; top: number; width: number; height: number } | null>>;
  setSelectedPaths: Dispatch<SetStateAction<string[]>>;
}): void {
  const { e, sideTab, renamingPath, creatingItem, fileListRef, suppressNextClickRef, setMarqueeRect, setSelectedPaths } =
    params;
  if (e.button !== 0 || e.ctrlKey || sideTab !== 'files' || renamingPath || creatingItem) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest('input, textarea, [draggable="true"]')) return;

  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;

  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!active && Math.hypot(dx, dy) < 6) return;
    active = true;
    const left = Math.min(startX, ev.clientX);
    const top = Math.min(startY, ev.clientY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    setMarqueeRect({ left, top, width, height });
    const container = fileListRef.current;
    if (container) {
      const hits: string[] = [];
      container.querySelectorAll<HTMLElement>('[data-article-path], [data-folder-path]').forEach((row) => {
        const pathVal = row.dataset.articlePath || row.dataset.folderPath;
        if (!pathVal) return;
        const r = row.getBoundingClientRect();
        const intersects =
          r.right >= left && r.left <= left + width && r.bottom >= top && r.top <= top + height;
        if (intersects) hits.push(pathVal);
      });
      setSelectedPaths(hits);
    }
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (active) {
      suppressNextClickRef.current = true;
      setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 80);
    } else if (!t?.closest('[data-article-path], [data-folder-path]')) {
      setSelectedPaths([]);
    }
    setMarqueeRect(null);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/** Computes a non-colliding default name for creating a new file or folder in `parentDir`. */
export function buildDefaultCreateDraft(
  type: 'file' | 'folder',
  articles: ArticleMeta[],
  folders: string[],
  parentDir?: string
): string {
  if (type === 'folder') {
    let candidate = '新建文件夹';
    let i = 2;
    while (folders.includes(parentDir ? `${parentDir}/${candidate}` : candidate)) {
      candidate = `新建文件夹 ${i++}`;
    }
    return candidate;
  }
  let candidate = 'Untitled.md';
  let i = 2;
  while (articles.some((a) => a.relativePath === (parentDir ? `${parentDir}/${candidate}` : candidate))) {
    candidate = `Untitled ${i++}.md`;
  }
  return candidate;
}

/** Handles Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z file undo/redo shortcuts when the sidebar is focused. */
export function handleSidebarAsideKeyDown(params: {
  e: React.KeyboardEvent;
  sideTab: 'files' | 'outline';
  renamingPath: string | null;
  creatingItem: unknown;
  onUndoFileOp?: () => Promise<void>;
  onRedoFileOp?: () => Promise<void>;
}): void {
  const { e, sideTab, renamingPath, creatingItem, onUndoFileOp, onRedoFileOp } = params;
  const target = e.target as HTMLElement | null;
  if (target?.closest('input, textarea')) return;
  if (sideTab !== 'files' || renamingPath || creatingItem) return;
  if ((e.metaKey || e.ctrlKey) && !e.altKey) {
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      void onUndoFileOp?.();
    } else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      void onRedoFileOp?.();
    }
  }
}

/** Handles folder click multi-select or expand toggle. */
export function handleSidebarFolderClick(params: {
  e: React.MouseEvent;
  folderPath: string;
  suppressNextClick: boolean;
  setSelectedPaths: Dispatch<SetStateAction<string[]>>;
  setLastClickedPath: Dispatch<SetStateAction<string | null>>;
  setExpandedDirs: Dispatch<SetStateAction<Record<string, boolean>>>;
}): void {
  const { e, folderPath, suppressNextClick, setSelectedPaths, setLastClickedPath, setExpandedDirs } = params;
  if (suppressNextClick) return;
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    setSelectedPaths((prev) =>
      prev.includes(folderPath) ? prev.filter((p) => p !== folderPath) : [...prev, folderPath]
    );
    setLastClickedPath(folderPath);
    return;
  }
  setSelectedPaths([folderPath]);
  setLastClickedPath(folderPath);
  setExpandedDirs((prev) => ({ ...prev, [folderPath]: !(prev[folderPath] ?? true) }));
}

/** Handles article row click with Shift range-select, Cmd/Ctrl toggle, and open. */
export function handleSidebarArticleClick(params: {
  e: React.MouseEvent;
  article: ArticleMeta;
  suppressNextClick: boolean;
  lastClickedPath: string | null;
  activeArticle: ArticleMeta | null;
  flatVisibleArticles: ArticleMeta[];
  setSelectedPaths: Dispatch<SetStateAction<string[]>>;
  setLastClickedPath: Dispatch<SetStateAction<string | null>>;
  onOpenArticle: (art: ArticleMeta) => void;
}): void {
  const {
    e,
    article,
    suppressNextClick,
    lastClickedPath,
    activeArticle,
    flatVisibleArticles,
    setSelectedPaths,
    setLastClickedPath,
    onOpenArticle,
  } = params;
  if (suppressNextClick) return;
  if (e.shiftKey) {
    e.preventDefault();
    const anchorPath = lastClickedPath ?? activeArticle?.relativePath ?? article.relativePath;
    const idxA = flatVisibleArticles.findIndex((a) => a.relativePath === anchorPath);
    const idxB = flatVisibleArticles.findIndex((a) => a.relativePath === article.relativePath);
    if (idxA !== -1 && idxB !== -1) {
      const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
      setSelectedPaths(flatVisibleArticles.slice(start, end + 1).map((a) => a.relativePath));
    } else {
      setSelectedPaths([article.relativePath]);
    }
    return;
  }
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    setSelectedPaths((prev) =>
      prev.includes(article.relativePath)
        ? prev.filter((p) => p !== article.relativePath)
        : [...prev, article.relativePath]
    );
    setLastClickedPath(article.relativePath);
    return;
  }
  setSelectedPaths([article.relativePath]);
  setLastClickedPath(article.relativePath);
  onOpenArticle(article);
}
