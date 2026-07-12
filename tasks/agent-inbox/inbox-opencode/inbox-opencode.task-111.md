# Task: TSK-111 — inbox-opencode: OpenCodePort (агентный) + Mock + SessionPool + SchemaRegistry

## 1. Meta

- **Task-ID:** TSK-111 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-105 (mocks)
- **Purpose:** OpenCode-порт в **агентном режиме** + мок, пул сессий, реестр схем. Сессия = многоходовой агент (cwd=worktree + тулы), `prompt` возвращается по завершении хода; таймаут в минутах; `toolCalls` (телеметрия открытых файлов) для tool-call сверки. Реврайт под D-86 (существующий код Round-1 дорабатывается, не выбрасывается). Без real-SDK (TSK-112).
- **Spec:** [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md), [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-05 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
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

- [x] `2026-07-12T18:35:19Z` intro `ToolCall` ← agentic tool-call telemetry type, per ticket §3 P1 Target Files types list
- [x] `2026-07-12T18:35:19Z` decision toolCalls=concrete-default-method ← OpenCodePort#toolCalls is concrete (returns []), not abstract — keeps DegradedOpencode (serve/bootstrap.ts) and OpenCodeReal (opencode.real.ts) compiling without an out-of-phase write; adapters override to report real telemetry
- [x] `2026-07-12T18:35:19Z` decision timeout-unit=minutes ← PromptOpts.timeout is now minutes per agentic contract; TIMEOUT signal falls back to the legacy "30s" wording only when the caller omits timeout, so the un-migrated P2 test (opencode.mock.test.ts) keeps passing until P2 rewrites it
- [x] `2026-07-12T18:35:19Z` decision tools-flag=boolean ← single on/off flag per spec ("tools: on — read/grep/git in cwd"), not per-tool selection (AX_EXACT_SCOPE)
- [x] `2026-07-12T18:35:19Z` tried `sdd verify <target-files>` → fail: npm run type-check (project-wide) reports TS2654 in services/agent-inbox/modules/inbox-api/board-provider.real.ts — unrelated module, not touched by this phase
- [x] `2026-07-12T18:35:19Z` discovery board-provider.real.ts (mtime 2026-07-11T18:12) predates board-provider.port.ts (mtime 2026-07-12T21:31) — pre-existing inbox-api/TSK-106 drift, unrelated to inbox-opencode
- [x] `2026-07-12T18:35:19Z` ver `sdd lint <target-files>` → pass exit=0 (gennady DBC lint clean on all 5 Target Files)
- 🛑 `2026-07-12T18:39:00Z` BLOCKED: `npm run type-check` (project-wide, run by mandatory `sdd verify` gate) fails on `services/agent-inbox/modules/inbox-api/board-provider.real.ts` (TS2654 — BoardProviderReal missing listArtifacts/readArtifact) — outside this phase's Target Files and module; cannot honor the P1 exit criterion "`npm run type-check` pass" without an out-of-phase write
  - 🔗 axiom: AX_PHASE_SCOPE_LOCK
  - 💬 unblock: fix `BoardProviderReal` in `inbox-api` (separate task, TSK-106 area) so the project-wide typecheck gate is green again, then re-dispatch P1 to re-verify and close it — the OpenCodePort/OpenCodeMock/SessionPool/SchemaRegistry implementation itself is complete and lint-clean; only the shared typecheck gate is blocked by unrelated repo state.
- ✅ `2026-07-12T21:00:00Z` RESOLVED (blocker 2026-07-12T18:39:00Z): TS2654 был гонкой параллельного Layer-0 (TSK-111 гонял глобальный type-check в момент незакоммиченного промежуточного состояния TSK-106 `board-provider.port.ts`). В комбинированном дереве (concrete-default методы порта на месте) type-check зелёный. Причина — глобальный verify-гейт при внутрислойном параллелизме; дальше батч идёт последовательно.
- [x] `2026-07-12T21:00:00Z` ver `npm run type-check` → pass exit=0 (комбинированное дерево)
- [x] `2026-07-12T21:00:00Z` DONE
      **Handoff →** artifacts: [opencode.port.ts, opencode.mock.ts]; decisions: [toolCalls=concrete-default, timeout-unit=minutes, tools-flag=boolean]; open: [P2 перепишет opencode.mock.test.ts под минуты/toolCalls]

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []
