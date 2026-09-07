// @file: Deterministic, pure compare between a versioned sdd-check baseline (GAP-B-1,
//   ai/flow-eval/.baseline/sdd-check-<sha>.json) and one fresh `sdd-check --all --format json` run —
//   no filesystem or process access here, so the zero-new-error verdict is provably deterministic
//   and unit-testable with plain fixtures.
// @consumers: ai/flow-eval/scripts/sdd-check-zero-new-error.ts, ai/flow-eval/scripts/generate-sdd-check-baseline.ts,
//   ai/flow-eval/scripts/__tests__/sdd-check-baseline-compare.test.ts
// @tasks: N/A

/** @purpose sdd-check's own two severities (its JSON/text output spells the warning one "warn", not "warning"). */
type SddCheckSeverity = 'error' | 'warn';

/** @purpose One sdd-check finding reduced to the (code, file, severity) triple the gate keys on. */
export type BaselineFinding = {
  readonly code: string;
  readonly file: string;
  readonly severity: SddCheckSeverity;
};

/** @purpose One raw finding as emitted by `sdd-check --all --format json` (`gennady.sdd-check.findings.v1`). */
export type RawFinding = {
  readonly code: string;
  readonly file: string;
  readonly severity: string;
};

/**
 * @purpose Versioned baseline artifact (D-38/GAP-B-1): findings enumerated by (code, file, severity) —
 *   deduplicated and sorted — plus per-code raw counts. Never a bare total; a total alone cannot say
 *   which (code, file) pairs are already known.
 */
export type SddCheckBaseline = {
  readonly schema: 'gennady.sdd-check.baseline.v1';
  readonly commit: string;
  readonly tag: string | null;
  readonly generatedBy: string;
  readonly generatedAt: string;
  readonly totals: { readonly errors: number; readonly warnings: number; readonly files: number };
  readonly countsByCode: Readonly<
    Record<string, { readonly error: number; readonly warn: number }>
  >;
  readonly findings: readonly BaselineFinding[];
};

/** @purpose One error the gate flags: present in the fresh run at error severity, absent from the baseline. */
export type NewError = { readonly code: string; readonly file: string };

/** @purpose Verdict of one zero-new-error comparison. */
type ZeroNewErrorVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly newErrors: readonly NewError[] };

function pairKey(f: { code: string; file: string }): string {
  return `${f.code} ${f.file}`;
}

/**
 * @purpose Compare one fresh sdd-check run against the versioned baseline.
 * @invariant Only error-severity findings can fail the gate; any warning — known or new — never does.
 * @invariant The matching key is (code, file) only: line numbers and message text may drift (the
 *   sdd-check message text is not part of the contract) without failing the gate.
 * @param baseline The versioned baseline (its `findings` list only is read).
 * @param fresh The findings from the current sdd-check --all --format json run.
 * @returns `{ ok: true }` when every fresh error is already present in the baseline by (code, file);
 *   otherwise the new errors, deduplicated and sorted by code then file.
 */
export function zeroNewErrorVerdict(
  baseline: Pick<SddCheckBaseline, 'findings'>,
  fresh: readonly BaselineFinding[]
): ZeroNewErrorVerdict {
  const knownErrorKeys = new Set(
    baseline.findings.filter((f) => f.severity === 'error').map(pairKey)
  );
  const seen = new Set<string>();
  const newErrors: NewError[] = [];
  for (const finding of fresh) {
    if (finding.severity !== 'error') continue;
    const key = pairKey(finding);
    if (knownErrorKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    newErrors.push({ code: finding.code, file: finding.file });
  }
  if (newErrors.length === 0) return { ok: true };
  // Plain codepoint comparison, not localeCompare: localeCompare's collation depends on the
  // runtime's ICU build/locale and is not guaranteed identical across machines — this artifact must
  // sort identically everywhere it is regenerated or diffed.
  newErrors.sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  });
  return { ok: false, newErrors };
}

/** @purpose Reduce raw `sdd-check --format json` findings to the (code, file, severity) triples the gate needs. */
export function toBaselineFindings(rawFindings: readonly RawFinding[]): BaselineFinding[] {
  return rawFindings.map((f) => ({
    code: f.code,
    file: f.file,
    severity: f.severity === 'error' ? 'error' : 'warn',
  }));
}

/**
 * @purpose Deduplicate and deterministically sort findings by (code, file, severity) for artifact storage.
 * @invariant Output order is stable across runs given the same input set — required for a versioned,
 *   diffable artifact.
 */
export function dedupeSortFindings(findings: readonly BaselineFinding[]): BaselineFinding[] {
  const map = new Map<string, BaselineFinding>();
  for (const f of findings) map.set(`${f.code}\u0000${f.file}\u0000${f.severity}`, f);
  // Plain codepoint comparison, not localeCompare — this artifact must sort byte-identically on
  // every machine that regenerates or diffs it (localeCompare's collation depends on ICU/locale).
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return [...map.values()].sort((a, b) => {
    if (a.code !== b.code) return cmp(a.code, b.code);
    if (a.file !== b.file) return cmp(a.file, b.file);
    return cmp(a.severity, b.severity);
  });
}

/**
 * @purpose Per-code error/warn counts from the RAW (non-deduplicated) findings — the "plus per-code
 *   counts, NOT a bare total" half of the baseline artifact.
 */
export function countsByCode(
  rawFindings: readonly RawFinding[]
): Record<string, { error: number; warn: number }> {
  const counts: Record<string, { error: number; warn: number }> = {};
  for (const f of rawFindings) {
    const bucket = (counts[f.code] ??= { error: 0, warn: 0 });
    if (f.severity === 'error') bucket.error += 1;
    else bucket.warn += 1;
  }
  const sorted: Record<string, { error: number; warn: number }> = {};
  for (const code of Object.keys(counts).sort()) sorted[code] = counts[code];
  return sorted;
}
