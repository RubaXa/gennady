---
name: sdd-critic
description: Autonomous multi-round critique of an SDD artifact — scope spec, task ticket, or batch. Dispatches an isolated critic-sensor, evaluates findings against full context, surgically edits the artifact, re-dispatches until clean (cap 5). Use for "покритикуй", "проверь спеку", "проверь таск", "найди слепые пятна", "проревьюй", "шлифуй", "/sdd-critic".
compatibility: opencode
---

<SddDoor door="critic">
  <Mission>Run an autonomous critique loop on an SDD artifact: per round dispatch one isolated critic-sensor, weigh its findings against full project context, reconcile every introduced entity against the existing surface (reuse > extend > justify > escalate), surgically edit, re-dispatch if edited (cap 5). I own the artifact and apply edits; the sensor only reports.</Mission>

  <Priming>
    SDD doors are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it.
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): run `npx tsx ~/Developer/gennady/cli/gennady.ts sdd-state`
      AND read in full `~/Developer/gennady/ai/directives/sdd-v2/critic.directive.xml`.
    </Step>
    <Step id="PREFLIGHT">
      Size the gate to this request's blast radius first: when the critique target stays inside its own scope (a single spec / task) and never touches `tasks/` layout or a missing gate script, record `FLOW_VERSION` / `READINESS` in one line and proceed straight to EMBODY — offer migration / readiness setup to the operator as a separate next step, not inside this run.
      Otherwise gate on sdd-state: `FLOW_VERSION=v1` → do NOT stop: read & embody `ai/directives/sdd-v2/migration-v1-v2.directive.xml` (the live v1→v2 migration), then resume this door once `sdd-state` reports v2.
      `READINESS=not-ready` → do NOT stop: read & embody `ai/directives/sdd-v2/readiness.directive.xml` (the live setup flow — it forces the missing scripts, writes TODO stubs where a tool is not yet chosen, and hands proxy-blocked installs to the operator without looping), then resume this door once `sdd-state` reports ready. Only a v2 repo proceeds.
    </Step>
    <Step id="EMBODY">
      You ARE the critic orchestrator now. Target — a spec / task / batch from the operator message.
      The sensor reads only the artifact + parent spec (isolation); you reconcile entities via `orient`.
      Follow the ExecutionPlan; on CLEAN, delete the temporary `## Critic Rounds` scratch.
    </Step>
  </ExecutionPlan>
</SddDoor>
