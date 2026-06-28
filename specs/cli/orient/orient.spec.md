# Module: orient

## 1. Module Vision

Навигация по проекту через file-header разметку (`@file:`, `@tasks:`, `@consumers:`) и DBC-контракты. Карта файлов, поиск по задачам/потребителям/сущностям/ключевым словам, граф зависимостей, поиск по спекам. Код зрелый: S1-S9 хендлеры, DBC-парсер, рендереры.

→ Parent scope: [../../cli/cli.spec.md](../../cli/cli.spec.md) (§3.5 orient DX).

## 2. Entity Inventory (Closed-World)

| Name                 | Type         | Purpose                                                               |
| -------------------- | ------------ | --------------------------------------------------------------------- |
| `orientCommand`      | Function     | Точка входа CLI: парсинг аргументов → диспатч хендлера → рендеринг    |
| `OrientOptions`      | Type         | Опции orient: task, consumer, file, entity, graph, specs, spec, etc.  |
| `OrientContext`      | Value Object | Контекст orient: scanResults, dbcIndex, buildIndex                    |
| `buildIndex`         | Function     | Построение индекса: сканирование файлов → FileEntry[]                 |
| `scanFiles`          | Function     | Рекурсивное сканирование `.ts` файлов в проекте                       |
| `extractHeader`      | Function     | Извлечение file-header из исходного кода                              |
| `queryTask`          | Function     | S2: Поиск файлов по `@tasks:` ID                                      |
| `queryConsumer`      | Function     | S3: Поиск файлов по `@consumers:` имени                               |
| `queryKeyword`       | Function     | S4: Поиск файлов по ключевому слову в `@file:` описании               |
| `queryEntity`        | Function     | S6: Поиск экспортируемой сущности (с fuzzy через Дамерау-Левенштейна) |
| `queryGraph`         | Function     | S7: Построение графа зависимостей (кто что потребляет)                |
| `querySpec`          | Function     | S9: Поиск по конкретной спеке                                         |
| `damerauLevenshtein` | Function     | Расстояние Дамерау-Левенштейна для fuzzy-поиска сущностей             |
| `hints`              | Function     | Генерация контекстных подсказок (что делать дальше)                   |
| `renderTree`         | Function     | S1: Рендеринг карты проекта (дерево директорий + файлы)               |
| `renderFileList`     | Function     | Рендеринг списка файлов с аннотациями                                 |
| `renderDetail`       | Function     | S5: Детальный рендеринг файла (header + exports + DBC-контракты)      |
| `renderSearch`       | Function     | Рендеринг результатов поиска (keyword/entity)                         |
| `renderGraph`        | Function     | Рендеринг графа зависимостей                                          |
| `renderSpecs`        | Function     | S8: Рендеринг обзора всех спек и их задач                             |

## 3. Entity Surfaces

### `orientCommand`

- **Type:** Function
- **Purpose:** Точка входа для `gennady orient`: парсинг аргументов, построение индекса, диспатч S1-S9 хендлеров, рендеринг + hints.
- **Signature:** `(argv: string[]) => Promise<void>`
- **Contract:**
  - Без аргументов → S1 (карта проекта) через `renderTree`
  - `--task=<id>` → S2 (поиск по задаче)
  - `--consumer=<name>` → S3 (поиск потребителей)
  - `<keyword>` (позиционный) → S4 (поиск по ключевым словам)
  - `--file=<path>` → S5 (детальный взгляд на файл)
  - `--entity=<name>` → S6 (поиск сущности)
  - `--graph` → S7 (граф зависимостей)
  - `--specs` → S8 (обзор всех спек)
  - `--spec=<path>` → S9 (поиск по конкретной спеке)
  - `--graph` + `<keyword>` → ошибка (взаимоисключающие)
  - `--file` + `--dir` → ошибка (взаимоисключающие)
  - Файл не существует → stderr `ENOENT`, exit 1
  - Нет совпадений → сообщение в stdout, exit 0
- **Side Effect:** stdout (результаты + hints), stderr (ошибки), process.exit

### `OrientOptions`

- **Type:** Type
- **Purpose:** Структурированные опции orient из `parseArgs`.
- **Public Properties:** `task?: string[]`, `consumer?: string`, `file?: string[]`, `entity?: string`, `graph?: boolean`, `specs?: boolean`, `spec?: string`, `detail?: boolean`, `fuzzy?: boolean`, `dir?: string`, `maxResults?: number`, `keyword?: string`, `recursive?: boolean`

### `OrientContext`

- **Type:** Value Object
- **Purpose:** Результат `buildIndex`: полный набор данных для всех S1-S9 хендлеров.
- **Public Properties:** `files: FileEntry[]`, `specIndex: SpecEntry[]`, `taskIndex: Map<string, FileEntry[]>`, `consumerIndex: Map<string, FileEntry[]>`, `entityIndex: Map<string, EntityEntry[]>`

### `buildIndex`

- **Type:** Function
- **Purpose:** Построение индекса проекта: сканирование `.ts` + `.spec.md` файлов → `OrientContext`.
- **Signature:** `(rootDir: string) => OrientContext`
- **Contract:** Рекурсивное сканирование, исключение `node_modules/`, `dist/`, `.git/`. Парсинг file-header каждого `.ts` файла. Построение индексов: task → files, consumer → files, entity → files.

### `damerauLevenshtein`

- **Type:** Function
- **Purpose:** Вычисление расстояния Дамерау-Левенштейна для fuzzy-поиска сущностей.
- **Signature:** `(a: string, b: string) => number`
- **Contract:** Поддерживает транспозиции соседних символов. Используется `--entity --fuzzy` для поиска с опечатками.

### `hints`

- **Type:** Function
- **Purpose:** Генерация контекстных подсказок после результатов orient.
- **Signature:** `(mode: OrientMode) => string[]`
- **Contract:** Для каждого режима (S1-S9) генерирует релевантные подсказки о следующих действиях.

## 4. CLI Interface

### Аргументы

| Флаг                | Кратко | Описание                                                       |
| ------------------- | ------ | -------------------------------------------------------------- |
| `<keyword>`         | —      | Поиск по ключевому слову в `@file:` описании (позиционный)     |
| `--task=<id>`       | —      | Поиск файлов по ID задачи; repeatable для нескольких ID        |
| `--consumer=<name>` | —      | Поиск файлов, потребляющих указанный модуль                    |
| `--file=<path>`     | —      | Детальный просмотр файла (header + exports + DBC); repeatable  |
| `--entity=<name>`   | —      | Поиск экспортируемой сущности по имени                         |
| `--graph`           | —      | Показать граф зависимостей (кто что потребляет)                |
| `--recursive`       | —      | Для `--graph`: показать транзитивные зависимости               |
| `--specs`           | —      | Обзор всех спек и связанных с ними задач                       |
| `--spec=<path>`     | —      | Поиск файлов, связанных с конкретной спекой                    |
| `--detail`          | —      | Показать экспорты для каждого файла (в карте проекта и поиске) |
| `--fuzzy`           | —      | Включить fuzzy-поиск для `--entity` (Дамерау-Левенштейн)       |
| `--dir=<path>`      | —      | Фильтровать результаты по директории                           |
| `--max-results=<n>` | —      | Ограничить количество результатов                              |

### Golden DX

Полный DX описан в [cli.spec.md §3.5](../../cli/cli.spec.md) (оригинал). Здесь — краткая выжимка ключевых сценариев:

```bash
# --- S1: карта проекта ---
$ gennady orient

# --- S1 + детализация ---
$ gennady orient --detail

# --- S2: поиск по задаче ---
$ gennady orient --task=TSK-01
$ gennady orient --task=TSK-01 --task=TSK-02

# --- S3: поиск потребителей ---
$ gennady orient --consumer=DbcTsLinter

# --- S4: поиск по ключевым словам ---
$ gennady orient "merge conflict"

# --- S5: детальный взгляд на файл ---
$ gennady orient --file=services/dbc/parser/dbc-parser.types.ts

# --- S6: поиск сущности ---
$ gennady orient --entity=DbcJsDocParser
$ gennady orient --entity=DbcJdocParsr --fuzzy

# --- S7: граф зависимостей ---
$ gennady orient --graph
$ gennady orient --graph --recursive

# --- S8: обзор спек ---
$ gennady orient --specs

# --- S9: поиск по спеке ---
$ gennady orient --spec=dbc-linter.spec.md

# --- ошибки взаимоисключения ---
$ gennady orient "keyword" --graph
# Error: positional <keyword> and --graph are mutually exclusive

$ gennady orient --file=src/foo.ts --dir=src/
# Error: --file and --dir are mutually exclusive
```

## 5. Architecture

```
cli/cmd/orient/
├── orient.cmd.ts           # orientCommand: точка входа, parseArgs, диспатч
├── orient.types.ts         # OrientOptions, OrientContext, FileEntry, SpecEntry, etc.
├── help.ts                 # printHelp()
├── index.ts                # import './orient.cmd.ts'
├── core/
│   ├── build-index.ts      # Построение OrientContext из файловой системы
│   ├── damerau-levenshtein.ts  # Расстояние Дамерау-Левенштейна
│   ├── extract-header.ts   # Извлечение file-header из исходного кода
│   ├── hints.ts            # Генерация контекстных подсказок
│   ├── query-consumer.ts   # S3: поиск по @consumers:
│   ├── query-entity.ts     # S6: поиск сущности (с --fuzzy)
│   ├── query-graph.ts      # S7: граф зависимостей
│   ├── query-keyword.ts    # S4: поиск по ключевым словам
│   ├── query-spec.ts       # S9: поиск по спеке
│   ├── query-task.ts       # S2: поиск по @tasks:
│   └── scan-files.ts       # Рекурсивное сканирование .ts файлов
└── render/
    ├── render-detail.ts    # S5: детальный рендеринг файла
    ├── render-file-list.ts # Рендеринг списка файлов
    ├── render-graph.ts     # S7: рендеринг графа
    ├── render-search.ts    # S4/S6: рендеринг результатов поиска
    ├── render-specs.ts     # S8: рендеринг обзора спек
    └── render-tree.ts      # S1: рендеринг карты проекта
```

**Поток выполнения (общий):**

1. `gennady.ts` → динамический импорт `cmd/orient/index.ts`
2. `index.ts` → `orientCommand(process.argv)`
3. `parseArgs(argv)` → `OrientOptions`
4. Валидация взаимоисключающих флагов
5. `buildIndex(rootDir)` → `OrientContext` (единый проход по ФС)
6. Диспатч в соответствующий S1-S9 хендлер на основе опций
7. Рендеринг через соответствующий `render*` модуль
8. `hints(mode)` → контекстные подсказки в stdout
9. stdout/stderr + exit code

**S1 (карта проекта):**

1. `renderTree(ctx.files, opts)` → дерево директорий + файлы с аннотациями
2. `hints('tree')` → подсказки для `--detail`, `--task`, `--consumer`

**S2 (поиск по задаче):**

1. `queryTask(ctx.taskIndex, opts.task)` → FileEntry[]
2. `renderFileList(results, opts)` → список файлов
3. `hints('task')` → подсказки

**S5 (детальный файл):**

1. `extractHeader(file)` → header-аннотации
2. DBC-парсер → экспортируемые сущности с контрактами
3. `renderDetail(file, header, dbcExports)` → полный вывод
4. `hints('detail')` → подсказки

## 6. Decision Log

### D-001 — Единый `OrientContext` вместо N запросов к ФС

- **Status:** active
- **Recorded:** session Discovery, cli/orient
- **Why:** Все S1-S9 хендлеры работают с одним и тем же набором данных. `buildIndex` делает один проход по ФС, строит все индексы. Без этого каждый хендлер сканировал бы ФС заново.
- **Rejected alternatives:** Ленивая загрузка по требованию (проще код, но O(N×M) чтений ФС для нескольких запросов).

### D-002 — Дамерау-Левенштейн для fuzzy-поиска сущностей

- **Status:** active
- **Recorded:** session Discovery, cli/orient
- **Why:** Дамерау-Левенштейн лучше учитывает опечатки (транспозиции соседних символов) чем классический Левенштейн. `DbcJdocParsr` → `DbcJsDocParser` — транспозиция `od` → `do`.
- **Rejected alternatives:** Левенштейн (хуже для опечаток-перестановок), Soundex/Metaphone (для фонетического поиска, не для имён).

### D-003 — Разделение query/render слоёв

- **Status:** active
- **Recorded:** session Discovery, cli/orient
- **Why:** Query-функции (`query*`) — pure: получают данные, возвращают результаты. Render-функции (`render*`) — форматируют вывод. Разделение позволяет тестировать логику поиска отдельно от форматирования.
- **Rejected alternatives:** Монолитные хендлеры (query + render в одной функции — сложнее тестировать).

### D-004 — `--graph` и `<keyword>` — взаимоисключающие

- **Status:** active
- **Recorded:** session Discovery, cli/orient
- **Why:** `--graph` задаёт режим графа зависимостей, `<keyword>` — режим текстового поиска. Одновременное использование не имеет семантики.
- **Rejected alternatives:** Разрешить оба (неясно, что показывать).

### D-005 — `--file` и `--dir` — взаимоисключающие

- **Status:** active
- **Recorded:** session Discovery, cli/orient
- **Why:** `--file` указывает конкретные файлы, `--dir` — фильтр по директории для поискового режима. Семантически несовместимы.
- **Rejected alternatives:** Разрешить оба (конфликт: показать конкретный файл ИЛИ отфильтровать поиск по директории).

### D-006 — Hints как контекстные подсказки «что дальше»

- **Status:** active
- **Recorded:** session Discovery, cli/orient
- **Why:** После каждого режима orient выводит релевантные подсказки: например, после S1 — `--detail`, `--task=<id>`, `<keyword>`. Это направляет пользователя (человека или агента) к следующему действию.
- **Rejected alternatives:** Без подсказок (пользователь не знает что доступно). Статический help после каждого вывода (избыточно).

## 7. File Structure

```
cli/cmd/orient/
├── orient.cmd.ts
├── orient.types.ts
├── help.ts
├── index.ts
├── core/
│   ├── build-index.ts
│   ├── damerau-levenshtein.ts
│   ├── extract-header.ts
│   ├── hints.ts
│   ├── query-consumer.ts
│   ├── query-entity.ts
│   ├── query-graph.ts
│   ├── query-keyword.ts
│   ├── query-spec.ts
│   ├── query-task.ts
│   └── scan-files.ts
└── render/
    ├── render-detail.ts
    ├── render-file-list.ts
    ├── render-graph.ts
    ├── render-search.ts
    ├── render-specs.ts
    └── render-tree.ts
```

## 8. Bootstrap Requirements

| Requirement | Kind        | Owner               | Resolution                |
| ----------- | ----------- | ------------------- | ------------------------- |
| DBC-парсер  | external-fn | services/dbc/parser | ✅ `@services/dbc/parser` |
| `logger`    | external-fn | shared/common       | ✅ `#logger`              |
| `readFile`  | external-fn | shared/common/files | ✅ `#logger` / shared     |

## 9. Handoff to Task Scaffolding

- **Implementation files:** 1 cmd + 1 types + 1 help + 1 index + 10 core + 6 render = 20 исходных файлов
- **Stack dependencies:** TypeScript, node:test, `node:util` (parseArgs), DBC-парсер
- **Named abstractions:** `orientCommand`, `OrientOptions`, `OrientContext`, `buildIndex`, `queryTask/Consumer/Keyword/Entity/Graph/Spec`, `damerauLevenshtein`, `hints`, `renderTree/FileList/Detail/Search/Graph/Specs`
- **Open risks:**
  - `orientCommand` вызывает `process.exit` — тесты должны мокать `process.exit`
  - `buildIndex` делает полный скан ФС — latency на больших проектах
  - DBC-парсер — внешняя зависимость; orient должен gracefully деградировать при его отсутствии
  - Fuzzy-поиск (`--entity --fuzzy`) — O(n²) по количеству сущностей, может быть медленным на больших проектах
  - Файловая структура зрелая (20 файлов) — рефакторинг должен сохранять публичные контракты модулей
