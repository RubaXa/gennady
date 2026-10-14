# Task: AMC-tui-deps — Установка ink + react + @types/react

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** AMC-tui-deps
- **Status:** [ ] TODO
- **Purpose:** Установить зависимости для TUI: ink@^7, react@^19, @types/react
- **Scope:** agent-mon-cli
- **Module:** N/A (bootstrap)
- **Dependencies:** None
- **Reopens:** 0
- **Spec References:**
  - Scope: [`agent-mon-cli` §8 Bootstrap](./agent-mon-cli.spec.md#8-bootstrap-requirements)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind      | Deps | Status |
| --- | --------- | ---- | ------ |
| P1  | bootstrap | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — bootstrap

- **Objective:** `npm install ink react` + `npm install -D @types/react`
- **Rules:**
  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `package.json`
  - `package-lock.json`
- **Inputs:** none
- **Exit:** `npm ls ink react` → оба пакета присутствуют; `npx tsc --noEmit` проходит

<!--/SECTION:PHASE_P1-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Установка TUI-зависимостей

**Scenario:** ink и react установлены [`contract`]

- **Given** package.json без ink/react
- **When** `npm install ink react`
- **Then** `npm ls ink` → ok, `npm ls react` → ok
- **And** `npx tsc --noEmit` → exit 0

**Scenario:** @types/react установлен [`contract`]

- **Given** package.json без @types/react
- **When** `npm install -D @types/react`
- **Then** `npm ls @types/react` → ok

**Scenario:** Ошибка: обязательная TUI-зависимость отсутствует [`contract`]

- **Given** package.json без `ink`
- **When** package contract проверяет TUI dependencies
- **Then** проверка отклоняет неполный manifest

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command          | Required by | Role  |
| ---------------- | ----------- | ----- |
| npm ls ink react | bootstrap   | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- ink и react закреплены в runtime dependencies → `public-contract.test.ts` :: `Ink and React runtime dependencies are installed by contract`
- @types/react закреплён в dev dependencies → `public-contract.test.ts` :: `React type dependency is installed by contract`
- отсутствующая TUI-зависимость → `public-contract.test.ts` :: `missing TUI dependency is rejected by the package contract`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] 2026-05-22T09:30:01Z ver npm ls ink react → pass exit=0
- [x] 2026-05-22T09:30:01Z DONE
      **Handoff →** artifacts: [package.json, package-lock.json]; decisions: [ink=^7, react=^19, @types/react=^19 (dev)]; open: []

#### Round close

- [ ] `<ts>` DONE

#### Round close

- [x] `2026-05-22T10:45:57Z` DONE

<!--/SECTION:EXECUTION_LOG-->
