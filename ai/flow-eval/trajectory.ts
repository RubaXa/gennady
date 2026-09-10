// @file: Trajectory model + emission glue for flow-eval. A run is recorded as a normalized, ordered
//   event list (tool calls + checkpoint evaluations) in `trajectory.json`. This module holds ONLY what
//   the cli/harness runs at emit time (types + the three pure builders); the fluent assertion matchers a
//   `*.trajectory.test.ts` uses live in `__tests__/trajectory-assert.ts` (test territory), so production
//   carries no test-only surface.
// @consumers: cli (emits trajectory.json); __tests__/trajectory-assert.ts (re-exports types to matchers)
// @tasks: N/A

import type { SddEvalTailEntry } from './types.ts';

/** @purpose One agent action pulled from the (ephemeral) worker session — normalized so tests never depend on OpenCode internals. */
export type ToolEvent = {
  type: 'tool';
  /** 0-based position in the run. */
  i: number;
  /** Optional epoch-ms timestamp (for "when", not required for pass/fail). */
  t?: number;
  /** Tool name: 'bash' | 'read' | 'edit' | 'write' | 'grep' | 'glob' | … */
  tool: string;
  /** Short arg summary (command line, file path). */
  arg?: string;
};

/** @purpose A deterministic checkpoint: a fixed CLI command run against the sandbox with its exit code — a pure function of the files, no LLM. */
export type CheckpointEvent = {
  type: 'checkpoint';
  i: number;
  t?: number;
  /** Stable checkpoint id, e.g. 'plan-verified'. */
  id: string;
  /** The exact command that produced the verdict. */
  cmd: string;
  exit: number;
  green: boolean;
};

export type TrajectoryEvent = ToolEvent | CheckpointEvent;

export type Trajectory = {
  scenario: string;
  events: TrajectoryEvent[];
};

/** @purpose A deterministic checkpoint to evaluate against the sandbox: a stable id and the exact command whose exit code is the verdict. */
export type CheckpointSpec = { id: string; cmd: string };

/** @purpose The outcome of one checkpoint evaluation, plus the moment it was taken. */
export type CheckpointResult = {
  id: string;
  cmd: string;
  exit: number;
  green: boolean;
  t?: number;
};

/** @purpose Runs a command and reports only its exit code — the sole signal a checkpoint needs. */
export type Exec = (cmd: string) => { exit: number };

/** @purpose Normalize the harness's bounded tail entries into a flat, ordered tool-event list (one per tool call), dropping OpenCode-specific shape. | @param entries Session tail entries (assistant messages with toolCalls). | @returns ToolEvent[] in call order. */
export function toolEventsFrom(entries: readonly SddEvalTailEntry[]): ToolEvent[] {
  const out: ToolEvent[] = [];
  for (const e of entries) {
    for (const c of e.toolCalls) {
      out.push({ type: 'tool', i: 0, t: e.createdAt, tool: c.tool, arg: c.inputSummary });
    }
  }
  return out.map((e, i) => ({ ...e, i }));
}

/** @purpose Evaluate each checkpoint by running its command through the injected exec — pure w.r.t. `exec`, so tests feed a fake and never shell out. | @param specs Checkpoints to evaluate. | @param exec Command runner (returns exit code). | @param t Timestamp to stamp on the results (when they were taken). | @returns One CheckpointResult per spec. */
export function runCheckpoints(
  specs: readonly CheckpointSpec[],
  exec: Exec,
  t?: number
): CheckpointResult[] {
  return specs.map((s) => {
    const { exit } = exec(s.cmd);
    return { id: s.id, cmd: s.cmd, exit, green: exit === 0, t };
  });
}

/** @purpose Merge tool events and checkpoint results into one time-ordered event list — the durable `trajectory.json` payload. Sorted by timestamp (missing timestamps sort last, keeping input order); at equal times a tool sorts before a checkpoint. | @param scenario Scenario id. | @param tools Tool events. | @param checkpoints Checkpoint results (each stamped with the time it was taken). | @returns Trajectory with a contiguous 0-based `i`. */
export function buildTrajectory(
  scenario: string,
  tools: readonly ToolEvent[],
  checkpoints: readonly CheckpointResult[]
): Trajectory {
  const merged: TrajectoryEvent[] = [
    ...tools.map((e) => ({ ...e })),
    ...checkpoints.map(
      (c): CheckpointEvent => ({
        type: 'checkpoint',
        i: 0,
        t: c.t,
        id: c.id,
        cmd: c.cmd,
        exit: c.exit,
        green: c.green,
      })
    ),
  ];
  merged.sort((a, b) => {
    const ta = a.t ?? Number.POSITIVE_INFINITY;
    const tb = b.t ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return (a.type === 'checkpoint' ? 1 : 0) - (b.type === 'checkpoint' ? 1 : 0);
  });
  return { scenario, events: merged.map((e, i) => ({ ...e, i })) };
}
