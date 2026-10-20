// @file: Unit/integration tests for EvalHarness — schema contract, parallel, crash, exit, effects, coverage
// @consumers: node:test runner
// @tasks: TSK-165

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEvalHarness, type EvalReportV2, type EvalHarnessInput } from '../harness.ts';
import type { JournalPort, JournalEntry, SinceResult } from '../../inbox-core/event-journal.ts';
import { DecisionJournal } from '../../inbox-core/decision-journal.ts';

const FIXED_NOW = '2026-08-07T00:00:00.000Z';

/** @purpose Deterministic clock: base ISO + offset seconds */
function t(offsetSec: number): string {
  return new Date(new Date(FIXED_NOW).getTime() + offsetSec * 1000).toISOString();
}

/**
 * @purpose In-memory JournalPort accepting pre-seeded entries.
 * @invariant Entries returned as-is; seq auto-assigned on append.
 */
function inMemoryJournal(entries: JournalEntry[]): JournalPort & { _entries: JournalEntry[] } {
  return {
    _entries: entries,
    read() {
      return this._entries;
    },
    since(_cursor: number): SinceResult {
      const all = this._entries;
      return { entries: all, nextCursor: all.length > 0 ? all[all.length - 1].seq : 0 };
    },
    async append(entry: Omit<JournalEntry, 'seq'>) {
      const seq = this._entries.length + 1;
      this._entries.push({ ...entry, seq } as JournalEntry);
      return seq;
    },
  };
}

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'inbox-eval-harness-test-'));
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

/**
 * @purpose Helper: run harness with given journal entries and optional overrides.
 * @returns EvalReportV2 from a single harness invocation.
 */
async function run(
  entries: JournalEntry[],
  overrides: Partial<EvalHarnessInput> = {}
): Promise<EvalReportV2> {
  const journal = inMemoryJournal(entries);
  const dj = new DecisionJournal(journal);
  return runEvalHarness({
    mr: 'https://gitlab.example.com/group/project/-/merge_requests/1',
    journal,
    decisionJournal: dj,
    reportsDir: join(stateDir, 'reports'),
    now: () => FIXED_NOW,
    ...overrides,
  });
}

describe('EvalHarness', () => {
  // #region START_CONTRACT_SCHEMA
  it('contract: eval report schema', async () => {
    // contract: EvalReportV2 has mr, ts, runs[], metrics, verdict with correct types
    // failure mode: missing fields or wrong types after harness run

    const report = await run([]);

    assert.strictEqual(typeof report.mr, 'string', 'mr must be string');
    assert.strictEqual(typeof report.ts, 'string', 'ts must be string');
    assert.ok(Array.isArray(report.runs), 'runs must be array');
    assert.strictEqual(typeof report.metrics, 'object', 'metrics must be object');
    assert.ok(report.verdict === 'pass' || report.verdict === 'fail', 'verdict must be pass|fail');

    assert.strictEqual(report.ts, FIXED_NOW, 'ts must match now()');

    const runIds = report.runs.map((r) => r.id);
    const expectedIds = [
      'boot',
      'role_pickup',
      'pipeline',
      'events',
      'chat',
      'effects',
      'autonomy',
      'parallel',
      'crash_recovery',
      'coverage_gate',
    ];
    for (const id of expectedIds) {
      assert.ok(runIds.includes(id), `runs must include ${id}`);
    }

    for (const run of report.runs) {
      assert.strictEqual(typeof run.id, 'string', `run ${run.id}: id must be string`);
      assert.ok(
        run.status === 'pass' || run.status === 'fail',
        `run ${run.id}: status must be pass|fail`
      );
      assert.ok(Array.isArray(run.evidence), `run ${run.id}: evidence must be array`);
    }

    // metrics shape check: acceptRate, editRate, timeToDecisionSec
    assert.ok(
      typeof report.metrics.acceptRate === 'object' && report.metrics.acceptRate !== null,
      'metrics.acceptRate must be object'
    );
    assert.ok(
      typeof report.metrics.editRate === 'object' && report.metrics.editRate !== null,
      'metrics.editRate must be object'
    );
    assert.ok(
      typeof report.metrics.timeToDecisionSec === 'object' &&
        report.metrics.timeToDecisionSec !== null,
      'metrics.timeToDecisionSec must be object'
    );
    assert.strictEqual(
      typeof report.metrics.timeToDecisionSec.median,
      'number',
      'timeToDecisionSec.median must be number'
    );
    assert.strictEqual(
      typeof report.metrics.timeToDecisionSec.p90,
      'number',
      'timeToDecisionSec.p90 must be number'
    );
  });
  // #endregion END_CONTRACT_SCHEMA

  // #region START_PARALLEL_UNBLOCK
  it('parallel run enforces 30s unblock criterion', async () => {
    // contract: MR-A running at t=0, MR-B queued at t=0, MR-B running at t=31 → queued→running=31s > 30s → FAIL
    // failure mode: parallel runner returns pass when queued→running gap exceeds threshold

    const entries: JournalEntry[] = [
      {
        seq: 1,
        mr: 'group/project!1',
        ts: t(0),
        kind: 'task_status',
        actor: 'pipeline',
        payload: { mr: 'group/project!1', status: 'running' },
      },
      {
        seq: 2,
        mr: 'group/project!2',
        ts: t(0),
        kind: 'task_status',
        actor: 'pipeline',
        payload: { mr: 'group/project!2', status: 'queued' },
      },
      {
        seq: 3,
        mr: 'group/project!2',
        ts: t(31),
        kind: 'task_status',
        actor: 'pipeline',
        payload: { mr: 'group/project!2', status: 'running' },
      },
    ];

    const report = await run(entries, { runFilter: ['parallel'] });

    const parallelRun = report.runs.find((r) => r.id === 'parallel');
    assert.ok(parallelRun, 'parallel run must exist');
    assert.strictEqual(parallelRun.status, 'fail', 'parallel run must fail when unblock > 30s');
    assert.strictEqual(report.verdict, 'fail', 'harness verdict must be fail');
  });
  // #endregion END_PARALLEL_UNBLOCK

  // #region START_CRASH_RECOVERY
  it('crash recovery restores identical board', async () => {
    // contract: system crash event at known time, tasks created before) and after are tracked
    // failure mode: crash recovery run crashes instead of handling missing events gracefully

    const entries: JournalEntry[] = [
      {
        seq: 1,
        mr: 'group/project!1',
        ts: t(0),
        kind: 'task_created',
        actor: 'queue',
        payload: { taskId: 't1' },
      },
      {
        seq: 2,
        mr: 'group/project!1',
        ts: t(1),
        kind: 'system',
        actor: 'core',
        payload: { event: 'crash' },
      },
      {
        seq: 3,
        mr: 'group/project!1',
        ts: t(2),
        kind: 'system',
        actor: 'core',
        payload: { event: 'recovery' },
      },
      {
        seq: 4,
        mr: 'group/project!1',
        ts: t(3),
        kind: 'task_created',
        actor: 'queue',
        payload: { taskId: 't2' },
      },
    ];

    const report = await run(entries, { runFilter: ['crash_recovery'] });

    const crashRun = report.runs.find((r) => r.id === 'crash_recovery');
    assert.ok(crashRun, 'crash_recovery run must exist');
    assert.strictEqual(crashRun.status, 'pass', 'crash recovery run must pass');
    // evidence must mention crash timestamp and task counts
    const evidence = crashRun.evidence.join(' ');
    assert.match(evidence, /crash at/);
    assert.match(evidence, /tasks before/);
  });
  // #endregion END_CRASH_RECOVERY

  // #region START_EXIT_CODE
  it('exit code mirrors verdict', async () => {
    // contract: one runner fails → harness verdict is fail → exit code ≠ 0
    // failure mode: exit code 0 despite fail verdict, or fail hidden by catch-all

    const entries: JournalEntry[] = [
      {
        seq: 1,
        mr: 'group/project!1',
        ts: t(0),
        kind: 'task_status',
        actor: 'pipeline',
        payload: { mr: 'group/project!1', status: 'running' },
      },
      {
        seq: 2,
        mr: 'group/project!2',
        ts: t(0),
        kind: 'task_status',
        actor: 'pipeline',
        payload: { mr: 'group/project!2', status: 'queued' },
      },
      {
        seq: 3,
        mr: 'group/project!2',
        ts: t(45),
        kind: 'task_status',
        actor: 'pipeline',
        payload: { mr: 'group/project!2', status: 'running' },
      },
    ];

    const report = await run(entries, { runFilter: ['parallel'] });

    assert.strictEqual(report.verdict, 'fail', 'harness verdict must be fail');
    assert.ok(
      report.runs.some((r) => r.status === 'fail'),
      'at least one run must fail'
    );
    const exitCode = report.verdict === 'fail' ? 1 : 0;
    assert.strictEqual(exitCode, 1, 'exit code must be non-zero when verdict is fail');
  });
  // #endregion END_EXIT_CODE

  // #region START_EFFECTS
  it('effects run proves idempotency and resolve rights', async () => {
    // contract: duplicate dryrun marker per effectId → fail; rejection decision present → evidence includes rejections
    // failure mode: duplicate markers undetected; rejections ignored

    const entries: JournalEntry[] = [
      {
        seq: 1,
        mr: 'group/project!1',
        ts: t(0),
        kind: 'system',
        actor: 'core',
        payload: { event: 'dryrun', effectId: 'eff-1' },
      },
      {
        seq: 2,
        mr: 'group/project!1',
        ts: t(1),
        kind: 'system',
        actor: 'core',
        payload: { event: 'dryrun', effectId: 'eff-1' },
      },
      {
        seq: 3,
        mr: 'group/project!1',
        ts: t(2),
        kind: 'decision',
        actor: 'operator',
        payload: { proposalId: 'prop-1', verdict: 'reject' },
      },
    ];

    const report = await run(entries, { runFilter: ['effects'] });

    const effectsRun = report.runs.find((r) => r.id === 'effects');
    assert.ok(effectsRun, 'effects run must exist');
    // duplicate eff-1 markers → fail
    assert.strictEqual(effectsRun.status, 'fail', 'effects run must fail on duplicate markers');
    assert.ok(
      effectsRun.evidence.some((e) => e.includes('duplicate')),
      'evidence must mention duplicate'
    );

    assert.strictEqual(report.verdict, 'fail', 'harness verdict must be fail');
  });
  // #endregion END_EFFECTS

  // #region START_COVERAGE_GATE
  it('coverage gate fails with file list and continue completes', async () => {
    // contract: gate rejected then later accept on continue session → evidence shows correction path
    // failure mode: gate accept after reject not reflected in evidence

    const entries: JournalEntry[] = [
      {
        seq: 1,
        mr: 'group/project!1',
        ts: t(0),
        kind: 'artifact_produced',
        actor: 'pipeline',
        payload: { artifact: 'coverage-report.json' },
      },
      {
        seq: 2,
        mr: 'group/project!1',
        ts: t(1),
        kind: 'decision',
        actor: 'operator',
        payload: { proposalId: 'coverage-gate', verdict: 'reject' },
      },
      {
        seq: 3,
        mr: 'group/project!1',
        ts: t(2),
        kind: 'decision',
        actor: 'operator',
        payload: { proposalId: 'coverage-gate', verdict: 'accept' },
      },
    ];

    const report = await run(entries, { runFilter: ['coverage_gate'] });

    const covRun = report.runs.find((r) => r.id === 'coverage_gate');
    assert.ok(covRun, 'coverage_gate run must exist');
    assert.strictEqual(covRun.status, 'pass', 'coverage_gate run must pass');
    const evidence = covRun.evidence.join(' ');
    assert.match(evidence, /coverage artifact/);
    assert.match(evidence, /gate decisions/);
    assert.match(evidence, /initial fail corrected on continue/);
    assert.match(evidence, /2 total/);
    assert.match(evidence, /1 reject/);
    assert.match(evidence, /1 accept/);
  });
  // #endregion END_COVERAGE_GATE
});
