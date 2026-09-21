# Task: DL-vite-ext — Bootstrap: tree-sitter external в Vite

<!--SECTION:META-->

## 1. Meta & Traceability

- **Task-ID:** DL-vite-ext
- **Status:** [ ] TODO
- **Purpose:** Пометить `tree-sitter` как external dependency в Vite-конфиге, чтобы нативные биндинги не бандлились.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** DL-ts-deps
- **Spec References:**
  - Constraints: [dbc spec §8 Bootstrap Requirements](../../../specs/dbc/dbc.spec.md#8-bootstrap-requirements)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../../../tasks/dbc/README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
- **Target Files:** `vite.config.ts` (Update)
- **Target Test Files:** None (bootstrap task)

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | config | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->
<!--SECTION:PHASE_P1-->

### P1 — bundler

- **Objective:** Пометить `tree-sitter` как external dependency в Vite-конфиге.
- **Rules:** typescript-rules
- **Target Files:** `vite.config.ts`
- **Inputs:** DL-ts-deps
- **Exit:** нативные биндинги не попадают в bundle.
  <!--/SECTION:PHASE_P1-->
  <!--SECTION:BDD-->

## 2. Acceptance Criteria (BDD)

**Feature:** Конфигурация Vite для работы с нативными модулями

**Scenario:** tree-sitter помечен как external в Vite [`contract`]

- **Given** `tree-sitter` установлен в devDependencies (DL-ts-deps)
- **When** в `vite.config.ts` добавлен `'tree-sitter'` в `rollupOptions.external`
- **Then** `npm run build` завершается успешно
- **And** в собранном бандле нет попытки упаковать нативный `.node`-аддон

**Scenario:** Ошибка: tree-sitter отсутствует в external list [`contract`]

- **Given** Vite config без tree-sitter external
- **When** build contract проверяет config
- **Then** config отклоняется

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 3. Verification

| Command                | Required by | Role  |
| ---------------------- | ----------- | ----- |
| `npm run build` exit=0 | —           | extra |

- **Completion additions:** none beyond project baseline

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 4. Test Scenario Coverage

- tree-sitter помечен как external в Vite → `contract-artifacts.test.ts` :: `tree-sitter dependencies remain external in Vite`
- missing tree-sitter external → `contract-artifacts.test.ts` :: `missing tree-sitter external is rejected by the build contract`

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 5. Execution Log

_(Plan-as-checklist; token vocabulary + protocol in [tasks/README.md#execution-log-template](../../../tasks/README.md#execution-log-template).)_

### Round 1 — 2026-05-15, initial

#### P1

- [x] `2026-05-15 14:35` Recon:
  - git: main, 7 files modified, 3 untracked dirs. Last commit: 771f055 «feat: complete dbc-parser SDD cycle — discovery → execution → audit».
  - Target Files state: `vite.config.ts` exists (1632 bytes), pristine.
  - Prior round entries: none.
  - Sibling tickets: DL-ts-deps DONE, DL-vite-ext TODO, DL-layout DONE, DL-types DONE, DL-ast TODO, DL-match TODO, DL-fixtures TODO.
  - Conclusion: matches ticket assumptions, proceed.
- [x] `2026-05-15 14:35` Activation plan: PLAN→typescript-rules; IMPL→typescript-rules; TEST→skip (no test files); AUDIT→typescript-rules; COMMIT→skip.
- [x] `2026-05-15 14:35` Deps gate: DL-ts-deps confirmed `[x] DONE`.
- [x] `2026-05-15 14:36` act typescript-rules
- [x] `2026-05-15 14:36` Verified vite@6.4.1 API: `rollupOptions.external` accepts string array — matches current usage, no migration needed.
- [x] `2026-05-15 14:36` file `vite.config.ts` — `external: [...nodeBuiltins, 'tree-sitter']`
- [x] `2026-05-15 14:37` ver `npm run build` → pass exit=0
- [x] `2026-05-15 14:37` cov tree-sitter помечен как external в Vite → contract verification: `npm run build` exit=0
- [x] `2026-05-15 14:37` act typescript-rules (audit phase)
- [x] `2026-05-15 14:37` aud rules=1 ax=0 viol=0 — typescript-rules: trivial config change, no business logic; forbidden constructs grep empty
- [x] `2026-05-15 14:38` sync dbc+root
- [x] `2026-05-15 14:38` DONE

### Round 2 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
