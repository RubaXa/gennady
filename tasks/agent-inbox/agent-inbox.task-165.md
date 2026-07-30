# Task: TSK-165 — inbox-eval: харнесс S1–S8 + метрики автономии

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-165
- **Status:** [ ] TODO
- **Purpose:** Харнесс приёмки: `gennady inbox eval --mr <url>`, 10 прогонов с измеримыми PASS-критериями (вкл. parallel-контроль инцидента, crash_recovery, coverage_gate), eval-report.json + trend.jsonl, метрики датасета (accept-rate/edit-rate/time-to-decision/coverage-факт).
- **Scope:** `agent-inbox`
- **Module:** `inbox-eval`
- **Dependencies:** TSK-161, TSK-164, TSK-166
- **Spec References:**
  - Module spec: [inbox-eval](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md) §2–§5
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`, `e2e`
- **Deferred Runtime Scope:** None
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

### P1 — impl

- **Objective:** CLI `gennady inbox eval --mr <url> [--runs] [--report]` (REUSE run-mode TSK-121), раннеры 10 прогонов (boot/role_pickup/pipeline/events/chat/effects/autonomy/parallel/crash_recovery/coverage_gate) с критериями §2 спеки, eval-report.json (схема §2.2) + trend.jsonl, MetricsCollector (accept-rate/edit-rate/time-to-decision/coverage из журнала).
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-eval/harness.ts`
  - `services/agent-inbox/modules/inbox-eval/runs/` (10 раннеров)
  - `services/agent-inbox/modules/inbox-eval/metrics.ts`
  - `cli/cmd/inbox/eval.cmd.ts`
- **Inputs:** TSK-161 (пайплайн), TSK-164 (дашборд для скриншотов), TSK-157 (журнал/датасет)
- **Exit:** `npm run type-check` exit 0; `gennady inbox eval --help` exit 0
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** unit/integration тесты: критерии прогонов (PASS/FAIL), eval-report схема, метрики из синтетического журнала, parallel-критерий.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-eval/__tests__/harness.test.ts`
  - `services/agent-inbox/modules/inbox-eval/__tests__/metrics.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** измеримая приёмка на реальном MR

**Scenario:** типинг-контракт eval-report.json [`contract`]

- **Given** схема {mr, ts, runs[{id,status,evidence[]}], metrics{acceptRate{n}}, verdict}
- **When** type-check
- **Then** run id ∈ 10 прогонов; metrics несут n на capability

**Scenario:** parallel-прогон — контроль инцидента [`integration`]

- **Given** два MR в работе, LLM-задача MR-A running
- **When** замер перехода MR-B queued→running
- **Then** ≤ 30 сек → PASS; иначе FAIL с evidence

**Scenario:** crash_recovery восстанавливает карточки [`integration`]

- **Given** снапшот доски до SIGKILL при running задаче
- **When** рестарт + восстановление
- **Then** set(карточки до) == set(карточки после); queued-задачи не потеряны и не задвоены → PASS

**Scenario:** метрики из журнала [`unit`]

- **Given** журнал с 25 proposal/decision по `react` (22 accept, 3 edit)
- **When** MetricsCollector
- **Then** acceptRate.react = {rate: 0.88, n: 25}; ниже порога 0.9 → остаётся proposal

**Scenario:** exit code отражает verdict [`unit`]

- **Given** прогон с одним FAIL
- **When** завершение
- **Then** exit code ≠ 0; eval-report.json содержит evidence провала

**Scenario:** effects-прогон: идемпотентность и права [`integration`]

- **Given** выполненный effect и чужой тред
- **When** повторный effect; попытка resolve чужого
- **Then** ровно 1 маркер аудита; resolve отклонён с причиной → PASS

**Scenario:** градация блокируется при n < 20 [`unit`]

- **Given** acceptRate ≥ 0.9 при n = 12 по capability
- **When** MetricsCollector
- **Then** capability остаётся proposal; отчёт показывает n и причину

**Scenario:** coverage_gate-прогон с fault-injection [`integration`]

- **Given** чеклист дорожки пропатчен доп. файлом
- **When** прогон coverage_gate
- **Then** FAIL со списком в evidence; continue той же сессии закрывает чеклист → PASS
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                          | Required by      |
| ---------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                             | typescript-rules |
| `npm test -- services/agent-inbox/modules/inbox-eval/__tests__/` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- типинг-контракт → `harness.test.ts` :: `contract: eval report schema`
- parallel → `harness.test.ts` :: `parallel run enforces 30s unblock criterion`
- crash → `harness.test.ts` :: `crash recovery restores identical board`
- метрики → `metrics.test.ts` :: `accept rate computed with sample size per capability`
- exit code → `harness.test.ts` :: `exit code mirrors verdict`

- effects-прогон → `harness.test.ts` :: `effects run proves idempotency and resolve rights`
- градация n<20 → `metrics.test.ts` :: `graduation is blocked below sample size`
- coverage_gate → `harness.test.ts` :: `coverage gate fails with file list and continue completes`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- inbox-eval/__tests__` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
