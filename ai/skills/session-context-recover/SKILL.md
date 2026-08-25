---
name: session-context-recover
description: Find a local Claude Code, OpenCode, or Codex session by title or ID; reconstruct its intent and execution state from a bounded evidence pack; audit contradictions and unfinished work; and prepare a safe operator-approved continuation. Use for recovering or continuing a large, stale, interrupted, or possibly inconsistent agent session without loading its full transcript into context.
---

# Session Context Recover

Recover a session as evidence, not as a trusted narrative. Never load or paste the full transcript into model context.

## Required workflow

1. Parse the requested provider (`claude`, `opencode`, `codex`, or `auto`) and title/ID.
2. Resolve `SKILL_DIR` from this loaded `SKILL.md` path. Never resolve `scripts/` against the current project directory. Run `node <SKILL_DIR>/scripts/session-recover.mjs locate --provider <provider> --query <query>`.
3. If several candidates remain, show their IDs, titles, dates, workspaces, and paths and let the operator choose. Do not silently select one.
4. Generate separate bounded packs with `node <SKILL_DIR>/scripts/session-recover.mjs evidence --provider <provider> --id <id> --view <intent|execution|audit> --output <temporary-json>`. Do not give the full pack to a model when a role view is sufficient.
5. Determine `RECOVERED_WORKDIR` from the recovered session, preferring an explicit session worktree over its origin repository and both over the caller's current directory. Inspect it read-only with `node <SKILL_DIR>/scripts/session-recover.mjs workspace --path <RECOVERED_WORKDIR>`.
6. Delegate the bounded evidence pack in parallel when subagents are available:
   - **Intent & Timeline:** recover the original/current goal, requirement changes, operator decisions, and open questions.
   - **Execution & State:** recover actual edits, commands, tests, failures, Git state, and the last confirmed action.
   - **Adversarial Audit:** find contradictions, unsupported completion claims, missed requirements, stale facts, transcript damage, and items requiring verification.
7. Synthesize the reports. Verify disputed claims against targeted transcript line ranges or the current workspace; never resolve a conflict by guessing.
8. Present the recovery report described in [references/report-schema.md](references/report-schema.md). Mark every important conclusion as Confirmed, Likely, Disputed, Unknown, or Stale.
9. Show a **Workspace binding** checkpoint containing the absolute `RECOVERED_WORKDIR`, Git top-level, branch, HEAD, dirty state, and why this directory belongs to the recovered session. Stop for operator confirmation before changing files, switching branches, recreating a worktree, installing dependencies, or continuing implementation.
10. After confirmation, run `node <SKILL_DIR>/scripts/session-recover.mjs guard --path <RECOVERED_WORKDIR> --root <approved-root> --branch <approved-branch> --head <approved-head>`. Continue only when `bindingOk=true`. Then pass `RECOVERED_WORKDIR` explicitly as `workdir`/`cwd` to every shell or tool call, use absolute patch paths beneath it, and include it in every subagent task. The caller session's initial cwd is irrelevant.

Read [references/recovery-protocol.md](references/recovery-protocol.md) for evidence and safety rules. Read only the relevant provider reference under `references/providers/`.

## Operational invariants

- A transcript may be incomplete, compacted, forked, duplicated, or internally inconsistent.
- Prior assistant summaries and “done” claims are evidence to verify, not facts.
- Machine-streaming the transcript is allowed; placing the full transcript in an agent prompt is not.
- Keep source provenance (`path`, line/message ID, timestamp) for important claims.
- Prefer current filesystem and Git observations over stale session claims, while preserving the historical distinction.
- A discovered workspace is not authorization to mutate it.
- If the original worktree is missing or dirty, report it and ask before reconstruction or branch operations.
- Finding the correct worktree is not enough: all continuation commands and subagents must be mechanically scoped to it. A commentary promise to “continue there” is not a binding.
- Never run repository diagnostics in the caller's cwd after a different recovered worktree has been selected. For a genuinely separate repository, declare an explicit secondary scope and ask when the operation can mutate it.
- Codex/OpenCode layouts vary by version. If an adapter cannot prove the match, report the limitation instead of falling back to an unbounded dump.

## Resources

- Claude Code/Desktop: [references/providers/claude.md](references/providers/claude.md)
- OpenCode: [references/providers/opencode.md](references/providers/opencode.md)
- Codex: [references/providers/codex.md](references/providers/codex.md)
- Audit roles and reconciliation: [references/audit-protocol.md](references/audit-protocol.md)
- Operator-facing output: [references/report-schema.md](references/report-schema.md)
