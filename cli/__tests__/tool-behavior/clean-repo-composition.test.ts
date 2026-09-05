// @file: Finite real-CLI composition harness from empty SDD state through infra closure.
// @consumers: sdd-new, sdd-check, sdd-task, sdd-verify, sdd-log, sdd-sync
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
    '- **Purpose:** materialize and prove the minimal Node, TypeScript, and test infrastructure order',
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
    '- **When** its phase order is semantically reviewed and executed',
    '- **Then** Node, TypeScript, and selected test tooling are ordered',
    '',
    '**Scenario:** runs the selected smoke command [`integration`] `[IB-REQ-2]`',
    '- **Given** Node dependencies and TypeScript configuration exist',
    '- **When** `npm test` runs',
    '- **Then** it exits successfully',
    '',
    '**Scenario:** rejects a missing real readiness input [`unit`] `[IB-REQ-3]`',
    '- **Given** a gate command whose declared target does not exist yet',
    '- **When** phase verification validates the selected phase',
    '- **Then** it waits for the readiness owner instead of running the command early',
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
    '- exposes the toolchain contract → `test/toolchain-smoke.test.js` :: `[IB-REQ-1] exposes the toolchain contract`',
    '- runs the selected smoke command → `test/toolchain-smoke.test.js` :: `[IB-REQ-2] runs the selected smoke command` :: command `npm test`',
    '- rejects a missing real readiness input → `test/toolchain-smoke.test.js` :: `[IB-REQ-3] rejects a missing real readiness input`',
    '<!--/SECTION:TEST_COVERAGE-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    '### Round 1 — <YYYY-MM-DD>, initial',
    '#### P1',
    '- [ ] `<ts>` DONE',
    '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]',
    '#### P2',
    '- [ ] `<ts>` DONE',
    '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]',
    '#### P3',
    '- [ ] `<ts>` DONE',
    '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]',
    '#### Round close',
    '- [ ] `<ts>` DONE',
    '<!--/SECTION:EXECUTION_LOG-->',
    '<!--SECTION:DECISION_LOG-->',
    '## Decision Log',
    '- IB-DL-1 — Keep Node/npm setup and TypeScript compiler configuration in separate ordered phases.',
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

function verifyPhase(root: string, phase: string): void {
  const output = runOk(root, ['sdd-verify', '--task', TICKET, '--phase', phase]);
  assert.match(output, new RegExp(`receipt recorded: ${TICKET.replaceAll('.', '\\.')}#${phase}`));
}

function completePhase(root: string, phase: string, artifacts: string): void {
  runOk(root, [
    'sdd-log',
    TICKET,
    'complete',
    `artifacts: [${artifacts}]; decisions: [none]; open: [none]; deviations: []`,
    '--phase',
    phase,
  ]);
}

describe('clean-repo SDD composition harness', { concurrency: 1 }, () => {
  it('proves canonical scaffold, bounded replan, receipts, sync, and infra closure', () => {
    const root = buildCompositionFixture();
    try {
      assert.match(runOk(root, ['sdd-check', '--task', TICKET, '--authoring']), /clean/i);

      const future = runOk(root, ['sdd-task', TICKET, '--phase', 'P1']);
      assert.match(future, /CREATE files:[^\n]*\.nvmrc[^\n]*\.npmrc/);
      assert.doesNotMatch(future, /--help|search the repository|find an example/i);

      writeFileSync(
        join(root, TICKET),
        ticket({ typecheckTarget: false, deviation: true }),
        'utf8'
      );
      commitFixtureState(root, 'record recoverable technical evidence');
      writeFileSync(join(root, TICKET), ticket({ typecheckTarget: true, deviation: true }), 'utf8');
      commitFixtureState(root, 'apply bounded P2 target correction');
      runOk(root, ['sdd-check', '--task', TICKET, '--authoring']);
      assert.match(runOk(root, ['sdd-task']), /pickable \(ready now\):\s+IB-tool/i);

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
      completePhase(
        root,
        'P1',
        'package.json, package-lock.json, .nvmrc, .npmrc, scripts/pass.mjs, scripts/fix.mjs, scripts/coverage.mjs'
      );

      assert.match(
        runOk(root, ['sdd-task', TICKET, '--phase', 'P2']),
        /CREATE files:[^\n]*tsconfig\.json[^\n]*scripts\/typecheck\.mjs/
      );
      writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{"noEmit":true}}\n', 'utf8');
      writeFileSync(join(root, 'scripts/typecheck.mjs'), 'process.exit(0);\n', 'utf8');
      verifyPhase(root, 'P2');
      completePhase(root, 'P2', 'tsconfig.json, scripts/typecheck.mjs');

      assert.match(
        runOk(root, ['sdd-task', TICKET, '--phase', 'P3']),
        /CREATE files:[^\n]*test\/toolchain-smoke\.test\.js/
      );
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
          "test('[IB-REQ-1] exposes the toolchain contract', () => assert.equal(existsSync('package.json'), true));",
          "test('[IB-REQ-2] runs the selected smoke command', () => assert.equal(existsSync('tsconfig.json'), true));",
          "test('[IB-REQ-3] rejects a missing real readiness input', () => assert.equal(existsSync('test/toolchain-smoke.test.js'), true));",
          '',
        ].join('\n'),
        'utf8'
      );
      verifyPhase(root, 'P3');
      completePhase(root, 'P3', 'package.json, test/toolchain-smoke.test.js');
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
