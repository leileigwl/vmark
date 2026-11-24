import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeFileAtomic } from '../src/main/ipc/article/atomicWrite.ts';

/** 冒烟测试 @smoke（数据完整性 C3 的单元层）：保存要么完整写入，要么原文件一个字节都不变。 */
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-atomic-'));
}

test('writeFileAtomic：正常保存写入新内容，不留下临时文件，保留文件权限', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'a.md');
  fs.writeFileSync(file, '旧内容\n');
  fs.chmodSync(file, 0o640);
  await writeFileAtomic(file, '新内容\n');
  assert.equal(fs.readFileSync(file, 'utf8'), '新内容\n');
  assert.equal(fs.statSync(file).mode & 0o777, 0o640);
  assert.deepEqual(fs.readdirSync(dir), ['a.md']);
});

test('writeFileAtomic：磁盘写满（写到一半 ENOSPC）时原文件完好，临时文件被清掉', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'a.md');
  fs.writeFileSync(file, '这一段绝对不能丢。\n');
  const real = fsp.writeFile;
  (fsp as { writeFile: unknown }).writeFile = async (target: string, data: string) => {
    fs.writeFileSync(target, String(data).slice(0, 2));
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
  };
  try {
    await assert.rejects(writeFileAtomic(file, '新的很长的内容\n'), /ENOSPC/);
  } finally {
    (fsp as { writeFile: unknown }).writeFile = real;
  }
  assert.equal(fs.readFileSync(file, 'utf8'), '这一段绝对不能丢。\n');
  assert.deepEqual(fs.readdirSync(dir), ['a.md']);
});

// 以非 root 用户运行（root 不受文件权限位限制）。
test('writeFileAtomic：只读文件拒绝保存（EACCES），不会用 rename 绕过权限', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'a.md');
  fs.writeFileSync(file, '只读\n');
  fs.chmodSync(file, 0o444);
  await assert.rejects(writeFileAtomic(file, '改了\n'), /EACCES/);
  assert.equal(fs.readFileSync(file, 'utf8'), '只读\n');
  assert.deepEqual(fs.readdirSync(dir), ['a.md']);
});

test('writeFileAtomic：软链接保持是软链接，更新的是它指向的真实文件', async () => {
  const dir = tmpDir();
  const realFile = path.join(dir, 'real.md');
  const link = path.join(dir, 'link.md');
  fs.writeFileSync(realFile, '旧\n');
  fs.symlinkSync(realFile, link);
  await writeFileAtomic(link, '新\n');
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(realFile, 'utf8'), '新\n');
});

test('writeFileAtomic：新文件（尚不存在）也能写入', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'new.md');
  await writeFileAtomic(file, '第一次保存\n');
  assert.equal(fs.readFileSync(file, 'utf8'), '第一次保存\n');
});
