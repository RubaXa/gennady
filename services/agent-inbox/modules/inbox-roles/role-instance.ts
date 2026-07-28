// @file: RoleInstance — executes a role graph on a single MR, tracking state, counters, and recovery.
// @consumers: RoleScheduler, RightsEscalator, inbox-api
// @tasks: TSK-113, TSK-121, TSK-124, TSK-141, TSK-142, TSK-143

import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { logger } from '#logger';
import { buildNodePrompt } from '../../../ai-kit/compile.ts';
import { mrRoot } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import type { InstanceState } from './errors.ts';
import type {
  RoleNode,
  RoleGraph,
  Edge,
  EdgeCondition,
  NodeContext,
  RoleArtifacts,
  PrepNode,
  SessionNode,
  SessionPolicy,
  GateNode,
  AskNode,
  EffectNode,
  ParallelNode,
  ParallelSessionSpec,
  ChangesetFile,
} from './role-node.ts';
import type { VcsInboxPort, MrContext, Discussion } from '../inbox-core/vcs-inbox.port.ts';
import type {
  OpenCodePort,
  PromptOpts,
  ToolCallStat,
  ToolTraceEntry,
  ToolGate,
} from '../inbox-opencode/opencode.port.ts';
import type { SessionPool } from '../inbox-opencode/session-pool.ts';
import type { OpenCodeCallResult } from '../inbox-opencode/errors.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { AuditEntry } from '../inbox-core/audit-log.ts';
import { OutcomeClassifier } from './outcome-classifier.ts';
import type { ClassifiedOutcome, RemediationAction } from './outcome-classifier.ts';
import { EffectExecutor } from './effect-executor.ts';
import type { ProposedAction } from './effect-executor.ts';
import { DebounceTracker } from './mr-watch.ts';
import {
  classifyThreadSignals,
  decideThreadAction,
  type ThreadSignalVerdict,
  type ThreadDecision,
  type MrDiffContext,
} from './thread-signal-classifier.ts';
import {
  recordPhaseTiming,
  recordToolTrace,
  recordSessionPrompt,
  recordSessionResponse,
} from './phase-telemetry.ts';
import { resolveDiskArtifact } from './disk-artifact.ts';

/**
 * @purpose Options for creating a RoleInstance.
 */
export type RoleInstanceOpts = {
  /** @purpose Unique instance identifier (role + MR key) */
  id: string;
  /** @purpose Role name */
  role: string;
  /** @purpose MR web URL */
  mr: string;
  /** @purpose The role graph to execute */
  graph: RoleGraph;
  /** @purpose OpenCode adapter for session nodes */
  opencode: OpenCodePort;
  /** @purpose VCS adapter for context fetching */
  vcs: VcsInboxPort;
  /** @purpose State store for audit logging */
  store: StateStore;
  /** @purpose Optional operational rights */
  rights?: Record<string, unknown>;
  /**
   * @purpose Resume from a persisted checkpoint (SV-13) instead of an empty graph start — already-
   *   filled tracks are not re-run after a serve restart.
   */
  checkpoint?: RoleInstanceCheckpoint;
  /** @purpose Forward to EffectExecutor at effect nodes (TSK-121 P2) | @invariant Default false — dry-run is opt-in, never a silent default */
  dryRun?: boolean;
  /**
   * @purpose Bounded pool for `ParallelNode` lens sessions (TSK-perf) — each lens gets its own
   *   session from this pool instead of sharing the instance's single `_sessionId`.
   * @invariant Optional: absent → `_executeParallel` falls back to `this._opencode` directly
   *   (unbounded concurrency, still correct, no shared cap). Production bootstrap wires a real pool (`maxSessions: 3`).
   */
  reviewSessionPool?: SessionPool;
};

/**
 * @purpose Serializable progress snapshot `RoleScheduler` persists and replays across a serve
 *   restart (SV-13). Produced by `RoleInstance.getCheckpoint()`.
 * @invariant Round-trip: replaying a checkpoint reproduces the node/counters/artifacts it was
 *   taken from. State/session id are runtime-only — a resumed instance re-enters at `idle`.
 */
export type RoleInstanceCheckpoint = {
  /** @purpose Node id to resume execution at */
  currentNode: string;
  /** @purpose Continue-attempt counter at checkpoint time */
  continueCount: number;
  /** @purpose Restart-attempt counter at checkpoint time */
  restartCount: number;
  /** @purpose Artifacts already produced by completed nodes — done tracks are not re-run */
  artifacts: RoleArtifacts;
};

/**
 * @purpose Resolve the tool gate `createSession` accepts from a node's policy (D-118..D-123).
 * @invariant `toolPolicy` takes precedence over the coarser `tools` flag and passes through as a
 *   fine-grained `ToolGate` — real per-tool enforcement (`OpenCodeReal#_composeToolsGate`).
 * @invariant No `toolPolicy` → pre-existing coarse boolean behavior unchanged.
 * @param policy The node's `SessionPolicy`.
 * @returns Coarse boolean gate, or a `ToolGate` for fine-grained per-lens allowlisting.
 */
function _resolveSessionTools(policy: SessionPolicy | undefined): boolean | ToolGate {
  if (policy?.toolPolicy) {
    const { bash, read, grep, write } = policy.toolPolicy;
    return write === undefined ? { bash, read, grep } : { bash, read, grep, write };
  }
  return policy?.tools === true;
}

/**
 * @purpose Persist a node's declared `persistResult` output — the ENGINE writes this (D-118..D-123),
 *   never the agent. Best-effort: a write failure only logs a warning.
 * @param persistResult The node's `persistResult` hook, if declared.
 * @param ctx Node context forwarded to the hook.
 * @param output The node's structured OK output.
 * @param logLabel One-line label for the warning log on failure (caller + node id).
 * @sideEffect FS: writes the hook's returned `{path, content}`, creating parent dirs as needed.
 */
function _persistNodeResult(
  persistResult:
    | ((
        ctx: NodeContext,
        output: Record<string, unknown>
      ) => { path: string; content: string } | undefined)
    | undefined,
  ctx: NodeContext,
  output: Record<string, unknown>,
  logLabel: string
): void {
  if (!persistResult) return;
  const toPersist = persistResult(ctx, output);
  if (!toPersist) return;
  try {
    mkdirSync(dirname(toPersist.path), { recursive: true });
    writeFileSync(toPersist.path, toPersist.content);
  } catch (cause) {
    logger.warn('[RoleInstance#_persistNodeResult] [writing → degraded]', {
      node: logLabel,
      path: toPersist.path,
      error: String(cause),
    });
  }
}

/**
 * @purpose Render a compact JSON example for one schema property, by type — a shape hint so the
 *   model closes its turn with parseable JSON.
 * @param prop A `resultSchema.properties[k]` descriptor (`{ type }`).
 * @returns A one-token example value (`[]`, `{}`, `"..."`, `0`, `false`, `null`).
 */
function _exampleForProp(prop: unknown): string {
  const type = (prop as { type?: string } | undefined)?.type;
  switch (type) {
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    case 'string':
      return '"..."';
    case 'number':
    case 'integer':
      return '0';
    case 'boolean':
      return 'false';
    default:
      return 'null';
  }
}

/**
 * @purpose Build the output-contract suffix appended to a node's task text — turns `resultSchema`
 *   into an explicit "end your turn with this JSON" instruction.
 * @invariant Appended to TASK TEXT, never the system directive (schema-in-system made the model
 *   hang) — item shape only, carried by the node's task text.
 * @param schema The node's `resultSchema`.
 * @returns Markdown suffix instructing the final-message JSON shape.
 */
function _outputContract(schema: unknown): string {
  const props = (schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
  const shape = Object.entries(props)
    .map(([key, prop]) => `"${key}": ${_exampleForProp(prop)}`)
    .join(', ');
  return `\n\n### Output contract\nInvestigate with the tools first. Then the FINAL message of your turn must be EXACTLY ONE fenced json code block and NOTHING after it, matching this shape:\n\`\`\`json\n{ ${shape} }\n\`\`\``;
}

/**
 * @purpose Gate ids whose PASS marks a completed synthesis — the trigger for promoting
 *   `lastReviewedHeadSha` (SV-21).
 * @invariant Owned by `reviewer.role.ts` (TSK-113); not a node-level flag — single consumer today.
 */
const SYNTHESIS_GATE_IDS = new Set(['gate_review_synthesis', 'gate_delta_synthesis']);

/**
 * @purpose Gate id whose PASS triggers SV-22 autonomous thread resolution (D-133), bypassing
 *   operator approval for rules (a)-(d); a dispute (rule e) still escalates via `node_ask`.
 * @invariant Owned by `reviewer.role.ts` (TSK-142); single consumer today.
 */
const THREAD_TRIAGE_GATE_ID = 'gate_triage';

/**
 * @purpose Artifact key `_resolveThreadTriageAutonomously` stores per-thread SV-22 signals under —
 *   read back by `_executeAsk` (a later node) to feed the SV-24 escalation gate.
 * @invariant Fixed key, not `${node.id}_...` — producer runs at `gate_triage`, consumer runs at
 *   `node_ask`; a node-id-scoped key would never be found by the reader.
 */
const THREAD_ESCALATION_SIGNALS_KEY = 'thread_triage_escalation_signals';

/**
 * @purpose SV-24 closed trigger list (D-135) — nothing outside these four ever escalates to the operator.
 */
export type EscalationTrigger =
  | 'new_findings'
  | 'dispute'
  | 'error_severity'
  | 'ambiguous_classification';

/**
 * @purpose Aggregated review-outcome facts `shouldEscalateToOperator` needs, decoupled from the raw
 *   synth/triage artifact shapes so the gate stays a pure function over primitives.
 * @invariant `findings` reuses `_extractFindings()`'s shape — no second finding-extraction path.
 */
export type ReviewOutcome = {
  /** @purpose Findings from this pass's synthesis (full or delta review) | @invariant Empty on a pure thread-triage pass (no synthesis ran this pass) */
  findings: ReadonlyArray<{ severity: string }>;
  /** @purpose Count of open threads the triage session itself could not classify unambiguously (SV-24 trigger 4) */
  ambiguousThreadCount: number;
};

/**
 * @purpose One open thread's SV-22 decision, paired with its origin thread — lets a dispute be
 *   materialized into a summary without re-deriving it.
 */
export type ThreadEscalationSignal = {
  /** @purpose SV-22 decision for this thread */
  decision: ThreadDecision;
  /** @purpose Originating discussion | @invariant Read further only when `decision.kind === 'dispute'` */
  thread: Discussion;
  /** @purpose True when the triage session's own per-thread `status` reads as inconclusive (SV-24 trigger 4) */
  ambiguous: boolean;
};

/**
 * @purpose Result of the SV-24 closed-trigger-list gate: either nothing to escalate (SV-23
 *   auto-approve applies) or exactly one named trigger fired.
 */
export type EscalationVerdict =
  | { escalate: false }
  | { escalate: true; trigger: Exclude<EscalationTrigger, 'dispute'> }
  | { escalate: true; trigger: 'dispute'; disputedThread: Discussion };

/**
 * @purpose Operator-facing dispute summary (SV-24 trigger 2) — finding, author's argument, code
 *   context, and assistant recommendation, not just a disputed flag.
 */
export type DisputeSummary = {
  /** @purpose The original finding text (thread's first note) */
  finding: string;
  /** @purpose The MR author's disagreement argument (thread's last author note) */
  authorArgument: string;
  /** @purpose A few lines of code around the thread's location, when a worktree is available | @invariant Absent when the thread is file-less or the worktree can't be read */
  codeSnippet?: string;
  /** @purpose Assistant's suggested next step for the operator */
  recommendation: string;
};

/**
 * @purpose SV-24 (D-135) gate: decides whether a pass must escalate, against a closed list of 4
 *   triggers — replaces the old unconditional escalation.
 * @invariant Check order: dispute always wins (richest content); `error_severity` and
 *   `ambiguous_classification` follow; `new_findings` (weakest signal) is checked last.
 * @param reviewOutcome Findings + ambiguous-thread count from this pass.
 * @param threadSignals Per-thread SV-22 decisions from the same pass (empty on a pure synthesis pass).
 * @returns `{escalate:false}` when the closed trigger list is empty (SV-23 auto-approve applies),
 *   otherwise the fired trigger.
 */
export function shouldEscalateToOperator(
  reviewOutcome: ReviewOutcome,
  threadSignals: ThreadEscalationSignal[]
): EscalationVerdict {
  const dispute = threadSignals.find((signal) => signal.decision.kind === 'dispute');
  if (dispute) return { escalate: true, trigger: 'dispute', disputedThread: dispute.thread };

  if (reviewOutcome.findings.some((finding) => finding.severity === 'error')) {
    return { escalate: true, trigger: 'error_severity' };
  }

  if (reviewOutcome.ambiguousThreadCount > 0) {
    return { escalate: true, trigger: 'ambiguous_classification' };
  }

  if (reviewOutcome.findings.length > 0) {
    return { escalate: true, trigger: 'new_findings' };
  }

  return { escalate: false };
}

/**
 * @purpose Executes a role graph node-by-node on a single MR.
 * @invariant Gate nodes are deterministic (no LLM). Effect nodes execute at most once
 * per successful pass (idempotency via audit marker).
 * @invariant continueCount ≤ policy.continueMax; restartCount ≤ policy.restartMax.
 * @consumer RoleScheduler
 */
export class RoleInstance {
  /** @purpose Unique instance identifier */
  readonly id: string;
  /** @purpose Role name */
  readonly role: string;
  /** @purpose MR web URL */
  readonly mr: string;
  /** @purpose The role graph to execute */
  protected _graph: RoleGraph;
  /** @purpose OpenCode adapter for session nodes */
  protected _opencode: OpenCodePort;
  /** @purpose VCS adapter */
  protected _vcs: VcsInboxPort;
  /** @purpose State store for audit */
  protected _store: StateStore;
  /** @purpose Optional operational rights */
  protected _rights: Record<string, unknown>;
  /** @purpose Current lifecycle state */
  state: InstanceState;
  /** @purpose ID of the current node in the graph */
  currentNode: string;
  /** @purpose Number of continue attempts for the current session node */
  continueCount: number;
  /** @purpose Number of restarts attempted for the current node */
  restartCount: number;
  /** @purpose Accumulated artifacts from completed nodes */
  protected _artifacts: RoleArtifacts;
  /** @purpose MR context — lazily fetched */
  protected _mrContext: MrContext | null;
  /** @purpose OpenCode session id for the current session node */
  protected _sessionId: string | null;
  /** @purpose ISO timestamp of instance creation */
  readonly createdAt: string;
  /** @purpose Outcome classifier */
  protected _classifier: OutcomeClassifier;
  /** @purpose Current ask node id when in awaiting_operator state */
  protected _askNodeId: string | null;
  /** @purpose Operator answer when exiting ask node */
  protected _answer: string | null;
  /** @purpose Forwarded to EffectExecutor at effect nodes (TSK-121 P2) */
  protected _dryRun: boolean;
  /** @purpose Bounded pool for ParallelNode lens sessions (TSK-perf) — undefined falls back to `this._opencode` directly */
  protected _reviewSessionPool?: SessionPool;

  /**
   * @purpose Create a new role instance.
   * @param opts RoleInstance options.
   */
  constructor(opts: RoleInstanceOpts) {
    this.id = opts.id;
    this.role = opts.role;
    this.mr = opts.mr;
    this._graph = opts.graph;
    this._opencode = opts.opencode;
    this._vcs = opts.vcs;
    this._store = opts.store;
    this._rights = opts.rights ?? {};
    this.state = 'idle';
    this.currentNode = opts.checkpoint?.currentNode ?? opts.graph.nodes[0]?.id ?? '';
    this.continueCount = opts.checkpoint?.continueCount ?? 0;
    this.restartCount = opts.checkpoint?.restartCount ?? 0;
    this._artifacts = opts.checkpoint ? { ...opts.checkpoint.artifacts } : {};
    this._mrContext = null;
    this._sessionId = null;
    this.createdAt = new Date().toISOString();
    this._classifier = new OutcomeClassifier();
    this._askNodeId = null;
    this._answer = null;
    this._dryRun = opts.dryRun ?? false;
    this._reviewSessionPool = opts.reviewSessionPool;
  }

  /**
   * @purpose Execute the current node, classify the outcome, and transition to the next node.
   * @returns Promise that resolves when the step completes.
   */
  async step(): Promise<void> {
    if (this.state === 'done' || this.state === 'error') return;

    // #region START_HANDLE_AWAITING_OPERATOR — advance past ask node when operator answered
    if (this.state === 'awaiting_operator') {
      if (this._answer !== null && this._askNodeId) {
        // Store answer in artifacts for downstream nodes
        this._artifacts[`${this._askNodeId}_answer`] = this._answer;

        // Follow 'answered' edge from the ask node
        const edge = this._resolveEdge(this._askNodeId, 'answered');
        if (edge) {
          this.currentNode = edge.to;
          if (edge.to === 'done') {
            this.state = 'done';
          } else {
            this.state = 'idle';
          }
          this._askNodeId = null;
          this._answer = null;
          logger.debug('[RoleInstance#step] [awaiting_operator → advancing]', {
            instance: this.id,
            nextNode: this.currentNode,
          });
        } else {
          // No 'answered' edge — treat as completed
          logger.warn('[RoleInstance#step] [awaiting_operator → no answered edge]', {
            instance: this.id,
            node: this._askNodeId,
          });
          this.state = 'done';
          this._askNodeId = null;
          this._answer = null;
        }
      }
      return;
    }
    // #endregion END_HANDLE_AWAITING_OPERATOR

    const node = this._findNode(this.currentNode);
    if (!node) {
      logger.error('[RoleInstance#step] [stepping → node_not_found]', {
        instance: this.id,
        node: this.currentNode,
      });
      this.state = 'error';
      return;
    }

    logger.debug('[RoleInstance#step] [stepping → executing]', {
      instance: this.id,
      node: node.id,
      kind: node.kind,
      continueCount: this.continueCount,
      restartCount: this.restartCount,
    });

    const ctx = await this._buildContext();

    try {
      switch (node.kind) {
        case 'prep':
          await this._executePrep(node, ctx);
          break;
        case 'session':
          await this._executeSession(node, ctx);
          break;
        case 'parallel':
          await this._executeParallel(node, ctx);
          break;
        case 'gate':
          await this._executeGate(node, ctx);
          break;
        case 'ask':
          await this._executeAsk(node, ctx);
          break;
        case 'effect':
          await this._executeEffect(node, ctx);
          break;
      }
    } catch (cause) {
      logger.error('[RoleInstance#step] [stepping → execution_error]', {
        instance: this.id,
        node: this.currentNode,
        error: cause,
      });
      // P2/S7/D9: clean up active session on error to prevent session leak
      await this._closeActiveSession();
      this.state = 'error';
    }
  }

  /**
   * @purpose Update the MR context when the MR changes externally.
   * @param mrContext Latest MR context from VCS.
   */
  onContextUpdate(mrContext: MrContext): void {
    this._mrContext = mrContext;
    logger.debug('[RoleInstance#onContextUpdate] [idle → updated]', {
      instance: this.id,
      mr: mrContext.webUrl,
    });
  }

  /**
   * @purpose Get a snapshot for dashboard rendering.
   * @returns Dashboard-friendly view of this instance.
   */
  getBoardView(): Record<string, unknown> {
    return {
      id: this.id,
      role: this.role,
      mr: this.mr,
      state: this.state,
      currentNode: this.currentNode,
      continueCount: this.continueCount,
      restartCount: this.restartCount,
      createdAt: this.createdAt,
      findings: this._extractFindings(),
      verdict: this._extractVerdict(),
    };
  }

  /**
   * @purpose Snapshot this instance's progress for persistence across a serve restart (SV-13).
   * @returns Checkpoint suitable for `RoleInstanceOpts.checkpoint` on the next construction.
   * @consumer RoleScheduler (persists to the registry; not wired in this phase — see Handoff)
   */
  getCheckpoint(): RoleInstanceCheckpoint {
    return {
      currentNode: this.currentNode,
      continueCount: this.continueCount,
      restartCount: this.restartCount,
      artifacts: { ...this._artifacts },
    };
  }

  /**
   * @purpose Store the operator's answer for the current ask node.
   * @param answer The operator's chosen answer string.
   * @consumer BoardProviderReal#executeAction
   */
  setAnswer(answer: string): void {
    this._answer = answer;
    logger.debug('[RoleInstance#setAnswer] [awaiting_operator → answered]', {
      instance: this.id,
      answer,
    });
  }

  /**
   * @purpose Get the current operator answer (if any).
   * @returns The answer string or null.
   */
  getAnswer(): string | null {
    return this._answer;
  }

  /**
   * @purpose Extract findings from any session artifact that has recommendations or findings arrays.
   * @returns Array of finding objects.
   */
  protected _extractFindings(): Array<{
    severity: string;
    file: string;
    line: number;
    message: string;
  }> {
    // UNION across ALL artifacts, not the first match (bug fixed 2026-07-23, D-139): the review
    // fan-out stores each lens under its own artifact key (node_track_review/security_lens/
    // code_review). Returning only the FIRST artifact with a `findings` array let a clean first
    // lens mask an error-severity finding a later lens raised — node_ask's SV-24 gate then saw 0
    // findings and auto-approved an MR with a real blocking issue. Collect from every artifact's
    // `findings`/`recommendations` array and dedupe by identity; over-counting only ever escalates
    // (safe), under-counting silently approved (the defect).
    const out: Array<{ severity: string; file: string; line: number; message: string }> = [];
    const seen = new Set<string>();
    const push = (r: Record<string, unknown>): void => {
      const f = {
        severity: (r.severity as string) ?? 'info',
        file: (r.file as string) ?? '',
        line: (r.line as number) ?? 0,
        message: (r.message as string) ?? '',
      };
      const key = `${f.severity}|${f.file}|${f.line}|${f.message}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(f);
    };

    for (const artifact of Object.values(this._artifacts)) {
      const obj = artifact as Record<string, unknown> | undefined;
      if (!obj || typeof obj !== 'object') continue;
      const recs = obj.recommendations as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(recs)) for (const r of recs) push(r);
      const findings = obj.findings as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(findings)) for (const f of findings) push(f);
    }
    return out;
  }

  /**
   * @purpose Extract verdict from accumulated artifacts.
   * Iterates ALL artifacts (not hardcoded node IDs) — any node that
   * produces a `reviewReport.verdict` or `verdict` field contributes.
   * @returns Verdict string.
   */
  protected _extractVerdict(): string {
    for (const artifact of Object.values(this._artifacts)) {
      const obj = artifact as Record<string, unknown> | undefined;
      if (!obj || typeof obj !== 'object') continue;

      // Check for reviewReport (from synthesize-like nodes)
      const report = obj.reviewReport as Record<string, unknown> | undefined;
      if (report && typeof report.verdict === 'string') return report.verdict;

      // Check for direct verdict field
      if (typeof obj.verdict === 'string') return obj.verdict;
    }
    return this.state === 'done' ? 'completed' : 'pending';
  }

  // ─── Private: Node execution ─────────────────────────────────────────────────

  /**
   * @purpose Execute a deterministic prep node — no LLM, no VCS mutation. Merges its artifacts
   * and follows the edge matching the branch it selected.
   * @invariant Prep is deterministic (no LLM) — failures here are programming errors, not
   *   recoverable outcomes; there is no recovery ladder for prep (unlike session nodes).
   * @param node Current prep node being executed.
   * @param ctx Node context with MR data and artifacts.
   * @returns Promise that resolves when the branch transition completes.
   */
  protected async _executePrep(node: PrepNode, ctx: NodeContext): Promise<void> {
    this.state = 'running';

    const result = await node.run(ctx);
    if (result.artifacts) {
      Object.assign(this._artifacts, result.artifacts);
    }

    logger.debug('[RoleInstance#_executePrep] [executing → branched]', {
      instance: this.id,
      node: node.id,
      branch: result.branch,
    });

    const edge = this._resolveEdge(node.id, result.branch);
    if (edge) {
      this.currentNode = edge.to;
      this.state = edge.to === 'done' ? 'done' : 'idle';
    } else {
      logger.error('[RoleInstance#_executePrep] [branched → no_edge]', {
        instance: this.id,
        node: node.id,
        branch: result.branch,
      });
      this.state = 'error';
    }
  }

  /**
   * @purpose Execute a session (LLM) node and classify the outcome.
   * @param node Current session node being executed.
   * @param ctx Node context with MR data and artifacts.
   * @returns Promise that resolves when session execution completes.
   * @sideEffect Creates/uses OpenCode session; appends audit entry.
   */
  protected async _executeSession(node: SessionNode, ctx: NodeContext): Promise<void> {
    this.state = 'running';

    // TSK-perf telemetry: one PhaseTelemetry entry per executed session node (see phase-telemetry.ts).
    // `retries` captures the ladder counters as they stood entering this call — reset to 0 below on OK.
    const _telemetryStart = performance.now();
    const _telemetryRetries = this.continueCount + this.restartCount;
    const _telemetryModel = node.policy?.model ?? 'default';

    // System instruction always comes from services/ai-kit (buildNodePrompt); the node only
    // contributes the concrete task text (buildTaskText). Worktree directory prefers the real
    // checked-out worktree (context-builder.ts) over node.dir(ctx)'s never-materialized default.
    // Review/analysis nodes set policy.tools=true so the agent can read the checked-out worktree
    // (read/grep/git) — without it OpenCodeReal disables tools and the turn narrates as text
    // instead of yielding final JSON. Per-phase model (TSK-perf): absent policy.model lets the
    // adapter fall back to the server's configured default. An unmapped node id (no directive
    // registered in ai-kit's NODE_DIRECTIVE_MAP) degrades to an empty system instruction rather
    // than failing the session. The system directive carries the review METHOD; the schema is
    // appended to the task text instead (schema-in-system made the model hang), so the turn's
    // final message is parseable JSON — otherwise the agent ends on prose and retries until it
    // escalates to the operator.
    // #region START_SESSION_CALL
    const taskText = node.buildTaskText(ctx);
    const worktreePath = ctx.artifacts.worktreePath;
    // directory = MR's shared parent, not the worktree alone — injected context lives in report/ (TSK-131).
    const directory =
      typeof worktreePath === 'string' && ctx.store
        ? mrRoot(ctx.store.getStateDir(), `${ctx.mr.project}!${ctx.mr.iid}`)
        : typeof worktreePath === 'string'
          ? worktreePath
          : node.dir(ctx);

    if (!this._sessionId) {
      const handle = await this._opencode.createSession({
        title: node.id,
        directory,
        tools: _resolveSessionTools(node.policy),
        model: node.policy?.model,
      });
      this._sessionId = handle.sid;
    }

    let system: string;
    try {
      system = await buildNodePrompt(node.id, ctx);
    } catch {
      logger.debug('[RoleInstance#_executeSession] [buildNodePrompt → unmapped node]', {
        instance: this.id,
        node: node.id,
      });
      system = '';
    }

    const promptOpts: PromptOpts = {
      system,
      text: node.resultSchema ? `${taskText}${_outputContract(node.resultSchema)}` : taskText,
    };

    if (node.resultSchema) {
      promptOpts.format = {
        type: 'json_schema',
        schema: node.resultSchema,
      };
    }

    if (node.policy?.promptTimeout) {
      promptOpts.timeout = node.policy.promptTimeout;
    }

    if (node.policy?.model) {
      promptOpts.model = node.policy.model;
    }

    // X-ray artifact (D-125): persist the exact prompt/response of this turn so the operator can
    // open the MR's report dir and see precisely what was sent/received, not a reconstruction.
    const _xrayRef = `${ctx.mr.project}!${ctx.mr.iid}`;
    const _xrayPromptPath = await recordSessionPrompt(
      this._store.getStateDir(),
      _xrayRef,
      node.id,
      {
        system,
        text: promptOpts.text ?? '',
      }
    );

    const result: OpenCodeCallResult = await this._opencode.prompt(this._sessionId, promptOpts);
    await recordSessionResponse(
      this._store.getStateDir(),
      _xrayRef,
      node.id,
      _xrayPromptPath,
      result
    );
    // #endregion END_SESSION_CALL

    let outcome = this._classifier.classify(result);
    // TSK-127: artifact nodes never trust response text — a raw OK only means the turn finished;
    // the agent's JSON result is read + validated from disk, and a missing/invalid file is
    // reclassified into the SAME outcome vocabulary so the existing continue/restart ladder below
    // handles it unchanged (one extra `continue` turn, not a second unbounded loop).
    if (node.artifact && outcome.class === 'OK') {
      outcome = resolveDiskArtifact(directory, node.artifact);
    }
    const remediation = this._classifier.remediate(outcome);

    // Best-effort tool-call stats (TSK-perf) — must be fetched BEFORE the session closes below,
    // since closing may drop the session server-side and make the query fail.
    const _telemetryTools =
      outcome.class === 'OK' && this._sessionId
        ? await this._opencode.toolCallStats(this._sessionId).catch(() => [])
        : [];
    const _telemetryTrace =
      outcome.class === 'OK' && this._sessionId
        ? await this._opencode.toolCallTrace(this._sessionId).catch(() => [])
        : [];

    const _telemetryTs = new Date().toISOString();
    await recordPhaseTiming(this._store.getStateDir(), {
      ts: _telemetryTs,
      mr: this.mr,
      role: this.role,
      node: node.id,
      model: _telemetryModel,
      durationMs: performance.now() - _telemetryStart,
      ok: outcome.class === 'OK',
      error: outcome.class === 'OK' ? undefined : outcome.signal,
      retries: _telemetryRetries,
      tools: _telemetryTools,
    });
    if (_telemetryTrace.length > 0) {
      await recordToolTrace(this._store.getStateDir(), {
        ts: _telemetryTs,
        mr: this.mr,
        role: this.role,
        node: node.id,
        calls: _telemetryTrace,
      }).catch(() => {});
    }

    await this._appendAudit('classified', `Session node "${node.id}" outcome: ${outcome.class}`);

    if (outcome.class === 'OK') {
      _persistNodeResult(node.persistResult, ctx, outcome.output, node.id);
      this._artifacts[node.id] = outcome.output;
      this.continueCount = 0;
      this.restartCount = 0;

      // Transition to next node
      const edge = this._resolveEdge(node.id, 'ok');
      if (edge) {
        this.currentNode = edge.to;
        if (edge.to === 'done') {
          this.state = 'done';
        } else {
          this.state = 'idle';
        }
      }

      // Close session after success
      if (this._sessionId) {
        await this._opencode.close(this._sessionId);
        this._sessionId = null;
      }
    } else {
      // Recovery ladder
      await this._applyRecovery(node, remediation, outcome);
    }
  }

  /**
   * @purpose Execute a ParallelNode's lens-sessions concurrently (TSK-perf), cutting wall-clock
   *   time vs. a linear chain — each lens gets a session since `_sessionId` backs one turn.
   * @invariant Every lens's output lands in `ctx.artifacts[spec.id]`, same keys the lenses used as
   *   standalone SessionNodes — downstream gates and synthesize nodes need no changes.
   * @invariant On any lens exhausting its recovery ladder (continueMax/restartMax), the WHOLE node
   *   escalates to `awaiting_operator` — mirrors `_applyRecovery`'s `await_operator` branch, evaluated per-lens.
   * @param node Parallel node with the lens specs to run.
   * @param ctx Node context with MR data and artifacts.
   * @returns Promise that resolves once all lenses settle and the graph transitions (or escalates).
   */
  protected async _executeParallel(node: ParallelNode, ctx: NodeContext): Promise<void> {
    this.state = 'running';

    const results = await Promise.all(
      node.sessions.map((spec) => this._runLensSession(spec, ctx, node.id))
    );

    const escalated = results.find((r) => r.escalate);
    if (escalated) {
      this.state = 'escalated';
      await this._appendAudit(
        'escalated',
        `Parallel node "${node.id}" — lens "${escalated.id}" exhausted recovery`
      );
      return;
    }

    for (const r of results) {
      this._artifacts[r.id] = r.output;
    }

    await this._appendAudit(
      'classified',
      `Parallel node "${node.id}" — ${results.length} lenses OK`
    );

    const edge = this._resolveEdge(node.id, 'ok');
    if (edge) {
      this.currentNode = edge.to;
      this.state = edge.to === 'done' ? 'done' : 'idle';
    }
  }

  /**
   * @purpose Run ONE lens-session to completion with its own local recovery ladder
   *   (`spec.policy`) — independent of the instance's shared `continueCount`/`restartCount`,
   *   meaningless across N concurrent lenses.
   * @invariant Session sourcing: `this._reviewSessionPool` when wired bounds concurrency via its
   *   FIFO queue; falls back to `this._opencode` directly when absent (still correct, unbounded).
   * @param spec Lens session spec — task text, working directory, schema, retry policy.
   * @param ctx Node context with MR data and artifacts.
   * @param parallelGroupId Fan-out node id (`ParallelNode.id`) this lens belongs to — recorded on
   *   each PhaseTelemetry entry so per-lens timings group back to their parent.
   * @returns `{ id, output }` on success, or `{ id, escalate: true }` once the ladder is exhausted.
   */
  protected async _runLensSession(
    spec: ParallelSessionSpec,
    ctx: NodeContext,
    parallelGroupId: string
  ): Promise<{ id: string; output?: unknown; escalate: boolean }> {
    const worktreePath = ctx.artifacts.worktreePath;
    // directory = MR's shared parent, not the worktree alone — injected context lives in report/ (TSK-131).
    const directory =
      typeof worktreePath === 'string' && ctx.store
        ? mrRoot(ctx.store.getStateDir(), `${ctx.mr.project}!${ctx.mr.iid}`)
        : typeof worktreePath === 'string'
          ? worktreePath
          : spec.dir(ctx);
    const taskText = spec.buildTaskText(ctx);

    // TSK-perf telemetry (phase-timings.jsonl) — one entry per lens, recorded at every exit point below.
    const _telemetryStart = performance.now();
    const _telemetryModel = spec.policy?.model ?? 'default';
    let _telemetryLastError: string | undefined;
    const _recordLensTiming = async (
      result: { id: string; output?: unknown; escalate: boolean },
      continueCount: number,
      restartCount: number,
      tools: ToolCallStat[] = [],
      trace: ToolTraceEntry[] = []
    ): Promise<{ id: string; output?: unknown; escalate: boolean }> => {
      const ts = new Date().toISOString();
      await recordPhaseTiming(this._store.getStateDir(), {
        ts,
        mr: this.mr,
        role: this.role,
        node: spec.id,
        model: _telemetryModel,
        durationMs: performance.now() - _telemetryStart,
        ok: !result.escalate,
        error: result.escalate ? _telemetryLastError : undefined,
        retries: continueCount + restartCount,
        parallelGroup: parallelGroupId,
        tools,
      });
      if (trace.length > 0) {
        await recordToolTrace(this._store.getStateDir(), {
          ts,
          mr: this.mr,
          role: this.role,
          node: spec.id,
          calls: trace,
        }).catch(() => {});
      }
      return result;
    };

    let system: string;
    try {
      system = await buildNodePrompt(spec.id, ctx);
    } catch {
      system = '';
    }

    const createOpts = {
      title: spec.id,
      directory,
      tools: _resolveSessionTools(spec.policy),
      // Per-phase model (TSK-perf) — absent → adapter omits the field, server default applies.
      model: spec.policy?.model,
    };

    const createSession = async (): Promise<string> => {
      if (this._reviewSessionPool) {
        return this._reviewSessionPool.create(createOpts);
      }
      const handle = await this._opencode.createSession(createOpts);
      return handle.sid;
    };

    const closeSession = async (sid: string): Promise<void> => {
      if (this._reviewSessionPool) {
        await this._reviewSessionPool.release(sid);
      } else {
        await this._opencode.close(sid);
      }
    };

    let sid = await createSession();

    const promptOpts: PromptOpts = {
      system,
      text: spec.resultSchema ? `${taskText}${_outputContract(spec.resultSchema)}` : taskText,
    };
    if (spec.resultSchema) {
      promptOpts.format = { type: 'json_schema', schema: spec.resultSchema };
    }
    if (spec.policy?.promptTimeout) {
      promptOpts.timeout = spec.policy.promptTimeout;
    }
    if (spec.policy?.model) {
      promptOpts.model = spec.policy.model;
    }

    // X-ray artifact (D-125): same prompt is reused across continue/restart attempts (promptOpts
    // built once above) — record it once; each attempt's response gets its own file below.
    const _xrayRef = `${ctx.mr.project}!${ctx.mr.iid}`;
    const _xrayPromptPath = await recordSessionPrompt(
      this._store.getStateDir(),
      _xrayRef,
      spec.id,
      {
        system,
        text: promptOpts.text ?? '',
      }
    );

    const max = spec.policy;
    let continueCount = 0;
    let restartCount = 0;

    for (;;) {
      const result = this._reviewSessionPool
        ? await this._reviewSessionPool.prompt(sid, promptOpts)
        : await this._opencode.prompt(sid, promptOpts);
      await recordSessionResponse(
        this._store.getStateDir(),
        _xrayRef,
        spec.id,
        _xrayPromptPath,
        result
      );

      let outcome = this._classifier.classify(result);
      // TSK-127: same disk-artifact resolution as _executeSession — a lens's raw OK is only "the
      // turn finished"; the finding set comes from the validated file, not response text.
      if (spec.artifact && outcome.class === 'OK') {
        outcome = resolveDiskArtifact(directory, spec.artifact);
      }

      if (outcome.class === 'OK') {
        _persistNodeResult(spec.persistResult, ctx, outcome.output, spec.id);
        // Best-effort tool-call stats — fetched BEFORE closeSession, since closing may drop the
        // session server-side and make the query fail.
        const tools = await this._opencode.toolCallStats(sid).catch(() => []);
        const trace = await this._opencode.toolCallTrace(sid).catch(() => []);
        await closeSession(sid);
        return _recordLensTiming(
          { id: spec.id, output: outcome.output, escalate: false },
          continueCount,
          restartCount,
          tools,
          trace
        );
      }

      _telemetryLastError = outcome.signal;
      const remediation = this._classifier.remediate(outcome);

      if (remediation.action === 'continue') {
        continueCount++;
        if (continueCount > max.continueMax) {
          continueCount = 0;
          restartCount++;
          if (restartCount > max.restartMax) {
            await closeSession(sid);
            return _recordLensTiming({ id: spec.id, escalate: true }, continueCount, restartCount);
          }
          await closeSession(sid);
          sid = await createSession();
          continue;
        }
        // continueSignal has no SessionPool-level equivalent — it targets an EXISTING session,
        // never creates one, so it does not affect the pool's slot accounting.
        await this._opencode.continueSignal(sid, {
          text: remediation.signal ?? 'Retry with the same prompt',
          model: spec.policy?.model,
        });
        continue;
      }

      if (remediation.action === 'restart') {
        restartCount++;
        if (restartCount > max.restartMax) {
          await closeSession(sid);
          return _recordLensTiming({ id: spec.id, escalate: true }, continueCount, restartCount);
        }
        await closeSession(sid);
        sid = await createSession();
        continue;
      }

      // 'await_operator' (or the unreachable 'proceed' on a non-OK outcome) — no local recovery left.
      await closeSession(sid);
      return _recordLensTiming({ id: spec.id, escalate: true }, continueCount, restartCount);
    }
  }

  /**
   * @purpose Execute a gate (deterministic) node — no LLM involved.
   * @param node Current gate node being executed.
   * @param ctx Node context with MR data and artifacts.
   * @returns Promise that resolves when gate evaluation completes.
   */
  protected async _executeGate(node: GateNode, ctx: NodeContext): Promise<void> {
    this.state = 'running';
    const result = node.verify(ctx);

    const condition: EdgeCondition = result.pass ? 'pass' : 'fail';
    const edge = this._resolveEdge(node.id, condition);

    if (result.pass) {
      this._promoteReviewedHead(node, ctx);

      // SV-22 (D-133): deterministic thread decisions (resolve/react/reply) dispatch here,
      // autonomously, ahead of the ordinary edge-follow below — a dispute is left for node_ask's
      // pre-existing operator escalation (unchanged edge), TSK-143 owns replacing it with awaitingMe.
      if (node.id === THREAD_TRIAGE_GATE_ID) {
        await this._resolveThreadTriageAutonomously(node, ctx);
      }

      // Just transition — any FS materialization a gate performs already ran inside verify()
      if (edge) {
        this.currentNode = edge.to;
        if (edge.to === 'done') {
          this.state = 'done';
        } else {
          this.state = 'idle';
        }
      }
    } else {
      logger.debug('[RoleInstance#_executeGate] [executing → failed]', {
        instance: this.id,
        node: node.id,
        reason: result.reason,
      });

      // On gate failure, go to fail edge
      if (edge) {
        this.currentNode = edge.to;
        if (edge.to === 'done') {
          this.state = 'done';
        } else {
          this.state = 'idle';
        }
      }
      // Store failure reason in artifacts for diagnostics
      this._artifacts[`${node.id}_fail_reason`] = (result as { reason: string }).reason;
    }
  }

  /**
   * @purpose Promote `lastReviewedHeadSha` to the current head once a synthesis gate passes (SV-21).
   * @invariant `promoteReviewedHeadSha` (TSK-109) only promotes an already-set `candidateHeadSha`;
   *   this method sets it first so the unchanged promotion logic has a value to act on.
   * @invariant Only `SYNTHESIS_GATE_IDS` trigger promotion; every other passing gate is a no-op.
   * @param node Gate node that just passed.
   * @param ctx Node context — needs `ctx.store` and `ctx.artifacts.headSha`.
   * @sideEffect Registry: writes `candidateHeadSha`, promotes to `lastReviewedHeadSha`, persists to disk.
   */
  protected _promoteReviewedHead(node: GateNode, ctx: NodeContext): void {
    if (!SYNTHESIS_GATE_IDS.has(node.id)) return;
    const headSha = ctx.artifacts['headSha'] as string | undefined;
    if (!headSha || !ctx.store) return;

    try {
      const registry = ctx.store.loadRegistry();
      const entry = registry.entries[this.mr];
      if (!entry) return;

      entry.candidateHeadSha = headSha;
      ctx.store.promoteReviewedHeadSha(this.mr);
      ctx.store.saveRegistry();

      logger.info('[RoleInstance#_promoteReviewedHead] [synthesis → promoted]', {
        instance: this.id,
        mr: this.mr,
        node: node.id,
        headSha,
      });
    } catch (cause) {
      logger.warn('[RoleInstance#_promoteReviewedHead] [synthesis → degraded]', {
        instance: this.id,
        mr: this.mr,
        node: node.id,
        error: String(cause),
      });
    }
  }

  /**
   * @purpose SV-22 autonomous pass (D-133): classify every open thread I own and dispatch the
   *   deterministic decision via the SAME `EffectExecutor` as `node_effect`, same dry-run mode.
   * @invariant `skip`/`dispute` add nothing to the batch — a dispute is left for the pre-existing
   *   `node_ask` escalation (TSK-143 owns a dedicated awaitingMe transition).
   * @invariant Degrades to a no-op on absent `ctx.vcs`/`ctx.store` or a classification failure —
   *   never resolves anything without a real, successful pass.
   * @param node The `gate_triage` node that just passed.
   * @param ctx Node context — reads `node_thread_triage`/`changesetFiles`/`worktreePath`.
   * @returns Promise that resolves once the pass completes (or degrades) — no data to report.
   * @sideEffect Network: `getDiscussions`/`getMyLogin` reads, then `EffectExecutor`'s
   *   react/resolve/reply calls (or their DRY-RUN journal entries).
   */
  protected async _resolveThreadTriageAutonomously(
    node: GateNode,
    ctx: NodeContext
  ): Promise<void> {
    if (!ctx.vcs || !ctx.store) return;

    const triage = ctx.artifacts['node_thread_triage'] as { threads?: unknown[] } | undefined;
    if (!triage?.threads?.length) return;

    try {
      const [discussions, myLogin] = await Promise.all([
        ctx.vcs.getDiscussions(this.mr, { my: true }),
        ctx.vcs.getMyLogin(),
      ]);

      const changesetFiles = (ctx.artifacts['changesetFiles'] as ChangesetFile[] | undefined) ?? [];
      const mrDiff: MrDiffContext = {
        changedFiles: new Set(changesetFiles.map((f) => f.path)),
        worktreePath: ctx.artifacts['worktreePath'] as string | undefined,
        authorLogin: ctx.mr.author,
      };

      const debounce = new DebounceTracker(ctx.store.getStateDir());
      const ref = `${ctx.mr.project}!${ctx.mr.iid}`;
      const quietPeriodElapsed = debounce.shouldTriggerAnalysis(ref, new Date().toISOString());

      const actions: ProposedAction[] = [];
      const threadSignals: ThreadEscalationSignal[] = [];

      // invariant: `disputed`/`ambiguous` are read from node_thread_triage's own per-thread
      // classification (matched by discussion id), never recomputed here
      for (const thread of discussions) {
        const triageEntry = triage.threads?.find(
          (t) => (t as { id?: string })?.id === thread.id
        ) as { disputed?: boolean; status?: string } | undefined;

        const verdict: ThreadSignalVerdict = {
          ...classifyThreadSignals(thread, mrDiff, myLogin),
          disputed: triageEntry?.disputed === true || triageEntry?.status === 'disagree',
          quietPeriodElapsed,
        };

        const decision = decideThreadAction(verdict);
        this._appendThreadDecisionActions(actions, thread, decision);
        threadSignals.push({
          decision,
          thread,
          ambiguous: triageEntry?.status === 'ambiguous' || triageEntry?.status === 'unclear',
        });
      }

      // SV-24 (D-135): persisted for `_executeAsk`'s escalation gate — this pass may run at
      // gate_triage, several nodes before node_ask actually reads it back.
      this._artifacts[THREAD_ESCALATION_SIGNALS_KEY] = threadSignals;

      if (actions.length > 0) {
        const executor = new EffectExecutor({
          vcs: ctx.vcs,
          store: ctx.store,
          dryRun: this._dryRun,
        });
        const result = await executor.execute(
          { mr: this.mr, role: this.role, nodeId: node.id },
          actions
        );
        this._artifacts[`${node.id}_autonomous_result`] = result;
      }
    } catch (cause) {
      logger.warn('[RoleInstance#_resolveThreadTriageAutonomously] [resolving → degraded]', {
        instance: this.id,
        node: node.id,
        error: String(cause),
      });
    }
  }

  /**
   * @purpose Translate one thread's `ThreadDecision` into the `ProposedAction`s `EffectExecutor`
   *   understands — reuses `ReactAction`/`ReplyAction`/`ResolveAction` as-is (no new effect kinds).
   * @param actions Batch accumulator — actions are pushed in dispatch order.
   * @param thread Discussion the decision was made for.
   * @param decision Outcome of `decideThreadAction` for this thread.
   */
  protected _appendThreadDecisionActions(
    actions: ProposedAction[],
    thread: Discussion,
    decision: ThreadDecision
  ): void {
    switch (decision.kind) {
      case 'resolve_silently':
        actions.push({
          type: 'reply',
          discussionId: thread.id,
          body: 'Automated check: commit + code re-read confirm this is fixed. Resolving.',
        });
        actions.push({ type: 'resolve', discussionId: thread.id, resolve: true });
        break;
      case 'react_then_resolve': {
        const lastNote = thread.notes[thread.notes.length - 1];
        if (lastNote) actions.push({ type: 'react', commentId: lastNote.id, emoji: '👍' });
        actions.push({ type: 'resolve', discussionId: thread.id, resolve: true });
        break;
      }
      case 'reply_not_done':
        actions.push({
          type: 'reply',
          discussionId: thread.id,
          body: 'Automated check: no fix found for this yet after the quiet period. Still open.',
        });
        break;
      case 'skip':
      case 'dispute':
        break;
    }
  }

  /**
   * @purpose Execute an ask node — apply the SV-24 escalation gate; auto-approve to `done` on an
   *   empty trigger list (SV-23), else pause for the operator.
   * @param node Current ask node being executed.
   * @param ctx Node context with MR data and artifacts.
   * @returns Promise that resolves when the question is posed (or the auto-approve pass completes).
   */
  protected async _executeAsk(node: AskNode, ctx: NodeContext): Promise<void> {
    const threadSignals =
      (this._artifacts[THREAD_ESCALATION_SIGNALS_KEY] as ThreadEscalationSignal[] | undefined) ??
      [];
    const reviewOutcome: ReviewOutcome = {
      findings: this._extractFindings(),
      ambiguousThreadCount: threadSignals.filter((signal) => signal.ambiguous).length,
    };
    const verdict = shouldEscalateToOperator(reviewOutcome, threadSignals);

    // #region START_AUTO_APPROVE_ON_CLARITY — SV-23/D-134: closed trigger list empty → autonomous
    // approve, bypass the operator entirely. Degrades to the ordinary ask below when vcs/store is
    // absent or the dispatch itself fails — never strands the instance without a real outcome.
    if (!verdict.escalate && (await this._dispatchAutonomousApprove(node, ctx))) {
      return;
    }
    // #endregion END_AUTO_APPROVE_ON_CLARITY

    this.state = 'awaiting_operator';
    this._askNodeId = node.id;
    this._answer = null;

    // Store the question in artifacts for dashboard display — SV-24 trigger 2 (dispute) carries a
    // summary alongside the flag, not just a bare marker.
    const question = node.question(ctx);
    this._artifacts[`${node.id}_question`] =
      verdict.escalate && verdict.trigger === 'dispute'
        ? { ...question, disputeSummary: this._buildDisputeSummary(verdict.disputedThread, ctx) }
        : question;

    // Close any active session from previous nodes — ask node has no LLM session
    await this._closeActiveSession();

    logger.info('[RoleInstance#_executeAsk] [executing → awaiting]', {
      instance: this.id,
      node: node.id,
      trigger: verdict.escalate ? verdict.trigger : undefined,
    });
  }

  /**
   * @purpose SV-23 (D-134): dispatch an autonomous `ApproveAction` through the same `EffectExecutor`
   *   (same dry-run mode) as SV-22 thread resolution, then transition straight to `done`.
   * @invariant Degrades to `false` (caller falls back to the ask) on absent `ctx.vcs`/`ctx.store`
   *   or a dispatch failure — never claims an approve that didn't happen.
   * @param node The `node_ask` node this pass would otherwise have escalated to.
   * @param ctx Node context — needs `ctx.vcs`/`ctx.store`.
   * @returns True when the auto-approve pass completed and the instance is now `done`.
   * @sideEffect Network: `EffectExecutor`'s vcs-approve call (or its DRY-RUN journal entry).
   */
  protected async _dispatchAutonomousApprove(node: AskNode, ctx: NodeContext): Promise<boolean> {
    if (!ctx.vcs || !ctx.store) return false;

    try {
      const executor = new EffectExecutor({ vcs: ctx.vcs, store: ctx.store, dryRun: this._dryRun });
      const result = await executor.execute({ mr: this.mr, role: this.role, nodeId: node.id }, [
        { type: 'approve' },
      ]);
      this._artifacts[`${node.id}_autonomous_result`] = result;
      this.currentNode = 'done';
      this.state = 'done';

      logger.info('[RoleInstance#_dispatchAutonomousApprove] [executing → done]', {
        instance: this.id,
        node: node.id,
      });
      return true;
    } catch (cause) {
      logger.warn('[RoleInstance#_dispatchAutonomousApprove] [executing → degraded]', {
        instance: this.id,
        node: node.id,
        error: String(cause),
      });
      return false;
    }
  }

  /**
   * @purpose Materialize the SV-24 trigger-2 dispute summary (finding/author argument/code/
   *   recommendation) so the ask artifact carries substance, not just a disputed flag.
   * @param thread The disputed discussion.
   * @param ctx Node context — used for `ctx.mr.author` and the worktree code-snippet read.
   * @returns Dispute summary for display at the ask node.
   */
  protected _buildDisputeSummary(thread: Discussion, ctx: NodeContext): DisputeSummary {
    const authorNote = [...thread.notes].reverse().find((note) => note.username === ctx.mr.author);

    return {
      finding: thread.body,
      authorArgument: authorNote?.body ?? '(автор не ответил в треде)',
      codeSnippet: this._readDisputeCodeSnippet(thread, ctx),
      recommendation:
        'Сверить довод автора с находкой и решить: закрыть тред вручную или настоять на исправлении.',
    };
  }

  /**
   * @purpose Read a few lines of code around a disputed thread's location, for the dispute summary.
   * @invariant Degrades to `undefined` on a file-less thread or an unreadable worktree — never
   *   blocks the dispute summary on a missing code snippet.
   * @param thread The disputed discussion.
   * @param ctx Node context — supplies `worktreePath`.
   * @returns A short code snippet, or undefined when unavailable.
   * @sideEffect FS: reads `thread.file` under `ctx.artifacts.worktreePath`.
   */
  protected _readDisputeCodeSnippet(thread: Discussion, ctx: NodeContext): string | undefined {
    const worktreePath = ctx.artifacts['worktreePath'] as string | undefined;
    if (!worktreePath || !thread.file || thread.line === undefined) return undefined;

    try {
      const lines = readFileSync(join(worktreePath, thread.file), 'utf-8').split('\n');
      const start = Math.max(0, thread.line - 2);
      const end = Math.min(lines.length, thread.line + 1);
      return lines.slice(start, end).join('\n');
    } catch (cause) {
      logger.warn('[RoleInstance#_readDisputeCodeSnippet] [reading → degraded]', {
        file: thread.file,
        error: String(cause),
      });
      return undefined;
    }
  }

  /**
   * @purpose Execute an effect node — side effect with idempotency guard.
   * @invariant Effect runs at most once: checked via 'effect_applied' audit marker.
   * @invariant NFC-SV-07: only `EffectExecutor.execute()` posts vcs-*; absent `ctx.vcs`/`ctx.store`
   *   degrades to `node.run`-only staging (no throw).
   * @param node Current effect node being executed.
   * @param ctx Node context with MR data and artifacts.
   * @returns Promise that resolves when the effect completes.
   */
  protected async _executeEffect(node: EffectNode, ctx: NodeContext): Promise<void> {
    this.state = 'running';

    // #region START_EFFECT_IDEMPOTENCY_CHECK
    const auditEntries = await this._store.queryAudit(this.mr);
    const alreadyApplied = auditEntries.some(
      (e: AuditEntry) => e.event === 'effect_applied' && e.detail?.includes(`node:${node.id}`)
    );

    if (alreadyApplied) {
      logger.debug('[RoleInstance#_executeEffect] [executing → skipped] Effect already applied', {
        instance: this.id,
        node: node.id,
      });

      // Skip the effect but still transition
      const edge = this._resolveEdge(node.id, 'ok');
      if (edge) {
        this.currentNode = edge.to;
        if (edge.to === 'done') this.state = 'done';
      }
      return;
    }
    // #endregion END_EFFECT_IDEMPOTENCY_CHECK

    await this._appendAudit('effect_applied', `node:${node.id}`);

    await node.run(ctx);

    // #region START_EFFECT_EXECUTOR_DISPATCH — invariant: only EffectExecutor performs vcs-*
    // (NFC-SV-07); ctx.vcs/ctx.store come from RoleInstance's own _buildContext (always set for a
    // live instance) — the guard exists for hand-built NodeContext fixtures that omit them
    if (ctx.vcs && ctx.store) {
      const approvedActions = this._collectProposedActions();
      if (approvedActions.length > 0) {
        const executor = new EffectExecutor({
          vcs: ctx.vcs,
          store: ctx.store,
          dryRun: this._dryRun,
        });
        const result = await executor.execute(
          { mr: this.mr, role: this.role, nodeId: node.id },
          approvedActions
        );
        this._artifacts[`${node.id}_result`] = result;
      }
    }
    // #endregion END_EFFECT_EXECUTOR_DISPATCH

    // Transition
    const edge = this._resolveEdge(node.id, 'ok');
    if (edge) {
      this.currentNode = edge.to;
      if (edge.to === 'done') this.state = 'done';
    }
  }

  /**
   * @purpose Find the `proposedActions` array staged by a session/prep node in accumulated
   *   artifacts — the bridge from staged proposals to `EffectExecutor.execute()` (NFC-SV-07).
   * @returns The first `proposedActions` array found, or `[]` when no node staged one.
   */
  protected _collectProposedActions(): ProposedAction[] {
    for (const artifact of Object.values(this._artifacts)) {
      const obj = artifact as Record<string, unknown> | undefined;
      if (!obj || typeof obj !== 'object') continue;

      const proposed = obj.proposedActions as ProposedAction[] | undefined;
      if (Array.isArray(proposed)) return proposed;
    }
    return [];
  }

  // ─── Recovery ladder ─────────────────────────────────────────────────────────

  /**
   * @purpose Apply recovery ladder: continue→same session with remediation;
   * restart→fresh session; await_operator→escalate.
   * @param node Current session node being recovered.
   * @param remediation Remediation action derived from outcome.
   * @param _outcome Classified outcome (reserved for future use).
   * @returns Promise that resolves when recovery is applied.
   */
  protected async _applyRecovery(
    node: SessionNode,
    remediation: RemediationAction,
    _outcome: ClassifiedOutcome
  ): Promise<void> {
    const max = node.policy;

    switch (remediation.action) {
      case 'continue': {
        this.continueCount++;
        if (this.continueCount > max.continueMax) {
          // Exhausted continues → fall through to restart
          logger.info('[RoleInstance#_applyRecovery] [continue → exhausted] Switching to restart', {
            instance: this.id,
            node: node.id,
            continueCount: this.continueCount,
          });
          this.continueCount = 0;
          this.restartCount++;

          if (this.restartCount > max.restartMax) {
            // P2/S7/D9: close session before escalating to operator
            await this._closeActiveSession();
            this.state = 'escalated';
            await this._appendAudit('escalated', `Recovery exhausted for node "${node.id}"`);
            return;
          }

          // Restart: close old session, create fresh one
          await this._closeActiveSession();
          await this._appendAudit(
            'restarted',
            `Restarting node "${node.id}" — attempt ${this.restartCount}/${max.restartMax}`
          );
        } else {
          // Continue: send continuation signal to same session
          if (this._sessionId) {
            const signal = remediation.signal ?? 'Retry with the same prompt';
            await this._opencode.continueSignal(this._sessionId, {
              text: signal,
              model: node.policy?.model,
            });
          }
          await this._appendAudit(
            'continued',
            `Continuing node "${node.id}" — attempt ${this.continueCount}/${max.continueMax}`
          );
        }

        // Stay on same node
        this.state = 'idle';
        break;
      }

      case 'restart': {
        this.restartCount++;
        if (this.restartCount > max.restartMax) {
          // P2/S7/D9: close session before escalating to operator
          await this._closeActiveSession();
          this.state = 'awaiting_operator';
          await this._appendAudit('escalated', `Recovery exhausted for node "${node.id}"`);
          return;
        }

        // Close old session, create fresh one
        await this._closeActiveSession();

        await this._appendAudit(
          'restarted',
          `Restarting node "${node.id}" — attempt ${this.restartCount}/${max.restartMax}`
        );

        // Stay on same node for retry
        this.state = 'idle';
        break;
      }

      case 'await_operator': {
        // P2/S7/D9: close session before escalating to operator
        await this._closeActiveSession();
        this.state = 'escalated';
        await this._appendAudit('escalated', `Node "${node.id}" requires operator attention`);
        break;
      }

      case 'proceed':
        // Should not reach here for non-OK outcomes — fallback
        this.state = 'error';
        break;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * @purpose Find a node in the graph by id.
   * @param nodeId Node identifier.
   * @returns The node if found, undefined otherwise.
   */
  protected _findNode(nodeId: string): RoleNode | undefined {
    return this._graph.nodes.find((n) => n.id === nodeId);
  }

  /**
   * @purpose Resolve the edge to follow from a node given a condition.
   * @param fromNodeId Source node identifier.
   * @param condition Trigger condition.
   * @returns The matched edge, or undefined if no edge matches.
   */
  protected _resolveEdge(fromNodeId: string, condition: EdgeCondition): Edge | undefined {
    return this._graph.edges.find((e) => e.from === fromNodeId && e.on === condition);
  }

  /**
   * @purpose Lazily build the NodeContext from MR context and accumulated artifacts.
   * @invariant `mrShape`/`injectedEntities` (TSK-113 Round 2) are promoted from `_artifacts`, never
   *   computed here — `node_prepare`'s `materializeReviewScaffold` (reviewer.role.ts) is the sole
   *   producer (see `_executePrep`).
   * @invariant Absent before `node_prepare` runs, or on branches that skip the scaffold pass
   *   (reply_needed/update-review).
   * @returns NodeContext for the current step.
   */
  protected async _buildContext(): Promise<NodeContext> {
    if (!this._mrContext) {
      this._mrContext = await this._vcs.getMrContext(this.mr);
    }

    // NFC-05: all working state lives under the state dir (~/.gennady by default,
    // relocatable via --state-dir) — never /tmp. Sanitize the composite id for FS use.
    const slug = this.id.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    const workspace = join(this._store.getStateDir(), 'agent-inbox', 'workspaces', slug);
    const artifacts = { ...this._artifacts };

    return {
      mr: this._mrContext,
      workspace,
      artifacts,
      // NFC-SV-07: effect nodes bind EffectExecutor from these (TSK-121 P2) — always populated
      // here since RoleInstance itself requires vcs/store; optionality in NodeContext's type is
      // for hand-built test contexts that bypass this builder.
      vcs: this._vcs,
      store: this._store,
      mrShape: artifacts['mrShape'] as NodeContext['mrShape'],
      injectedEntities: artifacts['injectedEntities'] as NodeContext['injectedEntities'],
    };
  }

  /**
   * @purpose Append an audit entry for this instance.
   * @param event Event name.
   * @param [detail] Optional detail string.
   * @returns Promise that resolves when the audit entry is persisted.
   */
  protected async _appendAudit(event: string, detail?: string): Promise<void> {
    await this._store.appendAudit({
      ts: new Date().toISOString(),
      mr: this.mr,
      role: this.role,
      event,
      detail,
    });
  }

  /**
   * @purpose Close the active OpenCode session if one exists — prevents session leaks
   * when the instance transitions to error or awaiting_operator state.
   * @returns Promise that resolves when the session is closed.
   * @sideEffect Sets _sessionId to null.
   */
  protected async _closeActiveSession(): Promise<void> {
    if (this._sessionId) {
      logger.debug('[RoleInstance#_closeActiveSession] [closing]', {
        instance: this.id,
        sessionId: this._sessionId,
      });
      await this._opencode.close(this._sessionId);
      this._sessionId = null;
    }
  }
}
