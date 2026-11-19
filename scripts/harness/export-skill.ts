import fs from 'node:fs';
import path from 'node:path';
import { copyTree, parseFlag } from './utils.ts';

/**
 * Exports a self-contained, publish-ready GitHub repository bundle containing the
 * `superpowers-harness` skill, deterministic CLI engine, native hooks, profiles, and workflows.
 */
export function exportSkillRepository(options: {
  templateRoot: string;
  outDir: string;
}): void {
  const { templateRoot, outDir } = options;
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Standalone Skill definition
  copyTree(
    path.join(templateRoot, '.agents/skills/superpowers-harness'),
    path.join(outDir, 'skills/superpowers-harness')
  );

  // 2. Deterministic Harness core, schemas, profiles, hooks, and CI templates
  copyTree(path.join(templateRoot, '.harness/schemas'), path.join(outDir, 'kit/.harness/schemas'));
  copyTree(path.join(templateRoot, '.harness/profiles'), path.join(outDir, 'kit/.harness/profiles'));
  copyTree(path.join(templateRoot, '.agents/hooks.json'), path.join(outDir, 'kit/.agents/hooks.json'));
  copyTree(path.join(templateRoot, '.claude/settings.json'), path.join(outDir, 'kit/.claude/settings.json'));
  copyTree(path.join(templateRoot, '.githooks'), path.join(outDir, 'kit/.githooks'));
  copyTree(path.join(templateRoot, '.github'), path.join(outDir, 'kit/.github'));

  const harnessOut = path.join(outDir, 'kit/scripts/harness');
  fs.mkdirSync(harnessOut, { recursive: true });
  for (const entry of fs.readdirSync(path.join(templateRoot, 'scripts/harness'))) {
    if (entry.endsWith('.ts') || entry === 'package.json') {
      fs.copyFileSync(path.join(templateRoot, 'scripts/harness', entry), path.join(harnessOut, entry));
    }
  }

  // 3. Standalone Skill Repo README & one-command GitHub publisher script
  const readme = [
    '# Superpowers Harness Skill',
    '',
    'Design-first **Shift-Left Risk Tagging** + **Deterministic AI Harness** + **Risk-Tiered GitHub Actions CI/CD**.',
    '',
    '## Included Assets',
    '',
    '- `skills/superpowers-harness/SKILL.md`: 4-stage workflow guide (Brainstorm + `design-risk` -> Contract Freeze -> Hook-Locked Concurrent TDD -> Risk-Tiered CI/CD).',
    '- `kit/scripts/harness/`: Zero-heavy-dependency TypeScript engine (`cli.ts`, `hook-adapter.ts`, `risk-classifier.ts`, `arch-graph.ts`, `anti-cheat.ts`, `ratchet.ts`, `slop.ts`, `slice-lock.ts`, `init-project.ts`).',
    '- `kit/.harness/profiles/`: Executable verification kits (`desktop-electron` and `web-service` with Compose smoke, reversible migrations, and `k6-smoke.js`).',
    '- `kit/.github/`: Parallel Ubuntu CI, monotonic risk gate, nightly summary PR, anti-avalanche auto-revert, fork-safe AI review, and weekly Slop audit.',
    '',
    '## Quick Bootstrap in Any Project',
    '',
    '```bash',
    'node --experimental-strip-types ./kit/scripts/harness/init-project.ts \\',
    '  --target /path/to/your-project \\',
    '  --profile web-service \\',
    '  --project-id my-service \\',
    '  --owner your-github-handle',
    '```',
    '',
    '## License',
    '',
    'Released under GNU AGPL-3.0-only (matching upstream `vmark` harness toolkit).',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), readme, 'utf8');

  const publishScript = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'REPO_NAME="${1:-superpowers-harness-skill}"',
    'VISIBILITY="${2:-public}"',
    'if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then',
    '  git init -b main',
    'fi',
    'git add -A',
    'git commit -m "feat: initial superpowers-harness skill and executable kit" || true',
    'gh repo create "$REPO_NAME" "--${VISIBILITY}" --source=. --remote=origin --push',
    'echo "Published standalone Skill repository: $REPO_NAME ($VISIBILITY)"',
    '',
  ].join('\n');
  const scriptPath = path.join(outDir, 'publish-to-github.sh');
  fs.writeFileSync(scriptPath, publishScript, 'utf8');
  fs.chmodSync(scriptPath, 0o755);
}

const isDirectEntry =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectEntry) {
  const args = process.argv.slice(2);
  const outArg = parseFlag(args, '--out') ?? 'dist/superpowers-harness-skill';
  const templateRoot = path.resolve(import.meta.dirname, '../..');
  const outDir = path.resolve(templateRoot, outArg);
  exportSkillRepository({ templateRoot, outDir });
  console.log(`Exported publish-ready Superpowers Harness Skill bundle to ${outDir}`);
}
