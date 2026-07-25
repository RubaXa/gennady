// @file: State-restore reconciliation for serve start/tick — scans reports/<mr>/ on disk,
//   reconciles against the current actionable set, and recovers pre-D-86 legacy artifacts
//   (PLAN.md/HISTORY.md/tasks/*.task.md without review.json) into the canonical review.json shape.
// @consumers: RoleScheduler
// @tasks: TSK-140

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { logger } from '#logger';
import type { RoleGraph } from './role-node.ts';
import type { RoleInstanceCheckpoint } from './role-instance.ts';
import type { VcsInboxPort } from '../inbox-core/vcs-inbox.port.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import { mrKey } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { buildNodeContext, fetchDiffRefsLive, type ContextBuilderDeps } from './context-builder.ts';

/**
 * @purpose On-disk shape a per-MR report directory was recognized as (D-127..D-129).
 * @invariant `canonical` — `review.json` present, already authoritative, never re-recovered.
 * @invariant `legacy` — pre-D-86 scaffold artifact (`PLAN.md`/`HISTORY.md`/`tasks/*.task.md`),
 *   no `review.json` — recovery candidate.
 * @invariant `unknown` — directory exists but matches neither recognized shape.
 */
export type ArtifactFormat = 'canonical' | 'legacy' | 'unknown';

/** @purpose One directory found under `legacyReportsRoot` with its detected format. */
export type MrArtifactSnapshot = {
  /** @purpose Directory name, `mrKey` format (`group__project-iid`) | @invariant Matches `mrKey(`${mr.project}!${mr.iid}`)` for the same MR */
  dirName: string;
  /** @purpose Absolute path to the per-MR directory */
  dir: string;
  /** @purpose Detected on-disk artifact shape */
  format: ArtifactFormat;
};

/** @purpose One structured finding as persisted in canonical `review.json` (materializeReviewJson-compatible). */
export type PersistedReviewFinding = {
  /** @purpose Stable id (`F-<1-based index>`) */
  id: string;
  /** @purpose `error` | `warn` | `info` */
  severity: string;
  /** @purpose File path the finding refers to */
  file: string;
  /** @purpose Line number the finding refers to | @invariant `0` when unknown */
  line: number;
  /** @purpose Finding prose */
  message: string;
};

/** @purpose Canonical `review.json` content (D-99 CAS input: `revision` increments monotonically). */
export type PersistedReviewJson = {
  /** @purpose Free-form verdict prose, mirrors `reviewer.role.ts#materializeReviewJson` */
  verdict: string;
  /** @purpose Structured findings */
  findings: PersistedReviewFinding[];
  /** @purpose Monotonic revision counter | @invariant `0` when absent, matches D-99 default */
  revision: number;
};

/** @purpose Reconciliation decision for one actionable MR (D-127..D-129). */
export type ReconciliationAction = 'resume' | 'recover' | 'fresh';

/** @purpose One MR's reconciliation outcome — the plan `RoleScheduler` acts on instead of blindly creating a fresh instance. */
export type MrReconciliation = {
  /** @purpose The actionable MR this decision applies to */
  mr: VcsActionableMr;
  /** @purpose `resume` restores from a canonical snapshot; `recover` re-verifies a legacy snapshot first; `fresh` is today's from-zero path */
  action: ReconciliationAction;
  /** @purpose Disk snapshot backing `resume`/`recover`; absent for `fresh` */
  snapshot?: MrArtifactSnapshot;
};

/** @purpose Full reconciliation plan across the actionable set — one entry per MR. */
export type ReconciliationPlan = MrReconciliation[];

/** @purpose One legacy finding's outcome against the CURRENT diff — never a blind carry-over (D-129). */
export type RecoveredFinding = PersistedReviewFinding & {
  /** @purpose `confirmed` — file provably unchanged since the legacy artifact's recorded head; `stale` — file changed, or re-verification could not be established (conservative default) */
  recoveryStatus: 'confirmed' | 'stale';
};

/** @purpose Dependencies `recoverLegacyArtifact` needs to resolve the CURRENT diff for re-verification. */
export type RecoverLegacyArtifactDeps = {
  /** @purpose VCS adapter for MR metadata */
  vcs: VcsInboxPort;
  /** @purpose State store — registry + state dir for worktree resolution */
  store: StateStore;
  /** @purpose Override for diff_refs resolution — injectable for tests; defaults to `fetchDiffRefsLive` */
  fetchDiffRefs?: ContextBuilderDeps['fetchDiffRefs'];
};

/**
 * @purpose Root of the pre-D-86 flat legacy reports tree — distinct from the current nested
 *   `mrs/<key>/report/` layout (`mrReportsDir`); this is the ONLY tree `scanReportsDir` reads.
 * @param stateDir Gennady state root.
 * @returns Absolute `<stateDir>/agent-inbox/reports` path.
 */
export function legacyReportsRoot(stateDir: string): string {
  return join(stateDir, 'agent-inbox', 'reports');
}

/**
 * @purpose Root of the current (post-TSK-131) per-MR tree — `<stateDir>/agent-inbox/mrs`.
 * @invariant Contains one `<mrKey>/` dir per MR, each with `worktree/` + `report/` children.
 * @param stateDir Gennady state root.
 * @returns Absolute `<stateDir>/agent-inbox/mrs` path.
 */
export function currentReportsRoot(stateDir: string): string {
  return join(stateDir, 'agent-inbox', 'mrs');
}

/**
 * @purpose Absolute path of one MR's legacy report directory — `dirName` uses the same `mrKey`
 *   encoding `reconcileActionable` computes per actionable MR.
 * @param stateDir Gennady state root.
 * @param dirName `mrKey`-format directory name.
 * @returns Absolute directory path.
 */
export function legacyReportDir(stateDir: string, dirName: string): string {
  return join(legacyReportsRoot(stateDir), dirName);
}

/**
 * @purpose Classify one report directory's on-disk shape.
 * @param dir Absolute directory path.
 * @returns `canonical` | `legacy` | `unknown`.
 */
function _detectArtifactFormat(dir: string): ArtifactFormat {
  if (existsSync(join(dir, 'review.json'))) return 'canonical';

  const hasPlan = existsSync(join(dir, 'PLAN.md'));
  const hasHistory = existsSync(join(dir, 'HISTORY.md'));
  const tasksDir = join(dir, 'tasks');
  const hasTaskFiles =
    existsSync(tasksDir) && readdirSync(tasksDir).some((f) => f.endsWith('.task.md'));

  if (hasPlan || hasHistory || hasTaskFiles) return 'legacy';
  return 'unknown';
}

/**
 * @purpose Scan the legacy reports tree and classify every MR directory found (D-127: artifacts,
 *   not the registry, are the source of truth).
 * @param stateDir Gennady state root.
 * @returns One snapshot per directory found; empty array when the tree is absent.
 * @sideEffect FS: reads `legacyReportsRoot` directory listing and per-entry marker files.
 */
export function scanReportsDir(stateDir: string): MrArtifactSnapshot[] {
  const root = legacyReportsRoot(stateDir);
  if (!existsSync(root)) return [];

  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch (cause) {
    logger.warn('[scanReportsDir] [scanning → degraded]', { root, error: String(cause) });
    return [];
  }

  const snapshots: MrArtifactSnapshot[] = [];
  for (const dirName of entries) {
    const dir = join(root, dirName);
    let isDirectory: boolean;
    try {
      isDirectory = statSync(dir).isDirectory();
    } catch {
      continue;
    }
    if (!isDirectory) continue;
    snapshots.push({ dirName, dir, format: _detectArtifactFormat(dir) });
  }
  return snapshots;
}

/**
 * @purpose Scan the CURRENT (post-TSK-131) per-MR tree for `report/` dirs containing a canonical
 *   `review.json` — `mrs/<key>/report/` layout, sibling to the legacy flat `reports/` tree.
 * @invariant `dirName` = the `<mrKey>` directory name under `mrs/`; `dir` = `report/` inside it.
 * @param stateDir Gennady state root.
 * @returns One snapshot per MR whose `report/` dir holds a recognizable artifact shape.
 * @sideEffect FS: reads `currentReportsRoot` directory listing + per-key `report/` marker files.
 */
export function scanCurrentReportsDir(stateDir: string): MrArtifactSnapshot[] {
  const root = currentReportsRoot(stateDir);
  if (!existsSync(root)) return [];

  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch (cause) {
    logger.warn('[scanCurrentReportsDir] [scanning → degraded]', { root, error: String(cause) });
    return [];
  }

  const snapshots: MrArtifactSnapshot[] = [];
  for (const dirName of entries) {
    const mrDir = join(root, dirName);
    let isDirectory: boolean;
    try {
      isDirectory = statSync(mrDir).isDirectory();
    } catch {
      continue;
    }
    if (!isDirectory) continue;

    const reportDir = join(mrDir, 'report');
    try {
      if (!statSync(reportDir).isDirectory()) continue;
    } catch {
      continue;
    }

    snapshots.push({ dirName, dir: reportDir, format: _detectArtifactFormat(reportDir) });
  }
  return snapshots;
}

/**
 * @purpose Read an already-materialized canonical `review.json`.
 * @param dir Report directory (legacy tree or otherwise) expected to contain `review.json`.
 * @returns Parsed content, or `undefined` when absent/unreadable — never throws.
 * @sideEffect FS: reads `<dir>/review.json`.
 */
export function readCanonicalReview(dir: string): PersistedReviewJson | undefined {
  const filePath = join(dir, 'review.json');
  if (!existsSync(filePath)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const verdict = typeof parsed.verdict === 'string' ? parsed.verdict : 'pending';
    const findings = Array.isArray(parsed.findings)
      ? (parsed.findings as PersistedReviewFinding[])
      : [];
    const revision = typeof parsed.revision === 'number' ? parsed.revision : 0;
    return { verdict, findings, revision };
  } catch (cause) {
    logger.warn('[readCanonicalReview] [reading → degraded]', { dir, error: String(cause) });
    return undefined;
  }
}

/**
 * @purpose Reconcile the actionable MR set against the disk snapshot — replaces the
 *   `!existingInstance` guard's blind-recreate with a disk-aware plan (SV-15..SV-18).
 * @invariant `inbox-registry.json` is NEVER consulted here — reconciliation is disk + GitLab only
 *   (D-127); absence/corruption of the registry cannot affect this function's output.
 * @param diskSnapshots Result of `scanReportsDir`.
 * @param actionableMrs Current actionable set from `vcs.getActionable()`.
 * @returns One reconciliation decision per actionable MR.
 */
export function reconcileActionable(
  diskSnapshots: MrArtifactSnapshot[],
  actionableMrs: VcsActionableMr[]
): ReconciliationPlan {
  const byDirName = new Map(diskSnapshots.map((s) => [s.dirName, s]));

  return actionableMrs.map((mr) => {
    const dirName = mrKey(`${mr.project}!${mr.iid}`);
    const snapshot = byDirName.get(dirName);

    if (!snapshot || snapshot.format === 'unknown') {
      return { mr, action: 'fresh' };
    }
    if (snapshot.format === 'canonical') {
      return { mr, action: 'resume', snapshot };
    }
    return { mr, action: 'recover', snapshot };
  });
}

/**
 * @purpose Build a `RoleInstance` checkpoint resuming at the graph's operator gate instead of
 *   re-running the whole battery from zero.
 * @invariant Role-agnostic: locates the first `ask`-kind node (reviewer/author graphs both
 *   converge to one); absent, falls back to the graph's first node — artifact-seeded fresh start.
 * @param graph The role's graph (from `RoleEngine.retrieve(role.name)`).
 * @param review Canonical review content to seed into resumed artifacts.
 * @returns Checkpoint suitable for `RoleInstanceOpts.checkpoint`.
 */
export function buildResumeCheckpoint(
  graph: RoleGraph,
  review: PersistedReviewJson
): RoleInstanceCheckpoint {
  const askNode = graph.nodes.find((n) => n.kind === 'ask');
  const findings = review.findings.map((f) => ({
    file: f.file,
    line: f.line,
    severity: f.severity,
    message: f.message,
  }));

  return {
    currentNode: askNode?.id ?? graph.nodes[0]?.id ?? '',
    continueCount: 0,
    restartCount: 0,
    artifacts: {
      diskRecovery: {
        verdict: review.verdict,
        findings: review.findings,
        revision: review.revision,
      },
      node_synthesize: {
        reviewReport: {
          summary: `Auto-recovered from disk — ${review.findings.length} findings, verdict: ${review.verdict}`,
          verdict: review.verdict,
          behavior: 'n/a — recovered from disk after serve restart',
          scenarios: 'n/a — recovered from disk after serve restart',
        },
        recommendations: findings,
        proposedActions: [],
      },
    },
  };
}

/**
 * @purpose Read one `key: value` field from a file's leading YAML-lite frontmatter block.
 * @param content Full file content.
 * @param key Frontmatter key (no colon).
 * @returns Trimmed value, or `undefined` when the frontmatter block or key is absent.
 */
function _readFrontmatterField(content: string, key: string): string | undefined {
  const block = content.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!block) return undefined;
  const line = block.split('\n').find((l) => l.startsWith(`${key}:`));
  return line?.slice(key.length + 1).trim() || undefined;
}

/**
 * @purpose Recorded head SHA at legacy-artifact creation time — the reference point re-verification
 *   diffs the CURRENT head against (D-129: never the artifact's own creation-time diff).
 * @param dir Legacy report directory.
 * @returns `PLAN.md`'s frontmatter `headSha`, or `undefined` when absent/unreadable.
 */
function _readRecordedHeadSha(dir: string): string | undefined {
  const planPath = join(dir, 'PLAN.md');
  if (!existsSync(planPath)) return undefined;
  try {
    return _readFrontmatterField(readFileSync(planPath, 'utf-8'), 'headSha');
  } catch (cause) {
    logger.warn('[artifact-recovery#_readRecordedHeadSha] [reading → degraded]', {
      dir,
      error: String(cause),
    });
    return undefined;
  }
}

/**
 * @purpose Latest recorded verdict prose from `HISTORY.md`'s last row (outcome column) — the
 *   recorded verdict D-129 requires re-verification to start from.
 * @param dir Legacy report directory.
 * @returns Verdict prose, or `undefined` when `HISTORY.md` is absent/unreadable/empty.
 */
function _readLatestHistoryVerdict(dir: string): string | undefined {
  const historyPath = join(dir, 'HISTORY.md');
  if (!existsSync(historyPath)) return undefined;
  try {
    const lines = readFileSync(historyPath, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('|'));
    const rows = lines.slice(2); // header + separator
    const rawCells = rows.at(-1)?.split('|');
    if (!rawCells) return undefined;
    const cells = rawCells.slice(1, rawCells.length - 1).map((c) => c.trim());
    return cells[3] || undefined; // columns: date|headSha|mode|outcome|tasks
  } catch (cause) {
    logger.warn('[artifact-recovery#_readLatestHistoryVerdict] [reading → degraded]', {
      dir,
      error: String(cause),
    });
    return undefined;
  }
}

/**
 * @purpose Map a candidate table's free-form importance column to the canonical severity vocabulary.
 * @param importance Raw column text (legacy prose, e.g. low/medium/high in the original language).
 * @returns `error` | `warn` | `info`.
 */
function _severityFromImportance(importance: string): string {
  const v = importance.toLowerCase();
  if (v.includes('высок') || v.includes('критич')) return 'error';
  if (v.includes('сред')) return 'warn';
  return 'info';
}

/**
 * @purpose Parse a `tasks/*.task.md`'s candidates-section markdown table into raw candidate rows.
 * @param content Full task-blank file content.
 * @returns Raw rows (file/line/message/importance); empty when the section is absent or empty.
 */
function _parseCandidatesTable(
  content: string
): Array<{ file: string; line: number; message: string; importance: string }> {
  const afterHeading = content.split(/^## Кандидаты\s*$/m)[1];
  if (!afterHeading) return [];
  const tableBlock = afterHeading.split(/^## /m)[0] ?? '';

  const rows = tableBlock
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
    .slice(2); // header + separator

  const results: Array<{ file: string; line: number; message: string; importance: string }> = [];
  for (const row of rows) {
    const rawCells = row.split('|');
    const cells = rawCells.slice(1, rawCells.length - 1).map((c) => c.trim());
    if (cells.length < 7) continue; // ID|Файл|Строка|Проблема|Ось|Вид|Важность

    const file = cells[1] ?? '';
    const message = cells[3] ?? '';
    if (!file || !message) continue;

    results.push({
      file,
      line: Number(cells[2]) || 0,
      message,
      importance: cells[6] ?? '',
    });
  }
  return results;
}

/**
 * @purpose Collect + normalize every legacy candidate finding across all `tasks/*.task.md` files in
 *   a legacy report directory.
 * @param dir Legacy report directory.
 * @returns Findings with stable `F-<n>` ids and mapped severity; empty when `tasks/` is absent.
 * @sideEffect FS: reads every `tasks/*.task.md` file.
 */
function _collectLegacyFindings(dir: string): PersistedReviewFinding[] {
  const tasksDir = join(dir, 'tasks');
  if (!existsSync(tasksDir)) return [];

  const raw: Array<{ file: string; line: number; message: string; importance: string }> = [];
  for (const file of readdirSync(tasksDir).filter((f) => f.endsWith('.task.md'))) {
    try {
      raw.push(..._parseCandidatesTable(readFileSync(join(tasksDir, file), 'utf-8')));
    } catch (cause) {
      logger.warn('[artifact-recovery#_collectLegacyFindings] [reading → degraded]', {
        file,
        error: String(cause),
      });
    }
  }

  return raw.map((c, index) => ({
    id: `F-${index + 1}`,
    severity: _severityFromImportance(c.importance),
    file: c.file,
    line: c.line,
    message: c.message,
  }));
}

/**
 * @purpose Read the `revision` field of an already-materialized `review.json` in this directory, so
 *   recovery bumps it monotonically instead of resetting (D-99 CAS input), mirroring
 *   `reviewer.role.ts#_readCurrentRevision`.
 * @param dir Report directory.
 * @returns Current `revision`, or `0` when absent/unreadable.
 */
function _readCurrentRevision(dir: string): number {
  const filePath = join(dir, 'review.json');
  if (!existsSync(filePath)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    return typeof parsed.revision === 'number' ? (parsed.revision as number) : 0;
  } catch {
    return 0;
  }
}

/**
 * @purpose Re-verify one legacy finding against the CURRENT diff (D-129) — never a blind carry-over.
 * @invariant Missing input (no recorded head/worktree/current head) degrades to `stale` —
 *   absence of proof means "needs re-analysis", never "confirmed".
 * @param finding Normalized legacy finding.
 * @param recordedHeadSha Head SHA at legacy-artifact creation time.
 * @param worktreePath Local worktree for the live MR, if resolved.
 * @param currentHeadSha Current MR head SHA, if resolved.
 * @returns The finding annotated with `recoveryStatus`.
 * @sideEffect Process: spawns `git diff --name-only` in the worktree when heads differ.
 */
function _reverifyFinding(
  finding: PersistedReviewFinding,
  recordedHeadSha: string | undefined,
  worktreePath: string | undefined,
  currentHeadSha: string | undefined
): RecoveredFinding {
  if (!recordedHeadSha || !worktreePath || !currentHeadSha) {
    return { ...finding, recoveryStatus: 'stale' };
  }
  if (recordedHeadSha === currentHeadSha) {
    return { ...finding, recoveryStatus: 'confirmed' };
  }

  try {
    const changed = execFileSync(
      'git',
      ['diff', '--name-only', recordedHeadSha, currentHeadSha, '--', finding.file],
      { cwd: worktreePath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return { ...finding, recoveryStatus: changed ? 'stale' : 'confirmed' };
  } catch (cause) {
    logger.warn('[artifact-recovery#_reverifyFinding] [diffing → degraded]', {
      file: finding.file,
      error: String(cause),
    });
    return { ...finding, recoveryStatus: 'stale' };
  }
}

/**
 * @purpose Recover a legacy artifact: extract its recorded verdict/findings, re-verify each against
 *   the CURRENT diff, and materialize an aligned `review.json` in the same directory (D-127..D-129).
 * @param dir Legacy report directory (from a `recover`-action `MrReconciliation.snapshot.dir`).
 * @param mr The actionable MR this legacy artifact belongs to.
 * @param deps VCS/store (+ optional diff_refs override) to resolve the live worktree/head.
 * @returns Promise that resolves once recovery completes (or degrades).
 * @sideEffect FS: writes `<dir>/review.json`. Network/FS: `buildNodeContext` may clone/fetch the
 *   worktree to resolve the current head.
 */
export async function recoverLegacyArtifact(
  dir: string,
  mr: VcsActionableMr,
  deps: RecoverLegacyArtifactDeps
): Promise<void> {
  logger.info('[recoverLegacyArtifact] [idle → recovering]', { mr: mr.webUrl, dir });

  try {
    const recordedHeadSha = _readRecordedHeadSha(dir);
    const legacyFindings = _collectLegacyFindings(dir);
    const verdict = _readLatestHistoryVerdict(dir) ?? 'pending';

    // #region START_REVERIFY_AGAINST_CURRENT_DIFF — invariant: re-verification always diffs the
    // CURRENT MR head against the artifact's recorded head, never the artifact's own creation-time
    // diff (D-129) — a finding survives only when this comparison can positively confirm it.
    let worktreePath: string | undefined;
    let currentHeadSha: string | undefined;
    if (recordedHeadSha) {
      const ctx = await buildNodeContext(mr.webUrl, {
        vcs: deps.vcs,
        store: deps.store,
        fetchDiffRefs: deps.fetchDiffRefs ?? fetchDiffRefsLive,
      });
      worktreePath = ctx.artifacts['worktreePath'] as string | undefined;
      currentHeadSha = ctx.artifacts['headSha'] as string | undefined;
    }

    const recovered = legacyFindings.map((finding) =>
      _reverifyFinding(finding, recordedHeadSha, worktreePath, currentHeadSha)
    );
    // #endregion END_REVERIFY_AGAINST_CURRENT_DIFF

    const revision = _readCurrentRevision(dir) + 1;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'review.json'),
      JSON.stringify({ verdict, findings: recovered, revision }, null, 2)
    );

    logger.info('[recoverLegacyArtifact] [recovering → materialized]', {
      mr: mr.webUrl,
      findings: recovered.length,
      revision,
    });
  } catch (cause) {
    // Degrade-open, consistent with sibling FS materialization functions in this domain
    // (materializeReviewJson/materializeSynthesisReadme in reviewer.role.ts): a recovery failure
    // must not block the tick loop — RoleScheduler falls through to the fresh-instance path when
    // `readCanonicalReview` finds no materialized file afterward.
    logger.warn('[recoverLegacyArtifact] [recovering → degraded]', {
      mr: mr.webUrl,
      dir,
      error: String(cause),
    });
  }
}
