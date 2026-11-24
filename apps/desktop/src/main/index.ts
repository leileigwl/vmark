import { app, BrowserWindow, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { IPC_EVENT_CHANNELS } from '@vcat/shared';
import {
  readAppConfig,
  recordRecentWorkspace,
  resolveSafePath,
  writeAppConfig,
  type MainIpcContext,
} from './ipc/context';
import {
  CHROME_DESKTOP_UA,
  checkAuthStatesOnce,
  startHeartbeatEngine,
  stopHeartbeatEngine,
} from './ipc/platform-auth/index';
import { registerAllIpcHandlers } from './ipc/registry';
import { protectEditorWindow } from './editorSafety';

export { CHROME_DESKTOP_UA };

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vcat-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true },
  },
]);

function getAppIconPath(): string | undefined {
  const candidates = [
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
  ];
  return candidates.find((p) => existsSync(p));
}

let activeMainWindow: BrowserWindow | null = null;
let currentRecentFiles: string[] = [];

function sendMenuAction(action: string, payload?: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send(IPC_EVENT_CHANNELS.onMenuAction, action, payload);
}

function createWindow(): void {
  const iconPath = getAppIconPath();
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 10 },
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  activeMainWindow = mainWindow;
  protectEditorWindow(mainWindow);
  mainWindow.on('closed', () => {
    if (activeMainWindow === mainWindow) activeMainWindow = null;
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send(IPC_EVENT_CHANNELS.onMenuAction, 'window:fullscreen');
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send(IPC_EVENT_CHANNELS.onMenuAction, 'window:unfullscreen');
  });

  mainWindow.on('focus', () => {
    void checkAuthStatesOnce({ readAppConfig, getMainWindow: () => activeMainWindow }).catch((err) => console.warn('[platform-auth] 聚焦时检测失败', err));
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function buildApplicationMenu(recentFiles: string[] = currentRecentFiles): void {
  currentRecentFiles = recentFiles.slice(0, 5);
  const isMac = process.platform === 'darwin';
  const recentSubmenu: Electron.MenuItemConstructorOptions[] =
    currentRecentFiles.length > 0
      ? [
          ...currentRecentFiles.map((relPath) => ({
            label: relPath,
            click: () => sendMenuAction('file:openRecent', relPath),
          })),
          { type: 'separator' as const },
          { label: '清除最近记录', click: () => sendMenuAction('file:clearRecent') },
        ]
      : [{ label: '暂无最近文件', enabled: false }];
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'Vmark',
            submenu: [
              { label: '关于 Vmark（维记）', role: 'about' as const },
              { type: 'separator' as const },
              { label: '偏好设置...', accelerator: 'Cmd+,', click: () => sendMenuAction('view:settings') },
              { type: 'separator' as const },
              { label: '隐藏', role: 'hide' as const },
              { label: '退出', role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: '文件',
      submenu: [
        { label: '新建文章', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('file:new') },
        { label: '新建窗口', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
        { type: 'separator' },
        { label: '打开本地工作区...', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('file:openWorkspace') },
        { label: '快速打开...', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendMenuAction('file:quickOpen') },
        { label: '打开最近文件', submenu: recentSubmenu },
        { type: 'separator' },
        { label: '关闭窗口', accelerator: 'CmdOrCtrl+W', click: () => BrowserWindow.getFocusedWindow()?.close() },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('file:save') },
        { label: '在 Finder 中显示', click: () => sendMenuAction('file:reveal') },
        {
          label: '导出',
          submenu: [
            { label: 'PDF', click: () => sendMenuAction('file:export', 'pdf') },
            { label: 'HTML', click: () => sendMenuAction('file:export', 'html') },
            { label: 'Word (.docx)', click: () => sendMenuAction('file:export', 'docx') },
            { type: 'separator' },
            { label: '使用上一次设置导出', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendMenuAction('file:export', 'default') },
          ],
        },
        { type: 'separator' },
        { label: '合并分发...', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendMenuAction('publish:open') },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => sendMenuAction('edit:undo') },
        { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendMenuAction('edit:redo') },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '拷贝', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '粘贴为纯文本', accelerator: 'CmdOrCtrl+Shift+V', role: 'pasteAndMatchStyle' },
        { label: '全选', role: 'selectAll' },
        { type: 'separator' },
        { label: '查找与替换...', accelerator: 'CmdOrCtrl+F', click: () => sendMenuAction('editor:find') },
      ],
    },
    {
      label: '段落',
      submenu: [
        { label: '一级标题', accelerator: 'CmdOrCtrl+1', click: () => sendMenuAction('editor:format', 'h1') },
        { label: '二级标题', accelerator: 'CmdOrCtrl+2', click: () => sendMenuAction('editor:format', 'h2') },
        { label: '三级标题', accelerator: 'CmdOrCtrl+3', click: () => sendMenuAction('editor:format', 'h3') },
        { label: '四级标题', accelerator: 'CmdOrCtrl+4', click: () => sendMenuAction('editor:format', 'h4') },
        { label: '五级标题', accelerator: 'CmdOrCtrl+5', click: () => sendMenuAction('editor:format', 'h5') },
        { label: '六级标题', accelerator: 'CmdOrCtrl+6', click: () => sendMenuAction('editor:format', 'h6') },
        { type: 'separator' },
        { label: '代码块', accelerator: 'Alt+CmdOrCtrl+C', click: () => sendMenuAction('editor:format', 'code-block') },
        { label: '引用', accelerator: 'Alt+CmdOrCtrl+Q', click: () => sendMenuAction('editor:format', 'quote') },
        { label: '有序列表', accelerator: 'Alt+CmdOrCtrl+O', click: () => sendMenuAction('editor:format', 'ordered-list') },
        { label: '无序列表', accelerator: 'Alt+CmdOrCtrl+U', click: () => sendMenuAction('editor:format', 'list') },
        { label: '任务列表', accelerator: 'Alt+CmdOrCtrl+X', click: () => sendMenuAction('editor:format', 'check') },
        { label: '水平分割线', accelerator: 'Alt+CmdOrCtrl+-', click: () => sendMenuAction('editor:format', 'line') },
      ],
    },
    {
      label: '格式',
      submenu: [
        { label: '加粗', accelerator: 'CmdOrCtrl+B', click: () => sendMenuAction('editor:format', 'bold') },
        { label: '斜体', accelerator: 'CmdOrCtrl+I', click: () => sendMenuAction('editor:format', 'italic') },
        { label: '行内代码', accelerator: 'Ctrl+`', click: () => sendMenuAction('editor:format', 'inline-code') },
        { label: '删除线', accelerator: 'Ctrl+Shift+`', click: () => sendMenuAction('editor:format', 'strike') },
        { label: '超链接', accelerator: 'CmdOrCtrl+K', click: () => sendMenuAction('editor:format', 'link') },
      ],
    },
    {
      label: '显示',
      submenu: [
        { label: '显示 / 隐藏侧边栏', accelerator: 'CmdOrCtrl+Shift+L', click: () => sendMenuAction('view:toggleSidebar') },
        { label: '大纲', accelerator: 'Ctrl+CmdOrCtrl+1', click: () => sendMenuAction('view:sideTab', 'outline') },
        { label: '文件树', accelerator: 'Ctrl+CmdOrCtrl+3', click: () => sendMenuAction('view:sideTab', 'files') },
        { type: 'separator' },
        { label: '文章管理台', click: () => sendMenuAction('view:manager') },
        { label: '写作台', click: () => sendMenuAction('view:editor') },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
      ],
    },
    {
      label: '主题',
      submenu: [
        { label: 'Apple Light（默认苹果白）', type: 'radio', checked: true, click: () => sendMenuAction('theme:set', 'apple-light') },
        { type: 'separator' },
        ...(
          [
            ['bloom-amber-dark', 'Bloom Amber Dark'],
            ['bloom-amber', 'Bloom Amber'],
            ['bloom-cinnabar-dark', 'Bloom Cinnabar Dark'],
            ['bloom-cinnabar', 'Bloom Cinnabar'],
            ['bloom-ink-dark', 'Bloom Ink Dark'],
            ['bloom-ink', 'Bloom Ink'],
            ['bloom-lapis-dark', 'Bloom Lapis Dark'],
            ['bloom-lapis', 'Bloom Lapis'],
            ['bloom-mist-dark', 'Bloom Mist Dark'],
            ['bloom-mist', 'Bloom Mist'],
            ['bloom-petal-dark', 'Bloom Petal Dark'],
            ['bloom-petal', 'Bloom Petal'],
            ['bloom-ripple-dark', 'Bloom Ripple Dark'],
            ['bloom-ripple', 'Bloom Ripple'],
            ['bloom-sage-dark', 'Bloom Sage Dark'],
            ['bloom-sage', 'Bloom Sage'],
            ['bloom-spring-dark', 'Bloom Spring Dark'],
            ['bloom-spring', 'Bloom Spring'],
            ['bloom-stone-dark', 'Bloom Stone Dark'],
            ['bloom-stone', 'Bloom Stone'],
            ['bloom-verdant-dark', 'Bloom Verdant Dark'],
            ['bloom-verdant', 'Bloom Verdant'],
            ['bloom-wheat-dark', 'Bloom Wheat Dark'],
            ['bloom-wheat', 'Bloom Wheat'],
          ] as const
        ).map(([id, label]) => ({
          label,
          type: 'radio' as const,
          click: () => sendMenuAction('theme:set', id),
        })),
      ],
    },
    { label: '窗口', role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const ipcContext: MainIpcContext = {
  ipcMain,
  getMainWindow: () => activeMainWindow,
  sendMenuAction,
  buildApplicationMenu,
  readAppConfig,
  writeAppConfig,
  recordRecentWorkspace,
  resolveSafePath,
};

if (process.env.VMARK_USER_DATA_DIR) {
  app.setPath('userData', process.env.VMARK_USER_DATA_DIR);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.vcat.publisher');
  app.userAgentFallback = CHROME_DESKTOP_UA;

  if (process.platform === 'darwin') {
    const iconPath = getAppIconPath();
    if (iconPath) app.dock?.setIcon(iconPath);
  }

  protocol.handle('vcat-asset', async (request) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return new Response('Workspace not configured', { status: 404 });
    const url = new URL(request.url);
    const relPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    try {
      const target = resolveSafePath(cfg.workspacePath, relPath);
      return net.fetch(pathToFileURL(target).toString());
    } catch {
      return new Response('Forbidden', { status: 403 });
    }
  });

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  buildApplicationMenu();
  registerAllIpcHandlers(ipcContext);
  createWindow();
  startHeartbeatEngine(ipcContext);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopHeartbeatEngine();
  if (process.platform !== 'darwin') app.quit();
});
