# Task: TSK-12 — Типы: LintError, LintOptions, LintReport, коды ошибок

## 1. Meta & Traceability

- **Task-ID:** TSK-12
- **Purpose:** Создать единый файл типов `lint.types.ts` с `LintError`, `LintOptions`, `LintReport` и константами кодов ошибок `ERR_CLI_LINT_*`.
- **Scope:** cli
- **Module:** lint
- **Dependencies:** None
- **Spec References:**
  - Entity Inventory: [lint spec §2](../../specs/cli/lint/lint.spec.md)
  - Error Codes: [lint spec §3 Error Codes](../../specs/cli/lint/lint.spec.md)
- **§Effective Rules** (cascade sources at [tasks/cli/README.md#cascade](../README.md#cascade)):

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
- **Target Files:** `cli/cmd/lint/lint.types.ts` (Create)

## 2. Acceptance Criteria (BDD)

**Feature:** Типы и коды ошибок lint-команды

**Scenario:** LintError соответствует ESLint-формату [`unit`]

- **Given** создан `LintError`
- **When** поля заполнены
- **Then** `severity` всегда `'error'`, `code` из `ERR_CLI_LINT_*` или `ERR_DBC_LINT_*`

**Scenario:** LintReport агрегирует ошибки [`unit`]

- **Given** массив `LintError[]`
- **When** создан `LintReport`
- **Then** `exitCode = 0` если массив пуст, `1` если есть ошибки

**Scenario:** LintOptions покрывает все режимы [`unit`]

- **Given** `autofix = true`, `gitMode = 'staged'`
- **When** создан `LintOptions`
- **Then** все поля доступны

## 3. Phases

### Phase P1 — types

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `cli/cmd/lint/lint.types.ts` (Create)
- **Acceptance:**
  - `LintError` type: file, line, col, severity, code, message
  - `LintOptions` type: files, autofix, gitMode?
  - `LintReport` type: errors, exitCode, format()
  - 5 констант `ERR_CLI_LINT_*`
  - File header: `// @file:` + `// @consumers:`

## 4. Execution Log

### Round 1 — 2026-05-15, initial

#### P1

- [x] `2026-05-15T14:45:03Z` recon git=main/dirty targets=absent divergence=none
- [x] `2026-05-15T14:45:03Z` rules typescript-rules
- [x] `2026-05-15T14:45:03Z` file cli/cmd/lint/lint.types.ts
- [x] `2026-05-15T14:45:03Z` ver npm run type-check → pass exit=0
- [x] `2026-05-15T14:45:03Z` DONE
      **Handoff →** artifacts: [cli/cmd/lint/lint.types.ts]; decisions: [module-system=esm, error-codes=individual-as-const]; open: []
      intro LintError ← LintError type with file, line, col, severity, code, message fields per ESLint format
      intro LintOptions ← LintOptions type with files, autofix, gitMode fields
      intro LintReport ← LintReport type with errors, exitCode, format() method
      intro ERR_CLI_LINT_MISSING_FILE ← error code constant
      intro ERR_CLI_LINT_MISSING_CONSUMERS ← error code constant
      intro ERR_CLI_LINT_ANCHOR_UNPAIRED_START ← error code constant
      intro ERR_CLI_LINT_ANCHOR_UNPAIRED_END ← error code constant
      intro ERR_CLI_LINT_ANCHOR_NESTING ← error code constant
      cov LintError соответствует ESLint-формату → cli/cmd/lint/lint.types.ts (type-level: fields match spec)
      cov LintReport агрегирует ошибки → cli/cmd/lint/lint.types.ts (type-level: exitCode 0/1 logic)
      cov LintOptions покрывает все режимы → cli/cmd/lint/lint.types.ts (type-level: all fields accessible)
