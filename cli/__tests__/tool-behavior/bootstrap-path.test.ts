// @file: Live end-to-end walk of the bootstrap path — the one route that broke in three consecutive
//   review rounds. A from-scratch project sits at `provisional` on stub scripts; the infra ticket
//   that BUILDS the real tooling must be able to run its own impl/test phases (exemption), verify
//   what it can, and hand the project over to `ready`, after which ordinary product tickets run and
//   the exemption is gone. Every step is a real `gennady` invocation against a real fixture repo.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepoFixture, coverageScript, noop } from './fixture.ts';
import { runCli } from './run-cli.ts';

/** @purpose The stub `package.json` scripts the readiness directive itself prescribes for a from-scratch project. */
const STUB_SCRIPTS: Record<string, string> = {
  'type-check': "echo 'TODO: настроить инфраструктуру (type-check — tsc --noEmit)' >&2",
  test: "echo 'TODO: настроить инфраструктуру (test runner)' >&2",
  'test:coverage': "echo 'TODO: настроить инфраструктуру (coverage)' >&2",
  format: "echo 'TODO: настроить инфраструктуру (formatter, read-only check)' >&2",
  'format:fix': "echo 'TODO: настроить formatter --write (write mode)' >&2",
  lint: 'gennady lint src/',
  'lint:fix': "echo 'TODO: настроить linter --fix (autofix)' >&2",
};

/** @purpose Real tooling — no-ops that genuinely run and report, standing in for tsc/vitest/prettier. */
const REAL_SCRIPTS: Record<string, string> = {
  'type-check': noop(0),
  test: noop(0),
  'test:coverage': coverageScript(0),
  format: noop(0),
  'format:fix': `${noop(0)} # --write`,
  lint: 'gennady lint src/',
  'lint:fix': `${noop(0)} # --fix`,
};

const PORTAL = [
  '# Demo Project',
  '',
  '## Scopes',
  '',
  '| Scope | Type | Status | Description |',
  '|---|---|---|---|',
  '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | bootstrap tooling |',
  '| [`app`](./app/app.spec.md) | product | ✅ | the product itself |',
  '',
].join('\n');

/**
 * @purpose Build a ticket with an `impl` + `test` phase pair — the shape scaffold always produces
 *   (impl and test never share a phase), and therefore the shape that must survive the gate.
 * @param taskId Meta Task-ID. | @param scope Meta Scope. | @param status Meta Status line value.
 * @returns Full ticket markdown.
 */
function ticket(taskId: string, scope: string, status: string): string {
  return [
    `# Task: ${taskId}`,
    '<!--SECTION:META-->',
    '## 1. Meta',
    `- **Task-ID:** ${taskId}`,
    `- **Status:** ${status}`,
    '- **Purpose:** build the thing',
    `- **Scope:** ${scope}`,
    '- **Dependencies:** None',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|----|------|------|--------|',
    '| P1 | impl | — | [ ] |',
    '| P2 | test | P1 | [ ] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '### P1 — impl',
    '- **Objective:** build it',
    '- **Target Files:**',
    '  - src/thing.ts',
    '- **Exit:** it exists',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:PHASE_P2-->',
    '### P2 — test',
    '- **Objective:** test it',
    '- **Target Files:**',
    '  - src/thing.test.ts',
    '- **Exit:** tests pass',
    '<!--/SECTION:PHASE_P2-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

/** @purpose Fixture with a portal, an in-progress infra ticket, and a TODO product ticket. | @param scripts The package.json scripts to install. | @returns The fixture root. */
function bootstrapFixture(scripts: Record<string, string>): string {
  const { root } = buildRepoFixture({
    scripts,
    gennadyInstalled: true,
    directives: true,
    files: {
      'specs/README.md': PORTAL,
      // IN_PROGRESS on purpose: the orchestrator opens the Round before the first phase dispatch,
      // so this — not TODO — is the state the gate actually meets.
      'specs/infra-core/infra-core.task.INFRA-1.md': ticket(
        'INFRA-1',
        'infra-core',
        '[~] IN_PROGRESS'
      ),
      'specs/app/app.task.APP-1.md': ticket('APP-1', 'app', '[ ] TODO'),
      'src/thing.ts': '// @file: Thing.\n// @consumers: N/A\n// @tasks: N/A\n',
    },
  });
  return root;
}

describe('bootstrap path — from stub scripts to a verified product phase', () => {
  it("a from-scratch project on the directive's own stub scripts reads as provisional, not ready and not broken", () => {
    const root = bootstrapFixture(STUB_SCRIPTS);
    try {
      const r = runCli(['sdd-state'], root);
      assert.match(r.stdout, /READINESS=provisional/);
      assert.match(r.stdout, /stubs: /);
      // The queue names the ticket that will replace those stubs — the operator's next move.
      assert.match(r.stdout, /GATE_QUEUE=INFRA-1/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the infra ticket's OWN impl phase runs while its Round is open — the exemption survives IN_PROGRESS", () => {
    const root = bootstrapFixture(STUB_SCRIPTS);
    try {
      const r = runCli(
        ['sdd-task', 'specs/infra-core/infra-core.task.INFRA-1.md', '--phase', 'P1'],
        root
      );
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /INFRA_QUEUE_EXEMPTION/);
      // It must also say HOW to verify — a code profile would ⛔ on the very scripts it builds.
      assert.match(r.stdout, /--profile setup/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the exempted phase can actually verify: --profile setup is green on the stub project', () => {
    const root = bootstrapFixture(STUB_SCRIPTS);
    try {
      const r = runCli(['sdd-verify', '--profile', 'setup'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /ALL PASS/);
      // …and it is honest about what that green means.
      assert.match(r.stdout, /вердикт уровня bootstrap/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a PRODUCT ticket is still refused on the same project — the exemption is not a general bypass', () => {
    const root = bootstrapFixture(STUB_SCRIPTS);
    try {
      const r = runCli(['sdd-task', 'specs/app/app.task.APP-1.md', '--phase', 'P1'], root);
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout + r.stderr, /ERR_CLI_SDD_TASK_INFRA_NOT_READY/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('once the infra ticket has replaced the stubs, the project is ready, the queue is empty, and the product phase runs', () => {
    const root = bootstrapFixture(REAL_SCRIPTS);
    try {
      const state = runCli(['sdd-state'], root);
      assert.match(state.stdout, /READINESS=ready/);
      assert.match(state.stdout, /GATE_QUEUE=none/);

      const product = runCli(['sdd-task', 'specs/app/app.task.APP-1.md', '--phase', 'P1'], root);
      assert.strictEqual(product.exitCode, 0, product.stdout + product.stderr);
      assert.doesNotMatch(product.stdout, /INFRA_QUEUE_EXEMPTION/);

      // And the real ladder now actually verifies, instead of skipping or ⛔-ing.
      const verify = runCli(['sdd-verify', '--profile', 'code'], root);
      assert.strictEqual(verify.exitCode, 0, verify.stdout + verify.stderr);
      assert.match(verify.stdout, /✅ type-check/);
      assert.match(verify.stdout, /✅ test\b/);
      assert.doesNotMatch(verify.stdout, /вердикт уровня bootstrap/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the infra ticket loses its exemption once DONE — a finished builder is an ordinary ticket', () => {
    const root = bootstrapFixture(STUB_SCRIPTS);
    try {
      writeFileSync(
        join(root, 'specs', 'infra-core', 'infra-core.task.INFRA-1.md'),
        ticket('INFRA-1', 'infra-core', '[x] DONE'),
        'utf-8'
      );
      const r = runCli(
        ['sdd-task', 'specs/infra-core/infra-core.task.INFRA-1.md', '--phase', 'P1'],
        root
      );
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout + r.stderr, /ERR_CLI_SDD_TASK_INFRA_NOT_READY/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
