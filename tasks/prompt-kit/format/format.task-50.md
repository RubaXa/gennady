# Task: TSK-50 — Format module

<!--SECTION:META-->
## 1. Meta
- **Task-ID:** TSK-50
- **Status:** [ ] TODO
- **Purpose:** Реализовать движки форматирования XML и Markdown: XmlFormatter, MdFormatter, SpacingEngine, AnchorBuilder, ListPunctuation, TableRenderer. Покрыть фикстурами все критические кейсы форматирования.
- **Scope:** prompt-kit
- **Module:** format
- **Dependencies:** TSK-49
- **Spec References:**
  - Module spec: [format](../../specs/prompt-kit/format/format.spec.md)
  - Contract: XmlFormatter [§5](../../specs/prompt-kit/format/format.spec.md#xmlformatter)
  - Contract: MdFormatter [§5](../../specs/prompt-kit/format/format.spec.md#mdformatter)
  - Contract: SpacingEngine [§5](../../specs/prompt-kit/format/format.spec.md#spacingengine)
  - Contract: AnchorBuilder [§5](../../specs/prompt-kit/format/format.spec.md#anchorbuilder)
  - Contract: ListPunctuation [§5](../../specs/prompt-kit/format/format.spec.md#listpunctuation)
  - Contract: TableRenderer [§5](../../specs/prompt-kit/format/format.spec.md#tablerenderer)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
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
- **Objective:** Реализовать все 6 форматных утилит: XmlFormatter (теги, атрибуты, экранирование, отступы, самозакрывающиеся теги), MdFormatter (заголовки, списки, блоки кода, inline, якоря), SpacingEngine (переносы/отступы по ролям), AnchorBuilder (key-sorted имена, String coercion, дедупликация), ListPunctuation (`;`/`.` с пропуском терминальных знаков), TableRenderer (pipe-таблица, thead/tbody прозрачны, pad при mismatch колонок)
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `prompt-kit/format/xml-formatter.ts`
  - `prompt-kit/format/md-formatter.ts`
  - `prompt-kit/format/spacing-engine.ts`
  - `prompt-kit/format/anchor-builder.ts`
  - `prompt-kit/format/list-punctuation.ts`
  - `prompt-kit/format/table-renderer.ts`
  - `prompt-kit/format/index.ts`
- **Inputs:** none
- **Exit:** `npm run type-check` pass; все 6 утилит экспортируются через `index.ts`
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — test
- **Objective:** Покрыть все критические кейсы форматирования через фикстуры (input.tsx → expected.xml + expected.md). Дополнительно — unit-тесты на граничные значения SpacingEngine, ListPunctuation, TableRenderer, AnchorBuilder.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `prompt-kit/format/__tests__/fixtures/nested-sections/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/nested-sections/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/nested-sections/expected.md`
  - `prompt-kit/format/__tests__/fixtures/section-inside-list/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/section-inside-list/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/section-inside-list/expected.md`
  - `prompt-kit/format/__tests__/fixtures/list-ordered/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/list-ordered/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/list-ordered/expected.md`
  - `prompt-kit/format/__tests__/fixtures/list-unordered/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/list-unordered/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/list-unordered/expected.md`
  - `prompt-kit/format/__tests__/fixtures/list-title/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/list-title/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/list-title/expected.md`
  - `prompt-kit/format/__tests__/fixtures/list-punctuation/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/list-punctuation/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/list-punctuation/expected.md`
  - `prompt-kit/format/__tests__/fixtures/list-nested-sections/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/list-nested-sections/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/list-nested-sections/expected.md`
  - `prompt-kit/format/__tests__/fixtures/code-block/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/code-block/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/code-block/expected.md`
  - `prompt-kit/format/__tests__/fixtures/code-inside-list/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/code-inside-list/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/code-inside-list/expected.md`
  - `prompt-kit/format/__tests__/fixtures/table-basic/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/table-basic/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/table-basic/expected.md`
  - `prompt-kit/format/__tests__/fixtures/table-thead-tbody/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/table-thead-tbody/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/table-thead-tbody/expected.md`
  - `prompt-kit/format/__tests__/fixtures/anchors-section/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/anchors-section/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/anchors-section/expected.md`
  - `prompt-kit/format/__tests__/fixtures/anchors-with-id/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/anchors-with-id/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/anchors-with-id/expected.md`
  - `prompt-kit/format/__tests__/fixtures/anchors-collision/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/anchors-collision/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/anchors-collision/expected.md`
  - `prompt-kit/format/__tests__/fixtures/inline-mixed/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/inline-mixed/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/inline-mixed/expected.md`
  - `prompt-kit/format/__tests__/fixtures/prompt-keywords/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/prompt-keywords/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/prompt-keywords/expected.md`
  - `prompt-kit/format/__tests__/fixtures/empty-children/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/empty-children/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/empty-children/expected.md`
  - `prompt-kit/format/__tests__/fixtures/deep-nesting/input.tsx`
  - `prompt-kit/format/__tests__/fixtures/deep-nesting/expected.xml`
  - `prompt-kit/format/__tests__/fixtures/deep-nesting/expected.md`
  - `prompt-kit/format/__tests__/format-fixtures.test.ts` (тест-раннер: для каждой фикстуры: render → сравнить с expected)
  - `prompt-kit/format/__tests__/spacing-engine.test.ts`
  - `prompt-kit/format/__tests__/list-punctuation.test.ts`
  - `prompt-kit/format/__tests__/table-renderer.test.ts`
  - `prompt-kit/format/__tests__/anchor-builder.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все фикстуры проходят (рендер совпадает с expected в обоих форматах); unit-тесты проходят; `node --import tsx --test prompt-kit/format/__tests__/*.test.ts` → pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->
## 4. Acceptance Criteria (BDD)
Contract: see Spec References.

**Feature:** XmlFormatter рендерит дерево в XML

**Scenario:** Секция с атрибутами и детьми [`unit`]
- **Given** элемент с tag="Axiom", props={id:"AX_1"}, children="текст", depth=1
- **When** XmlFormatter.formatSection вызывается
- **Then** возвращает `  <Axiom id="AX_1">\n    текст\n  </Axiom>`

**Scenario:** Спецсимволы в атрибутах экранируются [`unit`]
- **Given** props={title: "A & B < C"}
- **When** XmlFormatter рендерит атрибут
- **Then** значение экранировано: `title="A &amp; B &lt; C"`

**Scenario:** Пустые дети → самозакрывающийся тег [`unit`]
- **Given** элемент без детей
- **When** XmlFormatter рендерит
- **Then** возвращает `<tag/>`

**Feature:** MdFormatter рендерит секции с заголовками

**Scenario:** Уровень заголовка по depth [`unit`]
- **Given** depth=0, title="PRIMARY GOAL", children="текст"
- **When** MdFormatter.formatSection вызывается
- **Then** заголовок `# PRIMARY GOAL:\n\nтекст`

**Scenario:** Секция внутри списка — строчная форма [`unit`]
- **Given** section-элемент внутри list, title="Axiom"
- **When** MdFormatter рендерит в контексте inList
- **Then** вывод: `**Axiom** — текст`

**Feature:** ListPunctuation ставит корректные знаки

**Scenario:** Последний элемент — точка [`unit`]
- **Given** text="foo", isLast=true
- **When** ListPunctuation.punctuate
- **Then** "foo."

**Scenario:** Уже есть концевой знак — пропуск [`unit`]
- **Given** text="bar!", isLast=false
- **When** ListPunctuation.punctuate
- **Then** "bar!" (без изменений)

**Feature:** TableRenderer конвертирует HTML в Markdown

**Scenario:** Простая таблица [`unit`]
- **Given** table с tr/td 2×2
- **When** TableRenderer.renderToMd
- **Then** `| cell1 | cell2 |\n|-------|-------|\n| cell3 | cell4 |`

**Scenario:** thead/tbody прозрачны [`unit`]
- **Given** table с thead→tr→th и tbody→tr→td
- **When** TableRenderer.renderToMd
- **Then** thead/tbody теги отсутствуют в выводе, таблица корректна

**Feature:** AnchorBuilder строит парные якоря

**Scenario:** Базовый якорь [`unit`]
- **Given** tagName="SECTION", props={title:"Foo"}
- **When** AnchorBuilder.buildStart
- **Then** `<!--START_SECTION_FOO-->`

**Scenario:** Дубликат не выводится [`unit`]
- **Given** повторный вызов с теми же параметрами
- **When** AnchorBuilder.buildStart
- **Then** возвращает пустую строку (якорь уже был)
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## 5. Verification
| Command | Required by |
|---|---|
| `npm run type-check` | typescript-rules |
| `node --import tsx --test prompt-kit/format/__tests__/*.test.ts` | node-test |

- **Completion additions:** Все фикстуры должны проходить — рендер совпадает с expected в обоих форматах
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## 6. Test Scenario Coverage
- Секция с атрибутами и детьми → `prompt-kit/format/__tests__/format-fixtures.test.ts` :: `nested-sections`
- Спецсимволы экранируются → `prompt-kit/format/__tests__/format-fixtures.test.ts` :: `anchors-with-id` (проверяет атрибуты)
- Пустые дети → `prompt-kit/format/__tests__/format-fixtures.test.ts` :: `empty-children`
- Уровень заголовка по depth → `prompt-kit/format/__tests__/format-fixtures.test.ts` :: `nested-sections`
- Секция внутри списка → `prompt-kit/format/__tests__/format-fixtures.test.ts` :: `section-inside-list`
- Последний элемент — точка → `prompt-kit/format/__tests__/list-punctuation.test.ts` :: `last item gets dot`
- Уже есть концевой знак → `prompt-kit/format/__tests__/list-punctuation.test.ts` :: `skip existing punctuation`
- Простая таблица → `prompt-kit/format/__tests__/format-fixtures.test.ts` :: `table-basic`
- thead/tbody прозрачны → `prompt-kit/format/__tests__/format-fixtures.test.ts` :: `table-thead-tbody`
- Базовый якорь → `prompt-kit/format/__tests__/anchor-builder.test.ts` :: `basic anchor`
- Дубликат не выводится → `prompt-kit/format/__tests__/anchor-builder.test.ts` :: `duplicate suppressed`

Фикстурные кейсы (через format-fixtures.test.ts):
- `nested-sections`, `section-inside-list`, `list-ordered`, `list-unordered`, `list-title`, `list-punctuation`, `list-nested-sections`, `code-block`, `code-inside-list`, `table-basic`, `table-thead-tbody`, `anchors-section`, `anchors-with-id`, `anchors-collision`, `inline-mixed`, `prompt-keywords`, `empty-children`, `deep-nesting`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## 7. Execution Log
*(Round = one execute-then-audit attempt.)*

### Round 1 — <YYYY-MM-DD>, initial

#### P1
- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [xml-formatter.ts, md-formatter.ts, spacing-engine.ts, anchor-builder.ts, list-punctuation.ts, table-renderer.ts, index.ts]; decisions: [...]; open: [...]

#### P2
- [ ] `<ts>` ver `node --import tsx --test prompt-kit/format/__tests__/*.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [18 fixture sets + 4 unit test files]; decisions: [...]; open: [...]
<!--/SECTION:EXECUTION_LOG-->
