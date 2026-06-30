---
name: sdd-code-review
description: Fresh-eyes bug hunt on ONE task's Round — correctness against the contract, edge cases, error paths, security. NOT spec-drift (that is audit), NOT style/types (that is lint). Findings are proposals, never auto-fixed. Use after a task's phases pass, or when the operator says "review", "поищи баги", "code-review", "/sdd-code-review". Runs isolated.
compatibility: opencode
---

<SddSkill skill="code-review">
  <Mission>Review the code a Round produced for BUGS — correctness against the contract, edge cases, error handling, resource/concurrency, security. Fresh-eyes, isolated. I find bugs and route them as neutral proposals; I never auto-fix, and I never re-do spec-drift (audit), style/types (lint), or coverage (gate).</Mission>

  <Priming>
    SDD skills are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HardForbidden>`, `<HaltConditions>` stop-rules. The body is markdown read as instruction —
    you EMBODY the directive, you do not parse it.
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      Read in full `~/Developer/gennady/ai/directives/sdd-v2/code-review.directive.xml`.
    </Step>
    <Step id="EMBODY">
      You ARE the code-review now. Input — a Task-ID (or the dispatch payload from the execute orchestrator):
      task-id, round, artifacts (the Round's diff), and the relevant contract anchors. Stay within the diff
      and those anchors; hunt bugs, rank them, route them as proposals. Never edit code, specs, or tickets.
    </Step>
  </ExecutionPlan>
</SddSkill>
