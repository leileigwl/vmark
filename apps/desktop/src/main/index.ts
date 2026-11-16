import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { buildArticleMeta, scanWorkspaceArticles } from '@vcat/core';
import { saveImageToAssets } from '@vcat/image-pipeline';
import type { ImageBedConfig, PlatformId } from '@vcat/shared';

interface AppConfig {
  workspacePath: string | null;
  imageBed: ImageBedConfig;
}

const DEFAULT_CONFIG: AppConfig = {
  workspacePath: null,
  imageBed: { strategy: 'platform_private' },
};

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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
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

function registerIpcHandlers(): void {
  ipcMain.handle('workspace:get', async () => {
    const cfg = await readAppConfig();
    return cfg.workspacePath;
  });

  ipcMain.handle('workspace:select', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择本地 Markdown 博客工作区',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const cfg = await readAppConfig();
    cfg.workspacePath = result.filePaths[0];
    await writeAppConfig(cfg);
    return cfg.workspacePath;
  });

  ipcMain.handle('articles:list', async () => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return [];
    await fs.mkdir(cfg.workspacePath, { recursive: true });
    return scanWorkspaceArticles(cfg.workspacePath);
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

  ipcMain.handle('articles:create', async (_event, fileName: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const safeName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const target = resolveSafePath(cfg.workspacePath, safeName);
    const title = path.basename(safeName, '.md');
    const initialContent = `# ${title}\n\n`;
    await fs.writeFile(target, initialContent, 'utf-8');
    const stat = await fs.stat(target);
    return buildArticleMeta(initialContent, safeName, target, stat.mtimeMs);
  });

  ipcMain.handle('image:saveLocal', async (_event, base64Data: string, ext: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    return saveImageToAssets(cfg.workspacePath, buffer, ext);
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

  ipcMain.handle(
    'platform:openLogin',
    async (_event, platformId: PlatformId, loginUrl: string) => {
      const partition = `persist:platform_${platformId}`;
      const loginWin = new BrowserWindow({
        width: 980,
        height: 700,
        title: `平台沙箱授权 - ${platformId}`,
        webPreferences: {
          partition,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      await loginWin.loadURL(loginUrl);
      return new Promise<boolean>((resolve) => {
        loginWin.on('closed', async () => {
          const cookies = await session.fromPartition(partition).cookies.get({});
          resolve(cookies.length > 0);
        });
      });
    }
  );

  ipcMain.handle('platform:authStates', async () => {
    const ids: PlatformId[] = [
      'weixin',
      'cnblogs',
      'linuxdo',
      'juejin',
      'csdn',
      'zhihu',
      'baijiahao',
      'weibo',
      'bilibili',
      'douyin',
      'x',
      'xiaohongshu',
    ];
    const states: Partial<Record<PlatformId, boolean>> = {};
    for (const id of ids) {
      const cookies = await session.fromPartition(`persist:platform_${id}`).cookies.get({});
      states[id] = cookies.length > 0;
    }
    return states;
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.vcat.publisher');
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
