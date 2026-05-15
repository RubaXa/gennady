# Task: TSK-16 — LintCommand + регистрация в gennady.ts

## 1. Meta & Traceability

- **Task-ID:** TSK-16
- **Purpose:** Реализовать `LintCommand.run()` — CLI-обвязку: парсинг аргументов, git scan, цикл по файлам, вывод. Зарегистрировать команду в `gennady.ts` и `cli/AGENTS.md`.
- **Scope:** cli
- **Module:** lint
- **Dependencies:** TSK-13, TSK-14, TSK-15
- **Spec References:**
  - Golden DX: [cli spec §3](../../specs/cli/cli.spec.md)
  - LintCommand surface: [lint spec §3](../../specs/cli/lint/lint.spec.md)
  - Architecture: [cli spec §5](../../specs/cli/cli.spec.md)
- **§Effective Rules:**

  | Rule             | File                                      |
  | ---------------- | ----------------------------------------- |
  | typescript-rules | ai/directives/coding/typescript-rules.xml |

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None
- **Target Files:**
  - `cli/cmd/lint/index.ts` (Create)
  - `cli/cmd/lint/lint.cmd.ts` (Create)
  - `cli/gennady.ts` (Modify — добавить `case 'lint'`)
  - `cli/AGENTS.md` (Modify — добавить строку `lint` в таблицу)

## 2. Acceptance Criteria (BDD)

**Feature:** CLI-команда `gennady lint`

**Scenario:** happy path — нет ошибок [`integration`]

- **Given** файл с валидным header + контрактами + anchors
- **When** `gennady lint <file>`
- **Then** exit 0, stdout пуст

**Scenario:** есть ошибки — ESLint-формат [`integration`]

- **Given** файл без `// @file:`
- **When** `gennady lint <file>`
- **Then** exit 1, stdout: `<file>:1:1: error: ERR_CLI_LINT_MISSING_FILE ...`

**Scenario:** --autofix [`integration`]

- **Given** файл с autofix-абельными dbc-ошибками
- **When** `gennady lint --autofix <file>`
- **Then** dbc-ошибки исправлены, anchor/header ошибки только диагностированы

**Scenario:** --staged [`integration`]

- **Given** изменённые .ts файлы в git staging
- **When** `gennady lint --staged`
- **Then** проверены все изменённые .ts файлы

**Scenario:** несколько файлов [`integration`]

- **Given** 3 файла с ошибками
- **When** `gennady lint file1.ts file2.ts file3.ts`
- **Then** ошибки по всем файлам в одном выводе

**Scenario:** нет файлов [`integration`]

- **Given** вызов без аргументов и без --staged
- **When** `gennady lint`
- **Then** exit 0 (или usage-message)

## 3. Phases

### Phase P1 — index + cmd

- **Kind:** code
- **Rules:** typescript-rules
- **Target Files:** `cli/cmd/lint/index.ts`, `cli/cmd/lint/lint.cmd.ts` (Create), `cli/gennady.ts`, `cli/AGENTS.md` (Modify)
- **Status:** [x]
- **Acceptance:**
  - `index.ts`: `import './lint.cmd.ts'`
  - `lint.cmd.ts`: `LintCommand.run()` с `parseArgs`
  - Аргументы: позиционные = файлы, `--autofix`, `--staged`
  - `--staged`: `git diff --staged --name-only` + `git ls-files --others --exclude-standard` → фильтр `.ts`
  - Чтение файла один раз, контент → 3 проверки
  - ESLint-формат вывода через `LintReport.format()`
  - Exit code: 0 если `errors` пуст, 1 иначе
  - `gennady.ts`: `case 'lint': await import('./cmd/lint/index.ts'); break`
  - `cli/AGENTS.md`: добавить `lint` в таблицу

## 4. Execution Log

### Round 1 — 2026-05-15, initial

#### P1
- [x] `2026-05-15T18:50:00` recon git=main/clean targets=index.ts|absent,lint.cmd.ts|absent,gennady.ts|exists,AGENTS.md|exists divergence=none
- [x] `2026-05-15T18:50:00` rules typescript-rules
- [x] `2026-05-15T18:51:00` file cli/cmd/lint/index.ts
- [x] `2026-05-15T18:51:00` file cli/cmd/lint/lint.cmd.ts
- [x] `2026-05-15T18:51:00` file cli/gennady.ts
- [x] `2026-05-15T18:51:00` file cli/AGENTS.md
- [x] `2026-05-15T18:52:00` ver npx tsc --noEmit → pass exit=0
      intro LintCommand.run ← LintCommand service in lint.spec.md §2
      insight parseArgs-double-slice → LintCommand: parseArgs() internally slices(2), so pre-sliced argv drops positionals. Fix: filter by .ts extension, not slice.
      insight filePath-resolve → LintCommand: resolve() gave absolute path in dbc errors vs relative in header/anchor. Fix: pass original filePath to all checks, absPath only for readFileSync.
- [x] `2026-05-15T18:52:00` DONE
**Handoff →** artifacts: [cli/cmd/lint/index.ts, cli/cmd/lint/lint.cmd.ts, cli/gennady.ts, cli/AGENTS.md]; decisions: [cmd-registered=lint, module-system=esm, output-format=eslint]; open: []
