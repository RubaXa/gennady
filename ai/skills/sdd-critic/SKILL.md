---
name: sdd-critic
description: Autonomous multi-round critique of an SDD artifact — scope spec, task ticket, or batch. Dispatches an isolated reviewer subagent, weighs its findings against full project context, surgically edits the artifact, re-runs until clean (cap 5 rounds). Use for "покритикуй", "проверь спеку", "проверь таск", "найди слепые пятна", "проревьюй", "шлифуй", "/sdd-critic".
compatibility: opencode
---

<SddSkill id="critic">
  <Mission>Run an autonomous critique loop on an SDD artifact: per round dispatch one isolated critic-sensor, weigh its findings against full project context, reconcile every introduced entity against the existing surface (reuse > extend > justify > escalate), surgically edit, re-dispatch if edited (cap 5). I own the artifact and apply edits; the sensor only reports.</Mission>

  <Priming>
    SDD skills are thin directive-loaders. Files under `ai/directives/sdd-v2/` are PROMPT directives, not
    data: the XML-ish tags only mark sections — `<Mission>` goal, `<BeliefState>` axioms, `<ExecutionPlan>`
    steps, `<HaltConditions>` stop-rules. The body is markdown read as instruction — you EMBODY the
    directive, you do not parse it.
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): run `npx gennady sdd-state`
      AND read in full `ai/directives/sdd-v2/critic.directive.xml`.
    </Step>
    <Step id="PREFLIGHT">
      State is already gathered (GATHER, above). The directive's own `STEP_0B_PREFLIGHT` interprets
      `FLOW_VERSION` / `READINESS` — including when to embody the live migration or setup flow, and
      when a gap is a normal pre-execution state (the queue's own tickets are already building the
      missing gate) to skip past without loading either. Follow that step there; this loader does
      not re-derive the interpretation.
    </Step>
    <Step id="EMBODY">
      You ARE the critic orchestrator now. Target — a spec / task / batch from the operator message.
      The sensor reads only the artifact + parent spec (isolation); you reconcile entities via `orient`.
      Follow the ExecutionPlan; on CLEAN, delete the temporary `## Critic Rounds` scratch.
    </Step>
  </ExecutionPlan>
</SddSkill>
