# Task: TSK-95 — stack library: types, config, registry, runner, node+golang plugins

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-95
- **Status:** [x] DONE
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
| P1  | impl | —    | [x] DONE |
| P2  | test | P1   | [x] DONE |

### P1 — impl

- **Objective:** Типы closed-world (`stack.types.ts`), `loadStackConfig`/`applyStackConfig` по specs/stack/config/config.spec.md (`gennady.yaml` + `.gennadyrc`, `skipGates`/`overrideGates`/`extraGates`, `env`, per-gate `timeout`, deep-merge, строгая валидация), `detectStacks` + `BUILTIN_STACK_PLUGINS`, `runVerify`/`formatVerifyReport` (RUN-ALL, SUPPRESS-ON-SUCCESS, `outputMeansFailure`, декларативные `envFail`-правила, обязательный per-gate timeout, `env`-merge, усечение вывода), `nodePlugin` (порт эвристики classify-scripts), `golangPlugin` (detect/scope/plan: vendor-режим, `-c` для конфига без точки, скоуп от базовой ветки, диагностика version skew и nested modules).
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

| Round | Date       | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1    | 2026-08-17 | PARKED | Prototype against the pre-review spec; verified live on two internal Go repos and gennady itself; parked on `impl/stack-plugin-system` for spec review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R2    | 2026-08-18 | PASS   | Rebased onto the approved spec: `skipGates`/`overrideGates` renames; `env`; mandatory per-gate `timeout` rendered into `go test -timeout`; envFail as predicate combinators (exitAbove/outputMatches/spawnFailed); root-marker detection (broken package.json stays detected with NODE_INVALID_MANIFEST); deep-merge of `.gennadyrc` → `gennady.yaml` → `~/.gennadyrc` with per-key provenance; strict fatal validation with did-you-mean; `fixers` key reserved; tidy built-in removed (extraGates recipe); plugin-specific keys removed; `yaml@2.9.0` exact-pinned dev dep. Verification: `npm run type-check` pass; `gennady lint services/stack/ cli/cmd/verify/ shared/backend/rc/` clean; 88 unit tests pass; full suite 1248 with the same 3 pre-existing failures; live runs on gennady (dogfood gennady.yaml), the vendored monorepo (4/4 scoped) and the multi-module service (fmt drift caught). |

| R3 | 2026-08-18 | PASS | Code-review round: git-relative changed scope (`--relative`) fixing empty scope under subdir `--root`; origin/HEAD preferred over stale origin/master; test-gate panic reclassified as FAIL; npm mutating scripts (--fix/--autofix/--write) planned as visible skips; foreign `models` rc section no longer fatal; non-array extraGates → config error, not crash; bare-`watch` body pattern restored; head+tail output truncation; ZERO_GATES verdict; skipped extraGates keep declared shape; dead provenance grammar removed; damerau-levenshtein moved to shared and reused; exec wrapper promoted to shared/common/exec. 13 new red→green tests; suite 1260 (same 3 pre-existing failures). |

| R4 | 2026-08-18 | PASS | Non-thread review round: rebase onto current main (agent-run data:-URL fix picked up; suite fully green 1262/0); --only lifts config skipGates (expensive-gate workflow); envFailed aggregate in --json. Codegen round per operator decision: `golang:generate` drift gate before build (tree replica: worktree + uncommitted + untracked, baseline commit → content-exact drift incl. agent-edited files; symlinked-tmp cwd mapping fixed via realpath), `gennady fix` command + golang `generate` fixer (StackFixCapability). 12 new tests incl. real-go e2e (pass/stale/missing-file, real tree untouched). |

| R5 | 2026-08-18 | PASS | Field-report round (D-STACK-012): generator binaries living in gitignored dirs are not replicated into the sandbox by design (fresh-clone semantics; PATH is inherited, so `go install`/go.mod `tool` binaries work); «executable file not found» on the generate gate reclassified FAIL → ENV_FAIL. EnvFailPredicate grew an optional `hint` the runner appends to the matched gate's output; `outputMatches(re, hint?)`. 3 new red→green tests incl. real-go e2e (missing generator → env-fail + install hint). |

| R6 | 2026-08-18 | PASS | Enforcement round (D-STACK-013): ALL gates now execute in one run replica per git toplevel (lazy, ~4s create + ~0.2s status per gate on a 566MB monorepo — measured); a non-sandbox gate that dirties the replica gets the new `violation` status and the replica resets to baseline; replica paths in output rewritten to real ones; real-tree absolute argv paths (golangci `-c`) mapped into the replica; plugin `sandboxLinks` symlink execution environment (node: node_modules — dir-only ignore patterns skip symlinks, so drift excludes links via pathspec); `driftMeansFailure` joined GateSpec (rejected in fixers) enabling the «fast scoped default + canonical run on demand» pattern; no-git/no-HEAD → unsandboxed run + `UNSANDBOXED_RUN` diagnostic. 8 new red→green tests. Dogfood: gennady's own npm gates green through the replica (format drift in freshly edited files caught live); scoped run on the internal monorepo 16s, clean relative lint paths, tree byte-identical, no leftover worktrees. |

| R7 | 2026-08-19 | PASS | E2E framework built (specs/stack/e2e + infra-e2e doctrine): setupStackSuite (build:publish → pack → install, HOME override, offline retry for proxy-403 environments), materializeFixture (template → temp git repo, baseline commit then `dirty`), runFixture/assertFixture on `--json`, closed `expect.yaml` schema, per-stack suites and `scripts/stack-e2e.ts` with STRICT. First run paid for itself twice: `go-clean-full` exposed that `go build` writes a binary for a lone main package → VIOLATION on a clean repo (fixed with `-o /dev/null`; invisible on library packages, which is why live monorepo runs never showed it), and `go-make-lint-exit2` reproduced the ENV_FAIL inheritance bug end-to-end (fixed: `EnvFailPredicate.kind`, and an `argv` override no longer inherits exit-code predicates). 3/3 fixtures green, 1289/1290 unit, tsc and lint clean. |

| R8 | 2026-08-19 | PASS | Gate parity contract (§4.6, FR-STACK-15/16) + mechanical parity test: runtime union of both plugins' planned gate keys vs GATE_SPEC_KEYS, minus a closed "wrapping" list (stack/label/skipped) and a documented alias (timeoutMs ↔ timeout). It went red immediately for `envFail`, driving this iteration: `services/stack/env-fail.ts` (exitCodeMatches with == != >= <= > < , scalar or AND-list; stdout/stderr/output matchers; allOf; compileEnvFailRules), predicate input widened to a GateOutcome context, required `describe` rendered in `--plan --json` (fixes envFail serializing as [null,null]), config rules PREPEND so a repo hint beats a hint-less plugin predicate, hint mandatory, catch-all rules fatal, null exit code never matches. 12 unit + 4 E2E fixtures (rules, stream split, catch-all → exit 4, hint precedence). 1303/1304 unit, 7/7 e2e, tsc and lint clean. |

| R9 | 2026-08-19 | PASS | `CmdSpec` unification + `requires` preconditions (§4.5.1, §4.7): one command shape for gate/requires/fixer, so no separate RequiresSpec exists. Preconditions run before the gate command in the same replica context; the first failure is ENV_FAIL carrying its own `hint` and the gate command never runs — «docker not up» is caught in milliseconds instead of a 10-minute timeout with no cause. `hint` mandatory on preconditions (a hint-less one says no more than the timeout it replaces); CMD_SPEC_KEYS validated closed-world; `requires` plumbed through override and extraGates paths and covered by the parity test. 3 unit + 3 E2E fixtures (missing → env-fail with a 60s sleep behind a 30s timeout, ok → normal path with replica-mapped cwd, missing hint → exit 4). 1306/1307 unit, 10/10 e2e. |

| R10 | 2026-08-19 | PASS | `fixer` became a gate field (§4.4): the `fixers` config section, the `fix` plugin facet and `StackFixCapability`/`planFixers` are all gone — `gennady fix` builds the same plan as `verify` and runs the `fixer` of gates that declare one, so a gate and its remedy cannot drift apart by id. A fixer inherits its gate's envFail predicates (the same command, so a missing generator is env-fail either way — closes the panel finding about fixers lacking predicates). A stale `fixers:` section is now an unknown-key error, not silence. `hint` is rejected on a fixer (requires-only). Also resolves the reviewer's finding that `FixerSpec` was referenced but never documented: it no longer exists. Tests migrated to the gate-attached form; 2 new E2E fix-loop fixtures (config-declared fixer, and the plugin generate fixer) run verify→fix→verify. 1306/1307 unit, 12/12 e2e, self-verify green. |

<!--/SECTION:EXECUTION_LOG-->
