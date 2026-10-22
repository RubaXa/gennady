# Template-owned authoring: baseline and controlled evolution

Status: infrastructure and deterministic controls implemented; fresh model baseline not yet collected.
Frozen product baseline: main `f8c93d9d5c5a9549da7ae2fbf8af96d8a6b34b71`. Production templates,
owner directives, operator approval boundaries and mechanical product validators are unchanged.

## Goal

Move section-content instructions to their owning templates and leave concise workflow instructions
in owner directives. This is a hypothesis, not a proven optimization. A shorter directive alone is
not a win: the agent must still read the template, so count total actual context, actions, retries,
artifact correctness and elapsed work. Preserve failures rather than optimizing the reported subset.

The OpenAI Docs skill informed the evaluation method: task-specific criteria, actual tool/argument
and handoff checks, independent semantic rubrics and repeated comparisons, not a generic judge PASS.
Primary sources read on 2026-10-22:

- [Build skills](https://developers.openai.com/plugins/build/skills): concise workflow, supporting
  references/templates loaded when needed. Our template-local instruction layout is an application
  of that principle, not a result certified by the source.
- [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices):
  executable task-specific checks, representative edge cases and explicit comparison rubrics.
- [Optimizing accuracy](https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy): long
  context is not automatically reliable; evaluate rather than assuming more/less text wins.

## Frozen matrix and scope

| Case                 | Target                                                          |
| -------------------- | --------------------------------------------------------------- |
| portal               | Project portal                                                  |
| scope-product        | Product specification                                           |
| scope-library        | Library specification                                           |
| scope-infrastructure | Infrastructure specification                                    |
| scope-interface      | Interface specification                                         |
| module-flat          | One flat module                                                 |
| module-nested        | Same bounded module under a nested path; correct relative links |
| index-module         | Module ticket index                                             |
| index-scope          | Scope index and rollup                                          |
| index-project        | Project index and inherited conventions                         |

Task facts, existing seeds and expected checks live in source-owned `authoring-benchmark*.ts`.
The selected target is absent initially and must be created by the actual installed `sdd-new`.
The agent cannot read reference renderers, benchmark tests, prior eval results or hidden oracle from
its installed package: benchmark provisioning excludes flow-eval/flow-sim/drafts/inspector.
This is test-data isolation, not a hostile-process OS security sandbox.

These are ISOLATED artifact-authoring experiments, not end-to-end routing, dialogue, semantic
review, approval or execution-completion proofs. Keep the existing full-flow recovery scenario as
a separate integration check after a candidate improves the isolated cases. Ticket and research
authoring, existing-spec refinement and long-context holdouts are later explicit matrix extensions.

## Deterministic acceptance fixed before runs

The artifact oracle is read-only and independent of the worker's claim. It checks real canonical
shape and draft validators, bounded positive/negative examples inside their owning requirement
section, IDs, links, dependencies, parsed portal/tracker/DAG facts and immutable seed bytes.
An untouched skeleton, contradictory/duplicated/misplaced fact, forged approval, unsafe/hardlinked
artifact, changed reference or unexpected artifact is red. Source tests cover both outcomes.
The oracle's bounded facts do not prove arbitrary semantic equivalence of prose or every Mermaid
grammar. Independent review remains required; a judge cannot waive a red artifact or path gate.

The path oracle requires complete real tool identities and terminal calls, then observes
`sdd-new` completion → exact target read → whole-file Write. Six spec cases also need the exact
successful `sdd-check --spec ... --authoring` after the final Write. Echo/help/failed calls,
overlapping timestamps, partial writes and file-tool writes outside the target do not qualify.
Opaque Bash commands also leave this narrow path unproven: without OS-level write tracing we cannot
prove that a shell script did not partially rewrite the target after its final check. This is a
measurement limitation, not proof that every such agent action was incorrect.
Portal/index exact authoring CLI is CURRENTLY MISSING: do not invent a command or substitute a
whole-project check that requires not-yet-existing tickets. Their artifact check is a trusted host
oracle after the worker stops, not evidence that the agent ran a nonexistent CLI gate.

Write-zone coverage is explicit: artifact inventory and seed-byte checks exclude harness runtime
directories. File-tool trajectory checks add visibility; they do not claim complete detection of
arbitrary Bash mutations to ignored runtime caches. Keep this limitation in every report.

## Measurement and comparability

Every run persists source SHA/dirty state, exact task/oracle/harness/environment digests, case,
campaign, variant and repetition, requested model and actual SDK worker model identities, artifact
and trajectory verdicts, actual artifact bytes, full trace and separate judge response.
Speed uses SDK user-created → final assistant-completed timestamps, not the observer's polling
interval; incomplete assistant messages invalidate completed-run timing. Tool span is recorded separately. Tokens are worker input/output/reasoning with cache
separate; judge usage is not silently included in worker totals. Money is unknown without a bill.

One diagnostic run per case discovers fixture/oracle problems; it is NOT a qualified performance
baseline. Controlled comparisons require at least three repetitions for every declared case and
variant, one clean source revision per variant, identical task/oracle/harness/environment, verified
Flash and complete metrics. Missing, duplicated, dirty, mixed-model or changed-oracle records make
the comparison inconclusive. Failed runs cannot be dropped to manufacture a faster candidate.

Report each axis separately: artifact/trajectory success counts, semantic judge diagnostics,
tool/read/rewrite/failure counts, duration median and range, non-cache tokens and cache usage.
If baseline quality is already perfect on a case, report preserved quality, not invented improvement.
Three stochastic samples support descriptive observations, not a general guarantee or significance
claim. Interleave baseline/candidate repetitions on the same host and fixed concurrency to reduce
time-of-day/provider/cache confounding; repeat noisy results and use held-out cases before adoption.

## Evolution sequence (no combined mutation)

| Variant        | One hypothesis                                                                                   | State              |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| baseline       | Current generated templates + current owner instructions                                         | ready to measure   |
| local-guidance | Move missing/duplicated section instructions into templates; derive manifest output              | not implemented    |
| concise-owner  | Remove content-level repetition from owner fill steps; retain workflow/safety                    | not implemented    |
| lazy-formats   | Load heavy supporting formats only at the owning section                                         | not implemented    |
| refinement     | Give existing-artifact edits read-only access to current instructions after comments are removed | separate extension |

Each candidate is a clean, independently reviewed source revision. The comparator does not choose
a winner automatically: artifact/trajectory regression rejects it, and finite observed savings do
not replace independent semantic review, integration checks or approval to merge.

## Commands

Use only `llm-proxy/deepseek-v4-flash` for worker and judge on an owned local OpenCode server;
disable personal MCP integrations and pin all background roles to Flash. The existing RUNBOOK owns
credentials/setup. Never print credentials, use another model on failure or publish npm.

```bash
npm run build
node --import tsx ai/flow-eval/scripts/authoring-experiment.ts plan \
  --campaign template-authoring --variant baseline --repetitions 3 --out /tmp/authoring-baseline.json
node --import tsx ai/flow-eval/cli.ts --scenario-file /tmp/authoring-baseline.json \
  --directory /tmp/owned-authoring-sandboxes --gennady-root "$PWD" \
  --base-url http://127.0.0.1:4109 --model llm-proxy/deepseek-v4-flash \
  --judge-model llm-proxy/deepseek-v4-flash --concurrency 1 \
  --observe-every-ms 2500 --stuck-after 12 --max-observations 80 --max-wall-clock-ms 180000
node --import tsx ai/flow-eval/scripts/authoring-experiment.ts compare \
  --campaign template-authoring --baseline baseline --candidate local-guidance \
  --repetitions 3 --results-dir ai/flow-eval/results
```

Create the sandbox parent with `mktemp -d`, not a fixed pre-existing path. Plans use exclusive
creation and refuse to overwrite a previous plan. Before comparison retain exact plan bytes beside
each result and verify their SHA-256 against its original source record. Use a new campaign for a
new corpus/oracle; never relabel old results or update criteria after observing an agent failure.

## Delivery

Feature PR targets main and goes through external review before merge. First deliver infrastructure
and diagnostic baseline, then qualify repeated baseline, then evolve one hypothesis per reviewed
change. Update status with real completed/running/blocked counts and artifact/PR links; no silent
long-running work and no improvement claim before measurements exist.
