# Format pilot — observed results

Campaign incomplete: 4/24 primary records; 3 completed, 1 interrupted. Controller stop signal=SIGINT. This is a stopped sanity screen, not an A/B success result; no resampling or dropping failed attempts.

Descriptive pilot only. No automatic adoption, causal savings, statistical equivalence or provider-priced dollar estimate. Unknown/partial measurements are not zero and cannot establish improvement.

| Case | Arm | Saved | Artifact / semantic / path | Tools median | Worker tokens | Worker messages | Worker ms | Complete binding |
|---|---|---:|---|---:|---:|---:|---:|---:|
| module-flat | baseline | 1/3 | 0/0/0 of 3 | 23 [1/3] | 49336 [1/3] | 16 [1/3] | 83904 [1/3] | 1/3 |
| module-flat | prose | 1/3 | 1/1/0 of 3 | 34 [1/3] | 70203 [1/3] | 27 [1/3] | 148248 [1/3] | 1/3 |
| module-flat | pseudocode | 1/3 | 1/1/0 of 3 | 25 [1/3] | 50483 [1/3] | 20 [1/3] | 91735 [1/3] | 1/3 |
| module-flat | observation | 1/3 | 0/0/0 of 3 | 29 [1/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] | 0/3 |
| module-nested | baseline | 0/3 | 0/0/0 of 3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] | 0/3 |
| module-nested | prose | 0/3 | 0/0/0 of 3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] | 0/3 |
| module-nested | pseudocode | 0/3 | 0/0/0 of 3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] | 0/3 |
| module-nested | observation | 0/3 | 0/0/0 of 3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] | 0/3 |

Each metric is median [known/expected]. Quality columns remain separate. A failed attempt stays in the planned denominator. Worker ms is the recorded SDK worker span, not outer polling, judge or reflection time.

## Derived contract observations — separate from primary grades

| Case | Arm | Saved/planned | >1 native whole-write | Partial-write attempts | Outside-target attempts | Any violating attempt | Adoption blocked by observation |
|---|---|---:|---:|---:|---:|---:|---|
| module-flat | baseline | 1/3 | 1 [1/3 measured] | 0 [1/3 measured] | 0 [1/3 measured] | 1/3 | YES — observed violation |
| module-nested | baseline | 0/3 | 0 [0/3 measured] | 0 [0/3 measured] | 0 [0/3 measured] | 0/3 | not cleared by absence |
| module-flat | prose | 1/3 | 1 [1/3 measured] | 0 [1/3 measured] | 0 [1/3 measured] | 1/3 | YES — observed violation |
| module-nested | prose | 0/3 | 0 [0/3 measured] | 0 [0/3 measured] | 0 [0/3 measured] | 0/3 | not cleared by absence |
| module-flat | pseudocode | 1/3 | 1 [1/3 measured] | 0 [1/3 measured] | 0 [1/3 measured] | 1/3 | YES — observed violation |
| module-nested | pseudocode | 0/3 | 0 [0/3 measured] | 0 [0/3 measured] | 0 [0/3 measured] | 0/3 | not cleared by absence |
| module-flat | observation | 1/3 | 1 [1/3 measured] | 0 [1/3 measured] | 0 [1/3 measured] | 1/3 | YES — observed violation |
| module-nested | observation | 0/3 | 0 [0/3 measured] | 0 [0/3 measured] | 0 [0/3 measured] | 0/3 | not cleared by absence |

These are separate observations from frozen wholeWrites/partialWrites/outsideTargetWrites metrics and available native call IDs, not a new primary grade. A positive observation blocks adoption even when the primary path verdict is unknown because of opaque Bash. Missing counts are unknown, never zero or evidence of a missing write. Zero observed violations is not proof of a clean path, even with complete trace capture. Partial/outside counts describe tool attempts, not successful mutations. Primary artifact/semantic/path outcomes and standard comparisons are unchanged; failures and inconclusive outcomes remain in the table.

## Standard comparisons

- baseline → prose: comparable=false; recommendation=inconclusive; regressions=module-flat; issues=module-flat: missing/duplicate repetition; module-nested: missing/duplicate repetition; module-nested: missing/invalid/mixed instruction footprint; module-nested: incomparable taskDigest; module-nested: incomparable oracleDigest; module-nested: incomparable harnessDigest; module-nested: incomparable environmentDigest; module-nested: mixed source revisions within variant.
- baseline → pseudocode: comparable=false; recommendation=inconclusive; regressions=module-flat; issues=module-flat: missing/duplicate repetition; module-nested: missing/duplicate repetition; module-nested: missing/invalid/mixed instruction footprint; module-nested: incomparable taskDigest; module-nested: incomparable oracleDigest; module-nested: incomparable harnessDigest; module-nested: incomparable environmentDigest; module-nested: mixed source revisions within variant.
- baseline → observation: comparable=false; recommendation=inconclusive; regressions=module-flat; issues=module-flat: missing/duplicate repetition; module-flat: missing semantic assessment; module-flat: dirty/unverified source, environment or model; module-flat: missing/invalid speed/token metrics; module-nested: missing/duplicate repetition; module-nested: missing/invalid/mixed instruction footprint; module-nested: incomparable taskDigest; module-nested: incomparable oracleDigest; module-nested: incomparable harnessDigest; module-nested: incomparable environmentDigest; module-nested: mixed source revisions within variant.
- prose → pseudocode: comparable=false; recommendation=inconclusive; regressions=module-flat; issues=module-flat: missing/duplicate repetition; module-nested: missing/duplicate repetition; module-nested: missing/invalid/mixed instruction footprint; module-nested: incomparable taskDigest; module-nested: incomparable oracleDigest; module-nested: incomparable harnessDigest; module-nested: incomparable environmentDigest; module-nested: mixed source revisions within variant.
- prose → observation: comparable=false; recommendation=inconclusive; regressions=module-flat; issues=module-flat: missing/duplicate repetition; module-flat: missing semantic assessment; module-flat: dirty/unverified source, environment or model; module-flat: missing/invalid speed/token metrics; module-nested: missing/duplicate repetition; module-nested: missing/invalid/mixed instruction footprint; module-nested: incomparable taskDigest; module-nested: incomparable oracleDigest; module-nested: incomparable harnessDigest; module-nested: incomparable environmentDigest; module-nested: mixed source revisions within variant.

The existing comparator requires a smaller static instruction envelope and no per-case quality/path/tools regression. It does not evaluate message counts or judge/reflection costs; those are separately retained, not silently added to worker totals.

## Roles accounted separately

| Case | Arm | Role | Usage qualified | Tokens | Messages | Usage wall ms | Reflection elapsed ms |
|---|---|---|---:|---:|---:|---:|---:|
| module-flat | baseline | worker | 1/3 | 49336 [1/3] | 16 [1/3] | 83904 [1/3] | n/a |
| module-flat | baseline | judge | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-flat | baseline | reflection | 1/3 | 38346 [1/3] | 1 [1/3] | unknown [0/3] | 9481 [1/3] |
| module-nested | baseline | worker | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-nested | baseline | judge | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-nested | baseline | reflection | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] |
| module-flat | prose | worker | 1/3 | 70203 [1/3] | 27 [1/3] | 148248 [1/3] | n/a |
| module-flat | prose | judge | 1/3 | 11939 [1/3] | 1 [1/3] | 28017 [1/3] | n/a |
| module-flat | prose | reflection | 1/3 | 51365 [1/3] | 1 [1/3] | unknown [0/3] | 9176 [1/3] |
| module-nested | prose | worker | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-nested | prose | judge | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-nested | prose | reflection | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] |
| module-flat | pseudocode | worker | 1/3 | 50483 [1/3] | 20 [1/3] | 91735 [1/3] | n/a |
| module-flat | pseudocode | judge | 1/3 | 12565 [1/3] | 1 [1/3] | 32669 [1/3] | n/a |
| module-flat | pseudocode | reflection | 1/3 | 38635 [1/3] | 1 [1/3] | unknown [0/3] | 7387 [1/3] |
| module-nested | pseudocode | worker | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-nested | pseudocode | judge | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-nested | pseudocode | reflection | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] |
| module-flat | observation | worker | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-flat | observation | judge | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-flat | observation | reflection | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] |
| module-nested | observation | worker | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-nested | observation | judge | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | n/a |
| module-nested | observation | reflection | 0/3 | unknown [0/3] | unknown [0/3] | unknown [0/3] | unknown [0/3] |

Reflection is diagnostic self-report, not grading authority or a certified cause. Missing reflection is unknown, not zero overhead. Role usage requires complete, positive observed usage; reflection additionally requires a completed, isolated interview. A host-recorded judge deadline is unqualified even if the SDK reports complete=true and zero counters. Those original raw counters are retained unchanged, but zero tokens/cost must not be claimed as measured consumption. The observed timeout wait remains in raw usage and unqualifiedUsage[].observedWallClockMs. A completed inconclusive judge with positive qualified usage is not excluded for its verdict.

### Unqualified role measurements

- authoring-format-oct23-module-flat-baseline-r1 / judge: host-recorded-judge-deadline: raw zero counters are not known zero cost; observed wall ms=180018. Consumption/cost unknown, not zero.
- authoring-format-oct23-module-flat-observation-r1 / worker: usage-missing-partial-zero-or-model-unverified; observed wall ms=unknown. Consumption/cost unknown, not zero.
- authoring-format-oct23-module-flat-observation-r1 / judge: usage-missing-partial-zero-or-model-unverified; observed wall ms=unknown. Consumption/cost unknown, not zero.
- authoring-format-oct23-module-flat-observation-r1 / reflection: missing-incomplete-noncompleted-or-zero-usage-interview; observed wall ms=unknown. Consumption/cost unknown, not zero.

Provider-reported cost values, where present, are raw counters in raw-metrics.json; they are not a trustworthy tariff estimate.

## Call ledgers

- baseline: complete qualified call-audit renderer not run because binding/capture/cleanup is incomplete. [Partial raw trajectory projection](baseline.trajectory.md) preserves every available attempt and the missing-run list.
- prose: complete qualified call-audit renderer not run because binding/capture/cleanup is incomplete. [Partial raw trajectory projection](prose.trajectory.md) preserves every available attempt and the missing-run list.
- pseudocode: complete qualified call-audit renderer not run because binding/capture/cleanup is incomplete. [Partial raw trajectory projection](pseudocode.trajectory.md) preserves every available attempt and the missing-run list.
- observation: complete qualified call-audit renderer not run because binding/capture/cleanup is incomplete. [Partial raw trajectory projection](observation.trajectory.md) preserves every available attempt and the missing-run list.

## Portable offline replay

Run from this report directory after moving it anywhere. Set EVAL_REPO to an available checkout containing the analysis modules whose hashes are in bindings.json; use Node 22. No old temporary source/sandbox directory is required. Historical source SHA and cwd strings in the four *.input.json files are preserved as evidence, not rewritten or stat-ed by these renderers.

```bash
EVAL_REPO=/absolute/path/to/gennady
for arm in baseline prose pseudocode observation; do
  node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-baseline-report.ts" --input "./$arm.input.json" --out "./$arm.replayed-report.json"
  node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-call-audit.ts" "./$arm.input.json" "./$arm.replayed-calls.md"
done
```

Both CLIs fail closed for incomplete inputs. An expected exit 2 for a partial/error campaign is not permission to drop failed attempts. Each input is bounded to the existing CLI 8 MiB limit. The embedded permanent/ directory below contains exact, hash-bound copies of the real permanent summary.json bytes only; no model or sandbox replay is needed.

```bash
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format-oct23 --baseline baseline --candidate prose --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./baseline-vs-prose.replayed-compare.json
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format-oct23 --baseline baseline --candidate pseudocode --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./baseline-vs-pseudocode.replayed-compare.json
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format-oct23 --baseline baseline --candidate observation --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./baseline-vs-observation.replayed-compare.json
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format-oct23 --baseline prose --candidate pseudocode --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./prose-vs-pseudocode.replayed-compare.json
node --import "$EVAL_REPO/node_modules/tsx/dist/loader.mjs" "$EVAL_REPO/ai/flow-eval/scripts/authoring-experiment.ts" compare --campaign format-oct23 --baseline prose --candidate observation --cases module-flat,module-nested --repetitions 3 --results-dir ./permanent --out ./prose-vs-observation.replayed-compare.json
```

Replay outputs must be new names because existing CLIs refuse overwrites. The four input snapshots include full retained summary/trajectory/reflection plus observed cleanup proof. Raw permanent summaries keep their original bytes and directory names; no source identity, quality label or cwd normalization is applied. Missing attempts remain absent from permanent/ and explicitly missing in the plan-based report.

