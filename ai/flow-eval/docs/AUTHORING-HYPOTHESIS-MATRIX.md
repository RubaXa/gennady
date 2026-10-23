# Authoring: source map and one-variable hypotheses

Status: offline source inspection at main `056870393ea2138a9470b7ef6188a01dc7885f81`.
Every optimization hypothesis below is **NOT TESTED**. This document changes neither production
instructions nor the recorded baseline. Follow the [analysis checklist](./11-ANALYSIS-CHECKLIST.md):
check fixture/oracle/collection defects before attributing an outcome to agent behavior.

The new observational baseline contains all ten [authoring cases](./AUTHORING-EXPERIMENTS.md), three
attempts each, captured under that source's frozen `calibrated` default. It is not a qualified A/B
control for the subsequently changed `calibrated-v2` oracle. The earlier30 module attempts are
rejected composite wording/placement arms (including adaptive acronym guidance), preserved in
[their report](../results/authoring-campaigns/template-placement-oct22/REPORT.md). They are neither
the new baseline nor tests of these isolated hypotheses. Self-report is a separate factual interview,
not a causal explanation, tool receipt or semantic verdict.

## Static ownership and duplication map

Here, “overlap” means the same obligation is expressed in multiple surfaces. It does not mean every
copy is useless: a short reminder may intentionally activate a rule at its point of use.

| Cases / owner                | Current instruction surfaces                                                                                                                                                                                                                                                                                                     | Concrete overlap or lookup boundary                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| portal / root                | [root owner](../../kit/templates/sdd-v2/root.directive.hbs), `PORTAL_SKELETON` and `PORTAL_SECTIONS` in [template registry](../../../shared/sdd/templates.ts)                                                                                                                                                                    | Vision paragraph/sub-bullets, release exclusions in Decision Log, graph/table correspondence appear in owner steps, skeleton and manifest. Owner also contains the full interactive project flow; the isolated case is only portal authoring.                                                                                                                                                                                                         |
| product, library / scope     | [scope owner](../../kit/templates/sdd-v2/scope.directive.hbs) `STEP_2_FILL`; `PRODUCT_*` / `LIBRARY_*` registry entries                                                                                                                                                                                                          | Owner repeats whole-document/comment-removal/self-check discipline; skeleton and `sections[].fill` repeat requirements, diagrams, decisions and handoff content. Product Runtime & Deferred Scope points at `AX_RUNTIME_BACKING_EXPLICIT`; its [axiom body](../../kit/axiom/spec/ax-runtime-backing-explicit.xml) is not a partial included by this owner. This is a concrete lookup boundary, not proof that every consumer lacks inherited context. |
| infrastructure               | [infra owner](../../kit/templates/sdd-v2/infra.directive.hbs), `INFRASTRUCTURE_*` registry entries, [format wrapper](../../kit/templates/sdd-v2/formats/infrastructure-spec-structure.hbs) and [contract](../../kit/contract/spec/infrastructure-spec-structure.xml)                                                             | Tool-stack integration fields, developer workflow, effective rules and verification tables have both local instructions and a longer format contract. Existing steps also own real research/locked-tool interaction; do not remove those contracts to optimize this isolated unit.                                                                                                                                                                    |
| interface                    | [interface owner](../../kit/templates/sdd-v2/interface.directive.hbs) `STEP_6_FINAL_SPEC`, `INTERFACE_*` registry entries, [format wrapper](../../kit/templates/sdd-v2/formats/interface-spec-structure.hbs) and [contract](../../kit/contract/spec/interface-spec-structure.xml)                                                | Final-spec step loads the complete format after skeleton creation; schema/versioning/compatibility obligations also occur in local sections and earlier owner steps. Interactive decisions and integrity checks remain distinct from content layout.                                                                                                                                                                                                  |
| flat/nested module           | [module owner](../../kit/templates/sdd-v2/module.directive.hbs) `STEP_2_FILL`, `MODULE_*` registry entries, three lazily named entity/DbC formats                                                                                                                                                                                | Owner, skeleton comment and manifest all explain module-owned requirements versus canonical parent delegation. Fold/summary policy appears in manifest and local sections. Entity/DbC format reads are explicitly deferred to owning sections, not an unconditional preload. Nested parent links require depth-aware resolution.                                                                                                                      |
| module/scope/project indexes | [scaffold owner](../../kit/templates/sdd-v2/scaffold.directive.hbs) `STEP_2_MATERIALIZE`, three `*_INDEX_*` registry entries, [module](../../kit/contract/scaffold/module-tasks-index.xml), [scope](../../kit/contract/scaffold/scope-tasks-index.xml), [project](../../kit/contract/scaffold/project-tasks-index.xml) contracts | These contracts embed the canonical skeleton through `sdd-skeleton-*-index`; a generated format plus the new on-disk skeleton can expose the same table/DAG layout twice. This is generated reuse, not two independent schema owners. Project conventions are already defined once and inherited; do not duplicate them into child indexes.                                                                                                           |

Cross-cutting surfaces:

- [Requirement grammar](../../kit/contract/spec/requirement-entry-format.xml) and registry
  `REQUIREMENTS_LIST_SKELETON` overlap on IDs, trigger/modality/rationale and negative behavior;
  the complete contract has additional rules. A short example is not an equivalent replacement.
- [Artifact self-check axiom](../../kit/axiom/process/ax-artifact-style-self-check.xml) is activated
  by explicit owner-step references. [Authoring conventions](../../kit/AUTHORING.md) require that
  activation; shortening wording is different from removing the activation or its language rules.
- [Checker fold requirements](../../../shared/sdd/check.ts) derive from registry `fold:true`,
  while local skeletons show summary/details layout and cite rule/diagnostic handles. Correct
  source sharing does not guarantee a model has the relevant explanation in its loaded context.
- [Creation command](../../../cli/cmd/sdd-new/sdd-new.cmd.ts) already creates the file and returns
  a section manifest via [report builders](../../../cli/cmd/sdd-new/sdd-new.types.ts). A subsequent
  target read and optional pathless `--manifest` request are separate transports, not independent
  authoring facts. [Orientation](../../../cli/cmd/orient/orient.cmd.ts) and draft checking have their
  own semantics; fewer calls must not silently omit either fact.

## Hypothesis matrix

Each row proposes one independently switchable variable, not permission to implement a combined
rewrite. Expected metrics are predictions. “Deterministic check” is necessary, not sufficient for
semantic quality; each candidate still needs blinded artifact review and repeated live comparison.

| ID / axis          | One variable and exact candidate surface                                                                                                                                                                                                                   | Predicted measurement                                                                                                                            | Quality risk                                                                                                          | Deterministic check before live                                                                                                                                                                                                      | Status     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| I1 / instructions  | Replace only the product skeleton's opaque runtime-backing handle with a bounded local explanation of the existing axiom; keep owner/manifest/validator unchanged. Source: `PRODUCT_SKELETON` in registry, wording from `ax-runtime-backing-explicit.xml`. | Fewer implementation-archaeology grep/Bash calls and rule lookups; measure total calls and actual loaded context, including added local bytes.   | Incomplete restatement or invented runtime guarantees; product-only wording may not transfer to library.              | Same backing vocabulary, deferred/trust-boundary facts, anchors and whole-write behavior; current draft-validator and hostile/absent-fact controls unchanged.                                                                        | NOT TESTED |
| I2 / instructions  | Change only fold guidance in `DECISION_LOG_FILL` into a self-contained summary/details recipe using existing `fold:true`; no changes to required sections or checker.                                                                                      | Fewer fold-rule/code lookups or repeated checks, without increased total prompt/calls.                                                           | Summary/detail misplacement or loss of decision history; a wording shortcut may hide real checker findings.           | Folded/unfolded/empty-summary controls retain exact diagnostic behavior; preserve decisions and approval negatives.                                                                                                                  | NOT TESTED |
| A1 / axioms        | Shorten only `ax-artifact-style-self-check.xml` prose while retaining its complete language/context checklist, same ID and all activation sites. No relocation.                                                                                            | Smaller generated-owner footprint and observed input; no tool growth.                                                                            | Less effective language/context self-check despite identical mechanical shape.                                        | Directive assembly/activation audits and fixed semantic checklist; deterministic linkage cannot prove prose quality, so language review is mandatory.                                                                                | NOT TESTED |
| T1 / templates     | Shorten only `MODULE_SECTIONS.MODULE_REQUIREMENTS.fill` to a reference to the existing owning-section guidance. Keep the full local comment, owner and canonical delegation literal unchanged.                                                             | Smaller manifest output; test whether fewer duplicate instruction tokens avoid extra lookups without more calls.                                 | Manifest-only consumers may lose a needed rule; nested ownership or local/parent IDs may regress.                     | Compare manifest metadata flags and complete skeleton bytes except no skeleton change is expected; local-ID/delegation/duplicate-ID and nested-link controls stay red/green as before.                                               | NOT TESTED |
| S1 / steps         | Move only the existing retry/content-hint paragraph before the declared ToolCall in scope owner's `STEP_3_CHECK`; keep its text, command, checker and module owner unchanged.                                                                              | Fewer unnecessary repeated checker invocations after earlier exposure to the existing rule; retain final receipt after autofix.                  | Earlier wording could suppress a required final check or distract from actual findings.                               | Same paragraph/ToolCall bytes and owner/activation bindings; clean/autofix/content-error workflow controls retain exit, findings, mutation bytes and required final receipt.                                                         | NOT TESTED |
| B1 / tool batching | Add an opt-in creation receipt containing exact newly written skeleton bytes/path/hash together with the existing manifest. Default create semantics and all content guidance stay fixed. Candidate: `sdd-new` command/report builders.                    | Replace create→separate-target-read transport with one response; total tools/messages and complete-context size are measured, not assumed lower. | Stale/partial skeleton payload or unsafe path; a “batch” that omits the actual artifact facts.                        | Exact file bytes/hash/spec identity, create-no-overwrite and read-safety parity; capture the returned-read fact before final Write. Equivalent receipt must not require an extra literal Read solely to satisfy the old path oracle. | NOT TESTED |
| B2 / tool batching | Change only transport of already selected independent reference reads into one bounded read-only multi-file receipt. Selection/content/owner workflow stay unchanged. Candidate: orientation/reference reader and existing repo-file identity guards.      | Fewer read calls/assistant messages for adjacent independent reads; record byte totals, dependencies and unknowns.                               | Hidden dependency between reads; truncation or external/symlink/hardlink exposure; a large bundle may increase input. | Same ordered selected paths, exact hashes/bytes/ranges and per-file failures as individual reads; cross-root/changed-identity/over-limit controls fail closed. No foreign context is added by default.                               | NOT TESTED |

### Reviewer additions: scoped exploration, stop rules and demonstrations

These four are post-baseline proposals, not tested outcomes or changes to the frozen run plan.
[Primary-source checks and limits](./AUTHORING-RESEARCH-NOTES.md) motivate the experiments, not
their expected effect size on Flash. `STOP1` names the stop-rule proposal without reusing a flow-version label.

| ID / axis               | One switchable variable                                                                                                                                                                                                                                                   | Predicted measurement                                                                                   | Quality risk                                                                                                            | Deterministic prerequisite                                                                                                                                                                                                                                               | Status              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| E1 / exploration        | Add only an evidence-triggered expansion rule in the owning authoring step: after the unchanged mandatory inputs, read extra context for a concrete missing fact or conflict. Do not simultaneously change path lists, numeric budgets, tools, stop rule or model effort. | Fewer non-required exploration calls without more messages/context or missing dependencies.             | Early commitment on ambiguous tasks, suppressing required portal/parent/tooling reads.                                  | Same required facts/paths in both arms; missing/contradictory-input controls must trigger further reading or a truthful blocked outcome, never an invented default. Preserve library dependency and ambiguous-requirement negatives.                                     | NOT TESTED          |
| STOP1 / verification    | Replace only open-ended recheck prose with a state-bound rule: applicable validation follows the final mutation; repeat after invalidation, not merely to increase confidence. Preserve legitimate transient environment/timeout retry policy.                            | Fewer redundant checks of the same effective input/environment state; final fresh check still observed. | Accepting stale success, missing check-induced autofix, forbidding necessary retry or hiding failure.                   | Mutation after green invalidates it; check/autofix-induced drift requires fresh proof. Environment recovery retries are retained as attempts. Failed, missing or inapplicable checks never become pass; portal/index never acquire a fictitious spec CLI.                | NOT TESTED          |
| T2 / trajectory snippet | Add only a short case-kind-specific action/observable-state snippet to the owning step. It illustrates the existing workflow, not a completed answer or a new context/stop policy.                                                                                        | Less discovery and rule lookup; measured tokens can increase because snippets add bytes.                | Overfitting one artifact kind, teaching a nonexistent command, leaking benchmark answers or bypassing approval.         | Validate every referenced operation/state against current tools and each selected kind before live calls. For portal/index use the declared host artifact oracle, not an invented spec check. Whole-write, exact-target and pending-approval negatives remain unchanged. | NOT TESTED          |
| S2 / self-bootstrap     | Add selected action/observation examples from an independently verified training pool; selection/format is the single experimental variable. Never extract private reasoning.                                                                                             | Better execution with less handcrafted guidance; no savings assumed.                                    | Copying invalid paths, fabricated approvals, leaking held-out answers or selecting only successful evaluation attempts. | Blocked until M3 provides genuine path proof and M2 independent semantic labels. Separate training/holdout task identities, retain all evaluation failures, inject no complete target answer. Does not require B1/B2 if path proof is obtained independently.            | BLOCKED; NOT TESTED |

The review's combined E1 (new path list + budget + early-stop) is deliberately not one mutation.
Numeric context caps would require a separate arm and an evidence-based escape hatch. The snippet
arm does not add that policy implicitly. Necessary context is not waste just because it costs calls.

## Early r1 snapshot (retained; full snapshot follows)

Only already durable r1 records were inspected read-only under the owned permanent result root.
All four cite main05687039; their stable scenario IDs are:

| Scenario ID suffix (`authoring-spec-trajectory-oct23-…`) | Observed result                                                           | Calls |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | ----: |
| `portal-baseline-r1`                                     | artifact PASS; judge PASS                                                 |    16 |
| `scope-product-baseline-r1`                              | worker-error; artifact incomplete                                         |    12 |
| `scope-library-baseline-r1`                              | artifact FAIL (`Declared dependencies contradict the portal`); judge FAIL |    19 |
| `scope-interface-baseline-r1`                            | artifact PASS; judge PASS                                                 |    20 |

Product-r1 includes these public calls, not an inferred account of private thought:
`call_01_NMdt0tJHnnIvesjXBrEx8979` searches rule/diagnostic names in `ai/directives/sdd-v2`;
`call_00_gz9aYTqozQhBPcTcgNPt9132` reads root-owner excerpts and searches runtime backing in
root/scope; `call_00_nykTCPcOpX3iB3ogI8Ln8336` searches runtime backing in `ai` and fold symbols in
`node_modules/gennady/dist`. These motivate I1/I2 investigation. They do not prove what caused
worker-error, justify hiding diagnostics, or establish an A/B effect. Library's dependency failure
is a quality negative to preserve, not a reason to loosen graph consistency.

Tool batching and model round trips are different axes. Baseline portal reads at positions6–8
already share one assistant `messageId`: replacing those three calls with one tool response need
not reduce model messages or HTTP requests. Inspect message/session IDs and intervals separately
from the tool histogram; a candidate with fewer calls may have unchanged or increased assistant
messages and input bytes. API savings are not promised by B1/B2.

## Completed durable snapshot: failure attribution, not regrading

All30 records are now in the [archived report](../results/authoring-campaigns/spec-trajectory-oct23/report.json).
Its unchanged counts are artifact26/30, judge21/30, joint artifact-and-judge20/30, path0/30 and
one worker-error. “Joint” here means both recorded grades, not independently established correctness
or a proven authoring path. Artifact-only and judge-only passes never become a quality PASS.
The complete capture/binding/cleanup receipts do not remove semantic or classification uncertainty.

| Case                 | Recorded artifact / judge passes | Independent bounded classification of the main negatives                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| portal               | 3/3 /2/3                         | [r2 judge](../results/authoring-campaigns/spec-trajectory-oct23/raw/10/judge.md) rejects broad Vision wording, but its own Success/Principles explicitly exclude invalid inputs. Possible grader over-strictness/high-level wording ambiguity, not an independently confirmed normative contradiction. Raw FAIL remains.                                                                                                                                                                                                                                                                                                            |
| scope-product        | 2/3 /0/3                         | r1 has no final Write and worker-error, not a completed document to semantically grade. [r2](../results/authoring-campaigns/spec-trajectory-oct23/raw/11/judge.md) positive domain overlaps separator-only rejection; [r3](../results/authoring-campaigns/spec-trajectory-oct23/raw/21/judge.md) specifies collapse only for runs of at least two separators, omitting a single space/underscore. Those normative defects are visible in the artifacts; structural PASS is insufficient.                                                                                                                                            |
| scope-library        | 1/3 /1/3                         | [r1](../results/authoring-campaigns/spec-trajectory-oct23/raw/2/judge.md) and [r2](../results/authoring-campaigns/spec-trajectory-oct23/raw/12/judge.md) say Depends on None despite the preserved portal edge to infra-base. Actual graph inconsistency. r1 does not read the portal; r2 does read it before writing, so missing reading is not the sole explanation.                                                                                                                                                                                                                                                              |
| scope-infrastructure | 3/3 /1/3                         | [r3](../results/authoring-campaigns/spec-trajectory-oct23/raw/23/judge.md) has observable positive/error input-domain overlap. [r2](../results/authoring-campaigns/spec-trajectory-oct23/raw/13/judge.md) instead rejects product ownership based on infra-base's scope boundary, while [r1](../results/authoring-campaigns/spec-trajectory-oct23/raw/3/judge.md) accepts comparable algorithm ownership. The brief explicitly asks for normalization; infra-base is a tooling dependency, not automatically a containment parent. Task/ownership fit and grader consistency remain unresolved, not a confirmed agent-only failure. |
| scope-interface      | 3/3 /3/3                         | Grades do not prove workflow compliance. [r2 trace](../results/authoring-campaigns/spec-trajectory-oct23/raw/14/trajectory.json) contains an actual Python file rewrite, then another Write and only a compound final check. This is observed forbidden mutation plus unproven final direct check, not merely the generic opaque-shell limitation.                                                                                                                                                                                                                                                                                  |
| module-flat          | 2/3 /3/3                         | [r2 artifact](../results/authoring-campaigns/spec-trajectory-oct23/raw/15/specs/token/normalize/normalize.spec.md) explicitly awaits operator approval without a grant; its recorded pending-whitelist RED is a confirmed oracle false negative. Judge correctly refuses to override that host grade. Separate v2 calibration below, no historical promotion.                                                                                                                                                                                                                                                                       |
| module-nested        | 3/3 /2/3                         | [r1](../results/authoring-campaigns/spec-trajectory-oct23/raw/6/judge.md) omits ASCII from the positive requirement but rejects non-ASCII in the negative requirement. The parent and DbC contain ASCII; the conflicting normative trigger is a real document inconsistency.                                                                                                                                                                                                                                                                                                                                                        |
| index-module         | 3/3 /3/3                         | No recorded artifact/judge negative; opaque path remains unproven, not an all-axis success claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| index-scope          | 3/3 /3/3                         | No recorded artifact/judge negative; opaque path remains unproven, not an all-axis success claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| index-project        | 3/3 /3/3                         | No recorded artifact/judge negative; opaque path remains unproven, not an all-axis success claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Self-report cross-checks:

- Library-r2's portal read `call_03_PN0NGnduVRBwpG2HeHPH6946` precedes the incorrect whole Write
  `call_00_llDFKolNTUfZkvIB6s8k2753`; its absence of `sdd-orient` is also observable. An instruction
  clarifying graph-to-dependency transfer is a hypothesis; “just read the portal” is not a proven fix.
- Product-r2 reflection cites shortened/nonexistent IDs (all ten citations are flagged unknown).
  Actual whole Writes/checks do exist, but this cannot authenticate the claimed initial ID warning
  or private reason for rewriting. Product-r3 and index-project-r3 each have one unknown citation.
  All29 saved reflections are completed with unchanged-diff/zero-new-tool receipts; those receipts
  do not make unsupported citations true. Do not repair the citations.
- Interface-r2 reflection acknowledges a Python rewrite. The trace directly confirms
  `call_00_k9wgyIm3YGFxBkBVdEQg2350`, the later Write `call_00_ZEnm7x8Rr4LC9muavEK40133`, and
  compound check `call_00_KMzPhxrJLsdSZmF3Ja7h1549`. Its proposed SPEC_ID/acronym unification is
  not the current filename-derived ID contract and must not be accepted just because the worker suggests it.
- Portal-r2 guesses name/Decision Log causes, whereas its public judge rejects input-domain wording.
  Infrastructure-r2 guesses decision authority, whereas its judge rejects scope ownership. Both
  are explicitly uncertain self-reports, not evidence for those causal explanations. Product-r1
  has no reflection; invent none.

### Measurement prerequisites, not optimization hypotheses

M0: all primary manifest files must exist in the Git index, not just the developer's working tree.
The review found30 ignored `cli.log` files. Their original hashes are retained; a campaign-scoped
ignore exception and index-membership regression close that defect. A clean tracked-only checkout
must also pass hash/replay checks without copying local raw files or reusing its parent Git index.
That clean run exposed eight more ignored preflight logs in the earlier placement campaign; their
original hashes also match. The index regression covers both frozen manifests, including these
preflight files, and SHA-256-authenticates the actual staged blobs rather than only local bytes.
Neither archive's manifest, raw grades nor report is rewritten to bypass missing data.

M1: the raw15 awaiting-approval phrase is rejected by explicit `calibrated` and accepted only by
the new `calibrated-v2`/future default. Focused regression replays the complete actual artifact with
its exact hash, plus negated-waiting and pending-plus-granted negatives; raw grades and the old
revision remain unchanged. This fixes a measurement defect, not prompts, tool counts or quality.
Future oracle/harness identities must bind this revision; the old baseline is not automatically a
new-version A/B control. Fixtures and explicit `frozen-oct22` revision contracts are unchanged.

M2: infrastructure task/ownership interpretation and portal high-level wording need independently
labelled grader controls before claims of semantic improvement. The observed infra r1 PASS does
not certify every requirement: its broad positive trigger also deserves a contradiction control.
Do not silently turn these uncertainties into agent defects, fixed grades or successful hypotheses.

M3: path-observation qualification precedes workflow-success or S2 claims. Define and version the
facts proving creation, delivered context, whole-target write and applicable fresh validation.
Positive controls must distinguish legal read-only operations from actual shell/partial mutations;
negatives include the recorded Python rewrite, stale checks, outside-target writes, missing identity
and opaque execution. An allowlisted command string or final file snapshot alone is not complete
write provenance. Unknown remains unproven, never silently green. Use the same instrumentation,
tool capability and oracle in both arms; keep all30 old path grades unchanged. Instrumentation is
a prerequisite, not bundled with an optimization or necessarily with a new batched tool.

M4: freeze a tool-role taxonomy before categorical A/B claims. Rule lookup, filesystem discovery
and verification are useful analysis lenses, but a command can combine roles; `find ai` alone does
not prove unnecessary implementation archaeology. The review's approximate Bash thirds are not
independently reproduced counts. Retain unknown/mixed classifications and raw totals; classify
by observed operations rather than tool names or inferred motive. Do not average away required
portal reads, failed validation or retry after a real change.

## Measurement, prioritization and non-negotiable boundaries

Close M0, qualify M2/M3/M4, then prioritize E1 → STOP1 → T2 as separate pilot arms; I1/I2 remain
small independently reviewable alternatives motivated by concrete lookups. T1/A1/S1 follow
separately. B1/B2 need tool-contract equivalence tests; S2 needs verified examples, not just more calls.
This ordering is a research priority, not a declaration that any candidate works.

Keep success rate and cost per compliant success primary; saved calls by role are explanatory.
Accuracy loss per saved call is not monetary cost. With no proven successful paths, that success
denominator is zero and the ratio is undefined, not evidence of efficiency. Ratios with no saved
calls are also undefined. Report per-case quality, tool/message counts, bytes, token/cache counters
and wall time; monetary/provider retry data stays unknown unless actually observed. Blind semantic
review uses fixed independently labelled controls, not the worker's own confidence or selected best run.

Freeze task/oracle/harness/model/config/acceptance and the selected population before each pair;
change only the declared variable, retain every failed/incomplete attempt, and report per-case
artifact/semantic/path outcomes alongside total/median/max tool counts. No averaging away quality
loss in one case. A pilot subset must be declared before calls; a claim across all ten kinds needs
that broader coverage. Old30 rejected arms and the observational cohort cannot substitute for those pairs.

The prior static module-only six-part envelope is **not** the actual read context or an all-ten-kind
prompt budget. Report each candidate's changed text plus actual loaded paths, read ranges/bytes when
captured, and SDK counters; unknown ranges/body size remain unknown. Saved summaries/tool arguments
do not reveal every source body, shell side effect or provider prompt. Worker/judge/reflection usage
stays separate; `usage.messages` counts observed assistant messages, not HTTP requests or retries.
Opaque shell, missing identities and incomplete capture stay explicit; a complete trace may still
have incomplete classification. [Profiler](../authoring-trajectory-profile.ts) repeats and temporal
batching opportunities are observational candidates, not proof that a reread was wasteful.

For a future combined tool, version the path-measurement adapter **before** comparison and evaluate
equivalent mechanical facts: exact canonical creation, returned/read bytes and identity before
Write, whole-document write, and successful final applicable check after that write. Both control
and candidate must use that fact contract. Keep historical raw path verdicts unchanged; neither add
a redundant literal Read to the new tool nor silently turn an old unproven result into PASS.
Separately test a host-native Read-before-Write guard: even an exact Bash/CLI receipt might not
satisfy a specific agent/SDK's Write prerequisite. This is an **unverified host risk**, not an
observed restriction here. An owned test-control must establish that the next Write accepts the
combined receipt before B1 can promise removal of a native Read. No global credentials are involved.
Portal/index authoring has no universal `--spec` CLI gate: use the declared applicable artifact
validators, not an invented successful command or project-wide ticket-completion requirement.

No changes here to approval/refine/pivot/history, actual validators, frozen source, model/server,
collector or permanent evidence. Any later test/probe uses owned temporary fixtures and removes
them on both success and failure. No live model call or heavy test was run for this source map.
