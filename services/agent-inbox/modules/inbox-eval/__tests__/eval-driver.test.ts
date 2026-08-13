// @file: Unit tests for inbox-eval driver (`runEval`) — mocks `runMrsOnce` entirely (VcsInboxMock/
//   OpenCodeMock wiring only, no network — GITLAB_PERSONAL_TOKEN must never be exercised here) and
//   asserts: (a) clean run → every computable gate (G1 base-sha presence, G9 body-size, G10
//   idempotency) green, report written, exit reflects status; (b) red per computable gate
//   (oversized body → G9 fail; missing base data → no fabricated G1 pass) → status=FAIL; (c) G2-G8
//   are never emitted as fabricated-pass — absent, never green without data (honesty invariant).
// @consumers: node:test runner
// @tasks: TSK-119, TSK-167

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEval, type RunEvalInput, type RunEvalDeps } from '../eval-driver.ts';
import type { RunMrsOnceOpts, RunMrsOnceResult, MrRunResult } from '../../../serve/run-mode.ts';
import type { GateId } from '../gates.ts';

const MR_A = 'https://gitlab.example.com/group/project/-/merge_requests/1';
const MR_B = 'https://gitlab.example.com/group/project/-/merge_requests/2';

let stateDir: string;

beforeEach(() => {
  // invariant: never touch real ~/.gennady — every run gets its own scratch state dir
  stateDir = mkdtempSync(join(tmpdir(), 'inbox-eval-driver-test-'));
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

/**
 * @purpose Build a done `MrRunResult` carrying a `baseSha` and, optionally, one staged `reply`
 *   action body — the shape `_evaluateMrGates` scans for G1/G9 evidence.
 */
function doneResult(mr: string, opts: { baseSha?: string; replyBody?: string } = {}): MrRunResult {
  const artifacts: Record<string, unknown> = {};
  if (opts.baseSha !== undefined) artifacts['baseSha'] = opts.baseSha;
  if (opts.replyBody !== undefined) {
    artifacts['synthesize'] = { proposedActions: [{ type: 'reply', body: opts.replyBody }] };
  }
  return {
    mr,
    state: 'completed',
    role: 'reviewer',
    board: {},
    artifacts,
    runtimeIdentity: 'pipeline-runtime:mock:test',
  };
}

/**
 * @purpose Fixed dry-run second-pass result — no `EffectResult` on any MR, so G10 takes the honest
 *   zero-outcome fallback.
 */
function noEffectSecondPass(mrs: string[]): RunMrsOnceResult {
  return { results: mrs.map((mr) => doneResult(mr, {})) };
}

/**
 * @purpose Build a `deps.runMrsOnce` override that returns `firstPass` on call #1 and a no-effect
 *   second pass (for G10) on any subsequent call — mirrors the driver's own second dry-run
 *   invocation for idempotency.
 */
function mockRunMrsOnce(firstPass: MrRunResult[]) {
  let call = 0;
  return async (opts: RunMrsOnceOpts): Promise<RunMrsOnceResult> => {
    call += 1;
    if (call === 1) return { results: firstPass };
    return noEffectSecondPass(opts.mrs);
  };
}

function baseDeps(runMrsOnce: RunEvalDeps['runMrsOnce']): RunEvalDeps {
  return { mocks: true, stateDir, runMrsOnce };
}

describe('runEval — clean run over computable gates', () => {
  it('GIVEN run-mode отдал чистые артефакты WHEN runEval THEN computable gates green, status=PASS, exit=0', async () => {
    const firstPass = [
      doneResult(MR_A, { baseSha: 'sha-a', replyBody: 'short reply body' }),
      doneResult(MR_B, { baseSha: 'sha-b', replyBody: 'another short body' }),
    ];
    const input: RunEvalInput = { mrs: [MR_A, MR_B], dryRun: true };
    const { report, reportDir } = await runEval(input, baseDeps(mockRunMrsOnce(firstPass)));

    assert.strictEqual(report.status, 'PASS');
    assert.ok(report.gates.length > 0);
    for (const gate of report.gates) {
      assert.strictEqual(gate.pass, true, `gate ${gate.gate} unexpectedly red`);
    }

    const gateIds = report.gates.map((g) => g.gate);
    assert.ok(
      gateIds.includes('G1'),
      'G1 (base-sha presence) должен присутствовать при заданном baseSha'
    );
    assert.ok(gateIds.includes('G9'), 'G9 (body-size) должен присутствовать при staged reply body');
    assert.ok(gateIds.includes('G10'), 'G10 (idempotency) должен присутствовать при dryRun');

    const exitCode = report.status === 'PASS' ? 0 : 1;
    assert.strictEqual(exitCode, 0);

    assert.ok(
      existsSync(join(reportDir, 'eval-report.json')),
      'eval-report.json должен быть записан'
    );
    assert.ok(existsSync(join(reportDir, 'eval-report.md')), 'eval-report.md должен быть записан');
    const writtenJson = JSON.parse(readFileSync(join(reportDir, 'eval-report.json'), 'utf8'));
    assert.strictEqual(writtenJson.status, 'PASS');
  });
});

describe('runEval — red per computable gate', () => {
  it('GIVEN тело общего >8KB WHEN runEval THEN G9 красный, status=FAIL, exit=1', async () => {
    const oversizedBody = 'x'.repeat(9000);
    const firstPass = [doneResult(MR_A, { baseSha: 'sha-a', replyBody: oversizedBody })];
    const input: RunEvalInput = { mrs: [MR_A], dryRun: true };
    const { report } = await runEval(input, baseDeps(mockRunMrsOnce(firstPass)));

    assert.strictEqual(report.status, 'FAIL');
    const g9 = report.gates.find((g) => g.gate === 'G9');
    assert.ok(g9, 'G9 должен присутствовать');
    assert.strictEqual(g9?.pass, false);

    const exitCode = report.status === 'PASS' ? 0 : 1;
    assert.strictEqual(exitCode, 1);
  });

  it('GIVEN артефакт без baseSha WHEN runEval THEN G1 отсутствует (не фабрикуется как pass), а обрыв MR даёт status=FAIL', async () => {
    // invariant: missing base-sha data means the real graph never resolved diff_refs for this MR
    // (surfaced here as a crashed/errored MrRunResult) — the driver must neither fabricate a
    // passing G1 nor silently report PASS over an incomplete stage.
    const erroredResult: MrRunResult = {
      mr: MR_A,
      state: 'failed',
      role: null,
      board: null,
      artifacts: null,
      error: 'diff_refs unresolved',
      runtimeIdentity: 'pipeline-runtime:mock:test',
    };
    const input: RunEvalInput = { mrs: [MR_A], dryRun: true };
    const { report } = await runEval(input, baseDeps(mockRunMrsOnce([erroredResult])));

    assert.strictEqual(
      report.status,
      'FAIL',
      'errored MR (state != done/awaiting_operator) keeps the stage not-done → overall FAIL'
    );
    assert.ok(
      !report.gates.some((g) => g.gate === 'G1'),
      'G1 must be absent (not fabricated pass) when artifacts carry no baseSha'
    );
  });
});

describe('runEval — honesty invariant: G2-G8 never fabricated-pass', () => {
  const NEVER_COMPUTED: GateId[] = ['G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'];

  it('GIVEN clean run WHEN runEval THEN G2..G8 отсутствуют — never green-without-data', async () => {
    const firstPass = [doneResult(MR_A, { baseSha: 'sha-a', replyBody: 'ok' })];
    const input: RunEvalInput = { mrs: [MR_A], dryRun: true };
    const { report } = await runEval(input, baseDeps(mockRunMrsOnce(firstPass)));

    const gateIds = new Set(report.gates.map((g) => g.gate));
    for (const gate of NEVER_COMPUTED) {
      assert.ok(
        !gateIds.has(gate),
        `${gate} must never be emitted — run-mode does not yet expose the data it needs`
      );
    }
  });

  it('GIVEN red run (oversized body) WHEN runEval THEN G2..G8 всё ещё отсутствуют, а не «зелёные без данных»', async () => {
    const firstPass = [doneResult(MR_A, { baseSha: 'sha-a', replyBody: 'x'.repeat(9000) })];
    const input: RunEvalInput = { mrs: [MR_A], dryRun: true };
    const { report } = await runEval(input, baseDeps(mockRunMrsOnce(firstPass)));

    const gateIds = new Set(report.gates.map((g) => g.gate));
    for (const gate of NEVER_COMPUTED) {
      assert.ok(!gateIds.has(gate));
    }
  });
});
