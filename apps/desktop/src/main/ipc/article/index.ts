import { shell } from 'electron';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildArticleMeta, scanWorkspaceArticles } from '@vcat/core';
import { IPC_INVOKE_CHANNELS } from '@vcat/shared';
import type { MainIpcContext } from '../context';

/** Registers article and folder CRUD/search IPC handlers. */
export function registerArticleIpc(ctx: MainIpcContext): void {
  const { ipcMain, readAppConfig, resolveSafePath } = ctx;

  ipcMain.handle(IPC_INVOKE_CHANNELS.listArticles, async () => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) return [];
    await fs.mkdir(cfg.workspacePath, { recursive: true });
    return scanWorkspaceArticles(cfg.workspacePath);
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.listFolders, async () => {
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

  ipcMain.handle(IPC_INVOKE_CHANNELS.createFolder, async (_event, folderName: string) => {
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

  ipcMain.handle(IPC_INVOKE_CHANNELS.deleteFolder, async (_event, folderPath: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const cleanPath = folderPath.trim().replace(/^[\\/]+|[\\/]+$/g, '');
    if (!cleanPath) return;
    const target = resolveSafePath(cfg.workspacePath, cleanPath);
    if (existsSync(target)) {
      await shell.trashItem(target);
    }
  });

  ipcMain.handle(
    IPC_INVOKE_CHANNELS.moveFolder,
    async (_event, oldFolderPath: string, targetParentFolder: string) => {
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
    }
  );

  ipcMain.handle(IPC_INVOKE_CHANNELS.readArticle, async (_event, relativePath: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const target = resolveSafePath(cfg.workspacePath, relativePath);
    return fs.readFile(target, 'utf-8');
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.saveArticle, async (_event, relativePath: string, content: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const target = resolveSafePath(cfg.workspacePath, relativePath);
    await fs.writeFile(target, content, 'utf-8');
    const stat = await fs.stat(target);
    return { updatedAt: stat.mtimeMs };
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.createArticle, async (_event, fileName?: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');

    let safeName = fileName?.trim();
    if (!safeName) {
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

  ipcMain.handle(
    IPC_INVOKE_CHANNELS.renameArticle,
    async (_event, oldRelativePath: string, newFileName: string) => {
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
    }
  );

  ipcMain.handle(
    IPC_INVOKE_CHANNELS.moveArticle,
    async (_event, oldRelativePath: string, targetFolder: string) => {
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
    }
  );

  ipcMain.handle(IPC_INVOKE_CHANNELS.deleteArticle, async (_event, relativePath: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const target = resolveSafePath(cfg.workspacePath, relativePath);
    await shell.trashItem(target);
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.duplicateArticle, async (_event, relativePath: string) => {
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

  ipcMain.handle(IPC_INVOKE_CHANNELS.searchArticlesContent, async (_event, query: string) => {
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
}
