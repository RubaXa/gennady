# Module: `testcov`

**Module:** testcov · **Parent scope:** [cli](../cli.spec.md) · **Task:** [TSK-66](../../../tasks/cli/testcov/cli-testcov.task-66.md)

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Визуальное дерево покрытия тестами с авто-детекцией раннера (vitest / jest / node:test). Портировано из standalone-скрипта `coverage-tree.ts` проекта messenger (TSK-98), адаптировано под конвенции gennady CLI.

**Key properties:**

- Portable — работает в любом проекте с поддерживаемым test runner'ом; не зависит от импортов проекта
- Runner-agnostic — авто-детекция vitest, jest, node:test из `package.json` (devDependencies + scripts)
- Diagnostic-first — при невозможности показать покрытие объясняет **почему** и **что исправить**
- Non-intrusive — не модифицирует исходники и `coverage-final.json`

**Invariants:**

- `⚫` = файл не содержит исполняемых операторов (`sT = 0`) — отличается от `🔴` (0% покрыто, но `sT > 0`)
- Тестовые файлы (`*.test.ts`, `*.spec.ts`, ...) **никогда** не показываются в выводе; их test-case counts агрегируются в родительскую директорию
- Симлинки всегда исключаются
- Диагностика → stderr; дерево / flat / JSON / file-detail → stdout — pipe-safe
- `__tests__` директории исключаются из вывода вместе с содержимым
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
# Дерево директорий с покрытием
npx gennady testcov

# Дерево с файлами (L%/B%/F%)
npx gennady testcov --files

# Авто-запуск тестов с покрытием
npx gennady testcov --run

# Диагностика конфигурации (exit 0/1)
npx gennady testcov --check
npx gennady testcov --check --json

# Плоский список
npx gennady testcov --flat
npx gennady testcov --flat --json

# Детализация по файлу: аннотированный исходный код
npx gennady testcov src/module.ts
npx gennady testcov src/module.ts -c 5   # ±5 строк контекста
npx gennady testcov src/module.ts -c 0   # только непокрытые строки
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

_Это полный список сущностей модуля `testcov`. Любое введение сущности execution-агентом помимо этого списка считается drift'ом и требует обновления spec._

| Name                 | Type         | Purpose                                                                                                       |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `run`                | Command      | Точка входа CLI-команды: парсинг аргументов, роутинг по режимам                                               |
| `readPkg`            | Utility      | Парсинг `package.json` с обработкой ошибок; возвращает `null` при отсутствии или битом JSON                   |
| `findCovEntry`       | Utility      | Поиск coverage-записи по абсолютному пути; fallback на basename-совпадение для разных форматов путей          |
| `getCovRaw`          | Utility      | Получение сырых hit counts для файла через `covRaw[fp] ?? covRawByName[basename(fp)]`                         |
| `detectRunners`      | Service      | Инспекция devDependencies + scripts → упорядоченный список установленных раннеров (vitest > jest > node:test) |
| `runDiagnostics`     | Service      | Сбор всех диагностик конфигурации без side-effects; 8 кодов ошибок                                            |
| `printDiagnostics`   | Utility      | Форматирование диагностик: text → stderr, JSON → stdout                                                       |
| `collectVitestDiags` | Service      | Валидация vitest-конфига: `MISSING_JSON_REPORTER`, `REPORT_ON_FAILURE_DISABLED`, `MISSING_REPORT_ON_FAILURE`  |
| `collectJestDiags`   | Service      | Валидация jest-конфига: `MISSING_JSON_REPORTER` через `jest.config.*` или `package.json#jest`                 |
| `getDirStats`        | Service      | Рекурсивная агрегация Istanbul hit counts по директориям (memoized)                                           |
| `walk`               | Render       | ASCII-дерево директорий; учитывает `--files`, `SKIP_DIRS`, симлинки                                           |
| `collectFlat`        | Service      | Плоский список директорий/файлов для `--flat` режима                                                          |
| `printFlat`          | Render       | Вывод плоского списка как text или JSON                                                                       |
| `getRoots`           | Service      | Авто-обнаружение top-level директорий с исходным кодом                                                        |
| `buildFileDetail`    | Service      | Построение per-line coverage map из `statementMap`/`branchMap`/`fnMap` + исходный текст                       |
| `printFileDetail`    | Render       | Аннотированный вывод исходного файла с контекстом вокруг непокрытого кода                                     |
| `hasCode`            | Utility      | Проверка наличия исходников в директории (до depth 4)                                                         |
| `isLink`             | Utility      | Проверка на симлинк                                                                                           |
| `pct`                | Utility      | Вычисление процента покрытия                                                                                  |
| `icon`               | Utility      | Выбор иконки по проценту покрытия                                                                             |
| `lineMarker`         | Utility      | Выбор маркера для строки в file-detail режиме                                                                 |
| `fmtDirStats`        | Utility      | Форматирование статистики директории для вывода                                                               |
| `Diagnostic`         | Value Object | Структура диагностики: `level`, `code`, `message`, `expect`, `fix`                                            |
| `DetectedRunner`     | Value Object | Обнаруженный раннер: `name`, `runCmd(resultsFile)` — возвращает shell-команду для запуска тестов с coverage   |
| `PkgJson`            | Type         | Тип содержимого `package.json`: `devDependencies`, `dependencies`, `scripts`, `jest`                          |
| `DiagCode`           | Type         | Union-тип 8 диагностических кодов: `NO_PACKAGE_JSON`..`REPORT_ON_FAILURE_DISABLED`                            |
| `FileCovRaw`         | Value Object | Сырые hit counts для файла: `sT`, `sH`, `bT`, `bH`, `fT`, `fH`                                                |
| `DirStats`           | Value Object | Агрегированная статистика директории: расширяет `FileCovRaw` полем `cases`                                    |
| `FlatEntry`          | Value Object | Элемент плоского вывода: `path`, `lines`, `branches`, `functions`, `tests?`                                   |
| `LineInfo`           | Value Object | Per-line coverage: номер строки, текст, счётчики `sT`/`sH`/`bT`/`bH`/`fT`/`fH`                                |
| `FileDetail`         | Value Object | Результат анализа файла: путь, массив `LineInfo`, агрегированные totals                                       |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `run`

- **Type:** Command
- **Purpose:** Точка входа CLI-команды `gennady testcov`.
- **Public Operations:**
  - Парсинг аргументов через `parseArgs` (files, run, check, json, flat, help, context)
  - `--check` → `runDiagnostics()` + `printDiagnostics()`
  - `--run` → `detectRunners()` + `execSync(runner.runCmd(RESULTS_TMP))`
  - Загрузка `coverage-final.json` + `.tree-results.json`
  - `--flat` → `collectFlat()` + `printFlat()`
  - `<file>` → `buildFileDetail()` + `printFileDetail()`
  - `<dir>` / default → `getRoots()` + `walk()`
- **Lifecycle:** Self-executing; вызывается из `gennady.ts` при команде `testcov`.
- **Errors & Degradation:** При отсутствии coverage-файла → диагностика + exit 1. При битом JSON → `COVERAGE_FILE_PARSE_ERROR` + exit 1.
- **Consumers:** Internal `gennady.ts`; External — CLI.

### `detectRunners`

- **Type:** Service
- **Purpose:** Определение доступных test runner'ов только через `package.json`.
- **Public Operations:**
  - `detectRunners() -> DetectedRunner[]` — возвращает упорядоченный список (vitest > jest > node:test)
- **Lifecycle:** Вызывается при `--run` и `runDiagnostics()`.
- **Errors & Degradation:** При отсутствии/битом `package.json` → возвращает `[]`.
- **Consumers:** Internal `run`, `runDiagnostics`.

### `buildFileDetail`

- **Type:** Service
- **Purpose:** Построение per-line coverage map из `statementMap`/`branchMap`/`fnMap`.
- **Public Operations:**
  - `buildFileDetail(absPath, covEntry) -> FileDetail | null` — маппит coverage data на строки исходника
- **Lifecycle:** Вызывается только когда цель — файл с исходным кодом.
- **Errors & Degradation:** При отсутствии файла на диске → `null`.
- **Consumers:** Internal `run`.

### `printFileDetail`

- **Type:** Render
- **Purpose:** Аннотированный вывод исходного файла: группировка непокрытых регионов, контекст ±N строк.
- **Public Operations:**
  - `printFileDetail(detail, ctx, covEntry) -> void`
  - Непокрытые строки: ♦️ + красный фон (только с `--color`); частично покрытые: 🔸 + жёлтый фон (только с `--color`)
  - Без `--color`: только маркеры ♦️/🔸, без ANSI-подсветки
  - Аннотации веток: `← branch not taken` или `← branch N/M taken` — на той же строке, что и код
  - Аннотации функций: `← name() never called` или `← never called` (для анонимных, включая `(anonymous_0)` и подобные) — на той же строке
  - Полностью покрытые строки: `✓`
- **Lifecycle:** Вызывается из `run` для файловых целей.
- **Consumers:** Internal `run`.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

### 5.1 Diagnostics

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`

**Contract (DbC):**

- Preconditions:
  - `package.json` существует и содержит валидный JSON
  - Проект находится в корне (cwd = директория с `package.json`)
- Postconditions:
  - При наличии error-диагностик → exit code 1
  - При отсутствии error-диагностик → exit code 0
  - `--check --json` → stdout содержит `{ok, runner, coverageFile, diagnostics[]}`
  - `--check` (text) → stderr содержит структурированный вывод с `✗`/`⚠`, `Expect:`, `Fix:`
- Invariants:
  - `printDiagnostics` всегда пишет в stderr (text) или stdout (json) — никогда не смешивает
  - `runDiagnostics` не имеет side-effects (не пишет в FS, не запускает процессы)

### 5.2 Runner Detection

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`

**Contract (DbC):**

- Preconditions:
  - `package.json` прочитан через `readPkg()`
- Postconditions:
  - vitest детектится если `vitest`, `@vitest/coverage-v8` или `@vitest/coverage-istanbul` в devDeps/deps
  - jest детектится если `jest`, `@jest/core`, `jest-circus` или `babel-jest` в devDeps/deps
  - node:test детектится если `c8` в devDeps **И** есть npm-скрипт с `/\bnode\s+--test\b/`
  - Приоритет: vitest > jest > node:test
- Invariants:
  - Детекция не парсит конфигурационные файлы — только `package.json`
  - `readPkg()` возвращает `null` при отсутствии или битом JSON — не крашится

### 5.3 Coverage Tree

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `e2e`

**Contract (DbC):**

- Preconditions:
  - `coverage/coverage-final.json` существует и содержит валидный Istanbul JSON
- Postconditions:
  - Директории показываются с агрегированным процентом покрытия и количеством тестов
  - Файлы (с `--files`) показываются с `L%/B%/F%`
  - Тестовые файлы исключены из вывода; их test-case counts агрегируются
  - Симлинки исключены
  - `__tests__` директории исключены из вывода полностью
- Invariants:
  - `⚫` (sT = 0) ≠ `🔴` (sT > 0, sH = 0)
  - Проценты вычисляются из raw counts для безошибочной агрегации

### 5.4 File Detail

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `e2e`

**Contract (DbC):**

- Preconditions:
  - Целевой путь — существующий файл с расширением из `CODE_EXT`, не тестовый файл
  - Запись в `coverage-final.json` содержит `statementMap`
- Postconditions:
  - Непокрытые регионы выделены красным фоном (ANSI escape codes)
  - Частично покрытые строки выделены жёлтым фоном
  - Аннотации веток показаны на строке объявления (одна аннотация на ветку)
  - Аннотации функций показаны на строке объявления
  - Контекст ±N строк управляется флагом `--context` / `-c` (по умолчанию 2)
  - При `-c 0` контекст не добавляется
  - Полностью покрытый файл выводится целиком
- Invariants:
  - Вывод всегда в stdout (pipe-safe)
  - Не модифицирует исходный файл
  <!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

| Flag              | Type    | Default | Description                                         |
| ----------------- | ------- | ------- | --------------------------------------------------- |
| `--files`         | boolean | false   | Показывать файлы в дереве (иначе только директории) |
| `--run`           | boolean | false   | Авто-запуск тестов с coverage перед показом         |
| `--check`         | boolean | false   | Только диагностика конфигурации (exit 0/1)          |
| `--json`          | boolean | false   | Машиночитаемый вывод (для `--check` или `--flat`)   |
| `--flat`          | boolean | false   | Плоский список вместо дерева                        |
| `--context`, `-c` | number  | 2       | Количество строк контекста вокруг непокрытого кода  |
| `--color`         | boolean | false   | ANSI-подсветка красным/жёлтым фоном в file-detail   |
| `--help`, `-h`    | boolean | false   | Показать справку                                    |
| `<path>`          | string  | —       | Целевая директория или файл                         |

**SKIP_DIRS Policy:** Всегда исключаются из tree walk и агрегации: `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, `.vite`, `.cache`, `.turbo`, `.nx`, `__generated__`, `.next`, `.nuxt`, `.svelte-kit`, `vendor`, `third_party`, `external`, `.storybook`, `.husky`, `.claude`, `.github`, `__tests__`, `__snapshots__`, `__mocks__`, `docs`, `public`, `static`, `assets`, `fixtures`, `__fixtures__`, `tooling-lab`, `draft`, `tasks`, `specs`, `ai`.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```
cli/cmd/testcov/
├── index.ts           # Entry point for dynamic import
├── testcov.cmd.ts     # Main command logic (~1050 lines)
└── help.ts            # Help text output
```

**File Mapping:**

- `cli/cmd/testcov/index.ts`: Entry point — triggers `testcov.cmd.ts`
- `cli/cmd/testcov/testcov.cmd.ts`: All command logic — argument parsing, runner detection, diagnostics, coverage loading, tree/flat/json/file-detail output
- `cli/cmd/testcov/help.ts`: `printHelp()` — usage, options, examples

**Registration points (4 files):**

- `cli/gennady.ts` — help dispatch + command switch
- `cli/cmd/help/help.cmd.ts` — main help listing
- `cli/AGENTS.md` — commands table
- `cli/cmd/README.md` — scenarios + commands table
<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

### D-TC001 — Single-file command (no core/ split)

- **Status:** active
- **Recorded:** session ModuleDecomposition, testcov
- **Why:** Команда — самодостаточная утилита без внешних зависимостей. Разделение на core/render избыточно для данного объёма (~1050 строк). При росте >1500 строк — рассмотреть декомпозицию.
- **Risk accepted:** Низкий — тестируемость не страдает, команда не имеет сайд-эффектов кроме I/O.

### D-TC002 — File detail через statementMap (а не LCOV)

- **Status:** active
- **Recorded:** session ModuleDecomposition, testcov
- **Why:** `coverage-final.json` от c8 содержит `statementMap`/`branchMap`/`fnMap` с полной line-level информацией. LCOV генерируется не всеми раннерами (только vitest с v8 provider). Использование единого источника (Istanbul JSON) гарантирует работу на всех трёх раннерах.
- **Risk accepted:** При отсутствии `statementMap` в JSON (теоретический случай для нестандартных coverage-инструментов) — fallback к общему `⚫` для файла.

### D-TC003 — `__tests__` в SKIP_DIRS

- **Status:** active
- **Recorded:** session ModuleDecomposition, testcov
- **Why:** Тестовые директории не содержат исходного кода и не несут полезной информации о покрытии. Их исключение из дерева уменьшает шум. Отличается от оригинального `coverage-tree.ts` где `__tests__` показывались как `⚫`.
- **Risk accepted:** Низкий — тест-файлы и так исключаются из вывода; исключение самой директории — логичное расширение.

### D-TC004 — node:test без JSON-репортера для тестов

- **Status:** active
- **Recorded:** session ModuleDecomposition, testcov
- **Why:** `node:test` не имеет стандартного JSON-репортера как vitest/jest. Поле `tests?` в flat/JSON выводе всегда `undefined` для node:test. Добавление кастомного репортера — out of scope для v1.
- **Risk accepted:** Низкий — test-case counts — опциональная фича; основные метрики покрытия доступны для всех раннеров.

### D-TC005 — Basename fallback для resolve coverage-записей

- **Status:** active
- **Recorded:** session ModuleDecomposition, testcov
- **Why:** Ключи в `coverage-final.json` — абсолютные пути, которые могут не совпадать с текущим cwd (контейнеры, CI, разные машины). Двухшаговый resolve (`findCovEntry`: exact path → basename match; `getCovRaw`: `covRaw[fp] ?? covRawByName[basename(fp)]`) гарантирует нахождение coverage-данных даже при несовпадении префиксов путей.
- **Risk accepted:** Теоретическая коллизия имён (два файла с одинаковыми именами в разных директориях) — на практике крайне редка, и первый найденный по basename считается корректным. Приоритет exact match минимизирует риск.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts` (парсинг CLI-аргументов)
- **Provides to:** `gennady.ts` (регистрация команды)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to Task Scaffolding

- **Implementation files to be created:**
  - `cli/cmd/testcov/index.ts`
  - `cli/cmd/testcov/testcov.cmd.ts`
  - `cli/cmd/testcov/help.ts`
- **Test files to be created:** `cli/cmd/testcov/__tests__/testcov.cmd.test.ts` (deferred — v1 без тестов)
- **Stack dependencies:**
  - Language: `TypeScript` (resolves to `ai/directives/coding/typescript.xml`)
  - Test framework: `node:test` (resolves to `ai/directives/testing/node-test.xml`)
- **Module Rules Additions:** None
- **Open risks & validation needs:**
  - E2E тесты для file-detail режима в различных проектах (deferred)
  - Поддержка Bun test, Deno test, Mocha+nyc, Playwright coverage (out of scope v1)
  - Мульти-репозиторные (monorepo) сетапы где coverage генерится per-package (deferred)
  <!--/SECTION:HANDOFF-->
