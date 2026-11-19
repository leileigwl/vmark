import { useEffect, useState } from 'react';
import type { ArticleMeta, EditorPreferences, ThemeId } from '@vcat/shared';
import type { FindOptions, VditorEditorHandle } from '../../components/VditorEditor';

export interface EditorWorkspaceParams {
  editorRef: React.RefObject<VditorEditorHandle | null>;
  activeArticle: ArticleMeta | null;
  articles: ArticleMeta[];
  markdown: string;
  undoFileOpRef: React.RefObject<() => Promise<void>>;
  redoFileOpRef: React.RefObject<() => Promise<void>>;
  setActiveView: (v: 'editor' | 'manager' | 'settings') => void;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSideTab: (tab: 'files' | 'outline') => void;
  setIsFullscreen: (v: boolean) => void;
  setTheme: (theme: ThemeId) => void;
  openQuickOpen: () => void;
  toggleQuickOpen: () => void;
  openPublishModal: () => void;
  handleSaveArticle: (content: string, silent?: boolean) => Promise<void>;
  handleSelectWorkspace: () => Promise<void>;
  handleCreateBlankArticle: () => Promise<void>;
  openArticle: (meta: ArticleMeta, cfg?: undefined, searchKeyword?: string) => Promise<void>;
  clearRecentArticles: () => void;
}

/** Manages editor preferences, find/replace, table insertion modal, shortcuts & desktop menu actions. */
export function useEditorWorkspace(params: EditorWorkspaceParams) {
  const {
    editorRef,
    activeArticle,
    articles,
    markdown,
    undoFileOpRef,
    redoFileOpRef,
    setActiveView,
    setSidebarOpen,
    setSideTab,
    setIsFullscreen,
    setTheme,
    openQuickOpen,
    toggleQuickOpen,
    openPublishModal,
    handleSaveArticle,
    handleSelectWorkspace,
    handleCreateBlankArticle,
    openArticle,
    clearRecentArticles,
  } = params;

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
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        toggleQuickOpen();
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
            void undoFileOpRef.current?.();
            return;
          }
          if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) {
            if (e.repeat) return;
            e.preventDefault();
            e.stopPropagation();
            void redoFileOpRef.current?.();
          }
        }
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', onGlobalKeyDown, true);
  }, []);

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

  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return;
    return window.electronAPI.onMenuAction((action, payload) => {
      if (action === 'file:new') void handleCreateBlankArticle();
      else if (action === 'file:openWorkspace') void handleSelectWorkspace();
      else if (action === 'file:save') {
        const latest = editorRef.current?.getValue() ?? markdown;
        void handleSaveArticle(latest);
      } else if (action === 'file:quickOpen') {
        openQuickOpen();
      } else if (action === 'file:openRecent' && payload) {
        const target = articles.find((a) => a.relativePath === payload);
        if (target) {
          void openArticle(target);
          setActiveView('editor');
        }
      } else if (action === 'file:clearRecent') {
        clearRecentArticles();
      } else if (action === 'file:reveal') {
        void window.electronAPI.showInFinder(activeArticle?.relativePath);
      } else if (action === 'file:export') {
        const targetFmt =
          payload === 'md' || payload === 'html' || payload === 'pdf' || payload === 'docx'
            ? payload
            : editorPrefs.defaultExportFormat;
        void handleExportArticle(targetFmt);
      } else if (action === 'publish:open') openPublishModal();
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
        if (payload === 'table') setTableModalOpen(true);
        else editorRef.current?.applyFormat(payload);
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
        if (activeEl?.closest('input, textarea')) document.execCommand('undo');
        else if (activeEl?.closest('.vditor-reset')) editorRef.current?.undo();
        else void undoFileOpRef.current?.();
      } else if (action === 'edit:redo') {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl?.closest('input, textarea')) document.execCommand('redo');
        else if (activeEl?.closest('.vditor-reset')) editorRef.current?.redo();
        else void redoFileOpRef.current?.();
      } else if (action === 'window:fullscreen') setIsFullscreen(true);
      else if (action === 'window:unfullscreen') setIsFullscreen(false);
    });
  }, [activeArticle, markdown, articles]);

  function updateEditorPrefs(next: EditorPreferences) {
    setEditorPrefs(next);
    try {
      localStorage.setItem('vcat_editor_prefs', JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function handleJumpOutline(headingText: string, idx: number) {
    setActiveView('editor');
    const normalizeHeading = (s: string) =>
      s.replace(/^[\u200b\s]*#{1,6}\s*/, '').replace(/[`*_~]/g, '').trim();
    const want = normalizeHeading(headingText);
    const headings = Array.from(
      document.querySelectorAll('.vditor-ir h1, .vditor-ir h2, .vditor-ir h3, .vditor-ir h4, .vditor-ir h5, .vditor-ir h6')
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
  }

  function handleOpenLink(href: string) {
    if (!activeArticle) return;
    void window.electronAPI?.openWorkspaceLink?.(href, activeArticle.relativePath).then((res) => {
      if (!res) return;
      if (res.ok && res.kind === 'article' && res.relativePath) {
        const match = articles.find((a) => a.relativePath === res.relativePath);
        if (match) void openArticle(match);
        return;
      }
      if (!res.ok) setMissingLinkTarget(res.target || href);
    });
  }

  return {
    editorPrefs,
    updateEditorPrefs,
    tableModalOpen,
    setTableModalOpen,
    tableCols,
    setTableCols,
    tableRows,
    setTableRows,
    findBarOpen,
    setFindBarOpen,
    findQuery,
    setFindQuery,
    findOptions,
    setFindOptions,
    findMatchIndex,
    setFindMatchIndex,
    findMatchTotal,
    setFindMatchTotal,
    replaceQuery,
    setReplaceQuery,
    replaceNotice,
    setReplaceNotice,
    missingLinkTarget,
    setMissingLinkTarget,
    handleExportArticle,
    handleJumpOutline,
    handleOpenLink,
  };
}
