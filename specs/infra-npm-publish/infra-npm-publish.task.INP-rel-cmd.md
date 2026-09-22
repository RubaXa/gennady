# Task: INP-rel-cmd — Настроить `package.json` для публикации

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** INP-rel-cmd
- **Status:** [ ] TODO
- **Purpose:** (1) Добавить `"release": "release-it"` в scripts `package.json`. (2) Добавить `"ai/**/*"` в `files` чтобы `ai/` попадала в npm-пакет.
- **Scope:** infra-npm-publish
- **Module:** N/A
- **Dependencies:** INP-rel-dep
- **Reopens:** 1
- **Spec References:**
  - Bootstrap: [Bootstrap Requirements row 3](./infra-npm-publish.spec.md)
  - Bootstrap: [Bootstrap Requirements row 5](./infra-npm-publish.spec.md)
  - Decision: [D-005 — Публикация ai/](./infra-npm-publish.spec.md)
  - Workflow: [Developer Workflow Example](./infra-npm-publish.spec.md)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — config (expanded)

- **Objective:** (1) добавить `"release": "release-it"` в `scripts`; (2) добавить `"ai/**/*"` в `files`
- **Rules:**
  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `package.json`
- **Inputs:** none
- **Exit:** `npm run release` распознаётся как существующий скрипт; `node -e "..."` подтверждает `files` включает `ai/**/*`

<!--/SECTION:PHASE_P1-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** npm-скрипт для релиза и публикация ai/

**Scenario:** Добавление `"release"` скрипта [`contract`]

- **Given** release-it установлен (INP-rel-dep) и сконфигурирован (INP-rel-conf)
- **When** добавляем `"release": "release-it"` в `scripts` файла `package.json`
- **Then** `npm run release` запускает release-it (интерактивный выбор версии)

**Scenario:** Скрипт `release` не ломает существующие скрипты [`contract`]

- **Given** `package.json` с существующими скриптами (`test`, `lint`, `build`)
- **When** добавляем `"release"` скрипт
- **Then** `npm run lint` и `npm test` продолжают работать как раньше

**Scenario:** `ai/` включена в публикацию [`contract`]

- **Given** `prepare-publish-artifacts.ts` копирует `ai/ → dist/ai/`
- **When** добавляем `"ai/**/*"` в `"files"` массива `package.json`
- **Then** `npm pack --dry-run` показывает `ai/` директорию в списке файлов пакета

**Scenario:** Ошибка: release script отсутствует [`contract`]

- **Given** package scripts без `release`
- **When** package contract проверяет release command
- **Then** manifest отклоняется

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 5. Verification

| Command                                                                                                                   | Required by       | Role  |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----- |
| `node -e "const p=require('./package.json'); console.assert(p.scripts.release==='release-it','release script mismatch')"` | npm-script-exists | extra |
| `node -e "const p=require('./package.json'); console.assert(p.files.includes('ai/**/*'),'ai/**/* missing from files')"`   | files-includes-ai | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- release script вызывает release-it → `publish-contract.test.ts` :: `release script invokes release-it`
- ai включена в публикацию → `publish-contract.test.ts` :: `package publication includes ai artifacts`
- отсутствующий release script → `publish-contract.test.ts` :: `missing release script is rejected by the package contract`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 2 - 2026-05-27, refine (ai/ publication)

#### P1

- [x] 2026-05-27T18:50:00Z added ai/\*_/_ to package.json#files
- [x] 2026-05-27T18:50:00Z ver node -e assert -> pass exit=0
- [x] 2026-05-27T18:50:00Z DONE
      **Handoff ->** artifacts: [package.json (files += ai/**/*)]; decisions: [ai-in-files]; open: []

#### Round close

- [x] DONE

<!--/SECTION:EXECUTION_LOG-->
