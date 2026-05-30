# Task: TSK-55 — Команда orient: навигация по file-header и DBC-контрактам

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-55
- **Status:** [ ] TODO
- **Purpose:** Реализовать команду `gennady orient` целиком: инвертированный индекс + extraction хедеров + 9 сценариев поиска (S1-S9) + рендеринг + hints + CLI-обвязка + регистрация; покрыть unit + integration тестами.
- **Scope:** `cli`
- **Module:** `orient`
- **Dependencies:** None (dbc — через scope dependency, уже в Cascade)
- **Spec References:**
  - Scope spec: [cli.spec.md](../../../specs/cli/cli.spec.md)
  - Module section: [cli.spec.md §3.5 orient DX](../../../specs/cli/cli.spec.md#35-orient-dx)
  - Requirements: [cli.spec.md §4.1.5](../../../specs/cli/cli.spec.md#415-orient-functional-requirements)
  - Architecture: [cli.spec.md §5.6 orient](../../../specs/cli/cli.spec.md#56-orient)
  - Decision Log: [cli.spec.md D-009](../../../specs/cli/cli.spec.md#d-009--команда-orient-навигация-по-file-header-и-dbc-контрактам)
  - DBC: [DbcJsDocParser](../../../specs/dbc/dbc-parser/dbc-parser.spec.md)
  - resolve-references: [resolve-references.fn.ts](../../../specs/cli/lint/lint.spec.md#resolvereferences)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** реализовать всю production-логику команды orient: сканирование + индекс + extraction хедеров + 9 query-функций + 6 render-функций + hints + CLI-обвязка + регистрация в gennady.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/orient/index.ts`
  - `cli/cmd/orient/orient.cmd.ts`
  - `cli/cmd/orient/orient.types.ts`
  - `cli/cmd/orient/core/scan-files.ts`
  - `cli/cmd/orient/core/build-index.ts`
  - `cli/cmd/orient/core/extract-header.ts`
  - `cli/cmd/orient/core/query-task.ts`
  - `cli/cmd/orient/core/query-consumer.ts`
  - `cli/cmd/orient/core/query-keyword.ts`
  - `cli/cmd/orient/core/query-entity.ts`
  - `cli/cmd/orient/core/query-graph.ts`
  - `cli/cmd/orient/core/query-spec.ts`
  - `cli/cmd/orient/core/damerau-levenshtein.ts`
  - `cli/cmd/orient/core/hints.ts`
  - `cli/cmd/orient/render/render-file-list.ts`
  - `cli/cmd/orient/render/render-detail.ts`
  - `cli/cmd/orient/render/render-tree.ts`
  - `cli/cmd/orient/render/render-graph.ts`
  - `cli/cmd/orient/render/render-specs.ts`
  - `cli/cmd/orient/render/render-search.ts`
  - `cli/gennady.ts` (добавить `case 'orient'`)
  - `cli/AGENTS.md` (добавить строку `orient`)
  - `cli/cmd/help/help.cmd.ts` (добавить `orient`)
- **Inputs:** none
- **Exit:** tsc pass; `gennady orient` без аргументов выводит карту проекта; `gennady orient --file=<path>` выводит детальный взгляд; все 9 сценариев (S1-S9) отрабатывают без ошибок на тестовом проекте.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** покрыть unit + integration тестами все core-модули, render-функции и CLI-обвязку.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/orient/__tests__/extract-header.test.ts`
  - `cli/cmd/orient/__tests__/scan-files.test.ts`
  - `cli/cmd/orient/__tests__/build-index.test.ts`
  - `cli/cmd/orient/__tests__/damerau-levenshtein.test.ts`
  - `cli/cmd/orient/__tests__/query-task.test.ts`
  - `cli/cmd/orient/__tests__/query-consumer.test.ts`
  - `cli/cmd/orient/__tests__/query-keyword.test.ts`
  - `cli/cmd/orient/__tests__/query-entity.test.ts`
  - `cli/cmd/orient/__tests__/query-graph.test.ts`
  - `cli/cmd/orient/__tests__/query-spec.test.ts`
  - `cli/cmd/orient/__tests__/render-file-list.test.ts`
  - `cli/cmd/orient/__tests__/render-detail.test.ts`
  - `cli/cmd/orient/__tests__/render-tree.test.ts`
  - `cli/cmd/orient/__tests__/render-graph.test.ts`
  - `cli/cmd/orient/__tests__/render-search.test.ts`
  - `cli/cmd/orient/__tests__/render-specs.test.ts`
  - `cli/cmd/orient/__tests__/hints.test.ts`
  - `cli/cmd/orient/__tests__/orient.cmd.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии из section 4 покрыты; `node --test cli/cmd/orient/__tests__/` exit 0.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Контракты: см. Spec References.

---

**Feature: S1 — Карта проекта**

**Scenario:** Агент заходит в проект и видит дерево файлов [`integration`]

- **Given** проект с файлами, размеченными `@file:`, `@tasks:`, `@consumers:`
- **When** агент выполняет `gennady orient`
- **Then** вывод содержит дерево директорий с аннотированными файлами
- **And** каждый файл выводится в формате `path — @file: <purpose> | @tasks: <ids> | @consumers: <names> | @exports: <N>`
- **And** файлы без `@file:` помечены `(missing)`
- **And** вывод завершается блоком Hints

**Scenario:** Агент ограничивает глубину карты [`unit`]

- **Given** проект с вложенностью >2
- **When** агент выполняет `gennady orient --depth=1`
- **Then** глубже первого уровня показывается индикатор `... N more dirs/dir, M files/file`
- **And** индикатор является подузлом с тем же отступом, что и файлы

**Scenario:** Агент включает детализацию экспортов [`integration`]

- **Given** проект с файлами, имеющими DBC-контракты
- **When** агент выполняет `gennady orient --detail`
- **Then** под каждым файлом выводятся экспортируемые сущности с `@purpose`

**Scenario:** Карта с несуществующей директорией [`unit`]

- **Given** несуществующий путь `--dir=/nonexistent`
- **When** агент выполняет `gennady orient --dir=/nonexistent`
- **Then** команда завершается с exit 1 и сообщением об ошибке

---

**Feature: S2 — Файлы по задаче**

**Scenario:** Агент ищет файлы по одному task-id [`unit`]

- **Given** файлы с `@tasks: TSK-01` в проекте
- **When** агент выполняет `gennady orient --task=TSK-01`
- **Then** вывод содержит строку контекста `TSK-01 → task.md → spec.md`
- **And** заголовок `N files:` с последующим списком файлов
- **And** каждый файл в универсальном формате строки

**Scenario:** Агент ищет файлы по нескольким task-id [`unit`]

- **Given** файлы с разными `@tasks:` в проекте
- **When** агент выполняет `gennady orient --task=TSK-01 --task=TSK-02`
- **Then** вывод содержит группировку `TSK-01: file1, file2` / `TSK-02: file1`
- **And** затем полный список файлов

**Scenario:** Task-id не найден [`unit`]

- **Given** в проекте нет файлов с `@tasks: TSK-999`
- **When** агент выполняет `gennady orient --task=TSK-999`
- **Then** вывод: `No files found for TSK-999`
- **And** exit 0

---

**Feature: S3 — Кто потребляет модуль**

**Scenario:** Агент ищет потребителей по имени [`unit`]

- **Given** файлы с `@consumers: DbcTsLinter` в проекте
- **When** агент выполняет `gennady orient --consumer=DbcTsLinter`
- **Then** вывод: `"DbcTsLinter" referenced as consumer by N files:`
- **And** список файлов в универсальном формате

**Scenario:** Поиск потребителя по подстроке [`unit`]

- **Given** файлы с `@consumers: DbcTsLinter, DbcLinter` в проекте
- **When** агент выполняет `gennady orient --consumer=Linter`
- **Then** находятся файлы с обоими consumer-именами

**Scenario:** Consumer не найден [`unit`]

- **Given** в проекте нет файлов с `@consumers: UnknownModule`
- **When** агент выполняет `gennady orient --consumer=UnknownModule`
- **Then** вывод: `"UnknownModule" not found as consumer`
- **And** exit 0

---

**Feature: S4 — Поиск по ключевым словам**

**Scenario:** Агент ищет по ключевым словам в @file: [`unit`]

- **Given** файлы с описаниями, содержащими "contract"
- **When** агент выполняет `gennady orient contract`
- **Then** вывод содержит `"contract" found in N files:`
- **And** список файлов, отсортированный по релевантности (exact match выше prefix)

**Scenario:** Агент ищет с опечаткой через fuzzy [`integration`]

- **Given** файл с `@file:` содержащим "merge"
- **When** агент выполняет `gennady orient merg`
- **Then** Damerau-Levenshtein находит "merge" (расстояние 1)
- **And** файл попадает в результаты с меньшим счётом, чем exact match

**Scenario:** Совпадение в @purpose сущности [`unit`]

- **Given** файл без совпадения в `@file:`, но с сущностью, у которой `@purpose` содержит keyword
- **When** агент выполняет поиск
- **Then** файл показывается с подстрокой `- entity()  @purpose: ...`

**Scenario:** Ключевое слово не найдено [`unit`]

- **Given** в проекте нет описаний с "nonexistent"
- **When** агент выполняет `gennady orient nonexistent`
- **Then** вывод: `"nonexistent" not found`
- **And** exit 0

---

**Feature: S5 — Детальный взгляд на файл**

**Scenario:** Агент смотрит детали конкретного файла [`integration`]

- **Given** файл `dbc-parser.types.ts` с хедером и DBC-контрактами
- **When** агент выполняет `gennady orient --file=dbc-parser.types.ts`
- **Then** вывод содержит блоки `@file:`, `@tasks:`, `@consumers:`, `@exports:`
- **And** под ними — все экспортируемые сущности с полными DBC-тегами (`@purpose`, `@param`, `@returns`, `@throws`, `@implements`)
- **And** для функций показывается сигнатура `имя(параметры): возврат`
- **And** для const/enum/interface — `имя: тип`

**Scenario:** Несколько файлов за раз [`integration`]

- **When** агент выполняет `gennady orient --file=a.ts --file=b.ts`
- **Then** оба файла выводятся последовательно с заголовком-путём

**Scenario:** Файл не существует [`unit`]

- **Given** несуществующий путь
- **When** агент выполняет `gennady orient --file=nonexistent.ts`
- **Then** exit 1, сообщение об ошибке

---

**Feature: S6 — Поиск сущности по имени**

**Scenario:** Агент ищет класс по точному имени [`unit`]

- **Given** файл с экспортом `DbcJsDocParser: class`
- **When** агент выполняет `gennady orient --entity=DbcJsDocParser`
- **Then** вывод: `"DbcJsDocParser" found in 1 file:` → файл → сущность с `@purpose` и `@implements`

**Scenario:** Агент ищет сущность с опечаткой через --fuzzy [`unit`]

- **Given** экспорт `DbcJsDocParser`
- **When** агент выполняет `gennady orient --entity=DbcJdocParsr --fuzzy`
- **Then** Damerau-Levenshtein находит `DbcJsDocParser` (расстояние ≤3)

**Scenario:** Сущность не найдена [`unit`]

- **Given** в проекте нет экспорта `UnknownEntity`
- **When** агент выполняет `gennady orient --entity=UnknownEntity`
- **Then** вывод: `"UnknownEntity" not found`
- **And** exit 0

---

**Feature: S7 — Архитектурный граф**

**Scenario:** Агент смотрит плоский граф зависимостей [`unit`]

- **Given** проект с `@consumers:` разметкой
- **When** агент выполняет `gennady orient --graph`
- **Then** вывод: `Project dependencies:` → группы `ConsumerName consumes:` → список файлов

**Scenario:** Агент смотрит транзитивный граф [`unit`]

- **Given** проект со связанными consumer-ами
- **When** агент выполняет `gennady orient --graph --recursive`
- **Then** вывод: дерево от корневых потребителей вглубь

**Scenario:** --graph и позиционный keyword — взаимоисключающие [`unit`]

- **When** агент выполняет `gennady orient keyword --graph`
- **Then** exit 1, сообщение об ошибке

---

**Feature: S8/S9 — Спеки**

**Scenario:** Агент смотрит обзор всех спек [`unit`]

- **Given** проект с spec-файлами и задачами
- **When** агент выполняет `gennady orient --specs`
- **Then** вывод группирован по spec-файлам: `spec-name → TSK-XX: file.ts`

**Scenario:** Агент ищет по конкретной спеке [`unit`]

- **Given** существующий `dbc-linter.spec.md`
- **When** агент выполняет `gennady orient --spec=dbc-linter.spec.md`
- **Then** вывод: все task-id этой спеки → файлы с аннотациями

**Scenario:** Спека не найдена [`unit`]

- **When** агент выполняет `gennady orient --spec=nonexistent.spec.md`
- **Then** exit 1, сообщение: `spec "nonexistent.spec.md" not found. Use orient --specs for available specs.`

---

**Feature: Hints**

**Scenario:** Каждый сценарий завершается блоком Hints [`contract`]

- **Given** любой вызов `gennady orient`
- **When** команда завершается (успех или нет совпадений)
- **Then** вывод завершается блоком `Hints:` с ≤4 подсказками
- **And** подсказки содержат флаги текущего режима и ссылки на другие режимы

---

**Feature: Инвертированный индекс**

**Scenario:** Индекс строится за один проход [`contract`]

- **Given** N `.ts` файлов в проекте
- **When** выполняется `buildIndex(files)`
- **Then** возвращается `Map<word, Set<{file, source, entity?}>>`
- **And** каждое слово из `@file:` и `@purpose` — ключ в Map
- **And** построение < 100ms для 200 файлов

**Scenario:** Exact match имеет приоритет над prefix в S4 [`contract`]

- **Given** файл A с точным словом "parser" в @file:, файл B с "parsing"
- **When** поиск "parser"
- **Then** файл A выше в результатах (score +10 vs +5)

---

**Feature: Конфликтующие флаги**

**Scenario:** --file и --dir взаимоисключающие [`unit`]

- **When** агент выполняет `gennady orient --file=a.ts --dir=src/`
- **Then** exit 1, сообщение об ошибке

**Scenario:** --specs и --file взаимоисключающие [`unit`]

- **When** агент выполняет `gennady orient --specs --file=a.ts`
- **Then** exit 1

---

**Feature: Damerau-Levenshtein**

**Scenario:** Точное совпадение — расстояние 0 [`contract`]

- **Given** строки "contract" и "contract"
- **When** вычисляется расстояние
- **Then** результат = 0

**Scenario:** Перестановка соседних символов [`contract`]

- **Given** строки "contract" и "contract" (переставлены 't' и 'c')
- **When** вычисляется расстояние
- **Then** результат = 1 (одна транспозиция)

**Scenario:** Вставка символа [`contract`]

- **Given** строки "cat" и "cart"
- **When** вычисляется расстояние
- **Then** результат = 1

**Scenario:** Удаление символа [`contract`]

- **Given** строки "cart" и "cat"
- **When** вычисляется расстояние
- **Then** результат = 1

**Scenario:** Порог для коротких слов ≤2 [`contract`]

- **Given** слово "cat" (3 символа, ≤5)
- **When** запрос "caz" (расстояние 2)
- **Then** считается совпадением

**Scenario:** Порог для длинных слов ≤3 [`contract`]

- **Given** слово "implementation" (14 символов, >5)
- **When** запрос "implementaton" (расстояние 2)
- **Then** считается совпадением

---

**Feature: S1 -- Карта проекта (продолжение)**

**Scenario:** Scan-files исключает нерелевантные директории [`unit`]

- **Given** проект с `node_modules/`, `.git/`, `dist/`, `coverage/`, `build/`, `out/`, `.hidden/`
- **When** `scanFiles(cwd)` обходит директорию
- **Then** все эти директории исключены из результата
- **And** файлы `.ts` из обычных директорий попадают в результат

**Scenario:** Scan-files обрабатывает EACCES без падения [`unit`]

- **Given** директория без прав на чтение
- **When** `scanFiles(cwd)` пытается её обойти
- **Then** ошибка доступа не прерывает сканирование остальных директорий

**Scenario:** Карта с --max-results и переполнением [`unit`]

- **Given** проект с 60 файлами
- **When** агент выполняет `gennady orient --max-results=30`
- **Then** вывод содержит ровно 30 файлов
- **And** завершается строкой `... 30 more files`

**Scenario:** Карта пустого проекта [`unit`]

- **Given** директория без `.ts` файлов
- **When** агент выполняет `gennady orient`
- **Then** вывод: сообщение об отсутствии файлов
- **And** exit 0

**Scenario:** Индикатор глубины с singular/plural [`unit`]

- **Given** директория с 1 файлом и 1 поддиректорией за пределом --depth
- **When** агент выполняет `gennady orient --depth=1`
- **Then** индикатор: `... 1 more dir, 1 file` (singular, не "1 dirs, 1 files")

**Scenario:** --dir ограничивает область сканирования [`integration`]

- **Given** проект с поддиректорией `services/dbc/`
- **When** агент выполняет `gennady orient --dir=services/dbc/`
- **Then** карта показывает только файлы внутри `services/dbc/`

---

**Feature: S2 -- Файлы по задаче (продолжение)**

**Scenario:** Резолв task-id через resolve-references [`integration`]

- **Given** файл с `@tasks: TSK-04` и существующий `tasks/dbc/dbc-linter.task-04.md`
- **When** агент выполняет `gennady orient --task=TSK-04`
- **Then** вывод содержит строку `TSK-04 -> tasks/dbc/.../task-04.md -> specs/dbc/.../spec.md`
- **And** resolve-references.fn.ts корректно резолвит цепочку

**Scenario:** S2 с --detail показывает exports [`integration`]

- **Given** файлы с DBC-контрактами в выборке по задаче
- **When** агент выполняет `gennady orient --task=TSK-01 --detail`
- **Then** под каждым файлом выводятся экспортируемые сущности с `@purpose`

---

**Feature: S3 -- Кто потребляет модуль (продолжение)**

**Scenario:** Несколько --consumer с группировкой [`unit`]

- **Given** файлы с разными `@consumers:` в проекте
- **When** агент выполняет `gennady orient --consumer=A --consumer=B`
- **Then** вывод содержит группировку `A: file1, file2` / `B: file1, file3`
- **And** затем полный список файлов

**Scenario:** --fuzzy с --consumer [`unit`]

- **Given** файл с `@consumers: DbcTsLinter`
- **When** агент выполняет `gennady orient --consumer=DbcTsLintr --fuzzy`
- **Then** Damerau-Levenshtein находит `DbcTsLinter` (расстояние 1)

**Scenario:** S3 с --detail показывает exports [`integration`]

- **Given** файлы с DBC-контрактами в выборке по consumer
- **When** агент выполняет `gennady orient --consumer=DbcTsLinter --detail`
- **Then** под каждым файлом выводятся экспортируемые сущности

---

**Feature: S4 -- Поиск по ключевым словам (продолжение)**

**Scenario:** Multi-word запрос (AND-семантика) [`unit`]

- **Given** индекс со словами "merge" (файл A) и "conflict" (файл B), и "merge"+"conflict" (файл C)
- **When** агент выполняет `gennady orient "merge conflict"`
- **Then** запрос разбивается на токены "merge" и "conflict"
- **And** файл должен содержать ОБА слова (AND), т.е. файл C в результате
- **And** файлы A и B (только одно слово) не в результате или с низким приоритетом

**Scenario:** Prefix match (счёт +5) [`unit`]

- **Given** файл A со словом "purposeful" в @file:, файл B со словом "purpose"
- **When** поиск "purp" (префикс для "purpose", "purposeful")
- **Then** оба файла в результате, файл B выше (exact у "purpose" даёт +10)

**Scenario:** Все три уровня скоринга в одном результате [`unit`]

- **Given** файл A с exact "parse", файл B с "parsing", файл C с "parze" (DL=1)
- **When** поиск "parse"
- **Then** порядок: A (exact +10), B (prefix +5), C (DL +3)

**Scenario:** Пустой или whitespace-only keyword [`unit`]

- **When** агент выполняет `gennady orient ""` или `gennady orient "   "`
- **Then** команда ведёт себя как S1 (карта проекта) или ошибка с пояснением

**Scenario:** S4 с --detail показывает exports [`integration`]

- **Given** результаты keyword search с DBC-контрактами
- **When** агент выполняет `gennady orient contract --detail`
- **Then** под каждым файлом выводятся экспортируемые сущности

---

**Feature: S5 -- Детальный взгляд на файл (продолжение)**

**Scenario:** Файл без @file: хедера [`unit`]

- **Given** файл без `// @file:` в хедере
- **When** агент выполняет `gennady orient --file=bad.ts`
- **Then** в блоке хедера: `@file: (missing)`

**Scenario:** Файл без экспортов [`unit`]

- **Given** файл с хедером, но без экспортируемых сущностей
- **When** агент выполняет `gennady orient --file=empty.ts`
- **Then** вывод содержит хедер, поле `@exports: 0`, без списка сущностей

**Scenario:** Файл без @tasks: и @consumers: [`unit`]

- **Given** файл только с `@file:` в хедере
- **When** агент выполняет `gennady orient --file=minimal.ts`
- **Then** `@tasks:` и `@consumers:` не выводятся (отсутствуют в хедере)

**Scenario:** Класс с методами в детальном выводе [`unit`]

- **Given** файл с экспортом `class MyService` с методами `init()` и `run()`
- **When** агент выполняет `gennady orient --file=service.ts`
- **Then** класс показан как `MyService: class` с `@purpose`
- **And** методы класса показаны под классом с их DBC-контрактами

**Scenario:** Все DBC-теги по отдельности [`unit`]

- **Given** сущности: одна с `@throws`, другая с `@sideEffect`, третья с `@invariant`
- **When** агент выполняет `gennady orient --file=contracts.ts`
- **Then** каждый тег отрендерен в соответствующем формате

---

**Feature: S6 -- Поиск сущности по имени (продолжение)**

**Scenario:** Сущность с одинаковым именем в нескольких файлах [`unit`]

- **Given** `utils.ts` и `helpers.ts` оба экспортируют `parse()`
- **When** агент выполняет `gennady orient --entity=parse`
- **Then** вывод: `"parse" found in 2 files:` с обоими файлами

**Scenario:** Несколько --entity за раз [`unit`]

- **When** агент выполняет `gennady orient --entity=parse --entity=validate`
- **Then** результаты для каждого entity разделены

**Scenario:** Методы класса НЕ находятся по --entity [`unit`]

- **Given** файл с `export class Foo { bar() {} }` (bar не экспортирован отдельно)
- **When** агент выполняет `gennady orient --entity=bar`
- **Then** `"bar" not found` (методы класса не являются экспортируемыми сущностями)

**Scenario:** --fuzzy граница для коротких имён сущностей [`unit`]

- **Given** экспорт с именем "run" (3 символа, порог <=2)
- **When** агент выполняет `gennady orient --entity=rz --fuzzy`
- **Then** DL расстояние >2 -> нет совпадения

**Scenario:** --fuzzy граница для длинных имён сущностей [`unit`]

- **Given** экспорт "DbcContractMatchValidator" (25 символов, порог <=3)
- **When** агент выполняет `gennady orient --entity=DbcContractMatcValidator --fuzzy`
- **Then** DL расстояние 2 <=3 -> совпадение найдено

---

**Feature: S7 -- Архитектурный граф (продолжение)**

**Scenario:** --graph --recursive с ограничением глубины [`unit`]

- **Given** цепочка consumer A -> B -> C -> D -> E
- **When** агент выполняет `gennady orient --graph --recursive --depth=2`
- **Then** дерево раскрыто до глубины 2, узлы глубже не показаны
- **And** на глубине 2 индикатор `... N more`

**Scenario:** Циклические consumer-зависимости не зацикливаются [`unit`]

- **Given** файл A с `@consumers: B`, файл B с `@consumers: A`
- **When** агент выполняет `gennady orient --graph --recursive`
- **Then** цикл обнаруживается, вывод не зацикливается
- **And** циклическая связь помечена (например, `[circular]`)

**Scenario:** Пустой граф (нет consumer-ов) [`unit`]

- **Given** проект без `@consumers:` в любом файле
- **When** агент выполняет `gennady orient --graph`
- **Then** вывод: `No consumer dependencies found`

**Scenario:** Consumer-имя не совпадает с именем файла [`unit`]

- **Given** файл с `@consumers: ExternalTool, SomeService`
- **When** агент выполняет `gennady orient --graph`
- **Then** `ExternalTool` показан как текстовый узел (не резолвится в файл)
- **And** `SomeService` резолвится в соответствующий файл если существует

---

**Feature: S8/S9 -- Спеки (продолжение)**

**Scenario:** Library-level spec без прямых задач [`unit`]

- **Given** `dbc.spec.md` без собственных `@tasks:`, но с под-спеками
- **When** агент выполняет `gennady orient --specs`
- **Then** вывод: `dbc.spec.md` с пометкой `(library-level spec -- 2 sub-specs below)`

---

**Feature: Hints (продолжение)**

**Scenario:** Формат Hints содержит правильные токены [`contract`]

- **Given** любой вывод с Hints
- **When** парсим блок Hints
- **Then** все строки используют синтаксис `<cmd> --flag=<value>` или `--flag`
- **And** `<cmd>` заменён на `orient`

---

**Feature: Конфликтующие флаги (продолжение)**

**Scenario:** Все конфликтующие комбинации --specs [`unit`]

- **When** агент выполняет `gennady orient --specs --task=T1` или `--specs --consumer=C` или `--specs --entity=E` или `--specs --graph`
- **Then** exit 1 с сообщением о несовместимости

**Scenario:** Все конфликтующие комбинации --spec [`unit`]

- **When** агент выполняет `gennady orient --spec=S --file=F` или `--spec=S --task=T` или `--spec=S --consumer=C` или `--spec=S --entity=E` или `--spec=S --graph`
- **Then** exit 1 с сообщением о несовместимости

**Scenario:** --fuzzy без --entity/--consumer — поведение [`unit`]

- **When** агент выполняет `gennady orient --fuzzy`
- **Then** флаг молча игнорируется (no-op) или выдаётся предупреждение

---

**Feature: Damerau-Levenshtein (продолжение)**

**Scenario:** Порог на границе: слово ровно 5 символов [`contract`]

- **Given** слово "parse" (5 символов)
- **When** запрос "parxe" (расстояние 2)
- **Then** расстояние 2 <= 2 -> совпадение (5 символов считается "коротким")
- **When** запрос "parxx" (расстояние 3)
- **Then** расстояние 3 > 2 -> НЕ совпадение
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                 | Required by      |
| --------------------------------------- | ---------------- |
| `npx tsc --noEmit`                      | typescript-rules |
| `npm run lint:contracts`                | typescript-rules |
| `node --test cli/cmd/orient/__tests__/` | node-test        |

- **Task-specific Completion additions:** все файлы должны иметь `// @file:`, `// @consumers:`, `// @tasks: TSK-55` в хедере; `cli/gennady.ts` — добавить `case 'orient'` в switch; `cli/AGENTS.md` — добавить строку `orient`; `cli/cmd/help/help.cmd.ts` — добавить `orient`.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

### Contract-level

- `buildIndex(files) -> Map<word, Set<FileWordRef>>` -> `build-index.test.ts :: contract index type`
- `extractHeader(content) -> FileHeader` -> `extract-header.test.ts :: contract header type`
- `damerauLevenshtein(a, b) -> number` -> `damerau-levenshtein.test.ts :: contract distance type`
- Score priority (exact > prefix > fuzzy) -> `query-keyword.test.ts :: contract score priority`
- Hints <=4 per scenario -> `hints.test.ts :: contract hints count`
- Hints token format (`<cmd>`, `--flag=<value>`) -> `hints.test.ts :: contract hints token format`
- DL boundary at 5 chars (short vs long threshold) -> `damerau-levenshtein.test.ts :: contract boundary word length 5`

### Unit-level

**S1 -- Карта проекта**

- S1: depth indicator -> `render-tree.test.ts :: render tree with depth`
- S1: depth singular/plural -> `render-tree.test.ts :: depth singular plural`
- S1: --max-results overflow -> `orient.cmd.test.ts :: max results overflow`
- S1: scan-files excluded dirs -> `scan-files.test.ts :: excluded dirs`
- S1: scan-files EACCES -> `scan-files.test.ts :: permission error`
- S1: scan-files empty project -> `scan-files.test.ts :: empty project`
- S1: scan-files .ts + .tsx filter -> `scan-files.test.ts :: extension filter`
- S1: scan-files dir not found -> `scan-files.test.ts :: dir not found`

**S2 -- Файлы по задаче**

- S2: single task-id -> `query-task.test.ts :: single task`
- S2: multiple task-ids -> `query-task.test.ts :: multiple tasks`
- S2: task not found -> `query-task.test.ts :: task not found`

**S3 -- Потребители**

- S3: exact consumer -> `query-consumer.test.ts :: exact consumer`
- S3: substring consumer -> `query-consumer.test.ts :: substring consumer`
- S3: consumer not found -> `query-consumer.test.ts :: consumer not found`
- S3: multiple consumers group -> `query-consumer.test.ts :: multiple consumers group`
- S3: --fuzzy with consumer -> `query-consumer.test.ts :: fuzzy consumer`

**S4 -- Поиск по ключевым словам**

- S4: exact keyword -> `query-keyword.test.ts :: exact keyword`
- S4: fuzzy keyword -> `query-keyword.test.ts :: fuzzy keyword`
- S4: keyword not found -> `query-keyword.test.ts :: keyword not found`
- S4: match in @purpose -> `query-keyword.test.ts :: purpose match`
- S4: prefix match -> `query-keyword.test.ts :: prefix match`
- S4: multi-word AND -> `query-keyword.test.ts :: multi-word AND`
- S4: three-level scoring order -> `query-keyword.test.ts :: scoring order`
- S4: empty/whitespace keyword -> `query-keyword.test.ts :: empty keyword`

**S5 -- Детальный взгляд**

- S5: file without @file: -> `render-detail.test.ts :: missing header`
- S5: file without exports -> `render-detail.test.ts :: no exports`
- S5: file without @tasks/@consumers -> `render-detail.test.ts :: minimal header`
- S5: class with methods -> `render-detail.test.ts :: class entity`
- S5: all DBC tags isolated -> `render-detail.test.ts :: all dbc tags`

**S6 -- Поиск сущности**

- S6: exact entity -> `query-entity.test.ts :: exact entity`
- S6: fuzzy entity -> `query-entity.test.ts :: fuzzy entity`
- S6: entity not found -> `query-entity.test.ts :: entity not found`
- S6: entity in multiple files -> `query-entity.test.ts :: multi-file entity`
- S6: repeatable --entity -> `query-entity.test.ts :: multiple entities`
- S6: class method NOT found -> `query-entity.test.ts :: class method excluded`
- S6: fuzzy boundary short name -> `query-entity.test.ts :: fuzzy boundary short`
- S6: fuzzy boundary long name -> `query-entity.test.ts :: fuzzy boundary long`

**S7 -- Архитектурный граф**

- S7: flat graph -> `query-graph.test.ts :: flat graph`
- S7: recursive graph -> `query-graph.test.ts :: recursive graph`
- S7: recursive with --depth -> `query-graph.test.ts :: recursive graph with depth`
- S7: circular consumers -> `query-graph.test.ts :: circular dependencies`
- S7: empty graph -> `query-graph.test.ts :: empty graph`
- S7: consumer as text -> `query-graph.test.ts :: unresolved consumer`
- S7: render flat -> `render-graph.test.ts :: flat render`
- S7: render recursive -> `render-graph.test.ts :: recursive render`

**S8/S9 -- Спеки**

- S8: specs overview -> `query-spec.test.ts :: specs overview`
- S9: spec search -> `query-spec.test.ts :: spec search`
- S9: spec not found -> `query-spec.test.ts :: spec not found`
- S9: library-level spec -> `query-spec.test.ts :: library spec`

**Render**

- S4: render search with entity match -> `render-search.test.ts :: entity match render`
- S5: render detail full output -> `render-detail.test.ts :: full detail render`
- S8/S9: render specs overview -> `render-specs.test.ts :: specs overview render`
- S8/S9: render spec search -> `render-specs.test.ts :: spec search render`
- File list format -> `render-file-list.test.ts :: file line format`

**CLI integration**

- File not found -> `orient.cmd.test.ts :: file not found`
- Multiple files -> `orient.cmd.test.ts :: multiple files`
- Conflicting: --file + --dir -> `orient.cmd.test.ts :: file dir conflict`
- Conflicting: --graph + keyword -> `orient.cmd.test.ts :: graph keyword conflict`
- Conflicting: --specs + --file -> `orient.cmd.test.ts :: specs file conflict`
- Conflicting: --specs + --task/--consumer/--entity/--graph -> `orient.cmd.test.ts :: specs all conflicts`
- Conflicting: --spec + --file/--task/--consumer/--entity/--graph -> `orient.cmd.test.ts :: spec all conflicts`
- Conflicting: --fuzzy alone (no-op) -> `orient.cmd.test.ts :: fuzzy noop`

**Damerau-Levenshtein**

- DL: exact match -> `damerau-levenshtein.test.ts :: exact distance 0`
- DL: transpose -> `damerau-levenshtein.test.ts :: transpose distance 1`
- DL: insert -> `damerau-levenshtein.test.ts :: insert distance 1`
- DL: delete -> `damerau-levenshtein.test.ts :: delete distance 1`
- DL: short threshold <=2 -> `damerau-levenshtein.test.ts :: short threshold pass`
- DL: long threshold <=3 -> `damerau-levenshtein.test.ts :: long threshold pass`

### Integration-level

- S1: map integration -> `orient.cmd.test.ts :: map integration`
- S2: resolve-references -> `orient.cmd.test.ts :: resolve references integration`
- S1: map with --detail -> `orient.cmd.test.ts :: map with detail`
- S2: task with --detail -> `orient.cmd.test.ts :: task with detail`
- S3: consumer with --detail -> `orient.cmd.test.ts :: consumer with detail`
- S4: keyword with --detail -> `orient.cmd.test.ts :: keyword with detail`
- S5: file detail -> `orient.cmd.test.ts :: file detail integration`
- S5: multiple files detail -> `orient.cmd.test.ts :: multiple files detail`
- S1: --dir scope -> `orient.cmd.test.ts :: dir scope integration`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-30, initial

#### P1

- [x] `2026-05-30T13:52:38Z` intro OrientCommand ← реализация команды orient: сканирование, парсинг хедеров и DBC, 9 сценариев поиска
- [x] `2026-05-30T13:52:38Z` intro extractEntities ← regex-based extraction экспортируемых сущностей из .ts исходников
- [x] `2026-05-30T13:52:38Z` intro inverted index ← Map<word, Set<FileWordRef>> для S4 keyword search с трехуровневым скорингом
- [x] `2026-05-30T13:52:38Z` intro DamerauLevenshtein ← fuzzy matching с адаптивным порогом (≤2 для коротких слов, ≤3 для длинных)
- [x] `2026-05-30T13:52:38Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-30T13:52:38Z` DONE
      **Handoff →** artifacts: [cli/cmd/orient/index.ts, cli/cmd/orient/orient.cmd.ts, cli/cmd/orient/orient.types.ts, cli/cmd/orient/help.ts, cli/cmd/orient/core/scan-files.ts, cli/cmd/orient/core/build-index.ts, cli/cmd/orient/core/extract-header.ts, cli/cmd/orient/core/query-task.ts, cli/cmd/orient/core/query-consumer.ts, cli/cmd/orient/core/query-keyword.ts, cli/cmd/orient/core/query-entity.ts, cli/cmd/orient/core/query-graph.ts, cli/cmd/orient/core/query-spec.ts, cli/cmd/orient/core/damerau-levenshtein.ts, cli/cmd/orient/core/hints.ts, cli/cmd/orient/render/render-file-list.ts, cli/cmd/orient/render/render-detail.ts, cli/cmd/orient/render/render-tree.ts, cli/cmd/orient/render/render-graph.ts, cli/cmd/orient/render/render-specs.ts, cli/cmd/orient/render/render-search.ts, cli/gennady.ts, cli/AGENTS.md, cli/cmd/help/help.cmd.ts]; decisions: [module-system=esm, parser=DbcJsDocParser, entity-extraction=regex-export, scan-excludes=node_modules+hidden+system-dirs]; open: [P2: test coverage for all 9 scenarios and core/render modules]

#### P2

- [x] `2026-05-30T14:14:31Z` intro ExtractHeaderTest ← 10 cases: contract type, @file:, @tasks: single/multi/separators/filter, @consumers:, import-stop, missing-tags, empty-content
- [x] `2026-05-30T14:14:31Z` intro ScanFilesTest ← 8 cases: excluded dirs, hidden dirs, extension filter, EACCES, empty project, sorted, nested, dir not found
- [x] `2026-05-30T14:14:31Z` intro BuildIndexTest ← 8 cases: contract type, @file: words, @purpose words, empty header, no @purpose, description fallback, lowercase normalization, single-char filter
- [x] `2026-05-30T14:14:31Z` intro DamerauLevenshteinTest ← 13 cases: distance type, exact=0, transpose=1, insert=1, delete=1, short threshold pass, short threshold fail, long threshold pass, long threshold fail, boundary word length 5 (pass/fail), fuzzyDistance
- [x] `2026-05-30T14:14:31Z` intro QueryTaskTest ← 5 cases: empty, single task, multiple tasks grouped, task not found, duplicate task IDs
- [x] `2026-05-30T14:14:31Z` intro QueryConsumerTest ← 6 cases: empty, exact, substring case-insensitive, not found, multiple consumers group, fuzzy
- [x] `2026-05-30T14:14:31Z` intro QueryKeywordTest ← 10 cases: empty query, exact keyword, fuzzy keyword, keyword not found, purpose match, prefix match, multi-word AND, scoring order (exact>prefix>fuzzy), contract score priority, empty/whitespace keyword
- [x] `2026-05-30T14:14:31Z` intro QueryEntityTest ← 9 cases: empty, exact, not found, fuzzy, multi-file, multiple entities, fuzzy boundary short fail, fuzzy boundary long pass, class method excluded
- [x] `2026-05-30T14:14:31Z` intro QueryGraphTest ← 7 cases: flat graph, empty graph, unresolved consumer, resolved consumer, recursive graph, recursive with depth limit, circular dependencies
- [x] `2026-05-30T14:14:31Z` intro QuerySpecTest ← 5 cases: specs overview, empty specs dir, library spec, spec search, spec not found
- [x] `2026-05-30T14:14:31Z` intro RenderFileListTest ← 5 cases: file line format, missing @file:, empty @tasks:/@consumers:, relative path, renderFileList
- [x] `2026-05-30T14:14:31Z` intro RenderDetailTest ← 7 cases: full header blocks, missing header, no exports, minimal header, class entity, function signature, all DBC tags
- [x] `2026-05-30T14:14:31Z` intro RenderTreeTest ← 4 cases: depth indicator, depth singular/plural, file annotations, showDetail with exports
- [x] `2026-05-30T14:14:31Z` intro RenderGraphTest ← 5 cases: flat render header, empty graph, file paths, unresolved consumers, recursive render
- [x] `2026-05-30T14:14:31Z` intro RenderSearchTest ← 4 cases: file path+header, entity match, missing @file:, multiple matches
- [x] `2026-05-30T14:14:31Z` intro RenderSpecsTest ← 5 cases: spec+tasks, library-level specs, singular sub-spec, empty list, spec search render
- [x] `2026-05-30T14:14:31Z` intro HintsTest ← 11 cases: max 4 hints, token format "orient", --flag=<value> syntax, hints per mode (file/task/consumer/entity/graph/specs/spec/keyword/default)
- [x] `2026-05-30T14:14:31Z` intro OrientCmdTest ← 24 cases: parseOrientArgs (17), CLI conflict detection (6), integration (4), edge cases (4)
- [x] `2026-05-30T14:14:31Z` discovery target **tests**/ directory absent — создана заново с 18 тестовыми файлами
- [x] `2026-05-30T14:14:31Z` tried node --test cli/cmd/orient/**tests**/ → fail exit=1, directory path не поддерживается node --test (нужен glob)
- [x] `2026-05-30T14:14:31Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-30T14:14:31Z` ver node --test cli/cmd/orient/**tests**/\*.test.ts → pass exit=0
- [x] `2026-05-30T14:14:31Z` DONE
      **Handoff →** artifacts: [cli/cmd/orient/__tests__/extract-header.test.ts, cli/cmd/orient/__tests__/scan-files.test.ts, cli/cmd/orient/__tests__/build-index.test.ts, cli/cmd/orient/__tests__/damerau-levenshtein.test.ts, cli/cmd/orient/__tests__/query-task.test.ts, cli/cmd/orient/__tests__/query-consumer.test.ts, cli/cmd/orient/__tests__/query-keyword.test.ts, cli/cmd/orient/__tests__/query-entity.test.ts, cli/cmd/orient/__tests__/query-graph.test.ts, cli/cmd/orient/__tests__/query-spec.test.ts, cli/cmd/orient/__tests__/render-file-list.test.ts, cli/cmd/orient/__tests__/render-detail.test.ts, cli/cmd/orient/__tests__/render-tree.test.ts, cli/cmd/orient/__tests__/render-graph.test.ts, cli/cmd/orient/__tests__/render-search.test.ts, cli/cmd/orient/__tests__/render-specs.test.ts, cli/cmd/orient/__tests__/hints.test.ts, cli/cmd/orient/__tests__/orient.cmd.test.ts]; decisions: [test-runner=node-test, loader=tsx, total-tests=153, total-failures=0]; open: []

#### Round close

- [x] `<ts>` DONE

### Round 2 — 2026-05-30, audit-driven fix: F-02, F-03, F-04

#### P1 — re-run: fix: address audit findings F-02, F-03, F-04

- [x] `2026-05-30T14:24:15Z` decision F-02=added START anchors for all 17 END anchors across core/ and render/ files
- [x] `2026-05-30T14:24:15Z` decision F-03=merged semantically similar @invariant tags in buildIndex, damerauLevenshtein, queryKeyword — reduced from 4 to 3 per entity
- [x] `2026-05-30T14:24:15Z` decision F-04=added @purpose contracts to 14 OrientArgs fields, parseOrientArgs, run, printHelp
- [x] `2026-05-30T14:24:15Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-30T14:24:15Z` DONE
      **Handoff →** artifacts: [cli/cmd/orient/core/build-index.ts, cli/cmd/orient/core/damerau-levenshtein.ts, cli/cmd/orient/core/extract-header.ts, cli/cmd/orient/core/hints.ts, cli/cmd/orient/core/query-consumer.ts, cli/cmd/orient/core/query-entity.ts, cli/cmd/orient/core/query-graph.ts, cli/cmd/orient/core/query-keyword.ts, cli/cmd/orient/core/query-spec.ts, cli/cmd/orient/core/query-task.ts, cli/cmd/orient/core/scan-files.ts, cli/cmd/orient/render/render-detail.ts, cli/cmd/orient/render/render-file-list.ts, cli/cmd/orient/render/render-graph.ts, cli/cmd/orient/render/render-search.ts, cli/cmd/orient/render/render-specs.ts, cli/cmd/orient/render/render-tree.ts, cli/cmd/orient/orient.types.ts, cli/cmd/orient/orient.cmd.ts, cli/cmd/orient/help.ts]; decisions: [F-02=17-START-anchors-added, F-03=invariants-merged-4to3, F-04=17-DBC-contracts-added]; open: []

#### Round close

- [x] DONE



### Round 3 — 2026-05-30, sdd-fix: __tests__ dirs not excluded from scan

#### P1 — fix
- **Objective:** add __tests__ to EXCLUDED_DIRS in scan-files.ts (already applied)
- **Exit:** orient output shows 0 __tests__ directories
- [x] ver orient shows 0 __tests__ dirs DONE
**Handoff ->** artifacts: [cli/cmd/orient/core/scan-files.ts]; decisions: [excluded_dirs=added___tests__]; open: []

#### P2 — test
- **Objective:** add regression test for __tests__ exclusion in scan-files.test.ts
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - cli/cmd/orient/__tests__/scan-files.test.ts
- **Exit:** test verifies __tests__ is excluded; all tests pass
- [ ] ver -> pass|fail exit=<code>
- [ ] DONE
**Handoff ->** artifacts: [...]; decisions: [...]; open: []

<!--/SECTION:EXECUTION_LOG-->
