import { useEffect, useRef, type RefObject } from 'react';
import type { VditorEditorHandle } from '../../components/VditorEditor';
import { fenceIndentedCode, unfenceIndentedCode } from './indentedCode';
import { preserveUntouched } from './preserveSave';

const USER_INPUT_EVENTS = ['keydown', 'mousedown', 'paste', 'drop', 'compositionstart', 'beforeinput'] as const;
const READY_POLL_MS = 30;

/**
 * Remembers the editor's own rendering of the article as loaded (its "baseline"), so a save can
 * tell the user's edits apart from Vditor's re-normalization and keep untouched lines byte-exact.
 *
 * The baseline is read synchronously right after the editor has applied the loaded text (this
 * effect runs in the same task as the editor's own load effect, so nothing can edit in between).
 * While the editor is still starting up it is read as soon as the editor is ready, or on the
 * first user input event, whichever comes first (input events fire before the DOM changes).
 * After every successful save the saved editor text becomes the baseline. If the user edits
 * with no baseline at all, the editor's Lute round-trip of the file stands in.
 */
export function useSaveBaseline(editorRef: RefObject<VditorEditorHandle | null>, loadSeq: number) {
  const baselineRef = useRef<string | null>(null);
  /** Private fence the loaded article's indented code blocks are shown with (see indentedCode.ts). */
  const fenceRef = useRef<string | null>(null);

  useEffect(() => {
    baselineRef.current = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const isReady = () => (editorRef.current?.normalizeMarkdown('') ?? null) !== null;
    const capture = () => {
      if (baselineRef.current === null && isReady()) baselineRef.current = editorRef.current?.getValue() ?? null;
    };
    const poll = () => {
      capture();
      timer = baselineRef.current === null ? setTimeout(poll, READY_POLL_MS) : null;
    };
    for (const ev of USER_INPUT_EVENTS) document.addEventListener(ev, capture, true);
    poll();
    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of USER_INPUT_EVENTS) document.removeEventListener(ev, capture, true);
    };
  }, [loadSeq]);

  /** Editor text for `content` just read from disk; remembers how its indented code is shown. */
  function toEditor(content: string): string {
    const { text, fence } = fenceIndentedCode(content);
    fenceRef.current = fence;
    return text;
  }

  /** Bytes to write for editor text `current`, given the file as last loaded/saved. */
  function contentForDisk(original: string | null, current: string): string {
    const fence = fenceRef.current;
    const restore = (md: string) => (fence ? unfenceIndentedCode(md, fence) : md);
    if (original === null) return restore(current);
    const editorOriginal = fence ? fenceIndentedCode(original).text : original;
    const baseline = baselineRef.current ?? editorRef.current?.normalizeMarkdown(editorOriginal) ?? null;
    if (baseline === null) return restore(current);
    try {
      return preserveUntouched(original, restore(baseline), restore(current));
    } catch (err) {
      console.warn('[save] 最小改动合并失败，写入编辑器全文', err);
      return restore(current);
    }
  }

  /** Call after `current` was written successfully: it is the new baseline. */
  function markSaved(current: string) {
    baselineRef.current = current;
  }

  return { toEditor, contentForDisk, markSaved };
}
