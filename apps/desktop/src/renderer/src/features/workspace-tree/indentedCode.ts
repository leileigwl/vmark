/**
 * Indented code blocks (4 spaces / a tab) are invisible to Vditor's Markdown serializer: its
 * `getValue()` drops them, and typing inside one re-renders the block into an empty paragraph,
 * so the user's edit and the whole block vanish from the editor (TODO #13).
 *
 * The editor is therefore given each top-level indented code block as a private tilde fence,
 * which it edits like any fenced block, and every block with that exact fence is turned back
 * into an indented block before saving. The file on disk keeps its indented code blocks; the
 * minimal-diff save (`preserveSave.ts`) then writes only the lines the user changed.
 *
 * Detection is deliberately conservative: an indented line counts as code only after a blank
 * line (or a heading, the file start, a closed fence), never inside a list, a fenced block or
 * front matter. A block it misses keeps the editor's old behaviour; it never rewrites one.
 */

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^ {0,3}([-+*]|\d{1,9}[.)])([ \t]|$)/;
const HEADING = /^ {0,3}#{1,6}([ \t]|$)/;
const BLANK = /^[ \t]*$/;

function indentWidth(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') col++;
    else if (ch === '\t') col += 4 - (col % 4);
    else break;
  }
  return col;
}

/** Removes the 4 columns of code-block indentation (spaces and/or a tab). */
function stripIndent(line: string): string {
  let col = 0;
  let k = 0;
  while (col < 4 && k < line.length) {
    if (line[k] === ' ') col++;
    else if (line[k] === '\t') col += 4 - (col % 4);
    else break;
    k++;
  }
  return ' '.repeat(Math.max(0, col - 4)) + line.slice(k);
}

/** Line ranges [start, end) of top-level indented code blocks. */
function findIndentedBlocks(lines: string[]): Array<[number, number]> {
  const blocks: Array<[number, number]> = [];
  let i = 0;
  if (lines[0] === '---') {
    const close = lines.findIndex((l, k) => k > 0 && (l === '---' || l === '...'));
    if (close > 0) i = close + 1;
  }
  let fence: { ch: string; len: number } | null = null;
  let canStartCode = true;
  let afterBlank = true;
  let inList = false;
  while (i < lines.length) {
    const line = lines[i];
    if (fence) {
      const m = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len) {
        fence = null;
        canStartCode = true;
      }
      i++;
      continue;
    }
    if (BLANK.test(line)) {
      canStartCode = true;
      afterBlank = true;
      i++;
      continue;
    }
    if (indentWidth(line) >= 4 && canStartCode && !inList) {
      let end = i;
      for (let j = i; j < lines.length && (BLANK.test(lines[j]) || indentWidth(lines[j]) >= 4); j++) {
        if (!BLANK.test(lines[j])) end = j + 1;
      }
      blocks.push([i, end]);
      i = end;
      canStartCode = true;
      afterBlank = false;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (LIST_ITEM.test(line)) inList = true;
    else if (afterBlank && indentWidth(line) === 0) inList = false;
    if (open) fence = { ch: open[1][0], len: open[1].length };
    canStartCode = HEADING.test(line);
    afterBlank = false;
    i++;
  }
  return blocks;
}

/**
 * Editor text for `md`: each top-level indented code block wrapped in a private tilde fence
 * (longer than any tilde run in the file, so no line of it can close the fence early).
 * Returns `fence: null` and `md` unchanged when the file has no indented code block.
 */
export function fenceIndentedCode(md: string): { text: string; fence: string | null } {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = findIndentedBlocks(lines);
  if (blocks.length === 0) return { text: md, fence: null };
  const longestTilde = lines.reduce((max, l) => Math.max(max, /^[ \t]*(~*)/.exec(l)?.[1].length ?? 0), 0);
  const fence = '~'.repeat(Math.max(5, longestTilde + 1));
  const out: string[] = [];
  let at = 0;
  for (const [start, end] of blocks) {
    out.push(...lines.slice(at, start), fence);
    out.push(...lines.slice(start, end).map((l) => (BLANK.test(l) ? '' : stripIndent(l))), fence);
    at = end;
  }
  out.push(...lines.slice(at));
  return { text: out.join('\n'), fence };
}

/** Turns every block fenced by exactly `fence` back into a 4-space indented code block. */
export function unfenceIndentedCode(text: string, fence: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const close = lines[i] === fence ? lines.indexOf(fence, i + 1) : -1;
    if (close < 0) {
      out.push(lines[i]);
      continue;
    }
    out.push(...lines.slice(i + 1, close).map((l) => (l === '' ? '' : `    ${l}`)));
    i = close;
  }
  return out.join('\n');
}
