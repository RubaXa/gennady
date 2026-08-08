# Task: TSK-166 — test-infra: seed-DSL + контракт-сьют портов + кассеты

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-166
- **Status:** [x] DONE
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
- **Reopens:** 3
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** (1) `seedMr({ref, events[], sync})` — пишет events.jsonl + sync-снимок в temp stateDir (любое состояние MR без GitLab); (2) Cassette recorder/replayer поверх `utils/test/mock-http.ts`. Формат: файл на host (`test/cassettes/<host>.jsonl`), запись `{matchKey: method+url+sha256(body), response, ts}`; токены заменяются плейсхолдерами при записи; (3) PortContractSuite — один тест-файл порта, дважды: против фейка и против реального адаптера на кассетах (расхождение = красный тест); (4) DTO-фабрики всех 7 типов виджетов + MrCard для компонентных тестов дашборда.
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
- дрейф → `port-contract.test.ts` :: `contract suite compares fake with cassette-backed real adapter and names fake drift fields`
- фабрики → `seed.test.ts` :: `dto factories cover all widget types`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [x] `2026-08-07T12:30:00+03:00` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-07T12:30:00+03:00` DONE
      **Handoff →** artifacts: [seed.ts, cassettes.ts, port-contract.suite.ts, dto-factories.ts]; decisions: [journal-backed seed, strict body-hash cassette replay]; open: [none]

#### P2

- [x] `2026-08-07T12:30:00+03:00` ver `npm test -- services/agent-inbox/test/__tests__/seed.test.ts services/agent-inbox/test/__tests__/port-contract.test.ts` → `pass` exit=`0`
- [x] `2026-08-07T12:30:00+03:00` DONE
      **Handoff →** artifacts: [seed.test.ts, port-contract.test.ts]; decisions: [explicit files because Node 22 does not accept a test directory]; open: [none]

#### Round close

- [x] `2026-08-07T12:30:00+03:00` DONE

### Round 2 — 2026-08-08, audit remediation

#### P1

- [x] `2026-08-08T00:00:00+03:00` remediation: seed snapshots are loaded from persisted state into a real `HttpServer`; test boots the server and verifies `GET /api/board` without a VCS collaborator.
- [x] `2026-08-08T00:00:00+03:00` remediation: sanitized realistic GitLab cassette is recorded/replayed through `VcsInboxReal#getActionable` on intercepted transport; `PortContractSuite` compares the fake and real operation and reports the drift field.
- [x] `2026-08-08T00:00:00+03:00` remediation: cassette identity now compares intercepted method, complete URL/query, and body hash; changed query has an explicit rejection test.
- [x] `2026-08-08T00:00:00+03:00` ver `npm test -- services/agent-inbox/test/__tests__/seed.test.ts services/agent-inbox/test/__tests__/port-contract.test.ts` → `pass` (5 tests)
- [x] `2026-08-08T00:00:00+03:00` DONE
      **Handoff →** artifacts: [seed.ts, cassettes.ts, port-contract.suite.ts, dto-factories.ts]; decisions: [persisted production-shape seed and strict cassette request identity retained]; open: [none]

#### P2

- [x] `2026-08-08T00:00:00+03:00` ver `npm test -- services/agent-inbox/test/__tests__/seed.test.ts services/agent-inbox/test/__tests__/port-contract.test.ts` → `pass` (5 tests)
- [x] `2026-08-08T00:00:00+03:00` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-08T00:00:00+03:00` ver `npx prettier --write … && git diff --check` → `pass`
- [x] `2026-08-08T00:00:00+03:00` DONE
      **Handoff →** artifacts: [seed.test.ts, port-contract.test.ts]; decisions: [BDD coverage names map verbatim to node:test titles]; open: [none]

#### Round close

- [x] `2026-08-08T00:00:00+03:00` DONE — all Round 1 audit findings remediated; tracker remains `[x] DONE`.

### Round 3 — 2026-08-08, canonical API-contract remediation

#### P1

- [x] `2026-08-08T00:24:00+03:00` remediation: persisted seed state now boots the real `HttpServer` and proves canonical `MrCard` output including `work.state=running`, `taskId`, and `startedAt`; the disabled network transport permits only loopback, proving no external VCS call.
- [x] `2026-08-08T00:24:00+03:00` remediation: cassette replay verifies full URL/query and SHA-256 body identity, including an explicit body-hash mismatch rejection.
- [x] `2026-08-08T00:24:00+03:00` DONE
      **Handoff →** artifacts: [seed.ts, cassettes.ts, dto-factories.ts, seed.test.ts, port-contract.test.ts]; decisions: [canonical MrCard is the sole dashboard fixture contract; cassette request identity remains transport-level and strict]; open: [none]

#### P2

- [x] `2026-08-08T00:24:00+03:00` ver `npm test -- services/agent-inbox/test/__tests__/seed.test.ts services/agent-inbox/test/__tests__/port-contract.test.ts` → `pass` (5 tests)
- [x] `2026-08-08T00:24:00+03:00` ver `npm run type-check` → `pass` exit=`0`
- [x] `2026-08-08T00:24:00+03:00` ver `npx tsx cli/gennady.ts lint <TSK-166 files> && npx prettier --check <TSK-166 files> && git diff --check` → `pass`
- [x] `2026-08-08T00:24:00+03:00` DONE
      **Handoff →** artifacts: [seed.test.ts, port-contract.test.ts]; decisions: [BDD test names retained verbatim in coverage table; no fixture uses a legacy board-card shape]; open: [none]

#### Round close

- [x] `2026-08-08T00:24:00+03:00` DONE — TSK-166 remediation ready for independent audit.

### Round 4 — 2026-08-08, cassette-backed negative contract remediation

#### P2

- [x] `2026-08-08T00:30:00+03:00` remediation: the intentional fake drift is now compared directly with a separately replayed cassette-backed `VcsInboxReal`; the negative BDD path no longer substitutes a synthetic `createReal` port.
- [x] `2026-08-08T00:30:00+03:00` ver `npm test -- services/agent-inbox/test/__tests__/seed.test.ts services/agent-inbox/test/__tests__/port-contract.test.ts` → `pass`
- [x] `2026-08-08T00:30:00+03:00` DONE
      **Handoff →** artifacts: [port-contract.test.ts]; decisions: [both success and deliberate-drift contract checks use the same strict cassette-backed real adapter]; open: [none]

#### Round close

- [x] `2026-08-08T00:30:00+03:00` DONE — TSK-166 negative BDD path ready for independent audit.
<!--/SECTION:EXECUTION_LOG-->

## Audit Rounds

### Audit Round 1 — 2026-08-08, after Execution Round 2

```
@audit task=TSK-166 round=1 after-exec-round=2 triggered-reopen=Round-3 status=FAIL counts=B0·M3·m0·I0
F-01 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=services/agent-inbox/test/cassettes.ts:30 | src=ai/directives/coding/typescript-rules.xml#AX_BASE_CONTRACT_SHAPE | route=ticket-reopen | act=добавить полные JSDoc-контракты ко всем экспортам и свойствам, затем устранить 25 ошибок целевого lint
F-02 | sev=M | type=BDD_COVERAGE_MISMATCH | conf=H | loc=tasks/agent-inbox/agent-inbox.task-166.md:112 | src=tasks/agent-inbox/agent-inbox.task-166.md#TEST_COVERAGE | route=ticket-update | act=синхронизировать каноническое имя сценария дрейфа с фактическим названием node:test
F-03 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/agent-inbox/agent-inbox.task-166.md:141 | src=ai/directives/sdd/audit.directive.xml#AX_EXECUTION_LOG_VERIFICATION | route=ticket-update | act=разделить или завершить блок P1/P2, добавив обязательные DONE и Handoff для каждой фазы
```
