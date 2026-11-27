import { useEffect, useRef } from 'react';
import type { ArticleMeta, GitStatusInfo, ImageBedConfig, StartupConfig } from '@vcat/shared';

const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;
const MARKDOWN_FILE_RE = /\.(md|markdown)$/i;

/** Extracts native filesystem paths from a drop DataTransfer via Electron's `webUtils` bridge. */
export function extractDroppedFilePaths(dt: DataTransfer | null): string[] {
  if (!dt || !dt.files || dt.files.length === 0) return [];
  const paths: string[] = [];
  for (const file of Array.from(dt.files)) {
    const resolved =
      window.electronFileBridge?.getPathForFile(file) ||
      (file as File & { path?: string }).path ||
      '';
    if (resolved) paths.push(resolved);
  }
  return paths;
}

/** Returns true when a drag event carries OS files rather than internal tree items. */
export function isExternalFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = Array.from(dt.types ?? []);
  return types.includes('Files') && !types.includes('application/x-vcat-folder');
}

function isImageOnlyDragOver(dt: DataTransfer | null): boolean {
  if (!dt?.items || dt.items.length === 0) return false;
  const items = Array.from(dt.items).filter((it) => it.kind === 'file');
  return items.length > 0 && items.every((it) => it.type.startsWith('image/'));
}

/**
 * Intercepts external Markdown file / folder drops onto the editor or main window
 * (while preserving sidebar drops and editor image drops).
 */
export function useWindowFileDrop(onOpenExternalFile: (filePath: string) => void): void {
  const onOpenRef = useRef(onOpenExternalFile);
  onOpenRef.current = onOpenExternalFile;

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!isExternalFileDrag(e.dataTransfer)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-vcat-file-tree="1"]')) return;
      if (isImageOnlyDragOver(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = (e: DragEvent) => {
      if (!isExternalFileDrag(e.dataTransfer)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-vcat-file-tree="1"]')) return;
      const paths = extractDroppedFilePaths(e.dataTransfer);
      if (paths.length === 0) return;
      if (paths.every((p) => IMAGE_FILE_RE.test(p))) return;
      e.preventDefault();
      e.stopPropagation();
      const mdPath = paths.find((p) => MARKDOWN_FILE_RE.test(p)) ?? paths[0];
      if (mdPath) onOpenRef.current(mdPath);
    };

    window.addEventListener('dragover', onDragOver, true);
    window.addEventListener('drop', onDrop, true);
    return () => {
      window.removeEventListener('dragover', onDragOver, true);
      window.removeEventListener('drop', onDrop, true);
    };
  }, []);
}

export interface SidebarExternalFileActions {
  onImportExternalFiles: (filePaths: string[], targetFolder?: string) => Promise<void>;
  onCopyFiles: (relativePaths: string[]) => Promise<void>;
  onPasteFiles: (targetFolder?: string) => Promise<void>;
  onOpenExternalFile: (filePath?: string) => Promise<void>;
}

/** Manages external open-file, OS drag-import, clipboard copy/paste, and FS watcher auto-refresh. */
export function useExternalWorkspaceOps(deps: {
  activeArticle: ArticleMeta | null;
  openArticle: (meta: ArticleMeta, cfgOverride?: StartupConfig, searchKeyword?: string, force?: boolean) => Promise<void>;
  flushActiveArticle: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  setWorkspacePath: (p: string | null) => void;
  setRecentWorkspaces: (r: string[]) => void;
  setArticles: (a: ArticleMeta[]) => void;
  setFolders: (f: string[]) => void;
  setGitStatus: (g: GitStatusInfo) => void;
  setImageBed: (cfg: ImageBedConfig) => void;
  setStartupConfig: (cfg: StartupConfig) => void;
  setActiveArticle: (a: ArticleMeta | null) => void;
  setMarkdown: (md: string) => void;
  setActiveViewEditor: () => void;
  showToast: (errOrMsg: unknown) => void;
}) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const activeArticleRef = useRef(deps.activeArticle);
  activeArticleRef.current = deps.activeArticle;
  const openArticleRef = useRef(deps.openArticle);
  openArticleRef.current = deps.openArticle;
  const flushRef = useRef(deps.flushActiveArticle);
  flushRef.current = deps.flushActiveArticle;

  async function refreshWorkspaceListsOnly() {
    if (!window.electronAPI) return;
    const [list, folderList, git] = await Promise.all([
      window.electronAPI.listArticles(),
      window.electronAPI.listFolders(),
      window.electronAPI.getGitStatus(),
    ]);
    deps.setArticles(list);
    deps.setFolders(folderList);
    deps.setGitStatus(git);
    const cur = activeArticleRef.current;
    if (cur && !list.some((a) => a.relativePath === cur.relativePath)) {
      if (list.length > 0) await openArticleRef.current(list[0], undefined, undefined, true);
      else {
        deps.setActiveArticle(null);
        deps.setMarkdown('');
      }
    } else if (!cur && list.length > 0) {
      await openArticleRef.current(list[0], undefined, undefined, true);
    }
  }

  async function handleOpenExternalFile(filePath?: string) {
    if (!window.electronAPI?.openExternalFile) return;
    await flushRef.current();
    try {
      const res = await window.electronAPI.openExternalFile(filePath);
      if (!res) return;
      deps.setWorkspacePath(res.workspacePath);
      const [recent, list, folderList, git] = await Promise.all([
        window.electronAPI.getRecentWorkspaces(),
        window.electronAPI.listArticles(),
        window.electronAPI.listFolders(),
        window.electronAPI.getGitStatus(),
      ]);
      deps.setRecentWorkspaces(recent);
      deps.setArticles(list);
      deps.setFolders(folderList);
      deps.setGitStatus(git);
      deps.setActiveViewEditor();
      if (res.relativePath) {
        const match = list.find((a) => a.relativePath === res.relativePath);
        if (match) {
          await openArticleRef.current(match, undefined, undefined, true);
          return;
        }
      }
      if (list.length > 0) await openArticleRef.current(list[0], undefined, undefined, true);
      else {
        deps.setActiveArticle(null);
        deps.setMarkdown('');
      }
    } catch (err) {
      deps.showToast(err);
    }
  }

  async function handleImportExternalFiles(filePaths: string[], targetFolder = '') {
    if (!window.electronAPI?.importExternalFiles || filePaths.length === 0) return;
    try {
      const res = await window.electronAPI.importExternalFiles(filePaths, targetFolder);
      await refreshWorkspaceListsOnly();
      if (res.importedArticles.length > 0) {
        await openArticleRef.current(res.importedArticles[0], undefined, undefined, true);
        deps.setActiveViewEditor();
        deps.showToast(`已导入 ${res.importedArticles.length} 篇文章`);
      } else if (res.importedFolders.length > 0) {
        deps.showToast(`已导入 ${res.importedFolders.length} 个文件夹`);
      } else if (res.skipped.length > 0) {
        deps.showToast(`未能导入：${res.skipped.join('、')}`);
      }
    } catch (err) {
      deps.showToast(err);
    }
  }

  async function handleCopySidebarFiles(relativePaths: string[]) {
    if (!window.electronAPI?.copyFilesToClipboard || relativePaths.length === 0) return;
    const ok = await window.electronAPI.copyFilesToClipboard(relativePaths);
    if (ok) deps.showToast(`已复制 ${relativePaths.length} 项`);
  }

  async function handlePasteSidebarFiles(targetFolder = '') {
    if (!window.electronAPI?.pasteClipboardFiles) return;
    try {
      const res = await window.electronAPI.pasteClipboardFiles(targetFolder);
      if (res.importedArticles.length === 0 && res.importedFolders.length === 0) {
        deps.showToast('剪贴板中没有可粘贴的文件');
        return;
      }
      await refreshWorkspaceListsOnly();
      if (res.importedArticles.length > 0) {
        await openArticleRef.current(res.importedArticles[0], undefined, undefined, true);
        deps.setActiveViewEditor();
      }
      deps.showToast(`已粘贴 ${res.importedArticles.length + res.importedFolders.length} 项`);
    } catch (err) {
      deps.showToast(err);
    }
  }

  const openExternalRef = useRef(handleOpenExternalFile);
  openExternalRef.current = handleOpenExternalFile;
  const refreshListsRef = useRef(refreshWorkspaceListsOnly);
  refreshListsRef.current = refreshWorkspaceListsOnly;

  useWindowFileDrop((filePath) => void openExternalRef.current(filePath));

  useEffect(() => {
    void (async () => {
      const pending = await window.electronAPI?.consumePendingExternalFile?.();
      if (pending) {
        await openExternalRef.current(pending);
        if (window.electronAPI) {
          const [imgCfg, startupCfg] = await Promise.all([
            window.electronAPI.getImageBedConfig(),
            window.electronAPI.getStartupConfig(),
          ]);
          depsRef.current.setImageBed(imgCfg);
          depsRef.current.setStartupConfig(startupCfg);
        }
        return;
      }
      await depsRef.current.refreshWorkspace();
    })();
    const unsubChanged = window.electronAPI?.onWorkspaceChanged?.(() => void refreshListsRef.current());
    const unsubOpen = window.electronAPI?.onOpenExternalFile?.((p) => void openExternalRef.current(p));
    return () => {
      unsubChanged?.();
      unsubOpen?.();
    };
  }, []);

  const sidebarFileActions: SidebarExternalFileActions = {
    onImportExternalFiles: handleImportExternalFiles,
    onCopyFiles: handleCopySidebarFiles,
    onPasteFiles: handlePasteSidebarFiles,
    onOpenExternalFile: handleOpenExternalFile,
  };

  return { handleOpenExternalFile, sidebarFileActions };
}
