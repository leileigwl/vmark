import type { ArticleMeta } from '@vcat/shared';
import type { FileHistoryOp } from './fileHistory';

export interface ArticleOpsCtx {
  activeArticle: ArticleMeta | null;
  setArticles: (list: ArticleMeta[]) => void;
  setFolders: (list: string[]) => void;
  setActiveArticle: (art: ArticleMeta | null) => void;
  setMarkdown: (md: string) => void;
  pushUndo: (op: FileHistoryOp) => void;
  openArticle: (art: ArticleMeta) => Promise<void>;
  setActiveViewEditor: () => void;
  showToast: (errOrMsg: unknown) => void;
}

async function snapshotArticles(targets: ArticleMeta[]): Promise<Array<{ relativePath: string; content: string }>> {
  const items: Array<{ relativePath: string; content: string }> = [];
  for (const t of targets) {
    let content = '';
    try {
      content = await window.electronAPI.readArticle(t.relativePath);
    } catch {
      // ignore missing file during trash snapshot
    }
    items.push({ relativePath: t.relativePath, content });
  }
  return items;
}

async function reconcileActiveAfterRemoval(
  list: ArticleMeta[],
  ctx: ArticleOpsCtx,
  removedPaths: Set<string>,
  removedFolders: string[] = []
): Promise<void> {
  if (list.length === 0) {
    ctx.setActiveArticle(null);
    ctx.setMarkdown('');
    return;
  }
  const activeRel = ctx.activeArticle?.relativePath;
  if (!activeRel) return;
  const affected =
    removedPaths.has(activeRel) ||
    removedFolders.some((f) => activeRel === f || activeRel.startsWith(`${f}/`));
  if (affected) {
    await ctx.openArticle(list[0]);
  }
}

export async function createArticleAndOpen(ctx: ArticleOpsCtx, relPath?: string): Promise<void> {
  const prevPath = ctx.activeArticle?.relativePath ?? null;
  const created = await window.electronAPI.createArticle(relPath);
  ctx.setArticles(await window.electronAPI.listArticles());
  ctx.pushUndo({ kind: 'create', relativePath: created.relativePath, previousArticlePath: prevPath });
  await ctx.openArticle(created);
  ctx.setActiveViewEditor();
}

export async function deleteArticlesWithUndo(ctx: ArticleOpsCtx, targets: ArticleMeta[], confirmMsg: string): Promise<void> {
  if (targets.length === 0 || !window.confirm(confirmMsg)) return;
  const prevPath = ctx.activeArticle?.relativePath ?? null;
  const items = await snapshotArticles(targets);
  const removed = new Set(targets.map((t) => t.relativePath));
  for (const t of targets) {
    await window.electronAPI.deleteArticle(t.relativePath);
  }
  const list = await window.electronAPI.listArticles();
  ctx.setArticles(list);
  ctx.pushUndo({ kind: 'delete', items, previousArticlePath: prevPath });
  await reconcileActiveAfterRemoval(list, ctx, removed);
}

export async function deleteItemsBatch(
  ctx: ArticleOpsCtx,
  targetArticles: ArticleMeta[],
  targetFolders: string[]
): Promise<void> {
  const totalCount = targetArticles.length + targetFolders.length;
  if (totalCount === 0) return;
  const summary =
    targetFolders.length > 0
      ? `${targetArticles.length} 篇文章与 ${targetFolders.length} 个文件夹`
      : `${targetArticles.length} 篇文章`;
  if (!window.confirm(`确定要将选中的 ${totalCount} 个项目（${summary}）移到废纸篓吗？`)) return;

  const prevPath = ctx.activeArticle?.relativePath ?? null;
  const items = await snapshotArticles(targetArticles);
  const removedPaths = new Set(targetArticles.map((t) => t.relativePath));

  for (const f of targetFolders) await window.electronAPI.deleteFolder?.(f);
  for (const a of targetArticles) await window.electronAPI.deleteArticle(a.relativePath);

  const [list, folderList] = await Promise.all([
    window.electronAPI.listArticles(),
    window.electronAPI.listFolders(),
  ]);
  ctx.setArticles(list);
  ctx.setFolders(folderList);
  if (items.length > 0) {
    ctx.pushUndo({ kind: 'delete', items, previousArticlePath: prevPath });
  }
  await reconcileActiveAfterRemoval(list, ctx, removedPaths, targetFolders);
}

export async function deleteFolderSingle(ctx: ArticleOpsCtx, folderPath: string): Promise<void> {
  if (!window.confirm(`确定要将文件夹「${folderPath}」移到废纸篓吗？`)) return;
  try {
    await window.electronAPI.deleteFolder?.(folderPath);
    const [list, folderList] = await Promise.all([
      window.electronAPI.listArticles(),
      window.electronAPI.listFolders(),
    ]);
    ctx.setArticles(list);
    ctx.setFolders(folderList);
    await reconcileActiveAfterRemoval(list, ctx, new Set(), [folderPath]);
  } catch (err) {
    ctx.showToast(err);
  }
}

export async function moveArticleWithUndo(ctx: ArticleOpsCtx, oldPath: string, targetFolder: string): Promise<void> {
  try {
    const moved = await window.electronAPI.moveArticle(oldPath, targetFolder);
    const [list, folderList] = await Promise.all([
      window.electronAPI.listArticles(),
      window.electronAPI.listFolders(),
    ]);
    ctx.setArticles(list);
    ctx.setFolders(folderList);
    if (ctx.activeArticle?.relativePath === oldPath) ctx.setActiveArticle(moved);
    if (moved.relativePath !== oldPath) {
      ctx.pushUndo({ kind: 'move-article', oldPath, newPath: moved.relativePath });
    }
  } catch (err) {
    ctx.showToast(err);
  }
}

export async function moveFolderWithUndo(ctx: ArticleOpsCtx, oldFolder: string, targetParent: string): Promise<void> {
  try {
    const newRel = await window.electronAPI.moveFolder(oldFolder, targetParent);
    const [list, folderList] = await Promise.all([
      window.electronAPI.listArticles(),
      window.electronAPI.listFolders(),
    ]);
    ctx.setArticles(list);
    ctx.setFolders(folderList);
    if (ctx.activeArticle?.relativePath.startsWith(`${oldFolder}/`)) {
      const match = list.find((a) => a.relativePath === ctx.activeArticle?.relativePath.replace(oldFolder, newRel));
      if (match) ctx.setActiveArticle(match);
    }
    if (newRel !== oldFolder) {
      ctx.pushUndo({ kind: 'move-folder', oldFolder, newFolder: newRel });
    }
  } catch (err) {
    ctx.showToast(err);
  }
}
