import type { MutableRefObject } from 'react';
import type Vditor from 'vditor';
import type { VditorEditorHandle } from '../components/VditorEditor';
import type { InlineWrapCommand } from './inlineFormat';
import { executeTableAction } from './tableActions';
import { applyFormatAction, applyImageActionInEditor, insertTableWithSizeAction } from './vditorCommands';
import { clearFindHighlightsInDoc, findMatchesInEl, jumpToMatchInEl, type FindOptions } from './vditorFindHelpers';
import type { LightboxPayload } from '../components/MediaLightbox';

type UndoableVditor = {
  getValue?: () => string;
  vditor?: {
    undo?: {
      undo?: (v: unknown) => void;
      redo?: (v: unknown) => void;
      addToUndoStack?: (v: unknown) => void;
    };
  };
};

/** Executes Vditor undo cleanly with double-pop guard for identical snapshots. */
export function runVditorUndo(instance: Vditor | null, onChange: (md: string) => void): void {
  const v = instance as unknown as UndoableVditor | null;
  if (v?.vditor?.undo?.undo && v.getValue) {
    const before = v.getValue();
    v.vditor.undo.addToUndoStack?.(v.vditor);
    v.vditor.undo.undo(v.vditor);
    if (v.getValue() === before) {
      v.vditor.undo.undo(v.vditor);
    }
    onChange(v.getValue());
  } else {
    document.execCommand('undo');
  }
}

/** Executes Vditor redo cleanly with double-pop guard for identical snapshots. */
export function runVditorRedo(instance: Vditor | null, onChange: (md: string) => void): void {
  const v = instance as unknown as UndoableVditor | null;
  if (v?.vditor?.undo?.redo && v.getValue) {
    const before = v.getValue();
    v.vditor.undo.redo(v.vditor);
    if (v.getValue() === before) {
      v.vditor.undo.redo(v.vditor);
    }
    onChange(v.getValue());
  } else {
    document.execCommand('redo');
  }
}

/** Builds the imperative editor handle exposed via forwardRef on VditorEditor. */
export function createVditorImperativeHandle(ctx: {
  vditorRef: MutableRefObject<Vditor | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  isReadyRef: MutableRefObject<boolean>;
  readOnlyRef: MutableRefObject<boolean>;
  lastSelectionElRef: MutableRefObject<HTMLElement | null>;
  activeZoomImgRef: MutableRefObject<HTMLImageElement | null>;
  onChangeRef: MutableRefObject<(md: string) => void>;
  getFallbackValue: () => string;
  pushVditorUndo: () => void;
  toggleInlineWrap: (cmd: InlineWrapCommand) => void;
  setLightboxItem: (next: LightboxPayload | null) => void;
}): VditorEditorHandle {
  return {
    applyFormat(cmd: string) {
      const instance = ctx.vditorRef.current;
      const el = ctx.containerRef.current;
      if (!instance || !el || !ctx.isReadyRef.current || ctx.readOnlyRef.current) return;
      applyFormatAction(cmd, instance, el, ctx.toggleInlineWrap, ctx.pushVditorUndo, (md) => ctx.onChangeRef.current(md));
    },
    getValue() {
      const instance = ctx.vditorRef.current;
      return instance && ctx.isReadyRef.current ? instance.getValue() : ctx.getFallbackValue();
    },
    getHTML() {
      const instance = ctx.vditorRef.current;
      return instance && ctx.isReadyRef.current ? instance.getHTML() : '';
    },
    insertTableWithSize(cols: number, rows: number) {
      const instance = ctx.vditorRef.current;
      const el = ctx.containerRef.current;
      if (!instance || !el || !ctx.isReadyRef.current || ctx.readOnlyRef.current) return;
      insertTableWithSizeAction(cols, rows, instance, el);
    },
    findMatches(findStr: string, opts?: FindOptions) {
      return findMatchesInEl(ctx.containerRef.current, findStr, opts);
    },
    clearFindHighlights() {
      clearFindHighlightsInDoc();
    },
    undo() {
      runVditorUndo(ctx.vditorRef.current, (md) => ctx.onChangeRef.current(md));
    },
    redo() {
      runVditorRedo(ctx.vditorRef.current, (md) => ctx.onChangeRef.current(md));
    },
    jumpToMatch(findStr: string, targetIndex: number, opts?: FindOptions) {
      return jumpToMatchInEl(ctx.containerRef.current, findStr, targetIndex, opts);
    },
    replaceAllText(findStr: string, replaceStr: string, opts?: FindOptions) {
      const instance = ctx.vditorRef.current;
      if (!instance || !ctx.isReadyRef.current || !findStr) return 0;
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
          ctx.onChangeRef.current(next);
        }
        return count;
      } catch {
        return 0;
      }
    },
    applyTableAction(action: string) {
      if (!ctx.containerRef.current) return;
      executeTableAction(action, {
        target: ctx.lastSelectionElRef.current,
        pushUndo: ctx.pushVditorUndo,
        commitMarkdown: () => ctx.onChangeRef.current(ctx.vditorRef.current?.getValue() ?? ctx.getFallbackValue()),
      });
    },
    applyImageAction(action: string) {
      applyImageActionInEditor(
        action,
        ctx.activeZoomImgRef,
        ctx.lastSelectionElRef,
        ctx.setLightboxItem,
        ctx.pushVditorUndo,
        () => ctx.onChangeRef.current(ctx.vditorRef.current?.getValue() ?? ctx.getFallbackValue())
      );
    },
  };
}
