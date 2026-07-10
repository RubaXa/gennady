# Task: TSK-106 — inbox-api: HTTP-сервер + REST API (моки)

## 1. Meta

- **Task-ID:** TSK-106 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-api | **Dependencies:** TSK-105 (mocks)
- **Purpose:** `node:http` сервер на порту 4174. Роуты `/api/board`, `/api/mr/:id/assign`, `/api/mr/:id/action`, `/api/mr/:id/report`, `/api/mr/:id/audit`. Статика. `BoardProviderPort` + `BoardProviderMock` — мокаемая граница с RoleEngine (реализуется в TSK-113).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-02, [inbox-api.spec.md](../../specs/agent-inbox/inbox-api/inbox-api.spec.md) | **Runtime:** not-implemented | **Verification:** unit, integration

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

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
- GIVEN роль в AWAITING WHEN POST /api/mr/:id/action { action:'post' } THEN 200, MR в DONE
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

| Scenario                          | Level       | Test File            |
| --------------------------------- | ----------- | -------------------- |
| GET /api/board → 200              | integration | board.router.test.ts |
| POST /api/mr/:id/assign → ok      | integration | mr.router.test.ts    |
| POST /api/mr/:id/action → ok      | integration | mr.router.test.ts    |
| GET /api/mr/:id/report → MrDetail | integration | mr.router.test.ts    |
| POST /api/mr/xxx/assign → 404     | integration | mr.router.test.ts    |
| SPA fallback                      | integration | http-server.test.ts  |
| Graceful shutdown                 | integration | http-server.test.ts  |

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
