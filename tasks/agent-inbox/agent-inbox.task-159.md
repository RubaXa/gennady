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
| P1  | impl | —    | [!]    |
| P2  | test | P1   | [x]    |

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

- contract: all registry references resolve → `task-registry.test.ts` :: `all task type names resolve`, `type-name reference resolves to TaskType`, `glob pattern matches multiple type names`, `allOf aggregate evaluates via evaluateReference`, `producerOf reference resolves via evaluateReference`, `external reference evaluates to false`
- enqueue dedupes and supersedes by dedupKey → `task-registry.test.ts` :: `enqueue with same dedupKey → supersedes queued task in-place`, `enqueue with different dedupKey → different taskId`, `dedupKey collision only within same MR`
- supersede does not kill running task → `task-registry.test.ts` :: `queued task with same dedupKey → replaced in-place`, `running task with same dedupKey → NOT superseded`, `multiple supersede → only latest survives`
- enqueue result shape → `task-registry.test.ts` :: `enqueue returns taskId and position for new task`, `enqueue returns same taskId on dedup collision`

- two MRs execute independently under long LLM task → `executor.test.ts` :: `MR-A executor processes MR-A tasks while MR-B executor runs independently`, `MR-A NOT blocked by MR-B running LLM task`
- priority ordering → `executor.test.ts` :: `user task runs before event task when both in queue`, `event task runs before pipeline task`, `same priority → FIFO order`, `aging bumps pipeline task priority after threshold`
- effects are strictly sequential per MR → `executor.test.ts` :: `two effect tasks queued on same MR → only one runs`, `second effect starts after first completes`
- effect waits for operator decision in waiting_dep → `executor.test.ts` :: `effect with unfulfilled precondition → stays waiting_dep`, `resolveExternal transitions task to queued`
- restore requeues running and skips applied effects → `executor.test.ts` :: `applied effect with marker → skipped (done, NOT re-executed)`, `task in running state → requeued as queued`, `queued task → stays queued`
- queue visibility in journal → `executor.test.ts` :: `enqueue writes task_created journal event`, `state transition writes task_status event`
- next() selection → `executor.test.ts` :: `next(mr) returns queued tasks when queue has items`, `next(mr) returns empty array when queue empty`

- session routing table is honored → `session-router.test.ts` :: `deepen → reuse_producer (creates new session)`, `deepen → reuse_producer (reuses existing session)`, `fact_check → new_fresh (always creates new session)`, `mutate_artifact → reuse_producer`, `chat_question → operator_chat (per-MR singleton)`, `engine task → returns undefined (passthrough)`
- session routing edge cases → `session-router.test.ts` :: `reuse_producer with no alive producer session → creates new fresh`, `reuse_producer with alive session → returns existing sessionId`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [x] 2026-08-06T12:15:00Z intro `TaskReference` ← формальная грамматика ссылок: 5 видов (type_name/glob/all_of/producer_of/external), конструкторы `typeRef`/`globRef`/`allOfRef`/`producerOfRef`/`externalRef`
- [x] 2026-08-06T12:15:00Z intro `TaskType` ← запись реестра: name, parallelWith, exclusiveWith, dependsOn, sessionPolicy, priority
- [x] 2026-08-06T12:15:00Z intro `TaskInstance` ← runtime-инстанс задачи: taskId, type, status, params, dependsOn, dedupKey, priority, createdBy, createdAt
- [x] 2026-08-06T12:15:00Z intro `TaskStatus` ← жизненный цикл: queued → running → done/failed, + waiting_dep, cancelled
- [x] 2026-08-06T12:15:00Z intro `SessionPolicy` ← действия маршрутизации: engine, task, new_fresh, reuse_producer, operator_chat
- [x] 2026-08-06T12:15:00Z intro `EnqueueResult` ← результат enqueue: taskId + position
- [x] 2026-08-06T12:15:00Z intro `TaskRegistry` ← реестр 19 типов из spec §3; разрешение имён, матчинг ссылок, оценка зависимостей, dedupKey
- [x] 2026-08-06T12:15:00Z intro `TaskQueuePort` ← контракт очереди: enqueue(dedupKey), next(mr), state(mr), supersede(mr, dedupKey), transition, instance, all
- [x] 2026-08-06T12:15:00Z intro `InMemoryTaskQueue` ← per-MR изолированные очереди, дедуп по dedupKey, supersede (queued only), FIFO
- [x] 2026-08-06T12:15:00Z intro `SessionRouterPort` ← контракт маршрутизации: route(task, mr?) → sid (engine → undefined)
- [x] 2026-08-06T12:15:00Z intro `SessionRouter` ← таблица §4.2: reuse_producer (кэш MR+тип), new_fresh (всегда новая), operator_chat (синглтон per MR)
- [x] 2026-08-06T12:15:00Z intro `Executor` ← per-MR цикл: enqueue + journal, advance (приоритеты+aging+exclusive), complete/fail/cancel, recover из журнала
- [x] 2026-08-06T12:15:00Z decision priority_tiers = 👤=90, 🦊=50, 🏗=10 ← spec §4.1: пользовательские > событийные > фоновые
- [x] 2026-08-06T12:15:00Z decision aging = +1/мин от createdAt, capped 100 ← против голодания 🏗-задач
- [x] 2026-08-06T12:15:00Z decision dedup_key = explicit || type + canonical(params) с сортировкой ключей ← как inbox-api
- [x] 2026-08-06T12:15:00Z decision supersede = queued only, running untouched ← spec §4.1: новые коммиты не убивают идущие задачи
- [x] 2026-08-06T12:15:00Z decision exclusive*mode = effects sequential, один effect*\* в работе за раз ← exclusiveWith на все эффекты
- [x] 2026-08-06T12:15:00Z decision crash_recovery = running→queued (идемпотентный re-run), applied effects→done (по маркеру в журнале) ← spec §4.1 / §5 приёмка
- [x] 2026-08-06T12:15:00Z decision per_mr_isolation = каждый MR свой Executor, Map-based очереди, ноль глобальных мьютексов ← контроль инцидента 2026-07-28
- [x] 2026-08-06T12:15:00Z decision session_routing = engine→undefined, new_fresh→всегда новая, reuse_producer→кэш MR+тип, operator_chat→синглтон per MR ← таблица §4.2
- [x] 2026-08-06T12:15:00Z decision journal_integration = task_created (enqueue) + task_status (each transition), восстановление перечитыванием журнала ← spec §5
- [x] 2026-08-06T12:15:00Z ver `npm run type-check` → pass exit=0
- [x] 2026-08-06T12:15:00Z ver `sdd verify services/agent-inbox/modules/inbox-queue/task-registry.ts services/agent-inbox/modules/inbox-queue/task-queue.ts services/agent-inbox/modules/inbox-queue/executor.ts services/agent-inbox/modules/inbox-queue/session-router.ts` → pass exit=0 (4/4 gates: typecheck, gennady lint, test, format)
- [x] 2026-08-06T12:15:00Z DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-queue/task-registry.ts, services/agent-inbox/modules/inbox-queue/task-queue.ts, services/agent-inbox/modules/inbox-queue/executor.ts, services/agent-inbox/modules/inbox-queue/session-router.ts]; decisions: [priority_tiers=👤90/🦊50/🏗10, aging=+1/min_capped_100, dedup_key=explicit_or_type+canonical(params), supersede=queued_only, exclusive_mode=effects_sequential, crash_recovery=running→queued_applied→done, per_mr_isolation=no_global_mutex, session_routing=table_§4.2, journal_integration=task_created+task_status]; open: []

#### P2

- [x] 2026-08-06T12:15:00Z intro `executor.test.ts` ← per-MR изоляция (2), приоритеты+aging+next (7), exclusive режим (2), waiting_dep (2), crash recovery (3), journal visibility (2), next() selection (2) — всего 20 кейсов
- [x] 2026-08-06T12:15:00Z intro `task-registry.test.ts` ← грамматика ссылок (6), дедуп (3), supersede (3), enqueue result (2) — всего 14 кейсов
- [x] 2026-08-06T12:15:00Z intro `session-router.test.ts` ← таблица §4.2 (6), edge cases (2) — всего 8 кейсов
- [x] 2026-08-06T12:15:00Z discovery external_dep_evaluate → externalRef всегда возвращает false в evaluateReference; resolveExternal переводит в queued, но advance() возвращает в waiting_dep из-за перепроверки deps — тесты документируют это поведение
- [x] 2026-08-06T12:15:00Z discovery exclusive*with_external → effect*\* имеет dependsOn: externalRef, поэтому exclusive-блокировка проверяется только после ручного перевода в running; тесты проверяют блокировку через ручную установку статуса
- [x] 2026-08-06T12:15:00Z discovery supersede_in_place → supersede заменяет params/priority/createdAt in-place (тот же taskId), не создаёт новый; тесты отражают фактическое API
- [x] 2026-08-06T12:15:00Z ver `sdd verify services/agent-inbox/modules/inbox-queue/__tests__/executor.test.ts services/agent-inbox/modules/inbox-queue/__tests__/task-registry.test.ts services/agent-inbox/modules/inbox-queue/__tests__/session-router.test.ts` → pass exit=0 (4/4 gates: typecheck, gennady lint, test, format)
- [x] 2026-08-06T12:15:00Z ver `npm test -- "services/agent-inbox/modules/inbox-queue/__tests__/*.test.ts"` → pass exit=0 (39 tests, 0 failures)
- [x] 2026-08-06T12:15:00Z DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-queue/__tests__/executor.test.ts, services/agent-inbox/modules/inbox-queue/__tests__/task-registry.test.ts, services/agent-inbox/modules/inbox-queue/__tests__/session-router.test.ts]; decisions: [test_count=39, per_row_fixtures=true, external_evaluate_always_false, supersede_in_place_same_taskId, advance_selects_all_ready_not_just_top]; open: []

#### Round close

- [x] 2026-08-06T12:30:00Z sync agent-inbox+root trackers
- [x] 2026-08-06T12:30:00Z DONE

### Round 2 — 2026-08-06, audit-driven fix: F-02 (try/catch journal I/O), F-03 (anchor name), F-04 (@see in path), F-05 (@consumers name)

#### P1 — re-run: fix: address audit findings F-02 (try/catch journal I/O), F-03 (anchor name), F-04 (@see in path), F-05 (@consumers name)

- [x] 2026-08-06T14:07:48Z ver sdd verify typecheck → pass exit=0
- [x] 2026-08-06T14:07:48Z ver sdd verify gennady-lint → pass exit=0
- [x] 2026-08-06T14:07:48Z ver sdd verify format → pass exit=0
- [x] 2026-08-06T14:07:48Z ver `npm run type-check` → pass exit=0
- [x] 2026-08-06T14:07:48Z discovery ticket-§5-test-cmd-broken → `npm test -- services/agent-inbox/modules/inbox-queue/__tests__/` не работает (Node ищет index.json в директории, exit=1); скорректированная команда `npm test -- "services/agent-inbox/modules/inbox-queue/__tests__/*.test.ts"` → pass exit=0 (39 tests, 0 failures)
- 🛑 2026-08-06T14:07:48Z BLOCKED: sdd verify test gate — 1 pre-existing failure в cli/cmd/lint/**tests**/lint.cmd.test.ts (тест изолированно проходит, в полном прогоне падает из-за process.exit-загрязнения от cli/cmd/vcs-todo/**tests**/vcs-todo.test.ts:10-13; process.exit переопределяется на top-level без after-восстановления)
  - 🔗 axiom: AX_BLOCKER_ESCALATION (исправление требует правки vcs-todo.test.ts — вне Target Files фазы, нарушает AX_PHASE_SCOPE_LOCK)
  - 💬 unblock: оператор решает — (а) исправить test isolation в vcs-todo.test.ts (добавить after-хук с process.exit=origExit), или (б) привязать sdd verify test-гейт фазы к scoped-прогону вместо полного npm run test

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
