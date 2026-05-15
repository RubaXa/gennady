# Task: TSK-15 — DbcContractCheck

## 1. Meta & Traceability

- **Task-ID:** TSK-15
- **Purpose:** Реализовать `DbcContractCheck.check(content, filePath, autofix) → Promise<LintError[]>` — адаптер к `DbcTsLinter` из scope `dbc`.
- **Scope:** cli
- **Module:** lint
- **Dependencies:** TSK-12, TSK-11 (dbc refine: опция `content`)
- **Spec References:**
  - DbcContractCheck surface: [lint spec §3](../../specs/cli/lint/lint.spec.md)
  - DbcContractCheck DbC: [lint spec §4.3](../../specs/cli/lint/lint.spec.md)
  - `DbcLinter` Port: [dbc spec §4](../../specs/dbc/dbc.spec.md)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None
- **Target Files:** `cli/cmd/lint/checks/dbc-contract.check.ts` (Create)

## 2. Acceptance Criteria (BDD)

**Feature:** Адаптер к DbcTsLinter с передачей контента

**Scenario:** lint с контентом — без ошибок [`integration`]

- **Given** валидный TypeScript-контент
- **When** `check(content, 'test.ts', false)`
- **Then** пустой массив ошибок

**Scenario:** lint с контентом — есть ошибки [`integration`]

- **Given** контент с отсутствующими контрактами
- **When** `check(content, 'test.ts', false)`
- **Then** ошибки `ERR_DBC_LINT_MISSING_CONTRACT` транслированы в `LintError[]`

**Scenario:** lintAndFix с контентом [`integration`]

- **Given** контент с autofix-абельными ошибками
- **When** `check(content, 'test.ts', true)`
- **Then** файл на диске мутирован, возвращены только неисправимые ошибки

**Scenario:** filePath в ошибках — исходный путь [`integration`]

- **Given** контент с ошибками
- **When** `check(content, '/path/to/file.ts', false)`
- **Then** все ошибки содержат `file: '/path/to/file.ts'`

## 3. Phases

### Phase P1 — implementation

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `cli/cmd/lint/checks/dbc-contract.check.ts` (Create)
- **Acceptance:**
  - Создаёт `DbcJsDocParser` и `DbcTsAstAdapter`
  - Создаёт `DbcTsLinter(parser, astAdapter)`
  - `autofix = false` → `lint(filePath, { content })`
  - `autofix = true` → `lintAndFix(filePath, { content })`
  - Транслирует `DbcLintError` → `LintError`
  - File header: `// @file:` + `// @consumers:`

## 4. Execution Log

### Round 1 — 2026-05-15, initial

#### P1
- [x] `[2026-05-15T19:10:00Z]` recon git=main/dirty targets=dbc-contract.check.ts absent divergence=none
- [x] `[2026-05-15T19:10:00Z]` rules typescript-rules
- [x] `[2026-05-15T19:10:00Z]` file cli/cmd/lint/checks/dbc-contract.check.ts
- [x] `[2026-05-15T19:10:00Z]` intro DbcContractCheck.check ← фаза P1 TSK-15: адаптер к DbcTsLinter с передачей контента
- [x] `[2026-05-15T19:10:00Z]` ver npm run type-check → pass exit=0
- [x] `[2026-05-15T19:10:00Z]` DONE
**Handoff →** artifacts: [cli/cmd/lint/checks/dbc-contract.check.ts]; decisions: [module-system=esm, check-is-async=true, autofix-delegates-to-lintAndFix=true]; open: []
