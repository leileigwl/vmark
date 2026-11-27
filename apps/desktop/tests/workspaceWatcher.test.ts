import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createWorkspaceWatcher, shouldIgnoreFilename } from '../src/main/workspaceWatcher.ts';

test('shouldIgnoreFilename: filters .git, node_modules, .DS_Store, .vmark-* and temp files', () => {
  assert.equal(shouldIgnoreFilename('.git/index'), true);
  assert.equal(shouldIgnoreFilename('sub/node_modules/pkg/index.js'), true);
  assert.equal(shouldIgnoreFilename('.DS_Store'), true);
  assert.equal(shouldIgnoreFilename('.vmark-123.tmp'), true);
  assert.equal(shouldIgnoreFilename('draft.tmp'), true);
  assert.equal(shouldIgnoreFilename('notes/hello.md'), false);
});

test('createWorkspaceWatcher: triggers debounced callback on new file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-watch-'));
  await new Promise((r) => setTimeout(r, 250));

  let calls = 0;
  const watcher = createWorkspaceWatcher(() => {
    calls += 1;
  }, 60);

  try {
    watcher.watch(dir);
    await new Promise((r) => setTimeout(r, 150));
    calls = 0;

    await fs.writeFile(path.join(dir, 'dropped.md'), '# Dropped', 'utf-8');
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(calls >= 1, `expected watcher callback >= 1, got ${calls}`);
  } finally {
    watcher.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
