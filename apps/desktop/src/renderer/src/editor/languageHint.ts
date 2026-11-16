const COMMON_CODE_LANGUAGES = [
  'c', 'cpp', 'csharp', 'css', 'csv', 'cmake', 'clojure', 'coffeescript',
  'python', 'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx',
  'json', 'latex', 'tex', 'math', 'mermaid', 'echarts', 'mindmap', 'flowchart', 'plantuml', 'graphviz',
  'yaml', 'yml', 'toml', 'ini', 'sql', 'bash', 'sh', 'shell', 'zsh', 'powershell',
  'html', 'xml', 'markdown', 'md', 'go', 'rust', 'java', 'kotlin', 'swift', 'ruby', 'php',
  'dockerfile', 'makefile', 'nginx', 'graphql', 'diff', 'text', 'plaintext', 'txt',
];

export function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export interface LanguageHintResult {
  activeMarker: HTMLElement | null;
}

/** Sorts code-block language autocomplete candidates by prefix match and positions `.vditor-hint` in viewport. */
export function positionAndSortLanguageHint(
  el: HTMLElement,
  lastActiveInfoMarker: HTMLElement | null
): HTMLElement | null {
  const hintEl = el.querySelector('.vditor-hint') as HTMLElement | null;
  if (!hintEl || hintEl.style.display === 'none' || hintEl.childElementCount === 0) {
    return lastActiveInfoMarker;
  }
  const selNow = window.getSelection();
  const anchorEl =
    selNow?.anchorNode instanceof Element ? selNow.anchorNode : selNow?.anchorNode?.parentElement;
  const infoMarker =
    (anchorEl?.closest('.vditor-ir__marker--info') as HTMLElement | null) ??
    (document.activeElement?.closest?.('.vditor-ir__marker--info') as HTMLElement | null) ??
    (lastActiveInfoMarker && el.contains(lastActiveInfoMarker) ? lastActiveInfoMarker : null);
  if (!infoMarker || !el.contains(infoMarker)) return lastActiveInfoMarker;

  const curKey = (infoMarker.textContent || '').replace(/\u200b/g, '').trim().toLowerCase();
  if (curKey && (hintEl.dataset.vcatSortedFor !== curKey || !hintEl.querySelector('button[data-vcat-sorted]'))) {
    hintEl.dataset.vcatSortedFor = curKey;
    const existingVals = Array.from(hintEl.querySelectorAll('button')).map((b) =>
      safeDecode(b.getAttribute('data-value') || b.textContent || '').replace(/\u200b/g, '').trim()
    );
    const hljsLangs =
      (window as unknown as { hljs?: { listLanguages?: () => string[] } }).hljs?.listLanguages?.() ?? [];
    const seen = new Set<string>();
    const pool: string[] = [];
    for (const raw of [...COMMON_CODE_LANGUAGES, ...hljsLangs, ...existingVals]) {
      const v = raw.trim();
      if (!v) continue;
      const low = v.toLowerCase();
      if (!seen.has(low) && low.includes(curKey)) {
        seen.add(low);
        pool.push(v);
      }
    }
    pool.sort((a, b) => {
      const al = a.toLowerCase();
      const bl = b.toLowerCase();
      const aRank = al === curKey ? 0 : al.startsWith(curKey) ? 1 : 2;
      const bRank = bl === curKey ? 0 : bl.startsWith(curKey) ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      if (al.length !== bl.length) return al.length - bl.length;
      return al.localeCompare(bl);
    });
    const topLangs = pool.slice(0, 8);
    if (topLangs.length > 0) {
      hintEl.innerHTML = '';
      topLangs.forEach((lang, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-vcat-sorted', '1');
        btn.setAttribute('data-value', `${encodeURIComponent(lang)} `);
        if (idx === 0) btn.className = 'vditor-hint--current';
        const low = lang.toLowerCase();
        const matchPos = low.indexOf(curKey);
        btn.appendChild(document.createTextNode(' '));
        if (matchPos >= 0) {
          if (matchPos > 0) btn.appendChild(document.createTextNode(lang.slice(0, matchPos)));
          const bEl = document.createElement('b');
          bEl.textContent = lang.slice(matchPos, matchPos + curKey.length);
          btn.appendChild(bEl);
          if (matchPos + curKey.length < lang.length) {
            btn.appendChild(document.createTextNode(lang.slice(matchPos + curKey.length)));
          }
        } else {
          btn.appendChild(document.createTextNode(lang));
        }
        hintEl.appendChild(btn);
      });
    }
  } else if (!curKey) {
    delete hintEl.dataset.vcatSortedFor;
  }

  const infoRect = infoMarker.getBoundingClientRect();
  if (infoRect.width === 0 && infoRect.height === 0) return infoMarker;

  const hintH = hintEl.offsetHeight || 220;
  const spaceBelow = window.innerHeight - infoRect.bottom - 12;
  const topPx =
    spaceBelow >= Math.min(hintH, 140)
      ? Math.round(infoRect.bottom + 4)
      : Math.max(8, Math.round(infoRect.top - hintH - 4));
  const leftPx = Math.max(8, Math.round(infoRect.left));
  hintEl.style.position = 'fixed';
  hintEl.style.top = `${topPx}px`;
  hintEl.style.left = `${leftPx}px`;
  hintEl.style.marginTop = '0px';
  return infoMarker;
}
