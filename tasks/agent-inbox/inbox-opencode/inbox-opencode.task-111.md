# Task: TSK-111 — inbox-opencode: OpenCodePort + OpenCodeMock + SessionPool + SchemaRegistry

## 1. Meta

- **Task-ID:** TSK-111 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-105 (mocks)
- **Purpose:** OpenCode-интеграция: Port (createSession + directory, prompt с format, status, continueSignal, abort, close) + Mock (симулирует все классы исходов: OK, NO_RESULT, PARSE_ERROR, SCHEMA_MISMATCH, SESSION_ERROR, TIMEOUT, INCOMPLETE_ARTIFACT) + SessionPool + SchemaRegistry (узел→схема). Без real-SDK (TSK-112).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-05, [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/opencode.port.ts` — OpenCodePort: createSession, prompt, abort, close
  - `services/agent-inbox/modules/inbox-opencode/opencode.mock.ts` — OpenCodeMock: seed(schema, response), seedError
  - `services/agent-inbox/modules/inbox-opencode/session-pool.ts` — SessionPool: create, release, activeCount, cleanup (limit=3)
  - `services/agent-inbox/modules/inbox-opencode/schema-registry.ts` — SchemaRegistry: get(role), register
  - `services/agent-inbox/modules/inbox-opencode/errors.ts` — OpenCodeError
- **Exit:** Mock возвращает преконфигуренные structured output. Pool соблюдает лимит 3.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/__tests__/opencode.mock.test.ts`
  - `services/agent-inbox/modules/inbox-opencode/__tests__/session-pool.test.ts`
  - `services/agent-inbox/modules/inbox-opencode/__tests__/schema-registry.test.ts`
- **Exit:** Тесты: mock возвращает seeded, pool лимит, SchemaRegistry маппинг.

## 4. BDD

- GIVEN OpenCodeMock.seed(schema, { findings: [...] }) WHEN prompt(schema) THEN structured output валидный JSON
- GIVEN OpenCodeMock.seedError(schema, 'StructuredOutputError') WHEN prompt(schema) THEN error
- GIVEN SessionPool limit=3 и 3 активных сессии WHEN 4-й create() THEN ожидание освобождения
- GIVEN SchemaRegistry.register('review', schema) WHEN get('review') THEN схема

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                      | Level | Test File               |
| ----------------------------- | ----- | ----------------------- |
| Mock возвращает seeded output | unit  | opencode.mock.test.ts   |
| Mock возвращает ошибку        | unit  | opencode.mock.test.ts   |
| Pool лимит 3                  | unit  | session-pool.test.ts    |
| Pool release → слот свободен  | unit  | session-pool.test.ts    |
| SchemaRegistry get/register   | unit  | schema-registry.test.ts |

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
