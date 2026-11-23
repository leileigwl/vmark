import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recoveredName, restoreBackup, restoreBackups, type Backup } from '../src/main/editorRecoveryRestore.ts';

/** 冒烟测试 @smoke（数据完整性 C2 的单元层）：崩溃备份启动时放回，但绝不覆盖期间被别人改过的文件。 */
function setup(disk: string | null): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-recovery-'));
  const file = path.join(dir, 'a.md');
  if (disk !== null) fs.writeFileSync(file, disk, 'utf-8');
  return { dir, file };
}

function backup(file: string, base: string, content: string): Backup {
  return { path: file, base, content, savedAt: new Date(2026, 10, 24, 2, 15, 30).getTime() };
}

test('restoreBackup：文件自备份后没变 → 写回备份里的未保存内容', () => {
  const { dir, file } = setup('原文\n');
  assert.equal(restoreBackup(backup(file, '原文\n', '原文崩溃前的字\n')), 'restored');
  assert.equal(fs.readFileSync(file, 'utf-8'), '原文崩溃前的字\n');
  assert.deepEqual(fs.readdirSync(dir), ['a.md']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('restoreBackup：文件期间被外部改过 → 原文件不动，备份另存为 .recovered-*.md', () => {
  const { dir, file } = setup('别人改过的\n');
  assert.equal(restoreBackup(backup(file, '原文\n', '原文崩溃前的字\n')), 'copied');
  assert.equal(fs.readFileSync(file, 'utf-8'), '别人改过的\n');
  const copy = path.join(dir, 'a.recovered-20261124-021530.md');
  assert.equal(fs.readFileSync(copy, 'utf-8'), '原文崩溃前的字\n');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('restoreBackup：文件已经是备份内容 → 什么都不写', () => {
  const { dir, file } = setup('原文崩溃前的字\n');
  assert.equal(restoreBackup(backup(file, '原文\n', '原文崩溃前的字\n')), 'already-saved');
  assert.deepEqual(fs.readdirSync(dir), ['a.md']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('restoreBackups：处理完删除备份；所在文件夹不存在时保留备份，坏备份也保留', () => {
  const { dir, file } = setup('原文\n');
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-recovery-store-'));
  fs.writeFileSync(path.join(store, 'ok.json'), JSON.stringify(backup(file, '原文\n', '原文新\n')));
  fs.writeFileSync(path.join(store, 'gone.json'), JSON.stringify(backup('/nonexistent-vmark/x.md', 'a', 'b')));
  fs.writeFileSync(path.join(store, 'bad.json'), '{not json');
  restoreBackups(store);
  assert.equal(fs.readFileSync(file, 'utf-8'), '原文新\n');
  assert.deepEqual(fs.readdirSync(store).sort(), ['bad.json', 'gone.json']);
  restoreBackups(path.join(store, 'missing'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(store, { recursive: true, force: true });
});

test('recoveredName：保留 .md 扩展名，没有扩展名也加上', () => {
  const t = new Date(2026, 0, 2, 3, 4, 5).getTime();
  assert.equal(recoveredName('/w/笔记.md', t), '/w/笔记.recovered-20260102-030405.md');
  assert.equal(recoveredName('/w/README', t), '/w/README.recovered-20260102-030405.md');
});
