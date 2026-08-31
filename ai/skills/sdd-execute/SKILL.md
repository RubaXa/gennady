---
name: sdd-execute
description: Execute task tickets end-to-end — one ticket or a whole batch, picked from operator intent: plan phases, dispatch one worker per phase, pass typed handoffs between phases, close the Round, audit + code-review, retry failing phases once. A deterministic execution map (`sdd-task`) drives next/batch. Use for a Task-ID, "next", "pick", "batch"/"all"/"выполни очередь", "выполни задачу", "следующую", "/sdd-execute". Runs isolated.
compatibility: opencode
---

<SddSkill id="execute">
  <Priming>
    SDD skills are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HardForbidden>`, `<HaltConditions>` stop-rules. The body is markdown read as instruction —
    you EMBODY the directive, you do not parse it.
  </Priming>

  <Mission>Enter the single SDD router with forced intent `execute`. The router owns session conflict/open policy and loads the canonical execute orchestrator; this skill only gathers its one state snapshot and preserves the operator payload. I PLAN and DISPATCH — I never write code, run a phase, or run audit myself.</Mission>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): execute the exact routerState ToolCall below
      (flow version · readiness · scopes · session) AND read in full
      `ai/directives/sdd-v2/router.directive.xml`. The exact `routerState` bytes are the router
      snapshot; this is the only initial state call, and the router never executes it itself.
      <ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state</ToolCall> Use routerState as the literal stdout snapshot.
    </Step>
    <Step id="PREFLIGHT">
      State is already gathered (GATHER, above). Pass exact result alias `routerState` to router `STEP_0_STATE`
      with literal `forced intent: execute`; do not call `sdd-state` again and do not open, relabel,
      ignore, or close a session in this loader. The router resolves a live-session conflict once,
      then loads execute, whose own `STEP_0B_PREFLIGHT` interprets readiness.
    </Step>
    <Step id="EMBODY">
      You ARE the router now. Preserve forced intent `execute` and pass the operator payload unchanged —
      Task-ID / ticket path / `next` / `pick` / `batch` / `all` / `queue`, including an empty
      payload. Empty payload means «show the execution-map selection and wait», not `next`; it never
      authorizes a ticket plan, Round, or worker before the operator selects. Follow its `LOGIC_SWITCH`;
      the execute owner it loads keeps canonical `STEP_0_RESOLVE` as the first task-lifecycle call.
      This loader invokes neither `sdd-task` nor the execute directive directly. Never skip the audit.
    </Step>
  </ExecutionPlan>
</SddSkill>
