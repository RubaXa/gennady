# Task: TSK-44 — Настроить `package.json` для публикации

## 1. Meta

- **Task-ID:** TSK-44
- **Status:** [x] DONE
- **Purpose:** (1) Добавить `"release": "release-it"` в scripts `package.json`. (2) Добавить `"ai/**/*"` в `files` чтобы `ai/` попадала в npm-пакет.
- **Scope:** infra-npm-publish
- **Module:** N/A
- **Dependencies:** TSK-42
- **Reopens:** 1
- **Spec References:**
  - Bootstrap: [Bootstrap Requirements row 3](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
  - Bootstrap: [Bootstrap Requirements row 5](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
  - Decision: [D-005 — Публикация ai/](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
  - Workflow: [Developer Workflow Example](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [ ]    |

## 3. Phases

### P1 — config (expanded)

- **Objective:** (1) добавить `"release": "release-it"` в `scripts`; (2) добавить `"ai/**/*"` в `files`
- **Rules:**
  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `package.json`
- **Inputs:** none
- **Exit:** `npm run release` распознаётся как существующий скрипт; `node -e "..."` подтверждает `files` включает `ai/**/*`

## 4. Acceptance Criteria (BDD)

**Feature:** npm-скрипт для релиза и публикация ai/

**Scenario:** Добавление `"release"` скрипта [`contract`]

- **Given** release-it установлен (TSK-42) и сконфигурирован (TSK-43)
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

## 5. Verification

| Command                                                                                                                   | Required by       |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `node -e "const p=require('./package.json'); console.assert(p.scripts.release==='release-it','release script mismatch')"` | npm-script-exists |
| `node -e "const p=require('./package.json'); console.assert(p.files.includes('ai/**/*'),'ai/**/* missing from files')"`   | files-includes-ai |

## 6. Test Scenario Coverage

- Scenario «Добавление `"release"` скрипта» → `node -e "...assert(p.scripts.release)..."` → exit 0
- Scenario «Скрипт `release` не ломает существующие скрипты» → `npm run lint` exit 0, `npm test` exit 0
- Scenario «`ai/` включена в публикацию» → `node -e "...assert(p.files.includes('ai/**/*'))..."` → exit 0

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
