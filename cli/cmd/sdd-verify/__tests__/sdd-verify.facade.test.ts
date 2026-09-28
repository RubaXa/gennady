// @file: Thin SDD facade RuleSnapshot passthrough integration tests.
// @consumers: CI
// @spec: CLI-SDD-VERIFY

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { BUILTIN_RULE_SOURCES } from '../../../../shared/rules/builtin-rule-sources.ts';
import { resolveSddRuleSnapshot } from '../../../../shared/rules/sdd-rule-snapshot.ts';
import { runSddVerifyFacade } from '../sdd-verify.facade.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-C', root, '-c', 'user.email=rules@test', '-c', 'user.name=rules', ...args],
    { encoding: 'utf8' }
  ).trim();
}

function attempts(ticket: string): readonly Record<string, unknown>[] {
  return [...ticket.matchAll(/<!--SDD_VERIFY_EVIDENCE:([A-Za-z0-9_-]+)-->/g)].map((match) =>
    JSON.parse(Buffer.from(match[1]!, 'base64url').toString('utf8'))
  );
}

function rewriteFirstAttempt(
  ticket: string,
  mutate: (value: Record<string, unknown>) => void
): string {
  return ticket
    .replace(/<!--SDD_VERIFY_EVIDENCE:([A-Za-z0-9_-]+)-->/, (_whole, encoded: string) => {
      const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      mutate(value);
      return `<!--SDD_VERIFY_EVIDENCE:${Buffer.from(JSON.stringify(value)).toString('base64url')}-->`;
    })
    .replace(
      /\*\*(PASS|FAIL|BLOCKED|ENV_FAIL|TIMEOUT|VIOLATION|CANCELLED|INTERRUPTED)\*\*/,
      '**RUNNING**'
    );
}

function fixture(ruleSource = 'ai/directives/coding/typescript-rules.xml'): {
  readonly root: string;
  readonly ticket: string;
  readonly cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'sdd-rule-facade-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'specs', 'app'), { recursive: true });
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(root, 'node_modules'));
  writeFileSync(join(root, '.gitignore'), 'node_modules\n');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'sdd-rules-fixture', private: true, scripts: {} })
  );
  writeFileSync(join(root, 'src', 'app.ts'), 'export const app = true;\n');
  for (const source of BUILTIN_RULE_SOURCES) {
    mkdirSync(dirname(join(root, source)), { recursive: true });
    writeFileSync(join(root, source), readFileSync(join(REPO_ROOT, source), 'utf8'));
  }
  writeFileSync(
    join(root, 'gennady.yaml'),
    [
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
      '            argv: [node, -e, "process.exit(0)"]',
      '            cwd: .',
      '          timeout: 10s',
      '          onFailure: stop-phase',
      '',
    ].join('\n')
  );
  const ticket = join(root, 'specs', 'app', 'app.task.APP-rules.md');
  writeFileSync(
    ticket,
    [
      '# Task: APP-rules — snapshot',
      '<!--SECTION:META-->',
      '- **Task-ID:** APP-rules',
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
      '- **Objective:** verify snapshot',
      '- **Rules:**',
      `  - [typescript](${ruleSource})`,
      '- **Target Files:**',
      '  - src/app.ts',
      '- **Deleted Files:**',
      '  - none',
      '- **Inputs:** none',
      '- **Exit:** proof passes',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:VERIFICATION-->',
      '| Command | Required by | Role |',
      '|---|---|---|',
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '<!--/SECTION:EXECUTION_LOG-->',
      '',
    ].join('\n')
  );
  writeFileSync(join(root, 'specs', 'app', 'app.spec.md'), '# App\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
  return { root, ticket, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('runSddVerifyFacade RuleSnapshot integration', () => {
  it('passes the exact pre-dispatch digest and prompt body through the universal report', async () => {
    const { root, ticket, cleanup } = fixture();
    try {
      const before = readFileSync(ticket, 'utf8');
      const expected = resolveSddRuleSnapshot({
        root,
        declaredSources: ['ai/directives/coding/typescript-rules.xml'],
        declarationProvenance: 'specs/app/app.task.APP-rules.md#PHASE_P1.Rules',
        targetFiles: ['src/app.ts'],
        plannedFiles: ['src/app.ts'],
        intents: ['ReleaseCandidate'],
      });
      const result = await runSddVerifyFacade(root, 'specs/app/app.task.APP-rules.md', 'P1', {
        homeDirectory: root,
      });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.report?.rules.digest, expected.snapshot.digest);
      assert.equal(JSON.stringify(result.report?.rules), JSON.stringify(expected.snapshot));
      assert.strictEqual(result.report?.rules, result.report?.context.rules);
      assert.match(
        (
          result.report?.rules.required.find(({ id }) => id === 'typescript-rules') as
            | { readonly body?: string }
            | undefined
        )?.body ?? '',
        /Canonical rules for writing TypeScript/
      );
      assert.match(result.stdout, new RegExp(`rules=resolved ${expected.snapshot.digest}`));
      const after = readFileSync(ticket, 'utf8');
      assert.notEqual(after, before);
      const [attempt] = attempts(after);
      assert.equal(attempt?.state, 'PASS');
      assert.equal(attempt?.selector, 'release-check');
      assert.equal(
        (attempt?.identity as { rulesDigest?: string }).rulesDigest,
        expected.snapshot.digest
      );
      assert.deepEqual(attempt?.testStats, []);
      assert.match(
        (attempt?.processes as readonly { identity: string }[])[0]?.identity ?? '',
        /^local-process:[0-9a-f-]+$/
      );
      assert.equal(
        JSON.stringify(attempt).includes('Canonical rules for writing TypeScript'),
        false
      );
    } finally {
      cleanup();
    }
  });

  it('fails before spawning when a declared required source is missing', async () => {
    const { root, cleanup } = fixture('rules/missing.prompt');
    try {
      const sentinel = join(root, 'spawned');
      writeFileSync(
        join(root, 'gennady.yaml'),
        readFileSync(join(root, 'gennady.yaml'), 'utf8').replace(
          'process.exit(0)',
          "require('node:fs').writeFileSync('spawned','yes')"
        )
      );
      const result = await runSddVerifyFacade(root, 'specs/app/app.task.APP-rules.md', 'P1', {
        homeDirectory: root,
      });

      assert.equal(result.exitCode, 1);
      assert.match(
        result.stderr,
        /RULE_REGISTRY_SOURCE_UNAVAILABLE: specs\/app\/rules\/missing\.prompt: path is missing/
      );
      assert.equal(existsSync(sentinel), false);
      const [attempt] = attempts(
        readFileSync(join(root, 'specs/app/app.task.APP-rules.md'), 'utf8')
      );
      assert.equal(attempt?.state, 'BLOCKED');
    } finally {
      cleanup();
    }
  });

  it('does not persist when exact task/log identity is invalid', async () => {
    const { root, ticket, cleanup } = fixture();
    try {
      const before = readFileSync(ticket, 'utf8').replace(
        '<!--SECTION:EXECUTION_LOG-->\n<!--/SECTION:EXECUTION_LOG-->',
        ''
      );
      writeFileSync(ticket, before);
      const result = await runSddVerifyFacade(root, 'specs/app/app.task.APP-rules.md', 'P1', {
        homeDirectory: root,
      });
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /no unique readable EXECUTION_LOG/);
      assert.equal(readFileSync(ticket, 'utf8'), before);
    } finally {
      cleanup();
    }
  });

  it('retains failed attempts after retry and blocks a live concurrent owner', async () => {
    const { root, ticket, cleanup } = fixture();
    try {
      writeFileSync(
        join(root, 'gennady.yaml'),
        readFileSync(join(root, 'gennady.yaml'), 'utf8').replace(
          'process.exit(0)',
          'setTimeout(() => process.exit(0), 250)'
        )
      );
      const ticketArg = 'specs/app/app.task.APP-rules.md';
      const first = runSddVerifyFacade(root, ticketArg, 'P1', { homeDirectory: root });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      const second = await runSddVerifyFacade(root, ticketArg, 'P1', { homeDirectory: root });
      assert.equal(second.exitCode, 1);
      assert.match(second.stderr, /SDD_VERIFY_ATTEMPT_ACTIVE/);
      assert.equal((await first).exitCode, 0);
      const afterFirst = attempts(readFileSync(ticket, 'utf8'));
      assert.deepEqual(
        afterFirst.map(({ state }) => state),
        ['PASS']
      );

      writeFileSync(
        join(root, 'gennady.yaml'),
        readFileSync(join(root, 'gennady.yaml'), 'utf8').replace(
          'setTimeout(() => process.exit(0), 250)',
          'process.exit(1)'
        )
      );
      assert.equal(
        (await runSddVerifyFacade(root, ticketArg, 'P1', { homeDirectory: root })).exitCode,
        1
      );
      assert.deepEqual(
        attempts(readFileSync(ticket, 'utf8')).map(({ state }) => state),
        ['PASS', 'FAIL']
      );
    } finally {
      cleanup();
    }
  });

  it('recovers only an ownerless RUNNING attempt as INTERRUPTED before appending the next run', async () => {
    const { root, ticket, cleanup } = fixture();
    try {
      const ticketArg = 'specs/app/app.task.APP-rules.md';
      assert.equal(
        (await runSddVerifyFacade(root, ticketArg, 'P1', { homeDirectory: root })).exitCode,
        0
      );
      writeFileSync(
        ticket,
        rewriteFirstAttempt(readFileSync(ticket, 'utf8'), (attempt) => {
          attempt.state = 'RUNNING';
          attempt.finishedAt = null;
          attempt.durationMs = null;
        })
      );

      assert.equal(
        (await runSddVerifyFacade(root, ticketArg, 'P1', { homeDirectory: root })).exitCode,
        0
      );
      assert.deepEqual(
        attempts(readFileSync(ticket, 'utf8')).map(({ state }) => state),
        ['INTERRUPTED', 'PASS']
      );
    } finally {
      cleanup();
    }
  });
});
