# Task: TSK-112 — inbox-opencode: OpenCodeReal (агентная сессия через SDK)

<!--SECTION:META-->
## 1. Meta

- **Task-ID:** TSK-112 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-111 (port+mock)
- **Purpose:** Реальная интеграция OpenCodePort через `@opencode-ai/sdk` + `opencode serve` в **агентном режиме**: сессия с cwd=worktree и тулами, `prompt` ждёт завершения хода агента (таймаут в минутах), `toolCalls` из телеметрии SDK. Реврайт под D-86.
- **Spec:** [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md), [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-01/SV-05 | **Runtime:** not-implemented | **Verification:** unit
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->
## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P0  | research | —    | [ ]    |
| P1  | impl     | P0   | [ ]    |
| P2  | test     | P1   | [ ]    |
<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P0-->
### P0 — research (агентный SDK)

- **Rules:** none
- **Задача:** подтвердить в актуальном `@opencode-ai/sdk`: (1) агентная сессия с тулами и `directory`=cwd; (2) `session.prompt` завершается по окончании хода агента; (3) как достать список tool-calls (открытые файлы) — для `toolCalls`; (4) поведение `format`/structured output. Зафиксировать выводы в Execution Log (insight-строки).
- **Exit:** Способ агентного прогона и извлечения tool-call лога подтверждён на живом `opencode serve` (или задокументировано ограничение).
<!--/SECTION:PHASE_P0-->

<!--SECTION:PHASE_P1-->
### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-opencode/opencode.real.ts` — OpenCodeReal implements OpenCodePort: агентная сессия (`createSession` с tools+directory), `prompt` c таймаутом-в-минутах и возвратом по завершению хода, `toolCalls(sid)` из телеметрии, `status`, `continueSignal`, `abort`, `close`. Схема не инъектируется в текст промпта (F10); структурный вывод парсится из результата.
  - Bootstrap: `@opencode-ai/sdk` (уже установлен).
- **Exit:** OpenCodeReal подключается к `opencode serve`; агентная сессия завершает ход и отдаёт результат + toolCalls. Репро урока TSK-117: worktree+тулы+предметная задача → сессия завершается (не виснет 300s).
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — test

- **Rules:** none
- **Target Files:** `services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts`
- **Exit:** Тесты: агентный prompt (если opencode запущен), UNAVAILABLE при недоступности, извлечение toolCalls.
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->
## 4. BDD

- GIVEN opencode serve WHEN createSession(cwd=worktree, tools=on) + prompt(предметная задача) THEN ход завершается, результат + toolCalls непусты
- GIVEN opencode недоступен WHEN prompt THEN OpenCodeError('UNAVAILABLE')
- GIVEN промпт с format WHEN ход завершён THEN structured output распарсен из результата (без инъекции схемы в текст)
- GIVEN промпт превысил timeout (минуты) WHEN истёк THEN TIMEOUT (abort сессии)
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts'` — pass
- `npm run format:check` — pass
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## 6. Test Scenario Coverage

| Scenario                  | Level | Test File             |
| ------------------------- | ----- | --------------------- |
| Real: агентный prompt     | unit  | opencode.real.test.ts |
| Real: UNAVAILABLE         | unit  | opencode.real.test.ts |
| Real: toolCalls извлечены | unit  | opencode.real.test.ts |
| Real: TIMEOUT (минуты)    | unit  | opencode.real.test.ts |
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## 7. Execution Log

### Round 1 — initial

#### P0

- [ ] `<ts>` insight `<observation>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: []; decisions: []; open: []
<!--/SECTION:EXECUTION_LOG-->
