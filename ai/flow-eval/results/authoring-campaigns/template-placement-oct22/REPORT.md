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
Owner-rich increases flat/nested medians to31/25. All three comparisons are qualified/comparable
under the frozen identities and recommend reject; original primary semantics remain unchanged.

The envelope covers the exact six preregistered parts, including the actual manifest. It is NOT
total provider context, the Flash tokenizer, or all optional reads: agents also sometimes read
the separate module-format document. These are composite wording/placement/deduplication mutations,
not a one-variable causal estimate of where instructions should live.

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

Total18 pass /3 fail /3 inconclusive. This endpoint does not replace original judge responses or
the original comparator. A concrete failure is contradictory handling of separator-only input:
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

Worker total1,393,134 non-cache units; primary judges269,475 and reflections1,024,542 are separate.
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
  approval is absent is a potential false negative of the literal-pending oracle. No score is changed.
- Original primary judges sometimes emit DSML-like tool text or no verdict: those stay inconclusive.
- The isolated fixture has a short authoring-boundary AGENTS file, not a coding-agent router.
  Do not attribute the judge issue to a router that was not present.
- This live population is flat/nested module authoring, not full SDD execution or all ten artifact
  kinds. Other kinds have deterministic tests/earlier diagnostic runs, not proven live improvement.

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
corrected. All six separate semantic reviews pass. Even resolving those potential oracle false
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

Remaining research: calibrate explicit unapproved/pending handoff wording across languages under
a newly frozen oracle, repair the primary text-only judge boundary, and reduce unnecessary format/
decision-log lookups. A future campaign needs a new qualified baseline after harness changes;
do not pool it with these historical records or generalize this module pilot to every artifact.
Final archive/replay: 30 primary records, 403 immutable file hashes, original negative outcomes and
all four comparisons reproduced offline. Complete flow-eval suite: 434/434 PASS. Strict authoring
and the changed evidence/test dependency closure type-checks PASS; this is not a claim that the
entire wider flow-eval closure is type-clean (the previously reported unrelated diagnostics remain).
No old temporary directory or running SDK server is required by the replay tests. No automatic
merge or publication.
