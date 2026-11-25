import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkGithubLatestRelease,
  compareSemver,
  isNewerStableVersion,
  pickPlatformAssetUrl,
} from '../src/main/appUpdaterCore.ts';

test('compareSemver orders stable above prerelease and handles multi-digit segments', () => {
  assert.ok(compareSemver('0.3.0', '0.3.0-rc.1') > 0);
  assert.ok(compareSemver('0.3.0-rc.1', '0.3.0') < 0);
  assert.ok(compareSemver('0.10.0', '0.9.9') > 0);
  assert.equal(compareSemver('v0.3.0', '0.3.0'), 0);
  assert.ok(compareSemver('0.3.0-rc.2', '0.3.0-rc.1') > 0);
});

test('isNewerStableVersion ignores drafts/prereleases and upgrades rc to stable', () => {
  assert.equal(isNewerStableVersion('0.3.0-rc.1', 'v0.3.0'), true);
  assert.equal(isNewerStableVersion('0.3.0', 'v0.3.0'), false);
  assert.equal(isNewerStableVersion('0.3.0', 'v0.4.0-beta.1'), false);
  assert.equal(isNewerStableVersion('0.3.0', 'v0.4.0', { prerelease: true }), false);
  assert.equal(isNewerStableVersion('0.3.0', 'v0.4.0', { draft: true }), false);
  assert.equal(isNewerStableVersion('0.4.0', 'v0.3.9'), false);
});

test('pickPlatformAssetUrl selects matching OS/arch installer or falls back cleanly', () => {
  const assets = [
    { name: 'Vmark-0.4.0-x64.dmg', browser_download_url: 'https://example.com/x64.dmg' },
    { name: 'Vmark-0.4.0-arm64.dmg', browser_download_url: 'https://example.com/arm64.dmg' },
    { name: 'Vmark-0.4.0-setup.exe', browser_download_url: 'https://example.com/setup.exe' },
    { name: 'Vmark-0.4.0-x86_64.AppImage', browser_download_url: 'https://example.com/app.AppImage' },
    { name: 'vmark_0.4.0_amd64.deb', browser_download_url: 'https://example.com/app.deb' },
  ];
  const fallback = 'https://github.com/leileigwl/vmark/releases/tag/v0.4.0';

  assert.equal(pickPlatformAssetUrl(assets, 'darwin', 'arm64', fallback), 'https://example.com/arm64.dmg');
  assert.equal(pickPlatformAssetUrl(assets, 'darwin', 'x64', fallback), 'https://example.com/x64.dmg');
  assert.equal(pickPlatformAssetUrl(assets, 'win32', 'x64', fallback), 'https://example.com/setup.exe');
  assert.equal(pickPlatformAssetUrl(assets, 'linux', 'x64', fallback), 'https://example.com/app.AppImage');
  assert.equal(pickPlatformAssetUrl([], 'win32', 'x64', fallback), fallback);
});

test('checkGithubLatestRelease returns available when newer stable release exists', async () => {
  const state = await checkGithubLatestRelease({
    currentVersion: '0.3.0-rc.1',
    platform: 'darwin',
    arch: 'arm64',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          tag_name: 'v0.3.0',
          name: 'Vmark v0.3.0',
          body: '- 新增功能 A',
          html_url: 'https://github.com/leileigwl/vmark/releases/tag/v0.3.0',
          draft: false,
          prerelease: false,
          assets: [{ name: 'Vmark-0.3.0-arm64.dmg', browser_download_url: 'https://dl.example.com/v0.3.0.dmg' }],
        }),
        { status: 200 }
      ),
  });

  assert.equal(state.status, 'available');
  assert.equal(state.mode, 'manual');
  assert.equal(state.currentVersion, '0.3.0-rc.1');
  assert.equal(state.latestVersion, '0.3.0');
  assert.equal(state.releaseNotes, '- 新增功能 A');
  assert.equal(state.downloadUrl, 'https://dl.example.com/v0.3.0.dmg');
});

test('checkGithubLatestRelease returns not-available when equal and error cleanly on HTTP/network failure', async () => {
  const same = await checkGithubLatestRelease({
    currentVersion: '0.3.0',
    platform: 'win32',
    arch: 'x64',
    fetchImpl: async () =>
      new Response(JSON.stringify({ tag_name: 'v0.3.0', draft: false, prerelease: false }), { status: 200 }),
  });
  assert.equal(same.status, 'not-available');

  const httpFail = await checkGithubLatestRelease({
    currentVersion: '0.3.0',
    platform: 'win32',
    arch: 'x64',
    fetchImpl: async () => new Response('rate limit', { status: 403 }),
  });
  assert.equal(httpFail.status, 'error');
  assert.equal(httpFail.error, 'HTTP 403');

  const netFail = await checkGithubLatestRelease({
    currentVersion: '0.3.0',
    platform: 'win32',
    arch: 'x64',
    fetchImpl: async () => {
      throw new Error('network timeout');
    },
  });
  assert.equal(netFail.status, 'error');
  assert.equal(netFail.error, 'network timeout');
});
