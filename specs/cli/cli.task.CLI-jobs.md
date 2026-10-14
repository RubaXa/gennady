# Task: CLI-jobs — vcs-job + vcs-job-log CLI

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CLI-jobs | **Status:** [ ] TODO | **Scope:** cli | **Module:** vcs-job | **Dependencies:** VC-jobs
- **Purpose:** vcs-job (--job name|id --action status|play|cancel|retry) + vcs-job-log (--job name|id). name→id через VcsPipelineStatus.jobs.
- **Spec:** cli.spec.md §4.1.20-21 | **Runtime:** real-runtime | **Verify:** unit

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

## 3. P1 — impl

- **Rules:** typescript-rules
- **Target Files:**
  - `cli/cmd/vcs-job/vcs-job.cmd.ts`
  - `cli/cmd/vcs-job/index.ts`
  - `cli/cmd/vcs-job/help.ts`
  - `cli/cmd/vcs-job-log/vcs-job-log.cmd.ts`
  - `cli/cmd/vcs-job-log/index.ts`
  - `cli/cmd/vcs-job-log/help.ts`
  - `cli/gennady.ts`
  - `cli/cmd/help/help.cmd.ts`
- **Exit:** обе команды зарегистрированы; vcs-context-resolver; --job name→id резолв

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. BDD

- vcs-job --job <name> → getPipeline→resolve id→getJob→status
- vcs-job --job <id> --action play → playJob→status
- vcs-job --job <id> --action cancel → cancelJob→status
- vcs-job --job <name> retry → playJob (alias)
- vcs-job-log --job <id> → getJobLog→stdout
- --dry-run, --host, vcs-context-resolver

**Scenario:** Ошибка: job не найден [`unit`]

- **Given** pipeline не содержит job с запрошенным именем
- **When** выполняется `vcs-job --job <name>`
- **Then** команда пишет `Job not found` и завершается с exit 1

<!--/SECTION:BDD-->
<!--SECTION:TEST_COVERAGE-->

## 5. Test Scenario Coverage

- Ошибка: job не найден → `vcs-job.test.ts` :: `should report error when job is not found in pipeline`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-06-26T19:40:15Z` intro `VcsJobDeps` ← DI-таблица для vcs-job: resolveVcsContext, stdout, stderr, exit
- [x] `2026-06-26T19:40:15Z` intro `VcsJobLogDeps` ← DI-таблица для vcs-job-log: resolveVcsContext, stdout, stderr, exit
- [x] `2026-06-26T19:40:15Z` ver `~/.config/opencode/skills/sdd-execute/scripts/sdd verify cli/cmd/vcs-job/vcs-job.cmd.ts cli/cmd/vcs-job/index.ts cli/cmd/vcs-job/help.ts cli/cmd/vcs-job-log/vcs-job-log.cmd.ts cli/cmd/vcs-job-log/index.ts cli/cmd/vcs-job-log/help.ts cli/gennady.ts` → pass exit=0
- [x] `2026-06-26T19:40:15Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-job/vcs-job.cmd.ts, cli/cmd/vcs-job/index.ts, cli/cmd/vcs-job/help.ts, cli/cmd/vcs-job-log/vcs-job-log.cmd.ts, cli/cmd/vcs-job-log/index.ts, cli/cmd/vcs-job-log/help.ts]; decisions: [vcs-context-resolver=used, DI-pattern=injectable-deps, retry=play-alias, name-to-id=getPipeline.jobs]; open: []

#### P2

- 🛑 `2026-06-26T19:41:15Z` BLOCKED: в тикете отсутствует блок определения фазы P2 (нет секции `## 3. P2 — test` с Rules, Target Files, Objective, Exit). Фаза объявлена в таблице Phases Overview, но её контракт не определён.
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: добавить в тикет секцию `## 3. P2 — test` с полями Rules, Target Files, Objective, Exit, затем перезапустить P2
- ✅ `2026-06-26T19:42:51Z` RESOLVED: оператор добавил секцию `## 3. P2 — test` с Rules, Target Files, Inputs, Exit
- [x] `2026-06-26T19:42:51Z` intro `vcs-job.test.ts` ← P2-test: 11 cases — happy (status/play/cancel/retry-alias), dry-run, error (missing-job/not-found/resolver/pipeline-api/no-iid)
- [ ] `2026-06-26T19:42:51Z` insight BDD «vcs-job-log --job <id> → getJobLog→stdout» → ticket §4 BDD, requires separate vcs-job-log test phase (target only: vcs-job.test.ts)
- [x] `2026-06-26T19:42:51Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-26T19:42:51Z` ver `npm run lint:contracts` → pass exit=0
- [x] `2026-06-26T19:42:51Z` ver `npm run test` → pass exit=0
- [x] `2026-06-26T19:42:51Z` ver `npm run format:check` → pass exit=0
- [x] `2026-06-26T19:42:51Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-job/__tests__/vcs-job.test.ts]; decisions: [test-pattern=module-mock+captureRun, bdd-coverage=11-cases-for-vcs-job, vcs-job-log-bdd=deferred-separate-phase]; open: []

<!--/SECTION:EXECUTION_LOG-->
<!--SECTION:PHASE_P2-->

## 3. P2 — test

- **Rules:** [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** `cli/cmd/vcs-job/__tests__/vcs-job.test.ts`
- **Inputs:** P1 handoff
- **Exit:** all BDD covered; tests pass; typecheck+format clean
<!--/SECTION:PHASE_P2-->
