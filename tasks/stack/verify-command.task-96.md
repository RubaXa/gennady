# Task: TSK-96 — `gennady verify`: stack-agnostic CLI command

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-96
- **Status:** [x] DONE
- **Purpose:** Стек-агностичная CLI-команда `gennady verify` поверх библиотеки stack (TSK-95): детекция → скоуп → план → RUN-ALL прогон → отчёт; `--plan`/`--json`; делегация из `verify.sh`; регистрация и документация.
- **Scope:** `stack`
- **Module:** `cli/verify`
- **Dependencies:** TSK-95
- **Spec References:** FR-STACK-03, FR-STACK-10, Golden DX (§3)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e` (manual against mailapi/cloudapi/gennady)
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status   |
| --- | ---- | ---- | -------- |
| P1  | impl | —    | [x] DONE |
| P2  | test | P1   | [x] DONE |
| P3  | docs | P1   | [x] DONE |

### P1 — impl

- **Objective:** Команда `verify`: parseArgs (`--plan`, `--json`, `--only`, `--skip`, `--stack`, `--root`, `--all`/`--changed`/цели (без `--timeout` и `--tidy`; квалифицированные `stack:gate` в `--only`/`--skip` — FR-STACK-11)), exit-коды 0/1/4/5, `NO_STACK_DETECTED` с actionable-подсказкой. Регистрация в `gennady.ts` + help.
- **Target Files:**
  - `cli/cmd/verify/verify.cmd.ts` (NEW)
  - `cli/cmd/verify/index.ts` (NEW)
  - `cli/cmd/verify/help.ts` (NEW)
  - `cli/gennady.ts` (MOD)
  - `cli/cmd/help/help.cmd.ts` (MOD)

### P2 — test

- **Objective:** Unit-тесты команды: `--plan` не исполняет гейты, exit-коды, `--only` с неизвестным гейтом → 4, JSON-схема вывода.
- **Target Files:**
  - `cli/cmd/verify/__tests__/verify.cmd.test.ts` (NEW)

### P3 — docs

- **Objective:** `verify.sh` делегирует в `gennady verify` (легаси npm-путь — фоллбек); фикс мутирующего `go fmt ./...` в resolve-verify-commands; README (корневой + cli/cmd) ; skill `sdd-infra-golang` + роутинг в `sdd-infra`; директива `golang-setup.xml` ссылается на `gennady verify`.
- **Target Files:**
  - `ai/skills/sdd-execute/scripts/verify.sh` (MOD)
  - `ai/skills/sdd-execute/scripts/README.md` (MOD)
  - `cli/cmd/_shared/prompt/logic/verify-commands/resolve-verify-commands.logic.ts` (MOD)
  - `ai/skills/sdd-infra-golang/SKILL.md` (NEW)
  - `ai/skills/sdd-infra/SKILL.md` (MOD)
  - `ai/directives/infra/golang-setup.xml` (NEW)
  - `ai/directives/infra/README.md` (MOD)
  - `README.md`, `cli/cmd/README.md` (MOD)
  <!--/SECTION:PHASES_OVERVIEW-->

## 5. Verification

| Command                                                       | Required by      |
| ------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                          | typescript-rules |
| `npx tsx cli/gennady.ts lint cli/cmd/verify/`                 | dbc-contracts    |
| `node --import tsx --test cli/cmd/verify/__tests__/*.test.ts` | node-test        |
| `bash -n ai/skills/sdd-execute/scripts/verify.sh`             | shell-sanity     |

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

| Round | Date       | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1    | 2026-08-17 | PARKED | Prototype parked on `impl/stack-plugin-system` pending spec review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R2    | 2026-08-18 | PASS   | Command rebuilt per approved spec: fatal CONFIG_ERROR (exit 4, full error list, no gate runs); qualified `stack:gate` selectors in `--only`/`--skip` (bare id = all stacks); `--stack` as one-shot use; global `--timeout` and `--tidy` removed; `--plan` shows config sources, per-gate timeouts and per-key provenance annotations. verify.sh delegation unchanged (capability probe). Docs/skills/directive updated to gennady.yaml naming. Verification: 10 command unit tests pass; e2e suite 0 failures; `bash -n verify.sh` OK; live E2E on gennady/mailapi/cloudapi recorded in TSK-95 R2. |

<!--/SECTION:EXECUTION_LOG-->
