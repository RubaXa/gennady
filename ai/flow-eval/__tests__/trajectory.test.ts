// @file: Unit tests for the trajectory assertion helpers — a good migration path passes every matcher,
//   and each rule (checkpoint order/greenness, maxTools, allow/deny, never) fails on a crafted bad path.
// @consumers: N/A (test)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTrajectory, TrajectoryError } from './trajectory-assert.ts';
import type { Trajectory } from '../trajectory.ts';

// A clean migration run: read → plan → (checkpoint) → edit → (verify) → edit → (specs-clean) → (done).
const good: Trajectory = {
  scenario: 'MIG-demo',
  events: [
    { type: 'tool', i: 0, tool: 'read', arg: 'specs/infra-base/infra-base.spec.md' },
    { type: 'tool', i: 1, tool: 'bash', arg: 'gennady sdd-migrate plan' },
    {
      type: 'checkpoint',
      i: 2,
      id: 'plan-built',
      cmd: 'ls .../migration-plan',
      exit: 0,
      green: true,
    },
    { type: 'tool', i: 3, tool: 'edit', arg: '.../infra-base.unit.md' },
    {
      type: 'checkpoint',
      i: 4,
      id: 'plan-verified',
      cmd: 'sdd-migrate plan --verify',
      exit: 0,
      green: true,
    },
    { type: 'tool', i: 5, tool: 'edit', arg: 'specs/infra-base/infra-base.spec.md' },
    { type: 'checkpoint', i: 6, id: 'specs-clean', cmd: 'sdd-check --all', exit: 0, green: true },
    { type: 'checkpoint', i: 7, id: 'done', cmd: 'sdd-state IB-1', exit: 0, green: true },
  ],
};

const clone = (): Trajectory => JSON.parse(JSON.stringify(good)) as Trajectory;

describe('trajectory — a clean run passes every matcher', () => {
  it('order + allGreen + between budgets/allow/deny + never', () => {
    const t = loadTrajectory(good);
    t.checkpoints().order(['plan-built', 'plan-verified', 'specs-clean', 'done']).allGreen();
    t.between('plan-verified', 'specs-clean')
      .maxTools(3)
      .onlyTools(['read', 'edit', 'bash'])
      .denyTools(['write']);
    t.never((e) => e.type === 'tool' && /rm\s+.*golden/.test(e.arg ?? ''), 'delete golden');
  });
});

describe('trajectory — each rule fails on a bad path', () => {
  it('order: a missing/extra checkpoint throws', () => {
    assert.throws(
      () => loadTrajectory(good).checkpoints().order(['plan-built', 'specs-clean', 'done']),
      TrajectoryError
    );
  });

  it('allGreen: a red checkpoint (agent left Critic Rounds → sdd-check exit 1) throws', () => {
    const bad = clone();
    (bad.events[6] as { exit: number; green: boolean }).exit = 1;
    (bad.events[6] as { exit: number; green: boolean }).green = false;
    assert.throws(() => loadTrajectory(bad).checkpoints().allGreen(), /specs-clean\(exit 1\)/);
  });

  it('maxTools: too many tool calls between checkpoints throws', () => {
    const bad = clone();
    bad.events.splice(5, 0, { type: 'tool', i: 5, tool: 'bash', arg: 'noise' });
    bad.events.forEach((e, k) => (e.i = k)); // renumber
    assert.throws(
      () => loadTrajectory(bad).between('plan-verified', 'specs-clean').maxTools(1),
      /tool calls, expected ≤ 1/
    );
  });

  it('denyTools: a forbidden tool in the window throws', () => {
    const bad = clone();
    (bad.events[5] as { tool: string }).tool = 'write';
    assert.throws(
      () => loadTrajectory(bad).between('plan-verified', 'specs-clean').denyTools(['write']),
      /forbidden tool\(s\) \[write\]/
    );
  });

  it('onlyTools: a tool outside the allowlist throws', () => {
    assert.throws(
      () => loadTrajectory(good).between('plan-verified', 'specs-clean').onlyTools(['read']),
      /not in allowlist/
    );
  });

  it('never: a forbidden action anywhere throws', () => {
    const bad = clone();
    bad.events.push({ type: 'tool', i: 8, tool: 'bash', arg: 'rm -rf golden/' });
    assert.throws(
      () =>
        loadTrajectory(bad).never(
          (e) => e.type === 'tool' && /rm\s+.*golden/.test(e.arg ?? ''),
          'delete golden'
        ),
      /forbidden event \(delete golden\)/
    );
  });
});

import { toolEventsFrom, runCheckpoints, buildTrajectory, type Exec } from '../trajectory.ts';
import type { SddEvalTailEntry } from '../types.ts';

const entry = (
  createdAt: number,
  calls: Array<{ tool: string; arg?: string }>
): SddEvalTailEntry => ({
  messageId: `m${createdAt}`,
  role: 'assistant',
  createdAt,
  text: '',
  fingerprint: `f${createdAt}`,
  toolCalls: calls.map((c, k) => ({
    callId: `c${createdAt}_${k}`,
    tool: c.tool,
    status: 'completed',
    inputSummary: c.arg,
  })),
});

describe('trajectory — emission glue (harness → trajectory.json)', () => {
  it('toolEventsFrom flattens tail entries into ordered tool events', () => {
    const tools = toolEventsFrom([
      entry(100, [{ tool: 'read', arg: 'spec.md' }]),
      entry(110, [
        { tool: 'bash', arg: 'gennady sdd-migrate plan' },
        { tool: 'edit', arg: 'unit.md' },
      ]),
    ]);
    assert.equal(tools.length, 3);
    assert.deepEqual(
      tools.map((e) => e.tool),
      ['read', 'bash', 'edit']
    );
    assert.deepEqual(
      tools.map((e) => e.i),
      [0, 1, 2]
    );
    assert.equal(tools[0].t, 100);
    assert.equal(tools[2].arg, 'unit.md');
  });

  it('runCheckpoints uses the injected exec (no shelling out) and marks green by exit 0', () => {
    const exec: Exec = (cmd) => ({ exit: cmd.includes('verify') ? 1 : 0 });
    const res = runCheckpoints(
      [
        { id: 'a', cmd: 'ls' },
        { id: 'b', cmd: 'sdd-migrate plan --verify' },
      ],
      exec,
      200
    );
    assert.deepEqual(
      res.map((r) => [r.id, r.green]),
      [
        ['a', true],
        ['b', false],
      ]
    );
    assert.equal(res[0].t, 200);
  });

  it('buildTrajectory merges by time, and the built trajectory passes the matchers end-to-end', () => {
    const tools = toolEventsFrom([
      entry(100, [{ tool: 'read', arg: 'spec.md' }]),
      entry(110, [{ tool: 'bash', arg: 'gennady sdd-migrate plan' }]),
      entry(130, [{ tool: 'edit', arg: 'unit.md' }]),
      entry(150, [{ tool: 'edit', arg: 'spec.md' }]),
    ]);
    const checkpoints = [
      { id: 'plan-built', cmd: 'ls', exit: 0, green: true, t: 115 },
      { id: 'plan-verified', cmd: 'verify', exit: 0, green: true, t: 135 },
      { id: 'specs-clean', cmd: 'sdd-check', exit: 0, green: true, t: 160 },
      { id: 'done', cmd: 'state', exit: 0, green: true, t: 170 },
    ];
    const traj = buildTrajectory('MIG-demo', tools, checkpoints);
    // interleaved by time: read,bash,plan-built,edit(unit),plan-verified,edit(spec),specs-clean,done
    assert.deepEqual(
      traj.events.map((e) => (e.type === 'checkpoint' ? `#${e.id}` : e.tool)),
      ['read', 'bash', '#plan-built', 'edit', '#plan-verified', 'edit', '#specs-clean', '#done']
    );
    const t = loadTrajectory(traj);
    t.checkpoints().order(['plan-built', 'plan-verified', 'specs-clean', 'done']).allGreen();
    t.between('plan-verified', 'specs-clean').maxTools(1).onlyTools(['edit']);
  });
});
