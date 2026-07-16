# Task: TSK-129 — inbox-api: ChatRouter + MutateRouter + SseHub (Review Chat HTTP↔SSE мост)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-129 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-api | **Dependencies:** TSK-106 (HttpServer/routers, DONE), TSK-126 (ChatSession/ContextAssembler), TSK-127 (MutationApplier)
- **Purpose:** Тонкий HTTP↔SSE мост Review Chat поверх `inbox-chat` (D-111 — без бизнес-логики). `SseHub` — реестр SSE-подписчиков по MR, единый broadcast-канал (D-110) для стрима токенов И mutation/refresh-событий ВСЕМ клиентам этого MR, не только инициатору (D-100). `ChatRouter` — `POST /api/mr/:id/chat` (202, асинхронный ответ через SSE), `GET /api/mr/:id/chat/stream` (SSE-подписка), `POST /api/mr/:id/chat/undo`, `POST /api/mr/:id/chat/stop`. `MutateRouter` — `POST /api/mr/:id/mutate` (revision-CAS, 200/409), broadcast `mutation`+`refresh` после успеха.
- **Spec:** [inbox-api.spec.md](../../../specs/agent-inbox/inbox-api/inbox-api.spec.md#chatrouter), [inbox-api.spec.md#mutaterouter](../../../specs/agent-inbox/inbox-api/inbox-api.spec.md#mutaterouter), [inbox-api.spec.md#ssehub](../../../specs/agent-inbox/inbox-api/inbox-api.spec.md#ssehub), [agent-inbox.spec.md](../../../specs/agent-inbox/agent-inbox.spec.md) §5.2, CH-05, CH-11, D-89, D-99…D-100, D-104, D-110…D-111 | **Runtime:** real-runtime (через inbox-chat) | **Verification:** contract, unit, integration

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

- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/sse-hub.ts` — `SseHub`: `subscribe(mrRef, res)` (регистрирует SSE-соединение, отправляет `retry`/heartbeat), `unsubscribe(mrRef, res)` (на `close`), `broadcast(mrRef, frame)` (пишет кадр ВСЕМ подписчикам MR, D-100); синглтон на процесс сервера; запись в закрытый сокет — no-op, не бросает.
  - `services/agent-inbox/modules/inbox-api/routers/chat.router.ts` — `ChatRouter`: `POST /api/mr/:id/chat { text, chips }` → делегирует `ChatSession.ask()`, отвечает `202 { ok:true }` немедленно (не блокирует ожиданием хода, D-89), ход in-flight на `sid` → `409 { ok:false, error:'TURN_IN_FLIGHT' }` (D-104); `GET /api/mr/:id/chat/stream` (`text/event-stream`) — подписывает через `SseHub.subscribe`, превращает `ChatSession.onToken`/`onMutationProposed` события в кадры `{type:'token'}`/`{type:'turn_done'}`/`{type:'mutation'}`/`{type:'refresh'}`/`{type:'error'}`; `POST /api/mr/:id/chat/undo { snapshotId }` → делегирует `MutationApplier.undo()`, broadcast `refresh` всем подписчикам MR; `POST /api/mr/:id/chat/stop` → делегирует `ChatSession.stop()` (ack <200мс, CH-11).
  - `services/agent-inbox/modules/inbox-api/routers/mutate.router.ts` — `MutateRouter`: `POST /api/mr/:id/mutate { proposal, revision }` → делегирует `MutationApplier.apply()`; успешный CAS → `200 { ok:true, snapshot }` + broadcast `mutation`+`refresh` через `SseHub` ВСЕМ клиентам MR (D-100); CAS-конфликт → `409 { ok:false, error:'STALE_REVISION' }`, `review.json` не тронут, ВСЕ подписчики получают `refresh` (D-99).
  - `services/agent-inbox/modules/inbox-api/http-server.ts` — зарегистрировать `ChatRouter`/`MutateRouter` рядом с существующими роутерами (трактует wiring как тривиальное расширение существующего файла, не отдельная фаза).
- **Inputs:** P1 handoff (TSK-126: `ChatSession` события/API), P1 handoff (TSK-127: `MutationApplier.apply/undo`)
- **Exit:** typecheck pass; `POST /chat` не блокирует ответ ожиданием хода; `POST /mutate` при CAS-конфликте не модифицирует `review.json`; один SSE-канал на MR обслуживает и стрим, и mutation/refresh (D-110); роутеры не принимают решений о мутации/ходе — вся логика делегирована `inbox-chat`.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/__tests__/sse-hub.test.ts`
  - `services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts`
  - `services/agent-inbox/modules/inbox-api/__tests__/mutate.router.test.ts`
- **Inputs:** P1 handoff
- **Exit:** интеграционные тесты через `node:http.request`/EventSource-эквивалент; все BDD-сценарии секции 4 покрыты; сьют зелёный.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (`inbox-api.spec.md#chatrouter`, `#mutaterouter`, `#ssehub`).

**Feature:** HTTP↔SSE мост для Review Chat

**Scenario:** Типизация контракта ChatRouter/MutateRouter/SseHub [`contract`]

- **Given** `SseHub.broadcast(mrRef, frame)` и обработчики роутов
- **When** вызывающий код передаёт кадры SSE
- **Then** `frame` типизирован дискриминированным union по `type` (`'token'|'turn_done'|'mutation'|'refresh'|'error'`), обработчик исчерпывающе разбирает варианты (union exhaustiveness проверяется компилятором)

**Scenario:** POST /chat не блокирует ответ [`integration`]

- **Given** сервер запущен, `ChatSession.ask()` — долгая операция (симулированная задержка в тесте)
- **When** `POST /api/mr/:id/chat { text, chips }` вызывается
- **Then** ответ `202 { ok:true }` приходит немедленно, не дожидаясь завершения хода (D-89)

**Scenario:** POST /chat при in-flight ходе [`integration`]

- **Given** ход уже in-flight на `sid` этого MR
- **When** второй `POST /api/mr/:id/chat` вызывается
- **Then** `409 { ok:false, error:'TURN_IN_FLIGHT' }` (D-104)

**Scenario:** SSE-стрим вещает всем подписчикам MR [`integration`]

- **Given** два SSE-подключения на один и тот же `mrRef`
- **When** `SseHub.broadcast(mrRef, frame)` вызывается
- **Then** оба подключения получают кадр (D-100, multi-tab consistency)

**Scenario:** Успешный mutate — broadcast mutation+refresh [`integration`]

- **Given** валидный `proposal` и актуальная `revision`
- **When** `POST /api/mr/:id/mutate { proposal, revision }` вызывается
- **Then** `200 { ok:true, snapshot }`, все SSE-подписчики MR получают `mutation`+`refresh`

**Scenario:** CAS-конфликт на mutate — 409 + refresh всем [`integration`]

- **Given** устаревшая `revision`
- **When** `POST /api/mr/:id/mutate` вызывается
- **Then** `409 { ok:false, error:'STALE_REVISION' }` инициатору, `review.json` не тронут, ВСЕ подписчики получают `refresh` (D-99)

**Scenario:** Stop делегирует ChatSession.stop [`unit`]

- **Given** ход in-flight
- **When** `POST /api/mr/:id/chat/stop` вызывается
- **Then** `200 { ok:true }`, `ChatSession.stop()` вызван (ack <200мс, CH-11)

**Scenario:** Разрыв соединения — unsubscribe без исключения [`unit`]

- **Given** активная SSE-подписка
- **When** клиент разрывает соединение (`close`-событие)
- **Then** `SseHub.unsubscribe` вызван, последующий `broadcast` не бросает исключение для оставшихся подписчиков

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                        | Required by                 |
| ------------------------------------------------------------------------------ | --------------------------- |
| `npm run type-check`                                                           | typescript-rules            |
| `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts'` | node-test                   |
| `npm run format:check`                                                         | typescript-rules, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                       | Level       | Test File             |
| ---------------------------------------------- | ----------- | --------------------- |
| Типизация ChatRouter/MutateRouter/SseHub       | contract    | sse-hub.test.ts       |
| POST /chat не блокирует ответ                  | integration | chat.router.test.ts   |
| POST /chat при in-flight ходе                  | integration | chat.router.test.ts   |
| SSE-стрим вещает всем подписчикам MR           | integration | sse-hub.test.ts       |
| Успешный mutate — broadcast mutation+refresh   | integration | mutate.router.test.ts |
| CAS-конфликт на mutate — 409 + refresh всем    | integration | mutate.router.test.ts |
| Stop делегирует ChatSession.stop               | unit        | chat.router.test.ts   |
| Разрыв соединения — unsubscribe без исключения | unit        | sse-hub.test.ts       |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-15, initial

#### P1

- [x] `2026-07-15T14:39:21Z` intro `SseHub` ← per-MR SSE subscriber registry, one broadcast channel per MR serving both token stream and mutation/refresh events (D-100, D-110)
- [x] `2026-07-15T14:39:21Z` intro `SseFrame` ← discriminated union of every SSE frame kind, exhaustively encoded by `SseHub#_encodeFrame`
- [x] `2026-07-15T14:39:21Z` intro `ChatRouter` ← thin HTTP↔SSE bridge over `ChatSession` (ask/stream/undo/stop)
- [x] `2026-07-15T14:39:21Z` intro `MutateRouter` ← thin HTTP bridge over `MutationApplier` (revision-CAS apply)
- [x] `2026-07-15T14:39:21Z` decision chat-bridge-wiring=optional ← `HttpServerConfig#chat` (`{ pool, store }`) is optional so `bootstrap.ts` (outside this phase's Target Files) keeps compiling unmodified; server runs without `/chat`/`/mutate` routes until a follow-up phase wires a real `SessionPool` into bootstrap
- [x] `2026-07-15T14:39:21Z` decision mutate-revision-surfacing=arithmetic ← `MutateRouter` returns `revision: body.revision + 1` on CAS success instead of re-reading `review.json`, since `MutationApplier#apply` guarantees `currentRevision + 1` on a matching CAS — avoids an extra untyped disk read
- [x] `2026-07-15T14:39:21Z` insight `GET /api/mr/:id/report` (`BoardProviderReal#getReport`, `MrDetail` in `types.ts`) does not surface `review.json#revision` yet → `board-provider.real.ts`/`types.ts` §MrDetail, add `revision` field so a client reconnecting via `GET /report` (not through a chat turn) has a CAS-ready revision; out of this phase's Target Files, left as `open`
- [x] `2026-07-15T14:39:21Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T14:39:21Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-15T14:39:21Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/sse-hub.ts, services/agent-inbox/modules/inbox-api/routers/chat.router.ts, services/agent-inbox/modules/inbox-api/routers/mutate.router.ts, services/agent-inbox/modules/inbox-api/http-server.ts]; decisions: [chat-bridge-wiring=optional-HttpServerConfig.chat, mutate-revision=arithmetic-CAS+1, sse-frame-union=token|turn_done|mutation|refresh|error]; open: [report-revision-surfacing: GET /api/mr/:id/report does not yet expose review.json#revision (board-provider.real.ts/types.ts, out of P1 Target Files); bootstrap-chat-wiring: bootstrap.ts does not yet construct a SessionPool/pass HttpServerConfig.chat, so chat/mutate routes are inert in the running server until wired]

#### P2

- [x] `2026-07-15T14:50:18Z` discovery `sse-hub.test.ts`/`chat.router.test.ts`/`mutate.router.test.ts` all use a real `HttpServer` on an ephemeral/fixed test port with a real `SessionPool`/`StateStore` over `makeTestTmpDir` state; `OpenCodeMock` is the only mock, since opencode is the genuinely-external collaborator (per node-test/testing-common rules)
- [x] `2026-07-15T14:50:18Z` decision test-http-agent=one-server-per-describe ← switched from per-test `beforeEach`/`afterEach` server restart to `before`/`after` (one `HttpServer` per `describe`, distinct `mrRef` per case) after per-test restart on the same port produced `ECONNRESET` from Node's keep-alive agent reusing a socket across server stop/start cycles
- [x] `2026-07-15T14:50:18Z` insight `MutateRouter`'s 409 detail message (`review.json revision <N> no longer matches <M>`) is asserted verbatim in `mutate.router.test.ts` — if `MutationApplier#apply`'s message wording changes, this test's assertion must move with it; no spec change needed, just noting the coupling
- [x] `2026-07-15T14:50:18Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T14:50:18Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-15T14:50:18Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-15T14:50:18Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/__tests__/sse-hub.test.ts, services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts, services/agent-inbox/modules/inbox-api/__tests__/mutate.router.test.ts]; decisions: [test-http-agent=one-server-per-describe, prompt-delay-simulation=mock.method-on-SessionPool.prompt-wrapping-real-implementation]; open: [board-router-flaky-timing: one incidental run of the full `__tests__` glob showed a single non-reproducible timing failure in the pre-existing `board.router.test.ts` ("returns empty board when no data seeded"), unrelated to this phase's files — confirmed clean on immediate rerun, not investigated further as out of P2 scope]

#### Round close

- [x] `2026-07-15T14:50:18Z` DONE

<!--/SECTION:EXECUTION_LOG-->
