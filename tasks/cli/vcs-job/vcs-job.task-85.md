# Task: TSK-85 — vcs-job + vcs-job-log CLI

## 1. Meta

- **Task-ID:** TSK-85 | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-job | **Dependencies:** TSK-84
- **Purpose:** vcs-job (--job name|id --action status|play|cancel|retry) + vcs-job-log (--job name|id). name→id через VcsPipelineStatus.jobs.
- **Spec:** cli.spec.md §4.1.20-21 | **Runtime:** real-runtime | **Verify:** unit

## 2. Phases

| ID  | Kind | Deps |
| --- | ---- | ---- |
| P1  | impl | —    |
| P2  | test | P1   |

## 3. P1 — impl

- **Rules:** typescript-rules
- **Target:** `cli/cmd/vcs-job/vcs-job.cmd.ts`, `cli/cmd/vcs-job/index.ts`, `cli/cmd/vcs-job/help.ts`, `cli/cmd/vcs-job-log/vcs-job-log.cmd.ts`, `cli/cmd/vcs-job-log/index.ts`, `cli/cmd/vcs-job-log/help.ts`, `cli/gennady.ts`
- **Exit:** обе команды зарегистрированы; vcs-context-resolver; --job name→id резолв

## 4. BDD

- vcs-job --job <name> → getPipeline→resolve id→getJob→status
- vcs-job --job <id> --action play → playJob→status
- vcs-job --job <id> --action cancel → cancelJob→status
- vcs-job --job <name> retry → playJob (alias)
- vcs-job-log --job <id> → getJobLog→stdout
- --dry-run, --host, vcs-context-resolver
