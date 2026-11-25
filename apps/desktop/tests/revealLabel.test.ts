import assert from 'node:assert/strict';
import test from 'node:test';
import { getRevealInFileManagerLabel } from '../../../packages/shared/src/index.ts';

test('getRevealInFileManagerLabel adapts to macOS, Windows, and Linux', () => {
  assert.equal(getRevealInFileManagerLabel('darwin'), '在 Finder 中显示');
  assert.equal(getRevealInFileManagerLabel('MacIntel'), '在 Finder 中显示');
  assert.equal(getRevealInFileManagerLabel('win32'), '在资源管理器中显示');
  assert.equal(getRevealInFileManagerLabel('Win32'), '在资源管理器中显示');
  assert.equal(getRevealInFileManagerLabel('linux'), '在文件管理器中显示');
  assert.equal(getRevealInFileManagerLabel('Linux x86_64'), '在文件管理器中显示');
});
