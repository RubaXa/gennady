# Task: TSK-40 — OpenCodeProvider

## 1. Meta
- **Task-ID:** TSK-40
- **Status:** [x] DONE
- **Purpose:** Реализовать OpenCodeProvider — сканирование сессий OpenCode через SQLite с DI-точкой для БД
- **Scope:** agent-mon
- **Module:** providers/opencode
- **Dependencies:** TSK-35
- **Spec References:**
  - Adapter: [`OpenCodeProvider`](../../../specs/agent-mon/providers/opencode/opencode.spec.md#opencodeprovider)
  - Port: [`AgentProvider`](../../../specs/agent-mon/model/model.spec.md#agentprovider)
  - Knowledge: [`agent-mon` §5 Provider Knowledge → OpenCode](../../../specs/agent-mon/agent-mon.spec.md#opencode-provider)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None

## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | —    | [x]    |
| P2 | test | P1   | [x]    |

## 3. Phases

### P1 — impl
- **Objective:** Реализовать OpenCodeProvider с DI-конструктором и SQL-запросами
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-mon/providers/opencode/opencode-provider.ts`
  - `services/agent-mon/providers/opencode/db.ts`
  - `services/agent-mon/providers/opencode/model-parser.ts`
  - `services/agent-mon/providers/opencode/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; конструктор принимает `deps?: { dbPath?, querySessions?, queryLastMessage?, parseModelJson? }`; db.close() вызывается; key = 'opencode'; `node:sqlite` используется через `DatabaseSync` (экспериментальный API в Node 22, стабилизирован в Node 24)

### P2 — test
- **Objective:** Тесты OpenCodeProvider с in-memory SQLite через DI
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-mon/providers/opencode/__tests__/opencode-provider.test.ts`
  - `services/agent-mon/providers/opencode/__tests__/db.test.ts`
  - `services/agent-mon/providers/opencode/__tests__/model-parser.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD сценарии покрыты; тесты используют `node --experimental-sqlite` при необходимости; tests pass

## 4. Acceptance Criteria (BDD)
Contract: see Spec References.

**Feature:** Сканирование сессий OpenCode через SQLite

**Scenario:** Парсинг model JSON извлекает id [`unit`]
- **Given** строка '{"id":"deepseek-v4-pro","providerID":"llm-proxy"}'
- **When** parseModelJson(raw)
- **Then** возвращает 'deepseek-v4-pro'

**Scenario:** Невалидный model JSON возвращает 'unknown' [`unit`]
- **Given** строка 'not-json'
- **When** parseModelJson(raw)
- **Then** возвращает 'unknown'

**Scenario:** querySessions возвращает только незаархивированные [`unit`]
- **Given** in-memory БД с 2 сессиями: одна с time_archived=NULL, одна с time_archived=1
- **When** querySessions(db)
- **Then** возвращает 1 строку (ту, где time_archived IS NULL)

**Scenario:** scan возвращает [] если БД не существует [`unit`]
- **Given** несуществующий путь к БД (мок dbPath → throw)
- **When** provider.scan()
- **Then** возвращает [], не бросает

**Scenario:** scan заполняет AgentSession из БД [`unit`]
- **Given** БД с 1 активной сессией (slug='witty-star', title='test', time_archived=NULL)
- **When** provider.scan()
- **Then** возвращает 1 AgentSession с provider='opencode', status='active'

**Scenario:** parentId пробрасывается из БД если есть [`unit`]
- **Given** сессия с parent_id='ses_parent'
- **When** provider.scan()
- **Then** AgentSession.parentId = 'ses_parent'

## 5. Verification
| Command | Required by |
|---------|-------------|
| npm run type-check | typescript-rules |
| npm run test | node-test |

## 6. Test Scenario Coverage
- Scenario "Парсинг model JSON" → `services/agent-mon/providers/opencode/__tests__/model-parser.test.ts` :: `extracts id from model json`
- Scenario "Невалидный model JSON" → `services/agent-mon/providers/opencode/__tests__/model-parser.test.ts` :: `returns unknown for invalid json`
- Scenario "querySessions фильтрует" → `services/agent-mon/providers/opencode/__tests__/db.test.ts` :: `returns only non-archived sessions`
- Scenario "scan возвращает []" → `services/agent-mon/providers/opencode/__tests__/opencode-provider.test.ts` :: `returns empty on missing db`
- Scenario "scan заполняет AgentSession" → `services/agent-mon/providers/opencode/__tests__/opencode-provider.test.ts` :: `returns sessions from db`
- Scenario "parentId" → `services/agent-mon/providers/opencode/__tests__/opencode-provider.test.ts` :: `propagates parentId`

## 7. Execution Log
*(Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)*

### Round 1 — initial

#### P1
- [x] `2026-05-22T05:26:16Z` intro `OpenCodeProviderDeps` ← DI-точка для тестирования, требуется P2
- [x] `2026-05-22T05:26:16Z` intro `SessionRow` ← форма строки БД, экспортируется для потребителей db.ts
- [x] `2026-05-22T05:26:16Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-22T05:26:16Z` DONE
**Handoff →** artifacts: [services/agent-mon/providers/opencode/opencode-provider.ts, services/agent-mon/providers/opencode/db.ts, services/agent-mon/providers/opencode/model-parser.ts, services/agent-mon/providers/opencode/index.ts]; decisions: [key=opencode, constructor-deps=injectable, db-engine=node:sqlite/DatabaseSync, db-close=always-in-finally, db-path-resolution=tilde-to-os-homedir]; open: []

#### P2
- [x] `2026-05-22T06:02:28Z` intro `model-parser.test.ts` ← покрывает BDD: extracts id, returns unknown, boundary cases (null, missing id)
- [x] `2026-05-22T06:02:28Z` intro `db.test.ts` ← покрывает BDD: non-archived filter, ordering, since filter, queryLastMessage
- [x] `2026-05-22T06:02:28Z` intro `opencode-provider.test.ts` ← покрывает BDD: missing db → [], scan → sessions, parentId propagation
- [x] `2026-05-22T06:02:28Z` discovery `npm run test` имеет 1 pre-existing failure (`cli/cmd/alt-opinion/__tests__/alt-opinion.cmd.test.ts`), не связанный с opencode; все 14 тестов opencode проходят
- [x] `2026-05-22T06:02:28Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-22T06:02:28Z` ver `npm run test` → fail exit=1 (365/366 pass; 1 failure pre-existing: alt-opinion.cmd.test.ts; все тесты opencode provider: 14/14 pass)
- [x] `2026-05-22T06:02:28Z` DONE
**Handoff →** artifacts: [services/agent-mon/providers/opencode/__tests__/model-parser.test.ts, services/agent-mon/providers/opencode/__tests__/db.test.ts, services/agent-mon/providers/opencode/__tests__/opencode-provider.test.ts]; decisions: [test-runner=node:test, in-memory-sqlite=:memory:, di-mocking=mock.fn(), querySessions-filter=archived+since, all-bdd-scenarios-covered, coverage=14-tests:4-model-parser+6-db+4-opencode-provider]; open: []

#### Round close
- [x] `2026-05-22T06:17:37Z` DONE
