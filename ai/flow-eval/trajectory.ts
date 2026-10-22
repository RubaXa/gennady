// @file: Trajectory model + emission glue for flow-eval. A run is recorded as a normalized, ordered
//   event list (tool calls + checkpoint evaluations) in `trajectory.json`. This module holds ONLY what
//   the cli/harness runs at emit time (types + the three pure builders); the fluent assertion matchers a
//   `*.trajectory.test.ts` uses live in `__tests__/trajectory-assert.ts` (test territory), so production
//   carries no test-only surface.
// @spec: AI-SKILLS
// @consumers: cli (emits trajectory.json); __tests__/trajectory-assert.ts (re-exports types to matchers)

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
  messageId?: string;
  callId?: string;
  status?: string;
  sessionId?: string;
  parentSessionId?: string;
  command?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  exitCode?: number;
  diagnostic?: string;
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
  diagnostic?: string;
};

export type TrajectoryEvent = ToolEvent | CheckpointEvent;

export type Trajectory = {
  scenario: string;
  events: TrajectoryEvent[];
  /** Collection coverage, not an inferred promise from a bounded observer tail. */
  coverage?: { complete: boolean; sessions: number; reasons: string[] };
};

/** @purpose Scenario-owned behavioural constraints; required/order entries are direct CLI verbs,
 * forbidden entries are literal command substrings. An invocation proves an attempt, not exit zero. */
export type TrajectoryRules = {
  requiredCommands?: readonly string[];
  forbiddenCommands?: readonly string[];
  maxTools?: number;
  /** @purpose Observed completion-to-start ordering; terminal checkpoints cannot prove this. */
  commandOrder?: readonly string[];
};

function invokesCommand(event: ToolEvent, name: string): boolean {
  if (
    event.tool !== 'bash' ||
    !event.command ||
    !['completed', 'error'].includes(event.status ?? '')
  )
    return false;
  if (/(?:^|\s)(?:--help|--version|-h|-v)(?:\s|$)/.test(event.command)) return false;
  const verb = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Deliberately accept direct CLI invocations only, not prose/echo/heredoc mentions.
  const runner =
    '(?:npx\\s+(?:--[\\w-]+\\s+)*(?:gennady|tsx\\s+\\S*gennady\\.ts)|node\\s+(?:--import[=\\s]+tsx\\s+)?\\S*gennady\\.(?:ts|js)|tsx\\s+\\S*gennady\\.ts|(?:[\\w./-]+/)?gennady)';
  return new RegExp(`^\\s*${runner}\\s+${verb}(?:\\s|$)`).test(event.command);
}

/** @purpose Grade a freshly captured path independently of the judge and agent self-report. */
export function gradeTrajectory(
  trajectory: Trajectory,
  rules: TrajectoryRules = {}
): { rule: string; pass: boolean; detail: string } {
  const failures: string[] = [];
  if (trajectory.coverage?.complete !== true) failures.push('missing or incomplete trace');
  const tools = trajectory.events.filter((event): event is ToolEvent => event.type === 'tool');
  if (tools.length === 0) failures.push('no observed tool actions');
  if (tools.some((event) => !event.callId || event.callId === 'unknown' || !event.messageId))
    failures.push('missing tool action identity');
  if (tools.some((event) => !['completed', 'error'].includes(event.status ?? '')))
    failures.push('nonterminal tool actions');
  for (const required of rules.requiredCommands ?? [])
    if (!tools.some((event) => invokesCommand(event, required)))
      failures.push(`required command not observed: ${required}`);
  for (const forbidden of rules.forbiddenCommands ?? [])
    if (tools.some((event) => (event.command ?? '').includes(forbidden)))
      failures.push(`forbidden command observed: ${forbidden}`);
  let previousEnd = -Infinity;
  const orderedCalls = new Set<string>();
  for (const name of rules.commandOrder ?? []) {
    const match = tools.find(
      (event) =>
        invokesCommand(event, name) &&
        !orderedCalls.has(`${event.messageId}:${event.callId}`) &&
        typeof event.startedAt === 'number' &&
        Number.isFinite(event.startedAt) &&
        typeof event.finishedAt === 'number' &&
        Number.isFinite(event.finishedAt) &&
        event.finishedAt >= event.startedAt &&
        event.startedAt >= previousEnd
    );
    if (!match) {
      failures.push(`command order not proven at: ${name}`);
      break;
    }
    orderedCalls.add(`${match.messageId}:${match.callId}`);
    previousEnd = match.finishedAt!;
  }
  if (rules.maxTools !== undefined && tools.length > rules.maxTools)
    failures.push(`tool budget exceeded: ${tools.length} > ${rules.maxTools}`);
  for (const event of trajectory.events)
    if (event.type === 'checkpoint' && !event.green)
      failures.push(`terminal checkpoint failed: ${event.id} (${event.exit})`);
  return {
    rule: 'TRAJECTORY',
    pass: failures.length === 0,
    detail: failures.length ? failures.join('; ') : `${tools.length} tools; complete capture`,
  };
}

/** @purpose A deterministic checkpoint to evaluate against the sandbox: a stable id and the exact command whose exit code is the verdict. */
export type CheckpointSpec = { id: string; cmd: string };

/** @purpose The outcome of one checkpoint evaluation, plus the moment it was taken. */
export type CheckpointResult = {
  id: string;
  cmd: string;
  exit: number;
  green: boolean;
  diagnostic?: string;
  t?: number;
};

/** @purpose Runs a command and reports only its exit code — the sole signal a checkpoint needs. */
export type Exec = (cmd: string) => { exit: number; diagnostic?: string };

/** @purpose Normalize the harness's bounded tail entries into a flat, ordered tool-event list (one per tool call), dropping OpenCode-specific shape. | @param entries Session tail entries (assistant messages with toolCalls). | @returns ToolEvent[] in call order. */
export function toolEventsFrom(entries: readonly SddEvalTailEntry[]): ToolEvent[] {
  const out: ToolEvent[] = [];
  for (const e of entries) {
    for (const c of e.toolCalls) {
      out.push({
        type: 'tool',
        i: 0,
        t: c.startedAt ?? e.createdAt,
        tool: c.tool,
        arg: c.inputSummary,
        messageId: e.messageId,
        callId: c.callId,
        status: c.status,
        sessionId: e.sessionId,
        parentSessionId: e.parentSessionId,
        command: c.command,
        startedAt: c.startedAt,
        finishedAt: c.finishedAt,
        error: c.error,
        exitCode: c.exitCode,
        diagnostic: c.diagnostic,
      });
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
    const { exit, diagnostic } = exec(s.cmd);
    return {
      id: s.id,
      cmd: s.cmd,
      exit,
      green: exit === 0,
      t,
      ...(diagnostic ? { diagnostic } : {}),
    };
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
        ...(c.diagnostic ? { diagnostic: c.diagnostic } : {}),
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
