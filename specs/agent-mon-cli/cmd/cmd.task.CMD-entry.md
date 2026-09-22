# Task: CMD-entry — CLI entry + gennady.ts integration

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** CMD-entry
- **Status:** [ ] TODO
- **Purpose:** Реализовать CLI entry point (run, createProviders) и добавить switch case в gennady.ts
- **Scope:** agent-mon-cli
- **Module:** cmd
- **Dependencies:** UI-dashui, AMC-tui-deps
- **Reopens:** 0
- **Spec References:**
  - Contract: [`run`](./cmd.spec.md#run)
  - Contract: [`createProviders`](./cmd.spec.md#createproviders)
  - Scope: [`agent-mon-cli` §3 Golden DX](../agent-mon-cli.spec.md#3-approved-golden-dx-example)
- **Implementation References:** CLI: [`gennady.ts`](../../../cli/gennady.ts)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Реализовать run() + createProviders + index.ts + gennady.ts integration + help
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/agent-mon/cmd/run.ts`
  - `cli/cmd/agent-mon/cmd/create-providers.ts`
  - `cli/cmd/agent-mon/cmd/index.ts`
  - `cli/gennady.ts` (add switch case + help)
  - `cli/cmd/help/help.cmd.ts` (add help text)
- **Inputs:** none
- **Exit:** typecheck pass; `gennady agent-mon --once` рендерит snapshot; флаги --interval --provider --view парсятся

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Интеграционные тесты run() с мок-монитором
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/agent-mon/cmd/__tests__/run.test.ts`
  - `cli/cmd/agent-mon/cmd/__tests__/create-providers.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD сценарии покрыты; tests pass

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** CLI entry point + gennady интеграция

**Scenario:** --once выводит таблицу и выходит [`integration`]

- **Given** мок-монитор с 1 сессией
- **When** run(['--once'])
- **Then** stdout содержит session title
- **And** exit code = 0

**Scenario:** неизвестный флаг → usage [`integration`]

- **Given** флаг --unknown
- **When** run(['--unknown'])
- **Then** exit code = 1
- **And** stderr содержит usage

**Scenario:** createProviders регистрирует claude и opencode по умолчанию [`unit`]

- **Given** вызов без фильтра
- **When** createProviders()
- **Then** возвращает AgentMonitor с 2 провайдерами

**Scenario:** --provider claude → только Claude [`unit`]

- **Given** createProviders({ opencode: false })
- **When** scanAll()
- **Then** только Claude-сессии

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command            | Required by      | Role  |
| ------------------ | ---------------- | ----- |
| npm run type-check | typescript-rules | extra |
| npm run test       | node-test        | probe |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario "--once" → `cli/cmd/agent-mon/cmd/__tests__/run.test.ts` :: `prints table and exits with --once`
- Scenario "unknown flag" → `cli/cmd/agent-mon/cmd/__tests__/run.test.ts` :: `exits 1 on unknown flag`
- Scenario "createProviders all" → `cli/cmd/agent-mon/cmd/__tests__/create-providers.test.ts` :: `registers claude and opencode by default`
- Scenario "createProviders filter" → `cli/cmd/agent-mon/cmd/__tests__/create-providers.test.ts` :: `registers only claude with filter`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-05-22T10:15:50Z` intro `createProviders` ← фабрика монитора — регистрирует Claude и OpenCode провайдеры
- [x] `2026-05-22T10:15:50Z` intro `run` ← CLI entry point — парсинг флагов, создание монитора, рендер ink-приложения
- [x] `2026-05-22T10:15:50Z` intro `CreateProvidersOpts` ← опции фильтрации провайдеров
- [x] `2026-05-22T10:15:50Z` intro `CliFlags` ← типизированные CLI-флаги команды
- [x] `2026-05-22T10:15:50Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-22T10:15:50Z` DONE
      **Handoff →** artifacts: [cli/cmd/agent-mon/cmd/run.ts, cli/cmd/agent-mon/cmd/create-providers.ts, cli/cmd/agent-mon/cmd/index.ts, cli/gennady.ts, cli/cmd/help/help.cmd.ts]; decisions: [module-system=esm, import-paths=relative-with-.ts-extensions, logger=#logger, once-mode=static-state-manager, provider-filter=CreateProvidersOpts]; open: []

#### P2

- [x] `2026-05-22T10:37:49Z` ✅ RESOLVED: `package.json` test script обновлён — `--experimental-test-module-mocks` добавлен (оператором)
- [x] `2026-05-22T10:37:49Z` ver `npm run test` → fail exit=1
  - `create-providers.test.ts` — pass
  - `run.test.ts` — fail: `ERR_UNKNOWN_FILE_EXTENSION` для `.tsx` файлов (app.tsx импортируется транзитивно из run.ts)
- [x] `2026-05-22T10:42:43Z` ✅ RESOLVED: `package.json` test script обновлён — `--import tsx` добавлен (оператором)
- [x] `2026-05-22T10:42:43Z` ver `npm run test` → pass exit=0
- [x] `2026-05-22T10:42:43Z` DONE
      **Handoff →** artifacts: [cli/cmd/agent-mon/cmd/__tests__/run.test.ts, cli/cmd/agent-mon/cmd/__tests__/create-providers.test.ts]; decisions: [test-runner=node-test, mock-strategy=mock.module+mock.method, tsx-loader=required-for-tsx-imports]; open: []

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
