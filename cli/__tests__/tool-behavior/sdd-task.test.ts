// @file: Live-CLI behavior of sdd-task's gate-queue and fail-closed phase-dispatch evidence.
// @spec: CLI
// @consumers: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildRepoFixture } from './fixture.ts';
import { cleanTestChildEnv, runCli } from './run-cli.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

function shellLiteral(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function installActualGennadyBin(root: string): void {
  const bin = join(root, 'node_modules', '.bin', 'gennady');
  const loader = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
  const entry = join(REPO_ROOT, 'cli', 'gennady.ts');
  writeFileSync(
    bin,
    `#!/bin/sh\nexec ${shellLiteral(process.execPath)} --import ${shellLiteral(loader)} ${shellLiteral(entry)} "$@"\n`,
    'utf-8'
  );
  chmodSync(bin, 0o755);
}

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
        /next: исполняй переданный worker contract без сокращений, запусти ровно unified Verify command above/
      );
      assert.match(result.stdout, /npx gennady sdd-verify --task=ticket\.md --phase=P1/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('executes the exact quoted custom-selector command with ticket scope and fails closed when context disappears', () => {
    const ticketPath = 'specs/app space;safe/app.task.APP-1.md';
    const ticket = [
      '# Task: APP-1 — Custom selector execution',
      '<!--SECTION:META-->',
      '- **Task-ID:** APP-1',
      '- **Status:** [ ] TODO',
      '- **Scope:** app',
      '- **Dependencies:** None',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | ReleaseCandidate | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Objective:** prove the custom selector',
      '- **Rules:**',
      '  - none',
      '- **Target Files:**',
      '  - src/current.ts',
      '- **Deleted Files:**',
      '  - none',
      '- **Inputs:** none',
      '- **Exit:** custom proof passes',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:VERIFICATION-->',
      '| Command | Required by | Role |',
      '|---|---|---|',
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    const config = [
      'verify:',
      '  sdd:',
      '    mapping:',
      '      ReleaseCandidate: release-check',
      '  presets:',
      '    node:',
      '      phases:',
      '        release-check: { include: [release] }',
      '      steps:',
      '        release-proof:',
      '          tags: [release]',
      '          needs: []',
      '          executor: local',
      '          effect: observe',
      '          command:',
      '            argv: [node, verify-custom.mjs]',
      '            cwd: .',
      '          timeout: 10s',
      '          onFailure: stop-phase',
      '',
    ].join('\n');
    const { root } = buildRepoFixture({
      scripts: {},
      gennadyInstalled: true,
      files: {
        [ticketPath]: ticket,
        'specs/app space;safe/app.spec.md': '# App\n',
        'src/current.ts': 'export const current = true;\n',
        'verify-custom.mjs': 'process.exit(0);\n',
        'gennady.yaml': config,
      },
    });
    try {
      installActualGennadyBin(root);
      const dispatched = runCli(['sdd-task', ticketPath, '--phase', 'P1'], root);
      assert.strictEqual(dispatched.exitCode, 0, dispatched.stdout + dispatched.stderr);
      const command = /command:\s+([^\n]+)/.exec(dispatched.stdout)?.[1]?.trim();
      assert.ok(command);
      assert.match(command, /'--task=specs\/app space;safe\/app\.task\.APP-1\.md'/);
      assert.match(command, /sdd-verify/);
      assert.match(command, /--phase=P1/);

      const executed = spawnSync(command, {
        cwd: root,
        encoding: 'utf-8',
        env: cleanTestChildEnv(process.env),
        shell: '/bin/sh',
        timeout: 30_000,
      });
      assert.strictEqual(executed.status, 0, `${executed.stdout ?? ''}${executed.stderr ?? ''}`);
      assert.match(executed.stdout ?? '', /VERIFY phase=release-check/);
      assert.match(executed.stdout ?? '', /scope=files files=src\/current\.ts/);
      assert.match(executed.stdout ?? '', /sdd=specs\/app space;safe\/app\.task\.APP-1\.md#P1/);
      assert.match(executed.stdout ?? '', /PASS node:release-proof/);
      assert.match(executed.stdout ?? '', /VERDICT PASS/);

      writeFileSync(join(root, 'verify-custom.mjs'), 'process.exit(23);\n', 'utf-8');
      rmSync(join(root, 'src', 'current.ts'));
      const missing = spawnSync(command, {
        cwd: root,
        encoding: 'utf-8',
        env: cleanTestChildEnv(process.env),
        shell: '/bin/sh',
        timeout: 30_000,
      });
      assert.notStrictEqual(missing.status, 0, `${missing.stdout ?? ''}${missing.stderr ?? ''}`);
      assert.match(missing.stderr ?? '', /ERR_CLI_SDD_VERIFY_PHASE_CONTEXT/);
      assert.match(missing.stderr ?? '', /Target File path is missing|path is missing/);
      assert.doesNotMatch(missing.stdout ?? '', /PASS node:release-proof|VERDICT PASS/);
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
