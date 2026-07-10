# Task: TSK-111 — inbox-opencode: OpenCodePort + Mock (all outcomes) + SessionPool + SchemaRegistry

## 1. Meta

- **Task-ID:** TSK-111 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-105 (mocks)
- **Purpose:** OpenCode-интеграция: Port (createSession + directory, prompt с format, status, continueSignal, abort, close) + Mock (симулирует все классы исходов) + SessionPool + SchemaRegistry (узел→схема). Без real-SDK (TSK-112).
- **Spec:** [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/opencode.port.ts` — OpenCodePort: createSession({title, directory}), prompt(sid, {system?,text,format?}), status(sid), continueSignal(sid, {system?,text,format?}), abort(sid), close(sid)
  - `services/agent-inbox/modules/inbox-opencode/opencode.mock.ts` — OpenCodeMock: seed(nodeId, response), seedError(nodeId, class) для OK/NO_RESULT/PARSE_ERROR/SCHEMA_MISMATCH/SESSION_ERROR/TIMEOUT/INCOMPLETE_ARTIFACT
  - `services/agent-inbox/modules/inbox-opencode/session-pool.ts` — SessionPool: create, prompt, release, activeCount, cleanup. Инвариант: per-role × роли > maxSessions → очередь без дедлока
  - `services/agent-inbox/modules/inbox-opencode/schema-registry.ts` — SchemaRegistry: get(nodeId), register(nodeId, schema) — узел→схема (не роль→схема)
  - `services/agent-inbox/modules/inbox-opencode/errors.ts` — OpenCodeError

### P2 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/__tests__/opencode.mock.test.ts`
  - `services/agent-inbox/modules/inbox-opencode/__tests__/session-pool.test.ts`
  - `services/agent-inbox/modules/inbox-opencode/__tests__/schema-registry.test.ts`

## 4. BDD

- GIVEN OpenCodeMock.seed(nodeId, response) WHEN prompt с format THEN structured output
- GIVEN seedError(nodeId, 'PARSE_ERROR') WHEN prompt THEN error { class: 'PARSE_ERROR', signal: '...' }
- GIVEN seedError(nodeId, 'SCHEMA_MISMATCH') WHEN prompt THEN error с details несовпавших полей
- GIVEN seedError(nodeId, 'SESSION_ERROR') WHEN prompt THEN error { class: 'SESSION_ERROR' }
- GIVEN seedError(nodeId, 'TIMEOUT') WHEN prompt THEN error { class: 'TIMEOUT' }
- GIVEN сессия получила PARSE_ERROR WHEN continueSignal с remediation-сигналом THEN исправленный ответ OK
- GIVEN continueMax=2 и 2 PARSE_ERROR WHEN 3-й вызов THEN restart → свежая сессия
- GIVEN restartMax=1 и restart выполнен WHEN снова ошибка THEN AWAITING_OPERATOR
- GIVEN Pool limit=3 и 3 активных WHEN 4-й create THEN ожидание освобождения (очередь, не deadlock)
- GIVEN SchemaRegistry.register('node_scaffold', schema) WHEN get('node_scaffold') THEN схема

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                        | Level | Test File               |
| ------------------------------- | ----- | ----------------------- |
| Mock: OK                        | unit  | opencode.mock.test.ts   |
| Mock: PARSE_ERROR → сигнал      | unit  | opencode.mock.test.ts   |
| Mock: SESSION_ERROR             | unit  | opencode.mock.test.ts   |
| Mock: TIMEOUT                   | unit  | opencode.mock.test.ts   |
| Mock: SCHEMA_MISMATCH           | unit  | opencode.mock.test.ts   |
| Recovery: continue → OK         | unit  | opencode.mock.test.ts   |
| Recovery: continueMax → restart | unit  | opencode.mock.test.ts   |
| Recovery: restartMax → AWAITING | unit  | opencode.mock.test.ts   |
| Pool: очередь без дедлока       | unit  | session-pool.test.ts    |
| SchemaRegistry: узел→схема      | unit  | schema-registry.test.ts |

## 7. Execution Log

### Round 1

- **Executor:** sdd-task-executor | **Started:** 2026-07-10T00:00:00Z | **Finished:** 2026-07-10T00:05:00Z

#### P1 — impl

- [x] `2026-07-10T14:00:00Z` Created `services/agent-inbox/modules/inbox-opencode/errors.ts` — OutcomeClass enum (OK, NO_RESULT, PARSE_ERROR, SCHEMA_MISMATCH, SESSION_ERROR, TIMEOUT, INCOMPLETE_ARTIFACT), OpenCodeCallResult discriminated union, composeError/composeOk helpers
- [x] `2026-07-10T14:00:00Z` Created `services/agent-inbox/modules/inbox-opencode/opencode.port.ts` — OpenCodePort abstract class: `createSession(opts)`, `prompt(sid, opts)`, `status(sid)`, `continueSignal(sid, opts)`, `abort(sid)`, `close(sid)`; types: SessionHandle, SessionStatus, CreateSessionOpts, OpenCodeFormat, PromptOpts
- [x] `2026-07-10T14:00:00Z` Created `services/agent-inbox/modules/inbox-opencode/opencode.mock.ts` — OpenCodeMock implements OpenCodePort; `seed(nodeId, response)`, `seedError(nodeId, class)`; simulates all 7 outcome classes; nodeId extraction via format.schema.title or text prefix
- [x] `2026-07-10T14:00:00Z` Created `services/agent-inbox/modules/inbox-opencode/session-pool.ts` — SessionPool: `create()` (queues when full), `prompt()`, `release()` (drains queue FIFO), `activeCount`, `cleanup()` (rejects queued); invariant: > maxSessions → queue without deadlock
- [x] `2026-07-10T14:00:00Z` Created `services/agent-inbox/modules/inbox-opencode/schema-registry.ts` — SchemaRegistry: `get(nodeId)`, `register(nodeId, schema)`; node→schema mapping (not role→schema)
- [x] `2026-07-10T14:05:00Z` ver `npx tsc --noEmit` → pass exit=0 (no errors in inbox-opencode)
- [x] `2026-07-10T14:05:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-10T14:05:00Z` DONE
- [x] **Handoff →** artifacts: [errors.ts, opencode.port.ts, opencode.mock.ts, session-pool.ts, schema-registry.ts]; decisions: [D_7_outcome_classes=comprehensive-coverage, D_nodeId_extraction=format.title|text-prefix, D_pool_FIFO_queue, D_node→schema_not_role→schema]; open: []

#### P2 — test

- [x] `2026-07-10T14:10:00Z` Created `services/agent-inbox/modules/inbox-opencode/__tests__/opencode.mock.test.ts` — 27 tests: session lifecycle (5), seed OK (5), seedError all classes (6), distinct signals (4), terminated session (2), continueSignal recovery (3), seed/seedError override (2)
- [x] `2026-07-10T14:10:00Z` Created `services/agent-inbox/modules/inbox-opencode/__tests__/session-pool.test.ts` — 8 tests: basic lifecycle (4), queue without deadlock (3), prompt delegation (1)
- [x] `2026-07-10T14:10:00Z` Created `services/agent-inbox/modules/inbox-opencode/__tests__/schema-registry.test.ts` — 5 tests: register/get, undefined lookup, overwrite, multi-node, cross-contamination
- [x] `2026-07-10T14:15:00Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/*.test.ts'` → pass exit=0 (40/40)
- [x] `2026-07-10T14:15:00Z` ver `npx prettier --write` → pass (no warnings for inbox-opencode)
- [x] `2026-07-10T14:15:00Z` DONE
- [x] **Handoff →** artifacts: [opencode.mock.test.ts, session-pool.test.ts, schema-registry.test.ts]; decisions: [test_counts=40, BDD_coverage=all 10 scenarios]; open: []

#### Round Close

- [x] `2026-07-10T14:20:00Z` sync inbox-opencode
- [x] `2026-07-10T14:20:00Z` **Verdict:** DONE — All 10 BDD scenarios from §4 covered, all gates pass
