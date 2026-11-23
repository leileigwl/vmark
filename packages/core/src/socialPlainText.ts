import { parseCardBlocks, type CardBlock } from './socialCardBlocks.ts';
import { stripInlineMarkdown } from './socialMarkdownUtils.ts';

export interface PlainTextOptions {
  /** 平台单独填写的标题；正文里等于标题的 H1 不再重复。 */
  title?: string;
  /** 是否保留代码块内容（默认不保留：代码、表格已经排进卡片图里）。 */
  includeCode?: boolean;
}

function lineOf(b: CardBlock, includeCode: boolean): string | null {
  switch (b.kind) {
    case 'heading':
    case 'paragraph':
    case 'quote':
      return stripInlineMarkdown(b.text);
    case 'list-item':
      return `${'  '.repeat(b.depth)}${b.ordered ? b.marker : '•'} ${stripInlineMarkdown(b.text)}`;
    case 'code':
      return includeCode ? b.lines.join('\n') : null;
    case 'math':
      return b.tex;
    case 'image':
    case 'table':
      return null;
  }
}

/**
 * 给小红书/抖音等纯文本正文用：去掉所有 Markdown 标记，callout 变成「💡 技巧：」，
 * 每个段落/列表项单独一行，标题前空一行，不把全文挤成一段。
 */
export function markdownToPlainText(markdown: string, opts: PlainTextOptions = {}): string {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const blocks = parseCardBlocks(body, { title: opts.title });
  const out: string[] = [];
  for (const b of blocks) {
    const line = lineOf(b, opts.includeCode ?? false);
    if (!line?.trim()) continue;
    if (b.kind === 'heading' && out.length) out.push('');
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
