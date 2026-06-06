# Task: TSK-64 — Model selection (agent-run)

<!--SECTION:META-->
## 1. Meta
- **Task-ID:** TSK-64
- **Status:** [ ] TODO
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
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | —    | [ ]    |
| P2 | test | P1   | [ ]    |
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
| Command | Required by |
|---------|-------------|
| npm run type-check | typescript-rules |
| npm run test | node-test |

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
*(Round = one execute-then-audit attempt. Token vocabulary in [tasks/README.md#execution-log-template](../README.md#execution-log-template).)*

### Round 1 — <YYYY-MM-DD>, initial

#### P1
- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2
- [ ] `<ts>` ver `npm run test` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close
- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
