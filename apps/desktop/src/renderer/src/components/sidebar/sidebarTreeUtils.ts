import type { ArticleMeta } from '@vcat/shared';

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  article?: ArticleMeta;
  children: TreeNode[];
}

/** Builds a sorted directory + markdown article tree from flat workspace lists. */
export function buildFileTree(articles: ArticleMeta[], folders: string[] = []): TreeNode[] {
  const root: TreeNode[] = [];
  const ensureDirPath = (dirPath: string) => {
    const parts = dirPath.split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const nodePath = parts.slice(0, i + 1).join('/');
      let existing = current.find((n) => n.name === part && n.isDir);
      if (!existing) {
        existing = { name: part, path: nodePath, isDir: true, children: [] };
        current.push(existing);
      }
      current = existing.children;
    }
  };
  for (const dir of folders) ensureDirPath(dir);

  for (const art of articles) {
    const parts = art.relativePath.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const nodePath = parts.slice(0, i + 1).join('/');
      let existing = current.find((n) => n.name === part && n.isDir === !isLast);
      if (!existing) {
        existing = {
          name: part,
          path: nodePath,
          isDir: !isLast,
          article: isLast ? art : undefined,
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }
  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((n) => (n.isDir ? { ...n, children: sortNodes(n.children) } : n))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  return sortNodes(root);
}

/** Collects visible articles in top-to-bottom display order across expanded tree directories. */
export function flattenVisibleTreeArticles(
  nodes: TreeNode[],
  expandedDirs: Record<string, boolean>
): ArticleMeta[] {
  const acc: ArticleMeta[] = [];
  const walk = (items: TreeNode[]) => {
    for (const n of items) {
      if (n.isDir) {
        if (expandedDirs[n.path] ?? true) walk(n.children);
      } else if (n.article) {
        acc.push(n.article);
      }
    }
  };
  walk(nodes);
  return acc;
}
