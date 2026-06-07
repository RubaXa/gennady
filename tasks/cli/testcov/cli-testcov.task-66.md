# Task: TSK-66 — testcov: port coverage-tree as gennady CLI command

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-66
- **Status:** [ ] DONE
- **Purpose:** Портировать standalone-скрипт `coverage-tree.ts` из проекта messenger (TSK-98) как CLI-команду `gennady testcov`. Адаптировать под конвенции gennady: file headers, структурные анкеры, JSDoc-контракты, `parseArgs`, регистрация в dispatcher'е. Добавить file-detail режим с аннотированным исходным кодом.
- **Scope:** `cli`
- **Module:** `testcov`
- **Dependencies:** shared/common/parse-args.ts
- **Spec References:**
  - [testcov module spec](../../specs/cli/testcov/testcov.spec.md)
  - [cli scope](../../specs/cli/cli.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit` (detectRunners, runDiagnostics), `integration` (--check), `e2e` (tree output, file detail)
- **Deferred Runtime Scope:** E2E тесты для file-detail режима

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | spec | P1   | [x]    |
| P3  | impl | P1   | [x]    |
| P4  | impl | P3   | [x]    |
| P5  | spec | P4   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl: initial port (runner detection + tree + diagnostics)

- **Objective:** Портировать `coverage-tree.ts` как `cli/cmd/testcov/testcov.cmd.ts`. Все режимы: dirs, --files, --flat, --json, --run, --check, `<path>`. Детекция раннеров (vitest/jest/node:test). Диагностическая система (8 кодов).
- **Target Files:**
  - `cli/cmd/testcov/index.ts` (Create)
  - `cli/cmd/testcov/testcov.cmd.ts` (Create)
  - `cli/cmd/testcov/help.ts` (Create)
  - `cli/gennady.ts` (Edit — register command)
  - `cli/cmd/help/help.cmd.ts` (Edit — add to main help)
  - `cli/AGENTS.md` (Edit — add to commands table)
  - `cli/cmd/README.md` (Edit — add scenario + table entry)
- **Exit:** `npx gennady testcov --files` выводит дерево с покрытием; `--check` показывает диагностику.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — spec: SDD-документация

- **Objective:** Написать модульную спеку + task-файл, синхронизировать с реализацией.
- **Target Files:**
  - `specs/cli/testcov/testcov.spec.md` (Create)
  - `tasks/cli/testcov/cli-testcov.task-66.md` (Create)
- **Exit:** Спека описывает все 27 сущностей, 4 контракта, 5 решений, 8 флагов; task содержит 5 фаз.

<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — impl: file detail + `__tests__` exclusion

- **Objective:** Добавить режим детализации по файлу: аннотированный исходный код с подсветкой непокрытых строк, контекст ±N строк, аннотации веток и функций. Исключить `__tests__` директории из вывода.
- **Target Files:**
  - `cli/cmd/testcov/testcov.cmd.ts` (Edit)
  - `cli/cmd/testcov/help.ts` (Edit)
- **Implementation Notes:**
  - `buildFileDetail(absPath, covEntry)` — построение per-line map из `statementMap`/`branchMap`/`fnMap`
  - `printFileDetail(detail, ctx, covEntry)` — рендеринг: ♦️/🔸 маркеры; ANSI-подсветка только с `--color`
  - `--context`/`-c <N>` флаг (default: 2)
  - `--color` флаг — включает красный/жёлтый фон для непокрытых/частичных строк
  - `__tests__` добавлен в SKIP_DIRS (в отличие от оригинального coverage-tree.ts)
- **Exit:** `npx gennady testcov cli/cmd/_shared/update-check-worker.ts` показывает аннотированный файл.

<!--/SECTION:PHASE_P3-->

<!--SECTION:PHASE_P4-->

### P4 — impl: basename fallback

- **Objective:** Добавить двухшаговый resolve coverage-записей: exact path → basename match. Гарантирует работу при несовпадении путей в coverage JSON и текущем cwd.
- **Target Files:**
  - `cli/cmd/testcov/testcov.cmd.ts` (Edit)
- **Implementation Notes:**
  - `findCovEntry(absPath, covJson)` — для file-detail: exact match → basename match
  - `covRawByName` — basename-индексированный кеш
  - `getCovRaw(fp)` — `covRaw[fp] ?? covRawByName[basename(fp)]` для `walk()`, `getDirStats()`, `collectFlat()`
- **Exit:** Все функции поиска coverage-записей используют двухшаговый resolve.

<!--/SECTION:PHASE_P4-->

<!--SECTION:PHASE_P5-->

### P5 — spec: аудит и синхронизация

- **Objective:** Сверить спеку с реализацией, исправить все расхождения, добавить недостающие сущности и решения.
- **Target Files:**
  - `specs/cli/testcov/testcov.spec.md` (Edit)
  - `tasks/cli/testcov/cli-testcov.task-66.md` (Edit)
  - `cli/cmd/testcov/index.ts` (Edit — fix @tasks)
  - `cli/cmd/testcov/help.ts` (Edit — fix @consumers, add missing examples)
  - `cli/cmd/testcov/testcov.cmd.ts` (Edit — fix @tasks)
- **Exit:** Все 11 расхождений исправлены; `npm run lint` → clean; spec полностью отражает реализацию.

<!--/SECTION:PHASE_P5-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

### Feature: Runner detection

- **SC-1 — Vitest detected via devDeps:** `package.json` содержит `vitest` → `detectRunners()[0].name === 'vitest'`
- **SC-2 — Jest detected:** `jest` в devDeps → `name === 'jest'`
- **SC-3 — node:test detected:** `c8` + `node --test` скрипт → `name === 'node:test'`
- **SC-4 — No runner:** пустой `package.json` → `detectRunners()` → `[]`
- **SC-5 — Priority:** vitest + jest → `[0].name === 'vitest'`

### Feature: Diagnostics

- **SC-6 — NO_RUNNER:** нет раннера → diagnostic с `code = 'NO_RUNNER'`, `level = 'error'`
- **SC-7 — NO_COVERAGE_FILE:** нет `coverage-final.json` → `code = 'NO_COVERAGE_FILE'`
- **SC-8 — --check exit 0:** конфигурация OK → exit 0, stderr содержит `✅ configuration OK`
- **SC-9 — --check --json:** валидный JSON с `ok`, `runner`, `coverageFile`, `diagnostics`

### Feature: Coverage tree

- **SC-10 — dirs-only (default):** только `📁` строки, без `📄`
- **SC-11 — --files:** `📁` + `📄`, без `.test.ts`/`.spec.ts`, без `__tests__/` директорий
- **SC-12 — ⚫ vs 🔴:** `sT = 0` → ⚫; `sT > 0, sH = 0` → 🔴
- **SC-13 — <path> directory:** показывает subtree указанной директории

### Feature: File detail

- **SC-14 — Uncovered file regions:** непокрытые строки выделены красным, частично покрытые — жёлтым
- **SC-15 — Branch annotations:** `← branch N/M taken` на строке объявления ветки
- **SC-16 — Context control:** `-c 0` — только непокрытые строки; `-c 5` — ±5 контекста
- **SC-17 — Fully covered file:** выводится целиком (все строки с `·`)

### Feature: Basename fallback

- **SC-18 — Exact match:** путь в coverage JSON совпадает с fs-путём → используется exact
- **SC-19 — Basename fallback:** путь не совпадает → поиск по basename среди всех ключей

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                           | Required by                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| `npx gennady testcov`                                             | P1: дерево директорий без ошибок                         |
| `npx gennady testcov --files`                                     | P1: дерево с файлами, без `__tests__` и test-файлов      |
| `npx gennady testcov --flat --json`                               | P1: валидный JSON                                        |
| `npx gennady testcov --check`                                     | P1: диагностика конфигурации                             |
| `npx gennady testcov --check --json`                              | P1: JSON с `ok`, `runner`, `coverageFile`, `diagnostics` |
| `npx gennady testcov --help`                                      | P1: справка со всеми флагами                             |
| `npx gennady testcov cli/cmd/_shared/update-check-worker.ts`      | P3: аннотированный файл с подсветкой                     |
| `npx gennady testcov cli/cmd/_shared/update-check-worker.ts -c 0` | P3: только непокрытые строки                             |
| `npm run lint`                                                    | P5: lint → clean                                         |
| `npm run type-check`                                              | P5: tsc --noEmit → clean                                 |

<!--/SECTION:VERIFICATION-->

<!--SECTION:EXECUTION_LOG-->

## 6. Execution Log

### Round 1 — 2026-06-07, initial port + SDD + file detail + basename fallback + audit

#### P1

- [x] `2026-06-07` port `coverage-tree.ts` → `cli/cmd/testcov/testcov.cmd.ts`
- [x] `2026-06-07` созданы `index.ts`, `help.ts`
- [x] `2026-06-07` регистрация в `gennady.ts`, `help.cmd.ts`, `AGENTS.md`, `cmd/README.md`
- [x] `2026-06-07` DONE

#### P2

- [x] `2026-06-07` создана `specs/cli/testcov/testcov.spec.md` (27 сущностей, 4 контракта, 5 решений, 8 флагов)
- [x] `2026-06-07` создан `tasks/cli/testcov/cli-testcov.task-66.md`
- [x] `2026-06-07` DONE

#### P3

- [x] `2026-06-07` impl `buildFileDetail()` + `printFileDetail()` — аннотированный исходный код
- [x] `2026-06-07` impl `--context`/`-c <N>` флаг (default: 2)
- [x] `2026-06-07` branch/fn аннотации через `branchMap`/`fnMap` (одна на строку объявления)
- [x] `2026-06-07` добавлен `__tests__` в SKIP_DIRS
- [x] `2026-06-07` DONE

#### P4

- [x] `2026-06-07` impl `findCovEntry(absPath, covJson)` — exact → basename match
- [x] `2026-06-07` impl `covRawByName` кеш + `getCovRaw(fp)` fallback
- [x] `2026-06-07` обновлены `getDirStats()`, `walk()`, `collectFlat()` на использование `getCovRaw()`
- [x] `2026-06-07` DONE

#### P5

- [x] `2026-06-07` аудит: найдено 11 расхождений spec ↔ code
- [x] `2026-06-07` spec: добавлены `findCovEntry`, `getCovRaw`, `PkgJson`, `DiagCode` в Entity Inventory
- [x] `2026-06-07` spec: исправлена сигнатура `runCmd(resultsFile)`
- [x] `2026-06-07` spec: добавлен `--help`/`-h` в Public Options, D-TC005 в Decision Log
- [x] `2026-06-07` code: `@tasks TSK-testcov-1` → `TSK-66` во всех файлах
- [x] `2026-06-07` help.ts: `@consumers` → `testcov.cmd.ts`; добавлен `--help`/`-h` и `-c 0` пример
- [x] `2026-06-07` ver `npm run lint` → clean
- [x] `2026-06-07` DONE

#### Round close

- [x] `2026-06-07` task-файл синхронизирован с финальной спекой и кодом
- [x] `2026-06-07` DONE

<!--/SECTION:EXECUTION_LOG-->
