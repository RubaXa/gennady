// @file: AuthorRole — self-review + reviewer-feedback analysis → REPORT.md (summary) +
//   FIX_TASK.md (copyable task) + reply drafts. Never approves own MR, never writes threads (D68).
// @consumers: RoleEngine, role-engine.test.ts, author.role.test.ts
// @tasks: TSK-113

import type {
  RoleDefinition,
  RoleGraph,
  NodeContext,
  GateResult,
  PrepResult,
} from './role-node.ts';

/**
 * @purpose Prepare workspace/context for the (single-path) author graph — no stage branching yet.
 * @invariant `prep` kind kept for topology parity with reviewer and future stage-aware variants.
 * @param ctx MR context and accumulated artifacts.
 * @returns Single 'ok' branch — always proceeds to self-review.
 * @sideEffect None — deterministic, no I/O.
 */
async function preparePrepNode(_ctx: NodeContext): Promise<PrepResult> {
  return { branch: 'ok' };
}

/**
 * @purpose Author graph: prepare → self-review → analyze feedback → synthesize → ask → effect.
 */
const authorGraph: RoleGraph = {
  nodes: [
    {
      kind: 'prep',
      id: 'node_prepare',
      run: preparePrepNode,
    },
    {
      kind: 'session',
      id: 'node_self_review',
      buildTaskText(ctx: NodeContext) {
        return `Self-review your own MR ${ctx.mr.webUrl} (${ctx.mr.sourceBranch} → ${ctx.mr.targetBranch}). Run the full battery over your own diff — same rigor as an external reviewer. Write findings with file:line addresses.`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_self_review',
        type: 'object',
        properties: {
          findings: { type: 'array' },
        },
      },
      policy: {
        promptTimeout: 10,
        continueMax: 3,
        restartMax: 2,
        tools: true,
      },
    },
    {
      kind: 'session',
      id: 'node_analyze_feedback',
      buildTaskText(ctx: NodeContext) {
        const discussions = (ctx.artifacts['discussions'] as unknown[] | undefined) ?? [];
        return `Analyze reviewer feedback on MR ${ctx.mr.webUrl} (main input — vcs-discussions --all, ${discussions.length} threads pre-fetched). For each comment, classify: 🔧 needs a code fix / 💬 needs a reply / 👍 agree. Do not post anything yet.`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_analyze_feedback',
        type: 'object',
        properties: {
          classifiedComments: { type: 'array' },
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
      id: 'gate_analysis',
      verify(ctx: NodeContext): GateResult {
        const selfReview = ctx.artifacts['node_self_review'] as Record<string, unknown> | undefined;
        const feedback = ctx.artifacts['node_analyze_feedback'] as
          | Record<string, unknown>
          | undefined;
        if (!selfReview || !feedback || !Array.isArray(feedback.classifiedComments)) {
          return { pass: false, reason: 'Self-review/анализ замечаний не заполнены' };
        }
        return { pass: true };
      },
    },
    {
      kind: 'session',
      id: 'node_synthesize',
      buildTaskText(ctx: NodeContext) {
        const selfReview = (ctx.artifacts['node_self_review'] as Record<string, unknown>) ?? {};
        const feedback = (ctx.artifacts['node_analyze_feedback'] as Record<string, unknown>) ?? {};
        return `Produce REPORT.md (Сводка), FIX_TASK.md (copyable developer task: file:line / what's wrong / why / fix / who said it) and reply drafts for MR ${ctx.mr.webUrl} from: ${JSON.stringify(
          { selfReview, feedback }
        )}. FIX_TASK.md is flat and copyable — no findings are posted to threads on this MR (D68).`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: {
        title: 'node_synthesize',
        type: 'object',
        properties: {
          reportSummary: { type: 'string' },
          fixTasks: { type: 'array' },
          drafts: { type: 'array' },
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
      id: 'gate_synthesis',
      verify(ctx: NodeContext): GateResult {
        const synth = ctx.artifacts['node_synthesize'] as Record<string, unknown> | undefined;
        if (!synth || !synth.reportSummary) {
          return { pass: false, reason: 'REPORT.md/FIX_TASK.md synthesis не заполнен' };
        }
        return { pass: true };
      },
    },
    {
      kind: 'ask',
      id: 'node_ask',
      question(ctx: NodeContext) {
        const synth = (ctx.artifacts['node_synthesize'] as Record<string, unknown>) ?? {};
        const summary = (synth.reportSummary as string) ?? 'No summary generated';
        return {
          title: 'Publish Drafts / Update Description?',
          body: `Summary for MR ${ctx.mr.webUrl}: ${summary}. Own MR is never approved here.`,
          choices: ['publish_drafts', 'react', 'update_description', 'copy_fix_task', 'skip'],
        };
      },
    },
    {
      kind: 'effect',
      id: 'node_effect',
      async run(ctx: NodeContext) {
        // effect = vcs-react (👍 on agreement) + vcs-reply (replies) + optional
        // vcs-mr-edit --description. NEVER vcs-approve on own MR, NEVER new thread writes (D68).
        // Same NodeContext limitation as reviewer.role.ts's effect node: no VcsInboxPort/StateStore
        // reference here to build an EffectExecutor — see reviewer.role.ts node_effect comment and
        // this phase's Handoff open item.
        void ctx;
      },
    },
  ],
  edges: [
    { from: 'node_prepare', to: 'node_self_review', on: 'ok' },
    { from: 'node_self_review', to: 'node_analyze_feedback', on: 'ok' },
    { from: 'node_analyze_feedback', to: 'gate_analysis', on: 'ok' },
    { from: 'gate_analysis', to: 'node_synthesize', on: 'pass' },
    { from: 'gate_analysis', to: 'node_analyze_feedback', on: 'fail' },
    { from: 'node_synthesize', to: 'gate_synthesis', on: 'ok' },
    { from: 'gate_synthesis', to: 'node_ask', on: 'pass' },
    { from: 'gate_synthesis', to: 'node_synthesize', on: 'fail' },
    { from: 'node_ask', to: 'node_effect', on: 'ok' },
    { from: 'node_effect', to: 'done', on: 'ok' },
  ],
};

/**
 * @purpose Author role definition — loaded by RoleEngine. Own MR: self-review + feedback analysis
 *   → REPORT.md + FIX_TASK.md + drafts → ask → effect.
 * @invariant Never approves own MR; never writes to threads (D68).
 * @consumer RoleEngine.loadAll()
 */
export const AuthorRole: RoleDefinition = {
  name: 'author',
  description:
    'MR author: prepare → self-review → analyze feedback → synthesize (REPORT.md + FIX_TASK.md + drafts) → ask → react/reply',
  graph: authorGraph,
};
