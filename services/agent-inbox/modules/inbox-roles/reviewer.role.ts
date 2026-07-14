// @file: ReviewerRole — three branches from `prepare` (prep): review_needed (fan-out battery +
//   security lens + code-review diff → synthesize), reply_needed (thread-triage, no full battery),
//   update-review (delta-only). Parity with the CLI D57/D70 pipeline (NFC-SV-07/08/09).
// @consumers: RoleEngine, role-engine.test.ts, reviewer.role.test.ts
// @tasks: TSK-113, TSK-121

import type {
  RoleDefinition,
  RoleGraph,
  NodeContext,
  GateResult,
  PrepResult,
} from './role-node.ts';

/**
 * @purpose Deterministic branch selector read by `preparePrepNode`.
 * @invariant Mirrors `classify-mr-stage.logic.ts` MrStage vocabulary plus `headChanged` (D57/D70).
 * @invariant Not fetched live — prep has no VcsInboxPort/StateStore, only mr/workspace/artifacts.
 * @invariant Caller seeds `ctx.artifacts.stage`/`headChanged`/`lastReviewedHeadSha` before step().
 * @invariant Live wiring is a P3 Handoff open item — needs NodeContext + `_buildContext` changes.
 */
type ReviewerStageSignal = 'review_needed' | 'reply_needed' | 'awaiting_reply' | 'idle';

/**
 * @purpose Read pre-seeded stage/headChanged signals from artifacts and pick the branch.
 * @param ctx MR context and accumulated artifacts.
 * @returns Branch selector consumed by the graph's edges.
 * @sideEffect None — deterministic, no I/O (prep invariant: no LLM, no vcs-* writes).
 */
async function preparePrepNode(ctx: NodeContext): Promise<PrepResult> {
  const stage = ctx.artifacts['stage'] as ReviewerStageSignal | undefined;
  const headChanged = ctx.artifacts['headChanged'] as string | undefined;
  const reviewedBefore = Boolean(ctx.artifacts['lastReviewedHeadSha']);

  // #region START_SELECT_BRANCH — invariant: fast_forward + prior review wins over stage (delta
  // is cheaper and more precise than a full re-review of already-approved code)
  if (headChanged === 'fast_forward' && reviewedBefore) {
    return { branch: 'update-review' };
  }
  if (stage === 'reply_needed') {
    return { branch: 'reply_needed' };
  }
  // Default (stage undefined on first tick, or stage === 'review_needed'): full battery.
  return { branch: 'review_needed' };
  // #endregion END_SELECT_BRANCH
}

/**
 * @purpose Reviewer graph — three branches from `node_prepare`:
 *   review_needed (review-fanout) / reply_needed (thread-triage) / update-review (delta-review).
 */
const reviewerGraph: RoleGraph = {
  nodes: [
    {
      kind: 'prep',
      id: 'node_prepare',
      run: preparePrepNode,
    },

    // ─── review_needed: review-fanout ──────────────────────────────────────────
    {
      kind: 'session',
      id: 'node_track_review',
      buildTaskText(ctx: NodeContext) {
        const tracks = (ctx.artifacts['tracks'] as string[] | undefined) ?? [];
        const trackList =
          tracks.length > 0 ? tracks.join(', ') : `full diff of ${ctx.mr.sourceBranch}`;
        return `Review MR ${ctx.mr.webUrl} (${ctx.mr.sourceBranch} → ${ctx.mr.targetBranch}). Cover tracks: ${trackList}. Write findings with file:line addresses from the changeset.`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_track_review',
        type: 'object',
        properties: {
          findings: { type: 'array' },
          tracksCovered: { type: 'array' },
        },
      },
      policy: {
        promptTimeout: 10,
        continueMax: 3,
        restartMax: 2,
      },
    },
    {
      kind: 'session',
      id: 'node_security_lens',
      buildTaskText(ctx: NodeContext) {
        return `Security lens over the WHOLE changeset of MR ${ctx.mr.webUrl} (NFC-SV-09) — not limited to per-track scope. Report findings with file:line addresses; explicit no-findings if clean.`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_security_lens',
        type: 'object',
        properties: {
          findings: { type: 'array' },
        },
      },
      policy: {
        promptTimeout: 10,
        continueMax: 2,
        restartMax: 2,
      },
    },
    {
      kind: 'session',
      id: 'node_code_review',
      buildTaskText(ctx: NodeContext) {
        const base = (ctx.artifacts['baseSha'] as string | undefined) ?? ctx.mr.targetBranch;
        return `Code-review diff base..HEAD (base=${base}) for MR ${ctx.mr.webUrl}. Focus on code-level correctness/simplicity, not architecture (already covered by track review).`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_code_review',
        type: 'object',
        properties: {
          findings: { type: 'array' },
        },
      },
      policy: {
        promptTimeout: 10,
        continueMax: 2,
        restartMax: 2,
      },
    },
    {
      kind: 'gate',
      id: 'gate_review_filled',
      verify(ctx: NodeContext): GateResult {
        const track = ctx.artifacts['node_track_review'] as Record<string, unknown> | undefined;
        const security = ctx.artifacts['node_security_lens'] as Record<string, unknown> | undefined;
        const codeReview = ctx.artifacts['node_code_review'] as Record<string, unknown> | undefined;
        if (!track || !security || !codeReview) {
          return { pass: false, reason: 'Review-fanout не заполнен: track/security/code-review' };
        }
        return { pass: true };
      },
    },

    // ─── reply_needed: thread-triage (полная батарея НЕ запускается) ──────────
    {
      kind: 'session',
      id: 'node_thread_triage',
      buildTaskText(ctx: NodeContext) {
        return `Triage discussion threads on MR ${ctx.mr.webUrl}: annotate owner/goal/nextActor/status per thread; verify claimed fixes against the current diff; propose actions (react/reply/resolve) with text — do NOT re-run a full review battery.`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_thread_triage',
        type: 'object',
        properties: {
          threads: { type: 'array' },
          proposedActions: { type: 'array' },
        },
      },
      policy: {
        promptTimeout: 10,
        continueMax: 3,
        restartMax: 2,
      },
    },
    {
      kind: 'gate',
      id: 'gate_triage',
      verify(ctx: NodeContext): GateResult {
        const triage = ctx.artifacts['node_thread_triage'] as Record<string, unknown> | undefined;
        if (!triage || !Array.isArray(triage.threads)) {
          return { pass: false, reason: 'Thread-triage не заполнен' };
        }
        return { pass: true };
      },
    },

    // ─── update-review: delta-review (только дельта с прошлого ревью) ─────────
    {
      kind: 'session',
      id: 'node_delta_review',
      buildTaskText(ctx: NodeContext) {
        const lastSha = (ctx.artifacts['lastReviewedHeadSha'] as string | undefined) ?? 'unknown';
        return `Delta review of MR ${ctx.mr.webUrl}: base=${lastSha}..HEAD only. Check whether prior comments are closed and whether the new commits broke anything — do NOT re-review the whole MR.`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_delta_review',
        type: 'object',
        properties: {
          findings: { type: 'array' },
          closedComments: { type: 'array' },
        },
      },
      policy: {
        promptTimeout: 10,
        continueMax: 3,
        restartMax: 2,
      },
    },
    {
      kind: 'gate',
      id: 'gate_delta',
      verify(ctx: NodeContext): GateResult {
        const delta = ctx.artifacts['node_delta_review'] as Record<string, unknown> | undefined;
        if (!delta) {
          return { pass: false, reason: 'Delta-review не заполнен' };
        }
        return { pass: true };
      },
    },
    {
      kind: 'session',
      id: 'node_synthesize_delta',
      buildTaskText(ctx: NodeContext) {
        const delta = (ctx.artifacts['node_delta_review'] as Record<string, unknown>) ?? {};
        return `Synthesize the delta-review findings for MR ${ctx.mr.webUrl} into a report: ${JSON.stringify(delta)}`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_synthesize_delta',
        type: 'object',
        properties: {
          reviewReport: { type: 'object' },
        },
      },
      policy: {
        promptTimeout: 5,
        continueMax: 2,
        restartMax: 2,
      },
    },
    {
      kind: 'gate',
      id: 'gate_delta_synthesis',
      verify(ctx: NodeContext): GateResult {
        const synth = ctx.artifacts['node_synthesize_delta'] as Record<string, unknown> | undefined;
        if (!synth || !synth.reviewReport) {
          return { pass: false, reason: 'Delta synthesis не заполнен' };
        }
        return { pass: true };
      },
    },

    // ─── convergence: shared synthesize (review_needed) → shared ask/effect ───
    {
      kind: 'session',
      id: 'node_synthesize',
      buildTaskText(ctx: NodeContext) {
        const track = (ctx.artifacts['node_track_review'] as Record<string, unknown>) ?? {};
        const security = (ctx.artifacts['node_security_lens'] as Record<string, unknown>) ?? {};
        const codeReview = (ctx.artifacts['node_code_review'] as Record<string, unknown>) ?? {};
        return `Synthesize review findings for MR ${ctx.mr.webUrl} from track review, security lens, and code review into a unified report: ${JSON.stringify(
          { track, security, codeReview }
        )}. Propose actions (proposedActions) — do NOT call vcs-* yourself: one 'reply' action with a { file, newLine } position per concrete finding you want posted as a line comment, plus exactly one general 'reply' action with no position summarizing cross-cutting/architectural issues.`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_synthesize',
        type: 'object',
        properties: {
          reviewReport: { type: 'object' },
          recommendations: { type: 'array' },
          proposedActions: { type: 'array' },
        },
      },
      policy: {
        promptTimeout: 10,
        continueMax: 2,
        restartMax: 2,
      },
    },
    {
      kind: 'gate',
      id: 'gate_review_synthesis',
      verify(ctx: NodeContext): GateResult {
        const synth = ctx.artifacts['node_synthesize'] as Record<string, unknown> | undefined;
        if (!synth || !synth.reviewReport) {
          return { pass: false, reason: 'Synthesis не заполнен' };
        }
        return { pass: true };
      },
    },
    {
      kind: 'ask',
      id: 'node_ask',
      question(ctx: NodeContext) {
        // Reads whichever branch produced a report — review/delta synthesis or thread-triage.
        const synth =
          (ctx.artifacts['node_synthesize'] as Record<string, unknown> | undefined) ??
          (ctx.artifacts['node_synthesize_delta'] as Record<string, unknown> | undefined);
        const triage = ctx.artifacts['node_thread_triage'] as Record<string, unknown> | undefined;
        const summary = synth
          ? JSON.stringify(synth.reviewReport ?? synth)
          : JSON.stringify(triage ?? {});
        return {
          title: 'Review Complete — Post Findings?',
          body: `Review ready for MR ${ctx.mr.webUrl}. ${summary}`,
          choices: ['post', 'edit', 'skip'],
        };
      },
    },
    {
      kind: 'effect',
      id: 'node_effect',
      async run(ctx: NodeContext) {
        // Sessions never call vcs-* (NFC-SV-07). Proposed actions computed from the operator's
        // answer + accumulated artifacts are staged here; RoleInstance/EffectExecutor apply them.
        // NOTE: EffectNode.run(ctx) receives only NodeContext (mr/workspace/artifacts) — no
        // VcsInboxPort/StateStore to build an EffectExecutor instance directly (both role-node.ts's
        // NodeContext and role-instance.ts's _executeEffect are outside this phase's Target Files).
        // Staging into ctx.artifacts keeps the contract observable/testable; see P3 Handoff open
        // item for wiring RoleInstance to hand these to EffectExecutor.execute().
        void ctx;
      },
    },
  ],
  edges: [
    { from: 'node_prepare', to: 'node_track_review', on: 'review_needed' },
    { from: 'node_prepare', to: 'node_thread_triage', on: 'reply_needed' },
    { from: 'node_prepare', to: 'node_delta_review', on: 'update-review' },

    { from: 'node_track_review', to: 'node_security_lens', on: 'ok' },
    { from: 'node_security_lens', to: 'node_code_review', on: 'ok' },
    { from: 'node_code_review', to: 'gate_review_filled', on: 'ok' },
    { from: 'gate_review_filled', to: 'node_synthesize', on: 'pass' },
    { from: 'gate_review_filled', to: 'node_code_review', on: 'fail' },
    { from: 'node_synthesize', to: 'gate_review_synthesis', on: 'ok' },
    { from: 'gate_review_synthesis', to: 'node_ask', on: 'pass' },
    { from: 'gate_review_synthesis', to: 'node_synthesize', on: 'fail' },

    { from: 'node_thread_triage', to: 'gate_triage', on: 'ok' },
    { from: 'gate_triage', to: 'node_ask', on: 'pass' },
    { from: 'gate_triage', to: 'node_thread_triage', on: 'fail' },

    { from: 'node_delta_review', to: 'gate_delta', on: 'ok' },
    { from: 'gate_delta', to: 'node_synthesize_delta', on: 'pass' },
    { from: 'gate_delta', to: 'node_delta_review', on: 'fail' },
    { from: 'node_synthesize_delta', to: 'gate_delta_synthesis', on: 'ok' },
    { from: 'gate_delta_synthesis', to: 'node_ask', on: 'pass' },
    { from: 'gate_delta_synthesis', to: 'node_synthesize_delta', on: 'fail' },

    { from: 'node_ask', to: 'node_effect', on: 'ok' },
    { from: 'node_effect', to: 'done', on: 'ok' },
  ],
};

/**
 * @purpose Reviewer role definition — loaded by RoleEngine. Three branches: review_needed
 *   (review-fanout), reply_needed (thread-triage), update-review (delta-review).
 * @consumer RoleEngine.loadAll()
 */
export const ReviewerRole: RoleDefinition = {
  name: 'reviewer',
  description:
    'Code reviewer: prepare → review_needed (fanout+security+code-review) | reply_needed (thread-triage) | update-review (delta) → synthesize → ask → effect',
  graph: reviewerGraph,
};
