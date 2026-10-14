# Task: DL-match — DbcTsLinter + DbcContractMatchValidator + autofix

<!--SECTION:META-->

## 1. Meta & Traceability

- **Task-ID:** DL-match
- **Status:** [ ] TODO
- **Status:** [ ] TODO
- **Purpose:** Реализовать `DbcContractMatchValidator` (сверка контракта с сигнатурой) и `DbcTsLinter` (lint + lintAndFix с autofix-цепочкой).
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** DL-ast
- **Spec References:**
  - Adapter `DbcTsLinter`: [dbc-linter spec §3](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#dbctslinter)
  - Service `DbcContractMatchValidator`: [dbc-linter spec §3](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#dbccontractmatchvalidator)
  - Contract DbcLinter: [dbc-linter spec §4.1](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#port-dbclinter)
  - Contract Validator: [dbc-linter spec §4.3](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#service-dbccontractmatchvalidator)
  - Autofix chain: [dbc-linter spec §4.2 Adapter DbcTsLinter Side Effects](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#adapter-dbctslinter-1)
  - Requirements: [dbc spec §3.1 FR-17..FR-28](../../../specs/dbc/dbc.spec.md)
  - Error codes matrix: [dbc spec §3.1 Коды ошибок линтера](../../../specs/dbc/dbc.spec.md)
  - Parameter rules: [dbc spec §3.1 Параметры](../../../specs/dbc/dbc.spec.md)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../../../tasks/dbc/README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`
- **Deferred Runtime Scope:** None
- **Target Files:** `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` (Create)
- **Target Test Files:** None (тестируется через DL-fixtures)

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

### P1 — validator

- **Objective:** Реализовать DbcContractMatchValidator и DbcTsLinter.
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/linter/implementations/ts/dbc-ts-linter.ts`
- **Inputs:** DL-ast
- **Exit:** lint и lintAndFix соответствуют контракту.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:BDD-->

## 2. Acceptance Criteria (BDD)

Contract: [dbc-linter spec §4.1 Port DbcLinter](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#port-dbclinter).

**Feature:** `DbcContractMatchValidator` — сверка контракта с сигнатурой

**Scenario:** Все параметры совпадают — нет ошибок [`contract`]

- **Given** `entries` из `DbcParser.parse()` содержат `@param x`, `@param y`
- **And** `signature.params` = `[{name:'x'}, {name:'y'}]`
- **When** вызван `validate(entries, signature, 'function')`
- **Then** возвращает `[]`

**Scenario:** Параметр отсутствует в контракте [`contract`]

- **Given** `signature.params` = `[{name:'x'}, {name:'y'}]`
- **And** `entries` содержит только `@param x`
- **When** вызван `validate(entries, signature, 'function')`
- **Then** возвращает `[{code: 'ERR_DBC_LINT_PARAM_MISSING'}]`

**Scenario:** Лишний @param — не в сигнатуре [`contract`]

- **Given** `signature.params` = `[{name:'x'}]`
- **And** `entries` содержит `@param x`, `@param y`
- **When** вызван `validate(entries, signature, 'function')`
- **Then** возвращает `[{code: 'ERR_DBC_LINT_PARAM_EXTRA'}]`

**Scenario:** Порядок @param нарушен [`contract`]

- **Given** `signature.params` = `[{name:'a'}, {name:'b'}]`
- **And** `entries` содержит `@param b`, `@param a`
- **When** вызван `validate(entries, signature, 'function')`
- **Then** возвращает `[{code: 'ERR_DBC_LINT_PARAM_ORDER'}]`

**Scenario:** Не-void без @returns [`contract`]

- **Given** `signature.returnType` = `'User'`
- **And** `entries` не содержит `@returns`
- **When** вызван `validate(entries, signature, 'function')`
- **Then** возвращает `[{code: 'ERR_DBC_LINT_RETURNS_MISSING'}]`

**Scenario:** Void с @returns [`contract`]

- **Given** `signature.returnType` = `'void'`
- **And** `entries` содержит `@returns`
- **When** вызван `validate(entries, signature, 'function')`
- **Then** возвращает `[{code: 'ERR_DBC_LINT_RETURNS_UNEXPECTED'}]`

**Scenario:** {type} в @param / @returns [`contract`]

- **Given** `entries` содержит `@param {string} x`
- **When** вызван `validate(entries, signature, 'function')`
- **Then** возвращает ошибку с `code: 'ERR_DBC_LINT_TYPE_REDUNDANT'`

**Scenario:** Матрица kind-ов: constructor, getter, setter, field, const, type, enum [`contract`]

- **Given** правила из матрицы FR-24
- **When** вызван `validate()` для каждого kind
- **Then** constructor: param-ы проверяются, returns не проверяется
- **And** getter: param отсутствуют, returns проверяется
- **And** setter: ровно один param, returns отсутствует
- **And** field: param и returns отсутствуют
- **And** const/type/enum: param и returns отсутствуют

---

**Feature:** `DbcTsLinter.lint()` — полный проход линтинга

**Scenario:** Happy path — файл без ошибок [`unit`]

- **Given** файл где все экспорты покрыты валидными контрактами
- **When** вызван `lint(filePath)`
- **Then** `errors` пуст

**Scenario:** ERR_DBC_LINT_MISSING_CONTRACT [`unit`]

- **Given** файл с `export function` без JSDoc
- **When** вызван `lint(filePath)`
- **Then** ошибка с `code: 'ERR_DBC_LINT_MISSING_CONTRACT'`

**Scenario:** ERR_DBC_LINT_PARSE_FAILED [`unit`]

- **Given** синтаксически битый файл
- **When** вызван `lint(filePath)`
- **Then** ровно одна ошибка с `code: 'ERR_DBC_LINT_PARSE_FAILED'`

**Scenario:** Трансляция ошибок парсера [`unit`]

- **Given** контракт с `ERR_DBC_ORDER`
- **When** вызван `lint(filePath)`
- **Then** ошибка линтера с тем же `code: 'ERR_DBC_ORDER'`

**Scenario:** ESLint-формат вывода [`unit`]

- **Given** отчёт с ошибками
- **When** вызван `report.format()`
- **Then** вывод в формате `file:line:col: error: CODE message`

**Scenario:** Пустой файл / без экспортов [`unit`]

- **Given** пустой файл или файл без export
- **When** вызван `lint(filePath)`
- **Then** `errors` пуст

**Scenario:** No throw — любой вход [`unit`]

- **Given** любой файл (бинарный, мусор, несуществующий)
- **When** вызван `lint(filePath)`
- **Then** не выбрасывает исключений

---

**Feature:** `DbcTsLinter.lintAndFix()` — autofix

**Scenario:** Autofix исправляет все исправимые ошибки [`unit`]

- **Given** файл с `ERR_DBC_LINT_PARAM_EXTRA`, `ERR_DBC_LINT_PARAM_ORDER`, `ERR_DBC_LINT_RETURNS_UNEXPECTED`, `ERR_DBC_LINT_TYPE_REDUNDANT`, `ERR_DBC_ORDER`
- **When** вызван `lintAndFix(filePath)`
- **Then** `autoFixed` = 5 (количество исправленных)
- **And** файл мутирован: лишние @param/@returns удалены, порядок исправлен, {type} удалены, теги пересортированы
- **And** `errors` содержит только неисправимые ошибки

**Scenario:** Multi-line → inline (dry-run) [`unit`]

- **Given** multi-line контракт без конфликтующих тегов, который можно сжать
- **When** вызван `lintAndFix(filePath)`
- **Then** контракт сжат в inline
- **And** после сжатия `DbcParser.parse()` не выдаёт новых ошибок

**Scenario:** Multi-line НЕ сжимается при конфликтах [`unit`]

- **Given** multi-line контракт, сжатие которого вызывает новые ошибки парсера
- **When** вызван `lintAndFix(filePath)`
- **Then** контракт остаётся multi-line

**Scenario:** Явный injection через конструктор [`unit`]

- **Given** `new DbcTsLinter(mockParser, mockAstAdapter)`
- **When** вызван `lint(filePath)`
- **Then** использует переданные зависимости (тестируется с моками)

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 3. Verification

| Command               | Required by      | Role  |
| --------------------- | ---------------- | ----- |
| `tsc --noEmit` exit=0 | typescript-rules | extra |

- **Completion additions:** none beyond project baseline

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 4. Test Scenario Coverage

- все параметры совпадают → `dbc-ts-linter.test.ts` :: `M1 — all params match: empty errors`
- параметр отсутствует → `dbc-ts-linter.test.ts` :: `M2 — missing param: ERR_DBC_LINT_PARAM_MISSING`
- лишний @param → `dbc-ts-linter.test.ts` :: `M3 — extra @param: ERR_DBC_LINT_PARAM_EXTRA`
- порядок @param нарушен → `dbc-ts-linter.test.ts` :: `M4 — wrong order: ERR_DBC_LINT_PARAM_ORDER`
- не-void без @returns → `dbc-ts-linter.test.ts` :: `M5 — non-void without @returns: ERR_DBC_LINT_RETURNS_MISSING`
- void с @returns → `dbc-ts-linter.test.ts` :: `M6 — void with @returns: ERR_DBC_LINT_RETURNS_UNEXPECTED`
- {type} в @param → `dbc-ts-linter.test.ts` :: `M13 — {type} in @param: ERR_DBC_LINT_TYPE_REDUNDANT`
- неизвестный kind не ломает matcher → `dbc-ts-linter.test.ts` :: `M17 — unknown kind: empty errors (no crash)`
- happy path → `dbc-ts-linter.test.ts` :: `A1 — should pass: export const with valid contract`
- MISSING_CONTRACT → `dbc-ts-linter.test.ts` :: `B1 — export const without contract`
- PARSE_FAILED → `dbc-ts-linter.test.ts` :: `C1 — syntactically broken file`
- трансляция ошибок парсера → `dbc-ts-linter.test.ts` :: `J1 — ERR_DBC_ORDER: tags not in canonical order`
- пустой файл → `dbc-ts-linter.test.ts` :: `L1 — empty file: empty report, no errors`
- no crash → `dbc-ts-linter.test.ts` :: `L6 — nested class structure: no crash`
- autofix исправимых ошибок → `dbc-ts-linter.test.ts` :: `K1 — all fixable errors in one file, after autofix only unfixable remain`
- multi-line dry-run → `dbc-ts-linter.test.ts` :: `K2 — multi-line contract with 2+ tags → stays multi-line`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 5. Execution Log

_(Plan-as-checklist; token vocabulary + protocol in [tasks/README.md#execution-log-template](../../../tasks/README.md#execution-log-template).)_

### Round 1 — 2026-05-15, initial

#### P1

- [x] `2026-05-15 08:30` deps DL-ast=DONE
- [x] `2026-05-15 08:30` act typescript-rules
- [x] `2026-05-15 08:35` file `services/dbc/linter/dbc-linter.types.ts` — widened `DbcLintError.code` from `DbcLintIssueCode` to `DbcLintIssueCode | DbcIssueCode` (FR-23: parser errors translated to linter report)
- [x] `2026-05-15 09:20` file `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` — `DbcContractMatchValidator` (pure validate fn, 8 error types + kind-matrix FR-24) + `DbcTsLinter` (lint + lintAndFix with autofix chain: removeRedundantTypes, removeExtraParams, removeUnexpectedReturns, reorderParams, reorderTags, inlineIfSafe with dry-run)
- [x] `2026-05-15 09:25` ver `tsc --noEmit` → pass exit=0
- [x] `2026-05-15 09:30` aud rules=1 ax=58 viol=0
- [x] `2026-05-15 09:30` sync dbc+root
- [x] `2026-05-15 09:30` DONE

### Round 3 — 2026-05-26, fix: implements+@see — skip param/returns, autofix removal

| Phase | Kind | Status | Target Files                          | Deps |
| ----- | ---- | ------ | ------------------------------------- | ---- |
| P1    | fix  | [ ]    | dbc-linter.types.ts, dbc-ts-linter.ts | —    |
| P2    | test | [x]    | dbc-ts-linter.test.ts (M21-M24, K11)  | —    |

- [x] 2026-05-26T13:00:00Z file dbc-linter.types.ts — ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS
- [x] 2026-05-26T13:00:00Z file dbc-ts-linter.ts — validate() implements+@see; autofix \_removeRedundantInImplements
- [x] 2026-05-26T13:00:00Z test dbc-ts-linter.test.ts — M21-M24 validator, K11 autofix + fixture
- [x] 2026-05-26T13:00:00Z ver tsc --noEmit → pass
- [x] 2026-05-26T13:00:00Z ver node --test → pass (116/116)
- [x] 2026-05-26T13:00:00Z ver npm run lint → pass
- [x] 2026-05-26T13:00:00Z DONE

### Round 4 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### P2

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
