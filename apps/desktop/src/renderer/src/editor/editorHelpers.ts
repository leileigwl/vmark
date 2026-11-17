export const PAIR_MAP: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '（': '）',
  '【': '】',
  '「': '」',
};

export function readClipboardImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read clipboard image'));
    reader.readAsDataURL(file);
  });
}

export interface PreviewBlockTarget {
  kind: 'mermaid' | 'math';
  previewPre: HTMLElement;
  irNode: HTMLElement;
}

export function getPreviewBlockTarget(target: HTMLElement | null): PreviewBlockTarget | null {
  if (!target) return null;
  if (target.closest('.vditor-ir__marker--info, .vditor-copy')) return null;
  const previewPre = target.closest('pre.vditor-ir__preview') as HTMLElement | null;
  if (!previewPre) return null;
  const irNode = previewPre.closest(
    '.vditor-ir__node[data-type="code-block"], .vditor-ir__node[data-type="math-block"]'
  ) as HTMLElement | null;
  if (!irNode || irNode.classList.contains('vditor-ir__node--expand')) return null;
  if (irNode.getAttribute('data-type') === 'math-block') {
    return { kind: 'math', previewPre, irNode };
  }
  const codeEl = irNode.querySelector('pre.vditor-ir__marker--pre > code, pre.vditor-ir__preview > code');
  const infoText = (irNode.querySelector('.vditor-ir__marker--info')?.textContent || '').replace(/\u200b/g, '').trim().toLowerCase();
  const match = codeEl?.className.match(/language-([^\s]+)/);
  const lang = infoText || match?.[1]?.toLowerCase() || '';
  if (lang === 'mermaid') {
    return { kind: 'mermaid', previewPre, irNode };
  }
  if (lang === 'latex' || lang === 'tex' || lang === 'math') {
    return { kind: 'math', previewPre, irNode };
  }
  return null;
}
