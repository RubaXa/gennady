# Task: TSK-112 — inbox-opencode: OpenCodeReal (SDK-интеграция)

## 1. Meta

- **Task-ID:** TSK-112 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-111 (port+mock)
- **Purpose:** Реальная интеграция с OpenCode через `@opencode-ai/sdk`. Research-фаза: подтвердить `format: json_schema`, events, directory-байндинг сессии. Реализация: status/continueSignal/format. Fallback: JSON-блок + парсинг.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-01, SV-05, [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P0 | research | — | [ ]    |
| P1 | impl | P0   | [ ]    |
| P2 | test | P1   | [ ]    |

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

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
