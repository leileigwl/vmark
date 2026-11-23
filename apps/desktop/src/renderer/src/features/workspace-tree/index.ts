import { useEffect, useMemo, useRef, useState } from 'react';
import { countWords, extractOutline } from '@vcat/core';
import type {
  ArticleMeta,
  GitStatusInfo,
  ImageBedConfig,
  PlatformId,
  StartupConfig,
} from '@vcat/shared';
import type { VditorEditorHandle } from '../../components/VditorEditor';
import {
  createArticleAndOpen,
  deleteArticlesWithUndo,
  deleteFolderSingle,
  deleteItemsBatch,
  moveArticleWithUndo,
  moveFolderWithUndo,
  type ArticleOpsCtx,
} from './articleOps';
import { executeRedoOp, executeUndoOp, type FileHistoryOp } from './fileHistory';
import { useSaveBaseline } from './saveBaseline';

export type { FileHistoryOp };

export interface WorkspaceTreeParams {
  editorRef: React.RefObject<VditorEditorHandle | null>;
  startupConfig: StartupConfig;
  setStartupConfig: (cfg: StartupConfig) => void;
  setImageBed: (cfg: ImageBedConfig) => void;
  setActiveViewEditor: () => void;
  showToast: (errOrMsg: unknown) => void;
}

/** Manages workspace tree, active article content, file undo/redo history, recent files & Git status. */
export function useWorkspaceTree(params: WorkspaceTreeParams) {
  const {
    editorRef,
    startupConfig,
    setStartupConfig,
    setImageBed,
    setActiveViewEditor,
    showToast,
  } = params;

  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeArticle, setActiveArticle] = useState<ArticleMeta | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [saveState, setSaveState] = useState<string>('已同步');
  const [gitStatus, setGitStatus] = useState<GitStatusInfo>({ isGitRepo: false, changedFiles: 0 });
  const [gitPushLog, setGitPushLog] = useState<string>('');
  const [fileUndoStack, setFileUndoStack] = useState<FileHistoryOp[]>([]);
  const [fileRedoStack, setFileRedoStack] = useState<FileHistoryOp[]>([]);
  const [loadSeq, setLoadSeq] = useState<number>(0);
  const [recentArticlePaths, setRecentArticlePaths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vcat_recent_articles');
      if (saved) return (JSON.parse(saved) as string[]).slice(0, 5);
    } catch {
      // ignore
    }
    return [];
  });

  const fileOpBusyRef = useRef(false);
  const openRequestIdRef = useRef(0);
  /** True while openArticle awaits readArticle: the editor still shows the previous article. */
  const loadingArticleRef = useRef(false);
  /** Content last read from or written to disk for the article in the editor. */
  const persistedContentRef = useRef<string | null>(null);
  const baseline = useSaveBaseline(editorRef, loadSeq);
  const undoFileOpRef = useRef<() => Promise<void>>(async () => {});
  const redoFileOpRef = useRef<() => Promise<void>>(async () => {});

  function clearRecentArticles() {
    setRecentArticlePaths([]);
    try {
      localStorage.removeItem('vcat_recent_articles');
    } catch {
      // ignore
    }
    window.electronAPI?.setRecentFiles?.([]);
  }

  async function openArticle(meta: ArticleMeta, cfgOverride?: StartupConfig, searchKeyword?: string) {
    const tryJumpToSearch = (keyword: string) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        const count = editorRef.current?.jumpToMatch(keyword, 0, { caseSensitive: false }) ?? 0;
        if (count > 0 || attempts >= 25) {
          clearInterval(timer);
          if (count > 0) {
            setTimeout(() => {
              editorRef.current?.jumpToMatch(keyword, 0, { caseSensitive: false });
            }, 120);
          }
        }
      }, 60);
    };

    if (activeArticle?.relativePath === meta.relativePath) {
      if (searchKeyword) tryJumpToSearch(searchKeyword);
      return;
    }
    const reqId = ++openRequestIdRef.current;
    flushActiveArticle();
    loadingArticleRef.current = true;
    setSaveState('已保存');
    setActiveArticle(meta);
    const content = await window.electronAPI.readArticle(meta.relativePath);
    if (reqId !== openRequestIdRef.current) return;

    loadingArticleRef.current = false;
    persistedContentRef.current = content;
    setMarkdown(content);
    setLoadSeq((s) => s + 1);
    setSaveState('已保存');
    if (searchKeyword) tryJumpToSearch(searchKeyword);

    const nextStartup = { ...(cfgOverride ?? startupConfig), lastArticlePath: meta.relativePath };
    setStartupConfig(nextStartup);
    void window.electronAPI.saveStartupConfig(nextStartup);
    setRecentArticlePaths((prev) => {
      const next = [meta.relativePath, ...prev.filter((p) => p !== meta.relativePath)].slice(0, 5);
      try {
        localStorage.setItem('vcat_recent_articles', JSON.stringify(next));
      } catch {
        // ignore
      }
      window.electronAPI?.setRecentFiles?.(next);
      return next;
    });
  }

  /**
   * Writes the editor's current text to the active article when it differs from what is on
   * disk. Reads the editor directly, so input still inside the 320ms change debounce (and
   * input while the state already says 已保存) is not lost when switching articles.
   */
  function flushActiveArticle() {
    if (!activeArticle || loadingArticleRef.current) return;
    const current = editorRef.current?.getValue();
    if (current === undefined) return;
    if (activeArticle.wordCount > 20 && current.trim().length === 0) return;
    const next = baseline.contentForDisk(persistedContentRef.current, current);
    if (next === persistedContentRef.current) return;
    persistedContentRef.current = next;
    void window.electronAPI.saveArticle(activeArticle.relativePath, next);
  }

  async function refreshWorkspace() {
    if (!window.electronAPI) return;
    const [wsPath, recent, list, folderList, imgCfg, startupCfg, git] = await Promise.all([
      window.electronAPI.getWorkspacePath(),
      window.electronAPI.getRecentWorkspaces(),
      window.electronAPI.listArticles(),
      window.electronAPI.listFolders(),
      window.electronAPI.getImageBedConfig(),
      window.electronAPI.getStartupConfig(),
      window.electronAPI.getGitStatus(),
    ]);
    setWorkspacePath(wsPath);
    setRecentWorkspaces(recent);
    setArticles(list);
    setFolders(folderList);
    setImageBed(imgCfg);
    setStartupConfig(startupCfg);
    setGitStatus(git);
    if (!activeArticle) {
      if (startupCfg.mode === 'new_file' && wsPath) {
        const created = await window.electronAPI.createArticle();
        setArticles(await window.electronAPI.listArticles());
        await openArticle(created, startupCfg);
      } else if (list.length > 0) {
        const target =
          startupCfg.mode === 'last_opened' && startupCfg.lastArticlePath
            ? list.find((a) => a.relativePath === startupCfg.lastArticlePath) ?? list[0]
            : list[0];
        await openArticle(target, startupCfg);
      }
    }
  }

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    window.electronAPI?.setRecentFiles?.(recentArticlePaths);
  }, [recentArticlePaths]);

  useEffect(() => {
    if (saveState !== '未保存' || !activeArticle) return;
    const timer = setTimeout(() => {
      const latest = editorRef.current?.getValue() ?? markdown;
      void handleSaveArticle(latest, true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [markdown, saveState, activeArticle?.relativePath]);

  async function handleSaveArticle(nextContent: string, silent = false) {
    if (!activeArticle) return;
    // While the next article is loading the editor still holds the previous one's text.
    if (loadingArticleRef.current) return;
    if (silent && activeArticle.wordCount > 20 && nextContent.trim().length === 0) return;
    if (!silent) setSaveState('保存中...');
    const reqId = openRequestIdRef.current;
    const toWrite = baseline.contentForDisk(persistedContentRef.current, nextContent);
    await window.electronAPI.saveArticle(activeArticle.relativePath, toWrite);
    if (reqId !== openRequestIdRef.current) return;
    persistedContentRef.current = toWrite;
    baseline.markSaved(nextContent);
    // Input typed while the save was in flight must stay 未保存, or it is never saved.
    const latest = editorRef.current?.getValue();
    setSaveState(latest === undefined || latest === nextContent ? '已保存' : '未保存');
    if (silent) return;
    const [list, git] = await Promise.all([
      window.electronAPI.listArticles(),
      window.electronAPI.getGitStatus(),
    ]);
    setArticles(list);
    setGitStatus(git);
  }

  async function handleSelectWorkspace() {
    const selected = await window.electronAPI.selectWorkspace();
    if (!selected) return;
    setWorkspacePath(selected);
    const [list, folderList, git] = await Promise.all([
      window.electronAPI.listArticles(),
      window.electronAPI.listFolders(),
      window.electronAPI.getGitStatus(),
    ]);
    setArticles(list);
    setFolders(folderList);
    setGitStatus(git);
    if (list.length > 0) await openArticle(list[0]);
    else {
      setActiveArticle(null);
      setMarkdown('');
    }
  }

  async function switchRecentWorkspace(dir: string) {
    const switched = await window.electronAPI.switchWorkspace(dir);
    if (switched) {
      setActiveArticle(null);
      await refreshWorkspace();
    }
  }

  async function pickSpecificDir() {
    const selected = await window.electronAPI.selectWorkspace();
    if (!selected) return;
    setWorkspacePath(selected);
    const next = { ...startupConfig, defaultDir: selected };
    setStartupConfig(next);
    void window.electronAPI.saveStartupConfig(next);
    await refreshWorkspace();
  }

  const opsCtx: ArticleOpsCtx = {
    activeArticle,
    setArticles,
    setFolders,
    setActiveArticle,
    setMarkdown,
    pushUndo: (op) => {
      setFileUndoStack((prev) => [...prev, op]);
      setFileRedoStack([]);
    },
    openArticle,
    setActiveViewEditor,
    showToast,
  };

  async function handleCreateBlankArticle() {
    await createArticleAndOpen(opsCtx);
  }

  async function handleCreateFile(raw: string, parentDir?: string) {
    const fileName = raw.includes('.') ? raw : `${raw}.md`;
    await createArticleAndOpen(opsCtx, parentDir ? `${parentDir}/${fileName}` : fileName);
  }

  async function handleCreateFolder(rel: string) {
    const createdPath = await window.electronAPI.createFolder(rel);
    setFolders(await window.electronAPI.listFolders());
    opsCtx.pushUndo({ kind: 'create-folder', folderPath: createdPath });
  }

  async function handleRenameArticle(oldPath: string, newName: string) {
    try {
      const updated = await window.electronAPI.renameArticle(oldPath, newName);
      setArticles(await window.electronAPI.listArticles());
      if (activeArticle?.relativePath === oldPath) setActiveArticle(updated);
    } catch (err) {
      showToast(err);
    }
  }

  const handleDeleteArticle = (art: ArticleMeta) =>
    deleteArticlesWithUndo(opsCtx, [art], `确定要将「${art.relativePath}」移到废纸篓吗？`);

  const handleBatchDeleteArticles = (targets: ArticleMeta[]) =>
    deleteArticlesWithUndo(opsCtx, targets, `确定要将选中的 ${targets.length} 篇文章移到废纸篓吗？`);

  const handleDeleteFolder = (folderPath: string) => deleteFolderSingle(opsCtx, folderPath);

  const handleBatchDeleteItems = (targetArticles: ArticleMeta[], targetFolders: string[]) =>
    deleteItemsBatch(opsCtx, targetArticles, targetFolders);

  async function handleDuplicateArticle(art: ArticleMeta) {
    const dup = await window.electronAPI.duplicateArticle(art.relativePath);
    setArticles(await window.electronAPI.listArticles());
    await openArticle(dup);
    setActiveViewEditor();
  }

  const handleMoveArticle = (oldPath: string, targetFolder: string) =>
    moveArticleWithUndo(opsCtx, oldPath, targetFolder);

  const handleMoveFolder = (oldFolder: string, targetParent: string) =>
    moveFolderWithUndo(opsCtx, oldFolder, targetParent);

  const runtime = {
    articles,
    activeArticle,
    setArticles,
    setFolders,
    setActiveArticle,
    setMarkdown,
    setActiveViewEditor,
    openArticle,
  };

  async function handleUndoFileOp() {
    if (fileOpBusyRef.current || fileUndoStack.length === 0) return;
    fileOpBusyRef.current = true;
    const op = fileUndoStack[fileUndoStack.length - 1];
    setFileUndoStack((prev) => prev.slice(0, -1));
    try {
      const redoEntry = await executeUndoOp(op, runtime);
      setFileRedoStack((prev) => [...prev, redoEntry]);
    } catch (err) {
      showToast(err);
    } finally {
      fileOpBusyRef.current = false;
    }
  }

  async function handleRedoFileOp() {
    if (fileOpBusyRef.current || fileRedoStack.length === 0) return;
    fileOpBusyRef.current = true;
    const op = fileRedoStack[fileRedoStack.length - 1];
    setFileRedoStack((prev) => prev.slice(0, -1));
    try {
      const undoEntry = await executeRedoOp(op, runtime);
      setFileUndoStack((prev) => [...prev, undoEntry]);
    } catch (err) {
      showToast(err);
    } finally {
      fileOpBusyRef.current = false;
    }
  }

  undoFileOpRef.current = handleUndoFileOp;
  redoFileOpRef.current = handleRedoFileOp;

  async function handleGitPush() {
    setGitPushLog('正在执行 git add / commit / push...');
    const title = activeArticle?.title || 'update';
    const res = await window.electronAPI.pushGitWorkspace(`post: ${title}`);
    setGitPushLog(res.message);
    setGitStatus(await window.electronAPI.getGitStatus());
  }

  const outlineNodes = useMemo(() => extractOutline(markdown), [markdown]);
  const liveWordCount = useMemo(() => countWords(markdown), [markdown]);
  const totalLocalImages = useMemo(
    () => articles.reduce((sum, item) => sum + item.localImageCount, 0),
    [articles]
  );
  const workspaceName = workspacePath ? workspacePath.split('/').pop() || workspacePath : '未挂载目录';

  return {
    workspacePath,
    recentWorkspaces,
    articles,
    folders,
    activeArticle,
    markdown,
    setMarkdown,
    saveState,
    setSaveState,
    gitStatus,
    gitPushLog,
    fileUndoStack,
    fileRedoStack,
    undoFileOpRef,
    redoFileOpRef,
    loadSeq,
    recentArticlePaths,
    clearRecentArticles,
    outlineNodes,
    liveWordCount,
    totalLocalImages,
    workspaceName,
    refreshWorkspace,
    openArticle,
    handleSaveArticle,
    handleSelectWorkspace,
    switchRecentWorkspace,
    pickSpecificDir,
    handleCreateBlankArticle,
    handleCreateFile,
    handleCreateFolder,
    handleRenameArticle,
    handleDeleteArticle,
    handleBatchDeleteArticles,
    handleDeleteFolder,
    handleBatchDeleteItems,
    handleDuplicateArticle,
    handleMoveArticle,
    handleMoveFolder,
    handleUndoFileOp,
    handleRedoFileOp,
    handleGitPush,
  };
}
