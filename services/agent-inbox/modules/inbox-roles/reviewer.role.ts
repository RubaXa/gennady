// @file: ReviewerRole — three branches from `prepare` (prep): review_needed (fan-out battery +
//   security lens + code-review diff → synthesize), reply_needed (thread-triage, no full battery),
//   update-review (delta-only). Parity with the CLI D57/D70 pipeline (NFC-SV-07/08/09).
// @consumers: RoleEngine, role-engine.test.ts, reviewer.role.test.ts
// @tasks: TSK-113, TSK-121, TSK-122, TSK-127

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import type {
  RoleDefinition,
  RoleGraph,
  NodeContext,
  GateResult,
  PrepResult,
  ChangesetFile,
  ToolPolicy,
} from './role-node.ts';
import {
  buildReviewPlan,
  scaffoldReviewReports,
} from '../../../../cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts';
import { mrReportsDir } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import {
  buildTrackContext,
  type MrShape,
  type InjectedEntity,
} from '../inbox-core/context-builder.ts';

/**
 * @purpose Tool allowlist for the three `review_needed` lens sessions (D-118..D-123, AI-41).
 * @invariant read+grep only, bash (and write/edit) denied — really enforced at the adapter
 *   boundary via `ToolGate` composition (see `ToolPolicy`).
 */
const REVIEW_LENS_TOOL_POLICY: ToolPolicy = { bash: false, read: true, grep: true };

/**
 * @purpose Zero-tools allowlist for `node_synthesize` (D-120) — sees only the context injected
 *   into its task text (filled track scaffolds), never reads/greps/shells on its own.
 */
const SYNTHESIZE_TOOL_POLICY: ToolPolicy = { bash: false, read: false, grep: false };

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
 * @invariant Also the sole producer of `NodeContext.mrShape`/`injectedEntities` (TSK-113 Round 2) —
 *   both reuse the SAME `buildTrackContext` (TSK-134) pass, never independently recomputed.
 * @invariant Degrade-open: absent changesetFiles/baseSha/headSha/stateDir is a silent no-op —
 *   never blocks the graph; returns `{}` in that case.
 * @invariant `mrShape` reuses the `security` track's full-MR `buildTrackContext` call as the
 *   canonical statanalysis — one extra git-diff spawn beyond the per-track loop (perf nit, logged).
 * @param ctx Node context — reads `changesetFiles`/`baseSha`/`headSha`/`worktreePath` staged by
 *   `buildNodeContext`.
 * @returns `mrShape`/`injectedEntities` (flattened across scaffolded tracks) for `PrepResult`,
 *   or `{}` when the scaffold pass degraded/skipped.
 * @sideEffect FS: writes PLAN.md/tasks/*.task.md/README.md/HISTORY.md under reports dir (NFC-05).
 *   With `worktreePath`: spawns `git diff`/`git log` subprocesses (TSK-134).
 */
async function materializeReviewScaffold(ctx: NodeContext): Promise<{
  mrShape?: MrShape;
  injectedEntities?: InjectedEntity[];
}> {
  const changesetFiles = ctx.artifacts['changesetFiles'] as ChangesetFile[] | undefined;
  const baseSha = ctx.artifacts['baseSha'] as string | undefined;
  const headSha = ctx.artifacts['headSha'] as string | undefined;
  const worktreePath = ctx.artifacts['worktreePath'] as string | undefined;
  const stateDir = ctx.store?.getStateDir();

  if (!changesetFiles?.length || !baseSha || !headSha || !stateDir) return {};

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
    const scaffold = await scaffoldReviewReports(
      dir,
      ref,
      headSha,
      baseSha,
      plan,
      changeset,
      worktreePath
    );
    const injectedEntities = Object.values(scaffold.injectedEntities ?? {}).flat();

    if (!worktreePath) return { injectedEntities };

    // #region START_DERIVE_MR_SHAPE — reuses the security track's full-changeset diff pass; see
    // this function's @invariant on why `security` is the canonical source, not a re-derivation.
    const { mrShape } = await buildTrackContext('security', changeset, baseSha, worktreePath);
    return { mrShape, injectedEntities };
    // #endregion END_DERIVE_MR_SHAPE
  } catch (cause) {
    logger.warn('[reviewerGraph#materializeReviewScaffold] [scaffolding → degraded]', {
      mr: ctx.mr.webUrl,
      error: String(cause),
    });
    return {};
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
 * @purpose Classify a finding's severity from its prose — drives chip colour and the AI-13 approve
 *   gate; blocker/critical/high → `error`, medium/warn → `warn`, else `info`.
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
 * @purpose Reports-dir path for a lens's engine-persisted result file (D-118..D-123) — the engine
 *   writes this, the lens session's own tools never include write.
 * @invariant NOT `tasks/<classify-track>.task.md` — a lens can span several classify-tracks
 *   (open item, P5 Handoff). Keyed by session id, under the same `tasks/` dir.
 * @param stateDir `StateStore.getStateDir()`.
 * @param ref `group/project!iid` MR reference.
 * @param lensId Session/spec id.
 * @returns Absolute path for the engine to write/read this lens's structured result.
 */
function _lensResultPath(stateDir: string, ref: string, lensId: string): string {
  return join(mrReportsDir(stateDir, ref), 'tasks', `${lensId}.result.json`);
}

/**
 * @purpose Absolute paths of the classify-track task-blanks `node_prepare` materialized (TSK-134)
 *   — carry the Context section a lens must read instead of the raw diff.
 * @invariant Not track-scoped: the three lenses share these files, already split once per changeset.
 * @param ctx Node context — needs `ctx.store` for the reports dir; degrades open otherwise.
 * @returns Absolute `tasks/*.task.md` paths, or `[]` when the scaffold never ran or the dir is absent.
 */
function _contextTaskBlankPaths(ctx: NodeContext): string[] {
  const stateDir = ctx.store?.getStateDir();
  if (!stateDir) return [];
  const ref = `${ctx.mr.project}!${ctx.mr.iid}`;
  const tasksDir = join(mrReportsDir(stateDir, ref), 'tasks');
  if (!existsSync(tasksDir)) return [];
  try {
    return readdirSync(tasksDir)
      .filter((f) => f.endsWith('.task.md'))
      .map((f) => join(tasksDir, f));
  } catch {
    return [];
  }
}

/**
 * @purpose Task-text suffix (Round 3) pointing a review_needed lens at its already-materialized
 *   Context section, instead of the recompute-diff-yourself path that drove excess round-trips.
 * @invariant Degrade-open: no materialized task-blanks → empty suffix, unchanged prior behaviour.
 * @param ctx Node context — forwarded to `_contextTaskBlankPaths`.
 * @returns Instruction suffix naming the concrete file paths, or `''` when none exist.
 */
function _contextInjectionInstruction(ctx: NodeContext): string {
  const paths = _contextTaskBlankPaths(ctx);
  if (paths.length === 0) return '';
  const fileWord = paths.length === 1 ? 'file' : 'files';
  // TSK-131 round-trip investigation: these files can be large (a whole-MR diff can exceed
  // hundreds of KB) — a single `read` call on one can fail outright, and the model was observed
  // spending 10+ calls oscillating between a failing `read` and a `bash cat` fallback that this
  // policy denies (no tool feedback tells it why). Both facts stated up front avoid that dead end.
  return `\n\nContext already computed and written to disk (TSK-134) — read the \`## Контекст\` section of the following ${fileWord} instead of running git diff/log yourself:\n${paths.map((p) => `- ${p}`).join('\n')}\n\nThese files may be large. You have NO bash/shell tool in this turn — do not try \`cat\`/\`head\`/shell commands as a fallback, it will be denied. If a single \`read\` on one of these files fails or is truncated, use \`grep\` against it to pull the specific sections you need instead of retrying the same full read.`;
}

/**
 * @purpose Build a `persistResult` hook bound to one lens id — the engine calls this after a
 *   successful outcome and writes the result itself (`RoleInstance#_persistNodeResult`).
 * @param lensId Session/spec id this hook persists for.
 * @returns A `persistResult` function — degrade-open (undefined) when `ctx.store` is absent.
 */
function _persistLensResult(
  lensId: string
): (
  ctx: NodeContext,
  output: Record<string, unknown>
) => { path: string; content: string } | undefined {
  return (ctx, output) => {
    const stateDir = ctx.store?.getStateDir();
    if (!stateDir) return undefined;
    const ref = `${ctx.mr.project}!${ctx.mr.iid}`;
    return {
      path: _lensResultPath(stateDir, ref, lensId),
      content: JSON.stringify(output, null, 2),
    };
  };
}

/**
 * @purpose Read one lens's engine-persisted result from disk — `node_synthesize`'s zero-tools
 *   contract: the session never reads anything itself, only this orchestrator-side injection.
 * @invariant Degrade-open: absent store/file/unparsable content → `fallback` (keeps tests working
 *   without a real reports dir on disk).
 * @param ctx Node context — needs `ctx.store` for the reports dir.
 * @param lensId Lens session id whose result to read.
 * @param fallback Value to use when the disk read degrades (typically `ctx.artifacts[lensId]`).
 * @returns The parsed JSON content, or `fallback`.
 */
function _readLensResult(
  ctx: NodeContext,
  lensId: string,
  fallback: Record<string, unknown>
): Record<string, unknown> {
  const stateDir = ctx.store?.getStateDir();
  if (!stateDir) return fallback;
  try {
    const ref = `${ctx.mr.project}!${ctx.mr.iid}`;
    const path = _lensResultPath(stateDir, ref, lensId);
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return fallback;
  }
}

/**
 * @purpose Top-level shape check for a lens's disk artifact — `findings` must be an array.
 * @param title Schema title (matches the node id).
 * @returns JSON Schema validated by `resolveDiskArtifact`.
 */
function _lensArtifactSchema(title: string): Record<string, unknown> {
  return {
    title,
    type: 'object',
    required: ['findings'],
    properties: {
      findings: { type: 'array' },
    },
  };
}

/**
 * @purpose Pins the per-finding field name — a lens once returned `summary`, silently dropping a
 *   real finding at collection. Appended to every lens's `buildTaskText`.
 */
const LENS_FINDING_SHAPE_INSTRUCTION =
  ' Each finding: {"file": "path", "line": 123, "severity": "error|warn|info", "message": "..."} — the field is named "message", not "summary"/"detail"/"description".';

/**
 * @purpose Required non-empty `reviewReport` fields — both synthesis gates fail+retry on gaps
 *   instead of silently shipping an "n/a" placeholder as final.
 * @invariant `architectureDiagram` is NOT required here — `_renderSynthesisReadme` already has a
 *   deterministic fallback (`_buildMinimalChangeGraph`) for it, so its absence is not a defect.
 */
const REQUIRED_REVIEW_REPORT_FIELDS = ['summary', 'verdict', 'behavior', 'scenarios'] as const;

/**
 * @purpose Check a synthesis session's `reviewReport` for missing/empty required fields.
 * @param reviewReport The `reviewReport` object from a synthesize node's artifact (may be absent).
 * @returns Field names that are missing, non-string, or blank — empty array when complete.
 */
function _missingReviewReportFields(reviewReport: unknown): string[] {
  const report = (reviewReport ?? {}) as Record<string, unknown>;
  return REQUIRED_REVIEW_REPORT_FIELDS.filter((key) => {
    const value = report[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

/**
 * @purpose Read back a prior gate failure reason so a retry sees WHY it failed, not blind repeat
 *   (`_fail_reason` was previously diagnostics-only).
 * @param ctx Node context — reads `${nodeId}_fail_reason` set by `role-instance.ts` on gate fail.
 * @param nodeId The synthesize node's id (`node_synthesize` | `node_synthesize_delta`).
 * @returns Corrective instruction prefix, or `''` on a first attempt (no prior failure recorded).
 */
function _synthesisRetryHint(ctx: NodeContext, nodeId: string): string {
  const reason = ctx.artifacts[`${nodeId}_fail_reason`];
  if (typeof reason !== 'string' || !reason) return '';
  return `\n\n### Предыдущая попытка не прошла проверку\n${reason}\nИсправь именно это в этот раз — не повторяй тот же неполный ответ.`;
}

/**
 * @purpose Task-text suffix instructing a synthesize node to write its JSON result to disk
 *   (TSK-127) — same protocol as the lenses, larger synthesis shape.
 * @param file Artifact path, relative to the session's working directory.
 * @returns Markdown instruction suffix appended to a synthesize node's `buildTaskText`.
 */
function _synthesizeArtifactInstruction(file: string): string {
  return `\n\n### Output contract\nWrite your result STRICTLY as JSON to the file \`${file}\` (relative to your working directory) using your file-write tool. Your JSON must have this shape: { "reviewReport": { "summary": "...", "verdict": "...", "behavior": "что реально меняется в поведении по этому диффу — не «n/a», опиши по факту diff'а", "scenarios": "1-2 конкретных бизнес-сценария, которые это затрагивает" }, "proposedActions": [ { "file": "path", "newLine"?: number, "body": "..." }, ... ] } — proposedActions MAY be an empty array, but reviewReport.summary/verdict/behavior/scenarios are ALL REQUIRED non-empty strings; a gate rejects the result and asks you to retry if any is missing or blank. Reply with only a one-line confirmation; do NOT paste the JSON into your reply.`;
}

/**
 * @purpose Top-level shape check for a synthesize node's disk artifact.
 * @param title Schema title (matches the node id).
 * @returns JSON Schema validated by `resolveDiskArtifact`.
 */
function _synthesizeArtifactSchema(title: string): Record<string, unknown> {
  return {
    title,
    type: 'object',
    required: ['reviewReport'],
    properties: {
      reviewReport: { type: 'object' },
      proposedActions: { type: 'array' },
    },
  };
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

/** @purpose One normalized finding collected from a lens's validated disk artifact, pre-dedup/pre-id. */
type CollectedFinding = {
  file: string;
  line: number;
  severity?: string;
  message: string;
};

/**
 * @purpose Read one lens's `findings` array (validated disk JSON — TSK-127) and normalize each
 *   entry: `file` may carry a trailing `:line`; `message`/`detail` both accepted.
 * @param artifact The lens's `ctx.artifacts[lensId]` object, or undefined if the lens never ran.
 * @returns Normalized findings — empty when the artifact is absent or has no findings.
 */
function _normalizeLensFindings(artifact: Record<string, unknown> | undefined): CollectedFinding[] {
  const findings = Array.isArray(artifact?.['findings'])
    ? (artifact!['findings'] as Array<Record<string, unknown>>)
    : [];

  return findings
    .map((f) => {
      // Accepts `message`/`detail`/`summary` as synonyms — a lens session may drift on the exact
      // key name despite buildTaskText pinning "message" explicitly (found live: node_track_review
      // returned `summary`, silently dropped a real finding since only message/detail were checked).
      const message =
        typeof f['message'] === 'string'
          ? (f['message'] as string)
          : typeof f['detail'] === 'string'
            ? (f['detail'] as string)
            : typeof f['summary'] === 'string'
              ? (f['summary'] as string)
              : '';
      const rawFile = typeof f['file'] === 'string' ? (f['file'] as string) : '';
      let file = rawFile;
      let line = typeof f['line'] === 'number' ? (f['line'] as number) : 0;
      const trailing = rawFile.match(/^(.*):(\d+)$/);
      if (trailing && !line) {
        file = trailing[1]!;
        line = Number(trailing[2]);
      }
      const severity = typeof f['severity'] === 'string' ? (f['severity'] as string) : undefined;
      return { file, line, severity, message };
    })
    .filter((f) => f.file && f.message);
}

/**
 * @purpose Merge findings from every lens artifact of the active branch — assembled in CODE, never
 *   from one mega-JSON synthesis response (TSK-127).
 * @param ctx Node context at a synthesis gate.
 * @param isDelta True on the update-review branch (`node_delta_review` only).
 * @returns Deduped findings (by file+line+message), each with a stable `F-<n>` id and severity.
 */
function _collectReviewFindings(
  ctx: NodeContext,
  isDelta: boolean
): Array<{ id: string; severity: string; file: string; line: number; message: string }> {
  const lensIds = isDelta
    ? ['node_delta_review']
    : ['node_track_review', 'node_security_lens', 'node_code_review'];

  const collected: CollectedFinding[] = [];
  for (const lensId of lensIds) {
    const artifact = ctx.artifacts[lensId] as Record<string, unknown> | undefined;
    collected.push(..._normalizeLensFindings(artifact));
  }

  const seen = new Set<string>();
  const deduped = collected.filter((f) => {
    const key = `${f.file} ${f.line} ${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.map((f, index) => ({
    id: `F-${index + 1}`,
    severity: f.severity ?? _deriveSeverity(f.message),
    file: f.file,
    line: f.line,
    message: f.message,
  }));
}

/**
 * @purpose Persist the review as STRUCTURED data (`review.json`) next to README.md, so the
 *   dashboard's candidates panel renders real findings and the operator can select/post them.
 * @invariant Findings are ASSEMBLED IN CODE from the lens artifacts' validated disk JSON
 *   (`_collectReviewFindings`, TSK-127) — never from the synthesis node's response text.
 * @invariant Each finding carries a stable `id` (`F-<1-based index>`) so `MutationApplier` (TSK-127)
 *   targets it; `revision` increments monotonically (D-99), so a re-review invalidates prior CAS input.
 * @param ctx Node context at a synthesis gate.
 * @sideEffect FS: writes `<reports>/<mr>/review.json` = `{ verdict, findings[], revision }`.
 */
function materializeReviewJson(ctx: NodeContext): void {
  const isDelta = !ctx.artifacts['node_synthesize'] && !!ctx.artifacts['node_synthesize_delta'];
  const synth =
    (ctx.artifacts['node_synthesize'] as Record<string, unknown> | undefined) ??
    (ctx.artifacts['node_synthesize_delta'] as Record<string, unknown> | undefined);
  const stateDir = ctx.store?.getStateDir();
  logger.info('[reviewerGraph#materializeReviewJson] [synthesize → writing]', {
    mr: ctx.mr.webUrl,
    hasSynth: !!synth,
    hasStateDir: !!stateDir,
  });
  if (!synth || !stateDir) {
    logger.warn('[reviewerGraph#materializeReviewJson] [synthesize → skipped]', {
      mr: ctx.mr.webUrl,
      reason: !synth ? 'no node_synthesize artifact' : 'no stateDir',
    });
    return;
  }

  try {
    const report = (synth['reviewReport'] as Record<string, unknown>) ?? {};
    const verdict =
      typeof report['verdict'] === 'string' ? (report['verdict'] as string) : 'pending';
    const findings = _collectReviewFindings(ctx, isDelta);

    const ref = `${ctx.mr.project}!${ctx.mr.iid}`;
    const dir = mrReportsDir(stateDir, ref);
    const revision = _readCurrentRevision(dir) + 1;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'review.json'),
      JSON.stringify({ verdict, findings, revision, role: ctx.mr.myRole }, null, 2)
    );
    logger.info('[reviewerGraph#materializeReviewJson] [writing → done]', {
      mr: ctx.mr.webUrl,
      path: join(dir, 'review.json'),
      findings: findings.length,
      revision,
    });
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
  const { mrShape, injectedEntities } = await materializeReviewScaffold(ctx);
  return { branch: 'review_needed', artifacts: { mrShape, injectedEntities } };
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
    // TSK-perf: track/security/code-review are independent (same worktree, disjoint artifact
    // keys, converge only at gate_review_filled below) — run them concurrently instead of the
    // former linear track→security→code chain. Each lens keeps its original id as its artifact
    // key, so gate_review_filled/node_synthesize below are unchanged.
    {
      kind: 'parallel',
      id: 'node_review_fanout',
      sessions: [
        {
          id: 'node_track_review',
          buildTaskText(ctx: NodeContext) {
            const tracks = (ctx.artifacts['tracks'] as string[] | undefined) ?? [];
            const trackList =
              tracks.length > 0 ? tracks.join(', ') : `full diff of ${ctx.mr.sourceBranch}`;
            return `Review MR ${ctx.mr.webUrl} (${ctx.mr.sourceBranch} → ${ctx.mr.targetBranch}). Cover tracks: ${trackList}. Report findings with file:line addresses from the changeset — an empty findings array is a valid, explicit no-findings result.${LENS_FINDING_SHAPE_INSTRUCTION}${_contextInjectionInstruction(ctx)}`;
          },
          dir(ctx: NodeContext) {
            return `${ctx.workspace}/worktree`;
          },
          resultSchema: _lensArtifactSchema('node_track_review'),
          persistResult: _persistLensResult('node_track_review'),
          policy: {
            promptTimeout: 10,
            continueMax: 3,
            restartMax: 2,
            tools: true,
            toolPolicy: REVIEW_LENS_TOOL_POLICY,
            model: 'llm-proxy/deepseek-v4-pro',
          },
        },
        {
          id: 'node_security_lens',
          buildTaskText(ctx: NodeContext) {
            return `Security lens over the WHOLE changeset of MR ${ctx.mr.webUrl} (NFC-SV-09) — not limited to per-track scope. Report findings with file:line addresses; explicit no-findings if clean.${LENS_FINDING_SHAPE_INSTRUCTION}${_contextInjectionInstruction(ctx)}`;
          },
          dir(ctx: NodeContext) {
            return `${ctx.workspace}/worktree`;
          },
          resultSchema: _lensArtifactSchema('node_security_lens'),
          persistResult: _persistLensResult('node_security_lens'),
          policy: {
            promptTimeout: 10,
            continueMax: 2,
            restartMax: 2,
            tools: true,
            toolPolicy: REVIEW_LENS_TOOL_POLICY,
            model: 'llm-proxy/deepseek-v4-pro',
          },
        },
        {
          id: 'node_code_review',
          buildTaskText(ctx: NodeContext) {
            const base = (ctx.artifacts['baseSha'] as string | undefined) ?? ctx.mr.targetBranch;
            return `Code-review diff base..HEAD (base=${base}) for MR ${ctx.mr.webUrl}. Focus on code-level correctness/simplicity, not architecture (already covered by track review).${LENS_FINDING_SHAPE_INSTRUCTION}${_contextInjectionInstruction(ctx)}`;
          },
          dir(ctx: NodeContext) {
            return `${ctx.workspace}/worktree`;
          },
          resultSchema: _lensArtifactSchema('node_code_review'),
          persistResult: _persistLensResult('node_code_review'),
          policy: {
            promptTimeout: 10,
            continueMax: 2,
            restartMax: 2,
            tools: true,
            toolPolicy: REVIEW_LENS_TOOL_POLICY,
            model: 'llm-proxy/deepseek-v4-pro',
          },
        },
      ],
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
        // TSK-perf: triage is a fast scan (not a full review battery) — flash model.
        model: 'llm-proxy/deepseek-v4-flash',
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
        return `Delta review of MR ${ctx.mr.webUrl}: base=${lastSha}..HEAD only. Check whether prior comments are closed and whether the new commits broke anything — do NOT re-review the whole MR.${LENS_FINDING_SHAPE_INSTRUCTION}`;
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
        return `Synthesize the delta-review findings for MR ${ctx.mr.webUrl} into a report: ${JSON.stringify(delta)}${_synthesizeArtifactInstruction('.gennady-artifacts/node_synthesize_delta.json')}${_synthesisRetryHint(ctx, 'node_synthesize_delta')}`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      artifact: {
        file: '.gennady-artifacts/node_synthesize_delta.json',
        schema: _synthesizeArtifactSchema('node_synthesize_delta'),
      },
      policy: {
        promptTimeout: 5,
        continueMax: 2,
        restartMax: 2,
        tools: true,
        model: 'llm-proxy/deepseek-v4-pro',
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
        const missing = _missingReviewReportFields(synth.reviewReport);
        if (missing.length > 0) {
          return {
            pass: false,
            reason: `reviewReport неполный — отсутствуют или пусты поля: ${missing.join(', ')}. Заполни их конкретным содержанием по этому диффу, не "n/a".`,
          };
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
        // D-120 zero-tools contract: this reads the lenses' engine-persisted disk results HERE, in
        // the orchestrator process — the synthesize SESSION itself gets no tools (SYNTHESIZE_TOOL_POLICY
        // below) and never touches disk; it only sees what this function inlines into its task text.
        const track = _readLensResult(
          ctx,
          'node_track_review',
          (ctx.artifacts['node_track_review'] as Record<string, unknown>) ?? {}
        );
        const security = _readLensResult(
          ctx,
          'node_security_lens',
          (ctx.artifacts['node_security_lens'] as Record<string, unknown>) ?? {}
        );
        const codeReview = _readLensResult(
          ctx,
          'node_code_review',
          (ctx.artifacts['node_code_review'] as Record<string, unknown>) ?? {}
        );
        return `Synthesize review findings for MR ${ctx.mr.webUrl} from track review, security lens, and code review into a unified report: ${JSON.stringify(
          { track, security, codeReview }
        )}. Reply with a JSON object with two top-level fields: "reviewReport" and "proposedActions".

"reviewReport" is REQUIRED and must have ALL FOUR of these non-empty string fields (a gate rejects the result and asks you to retry if any is missing or blank — do not write "n/a" or leave one out):
- "summary": one paragraph — what this MR does and why, from the three lenses' combined view.
- "verdict": overall reviewer verdict in one sentence (e.g. "approve", "changes requested — see findings").
- "behavior": what OBSERVABLE BEHAVIOR actually changes for this diff (not architecture, not code style — what a user/caller/API consumer would notice differently). Describe it concretely from the actual diff; never "n/a".
- "scenarios": 1-2 concrete business/use-case scenarios this change affects, grounded in what the lenses actually found.

"proposedActions" — do NOT call vcs-* yourself: one 'reply' action with a { file, newLine } position per concrete finding you want posted as a line comment, plus exactly one general 'reply' action with no position summarizing cross-cutting/architectural issues. May be an empty array.

You have NO tools in this turn — none at all, not even read-only ones. Everything you need is already inlined in the JSON above. Do not attempt to call, invoke, or write out any tool/function call (in any format — XML tags, JSON, prose describing a call) to read a file, run a command, or verify anything against the repository; you cannot, and any such attempt will fail this turn. Answer directly and only from the inlined JSON.${_synthesisRetryHint(ctx, 'node_synthesize')}`;
      },
      dir(ctx: NodeContext) {
        return `${ctx.workspace}/worktree`;
      },
      resultSchema: _synthesizeArtifactSchema('node_synthesize'),
      policy: {
        promptTimeout: 10,
        continueMax: 2,
        restartMax: 2,
        tools: true,
        // D-120: synthesize sees only what its task text embeds (lens findings, read from disk by
        // `_readLensResult` in the orchestrator process and JSON.stringify'd above) — it never
        // navigates the worktree or reads anything itself. `toolPolicy` composes to a fully-denying
        // `ToolGate` (`{'*': false, bash: false, read: false, grep: false}`) at the createSession
        // call (`_resolveSessionTools` → `OpenCodeReal#_composeToolsGate`) — really enforced, not
        // just declared (P5 fix round 2). The final response is structured JSON (`resultSchema`
        // above), never a disk write — no write tool is granted to this session either.
        toolPolicy: SYNTHESIZE_TOOL_POLICY,
        model: 'llm-proxy/deepseek-v4-pro',
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
        const missing = _missingReviewReportFields(synth.reviewReport);
        if (missing.length > 0) {
          return {
            pass: false,
            reason: `reviewReport неполный — отсутствуют или пусты поля: ${missing.join(', ')}. Заполни их конкретным содержанием по этому диффу, не "n/a".`,
          };
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
    { from: 'node_prepare', to: 'node_review_fanout', on: 'review_needed' },
    { from: 'node_prepare', to: 'node_thread_triage', on: 'reply_needed' },
    { from: 'node_prepare', to: 'node_delta_review', on: 'update-review' },

    // TSK-perf: track/security/code-review run concurrently inside node_review_fanout (kind:
    // 'parallel') — see its definition above for why they're independent.
    { from: 'node_review_fanout', to: 'gate_review_filled', on: 'ok' },
    { from: 'gate_review_filled', to: 'node_synthesize', on: 'pass' },
    { from: 'gate_review_filled', to: 'node_review_fanout', on: 'fail' },
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

    { from: 'node_ask', to: 'node_effect', on: 'answered' },
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
