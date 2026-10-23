# Authoring efficiency: primary-source check, not an effect-size promise

Checked 2026-10-23. This review motivates the additional E1/STOP1/T2/S2 arms in the
[hypothesis matrix](./AUTHORING-HYPOTHESIS-MATRIX.md). No new model run was made for this document.
Our route remains Flash through the authorized AI Proxy, not the models in these papers.

## What the cited sources actually support

1. [Leveraging In-Context Learning for Language Model Agents, §7, revision 1](https://arxiv.org/html/2506.13109v1#S7)
   evaluates AppWorld with GPT-4o-based agents. The reported 30.7-point improvement and 47% fewer
   steps are for selected **two full trajectories** versus zero-shot, not a guarantee for a short
   snippet. The 40% cost increase compares two trajectories with one, not with zero-shot. Step-level
   snippets offer a different overhead/quality tradeoff. T2 therefore tests a small observable
   example separately; it is not proven to replace all instructions or reduce total tokens.

2. [Prompt-Induced Waste in Coding Agents, revision 6, §9 and Appendix M](https://arxiv.org/html/2608.01347v6)
   is the current title behind the review's “Same Task, Different Work” reference. It distinguishes
   exploratory work, repeated verification, model effort and harness effects. Crucially, its
   ambiguous-spec follow-up reports three of five hidden-test failures for bounded-efficiency
   framing versus none at baseline: the requirements file was not inspected. “Neutral or better
   on all models” describes a particular experiment, not every task. E1 must preserve required
   reading and allow expansion on ambiguity. The high-cost verification gradient is observational,
   not our expected causal saving.

3. [LLM Agents Already Know When to Call Tools — Even Without Reasoning, revision 2, §3.2](https://arxiv.org/html/2605.09252v2#S3.SS2)
   introduces When2Tool. Its 2.5× example concerns **accuracy loss per removed call** on a specific
   hard/easy model comparison, not a dollar multiplier. It motivates necessary-tool negative
   controls, not a blanket call cap. Its hidden-state steering technique is not something our
   black-box proxy runner can assume it implements.

4. [OpenAI GPT-5 prompting guide, context gathering](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide)
   recommends explicit exploration/stop conditions and renewed search when evidence demands it.
   This is model-specific prompting guidance, not an experiment on our Flash authoring cases.
   We do not transfer a hard two-call cap or permission to accept incorrect output into Gennady.

The unlinked NeurIPS “73→89%” self-bootstrap number in the review was not established from the
named sources. S2 remains a plausible separate proposal, without that quantitative claim. Its
prerequisites are valid path evidence, independently accepted examples and no train/holdout leakage.

## Project-specific consequences

- None of the published percentages is a Gennady result. Current unchanged raw outcomes remain
  artifact26/30, judge21/30, joint20/30, path0/30; a path-success cost ratio is presently undefined.
- Do not ask for “fewer tools” indiscriminately. Preserve portal/parent reads, repair after a real
  mutation, and environment-recovery retries. A frozen graph/read negative must remain red.
- A generic filesystem listing, diagnostic lookup and actual implementation-source search are not
  synonymous. Approximate Bash shares in the review need an explicit mixed/unknown-aware taxonomy
  before becoming measured category counts or a causal assertion.
- Change one variable at a time. E1's first arm changes only evidence-triggered context expansion;
  STOP1 only state-sensitive rechecking; T2 only a typed action/expected-state snippet. Fixed path
  lists, numeric caps, tool batching and model effort are not silently combined with those arms.
- A snippet must describe operations that exist. Canonical creation produces a target plus section
  manifest; exact portal/index authoring has no universal spec-check CLI. Their declared host oracle
  cannot be replaced with a fabricated successful command or project-wide ticket completion.
- S2 must use independently proven action/observation examples, no private reasoning and no complete
  answer from the evaluated task. Path evidence need not depend on introducing B1/B2 tools first.

## Next gate

Before live A/B, finish the [matrix prerequisites](./AUTHORING-HYPOTHESIS-MATRIX.md): portable
primary archive, known-label semantic controls, versioned path proof, and tool-role taxonomy.
Use the same instrumentation/task/oracle/model/config in both arms. Retain failures and unknowns,
report per-case regressions, and include actual input/cache/output, tool and observed-message costs.
Dollar cost and provider HTTP retries stay unknown until the serving layer supplies evidence.
