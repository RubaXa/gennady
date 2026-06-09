# Task: TSK-75 — Реализовать компоненты: CodePatternsBlock, AntiPatternsBlock, ...

<!--SECTION:META-->

## 1. Meta
- **Task-ID:** TSK-75
- **Status:** [ ] TODO
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
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | — | [ ] |
| P2 | test | P1 | [ ] |

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
| Command | Required by |
|---|---|
| `npx tsc --noEmit` | typescript-rules |
| `node --test ai-tsx/components/__tests__/*.test.ts` | node-test |

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
*(Round = one execute-then-audit attempt.)*

### Round 1 — <YYYY-MM-DD>, initial

#### P1
- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2
- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close
- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
