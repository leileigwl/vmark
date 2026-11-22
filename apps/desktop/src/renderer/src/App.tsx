import { useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { ArticleManagerView } from './components/ArticleManagerView';
import { FindReplaceBar } from './components/FindReplaceBar';
import { PublishModal } from './components/PublishModal';
import { QuickOpenModal } from './components/QuickOpenModal';
import { SettingsView, type SettingCategory } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { VditorEditor, type VditorEditorHandle } from './components/VditorEditor';
import { useAuthSettings } from './features/auth-settings';
import { useEditorWorkspace } from './features/editor-ir';
import { usePublishDrawer } from './features/publish-drawer';
import { useThemeBloom } from './features/theme-bloom';
import { useWorkspaceTree } from './features/workspace-tree';

type MainView = 'editor' | 'manager' | 'settings';
type SideTab = 'files' | 'outline';

export default function App() {
  const [activeView, setActiveView] = useState<MainView>('editor');
  const [sideTab, setSideTab] = useState<SideTab>('files');
  const [settingCategory, setSettingCategory] = useState<SettingCategory>('image');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [readOnly, setReadOnly] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(248);
  const [dragGhostX, setDragGhostX] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [quickOpenModalOpen, setQuickOpenModalOpen] = useState<boolean>(false);

  const editorRef = useRef<VditorEditorHandle>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(errOrMsg: unknown) {
    const raw = errOrMsg instanceof Error ? errOrMsg.message : String(errOrMsg);
    const clean = raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/i, '');
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(clean);
    toastTimerRef.current = setTimeout(() => {
      setToastMsg(null);
      toastTimerRef.current = null;
    }, 3200);
  }

  const { theme, setTheme, customThemeName, handleImportTyporaTheme } = useThemeBloom();
  const { publishModalOpen, setPublishModalOpen } = usePublishDrawer();
  const auth = useAuthSettings(showToast);
  const ws = useWorkspaceTree({
    editorRef,
    startupConfig: auth.startupConfig,
    setStartupConfig: auth.setStartupConfig,
    setImageBed: auth.setImageBed,
    setAuthStates: auth.setAuthStates,
    setActiveViewEditor: () => setActiveView('editor'),
    showToast,
  });

  const ed = useEditorWorkspace({
    editorRef,
    activeArticle: ws.activeArticle,
    articles: ws.articles,
    markdown: ws.markdown,
    undoFileOpRef: ws.undoFileOpRef,
    redoFileOpRef: ws.redoFileOpRef,
    setActiveView,
    setSidebarOpen,
    setSideTab,
    setIsFullscreen,
    setTheme,
    openQuickOpen: () => setQuickOpenModalOpen(true),
    toggleQuickOpen: () => setQuickOpenModalOpen((v) => !v),
    openPublishModal: () => setPublishModalOpen(true),
    handleSaveArticle: ws.handleSaveArticle,
    handleSelectWorkspace: ws.handleSelectWorkspace,
    handleCreateBlankArticle: ws.handleCreateBlankArticle,
    openArticle: ws.openArticle,
    clearRecentArticles: ws.clearRecentArticles,
  });

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

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)]">
      {dragGhostX !== null && (
        <div
          style={{ left: `${dragGhostX}px` }}
          className="pointer-events-none fixed top-0 bottom-0 z-50 w-[2px] border-r border-dashed border-[#007aff] bg-[#007aff]/35 shadow-[0_0_8px_rgba(0,122,255,0.45)]"
        />
      )}

      {toastMsg && (
        <div
          onClick={() => {
            if (toastTimerRef.current) {
              clearTimeout(toastTimerRef.current);
              toastTimerRef.current = null;
            }
            setToastMsg(null);
          }}
          role="button"
          tabIndex={0}
          title="点击关闭"
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none rounded-xl border border-[var(--border-color)] bg-[#1d1d1f]/92 px-5 py-3 text-center text-[13px] text-white shadow-2xl backdrop-blur-md transition-opacity hover:opacity-90"
        >
          {toastMsg}
        </div>
      )}

      <Sidebar
        open={sidebarOpen}
        width={sidebarWidth}
        isResizing={dragGhostX !== null}
        sideTab={sideTab}
        workspaceName={ws.workspaceName}
        workspacePath={ws.workspacePath}
        recentWorkspaces={ws.recentWorkspaces}
        articles={ws.articles}
        folders={ws.folders}
        activeArticle={ws.activeArticle}
        outlineNodes={ws.outlineNodes}
        onChangeSideTab={setSideTab}
        onStartResize={startSidebarResize}
        onOpenArticle={(art, keyword) => {
          void ws.openArticle(art, undefined, keyword);
          setActiveView('editor');
        }}
        onCreateFile={ws.handleCreateFile}
        canUndoFileOp={ws.fileUndoStack.length > 0}
        canRedoFileOp={ws.fileRedoStack.length > 0}
        onUndoFileOp={ws.handleUndoFileOp}
        onRedoFileOp={ws.handleRedoFileOp}
        onCreateFolder={ws.handleCreateFolder}
        onRenameArticle={ws.handleRenameArticle}
        onDeleteArticle={ws.handleDeleteArticle}
        onBatchDeleteArticles={ws.handleBatchDeleteArticles}
        onDeleteFolder={ws.handleDeleteFolder}
        onBatchDeleteItems={ws.handleBatchDeleteItems}
        onDuplicateArticle={ws.handleDuplicateArticle}
        onMoveArticle={ws.handleMoveArticle}
        onMoveFolder={ws.handleMoveFolder}
        onSelectWorkspace={ws.handleSelectWorkspace}
        onSwitchRecentWorkspace={ws.switchRecentWorkspace}
        onRefreshWorkspace={ws.refreshWorkspace}
        onJumpOutline={ed.handleJumpOutline}
      />

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)]">
        <TopBar
          activeView={activeView}
          sidebarOpen={sidebarOpen}
          isFullscreen={isFullscreen}
          readOnly={readOnly}
          activeArticle={ws.activeArticle}
          liveWordCount={ws.liveWordCount}
          saveState={ws.saveState}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleReadOnly={() => setReadOnly((v) => !v)}
          onOpenQuickOpen={() => setQuickOpenModalOpen(true)}
          onSetActiveView={setActiveView}
          onOpenPublishModal={() => setPublishModalOpen(true)}
        />

        <main className="flex flex-1 overflow-hidden">
          <section className={activeView === 'editor' ? 'relative flex-1 overflow-hidden bg-[var(--bg-main)]' : 'hidden'}>
            {ed.findBarOpen && (
              <FindReplaceBar
                findQuery={ed.findQuery}
                replaceQuery={ed.replaceQuery}
                matchIndex={ed.findMatchIndex}
                matchTotal={ed.findMatchTotal}
                replaceNotice={ed.replaceNotice}
                findOptions={ed.findOptions}
                onChangeFindQuery={(q) => {
                  ed.setFindQuery(q);
                  ed.setReplaceNotice('');
                }}
                onChangeReplaceQuery={ed.setReplaceQuery}
                onChangeOptions={ed.setFindOptions}
                onPrev={() => {
                  if (!ed.findQuery || ed.findMatchTotal === 0) return;
                  const prevIdx = (ed.findMatchIndex - 1 + ed.findMatchTotal) % ed.findMatchTotal;
                  ed.setFindMatchIndex(prevIdx);
                  editorRef.current?.jumpToMatch(ed.findQuery, prevIdx, ed.findOptions);
                }}
                onNext={() => {
                  if (!ed.findQuery || ed.findMatchTotal === 0) return;
                  const nextIdx = (ed.findMatchIndex + 1) % ed.findMatchTotal;
                  ed.setFindMatchIndex(nextIdx);
                  editorRef.current?.jumpToMatch(ed.findQuery, nextIdx, ed.findOptions);
                }}
                onReplaceAll={() => {
                  const count = editorRef.current?.replaceAllText(ed.findQuery, ed.replaceQuery, ed.findOptions) ?? 0;
                  ed.setReplaceNotice(`已替换 ${count} 处`);
                  ed.setFindMatchTotal(0);
                  ed.setFindMatchIndex(0);
                }}
                onClose={() => {
                  editorRef.current?.clearFindHighlights();
                  ed.setFindBarOpen(false);
                }}
              />
            )}

            {ed.missingLinkTarget && (
              <div role="dialog" aria-modal="true"
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs"
                onClick={() => ed.setMissingLinkTarget(null)}
              >
                <div
                  className="w-[340px] rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] p-5 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
                      <AlertCircle className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[14px] font-semibold text-[var(--text-main)]">无法打开文件</h3>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--control-text-color)] break-all">
                        工作区中未找到目标文件：<br />
                        <span className="font-mono text-[var(--text-main)]">「{ed.missingLinkTarget}」</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      autoFocus
                      onClick={() => ed.setMissingLinkTarget(null)}
                      className="rounded-md bg-[#007aff] px-4 py-1.5 text-[12px] font-medium text-white shadow-2xs hover:bg-[#0066d6]"
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
            )}

            {ws.activeArticle ? (
              <VditorEditor
                ref={editorRef}
                articleKey={ws.activeArticle.relativePath}
                loadSeq={ws.loadSeq}
                readOnly={readOnly}
                value={ws.markdown}
                preferences={ed.editorPrefs}
                onChange={(md) => {
                  ws.setMarkdown(md);
                  ws.setSaveState('未保存');
                }}
                onSave={(md) => void ws.handleSaveArticle(md)}
                onOpenLink={ed.handleOpenLink}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[var(--control-text-color)]">
                <p>当前工作区暂无文章</p>
                <button
                  type="button"
                  onClick={() => void ws.handleCreateBlankArticle()}
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-white"
                >
                  + 新建空白文章
                </button>
              </div>
            )}
          </section>

          {activeView === 'manager' && (
            <ArticleManagerView
              workspacePath={ws.workspacePath}
              gitStatus={ws.gitStatus}
              articles={ws.articles}
              totalLocalImages={ws.totalLocalImages}
              onSelectWorkspace={() => void ws.handleSelectWorkspace()}
              onCreateArticle={() => void ws.handleCreateBlankArticle()}
              onOpenArticle={(art) => {
                void ws.openArticle(art);
                setActiveView('editor');
              }}
              onPublishArticle={(art) => {
                void ws.openArticle(art);
                setPublishModalOpen(true);
              }}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              settingCategory={settingCategory}
              onSelectCategory={setSettingCategory}
              startupConfig={auth.startupConfig}
              onSaveStartupConfig={auth.saveStartupConfig}
              editorPrefs={ed.editorPrefs}
              onUpdateEditorPrefs={ed.updateEditorPrefs}
              onExportArticle={(fmt) => void ed.handleExportArticle(fmt)}
              onPickSpecificDir={ws.pickSpecificDir}
              imageBed={auth.imageBed}
              imageBedTestMsg={auth.imageBedTestMsg}
              onUpdateImageBed={auth.updateImageBed}
              onTestImageBed={auth.testImageBed}
              theme={theme}
              customThemeName={customThemeName}
              onSelectTheme={setTheme}
              onImportTyporaTheme={() => void handleImportTyporaTheme()}
              authStates={auth.authStates}
              onPlatformLogin={auth.loginPlatform}
              onPlatformLogout={auth.logoutPlatform}
              workspacePath={ws.workspacePath}
              gitStatus={ws.gitStatus}
              gitPushLog={ws.gitPushLog}
              onGitPush={ws.handleGitPush}
            />
          )}
        </main>
      </div>

      {publishModalOpen && (
        <PublishModal
          activeArticle={ws.activeArticle}
          gitStatus={ws.gitStatus}
          gitPushLog={ws.gitPushLog}
          markdown={ws.markdown}
          onClose={() => setPublishModalOpen(false)}
          onGitPush={ws.handleGitPush}
          onSaveArticle={(content) => void ws.handleSaveArticle(content)}
        />
      )}

      {ed.tableModalOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-xs">
          <div className="w-[320px] rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] p-4 text-[var(--text-main)] shadow-2xl">
            <div className="mb-3 text-center text-sm font-semibold">插入表格</div>
            <div className="mb-4 flex items-center justify-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--control-text-color)]">列</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={ed.tableCols}
                  onChange={(e) => ed.setTableCols(Number(e.target.value) || 1)}
                  className="w-16 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2 py-1 text-center outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--control-text-color)]">行</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={ed.tableRows}
                  onChange={(e) => ed.setTableRows(Number(e.target.value) || 1)}
                  className="w-16 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2 py-1 text-center outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border-color)] pt-3 text-xs">
              <button
                type="button"
                onClick={() => ed.setTableModalOpen(false)}
                className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1 hover:bg-[var(--bg-hover)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  ed.setTableModalOpen(false);
                  editorRef.current?.insertTableWithSize(ed.tableCols, ed.tableRows);
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
        articles={ws.articles}
        recentArticlePaths={ws.recentArticlePaths}
        activeArticlePath={ws.activeArticle?.relativePath ?? null}
        onClose={() => setQuickOpenModalOpen(false)}
        onSelectArticle={(art) => {
          void ws.openArticle(art);
          setActiveView('editor');
        }}
        onSelectWorkspace={() => void ws.handleSelectWorkspace()}
        onClearRecent={ws.clearRecentArticles}
      />
    </div>
  );
}
