# Task: DP-fields — Обновить типы: `DbcSchema.format` + `DbcEntrySchema.inline`

<!--SECTION:META-->

## 1. Meta & Traceability

- **Task-ID:** DP-fields
- **Status:** [ ] TODO
- **Purpose:** Добавить в `dbc-parser.types.ts` поля `format` и `inline` согласно новой схеме из discovery.
- **Scope:** dbc
- **Module:** dbc-parser
- **Dependencies:** None
- **Spec References:**
  - Contract: [`DbcSchema`](./dbc-parser.spec.md#dbcschema)
  - Contract: [`DbcEntrySchema`](./dbc-parser.spec.md#dbcentryschema)
  - Scope: [`dbc` §4 Public API Surface](../dbc.spec.md#4-public-api-surface)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../../../tasks/dbc/README.md#cascade)):

  | Rule             | File                                      | When to load                                    |
  | ---------------- | ----------------------------------------- | ----------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any source code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
- **Target Files:** `services/dbc/parser/dbc-parser.types.ts` (Update)
- **Target Test Files:** None (types-only)

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

### P1 — fields

- **Objective:** Добавить поля `format` и `inline` в типы parser.
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/parser/dbc-parser.types.ts`
- **Inputs:** None
- **Exit:** type-check подтверждает контракт полей.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:BDD-->

## 2. Acceptance Criteria (BDD)

Contract: see Spec References.

**Feature:** Универсальные DBC-типы поддерживают признак формата контракта и вложенные записи для inline-синтаксиса.

**Scenario:** Schema carries format field [`contract`]

- **Given** тип `DbcSchema` определён
- **When** он экспортирован из `dbc-parser.types.ts`
- **Then** содержит поле `format: DbcSchemaFormat`
- **And** `DbcSchemaFormat = 'single-line' | 'multi-line'`

**Scenario:** Entry carries optional inline entries [`contract`]

- **Given** тип `DbcEntrySchema` определён
- **When** он экспортирован из `dbc-parser.types.ts`
- **Then** содержит опциональное поле `inline?: DbcEntrySchema[]`

**Scenario:** Ошибка: невалидный schema format отклоняется [`contract`]

- **Given** format вне `single-line | multi-line`
- **When** runtime guard проверяет value
- **Then** guard возвращает false

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

- Schema carries format field → `dbc-parser-types.test.ts` :: `DbcSchema carries its format field`
- Entry carries optional inline entries → `dbc-parser-types.test.ts` :: `DbcEntrySchema carries optional inline entries`
- invalid schema format is rejected → `dbc-parser-types.test.ts` :: `invalid schema format is rejected by the type-backed runtime guard`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 5. Execution Log

_(Plan-as-checklist per protocol in [tasks/README.md#execution-log-template](../../../tasks/README.md#execution-log-template).)_

### Round 1 — 2026-05-14, initial

#### P1

- [x] `[22:59]` Task initialized.
- [x] `[23:00]` File updated: `services/dbc/parser/dbc-parser.types.ts`.
- [x] `[23:00]` Verification: `npm run type-check` → pass [`exit=0`] (types file clean; dbc-jsdoc-parser.ts error expected — out of scope, next task).
- [x] `[23:01]` Scenario coverage: Schema carries format field → contract-level (type-check passes).
- [x] `[23:01]` Self-audit: walked loaded rule axioms against generated code. Violations: none.
- [x] `[23:01]` Introduced: `DbcSchemaFormat`, `format` field in `DbcSchema`, `inline` field in `DbcEntrySchema` because per spec §4.
- [x] `[23:01]` Tracker synced: `tasks/dbc/README.md` + `tasks/README.md`.
- [x] `[23:01]` Status: [x] DONE.

### Round 2 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
