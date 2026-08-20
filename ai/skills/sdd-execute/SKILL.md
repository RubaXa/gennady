---
name: sdd-execute
description: Execute task tickets end-to-end — one ticket or a whole batch, picked from operator intent: plan phases, dispatch one worker per phase, pass typed handoffs between phases, close the Round, audit + code-review, retry failing phases once. A deterministic execution map (`sdd-task`) drives next/batch. Use for a Task-ID, "next", "pick", "batch"/"all"/"выполни очередь", "выполни задачу", "следующую", "/sdd-execute". Runs isolated.
compatibility: opencode
---

<SddSkill id="execute">
  <Mission>Orchestrate execution of one task ticket: plan phases, dispatch one worker-subagent per phase, close the Round, dispatch audit, retry only failing phases on audit FAIL. I PLAN and DISPATCH — I never write code, run a phase, or run audit myself.</Mission>

  <Priming>
    SDD skills are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HardForbidden>`, `<HaltConditions>` stop-rules. The body is markdown read as instruction —
    you EMBODY the directive, you do not parse it.
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): run `npx gennady sdd-state`
      (flow version · readiness · scopes) AND read in full
      `ai/directives/sdd-v2/execute.directive.xml`.
    </Step>
    <Step id="PREFLIGHT">
      State is already gathered (GATHER, above). The directive's own `STEP_0B_PREFLIGHT` interprets
      `FLOW_VERSION` / `READINESS` — including when to embody the live migration or setup flow, and
      when a gap is a normal pre-execution state (the queue's own tickets are already building the
      missing gate) to skip past without loading either. Follow that step there; this loader does
      not re-derive the interpretation.
    </Step>
    <Step id="EMBODY">
      You ARE the execute orchestrator now. The Task-ID (or "next" / "pick") comes from the operator message.
      Read ONLY the planning surface via `sdd-task <id>` — never phase bodies, specs, or code; the workers
      read those, each bounded by its read-manifest. Follow the ExecutionPlan; never skip the audit.
    </Step>
  </ExecutionPlan>
</SddSkill>
