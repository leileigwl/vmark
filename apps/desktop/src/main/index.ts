import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { buildArticleMeta, scanWorkspaceArticles } from '@vcat/core';
import { saveImageToAssets } from '@vcat/image-pipeline';
import type { ContextMenuOptions, ImageBedConfig, PlatformId } from '@vcat/shared';

const execFileAsync = promisify(execFile);

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
}

const DEFAULT_CONFIG: AppConfig = {
  workspacePath: null,
  recentWorkspaces: [],
  imageBed: { strategy: 'platform_private' },
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
    trafficLightPosition: { x: 14, y: 12 },
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

function sendMenuAction(action: string, payload?: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send('menu:action', action, payload);
}

function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: '关于 VCat Publisher', role: 'about' as const },
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
        { label: '新建空白文章', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('file:new') },
        { label: '打开本地工作区...', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('file:openWorkspace') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('file:save') },
        { type: 'separator' },
        { label: '合并分发...', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendMenuAction('publish:open') },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
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
        { label: 'Typora White（原版 GitHub）', type: 'radio', click: () => sendMenuAction('theme:set', 'typora-white') },
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
    const target = resolveSafePath(cfg.workspacePath, cleanName);
    await fs.mkdir(target, { recursive: true });
    return cleanName;
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
    const finalName = cleanNew.endsWith('.md') ? cleanNew : `${cleanNew}.md`;
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

  ipcMain.handle('config:getImageBed', async () => {
    const cfg = await readAppConfig();
    return cfg.imageBed;
  });

  ipcMain.handle('config:saveImageBed', async (_event, imageBed: ImageBedConfig) => {
    const cfg = await readAppConfig();
    cfg.imageBed = imageBed;
    await writeAppConfig(cfg);
  });

  ipcMain.handle('config:testImageBed', async (_event, imageBed: ImageBedConfig) => {
    const provider = imageBed.provider ?? 'picgo_core';
    if (provider === 'picgo_core') {
      const bin = imageBed.picgoPath?.trim() || 'picgo';
      try {
        const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 4000 });
        return { ok: true, message: `PicGo-Core 就绪 (${stdout.trim()})` };
      } catch {
        return {
          ok: false,
          message: `未检测到 PicGo-Core (${bin})，请先安装 npm i -g picgo 或切换为内置云存储直传`,
        };
      }
    }
    if (provider === 'github') {
      if (!imageBed.repo?.trim() || !imageBed.token?.trim()) {
        return { ok: false, message: '请填写 GitHub 仓库 (owner/repo) 与 Personal Access Token' };
      }
      return { ok: true, message: `GitHub 图床配置校验通过（${imageBed.repo}）` };
    }
    if (provider === 'smms' || provider === 'imgur') {
      if (!imageBed.token?.trim()) {
        return { ok: false, message: `请填写 ${provider.toUpperCase()} API Token` };
      }
      return { ok: true, message: `${provider.toUpperCase()} 图床凭证已就绪` };
    }
    if (!imageBed.bucket?.trim() || !imageBed.accessKey?.trim() || !imageBed.secretKey?.trim()) {
      return { ok: false, message: '请填写完整的 Bucket / AccessKey / SecretKey' };
    }
    return { ok: true, message: `${provider} 对象存储参数校验通过（${imageBed.bucket}）` };
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
          { label: '加粗', accelerator: 'CmdOrCtrl+B', click: () => sendMenuAction('editor:format', 'bold') },
          { label: '斜体', accelerator: 'CmdOrCtrl+I', click: () => sendMenuAction('editor:format', 'italic') },
          { label: '删除线', click: () => sendMenuAction('editor:format', 'strike') },
          { label: '行内代码', click: () => sendMenuAction('editor:format', 'inline-code') },
          { label: '超链接', accelerator: 'CmdOrCtrl+K', click: () => sendMenuAction('editor:format', 'link') },
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

  ipcMain.handle('theme:importTyporaCss', async () => {
    const typoraThemesDir = path.join(
      app.getPath('appData'),
      'abnerworks.Typora/themes'
    );
    const defaultPath = existsSync(typoraThemesDir) ? typoraThemesDir : app.getPath('documents');
    const result = await dialog.showOpenDialog({
      title: '选择 Typora 主题 CSS 文件（如 bloom-lapis.css）',
      defaultPath,
      filters: [{ name: 'CSS Stylesheet', extensions: ['css'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const css = await fs.readFile(filePath, 'utf-8');
    return { name: path.basename(filePath, '.css'), css };
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.vcat.publisher');

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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
