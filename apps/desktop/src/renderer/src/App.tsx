import { useEffect, useMemo, useRef, useState } from 'react';
import { countWords, extractOutline } from '@vcat/core';
import type {
  ArticleMeta,
  EditorPreferences,
  GitStatusInfo,
  ImageBedConfig,
  PlatformId,
  StartupConfig,
  ThemeId,
} from '@vcat/shared';
import { ArticleManagerView } from './components/ArticleManagerView';
import { FindReplaceBar } from './components/FindReplaceBar';
import { PublishModal } from './components/PublishModal';
import { QuickOpenModal } from './components/QuickOpenModal';
import { SettingsView, type SettingCategory } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { VditorEditor, type FindOptions, type VditorEditorHandle } from './components/VditorEditor';

type MainView = 'editor' | 'manager' | 'settings';
type SideTab = 'files' | 'outline';
type FileHistoryOp =
  | {
      kind: 'create';
      relativePath: string;
      previousArticlePath?: string | null;
      content?: string;
    }
  | {
      kind: 'delete';
      items: Array<{ relativePath: string; content: string }>;
      previousArticlePath?: string | null;
    }
  | {
      kind: 'create-folder';
      folderPath: string;
    }
  | {
      kind: 'move-article';
      oldPath: string;
      newPath: string;
    }
  | {
      kind: 'move-folder';
      oldFolder: string;
      newFolder: string;
    };

const PLATFORM_LOGIN_URLS: Partial<Record<PlatformId, string>> = {
  weixin: 'https://mp.weixin.qq.com/',
  cnblogs: 'https://account.cnblogs.com/signin',
  linuxdo: 'https://linux.do/login',
  juejin: 'https://juejin.cn/',
  csdn: 'https://passport.csdn.net/login',
  zhihu: 'https://www.zhihu.com/signin',
  baijiahao: 'https://baijiahao.baidu.com/',
  weibo: 'https://weibo.com/login.php',
  bilibili: 'https://passport.bilibili.com/login',
  douyin: 'https://creator.douyin.com/',
  x: 'https://x.com/i/flow/login',
  xiaohongshu: 'https://creator.xiaohongshu.com/login',
};

export default function App() {
  const [activeView, setActiveView] = useState<MainView>('editor');
  const [sideTab, setSideTab] = useState<SideTab>('files');
  const [settingCategory, setSettingCategory] = useState<SettingCategory>('image');
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeArticle, setActiveArticle] = useState<ArticleMeta | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [readOnly, setReadOnly] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(248);
  const [dragGhostX, setDragGhostX] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<string>('已同步');
  const [startupConfig, setStartupConfig] = useState<StartupConfig>({ mode: 'last_opened' });
  const [editorPrefs, setEditorPrefs] = useState<EditorPreferences>(() => {
    try {
      const saved = localStorage.getItem('vcat_editor_prefs');
      if (saved) return JSON.parse(saved) as EditorPreferences;
    } catch {
      // ignore
    }
    return { autoPairSymbols: true, copyFormat: 'markdown', defaultExportFormat: 'pdf' };
  });
  const [tableModalOpen, setTableModalOpen] = useState<boolean>(false);
  const [tableCols, setTableCols] = useState<number>(3);
  const [tableRows, setTableRows] = useState<number>(4);
  const [fileUndoStack, setFileUndoStack] = useState<FileHistoryOp[]>([]);
  const [fileRedoStack, setFileRedoStack] = useState<FileHistoryOp[]>([]);
  const fileOpBusyRef = useRef(false);
  const [imageBed, setImageBed] = useState<ImageBedConfig>({
    strategy: 'platform_private',
    provider: 'picgo_core',
    defaultImageScale: 50,
  });
  const [imageBedTestMsg, setImageBedTestMsg] = useState<string>('');
  const [authStates, setAuthStates] = useState<Partial<Record<PlatformId, boolean>>>({});
  const [gitStatus, setGitStatus] = useState<GitStatusInfo>({ isGitRepo: false, changedFiles: 0 });
  const [gitPushLog, setGitPushLog] = useState<string>('');
  const [publishModalOpen, setPublishModalOpen] = useState<boolean>(false);
  const [quickOpenModalOpen, setQuickOpenModalOpen] = useState<boolean>(false);
  const [recentArticlePaths, setRecentArticlePaths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vcat_recent_articles');
      if (saved) return (JSON.parse(saved) as string[]).slice(0, 5);
    } catch {
      // ignore
    }
    return [];
  });

  const [findBarOpen, setFindBarOpen] = useState<boolean>(false);
  const [findQuery, setFindQuery] = useState<string>('');
  const [findOptions, setFindOptions] = useState<FindOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const [findMatchIndex, setFindMatchIndex] = useState<number>(0);
  const [findMatchTotal, setFindMatchTotal] = useState<number>(0);
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [replaceNotice, setReplaceNotice] = useState<string>('');
  const [missingLinkTarget, setMissingLinkTarget] = useState<string | null>(null);

  const [theme, setTheme] = useState<ThemeId>('apple-light');
  const [customThemeName, setCustomThemeName] = useState<string>('');
  const [loadSeq, setLoadSeq] = useState<number>(0);
  const openRequestIdRef = useRef<number>(0);
  const editorRef = useRef<VditorEditorHandle>(null);

  function showToast(errOrMsg: unknown) {
    const raw = errOrMsg instanceof Error ? errOrMsg.message : String(errOrMsg);
    const clean = raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/i, '');
    setToastMsg(clean);
    setTimeout(() => setToastMsg((prev) => (prev === clean ? null : prev)), 3200);
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-img-scale',
      String(imageBed.defaultImageScale ?? 50)
    );
  }, [imageBed.defaultImageScale]);

  useEffect(() => {
    if (!findBarOpen || !findQuery) {
      setFindMatchTotal(0);
      setFindMatchIndex(0);
      editorRef.current?.clearFindHighlights();
      return;
    }
    const runFind = () => {
      const total = editorRef.current?.findMatches(findQuery, findOptions) ?? 0;
      setFindMatchTotal(total);
      setFindMatchIndex(0);
    };
    runFind();
    const retry = setTimeout(runFind, 120);
    return () => clearTimeout(retry);
  }, [findBarOpen, findQuery, findOptions, activeArticle?.relativePath, markdown]);

  async function refreshWorkspace() {
    if (!window.electronAPI) return;
    const [wsPath, recent, list, folderList, imgCfg, startupCfg, auths, git] = await Promise.all([
      window.electronAPI.getWorkspacePath(),
      window.electronAPI.getRecentWorkspaces(),
      window.electronAPI.listArticles(),
      window.electronAPI.listFolders(),
      window.electronAPI.getImageBedConfig(),
      window.electronAPI.getStartupConfig(),
      window.electronAPI.getPlatformAuthStates(),
      window.electronAPI.getGitStatus(),
    ]);
    setWorkspacePath(wsPath);
    setRecentWorkspaces(recent);
    setArticles(list);
    setFolders(folderList);
    setImageBed(imgCfg);
    setStartupConfig(startupCfg);
    setAuthStates(auths);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        const latest = editorRef.current?.getValue() ?? markdown;
        void handleSaveArticle(latest);
      } else if (key === 'l' && e.shiftKey) {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (key === 'f' && !e.shiftKey) {
        e.preventDefault();
        setActiveView('editor');
        setFindBarOpen((v) => !v);
      } else if (key === 'n') {
        e.preventDefault();
        void handleCreateBlankArticle();
      } else if (key === ',') {
        e.preventDefault();
        setActiveView('settings');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeArticle, markdown, articles]);

  useEffect(() => {
    window.electronAPI.setRecentFiles?.(recentArticlePaths);
  }, [recentArticlePaths]);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setQuickOpenModalOpen((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        const activeEl = document.activeElement as HTMLElement | null;
        const inTextInput = Boolean(activeEl?.closest('input, textarea, .vditor-reset'));
        if (!inTextInput) {
          if (k === 'z' && !e.shiftKey) {
            if (e.repeat) return;
            e.preventDefault();
            e.stopPropagation();
            void undoFileOpRef.current();
            return;
          }
          if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) {
            if (e.repeat) return;
            e.preventDefault();
            e.stopPropagation();
            void redoFileOpRef.current();
          }
        }
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', onGlobalKeyDown, true);
  }, []);

  const undoFileOpRef = useRef<() => Promise<void>>(async () => {});
  const redoFileOpRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return;
    return window.electronAPI.onMenuAction((action, payload) => {
      if (action === 'file:new') void handleCreateBlankArticle();
      else if (action === 'file:openWorkspace') void handleSelectWorkspace();
      else if (action === 'file:save') {
        const latest = editorRef.current?.getValue() ?? markdown;
        void handleSaveArticle(latest);
      } else if (action === 'file:quickOpen') {
        setQuickOpenModalOpen(true);
      } else if (action === 'file:openRecent' && payload) {
        const target = articles.find((a) => a.relativePath === payload);
        if (target) {
          void openArticle(target);
          setActiveView('editor');
        }
      } else if (action === 'file:clearRecent') {
        setRecentArticlePaths([]);
        try {
          localStorage.removeItem('vcat_recent_articles');
        } catch {
          // ignore
        }
        window.electronAPI.setRecentFiles?.([]);
      } else if (action === 'file:reveal') {
        void window.electronAPI.showInFinder(activeArticle?.relativePath);
      } else if (action === 'file:export') {
        const targetFmt =
          payload === 'md' || payload === 'html' || payload === 'pdf' || payload === 'docx'
            ? payload
            : editorPrefs.defaultExportFormat;
        void handleExportArticle(targetFmt);
      } else if (action === 'publish:open') setPublishModalOpen(true);
      else if (action === 'view:settings') setActiveView('settings');
      else if (action === 'view:manager') setActiveView('manager');
      else if (action === 'view:editor') setActiveView('editor');
      else if (action === 'view:toggleSidebar') setSidebarOpen((v) => !v);
      else if (action === 'view:sideTab' && (payload === 'files' || payload === 'outline')) {
        setSidebarOpen(true);
        setSideTab(payload);
      } else if (action === 'theme:set' && payload) {
        setTheme(payload as ThemeId);
      } else if (action === 'editor:format' && payload) {
        setActiveView('editor');
        if (payload === 'table') {
          setTableModalOpen(true);
        } else {
          editorRef.current?.applyFormat(payload);
        }
      } else if (action === 'editor:table' && payload) {
        setActiveView('editor');
        editorRef.current?.applyTableAction(payload);
      } else if (action === 'editor:image' && payload) {
        setActiveView('editor');
        editorRef.current?.applyImageAction(payload);
      } else if (action === 'editor:find') {
        setActiveView('editor');
        setFindBarOpen(true);
      } else if (action === 'edit:undo') {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl?.closest('input, textarea')) {
          document.execCommand('undo');
        } else if (activeEl?.closest('.vditor-reset')) {
          editorRef.current?.undo();
        } else {
          void undoFileOpRef.current();
        }
      } else if (action === 'edit:redo') {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl?.closest('input, textarea')) {
          document.execCommand('redo');
        } else if (activeEl?.closest('.vditor-reset')) {
          editorRef.current?.redo();
        } else {
          void redoFileOpRef.current();
        }
      } else if (action === 'window:fullscreen') {
        setIsFullscreen(true);
      } else if (action === 'window:unfullscreen') {
        setIsFullscreen(false);
      }
    });
  }, [activeArticle, markdown, articles]);

  useEffect(() => {
    window.electronAPI.setRecentFiles?.(recentArticlePaths);
  }, [recentArticlePaths]);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setQuickOpenModalOpen((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        const activeEl = document.activeElement as HTMLElement | null;
        const inTextInput = Boolean(activeEl?.closest('input, textarea, .vditor-reset'));
        if (!inTextInput) {
          if (k === 'z' && !e.shiftKey) {
            if (e.repeat) return;
            e.preventDefault();
            e.stopPropagation();
            void undoFileOpRef.current();
            return;
          }
          if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) {
            if (e.repeat) return;
            e.preventDefault();
            e.stopPropagation();
            void redoFileOpRef.current();
          }
        }
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', onGlobalKeyDown, true);
  }, []);

  async function openArticle(meta: ArticleMeta, cfgOverride?: StartupConfig) {
    if (activeArticle?.relativePath === meta.relativePath) {
      return;
    }
    const reqId = ++openRequestIdRef.current;
    if (activeArticle && saveState === '未保存') {
      const unsaved = editorRef.current?.getValue() ?? markdown;
      if (!(activeArticle.wordCount > 20 && unsaved.trim().length === 0)) {
        // Save previous article in the background without blocking UI switch on workspace/git rescans
        void window.electronAPI.saveArticle(activeArticle.relativePath, unsaved);
      }
    }
    setActiveArticle(meta);
    const content = await window.electronAPI.readArticle(meta.relativePath);
    if (reqId !== openRequestIdRef.current) {
      return;
    }
    setMarkdown(content);
    setLoadSeq((s) => s + 1);
    setSaveState('已保存');
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
      window.electronAPI.setRecentFiles?.(next);
      return next;
    });
  }

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
    if (silent && activeArticle.wordCount > 20 && nextContent.trim().length === 0) return;
    if (!silent) setSaveState('保存中...');
    await window.electronAPI.saveArticle(activeArticle.relativePath, nextContent);
    setSaveState('已保存');
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
    if (selected) {
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
  }

  async function handleCreateBlankArticle() {
    const prevPath = activeArticle?.relativePath ?? null;
    const created = await window.electronAPI.createArticle();
    const list = await window.electronAPI.listArticles();
    setArticles(list);
    setFileUndoStack((prev) => [
      ...prev,
      { kind: 'create', relativePath: created.relativePath, previousArticlePath: prevPath },
    ]);
    setFileRedoStack([]);
    await openArticle(created);
    setActiveView('editor');
  }

  async function handleUndoFileOp() {
    if (fileOpBusyRef.current || fileUndoStack.length === 0) return;
    fileOpBusyRef.current = true;
    const op = fileUndoStack[fileUndoStack.length - 1];
    setFileUndoStack((prev) => prev.slice(0, -1));

    try {
      if (op.kind === 'create') {
        const remaining = articles.filter((a) => a.relativePath !== op.relativePath);
        setArticles(remaining);
        const restoreTarget =
          (op.previousArticlePath && remaining.find((a) => a.relativePath === op.previousArticlePath)) ||
          remaining[0] ||
          null;

        let snapshot = '';
        try {
          snapshot = await window.electronAPI.readArticle(op.relativePath);
        } catch {
          // ignore if file was already removed externally
        }

        if (activeArticle?.relativePath === op.relativePath) {
          if (restoreTarget) {
            await openArticle(restoreTarget);
          } else {
            setActiveArticle(null);
            setMarkdown('');
          }
        }

        await window.electronAPI.deleteArticle(op.relativePath);
        const list = await window.electronAPI.listArticles();
        setArticles(list);
        setFileRedoStack((prev) => [
          ...prev,
          {
            kind: 'create',
            relativePath: op.relativePath,
            previousArticlePath: op.previousArticlePath,
            content: snapshot,
          },
        ]);
      } else if (op.kind === 'delete') {
        // Restore deleted files
        let lastCreated: ArticleMeta | null = null;
        for (const item of op.items) {
          const created = await window.electronAPI.createArticle(item.relativePath);
          await window.electronAPI.saveArticle(created.relativePath, item.content);
          lastCreated = created;
        }
        const list = await window.electronAPI.listArticles();
        setArticles(list);
        if (lastCreated) {
          await openArticle(lastCreated);
          setActiveView('editor');
        }
        setFileRedoStack((prev) => [...prev, op]);
      } else if (op.kind === 'create-folder') {
        await window.electronAPI.deleteFolder?.(op.folderPath);
        setFolders(await window.electronAPI.listFolders());
        setFileRedoStack((prev) => [...prev, op]);
      } else if (op.kind === 'move-article') {
        const targetParent = op.oldPath.includes('/') ? op.oldPath.slice(0, op.oldPath.lastIndexOf('/')) : '';
        const moved = await window.electronAPI.moveArticle(op.newPath, targetParent);
        const [list, folderList] = await Promise.all([
          window.electronAPI.listArticles(),
          window.electronAPI.listFolders(),
        ]);
        setArticles(list);
        setFolders(folderList);
        if (activeArticle?.relativePath === op.newPath) setActiveArticle(moved);
        setFileRedoStack((prev) => [...prev, op]);
      } else if (op.kind === 'move-folder') {
        const targetParent = op.oldFolder.includes('/') ? op.oldFolder.slice(0, op.oldFolder.lastIndexOf('/')) : '';
        const restoredRel = await window.electronAPI.moveFolder(op.newFolder, targetParent);
        const [list, folderList] = await Promise.all([
          window.electronAPI.listArticles(),
          window.electronAPI.listFolders(),
        ]);
        setArticles(list);
        setFolders(folderList);
        if (activeArticle?.relativePath.startsWith(`${op.newFolder}/`)) {
          const match = list.find(
            (a: ArticleMeta) => a.relativePath === activeArticle.relativePath.replace(op.newFolder, restoredRel)
          );
          if (match) setActiveArticle(match);
        }
        setFileRedoStack((prev) => [...prev, op]);
      }
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
      if (op.kind === 'create') {
        const prevPath = activeArticle?.relativePath ?? op.previousArticlePath ?? null;
        const created = await window.electronAPI.createArticle(op.relativePath);
        if (op.content !== undefined) {
          await window.electronAPI.saveArticle(created.relativePath, op.content);
        }
        const list = await window.electronAPI.listArticles();
        setArticles(list);
        await openArticle(created);
        setActiveView('editor');
        setFileUndoStack((prev) => [
          ...prev,
          { kind: 'create', relativePath: created.relativePath, previousArticlePath: prevPath },
        ]);
      } else if (op.kind === 'delete') {
        const deletedSet = new Set(op.items.map((i) => i.relativePath));
        const remaining = articles.filter((a) => !deletedSet.has(a.relativePath));
        setArticles(remaining);
        for (const item of op.items) {
          await window.electronAPI.deleteArticle(item.relativePath);
        }
        const list = await window.electronAPI.listArticles();
        setArticles(list);
        if (activeArticle && deletedSet.has(activeArticle.relativePath)) {
          if (list.length > 0) await openArticle(list[0]);
          else {
            setActiveArticle(null);
            setMarkdown('');
          }
        }
        setFileUndoStack((prev) => [...prev, op]);
      } else if (op.kind === 'create-folder') {
        const createdPath = await window.electronAPI.createFolder(op.folderPath);
        setFolders(await window.electronAPI.listFolders());
        setFileUndoStack((prev) => [...prev, { kind: 'create-folder', folderPath: createdPath }]);
      } else if (op.kind === 'move-article') {
        const targetParent = op.newPath.includes('/') ? op.newPath.slice(0, op.newPath.lastIndexOf('/')) : '';
        const moved = await window.electronAPI.moveArticle(op.oldPath, targetParent);
        const [list, folderList] = await Promise.all([
          window.electronAPI.listArticles(),
          window.electronAPI.listFolders(),
        ]);
        setArticles(list);
        setFolders(folderList);
        if (activeArticle?.relativePath === op.oldPath) setActiveArticle(moved);
        setFileUndoStack((prev) => [...prev, op]);
      } else if (op.kind === 'move-folder') {
        const targetParent = op.newFolder.includes('/') ? op.newFolder.slice(0, op.newFolder.lastIndexOf('/')) : '';
        const movedRel = await window.electronAPI.moveFolder(op.oldFolder, targetParent);
        const [list, folderList] = await Promise.all([
          window.electronAPI.listArticles(),
          window.electronAPI.listFolders(),
        ]);
        setArticles(list);
        setFolders(folderList);
        if (activeArticle?.relativePath.startsWith(`${op.oldFolder}/`)) {
          const match = list.find(
            (a: ArticleMeta) => a.relativePath === activeArticle.relativePath.replace(op.oldFolder, movedRel)
          );
          if (match) setActiveArticle(match);
        }
        setFileUndoStack((prev) => [...prev, op]);
      }
    } catch (err) {
      showToast(err);
    } finally {
      fileOpBusyRef.current = false;
    }
  }

  undoFileOpRef.current = handleUndoFileOp;
  redoFileOpRef.current = handleRedoFileOp;

  async function handleExportArticle(format: 'md' | 'html' | 'pdf' | 'docx') {
    if (!activeArticle) return;
    const latestMd = editorRef.current?.getValue() ?? markdown;
    const htmlContent = editorRef.current?.getHTML() ?? '';
    await window.electronAPI.exportArticle({
      format,
      title: activeArticle.title || activeArticle.relativePath.replace(/\.md$/i, ''),
      markdown: latestMd,
      htmlContent,
    });
  }

  async function handleImportTyporaTheme() {
    const res = await window.electronAPI.importTyporaThemeCss();
    if (!res) return;
    const scopedCss = res.css
      .replace(/#write\b/g, '.vditor-ir pre.vditor-reset')
      .replace(/body\b/g, '.vcat-custom-theme-active');
    let styleEl = document.getElementById('vcat-custom-typora-theme') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'vcat-custom-typora-theme';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = scopedCss;
    setCustomThemeName(res.name);
    setTheme('custom-typora');
  }

  function startSidebarResize(e: React.MouseEvent) {
    e.preventDefault();
    let latestWidth = sidebarWidth;
    setDragGhostX(Math.min(420, Math.max(200, e.clientX)));
    const onMove = (ev: MouseEvent) => {
      const clamped = Math.min(420, Math.max(200, ev.clientX));
      latestWidth = clamped;
      setDragGhostX(clamped);
    };
    const onUp = () => {
      setSidebarWidth(latestWidth);
      setDragGhostX(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const outlineNodes = useMemo(() => extractOutline(markdown), [markdown]);
  const liveWordCount = useMemo(() => countWords(markdown), [markdown]);
  const totalLocalImages = useMemo(
    () => articles.reduce((sum, item) => sum + item.localImageCount, 0),
    [articles]
  );
  const workspaceName = workspacePath ? workspacePath.split('/').pop() || workspacePath : '未挂载目录';

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)]">
      {dragGhostX !== null && (
        <div
          style={{ left: `${dragGhostX}px` }}
          className="pointer-events-none fixed top-0 bottom-0 z-50 w-[2px] border-r border-dashed border-[#007aff] bg-[#007aff]/35 shadow-[0_0_8px_rgba(0,122,255,0.45)]"
        />
      )}

      {toastMsg && (
        <div className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border-color)] bg-[#1d1d1f]/92 px-5 py-3 text-center text-[13px] text-white shadow-2xl backdrop-blur-md">
          {toastMsg}
        </div>
      )}

      <Sidebar
        open={sidebarOpen}
        width={sidebarWidth}
        isResizing={dragGhostX !== null}
        sideTab={sideTab}
        workspaceName={workspaceName}
        workspacePath={workspacePath}
        recentWorkspaces={recentWorkspaces}
        articles={articles}
        folders={folders}
        activeArticle={activeArticle}
        outlineNodes={outlineNodes}
        onChangeSideTab={setSideTab}
        onStartResize={startSidebarResize}
        onOpenArticle={(art) => {
          void openArticle(art);
          setActiveView('editor');
        }}
        onCreateFile={async (raw, parentDir) => {
          const fileName = raw.includes('.') ? raw : `${raw}.md`;
          const relPath = parentDir ? `${parentDir}/${fileName}` : fileName;
          const prevPath = activeArticle?.relativePath ?? null;
          const created = await window.electronAPI.createArticle(relPath);
          const list = await window.electronAPI.listArticles();
          setArticles(list);
          setFileUndoStack((prev) => [
            ...prev,
            { kind: 'create', relativePath: created.relativePath, previousArticlePath: prevPath },
          ]);
          setFileRedoStack([]);
          await openArticle(created);
          setActiveView('editor');
        }}
        canUndoFileOp={fileUndoStack.length > 0}
        canRedoFileOp={fileRedoStack.length > 0}
        onUndoFileOp={handleUndoFileOp}
        onRedoFileOp={handleRedoFileOp}
        onCreateFolder={async (rel) => {
          const createdPath = await window.electronAPI.createFolder(rel);
          setFolders(await window.electronAPI.listFolders());
          setFileUndoStack((prev) => [...prev, { kind: 'create-folder', folderPath: createdPath }]);
          setFileRedoStack([]);
        }}
        onRenameArticle={async (oldPath, newName) => {
          try {
            const updated = await window.electronAPI.renameArticle(oldPath, newName);
            setArticles(await window.electronAPI.listArticles());
            if (activeArticle?.relativePath === oldPath) setActiveArticle(updated);
          } catch (err) {
            showToast(err);
          }
        }}
        onDeleteArticle={async (art) => {
          if (!window.confirm(`确定要将「${art.relativePath}」移到废纸篓吗？`)) return;
          const prevPath = activeArticle?.relativePath ?? null;
          let content = '';
          try {
            content = await window.electronAPI.readArticle(art.relativePath);
          } catch {
            // ignore
          }
          await window.electronAPI.deleteArticle(art.relativePath);
          const list = await window.electronAPI.listArticles();
          setArticles(list);
          setFileUndoStack((prev) => [
            ...prev,
            { kind: 'delete', items: [{ relativePath: art.relativePath, content }], previousArticlePath: prevPath },
          ]);
          setFileRedoStack([]);
          if (activeArticle?.relativePath === art.relativePath) {
            if (list.length > 0) await openArticle(list[0]);
            else {
              setActiveArticle(null);
              setMarkdown('');
            }
          }
        }}
        onBatchDeleteArticles={async (targets) => {
          if (targets.length === 0) return;
          if (!window.confirm(`确定要将选中的 ${targets.length} 篇文章移到废纸篓吗？`)) return;
          const prevPath = activeArticle?.relativePath ?? null;
          const items: Array<{ relativePath: string; content: string }> = [];
          for (const t of targets) {
            let content = '';
            try {
              content = await window.electronAPI.readArticle(t.relativePath);
            } catch {
              // ignore
            }
            items.push({ relativePath: t.relativePath, content });
          }
          const deletedSet = new Set(targets.map((t) => t.relativePath));
          for (const t of targets) {
            await window.electronAPI.deleteArticle(t.relativePath);
          }
          const list = await window.electronAPI.listArticles();
          setArticles(list);
          setFileUndoStack((prev) => [
            ...prev,
            { kind: 'delete', items, previousArticlePath: prevPath },
          ]);
          setFileRedoStack([]);
          if (activeArticle && deletedSet.has(activeArticle.relativePath)) {
            if (list.length > 0) await openArticle(list[0]);
            else {
              setActiveArticle(null);
              setMarkdown('');
            }
          }
        }}
        onDuplicateArticle={async (art) => {
          const dup = await window.electronAPI.duplicateArticle(art.relativePath);
          setArticles(await window.electronAPI.listArticles());
          await openArticle(dup);
          setActiveView('editor');
        }}
        onMoveArticle={async (oldPath, targetFolder) => {
          try {
            const moved = await window.electronAPI.moveArticle(oldPath, targetFolder);
            const [list, folderList] = await Promise.all([
              window.electronAPI.listArticles(),
              window.electronAPI.listFolders(),
            ]);
            setArticles(list);
            setFolders(folderList);
            if (activeArticle?.relativePath === oldPath) setActiveArticle(moved);
            if (moved.relativePath !== oldPath) {
              setFileUndoStack((prev) => [...prev, { kind: 'move-article', oldPath, newPath: moved.relativePath }]);
              setFileRedoStack([]);
            }
          } catch (err) {
            showToast(err);
          }
        }}
        onMoveFolder={async (oldFolder, targetParent) => {
          try {
            const newRel = await window.electronAPI.moveFolder(oldFolder, targetParent);
            const [list, folderList] = await Promise.all([
              window.electronAPI.listArticles(),
              window.electronAPI.listFolders(),
            ]);
            setArticles(list);
            setFolders(folderList);
            if (activeArticle?.relativePath.startsWith(`${oldFolder}/`)) {
              const match = list.find((a: ArticleMeta) => a.relativePath === activeArticle.relativePath.replace(oldFolder, newRel));
              if (match) setActiveArticle(match);
            }
            if (newRel !== oldFolder) {
              setFileUndoStack((prev) => [...prev, { kind: 'move-folder', oldFolder, newFolder: newRel }]);
              setFileRedoStack([]);
            }
          } catch (err) {
            showToast(err);
          }
        }}
        onSelectWorkspace={handleSelectWorkspace}
        onSwitchRecentWorkspace={async (dir) => {
          const switched = await window.electronAPI.switchWorkspace(dir);
          if (switched) {
            setActiveArticle(null);
            await refreshWorkspace();
          }
        }}
        onRefreshWorkspace={refreshWorkspace}
        onJumpOutline={(headingText, idx) => {
          setActiveView('editor');
          const normalizeHeading = (s: string) =>
            s
              .replace(/^[\u200b\s]*#{1,6}\s*/, '')
              .replace(/[`*_~]/g, '')
              .trim();
          const want = normalizeHeading(headingText);
          const headings = Array.from(
            document.querySelectorAll(
              '.vditor-ir h1, .vditor-ir h2, .vditor-ir h3, .vditor-ir h4, .vditor-ir h5, .vditor-ir h6'
            )
          ) as HTMLElement[];
          const target =
            headings.find((h) => normalizeHeading(h.textContent || '') === want) ??
            headings.find((h) => normalizeHeading(h.textContent || '').includes(want)) ??
            headings[idx];
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target.style.transition = 'background-color 0.35s ease';
            target.style.backgroundColor = 'color-mix(in srgb, var(--accent) 16%, transparent)';
            target.style.borderRadius = '6px';
            setTimeout(() => {
              target.style.backgroundColor = '';
            }, 900);
          }
        }}
      />

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)]">
        <TopBar
          activeView={activeView}
          sidebarOpen={sidebarOpen}
          isFullscreen={isFullscreen}
          readOnly={readOnly}
          activeArticle={activeArticle}
          liveWordCount={liveWordCount}
          saveState={saveState}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleReadOnly={() => setReadOnly((v) => !v)}
          onOpenQuickOpen={() => setQuickOpenModalOpen(true)}
          onSetActiveView={setActiveView}
          onOpenPublishModal={() => setPublishModalOpen(true)}
        />

        <main className="flex flex-1 overflow-hidden">
          <section
            className={
              activeView === 'editor'
                ? 'relative flex-1 overflow-hidden bg-[var(--bg-main)]'
                : 'hidden'
            }
          >
            {findBarOpen && (
              <FindReplaceBar
                findQuery={findQuery}
                replaceQuery={replaceQuery}
                matchIndex={findMatchIndex}
                matchTotal={findMatchTotal}
                replaceNotice={replaceNotice}
                findOptions={findOptions}
                onChangeFindQuery={(q) => {
                  setFindQuery(q);
                  setReplaceNotice('');
                }}
                onChangeReplaceQuery={setReplaceQuery}
                onChangeOptions={setFindOptions}
                onPrev={() => {
                  if (!findQuery || findMatchTotal === 0) return;
                  const prevIdx = (findMatchIndex - 1 + findMatchTotal) % findMatchTotal;
                  setFindMatchIndex(prevIdx);
                  editorRef.current?.jumpToMatch(findQuery, prevIdx, findOptions);
                }}
                onNext={() => {
                  if (!findQuery || findMatchTotal === 0) return;
                  const nextIdx = (findMatchIndex + 1) % findMatchTotal;
                  setFindMatchIndex(nextIdx);
                  editorRef.current?.jumpToMatch(findQuery, nextIdx, findOptions);
                }}
                onReplaceAll={() => {
                  const count = editorRef.current?.replaceAllText(findQuery, replaceQuery, findOptions) ?? 0;
                  setReplaceNotice(`已替换 ${count} 处`);
                  setFindMatchTotal(0);
                  setFindMatchIndex(0);
                }}
                onClose={() => {
                  editorRef.current?.clearFindHighlights();
                  setFindBarOpen(false);
                }}
              />
            )}

            {missingLinkTarget && (
              <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--side-bar-bg-color)] px-4 py-1.5 text-[12px] text-[var(--text-main)] shadow-2xs">
                <span className="truncate">无法打开「{missingLinkTarget}」，未在工作区找到该文件</span>
                <button
                  type="button"
                  onClick={() => setMissingLinkTarget(null)}
                  className="ml-3 shrink-0 rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-0.5 text-[11px] text-[var(--control-text-color)] hover:text-[var(--text-main)]"
                >
                  关闭
                </button>
              </div>
            )}

            {activeArticle ? (
              <VditorEditor
                ref={editorRef}
                articleKey={activeArticle.relativePath}
                loadSeq={loadSeq}
                readOnly={readOnly}
                value={markdown}
                preferences={editorPrefs}
                onChange={(md) => {
                  setMarkdown(md);
                  setSaveState('未保存');
                }}
                onSave={(md) => void handleSaveArticle(md)}
                onOpenLink={(href) => {
                  void window.electronAPI?.openWorkspaceLink?.(href, activeArticle.relativePath).then((res) => {
                    if (!res) return;
                    if (res.ok && res.kind === 'article' && res.relativePath) {
                      const match = articles.find((a) => a.relativePath === res.relativePath);
                      if (match) void openArticle(match);
                      return;
                    }
                    if (!res.ok) {
                      setMissingLinkTarget(res.target || href);
                    }
                  });
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[var(--control-text-color)]">
                <p>当前工作区暂无文章</p>
                <button
                  type="button"
                  onClick={() => void handleCreateBlankArticle()}
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-white"
                >
                  + 新建空白文章
                </button>
              </div>
            )}
          </section>

          {activeView === 'manager' && (
            <ArticleManagerView
              workspacePath={workspacePath}
              gitStatus={gitStatus}
              articles={articles}
              totalLocalImages={totalLocalImages}
              onSelectWorkspace={() => void handleSelectWorkspace()}
              onCreateArticle={() => void handleCreateBlankArticle()}
              onOpenArticle={(art) => {
                void openArticle(art);
                setActiveView('editor');
              }}
              onPublishArticle={(art) => {
                void openArticle(art);
                setPublishModalOpen(true);
              }}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              settingCategory={settingCategory}
              onSelectCategory={setSettingCategory}
              startupConfig={startupConfig}
              onSaveStartupConfig={(next) => {
                setStartupConfig(next);
                void window.electronAPI.saveStartupConfig(next);
              }}
              editorPrefs={editorPrefs}
              onUpdateEditorPrefs={(next) => {
                setEditorPrefs(next);
                try {
                  localStorage.setItem('vcat_editor_prefs', JSON.stringify(next));
                } catch {
                  // ignore
                }
              }}
              onExportArticle={(fmt) => void handleExportArticle(fmt)}
              onPickSpecificDir={async () => {
                const selected = await window.electronAPI.selectWorkspace();
                if (selected) {
                  setWorkspacePath(selected);
                  const next = { ...startupConfig, defaultDir: selected };
                  setStartupConfig(next);
                  void window.electronAPI.saveStartupConfig(next);
                  await refreshWorkspace();
                }
              }}
              imageBed={imageBed}
              imageBedTestMsg={imageBedTestMsg}
              onUpdateImageBed={(next, persist) => {
                setImageBed(next);
                if (persist) {
                  void window.electronAPI.saveImageBedConfig(next).then(() => {
                    setImageBedTestMsg('配置已保存');
                  });
                }
              }}
              onTestImageBed={async () => {
                await window.electronAPI.saveImageBedConfig(imageBed);
                const res = await window.electronAPI.testImageBedUpload(imageBed);
                setImageBedTestMsg(res.message);
              }}
              theme={theme}
              customThemeName={customThemeName}
              onSelectTheme={setTheme}
              onImportTyporaTheme={() => void handleImportTyporaTheme()}
              authStates={authStates}
              onPlatformLogin={async (pid) => {
                const url = PLATFORM_LOGIN_URLS[pid] ?? 'https://www.cnblogs.com';
                const ok = await window.electronAPI.openPlatformLogin(pid, url);
                setAuthStates((prev) => ({ ...prev, [pid]: ok }));
              }}
              workspacePath={workspacePath}
              gitStatus={gitStatus}
              gitPushLog={gitPushLog}
              onGitPush={async () => {
                setGitPushLog('正在执行 git add / commit / push...');
                const title = activeArticle?.title || 'update';
                const res = await window.electronAPI.pushGitWorkspace(`post: ${title}`);
                setGitPushLog(res.message);
                setGitStatus(await window.electronAPI.getGitStatus());
              }}
            />
          )}
        </main>
      </div>

      {publishModalOpen && (
        <PublishModal
          activeArticle={activeArticle}
          gitStatus={gitStatus}
          gitPushLog={gitPushLog}
          markdown={markdown}
          onClose={() => setPublishModalOpen(false)}
          onGitPush={async () => {
            setGitPushLog('正在执行 git add / commit / push...');
            const title = activeArticle?.title || 'update';
            const res = await window.electronAPI.pushGitWorkspace(`post: ${title}`);
            setGitPushLog(res.message);
            setGitStatus(await window.electronAPI.getGitStatus());
          }}
          onSaveArticle={(content) => void handleSaveArticle(content)}
        />
      )}

      {tableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-xs">
          <div className="w-[320px] rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] p-4 text-[var(--text-main)] shadow-2xl">
            <div className="mb-3 text-center text-sm font-semibold">插入表格</div>
            <div className="mb-4 flex items-center justify-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--control-text-color)]">列</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={tableCols}
                  onChange={(e) => setTableCols(Number(e.target.value) || 1)}
                  className="w-16 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2 py-1 text-center outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--control-text-color)]">行</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={tableRows}
                  onChange={(e) => setTableRows(Number(e.target.value) || 1)}
                  className="w-16 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2 py-1 text-center outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border-color)] pt-3 text-xs">
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1 hover:bg-[var(--bg-hover)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setTableModalOpen(false);
                  editorRef.current?.insertTableWithSize(tableCols, tableRows);
                }}
                className="rounded bg-[var(--accent)] px-3 py-1 font-medium text-white hover:opacity-90"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
      <QuickOpenModal
        open={quickOpenModalOpen}
        articles={articles}
        recentArticlePaths={recentArticlePaths}
        activeArticlePath={activeArticle?.relativePath ?? null}
        onClose={() => setQuickOpenModalOpen(false)}
        onSelectArticle={(art) => {
          void openArticle(art);
          setActiveView('editor');
        }}
        onSelectWorkspace={() => void handleSelectWorkspace()}
        onClearRecent={() => {
          setRecentArticlePaths([]);
          try {
            localStorage.removeItem('vcat_recent_articles');
          } catch {
            // ignore
          }
          window.electronAPI.setRecentFiles?.([]);
        }}
      />
    </div>
  );
}
