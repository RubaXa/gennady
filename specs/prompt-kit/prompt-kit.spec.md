# prompt-kit: Library Specification

<!--SECTION:SCOPE_TYPE-->

## scope-type

library

<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->

## 1. Vision & Primary Goal

Библиотека для декларативного описания промптов через JSX-компоненты. Разработчик собирает сообщение из семантических примитивов, рендерит в XML-подобный формат или Markdown — и отправляет агенту как строку.

<!--/SECTION:VISION-->

<!--SECTION:GOLDEN_DX-->

## 2. Approved Golden DX Example (composition view)

Публичная поверхность собирается из трёх модулей. Полный сценарий — см. usage-примеры каждого модуля.

```tsx
// 1. Описываем промпт — module: elements
//    см. [elements/usage](./elements/elements.spec.md#2-module-usage-example)
import { Prompt, Axiom, List, Code, Bold } from 'gennady/prompt-kit';

// 2. Или создаём свой элемент — module: core
//    см. [core/usage](./core/core.spec.md#2-module-usage-example)
import { definePromptElement } from 'gennady/prompt-kit';

const MyAxiom = definePromptElement<{ id: string }>({
  role: 'section',
  markdown: {
    title: ({ tagName, props }) => `${tagName} \`${props.id}\``,
    includeBoundaryComments: true,
  },
});

const directive = (
  <Prompt keywords="rules, safety">
    <MyAxiom id="AX_1">
      Не менять <Bold>архитектуру</Bold> без подтверждения.
    </MyAxiom>
    <List ordered title="Порядок">
      <Code lang="ts" title="Пример">{`const x = 1`}</Code>
      текст
    </List>
  </Prompt>
);

// 3. Рендерим — module: core
//    Форматеры (module: format) вызываются движком автоматически.
import { renderPrompt } from 'gennady/prompt-kit';

const xml = renderPrompt(directive, {}, 'xml');
const md = renderPrompt(directive, {}, 'md');

// 4. forcedFormat — любой элемент форсирует формат поддерева.
//    В XML-пайплайне <List forcedFormat="md"> рендерит Markdown-список.
//    <li> — встроенный HTML-тег: XML → <Item>/<Step num="N">, MD → transparent.
import { Axiom, List } from 'gennady/prompt-kit';

const protocolDirective = (
  <Axiom id="AX_DIRECT_IMPLEMENTATION_PROTOCOL">
    <p>Mandatory protocol for direct implementations of a contract.</p>
    <List ordered forcedFormat="md">
      <li>Keep the root-level `@purpose` (compressed essence)</li>
      <li>Add `@implements {ContractName} in path` on the root</li>
      <li>Add `@see {ContractName#memberName} in path` on every direct member</li>
    </List>
    <p>These links are mandatory contract edges, not decoration.</p>
  </Axiom>
);

const forcedXml = renderPrompt(protocolDirective, {}, 'xml');
// <Axiom id="AX_DIRECT_IMPLEMENTATION_PROTOCOL">
// Mandatory protocol for direct implementations of a contract.
//
// 1. Keep the root-level `@purpose` (compressed essence);
// 2. Add `@implements {ContractName} in path` on the root;
// 3. Add `@see {ContractName#memberName} in path` on every direct member.
//
// These links are mandatory contract edges, not decoration.
// </Axiom>
```

<!--/SECTION:GOLDEN_DX-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:RENDERING_REFERENCE-->

## 3.5 Rendering Reference (по ролям и контексту)

Ниже — эталонное поведение каждой роли в HTML и Markdown, включая зависимость от вложенности и контекста (внутри list, внутри Group).

**Sibling spacing (разделитель между соседями):** движок выбирает разделитель на основе ролей соседних элементов:

- `section` + `section` → `\n\n` в MD, `\n` в HTML
- `property` + `property` → `\n` в обоих форматах
- `property` + `section` / `section` + `property` → `\n`
- `p` + any или any + `p` → `\n\n` в обоих форматах
- Все остальные комбинации → `\n`

### root

Назначение: корень сообщения. Обрамляет содержимое, выводит keywords.

| Контекст        | HTML                                           | Markdown                        |
| --------------- | ---------------------------------------------- | ------------------------------- |
| Верхний уровень | `<Prompt keywords="a">\n{children}\n</Prompt>` | `## KEYWORDS:\na\n\n{children}` |
| Без keywords    | `<Prompt>\n{children}\n</Prompt>`              | `{children}`                    |

### section

Назначение: заголовок + тело. Влияет на depth. Поддерживает якоря.

| Контекст                         | HTML                                    | Markdown                                                             |
| -------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Верхний уровень                  | `<{tag}>\n{indent}{children}\n</{tag}>` | `# {title}:\n<!--START_{ANCHOR}-->\n{children}\n<!--END_{ANCHOR}-->` |
| depth = N                        | отступ = N×2 пробела                    | `{'#'.repeat(N+1)} {title}:`                                         |
| Внутри list                      | `<{tag}>...</{tag}>` (без отступа)      | `**{title}** — {children}` (строчная форма)                          |
| `includeBoundaryComments: false` | —                                       | без якорей                                                           |
| PascalCase → SNAKE_CASE          | —                                       | `AiKnowledge` → `AI_KNOWLEDGE`, `SddSetup` → `SDD_SETUP`             |

### block

Назначение: блочный элемент (код). Не влияет на depth.

| Контекст        | HTML                                              | Markdown                                         |
| --------------- | ------------------------------------------------- | ------------------------------------------------ |
| Верхний уровень | `<{tag} lang="ts">\n{indent}{children}\n</{tag}>` | `**{title}:**\n\`\`\`{lang}\n{children}\n\`\`\`` |
| Без title       | `<{tag} lang="ts">...</{tag}>`                    | `\`\`\`{lang}\n{children}\n\`\`\``               |
| Без lang        | `<{tag}>...</{tag}>`                              | `\`\`\`\n{children}\n\`\`\``                     |

### inline

Назначение: строчное форматирование. Не влияет на depth, не добавляет переносов.

| Контекст        | HTML                | Markdown   |
| --------------- | ------------------- | ---------- |
| `Bold`          | `<bold>text</bold>` | `**text**` |
| `b` (HTML-тег)  | `<b>text</b>`       | `**text**` |
| `em` (HTML-тег) | `<em>text</em>`     | `*text*`   |

### p (paragraph)

Назначение: блок текста. HTML-тег `p`, transparent в обоих форматах (тег не выводится).

| Контекст          | HTML        | Markdown    |
| ----------------- | ----------- | ----------- |
| Верхний уровень   | `text`      | `text`      |
| `p` + `p`         | `\n\n`      | `\n\n`      |
| `p` + любой сосед | `\n\n`      | `\n\n`      |
| Внутри list       | transparent | transparent |

**Важно:** `p` не участвует в listStep (не имеет роли), не получает авто-пунктуацию списка. Внутри `<List>` дети `<p>` рендерятся как строки списка.

### list

Назначение: контейнер списка. Дети — `<li>` или строки списка с авто-пунктуацией.

| Контекст             | HTML                                                                                 | Markdown                                                                    |
| -------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| ordered              | `<List ordered="true">\n  <Step num="1">a</Step>\n  <Step num="2">b</Step>\n</List>` | ` 1 a;\n 2 b.`                                                              |
| unordered            | `<List>\n  <Item>a</Item>\n  <Item>b</Item>\n</List>`                                | ` - a;\n - b.`                                                              |
| С title              | —                                                                                    | `**{title}:**\n - a;\n - b.`                                                |
| Пунктуация           | —                                                                                    | `;` между элементами, `.` после последнего. Пропуск если уже есть `. ! ? ;` |
| `li` в ordered       | `<Step num="N">text</Step>`                                                          | transparent (text)                                                          |
| `li` в unordered     | `<Item>text</Item>`                                                                  | transparent (text)                                                          |
| `forcedFormat="md"`  | рендерит MD-список внутри XML                                                        | без эффекта                                                                 |
| `forcedFormat="xml"` | без эффекта                                                                          | рендерит XML-список внутри MD                                               |

**Контекстный `listStep`:** при входе в ordered `<List>` TreeWalker инициализирует `ctx.listStep = 1` и инкрементирует для каждого ребёнка. Доступен любому вложенному элементу, `<li>` потребляет по умолчанию для `Step num="N"`.

### property

Назначение: листовой элемент ключ-значение. Не влияет на depth.

| Контекст                  | HTML                                | Markdown                                  |
| ------------------------- | ----------------------------------- | ----------------------------------------- |
| Внутри Group (depth=N)    | `{'  '.repeat(N)}<{is}>text</{is}>` | `- **{is}:** text`                        |
| Верхний уровень (depth=0) | `<{is}>text</{is}>`                 | `- **{is}:** text`                        |
| Соседи                    | разделены `\n` (HTML), `\n` (MD)    | каждый с новой строки                     |
| С `id` пропсом            | `<{is} id="x">text</{is}>`          | `- **{is}:** text` (id не влияет на MD)   |
| Внутри list               | как list-item                       | `- **{is}:** text;` / `- **{is}:** text.` |

**Пример: Group > Node × 2**

Input:

```tsx
<Group is="SddSetup">
  <Node is="File">setup.xml</Node>
  <Node is="Purpose">Создаёт спек.</Purpose>
</Group>
```

HTML:

```html
<SddSetup>
  <File>setup.xml</File>
  <Purpose>Создаёт спек.</Purpose>
</SddSetup>
```

Markdown:

```md
<!--START_SDD_SETUP-->

#### SddSetup:

- **File:** setup.xml
- **Purpose:** Создаёт спек.
<!--END_SDD_SETUP-->
```

**Пример: Node на верхнем уровне (depth=0)**

Markdown:

```md
- **File:** setup.xml
- **Purpose:** Создаёт спек.
```

(Без heading-префикса `#`, без якорей — property не section)

<!--/SECTION:RENDERING_REFERENCE-->

## 3. Requirements & Constraints

### 3.1 Functional Requirements

- **FR1 · Декларация промпта через JSX** — пользователь описывает сообщение деревом JSX-элементов. Корень — один элемент-сообщение (Prompt).
- **FR2 · Мультиформатный рендер** — одно дерево рендерится в `'xml'` и `'md'`. JSON — v2.
- **FR3 · Встроенные примитивы** — Prompt (root), PrimaryGoal / BeliefState / Axiom / HardForbidden / Section / Group (section), List (list), Code (block), Bold (inline), Node (property). Em / Underline / Paragraph / Table / Row / Cell — покрываются FR11 (HTML-теги `em`, `u`, `p`, `table`, `tr`, `td`).
- **FR4 · Пользовательские элементы** — `definePromptElement<Props>(config)` создаёт новый элемент. Движок из конфига знает роль, заголовок, форматирование, якоря.
- **FR5 · Атрибуты элементов** — пропсы типизируются через generic `definePromptElement<Props>`. Движок пробрасывает их в рендер-функции. В xml пропсы сериализуются в атрибуты: строки/числа/булевы — напрямую, объекты/массивы — `JSON.stringify` с последующим XML-экранированием. Функции в пропсах → `Error`.
- **FR6 · Композиция и вложенность** — элементы вкладываются произвольно. Рендер рекурсивный: дети рендерятся раньше родителя, результат передаётся родителю.
- **FR7 · Авто-форматирование движком** — переносы строк, отступы, уровни заголовков (`#` в md) вычисляются движком на основе роли, depth и контекста. Пользователь не пишет `\n` и ` ` вручную.
- **FR8 · Контекстный рендер** — поведение элемента зависит от контекста (внутри списка или нет, уровень вложенности).
- **FR9 · Якоря в Markdown** — секционные элементы с `includeBoundaryComments: true` получают `<!--START_{NAME}-->` / `<!--END_{NAME}-->`. Имя якоря строится из разрешённого имени тега (`props.is || html.tag || element.tagName`), преобразованного из PascalCase в SNAKE*CASE (перед каждой заглавной буквой, кроме первой, вставляется `*`, затем весь результат — upper case). Повторная секция с теми же параметрами — якорь не добавляется.
- **FR10 · Прозрачные компоненты** — обычная функция-компонент (не созданная через `definePromptElement`) не имеет представления: рендерятся только children, пропсы игнорируются.
- **FR11 · Встроенные HTML-теги** — `b`, `em`, `i`, `u`, `strong`, `p`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `li` распознаются движком и рендерятся в соответствии с форматом:
  - xml: as-is, с атрибутами. Текстовое содержимое и значения атрибутов экранируются: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`
  - md: `b` → `**`, `em` → `*`, `table` → markdown-таблица
  - `p`: transparent в обоих форматах (тег не выводится). `p` ↔ любой сосед → `\n\n`
  - `li`: в ordered XML → `<Step num="N">` (N = `ctx.listStep`), unordered XML → `<Item>`. MD — transparent. `listStep` доступен любому вложенному элементу в ordered list (см. FR17)
- **FR12 · Авто-пунктуация списка** — `;` в конце каждого элемента, `.` в конце последнего. Пропускается, если последний символ текста уже является концевым знаком: `.`, `!`, `?`, `;`.
- **FR13 · Динамический HTML-тег через `is`** — любой элемент может переопределить HTML-тег через пропс `is`. Значение `props.is` используется как имя тега и удаляется из атрибутов. Позволяет универсальным элементам (`Group`, `Node`) менять тег в зависимости от данных: `<Group is="Sdd">` → `<Sdd>...</Sdd>`.
- **FR14 · Роль `property`** — листовой элемент ключ-значение. html: `<is>text</is>` в одну строку с отступом по depth. md: `- **is:** text` в одну строку. Не влияет на depth. Соседние property разделяются `\n`. Якоря и heading-префикс не применяются. Внутри list — стандартное поведение list-item.
- **FR15 · `forcedFormat`** — любой элемент (встроенный, пользовательский, HTML-тег) принимает `forcedFormat="md"|"xml"`. Поддерево рендерится в указанном формате независимо от глобального. TreeWalker: детектит пропс → переопределяет `ctx.format` для детей и engine → стрипает пропс из атрибутов. `XmlFormatEngine` и `MdFormatEngine` умеют делегировать в противоположный форматер при несовпадении `ctx.format`. Вложенный `forcedFormat`: внутренний переопределяет внешний (стековая семантика — последний wins).
- **FR17 · `listStep` в RenderContext** — целочисленный счётчик `listStep?: number`. TreeWalker: при входе в ordered `<List>` инициализирует `childCtx.listStep = 1`; для каждого ребёнка (включая встроенные HTML-теги, исключая `section`) инкрементирует `listStep`. Потребляется рендерером `<li>` и доступен любому вложенному элементу через `ctx.listStep`.

### 3.2 Non-Functional Constraints

- **NFR1** — Node.js 22+, zero runtime-зависимостей.
- **NFR2** — Экспортируется через `gennady/prompt-kit`.
- **NFR3** — Рендер синхронный: `renderPrompt(component, props, format) → string`.
- **NFR4** — Толерантность к разным JSX-рантаймам: дерево может быть создано React, Preact или любым совместимым jsx-трансформером. Движок нормализует структуру.
- **NFR5** — Использует существующий `"jsx": "react-jsx"` в tsconfig репозитория. Не требует своего `jsxImportSource`.

### 3.3 Out-of-Scope

- JSON-формат (v2)
- Валидация структуры промпта (обязательные секции, порядок)
- Асинхронные компоненты
- Стриминг-рендер
- Интеграция с AI SDK

### 3.4 Runtime Backing & Deferred Scope

Все возможности — `real-runtime`. Библиотека — чистый строковый рендер, без сетевых вызовов, без персистентности, без trust boundaries.

### 3.5 Rules

| Rule             | Category | Source                                    |
| ---------------- | -------- | ----------------------------------------- |
| typescript-rules | coding   | ai/directives/coding/typescript-rules.xml |

<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:PUBLIC_API_SURFACE-->

## 4. Public API Surface

### Ядро

```ts
const PROMPT_ELEMENT_BRAND = Symbol('prompt-element');

function definePromptElement<Props>(config: PromptElementConfig<Props>): PromptElement<Props>;

function renderPrompt(
  tree: JSXNode | ((props: any) => JSXNode),
  props: Record<string, unknown>,
  format: 'xml' | 'md'
): string;

type PromptElement<Props> = {
  (props: Props): JSXNode;
  [PROMPT_ELEMENT_BRAND]: true;
  tagName: string;
  config: PromptElementConfig<Props>;
};

type JSXNode = {
  type: PromptElement<any> | string | Function;
  props: Record<string, unknown>;
  children?: JSXNode[];
};
```

Рендер различает `PromptElement` (brand symbol) и обычную функцию (transparent): `PromptElement` рендерится по конфигу, обычная функция — прозрачно.

`renderPrompt` оборачивает вызов компонента и рекурсивный обход в try/catch. При ошибке → выбрасывает `Error` с исходной ошибкой как `cause`, префикс `[prompt-kit]`. Частичный вывод не возвращается.

Нормализатор (`JSXTreeNormalizer` в core) приводит любой вход к этому каноническому виду:

- `children` внутри `props.children` → извлекается в `node.children`
- Фрагменты (`Symbol.for('react.fragment')`, `<>...</>`) → плоский массив children
- Примитивы (`string`, `number`, `boolean`) → оборачиваются в текстовый узел
- `null`, `undefined` → узел с пустым children
- `children`-как-аргумент (Preact-стиль) → `node.children`

### PromptElementConfig

```ts
type PromptElementConfig<Props> = {
  role: 'root' | 'section' | 'block' | 'inline' | 'list' | 'property';
  markdown?: {
    title?: (ctx: { tagName: string; props: Props; depth: number }) => string;
    renderChildren?: (ctx: { children: string; props: Props }) => string;
    renderChildElement?: (ctx: { children: string; props: Props; index: number }) => string;
    includeBoundaryComments?: boolean;
  };
  xml?: {
    renderChildren?: (ctx: { children: string; props: Props }) => string;
    renderChildElement?: (ctx: { children: string; props: Props; index: number }) => string;
  };
};
```

Роли:

- `root` — корень сообщения. xml: `<Prompt keywords="...">\n{children}\n</Prompt>`. md: `## KEYWORDS:\n{keywords}\n\n{children}`. Если keywords отсутствует — заголовок/атрибут не выводится.
- `section` — заголовок + тело. Влияет на depth. Внутри списка схлопывается в строчную форму.
- `block` — блочный элемент (код). Не влияет на depth.
- `inline` — строчный. Не влияет на depth, не добавляет переносов.
- `list` — контейнер списка. Дети автоматически становятся строками списка.
- `property` — листовой элемент ключ-значение. Не влияет на depth. Между соседними property — `\n`.

  **Примеры рендеринга в зависимости от роли и контекста:**

  ```tsx
  <Prompt keywords="rules">
    <Section title="Help">текст</Section>
    <List>
      <Node is="Rule">не делать X</Node>
    </List>
  </Prompt>
  ```

  **HTML:**

  ```html
  <Prompt>
    <section title="Help">текст</section>
    <List>
      <Node is="Rule">не делать X</Node>
    </List>
  </Prompt>
  ```

  **Markdown:**

  ```md
  ## KEYWORDS:

  rules

  <!--START_SECTION-->

  # Help:

  текст

  <!--END_SECTION-->

  **Rule:**

  - не делать X.
  ```

  **`property` внутри Group (типичный случай для XML-подобных структур):**

  ```tsx
  <Group is="SddSetup">
    <Node is="File">setup.xml</Node>
    <Node is="Purpose">Создаёт спек.</Node>
  </Group>
  ```

  **HTML:**

  ```html
  <SddSetup>
    <File>setup.xml</File>
    <Purpose>Создаёт спек.</Purpose>
  </SddSetup>
  ```

  **Markdown:**

  ```md
  <!--START_SDD_SETUP-->

  #### SddSetup:

  - **File:** setup.xml
  - **Purpose:** Создаёт спек.
  <!--END_SDD_SETUP-->
  ```

  **`property` вне группы — на верхнем уровне depth 0:**

  **Markdown:**

  ```md
  - **File:** setup.xml
  - **Purpose:** Создаёт спек.
  ```

  (Без heading-префикса `#`, без якорей — property не является section)

### Встроенные примитивы (из коробки)

Все элементы, а также пользовательские элементы через `definePromptElement`, неявно принимают универсальный пропс `forcedFormat?: 'md' | 'xml'` — см. FR15.

| Элемент         | Роль     | Пропсы                                                                                |
| --------------- | -------- | ------------------------------------------------------------------------------------- |
| `Prompt`        | root     | `keywords?: string`                                                                   |
| `PrimaryGoal`   | section  | —                                                                                     |
| `BeliefState`   | section  | —                                                                                     |
| `Axiom`         | section  | `id: string`                                                                          |
| `HardForbidden` | section  | —                                                                                     |
| `Section`       | section  | `title: string`, `id?: string`                                                        |
| `Group`         | section  | `is: string` — имя HTML-тега. `[key: string]: unknown` — доп. атрибуты                |
| `List`          | list     | `ordered?: boolean`, `title?: string`                                                 |
| `Code`          | block    | `lang?: string`, `title?: string`                                                     |
| `Bold`          | inline   | —                                                                                     |
| `Node`          | property | `is: string` — имя HTML-тега. `id?: string`. `[key: string]: unknown` — доп. атрибуты |

### Встроенные HTML-теги (распознаются по строковому имени)

`b`, `em`, `i`, `u`, `strong`, `p`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `li`

<!--/SECTION:PUBLIC_API_SURFACE-->

<!--SECTION:ARCHITECTURE-->

## 5. Architecture

### Поток рендера

```
[tsx-файл] → tsc (react-jsx) → {type, props, children} → renderPrompt() → рекурсивный обход → строка
```

`renderPrompt` вызывает функцию-компонент (или принимает готовое JSX-дерево), получает JSX-дерево, обходит узлы:

1. `node.type` — объект с `Symbol('prompt-element')` → рендер по конфигу
2. `node.type` — строка (`b`, `table`, `em`...) → встроенный рендер
3. `node.type` — функция без brand → прозрачно, рендерятся только children
4. `node.type` — не попадает под 1–3 → `Error('[prompt-kit] unknown element type: <type>')`

Движок передаёт контекст: `depth` (уровень секционной вложенности), `inList` (контекст списка), `listStep` (счётчик ordered list). Элемент на основе контекста выбирает полное или компактное представление.

**XML child indentation:** `XmlFormatter.formatElement` добавляет отступ `(depth+1) × 2` пробела к каждой строке children. Инлайн-элементы (`formatInline`) — без отступа. Строчные children (без `\n`) — без отступа, на одной строке с тегом.

**forcedFormat flow:** TreeWalker при обнаружении `forcedFormat` в `props` переопределяет `ctx.format` для всего поддерева. `XmlFormatEngine` и `MdFormatEngine` содержат по два форматера (`XmlFormatter` + `MdFormatter`) и делегируют в противоположный при несовпадении `ctx.format`. Пропс `forcedFormat` удаляется из атрибутов перед передачей в engine.

### Решения

- **Единая фабрика** — `definePromptElement` вместо отдельных функций под каждую роль. Роль и опциональные рендер-функции — достаточный API.
- **Движок управляет форматированием** — отступы, переносы, пунктуация списка, уровни заголовков. Элемент говорит «что», движок — «как».
- **Толерантность к JSX-деревьям** — не привязаны к конкретному рантайму. Читаем `type`/`props`/`children`, нормализуем.
- **Прозрачные компоненты** — обычные функции-компоненты без `definePromptElement` невидимы в выводе. Позволяют декомпозицию без влияния на результат.

### 5.1 Rejected Alternatives

- **React/Preact как зависимость** — лишний вес для строкового рендера.
- **Свой jsxImportSource** — не нужен: репозиторий уже использует `react-jsx`, prompt-kit читает готовое дерево.
- **Ручное форматирование (`\n`, ` `) в элементах** — плодит баги с отступами, убивает DRY. Движок считает сам.
<!--/SECTION:ARCHITECTURE-->

<!--SECTION:DECISION_LOG-->

## 6. Decision Log

### D-001 — Единая фабрика definePromptElement

- **Status:** active
- **Recorded:** session Discovery, prompt-kit
- **Why:** Одна точка создания элементов с ролью вместо набора фабрик (`defineSection`, `defineInline`, `defineList`). Меньше API, гибче.
- **Risk accepted:** Нет валидации несовместимых комбинаций (например, `role: 'inline'` с `title`).
- **Rejected alternatives:** `defineSection` / `defineInline` / `defineList` — дробит API без выигрыша в типобезопасности.

### D-002 — Движок управляет форматированием

- **Status:** active
- **Recorded:** session Discovery, prompt-kit
- **Why:** Отступы, переносы, пунктуация, уровни заголовков — зона движка. Элемент задаёт семантику, движок — представление. Убирает дублирование и баги с `\n`.
- **Risk accepted:** Сложные структуры могут потребовать ручного управления — тогда `renderChildren` / `renderChildElement` дают точечный контроль.
- **Rejected alternatives:** Каждый элемент сам форматирует — плодит `\n` и ` `, расходится между элементами.

### D-003 — Толерантность к JSX-рантаймам

- **Status:** active
- **Recorded:** session Discovery, prompt-kit
- **Why:** Дерево может быть создано React, Preact, или любым jsx-трансформером. Движок нормализует структуру, не привязан к `$$typeof` или конкретному формату пропсов.
- **Risk accepted:** Глубоко нестандартные рантаймы могут требовать расширения нормализатора.
- **Rejected alternatives:** Привязка к React-дереву — режет потребителей без причины.

### D-004 — Встроенные HTML-теги

- **Status:** active
- **Recorded:** session Discovery, prompt-kit
- **Why:** `b`, `em`, `table`, `tr`, `td` и другие — стандартные имена, которые движок знает из коробки. Пользователь не объявляет их через `definePromptElement`.
- **Risk accepted:** Конфликт имён с пользовательскими элементами (маловероятно — lowercase vs UpperCase).
- **Rejected alternatives:** Объявлять каждый тег явно — boilerplate.

### D-005 — Прозрачные компоненты

- **Status:** active
- **Recorded:** session Discovery, prompt-kit
- **Why:** Обычная функция-компонент не имеет представления в выводе. Позволяет декомпозицию (`MySection = () => <Section>...</Section>`) без влияния на результат.
- **Risk accepted:** Пользователь может ожидать, что его компонент породит тег.
- **Rejected alternatives:** Рендерить имя функции как тег — смешивает декомпозицию и семантику.

### D-006 — Zero runtime dependencies

- **Status:** active
- **Recorded:** session Discovery, prompt-kit
- **Why:** Проектный стандарт (gennady). Чистый строковый рендер не требует внешних библиотек.
- **Risk accepted:** Отсутствие экосистемы плагинов.
- **Rejected alternatives:** Зависимость от React — противоречит цели.

### D-007 — Использование существующего react-jsx

- **Status:** active
- **Recorded:** session Discovery, prompt-kit
- **Why:** Репозиторий уже настроен на `"jsx": "react-jsx"`. Prompt-kit читает готовое дерево, не требует своего `jsxImportSource`. 8 существующих .tsx файлов (agent-mon UI на ink) продолжают работать без изменений.
- **Risk accepted:** При смене jsx-настройки в корневом tsconfig нужно проверить совместимость.
- **Rejected alternatives:** Свой `jsxImportSource` — ломает agent-mon UI.

### D-008 — Экспорт через gennady/prompt-kit

- **Status:** active
- **Recorded:** session Discovery, prompt-kit
- **Why:** Библиотека — часть репозитория, импортируется как `gennady/prompt-kit`.
- **Risk accepted:** Зависимость от основного пакета — при разделении репозиториев потребуется переименование.
- **Rejected alternatives:** Отдельный npm-пакет — усложняет разработку и синхронизацию версий.

### D-009 — Декомпозиция по слоям (core + elements + format)

- **Status:** active
- **Recorded:** session ModuleDecomposition, prompt-kit
- **Why:** Три модуля с чёткими границами: алгоритмы ядра не знают про элементы, элементы не знают про форматы. Расширение (новый примитив, новый формат) — точечное, без каскада.
- **Risk accepted:** Три модуля для небольшой библиотеки — может ощущаться как перебор на старте.
- **Rejected alternatives:** Монолит (всё в одном модуле) — превратится в свалку при добавлении JSON-формата и новых элементов; декомпозиция по ролям (7 модулей) — избыточно для v1.

### D-010 — Динамический HTML-тег через пропс `is`

- **Status:** active
- **Recorded:** session Discovery, prompt-kit, refine
- **Why:** Универсальные элементы `Group` и `Node` должны менять HTML-тег в зависимости от данных (`<Sdd>`, `<File>`). `is` prop решает это без создания отдельного `definePromptElement` для каждого имени тега. `is` потребляется для имени тега и удаляется из атрибутов.
- **Risk accepted:** Пользователь может передать `is` элементу, который не ожидает переопределения тега — тег изменится. Ответственность на пользователе.
- **Rejected alternatives:** `html.tag: ({props}) => props.is` callback — избыточно, `is` универсальнее.

### D-011 — Роль `property` для листовых элементов ключ-значение

- **Status:** active
- **Recorded:** session Discovery, prompt-kit, refine
- **Why:** Node должен рендериться как `- **File:** setup.xml`, а не как `##### File:\n\nsetup.xml`. Section добавляет heading-префикс и двойной перенос строки, что ломает формат. Новая роль `property` рендерит ключ-значение в одну строку, не влияет на depth, разделяет соседей `\n`. Альтернативные варианты (renderChildren override, inline+spacing fix, list role) отвергнуты через alt-opinion — три независимых эксперта подтвердили, что новая роль архитектурно чище.
- **Risk accepted:** Увеличение числа ролей с 5 до 6. Дополнительная ветка в dispatch (TreeWalker + format engines).
- **Rejected alternatives:** renderChildren override (ломает единую ответственность section), inline+spacing fix (ломает Bold и все inline), list role (контекст списка не должен зависеть от узла).

### D-012 — Универсальный `forcedFormat` и cross-engine delegation

- **Status:** active
- **Recorded:** session Discovery, prompt-kit, refine
- **Why:** Пользователь хочет в XML-пайплайне отрендерить отдельный блок (список, код) как Markdown без переключения всего формата. `forcedFormat="md"` на любом элементе решает это без разрыва пайплайна. Оба engine содержат противоположный форматер и делегируют при несовпадении `ctx.format`. Пропс стрипается до передачи в engine.
- **Risk accepted:** Каждый engine аллоцирует второй форматер (память). Рекурсивный `forcedFormat` передаётся вглубь поддерева — дети наследуют формат родителя с `forcedFormat`.
- **Rejected alternatives:** Отдельный `renderPrompt` вызов для поддерева — ломает контекст (depth, inList). Формат-переключатель на уровне pipeline — требует два полных прохода.
<!--/SECTION:DECISION_LOG-->

<!--SECTION:SCOPE_DEPENDENCIES-->

## 7. Scope Dependencies

- **Depends on:** infra-base (TypeScript, prettier, node:test, vite)
- **Provides to:** cli, ai-skills
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->

## 8. Bootstrap Requirements

| Requirement                  | Kind       | Owner           | Resolution                                                          |
| ---------------------------- | ---------- | --------------- | ------------------------------------------------------------------- |
| Экспорт `gennady/prompt-kit` | structural | this-scope-task | Добавить `./prompt-kit` и `./prompt-kit/*` в `exports` package.json |
| Директория `prompt-kit/`     | structural | this-scope-task | Создать корневую директорию                                         |

<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:MODULE_MAP-->

## 9. Module Map

Spec hierarchy is materialized at `specs/prompt-kit/`. Module specs are at `specs/prompt-kit/<module>/<module>.spec.md`.

### 9.1 Modules

- [core](./core/core.spec.md) — ядро: definePromptElement, renderPrompt, обход дерева, нормализация JSX, разрешение элементов
- [elements](./elements/elements.spec.md) — встроенные примитивы: Prompt, PrimaryGoal, BeliefState, Axiom, HardForbidden, Section, List, Code, Bold
- [format](./format/format.spec.md) — движки форматирования: XML, Markdown, отступы, якоря, пунктуация, таблицы

### 9.2 Inter-Module Dependency Map

```mermaid
graph TD
  elements --> core
  core --> format
```

### 9.3 Stack Dependencies

- Languages: TypeScript
- Test frameworks: node:test
<!--/SECTION:MODULE_MAP-->

<!--SECTION:HANDOFF-->

## 10. Handoff to module-decomposition

- **Primary input:** `specs/prompt-kit/prompt-kit.spec.md`
- **Areas requiring decomposition:** decomposition complete — core, elements, format
- **Named abstractions:** `definePromptElement`, `renderPrompt`, `PromptElement`, `PromptElementConfig`, `Prompt`, `PrimaryGoal`, `BeliefState`, `Axiom`, `HardForbidden`, `Section`, `List`, `Code`, `Bold`
- **Bootstrap tickets ready for cascade:** see 8
- **Open risks:** полный набор встроенных HTML-тегов уточнить при реализации
<!--/SECTION:HANDOFF-->
