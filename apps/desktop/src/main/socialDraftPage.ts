/**
 * 小红书 / 抖音图文发布页的 DOM 自动化（不依赖 Electron，主进程与 E2E 夹具共用）。
 * 平台页面会改版，所以每一步都给多候选选择器，失败时报错里列出尝试过的全部选择器。
 * 选择器来源与核对情况见 docs/99-archive/2026-11-24/platform-rules-todo.md「小红书 / 抖音图文」一节（待办见 docs/TODO.md）。
 */

/** 页面驱动：主进程用 BrowserWindow 实现，测试用 Playwright Page 实现。 */
export interface DraftPage {
  eval<T>(script: string): Promise<T>;
  /** 给匹配 selector 的第一个 input[type=file] 设置文件（CDP DOM.setFileInputFiles / Playwright setInputFiles）。 */
  setFiles(selector: string, files: string[]): Promise<void>;
  sleep(ms: number): Promise<void>;
  /** 页面内文字搜不到时的兜底点击（如小红书「暂存离开」在闭合 shadow DOM 里），可选。 */
  clickTextFallback?(text: string): Promise<boolean>;
}

export interface SocialDraftSpec {
  name: string;
  /** 进入图文模式要点的 tab 文案（已在图文模式则跳过）。 */
  imageTabTexts: string[];
  /** 首次上传的文件 input。 */
  entryInputs: string[];
  /** 编辑页里追加图片的文件 input（小红书首图后入口 input 会消失）。 */
  appendInputs: string[];
  /** 已上传图片的缩略图（用来确认每张都传上了）。 */
  thumbnails: string[];
  titleInputs: string[];
  bodyEditors: string[];
  draftButtonTexts: string[];
  titleMax: number;
  bodyMax: number;
}

export const XHS_DRAFT_SPEC: SocialDraftSpec = {
  name: '小红书',
  imageTabTexts: ['上传图文'],
  entryInputs: ['input.upload-input', 'div[class^="upload-content"] input[type="file"]', 'input[type="file"][accept*="image"]', 'input[type="file"][accept*=".jpg"]'],
  appendInputs: ['.img-upload-area input[type="file"]', '.img-preview-area input[type="file"]', 'input[type="file"][accept*="image"]', 'input[type="file"][accept*=".jpg"]', 'input[type="file"]'],
  thumbnails: ['.img-preview-area .pr', '.img-preview-area .img-container', '[class*="img-preview"] img'],
  titleInputs: ['input[placeholder*="填写标题"]', 'div.d-input input', 'input.d-text', 'input[placeholder*="标题"]'],
  bodyEditors: ['.tiptap.ProseMirror[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]', '[contenteditable="true"]'],
  draftButtonTexts: ['暂存离开', '存草稿'],
  titleMax: 20,
  bodyMax: 1000,
};

export const DOUYIN_DRAFT_SPEC: SocialDraftSpec = {
  name: '抖音',
  imageTabTexts: ['发布图文', '上传图文'],
  entryInputs: ['div[class^="container"] input[accept*="image"]', 'input[type="file"][accept*="image"]', 'input[type="file"]'],
  appendInputs: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
  thumbnails: [
    '[class^="container-"] [class^="img-"] > img',
    'div[class^="img-"] > img',
    '[class*="img-container"] img',
    '[class*="image-item"] img',
    '[class*="imgList"] img',
    '[class*="img-list"] img',
  ],
  titleInputs: ['input[placeholder*="填写作品标题"]', 'input[placeholder*="添加作品标题"]', 'input[placeholder*="作品标题"]'],
  bodyEditors: ['div.zone-container[contenteditable="true"]', '.editor-kit-container[contenteditable="true"]', '[contenteditable="true"]'],
  draftButtonTexts: ['暂存离开', '存草稿', '保存草稿'],
  titleMax: 20,
  bodyMax: 1000,
};

const MARK = 'data-vmark-target';
const js = (v: unknown) => JSON.stringify(v);

/** 页面内：找第一个存在的选择器，并给命中的元素打标记（随后用 [data-vmark-target] 精确操作它）。 */
function markFirstScript(candidates: string[], mark: string): string {
  return `((cands, mark) => {
    document.querySelectorAll('[${MARK}="' + mark + '"]').forEach(el => el.removeAttribute('${MARK}'));
    for (const sel of cands) {
      const all = Array.from(document.querySelectorAll(sel));
      const el = all.find(e => e.offsetParent !== null || e.type === 'file') ;
      if (el) { el.setAttribute('${MARK}', mark); return { selector: sel, multiple: !!el.multiple }; }
    }
    return null;
  })(${js(candidates)}, ${js(mark)})`;
}

/** 页面内：按可见文字点击（含开放 shadow root）；多个命中时点最后一个（小红书顶栏有重复 tab）。 */
export function clickTextScript(texts: string[]): string {
  return `((texts) => {
    const out = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('button, [role="button"], [role="tab"], div, span, a')) {
        if (el.shadowRoot) walk(el.shadowRoot);
        const t = (el.innerText || el.textContent || '').trim();
        if (texts.includes(t) && el.offsetParent !== null) out.push(el);
      }
    };
    walk(document);
    const target = out.filter(el => !out.some(o => o !== el && el.contains(o))).pop();
    if (!target) return false;
    target.click();
    return true;
  })(${js(texts)})`;
}

function countScript(candidates: string[]): string {
  return `((cands) => {
    for (const sel of cands) { const n = document.querySelectorAll(sel).length; if (n) return n; }
    return -1;
  })(${js(candidates)})`;
}

/** 页面内：填标题（原生 setter + input/change 事件，React 受控组件才认），返回回读值。 */
function fillTitleScript(candidates: string[], title: string): string {
  return `((cands, title) => {
    const el = cands.map(s => document.querySelector(s)).find(Boolean);
    if (!el) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    el.focus();
    if (setter) setter.call(el, title); else el.value = title;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })(${js(candidates)}, ${js(title)})`;
}

/** 页面内：清空正文编辑器后填入完整文本。Slate 编辑器用 paste 事件保留多行，常规富文本用逐段 execCommand。 */
function fillBodyScript(candidates: string[], text: string): string {
  return `((cands, text) => {
    const el = cands.map(s => document.querySelector(s)).find(Boolean);
    if (!el) return null;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    if (el.getAttribute('data-slate-editor') === 'true') {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return { isSlate: true, text: el.innerText };
    }
    document.execCommand('delete', false);
    text.split('\\n').forEach((line, i) => {
      if (i > 0) document.execCommand('insertParagraph', false);
      if (line) document.execCommand('insertText', false, line);
    });
    return { isSlate: false, text: el.innerText };
  })(${js(candidates)}, ${js(text)})`;
}

function readBodyScript(candidates: string[]): string {
  return `((cands) => {
    const el = cands.map(s => document.querySelector(s)).find(Boolean);
    return el ? el.innerText : '';
  })(${js(candidates)})`;
}

function isDraftSavedScript(titleInputs: string[]): string {
  return `((titleCands) => {
    const hasVisibleTitle = titleCands.some((s) => {
      const el = document.querySelector(s);
      return Boolean(el && el.offsetParent !== null);
    });
    if (!hasVisibleTitle) return true;
    const text = document.body.innerText || '';
    return /保存成功|暂存成功|已暂存|已保存草稿|草稿已保存/.test(text);
  })(${js(titleInputs)})`;
}

/** 关掉正文末端 #话题 触发的 Tippy/提及联想浮层，避免遮挡底部「暂存离开」按钮。 */
function dismissEditorPopoverScript(bodyEditors: string[]): string {
  return `((cands) => {
    const el = cands.map(s => document.querySelector(s)).find(Boolean);
    const esc = (type) => new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
    if (el) {
      el.dispatchEvent(esc('keydown'));
      el.dispatchEvent(esc('keyup'));
      if (typeof el.blur === 'function') el.blur();
    }
    document.dispatchEvent(esc('keydown'));
    document.dispatchEvent(esc('keyup'));
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') active.blur();
    window.getSelection()?.removeAllRanges();
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      document.body.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
    }
    return true;
  })(${js(bodyEditors)})`;
}

async function poll<T>(page: DraftPage, fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs: number, stepMs = 400): Promise<T> {
  let v = await fn();
  for (let waited = 0; !ok(v) && waited < timeoutMs; waited += stepMs) {
    await page.sleep(stepMs);
    v = await fn();
  }
  return v;
}

const tried = (label: string, list: string[]) => `${label}（尝试过：${list.join(' | ')}）`;

export interface SocialDraftInput {
  files: string[];
  title: string;
  /** 纯文本正文（已去 markdown 标记），按行填入。 */
  body: string;
  tags?: string[];
  /** 单张图片等待上传完成的超时。 */
  perImageTimeoutMs?: number;
  /** 点击存草稿后等待页面确认保存完成的超时。 */
  saveConfirmTimeoutMs?: number;
}

export interface SocialDraftOutcome {
  uploaded: number;
  /** 无法从页面确认的事项（如缩略图选择器全部不匹配），写进结果提示让用户核对。 */
  warnings: string[];
}

/** 图文草稿完整流程：切图文 tab → 上传全部图片并逐张确认 → 填标题/正文/话题 → 点存草稿。 */
export async function runSocialDraftFlow(page: DraftPage, spec: SocialDraftSpec, input: SocialDraftInput): Promise<SocialDraftOutcome> {
  const warnings: string[] = [];
  const perImage = input.perImageTimeoutMs ?? 20_000;
  if (input.files.length === 0) throw new Error(`${spec.name}没有要上传的图片`);

  const entry = await poll(page, async () => {
    const hit = await page.eval<{ selector: string; multiple: boolean } | null>(markFirstScript(spec.entryInputs, 'entry'));
    if (!hit) await page.eval<boolean>(clickTextScript(spec.imageTabTexts));
    return hit;
  }, Boolean, 12_000);
  if (!entry) throw new Error(tried(`未找到${spec.name}图片上传区域`, spec.entryInputs));

  const count = () => page.eval<number>(countScript(spec.thumbnails));
  const waitFor = async (n: number) => {
    const got = await poll(page, count, (c) => c >= n, perImage);
    if (got >= 0 && got < n) throw new Error(`${spec.name}第 ${got + 1} 张图片上传超时（已确认 ${got}/${input.files.length} 张）`);
    return got;
  };

  // 入口 input 支持多选就一次传完；否则先传第 1 张，进入编辑页后逐张追加（顺序即笔记顺序，第 1 张为封面）。
  const first = entry.multiple ? input.files : input.files.slice(0, 1);
  await page.setFiles(`[${MARK}="entry"]`, first);
  const titleReady = await poll(page, () => page.eval<boolean>(`Boolean(${js(spec.titleInputs)}.map(s => document.querySelector(s)).find(Boolean))`), Boolean, 30_000);
  if (!titleReady) throw new Error(tried(`${spec.name}图片上传后未进入编辑页（标题框未出现）`, spec.titleInputs));
  let confirmed = await waitFor(first.length);

  for (let i = first.length; i < input.files.length; i++) {
    const hit = await page.eval<{ selector: string; multiple: boolean } | null>(markFirstScript(spec.appendInputs, 'append'));
    if (!hit) throw new Error(tried(`未找到${spec.name}追加图片的上传控件（已上传 ${i} 张）`, spec.appendInputs));
    const batch = hit.multiple ? input.files.slice(i) : [input.files[i]];
    await page.setFiles(`[${MARK}="append"]`, batch);
    i += batch.length - 1;
    confirmed = await waitFor(i + 1);
  }
  if (confirmed < 0) warnings.push(tried(`未能从页面确认已上传张数，请在草稿里核对是否 ${input.files.length} 张`, spec.thumbnails));

  const title = [...input.title.trim()].slice(0, spec.titleMax).join('');
  const titleBack = await page.eval<string | null>(fillTitleScript(spec.titleInputs, title));
  if (titleBack === null) throw new Error(tried(`未找到${spec.name}标题输入框`, spec.titleInputs));

  const tagLine = (input.tags ?? []).filter(Boolean).map((t) => `#${t.replace(/\s+/g, '')}`).join(' ');
  const text = [...[input.body.trim(), tagLine].filter(Boolean).join('\n\n')].slice(0, spec.bodyMax).join('');
  const fillRes = await page.eval<{ isSlate: boolean; text: string } | null>(fillBodyScript(spec.bodyEditors, text));
  if (fillRes === null) throw new Error(tried(`未找到${spec.name}正文编辑器`, spec.bodyEditors));
  if (fillRes.isSlate) await page.sleep(500);
  const rawBodyBack = fillRes.isSlate ? await page.eval<string>(readBodyScript(spec.bodyEditors)) : fillRes.text;
  const bodyBack = rawBodyBack.replace(/\u200b/g, '');
  const nonEmptyLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLine = nonEmptyLines[0] ?? '';
  const lastLine = nonEmptyLines[nonEmptyLines.length - 1] ?? '';
  if ((firstLine && !bodyBack.includes(firstLine.slice(0, 10))) || (lastLine && !bodyBack.includes(lastLine.slice(0, 10)))) {
    warnings.push(`${spec.name}正文可能未完整填入，请在草稿里核对`);
  }

  await page.eval<boolean>(dismissEditorPopoverScript(spec.bodyEditors));
  await page.sleep(250);
  await page.sleep(800);
  const saveTimeout = input.saveConfirmTimeoutMs ?? 20_000;
  let waited = 0;
  let everClicked = false;
  let saveConfirmed = false;
  while (waited < saveTimeout && !saveConfirmed) {
    if (everClicked) {
      await page.eval<boolean>(dismissEditorPopoverScript(spec.bodyEditors));
      await page.sleep(200);
    }
    let clicked = await page.eval<boolean>(clickTextScript(spec.draftButtonTexts));
    for (const t of spec.draftButtonTexts) if (!clicked && page.clickTextFallback) clicked = await page.clickTextFallback(t);
    if (!clicked) {
      await page.sleep(400);
      waited += 400;
      continue;
    }
    everClicked = true;
    for (let confirmWait = 0; confirmWait < 2400 && waited < saveTimeout; confirmWait += 300) {
      await page.sleep(300);
      waited += 300;
      saveConfirmed = await page.eval<boolean>(isDraftSavedScript(spec.titleInputs));
      if (saveConfirmed) break;
    }
  }
  if (!everClicked) throw new Error(`未找到${spec.name}存草稿按钮（尝试过：${spec.draftButtonTexts.join(' | ')}）`);
  if (!saveConfirmed) throw new Error(`点击${spec.name}存草稿后未检测到保存成功信号，请检查页面提示`);
  return { uploaded: confirmed < 0 ? input.files.length : confirmed, warnings };
}
