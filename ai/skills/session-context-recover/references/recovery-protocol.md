# Recovery protocol

## Evidence hierarchy

Use this order when claims conflict:

1. Current read-only observation of files, Git, or reproducible checks.
2. Raw tool result with timestamp and source location.
3. Operator message.
4. Assistant action recorded in the transcript.
5. Assistant summary, plan, or completion claim.
6. Inference.

Historical truth and current truth can differ. Preserve both instead of overwriting one with the other.

## Bounded extraction

The scanner may stream every record, but model prompts receive only the evidence pack. Expand evidence through targeted line/message queries when a claim is disputed. Never dump an entire large transcript as a shortcut. Record truncation explicitly: a truncated record cannot prove absence.

## Damage indicators

Report malformed JSONL lines, missing parents, abrupt final tool calls, absent tool results, repeated compaction boundaries, duplicated timestamps, referenced child sessions that cannot be found, and metadata/transcript ID mismatches.

## Continuation gate

Before operator confirmation, remain read-only. Do not checkout a branch, recreate or delete worktrees, edit files, install dependencies, run migrations, post messages, or resume implementation.

After confirmation, establish a mechanical workspace binding:

1. Set the absolute recovered worktree as `RECOVERED_WORKDIR` in the recovery report and plan.
2. Verify `pwd`, `git rev-parse --show-toplevel`, branch, HEAD, and status using that exact command `cwd`.
3. Pass the same absolute directory as `workdir`/`cwd` on every subsequent repository tool call. Do not rely on a previous shell `cd` or the Codex thread's original `turn_context.cwd`.
4. Use absolute paths under the binding for patches. Reject a patch target outside it unless the operator approved a named secondary workspace.
5. Give every subagent the binding, expected branch/HEAD, and a requirement to report its observed `pwd`/Git top-level before analysis or mutation.
6. Re-run the binding check after compaction, task resumption, subagent handoff, or any sign that unrelated files appeared.

If the observed directory, branch, or repository differs, stop before further diagnostics. A read-only command in the wrong repository can still contaminate conclusions.
