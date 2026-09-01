// @file: Real-tool repair adapter matrix for sdd-verify phase targets.
// @consumers: SddVerifyCommand
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildRepoFixture } from './fixture.ts';
import { runCliAsync } from './run-cli.ts';
import { installCapabilityProviderFixtures } from './capability-provider-fixture.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const ESLINT_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'eslint');
const PRETTIER_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'prettier');
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');

const CLEAN_TS = [
  '// @file: Repair adapter fixture.',
  '// @consumers: RepairAdapterMatrix',
  '',
  '/** @purpose A clean exported fixture value. */',
  'export const VALUE = 1',
  '',
].join('\n');

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

function eslintConfig(sideEffectPath?: string): string {
  return [
    ...(sideEffectPath
      ? [
          "import { appendFileSync } from 'node:fs';",
          `appendFileSync(${JSON.stringify(sideEffectPath)}, 'outside mutation\\n');`,
        ]
      : []),
    'export default [{',
    "  files: ['**/*.{js,mjs,ts,tsx}'],",
    "  rules: { semi: ['error', 'always'] },",
    '}];',
    '',
  ].join('\n');
}

function installTicket(root: string, targets: readonly string[]): string[] {
  const spec = join(root, 'specs', 'app', 'app.spec.md');
  const ticket = join(root, 'specs', 'app', 'app.task.TSK-repair.md');
  const pass = join(root, 'scripts', 'pass.mjs');
  mkdirSync(dirname(spec), { recursive: true });
  mkdirSync(dirname(pass), { recursive: true });
  writeFileSync(pass, 'process.exit(0);\n', 'utf-8');
  writeFileSync(spec, '# App\n', 'utf-8');
  writeFileSync(
    ticket,
    [
      '<!--SECTION:META-->',
      '- **Task-ID:** TSK-repair',
      '- **Status:** [ ] TODO',
      '- **Scope:** app',
      '- **Dependencies:** None',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | impl | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Objective:** exercise repair adapters',
      '- **Rules:**',
      '  - none',
      '- **Target Files:**',
      ...targets.map((target) => `  - ${target}`),
      '- **Deleted Files:**',
      '  - none',
      '- **Inputs:** none',
      '- **Exit:** repair completes',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:VERIFICATION-->',
      '<!--PHASE_RECEIPTS:v1-->',
      '| Command | Required by | Role |',
      '|---|---|---|',
      '| — | — | extra |',
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '## Execution Log',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n'),
    'utf-8'
  );
  installCapabilityProviderFixtures(root, 'specs/app/app.task.TSK-repair.md');
  return ['sdd-verify', '--task', 'specs/app/app.task.TSK-repair.md', '--phase', 'P1'];
}

function scripts(lintFix: string): Record<string, string> {
  return {
    'format:fix': `${PRETTIER_BIN} --write`,
    'lint:fix': lintFix,
    'type-check': 'node scripts/pass.mjs',
    test: 'node scripts/pass.mjs',
    'test:coverage': 'node scripts/pass.mjs',
    format: `${PRETTIER_BIN} --check`,
    lint: 'gennady lint',
    fix: 'npm run format:fix -- . && npm run lint:fix -- src/',
  };
}

function ticketBytes(root: string): string {
  return readFileSync(join(root, 'specs/app/app.task.TSK-repair.md'), 'utf-8');
}

describe('sdd-verify — real repair adapter matrix', { concurrency: 1 }, () => {
  assert.ok(existsSync(ESLINT_BIN), `real ESLint is required at ${ESLINT_BIN}`);
  assert.ok(existsSync(PRETTIER_BIN), `real Prettier is required at ${PRETTIER_BIN}`);

  it('generic ESLint repairs an exact TS target without receiving Gennady-only flags', async () => {
    const { root } = buildRepoFixture({
      scripts: scripts(`${ESLINT_BIN} --fix`),
      files: {
        'eslint.config.mjs': eslintConfig(),
        'src/value.ts': CLEAN_TS,
      },
    });
    try {
      installRealGennady(root);
      const result = await runCliAsync(installTicket(root, ['src/value.ts']), root);
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      const receipt = ticketBytes(root);
      assert.match(receipt, /npm run lint:fix -- src\/value\.ts &&/);
      assert.doesNotMatch(receipt, /npm run lint:fix -- --include-tests/);
      assert.match(receipt, /gennady lint --autofix --include-tests/);
      assert.match(readFileSync(join(root, 'src/value.ts'), 'utf-8'), /VALUE = 1;/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the IB-gates package.json + gates-smoke.mjs shape sends only the applicable file to ESLint', async () => {
    const { root } = buildRepoFixture({
      scripts: scripts(`${ESLINT_BIN} --fix`),
      files: {
        'eslint.config.mjs': eslintConfig(),
        'scripts/gates-smoke.mjs': 'export const smoke = true\n',
      },
    });
    try {
      installRealGennady(root);
      const result = await runCliAsync(
        installTicket(root, ['package.json', 'scripts/gates-smoke.mjs']),
        root
      );
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      const receipt = ticketBytes(root);
      assert.match(receipt, /npm run lint:fix -- scripts\/gates-smoke\.mjs/);
      assert.doesNotMatch(receipt, /npm run lint:fix[^\n]*package\.json/);
      assert.match(receipt, /gennady-contract\(skip: no applicable \.ts\/\.tsx targets\)/);
      assert.match(readFileSync(join(root, 'scripts/gates-smoke.mjs'), 'utf-8'), /true;/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a Gennady project leaf receives its ABI once for supported TS targets', async () => {
    const { root } = buildRepoFixture({
      scripts: scripts('gennady lint --autofix'),
      files: { 'src/value.ts': CLEAN_TS },
    });
    try {
      installRealGennady(root);
      const result = await runCliAsync(installTicket(root, ['src/value.ts']), root);
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      const receipt = ticketBytes(root);
      assert.match(
        receipt,
        /npm run lint:fix -- --include-tests --spec=specs\/app\/app\.spec\.md -- src\/value\.ts/
      );
      assert.doesNotMatch(receipt, /npx --no-install gennady lint/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a Gennady-only non-TS target set is an honest named skip, not unsupported-target failure', async () => {
    const { root } = buildRepoFixture({
      scripts: scripts('gennady lint --autofix'),
      files: { 'scripts/gates-smoke.mjs': 'export const smoke = true\n' },
    });
    try {
      installRealGennady(root);
      const result = await runCliAsync(
        installTicket(root, ['package.json', 'scripts/gates-smoke.mjs']),
        root
      );
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      const receipt = ticketBytes(root);
      assert.match(receipt, /gennady-contract\(skip: no applicable \.ts\/\.tsx targets\)/);
      assert.doesNotMatch(result.stdout + result.stderr, /ERR_CLI_LINT_UNSUPPORTED_TARGET/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('mixed adapters still fail closed when real ESLint setup mutates outside exact targets', async () => {
    const { root } = buildRepoFixture({
      scripts: scripts(`${ESLINT_BIN} --fix`),
      files: {
        'eslint.config.mjs': eslintConfig('src/unrelated.ts'),
        'src/value.ts': CLEAN_TS,
        'src/unrelated.ts': 'before\n',
        'scripts/gates-smoke.mjs': 'export const smoke = true\n',
      },
    });
    try {
      installRealGennady(root);
      const result = await runCliAsync(
        installTicket(root, ['src/value.ts', 'scripts/gates-smoke.mjs', 'package.json']),
        root
      );
      assert.notStrictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /repair mutated paths outside its permitted write-set/);
      assert.match(result.stdout, /src\/unrelated\.ts/);
      assert.match(readFileSync(join(root, 'src/unrelated.ts'), 'utf-8'), /outside mutation/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
