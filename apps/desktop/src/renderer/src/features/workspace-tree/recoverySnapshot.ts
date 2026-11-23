import { useEffect, useRef } from 'react';

type Snapshot = { rel: string; base: string; content: string } | { rel: string; clean: true } | null;

/** What the editor holds right now; `content()` is only called when something may have changed. */
export interface RecoveryState {
  rel: string;
  base: string;
  dirty: boolean;
  content: () => string;
}

/**
 * Exposes `window.__vmarkRecoverySnapshot()` for the main process's crash-recovery backups
 * (main/editorRecovery.ts). Cheap when nothing changed: it only reads the editor after an input
 * event or while the article is unsaved, and reports "clean" once after the edits are saved
 * (or once for the previous article after switching away from it).
 */
export function useRecoverySnapshot(read: () => RecoveryState | null): void {
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    let inputSeq = 0;
    let seenSeq = -1;
    let lastContent: string | null = null;
    let reportedDirty = false;
    let lastRel: string | null = null;
    const onInput = () => {
      inputSeq += 1;
    };
    document.addEventListener('input', onInput, true);
    const w = window as unknown as { __vmarkRecoverySnapshot?: () => Snapshot };
    w.__vmarkRecoverySnapshot = () => {
      const state = readRef.current();
      if (!state) return null;
      if (reportedDirty && lastRel !== null && state.rel !== lastRel) {
        // Switched articles: the previous one was flushed on the way out; let main drop its backup.
        const previous = lastRel;
        lastRel = state.rel;
        reportedDirty = false;
        lastContent = null;
        seenSeq = -1;
        return { rel: previous, clean: true };
      }
      lastRel = state.rel;
      if (!state.dirty && inputSeq === seenSeq) {
        if (!reportedDirty) return null;
        reportedDirty = false;
        lastContent = null;
        return { rel: state.rel, clean: true };
      }
      seenSeq = inputSeq;
      const content = state.content();
      if (content === lastContent) return null;
      lastContent = content;
      reportedDirty = content !== state.base;
      return { rel: state.rel, base: state.base, content };
    };
    return () => {
      document.removeEventListener('input', onInput, true);
      delete w.__vmarkRecoverySnapshot;
    };
  }, []);
}
