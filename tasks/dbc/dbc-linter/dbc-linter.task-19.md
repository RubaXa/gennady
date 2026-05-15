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

### Round 1 — <YYYY-MM-DD>, initial

- [ ] `[<ts>]` Task initialized.
- [ ] `[<ts>]` Implementation file: `services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts`.
- [ ] `[<ts>]` Implementation file: `services/dbc/linter/implementations/ts/dbc-ts-linter.ts`.
- [ ] `[<ts>]` Test file: `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts`.
- [ ] `[<ts>]` Verification: `npm test` → `<pass|fail>` [`exit=<code>`].
- [ ] `[<ts>]` Scenario coverage: `type alias методы проверяются` → `dbc-ts-linter.test.ts`.
- [ ] `[<ts>]` Scenario coverage: `type alias метод без контракта` → `dbc-ts-linter.test.ts`.
- [ ] `[<ts>]` Scenario coverage: `interface property function-typed` → `dbc-ts-linter.test.ts`.
- [ ] `[<ts>]` Scenario coverage: `SimpleLogger без ошибок` → `integration: logger.ts`.
- [ ] `[<ts>]` Self-audit: walked loaded rule axioms against generated code. Violations: `<list or "none">`.
- [ ] `[<ts>]` Introduced (if any): `<Entity>` because `<reason>`.
- [ ] `[<ts>]` Tracker synced: `tasks/dbc/README.md` + `tasks/README.md`.
- [ ] `[<ts>]` Status: [x] DONE.
