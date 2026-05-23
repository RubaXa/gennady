# Task: TSK-49 — resolveTargets() + интеграция в LintCommand

<!--SECTION:META-->
## 1. Meta
- **Task-ID:** TSK-49
- **Status:** [x] DONE
- **Purpose:** Реализовать `resolveTargets()` — рекурсивный обход директорий с фильтрацией `.ts`/`.tsx`, дедупликацией и graceful degradation. Интегрировать в `LintCommand.run()`.
- **Scope:** `cli`
- **Module:** `lint`
- **Dependencies:** TSK-16
- **Spec References:**
  - Contract: [`resolveTargets`](../../../specs/cli/lint/lint.spec.md#directory-resolution-contract-resolvetargets)
  - Entity: [`LintCommand`](../../../specs/cli/lint/lint.spec.md#lintcommand)
  - Constraints: [§4.1 FR-09a–09e](../../../specs/cli/cli.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->
## 2. Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | impl | —    | [x]    |
| P2 | impl | P1   | [x]    |
<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->
### P1 — impl
- **Objective:** реализовать `resolveTargets()`: рекурсивный обход, фильтр `.ts`/`.tsx` (регистро-независимо), дедупликация, сортировка, исключение `node_modules`/скрытых/`dist`/`coverage`/`build`/`out`, `lstat` (не следуем symlink), обработка ENOENT/EACCES → `ERR_CLI_LINT_RESOLVE_FAILED`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/lint/lint.cmd.ts`
  - `cli/cmd/lint/lint.types.ts`
- **Inputs:** none
- **Exit:** `resolveTargets()` возвращает `{ files: string[]; errors: LintError[] }` по контракту; typecheck pass
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — impl
- **Objective:** интегрировать `resolveTargets` в `LintCommand.run()`; запретить `--staged` + позиционные цели (ошибка, exit 1); обновить `cli/gennady.ts`
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/lint/lint.cmd.ts`
  - `cli/gennady.ts`
- **Inputs:** P1 handoff
- **Exit:** `gennady lint src/` работает; `gennady lint --staged src/foo.ts` → ошибка, exit 1; typecheck pass
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->
## 4. Acceptance Criteria (BDD)
Contract: see Spec References.

**Feature:** Рекурсивный линтинг директорий

**Scenario:** Линтинг директории с `.ts`/`.tsx` файлами [`integration`]
- **Given** директория `services/dbc/` содержит 3 `.ts` и 1 `.tsx` файл
- **When** `gennady lint services/dbc/`
- **Then** все 4 файла пролинчены; ошибки (если есть) в ESLint-формате
- **And** exit code соответствует наличию ошибок

**Scenario:** Смешанный ввод: файл + директория с дубликатом [`integration`]
- **Given** файл `src/foo.ts` и директория `src/` (содержит `foo.ts` + `bar.ts`)
- **When** `gennady lint src/foo.ts src/`
- **Then** `foo.ts` пролинчен ровно один раз; `bar.ts` тоже пролинчен
- **And** exit code соответствует наличию ошибок

**Scenario:** Несуществующий путь — graceful degradation [`integration`]
- **Given** путь `nonexistent/` не существует
- **When** `gennady lint nonexistent/`
- **Then** `ERR_CLI_LINT_RESOLVE_FAILED` в stderr; exit 0

**Scenario:** Частичный сбой: валидный + невалидный [`integration`]
- **Given** `src/foo.ts` (существует) и `nonexistent/` (нет)
- **When** `gennady lint src/foo.ts nonexistent/`
- **Then** `foo.ts` пролинчен; `ERR_CLI_LINT_RESOLVE_FAILED` для `nonexistent/` в stderr
- **And** exit code — только по ошибкам линтинга `foo.ts`

**Scenario:** `--staged` + позиционные цели — ошибка [`integration`]
- **Given** staged файлы есть
- **When** `gennady lint --staged src/foo.ts`
- **Then** ошибка: флаги взаимоисключающие; exit 1

**Scenario:** Фильтрация: `.js` в директории молча игнорируется [`unit`]
- **Given** директория содержит `a.ts`, `b.js`, `c.tsx`
- **When** `resolveTargets(['dir/'])`
- **Then** `files` = [`abs/a.ts`, `abs/c.tsx`]; `errors` = `[]`

**Scenario:** `node_modules/` исключается [`unit`]
- **Given** директория `node_modules/` содержит `pkg/index.ts`
- **When** `resolveTargets(['node_modules/'])`
- **Then** `files` = `[]`; `errors` = `[]`
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## 5. Verification
| Command | Required by |
|---------|-------------|
| `npx tsc --noEmit` | typescript-rules |

- **Completion additions:** none beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## 6. Test Scenario Coverage
- Scenario «Линтинг директории» → `cli/cmd/lint/__tests__/lint.cmd.test.ts` :: `lints directory recursively`
- Scenario «Смешанный ввод» → `cli/cmd/lint/__tests__/lint.cmd.test.ts` :: `deduplicates overlapping targets`
- Scenario «Несуществующий путь» → `cli/cmd/lint/__tests__/lint.cmd.test.ts` :: `reports ENOENT gracefully`
- Scenario «Частичный сбой» → `cli/cmd/lint/__tests__/lint.cmd.test.ts` :: `partial resolution failure continues`
- Scenario «--staged + позиционные» → `cli/cmd/lint/__tests__/lint.cmd.test.ts` :: `staged and targets are mutually exclusive`
- Scenario «Фильтрация .js» → `cli/cmd/lint/__tests__/resolve-targets.test.ts` :: `filters unsupported extensions silently`
- Scenario «node_modules исключается» → `cli/cmd/lint/__tests__/resolve-targets.test.ts` :: `excludes node_modules`

**Deferred Test Ownership:** none — все сценарии покрываются в TSK-50
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## 7. Execution Log
*(Round = one execute-then-audit attempt. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)*

### Round 1 — 2026-05-23, initial

#### P1
- [x] `2026-05-23T15:25:57Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-05-23T15:25:57Z` DONE
**Handoff →** artifacts: [cli/cmd/lint/lint.cmd.ts, cli/cmd/lint/lint.types.ts]; decisions: [SUPPORTED_EXTENSIONS=.ts,.tsx, caseInsensitive, EXCLUDED_DIRS=node_modules,dist,coverage,build,out, skipSymlinks=true, dedupVia=Set, sortLexicographic]; open: []

#### P2
- [x] `2026-05-23T15:30:41Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-05-23T15:30:41Z` DONE
**Handoff →** artifacts: [cli/cmd/lint/lint.cmd.ts, cli/gennady.ts]; decisions: [resolveTargets integrated into LintCommand.run(), --staged+positional mutually exclusive]; open: []

#### Round close
- [x] `2026-05-23T15:30:41Z` DONE
<!--/SECTION:EXECUTION_LOG-->
