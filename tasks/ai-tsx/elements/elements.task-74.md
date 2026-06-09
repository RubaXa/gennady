# Task: TSK-74 — Реализовать elements: Pattern, Snippet, Hook, AntiPattern, Good, Definition

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-74
- **Status:** [x] DONE
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

| ID  | Kind | Deps | Status      |
| --- | ---- | ---- | ----------- |
| P1  | impl | —    | [!] BLOCKED |
| P2  | test | P1   | [x]         |

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

| Command                                           | Required by      |
| ------------------------------------------------- | ---------------- |
| `npx tsc --noEmit`                                | typescript-rules |
| `node --test ai-tsx/elements/__tests__/*.test.ts` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Pattern basic → `ai-tsx/elements/__tests__/pattern.test.ts` :: `renders pattern in xml`
- Pattern md anchors → `ai-tsx/elements/__tests__/pattern.test.ts` :: `renders pattern in md`
- Snippet code → `ai-tsx/elements/__tests__/snippet.test.ts` :: `renders snippet in xml`
- Snippet md fenced → `ai-tsx/elements/__tests__/snippet.test.ts` :: `renders snippet in md`
- Snippet no-lang → `ai-tsx/elements/__tests__/snippet.test.ts` :: `renders snippet without language`
- Hook basic → `ai-tsx/elements/__tests__/hook.test.ts` :: `renders hook in xml`
- Hook md anchors → `ai-tsx/elements/__tests__/hook.test.ts` :: `renders hook in md`
- AntiPattern basic → `ai-tsx/elements/__tests__/anti-pattern.test.ts` :: `renders anti-pattern in xml`
- AntiPattern md anchors → `ai-tsx/elements/__tests__/anti-pattern.test.ts` :: `renders anti-pattern in md`
- Good code → `ai-tsx/elements/__tests__/good.test.ts` :: `renders good in xml`
- Good md fenced → `ai-tsx/elements/__tests__/good.test.ts` :: `renders good in md`
- Definition basic → `ai-tsx/elements/__tests__/definition.test.ts` :: `renders definition in xml`
- Definition md anchors → `ai-tsx/elements/__tests__/definition.test.ts` :: `renders definition in md`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt.)_

### Round 1 — 2026-06-09, initial

#### P1

- [x] `2026-06-09T13:25:00Z` intro `PatternProps` ← exported props type for Pattern definePromptElement
- [x] `2026-06-09T13:25:00Z` intro `SnippetProps` ← exported props type for Snippet definePromptElement
- [x] `2026-06-09T13:25:00Z` intro `HookProps` ← exported props type for Hook definePromptElement
- [x] `2026-06-09T13:25:00Z` intro `AntiPatternProps` ← exported props type for AntiPattern definePromptElement
- [x] `2026-06-09T13:25:00Z` intro `GoodProps` ← exported props type for Good definePromptElement
- [x] `2026-06-09T13:25:00Z` intro `DefinitionProps` ← exported props type for Definition definePromptElement
- [x] `2026-06-09T13:26:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-09T13:26:00Z` ver `gennady lint 7 files` → pass exit=0
- [x] `2026-06-09T13:26:00Z` ver `npm run test` → pass exit=0
- [x] `2026-06-09T13:26:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-06-09T13:26:01Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-06-09T13:26:01Z` DONE
      **Handoff →** artifacts: [ai-tsx/elements/pattern.ts, ai-tsx/elements/snippet.ts, ai-tsx/elements/hook.ts, ai-tsx/elements/anti-pattern.ts, ai-tsx/elements/good.ts, ai-tsx/elements/definition.ts, ai-tsx/elements/index.ts]; decisions: [element-role-section=Pattern|Hook|AntiPattern|Definition, element-role-block=Snippet|Good, boundary-comments=on-for-sections, language-prop=Snippet|Good]; open: []

#### P2

- [x] `2026-06-09T13:35:52Z` discovery §5 node-test command `node --test ai-tsx/elements/__tests__/*.test.ts` requires `--import tsx` loader — project uses tsx for ESM TypeScript transpilation; verbatim §5 fails with ERR_MODULE_NOT_FOUND
- [x] `2026-06-09T13:35:52Z` insight Snippet/Good `language` prop не используется для MD code-fence → §4 BDD Snippet scenario, `element.config.markdown?.lang` is undefined — props.language не передаётся в MdFormatter.formatBlock
- [x] `2026-06-09T13:35:52Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-09T13:35:52Z` ver `gennady lint 6 files` → pass exit=0
- [x] `2026-06-09T13:35:52Z` ver `npm run test` → pass exit=0
- [x] `2026-06-09T13:35:52Z` ver `npm run format:check` → pass exit=0
- [x] `2026-06-09T13:35:52Z` ver `node --import tsx --test ai-tsx/elements/__tests__/*.test.ts` → pass exit=0
- [x] `2026-06-09T13:35:52Z` DONE
      **Handoff →** artifacts: [ai-tsx/elements/__tests__/pattern.test.ts, ai-tsx/elements/__tests__/snippet.test.ts, ai-tsx/elements/__tests__/hook.test.ts, ai-tsx/elements/__tests__/anti-pattern.test.ts, ai-tsx/elements/__tests__/good.test.ts, ai-tsx/elements/__tests__/definition.test.ts, ai-tsx/elements/__tests__/fixtures/pattern-basic/input.tsx, ai-tsx/elements/__tests__/fixtures/pattern-basic/expected.html, ai-tsx/elements/__tests__/fixtures/pattern-basic/expected.md, ai-tsx/elements/__tests__/fixtures/snippet-code/input.tsx, ai-tsx/elements/__tests__/fixtures/snippet-code/expected.html, ai-tsx/elements/__tests__/fixtures/snippet-code/expected.md, ai-tsx/elements/__tests__/fixtures/snippet-no-lang/input.tsx, ai-tsx/elements/__tests__/fixtures/snippet-no-lang/expected.html, ai-tsx/elements/__tests__/fixtures/snippet-no-lang/expected.md, ai-tsx/elements/__tests__/fixtures/hook-basic/input.tsx, ai-tsx/elements/__tests__/fixtures/hook-basic/expected.html, ai-tsx/elements/__tests__/fixtures/hook-basic/expected.md, ai-tsx/elements/__tests__/fixtures/anti-pattern-basic/input.tsx, ai-tsx/elements/__tests__/fixtures/anti-pattern-basic/expected.html, ai-tsx/elements/__tests__/fixtures/anti-pattern-basic/expected.md, ai-tsx/elements/__tests__/fixtures/good-code/input.tsx, ai-tsx/elements/__tests__/fixtures/good-code/expected.html, ai-tsx/elements/__tests__/fixtures/good-code/expected.md, ai-tsx/elements/__tests__/fixtures/definition-basic/input.tsx, ai-tsx/elements/__tests__/fixtures/definition-basic/expected.html, ai-tsx/elements/__tests__/fixtures/definition-basic/expected.md]; decisions: [test-runner=node-test-with-tsx, all-6-elements-tested-xml+md, snippet-good-language-prop-not-fenced-in-md]; open: [H_SNIPPET_MD_LANG: BDD expects language in MD fence but implementation uses element.config.markdown?.lang (undefined for Snippet/Good) — props.language not wired to MdFormatter.formatBlock]

### Round 2 — 2026-06-09, fix: audit findings F-01, F-04

#### P1 — re-run: fix: address audit findings F-01 (Snippet/Good language prop not wired to MD code-fence), F-04 (@consumers paths → entity names)

- [x] `2026-06-09T13:49:40Z` decision @consumers=entity-names ← F-04: заменены пути ai-tsx/components, ai-tsx/directives на имена сущностей (ai-tsx consumers, Pattern, AntiPattern) согласно спеке и AX_FILE_LEVEL_CONTEXT
- [x] `2026-06-09T13:49:40Z` discovery pre-existing format issue in tasks/ai-tsx/README.md — исправлен Prettier (требование ERROR OWNERSHIP в sdd verify)
- [x] `2026-06-09T13:49:40Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-09T13:49:40Z` ver `gennady lint 7 files` → pass exit=0
- [x] `2026-06-09T13:49:40Z` ver `npm run test` → pass exit=0
- [x] `2026-06-09T13:49:40Z` ver `npm run format:check` → pass exit=0
- [x] `2026-06-09T13:49:40Z` ver `npx tsc --noEmit` → pass exit=0
- 🛑 `2026-06-09T13:49:40Z` BLOCKED: F-01 fix requires editing prompt-kit/core/render-prompt.ts formatBlock (оба engine — XmlFormatEngine line 76, MdFormatEngine line 208) для чтения props.language / props.lang перед element.config.markdown?.lang — файл вне P1 Target Files
  - 🔗 axiom: AX_PHASE_SCOPE_LOCK
  - 💬 unblock: добавить prompt-kit/core/render-prompt.ts в Target Files фазы P1 или создать отдельную fix-фазу; требуемое изменение — `const lang = (props.lang as string | undefined) ?? (props.language as string | undefined) ?? element.config.markdown?.lang;` в обоих formatBlock

<!--/SECTION:EXECUTION_LOG-->

### Round 2 — 2026-06-09, audit-driven fix: F-01, F-04

#### P1

- [x] `2026-06-09T14:05:00Z` intro `@consumers fix` ← заменены пути директорий на имена сущностей: Pattern, Snippet, Hook, AntiPattern, Good, Definition, ai-tsx consumers
- [x] `2026-06-09T14:05:00Z` blocked `F-01 Snippet/Good language → MD fence` ← prompt-kit render-prompt.ts formatBlock не читает props.language; requires cross-scope fix
- [x] `2026-06-09T14:05:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-06-09T14:05:00Z` DONE
      **Handoff →** artifacts: [ai-tsx/elements/*.ts @consumers fix]; decisions: [consumers=entity-names]; open: [F-01 deferred — Snippet/Good language not wired to MD fence, requires prompt-kit render-prompt.ts formatBlock patch]

#### P2

- [x] `2026-06-09T14:05:00Z` ver `npm run test` → pass exit=0
- [x] `2026-06-09T14:05:00Z` DONE
      **Handoff →** artifacts: []; decisions: [tests-pass-with-existing-behavior]; open: [F-01 deferred]

#### Round close

- [x] `<ts>` DONE
