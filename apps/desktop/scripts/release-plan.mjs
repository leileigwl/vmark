#!/usr/bin/env node
// 发布计划：从 git tag 和提交信息算出下一个版本 tag、判断预发布、找上一个版本（发布说明范围）。
// 纯函数 + 小 CLI，供 .github/workflows/daily-release-pr.yml、release.yml、release-rollback.yml 调用。
//
//   next-tag [ref] [--github-output]      算 ref（默认 HEAD）的下一个正式版 tag；不该发版时 tag 为空并给出原因
//   channel <tag> [--github-output]       校验 tag，输出 version / prerelease（带 - 后缀即预发布）
//   previous-tag <tag>                    上一个版本：正式版找上一个正式版，预发布找上一个任意版本
//   is-latest <tag>                       该 tag 是否应标为 GitHub「Latest」（正式版且不低于已有最高正式版）
//
// 规则（和 Conventional Commits 一致）：
//   - 基线 = 最高的正式版 tag（忽略 v0.3.0-rc.1 这类预发布，避免把 "0-rc.1" 当补丁号做算术）
//   - BREAKING（type!: 或正文 BREAKING CHANGE:）：1.x 以上升主版本，0.x 升次版本
//   - feat 升次版本；其余提交升补丁版本；只有合并提交和 chore(release) 同步提交时不发版
//   - 已有比基线高的预发布（v0.3.0-rc.1），且它的正式版号不低于算出的版本：转正为 v0.3.0
//   - 一个 tag 都没有时，首个版本是 v0.1.0
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAG_RE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** 'v0.3.0-rc.1' -> { major: 0, minor: 3, patch: 0, pre: ['rc', '1'], tag }；不是合法版本 tag 返回 null。 */
export function parseTag(tag) {
  const m = TAG_RE.exec(String(tag ?? '').trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split('.') : [], tag: m[0] };
}

function compareIds(a, b) {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Number(a) - Number(b);
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** SemVer 2.0 优先级比较：v0.3.0-rc.1 < v0.3.0-rc.2 < v0.3.0 < v0.3.1。 */
export function compareTags(a, b) {
  const pa = typeof a === 'string' ? parseTag(a) : a;
  const pb = typeof b === 'string' ? parseTag(b) : b;
  if (!pa || !pb) throw new Error(`无法比较非版本 tag：${JSON.stringify(a)} / ${JSON.stringify(b)}`);
  for (const k of ['major', 'minor', 'patch']) if (pa[k] !== pb[k]) return pa[k] - pb[k];
  if (!pa.pre.length || !pb.pre.length) return pb.pre.length - pa.pre.length;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i += 1) {
    if (pa.pre[i] === undefined) return -1;
    if (pb.pre[i] === undefined) return 1;
    const c = compareIds(pa.pre[i], pb.pre[i]);
    if (c !== 0) return c;
  }
  return 0;
}

export function isPrerelease(tag) {
  const p = parseTag(tag);
  if (!p) throw new Error(`不是有效的版本 tag：${JSON.stringify(tag)}（应为 v1.2.3 或 v1.2.3-rc.1）`);
  return p.pre.length > 0;
}

const coreTag = (p) => `v${p.major}.${p.minor}.${p.patch}`;
const IGNORED = [/^Merge (pull request|branch|remote-tracking branch) /, /^chore\(release\)/i];

/** 按提交信息（主题 + 正文）给出升级级别：'major' | 'minor' | 'patch' | null。 */
export function classifyCommits(messages) {
  let level = null;
  for (const raw of messages) {
    const msg = String(raw ?? '').trim();
    if (!msg || IGNORED.some((re) => re.test(msg))) continue;
    const subject = msg.split('\n')[0];
    if (/^[A-Za-z]+(\([^)]*\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(msg)) return 'major';
    if (/^feat(\([^)]*\))?:/i.test(subject)) level = 'minor';
    else if (!level) level = 'patch';
  }
  return level;
}

export function bump(base, level) {
  const p = typeof base === 'string' ? parseTag(base) : base;
  if (level === 'major') return p.major >= 1 ? `v${p.major + 1}.0.0` : `v0.${p.minor + 1}.0`;
  if (level === 'minor') return `v${p.major}.${p.minor + 1}.0`;
  if (level === 'patch') return `v${p.major}.${p.minor}.${p.patch + 1}`;
  throw new Error(`未知的升级级别：${level}`);
}

/** 最高的正式版 tag（没有返回 null）。 */
export function latestStable(tags) {
  const stable = tags.map(parseTag).filter((p) => p && !p.pre.length);
  return stable.sort(compareTags).at(-1)?.tag ?? null;
}

/**
 * 算下一个正式版 tag。
 * @param {{ tags: string[], messages: string[], headTags?: string[] }} input
 *   tags 仓库里所有 tag；messages 基线正式版之后到 ref 的提交信息；headTags 已经指向 ref 的 tag
 * @returns {{ tag: string | null, level: string | null, base: string | null, reason: string }}
 */
export function computeNextTag({ tags, messages, headTags = [] }) {
  const base = latestStable(tags);
  const onHead = headTags.map(parseTag).filter((p) => p && !p.pre.length);
  if (onHead.length) return { tag: null, level: null, base, reason: `该提交已有正式版 tag ${onHead[0].tag}，不重复打` };
  const level = classifyCommits(messages);
  if (!level) return { tag: null, level, base, reason: `${base ?? '仓库起点'} 之后没有需要发版的提交` };
  if (!base) {
    const pres = tags.map(parseTag).filter((p) => p && p.pre.length).sort(compareTags);
    const tag = pres.length ? coreTag(pres.at(-1)) : 'v0.1.0';
    return { tag, level, base, reason: pres.length ? `首个正式版，转正预发布 ${pres.at(-1).tag}` : '仓库还没有版本 tag，首个版本' };
  }
  let tag = bump(base, level);
  let reason = `${base} + ${level}`;
  const pending = tags
    .map(parseTag)
    .filter((p) => p && p.pre.length && compareTags(p, base) > 0)
    .sort(compareTags)
    .at(-1);
  if (pending && compareTags(coreTag(pending), tag) >= 0) {
    tag = coreTag(pending);
    reason = `转正预发布 ${pending.tag}`;
  }
  return { tag, level, base, reason };
}

/** 上一个版本：正式版 -> 上一个正式版；预发布 -> 上一个任意版本。没有返回空字符串。 */
export function previousTag(tag, tags) {
  const cur = parseTag(tag);
  if (!cur) throw new Error(`不是有效的版本 tag：${JSON.stringify(tag)}`);
  const older = tags
    .map(parseTag)
    .filter((p) => p && compareTags(p, cur) < 0 && (cur.pre.length || !p.pre.length))
    .sort(compareTags);
  return older.at(-1)?.tag ?? '';
}

/** 正式版且不低于仓库里最高的正式版时，才把它标成 Latest（补发旧版本的补丁不会抢走 Latest）。 */
export function shouldMarkLatest(tag, tags) {
  if (isPrerelease(tag)) return false;
  const top = latestStable(tags);
  return !top || compareTags(tag, top) >= 0;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** 从 git 仓库读取输入并算下一个 tag（ref 例如 origin/master）。 */
export function nextTagFromGit(ref = 'HEAD', cwd = process.cwd()) {
  const tags = lines(git(['tag', '--list', 'v*'], cwd));
  const headTags = lines(git(['tag', '--points-at', ref], cwd));
  const base = latestStable(tags);
  const range = base ? `${base}..${ref}` : ref;
  const raw = git(['log', '--format=%B%x00', range], cwd);
  const messages = raw.split('\0').map((m) => m.trim()).filter(Boolean);
  return computeNextTag({ tags, messages, headTags });
}

function emit(obj, githubOutput) {
  if (githubOutput && process.env.GITHUB_OUTPUT) {
    const body = Object.entries(obj).map(([k, v]) => `${k}=${String(v ?? '').replace(/\n/g, ' ')}`).join('\n');
    appendFileSync(process.env.GITHUB_OUTPUT, `${body}\n`);
  }
  console.log(JSON.stringify(obj));
}

export function main(argv, cwd = process.cwd()) {
  const gh = argv.includes('--github-output');
  const [cmd, arg] = argv.filter((a) => a !== '--github-output');
  if (cmd === 'next-tag') {
    emit(nextTagFromGit(arg ?? 'HEAD', cwd), gh);
    return 0;
  }
  if (cmd === 'channel') {
    const prerelease = isPrerelease(arg);
    emit({ tag: arg, version: arg.slice(1), prerelease }, gh);
    return 0;
  }
  if (cmd === 'previous-tag') {
    console.log(previousTag(arg, lines(git(['tag', '--list', 'v*'], cwd))));
    return 0;
  }
  if (cmd === 'is-latest') {
    console.log(String(shouldMarkLatest(arg, lines(git(['tag', '--list', 'v*'], cwd)))));
    return 0;
  }
  console.error('用法: release-plan.mjs next-tag [ref] | channel <tag> | previous-tag <tag> | is-latest <tag>  [--github-output]');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`[release-plan] ✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
