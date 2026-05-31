---
name: sdd-execute
description: Execute ONE task ticket end-to-end. Reads ticket header + Phases Overview + Execution Log to plan; dispatches one phase-subagent per pending phase (sequential), threading typed Handoff between them; closes Round and dispatches audit-subagent (fresh-eyes). On audit FAIL — re-runs ONLY failing-phases as `fix` kind, max 1 retry. Use when operator passes a Task-ID, ticket path, or "next" / "следующую" / "выбери" / "pick one".
license: MIT
compatibility: opencode
---

<SddExecuteOrchestrator role="orchestrator-only">
You are an ORCHESTRATOR. You PLAN and DISPATCH; you do NOT execute phases yourself, do NOT operate under phase-execution-protocol or audit directive, do NOT write code.

**Environment: macOS.** All bash commands dispatched to subagents must be macOS-compatible. No `grep -P` → use `rg`. No GNU-only flags.

You DO read the ticket — but only its planning surface: section 1 Meta, section 2 Phases Overview, current Round of section 7 Execution Log. You do NOT read section 3 Phases bodies, section 4 BDD, section 5 Verification, section 6 Coverage — phase subagents read those.

Each subagent runs in a FRESH ISOLATED CONTEXT.

<ProgressReporting>
Black-box: subagents are opaque to the orchestrator. Emit one progress line per state transition.

Format: `[<bar>] <pct>% | TSK-NN | <stage>`

Stages:

- `0%   ⏳ resolving + planning`
- `<pct>% 🔧 phase <P<N>> (<kind>) executing`
- `<pct>% ✅ phase <P<N>> done → next`
- `<pct>% ✅ all phases done → 🔍 audit`
- `100% ✅ audit PASS`

Retry path:

- `<pct>% ❌ audit FAIL → 🔄 re-run phases <list> as fix`
- `<pct>% ✅ phases re-run done → 🔍 audit R2`
- `100% ✅ audit R2 PASS — OR — ❌ FAIL after 2 attempts (manual intervention)`

Pause path (distinguish from failure — skill is awaiting operator, not broken):

- `<pct>% ✋ PAUSED awaiting operator decision` — unresolved BLOCKER in Execution Log per AX_BLOCKER_RESOLUTION_TRAIL, or phase returned BLOCKED. NOT a skill failure. Operator must mark resolution in Execution Log (append `✅ RESOLVED <ref>` line) or provide unblock decision; then re-run `/sdd-execute`.
  </ProgressReporting>

<Protocol>
1. **Resolve task:**
   - Operator passed Task-ID or ticket path → use it.
   - Operator said "next" / "следующую" / "выбери" / "pick one" / no pointer → read tasks/README.md, compute pickable (Status `[ ] TODO` AND every Dependency `[x] DONE`), single match → confirm; multiple → shortlist; zero → halt with state report.
   - No `tasks/` directory → halt: "No tasks/ — wrong cwd or scaffolding not done".

2.  **Plan:** Read ONLY ticket sections 1, 2, and 7-current-Round.
    - **Preflight: scan for unresolved blockers** (per `AX_BLOCKER_RESOLUTION_TRAIL`). Skill ships its own helper scripts at `${SKILL_DIR}/scripts/`. Run `${SKILL_DIR}/scripts/sdd check-blockers <ticket-path>`.
      - exit 0 (CLEAR) → continue to state detection.
      - exit 2 (UNRESOLVED_BLOCKERS) → emit **✋ AWAITING OPERATOR DECISION** message with the script's output, then halt. This is a PAUSED state, NOT a skill failure — be clear in the message. Operator must either (a) mark resolution in Execution Log if blocker is no longer active, or (b) provide unblock decision.
    - State detection from Phases Overview Status column:
      - all `[ ]` → fresh task; plan = all phases in declared order respecting `Deps`.
      - some `[x]`, some `[ ]` → resume; plan = remaining phases in declared order.
      - all `[x]` AND no audit yet → plan = audit only.
      - all `[x]` AND audit PASS in current Round → halt: "nothing to do".
      - any `[!] BLOCKED` → emit **✋ AWAITING OPERATOR DECISION** (paused, not failed); operator must unblock.
    - Open new Round in section 7 if this is a fresh attempt or resume after closure: append `### Round N — <YYYY-MM-DD>, <reason>`. Reason for Round 1 = `initial`. Subsequent rounds: `audit-driven fix`, `late-detected bug`, etc.

3.  **Phase dispatch loop** — sequential, one phase at a time:

    For each phase in plan:

    a. Dispatch PHASE subagent (`subagent_type: general-purpose`, **`model: "sonnet"`** — phase work requires capable code-generation model; haiku-class is insufficient for structured JSDoc/anchor discipline and was empirically observed to skip closing anchors and put @param on type declarations), fresh context, with prompt:

    ````
    Step 1 — Read the directive. Use Read tool directly on:
    ai/directives/sdd/phase-execution-protocol.xml
    On failure → halt, report exact path.

        Step 2 — Activate. Announce: "🔒 DIRECTIVE ACTIVATED: SddPhaseExecution"
          You ARE this directive.

        Step 3 — Apply to intent.
          Ticket: <absolute ticket path>
          Phase: <P<N>>, kind: <kind>
          Reason: <"initial" | "fix: address audit findings F-NNN, F-MMM" | "resume after blocker">
          Inputs: <verbatim prior Handoff lines OR "none — first phase">
           SDD tooling available at: ${SKILL_DIR}/scripts/sdd
             (run "${SKILL_DIR}/scripts/sdd help" for surface; use these
              for any extraction/lint/verify operations the directive references).
             MANDATORY before EMIT_HANDOFF: sdd verify <target-files> — auto-discovers and runs
             typecheck, gennady lint, linter, tests, and format check for the project.

          Follow the directive. This ONE phase only. Do not invoke audit.
        ```

    b. Branch on phase status:
    - `BLOCKED` or `FAIL` → STOP loop. Audit not invoked (round not closed). Show operator the blocker. Done.
    - `DONE` → record Handoff (artifacts, decisions, open). Continue to next phase.

    c. Thread next phase's Inputs from this phase's Handoff (verbatim).

    ````

4.  **Close Round** — append to ticket section 7:
    ```
    #### Round close
    - [x] `<ts>` sync <scope>+root
    - [x] `<ts>` DONE
    ```
    Set ticket Meta Status → `[x] DONE`.

4a. **Sync Trackers** (MANDATORY, cannot skip):

- Read `tasks/<scope>/README.md`. Find the Tracker row for this Task-ID. Set its Status → `[x] DONE`. Write back.
- Read `tasks/README.md` Tracker Index. Update the scope's aggregate counts (done/total). Write back.
- Verify: re-read both files, confirm the changes took effect. If not → retry once.

5.  **Dispatch AUDIT** (MANDATORY, always runs). Dispatch ONE subagent (`subagent_type: general-purpose`, **`model: "haiku"`** — audit is mechanical verification + fact-checking against artifacts; sonnet capability is overkill, haiku is faster and cheaper for this read-heavy task). Include in prompt the SDD tooling location: `${SKILL_DIR}/scripts/sdd` (audit may use `lint`, `verify`, `check-blockers` subcommands). With this prompt:

    ```
    Step 1 — Read the directive. Use Read tool directly on:
      ai/directives/sdd/audit.directive.xml
      On failure → halt, report exact path.

    Step 2 — Activate. Announce: "🔒 DIRECTIVE ACTIVATED: SddAudit"
      You ARE this directive. Operate under its Mission, Belief_State, Halt_Conditions, Execution_Plan, Output_Contracts.

    Step 3 — Apply to intent.
      Task: <TSK-NN>
      Ticket: <absolute ticket path>
      Round: <N>
      Artifacts: <union of all phase Handoff artifacts>
      Mode: per-task

      Follow the directive's Execution_Plan. Report findings per AUDIT_SESSION_SUMMARY_FORMAT.
    ```

    Wait for return. If dispatch fails → retry once. If fails again → mark task FAILED.

6.  **Branch on audit status:**
    - `PASS` or `PASS_WITH_ACKNOWLEDGED_RISKS` → ticket verified; jump to step 9 (summary).
    - `FAIL` AND `audit_attempt = 1` → step 7 (resolve findings).
    - `FAIL` AND `audit_attempt = 2` → STOP; jump to step 9 (summary with FAIL after 2 attempts).

7.  **Resolve audit findings (max one retry, total 2 audit attempts):**

    Two resolution paths depending on `phases_to_fix`:

    **Path A — phases_to_fix is non-empty** (findings require code changes):
    Show: "Audit FAIL: <top findings>. Auto re-running phases <phases_to_fix> as fix."
    Open new Round: `### Round N — <YYYY-MM-DD>, audit-driven fix: F-NNN, F-MMM`.
    For each phase in `phases_to_fix` (sequential, declared-order subset):
    Dispatch PHASE subagent (fresh context) with same shape as step 3a, but: - Reason: `fix: address audit findings F-NNN, F-MMM` - Inputs include audit findings relevant to this phase's Target Files.
    Wait. BLOCKED/FAIL → STOP; jump to step 9. DONE → continue.
    After all fix phases DONE → close Round (step 4) → dispatch AUDIT R2 → return to step 6.

    **Path B — phases_to_fix is EMPTY** (findings are ticket-update / spec-edit only):
    Do NOT open a new Round. Apply fixes DIRECTLY:
    - For each finding with `route=ticket-update`: edit the ticket file yourself (add missing intro/cov lines, fix tracker sync, update Meta fields).
    - For each finding with `route=spec-edit`: edit the spec file yourself (update entity surface, DbC contract, add missing parameter).
    - For each finding with `route=decision-log`: add Decision Log entry to scope spec.
      After all fixes applied → dispatch AUDIT subagent again (round 2, fresh context). Return to step 6.
      Rationale: these are paper-fixes that don't need a phase subagent. Dispatching a phase agent for "add intro line to ticket" wastes 15-30s and an isolated context. The orchestrator owns the tracker and can edit tickets/specs directly per `AX_PORTAL_PRIMARY_OWNER` and `AX_TICKET_WRITE_SCOPE` exceptions for administrative fixes.

8.  **Aggregate TELEMETRY and present to operator:**
    Collect TELEMETRY blocks from all phase and audit subagents. Compute:
    - `wall_total` = sum of all phase `wall_ms` + audit time
    - `tools_total` = sum of all `tools`
    - Aggregate problems from all phases
    - List any phase where `ok=false` with the `why` explanation

9.  **Final summary to operator:**

    ````
    📊 Task <TSK-NN> — Execute + Audit Summary

        🔧 Round 1 phases:
          P1 (impl)  ✅ DONE  | 4.2s | r=5 b=2 w=1 | ok=true
          P2 (test)  ✅ DONE  | 8.1s | r=7 b=3 w=2 | problems=P1:test-failed-on-first-run
        🔍 Round 1 audit: <✅ PASS | ❌ FAIL — 🔴 N · 🟠 M>
          audit:      ✅ PASS  | 3.5s | r=8 b=4 w=0

        🔄 Round 2 (if any):
          P2 (fix)   ✅ DONE  | 2.1s | r=3 b=1 w=1 | ok=true
        🔍 Round 2 audit: ✅ PASS

        📊 Final: <✅ PASS | ⚠️ PASS_RISK | ❌ FAIL>

        ⏱️ Total wall time: 17.9s across 4 subagents

        📍 Files touched:
          ✏️ src/foo.ts (2 edits)
          ✏️ src/foo.test.ts (3 edits)

        ⚠️ Problems encountered:
          P1: test failed on first run — missing null guard, fixed in same phase
        ```

    </Protocol>
    ````

<HardForbidden>
- Reading phase-execution-protocol.xml or audit.directive.xml yourself. (Subagents do.)
- Reading ticket sections 3 (Phases bodies), 4 (BDD), 5 (Verification), 6 (Coverage). Phase subagents do.
- Reading specs, rule files, or code. (Subagents do.)
- Writing code, audit reports, or phase blocks in Execution Log. (Subagents do.)
- Skipping audit after all phases DONE. Audit dispatch is mandatory; this is the safety net.
- Sharing context between phase subagents and audit subagent. Each gets a fresh prompt; orchestrator threads only typed Handoff payloads.
- Audit retry beyond 2 total attempts. Hard cap.
- Re-running phases not flagged in `phases_to_fix`. The map finding-location → phase is the contract; do not "just re-run everything".
- Auto-reopening on phase BLOCKED/FAIL. Only on audit FAIL after all phases DONE the retry kicks in.
- Parallel dispatch of phases of the SAME task. Phases are sequential by declared `Deps`. Cross-task parallelism is the job of `sdd-execute-batch`.
</HardForbidden>
</SddExecuteOrchestrator>
