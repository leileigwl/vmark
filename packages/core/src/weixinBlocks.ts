/**
 * 公众号排版里会被公众号编辑器改写的几类块：代码块、列表、公式。
 * 公众号粘贴时删 class / <style>，新版编辑器还会重写原生 ul/ol/li 与 blockquote、吞掉 <pre> 里的换行和行首空格，
 * 所以这里只输出 section / p / span + 内联 style，换行用 <br>、缩进用 &nbsp;。
 */

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MONO = 'Menlo, Monaco, Consolas, monospace';
const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'default', 'break', 'continue', 'import', 'from', 'export',
  'class', 'extends', 'super', 'new', 'this', 'typeof', 'instanceof', 'void',
  'async', 'await', 'try', 'catch', 'finally', 'throw', 'interface', 'type',
  'def', 'elif', 'pass', 'lambda', 'with', 'as', 'in', 'is', 'not', 'and', 'or',
  'fn', 'pub', 'mut', 'impl', 'struct', 'enum', 'trait', 'match', 'package', 'func',
]);
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'nil']);
const COMMENT = 'color: #6a737d; font-style: italic;';

/** 逐行高亮（span 不跨行），颜色全部写在内联 style 上。 */
function highlightLine(line: string): string {
  const escaped = escapeHtml(line);
  const trimmed = escaped.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
    return `<span style="${COMMENT}">${escaped}</span>`;
  }
  return escaped.replace(
    /(\/\/[^\n]*|#[^\n]*)|(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;|`[\s\S]*?`)|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*\b)/g,
    (match, comment, str, num, word) => {
      if (comment) return `<span style="${COMMENT}">${comment}</span>`;
      if (str) return `<span style="color: #032f62;">${str}</span>`;
      if (num) return `<span style="color: #005cc5;">${num}</span>`;
      if (word && KEYWORDS.has(word)) return `<span style="color: #d73a49; font-weight: 600;">${word}</span>`;
      if (word && LITERALS.has(word)) return `<span style="color: #005cc5; font-weight: 600;">${word}</span>`;
      return match;
    }
  );
}

/** 只把标签外文字里的空格换成 &nbsp;（制表符按 4 格），标签属性里的空格不动。 */
function keepSpaces(html: string): string {
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_m, tag: string | undefined, text: string | undefined) =>
    tag ?? (text ?? '').replace(/\t/g, '    ').replace(/ /g, '&nbsp;')
  );
}

const DOT = 'display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: middle;';

/** 代码块：Mac 三色点标题栏 + 不用 <pre> 的代码区（<br> 换行、&nbsp; 缩进）。 */
export function renderWeixinCodeBlock(code: string, lang: string): string {
  const body = code.split('\n').map((l) => keepSpaces(highlightLine(l))).join('<br>');
  return (
    `<section style="margin: 16px 0; border-radius: 10px; border: 1px solid rgba(0, 0, 0, 0.08); background-color: #f6f8fa; overflow: hidden;">` +
    `<section style="padding: 8px 12px; background-color: #eef1f5; border-bottom: 1px solid rgba(0, 0, 0, 0.06); font-size: 12px; line-height: 1.5; color: #666;">` +
    `<span style="${DOT} background-color: #ff5f56; margin-right: 6px;"></span>` +
    `<span style="${DOT} background-color: #ffbd2e; margin-right: 6px;"></span>` +
    `<span style="${DOT} background-color: #27c93f; margin-right: 10px;"></span>` +
    `<span style="font-family: ${MONO}; vertical-align: middle;">${escapeHtml(lang)}</span>` +
    `</section>` +
    `<p style="margin: 0; padding: 14px 16px; overflow-x: auto; text-align: left; word-break: break-all; font-family: ${MONO}; font-size: 13px; line-height: 1.6; color: #24292f;">${body}</p>` +
    `</section>`
  );
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const BULLETS = ['•', '◦', '▪'];

/** 当前行是否是列表项（无序 - * +，有序 1. 1)）。 */
export function isListLine(line: string): boolean {
  return LIST_ITEM.test(line) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
}

/**
 * 从 start 起收集连续的列表行，按缩进分层，渲染成一行一个 <p> 的列表（序号/圆点是文字）。
 * 有序列表沿用第一个序号（3. 4. 不会变成 1. 2.）。
 */
export function renderWeixinList(
  lines: string[],
  start: number,
  opts: { accent: string; fontSize: number; inline: (raw: string) => string }
): { html: string; next: number } {
  const indents: number[] = [];
  const counters: Array<{ ordered: boolean; n: number } | undefined> = [];
  const rows: string[] = [];
  let i = start;
  while (i < lines.length && isListLine(lines[i])) {
    const m = LIST_ITEM.exec(lines[i]) as RegExpExecArray;
    const indent = m[1].replace(/\t/g, '    ').length;
    while (indents.length && indents[indents.length - 1] > indent) indents.pop();
    if (!indents.length || indents[indents.length - 1] < indent) indents.push(indent);
    const depth = Math.min(indents.length - 1, 5);
    counters.length = depth + 1;
    const ordered = /\d/.test(m[2]);
    const prev = counters[depth];
    const n = prev && prev.ordered === ordered ? prev.n + 1 : ordered ? parseInt(m[2], 10) : 1;
    counters[depth] = { ordered, n };
    let text = m[3];
    let marker = ordered ? `${n}.` : BULLETS[depth % BULLETS.length];
    const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
    if (task) {
      marker = task[1] === ' ' ? '☐' : '☑';
      text = task[2];
    }
    const pad = 1.4 + depth * 1.4;
    rows.push(
      `<p style="margin: 0 0 6px 0; padding-left: ${pad.toFixed(1)}em; text-indent: -1.4em; text-align: left; line-height: 1.75; font-size: ${opts.fontSize}px; color: #333;">` +
        `<span style="display: inline-block; min-width: 1.4em; text-indent: 0; color: ${opts.accent};">${marker}&nbsp;</span>${opts.inline(text)}</p>`
    );
    i++;
  }
  return { html: `<section style="margin: 12px 0;">${rows.join('')}</section>`, next: i };
}

/** 公式占位符：渲染期间把 $..$ / $$..$$ 藏起来，避免里面的 * _ 被当成 Markdown 强调。 */
export interface MathSlot {
  tex: string;
  display: boolean;
  raw: string;
}

export const MATH_SLOT = /\u0000MATH([BI])(\d+)\u0000/g;
export const DISPLAY_MATH_ONLY = /^\u0000MATHB\d+\u0000$/;

/** 与发布时转图（latexRasterizer）同样的切分规则：代码里的 $ 不动，纯数字 $1$ 不算公式。 */
export function holdMath(markdown: string): { text: string; slots: MathSlot[] } {
  const slots: MathSlot[] = [];
  const code: string[] = [];
  const hold = (m: string) => `\u0000CODE${code.push(m) - 1}\u0000`;
  let work = markdown.replace(/(^|\n)(```|~~~)[\s\S]*?\n\2[^\n]*/g, hold).replace(/`[^`\n]+`/g, hold);
  const put = (raw: string, tex: string, display: boolean) =>
    `\u0000MATH${display ? 'B' : 'I'}${slots.push({ tex: tex.trim(), display, raw }) - 1}\u0000`;
  work = work.replace(/\$\$\s*([\s\S]+?)\s*\$\$/g, (m, tex: string) => put(m, tex, true));
  work = work.replace(/(?<!\\)\$([^$\n]+?)\$/g, (m, tex: string) => {
    const t = tex.trim();
    return !t || /^\d+(\.\d+)?$/.test(t) ? m : put(m, t, false);
  });
  return { text: work.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx: string) => code[Number(idx)]), slots };
}

/** 把占位符换回公式：有渲染函数（如 MathJax SVG）就用它，否则原样保留 $ 源码（等宽显示，不改字）。 */
export function fillMath(
  html: string,
  slots: MathSlot[],
  renderMath?: (tex: string, display: boolean) => string | undefined
): string {
  return html.replace(MATH_SLOT, (_m, kind: string, idx: string) => {
    const slot = slots[Number(idx)];
    if (!slot) return '';
    const rendered = renderMath?.(slot.tex, slot.display);
    if (!rendered) {
      const src = escapeHtml(slot.raw.replace(/\s*\n\s*/g, ' '));
      return `<span style="font-family: ${MONO}; font-size: 0.9em; color: #555;">${src}</span>`;
    }
    return kind === 'B' ? rendered : `<span style="display: inline-block; vertical-align: middle; margin: 0 2px;">${rendered}</span>`;
  });
}

/** 独占一段的行间公式：单独成一个居中的块。 */
export function displayMathBlock(placeholder: string): string {
  return `<section style="margin: 12px 0; text-align: center; overflow-x: auto;">${placeholder}</section>`;
}
