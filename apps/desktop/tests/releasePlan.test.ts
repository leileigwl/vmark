import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  bump,
  classifyCommits,
  compareTags,
  computeNextTag,
  isPrerelease,
  latestStable,
  nextTagFromGit,
  parseTag,
  previousTag,
  shouldMarkLatest,
} from '../scripts/release-plan.mjs';

/** 自动打 tag：v0.3.0-rc.1 曾让旧脚本把补丁号解析成 "0-rc.1" 做算术报错，冻结锁没关。这里把规则逐条钉住。 */
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, '..', 'scripts', 'release-plan.mjs');
const TAGS_NOW = ['v0.1.0', 'v0.2.0', 'v0.3.0-beta.1', 'v0.3.0-rc.1'];

test('parseTag：只接受 v 开头的语义化版本', () => {
  assert.deepEqual(parseTag('v0.3.0-rc.1'), { major: 0, minor: 3, patch: 0, pre: ['rc', '1'], tag: 'v0.3.0-rc.1' });
  for (const bad of ['0.3.0', 'v0.3', 'v1.2.3.4', 'v01.2.3', 'nightly', 'v1.2.3-', '', null]) {
    assert.equal(parseTag(bad as string), null, `${bad} 应无效`);
  }
});

test('compareTags：按 SemVer 优先级排序', () => {
  const sorted = ['v1.0.0', 'v0.3.0-rc.10', 'v0.3.0', 'v0.3.0-beta.1', 'v0.3.0-rc.2', 'v0.2.9', 'v0.3.0-rc.1'].sort(compareTags);
  assert.deepEqual(sorted, ['v0.2.9', 'v0.3.0-beta.1', 'v0.3.0-rc.1', 'v0.3.0-rc.2', 'v0.3.0-rc.10', 'v0.3.0', 'v1.0.0']);
  assert.throws(() => compareTags('v1.0.0', 'latest'), /无法比较/);
});

test('isPrerelease / latestStable：预发布不算正式基线', () => {
  assert.equal(isPrerelease('v0.3.0-rc.1'), true);
  assert.equal(isPrerelease('v0.4.0'), false);
  assert.throws(() => isPrerelease('v0.4'), /不是有效的版本 tag/);
  assert.equal(latestStable(TAGS_NOW), 'v0.2.0');
  assert.equal(latestStable(['v0.3.0-rc.1', 'junk']), null);
  assert.equal(latestStable([]), null);
});

test('classifyCommits：feat / fix / BREAKING / 只有同步合并', () => {
  const cases: Array<[string[], string | null]> = [
    [['fix(editor): 修复撤销'], 'patch'],
    [['docs: 更新 README', 'chore(harness): relock'], 'patch'],
    [['fix: a', 'feat(publish): 新增掘金'], 'minor'],
    [['feat: a', 'refactor(core)!: 改 IPC 契约'], 'major'],
    [['feat: a\n\nBREAKING CHANGE: 配置文件格式变了'], 'major'],
    [['Merge pull request #128 from leileigwl/test', 'chore(release): sync master back to test [skip ci]'], null],
    [["Merge tag 'v0.4.0'", "Merge commit 'abc123' into test", "Merge branch 'master' into test"], null],
    [[], null],
  ];
  for (const [msgs, want] of cases) assert.equal(classifyCommits(msgs), want, JSON.stringify(msgs));
});

test('bump：0.x 的破坏性变更升次版本，1.x 起升主版本', () => {
  assert.equal(bump('v0.3.0', 'major'), 'v0.4.0');
  assert.equal(bump('v1.2.3', 'major'), 'v2.0.0');
  assert.equal(bump('v1.2.3', 'minor'), 'v1.3.0');
  assert.equal(bump('v1.2.3', 'patch'), 'v1.2.4');
  assert.throws(() => bump('v1.2.3', 'huge'), /未知的升级级别/);
});

test('computeNextTag：覆盖 rc 转正、正式版、无 tag、feat/fix/BREAKING', () => {
  const cases: Array<[string, Parameters<typeof computeNextTag>[0], string | null]> = [
    ['最新是 v0.3.0-rc.1 + fix：转正 v0.3.0，不再算术报错', { tags: TAGS_NOW, messages: ['fix: x'] }, 'v0.3.0'],
    ['最新是 v0.3.0-rc.1 + feat：转正 v0.3.0', { tags: TAGS_NOW, messages: ['feat: x'] }, 'v0.3.0'],
    ['v0.3.0 + fix', { tags: [...TAGS_NOW, 'v0.3.0'], messages: ['fix: x'] }, 'v0.3.1'],
    ['v0.3.0 + feat', { tags: [...TAGS_NOW, 'v0.3.0'], messages: ['fix: y', 'feat: x'] }, 'v0.4.0'],
    ['v0.3.0 + BREAKING（0.x）', { tags: ['v0.3.0'], messages: ['feat!: x'] }, 'v0.4.0'],
    ['v1.4.2 + BREAKING', { tags: ['v1.4.2'], messages: ['fix: a\n\nBREAKING CHANGE: b'] }, 'v2.0.0'],
    ['无 tag + 有提交：首个版本 v0.1.0', { tags: [], messages: ['fix: x'] }, 'v0.1.0'],
    ['无 tag + 无提交：不发', { tags: [], messages: [] }, null],
    ['只有 rc 没有正式版：转正 rc', { tags: ['v1.0.0-rc.2', 'v1.0.0-rc.1'], messages: ['fix: x'] }, 'v1.0.0'],
    ['现状 v0.4.0 + feat', { tags: [...TAGS_NOW, 'v0.4.0'], messages: ['feat: x'] }, 'v0.5.0'],
    ['rc 落后于算出的版本：不回退', { tags: ['v0.4.0', 'v0.4.1-rc.1'], messages: ['feat: x'] }, 'v0.5.0'],
    ['只有同步提交：不发', { tags: ['v0.4.0'], messages: ['chore(release): sync master back to test'] }, null],
    ['HEAD 已有 v0.4.0：幂等不重复打', { tags: ['v0.4.0'], messages: ['feat: x'], headTags: ['v0.4.0'] }, null],
    ['HEAD 只有 rc tag：照常转正', { tags: TAGS_NOW, messages: ['fix: x'], headTags: ['v0.3.0-rc.1'] }, 'v0.3.0'],
    ['非法 tag 被忽略', { tags: ['v0.2.0', 'nightly', 'v0.3'], messages: ['fix: x'] }, 'v0.2.1'],
  ];
  for (const [name, input, want] of cases) {
    const got = computeNextTag(input);
    assert.equal(got.tag, want, `${name}：${JSON.stringify(got)}`);
    assert.ok(got.reason.length > 0, `${name} 要给出原因`);
  }
});

test('previousTag：正式版对比上一个正式版，预发布对比上一个任意版本', () => {
  const tags = [...TAGS_NOW, 'v0.4.0', 'v0.5.0-rc.1'];
  assert.equal(previousTag('v0.4.0', tags), 'v0.2.0');
  assert.equal(previousTag('v0.5.0-rc.1', tags), 'v0.4.0');
  assert.equal(previousTag('v0.3.0-rc.1', tags), 'v0.3.0-beta.1');
  assert.equal(previousTag('v0.1.0', tags), '');
  assert.equal(previousTag('v1.0.0', ['v1.0.0-rc.1', 'v1.0.0-rc.2', 'v1.0.0']), 'v1.0.0-rc.2', '首个正式版对比最后一个 rc，不列全仓库历史');
});

test('shouldMarkLatest：只有不低于最高正式版的正式版才标 Latest', () => {
  const tags = [...TAGS_NOW, 'v0.4.0'];
  assert.equal(shouldMarkLatest('v0.5.0', [...tags, 'v0.5.0']), true);
  assert.equal(shouldMarkLatest('v0.4.0', tags), true);
  assert.equal(shouldMarkLatest('v0.3.1', [...tags, 'v0.3.1']), false, '给旧版本补发补丁不抢 Latest');
  assert.equal(shouldMarkLatest('v0.5.0-rc.1', tags), false);
  assert.equal(shouldMarkLatest('v0.1.0', []), true);
});

function repo(): { dir: string; run: (...a: string[]) => string; commit: (msg: string) => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-plan-'));
  const run = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  run('init', '-q', '-b', 'master');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 't');
  let n = 0;
  const commit = (msg: string) => {
    n += 1;
    fs.writeFileSync(path.join(dir, `f${n}.txt`), String(n));
    run('add', '.');
    run('commit', '-q', '-m', msg);
  };
  return { dir, run, commit };
}

test('nextTagFromGit：真实 git 仓库里重现 v0.3.0-rc.1 → v0.3.0 → v0.3.1', () => {
  const r = repo();
  r.commit('feat: 初始');
  assert.equal(nextTagFromGit('HEAD', r.dir).tag, 'v0.1.0');
  r.run('tag', '-a', 'v0.2.0', '-m', 'v0.2.0');
  r.commit('fix: 小修');
  r.run('tag', '-a', 'v0.3.0-rc.1', '-m', '手打的 rc');
  r.commit('Merge pull request #1 from x/test');
  assert.deepEqual(
    { tag: nextTagFromGit('HEAD', r.dir).tag, base: nextTagFromGit('HEAD', r.dir).base },
    { tag: 'v0.3.0', base: 'v0.2.0' },
  );
  r.run('tag', '-a', 'v0.3.0', '-m', 'v0.3.0');
  assert.equal(nextTagFromGit('HEAD', r.dir).tag, null, 'HEAD 已打 v0.3.0');
  r.commit('fix(editor): 光标');
  assert.equal(nextTagFromGit('HEAD', r.dir).tag, 'v0.3.1');
  r.commit('feat(publish): 新平台');
  assert.equal(nextTagFromGit('HEAD', r.dir).tag, 'v0.4.0');
});

test('nextTagFromGit：别的分支上遗留的高版本 rc 不会被转正', () => {
  const r = repo();
  r.commit('feat: a');
  r.run('tag', '-a', 'v0.4.0', '-m', 'v0.4.0');
  r.run('checkout', '-q', '-b', 'abandoned');
  r.commit('feat: 废弃的实验');
  r.run('tag', '-a', 'v0.6.0-rc.1', '-m', '废弃分支上的 rc');
  r.run('checkout', '-q', 'master');
  r.commit('fix: 小修');
  assert.equal(nextTagFromGit('HEAD', r.dir).tag, 'v0.4.1');
});

test('nextTagFromGit：基线 tag 不可达、算出的版本不高于已有正式版时报错而不是倒退', () => {
  const r = repo();
  r.commit('feat: a');
  r.run('tag', '-a', 'v0.2.0', '-m', 'v0.2.0');
  r.run('checkout', '-q', '-b', 'test');
  r.run('checkout', '-q', 'master');
  r.commit('Merge pull request #1 from x/test');
  r.run('tag', '-a', 'v0.4.0', '-m', 'v0.4.0 只在 master 上');
  r.run('checkout', '-q', 'test');
  r.commit('fix: test 上的修复');
  assert.throws(() => nextTagFromGit('HEAD', r.dir), /v0\.2\.1 不高于已有的正式版 v0\.4\.0/);
});

test('CLI：previous-tag / is-latest 支持 --github-output', () => {
  const r = repo();
  r.commit('feat: a');
  r.run('tag', '-a', 'v0.4.0', '-m', 'v0.4.0');
  r.commit('fix: b');
  r.run('tag', '-a', 'v0.4.1', '-m', 'v0.4.1');
  const out = path.join(r.dir, 'gh-output.txt');
  const env = { ...process.env, GITHUB_OUTPUT: out };
  assert.equal(execFileSync('node', [CLI, 'previous-tag', 'v0.4.1', '--github-output'], { cwd: r.dir, encoding: 'utf8', env }).trim(), 'v0.4.0');
  assert.equal(execFileSync('node', [CLI, 'is-latest', 'v0.4.0', '--github-output'], { cwd: r.dir, encoding: 'utf8', env }).trim(), 'false');
  const written = fs.readFileSync(out, 'utf8');
  assert.match(written, /^previous=v0\.4\.0$/m);
  assert.match(written, /^latest=false$/m);
});

test('CLI：next-tag 写 GITHUB_OUTPUT；channel 拒绝非法 tag', () => {
  const r = repo();
  r.commit('feat: a');
  r.run('tag', '-a', 'v0.3.0-rc.1', '-m', 'rc');
  r.commit('fix: b');
  const out = path.join(r.dir, 'gh-output.txt');
  const stdout = execFileSync('node', [CLI, 'next-tag', 'HEAD', '--github-output'], {
    cwd: r.dir,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: out },
  });
  assert.equal(JSON.parse(stdout).tag, 'v0.3.0');
  assert.match(fs.readFileSync(out, 'utf8'), /^tag=v0\.3\.0$/m);
  const ch = JSON.parse(execFileSync('node', [CLI, 'channel', 'v0.3.0-rc.1'], { encoding: 'utf8' }));
  assert.deepEqual(ch, { tag: 'v0.3.0-rc.1', version: '0.3.0-rc.1', prerelease: true });
  assert.throws(() => execFileSync('node', [CLI, 'channel', 'v0.3'], { stdio: 'pipe' }), /Command failed/);
});
