// 测试用的最小 Electron 假实现：语义对齐真实 Electron——
// win.destroy() 只发 'closed'，不发 'close'；win.close() 先发 'close' 再发 'closed'；
// WebContentsView 的 webContents 不会随窗口销毁自动销毁，必须显式 webContents.close()。
import { EventEmitter } from 'node:events';

export const registry = (globalThis.__vmarkElectronStub ??= { windows: [], views: [] });
// 凭据加密测试用：app 路径、safeStorage（系统钥匙串）和 dialog 都由测试控制。
registry.paths ??= {};
registry.safeStorage ??= { available: true, backend: 'gnome_libsecret', failEncrypt: false, failDecrypt: false };
registry.dialogs ??= [];

class FakeWebContents extends EventEmitter {
  destroyed = false;
  closeCalls = 0;
  /** executeJavaScript 收到的脚本，按调用顺序记录。 */
  scripts = [];
  isDestroyed() { return this.destroyed; }
  close() {
    this.closeCalls += 1;
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('destroyed');
  }
  loadURL() { return Promise.resolve(); }
  executeJavaScript(code) {
    this.scripts.push(code);
    return Promise.resolve();
  }
  setUserAgent() {}
  setWindowOpenHandler() {}
  canGoBack() { return false; }
  goBack() {}
  reload() {}
}

export class WebContentsView {
  constructor() {
    this.webContents = new FakeWebContents();
    registry.views.push(this);
  }
  setBounds() {}
  setBackgroundColor() {}
}

export class BrowserWindow extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.destroyCalls = 0;
    this.backgroundColors = [];
    this.webContents = new FakeWebContents();
    const children = [];
    this.contentView = {
      children,
      addChildView: (v) => children.push(v),
      removeChildView: (v) => {
        const i = children.indexOf(v);
        if (i >= 0) children.splice(i, 1);
      },
    };
    registry.windows.push(this);
  }
  isDestroyed() { return this.destroyed; }
  getContentSize() { return [1120, 780]; }
  setBackgroundColor(color) { this.backgroundColors.push(color); }
  loadURL() { return Promise.resolve(); }
  destroy() {
    this.destroyCalls += 1;
    if (this.destroyed) return;
    this.destroyed = true;
    this.webContents.close();
    this.emit('closed');
  }
  close() {
    if (this.destroyed) return;
    let prevented = false;
    this.emit('close', { preventDefault: () => { prevented = true; } });
    if (!prevented) this.destroy();
  }
}

export const app = {
  getPath: (name) => {
    if (!registry.paths[name]) throw new Error(`stub app.getPath(${name}) not set`);
    return registry.paths[name];
  },
  isReady: () => true,
  whenReady: () => Promise.resolve(),
};

/** 假钥匙串：密文 = 'STUB1:' + 反转后的十六进制，磁盘上绝不会出现原文。 */
export const safeStorage = {
  isEncryptionAvailable: () => registry.safeStorage.available,
  getSelectedStorageBackend: () => registry.safeStorage.backend,
  encryptString(plain) {
    if (registry.safeStorage.failEncrypt) throw new Error('Error while encrypting the text provided to safeStorage.encryptString.');
    return Buffer.from(`STUB1:${[...Buffer.from(plain, 'utf8').toString('hex')].reverse().join('')}`, 'utf8');
  },
  decryptString(buf) {
    const s = Buffer.from(buf).toString('utf8');
    if (registry.safeStorage.failDecrypt || !s.startsWith('STUB1:')) throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
    return Buffer.from([...s.slice(6)].reverse().join(''), 'hex').toString('utf8');
  },
};

export const dialog = {
  showMessageBox: (...args) => {
    registry.dialogs.push(args[args.length - 1]);
    return Promise.resolve({ response: 0 });
  },
};

export default { BrowserWindow, WebContentsView, app, safeStorage, dialog };

// 主进程 IPC 模块会具名导入下面这些；测试只需要它们能被导入，不会真正调用。
export const clipboard = { writeImage() {}, writeText() {} };
export const Menu = { buildFromTemplate: () => ({ popup() {} }) };
export const nativeImage = { createFromBuffer: () => ({}) };
export const net = { fetch: () => Promise.reject(new Error('stub net.fetch 不可用')) };
