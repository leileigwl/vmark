import fs from 'node:fs';
import path from 'node:path';
import type { ProfileKind } from './types.ts';

function copyTree(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (src.endsWith('.sh') || src.includes('.githooks/')) {
    fs.chmodSync(dest, 0o755);
  }
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function buildStarterAgentsMd(projectId: string, profile: ProfileKind): string {
  return [
    `# AGENTS.md — ${projectId} AI Harness Bootstrap`,
    '',
    '> Concise entry rules (**<= 100 lines**). Enforced mechanically via `.harness/`, `scripts/harness/`, and `.agents/hooks.json`.',
    '',
    '## SSOT Index',
    '- [OPERATOR_PLAYBOOK.md](docs/OPERATOR_PLAYBOOK.md)',
    '- [session-handoff.md](docs/session-handoff.md)',
    '',
    '## Mandatory Commands',
    '- Package manager: `pnpm` only.',
    '- Static guardrails: `pnpm harness:check --json`',
    '- State transitions: `pnpm harness:transition --to <PHASE>`',
    `- Profile: \`${profile}\` (see \`.harness/project.json\`)`,
    '',
  ].join('\n');
}

function buildStarterPlaybook(projectId: string, owner: string, profile: ProfileKind): string {
  return [
    `# ${projectId} Operator Playbook (${profile})`,
    '',
    '1. Open a single agent window; `SessionStart` injects phase, lock state, and pending GitHub issues.',
    `2. Low/mid-risk PRs squash-merge to \`test\`; high-risk/bootstrap PRs wait for \`@${owner}\` \`/approve\`.`,
    '3. Nightly `test -> master` summary PR displays 5 health KPIs for manual acceptance.',
    '',
  ].join('\n');
}

function buildStarterHandoff(projectId: string, profile: ProfileKind): string {
  return [
    `# ${projectId} Session Handoff`,
    '',
    `- **Profile**: \`${profile}\``,
    '- **Phase**: `SPEC` (`bootstrapLocked: true`)',
    '- **Verification**: Initialized from portable harness kit; add feature OpenSpec before coding.',
    '',
  ].join('\n');
}

/** Bootstraps a new or existing project directory with executable Harness guardrails and profile assets. */
export function initHarnessProject(options: {
  templateRoot: string;
  targetDir: string;
  profile: ProfileKind;
  projectId: string;
  owner: string;
}): void {
  const { templateRoot, targetDir, profile, projectId, owner } = options;
  fs.mkdirSync(targetDir, { recursive: true });

  // 1. Copy standard kit directories/files
  copyTree(path.join(templateRoot, '.harness/schemas'), path.join(targetDir, '.harness/schemas'));
  copyTree(path.join(templateRoot, `.harness/profiles/${profile}.json`), path.join(targetDir, `.harness/profiles/${profile}.json`));
  if (profile === 'web-service') {
    copyTree(path.join(templateRoot, '.harness/profiles/web-service'), path.join(targetDir, '.harness/profiles/web-service'));
  }
  copyTree(path.join(templateRoot, '.agents/hooks.json'), path.join(targetDir, '.agents/hooks.json'));
  copyTree(path.join(templateRoot, '.agents/skills/superpowers-harness'), path.join(targetDir, '.agents/skills/superpowers-harness'));
  copyTree(path.join(templateRoot, '.claude/settings.json'), path.join(targetDir, '.claude/settings.json'));
  copyTree(path.join(templateRoot, '.githooks'), path.join(targetDir, '.githooks'));
  copyTree(path.join(templateRoot, '.github'), path.join(targetDir, '.github'));

  const harnessDest = path.join(targetDir, 'scripts/harness');
  fs.mkdirSync(harnessDest, { recursive: true });
  for (const entry of fs.readdirSync(path.join(templateRoot, 'scripts/harness'))) {
    if (entry.endsWith('.ts') || entry === 'package.json') {
      fs.copyFileSync(path.join(templateRoot, 'scripts/harness', entry), path.join(harnessDest, entry));
    }
  }

  // 2. Load profile template & write project.json / state.json / ratchet.json
  const profileTplPath = path.join(templateRoot, `.harness/profiles/${profile}.json`);
  const profileTpl = JSON.parse(fs.readFileSync(profileTplPath, 'utf8')) as {
    layerBoundaries?: unknown[];
    commands?: Record<string, string>;
  };

  const projectConfig = {
    $schema: './schemas/project.schema.json',
    projectId,
    profile,
    owner,
    githubNotifyUser: owner,
    bootstrapLocked: true,
    bootstrapLockProtectedPaths: [
      '.harness/**',
      'scripts/harness/**',
      '.agents/hooks.json',
      '.claude/settings.json',
      '.githooks/**',
      '.github/**',
      'AGENTS.md',
      'LICENSE*',
    ],
    licenseMode: 'AGPL-3.0-or-commercial',
    limits: {
      newFileMaxLines: 500,
      sliceMaxDiffLines: 300,
      agentsMdMaxLines: 100,
      handoffMaxLines: 120,
      circuitBreakerMaxRetries: 2,
    },
    moduleIslands: {
      rendererRoot: profile === 'web-service' ? 'src/routes' : 'apps/desktop/src/renderer/src/features',
      mainIpcRoot: profile === 'web-service' ? 'src/services' : 'apps/desktop/src/main/ipc',
      barrelFile: 'index.ts',
      forbidCrossIslandDeepImport: true,
      forbidCycles: true,
    },
    layerBoundaries: profileTpl.layerBoundaries ?? [],
    commands: profileTpl.commands ?? {},
  };

  fs.writeFileSync(path.join(targetDir, '.harness/project.json'), `${JSON.stringify(projectConfig, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(targetDir, '.harness/state.json'),
    `${JSON.stringify(
      {
        $schema: './schemas/state.schema.json',
        changeName: 'bootstrap',
        track: 'fast',
        phase: 'SPEC',
        prototypeApproved: false,
        contractFrozen: false,
        activeFreezeLock: false,
        gates: { specValidated: false, frontendTddPassed: false, ipcContractPassed: false, backendTddPassed: false },
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(targetDir, '.harness/ratchet.json'),
    `${JSON.stringify({ $schema: './schemas/ratchet.schema.json', defaultNewFileMaxLines: 500, files: {} }, null, 2)}\n`,
    'utf8'
  );
  fs.mkdirSync(path.join(targetDir, '.harness/slices'), { recursive: true });
  fs.writeFileSync(path.join(targetDir, '.harness/slices/.gitkeep'), '', 'utf8');

  // 3. Docs + starter package.json scripts
  fs.mkdirSync(path.join(targetDir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'AGENTS.md'), buildStarterAgentsMd(projectId, profile), 'utf8');
  fs.writeFileSync(path.join(targetDir, 'docs/OPERATOR_PLAYBOOK.md'), buildStarterPlaybook(projectId, owner, profile), 'utf8');
  fs.writeFileSync(path.join(targetDir, 'docs/session-handoff.md'), buildStarterHandoff(projectId, profile), 'utf8');

  const pkgPath = path.join(targetDir, 'package.json');
  const existingPkg = fs.existsSync(pkgPath)
    ? (JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string>; [k: string]: unknown })
    : { name: projectId, version: '0.1.0', private: true, scripts: {} };
  existingPkg.scripts = {
    ...(existingPkg.scripts ?? {}),
    'harness:check': 'node --experimental-strip-types scripts/harness/cli.ts check',
    'harness:transition': 'node --experimental-strip-types scripts/harness/cli.ts transition',
    'harness:risk': 'node --experimental-strip-types scripts/harness/cli.ts risk',
    'harness:plan-slices': 'node --experimental-strip-types scripts/harness/cli.ts plan-slices',
    'harness:slice-verify': 'node --experimental-strip-types scripts/harness/cli.ts slice-verify',
    'harness:unlock-bootstrap': 'node --experimental-strip-types scripts/harness/cli.ts unlock-bootstrap',
    'harness:lock-bootstrap': 'node --experimental-strip-types scripts/harness/cli.ts lock-bootstrap',
    'harness:slop': 'node --experimental-strip-types scripts/harness/cli.ts slop',
    'harness:test': 'node --experimental-strip-types --test scripts/harness/*.test.ts',
  };
  fs.writeFileSync(pkgPath, `${JSON.stringify(existingPkg, null, 2)}\n`, 'utf8');
}

const isDirectEntry =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectEntry) {
  const args = process.argv.slice(2);
  const targetDir = parseFlag(args, '--target');
  const rawProfile = (parseFlag(args, '--profile') ?? 'web-service') as ProfileKind;
  if (!targetDir || (rawProfile !== 'desktop-electron' && rawProfile !== 'web-service')) {
    console.error('Usage: init-project.ts --target <dir> --profile <desktop-electron|web-service> [--project-id <id>] [--owner <githubUser>]');
    process.exit(1);
  }
  const absTarget = path.resolve(targetDir);
  const projectId = parseFlag(args, '--project-id') ?? path.basename(absTarget);
  const owner = parseFlag(args, '--owner') ?? 'maintainer';
  const templateRoot = path.resolve(import.meta.dirname, '../..');
  initHarnessProject({ templateRoot, targetDir: absTarget, profile: rawProfile, projectId, owner });
  console.log(`Initialized executable Harness Kit (${rawProfile}) in ${absTarget}`);
}
