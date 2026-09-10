// @file: Deterministic assertion API for flow-eval trajectories — the fluent matcher surface used ONLY
//   by `*.trajectory.test.ts`. Lives under __tests__/ (test territory) on purpose: these matchers are
//   test scaffolding, not production code, so they belong here and not in the emitted-at-runtime
//   `../trajectory.ts` (which keeps only what the cli/harness actually runs). A run is recorded as a
//   normalized event list (tool calls + checkpoint verdicts); a test loads it here and asserts path
//   properties (checkpoint order/greenness, tool budgets, allow/deny windows, forbidden actions).
// @consumers: ai/flow-eval/__tests__/*.trajectory.test.ts
// @tasks: N/A

import type { ToolEvent, CheckpointEvent, TrajectoryEvent, Trajectory } from '../trajectory.ts';

/** @purpose Assertion failure with a stable prefix so `node:test` output points straight at the trajectory rule that broke. */
export class TrajectoryError extends Error {
  constructor(message: string) {
    super(`[trajectory] ${message}`);
    this.name = 'TrajectoryError';
  }
}

const isTool = (e: TrajectoryEvent): e is ToolEvent => e.type === 'tool';
const isCheckpoint = (e: TrajectoryEvent): e is CheckpointEvent => e.type === 'checkpoint';

/** @purpose Assertions over the events strictly BETWEEN two checkpoints — the "path" the agent took to get from one to the next. */
class BetweenView {
  constructor(
    private readonly slice: ToolEvent[],
    private readonly label: string
  ) {}

  /** @purpose At most `n` tool calls happened in this window (a budget). */
  maxTools(n: number): this {
    if (this.slice.length > n) {
      throw new TrajectoryError(`${this.label}: ${this.slice.length} tool calls, expected ≤ ${n}.`);
    }
    return this;
  }

  /** @purpose Every tool used in this window is on the allowlist. */
  onlyTools(allow: string[]): this {
    const set = new Set(allow);
    const bad = [...new Set(this.slice.filter((e) => !set.has(e.tool)).map((e) => e.tool))];
    if (bad.length > 0) {
      throw new TrajectoryError(
        `${this.label}: tool(s) [${bad.join(', ')}] not in allowlist [${allow.join(', ')}].`
      );
    }
    return this;
  }

  /** @purpose None of the denied tools appear in this window. */
  denyTools(deny: string[]): this {
    const set = new Set(deny);
    const hit = [...new Set(this.slice.filter((e) => set.has(e.tool)).map((e) => e.tool))];
    if (hit.length > 0) {
      throw new TrajectoryError(`${this.label}: forbidden tool(s) [${hit.join(', ')}] used.`);
    }
    return this;
  }
}

/** @purpose Assertions over the ordered checkpoint sub-sequence. */
class CheckpointView {
  constructor(private readonly checkpoints: CheckpointEvent[]) {}

  /** @purpose The checkpoints occurred in exactly this order (by id). */
  order(ids: string[]): this {
    const actual = this.checkpoints.map((c) => c.id);
    if (actual.length !== ids.length || actual.some((id, k) => id !== ids[k])) {
      throw new TrajectoryError(
        `checkpoint order [${actual.join(' → ')}] ≠ expected [${ids.join(' → ')}].`
      );
    }
    return this;
  }

  /** @purpose Every checkpoint passed (exit 0). */
  allGreen(): this {
    const red = this.checkpoints.filter((c) => !c.green).map((c) => `${c.id}(exit ${c.exit})`);
    if (red.length > 0) throw new TrajectoryError(`red checkpoint(s): ${red.join(', ')}.`);
    return this;
  }

  /** @purpose A specific checkpoint passed. */
  green(id: string): this {
    const c = this.checkpoints.find((x) => x.id === id);
    if (!c) throw new TrajectoryError(`checkpoint '${id}' never reached.`);
    if (!c.green) throw new TrajectoryError(`checkpoint '${id}' is red (exit ${c.exit}).`);
    return this;
  }
}

/** @purpose Fluent, deterministic view over one run's trajectory. Every matcher throws `TrajectoryError` on failure (so it composes with node:test) and returns for chaining; `.events` stays public for custom asserts. */
export class TrajectoryView {
  readonly scenario: string;
  readonly events: TrajectoryEvent[];

  constructor(t: Trajectory) {
    this.scenario = t.scenario;
    this.events = t.events;
  }

  /** @purpose The ordered checkpoint sub-view. */
  checkpoints(): CheckpointView {
    return new CheckpointView(this.events.filter(isCheckpoint));
  }

  /** @purpose Tool events strictly between the first occurrence of two checkpoints. */
  between(fromId: string, toId: string): BetweenView {
    const from = this.events.find((e) => isCheckpoint(e) && e.id === fromId);
    const to = this.events.find((e) => isCheckpoint(e) && e.id === toId);
    if (!from) throw new TrajectoryError(`between(): checkpoint '${fromId}' not found.`);
    if (!to) throw new TrajectoryError(`between(): checkpoint '${toId}' not found.`);
    if (from.i >= to.i)
      throw new TrajectoryError(
        `between(): '${fromId}' (#${from.i}) is not before '${toId}' (#${to.i}).`
      );
    const slice = this.events.filter(
      (e): e is ToolEvent => isTool(e) && e.i > from.i && e.i < to.i
    );
    return new BetweenView(slice, `between ${fromId}→${toId}`);
  }

  /** @purpose No event in the whole run matches the predicate (a global forbidden action). */
  never(pred: (e: TrajectoryEvent) => boolean, label = 'predicate'): this {
    const hit = this.events.find(pred);
    if (hit)
      throw new TrajectoryError(
        `forbidden event (${label}) occurred at #${hit.i}: ${JSON.stringify(hit)}.`
      );
    return this;
  }

  /** @purpose At MOST `n` events in the whole run match the predicate (a budget on a behaviour, e.g. format-archaeology greps). */
  atMost(n: number, pred: (e: TrajectoryEvent) => boolean, label = 'matching events'): this {
    const hits = this.events.filter(pred).length;
    if (hits > n) throw new TrajectoryError(`${label}: ${hits} events, expected ≤ ${n}.`);
    return this;
  }
}

/** @purpose Load a trajectory (from a parsed object or a JSON string) into an assertable view. Kept transport-agnostic so tests can feed a fixture or a real `trajectory.json`. */
export function loadTrajectory(source: Trajectory | string): TrajectoryView {
  const t: Trajectory = typeof source === 'string' ? (JSON.parse(source) as Trajectory) : source;
  if (!t || !Array.isArray(t.events))
    throw new TrajectoryError('invalid trajectory: missing events[].');
  return new TrajectoryView(t);
}
