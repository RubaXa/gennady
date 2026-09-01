// @file: Live end-to-end walk of the bootstrap path — the one route that broke in three consecutive
//   review rounds. A from-scratch project sits at `provisional` on stub scripts; the infra ticket
//   that BUILDS the real tooling must be able to run its own impl/test phases (exemption), verify
//   what it can, and hand the project over to `ready`, after which ordinary product tickets run and
//   the exemption is gone. Every step is a real `gennady` invocation against a real fixture repo.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';
import { installCapabilityProviderFixtures } from './capability-provider-fixture.ts';

/** @purpose The stub `package.json` scripts the readiness directive itself prescribes for a from-scratch project. */
const STUB_SCRIPTS: Record<string, string> = {
  'type-check': "echo 'TODO: настроить инфраструктуру (type-check — tsc --noEmit)'",
  test: "echo 'TODO: настроить инфраструктуру (test runner)'",
  'test:coverage': "echo 'TODO: настроить инфраструктуру (coverage)'",
  format: "echo 'TODO: настроить инфраструктуру (formatter, read-only check)'",
  'format:fix': "echo 'TODO: настроить formatter --write (write mode)'",
  lint: 'gennady lint src/',
  'lint:fix': "echo 'TODO: настроить linter --fix (autofix)'",
  fix: 'npm run format:fix && npm run lint:fix',
};

/** @purpose Real file-backed tooling that the receipt can bind, standing in for tsc/vitest/prettier. */
const REAL_SCRIPTS: Record<string, string> = {
  'type-check': 'node scripts/verify-pass.mjs',
  test: 'node scripts/verify-pass.mjs',
  'test:coverage': 'node scripts/verify-coverage.mjs',
  format: 'node scripts/verify-pass.mjs',
  // Carry the write switch as a REAL script arg (`--` ends node's own options), not a `# comment` —
  // the detector now correctly rejects a switch hidden in a comment.
  'format:fix': 'node scripts/verify-pass.mjs -- --write',
  lint: 'gennady lint src/',
  'lint:fix': 'node scripts/verify-pass.mjs -- --fix',
  fix: 'npm run format:fix && npm run lint:fix',
};

/** @purpose draft.55's real failure shape: every gate exists, but lint repair captures the repo root. */
const BROAD_ROOT_SCRIPTS: Record<string, string> = {
  ...REAL_SCRIPTS,
  'lint:fix': 'eslint --fix .',
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
  const infraClaims =
    scope === 'infra-core'
      ? ['- **Readiness Gates:**', ...Object.keys(STUB_SCRIPTS).map((gate) => `  - ${gate}`)]
      : [];
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
    `  - ${scope === 'infra-core' ? 'package.json' : 'src/thing.ts'}`,
    ...(scope === 'infra-core' ? ['  - scripts/gates-smoke.mjs'] : []),
    ...infraClaims,
    '- **Exit:** it exists',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:PHASE_P2-->',
    '### P2 — test',
    '- **Objective:** test it',
    '- **Target Files:**',
    '  - src/thing.test.ts',
    '- **Exit:** tests pass',
    '<!--/SECTION:PHASE_P2-->',
    '<!--SECTION:VERIFICATION-->',
    '## Verification',
    '<!--PHASE_RECEIPTS:v1-->',
    '<!--COVERAGE_POLICY:v1-->',
    '- **Coverage Policy:** not-applicable',
    '- **Coverage Reason:** synthetic readiness-path fixture; production coverage ownership is outside this scenario',
    '| Command | Required by | Role |',
    '|---|---|---|',
    '| — | — | extra |',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
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
      'specs/infra-core/infra-core.spec.md': [
        '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
        '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
        '|---|---|---|---|---|---|',
        `| toolchain | tool | this-scope-task | create | ${Object.keys(STUB_SCRIPTS).join(', ')} | package.json, scripts/gates-smoke.mjs |`,
        '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
      ].join('\n'),
      'specs/app/app.spec.md': '# App\n',
      // IN_PROGRESS on purpose: the orchestrator opens the Round before the first phase dispatch,
      // so this — not TODO — is the state the gate actually meets.
      'specs/infra-core/infra-core.task.INFRA-1.md': ticket(
        'INFRA-1',
        'infra-core',
        '[~] IN_PROGRESS'
      ),
      'specs/app/app.task.APP-1.md': ticket('APP-1', 'app', '[ ] TODO'),
      'src/thing.ts': '// @file: Thing.\n// @consumers: N/A\n// @tasks: N/A\n',
      'src/thing.test.ts': '// verifies the synthetic bootstrap target\n',
      'scripts/verify-pass.mjs': 'process.exit(0);\n',
      'scripts/gates-smoke.mjs': 'process.exit(0);\n',
      'scripts/verify-coverage.mjs': [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "mkdirSync('coverage', { recursive: true });",
        "writeFileSync('coverage/coverage-final.json', '{}');",
        'process.exit(0);',
        '',
      ].join('\n'),
    },
  });
  const binDir = join(root, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  const prettier = join(binDir, 'prettier');
  writeFileSync(prettier, '#!/usr/bin/env node\nprocess.exit(0)\n', 'utf-8');
  chmodSync(prettier, 0o755);
  return root;
}

describe('bootstrap path — from stub scripts to a verified product phase', () => {
  it('draft.55 broad-root lint repair maps the exact lint:fix gate to its sole infra owner across state, map, and verify', () => {
    const root = bootstrapFixture(BROAD_ROOT_SCRIPTS);
    try {
      const state = runCli(['sdd-state'], root);
      assert.strictEqual(state.exitCode, 0, state.stdout + state.stderr);
      assert.match(state.stdout, /EXECUTION_READY=no/);
      assert.match(state.stdout, /GATE_QUEUE=INFRA-1/);

      const map = runCli(['sdd-task'], root);
      assert.strictEqual(map.exitCode, 0, map.stdout + map.stderr);
      assert.match(map.stdout, /pickable \(ready now\):\s+INFRA-1/m);
      assert.doesNotMatch(map.stdout, /^  APP-1 →/m);
      assert.match(map.stdout, /blocked: APP-1 ← EXECUTION_READY=no/);
      assert.match(map.stdout, /GATE_QUEUE=INFRA-1/);

      const unrelated = runCli(
        ['sdd-verify', '--task', 'specs/app/app.task.APP-1.md', '--phase', 'P1'],
        root
      );
      assert.notStrictEqual(unrelated.exitCode, 0, unrelated.stdout + unrelated.stderr);
      assert.match(
        unrelated.stdout + unrelated.stderr,
        /does not structurally own a missing readiness gate/
      );

      const ownerDispatch = runCli(
        ['sdd-task', 'specs/infra-core/infra-core.task.INFRA-1.md', '--phase', 'P1'],
        root
      );
      assert.strictEqual(ownerDispatch.exitCode, 0, ownerDispatch.stdout + ownerDispatch.stderr);
      assert.match(ownerDispatch.stdout, /INFRA_QUEUE_EXEMPTION/);

      // Verify consumes the same accepted owner (so it gets past phase-context), then the receipt
      // layer independently rejects the broad `.` input. The builder must repair that script first.
      const ownerVerify = runCli(
        ['sdd-verify', '--task', 'specs/infra-core/infra-core.task.INFRA-1.md', '--phase', 'P1'],
        root
      );
      assert.notStrictEqual(ownerVerify.exitCode, 0, ownerVerify.stdout + ownerVerify.stderr);
      assert.doesNotMatch(
        ownerVerify.stdout + ownerVerify.stderr,
        /does not structurally own a missing readiness gate/
      );
      assert.match(
        ownerVerify.stdout + ownerVerify.stderr,
        /SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED: fix COMMAND_MISSING/
      );
      assert.doesNotMatch(ownerVerify.stdout + ownerVerify.stderr, /receipt recorded:/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a setup phase records a receipt only after its exact declared repair ownership is proven', () => {
    const root = bootstrapFixture(REAL_SCRIPTS);
    try {
      const ticketPath = join(root, 'specs/infra-core/infra-core.task.INFRA-1.md');
      writeFileSync(
        ticketPath,
        readFileSync(ticketPath, 'utf-8')
          .replace('| P1 | impl | — | [ ] |', '| P1 | config | — | [ ] |')
          .replace('### P1 — impl', '### P1 — config')
          .replace(
            /- \*\*Readiness Gates:\*\*\n(?:  - .*\n)+/,
            '- **Readiness Gates:**\n  - lint:fix\n'
          ),
        'utf-8'
      );
      const verified = runCli(
        ['sdd-verify', '--task', 'specs/infra-core/infra-core.task.INFRA-1.md', '--phase', 'P1'],
        root
      );
      assert.strictEqual(verified.exitCode, 0, verified.stdout + verified.stderr);
      assert.match(verified.stdout, /gate-state: fix PROVEN/);
      assert.match(verified.stdout, /receipt recorded:/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('real CLI map fails closed for ambiguous, DONE, artifact-mismatched, and unclaimed gate owners', () => {
    const variants: Array<{
      name: string;
      mutate(root: string): void;
      diagnostic: RegExp;
    }> = [
      {
        name: 'ambiguous',
        mutate(root) {
          writeFileSync(
            join(root, 'specs/infra-core/infra-core.task.INFRA-2.md'),
            ticket('INFRA-2', 'infra-core', '[ ] TODO'),
            'utf-8'
          );
        },
        diagnostic: /multiple phase owners.*INFRA-1\/P1.*INFRA-2\/P1/,
      },
      {
        name: 'done',
        mutate(root) {
          writeFileSync(
            join(root, 'specs/infra-core/infra-core.task.INFRA-1.md'),
            ticket('INFRA-1', 'infra-core', '[x] DONE'),
            'utf-8'
          );
        },
        diagnostic: /missing gate 'lint:fix' has no exact active ticket phase owner/,
      },
      {
        name: 'artifact mismatch',
        mutate(root) {
          const path = join(root, 'specs/infra-core/infra-core.task.INFRA-1.md');
          writeFileSync(
            path,
            readFileSync(path, 'utf-8').replace('  - scripts/gates-smoke.mjs\n', ''),
            'utf-8'
          );
        },
        diagnostic: /claim and Target Files match Bootstrap Requirements/,
      },
      {
        name: 'unclaimed',
        mutate(root) {
          const path = join(root, 'specs/infra-core/infra-core.task.INFRA-1.md');
          writeFileSync(path, readFileSync(path, 'utf-8').replace('  - lint:fix\n', ''), 'utf-8');
        },
        diagnostic: /missing gate 'lint:fix' has no exact active ticket phase owner/,
      },
    ];

    for (const variant of variants) {
      const root = bootstrapFixture(BROAD_ROOT_SCRIPTS);
      try {
        variant.mutate(root);
        const map = runCli(['sdd-task'], root);
        assert.strictEqual(map.exitCode, 0, `${variant.name}: ${map.stdout}${map.stderr}`);
        assert.match(map.stdout, /pickable \(ready now\): — none/);
        assert.match(map.stdout, /GATE_QUEUE=none/);
        assert.match(map.stdout, variant.diagnostic);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

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
      assert.match(r.stdout, /--task <ticket-path> --phase <PhaseID>/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('an unrelated test phase of the same infra ticket does not inherit the setup exemption', () => {
    const root = bootstrapFixture(STUB_SCRIPTS);
    try {
      const r = runCli(
        ['sdd-verify', '--task', 'specs/infra-core/infra-core.task.INFRA-1.md', '--phase', 'P2'],
        root
      );
      assert.notStrictEqual(r.exitCode, 0);
      assert.match(r.stdout + r.stderr, /does not structurally own a missing readiness gate/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the exempted owner cannot record a receipt while its declared gates are still stubs', () => {
    const root = bootstrapFixture(STUB_SCRIPTS);
    try {
      const r = runCli(
        ['sdd-verify', '--task', 'specs/infra-core/infra-core.task.INFRA-1.md', '--phase', 'P1'],
        root
      );
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(
        r.stdout + r.stderr,
        /SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED: fix COMMAND_MISSING/
      );
      assert.doesNotMatch(r.stdout + r.stderr, /receipt recorded:/);
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

  it('sdd-verify fails closed when provisional readiness cannot load the portal', () => {
    const root = bootstrapFixture(STUB_SCRIPTS);
    try {
      rmSync(join(root, 'specs', 'README.md'));
      const r = runCli(
        ['sdd-verify', '--task', 'specs/app/app.task.APP-1.md', '--phase', 'P1'],
        root
      );
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout + r.stderr, /portal\/GATE_QUEUE cannot be resolved/);
      assert.match(r.stdout + r.stderr, /ENOENT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('sdd-verify fails closed when provisional readiness has no exact queue owner for the phase', () => {
    const root = bootstrapFixture(STUB_SCRIPTS);
    try {
      const r = runCli(
        ['sdd-verify', '--task', 'specs/app/app.task.APP-1.md', '--phase', 'P1'],
        root
      );
      assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout + r.stderr, /does not structurally own a missing readiness gate/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('once the infra ticket has replaced the stubs, the project is ready, the queue is empty, and the product phase runs', () => {
    const root = bootstrapFixture(REAL_SCRIPTS);
    try {
      installCapabilityProviderFixtures(root, 'specs/app/app.task.APP-1.md');
      const state = runCli(['sdd-state'], root);
      assert.match(state.stdout, /READINESS=ready/);
      assert.match(state.stdout, /GATE_QUEUE=none/);

      const product = runCli(['sdd-task', 'specs/app/app.task.APP-1.md', '--phase', 'P1'], root);
      assert.strictEqual(product.exitCode, 0, product.stdout + product.stderr);
      assert.doesNotMatch(product.stdout, /INFRA_QUEUE_EXEMPTION/);

      // And the real ladder now actually verifies, instead of skipping or ⛔-ing.
      const verify = runCli(
        ['sdd-verify', '--task', 'specs/app/app.task.APP-1.md', '--phase', 'P1'],
        root
      );
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
