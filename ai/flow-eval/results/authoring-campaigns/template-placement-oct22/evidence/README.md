# Evidence boundaries

This directory records an experiment, not an approved production prompt change.

- The sibling dated result directories contain the exact primary `summary.json`, `trajectory.json`,
  `reflection.json`, scenario, saved specs and original public judge response. Red/inconclusive
  outcomes are retained. Missing original judge text is not reconstructed.
- `variants/*.patch` reproduces the three first-generation experimental source mutations from
  `3fb6c935df5a7e78724ca992ecbe5ae5485c3350`. The parent PR retains baseline production templates.
  All three patches pass `git apply --check` on those baseline bytes. Source commits are recorded
  by each primary summary; the owner-rich preflight amendment is explicit, not silently substituted.
- `*-comparison.json` is the original comparator output, with original primary semantics. A later
  supplemental review cannot turn an original inconclusive result into a primary pass.
- `observed-totals.json` separates worker, primary judge and actual-worker reflection counters.
  The SDK's zero `cost` is not a price. Cache counters are reported separately, never called free.
- `public-tools/` contains a read-only SDK projection, bound to original summary/trajectory hashes,
  session/call/model/timestamp identities. Only selected target Write inputs are reduced to content
  digests, byte counts and requirement IDs. Only exact direct or cd-only target `sdd-check` output
  is eligible for bounded, sanitized diagnostic excerpts. Arbitrary Bash output and reasoning text
  are never collected. This is not a complete transcript or proof of a causal treatment effect.
- `collection-failures/` retains the earlier collection attempts, including sandbox `EPERM` rows.
  They did not cause model calls or change primaries. The successful independent collection is in
  `public-tools/`; a failed read is not mislabeled as a product or AI Proxy failure.
- The supplemental semantic protocol supplies complete saved artifacts and independently verified
  source-owned parent/brief/contract facts to blinded, fresh Flash reviewers. Its changed context
  and explicit evidence-only prompt make it a repair diagnostic, not a one-variable prompt A/B.
  All 24 inputs are reviewed, not a selected winning subset. Its results remain a separate endpoint.

Historical collector scripts may mention original temporary paths and SDK session directories as
provenance. Offline replay must not execute those collectors, contact the server, or expect those
paths to exist: it uses checked-in bytes and creates/cleans its own temporary artifact fixture.
Reflection is public factual self-report, not private reasoning and not grading authority.
Archived collector source is stored as `.mjs.txt`, including the prior preparation: its bytes and
script digest are preserved, but it is not active executable project code.
