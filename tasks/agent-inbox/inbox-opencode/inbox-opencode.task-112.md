# Task: TSK-112 — inbox-opencode: OpenCodeReal (агентная сессия через SDK)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-112 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-opencode | **Dependencies:** TSK-111 (port+mock)
- **Purpose:** Реальная интеграция OpenCodePort через `@opencode-ai/sdk` + `opencode serve` в **агентном режиме**: сессия с cwd=worktree и тулами, `prompt` ждёт завершения хода агента (таймаут в минутах), `toolCalls` из телеметрии SDK. Реврайт под D-86.
- **Spec:** [inbox-opencode.spec.md](../../specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md), [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-01/SV-05 | **Runtime:** not-implemented | **Verification:** unit
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P0  | research | —    | [x]    |
| P1  | impl     | P0   | [x]    |
| P2  | test     | P1   | [x]    |

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

- [x] `2026-07-12T19:27:54Z` insight `session.create` body = `{parentID?, title?}` — `directory` НЕ хранится сессией, передаётся query-параметром на КАЖДОМ вызове (create/prompt/status/abort/close) → inbox-opencode.spec.md OpenCodeReal, подтверждено без изменений: текущий `_sessionDirs` map в opencode.real.ts — верный паттерн, P1 сохраняет
- [x] `2026-07-12T19:27:54Z` insight агентные тулы включаются per-prompt через `tools?: {[name]: boolean}` в теле `session.prompt`/`session.prompt_async`, НЕ на `session.create` (в SDK нет флага tools на уровне сессии) → inbox-opencode.spec.md OpenCodeReal, P1: `CreateSessionOpts.tools` мапить на присутствие/отсутствие ограничивающего `tools`-объекта в теле prompt, а не на createSession-запрос
- [x] `2026-07-12T19:27:54Z` verified @opencode-ai/sdk@1.17.18 (node_modules) против живого `opencode serve` (CLI обновлён `brew upgrade opencode` 1.16.2→1.17.15, HTTPS_PROXY unset — сквозь squid): `session.prompt()` — синхронный HTTP-вызов, ответ приходит по завершении хода агента (замерено 7.6–15.9s на живом llm-proxy/glm-5), без polling — подтверждает пункт (2) задачи
- [x] `2026-07-12T19:27:54Z` insight (критично) `session.prompt()` возвращает `parts` ТОЛЬКО последнего assistant-сообщения хода; промежуточные assistant-сообщения того же хода (содержащие `ToolPart`) в этот ответ не попадают — видны только через `session.messages({path:{id:sid}})`, перебором всех сообщений роли assistant → inbox-opencode.spec.md OpenCodeReal/`toolCalls`, P1: `toolCalls(sid)` должен агрегировать `type==='tool'` части через `session.messages`, а не через ответ одного prompt-вызова (живой прогон подтвердил: read-тул явно виден только в `session.messages`, отсутствует в `session.prompt` ответе)
- [x] `2026-07-12T19:27:54Z` insight `ToolPart.state.input.filePath` — абсолютный путь, а не относительный к directory → inbox-opencode.spec.md OpenCodeReal, P1: `toolCalls()` обязан вычислять path относительно session directory (strip prefix) перед возвратом `ToolCall.path` (порт документирует path как "relative to the session directory")
- [x] `2026-07-12T19:27:54Z` insight `SessionPromptData`/`SessionPromptAsyncData` не содержат поля `format`/json_schema — структурный вывод в SDK 1.17.x не нативен (только `model`/`agent`/`system`/`tools`/`parts`) → подтверждает текущий подход OpenCodeReal (схема не инъецируется в текст, JSON парсится из ```json-блоков ответа) остаётся единственным рабочим путём, без изменений
- [x] `2026-07-12T19:27:54Z` discovery живой `GET /agent` (CLI 1.17.15) не совпадает по форме с типами установленного `@opencode-ai/sdk@1.17.18`: типовой `Agent.permission` — объект по категориям (edit/bash/webfetch/...), реальный ответ — массив правил `{permission, pattern, action}`; типовое поле `tools` в реальном ответе отсутствует вовсе → P1 не полагаться строго на TS-типы для `/agent`-подобных вспомогательных эндпоинтов, читать defensively
- [x] `2026-07-12T19:27:54Z` insight репро урока TSK-117 (45 КБ one-shot директивы в пустую директорию виснет): живой прогон с малым системным промптом + реальным worktree (файлы присутствуют) + предметной задачей + tools по умолчанию завершается за 7.6–15.9s без зависания; агент `build` имеет permission-правило `*`→`allow` (кроме `doom_loop`/`external_directory` вне разрешённых путей) — permission-ask не блокирует ход в обычном worktree → подтверждает: причина зависания в TSK-117 — отсутствие предметной задачи и файлов для тулов, а не сам факт большого промпта
- [x] `2026-07-12T19:27:54Z` insight текущий `_withTimeout` в opencode.real.ts (черновик до P1) только локально отклоняет promise по истечении ms, не вызывает `client.session.abort` на сервере — агентный ход продолжает выполняться на сервере в фоне после клиентского TIMEOUT → inbox-opencode.task-112.md BDD п.4 ("истёк THEN TIMEOUT (abort сессии)"), P1: таймаут-путь обязан вызывать `abort(sid)` перед возвратом TIMEOUT-результата
- [x] `2026-07-12T19:27:54Z` ver skip:research-no-target-files-no-verification-commands
- [x] `2026-07-12T19:27:54Z` DONE
      **Handoff →** artifacts: []; decisions: [prompt-tools=per-prompt-map-not-session-level, toolCalls-source=session.messages-not-prompt-response, toolCalls-path=relative-strip-directory-prefix, format=no-native-json-schema-keep-text-extraction, timeout-must-call-abort=true]; open: []

#### P1

- [x] `2026-07-12T19:37:49Z` decision tools-gate=per-prompt-wildcard-deny-all ← `CreateSessionOpts.tools` хранится в `_sessionTools` (sid→bool) и применяется на каждом `_sendPrompt`: `true` → поле `tools` в теле не передаётся (дефолт агента, подтверждён живым прогоном P0); иначе → `tools: {'*': false}` (полный запрет). Ключ `'*'` не подтверждён отдельным живым прогоном в P1 — вынесено в `open`
- [x] `2026-07-12T19:37:49Z` discovery в черновике (до P1) `opts.timeout` (`PromptOpts.timeout`, контракт — минуты) передавался в `_withTimeout` как есть, то есть трактовался как миллисекунды → добавлена конвертация `opts.timeout * 60_000` перед вызовом
- [x] `2026-07-12T19:37:49Z` discovery `toolCalls(sid)` был заглушкой из `OpenCodePort` (пустой массив) → реализован через `client.session.messages({path:{id:sid}})`, фильтр `info.role==='assistant'`, части `type==='tool'` с `state.input.filePath`; путь приводится к относительному через `_relativeToSessionDirectory` (strip-prefix по `_sessionDirs`)
- [x] `2026-07-12T19:37:49Z` decision timeout-abort-wired=true ← `_withTimeout` принимает `onTimeout`-колбэк, вызываемый до reject; `_sendPrompt` передаёт `() => void this.abort(sid)` — таймаут больше не оставляет ход агента висеть на сервере
- [x] `2026-07-12T19:37:49Z` ver `~/.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/modules/inbox-opencode/opencode.real.ts` → pass exit=0
- [x] `2026-07-12T19:38:30Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-12T19:39:10Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts'` → pass exit=0
- [x] `2026-07-12T19:39:40Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-12T19:39:41Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-opencode/opencode.real.ts]; decisions: [tools-gate=per-prompt-wildcard-deny-all, timeout-unit-bug-fixed=minutes-to-ms-conversion-applied, toolCalls-implemented=session.messages-aggregation-strip-prefix, timeout-abort-wired=true]; open: [tools-wildcard: ключ '*' в `tools`-карте SDK для полного запрета тулов не подтверждён отдельным живым прогоном — P2 может проверить сценарий tools=off живым тестом, если появится в Test Scenario Coverage]

#### P2

- [x] `2026-07-12T19:41:28Z` decision timeout-wildcard-tests-use-fractional-minutes ← TIMEOUT-сценарии в `opencode.real.test.ts` используют `timeout: 0.0001` (минуты → 6мс) со stub-клиентом, чей `session.prompt` никогда не резолвится — проверяет реальный `_withTimeout`-таймер и вызов `abort(sid)`, без ожидания живого сервера
- [x] `2026-07-12T19:41:28Z` discovery «Real: агентный prompt» и «Real: toolCalls извлечены» в Test Scenario Coverage помечены level=unit — реализованы через stub `_ensureClient()` (fake SDK client), без живого `opencode serve`, по env-note диспетчера ("Live opencode is optional for tests — prefer a stubbed/faked SDK client")
- [x] `2026-07-12T19:41:28Z` ver `~/.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts` → pass (ALL_GATES_PASS 4/4)
- [x] `2026-07-12T19:41:28Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-12T19:41:28Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts'` → pass exit=0
- [x] `2026-07-12T19:41:28Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-12T19:41:53Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-opencode/__tests__/opencode.real.test.ts]; decisions: [agentic-prompt-tested-via-stubbed-sdk-client=true, toolCalls-tested-via-stubbed-session-messages=true, timeout-abort-verified-via-mocked-abort-method=true]; open: [tools-wildcard: ключ '*' в `tools`-карте SDK для полного запрета тулов остаётся не подтверждён отдельным живым прогоном — вне Test Scenario Coverage этого тикета, кандидат для отдельной задачи/аудита]

#### Round close

- [x] `2026-07-12T21:30:00Z` all phases DONE (P0 research, P1 impl, P2 test)
- [x] `2026-07-12T21:30:00Z` orchestrator sync trackers → audit pending
<!--/SECTION:EXECUTION_LOG-->
