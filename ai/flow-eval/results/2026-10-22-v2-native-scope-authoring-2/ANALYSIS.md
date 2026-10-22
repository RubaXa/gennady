# Clean-source authoring run — RED retained, oracle/fixture defect isolated

Source: clean `0576eb9cbef0a5ba5a35a31d7678008da94ffd0f`. Original summary and trajectory
are unchanged. Overall batch exited 1: the judge's pass is diagnostic, not the mechanical verdict.

## Observed trajectory

74 actual tool actions, complete capture across three worker/reviewer sessions, 376133 ms.
Both exact-path orientations succeeded. The worker authored the scope and core module, ran
authoring checks, obtained an independent MAJOR finding about TypeError/RangeError precedence,
corrected it and obtained a fresh review. Approval #1 remains pending; no root tasks or migration
directory was created. The full-project check piped through sed does not prove success.

Independent read-only SDK inspection confirmed the fresh review's public final answer starts
`CLEAN`; its reason identifies integer-ness before range as the corrected contract. Worker,
both reviewers and judge all used `llm-proxy/deepseek-v4-flash` (actual assistant metadata).
No alternative provider is enabled on the isolated server.

## Why the mechanical result is red

R1 and terminal `specs-clean` ran `sdd-check --all .`. Both failed with
`SDD_FILE_SPEC_OWNER_UNRESOLVED` on the fixture's two existing scripts. Independent reproduction
found the same ownership errors before any agent work. Even after removing those scripts, the
ordinary checker correctly returns `SDD_NO_TICKETS_FOUND`: this scenario stops BEFORE decomposition.
This is not evidence that the two authored specs are broken. Their actual authoring validator
reports zero findings, but this later probe does not retroactively make the recorded run green.

## Corrective changes for a NEW run

- Recover the real Node/c8 infrastructure spec and attach `@spec` ownership to its actual runners.
  No `@spec none`, fake product approval or fabricated ticket is introduced.
- Explicit scenario-owned `authoringTargets` select R1-A: read-only draft readiness over the exact
  set, including missing/skeleton/duplicate/path-safety checks and parent/module hierarchy. This is
  not full-project integrity. Execution, repair and migration retain their stricter original bars.
- The previous public judge export mixed SDK reasoning parts with public text. `judge.md` here
  is now the exact public text part from owned judge session `ses_e9ba1eb1fffe76M40LbTqodrzx`,
  message `msg_1645e14f4001kzAO3qhVs9g2UV`. No verdict, source, stats or trajectory was rewritten.
  Regression coverage rejects reasoning/tool/untyped parts and later quoted verdicts.

## Cost and limits

Recorded: 94740 input + 32147 output + 37944 reasoning = 164831 tokens; 3467904 cache-read
tokens are separate. Monetary cost is UNKNOWN: the recorded zero is not a bill or a free-run claim.
The next run changes fixture/oracle correctness, so this is not a controlled cost optimization A/B.
