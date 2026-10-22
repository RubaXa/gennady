# V2 recovery and agent-trajectory regression plan

Date: 2026-10-22. Baseline: `396c8abdd70592b70c6ad8d8c2a0aaf15510d70b`.
Status: implemented and locally verified; PR #124 awaits independent external review, not merged.

## Final handoff (clean corrective source `b29ecd3b`)

- Full normal pre-commit: 4740 tests / 4732 passed / zero failed / eight skipped; coverage and all
  mandatory audits PASS. Fresh build PASS. Historical migration archives and SDD baseline unchanged.
- Both corrective live Flash runs PASS mechanically, by complete trajectory and by the judge:
  [bounded verdicts](../results/2026-10-22-v2-bounded-deviation-verdict-2/ANALYSIS.md) (9 tools),
  [brownfield route](../results/2026-10-22-v2-brownfield-routing-2/ANALYSIS.md) (9 tools).
  They persist explicit CHECKPOINTS quality and exact public judge-input diffs; CLI mutations are
  no longer invisible to the judge. Exact input bytes and actual SDK model/token metadata retained.
- [Authoring](../results/2026-10-22-v2-native-scope-authoring-3/ANALYSIS.md) R1-A/trajectory/judge
  PASS on clean `89315339`; real infrastructure ownership restored, no exclusion or fake ticket.
  This run did not include an independent semantic reviewer. No perfect-process or full execution
  completion claim follows from these bounded scenarios.
- These three final passing records used 162393 non-cache tokens including their judges; the two
  corrective runs account for 36527. Cache-read is separate; money UNKNOWN. All five latest runs,
  including the preserved diagnostic judge FAIL, used 211120 non-cache tokens. Earlier RED runs
  are additional, not hidden or included in a false cost-optimization comparison.
- Open [PR #124](https://github.com/RubaXa/gennady/pull/124) targets main. Independent worker
  self-review found no new blockers; it is not a substitute for external review. No self-merge,
  npm publication, baseline refreeze or migration artifact rewriting is authorized.

## Latest verified state (source `89315339`, supersedes historical stop points below)

- Normal full pre-commit: 4732 tests / 4724 passed / zero failed / eight skipped; coverage,
  type-check, lint, formatting and mandatory audits passed. No bypass or baseline change.
- Three bounded live Flash scenarios completed on clean source: authoring R1-A + trajectory
  PASS (44 tools), bounded deviation-verdict checkpoint + trajectory PASS (17 tools), brownfield
  routing checkpoint + trajectory PASS (11 tools). Exact input/config/model identities, raw
  summaries, traces, spec snapshots and analyses are retained in the dated results directories.
- Authoring uses a genuinely recovered infrastructure spec for runner ownership, not `@spec none`.
  R1-A is pre-approval readiness, not whole-project integrity or independent semantic review.
  This autonomous run did not dispatch a reviewer; do not claim a fresh reviewer CLEAN.
- Deviation-verdict judge FAIL is preserved: SDK diff omitted actual CLI writes. Follow-up repair
  reads safe bounded Git evidence from the proven fixture baseline, including worker commits;
  custom-directory SDK behavior remains intact. Re-run this small scenario after a clean commit.
- Worker + judge used 174593 non-cache tokens across these three runs (130856 + 43737), with
  2814976 cache-read tokens separately. Monetary cost is unknown; provider zero is not a bill.
- PR [#124](https://github.com/RubaXa/gennady/pull/124) targets main, remains draft pending final
  corrective live proof and external review. No self-merge; no npm publication.

## Active continuation (after clean source `0576eb9c`)

- Full normal pre-commit PASSED: 4715 tests / 4707 pass / 0 fail / 8 skipped, coverage and all
  mandatory audits. No hook bypass, baseline update, archive rewrite or npm publication.
- Clean-source Flash run completed with 74 actual tool actions and both authored specs. Overall
  mechanical FAIL is preserved: the fixture had two unowned runner scripts, and its project-wide
  checkpoint required tickets before Approval #1. Judge pass is not mechanical pass; fresh reviewer
  CLEAN was independently read from public SDK text.
- Recover truthful Node/c8 ownership in an infrastructure spec; no fake product ownership,
  approval or ticket. Explicit R1-A validates exact scenario-owned authoring targets read-only,
  with missing/skeleton/duplicate/unsafe-path controls and parent/module hierarchy checks.
  Ordinary project R1, execution R-COMPLETE and migration bars remain unchanged.
- Export only public judge text, not reasoning/tool parts; parse only the first verdict line.
  Journal labels judge/mechanical results separately. Monetary cost remains unknown, not zero.
- Extend deviation-verdict to actual module and canonical tasks-index owners with exact-entry,
  section identity and byte-preservation tests, plus a separate tiny real Flash eval.
- Focused tests + independent worker review → normal source commit → NEW bounded Flash runs →
  preserve red/green trajectories and usage → normal evidence commit → PR to main for external
  review. No self-merge or publishing. No external blocker currently prevents this work.

## Current evidence / stop point

- REC-1: restored source modules; Node 22 type-check and 13 focused checks passed. The delivery
  regression is red with the old ignore rule and green with the corrected source exception.
- REC-2/3: 44 targeted tests and 48 dependent release/evidence tests passed. Historical proof is
  independently reconstructed from the exact merged cutover; the immutable archive digest remains
  `9245986466ee0eb2ad87e163d9671e6e88b8bf1e2ffb96010b465b14bc94fbc6`.
- REC-4: topology owns the shipped `.mjs` suite rather than excluding it; its previously hidden
  shebang SyntaxError was repaired. Topology/recovery/signal suites: 21 passed on Node 22.
- REC-5: exact new-scope spec-path orientation works before portal registration, for product and
  custom-output library scopes. The old name-only command is a negative control, not a code rollback.
- REC-6: ordinary build tasks/README/empty tasks are not migration evidence. Genuine legacy ticket
  signals remain migration-only; 127/127 original ticket paths are covered. Internal documentation
  aliases do not expand the corpus; external, broken and skipped-target aliases remain rejected.
- REC-7: the dedicated compiled update worker is shipped and executes through an installed CLI;
  local build/pack/install/import checks passed 14/14 without registry traffic. Module/index
  deviation-verdict support still needs a separate bounded extension and live scenario; no generic
  replacement of verdict strings is authorized by the current ticket-local API.
- REC-8: independent review found interrupted traces and summary-before-evidence publication gaps;
  both have regression coverage. Full flow-eval suites passed 339/339; a later final run must also
  include the owned judge-cancellation fix. Harness PASS is not a real agent-path PASS.
- First live evaluation failed honestly: 32 observed actions, no writes or reviewer, six structural
  errors. Exact scope orientation worked; module orientation still used an incompatible portal name.
  Failure is retained in [the run analysis](../results/2026-10-22-v2-native-scope-authoring/ANALYSIS.md).
  This exploratory dirty-source run is diagnostic, not a reproducible clean-commit A/B baseline.
- Module orientation now uses its own manifest path; help/version cannot satisfy verification
  assertions. Failure diagnostics and permanent spec snapshots are retained. Observer stops become
  worker errors; judge errors also finalize their session evidence before cleanup. Historical FO6
  mapping is checked against all 1207 exact-cutover files, never today's mutable headers.
- The operator explicitly authorized source/directive and synthetic task payloads through
  `llm-proxy/deepseek-v4-flash`; secrets and user data remain excluded.
- The local eval server was started on `127.0.0.1:4107`; server availability is not model-run evidence.
- Operator-authorized inventory refresh: only expected counts and inventory digest change. A clean
  main reference already has 70 unrelated-version entries (policy said 69); four new eval/document
  paths legitimately add versioned Git/protocol, migration-discussion or inert failed-spec markers. Independent review
  confirmed no changed/removed classifications or active V1 violations. Markers, constraints,
  forbidden/protected paths, classifiers, frozen artifacts and SDD-baseline stay unchanged.
- Clean-commit live retry, final full-gate/PR and external reviewer handoff remain unfinished. Nothing has
  been merged; no before/after model comparison is claimed yet.

### Commit-gate repairs (not a bypass)

The first normal commit was rejected by `node:unit`; type-check/lint/format had passed. A raw
`npm test` reproduced 15 failures in the local partition (1259 passed, 9 skipped). Each cause is
handled explicitly, without disabling the hook or rewriting frozen migration data:

- Twelve V1-grandfathering cases depended on an empty `tasks/` directory. Their fixtures now
  contain genuine legacy tickets; production checks and expected assertions stay unchanged.
  The combined owning/orient/check/task suites passed 187/187.
- The deployed-surface lists predated the nine already-tracked `session-context-recover` files.
  Independent `scanSkills`/`npm pack --dry-run` comparison found exactly nine additions and zero
  removals in each list. Only those additions were applied, not a blanket golden regeneration.
  A real developer-home path in the shipped chat example was replaced with a relative report
  link. Deployed-surface checks passed 4/4; their leak detector is unchanged.
- Three subprocess-heavy test files exceed the runner's global 30-second whole-file deadline;
  the real build/pack/install/import suite alone takes about three minutes. They need explicit,
  bounded file budgets, remain mandatory, and must execute exactly once in the full corpus.
  The ordinary default deadline and the single observed c8 partition must stay unchanged.
  Scoped topology contracts passed 18/18; all three real heavy files passed 80/80 in 83.2 seconds
  through the dispatcher (historical/Swift group: 46.2 seconds; offline package group: 37.0 seconds).
  Their exact budgets are 120 seconds for historical/Swift and 360 seconds for package acceptance;
  the ordinary whole-file deadline remains 30 seconds, with no corpus or D-60 changes.

The complete corpus and the normal commit hook must be rerun after these repairs. Focused passes
are not a claim that the full gate or the live authoring trajectory is green.

The next direct complete run reached all 391 files: 4708 tests, 4695 passed, five failed and eight
skipped. The remaining failures were three shipped-skill contracts (assurance wording, provider
session-log paths versus skill-loader paths, and an obsolete global skill-count cap) plus two
GitLab transport assertions predating the move from URL parameters to a form request body.
The latter tests now assert the exact endpoint, POST/content type, all position/body fields and
lossless long Unicode body transport; production transport is unchanged (4/4 focused checks).
These are tracked gate repairs, not exclusions of failing tests or changes to the SDD baseline.
The skill contracts now distinguish the exact labelled read-only provider JSONL location from
home-installed skill invocations, keep the eight canonical SDD names and all retired-trigger
owners guarded, and allow unrelated new skills. Mutation checks retain forbidden-call/alias
detection. These contracts, the recovery script and transport checks passed 21/21; type-check,
format and the unchanged V1 inventory policy protections passed before the full hook retry.

That retry passed `node:unit` (4711 executed / 4703 passed / zero failed / eight skipped) and
`node:coverage`; its sole remaining failure was `node:integration` (exit 1). The generic Node
`full` selector had added the combined experimental inbox/real-network script to pre-commit,
contrary to D-60's historical offline scope (recorded in `84aa9f201` and implemented before
the universal cutover in `c640557c4`). That script attempted OpenCode sessions for
`llm-proxy/deepseek-v4-pro` and reported `fetch failed`; it is not an authorized recovery eval.
Do not rerun it to repair SDD or change models. The project-owned `gennady.yaml` full overlay
retains code, unit and coverage. Generic zero-config consumers and an explicitly requested
integration phase retain their integration step. Mandatory test corpus/D-60 membership and
all other hook audits remain unchanged.

Independent inspection also found a durable-result race: eight parallel same-scenario writes
selected one directory (runtime negative control: eight requested, one unique directory).
Reserve each permanent directory with an atomic non-recursive `mkdir`; only `EEXIST` selects
the next suffix. Preserve incomplete reservations, propagate other filesystem errors, and
regress all eight summary/judge/trajectory/spec pairs, not just the directory count.
The same independent runtime probe is now green (eight requested, eight unique directories),
and the regression verifies all eight complete artifact sets plus incomplete/error cases.
Compact failed-case TAP diagnostics are now redacted before byte truncation and emitted to
stderr (maximum 8 KiB) before transient reporter cleanup, so a bounded Verify stdout prefix
cannot hide the only failing test context. Verdicts, normalized stats and default deadlines
are unchanged. The final focused policy/archive/interruption/planner/config group passed
175/175, with type-check, format, topology, V1/main-carry audits and directive freshness green.
The next full hook and clean-source Flash live retry are still required before handoff.

## Goal and boundaries

Restore ordinary V2 development without re-running a completed V1 migration. Each behavioural
repair needs a causal regression test and, where an agent consumes the affected workflow, a live
flow-eval scenario with independently checked artifacts and trajectory. Harness tests and recorded
historical traces are not substitutes for a new model run. No npm publication is authorized.

Existing `docs/flow-eval-results`, `docs/flow-eval-restructure` and
`docs/flow-eval-guard-verification` commits are patch-equivalent to changes already in `main`
(`git cherry` reports `-`). Preserve and extend `ai/flow-eval` and `ai/flow-sim`; do not merge an
old tree wholesale or reintroduce retired runtime. Feature PRs target `main`, not the retired RC
integration branch. Independent review precedes merge.

## Work and acceptance

| Slice | Repair                                                                                | Deterministic proof                                                                                                                            | Agent-eval proof                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REC-1 | Restore missing review coordinator/validator and stop ignoring their source directory | Clean-checkout source inventory, focused runtime tests, type-check                                                                             | Runtime/tool failures remain explicit; an agent cannot claim a green gate after a failed command                                                                  |
| REC-2 | Separate historical migration coverage from current V2 scopes                         | Genuine historical omissions/corruption fail; adding a native V2 scope does not require a migration unit                                       | New scope reaches its actual authoring boundary without inventing migration files or editing archived proofs                                                      |
| REC-3 | Separate immutable carry evidence from legitimate current development                 | Historical blobs, mapping and frozen source identity remain protected; unrelated current edits do not require refreezing history               | Agent adds a scope without changing migration evidence or weakening gates                                                                                         |
| REC-4 | Make test ownership exhaustive and signal fixtures loader-independent                 | Shipped `.mjs` tests have an executable owned layer; real SIGINT/SIGTERM produce 130/143 on Node 22                                            | Interrupted eval preserves evidence before cleanup; an interrupted run is never PASS                                                                              |
| REC-5 | Repair new-scope orientation/portal/approval handoff                                  | `sdd-new` output can feed orientation before portal registration; approval ownership remains explicit                                          | Fresh native scope: create → orient → author/check/review → pending requested approval, no impossible tool calls or fake acceptance                               |
| REC-6 | Remove unrelated `tasks/` and safe documentation-symlink false positives              | Genuine V1 still routes only to migration; unrelated task folders do not; traversal/write protections remain                                   | Brownfield project with Grunt tasks and documentation symlinks follows the V2 route, not migration                                                                |
| REC-7 | Repair installed update worker; clarify supported deviation-verdict surfaces          | Real pack/install/bin invocation; explicit section/identity-safe verdict edits                                                                 | Agent follows actionable supported commands; no blind token replacement or silent success                                                                         |
| REC-8 | Make trajectory evidence persistent and verdict-bearing                               | Required trace cannot be silently skipped; partial trace cannot prove absence/order; persisted trace survives teardown; bad paths fail grading | Fresh before/after runs bind source/config/model/scenario, report terminal checks separately from observed actions, preserve failures and compare trajectory/cost |

REC-1..4 restore the baseline before ordinary feature work. REC-5..7 repair consumer workflows.
REC-8 is a prerequisite for claiming their agent trajectories verified, not a promise to build a
second runner. Use the existing observer, evidence reader, archive and matchers.

## Trajectory contract

- A tool event identifies the actual session/message/call, result status and safe input summary.
- Capture root and child sessions; deduplicate repeated observations by stable identity. State
  explicit collection limits and coverage. Missing/partial evidence cannot prove a forbidden action
  absent. Do not expose credentials in committed traces.
- Final checkpoints prove end state only. Running a list of commands after the agent stops does
  **not** prove that the agent visited those checkpoints in that order during execution.
- Preserve normalized trajectory beside the durable summary, including red/timeout/cancel outcomes,
  before owned sandbox cleanup. A required capture/grading failure cannot become `trajectory: skipped`
  followed by PASS. Keep budget-exhausted distinct from product failure and success.
- Scenario assertions cover outcome, required/forbidden actions and ordering where it is actually
  observed. Never overfit a literal tool sequence or use model self-report as execution proof.

## Live-run protocol

Use [EVAL-SPEC.md](./EVAL-SPEC.md), [RUNBOOK.md](./RUNBOOK.md) and
[11-ANALYSIS-CHECKLIST.md](./11-ANALYSIS-CHECKLIST.md) as the existing owners.
Build fresh directives/dist. Use only `llm-proxy/deepseek-v4-flash` for worker and judge, concurrency
one for authoring, bounded wall time and isolated owned sandboxes. Missing credentials or unavailable
model is an explicit environment blocker, never permission to switch models or invent PASS.

For each scenario retain: source SHA plus dirty/config/scenario identities, actual model, budget,
terminal outcome, mechanical verdict, trajectory verdict/coverage, duration, tools, tokens and
artifact references. Keep judge diagnostic distinct from mechanical proof. Record both successful
and failed runs; compare one changed hypothesis at a time. Historical baseline traces remain inert
evidence, not a claim about this revision.

## Handoff

Each PR includes changed goals/files, exact commands and outcomes, remaining blockers and links to
fresh eval evidence. Reviewer checks code, tests, trajectory completeness and semantic outcome before
merge. Existing approvals and archival/baseline protections are not silently rewritten to get green.
