import assert from 'node:assert/strict';
import test from 'node:test';
import { groupCommits, renderNotes } from '../scripts/release-notes.mjs';

/** 发布说明：分组正确、跳过同步合并提交、预发布有醒目提示、带 SHA256 校验说明。 */
const COMMITS = [
  { hash: 'a1', subject: 'feat(publish): 新增小红书卡片模板' },
  { hash: 'a2', subject: 'feat(editor): 统一 Tab/Shift+Tab' },
  { hash: 'a3', subject: 'fix(editor): 修复撤销丢字' },
  { hash: 'a4', subject: 'chore(harness): relock bootstrap' },
  { hash: 'a5', subject: 'Merge pull request #128 from leileigwl/test' },
  { hash: 'a6', subject: 'chore(release): sync master back to test [skip ci]' },
  { hash: 'a7', subject: "Merge tag 'v0.4.0' into test" },
  { hash: 'a8', subject: "Merge commit 'abc123'" },
];

test('groupCommits：按类型分组，跳过合并与同步提交', () => {
  const g = groupCommits(COMMITS);
  assert.deepEqual(g.social, ['- feat(publish): 新增小红书卡片模板 (`a1`)']);
  assert.deepEqual(g.feats, ['- feat(editor): 统一 Tab/Shift+Tab (`a2`)']);
  assert.deepEqual(g.fixes, ['- fix(editor): 修复撤销丢字 (`a3`)']);
  assert.deepEqual(g.others, ['- chore(harness): relock bootstrap (`a4`)']);
});

test('renderNotes：正式版写变更范围和校验说明，不带预发布提示', () => {
  const md = renderNotes({ tag: 'v0.5.0', previous: 'v0.4.0', commits: COMMITS, date: '2026-11-26' });
  assert.match(md, /^# Vmark v0\.5\.0 · 2026-11-26/);
  assert.match(md, /`v0\.4\.0\.\.v0\.5\.0`/);
  assert.match(md, /sha256sum -c SHA256SUMS\.txt/);
  assert.match(md, /xattr -cr \/Applications\/Vmark\.app/);
  assert.doesNotMatch(md, /预发布/);
  assert.doesNotMatch(md, /Merge pull request/);
});

test('renderNotes：预发布加提示；首个版本、无提交也能生成', () => {
  const md = renderNotes({ tag: 'v0.5.0-rc.1', previous: '', commits: [], date: '2026-11-26' });
  assert.match(md, /（预发布）/);
  assert.match(md, /这是预发布版本/);
  assert.match(md, /首个版本 `v0\.5\.0-rc\.1`/);
  assert.match(md, /本版本没有可列出的提交/);
  assert.throws(() => renderNotes({ tag: 'latest', previous: '', commits: [], date: 'x' }), /不是有效的版本 tag/);
});
