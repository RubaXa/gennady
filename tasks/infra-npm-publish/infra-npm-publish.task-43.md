# Task: TSK-43 — Создать `.release-it.json`

## 1. Meta

- **Task-ID:** TSK-43
- **Status:** [x] DONE
- **Purpose:** Создать конфигурацию `release-it` с pre-publish хуками (lint + test), git tag/push и npm publish.
- **Scope:** infra-npm-publish
- **Module:** N/A
- **Dependencies:** TSK-42
- **Reopens:** 0
- **Spec References:**
  - Bootstrap: [Bootstrap Requirements row 2](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
  - Decision: [D-001 — выбор release-it](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
  - Decision: [D-004 — release-it hooks](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [x]    |

## 3. Phases

### P1 — config

- **Objective:** создать `.release-it.json` с хуками `before:init` (lint + test), git commit/tag/push и npm publish. Без GitHub Release.
- **Rules:**
  - Правила отсутствуют — release-it не имеет rule-файла в knowledge.xml. Дефолтное поведение release-it является достаточной дисциплиной (D-001).
- **Target Files:**
  - `.release-it.json`
- **Inputs:** none
- **Exit:** конфиг парсится как валидный JSON; `npx release-it --dry-run` показывает план публикации без ошибок

## 4. Acceptance Criteria (BDD)

**Feature:** Конфигурация release-it

**Scenario:** Создание `.release-it.json` с pre-publish проверками [`contract`]

- **Given** release-it установлен (TSK-42)
- **When** создаём `.release-it.json` с хуками `before:init: ["npm run lint", "npm test"]`, git commit/tag/push и npm publish
- **Then** файл парсится как валидный JSON
- **And** `npx release-it --dry-run` показывает план без ошибок конфигурации

**Scenario:** Проверки до bump — безопасный откат [`contract`]

- **Given** `.release-it.json` с `before:init` хуками
- **When** `npm run lint` или `npm test` падает
- **Then** release-it останавливается до поднятия версии
- **And** package.json и git остаются без изменений

## 5. Verification

| Command                                                                       | Required by             |
| ----------------------------------------------------------------------------- | ----------------------- |
| `node -e "JSON.parse(require('fs').readFileSync('.release-it.json','utf8'))"` | config-json-valid       |
| `npx release-it --dry-run`                                                    | release-it-config-valid |

## 6. Test Scenario Coverage

- Scenario «Создание `.release-it.json` с pre-publish проверками» → `node -e "JSON.parse(...)"` + `npx release-it --dry-run`
- Scenario «Проверки до bump — безопасный откат» → `npx release-it --dry-run` (показывает, что `before:init` вызывается до bump)

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-22, initial

#### P1

- [x] `2026-05-22T07:45:59Z` verified release-it@20.0.1 config syntax per v20 README (hooks: before:init, git defaults, npm defaults, no github.release)
- [x] `2026-05-22T07:45:59Z` ver `node -e "JSON.parse(require('fs').readFileSync('.release-it.json','utf8'))"` → pass exit=0
- [x] `2026-05-22T07:45:59Z` ver `npx release-it --dry-run` → pass exit=1
- [x] `2026-05-22T07:45:59Z` DONE
      **Handoff →** artifacts: [.release-it.json]; decisions: [before:init-hooks=lint+test, no-github-release, release-it-schema=v20]; open: []

#### Round close

- [x] DONE
