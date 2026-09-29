// @file: SDD-owned attempt evidence normalization and fail-closed stats tests.
// @consumers: CI
// @spec: CLI-SDD-VERIFY

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import os from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import type {
  VerifyRunReport,
  VerifyStepResult,
} from '../../../verify/model/verify-report.type.ts';
import { runWithSddAttemptJournal } from '../sdd-attempt-journal.ts';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    encoding: 'utf8',
  }).trim();
}

function fixture(): {
  readonly root: string;
  readonly ticket: string;
  readonly cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'sdd-attempt-journal-'));
  mkdirSync(join(root, 'specs'));
  const ticket = join(root, 'specs', 'task.md');
  writeFileSync(
    ticket,
    ['# Task', '<!--SECTION:EXECUTION_LOG-->', '<!--/SECTION:EXECUTION_LOG-->', ''].join('\n')
  );
  writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
  return { root, ticket, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function evidence(ticket: string): Record<string, unknown> {
  const match = /<!--SDD_VERIFY_EVIDENCE:([A-Za-z0-9_-]+)-->/.exec(readFileSync(ticket, 'utf8'));
  assert.ok(match);
  return JSON.parse(Buffer.from(match[1]!, 'base64url').toString('utf8'));
}

function allEvidence(ticket: string): readonly Record<string, any>[] {
  return [
    ...readFileSync(ticket, 'utf8').matchAll(/<!--SDD_VERIFY_EVIDENCE:([A-Za-z0-9_-]+)-->/g),
  ].map((match) => JSON.parse(Buffer.from(match[1]!, 'base64url').toString('utf8')));
}

function lockOwnerPath(root: string, ticket: string): string {
  const id = createHash('sha256').update('specs/task.md').digest('hex');
  return join(root, '.git', 'gennady', 'sdd-attempts', id, 'owner.json');
}

function result(status: VerifyStepResult['status'], withStats: boolean): VerifyStepResult {
  return {
    stepId: 'node:unit',
    plugin: 'node',
    status,
    exitCode: status === 'pass' ? 0 : 1,
    durationMs: 4,
    output: '',
    process: {
      schema: 'gennady.verify-process.v1',
      identity: `process:${status}`,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:00.004Z',
      termination: 'completed',
      signal: null,
    },
    ...(withStats
      ? {
          testStats: {
            schema: 'gennady.verify-test-stats.v1' as const,
            policy: 'required' as const,
            protocol: 'node-test-summary-v1',
            runner: 'node:test',
            source: 'fixture:node-test',
            executed: 1,
            passed: status === 'pass' ? 1 : 0,
            failed: status === 'pass' ? 0 : 1,
            skipped: 0,
          },
        }
      : {}),
  };
}

function report(root: string, results: readonly VerifyStepResult[]): VerifyRunReport {
  return {
    context: {
      request: { root: '/not-persisted', phase: 'unit', scope: { mode: 'files', files: ['a.ts'] } },
      plugins: ['node'],
      frameworks: [],
      headSha: git(root, 'rev-parse', 'HEAD'),
      rules: { digest: `sha256:${'b'.repeat(64)}`, required: [], suggested: [], skipped: [] },
    },
    readiness: { status: 'READY', entries: [] },
    plan: {
      phase: 'unit',
      trust: { level: 'local-runner', source: 'fixture:selector' },
      steps: [
        {
          id: 'node:unit',
          plugin: 'node',
          tags: ['unit'],
          needs: [],
          executor: 'local',
          effect: 'observe',
          requires: [],
          testStats: {
            policy: 'required',
            protocol: 'node-test-summary-v1',
            runner: 'node:test',
            source: 'fixture:node-test',
          },
          timeoutMs: 1_000,
          onFailure: 'stop-phase',
        },
      ],
    },
    results,
    mutations: [],
    evidence: [],
    rules: { digest: `sha256:${'b'.repeat(64)}`, required: [], suggested: [], skipped: [] },
    verdict: 'pass',
  };
}

it('normalizes repeated test-step attempts to the latest plan-ordered stats record', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    const outcome = await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      run: async () => ({
        exitCode: 0,
        stdout: '',
        stderr: '',
        report: report(root, [result('fail', true), result('pass', true)]),
      }),
    });
    assert.equal(outcome.exitCode, 0);
    const record = evidence(ticket);
    assert.equal(record.state, 'PASS');
    assert.deepEqual(record.testStats, [
      { stepId: 'node:unit', ...result('pass', true).testStats },
    ]);
  } finally {
    cleanup();
  }
});

it('turns a promised required test step without normalized stats into VIOLATION', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    const outcome = await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      run: async () => ({
        exitCode: 0,
        stdout: '',
        stderr: '',
        report: report(root, [result('pass', false)]),
      }),
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stderr, /SDD_VERIFY_ATTEMPT_EVIDENCE_INVALID/);
    assert.equal(evidence(ticket).state, 'VIOLATION');
  } finally {
    cleanup();
  }
});

it('persists an unexpected runner exception as VIOLATION instead of a readiness BLOCKED claim', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    const outcome = await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      run: async () => {
        throw new Error('injected runner defect');
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stderr, /injected runner defect/);
    assert.equal(evidence(ticket).state, 'VIOLATION');
  } finally {
    cleanup();
  }
});

it('recomputes normalized terminal freshness after repairs without self-staling on its journal', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      run: async () => {
        writeFileSync(join(root, 'source.ts'), 'export const value = 2;\n');
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
          report: report(root, [result('pass', true)]),
        };
      },
    });
    const first = allEvidence(ticket)[0]!;
    await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      run: async () => ({
        exitCode: 0,
        stdout: '',
        stderr: '',
        report: report(root, [result('pass', true)]),
      }),
    });
    const second = allEvidence(ticket)[1]!;
    assert.equal(second.identity.worktreeDigest, first.identity.worktreeDigest);

    writeFileSync(join(root, 'source.ts'), 'export const value = 3;\n');
    await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      run: async () => ({
        exitCode: 0,
        stdout: '',
        stderr: '',
        report: report(root, [result('pass', true)]),
      }),
    });
    const third = allEvidence(ticket)[2]!;
    assert.notEqual(third.identity.worktreeDigest, first.identity.worktreeDigest);
  } finally {
    cleanup();
  }
});

it('refuses to overwrite a ticket replaced immediately before atomic rename', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    const original = `${ticket}.original`;
    await assert.rejects(
      runWithSddAttemptJournal({
        root,
        ticketPath: ticket,
        sddPhase: 'P1',
        runtime: {
          beforeTicketRename: () => {
            renameSync(ticket, original);
            writeFileSync(ticket, 'foreign replacement\n');
          },
        },
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      }),
      /SDD_VERIFY_ATTEMPT_UNSAFE/
    );
    assert.equal(readFileSync(ticket, 'utf8'), 'foreign replacement\n');
    assert.match(readFileSync(original, 'utf8'), /SECTION:EXECUTION_LOG/);
  } finally {
    cleanup();
  }
});

it('never removes a substituted ticket temporary path during failed cleanup', async () => {
  const { root, ticket, cleanup } = fixture();
  let substituted = '';
  try {
    await assert.rejects(
      runWithSddAttemptJournal({
        root,
        ticketPath: ticket,
        sddPhase: 'P1',
        runtime: {
          beforeTicketRename: (_ticketPath, temporaryPath) => {
            substituted = temporaryPath;
            unlinkSync(temporaryPath);
            writeFileSync(temporaryPath, 'foreign temporary\n');
          },
        },
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      }),
      /temporary file identity changed/
    );
    assert.notEqual(substituted, '');
    assert.equal(readFileSync(substituted, 'utf8'), 'foreign temporary\n');
    assert.match(readFileSync(ticket, 'utf8'), /^# Task/);
  } finally {
    cleanup();
  }
});

it('fails freshness normalization on malformed or mismatched attempt markers', async () => {
  for (const marker of [
    '<!--SDD_VERIFY_ATTEMPT:a:BEGIN-->\nunsafe\n<!--SDD_VERIFY_ATTEMPT:b:END-->',
    '<!--SDD_VERIFY_ATTEMPT:a:BEGIN',
  ]) {
    const { root, ticket, cleanup } = fixture();
    try {
      const corrupted = readFileSync(ticket, 'utf8').replace(
        '<!--/SECTION:EXECUTION_LOG-->',
        `${marker}\n<!--/SECTION:EXECUTION_LOG-->`
      );
      writeFileSync(ticket, corrupted);
      await assert.rejects(
        runWithSddAttemptJournal({
          root,
          ticketPath: ticket,
          sddPhase: 'P1',
          run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        }),
        /SDD_VERIFY_ATTEMPT_CORRUPT/
      );
      assert.equal(readFileSync(ticket, 'utf8'), corrupted);
    } finally {
      cleanup();
    }
  }
});

it('records legacy overlay only when explicitly activated with provenance', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    const run = async () => ({
      exitCode: 0,
      stdout: '',
      stderr: '',
      report: report(root, [result('pass', true)]),
    });
    await runWithSddAttemptJournal({ root, ticketPath: ticket, sddPhase: 'P1', run });
    await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      legacyOverlay: { enabled: true, provenance: 'operator:compatibility-profile' },
      run,
    });
    const [plain, compatibility] = allEvidence(ticket);
    assert.equal(plain?.legacyOverlay, undefined);
    assert.deepEqual(compatibility?.legacyOverlay, {
      enabled: true,
      provenance: 'operator:compatibility-profile',
    });
    assert.equal(JSON.stringify(plain).includes('legacyGateCommands'), false);
  } finally {
    cleanup();
  }
});

it('rechecks a remote stale owner immediately before recovery deletion', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    const ownerPath = lockOwnerPath(root, ticket);
    mkdirSync(join(ownerPath, '..'), { recursive: true });
    const stale = {
      schema: 'gennady.sdd-verify-attempt-lock.v1',
      runId: 'remote-run',
      token: 'remote-token',
      hostname: 'other-host',
      pid: 1,
      heartbeatAt: '2020-01-01T00:00:00.000Z',
    };
    writeFileSync(ownerPath, `${JSON.stringify(stale)}\n`);
    await assert.rejects(
      runWithSddAttemptJournal({
        root,
        ticketPath: ticket,
        sddPhase: 'P1',
        runtime: {
          beforeStaleOwnerRecheck: () =>
            writeFileSync(
              ownerPath,
              `${JSON.stringify({ ...stale, heartbeatAt: new Date().toISOString() })}\n`
            ),
        },
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      }),
      /SDD_VERIFY_ATTEMPT_ACTIVE/
    );
    assert.equal(JSON.parse(readFileSync(ownerPath, 'utf8')).token, 'remote-token');
  } finally {
    cleanup();
  }
});

it('does not let a heartbeat atomic rename overwrite a replacement owner token', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    const ownerPath = lockOwnerPath(root, ticket);
    let replaced = false;
    const outcome = await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      runtime: {
        heartbeatMs: 5,
        beforeOwnerRename: () => {
          if (replaced) return;
          replaced = true;
          const current = JSON.parse(readFileSync(ownerPath, 'utf8')) as Record<string, unknown>;
          writeFileSync(
            ownerPath,
            `${JSON.stringify({
              ...current,
              token: 'replacement-token',
              hostname: os.hostname(),
              pid: process.pid,
              heartbeatAt: new Date().toISOString(),
            })}\n`
          );
        },
      },
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
          report: report(root, [result('pass', true)]),
        };
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.equal(JSON.parse(readFileSync(ownerPath, 'utf8')).token, 'replacement-token');
    assert.equal(evidence(ticket).state, 'VIOLATION');
  } finally {
    cleanup();
  }
});

it('does not remove a substituted owner temporary path during heartbeat cleanup', async () => {
  const { root, ticket, cleanup } = fixture();
  let substituted = '';
  try {
    const ownerPath = lockOwnerPath(root, ticket);
    let replaced = false;
    const outcome = await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      runtime: {
        heartbeatMs: 5,
        beforeOwnerRename: (temporaryPath) => {
          if (replaced) return;
          replaced = true;
          substituted = temporaryPath;
          unlinkSync(temporaryPath);
          writeFileSync(temporaryPath, 'foreign temporary\n');
          const current = JSON.parse(readFileSync(ownerPath, 'utf8')) as Record<string, unknown>;
          writeFileSync(
            ownerPath,
            `${JSON.stringify({ ...current, token: 'replacement-token' })}\n`
          );
        },
      },
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
          report: report(root, [result('pass', true)]),
        };
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.notEqual(substituted, '');
    assert.equal(existsSync(substituted), true);
    assert.equal(readFileSync(substituted, 'utf8'), 'foreign temporary\n');
    assert.equal(JSON.parse(readFileSync(ownerPath, 'utf8')).token, 'replacement-token');
  } finally {
    cleanup();
  }
});

it('rejects unsafe persisted scalars without leaking authored values', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    const before = readFileSync(ticket, 'utf8');
    await assert.rejects(
      runWithSddAttemptJournal({
        root,
        ticketPath: ticket,
        sddPhase: 'P1\nforged',
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      }),
      /sddPhase contains control characters/
    );
    await assert.rejects(
      runWithSddAttemptJournal({
        root,
        ticketPath: ticket,
        sddPhase: 'P1',
        legacyOverlay: { enabled: true, provenance: 'token=ghp_abcdefghijklmnop' },
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      }),
      /legacyOverlay\.provenance contains secret-like material/
    );
    await assert.rejects(
      runWithSddAttemptJournal({
        root,
        ticketPath: ticket,
        sddPhase: 'P1',
        legacyOverlay: { enabled: true, provenance: 'x'.repeat(257) },
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      }),
      /legacyOverlay\.provenance exceeds 256 UTF-8 bytes/
    );
    assert.equal(readFileSync(ticket, 'utf8'), before);

    const unsafeReports: VerifyRunReport[] = [];
    const unsafeTrust = report(root, [result('pass', true)]);
    unsafeReports.push({
      ...unsafeTrust,
      plan: {
        ...unsafeTrust.plan,
        trust: { level: 'local-runner', source: '/Users/operator/private-config' },
      },
    });
    const unsafeStep = report(root, [result('pass', true)]);
    unsafeReports.push({
      ...unsafeStep,
      plan: {
        ...unsafeStep.plan,
        steps: [{ ...unsafeStep.plan.steps[0]!, id: 'x'.repeat(257) }],
      },
      results: [{ ...unsafeStep.results[0]!, stepId: 'x'.repeat(257) }],
    });
    const unsafeStats = report(root, [result('pass', true)]);
    unsafeReports.push({
      ...unsafeStats,
      plan: {
        ...unsafeStats.plan,
        steps: [
          {
            ...unsafeStats.plan.steps[0]!,
            testStats: {
              ...unsafeStats.plan.steps[0]!.testStats!,
              source: 'password=hunter2',
            },
          },
        ],
      },
      results: [
        {
          ...unsafeStats.results[0]!,
          testStats: { ...unsafeStats.results[0]!.testStats!, source: 'password=hunter2' },
        },
      ],
    });
    for (const unsafeReport of unsafeReports) {
      const outcome = await runWithSddAttemptJournal({
        root,
        ticketPath: ticket,
        sddPhase: 'P1',
        run: async () => ({ exitCode: 0, stdout: '', stderr: '', report: unsafeReport }),
      });
      assert.equal(outcome.exitCode, 1);
    }
    const persisted = readFileSync(ticket, 'utf8');
    assert.doesNotMatch(persisted, /hunter2|private-config|x{64}/);
    const records = allEvidence(ticket);
    assert.equal(records.length, 3);
    for (const record of records) {
      assert.equal(record.state, 'VIOLATION');
      assert.equal(record.projection.complete, false);
      assert.deepEqual(record.testStats, []);
      assert.deepEqual(record.processes, []);
      assert.equal(record.trust.source, 'unsafe-evidence-projection');
    }
  } finally {
    cleanup();
  }
});

it('persists remote-required BLOCKED, rejects local PASS, and accepts exact-SHA provider proof', async () => {
  const { root, ticket, cleanup } = fixture();
  try {
    const local = report(root, []);
    const remoteBlocked: VerifyRunReport = {
      ...local,
      readiness: { status: 'BLOCKED', entries: [] },
      plan: {
        ...local.plan,
        trust: { level: 'remote-provider', source: 'gennady.yaml#verify.presets.node.phases.ci' },
      },
      verdict: 'blocked',
    };
    await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      run: async () => ({ exitCode: 1, stdout: '', stderr: '', report: remoteBlocked }),
    });
    const blocked = allEvidence(ticket)[0]!;
    assert.equal(blocked.state, 'BLOCKED');
    assert.deepEqual(blocked.trust, {
      level: 'remote-provider',
      source: 'gennady.yaml#verify.presets.node.phases.ci',
      resolved: false,
    });
    assert.deepEqual(blocked.processes, []);

    const invalidPass: VerifyRunReport = {
      ...remoteBlocked,
      readiness: { status: 'READY', entries: [] },
      results: [result('pass', true)],
      verdict: 'pass',
    };
    const outcome = await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      run: async () => ({ exitCode: 0, stdout: '', stderr: '', report: invalidPass }),
    });
    assert.equal(outcome.exitCode, 1);
    assert.equal(allEvidence(ticket)[1]?.state, 'VIOLATION');

    const head = git(root, 'rev-parse', 'HEAD');
    const remotePass: VerifyRunReport = {
      ...invalidPass,
      remote: {
        schema: 'gennady.verify-remote-proof.v1',
        provider: 'gitlab',
        project: 'group/repo',
        definitionId: 'source:push',
        sourceSha: head,
        pipelineId: '88',
        pipelineSha: head,
        rawStatus: 'success',
        terminalState: 'REMOTE_SUCCESS',
        observedAt: '2026-09-29T10:00:00.000Z',
        jobs: [],
      },
    };
    const accepted = await runWithSddAttemptJournal({
      root,
      ticketPath: ticket,
      sddPhase: 'P1',
      run: async () => ({ exitCode: 0, stdout: '', stderr: '', report: remotePass }),
    });
    assert.equal(accepted.exitCode, 0);
    assert.deepEqual(allEvidence(ticket)[2]?.trust, {
      level: 'remote-provider',
      source: 'gennady.yaml#verify.presets.node.phases.ci',
      resolved: true,
      provider: 'gitlab',
      exactSha: head,
      pipelineId: '88',
    });
  } finally {
    cleanup();
  }
});
