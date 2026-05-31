# Task: TSK-59 — Реализовать agents-rules

## 1. Meta

- **Task-ID:** TSK-59
- **Status:** [ ] TODO
- **Purpose:** Реализовать команду `gennady agents-rules`: проверка `node_modules/gennady` → чтение `cli/cmd/orient/README.md` → stdout
- **Scope:** cli
- **Module:** agents-rules
- **Dependencies:** None
- **Spec References:**
  - Module spec: [agents-rules.spec.md](../../../specs/cli/agents-rules/agents-rules.spec.md)
  - Parent spec §4.1.7: [Functional Requirements](../../../specs/cli/cli.spec.md) (FR-AR-01…06)
  - Parent spec §5.10: [Architecture](../../../specs/cli/cli.spec.md)
  - Content spec: [Parent §3.7 Golden DX](../../../specs/cli/cli.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Objective:** Создать `AgentsRulesCommand` + модульный barrel + README.md + регистрация в CLI
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/agents-rules/index.ts`
  - `cli/cmd/agents-rules/agents-rules.cmd.ts`
  - `cli/cmd/orient/README.md`
  - `cli/gennady.ts` (modify: + case 'agents-rules')
  - `cli/AGENTS.md` (modify: + строка в таблицу)
  - `cli/cmd/help/help.cmd.ts` (modify: + строка в вывод)
- **Inputs:** none
- **Exit:** `gennady agents-rules` выводит README.md на stdout (при установленном пакете); typecheck pass

### P2 — test

- **Objective:** Интеграционный тест команды: mock fs, проверка всех error-путей + happy path
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии покрыты; tests pass

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References → module spec §4.2 DbC.

### Feature: Команда agents-rules

**Scenario:** Пакет не установлен [`integration`]

- **Given** `<cwd>/node_modules/gennady/` не существует
- **When** агент вызывает `gennady agents-rules`
- **Then** stderr содержит `gennady package not found. Install it locally: npm i -D gennady`
- **And** exit code = 1

**Scenario:** Пакет установлен, README.md существует [`integration`]

- **Given** `<cwd>/node_modules/gennady/` существует
- **And** `cli/cmd/orient/README.md` существует в резолвнутом пакете
- **When** агент вызывает `gennady agents-rules`
- **Then** stdout содержит содержимое `README.md`
- **And** exit code = 0

**Scenario:** Пакет установлен, README.md отсутствует [`integration`]

- **Given** `<cwd>/node_modules/gennady/` существует
- **And** `cli/cmd/orient/README.md` не существует в резолвнутом пакете
- **When** агент вызывает `gennady agents-rules`
- **Then** stderr содержит `README.md not found at <path>`
- **And** exit code = 1

**Scenario:** Ошибка чтения README.md (EACCES) [`integration`]

- **Given** `<cwd>/node_modules/gennady/` существует
- **And** `cli/cmd/orient/README.md` существует но недоступен для чтения (EACCES)
- **When** агент вызывает `gennady agents-rules`
- **Then** stderr содержит `Cannot read README.md:`
- **And** exit code = 1

## 5. Verification

| Command                                                                                                | Required by      |
| ------------------------------------------------------------------------------------------------------ | ---------------- |
| `tsc --noEmit -p tsconfig.json`                                                                        | typescript-rules |
| `node --test --experimental-test-module-mocks cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts` | node-test        |

## 6. Test Scenario Coverage

- Scenario "Пакет не установлен" → `cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts` :: `package not found → exit 1 with message`
- Scenario "Пакет установлен, README.md существует" → `cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts` :: `package found + README exists → stdout content, exit 0`
- Scenario "Пакет установлен, README.md отсутствует" → `cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts` :: `package found + README missing → exit 1 with message`
- Scenario "Ошибка чтения README.md (EACCES)" → `cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts` :: `package found + README EACCES → exit 1 with message`

## 7. Execution Log

### Round 1 — YYYY-MM-DD, initial

#### P1

- [ ] `<ts>` ver `tsc --noEmit -p tsconfig.json` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [index.ts, agents-rules.cmd.ts, README.md, gennady.ts, AGENTS.md, help.cmd.ts]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `node --test --experimental-test-module-mocks cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [agents-rules.cmd.test.ts]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
