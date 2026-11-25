#!/usr/bin/env node
// 发布产物检查：上传 GitHub Release 之前确认三平台安装包、自动更新清单（latest*.yml）齐全且互相对得上，
// 生成 SHA256SUMS.txt，上传后再核对 GitHub 上每个文件的 sha256，全部一致才允许把草稿 Release 公开。
//
//   check <dir> <tag> [--platform mac,win,linux]   本地产物检查（默认三平台都要有）
//   checksums <dir>                                在 <dir> 写 SHA256SUMS.txt 并打印
//   verify-remote <assets.json> <dir>              assets.json = GET /repos/{o}/{r}/releases/{id}/assets 的结果
//
// 为什么要查文件名：GitHub 上传时会把空格改成点（"Vmark Setup 0.4.0.exe" -> "Vmark.Setup.0.4.0.exe"），
// 而 electron-builder 写进 latest.yml 的地址是 "Vmark-Setup-0.4.0.exe"，结果 Windows 自动更新下载 404。
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLATFORMS = {
  mac: { yml: 'latest-mac.yml', installers: [/\.dmg$/, /-mac\.zip$/] },
  win: { yml: 'latest.yml', installers: [/\.exe$/] },
  linux: { yml: 'latest-linux.yml', installers: [/\.AppImage$/, /\.deb$/] },
};
export const SUMS_FILE = 'SHA256SUMS.txt';
const RELEASE_FILE_RE = /\.(dmg|zip|exe|AppImage|deb|blockmap|yml)$/;

/** GitHub Release 上传后的文件名：空格等字符会被替换成点。 */
export function githubAssetName(name) {
  return name.replace(/[^A-Za-z0-9._+@-]/g, '.');
}

/** 只读解析 electron-builder 生成的 latest*.yml（固定格式，不引入 yaml 依赖）。 */
export function parseUpdaterYml(text) {
  const version = /^version:\s*['"]?([^'"\s]+)/m.exec(text)?.[1] ?? null;
  const urls = [...text.matchAll(/^\s*-\s*url:\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((m) => m[1]);
  const path = /^path:\s*['"]?([^'"\n]+?)['"]?\s*$/m.exec(text)?.[1] ?? null;
  return { version, urls: [...new Set([...urls, ...(path ? [path] : [])])] };
}

/** 要上传到 Release 的文件（安装包、blockmap、latest*.yml），按名字排序。 */
export function releaseFiles(dir) {
  return readdirSync(dir)
    .filter((n) => RELEASE_FILE_RE.test(n) && !n.startsWith('builder-') && statSync(join(dir, n)).isFile())
    .sort();
}

/** 检查一个目录里的产物。返回 { files, errors }，errors 为空才算通过。 */
export function checkReleaseDir(dir, tag, platforms = Object.keys(PLATFORMS)) {
  const version = String(tag).replace(/^v/, '');
  const errors = [];
  const files = releaseFiles(dir);
  for (const name of files) {
    const gh = githubAssetName(name);
    if (gh !== name) errors.push(`文件名 "${name}" 上传后会被 GitHub 改成 "${gh}"，latest*.yml 里的地址会 404（给它配 artifactName）`);
  }
  for (const p of platforms) {
    const spec = PLATFORMS[p];
    if (!spec) {
      errors.push(`未知平台 ${p}`);
      continue;
    }
    for (const re of spec.installers) {
      if (!files.some((n) => re.test(n) && n.includes(version))) errors.push(`[${p}] 缺少版本 ${version} 的安装包（${re}）`);
    }
    if (!existsSync(join(dir, spec.yml))) {
      errors.push(`[${p}] 缺少自动更新清单 ${spec.yml}`);
      continue;
    }
    const meta = parseUpdaterYml(readFileSync(join(dir, spec.yml), 'utf8'));
    if (meta.version !== version) errors.push(`[${p}] ${spec.yml} 的 version 是 ${meta.version}，应为 ${version}`);
    if (!meta.urls.length) errors.push(`[${p}] ${spec.yml} 里没有任何下载地址`);
    for (const url of meta.urls) {
      if (!files.includes(url)) errors.push(`[${p}] ${spec.yml} 指向 ${url}，但产物里没有这个文件（自动更新会 404）`);
    }
  }
  return { files, errors };
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** 生成 SHA256SUMS.txt 内容（`sha256sum -c` 可直接校验），按文件名排序保证可复现。 */
export function checksums(dir) {
  return releaseFiles(dir)
    .map((n) => `${sha256(join(dir, n))}  ${n}`)
    .join('\n')
    .concat('\n');
}

/** 核对 GitHub 上的 Release 资产：每个本地文件都已上传完成且 sha256 一致。 */
export function verifyRemoteAssets(assets, dir) {
  const errors = [];
  const local = [...releaseFiles(dir), ...(existsSync(join(dir, SUMS_FILE)) ? [SUMS_FILE] : [])];
  for (const name of local) {
    const remote = assets.find((a) => a.name === name);
    if (!remote) {
      errors.push(`GitHub 上缺少 ${name}`);
      continue;
    }
    if (remote.state && remote.state !== 'uploaded') errors.push(`${name} 还没上传完成（state=${remote.state}）`);
    const file = join(dir, name);
    if (remote.digest) {
      const want = `sha256:${sha256(file)}`;
      if (remote.digest !== want) errors.push(`${name} 的 sha256 不一致：GitHub ${remote.digest}，本地 ${want}`);
    } else if (remote.size !== statSync(file).size) {
      errors.push(`${name} 大小不一致：GitHub ${remote.size}，本地 ${statSync(file).size}`);
    }
  }
  return errors;
}

function report(errors, okMsg) {
  for (const e of errors) console.error(`[release-assets] ✗ ${e}`);
  if (errors.length) return 1;
  console.log(`[release-assets] ✓ ${okMsg}`);
  return 0;
}

export function main(argv) {
  const [cmd, a, b] = argv;
  if (cmd === 'check') {
    const i = argv.indexOf('--platform');
    const platforms = i > 0 ? argv[i + 1].split(',') : undefined;
    const r = checkReleaseDir(resolve(a), b, platforms);
    for (const f of r.files) console.log(`[release-assets] ${f}`);
    return report(r.errors, `${r.files.length} 个产物齐全，latest*.yml 地址都能对上`);
  }
  if (cmd === 'checksums') {
    const body = checksums(resolve(a));
    writeFileSync(join(resolve(a), SUMS_FILE), body, 'utf8');
    process.stdout.write(body);
    return 0;
  }
  if (cmd === 'verify-remote') {
    const assets = JSON.parse(readFileSync(resolve(a), 'utf8'));
    return report(verifyRemoteAssets(assets, resolve(b)), 'GitHub 上的文件与本地 sha256 全部一致');
  }
  console.error('用法: release-assets.mjs check <dir> <tag> [--platform mac,win,linux] | checksums <dir> | verify-remote <assets.json> <dir>');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`[release-assets] ✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
