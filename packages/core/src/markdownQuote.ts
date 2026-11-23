/** 引用块、围栏、GitHub callout 的公共解析工具（公众号渲染器与卡片解析器共用，保证两边行为一致）。 */

export type CalloutKind = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

/** callout 的中文标签（纯文本平台直接用作前缀，如「💡 技巧：」）。 */
export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  NOTE: 'ℹ️ 提示',
  TIP: '💡 技巧',
  IMPORTANT: '📌 重要',
  WARNING: '⚠️ 注意',
  CAUTION: '🚨 警告',
};

const FENCE_RE = /^(`{3,}|~{3,})(.*)$/;
const CALLOUT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(.*)$/i;

/**
 * 识别围栏行。编辑器会把引用里手敲的 ``` 存成 ``\`（转义最后一个反引号），
 * 这里先去掉反引号/波浪号之间的反斜杠再判断，避免渲染出残留的 ``\`。
 * 返回 marker（如 ```）和 info string；不是围栏返回 null。
 */
export function matchFence(trimmed: string): { marker: string; info: string } | null {
  const unescaped = trimmed.replace(/^((?:\\?[`~]){3,})/, (m) => m.replace(/\\/g, ''));
  const m = unescaped.match(FENCE_RE);
  if (!m) return null;
  // 反引号围栏的 info string 不能再含反引号（CommonMark），否则是行内代码。
  if (m[1][0] === '`' && m[2].includes('`')) return null;
  return { marker: m[1], info: m[2].trim() };
}

/** 是否是能关闭 marker 的围栏行（同字符、长度不少于开头，且后面没有别的内容）。 */
export function closesFence(trimmed: string, marker: string): boolean {
  const f = matchFence(trimmed);
  return !!f && f.marker[0] === marker[0] && f.marker.length >= marker.length && f.info === '';
}

/** 去掉一层引用前缀 `>`（保留更深层的 `>`，交给递归处理）。 */
export function stripQuoteLevel(line: string): string {
  return line.trim().replace(/^>[ \t]?/, '');
}

/** 从 lines[start] 起收集连续的引用行，返回去掉一层 `>` 后的内容与下一个未消费的行号。 */
export function takeQuoteRun(lines: string[], start: number): { inner: string[]; next: number } {
  const inner: string[] = [];
  let i = start;
  while (i < lines.length && lines[i].trim().startsWith('>')) inner.push(stripQuoteLevel(lines[i++]));
  return { inner, next: i };
}

/** 引用首行是 `[!TIP]` 之类时返回 callout 类型及首行剩余文字。 */
export function matchCallout(firstLine: string | undefined): { kind: CalloutKind; rest: string } | null {
  const m = firstLine?.trim().match(CALLOUT_RE);
  return m ? { kind: m[1].toUpperCase() as CalloutKind, rest: m[2].trim() } : null;
}
