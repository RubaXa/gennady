# Task: TSK-44 — Добавить `"release"` script в `package.json`

## 1. Meta

- **Task-ID:** TSK-44
- **Status:** [x] DONE
- **Purpose:** Добавить `"release": "release-it"` в scripts `package.json`, чтобы релиз запускался командой `npm run release`.
- **Scope:** infra-npm-publish
- **Module:** N/A
- **Dependencies:** TSK-42
- **Reopens:** 0
- **Spec References:**
  - Bootstrap: [Bootstrap Requirements row 3](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
  - Workflow: [Developer Workflow Example](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [x]    |

## 3. Phases

### P1 — config

- **Objective:** добавить `"release": "release-it"` в секцию `scripts` файла `package.json`
- **Rules:**
  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `package.json`
- **Inputs:** none
- **Exit:** `npm run release` распознаётся как существующий скрипт

## 4. Acceptance Criteria (BDD)

**Feature:** npm-скрипт для релиза

**Scenario:** Добавление `"release"` скрипта [`contract`]

- **Given** release-it установлен (TSK-42) и сконфигурирован (TSK-43)
- **When** добавляем `"release": "release-it"` в `scripts` файла `package.json`
- **Then** `npm run release` запускает release-it (интерактивный выбор версии)

**Scenario:** Скрипт `release` не ломает существующие скрипты [`contract`]

- **Given** `package.json` с существующими скриптами (`test`, `lint`, `build`)
- **When** добавляем `"release"` скрипт
- **Then** `npm run lint` и `npm test` продолжают работать как раньше
- **And** `npm run release` не пересекается с `prepublishOnly` и `postpublish`

## 5. Verification

| Command                                                                                                                   | Required by       |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `node -e "const p=require('./package.json'); console.assert(p.scripts.release==='release-it','release script mismatch')"` | npm-script-exists |

## 6. Test Scenario Coverage

- Scenario «Добавление `"release"` скрипта» → `node -e "...assert(p.scripts.release)..."` → exit 0
- Scenario «Скрипт `release` не ломает существующие скрипты» → `npm run lint` exit 0, `npm test` exit 0

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-22, initial

#### P1

- [x] 2026-05-22T07:50:41Z verified release-it@20.0.1 CLI: release-it → bin/release-it.js
- [x] 2026-05-22T07:50:41Z ver `node -e "const p=require('./package.json'); console.assert(p.scripts.release==='release-it','release script mismatch')"` → pass exit=0
- [x] 2026-05-22T07:50:41Z DONE
      **Handoff →** artifacts: [package.json (scripts.release)]; decisions: [release-script=release-it, release-it-version=20.0.1]; open: []

#### Round close

- [x] DONE
