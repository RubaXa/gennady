# Task: TSK-162 — inbox-api: REST/SSE + DTO-проекции

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-162
- **Status:** [ ] TODO
- **Purpose:** REST (10 эндпоинтов) + SSE (фреймы+топология), DTO-проекции доски/ленты/очереди из журнала+sync (не из летучей памяти), enqueue с дедупом, decision→effect, degraded-канал.
- **Scope:** `agent-inbox`
- **Module:** `inbox-api`
- **Dependencies:** TSK-158, TSK-159
- **Spec References:**
  - Module spec: [inbox-api](../../specs/agent-inbox/inbox-api/inbox-api.spec.md) §2–§4
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

- **Objective:** Роутеры (boot/board/state/feed/task/artifact/chat/decision/stream/diagnostics), DTO (MrCard/FeedWidget/TaskDto/BootDto + payload per type), BoardProjection (attention-группы из sync + журнал, syncState degraded), FeedProjection (журнал → виджеты, курсор, lastReadAt при выдаче), EnqueueRouter (дедуп явный/вычисленный), DecisionRouter (accept/edit→{taskId}, reject→204), SSE-топология (board_hint/dryrun во все каналы).
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/projections/board-projection.ts`
  - `services/agent-inbox/modules/inbox-api/projections/feed-projection.ts`
  - `services/agent-inbox/modules/inbox-api/dto/mr-card.type.ts`
  - `services/agent-inbox/modules/inbox-api/dto/feed-widget.type.ts`
  - `services/agent-inbox/modules/inbox-api/routers/`
- **Inputs:** TSK-158 (sync-снимок), TSK-159 (очередь), TSK-157 (журнал/lastReadAt)
- **Exit:** `npm run type-check` exit 0; проекции не читают память executors
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** контракт-тесты DTO/роутеров: board без мерцания, enqueue дедуп, decision-маппинг, feed-курсор+lastReadAt, degraded-флаг, SSE-фреймы.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/__tests__/board-projection.test.ts`
  - `services/agent-inbox/modules/inbox-api/__tests__/routers.test.ts`
  - `services/agent-inbox/modules/inbox-api/__tests__/feed-projection.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** контрактная поверхность для живого дашборда

**Scenario:** типинг-контракт DTO [`contract`]

- **Given** MrCard/FeedWidget/TaskDto/BootDto со всеми полями §4 спеки
- **When** type-check
- **Then** FeedWidget.type замкнут (7 значений); BootDto.phase замкнут; counters присутствуют

**Scenario:** доска после ready не мерцает [`integration`]

- **Given** sync-снимок с ролями + журнал очередей
- **When** GET /api/board в любой момент после ready
- **Then** группы заполнены консистентно; карточка не меняет группу >1 раза; syncState=ok

**Scenario:** enqueue дедуплит [`integration`]

- **Given** POST /task {type, params} дважды (без dedupKey)
- **When** сервер вычисляет dedupKey из type+canonical(params)
- **Then** оба ответа несут один taskId

**Scenario:** decision порождает эффект или 204 [`integration`]

- **Given** proposal в журнале
- **When** POST /decision accept → {taskId} эффекта в очереди; reject → 204 + decision в журнале
- **Then** эффект виден в state; reject не ставит задачу

**Scenario:** feed выдача двигает read-cursor [`integration`]

- **Given** журнал с 5 записями
- **When** GET /feed?cursor=0
- **Then** lastReadAt ≥ ts 5-й записи; 📬 на следующей доске = 0

**Scenario:** artifact path traversal отклоняется [`integration`]

- **Given** артефакты MR в report-каталоге
- **When** GET /api/mr/:ref/artifact?path=../../outside.json
- **Then** 4xx structured error; контент вне границы не отдан

**Scenario:** деградация sync видна [`integration`]

- **Given** sync на паузе после ready
- **When** GET /api/board и активные стримы
- **Then** syncState: degraded; board_hint во всех MR-каналах; группы не обнулены

**Scenario:** доменная ошибка — structured envelope [`contract`]

- **Given** POST /decision с несуществующим proposalId
- **When** обработка
- **Then** `{error:{code,message,anchor?}}`; сервер не падает; очередь пуста
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                         | Required by      |
| --------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                            | typescript-rules |
| `npm test -- services/agent-inbox/modules/inbox-api/__tests__/` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- типинг-DTO → `routers.test.ts` :: `contract: dto envelopes are closed worlds`
- без мерцания → `board-projection.test.ts` :: `board is consistent after ready`
- дедуп → `routers.test.ts` :: `enqueue dedupes by computed key`
- decision → `routers.test.ts` :: `decision accept enqueues effect reject returns 204`
- read-cursor → `feed-projection.test.ts` :: `feed issuance advances lastReadAt`

- traversal → `routers.test.ts` :: `artifact path traversal is rejected`
- degraded → `board-projection.test.ts` :: `degraded sync is visible on board and streams`
- structured error → `routers.test.ts` :: `domain errors are structured envelopes`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- inbox-api/__tests__` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
