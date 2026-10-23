# Complete ten-case diagnostic: not a qualified performance baseline

Source: clean `a681444f17e1199857a13b60bb3763b125dd8436`. Production templates/directives unchanged.
Exact input: [plan.json](./plan.json), SHA-256
`cff1a9b59a934b4e0508129901e28186e1dfbd5c2ce7fe4ccc4370038ef17621`.
Ten predeclared cases, one repetition each, concurrency 1, worker deadline 180 s.
Observer idle bound is 80 × 2.5 s (200 s), longer than that deadline; unlike the previous cohort,
this does not abort a normally thinking model after 30 s without a new tool call.
All ten workers and judges completed. Batch exit **1** is preserved, not converted into success.

## Measurements

These are SDK worker spans and non-cache input+output+reasoning counters, NOT observer polling time
or invoice totals. Exact artifacts, traces and old judge responses are in the sibling per-case
directories `2026-10-22-authoring-template-authoring-wall180-oct22-<case>-baseline-r1/`.

| Case                 | Artifact oracle as run                         | Judge as run | Worker seconds | Non-cache tokens | Tool calls |
| -------------------- | ---------------------------------------------- | ------------ | -------------: | ---------------: | ---------: |
| portal               | PASS                                           | pass         |         27.273 |           31,490 |         14 |
| scope-product        | PASS                                           | pass         |        158.272 |           77,782 |         24 |
| scope-library        | PASS                                           | pass         |         81.848 |           43,592 |         20 |
| scope-infrastructure | RED (oracle false-negative)                    | pass         |        107.877 |           69,109 |         22 |
| scope-interface      | PASS                                           | pass         |         91.587 |           56,346 |         26 |
| module-flat          | PASS                                           | inconclusive |         97.162 |           56,468 |         25 |
| module-nested        | RED (real link defect + oracle false-negative) | pass         |        128.188 |           58,170 |         24 |
| index-module         | PASS                                           | pass         |         38.817 |           23,868 |         21 |
| index-scope          | PASS                                           | pass         |         22.032 |           17,714 |         12 |
| index-project        | PASS                                           | pass         |         23.116 |           22,023 |         13 |

Worker total: **456,562 non-cache tokens**, 4,385,792 cache-read tokens; sum SDK spans 776.172 s.
Judge total, separately: **140,785 non-cache tokens**, 147,328 cache-read tokens; sum spans 390.829 s.
[SDK metadata audit](./sdk-usage.json) records all 20 roles with complete counters and actual
`llm-proxy/deepseek-v4-flash` identities. No credential or reasoning text is exported. SDK `cost: 0`
is **unpriced**, not proof of a free run. Provider-side/background accounting is not a verified bill.

## What this actually discovered

1. Infrastructure used a valid three-column `Example / Input / Outcome` table. The old oracle
   incorrectly demanded exactly two columns. Correct examples in the owning section are present.
2. Nested module validly delegated requirements to existing parent `TOK-REQ-1`/`TOK-REQ-2` using the
   canonical template branch. The old oracle incorrectly required new local requirement headings.
   Its separate link finding is **real**: `../../../docs/token-contract.md` resolves to missing
   `specs/docs/token-contract.md`, not the seeded root `docs/token-contract.md`.
3. All narrow whole-write path gates are **unproven**, primarily because they cannot establish the
   absence of hidden mutations inside arbitrary Bash. Infrastructure/interface also lack a proven
   successful exact-target check after their final Write. This is not ten proven agent defects and
   must not be presented as ten successful trajectories either. Full tool traces remain available.
4. Generic judge saw a bounded diff/tail, not source-owned CLI exits or the complete artifact.
   `module-flat` correctly returned inconclusive given that limitation. A judge PASS for the nested
   module does not override its real broken link. Old generic PASSes are not authoritative semantic
   certification. Later harness changes give the authoring-only judge the complete bounded artifact
   and separate its semantic scope from deterministic execution/path gates.

## Disposition

All raw outcomes above are frozen. Oracle/judge calibration is a **new protocol**, never a rewrite
of these records or evidence of improved agent behavior. No failed attempt is removed. The prior
30 s observer-censored cohort is retained separately and cannot be pooled with this one.

This is N=1 diagnostic coverage, not a qualified baseline and not an A/B improvement result.
Before production template changes: review/calibrate the harness, freeze the final protocol, run
at least three repetitions of every declared case and variant, then compare quality/path outcomes,
actions, SDK time, tokens and cache separately. Keep opaque-path uncertainty visible. A claim of
better trajectory requires direct evidence on that axis; lower tokens alone cannot establish it.
