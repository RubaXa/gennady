// @file: Live-CLI behavior of the task/phase-only sdd-verify facade after UV-14.
// @spec: CLI-SDD-VERIFY
// @consumers: CI

import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { installCapabilityProviderFixtures } from './capability-provider-fixture.ts';
import { buildRepoFixture } from './fixture.ts';
import { cleanTestChildEnv, runCliAsync } from './run-cli.ts';

function installExecutable(root: string, name: string): void {
  const binDirectory = join(root, 'node_modules', '.bin');
  mkdirSync(binDirectory, { recursive: true });
  const executable = join(binDirectory, name);
  writeFileSync(executable, '#!/usr/bin/env node\nprocess.exit(0);\n', 'utf8');
  chmodSync(executable, 0o755);
}

function installFacadeTicket(root: string): void {
  const ticketDirectory = join(root, 'specs', 'app');
  mkdirSync(ticketDirectory, { recursive: true });
  writeFileSync(join(ticketDirectory, 'app.spec.md'), '# App\n', 'utf8');
  writeFileSync(
    join(ticketDirectory, 'app.task.TSK-1.md'),
    [
      '<!--SECTION:META-->',
      '- **Task-ID:** TSK-1',
      '- **Status:** [ ] TODO',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | impl | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Target Files:**',
      '  - src.ts',
      '- **Deleted Files:**',
      '  - none',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:VERIFICATION-->',
      '| Command | Required by | Role |',
      '|---|---|---|',
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '## Execution Log',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n'),
    'utf8'
  );
  installCapabilityProviderFixtures(root, 'specs/app/app.task.TSK-1.md');
}

describe('sdd-verify thin facade', () => {
  it('keeps root c8 ownership local when cleaning the child environment', () => {
    const source = {
      NODE_V8_COVERAGE: '/tmp/root-c8-owner',
      NODE_TEST_CONTEXT: 'child-v8',
      GIT_DIR: '/tmp/real-repo/.git',
      PATH: '/usr/bin',
    };
    const child = cleanTestChildEnv(source);
    assert.strictEqual(child.NODE_V8_COVERAGE, '');
    assert.strictEqual(child.NODE_TEST_CONTEXT, undefined);
    assert.strictEqual(child.GIT_DIR, undefined);
    assert.strictEqual(child.PATH, '/usr/bin');
    assert.strictEqual(source.NODE_V8_COVERAGE, '/tmp/root-c8-owner');
  });

  it('rejects old public profile flags and invalid task identity through the real CLI', async () => {
    const { root } = buildRepoFixture({ scripts: {} });
    try {
      const removed = await runCliAsync(['sdd-verify', '--profile', 'full'], root);
      assert.strictEqual(removed.exitCode, 4, removed.stdout + removed.stderr);
      assert.match(removed.stderr, /ERR_CLI_SDD_VERIFY_BAD_INVOCATION/);
      const missing = await runCliAsync(
        ['sdd-verify', '--task', 'missing.task.md', '--phase', 'P1'],
        root
      );
      assert.strictEqual(missing.exitCode, 1, missing.stdout + missing.stderr);
      assert.match(missing.stderr, /ERR_CLI_SDD_VERIFY_PHASE_CONTEXT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('routes task/phase through the universal engine and persists facade evidence', async () => {
    const { root } = buildRepoFixture({
      embeddedRules: true,
      scripts: {
        'type-check': 'node scripts/pass.mjs',
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        lint: 'gennady lint src.ts',
        format: 'node scripts/pass.mjs',
      },
      files: {
        'src.ts': 'export const value = 1;\n',
        'scripts/pass.mjs': 'process.exit(0);\n',
      },
    });
    try {
      installExecutable(root, 'prettier');
      installExecutable(root, 'gennady');
      installFacadeTicket(root);
      const result = await runCliAsync(
        ['sdd-verify', '--task', 'specs/app/app.task.TSK-1.md', '--phase', 'P1'],
        root
      );
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      const ticket = readFileSync(join(root, 'specs/app/app.task.TSK-1.md'), 'utf8');
      assert.match(ticket, /SDD_VERIFY_EVIDENCE:/);
      assert.match(ticket, /\*\*PASS\*\*/);
      assert.doesNotMatch(ticket, /SDD_PHASE_RECEIPT:P1/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
