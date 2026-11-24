import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EditorPreferences } from '@vcat/shared';
import Vditor from 'vditor';
import { applyCodeSyntaxHighlights } from '../editor/codeHighlight';
import { toggleInlineWrapInEditor, type InlineWrapCommand } from '../editor/inlineFormat';
import { positionAndSortLanguageHint } from '../editor/languageHint';
import { filterSlashCommands, type SlashCommandItem } from '../editor/slashCommands';
import { insertTableWithSizeAction } from '../editor/vditorCommands';
import {
  cleanEmptyInlineNodes,
  cleanStrayCodeBlockFences as cleanStrayCodeBlockFencesInEl,
  cleanupUnusedTempGapParagraphs as cleanupUnusedTempGapParagraphsInEl,
  ensureCodeBlockInfoMarkers as ensureCodeBlockInfoMarkersInEl,
  renderLatexBlocks as renderLatexBlocksInEl,
  rerenderBrokenMermaid as rerenderBrokenMermaidInEl,
} from '../editor/vditorDomEnhancer';
import type { FindOptions } from '../editor/vditorFindHelpers';
import { createVditorImperativeHandle, type EditorHandleExtras } from '../editor/vditorHandleFactory';
import {
  collapseExpandedCodeBlocksInEl,
  collectCodeCopyOverlays,
  commitCodeBlockLanguageInEl,
  ensureKatexAssets,
  handleVditorImageUpload,
} from '../editor/vditorInstanceOptions';
import { bindVditorEditorEvents } from '../editor/vditorLifecycleEvents';
import {
  applySlashCommandInEl,
  detectSlashCommandInEl,
  type SlashMenuState,
} from '../editor/vditorSlashMenu';
import { MediaLightbox, type LightboxPayload } from './MediaLightbox';
import { SlashCommandMenu } from './SlashCommandMenu';
import { TableSizePicker } from './TableSizePicker';

export type { FindOptions };

export interface VditorEditorHandle extends EditorHandleExtras {
  applyFormat: (cmd: string) => void;
  applyTableAction: (action: string) => void;
  applyImageAction: (action: string) => void;
  insertTableWithSize: (cols: number, rows: number) => void;
  getValue: () => string;
  getHTML: () => string;
  findMatches: (findStr: string, opts?: FindOptions) => number;
  jumpToMatch: (findStr: string, index: number, opts?: FindOptions) => number;
  clearFindHighlights: () => void;
  replaceAllText: (findStr: string, replaceStr: string, opts?: FindOptions) => number;
  undo: () => void;
  redo: () => void;
}

interface VditorEditorProps {
  value: string;
  articleKey: string;
  loadSeq?: number;
  readOnly?: boolean;
  preferences?: EditorPreferences;
  onChange: (markdown: string) => void;
  onSave?: (markdown: string) => void;
  onOpenLink?: (href: string) => void;
}

/** Typora-style Instant Rendering (IR) Markdown editor powered by local Vditor assets. */
export const VditorEditor = forwardRef<VditorEditorHandle, VditorEditorProps>(
  function VditorEditor({ value, articleKey, loadSeq, readOnly = false, preferences, onChange, onSave, onOpenLink }, ref) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const vditorRef = useRef<Vditor | null>(null);
    const isReadyRef = useRef(false);
    const readOnlyRef = useRef(readOnly);
    readOnlyRef.current = readOnly;
    const pendingValueRef = useRef<string | null>(null);
    const lastSelectionElRef = useRef<HTMLElement | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mermaidClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeZoomImgRef = useRef<HTMLImageElement | null>(null);
    const [lightboxItem, setLightboxItem] = useState<LightboxPayload | null>(null);
    const [codeCopyOverlays, setCodeCopyOverlays] = useState<
      Array<{ id: number; top: number; left: number; code: string }>
    >([]);
    const [copiedBlockId, setCopiedBlockId] = useState<number | null>(null);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const insertSlashItemRef = useRef<(item: SlashCommandItem) => void>(() => {});
    const onOpenLinkRef = useRef(onOpenLink);
    onOpenLinkRef.current = onOpenLink;
    const [slashState, setSlashState] = useState<SlashMenuState>({
      open: false,
      x: 0,
      y: 0,
      query: '',
      selectedIndex: 0,
    });
    const slashStateRef = useRef(slashState);
    slashStateRef.current = slashState;

    const [tablePicker, setTablePicker] = useState<{ open: boolean; x: number; y: number }>({
      open: false,
      x: 0,
      y: 0,
    });
    const savedTableRangeRef = useRef<Range | null>(null);

    const onChangeRef = useRef(onChange);
    const onSaveRef = useRef(onSave);
    const prefsRef = useRef<EditorPreferences>({
      autoPairSymbols: preferences?.autoPairSymbols ?? true,
      copyFormat: preferences?.copyFormat ?? 'markdown',
      defaultExportFormat: preferences?.defaultExportFormat ?? 'pdf',
    });

    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    prefsRef.current = {
      autoPairSymbols: preferences?.autoPairSymbols ?? true,
      copyFormat: preferences?.copyFormat ?? 'markdown',
      defaultExportFormat: preferences?.defaultExportFormat ?? 'pdf',
    };
    pendingValueRef.current = value;

    const pushVditorUndo = () => {
      const instance = vditorRef.current as unknown as {
        vditor?: { undo?: { addToUndoStack?: (v: unknown) => void } };
      } | null;
      instance?.vditor?.undo?.addToUndoStack?.(instance.vditor);
    };

    const lastFormatRef = useRef<{ cmd: string; ts: number }>({ cmd: '', ts: 0 });
    const toggleInlineWrap = (cmd: InlineWrapCommand) => {
      const now = Date.now();
      if (lastFormatRef.current.cmd === cmd && now - lastFormatRef.current.ts < 80) return;
      lastFormatRef.current = { cmd, ts: now };
      const instance = vditorRef.current;
      const el = containerRef.current;
      if (!instance || !el || !isReadyRef.current) return;
      toggleInlineWrapInEditor(el, cmd, pushVditorUndo, () => onChangeRef.current(instance.getValue()));
    };

    useImperativeHandle(ref, () =>
      createVditorImperativeHandle({
        vditorRef,
        containerRef,
        isReadyRef,
        readOnlyRef,
        lastSelectionElRef,
        activeZoomImgRef,
        onChangeRef,
        getFallbackValue: () => value,
        pushVditorUndo,
        toggleInlineWrap,
        setLightboxItem,
      })
    );

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      isReadyRef.current = false;

      const cdnBase = window.location.protocol === 'file:' ? './vditor' : '/vditor';
      ensureKatexAssets(cdnBase);

      const detectSlashCommand = () =>
        detectSlashCommandInEl({ el, readOnly: readOnlyRef.current, slashStateRef, setSlashState });

      const instance = new Vditor(el, {
        mode: 'ir',
        cdn: cdnBase,
        height: '100%',
        cache: { enable: false },
        toolbar: [],
        outline: { enable: false, position: 'left' },
        preview: {
          markdown: { autoSpace: true, mark: true, gfmAutoLink: true },
          hljs: { enable: true, style: 'github', lineNumber: false },
          math: { engine: 'KaTeX', inlineDigit: true },
        },
        value,
        after: () => {
          isReadyRef.current = true;
          if (pendingValueRef.current !== null && pendingValueRef.current !== instance.getValue()) {
            instance.setValue(pendingValueRef.current, true);
          }
          instance.clearStack();
        },
        input: (md) => {
          detectSlashCommand();
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => onChangeRef.current(md), 320);
        },
        ctrlEnter: (md) => onSaveRef.current?.(md),
        upload: {
          accept: 'image/*',
          handler: (files: File[]) =>
            handleVditorImageUpload({
              files,
              el,
              getInstance: () => vditorRef.current,
              pushVditorUndo,
              onChangeValue: (md) => onChangeRef.current(md),
            }),
        },
      });
      vditorRef.current = instance;

      let rafId = 0;
      let heavyEnhanceTimer: ReturnType<typeof setTimeout> | null = null;
      const lastActiveInfoMarkerRef = { current: null as HTMLElement | null };
      const hintNavigatedByArrowRef = { current: false };
      const suppressPreviewClickUntilRef = { current: 0 };

      const rewriteLocalImagesSync = () => {
        el.querySelectorAll('img').forEach((img) => {
          const rawSrc = img.getAttribute('src');
          if (!rawSrc || /^(https?:|data:|vcat-asset:|blob:)/i.test(rawSrc)) return;
          img.src = `vcat-asset://local/${rawSrc.replace(/^\.\//, '')}`;
        });
      };

      const setVditorRecentLang = (lang: string) => {
        const internal = instance as unknown as { vditor?: { hint?: { recentLanguage?: string } } };
        if (internal.vditor?.hint) internal.vditor.hint.recentLanguage = lang;
      };

      const ensureCodeBlockInfoMarkers = () => ensureCodeBlockInfoMarkersInEl(el);
      const cleanStrayCodeBlockFences = () => cleanStrayCodeBlockFencesInEl(el);
      const rerenderBrokenMermaid = () => rerenderBrokenMermaidInEl(el, cdnBase);
      const renderLatexBlocks = () => renderLatexBlocksInEl(el, cdnBase);
      const cleanupUnusedTempGapParagraphs = (activeNode?: Node | null) =>
        cleanupUnusedTempGapParagraphsInEl(el, activeNode);

      const commitCodeBlockLanguage = (infoMarker: HTMLElement, rawLang: string) =>
        commitCodeBlockLanguageInEl({
          el,
          instance,
          infoMarker,
          rawLang,
          lastActiveInfoMarkerRef,
          hintNavigatedByArrowRef,
          setVditorRecentLang,
          cleanStrayCodeBlockFences,
          renderLatexBlocks,
          rerenderBrokenMermaid,
          onChangeValue: (md) => onChangeRef.current(md),
        });

      let isRepositioningHint = false;
      const positionLanguageHint = () => {
        if (isRepositioningHint) return;
        isRepositioningHint = true;
        lastActiveInfoMarkerRef.current = positionAndSortLanguageHint(el, lastActiveInfoMarkerRef.current);
        queueMicrotask(() => {
          isRepositioningHint = false;
        });
      };

      const syncCodeCopyOverlays = () => {
        const next = collectCodeCopyOverlays(el, wrapperRef.current);
        if (next) setCodeCopyOverlays(next);
      };

      const runHeavyEnhance = () => {
        rewriteLocalImagesSync();
        ensureCodeBlockInfoMarkers();
        cleanStrayCodeBlockFences();
        cleanEmptyInlineNodes(el);
        syncCodeCopyOverlays();
        applyCodeSyntaxHighlights(el);
        renderLatexBlocks();
        rerenderBrokenMermaid();
        el.querySelectorAll('.vditor-ir__node[data-type="html-block"]').forEach((node) => {
          const rawText = (node.textContent || '').trim();
          node.classList.toggle('vcat-details-boundary', rawText === '</details>' || rawText === '<details>');
        });
      };

      const enhanceDom = () => {
        if (Date.now() < suppressPreviewClickUntilRef.current) return;
        rewriteLocalImagesSync();
        positionLanguageHint();
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          if (Date.now() < suppressPreviewClickUntilRef.current) return;
          positionLanguageHint();
          ensureCodeBlockInfoMarkers();
        });
        if (heavyEnhanceTimer) clearTimeout(heavyEnhanceTimer);
        heavyEnhanceTimer = setTimeout(runHeavyEnhance, 140);
      };

      const toggleLightboxFromActive = () => {
        const activeEl = activeZoomImgRef.current as HTMLElement | null;
        if (!activeEl) return;
        setLightboxItem((prev) => {
          if (prev) return null;
          if (activeEl.classList.contains('language-mermaid')) return { type: 'mermaid', svgHtml: activeEl.innerHTML };
          const img = activeEl as HTMLImageElement;
          return { type: 'image', src: img.src, alt: img.alt };
        });
      };

      const clearActiveZoomTarget = () => {
        if (activeZoomImgRef.current) {
          activeZoomImgRef.current.style.outline = '';
          activeZoomImgRef.current.closest('.vditor-ir__node')?.classList.remove('vcat-mermaid-active');
          activeZoomImgRef.current = null;
        }
        el.querySelectorAll('.vditor-ir__node.vcat-mermaid-active').forEach((n) => n.classList.remove('vcat-mermaid-active'));
      };

      const collapseExpandedCodeBlocks = (exceptBlock?: Element | null) =>
        collapseExpandedCodeBlocksInEl(el, renderLatexBlocks, rerenderBrokenMermaid, exceptBlock);

      const applySlashCommand = (item: SlashCommandItem) =>
        applySlashCommandInEl(item, {
          el,
          instance,
          setSlashState,
          savedTableRangeRef,
          setTablePicker,
          ensureCodeBlockInfoMarkers,
          collapseExpandedCodeBlocks,
          lastActiveInfoMarkerRef,
        });
      insertSlashItemRef.current = applySlashCommand;

      const unbindEvents = bindVditorEditorEvents({
        el,
        instance,
        readOnlyRef,
        prefsRef,
        slashStateRef,
        setSlashState,
        applySlashCommand,
        detectSlashCommand,
        lastActiveInfoMarkerRef,
        hintNavigatedByArrowRef,
        lastSelectionElRef,
        activeZoomImgRef,
        mermaidClickTimerRef,
        suppressPreviewClickUntilRef,
        setLightboxItem,
        commitCodeBlockLanguage,
        setVditorRecentLang,
        ensureCodeBlockInfoMarkers,
        pushVditorUndo,
        toggleInlineWrap,
        rerenderBrokenMermaid,
        renderLatexBlocks,
        onChangeRef,
        onOpenLinkRef,
        toggleLightboxFromActive,
        clearActiveZoomTarget,
        collapseExpandedCodeBlocks,
        cleanupUnusedTempGapParagraphs,
        syncCodeCopyOverlays,
        enhanceDom,
      });

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        if (heavyEnhanceTimer) clearTimeout(heavyEnhanceTimer);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        unbindEvents();
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        if (mermaidClickTimerRef.current) clearTimeout(mermaidClickTimerRef.current);
        isReadyRef.current = false;
        try {
          vditorRef.current?.destroy();
        } catch { /* ignore unmount race */ }
        vditorRef.current = null;
      };
    }, []);

    useEffect(() => {
      const instance = vditorRef.current;
      if (!instance || !isReadyRef.current) return;
      try {
        if (instance.getValue() !== value) {
          instance.setValue(value, true);
          instance.clearStack();
        }
      } catch { /* handled by pendingValueRef in after() */ }
    }, [articleKey, loadSeq]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const resetEl = el.querySelector('.vditor-ir .vditor-reset') as HTMLElement | null;
      if (resetEl) resetEl.setAttribute('contenteditable', readOnly ? 'false' : 'true');
      if (readOnly) {
        setSlashState((s) => (s.open ? { ...s, open: false } : s));
        el.querySelectorAll('.vditor-ir__node--expand').forEach((n) => n.classList.remove('vditor-ir__node--expand'));
      }
    }, [readOnly, articleKey, loadSeq]);

    const slashItems = filterSlashCommands(slashState.query);

    return (
      <>
        <div ref={wrapperRef} className="relative h-full w-full overflow-hidden">
          <div ref={containerRef} className={`h-full w-full ${readOnly ? 'vcat-readonly' : ''}`} />
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {codeCopyOverlays.map((btn) => {
              const isCopied = copiedBlockId === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  disabled={isCopied}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (copiedBlockId === btn.id) return;
                    void navigator.clipboard?.writeText(btn.code).then(() => {
                      setCopiedBlockId(btn.id);
                      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
                      copiedTimerRef.current = setTimeout(() => setCopiedBlockId(null), 1500);
                    });
                  }}
                  style={{ top: `${btn.top}px`, left: `${btn.left}px`, transform: 'translateX(-100%)' }}
                  className={`vcat-code-copy-btn pointer-events-auto absolute rounded-[5px] border px-2 py-0.5 text-[11px] font-medium transition ${
                    isCopied ? 'is-copied' : ''
                  }`}
                >
                  {isCopied ? '已复制 ✓' : '复制'}
                </button>
              );
            })}
          </div>
        </div>
        <SlashCommandMenu
          open={slashState.open && !readOnly}
          x={slashState.x}
          y={slashState.y}
          query={slashState.query}
          items={slashItems}
          selectedIndex={Math.min(slashState.selectedIndex, Math.max(0, slashItems.length - 1))}
          onHoverIndex={(idx) => setSlashState((s) => ({ ...s, selectedIndex: idx }))}
          onSelect={(item) => insertSlashItemRef.current(item)}
        />
        {tablePicker.open && (
          <TableSizePicker
            onConfirm={(cols, rows) => {
              const inst = vditorRef.current;
              const el = containerRef.current;
              setTablePicker({ open: false, x: 0, y: 0 });
              if (inst && el) {
                insertTableWithSizeAction(cols, rows, inst, el);
                onChangeRef.current(inst.getValue());
              }
            }}
            onClose={() => {
              containerRef.current?.querySelector('#vcat-table-placeholder')?.remove();
              setTablePicker({ open: false, x: 0, y: 0 });
            }}
          />
        )}
        <MediaLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      </>
    );
  }
);
