import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_CONFIG,
  recordRecentWorkspace,
  resolveSafePath,
  type AppConfig,
} from '../src/main/ipc/pathUtils.ts';

test('resolveSafePath allows paths inside workspace and blocks path traversal', () => {
  const root = path.resolve('/tmp/vmark-ws-test');
  const valid = resolveSafePath(root, 'notes/hello.md');
  assert.equal(valid, path.join(root, 'notes', 'hello.md'));

  assert.throws(() => resolveSafePath(root, '../../etc/passwd'), /Access denied/);
  assert.throws(() => resolveSafePath(root, '../vmark-ws-test-sibling/secret.md'), /Access denied/);
});

test('recordRecentWorkspace deduplicates and caps MRU list at 8 entries', () => {
  const cfg: AppConfig = {
    ...DEFAULT_CONFIG,
    recentWorkspaces: ['/w/1', '/w/2', '/w/3', '/w/4', '/w/5', '/w/6', '/w/7', '/w/8'],
  };

  recordRecentWorkspace(cfg, '/w/4');
  assert.equal(cfg.workspacePath, '/w/4');
  assert.equal(cfg.recentWorkspaces[0], '/w/4');
  assert.equal(cfg.recentWorkspaces.length, 8);

  recordRecentWorkspace(cfg, '/w/9');
  assert.equal(cfg.workspacePath, '/w/9');
  assert.equal(cfg.recentWorkspaces[0], '/w/9');
  assert.equal(cfg.recentWorkspaces.length, 8);
  assert.ok(!cfg.recentWorkspaces.includes('/w/8'));
});
