---
name: sdd-execute-batch
description: Execute a dependency-aware queue by scheduling the canonical sdd-execute lifecycle for one task at a time. Resumes partial tasks, preserves fresh phase/audit contexts, continues unrelated work after a blocked lane, and never skips per-task audit. Use for "выполни всю очередь" / "execute pickable tasks".
license: MIT
compatibility: opencode
---

<SddExecuteBatchOrchestrator role="queue-scheduler-only">
You are the BATCH SCHEDULER. You resolve the requested queue and dispatch the canonical
`sdd-execute` lifecycle for one task at a time. You do not implement a second phase/audit state
machine here, do not execute phases, and do not audit.

Why serial lanes: every task currently shares one working tree. Parallel task lanes would mix their
git diff, verification output, ticket state, and tracker writes. Cross-task concurrency is allowed
only when the runtime provides isolated worktrees; this skill does not assume that capability.

Each dispatched task lifecycle runs in a FRESH ISOLATED CONTEXT. Its subagent must inherit the
caller's configured model. The lifecycle itself creates fresh phase and audit contexts.

<Inputs>
Operator arguments may be:
- empty / "next" / "все" / "all pickable" → every TODO or IN_PROGRESS task reachable from the
  selected tracker;
- an explicit Task-ID list → exactly those tasks, after resolving them;
- `domain:<name>` → TODO or IN_PROGRESS tasks under `tasks/<name>/`;
- one ticket path → that ticket.

An optional `epic-audit` requests an additional cross-task audit after every reachable task reaches a
terminal state. It never replaces each task's mandatory per-task audit.
</Inputs>

<ProgressReporting>
Report only scheduler-owned transitions:

`[<bar>] <pct>% | <done>/<total> | <Task-ID> | <queued|executing|DONE|BLOCKED|PAUSED|FAILED|waiting>`

Printing the plan is informational. The operator's invocation authorizes execution; do not ask for
another start confirmation.
</ProgressReporting>

<Protocol>
1. **Collect the queue.**
   - Read `tasks/README.md` and only each candidate ticket's planning surface: Meta, Phases Overview,
     and current Execution Round.
   - Include `[ ] TODO` and `[~] IN_PROGRESS`; the latter may be a phase resume or audit-only state.
   - Record `[x] DONE` for dependency resolution. Report `[!] BLOCKED` but do not dispatch it.
   - Resolve both legacy `TSK-NN` and prefixed `TSK-{PREFIX}-{NNN}` IDs. Ticket filenames are not an
     identity source; Meta Task-ID is.
   - If the filtered queue is empty, report the current counts and halt successfully.

2. **Build a dependency plan.**
   - A task is ready only when every declared Dependency is currently `[x] DONE`.
   - Preserve tracker order among equally ready tasks. Detect cycles in the selected queue and report
     the exact cycle as `waiting`; do not guess an order.
   - Show the ordered plan plus tasks currently waiting on dependencies, then start immediately.

3. **Run the adaptive queue.** Repeat until no selected task remains runnable:
   - Maintain an in-memory terminal registry for this batch invocation. Once a lane is classified
     DONE, BLOCKED, PAUSED, or FAILED, exclude it from further dispatch even if its on-disk Meta did
     not change. This registry is scheduler state, not an artifact write.
   - Refresh ticket statuses and dependencies from disk. This refresh, not the original plan, decides
     readiness after every lane.
   - Choose the first ready TODO or IN_PROGRESS task not present in the terminal registry.
   - Dispatch one fresh task-orchestrator subagent with this prompt:

     ```text
     Step 1 — Read the canonical task lifecycle from:
       ai/skills/sdd-execute/SKILL.md
       On failure: return FAILED with the exact path.

     Step 2 — Apply the directive silently. Do not narrate skill activation or internal step names.

     Step 3 — Execute this task to its lifecycle terminal state.
       Task: <Task-ID>
       Ticket: <absolute ticket path>

     The batch invocation already authorizes this task. Preserve all operator-decision and external-
     state pauses defined by the canonical lifecycle.
     ```

   - Do not pin a model. Wait for the lane's terminal result, then re-read its ticket Meta and
     trackers rather than trusting narrative output.
   - Classify:
     - `[x] DONE` → dependencies may become ready; continue;
     - `[!] BLOCKED` → persist as blocked and continue with unrelated ready tasks;
     - explicit operator/external-state pause while Meta remains IN_PROGRESS → `PAUSED`; continue with
       unrelated ready tasks;
     - dispatch/tool malfunction → `FAILED`; continue with unrelated ready tasks;
     - no durable state transition and no concrete pause/failure evidence → `FAILED` as a malformed
       lifecycle result.

4. **Quiescence.** When no task is ready:
   - refresh all selected statuses once more;
   - mark unfinished dependents `waiting` with the exact non-DONE dependency states;
   - distinguish a cycle, a blocked dependency, a paused dependency, and a failed dependency;
   - never turn any of those states into a request for an audit-attempt token.

5. **Optional epic audit.** If `epic-audit` was requested, run it only after step 4 and only over the
   selected tickets whose durable Meta is `[x] DONE`. Dispatch one fresh subagent that reads and
   silently applies `ai/skills/sdd-audit/SKILL.md`; pass the exact DONE Task-ID list and `Mode: epic`.
   The subagent inherits the caller's model. Epic PASS/FAIL is reported as cross-task evidence and
   Decision Log proposals; it cannot alter per-task status, substitute for a per-task audit, or pull
   BLOCKED/PAUSED/FAILED/waiting tickets into audit scope. No DONE tickets → skip with an explicit
   reason.

6. **Final summary.** Emit one compact table with Task-ID, initial state, lifecycle result, final
   durable status, audits/reopens, and waiting reason. Group non-routine execution decisions and
   `INSIGHT_BACKFLOW` proposals once at the end for operator review.
</Protocol>

<HardForbidden>
- Re-implementing phase dispatch, audit routing, retry convergence, Reopens accounting, or tracker
  synchronization in this skill. They belong to `sdd-execute`.
- Parallel task lanes in one working tree.
- Skipping a task's per-task audit, including when `epic-audit` is requested.
- Excluding IN_PROGRESS tasks merely because work already started; the canonical lifecycle decides
  resume versus audit-only.
- Treating BLOCKED or PAUSED as FAILED.
- Asking for a second confirmation after the batch invocation.
- Editing code, specs, tickets, Execution Logs, or trackers directly from the batch scheduler.
</HardForbidden>
</SddExecuteBatchOrchestrator>
