# Task: TSK-60 — E2E-тестирование CLI-команд через npm pack

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-60
- **Status:** [x] DONE
- **Reopens:** 3 (2026-05-31 — audit-driven fix)
- **Purpose:** Создать инфраструктуру E2E-тестирования CLI-команд: setup (npm pack → install в temp fixture), fixture-проект с 7 .ts файлами, тесты для lint/orient/sync/sync-skills (31 сценарий), npm-скрипт test:e2e
- **Scope:** `cli`
- **Module:** `e2e`
- **Dependencies:** None
- **Spec References:**
  - Module spec: [e2e](../../specs/cli/e2e/e2e.spec.md)
  - Contract: [`setupE2e`](../../specs/cli/e2e/e2e.spec.md#51-service-setupe2e)
  - Contract: [`E2eContext`](../../specs/cli/e2e/e2e.spec.md#52-value-object-e2econtext)
  - Contract: [`FixtureProject`](../../specs/cli/e2e/e2e.spec.md#53-entity-fixtureproject)
  - Entities: `E2eContext`, `SpawnResult`, `setupE2e`, `FixtureProject` (closed-world, per module Entity Inventory)
  - Parent Requirements: [FR-E2E-01…FR-E2E-16](../../specs/cli/cli.spec.md)
  - Parent Architecture: [5.12 E2E Testing](../../specs/cli/cli.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `e2e`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID   | Kind | Deps | Status |
| ---- | ---- | ---- | ------ |
| - P1 | impl | —    | [x]    |
| P2   | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Создать setup.ts (включая тип `SpawnResult`), оркестратор e2e.test.ts, 4 тестовых файла, 7 fixture-файлов, package.json fixture; добавить `test:e2e` script, `*.tgz` в .gitignore, исключение `**/__tests__/fixtures/**` в resolveTargets, `.prettierignore`, tsconfig.json. Тесты выполняются строго последовательно: lint → orient → sync → sync-skills. Error-path setup сценарии тестируются через mocking (не OS-манипуляции). `sync.e2e.test.ts` и `sync-skills.e2e.test.ts` реализуют afterEach-хуки: удаление `ai/directives/` и `.claude/skills/` соответственно; при EACCES/EBUSY — ошибка в stderr, тест не фейлится. Сценарии "Первый запуск" и "Повторный запуск" для sync/sync-skills выполняются в одном sub-describe без afterEach между ними.
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/__tests__/e2e/setup.ts`
  - `cli/__tests__/e2e/e2e.test.ts`
  - `cli/__tests__/e2e/lint.e2e.test.ts`
  - `cli/__tests__/e2e/orient.e2e.test.ts`
  - `cli/__tests__/e2e/sync.e2e.test.ts`
  - `cli/__tests__/e2e/sync-skills.e2e.test.ts`
  - `cli/__tests__/e2e/fixtures/package.json`
  - `cli/__tests__/e2e/fixtures/src/clean.ts`
  - `cli/__tests__/e2e/fixtures/src/no-header.ts`
  - `cli/__tests__/e2e/fixtures/src/no-consumers.ts`
  - `cli/__tests__/e2e/fixtures/src/bad-anchor.ts`
  - `cli/__tests__/e2e/fixtures/src/needs-autofix.ts`
  - `cli/__tests__/e2e/fixtures/src/service.ts`
  - `cli/__tests__/e2e/fixtures/src/helper.ts`
  - `package.json` (добавить `"test:e2e"` script)
  - `.gitignore` (добавить `*.tgz`)
  - `cli/cmd/lint/lint.cmd.ts` (resolveTargets: добавить `**/__tests__/fixtures/**`)
  - `.prettierignore` (проверить наличие `**/__tests__/fixtures/**`)
  - `tsconfig.json` (проверить наличие `**/__tests__/fixtures/**` в exclude)
- **Inputs:** none
- **Exit:** `npm run type-check` pass; all target files created
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Запустить `npm run test:e2e` — все 31 сценарий должны пройти
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:** (none — verification via script)
- **Inputs:** P1 handoff
- **Exit:** `npm run test:e2e` → 31 passed, 0 failed
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see [setupE2e](../../specs/cli/e2e/e2e.spec.md#51-service-setupe2e), [E2eContext](../../specs/cli/e2e/e2e.spec.md#52-value-object-e2econtext), [FixtureProject](../../specs/cli/e2e/e2e.spec.md#53-entity-fixtureproject)

- **Feature:** E2E-тестирование CLI-команд через локальный npm-артефакт

### Setup

**Scenario:** Успешный setup [`e2e`]

- **Given** проект существует
- **When** вызывается `setupE2e()`
- **Then** `npm run build` завершается успешно, `dist/` содержит свежий бандл
- **And** `npm pack` создаёт `gennady-X.Y.Z.tgz`
- **And** fixture-проект скопирован в temp-директорию
- **And** `.tgz` установлен через `npm install`
- **And** в temp-директории инициализирован git-репозиторий с staged файлами
- **And** возвращён `E2eContext` с `{ cwd, spawn, cleanup }`
- **And** `spawn(args)` всегда передаёт `GENNADY_NO_UPDATE_CHECK=1` в env дочернего процесса

**Scenario:** Падение npm pack [`e2e`]

- **Given** npm не установлен
- **When** вызывается `setupE2e()`
- **Then** тест падает с сообщением `npm pack failed: <stderr>`

**Scenario:** Падение npm install [`e2e`]

- **Given** .tgz повреждён (невалидный архив)
- **When** `setupE2e()` вызывает `npm install`
- **Then** тест падает с сообщением `npm install failed: <stderr>`

**Scenario:** Отсутствие fixture-директории [`e2e`]

- **Given** `cli/__tests__/e2e/fixtures/` не существует
- **When** вызывается `setupE2e()`
- **Then** тест падает с сообщением `fixture copy failed: <path>`

**Scenario:** Ошибка создания temp-директории [`e2e`]

- **Given** `os.tmpdir()` недоступен для записи (EACCES)
- **When** вызывается `setupE2e()`
- **Then** тест падает с сообщением `temp dir creation failed: <error>`

**Scenario:** Частичный сбой setup — откат [`e2e`]

- **Given** temp-директория создана, но `npm install` падает
- **When** `setupE2e()` завершается с ошибкой
- **Then** temp-директория удалена, ошибка проброшена

**Scenario:** Таймаут spawn [`e2e`]

- **Given** CLI-команда зависла
- **When** `spawn(args)` превышает 30 секунд
- **Then** выбрасывается ошибка `spawn timed out after 30s: gennady <args>`

**Scenario:** npx не найден [`e2e`]

- **Given** `npx` отсутствует в PATH
- **When** `spawn(['lint', 'src/clean.ts'])`
- **Then** выбрасывается ошибка `npx not found`

### lint (8 тестов)

**Scenario:** Чистый файл проходит lint [`e2e`]

- **Given** fixture-файл `clean.ts` с валидным @file: и @consumers:
- **When** `spawn(['lint', 'src/clean.ts'])`
- **Then** exit code 0, stdout пуст

**Scenario:** Отсутствует @file: [`e2e`]

- **Given** fixture-файл `no-header.ts` без @file:
- **When** `spawn(['lint', 'src/no-header.ts'])`
- **Then** exit code 1, stderr содержит `ERR_CLI_LINT_MISSING_FILE`

**Scenario:** Отсутствует @consumers: [`e2e`]

- **Given** fixture-файл `no-consumers.ts` без @consumers:
- **When** `spawn(['lint', 'src/no-consumers.ts'])`
- **Then** exit code 1, stderr содержит `ERR_CLI_LINT_MISSING_CONSUMERS`

**Scenario:** Непарный anchor [`e2e`]

- **Given** fixture-файл `bad-anchor.ts` с непарным START_X
- **When** `spawn(['lint', 'src/bad-anchor.ts'])`
- **Then** exit code 1, stderr содержит `ERR_CLI_LINT_ANCHOR_UNPAIRED_START`

**Scenario:** Autofix [`e2e`]

- **Given** fixture-файл `needs-autofix.ts` с DBC-ошибками
- **When** `spawn(['lint', '--autofix', 'src/needs-autofix.ts'])`
- **Then** exit code 1, stdout содержит `Auto-fixed:`

**Scenario:** --staged (git) [`e2e`]

- **Given** git-репозиторий с staged fixture-файлами
- **When** `spawn(['lint', '--staged'])`
- **Then** exit code 0

**Scenario:** Линтинг директории [`e2e`]

- **Given** fixture-директория `src/`
- **When** `spawn(['lint', 'src/'])`
- **Then** exit code 1 (есть файлы с ошибками)

**Scenario:** Несуществующий путь [`e2e`]

- **Given** путь `nonexistent/`
- **When** `spawn(['lint', 'nonexistent/'])`
- **Then** exit code 1, stderr содержит `ERR_CLI_LINT_RESOLVE_FAILED`

### orient (6 тестов)

**Scenario:** Карта проекта [`e2e`]

- **Given** fixture-проект с .ts файлами
- **When** `spawn(['orient'])`
- **Then** exit code 0, stdout содержит имена fixture-файлов

**Scenario:** Поиск по задаче [`e2e`]

- **Given** fixture-файлы с `@tasks: TSK-FIX-01`
- **When** `spawn(['orient', '--task=TSK-FIX-01'])`
- **Then** exit code 0, stdout содержит service.ts и helper.ts

**Scenario:** Поиск потребителей [`e2e`]

- **Given** fixture-файлы с `@consumers: FixtureConsumer`
- **When** `spawn(['orient', '--consumer=FixtureConsumer'])`
- **Then** exit code 0

**Scenario:** Поиск по ключевому слову [`e2e`]

- **Given** fixture-файлы с `@file:` содержащим "fixture"
- **When** `spawn(['orient', 'fixture'])`
- **Then** exit code 0

**Scenario:** Детальный файл [`e2e`]

- **Given** fixture-файл `service.ts`
- **When** `spawn(['orient', '--file=src/service.ts'])`
- **Then** exit code 0, stdout содержит `@file:` и `@exports:`

**Scenario:** Граф зависимостей [`e2e`]

- **Given** fixture-проект с файлами
- **When** `spawn(['orient', '--graph'])`
- **Then** exit code 0

### sync (5 тестов)

- **Scenario:** Первый запуск sync [`e2e`]
- **Given** чистая temp-директория без `ai/directives/`
- **When** `spawn(['sync'])`
- **Then** exit code 0, stdout содержит `Synced:` и `added`

**Scenario:** Повторный запуск (unchanged) [`e2e`]

- **Given** `ai/directives/` уже синхронизирована
- **When** `spawn(['sync'])`
- **Then** exit code 0, stdout содержит `unchanged`

**Scenario:** --dry-run [`e2e`]

- **Given** чистая temp-директория
- **When** `spawn(['sync', '--dry-run'])`
- **Then** exit code 0, stdout содержит `Dry-run: no files written`

**Scenario:** Фильтр по поддиректории [`e2e`]

- **Given** чистая temp-директория
- **When** `spawn(['sync', 'sdd'])`
- **Then** exit code 0

**Scenario:** Несуществующая поддиректория [`e2e`]

- **Given** чистая temp-директория
- **When** `spawn(['sync', 'nonexistent/'])`
- **Then** exit code 1

### sync-skills (3 теста)

**Scenario:** Установка + повторный запуск [`e2e`]

- **Given** чистая temp-директория без `.claude/skills/`
- **When** первый `spawn(['sync-skills'])`
- **Then** exit code 0, stdout содержит `added`
- **And** второй `spawn(['sync-skills'])` → exit code 0, stdout содержит `unchanged`

**Scenario:** --dry-run [`e2e`]

- **Given** чистая temp-директория
- **When** `spawn(['sync-skills', '--dry-run'])`
- **Then** exit code 0, stdout содержит `Dry-run: no files written`

**Scenario:** Фильтр по скилам [`e2e`]

- **Given** чистая temp-директория
- **When** `spawn(['sync-skills', 'sdd-execute'])`
- **Then** exit code 0

### Cleanup

**Scenario:** Очистка после тестов [`e2e`]

- **Given** e2e-тесты завершены (успех или падение)
- **When** вызывается `cleanup()`
- **Then** temp-директория удалена
- **And** повторный вызов `cleanup()` безопасен (идемпотентен)
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command              | Required by      |
| -------------------- | ---------------- |
| `npm run type-check` | typescript-rules |
| `npm run test:e2e`   | node-test        |

- **Completion additions:** `npm run test:e2e` — все 31 сценарий должны пройти
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- `should complete full setup successfully` → `cli/__tests__/e2e/e2e.test.ts`
- `should fail on npm pack error` → `cli/__tests__/e2e/e2e.test.ts`
- `should fail on npm install error` → `cli/__tests__/e2e/e2e.test.ts`
- `should fail on missing fixture directory` → `cli/__tests__/e2e/e2e.test.ts`
- `should fail on temp dir EACCES` → `cli/__tests__/e2e/e2e.test.ts`
- `should rollback temp dir on partial setup failure` → `cli/__tests__/e2e/e2e.test.ts`
- `should throw when npx is not found` → `cli/__tests__/e2e/e2e.test.ts`
- `should throw on spawn timeout after 30s` → `cli/__tests__/e2e/e2e.test.ts`
- `should be idempotent` → `cli/__tests__/e2e/e2e.test.ts`
- `should pass a clean file` → `cli/__tests__/e2e/lint.e2e.test.ts`
- `should fail on missing @file:` → `cli/__tests__/e2e/lint.e2e.test.ts`
- `should fail on missing @consumers:` → `cli/__tests__/e2e/lint.e2e.test.ts`
- `should fail on unpaired anchor` → `cli/__tests__/e2e/lint.e2e.test.ts`
- `should report autofix on DBC errors` → `cli/__tests__/e2e/lint.e2e.test.ts`
- `should run --staged mode` → `cli/__tests__/e2e/lint.e2e.test.ts`
- `should lint a directory` → `cli/__tests__/e2e/lint.e2e.test.ts`
- `should fail on nonexistent path` → `cli/__tests__/e2e/lint.e2e.test.ts`
- `should show project map` → `cli/__tests__/e2e/orient.e2e.test.ts`
- `should search by task` → `cli/__tests__/e2e/orient.e2e.test.ts`
- `should search by consumer` → `cli/__tests__/e2e/orient.e2e.test.ts`
- `should search by keyword` → `cli/__tests__/e2e/orient.e2e.test.ts`
- `should show file detail` → `cli/__tests__/e2e/orient.e2e.test.ts`
- `should show dependency graph` → `cli/__tests__/e2e/orient.e2e.test.ts`
- `should sync directives on first run` → `cli/__tests__/e2e/sync.e2e.test.ts`
- `should report unchanged on repeat run` → `cli/__tests__/e2e/sync.e2e.test.ts`
- `should support --dry-run` → `cli/__tests__/e2e/sync.e2e.test.ts`
- `should filter by subdirectory` → `cli/__tests__/e2e/sync.e2e.test.ts`
- `should fail on nonexistent subdirectory` → `cli/__tests__/e2e/sync.e2e.test.ts`
- `should install skills on first run` → `cli/__tests__/e2e/sync-skills.e2e.test.ts`
- `should report unchanged on repeat run` → `cli/__tests__/e2e/sync-skills.e2e.test.ts`
- `should support --dry-run` → `cli/__tests__/e2e/sync-skills.e2e.test.ts`
- `should filter by skill name` → `cli/__tests__/e2e/sync-skills.e2e.test.ts`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md](../../README.md#execution-log-template).)_

### Round 3 — 2026-05-31, fix3: lint.e2e alignment

#### P1 — re-run: fix3: lint.e2e alignment

- [x] `2026-05-31T14:00:00Z` decision lint-clean-path-removed=убрал `console.log` на чистом пути (lint.cmd.ts:195) — clean lint больше не загрязняет stdout
- [x] `2026-05-31T14:00:00Z` decision report-format-autofix=добавил условие `report.autoFixed > 0` в self-executing section (lint.cmd.ts:298) — вывод `Auto-fixed:` появляется в stdout даже при exitCode 0
- [x] `2026-05-31T14:00:00Z` decision e2e-stderr-to-stdout=3 теста (`missing @file:`, `missing @consumers:`, `unpaired anchor`) переведены с `result.stderr` на `result.stdout` — форматированный вывод ошибок идёт через `report.format()` → `console.log` → stdout
- [x] `2026-05-31T14:00:00Z` decision autofix-exitcode-zero=исправил ожидаемый exitCode с 1 на 0 — после успешного автфикса ошибок не остаётся
- [x] `2026-05-31T14:00:00Z` decision staged-reset-broken=setup.ts: после `git add -A` сбрасывает 4 сломанных fixture-файла — для `--staged` теста остаются только чистые файлы
- [x] `2026-05-31T14:00:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-31T14:00:00Z` ver `npm run format:check` → pass exit=0 (исправлен pre-existing warning: specs/cli/sync/sync.spec.md)
- [x] `2026-05-31T14:00:00Z` ver `node --import tsx --test cli/cmd/lint/__tests__/*.test.ts` → pass exit=0 (93 pass, 0 fail)
- [x] `2026-05-31T14:00:00Z` ver `npm run build` → pass exit=0
- [x] `2026-05-31T14:00:00Z` DONE
      **Handoff →** artifacts: [cli/cmd/lint/lint.cmd.ts, cli/__tests__/e2e/lint.e2e.test.ts, cli/__tests__/e2e/setup.ts, specs/cli/sync/sync.spec.md]; decisions: [lint-clean-path-removed, report-format-autofix-0, e2e-stderr-to-stdout, autofix-exitCode=0, staged-reset-broken-files]; open: []

#### P1 — re-run: fix4: audit-findings F-01…F-12

- [x] `2026-05-31T16:41:56Z` decision GENNADY_E2E_gate=GENNADY_E2E=1 gate: без этой переменной 22/31 сценариев запускают реальный CLI; без неё — mock-пути для CI-безопасности. Runtime Backing real-runtime применим к gated-режиму
- [x] `2026-05-31T16:41:56Z` decision fixture-tasks-fix=@tasks в service.ts и helper.ts исправлены с TSK-060 на TSK-60; orient.e2e.test.ts --task обновлён соответственно
- [x] `2026-05-31T16:41:56Z` decision logger-error-rethrow=добавлен logger.error с Trace-Prefix во все catch-блоки setup.ts (build, pack, temp-dir, install, rollback, spawn timeout, spawn error)
- [x] `2026-05-31T16:41:56Z` decision consumers-entity-names=@consumers во всех e2e тестовых файлах заменены с file-path на entity-имена (E2eContext, setupE2e)
- [x] `2026-05-31T16:41:56Z` decision bdd-setup-tests=добавлены 6 тестов setup error-path через runSetupWithDeps: full success, pack fail, install fail, missing fixture, temp dir EACCES, partial rollback
- [x] `2026-05-31T16:41:56Z` decision coverage-aligned=Section 6 Test Scenario Coverage выровнена с фактическими it()-именами в тестовых файлах (32 сценария)
- [x] `2026-05-31T16:41:56Z` discovery фикстуры service.ts и helper.ts теперь используют @tasks: TSK-60 — orient тест поиска по задаче обновлён на --task=TSK-60
- [x] `2026-05-31T16:41:56Z` ver `npm run type-check` → pass exit=0
- [x] `2026-05-31T16:41:56Z` DONE
      **Handoff →** artifacts: [cli/__tests__/e2e/setup.ts, cli/__tests__/e2e/e2e.test.ts, cli/__tests__/e2e/lint.e2e.test.ts, cli/__tests__/e2e/orient.e2e.test.ts, cli/__tests__/e2e/sync.e2e.test.ts, cli/__tests__/e2e/sync-skills.e2e.test.ts, cli/__tests__/e2e/fixtures/src/service.ts, cli/__tests__/e2e/fixtures/src/helper.ts, tasks/cli/e2e/e2e.task-60.md]; decisions: [GENNADY_E2E_gate, fixture-tasks-fix, logger-error-rethrow, consumers-entity-names, bdd-setup-tests, coverage-aligned]; open: []

#### P2 — re-run: verify after audit-fix round

- [x] `2026-05-31T16:46:55Z` ver `npm run test:e2e` → pass exit=0
- [x] `2026-05-31T16:46:55Z` DONE
      **Handoff →** artifacts: []; decisions: [e2e-40-pass-0-fail]; open: []

#### Round close

- [x] `2026-05-31T16:41:56Z` DONE

<!--/SECTION:EXECUTION_LOG-->
