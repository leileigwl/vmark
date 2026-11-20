import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyChromeHeadersToRecord,
  buildChromeBrowserHeaders,
  buildStealthMainWorldScript,
  CHROME_MAJOR_VERSION,
  decodeFingerprintArg,
  encodeFingerprintArg,
  getPlatformFingerprintProfile,
} from '../src/main/browserStealth.ts';

test('buildChromeBrowserHeaders and applyChromeHeadersToRecord normalize UA and Sec-CH-UA* headers', () => {
  const macHeaders = buildChromeBrowserHeaders('darwin');
  assert.match(macHeaders['User-Agent'], new RegExp(`Chrome/${CHROME_MAJOR_VERSION}\\.0\\.0\\.0`));
  assert.equal(macHeaders['Sec-CH-UA-Platform'], '"macOS"');
  assert.equal(macHeaders['Sec-CH-UA-Mobile'], '?0');
  assert.ok(macHeaders['Sec-CH-UA'].includes(`v="${CHROME_MAJOR_VERSION}"`));

  const merged = applyChromeHeadersToRecord(
    { 'user-agent': 'Electron/33', 'sec-ch-ua': '"Electron"', Referer: 'https://www.xiaohongshu.com/' },
    'win32'
  );
  assert.equal(merged['user-agent'], undefined);
  assert.equal(merged['sec-ch-ua'], undefined);
  assert.equal(merged['Sec-CH-UA-Platform'], '"Windows"');
  assert.equal(merged.Referer, 'https://www.xiaohongshu.com/');
});

test('getPlatformFingerprintProfile isolates fingerprint seeds per platform and round-trips via argv', () => {
  const xhs = getPlatformFingerprintProfile('xiaohongshu', 'darwin');
  const dy = getPlatformFingerprintProfile('douyin', 'darwin');
  const xhsAgain = getPlatformFingerprintProfile('xiaohongshu', 'darwin');

  assert.deepEqual(xhs, xhsAgain);
  assert.notEqual(xhs.seed, dy.seed);

  const arg = encodeFingerprintArg(xhs);
  const decoded = decodeFingerprintArg(['--other=1', arg]);
  assert.deepEqual(decoded, xhs);
  assert.equal(decodeFingerprintArg(['--vmark-fp=invalid-base64']), null);

  const script = buildStealthMainWorldScript(xhs);
  assert.ok(script.includes("Object.defineProperty(Navigator.prototype, 'webdriver'"));
  assert.ok(script.includes('CanvasRenderingContext2D.prototype.getImageData'));
  assert.ok(script.includes('WebGLRenderingContext.prototype.getParameter'));
});
