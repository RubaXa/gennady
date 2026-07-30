# Task: TSK-166 — test-infra: seed-DSL + контракт-сьют портов + кассеты

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-166
- **Status:** [ ] TODO
- **Purpose:** Тестовая инфраструктура v2: seed-DSL (любой MR в любое состояние через журнал+sync-снимок, без GitLab), кассеты записанных реальных ответов GitLab/opencode, контракт-сьют портов ×2 (фейк vs реальный адаптер на перехваченной сети), DTO-фабрики виджетов. Причина: уроки v1 — e2e «всё сразу» невозможен, ручные моки врут (D-116).
- **Scope:** `agent-inbox`
- **Module:** N/A (test infrastructure; потребители: TSK-164 P3, TSK-165)
- **Dependencies:** TSK-156, TSK-158
- **Spec References:**
  - Testing doctrine: [inbox-dashboard §5.1](../../specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md) · drift-sentinel: [inbox-eval §4.2](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md)
  - Reuse: `utils/test/mock-http.ts` (undici MockAgent, D-212)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
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

- **Objective:** (1) `seedMr({ref, events[], sync})` — пишет events.jsonl + sync-снимок в temp stateDir (любое состояние MR без GitLab); (2) Cassette recorder/replayer поверх `utils/test/mock-http.ts` (запись реальных GraphQL/opencode ответов, санитизация токенов); (3) PortContractSuite — один тест-файл порта, дважды: против фейка и против реального адаптера на кассетах (расхождение = красный тест); (4) DTO-фабрики всех 7 типов виджетов + MrCard для компонентных тестов дашборда.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/test/seed.ts`
  - `services/agent-inbox/test/cassettes.ts`
  - `services/agent-inbox/test/port-contract.suite.ts`
  - `services/agent-inbox/test/dto-factories.ts`
- **Inputs:** TSK-156 (журнал), TSK-158 (порты)
- **Exit:** `npm run type-check` exit 0; сидер поднимает serve на temp stateDir и доска показывает заданное состояние
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** тесты самой инфраструктуры: seed→состояние, кассета replay==record, контракт-сьют ловит дрейф (намеренное расхождение фейка → FAIL).
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/test/__tests__/seed.test.ts`
  - `services/agent-inbox/test/__tests__/port-contract.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** детерминированное управление состоянием для тестов

**Scenario:** seed переводит MR в заданное состояние [`integration`]

- **Given** temp stateDir; seedMr({events: [task_created, task_status(running)], sync: {role: author, attention: 💬}})
- **When** boot serve на этом stateDir → GET /api/board
- **Then** карточка MR в группе 💬 с работой «running»; ноль обращений к GitLab

**Scenario:** кассета реплеит настоящую форму ответа [`integration`]

- **Given** кассета записана с реального GitLab (санитизирована)
- **When** replay через реальный VcsInboxReal на перехваченной сети
- **Then** парсинг реального адаптера проходит; поля соответствуют кассете

**Scenario:** контракт-сьют ловит дрейф фейка [`unit`]

- **Given** фейк VcsPort намеренно возвращает другое поле
- **When** прогон PortContractSuite (фейк vs кассетный адаптер)
- **Then** FAIL с именем расходящегося поля

**Scenario:** DTO-фабрики покрывают все типы [`unit`]

- **Given** фабрика для каждого из 7 типов виджетов + MrCard
- **When** type-check + прогон фабрик
- **Then** каждая фабрика валидна против DTO §4 inbox-api
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                            | Required by      |
| -------------------------------------------------- | ---------------- |
| `npm run type-check`                               | typescript-rules |
| `npm test -- services/agent-inbox/test/__tests__/` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- seed → `seed.test.ts` :: `seed puts MR into any state without gitlab`
- кассета → `port-contract.test.ts` :: `cassette replays real response shape through real adapter`
- дрейф → `port-contract.test.ts` :: `contract suite fails on fake drift`
- фабрики → `seed.test.ts` :: `dto factories cover all widget types`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- test/__tests__` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
