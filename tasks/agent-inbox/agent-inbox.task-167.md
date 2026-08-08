# Task: TSK-167 — test-suite health: изоляция тяжёлых integration-тестов

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-167
- **Status:** [ ] TODO
- **Purpose:** Полная сьюита `npm test` не завершается (>10 мин) после волны TSK-162/163/166 — тяжёлые integration-тесты (реальные серверы/SSE/git) деградируют полное расписание. Вынести их за отдельный скрипт и вернуть основной гейт ≤ 2 мин.
- **Scope:** `agent-inbox`
- **Module:** N/A (test infrastructure; блокирует приёмку TSK-165)
- **Dependencies:** None
- **Spec References:**
  - Doctrine: [inbox-dashboard §5.1](../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md) (гранулярность тестов)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [ ]    |
| P2  | test   | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — config

- **Objective:** Разделить раннеры: `npm test` — быстрые unit/integration (по файлам, не директориями — quirk раннера); `npm run test:integration` — тяжёлые (`*.integration.test.ts`, foundation-runtime, pipeline-runtime, full-flow, serve) с `--test-concurrency=2`. Известные 5 v1-легаси падений (http-server/full-flow/runMrsOnce — доказано pre-existing bisect'ом на a1adf97) пометить skip с причиной и ссылкой на D-216 (уходят с v1-модулями).
- **Rules:**
  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `package.json` (scripts: test, test:integration)
  - v1-легаси тест-файлы: skip-маркеры с причиной (services/agent-inbox/serve/**tests**/full-flow.blackbox.test.ts, modules/inbox-api/**tests**/http-server.test.ts, modules/inbox-roles/**tests**/reviewer.e2e.test.ts, modules/inbox-eval/**tests**/eval-driver.test.ts)
- **Inputs:** none
- **Exit:** `npm test` завершается ≤ 120с, 0 fail; `npm run test:integration` завершается и зелёная
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Доказать: полный прогон зелёный и быстрый; integration-раннер зелёный; pre-commit проходит (format+type-check+lint:contracts).
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - (нет — проверочная фаза)
- **Inputs:** P1 handoff
- **Exit:** 3 прогона подряд `npm test` зелёные ≤ 120с; `npm run lint:contracts` clean
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** тестовый гейт, которому можно верить

**Scenario:** полный прогон завершается и зелёный [`integration`]

- **Given** чистое дерево
- **When** `npm test`
- **Then** завершение ≤ 120с, fail = 0 (кроме заскипанных легаси с причиной)

**Scenario:** тяжёлые integration изолированы [`integration`]

- **Given** `*.integration.test.ts` и serve/full-flow файлы
- **When** `npm run test:integration`
- **Then** они исполняются отдельным раннером с concurrency ≤ 2 и проходят

**Scenario:** легаси-флейки не маскируются [`unit`]

- **Given** 5 v1-легаси падений
- **When** прогон
- **Then** они `skip` с комментарием причины и ссылкой D-216 — не красные и не молча зелёные
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                    | Required by      |
| -------------------------- | ---------------- |
| `npm test` (≤120с, 0 fail) | nodejs-npm-setup |
| `npm run test:integration` | node-test        |
| `npm run lint:contracts`   | baseline         |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- полный прогон → сама сьюита (гейт P2)
- integration изоляция → `package.json` scripts
- легаси skip-маркеры → в самих тест-файлах
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-08, initial

#### P1

- [ ] `<ts>` ver `npm test` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm run test:integration` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
