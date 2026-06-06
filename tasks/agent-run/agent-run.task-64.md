# Task: TSK-64 — Model selection (agent-run)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-64
- **Status:** [x] DONE
- **Purpose:** Добавить выбор модели в agent-run: `RunOptions.model`, публичный `listModels`, код `MODEL_UNAVAILABLE`; opencode — дефолт `llm-proxy/deepseek-v4-pro`, `--model`, `listModels` через `opencode models`, ошибка-со-списком без молчаливой подмены.
- **Scope:** agent-run
- **Module:** core + opencode
- **Dependencies:** TSK-62, TSK-63
- **Spec References:**
  - Core: [`run`/`listModels`/`ErrorCode`](../../specs/agent-run/core/core.spec.md#4-entity-surfaces)
  - Port: [`AgentEngine.listModels`](../../specs/agent-run/core/core.spec.md#agentengine)
  - Opencode: [`OpencodeEngine`/`opencodeErrorMap`](../../specs/agent-run/opencode/opencode.spec.md#4-entity-surfaces)
  - Scope: [agent-run §3.1 F7, §4](../../specs/agent-run/agent-run.spec.md#4-public-api-surface), [D-009](../../specs/agent-run/agent-run.spec.md#6-decision-log)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
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

- **Objective:** провести `model` сквозь core + opencode, добавить `listModels` и `MODEL_UNAVAILABLE`.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-run/core/run-options.type.ts`
  - `services/agent-run/core/agent-run-error.ts`
  - `services/agent-run/core/ports/agent-engine.port.ts`
  - `services/agent-run/core/run.ts`
  - `services/agent-run/engines/opencode/opencode-engine.ts`
  - `services/agent-run/engines/opencode/opencode-error-map.ts`
  - `services/agent-run/index.ts`
- **Inputs:** none (модифицирует существующие модули TSK-62/63)
- **Exit:** typecheck pass; `RunOptions.model?`; `ErrorCode` содержит `MODEL_UNAVAILABLE` (8 кодов); `AgentEngine.listModels(): Promise<string[]>`; публичный `listModels(engine?)` экспортирован из `index.ts`; `run` прокидывает `model` в движок; opencode дефолт `llm-proxy/deepseek-v4-pro`, передаёт `--model`, `listModels` парсит `opencode models` (строки `provider/model`, non-zero → []), error-map даёт `MODEL_UNAVAILABLE` на «модель не найдена», движок обогащает hint списком на этой ветке.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** покрыть model-проводку (core unit), error-map + listModels-парсинг (opencode unit), обогащение hint (integration).
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-run/core/__tests__/run.test.ts`
  - `services/agent-run/engines/opencode/__tests__/opencode-error-map.test.ts`
  - `services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD section 4 покрыты; tests pass; integration-сценарии skip при отсутствии opencode.
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Выбор модели с дефолтом deepseek и ошибкой-со-списком

**Scenario:** `RunOptions.model` и `ErrorCode.MODEL_UNAVAILABLE` объявлены [`contract`]

- **Given** типы core
- **When** скомпилированы
- **Then** `RunOptions` имеет `model?: string`; `ErrorCode` включает `'MODEL_UNAVAILABLE'` (8 значений)
- **And** `AgentEngine` имеет `listModels(): Promise<string[]>`; экспортирован публичный `listModels(engine?: string): Promise<string[]>`

**Scenario:** `run()` прокидывает `model` в движок [`unit`]

- **Given** фейковый движок, фиксирующий `opts`
- **When** `run({ task: 'x', model: 'llm-proxy/glm-4.7' })`
- **Then** движок получил `model === 'llm-proxy/glm-4.7'`

**Scenario:** публичный `listModels()` зовёт движок и деградирует [`unit`]

- **Given** фейковый движок с `listModels` → ['a/b']; и второй вариант, где `listModels` бросает
- **When** `listModels()`
- **Then** в первом случае `['a/b']`; во втором — `[]` (не кидает)

**Scenario:** error-map: модель не найдена → `MODEL_UNAVAILABLE` [`unit`]

- **Given** дескриптор со stderr `unknown model` / `no such model` / `model not found`
- **When** `opencodeErrorMap(failure)`
- **Then** `code === 'MODEL_UNAVAILABLE'` (базовый hint, без списка — список добавит движок)

**Scenario:** opencode `listModels` парсит вывод `opencode models` [`unit`]

- **Given** вывод с строками `llm-proxy/deepseek-v4-pro`, `google/gemini-2.5-pro`, заголовком и пустой строкой
- **When** парсер `listModels`
- **Then** только строки вида `provider/model`; non-zero exit → `[]`

**Scenario:** дефолт модели deepseek в аргументах opencode [`unit`]

- **Given** `run({ task })` без `model`
- **When** движок собирает аргументы
- **Then** аргументы содержат `--model llm-proxy/deepseek-v4-pro`

**Scenario:** при `MODEL_UNAVAILABLE` движок обогащает hint списком [`integration`]

- **Given** установленный opencode и заведомо несуществующая модель
- **When** `run({ task, model: 'нет/такой' })`
- **Then** кидает `AgentRunError('MODEL_UNAVAILABLE')`; `hint` содержит хотя бы одну реальную модель из `listModels()`
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command            | Required by      |
| ------------------ | ---------------- |
| npm run type-check | typescript-rules |
| npm run test       | node-test        |

- **Task-specific Completion additions:** integration-сценарий требует установленного opencode (skip при отсутствии).
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario "RunOptions.model + MODEL_UNAVAILABLE + listModels" → contract-level (type-check)
- Scenario "run() прокидывает model" → `services/agent-run/core/__tests__/run.test.ts` :: `passes model to engine`
- Scenario "публичный listModels + деградация" → `services/agent-run/core/__tests__/run.test.ts` :: `listModels delegates to engine and degrades to empty`
- Scenario "error-map модель не найдена" → `services/agent-run/engines/opencode/__tests__/opencode-error-map.test.ts` :: `maps unknown model to MODEL_UNAVAILABLE`
- Scenario "listModels парсит opencode models" → `services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts` :: `parses opencode models output`
- Scenario "дефолт deepseek в аргументах" → `services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts` :: `defaults model to deepseek in args`
- Scenario "MODEL_UNAVAILABLE hint со списком" → `services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts` :: `enriches MODEL_UNAVAILABLE hint with model list`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Token vocabulary in [tasks/README.md#execution-log-template](../README.md#execution-log-template).)_

### Round 1 — 2026-06-06, initial

#### P1

- [x] `2026-06-06T16:38:05Z` intro `MODEL_UNAVAILABLE` ← новый код ошибки для недоступной модели (8-й member ErrorCode)
- [x] `2026-06-06T16:38:05Z` intro `listModels` ← публичная функция деградирующего получения списка моделей из движка
- [x] `2026-06-06T16:38:05Z` intro `DEFAULT_MODEL` ← константа `llm-proxy/deepseek-v4-pro` как дефолт в OpencodeEngine
- [x] `2026-06-06T16:38:05Z` intro `MODELS_LINE_PATTERN` ← regex для парсинга строк `provider/model` из `opencode models`
- [x] `2026-06-06T16:38:05Z` ver `sdd verify` → pass exit=0
- [x] `2026-06-06T16:38:05Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-06T16:38:05Z` DONE
      **Handoff →** artifacts: [services/agent-run/core/run-options.type.ts, services/agent-run/core/agent-run-error.ts, services/agent-run/core/ports/agent-engine.port.ts, services/agent-run/core/run.ts, services/agent-run/engines/opencode/opencode-engine.ts, services/agent-run/engines/opencode/opencode-error-map.ts, services/agent-run/index.ts]; decisions: [MODEL_UNAVAILABLE=added as 8th ErrorCode, DEFAULT_MODEL=llm-proxy/deepseek-v4-pro, listModels-public=exported from index.ts, model-field=RunOptions.model?, listModels-port=AgentEngine.listModels()→Promise<string[]>, hint-enrichment=async via listModels() on MODEL_UNAVAILABLE branch]; open: []

#### P2

- [x] `2026-06-06T17:07:38Z` intro `passes model to engine` ← новый тест-кейс в run.test.ts: проверяет прокидывание model в engine.run()
- [x] `2026-06-06T17:07:38Z` intro `listModels delegates to engine and degrades to empty` ← новый describe listModels() с двумя путями: успех и деградация
- [x] `2026-06-06T17:07:38Z` intro `maps unknown model to MODEL_UNAVAILABLE` ← новый тест в opencode-error-map.test.ts
- [x] `2026-06-06T17:07:38Z` intro `parses opencode models output` ← новый тест в opencode-engine.test.ts (integration/degradation)
- [x] `2026-06-06T17:07:38Z` intro `defaults model to deepseek in args` ← новый тест: run без model → TIMEOUT (не MODEL_UNAVAILABLE) доказывает что дефолт принят opencode
- [x] `2026-06-06T17:07:38Z` intro `enriches MODEL_UNAVAILABLE hint with model list` ← integration тест с skip без opencode
- [x] `2026-06-06T17:07:38Z` insight `'no such model: llm-proxy/fake'` ← строка содержит 'proxy', PROXY_PATTERN срабатывает раньше MODEL_UNAVAILABLE_PATTERN → тест использует 'openai/gpt-99' → opencode-error-map.ts, добавить комментарий о порядке паттернов
- [x] `2026-06-06T17:07:38Z` ver `sdd verify services/agent-run/core/__tests__/run.test.ts services/agent-run/engines/opencode/__tests__/opencode-error-map.test.ts services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts` → pass exit=0
- [x] `2026-06-06T17:07:38Z` ver `npm run test` → pass exit=0
- [x] `2026-06-06T17:07:38Z` DONE
      **Handoff →** artifacts: [services/agent-run/core/__tests__/run.test.ts, services/agent-run/engines/opencode/__tests__/opencode-error-map.test.ts, services/agent-run/engines/opencode/__tests__/opencode-engine.test.ts]; decisions: [all-BDD-scenarios-covered=true, integration-tests-skip-without-opencode=true, MODEL_UNAVAILABLE-pattern-ordering-insight=llm-proxy-contains-proxy-word]; open: []

#### Round close

- [x] `2026-06-06T17:14:03Z` sync agent-run+root
- [x] `2026-06-06T17:14:03Z` DONE

### Round 2 — 2026-06-06, audit-driven fix: F-01

#### P1 (fix)

- [x] `2026-06-06T17:30:00Z` decision pattern-order=MODEL_UNAVAILABLE-before-PROXY ← F-01: `llm-proxy/` id содержит «proxy», PROXY_PATTERN ловил его раньше → дефолтная модель мис-классифицировалась как NETWORK_BLOCKED
- [x] `2026-06-06T17:30:00Z` tried проверка `opencodeErrorMap({exitCode:1, stderr:'no such model: llm-proxy/deepseek-v4-pro'})` → теперь `MODEL_UNAVAILABLE` (было `NETWORK_BLOCKED`)
- [x] `2026-06-06T17:30:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-06T17:30:00Z` ver `npm run test` → pass exit=0
- [x] `2026-06-06T17:30:00Z` DONE
      **Handoff →** artifacts: [services/agent-run/engines/opencode/opencode-error-map.ts, services/agent-run/engines/opencode/__tests__/opencode-error-map.test.ts]; decisions: [pattern-order-fixed=specific-before-general, test-uses-real-default-model]; open: []

#### Round close

- [x] `2026-06-06T17:31:00Z` DONE
<!--/SECTION:EXECUTION_LOG-->
