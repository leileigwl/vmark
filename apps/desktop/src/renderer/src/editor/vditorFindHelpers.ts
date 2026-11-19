export interface FindOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

function buildFindRegex(findStr: string, opts?: FindOptions): RegExp | null {
  try {
    const flags = opts?.caseSensitive ? 'g' : 'gi';
    const escaped = opts?.regex ? findStr : findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = opts?.wholeWord ? `\\b${escaped}\\b` : escaped;
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function collectFindRanges(resetEl: Element, findStr: string, opts?: FindOptions): Range[] {
  const re = buildFindRegex(findStr, opts);
  if (!re) return [];

  const walker = document.createTreeWalker(resetEl, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];
  let curr = walker.nextNode() as Text | null;
  while (curr) {
    const val = curr.nodeValue || '';
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(val)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const r = document.createRange();
      r.setStart(curr, m.index);
      r.setEnd(curr, m.index + m[0].length);
      ranges.push(r);
    }
    curr = walker.nextNode() as Text | null;
  }
  return ranges;
}

export function clearFindHighlightsInDoc(): void {
  (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights?.delete('vcat-find');
}

export function findMatchesInEl(el: HTMLElement | null, findStr: string, opts?: FindOptions): number {
  if (!el || !findStr) {
    clearFindHighlightsInDoc();
    return 0;
  }
  const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');
  if (!resetEl) return 0;

  const ranges = collectFindRanges(resetEl, findStr, opts);
  const cssApi = globalThis as unknown as {
    CSS?: { highlights?: Map<string, unknown> };
    Highlight?: new (...ranges: Range[]) => unknown;
  };
  if (cssApi.CSS?.highlights && cssApi.Highlight) {
    if (ranges.length > 0) {
      cssApi.CSS.highlights.set('vcat-find', new cssApi.Highlight(...ranges));
    } else {
      cssApi.CSS.highlights.delete('vcat-find');
    }
  }
  return ranges.length;
}

export function jumpToMatchInEl(
  el: HTMLElement | null,
  findStr: string,
  targetIndex: number,
  opts?: FindOptions
): number {
  if (!el || !findStr) return 0;
  findMatchesInEl(el, findStr, opts);
  const resetEl = el.querySelector('.vditor-ir .vditor-reset') ?? el.querySelector('.vditor-reset');
  if (!resetEl) return 0;

  const ranges = collectFindRanges(resetEl, findStr, opts);
  if (ranges.length === 0) return 0;

  const safeIdx = ((targetIndex % ranges.length) + ranges.length) % ranges.length;
  const hitRange = ranges[safeIdx];
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(hitRange);
  const parentEl =
    hitRange.startContainer instanceof Element
      ? hitRange.startContainer
      : hitRange.startContainer.parentElement;
  parentEl?.scrollIntoView({ behavior: 'auto', block: 'center' });
  return ranges.length;
}
