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
