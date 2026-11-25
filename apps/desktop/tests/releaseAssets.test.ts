import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkReleaseDir,
  checksums,
  githubAssetName,
  parseUpdaterYml,
  releaseFiles,
  verifyRemoteAssets,
} from '../scripts/release-assets.mjs';

/** 发布产物：v0.4.0 的 latest.yml 指向 Vmark-Setup-0.4.0.exe，GitHub 上却是 Vmark.Setup.0.4.0.exe，Windows 自动更新 404。 */
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, '..', 'scripts', 'release-assets.mjs');

const yml = (version: string, urls: string[]) =>
  [`version: ${version}`, 'files:', ...urls.flatMap((u) => [`  - url: ${u}`, '    sha512: abc==', '    size: 3']), `path: ${urls[0]}`, "releaseDate: '2026-11-25T13:47:00.000Z'", ''].join('\n');

/** 造一个三平台都齐全的 release 目录；win 安装包名可替换以重现旧问题。 */
function releaseDir(version = '0.5.0', winExe = `Vmark-Setup-${version}.exe`): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-assets-'));
  const files: Record<string, string> = {
    [`Vmark-${version}-arm64.dmg`]: 'dmg',
    [`Vmark-${version}-arm64.dmg.blockmap`]: 'bm',
    [`Vmark-${version}-arm64-mac.zip`]: 'zip',
    [winExe]: 'exe',
    [`${winExe}.blockmap`]: 'bm',
    [`Vmark-${version}-x86_64.AppImage`]: 'img',
    [`Vmark-${version}-amd64.deb`]: 'deb',
    'latest-mac.yml': yml(version, [`Vmark-${version}-arm64-mac.zip`, `Vmark-${version}-arm64.dmg`]),
    'latest.yml': yml(version, [`Vmark-Setup-${version}.exe`]),
    'latest-linux.yml': yml(version, [`Vmark-${version}-x86_64.AppImage`, `Vmark-${version}-amd64.deb`]),
    'builder-debug.yml': 'x: 1',
  };
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c);
  return dir;
}

test('githubAssetName：空格会被 GitHub 改成点', () => {
  assert.equal(githubAssetName('Vmark Setup 0.4.0.exe'), 'Vmark.Setup.0.4.0.exe');
  assert.equal(githubAssetName('Vmark-0.4.0-arm64-mac.zip'), 'Vmark-0.4.0-arm64-mac.zip');
});

test('parseUpdaterYml：读出 version 和所有下载地址（files[].url + path 去重）', () => {
  const meta = parseUpdaterYml(yml('0.4.0', ['Vmark-0.4.0-arm64-mac.zip', 'Vmark-0.4.0-arm64.dmg']));
  assert.deepEqual(meta, { version: '0.4.0', urls: ['Vmark-0.4.0-arm64-mac.zip', 'Vmark-0.4.0-arm64.dmg'] });
  assert.deepEqual(parseUpdaterYml("version: '1.0.0-rc.1'\npath: a.exe\n"), { version: '1.0.0-rc.1', urls: ['a.exe'] });
});

test('checkReleaseDir：三平台齐全且地址对得上时通过，builder-debug.yml 不算产物', () => {
  const dir = releaseDir();
  const r = checkReleaseDir(dir, 'v0.5.0');
  assert.deepEqual(r.errors, []);
  assert.ok(!r.files.includes('builder-debug.yml'));
  assert.equal(r.files.length, 10);
});

test('checkReleaseDir：重现 v0.4.0 的 Windows 文件名问题', () => {
  const dir = releaseDir('0.4.0', 'Vmark Setup 0.4.0.exe');
  const { errors } = checkReleaseDir(dir, 'v0.4.0');
  assert.ok(errors.some((e) => e.includes('会被 GitHub 改成 "Vmark.Setup.0.4.0.exe"')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('latest.yml 指向 Vmark-Setup-0.4.0.exe')), errors.join('\n'));
});

test('checkReleaseDir：版本不符、缺清单、缺安装包都要报', () => {
  const dir = releaseDir();
  fs.rmSync(path.join(dir, 'latest-linux.yml'));
  fs.rmSync(path.join(dir, 'Vmark-0.5.0-arm64.dmg'));
  const { errors } = checkReleaseDir(dir, 'v0.5.1');
  assert.ok(errors.some((e) => e.includes('[linux] 缺少自动更新清单 latest-linux.yml')));
  assert.ok(errors.some((e) => e.includes('[mac] latest-mac.yml 的 version 是 0.5.0，应为 0.5.1')));
  assert.ok(errors.some((e) => e.includes('[win] 缺少版本 0.5.1 的安装包')));
  assert.deepEqual(checkReleaseDir(releaseDir(), 'v0.5.0', ['win']).errors, []);
  assert.ok(checkReleaseDir(releaseDir(), 'v0.5.0', ['bsd']).errors.includes('未知平台 bsd'));
});

test('checksums：与 sha256sum 格式一致、按文件名排序', () => {
  const dir = releaseDir();
  const body = checksums(dir);
  const lines = body.trim().split('\n');
  assert.equal(lines.length, releaseFiles(dir).length);
  const names = lines.map((l) => l.split('  ')[1]);
  assert.deepEqual(names, [...names].sort());
  const dmgHash = createHash('sha256').update('dmg').digest('hex');
  assert.ok(lines.includes(`${dmgHash}  Vmark-0.5.0-arm64.dmg`));
});

test('verifyRemoteAssets：缺文件、未上传完、sha256 不一致都拦住', () => {
  const dir = releaseDir();
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), checksums(dir));
  const all = [...releaseFiles(dir), 'SHA256SUMS.txt'].map((name) => ({
    name,
    state: 'uploaded',
    digest: `sha256:${createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex')}`,
  }));
  assert.deepEqual(verifyRemoteAssets(all, dir), []);
  const broken = all
    .filter((a) => a.name !== 'latest.yml')
    .map((a) => (a.name === 'Vmark-0.5.0-amd64.deb' ? { ...a, digest: 'sha256:00' } : a.name === 'latest-mac.yml' ? { ...a, state: 'starter' } : a));
  const errors = verifyRemoteAssets(broken, dir);
  assert.ok(errors.includes('GitHub 上缺少 latest.yml'));
  assert.ok(errors.some((e) => e.startsWith('Vmark-0.5.0-amd64.deb 的 sha256 不一致')));
  assert.ok(errors.some((e) => e.includes('latest-mac.yml 还没上传完成')));
  const noDigest = all.map(({ name }) => ({ name, size: fs.statSync(path.join(dir, name)).size }));
  assert.deepEqual(verifyRemoteAssets(noDigest, dir), [], '旧 API 没有 digest 时按大小核对');
});

test('CLI：check 失败退出码非 0；checksums 写出 SHA256SUMS.txt', () => {
  const good = releaseDir();
  assert.match(execFileSync('node', [CLI, 'check', good, 'v0.5.0'], { encoding: 'utf8' }), /✓ 10 个产物齐全/);
  assert.throws(() => execFileSync('node', [CLI, 'check', releaseDir('0.4.0', 'Vmark Setup 0.4.0.exe'), 'v0.4.0'], { stdio: 'pipe' }));
  execFileSync('node', [CLI, 'checksums', good], { encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(good, 'SHA256SUMS.txt')));
});
