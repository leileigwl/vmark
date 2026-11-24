#!/usr/bin/env node
// 打包版 KaTeX 字体检查（package:* 脚本在 electron-builder 之后调用）：
//   node scripts/katex-fonts-check.mjs [releaseDir]   默认 apps/desktop/release
// 找出 releaseDir 里每个 app.asar，确认下面四处引用的 KaTeX 字体文件都打进去了，缺一个就退出码 1：
//   1. 卡片出图（main/socialCardMath.ts）：require('katex/dist/katex.min.css')，字体在同目录 fonts/
//   2. 编辑器（renderer index.css 打包出的 out/renderer/assets/*.css）
//   3. 发布弹窗卡片缩略图（katex.min.css?inline 打进 JS，字体写成 new URL("KaTeX_…", import.meta.url)）
//   4. Vditor 自带 KaTeX（out/renderer/vditor/dist/js/katex/，编辑器公式渲染、导出 docx 用）
// 字体缺失时 Chromium 会静默退回系统字体，公式排版错位，所以这里宁可让打包失败。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAsarFiles, readAsarFile } from './asar-read.mjs';

const CSS_FONT_URL = /url\(\s*(['"]?)([^'")]*KaTeX_[^'")]+?)\1\s*\)/g;
const JS_FONT_URL = /new URL\(\s*(['"])([^'"]*KaTeX_[^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g;

/** CSS 里引用的 KaTeX 字体相对路径（去重，保持出现顺序）。 */
export function katexFontUrls(css) {
  return [...new Set([...css.matchAll(CSS_FONT_URL)].map((m) => m[2].split(/[?#]/)[0]))];
}

/** JS 包里 `new URL("KaTeX_…", import.meta.url)` 引用的字体文件名。 */
function jsFontUrls(js) {
  return [...new Set([...js.matchAll(JS_FONT_URL)].map((m) => m[2]))];
}

/** 打开一个 app.asar：files 为 路径 -> 大小；unpacked 的文件从 app.asar.unpacked 读。 */
function openAsar(asarPath) {
  const files = new Map();
  const unpacked = new Set();
  for (const f of listAsarFiles(asarPath)) {
    files.set(f.path, f.size);
    if (f.unpacked) unpacked.add(f.path);
  }
  const read = (p) =>
    unpacked.has(p) ? readFileSync(join(`${asarPath}.unpacked`, p), 'utf8') : readAsarFile(asarPath, p).toString('utf8');
  return { files, read };
}

/** 把 CSS/JS 里的相对地址解析成 asar 内路径。 */
function resolveIn(baseDir, url) {
  return posix.normalize(posix.join(baseDir, url.replace(/^\.\//, '')));
}

/** 检查一组字体引用：每个都要存在且非空。 */
function checkRefs(app, label, baseDir, urls, errors) {
  if (urls.length === 0) {
    errors.push(`${label}：没有找到任何 KaTeX 字体引用（样式没打进去？）`);
    return;
  }
  for (const url of urls) {
    const p = resolveIn(baseDir, url);
    if (!app.files.has(p)) errors.push(`${label}：缺少字体 ${p}`);
    else if (!(app.files.get(p) > 0)) errors.push(`${label}：字体是空文件 ${p}`);
  }
}

/** 检查一个已打开的应用包，返回错误列表（空 = 通过）。 */
export function checkKatexFonts(app) {
  const errors = [];
  const fromCss = (label, cssPath) => {
    if (!app.files.has(cssPath)) errors.push(`${label}：缺少 ${cssPath}`);
    else checkRefs(app, label, posix.dirname(cssPath), katexFontUrls(app.read(cssPath)), errors);
  };

  fromCss('卡片出图（主进程 katex 包）', 'node_modules/katex/dist/katex.min.css');

  const assets = [...app.files.keys()].filter((p) => /^out\/renderer\/assets\/[^/]+$/.test(p));
  const editorRefs = assets
    .filter((p) => p.endsWith('.css'))
    .flatMap((p) => katexFontUrls(app.read(p)).map((u) => resolveIn(posix.dirname(p), u)));
  checkRefs(app, '编辑器（渲染进程 CSS）', '', [...new Set(editorRefs)], errors);

  const thumbRefs = assets
    .filter((p) => p.endsWith('.js'))
    .flatMap((p) => jsFontUrls(app.read(p)).map((u) => resolveIn(posix.dirname(p), u)));
  checkRefs(app, '发布弹窗卡片缩略图（渲染进程 JS）', '', [...new Set(thumbRefs)], errors);

  fromCss('Vditor 自带 KaTeX', 'out/renderer/vditor/dist/js/katex/katex.min.css');
  return errors;
}

/** 检查一个 app.asar 文件。 */
export function checkKatexFontsInAsar(asarPath) {
  return checkKatexFonts(openAsar(asarPath));
}

function findAsars(dir, depth = 0, out = []) {
  if (depth > 6 || !existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'app.asar') out.push(p);
    else if (!name.endsWith('.asar.unpacked') && statSync(p).isDirectory()) findAsars(p, depth + 1, out);
  }
  return out;
}

function main(argv) {
  const releaseDir = resolve(argv[0] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'release'));
  const asars = findAsars(releaseDir);
  if (asars.length === 0) {
    console.error(`[katex-fonts] ✗ ${releaseDir} 里找不到 app.asar（先打包）`);
    return 1;
  }
  let failed = 0;
  for (const asar of asars) {
    const errors = checkKatexFontsInAsar(asar);
    for (const e of errors) console.error(`[katex-fonts] ✗ ${asar}：${e}`);
    if (errors.length) failed += 1;
    else console.log(`[katex-fonts] ✓ ${asar}：编辑器、卡片出图、缩略图、Vditor 的 KaTeX 字体都在`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`[katex-fonts] ✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
