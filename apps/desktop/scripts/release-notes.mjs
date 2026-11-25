#!/usr/bin/env node
// 发布说明：按「上一个版本..本 tag」的提交生成中文 Release 正文（供 .github/workflows/release.yml 调用）。
//   release-notes.mjs <tag> [--out RELEASE_NOTES.md]
// 正式版对比上一个正式版（跨过中间的 rc），预发布对比上一个任意版本；预发布顶部加醒目提示。
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IGNORED_COMMIT_RE, isPrerelease, previousTag } from './release-plan.mjs';

const SOCIAL_RE = /social|card|xiaohongshu|douyin|weixin|zhihu|baijiahao|latex|排版|卡片|小红书|抖音/i;

/** 把提交主题分组：[{ hash, subject }] -> { social, feats, fixes, others } */
export function groupCommits(commits) {
  const groups = { social: [], feats: [], fixes: [], others: [] };
  for (const { hash, subject } of commits) {
    if (IGNORED_COMMIT_RE.some((re) => re.test(subject))) continue;
    const item = `- ${subject} (\`${hash}\`)`;
    if (/^feat/i.test(subject) && SOCIAL_RE.test(subject)) groups.social.push(item);
    else if (/^feat/i.test(subject)) groups.feats.push(item);
    else if (/^fix/i.test(subject)) groups.fixes.push(item);
    else groups.others.push(item);
  }
  return groups;
}

/** 生成正文 Markdown。commits 为空时也给出完整结构，方便人工补充。 */
export function renderNotes({ tag, previous, commits, date }) {
  const g = groupCommits(commits);
  const section = (title, items) => (items.length ? ['', `## ${title}`, ...items] : []);
  const pre = isPrerelease(tag);
  return [
    `# Vmark ${tag}${pre ? '（预发布）' : ''} · ${date}`,
    '',
    ...(pre ? ['> ⚠️ **这是预发布版本**，用于真机验证，可能有未完成的功能；已安装正式版的用户不会自动更新到它。', ''] : []),
    `> 变更范围：${previous ? `\`${previous}..${tag}\`` : `首个版本 \`${tag}\``}`,
    ...section('🎨 排版与多平台卡片', g.social),
    ...section('✨ 新功能', g.feats),
    ...section('🐛 问题修复', g.fixes),
    ...section('🔧 工程与文档', g.others),
    ...(commits.length ? [] : ['', '- （本版本没有可列出的提交）']),
    '',
    '## 📦 下载与安装',
    '| 系统 | 文件 | 说明 |',
    '| :--- | :--- | :--- |',
    '| macOS（Apple 芯片） | `.dmg` / `-mac.zip` | 拖入「应用程序」；未签名版本首次打开如被拦截，到「系统设置 → 隐私与安全性」点「仍要打开」，或执行 `xattr -dr com.apple.quarantine /Applications/Vmark.app` |',
    '| Windows 10/11（x64） | `Vmark-Setup-*.exe` | 双击安装；SmartScreen 提示时点「更多信息 → 仍要运行」 |',
    '| Linux（x64） | `.AppImage` / `.deb` | `chmod +x Vmark-*.AppImage` 后运行，或 `sudo dpkg -i Vmark-*.deb` |',
    '',
    '## 🔐 校验文件',
    '所有文件的 SHA-256 在 `SHA256SUMS.txt` 里，下载后可执行：',
    '```bash',
    'sha256sum -c SHA256SUMS.txt --ignore-missing   # macOS 用 shasum -a 256 -c',
    '```',
    '',
  ].join('\n');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function notesFromGit(tag) {
  const tags = git(['tag', '--list', 'v*', '--merged', tag]).split('\n').filter(Boolean);
  const previous = previousTag(tag, tags);
  const raw = git(['log', '--format=%h%x09%s', previous ? `${previous}..${tag}` : tag]);
  const commits = raw
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, ...rest] = l.split('\t');
      return { hash, subject: rest.join('\t') };
    });
  const date = git(['log', '-1', '--format=%cs', tag]);
  return renderNotes({ tag, previous, commits, date });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [tag, flag, out] = process.argv.slice(2);
    if (!tag) throw new Error('用法: release-notes.mjs <tag> [--out RELEASE_NOTES.md]');
    const md = notesFromGit(tag);
    if (flag === '--out' && out) writeFileSync(out, md, 'utf8');
    else process.stdout.write(md);
  } catch (err) {
    console.error(`[release-notes] ✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
