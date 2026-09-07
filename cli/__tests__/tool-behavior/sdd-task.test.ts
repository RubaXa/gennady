// @file: Live-CLI behavior of sdd-task's gate-queue and fail-closed phase-dispatch evidence.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

const PORTAL_WITH_INFRA_SCOPE = [
  '# Demo Project',
  '',
  '## Scopes',
  '',
  '| Scope | Type | Status | Description |',
  '|---|---|---|---|',
  '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | bootstrap tooling |',
  '',
].join('\n');

/** @purpose A TODO ticket whose scope is deliberately NOT infra-core — infra-core stays unreferenced by any ticket. */
const UNRELATED_TICKET = [
  '# Task: app-1 — Unrelated',
  '<!--SECTION:META-->',
  '## 1. Meta',
  '- **Task-ID:** app-1',
  '- **Status:** [ ] TODO',
  '- **Scope:** app',
  '- **Dependencies:** None',
  '<!--/SECTION:META-->',
  '<!--SECTION:EXECUTION_LOG-->',
  '<!--/SECTION:EXECUTION_LOG-->',
].join('\n');

const EXECUTION_SCRIPTS = {
  'type-check': 'tsc --noEmit',
  test: 'node --test',
  'test:coverage': 'c8 node --test',
  format: 'prettier --check .',
  'format:fix': 'prettier --write',
  lint: 'gennady lint src/',
  'lint:fix': 'eslint --fix',
  fix: 'npm run format:fix -- . && npm run lint:fix -- src/',
};

function phaseTicket(target = 'src/current.ts', handoff = 'src/current.ts'): string {
  return [
    '# Task: APP-1 — Phase evidence',
    '<!--SECTION:META-->',
    '- **Task-ID:** APP-1',
    '- **Status:** [~] IN_PROGRESS',
    '- **Scope:** app',
    '- **Dependencies:** None',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    '| P1 | impl | — | [x] |',
    '| P2 | test | P1 | [ ] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '- **Objective:** implement',
    '- **Rules:**',
    '  - none',
    '- **Target Files:**',
    `  - ${target}`,
    '- **Deleted Files:**',
    '  - none',
    '- **Exit:** implemented',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:PHASE_P2-->',
    '- **Objective:** test',
    '- **Rules:**',
    '  - none',
    '- **Target Files:**',
    '  - src/current.test.ts',
    '- **Deleted Files:**',
    '  - none',
    '- **Exit:** tested',
    '<!--/SECTION:PHASE_P2-->',
    '<!--SECTION:VERIFICATION-->',
    '| Command | Required by | Role |',
    '|---|---|---|',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '#### P1',
    '- [x] DONE',
    `**Handoff →** artifacts: [${handoff}]; decisions: [none]; open: [none]`,
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

describe('sdd-task — live gate-queue diagnostic', () => {
  it('approved infra scope with zero referencing tickets → GATE_QUEUE_DIAG names it, not silence', () => {
    const { root } = buildRepoFixture({
      noPackageJson: true, // not-ready by construction — no package.json at all.
      files: {
        'specs/README.md': PORTAL_WITH_INFRA_SCOPE,
        'ticket.md': UNRELATED_TICKET,
      },
      git: false, // sdd-task's gate-queue path has no git-scoped tool in play here.
    });
    try {
      const r = runCli(['sdd-task'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /GATE_QUEUE=none/);
      assert.match(
        r.stdout,
        /GATE_QUEUE_DIAG: infra-спека `infra-core` одобрена, тикетов пока нет — нарежь scaffold'ом/
      );
      assert.match(r.stdout, /next: bootstrap-тикетов ещё нет — запусти `\/sdd-scaffold`/);
      assert.doesNotMatch(r.stdout, /разблокируй одну из blocked/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ordinary repo-local phase still emits its READ surface and next instruction', () => {
    const { root } = buildRepoFixture({
      scripts: EXECUTION_SCRIPTS,
      gennadyInstalled: true,
      files: {
        'src/current.ts': 'export const current = 1;\n',
        'src/current.test.ts': 'export const currentTest = 1;\n',
        'ticket.md': phaseTicket(),
      },
    });
    try {
      const result = runCli(['sdd-task', 'ticket.md', '--phase', 'P1'], root);
      assert.strictEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /READ files:\s+src\/current\.ts/);
      assert.match(result.stdout, /worker contract \(copy verbatim into dispatch\):/);
      assert.match(
        result.stdout,
        /next: исполняй переданный worker contract без сокращений, запусти точный sdd-verify/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('scaffold-shaped create target dispatches before creation, then verify fails closed until the file exists', () => {
    const ticket = [
      '# Task: APP-create — Create one source file',
      '<!--SECTION:META-->',
      '- **Task-ID:** APP-create',
      '- **Status:** [ ] TODO',
      '- **Scope:** app',
      '- **Dependencies:** None',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | config | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Objective:** create the new source beside an existing input',
      '- **Rules:**',
      '  - none',
      '- **Target Files:**',
      '  - src/existing.ts',
      '  - src/new.ts',
      '- **Deleted Files:**',
      '  - none',
      '- **Inputs:** none',
      '- **Exit:** both files exist',
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
    ].join('\n');
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/existing.ts': 'export const existing = true;\n',
        'specs/app/app.spec.md': '# App\n',
        'specs/app/app.task.APP-create.md': ticket,
      },
    });
    try {
      const taskArgs = ['sdd-task', 'specs/app/app.task.APP-create.md', '--phase', 'P1'];
      const dispatched = runCli(taskArgs, root);
      assert.strictEqual(dispatched.exitCode, 0, dispatched.stdout + dispatched.stderr);
      assert.match(dispatched.stdout, /READ files:\s+src\/existing\.ts/);
      assert.match(dispatched.stdout, /CREATE files:\s+src\/new\.ts/);
      assert.doesNotMatch(dispatched.stdout, /READ files:[^\n]*src\/new\.ts/);

      const verifyArgs = [
        'sdd-verify',
        '--task',
        'specs/app/app.task.APP-create.md',
        '--phase',
        'P1',
      ];
      const missing = runCli(verifyArgs, root);
      assert.notStrictEqual(missing.exitCode, 0, missing.stdout + missing.stderr);
      assert.match(missing.stderr, /Target File path is missing: src\/new\.ts/);

      writeFileSync(join(root, 'src', 'new.ts'), 'export const created = true;\n', 'utf-8');
      const verified = runCli(verifyArgs, root);
      assert.strictEqual(verified.exitCode, 0, verified.stdout + verified.stderr);
      assert.match(verified.stdout, /ALL PASS/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('outside and symlink Target/Handoff paths fail before READ or next', () => {
    const cases: Array<{
      name: string;
      target?: string;
      handoff?: string;
      symlink?: [string, string];
      phase: 'P1' | 'P2';
    }> = [
      { name: 'outside Target', target: '../../outside.md', phase: 'P1' },
      {
        name: 'symlink Target',
        target: 'src/target-alias.ts',
        symlink: ['src/current.ts', 'src/target-alias.ts'],
        phase: 'P1',
      },
      { name: 'outside Handoff', handoff: '../../outside.md', phase: 'P2' },
      {
        name: 'symlink Handoff',
        handoff: 'src/handoff-alias.ts',
        symlink: ['src/current.ts', 'src/handoff-alias.ts'],
        phase: 'P2',
      },
    ];
    for (const testCase of cases) {
      const { root } = buildRepoFixture({
        scripts: EXECUTION_SCRIPTS,
        gennadyInstalled: true,
        files: {
          'src/current.ts': 'export const current = 1;\n',
          'src/current.test.ts': 'export const currentTest = 1;\n',
          'ticket.md': phaseTicket(testCase.target, testCase.handoff),
        },
      });
      try {
        if (testCase.symlink) {
          symlinkSync(join(root, testCase.symlink[0]), join(root, testCase.symlink[1]));
        }
        const result = runCli(['sdd-task', 'ticket.md', '--phase', testCase.phase], root);
        const output = `${result.stdout}${result.stderr}`;
        assert.strictEqual(result.exitCode, 1, `${testCase.name}: ${output}`);
        assert.match(output, /ERR_CLI_SDD_TASK_PHASE_EVIDENCE/, testCase.name);
        assert.match(output, /Target File|Handoff artifact/, testCase.name);
        assert.doesNotMatch(output, /READ |next:/, testCase.name);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('create-target dispatch still rejects glob, root, traversal, directory, and symlink-ancestor paths', () => {
    const { root } = buildRepoFixture({
      scripts: EXECUTION_SCRIPTS,
      gennadyInstalled: true,
      files: {
        'src/current.ts': 'export const current = 1;\n',
        'src/real/keep.ts': 'export const keep = 1;\n',
      },
    });
    try {
      symlinkSync(join(root, 'src', 'real'), join(root, 'src', 'alias'));
      const cases = [
        ['glob', 'src/*.ts'],
        ['repo root', '.'],
        ['traversal', '../outside.ts'],
        ['existing directory', 'src'],
        ['symlink ancestor', 'src/alias/future.ts'],
      ] as const;
      for (const [name, target] of cases) {
        writeFileSync(join(root, 'ticket.md'), phaseTicket(target), 'utf-8');
        const result = runCli(['sdd-task', 'ticket.md', '--phase', 'P1'], root);
        const output = `${result.stdout}${result.stderr}`;
        assert.strictEqual(result.exitCode, 1, `${name}: ${output}`);
        assert.match(output, /ERR_CLI_SDD_TASK_PHASE_EVIDENCE/, name);
        assert.doesNotMatch(output, /READ |CREATE |next:/, name);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
