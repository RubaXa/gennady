# Instruction placement experiment

Status 2026-10-23: 30 primary attempts, 30 primary judges, 30 actual-worker reflections,
and 30 separate supplemental semantic reviews completed. No candidate adopted.
Only `llm-proxy/deepseek-v4-flash`; actual observed model is verified, not inferred from a label.

## What was learned

Smaller instructions alone did not meet the operator criterion. Every first-generation candidate
fails the fixed per-case tool-count threshold. The most compact candidate passes all six bounded
artifact checks, but semantic review still finds two contradictions. Production templates remain
the baseline; the rejected source mutations are reproducible patches, not silently shipped changes.

| Variant                         |   Six-part instruction envelope | Bounded artifacts | Flat tools, 3 runs | Nested tools, 3 runs | Decision  |
| ------------------------------- | ------------------------------: | ----------------: | ------------------ | -------------------- | --------- |
| baseline                        | 43,574 B / ~8,742 lexical units |               4/6 | 25, 34, 24         | 21, 30, 17           | reference |
| template-rich                   |               40,095 B / ~8,347 |               5/6 | 30, 27, 23         | 30, 22, 24           | reject    |
| owner-rich                      |               40,103 B / ~8,311 |               4/6 | 32, 31, 22         | 29, 25, 21           | reject    |
| concise-both                    |               39,827 B / ~8,309 |               6/6 | 20, 29, 20         | 24, 27, 21           | reject    |
| concise-acronym (adaptive gen2) |               40,133 B / ~8,375 |               4/6 | 29, 26, 33         | 23, 26, 21           | reject    |

Do not average away a regression: concise-both reduces flat calls 83→69 but increases nested
calls 68→72 and median 21→24. Template-rich increases nested calls to76 and both case medians.
Owner-rich increases flat/nested medians to31/25. All three comparisons are mechanically comparable
under the frozen identity checks and recommend reject; this does not qualify the defective semantic
endpoint or reference seed described below. Original primary semantics remain unchanged.

The envelope covers the exact six preregistered parts, including the actual manifest. It is NOT
total provider context, the Flash tokenizer, or all optional reads: agents also sometimes read
the separate module-format document. These are composite wording/placement/deduplication mutations,
not a one-variable causal estimate of where instructions should live.

## Hypothesis register

Baseline is the reference, not a fifth intervention. Below, tools are total / median for three
attempts; artifacts are the original bounded passes in that case. Baseline flat: 83 /25, artifacts
3/3; baseline nested: 68 /21, artifacts1/3. These counts retain the historical oracle defects.

| ID / change                                                                                          | Flat result               | Nested result             | Fixed decision / observed mechanism                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1 template-rich: move content recipes into local skeleton comments and manifest fill; compact owner | tools80 /27; artifacts3/3 | tools76 /24; artifacts2/3 | Reject: both medians grow; nested total grows. Local instructions were read, but fewer correction/read calls were not consistently observed.                                                                       |
| H2 owner-rich: concentrate recipes in owner; thin local guidance                                     | tools85 /31; artifacts3/3 | tools75 /25; artifacts1/3 | Reject: both totals and medians grow. A single recipe location did not eliminate format/decision-log lookups in these traces.                                                                                      |
| H3 concise-both: short reminders in both locations                                                   | tools69 /20; artifacts3/3 | tools72 /24; artifacts3/3 | Reject: flat reduction does not offset nested growth. Smallest envelope and bounded6/6 do not establish semantic correctness.                                                                                      |
| H4 adaptive concise-acronym: H3 plus297-byte generic filename-derived ID hint before first Write     | tools88 /29; artifacts3/3 | tools70 /23; artifacts1/3 | Reject: both totals and medians grow. Six public receipts show one target Write and one exit0 check, without acronym diagnostics; five first Writes use canonical local IDs, one delegates to parent requirements. |

H1–H3 were fixed before the original24; H4 was separately preregistered after those observations,
with six new attempts and the same nominal criteria. Public checker warning→correction sequences
support the existence of an ID-correction cycle in earlier runs; H4 lacks that selected cycle.
Neither this local mechanism nor N=3 differences prove why total tool calls changed. Placement,
wording, host/provider/cache noise and the findings below remain confounds. Worker reflections are
separate post-freeze self-reports, checked against call IDs where available, not causal explanations
or evidence that unobserved actions happened. No hypothesis is accepted; no rejected production
mutation is adopted.

## Independent supplemental semantic endpoint

All24 saved documents were blinded and reviewed, never just a winning subset. The source-owned
brief/parent/contract are supplied with the full exact artifact; reviewers have no tools. Same
Flash model and rubric, complete usage/tool provenance, per-input hashes; batch completed without
abort. This changes the context as well as the prompt, so it is a repair diagnostic, not prompt-only A/B.

| Variant                        | Pass | Fail | Inconclusive |
| ------------------------------ | ---: | ---: | -----------: |
| baseline                       |    4 |    0 |            2 |
| template-rich                  |    5 |    1 |            0 |
| owner-rich                     |    5 |    0 |            1 |
| concise-both                   |    4 |    2 |            0 |
| concise-acronym (separate six) |    6 |    0 |            0 |

Original24 only: 18 pass /3 fail /3 inconclusive. Gen2 is separately6 pass /0 fail /0 inconclusive;
the arithmetic all30 total is24 /3 /3, not an additional pooled comparison. This endpoint does not
replace original judge responses or the original comparator. A concrete generated failure is
contradictory handling of separator-only input:
one requirement allows normalization of every non-empty ASCII string, while another requires
`TypeError` for that same input. Structural completeness is not semantic correctness.

## Actual observed usage and time

| Variant         | Worker non-cache total | Worker cache-read counter | Median seconds flat / nested |
| --------------- | ---------------------: | ------------------------: | ---------------------------: |
| baseline        |                348,605 |                 3,772,800 |              107.726 /79.657 |
| template-rich   |                371,342 |                 4,279,680 |             104.899 /118.524 |
| owner-rich      |                353,237 |                 4,069,376 |             132.930 /106.305 |
| concise-both    |                319,950 |                 3,477,504 |             104.769 /110.002 |
| concise-acronym |                325,968 |                 3,049,984 |              112.830 /90.489 |

Original24 only: worker total1,393,134 non-cache units; primary judges269,475 and
reflections1,024,542 are separate. These are not all30 totals.
Supplemental review is additional, separately recorded usage, never a primary efficiency metric.
Full per-role input/output/reasoning-counter/cache/message values: `evidence/observed-totals.json`.
No reasoning text is collected. Money UNKNOWN: SDK cost0 is not an authoritative zero price.
Across both generations: workers1,719,102; primary judges341,474; reflections1,261,957;
supplemental reviewers668,354 non-cache units. Total3,990,887, with cache-read18,898,944
reported separately. This is observed SDK accounting, not a billing statement.
Full hooks overlapped parts of the first-generation batches; shared host/provider/cache noise
prevents a causal speed claim. N=3 per case is descriptive, not statistical significance.

## Trajectory, reflection and known limitations

- All24 path verdicts remain UNPROVEN: opaque Bash prevents proving whole-write-only behavior.
  This is a measurement limitation, not24 proven agent defects.
- Actual-worker interviews happen after primary metrics/artifacts freeze, with separate usage.
  All24 have unchanged diff and zero new tools. Citation mistakes are retained, not repaired.
- Public SDK enrichment binds actual selected calls to source/session/model/call/timestamps and
  primary hashes. Only target Write digests/IDs and bounded allowlisted checker diagnostics are
  retained; arbitrary Bash output/private reasoning are not read. Warning→correction sequences
  corroborate reflection claims, but are not causal treatment-effect proof.
- The baseline nested-r2 broken relative link remains RED. The nested-r1 Russian statement that
  approval is absent is a confirmed false negative of the literal-pending oracle. No score is changed.
- Original primary judges sometimes emit DSML-like tool text or no verdict: those stay inconclusive.
- The isolated fixture has a short authoring-boundary AGENTS file, not a coding-agent router.
  Do not attribute the judge issue to a router that was not present.
- This live population is flat/nested module authoring, not full SDD execution or all ten artifact
  kinds. Other kinds have deterministic tests/earlier diagnostic runs, not proven live improvement.

## Finding register — correction status

Status at this documentation update: the confirmed seed, handoff predicate and judge-evidence/
text-only defects are FIXED, with focused40/40 passing before the added list-prefix controls and
independent focused RU/EN/contradictory-approval tests passing2/2 including those controls. Separate
live grader calibration matches6/6 expected labels (3 PASS, 3 FAIL), including an untrusted target
instruction negative. The updated offline flow-eval suite passes441/441, including frozen replay
and recorded calibration.
Historical primary artifacts, raw verdicts, hashes and comparisons remain frozen; a future fixed
oracle or judge needs a new source identity, not a rewrite of these records.

| Finding                                                                                                                             | Attribution / present status                                                                                                                                                                                     | Required boundary                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Frozen handoff oracle requires literal English `pending`                                                                            | FIXED: calibrated predicate accepts bounded explicit RU/EN unapproved states and rejects tested contradictory granted claims, including list prefixes. Focused controls and separate6/6 grader calibration pass. | Forged-approval negatives remain required. Old structural RED stays raw.                                       |
| Historical primary semantic judge lacks source-owned parent and contract context                                                    | FIXED: capture supplies exact source-owned brief/references with identity, hash and read bounds. Separate6/6 grader calibration passes; supplemental historical reviews remain separate.                         | Do not infer missing evidence from model familiarity.                                                          |
| Historical primary judge emits DSML/tool text or no verdict with tools disabled                                                     | FIXED boundary: text-only system/prompt instructions plus tool denial; calibration emits expected3 PASS/3 FAIL with tools0. Historical inconclusive remains inconclusive.                                        | This smoke result does not guarantee future verdict reliability; malformed/missing verdicts stay inconclusive. |
| Frozen `tokenRequirements` seed: REQ-1 accepts ASCII input without excluding empty/separator-only input; REQ-2 rejects those inputs | FIXED source context: calibrated success domain requires at least one non-separator ASCII character, not only alphanumeric input. Focused checks and separate grader calibration pass.                           | Historical replay explicitly selects `frozen-oct22`; retain old seed hashes and all30 observations.            |
| Generated requirements contradict on separator-only behavior                                                                        | Frozen historical model-output failure. Not edited or claimed fixed; attribution is confounded by the seed above.                                                                                                | Future seed repair does not retrospectively establish old artifacts as correct.                                |
| Baseline nested-r2 has a broken relative link                                                                                       | Frozen historical artifact failure. Not edited or claimed fixed.                                                                                                                                                 | Preserve the actual link RED independently of pending-wording fixes.                                           |

Both live cases ask for one module document (`module-flat` or `module-nested`) against small
read-only parents/references. They do not test implementation, ticket execution, full SDD approval,
other artifact kinds or general authoring quality. Offline artifact replays reconstruct only owned
temporary fixtures and remove them in `finally`; tests/probes must clean their owned temporary
directories after failures as well as success, without modifying these archives.

The reference seed is a root context defect: its overlapping positive/negative rules can be inherited
by generated documents. Generated contradictions remain real saved inconsistencies, but cannot be
attributed causally to instruction placement or solely to an independently invented agent mistake.
Calibration evidence is separate in [template-calibration-oct23](../template-calibration-oct23/README.md):
Flash-only actual usage/coverage is complete, with43,055 non-cache units and9,984 cache-read units,
tools0, and all six `sessionDeleted`/`fixtureRemoved` receipts true. The owned server was stopped and
temporary collection root removed. Exact five-file pre-format source bytes/hashes are preserved;
`sourceDirty:true` is explicit. This is a grader defect calibration, not a clean-source optimization
arm, a new authoring baseline, or evidence of broader quality/efficiency improvement.

## Second generation and reproducibility

Concise-acronym adds only a297-byte generic filename-to-acronym instruction before the first Write
to concise-both; exact source `adf42274df08e89355c781994317e20658d9c487`. No benchmark filename or
answer is embedded. The actual ID function is checked on three unrelated filenames. Source/task/
oracle/harness remain comparable; footprint40,133 B /~8,375 lexical units. Its six fresh attempts
and semantic review are separate, adaptive observations, not pooled into the original24.
All six selected target Writes/checks are now directly observed: one whole Write and one actual
exit0 authoring check each, no acronym diagnostic. Five first Writes use correct local IDs; one
uses valid canonical parent delegation. Yet flat tool total rises83→88 (median25→29), nested68→70
(median21→23). The local correction-cycle improvement is not an overall trajectory win.
The two nested structural REDs are the same literal-pending issue described above, not silently
corrected. All six separate semantic reviews pass. Even resolving those confirmed oracle false
negatives would not change rejection by the independent tool-count criterion.

Existing wording-locked tests were generalized only in experimental copies to preserve lazy-read
and correct scope-link behavior under either placement. Artifact oracle and thresholds unchanged.
Owner-rich's contract read bindings were repaired before model calls via existing
`READ_AND_USE_DIRECTIVE`; its measured preflight amendment is explicit.

Normal hooks were not bypassed. One unrelated VCS worktree concurrency failure did not recur in
four isolated rechecks or the next identical-source full hook; it remains an unexplained flake,
not a claimed fix. Raw preflight logs are retained.

Offline replay already reproduced the original24 artifact checks/counters/comparisons and322
immutable hashes without a model or old temporary directories. Saved targets are overlaid onto
fresh source-owned seed fixtures; this does not re-prove unsaved whole-filesystem history.
The observer audit also found that the old live `readTail` projection could print raw tool inputs.
A dummy-only causal reproduction confirms the leak; no actual secret was found in this corpus.
The post-campaign fix supplies the existing safe capture projection for root and child tails,
omitting Write bodies/private parts and redacting sensitive argv. Durable trajectory output is
unchanged. This host-only fix is not retroactively attributed to the measured frozen sources.

Remaining research: validate broader handoff/grader reliability and reduce unnecessary format/
decision-log lookups. A future campaign needs a new qualified baseline after the fixed seed,
oracle and judge changes;
do not pool it with these historical records or generalize this module pilot to every artifact.
Final archive/replay: 30 primary records, 403 immutable file hashes, original negative outcomes and
all four comparisons reproduced offline. Historical pre-fix flow-eval suite: 434/434 PASS;
updated flow-eval suite after corrections: 441/441 PASS. Eight broader runner
TypeScript diagnostics were repaired; extended `tsconfig.authoring.json` now includes runner and
evidence, and its compiler check passes. This is the named compilation scope, not an unbounded
claim about every project file.
No old temporary directory or running SDK server is required by the replay tests. No automatic
merge or publication.
