# Task: DP-jsdoc — Обновить парсер: `@implements` + новый `CONTRACT_ORDER` + `format` + `inline`

<!--SECTION:META-->

## 1. Meta & Traceability

- **Task-ID:** DP-jsdoc
- **Status:** [ ] TODO
- **Purpose:** Выровнять `DbcJsDocParser` с новой схемой: парсить `@implements`, обновить порядок тегов, определять `format`, парсить `inline` записи.
- **Scope:** dbc
- **Module:** dbc-parser
- **Dependencies:** DP-fields
- **Spec References:**
  - Adapter: [`DbcJsDocParser`](./dbc-parser.spec.md#dbcjsdocparser)
  - Scope FR-06: [`@implements`](../dbc.spec.md#31-functional-requirements)
  - Scope FR-09: [`ERR_DBC_ORDER`](../dbc.spec.md#31-functional-requirements)
  - Scope FR-14/15: [`format`, `inline`](../dbc.spec.md#31-functional-requirements)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../../../tasks/dbc/README.md#cascade)):

  | Rule             | File                                      | When to load                                    |
  | ---------------- | ----------------------------------------- | ----------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any source code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
- **Target Files:** `services/dbc/parser/implementations/jsdoc/dbc-jsdoc-parser.ts` (Update)
- **Target Test Files:** None (parser-only; tests in DP-snaps)

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

### P1 — jsdoc parser

- **Objective:** Выровнять DbcJsDocParser с новой схемой.
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/parser/implementations/jsdoc/dbc-jsdoc-parser.ts`
- **Inputs:** DP-fields
- **Exit:** parser поддерживает implements, format и inline.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:BDD-->

## 2. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** JSDoc-парсер реализует обновлённый DBC-словарь и схему.

**Scenario:** Parse `@implements` tag [`unit`]

- **Given** контракт содержит `@implements {UserRepository#retrieveUser} in ./user-repository.ts`
- **When** вызывается `parse()`
- **Then** запись имеет `type: 'implements'`, `specifier: 'UserRepository#retrieveUser'`, `value: 'in ./user-repository.ts'`

**Scenario:** Ошибка порядка: implements is first [`unit`]

- **Given** контракт: `@invariant X` перед `@implements {Foo} in path`
- **When** вызывается `parse()`
- **Then** запись `invariant` получает `ERR_DBC_ORDER`

**Scenario:** `@consumer` не вызывает ERR_DBC_ORDER [`unit`]

- **Given** контракт содержит `@consumer` в любом месте
- **When** вызывается `parse()`
- **Then** запись `consumer` не получает `ERR_DBC_ORDER` (generic-тег, вне порядка)

**Scenario:** Detect format: single-line [`unit`]

- **Given** контракт `/** @purpose Loads user */` (одна строка)
- **When** вызывается `parse()`
- **Then** `result.format === 'single-line'`

**Scenario:** Detect format: multi-line [`unit`]

- **Given** многострочный контракт с `@param` и `@returns`
- **When** вызывается `parse()`
- **Then** `result.format === 'multi-line'`

**Scenario:** Parse inline entries from ` | @<name>` [`unit`]

- **Given** контракт `/** @purpose Loads user | @param {string} id User id */` (single-line)
- **When** вызывается `parse()`
- **Then** `entries[0].type === 'purpose'`, `entries[0].inline[0].type === 'param'`, `entries[0].inline[0].specifier === 'id'`

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 3. Verification

| Command            | Required by      | Role  |
| ------------------ | ---------------- | ----- |
| npm run type-check | typescript-rules | extra |

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 4. Test Scenario Coverage

- Scenario "Parse @implements tag" → `services/dbc/parser/implementations/jsdoc/__tests__/jsdoc-parser-fields.test.ts` :: `should parse implements tag with specifier and trailing value`
- Scenario "Ошибка порядка: implements is first" → `services/dbc/parser/implementations/jsdoc/__tests__/jsdoc-parser-validation.test.ts` :: `reports ERR_DBC_ORDER for implements order violation`
- Scenario "consumer не вызывает ERR_DBC_ORDER" → `services/dbc/parser/implementations/jsdoc/__tests__/jsdoc-parser-validation.test.ts` :: `should not report order violation for valid implements, consumer, param, returns sequence`
- Scenario "Detect format: single-line" → `services/dbc/parser/implementations/jsdoc/__tests__/jsdoc-parser-syntax.test.ts` :: `should detect single-line format for inline contract text`
- Scenario "Detect format: multi-line" → `services/dbc/parser/implementations/jsdoc/__tests__/jsdoc-parser-syntax.test.ts` :: `should detect multi-line format for block contract text`
- Scenario "Parse inline entries" → `services/dbc/parser/implementations/jsdoc/__tests__/jsdoc-parser-syntax.test.ts` :: `should parse inline tags from pipe-delimited single-line contract`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 5. Execution Log

_(Plan-as-checklist per protocol in [tasks/README.md#execution-log-template](../../../tasks/README.md#execution-log-template).)_

### Round 1 — 2026-05-14, initial

#### P1

- [x] `[23:02]` Task initialized.
- [x] `[23:03]` File updated: `services/dbc/parser/implementations/jsdoc/dbc-jsdoc-parser.ts`.
- [x] `[23:03]` Verification: `npm run type-check` → pass [`exit=0`].
- [x] `[23:03]` Scenario coverage: all BDD scenarios deferred to DP-snaps (tests task).
- [x] `[23:03]` Self-audit: walked loaded rule axioms against generated code. Violations: none.
- [x] `[23:03]` Introduced: `parseImplementsTag` because per spec FR-06.
- [x] `[23:03]` Tracker synced: `tasks/dbc/README.md` + `tasks/README.md`.
- [x] `[23:03]` Status: [x] DONE.

### Round 2 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
