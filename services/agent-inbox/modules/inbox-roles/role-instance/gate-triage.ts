// @file: SV-21 synthesis-gate head promotion and SV-22 autonomous thread-triage resolution for RoleInstance gate nodes.
// @consumers: role-instance.ts
// @tasks: N/A

import { logger } from '#logger';
import type { GateNode, NodeContext, RoleArtifacts, ChangesetFile } from '../role-node.ts';
import { EffectExecutor } from '../effect-executor.ts';
import type { ProposedAction } from '../effect-executor.ts';
import { DebounceTracker } from '../mr-watch.ts';
import {
  classifyThreadSignals,
  decideThreadAction,
  type ThreadSignalVerdict,
  type MrDiffContext,
} from '../thread-signal-classifier.ts';
import type { ThreadEscalationSignal } from './escalation-gate.ts';
import { appendThreadDecisionActions } from './thread-dispute.ts';

/**
 * @purpose Gate ids whose PASS marks a completed synthesis — the trigger for promoting
 *   `lastReviewedHeadSha` (SV-21).
 * @invariant Owned by `reviewer.role.ts` (TSK-113); not a node-level flag — single consumer today.
 */
export const SYNTHESIS_GATE_IDS = new Set(['gate_review_synthesis', 'gate_delta_synthesis']);

/**
 * @purpose Artifact key `resolveThreadTriageAutonomously` stores per-thread SV-22 signals under —
 *   read back by `_executeAsk` (a later node) to feed the SV-24 escalation gate.
 * @invariant Fixed key, not `${node.id}_...` — producer runs at `gate_triage`, consumer runs at
 *   `node_ask`; a node-id-scoped key would never be found by the reader.
 */
export const THREAD_ESCALATION_SIGNALS_KEY = 'thread_triage_escalation_signals';

/**
 * @purpose Promote `lastReviewedHeadSha` to the current head once a synthesis gate passes (SV-21).
 * @invariant `promoteReviewedHeadSha` (TSK-109) only promotes an already-set `candidateHeadSha`;
 *   this method sets it first so the unchanged promotion logic has a value to act on.
 * @invariant Only `SYNTHESIS_GATE_IDS` trigger promotion; every other passing gate is a no-op.
 * @param node Gate node that just passed.
 * @param ctx Node context — needs `ctx.store` and `ctx.artifacts.headSha`.
 * @param deps Instance fields this function needs: `mr`, `id`.
 * @sideEffect Registry: writes `candidateHeadSha`, promotes to `lastReviewedHeadSha`, persists to disk.
 */
export function promoteReviewedHead(
  node: GateNode,
  ctx: NodeContext,
  deps: { mr: string; id: string }
): void {
  if (!SYNTHESIS_GATE_IDS.has(node.id)) return;
  const headSha = ctx.artifacts['headSha'] as string | undefined;
  if (!headSha || !ctx.store) return;

  try {
    const registry = ctx.store.loadRegistry();
    const entry = registry.entries[deps.mr];
    if (!entry) return;

    entry.candidateHeadSha = headSha;
    ctx.store.promoteReviewedHeadSha(deps.mr);
    ctx.store.saveRegistry();

    logger.info('[RoleInstance#_promoteReviewedHead] [synthesis → promoted]', {
      instance: deps.id,
      mr: deps.mr,
      node: node.id,
      headSha,
    });
  } catch (cause) {
    logger.warn('[RoleInstance#_promoteReviewedHead] [synthesis → degraded]', {
      instance: deps.id,
      mr: deps.mr,
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
 * @param deps Instance fields this function needs: `mr`, `role`, `id`, `dryRun`, and `artifacts`
 *   (mutated by reference — this is the instance's live `_artifacts` object).
 * @returns Promise that resolves once the pass completes (or degrades) — no data to report.
 * @sideEffect Network: `getDiscussions`/`getMyLogin` reads, then `EffectExecutor`'s
 *   react/resolve/reply calls (or their DRY-RUN journal entries).
 */
export async function resolveThreadTriageAutonomously(
  node: GateNode,
  ctx: NodeContext,
  deps: { mr: string; role: string; id: string; dryRun: boolean; artifacts: RoleArtifacts }
): Promise<void> {
  if (!ctx.vcs || !ctx.store) return;

  const triage = ctx.artifacts['node_thread_triage'] as { threads?: unknown[] } | undefined;
  if (!triage?.threads?.length) return;

  try {
    const [discussions, myLogin] = await Promise.all([
      ctx.vcs.getDiscussions(deps.mr, { my: true }),
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
      const triageEntry = triage.threads?.find((t) => (t as { id?: string })?.id === thread.id) as
        | { disputed?: boolean; status?: string }
        | undefined;

      const verdict: ThreadSignalVerdict = {
        ...classifyThreadSignals(thread, mrDiff, myLogin),
        disputed: triageEntry?.disputed === true || triageEntry?.status === 'disagree',
        quietPeriodElapsed,
      };

      const decision = decideThreadAction(verdict);
      appendThreadDecisionActions(actions, thread, decision);
      threadSignals.push({
        decision,
        thread,
        ambiguous: triageEntry?.status === 'ambiguous' || triageEntry?.status === 'unclear',
      });
    }

    // SV-24 (D-135): persisted for `_executeAsk`'s escalation gate — this pass may run at
    // gate_triage, several nodes before node_ask actually reads it back.
    deps.artifacts[THREAD_ESCALATION_SIGNALS_KEY] = threadSignals;

    if (actions.length > 0) {
      const executor = new EffectExecutor({
        vcs: ctx.vcs,
        store: ctx.store,
        dryRun: deps.dryRun,
      });
      const result = await executor.execute(
        { mr: deps.mr, role: deps.role, nodeId: node.id },
        actions
      );
      deps.artifacts[`${node.id}_autonomous_result`] = result;
    }
  } catch (cause) {
    logger.warn('[RoleInstance#_resolveThreadTriageAutonomously] [resolving → degraded]', {
      instance: deps.id,
      node: node.id,
      error: String(cause),
    });
  }
}
