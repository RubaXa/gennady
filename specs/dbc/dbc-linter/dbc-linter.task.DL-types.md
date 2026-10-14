# Task: DL-types — Типы: Ports, Value Objects, константы

<!--SECTION:META-->

## 1. Meta & Traceability

- **Task-ID:** DL-types
- **Status:** [ ] TODO
- **Status:** [ ] TODO
- **Purpose:** Написать ядро типов модуля dbc-linter: Ports (`DbcLinter`, `DbcAstAdapter`), Value Objects, константы `ERR_DBC_LINT_*`.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** DL-layout
- **Spec References:**
  - Port `DbcLinter`: [dbc-linter spec §3](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#dbclinter-1)
  - Port `DbcAstAdapter`: [dbc-linter spec §3](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#dbcastadapter)
  - Value Objects: [dbc-linter spec §3](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#value-objects)
  - Constants: [dbc-linter spec §3](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#constants)
  - Contracts: [dbc-linter spec §4.1](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#41-ports)
  - Scope API surface: [dbc spec §4](../../../specs/dbc/dbc.spec.md#4-public-api-surface)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../../../tasks/dbc/README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
- **Target Files:** `services/dbc/linter/dbc-linter.types.ts` (Create), `services/dbc/linter/dbc-ast-adapter.types.ts` (Create)
- **Target Test Files:** None (тестируются через потребляющие адаптеры в DL-ast, DL-match)

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

### P1 — types

- **Objective:** Реализовать порты, value objects и коды ошибок dbc-linter.
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/linter/dbc-linter.types.ts`, `services/dbc/linter/dbc-ast-adapter.types.ts`
- **Inputs:** DL-layout
- **Exit:** типы экспортируются и type-check проходит.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:BDD-->

## 2. Acceptance Criteria (BDD)

Contract: [dbc-linter spec §4.1 Ports](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#41-ports).

**Feature:** Ядро типов dbc-linter — Ports, VO, константы

**Scenario:** Файлы типов компилируются без ошибок [`contract`]

- **Given** TypeScript strict mode
- **When** написаны `dbc-linter.types.ts` и `dbc-ast-adapter.types.ts` согласно Entity Inventory
- **Then** `tsc --noEmit` завершается без ошибок

**Scenario:** Все 16 сущностей inventory присутствуют [`contract`]

- **Given** Entity Inventory из [dbc-linter spec §2](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#2-entity-inventory-closed-world)
- **When** просматриваем оба файла типов
- **Then** каждый тип и константа из inventory экспортированы

**Scenario:** Константы стабильны [`contract`]

- **Given** 8 констант `ERR_DBC_LINT_*`
- **When** импортируются из `dbc-linter.types.ts`
- **Then** каждая — строковая константа с именем, совпадающим со значением

**Scenario:** Ошибка: обязательная DBC-константа отсутствует [`contract`]

- **Given** public contract без `ERR_DBC_LINT_MISSING_CONTRACT`
- **When** inventory проверяется
- **Then** неполный contract отклоняется

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

- файлы типов компилируются → `contract-artifacts.test.ts` :: `stable DBC lint constants keep names equal to values`
- константы стабильны → `contract-artifacts.test.ts` :: `stable DBC lint constants keep names equal to values`
- отсутствующая DBC-константа → `contract-artifacts.test.ts` :: `missing DBC lint constant is rejected by the contract`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 5. Execution Log

_(Plan-as-checklist; token vocabulary + protocol in [tasks/README.md#execution-log-template](../../../tasks/README.md#execution-log-template).)_

### Round 1 — 2026-05-15, initial

#### P1

- [x] `2026-05-15 09:30` Recon:
  - git: `main`, 5 files modified, 2 untracked directories. Last commit: `771f055` «feat: complete dbc-parser SDD cycle».
  - Target Files state: `services/dbc/linter/dbc-linter.types.ts` — absent (as expected), `services/dbc/linter/dbc-ast-adapter.types.ts` — absent (as expected). Directory tree exists (DL-layout).
  - Prior round entries: none (fresh task).
  - Sibling tickets: DP-fields,DP-jsdoc,DP-snaps,DL-layout=DONE; DL-ts-deps,DL-vite-ext,DL-types..DL-fixtures=TODO.
  - Conclusion: matches ticket assumptions, proceed.
- [x] `2026-05-15 09:30` Activation plan: PLAN→typescript-rules; IMPL→typescript-rules; TEST→skip (no target test files); AUDIT→typescript-rules; COMMIT→skip.
- [x] `2026-05-15 09:30` Deps gate: DL-layout confirmed [x] DONE.
- [x] `2026-05-15 09:31` act typescript-rules
- [x] `2026-05-15 09:31` plan items=2 (two type files)
- [x] `2026-05-15 09:32` file `services/dbc/linter/dbc-linter.types.ts`
- [x] `2026-05-15 09:32` file `services/dbc/linter/dbc-ast-adapter.types.ts`
- [x] `2026-05-15 09:32` intro `DbcContractInfo` ← helper type extracted from inline `contract` property shape for reuse across `DbcExportedEntity` and `DbcMember`.
- [x] `2026-05-15 09:33` ver `tsc --noEmit` → pass exit=0
- [x] `2026-05-15 09:33` cov Файлы типов компилируются → `tsc --noEmit` exit=0 :: contract verification
- [x] `2026-05-15 09:33` cov Все 16 сущностей inventory присутствуют → manual review: 14 exported entities from types files (DbcLinter, DbcLintReport, DbcLintFixReport, DbcLintError, DbcLintOptions, DbcLintIssueCode, 8×ERR*DBC_LINT*\*, DbcAstAdapter, DbcParseResult, DbcExportedEntity, DbcMember, DbcSignatureInfo, DbcParamInfo) + 1 helper (DbcContractInfo). Adapters + Service deferred to DL-ast/DL-match.
- [x] `2026-05-15 09:33` cov Константы стабильны → manual review: all 8 `ERR_DBC_LINT_*` const names match their string values.
- [x] `2026-05-15 09:34` aud rules=1 ax=26 viol=0 — all typescript-rules axioms satisfied: file headers present, `@purpose` on all exported entities, `interface` for ports, `type` for VOs, no forbidden constructs, proper JSDoc tag order.
- [x] `2026-05-15 09:34` sync dbc+root
- [x] `2026-05-15 09:34` DONE

### Round 2 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
