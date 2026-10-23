# Preregistered instruction-placement pilot

Status: protocol fixed before baseline/candidate outcomes. This is an experiment, not a claim that
template-local instructions are inherently better. No automatic merge or package publication.

## Population and competing hypotheses

The first population is exactly `module-flat,module-nested`, three repetitions each, four variants:

| Variant       | Hypothesis                                                                     |
| ------------- | ------------------------------------------------------------------------------ |
| baseline      | Current module owner, local skeleton and manifest fill instructions            |
| template-rich | Content instructions are easiest to use in their owning template sections      |
| owner-rich    | One concentrated recipe in the owner is easier than local section instructions |
| concise-both  | A short reminder in both locations is more useful than either extreme          |

Total: 24 live primary attempts, plus separately metered semantic reviews and post-task interviews.
Selection was made from static duplication analysis, not from candidate scores. Other eight artifact
types remain deterministic holdouts; a result on two module cases is not a claim about every scope,
portal, index, refinement, or full SDD flow. A winning strategy needs broader live validation before
it is generalized. The old ten-case N=1 cohort is diagnostic only, never pooled into this pilot.

## Fixed acceptance

Operator success criterion: instructions smaller, artifact quality not lower, tool calls not higher.

- The exact static envelope includes generated module owner, skeleton, actual rendered manifest,
  and the three external entity/DbC formats. Count UTF-8 bytes, approximate lexical token units and
  per-part hashes. This captures text moved between owner/template/manifest instead of hiding it.
  Lexical units are not the Flash tokenizer. SDK input/cache/timing remain separately reported.
- A successful optimization must shrink this envelope for at least one selected case and grow it
  for none. A larger variant may teach us something but does not meet the operator success criterion.
- In EACH case, artifact pass count, semantic pass count and observed path pass count may not fall.
  Tool-call total, median and maximum may not grow. Do not average a regression away across cases.
- Keep every repetition including red, timeout, incomplete and inconclusive. Missing provenance or
  metrics means incomparable, not a reason to drop that record or rerun until green.
- A shorter instruction is not inherently clearer; independent semantic review still matters.
  A generic judge cannot waive host diagnostics or turn opaque Bash into whole-write proof.
- Small samples provide descriptive observations, not statistical significance or a guarantee.
  Elapsed time is diagnostic, not an additional mandatory speed-win requirement in this pilot.

## Controlled mutation and environment

All variants share the exact artifact criteria, task facts, static dependency protocol, Flash model,
server behavior config, host and concurrency 3. Primary worker deadline 180 s; observation interval
2.5 s, idle threshold 80 and observation limit 100. Authoring judge deadline 180 s, read-only model
tools disabled. Reflection deadline 90 s. No model fallback; stop after at most five unavailable-route
attempts. The immutable protocol is frozen on a clean source revision before any primary LLM call.

Mutate only the module content recipe, local instructional comments and module manifest `fill` prose.
These are composite text mutations (placement plus paraphrase/deduplication), not a causal estimate
of placement alone. The three candidates share a semantic checklist; comparison with the historical
baseline must not attribute every difference to one location or to the language of the wording.
Anchors, headings, section flags/order, tables/folds, ToolCalls, whole-document discipline, draft
checks, close/handoff, pivot/refine/approval safeguards and external formats remain fixed. Generated
directives are rebuilt from kit; they are not hand-edited. Each variant has a separate clean checkout.
Do not edit a source checkout while its batch runs. All variants use the same iteration order:
flat r1, nested r1, flat r2, nested r2, flat r3, nested r3. Finite shared-provider/cache noise remains;
repeat surprising observations before any broad claim.

## Reflection and causal evolution

Persist the primary artifact, observed tool sequence/coverage, verdicts, identity and counters BEFORE
the interview. The trace projects tool arguments: it is not a complete transcript of arbitrary Bash
output or every Write body. Separately hash-bound public tool enrichment may capture allowlisted
checker diagnostics and Write-content digests; never infer absent evidence from self-report.
Then ask the SAME worker for short public factual notes: instruction path/anchor, observed tool-call
ID, what helped, what was unclear/duplicated/missing and one change to test next. Do not request or
export private reasoning. Tools are mechanically disabled using the verified server tool inventory.
Detect new tool calls and diff changes; record violations or missing capture, never silently repair
the primary artifact. Reflection uses separate usage deltas and cannot rewrite the primary counters.

Self-report is a hypothesis, not a causal explanation or grading authority. Check claimed call IDs
against the immutable trace. Analyze failures, repeated reads/checks and outputs first, then compare
the worker's notes with those facts. A subsequent mutation needs a stated hypothesis, fixed tests,
new clean source identity and the same benchmark; change one dimension rather than accumulating
unattributed prompt tweaks. Keep rejected variants and negative results in the experiment record.

## Recorded hypotheses and bounded outcomes

This retrospective register does not amend the original preregistration. Baseline flat tools were
83 total /25 median, bounded artifacts3/3; nested68 /21, artifacts1/3. Each cell below covers exactly
three attempts and preserves the historical oracle outputs.

| Hypothesis / mutation                                                                | Flat tools total / median; artifacts | Nested tools total / median; artifacts | Decision                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------- | ----------------------------------------------------------- |
| H1 template-rich: local section recipes, compact owner                               | 80 /27; 3/3                          | 76 /24; 2/3                            | Reject: median growth in both cases and nested total growth |
| H2 owner-rich: concentrated owner recipe, thin template                              | 85 /31; 3/3                          | 75 /25; 1/3                            | Reject: total and median growth in both cases               |
| H3 concise-both: compact reminders in both locations                                 | 69 /20; 3/3                          | 72 /24; 3/3                            | Reject: nested regression despite flat improvement          |
| H4 concise-acronym: H3 plus generic filename-derived acronym hint before first Write | 88 /29; 3/3                          | 70 /23; 1/3                            | Reject: both totals and medians grow                        |

H4 is a separate adaptive six-attempt generation, preregistered after the original24; it is not
pooled into the initial comparison. Its six selected public receipts show one Write and one
successful check per target with no acronym warning, versus earlier warning→correction sequences.
That is an observed local mechanism, not proof of a global efficiency gain or a causal explanation
of tool totals. Reflection is separately recorded self-report, never the endpoint or proof of an
unobserved action. No candidate is adopted. Exact sources, all30 records, four comparisons and
per-role totals are in [the campaign report](../results/authoring-campaigns/template-placement-oct22/REPORT.md).

## Confirmed defects and correction boundary

The confirmed defects below are FIXED. Targeted40/40 passed before the additional list-prefix
controls; independent focused RU/EN acceptance and contradictory-approval tests subsequently pass2/2
including those controls. A separate Flash-only grader calibration matches all6 expected labels
(3 PASS, 3 FAIL, including target instruction injection), tools0, with complete observed usage/
coverage. The updated offline flow-eval suite passes **441/441**, including frozen replay and
the separate recorded calibration:

- The frozen handoff oracle required literal English `pending`, rejecting explicit equivalent
  unapproved states. The calibrated predicate accepts bounded RU/EN forms and retains tested
  forged/contradictory approval negatives, including list-prefix cases.
- The historical primary judge lacked source-owned parent/contract facts and sometimes emitted
  tool text or no verdict. Current evidence capture validates exact source-owned references and
  hashes within read bounds; text-only instructions and tool denial pass the separate live smoke
  calibration. This does not guarantee future grader reliability; malformed/no verdict stays
  inconclusive, and historical raw verdicts are unchanged.
- The frozen `tokenRequirements` success rule overlapped its empty/separator-only rejection rule.
  The calibrated success domain now requires ASCII input with at least one non-separator character;
  it is not restricted to alphanumeric input. Historical replay explicitly selects `frozen-oct22`,
  preserving old seed bytes, hashes and grades instead of regrading under the current default.

The seed is a root context defect that can cause or propagate generated requirement contradictions;
those outcomes cannot be attributed causally to placement. The separate calibration records43,055
non-cache and9,984 cache-read units, true cleanup receipts for all six sessions/fixtures, and owned
server/temp-root cleanup. Its exact five-file pre-format source snapshot is hash-bound and explicitly
`sourceDirty:true`, not a clean-source optimization result. See the
[calibration record](../results/authoring-campaigns/template-calibration-oct23/README.md).
The extended `ai/flow-eval/tsconfig.authoring.json` compiler check, including runner/evidence after repair of
eight broader diagnostics, passes; the updated full-suite result is441/441. The previous434/434
suite result belongs to the historical pre-fix state, not this delta.

Actual saved requirement contradictions and the baseline nested-r2 broken relative link are
historical artifact failures, not fixed outputs. A repaired seed/oracle must not erase them or
claim a new winner from old scores. The report tracks repair status separately from raw results.
All four optimization hypotheses remain rejected; any future comparison requires a newly frozen
baseline under the calibrated seed, oracle and judge, not pooling or rescoring the old30 outcomes.
These two cases cover only isolated flat/nested module-document authoring, not other artifact
kinds, implementation, approval or full SDD execution. Any offline replay/probe must use owned
temporary fixtures and clean them in `finally`, including after test failure; archived evidence and
read-only seeds remain unchanged.
