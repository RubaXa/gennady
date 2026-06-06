# Task: TSK-51 — Core module

<!--SECTION:META-->
## 1. Meta
- **Task-ID:** TSK-51
- **Status:** [ ] TODO
- **Purpose:** Реализовать ядро prompt-kit: definePromptElement, renderPrompt, JSXTreeNormalizer, TreeWalker, ElementResolver, HTMLTagRegistry. Покрыть сквозными фикстурами renderPrompt и unit-тестами нормализатор + резолвер.
- **Scope:** prompt-kit
- **Module:** core
- **Dependencies:** TSK-49, TSK-50
- **Spec References:**
  - Module spec: [core](../../specs/prompt-kit/core/core.spec.md)
  - Contract: definePromptElement [§4](../../specs/prompt-kit/core/core.spec.md#definepromptelement)
  - Contract: renderPrompt [§4](../../specs/prompt-kit/core/core.spec.md#renderprompt)
  - Contract: TreeWalker [§4](../../specs/prompt-kit/core/core.spec.md#treewalker)
  - Contract: ElementResolver [§4](../../specs/prompt-kit/core/core.spec.md#elementresolver)
  - Contract: JSXTreeNormalizer [§4](../../specs/prompt-kit/core/core.spec.md#jsxtreenormalizer)
  - Contract: HTMLTagRegistry [§4](../../specs/prompt-kit/core/core.spec.md#htmltagregistry)
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
- **Objective:** Реализовать definePromptElement (brand symbol, config), renderPrompt (try/catch, JSXNode | Function вход), JSXTreeNormalizer (React/Preact/primitives/fragments → каноническая форма + pass-through), TreeWalker (дети→родитель, dispatch: PromptElement→TFormatEngine, html-tag→HTMLTagRegistry, transparent→children, skip→пусто, context propagation depth/inList), ElementResolver (4 категории), HTMLTagRegistry (register/resolve, автонаполнение b/em/i/u/strong/p/table/thead/tbody/tr/th/td), RenderContext, типы. Собрать module barrel.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `prompt-kit/core/types.ts`
  - `prompt-kit/core/define-prompt-element.ts`
  - `prompt-kit/core/render-prompt.ts`
  - `prompt-kit/core/jsx-normalizer.ts`
  - `prompt-kit/core/tree-walker.ts`
  - `prompt-kit/core/element-resolver.ts`
  - `prompt-kit/core/html-tag-registry.ts`
  - `prompt-kit/core/index.ts`
- **Inputs:** none
- **Exit:** `npm run type-check` pass; `import { definePromptElement, renderPrompt } from 'gennady/prompt-kit'` резолвится
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — test
- **Objective:** Сквозные фикстуры renderPrompt (input.tsx → expected.xml + expected.md) — основные сценарии. Unit-тесты: JSXTreeNormalizer (React/Preact/примитивы/pass-through), ElementResolver (все 4 категории + Error), HTMLTagRegistry (register/resolve/перезапись).
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `prompt-kit/core/__tests__/fixtures/transparent-component/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/transparent-component/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/transparent-component/expected.md`
  - `prompt-kit/core/__tests__/fixtures/custom-element/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/custom-element/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/custom-element/expected.md`
  - `prompt-kit/core/__tests__/fixtures/custom-element-props/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/custom-element-props/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/custom-element-props/expected.md`
  - `prompt-kit/core/__tests__/fixtures/react-tree/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/react-tree/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/react-tree/expected.md`
  - `prompt-kit/core/__tests__/fixtures/preact-tree/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/preact-tree/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/preact-tree/expected.md`
  - `prompt-kit/core/__tests__/fixtures/mixed-builtin-custom/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/mixed-builtin-custom/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/mixed-builtin-custom/expected.md`
  - `prompt-kit/core/__tests__/fixtures/unknown-format/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/unknown-format/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/unknown-format/expected.md`
  - `prompt-kit/core/__tests__/fixtures/html-tag-b/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/html-tag-b/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/html-tag-b/expected.md`
  - `prompt-kit/core/__tests__/fixtures/html-tag-em/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/html-tag-em/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/html-tag-em/expected.md`
  - `prompt-kit/core/__tests__/fixtures/html-tag-table/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/html-tag-table/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/html-tag-table/expected.md`
  - `prompt-kit/core/__tests__/fixtures/html-tag-p/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/html-tag-p/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/html-tag-p/expected.md`
  - `prompt-kit/core/__tests__/fixtures/fragment-tree/input.tsx`
  - `prompt-kit/core/__tests__/fixtures/fragment-tree/expected.xml`
  - `prompt-kit/core/__tests__/fixtures/fragment-tree/expected.md`
  - `prompt-kit/core/__tests__/core-fixtures.test.ts` (тест-раннер для всех фикстур)
  - `prompt-kit/core/__tests__/define-prompt-element.test.ts`
  - `prompt-kit/core/__tests__/render-prompt.test.ts`
  - `prompt-kit/core/__tests__/tree-walker.test.ts`
  - `prompt-kit/core/__tests__/tree-walker.test.ts`\  - `prompt-kit/core/__tests__/jsx-normalizer.test.ts`
  - `prompt-kit/core/__tests__/element-resolver.test.ts`
  - `prompt-kit/core/__tests__/html-tag-registry.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все фикстуры проходят; unit-тесты проходят; `node --import tsx --test prompt-kit/core/__tests__/*.test.ts` → pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->
## 4. Acceptance Criteria (BDD)
Contract: see Spec References.

**Feature:** definePromptElement создаёт branded элемент

**Scenario:** Элемент с brand symbol [`contract`]
- **Given** `const El = definePromptElement({ role: 'section' })`
- **When** проверяется `El[Symbol('prompt-element')]`
- **Then** равно `true`

**Scenario:** Прозрачный компонент без brand [`unit`]
- **Given** обычная функция `const Wrapper = (props) => <Section>...</Section>`
- **When** renderPrompt(Wrapper, {}, 'md')
- **Then** тег Wrapper отсутствует в выводе, только Section

**Feature:** renderPrompt рендерит JSX-дерево

**Scenario:** Прямое дерево JSXNode [`unit`]
- **Given** `const tree = <Prompt keywords="test"><PrimaryGoal>цель</PrimaryGoal></Prompt>`
- **When** renderPrompt(tree, {}, 'md')
- **Then** вывод содержит `## KEYWORDS:\ntest` и `## PRIMARY GOAL:\nцель`

**Scenario:** Функция-компонент [`unit`]
- **Given** `const C = (props) => <Prompt keywords={props.kw}>текст</Prompt>`
- **When** renderPrompt(C, { kw: 'hello' }, 'xml')
- **Then** вывод содержит `<Prompt keywords="hello">`

**Scenario:** Ошибка в компоненте → Error с cause [`unit`]
- **Given** компонент, который бросает `throw new Error('boom')`
- **When** renderPrompt(C, {}, 'md')
- **Then** выбрасывается Error с префиксом `[prompt-kit]` и `.cause.message === 'boom'`

**Feature:** JSXTreeNormalizer обрабатывает разные рантаймы

**Scenario:** React-дерево (children в props) [`unit`]
- **Given** `{ type: 'b', props: { children: 'text' } }`
- **When** JSXTreeNormalizer.normalize
- **Then** `{ type: 'b', props: {}, children: ['text'] }`

**Scenario:** Preact-дерево (children аргументом) [`unit`]
- **Given** `{ type: 'em', props: {}, __c: 'text' }`
- **When** normalize
- **Then** `{ type: 'em', props: {}, children: ['text'] }`

**Scenario:** null/undefined → skip [`unit`]
- **Given** `null` или `undefined` в children
- **When** normalize
- **Then** `{ type: undefined, props: {}, children: [] }` → резолвится как 'skip'

**Feature:** ElementResolver классифицирует тип

**Scenario:** PromptElement (brand) → 'prompt-element' [`unit`]
**Scenario:** String ('b', 'table') → 'html-tag' [`unit`]
**Scenario:** Function (без brand) → 'transparent' [`unit`]
**Scenario:** null/undefined type → 'skip' [`unit`]
**Scenario:** Неизвестный тип → Error [`unit`]

**Feature:** TreeWalker — обход и dispatch

**Scenario:** section → formatSection [`unit`]
- **Given** узел с role='section', children='текст'
- **When** TreeWalker обрабатывает узел
- **Then** вызывается TFormatEngine.formatSection с depth + 1 для детей

**Scenario:** list → formatList + inList:true [`unit`]
- **Given** узел с role='list'
- **When** TreeWalker обрабатывает узел
- **Then** вызывается formatList, детям передан inList=true

**Scenario:** block → formatBlock, inline → formatInline [`unit`]
- **Given** узлы с role='block' и role='inline'
- **When** TreeWalker обрабатывает
- **Then** вызываются соответствующие методы TFormatEngine

**Scenario:** transparent → только children [`unit`]
- **Given** узел с категорией 'transparent', children='результат'
- **When** TreeWalker обрабатывает
- **Then** возвращает 'результат' без вызова форматтера

**Scenario:** skip → пустая строка [`unit`]
- **Given** узел с категорией 'skip'
- **When** TreeWalker обрабатывает
- **Then** возвращает пустую строку

**Scenario:** html-tag → HTMLTagRegistry.resolve, null → Error [`unit`]
- **Given** узел с type='nonexistent', не зарегистрированный в registry
- **When** TreeWalker обрабатывает
- **Then** выбрасывается Error('[prompt-kit] unknown HTML tag: nonexistent')

**Feature:** HTMLTagRegistry — реестр тегов

**Scenario:** Автонаполнение при импорте [`unit`]
- **Given** импортирован модуль core
- **When** HTMLTagRegistry.resolve('strong')
- **Then** возвращает renderer (не null)

**Scenario:** resolve для каждого из 11 тегов [`unit`]
- **Given** HTMLTagRegistry
- **When** resolve('b'), resolve('em'), resolve('i'), resolve('u'), resolve('strong'), resolve('p'), resolve('table'), resolve('thead'), resolve('tbody'), resolve('tr'), resolve('th'), resolve('td')
- **Then** все возвращают не-null renderer

**Scenario:** Повторная регистрация перезаписывает [`unit`]
- **Given** registry.register('b', fn1), затем registry.register('b', fn2)
- **When** registry.resolve('b')
- **Then** возвращает fn2

**Scenario:** Незарегистрированный тег → null [`unit`]
- **Given** пустой registry
- **When** registry.resolve('nonexistent')
- **Then** возвращает null

**Feature:** JSXTreeNormalizer — pass-through + фрагменты

**Scenario:** Нераспознанная структура → pass-through [`unit`]
- **Given** `{ type: 'div', props: { x: 1 }, childNodes: ['text'] }`
- **When** normalize
- **Then** узел сохранён как есть, ошибка не бросается

**Scenario:** Fragment → плоский массив [`unit`]
- **Given** `<><Axiom id="1"/>текст</>`
- **When** normalize
- **Then** Fragment-обёртка удалена, children — плоский массив [Axiom, 'текст']

**Feature:** renderPrompt — единое error wrapping

**Scenario:** Ошибка из ElementResolver → [prompt-kit] + cause [`unit`]
- **Given** элемент с неизвестным type (number 42)
- **When** renderPrompt
- **Then** Error с префиксом `[prompt-kit]` и cause от ElementResolver

**Scenario:** Ошибка из TreeWalker → [prompt-kit] + cause [`unit`]
- **Given** незарегистрированный html-tag 'foo'
- **When** renderPrompt
- **Then** Error с префиксом `[prompt-kit]` и cause 'unknown HTML tag: foo'
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## 5. Verification
| Command | Required by |
|---|---|
| `npm run type-check` | typescript-rules |
| `node --import tsx --test prompt-kit/core/__tests__/*.test.ts` | node-test |

- **Completion additions:** Все фикстуры должны проходить
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## 6. Test Scenario Coverage
- Элемент с brand symbol → `prompt-kit/core/__tests__/define-prompt-element.test.ts` :: `brand symbol present`
- Прозрачный компонент → `prompt-kit/core/__tests__/core-fixtures.test.ts` :: `transparent-component`
- Прямое дерево JSXNode → `prompt-kit/core/__tests__/render-prompt.test.ts` :: `direct JSXNode input`
- Функция-компонент → `prompt-kit/core/__tests__/render-prompt.test.ts` :: `function component`
- Ошибка с cause → `prompt-kit/core/__tests__/render-prompt.test.ts` :: `error with cause`
- React-дерево → `prompt-kit/core/__tests__/jsx-normalizer.test.ts` :: `react tree normalization`
- Preact-дерево → `prompt-kit/core/__tests__/jsx-normalizer.test.ts` :: `preact tree normalization`
- null/undefined → `prompt-kit/core/__tests__/jsx-normalizer.test.ts` :: `null/undefined skip`
- PromptElement → `prompt-kit/core/__tests__/element-resolver.test.ts` :: `prompt-element`
- String (html-tag) → `prompt-kit/core/__tests__/element-resolver.test.ts` :: `html-tag`
- Function (transparent) → `prompt-kit/core/__tests__/element-resolver.test.ts` :: `transparent`
- null/undefined → `prompt-kit/core/__tests__/element-resolver.test.ts` :: `skip`
- Unknown type → `prompt-kit/core/__tests__/element-resolver.test.ts` :: `error on unknown`

Фикстурные кейсы (через core-fixtures.test.ts):
- `transparent-component`, `custom-element`, `custom-element-props`, `react-tree`, `preact-tree`, `mixed-builtin-custom`, `fragment-tree`, `unknown-format`, `html-tag-b`, `html-tag-em`, `html-tag-table`, `html-tag-p`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## 7. Execution Log
*(Round = one execute-then-audit attempt.)*

### Round 1 — <YYYY-MM-DD>, initial

#### P1
- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [types.ts, define-prompt-element.ts, render-prompt.ts, jsx-normalizer.ts, tree-walker.ts, element-resolver.ts, html-tag-registry.ts, index.ts]; decisions: [...]; open: [...]

#### P2
- [ ] `<ts>` ver `node --import tsx --test prompt-kit/core/__tests__/*.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [11 fixture sets + 5 unit test files]; decisions: [...]; open: [...]
<!--/SECTION:EXECUTION_LOG-->
