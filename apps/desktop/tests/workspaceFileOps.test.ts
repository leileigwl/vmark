import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  copyExternalItemsIntoWorkspace,
  extractOpenTargetFromArgv,
  parseFileUriList,
  parseMacPlistFilePaths,
  parseWindowsFileNameW,
  pickNonCollidingDest,
  resolveExternalOpenTarget,
} from '../src/main/workspaceFileOps.ts';

test('resolveExternalOpenTarget: opens inside-workspace file, switches workspace for outside file, switches for folder', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-open-'));
  const wsA = path.join(root, 'wsA');
  const wsB = path.join(root, 'wsB');
  await fs.mkdir(path.join(wsA, 'sub'), { recursive: true });
  await fs.mkdir(wsB, { recursive: true });
  const insideMd = path.join(wsA, 'sub', 'inside.md');
  const outsideMd = path.join(wsB, 'outside.markdown');
  const otherTxt = path.join(wsB, 'note.txt');
  await fs.writeFile(insideMd, '# Inside', 'utf-8');
  await fs.writeFile(outsideMd, '# Outside', 'utf-8');
  await fs.writeFile(otherTxt, 'plain text', 'utf-8');

  try {
    const rInside = await resolveExternalOpenTarget(wsA, insideMd);
    assert.equal(rInside.workspacePath, path.resolve(wsA));
    assert.equal(rInside.relativePath, 'sub/inside.md');

    const rOutside = await resolveExternalOpenTarget(wsA, outsideMd);
    assert.equal(rOutside.workspacePath, path.resolve(wsB));
    assert.equal(rOutside.relativePath, 'outside.markdown');

    const rDir = await resolveExternalOpenTarget(wsA, wsB);
    assert.equal(rDir.workspacePath, path.resolve(wsB));
    assert.equal(rDir.relativePath, null);

    await assert.rejects(() => resolveExternalOpenTarget(wsA, otherTxt), /Markdown/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('copyExternalItemsIntoWorkspace: copies files and folders with collision-free naming', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-copy-'));
  const ws = path.join(root, 'workspace');
  const srcDir = path.join(root, 'external');
  await fs.mkdir(path.join(ws, 'notes'), { recursive: true });
  await fs.mkdir(path.join(srcDir, 'pack'), { recursive: true });
  await fs.writeFile(path.join(ws, 'notes', 'post.md'), '# Existing', 'utf-8');
  const extFile = path.join(srcDir, 'post.md');
  const extNested = path.join(srcDir, 'pack', 'chapter.md');
  await fs.writeFile(extFile, '# Imported Post', 'utf-8');
  await fs.writeFile(extNested, '# Chapter One', 'utf-8');

  try {
    const res1 = await copyExternalItemsIntoWorkspace(ws, [extFile, path.join(srcDir, 'pack')], 'notes');
    assert.equal(res1.importedArticles.length, 2);
    assert.ok(res1.importedArticles.some((a) => a.relativePath === 'notes/post 2.md'));
    assert.ok(res1.importedArticles.some((a) => a.relativePath === 'notes/pack/chapter.md'));
    assert.deepEqual(res1.importedFolders, ['notes/pack']);

    // Self-copy protection: copying workspace/notes into workspace/notes is skipped safely
    const resSelf = await copyExternalItemsIntoWorkspace(ws, [path.join(ws, 'notes')], 'notes');
    assert.equal(resSelf.importedFolders.length, 0);
    assert.deepEqual(resSelf.skipped, ['notes']);

    const nonCollide = pickNonCollidingDest(path.join(ws, 'notes'), 'post.md', false);
    assert.equal(path.basename(nonCollide), 'post 3.md');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('clipboard path parsers: macOS plist, text/uri-list, and Windows FileNameW', () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
    <plist version="1.0"><array>
      <string>/Users/test/Docs/hello &amp; world.md</string>
      <string>/Users/test/Docs/folder</string>
    </array></plist>`;
  assert.deepEqual(parseMacPlistFilePaths(plist), [
    '/Users/test/Docs/hello & world.md',
    '/Users/test/Docs/folder',
  ]);

  const uriList = '# comment\nfile:///tmp/a%20b.md\nfile:///tmp/dir\n';
  assert.deepEqual(parseFileUriList(uriList), ['/tmp/a b.md', '/tmp/dir']);

  const winBuf = Buffer.from('C:\\Notes\\demo.md\0C:\\Notes\\two.md\0\0', 'utf16le');
  assert.deepEqual(parseWindowsFileNameW(winBuf), ['C:\\Notes\\demo.md', 'C:\\Notes\\two.md']);
});

test('extractOpenTargetFromArgv: skips flags, script paths, and app dir; extracts markdown file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-argv-'));
  const appDir = path.join(root, 'app');
  const mdFile = path.join(root, 'note.md');
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(mdFile, '# Note', 'utf-8');
  try {
    assert.equal(
      extractOpenTargetFromArgv(['electron', '--no-sandbox', '.', 'out/main/index.js', appDir], appDir),
      null
    );
    assert.equal(
      extractOpenTargetFromArgv(['electron', '--no-sandbox', 'out/main/index.js', mdFile], appDir),
      path.resolve(mdFile)
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
