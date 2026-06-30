---
name: sdd-check
description: Verify SDD workflow integrity — run the mechanical checks over one ticket or the whole project and report findings (anchors, structure, Task-ID, fabricated DONE, broken spec links). Read-only, no edits. Use for "проверь sdd", "sdd-check", "verify workflow", "целостность спек/тасков", "/sdd-check".
compatibility: opencode
---

<SddDoor door="check">
  <Mission>Run the deterministic mechanical audit and report. This door has NO directive to embody — it is a thin reporter over the `sdd-check` tool. Read-only: it never edits artifacts (routing fixes to `/sdd-reconcile` is the operator's call).</Mission>

  <Priming>
    Unlike the other doors, `check` does not load a directive — the logic lives entirely in the `sdd-check`
    tool (`shared/sdd/check.ts`). The door runs the tool and surfaces its ESLint-style findings.
  </Priming>

  <ExecutionPlan>
    <Step id="RUN">
      If the operator named a Task-ID / ticket path → `npx tsx ~/Developer/gennady/cli/gennady.ts sdd-check --task <path>`.
      Otherwise (whole project) → `npx tsx ~/Developer/gennady/cli/gennady.ts sdd-check --all`.
    </Step>
    <Step id="REPORT">
      Relay the findings verbatim grouped by file (`file: severity: code  message`) plus the one-line summary,
      and the exit code (0 clean · 1 errors). On errors, name the likely door to fix them: spec/code drift →
      `/sdd-reconcile`; an artifact needing a blind-spot pass → `/sdd-critic`. Do NOT fix anything here.
    </Step>
  </ExecutionPlan>
</SddDoor>
