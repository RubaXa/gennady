// @file: RoleInstance — executes a role graph on a single MR, tracking state, counters, and recovery.
// @consumers: RoleScheduler, RightsEscalator, inbox-api
// @tasks: TSK-113, TSK-121, TSK-124

import { join } from 'node:path';
import { logger } from '#logger';
import { buildNodePrompt } from '../../../ai-kit/compile.ts';
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
  GateNode,
  AskNode,
  EffectNode,
  ParallelNode,
  ParallelSessionSpec,
} from './role-node.ts';
import type { VcsInboxPort, MrContext } from '../inbox-core/vcs-inbox.port.ts';
import type { OpenCodePort, PromptOpts, ToolCallStat } from '../inbox-opencode/opencode.port.ts';
import type { SessionPool } from '../inbox-opencode/session-pool.ts';
import type { OpenCodeCallResult } from '../inbox-opencode/errors.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { AuditEntry } from '../inbox-core/audit-log.ts';
import { OutcomeClassifier } from './outcome-classifier.ts';
import type { ClassifiedOutcome, RemediationAction } from './outcome-classifier.ts';
import { EffectExecutor } from './effect-executor.ts';
import type { ProposedAction } from './effect-executor.ts';
import { recordPhaseTiming } from './phase-telemetry.ts';
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
    for (const artifact of Object.values(this._artifacts)) {
      const obj = artifact as Record<string, unknown> | undefined;
      if (!obj || typeof obj !== 'object') continue;

      // Check for recommendations (from synthesize-like nodes)
      const recs = obj.recommendations as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(recs)) {
        return recs.map((r) => ({
          severity: (r.severity as string) ?? 'info',
          file: (r.file as string) ?? '',
          line: (r.line as number) ?? 0,
          message: (r.message as string) ?? '',
        }));
      }

      // Check for findings (from scaffold-like nodes)
      const findings = obj.findings as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(findings)) {
        return findings.map((f) => ({
          severity: (f.severity as string) ?? 'info',
          file: (f.file as string) ?? '',
          line: (f.line as number) ?? 0,
          message: (f.message as string) ?? '',
        }));
      }
    }
    return [];
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
    const directory = typeof worktreePath === 'string' ? worktreePath : node.dir(ctx);

    if (!this._sessionId) {
      const handle = await this._opencode.createSession({
        title: node.id,
        directory,
        tools: node.policy?.tools === true,
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

    const result: OpenCodeCallResult = await this._opencode.prompt(this._sessionId, promptOpts);
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

    await recordPhaseTiming(this._store.getStateDir(), {
      ts: new Date().toISOString(),
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

    await this._appendAudit('classified', `Session node "${node.id}" outcome: ${outcome.class}`);

    if (outcome.class === 'OK') {
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
      this.state = 'awaiting_operator';
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
    const directory = typeof worktreePath === 'string' ? worktreePath : spec.dir(ctx);
    const taskText = spec.buildTaskText(ctx);

    // TSK-perf telemetry (phase-timings.jsonl) — one entry per lens, recorded at every exit point below.
    const _telemetryStart = performance.now();
    const _telemetryModel = spec.policy?.model ?? 'default';
    let _telemetryLastError: string | undefined;
    const _recordLensTiming = async (
      result: { id: string; output?: unknown; escalate: boolean },
      continueCount: number,
      restartCount: number,
      tools: ToolCallStat[] = []
    ): Promise<{ id: string; output?: unknown; escalate: boolean }> => {
      await recordPhaseTiming(this._store.getStateDir(), {
        ts: new Date().toISOString(),
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
      tools: spec.policy?.tools === true,
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

    const max = spec.policy;
    let continueCount = 0;
    let restartCount = 0;

    for (;;) {
      const result = this._reviewSessionPool
        ? await this._reviewSessionPool.prompt(sid, promptOpts)
        : await this._opencode.prompt(sid, promptOpts);

      let outcome = this._classifier.classify(result);
      // TSK-127: same disk-artifact resolution as _executeSession — a lens's raw OK is only "the
      // turn finished"; the finding set comes from the validated file, not response text.
      if (spec.artifact && outcome.class === 'OK') {
        outcome = resolveDiskArtifact(directory, spec.artifact);
      }

      if (outcome.class === 'OK') {
        // Best-effort tool-call stats — fetched BEFORE closeSession, since closing may drop the
        // session server-side and make the query fail.
        const tools = await this._opencode.toolCallStats(sid).catch(() => []);
        await closeSession(sid);
        return _recordLensTiming(
          { id: spec.id, output: outcome.output, escalate: false },
          continueCount,
          restartCount,
          tools
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
   * @purpose Execute an ask node — pause and wait for operator.
   * @param node Current ask node being executed.
   * @param ctx Node context with MR data and artifacts.
   * @returns Promise that resolves when the question is posed.
   */
  protected async _executeAsk(node: AskNode, ctx: NodeContext): Promise<void> {
    this.state = 'awaiting_operator';
    this._askNodeId = node.id;
    this._answer = null;

    // Store the question in artifacts for dashboard display
    this._artifacts[`${node.id}_question`] = node.question(ctx);

    // Close any active session from previous nodes — ask node has no LLM session
    await this._closeActiveSession();

    logger.info('[RoleInstance#_executeAsk] [executing → awaiting]', {
      instance: this.id,
      node: node.id,
    });
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
            this.state = 'awaiting_operator';
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
        this.state = 'awaiting_operator';
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

    return {
      mr: this._mrContext,
      workspace,
      artifacts: { ...this._artifacts },
      // NFC-SV-07: effect nodes bind EffectExecutor from these (TSK-121 P2) — always populated
      // here since RoleInstance itself requires vcs/store; optionality in NodeContext's type is
      // for hand-built test contexts that bypass this builder.
      vcs: this._vcs,
      store: this._store,
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
