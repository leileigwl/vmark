import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, net, protocol, session, shell } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { buildArticleMeta, scanWorkspaceArticles } from '@vcat/core';
import {
  buildPicgoEnv,
  createImageBedUploader,
  resolvePicgoBinary,
  saveImageToAssets,
} from '@vcat/image-pipeline';
import type {
  ContextMenuOptions,
  ExportArticleOptions,
  ImageBedConfig,
  PlatformId,
  StartupConfig,
} from '@vcat/shared';
import { WeixinAdapter } from '@vcat/adapters';
import {
  batchSyncHeartbeatResults,
  readAccountDatabase,
  upsertAccountRecord,
} from './accountStore';
import { markdownToDocxBuffer } from './exportDocx';
import {
  checkPlatformAuthStates,
  createSessionFetch,
  hasSessionAuthCookies,
  PLATFORM_AUTH_COOKIE_RULES,
  registerPublishHandlers,
  verifyPlatformAuth,
} from './publishHandlers';

const execFileAsync = promisify(execFile);

export const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vcat-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true },
  },
]);

interface AppConfig {
  workspacePath: string | null;
  recentWorkspaces: string[];
  imageBed: ImageBedConfig;
  startup?: StartupConfig;
}

const DEFAULT_CONFIG: AppConfig = {
  workspacePath: null,
  recentWorkspaces: [],
  imageBed: { strategy: 'platform_private' },
  startup: { mode: 'last_opened' },
};

function recordRecentWorkspace(cfg: AppConfig, dirPath: string): void {
  cfg.workspacePath = dirPath;
  cfg.recentWorkspaces = [dirPath, ...cfg.recentWorkspaces.filter((p) => p !== dirPath)].slice(0, 8);
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'vcat-config.json');
}

async function readAppConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    const defaultDir = path.join(app.getPath('documents'), 'VCatBlogs');
    await fs.mkdir(defaultDir, { recursive: true });
    return { ...DEFAULT_CONFIG, workspacePath: defaultDir };
  }
}

async function writeAppConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

/** Prevents path traversal outside the active workspace directory. */
function resolveSafePath(workspaceRoot: string, relativePath: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const target = path.resolve(resolvedRoot, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Access denied: path escapes workspace root');
  }
  return target;
}

function getAppIconPath(): string | undefined {
  const candidates = [
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
  ];
  return candidates.find((p) => existsSync(p));
}

let activeMainWindow: BrowserWindow | null = null;

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
  mainWindow.on('closed', () => {
    if (activeMainWindow === mainWindow) activeMainWindow = null;
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('menu:action', 'window:fullscreen');
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('menu:action', 'window:unfullscreen');
  });

  mainWindow.on('focus', () => {
    void checkPlatformAuthStates({ session, getAppConfig: readAppConfig }).then(async (states) => {
      await batchSyncHeartbeatResults(states);
      activeMainWindow?.webContents.send('platform:authStatesUpdated', states);
    });
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

function sendMenuAction(action: string, payload?: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send('menu:action', action, payload);
}

let currentRecentFiles: string[] = [];

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
              {
                label: '偏好设置...',
                accelerator: 'Cmd+,',
                click: () => sendMenuAction('view:settings'),
              },
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
    {
      label: '窗口',
      role: 'windowMenu',
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpcHandlers(): void {
  ipcMain.handle('workspace:get', async () => {
    const cfg = await readAppConfig();
    if (cfg.workspacePath && !cfg.recentWorkspaces.includes(cfg.workspacePath)) {
      recordRecentWorkspace(cfg, cfg.workspacePath);
      await writeAppConfig(cfg);
    }
    return cfg.workspacePath;
  });

  ipcMain.handle('workspace:recent', async () => {
    const cfg = await readAppConfig();
    return cfg.recentWorkspaces;
  });

  ipcMain.handle('workspace:switch', async (_event, dirPath: string) => {
    if (!existsSync(dirPath)) return null;
    const cfg = await readAppConfig();
    recordRecentWorkspace(cfg, dirPath);
    await writeAppConfig(cfg);
    return cfg.workspacePath;
  });

  ipcMain.handle('workspace:showInFinder', async (_event, relativePath?: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return;
    if (relativePath) {
      const target = resolveSafePath(cfg.workspacePath, relativePath);
      shell.showItemInFolder(target);
    } else {
      await shell.openPath(cfg.workspacePath);
    }
  });

  ipcMain.on('menu:setRecentFiles', (_event, paths: string[]) => {
    if (Array.isArray(paths)) {
      buildApplicationMenu(paths);
    }
  });

  ipcMain.handle('workspace:select', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择本地 Markdown 博客工作区',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const cfg = await readAppConfig();
    recordRecentWorkspace(cfg, result.filePaths[0]);
    await writeAppConfig(cfg);
    return cfg.workspacePath;
  });

  ipcMain.handle('articles:list', async () => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return [];
    await fs.mkdir(cfg.workspacePath, { recursive: true });
    return scanWorkspaceArticles(cfg.workspacePath);
  });

  ipcMain.handle('folders:list', async () => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return [];
    const dirs: string[] = [];
    async function walk(dir: string, prefix = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'assets' || entry.name === 'node_modules') {
          continue;
        }
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        dirs.push(rel);
        await walk(path.join(dir, entry.name), rel);
      }
    }
    await walk(cfg.workspacePath);
    return dirs.sort((a, b) => a.localeCompare(b));
  });

  ipcMain.handle('folders:create', async (_event, folderName: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const cleanName = folderName.trim().replace(/^[\\/]+|[\\/]+$/g, '');
    if (!cleanName) throw new Error('文件夹名称不能为空');
    const parts = cleanName.split('/');
    const baseName = parts.pop() || '新建文件夹';
    const parentRel = parts.join('/');
    let candidate = cleanName;
    let target = resolveSafePath(cfg.workspacePath, candidate);
    let idx = 2;
    while (existsSync(target)) {
      const nextName = `${baseName} ${idx}`;
      candidate = parentRel ? `${parentRel}/${nextName}` : nextName;
      target = resolveSafePath(cfg.workspacePath, candidate);
      idx++;
    }
    await fs.mkdir(target, { recursive: true });
    return candidate;
  });

  ipcMain.handle('folders:delete', async (_event, folderPath: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const cleanPath = folderPath.trim().replace(/^[\\/]+|[\\/]+$/g, '');
    if (!cleanPath) return;
    const target = resolveSafePath(cfg.workspacePath, cleanPath);
    if (existsSync(target)) {
      await shell.trashItem(target);
    }
  });

  ipcMain.handle('folders:move', async (_event, oldFolderPath: string, targetParentFolder: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const cleanOld = oldFolderPath.trim().replace(/^[\\/]+|[\\/]+$/g, '');
    const cleanParent = targetParentFolder.trim().replace(/^[\\/]+|[\\/]+$/g, '');
    if (!cleanOld) throw new Error('源文件夹路径无效');
    if (cleanParent === cleanOld || cleanParent.startsWith(`${cleanOld}/`)) {
      throw new Error('不能将文件夹移动到自身或子文件夹内');
    }
    const baseName = path.basename(cleanOld);
    const newRel = cleanParent ? path.join(cleanParent, baseName) : baseName;
    const oldTarget = resolveSafePath(cfg.workspacePath, cleanOld);
    const newTarget = resolveSafePath(cfg.workspacePath, newRel);
    if (oldTarget === newTarget) return newRel;
    if (existsSync(newTarget)) {
      throw new Error(`目标目录已存在同名文件夹：${baseName}`);
    }
    await fs.mkdir(path.dirname(newTarget), { recursive: true });
    await fs.rename(oldTarget, newTarget);
    return newRel;
  });

  ipcMain.handle('articles:read', async (_event, relativePath: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const target = resolveSafePath(cfg.workspacePath, relativePath);
    return fs.readFile(target, 'utf-8');
  });

  ipcMain.handle('articles:save', async (_event, relativePath: string, content: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const target = resolveSafePath(cfg.workspacePath, relativePath);
    await fs.writeFile(target, content, 'utf-8');
    const stat = await fs.stat(target);
    return { updatedAt: stat.mtimeMs };
  });

  ipcMain.handle('articles:create', async (_event, fileName?: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');

    let safeName = fileName?.trim();
    if (!safeName) {
      // Sequential Typora-style naming: Untitled.md, Untitled 2.md, Untitled 3.md...
      let candidate = 'Untitled.md';
      let index = 2;
      while (existsSync(resolveSafePath(cfg.workspacePath, candidate))) {
        candidate = `Untitled ${index}.md`;
        index++;
      }
      safeName = candidate;
    } else if (!safeName.endsWith('.md')) {
      safeName = `${safeName}.md`;
    }

    const target = resolveSafePath(cfg.workspacePath, safeName);
    const title = path.basename(safeName, '.md');
    const initialContent = `# ${title}\n\n`;
    await fs.writeFile(target, initialContent, 'utf-8');
    const stat = await fs.stat(target);
    return buildArticleMeta(initialContent, safeName, target, stat.mtimeMs);
  });

  ipcMain.handle('articles:rename', async (_event, oldRelativePath: string, newFileName: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const cleanNew = newFileName.trim().replace(/[\\/]/g, '');
    if (!cleanNew) throw new Error('文件名不能为空');
    const finalName = cleanNew.includes('.') ? cleanNew : `${cleanNew}.md`;
    const dir = path.dirname(oldRelativePath);
    const newRelativePath = dir === '.' ? finalName : path.join(dir, finalName);

    const oldTarget = resolveSafePath(cfg.workspacePath, oldRelativePath);
    const newTarget = resolveSafePath(cfg.workspacePath, newRelativePath);
    if (oldTarget !== newTarget && existsSync(newTarget)) {
      throw new Error(`目标文件已存在：${finalName}`);
    }
    await fs.rename(oldTarget, newTarget);
    const content = await fs.readFile(newTarget, 'utf-8');
    const stat = await fs.stat(newTarget);
    return buildArticleMeta(content, newRelativePath, newTarget, stat.mtimeMs);
  });

  ipcMain.handle('articles:move', async (_event, oldRelativePath: string, targetFolder: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const fileName = path.basename(oldRelativePath);
    const cleanFolder = targetFolder.trim().replace(/^[\\/]+|[\\/]+$/g, '');
    const newRelativePath = cleanFolder ? path.join(cleanFolder, fileName) : fileName;

    const oldTarget = resolveSafePath(cfg.workspacePath, oldRelativePath);
    const newTarget = resolveSafePath(cfg.workspacePath, newRelativePath);
    if (oldTarget === newTarget) {
      const content = await fs.readFile(oldTarget, 'utf-8');
      const stat = await fs.stat(oldTarget);
      return buildArticleMeta(content, oldRelativePath, oldTarget, stat.mtimeMs);
    }
    if (existsSync(newTarget)) {
      throw new Error(`目标目录已存在同名文件：${fileName}`);
    }
    await fs.mkdir(path.dirname(newTarget), { recursive: true });
    await fs.rename(oldTarget, newTarget);
    const content = await fs.readFile(newTarget, 'utf-8');
    const stat = await fs.stat(newTarget);
    return buildArticleMeta(content, newRelativePath, newTarget, stat.mtimeMs);
  });

  ipcMain.handle('articles:delete', async (_event, relativePath: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const target = resolveSafePath(cfg.workspacePath, relativePath);
    await shell.trashItem(target);
  });

  ipcMain.handle('articles:duplicate', async (_event, relativePath: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const srcTarget = resolveSafePath(cfg.workspacePath, relativePath);
    const dir = path.dirname(relativePath);
    const base = path.basename(relativePath, '.md');
    let candidateName = `${base} copy.md`;
    let index = 2;
    while (existsSync(resolveSafePath(cfg.workspacePath, dir === '.' ? candidateName : path.join(dir, candidateName)))) {
      candidateName = `${base} copy ${index}.md`;
      index++;
    }
    const newRel = dir === '.' ? candidateName : path.join(dir, candidateName);
    const destTarget = resolveSafePath(cfg.workspacePath, newRel);
    await fs.copyFile(srcTarget, destTarget);
    const content = await fs.readFile(destTarget, 'utf-8');
    const stat = await fs.stat(destTarget);
    return buildArticleMeta(content, newRel, destTarget, stat.mtimeMs);
  });

  ipcMain.handle('articles:search', async (_event, query: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const metas = await scanWorkspaceArticles(cfg.workspacePath);
    const results: Array<{ relativePath: string; title: string; snippet: string; matchCount: number }> = [];
    for (const meta of metas) {
      try {
        const raw = await fs.readFile(meta.fullPath, 'utf-8');
        const lower = raw.toLowerCase();
        const fileMatch = meta.relativePath.toLowerCase().includes(q) || meta.title.toLowerCase().includes(q);
        const firstIdx = lower.indexOf(q);
        if (!fileMatch && firstIdx === -1) continue;

        let matchCount = fileMatch ? 1 : 0;
        let snippet = '';
        if (firstIdx !== -1) {
          // Count occurrences in content
          let pos = firstIdx;
          matchCount = 0;
          while (pos !== -1) {
            matchCount++;
            pos = lower.indexOf(q, pos + q.length);
          }
          const start = Math.max(0, firstIdx - 24);
          const end = Math.min(raw.length, firstIdx + q.length + 48);
          snippet = (start > 0 ? '...' : '') + raw.slice(start, end).replace(/\s+/g, ' ') + (end < raw.length ? '...' : '');
        }
        results.push({
          relativePath: meta.relativePath,
          title: meta.title,
          snippet,
          matchCount,
        });
      } catch {
        // skip unreadable file
      }
    }
    return results;
  });

  ipcMain.handle('image:saveLocal', async (_event, base64Data: string, ext: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    return saveImageToAssets(cfg.workspacePath, buffer, ext);
  });

  ipcMain.handle('image:uploadRemote', async (_event, base64Data: string, fileName: string) => {
    const cfg = await readAppConfig();
    const cleanBase64 = base64Data.replace(/^data:image\/[\w+.-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const uploader = createImageBedUploader();
    const url = await uploader(buffer, fileName || 'image.png', cfg.imageBed);
    return { url };
  });

  ipcMain.handle('config:getImageBed', async () => {
    const cfg = await readAppConfig();
    return cfg.imageBed;
  });

  ipcMain.handle('config:saveImageBed', async (_event, imageBed: ImageBedConfig) => {
    const cfg = await readAppConfig();
    cfg.imageBed = imageBed;
    await writeAppConfig(cfg);
  });

  ipcMain.handle('config:getStartup', async () => {
    const cfg = await readAppConfig();
    return cfg.startup ?? { mode: 'last_opened' };
  });

  ipcMain.handle('config:saveStartup', async (_event, startup: StartupConfig) => {
    const cfg = await readAppConfig();
    cfg.startup = startup;
    await writeAppConfig(cfg);
  });

  ipcMain.handle('config:testImageBed', async (_event, imageBed: ImageBedConfig) => {
    const TINY_1X1_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    const provider = imageBed.provider ?? 'picgo_core';
    const uploader = createImageBedUploader();

    if (provider === 'picgo_core') {
      const bin = await resolvePicgoBinary(imageBed.picgoPath);
      let version = '';
      try {
        const { stdout } = await execFileAsync(bin, ['--version'], {
          env: buildPicgoEnv(),
          timeout: 5000,
        });
        version = stdout.trim();
      } catch {
        return {
          ok: false,
          message: `未检测到 PicGo-Core (${bin})，请先安装 pnpm add -g picgo 或填写正确路径`,
        };
      }
      try {
        const url = await uploader(TINY_1X1_PNG, 'vmark-connectivity-test.png', {
          ...imageBed,
          provider: 'picgo_core',
          picgoPath: bin,
        });
        return {
          ok: true,
          url,
          message: `PicGo-Core (${version}) 真实上传测试成功：${url}`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
    if (provider === 'github') {
      if (!imageBed.repo?.trim() || !imageBed.token?.trim()) {
        return { ok: false, message: '请填写 GitHub 仓库 (owner/repo) 与 Personal Access Token' };
      }
      try {
        const url = await uploader(TINY_1X1_PNG, 'vmark-connectivity-test.png', imageBed);
        return { ok: true, url, message: `GitHub 图床真实上传测试成功：${url}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
    if (provider === 'smms') {
      if (!imageBed.token?.trim()) {
        return { ok: false, message: '请填写 SM.MS API Token' };
      }
      try {
        const url = await uploader(TINY_1X1_PNG, 'vmark-connectivity-test.png', imageBed);
        return { ok: true, url, message: `SM.MS 图床真实上传测试成功：${url}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
    if (provider === 'imgur') {
      if (!imageBed.token?.trim()) {
        return { ok: false, message: '请填写 IMGUR API Token / Client ID' };
      }
      return { ok: true, message: 'IMGUR 图床凭证已就绪（建议通过 PicGo-Core 插件上传）' };
    }
    if (!imageBed.bucket?.trim() || !imageBed.accessKey?.trim() || !imageBed.secretKey?.trim()) {
      return { ok: false, message: '请填写完整的 Bucket / AccessKey / SecretKey' };
    }
    return {
      ok: true,
      message: `${provider} 对象存储参数校验通过（${imageBed.bucket}，建议配合 PicGo-Core 使用）`,
    };
  });

  ipcMain.handle(
    'platform:openLogin',
    async (_event, platformId: PlatformId, loginUrl: string) => {
      const partition = `persist:platform_${platformId}`;
      const targetSession = session.fromPartition(partition);
      targetSession.setUserAgent(CHROME_DESKTOP_UA);

      targetSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = { ...details.responseHeaders };
        // Case-insensitive removal of frame and security policy restrictions
        for (const key of Object.keys(responseHeaders)) {
          const lower = key.toLowerCase();
          if (
            lower === 'x-frame-options' ||
            lower === 'content-security-policy' ||
            lower === 'content-security-policy-report-only'
          ) {
            delete responseHeaders[key];
          }
        }
        callback({ cancel: false, responseHeaders });
      });

      targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const requestHeaders = { ...details.requestHeaders };
        for (const key of Object.keys(requestHeaders)) {
          if (key.toLowerCase() === 'user-agent') {
            delete requestHeaders[key];
          }
        }
        requestHeaders['User-Agent'] = CHROME_DESKTOP_UA;
        callback({ cancel: false, requestHeaders });
      });

      const loginWin = new BrowserWindow({
        width: 1040,
        height: 740,
        title: `平台授权登录 - ${platformId}`,
        webPreferences: {
          partition,
          webSecurity: false,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      loginWin.webContents.setUserAgent(CHROME_DESKTOP_UA);

      loginWin.webContents.setWindowOpenHandler(() => ({
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            partition,
            webSecurity: false,
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      }));

      loginWin.webContents.on('did-create-window', (childWin) => {
        childWin.webContents.setUserAgent(CHROME_DESKTOP_UA);
      });

      loginWin.webContents.on('did-fail-load', (_ev, errorCode, errorDescription, validatedURL) => {
        if (errorCode === -3) return; // aborted / redirect
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head><meta charset="utf-8"><title>网络连接失败</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b;">
              <div style="background: white; padding: 36px 32px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); text-align: center; max-width: 440px; border: 1px solid #e2e8f0;">
                <div style="font-size: 42px; margin-bottom: 12px;">⚠️</div>
                <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">无法连接授权页面</h2>
                <p style="margin: 0 0 18px 0; font-size: 13px; color: #64748b; line-height: 1.6;">
                  连接至平台登录服务超时或受阻（错误码: <code>${errorCode}</code> ${errorDescription}）<br/>
                  <span style="font-size: 11px; color: #94a3b8; word-break: break-all;">${validatedURL}</span>
                </p>
                <button onclick="window.location.href='${validatedURL}'" style="background: #007aff; color: white; border: none; padding: 9px 24px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; box-shadow: 0 2px 6px rgba(0,122,255,0.25);">
                  重新尝试连接
                </button>
              </div>
            </body>
          </html>
        `;
        void loginWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
      });

      let authCheckTimer: NodeJS.Timeout | null = null;
      const cookieListener = (_ev: Electron.Event, _cookie: Electron.Cookie, _cause: unknown, removed?: boolean) => {
        if (removed) return;
        if (authCheckTimer) clearTimeout(authCheckTimer);
        authCheckTimer = setTimeout(async () => {
          const isAuthorized = await verifyPlatformAuth({ session, platformId, getAppConfig: readAppConfig });
          if (isAuthorized) {
            await upsertAccountRecord(platformId, {
              authorized: true,
              statusMessage: '授权有效',
            });
            activeMainWindow?.webContents.send('platform:authStatesUpdated', { [platformId]: true });
          }
        }, 1200);
      };

      targetSession.cookies.on('changed', cookieListener);

      try {
        await loginWin.loadURL(loginUrl);
      } catch {
        // Handled by did-fail-load
      }

      return new Promise<boolean>((resolve) => {
        loginWin.on('closed', async () => {
          if (authCheckTimer) clearTimeout(authCheckTimer);
          targetSession.cookies.removeListener('changed', cookieListener);
          const isAuthorized = await verifyPlatformAuth({ session, platformId, getAppConfig: readAppConfig });
          await upsertAccountRecord(platformId, {
            authorized: isAuthorized,
            statusMessage: isAuthorized ? '授权有效' : '未登录或已失效',
          });
          const allStates = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
          await batchSyncHeartbeatResults(allStates);
          activeMainWindow?.webContents.send('platform:authStatesUpdated', allStates);
          resolve(isAuthorized);
        });
      });
    }
  );

  ipcMain.handle('platform:logout', async (_event, platformId: PlatformId) => {
    const partition = `persist:platform_${platformId}`;
    const targetSession = session.fromPartition(partition);
    await targetSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
    });
    await targetSession.clearCache();
    await targetSession.clearAuthCache();
    await targetSession.cookies.flushStore();
    await upsertAccountRecord(platformId, {
      authorized: false,
      statusMessage: '未授权或已退出登录',
    });
    const states = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
    states[platformId] = false;
    await batchSyncHeartbeatResults(states, { [platformId]: '未授权或已退出登录' });
    activeMainWindow?.webContents.send('platform:authStatesUpdated', states);
    return true;
  });

  ipcMain.handle('platform:authStates', async () => {
    const states = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
    await batchSyncHeartbeatResults(states);
    return states;
  });

  ipcMain.handle('platform:getAccounts', async () => readAccountDatabase());

  ipcMain.handle('git:status', async () => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return { isGitRepo: false, changedFiles: 0 };
    try {
      const { stdout: branch } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: cfg.workspacePath,
      });
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--short'], {
        cwd: cfg.workspacePath,
      });
      const changedFiles = statusOut.trim() ? statusOut.trim().split('\n').length : 0;
      return { isGitRepo: true, branch: branch.trim(), changedFiles };
    } catch {
      return { isGitRepo: false, changedFiles: 0 };
    }
  });

  ipcMain.handle('git:push', async (_event, commitMessage: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return { ok: false, message: '未挂载本地工作区' };
    try {
      await execFileAsync('git', ['add', '.'], { cwd: cfg.workspacePath });
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--short'], {
        cwd: cfg.workspacePath,
      });
      if (statusOut.trim()) {
        await execFileAsync('git', ['commit', '-m', commitMessage || 'chore(blog): update post'], {
          cwd: cfg.workspacePath,
        });
      }
      await execFileAsync('git', ['push'], { cwd: cfg.workspacePath });
      return { ok: true, message: '已成功 Commit & Push 至 GitHub，CI/CD 已触发' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Git 推送失败：${msg}` };
    }
  });

  ipcMain.handle('editor:contextMenu', async (event, options: ContextMenuOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    if (options.inImage) {
      const currScale = options.imageScale ?? 50;
      const imageTemplate: Electron.MenuItemConstructorOptions[] = [
        {
          label: '放大预览 (空格)',
          click: () => sendMenuAction('editor:image', 'preview'),
        },
        {
          label: '复制图片',
          click: () => sendMenuAction('editor:image', 'copy'),
        },
        {
          label: '另存为图片...',
          click: () => sendMenuAction('editor:image', 'save'),
        },
      ];
      if (!options.readOnly) {
        imageTemplate.push(
          {
            label: '显示比例',
            submenu: [
              {
                label: '25%',
                type: 'radio',
                checked: currScale === 25,
                click: () => sendMenuAction('editor:image', 'scale:25'),
              },
              {
                label: '50%（默认）',
                type: 'radio',
                checked: currScale === 50,
                click: () => sendMenuAction('editor:image', 'scale:50'),
              },
              {
                label: '75%',
                type: 'radio',
                checked: currScale === 75,
                click: () => sendMenuAction('editor:image', 'scale:75'),
              },
              {
                label: '100%（原宽）',
                type: 'radio',
                checked: currScale === 100,
                click: () => sendMenuAction('editor:image', 'scale:100'),
              },
            ],
          },
          { type: 'separator' },
          {
            label: '删除图片',
            click: () => sendMenuAction('editor:image', 'delete'),
          }
        );
      }
      const imageMenu = Menu.buildFromTemplate(imageTemplate);
      imageMenu.popup({ window: win });
      return;
    }

    const tableItems: Electron.MenuItemConstructorOptions[] = options.inTable
      ? [
          { type: 'separator' },
          {
            label: '表格操作',
            submenu: [
              { label: '在上方插入行', click: () => sendMenuAction('editor:table', 'row-above') },
              { label: '在下方插入行', click: () => sendMenuAction('editor:table', 'row-below') },
              { type: 'separator' },
              { label: '在左侧插入列', click: () => sendMenuAction('editor:table', 'col-left') },
              { label: '在右侧插入列', click: () => sendMenuAction('editor:table', 'col-right') },
              { type: 'separator' },
              { label: '删除当前行', click: () => sendMenuAction('editor:table', 'row-delete') },
              { label: '删除当前列', click: () => sendMenuAction('editor:table', 'col-delete') },
              { type: 'separator' },
              { label: '复制表格', click: () => sendMenuAction('editor:table', 'table-copy') },
              { label: '删除表格', click: () => sendMenuAction('editor:table', 'table-delete') },
            ],
          },
        ]
      : [];

    const menu = Menu.buildFromTemplate([
      { label: '剪切', role: 'cut', enabled: options.hasSelection },
      { label: '拷贝', role: 'copy', enabled: options.hasSelection },
      { label: '粘贴', role: 'paste' },
      { type: 'separator' },
      {
        label: '格式',
        submenu: [
          { label: '加粗', accelerator: 'CmdOrCtrl+B', enabled: options.hasSelection, click: () => sendMenuAction('editor:format', 'bold') },
          { label: '斜体', accelerator: 'CmdOrCtrl+I', enabled: options.hasSelection, click: () => sendMenuAction('editor:format', 'italic') },
          { label: '删除线', enabled: options.hasSelection, click: () => sendMenuAction('editor:format', 'strike') },
          { label: '行内代码', enabled: options.hasSelection, click: () => sendMenuAction('editor:format', 'inline-code') },
          { label: '超链接', accelerator: 'CmdOrCtrl+K', enabled: options.hasSelection, click: () => sendMenuAction('editor:format', 'link') },
        ],
      },
      {
        label: '插入段落',
        submenu: [
          { label: '插入表格', click: () => sendMenuAction('editor:format', 'table') },
          { label: '插入代码块', click: () => sendMenuAction('editor:format', 'code-block') },
          { label: '插入引用', click: () => sendMenuAction('editor:format', 'quote') },
          { label: '插入任务列表', click: () => sendMenuAction('editor:format', 'check') },
          { label: '插入水平分割线', click: () => sendMenuAction('editor:format', 'line') },
        ],
      },
      ...tableItems,
    ]);
    menu.popup({ window: win });
  });

  async function resolveImageBuffer(src: string): Promise<{ buffer: Buffer; ext: string } | null> {
    if (!src) return null;
    if (src.startsWith('data:')) {
      const match = src.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!match) return null;
      return { buffer: Buffer.from(match[2], 'base64'), ext: match[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg') };
    }
    if (src.startsWith('vcat-asset://')) {
      const cfg = await readAppConfig();
      if (!cfg.workspacePath) return null;
      const url = new URL(src);
      const relPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const target = resolveSafePath(cfg.workspacePath, relPath);
      const buffer = await fs.readFile(target);
      const ext = path.extname(target).replace(/^\./, '') || 'png';
      return { buffer, ext };
    }
    if (src.startsWith('file://')) {
      const filePath = decodeURIComponent(new URL(src).pathname);
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).replace(/^\./, '') || 'png';
      return { buffer, ext };
    }
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await net.fetch(src);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      const urlPath = new URL(src).pathname;
      const ext = path.extname(urlPath).replace(/^\./, '') || 'png';
      return { buffer: Buffer.from(arr), ext };
    }
    return null;
  }

  ipcMain.handle('image:copy', async (_event, src: string) => {
    try {
      const resolved = await resolveImageBuffer(src);
      if (!resolved) return false;
      const img = nativeImage.createFromBuffer(resolved.buffer);
      if (img.isEmpty()) return false;
      clipboard.writeImage(img);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('image:saveAs', async (_event, src: string) => {
    try {
      const resolved = await resolveImageBuffer(src);
      if (!resolved) return { ok: false };
      const result = await dialog.showSaveDialog({
        title: '另存为图片',
        defaultPath: path.join(app.getPath('downloads'), `image.${resolved.ext}`),
        filters: [{ name: 'Image', extensions: [resolved.ext, 'png', 'jpg', 'webp', 'gif'] }],
      });
      if (result.canceled || !result.filePath) return { ok: false };
      await fs.writeFile(result.filePath, resolved.buffer);
      return { ok: true, filePath: result.filePath };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('workspace:openLink', async (_event, href: string, currentRelativePath?: string) => {
    const rawHref = (href || '').trim();
    if (!rawHref) return { ok: false, target: rawHref };
    if (/^(https?:\/\/|mailto:)/i.test(rawHref)) {
      await shell.openExternal(rawHref);
      return { ok: true, kind: 'external' };
    }
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return { ok: false, target: rawHref };
    const cleanHref = decodeURIComponent(rawHref.split('#')[0].split('?')[0]);
    const baseDir = currentRelativePath ? path.dirname(currentRelativePath) : '';
    const candidateRel = baseDir && baseDir !== '.' ? path.posix.normalize(path.posix.join(baseDir, cleanHref)) : cleanHref;
    try {
      const absFromArticle = resolveSafePath(cfg.workspacePath, candidateRel);
      if (existsSync(absFromArticle)) {
        if (absFromArticle.endsWith('.md')) {
          return { ok: true, kind: 'article', relativePath: candidateRel };
        }
        await shell.openPath(absFromArticle);
        return { ok: true, kind: 'external' };
      }
      const absFromRoot = resolveSafePath(cfg.workspacePath, cleanHref);
      if (existsSync(absFromRoot)) {
        if (absFromRoot.endsWith('.md')) {
          return { ok: true, kind: 'article', relativePath: cleanHref };
        }
        await shell.openPath(absFromRoot);
        return { ok: true, kind: 'external' };
      }
    } catch {
      // outside workspace or invalid path
    }
    return { ok: false, target: cleanHref || rawHref };
  });

  ipcMain.handle('theme:importTyporaCss', async () => {
    const typoraThemesDir = path.join(
      app.getPath('appData'),
      'abnerworks.Typora/themes'
    );
    const defaultPath = existsSync(typoraThemesDir) ? typoraThemesDir : app.getPath('documents');
    const result = await dialog.showOpenDialog({
      title: '选择自定义主题 CSS 文件',
      defaultPath,
      filters: [{ name: 'CSS Stylesheet', extensions: ['css'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const css = await fs.readFile(filePath, 'utf-8');
    return { name: path.basename(filePath, '.css'), css };
  });

  ipcMain.handle('file:export', async (_event, options: ExportArticleOptions) => {
    const ext = options.format;
    const safeTitle = (options.title || 'untitled').replace(/[\\/:*?"<>|]/g, '_');
    const filterName =
      ext === 'md' ? 'Markdown' : ext === 'html' ? 'HTML' : ext === 'docx' ? 'Word Document' : 'PDF';
    const result = await dialog.showSaveDialog({
      title: `导出为 ${filterName}`,
      defaultPath: path.join(app.getPath('documents'), `${safeTitle}.${ext}`),
      filters: [{ name: filterName, extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, message: '已取消导出' };
    }

    if (ext === 'md') {
      await fs.writeFile(result.filePath, options.markdown, 'utf-8');
      return { ok: true, filePath: result.filePath };
    }

    const bodyHtml = options.htmlContent ?? `<pre>${options.markdown.replace(/</g, '&lt;')}</pre>`;
    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif; color: #1d1d1f; max-width: 860px; margin: 40px auto; padding: 0 28px; line-height: 1.78; font-size: 16px; }
    h1, h2, h3, h4 { margin-top: 1.5em; margin-bottom: 0.7em; line-height: 1.38; }
    pre { background: #f6f8fa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; overflow-x: auto; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13.5px; line-height: 1.55; }
    code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.9em; background: rgba(0,122,255,0.08); padding: 1px 5px; border-radius: 4px; }
    pre code { background: transparent; padding: 0; }
    blockquote { border-left: 4px solid #007aff; background: #f5f9ff; border-radius: 8px; padding: 12px 16px; margin: 1.2em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1.2em 0; }
    th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
    th { background: #f3f4f6; }
    img { max-width: 100%; border-radius: 8px; }
    hr { border: 0; height: 1px; background: #d1d5db; margin: 1.8em 0; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;

    if (ext === 'html') {
      await fs.writeFile(result.filePath, fullHtml, 'utf-8');
      return { ok: true, filePath: result.filePath };
    }

    if (ext === 'docx') {
      const docxBuf = await markdownToDocxBuffer(options.markdown);
      await fs.writeFile(result.filePath, docxBuf);
      return { ok: true, filePath: result.filePath };
    }

    const pdfWin = new BrowserWindow({ show: false, width: 960, height: 1200 });
    try {
      await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
      const pdfBuf = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
      await fs.writeFile(result.filePath, pdfBuf);
      return { ok: true, filePath: result.filePath };
    } finally {
      pdfWin.destroy();
    }
  });
}

let heartbeatTimer: NodeJS.Timeout | null = null;

function startHeartbeatEngine(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  const runHeartbeat = async () => {
    try {
      const states = await checkPlatformAuthStates({ session, getAppConfig: readAppConfig });
      await batchSyncHeartbeatResults(states);
      activeMainWindow?.webContents.send('platform:authStatesUpdated', states);
    } catch {
      // transient heartbeat error ignored
    }
  };

  // Run initial heartbeat after 3 seconds
  setTimeout(runHeartbeat, 3000);
  // Recurring heartbeat every 30 seconds
  heartbeatTimer = setInterval(runHeartbeat, 30_000);
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
  registerIpcHandlers();
  registerPublishHandlers({
    ipcMain,
    session,
    getAppConfig: readAppConfig,
  });
  createWindow();
  startHeartbeatEngine();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
