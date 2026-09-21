# Task: INP-rel-dep — Установить release-it как devDependency

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** INP-rel-dep
- **Status:** [ ] TODO
- **Purpose:** Установить `release-it` как dev-зависимость для автоматизации npm-публикации.
- **Scope:** infra-npm-publish
- **Module:** N/A
- **Dependencies:** None
- **Reopens:** 0
- **Spec References:**
  - Bootstrap: [Bootstrap Requirements row 1](./infra-npm-publish.spec.md)
  - Decision: [D-001 — выбор release-it](./infra-npm-publish.spec.md)
- **Runtime Backing:** `not-implemented`
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

- **Objective:** добавить `release-it` в `devDependencies` и выполнить `npm install`
- **Rules:**
  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `package.json`
- **Inputs:** none
- **Exit:** `npx release-it --version` завершается без ошибок

<!--/SECTION:PHASE_P1-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** Установка release-it

**Scenario:** Установка release-it как dev-зависимости [`contract`]

- **Given** репозиторий с `package.json`
- **When** выполняем `npm i -D release-it`
- **Then** `release-it` появляется в `devDependencies`
- **And** `npx release-it --version` возвращает версию и завершается с exit 0

**Scenario:** Ошибка: release-it отсутствует [`contract`]

- **Given** package.json без release-it
- **When** package contract проверяет devDependencies
- **Then** manifest отклоняется

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command             | Required by              | Role  |
| ------------------- | ------------------------ | ----- |
| `npm ls release-it` | bootstrap-verify-package | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- release-it закреплён как dev-зависимость → `publish-contract.test.ts` :: `release-it is pinned as a development dependency`
- отсутствующий release-it → `publish-contract.test.ts` :: `missing release-it dependency is rejected by the package contract`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-22, initial

#### P1

- [x] `2026-05-22T07:42:15Z` intro release-it ← bootstrap npm-publish automation tool
- [x] `2026-05-22T07:42:15Z` ver `npm ls release-it` → pass exit=0
- [x] `2026-05-22T07:42:15Z` DONE
      **Handoff →** artifacts: [package.json (devDependencies: release-it@20.0.1)]; decisions: [release-it-pinned=exact, release-it-version=20.0.1]; open: []

#### Round close

- [x] DONE

<!--/SECTION:EXECUTION_LOG-->
