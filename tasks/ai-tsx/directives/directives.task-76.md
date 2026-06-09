# Task: TSK-76 — Реализовать пилотные директивы + утилиты

<!--SECTION:META-->

## 1. Meta
- **Task-ID:** TSK-76
- **Status:** [ ] TODO
- **Purpose:** Реализовать 2 пилотные TSX-директивы (TypeScriptCodingRules, NodeTestRules) + утилиты renderDirective, verifyDirective. Проверить идентичность через git diff.
- **Scope:** ai-tsx
- **Module:** directives
- **Dependencies:** TSK-75
- **Spec References:**
  - Module spec: [directives](../../specs/ai-tsx/directives/directives.spec.md)
  - Contract: [renderDirective](../../specs/ai-tsx/directives/directives.spec.md#renderdirective)
  - Contract: [verifyDirective](../../specs/ai-tsx/directives/directives.spec.md#verifydirective)
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
- **Objective:** Реализовать renderDirective, verifyDirective, TypeScriptCodingRules, NodeTestRules + index.ts.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `ai-tsx/render-directive.ts`
  - `ai-tsx/verify-directive.ts`
  - `ai-tsx/directives/typescript-coding-rules.tsx`
  - `ai-tsx/directives/node-test-rules.tsx`
  - `ai-tsx/directives/index.ts`
  - `ai-tsx/index.ts`
- **Inputs:** none
- **Exit:** typecheck pass; renderDirective рендерит директиву в HTML; verifyDirective сравнивает с оригиналом.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test
- **Objective:** Покрыть утилиты и директивы тестами. Директивы проверяются через verifyDirective против оригинального XML.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `ai-tsx/__tests__/render-directive.test.ts`
  - `ai-tsx/__tests__/verify-directive.test.ts`
  - `ai-tsx/directives/__tests__/typescript-coding-rules.test.ts`
  - `ai-tsx/directives/__tests__/node-test-rules.test.ts`
  - `ai-tsx/directives/__tests__/fixtures/typescript-coding-rules/input.tsx`
  - `ai-tsx/directives/__tests__/fixtures/node-test-rules/input.tsx`
- **Inputs:** P1 handoff
- **Exit:** все тесты pass; verifyDirective для TypeScriptCodingRules → `{ match: true }`; verifyDirective для NodeTestRules → `{ match: true }`.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** renderDirective — рендер JSX в HTML

**Scenario:** Рендер простого дерева [`contract`]
- **Given** JSX-дерево Prompt с Group is="Mission"
- **When** renderDirective(tree, 'xml')
- **Then** возвращает HTML-строку с `<Prompt>` и `<Mission>`

**Scenario:** Ошибка в компоненте [`contract`]
- **Given** JSX-дерево с компонентом, который бросает Error
- **When** renderDirective(tree, 'xml')
- **Then** выбрасывает Error с префиксом `[ai-tsx]` и cause

**Feature:** verifyDirective — сравнение с оригиналом

**Scenario:** Идентичный вывод → match [`contract`]
- **Given** TSX-директива, рендерящаяся идентично оригинальному XML
- **When** verifyDirective(tsxPath, xmlPath)
- **Then** возвращает `{ match: true }`

**Scenario:** Разный вывод → diff [`contract`]
- **Given** TSX-директива, рендерящаяся с отличиями от оригинала
- **When** verifyDirective(tsxPath, xmlPath)
- **Then** возвращает `{ match: false, diff: '...' }`

**Feature:** TypeScriptCodingRules — пилотная директива

**Scenario:** Идентична оригиналу [`contract`]
- **Given** TypeScriptCodingRules TSX
- **When** verifyDirective против `ai/directives/coding/typescript-rules.xml`
- **Then** `{ match: true }`

**Feature:** NodeTestRules — пилотная директива

**Scenario:** Идентична оригиналу [`contract`]
- **Given** NodeTestRules TSX
- **When** verifyDirective против `ai/directives/testing/node-test.xml`
- **Then** `{ match: true }`

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification
| Command | Required by |
|---|---|
| `npx tsc --noEmit` | typescript-rules |
| `node --test ai-tsx/__tests__/*.test.ts ai-tsx/directives/__tests__/*.test.ts` | node-test |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage
- renderDirective basic → `ai-tsx/__tests__/render-directive.test.ts` :: `renders simple tree`
- renderDirective error → `ai-tsx/__tests__/render-directive.test.ts` :: `throws on component error`
- verifyDirective match → `ai-tsx/__tests__/verify-directive.test.ts` :: `returns match true for identical output`
- verifyDirective diff → `ai-tsx/__tests__/verify-directive.test.ts` :: `returns match false with diff`
- TypeScriptCodingRules → `ai-tsx/directives/__tests__/typescript-coding-rules.test.ts` :: `matches original xml`
- NodeTestRules → `ai-tsx/directives/__tests__/node-test-rules.test.ts` :: `matches original xml`

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
