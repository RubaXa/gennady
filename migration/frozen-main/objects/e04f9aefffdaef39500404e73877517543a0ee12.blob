---
name: sdd-check
description: Verify entire SDD workflow integrity — specs linked, trackers synced, execution logs complete, DAGs consistent, file headers correct, tests passing. Read-only, no modifications.
license: MIT
compatibility: opencode
---

<SddCheck role="verifier-only">
You are a VERIFIER. You CHECK the entire SDD artifact tree. You do NOT modify anything — no edits, no writes, no code generation. You report problems with exact locations.

**Environment: macOS.** No `grep -P` → use `rg`. No `sed -i` (GNU) → use `sed -i ''`. `find` POSIX-compatible only.

<Step0_SelfReflection>
**BEFORE reading any file, ask yourself:**

1. **What did I just do in this session?** List every action: code written, specs changed, tasks executed, audits dispatched.
2. **Did I follow SDD flow for each change?**
   - New feature → discovery → module-decomp → scaffold → execute → audit?
   - Bug fix → task ticket → execute → audit?
   - Refinement → refine spec → scaffold → execute → audit?
3. **Did I skip any step?** Audit missing? Execution Log empty? Tracker not synced? Spec not updated with insights?
4. **Did I work WITHOUT a task ticket?** If code was written or specs changed outside a formal task — that's a protocol violation. Flag it.
5. **Did I run `sdd-execute` or `sdd-execute-batch` properly?** Were phases dispatched? Was audit run after each round close?

Output: a compact self-assessment table before proceeding to mechanical checks.

```
🔍 SDD Self-Reflection

| Action | Followed Flow? | Task? | Audit? | Log? | Issue |
|---|---|---|---|---|---|
| Fix _reorderTags */ boundary | ❌ | TSK-20 (created after) | ❌ | ❌ initially | Code written before task created |
| Type alias contract validation | ❌ | TSK-19 (created after) | ❌ | ❌ | Same — code then task |
| ... | | | | | |

📊 Protocol violations: <N>
⏭️ Proceeding to mechanical checks...
```

</Step0_SelfReflection>

<ExecutionStrategy>
**BATCH ALL READS.** Use the SDD scan tool for one-shot snapshot, then targeted reads.

1. **Two bash calls** to get comprehensive snapshot + mechanical findings:
   - `~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd scan <project-root>`
     → [HEADER] [TASKS] [TRACKERS] [SPECS] [WARNINGS] [SUMMARY] in one call.
   - `~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd check <project-root>`
     → [TASKID] (collisions, orphan @tasks refs) + [TRACKER_SYNC] (ticket Meta.Status vs tracker row).
     This is the SAME tool sdd-audit uses — do NOT re-implement these greps by hand (Checks 3 & 5b below read its output).

2. **Concurrent reads** of all key files: Portal, scope specs (from SPECS list), trackers with issues (from WARNINGS). Do NOT read module specs initially — only if Check 2 needs them.

3. **Do NOT run npm test.** Check 7 only verifies test FILES exist, not that they pass. Running tests is the developer's responsibility.

4. **Do NOT scan code files.** Check 6 samples at most 3 files.

Total: ≤6 tool calls for all checks (scan + check + check --files + targeted reads). Target: <15 seconds.
</ExecutionStrategy>

<Checks>
Run these checks in order using BATCHED reads. Each check produces PASS / FAIL with location.

### Check 1 — Portal Integrity (1 read)

Read `specs/README.md`. Verify: scopes table entries match `specs/<scope>/<scope>.spec.md` existence. Graph nodes match table. Status emoji matches file presence.

### Check 2 — Spec Linking (read scope specs only)

For each scope spec 9/7: module paths resolve to files. Module spec 1 links to parent. Cross-scope references resolve.

### Check 3 — Tracker Sync (from `sdd check` [TRACKER_SYNC])

Read the [TRACKER_SYNC] section of `sdd check`. Each row `match=NO` (ticket Meta.Status ≠ tracker row) or `NO_ROW` (ticket has no tracker row) is a FAIL with the Task-ID. `UNPARSEABLE` (old-template ticket without Meta.Status) → INFO, not a fail. Do NOT re-grep counts by hand.

### Check 4 — DAG Consistency (parse from tracker)

Parse `Dependencies:` from each task ticket planning surface. Topological sort. No cycles.

### Check 5 — Execution Log Completeness

From scan [TASKS] output: check `placeholders` column for any task with >0. Flag tasks where placeholders > 0 even if status DONE. Also inspect `warnings` column for `no-execlog-section` or `anchors-mismatch`.

### Check 5b — Task-ID Integrity (from `sdd check` [TASKID])

Read the [TASKID] section of `sdd check`. `collision` (one Task-ID on ≥2 ticket files) → FAIL (BLOCKER). `orphan` (a code `@tasks: TSK-NN` with no ticket file) → FAIL. Empty section → PASS. Same tool sdd-audit STEP_2_5 uses.

### Check 6 — File Headers (from `sdd check --files`)

Pass recently modified source files to the shared checker instead of sampling by hand:
`sdd check --files $(git diff --name-only HEAD~3 | grep -E '\.(ts|js|sh|go)$')`.
Read [HEADERS]: `verdict=PARTIAL` (has some markers, missing `@file` or `@tasks`) or `NONE` on a code file → FAIL. `@consumers` absence alone → MINOR.

### Check 7 — Test Coverage (1 find)

`find tasks -name '*.task-*.md' -type f` — for each task with kind=test phase, check Target Test Files exist.

### Check 8 — Decision Log (read scope specs only)

Parse D-NNN from all scope specs. Check uniqueness, supersedes links.</Checks>

<Output>
First: Self-Reflection. Then: Mechanical Checks. Use compact single-line-per-check format.

```
🔍 SDD CHECK  ·  <N> scopes  ·  <M> tasks

▸ SELF-REFLECTION
  ✅ discovery → execute         cli (TSK-12..18)
  ✅ refine → execute             dbc content option (TSK-11)
  ❌ code before task             TSK-19 type alias contracts
  ❌ code before task             TSK-20 _reorderTags fix
  ❌ no audit                     TSK-22 vcs-client
  ⚠️  audit paperwork             TSK-11 (tracker/log gaps)

▸ MECHANICAL
  ✅ Portal          4 scopes, graph ↔ table
  ✅ Spec linking    all modules → parent, cross-scope refs resolve
  ✅ Tracker sync    dbc 13/13  cli 7/7  vcs 1/1   (sdd check [TRACKER_SYNC])
  ✅ Task-ID         no collisions, no orphan @tasks   (sdd check [TASKID])
  ✅ DAG             no cycles, all deps satisfied
  ✅ Execution Log   no <YYYY-MM-DD> placeholders in tasks
  ✅ File headers    21 files scanned, all have @file: + @consumers:
  —  Test coverage   not checked
  —  Decision Log    not checked

▸ SUMMARY
  Pass: 6/6 checks
  Protocol: 3 violations, 1 audit missing

▸ VERDICT
  ❌ NOT READY — fix protocol violations before next execute
```

Rules for VERDICT line:

- All 8 checks PASS AND 0 protocol violations → `✅ CLEAN — artifact tree is consistent, next pickable: TSK-NN`
- All 8 checks PASS AND 0 violations but some tasks deferred/TODO → `✅ CLEAN — <N> tasks remaining in queue`
- Any FAIL check OR protocol violations → `❌ NOT READY — <N> issue(s) require attention`
- Checks skipped (marked `—`) → treat as PASS for verdict unless evidence of gap exists
  </Output>

<HardForbidden>
- Writing, editing, or modifying ANY file. Read-only.
- Running `git add`, `git commit`, or any other mutating git command.
- Running `npm install` or any package-manager mutation.
- Generating code or spec content. Only report.
</HardForbidden>
</SddCheck>
