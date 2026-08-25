// @file: Pure line-coverage aggregation + threshold check for `gennady testcov --min=<pct>`. Reading coverage-final.json and walking getRoots()/getDirStats() stays in testcov.cmd.ts.
// @consumers: testcov.cmd.ts
// @tasks: N/A

/**
 * @purpose Aggregated statement (line) hit/total counts across a set of directories or files.
 * @invariant `total === 0` means nothing instrumented was found — never claim 100% on an empty set.
 */
export type LineCoverageTotals = {
  /** @purpose Statements hit (covered) at least once. */
  hit: number;
  /** @purpose Statements present (instrumented). */
  total: number;
};

/**
 * @purpose Sum statement hit/total counts across several coverage buckets (e.g. one per `getRoots()` top-level dir).
 * @param buckets Per-bucket `{ sH, sT }` statement counts (a `DirStats`/`FileCovRaw` shape works as-is).
 * @returns The summed totals.
 */
export function aggregateLineCoverage(buckets: { sH: number; sT: number }[]): LineCoverageTotals {
  let hit = 0;
  let total = 0;
  for (const b of buckets) {
    hit += b.sH;
    total += b.sT;
  }
  return { hit, total };
}

/**
 * @purpose Line-coverage percentage from aggregated totals.
 * @param totals Aggregated hit/total counts.
 * @returns The percentage (0-100), or null when `total` is 0 (nothing instrumented).
 */
export function linePct(totals: LineCoverageTotals): number | null {
  return totals.total > 0 ? (100 * totals.hit) / totals.total : null;
}

/**
 * @purpose Decide whether aggregated line coverage meets a minimum percentage threshold.
 * @invariant An empty/uninstrumented project (`total === 0`) never meets a threshold — there is nothing to certify.
 * @param totals Aggregated hit/total counts (`aggregateLineCoverage`).
 * @param minPct Required minimum line-coverage percentage.
 * @returns True when coverage is instrumented and `>= minPct`.
 */
export function meetsMinCoverage(totals: LineCoverageTotals, minPct: number): boolean {
  const p = linePct(totals);
  return p !== null && p >= minPct;
}

/**
 * @purpose Ready-to-print one-line verdict for `testcov --min`, covering the "nothing instrumented" case.
 * @invariant `total === 0` explains itself (no tests loaded any file yet) instead of printing a bare "n/a".
 * @param totals Aggregated hit/total counts.
 * @param minPct Required minimum line-coverage percentage.
 * @returns The formatted message plus whether the gate passed.
 */
export function describeCoverageGate(
  totals: LineCoverageTotals,
  minPct: number
): { message: string; ok: boolean } {
  const ok = meetsMinCoverage(totals, minPct);
  const p = linePct(totals);
  if (p === null) {
    return {
      ok,
      message:
        'testcov: coverage not measured — no file was loaded by tests yet (no tests written?) — cannot check the threshold ❌',
    };
  }
  return {
    ok,
    message: `testcov: line coverage ${p.toFixed(1)}% (${totals.hit}/${totals.total} statements) — required ≥${minPct}% ${ok ? '✅' : '❌'}`,
  };
}
