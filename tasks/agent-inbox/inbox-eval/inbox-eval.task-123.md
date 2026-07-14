# Task: TSK-123 — live-дашборд рендерит реальный MR + скрин с настоящей диаграммой (§7 real-proof, B1)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-123 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-serve | **Dependencies:** TSK-122 (артефакты на диск + BoardReal + live-путь)
- **Purpose:** Закрыть блокер B1 из TSK-122 P3: live-дашборд (`vite.config.ts` `startLiveServer`) не запускает материализацию/не тикает scheduler → `BoardProviderReal.getReport()` = null для реального MR, дашборд пуст. Фикс: в live-пути прогнать `runMrsOnce(EVAL_MR_URL)` (материализует PLAN/README-с-mermaid на диск из реального changeset — детерминированно, не требует LLM) и наполнить board, затем сервить; `#/mr/<real>` рендерит настоящий REPORT с диаграммой. Итог — **предъявить spec §7 real-proof**: скрин `eval-real-02-report-diagram` с реально отрисованной mermaid реального MR. (B2 — падение LLM-сессий — вне этой задачи, TSK-124; детерминированная диаграмма из changeset его не требует.)
- **Spec:** [inbox-eval.spec.md](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md) §7 REAL_PROOF | **Runtime:** not-implemented | **Verification:** integration, e2e

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (live server материализует + сервит реальный MR)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-dashboard/vite.config.ts` (+ при необходимости `services/agent-inbox/serve/run-mode.ts`, `services/agent-inbox/serve/bootstrap.ts`) — в EVAL_LIVE-пути `startLiveServer`: перед сервингом прогнать `runMrsOnce({ mrs: [EVAL_MR_URL], seed: fresh, dryRun: true })` (материализует reports/<mr>/ из реального changeset и регистрирует MR), чтобы `BoardProviderReal.getReport(<mr>)`/`listArtifacts` возвращали реальные данные. Дашборд на BoardProviderReal поверх того же StateStore.
- **Exit:** `EVAL_LIVE=1 EVAL_MR_URL=<real> GENNADY_STATE_DIR=<temp>` → дашборд на `#/mr/<real>` отдаёт настоящий REPORT (README с mermaid из реального changeset), не null. type-check + format pass.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test + real-proof (§7)

- **Rules:** none
- **Target Files:** `e2e/inbox-serve/reviewer-eval.spec.ts` (EVAL_LIVE-путь)
- **Exit:** живой прогон реального MR → Playwright ждёт настоящий `svg[id^=mmd-]` и снимает `eval-real-02-report-diagram` (+ 01-plan/03-track/04-actionpanel/05-eval-report). Оркестратор фактически выполняет прогон на !571/!1296 и **предъявляет реальный скрин с нарисованной диаграммой оператору**. Пререквизиты (проверены в TSK-122 P3: токен 200, opencode reachable): токен gitlab.corp.mail.ru.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN EVAL_LIVE + реальный MR WHEN startLiveServer THEN runMrsOnce материализовал reports/<mr>/, getReport ≠ null
- GIVEN live-дашборд WHEN `#/mr/<real>` THEN REPORT с реально нарисованной mermaid (из реального changeset)
- GIVEN живой прогон WHEN скрин THEN `eval-real-02-report-diagram` = настоящий svg реального MR (§7), не placeholder/фикстура

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/serve/__tests__/*.test.ts'` — pass
- Живой: `EVAL_LIVE=1 EVAL_MR_URL=<real>` → реальный скрин `eval-real-02` с нарисованной диаграммой предъявлен
- `npm run format:check` — pass

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                     | Level       | Test File             |
| -------------------------------------------- | ----------- | --------------------- |
| live server материализует + getReport ≠ null | integration | run-mode.test.ts      |
| real-proof: настоящая диаграмма реального MR | e2e         | reviewer-eval.spec.ts |

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

<!--/SECTION:EXECUTION_LOG-->
