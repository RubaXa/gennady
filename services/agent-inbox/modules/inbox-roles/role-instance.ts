// @file: RoleInstance — executes a role graph on a single MR, tracking state, counters, and recovery.
// @consumers: RoleScheduler, RightsEscalator, inbox-api
// @tasks: TSK-113

import { join } from 'node:path';
import { logger } from '#logger';
import type { InstanceState } from './errors.ts';
import type {
  RoleNode,
  RoleGraph,
  Edge,
  EdgeCondition,
  NodeContext,
  RoleArtifacts,
  SessionNode,
  GateNode,
  AskNode,
  EffectNode,
} from './role-node.ts';
import type { VcsInboxPort, MrContext } from '../inbox-core/vcs-inbox.port.ts';
import type { OpenCodePort, PromptOpts } from '../inbox-opencode/opencode.port.ts';
import type { OpenCodeCallResult } from '../inbox-opencode/errors.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { AuditEntry } from '../inbox-core/audit-log.ts';
import { OutcomeClassifier } from './outcome-classifier.ts';
import type { ClassifiedOutcome, RemediationAction } from './outcome-classifier.ts';

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
};

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
    this.currentNode = opts.graph.nodes[0]?.id ?? '';
    this.continueCount = 0;
    this.restartCount = 0;
    this._artifacts = {};
    this._mrContext = null;
    this._sessionId = null;
    this.createdAt = new Date().toISOString();
    this._classifier = new OutcomeClassifier();
    this._askNodeId = null;
    this._answer = null;
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
        case 'session':
          await this._executeSession(node, ctx);
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
   * @purpose Execute a session (LLM) node and classify the outcome.
   * @param node Current session node being executed.
   * @param ctx Node context with MR data and artifacts.
   * @returns Promise that resolves when session execution completes.
   * @sideEffect Creates/uses OpenCode session; appends audit entry.
   */
  protected async _executeSession(node: SessionNode, ctx: NodeContext): Promise<void> {
    this.state = 'running';

    // #region START_SESSION_CALL
    const promptContent = node.prompt(ctx);
    const directory = node.dir(ctx);

    if (!this._sessionId) {
      const handle = await this._opencode.createSession({
        title: node.id,
        directory,
      });
      this._sessionId = handle.sid;
    }

    const promptOpts: PromptOpts = {
      system: promptContent.system,
      text: promptContent.text,
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

    const result: OpenCodeCallResult = await this._opencode.prompt(this._sessionId, promptOpts);
    // #endregion END_SESSION_CALL

    const outcome = this._classifier.classify(result);
    const remediation = this._classifier.remediate(outcome);

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
      // Side-effect-free pass — just transition
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

    // Transition
    const edge = this._resolveEdge(node.id, 'ok');
    if (edge) {
      this.currentNode = edge.to;
      if (edge.to === 'done') this.state = 'done';
    }
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
