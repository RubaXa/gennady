# EA-3: partial evidence, not behavioral acceptance

Primary budget: 16 attempts. Spent: **7** (2 original + 5 continuation); unstarted: **9**.
No replacement, new full cohort, fallback model, or post-stop model calls. PR #130 remains Draft.
EA-1/EA-2 stage approvals do not approve this stage or authorize merge/publication.

## Recorded attempts

`F` = independent host functional assertions, not semantic quality or task completion.
Tokens are the SDK non-cache total; cache reads are separate. Times are SDK capture spans, not
an efficiency comparison between different stopping causes. A dash means unavailable, not zero.

| Case / arm                      | Outcome                                           | F   | Task completion | Tools | Non-cache tokens | Cache-read tokens | SDK seconds |
| ------------------------------- | ------------------------------------------------- | --- | --------------- | ----: | ---------------: | ----------------: | ----------: |
| EX1 baseline, original fixture  | budget; full-audit fixture invalid                | yes | not proven      |   137 |           292851 |           5325056 |     470.146 |
| EX1 candidate, original fixture | operator-interrupted for fixture defect           | —   | not proven      |    74 |                — |                 — |           — |
| EX2 candidate                   | policy-censored before dispatch/write/repair      | no  | not proven      |    16 |            39199 |             89856 |      15.203 |
| EX2 baseline                    | budget, missing group code-review receipt         | yes | not proven      |   146 |           313451 |           4518784 |     480.029 |
| EX3 baseline                    | budget, missing group code-review receipt         | yes | not proven      |   179 |           366182 |           6386048 |     480.028 |
| EX3 candidate                   | policy-censored after readiness investigation     | no  | not proven      |    45 |           102395 |           1032704 |     150.720 |
| EX4 candidate                   | deliberately interrupted at routing-confound hold | yes | not proven      |    42 |                — |                 — |           — |

All five continuation captures have host integrity PASS. EX4 is a partial interruption capture,
always terminal-failing/evidence-incomplete; it is not a completed candidate evaluation.
No semantic judge/reflection was run on these incomplete/error/budget outcomes. Provider cost fields
are zero, which does **not** establish free calls or an actual dollar cost. No token/latency win is claimed.

## What was actually learned

1. EX1 exposed a measurement defect: code/test phases worked, but real group audit selected builtin
   `full` scripts absent from the protected fixture. Old reference controls wrote receipts without
   running mandatory full. Original bytes and failures are retained. Fixture v2 selects the existing
   real syntax/unit steps for full; correct-source/full-PASS and broken-source/actual-scenario-FAIL
   controls now execute before audit receipts, including exact contract lint/reverse inventory.
2. EX2 baseline really repaired `maxWaitMs: -1→1000`, resolved the blocker, implemented source/tests,
   passed phase checks, full, contract lint and reverse inventory. Audit receipt exists; code-review
   receipt does not. These are positive technical-recovery observations, not full completion.
   Candidate inspected installed `.bin/gennady`/package metadata and was censored before repair.
   Comparing its shorter run with baseline as efficiency or inability to repair would be invalid.
3. EX3 baseline produced a functional helper and preserved the approved obligations. Candidate
   received a successful exact P1 dispatch, then investigated readiness and performed a forbidden
   multi-command/version probe. The protocol violation is observed; its eventual replan ability is
   unknown. Canonical-command path failure on the old runtime does not prove worse model judgment:
   that runtime lacks the new replan/decision APIs. Protocol, behavior and terminal stay separate.
4. Independent host-only probes found the **same pre-existing routing inconsistency in both arms**:
   global map hid the ticket (`0 pickable`, seven missing unrelated builtin gates, no owner), while
   exact ticket/P1 returned a real dispatch. Specific-ticket execution is allowed, so impossibility
   is not proven. This is a product defect and unplanned confound, not a candidate-only regression
   or a reason to relabel every attempt invalid. It plausibly contributes to discovery; causality
   of the model's choices is not established by the probe.
5. EX4 was intentionally interrupted to avoid spending further calls before resolving that confound.
   The partial source passes host behavior assertions; no completed durable-decision/terminal
   success is claimed. No counterfactual completion is invented.

## Corrections after the frozen series

- EA-2c fixes the map, not the fixture or gate strength: a graph-ready ticket whose **first
  unfinished** phase has a resolved project-authored selector uses the same readiness boundary as
  exact dispatch. `EXECUTION_READY` stays truthful; `PROJECT_SELECTOR_QUEUE` is explicitly not PASS.
  Builtin ownership/readiness, graph/audit dependencies, phase rules/paths and actual Verify remain
  enforced. Eight new regression controls, full sdd-task suite 93/93; causal RED was obtained before
  implementation. These prove routing consistency, not improved model behavior.
- Qualification adds initial global-map/exact-phase agreement before reference writes/models.
  A prepared-fixture contradiction stops collection rather than being repaired or hidden.
- Path measurement accepts actual strict CLI equals/mixed flags, rejects quoted help and
  shell-suffix outcomes, and requires actual full Verify for complete-terminal cases.
- Independent assertions include the declared EX3 helper consumer, not only the main function.
- Partial interruption snapshots persist without being promoted to complete evidence.
- Console budget label no longer calls an excluded outcome `gate: pass`; old raw bytes and
  historical budget-exit semantics are unchanged.

The original equals-flag analysis amendment was registered before candidate outcome. A historical
analysis replay has **not** been performed; old grades are unchanged. The stricter new full-audit
requirement must not be silently applied as if it were only that narrow historical parser replay.

## Cleanup and next review boundary

[Continuation cleanup](./cleanup.json): safeCleanup/rootRemoved=true; all five scenario sandboxes
removed, private server/runtime clones removed, shared dependencies untouched. The original stopped
campaign has a separate cleanup-recovery record; its original unsafe-cleanup record was not rewritten.

Review EA-2c plus measurement corrections and partial evidence **before** defining any further live
scope/runtime/route. Nine attempts remain unstarted in the original cap; this is not permission to
replace EX1/EX2/EX3/EX4, silently pool fixture versions or launch another sixteen. Product autonomy,
semantic decision quality, whole-PR acceptance and efficiency improvement remain **NOT PROVEN**.
