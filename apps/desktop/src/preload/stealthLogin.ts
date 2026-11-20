import { webFrame } from 'electron';

/**
 * Minimal anti-detection script executed in the page's main world before page scripts run.
 * Masks `navigator.webdriver` and normalizes basic Chrome browser fingerprint properties.
 */
const STEALTH_MAIN_WORLD_SCRIPT = `
(() => {
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
  } catch {}
  try {
    Object.defineProperty(Navigator.prototype, 'languages', {
      get: () => ['zh-CN', 'zh', 'en-US', 'en'],
      configurable: true,
    });
  } catch {}
  try {
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', {
        value: { runtime: {}, app: { isInstalled: false } },
        configurable: true,
      });
    }
  } catch {}
  try {
    if (navigator.plugins && navigator.plugins.length === 0) {
      const fakePlugins = [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      ];
      Object.defineProperty(Navigator.prototype, 'plugins', {
        get: () => fakePlugins,
        configurable: true,
      });
    }
  } catch {}
})();
`;

void webFrame.executeJavaScript(STEALTH_MAIN_WORLD_SCRIPT).catch(() => {});
