import { expect, test, type Page } from '@playwright/test';
import { installMockWorkspace, openEditor } from './support/mockWorkspace';
import { saveAndRead } from './support/integrity';

async function open(page: Page, content: string) {
  await installMockWorkspace(page, { files: { 'a.md': content } });
  await openEditor(page);
}

async function selectAcrossText(
  page: Page,
  startNeedle: string,
  startAtEnd: boolean,
  endNeedle: string,
  endAtEnd: boolean
) {
  const ok = await page.evaluate(
    ({ sn, se, en, ee }) => {
      const root = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
      root.focus();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let startNode: Node | null = null;
      let startOffset = 0;
      let endNode: Node | null = null;
      let endOffset = 0;
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const val = n.nodeValue ?? '';
        if (!startNode) {
          const i = val.indexOf(sn);
          if (i >= 0) {
            startNode = n;
            startOffset = se ? i + sn.length : i;
          }
        }
        const j = val.indexOf(en);
        if (j >= 0) {
          endNode = n;
          endOffset = ee ? j + en.length : j;
        }
      }
      if (!startNode || !endNode) return false;
      const r = document.createRange();
      r.setStart(startNode, startOffset);
      r.setEnd(endNode, endOffset);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      return true;
    },
    { sn: startNeedle, se: startAtEnd, en: endNeedle, ee: endAtEnd }
  );
  if (!ok) throw new Error(`selectAcrossText failed: ${startNeedle} -> ${endNeedle}`);
}

test.describe('跨行内格式节点选区删除：不破坏 ** / ` 等成对标记', () => {
  test('从加粗中间跨段拖选到列表后按 Backspace：保留前半段加粗且不残留孤立 **', async ({ page }) => {
    const doc = [
      '**1. 先搞定一个人开发时的极简结构（镜 4，loop.png）**',
      '',
      '第二段文字',
      '',
      '1. 第一步',
      '2. 删掉这个用完的分支，回到第 1 步',
      '',
    ].join('\n');
    await open(page, doc);

    await selectAcrossText(page, '开发', true, '第一步', true);
    await page.keyboard.press('Backspace');

    const saved = await saveAndRead(page);
    expect(saved).toContain('**1. 先搞定一个人开发**');
    expect(saved).not.toContain('极简结构');
    expect(saved).not.toContain('第二段文字');
    expect(saved).not.toContain('\\*\\*');
    expect(saved).toContain('删掉这个用完的分支，回到第 1 步');
  });

  test('从行内代码 `dev` 末尾跨出选区按 Backspace：不删除闭合反引号导致后续反引号全部错乱', async ({ page }) => {
    const doc =
      '改完先合到 `dev` 里联调、审查，再从 `dev` 提 PR。\n\n顺便聊一个 `test` 分支怎么用，不一定要单独建个 `test` 分支，跟 `dev`、`main` 一样留着。\n';
    await open(page, doc);

    // 起点落在第一个 `dev` 的内部末尾（闭合反引号之前）
    await selectAcrossText(page, 'dev', true, '不一定要', true);
    await page.keyboard.press('Backspace');

    const saved = await saveAndRead(page);
    expect(saved).toBe('改完先合到 `dev`单独建个 `test` 分支，跟 `dev`、`main` 一样留着。\n');
  });

  test('选区从普通正文跨入行内代码中间按 Backspace：保留后半段行内代码格式', async ({ page }) => {
    const doc = '请删除这一段并保留 `alpha` 标记。\n';
    await open(page, doc);

    await selectAcrossText(page, '这一段', false, 'alp', true);
    await page.keyboard.press('Backspace');

    const saved = await saveAndRead(page);
    expect(saved).toBe('请删除`ha` 标记。\n');
  });
});
