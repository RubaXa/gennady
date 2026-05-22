# Task: TSK-42 — Установить release-it как devDependency

## 1. Meta

- **Task-ID:** TSK-42
- **Status:** [x] DONE
- **Purpose:** Установить `release-it` как dev-зависимость для автоматизации npm-публикации.
- **Scope:** infra-npm-publish
- **Module:** N/A
- **Dependencies:** None
- **Reopens:** 0
- **Spec References:**
  - Bootstrap: [Bootstrap Requirements row 1](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
  - Decision: [D-001 — выбор release-it](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind      | Deps | Status |
| --- | --------- | ---- | ------ |
| P1  | bootstrap | —    | [x]    |

## 3. Phases

### P1 — bootstrap

- **Objective:** добавить `release-it` в `devDependencies` и выполнить `npm install`
- **Rules:**
  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `package.json`
- **Inputs:** none
- **Exit:** `npx release-it --version` завершается без ошибок

## 4. Acceptance Criteria (BDD)

**Feature:** Установка release-it

**Scenario:** Установка release-it как dev-зависимости [`contract`]

- **Given** репозиторий с `package.json`
- **When** выполняем `npm i -D release-it`
- **Then** `release-it` появляется в `devDependencies`
- **And** `npx release-it --version` возвращает версию и завершается с exit 0

## 5. Verification

| Command             | Required by              |
| ------------------- | ------------------------ |
| `npm ls release-it` | bootstrap-verify-package |

## 6. Test Scenario Coverage

- Scenario «Установка release-it как dev-зависимости» → `npm ls release-it` → exit 0

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
