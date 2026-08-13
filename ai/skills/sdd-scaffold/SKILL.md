---
name: sdd-scaffold
description: Decompose the approved spec tree into a DAG of compact task tickets (+ the task-index hierarchy) ready for the execute orchestrator. Use for "scaffold", "разбить спеки на задачи", "decompose specs to tickets", "generate tasks", "/sdd-scaffold". Modes auto-detected — initial · extend-dag.
compatibility: opencode
---

<SddDoor door="scaffold">
  <Mission>Converge the approved specs into a DAG of self-contained task tickets + the task-index hierarchy. Gather state, embody the scaffold directive, hand off. No interview, no code — that is `/sdd` and execute.</Mission>

  <Priming>
    SDD doors are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it.
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): run `npx gennady sdd-state`
      (flow version · readiness · portal · scopes) AND read in full
      `ai/directives/sdd-v2/scaffold.directive.xml`.
      Resolve every `ai/directives/sdd-v2/<file>` below deterministically, project root first: if
      missing, `node_modules/gennady/ai/directives/sdd-v2/<file>`; if neither exists, stop and tell
      the operator to run `npx gennady sync` — never search for it.
    </Step>
    <Step id="PREFLIGHT">
      Size the gate to this request's blast radius first: when the scaffolding target stays inside a single
      domain's own scope and never touches `tasks/` layout or a missing gate script, record `FLOW_VERSION` /
      `READINESS` in one line and proceed straight to EMBODY — offer migration / readiness setup to the
      operator as a separate next step, not inside this run.
      Otherwise gate on sdd-state before scaffolding: `FLOW_VERSION=v1` → do NOT stop: read & embody `ai/directives/sdd-v2/migration-v1-v2.directive.xml`
      (the live v1→v2 migration; scaffolding assumes v2), then resume once `sdd-state` reports v2. `READINESS=not-ready`
      → do NOT stop: read & embody `ai/directives/sdd-v2/readiness.directive.xml` (the live setup flow — it
      forces the missing scripts, writes TODO stubs where a tool is not yet chosen, and hands proxy-blocked
      installs to the operator without looping), then resume scaffolding once `sdd-state` reports ready.
      Only a v2 repo proceeds.
    </Step>
    <Step id="EMBODY">
      You ARE the scaffold directive now. Mode (initial / extend-dag) auto-detects from existing tickets.
      Input is the approved `specs/` tree; converge it into tickets, surfacing only the two operator gates
      (the breakdown and the test plan).
    </Step>
  </ExecutionPlan>
</SddDoor>
