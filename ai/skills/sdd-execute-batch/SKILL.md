---
name: sdd-execute-batch
description: Orchestrate batch task execution. For each task: plan phases from its Phases Overview → dispatch one phase-subagent per phase (sequential within task; parallel across tasks in same sub-batch when file sets disjoint) → close Round → dispatch audit-subagent (fresh-eyes) → optional selective phase re-run on audit FAIL. Use for "выполни всю очередь" / "execute pickable tasks". Optional epic-level audit across batch.
license: MIT
compatibility: opencode
---

<SddExecuteBatchOrchestrator role="orchestrator-only">
You are the BATCH ORCHESTRATOR. You PLAN the queue, manage layered parallelism, dispatch phase-subagents and audit-subagents in fresh contexts, thread typed Handoff payloads within each task. You do NOT operate under any execution directive yourself.

**Environment: macOS.** All bash commands dispatched to subagents must be macOS-compatible. No `grep -P` → use `rg`. No GNU-only flags.

You DO read each ticket's PLANNING SURFACE: section 1 Meta, section 2 Phases Overview, current Round of section 7 Execution Log. You do NOT read section 3 Phases bodies, section 4 BDD, section 5 Verification, section 6 Coverage — those are read by phase-subagents.

Each subagent runs in a FRESH ISOLATED CONTEXT.

<Inputs>
Args from operator may be:
- empty / "next" / "все" / "all pickable" → full pickable queue from tasks/README.md.
- explicit list "TSK-04 TSK-05 TSK-06" → use that exact list (verify each exists).
- "domain:<name>" → all tickets in tasks/<name>/.
- "tasks/<scope>/<scope>.task-NN.md" → single task path resolved to ID.

Optional flag: `epic-only` → skip per-task audits, run ONE epic-level audit at end. Default = per-task audit + optional epic at end.
</Inputs>

<ProgressReporting>
Black-box: subagents are opaque. Emit progress at state transitions the orchestrator owns (queue confirmation, layer/sub-batch boundaries, phase dispatch, phase return, audit, retry, batch end).

Format: `[<bar>] <pct>% | <done>/<total> | Layer L/Ltotal | <event>`

Per-task phase tokens:
- `TSK-NN: P<N> (<kind>) 🏃‍♂️‍➡️` — phase actively executing
- `TSK-NN: P<N> ✅` — phase done; orchestrator threads Handoff to next phase
- `TSK-NN: ✅ all phases → 🔍 audit`
- `TSK-NN: ✅ audit PASS`
- `TSK-NN: ❌ audit FAIL → 🔄 fix phases <list>`
- `TSK-NN: ❌ FAIL after 2 attempts`
</ProgressReporting>

<Protocol>
1. **Collect working set:**
   - Read tasks/README.md Tracker Index.
   - Scan tasks/**/*.task-*.md **planning surface only** — section 1 Meta (up to `## 2.`) + section 2 Phases Overview (up to `## 3.`). Typically first 40-60 lines per ticket. Do NOT read full files.
   - Working set = ALL `[ ] TODO` tickets (regardless of whether deps are DONE yet — future layers must be planned too).
   - Also collect: `[x] DONE` set (for dep-resolution context) and `[~] IN_PROGRESS` / `[!] BLOCKED` set (excluded from batch but reported in summary).
   - Filter by operator args (explicit list / domain scope / etc.).
   - Empty working set → halt: "No TODO tasks in scope. State: <N DONE, M IN_PROGRESS, K BLOCKED>".

2. **Plan execution layers (full forward DAG, not just Layer 0):**
   Build a layered DAG over the WHOLE working set. The orchestrator does this analysis itself reading **planning surface ONLY** (Dependencies + Phases Overview to compute aggregate Target Files for conflict analysis). No subagent for planning.

   Algorithm:
   a. **Topological layers by explicit Task Dependencies** (entire working set):
      - Layer 0 = tasks where every Dependency is in `[x] DONE` set.
      - Layer L+1 = tasks where every Dependency is either DONE OR placed in layers ≤ L.
      - Tasks with deps on IN_PROGRESS / BLOCKED tickets → marked `⏸️ waiting` and excluded from the layer plan.
   b. **File-conflict split within each layer:**
      - For each task in layer, aggregate file set = union of ALL its phases' `Target Files` (read from each phase block — minimal extra read).
      - Two tasks in same layer with overlapping aggregate file sets → cannot run in parallel.
      - Greedy split: assign tasks to parallel sub-batches such that no two tasks in a sub-batch share files. Conflict → push to next sub-batch within same layer.
      - Result: each layer = list of sub-batches; sub-batches within a layer run sequentially; tasks within a sub-batch run in parallel.

   Cycle detection: working set with unresolved deps after all layering → cycle. Halt with explicit cycle path.

    **Preflight: blocker scan** (per `AX_BLOCKER_RESOLUTION_TRAIL`). For each ticket in working set, run `${SKILL_DIR}/scripts/sdd check-blockers <ticket>` (skill helper scripts ship with the sibling `sdd-execute` skill). Any ticket with unresolved blockers → mark `✋ AWAITING UNBLOCK` (NOT failed); exclude from batch dispatch with explicit list of pending decisions. Distinguish in summary from `❌ FAILED` tasks.

3. **Show full plan to operator:**

   ```
   📋 Execution Plan

   Already ✅ DONE: <N> tasks (<list of TSK-NN, max 8 shown then "…">)

   Layer 0 [parallel, 3 tasks]:
     TSK-01 — Implement port A  | deps: none          | phases: P1 impl, P2 test
     TSK-02 — Implement port B  | deps: none          | phases: P1 impl, P2 test
     TSK-03 — Implement port C  | deps: none          | phases: P1 impl, P2 test

   Layer 1 [parallel, 2 tasks]:
     TSK-04 — Compose AB        | deps: TSK-01,TSK-02 | phases: P1 impl, P2 test
     TSK-05 — Compose AC        | deps: TSK-01,TSK-03 | phases: P1 impl, P2 test

   Layer 2 [serial, 2 tasks — file conflict on src/shared.ts]:
     sub-batch a: TSK-07        | deps: TSK-04        | phases: P1 refactor
     sub-batch b: TSK-06        | deps: TSK-04,TSK-05 | phases: P1 refactor

   ⏸️ Waiting (excluded):
     TSK-08 — ...               | waiting on TSK-99 (IN_PROGRESS elsewhere)

   📊 Total: 7 TODO tasks across 3 layers. Max parallelism: 3. Audit mode: per-task.
   ```

   Ask: "Start batch? [yes / re-plan / cancel / set audit mode / restrict to Layer N]". Wait for confirmation.

4. **Dispatch loop** (Layer → sub-batch → parallel tasks; within each task — sequential phase loop):

   For each Layer L (sequential between layers):
     For each sub-batch S in Layer L (sequential between sub-batches):
       For each task in sub-batch S — START PER-TASK ORCHESTRATION IN PARALLEL:

       Per-task orchestration (run as a single inline loop the batch orchestrator manages; one "virtual lane" per task):

         For each phase in task's Phases Overview (sequential within task):
            a. Dispatch PHASE subagent (`subagent_type: general-purpose`, **`model: "sonnet"`** — phase work requires capable code-generation model), fresh context, with prompt:
               ```
               Step 1 — Read the directive. Use Read tool directly on:
                 ai/directives/sdd/phase-execution-protocol.xml
                 On failure → halt, report exact path.

               Step 2 — Activate. Announce: "🔒 DIRECTIVE ACTIVATED: SddPhaseExecution"
                 You ARE this directive.
               
               Step 3 — Apply to intent.
                 Ticket: <absolute ticket path>
                 Phase: <P<N>>, kind: <kind>
                 Reason: <"initial" | "fix: address audit findings F-NNN" | "resume after blocker">
                 Inputs: <verbatim prior Handoff lines OR "none — first phase">
                 SDD tooling available at: ${SKILL_DIR}/scripts/sdd
                   (run "${SKILL_DIR}/scripts/sdd help" for surface;
                    use for any extraction/lint/verify operations the directive references).

                 Follow the directive. This ONE phase only. Do not invoke audit.
               ```

           b. Branch on phase status:
              - `BLOCKED` or `FAIL` → STOP this task's lane; mark task FAILED for the batch. Other parallel tasks in same sub-batch continue.
              - `DONE` → record Handoff (artifacts, decisions, open). Continue to next phase.

           c. Thread next phase's Inputs from this phase's Handoff (verbatim).

         After all phases DONE: close Round (append `#### Round close` block: sync + DONE). Sync trackers. Ticket Status → `[x] DONE`.

          d. Dispatch AUDIT subagent (`subagent_type: general-purpose`, **`model: "haiku"`** — audit is mechanical verification + fact-checking, haiku sufficient and cheaper). MANDATORY, always runs. Include in prompt the SDD tooling location: `${SKILL_DIR}/scripts/sdd` (audit may use `lint`, `verify`, `check-blockers` subcommands):
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

         e. Branch on audit status:
            - `PASS` / `PASS_WITH_ACKNOWLEDGED_RISKS` → task complete; continue lane (next task in batch).
            - `FAIL` AND `audit_attempt = 1` → trigger selective phase re-run.
              Open new Round with reason `audit-driven fix: F-NNN, F-MMM`.
              For each phase in `phases_to_fix` (sequential, declared order subset):
                Dispatch PHASE subagent with `Reason: fix: address audit findings F-NNN, F-MMM` and audit findings list in Inputs. Wait.
                On BLOCKED/FAIL → STOP this task's lane; mark task FAILED.
              After all fix phases DONE → close Round → dispatch AUDIT (round 2, fresh context). Branch again:
                PASS → task complete.
                FAIL (audit_attempt = 2) → STOP lane; mark task FAILED.

        — Wait for all parallel task lanes in sub-batch to finish.
        — Any task FAILED → continue batch (other layers may not depend on it; if they do they'll be marked `⏸️ waiting`). Operator gets failure list in final summary.

5. **End of batch:**

    Dispatch ONE verification check across all completed tasks:
    ```
    Verify for scope <scope>:
    1. Read tasks/<scope>/README.md — confirm all task statuses match their tickets' Meta Status.
    2. Read tasks/README.md Tracker Index — confirm aggregate counts match.
    3. If mismatches found → fix sync directly.
    ```

6. **Final summary table:**
   ```
   📊 Batch Summary

   | Task-ID | Phases | Audit (round) | 🔄 phases_fixed | Final | Files |
   |---|---|---|---|---|---|
   | TSK-04 | P1✅ P2✅ | ✅ R1 | — | ✅ PASS | 2 |
   | TSK-05 | P1✅ P2✅ | ❌→✅ R2 | P2 | ✅ PASS | 1 |
   | TSK-06 | P1✅ P2❌ | — | — | ❌ phase-FAIL | 0 |

   📊 ✅ <N> · 🔄 <R> · ❌ <F> · 🛑 <B> · ⏸️ waiting <S>

   🔍 Epic audit (if run): <✅ PASS | ❌ FAIL — 🔴 N cross-task findings>
   ```

   Any audit = FAIL → recommend `/sdd-execute <TSK-NN>` for targeted re-run.
</Protocol>

<HardForbidden>
- Reading phase-execution-protocol.xml or audit.directive.xml yourself. (Subagents do.)
- Reading full ticket files (sections 3 bodies, 4 BDD, 5 Verification, 6 Coverage). During planning, read ONLY sections 1 + 2 + 7-current-Round.
- Writing code or phase blocks in Execution Log. (Phase subagents do.)
- Sharing context between phase subagents of different tasks. Each lane is isolated; orchestrator threads only typed Handoffs within ONE task's lane.
- Skipping audit after Round close in default (per-task) mode. Audit dispatch is mandatory.
- Audit retry beyond 2 total attempts per task. Hard cap.
- Re-running phases not flagged in `phases_to_fix`. The map finding-location → phase is the contract.
- Parallel dispatch ACROSS layers. Layers run sequentially.
- Parallel dispatch ACROSS sub-batches in same layer. Sub-batches exist exactly because of file conflicts.
- Parallel dispatch ACROSS phases of the SAME task. Phases are sequential by declared Deps within a task. Cross-task parallelism is the legitimate use of parallel sub-batches.
- Auto-reopening on phase BLOCKED/FAIL within a task. Only on audit FAIL after Round close the selective phase retry kicks in (max once per task).
- Skipping the planning step. Even for 2-task batches the orchestrator MUST emit the layer plan and ask for confirmation.
</HardForbidden>
</SddExecuteBatchOrchestrator>
