# Task: TSK-73 — Bootstrap ai-tsx: exports + структура + tsconfig

<!--SECTION:META-->

## 1. Meta
- **Task-ID:** TSK-73
- **Status:** [ ] TODO
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
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | bootstrap | — | [ ] |

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
| Command | Required by |
|---|---|
| `npx tsc --noEmit` | typescript-rules |
| `node -e "await import('gennady/prompt-kit')"` | bootstrap |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage
- Scenario «prompt-kit и ai-tsx доступны» → deferred — структурный bootstrap, проверяется tsc + runtime import
- Scenario «ai-tsx включён в tsconfig» → deferred — проверяется `npx tsc --noEmit`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log
*(Round = one execute-then-audit attempt.)*

### Round 1 — <YYYY-MM-DD>, initial

#### P1
- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close
- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
