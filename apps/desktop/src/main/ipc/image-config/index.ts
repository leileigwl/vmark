import { app, BrowserWindow, clipboard, dialog, Menu, nativeImage, net } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  buildPicgoEnv,
  createImageBedUploader,
  resolvePicgoBinary,
  saveImageToAssets,
} from '@vcat/image-pipeline';
import {
  IPC_INVOKE_CHANNELS,
  type ContextMenuOptions,
  type ImageBedConfig,
  type StartupConfig,
} from '@vcat/shared';
import { fillStoredSecrets, stripSecrets } from '../../secretStore';
import type { MainIpcContext } from '../context';

const execFileAsync = promisify(execFile);

/** Registers image storage/upload, startup/imagebed settings, and editor context menu IPC handlers. */
export function registerImageConfigIpc(ctx: MainIpcContext): void {
  const { ipcMain, readAppConfig, writeAppConfig, resolveSafePath, sendMenuAction } = ctx;

  ipcMain.handle(IPC_INVOKE_CHANNELS.saveLocalImage, async (_event, base64Data: string, ext: string) => {
    const cfg = await readAppConfig();
    if (!cfg.workspacePath) throw new Error('Workspace not configured');
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    return saveImageToAssets(cfg.workspacePath, buffer, ext);
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.uploadRemoteImage, async (_event, base64Data: string, fileName: string) => {
    const cfg = await readAppConfig();
    const cleanBase64 = base64Data.replace(/^data:image\/[\w+.-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const uploader = createImageBedUploader();
    const url = await uploader(buffer, fileName || 'image.png', cfg.imageBed);
    return { url };
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.getImageBedConfig, async () => {
    // 凭据零外泄：渲染进程只拿非密钥字段，密钥留在主进程。
    const cfg = await readAppConfig();
    return stripSecrets(cfg.imageBed);
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.saveImageBedConfig, async (_event, imageBed: ImageBedConfig) => {
    const cfg = await readAppConfig();
    cfg.imageBed = fillStoredSecrets(imageBed, cfg.imageBed);
    await writeAppConfig(cfg);
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.getStartupConfig, async () => {
    const cfg = await readAppConfig();
    return cfg.startup ?? { mode: 'last_opened' };
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.saveStartupConfig, async (_event, startup: StartupConfig) => {
    const cfg = await readAppConfig();
    cfg.startup = startup;
    await writeAppConfig(cfg);
  });

  ipcMain.handle(IPC_INVOKE_CHANNELS.testImageBedUpload, async (_event, fromRenderer: ImageBedConfig) => {
    const imageBed = fillStoredSecrets(fromRenderer, (await readAppConfig()).imageBed);
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
        return { ok: true, url, message: `PicGo-Core (${version}) 真实上传测试成功：${url}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
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
      if (!imageBed.token?.trim()) return { ok: false, message: '请填写 SM.MS API Token' };
      try {
        const url = await uploader(TINY_1X1_PNG, 'vmark-connectivity-test.png', imageBed);
        return { ok: true, url, message: `SM.MS 图床真实上传测试成功：${url}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
    if (provider === 'imgur') {
      if (!imageBed.token?.trim()) return { ok: false, message: '请填写 IMGUR API Token / Client ID' };
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

  ipcMain.handle(IPC_INVOKE_CHANNELS.showEditorContextMenu, async (event, options: ContextMenuOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    if (options.inImage) {
      const currScale = options.imageScale ?? 50;
      const imageTemplate: Electron.MenuItemConstructorOptions[] = [
        { label: '放大预览 (空格)', click: () => sendMenuAction('editor:image', 'preview') },
        { label: '复制图片', click: () => sendMenuAction('editor:image', 'copy') },
        { label: '另存为图片...', click: () => sendMenuAction('editor:image', 'save') },
      ];
      if (!options.readOnly) {
        imageTemplate.push(
          {
            label: '显示比例',
            submenu: [
              { label: '25%', type: 'radio', checked: currScale === 25, click: () => sendMenuAction('editor:image', 'scale:25') },
              { label: '50%（默认）', type: 'radio', checked: currScale === 50, click: () => sendMenuAction('editor:image', 'scale:50') },
              { label: '75%', type: 'radio', checked: currScale === 75, click: () => sendMenuAction('editor:image', 'scale:75') },
              { label: '100%（原宽）', type: 'radio', checked: currScale === 100, click: () => sendMenuAction('editor:image', 'scale:100') },
            ],
          },
          { type: 'separator' },
          { label: '删除图片', click: () => sendMenuAction('editor:image', 'delete') }
        );
      }
      Menu.buildFromTemplate(imageTemplate).popup({ window: win });
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
      const relPath = decodeURIComponent(new URL(src).pathname.replace(/^\/+/, ''));
      const target = resolveSafePath(cfg.workspacePath, relPath);
      const buffer = await fs.readFile(target);
      return { buffer, ext: path.extname(target).replace(/^\./, '') || 'png' };
    }
    if (src.startsWith('file://')) {
      const filePath = decodeURIComponent(new URL(src).pathname);
      const buffer = await fs.readFile(filePath);
      return { buffer, ext: path.extname(filePath).replace(/^\./, '') || 'png' };
    }
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await net.fetch(src);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      const urlPath = new URL(src).pathname;
      return { buffer: Buffer.from(arr), ext: path.extname(urlPath).replace(/^\./, '') || 'png' };
    }
    return null;
  }

  ipcMain.handle(IPC_INVOKE_CHANNELS.copyImage, async (_event, src: string) => {
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

  ipcMain.handle(IPC_INVOKE_CHANNELS.saveImageAs, async (_event, src: string) => {
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
}
