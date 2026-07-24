// @file: PhaseTelemetry — append-only per-phase JSONL timing log + 7-day analytics rollup, so the
//   operator can read `<stateDir>/agent-inbox/telemetry/phase-timings.jsonl` (or `gennady inbox
//   stats`) to see where review time goes across MRs/nodes/models.
// @consumers: RoleInstance (_executeSession, _runLensSession), CLI `gennady inbox stats`
// @tasks: TSK-perf, TSK-153

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logger } from '#logger';
import { mrReportsDir } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

/**
 * @purpose One executed session-node timing, appended as a single flat JSON line.
 * @invariant Flat object, one per line — human/agent-readable via plain `Read`, no nesting.
 */
export type PhaseTimingEntry = {
  /** @purpose ISO timestamp when the node finished (success or terminal failure). */
  ts: string;
  /** @purpose MR web URL this timing relates to. */
  mr: string;
  /** @purpose Role active at the time (e.g. 'reviewer'). */
  role: string;
  /** @purpose Session/lens node id (artifact key), e.g. 'node_track_review'. */
  node: string;
  /** @purpose Model used for this turn, or 'default' when `policy.model` was absent. */
  model: string;
  /** @purpose Wall-clock duration of the node's execution, in ms. */
  durationMs: number;
  /** @purpose Whether the node reached an OK outcome (vs. escalated/errored). */
  ok: boolean;
  /** @purpose Classifier signal/class when `ok` is false (e.g. 'TIMEOUT', 'SCHEMA_MISMATCH'). */
  error?: string;
  /** @purpose Continue+restart attempts accumulated before this result. */
  retries: number;
  /** @purpose Fan-out node id when this timing came from a `ParallelNode` lens session. */
  parallelGroup?: string;
  /** @purpose Review round/revision number, when known. */
  revision?: number;
  /** @purpose Per-tool call-count/duration breakdown for this node's session, when available. */
  tools?: ToolStat[];
};

/** @purpose Local structural mirror of `ToolCallStat` (opencode.port.ts) — avoids a cross-module import cycle. */
export type ToolStat = {
  /** @purpose Tool name (e.g. 'bash', 'read', 'grep') */
  tool: string;
  /** @purpose Number of invocations */
  count: number;
  /** @purpose Summed duration across completed invocations, in ms */
  totalMs: number;
};

/** @purpose Retention window for phase timings — same 7-day mtime idea as gcStaleReports/gcStaleChats. */
export const PHASE_TIMINGS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @purpose Path to the append-only phase-timings JSONL file under a state dir.
 * @param stateDir Gennady state root (`~/.gennady` by default).
 * @returns Absolute path to `<stateDir>/agent-inbox/telemetry/phase-timings.jsonl`.
 */
export function phaseTimingsPath(stateDir: string): string {
  return join(stateDir, 'agent-inbox', 'telemetry', 'phase-timings.jsonl');
}

/**
 * @purpose Append one phase-timing entry as a JSON line. Best-effort: never throws into the graph.
 * @invariant Append-only — existing lines are never modified or deleted here (see
 *   `gcStalePhaseTimings` for retention).
 * @param stateDir Gennady state root.
 * @param entry Timing entry to record.
 * @returns Promise that resolves once the write attempt completes (success or logged failure).
 * @sideEffect Creates `<stateDir>/agent-inbox/telemetry/` if absent; appends one line to the file.
 */
export async function recordPhaseTiming(stateDir: string, entry: PhaseTimingEntry): Promise<void> {
  const filePath = phaseTimingsPath(stateDir);
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch (cause) {
    // failure mode: telemetry is diagnostic-only — a write failure must never interrupt the graph
    logger.warn('[PhaseTelemetry#recordPhaseTiming] [recording → failed]', {
      cause,
      node: entry.node,
      mr: entry.mr,
    });
  }
}

/** @purpose One tool call in a trace record — structural, avoids importing the opencode port type. */
export type ToolTraceCall = {
  /** @purpose 0-based position in the session's tool sequence */
  seq: number;
  /** @purpose Tool name (e.g. 'bash', 'read', 'glob') */
  tool: string;
  /** @purpose Short one-line input summary (command / path / pattern) */
  input: string;
  /** @purpose Call duration in ms, or 0 when not completed */
  ms: number;
  /** @purpose Tool state status (e.g. 'completed', 'error') */
  status: string;
  /** @purpose Byte length of the tool's raw output, when available. */
  outputBytes?: number;
  /** @purpose Newline-delimited line count of the tool's raw output, when available. */
  outputLines?: number;
  /** @purpose Error message text when status is 'error'. */
  errorSummary?: string;
};

/** @purpose One session's ordered tool-call trace, appended as a JSON line. */
export type ToolTraceRecord = {
  /** @purpose ISO timestamp shared with the phase-timing entry for this node */
  ts: string;
  /** @purpose MR web URL the session reviewed */
  mr: string;
  /** @purpose Role active at the time (e.g. 'reviewer') */
  role: string;
  /** @purpose Session/lens node id */
  node: string;
  /** @purpose Ordered tool calls made in the session */
  calls: ToolTraceCall[];
};

/**
 * @purpose Path to the ordered tool-call trace log under a state dir.
 * @param stateDir Gennady state root.
 * @returns Absolute path to `<stateDir>/agent-inbox/telemetry/tool-trace.jsonl`.
 */
export function toolTracePath(stateDir: string): string {
  return join(stateDir, 'agent-inbox', 'telemetry', 'tool-trace.jsonl');
}

/**
 * @purpose Append one session's ordered tool-call trace as a JSON line. Best-effort — never throws.
 * @param stateDir Gennady state root.
 * @param record Trace record for one session node.
 * @returns Promise resolving once the write attempt completes.
 * @sideEffect Creates the telemetry dir if absent; appends one line.
 */
export async function recordToolTrace(stateDir: string, record: ToolTraceRecord): Promise<void> {
  const filePath = toolTracePath(stateDir);
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
  } catch (cause) {
    logger.warn('[PhaseTelemetry#recordToolTrace] [recording → failed]', {
      cause,
      node: record.node,
      mr: record.mr,
    });
  }
}

/**
 * @purpose Directory of every session turn's exact prompt/response for one MR — the "X-ray" trail.
 * @param stateDir Gennady state root.
 * @param ref VCS ref (`project!iid`) the sessions belong to.
 * @returns Absolute path to `<mrReportsDir>/sessions`.
 */
export function sessionArtifactsDir(stateDir: string, ref: string): string {
  return join(mrReportsDir(stateDir, ref), 'sessions');
}

/**
 * @purpose Persist the exact system+task text sent to a session turn, before the call.
 * @param stateDir Gennady state root.
 * @param ref VCS ref (`project!iid`).
 * @param nodeId Session/lens node id (e.g. `node_track_review`).
 * @param prompt The exact `system`/`text` sent this turn.
 * @returns Absolute path of the written prompt file, or `null` on write failure (best-effort).
 * @sideEffect Writes `<sessionArtifactsDir>/<nodeId>__<ISO>.prompt.txt`; logs the path via `logger.info`.
 */
export async function recordSessionPrompt(
  stateDir: string,
  ref: string,
  nodeId: string,
  prompt: { system: string; text: string }
): Promise<string | null> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = sessionArtifactsDir(stateDir, ref);
  const filePath = join(dir, `${nodeId}__${ts}.prompt.txt`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      filePath,
      `=== SYSTEM ===\n${prompt.system}\n\n=== TASK TEXT ===\n${prompt.text}\n`,
      'utf-8'
    );
    logger.info('[PhaseTelemetry#recordSessionPrompt] [recording → saved]', {
      node: nodeId,
      filePath,
    });
    return filePath;
  } catch (cause) {
    logger.warn('[PhaseTelemetry#recordSessionPrompt] [recording → failed]', {
      cause,
      node: nodeId,
      ref,
    });
    return null;
  }
}

/**
 * @purpose Persist a session turn's raw response, paired with the prompt file that produced it.
 * @param stateDir Gennady state root.
 * @param ref VCS ref (`project!iid`).
 * @param nodeId Session/lens node id.
 * @param promptFilePath The exact prompt file this response answers (`null` if the prompt write failed).
 * @param raw Raw response payload (text, error, or whatever the adapter returned this turn).
 * @returns Absolute path of the written response file, or `null` on write failure (best-effort).
 * @sideEffect Writes `<sessionArtifactsDir>/<nodeId>__<ISO>.response.txt`; logs the path.
 */
export async function recordSessionResponse(
  stateDir: string,
  ref: string,
  nodeId: string,
  promptFilePath: string | null,
  raw: unknown
): Promise<string | null> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = sessionArtifactsDir(stateDir, ref);
  const filePath = join(dir, `${nodeId}__${ts}.response.txt`);
  const body = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      filePath,
      `=== ANSWERS PROMPT ===\n${promptFilePath ?? '(prompt write failed — see logs)'}\n\n=== RAW RESPONSE ===\n${body}\n`,
      'utf-8'
    );
    logger.info('[PhaseTelemetry#recordSessionResponse] [recording → saved]', {
      node: nodeId,
      filePath,
    });
    return filePath;
  } catch (cause) {
    logger.warn('[PhaseTelemetry#recordSessionResponse] [recording → failed]', {
      cause,
      node: nodeId,
      ref,
    });
    return null;
  }
}

/**
 * @purpose Read and parse every well-formed line of the phase-timings JSONL file.
 * @param filePath Absolute path to phase-timings.jsonl.
 * @returns Parsed entries; malformed lines are silently skipped.
 */
function readEntries(filePath: string): PhaseTimingEntry[] {
  if (!existsSync(filePath)) return [];
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (cause) {
    logger.warn('[PhaseTelemetry#readEntries] [reading → failed]', { cause, filePath });
    return [];
  }
  const entries: PhaseTimingEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as PhaseTimingEntry);
    } catch {
      // skip malformed line — one bad line never blocks the rest
    }
  }
  return entries;
}

/**
 * @purpose GC: drop phase-timing lines older than `ttlMs`, rewriting the file with survivors only.
 *   Malformed lines drop too (`gcStaleReports`'s best-effort spirit).
 * @invariant Missing file degrades to a no-op (0 removed), never an error.
 * @invariant One malformed/unparseable line never blocks pruning the rest of the file.
 * @param stateDir Gennady state root.
 * @param [ttlMs] Max age in ms before a line is stale (default 7 days).
 * @param [nowMs] Current time in ms (injected for testability).
 * @returns Count of lines removed (stale + malformed).
 * @sideEffect Rewrites `phase-timings.jsonl` in place when any line is dropped.
 */
export function gcStalePhaseTimings(
  stateDir: string,
  ttlMs: number = PHASE_TIMINGS_TTL_MS,
  nowMs: number = Date.now()
): number {
  const filePath = phaseTimingsPath(stateDir);
  if (!existsSync(filePath)) return 0;

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (cause) {
    logger.warn('[PhaseTelemetry#gcStalePhaseTimings] [gc → read_failed]', { cause, filePath });
    return 0;
  }

  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const kept: string[] = [];
  let removed = 0;

  for (const line of lines) {
    let tsMs = NaN;
    try {
      const entry = JSON.parse(line) as PhaseTimingEntry;
      tsMs = new Date(entry.ts).getTime();
    } catch {
      removed++;
      continue;
    }
    if (Number.isFinite(tsMs) && nowMs - tsMs > ttlMs) {
      removed++;
      continue;
    }
    kept.push(line);
  }

  if (removed > 0) {
    try {
      writeFileSync(filePath, kept.length > 0 ? `${kept.join('\n')}\n` : '', 'utf-8');
    } catch (cause) {
      logger.warn('[PhaseTelemetry#gcStalePhaseTimings] [gc → write_failed]', { cause, filePath });
      return 0;
    }
  }

  return removed;
}

/** @purpose Per-node latency/error rollup over the analytics window. */
export type PhaseNodeRollup = {
  /** @purpose Session/lens node id. */
  node: string;
  /** @purpose Number of executions observed in the window. */
  count: number;
  /** @purpose Median duration, ms. */
  p50: number;
  /** @purpose 95th-percentile duration, ms. */
  p95: number;
  /** @purpose Mean duration, ms. */
  avg: number;
  /** @purpose Fraction (0..1) of executions that did not reach OK. */
  errorRate: number;
  /** @purpose Per-tool call-count/duration, summed across every entry for this node, totalMs desc. */
  tools: ToolStat[];
};

/**
 * @purpose Sum per-tool stats from many entries' `tools` arrays into one aggregated, sorted list.
 * @param lists One `tools` array per entry (possibly undefined/empty).
 * @returns Aggregated stats sorted by totalMs descending.
 */
function aggregateTools(lists: (ToolStat[] | undefined)[]): ToolStat[] {
  const byTool = new Map<string, { count: number; totalMs: number }>();
  for (const list of lists) {
    for (const t of list ?? []) {
      const entry = byTool.get(t.tool) ?? { count: 0, totalMs: 0 };
      entry.count += t.count;
      entry.totalMs += t.totalMs;
      byTool.set(t.tool, entry);
    }
  }
  return [...byTool.entries()]
    .map(([tool, { count, totalMs }]) => ({ tool, count, totalMs }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

/** @purpose One reconstructed review run (contiguous burst of timings for one MR). */
export type PhaseRunRollup = {
  /** @purpose MR web URL. */
  mr: string;
  /** @purpose ISO timestamp of the run's first recorded node. */
  ts: string;
  /** @purpose Sum of durationMs across every node in the run. */
  totalDurationMs: number;
  /** @purpose Number of node executions in the run. */
  nodeCount: number;
};

/** @purpose Result of `readPhaseAnalytics` — everything needed to answer "where does review time go". */
export type PhaseAnalytics = {
  /** @purpose Size of the trailing window applied, in days. */
  windowDays: number;
  /** @purpose Total entries considered (after the window filter). */
  entryCount: number;
  /** @purpose Per-node rollup, sorted slowest-avg-first. */
  perNode: PhaseNodeRollup[];
  /** @purpose Per-run rollup (one entry per reconstructed review run), newest-first. */
  perRun: PhaseRunRollup[];
  /** @purpose Single slowest phase execution in the window, or null when there is no data. */
  slowestPhase: { node: string; mr: string; ts: string; durationMs: number } | null;
};

/**
 * @purpose Nearest-rank percentile over an ascending-sorted array (matches p50/p95 convention used
 *   elsewhere in the codebase for latency reporting).
 * @param sortedAsc Values sorted ascending.
 * @param p Percentile in [0, 1].
 * @returns The value at that percentile, or 0 for an empty array.
 */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

/** @purpose Gap threshold to split one MR's timings into separate runs — 30 minutes of silence starts a new run. */
const RUN_GAP_MS = 30 * 60 * 1000;

/**
 * @purpose Group entries by MR into contiguous runs (no gap larger than `RUN_GAP_MS` between
 *   nodes), then roll each run up to a total.
 * @param entries Entries already filtered to the analytics window.
 * @returns Runs, newest-first.
 */
function buildRuns(entries: PhaseTimingEntry[]): PhaseRunRollup[] {
  const byMr = new Map<string, PhaseTimingEntry[]>();
  for (const e of entries) {
    const list = byMr.get(e.mr) ?? [];
    list.push(e);
    byMr.set(e.mr, list);
  }

  const runs: PhaseRunRollup[] = [];
  for (const [mr, list] of byMr) {
    const sorted = [...list].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    let current: PhaseTimingEntry[] = [];
    let lastTsMs = -Infinity;

    const flush = () => {
      if (current.length === 0) return;
      runs.push({
        mr,
        ts: current[0].ts,
        totalDurationMs: current.reduce((sum, e) => sum + e.durationMs, 0),
        nodeCount: current.length,
      });
      current = [];
    };

    for (const e of sorted) {
      const tMs = new Date(e.ts).getTime();
      if (current.length > 0 && tMs - lastTsMs > RUN_GAP_MS) flush();
      current.push(e);
      lastTsMs = tMs;
    }
    flush();
  }

  return runs.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

/**
 * @purpose Read the phase-timings log and roll it up into per-node latency/error stats, per-run
 *   totals, and the slowest phase — analytics for diagnosing review perf.
 * @param stateDir Gennady state root.
 * @param [days] Trailing window size in days (default 7).
 * @param [nowMs] Current time in ms (injected for testability; mirrors `gcStalePhaseTimings`).
 * @returns Rollup; `entryCount: 0` and empty arrays when there is no (or no recent) data.
 */
export function readPhaseAnalytics(
  stateDir: string,
  days: number = 7,
  nowMs: number = Date.now()
): PhaseAnalytics {
  const filePath = phaseTimingsPath(stateDir);
  const all = readEntries(filePath);

  const cutoffMs = nowMs - days * 24 * 60 * 60 * 1000;
  const recent = all.filter((e) => {
    const tMs = new Date(e.ts).getTime();
    return Number.isFinite(tMs) && tMs >= cutoffMs;
  });

  const byNode = new Map<string, PhaseTimingEntry[]>();
  for (const e of recent) {
    const list = byNode.get(e.node) ?? [];
    list.push(e);
    byNode.set(e.node, list);
  }

  const perNode: PhaseNodeRollup[] = [...byNode.entries()]
    .map(([node, list]) => {
      const durations = list.map((e) => e.durationMs).sort((a, b) => a - b);
      const errCount = list.filter((e) => !e.ok).length;
      return {
        node,
        count: list.length,
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        errorRate: errCount / list.length,
        tools: aggregateTools(list.map((e) => e.tools)),
      };
    })
    .sort((a, b) => b.avg - a.avg);

  let slowestPhase: PhaseAnalytics['slowestPhase'] = null;
  for (const e of recent) {
    if (!slowestPhase || e.durationMs > slowestPhase.durationMs) {
      slowestPhase = { node: e.node, mr: e.mr, ts: e.ts, durationMs: e.durationMs };
    }
  }

  return {
    windowDays: days,
    entryCount: recent.length,
    perNode,
    perRun: buildRuns(recent),
    slowestPhase,
  };
}
