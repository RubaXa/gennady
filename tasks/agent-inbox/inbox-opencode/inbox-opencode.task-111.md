# Task: TSK-111 — inbox-opencode: OpenCodePort + Mock (all outcomes) + SessionPool + SchemaRegistry

## 1. Meta

- **Task-ID:** TSK-111 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-105 (mocks)
- **Purpose:** OpenCode-интеграция: Port (createSession + directory, prompt с format, status, continueSignal, abort, close) + Mock (симулирует все классы исходов) + SessionPool + SchemaRegistry (узел→схема). Без real-SDK (TSK-112).
- **Spec:** [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

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
