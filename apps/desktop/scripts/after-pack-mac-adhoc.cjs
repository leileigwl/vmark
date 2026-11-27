'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * electron-builder afterPack hook:
 * 在未配置 Apple Developer 签名证书（CSC_LINK 未设置）时，对 macOS .app 执行 ad-hoc（`-`）深度重签名并校验，
 * 修复 `identity: null` + 替换 Info.plist/asar 后残留的签名结构损坏问题（`code has no resources but signature indicates they must be present`）。
 *
 * @param {import('electron-builder').AfterPackContext} context
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') {
    return;
  }

  if (process.env.CSC_LINK) {
    console.log('[after-pack] 检测到 CSC_LINK，跳过 ad-hoc 签名，交给正式证书签名流程');
    return;
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!fs.existsSync(appPath)) {
    throw new Error(`[after-pack] 找不到待签名的 macOS 应用包: ${appPath}`);
  }

  console.log(`[after-pack] 正在执行 macOS ad-hoc 签名: ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log(`[after-pack] ✓ ad-hoc 签名并校验通过: ${appPath}`);
};
