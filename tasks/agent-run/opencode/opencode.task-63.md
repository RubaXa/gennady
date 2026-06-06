# Task: TSK-63 — Implement opencode engine

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-63
- **Status:** [x] DONE
- **Reopens:** 1 (2026-06-06 — readonly: `opencode agent create` оказался AI-генератором → заменён на `OPENCODE_CONFIG` + статичный `readonly.config.json`)
- **Purpose:** Реализовать адаптер `OpencodeEngine` (запуск `opencode run` в readonly с директориями, оптимистичный запуск, таймаут+SIGKILL, env-гигиена) + `opencodeErrorMap` (exit/stderr → ErrorCode+hint) + `index.ts` composition root (регистрация движка + публичный re-export).
- **Scope:** agent-run
- **Module:** opencode
- **Dependencies:** TSK-62
- **Spec References:**
  - Module spec: [opencode](../../../specs/agent-run/opencode/opencode.spec.md)
  - Adapter: [`OpencodeEngine`](../../../specs/agent-run/opencode/opencode.spec.md#opencodeengine)
  - Utility: [`opencodeErrorMap`](../../../specs/agent-run/opencode/opencode.spec.md#opencodeerrormap)
  - Port: [`AgentEngine`](../../../specs/agent-run/core/core.spec.md#agentengine)
  - Constraints: [agent-run §3.2 N4/N6, §3.4](../../../specs/agent-run/agent-run.spec.md#3-requirements--constraints)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`, `e2e`
- **Deferred Runtime Scope:** доступ к нескольким внешним директориям (`external_directory`) — спайк; v1-фолбэк: одна `--dir` + пути в задании.
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** реализовать адаптер + error-map + composition root в одной impl-фазе.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-run/engines/opencode/opencode-engine.ts`
  - `services/agent-run/engines/opencode/opencode-error-map.ts`
  - `services/agent-run/index.ts`
- **Inputs:** none (потребляет контракт `core` из TSK-62 через импорт)
- **Exit:** typecheck pass; `OpencodeEngine implements AgentEngine` (id='opencode'); оптимистичный spawn без pre-flight `detect()`, spawn `error.code` ENOENT/EACCES → `AGENT_NOT_INSTALLED`; таймаут → SIGTERM→(5с)→SIGKILL, и движок кидает `AgentRunError('TIMEOUT')` сам (НЕ через error-map); `opencodeErrorMap(failure: { spawnErrorCode?, exitCode?, stderr? })` мапит 6 кодов (без TIMEOUT); снимаются все 6 прокси-переменных; readonly-профиль через `opencode agent create --permissions` генерится один раз на процесс (кэш); **multi-dir в v1 = одна `--dir` (первая) + остальные пути в тексте задания** (`external_directory` НЕ реализуем в v1 — deferred); `index.ts` регистрирует движок и re-export-ит `run`/`listEngines`/типы.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** unit на `opencodeErrorMap` (чистая функция, 6 кодов; `TIMEOUT` вне map — кидается движком, проверяется integration) + integration/e2e на `OpencodeEngine` с живым opencode.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-run/engines/opencode/__tests__/opencode-error-map.test.ts`
  - `services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD section 4 покрыты; unit error-map проходит без opencode; integration/e2e помечены/пропускаются при отсутствии opencode; tests pass.
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Запуск opencode в readonly с переводом сбоев в типизированные ошибки

**Scenario:** `OpencodeEngine` реализует `AgentEngine` [`contract`]

- **Given** класс `OpencodeEngine`
- **When** он экспортирован
- **Then** `id === 'opencode'`, есть `detect()` и `run(opts)` по сигнатуре `AgentEngine`

**Scenario:** error-map: spawn ENOENT/EACCES → `AGENT_NOT_INSTALLED` [`unit`]

- **Given** дескриптор `{ spawnErrorCode: 'ENOENT' }` (или `'EACCES'`)
- **When** `opencodeErrorMap(failure)`
- **Then** `{ code: 'AGENT_NOT_INSTALLED', hint: <про установку opencode> }`

**Scenario:** error-map: прокси-403 → `NETWORK_BLOCKED` [`unit`]

- **Given** stderr содержит `ERR_ACCESS_DENIED` / `403` / `proxy`
- **When** `opencodeErrorMap`
- **Then** `{ code: 'NETWORK_BLOCKED', hint: <про снятие прокси-переменных> }`

**Scenario:** error-map: schema-сигнал → `VERSION_MISMATCH` с hint в обе стороны [`unit`]

- **Given** stderr содержит `constraint failed.*session_message` (или `database schema` / `migration`)
- **When** `opencodeErrorMap`
- **Then** `{ code: 'VERSION_MISMATCH', hint: <CLI отстал → brew upgrade; App отстал → обновить App> }`

**Scenario:** error-map: Forbidden → `MODEL_FORBIDDEN`; missing key → `CREDENTIAL_MISSING` [`unit`]

- **Given** stderr `Forbidden` на модель / `API key … missing`
- **When** `opencodeErrorMap`
- **Then** соответственно `MODEL_FORBIDDEN` / `CREDENTIAL_MISSING`

**Scenario:** error-map: нераспознанное / сбой `agent create` → `LAUNCH_FAILED` [`unit`]

- **Given** дескриптор с нераспознанным stderr ИЛИ `exitCode`+stderr от упавшего `agent create`
- **When** `opencodeErrorMap(failure)`
- **Then** `{ code: 'LAUNCH_FAILED', hint: <сырой stderr + "причина не распознана"> }`
- **And** `TIMEOUT` через error-map НЕ проходит — его кидает `OpencodeEngine` по таймеру (покрыто integration-сценарием «таймаут убивает подпроцесс»)

**Scenario:** `detect()` возвращает installed+version при наличии opencode [`integration`]

- **Given** opencode установлен в PATH
- **When** `engine.detect()`
- **Then** `{ installed: true, version: <строка> }`

**Scenario:** `run()` возвращает текст для задания в readonly [`e2e`]

- **Given** установленный opencode, снятый `HTTPS_PROXY`, директория с файлами
- **When** `run({ task: 'опиши репозиторий', dirs: [dir] })`
- **Then** `RunResult.text` непустой (markdown); ни один файл в `dir` не изменён

**Scenario:** readonly-профиль генерится один раз на процесс [`integration`]

- **Given** шпион на генерацию профиля (`opencode agent create`)
- **When** `run()` вызван дважды в одном процессе
- **Then** профиль сгенерирован ровно один раз (кэш), переиспользован вторым запуском

**Scenario:** env-гигиена снимает прокси-переменные подпроцесса [`integration`]

- **Given** заданы `HTTPS_PROXY` и `https_proxy`
- **When** `run()` спавнит подпроцесс
- **Then** окружение подпроцесса не содержит ни одной из 6 прокси-переменных

**Scenario:** таймаут убивает подпроцесс и кидает `TIMEOUT` [`integration`]

- **Given** заведомо долгое задание и малый `timeout`
- **When** `run({ task, timeout: <мало> })`
- **Then** кидает `AgentRunError('TIMEOUT')`; подпроцесс мёртв (SIGTERM→SIGKILL), не сирота
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command            | Required by      |
| ------------------ | ---------------- |
| npm run type-check | typescript-rules |
| npm run test       | node-test        |

- **Task-specific Completion additions:** integration/e2e сценарии требуют установленного opencode и снятых прокси-переменных; при отсутствии opencode — помечаются skipped, не fail.
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario "OpencodeEngine реализует AgentEngine" → contract-level (type-check)
- Scenario "ENOENT/EACCES → AGENT_NOT_INSTALLED" → `services/agent-run/engines/opencode/__tests__/opencode-error-map.test.ts` :: `maps spawn ENOENT to AGENT_NOT_INSTALLED`
- Scenario "прокси-403 → NETWORK_BLOCKED" → `…/opencode-error-map.test.ts` :: `maps proxy 403 to NETWORK_BLOCKED`
- Scenario "schema → VERSION_MISMATCH" → `…/opencode-error-map.test.ts` :: `maps schema error to VERSION_MISMATCH`
- Scenario "Forbidden/missing key" → `…/opencode-error-map.test.ts` :: `maps forbidden and missing-key`
- Scenario "нераспознанное/agent-create → LAUNCH_FAILED" → `…/opencode-error-map.test.ts` :: `maps unknown and agent-create failure to LAUNCH_FAILED`
- Scenario "detect installed+version" → `…/opencode-engine.test.ts` :: `detect returns installed and version`
- Scenario "run возвращает текст (e2e)" → `…/opencode-engine.test.ts` :: `run returns markdown text in readonly`
- Scenario "профиль один раз на процесс" → `…/opencode-engine.test.ts` :: `generates readonly profile once per process`
- Scenario "env-гигиена прокси" → `…/opencode-engine.test.ts` :: `strips proxy vars from subprocess env`
- Scenario "таймаут убивает подпроцесс" → `…/opencode-engine.test.ts` :: `kills subprocess on timeout and throws TIMEOUT`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-06-06, initial

#### P1

- [x] `2026-06-06T15:46:05Z` intro `OpencodeEngine` ← адаптер AgentEngine для opencode; реализует detect/run с readonly-профилем и env-гигиеной
- [x] `2026-06-06T15:46:05Z` intro `opencodeErrorMap` ← чистая функция перевода spawn-ошибки/stderr в ErrorCode+hint
- [x] `2026-06-06T15:46:05Z` intro `OpencodeFailure` ← нормализованный дескриптор сбоя для opencodeErrorMap
- [x] `2026-06-06T15:46:05Z` intro `OpencodeErrorMapping` ← возвращаемый тип opencodeErrorMap
- [x] `2026-06-06T15:46:05Z` intro `composeCleanEnv` ← вспомогательная функция удаления прокси-переменных из env
- [x] `2026-06-06T15:46:05Z` decision multi-dir=v1-fallback ← external_directory deferred; первый dir → --dir, остальные — в тексте задания
- [x] `2026-06-06T15:46:05Z` decision profile-cache=promise-guard ← \_profileGeneration ??= предотвращает двойную генерацию при конкурентных вызовах run()
- [x] `2026-06-06T15:50:00Z` tried anchor-on-const → removed ← DBC lint ERR_CLI_LINT_ANCHOR_TOO_THIN; однострочные const не оборачиваем
- [x] `2026-06-06T15:50:30Z` tried @see + @purpose on detect/run → removed @see ← ERR_DBC_PURPOSE_CONFLICT; при наличии уточняющих тегов (@returns/@param) пишем полный контракт без @see
- [x] `2026-06-06T15:52:00Z` ver `sdd verify services/agent-run/engines/opencode/opencode-engine.ts services/agent-run/engines/opencode/opencode-error-map.ts services/agent-run/index.ts` → pass exit=0
- [x] `2026-06-06T15:52:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-06T15:52:00Z` DONE
      **Handoff →** artifacts: [services/agent-run/engines/opencode/opencode-engine.ts, services/agent-run/engines/opencode/opencode-error-map.ts, services/agent-run/index.ts]; decisions: [profile-cache=promise-guard, multi-dir=v1-fallback, env-hygiene=6-proxy-vars-stripped, timeout=SIGTERM+5s-SIGKILL]; open: []

#### P2

- [x] `2026-06-06T16:02:14Z` insight timeout close-handler race: original `close` listener wins over inner listener registered inside killTimer callback; engine never emits TIMEOUT → fixed by adding `timedOut` flag set before SIGTERM so the original handler yields → `opencode-engine.ts` START_PROCESS_EXIT_HANDLING / START_TIMEOUT_ENFORCEMENT
- [x] `2026-06-06T16:02:14Z` decision engine-bug-fix=timedOut-flag ← минимальное исправление race condition в P1 engine; `timedOut` выставляется до kill(), close-handler проверяет флаг и уступает timeout-handler
- [x] `2026-06-06T16:02:14Z` ver `sdd verify services/agent-run/engines/opencode/__tests__/opencode-error-map.test.ts services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts services/agent-run/engines/opencode/opencode-engine.ts` → pass exit=0
- [x] `2026-06-06T16:02:14Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-06T16:02:14Z` ver `npm run test` → pass exit=0
- [x] `2026-06-06T16:02:14Z` DONE

**Handoff →** artifacts: [services/agent-run/engines/opencode/__tests__/opencode-error-map.test.ts, services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts, services/agent-run/engines/opencode/opencode-engine.ts]; decisions: [engine-bug-fix=timedOut-flag, e2e-guard=GENNADY_E2E=1, integration-guard=isOpencodeAvailable]; open: []

#### Round close

- [x] `2026-06-06T16:03:16Z` sync agent-run+root
- [x] `2026-06-06T16:03:16Z` DONE

### Round 2 — 2026-06-06, fix: readonly mechanism (live e2e discovery)

#### P1 (fix)

- [x] `2026-06-06T18:10:00Z` discovery `opencode agent create` — это AI-генератор («Generating agent configuration», вызов модели), а не быстрая запись файла → живой `gennady run` зависал
- [x] `2026-06-06T18:10:00Z` decision readonly-mechanism=OPENCODE_CONFIG+static-config ← заменил генерацию профиля на bundled `readonly.config.json` (agent `readonly`: deny edit/write/patch; bash оставлен) + `OPENCODE_CONFIG` в env подпроцесса + `--agent readonly`
- [x] `2026-06-06T18:10:00Z` intro `readonly.config.json` ← статичный bundled-конфиг readonly-агента
- [x] `2026-06-06T18:10:00Z` verified `OPENCODE_CONFIG` дополняет конфиг пользователя (31 llm-proxy модель видна; провайдеры/ключ сохранены)
- [x] `2026-06-06T18:10:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-06T18:20:00Z` ver `gennady run "...pong" --timeout 120000` → pass exit=0 (вывод «pong», без зависания)
- [x] `2026-06-06T18:10:00Z` DONE
      **Handoff →** artifacts: [services/agent-run/engines/opencode/opencode-engine.ts, services/agent-run/engines/opencode/readonly.config.json, services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts]; decisions: [agent-create→OPENCODE_CONFIG, bash-allowed-per-operator, D-005-superseded-by-D-010]; open: []

#### Round close

- [x] `2026-06-06T18:25:00Z` DONE
<!--/SECTION:EXECUTION_LOG-->
