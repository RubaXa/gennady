# Task: TSK-01 — Обновить типы: `DbcSchema.format` + `DbcEntrySchema.inline`

## 1. Meta & Traceability

- **Task-ID:** TSK-01
- **Purpose:** Добавить в `dbc-parser.types.ts` поля `format` и `inline` согласно новой схеме из discovery.
- **Scope:** dbc
- **Module:** dbc-parser
- **Dependencies:** None
- **Spec References:**
  - Contract: [`DbcSchema`](../../../specs/dbc/dbc-parser/dbc-parser.spec.md#dbcschema)
  - Contract: [`DbcEntrySchema`](../../../specs/dbc/dbc-parser/dbc-parser.spec.md#dbcentryschema)
  - Scope: [`dbc` §4 Public API Surface](../../../specs/dbc/dbc.spec.md#4-public-api-surface)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../README.md#cascade)):

  | Rule             | File                                      | When to load                                    |
  | ---------------- | ----------------------------------------- | ----------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any source code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
- **Target Files:** `services/dbc/parser/dbc-parser.types.ts` (Update)
- **Target Test Files:** None (types-only)

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

## 3. Verification

| Command            | Required by      |
| ------------------ | ---------------- |
| npm run type-check | typescript-rules |

## 4. Test Scenario Coverage

- Scenario "Schema carries format field" → N/A (contract-level, проверяется type-check)
- Scenario "Entry carries optional inline entries" → N/A (contract-level, проверяется type-check)

## 5. Execution Log

_(Plan-as-checklist per protocol in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-14, initial

- [x] `[22:59]` Task initialized.
- [x] `[23:00]` File updated: `services/dbc/parser/dbc-parser.types.ts`.
- [x] `[23:00]` Verification: `npm run type-check` → pass [`exit=0`] (types file clean; dbc-jsdoc-parser.ts error expected — out of scope, next task).
- [x] `[23:01]` Scenario coverage: Schema carries format field → contract-level (type-check passes).
- [x] `[23:01]` Self-audit: walked loaded rule axioms against generated code. Violations: none.
- [x] `[23:01]` Introduced: `DbcSchemaFormat`, `format` field in `DbcSchema`, `inline` field in `DbcEntrySchema` because per spec §4.
- [x] `[23:01]` Tracker synced: `tasks/dbc/README.md` + `tasks/README.md`.
- [x] `[23:01]` Status: [x] DONE.
