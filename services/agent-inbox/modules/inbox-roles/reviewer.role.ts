// @file: ReviewerRole — three branches from `prepare` (prep): review_needed (fan-out battery +
//   security lens + code-review diff → synthesize), reply_needed (thread-triage, no full battery),
//   update-review (delta-only). Parity with the CLI D57/D70 pipeline (NFC-SV-07/08/09).
// @consumers: RoleEngine, role-engine.test.ts, reviewer.role.test.ts
// @tasks: TSK-113, TSK-121, TSK-122, TSK-127

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import type {
  RoleDefinition,
  RoleGraph,
  NodeContext,
  GateResult,
  PrepResult,
  ChangesetFile,
} from './role-node.ts';
import {
  buildReviewPlan,
  scaffoldReviewReports,
} from '../../../../cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts';
import { mrReportsDir } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

/**
 * @purpose Deterministic branch selector read by `preparePrepNode`.
 * @invariant Mirrors `classify-mr-stage.logic.ts` MrStage vocabulary plus `headChanged` (D57/D70).
 * @invariant Not fetched live — prep has no VcsInboxPort/StateStore, only mr/workspace/artifacts.
 * @invariant Caller seeds `ctx.artifacts.stage`/`headChanged`/`lastReviewedHeadSha` before step().
 * @invariant Live wiring is a P3 Handoff open item — needs NodeContext + `_buildContext` changes.
 */
type ReviewerStageSignal = 'review_needed' | 'reply_needed' | 'awaiting_reply' | 'idle';

/**
 * @purpose Best-effort scaffold materialization (PLAN.md + tasks/*.task.md) for review_needed —
 *   reuses `inbox-review-plan`'s scaffold function (SV-12), never spawns or reimplements it.
 * @invariant Degrade-open: absent changesetFiles/baseSha/headSha/stateDir (e.g. worktree
 *   unavailable, per `context-builder#_prepareWorktreeAndChangeset`) is a silent no-op — scaffold
 *   materialization never blocks the graph.
 * @param ctx Node context — reads `changesetFiles`/`baseSha`/`headSha` staged by `buildNodeContext`.
 * @sideEffect FS: writes PLAN.md/tasks/*.task.md/README.md/HISTORY.md under
 *   `<StateStore.getStateDir()>/agent-inbox/reports/<mr>/` (NFC-05).
 */
function materializeReviewScaffold(ctx: NodeContext): void {
  const changesetFiles = ctx.artifacts['changesetFiles'] as ChangesetFile[] | undefined;
  const baseSha = ctx.artifacts['baseSha'] as string | undefined;
  const headSha = ctx.artifacts['headSha'] as string | undefined;
  const stateDir = ctx.store?.getStateDir();

  if (!changesetFiles?.length || !baseSha || !headSha || !stateDir) return;

  try {
    const files = changesetFiles.map((f) => ({
      path: f.path,
      plus: f.plus,
      minus: f.minus,
      status: f.status,
    }));
    const changeset = {
      files,
      totals: {
        files: files.length,
        plus: files.reduce((n, f) => n + f.plus, 0),
        minus: files.reduce((n, f) => n + f.minus, 0),
      },
    };

    const plan = buildReviewPlan(changeset);
    const ref = `${ctx.mr.project}!${ctx.mr.iid}`;
    const dir = mrReportsDir(stateDir, ref);
    scaffoldReviewReports(dir, ref, headSha, baseSha, plan, changeset);
  } catch (cause) {
    logger.warn('[reviewerGraph#materializeReviewScaffold] [scaffolding → degraded]', {
      mr: ctx.mr.webUrl,
      error: String(cause),
    });
  }
}

/**
 * @purpose Deterministic ≤7-node change-map mermaid graph — the guaranteed-closed fallback when a
 *   synthesis artifact carries no `architectureDiagram` string of its own.
 * @param files Changeset files backing the graph (top-level dir per node).
 * @returns A minimal `graph TD` mermaid block body (no fences).
 */
function _buildMinimalChangeGraph(files: ChangesetFile[]): string {
  if (files.length === 0) return 'graph TD\n  mr["MR changeset"]';
  const dirs = [...new Set(files.map((f) => f.path.split('/')[0] || f.path))].slice(0, 6);
  const lines = ['graph TD', '  mr["MR changeset"]'];
  dirs.forEach((d, i) => lines.push(`  mr --> d${i}["${d}"]`));
  return lines.join('\n');
}

/**
 * @purpose Render README.md body (spec §7 real-proof artifact) from a synthesis artifact —
 *   mirrors `inbox-review-plan`'s README_TEMPLATE headings.
 * @invariant Always carries ≥1 closed mermaid block (`_buildMinimalChangeGraph` fallback when
 *   synthesis supplies none).
 * @param report `synth.reviewReport` (LLM-produced, shape not contractually fixed).
 * @param recommendations `synth.recommendations` array, when present.
 * @param changesetFiles Changeset files for the architecture-graph fallback.
 * @returns Full README.md markdown body.
 */
function _renderSynthesisReadme(
  report: Record<string, unknown>,
  recommendations: unknown[],
  changesetFiles: ChangesetFile[]
): string {
  const summary =
    typeof report['summary'] === 'string' && report['summary']
      ? (report['summary'] as string)
      : `Изменено файлов: ${changesetFiles.length}`;
  const verdict =
    typeof report['verdict'] === 'string' && report['verdict']
      ? (report['verdict'] as string)
      : 'pending';
  const mermaid =
    typeof report['architectureDiagram'] === 'string' &&
    (report['architectureDiagram'] as string).trim()
      ? (report['architectureDiagram'] as string).trim()
      : _buildMinimalChangeGraph(changesetFiles);
  const behavior =
    typeof report['behavior'] === 'string' && report['behavior']
      ? (report['behavior'] as string)
      : 'n/a — поведенческие детали не предоставлены синтезом';
  const scenarios =
    typeof report['scenarios'] === 'string' && report['scenarios']
      ? (report['scenarios'] as string)
      : 'n/a — сценарии не предоставлены синтезом';
  const candidates =
    recommendations.length === 0
      ? 'Нет замечаний.'
      : recommendations
          .map((r, i) => {
            const rec = r as Record<string, unknown>;
            const text = typeof rec['message'] === 'string' ? rec['message'] : JSON.stringify(rec);
            return `${i + 1}. ${text}`;
          })
          .join('\n');

  return `# Отчёт ревью

## Обзор

${summary}

## Архитектура

\`\`\`mermaid
${mermaid}
\`\`\`

## Поведение

${behavior}

## Сценарии

${scenarios}

## Вердикты

${verdict}

## Кандидаты

${candidates}

## Треды

n/a — треды не обрабатываются на ветке review_needed/update-review
`;
}

/**
 * @purpose Write the synthesized review report to README.md (with mermaid) under reports/<mr>/ —
 *   the real-proof artifact spec §7 requires on disk, not only in `ctx.artifacts`.
 * @invariant Reads whichever synthesis artifact the branch produced — `node_synthesize`
 *   (review_needed) or `node_synthesize_delta` (update-review); absent both (reply_needed's
 *   thread-triage has no reviewReport), this is a no-op.
 * @param ctx Node context at a synthesis gate — accumulated synthesis artifacts + store for the
 *   reports dir.
 * @sideEffect FS: overwrites README.md under `<StateStore.getStateDir()>/agent-inbox/reports/<mr>/`.
 */
function materializeSynthesisReadme(ctx: NodeContext): void {
  const synth =
    (ctx.artifacts['node_synthesize'] as Record<string, unknown> | undefined) ??
    (ctx.artifacts['node_synthesize_delta'] as Record<string, unknown> | undefined);
  const stateDir = ctx.store?.getStateDir();
  if (!synth || !stateDir) return;

  try {
    const report = (synth['reviewReport'] as Record<string, unknown>) ?? {};
    const recommendations = (synth['recommendations'] as unknown[] | undefined) ?? [];
    const changesetFiles = (ctx.artifacts['changesetFiles'] as ChangesetFile[] | undefined) ?? [];

    const ref = `${ctx.mr.project}!${ctx.mr.iid}`;
    const dir = mrReportsDir(stateDir, ref);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'README.md'),
      _renderSynthesisReadme(report, recommendations, changesetFiles)
    );
  } catch (cause) {
    logger.warn('[reviewerGraph#materializeSynthesisReadme] [writing → degraded]', {
      mr: ctx.mr.webUrl,
      error: String(cause),
    });
  }
}

/**
 * @purpose Classify a finding's severity from its prose — drives the candidate chip colour and the
 *   AI-13 approve gate (an `error` finding blocks Approve). Conservative: only explicit
 *   blocker/critical/high wording escalates to `error`; medium/warn → `warn`; else `info`.
 * @param body Finding/candidate message text.
 * @returns One of `error` | `warn` | `info`.
 */
function _deriveSeverity(body: string): 'error' | 'warn' | 'info' {
  const b = body.toLowerCase();
  if (/\b(blocker|critical|high)\b|severity[:=]\s*(error|high)/.test(b)) return 'error';
  if (/\b(medium|med|warn(?:ing)?)\b/.test(b)) return 'warn';
  return 'info';
}

/**
 * @purpose Read the current `revision` field from an already-materialized `review.json`, so a
 *   fresh materialization bumps it monotonically instead of resetting (D-99 CAS input).
 * @invariant Absent/unreadable/malformed file → `0`, matching `ContextAssembler#_readReviewRevision`'s
 *   default so a first-ever materialization and a pre-TSK-127 file behave identically.
 * @param dir Report directory (`reports/<mr>/`).
 * @returns Current `revision`, or `0` when absent.
 */
function _readCurrentRevision(dir: string): number {
  const filePath = join(dir, 'review.json');
  if (!existsSync(filePath)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    return typeof parsed['revision'] === 'number' ? (parsed['revision'] as number) : 0;
  } catch {
    return 0;
  }
}

/**
 * @purpose Persist the review as STRUCTURED data (`review.json`) next to README.md, so the dashboard's
 *   candidates panel/action bundle renders the real findings (file:line + severity + message) and the
 *   operator can select/post them — the README prose alone is not machine-addressable.
 * @invariant Only concrete per-line candidates (a `file` position) become findings; the one general
 *   cross-cutting summary action (no position) is left to the README prose, not the post list.
 * @invariant Each finding carries a stable `id` (`F-<1-based index>`) so `MutationApplier` (TSK-127)
 *   can target one deterministically; `revision` increments monotonically across materializations
 *   (D-99) — a re-review after a chat mutation invalidates any turn's CAS input, by design.
 * @param ctx Node context at a synthesis gate.
 * @sideEffect FS: writes `<reports>/<mr>/review.json` = `{ verdict, findings[], revision }`.
 */
function materializeReviewJson(ctx: NodeContext): void {
  const synth =
    (ctx.artifacts['node_synthesize'] as Record<string, unknown> | undefined) ??
    (ctx.artifacts['node_synthesize_delta'] as Record<string, unknown> | undefined);
  const stateDir = ctx.store?.getStateDir();
  if (!synth || !stateDir) return;

  try {
    const report = (synth['reviewReport'] as Record<string, unknown>) ?? {};
    const verdict =
      typeof report['verdict'] === 'string' ? (report['verdict'] as string) : 'pending';
    const actions = Array.isArray(synth['proposedActions'])
      ? (synth['proposedActions'] as Array<Record<string, unknown>>)
      : [];
    const recs = Array.isArray(synth['recommendations'])
      ? (synth['recommendations'] as Array<Record<string, unknown>>)
      : [];
    const source = actions.length ? actions : recs;

    const findings = source
      .map((a, index) => {
        const message =
          typeof a['body'] === 'string'
            ? (a['body'] as string)
            : typeof a['message'] === 'string'
              ? (a['message'] as string)
              : '';
        const file = typeof a['file'] === 'string' ? (a['file'] as string) : '';
        const line =
          typeof a['newLine'] === 'number'
            ? (a['newLine'] as number)
            : typeof a['line'] === 'number'
              ? (a['line'] as number)
              : 0;
        return { id: `F-${index + 1}`, severity: _deriveSeverity(message), file, line, message };
      })
      .filter((f) => f.file && f.message);

    const ref = `${ctx.mr.project}!${ctx.mr.iid}`;
    const dir = mrReportsDir(stateDir, ref);
    const revision = _readCurrentRevision(dir) + 1;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'review.json'),
      JSON.stringify({ verdict, findings, revision }, null, 2)
    );
  } catch (cause) {
    logger.warn('[reviewerGraph#materializeReviewJson] [writing → degraded]', {
      mr: ctx.mr.webUrl,
      error: String(cause),
    });
  }
}

/**
 * @purpose Read pre-seeded stage/headChanged signals from artifacts and pick the branch.
 * @invariant review_needed also materializes the scaffold pipeline to disk (gap-2, TSK-122) —
 *   still no LLM, no vcs-* writes; FS-only, consistent with the prep-node contract.
 * @param ctx MR context and accumulated artifacts.
 * @returns Branch selector consumed by the graph's edges.
 * @sideEffect FS: `materializeReviewScaffold` writes PLAN.md/tasks/*.task.md on the review_needed
 *   branch (best-effort, degrades silently — see that function's invariant).
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
  materializeReviewScaffold(ctx);
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
        tools: true,
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
        tools: true,
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
        tools: true,
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
        tools: true,
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
        tools: true,
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
        tools: true,
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
        // gap-2 (TSK-122): materialize README.md (with mermaid) to disk right after synthesis
        // passes — node_ask (next) only reads ctx.artifacts, never disk, so a dry pass that stops
        // at awaiting_operator (no operator answer yet) still leaves the real-proof artifact on disk.
        materializeSynthesisReadme(ctx);
        materializeReviewJson(ctx);
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
        tools: true,
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
        // gap-2 (TSK-122): materialize README.md (with mermaid) to disk right after synthesis
        // passes — node_ask (next) only reads ctx.artifacts, never disk, so a dry pass that stops
        // at awaiting_operator (no operator answer yet) still leaves the real-proof artifact on disk.
        materializeSynthesisReadme(ctx);
        materializeReviewJson(ctx);
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
        // README.md materialization (gap-2, TSK-122) happens earlier, at gate_review_synthesis/
        // gate_delta_synthesis — this node only stages; see role-instance.ts#_executeEffect's
        // EffectExecutor dispatch after this run() returns.
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
