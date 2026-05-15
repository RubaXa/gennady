# Task: TSK-04 — Bootstrap: установить tree-sitter зависимости

## 1. Meta & Traceability

- **Task-ID:** TSK-04
- **Purpose:** Установить `tree-sitter` и `tree-sitter-typescript` как dev-зависимости.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** None
- **Spec References:**
  - Constraints: [dbc spec §8 Bootstrap Requirements](../../specs/dbc/dbc.spec.md#8-bootstrap-requirements)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
- **Target Files:** `package.json` (Update)
- **Target Test Files:** None (bootstrap task)

## 2. Acceptance Criteria (BDD)

**Feature:** Установка рантайм-зависимостей для dbc-linter

**Scenario:** Установка tree-sitter пакетов [`contract`]

- **Given** проект с Node.js 22+
- **When** выполнена команда `npm install --save-dev tree-sitter@^0.22 tree-sitter-typescript@^0.23`
- **Then** `package.json` содержит `tree-sitter` и `tree-sitter-typescript` в devDependencies
- **And** `node_modules/tree-sitter/` существует с prebuilt биндингами
- **And** `node_modules/tree-sitter-typescript/` существует

## 3. Verification

| Command                                                                      | Required by |
| ---------------------------------------------------------------------------- | ----------- |
| `node -e "require('tree-sitter'); require('tree-sitter-typescript')"` exit=0 | —           |

- **Completion additions:** none beyond project baseline

## 4. Test Scenario Coverage

- Scenario Установка tree-sitter пакетов → `node -e "require(...)"` :: Deferred Test Ownership: TSK-10

## 5. Execution Log

_(Plan-as-checklist; token vocabulary + protocol in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-15, initial

- [x] `2026-05-15 14:20` Recon:
  - git: main, 3 files modified, 3 untracked. Last commit: `771f055 feat: complete dbc-parser SDD cycle — discovery → execution → audit`.
  - Target Files state: `package.json` exists, no tree-sitter deps installed (absent-as-expected).
  - Prior round entries: none (fresh task).
  - Sibling tickets: TSK-01 DONE, TSK-02 DONE, TSK-03 DONE, TSK-06 DONE. TSK-04 TODO, TSK-05/07/08/09/10 TODO.
  - Conclusion: matches ticket assumptions, proceed.
- [x] `2026-05-15 14:20` Activation plan: PLAN→typescript-rules; IMPL→typescript-rules; TEST→skip (no test files); AUDIT→typescript-rules; COMMIT→skip.
- [x] `2026-05-15 14:20` Deps gate: None — passes automatically.
- [x] `2026-05-15 14:21` act typescript-rules
- [x] `2026-05-15 14:21` file `package.json` — devDependencies: tree-sitter@^0.22.4 + tree-sitter-typescript@^0.23.2
- [x] `2026-05-15 14:21` ver `node -e "require('tree-sitter'); require('tree-sitter-typescript')"` → pass exit=0
- [x] `2026-05-15 14:21` cov Установка tree-sitter пакетов → deferred TSK-10
- [x] `2026-05-15 14:22` act typescript-rules (audit phase)
- [x] `2026-05-15 14:22` aud rules=1 ax=0 viol=0 — typescript-rules not mechanically applicable to package.json (no TS code modified)
- [x] `2026-05-15 14:22` sync dbc+root
- [x] `2026-05-15 14:22` DONE
