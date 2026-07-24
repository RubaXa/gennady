# Task: TSK-152 — выровнять chat-тесты под текущий контракт

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-152 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-api + inbox-dashboard | **Dependencies:** None
- **Purpose:** 2 red-теста chat — STALE-TEST (не баг продукта): (1) `chat.router.test.ts` сеет мок по стейл-ключу `CHAT_TURN_NODE_ID='chat_turn'`, тогда как коммит `f0a991c` намеренно убрал `format` из `ChatSession.ask` (mock теперь резолвит node по первому слову текста); (2) `chat-api-client.integration.test.ts` бьёт относительным URL, а `ChatApiClient.BASE_URL=''` стал same-origin (коммит `240a3514`), в Node это `Invalid URL`. Выровнять тесты под актуальный контракт.
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None
- **Spec References:**
  - Изменение format: `services/agent-inbox/modules/inbox-chat/chat-session.ts` (f0a991c) + `opencode.mock.ts#_extractNodeId`
  - Same-origin: `services/agent-inbox/modules/inbox-dashboard/services/chat-api-client.ts` (240a3514)
  - Образец актуального сида: `services/agent-inbox/modules/inbox-chat/__tests__/chat-session.test.ts`
  - Прецедент: [tasks/README.md#D-215](../README.md)

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | test | —    | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — test

- **Objective:** (1) `chat.router.test.ts` — заменить `seed(CHAT_TURN_NODE_ID, …)` на per-test ключи по первому слову текста (`'stop'`/`'question'`, как в `chat-session.test.ts`), убрать мёртвую константу. (2) `chat-api-client.integration.test.ts` — дать тесту абсолютный base (raw Node `fetch`/`EventSource` требуют его). **Adaptive design-fork:** сначала test-only путь (абсолютный URL в тесте / локальный base-shim). Продуктовый `ChatApiClient` менять ТОЛЬКО если test-only честно невозможен — тогда добавить узкий env/ctor-override base (по образцу `ApiClient`), зафиксировать это `decision`-строкой как осознанную продуктовую правку, не молчком. Порт-коллизия :4206 на этой машине (orphan-процесс) — env, не код: если мешает, использовать свободный порт/`0`.
- **Rules:**
  - [testing/node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts`
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/chat-api-client.integration.test.ts`
- **Inputs:** none
- **Exit:** оба файла зелёные; продуктовый код не тронут (или, при обоснованном fork, узкий base-override с `decision`-логом); 0 новых падений против baseline.

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References.

**Feature:** chat-тесты соответствуют актуальному format/same-origin контракту

**Scenario:** ChatRouter stop доходит до turn_done [`integration`]

- **Given** мок сеет по первому слову текста (без стейл `chat_turn`)
- **When** POST /chat/stop и обычный turn прогоняются
- **Then** SSE достигает `turn_done`, тест не зависает

**Scenario:** ChatApiClient integration резолвит абсолютный URL [`integration`]

- **Given** тест обращается к реальному HttpServer с абсолютным base
- **When** идут fetch/EventSource
- **Then** нет `Invalid URL`; ассерты проходят; продуктовый same-origin дизайн сохранён

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                     | Required by       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts services/agent-inbox/modules/inbox-dashboard/__tests__/chat-api-client.integration.test.ts` | testing/node-test |
| `npx tsc --noEmit`                                                                                                                                                                                                          | testing/node-test |

- **Task-specific Completion additions:** SCOPED gate (D-214) — 0 новых падений; если тронут продуктовый `ChatApiClient` — `decision`-строка с обоснованием.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «ChatRouter stop» → `chat.router.test.ts` :: `ChatRouter — POST /chat/stop`
- Scenario «ChatApiClient integration» → `chat-api-client.integration.test.ts` :: integration cases

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-23, initial

#### P1

- [x] `2026-07-23T14:24:01Z` discovery `chat.router.test.ts` сеял все три кейса по общей стейл-константе `CHAT_TURN_NODE_ID='chat_turn'`; `_resolveNodeId` резолвит по первому слову текста ('question'/'stop'), не по `format.schema.title` — константа и её докстрока устарели
- [x] `2026-07-23T14:24:01Z` discovery порт 4206 занят orphan-процессом на машине (`lsof -i :4206` → LISTEN) — переключил `describe('ChatRouter — POST /chat/stop')` на свободный 4207, env-фактор, не код
- [x] `2026-07-23T14:24:01Z` decision test-only-origin-shim=chat-api-client.integration.test.ts ← `ChatApiClient.BASE_URL=''` намеренно same-origin (240a3514); продуктовый код не тронут — тест оборачивает `globalThis.fetch`/`EventSource` резолвером на `http://localhost:4174`, аналогично тому, как браузер резолвит относительный путь через `document.location`
- [x] `2026-07-23T14:24:01Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-23T14:24:01Z` ver `node --import tsx --test --experimental-test-module-mocks services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts services/agent-inbox/modules/inbox-dashboard/__tests__/chat-api-client.integration.test.ts` → pass exit=0 (запущено дважды подряд — оба раза 5/5 pass, флаки не обнаружены)
- [x] `2026-07-23T14:24:01Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts, services/agent-inbox/modules/inbox-dashboard/__tests__/chat-api-client.integration.test.ts]; decisions: [seed-key=first-word-of-text, product-code-touched=false, stop-port=4207]; open: []

<!--/SECTION:EXECUTION_LOG-->
