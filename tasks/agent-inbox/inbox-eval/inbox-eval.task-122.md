# Task: TSK-122 — реальный end-to-end: артефакты на диск + BoardReal + host + живой дашборд → реальные скрины (spec §7)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-122 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-serve | **Dependencies:** TSK-121 (run-mode), TSK-113 (граф/валидатор), TSK-107 (dashboard), TSK-120 (e2e-харнесс)
- **Purpose:** Закрыть 4 разрыва, из-за которых реальный прогон не показывает настоящую диаграмму (найдено в TSK-120): (1) `VcsInboxReal` создаётся без `host` в `serve.cmd.ts` и `eval-driver.ts`; (2) `runMrsOnce`/session-узлы не пишут PLAN/REPORT/mermaid на диск (артефакты в памяти) — граф должен материализовать scaffold→fan-out→synthesize в `~/.gennady/.../reports/<mr>/`; (3) `BoardProviderReal.listArtifacts/readArtifact` — заглушки, должны читать реальные артефакты с диска; (4) e2e/дашборд захардкожен на `BoardProviderMock`+dev-seed — для живого прогона подключить к реальному StateStore/BoardProviderReal. Итог — spec §7 real-proof: живой прогон реального MR → дашборд с НАСТОЯЩЕЙ нарисованной диаграммой, скрины `eval-real-*`.
- **Spec:** [inbox-eval.spec.md](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md) §7 REAL_PROOF | **Runtime:** not-implemented | **Verification:** integration, e2e

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | impl | P1   | [ ]    |
| P3  | test | P2   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (host + артефакты на диск)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox/serve.cmd.ts`, `services/agent-inbox/modules/inbox-eval/eval-driver.ts` — передавать `host` в `VcsInboxReal` (из конфига/URL MR), убрать `CONFIG: No VCS host configured` (gap-1).
  - `services/agent-inbox/serve/run-mode.ts` + `services/agent-inbox/modules/inbox-roles/*` (session/synthesize узлы) — материализовать реальные артефакты на диск: граф прогоняет scaffold→fan-out→synthesize и пишет PLAN.md/tasks/\*.task.md/README.md (с mermaid) в `<StateStore.getStateDir()>/agent-inbox/reports/<mr>/` (gap-2). Переиспользовать `inbox-review-plan --scaffold/--validate` (SV-12: функции).
- **Exit:** живой (или mock-opencode с реальным scaffold) прогон реального MR пишет PLAN/README(mermaid) на диск; host-ошибки нет. type-check + format pass.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — impl (BoardReal читает с диска + живой дашборд)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/board-provider.real.ts` — `listArtifacts/readArtifact` читают реальные файлы из `reports/<mr>/` (gap-3), с traversal-guard (как в ArtifactRouter).
  - `services/agent-inbox/serve/bootstrap.ts` + e2e webServer config — для живого прогона поднимать дашборд на `BoardProviderReal` поверх StateStore, а не `BoardProviderMock`/dev-seed (gap-4); mock-путь остаётся для быстрых тестов.
- **Exit:** дашборд в live-режиме отдаёт реальные артефакты MR (в т.ч. README с mermaid); `#/mr/<real>` рендерит настоящий REPORT. type-check + format pass.

<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — test + real-proof (spec §7)

- **Rules:** none
- **Target Files:** `e2e/inbox-serve/reviewer-eval.spec.ts` (EVAL_LIVE-путь), integration-тест persist-артефактов + BoardReal чтения
- **Exit:** `EVAL_LIVE=1 EVAL_MR_URL=vk-workspace/superapp!571` (или !1296) → живой прогон, дашборд, скрин `eval-real-02-report-diagram` содержит **реально отрисованную** mermaid `svg[id^=mmd-]` реального MR (не placeholder, не фикстура); `05-eval-report` с гейтами. Оркестратор предъявляет реальные скрины оператору. Пререквизиты: токен `gitlab.corp.mail.ru`, opencode+KLM подняты.

<!--/SECTION:PHASE_P3-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN реальный MR + host из конфига WHEN run-mode THEN нет `CONFIG: No VCS host`, граф стартует
- GIVEN живой прогон WHEN граф THEN PLAN.md/README.md(mermaid) записаны в reports/<mr>/ на диск
- GIVEN артефакты на диске WHEN BoardProviderReal.listArtifacts/readArtifact THEN отдаёт реальные файлы (traversal-guard)
- GIVEN live-дашборд + реальный MR WHEN `#/mr/<real>` THEN REPORT с реально нарисованной mermaid
- GIVEN EVAL_LIVE прогон WHEN скрины THEN `eval-real-02-report-diagram` = настоящий svg реального MR (spec §7)

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts' 'services/agent-inbox/serve/__tests__/*.test.ts'` — pass
- Живой: `EVAL_LIVE=1 EVAL_MR_URL=<real>` → реальные скрины предъявлены (диаграмма реально нарисована)
- `npm run format:check` — pass

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                     | Level       | Test File              |
| -------------------------------------------- | ----------- | ---------------------- |
| host передан → нет CONFIG-ошибки             | integration | run-mode.test.ts       |
| артефакты записаны на диск                   | integration | run-mode.test.ts       |
| BoardProviderReal читает reports/<mr>/       | integration | board-provider.real.\* |
| live real-proof: настоящая диаграмма (скрин) | e2e         | reviewer-eval.spec.ts  |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P3

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

<!--/SECTION:EXECUTION_LOG-->
