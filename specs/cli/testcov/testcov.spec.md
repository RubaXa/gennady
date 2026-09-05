# Module: `testcov`

**Module:** testcov · **Parent scope:** [cli](../cli.spec.md) · **Task:** [TSK-66](../../../tasks/cli/testcov/cli-testcov.task-66.md)

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Адаптерное дерево и гейт покрытия: общая orchestration выбирает ровно одну платформу, а установленный Istanbul-адаптер обслуживает TypeScript/JavaScript/Vue/Svelte и раннеры vitest / jest / node:test. Портировано из standalone-скрипта `coverage-tree.ts` проекта messenger (TSK-98), адаптировано под конвенции gennady CLI.

**Key properties:**

- Platform-extensible — новая платформа регистрирует полный `CoverageAdapter`; общая orchestration не меняется
- Fail-closed selection — неизвестная платформа и несколько совпавших адаптеров дают capability diagnostic, а не Istanbul fallback
- Runner-agnostic — авто-детекция vitest, jest, node:test из `package.json` (devDependencies + scripts)
- Diagnostic-first — при невозможности показать покрытие объясняет **почему** и **что исправить**
- Source-safe — исходники не модифицируются; только `--run` очищает и заново создаёт exact report artifact выбранного producer

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

# Гейт по покрытию (exit 0/1) — без пути берёт полный adapter-owned production source-set
npx gennady testcov --min=80
npx gennady testcov --run --min=80   # прогнать тесты, затем проверить порог
npx gennady testcov --min=80 src/module   # порог только по src/module, не по всему проекту
npx gennady testcov --min=80 src/a.ts src/b.ts   # несколько путей — порог по ИХ объединению (Target Files задачи)

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

| Name                         | Type         | Purpose                                                                                                                                        |
| ---------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `run`                        | Command      | Точка входа CLI-команды: парсинг аргументов, роутинг по режимам                                                                                |
| `CoverageAdapter`            | Contract     | Полная граница платформы: producer/artifacts, source traversal/path identity, report metrics, file detail и test-result summary                |
| `CoverageProducer`           | Contract     | Adapter-owned argv-safe producer identity and invocation                                                                                       |
| `CoverageArtifactBoundary`   | Service      | Проверяет repo-local/no-symlink artifact paths и выполняет identity-safe clear/read                                                            |
| `CoverageAdapterSelection`   | Type         | Результат fail-closed выбора: `selected`, `unsupported` или `ambiguous`                                                                        |
| `CoverageReport`             | Value Object | Adapter-private raw entries + common metrics by native key                                                                                     |
| `CoverageMetrics`            | Value Object | Adapter-neutral statement/branch/function hit totals                                                                                           |
| `CoverageFileDetail`         | Value Object | Adapter-normalized file/line detail без native report fields                                                                                   |
| `CoveragePresentationResult` | Type         | Явная capability-развилка `supported` / typed `unsupported` для detail/results                                                                 |
| `CoveragePathResolution`     | Type         | `found` / `missing` / `ambiguous` source-to-report identity                                                                                    |
| `selectCoverageAdapter`      | Service      | Выбирает ровно один адаптер из registry; не использует приоритет или fallback                                                                  |
| `COVERAGE_ADAPTERS`          | Registry     | Единственная точка регистрации будущих платформенных адаптеров без изменения orchestration                                                     |
| `istanbulCoverageAdapter`    | Adapter      | Реализация контракта для JS/TS/Vue/Svelte + Istanbul JSON                                                                                      |
| `CoverageTraversalError`     | Error        | Typed отказ при любом неполном scoped/project-wide source walk                                                                                 |
| `readCoverageDirectory`      | Utility      | Единая fail-closed directory enumeration для adapter и общей tree/gate orchestration                                                           |
| `readPkg`                    | Utility      | Парсинг `package.json` с обработкой ошибок; возвращает `null` при отсутствии или битом JSON                                                    |
| `resolveSource`              | Adapter Op   | Istanbul path identity: exact absolute/repo-relative key либо единственный suffix полного repo-relative пути; missing/ambiguous не разрешаются |
| `findCovEntry`               | Utility      | Поиск детальной coverage-записи только через adapter `resolveSource`, без basename-only fallback                                               |
| `getCovRaw`                  | Utility      | Получение сырых hit counts только через adapter `resolveSource`, без смешивания одноимённых файлов                                             |
| `detectRunners`              | Service      | Тонкий facade над выбранным adapter `producerCapability`; orchestration не анализирует platform manifests                                      |
| `runDiagnostics`             | Service      | Сбор всех диагностик конфигурации без side-effects; 9 кодов ошибок                                                                             |
| `printDiagnostics`           | Utility      | Форматирование диагностик: text → stderr, JSON → stdout                                                                                        |
| `collectVitestDiags`         | Service      | Валидация vitest-конфига: `MISSING_JSON_REPORTER`, `REPORT_ON_FAILURE_DISABLED`, `MISSING_REPORT_ON_FAILURE`                                   |
| `collectJestDiags`           | Service      | Валидация jest-конфига: `MISSING_JSON_REPORTER` через `jest.config.*` или `package.json#jest`                                                  |
| `getDirStats`                | Service      | Рекурсивная агрегация adapter metrics по полностью прочитанным директориям (memoized)                                                          |
| `aggregateLineCoverage`      | Utility      | Суммирует `sH`/`sT` по набору корзин (dir stats) → `{hit, total}`; чистая, вынесена в `coverage-threshold.ts`                                  |
| `linePct`                    | Utility      | Процент покрытия строк из `{hit, total}`; `null` при `total=0`                                                                                 |
| `meetsMinCoverage`           | Utility      | Порог `--min`: `{hit,total} >= minPct`; `total=0` всегда `false`                                                                               |
| `walk`                       | Render       | ASCII-дерево директорий; учитывает `--files`, adapter source policy, симлинки                                                                  |
| `collectFlat`                | Service      | Плоский список директорий/файлов для `--flat` режима                                                                                           |
| `printFlat`                  | Render       | Вывод плоского списка как text или JSON                                                                                                        |
| `getRoots`                   | Service      | Авто-обнаружение top-level директорий с исходным кодом                                                                                         |
| `buildFileDetail`            | Service      | Запрос adapter-normalized per-line detail; native schema остаётся внутри выбранного adapter                                                    |
| `printFileDetail`            | Render       | Аннотированный вывод исходного файла с контекстом вокруг непокрытого кода                                                                      |
| `hasCode`                    | Utility      | Проверка наличия исходников в директории (до depth 4)                                                                                          |
| `isLink`                     | Utility      | Проверка на симлинк                                                                                                                            |
| `pct`                        | Utility      | Вычисление процента покрытия                                                                                                                   |
| `icon`                       | Utility      | Выбор иконки по проценту покрытия                                                                                                              |
| `lineMarker`                 | Utility      | Выбор маркера для строки в file-detail режиме                                                                                                  |
| `fmtDirStats`                | Utility      | Форматирование статистики директории для вывода                                                                                                |
| `Diagnostic`                 | Value Object | Структура диагностики: `level`, `code`, `message`, `expect`, `fix`                                                                             |
| `DetectedRunner`             | Value Object | Обнаруженный раннер: `name`, `runCmd(resultsFile)` — возвращает shell-команду для запуска тестов с coverage                                    |
| `PkgJson`                    | Type         | Тип содержимого `package.json`: `devDependencies`, `dependencies`, `scripts`, `jest`                                                           |
| `DiagCode`                   | Type         | Union-тип 8 диагностических кодов: `NO_PACKAGE_JSON`..`REPORT_ON_FAILURE_DISABLED`                                                             |
| `FileCovRaw`                 | Value Object | Сырые hit counts для файла: `sT`, `sH`, `bT`, `bH`, `fT`, `fH`                                                                                 |
| `DirStats`                   | Value Object | Агрегированная статистика директории: расширяет `FileCovRaw` полем `cases`                                                                     |
| `FlatEntry`                  | Value Object | Элемент плоского вывода: `path`, `lines`, `branches`, `functions`, `tests?`                                                                    |
| `CoverageLineDetail`         | Value Object | Adapter-normalized строка: номер, текст, common metrics и optional platform note                                                               |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `run`

- **Type:** Command
- **Purpose:** Точка входа CLI-команды `gennady testcov`.
- **Public Operations:**
  - `selectCoverageAdapter(ROOT)` → ровно один адаптер до report I/O; unsupported/ambiguous → teaching nonzero capability diagnostic
  - Парсинг аргументов через `parseArgs` (files, run, check, json, flat, help, context)
  - `--check` → `runDiagnostics()` + `printDiagnostics()`
  - `--min=<pct>` без пути → adapter полностью обходит ROOT; `--min=<pct> <path...>` → adapter обходит объединение exact targets. Каждый production-файл проходит freshness + unique report identity; только после этого metrics агрегируются и сравниваются с порогом; exit 0/1, no tree
  - `--run` → selected adapter `producerCapability()` + argv-safe `spawnSync(producer.invocation(resultsArtifact))`
  - Загрузка report/test-results artifacts, source policy, freshness и metrics только через выбранный adapter
  - `--flat` → `collectFlat()` + `printFlat()`
  - `<file>` → `buildFileDetail()` + `printFileDetail()`
  - `<dir>` / default → `getRoots()` + `walk()`
- **Lifecycle:** Self-executing; вызывается из `gennady.ts` при команде `testcov`.
- **Errors & Degradation:** При отсутствии coverage-файла → диагностика + exit 1. При битом JSON → `COVERAGE_FILE_PARSE_ERROR` + exit 1.
- **Consumers:** Internal `gennady.ts`; External — CLI.

### `CoverageAdapter`

- **Type:** Contract
- **Purpose:** Убирает платформенные предположения из threshold orchestration.
- **Public Operations:** `detect(root)`, `artifacts(root)`, `producerCapability(root)`, source-policy/traversal operations, `parseReport(reportContent)`, `fileDetail(path, source, entry)`, `parseTestResults(content)`, `resolveSource(root, report, path)`, `staleSources(reportMtime, paths)`.
- **Lifecycle:** `selectCoverageAdapter` вызывает `detect`; после единственного выбора main-команда использует только операции выбранного адаптера.
- **Extension:** будущий iOS/Android/Go adapter реализует весь контракт, включая producer invocation и artifact identity, и добавляется одной записью в `COVERAGE_ADAPTERS`; ветки в testcov/sdd-verify orchestration запрещены.
- **Errors & Degradation:** ноль совпадений → `ERR_CLI_TESTCOV_ADAPTER_NOT_FOUND`; больше одного → `ERR_CLI_TESTCOV_ADAPTER_AMBIGUOUS`; оба exit 1 и прямо объясняют capability/fix без требования вызывать `--help`.

### `detectRunners`

- **Type:** Service
- **Purpose:** Получение доступных producer'ов только из `producerCapability` уже выбранного adapter; platform manifest остаётся внутри adapter.
- **Public Operations:**
  - `detectRunners() -> CoverageProducer[]` — возвращает adapter-owned упорядоченный список
- **Lifecycle:** Вызывается при `--run` и `runDiagnostics()`.
- **Errors & Degradation:** При отсутствии/битом `package.json` → возвращает `[]`.
- **Consumers:** Internal `run`, `runDiagnostics`.

### `buildFileDetail`

- **Type:** Service
- **Purpose:** Получение adapter-normalized per-line coverage без чтения native report schema в orchestration.
- **Public Operations:**
  - `buildFileDetail(absPath, covEntry) -> CoveragePresentationResult<CoverageFileDetail> | null`
- **Lifecycle:** Вызывается только когда цель — файл с исходным кодом.
- **Errors & Degradation:** При отсутствии файла → `null`; adapter без detail capability → typed unsupported и exit 1 без ложного native output.
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

### 5.0 Adapter Selection and Platform Boundary

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`

**Contract (DbC):**

- Threshold orchestration неизменна для платформ: exact targets → один unambiguous adapter → adapter-owned freshness → adapter-extracted metrics → aggregate → threshold.
- Адаптер владеет platform/report detection, producer/artifact identity, production/test source traversal, path identity, metric extraction, file detail и test-result presentation.
- Registry order не является приоритетом: два совпадения всегда ambiguous/red.
- Текущий registry содержит только `istanbul-js`. iOS, Android и Go пока честно rejected как unsupported; наличие контракта не означает их поддержку.

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
  - `--run` удаляет прежний `coverage-final.json` до запуска выбранного producer и требует новый файл после него; producer exit 0 без нового отчёта → exit 1
  - Producer запускается как executable + argv без shell-интерпретации; vitest/jest/c8 разрешаются только локально (`npx --no-install`), npm script name передаётся отдельным argv
  - Вложенный producer наследует обычное runtime-окружение, но не внешний `NODE_V8_COVERAGE` и не `NODE_TEST_*`: его raw coverage и test-runner control plane принадлежат producer, а не вызывающему testcov-процессу
  - Ненулевой status producer сохраняется как итоговый status команды даже при созданном диагностическом отчёте; старый отчёт никогда не может превратить failed/crashed producer в green
  - Если раннер НЕ детектирован, но есть npm-скрипт `node --test --experimental-test-coverage` (без c8) — `NATIVE_COVERAGE_UNSUPPORTED` (error), не немой `NO_RUNNER`: сообщение честно называет находку («native node coverage found») и явно указывает fix — `install c8 for testcov integration` (см. D-TC0xx)
- Invariants:
  - Детекция не парсит конфигурационные файлы — только `package.json`
  - `readPkg()` возвращает `null` при отсутствии или битом JSON — не крашится
  - `--experimental-test-coverage` пишет coverage в собственном (не Istanbul) формате — testcov не пытается его парсить, только диагностирует несовместимость

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

### 5.4 Coverage Gate (`--min`)

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`

**Contract (DbC):**

- Preconditions:
  - Adapter-owned report существует, identity-safe прочитан и валиден в native формате выбранного adapter
  - `--min` передан ровно один раз в equals-форме (`--min=<N>`); без значения, повтор или separate-форма → usage error, exit 4 с canonical usage
  - Значение `--min` — finite число в диапазоне `0..100`; decimal допустим, иначе → usage error, exit 4 с canonical usage
- Postconditions:
  - Без позиционного пути: adapter собирает все production-файлы от ROOT, включая root-level и любую глубину вложенности; presentation-эвристики `getRoots()`/`hasCode()` не определяют gate membership
  - Scoped и project-wide traversal читаются полностью; любой I/O отказ → `ERR_CLI_TESTCOV_TRAVERSAL`, exit 1, без partial aggregate/verdict
  - С позиционными путями (`--min=<N> <path...>`, один или несколько): до adapter detection каждый target проходит shared `inspectRepoPath` как exact repo-relative путь ниже cwd; absolute/outside/missing/special/symlink leaf или component → `ERR_CLI_TESTCOV_TARGET_PATH`, exit 1. После этой границы агрегирует ТОЛЬКО доказанные regular file/directory пути — БЕЗ basename-фолбэка. Порог считается по указанному множеству, не по всему проекту. Несколько путей — норма: Target Files задачи обычно несколько production-файлов, и ВСЕ они должны попасть в гейт (не только первый)
  - **Exact resolution (gate):** любой переданный путь, не существующий ТОЧНО как указан → exit 1 (`testcov: путь(и) не найдены по указанному пути: …`). Coverage lookup тоже никогда не использует basename — иначе `src/a/x.ts` мог бы получить данные `src/b/x.ts`, а отсутствующий Target File — тихо потеряться
  - **Coverage identity (gate):** каждый production-файл полного scoped/project-wide множества обязан иметь ровно одну свежую adapter report entry. Для Istanbul разрешаются точный нормализованный absolute key, точный repo-relative key или единственный key с suffix полного repo-relative пути (для контейнеров/другого checkout root). Совпадение только basename запрещено; missing/неоднозначная identity или source новее report → exit 1 до агрегации
  - **Freshness (gate):** adapter-owned report artifact должен быть НЕ старше проверяемых файлов; для Istanbul это `coverage/coverage-final.json`. Если хоть один файл-цель имеет `mtime` позже отчёта → exit 1. Это замыкает контракт единственного producer, не вшивая имя отчёта в orchestration
  - `coverage% >= N` → exit 0; иначе exit 1
  - `total=0` (ничего не инструментировано в выбранном множестве) → exit 1 при любом `N >= 0`; сообщение объясняет, что тесты ничего не загрузили: `testcov: coverage not measured — no file was loaded by tests yet (no tests written?) — cannot check the threshold ❌`
  - Обычный вердикт печатает одну строку: `testcov: line coverage <pct>% (<hit>/<total> statements) — required ≥<N>% ✅|❌`; дерево/диагностика не печатаются
  - Отсутствующий coverage-файл → подсказка называет настоящую команду прогона для обнаруженного раннера (`Option A: npx gennady testcov --run` / `Option B: <детектированная run-команда, например npx vitest run --coverage>`)
- Invariants:
  - `aggregateLineCoverage`/`linePct`/`meetsMinCoverage` — чистые функции (`coverage-threshold.ts`), без I/O; юнит-тестируемы отдельно от загрузки coverage-файла
  - Порог включает равенство (`>=`), не строго `>`
  - Позиционный путь только сужает множество агрегируемых файлов — сам механизм подсчёта (`aggregateLineCoverage`/`meetsMinCoverage`) не меняется

### 5.5 File Detail

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `e2e`

**Contract (DbC):**

- Preconditions:
  - Целевой путь — существующий production-файл по source policy выбранного adapter
  - Выбранный adapter возвращает `supported` file-detail capability
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
  - Orchestration не читает native report maps; unsupported capability не заменяется Istanbul fallback
  <!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

| Flag                    | Type    | Default | Description                                                                                                                                                                                           |
| ----------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--files`               | boolean | false   | Показывать файлы в дереве (иначе только директории)                                                                                                                                                   |
| `--run`                 | boolean | false   | Авто-запуск тестов с coverage перед показом                                                                                                                                                           |
| `--check`               | boolean | false   | Только диагностика конфигурации (exit 0/1)                                                                                                                                                            |
| `--min=<pct> [path...]` | number  | —       | Equals-only finite `0..100` (decimal допустим). Гейт покрытия строк: exit 1 если агрегат < pct; без путей — по всему проекту, с путями — по их объединению (все, не только первый) (D-TC006, D-TC008) |
| `--json`                | boolean | false   | Машиночитаемый вывод (для `--check` или `--flat`)                                                                                                                                                     |
| `--flat`                | boolean | false   | Плоский список вместо дерева                                                                                                                                                                          |
| `--context`, `-c`       | integer | 2       | Ровно одно finite nonnegative integer значение; количество строк контекста вокруг непокрытого кода                                                                                                    |
| `--color`               | boolean | false   | ANSI-подсветка красным/жёлтым фоном в file-detail                                                                                                                                                     |
| `--help`, `-h`          | boolean | false   | Показать справку                                                                                                                                                                                      |
| `<path>`                | string  | —       | Целевая директория или файл                                                                                                                                                                           |

Unknown flags, value-флаги без значения/с повтором, boolean-флаги со значением и несколько `<path>` без `--min` → usage error, exit 4 с canonical usage. Multi-target разрешён только для `--min`, где все пути входят в один агрегат.

**Istanbul adapter source policy:** Всегда исключаются из tree walk и агрегации: `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, `.vite`, `.cache`, `.turbo`, `.nx`, `__generated__`, `.next`, `.nuxt`, `.svelte-kit`, `vendor`, `third_party`, `external`, `.storybook`, `.husky`, `.claude`, `.github`, `__tests__`, `__snapshots__`, `__mocks__`, `docs`, `public`, `static`, `assets`, `fixtures`, `__fixtures__`, `tooling-lab`, `draft`, `tasks`, `specs`, `ai`. Поддерживаемые production extensions и test-file predicate принадлежат этому адаптеру, не общей orchestration.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```
cli/cmd/testcov/
├── index.ts                    # Entry point for dynamic import
├── testcov.cmd.ts              # Main command logic (~1200 lines)
├── coverage-adapter.types.ts   # Platform boundary contract and shared report/selection types
├── coverage-adapter-registry.ts # Fail-closed selection + registration point
├── coverage-artifact.ts        # Repo-local/no-symlink identity-safe clear/read lifecycle
├── coverage-traversal.ts       # Shared typed fail-closed directory enumeration
├── istanbul-coverage-adapter.ts # Current JS-family source/report implementation
├── coverage-threshold.ts       # Pure --min gate: aggregateLineCoverage/linePct/meetsMinCoverage
├── help.ts                     # Help text output
└── __tests__/
    ├── coverage-adapter-registry.test.ts # Selection + Istanbul parity/path/freshness
    ├── coverage-threshold.test.ts  # Unit tests for the pure --min gate
    └── testcov.cmd.test.ts         # --check diagnostics, spawned as a subprocess (no exported `run`)
```

**File Mapping:**

- `cli/cmd/testcov/index.ts`: Entry point — triggers `testcov.cmd.ts`
- `cli/cmd/testcov/testcov.cmd.ts`: platform-neutral selection, threshold и normalized presentation orchestration
- `cli/cmd/testcov/coverage-adapter.types.ts`: platform-neutral adapter contract
- `cli/cmd/testcov/coverage-adapter-registry.ts`: sole registration and unambiguous selection
- `cli/cmd/testcov/coverage-artifact.ts`: shared identity-safe artifact lifecycle consumed by testcov and sdd-verify
- `cli/cmd/testcov/coverage-traversal.ts`: shared typed traversal primitive; никакой caller не принимает partial walk
- `cli/cmd/testcov/istanbul-coverage-adapter.ts`: current producer/report/source/detail/results implementation
- `cli/cmd/testcov/coverage-threshold.ts`: Pure aggregation for `--min=<pct>`
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

### D-TC002 — Istanbul adapter file detail через statementMap (а не LCOV)

- **Status:** active
- **Recorded:** session ModuleDecomposition, testcov
- **Why:** текущий `istanbul-js` adapter строит normalized line detail из `statementMap`/`branchMap`/`fnMap`; LCOV генерируется не всеми JS-раннерами. Эти поля не покидают adapter boundary.
- **Risk accepted:** Другой adapter обязан вернуть собственный normalized detail либо typed `unsupported`; orchestration не применяет Istanbul fallback.

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

- **Status:** superseded by D-TC009
- **Recorded:** session ModuleDecomposition, testcov
- **Why:** Ключи в `coverage-final.json` — абсолютные пути, которые могут не совпадать с текущим cwd (контейнеры, CI, разные машины). Двухшаговый resolve (`findCovEntry`: exact path → basename match; `getCovRaw`: `covRaw[fp] ?? covRawByName[basename(fp)]`) гарантирует нахождение coverage-данных даже при несовпадении префиксов путей.
- **Risk accepted:** Теоретическая коллизия имён (два файла с одинаковыми именами в разных директориях) — на практике крайне редка, и первый найденный по basename считается корректным. Приоритет exact match минимизирует риск.

### D-TC006 — `--min=<pct>` агрегирует `getDirStats` по `getRoots()`, не по `covRaw` напрямую

- **Status:** superseded by D-TC015
- **Recorded:** session ModuleDecomposition, testcov
- **Why:** Дерево уже считает per-root агрегаты через `getDirStats(getRoots())` (по source policy выбранного adapter). Суммирование по всем report entries напрямую посчитало бы файлы вне `getRoots()` — разное число между тем, что видно в дереве, и тем, что гейтится, было бы источником путаницы. Сравнение с порогом — чистая функция (`meetsMinCoverage`), вынесена в `coverage-threshold.ts` для юнит-теста без чтения report artifact.
- **Risk accepted:** Низкий — `getRoots()` уже используется как единственный источник top-level дерева; гейт и просмотр смотрят на одно и то же множество файлов по построению.

### D-TC007 — `NATIVE_COVERAGE_UNSUPPORTED` вместо немого `NO_RUNNER` для нативного `node --test`

- **Status:** active
- **Why:** До этой итерации producer detection требовал `c8` в devDeps ДЛЯ ЛЮБОГО `node:test`-раннера, включая проекты, использующие node'вский собственный `--experimental-test-coverage` (никакого c8 не нужно — node сам пишет summary/lcov). Такой проект получал общий `NO_RUNNER`, будто раннера вообще нет — неверно: раннер с покрытием есть, просто в формате, несовместимом с Istanbul-пайплайном testcov (`statementMap`/`branchMap`/`fnMap`, которых `--experimental-test-coverage` не производит). Ветка `istanbulCoverageAdapter.producerCapability` детектит именно этот случай (скрипт матчит и `node --test`, и `--experimental-test-coverage`, без c8) и репортит `NATIVE_COVERAGE_UNSUPPORTED` с честным текстом находки + явным fix (`install c8 for testcov integration`) — не врёт, что раннера нет, но и не пытается парсить нативный формат.
- **Risk accepted:** Минимальный вариант — testcov не поддерживает нативный формат вообще (ни LCOV, ни node's summary), только честно называет несовместимость. Полный парсинг нативного формата отложен — нет спроса, c8-обёртка тривиальна.

### `istanbulCoverageAdapter.producerCapability` native branch

- **Usage Waiver:** Предикат существует только внутри Istanbul adapter и прямо покрыт `NATIVE_COVERAGE_UNSUPPORTED` integration test; platform-neutral orchestration получает уже готовую capability diagnostic.

### D-TC008 — `--min` уважает позиционный путь; честные сообщения на нулевом покрытии и на отсутствующем coverage-файле

- **Status:** active
- **Why:** До этой итерации `--min=<pct>` ВСЕГДА агрегировал весь проект (`getRoots()`), даже если оператор передал конкретный путь — порог для «моего нового модуля» на практике размывался покрытием всего остального репо, давая ложно-зелёный/ложно-красный результат не про то, что спрашивали. Теперь позиционный `<path>`, если передан, сужает агрегацию (`findFiles(path)`) до себя — порог считается только по нему; без пути поведение не изменилось (весь проект, как раньше). Дополнительно: сообщение при `total=0` (ничего не инструментировано) раньше не объясняло причину — теперь честно называет её («no file was loaded by tests yet — no tests written?»), а подсказка при отсутствующем `coverage-final.json` называет РЕАЛЬНУЮ обнаруженную run-команду для раннера проекта (vitest/jest/node:test), а не общий плейсхолдер.
- **Risk accepted:** Нет — сужение по пути строго опционально (без пути поведение прежнее); текстовые улучшения сообщений не меняют exit-коды и машиночитаемый JSON-контракт.

### D-TC009 — Полная path identity вместо basename fallback

- **Status:** active
- **Recorded:** SDD v2 RC path-identity audit
- **Supersedes:** D-TC005
- **Why:** Basename не идентифицирует файл: `src/a/shared.ts` и `src/b/shared.ts` могли получить чужие hit counts и дать false green. Coverage key теперь сопоставляется по точному нормализованному absolute/repo-relative пути; смена checkout/container root поддерживается только уникальным suffix полного repo-relative пути. Для root-level файлов relocated suffix намеренно не применяется, потому что он снова был бы basename-only.
- **Invariant:** Для scoped `--min` missing/ambiguous identity fail closed до агрегации. Exact key приоритетнее relocated кандидатов; два relocated root с одинаковым repo-relative suffix неоднозначны и дают красный вердикт с перечнем ключей.
- **Portability:** Разделители `\\` и `/` нормализуются независимо от платформы. Набор production extensions принадлежит Istanbul-адаптеру; будущая платформа не расширяет его, а регистрирует собственный полный adapter (D-TC012).

### D-TC010 — `--run` владеет отчётом текущего producer invocation

- **Status:** active
- **Why:** прежний `--run` проглатывал ненулевой exit выбранного runner и затем читал оставшийся от прошлого запуска 100% report. Теперь старый exact report удаляется до запуска, producer вызывается argv-safe без shell и обязан создать новый report. Его ненулевой status остаётся итоговым даже если report создан и показан для диагностики; exit 0 без report становится exit 1.
- **Boundary:** это подтверждает происхождение report от текущего invocation, но валидность Istanbul JSON и scoped threshold по-прежнему проверяются последующей общей загрузкой/`--min`.

### D-TC011 — Вложенный producer не наследует внешний coverage/test control plane

- **Status:** active
- **Why:** когда сам `testcov` запущен под c8 или `node --test`, передача `NODE_V8_COVERAGE`/`NODE_TEST_*` вложенному producer смешивает два владельца: каждый npm/node subprocess пишет raw-профили во внешний каталог, а `NODE_TEST_CONTEXT` может переключить вложенный runner в child-reporter mode. Это умножает I/O и способно скрыть настоящий exit/status.
- **Invariant:** внешний testcov остаётся инструментирован вызывающим процессом; только env его producer-клона очищается от `NODE_V8_COVERAGE` и namespace `NODE_TEST_*`. Для `NODE_V8_COVERAGE` граница передаёт пустое значение: Node повторно инъектирует активный внешний путь, если ключ просто удалить. Все остальные runtime-переменные наследуются без изменений.

### D-TC012 — Полный coverage adapter вместо расширения JS-списков

- **Status:** active
- **Recorded:** SDD v2 RC platform-abstraction audit
- **Why:** добавление `.swift`, `.kt` или `.go` в общий `CODE_EXT` сохранило бы скрытые Istanbul/Jest-предположения. Поэтому одна registry entry владеет producer/artifacts, source policy/traversal, path identity, report metrics, file detail и result summary. Общая orchestration не читает native schema.
- **Fail-closed:** ноль совпадений и несколько совпадений — разные teaching diagnostics с exit 1; registry order не разрешает неоднозначность.
- **Current capability:** зарегистрирован только `istanbul-js` для TypeScript/JavaScript/Vue/Svelte. iOS, Android и Go намеренно остаются unsupported до появления реальных adapters и fixtures; контракт не выдаётся за их поддержку.

### D-TC013 — Scoped gate target boundary precedes adapter identity

- **Status:** active
- **Why:** `resolve(ROOT, target)` + `existsSync` принимал absolute/outside пути и следовал symlink, после чего adapter identity мог читать или молча отбрасывать не принадлежащее репозиторию evidence. `--min` теперь сначала доказывает каждый target через shared `inspectRepoPath`: только exact repo-relative regular file/directory below cwd; absolute, traversal, missing, special и symlink leaf/component дают typed `ERR_CLI_TESTCOV_TARGET_PATH`. Только доказанные absolute paths передаются platform adapter для source collection/freshness/report identity. Это общий boundary для будущих iOS/Android/Go adapters, а не Istanbul-частность.

### D-TC014 — Registry entry полностью владеет coverage lifecycle и presentation

- **Status:** active · **Расширяет:** D-TC012, D-TC013
- **Why:** одного adapter-owned парсера было недостаточно: `testcov` продолжал сам детектировать только JS-runners, а `sdd-verify` жёстко удалял/читал `coverage/coverage-final.json`. Новая платформа всё равно требовала бы править обе orchestration, поэтому обещание «одна registry entry» было ложным.
- **Invariant:** выбранный `CoverageAdapter` возвращает producer capability/argv, repo-relative artifacts/writable directories, normalized detail и result summary. Общий `CoverageArtifactBoundary` до producer/read/delete доказывает containment/no-symlink; `sdd-verify` выбирает тот же registry adapter и не знает имени Istanbul artifact.
- **Fail-closed traversal:** scoped adapter collection и project-wide `getRoots/getDirStats/walk/collectFlat` используют один typed enumeration boundary; любой unreadable subtree останавливает вывод/threshold без partial aggregate.
- **Security proof:** `coverage -> outside` не удаляет/читает external victim и producer не запускается. Live chmod tests доказывают `ERR_CLI_TESTCOV_TRAVERSAL` и для exact subtree, и для no-target project-wide `--min`; custom-adapter composition доказывает threshold + detail + results без Istanbul schema.

### D-TC015 — Threshold membership = полный adapter-owned production source-set

- **Status:** active · **Supersedes:** D-TC006 · **Extends:** D-TC009, D-TC012, D-TC014
- **Why:** presentation-корни и depth heuristic пропускали root-level/глубокие файлы, а файл без report entry молча не влиял на порог. Теперь scoped и project-wide gates сначала получают полное множество через `CoverageAdapter.collectProductionFiles`, затем для каждого файла доказывают freshness и ровно одну report identity. Missing/ambiguous/stale member краснит весь gate; агрегация по partial set невозможна.
- **Portability:** общая orchestration не знает расширений/игноров платформы; будущий adapter определяет множество тем же контрактом.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts` (парсинг CLI-аргументов), `node:child_process` (argv-safe producer spawn), `node:fs`/`node:path` (report ownership and coverage reads)
- **Provides to:** `gennady.ts` (регистрация команды)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to Task Scaffolding

- **Implementation files to be created:**
  - `cli/cmd/testcov/index.ts`
  - `cli/cmd/testcov/testcov.cmd.ts`
  - `cli/cmd/testcov/coverage-adapter.types.ts`
  - `cli/cmd/testcov/coverage-adapter-registry.ts`
  - `cli/cmd/testcov/coverage-artifact.ts`
  - `cli/cmd/testcov/coverage-traversal.ts`
  - `cli/cmd/testcov/istanbul-coverage-adapter.ts`
  - `cli/cmd/testcov/help.ts`
- **Test files:** `testcov.cmd.test.ts` — diagnostics, artifact symlink safety и live scoped/project-wide unreadable traversal. `coverage-adapter-registry.test.ts` — selection, custom threshold/detail/results composition, typed unsupported capability и Istanbul parity. `coverage-threshold.test.ts` — pure `--min` gate.
- **Stack dependencies:**
  - Language: `TypeScript` (resolves to `ai/directives/coding/typescript.xml`)
  - Test framework: `node:test` (resolves to `ai/directives/testing/node-test.xml`)
- **Module Rules Additions:** None
- **Open risks & validation needs:**
  - E2E тесты для file-detail режима в различных проектах (deferred)
  - Поддержка Bun test, Deno test, Mocha+nyc, Playwright coverage (out of scope v1)
  - Мульти-репозиторные (monorepo) сетапы где coverage генерится per-package (deferred)
  <!--/SECTION:HANDOFF-->
