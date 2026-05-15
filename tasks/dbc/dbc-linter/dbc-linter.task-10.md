# Task: TSK-10 — Тесты: 88 fixture-кейсов полного покрытия

## 1. Meta & Traceability

- **Task-ID:** TSK-10
- **Purpose:** Написать исчерпывающий набор fixture-тестов для dbc-linter, покрывающий все 88 тестовых случаев из матрицы покрытия: happy path, каждый код ошибки, autofix, edge cases, DbcContractMatchValidator unit-тесты.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** TSK-09
- **Spec References:**
  - Матрица покрытия: [dbc-linter spec §9 Обязательная матрица покрытия](../../specs/dbc/dbc-linter/dbc-linter.spec.md)
  - Requirements FR-29: [dbc spec §3.1](../../specs/dbc/dbc.spec.md)
  - All error codes: [dbc spec §3.1 Коды ошибок линтера](../../specs/dbc/dbc.spec.md)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |
  | node-test        | ai/directives/testing/node-test.xml       | Before writing or modifying test files       |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None
- **Target Files:** `services/dbc/linter/implementations/ts/__tests__/fixtures/` (Create — 88+ fixture-файлов)
- **Target Test Files:** `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` (Create)

## 2. Acceptance Criteria (BDD)

**Feature:** Полное тестовое покрытие dbc-linter

Тесты структурированы по группам A–M согласно матрице покрытия. Каждый тестовый случай = отдельный fixture-файл + тест-кейс.

**Scenario:** Группа A — Happy path (10 кейсов) [`unit`]

- **Given** fixture-файлы `fixtures/happy/*.ts`
- **When** каждый файл подан на `lint()`
- **Then** `errors` пуст для каждого

**Scenario:** Группа B — ERR_DBC_LINT_MISSING_CONTRACT (16 кейсов) [`unit`]

- **Given** fixture-файлы `fixtures/missing-contract/*.ts`
- **When** каждый файл подан на `lint()`
- **Then** каждый возвращает ожидаемое количество ошибок `ERR_DBC_LINT_MISSING_CONTRACT`

**Scenario:** Группа C — ERR_DBC_LINT_PARSE_FAILED (2 кейса) [`unit`]

- **Given** C1: битый синтаксически файл + C2: пустой файл
- **When** каждый подан на `lint()`
- **Then** C1: ровно одна ошибка `ERR_DBC_LINT_PARSE_FAILED` (tree-sitter не может распарсить)
- **And** C2: пустой массив ошибок (пустой файл успешно парсится tree-sitter, 0 export-сущностей → 0 ошибок)
- **Note:** бинарные файлы не поддерживаются (отложено)

**Scenario:** Группа D — ERR_DBC_LINT_PARAM_MISSING (5 кейсов) [`unit`]

- **Given** fixture-файлы с параметрами в сигнатуре, отсутствующими в контракте
- **When** каждый подан на `lint()`
- **Then** ошибки `ERR_DBC_LINT_PARAM_MISSING` с правильным количеством

**Scenario:** Группа E — ERR_DBC_LINT_PARAM_EXTRA (4 кейса) [`unit`]

- **Given** fixture-файлы с лишними @param
- **When** подан на `lint()`
- **Then** ошибки `ERR_DBC_LINT_PARAM_EXTRA`
- **And** после `lintAndFix()` лишние @param удалены

**Scenario:** Группа F — ERR_DBC_LINT_PARAM_ORDER (3 кейса) [`unit`]

- **Given** fixture-файлы с нарушенным порядком @param
- **When** подан на `lint()`
- **Then** ошибки `ERR_DBC_LINT_PARAM_ORDER`
- **And** после `lintAndFix()` порядок исправлен

**Scenario:** Группа G — ERR_DBC_LINT_RETURNS_MISSING (3 кейса) [`unit`]

- **Given** fixture-файлы где не-void функция/метод/геттер без @returns
- **When** подан на `lint()`
- **Then** ошибки `ERR_DBC_LINT_RETURNS_MISSING`

**Scenario:** Группа H — ERR_DBC_LINT_RETURNS_UNEXPECTED (6 кейсов) [`unit`]

- **Given** fixture-файлы где @returns присутствует но не нужен (void, constructor, setter, field, const)
- **When** подан на `lint()`
- **Then** ошибки `ERR_DBC_LINT_RETURNS_UNEXPECTED`
- **And** после `lintAndFix()` @returns удалены

**Scenario:** Группа I — ERR_DBC_LINT_TYPE_REDUNDANT (4 кейса) [`unit`]

- **Given** fixture-файлы с `{type}` в @param/@returns
- **When** подан на `lint()`
- **Then** ошибки `ERR_DBC_LINT_TYPE_REDUNDANT`
- **And** после `lintAndFix()` `{type}` удалены

**Scenario:** Группа J — Ошибки парсера (4 кейса) [`unit`]

- **Given** fixture-файлы с контрактами нарушающими правила парсера
- **When** подан на `lint()`
- **Then** ошибки `ERR_DBC_ORDER`, `ERR_DBC_PURPOSE_CONFLICT`, `ERR_DBC_PARAM_NAME_MISSING`, `ERR_DBC_SEE_FORMAT_INVALID`

**Scenario:** Группа K — Autofix комбинированный (4 кейса) [`integration`]

- **Given** файл со всеми autofix-абельными ошибками одновременно
- **When** `lintAndFix()`
- **Then** `autoFixed` = количество исправленных
- **And** multi-line→inline работает только когда dry-run проходит

**Scenario:** Группа L — Edge cases (10 кейсов) [`unit`]

- **Given** empty file, no-exports, re-export, private class, nested class, decorators, optional param, rest param, comment styles
- **When** подан на `lint()`
- **Then** корректное поведение без падений

**Scenario:** Группа M — DbcContractMatchValidator unit-тесты (17 кейсов) [`unit`]

- **Given** прямые вызовы `validator.validate(entries, signature, kind)`
- **When** каждый случай из матрицы
- **Then** правильные коды ошибок или пустой массив

**Scenario:** Все тесты проходят [`unit`]

- **Given** реализованы все 88+ тестовых кейсов
- **When** `node --test services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts`
- **Then** exit=0, все тесты green

## 3. Verification

| Command                                                                                     | Required by      |
| ------------------------------------------------------------------------------------------- | ---------------- |
| `tsc --noEmit` exit=0                                                                       | typescript-rules |
| `node --test services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` exit=0 | node-test        |

- **Completion additions:** none beyond project baseline

## 4. Test Scenario Coverage

- Scenario Группа A (10 happy) → `dbc-ts-linter.test.ts :: A1–A10`
- Scenario Группа B (16 missing) → `dbc-ts-linter.test.ts :: B1–B16`
- Scenario Группа C (2 parse-failed) → `dbc-ts-linter.test.ts :: C1–C2`
- Scenario Группа D (5 param-missing) → `dbc-ts-linter.test.ts :: D1–D5`
- Scenario Группа E (4 param-extra) → `dbc-ts-linter.test.ts :: E1–E4`
- Scenario Группа F (3 param-order) → `dbc-ts-linter.test.ts :: F1–F3`
- Scenario Группа G (3 returns-missing) → `dbc-ts-linter.test.ts :: G1–G3`
- Scenario Группа H (6 returns-unexpected) → `dbc-ts-linter.test.ts :: H1–H6`
- Scenario Группа I (4 type-redundant) → `dbc-ts-linter.test.ts :: I1–I4`
- Scenario Группа J (4 parser-errors) → `dbc-ts-linter.test.ts :: J1–J4`
- Scenario Группа K (4 autofix-combined) → `dbc-ts-linter.test.ts :: K1–K4`
- Scenario Группа L (10 edge) → `dbc-ts-linter.test.ts :: L1–L10`
- Scenario Группа M (17 validator) → `dbc-ts-linter.test.ts :: M1–M17`
- Scenario Все тесты проходят → `node --test` exit=0

## 5. Execution Log

_(Plan-as-checklist; token vocabulary + protocol in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-15, initial

- [x] `[ts]` Test file: `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts`.
- [x] `[ts]` Fixture files: `services/dbc/linter/implementations/ts/__tests__/fixtures/happy/*` (10 файлов).
- [x] `[ts]` Fixture files: `fixtures/missing-contract/*` (16 файлов).
- [x] `[ts]` Fixture files: `fixtures/parse-failed/*` (2 файла).
- [x] `[ts]` Fixture files: `fixtures/param-missing/*` (5 файлов).
- [x] `[ts]` Fixture files: `fixtures/param-extra/*` (4 файла).
- [x] `[ts]` Fixture files: `fixtures/param-order/*` (3 файла).
- [x] `[ts]` Fixture files: `fixtures/returns-missing/*` (3 файла).
- [x] `[ts]` Fixture files: `fixtures/returns-unexpected/*` (6 файлов).
- [x] `[ts]` Fixture files: `fixtures/type-redundant/*` (4 файла).
- [x] `[ts]` Fixture files: `fixtures/parser-errors/*` (4 файла).
- [x] `[ts]` Fixture files: `fixtures/autofix-combined/*` (4 файла).
- [x] `[ts]` Fixture files: `fixtures/edge/*` (10 файлов).
- [x] `[ts]` Implementation: `DbcContractMatchValidator` unit-тесты (17 кейсов).
- [x] `[ts]` Verification: `tsc --noEmit` → pass [exit=0].
- [x] `[ts]` Verification: `node --test services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` → pass [exit=0].
- [x] `[ts]` Scenario coverage: Группа A → `dbc-ts-linter.test.ts :: A1–A10`.
- [x] `[ts]` Scenario coverage: Группа B → `dbc-ts-linter.test.ts :: B1–B16`.
- [x] `[ts]` Scenario coverage: Группа C → `dbc-ts-linter.test.ts :: C1–C2`.
- [x] `[ts]` Scenario coverage: Группа D → `dbc-ts-linter.test.ts :: D1–D5`.
- [x] `[ts]` Scenario coverage: Группа E → `dbc-ts-linter.test.ts :: E1–E4`.
- [x] `[ts]` Scenario coverage: Группа F → `dbc-ts-linter.test.ts :: F1–F3`.
- [x] `[ts]` Scenario coverage: Группа G → `dbc-ts-linter.test.ts :: G1–G3`.
- [x] `[ts]` Scenario coverage: Группа H → `dbc-ts-linter.test.ts :: H1–H6`.
- [x] `[ts]` Scenario coverage: Группа I → `dbc-ts-linter.test.ts :: I1–I4`.
- [x] `[ts]` Scenario coverage: Группа J → `dbc-ts-linter.test.ts :: J1–J4`.
- [x] `[ts]` Scenario coverage: Группа K → `dbc-ts-linter.test.ts :: K1–K4`.
- [x] `[ts]` Scenario coverage: Группа L → `dbc-ts-linter.test.ts :: L1–L10`.
- [x] `[ts]` Scenario coverage: Группа M → `dbc-ts-linter.test.ts :: M1–M17`.
- [x] `[ts]` Self-audit: walked loaded rule axioms against generated code. Violations: none.
- [x] `[ts]` Tracker synced: `tasks/dbc/README.md` + `tasks/README.md`.
- [x] `[ts]` Status: [x] DONE.

### Round 2 — 2026-05-15, audit-driven fix: F-01, F-02, F-03

- [x] `[ts]` F-03: Added `@consumers: DbcTsLinter` header to `dbc-ts-linter.test.ts`.
- [x] `[ts]` F-01: Tracker synced — `tasks/dbc/README.md` TSK-10 → `[x] DONE` (Reopens=1); `tasks/README.md` Done → 10/10.
- [x] `[ts]` F-02: BDD scenario Group C updated — C2 (empty file) → empty report; binary file parsing deferred.
- [x] `[ts]` Verification: `tsc --noEmit` → pass [exit=0].
- [x] `[ts]` Verification: `node --test services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` → pass [exit=0].
- [x] `[ts]` Status: [x] DONE.
