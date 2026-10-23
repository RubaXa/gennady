# Authoring measurement qualification after baseline #126

This is measurement repair, not an author-prompt optimization. The frozen30 observations and
their artifact/judge/path outcomes are unchanged. New source identities require fresh paired
controls; they cannot turn the old cohort into a new-version A/B control.

## Status and scope

| Prerequisite                          | State                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1: awaiting-approval false rejection | Fixed by explicit `calibrated-v2`; original `calibrated` replay preserved.                                                                                                                                                                                             |
| M2: semantic context                  | The judge now receives the immutable source portal, not only `.spec.md` and the token contract. A changed portal makes capture unavailable.                                                                                                                            |
| M2: known labels                      | Seven portal/library controls, independently reviewed against source facts. Not a blind review; prior discussion was known. Live calibration is a separate qualification step.                                                                                         |
| M2: infrastructure                    | **Unqualified**: the synthetic brief requests a normalizer but its infrastructure owner excludes product/library design. Dependency is not containment, but that does not cure this separate task/owner conflict. Do not use this case to certify a full ten-kind A/B. |
| M3: path proof                        | **Open**. Opaque shell remains unproven; no command-string allowlist or final snapshot is substituted for execution/write evidence.                                                                                                                                    |
| M4: tool-role categories              | Open. Retain mixed/unknown categories; approximate Bash shares are not measured exclusive counts.                                                                                                                                                                      |

## Concrete repaired boundary

[Evidence capture](../authoring-judge-evidence.ts) previously selected only the token contract and
`.spec.md` references. It omitted `specs/README.md`, even though that portal owns dependency facts.
The new capture includes and authenticates the unchanged portal. Portal authoring itself deliberately
has no seeded portal: the reviewed target is not promoted into trusted reference context.

[Judge guidance](../judge.ts) distinguishes a dependency from a parent/containment relation, concise
portal summaries from explicit unconditional promises, and actual return/throw contradictions from
mere overlapping words. It does not authorize ignoring the artifact-kind owner or overriding a
conflicting brief. It still cannot override independent mechanical/path gates.

The new capture assertions fail with the old reference filter and pass after the fix. Tampered
portal and missing/unsafe references remain fail-closed. Every temporary test fixture is removed
in `finally`.

## Independently reviewed known-label controls

[Control source](../authoring-semantic-controls.ts) contains two positive artifacts and five
single-clause/edge mutations. Domain negatives keep an explicit return obligation in the positive
and negative artifacts; only the precondition changes. This avoids the confound “overlap alone
always proves contradictory outcomes”.

| ID                               | Expected | Concrete evidence                                                                                                |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| portal-summary-valid             | pass     | Concise opening; the same Vision explicitly rejects empty/separator-only/non-ASCII input.                        |
| portal-summary-contradiction     | fail     | Explicit always-return/never-throw contradicts the retained rejection facts.                                     |
| portal-reversed-dependency       | fail     | Reverses the required `token → infra-base` edge.                                                                 |
| library-tooling-dependency-valid | pass     | Correct contract and dependency; the tooling owner's scope does not prohibit the consumer's requested algorithm. |
| library-missing-dependency       | fail     | Denies the dependency required by the unchanged portal.                                                          |
| library-ascii-overlap            | fail     | Empty/separator-only input now requires both return and throw.                                                   |
| library-nonempty-overlap         | fail     | Nonempty alone still includes separator-only input; return conflicts with throw.                                 |

These are small qualification controls, not representative production success rates, hidden-test
holdouts or an independent assessment of every saved artifact. Infrastructure controls were rejected
during independent review and are not silently relabelled or pooled into this scored set.

## Live calibration procedure

Build fresh CLI output first; use the owned Flash-only server procedure in [RUNBOOK](./RUNBOOK.md).
Never reuse port4096 or a personal server; do not modify global configuration. Then:

```bash
node --import tsx ai/flow-eval/scripts/authoring-semantic-calibration.ts \
  --server http://127.0.0.1:4117 --out /private/tmp/NEW-OWNED-CALIBRATION
```

The [runner](../scripts/authoring-semantic-calibration.ts) requires clean committed source and
verified runtime/config/model identity. It freezes source/control hashes before calls, uses
`llm-proxy/deepseek-v4-flash`, two repetitions, concurrency1 and a60-second judge deadline.
Expected labels and host oracle results are hidden from the judge: copying a mechanical verdict
does not qualify semantic discrimination. No worker authoring occurs.

Every attempt retains public verdict/rationale, actual model/token/message counters, duration,
tool/capture qualification and cleanup outcome. Failed/inconclusive/unqualified results remain;
an infrastructure/route/cleanup error stops the campaign without fallback or silent retry.
Tool use is forbidden and must be observed as zero. Owned sessions and fixture directories are
cleaned after each call; SIGINT/SIGTERM abort the active call before cleanup. SIGKILL cannot run
JavaScript `finally`; the owner of the dedicated server must also terminate it and its owned state
on failure. Monetary cost/provider HTTP attempts remain unknown unless the serving layer supplies them.

No production quality claim follows from a small calibration PASS. Keep the permanent bounded
`protocol.json`/`results.json` evidence, stop the owned server and remove its temporary state.

## Next slice: M3 before optimization

Scope clarification: the [call research plan](./AUTHORING-TRAJECTORY-RESEARCH.md) separates
descriptive/counterfactual call research from a claim of fully proven workflow compliance.
Full M3 remains necessary for that stronger claim and S2, not for observing call counts in a
bounded pilot with identical instrumentation and explicitly unknown path facts. The current
PR includes the [626-call ledger](./AUTHORING-CALL-AUDIT.md) and forward-only public output
fingerprints/read-window telemetry. It does not reconstruct missing historical results.

Live qualification on source `07ca6d92` is [recorded here](../results/authoring-campaigns/semantic-qualification-oct23/REPORT.md):
main13/14 plus one separately retained diagnostic replay1/1. The empty response remains inconclusive;
the diagnostic does not replace it. All15 sessions and both isolated servers were cleaned. This is
not an all-green end-to-end judge/channel qualification or a new authoring baseline. A subsequent
unit-backed change gives empty public responses actionable diagnostics without guessing their cause.

Define/version facts for exact creation, delivered context, whole-target mutation and applicable
fresh validation. Test positive behavior with real owned CLI/filesystem operations, then mutate
ordering, identity, partial/outside writes, stale validation and opaque execution one at a time.
`proven`, `observed violation` and `unproven` must not collapse into one misleading success count.
Do not infer absence of writes from a plausible command, final snapshot or agent reflection.
Use identical instrumentation and task/oracle/model/config in both arms. Run STOP1 as a separate
bounded one-variable pilot under the scoped research plan; do not promote an unknown path into
proven compliance. Infrastructure remains
excluded until its task/owner mismatch is repaired with a separately versioned fixture and controls.

Visual artifact: none — this is backend/CLI evidence, not a UI task.
