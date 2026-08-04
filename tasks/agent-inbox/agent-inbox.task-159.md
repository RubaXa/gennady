# Task: TSK-159 — inbox-queue: реестр типов + executors + маршрут сессий

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-159
- **Status:** [ ] TODO
- **Purpose:** Исполнительное ядро: реестр 16 типов с формальной грамматикой ссылок, per-MR executors (ноль глобальных мьютексов), дедуп/supersede, приоритеты+aging, восстановление из журнала, маршрутизация сессий, видимое «⏳ ждёт очередь».
- **Scope:** `agent-inbox`
- **Module:** `inbox-queue`
- **Dependencies:** TSK-157, TSK-158, TSK-160
- **Spec References:**
  - Module spec: [inbox-queue](../../specs/agent-inbox/inbox-queue/inbox-queue.spec.md) §2–§5
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
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

- **Objective:** TaskRegistry (16 типов, грамматика ссылок type-name/glob/allOf/producerOf/external), TaskQueuePort (enqueue с dedupKey, next(mr), state, supersede), Executor per MR (правила §4.1: приоритеты числовые+FIFO+aging, exclusive, waiting_dep/cancelled, batch next(), эффекты последовательно; пул сессий НЕ здесь — владелец inbox-opencode, потребление через SessionRouterPort), SessionRouter (таблица §4.2), восстановление (running→queued, эффекты по маркеру), queue-visibility события в журнал.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-queue/task-registry.ts`
  - `services/agent-inbox/modules/inbox-queue/task-queue.ts`
  - `services/agent-inbox/modules/inbox-queue/executor.ts`
  - `services/agent-inbox/modules/inbox-queue/session-router.ts`
- **Inputs:** TSK-157 (DecisionJournal), TSK-158 (gitlab_event), TSK-160 (пул сессий)
- **Exit:** `npm run type-check` exit 0; резолвер правил проходит всю таблицу §3
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** тесты: два MR параллельно (контроль инцидента), дедуп, supersede, exclusive эффектов, восстановление после краха, маршрутизация сессий, aging.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-queue/__tests__/executor.test.ts`
  - `services/agent-inbox/modules/inbox-queue/__tests__/task-registry.test.ts`
  - `services/agent-inbox/modules/inbox-queue/__tests__/session-router.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** per-MR очередь без глобальных блокировок

**Scenario:** типинг-контракт TaskInstance/TaskType/грамматика ссылок [`contract`]

- **Given** реестр 16 типов и грамматика ссылок
- **When** type-check + парсинг каждой ячейки §3
- **Then** все ссылки резолвятся; dependsOn `enrich` резолвится в тип

**Scenario:** два MR не блокируют друг друга [`integration`]

- **Given** executors MR-A (LLM-задача running 60с) и MR-B
- **When** задача MR-B enqueue
- **Then** MR-B: queued→running ≤ 30с (контроль инцидента 2026-07-28); MR-A не прервана

**Scenario:** дедуп и supersede по dedupKey [`unit`]

- **Given** задача `fact_check:f#3` queued
- **When** повторный enqueue с тем же dedupKey до старта
- **Then** возвращён тот же taskId; новая версия замещает ожидающую

**Scenario:** восстановление после краха без дублей эффектов [`integration`]

- **Given** журнал: effect с маркером применён + track running на момент краха
- **When** restore из журнала
- **Then** effect → done (без повторного постинга), track → queued

**Scenario:** маршрутизация сессий по таблице §4.2 [`unit`]

- **Given** задачи deepen/fact_check/mutate/chat_question
- **When** route(task)
- **Then** reuse_producer (если жива) / new_fresh / reuse_producer / operator_chat

**Scenario:** эффект не исполняется без решения оператора [`integration`]

- **Given** effect_resolve enqueue-нут, precondition external не закрыт
- **When** executor делает next(mr)
- **Then** задача остаётся waiting_dep; после decision → queued → исполнение

**Scenario:** supersede не убивает исполняющуюся [`unit`]

- **Given** задача с dedupKey K в running
- **When** enqueue с тем же K
- **Then** running дорабатывает; замещения нет

**Scenario:** эффекты строго последовательны внутри MR [`integration`]

- **Given** две effect\_\* queued на одном MR
- **When** executor работает
- **Then** не более одной running effect\_\*; вторая — после терминала первой
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                           | Required by      |
| ----------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                              | typescript-rules |
| `npm test -- services/agent-inbox/modules/inbox-queue/__tests__/` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- типинг/грамматика → `task-registry.test.ts` :: `contract: all registry references resolve`
- параллелизм → `executor.test.ts` :: `two MRs execute independently under long LLM task`
- дедуп/supersede → `task-registry.test.ts` :: `enqueue dedupes and supersedes by dedupKey`
- краш-восстановление → `executor.test.ts` :: `restore requeues running and skips applied effects`
- маршрут → `session-router.test.ts` :: `session routing table is honored`

- external-гейт → `executor.test.ts` :: `effect waits for operator decision in waiting_dep`
- supersede vs running → `task-registry.test.ts` :: `supersede does not kill running task`
- последовательность эффектов → `executor.test.ts` :: `effects are strictly sequential per MR`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- inbox-queue/__tests__` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
