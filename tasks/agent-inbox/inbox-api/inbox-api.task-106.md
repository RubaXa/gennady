# Task: TSK-106 — inbox-api: HTTP-сервер + REST + artifact endpoints

## 1. Meta

- **Task-ID:** TSK-106 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-api | **Dependencies:** TSK-105 (mocks)
- **Purpose:** `node:http` сервер (порт 4174): доска, действия над MR (generic action), отчёт, **артефакты** (list/read), статика. `BoardProviderPort` + `BoardProviderMock` — мокаемая граница с RoleEngine (real в TSK-113). Реврайт под D-86 (artifact endpoints + generic action; существующий Round-1 http-server/board-provider дорабатывается).
- **Spec:** [inbox-api.spec.md](../../specs/agent-inbox/inbox-api/inbox-api.spec.md), [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-02 | **Runtime:** not-implemented | **Verification:** unit, integration

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/http-server.ts` — HttpServer: старт/стоп/роутинг/CORS/graceful shutdown (сохранить Round-1 + зарегистрировать ArtifactRouter)
  - `services/agent-inbox/modules/inbox-api/board-provider.port.ts` — BoardProviderPort: + `listArtifacts(mrId) → ArtifactRef[]`, `readArtifact(mrId, path) → { content, kind }` (владеет типами RoleView/MrCard/MrDetail/ArtifactRef)
  - `services/agent-inbox/modules/inbox-api/board-provider.mock.ts` — BoardProviderMock: + seed артефактов, listArtifacts/readArtifact из памяти
  - `services/agent-inbox/modules/inbox-api/routers/mr.router.ts` — generic `POST /api/mr/:id/action { questionId, choice, payload? }` (choice ∈ post/approve/redispatch/skip); `GET /api/mr/:id/report`
  - `services/agent-inbox/modules/inbox-api/routers/artifact.router.ts` — `GET /api/mr/:id/artifacts` (список), `GET /api/mr/:id/artifact?path=` (содержимое; path валидируется как поддерево `reports/<mr>/` — no traversal)
  - `services/agent-inbox/modules/inbox-api/routers/board.router.ts`, `static-files.ts`, `errors.ts` — сохранить
- **Exit:** `curl /api/mr/:id/artifacts` → список; `/api/mr/:id/artifact?path=REPORT.md` → содержимое; generic action принимает 4 choice. type-check + format pass.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/__tests__/mr.router.test.ts`
  - `services/agent-inbox/modules/inbox-api/__tests__/artifact.router.test.ts`
  - `services/agent-inbox/modules/inbox-api/__tests__/http-server.test.ts`
- **Exit:** Интеграционные тесты через `node:http.request`; артефакт-роуты + traversal-защита + generic action покрыты.

## 4. BDD

- GIVEN сервер запущен WHEN GET /api/board THEN 200, roles[] + unassigned[]
- GIVEN MR с артефактами WHEN GET /api/mr/:id/artifacts THEN список (REPORT/PLAN/дорожки/HISTORY)
- GIVEN артефакт REPORT.md WHEN GET /api/mr/:id/artifact?path=REPORT.md THEN { content, kind:'md' }
- GIVEN path=../../etc/passwd WHEN GET artifact THEN 400 (traversal заблокирован)
- GIVEN AWAITING WHEN POST action { questionId, choice:'approve' } THEN 200
- GIVEN action choice:'redispatch' + payload WHEN POST THEN 200 (новый раунд)
- GIVEN неизвестный роут WHEN GET /some-page THEN 200 index.html (SPA fallback)
- GIVEN SIGTERM WHEN stop() THEN активные запросы завершены, сокет закрыт

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-api/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                         | Level       | Test File               |
| -------------------------------- | ----------- | ----------------------- |
| GET /api/board → 200             | integration | board.router.test.ts    |
| GET /artifacts → список          | integration | artifact.router.test.ts |
| GET /artifact?path= → содержимое | integration | artifact.router.test.ts |
| path traversal → 400             | integration | artifact.router.test.ts |
| POST action generic (4 choice)   | integration | mr.router.test.ts       |
| SPA fallback + graceful shutdown | integration | http-server.test.ts     |

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []
