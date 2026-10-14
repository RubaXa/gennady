# Task: DL-layout — Bootstrap: создать структуру директорий dbc-linter

<!--SECTION:META-->

## 1. Meta & Traceability

- **Task-ID:** DL-layout
- **Status:** [ ] TODO
- **Purpose:** Создать структуру директорий для модуля dbc-linter: `services/dbc/linter/` с поддиректориями `implementations/ts/__tests__/fixtures/`.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** None
- **Spec References:**
  - File Structure: [dbc-linter spec §6](../../../specs/dbc/dbc-linter/dbc-linter.spec.md#6-file-structure)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../../../tasks/dbc/README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
- **Target Files:** `services/dbc/linter/` directory tree (Create)
- **Target Test Files:** None (bootstrap task)

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

### P1 — layout

- **Objective:** Создать структуру директорий модуля dbc-linter.
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/linter/`
- **Inputs:** None
- **Exit:** структура `implementations/ts/__tests__/fixtures/` существует.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:BDD-->

## 2. Acceptance Criteria (BDD)

**Feature:** Создание файловой структуры модуля dbc-linter

**Scenario:** Директории созданы [`contract`]

- **Given** репозиторий с существующим `services/dbc/parser/`
- **When** выполнено `mkdir -p services/dbc/linter/implementations/ts/__tests__/fixtures`
- **Then** директория `services/dbc/linter/implementations/ts/__tests__/fixtures/` существует

**Scenario:** Ошибка: обязательная директория отсутствует [`contract`]

- **Given** layout без fixtures directory
- **When** contract проверяет layout
- **Then** отсутствие обнаруживается

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 3. Verification

| Command                                                                   | Required by | Role  |
| ------------------------------------------------------------------------- | ----------- | ----- |
| `ls -d services/dbc/linter/implementations/ts/__tests__/fixtures/` exit=0 | —           | extra |

- **Completion additions:** none beyond project baseline

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 4. Test Scenario Coverage

- директории созданы → `contract-artifacts.test.ts` :: `required directory layout exists`
- отсутствующая директория → `contract-artifacts.test.ts` :: `missing required directory is detected`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 5. Execution Log

_(Plan-as-checklist; token vocabulary + protocol in [tasks/README.md#execution-log-template](../../../tasks/README.md#execution-log-template).)_

### Round 1 — 2026-05-15, initial

#### P1

- [x] `2026-05-15 09:00` Recon:
  - git: `main`, 3 files modified (`specs/dbc/dbc.spec.md`, `tasks/README.md`, `tasks/dbc/README.md`), 2 untracked directories (`specs/dbc/dbc-linter/`, `tasks/dbc/dbc-linter/`). Last commit: `771f055` «feat: complete dbc-parser SDD cycle».
  - Target Files state: `services/dbc/linter/` — absent (as expected for bootstrap task).
  - Prior round entries: none (fresh task).
  - Sibling tickets: DP-fields,DP-jsdoc,DP-snaps=DONE; DL-ts-deps..DL-fixtures=TODO.
  - Conclusion: matches ticket assumptions, proceed.
- [x] `2026-05-15 09:00` Task initialized.
- [x] `2026-05-15 09:00` Activation plan: PLAN→skip (typescript-rules not applicable to dir-only bootstrap); IMPL→skip (no .ts files); TEST→skip (no test files); AUDIT→skip (no audit rules declared). COMMIT→skip.
- [x] `2026-05-15 09:00` Deps gate: None declared — trivial pass.
- [x] `2026-05-15 09:00` Spec context: loaded `specs/dbc/dbc-linter/dbc-linter.spec.md#6-file-structure` — confirmed target tree `services/dbc/linter/implementations/ts/__tests__/fixtures/`.
- [x] `2026-05-15 09:00` act PLAN skip — bootstrap dir-only, no .ts files.
- [x] `2026-05-15 09:00` plan items=1 (mkdir).
- [x] `2026-05-15 09:00` Implementation: create directory structure.
- [x] `2026-05-15 09:01` ver `ls -d services/dbc/linter/implementations/ts/__tests__/fixtures/` → pass exit=0
- [x] `2026-05-15 09:01` cov Директории созданы → contract verification (`ls -d ...` exit=0)
- [x] `2026-05-15 09:01` aud rules=0 ax=0 viol=0 (no rules activated — bootstrap dir-only task)
- [x] `2026-05-15 09:01` sync dbc+root
- [x] `2026-05-15 09:01` DONE

### Round 2 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
