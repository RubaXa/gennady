# Task: TSK-45 — Копировать `ai/` в `dist/ai/` перед публикацией

## 1. Meta

- **Task-ID:** TSK-45
- **Status:** [x] DONE
- **Purpose:** Добавить копирование `ai/ → dist/ai/` в `scripts/prepare-publish-artifacts.ts`, чтобы вся директория `ai/` попадала в `dist/` и включалась в npm-пакет (уже покрывается `"files": ["dist/**/*"]`).
- **Scope:** infra-npm-publish
- **Module:** N/A
- **Dependencies:** TSK-44
- **Reopens:** 0
- **Spec References:**
  - Bootstrap: [Bootstrap Requirements row 6](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
  - Decision: [D-005 — Публикация ai/](../../specs/infra-npm-publish/infra-npm-publish.spec.md)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [x]    |

## 3. Phases

### P1 — config

- **Objective:** добавить `{ source: 'ai', target: 'dist/ai' }` в массив `copyPairs` в `scripts/prepare-publish-artifacts.ts`
- **Rules:**
  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)
- **Target Files:**
  - `scripts/prepare-publish-artifacts.ts`
- **Inputs:** none
- **Exit:** `npm run build:publish` создаёт `dist/ai/` с содержимым `ai/`

## 4. Acceptance Criteria (BDD)

**Feature:** `ai/` копируется в `dist/` при подготовке публикации

**Scenario:** Копирование `ai/ → dist/ai/` [`contract`]

- **Given** `scripts/prepare-publish-artifacts.ts` содержит массив `copyPairs`
- **When** добавляем `{ source: '<root>/ai', target: '<root>/dist/ai' }` в `copyPairs`
- **Then** `npm run build:publish` создаёт `dist/ai/` со всеми поддиректориями (`directives/`, `agents/`, `flow/`)
- **And** `dist/ai/directives/knowledge.xml` существует и совпадает с `ai/directives/knowledge.xml`

**Scenario:** Существующие `copyPairs` не сломаны [`contract`]

- **Given** существующие `copyPairs` (prompts/agent, prompts/commit, prompts/review, review-gen/specs, ai/agents/\*.xml)
- **When** добавляем новую пару `ai → dist/ai`
- **Then** все существующие пары продолжают копироваться без ошибок

## 5. Verification

| Command                                                                                                                               | Required by       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `npm run build:publish && node -e "require('fs').existsSync('dist/ai/directives/knowledge.xml') ? process.exit(0) : process.exit(1)"` | ai-copied-to-dist |

## 6. Test Scenario Coverage

- Scenario «Копирование `ai/ → dist/ai/`» → `npm run build:publish` → `dist/ai/directives/knowledge.xml` exists
- Scenario «Существующие `copyPairs` не сломаны» → `npm run build:publish` → exit 0, все dist/ артефакты на месте

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 - 2026-05-27, refine

#### P1

- [x] 2026-05-27T18:55:00Z added ai -> dist/ai to copyPairs in prepare-publish-artifacts.ts
- [x] 2026-05-27T18:55:00Z ver syntax OK -> pass
- [x] 2026-05-27T18:55:00Z DONE
      **Handoff ->** artifacts: [prepare-publish-artifacts.ts (copyPairs += ai)]; decisions: [ai-to-dist]; open: []

#### Round close

- [x] DONE
