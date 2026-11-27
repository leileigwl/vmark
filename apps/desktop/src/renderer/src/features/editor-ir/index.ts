import { useEffect, useState } from 'react';
import type { ArticleMeta, EditorPreferences, ThemeId } from '@vcat/shared';
import type { FindOptions, VditorEditorHandle } from '../../components/VditorEditor';
import {
  createAcceleratorEchoFilter,
  createOnceGate,
  installKeystrokeTracker,
  isModalOpen,
  resolveUndoTarget,
  shouldBlockEditorCommand,
  wasKeystrokeConsumed,
} from './shortcutGuards';

/** Menu actions whose accelerator is also handled by the renderer keydown listener. */
const MENU_KEY_ECHO: Record<string, true> = {
  'file:save': true,
  'file:new': true,
  'editor:find': true,
  'view:settings': true,
  'view:toggleSidebar': true,
};
const runOnce = createOnceGate(300);
const acceleratorEcho = createAcceleratorEchoFilter();

/** Edit ▸ Undo/Redo menu: acts only on what has focus; file ops only from the sidebar file tree. */
function runMenuUndo(
  isUndo: boolean,
  editor: VditorEditorHandle | null,
  undoFileOp: (() => Promise<void>) | null,
  redoFileOp: (() => Promise<void>) | null
): void {
  const target = resolveUndoTarget();
  if (target === 'native-field') {
    document.execCommand(isUndo ? 'undo' : 'redo');
    return;
  }
  const consumed = isUndo
    ? wasKeystrokeConsumed('z', { shift: false })
    : wasKeystrokeConsumed('z', { shift: true }) || wasKeystrokeConsumed('y');
  if (consumed) return; // the focused owner already handled this exact keystroke
  if (target === 'editor') {
    if (isUndo) editor?.undo();
    else editor?.redo();
  } else if (target === 'file-tree') void (isUndo ? undoFileOp?.() : redoFileOp?.());
}

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
  handleOpenExternalFile?: () => Promise<void>;
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
    handleOpenExternalFile,
    handleCreateBlankArticle,
    openArticle,
    clearRecentArticles,
  } = params;
  installKeystrokeTracker();

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
      if (!mod || isModalOpen()) return;
      const key = e.key.toLowerCase();
      const action =
        key === 's' ? 'file:save'
        : key === 'l' && e.shiftKey ? 'view:toggleSidebar'
        : key === 'f' && !e.shiftKey ? 'editor:find'
        : key === 'n' && !e.shiftKey ? 'file:new'
        : key === ',' ? 'view:settings'
        : null;
      if (!action) return;
      e.preventDefault();
      acceleratorEcho.noteKeystroke(action); // the menu accelerator may deliver this keystroke again
      if (e.repeat || !runOnce(action)) return;
      if (action === 'file:save') void handleSaveArticle(editorRef.current?.getValue() ?? markdown);
      else if (action === 'view:toggleSidebar') setSidebarOpen((v) => !v);
      else if (action === 'editor:find') {
        setActiveView('editor');
        setFindBarOpen((v) => !v);
      } else if (action === 'file:new') void handleCreateBlankArticle();
      else setActiveView('settings');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeArticle, markdown, articles]);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
        if (isModalOpen('[data-vcat-quick-open]')) return;
        e.preventDefault();
        toggleQuickOpen();
        return;
      }
      const k = e.key.toLowerCase();
      // Undo/redo is owned by whoever has focus (native field, editor, sidebar file tree).
      // Anywhere else there is nothing to undo: swallow it so the menu echo cannot undo a file op.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (k === 'z' || k === 'y') && resolveUndoTarget() === 'none') {
        e.preventDefault();
        e.stopPropagation();
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
      if (action === 'edit:undo' || action === 'edit:redo') {
        runMenuUndo(action === 'edit:undo', editorRef.current, undoFileOpRef.current, redoFileOpRef.current);
        return;
      }
      if (acceleratorEcho.isEcho(action, payload)) return; // keydown already handled this keystroke
      if (isModalOpen() && !action.startsWith('window:')) return;
      if (action.startsWith('editor:') && action !== 'editor:find' && shouldBlockEditorCommand()) return;
      if (MENU_KEY_ECHO[action] && !runOnce(action)) return;
      if (action === 'file:new') void handleCreateBlankArticle();
      else if (action === 'file:openFile') void handleOpenExternalFile?.();
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
        if ((payload === 'bold' || payload === 'italic') && wasKeystrokeConsumed(payload[0])) return;
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
