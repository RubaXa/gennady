# Gap report — eval-history reconciliation

Source of truth for numbers: `ai/flow-eval/docs/journal/RESULTS.md`, `EXPERIMENTS-LOG.md` (read in
full), `PROGRESS-REPORT.md`, plus direct inspection of `~/.gennady/eval/mig-sandboxes/*/.sdd-eval-trajectory.MIG-*.json`
(15 trajectory files, tool-event counts extracted and cross-checked against the journal's H8-prove/H9/H10/H11/keepers
tables — they match exactly, see below) and `git -C <worktree> log --follow` over the key files named in the task.

## 1. Verdict corrections made

Two entries had a `verdict` that didn't match what the journal actually says happened:

- **seq 32 (H8)**: `REVERTED` → **`NEUTRAL`**. H8 only proposed two mutation hypotheses (H8a/H8b); the
  entry's own `files` field says "diagnosis only, not yet mutated" — nothing was applied, so nothing
  was reverted. What got invalidated was the _diagnosis itself_, one entry later, by H8-diag. That
  retraction belongs to seq 32's conclusion, not to a code change.
- **seq 33 (H8-diag)**: `REVERTED` → **`KEPT`**. This entry's actual content is a harness fix
  (`--stuck-after 3`, `--observe-every-ms 45000`, `--max-observations 12`, budget 300s, new npm
  scripts) that landed and is still present in the working tree today (`ai/flow-eval/cli.ts`,
  `ai/flow-eval/scripts/migration-eval.sh`, `package.json` all show as modified in `git status`). The old `REVERTED`
  verdict conflated "H8's diagnosis was retracted" (true, but that's seq 32's story) with "this entry's
  own change was reverted" (false — the harness fix was kept).

No other verdict looked inconsistent with its journal citation on close reading (seq 30's
`BROKE_THEN_FIXED` for a partially-wrong-diagnosis entry is a defensible edge case — the ladder
_mechanism_ was kept even though the _diagnosis_ in that entry was wrong, corrected by H7 next — left
as-is but flagged in the entry's own `impact.why`).

## 2. Deltas that were genuinely unmeasurable ("не измерялось")

27 of the 45 entries (41 original + 4 restored) carry at least one `не измерялось` / `n/a` delta because
the journal simply does not record that number at that granularity. Notable cases, grouped by why:

- **Pure infra/doc/harness commits with no agent run to pair against** (13 entries, `decision:
"not-a-run"`): seq 1 (birth), 12 (D1 closed), 17 (migration-eval.sh), 22 (fresh-dist fix), 23–25
  (doc reorganizations), 26 (GAP-E mechanical batch), 29 (wall-clock budget), 41 (Critic-Rounds hard
  error), plus restored gaps 42–44. These are real, kept changes — just not something with a before/after
  agent-run number attached in the source documents.
- **Directive/tool mutations landed without a dedicated per-run measurement at the time** (seq 2, 13,
  14, 16, 18¹, 19, 20, 21¹): the journal records _that_ these landed and _why_, but not token/time/tool
  numbers for that specific commit. Where a _later_ run happened to validate the same mechanism
  (¹ seq 18 and seq 21 by H-node; seq 2 partially by H10), I attached that later run's numbers instead of
  inventing one for the original commit.
- **Diagnostic/tool-only probes with no agent involved** (seq 31, part of seq 20): these report finding
  counts, not token/time/trajectory, because no LLM agent ran — a deterministic probe script did.
- **Table cells the journal itself omits**: several H-series tables report tools+time but not tokens (H8,
  H8-prove, H9, H10, H11), or tools+tokens but not wall-clock time (most of the recover/B4 experiments).
  I did not backfill these from a different run's numbers — each `не измерялось` marks a genuine gap in
  what was recorded, not a retrieval failure on my part.

## 3. Missing changes found — and what was restored

Cross-checked `git log --follow` over the task's named key files (`prompts.ts`, `provision.ts`,
`runner.ts`, `cli.ts`, `quality-gate.ts`, `trajectory.ts`, `migration-v1-v2.directive.xml`,
`execute.directive.xml`, `check.ts`, `readiness.ts`, `migration-plan.ts`, `migration-move.ts`,
`upgrade-verification-tables.py`, `scenarios*.json`) against the 41 entries' `commit` fields, and the
EXPERIMENTS-LOG.md section headers against the 41 entries' content. Four real gaps found and restored as
new entries (seq 42–45, `"restored-gap": true`):

- **seq 42 — `5a8b5929` "bind eval sessions to sandbox cwd"** (2026-09-02). Lands the same day as the
  birth commit and the single-Write lesson, fixes a real sandbox-isolation gap in the brand-new harness.
  Not cited anywhere in the 41 entries.
- **seq 43 — `94164668` "snapshot pre-existing untracked eval scaffolding"** (2026-09-06). This is the
  literal birth commit of `flow-verification-ledger.md`, `roundtrip-wall3-assessment.md`,
  `upgrade-verification-tables.py`, `session-metrics.py`, `session-telemetry.py`, `roundtrip-eval.sh` and
  `roundtrip-grade.sh` — i.e. every piece of tooling behind the numbers in seq 21, seq 27 and seq 35. Three
  later entries depend on files this commit introduces, but none of them cite it.
- **seq 44 — `b7dc3749` "auto-teardown sandboxes + persist artifacts outside them"** (2026-09-05).
  Operational hygiene: throwaway ~500MB sandboxes now clean themselves up and durable artifacts survive
  outside them. Plausibly the fix behind B4's own note ("первый ENOSPC на V9/V10... исправлено") — but
  that note doesn't cite a hash, and this commit isn't cited anywhere either.
- **seq 45 — H2, "write-first token reduction on authoring"** (2026-09-04, journal-only, no
  distinguishable merge commit). A full numbered experiment in EXPERIMENTS-LOG.md (own table, N=2/arm,
  two-worktree isolation) that H3 explicitly calls back to ("это подтверждает и уточняет H2") — but H2
  itself has no entry in the 41. Its finding (tokens and authoring quality are orthogonal; −41% input
  tokens did NOT raise the clean-authoring rate) is a real negative result worth keeping visible.

**Verified via trajectory files, not just the journal:** the H8-prove / H9 / H10 / H11 / combined-keepers
tool counts (49/67/66 → 38/60/66 → 49 → 45 → 39/38/55 for portal/scope/module) were independently
recomputed by counting `type:"tool"` events in the raw
`~/.gennady/eval/mig-sandboxes/sdd-flow-eval-*/.sdd-eval-trajectory.MIG-*.json` files (grouped by mtime
cluster) and match the journal's numbers exactly, including the H6 baseline (`mig-cloud-ios-infra` fixture,
43 tools, matches H0's "43 вызова" verbatim). This is real corroboration, not just trusting the prose.

**Deliberately excluded** (checked, judged out of scope — this is a big monorepo and most commits in the
full `git log` on these files between 2026-09-02 and 2026-09-10 belong to _other_ concurrent workstreams,
not the flow-eval/SDD-v2-methodology arc this history tracks):

- `69d07d50` ("retreat failed tickets to decomposition") — general SDD v2 scaffold hardening, not
  eval-methodology specific.
- `aa21a55f` (T-B6-26, "AX_PROGRESSIVE_DISCLOSURE reaches every operator-facing owner") — touches
  `execute.directive.xml`, but it's part of an unrelated directive-governance track (T-B6 series), adding
  one axiom include for consistency, not a flow-simplification lesson from this eval arc.
- `11291af5` ("completion gate wiring + spec-receipt metrics + ledger E1-E3") — a 2-file, ~20-line
  doc/script tweak, too small to warrant its own entry; folded conceptually into the seq 43 gap
  (round-trip tooling birth) since it touches the same ledger doc.
- The ~90 other commits in the full file-level `git log` on these paths between 2026-09-02 and 09-08
  (B2-_, SO-_, REL-_, LOCK-_, V-0x, T-B6-\* series) all belong to parallel PRs (`lead/release-package`,
  `lead/verify-core`, `lead/sync-no-loss`, `lead/kit-lint`, `lead/surface-locks`, `lead/specs-match-code`)
  merged into this branch — they are real work, just not part of the eval-methodology narrative this
  history file is reconstructing.

## 4. Overall coverage assessment

The 41+4 entries cover the arc well end-to-end: birth (seq 1) → deterministic-defect removal (seq 3) →
quality-gate discipline (seq 4) → the eval classes being built out one at a time (seq 5–10) → the
recover-process degradation-and-fix story (seq 9–12, now with H2 restored as its direct precursor) → the
migration eval class from its first commit through nine hypothesis cycles (seq 13–41) → the cloud-ios
round-trip's honest partial result (seq 27, 35–36). The self-correction chain is the strongest part of the
coverage: H6→H6-ladder→H7→H8→H8-diag→H8-prove→H9→H10→H11→keepers is fully represented with each
entry's own numbers checked against two independent sources (journal prose + raw trajectory JSON) and
against each other.

The blind spots were narrow and mechanical, not conceptual: three infra commits that never got their own
entry despite being prerequisites other entries depend on (sandbox cwd binding, round-trip tooling birth,
sandbox teardown), and one full named experiment (H2) that existed only as a citation target in a later
entry (H3) rather than as its own row. All four are now restored. No H-series hypothesis section in
EXPERIMENTS-LOG.md is unrepresented after this pass.

## Summary counts

- 45 total entries (41 original + 4 restored gaps).
- 24 `accepted`, 13 `not-a-run`, 8 `neutral` (0 `rejected` — no entry in this arc was a clean, isolated
  revert-only outcome; the closest, seq 20's F9, is `BROKE_THEN_FIXED` and its final state was kept).
- 5 entries have all three deltas (time/tokens/trajectory) concretely measured; 27 carry at least one
  `не измерялось`/`n/a` — mostly `not-a-run` infra entries (13 of the 27) plus cells the journal's own
  tables simply don't report (the rest).
- 2 verdict corrections (seq 32, seq 33 — both REVERTED → NEUTRAL/KEPT respectively).
- 4 missing changes restored as new entries (seq 42–45); 3 more commits explicitly considered and excluded
  as out-of-scope (other concurrent workstreams), with reasons given above.
