import fs from 'node:fs';
import path from 'node:path';
import type { HarnessProjectConfig, HarnessViolation, RatchetConfig } from './types.ts';
import { countFileLines, toPosixPath, walkSourceFiles, writeJson } from './utils.ts';

const TEST_OR_FIXTURE_RE = /\.(test|spec)\.[cm]?[jt]sx?$|^.*\/__fixtures__\//;

function stripFencedCodeBlocks(markdown: string): string {
  const lines = markdown.split('\n');
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

function collectMarkdownFilesForLinkCheck(rootDir: string): string[] {
  const candidates = ['AGENTS.md', 'README.md'];
  const docRoots = ['docs', 'openspec/specs'];
  for (const relRoot of docRoots) {
    const absRoot = path.join(rootDir, relRoot);
    if (!fs.existsSync(absRoot)) continue;
    const stack = [absRoot];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(cur, entry.name);
        const rel = toPosixPath(full, rootDir);
        if (rel.startsWith('docs/99-archive/')) continue;
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.name.endsWith('.md')) {
          candidates.push(rel);
        }
      }
    }
  }
  return candidates.filter((f) => fs.existsSync(path.join(rootDir, f)));
}

/**
 * Check file-size ratchet baselines, new-file line limits, and SSOT documentation line/link hygiene.
 */
export function runRatchetAndDocChecks(options: {
  rootDir: string;
  project: HarnessProjectConfig;
  ratchet: RatchetConfig;
  updateRatchet?: boolean;
}): { violations: HarnessViolation[]; ratchetDecreased: string[] } {
  const { rootDir, project, ratchet, updateRatchet = false } = options;
  const violations: HarnessViolation[] = [];
  const ratchetDecreased: string[] = [];

  const sourceRoots = ['apps/desktop/src', 'packages', 'scripts/harness'];
  const allSources = new Set<string>();
  for (const rel of sourceRoots) {
    for (const file of walkSourceFiles(path.join(rootDir, rel), rootDir, ['.ts', '.tsx'])) {
      allSources.add(file);
    }
  }

  for (const relPath of allSources) {
    if (TEST_OR_FIXTURE_RE.test(relPath)) continue;
    const absPath = path.join(rootDir, relPath);
    const lines = countFileLines(absPath);
    const entry = ratchet.files[relPath];
    if (entry) {
      if (lines > entry.maxLines) {
        violations.push({
          file: relPath,
          line: lines,
          rule_id: 'RATCHET_FILE_GREW',
          fix_hint: `File grew to ${lines} lines (ratchet max: ${entry.maxLines}). Extract module into a feature/ipc island instead of adding lines.`,
        });
      } else if (lines < entry.maxLines) {
        ratchetDecreased.push(`${relPath}: ${entry.maxLines} -> ${lines}`);
        if (updateRatchet) {
          ratchet.files[relPath] = { ...entry, maxLines: lines };
        }
      }
    } else if (lines > ratchet.defaultNewFileMaxLines) {
      violations.push({
        file: relPath,
        line: lines,
        rule_id: 'RATCHET_NEW_FILE_TOO_LARGE',
        fix_hint: `File has ${lines} lines (limit: ${ratchet.defaultNewFileMaxLines}). Split responsibilities into smaller modules.`,
      });
    }
  }

  if (updateRatchet && ratchetDecreased.length > 0) {
    writeJson(path.join(rootDir, '.harness/ratchet.json'), ratchet);
  }

  // Doc line limits
  const agentsPath = path.join(rootDir, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const agentsLines = countFileLines(agentsPath);
    if (agentsLines > project.limits.agentsMdMaxLines) {
      violations.push({
        file: 'AGENTS.md',
        line: agentsLines,
        rule_id: 'DOC_AGENTS_TOO_LONG',
        fix_hint: `AGENTS.md is ${agentsLines} lines (max: ${project.limits.agentsMdMaxLines}). Move details to docs/ or openspec/.`,
      });
    }
  }

  const handoffPath = path.join(rootDir, 'docs/session-handoff.md');
  if (fs.existsSync(handoffPath)) {
    const handoffLines = countFileLines(handoffPath);
    if (handoffLines > project.limits.handoffMaxLines) {
      violations.push({
        file: 'docs/session-handoff.md',
        line: handoffLines,
        rule_id: 'DOC_HANDOFF_TOO_LONG',
        fix_hint: `session-handoff.md is ${handoffLines} lines (max: ${project.limits.handoffMaxLines}). Overwrite instead of appending history.`,
      });
    }
  }

  // Markdown dead relative links
  for (const relDoc of collectMarkdownFilesForLinkCheck(rootDir)) {
    const absDoc = path.join(rootDir, relDoc);
    const cleaned = stripFencedCodeBlocks(fs.readFileSync(absDoc, 'utf8'));
    const dir = path.dirname(absDoc);
    const lines = cleaned.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      for (const m of lines[i].matchAll(/\[[^\]]+\]\(([^)#?\s]+)(?:#[^)\s]*)?\)/g)) {
        const target = m[1];
        if (/^(https?:|mailto:|file:|#)/.test(target)) continue;
        const resolved = path.resolve(dir, target);
        if (!fs.existsSync(resolved)) {
          violations.push({
            file: relDoc,
            line: i + 1,
            rule_id: 'DOC_DEAD_LINK',
            fix_hint: `Broken relative link target \`${target}\`. Fix path or remove obsolete reference.`,
          });
        }
      }
    }
  }

  return { violations, ratchetDecreased };
}
