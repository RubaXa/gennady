# Task: TSK-106 — inbox-api: HTTP-сервер + REST API (моки)

## 1. Meta

- **Task-ID:** TSK-106 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-api | **Dependencies:** TSK-105 (mocks)
- **Purpose:** `node:http` сервер на порту 4174. Роуты `/api/board`, `/api/mr/:id/assign`, `/api/mr/:id/action`, `/api/mr/:id/report`, `/api/mr/:id/audit`. Статика. `BoardProviderPort` + `BoardProviderMock` — мокаемая граница с RoleEngine (реализуется в TSK-113).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-02, [inbox-api.spec.md](../../specs/agent-inbox/inbox-api/inbox-api.spec.md) | **Runtime:** not-implemented | **Verification:** unit, integration

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/http-server.ts` — HttpServer: start, stop, роутинг, CORS
  - `services/agent-inbox/modules/inbox-api/board-provider.port.ts` — BoardProviderPort: getBoard, assignMr, executeAction, getReport
  - `services/agent-inbox/modules/inbox-api/board-provider.mock.ts` — BoardProviderMock: in-memory, seed(), реализует Port
  - `services/agent-inbox/modules/inbox-api/routers/board.router.ts` — GET /api/board → состояние доски
  - `services/agent-inbox/modules/inbox-api/routers/mr.router.ts` — POST assign/action, GET report
  - `services/agent-inbox/modules/inbox-api/routers/audit.router.ts` — GET /api/mr/:id/audit
  - `services/agent-inbox/modules/inbox-api/static-files.ts` — раздача SPA + fallback
  - `services/agent-inbox/modules/inbox-api/errors.ts` — ApiError: типы ошибок, формат { ok, error, detail }
- **Exit:** `curl http://localhost:4174/api/board` возвращает мок-данные. SPA отдаётся как статика.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/__tests__/board.router.test.ts`
  - `services/agent-inbox/modules/inbox-api/__tests__/mr.router.test.ts`
  - `services/agent-inbox/modules/inbox-api/__tests__/http-server.test.ts`
- **Exit:** Интеграционные тесты через `node:http.request`. Все роуты покрыты.

## 4. BDD

- GIVEN сервер запущен WHEN GET /api/board THEN 200, JSON с roles[] и unassigned[]
- GIVEN MR в INBOX WHEN POST /api/mr/:id/assign { role:'reviewer' } THEN 200, MR в INBOX reviewer
- GIVEN роль в AWAITING WHEN POST /api/mr/:id/action { questionId, choice } THEN 200, MR в DONE
- GIVEN MR с находками WHEN GET /api/mr/:id/report THEN 200, MrDetail с findings[], verdict
- GIVEN несуществующий MR WHEN POST /api/mr/xxx/assign THEN 404 { ok:false, error:'NOT_FOUND' }
- GIVEN неизвестный роут WHEN GET /some-page THEN 200 index.html (SPA fallback)
- GIVEN request с origin localhost:5173 WHEN GET /api/board THEN ответ с Access-Control-Allow-Origin
- GIVEN SIGTERM WHEN HttpServer.stop() THEN активные запросы завершены, сокет закрыт

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                                                            | Level       | Test File            |
| ------------------------------------------------------------------- | ----------- | -------------------- |
| GET /api/board → 200                                                | integration | board.router.test.ts |
| POST /api/mr/:id/assign → ok                                        | integration | mr.router.test.ts    |
| POST /api/mr/:id/action → ok (generic {questionId,choice,payload?}) | integration | mr.router.test.ts    |
| GET /api/mr/:id/report → MrDetail                                   | integration | mr.router.test.ts    |
| POST /api/mr/xxx/assign → 404                                       | integration | mr.router.test.ts    |
| SPA fallback                                                        | integration | http-server.test.ts  |
| Graceful shutdown                                                   | integration | http-server.test.ts  |

## 7. Execution Log

### Round 1 — 2026-07-10, initial

#### P1

- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/board-provider.port.ts` — BoardProviderPort: `getBoard()`, `assignMr()`, `executeAction()`, `getReport()`
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/board-provider.mock.ts` — BoardProviderMock: in-memory, `seed()`, реализует Port
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/errors.ts` — ApiError: типы ошибок, формат `{ ok, error, detail }`
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/http-helpers.ts` — `parseBody()` (1MB limit, destroys socket on overflow), `sendError()` (generic message, no leak), `sendJson()`, CORS headers
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/types.ts` — RoleView, MrCard, MrDetail, BoardData shared types
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/index.ts` — module barrel re-export
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/routers/board.router.ts` — GET /api/board → состояние доски через BoardProviderPort
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/routers/mr.router.ts` — POST /api/mr/:id/assign, POST /api/mr/:id/action, GET /api/mr/:id/report
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/routers/audit.router.ts` — GET /api/mr/:id/audit
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/static-files.ts` — раздача SPA из `_distDir`, path-traversal защита через `resolve() + startsWith()`, SPA fallback
- [x] `2026-07-10T13:00:00Z` Created `services/agent-inbox/modules/inbox-api/http-server.ts` — HttpServer: `start()` (регистрирует роуты, трекает sockets), `stop()` (5s timeout, destroys tracked sockets)
- [x] `2026-07-10T13:05:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-10T13:05:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-10T13:05:00Z` DONE
- [x] **Handoff →** artifacts: [board-provider.port.ts, board-provider.mock.ts, errors.ts, http-helpers.ts, types.ts, index.ts, routers/{board,mr,audit}.router.ts, static-files.ts, http-server.ts]; decisions: [D_static_resolve+startsWith=path-traversal-protection, D_parseBody_1MB_limit, D_sendError_generic, D_httpServer_stop_5s_timeout, D_httpServer_start_track_sockets]; open: []

#### P2

- [x] `2026-07-10T13:10:00Z` Created `services/agent-inbox/modules/inbox-api/__tests__/http-server.test.ts` — 6 tests: start/stop lifecycle, CORS headers, SPA fallback, 404 API routes, graceful shutdown, socket tracking
- [x] `2026-07-10T13:10:00Z` Created `services/agent-inbox/modules/inbox-api/__tests__/board.router.test.ts` — 5 tests: GET /api/board → 200 + JSON, empty board, role grouping, unassigned count, CORS origin
- [x] `2026-07-10T13:10:00Z` Created `services/agent-inbox/modules/inbox-api/__tests__/mr.router.test.ts` — 7 tests: POST assign → ok, POST assign invalid → 404, POST action → ok, POST action invalid MR → 404, GET report → MrDetail, GET report invalid → 404, non-existent route → 404
- [x] `2026-07-10T13:15:00Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts'` → pass exit=0 (18/18)
- [x] `2026-07-10T13:15:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-10T13:15:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-10T13:15:00Z` DONE
- [x] **Handoff →** artifacts: [http-server.test.ts, board.router.test.ts, mr.router.test.ts]; decisions: [test_counts=18, covers=all-endpoints+graceful-shutdown+CORS+SPA-fallback]; open: []

#### Round close

- [x] `2026-07-10T13:20:00Z` sync inbox-api
- [x] `2026-07-10T13:20:00Z` DONE
