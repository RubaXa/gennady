# Task: TSK-112 — inbox-opencode: OpenCodeReal (SDK-интеграция)

## 1. Meta

- **Task-ID:** TSK-112 | **Status:** [ ] REOPEN (пивот D-86) | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-111 (port+mock)

> **Round 2 — пивот D-86.** `OpenCodeReal` — агентная сессия (tools вкл, cwd=worktree), `prompt`
> ждёт завершения хода агента с таймаутом-в-минутах; реализовать `toolCalls(sid)` из телеметрии SDK.
> Урок TSK-117: 45 КБ директивы one-shot в пустую директорию виснет — repro в тесте, что с worktree+тулами
> сессия завершается.

- **Purpose:** Реальная интеграция с OpenCode через `@opencode-ai/sdk`. Research-фаза: подтвердить `format: json_schema`, events, directory-байндинг сессии. Реализация: status/continueSignal/format. Fallback: JSON-блок + парсинг.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-01, SV-05, [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P0  | research | —    | [x]    |
| P1  | impl     | P0   | [x]    |
| P2  | test     | P1   | [x]    |

## 3. Phases

### P0 — research (подтвердить SDK API)

- **Rules:** none
- **Target:** Подтвердить на актуальной версии `@opencode-ai/sdk`: `session.prompt()` с `format: { type: 'json_schema', schema }`, `client.event.list()` (SSE), `session.abort()`, `createSession({ directory })`.
- **Exit:** Research-логи: что работает, что нет. Если format недоступен → fallback (JSON-блок + парсинг). Результат зафиксировать в D-78.

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/opencode.real.ts` — OpenCodeReal: реализация OpenCodePort через `@opencode-ai/sdk` (client-only, `createOpencodeClient({ baseUrl })`)
  - Bootstrap: `npm install --save-dev @opencode-ai/sdk` (Bootstrap #9)
- **Exit:** OpenCodeReal подключается к `opencode serve` на localhost:4096. prompt() → structured output.

### P2 — test

- **Rules:** none
- **Target Files:** `services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts`
- **Exit:** Тесты: успешный prompt (если opencode запущен), ошибка при недоступности.

## 4. BDD

- GIVEN opencode serve на localhost:4096 WHEN createSession + prompt THEN structured output по схеме
- GIVEN opencode недоступен WHEN prompt() THEN OpenCodeError('UNAVAILABLE')
- GIVEN модель вернула невалидный JSON WHEN prompt() THEN StructuredOutputError

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                    | Level | Test File             |
| --------------------------- | ----- | --------------------- |
| Real: успешный prompt       | unit  | opencode.real.test.ts |
| Real: UNAVAILABLE           | unit  | opencode.real.test.ts |
| Real: StructuredOutputError | unit  | opencode.real.test.ts |

## 7. Execution Log

### Round 1 — initial

#### P0 — research (SDK API)

- [x] `@opencode-ai/sdk@1.17.18` installed (`npm install --save-dev`)
- [x] SDK exports: `createOpencodeClient`, `OpencodeClient`, `createOpencodeServer`
- [x] `createSession` → `client.session.create({ body: { title }, query: { directory? } })` ✅ directory binding works via query param + client-level config
- [x] `prompt` → `client.session.prompt({ body: { system?, parts }, path: { id }, query: { directory? } })` — synchronous POST, blocks until completion
- [x] `format: { type: 'json_schema', schema }` — **NOT natively supported** in SDK v1.17.18 `SessionPromptData.body` (only: `messageID`, `model`, `agent`, `noReply`, `system`, `tools`, `parts`)
- [x] `status` → `client.session.status({ query: { directory? } })` returns `{ [sid]: { type: 'idle'|'busy'|'retry' } }`
- [x] `abort` → `client.session.abort({ path: { id } })` ✅
- [x] `close` → `client.session.delete({ path: { id } })` ✅
- [x] SSE: `client.event.subscribe()` and `client.global.event()` available → not needed for current prompt flow
- [x] **Decision D-78 confirmed**: format fallback needed — embed JSON schema in system prompt, extract JSON from ```json code blocks
- [x] 2026-07-10 DONE

#### P1 — impl

- [x] 2026-07-10 ver `npm run type-check` → pass exit=0 (no errors in opencode.real.ts; pre-existing errors in inbox-roles unrelated)
- [x] `services/agent-inbox/modules/inbox-opencode/opencode.real.ts` created:
  - Imports `createOpencodeClient` from `@opencode-ai/sdk`
  - Constructor: `{ baseUrl?, directory?, timeout? }` with defaults (localhost:4096, 5min)
  - `createSession` → `client.session.create()` with directory binding
  - `prompt` / `continueSignal` → `_sendPrompt()` → `client.session.prompt()` → JSON extraction fallback
  - `status` → maps SDK `SessionStatus` (idle/busy/retry) to port (idle/running/error/terminated)
  - `abort` → `client.session.abort()` — swallows errors
  - `close` → `client.session.delete()` — swallows errors
  - Format fallback: embeds JSON schema + example in system prompt, extracts ```json blocks from response, validates against schema
  - Lazy client init via `_ensureClient()`
- [x] 2026-07-10 DONE

#### P2 — test

- [x] 2026-07-10 ver `node --import tsx --test services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts` → pass exit=0 (18/18 tests passed)
- [x] `services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts` created:
  - **UNAVAILABLE** (6 tests): createSession throws on ECONNREFUSED, prompt/continueSignal returns SESSION_ERROR, status returns terminated, abort/close swallow errors
  - **Structured output** (5 tests): text output without format, valid JSON with format, PARSE_ERROR on malformed JSON, SCHEMA_MISMATCH on invalid schema, NO_RESULT on missing JSON
  - **Error classification** (3 tests): SESSION_ERROR, TIMEOUT, INCOMPLETE_ARTIFACT
  - **continueSignal** (2 tests): OK and error paths
  - **Constructor defaults** (2 tests): default/custom baseUrl
- [x] 2026-07-10 ver `npm run format:check` → pass exit=0 (both files clean)
- [x] 2026-07-10 DONE
