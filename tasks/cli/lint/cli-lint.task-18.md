# Task: TSK-18 — Интеграционные тесты CLI команды lint

## 1. Meta & Traceability

- **Task-ID:** TSK-18
- **Purpose:** Написать интеграционные тесты для команды `gennady lint`, проверяющие полный pipeline: parseArgs → сбор файлов → 3 проверки → вывод → exit code. Эти тесты должны ловить регрессии, которые unit-тесты отдельных checks не видят.
- **Scope:** cli
- **Module:** lint
- **Dependencies:** TSK-17
- **Spec References:**
  - Golden DX: [cli spec §3](../../specs/cli/cli.spec.md)
  - Execution Insights: [cli spec §11](../../specs/cli/cli.spec.md) (I-01 parseArgs, I-02 filePath, I-03 git)
  - LintCommand surface: [lint spec §3](../../specs/cli/lint/lint.spec.md)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |
  | node-test        | ai/directives/testing/node-test.xml       |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None
- **Target Test Files:** `cli/cmd/lint/__tests__/lint.cmd.test.ts` (Modify — добавить интеграционные сценарии)

## 2. Acceptance Criteria (BDD)

**Feature:** CLI команда `gennady lint` — интеграционные тесты

**Scenario:** Чистый файл → exit 0, stdout пуст [`integration`]

- **Given** файл с валидным `// @file:`, `// @consumers:`, контрактами и anchors
- **When** `run(['file.ts'])`
- **Then** `exitCode = 0`, `errors` пуст, `format()` пустая строка

**Scenario:** Файл с ошибками → exit 1, ESLint-формат [`integration`]

- **Given** файл без `// @file:` и `// @consumers:`
- **When** `run(['file.ts'])`
- **Then** `exitCode = 1`, ошибки в формате `file:line:col: error: CODE: message`

**Scenario:** --autofix исправляет dbc-ошибки, показывает количество [`integration`]

- **Given** файл с dbc-ошибкой (лишний @param)
- **When** `run(['--autofix', 'file.ts'])`
- **Then** `autoFixed > 0`, в выводе `Auto-fixed: N error(s)`
- **And** оставшиеся ошибки (header) в ESLint-формате

**Scenario:** Несколько файлов → агрегация ошибок [`integration`]

- **Given** 2 файла — один чистый, один с ошибками
- **When** `run(['clean.ts', 'dirty.ts'])`
- **Then** ошибки только от dirty.ts, `exitCode = 1`

**Scenario:** Нет файлов → exit 0 [`integration`]

- **Given** вызов без аргументов и без --staged
- **When** `run([])`
- **Then** `exitCode = 0`, `errors` пуст

**Scenario:** Файл не существует → пропущен с continue [`integration`]

- **Given** несуществующий путь
- **When** `run(['nonexistent.ts'])`
- **Then** `exitCode = 0`, `errors` пуст (пропущен, не краш)

**Scenario:** Файлы определяются по расширению .ts, не по позиции [`integration`]

- **Given** `run(['not-a-file', 'real.ts'])` — первый аргумент не .ts
- **When** проверка
- **Then** `not-a-file` проигнорирован, `real.ts` проверен

**Scenario:** Пути в ошибках консистентны между проверками [`integration`]

- **Given** файл с относительным путём `subdir/file.ts`
- **When** `run(['subdir/file.ts'])`
- **Then** ВСЕ ошибки содержат `file: 'subdir/file.ts'` (не абсолютный путь)

## 3. Phases

### Phase P1 — tests

- **Kind:** test
- **Rules:** typescript-rules, node-test
- **Target Test Files:** `cli/cmd/lint/__tests__/lint.cmd.test.ts` (Modify)
- **Acceptance:**
  - 8 интеграционных сценариев
  - Использовать `run()` напрямую (не spawn process)
  - Для --autofix: временный файл во временной директории, очистка после теста
  - Для файловых тестов: создать временные .ts файлы с нужным содержимым
  - `npm test` → все тесты зелёные

## 4. Execution Log

### Round 1 — 2026-05-15, initial

#### P1
- [x] `2026-05-15T18:19:13Z` recon targets=exists divergence=none
- [x] `2026-05-15T18:19:13Z` rules typescript-rules, node-test
- [x] `2026-05-15T18:23:15Z` file cli/cmd/lint/__tests__/lint.cmd.test.ts
- [x] `2026-05-15T18:23:15Z` test cli/cmd/lint/__tests__/lint.cmd.test.ts
- [x] `2026-05-15T18:23:15Z` cov чистый файл → exit 0 → lint.cmd.test.ts::should exit 0 for clean file
- [x] `2026-05-15T18:23:15Z` cov файл с ошибками → exit 1 → lint.cmd.test.ts::should exit 1 with ESLint format
- [x] `2026-05-15T18:23:15Z` cov --autofix показывает количество → lint.cmd.test.ts::should show autoFixed count
- [x] `2026-05-15T18:23:15Z` cov несколько файлов → lint.cmd.test.ts::should aggregate multiple files
- [x] `2026-05-15T18:23:15Z` cov нет файлов → exit 0 → lint.cmd.test.ts::should handle no files
- [x] `2026-05-15T18:23:15Z` cov файл не существует → lint.cmd.test.ts::should skip missing files
- [x] `2026-05-15T18:23:15Z` cov фильтр по .ts → lint.cmd.test.ts::should filter by extension
- [x] `2026-05-15T18:23:15Z` cov пути консистентны → lint.cmd.test.ts::should use consistent paths
- [x] `2026-05-15T18:23:40Z` ver node --test cli/cmd/lint/__tests__/lint.cmd.test.ts → pass exit=0
- [x] `2026-05-15T18:23:40Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-15T18:23:40Z` DONE
**Handoff →** artifacts: [cli/cmd/lint/__tests__/lint.cmd.test.ts]; decisions: [test-count=8, test-runner=node-test, autofix-verified=true, file-path-consistency-verified=true]; open: []
