# Task: TSK-95 — stack library: types, config, registry, runner, node+golang plugins

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-95
- **Status:** [ ] TODO (spec under review — PR #5)
- **Purpose:** Библиотечный слой плагинной системы стеков: общий интерфейс `StackPlugin`, реестр, конфиг `.gennadyrc#stack`, стек-агностичный раннер гейтов, встроенные плагины `node` и `golang`.
- **Scope:** `stack`
- **Module:** `services/stack`
- **Dependencies:** None
- **Spec References:** FR-STACK-01, FR-STACK-02, FR-STACK-04, FR-STACK-05, FR-STACK-06, FR-STACK-07, FR-STACK-08, FR-STACK-09, D-STACK-001..006
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status   |
| --- | ---- | ---- | -------- |
| P1  | impl | —    | [ ] TODO |
| P2  | test | P1   | [ ] TODO |

### P1 — impl

- **Objective:** Типы closed-world (`stack.types.ts`), `loadStackConfig`/`applyStackConfig` по specs/stack/config/config.spec.md (`gennady.yaml` + `.gennadyrc`, `skipGates`/`overrideGates`/`extraGates`, `env`, per-gate `timeout`), `detectStacks` + `BUILTIN_STACK_PLUGINS`, `runVerify`/`formatVerifyReport` (RUN-ALL, SUPPRESS-ON-SUCCESS, `outputMeansFailure`, декларативные `envFail`-правила, обязательный per-gate timeout, `env`-merge, усечение вывода), `nodePlugin` (порт эвристики classify-scripts), `golangPlugin` (detect/scope/plan: vendor-режим, `-c` для конфига без точки, скоуп от базовой ветки, диагностика version skew и nested modules).
- **Target Files:**
  - `services/stack/stack.types.ts` (NEW)
  - `services/stack/stack-config.ts` (NEW)
  - `services/stack/stack-registry.ts` (NEW)
  - `services/stack/gate-runner.ts` (NEW)
  - `services/stack/plugins/node/node-plugin.ts` (NEW)
  - `services/stack/plugins/node/classify-npm-scripts.ts` (NEW)
  - `services/stack/plugins/golang/golang-plugin.ts` (NEW)
  - `services/stack/plugins/golang/golang-detect.logic.ts` (NEW)
  - `services/stack/plugins/golang/golang-scope.logic.ts` (NEW)
  - `services/stack/plugins/golang/golang-plan.logic.ts` (NEW)
  - `shared/backend/rc/rc-config.ts` (MOD — опциональная секция `stack`, объект без `models` валиден)

### P2 — test

- **Objective:** Unit-тесты: контракт раннера (RUN-ALL, stdout-контракт, env-fail, skip, усечение), применение конфига (overrides → skip → extraGates, битый JSON, неизвестный id в `use`), golang detect/scope/plan (fixtures во временных директориях), node-классификатор.
- **Target Files:**
  - `services/stack/__tests__/gate-runner.test.ts` (NEW)
  - `services/stack/__tests__/stack-config.test.ts` (NEW)
  - `services/stack/plugins/golang/__tests__/golang-detect.test.ts` (NEW)
  - `services/stack/plugins/golang/__tests__/golang-scope.test.ts` (NEW)
  - `services/stack/plugins/golang/__tests__/golang-plan.test.ts` (NEW)
  - `services/stack/plugins/node/__tests__/node-plugin.test.ts` (NEW)
  <!--/SECTION:PHASES_OVERVIEW-->

## 5. Verification

| Command                                                                                                    | Required by      |
| ---------------------------------------------------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                                                                       | typescript-rules |
| `npx tsx cli/gennady.ts lint services/stack/ shared/backend/rc/`                                           | dbc-contracts    |
| `node --import tsx --test services/stack/__tests__/*.test.ts services/stack/plugins/*/__tests__/*.test.ts` | node-test        |

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

| Round | Date       | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1    | 2026-08-17 | PARKED | Prototype implemented against the pre-review spec and verified live on mailapi (vendored, bare golangci.yml, go-version-skew diagnostic), cloudapi (nested modules, gofmt drift) and gennady itself (node stack); 73 unit tests green. Parked on branch `impl/stack-plugin-system` pending spec review. On approval: rebase + renames (`skip`→`skipGates`, `gates`→`overrideGates`), add `env`, mandatory per-gate `timeout`, `gennady.yaml` loader. |

<!--/SECTION:EXECUTION_LOG-->
