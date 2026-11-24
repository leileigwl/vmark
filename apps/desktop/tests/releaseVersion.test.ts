import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { listAsarFiles, readAsarFile } from '../scripts/asar-read.mjs';
import { ciTag, nextReleaseTag, syncPackageVersion, tagToVersion, verifyRelease } from '../scripts/release-version.mjs';

/** 发布版本号：tag v0.3.0-beta.1 打出来的包必须是 0.3.0-beta.1，而不是 package.json 里一直没改的 0.1.0。 */
const here = path.dirname(fileURLToPath(import.meta.url));

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-release-'));
}

/** 按 asar 格式写一个最小包：[4][头 pickle 长度][载荷长度][JSON 长度][JSON][数据]。 */
function writeAsar(file: string, entries: Record<string, string>): void {
  type AsarNode = { files: Record<string, AsarNode> } | { size: number; offset: string };
  const files: Record<string, AsarNode> = {};
  const chunks: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.from(content, 'utf8');
    const parts = name.split('/');
    let dir = files;
    for (const part of parts.slice(0, -1)) {
      const next = dir[part] ?? { files: {} };
      dir[part] = next;
      if (!('files' in next)) throw new Error(`${part} 不是目录`);
      dir = next.files;
    }
    dir[parts[parts.length - 1]] = { size: data.length, offset: String(offset) };
    chunks.push(data);
    offset += data.length;
  }
  const json = Buffer.from(JSON.stringify({ files }), 'utf8');
  const padded = Math.ceil(json.length / 4) * 4;
  const headerPickle = Buffer.alloc(8 + padded);
  headerPickle.writeUInt32LE(4 + padded, 0);
  headerPickle.writeUInt32LE(json.length, 4);
  json.copy(headerPickle, 8);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([sizePickle, headerPickle, ...chunks]));
}

/** 模拟 electron-builder 的 release 目录：一个安装包 + linux-unpacked/resources/app.asar。 */
function fakeRelease(installerVersion: string, asarVersion: string): string {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, `Vmark-${installerVersion}-x86_64.AppImage`), 'x');
  fs.writeFileSync(path.join(dir, `Vmark-${installerVersion}-x86_64.AppImage.blockmap`), 'x');
  writeAsar(path.join(dir, 'linux-unpacked/resources/app.asar'), {
    'package.json': JSON.stringify({ name: '@vcat/desktop', version: asarVersion }),
    'out/renderer/index.html': '<html></html>',
  });
  return dir;
}

test('tagToVersion：去掉 v，支持预发布后缀；不合法的 tag 报错', () => {
  assert.equal(tagToVersion('v0.2.0'), '0.2.0');
  assert.equal(tagToVersion('v0.3.0-beta.1'), '0.3.0-beta.1');
  assert.throws(() => tagToVersion('test'), /不是有效的版本 tag/);
  assert.throws(() => tagToVersion('0.2.0'), /不是有效的版本 tag/);
  assert.throws(() => tagToVersion(''), /不是有效的版本 tag/);
});

test('syncPackageVersion：只改 version 字段，保持格式和其他字段', () => {
  const dir = tmpDir();
  const pkgPath = path.join(dir, 'package.json');
  const original = { name: '@vcat/desktop', version: '0.1.0', build: { appId: 'com.vmark.desktop' } };
  fs.writeFileSync(pkgPath, `${JSON.stringify(original, null, 2)}\n`);
  assert.equal(syncPackageVersion('v0.3.0-beta.1', pkgPath), '0.3.0-beta.1');
  assert.equal(fs.readFileSync(pkgPath, 'utf8'), `${JSON.stringify({ ...original, version: '0.3.0-beta.1' }, null, 2)}\n`);
});

test('asar 读取：能列出文件并读出 package.json', () => {
  const file = path.join(tmpDir(), 'app.asar');
  writeAsar(file, { 'package.json': '{"version":"9.9.9"}', 'out/a/b.txt': 'hi' });
  assert.deepEqual(listAsarFiles(file).map((f) => f.path).sort(), ['out/a/b.txt', 'package.json']);
  assert.equal(readAsarFile(file, 'out/a/b.txt').toString('utf8'), 'hi');
  assert.equal(JSON.parse(readAsarFile(file, 'package.json').toString('utf8')).version, '9.9.9');
});

test('verifyRelease：复现维护者看到的问题——tag v0.3.0-beta.1 但产物是 0.1.0 时必须失败', () => {
  const r = verifyRelease('v0.3.0-beta.1', fakeRelease('0.1.0', '0.1.0'));
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /安装包文件名不含版本 0\.3\.0-beta\.1：Vmark-0\.1\.0-x86_64\.AppImage/);
  assert.match(r.errors[1], /package\.json 版本是 0\.1\.0，应为 0\.3\.0-beta\.1/);
});

test('verifyRelease：文件名对但 app.asar 里版本不对也失败；全对才通过；没有安装包也失败', () => {
  assert.equal(verifyRelease('v0.3.0', fakeRelease('0.3.0', '0.1.0')).errors.length, 1);
  assert.deepEqual(verifyRelease('v0.3.0', fakeRelease('0.3.0', '0.3.0')).errors, []);
  assert.match(verifyRelease('v0.3.0', tmpDir()).errors.join('\n'), /没有安装包/);
});

test('nextReleaseTag：预发布版转正；有 feat 升次版本；否则升补丁', () => {
  assert.equal(nextReleaseTag('v0.3.0-beta.1', true), 'v0.3.0');
  assert.equal(nextReleaseTag('v0.3.0-beta.1', false), 'v0.3.0');
  assert.equal(nextReleaseTag('v0.2.0', true), 'v0.3.0');
  assert.equal(nextReleaseTag('v0.2.0', false), 'v0.2.1');
  assert.equal(nextReleaseTag('', false), 'v0.1.0');
});

test('ciTag：只有 GitHub Actions 在 tag 上运行时才返回 tag', () => {
  assert.equal(ciTag({ GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.3.0-beta.1' }), 'v0.3.0-beta.1');
  assert.equal(ciTag({ GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'test' }), null);
  assert.equal(ciTag({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.3.0' }), null);
  assert.equal(ciTag({}), null);
});

test('package:mac/win/linux（release.yml 打包时调用）：打包前从 tag 同步版本，打包后校验产物版本', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(here, '../package.json'), 'utf8')) as { scripts: Record<string, string> };
  for (const name of ['package:mac', 'package:win', 'package:linux']) {
    const script = pkg.scripts[name];
    const sync = script.indexOf('release-version.mjs sync-ci');
    const build = script.indexOf('electron-builder');
    const verify = script.indexOf('release-version.mjs verify-ci');
    assert.ok(sync > 0, `${name} 没有同步版本`);
    assert.ok(build > sync, `${name}：同步版本必须在 electron-builder 之前`);
    assert.ok(verify > build, `${name}：校验产物版本必须在 electron-builder 之后`);
  }
});
