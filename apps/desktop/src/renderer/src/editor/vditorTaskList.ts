import type Vditor from 'vditor';

/**
 * Lute serialises a ticked IR task item as `- [X]  text` (uppercase X and an extra
 * space, because the rendered text node keeps its leading space). Rewrite the
 * marker back to the GFM form the user typed (`- [x] text`, `- [ ] text`).
 * Fenced code blocks are left untouched.
 */
const TASK_MARKER_RE = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\] {2}(?=\S)/;
const FENCE_RE = /^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})/;

export function normalizeTaskListMarkdown(md: string): string {
  if (!md.includes('] ')) return md;
  let fence: string | null = null;
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const mark = fenceMatch[1];
      if (fence === null) fence = mark;
      else if (mark[0] === fence[0] && mark.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    lines[i] = line.replace(TASK_MARKER_RE, (_m, prefix: string, state: string) => `${prefix}[${state === ' ' ? ' ' : 'x'}] `);
  }
  return lines.join('\n');
}

type LuteLike = { VditorIRDOM2Md?: (html: string) => string; __vcatTaskListPatched?: boolean };

/**
 * Wraps the instance's Lute `VditorIRDOM2Md` so every markdown Vditor hands out
 * (getValue, the input callback, copy) carries the normalised task markers.
 * Lute loads asynchronously, so this is safe to call repeatedly; it patches once.
 */
export function ensureTaskListOutputPatched(instance: Vditor): void {
  const lute = (instance as unknown as { vditor?: { lute?: LuteLike } }).vditor?.lute;
  if (!lute || lute.__vcatTaskListPatched || typeof lute.VditorIRDOM2Md !== 'function') return;
  const original = lute.VditorIRDOM2Md.bind(lute);
  lute.VditorIRDOM2Md = (html: string) => normalizeTaskListMarkdown(original(html));
  lute.__vcatTaskListPatched = true;
}

/**
 * Click-capture handler for task-list checkboxes. Vditor toggles the `checked`
 * attribute in its own (bubble) click listener and only reports the change after
 * `undoDelay`, merging quick clicks into one undo step. Here we snapshot the undo
 * stack before the toggle and right after it, so each click is its own undo step,
 * and report the new value immediately so autosave starts.
 */
export function handleTaskCheckboxClickCapture(
  e: MouseEvent,
  ctx: { el: HTMLElement; instance: Vditor; readOnly: boolean; pushVditorUndo: () => void; onChange: (md: string) => void }
): boolean {
  const target = e.target as HTMLElement | null;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || !ctx.el.contains(target)) return false;
  if (ctx.readOnly) return true;
  ensureTaskListOutputPatched(ctx.instance);
  ctx.pushVditorUndo();
  setTimeout(() => {
    if (!ctx.el.isConnected) return;
    ctx.pushVditorUndo();
    ctx.onChange(ctx.instance.getValue());
  }, 0);
  return true;
}
