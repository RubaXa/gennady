// @file: Reusable clean-repo composition harness joining scaffold, map, phase, verify, receipt, and log surfaces.
// @consumers: sdd-check, sdd-task, sdd-verify, sdd-log
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parsePhaseReceipts } from '../../../shared/sdd/phase-receipt.ts';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const ESLINT_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'eslint');
const PRETTIER_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'prettier');
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');
const PACKAGES = ['typescript', 'eslint', 'vitest', '@playwright/test', 'eslint-config-prettier'];
const GATES = [
  'type-check',
  'test',
  'test:coverage',
  'lint',
  'format',
  'format:fix',
  'lint:fix',
  'fix',
];

type TicketShape = {
  id: string;
  scope: 'infra' | 'app';
  dependencies: string;
  kind: 'bootstrap' | 'config' | 'impl';
  targets: string[];
  bootstrap?: boolean;
  requiresPackages?: boolean;
};

type CompositionFixture = {
  root: string;
  tickets: {
    owner: string;
    configs: string;
    gates: string;
    product: string;
  };
};

function scripts(lintFix = `${ESLINT_BIN} --fix`): Record<string, string> {
  return {
    gennady: 'gennady --help',
    'format:fix': `${PRETTIER_BIN} --write`,
    'lint:fix': lintFix,
    'type-check': 'node scripts/pass.mjs',
    test: 'node scripts/pass.mjs',
    'test:coverage': 'node scripts/coverage.mjs',
    format: `${PRETTIER_BIN} --check`,
    lint: 'gennady lint src/',
    fix: 'npm run format:fix -- . && npm run lint:fix -- src/',
  };
}

function ticket(shape: TicketShape): string {
  return [
    `# Task: ${shape.id}`,
    '<!--SECTION:META-->',
    `- **Task-ID:** ${shape.id}`,
    '- **Status:** [ ] TODO',
    `- **Purpose:** ${shape.bootstrap ? 'install the declared toolchain dependencies' : 'materialize the declared repository artifact'}`,
    `- **Scope:** ${shape.scope}`,
    '- **Module:** N/A',
    `- **Dependencies:** ${shape.dependencies}`,
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    `| P1 | ${shape.kind} | — | [ ] |`,
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    `### P1 — ${shape.kind}`,
    `- **Objective:** ${shape.bootstrap ? 'install declared toolchain dependencies and configure exact-target repair' : 'create the phase-owned artifact'}`,
    ...(shape.bootstrap
      ? [
          '- **Bootstrap Action:** dependency-install',
          `- **Provides Packages:** ${PACKAGES.join(', ')}`,
          '- **Readiness Gates:**',
          ...GATES.map((gate) => `  - ${gate}`),
        ]
      : []),
    ...(shape.requiresPackages ? [`- **Requires Packages:** ${PACKAGES.join(', ')}`] : []),
    '- **Rules:**',
    '  - none',
    '- **Target Files:**',
    ...shape.targets.map((target) => `  - ${target}`),
    '- **Deleted Files:**',
    '  - none',
    '- **Inputs:** none',
    '- **Exit:** every target exists and the canonical phase receipt is current',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:BDD-->',
    '## Acceptance Criteria (BDD)',
    `**Scenario:** ${shape.id} artifact exists [\`unit\`] [${shape.id}-REQ-1]`,
    '- **Given** the dependency-ready clean repository',
    '- **When** the exact phase implementation completes',
    '- **Then** every declared target exists',
    '<!--/SECTION:BDD-->',
    '<!--SECTION:VERIFICATION-->',
    '<!--PHASE_RECEIPTS:v1-->',
    '<!--COVERAGE_POLICY:v1-->',
    '- **Coverage Policy:** not-applicable',
    '- **Coverage Reason:** composition harness verifies orchestration and exact-target infrastructure receipts',
    '| Command | Required by | Role |',
    '|---|---|---|',
    '| — | — | extra |',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:TEST_COVERAGE-->',
    `- ${shape.id} artifact exists → \`composition harness\` :: \`${shape.id} exact targets\``,
    '<!--/SECTION:TEST_COVERAGE-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    '<!--/SECTION:EXECUTION_LOG-->',
    '',
  ].join('\n');
}

function portal(): string {
  return [
    '# Composition Project',
    '',
    '## Scopes',
    '',
    '| Scope | Type | Status | Description |',
    '|---|---|---|---|',
    '| [`infra`](./infra/infra.spec.md) | infrastructure | done | toolchain |',
    '| [`app`](./app/app.spec.md) | product | done | product |',
    '',
  ].join('\n');
}

function installRealGennady(root: string): void {
  const bin = join(root, 'node_modules', '.bin', 'gennady');
  mkdirSync(dirname(bin), { recursive: true });
  writeFileSync(
    bin,
    [
      '#!/usr/bin/env node',
      "const { spawnSync } = require('node:child_process');",
      `const result = spawnSync(process.execPath, ['--import', ${JSON.stringify(TSX_LOADER)}, ${JSON.stringify(GENNADY_ENTRY)}, ...process.argv.slice(2)], { stdio: 'inherit' });`,
      'process.exit(result.status ?? 1);',
      '',
    ].join('\n'),
    'utf-8'
  );
  chmodSync(bin, 0o755);
}

function commitFixtureState(root: string, message: string): void {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  execFileSync('git', ['add', '-A'], { cwd: root, env });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: root, env });
}

function buildCompositionFixture(lintFix?: string): CompositionFixture {
  const owner = 'specs/infra/infra.task.IB-toolchain.md';
  const configs = 'specs/infra/infra.task.IB-configs.md';
  const gates = 'specs/infra/infra.task.IB-gates.md';
  const product = 'specs/app/app.task.APP-product.md';
  const ownerTargets = [
    'package.json',
    'package-lock.json',
    'eslint.config.mjs',
    'scripts/pass.mjs',
    'scripts/coverage.mjs',
    'src/toolchain.ts',
  ];
  const { root } = buildRepoFixture({
    scripts: scripts(lintFix),
    directives: true,
    files: {
      'package-lock.json': '{"lockfileVersion":3}\n',
      'specs/README.md': portal(),
      'specs/infra/infra.spec.md': [
        '# Infra',
        '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
        '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
        '|---|---|---|---|---|---|',
        `| toolchain | tool | this-scope-task | create | ${GATES.join(', ')} | ${ownerTargets.join(', ')} |`,
        '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
        '',
      ].join('\n'),
      'specs/app/app.spec.md': '# App\n',
      [owner]: ticket({
        id: 'IB-toolchain',
        scope: 'infra',
        dependencies: 'None',
        kind: 'bootstrap',
        targets: ownerTargets,
        bootstrap: true,
      }),
      [configs]: ticket({
        id: 'IB-configs',
        scope: 'infra',
        dependencies: 'IB-toolchain',
        kind: 'config',
        targets: ['tsconfig.json', 'vitest.config.ts'],
        requiresPackages: true,
      }),
      [gates]: ticket({
        id: 'IB-gates',
        scope: 'infra',
        dependencies: 'IB-toolchain',
        kind: 'config',
        targets: ['scripts/gates-smoke.mjs'],
        requiresPackages: true,
      }),
      [product]: ticket({
        id: 'APP-product',
        scope: 'app',
        dependencies: 'IB-configs, IB-gates',
        kind: 'impl',
        targets: ['src/app.ts'],
      }),
      'notes/operator.txt': 'clean baseline\n',
    },
  });
  installRealGennady(root);
  return { root, tickets: { owner, configs, gates, product } };
}

function writeScripts(root: string, next: Record<string, string>): void {
  const path = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  pkg.scripts = next;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
}

function cleanEslintConfig(sideEffect?: string): string {
  return [
    ...(sideEffect
      ? [
          "import { appendFileSync } from 'node:fs';",
          `appendFileSync(${JSON.stringify(sideEffect)}, 'outside mutation\\n');`,
        ]
      : []),
    'export default [{',
    "  files: ['**/*.{js,mjs,ts,tsx}'],",
    "  rules: { semi: ['error', 'always'] },",
    '}];',
    '',
  ].join('\n');
}

function writeOwnerTargets(root: string, eslint = cleanEslintConfig()): void {
  writeScripts(root, scripts());
  const files: Record<string, string> = {
    'eslint.config.mjs': eslint,
    'scripts/pass.mjs': 'process.exit(0);\n',
    'scripts/coverage.mjs': [
      "import { mkdirSync, writeFileSync } from 'node:fs';",
      "mkdirSync('coverage', { recursive: true });",
      "writeFileSync('coverage/coverage-final.json', '{}');",
      '',
    ].join('\n'),
    'src/toolchain.ts': [
      '// @file: Composition toolchain target.',
      '// @consumers: CleanRepoComposition',
      '',
      '/** @purpose Prove the real Gennady adapter runs on an exact TypeScript target. */',
      'export const TOOLCHAIN_READY = true;',
      '',
    ].join('\n'),
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf-8');
  }
}

function writeConfigTargets(root: string): void {
  writeFileSync(
    join(root, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { noEmit: true } }, null, 2)}\n`,
    'utf-8'
  );
  writeFileSync(
    join(root, 'vitest.config.ts'),
    [
      '// @file: Composition Vitest config.',
      '// @consumers: CleanRepoComposition',
      '',
      '/** @purpose Minimal test configuration owned by IB-configs. */',
      'export default {};',
      '',
    ].join('\n'),
    'utf-8'
  );
}

function writeGateTargets(root: string): void {
  writeFileSync(join(root, 'scripts', 'gates-smoke.mjs'), 'export const smoke = true;\n');
}

function markPhaseDone(root: string, ticketPath: string, kind: TicketShape['kind']): void {
  // This is the sole direct ticket mutation in the harness: it simulates the phase worker's own
  // post-verification lifecycle write. Round/phase/close evidence remains owned by the real sdd-log.
  const absolute = join(root, ticketPath);
  const content = readFileSync(absolute, 'utf-8');
  writeFileSync(
    absolute,
    content.replace(`| P1 | ${kind} | — | [ ] |`, `| P1 | ${kind} | — | [x] |`),
    'utf-8'
  );
}

function openPhase(fixture: CompositionFixture, ticketPath: string): void {
  const round = runCli(['sdd-log', ticketPath, 'round', 'composition'], fixture.root);
  assert.strictEqual(round.exitCode, 0, round.stdout + round.stderr);
  const phase = runCli(['sdd-log', ticketPath, 'phase', 'P1'], fixture.root);
  assert.strictEqual(phase.exitCode, 0, phase.stdout + phase.stderr);
}

function verifyAndClose(
  fixture: CompositionFixture,
  ticketPath: string,
  kind: TicketShape['kind']
): string {
  const verify = runCli(['sdd-verify', '--task', ticketPath, '--phase', 'P1'], fixture.root);
  assert.strictEqual(verify.exitCode, 0, verify.stdout + verify.stderr);
  const parsed = parsePhaseReceipts(readFileSync(join(fixture.root, ticketPath), 'utf-8'));
  assert.strictEqual(parsed.ok, true);
  if (parsed.ok) assert.ok(parsed.receipts.some((receipt) => receipt.phase === 'P1'));
  markPhaseDone(fixture.root, ticketPath, kind);
  const close = runCli(['sdd-log', ticketPath, 'close'], fixture.root);
  assert.strictEqual(close.exitCode, 0, close.stdout + close.stderr);
  return verify.stdout + verify.stderr;
}

describe('clean-repo SDD composition harness', { concurrency: 1 }, () => {
  assert.ok(existsSync(ESLINT_BIN), `real ESLint is required at ${ESLINT_BIN}`);
  assert.ok(existsSync(PRETTIER_BIN), `real Prettier is required at ${PRETTIER_BIN}`);

  it('advances clean HEAD from one bootstrap owner through two infra receipts to product', () => {
    const fixture = buildCompositionFixture();
    const { root, tickets } = fixture;
    try {
      const feasible = runCli(['sdd-check', '--scaffold-feasibility', root], root);
      assert.strictEqual(feasible.exitCode, 0, feasible.stdout + feasible.stderr);

      const initialMap = runCli(['sdd-task'], root);
      assert.strictEqual(initialMap.exitCode, 0, initialMap.stdout + initialMap.stderr);
      assert.match(initialMap.stdout, /pickable \(ready now\):\s+IB-toolchain/m);
      assert.doesNotMatch(initialMap.stdout, /^  IB-configs →|^  IB-gates →|^  APP-product →/m);

      openPhase(fixture, tickets.owner);
      const context = runCli(['sdd-task', tickets.owner, '--phase', 'P1'], root);
      assert.strictEqual(context.exitCode, 0, context.stdout + context.stderr);
      assert.match(context.stdout, /READ files:[\s\S]*package\.json[\s\S]*package-lock\.json/);
      assert.match(
        context.stdout,
        /CREATE files:[\s\S]*eslint\.config\.mjs[\s\S]*src\/toolchain\.ts/
      );

      const missing = runCli(['sdd-verify', '--task', tickets.owner, '--phase', 'P1'], root);
      assert.notStrictEqual(missing.exitCode, 0, missing.stdout + missing.stderr);
      assert.match(missing.stdout + missing.stderr, /Target File path is missing/i);

      writeFileSync(join(root, 'notes', 'operator.txt'), 'pre-existing dirty note\n', 'utf-8');
      writeOwnerTargets(root);
      const ownerVerification = verifyAndClose(fixture, tickets.owner, 'bootstrap');
      assert.match(ownerVerification, /ALL PASS/);
      const ownerReceipt = readFileSync(join(root, tickets.owner), 'utf-8');
      assert.match(ownerReceipt, /npm run format:fix --/);
      assert.match(ownerReceipt, /npm run lint:fix --/);
      assert.match(ownerReceipt, /gennady lint --autofix --include-tests/);
      assert.strictEqual(
        readFileSync(join(root, 'notes', 'operator.txt'), 'utf-8'),
        'pre-existing dirty note\n'
      );

      const infraMap = runCli(['sdd-task'], root);
      assert.strictEqual(infraMap.exitCode, 0, infraMap.stdout + infraMap.stderr);
      assert.match(infraMap.stdout, /^  IB-configs →/m);
      assert.match(infraMap.stdout, /^  IB-gates →/m);
      assert.doesNotMatch(infraMap.stdout, /^  APP-product →/m);
      assert.deepStrictEqual(
        [...infraMap.stdout.matchAll(/^  ([A-Z][A-Za-z0-9-]+) →/gm)].map((match) => match[1]),
        ['IB-configs', 'IB-gates'],
        'the map exposes two choices; execute prompt contract owns the ambiguity stop'
      );

      openPhase(fixture, tickets.configs);
      writeConfigTargets(root);
      verifyAndClose(fixture, tickets.configs, 'config');
      const oneInfraLeft = runCli(['sdd-task'], root);
      assert.match(oneInfraLeft.stdout, /^  IB-gates →/m);
      assert.doesNotMatch(oneInfraLeft.stdout, /^  APP-product →/m);

      openPhase(fixture, tickets.gates);
      writeGateTargets(root);
      verifyAndClose(fixture, tickets.gates, 'config');
      const productMap = runCli(['sdd-task'], root);
      assert.strictEqual(productMap.exitCode, 0, productMap.stdout + productMap.stderr);
      assert.match(productMap.stdout, /^  APP-product →/m);
      assert.doesNotMatch(productMap.stdout, /^  IB-configs →|^  IB-gates →/m);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('routes a broad-root lint owner, rejects it, and passes after exact-target repair', () => {
    const fixture = buildCompositionFixture(`${ESLINT_BIN} --fix .`);
    const { root, tickets } = fixture;
    try {
      writeOwnerTargets(root);
      writeScripts(root, scripts(`${ESLINT_BIN} --fix .`));
      const map = runCli(['sdd-task'], root);
      assert.match(map.stdout, /GATE_QUEUE=IB-toolchain/);
      assert.match(map.stdout, /pickable \(ready now\):\s+IB-toolchain/m);

      const rejected = runCli(['sdd-verify', '--task', tickets.owner, '--phase', 'P1'], root);
      assert.notStrictEqual(rejected.exitCode, 0, rejected.stdout + rejected.stderr);
      assert.match(rejected.stdout + rejected.stderr, /cannot fingerprint.*repository root/s);

      writeScripts(root, scripts());
      const repaired = runCli(['sdd-verify', '--task', tickets.owner, '--phase', 'P1'], root);
      assert.strictEqual(repaired.exitCode, 0, repaired.stdout + repaired.stderr);
      assert.match(
        repaired.stdout + repaired.stderr,
        /receipt recorded: specs\/infra\/infra\.task\.IB-toolchain\.md#P1/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when a real ESLint config mutates outside exact phase targets', () => {
    const fixture = buildCompositionFixture();
    const { root, tickets } = fixture;
    try {
      writeOwnerTargets(root, cleanEslintConfig('notes/operator.txt'));
      const before = readFileSync(join(root, 'notes', 'operator.txt'), 'utf-8');
      const rejected = runCli(['sdd-verify', '--task', tickets.owner, '--phase', 'P1'], root);
      assert.notStrictEqual(rejected.exitCode, 0, rejected.stdout + rejected.stderr);
      assert.match(
        rejected.stdout + rejected.stderr,
        /mutated paths outside its permitted write-set/
      );
      assert.match(rejected.stdout + rejected.stderr, /notes\/operator\.txt/);
      assert.notStrictEqual(readFileSync(join(root, 'notes', 'operator.txt'), 'utf-8'), before);
      const parsed = parsePhaseReceipts(readFileSync(join(root, tickets.owner), 'utf-8'));
      assert.deepStrictEqual(parsed, { ok: true, receipts: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('stops ambiguous package/lock ownership and reverse bootstrap dependency at scaffold', () => {
    const ambiguous = buildCompositionFixture();
    const reverse = buildCompositionFixture();
    try {
      const duplicate = ticket({
        id: 'IB-toolchain-2',
        scope: 'infra',
        dependencies: 'None',
        kind: 'bootstrap',
        targets: ['package.json', 'package-lock.json'],
        bootstrap: true,
      });
      writeFileSync(
        join(ambiguous.root, 'specs/infra/infra.task.IB-toolchain-2.md'),
        duplicate,
        'utf-8'
      );
      commitFixtureState(ambiguous.root, 'ambiguous scaffold graph');
      const ambiguousResult = runCli(
        ['sdd-check', '--scaffold-feasibility', ambiguous.root],
        ambiguous.root
      );
      assert.notStrictEqual(
        ambiguousResult.exitCode,
        0,
        ambiguousResult.stdout + ambiguousResult.stderr
      );
      assert.match(
        ambiguousResult.stdout + ambiguousResult.stderr,
        /SDD_SCAFFOLD_SHARED_ARTIFACT_OWNER_AMBIGUOUS.*package\.json/s
      );

      const ownerPath = join(reverse.root, reverse.tickets.owner);
      writeFileSync(
        ownerPath,
        readFileSync(ownerPath, 'utf-8').replace(
          '- **Dependencies:** None',
          '- **Dependencies:** IB-configs, IB-gates'
        ),
        'utf-8'
      );
      commitFixtureState(reverse.root, 'reverse scaffold graph');
      const reverseResult = runCli(
        ['sdd-check', '--scaffold-feasibility', reverse.root],
        reverse.root
      );
      assert.notStrictEqual(reverseResult.exitCode, 0, reverseResult.stdout + reverseResult.stderr);
      assert.match(
        reverseResult.stdout + reverseResult.stderr,
        /SDD_SCAFFOLD_BOOTSTRAP_REVERSE_DEP/
      );
    } finally {
      rmSync(ambiguous.root, { recursive: true, force: true });
      rmSync(reverse.root, { recursive: true, force: true });
    }
  });
});
