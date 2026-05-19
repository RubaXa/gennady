# Task: TSK-11 — DbcLinter: опция `content` для предварительно прочитанного файла

## 1. Meta & Traceability

- **Task-ID:** TSK-11
- **Purpose:** Добавить опциональный параметр `content` в `DbcLinter.lint()` и `lintAndFix()`, чтобы потребитель мог передать предварительно прочитанный контент файла и избежать двойного чтения с диска.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** TSK-10
- **Spec References:**
  - FR-17: [dbc spec §3.1](../../specs/dbc/dbc.spec.md)
  - D-014: [dbc spec §6 Decision Log](../../specs/dbc/dbc.spec.md)
  - `DbcLintOptions` VO: [dbc-linter spec §2 Entity Inventory](../../specs/dbc/dbc-linter/dbc-linter.spec.md)
  - `DbcLinter` Port DbC: [dbc-linter spec §4.1](../../specs/dbc/dbc-linter/dbc-linter.spec.md)
- **§Effective Rules** (cascade sources at [tasks/dbc/README.md#cascade](../README.md#cascade)):

  | Rule             | File                                      | When to load                                 |
  | ---------------- | ----------------------------------------- | -------------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml | Before editing or creating any .ts code file |
  | node-test        | ai/directives/testing/node-test.xml       | Before writing or modifying test files       |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None
- **Target Files:**
  - `services/dbc/linter/dbc-linter.types.ts` (Modify — добавить `content?: string` в `DbcLintOptions`)
  - `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` (Modify — использовать `options.content` если передан)
- **Target Test Files:**
  - `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` (Modify — добавить тест)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/happy/user.service.ts` (Read — fixture для content-теста)

## 2. Acceptance Criteria (BDD)

**Feature:** Опция `content` в `DbcLinter`

**Scenario:** lint с переданным content [`unit`]

- **Given** файл `fixtures/happy/user.service.ts` существует и валиден
- **And** его контент прочитан в `content: string`
- **When** вызван `lint(filePath, { content })`
- **Then** ошибок нет (`errors` пуст)
- **And** файл с диска не читается повторно

**Scenario:** lintAndFix с переданным content [`integration`]

- **Given** файл с autofix-абельными ошибками
- **And** контент прочитан в `content`
- **When** вызван `lintAndFix(filePath, { content })`
- **Then** ошибки исправлены в файле на диске
- **And** `autoFixed > 0`

**Scenario:** lint без content — обратная совместимость [`unit`]

- **Given** вызов `lint(filePath)` без второго аргумента
- **When** `options` не передан
- **Then** поведение как раньше — чтение файла с диска

**Scenario:** Содержимое content игнорируется для filePath в ошибках [`unit`]

- **Given** файл с ошибками и `content` с ошибками
- **When** вызван `lint(filePath, { content })`
- **Then** ошибки содержат правильный `filePath` (независимо от content)

## 3. Phases

### Phase P1 — types

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/linter/dbc-linter.types.ts` (Modify)
- **Acceptance:**
  - `DbcLintOptions.content?: string` добавлен
  - JSDoc: `@purpose Pre-read file content. When passed, the linter uses this instead of reading from disk.`

### Phase P2 — implementation

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` (Modify)
- **Acceptance:**
  - `lint()`: если `options?.content` передан — передать его в `DbcTsAstAdapter` вместо чтения файла
  - `lintAndFix()`: аналогично
  - Без `content` — поведение не меняется

### Phase P3 — tests

- **Kind:** test
- **Rules:** typescript-rules, node-test
- **Target Test Files:** `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` (Modify)
- **Acceptance:**
  - Тест: `lint(filePath, { content })` с валидным контентом → 0 ошибок
  - Тест: `lintAndFix(filePath, { content })` → autofix работает
  - Тест: `lint(filePath)` без options → обратная совместимость

## 4. Execution Log

### Round 1 — 2026-05-15, initial

#### P1

- [x] `2026-05-15T14:44:24Z` recon git=main/dirty targets=exists divergence=none
- [x] `2026-05-15T14:44:24Z` rules typescript-rules
- [x] `2026-05-15T14:44:24Z` file services/dbc/linter/dbc-linter.types.ts
- [x] `2026-05-15T14:44:24Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-15T14:44:24Z` ver npm run lint → pass exit=0
- [x] `2026-05-15T14:44:24Z` DONE
      **Handoff →** artifacts: [services/dbc/linter/dbc-linter.types.ts]; decisions: [DbcLintOptions.content=optional-string]; open: []

#### P2

- [x] `2026-05-15T14:56:01Z` recon git=main/dirty targets=exists divergence=none
- [x] `2026-05-15T14:56:01Z` rules typescript-rules
- [x] `2026-05-15T14:56:01Z` file services/dbc/linter/dbc-ast-adapter.types.ts
- [x] `2026-05-15T14:56:01Z` file services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts
- [x] `2026-05-15T14:56:01Z` file services/dbc/linter/implementations/ts/dbc-ts-linter.ts
- [x] `2026-05-15T14:56:01Z` insight P2 требует изменения DbcAstAdapter.parseFile(content?) — адаптерные файлы не перечислены в Target Files P2 → ticket §3 P2 Target Files необходимо расширить
- [x] `2026-05-15T14:56:01Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-15T14:56:01Z` ver npm run lint → pass exit=0
- [x] `2026-05-15T14:56:01Z` DONE
      **Handoff →** artifacts: [services/dbc/linter/implementations/ts/dbc-ts-linter.ts, services/dbc/linter/dbc-ast-adapter.types.ts, services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts]; decisions: [DbcAstAdapter.parseFile.signature=parseFile(filePath,content?:string)]; open: [scope-gap: адаптерные файлы не в Target Files P2]

#### P3

- [x] `2026-05-15T15:10:00Z` recon git=main/dirty targets=exists divergence=none
- [x] `2026-05-15T15:10:00Z` rules typescript-rules, node-test
- [x] `2026-05-15T15:10:00Z` test services/dbc/linter/implementations/ts/**tests**/dbc-ts-linter.test.ts
- [x] `2026-05-15T15:10:00Z` file services/dbc/linter/implementations/ts/dbc-ts-linter.ts
- [x] `2026-05-15T15:10:00Z` insight lintAndFix re-lint uses stale options.content вместо чтения с диска → dbc-ts-linter.ts §lintAndFix (фикс: re-lint без content) — implementation bug found by P3 test
- [x] `2026-05-15T15:10:00Z` cov lint с переданным content → dbc-ts-linter.test.ts::N1
- [x] `2026-05-15T15:10:00Z` cov lintAndFix с переданным content → dbc-ts-linter.test.ts::N2
- [x] `2026-05-15T15:10:00Z` cov lint без content — обратная совместимость → dbc-ts-linter.test.ts::N3
- [x] `2026-05-15T15:10:00Z` cov Содержимое content игнорируется для filePath в ошибках → dbc-ts-linter.test.ts::N4
- [x] `2026-05-15T15:10:00Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-15T15:10:00Z` ver node --test services/dbc/linter/implementations/ts/**tests**/dbc-ts-linter.test.ts → pass exit=0
- [x] `2026-05-15T15:10:00Z` ver npm run lint → pass exit=0
- [x] `2026-05-15T15:10:00Z` DONE
      **Handoff →** artifacts: [services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts, services/dbc/linter/implementations/ts/dbc-ts-linter.ts]; decisions: [P2-bug-fixed=lintAndFix-re-lint-no-content, test-coverage=4-cases]; open: []

### Round 2 — 2026-05-15, fix: address audit finding F-05

#### P1 — re-run: fix: strategy should be optional per scope spec §4 Public API Surface

- [x] `2026-05-15T15:31:02Z` recon git=main/dirty targets=exists divergence=none
- [x] `2026-05-15T15:31:02Z` rules typescript-rules
- [x] `2026-05-15T15:31:02Z` file services/dbc/linter/dbc-linter.types.ts
- [x] `2026-05-15T15:31:02Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-15T15:31:02Z` DONE
      **Handoff →** artifacts: [services/dbc/linter/dbc-linter.types.ts]; decisions: [DbcLintOptions.strategy=optional]; open: []
