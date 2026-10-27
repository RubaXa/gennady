// @file: Reviewed hold continuation preserves all seven spent attempts and cannot enlarge the remaining budget.
// @spec: AI-SKILLS
// @consumers: execution-hold-continuation regression suite

import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test, type TestContext } from 'node:test';
import { EXECUTION_AUTONOMY_CASE_IDS } from '../execution-autonomy-cases.ts';
import { readExecutionHoldContinuation } from '../execution-hold-continuation.ts';
import type { ExecutionCampaignEntry } from '../execution-campaign-continuation.ts';

const repo = resolve(import.meta.dirname, '../../..');
const original = 'ai/flow-eval/results/2026-10-26-execution-autonomy-live';
const continued = 'ai/flow-eval/results/2026-10-26-execution-autonomy-continued';
const qualified = 'ai/flow-eval/results/2026-10-27-execution-autonomy-routing-qualification.json';
const paths = [
  ...[
    'protocol.json',
    'cleanup-recovery.json',
    'stand-invalidation.json',
    'records/0.json',
    'records/1.json',
  ].map((p) => `${original}/${p}`),
  ...[
    'protocol.json',
    'cleanup.json',
    'hold-decision.json',
    ...Array.from({ length: 5 }, (_, i) => `records/${i}.json`),
  ].map((p) => `${continued}/${p}`),
  qualified,
];
const schedule: ExecutionCampaignEntry[] = EXECUTION_AUTONOMY_CASE_IDS.flatMap((caseId, i) =>
  (i % 2 ? (['candidate', 'baseline'] as const) : (['baseline', 'candidate'] as const)).map(
    (arm) => ({ caseId, arm })
  )
);

/** @purpose Copy only public evidence into an isolated mutation fixture; never change recorded campaign bytes.
 * @param context Test-owned cleanup hook.
 * @returns Reader and exact copied paths for causal negative controls.
 */
function fixture(context: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'gennady-hold-resume-test-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(repo, path), join(root, path));
  }
  return {
    root,
    read: () => readExecutionHoldContinuation(root, schedule),
    change: (path: string, mutate: (value: any) => void) => {
      const value = JSON.parse(readFileSync(join(root, path), 'utf8'));
      mutate(value);
      writeFileSync(join(root, path), JSON.stringify(value));
    },
  };
}

test('seven spent positions leave nine, four comparable pairs and an explicitly unpaired EX4 diagnostic', (t) => {
  const f = fixture(t);
  const before = paths.map((p) => readFileSync(join(f.root, p), 'utf8'));
  const result = f.read();
  assert.equal(result.spent, 7);
  assert.deepEqual(result.remaining, schedule.slice(7));
  assert.equal(result.remaining.length, 9);
  assert.deepEqual(result.provenance.unpairedDiagnostic, {
    caseId: 'ex4-decision',
    arm: 'baseline',
  });
  assert.equal(result.provenance.comparablePairCaseIds.length, 4);
  assert.equal(result.provenance.replacementAttempts, 0);
  assert.match(result.provenance.limitation, /never pool old seven/);
  assert.equal(result.commits.candidate, '6a91aeec357ef10dff23f6f0f19f99b8c365e059');
  assert.deepEqual(
    paths.map((p) => readFileSync(join(f.root, p), 'utf8')),
    before
  );
});

const mutations: Array<[string, string, (value: any) => void]> = [
  [
    'a changed model',
    qualified,
    (v) => {
      v.model = 'different-model';
    },
  ],
  [
    'a red initial map',
    qualified,
    (v) => {
      v.controls[0].initialRouting.taskPickable = false;
    },
  ],
  [
    'qualification not terminal',
    qualified,
    (v) => {
      v.status = 'running';
    },
  ],
  [
    'a missing control',
    qualified,
    (v) => {
      v.controls.pop();
    },
  ],
  [
    'a failed real full gate',
    qualified,
    (v) => {
      v.controls[0].fullVerificationPass = false;
    },
  ],
  [
    'a missing cleanup',
    qualified,
    (v) => {
      v.controls[0].cleanup = false;
    },
  ],
  [
    'changed baseline backport',
    qualified,
    (v) => {
      v.runtimeIdentities.baseline.sourcePatch += '\n';
    },
  ],
  [
    'changed candidate source',
    qualified,
    (v) => {
      v.runtimeIdentities.candidate.baseCommit = 'different';
    },
  ],
  [
    'inconsistent runtime bytes',
    qualified,
    (v) => {
      v.runtimeIdentities.baseline.files[0].sha256 = 'different';
    },
  ],
  [
    'unsafe prior writer cleanup',
    `${continued}/cleanup.json`,
    (v) => {
      v.safeCleanup = false;
    },
  ],
  [
    'rewritten spent count',
    `${continued}/hold-decision.json`,
    (v) => {
      v.totalSpent = 6;
    },
  ],
  [
    'attempt moved to another position',
    `${continued}/records/2.json`,
    (v) => {
      v.originalIndex = 1;
    },
  ],
  [
    'old continuation order changed',
    `${continued}/protocol.json`,
    (v) => {
      v.schedule.reverse();
    },
  ],
];
for (const [name, path, mutate] of mutations)
  test(`hold resume rejects ${name}`, (t) => {
    const f = fixture(t);
    f.change(path, mutate);
    assert.throws(f.read);
  });

test('a hidden extra started attempt cannot be relabelled as unspent', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, continued, 'records/5.json'), JSON.stringify(schedule[7]));
  assert.throws(f.read, /gaps, additions or renamed/);
});

test('an odd seven-record boundary is supported only by the explicit reviewed hold reader', (t) => {
  const f = fixture(t);
  rmSync(join(f.root, continued, 'records/4.json'));
  assert.throws(f.read, /gaps, additions or renamed/);
});

test('an already reserved final output closes the hold reader, never authorizing nine more', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'ai/flow-eval/results/2026-10-27-execution-autonomy-final'));
  assert.throws(f.read, /already reserved\/consumed/);
});

test('the dated controller refuses every new live mode after the final stage, before allocation or model calls', () => {
  const out = `ai/flow-eval/results/forbidden-extra-ea3-${process.pid}`;
  assert.equal(existsSync(join(repo, out)), false);
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'ai/flow-eval/scripts/execution-autonomy-live.ts', '--live', out],
    { cwd: repo, encoding: 'utf8', timeout: 10000 }
  );
  assert.equal(child.status, 1, child.stderr);
  assert.match(child.stderr, /finite live budget is already reserved\/consumed/);
  assert.equal(existsSync(join(repo, out)), false);
});
