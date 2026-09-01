// @file: Finite real-CLI composition harness from empty SDD state through infra closure.
// @consumers: sdd-new, sdd-check, sdd-task, sdd-session, sdd-verify, sdd-log, sdd-sync
// @tasks: N/A

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { parsePhaseReceipts } from '../../../shared/sdd/phase-receipt.ts';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');
const TICKET = 'specs/infra/infra.task.IB-tool.md';
const INDEX = 'specs/infra/infra.3-tasks.md';
const NODE_RULE = 'ai/directives/infra/nodejs-npm-setup.xml';
const CHECKPOINT_PAYLOAD = '.claude/tmp/IB-tool-P2-worker-checkpoint.json';

type TicketOptions = { typecheckTarget: boolean; deviation: boolean };

function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  return env;
}

function commitFixtureState(root: string, message: string): void {
  const env = cleanGitEnv();
  execFileSync('git', ['add', '-A'], { cwd: root, env });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: root, env });
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
    'utf8'
  );
  chmodSync(bin, 0o755);
}

function infraSpec(): string {
  return [
    '# Infrastructure: Toolchain',
    '<!--SECTION:SCOPE_TYPE-->',
    'infrastructure',
    '<!--/SECTION:SCOPE_TYPE-->',
    '',
    '#### Service: `Toolchain`',
    'Owns the Node/npm, TypeScript compiler, and selected test-gate boundaries.',
    '',
    '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
    '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
    '|---|---|---|---|---|---|',
    '| node commands | tool | this-scope-task | create | test, format, format:fix, lint, lint:fix, fix | package.json, package-lock.json, scripts/pass.mjs, scripts/fix.mjs |',
    '| coverage command | tool | this-scope-task | create | test:coverage | scripts/coverage.mjs |',
    '| compiler command | tool | this-scope-task | create | type-check | tsconfig.json, scripts/typecheck.mjs |',
    '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
    '',
  ].join('\n');
}

function ticket(options: TicketOptions): string {
  return [
    '# Task: IB-tool — Materialize the project toolchain',
    '<!--SECTION:META-->',
    '## Meta',
    '- **Task-ID:** IB-tool',
    '- **Status:** [ ] TODO',
    '- **Purpose:** materialize and prove the minimal Node, TypeScript, and test capability DAG',
    '- **Scope:** infra',
    '- **Module:** N/A',
    '- **Structural Owner:** infrastructure-flat',
    '- **Owning Spec:** [Owning spec](./infra.spec.md)',
    '- **Dependencies:** None',
    '- **Spec References:**',
    '  - Contract: [Toolchain](./infra.spec.md#service-toolchain)',
    '- **Runtime Backing:** not-implemented',
    '- **Verification Levels:** contract, integration',
    '- **Deferred Runtime Scope:** None',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '## Phases Overview',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    '| P1 | bootstrap | — | [ ] |',
    '| P2 | config | P1 | [ ] |',
    '| P3 | test | P2 | [ ] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '### P1 — bootstrap',
    '- **Objective:** materialize the Node/npm dependency boundary',
    '- **Capability Adapter:** node',
    '- **Bootstrap Action:** dependency-install',
    '- **Provides Packages:** typescript, vitest',
    '- **Provides Capabilities:** node.runtime-version, node.manifest-engine, node.manifest-module-kind, node.registry-config, node.dependencies, node.runtime, node.package-manager',
    '- **Requires Capabilities:** node.runtime',
    '- **Rules:**',
    '  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)',
    '- **Target Files:**',
    '  - package.json',
    '  - package-lock.json',
    '  - .nvmrc',
    '  - .npmrc',
    '  - scripts/pass.mjs',
    '  - scripts/fix.mjs',
    '  - scripts/coverage.mjs',
    '- **Deleted Files:**',
    '  - none',
    '- **Inputs:** none',
    '- **Exit:** the runtime, manifest, registry, and dependency boundary exist',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:PHASE_P2-->',
    '### P2 — config',
    '- **Objective:** materialize the separately selected TypeScript compiler boundary',
    '- **Capability Adapter:** typescript',
    '- **Provides Capabilities:** typescript.compiler',
    '- **Requires Capabilities:** node.package-manager, node.dependencies',
    '- **Requires Packages:** typescript',
    '- **Rules:**',
    '  - none',
    '- **Target Files:**',
    '  - tsconfig.json',
    ...(options.typecheckTarget ? ['  - scripts/typecheck.mjs'] : []),
    '- **Deleted Files:**',
    '  - none',
    '- **Readiness Gates:**',
    '  - type-check',
    '- **Inputs:** P1 handoff',
    '- **Exit:** the compiler configuration and command implementation exist',
    '<!--/SECTION:PHASE_P2-->',
    '<!--SECTION:PHASE_P3-->',
    '### P3 — test',
    '- **Objective:** materialize only the selected TypeScript test-gate boundary and prove it',
    '- **Capability Adapter:** typescript-quality',
    '- **Provides Capabilities:** typescript.test-tooling',
    '- **Requires Capabilities:** typescript.compiler, node.dependencies',
    '- **Requires Packages:** vitest',
    '- **Rules:**',
    '  - none',
    '- **Target Files:**',
    '  - package.json',
    '  - test/toolchain-smoke.test.js',
    '- **Deleted Files:**',
    '  - none',
    '- **Readiness Gates:**',
    '  - test',
    '- **Inputs:** P2 handoff',
    '- **Exit:** the exact smoke command passes',
    '<!--/SECTION:PHASE_P3-->',
    '<!--SECTION:BDD-->',
    '## Acceptance Criteria (BDD)',
    '**Scenario:** exposes the toolchain contract [`contract`] `[IB-REQ-1]`',
    '- **Given** the infrastructure toolchain contract',
    '- **When** its capability graph is resolved',
    '- **Then** Node, TypeScript, and selected test tooling are ordered',
    '',
    '**Scenario:** runs the selected smoke command [`integration`] `[IB-REQ-2]`',
    '- **Given** Node dependencies and TypeScript configuration exist',
    '- **When** `npm test` runs',
    '- **Then** it exits successfully',
    '',
    '**Scenario:** rejects an obsolete monolithic quality capability [`unit`] `[IB-REQ-3]`',
    '- **Given** the old combined quality capability id',
    '- **When** scaffold feasibility validates the selected adapter',
    '- **Then** it rejects the id and prints the supported requirement-selected capabilities',
    '<!--/SECTION:BDD-->',
    '<!--SECTION:VERIFICATION-->',
    '## Verification',
    '<!--PHASE_RECEIPTS:v1-->',
    '<!--COVERAGE_POLICY:v1-->',
    '- **Coverage Policy:** not-applicable',
    '- **Coverage Reason:** this infrastructure ticket proves toolchain commands, not production behavior',
    '| Command | Required by | Role |',
    '|---|---|---|',
    '| `npm test` | IB-REQ-2 | probe |',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:TEST_COVERAGE-->',
    '## Test Scenario Coverage',
    '- exposes the toolchain contract → `test/toolchain-smoke.test.js` :: `exposes the toolchain contract`',
    '- runs the selected smoke command → `test/toolchain-smoke.test.js` :: `runs the selected smoke command` :: command `npm test`',
    '- rejects an obsolete monolithic quality capability → `test/toolchain-smoke.test.js` :: `rejects an obsolete monolithic quality capability`',
    '<!--/SECTION:TEST_COVERAGE-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    '<!--/SECTION:EXECUTION_LOG-->',
    '<!--SECTION:DECISION_LOG-->',
    '## Decision Log',
    '- IB-DL-1 — Keep Node/npm and TypeScript compiler as separate capability layers.',
    ...(options.deviation
      ? [
          '- IB-DEV-1 — Runtime evidence required scripts/typecheck.mjs to become an explicit P2 target.',
        ]
      : []),
    '<!--/SECTION:DECISION_LOG-->',
    '',
  ].join('\n');
}

function tracker(): string {
  return [
    '# Tasks: infra',
    '',
    '## Tracker',
    '| Task-ID | Title | Module | Dependencies | Status | Reopens |',
    '|---|---|---|---|---|---|',
    '| IB-tool | Materialize the project toolchain | N/A | — | [ ] TODO | — |',
    '',
  ].join('\n');
}

function runOk(root: string, args: string[]): string {
  const result = runCli(args, root);
  const output = `${result.stdout}${result.stderr}`;
  assert.strictEqual(result.exitCode, 0, output);
  return output;
}

function createArtifactsThroughSddNew(root: string): void {
  assert.strictEqual(
    existsSync(join(root, 'specs')),
    false,
    'fixture begins with no SDD artifacts'
  );
  runOk(root, ['sdd-new', 'portal', '--out', 'specs/README.md']);
  runOk(root, ['sdd-new', 'infrastructure', '--scope', 'infra']);
  writeFileSync(join(root, 'specs/infra/infra.spec.md'), infraSpec(), 'utf8');
  const created = runOk(root, [
    'sdd-new',
    'task',
    '--owner',
    'infrastructure-flat',
    '--scope',
    'infra',
    '--id',
    'IB-tool',
  ]);
  assert.match(created, /npx gennady sdd-check --task .* --authoring/);
  assert.match(created, /npx gennady sdd-check --scaffold-feasibility/);
  assert.doesNotMatch(created, /--help/);
  runOk(root, ['sdd-new', 'scope-index', '--scope', 'infra']);
  writeFileSync(join(root, TICKET), ticket({ typecheckTarget: false, deviation: false }), 'utf8');
  writeFileSync(join(root, INDEX), tracker(), 'utf8');
  writeFileSync(
    join(root, 'specs/README.md'),
    '# Composition project\n\n## Scopes\n\n| Scope | Type | Status | Description |\n|---|---|---|---|\n| [`infra`](./infra/infra.spec.md) | infrastructure | ✅ | Minimal composition toolchain. |\n',
    'utf8'
  );
  commitFixtureState(root, 'canonical SDD scaffold');
}

function buildCompositionFixture(): string {
  const { root } = buildRepoFixture({
    scripts: {
      'type-check': 'node scripts/typecheck.mjs',
      test: 'node scripts/pass.mjs',
      'test:coverage': 'node scripts/coverage.mjs',
      format: 'node scripts/pass.mjs',
      'format:fix': 'node scripts/fix.mjs --write',
      lint: 'gennady lint',
      'lint:fix': 'node scripts/fix.mjs --fix',
      fix: 'npm run format:fix && npm run lint:fix',
    },
    directives: true,
    files: {
      '.gitignore': 'node_modules/\n.claude/\n',
      'package-lock.json': '{"name":"rc-composition","lockfileVersion":3,"packages":{}}\n',
      [NODE_RULE]: '<Rule id="nodejs-npm-setup">Apply the Node/npm bootstrap order.</Rule>\n',
      'ai/directives/knowledge.xml': readFileSync(
        join(REPO_ROOT, 'ai/directives/knowledge.xml'),
        'utf8'
      ),
    },
  });
  installRealGennady(root);
  createArtifactsThroughSddNew(root);
  return root;
}

function markPhaseDone(root: string, phase: string, kind: string): void {
  const path = join(root, TICKET);
  const previous = phase === 'P1' ? '—' : `P${Number(phase.slice(1)) - 1}`;
  const content = readFileSync(path, 'utf8');
  writeFileSync(
    path,
    content.replace(
      `| ${phase} | ${kind} | ${previous} | [ ] |`,
      `| ${phase} | ${kind} | ${previous} | [x] |`
    ),
    'utf8'
  );
}

function verifyPhase(root: string, phase: string): void {
  const output = runOk(root, ['sdd-verify', '--task', TICKET, '--phase', phase]);
  assert.match(output, new RegExp(`receipt recorded: ${TICKET.replaceAll('.', '\\.')}#${phase}`));
}

function writeCheckpoint(root: string): void {
  runOk(root, ['sdd-session', 'open', '--intent', 'execute']);
  const payloadPath = join(root, CHECKPOINT_PAYLOAD);
  mkdirSync(dirname(payloadPath), { recursive: true });
  writeFileSync(
    payloadPath,
    JSON.stringify({
      schema: 'sdd-worker-checkpoint/v1',
      seq: 1,
      task: 'IB-tool',
      phase: 'P2',
      worker: { session: 'execute-config-1', kind: 'config', observedContextChars: 4096 },
      reason: 'repair-command contract points at an undeclared CREATE target',
      outcome: 'RECOVERABLE_TECHNICAL',
      attempt: { current: 1, budget: 2 },
      evidence: [`${TICKET}#EXECUTION_LOG`],
      technicalPlan: {
        summary: 'declare the typecheck implementation as an exact P2 target',
        taskEdits: [`${TICKET}#PHASE_P2`],
        dagEdits: [TICKET],
        artifactEdits: ['scripts/typecheck.mjs'],
      },
      durableRefs: {
        phase: `${TICKET}#PHASE_P2`,
        task: TICKET,
        decisions: [`${TICKET}#IB-DL-1`],
        deviations: [`${TICKET}#IB-DEV-1`],
        handoff: `${TICKET}#EXECUTION_LOG`,
      },
    }),
    'utf8'
  );
  const checkpoint = runOk(root, [
    'sdd-session',
    'checkpoint',
    '--content-file',
    CHECKPOINT_PAYLOAD,
  ]);
  assert.match(checkpoint, /NEXT=AUTO_REPLAN_AND_CONTINUE/);
  assert.match(checkpoint, /attempt=1\/2/);
}

describe('clean-repo SDD composition harness', { concurrency: 1 }, () => {
  it('proves canonical scaffold, bounded replan, receipts, sync, and infra closure', () => {
    const root = buildCompositionFixture();
    try {
      assert.match(runOk(root, ['sdd-check', '--task', TICKET, '--authoring']), /clean/i);
      assert.match(runOk(root, ['sdd-check', '--scaffold-feasibility']), /clean/i);

      const validTicket = readFileSync(join(root, TICKET), 'utf8');
      writeFileSync(
        join(root, TICKET),
        validTicket.replace('typescript.test-tooling', 'typescript.quality-test-tooling'),
        'utf8'
      );
      commitFixtureState(root, 'old monolithic capability negative');
      const obsolete = runCli(['sdd-check', '--scaffold-feasibility'], root);
      const obsoleteOutput = `${obsolete.stdout}${obsolete.stderr}`;
      assert.notStrictEqual(obsolete.exitCode, 0, obsoleteOutput);
      assert.match(obsoleteOutput, /SDD_SCAFFOLD_CAPABILITY_NOT_DECLARED_BY_ADAPTER/);
      assert.match(
        obsoleteOutput,
        /Expected: one of typescript\.test-tooling, typescript\.eslint-lint-tooling, typescript\.format-tooling/
      );
      assert.match(obsoleteOutput, /Next:/);
      writeFileSync(join(root, TICKET), validTicket, 'utf8');
      commitFixtureState(root, 'restore selected test capability');

      const future = runOk(root, ['sdd-task', TICKET, '--phase', 'P1']);
      assert.match(future, /CREATE files:[^\n]*\.nvmrc[^\n]*\.npmrc/);
      assert.doesNotMatch(future, /--help|search the repository|find an example/i);

      writeFileSync(
        join(root, TICKET),
        ticket({ typecheckTarget: false, deviation: true }),
        'utf8'
      );
      commitFixtureState(root, 'record recoverable technical evidence');
      writeCheckpoint(root);
      writeFileSync(join(root, TICKET), ticket({ typecheckTarget: true, deviation: true }), 'utf8');
      commitFixtureState(root, 'apply bounded P2 target correction');
      runOk(root, ['sdd-check', '--task', TICKET, '--authoring']);
      runOk(root, ['sdd-check', '--scaffold-feasibility']);
      assert.match(runOk(root, ['sdd-task']), /pickable \(ready now\):\s+IB-tool/i);

      runOk(root, ['sdd-log', TICKET, 'round', 'composition']);
      runOk(root, ['sdd-log', TICKET, 'phase', 'P1']);
      writeFileSync(join(root, '.nvmrc'), '22\n', 'utf8');
      writeFileSync(join(root, '.npmrc'), 'fund=false\n', 'utf8');
      const packagePath = join(root, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
      pkg.engines = { node: '>=22' };
      pkg.devDependencies = { typescript: '5.9.2', vitest: '3.2.4' };
      writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(join(root, 'scripts/pass.mjs'), 'process.exit(0);\n', 'utf8');
      writeFileSync(join(root, 'scripts/fix.mjs'), 'process.exit(0);\n', 'utf8');
      writeFileSync(
        join(root, 'scripts/coverage.mjs'),
        "import { mkdirSync, writeFileSync } from 'node:fs';\nmkdirSync('coverage', { recursive: true });\nwriteFileSync('coverage/coverage-final.json', '{}');\n",
        'utf8'
      );
      verifyPhase(root, 'P1');
      markPhaseDone(root, 'P1', 'bootstrap');

      assert.match(
        runOk(root, ['sdd-task', TICKET, '--phase', 'P2']),
        /CREATE files:[^\n]*tsconfig\.json[^\n]*scripts\/typecheck\.mjs/
      );
      runOk(root, ['sdd-log', TICKET, 'phase', 'P2']);
      writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{"noEmit":true}}\n', 'utf8');
      writeFileSync(join(root, 'scripts/typecheck.mjs'), 'process.exit(0);\n', 'utf8');
      verifyPhase(root, 'P2');
      markPhaseDone(root, 'P2', 'config');

      assert.match(
        runOk(root, ['sdd-task', TICKET, '--phase', 'P3']),
        /CREATE files:[^\n]*test\/toolchain-smoke\.test\.js/
      );
      runOk(root, ['sdd-log', TICKET, 'phase', 'P3']);
      const withTest = JSON.parse(readFileSync(packagePath, 'utf8')) as {
        scripts?: Record<string, string>;
      };
      withTest.scripts = {
        ...(withTest.scripts ?? {}),
        test: 'node --test test/toolchain-smoke.test.js',
      };
      writeFileSync(packagePath, `${JSON.stringify(withTest, null, 2)}\n`, 'utf8');
      mkdirSync(join(root, 'test'), { recursive: true });
      writeFileSync(
        join(root, 'test/toolchain-smoke.test.js'),
        [
          "import assert from 'node:assert/strict';",
          "import { existsSync } from 'node:fs';",
          "import test from 'node:test';",
          "test('exposes the toolchain contract', () => assert.equal(existsSync('package.json'), true));",
          "test('runs the selected smoke command', () => assert.equal(existsSync('tsconfig.json'), true));",
          "test('rejects an obsolete monolithic quality capability', () => assert.equal(existsSync('test/toolchain-smoke.test.js'), true));",
          '',
        ].join('\n'),
        'utf8'
      );
      verifyPhase(root, 'P3');
      markPhaseDone(root, 'P3', 'test');
      runOk(root, ['sdd-log', TICKET, 'close']);

      const receipts = parsePhaseReceipts(readFileSync(join(root, TICKET), 'utf8'));
      assert.strictEqual(receipts.ok, true);
      if (receipts.ok)
        assert.deepStrictEqual(
          receipts.receipts.map((receipt) => receipt.phase),
          ['P1', 'P2', 'P3']
        );
      runOk(root, ['sdd-check', '--task', TICKET]);
      runOk(root, ['sdd-sync', TICKET, INDEX]);
      assert.match(readFileSync(join(root, INDEX), 'utf8'), /\| IB-tool \|[^\n]*\| \[x\] DONE \|/);
      const finalMap = runOk(root, ['sdd-task']);
      assert.doesNotMatch(finalMap, /^  IB-tool →/m);
      assert.match(finalMap, /execution map — 0 pickable, 0 blocked/);
      assert.match(finalMap, /READINESS=ready\nEXECUTION_READY=yes\nGATE_QUEUE=none/);
      assert.match(finalMap, /активных TODO-тикетов нет — вызови `sdd-state`/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
