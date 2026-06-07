# Task: TSK-65 — gennady run command

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-65
- **Status:** [x] DONE
- **Purpose:** Команда `gennady run` — тонкая обёртка над `@services/agent-run`: парсит флаги (задание, `--dir`×N, `--model`, `--engine`, `--timeout`), зовёт `run()`, печатает текст в stdout или `✗ <message> [<code>]` + hint в stderr.
- **Scope:** cli
- **Module:** run
- **Dependencies:** TSK-64
- **Spec References:**
  - DX: [cli §3.8 run DX](../../../specs/cli/cli.spec.md#38-run-dx)
  - FR: [cli §4.1.9 run Functional Requirements](../../../specs/cli/cli.spec.md#419-run-functional-requirements)
  - Arch: [cli §5.13 run](../../../specs/cli/cli.spec.md#513-run)
  - Library: [agent-run §4 Public API](../../../specs/agent-run/agent-run.spec.md#4-public-api-surface)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
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

- **Objective:** реализовать команду `run` как тонкую обёртку + регистрация в CLI.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/run/run.cmd.ts`
  - `cli/cmd/run/index.ts`
  - `cli/cmd/run/help.ts`
  - `cli/gennady.ts`
  - `cli/AGENTS.md`
  - `cli/cmd/help/help.cmd.ts`
- **Inputs:** none (потребляет `@services/agent-run` из TSK-64)
- **Exit:** typecheck pass; `gennady run "<task>"` зовёт `run()`, печатает `RunResult.text` (exit 0); пустой/отсутствующий task → exit 1 без вызова движка; `AgentRunError` → stderr `✗ <e.hint>   [<e.code>]` (печатается hint, НЕ message; конструктор `new AgentRunError(code, hint)`), exit 1; `--dir`×N → `dirs[]` (если `--dir` не задан — `dirs` не передаётся, ядро дефолтит на cwd); `--model`/`--engine`/`--timeout` проброшены; CLI не задаёт дефолт модели; парсинг через `node:util parseArgs`; `case 'run'` в `cli/gennady.ts`; строки в `AGENTS.md` и help.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** integration-тесты CLI-обвязки с мокнутым `@services/agent-run`.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/run/__tests__/run.cmd.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD section 4 покрыты; tests pass; `run()` мокается (module mock), реального opencode не требуется.
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** CLI-команда `gennady run` поверх agent-run

**Scenario:** happy path — текст в stdout, exit 0 [`integration`]

- **Given** `run()` замокан → `{ text: '# ответ', engine: 'opencode' }`
- **When** `gennady run "опиши"`
- **Then** stdout содержит `# ответ`; exit 0
- **And** `run()` вызван с `{ task: 'опиши' }` — без `dirs`/`model`/`engine` (дефолты на стороне ядра/движка)

**Scenario:** флаги парсятся в RunOptions [`unit`]

- **Given** `run()` замокан
- **When** `gennady run "t" --dir a --dir b --model llm-proxy/glm-4.7 --engine opencode --timeout 5000`
- **Then** `run()` получил `dirs: ['a','b']`, `model: 'llm-proxy/glm-4.7'`, `engine: 'opencode'`, `timeout: 5000`

**Scenario:** пустое задание → exit 1 без вызова движка [`integration`]

- **Given** `run()` замокан со шпионом
- **When** `gennady run` (без задания) или `gennady run ""`
- **Then** exit 1; stderr с ошибкой использования; `run()` не вызван

**Scenario:** `AgentRunError` → stderr (hint + code), exit 1 [`integration`]

- **Given** `run()` бросает `new AgentRunError('VERSION_MISMATCH', 'CLI opencode отстал — попроси оператора brew upgrade opencode')`
- **When** `gennady run "t"`
- **Then** stderr содержит `✗`, текст `e.hint` и `[VERSION_MISMATCH]`; exit 1
- **And** `e.message` (`[AgentRunError] …`) НЕ печатается

**Scenario:** `MODEL_UNAVAILABLE` → печатает hint со списком [`integration`]

- **Given** `run()` бросает `new AgentRunError('MODEL_UNAVAILABLE', 'Модель «нет/такой» недоступна. Доступные: a/b, c/d')`
- **When** `gennady run "t" --model нет/такой`
- **Then** stderr содержит `[MODEL_UNAVAILABLE]` и список моделей из hint; exit 1

**Scenario:** `--help` печатает справку [`unit`]
- **Given** команда `gennady run --help` (или `-h`)
- **When** per-command-help в `gennady.ts` грузит `cli/cmd/run/help.ts` → `printHelp()`
- **Then** выводятся usage, флаги (`--dir`/`--model`/`--engine`/`--timeout`), readonly и примеры; exit 0; движок не вызывается
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command            | Required by      |
| ------------------ | ---------------- |
| npm run type-check | typescript-rules |
| npm run test       | node-test        |

- **Task-specific Completion additions:** none beyond project baseline (тесты мокают библиотеку — opencode не нужен).
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario "happy path stdout exit 0" → `cli/cmd/run/__tests__/run.cmd.test.ts` :: `prints text and exits 0`
- Scenario "флаги в RunOptions (--dir/--model/--engine/--timeout)" → `cli/cmd/run/__tests__/run.cmd.test.ts` :: `parses flags into RunOptions`
- Scenario "пустое задание exit 1" → `cli/cmd/run/__tests__/run.cmd.test.ts` :: `errors on empty task without calling run`
- Scenario "AgentRunError stderr exit 1" → `cli/cmd/run/__tests__/run.cmd.test.ts` :: `prints AgentRunError message+code+hint and exits 1`
- Scenario "MODEL_UNAVAILABLE hint" → `cli/cmd/run/__tests__/run.cmd.test.ts` :: `prints model list on MODEL_UNAVAILABLE`
- Scenario "--help печатает справку" → `cli/cmd/run/__tests__/run.cmd.test.ts` :: `printHelp prints usage, flags and examples`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-06-06, initial

#### P1

- [x] `2026-06-06T16:41:00Z` intro `runCommand` ← точка входа CLI: parseArgs → run() → stdout/stderr
- [x] `2026-06-06T16:41:00Z` decision dirs-omitted-when-no-flag ← `--dir` не задан → `dirs` не передаётся, дефолт cwd у ядра
- [x] `2026-06-06T16:41:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-06T16:41:00Z` DONE
      **Handoff →** artifacts: [cli/cmd/run/run.cmd.ts, cli/cmd/run/index.ts, cli/gennady.ts, cli/AGENTS.md, cli/cmd/help/help.cmd.ts]; decisions: [parseArgs-node:util, thin-wrapper, hint+code-stderr, no-cli-model-default]; open: []

#### P2

- [x] `2026-06-06T18:22:42Z` intro `run.cmd.test.ts` ← тесты CLI-обёртки run с мокнутым @services/agent-run через mock.module
- [x] `2026-06-06T18:24:15Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-06T18:24:15Z` ver `node --import tsx --test --experimental-test-module-mocks cli/cmd/run/__tests__/run.cmd.test.ts` → pass exit=0
- [x] `2026-06-06T18:24:15Z` DONE
      **Handoff →** artifacts: [cli/cmd/run/__tests__/run.cmd.test.ts]; decisions: [mock-strategy=mock.module(services/agent-run/index.ts), process.exit=throws-stub, streams=write-override, 5-BDD-covered=true]; open: []

#### Round close

- [x] `2026-06-06T18:25:06Z` sync cli+root
- [x] `2026-06-06T18:25:06Z` DONE
<!--/SECTION:EXECUTION_LOG-->
