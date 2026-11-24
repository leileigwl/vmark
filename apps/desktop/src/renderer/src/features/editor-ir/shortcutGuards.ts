/**
 * Focus/modal guards and once-per-keystroke dispatch for app shortcuts.
 *
 * Why: the same keystroke can reach the app twice (renderer `keydown` + Electron
 * menu accelerator → `onMenuAction`), and shortcuts used to act on the editor or
 * the file tree regardless of where focus was (e.g. Cmd+Z on a button undid a
 * file deletion). Every app-level shortcut goes through these helpers instead.
 */

export const MODAL_SELECTOR = '[role="dialog"], [aria-modal="true"]';
export const FILE_TREE_SELECTOR = '[data-vcat-file-tree="1"]';
const EDITOR_SELECTOR = '.vditor-reset';
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

function isVisible(el: Element): boolean {
  return el instanceof HTMLElement ? el.getClientRects().length > 0 : true;
}

/** True when a dialog / modal overlay is open (optionally ignoring ones matching `except`). */
export function isModalOpen(except?: string): boolean {
  return Array.from(document.querySelectorAll(MODAL_SELECTOR)).some(
    (el) => isVisible(el) && !(except && el.matches(except))
  );
}

/** Text-entry form fields where the platform's own editing shortcuts must win. */
export function isNativeTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has((el.getAttribute('type') || '').toLowerCase());
  return el instanceof HTMLElement && el.isContentEditable && !el.closest(EDITOR_SELECTOR);
}

export type UndoTarget = 'native-field' | 'editor' | 'file-tree' | 'none';

/** Decides what Cmd/Ctrl+Z (or the Edit ▸ Undo menu) may undo for the current focus. */
export function resolveUndoTarget(active: Element | null = document.activeElement): UndoTarget {
  if (isNativeTextField(active)) return 'native-field';
  if (active?.closest(EDITOR_SELECTOR)) return 'editor';
  if (active?.closest(FILE_TREE_SELECTOR)) return 'file-tree';
  return 'none';
}

/** Editor-mutating commands (format/table/image) must not run behind a modal or from a form field. */
export function shouldBlockEditorCommand(active: Element | null = document.activeElement): boolean {
  return isModalOpen() || isNativeTextField(active);
}

/**
 * Collapses the renderer-keydown and menu-accelerator copies of one keystroke
 * into a single action. Keyed by action id; a second trigger inside `windowMs`
 * is dropped, whichever path arrives first.
 */
export function createOnceGate(windowMs = 300, now: () => number = () => Date.now()) {
  const last = new Map<string, number>();
  return (key: string): boolean => {
    const t = now();
    const prev = last.get(key);
    if (prev !== undefined && t - prev < windowMs) return false;
    last.set(key, t);
    return true;
  };
}

/**
 * onMenuAction payload the main process attaches when a menu item fired from its keyboard
 * accelerator (mirrors main/menuAccelerator.ts; a test keeps them equal).
 */
export const MENU_ACCELERATOR_PAYLOAD = 'accelerator';

/**
 * Pairs each app shortcut the renderer handled on keydown with the menu-accelerator copy of
 * the same keystroke, so that copy is dropped however late it arrives (a slow save / new-file
 * render can delay it past any fixed time gate). A copy with no matching keystroke (the renderer
 * never saw the key) still runs; keystrokes older than `windowMs` stop pairing.
 */
export function createAcceleratorEchoFilter(windowMs = 5000, now: () => number = () => Date.now()) {
  const pending = new Map<string, number[]>();
  const fresh = (action: string, t: number) => (pending.get(action) ?? []).filter((at) => t - at <= windowMs);
  return {
    noteKeystroke(action: string): void {
      const t = now();
      pending.set(action, [...fresh(action, t), t]);
    },
    isEcho(action: string, payload?: string): boolean {
      if (payload !== MENU_ACCELERATOR_PAYLOAD) return false;
      const list = fresh(action, now());
      const matched = list.length > 0;
      if (matched) list.shift();
      pending.set(action, list);
      return matched;
    },
  };
}

/** Records the latest keydown so a menu echo of a keystroke the editor already consumed can be skipped. */
let lastKeydown: KeyboardEvent | null = null;
let lastKeydownAt = 0;
let trackerInstalled = false;

export function installKeystrokeTracker(): void {
  if (trackerInstalled || typeof window === 'undefined') return;
  trackerInstalled = true;
  window.addEventListener(
    'keydown',
    (e) => {
      lastKeydown = e;
      lastKeydownAt = Date.now();
    },
    true
  );
}

/** True when a Cmd/Ctrl keystroke within `windowMs` was already handled (defaultPrevented) by the renderer. */
export function wasKeystrokeConsumed(key: string, opts: { shift?: boolean } = {}, windowMs = 300): boolean {
  const e = lastKeydown;
  if (!e || Date.now() - lastKeydownAt > windowMs) return false;
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== key) return false;
  if (opts.shift !== undefined && e.shiftKey !== opts.shift) return false;
  return e.defaultPrevented;
}
