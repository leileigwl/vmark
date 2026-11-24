#!/usr/bin/env node
// 发布版本号工具（供 .github/workflows/release.yml 和 daily-release-pr.yml 调用）。
//   sync <tag> [package.json]        把 tag（去掉 v）写进 apps/desktop/package.json 的 version
//   verify <tag> <releaseDir>        打包后检查：安装包文件名和 app.asar 里的 package.json 版本都等于 tag
//   next-tag <latestTag> <hasFeat>   计算下一个正式版 tag（上一个是预发布版时，转正为它的正式版本号）
//   sync-ci / verify-ci              package:* 脚本里用：在 GitHub Actions 的 v* tag 上运行时同步/校验 tag 版本；
//                                    不在 tag 上（本地打包、分支 CI）时 sync-ci 跳过，verify-ci 按 package.json 版本校验
// 不用 npm version：仓库只允许 pnpm，且这里只需要改一个字段。
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAsarFile } from './asar-read.mjs';

const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;
const INSTALLER_RE = /\.(dmg|zip|exe|AppImage|deb)$/;

/** 'v0.3.0-beta.1' -> '0.3.0-beta.1'；不是 v 开头的语义化版本就抛错。 */
export function tagToVersion(tag) {
  const m = TAG_RE.exec(String(tag ?? '').trim());
  if (!m) throw new Error(`不是有效的版本 tag：${JSON.stringify(tag)}（应为 v1.2.3 或 v1.2.3-beta.1）`);
  return String(tag).trim().slice(1);
}

/** 把版本写进 package.json，保持 2 空格缩进和末尾换行，其余字段不动。返回写入的版本。 */
export function syncPackageVersion(tag, pkgPath) {
  const version = tagToVersion(tag);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  return version;
}

function findAsars(dir, depth = 0, out = []) {
  if (depth > 6) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'app.asar') out.push(p);
    else if (!name.endsWith('.asar.unpacked') && statSync(p).isDirectory()) findAsars(p, depth + 1, out);
  }
  return out;
}

/** 检查打包产物版本。返回 { version, installers, asars, errors }；errors 为空才算通过。 */
export function verifyRelease(tag, releaseDir) {
  const version = tagToVersion(tag);
  const errors = [];
  const installers = readdirSync(releaseDir).filter((n) => INSTALLER_RE.test(n));
  if (installers.length === 0) errors.push(`${releaseDir} 里没有安装包（.dmg/.zip/.exe/.AppImage/.deb）`);
  for (const name of installers) {
    if (!name.includes(version)) errors.push(`安装包文件名不含版本 ${version}：${name}`);
  }
  const asars = findAsars(releaseDir);
  if (asars.length === 0) errors.push(`${releaseDir} 里找不到 app.asar`);
  for (const asar of asars) {
    const got = JSON.parse(readAsarFile(asar, 'package.json').toString('utf8')).version;
    if (got !== version) errors.push(`${asar} 里 package.json 版本是 ${got}，应为 ${version}（app.getVersion() 读的就是它）`);
  }
  return { version, installers, asars, errors };
}

/** 计算下一个 tag：上一个是预发布版（v0.3.0-beta.1）就转正为 v0.3.0；否则有 feat 升次版本，没有升补丁版本。 */
export function nextReleaseTag(latestTag, hasFeat) {
  const m = TAG_RE.exec(String(latestTag ?? '').trim());
  if (!m) return 'v0.1.0';
  const [major, minor, patch, pre] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]];
  if (pre) return `v${major}.${minor}.${patch}`;
  return hasFeat ? `v${major}.${minor + 1}.0` : `v${major}.${minor}.${patch + 1}`;
}

/** GitHub Actions 在 tag 上运行时返回 tag 名（push tag 或按 tag 手动触发），否则返回 null。 */
export function ciTag(env) {
  return env.GITHUB_ACTIONS === 'true' && env.GITHUB_REF_TYPE === 'tag' && env.GITHUB_REF_NAME ? env.GITHUB_REF_NAME : null;
}

function main(argv, env) {
  const [cmd, a, b] = argv;
  const here = fileURLToPath(new URL('.', import.meta.url));
  const defaultPkg = join(here, '..', 'package.json');
  if (cmd === 'sync-ci') {
    const tag = ciTag(env);
    if (!tag) {
      console.log('[release-version] 不在 GitHub Actions 的 tag 上，不改版本号');
      return 0;
    }
    console.log(`[release-version] ${defaultPkg} version -> ${syncPackageVersion(tag, defaultPkg)}（来自 tag ${tag}）`);
    return 0;
  }
  if (cmd === 'verify-ci') {
    const tag = ciTag(env) ?? `v${JSON.parse(readFileSync(defaultPkg, 'utf8')).version}`;
    return main(['verify', tag, join(here, '..', 'release')], env);
  }
  if (cmd === 'sync') {
    const pkgPath = resolve(b ?? defaultPkg);
    console.log(`[release-version] ${pkgPath} version -> ${syncPackageVersion(a, pkgPath)}`);
    return 0;
  }
  if (cmd === 'verify') {
    const r = verifyRelease(a, resolve(b ?? join(here, '..', 'release')));
    for (const n of r.installers) console.log(`[release-version] 安装包 ${n}`);
    for (const p of r.asars) console.log(`[release-version] 已检查 ${p}`);
    for (const e of r.errors) console.error(`[release-version] ✗ ${e}`);
    if (r.errors.length) return 1;
    console.log(`[release-version] ✓ 产物版本都是 ${r.version}`);
    return 0;
  }
  if (cmd === 'next-tag') {
    console.log(nextReleaseTag(a, Number(b) > 0 || b === 'true'));
    return 0;
  }
  console.error('用法: release-version.mjs sync <tag> [package.json] | verify <tag> <releaseDir> | next-tag <latestTag> <hasFeat> | sync-ci | verify-ci');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2), process.env);
  } catch (err) {
    console.error(`[release-version] ✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
