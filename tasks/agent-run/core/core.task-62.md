# Task: TSK-62 — Implement core module

<!--SECTION:META-->
## 1. Meta
- **Task-ID:** TSK-62
- **Status:** [ ] TODO
- **Purpose:** Реализовать движок-независимое ядро `agent-run`: контракт `AgentEngine` (Port), типы (`RunOptions`/`RunResult`/`EngineStatus`), ошибки (`AgentRunError`/`ErrorCode`), реестр движков и публичные `run`/`listEngines` с оптимистичным запуском и таймаутом.
- **Scope:** agent-run
- **Module:** core
- **Dependencies:** None
- **Spec References:**
  - Module spec: [core](../../../specs/agent-run/core/core.spec.md)
  - Port: [`AgentEngine`](../../../specs/agent-run/core/core.spec.md#agentengine)
  - Service: [`run` / `registry`](../../../specs/agent-run/core/core.spec.md#5-module-contracts-dbc)
  - Entity: [`AgentRunError`](../../../specs/agent-run/core/core.spec.md#entity-agentrunerror)
  - Scope: [agent-run §4 Public API Surface](../../../specs/agent-run/agent-run.spec.md#4-public-api-surface)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`
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
- **Objective:** реализовать Port, типы, ошибки, реестр и публичные `run`/`listEngines` в одной impl-фазе.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-run/core/ports/agent-engine.port.ts`
  - `services/agent-run/core/run-options.type.ts`
  - `services/agent-run/core/agent-run-error.ts`
  - `services/agent-run/core/registry.ts`
  - `services/agent-run/core/run.ts`
- **Inputs:** none
- **Exit:** typecheck pass; `run()` резолвит дефолт без вызова `detect()` (оптимистично); пустой/пробельный `task` → `AgentRunError('LAUNCH_FAILED')` до диспетчеризации; `run()` подставляет дефолт `timeout=120000` и прокидывает в `engine.run` (само прерывание — забота движка); `resolve(unknownId)` и пустой реестр → `AgentRunError('AGENT_NOT_INSTALLED')`; `ErrorCode` содержит 7 значений включая `TIMEOUT`; `listEngines()` кэширует `detect()`. `index.ts` (composition root) НЕ здесь — он в TSK-63.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — test
- **Objective:** contract-typing тесты на форму типов + unit на поведение `run`/`registry`/`listEngines` через фейковый движок.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-run/core/__tests__/run.test.ts`
  - `services/agent-run/core/__tests__/registry.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии section 4 покрыты; tests pass; фейковый движок (inline-хелпер с `mock.fn()`-шпионами из `node:test`, общий для `run.test.ts` и `registry.test.ts`) подтверждает: `run()` не зовёт `detect()` на горячем пути; дефолт `timeout=120000` прокинут в движок; пустой `task` → `LAUNCH_FAILED` без вызова движка.
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->
## 4. Acceptance Criteria (BDD)
Contract: see Spec References.

**Feature:** Движок-независимое ядро запуска агентов

**Scenario:** `AgentEngine` объявляет контракт движка [`contract`]
- **Given** интерфейс `AgentEngine` в `agent-engine.port.ts`
- **When** он экспортирован
- **Then** содержит `readonly id: string`, `detect(): Promise<{ installed: boolean; version?: string }>`, `run(opts: RunOptions): Promise<RunResult>`

**Scenario:** `RunOptions`/`RunResult`/`EngineStatus` имеют форму из §4 [`contract`]
- **Given** типы определены
- **When** экспортированы
- **Then** `RunOptions` = `{ task: string; dirs?: string[]; mode?: 'readonly'; engine?: string; timeout?: number }`
- **And** `RunResult` = `{ text: string; engine: string }`; `EngineStatus` = `{ id: string; installed: boolean; version?: string }`

**Scenario:** `AgentRunError` несёт code + hint; `ErrorCode` — 7 значений [`contract`]
- **Given** `AgentRunError` и `ErrorCode` в `agent-run-error.ts`
- **When** экспортированы
- **Then** `AgentRunError extends Error` с `code: ErrorCode` и `hint: string`
- **And** `ErrorCode` = `AGENT_NOT_INSTALLED | NETWORK_BLOCKED | VERSION_MISMATCH | MODEL_FORBIDDEN | CREDENTIAL_MISSING | TIMEOUT | LAUNCH_FAILED`

**Scenario:** `run()` запускает дефолтный движок без pre-flight `detect()` [`unit`]
- **Given** реестр с фейковым движком, у которого `detect()` шпионится
- **When** `run({ task: 'x' })`
- **Then** возвращает `RunResult` фейкового движка
- **And** `detect()` фейкового движка НЕ вызывался (оптимистичный путь)

**Scenario:** пустой реестр → `AGENT_NOT_INSTALLED` [`unit`]
- **Given** реестр без зарегистрированных движков
- **When** `run({ task: 'x' })`
- **Then** кидает `AgentRunError` с `code === 'AGENT_NOT_INSTALLED'`

**Scenario:** `resolve(unknownId)` → `AGENT_NOT_INSTALLED`, не `undefined` [`unit`]
- **Given** реестр с движком `'opencode'`
- **When** `run({ task: 'x', engine: 'claude' })`
- **Then** кидает `AgentRunError('AGENT_NOT_INSTALLED')` с hint о незарегистрированном движке

**Scenario:** `run()` подставляет дефолтный `timeout` и прокидывает его в движок [`unit`]
- **Given** фейковый движок, фиксирующий полученные `opts`
- **When** `run({ task: 'x' })` без `timeout`, затем `run({ task: 'x', timeout: 5000 })`
- **Then** движок получил `timeout === 120000` в первом вызове и `5000` во втором
- **And** само прерывание/убийство подпроцесса — забота движка (здесь не проверяется; integration в TSK-63)

**Scenario:** пустой `task` → `LAUNCH_FAILED` до диспетчеризации [`unit`]
- **Given** реестр с фейковым движком со шпионом на `run()`
- **When** `run({ task: '   ' })` (пустой/пробельный)
- **Then** кидает `AgentRunError` с `code === 'LAUNCH_FAILED'` и hint про пустой task
- **And** `run()` движка не вызывался

**Scenario:** `listEngines()` кэширует `detect()` [`unit`]
- **Given** реестр с фейковым движком со шпионом на `detect()`
- **When** `listEngines()` вызван дважды
- **Then** `detect()` фейкового движка вызван ровно один раз (кэш на процесс)

**Scenario:** `listEngines()` деградирует мягко при сбое `detect()` [`unit`]
- **Given** два движка, у первого `detect()` бросает
- **When** `listEngines()`
- **Then** возвращает статусы обоих; для упавшего `installed: false`; вызов не бросает
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## 5. Verification
| Command | Required by |
|---------|-------------|
| npm run type-check | typescript-rules |
| npm run test | node-test |

- **Task-specific Completion additions:** none beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## 6. Test Scenario Coverage
- Scenario "AgentEngine объявляет контракт" → contract-level (type-check)
- Scenario "RunOptions/RunResult/EngineStatus форма" → contract-level (type-check)
- Scenario "AgentRunError + ErrorCode" → contract-level (type-check)
- Scenario "run() без pre-flight detect" → `services/agent-run/core/__tests__/run.test.ts` :: `runs default engine without calling detect`
- Scenario "пустой реестр → AGENT_NOT_INSTALLED" → `services/agent-run/core/__tests__/run.test.ts` :: `throws AGENT_NOT_INSTALLED on empty registry`
- Scenario "resolve(unknownId)" → `services/agent-run/core/__tests__/registry.test.ts` :: `throws AGENT_NOT_INSTALLED for unregistered engine`
- Scenario "run() прокидывает timeout" → `services/agent-run/core/__tests__/run.test.ts` :: `defaults timeout to 120000 and passes it to engine`
- Scenario "пустой task → LAUNCH_FAILED" → `services/agent-run/core/__tests__/run.test.ts` :: `throws LAUNCH_FAILED on empty task without dispatching`
- Scenario "listEngines кэширует detect" → `services/agent-run/core/__tests__/registry.test.ts` :: `caches detect across listEngines calls`
- Scenario "listEngines мягкая деградация" → `services/agent-run/core/__tests__/registry.test.ts` :: `degrades gracefully when detect throws`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## 7. Execution Log
*(Round = one execute-then-audit attempt. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)*

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
