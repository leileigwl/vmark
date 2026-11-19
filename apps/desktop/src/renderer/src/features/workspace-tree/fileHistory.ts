import type { ArticleMeta } from '@vcat/shared';

export type FileHistoryOp =
  | {
      kind: 'create';
      relativePath: string;
      previousArticlePath?: string | null;
      content?: string;
    }
  | {
      kind: 'delete';
      items: Array<{ relativePath: string; content: string }>;
      previousArticlePath?: string | null;
    }
  | {
      kind: 'create-folder';
      folderPath: string;
    }
  | {
      kind: 'move-article';
      oldPath: string;
      newPath: string;
    }
  | {
      kind: 'move-folder';
      oldFolder: string;
      newFolder: string;
    };

export interface FileHistoryRuntime {
  articles: ArticleMeta[];
  activeArticle: ArticleMeta | null;
  setArticles: (list: ArticleMeta[]) => void;
  setFolders: (list: string[]) => void;
  setActiveArticle: (art: ArticleMeta | null) => void;
  setMarkdown: (md: string) => void;
  setActiveViewEditor: () => void;
  openArticle: (art: ArticleMeta) => Promise<void>;
}

/** Executes undo for a single workspace file/folder operation and returns the inverse redo entry. */
export async function executeUndoOp(
  op: FileHistoryOp,
  rt: FileHistoryRuntime
): Promise<FileHistoryOp> {
  if (op.kind === 'create') {
    const remaining = rt.articles.filter((a) => a.relativePath !== op.relativePath);
    rt.setArticles(remaining);
    const restoreTarget =
      (op.previousArticlePath && remaining.find((a) => a.relativePath === op.previousArticlePath)) ||
      remaining[0] ||
      null;

    let snapshot = '';
    try {
      snapshot = await window.electronAPI.readArticle(op.relativePath);
    } catch {
      // ignore if removed externally
    }

    if (rt.activeArticle?.relativePath === op.relativePath) {
      if (restoreTarget) {
        await rt.openArticle(restoreTarget);
      } else {
        rt.setActiveArticle(null);
        rt.setMarkdown('');
      }
    }

    await window.electronAPI.deleteArticle(op.relativePath);
    rt.setArticles(await window.electronAPI.listArticles());
    return {
      kind: 'create',
      relativePath: op.relativePath,
      previousArticlePath: op.previousArticlePath,
      content: snapshot,
    };
  }

  if (op.kind === 'delete') {
    let lastCreated: ArticleMeta | null = null;
    for (const item of op.items) {
      const created = await window.electronAPI.createArticle(item.relativePath);
      await window.electronAPI.saveArticle(created.relativePath, item.content);
      lastCreated = created;
    }
    rt.setArticles(await window.electronAPI.listArticles());
    if (lastCreated) {
      await rt.openArticle(lastCreated);
      rt.setActiveViewEditor();
    }
    return op;
  }

  if (op.kind === 'create-folder') {
    await window.electronAPI.deleteFolder?.(op.folderPath);
    rt.setFolders(await window.electronAPI.listFolders());
    return op;
  }

  if (op.kind === 'move-article') {
    const targetParent = op.oldPath.includes('/') ? op.oldPath.slice(0, op.oldPath.lastIndexOf('/')) : '';
    const moved = await window.electronAPI.moveArticle(op.newPath, targetParent);
    const [list, folderList] = await Promise.all([
      window.electronAPI.listArticles(),
      window.electronAPI.listFolders(),
    ]);
    rt.setArticles(list);
    rt.setFolders(folderList);
    if (rt.activeArticle?.relativePath === op.newPath) rt.setActiveArticle(moved);
    return op;
  }

  const targetParent = op.oldFolder.includes('/') ? op.oldFolder.slice(0, op.oldFolder.lastIndexOf('/')) : '';
  const restoredRel = await window.electronAPI.moveFolder(op.newFolder, targetParent);
  const [list, folderList] = await Promise.all([
    window.electronAPI.listArticles(),
    window.electronAPI.listFolders(),
  ]);
  rt.setArticles(list);
  rt.setFolders(folderList);
  if (rt.activeArticle?.relativePath.startsWith(`${op.newFolder}/`)) {
    const match = list.find(
      (a) => a.relativePath === rt.activeArticle?.relativePath.replace(op.newFolder, restoredRel)
    );
    if (match) rt.setActiveArticle(match);
  }
  return op;
}

/** Executes redo for a previously undone workspace file/folder operation. */
export async function executeRedoOp(
  op: FileHistoryOp,
  rt: FileHistoryRuntime
): Promise<FileHistoryOp> {
  if (op.kind === 'create') {
    const prevPath = rt.activeArticle?.relativePath ?? op.previousArticlePath ?? null;
    const created = await window.electronAPI.createArticle(op.relativePath);
    if (op.content !== undefined) {
      await window.electronAPI.saveArticle(created.relativePath, op.content);
    }
    rt.setArticles(await window.electronAPI.listArticles());
    await rt.openArticle(created);
    rt.setActiveViewEditor();
    return { kind: 'create', relativePath: created.relativePath, previousArticlePath: prevPath };
  }

  if (op.kind === 'delete') {
    const deletedSet = new Set(op.items.map((i) => i.relativePath));
    rt.setArticles(rt.articles.filter((a) => !deletedSet.has(a.relativePath)));
    for (const item of op.items) {
      await window.electronAPI.deleteArticle(item.relativePath);
    }
    const list = await window.electronAPI.listArticles();
    rt.setArticles(list);
    if (rt.activeArticle && deletedSet.has(rt.activeArticle.relativePath)) {
      if (list.length > 0) await rt.openArticle(list[0]);
      else {
        rt.setActiveArticle(null);
        rt.setMarkdown('');
      }
    }
    return op;
  }

  if (op.kind === 'create-folder') {
    const createdPath = await window.electronAPI.createFolder(op.folderPath);
    rt.setFolders(await window.electronAPI.listFolders());
    return { kind: 'create-folder', folderPath: createdPath };
  }

  if (op.kind === 'move-article') {
    const targetParent = op.newPath.includes('/') ? op.newPath.slice(0, op.newPath.lastIndexOf('/')) : '';
    const moved = await window.electronAPI.moveArticle(op.oldPath, targetParent);
    const [list, folderList] = await Promise.all([
      window.electronAPI.listArticles(),
      window.electronAPI.listFolders(),
    ]);
    rt.setArticles(list);
    rt.setFolders(folderList);
    if (rt.activeArticle?.relativePath === op.oldPath) rt.setActiveArticle(moved);
    return op;
  }

  const targetParent = op.newFolder.includes('/') ? op.newFolder.slice(0, op.newFolder.lastIndexOf('/')) : '';
  const movedRel = await window.electronAPI.moveFolder(op.oldFolder, targetParent);
  const [list, folderList] = await Promise.all([
    window.electronAPI.listArticles(),
    window.electronAPI.listFolders(),
  ]);
  rt.setArticles(list);
  rt.setFolders(folderList);
  if (rt.activeArticle?.relativePath.startsWith(`${op.oldFolder}/`)) {
    const match = list.find(
      (a) => a.relativePath === rt.activeArticle?.relativePath.replace(op.oldFolder, movedRel)
    );
    if (match) rt.setActiveArticle(match);
  }
  return op;
}
