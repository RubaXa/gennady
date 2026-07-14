// @file: Pure gate implementations G1..G10 — each encodes one real failure mode from
//   SESSION-REFLECTION.md as a boolean invariant with evidence. Every gate is a pure function:
//   (input) → { gate, pass, evidence }. No disk/network access — callers (EvalHarness, TSK-119)
//   supply already-read artifacts, diff-hunk maps, and validate results.
// @consumers: EvalHarness (TSK-119)
// @tasks: TSK-118

import type { ValidateResult } from '../inbox-roles/artifact-validator.ts';
import type { EffectResult } from '../inbox-roles/effect-executor.ts';
import type { DiffHunkMap } from './diff-hunk.ts';

/** @purpose Closed set of gate identifiers, G1..G10 per spec §4. */
export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' | 'G10';

/** @purpose Outcome of one gate check — boolean pass plus a human-readable evidence trail. */
export type GateResult = {
  /** @purpose Which gate produced this result */
  gate: GateId;
  /** @purpose Whether the invariant held */
  pass: boolean;
  /** @purpose Concrete proof — the compared values/paths/lines, never a generic message */
  evidence: string;
};

// ─── G1 — base-sha-source ────────────────────────────────────────────────────
// purpose: catches SESSION-REFLECTION Шаг 3 — recomputing merge-base locally instead of trusting
// diff_refs.base_sha from inbox-context yields a stale/wrong base (120+ files instead of 8).

/** @purpose Input for G1: the base SHA actually used to run the diff, vs. the one inbox-context reported. */
export type BaseShaSourceInput = {
  /** @purpose Base SHA the pipeline actually used for `git diff` */
  usedBaseSha: string;
  /** @purpose `diff_refs.base_sha` from inbox-context — the only trusted source */
  contextBaseSha: string;
};

/**
 * @purpose G1 — base must come from `inbox-context`'s `diff_refs.base_sha`, never a locally
 *   recomputed `git merge-base`.
 * @param input Both candidate SHAs.
 * @returns Pass iff they match; evidence carries both SHAs regardless of outcome.
 */
export function evaluateBaseShaSource(input: BaseShaSourceInput): GateResult {
  const pass = input.usedBaseSha === input.contextBaseSha;
  return {
    gate: 'G1',
    pass,
    evidence: `used=${input.usedBaseSha} context=${input.contextBaseSha}`,
  };
}

// ─── G2 — scaffold-cleanup ────────────────────────────────────────────────────
// purpose: catches SESSION-REFLECTION Шаг 4 — a repeat `--scaffold` left stale task files from a
// previous (wrong-base) run sitting alongside the new ones.

/** @purpose Input for G2: track set actually present on disk vs. the current scaffold's expected tracks. */
export type ScaffoldCleanupInput = {
  /** @purpose Track names actually present as task files after (re-)scaffold */
  presentTracks: string[];
  /** @purpose Track names the current scaffold run is expected to produce */
  expectedTracks: string[];
};

/**
 * @purpose G2 — a (re-)scaffold leaves exactly the expected tracks, no stale leftovers.
 * @param input Present vs. expected track sets.
 * @returns Pass iff present == expected as sets; evidence lists any stale/missing tracks.
 */
export function evaluateScaffoldCleanup(input: ScaffoldCleanupInput): GateResult {
  const presentSet = new Set(input.presentTracks);
  const expectedSet = new Set(input.expectedTracks);
  const stale = input.presentTracks.filter((t) => !expectedSet.has(t));
  const missing = input.expectedTracks.filter((t) => !presentSet.has(t));
  const pass = stale.length === 0 && missing.length === 0;
  return {
    gate: 'G2',
    pass,
    evidence: pass ? 'tracks match' : `stale=[${stale.join(',')}] missing=[${missing.join(',')}]`,
  };
}

// ─── G3 / G5 / G6 — thin wrappers over ArtifactValidator's own validate() result ─────────────────
// purpose: spec §4 marks these as wrappers, not reimplementations — ArtifactValidator (TSK-113)
// already runs the schema gate, coverage ledger, tool-call cross-check, and exact-section-name
// check inside `validateReviewReports`; these gates only project its `ValidateResult` into the
// shared GateResult shape.

/**
 * @purpose Shared projection from `ValidateResult` to `GateResult` for G3/G5/G6.
 * @param gate Target gate id.
 * @param result Result of `ArtifactValidator#validate` at the relevant stage.
 * @returns `GateResult` mirroring `result.ok`, with per-file evidence on failure.
 */
function wrapValidateResult(gate: GateId, result: ValidateResult): GateResult {
  return {
    gate,
    pass: result.ok,
    evidence: result.ok
      ? 'validate: ok'
      : result.errors.map((e) => `${e.file}: ${e.error}`).join('; '),
  };
}

/**
 * @purpose G3 — `inbox-review-plan --validate --stage enriched` (via ArtifactValidator) reports ok.
 * @param result Result of `ArtifactValidator#validate` at stage `enriched`.
 * @returns `GateResult` for G3; see `wrapValidateResult`.
 */
export function evaluateEnrichedValid(result: ValidateResult): GateResult {
  return wrapValidateResult('G3', result);
}

/**
 * @purpose G5 — `inbox-review-plan --validate --stage filled` (via ArtifactValidator) reports ok, including coverage ledger and tool-call cross-check.
 * @param result Result of `ArtifactValidator#validate` at stage `filled`.
 * @returns `GateResult` for G5; see `wrapValidateResult`.
 */
export function evaluateFilledValid(result: ValidateResult): GateResult {
  return wrapValidateResult('G5', result);
}

/**
 * @purpose G6 — README validate (via ArtifactValidator) reports ok, including exact section-name matching (no parenthetical suffix on canonical headings, per reflection).
 * @param result Result of `ArtifactValidator#validate` for the README.
 * @returns `GateResult` for G6; see `wrapValidateResult`.
 */
export function evaluateSectionNameExact(result: ValidateResult): GateResult {
  return wrapValidateResult('G6', result);
}

// ─── G4 — table-pipe-escaped ──────────────────────────────────────────────────
// purpose: catches SESSION-REFLECTION Шаг 8 — a raw `|` inside a Markdown table cell (e.g.
// "readonly unknown[] | undefined") silently adds a phantom column and corrupts the row the
// downstream validator parses.

/** @purpose One Markdown document to scan for table-pipe violations. */
export type MarkdownFile = {
  /** @purpose Path used in violation evidence */
  file: string;
  /** @purpose Full document text to scan */
  content: string;
};

/** @purpose One table row whose cell count diverges from its header — proof of an unescaped `|`. */
export type TablePipeViolation = {
  /** @purpose File the violation was found in */
  file: string;
  /** @purpose 1-based line number of the offending row */
  line: number;
  /** @purpose Raw offending row text, trimmed */
  row: string;
};

const TABLE_SEPARATOR_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/**
 * @purpose Split a table row into cells on unescaped `|`, dropping the leading/trailing empty edges.
 * @param row Raw table row text.
 * @returns Cell texts, in column order.
 */
function splitTableRow(row: string): string[] {
  const cells = row.split(/(?<!\\)\|/);
  if (cells[0]?.trim() === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1]?.trim() === '') cells.pop();
  return cells;
}

/**
 * @purpose G4 — every table row's cell count matches its header; a mismatch means an unescaped `|`.
 * @param files Markdown documents to scan (README + task files).
 * @returns Pass iff no violation found; evidence lists every offending `file:line`.
 */
export function evaluateTablePipeEscaped(files: MarkdownFile[]): GateResult {
  const violations: TablePipeViolation[] = [];

  for (const { file, content } of files) {
    const lines = content.split('\n');
    let expectedCells: number | null = null;

    // #region START_SCAN_TABLE_ROWS — invariant: header row sets expectedCells; separator row
    // confirms the table boundary without resetting it; a data row's own cell count is compared
    // against expectedCells, never re-derived from the data row itself
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('|')) {
        expectedCells = null;
        continue;
      }
      if (TABLE_SEPARATOR_ROW.test(line)) continue;

      const cells = splitTableRow(line);
      if (expectedCells === null) {
        expectedCells = cells.length;
        continue;
      }
      if (cells.length !== expectedCells) {
        violations.push({ file, line: i + 1, row: line.trim() });
      }
    }
    // #endregion END_SCAN_TABLE_ROWS
  }

  return {
    gate: 'G4',
    pass: violations.length === 0,
    evidence:
      violations.length === 0
        ? 'no unescaped | in table cells'
        : violations.map((v) => `${v.file}:${v.line}: ${v.row}`).join('; '),
  };
}

// ─── G7 — mermaid-valid ────────────────────────────────────────────────────────
// purpose: reuses ArtifactValidator's real mermaid parser (TSK-113) — this gate does not
// reimplement mermaid syntax checking, it only inspects the same ValidateResult error list for
// entries ArtifactValidator already tags with the `mermaid:` prefix.

/**
 * @purpose G7 — every mermaid block ArtifactValidator parsed is syntactically valid.
 * @param result `ValidateResult` produced by `ArtifactValidator#validate` (any stage — mermaid
 *   verification runs unconditionally inside it).
 * @returns Pass iff no `mermaid:`-prefixed error is present; evidence lists offending files.
 */
export function evaluateMermaidValid(result: ValidateResult): GateResult {
  if (result.ok) return { gate: 'G7', pass: true, evidence: 'no mermaid errors' };
  const mermaidErrors = result.errors.filter((e) => e.error.startsWith('mermaid:'));
  return {
    gate: 'G7',
    pass: mermaidErrors.length === 0,
    evidence:
      mermaidErrors.length === 0
        ? 'no mermaid errors'
        : mermaidErrors.map((e) => `${e.file}: ${e.error}`).join('; '),
  };
}

// ─── G8 — line-in-diff-hunk ────────────────────────────────────────────────────
// purpose: catches SESSION-REFLECTION Шаг 15c/g — GitLab's `line_code can't be blank` when a
// proposed line comment targets a line that never actually changed (context line or outside the
// hunk). The C6 end-of-old-file edge case is already folded correctly into `newLines` by
// diff-hunk.ts, so this gate needs only plain set membership.

/** @purpose One line-level comment a session proposes to post — the shape this gate checks. */
export type ProposedLineComment = {
  /** @purpose File path (matches diff-hunk map keys) */
  file: string;
  /** @purpose Target new-file line number */
  newLine: number;
};

/**
 * @purpose G8 — every proposed line-level comment targets a newLine that is actually part of that
 *   file's diff hunk.
 * @param diffHunks Ground truth from `parseUnifiedDiff` / `retrieveDiffHunks`.
 * @param proposedLineComments Line-level comments a session is about to post.
 * @returns Pass iff every comment's newLine is in its file's hunk; evidence lists offending
 *   comments alongside that file's hunk ranges.
 */
export function evaluateLineInDiffHunk(
  diffHunks: DiffHunkMap,
  proposedLineComments: ProposedLineComment[]
): GateResult {
  const offenders: string[] = [];

  for (const comment of proposedLineComments) {
    const hunks = diffHunks.get(comment.file);
    const inHunk = hunks?.newLines.has(comment.newLine) ?? false;
    if (inHunk) continue;
    const ranges = hunks?.ranges.map((r) => `${r.newStart},${r.newCount}`).join('|') ?? 'no-hunks';
    offenders.push(`${comment.file}:${comment.newLine} (ranges: ${ranges})`);
  }

  return {
    gate: 'G8',
    pass: offenders.length === 0,
    evidence: offenders.length === 0 ? 'all lines in hunk' : offenders.join('; '),
  };
}

// ─── G9 — body-size-under-waf ──────────────────────────────────────────────────
// purpose: catches SESSION-REFLECTION Шаг 15c — a large general comment body (~12KB, heavy mermaid)
// tripped GitLab's WAF with a bare 400. The threshold is parameterizable so this gate never
// hardcodes provider-specific WAF internals beyond the boundary that worked in the reflected
// session.

/** @purpose Default WAF body-size threshold in bytes — the boundary that worked in the reflected session. */
export const DEFAULT_WAF_BODY_THRESHOLD_BYTES = 8192;

/**
 * @purpose G9 — a comment body stays strictly under the WAF size threshold.
 * @param body Comment body text (Markdown, may embed mermaid).
 * @param [thresholdBytes] Override for the default 8192-byte threshold.
 * @returns Pass iff UTF-8 byte length is below the threshold; evidence carries both numbers.
 */
export function evaluateBodySizeUnderWaf(body: string, thresholdBytes?: number): GateResult {
  const threshold = thresholdBytes ?? DEFAULT_WAF_BODY_THRESHOLD_BYTES;
  const size = Buffer.byteLength(body, 'utf8');
  const pass = size < threshold;
  return { gate: 'G9', pass, evidence: `size=${size}B threshold=${threshold}B` };
}

// ─── G10 — post-idempotent ──────────────────────────────────────────────────────
// purpose: catches SESSION-REFLECTION Шаг 15c side effect — a partial-failure retry re-posted
// comments that had already succeeded on the first attempt, because the second JSON batch did not
// subtract already-applied actions. EffectExecutor's own `effect_applied` idempotency guard is the
// mechanism under test; this gate only asserts its observable effect: a second dry-run pass over
// the same batch must apply zero new actions.

/**
 * @purpose G10 — a repeated dry-run over the same action batch produces zero newly `applied`
 *   outcomes (everything is `skipped_idempotent` or `skipped_duplicate`).
 * @param secondRun `EffectExecutor#execute` result from re-running the identical batch.
 * @returns Pass iff no outcome in the second run has status `applied`; evidence carries the count.
 */
export function evaluatePostIdempotent(secondRun: EffectResult): GateResult {
  const newlyApplied = secondRun.outcomes.filter((o) => o.status === 'applied').length;
  return {
    gate: 'G10',
    pass: newlyApplied === 0,
    evidence: `newly_applied=${newlyApplied} total=${secondRun.outcomes.length}`,
  };
}
