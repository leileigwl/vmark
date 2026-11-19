export interface SlashCommandItem {
  id: string;
  label: string;
  shortcut?: string;
  keywords: string[];
  description: string;
  insertText: string;
  cursorBackOffset?: number;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'h1',
    label: '一级标题',
    shortcut: '⌘1',
    keywords: ['h1', 'yijibiaoti', 'yjbt', 'biaoti', 'bt', 'heading1'],
    description: '# 大标题',
    insertText: '# ',
  },
  {
    id: 'h2',
    label: '二级标题',
    shortcut: '⌘2',
    keywords: ['h2', 'erjibiaoti', 'ejbt', 'biaoti', 'bt', 'heading2'],
    description: '## 章节标题',
    insertText: '## ',
  },
  {
    id: 'h3',
    label: '三级标题',
    shortcut: '⌘3',
    keywords: ['h3', 'sanjibiaoti', 'sjbt', 'biaoti', 'bt', 'heading3'],
    description: '### 小节标题',
    insertText: '### ',
  },
  {
    id: 'table',
    label: '表格 (4行3列)',
    shortcut: '⌥⌘T',
    keywords: ['table', 'biaoge', 'bg', 'tab'],
    description: '插入 4行3列 Markdown 表格',
    insertText: '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n|  |  |  |\n',
  },
  {
    id: 'math',
    label: '公式块 (LaTeX)',
    shortcut: '⌥⌘B',
    keywords: ['math', 'latex', 'tex', 'gongshikuai', 'gsk', 'gongshi', 'gs'],
    description: '插入块级 LaTeX 数学公式',
    insertText: '```latex\n\n```',
    cursorBackOffset: 4,
  },
  {
    id: 'code',
    label: '代码块',
    shortcut: '⌥⌘C',
    keywords: ['code', 'daimakuai', 'dmk', 'daima', 'dm', 'js', 'ts', 'py'],
    description: '插入代码高亮块',
    insertText: '```ts\n\n```',
    cursorBackOffset: 4,
  },
  {
    id: 'mermaid',
    label: 'Mermaid 流程图',
    keywords: ['mermaid', 'liuchengtu', 'lct', 'tubiao', 'tb', 'flowchart'],
    description: '插入 Mermaid 流程图',
    insertText: '```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```',
  },
  {
    id: 'callout-tip',
    label: '提示框',
    keywords: ['tip', 'info', 'tishikuang', 'tsk', 'tishi', 'ts', 'callout'],
    description: '插入 💡 技巧/提示引用块',
    insertText: '> 💡 **提示**：',
  },
  {
    id: 'quote',
    label: '引用',
    shortcut: '⌥⌘Q',
    keywords: ['quote', 'blockquote', 'yinyong', 'yy'],
    description: '> 引用段落',
    insertText: '> ',
  },
  {
    id: 'ol',
    label: '有序列表',
    shortcut: '⌥⌘O',
    keywords: ['ol', 'ordered', 'youxuliebiao', 'yxlb', 'youxu', 'yx', 'liebiao'],
    description: '1. 编号列表',
    insertText: '1. ',
  },
  {
    id: 'ul',
    label: '无序列表',
    shortcut: '⌥⌘U',
    keywords: ['ul', 'unordered', 'wuxuliebiao', 'wxlb', 'wuxu', 'wx', 'liebiao'],
    description: '- 项目符号列表',
    insertText: '- ',
  },
  {
    id: 'task',
    label: '任务列表',
    shortcut: '⌥⌘X',
    keywords: ['task', 'todo', 'checkbox', 'renwuliebiao', 'rwlb', 'renwu', 'rw'],
    description: '- [ ] 待办事项',
    insertText: '- [ ] ',
  },
  {
    id: 'hr',
    label: '分割线',
    keywords: ['hr', 'divider', 'fengexian', 'fgx', 'fenge'],
    description: '--- 水平分隔线',
    insertText: '\n---\n',
  },
];

export function filterSlashCommands(query: string): SlashCommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((item) => {
    if (item.label.toLowerCase().includes(q)) return true;
    return item.keywords.some((kw) => kw.includes(q));
  });
}
