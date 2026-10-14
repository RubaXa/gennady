# Task: DL-ts-deps — Bootstrap: установить tree-sitter зависимости

<!--SECTION:META-->

## 1. Meta & Traceability

- **Task-ID:** DL-ts-deps
- **Status:** [ ] TODO
- **Purpose:** Установить `tree-sitter` и `tree-sitter-typescript` как dev-зависимости.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** None
- **Spec References:**
  - Constraints: [dbc spec §8 Bootstrap Requirements](../../../specs/dbc/dbc.spec.md#8-bootstrap-requirements)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../../../tasks/dbc/README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
- **Target Files:** `package.json` (Update)
- **Target Test Files:** None (bootstrap task)

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

### P1 — dependencies

- **Objective:** Установить `tree-sitter` и `tree-sitter-typescript` как dev-зависимости.
- **Rules:** typescript-rules
- **Target Files:** `package.json`
- **Inputs:** None
- **Exit:** зависимости доступны проекту и type-check проходит.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:BDD-->

## 2. Acceptance Criteria (BDD)

**Feature:** Установка рантайм-зависимостей для dbc-linter

**Scenario:** Установка tree-sitter пакетов [`contract`]

- **Given** проект с Node.js 22+
- **When** выполнена команда `npm install --save-dev tree-sitter@^0.22 tree-sitter-typescript@^0.23`
- **Then** `package.json` содержит `tree-sitter` и `tree-sitter-typescript` в devDependencies
- **And** `node_modules/tree-sitter/` существует с prebuilt биндингами
- **And** `node_modules/tree-sitter-typescript/` существует

**Scenario:** Ошибка: tree-sitter dependency отсутствует [`contract`]

- **Given** package manifest без tree-sitter
- **When** dependency contract проверяется
- **Then** manifest отклоняется

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 3. Verification

| Command                                                                      | Required by | Role  |
| ---------------------------------------------------------------------------- | ----------- | ----- |
| `node -e "require('tree-sitter'); require('tree-sitter-typescript')"` exit=0 | —           | extra |

- **Completion additions:** none beyond project baseline

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 4. Test Scenario Coverage

- tree-sitter пакеты объявлены → `contract-artifacts.test.ts` :: `tree-sitter runtime dependencies are declared`
- отсутствующий tree-sitter отклоняется → `contract-artifacts.test.ts` :: `missing tree-sitter dependency is rejected by the contract`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 5. Execution Log

_(Plan-as-checklist; token vocabulary + protocol in [tasks/README.md#execution-log-template](../../../tasks/README.md#execution-log-template).)_

### Round 1 — 2026-05-15, initial

#### P1

- [x] `2026-05-15 14:20` Recon:
  - git: main, 3 files modified, 3 untracked. Last commit: `771f055 feat: complete dbc-parser SDD cycle — discovery → execution → audit`.
  - Target Files state: `package.json` exists, no tree-sitter deps installed (absent-as-expected).
  - Prior round entries: none (fresh task).
  - Sibling tickets: DP-fields DONE, DP-jsdoc DONE, DP-snaps DONE, DL-layout DONE. DL-ts-deps TODO, DL-vite-ext/07/08/09/10 TODO.
  - Conclusion: matches ticket assumptions, proceed.
- [x] `2026-05-15 14:20` Activation plan: PLAN→typescript-rules; IMPL→typescript-rules; TEST→skip (no test files); AUDIT→typescript-rules; COMMIT→skip.
- [x] `2026-05-15 14:20` Deps gate: None — passes automatically.
- [x] `2026-05-15 14:21` act typescript-rules
- [x] `2026-05-15 14:21` file `package.json` — devDependencies: tree-sitter@^0.22.4 + tree-sitter-typescript@^0.23.2
- [x] `2026-05-15 14:21` ver `node -e "require('tree-sitter'); require('tree-sitter-typescript')"` → pass exit=0
- [x] `2026-05-15 14:21` cov Установка tree-sitter пакетов → deferred DL-fixtures
- [x] `2026-05-15 14:22` act typescript-rules (audit phase)
- [x] `2026-05-15 14:22` aud rules=1 ax=0 viol=0 — typescript-rules not mechanically applicable to package.json (no TS code modified)
- [x] `2026-05-15 14:22` sync dbc+root
- [x] `2026-05-15 14:22` DONE

### Round 2 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
