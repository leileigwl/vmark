import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';

interface MathToken {
  key: string;
  tex: string;
  displayMode: boolean;
}

async function resolveKatexDir(): Promise<string> {
  const candidates = [
    process.env.VMARK_KATEX_DIR || '',
    path.join(app.getAppPath(), 'src/renderer/public/vditor/dist/js/katex'),
    path.join(app.getAppPath(), 'out/renderer/vditor/dist/js/katex'),
    path.join(__dirname, '../../src/renderer/public/vditor/dist/js/katex'),
    path.join(__dirname, '../../out/renderer/vditor/dist/js/katex'),
    path.join(process.cwd(), 'apps/desktop/src/renderer/public/vditor/dist/js/katex'),
    path.join(process.cwd(), 'vmark/apps/desktop/src/renderer/public/vditor/dist/js/katex'),
    path.join(process.cwd(), 'node_modules/vditor/dist/js/katex'),
    path.join(process.cwd(), 'vmark/node_modules/vditor/dist/js/katex'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, 'katex.min.js'));
      return dir;
    } catch {
      // try next candidate
    }
  }
  throw new Error('未找到本地 KaTeX 资源目录');
}

async function renderLatexBatchToPng(items: MathToken[]): Promise<Map<string, Buffer>> {
  const katexDir = await resolveKatexDir();
  const katexCssPath = path.join(katexDir, 'katex.min.css');
  const katexJsPath = path.join(katexDir, 'katex.min.js');
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="file://${katexCssPath}" />
<style>
  html, body { margin: 0; padding: 16px; background: #ffffff; color: #111111; }
  .item { display: inline-block; padding: 2px 5px; background: #ffffff; font-size: 15px; line-height: 1.3; margin: 10px; }
  .item.block { display: table; font-size: 17px; padding: 6px 10px; }
</style>
<script src="file://${katexJsPath}"></script>
</head>
<body>
<div id="root"></div>
<script>
  window.renderAll = function(list) {
    const root = document.getElementById('root');
    const rects = [];
    for (let i = 0; i < list.length; i++) {
      const el = document.createElement('div');
      el.className = 'item' + (list[i].displayMode ? ' block' : '');
      try {
        window.katex.render(list[i].tex, el, { displayMode: list[i].displayMode, throwOnError: false });
      } catch (e) {
        el.textContent = list[i].tex;
      }
      root.appendChild(el);
      const r = el.getBoundingClientRect();
      rects.push({
        key: list[i].key,
        x: Math.max(0, Math.floor(r.left)),
        y: Math.max(0, Math.floor(r.top)),
        width: Math.max(10, Math.ceil(r.width) + 10),
        height: Math.max(10, Math.ceil(r.height) + 4),
      });
    }
    return rects;
  };
</script>
</body>
</html>`;

  const win = new BrowserWindow({
    width: 1000,
    height: 1400,
    show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false, webSecurity: false },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const rects = (await win.webContents.executeJavaScript(
      `window.renderAll(${JSON.stringify(items)})`
    )) as Array<{ key: string; x: number; y: number; width: number; height: number }>;

    // Allow KaTeX webfonts to finish layout
    await new Promise((r) => setTimeout(r, 250));
    const pngMap = new Map<string, Buffer>();
    for (const r of rects) {
      const img = await win.webContents.capturePage({
        x: r.x,
        y: r.y,
        width: Math.min(r.width, 980),
        height: Math.min(r.height, 1380),
      });
      pngMap.set(r.key, img.toPNG());
    }
    return pngMap;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/**
 * Converts `$...$` and `$$...$$` expressions in Markdown into uploaded platform images
 * for editors (WeChat, Baijiahao, Bilibili, Weibo) that lack native LaTeX support.
 */
export async function rasterizeMarkdownLatexForPlatform(params: {
  markdown: string;
  uploadFn: (buffer: Buffer, fileName: string) => Promise<string>;
}): Promise<{ markdown: string; convertedCount: number }> {
  const { markdown, uploadFn } = params;
  const codeSlots: string[] = [];
  const holdCode = (raw: string): string => {
    const idx = codeSlots.length;
    codeSlots.push(raw);
    return `\u0000CODE_SLOT_${idx}\u0000`;
  };

  let work = markdown.replace(/(^|\n)(```|~~~)[\s\S]*?\n\2[^\n]*/g, (m) => holdCode(m));
  work = work.replace(/`[^`\n]+`/g, (m) => holdCode(m));

  const tokens = new Map<string, MathToken>();
  const register = (tex: string, displayMode: boolean): string => {
    const clean = tex.trim();
    const key = `${displayMode ? 'B' : 'I'}:${clean}`;
    if (!tokens.has(key)) {
      tokens.set(key, { key, tex: clean, displayMode });
    }
    return `\u0000MATH_SLOT_${key}\u0000`;
  };

  work = work.replace(/\$\$\s*([\s\S]+?)\s*\$\$/g, (_m, tex: string) => register(tex, true));
  work = work.replace(/(?<!\\)\$([^$\n]+?)\$/g, (m, tex: string) => {
    const trimmed = tex.trim();
    if (!trimmed || /^\d+(\.\d+)?$/.test(trimmed)) return m;
    return register(trimmed, false);
  });

  if (tokens.size === 0) {
    return { markdown, convertedCount: 0 };
  }

  const tokenList = Array.from(tokens.values());
  const pngMap = await renderLatexBatchToPng(tokenList);
  const urlMap = new Map<string, { url: string; displayMode: boolean }>();

  for (const tok of tokenList) {
    const buf = pngMap.get(tok.key);
    if (!buf) continue;
    const url = await uploadFn(buf, `latex-${tok.displayMode ? 'block' : 'inline'}.png`);
    urlMap.set(tok.key, { url, displayMode: tok.displayMode });
  }

  work = work.replace(/\u0000MATH_SLOT_([^\u0000]+)\u0000/g, (_m, key: string) => {
    const hit = urlMap.get(key);
    if (!hit) return '';
    return hit.displayMode ? `![vmark-latex-block](${hit.url})` : `![vmark-latex-inline](${hit.url})`;
  });

  work = work.replace(/\u0000CODE_SLOT_(\d+)\u0000/g, (_m, idx: string) => codeSlots[Number(idx)] ?? '');
  return { markdown: work, convertedCount: urlMap.size };
}
