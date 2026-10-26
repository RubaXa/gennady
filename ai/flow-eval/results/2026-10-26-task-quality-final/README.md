# Task quality — final bounded verification

Decision: keep the three operator-approved changes and submit for independent PR review. The
observed functional gain is removal of a needless related-read stop. The decomposition/review
probes do not establish superiority: both final baseline and candidate handle their cases.
No autonomous replanning, write-scope expansion, changed verification gates or npm publication.

## Final six attempts

| Probe                         | Baseline                            | Candidate                       | Non-cache tokens B → C | Actual tools B → C | SDK wall B → C    |
| ----------------------------- | ----------------------------------- | ------------------------------- | ---------------------- | ------------------ | ----------------- |
| Coherent vs independent tasks | 1 cohesive / 2 independent, correct | same, correct                   | 2610 → 2646            | 0 → 0              | 5.533s → 3.345s   |
| Email-list user-risk review   | all required facets present         | all required facets present     | 5580 → 5722            | 0 → 0              | 29.152s → 27.150s |
| Missing helper context        | cannot answer, needs orchestrator   | reads helper, returns correct 7 | 1660 → 2048            | 1 → 2              | 3.611s → 5.085s   |

The extra read is necessary work, not a tool-count optimization. Do not interpret the short-case
time changes as a reproducible speed improvement. Review answers cover range boundaries, stale
responses, cancellation, failure/retry, bounded mounts/requests, actual scrollbar behavior,
reuse of the existing harness/logger and no invented time budget. Their meaning was read by the
implementer; the deterministic facet checker checks structure/labels, not semantic completeness.
There was no separate independent model judge; external review remains required.

The read candidate has a complete trace with target then helper, no other tool, unchanged seeds,
and a path/reason in the public response. This demonstrates one orientation step, not the full
ticket lifecycle, actual independent task review, safe autonomous replanning or general non-inferiority.

## Preserve the first six, including measurement failures

The [initial records](../2026-10-26-task-quality/report.json) remain byte-for-byte unchanged.
Their review baseline contained all six requirement IDs with explanatory suffixes; the original
checker demanded exact string equality and falsely rejected it. Original read-path projections
contained `/private./src/...`: a macOS `/var` versus `/private/var` alias was partially redacted,
not an observed unrelated read. Raw failing facet/path labels are retained, not promoted to PASS.

The finite corrective series used the same synthetic briefs, the same model and source snapshot
policies, with two editorial policy corrections (`verified` → `tested`, `runtime proof` → `runtime
evidence`) and a corrected checker/canonical temporary root. Those inputs are separately recorded
in each `protocol.json`; no initial score or trajectory was overwritten. No further series is planned.

Total: **12 attempts / 18 observed assistant messages / 48367 non-cache tokens**. The final six
used 20266; the initial six used 28101. Cache reads are separate in raw usage. Provider-reported
zero is not a verified bill; monetary cost is **unknown**. One sample per probe/arm and fixed
baseline-first order cannot establish statistical equivalence or causal cost/time savings.

Inputs are exact working-tree snapshots, not clean-commit campaigns: `source.cleanBefore=false`
is retained. `protocol.json` preserves full policy/brief bytes, source revision/diff identity and
harness hashes. Recorded-evidence tests bind all 18 raw JSON files across both series; final
candidate policy and the actually executed harness bytes are checked. The exact executed runner
is preserved in `executed-task-quality-live.ts.txt`, bound to the unchanged protocol hash. Independent
review subsequently found that session creation, usage collection and session deletion could wait
indefinitely. The maintained runner now bounds every lifecycle wait and always removes the sandbox
after a failed delete. Hanging-request/cancellation tests cover that repair; these live records
do not claim to have executed the later lifecycle hardening. No extra model attempts were made.

The subsequent boundary follow-up clarified the review policy. Its earlier executed text remains
preserved as `executed-review-policy.json`; the original protocol still binds that exact string.
The four new attempts and their limits are recorded [separately](../2026-10-26-task-quality-boundaries/README.md).

## Cleanup and reproduction

Both `cleanup.json` records show private server stopped, all owned roots removed and zero dependency
copies. Each attempt recorded successful session deletion and sandbox removal. Only compact public
inputs/responses/usage/trajectories remain (about 244 KiB on disk for the two raw directories).

From a clean checkout, after the regular build, run the bounded helper with a NEW result directory:

```bash
node --import tsx ai/flow-eval/scripts/task-quality-live.ts ai/flow-eval/results/task-quality-repeat
```

It requires the previously authorized configured AI Proxy and Flash, starts its own private server,
runs six attempts sequentially, and cleans after each. It never falls back to another model.
The `origin/main` revision is recorded explicitly; use the recorded baseline revision to replay
these exact inputs rather than treating a future `main` as the same baseline. Historical raw bytes
remain reproducible test inputs regardless of future model variability.
