import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EditorPreferences } from '@vcat/shared';
import Vditor from 'vditor';
import { applyCodeSyntaxHighlights } from '../editor/codeHighlight';
import { getPreviewBlockTarget, readClipboardImageAsDataUrl } from '../editor/editorHelpers';
import { toggleInlineWrapInEditor, type InlineWrapCommand } from '../editor/inlineFormat';
import { positionAndSortLanguageHint, safeDecode } from '../editor/languageHint';
import { filterSlashCommands, type SlashCommandItem } from '../editor/slashCommands';
import { executeTableAction } from '../editor/tableActions';
import {
  applyFormatAction,
  applyImageActionInEditor,
  insertTableWithSizeAction,
} from '../editor/vditorCommands';
import {
  cleanEmptyInlineNodes,
  cleanStrayCodeBlockFences as cleanStrayCodeBlockFencesInEl,
  cleanupUnusedTempGapParagraphs as cleanupUnusedTempGapParagraphsInEl,
  ensureCodeBlockInfoMarkers as ensureCodeBlockInfoMarkersInEl,
  normalizeEmojiAndCalloutIcons,
  renderLatexBlocks as renderLatexBlocksInEl,
  rerenderBrokenMermaid as rerenderBrokenMermaidInEl,
} from '../editor/vditorDomEnhancer';
import {
  clearFindHighlightsInDoc,
  findMatchesInEl,
  jumpToMatchInEl,
  type FindOptions,
} from '../editor/vditorFindHelpers';
import { processVditorKeyDownCapture } from '../editor/vditorKeyboard';
import {
  handleEditorContextMenu,
  handleEditorCopyCapture,
  handleEditorMouseDownCapture,
  handleEditorPasteCapture,
  type PointerEventContext,
} from '../editor/vditorPointerEvents';
import { MediaLightbox, type LightboxPayload } from './MediaLightbox';
import { SlashCommandMenu } from './SlashCommandMenu';

export type { FindOptions };

export interface VditorEditorHandle {
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
    const [slashState, setSlashState] = useState<{
      open: boolean;
      x: number;
      y: number;
      query: string;
      selectedIndex: number;
    }>({ open: false, x: 0, y: 0, query: '', selectedIndex: 0 });
    const slashStateRef = useRef(slashState);
    slashStateRef.current = slashState;

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
      if (instance?.vditor?.undo?.addToUndoStack) {
        instance.vditor.undo.addToUndoStack(instance.vditor);
      }
    };

    const lastFormatRef = useRef<{ cmd: string; ts: number }>({ cmd: '', ts: 0 });
    const toggleInlineWrap = (cmd: InlineWrapCommand) => {
      const now = Date.now();
      if (lastFormatRef.current.cmd === cmd && now - lastFormatRef.current.ts < 80) {
        return;
      }
      lastFormatRef.current = { cmd, ts: now };
      const instance = vditorRef.current;
      const el = containerRef.current;
      if (!instance || !el || !isReadyRef.current) return;
      toggleInlineWrapInEditor(el, cmd, pushVditorUndo, () => {
        onChangeRef.current(instance.getValue());
      });
    };

    useImperativeHandle(ref, () => ({
      applyFormat(cmd: string) {
        const instance = vditorRef.current;
        const el = containerRef.current;
        if (!instance || !el || !isReadyRef.current || readOnlyRef.current) return;
        applyFormatAction(cmd, instance, el, toggleInlineWrap, pushVditorUndo, (md) => onChangeRef.current(md));
      },
      getValue() {
        const instance = vditorRef.current;
        return instance && isReadyRef.current ? instance.getValue() : value;
      },
      getHTML() {
        const instance = vditorRef.current;
        return instance && isReadyRef.current ? instance.getHTML() : '';
      },
      insertTableWithSize(cols: number, rows: number) {
        const instance = vditorRef.current;
        const el = containerRef.current;
        if (!instance || !el || !isReadyRef.current || readOnlyRef.current) return;
        insertTableWithSizeAction(cols, rows, instance, el);
      },
      findMatches(findStr: string, opts?: FindOptions) {
        return findMatchesInEl(containerRef.current, findStr, opts);
      },
      clearFindHighlights() {
        clearFindHighlightsInDoc();
      },
      undo() {
        const instance = vditorRef.current as unknown as {
          getValue?: () => string;
          vditor?: { undo?: { undo?: (v: unknown) => void; addToUndoStack?: (v: unknown) => void } };
        } | null;
        if (instance?.vditor?.undo?.undo && instance.getValue) {
          const before = instance.getValue();
          instance.vditor.undo.addToUndoStack?.(instance.vditor);
          instance.vditor.undo.undo(instance.vditor);
          if (instance.getValue() === before) {
            instance.vditor.undo.undo(instance.vditor);
          }
          onChangeRef.current(instance.getValue());
        } else {
          document.execCommand('undo');
        }
      },
      redo() {
        const instance = vditorRef.current as unknown as {
          getValue?: () => string;
          vditor?: { undo?: { redo?: (v: unknown) => void } };
        } | null;
        if (instance?.vditor?.undo?.redo && instance.getValue) {
          const before = instance.getValue();
          instance.vditor.undo.redo(instance.vditor);
          if (instance.getValue() === before) {
            instance.vditor.undo.redo(instance.vditor);
          }
          onChangeRef.current(instance.getValue());
        } else {
          document.execCommand('redo');
        }
      },
      jumpToMatch(findStr: string, targetIndex: number, opts?: FindOptions) {
        return jumpToMatchInEl(containerRef.current, findStr, targetIndex, opts);
      },
      replaceAllText(findStr: string, replaceStr: string, opts?: FindOptions) {
        const instance = vditorRef.current;
        if (!instance || !isReadyRef.current || !findStr) return 0;
        const current = instance.getValue();
        try {
          const flags = opts?.caseSensitive ? 'g' : 'gi';
          const escaped = opts?.regex ? findStr : findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = opts?.wholeWord ? `\\b${escaped}\\b` : escaped;
          const re = new RegExp(pattern, flags);
          const matches = current.match(re);
          const count = matches ? matches.length : 0;
          if (count > 0) {
            const next = current.replace(re, replaceStr);
            instance.setValue(next, false);
            onChangeRef.current(next);
          }
          return count;
        } catch {
          return 0;
        }
      },
      applyTableAction(action: string) {
        if (!containerRef.current) return;
        executeTableAction(action, {
          target: lastSelectionElRef.current,
          pushUndo: pushVditorUndo,
          commitMarkdown: () => onChangeRef.current(vditorRef.current?.getValue() ?? value),
        });
      },
      applyImageAction(action: string) {
        applyImageActionInEditor(
          action,
          activeZoomImgRef,
          lastSelectionElRef,
          setLightboxItem,
          pushVditorUndo,
          () => onChangeRef.current(vditorRef.current?.getValue() ?? value)
        );
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      isReadyRef.current = false;

      const cdnBase = window.location.protocol === 'file:' ? './vditor' : '/vditor';

      // Ensure local KaTeX stylesheet & script are loaded upfront so math formulas render synchronously
      if (!document.getElementById('vcat-katex-css')) {
        const link = document.createElement('link');
        link.id = 'vcat-katex-css';
        link.rel = 'stylesheet';
        link.href = `${cdnBase}/dist/js/katex/katex.min.css`;
        document.head.appendChild(link);
      }
      if (!document.getElementById('vcat-katex-js')) {
        const script = document.createElement('script');
        script.id = 'vcat-katex-js';
        script.src = `${cdnBase}/dist/js/katex/katex.min.js`;
        document.head.appendChild(script);
      }

      const instance = new Vditor(el, {
        mode: 'ir',
        cdn: cdnBase,
        height: '100%',
        cache: { enable: false },
        toolbar: [],
        outline: { enable: false, position: 'left' },
        preview: {
          markdown: {
            autoSpace: true,
            mark: true,
            gfmAutoLink: true,
          },
          hljs: {
            enable: true,
            style: 'github',
            lineNumber: false,
          },
          math: {
            engine: 'KaTeX',
            inlineDigit: true,
          },
        },
        value,
        after: () => {
          isReadyRef.current = true;
          if (pendingValueRef.current !== null && pendingValueRef.current !== instance.getValue()) {
            instance.setValue(pendingValueRef.current, true);
          }
          instance.clearStack();
        },
        // Debounce React state sync so typing & Cmd+Z undo remain instant on 68KB+ docs
        input: (md) => {
          detectSlashCommand();
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            onChangeRef.current(md);
          }, 320);
        },
        ctrlEnter: (md) => {
          onSaveRef.current?.(md);
        },
        upload: {
          accept: 'image/*',
          handler: async (files: File[]) => {
            for (const file of files) {
              const buffer = await file.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = '';
              for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const base64 = btoa(binary);
              const ext = file.name.split('.').pop() || 'png';
              const saved = await window.electronAPI.saveLocalImage(base64, ext);

              const sel = window.getSelection();
              const anchorEl =
                sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
              const activeCell = anchorEl?.closest('td, th') as HTMLElement | null;

              // Inside a table cell, insert an inline Lute IR image node without trailing newline
              // so it never breaks the table row into an extra row!
              if (activeCell && el.contains(activeCell)) {
                pushVditorUndo();
                const cleanRel = saved.relativeMarkdownPath.replace(/^\.\//, '');
                const irImg = document.createElement('span');
                irImg.className = 'vditor-ir__node';
                irImg.setAttribute('data-type', 'img');
                irImg.innerHTML =
                  `<span class="vditor-ir__marker">!</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--bracket">[</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--bracket">${file.name}</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--bracket">]</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--paren">(</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--link">${saved.relativeMarkdownPath}</span>` +
                  `<span class="vditor-ir__marker vditor-ir__marker--paren">)</span>` +
                  `<img src="vcat-asset://local/${cleanRel}" alt="${file.name}" />`;
                if (sel && sel.rangeCount > 0 && activeCell.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                  const r = sel.getRangeAt(0);
                  r.deleteContents();
                  r.insertNode(irImg);
                  r.setStartAfter(irImg);
                  r.collapse(true);
                } else {
                  activeCell.appendChild(irImg);
                }
                pushVditorUndo();
                onChangeRef.current(instance.getValue());
              } else {
                instance.insertValue(`![${file.name}](${saved.relativeMarkdownPath})\n`);
              }
            }
            return null;
          },
        },
      });

      vditorRef.current = instance;

      let rafId = 0;
      const rewriteLocalImagesSync = () => {
        const imgs = el.querySelectorAll('img');
        imgs.forEach((img) => {
          const rawSrc = img.getAttribute('src');
          if (!rawSrc || /^(https?:|data:|vcat-asset:|blob:)/i.test(rawSrc)) return;
          const cleanRel = rawSrc.replace(/^\.\//, '');
          img.src = `vcat-asset://local/${cleanRel}`;
        });
      };

      let lastActiveInfoMarker: HTMLElement | null = null;
      let hintNavigatedByArrow = false;

      const setVditorRecentLang = (lang: string) => {
        const internal = instance as unknown as {
          vditor?: { hint?: { recentLanguage?: string } };
        };
        if (internal.vditor?.hint) {
          internal.vditor.hint.recentLanguage = lang;
        }
      };

      const ensureCodeBlockInfoMarkers = () => ensureCodeBlockInfoMarkersInEl(el);
      const cleanStrayCodeBlockFences = () => cleanStrayCodeBlockFencesInEl(el);
      const rerenderBrokenMermaid = () => rerenderBrokenMermaidInEl(el, cdnBase);
      const renderLatexBlocks = () => renderLatexBlocksInEl(el, cdnBase);
      const cleanupUnusedTempGapParagraphs = (activeNode?: Node | null) =>
        cleanupUnusedTempGapParagraphsInEl(el, activeNode);

      const commitCodeBlockLanguage = (infoMarker: HTMLElement, rawLang: string) => {
        const cleanLang = safeDecode(rawLang).replace(/\u200b/g, '').trim();
        lastActiveInfoMarker = infoMarker;
        hintNavigatedByArrow = false;
        setVditorRecentLang(cleanLang);
        infoMarker.textContent = cleanLang ? `\u200b${cleanLang}` : '\u200b';

        const codeBlock = infoMarker.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null;
        if (codeBlock) {
          codeBlock.setAttribute('data-CodeLang', cleanLang || 'text');
          const codeEl = codeBlock.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
          const previewCodeEl = codeBlock.querySelector('pre.vditor-ir__preview > code') as HTMLElement | null;
          if (codeEl) {
            codeEl.className = cleanLang ? `language-${cleanLang}` : '';
            const rawCode = codeEl.textContent || '';
            if (/^[\u200b\s]*`{3,}[\u200b\s]*$/.test(rawCode)) {
              codeEl.textContent = '\u200b';
            }
          }
          if (previewCodeEl) {
            previewCodeEl.className = cleanLang ? `language-${cleanLang}` : '';
          }
          const previewPre = codeBlock.querySelector('pre.vditor-ir__preview') as HTMLElement | null;
          if (previewPre) {
            delete previewPre.dataset.vcatMathSrc;
            delete previewPre.dataset.vcatMermaidSrc;
          }
        }

        const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
        if (hintEl) {
          hintEl.style.display = 'none';
        }

        if (codeBlock) {
          codeBlock.classList.add('vditor-ir__node--expand');
          const codeEl = codeBlock.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null;
          if (codeEl) {
            if (!codeEl.firstChild || (codeEl.textContent || '').length === 0) {
              codeEl.textContent = '\u200b';
            }
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(codeEl);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }

        requestAnimationFrame(() => {
          cleanStrayCodeBlockFences();
          applyCodeSyntaxHighlights(el);
          renderLatexBlocks();
          rerenderBrokenMermaid();
          try {
            onChangeRef.current(instance.getValue());
          } catch {
            // ignore serialization race while tearing down
          }
        });
      };

      let isRepositioningHint = false;
      const positionLanguageHint = () => {
        if (isRepositioningHint) return;
        isRepositioningHint = true;
        lastActiveInfoMarker = positionAndSortLanguageHint(el, lastActiveInfoMarker);
        queueMicrotask(() => {
          isRepositioningHint = false;
        });
      };

      const toggleLightboxFromActive = () => {
        const activeEl = activeZoomImgRef.current as HTMLElement | null;
        if (!activeEl) return;
        setLightboxItem((prev) => {
          if (prev) return null;
          if (activeEl.classList.contains('language-mermaid')) {
            return { type: 'mermaid', svgHtml: activeEl.innerHTML };
          }
          const img = activeEl as HTMLImageElement;
          return { type: 'image', src: img.src, alt: img.alt };
        });
      };

      const syncCodeCopyOverlays = () => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const wRect = wrapper.getBoundingClientRect();
        const blocks = el.querySelectorAll('.vditor-ir__node[data-type="code-block"]');
        const next: Array<{ id: number; top: number; left: number; code: string }> = [];
        blocks.forEach((cb, idx) => {
          const rect = cb.getBoundingClientRect();
          if (rect.height < 20 || rect.bottom < wRect.top + 8 || rect.top > wRect.bottom - 24) return;
          const codeEl = cb.querySelector('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code');
          const code = (codeEl?.textContent || '').replace(/\u200b/g, '').replace(/\n$/, '');
          next.push({
            id: idx,
            top: Math.max(8, rect.top - wRect.top + 8),
            left: rect.right - wRect.left - 12,
            code,
          });
        });
        setCodeCopyOverlays(next);
      };

      let heavyEnhanceTimer: ReturnType<typeof setTimeout> | null = null;
      const runHeavyEnhance = () => {
        rewriteLocalImagesSync();
        ensureCodeBlockInfoMarkers();
        cleanStrayCodeBlockFences();
        cleanEmptyInlineNodes(el);
        normalizeEmojiAndCalloutIcons(el);
        syncCodeCopyOverlays();
        applyCodeSyntaxHighlights(el);
        renderLatexBlocks();
        rerenderBrokenMermaid();
        const htmlNodes = el.querySelectorAll('.vditor-ir__node[data-type="html-block"]');
        htmlNodes.forEach((node) => {
          const rawText = (node.textContent || '').trim();
          if (rawText === '</details>' || rawText === '<details>') {
            node.classList.add('vcat-details-boundary');
          } else {
            node.classList.remove('vcat-details-boundary');
          }
        });
      };

      const suppressPreviewClickUntilRef = { current: 0 };

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

      const detectSlashCommand = () => {
        if (readOnlyRef.current) return;
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed || !sel.anchorNode || !el.contains(sel.anchorNode)) {
          if (slashStateRef.current.open) setSlashState((s) => ({ ...s, open: false }));
          return;
        }
        const anchorNode = sel.anchorNode;
        const anchorEl = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
        if (!anchorEl || anchorEl.closest('pre:not(.vditor-reset), code, .vditor-ir__marker--info')) {
          if (slashStateRef.current.open) setSlashState((s) => ({ ...s, open: false }));
          return;
        }
        if (anchorNode.nodeType !== Node.TEXT_NODE) {
          if (slashStateRef.current.open) setSlashState((s) => ({ ...s, open: false }));
          return;
        }
        const before = (anchorNode.nodeValue || '').slice(0, sel.anchorOffset).replace(/\u200b/g, '');
        const match = before.match(/(?:^|\s)\/([a-zA-Z0-9\u4e00-\u9fa5_-]{0,20})$/);
        if (!match) {
          if (slashStateRef.current.open) setSlashState((s) => ({ ...s, open: false }));
          return;
        }
        const r = document.createRange();
        const slashOffset = Math.max(0, sel.anchorOffset - match[0].trimStart().length);
        r.setStart(anchorNode, slashOffset);
        r.setEnd(anchorNode, Math.min(anchorNode.nodeValue?.length ?? sel.anchorOffset, slashOffset + 1));
        let rect = r.getBoundingClientRect();
        if (!rect || (rect.left === 0 && rect.bottom === 0)) {
          rect = sel.getRangeAt(0).getClientRects()[0] || anchorEl.getBoundingClientRect();
        }
        const x = rect.left || anchorEl.getBoundingClientRect().left || 80;
        const y = (rect.bottom || anchorEl.getBoundingClientRect().bottom || 120) + 6;
        setSlashState((prev) => ({
          open: true,
          x,
          y,
          query: match[1],
          selectedIndex: prev.query === match[1] ? prev.selectedIndex : 0,
        }));
      };

      const applySlashCommand = (item: SlashCommandItem) => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.anchorNode?.nodeType === Node.TEXT_NODE) {
          const tNode = sel.anchorNode as Text;
          const raw = tNode.nodeValue || '';
          const before = raw.slice(0, sel.anchorOffset);
          const m = before.match(/\/[a-zA-Z0-9\u4e00-\u9fa5_-]{0,20}$/);
          if (m && m.index !== undefined) {
            const delRange = document.createRange();
            delRange.setStart(tNode, m.index);
            delRange.setEnd(tNode, sel.anchorOffset);
            delRange.deleteContents();
            sel.removeAllRanges();
            sel.addRange(delRange);
          }
        }
        setSlashState((s) => ({ ...s, open: false, query: '', selectedIndex: 0 }));
        instance.focus();
        instance.insertValue(item.insertText);
        if (item.id === 'code') {
          const focusLanguageMarker = () => {
            ensureCodeBlockInfoMarkers();
            const selNow = window.getSelection();
            const anchorEl =
              selNow?.anchorNode instanceof Element ? selNow.anchorNode : selNow?.anchorNode?.parentElement;
            const cb =
              (anchorEl?.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null) ??
              (Array.from(el.querySelectorAll('.vditor-ir__node[data-type="code-block"]')).pop() as HTMLElement | null);
            const infoSpan = cb?.querySelector('.vditor-ir__marker--info') as HTMLElement | null;
            if (cb && infoSpan) {
              collapseExpandedCodeBlocks(cb);
              cb.classList.add('vditor-ir__node--expand');
              lastActiveInfoMarker = infoSpan;
              const range = document.createRange();
              range.selectNodeContents(infoSpan);
              const s = window.getSelection();
              s?.removeAllRanges();
              s?.addRange(range);
            }
          };
          requestAnimationFrame(focusLanguageMarker);
          setTimeout(focusLanguageMarker, 60);
        }
      };
      insertSlashItemRef.current = applySlashCommand;

      const observer = new MutationObserver(enhanceDom);
      observer.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['src', 'style', 'class'],
      });
      enhanceDom();

      const lastActiveInfoMarkerRef = {
        get current() {
          return lastActiveInfoMarker;
        },
        set current(v: HTMLElement | null) {
          lastActiveInfoMarker = v;
        },
      };
      const hintNavigatedByArrowRef = {
        get current() {
          return hintNavigatedByArrow;
        },
        set current(v: boolean) {
          hintNavigatedByArrow = v;
        },
      };

      const handleKeyDownCapture = (e: KeyboardEvent) => {
        processVditorKeyDownCapture(e, {
          el,
          instance,
          readOnly: readOnlyRef.current,
          autoPairBrackets: prefsRef.current.autoPairSymbols,
          slashMenuOpen: slashStateRef.current.open,
          lastActiveInfoMarkerRef,
          hintNavigatedByArrowRef,
          activeZoomImgRef,
          setVditorRecentLang,
          commitCodeBlockLanguage,
          pushVditorUndo,
          toggleInlineWrap,
          rerenderBrokenMermaid,
          onChangeValue: (md) => onChangeRef.current(md),
          toggleLightboxFromActive,
          closeLightbox: () => setLightboxItem(null),
          undo: () => {
            const v = instance as unknown as {
              getValue?: () => string;
              vditor?: { undo?: { undo?: (vd: unknown) => void; addToUndoStack?: (vd: unknown) => void } };
            };
            if (v.vditor?.undo?.undo && v.getValue) {
              const before = v.getValue();
              v.vditor.undo.addToUndoStack?.(v.vditor);
              v.vditor.undo.undo(v.vditor);
              if (v.getValue() === before) v.vditor.undo.undo(v.vditor);
              onChangeRef.current(v.getValue());
            } else {
              document.execCommand('undo');
            }
          },
          redo: () => {
            const v = instance as unknown as {
              getValue?: () => string;
              vditor?: { undo?: { redo?: (vd: unknown) => void } };
            };
            if (v.vditor?.undo?.redo && v.getValue) {
              const before = v.getValue();
              v.vditor.undo.redo(v.vditor);
              if (v.getValue() === before) v.vditor.undo.redo(v.vditor);
              onChangeRef.current(v.getValue());
            } else {
              document.execCommand('redo');
            }
          },
          onSlashKeyDown: (ev) => {
            const items = filterSlashCommands(slashStateRef.current.query);
            if (ev.key === 'Escape') {
              ev.preventDefault();
              ev.stopPropagation();
              setSlashState((s) => ({ ...s, open: false }));
              return true;
            }
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
              ev.preventDefault();
              ev.stopPropagation();
              if (items.length === 0) return true;
              const delta = ev.key === 'ArrowDown' ? 1 : -1;
              setSlashState((s) => ({
                ...s,
                selectedIndex: (s.selectedIndex + delta + items.length) % items.length,
              }));
              return true;
            }
            if (ev.key === 'Enter' || ev.key === 'Tab') {
              ev.preventDefault();
              ev.stopPropagation();
              ev.stopImmediatePropagation();
              const chosen = items[slashStateRef.current.selectedIndex] ?? items[0];
              if (chosen) applySlashCommand(chosen);
              return true;
            }
            return false;
          },
        });
      };

      // Single-click image or Mermaid diagram opens Lightbox; single-click LaTeX focuses silently without source flash; double-click edits source
      const clearActiveZoomTarget = () => {
        if (activeZoomImgRef.current) {
          activeZoomImgRef.current.style.outline = '';
          activeZoomImgRef.current.closest('.vditor-ir__node')?.classList.remove('vcat-mermaid-active');
          activeZoomImgRef.current = null;
        }
        el.querySelectorAll('.vditor-ir__node.vcat-mermaid-active').forEach((n) => {
          n.classList.remove('vcat-mermaid-active');
        });
      };

      const collapseExpandedCodeBlocks = (exceptBlock?: Element | null) => {
        const expanded = el.querySelectorAll('.vditor-ir__node--expand[data-type="code-block"], .vditor-ir__node--expand[data-type="math-block"]');
        let changed = false;
        expanded.forEach((node) => {
          if (node !== exceptBlock) {
            node.classList.remove('vditor-ir__node--expand');
            changed = true;
          }
        });
        if (changed) {
          renderLatexBlocks();
          rerenderBrokenMermaid();
          requestAnimationFrame(() => {
            renderLatexBlocks();
            rerenderBrokenMermaid();
          });
        }
      };

      const handledGapClickRef = { current: false };

      const pointerCtx: PointerEventContext = {
        el,
        instance,
        get readOnly() {
          return readOnlyRef.current;
        },
        prefsRef,
        lastActiveInfoMarkerRef,
        lastSelectionElRef,
        activeZoomImgRef,
        mermaidClickTimerRef,
        handledGapClickRef,
        suppressPreviewClickUntilRef,
        setLightboxItem,
        commitCodeBlockLanguage,
        clearActiveZoomTarget,
        collapseExpandedCodeBlocks,
        cleanupUnusedTempGapParagraphs,
      };

      const handleMouseDownCapture = (e: MouseEvent) => handleEditorMouseDownCapture(e, pointerCtx);

      const handleClickCapture = (e: MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest('.vditor-hint button')) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        if (handledGapClickRef.current) {
          handledGapClickRef.current = false;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        if (Date.now() < suppressPreviewClickUntilRef.current) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        const imgEl = target?.closest('img');
        const previewTarget = imgEl ? null : getPreviewBlockTarget(target);
        if (imgEl || previewTarget) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        const linkAnchor = target?.closest('a, .vditor-ir__link') as HTMLElement | null;
        const linkNode = target?.closest('.vditor-ir__node[data-type="a"]') as HTMLElement | null;
        if ((linkAnchor || linkNode) && (readOnlyRef.current || e.metaKey || e.ctrlKey)) {
          const href =
            linkAnchor?.getAttribute('href') ||
            linkNode?.querySelector('.vditor-ir__marker--link')?.textContent?.trim() ||
            linkNode?.querySelector('a')?.getAttribute('href') ||
            '';
          if (href) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            onOpenLinkRef.current?.(href);
          }
        }
      };

      const handleContextMenu = (e: MouseEvent) => handleEditorContextMenu(e, pointerCtx);
      const handlePasteCapture = (e: ClipboardEvent) => handleEditorPasteCapture(e, instance);
      const handleCopyCapture = (e: ClipboardEvent) => handleEditorCopyCapture(e, el, instance, prefsRef);

      const handleMouseUpCapture = (e: MouseEvent) => {
        if (Date.now() < suppressPreviewClickUntilRef.current) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      };

      const handleDblClickCapture = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (Date.now() < suppressPreviewClickUntilRef.current || getPreviewBlockTarget(target)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }

        // 1. Double click inside HTML block (<details> / <summary>)
        const htmlBlock = target?.closest('.vditor-ir__node[data-type="html-block"]') as HTMLElement | null;
        if (htmlBlock) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const summary = target?.closest('summary') as HTMLElement | null;
          const details = target?.closest('details') as HTMLElement | null;
          const selectTarget = summary ?? details ?? htmlBlock.querySelector('.vditor-ir__preview') ?? htmlBlock;
          const range = document.createRange();
          range.selectNodeContents(selectTarget);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          return;
        }

        // 2. Double click inside code block (select all code contents)
        const codeBlock = target?.closest('.vditor-ir__node[data-type="code-block"]') as HTMLElement | null;
        if (codeBlock) {
          if (target?.closest('.vditor-copy, .vditor-ir__marker--info')) return;
          const codeEl =
            (codeBlock.querySelector('pre.vditor-ir__marker--pre > code') as HTMLElement | null) ??
            (codeBlock.querySelector('pre.vditor-ir__preview > code') as HTMLElement | null) ??
            (codeBlock.querySelector('pre.vditor-ir__marker--pre') as HTMLElement | null);
          if (codeEl) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const range = document.createRange();
            range.selectNodeContents(codeEl);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            return;
          }
        }
      };

      const handleSelectionChange = () => {
        const sel = window.getSelection();
        if (!sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
        cleanupUnusedTempGapParagraphs(sel.anchorNode);
        const anchorEl =
          sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement;
        const curInfo = anchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null;
        if (curInfo && el.contains(curInfo)) {
          lastActiveInfoMarker = curInfo;
        }
        const curCodeBlock = anchorEl?.closest('.vditor-ir__node[data-type="code-block"], .vditor-ir__node[data-type="math-block"]') as HTMLElement | null;
        collapseExpandedCodeBlocks(curCodeBlock);
        requestAnimationFrame(() => {
          renderLatexBlocks();
          rerenderBrokenMermaid();
        });
      };

      const handleCompositionEnd = () => {
        ensureCodeBlockInfoMarkers();
        requestAnimationFrame(() => {
          ensureCodeBlockInfoMarkers();
        });
      };

      document.addEventListener('selectionchange', handleSelectionChange);
      el.addEventListener('compositionend', handleCompositionEnd, true);
      el.addEventListener('copy', handleCopyCapture, true);
      el.addEventListener('paste', handlePasteCapture, true);
      window.addEventListener('keydown', handleKeyDownCapture, true);
      el.addEventListener('mousedown', handleMouseDownCapture, true);
      el.addEventListener('mouseup', handleMouseUpCapture, true);
      el.addEventListener('dblclick', handleDblClickCapture, true);
      el.addEventListener('click', handleClickCapture, true);
      el.addEventListener('input', detectSlashCommand, true);
      el.addEventListener('keyup', detectSlashCommand, true);
      el.addEventListener('contextmenu', handleContextMenu);
      el.addEventListener('scroll', syncCodeCopyOverlays, { capture: true, passive: true });
      window.addEventListener('resize', syncCodeCopyOverlays);

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        if (heavyEnhanceTimer) clearTimeout(heavyEnhanceTimer);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        document.removeEventListener('selectionchange', handleSelectionChange);
        el.removeEventListener('input', detectSlashCommand, true);
        el.removeEventListener('keyup', detectSlashCommand, true);
        el.removeEventListener('compositionend', handleCompositionEnd, true);
        el.removeEventListener('copy', handleCopyCapture, true);
        el.removeEventListener('paste', handlePasteCapture, true);
        window.removeEventListener('keydown', handleKeyDownCapture, true);
        el.removeEventListener('mousedown', handleMouseDownCapture, true);
        el.removeEventListener('mouseup', handleMouseUpCapture, true);
        el.removeEventListener('dblclick', handleDblClickCapture, true);
        el.removeEventListener('click', handleClickCapture, true);
        el.removeEventListener('contextmenu', handleContextMenu);
        el.removeEventListener('scroll', syncCodeCopyOverlays, true);
        window.removeEventListener('resize', syncCodeCopyOverlays);
        observer.disconnect();
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        if (mermaidClickTimerRef.current) clearTimeout(mermaidClickTimerRef.current);
        isReadyRef.current = false;
        try {
          vditorRef.current?.destroy();
        } catch {
          // Ignore teardown race when unmounting before Vditor finishes async lute load
        }
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
      } catch {
        // Fallback handled by pendingValueRef in after()
      }
    }, [articleKey, loadSeq]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const resetEl = el.querySelector('.vditor-ir .vditor-reset') as HTMLElement | null;
      if (resetEl) {
        resetEl.setAttribute('contenteditable', readOnly ? 'false' : 'true');
      }
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
                      copiedTimerRef.current = setTimeout(() => {
                        setCopiedBlockId(null);
                      }, 1500);
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
        <MediaLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      </>
    );
  }
);
