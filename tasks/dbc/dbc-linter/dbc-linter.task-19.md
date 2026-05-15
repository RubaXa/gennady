# Task: TSK-19 — Проверка контрактов для type alias (объектный литерал) и interface property (function-typed)

## 1. Meta & Traceability

- **Task-ID:** TSK-19
- **Purpose:** Расширить матрицу проверок FR-24: члены `type` с объектным литералом и `interface property` (function-typed) теперь проверяются на соответствие `@param`/`@returns` так же, как function/method.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** TSK-10
- **Spec References:**
  - FR-24 матрица: [dbc spec §3.1](../../specs/dbc/dbc.spec.md)
  - DbcContractMatchValidator: [dbc-linter spec §3](../../specs/dbc/dbc-linter/dbc-linter.spec.md)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |
  | node-test        | ai/directives/testing/node-test.xml       |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Target Files:**
  - `services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts` (Modify — извлекать члены type alias с объектным литералом)
  - `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` (Modify — валидация interface property function-typed)

## 2. Acceptance Criteria (BDD)

**Feature:** Проверка контрактов для type alias и interface property

**Scenario:** type alias с объектным литералом — методы проверяются [`unit`]

- **Given** `export type Foo = { bar(x: string): void }`
- **When** `lint()`
- **Then** `bar` проверен: `@param x` должен присутствовать, `@returns` должен отсутствовать (void)

**Scenario:** type alias с объектным литералом — нет контракта у метода [`unit`]

- **Given** `export type Foo = { bar(x: string): string }` без JSDoc у `bar`
- **When** `lint()`
- **Then** `ERR_DBC_LINT_MISSING_CONTRACT` для `bar`

**Scenario:** interface property function-typed проверяется [`unit`]

- **Given** `export interface Foo { bar: (x: string) => string }` без JSDoc у `bar`
- **When** `lint()`
- **Then** `ERR_DBC_LINT_MISSING_CONTRACT` для `bar`

**Scenario:** SimpleLogger прогоняется без ошибок после фикса [`integration`]

- **Given** `services/logger/logger.ts` с type SimpleLogger
- **When** `lint()`
- **Then** каждый метод (`debug`, `info`, `warn`, `error`) имеет контракт → 0 ошибок

## 3. Phases

### Phase P1 — adapter + validator

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts`, `services/dbc/linter/implementations/ts/dbc-ts-linter.ts`
- **Acceptance:**
  - `DbcTsAstAdapter`: для type alias с объектным литералом — извлекать члены как `DbcMember[]`
  - Член type literal, являющийся method signature или property с function type → kind = `'interface-method'`
  - Член type literal, являющийся property с non-function type → kind = `'interface-property'`
  - `DbcContractMatchValidator`: для kind=`'interface-method'` проверять @param + @returns как для function

### Phase P2 — tests

- **Kind:** test
- **Rules:** typescript-rules, node-test
- **Target Test Files:** `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` (Modify)
- **Acceptance:**
  - Fixture: type alias с методами (happy — все покрыты)
  - Fixture: type alias с методом без контракта
  - Fixture: interface с function-typed property без контракта

## 4. Execution Log

### Round 1 — 2026-05-15, initial

#### P1
- [x] `2026-05-15T19:10:00Z` recon targets=dbc-ts-ast-adapter.ts|exists,dbc-ts-linter.ts|exists divergence=none
- [x] `2026-05-15T19:10:00Z` rules typescript-rules
- [x] `2026-05-15T19:10:00Z` file services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts
- [x] `2026-05-15T19:10:00Z` file services/dbc/linter/implementations/ts/dbc-ts-linter.ts
- [x] `2026-05-15T19:10:00Z` ver npx tsc --noEmit → pass exit=0
- [x] `2026-05-15T19:10:00Z` DONE
      intro _extractTypeAliasMembers ← extract members from type alias with object_type
      intro _extractObjectTypeMembers ← shared method for interface body and object_type
      intro _isFunctionTypedProperty ← detect function_type inside property_signature
      intro _findFunctionTypeNode ← locate function_type node for signature extraction
      **Handoff →** artifacts: [services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts, services/dbc/linter/implementations/ts/dbc-ts-linter.ts]; decisions: [_extractSignature-function_type=supported, interface-property-function-typed=interface-method]; open: []

#### P2
- [x] `2026-05-15T19:11:00Z` recon targets=dbc-ts-linter.test.ts|exists divergence=none
- [x] `2026-05-15T19:11:00Z` rules typescript-rules, node-test
- [x] `2026-05-15T19:11:00Z` test services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts
- [x] `2026-05-15T19:11:00Z` ver npm test → pass exit=0
- [x] `2026-05-15T19:11:00Z` DONE
      cov type alias методы проверяются → dbc-ts-linter.test.ts (happy path)
      cov interface property function-typed → dbc-ts-linter.test.ts (missing contract)
      cov SimpleLogger без ошибок → integration: logger.ts (0 dbc errors)
      **Handoff →** artifacts: [services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts]; decisions: [test-coverage=type-alias+interface-property]; open: []

#### Round close
- [x] `2026-05-15T19:11:00Z` sync dbc+root
- [x] `2026-05-15T19:11:00Z` DONE
