import { app, BrowserWindow, clipboard, dialog, shell } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  IPC_INVOKE_CHANNELS,
  IPC_SEND_CHANNELS,
  type ExportArticleOptions,
} from '@vcat/shared';
import { markdownToDocxBuffer } from '../../exportDocx';
import {
  copyExternalItemsIntoWorkspace,
  readOsClipboardFilePaths,
  resolveExternalOpenTarget,
  writeOsClipboardFilePaths,
} from '../../workspaceFileOps';
import type { MainIpcContext } from '../context';

const execFileAsync = promisify(execFile);

/** Registers workspace selection, link opening, Git integration, menu recent-files, theme & export IPC handlers. */
export function registerWorkspaceIpc(ctx: MainIpcContext): void {
  const { ipcMain, readAppConfig, writeAppConfig, recordRecentWorkspace, resolveSafePath, buildApplicationMenu } = ctx;

  ipcMain.handle(IPC_INVOKE_CHANNELS.getWorkspacePath, async () => {
    const cfg = await readAppConfig();
    if (cfg.workspacePath && !cfg.recentWorkspaces.includes(cfg.workspacePath)) {
      recordRecentWorkspace(cfg, cfg.workspacePath);
      await writeAppConfig(cfg);
    }
    return cfg.workspacePath;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.getRecentWorkspaces, async () => {
    const cfg = await readAppConfig();
    return cfg.recentWorkspaces;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.switchWorkspace, async (_event, dirPath: string) => {
    if (!existsSync(dirPath)) return null;
    const cfg = await readAppConfig();
    recordRecentWorkspace(cfg, dirPath);
    await writeAppConfig(cfg);
    ctx.onWorkspacePathChanged?.(cfg.workspacePath);
    return cfg.workspacePath;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.showInFinder, async (_event, relativePath?: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return;
    if (relativePath) {
      const target = resolveSafePath(cfg.workspacePath, relativePath);
      shell.showItemInFolder(target);
    } else {
      await shell.openPath(cfg.workspacePath);
    }
  });

  ipcMain.on(IPC_SEND_CHANNELS.setRecentFiles, (_event, paths: string[]) => {
    if (Array.isArray(paths)) {
      buildApplicationMenu(paths);
    }
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.selectWorkspace, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择本地 Markdown 博客工作区',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const cfg = await readAppConfig();
    recordRecentWorkspace(cfg, result.filePaths[0]);
    await writeAppConfig(cfg);
    ctx.onWorkspacePathChanged?.(cfg.workspacePath);
    return cfg.workspacePath;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.openExternalFile, async (_event, filePath?: string) => {
    let targetPath = filePath?.trim();
    if (!targetPath) {
      const result = await dialog.showOpenDialog({
        title: '打开 Markdown 文件',
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      targetPath = result.filePaths[0];
    }
    const cfg = await readAppConfig();
    const resolved = await resolveExternalOpenTarget(cfg.workspacePath, targetPath);
    if (cfg.workspacePath !== resolved.workspacePath) {
      recordRecentWorkspace(cfg, resolved.workspacePath);
      await writeAppConfig(cfg);
      ctx.onWorkspacePathChanged?.(cfg.workspacePath);
    }
    return resolved;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.consumePendingExternalFile, () => {
    return ctx.consumePendingExternalFile?.() ?? null;
  });

  ipcMain.handle(
    IPC_INVOKE_CHANNELS.importExternalFiles,
    async (_event, filePaths: string[], targetFolder?: string) => {
      const cfg = await readAppConfig();
      if (!cfg.workspacePath) throw new Error('Workspace not configured');
      return copyExternalItemsIntoWorkspace(cfg.workspacePath, filePaths ?? [], targetFolder ?? '');
    }
  );

  ipcMain.handle(IPC_INVOKE_CHANNELS.copyFilesToClipboard, async (_event, relativePaths: string[]) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return false;
    const absPaths: string[] = [];
    for (const rel of relativePaths ?? []) {
      try {
        const abs = resolveSafePath(cfg.workspacePath, rel);
        if (existsSync(abs)) absPaths.push(abs);
      } catch {
        // ignore invalid paths
      }
    }
    if (absPaths.length === 0) return false;
    writeOsClipboardFilePaths(clipboard, absPaths);
    return true;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.hasClipboardFiles, async () => {
    return readOsClipboardFilePaths(clipboard).length > 0;
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.pasteClipboardFiles, async (_event, targetFolder?: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const paths = readOsClipboardFilePaths(clipboard);
    if (paths.length === 0) {
      return { importedArticles: [], importedFolders: [], skipped: [] };
    }
    return copyExternalItemsIntoWorkspace(cfg.workspacePath, paths, targetFolder ?? '');
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.getGitStatus, async () => {
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

  ipcMain.handle(IPC_INVOKE_CHANNELS.pushGitWorkspace, async (_event, commitMessage: string) => {
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

  ipcMain.handle(IPC_INVOKE_CHANNELS.openWorkspaceLink, async (_event, href: string, currentRelativePath?: string) => {
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
        if (/\.(md|markdown)$/i.test(absFromArticle)) {
          return { ok: true, kind: 'article', relativePath: candidateRel };
        }
        await shell.openPath(absFromArticle);
        return { ok: true, kind: 'external' };
      }
      const absFromRoot = resolveSafePath(cfg.workspacePath, cleanHref);
      if (existsSync(absFromRoot)) {
        if (/\.(md|markdown)$/i.test(absFromRoot)) {
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

  ipcMain.handle(IPC_INVOKE_CHANNELS.importTyporaThemeCss, async () => {
    const typoraThemesDir = path.join(app.getPath('appData'), 'abnerworks.Typora/themes');
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

  ipcMain.handle(IPC_INVOKE_CHANNELS.exportArticle, async (_event, options: ExportArticleOptions) => {
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
