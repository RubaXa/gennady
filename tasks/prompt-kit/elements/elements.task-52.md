# Task: TSK-52 — Elements module

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-52
- **Status:** [ ] TODO
- **Purpose:** Реализовать 9 встроенных JSX-примитивов: Prompt, PrimaryGoal, BeliefState, Axiom, HardForbidden, Section, List, Code, Bold. Каждый — через definePromptElement с предопределённой ролью и рендер-функциями. Покрыть фикстурами каждый примитив в обоих форматах.
- **Scope:** prompt-kit
- **Module:** elements
- **Dependencies:** TSK-49, TSK-51
- **Spec References:**
  - Module spec: [elements](../../specs/prompt-kit/elements/elements.spec.md)
  - Contract: [Prompt](../../specs/prompt-kit/elements/elements.spec.md#prompt)
  - Contract: [PrimaryGoal](../../specs/prompt-kit/elements/elements.spec.md#primarygoal)
  - Contract: [BeliefState](../../specs/prompt-kit/elements/elements.spec.md#beliefstate)
  - Contract: [Axiom](../../specs/prompt-kit/elements/elements.spec.md#axiom)
  - Contract: [HardForbidden](../../specs/prompt-kit/elements/elements.spec.md#hardforbidden)
  - Contract: [Section](../../specs/prompt-kit/elements/elements.spec.md#section)
  - Contract: [List](../../specs/prompt-kit/elements/elements.spec.md#list)
  - Contract: [Code](../../specs/prompt-kit/elements/elements.spec.md#code)
  - Contract: [Bold](../../specs/prompt-kit/elements/elements.spec.md#bold)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Создать 9 примитивов через definePromptElement. Prompt (root, keywords→md заголовок + xml атрибут), PrimaryGoal/BeliefState/HardForbidden (section, includeBoundaryComments: true), Axiom (section, id prop→markdownTitle), Section (section, title + опциональный id), List (list, ordered/title), Code (block, lang/title), Bold (inline). Каждый — в отдельном файле, агрегирующий `index.ts`.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `prompt-kit/elements/prompt.ts`
  - `prompt-kit/elements/primary-goal.ts`
  - `prompt-kit/elements/belief-state.ts`
  - `prompt-kit/elements/axiom.ts`
  - `prompt-kit/elements/hard-forbidden.ts`
  - `prompt-kit/elements/section.ts`
  - `prompt-kit/elements/list.ts`
  - `prompt-kit/elements/code.ts`
  - `prompt-kit/elements/bold.ts`
  - `prompt-kit/elements/index.ts`
- **Inputs:** none
- **Exit:** `npm run type-check` pass; все 9 примитивов импортируются из `gennady/prompt-kit`
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Фикстура на каждый примитив: input.tsx → expected.xml + expected.md. Каждый примитив проверяется изолированно через renderPrompt в обоих форматах.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `prompt-kit/elements/__tests__/fixtures/prompt-basic/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/prompt-basic/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/prompt-basic/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/prompt-no-keywords/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/prompt-no-keywords/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/prompt-no-keywords/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/primary-goal/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/primary-goal/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/primary-goal/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/belief-state/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/belief-state/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/belief-state/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/axiom/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/axiom/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/axiom/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/hard-forbidden/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/hard-forbidden/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/hard-forbidden/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/section-basic/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/section-basic/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/section-basic/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/section-with-id/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/section-with-id/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/section-with-id/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/list-ordered/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/list-ordered/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/list-ordered/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/list-unordered/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/list-unordered/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/list-unordered/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/list-title/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/list-title/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/list-title/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/code-basic/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/code-basic/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/code-basic/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/code-with-title/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/code-with-title/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/code-with-title/expected.md`
  - `prompt-kit/elements/__tests__/fixtures/bold/input.tsx`
  - `prompt-kit/elements/__tests__/fixtures/bold/expected.xml`
  - `prompt-kit/elements/__tests__/fixtures/bold/expected.md`
  - `prompt-kit/elements/__tests__/elements-fixtures.test.ts`
  - `prompt-kit/elements/__tests__/elements.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все 14 фикстур проходят; `node --import tsx --test prompt-kit/elements/__tests__/*.test.ts` → pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Prompt — корень сообщения

**Scenario:** С keywords [`unit`]

- **Given** `<Prompt keywords="rules, safety">текст</Prompt>`
- **When** renderPrompt(..., 'md')
- **Then** вывод: `## KEYWORDS:\nrules, safety\n\nтекст`

**Scenario:** Без keywords [`unit`]

- **Given** `<Prompt>текст</Prompt>`
- **When** renderPrompt(..., 'xml')
- **Then** вывод: `<Prompt>\n  текст\n</Prompt>` (без атрибута keywords)

**Feature:** Axiom — секция с id

**Scenario:** id в заголовке md [`unit`]

- **Given** `<Axiom id="AX_1">текст</Axiom>`
- **When** renderPrompt(..., 'md')
- **Then** заголовок: `### AXIOM \`AX_1\`:\n<!--START_AXIOM_AX_1-->\nтекст\n<!--END_AXIOM_AX_1-->`

**Feature:** List — список

**Scenario:** Ordered list [`unit`]

- **Given** `<List ordered>первый<Bold>второй</Bold></List>`
- **When** renderPrompt(..., 'md')
- **Then** ` 1 первый;\n 2 **второй**.`

**Scenario:** Unordered с title [`unit`]

- **Given** `<List title="Приоритеты">a<Bold>b</Bold></List>`
- **When** renderPrompt(..., 'md')
- **Then** `**Приоритеты:**\n - a;\n - **b**.`

**Feature:** Section — универсальная

**Scenario:** С id — якорь [`unit`]

- **Given** `<Section title="HELP" id="help">текст</Section>`
- **When** renderPrompt(..., 'md')
- **Then** якорь: `<!--START_SECTION_HELP-->`

**Feature:** Code — блок кода

**Scenario:** С lang и title [`unit`]

- **Given** `<Code lang="ts" title="Пример">const x = 1</Code>`
- **When** renderPrompt(..., 'md')
- **Then** `**Пример:**\n\`\`\`ts\nconst x = 1\n\`\`\``

**Feature:** Bold — жирный inline

**Scenario:** Bold внутри текста [`unit`]

- **Given** `<Bold>жирный</Bold>`
- **When** renderPrompt(..., 'md')
- **Then** `**жирный**`
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                            | Required by      |
| ------------------------------------------------------------------ | ---------------- |
| `npm run type-check`                                               | typescript-rules |
| `node --import tsx --test prompt-kit/elements/__tests__/*.test.ts` | node-test        |

- **Completion additions:** Все 14 фикстур должны проходить — каждый примитив рендерится ожидаемо в обоих форматах
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- С keywords → `prompt-kit/elements/__tests__/elements-fixtures.test.ts` :: `prompt-basic`
- Без keywords → `prompt-kit/elements/__tests__/elements-fixtures.test.ts` :: `prompt-no-keywords`
- id в заголовке md → `prompt-kit/elements/__tests__/elements-fixtures.test.ts` :: `axiom`
- Ordered list → `prompt-kit/elements/__tests__/elements-fixtures.test.ts` :: `list-ordered`
- Unordered с title → `prompt-kit/elements/__tests__/elements-fixtures.test.ts` :: `list-title`
- С id — якорь → `prompt-kit/elements/__tests__/elements-fixtures.test.ts` :: `section-with-id`
- С lang и title → `prompt-kit/elements/__tests__/elements-fixtures.test.ts` :: `code-with-title`
- Bold inline → `prompt-kit/elements/__tests__/elements-fixtures.test.ts` :: `bold`

Все 14 фикстурных кейсов: `prompt-basic`, `prompt-no-keywords`, `primary-goal`, `belief-state`, `axiom`, `hard-forbidden`, `section-basic`, `section-with-id`, `list-ordered`, `list-unordered`, `list-title`, `code-basic`, `code-with-title`, `bold`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt.)_

### Round 1 — <YYYY-MM-DD>, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [9 element files + index.ts]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `node --import tsx --test prompt-kit/elements/__tests__/*.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
    **Handoff →** artifacts: [15 fixture sets + 2 test files]; decisions: [...]; open: [...]
<!--/SECTION:EXECUTION_LOG-->
