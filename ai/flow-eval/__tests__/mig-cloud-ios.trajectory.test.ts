// @file: The migration eval's trajectory spec — the deterministic path rules a correct v1→v2 migration
//   run must satisfy, asserted over a trajectory.json. Proven both ways here with fixtures; the live
//   harness produces the real trajectory.json and the SAME `assertMigrationTrajectory` runs over it.
// @consumers: N/A (test); assertMigrationTrajectory is the rule set the live run reuses.
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTrajectory, TrajectoryError, type TrajectoryView } from './trajectory-assert.ts';
import type { Trajectory, CheckpointSpec } from '../trajectory.ts';

/**
 * @purpose The checkpoints of a migration run — each a deterministic command whose exit code is the
 * verdict (run against the sandbox; `<ticket>` filled per scenario). This is the data the harness
 * evaluates to emit checkpoint events. | Order matters: it is the expected trajectory.
 */
export const MIG_CHECKPOINTS: CheckpointSpec[] = [
  { id: 'plan-built', cmd: 'test -d specs-migration-plan' },
  { id: 'plan-verified', cmd: 'gennady sdd-migrate plan --verify .' },
  { id: 'specs-clean', cmd: 'gennady sdd-check --all .' },
  { id: 'done', cmd: 'gennady sdd-state --ticket <ticket>' },
];

/** @purpose The migration path rules, as one reusable assertion. Throws `TrajectoryError` on the first violated rule. | @param t The run's trajectory view. */
export function assertMigrationTrajectory(t: TrajectoryView): void {
  // 1. The four checkpoints happened in order and all passed (plan built → plan fully mapped →
  //    specs structurally clean incl. no Critic Rounds → ticket done).
  t.checkpoints().order(['plan-built', 'plan-verified', 'specs-clean', 'done']).allGreen();

  // 2. Migration is hand-editing specs/plan units + running gennady — read/edit/run only, no wholesale
  //    file generation, on the way from a mapped plan to clean specs.
  t.between('plan-verified', 'specs-clean').onlyTools(['read', 'edit', 'bash', 'grep', 'glob']);

  // 3. The golden reference artifacts are never touched by the worker.
  t.never((e) => e.type === 'tool' && /(?:^|\s)rm\s|golden\//.test(e.arg ?? ''), 'touch/rm golden');
}

// ── Fixtures: a correct run and crafted bad runs ──

const cleanRun: Trajectory = {
  scenario: 'MIG-cloud-ios-infra',
  events: [
    { type: 'tool', i: 0, t: 100, tool: 'read', arg: 'specs/infra-base/infra-base.spec.md' },
    { type: 'tool', i: 1, t: 110, tool: 'bash', arg: 'gennady sdd-migrate plan' },
    {
      type: 'checkpoint',
      i: 2,
      t: 115,
      id: 'plan-built',
      cmd: 'test -d specs-migration-plan',
      exit: 0,
      green: true,
    },
    { type: 'tool', i: 3, t: 130, tool: 'edit', arg: 'specs-migration-plan/infra-base.unit.md' },
    {
      type: 'checkpoint',
      i: 4,
      t: 135,
      id: 'plan-verified',
      cmd: 'gennady sdd-migrate plan --verify .',
      exit: 0,
      green: true,
    },
    { type: 'tool', i: 5, t: 150, tool: 'edit', arg: 'specs/infra-base/infra-base.spec.md' }, // dropped Critic Rounds
    {
      type: 'checkpoint',
      i: 6,
      t: 160,
      id: 'specs-clean',
      cmd: 'gennady sdd-check --all .',
      exit: 0,
      green: true,
    },
    {
      type: 'checkpoint',
      i: 7,
      t: 170,
      id: 'done',
      cmd: 'gennady sdd-state --ticket IB-1',
      exit: 0,
      green: true,
    },
  ],
};

const clone = (t: Trajectory): Trajectory => JSON.parse(JSON.stringify(t)) as Trajectory;

describe('migration trajectory', () => {
  it('a correct migration run satisfies every path rule', () => {
    assertMigrationTrajectory(loadTrajectory(cleanRun));
  });

  it('rejects a run that left a Critic Rounds section (specs-clean checkpoint red)', () => {
    const bad = clone(cleanRun);
    const cp = bad.events[6] as { exit: number; green: boolean };
    cp.exit = 1; // sdd-check → SDD_SPEC_HAS_CRITIC_ROUNDS
    cp.green = false;
    assert.throws(() => assertMigrationTrajectory(loadTrajectory(bad)), TrajectoryError);
  });

  it('rejects a run that touched the golden reference', () => {
    const bad = clone(cleanRun);
    bad.events.push({
      type: 'tool',
      i: 8,
      t: 165,
      tool: 'bash',
      arg: 'cat golden/infra-base.spec.md',
    });
    assert.throws(() => assertMigrationTrajectory(loadTrajectory(bad)), /touch\/rm golden/);
  });

  it('rejects a run that generated files wholesale between plan-verified and specs-clean', () => {
    const bad = clone(cleanRun);
    bad.events.splice(5, 0, {
      type: 'tool',
      i: 5,
      t: 145,
      tool: 'write',
      arg: 'specs/new.spec.md',
    });
    bad.events.forEach((e, k) => (e.i = k));
    assert.throws(() => assertMigrationTrajectory(loadTrajectory(bad)), /not in allowlist/);
  });
});
