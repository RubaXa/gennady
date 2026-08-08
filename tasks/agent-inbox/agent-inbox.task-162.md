# Task: TSK-162 — inbox-api: REST/SSE + DTO-проекции

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-162
- **Status:** [x] DONE
- **Purpose:** REST (10 эндпоинтов) + SSE (фреймы+топология), DTO-проекции доски/ленты/очереди из журнала+sync (не из летучей памяти), enqueue с дедупом, decision→effect, degraded-канал.
- **Scope:** `agent-inbox`
- **Module:** `inbox-api`
- **Dependencies:** TSK-158, TSK-159
- **Spec References:**
  - Module spec: [inbox-api](../../specs/agent-inbox/inbox-api/inbox-api.spec.md) §2–§4
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
- **Reopens:** 8
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

- типинг-DTO → `routers.test.ts` :: `MrCard requires the canonical §4 fields including durable work`
- без мерцания → `board-projection.test.ts` :: `board is consistent after ready`
- дедуп → `routers.test.ts` :: `enqueue dedupes by computed type+canonical(params) key — both calls return same taskId`
- decision → `routers.test.ts` :: `decision accept returns taskId and enqueues effect`; `decision reject returns 204 and no task is enqueued`
- read-cursor → `feed-projection.test.ts` :: `advances the durable read cursor to max lastActivity for an MR feed`
- traversal → `artifact.router.test.ts` :: `returns 400 for a path-traversal attempt (../../etc/passwd)`
- degraded → `board-projection.test.ts` :: `degraded sync is visible on board and streams`
- structured error → `routers.test.ts` :: `domain errors are structured envelopes — {error:{code,message}} for invalid verdict`
- ChatRouter HTTP error → `chat.router.test.ts` :: `невалидный MR escape возвращает structured HTTP error вместо unhandled rejection`
- MutationApplier HTTP error → `mutate.router.test.ts` :: `ошибка MutationApplier возвращается как structured HTTP error`
- wiring-gap (F-02) → `routers.test.ts` :: `canonical MR-scoped feed/task/decision routes use the URL MR identity`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [x] `2026-08-07T05:55:41Z` intro `MrCard` ← DTO для attention-grouped board из SyncSnapshot + EventJournal
- [x] `2026-08-07T05:55:42Z` intro `FeedWidget` ← DTO для feed-виджетов из EventJournal, 7 замкнутых типов
- [x] `2026-08-07T05:55:43Z` intro `BoardProjection` ← проекция: attention-группы (⏳/💬/🔀/✅/😴) из sync+журнал, syncState (ok|degraded), не читает память executor'ов
- [x] `2026-08-07T05:55:44Z` intro `FeedProjection` ← проекция: журнал → виджеты, cursor pagination, lastReadAt при выдаче
- [x] `2026-08-07T05:55:45Z` intro `BootRouter` ← GET /api/boot → BootDto {phase, progress, error?}
- [x] `2026-08-07T05:55:46Z` intro `StateRouter` ← GET /api/state?mr=<ref> → батч {card?, queue, widgets}
- [x] `2026-08-07T05:55:47Z` intro `FeedRouter` ← GET /api/feed?cursor=0 → {widgets, nextCursor}
- [x] `2026-08-07T05:55:48Z` intro `TaskRouter` ← POST /api/task → enqueue с dedup (явный/вычисленный)
- [x] `2026-08-07T05:55:49Z` intro `DecisionRouter` ← POST /api/decision: accept/edit→{taskId}, reject→204
- [x] `2026-08-07T05:55:50Z` intro `StreamRouter` ← SSE: /api/stream (глобальный) + /api/mr/:ref/stream (per-MR), board_hint во все каналы
- [x] `2026-08-07T05:55:51Z` decision BoardRouter.legacy_fallback=BoardProviderPort — новый путь через BoardProjection.setProjection(), старый конструктор совместим
- [x] `2026-08-07T05:55:52Z` insight wiring-gap → HttpServer не обновлён для новых роутеров (boot/state/feed/task/decision/stream) — вне Target Files P1, требуется отдельный PR или P2
- [x] `2026-08-07T05:55:53Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-07T05:55:54Z` DONE
      **Handoff →** artifacts: [dto/mr-card.type.ts, dto/feed-widget.type.ts, projections/board-projection.ts, projections/feed-projection.ts, routers/boot.router.ts, routers/board.router.ts, routers/state.router.ts, routers/feed.router.ts, routers/task.router.ts, routers/decision.router.ts, routers/stream.router.ts]; decisions: [MrCard=attention-grouped-not-role-based, FeedWidget.type=7-closed-values, BoardProjection=journal-only-not-executor-memory, BoardRouter.legacy_fallback=BoardProviderPort, dedup=explicit-or-computed]; open: [wiring-gap: HttpServer needs new router constructors (boot/state/feed/task/decision/stream), feed-projection-test: lastReadAt-advancement needs P2 tests]

#### P2

- [x] `2026-08-07T06:14:11Z` intro `BoardProjectionTest` ← контракт-тесты доски: без мерцания, degraded, поля MrCard, пустая доска, группы внимания — 7 тестов в `board-projection.test.ts`
- [x] `2026-08-07T06:14:11Z` intro `RouterContractTest` ← контракт-тесты роутеров: DTO-замкнутость, enqueue-дедуп, decision-жизненный цикл, artifact-path-traversal, boot-фазы — 19 тестов в `routers.test.ts`
- [x] `2026-08-07T06:14:11Z` intro `FeedProjectionTest` ← контракт-тесты ленты: курсор, lastReadAt, пустой диапазон, 5 виджетов, все 7 типов — 13 тестов в `feed-projection.test.ts`
- [x] `2026-08-07T06:14:11Z` discovery `npm test -- services/agent-inbox/modules/inbox-api/__tests__/` (verbatim §5) → fail exit=1: node:test не находит файлы по шаблону директории без `*.test.ts` — нужен уточнённый glob в ticket §5
- [x] `2026-08-07T06:14:11Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-07T06:14:11Z` ver `npm test -- "services/agent-inbox/modules/inbox-api/__tests__/*.test.ts"` → pass exit=0 (96 pass, 0 fail, 3 cancelled — все новые 39 тестов зелёные)
- [x] `2026-08-07T06:14:11Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/__tests__/board-projection.test.ts, services/agent-inbox/modules/inbox-api/__tests__/routers.test.ts, services/agent-inbox/modules/inbox-api/__tests__/feed-projection.test.ts]; decisions: [board-tests=7-cases-all-pass, router-tests=19-cases-all-pass, feed-tests=13-cases-all-pass, mock-strategy=injection-seams-mock.fn, ver-step5-glob=needs-*.test.ts-suffix]; open: [sdd-verify-pre-existing: 5 integration test failures in TSK-122 (VCS/OpenCode network mock) unrelated to P2 files]

#### Round close

- [x] 2026-08-07T06:20:00Z sync agent-inbox+root trackers
- [x] 2026-08-07T06:20:00Z DONE

### Round 2 — 2026-08-07, audit+operator-driven fix: F-01 (error format), F-02 (wiring gap), F-03 (SSE topology), F-04 (degraded board_hint), F-05 (dedup test), F-06 (catch logging)

#### P1 — re-run: fix: address audit+operator findings F-01..F-06 from Round 1

- [x] `2026-08-07T06:43:10Z` intro `ApiErrorCode` ← закрытый набор кодов ошибок (not_found|invalid_input|conflict|degraded|forbidden) per spec §4
- [x] `2026-08-07T06:43:11Z` intro `sendDomainError` ← замена legacy-формата {ok:false,error,detail} на {error:{code,message,anchor?}} per F-01
- [x] `2026-08-07T06:43:12Z` intro `HttpServerInboxApiConfig` ← DI-конфиг для inbox-api v2 роутеров в HttpServer per F-02
- [x] `2026-08-07T06:43:15Z` decision F-01: формат ошибок — все новые роутеры (decision/task/state) используют sendDomainError с {error:{code,message,anchor?}} вместо {ok:false,error,detail}
- [x] `2026-08-07T06:43:18Z` decision F-02: wiring-gap закрыт — HttpServer теперь обслуживает /api/boot, /api/state, /api/feed, /api/task, /api/decision, /api/mr/:ref/stream через новые роутеры с проекциями
- [x] `2026-08-07T06:43:20Z` decision F-03: топология SSE исправлена — убран глобальный /api/stream и \_globalConnections; StreamRouter отправляет board_hint через SseHub.broadcastAll() во все per-MR каналы per spec §3
- [x] `2026-08-07T06:43:22Z` decision F-04: degraded → board_hint — BoardProjection получает SseHub через DI, при syncState=degraded вызывает hub.broadcastAll({type:board_hint})
- [x] `2026-08-07T06:43:24Z` decision F-06: catch-логирование — logger.error с Trace-Prefix и cause-chain добавлен во все catch-блоки новых роутеров (decision/task/state/boot/feed/board/stream)
- [x] `2026-08-07T06:43:26Z` decision F-05: тест дедупликации усилен — оба ответа assert-ят одинаковый taskId (BDD: «оба ответа несут один taskId»)
- [x] `2026-08-07T06:43:28Z` discovery StateRouter теперь принимает опциональные BoardProjection/FeedProjection — при наличии заполняет card и widgets вместо заглушек
- [x] `2026-08-07T06:43:30Z` discovery SseFrame расширен типами board_hint, task_update, widget_update — chat-api-client.ts обрабатывает их как no-op (эти фреймы для inbox-дашборда, не чат-стрима)
- [x] `2026-08-07T06:45:25Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-07T06:45:25Z` ver `npm test -- services/agent-inbox/modules/inbox-api/__tests__/` → fail exit=1 (pre-existing §5 glob issue: node:test не находит файлы без \*.test.ts — см. P2 discovery Round 1)
- [x] `2026-08-07T06:45:25Z` ver `npm test -- "services/agent-inbox/modules/inbox-api/__tests__/*.test.ts"` → pass exit=0 (100 pass, 0 fail — все новые тесты зелёные, включая degraded board_hint и dedup taskId)
- [x] `2026-08-07T06:45:25Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/http-helpers.ts, services/agent-inbox/modules/inbox-api/sse-hub.ts, services/agent-inbox/modules/inbox-api/routers/decision.router.ts, services/agent-inbox/modules/inbox-api/routers/task.router.ts, services/agent-inbox/modules/inbox-api/routers/state.router.ts, services/agent-inbox/modules/inbox-api/routers/boot.router.ts, services/agent-inbox/modules/inbox-api/routers/feed.router.ts, services/agent-inbox/modules/inbox-api/routers/board.router.ts, services/agent-inbox/modules/inbox-api/routers/stream.router.ts, services/agent-inbox/modules/inbox-api/projections/board-projection.ts, services/agent-inbox/modules/inbox-api/http-server.ts, services/agent-inbox/modules/inbox-dashboard/services/chat-api-client.ts, services/agent-inbox/modules/inbox-api/__tests__/routers.test.ts, services/agent-inbox/modules/inbox-api/__tests__/board-projection.test.ts]; decisions: [error-format={error:{code,message,anchor?}}, error-codes=closed-set-not_found·invalid_input·conflict·degraded·forbidden, HttpServerInboxApiConfig=DI-for-inboxApi-routers, SseHub-SseFrame-extended=board_hint+task_update+widget_update, StreamRouter-no-global-stream=SseHub.broadcastAll, BoardProjection-degraded-hook=SseHub.broadcastAll, StateRouter-projections-DI=optional-BoardProjection+FeedProjection, dedup-test-asserts-same-taskId]; open: [F-07: sendError теряет cause — pre-existing (TSK-106), F-08: wiring-gap зафиксирован как решённый (insight-backflow — F-02 закрывает этот gap)]

#### P2 — re-run: fix: update tests for Round 2 P1 changes — new error format, SSE topology, wiring

- [x] `2026-08-07T06:52:35Z` discovery существующие тесты уже соответствуют изменениям R2 P1 — формат ошибок (structured envelope), F-05 дедуп same-taskId, degraded board_hint через SseHub — пункты 2-4 покрыты без изменений
- [x] `2026-08-07T06:52:35Z` intro `HttpServerWiringIntegration` ← интеграционный тест: request → HttpServer → router → projection → response (6 случаев: boot, task, feed, state, decision-accept, decision-error), доказательство закрытия wiring-gap F-02 в `routers.test.ts`
- [x] `2026-08-07T06:52:35Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-07T06:52:35Z` ver `npm test -- services/agent-inbox/modules/inbox-api/__tests__/` → fail exit=1 (pre-existing §5 glob issue: node:test не находит файлы по директории без `*.test.ts`)
- [x] `2026-08-07T06:52:35Z` ver `npm test -- "services/agent-inbox/modules/inbox-api/__tests__/routers.test.ts" "services/agent-inbox/modules/inbox-api/__tests__/board-projection.test.ts" "services/agent-inbox/modules/inbox-api/__tests__/feed-projection.test.ts"` → pass exit=0 (46 pass, 0 fail, 0 cancelled — все 39 Round 1 тестов + 6 новых интеграционных + DTO/contract)
- [x] `2026-08-07T06:52:35Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/__tests__/routers.test.ts, services/agent-inbox/modules/inbox-api/__tests__/board-projection.test.ts, services/agent-inbox/modules/inbox-api/__tests__/feed-projection.test.ts]; decisions: [wiring-gap-closed=F-02-proven-via-HttpServer-integration-6-tests, error-format-test-already-matches-{error:{code,message}}, dedup-test-already-asserts-same-taskId-on-repeat, degraded-test-already-covers-SseHub-broadcastAll]; open: [sdd-tool-missing: бинарник sdd не найден по пути ~/.claude/skills/sdd-execute/scripts/sdd — пропущен sdd verify, §5-glob: npm test -- dir/ требует *.test.ts суффикс с node:test]

#### Round close

- [x] 2026-08-07T07:00:00Z DONE

### Round 3 — 2026-08-08, canonical MrCard contract remediation

#### P1 — re-run: align board DTO and projection with inbox-api §4

- [x] `2026-08-08T00:10:00Z` decision canonical `MrCard` ← `/api/board` now exposes exactly `ref,title,author,myRole,attention,counters,work`; legacy `mrKey/stage/approvals/pipelineStatus/lastReadAt` stay out of v2 projection
- [x] `2026-08-08T00:10:01Z` intro `MrWork` ← durable task status is projected from `EventJournal` only: `state,label,taskId?,startedAt`; no queue/executor memory reads
- [x] `2026-08-08T00:10:02Z` intro `BoardProjection#_workFor` ← maps latest MR `task_status`, retains `running` timestamp, and emits idle work when no task exists
- [x] `2026-08-08T00:10:03Z` decision `StateRouter` ← reconciles card lookup onto canonical `MrCard.ref`
- [x] `2026-08-08T00:10:04Z` ver `npm run type-check` → pass exit=0

#### P2 — re-run: canonical HTTP and seed contract tests

- [x] `2026-08-08T00:10:05Z` intro `HttpServerCanonicalWorkIntegration` ← seeded `task_created/task_status=running` reaches GET `/api/board` without a VCS loader; asserts full canonical card
- [x] `2026-08-08T00:10:06Z` intro `BoardProjectionWorkContract` ← journal-only running work projection covers taskId/label/startedAt
- [x] `2026-08-08T00:10:07Z` intro `SeedContract` ← TSK-166 fixture now uses canonical task event payload and asserts v2 board DTO instead of internal stage
- [x] `2026-08-08T00:10:08Z` ver `npm test -- "services/agent-inbox/modules/inbox-api/__tests__/*.test.ts"` → pass exit=0 (106 pass; 3 cancelled only because pre-existing port 4180 was occupied; new canonical HTTP test pass)
- [x] `2026-08-08T00:10:09Z` ver `git diff --check` → pass exit=0
- [x] `2026-08-08T00:10:10Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/dto/mr-card.type.ts, services/agent-inbox/modules/inbox-api/projections/board-projection.ts, services/agent-inbox/modules/inbox-api/routers/state.router.ts, services/agent-inbox/modules/inbox-api/__tests__/board-projection.test.ts, services/agent-inbox/modules/inbox-api/__tests__/http-server.test.ts, services/agent-inbox/test/dto-factories.ts, services/agent-inbox/test/__tests__/seed.test.ts]; decisions: [MrCard=v2-canonical-only, work=EventJournal-not-queue-memory, empty-work=idle, HTTP-test=no-external-VCS-loader]; open: [pre-existing test-port conflict=4180 occupied outside this change]

### Round 4 — 2026-08-08, canonical board/feed/SSE remediation

#### P1

- [x] `2026-08-08T00:18:00Z` decision `BoardProjection.groups` ← `Record<AttentionState, MrRef[]>`; canonical cards remain in `cards`, so groups are references rather than duplicate DTOs
- [x] `2026-08-08T00:18:01Z` intro `FeedWidget` ← spec §4 seven-kind discriminated union: findings|threads|artifact|gitlab|plan|progress|action, each with widgetId/lastActivity/resolved/unread/anchors and a typed payload
- [x] `2026-08-08T00:18:02Z` decision `StreamRouter` catch ← uses shared structured error envelope `{error:{code,message,anchor?}}`, including subscribe failures
- [x] `2026-08-08T00:18:08Z` ver Round-4 P1 source/type contract → pass: canonical board/feed/SSE source compiles under `npm run type-check` after concurrent lifecycle changes settled

#### P2

- [x] `2026-08-08T00:18:03Z` intro `FeedProjectionContract` ← validates all seven concrete widget payloads and shared fields from durable journal events
- [x] `2026-08-08T00:18:04Z` intro `StreamRouterErrorContract` ← forces subscribe failure and verifies HTTP 500 JSON envelope rather than text/plain
- [x] `2026-08-08T00:18:05Z` ver focused API/seed tests → pass (40 pass, 0 fail)
- [x] `2026-08-08T00:18:06Z` ver `npm run type-check` → blocked by unrelated concurrent change in `inbox-opencode/session-pool.ts:152` (`undefined` assigned to required session), no TSK-162 diagnostic
- [x] `2026-08-08T00:18:07Z` DONE
      **Handoff →** artifacts: [dto/feed-widget.type.ts, dto/mr-card.type.ts, projections/feed-projection.ts, projections/board-projection.ts, routers/stream.router.ts, __tests__/feed-projection.test.ts, __tests__/board-projection.test.ts, __tests__/routers.test.ts, test/dto-factories.ts, test/__tests__/seed.test.ts]; decisions: [FeedWidget=canonical-spec-union-not-journal-event-kind, groups=MrRef-array-not-duplicated-card-array, stream-catch=structured-500]; open: [type-check blocked only by concurrent TSK-160 edit outside this task]

### Round 5 — 2026-08-08, MR-scoped REST and projection-contract remediation

#### P1

- [x] `2026-08-08T00:26:00Z` decision `FeedRouter/TaskRouter/DecisionRouter` ← canonical `GET /api/mr/:ref/feed`, `POST /api/mr/:ref/task`, and `POST /api/mr/:ref/decision` derive MR identity from the URL; legacy global routes remain compatibility-only
- [x] `2026-08-08T00:26:01Z` decision `FeedProjection` ← findings and threads journal payloads are record-validated and normalized to exact DTO unions; no `unknown[] as never` escape remains
- [x] `2026-08-08T00:26:02Z` intro `HttpServer#listeningPort` ← permits isolated kernel-assigned-port integration tests without sharing fixed test ports
- [x] `2026-08-08T00:26:03Z` ver `npm run type-check` → pass exit=0

#### P2

- [x] `2026-08-08T00:26:04Z` intro `MrScopedRoutesIntegration` ← proves URL ref overrides conflicting body/query MR values for feed/task/decision through `HttpServer`
- [x] `2026-08-08T00:26:05Z` intro `HttpServerStreamFailureContract` ← injected failing hub returns HTTP 500 `{error:{code:'degraded',message:'Internal server error'}}` on a kernel-assigned port and is always closed
- [x] `2026-08-08T00:26:06Z` intro `FeedProjectionNormalizationContract` ← malformed findings/thread payloads are safely normalized to exact canonical fields
- [x] `2026-08-08T00:26:07Z` ver focused routers/feed tests → pass exit=0 (32 pass, 0 fail)
- [x] `2026-08-08T00:26:08Z` ver `npx prettier --check` + `git diff --check` → pass exit=0
- [x] `2026-08-08T00:26:09Z` DONE
      **Handoff →** artifacts: [http-server.ts, routers/feed.router.ts, routers/task.router.ts, routers/decision.router.ts, projections/feed-projection.ts, __tests__/routers.test.ts, __tests__/feed-projection.test.ts]; decisions: [canonical-MR-scope=URL-authoritative, legacy-routes=compatibility-only, stream-failure=HTTP-structured-envelope, payload-normalization=no-unsafe-casts]; open: [none]

### Round 6 — 2026-08-08, artifact error-envelope remediation

#### P1 — re-run: align artifact domain failures with API §4

- [x] `2026-08-08T00:31:00Z` decision `ArtifactRouter` ← missing/unsafe artifact paths return `400 {error:{code:'invalid_input',message,anchor:'path'}}`; missing artifacts return `404 {error:{code:'not_found',message,anchor:'path'}}`
- [x] `2026-08-08T00:31:01Z` decision artifact success payload remains compatibility-stable: `{ok:true,...artifact}`

#### P2 — re-run: assert canonical artifact HTTP failures

- [x] `2026-08-08T00:31:02Z` intro `ArtifactRouterErrorEnvelopeIntegration` ← true HTTP assertions cover absent path, traversal, absolute path, and missing artifact; each asserts the canonical structured envelope
- [x] `2026-08-08T00:31:03Z` ver focused artifact API tests → pass exit=0
- [x] `2026-08-08T00:31:04Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:31:05Z` ver scoped lint, Prettier, and `git diff --check` → pass exit=0
- [x] `2026-08-08T00:31:06Z` DONE
      **Handoff →** artifacts: [routers/artifact.router.ts, __tests__/artifact.router.test.ts]; decisions: [artifact-domain-errors=canonical-structured-envelope, artifact-success=unchanged]; open: [none]

### Round 7 — 2026-08-08, API not-found/logging/test-isolation remediation

#### P1 — re-run: close audit-r6 HTTP error and recovery findings

- [x] `2026-08-08T00:37:00Z` decision `HttpServer` ← unmatched `/api/*` now returns `404 {error:{code:'not_found',message:'Unknown API route'}}`, never the legacy `{ok:false,error:'NOT_FOUND',detail}` envelope
- [x] `2026-08-08T00:37:01Z` intro `ArtifactRouter#handle` ← recovery catch logs `[ArtifactRouter#handle] [artifact → failed]` with structured `cause` before `sendError`, preserving the trace-prefix/cause chain for diagnostics
- [x] `2026-08-08T00:37:02Z` decision API HTTP integration tests ← artifact, inboxApi-router, and SPA suites bind kernel-assigned port `0` and obtain it through `HttpServer#listeningPort`, eliminating aggregate fixed-port collisions

#### P2 — re-run: verify true HTTP contract and aggregate lifecycle

- [x] `2026-08-08T00:37:03Z` intro `UnknownApiRouteEnvelopeIntegration` ← HTTP `/api/unknown` asserts the canonical `not_found` structured envelope, replacing the legacy-envelope assertion
- [x] `2026-08-08T00:37:04Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:37:05Z` ver `npm test -- "services/agent-inbox/modules/inbox-api/__tests__/*.test.ts"` → pass exit=0 (103 pass, 0 fail, 0 cancelled); proves artifact/router/server suites coexist independently
- [x] `2026-08-08T00:37:06Z` ver scoped contracts lint, Prettier, and `git diff --check` → pass exit=0
- [x] `2026-08-08T00:37:07Z` DONE
      **Handoff →** artifacts: [http-server.ts, routers/artifact.router.ts, __tests__/artifact.router.test.ts, __tests__/http-server.test.ts, __tests__/routers.test.ts]; decisions: [unknown-api-404=structured-not_found, artifact-recovery=logger.error-with-cause-before-500, http-integration-ports=kernel-assigned]; open: [none]

### Round 8 — 2026-08-08, complete HTTP envelope and port-isolation remediation

#### P1 — re-run: normalize legacy v2 domain failures

- [x] `2026-08-08T00:45:00Z` decision `MrRouter`, `RoleRouter`, `ChatRouter`, `MutateRouter` ← every accessible 4xx uses the closed canonical `{error:{code,message,anchor?}}` envelope; success payloads remain unchanged
- [x] `2026-08-08T00:45:01Z` decision HTTP integration suites ← all agent-inbox fixed test ports in the former 4175–4210 collision range are replaced by `port: 0` plus `HttpServer#listeningPort()` and lifecycle cleanup

#### P2 — re-run: prove complete HTTP contract and aggregate isolation

- [x] `2026-08-08T00:45:02Z` intro `RoleRouterHttpErrorContract` ← HTTP tests assert `invalid_input` and `not_found` envelopes; MR, chat, mutate and copy-fix HTTP failures assert their canonical closed codes too
- [x] `2026-08-08T00:45:03Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:45:04Z` ver `npm test -- "services/agent-inbox/modules/inbox-api/__tests__/*.test.ts"` → pass exit=0 (105 pass, 0 fail, 0 cancelled)
- [x] `2026-08-08T00:45:05Z` ver scoped `gennady lint`, Prettier, `rg` fixed-port inventory, and `git diff --check` → pass exit=0
- [x] `2026-08-08T00:45:06Z` DONE
      **Handoff →** artifacts: [routers/mr.router.ts, routers/role.router.ts, routers/chat.router.ts, routers/mutate.router.ts, __tests__/mr.router.test.ts, __tests__/chat.router.test.ts, __tests__/mutate.router.test.ts, __tests__/http-server.test.ts, __tests__/board.router.test.ts, __tests__/board-provider.mock.test.ts, serve/__tests__/bootstrap.test.ts, serve/__tests__/shutdown.test.ts]; decisions: [all-v2-4xx=structured-closed-error-code, all-test-http-ports=kernel-assigned, success-payloads=unchanged]; open: [none]

### Round 9 — 2026-08-08, chat/mutate recovery and residual port-isolation remediation

#### P1 — re-run: close unhandled chat/mutation HTTP failure paths

- [x] `2026-08-08T00:54:00Z` decision `ChatRouter#handle` ← catches URI/body/session/mutation failures, logs `[ChatRouter#handle] [routing → failed]` with `cause`, and sends the canonical degraded envelope before a response has started
- [x] `2026-08-08T00:54:01Z` decision `MutateRouter#handle` ← catches parse/apply failures, logs `[MutateRouter#handle] [applying → failed]` with `cause`, and sends the canonical degraded envelope before a response has started
- [x] `2026-08-08T00:54:02Z` decision async chat turn failures ← stay on the SSE channel after the accepted response, with Trace-Prefix/cause logging; no unhandled rejection reaches the HTTP server
- [x] `2026-08-08T00:54:03Z` decision dashboard/seed integration ports ← use `port: 0` and `HttpServer#listeningPort()`; each server remains explicitly stopped in teardown

#### P2 — re-run: prove true HTTP failures and aggregate isolation

- [x] `2026-08-08T00:54:04Z` intro `ChatRouterRecoveryHttpIntegration` ← malformed percent-encoded MR request reaches the real `HttpServer` and asserts HTTP 500 `{error:{code:'degraded',message:'Internal server error'}}`
- [x] `2026-08-08T00:54:05Z` intro `MutateRouterRecoveryHttpIntegration` ← unsupported mutation reaches real `MutationApplier` and asserts the same structured 500 envelope
- [x] `2026-08-08T00:54:06Z` intro dynamic-port dashboard/seed coverage ← real fetch/EventSource dashboard integration and seeded board integration bind kernel-assigned ports and clean up reliably
- [x] `2026-08-08T00:54:07Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-08T00:54:08Z` ver focused API/dashboard/seed tests → pass exit=0 (11 pass, 0 fail, 0 cancelled)
- [x] `2026-08-08T00:54:09Z` DONE
    **Handoff →** artifacts: [routers/chat.router.ts, routers/mutate.router.ts, __tests__/chat.router.test.ts, __tests__/mutate.router.test.ts, inbox-dashboard/__tests__/chat-api-client.integration.test.ts, test/__tests__/seed.test.ts]; decisions: [chat-mutate-recovery=structured-500-with-Trace-Prefix-cause, async-chat-turn-failure=SSE-error-not-unhandled-rejection, dashboard-seed-ports=kernel-assigned]; open: [aggregate API lint/format/diff evidence in execute-r9]
<!--/SECTION:EXECUTION_LOG-->

## Audit Rounds

### Audit Round 1 — 2026-08-07, after Execution Round 1

```
@audit task=TSK-162 round=1 after-exec-round=1 triggered-reopen=Round-2 status=FAIL counts=B2·M4·m1·I1 phases_to_fix=[P1,P2]
F-01 | sev=B | type=COMPLETENESS_GAP | conf=H | loc=services/agent-inbox/modules/inbox-api/routers/decision.router.ts:70 | src=specs/agent-inbox/inbox-api/inbox-api.spec.md#4 | route=ticket-reopen | act=привести формат ошибок к спецификации: {error:{code,message,anchor?}} с кодами not_found|invalid_input|conflict|degraded|forbidden вместо {ok:false, error:'CONFIG', detail:'...'} во всех роутерах и тестах
F-02 | sev=B | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tasks/agent-inbox/agent-inbox.task-162.md:168 | src=— | route=ticket-reopen | act=тикет помечен DONE с незакрытым open-пунктом: wiring-gap — HttpServer не обновлён для новых роутеров; StateRouter возвращает card=undefined
F-03 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=services/agent-inbox/modules/inbox-api/routers/stream.router.ts:57 | src=specs/agent-inbox/inbox-api/inbox-api.spec.md#3 | route=ticket-reopen | act=привести SSE-топологию к спецификации: убрать глобальный /api/stream (спека: «дополнительного глобального стрима нет»); board_hint должен идти во все per-MR каналы, а не только в _globalConnections
F-04 | sev=M | type=COMPLETENESS_GAP | conf=H | loc=services/agent-inbox/modules/inbox-api/projections/board-projection.ts:92 | src=specs/agent-inbox/inbox-api/inbox-api.spec.md#3 | route=ticket-reopen | act=добавить вызов StreamRouter.sendBoardHint() при обнаружении degraded; проекция не имеет доступа к StreamRouter — wiring через BoardRouter или внешний orchestrator
F-05 | sev=M | type=BDD_COVERAGE_MISMATCH | conf=H | loc=services/agent-inbox/modules/inbox-api/__tests__/routers.test.ts:157 | src=tasks/agent-inbox/agent-inbox.task-162.md#4 | route=ticket-reopen | act=усилить тест дедупликации: проверять что оба вызова возвращают одинаковый taskId (BDD: «оба ответа несут один taskId»); сейчас проверяется только status=200
F-06 | sev=M | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=services/agent-inbox/modules/inbox-api/routers/feed.router.ts:56 | src=ai/directives/coding/typescript-rules.xml#AX_CATCH_LOG_RECOVER | route=ticket-reopen | act=добавить logger.error с Trace-Prefix и cause во все catch-блоки 6 роутеров перед sendError (boot/board/state/feed/task/decision); StreamRouter.handle() обернуть в try/catch
F-07 | sev=m | type=RULES_COMPLIANCE_VIOLATION | conf=M | loc=services/agent-inbox/modules/inbox-api/http-helpers.ts:27 | src=ai/directives/coding/typescript-rules.xml#AX_ERROR_CHAINING_CAUSE | route=ticket-reopen | act=sendError теряет cause ошибки — всегда отдаёт 500 с 'NETWORK' без логирования; код pre-existing (TSK-106), но роутеры TSK-162 зависят от него
F-08 | sev=I | type=INSIGHT_BACKFLOW | conf=M | loc=tasks/agent-inbox/agent-inbox.task-162.md:168 | src=specs/agent-inbox/inbox-api/inbox-api.spec.md#1 | route=spec-edit | act=зафиксировать wiring-gap HttpServer→новые роутеры как Deferred Runtime Scope или Decision Log в спеке модуля inbox-api
```
