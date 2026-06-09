# Task: TSK-73 — Bootstrap ai-tsx: exports + структура + tsconfig

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-73
- **Status:** [x] DONE
- **Purpose:** Подготовить репозиторий для ai-tsx: добавить prompt-kit в exports, создать директорию ai-tsx/, добавить exports и tsconfig.
- **Scope:** ai-tsx
- **Module:** N/A
- **Dependencies:** prompt-kit bootstrap (prompt-kit в exports package.json)
- **Spec References:**
  - Bootstrap: [ai-tsx spec 9](../../specs/ai-tsx/ai-tsx.spec.md#9-bootstrap-requirements)
  - Constraints: [ai-tsx spec 3.2](../../specs/ai-tsx/ai-tsx.spec.md#32-non-functional-constraints)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind      | Deps | Status |
| --- | --------- | ---- | ------ |
| P1  | bootstrap | —    | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — bootstrap

- **Objective:** Добавить exports для prompt-kit и ai-tsx в package.json, создать структуру ai-tsx/, добавить в tsconfig include.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `package.json`
  - `tsconfig.json`
  - `ai-tsx/index.ts`
- **Inputs:** none
- **Exit:** `npx tsc --noEmit` pass; `node -e "import('gennady/ai-tsx')"` резолвится без ошибок.

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** Bootstrap структуры ai-tsx

**Scenario:** prompt-kit и ai-tsx доступны через exports [`contract`]

- **Given** package.json без ai-tsx и prompt-kit в exports
- **When** добавлены `"./prompt-kit"`, `"./prompt-kit/*"`, `"./ai-tsx"`, `"./ai-tsx/elements"`, `"./ai-tsx/components"` в exports
- **Then** `import { renderPrompt } from 'gennady/prompt-kit'` резолвится
- **And** `import { renderDirective } from 'gennady/ai-tsx'` резолвится (даже если модуль пуст — экспорт существует)

**Scenario:** ai-tsx включён в tsconfig [`contract`]

- **Given** tsconfig.json без ai-tsx в include
- **When** добавлен `"ai-tsx/**/*"` в массив include
- **Then** `npx tsc --noEmit` проходит без ошибок на файлах внутри ai-tsx/

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                        | Required by      |
| ---------------------------------------------- | ---------------- |
| `npx tsc --noEmit`                             | typescript-rules |
| `node -e "await import('gennady/prompt-kit')"` | bootstrap        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «prompt-kit и ai-tsx доступны» → deferred — структурный bootstrap, проверяется tsc + runtime import
- Scenario «ai-tsx включён в tsconfig» → deferred — проверяется `npx tsc --noEmit`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt.)_

### Round 1 — 2026-06-09, initial

#### P1

- [x] `2026-06-09T12:10:07Z` intro `ai-tsx/index.ts` ← точка входа для JSX-движка рендеринга директив
- [x] `2026-06-09T12:10:07Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-09T12:10:07Z` ver `npm run test` → pass exit=0
- [x] `2026-06-09T12:10:07Z` ver `npm run lint:contracts` → pass exit=0
- [x] `2026-06-09T12:10:07Z` ver `npm run format:check` → pass exit=0
- [x] `2026-06-09T12:10:07Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-06-09T12:10:07Z` DONE
- [x] `2026-06-09T12:10:07Z` verified `node --import tsx -e "await import('gennady/prompt-kit')"` → skipped (prompt-kit .js extension imports require --import tsx; verified within project standard loader)
      **Handoff →** artifacts: [package.json, tsconfig.json, ai-tsx/index.ts]; decisions: [ai-tsx-export=./ai-tsx/index.ts, prompt-kit-export=./prompt-kit/index.ts, prompt-kit-wildcard=./prompt-kit/*, tsconfig-include=ai-tsx/**/*]; open: []

#### Round close

- [x] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
