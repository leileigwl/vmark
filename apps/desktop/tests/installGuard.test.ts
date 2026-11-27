import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { findDuplicateMacApps } from '../src/main/installGuardCore.ts';

test('findDuplicateMacApps：只识别重复的 Vmark 副本，忽略正式版及其他应用', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmark-guard-'));
  try {
    mkdirSync(join(dir, 'Vmark.app'));
    mkdirSync(join(dir, 'Safari.app'));
    assert.deepEqual(findDuplicateMacApps(dir), []);

    mkdirSync(join(dir, 'Vmark 2.app'));
    mkdirSync(join(dir, 'Vmark (3).app'));
    mkdirSync(join(dir, 'vmark 副本.app'));
    assert.deepEqual(findDuplicateMacApps(dir), ['Vmark (3).app', 'Vmark 2.app', 'vmark 副本.app']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findDuplicateMacApps：目录不存在时安全返回空数组', () => {
  assert.deepEqual(findDuplicateMacApps(join(tmpdir(), 'vmark-missing-dir-99999')), []);
});
