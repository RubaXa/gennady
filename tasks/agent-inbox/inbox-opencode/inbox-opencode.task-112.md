# Task: TSK-112 — inbox-opencode: OpenCodeReal (SDK-интеграция)

## 1. Meta

- **Task-ID:** TSK-112 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-111 (port+mock)
- **Purpose:** Реальная интеграция с OpenCode через `@opencode-ai/sdk` + `opencode serve`. Замена мока.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-01, SV-05, [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

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
