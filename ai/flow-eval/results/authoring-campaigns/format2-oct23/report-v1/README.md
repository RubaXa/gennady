# Format pilot — observed results

Collection complete: 24/24 primary records; 24 completed, 0 interrupted, 0 other terminal outcomes. Qualified matrix=true. Failures remain observations; completing all attempts is not proof of a winning prompt.

Descriptive pilot only. No automatic adoption, causal savings, statistical equivalence or provider-priced dollar estimate. Unknown/partial measurements are not zero and cannot establish improvement.

## Hypotheses: effect versus selection

| Contrast | Effect | Both cases ≥10% worker-token reduction | Selection |
|---|---|---|---|
| baseline → prose | mixed | false | reject |
| baseline → pseudocode | mixed | false | reject |
| baseline → observation | mixed | false | reject |
| prose → pseudocode | mixed | true | reject |
| prose → observation | mixed | false | reject |

| Contrast | Case | Resource + known-quality effect | Worker tokens | Tools | Messages | Worker ms | Static envelope bytes | Artifact / semantic / path: PASS then unknown | Selection |
|---|---|---|---|---|---|---|---|---|---|
| baseline → prose | module-flat | mixed; quality=unknown | 52856 → 57165 (+8.2%) | 29 → 28 (-3.4%) | 18 → 20 (+11.1%) | 88824 → 112690 (+26.9%) | 43574 → 43538 (-0.1%) | 2→2/3; unknown 0→0 / 2→2/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |
| baseline → prose | module-nested | mixed; quality=known-failure-regression | 57299 → 56702 (-1.0%) | 27 → 30 (+11.1%) | 20 → 21 (+5.0%) | 88466 → 104820 (+18.5%) | 43574 → 43538 (-0.1%) | 3→2/3; unknown 0→0 / 3→0/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |
| baseline → pseudocode | module-flat | mixed; quality=known-failure-regression | 52856 → 48631 (-8.0%) | 29 → 22 (-24.1%) | 18 → 15 (-16.7%) | 88824 → 77148 (-13.1%) | 43574 → 43607 (+0.1%) | 2→3/3; unknown 0→0 / 2→1/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |
| baseline → pseudocode | module-nested | mixed; quality=unknown | 57299 → 49902 (-12.9%) | 27 → 28 (+3.7%) | 20 → 19 (-5.0%) | 88466 → 95501 (+8.0%) | 43574 → 43607 (+0.1%) | 3→3/3; unknown 0→0 / 3→3/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |
| baseline → observation | module-flat | better; quality=unknown | 52856 → 50370 (-4.7%) | 29 → 26 (-10.3%) | 18 → 18 (+0.0%) | 88824 → 79972 (-10.0%) | 43574 → 43680 (+0.2%) | 2→2/3; unknown 0→0 / 2→2/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |
| baseline → observation | module-nested | mixed; quality=known-failure-regression | 57299 → 57470 (+0.3%) | 27 → 29 (+7.4%) | 20 → 18 (-10.0%) | 88466 → 103293 (+16.8%) | 43574 → 43680 (+0.2%) | 3→3/3; unknown 0→0 / 3→2/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |
| prose → pseudocode | module-flat | mixed; quality=known-failure-regression | 57165 → 48631 (-14.9%) | 28 → 22 (-21.4%) | 20 → 15 (-25.0%) | 112690 → 77148 (-31.5%) | 43538 → 43607 (+0.2%) | 2→3/3; unknown 0→0 / 2→1/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |
| prose → pseudocode | module-nested | better; quality=known-failure-reduction | 56702 → 49902 (-12.0%) | 30 → 28 (-6.7%) | 21 → 19 (-9.5%) | 104820 → 95501 (-8.9%) | 43538 → 43607 (+0.2%) | 2→3/3; unknown 0→0 / 0→3/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |
| prose → observation | module-flat | better; quality=unknown | 57165 → 50370 (-11.9%) | 28 → 26 (-7.1%) | 20 → 18 (-10.0%) | 112690 → 79972 (-29.0%) | 43538 → 43680 (+0.3%) | 2→2/3; unknown 0→0 / 2→2/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |
| prose → observation | module-nested | mixed; quality=known-failure-reduction | 56702 → 57470 (+1.4%) | 30 → 29 (-3.3%) | 21 → 18 (-14.3%) | 104820 → 103293 (-1.5%) | 43538 → 43680 (+0.3%) | 2→3/3; unknown 0→0 / 0→2/3; unknown 0→0 / 0→0/3; unknown 3→3 | reject |

better/worse/mixed describe this case-qualified resource contrast plus known-quality changes only; unchanged results are explicitly mixed/no-gain. A valid case is evaluated using the same authoritative comparator on its own three repetitions, so an invalid sibling case cannot hide its local resource direction. Global comparability and the unchanged global comparator remain mandatory for selection. Worker-token direction is not a monetary-cost estimate. Semantic INCONCLUSIVE and opaque/unproven paths remain unknown: fewer PASS confirmations do not prove worse quality, and zero PASS on both sides does not establish parity. Static-envelope and known-write/path constraints remain separate. keep means only candidate for further review, never ship/adopt/merge; keep-original does not endorse an imperfect baseline. Three repetitions do not establish statistical equivalence. Partial local metrics cannot establish an improvement.

### baseline → prose: mixed; reject

Treatment versus original: includes procedural repacking, not a pure representation attribution.

- module-flat: worker tokens=worse; tools/messages=mixed; elapsed=worse; quality=unknown; observed write-violating attempts=2/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Tool or assistant-message median grew. Median worker non-cache token reduction did not reach 10%. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.
- module-nested: worker tokens=better; tools/messages=worse; elapsed=worse; quality=known-failure-regression; observed write-violating attempts=3/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Observed known failures increased with a fully known reference: artifactPass, semanticPass. Inconclusive/opaque unknown outcomes were not counted as failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Tool or assistant-message median grew. Median worker non-cache token reduction did not reach 10%. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.

### baseline → pseudocode: mixed; reject

Treatment versus original: includes procedural repacking, not a pure representation attribution.

- module-flat: worker tokens=better; tools/messages=better; elapsed=better; quality=known-failure-regression; observed write-violating attempts=2/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Observed known failures increased with a fully known reference: semanticPass. Inconclusive/opaque unknown outcomes were not counted as failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Median worker non-cache token reduction did not reach 10%. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.
- module-nested: worker tokens=better; tools/messages=mixed; elapsed=worse; quality=unknown; observed write-violating attempts=3/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Tool or assistant-message median grew. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.

### baseline → observation: mixed; reject

Treatment versus original: includes procedural repacking, not a pure representation attribution.

- module-flat: worker tokens=better; tools/messages=better; elapsed=better; quality=unknown; observed write-violating attempts=2/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Median worker non-cache token reduction did not reach 10%. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.
- module-nested: worker tokens=worse; tools/messages=mixed; elapsed=worse; quality=known-failure-regression; observed write-violating attempts=3/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Observed known failures increased with a fully known reference: semanticPass. Inconclusive/opaque unknown outcomes were not counted as failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Tool or assistant-message median grew. Median worker non-cache token reduction did not reach 10%. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.

### prose → pseudocode: mixed; reject

Representation contrast with common facts/invariants retained.

- module-flat: worker tokens=better; tools/messages=better; elapsed=better; quality=known-failure-regression; observed write-violating attempts=2/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Observed known failures increased with a fully known reference: semanticPass. Inconclusive/opaque unknown outcomes were not counted as failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.
- module-nested: worker tokens=better; tools/messages=better; elapsed=better; quality=known-failure-reduction; observed write-violating attempts=3/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.

### prose → observation: mixed; reject

Representation contrast with common facts/invariants retained.

- module-flat: worker tokens=better; tools/messages=better; elapsed=better; quality=unknown; observed write-violating attempts=2/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.
- module-nested: worker tokens=worse; tools/messages=better; elapsed=better; quality=known-failure-reduction; observed write-violating attempts=3/3. Observed frozen campaign write criterion violation blocks selection; this is not attribution to instruction format or a global ban on correction rewrites. Existing standard comparator flags this case; its unchanged pass-count comparison may include unknown semantic/path outcomes and is not alone proof of a quality failure. Semantic/artifact/path evidence contains unknown outcomes; neither a drop in confirmation count nor zero PASS counts establish a quality regression, improvement or parity. Median worker non-cache token reduction did not reach 10%. Candidate path is not proven 3/3; unknown is not converted to failure or PASS. Existing global comparator/static-envelope selection criterion is not met; local resource metrics remain separately visible.

## Every arm and original outcome

| Case | Arm | Saved | Artifact / semantic / path | Tools median | Worker tokens | Worker messages | Worker ms | Complete binding |
|---|---|---:|---|---:|---:|---:|---:|---:|
| module-flat | baseline | 3/3 | 2/2/0 of 3 | 29 [3/3] | 52856 [3/3] | 18 [3/3] | 88824 [3/3] | 3/3 |
| module-flat | prose | 3/3 | 2/2/0 of 3 | 28 [3/3] | 57165 [3/3] | 20 [3/3] | 112690 [3/3] | 3/3 |
| module-flat | pseudocode | 3/3 | 3/1/0 of 3 | 22 [3/3] | 48631 [3/3] | 15 [3/3] | 77148 [3/3] | 3/3 |
| module-flat | observation | 3/3 | 2/2/0 of 3 | 26 [3/3] | 50370 [3/3] | 18 [3/3] | 79972 [3/3] | 3/3 |
| module-nested | baseline | 3/3 | 3/3/0 of 3 | 27 [3/3] | 57299 [3/3] | 20 [3/3] | 88466 [3/3] | 3/3 |
| module-nested | prose | 3/3 | 2/0/0 of 3 | 30 [3/3] | 56702 [3/3] | 21 [3/3] | 104820 [3/3] | 3/3 |
| module-nested | pseudocode | 3/3 | 3/3/0 of 3 | 28 [3/3] | 49902 [3/3] | 19 [3/3] | 95501 [3/3] | 3/3 |
| module-nested | observation | 3/3 | 3/2/0 of 3 | 29 [3/3] | 57470 [3/3] | 18 [3/3] | 103293 [3/3] | 3/3 |

Each metric is median [known/expected]. Quality columns remain separate. A failed attempt stays in the planned denominator. Worker ms is the recorded SDK worker span, not outer polling, judge or reflection time.

## Derived contract observations — separate from primary grades

| Case | Arm | Saved/planned | >1 native whole-write | Partial-write attempts | Outside-target attempts | Any violating attempt | Adoption blocked by observation |
|---|---|---:|---:|---:|---:|---:|---|
| module-flat | baseline | 3/3 | 3 [3/3 measured] | 0 [3/3 measured] | 0 [3/3 measured] | 3/3 | YES — observed violation |
| module-nested | baseline | 3/3 | 3 [3/3 measured] | 0 [3/3 measured] | 0 [3/3 measured] | 3/3 | YES — observed violation |
| module-flat | prose | 3/3 | 2 [3/3 measured] | 0 [3/3 measured] | 0 [3/3 measured] | 2/3 | YES — observed violation |
| module-nested | prose | 3/3 | 3 [3/3 measured] | 0 [3/3 measured] | 0 [3/3 measured] | 3/3 | YES — observed violation |
| module-flat | pseudocode | 3/3 | 2 [3/3 measured] | 0 [3/3 measured] | 0 [3/3 measured] | 2/3 | YES — observed violation |
| module-nested | pseudocode | 3/3 | 3 [3/3 measured] | 0 [3/3 measured] | 0 [3/3 measured] | 3/3 | YES — observed violation |
| module-flat | observation | 3/3 | 2 [3/3 measured] | 0 [3/3 measured] | 0 [3/3 measured] | 2/3 | YES — observed violation |
| module-nested | observation | 3/3 | 3 [3/3 measured] | 0 [3/3 measured] | 0 [3/3 measured] | 3/3 | YES — observed violation |

These are separate observations from frozen wholeWrites/partialWrites/outsideTargetWrites metrics and available native call IDs, not a new primary grade. A positive observation blocks adoption under this campaign criterion even when the primary path verdict is unknown because of opaque Bash; it is not a product-wide ban on correction rewrites. Missing counts are unknown, never zero or evidence of a missing write. Zero observed violations is not proof of a clean path, even with complete trace capture. Partial/outside counts describe tool attempts, not successful mutations. Primary artifact/semantic/path outcomes and standard comparisons are unchanged; failures and inconclusive outcomes remain in the table.

## Standard comparisons

- baseline → prose: comparable=true; recommendation=reject; regressions=module-nested; issues=none.
- baseline → pseudocode: comparable=true; recommendation=reject; regressions=module-flat, module-nested; issues=none.
- baseline → observation: comparable=true; recommendation=reject; regressions=module-flat, module-nested; issues=none.
- prose → pseudocode: comparable=true; recommendation=reject; regressions=module-flat, module-nested; issues=none.
- prose → observation: comparable=true; recommendation=reject; regressions=module-flat, module-nested; issues=none.

The existing comparator requires a smaller static instruction envelope and no per-case quality/path/tools regression. It does not evaluate message counts or judge/reflection costs; those are separately retained, not silently added to worker totals.

## Roles accounted separately

| Case | Arm | Role | Usage qualified | Tokens | Messages | Usage wall ms | Reflection elapsed ms |
|---|---|---|---:|---:|---:|---:|---:|
| module-flat | baseline | worker | 3/3 | 52856 [3/3] | 18 [3/3] | 88824 [3/3] | n/a |
| module-flat | baseline | judge | 3/3 | 10897 [3/3] | 1 [3/3] | 22206 [3/3] | n/a |
| module-flat | baseline | reflection | 3/3 | 41412 [3/3] | 1 [3/3] | unknown [0/3] | 9671 [3/3] |
| module-nested | baseline | worker | 3/3 | 57299 [3/3] | 20 [3/3] | 88466 [3/3] | n/a |
| module-nested | baseline | judge | 3/3 | 11514 [3/3] | 1 [3/3] | 26410 [3/3] | n/a |
| module-nested | baseline | reflection | 3/3 | 43165 [3/3] | 1 [3/3] | unknown [0/3] | 6754 [3/3] |
| module-flat | prose | worker | 3/3 | 57165 [3/3] | 20 [3/3] | 112690 [3/3] | n/a |
| module-flat | prose | judge | 3/3 | 15439 [3/3] | 1 [3/3] | 44998 [3/3] | n/a |
| module-flat | prose | reflection | 3/3 | 42836 [3/3] | 1 [3/3] | unknown [0/3] | 9356 [3/3] |
| module-nested | prose | worker | 3/3 | 56702 [3/3] | 21 [3/3] | 104820 [3/3] | n/a |
| module-nested | prose | judge | 3/3 | 8006 [3/3] | 1 [3/3] | 5780 [3/3] | n/a |
| module-nested | prose | reflection | 3/3 | 42135 [3/3] | 1 [3/3] | unknown [0/3] | 8466 [3/3] |
| module-flat | pseudocode | worker | 3/3 | 48631 [3/3] | 15 [3/3] | 77148 [3/3] | n/a |
| module-flat | pseudocode | judge | 3/3 | 10100 [3/3] | 1 [3/3] | 18356 [3/3] | n/a |
| module-flat | pseudocode | reflection | 3/3 | 37913 [3/3] | 1 [3/3] | unknown [0/3] | 8551 [3/3] |
| module-nested | pseudocode | worker | 3/3 | 49902 [3/3] | 19 [3/3] | 95501 [3/3] | n/a |
| module-nested | pseudocode | judge | 3/3 | 11204 [3/3] | 1 [3/3] | 23720 [3/3] | n/a |
| module-nested | pseudocode | reflection | 3/3 | 39606 [3/3] | 1 [3/3] | unknown [0/3] | 10091 [3/3] |
| module-flat | observation | worker | 3/3 | 50370 [3/3] | 18 [3/3] | 79972 [3/3] | n/a |
| module-flat | observation | judge | 3/3 | 13422 [3/3] | 1 [3/3] | 37187 [3/3] | n/a |
| module-flat | observation | reflection | 3/3 | 40422 [3/3] | 1 [3/3] | unknown [0/3] | 11829 [3/3] |
| module-nested | observation | worker | 3/3 | 57470 [3/3] | 18 [3/3] | 103293 [3/3] | n/a |
| module-nested | observation | judge | 3/3 | 10148 [3/3] | 1 [3/3] | 17227 [3/3] | n/a |
| module-nested | observation | reflection | 3/3 | 45617 [3/3] | 1 [3/3] | unknown [0/3] | 6742 [3/3] |

Reflection is diagnostic self-report, not grading authority or a certified cause. Missing reflection is unknown, not zero overhead. Role usage requires complete, positive observed usage; reflection additionally requires a completed, isolated interview. A host-recorded judge deadline is unqualified even if the SDK reports complete=true and zero counters. Those original raw counters are retained unchanged, but zero tokens/cost must not be claimed as measured consumption. The observed timeout wait remains in raw usage and unqualifiedUsage[].observedWallClockMs. A completed inconclusive judge with positive qualified usage is not excluded for its verdict.

### Unqualified role measurements


Provider-reported cost values, where present, are raw counters in raw-metrics.json; they are not a trustworthy tariff estimate.

## Call ledgers

- [baseline: every captured call](baseline.calls.md) — observable purpose, command status, read ranges, output fingerprints and batching candidates; no inferred private reasoning or automatic unnecessary-call score.
- [prose: every captured call](prose.calls.md) — observable purpose, command status, read ranges, output fingerprints and batching candidates; no inferred private reasoning or automatic unnecessary-call score.
- [pseudocode: every captured call](pseudocode.calls.md) — observable purpose, command status, read ranges, output fingerprints and batching candidates; no inferred private reasoning or automatic unnecessary-call score.
- [observation: every captured call](observation.calls.md) — observable purpose, command status, read ranges, output fingerprints and batching candidates; no inferred private reasoning or automatic unnecessary-call score.

## Portable offline replay

Run from this report directory after moving it anywhere. Set EVAL_REPO to an available checkout containing the analysis modules whose hashes are in bindings.json; use Node 22. No old temporary source/sandbox directory is required. Historical source SHA and cwd strings in the four *.input.json files are preserved as evidence, not rewritten or stat-ed by these renderers.

```bash
EVAL_REPO=/absolute/path/to/gennady
for arm in baseline prose pseudocode observation; do
  node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-baseline-report.ts" --input "./$arm.input.json" --out "./$arm.replayed-report.json"
  node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-call-audit.ts" "./$arm.input.json" "./$arm.replayed-calls.md"
done
```

Qualified complete six-record arms can produce their full call ledger through the existing renderer. Baseline replay exits 0 for complete qualified input and 2 for incomplete input; the existing call-audit CLI exits 0 when complete or rejects incomplete input with 1. Neither fail-closed exit is permission to drop failed attempts. Each input is bounded to the existing CLI 8 MiB limit. The embedded permanent/ directory below contains exact, hash-bound copies of the real permanent summary.json bytes only; no model or sandbox replay is needed.

```bash
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format2-oct23 --baseline baseline --candidate prose --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./baseline-vs-prose.replayed-compare.json
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format2-oct23 --baseline baseline --candidate pseudocode --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./baseline-vs-pseudocode.replayed-compare.json
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format2-oct23 --baseline baseline --candidate observation --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./baseline-vs-observation.replayed-compare.json
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format2-oct23 --baseline prose --candidate pseudocode --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./prose-vs-pseudocode.replayed-compare.json
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format2-oct23 --baseline prose --candidate observation --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./prose-vs-observation.replayed-compare.json
```

Replay outputs must be new names because existing CLIs refuse overwrites. The four input snapshots include full retained summary/trajectory/reflection plus observed cleanup proof. Raw permanent summaries keep their original bytes and directory names; no source identity, quality label or cwd normalization is applied. Missing attempts remain absent from permanent/ and explicitly missing in the plan-based report.

