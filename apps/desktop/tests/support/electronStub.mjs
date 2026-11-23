// 测试用的最小 Electron 假实现：语义对齐真实 Electron——
// win.destroy() 只发 'closed'，不发 'close'；win.close() 先发 'close' 再发 'closed'；
// WebContentsView 的 webContents 不会随窗口销毁自动销毁，必须显式 webContents.close()。
import { EventEmitter } from 'node:events';

export const registry = (globalThis.__vmarkElectronStub ??= { windows: [], views: [] });

class FakeWebContents extends EventEmitter {
  destroyed = false;
  closeCalls = 0;
  isDestroyed() { return this.destroyed; }
  close() {
    this.closeCalls += 1;
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('destroyed');
  }
  loadURL() { return Promise.resolve(); }
  executeJavaScript() { return Promise.resolve(); }
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

export default { BrowserWindow, WebContentsView };
