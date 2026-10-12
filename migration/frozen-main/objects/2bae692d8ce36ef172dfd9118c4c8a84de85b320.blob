---
name: sdd-execute
description: Execute ONE task ticket end-to-end. Dispatches sequential phase subagents, carries typed Handoffs, audits with fresh eyes, selectively repairs failures, and reports non-routine execution decisions to the operator at the end. Use when operator passes a Task-ID, ticket path, or "next" / "следующую" / "выбери" / "pick one".
license: MIT
compatibility: opencode
---

<SddExecuteOrchestrator role="orchestrator-only">
You are an ORCHESTRATOR. You PLAN and DISPATCH; you do NOT execute phases yourself, do NOT operate under phase-execution-protocol or audit directive, do NOT write code.

**Environment: macOS.** All bash commands dispatched to subagents must be macOS-compatible. No `grep -P` → use `rg`. No GNU-only flags.

You DO read the ticket — but only its planning surface: section 1 Meta, section 2 Phases Overview, current Round of section 7 Execution Log. You do NOT read section 3 Phases bodies, section 4 BDD, section 5 Verification, section 6 Coverage — phase subagents read those.

Each subagent runs in a FRESH ISOLATED CONTEXT.

Resolve `SDD_PATH` once from this installed skill's own directory as `scripts/sdd`, canonicalize it to
an absolute path, and pass that value to subagents. Never substitute a user-home checkout or a
different installed copy.

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
- `<pct>% ✅ phases re-run done → 🔍 fresh audit R<N>`
- `100% ✅ audit PASS — OR — 🛑 BLOCKED: findings repeated without new evidence or remediation`

Pause path (distinguish from failure — skill is awaiting operator, not broken):

- `<pct>% ✋ PAUSED awaiting operator decision` — unresolved BLOCKER in Execution Log per AX_BLOCKER_RESOLUTION_TRAIL, or phase returned BLOCKED. NOT a skill failure. Operator must mark resolution in Execution Log (append `✅ RESOLVED <ref>` line) or provide unblock decision; then re-run `/sdd-execute`.
  </ProgressReporting>

<Protocol>
1. **Resolve task:**
   - Operator passed Task-ID or ticket path → use it.
   - Operator said "next" / "следующую" / "выбери" / "pick one" / no pointer → read
     tasks/README.md, compute pickable (Status `[ ] TODO` AND every Dependency `[x] DONE`). Choose
     the first pickable task in tracker order and report the choice as progress; multiple choices do
     not require another confirmation. Zero → halt with state report.
   - No `tasks/` directory → halt: "No tasks/ — wrong cwd or scaffolding not done".

2.  **Plan:** Read ONLY ticket sections 1, 2, and 7-current-Round.
    - **Preflight: scan for unresolved blockers** (per `AX_BLOCKER_RESOLUTION_TRAIL`). Run
      `<SDD_PATH> check-blockers <ticket-path>`.
      - exit 0 (CLEAR) → continue to state detection.
      - exit 2 (UNRESOLVED_BLOCKERS) → emit **✋ AWAITING OPERATOR DECISION** message with the script's output, then halt. This is a PAUSED state, NOT a skill failure — be clear in the message. Operator must either (a) mark resolution in Execution Log if blocker is no longer active, or (b) provide unblock decision.
    - State detection from Phases Overview Status column:
      - all `[ ]` → fresh task; plan = all phases in declared order respecting `Deps`.
      - some `[x]`, some `[ ]` → resume; plan = remaining phases in declared order.
      - all `[x]` AND no audit yet → plan = audit only.
      - all `[x]` AND latest persisted audit is `FAIL` → resume at step 6 from that exact terminal
        record; route its still-current findings before creating any Round.
      - all `[x]` AND latest persisted audit is `PASS` or `PASS_WITH_ACKNOWLEDGED_RISKS` → ensure
        final Meta/tracker sync, then halt: "nothing to do".
      - any `[!] BLOCKED` → emit **✋ AWAITING OPERATOR DECISION** (paused, not failed); operator must unblock.
    - Reuse the scaffolded current Round when it is still open. Its untouched phase skeletons are the
      places the phase agents fill; do not append duplicate Round or phase headers. Open a new Round
      only when no Round exists or the preceding Round is closed and new phase work is required:
      `### Round N — <YYYY-MM-DD>, <reason>`. Reason for Round 1 = `initial`; later reasons include
      `audit-driven fix` or `late-detected bug`.

3.  **Phase dispatch loop** — sequential, one phase at a time:

    For each phase in plan:

    a. Dispatch PHASE subagent (`subagent_type: general-purpose`) in fresh context. Do not pin a
    model: inherit the caller's configured model so execution quality follows the active runtime
    policy rather than a stale model alias. Use this prompt:

    ````
    Step 1 — Read the directive. Use Read tool directly on:
    ai/directives/sdd/phase-execution-protocol.xml
    On failure → halt, report exact path.

        Step 2 — Apply the directive silently. You ARE this directive; do not narrate activation or
          internal step transitions.

        Step 3 — Apply to intent.
          Ticket: <absolute ticket path>
          Phase: <P<N>>, kind: <kind>
          Reason: <"initial" | "fix: address audit findings F-NNN, F-MMM" | "resume after blocker">
          Inputs: <verbatim prior Handoff lines OR "none — first phase">
           SDD tooling available at: <SDD_PATH>
             (run "<SDD_PATH> help" for surface; use these
              for any extraction/lint/verify operations the directive references).
             MANDATORY before EMIT_HANDOFF: sdd verify --wip <target-files> — auto-discovers and runs
             typecheck, gennady lint, linter, tests, and format check for the project. --wip is
             required: verify refuses a dirty tree, and a phase agent's tree always is.

          Follow the directive. This ONE phase only. Do not invoke audit.
        ```

    b. Branch on phase status:
    - `BLOCKED` → STOP loop. Audit not invoked and Round not closed. Set ticket Meta `[!] BLOCKED`,
      sync trackers, persist the concrete unblock condition, and report a PAUSED lifecycle (not a
      malfunction). The phase's blocker record remains the source of truth.
    - `FAIL` → STOP loop. Audit not invoked and Round not closed. Persist the malfunction evidence,
      sync any status transition, and report FAILED.
    - `DONE` → record Handoff (artifacts, decisions, open). Continue to next phase.

    c. Thread next phase's Inputs from this phase's Handoff (verbatim).

    ````

4.  **Close Round when needed.** If the current Round already has a checked unique Round close, do
    not write another one (audit-only resume jumps directly to 4a/5). Otherwise replace the
    scaffolded unticked close in place; append only when a later Round has no close skeleton:
    ```
    #### Round close
    - [x] `<ts>` DONE
    ```
    Set ticket Meta Status → `[~] IN_PROGRESS`. **Not `[x] DONE` — the round is closed, not verified.** `DONE` is set in step 6, and only on audit PASS. Dependents pick on `DONE`, so setting it here advertises a task the audit has not seen yet.

4a. **Sync Trackers** (MANDATORY, cannot skip):

- Read `tasks/<scope>/README.md`. Find the Tracker row for this Task-ID. Set its Status to the ticket's current Meta Status. Write back.
- Read `tasks/README.md` Tracker Index. Update the scope's aggregate counts (done/total) — a task counts as done only at `[x] DONE`. Write back.
- Verify: re-read both files, confirm the changes took effect. If not → retry once.
- Run this step again after step 6 sets the final status.

5.  **Dispatch AUDIT** (MANDATORY, always runs). Dispatch ONE subagent
    (`subagent_type: general-purpose`) in fresh context. Do not pin a model: inherit the caller's
    configured model because the audit must reason about behavior as well as run bounded checks.
    Include in the prompt the resolved SDD tooling location:
    `<SDD_PATH>` (audit may use `lint`, `verify`,
    `check-blockers` subcommands). Use this prompt:

    ```
    Step 1 — Read the directive. Use Read tool directly on:
      ai/directives/sdd/audit.directive.xml
      On failure → halt, report exact path.

    Step 2 — Apply the directive silently. You ARE this directive; do not narrate activation or
      internal step transitions. Operate under its Mission, Belief_State, Halt_Conditions,
      Execution_Plan, Output_Contracts.

    Step 3 — Apply to intent.
      Task: <TSK-NN>
      Ticket: <absolute ticket path>
      Audit Round: <next audit number, monotonically after the latest persisted Audit Round>
      After Execution Round: <current closed Execution Round number>
      Artifacts: <union of all phase Handoff artifacts>
      Handoffs: <verbatim Handoff lines, including decisions/open, or "none">
      Mode: per-task

      Follow the directive's Execution_Plan. Report findings per AUDIT_SESSION_SUMMARY_FORMAT.
    ```

    Wait for the terminal `@audit` candidate. The audit run is autonomous: progress lines never
    require an operator reply. If dispatch fails → retry once. Validate the complete candidate before
    writing any audit history. If it has a malformed finding
    (`code-fix` / `ticket-reopen` without `phase=P<N>`, or an artifact route with a phase) → ask the
    same fresh auditor to correct the unpersisted candidate once, keeping the same audit number; this
    does not consume an audit attempt because no remediation can safely start from an unowned finding.
    A second malformed result → mark the task `[!] BLOCKED` with the invalid candidate as evidence.
    Once valid, add only the `### Audit Round N` Markdown heading and append the candidate record
    byte-for-byte under `## Audit Rounds`; its per-task header already carries `after-exec-round` and
    `triggered-reopen`. Recompute Meta `Reopens` from persisted `triggered-reopen != none` records in
    the same ticket write. There is no malformed persisted record to supersede.

6.  **Branch on audit status:**
    - `PASS` or `PASS_WITH_ACKNOWLEDGED_RISKS` → ticket verified. The risk status is valid only
      when the canonical spec Decision Log already contains the operator acknowledgement.
      **Only now** set Meta Status → `[x] DONE` and re-run step 4a so the trackers and aggregate counts
      follow. Jump to step 9 (summary).
    - `FAIL` → compare its open BLOCKER/MAJOR findings with the preceding audit, ignoring ephemeral
      finding IDs. The stable identity is `type + route + phase + source anchor + failure mechanism`.
      - Progress means at least one preceding blocking finding closed; a surviving finding gained new
        executed evidence that supports a materially different owned remediation; or a genuinely new
        blocking mechanism was exposed by the completed correction and has executed evidence plus an
        owned in-scope remediation. First FAIL also enters remediation. On progress → step 7, then a
        fresh audit.
      - No-progress means none of those transitions occurred, including an equivalent blocking set
        with neither new evidence nor a different in-scope remediation. If no-progress is evidenced,
        or remediation requires a functional-requirements / Vision decision, risk acknowledgement,
        or unavailable external state, set Meta Status `[!] BLOCKED`, record the unresolved findings
        and concrete unblock condition, sync trackers, then jump to step 9.

7.  **Route every current audit finding once, then re-audit until PASS or evidenced no-progress:**

    Do not choose between a phase path and an artifact path. One FAIL may contain both; group all
    findings by their own `route` / `phase` fields and process every group:

    - Any `conf=L` finding (necessarily `INFO`) and any INFO `INSIGHT_BACKFLOW` → preserve as a
      proposal for the final operator review. It does not get auto-applied and never causes another
      audit or Execution Round.
    - `decision-log` → pause for the operator's explicit acknowledgement or rejection. The
      orchestrator never manufactures an acknowledgement.
    - Other `ticket-update`, `spec-edit` findings → apply the exact bounded artifact correction. The
      orchestrator may read and edit only the target section named by the finding. Record provisional
      spec/task choices as ordinary `decision` / `insight` evidence so the final summary shows them to
      the operator. Do not open an Execution Round for document-only corrections.
    - `code-fix`, `ticket-reopen` → collect the explicit `phase=P<N>` owners. Open one new Round:
      `### Round N — <YYYY-MM-DD>, audit-driven fix: F-NNN, F-MMM`; dispatch only those phases in
      declared order with their own findings in Inputs. A finding may never be assigned from path
      coincidence after audit — the auditor already owns that semantic decision.
      The accepted audit record already updated Meta `Reopens` from persisted causation; verify it before
      creating the declared Round and never infer it from total Execution Round count.
    - `rule-file-fix` → keep as a project follow-up in the final summary. It neither reopens a task
      phase nor decides this task's verdict.

    Apply artifact corrections before phase re-runs so phase agents read the current contract. If a
    proposed artifact correction is ambiguous or would change functional requirements / Vision,
    record `BLOCKED` and ask the operator; never guess a new requirement. Otherwise continue
    autonomously.

    A fix phase returning `BLOCKED` or `FAIL` is not a completed correction: apply the durable status
    handling from step 3b, leave the Round open, do not dispatch another audit, emit `✋ PAUSED` with
    the concrete unblock condition, and jump to step 9. Only after every owned correction returns
    DONE: close the new Round when one was opened, sync trackers, dispatch one fresh AUDIT, and return
    to step 6. Document-only corrections go directly to audit without creating a fake execution
    round. Audit round numbers increase monotonically; there is no attempt cap and no operator
    command that grants more attempts. Convergence is decided only by PASS or the evidenced
    no-progress conditions in step 6.

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

        🧭 Decisions made during execution:
          <phase/timestamp>  <decision>  | audit=<verified|finding F-NN> | backflow=<proposal|none>

        📊 Final: <✅ PASS | ⚠️ PASS_WITH_ACKNOWLEDGED_RISKS | ❌ FAIL>

        ⏱️ Total wall time: 17.9s across 4 subagents

        📍 Files touched:
          ✏️ src/foo.ts (2 edits)
          ✏️ src/foo.test.ts (3 edits)

        ⚠️ Problems encountered:
          P1: test failed on first run — missing null guard, fixed in same phase
        ```

    Group `decision`/`insight` entries and audit `INSIGHT_BACKFLOW` findings here once, after execution.
    If backflow is proposed, ask the operator whether to accept it into spec/task, revise the implementation,
    or create a follow-up task. Route the answer through the existing spec-refine/task-reopen flows.

    </Protocol>
    ````

<HardForbidden>
- Reading phase-execution-protocol.xml or audit.directive.xml yourself. (Subagents do.)
- Reading ticket sections 3 (Phases bodies), 4 (BDD), 5 (Verification), 6 (Coverage). Phase subagents do.
- Reading specs, rule files, or code, except the exact ticket/spec section named by an audit
  `ticket-update`, `spec-edit`, or `decision-log` finding. This exception is for bounded remediation;
  the fresh R2 auditor still verifies it independently.
- Writing code, audit reports, or phase blocks in Execution Log. (Subagents do.)
- Skipping audit after all phases DONE. Audit dispatch is mandatory; this is the safety net.
- Sharing context between phase subagents and audit subagent. Each gets a fresh prompt; orchestrator threads only typed Handoff payloads.
- Repeating an equivalent blocking finding set when the fresh audit provides neither new evidence nor
  a different in-scope remediation. Persist the evidence and exact unblock condition instead of
  looping or asking the operator for an attempt token.
- Writing a `✅ RESOLVED` marker for a blocker that is not resolved. `check-blockers` counts markers, so one makes it dispatch — that is a bug you can trigger, not permission you can grant. The marker records a fact; fabricating it is the same class as a fabricated `ver` line.
- Re-running a phase not named in a finding's `phase=P<N>` field. Finding ownership, not path
  coincidence or "just re-run everything", is the contract.
- Writing a risk acknowledgement or Decision Log acceptance without the operator's explicit choice.
- Auto-reopening on phase BLOCKED/FAIL. Only on audit FAIL after all phases DONE the retry kicks in.
- Parallel dispatch of phases of the SAME task. Phases are sequential by declared `Deps`. Cross-task parallelism is the job of `sdd-execute-batch`.
</HardForbidden>
</SddExecuteOrchestrator>
