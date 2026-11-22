import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveCardImageSources } from '../src/main/socialCardImageBase.ts';
import { resolveSocialUploadImages, type CardRasterizer } from '../src/main/socialUploadImages.ts';

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-card-imgbase-'));
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(dir, 'assets', 'body.png'), 'body');
  return dir;
}

function firstImageSrc(markdown: string): string {
  const m = markdown.match(/!\[[^\]]*\]\(([^)\s]+)/);
  assert.ok(m, `markdown 里没有图片: ${markdown}`);
  return m[1];
}

test('发布时把工作区目录作为 imageBaseDir 传给卡片光栅化，正文相对路径图片能解析到真实文件', async () => {
  const ws = await makeWorkspace();
  const seen: Array<string | undefined> = [];
  const rasterize: CardRasterizer = async (p) => {
    seen.push(p.imageBaseDir);
    return { imagePaths: ['/tmp/card_1.png'] };
  };
  await resolveSocialUploadImages(
    { workspacePath: ws, markdown: '# 标题\n\n![配图](./assets/body.png)\n', themeId: 'ios-memo', maxCards: 18 },
    rasterize
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0], path.resolve(ws));

  const resolved = firstImageSrc(resolveCardImageSources('![配图](./assets/body.png)', seen[0]));
  assert.equal(await fs.readFile(fileURLToPath(resolved), 'utf8'), 'body');
});

test('没有工作区时不传 imageBaseDir', async () => {
  const seen: Array<string | undefined> = [];
  const rasterize: CardRasterizer = async (p) => {
    seen.push(p.imageBaseDir);
    return { imagePaths: ['/tmp/card_1.png'] };
  };
  await resolveSocialUploadImages({ workspacePath: null, markdown: '# 标题\n正文', themeId: 'ios-memo', maxCards: 18 }, rasterize);
  assert.deepEqual(seen, [undefined]);
});

test('相对路径解析为 file:// 地址；越界、绝对路径、网络图片保持原样', async () => {
  const ws = await makeWorkspace();
  const base = path.resolve(ws);
  const md = [
    '![a](./assets/body.png)',
    '![b](assets/%E9%85%8D%E5%9B%BE.png "标题")',
    '![c](../outside.png)',
    '![d](assets/../../outside.png)',
    '![e](/etc/passwd)',
    '![f](https://example.com/x.png)',
    '![g](data:image/png;base64,AAAA)',
  ].join('\n');
  const out = resolveCardImageSources(md, base).split('\n');
  assert.equal(out[0], `![a](${pathToFileURL(path.join(base, 'assets', 'body.png')).href})`);
  assert.equal(out[1], `![b](${pathToFileURL(path.join(base, 'assets', '配图.png')).href} "标题")`);
  assert.equal(out[2], '![c](../outside.png)');
  assert.equal(out[3], '![d](assets/../../outside.png)');
  assert.equal(out[4], '![e](/etc/passwd)');
  assert.equal(out[5], '![f](https://example.com/x.png)');
  assert.equal(out[6], '![g](data:image/png;base64,AAAA)');
});

test('没有 imageBaseDir 时 markdown 原样返回', () => {
  const md = '![a](./assets/body.png)';
  assert.equal(resolveCardImageSources(md, undefined), md);
});
