// @file: Thin SDD facade RuleSnapshot passthrough integration tests.
// @consumers: CI
// @spec: CLI-SDD-VERIFY

import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { BUILTIN_RULE_SOURCES } from '../../../../shared/rules/builtin-rule-sources.ts';
import { resolveSddRuleSnapshot } from '../../../../shared/rules/sdd-rule-snapshot.ts';
import { adaptSddVerifyContext } from '../../../../shared/sdd/verify/sdd-verify-context.ts';
import { bindSddReceiptCommands } from '../../../../shared/sdd/verify/sdd-receipt-sink.ts';
import { runVerifyCommand } from '../../verify/verify.cmd.ts';
import { runSddVerifyFacade } from '../sdd-verify.facade.ts';
import { defaultAsyncRunner, GATE_MAX_BUFFER_BYTES } from '../sdd-verify.cmd.ts';
import { resolvePhaseContext } from '../phase-context.ts';
import { runPhaseVerification } from '../phase-run.ts';
import {
  parsePhaseReceipts,
  phaseReceiptTargetEvidence,
} from '../../../../shared/sdd/phase-receipt.ts';

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
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sdd-rule-facade-')));
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
      '## Execution Log',
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

function legacyOverlayFixture(
  failingTest = false,
  missingTypeCheck = false
): {
  readonly root: string;
  readonly ticket: string;
  readonly cleanup: () => void;
} {
  const built = fixture();
  const pass = 'node scripts/pass.mjs';
  mkdirSync(join(built.root, 'scripts'));
  writeFileSync(join(built.root, 'scripts', 'pass.mjs'), 'process.exit(0);\n');
  writeFileSync(join(built.root, 'scripts', 'test.mjs'), `process.exit(${failingTest ? 7 : 0});\n`);
  writeFileSync(join(built.root, 'scripts', 'extra.mjs'), 'process.exit(0);\n');
  writeFileSync(
    join(built.root, 'package.json'),
    JSON.stringify({
      name: 'sdd-legacy-overlay-fixture',
      private: true,
      scripts: {
        ...(missingTypeCheck ? {} : { 'type-check': 'node scripts/test.mjs' }),
      },
    })
  );
  writeFileSync(
    join(built.root, 'gennady.yaml'),
    [
      'verify:',
      '  sdd:',
      '    mapping:',
      '      Config: legacy-setup',
      '  presets:',
      '    node:',
      '      phases:',
      '        legacy-setup: { include: [legacy-setup] }',
      '      steps:',
      '        type-check:',
      '          tags: [legacy-setup]',
      '          command: { npmScript: type-check }',
      '        legacy-extra:',
      '          tags: [legacy-setup]',
      '          needs: [type-check]',
      '          executor: local',
      '          effect: observe',
      '          command: { argv: [node, scripts/extra.mjs], cwd: . }',
      '          timeout: 10s',
      '          onFailure: stop-phase',
      '',
    ].join('\n')
  );
  writeFileSync(
    built.ticket,
    readFileSync(built.ticket, 'utf8')
      .replace(/ReleaseCandidate/g, 'Config')
      .replace('- **Target Files:**', '- **Readiness Gates:**\n  - type-check\n- **Target Files:**')
      .replace(
        '|---|---|---|\n<!--/SECTION:VERIFICATION-->',
        '|---|---|---|\n| node scripts/extra.mjs | typescript-rules | extra |\n<!--/SECTION:VERIFICATION-->'
      )
  );
  git(built.root, 'add', '.');
  git(built.root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'overlay fixture');
  return built;
}

async function runLegacyPhase(root: string): Promise<{
  readonly outcome: Awaited<ReturnType<typeof runPhaseVerification>>;
  readonly receipt: unknown;
}> {
  const context = resolvePhaseContext('specs/app/app.task.APP-rules.md', 'P1', root);
  assert.equal(context.ok, true, context.ok ? '' : context.message);
  if (!context.ok) throw new Error(context.message);
  assert.equal(context.context.profile, 'setup');
  const previous = process.cwd();
  process.chdir(root);
  try {
    const outcome = await runPhaseVerification(
      root,
      context.context,
      defaultAsyncRunner,
      (command) => {
        const result = spawnSync(command, {
          cwd: root,
          encoding: 'utf8',
          shell: true,
          maxBuffer: GATE_MAX_BUFFER_BYTES,
        });
        return {
          exitCode: result.status ?? 1,
          output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
        };
      }
    );
    const parsed = parsePhaseReceipts(readFileSync(context.context.taskPath, 'utf8'));
    assert.equal(parsed.ok, true);
    return { outcome, receipt: parsed.ok ? parsed.receipts[0] : undefined };
  } finally {
    process.chdir(previous);
  }
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

  it('keeps a deletion-only phase as exact tombstone scope instead of widening to all-scope', async () => {
    const { root, ticket, cleanup } = fixture();
    try {
      unlinkSync(join(root, 'src', 'app.ts'));
      writeFileSync(
        ticket,
        readFileSync(ticket, 'utf8').replace(
          '  - src/app.ts\n- **Deleted Files:**\n  - none',
          '- **Deleted Files:**\n  - src/app.ts'
        )
      );
      const result = await runSddVerifyFacade(root, 'specs/app/app.task.APP-rules.md', 'P1', {
        homeDirectory: root,
      });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.deepEqual(result.report?.context.request.scope, {
        mode: 'files',
        files: ['src/app.ts'],
      });
      assert.deepEqual(result.report?.context.request.deletedFiles, ['src/app.ts']);
    } finally {
      cleanup();
    }
  });

  it('rejects a deletion tombstone without a tracked baseline before the Verify engine runs', async () => {
    const { root, ticket, cleanup } = fixture();
    try {
      writeFileSync(
        ticket,
        readFileSync(ticket, 'utf8').replace(
          '  - src/app.ts\n- **Deleted Files:**\n  - none',
          '- **Deleted Files:**\n  - src/never-existed.ts'
        )
      );
      const result = await runSddVerifyFacade(root, 'specs/app/app.task.APP-rules.md', 'P1', {
        homeDirectory: root,
      });

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /Deleted File has no tracked HEAD baseline/);
      assert.equal(result.report, undefined);
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
        '<!--SECTION:EXECUTION_LOG-->\n## Execution Log\n<!--/SECTION:EXECUTION_LOG-->',
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

describe('UV-13 explicit legacy-overlay golden parity', () => {
  it('persists the same complete legacy receipt fields through the common engine', async () => {
    const target = legacyOverlayFixture();
    try {
      const baselineSource = readFileSync(join(target.root, 'src', 'app.ts'), 'utf8');
      assert.equal(baselineSource, 'export const app = true;\n');
      const old = await runLegacyPhase(target.root);
      assert.equal(old.outcome.ok, true, old.outcome.ok ? '' : old.outcome.message);
      assert.equal(readFileSync(join(target.root, 'src', 'app.ts'), 'utf8'), baselineSource);
      const oldState = phaseReceiptTargetEvidence(target.root, ['src/app.ts']);
      assert.equal(oldState.ok, true);
      assert.deepEqual(oldState.ok ? oldState.evidence : undefined, old.receipt.targetEvidence);
      const frozenOldReceipt = structuredClone(old.receipt);
      assert.deepEqual(
        (old.receipt as { verification?: readonly { command: string }[] }).verification,
        [{ command: 'node scripts/extra.mjs', role: 'extra' }]
      );
      const next = await runSddVerifyFacade(target.root, 'specs/app/app.task.APP-rules.md', 'P1', {
        homeDirectory: target.root,
        legacyOverlay: { provenance: 'operator:uv13-frozen-golden' },
      });
      assert.equal(next.exitCode, 0, next.stderr || next.stdout);
      assert.equal(readFileSync(join(target.root, 'src', 'app.ts'), 'utf8'), baselineSource);
      assert.deepEqual(old.receipt, frozenOldReceipt);
      const parsed = parsePhaseReceipts(readFileSync(target.ticket, 'utf8'));
      assert.equal(parsed.ok, true);
      assert.deepEqual(parsed.ok ? parsed.receipts[0] : undefined, frozenOldReceipt);
      assert.equal(
        next.report?.results.filter((result) => result.stepId === 'node:legacy-extra').length,
        1,
        'ticket-owned Verification row executes exactly once through the common engine'
      );
      const [attempt] = attempts(readFileSync(target.ticket, 'utf8'));
      assert.deepEqual(attempt?.legacyOverlay, {
        enabled: true,
        provenance: 'operator:uv13-frozen-golden',
      });
    } finally {
      target.cleanup();
    }
  });

  it('preserves executed-gate failure identity while retaining the failed attempt', async () => {
    const legacy = legacyOverlayFixture(true);
    const target = legacyOverlayFixture(true);
    try {
      const old = await runLegacyPhase(legacy.root);
      assert.equal(old.outcome.ok, false);
      const next = await runSddVerifyFacade(target.root, 'specs/app/app.task.APP-rules.md', 'P1', {
        homeDirectory: target.root,
        legacyOverlay: { provenance: 'operator:uv13-frozen-golden' },
      });
      assert.equal(next.exitCode, old.outcome.ok ? 0 : old.outcome.exitCode);
      assert.equal(old.outcome.ok ? null : old.outcome.code, 'ERR_CLI_SDD_VERIFY_GATE_FAILED');
      assert.match(next.stderr, /ERR_CLI_SDD_VERIFY_GATE_FAILED severity=error location=.*#P1/);
      assert.equal(parsePhaseReceipts(readFileSync(target.ticket, 'utf8')).ok, true);
      assert.deepEqual(
        attempts(readFileSync(target.ticket, 'utf8')).map(({ state }) => state),
        ['FAIL']
      );
    } finally {
      legacy.cleanup();
      target.cleanup();
    }
  });

  it('preserves PROVEN gate skip semantics instead of re-running its target step', async () => {
    const legacy = legacyOverlayFixture();
    const target = legacyOverlayFixture();
    try {
      const oldInput = resolvePhaseContext('specs/app/app.task.APP-rules.md', 'P1', legacy.root);
      const nextInput = resolvePhaseContext('specs/app/app.task.APP-rules.md', 'P1', target.root);
      assert.equal(oldInput.ok, true);
      assert.equal(nextInput.ok, true);
      if (!oldInput.ok || !nextInput.ok) return;
      const prove = (context: typeof oldInput.context) => ({
        ...context,
        gatePlan: context.gatePlan && {
          ...context.gatePlan,
          gates: context.gatePlan.gates.map((gate) =>
            gate.name === 'type-check'
              ? { ...gate, state: 'PROVEN' as const, required: false }
              : gate
          ),
        },
      });
      const oldContext = prove(oldInput.context);
      const targetContext = prove(nextInput.context);
      const adapted = adaptSddVerifyContext(target.root, targetContext);
      assert.equal(adapted.ok, true);
      if (!adapted.ok) return;

      const packagePath = join(target.root, 'package.json');
      const packageDocument = JSON.parse(readFileSync(packagePath, 'utf8')) as {
        scripts: Record<string, string>;
      };
      delete packageDocument.scripts['type-check'];
      writeFileSync(packagePath, JSON.stringify(packageDocument));

      const previous = process.cwd();
      process.chdir(legacy.root);
      let oldGateSpawns = 0;
      const oldOutcome = await runPhaseVerification(
        legacy.root,
        oldContext,
        async () => {
          oldGateSpawns += 1;
          return { exitCode: 9, output: 'must not spawn' };
        },
        (command) => {
          const result = spawnSync(command, { cwd: legacy.root, encoding: 'utf8', shell: true });
          return { exitCode: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
        }
      );
      process.chdir(previous);
      assert.equal(oldOutcome.ok, true, oldOutcome.ok ? '' : oldOutcome.message);
      assert.equal(oldGateSpawns, 0);
      const oldReceipt = parsePhaseReceipts(readFileSync(legacy.ticket, 'utf8'));
      assert.equal(oldReceipt.ok, true);

      let targetReceipt: unknown;
      const next = await runVerifyCommand(
        target.root,
        { phase: 'legacy-setup', planOnly: false, format: 'text' },
        {
          homeDirectory: target.root,
          request: {
            scope: adapted.context.request.scope,
            knownDeletedFiles: adapted.context.request.deletedFiles,
            workflow: {
              task: adapted.context.request.task,
              phase: adapted.context.request.sddPhase,
            },
          },
          sdd: {
            context: adapted.context,
            bindings: (selectedPlan, readiness) =>
              bindSddReceiptCommands(target.root, selectedPlan, adapted.context, readiness),
            persist: (receipt) => {
              targetReceipt = receipt;
            },
          },
        }
      );

      assert.equal(next.exitCode, 0, next.stderr || next.stdout);
      assert.equal(next.report?.readiness.status, 'READY');
      assert.equal(
        next.report?.results.some((result) => result.stepId === 'node:type-check'),
        false,
        'a frozen PROVEN gate is not spawned through the compatibility overlay'
      );
      assert.deepEqual(
        targetReceipt,
        oldReceipt.ok ? oldReceipt.receipts[0] : undefined,
        'new overlay receipt matches the old CONFIGURED-only execution product'
      );
    } finally {
      legacy.cleanup();
      target.cleanup();
    }
  });

  it('preserves phase-preflight diagnostic identity before either runner spawns', async () => {
    const legacy = legacyOverlayFixture(false, true);
    const target = legacyOverlayFixture();
    try {
      const old = await runLegacyPhase(legacy.root);
      assert.equal(old.outcome.ok, false);
      assert.equal(
        old.outcome.ok ? null : old.outcome.code,
        'SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED'
      );
      const prior = await runLegacyPhase(target.root);
      assert.equal(prior.outcome.ok, true, prior.outcome.ok ? '' : prior.outcome.message);
      const packagePath = join(target.root, 'package.json');
      const packageDocument = JSON.parse(readFileSync(packagePath, 'utf8')) as {
        scripts: Record<string, string>;
      };
      delete packageDocument.scripts['type-check'];
      writeFileSync(packagePath, JSON.stringify(packageDocument));
      const next = await runSddVerifyFacade(target.root, 'specs/app/app.task.APP-rules.md', 'P1', {
        homeDirectory: target.root,
        legacyOverlay: { provenance: 'operator:uv13-frozen-golden' },
      });
      assert.match(
        next.stderr,
        /SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED severity=error location=.*#P1/
      );
      const retained = parsePhaseReceipts(readFileSync(target.ticket, 'utf8'));
      assert.equal(retained.ok, true);
      assert.deepEqual(retained.ok ? retained.receipts[0] : undefined, prior.receipt);
      assert.deepEqual(
        attempts(readFileSync(target.ticket, 'utf8')).map(({ state }) => state),
        ['BLOCKED']
      );
    } finally {
      legacy.cleanup();
      target.cleanup();
    }
  });

  it('rejects an unsupported inline Verification row before spawn and preserves prior proof', async () => {
    const target = legacyOverlayFixture();
    try {
      const prior = await runLegacyPhase(target.root);
      assert.equal(prior.outcome.ok, true, prior.outcome.ok ? '' : prior.outcome.message);
      writeFileSync(
        target.ticket,
        readFileSync(target.ticket, 'utf8').replace(
          '| node scripts/extra.mjs | typescript-rules | extra |',
          `| node -e "require('node:fs').writeFileSync('INLINE_RAN','yes')" | typescript-rules | extra |`
        )
      );

      const result = await runSddVerifyFacade(
        target.root,
        'specs/app/app.task.APP-rules.md',
        'P1',
        {
          homeDirectory: target.root,
          legacyOverlay: { provenance: 'operator:uv13-frozen-golden' },
        }
      );

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /ERR_CLI_SDD_VERIFY_RECEIPT/);
      assert.match(result.stderr, /inline\/module execution is unsupported/);
      assert.equal(existsSync(join(target.root, 'INLINE_RAN')), false);
      const retained = parsePhaseReceipts(readFileSync(target.ticket, 'utf8'));
      assert.equal(retained.ok, true);
      assert.deepEqual(retained.ok ? retained.receipts[0] : undefined, prior.receipt);
    } finally {
      target.cleanup();
    }
  });
});
