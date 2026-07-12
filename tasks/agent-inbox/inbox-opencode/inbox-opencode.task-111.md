# Task: TSK-111 — inbox-opencode: OpenCodePort (агентный) + Mock + SessionPool + SchemaRegistry

## 1. Meta

- **Task-ID:** TSK-111 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-105 (mocks)
- **Purpose:** OpenCode-порт в **агентном режиме** + мок, пул сессий, реестр схем. Сессия = многоходовой агент (cwd=worktree + тулы), `prompt` возвращается по завершении хода; таймаут в минутах; `toolCalls` (телеметрия открытых файлов) для tool-call сверки. Реврайт под D-86 (существующий код Round-1 дорабатывается, не выбрасывается). Без real-SDK (TSK-112).
- **Spec:** [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md), [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-05 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/opencode.port.ts` — OpenCodePort (abstract): `createSession({ title, directory, tools })` (directory=cwd=worktree обязателен; `tools` вкл read/grep/git); `prompt(sid, { system?, text, format?, timeout })` — timeout в минутах, возврат по завершении хода агента; `status(sid)`; `toolCalls(sid) → ToolCall[]`; `continueSignal(sid, opts)`; `abort(sid)`; `close(sid)`. Типы: SessionHandle, SessionStatus, CreateSessionOpts, PromptOpts, ToolCall.
  - `services/agent-inbox/modules/inbox-opencode/opencode.mock.ts` — OpenCodeMock: `seed(nodeId, response)`, `seedError(nodeId, class)` (OK/NO_RESULT/PARSE_ERROR/SCHEMA_MISMATCH/SESSION_ERROR/TIMEOUT/INCOMPLETE_ARTIFACT), `seedToolCalls(nodeId, files[])` — симуляция агентного хода и tool-call лога.
  - `services/agent-inbox/modules/inbox-opencode/session-pool.ts` — SessionPool: create/prompt/release/activeCount/cleanup; инвариант per-role×роли > maxSessions → очередь без дедлока (сохранить из Round-1).
  - `services/agent-inbox/modules/inbox-opencode/schema-registry.ts` — SchemaRegistry: get(nodeId)/register(nodeId, schema) (узел→схема).
  - `services/agent-inbox/modules/inbox-opencode/errors.ts` — OutcomeClass, OpenCodeCallResult, composeError/composeOk.
- **Exit:** Порт поддерживает агентный режим (tools+toolCalls+timeout-минуты); мок симулирует все классы исходов И tool-call лог. `npm run type-check` pass, `npm run format:check` pass.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/__tests__/opencode.mock.test.ts` — все классы исходов + toolCalls + tools-флаг + timeout-минуты + continueSignal recovery
  - `services/agent-inbox/modules/inbox-opencode/__tests__/session-pool.test.ts` — очередь без дедлока
  - `services/agent-inbox/modules/inbox-opencode/__tests__/schema-registry.test.ts` — узел→схема
- **Exit:** `npm run test` для модуля pass; покрыты все классы + tool-call лог.

## 4. BDD

- GIVEN OpenCodeMock.seed(nodeId, response) WHEN prompt(tools=on) THEN structured output + toolCalls непуст
- GIVEN seedToolCalls(nodeId, ['a.ts','b.ts']) WHEN toolCalls(sid) THEN [a.ts, b.ts]
- GIVEN seedError(nodeId, 'TIMEOUT') WHEN prompt THEN error { class: 'TIMEOUT' }
- GIVEN seedError(nodeId, 'SESSION_ERROR') WHEN prompt THEN error { class: 'SESSION_ERROR' }
- GIVEN сессия PARSE_ERROR WHEN continueSignal с remediation THEN OK
- GIVEN promptTimeout в минутах WHEN prompt THEN таймаут = минуты, не 300s фикс
- GIVEN Pool limit=3 и 3 активных WHEN 4-й create THEN очередь без дедлока
- GIVEN SchemaRegistry.register('node_scaffold', schema) WHEN get('node_scaffold') THEN схема

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                   | Level | Test File               |
| -------------------------- | ----- | ----------------------- |
| Mock: все классы исходов   | unit  | opencode.mock.test.ts   |
| Mock: toolCalls лог        | unit  | opencode.mock.test.ts   |
| Mock: timeout в минутах    | unit  | opencode.mock.test.ts   |
| Recovery: continueSignal   | unit  | opencode.mock.test.ts   |
| Pool: очередь без дедлока  | unit  | session-pool.test.ts    |
| SchemaRegistry: узел→схема | unit  | schema-registry.test.ts |

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
