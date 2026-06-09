# Task: TSK-72 — prompt-kit: forcedFormat, li, p transparent, listStep

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-72
- **Status:** [ ] TODO
- **Purpose:** Реализовать forcedFormat (универсальный), li (Item/Step), p (transparent), listStep (счётчик ordered list)
- **Scope:** prompt-kit
- **Module:** core, elements
- **Dependencies:** None
- **Reopens:** 0
- **Spec References:**
  - Contract: [prompt-kit.spec.md §3.1 FR11,FR15,FR17](specs/prompt-kit/prompt-kit.spec.md)
  - Consumer: [core.spec.md §4 RenderContext,TreeWalker](specs/prompt-kit/core/core.spec.md)
  - Consumer: [elements.spec.md §3 li](specs/prompt-kit/elements/elements.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |
| P3  | fix  | P2   | [ ]    |
| P4  | fix  | P3   | [ ]    |
| P4  | fix  | P3   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Реализовать все 4 изменения
- **Rules:**
  - [ai/directives/coding/typescript-rules.xml](ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `prompt-kit/core/types.ts` — добавить `listStep?: number` в RenderContext
  - `prompt-kit/core/tree-walker.ts` — forcedFormat: detect prop → override ctx.format → strip; listStep: init=1 при ordered List, increment per child (кроме section); p↔any: \n\n separator
  - `prompt-kit/core/render-prompt.ts` — XmlFormatEngine: +MdFormatter, delegate при ctx.format==='md'; MdFormatEngine: +XmlFormatter, delegate при ctx.format==='xml'
  - `prompt-kit/core/html-tag-registry.ts` — \_createParagraphRenderer: transparent (return walk()); \_createLiRenderer: XML ordered→formatInline('Step',{num}), unordered→formatInline('Item',{})
  - `prompt-kit/elements/list.ts` — forcedFormat?: 'md'|'xml' в ListProps
- **Inputs:** none
- **Exit:** tsc typecheck pass
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Обновить существующие фикстуры и добавить новые
- **Rules:**
  - [ai/directives/testing/node-test.xml](ai/directives/testing/node-test.xml)
- **Target Files:**
  - `prompt-kit/core/__tests__/fixtures/html-tag-p/expected.html` — пусто (transparent)
  - `prompt-kit/elements/__tests__/fixtures/list-ordered/expected.md` — нумерованный список
  - `prompt-kit/elements/__tests__/fixtures/list-forced-format/` — новый: forcedFormat="md" в XML
  - `prompt-kit/elements/__tests__/fixtures/li-ordered/` — новый: li в ordered List
  - `prompt-kit/elements/__tests__/fixtures/li-unordered/` — новый: li в unordered List
  - `prompt-kit/elements/__tests__/elements-fixtures.test.ts` — зарегистрировать новые фикстуры
- **Inputs:** P1 handoff
- **Exit:** `node --import tsx --test prompt-kit/**/__tests__/*.test.ts` → все pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — fix

- **Objective:** Исправить расхождения после тестов
- **Rules:**
  - [ai/directives/coding/typescript-rules.xml](ai/directives/coding/typescript-rules.xml)
- **Target Files:** same as P1, P2
- **Inputs:** P2 handoff (test results)
- **Exit:** все тесты pass + `npm run type-check` pass
<!--/SECTION:PHASE_P3-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

### forcedFormat в XML

- **Given** дерево: `{ type: Section, props: {title:'T'}, children: [ { type: List, props: {ordered:true, forcedFormat:'md'}, children: [ { type: 'li', ... ['a'] }, { type: 'li', ... ['b'] } ] } ] }`
- **When** `renderPrompt(tree, {}, 'xml')`
- **Then** exact output: `<Section title="T">\n1. a\n2. b\n</Section>`
- **And** `forcedFormat` атрибут отсутствует в выводе

**Feature: li → Item/Step** [`contract`] ###`<Step num="1">first</Step>` и `<Step num="2">second</Step>`

**Scenario:** li в unordered List → `<Item>`

- **Given** `<List><li>first</li></List>`
- **When** `renderPrompt(..., {}, 'xml')`
- **Then** `<Item>first</Item>`

**Scenario:** li в MD → transparent

- **Given** `<List ordered><li>first</li></List>`
- **When** `renderPrompt(..., {}, 'md')`
- **Then** `1. first` (без тегов)

**Feature: p transparent** [`contract`]
**Scenario:** p transparent в XML и MD

- **Given** `<Section title="T"><p>text</p></Section>`
- **When** `renderPrompt(..., {}, 'xml')`
- **Then** `<Section title="T">\ntext\n</Section>` (без `<p>` тега)

**Feature: p↔any separator** [`contract`]
**Scenario:** p + p → \n\n

- **Given** `<Section title="T"><p>a</p><p>b</p></Section>`

### T:\n\ntext\n\n`(без`<p>`тега,`\n\n` между p↔section)

### listStep передаётся в рендерер li

- **Given** `<List ordered><li>a</li><Bold>b</Bold></List>`
- **When** рендер в XML
- **Then** `<Step num="1">a</Step>` и `<bold>b</bold>` (Bold — встроенный inline, не получает Step)
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                 | Required by                 |
| --------------------------------------------------------------------------------------- | --------------------------- |
| ### --test prompt-kit/core/**tests**/_.test.ts prompt-kit/elements/**tests**/_.test.ts` | typescript-rules, node-test |
| `npx tsc --noEmit`                                                                      | typescript-rules            |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                | Verification Level | Covered by                            |
| ----------------------- | ------------------ | ------------------------------------- |
| forcedFormat="md" в XML | contract           | elements fixtures: list-forced-format |
| li → Step num=N         | contract           | elements fixtures: li-ordered         |
| li → Item               | contract           | elements fixtures: li-unordered       |
| li → MD transparent     | contract           | elements fixtures: li-ordered (md)    |
| p transparent XML       | contract           | core fixtures: html-tag-p (updated)   |
| p↔any separator         | contract           | core fixtures: html-tag-p (updated)   |
| listStep propagation    | contract           | elements fixtures: li-ordered         |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log (PLAN)

#### P1 — impl

- [ ] Реализовать все 4 изменения в core + elements
- [ ] `tsc --noEmit` pass

#### P2 — test

- [ ] Обновить ожидаемые выводы существующих фикстур
- [ ] Создать новые фикстуры (li-ordered, li-unordered, list-forced-format)
- [ ] Зарегистрировать в elements-fixtures.test.ts
- [ ] Все тесты pass

#### P3 — fix

- [ ] Исправить расхождения после P2
- [ ] Все тесты pass + typecheck pass
<!--/SECTION:EXECUTION_LOG-->

<!--SECTION:DECISION_LOG-->

## 8. Decision Log

N/A — decisions recorded in scope spec D-012 (forcedFormat).

**BDD Review:** все сценарии покрыты спецификацией §3.5 Rendering Reference + FR15/FR17.

<!--/SECTION:DECISION_LOG-->

<!--SECTION:PHASE_P4-->

### P4 — indent

- **Objective:** Добавить отступ children в XmlFormatter.formatElement
- **Rules:**
  - [ai/directives/coding/typescript-rules.xml](ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `prompt-kit/format/xml-formatter.ts` — `formatElement`: префиксить каждую строку children отступом `(depth+1) × 2` пробела
  - `prompt-kit/elements/__tests__/fixtures/list-ordered/expected.html` — добавить отступы
  - `prompt-kit/elements/__tests__/fixtures/list-unordered/expected.html` — добавить отступы
  - `prompt-kit/elements/__tests__/fixtures/li-ordered/expected.html` — добавить отступы
  - `prompt-kit/elements/__tests__/fixtures/li-unordered/expected.html` — добавить отступы
  - `prompt-kit/elements/__tests__/fixtures/list-forced-format/expected.html` — добавить отступы
- **Inputs:** P3 handoff
- **Exit:** все тесты pass
<!--/SECTION:PHASE_P4-->
