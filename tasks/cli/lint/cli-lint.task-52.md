# Task: TSK-52 — DisablesCheck: enforce purpose text (D-007 contract tightening)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-52
- **Status:** [x] DONE
- **Purpose:** Усилить `DisablesCheck` контракт: помимо `D-\d+` ссылки требовать наличие purpose-обоснования (≥ 8 непробельных символов после удаления маркера и токена `D-NNN`). Цель — не позволить агенту формально соблюсти политику D-007 пустой ссылкой типа `/* @ts-ignore: D-099 */` без объяснения зачем.
- **Scope:** `cli`
- **Module:** `lint`
- **Dependencies:** TSK-51 (DisablesCheck baseline)
- **Spec References:**
  - Policy: [`cli.spec.md` D-007](../../../specs/cli/cli.spec.md#d-007--typescriptlinter-disable-discipline)
  - Service: [`DisablesCheck`](../../../specs/cli/lint/lint.spec.md#disablescheck)
  - DbC: [`Service: DisablesCheck`](../../../specs/cli/lint/lint.spec.md#service-disablescheck)
  - Test Scenarios (additions DC-21..DC-25): [`§6.1 DisablesCheck`](../../../specs/cli/lint/lint.spec.md#unit-disablescheck-disablescheckttest-ts)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** добавить `ERR_CLI_LINT_DISABLE_MISSING_PURPOSE` в `lint.types.ts`; расширить `DisablesCheck.check()` логикой подсчёта purpose-длины.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/lint/checks/disables.check.ts`
  - `cli/cmd/lint/lint.types.ts`
- **Inputs:** none
- **Exit:** tsc pass; `gennady lint` на demo-файле различает два error-кода
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** добавить 5 unit-сценариев DC-21..DC-25 в `disables.check.test.ts`. Все существующие 20 сценариев DC-01..DC-20 должны продолжать pass.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/lint/__tests__/disables.check.test.ts`
- **Inputs:** P1 handoff
- **Exit:** 25/25 unit-тестов pass; `node --test cli/cmd/lint/__tests__/disables.check.test.ts` exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References. Полный список DC-NN — [`lint.spec.md §6.1`](../../../specs/cli/lint/lint.spec.md).

**Feature:** Контракт типизации DisablesCheck (preserved from TSK-51)

**Scenario:** Контракт `check(content, filePath) → LintError[]` не нарушен [`contract`]

- **Given** изменения в `disables.check.ts` для введения второго error-кода
- **When** consumer импортирует `check` и вызывает с любыми аргументами
- **Then** возвращаемый тип всё ещё `LintError[]` — добавление error-кода не меняет публичный контракт; backward-compatible

**Feature:** Purpose enforcement

**Scenario:** D-NNN присутствует, purpose >= 8 символов [`unit`]

- **Given** `// @ts-expect-error: D-042 — abstract class instantiation gate`
- **When** `check(content, 'foo.ts')`
- **Then** `[]`

**Scenario:** D-NNN присутствует, purpose отсутствует [`unit`]

- **Given** `// @ts-expect-error: D-042`
- **When** `check(content, 'foo.ts')`
- **Then** 1 ошибка `ERR_CLI_LINT_DISABLE_MISSING_PURPOSE`; message указывает обнаруженный D-NNN и требует добавить >= 8 символов purpose

**Scenario:** D-NNN присутствует, purpose слишком короткий [`unit`]

- **Given** `// @ts-ignore D-042 fix` (3 непробельных символа после удаления маркера и D-NNN)
- **When** `check(content, 'foo.ts')`
- **Then** 1 ошибка `ERR_CLI_LINT_DISABLE_MISSING_PURPOSE`

**Scenario:** Block-comment с D-NNN без purpose [`unit`]

- **Given** `/* @ts-ignore: D-099 */`
- **When** `check(content, 'foo.ts')`
- **Then** 1 ошибка `ERR_CLI_LINT_DISABLE_MISSING_PURPOSE`

**Scenario:** ESLint convention с пустым reason [`unit`]

- **Given** `// eslint-disable-next-line foo -- D-017` (после маркера и D-NNN — только rule name `foo` + `--`, 5 непробельных символов)
- **When** `check(content, 'foo.ts')`
- **Then** 1 ошибка `ERR_CLI_LINT_DISABLE_MISSING_PURPOSE`

**Scenario:** Старый error-код `UNAUTHORIZED_DISABLE` приоритет — D-NNN отсутствует [`unit`]

- **Given** `// @ts-expect-error: Cannot instantiate abstract class` (нет D-NNN)
- **When** `check(content, 'foo.ts')`
- **Then** 1 ошибка `ERR_CLI_LINT_UNAUTHORIZED_DISABLE` (НЕ `MISSING_PURPOSE`) — порядок проверки сохранён
<!--/SECTION:BDD-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

Полный список DC-NN — single source of truth в [`specs/cli/lint/lint.spec.md §6.1`](../../../specs/cli/lint/lint.spec.md#unit-disablescheck-disablescheckttest-ts). Этот ticket добавляет 5 сценариев DC-21..DC-25.

- Scenario «Контракт типа сохранён» → `disables.check.test.ts` :: `DC-01 contract typing — check(content, filePath) returns LintError[]` (preserved from TSK-51)
- Scenario «Purpose >= 8 символов» → `disables.check.test.ts` :: `DC-23 D-NNN with sufficient purpose → []`
- Scenario «Purpose отсутствует» → `disables.check.test.ts` :: `DC-21 D-NNN without purpose → MISSING_PURPOSE`
- Scenario «Purpose слишком короткий» → `disables.check.test.ts` :: `DC-22 D-NNN with too-short purpose → MISSING_PURPOSE`
- Scenario «Block-comment без purpose» → `disables.check.test.ts` :: `DC-25 block comment with D-NNN but no purpose → MISSING_PURPOSE`
- Scenario «ESLint pure rule, no reason» → `disables.check.test.ts` :: `DC-24 eslint-disable with rule name but no reason → MISSING_PURPOSE`
- Scenario «Приоритет UNAUTHORIZED при отсутствии D-NNN» → существующий `DC-04 unauthorized @ts-expect-error → 1 error` подтверждает порядок
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:DECISION_LOG-->

## 8. Decision Log

- D-007 (scope cli) — обновлён: добавлено требование purpose (≥ 8 непробельных символов после маркера и D-NNN); отвергнут жёсткий формат `<marker> — <D-NNN>: <purpose>` ради совместимости с ESLint convention
<!--/SECTION:DECISION_LOG-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-05-25, initial

#### P1

- [x] `2026-05-25T01:00Z` intro `countPurposeChars` ← internal helper для подсчёта non-whitespace символов purpose после стрипа маркера + D-NNN; internal-only, не публичная поверхность модуля.
- [x] `2026-05-25T01:00Z` ver `npx tsx cli/gennady.ts lint cli/cmd/lint/checks/disables.check.ts cli/cmd/lint/lint.types.ts` → pass exit=0
- [x] `2026-05-25T01:00Z` DONE — добавлен `ERR_CLI_LINT_DISABLE_MISSING_PURPOSE`; `check()` теперь различает две причины fail (no D-NNN vs no purpose); порог `MIN_PURPOSE_NON_WS_CHARS = 8` вынесен в const.

#### P2

- [x] `2026-05-25T01:00Z` discovery: ужесточение контракта поломало существующий DC-15 — старые тестовые "purpose" типа `— ok` (4 символа) теперь не проходят. Обновил DC-15 с реалистичными purpose'ами; assertion на error code добавлен.
- [x] `2026-05-25T01:00Z` ver `node --test cli/cmd/lint/__tests__/disables.check.test.ts` → pass exit=0 (25/25 — DC-01..DC-25)
- [x] `2026-05-25T01:00Z` DONE — 5 новых сценариев DC-21..DC-25 + обновлённый DC-15 pass; вся регрессия сохранена.

#### Round close

- [x] `2026-05-25T01:00Z` DONE — round closed.
<!--/SECTION:EXECUTION_LOG-->

## Audit Rounds

### Audit Round 1 — 2026-05-25, after Execution Round 1

```
@audit task=TSK-52 round=1 after-exec-round=1 triggered-reopen=none status=FAIL counts=B0·M1·m0·I0
F-01 | sev=M | type=TASK_ID_DRIFT | conf=H | loc=cli/cmd/lint/lint.types.ts:3 | src=ai/directives/sdd/audit.directive.xml#AX_TASK_ID_INTEGRITY | route=code-fix | act=обновить `// @tasks:` заголовок — добавить TSK-51 и TSK-52 (файл изменён под обе задачи: ERR_CLI_LINT_UNAUTHORIZED_DISABLE в TSK-51, ERR_CLI_LINT_DISABLE_MISSING_PURPOSE в TSK-52)
~applied | cli/cmd/lint/lint.types.ts | @tasks: TSK-12, TSK-49 → TSK-12, TSK-49, TSK-51, TSK-52; @consumers: добавлен DisablesCheck
```
