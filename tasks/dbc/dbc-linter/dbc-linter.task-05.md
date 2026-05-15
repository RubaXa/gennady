# Task: TSK-05 — Bootstrap: tree-sitter external в Vite

## 1. Meta & Traceability

- **Task-ID:** TSK-05
- **Purpose:** Пометить `tree-sitter` как external dependency в Vite-конфиге, чтобы нативные биндинги не бандлились.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** TSK-04
- **Spec References:**
  - Constraints: [dbc spec §8 Bootstrap Requirements](../../specs/dbc/dbc.spec.md#8-bootstrap-requirements)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None
- **Target Files:** `vite.config.ts` (Update)
- **Target Test Files:** None (bootstrap task)

## 2. Acceptance Criteria (BDD)

**Feature:** Конфигурация Vite для работы с нативными модулями

**Scenario:** tree-sitter помечен как external в Vite [`contract`]

- **Given** `tree-sitter` установлен в devDependencies (TSK-04)
- **When** в `vite.config.ts` добавлен `'tree-sitter'` в `rollupOptions.external`
- **Then** `npm run build` завершается успешно
- **And** в собранном бандле нет попытки упаковать нативный `.node`-аддон

## 3. Verification

| Command                | Required by |
| ---------------------- | ----------- |
| `npm run build` exit=0 | —           |

- **Completion additions:** none beyond project baseline

## 4. Test Scenario Coverage

- Scenario tree-sitter помечен как external в Vite → `npm run build` :: contract verification

## 5. Execution Log

_(Plan-as-checklist; token vocabulary + protocol in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-05-15, initial

- [x] `2026-05-15 14:35` Recon:
  - git: main, 7 files modified, 3 untracked dirs. Last commit: 771f055 «feat: complete dbc-parser SDD cycle — discovery → execution → audit».
  - Target Files state: `vite.config.ts` exists (1632 bytes), pristine.
  - Prior round entries: none.
  - Sibling tickets: TSK-04 DONE, TSK-05 TODO, TSK-06 DONE, TSK-07 DONE, TSK-08 TODO, TSK-09 TODO, TSK-10 TODO.
  - Conclusion: matches ticket assumptions, proceed.
- [x] `2026-05-15 14:35` Activation plan: PLAN→typescript-rules; IMPL→typescript-rules; TEST→skip (no test files); AUDIT→typescript-rules; COMMIT→skip.
- [x] `2026-05-15 14:35` Deps gate: TSK-04 confirmed `[x] DONE`.
- [x] `2026-05-15 14:36` act typescript-rules
- [x] `2026-05-15 14:36` Verified vite@6.4.1 API: `rollupOptions.external` accepts string array — matches current usage, no migration needed.
- [x] `2026-05-15 14:36` file `vite.config.ts` — `external: [...nodeBuiltins, 'tree-sitter']`
- [x] `2026-05-15 14:37` ver `npm run build` → pass exit=0
- [x] `2026-05-15 14:37` cov tree-sitter помечен как external в Vite → contract verification: `npm run build` exit=0
- [x] `2026-05-15 14:37` act typescript-rules (audit phase)
- [x] `2026-05-15 14:37` aud rules=1 ax=0 viol=0 — typescript-rules: trivial config change, no business logic; forbidden constructs grep empty
- [x] `2026-05-15 14:38` sync dbc+root
- [x] `2026-05-15 14:38` DONE
