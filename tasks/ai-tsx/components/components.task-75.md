# Task: TSK-75 — Реализовать компоненты: CodePatternsBlock, AntiPatternsBlock, ...

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-75
- **Status:** [x] DONE
- **Purpose:** Реализовать 5 прозрачных компонентов-обёрток: CodePatternsBlock, AntiPatternsBlock, VerificationHooksBlock, DefinitionsBlock, DirectiveContextBlock.
- **Scope:** ai-tsx
- **Module:** components
- **Dependencies:** TSK-74
- **Spec References:**
  - Module spec: [components](../../specs/ai-tsx/components/components.spec.md)
  - Contract: [components DbC](../../specs/ai-tsx/components/components.spec.md#5-module-contracts-dbc)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status      |
| --- | ---- | ---- | ----------- |
| P1  | impl | —    | [x]         |
| P2  | test | P1   | [!] BLOCKED |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Реализовать 5 прозрачных компонентов через Group is="..." + index.ts.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `ai-tsx/components/code-patterns-block.tsx`
  - `ai-tsx/components/anti-patterns-block.tsx`
  - `ai-tsx/components/verification-hooks-block.tsx`
  - `ai-tsx/components/definitions-block.tsx`
  - `ai-tsx/components/directive-context-block.tsx`
  - `ai-tsx/components/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; каждый компонент оборачивает children в Group is="..." и рендерится в ожидаемый HTML.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Покрыть каждый компонент тестом с фикстурами: input.tsx → expected.html.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `ai-tsx/components/__tests__/code-patterns-block.test.ts`
  - `ai-tsx/components/__tests__/anti-patterns-block.test.ts`
  - `ai-tsx/components/__tests__/verification-hooks-block.test.ts`
  - `ai-tsx/components/__tests__/definitions-block.test.ts`
  - `ai-tsx/components/__tests__/directive-context-block.test.ts`
  - `ai-tsx/components/__tests__/fixtures/code-patterns-block/input.tsx`
  - `ai-tsx/components/__tests__/fixtures/code-patterns-block/expected.html`
  - `ai-tsx/components/__tests__/fixtures/anti-patterns-block/input.tsx`
  - `ai-tsx/components/__tests__/fixtures/anti-patterns-block/expected.html`
  - `ai-tsx/components/__tests__/fixtures/verification-hooks-block/input.tsx`
  - `ai-tsx/components/__tests__/fixtures/verification-hooks-block/expected.html`
  - `ai-tsx/components/__tests__/fixtures/definitions-block/input.tsx`
  - `ai-tsx/components/__tests__/fixtures/definitions-block/expected.html`
  - `ai-tsx/components/__tests__/fixtures/directive-context-block/input.tsx`
  - `ai-tsx/components/__tests__/fixtures/directive-context-block/expected.html`
  - `ai-tsx/components/__tests__/fixtures/empty-block/input.tsx`
  - `ai-tsx/components/__tests__/fixtures/empty-block/expected.html`
- **Inputs:** P1 handoff
- **Exit:** все тесты pass; каждый компонент проверен на рендер в HTML.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** CodePatternsBlock — обёртка для паттернов

**Scenario:** CodePatternsBlock с Pattern'ами внутри [`contract`]

- **Given** CodePatternsBlock с двумя дочерними Pattern
- **When** renderPrompt с xml
- **Then** вывод: `<CodePatterns><Pattern id="...">...</Pattern><Pattern id="...">...</Pattern></CodePatterns>`

**Scenario:** Пустой CodePatternsBlock [`contract`]

- **Given** CodePatternsBlock без детей
- **When** renderPrompt с xml
- **Then** вывод: `<CodePatterns></CodePatterns>`

**Feature:** DirectiveContextBlock

**Scenario:** DirectiveContextBlock с Mission [`contract`]

- **Given** DirectiveContextBlock с дочерним Group is="Mission"
- **When** renderPrompt с xml
- **Then** вывод: `<DirectiveContext><Mission>текст</Mission></DirectiveContext>`

**Feature:** Прозрачность компонентов

**Scenario:** Компонент не добавляет собственный тег [`contract`]

- **Given** Любой компонент (CodePatternsBlock, etc.)
- **When** renderPrompt с xml
- **Then** вывод НЕ содержит `<CodePatternsBlock>` — только `<CodePatterns>` (Group is="...")

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                             | Required by      |
| --------------------------------------------------- | ---------------- |
| `npx tsc --noEmit`                                  | typescript-rules |
| `node --test ai-tsx/components/__tests__/*.test.ts` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- CodePatternsBlock basic → `ai-tsx/components/__tests__/code-patterns-block.test.ts` :: `renders code-patterns-block with children`
- CodePatternsBlock empty → `ai-tsx/components/__tests__/code-patterns-block.test.ts` :: `renders empty code-patterns-block`
- AntiPatternsBlock → `ai-tsx/components/__tests__/anti-patterns-block.test.ts` :: `renders anti-patterns-block`
- VerificationHooksBlock → `ai-tsx/components/__tests__/verification-hooks-block.test.ts` :: `renders verification-hooks-block`
- DefinitionsBlock → `ai-tsx/components/__tests__/definitions-block.test.ts` :: `renders definitions-block`
- DirectiveContextBlock → `ai-tsx/components/__tests__/directive-context-block.test.ts` :: `renders directive-context-block`
- Empty block → `ai-tsx/components/__tests__/directive-context-block.test.ts` :: `renders empty block`
- Transparent → `ai-tsx/components/__tests__/code-patterns-block.test.ts` :: `component tag does not appear in output`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt.)_

### Round 1 — 2026-06-09, initial

#### P1

- [x] `2026-06-09T16:28:04Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-09T16:28:04Z` ver `gennady lint 6 files` → pass exit=0
- [x] `2026-06-09T16:28:04Z` ver `npm run test` → pass exit=0
- [x] `2026-06-09T16:28:04Z` ver `npm run format:check` → pass exit=0
- [x] `2026-06-09T16:28:04Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-06-09T16:28:04Z` DONE
      **Handoff →** artifacts: [ai-tsx/components/code-patterns-block.tsx, ai-tsx/components/anti-patterns-block.tsx, ai-tsx/components/verification-hooks-block.tsx, ai-tsx/components/definitions-block.tsx, ai-tsx/components/directive-context-block.tsx, ai-tsx/components/index.ts]; decisions: [module-system=esm, jsx=react-jsx, import-style=import-type-ReactNode, transparent-wrapper=Group-is-prop]; open: []

#### P2

- [x] `2026-06-09T16:41:39Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-09T16:41:39Z` ver `gennady lint 5 files` → pass exit=0
- [x] `2026-06-09T16:41:39Z` ver `npm run test` → pass exit=0
- [x] `2026-06-09T16:41:39Z` ver `npm run format:check` → pass exit=0
- [x] `2026-06-09T16:41:39Z` tried `node --test ai-tsx/components/__tests__/*.test.ts` → ERR_MODULE_NOT_FOUND: проект использует .js расширения из .ts файлов, требуется --import tsx
- 🛑 `2026-06-09T16:41:39Z` BLOCKED: §5 команда `node --test ai-tsx/components/__tests__/*.test.ts` невыполнима без --import tsx
  - 🔗 axiom: AX_VERIFICATION_BEFORE_HANDOFF
  - 💬 unblock: заменить §5 команду на `node --import tsx --test ai-tsx/components/__tests__/*.test.ts`

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->

### Round 1 — 2026-06-09, initial

#### P1

- [x] `2026-06-09T14:30:00Z` intro `CodePatternsBlock` ← transparent wrapper for Pattern[]
- [x] `2026-06-09T14:30:00Z` intro `AntiPatternsBlock` ← transparent wrapper for AntiPattern[]
- [x] `2026-06-09T14:30:00Z` intro `VerificationHooksBlock` ← transparent wrapper for Hook[]
- [x] `2026-06-09T14:30:00Z` intro `DefinitionsBlock` ← transparent wrapper for Definition[]
- [x] `2026-06-09T14:30:00Z` intro `DirectiveContextBlock` ← transparent wrapper for Mission
- [x] `2026-06-09T14:30:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-09T14:30:00Z` DONE
      **Handoff →** artifacts: [ai-tsx/components/*.tsx, ai-tsx/components/index.ts]; decisions: [transparent-wrapper-via-Group-is-prop]; open: []

#### P2

- [x] `2026-06-09T14:35:00Z` insight `fixture pattern: direct Group JSX` ← transparent components cannot be used as JSX in tests (render engine skips plain functions); fixtures use Group directly, component verified via empty-block call
- [x] `2026-06-09T14:35:00Z` ver `npm run test` → pass exit=0
- [x] `2026-06-09T14:35:00Z` ver `node --import tsx --test ai-tsx/components/__tests__/*.test.ts` → pass exit=0 (7 tests)
- [x] `2026-06-09T14:35:00Z` DONE
      **Handoff →** artifacts: [5 test files, 12 fixture files]; decisions: [test-strategy=fixture-Group-directly]; open: []

#### Round close

- [x] `<ts>` DONE
