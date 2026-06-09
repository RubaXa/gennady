# Task: TSK-74 — Реализовать elements: Pattern, Snippet, Hook, AntiPattern, Good, Definition

<!--SECTION:META-->

## 1. Meta
- **Task-ID:** TSK-74
- **Status:** [ ] TODO
- **Purpose:** Реализовать 6 definePromptElement-элементов с BDD-тестами: каждый элемент → тест на рендер в HTML и Markdown.
- **Scope:** ai-tsx
- **Module:** elements
- **Dependencies:** TSK-73
- **Spec References:**
  - Module spec: [elements](../../specs/ai-tsx/elements/elements.spec.md)
  - Contract: [elements DbC](../../specs/ai-tsx/elements/elements.spec.md#5-module-contracts-dbc)
  - Constraints: [ai-tsx spec 3.2](../../specs/ai-tsx/ai-tsx.spec.md#32-non-functional-constraints)
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
- **Objective:** Реализовать Pattern, Snippet, Hook, AntiPattern, Good, Definition через definePromptElement + index.ts.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `ai-tsx/elements/pattern.ts`
  - `ai-tsx/elements/snippet.ts`
  - `ai-tsx/elements/hook.ts`
  - `ai-tsx/elements/anti-pattern.ts`
  - `ai-tsx/elements/good.ts`
  - `ai-tsx/elements/definition.ts`
  - `ai-tsx/elements/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; все элементы экспортируются через index.ts; `Pattern`, `Snippet`, `Good` рендерятся в HTML без ошибок.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test
- **Objective:** Покрыть каждый элемент тестом с фикстурами: input.tsx → expected.html + expected.md.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `ai-tsx/elements/__tests__/pattern.test.ts`
  - `ai-tsx/elements/__tests__/snippet.test.ts`
  - `ai-tsx/elements/__tests__/hook.test.ts`
  - `ai-tsx/elements/__tests__/anti-pattern.test.ts`
  - `ai-tsx/elements/__tests__/good.test.ts`
  - `ai-tsx/elements/__tests__/definition.test.ts`
  - `ai-tsx/elements/__tests__/fixtures/pattern-basic/input.tsx`
  - `ai-tsx/elements/__tests__/fixtures/pattern-basic/expected.html`
  - `ai-tsx/elements/__tests__/fixtures/pattern-basic/expected.md`
  - `ai-tsx/elements/__tests__/fixtures/snippet-code/input.tsx`
  - `ai-tsx/elements/__tests__/fixtures/snippet-code/expected.html`
  - `ai-tsx/elements/__tests__/fixtures/snippet-code/expected.md`
  - `ai-tsx/elements/__tests__/fixtures/snippet-no-lang/input.tsx`
  - `ai-tsx/elements/__tests__/fixtures/snippet-no-lang/expected.html`
  - `ai-tsx/elements/__tests__/fixtures/snippet-no-lang/expected.md`
  - `ai-tsx/elements/__tests__/fixtures/hook-basic/input.tsx`
  - `ai-tsx/elements/__tests__/fixtures/hook-basic/expected.html`
  - `ai-tsx/elements/__tests__/fixtures/hook-basic/expected.md`
  - `ai-tsx/elements/__tests__/fixtures/anti-pattern-basic/input.tsx`
  - `ai-tsx/elements/__tests__/fixtures/anti-pattern-basic/expected.html`
  - `ai-tsx/elements/__tests__/fixtures/anti-pattern-basic/expected.md`
  - `ai-tsx/elements/__tests__/fixtures/good-code/input.tsx`
  - `ai-tsx/elements/__tests__/fixtures/good-code/expected.html`
  - `ai-tsx/elements/__tests__/fixtures/good-code/expected.md`
  - `ai-tsx/elements/__tests__/fixtures/definition-basic/input.tsx`
  - `ai-tsx/elements/__tests__/fixtures/definition-basic/expected.html`
  - `ai-tsx/elements/__tests__/fixtures/definition-basic/expected.md`
- **Inputs:** P1 handoff
- **Exit:** все тесты pass; каждый элемент проверен на рендер в HTML и MD.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** Pattern — контейнер с id

**Scenario:** Pattern рендерится с Intent + Snippet + Why [`contract`]
- **Given** Pattern с id="PT_EXAMPLE"
- **When** renderPrompt с xml
- **Then** вывод содержит `<Pattern id="PT_EXAMPLE">` с дочерними `<Intent>`, `<Snippet>`, `<Why>`

**Scenario:** Pattern в Markdown с якорями [`contract`]
- **Given** Pattern с id="PT_EXAMPLE"
- **When** renderPrompt с md
- **Then** вывод содержит `<!--START_PATTERN_PT_EXAMPLE-->` и `<!--END_PATTERN_PT_EXAMPLE-->`

**Feature:** Snippet — блок кода без фенсов

**Scenario:** Snippet в HTML без markdown-фенсов [`contract`]
- **Given** Snippet с language="typescript" и кодом `const x = 1`
- **When** renderPrompt с xml
- **Then** вывод: `<Snippet language="typescript">const x = 1</Snippet>`

**Scenario:** Snippet в Markdown с фенсами [`contract`]
- **Given** Snippet с language="typescript" и кодом `const x = 1`
- **When** renderPrompt с md
- **Then** вывод содержит ` ```typescript\nconst x = 1\n``` `

**Feature:** Hook — контейнер с id

**Scenario:** Hook рендерится с Purpose + Command + Expected [`contract`]
- **Given** Hook с id="HOOK_TYPECHECK"
- **When** renderPrompt с xml
- **Then** вывод: `<Hook id="HOOK_TYPECHECK"><Purpose>...</Purpose><Command>...</Command><Expected>...</Expected></Hook>`

**Feature:** AntiPattern — контейнер с id

**Scenario:** AntiPattern рендерится с Bad + WhyBad + Good [`contract`]
- **Given** AntiPattern с id="AP_EXAMPLE"
- **When** renderPrompt с xml
- **Then** вывод содержит `<Bad>`, `<WhyBad>`, `<Good>` внутри `<AntiPattern>`

**Feature:** Good — блок правильного кода

**Scenario:** Good в HTML без фенсов [`contract`]
- **Given** Good с language="typescript"
- **When** renderPrompt с xml
- **Then** вывод: `<Good language="typescript">код</Good>`

**Feature:** Definition — контейнер с id

**Scenario:** Definition с id и текстом [`contract`]
- **Given** Definition с id="DEF_EXAMPLE" и текстом
- **When** renderPrompt с xml
- **Then** вывод: `<Definition id="DEF_EXAMPLE">текст</Definition>`

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification
| Command | Required by |
|---|---|
| `npx tsc --noEmit` | typescript-rules |
| `node --test ai-tsx/elements/__tests__/*.test.ts` | node-test |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage
- Pattern basic → `ai-tsx/elements/__tests__/pattern.test.ts` :: `renders pattern in xml`
- Pattern md anchors → `ai-tsx/elements/__tests__/pattern.test.ts` :: `renders pattern in md`
- Snippet code → `ai-tsx/elements/__tests__/snippet.test.ts` :: `renders snippet in xml`
- Snippet md fenced → `ai-tsx/elements/__tests__/snippet.test.ts` :: `renders snippet in md`
- Snippet no-lang → `ai-tsx/elements/__tests__/snippet.test.ts` :: `renders snippet without language`
- Hook basic → `ai-tsx/elements/__tests__/hook.test.ts` :: `renders hook in xml`
- AntiPattern basic → `ai-tsx/elements/__tests__/anti-pattern.test.ts` :: `renders anti-pattern in xml`
- Good code → `ai-tsx/elements/__tests__/good.test.ts` :: `renders good in xml`
- Definition basic → `ai-tsx/elements/__tests__/definition.test.ts` :: `renders definition in xml`

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
