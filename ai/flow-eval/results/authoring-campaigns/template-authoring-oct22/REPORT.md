# Exploratory campaign — not a qualified baseline

Source: `c60738a240d356923e0d05665adef45c6eb2907b`, clean at capture.
Model actually observed: `llm-proxy/deepseek-v4-flash`; OpenCode 1.17.15, concurrency 1.
Exact original input: [plan.json](./plan.json), SHA-256
`85c3f92b09d392818d62a065e38a7aed7b741c366cc381984256679bcc0fcbf0`.
The plan is frozen evidence, not the next campaign's repaired input.

## Outcome and limits

Two cases completed, one was interrupted by the operator-owned harness SIGINT, seven never started.
The harness retained their raw records and removed all ten owned sandboxes. Interrupted or unstarted
cases are not successes, zero-cost attempts or missing observations to discard from a comparison.

| Case          | Artifact oracle                         | Raw judge                        | Strict path | Worker time | Uncached tokens | Cache-read tokens | Tools / whole Writes |
| ------------- | --------------------------------------- | -------------------------------- | ----------- | ----------: | --------------: | ----------------: | -------------------: |
| portal        | PASS, bounded format/graph/table checks | pass                             | unproven    |    31.009 s |          29,419 |           223,616 |               12 / 1 |
| scope-product | PASS, bounded artifact checks           | fail, rubric contradiction below | unproven    |   113.711 s |          53,926 |           509,056 |               27 / 2 |
| scope-library | interrupted, not graded complete        | none                             | interrupted | unavailable |     unavailable |       unavailable |               22 / 0 |

Completed worker counters total 83,345 uncached + 732,672 cache-read tokens. This is NOT the campaign's
full consumption: the interrupted worker and judges are not included. The portal judge was separately
observed via the SDK: 18,469 uncached + 9,472 cache-read tokens and 76.923 s. Other judge consumption is
not retained in these summary counters. SDK `cost: 0` is unpriced metadata, not a claim that calls were free.

The completed traces show create → target Read → whole Write and no observed partial file writes.
They also contain opaque compound Bash commands (find/cat/git/grep); the narrow oracle correctly
leaves whole-write-only provenance unproven. This is a measurement limit, not evidence of an actual
partial mutation or a broken authored document. Source criteria and old verdicts were not rewritten.

## Why this campaign cannot establish performance or quality improvement

1. **Fixture command fault:** the brief said bare `gennady`, but provisioning installs a local shim
   without adding it to PATH. Both completed agents obeyed it, received exit 127 and recovered via a
   repo-local/npx invocation. The resulting overhead belongs to the benchmark, not production template quality.
2. **Seed semantics fault:** infra-base was described as authoring/tooling but its reference spec
   duplicated the library normalizer domain contract. Independent review caught this despite structural
   tests passing. The repaired fixture must have a distinct truthful infrastructure owner.
3. **Judge rubric contradiction:** scope-product was failed solely for its initial MODULE_MAP line
   `Modules not yet decomposed — run module-decomposition token`. The product format and template explicitly
   prescribe this pending-decomposition form. It is not an N/A claim or leftover bracketed guidance.
   Preserve the original judge response; clarify canonical acceptance for subsequent campaigns rather
   than forcing an agent to create extra modules or changing a correct product contract.
4. Portal's mechanical oracle checks bounded shape/links/graph/table, not arbitrary Vision semantics.
   A reviewer probe could contradict TypeError prose while retaining structural PASS. This limitation
   is explicit; a language-model PASS is not a substitute for source-bound semantic review.

The run was stopped once fixture faults were confirmed, saving the seven remaining calls. Subsequent
work must use a new source revision, task/oracle/harness identities and campaign name; these records
must not be relabelled as the repaired baseline. There is no A/B result or speed/quality win here.

## Next controlled steps

Repair command/seed context and causal tests; preserve actual Bash cwd and reject incomplete SDK
token metrics; clarify the initial MODULE_MAP acceptance. Then collect a fresh diagnostic matrix,
qualify repetitions and only afterwards evolve production template guidance one hypothesis at a time.
Full-flow integration and independent review remain separate requirements.
