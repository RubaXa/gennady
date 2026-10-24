# Format pilot — observed results

Collection complete: 24/24 primary records; 24 completed, 0 interrupted, 0 other terminal outcomes. Qualified matrix=true. Failures remain observations; completing all attempts is not proof of a winning prompt.

Descriptive pilot only. No automatic adoption, causal savings, statistical equivalence or provider-priced dollar estimate. Unknown/partial measurements are not zero and cannot establish improvement.

## Hypotheses: effect versus selection

| Contrast | Effect | Both cases ≥10% worker-token reduction | Selection |
|---|---|---|---|
| baseline → facts | mixed | true | reject |

| Contrast | Case | Resource + known-quality effect | Worker tokens | Tools | Messages | Worker ms | Static envelope bytes | Artifact / semantic / path: PASS then unknown | Selection |
|---|---|---|---|---|---|---|---|---|---|
| baseline → facts | module-flat | mixed; quality=known-failure-regression | 57315 → 49887.5 (-13.0%) | 29 → 23 (-20.7%) | 20 → 16 (-20.0%) | 106789.5 → 85154 (-20.3%) | 43574 → 43574 (+0.0%) | 6→5/6; unknown 0→0 / 6→3/6; unknown 0→0 / 0→0/6; unknown 6→6 | reject |
| baseline → facts | module-nested | mixed; quality=known-failure-regression | 50581 → 44079.5 (-12.9%) | 22.5 → 20.5 (-8.9%) | 16 → 12.5 (-21.9%) | 82217.5 → 67848 (-17.5%) | 43574 → 43574 (+0.0%) | 5→6/6; unknown 0→0 / 6→4/6; unknown 0→0 / 0→0/6; unknown 6→6 | reject |

better/worse/mixed describe this case-qualified resource contrast plus known-quality changes only; unchanged results are explicitly mixed/no-gain. A valid case is evaluated using the same authoritative comparator on its own six repetitions, so an invalid sibling case cannot hide its local resource direction. Global comparability and the unchanged global comparator remain mandatory for selection. Worker-token direction is not a monetary-cost estimate. Semantic INCONCLUSIVE and opaque/unproven paths remain unknown: fewer PASS confirmations do not prove worse quality, and zero PASS on both sides does not establish parity. Static-envelope and known-write/path constraints remain separate. keep means only candidate for further review, never ship/adopt/merge; keep-original does not endorse an imperfect baseline. Six repetitions do not establish statistical equivalence. Partial local metrics cannot establish an improvement.

### baseline → facts: mixed; reject

Computed identifiers, syntax and exact scope links added by sdd-new module output only; directives/templates unchanged. Does not isolate each field.

- module-flat: worker tokens=better; tools/messages=better; elapsed=better; quality=known-failure-regression; observed write-violating attempts=0/6. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Observed known failures increased with a fully known reference: artifactPass, semanticPass. Inconclusive/opaque unknown outcomes were not counted as failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Candidate path is not proven 6/6; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.
- module-nested: worker tokens=better; tools/messages=better; elapsed=better; quality=known-failure-regression; observed write-violating attempts=0/6. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Observed known failures increased with a fully known reference: semanticPass. Inconclusive/opaque unknown outcomes were not counted as failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Candidate path is not proven 6/6; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.

## Every arm and original outcome

| Case | Arm | Saved | Artifact / semantic / path | Tools median | Worker tokens | Worker messages | Worker ms | Complete binding |
|---|---|---:|---|---:|---:|---:|---:|---:|
| module-flat | baseline | 6/6 | 6/6/0 of 6 | 29 [6/6] | 57315 [6/6] | 20 [6/6] | 106789.5 [6/6] | 6/6 |
| module-flat | facts | 6/6 | 5/3/0 of 6 | 23 [6/6] | 49887.5 [6/6] | 16 [6/6] | 85154 [6/6] | 6/6 |
| module-nested | baseline | 6/6 | 5/6/0 of 6 | 22.5 [6/6] | 50581 [6/6] | 16 [6/6] | 82217.5 [6/6] | 6/6 |
| module-nested | facts | 6/6 | 6/4/0 of 6 | 20.5 [6/6] | 44079.5 [6/6] | 12.5 [6/6] | 67848 [6/6] | 6/6 |

Each metric is median [known/expected]. Quality columns remain separate. A failed attempt stays in the planned denominator. Worker ms is the recorded SDK worker span, not outer polling, judge or reflection time.

## Derived contract observations — separate from primary grades

| Case | Arm | Saved/planned | >1 native whole-write | Partial-write attempts | Outside-target attempts | Any violating attempt | Adoption blocked by observation |
|---|---|---:|---:|---:|---:|---:|---|
| module-flat | baseline | 6/6 | 6 [6/6 measured] | 0 [6/6 measured] | 0 [6/6 measured] | 6/6 | YES — observed violation |
| module-nested | baseline | 6/6 | 5 [6/6 measured] | 1 [6/6 measured] | 0 [6/6 measured] | 6/6 | YES — observed violation |
| module-flat | facts | 6/6 | 0 [6/6 measured] | 0 [6/6 measured] | 0 [6/6 measured] | 0/6 | not cleared by absence |
| module-nested | facts | 6/6 | 0 [6/6 measured] | 0 [6/6 measured] | 0 [6/6 measured] | 0/6 | not cleared by absence |

These are separate observations from frozen wholeWrites/partialWrites/outsideTargetWrites metrics and available native call IDs, not a new primary grade. A positive observation blocks adoption under this campaign criterion even when the primary path verdict is unknown because of opaque Bash; it is not a product-wide ban on correction rewrites. Missing counts are unknown, never zero or evidence of a missing write. Zero observed violations is not proof of a clean path, even with complete trace capture. Partial/outside counts describe tool attempts, not successful mutations. Primary artifact/semantic/path outcomes and standard comparisons are unchanged; failures and inconclusive outcomes remain in the table.

## Standard comparisons

- baseline → facts: comparable=true; recommendation=reject; regressions=module-flat, module-nested; issues=none.

The existing comparator requires a smaller static instruction envelope and no per-case quality/path/tools regression. It does not evaluate message counts or judge/reflection costs; those are separately retained, not silently added to worker totals.

## Roles accounted separately

| Case | Arm | Role | Usage qualified | Tokens | Messages | Usage wall ms | Reflection elapsed ms |
|---|---|---|---:|---:|---:|---:|---:|
| module-flat | baseline | worker | 6/6 | 57315 [6/6] | 20 [6/6] | 106789.5 [6/6] | n/a |
| module-flat | baseline | judge | 6/6 | 14326.5 [6/6] | 1 [6/6] | 40059 [6/6] | n/a |
| module-flat | baseline | reflection | 6/6 | 42750 [6/6] | 1 [6/6] | unknown [0/6] | 8760 [6/6] |
| module-nested | baseline | worker | 6/6 | 50581 [6/6] | 16 [6/6] | 82217.5 [6/6] | n/a |
| module-nested | baseline | judge | 6/6 | 14563 [6/6] | 1 [6/6] | 44626 [6/6] | n/a |
| module-nested | baseline | reflection | 6/6 | 39405 [6/6] | 1 [6/6] | unknown [0/6] | 7988.5 [6/6] |
| module-flat | facts | worker | 6/6 | 49887.5 [6/6] | 16 [6/6] | 85154 [6/6] | n/a |
| module-flat | facts | judge | 6/6 | 14534.5 [6/6] | 1 [6/6] | 42927.5 [6/6] | n/a |
| module-flat | facts | reflection | 6/6 | 35782 [6/6] | 1 [6/6] | unknown [0/6] | 10449 [6/6] |
| module-nested | facts | worker | 6/6 | 44079.5 [6/6] | 12.5 [6/6] | 67848 [6/6] | n/a |
| module-nested | facts | judge | 6/6 | 11026 [6/6] | 1 [6/6] | 23465 [6/6] | n/a |
| module-nested | facts | reflection | 6/6 | 34159.5 [6/6] | 1 [6/6] | unknown [0/6] | 8831.5 [6/6] |

Reflection is diagnostic self-report, not grading authority or a certified cause. Missing reflection is unknown, not zero overhead. Role usage requires complete, positive observed usage; reflection additionally requires a completed, isolated interview. A host-recorded judge deadline is unqualified even if the SDK reports complete=true and zero counters. Those original raw counters are retained unchanged, but zero tokens/cost must not be claimed as measured consumption. The observed timeout wait remains in raw usage and unqualifiedUsage[].observedWallClockMs. A completed inconclusive judge with positive qualified usage is not excluded for its verdict.

### Unqualified role measurements


Provider-reported cost values, where present, are raw counters in raw-metrics.json; they are not a trustworthy tariff estimate.

## Call ledgers

- [baseline: every captured call](baseline.calls.md) — observable purpose, command status, read ranges, output fingerprints and batching candidates; no inferred private reasoning or automatic unnecessary-call score.
- [facts: every captured call](facts.calls.md) — observable purpose, command status, read ranges, output fingerprints and batching candidates; no inferred private reasoning or automatic unnecessary-call score.

## Portable offline replay

Run from this report directory after moving it anywhere. Set EVAL_REPO to an available checkout containing the analysis modules whose hashes are in bindings.json; use Node 22. No old temporary source/sandbox directory is required. Historical source SHA and cwd strings in the two *.input.json files are preserved as evidence, not rewritten or stat-ed by these renderers.

```bash
EVAL_REPO=/absolute/path/to/gennady
for arm in baseline facts; do
  node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-baseline-report.ts" --input "./$arm.input.json" --out "./$arm.replayed-report.json"
  node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-call-audit.ts" "./$arm.input.json" "./$arm.replayed-calls.md"
done
```

Qualified complete twelve-record arms can produce their full call ledger through the existing renderer. Baseline replay exits 0 for complete qualified input and 2 for incomplete input; the existing call-audit CLI exits 0 when complete or rejects incomplete input with 1. Neither fail-closed exit is permission to drop failed attempts. Each input is bounded to the existing CLI 8 MiB limit. The embedded permanent/ directory below contains exact, hash-bound copies of the real permanent summary.json bytes only; no model or sandbox replay is needed.

```bash
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign toolfact1-oct24 --baseline baseline --candidate facts --cases module-flat,module-nested --repetitions 6 --results-dir ./permanent --out ./baseline-vs-facts.replayed-compare.json
```

Replay outputs must be new names because existing CLIs refuse overwrites. The two input snapshots include full retained summary/trajectory/reflection plus observed cleanup proof. Raw permanent summaries keep their original bytes and directory names; no source identity, quality label or cwd normalization is applied. Missing attempts remain absent from permanent/ and explicitly missing in the plan-based report.

