# Task: TSK-88 — Реализовать `removeRedundantInImplements` в autofix-цепочке

<!--SECTION:META-->
## 1. Meta
- **Task-ID:** TSK-88
- **Status:** [ ] TODO
- **Purpose:** Реализовать шаг autofix `_removeRedundantInImplements`: удаление `@param`/`@returns` в методах класса с `implements Interface` + `@see {Interface#method}`. Включает: AST-адаптер → `implementsInterfaces: string[]`, валидатор → интеграция `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS` через `DbcValidateContext` (константа уже объявлена в `dbc-linter.types.ts`), autofix-функция, приоритет над `ERR_DBC_LINT_RETURNS_UNEXPECTED`, 17 тестовых фикстур.
- **Scope:** dbc
- **Module:** dbc-linter
- **Dependencies:** TSK-21
- **Spec References:**
  - FR-24 implements-method row + BDD: [dbc spec §3.1](../../specs/dbc/dbc.spec.md)
  - FR-26 autofix chain (step 2): [dbc spec §3.1](../../specs/dbc/dbc.spec.md)
  - Autofix chain + D-019: [dbc-linter spec §4.2, §7](../../specs/dbc/dbc-linter/dbc-linter.spec.md)
  - Validator contract §4.3: [dbc-linter spec §4.3](../../specs/dbc/dbc-linter/dbc-linter.spec.md)
  - Test matrix N1–N16: [dbc-linter spec §9](../../specs/dbc/dbc-linter/dbc-linter.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | —    | [ ]    |
| P2 | test | P1   | [ ]    |
<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->
### P1 — impl
- **Objective:** Реализовать `_removeRedundantInImplements` + AST-адаптер (`implementsInterfaces: string[]`) + валидатор (`DbcValidateContext`, интеграция `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS`, приоритет: если redundancy срабатывает на `@returns` → `ERR_DBC_LINT_RETURNS_UNEXPECTED` НЕ генерируется) + autofix-функция `_removeRedundantInImplements(source, entry, member) → string` + интеграция в autofix-цепочку (step 2) + обновление error-order инварианта в комментарии `validate()` (добавить `PARAM_REDUNDANT_IN_IMPLEMENTS` в начало).
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts` (Modify — добавить извлечение `implementsInterfaces: string[]` из `implements` clause tree-sitter)
  - `services/dbc/linter/dbc-ast-adapter.types.ts` (Modify — `DbcExportedEntity.implementsInterfaces?: boolean` → `string[]`)
  - `services/dbc/linter/dbc-linter.types.ts` (Modify — добавить `DbcValidateContext` type)
  - `services/dbc/linter/implementations/ts/dbc-ts-linter.ts` (Modify — валидатор: `validate()` принимает `context?: DbcValidateContext`, генерирует `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS`; autofix: `_removeRedundantInImplements(source, entry, member) → string`; интеграция в `lintAndFix` step 2)
- **Inputs:** none
- **Exit:** typecheck pass; реализована вся production-логика для BDD-сценариев из секции 4; autofix-шаг добавлен в цепочку на позицию 2; обновлён error-order инвариант в `validate()`
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — test
- **Objective:** Создать 17 fixture-файлов для категории N (`implements-see/`), покрывающих все BDD-сценарии: happy path, extends-not-redundant, override-not-redundant, extends+implements, multiple-implements, see-on-extends, autofix-preserves-purpose, idempotent, etc. Добавить тест-кейсы в `dbc-ts-linter.test.ts`.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` (Modify — добавить тесты N1–N16)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/happy.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/no-see.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/see-no-implements.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/see-wrong-interface.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/see-wrong-method.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/only-param-redundant.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/multiple-params.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/autofix.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/autofix-idempotent.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/extends-not-redundant.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/override-not-redundant.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/extends-and-implements.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/see-on-extends-not-implements.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/multiple-implements.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/extends-no-see.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/autofix-preserves-purpose.ts` (Create)
  - `services/dbc/linter/implementations/ts/__tests__/fixtures/implements-see/priority-returns-only.ts` (Create)
- **Inputs:** P1 handoff
- **Exit:** все 17 тест-кейсов N1–N17 проходят; тесты покрывают все BDD-сценарии из секции 4
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->
## 4. Acceptance Criteria (BDD)

Contract: see Spec References → FR-24 implements-method row + BDD-сценарии.

**Feature:** `removeRedundantInImplements` — удаление избыточных `@param`/`@returns` в implements-методах

**Scenario:** Happy — implements + @see → @param/@returns redundant [`unit`]
- **Given** класс `class Impl implements Agent`, метод `scan` с контрактом `/** @see {Agent#scan} | @param x - координата | @returns результат */`
- **When** `lintAndFix(filePath)`
- **Then** `@param x` → `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS`, `@returns` → `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS`. Autofix удаляет оба тега. Результат: `/** @see {Agent#scan} */`

**Scenario:** Edge — implements без @see → обычный method [`unit`]
- **Given** класс `class Impl implements Agent`, метод `scan` с контрактом `/** @param x | @returns result */` (без @see)
- **When** `lintAndFix(filePath)`
- **Then** `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS` отсутствует. Параметры проверяются как обычный method.

**Scenario:** Edge — extends (НЕ implements) → НЕ redundant [`unit`]
- **Given** класс `class Child extends Base`, метод `calculate` с контрактом `/** @see {Base#calculate} | @param x | @returns result */`
- **When** `lintAndFix(filePath)`
- **Then** `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS` отсутствует. Extends ≠ implements: наследуемый класс может менять сигнатуру.

**Scenario:** Edge — override (extends + изменённая сигнатура) → НЕ redundant [`unit`]
- **Given** класс `class Child extends Base`, метод `calculate` с ключевым словом `override`, изменённой сигнатурой (добавлен параметр `y`), контракт `/** @see {Base#calculate} | @param x | @param y | @returns сумма */`
- **When** `lintAndFix(filePath)`
- **Then** `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS` отсутствует. Override с изменённой сигнатурой требует собственного контракта.

**Scenario:** Edge — extends + implements → implements приоритет [`unit`]
- **Given** класс `class Impl extends Base implements Agent`, метод `scan` с контрактом `/** @see {Agent#scan} | @param x | @returns result */`
- **When** `lintAndFix(filePath)`
- **Then** `implementsInterfaces = ['Agent']` → `@see {Agent#scan}` совпадает → `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS` срабатывает.

**Scenario:** Edge — extends + implements, @see на extends-класс → НЕ redundant [`unit`]
- **Given** класс `class Impl extends Base implements Agent`, метод `scan` с контрактом `/** @see {Base#scan} | @param x | @returns result */`
- **When** `lintAndFix(filePath)`
- **Then** `Base` не в `implementsInterfaces` → НЕ redundant. Проверяется как обычный method.

**Scenario:** Edge — implements несколько интерфейсов → совпадение с любым [`unit`]
- **Given** класс `class Impl implements Agent, Stoppable`, метод `scan` с контрактом `/** @see {Agent#scan} | @param x | @returns result */`
- **When** `lintAndFix(filePath)`
- **Then** `implementsInterfaces = ['Agent', 'Stoppable']` → `@see` ссылается на `Agent#scan` — совпадает → redundant.

**Scenario:** Edge — @see на неправильный интерфейс → НЕ redundant [`unit`]
- **Given** класс `class Impl implements Agent`, метод `scan` с контрактом `/** @see {Other#scan} | @param x | @returns result */`
- **When** `lintAndFix(filePath)`
- **Then** `Other` не в `implementsInterfaces` → НЕ redundant.

**Scenario:** Edge — @see на неправильный метод → НЕ redundant [`unit`]
- **Given** класс `class Impl implements Agent`, метод `scan` с контрактом `/** @see {Agent#otherMethod} | @param x | @returns result */`
- **When** `lintAndFix(filePath)`
- **Then** methodName `otherMethod` ≠ `scan` → НЕ redundant.

**Scenario:** Edge — только @param redundant (void-метод) [`unit`]
- **Given** класс `class Impl implements Agent`, void-метод `getInfo` с контрактом `/** @see {Agent#getInfo} | @param id */`
- **When** `lintAndFix(filePath)`
- **Then** `@param id` → `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS`. `@returns` отсутствует → без ошибки.

**Scenario:** Edge — несколько @param redundant [`unit`]
- **Given** класс `class Impl implements Agent`, метод `scan` с контрактом `/** @see {Agent#scan} | @param x | @param y | @returns result */`
- **When** `lintAndFix(filePath)`
- **Then** 3 ошибки `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS`. Autofix удаляет все три тега.

**Scenario:** Autofix — идемпотентность [`unit`]
- **Given** файл после autofix (все redundant-теги уже удалены)
- **When** повторный `lintAndFix(filePath)`
- **Then** ошибок нет. Файл не изменился.

**Scenario:** Autofix — сохранение не-redundant тегов [`unit`]
- **Given** класс `class Impl implements Agent`, метод `scan` с контрактом `/** @see {Agent#scan} | @purpose Сканирует | @param x | @returns результат */`
- **When** `lintAndFix(filePath)`
- **Then** `@param x` и `@returns результат` удалены. `@purpose Сканирует` и `@see {Agent#scan}` сохранены на месте.

**Scenario:** Edge — extends, без @see, без override → обычный method [`unit`]
- **Given** класс `class Child extends Base`, метод `calculate` (без @see, без override) с контрактом `/** @param x | @returns result */`
- **When** `lintAndFix(filePath)`
- **Then** `implementsInterfaces` пуст → проверяется как обычный method.

**Scenario:** Edge — класс без implements, с @see → обычный method [`unit`]
- **Given** класс `class Helper` (без implements), метод `scan` с контрактом `/** @see {Agent#scan} | @param x | @returns result */`
- **When** `lintAndFix(filePath)`
- **Then** `implementsInterfaces` пуст/undefined → НЕ redundant. Проверяется как обычный method.

**Scenario:** Priority — redundancy вытесняет `ERR_DBC_LINT_RETURNS_UNEXPECTED` [`unit`]
- **Given** класс `class Impl implements Agent`, метод `scan` с контрактом `/** @see {Agent#scan} | @returns result */` (только @returns, без @param)
- **When** `lint(filePath)`
- **Then** 1 ошибка: `ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS` на @returns. `ERR_DBC_LINT_RETURNS_UNEXPECTED` НЕ генерируется (приоритет у redundancy).
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## 5. Verification
| Command | Required by |
|---------|-------------|
| `tsc --noEmit` | typescript-rules |
| `node --import tsx --test **/*.test.ts` | node-test |

- **Task-specific Completion additions:** все 16 fixture-файлов созданы; `implementsInterfaces: string[]` извлекается AST-адаптером; `DbcValidateContext` тип экспортирован; `_removeRedundantInImplements` добавлен в autofix-цепочку на позицию 2
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## 6. Test Scenario Coverage
| #  | BDD Scenario | Test File | Case Name |
|----|-------------|-----------|-----------|
| N1 | Happy — implements + @see → redundant | `implements-see/happy.ts` | `should detect redundant params and returns in implements+see method` |
| N2 | Edge — implements без @see | `implements-see/no-see.ts` | `should treat implements method without @see as normal method` |
| N3 | Edge — extends (не implements) | `implements-see/extends-not-redundant.ts` | `should NOT flag extends-class method with @see as redundant` |
| N4 | Edge — override (extends + изменённая сигнатура) | `implements-see/override-not-redundant.ts` | `should NOT flag override method with changed signature as redundant` |
| N5 | Edge — extends + implements (implements приоритет) | `implements-see/extends-and-implements.ts` | `should detect redundant params when implements matches even with extends` |
| N6 | Edge — extends + implements, @see на extends | `implements-see/see-on-extends-not-implements.ts` | `should NOT flag redundant when @see points to extends-class, not implements` |
| N7 | Edge — implements несколько интерфейсов | `implements-see/multiple-implements.ts` | `should detect redundant when @see matches one of multiple implemented interfaces` |
| N8 | Edge — @see на другой интерфейс | `implements-see/see-wrong-interface.ts` | `should NOT flag redundant when @see points to non-implemented interface` |
| N9 | Edge — @see на другой метод | `implements-see/see-wrong-method.ts` | `should NOT flag redundant when @see methodName differs from member name` |
| N10 | Edge — только @param redundant | `implements-see/only-param-redundant.ts` | `should detect only @param as redundant in void implements+see method` |
| N11 | Edge — несколько @param redundant | `implements-see/multiple-params.ts` | `should detect all @params and @returns as redundant` |
| N12 | Autofix — удаление тегов | `implements-see/autofix.ts` | `should remove @param and @returns via autofix` |
| N13 | Autofix — идемпотентность | `implements-see/autofix-idempotent.ts` | `should be idempotent on repeated autofix` |
| N14 | Autofix — сохранение @purpose | `implements-see/autofix-preserves-purpose.ts` | `should preserve non-param tags (@purpose) during autofix` |
| N15 | Edge — extends без @see | `implements-see/extends-no-see.ts` | `should treat extends method without @see as normal method` |
| N16 | Edge — класс без implements с @see | `implements-see/see-no-implements.ts` | `should treat non-implements class method with @see as normal method` |
| N17 | Priority — redundancy вытесняет RETURNS_UNEXPECTED | `implements-see/priority-returns-only.ts` | `should emit only ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS, not RETURNS_UNEXPECTED` |
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## 7. Execution Log
*(Round = one execute-then-audit attempt. Per-phase blocks within a Round.)*

### Round 1 — 2026-06-28, initial

#### P1
- [ ] `<ts>` ver `tsc --noEmit` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2
- [ ] `<ts>` ver `node --import tsx --test services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close
- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
