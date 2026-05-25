# Task: TSK-51 — Implement DisablesCheck (TypeScript/Linter disable discipline)

<!--SECTION:META-->
## 1. Meta
- **Task-ID:** TSK-51
- **Status:** [x] DONE
- **Purpose:** Реализовать `DisablesCheck` — enforcement политики D-007 из `cli.spec.md`. Каждое отключение TypeScript (`@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`) или линтера (`eslint-disable*`) обязано в той же строке нести ссылку `D-\d+` на запись Decision Log.
- **Scope:** `cli`
- **Module:** `lint`
- **Dependencies:** TSK-50 (lint command infrastructure готова)
- **Spec References:**
  - Policy: [`cli.spec.md` D-007](../../../specs/cli/cli.spec.md#d-007--typescriptlinter-disable-discipline)
  - Service: [`DisablesCheck`](../../../specs/cli/lint/lint.spec.md#disablescheck)
  - DbC: [`Service: DisablesCheck`](../../../specs/cli/lint/lint.spec.md#service-disablescheck)
  - Test Scenarios: [`§6.1 DisablesCheck`](../../../specs/cli/lint/lint.spec.md#unit-disablescheck-disablescheckttest-ts)
  - Authorized exception: [`vcs-client.spec.md` D-001](../../../specs/vcs/vcs-client/vcs-client.spec.md#d-001--authorized-escape-hatch-ts-expect-error-in-abstract-class-contract-test)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | —    | [x]    |
| P2 | test | P1   | [x]    |
| P3 | refactor | P2 | [x]    |
<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->
### P1 — impl
- **Objective:** реализовать `DisablesCheck.check()` + добавить `ERR_CLI_LINT_UNAUTHORIZED_DISABLE` в `lint.types.ts`; wire в `lint.cmd.ts` сразу после `checkLanguage`.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/lint/checks/disables.check.ts` (NEW)
  - `cli/cmd/lint/lint.types.ts` (+ 1 error code)
  - `cli/cmd/lint/lint.cmd.ts` (wire check)
- **Inputs:** none
- **Exit:** tsc pass; `gennady lint` запускается без runtime-ошибок на пустой директории
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — test
- **Objective:** unit-тесты `DisablesCheck` по сценариям DC-01 .. DC-20 из `lint.spec.md §6.1`. Включает contract-typing сценарий DC-01.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/lint/__tests__/disables.check.test.ts` (NEW)
- **Inputs:** P1 handoff
- **Exit:** все 20 сценариев pass; `node --test cli/cmd/lint/__tests__/disables.check.test.ts` exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->
### P3 — refactor
- **Objective:** добавить ссылки `D-001` (vcs-client local Decision Log) к существующим 3 `@ts-expect-error` в `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts`; финальный full-repo lint должен быть зелёным.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts`
- **Inputs:** P2 handoff
- **Exit:** `npx tsx cli/gennady.ts lint` по всему репо — exit 0 (исключая известные legacy-кейсы вне scope этого ticket'а)
<!--/SECTION:PHASE_P3-->

<!--SECTION:BDD-->
## 4. Acceptance Criteria (BDD)
Contract: см. Spec References. Полный список — [`lint.spec.md §6.1 DisablesCheck`](../../../specs/cli/lint/lint.spec.md).

**Feature:** Контракт типизации DisablesCheck

**Scenario:** Сигнатура check(content, filePath) возвращает LintError[] [`contract`]
- **Given** TypeScript-компилятор парсит модуль `disables.check.ts`
- **When** consumer импортирует `check` и вызывает `check(content, filePath)`
- **Then** возвращаемый тип — `LintError[]`; никаких `as any` в потребителе не требуется

**Feature:** Поведение DisablesCheck

**Scenario:** Валидный @ts-expect-error с D-NNN [`unit`]
- **Given** контент содержит `// @ts-expect-error: D-042 — reason`
- **When** `check(content, 'foo.ts')`
- **Then** `[]`

**Scenario:** @ts-expect-error без D-NNN [`unit`]
- **Given** контент содержит `// @ts-expect-error: Cannot instantiate abstract class`
- **When** `check(content, 'foo.ts')`
- **Then** 1 ошибка `ERR_CLI_LINT_UNAUTHORIZED_DISABLE`, message содержит инструкцию добавить `D-NNN`

**Scenario:** eslint-disable-next-line с inline-justification D-NNN [`unit`]
- **Given** контент содержит `// eslint-disable-next-line no-explicit-any -- D-017: third-party type missing`
- **When** `check(content, 'foo.ts')`
- **Then** `[]`

**Scenario:** Маркер в строковом литерале не флагается [`unit`]
- **Given** контент содержит `` const docs = `Use // @ts-ignore: …`; ``
- **When** `check(content, 'foo.ts')`
- **Then** `[]` — нет открывашки `//` или `/*` перед маркером (открывашка в обратных кавычках не считается)

**Scenario:** Block-comment с D-NNN [`unit`]
- **Given** контент содержит `/* @ts-ignore: D-099 (см. spec) */`
- **When** `check(content, 'foo.ts')`
- **Then** `[]`

**Scenario:** Несколько маркеров — каждый оценивается независимо [`unit`]
- **Given** в файле 3 disable-комментария: 2 с D-NNN, 1 без
- **When** `check(content, 'foo.ts')`
- **Then** 1 ошибка для строки без D-NNN

**Scenario:** Колонка ошибки указывает на маркер [`unit`]
- **Given** `// @ts-ignore` в позиции col=4
- **When** `check(content, 'foo.ts')`
- **Then** `col` ошибки = 4

**Scenario:** D-NNN case-insensitive по букве [`unit`]
- **Given** `// @ts-ignore: d-042`
- **When** `check(content, 'foo.ts')`
- **Then** `[]`

**Scenario:** Строка с file-header не даёт ложное срабатывание [`unit`]
- **Given** `// @file: Module description D-042`
- **When** `check(content, 'foo.ts')`
- **Then** `[]` — file-header не содержит маркер отключения
<!--/SECTION:BDD-->

<!--SECTION:TEST_COVERAGE-->
## 6. Test Scenario Coverage

Полный список сценариев (DC-01..DC-20) — single source of truth в [`specs/cli/lint/lint.spec.md §6.1 DisablesCheck`](../../../specs/cli/lint/lint.spec.md#unit-disablescheck-disablescheckttest-ts). Этот раздел ticket'а перечисляет 10 ключевых, цитируемых в section 4 BDD; остальные 10 (DC-02/05/06/08/09/11/12/13/16/17) присутствуют как `it(...)` в `disables.check.test.ts` и покрывают вариации того же контракта.

Canonical case names verbatim из `cli/cmd/lint/__tests__/disables.check.test.ts`:

- Scenario «Сигнатура check возвращает LintError[]» → `disables.check.test.ts` :: `DC-01 contract typing — check(content, filePath) returns LintError[]`
- Scenario «Валидный @ts-expect-error с D-NNN» → `disables.check.test.ts` :: `DC-03 valid @ts-expect-error with D-NNN → []`
- Scenario «@ts-expect-error без D-NNN» → `disables.check.test.ts` :: `DC-04 unauthorized @ts-expect-error → 1 error`
- Scenario «eslint-disable-next-line с D-NNN» → `disables.check.test.ts` :: `DC-07 eslint-disable-next-line with D-NNN justification → []`
- Scenario «Маркер в строковом литерале не флагается» → `disables.check.test.ts` :: `DC-14 marker text in string literal → []`
- Scenario «Block-comment с D-NNN» → `disables.check.test.ts` :: `DC-10 block comment with D-NNN → []`
- Scenario «Несколько маркеров» → `disables.check.test.ts` :: `DC-15 multiple markers mixed → 1 error for the unauthorized one`
- Scenario «Колонка ошибки» → `disables.check.test.ts` :: `DC-20 error col points to start of the marker`
- Scenario «D-NNN case-insensitive» → `disables.check.test.ts` :: `DC-19 case insensitive D-NNN`
- Scenario «file-header без срабатывания» → `disables.check.test.ts` :: `DC-18 file header is not a disable marker → []`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:DECISION_LOG-->
## 8. Decision Log
- D-007 (scope cli) — policy «Disable Discipline»; этот ticket — её enforcement в lint module
- D-001 (module vcs-client) — authorized escape hatch для существующих 3 `@ts-expect-error`
<!--/SECTION:DECISION_LOG-->

<!--SECTION:EXECUTION_LOG-->
## 7. Execution Log

### Round 1 — 2026-05-25, initial

#### P1
- [x] `2026-05-25T00:00Z` ver `npx tsx cli/gennady.ts lint cli/cmd/lint/checks/disables.check.ts cli/cmd/lint/lint.types.ts cli/cmd/lint/lint.cmd.ts` → pass exit=0
- [x] `2026-05-25T00:00Z` DONE — `DisablesCheck.check()` implemented; state-machine добавлен для distinguish'а маркера в строковом литерале vs реального комментария; wired в `LintCommand#run` сразу после `checkLanguage`.

#### P2
- [x] `2026-05-25T00:00Z` ver `node --test cli/cmd/lint/__tests__/disables.check.test.ts` → pass exit=0 (20/20)
- [x] `2026-05-25T00:00Z` insight: regex-only подход дал false-positive на DC-14 (маркер внутри string literal). Добавил `findCommentOpener` — minimal state-machine, отслеживает single/double/backtick-quoted строки и escape character. Stable для single-line; template-literal interpolation `${...}` не моделируется (документировано как MVP-ограничение в spec DbC).
- [x] `2026-05-25T00:00Z` DONE — все 20 сценариев DC-01..DC-20 pass.

#### P3
- [x] `2026-05-25T00:00Z` ver `npx tsx cli/gennady.ts lint .` → fail exit=1 (213 ошибок) — ALL pre-existing legacy (`ERR_CLI_LINT_MISSING_FILE`, `ERR_CLI_LINT_NON_ENGLISH`) в `assistant/` директории, вне scope ticket'а. Zero new `ERR_CLI_LINT_UNAUTHORIZED_DISABLE` ошибок.
- [x] `2026-05-25T00:00Z` ver `npx tsx cli/gennady.ts lint services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts` → pass exit=0 — все 3 `@ts-expect-error` теперь авторизованы через D-001 vcs-client.
- [x] `2026-05-25T00:00Z` DONE — refactor complete; legacy errors в `assistant/` — отдельный debt-ticket.

#### Round close
- [x] `2026-05-25T00:00Z` DONE — all phases verified; round closed.
<!--/SECTION:EXECUTION_LOG-->
