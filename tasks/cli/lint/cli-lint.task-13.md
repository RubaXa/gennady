# Task: TSK-13 — FileHeaderCheck

## 1. Meta & Traceability

- **Task-ID:** TSK-13
- **Purpose:** Реализовать `FileHeaderCheck.check(content, filePath) → LintError[]` — проверка наличия `// @file:` и `// @consumers:` в начале TypeScript-файла.
- **Scope:** cli
- **Module:** lint
- **Dependencies:** TSK-12
- **Spec References:**
  - FileHeaderCheck surface: [lint spec §3](../../specs/cli/lint/lint.spec.md)
  - FileHeaderCheck DbC: [lint spec §4.3](../../specs/cli/lint/lint.spec.md)
  - `AX_FILE_LEVEL_CONTEXT`: [typescript-rules.xml](../../ai/directives/coding/typescript-rules.xml)
- **§Effective Rules** (cascade sources at [tasks/cli/README.md#cascade](../README.md#cascade)):

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Deferred Runtime Scope:** None
- **Target Files:** `cli/cmd/lint/checks/file-header.check.ts` (Create)

## 2. Acceptance Criteria (BDD)

**Feature:** Проверка file header в TypeScript-файлах

**Scenario:** Файл с обоими тегами — чисто [`unit`]

- **Given** контент: `// @file: ... \n // @consumers: ... \n import ...`
- **When** `check(content, 'test.ts')`
- **Then** пустой массив ошибок

**Scenario:** Отсутствует @file [`unit`]

- **Given** контент начинается с `import ...`
- **When** `check(content, 'test.ts')`
- **Then** `ERR_CLI_LINT_MISSING_FILE`, строка 1, колонка 1

**Scenario:** Отсутствует @consumers [`unit`]

- **Given** контент: `// @file: ... \n import ...`
- **When** `check(content, 'test.ts')`
- **Then** `ERR_CLI_LINT_MISSING_CONSUMERS`

**Scenario:** Теги после import не считаются [`unit`]

- **Given** контент: `import ... \n // @file: ...`
- **When** `check(content, 'test.ts')`
- **Then** `ERR_CLI_LINT_MISSING_FILE` (тег после import игнорируется)

**Scenario:** Пустой файл [`unit`]

- **Given** пустой контент
- **When** `check(content, 'test.ts')`
- **Then** `ERR_CLI_LINT_MISSING_FILE` + `ERR_CLI_LINT_MISSING_CONSUMERS`

## 3. Phases

### Phase P1 — implementation

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `cli/cmd/lint/checks/file-header.check.ts` (Create)
- **Acceptance:**
  - Pure function: `check(content: string, filePath: string): LintError[]`
  - Сканирует строки до первого `import`
  - Ищет `// @file:` и `// @consumers:`
  - Возвращает пустой массив при успехе
  - File header: `// @file:` + `// @consumers:`

## 4. Execution Log

### Round 1 — 2026-05-15, initial

##### P1

- [x] `[2026-05-15T15:49:25Z]` recon git=main/dirty targets=absent divergence=none
- [x] `[2026-05-15T15:49:25Z]` rules typescript-rules
- [x] `[2026-05-15T15:49:25Z]` file cli/cmd/lint/checks/file-header.check.ts
- [x] `[2026-05-15T15:49:25Z]` intro FileHeaderCheck.check ← фаза P1 TSK-13: реализация проверки file header
- [x] `[2026-05-15T15:49:25Z]` ver npm run type-check → pass exit=0
- [x] `[2026-05-15T15:49:25Z]` DONE
      **Handoff →** artifacts: [cli/cmd/lint/checks/file-header.check.ts]; decisions: [func-signature=check(content:string,filePath:string):LintError[], scan-scope=before-first-import, error-codes=ERR_CLI_LINT_MISSING_FILE|ERR_CLI_LINT_MISSING_CONSUMERS]; open: []
