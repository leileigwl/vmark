import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { HarnessProjectConfig, HarnessViolation } from './types.ts';
import { matchesGlob, toPosixPath, walkSourceFiles } from './utils.ts';

function resolveLocalImport(rootDir: string, fromFileRel: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const fromAbsDir = path.dirname(path.join(rootDir, fromFileRel));
  const rawTarget = path.resolve(fromAbsDir, specifier);
  const candidates = [
    rawTarget,
    `${rawTarget}.ts`,
    `${rawTarget}.tsx`,
    path.join(rawTarget, 'index.ts'),
    path.join(rawTarget, 'index.tsx'),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      return toPosixPath(cand, rootDir);
    }
  }
  // Fall back to canonical normalized relative path even if extensionless/uncreated in test mocks
  return toPosixPath(rawTarget, rootDir);
}

function extractSpecifiersAst(fileRel: string, sourceText: string): Array<{ specifier: string; line: number }> {
  const sf = ts.createSourceFile(fileRel, sourceText, ts.ScriptTarget.Latest, true);
  const out: Array<{ specifier: string; line: number }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ specifier: node.moduleSpecifier.text, line: line + 1 });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ specifier: node.moduleSpecifier.text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function getIslandName(relPath: string, rootPrefix: string): string | null {
  const normPrefix = `${toPosixPath(rootPrefix).replace(/\/$/, '')}/`;
  if (!relPath.startsWith(normPrefix)) return null;
  const rest = relPath.slice(normPrefix.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return null; // e.g. registry.ts at root of ipc/
  return rest.slice(0, slashIdx);
}

function detectIslandCycles(graph: Map<string, Set<string>>): string[][] {
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 visiting, 2 done
  const stack: string[] = [];
  const cycles: string[][] = [];

  const dfs = (node: string): void => {
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const st = state.get(next) ?? 0;
      if (st === 1) {
        const idx = stack.indexOf(next);
        if (idx !== -1) cycles.push([...stack.slice(idx), next]);
      } else if (st === 0) {
        dfs(next);
      }
    }
    stack.pop();
    state.set(node, 2);
  };

  for (const node of graph.keys()) {
    if ((state.get(node) ?? 0) === 0) dfs(node);
  }
  return cycles;
}

/**
 * Check cross-layer boundaries and vertical module-island Barrel-Only / Acyclic DAG rules using TypeScript AST.
 */
export function runArchGraphChecks(
  rootDir: string,
  project: HarnessProjectConfig
): HarnessViolation[] {
  const violations: HarnessViolation[] = [];
  const scanRoots = ['apps/desktop/src', 'packages'];
  const allFiles: string[] = [];
  for (const rel of scanRoots) {
    allFiles.push(...walkSourceFiles(path.join(rootDir, rel), rootDir, ['.ts', '.tsx']));
  }

  const islandRoots = [
    project.moduleIslands?.rendererRoot,
    project.moduleIslands?.mainIpcRoot,
  ].filter((x): x is string => Boolean(x));

  const barrelName = project.moduleIslands?.barrelFile ?? 'index.ts';
  const islandGraphs = new Map<string, Map<string, Set<string>>>();
  for (const r of islandRoots) islandGraphs.set(r, new Map());

  for (const fileRel of allFiles) {
    const absPath = path.join(rootDir, fileRel);
    const imports = extractSpecifiersAst(fileRel, fs.readFileSync(absPath, 'utf8'));

    for (const imp of imports) {
      const resolvedRel = resolveLocalImport(rootDir, fileRel, imp.specifier);

      // 1. Layer Boundary checks
      for (const boundary of project.layerBoundaries) {
        if (!matchesGlob(fileRel, boundary.from)) continue;
        for (const forbidden of boundary.forbidImportFrom) {
          const hitExternal = !imp.specifier.startsWith('.') && (imp.specifier === forbidden || imp.specifier.startsWith(`${forbidden}/`));
          const hitLocal = resolvedRel !== null && matchesGlob(resolvedRel, forbidden);
          if (hitExternal || hitLocal) {
            violations.push({
              file: fileRel,
              line: imp.line,
              rule_id: 'ARCH_FORBIDDEN_LAYER_IMPORT',
              fix_hint: `Forbidden import \`${imp.specifier}\` inside \`${boundary.from}\`. Route through @vcat/shared and preload IPC.`,
            });
          }
        }
      }

      // 2. Vertical Module-Islands Barrel-Only & Cycle Graph
      if (!resolvedRel || !project.moduleIslands) continue;
      for (const islandRoot of islandRoots) {
        const targetIsland = getIslandName(resolvedRel, islandRoot);
        if (!targetIsland) continue;

        const sourceIsland = getIslandName(fileRel, islandRoot);
        if (sourceIsland !== targetIsland) {
          const normRoot = toPosixPath(islandRoot).replace(/\/$/, '');
          const expectedBarrel = `${normRoot}/${targetIsland}/${barrelName}`;
          const expectedBarrelTsx = `${normRoot}/${targetIsland}/${barrelName}x`;

          if (
            project.moduleIslands.forbidCrossIslandDeepImport !== false &&
            resolvedRel !== expectedBarrel &&
            resolvedRel !== expectedBarrelTsx &&
            resolvedRel !== `${normRoot}/${targetIsland}`
          ) {
            violations.push({
              file: fileRel,
              line: imp.line,
              rule_id: 'ARCH_CROSS_ISLAND_DEEP_IMPORT',
              fix_hint: `Deep import into island \`${targetIsland}\` (\`${resolvedRel}\`) is forbidden. Import from \`${expectedBarrel}\` barrel only.`,
            });
          }

          if (sourceIsland) {
            const g = islandGraphs.get(islandRoot)!;
            if (!g.has(sourceIsland)) g.set(sourceIsland, new Set());
            g.get(sourceIsland)!.add(targetIsland);
          }
        }
      }
    }
  }

  if (project.moduleIslands?.forbidCycles !== false) {
    for (const [root, graph] of islandGraphs.entries()) {
      for (const cycle of detectIslandCycles(graph)) {
        violations.push({
          file: toPosixPath(root),
          line: 1,
          rule_id: 'ARCH_ISLAND_CYCLE',
          fix_hint: `Circular dependency across vertical feature islands: ${cycle.join(' -> ')}. Extract shared contracts to @vcat/shared.`,
        });
      }
    }
  }

  return violations;
}
