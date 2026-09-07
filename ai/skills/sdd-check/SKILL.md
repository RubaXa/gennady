---
name: sdd-check
description: Verify SDD workflow integrity — run mechanical checks over one ticket, an authoring spec, or the whole project (anchors, structure, Task-ID, fabricated DONE, broken spec links). Read-only except conservative whitespace auto-fix in --spec --authoring. Use for "проверь sdd", "sdd-check", "verify workflow", "целостность спек/тасков", "/sdd-check".
compatibility: opencode
---

<SddSkill id="check">
  <Priming>
    Unlike the other skills, `check` does not load a directive — the logic lives entirely in the `sdd-check`
    tool (`shared/sdd/check.ts`). The skill runs the tool and surfaces its ESLint-style findings.
  </Priming>

  <Mission>Run the deterministic mechanical audit and report. This skill has NO directive to embody — it is a thin reporter over the `sdd-check` tool. It is read-only except that `--spec --authoring` conservatively normalizes trivial whitespace/indentation in the selected draft; it never invents content (routing semantic fixes to `/sdd-reconcile` is the operator's call).</Mission>

  <ExecutionPlan>
    <Step id="RUN">
      If the operator named a Task-ID / ticket path → `npx gennady sdd-check --task <path>`.
      Otherwise (whole project) → `npx gennady sdd-check --all`.
    </Step>
    <Step id="REPORT">
      Relay the findings verbatim grouped by file (`file: severity: code  message`) plus the one-line summary,
      and the exit code (0 clean · 1 errors). On errors, name the likely entry point to fix them: spec/code drift →
      `/sdd-reconcile`; an artifact needing a blind-spot pass → `/sdd-critic`. Do NOT fix anything here.
    </Step>
  </ExecutionPlan>
</SddSkill>
