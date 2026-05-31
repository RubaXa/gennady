# Task: TSK-59 — Реализовать agents-rules

## 1. Meta

- **Task-ID:** TSK-59
- **Status:** [x] DONE
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
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

### Round 1 — 2026-05-31, initial

#### P1

- [x] `2026-05-31T08:46:10Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-31T08:46:11Z` ver `npx tsx cli/gennady.ts lint cli/cmd/agents-rules/index.ts cli/cmd/agents-rules/agents-rules.cmd.ts cli/cmd/orient/README.md cli/gennady.ts cli/AGENTS.md cli/cmd/help/help.cmd.ts` → pass exit=0
- [x] `2026-05-31T08:46:18Z` ver `npm run test` → pass exit=0
- [x] `2026-05-31T08:46:21Z` discovery `npm run format:check` gate failed with pre-existing issues in 31 files outside phase scope (ai/skills/, sync-skills/, orient/), all 6 target files pass format check
- [x] `2026-05-31T08:47:05Z` ver `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → pass exit=0
- [x] `2026-05-31T08:47:05Z` DONE
      **Handoff →** artifacts: [cli/cmd/agents-rules/index.ts, cli/cmd/agents-rules/agents-rules.cmd.ts, cli/cmd/orient/README.md, cli/gennady.ts, cli/AGENTS.md, cli/cmd/help/help.cmd.ts]; decisions: [pkg-resolve=import.meta.resolve+walk-up-to-package-root, entry-pattern=index-calls-run-cmd-exports-it, no-logger=zero-runtime-deps-as-specified]; open: []

#### P2

- [x] `2026-05-31T09:03:17Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-31T09:03:17Z` ver `npm run lint:contracts` (1 file) → pass (gennady DBC lint on target)
- [x] `2026-05-31T09:03:17Z` ver `npm run test` → pass exit=0
- [x] `2026-05-31T09:03:17Z` discovery `npm run format:check` gate failed with pre-existing issues in 31 files outside phase scope, target file passes format check
- [x] `2026-05-31T09:03:17Z` ver `tsc --noEmit -p tsconfig.json` → pass exit=0
- [x] `2026-05-31T09:03:17Z` ver `node --test --experimental-test-module-mocks cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts` → pass exit=0
- [x] `2026-05-31T09:03:17Z` DONE
      **Handoff →** artifacts: [cli/cmd/agents-rules/__tests__/agents-rules.cmd.test.ts]; decisions: [test-runner=node:test, test-kind=integration, mock-strategy=mock.module+process.exit-throw, mock-target=node:fs-existsSync+readFileSync, import.meta.resolve-requires-nm-symlink]; open: []

#### Round close

- [x] `2026-05-31T09:02:00Z` DONE
