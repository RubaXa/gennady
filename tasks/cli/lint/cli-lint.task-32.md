# Task: TSK-32 — LanguageCheck: проверка языка (English-only) в контрактах и хедерах

## 1. Meta & Traceability

- **Task-ID:** TSK-32
- **Purpose:** Добавить четвёртую проверку в `gennady lint` — LanguageCheck. JSDoc-контракты (DbC: `@purpose`, `@implements`, `@invariant`, `@param`, `@returns`, `@consumer`, `@sideEffect`) и file headers (`// @file:`, `// @consumers:`) должны быть на английском. Кириллические символы → `ERR_CLI_LINT_NON_ENGLISH`.
- **Scope:** cli
- **Module:** lint
- **Dependencies:** TSK-16 (LintCommand)
- **Spec References:**
  - LanguageCheck surface + contract: [lint spec §3, §4.3](../../specs/cli/lint/lint.spec.md)
  - LintCommand: [lint spec §3](../../specs/cli/lint/lint.spec.md)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |
  | node-test        | ai/directives/testing/node-test.xml       |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
- **Target Files:**
  - `cli/cmd/lint/checks/language.check.ts` (Create)
  - `cli/cmd/lint/lint.types.ts` (Modify — добавить `ERR_CLI_LINT_NON_ENGLISH`)
  - `cli/cmd/lint/lint.cmd.ts` (Modify — зарегистрировать 4-й check)
- **Target Test Files:**
  - `cli/cmd/lint/__tests__/language.check.test.ts` (Create)

## 2. Acceptance Criteria (BDD)

**Feature:** LanguageCheck — только английский в контрактах и хедерах

**Scenario:** English-only JSDoc и headers — чисто [`unit`]

- **Given** файл с `// @file: English.`, `// @consumers: Foo`, `/** @purpose Test. */`
- **When** `LanguageCheck.check(content, filePath)`
- **Then** пустой массив ошибок

**Scenario:** Кириллица в @file: → ERR_CLI_LINT_NON_ENGLISH [`unit`]

- **Given** файл с `// @file: Тестовый файл.`
- **When** `LanguageCheck.check(content, filePath)`
- **Then** ошибка с кодом `ERR_CLI_LINT_NON_ENGLISH` для каждого кириллического символа

**Scenario:** Кириллица в @consumers: → ERR_CLI_LINT_NON_ENGLISH [`unit`]

- **Given** файл с `// @consumers: Потребитель`
- **When** `LanguageCheck.check(content, filePath)`
- **Then** ошибка с кодом `ERR_CLI_LINT_NON_ENGLISH`

**Scenario:** Кириллица в JSDoc-контракте → ERR_CLI_LINT_NON_ENGLISH [`unit`]

- **Given** файл с `/** @purpose Тестовая функция. */`
- **When** `LanguageCheck.check(content, filePath)`
- **Then** ошибка с кодом `ERR_CLI_LINT_NON_ENGLISH`

**Scenario:** Кириллица вне JSDoc и хедеров — не ошибка [`unit`]

- **Given** файл с `// Обычный комментарий` и `const msg = "Привет"`
- **When** `LanguageCheck.check(content, filePath)`
- **Then** пустой массив ошибок

**Scenario:** Несколько кириллических символов в хедере — по ошибке на каждый [`unit`]

- **Given** файл с `// @file: Тест.` и `// @consumers: Тестер`
- **When** `LanguageCheck.check(content, filePath)`
- **Then** несколько ошибок: 3+ на строке 1, 5+ на строке 2

## 3. Phases

### Phase P1 — code

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `cli/cmd/lint/checks/language.check.ts` (Create), `cli/cmd/lint/lint.types.ts` (Modify), `cli/cmd/lint/lint.cmd.ts` (Modify)
- **Acceptance:**
  - `LanguageCheck.check()` — pure function, no I/O
  - JSDoc-блоки: сбор через `collectJsDocRanges()`, проверка каждого символа `/\p{Script=Cyrillic}/u`
  - File headers: проверка строк `// @file:` и `// @consumers:` до первого `import`
  - `ERR_CLI_LINT_NON_ENGLISH` добавлен в `lint.types.ts`
  - Зарегистрирован в `lint.cmd.ts` как 4-й check
  - `tsc --noEmit` проходит

### Phase P2 — tests

- **Kind:** test
- **Rules:** typescript-rules, node-test
- **Target Test Files:** `cli/cmd/lint/__tests__/language.check.test.ts` (Create)
- **Acceptance:**
  - 7 тестов: English-only clean, Cyrillic in @file, Cyrillic in @consumers, Cyrillic in JSDoc, Cyrillic outside, multiple chars in header, no JSDoc/headers
  - `node --test cli/cmd/lint/__tests__/language.check.test.ts` → pass
  - `gennady lint --autofix cli/cmd/lint/checks/language.check.ts` → 0 errors

## 4. Execution Log

### Round 1 — 2026-05-18, initial

#### P1

- [x] `2026-05-18T11:00:00Z` recon targets=language.check.ts,lint.types.ts,lint.cmd.ts|exists divergence=none
- [x] `2026-05-18T11:00:00Z` rules typescript-rules
- [x] `2026-05-18T11:00:00Z` file cli/cmd/lint/checks/language.check.ts
- [x] `2026-05-18T11:00:00Z` file cli/cmd/lint/lint.types.ts
- [x] `2026-05-18T11:00:00Z` file cli/cmd/lint/lint.cmd.ts
- [x] `2026-05-18T11:00:00Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-18T11:00:00Z` DONE
      intro LanguageCheck ← pure function, Cyrillic detection via Unicode property escape
      intro ERR_CLI_LINT_NON_ENGLISH ← new error code
      **Handoff →** artifacts: [language.check.ts, lint.types.ts, lint.cmd.ts]; decisions: [LanguageCheck=pure-function, scope=JSDoc+headers-only]; open: []

#### P2

- [x] `2026-05-18T11:10:00Z` recon targets=language.check.test.ts|exists divergence=none
- [x] `2026-05-18T11:10:00Z` rules typescript-rules, node-test
- [x] `2026-05-18T11:10:00Z` test cli/cmd/lint/__tests__/language.check.test.ts
- [x] `2026-05-18T11:10:00Z` ver node --test cli/cmd/lint/__tests__/language.check.test.ts → pass exit=0 (7/7)
- [x] `2026-05-18T11:10:00Z` ver npx tsx cli/gennady.ts lint --autofix cli/cmd/lint/checks/language.check.ts → pass exit=0 (0 errors)
- [x] `2026-05-18T11:10:00Z` DONE
      cov English-only → language.check.test.ts::English-only
      cov Cyrillic in @file → language.check.test.ts::Cyrillic in @file
      cov Cyrillic in @consumers → language.check.test.ts::Cyrillic in @consumers
      cov Cyrillic in JSDoc → language.check.test.ts::Cyrillic in JSDoc
      cov Cyrillic outside → language.check.test.ts::Cyrillic outside
      cov Multiple chars → language.check.test.ts::Multiple chars
      cov No JSDoc/headers → language.check.test.ts::No JSDoc/headers
      **Handoff →** artifacts: [language.check.test.ts]; decisions: [test-count=7, all-BDD-covered]; open: []

#### Round close

- [x] `2026-05-18T11:12:00Z` sync cli+root
- [x] `2026-05-18T11:12:00Z` DONE
