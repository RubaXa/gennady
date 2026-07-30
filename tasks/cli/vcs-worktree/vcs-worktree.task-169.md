# Task: TSK-169 — vcs-worktree: git submodule update --init --recursive (FR-WT-08)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-169
- **Status:** [ ] TODO
- **Purpose:** После подготовки worktree (`prepareMrWorktree`) реально инициализировать git submodules внутри самого worktree (`git submodule update --init --recursive`), best-effort и opt-in — НЕ симлинк на submodule-директорию клона (submodule жёстко привязан к конкретному SHA родителя; MR мог сменить эту версию, и симлинк на клон показал бы неверный коммит)
- **Scope:** `cli`
- **Module:** `vcs-worktree`
- **Dependencies:** TSK-168
- **Spec References:**
  - Scope spec: [cli.spec.md §4.1.12 FR-WT-08, D-020](../../../specs/cli/cli.spec.md#4112-vcs-worktree-functional-requirements)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`
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

- **Objective:** Добавить `prepareMrWorktree` (`worktree-ops.logic.ts`) необязательный 5-й параметр `initSubmodules: boolean = false`. Когда `true` — в конце обеих веток (reuse-success и full-recreate), СРАЗУ ПОСЛЕ шага `linkWorktreeDependencies` (FR-WT-07, TSK-168), выполнить `git(['-C', worktreePath, '-c', 'core.hooksPath=/dev/null', 'submodule', 'update', '--init', '--recursive'])` через уже существующий внутренний хелпер `git()` этого файла (никаких новых импортов — переиспользует `execFile` из `node:child_process`, уже используемый везде в файле). Обернуть в try/catch: сетевая ошибка или отсутствие доступа к приватному submodule — best-effort, НЕ бросает исключение и НЕ роняет `prepareMrWorktree` (worktree остаётся годным для ревью без submodules). Когда `initSubmodules` не передан или `false` — шаг полностью пропускается (нулевое изменение поведения для существующих вызывающих). Не выполнять `existsSync('.gitmodules')`-проверку заранее — `git submodule update --init --recursive` в репозитории без `.gitmodules` — безопасный no-op, дополнительная проверка не нужна и не должна вводить лишний DI-параметр.
  Подключить в composition root — `vcs-worktree.cmd.ts` — передать `true` как 5-й аргумент `prepareMrWorktree`. Остальные вызывающие (`cli/cmd/inbox-context/inbox-context.cmd.ts`, `services/agent-inbox/modules/inbox-roles/context-builder.ts`, `services/mr-stats/mr-resolver.ts`) НЕ трогать — параметр по умолчанию `false`, поведение не меняется.
  Не трогать `core.hooksPath=/dev/null` инвариант (FR-WT-02) — новая git-команда тоже идёт с этим флагом (недоверие к коду MR распространяется и на submodule-хуки).
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts`
  - `cli/cmd/vcs-worktree/vcs-worktree.cmd.ts`
- **Inputs:** none
- **Exit:** typecheck pass; `initSubmodules=true` вызывает `git submodule update --init --recursive` с `core.hooksPath=/dev/null` в обеих ветках после симлинкинга; `initSubmodules` не передан/`false` — нулевое изменение поведения; ошибка submodule-шага не бросает исключение; `vcs-worktree.cmd.ts` передаёт `true`
  <!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Расширить `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts`: добавить в `gitCmd()`-диспетчер мока распознавание `submodule update --init --recursive` (новый ключ, напр. `submodule-update`), добавить сценарии — (1) `initSubmodules=true` + успешный submodule update → команда вызвана с `core.hooksPath=/dev/null`, результат `prepareMrWorktree` не меняется; (2) `initSubmodules=true` + submodule update возвращает ошибку (мок кидает `Error`) → `prepareMrWorktree` всё равно резолвится успешно (best-effort, исключение не пробрасывается); (3) `initSubmodules` не передан (омиттед) → мок НЕ видит вызова `submodule` вообще (существующие тесты этого файла остаются зелёными без изменений — доказательство обратной совместимости). Не менять существующие тестовые случаи, где `prepareMrWorktree` вызывается без 5-го аргумента.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии section 4 покрыты; tests pass; существующие (pre-P1) тестовые случаи файла проходят без изменений в их коде
  <!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References (FR-WT-08).

**Feature:** Инициализация git submodules внутри подготовленного worktree

**Scenario:** `initSubmodules=true` инициализирует submodules [`unit`]

- **Given** worktree подготовлен (reuse или full recreate) и `initSubmodules=true` передан в `prepareMrWorktree`
- **When** подготовка worktree завершена
- **Then** выполнен `git submodule update --init --recursive` в worktree с флагом `-c core.hooksPath=/dev/null`

**Scenario:** Ошибка submodule update не роняет подготовку worktree [`unit`]

- **Given** `initSubmodules=true`, `git submodule update --init --recursive` возвращает ошибку (сеть/приватный доступ недоступен)
- **When** подготовка worktree завершена
- **Then** `prepareMrWorktree` всё равно резолвится успешно с корректным `worktreePath`/`headSha`
- **And** исключение наружу не пробрасывается

**Scenario:** `initSubmodules` не передан — нулевое изменение поведения [`unit`]

- **Given** вызывающий код (напр. `mr-resolver.ts`) вызывает `prepareMrWorktree` без 5-го аргумента
- **When** worktree подготовлен
- **Then** `git submodule update` не вызывается вообще
- **And** поведение идентично коду до этой задачи
  <!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                          | Required by      |
| -------------------------------------------------------------------------------- | ---------------- |
| `tsc --noEmit`                                                                   | typescript-rules |
| `node --import tsx --test cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` | node-test        |

- **Task-specific Completion additions:** None beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «`initSubmodules=true` инициализирует submodules» → `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` :: `runs submodule update --init --recursive when initSubmodules=true`
- Scenario «Ошибка submodule update не роняет подготовку worktree» → `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` :: `does not throw when submodule update fails`
- Scenario «`initSubmodules` не передан — нулевое изменение поведения» → `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` :: `skips submodule update when initSubmodules omitted`
  <!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-07-30, initial

#### P1

- [x] `2026-07-29T21:42:36Z` discovery `npm run format:check` (внутри `sdd verify`) падает на 7 файлах вне Target Files этой фазы (specs/agent-inbox/\*, specs/cli/cli.spec.md, tasks/cli/README.md, сам тикет task-157.md) — pre-existing drift, существовавший до старта этой фазы (см. git status); прямой `npx prettier --check` по обоим Target Files фазы — чисто
- [x] `2026-07-29T21:42:36Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-29T21:42:36Z` ver `npx tsx cli/gennady.ts lint cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts cli/cmd/vcs-worktree/vcs-worktree.cmd.ts` → pass exit=0
- [x] `2026-07-29T21:42:36Z` ver `npm run test` → pass exit=0
- [x] `2026-07-29T21:42:36Z` ver `tsc --noEmit` → pass exit=0
- [x] `2026-07-29T21:42:36Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts, cli/cmd/vcs-worktree/vcs-worktree.cmd.ts]; decisions: [initSubmodules=optional-5th-param-default-false, submodule-step=best-effort-try-catch-via-existing-git-helper, composition-root=vcs-worktree.cmd.ts-passes-true]; open: []

#### P2

- [x] `2026-07-29T21:46:31Z` discovery `sdd verify` format:check gate fails on 13 files outside this phase's Target Files (specs/agent-inbox/\*, specs/cli/cli.spec.md, tasks/cli/README.md, task-157.md) — same pre-existing drift already documented by P1; direct `npx prettier --check` on the actual Target File (`worktree-ops.test.ts`) is clean
- [x] `2026-07-29T21:46:31Z` tried `node --import tsx --test cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` (literal §5 string) → fail: `mock.module is not a function` — file's existing `mock.module('node:child_process', ...)` requires `--experimental-test-module-mocks`, which `npm run test` already supplies project-wide but the standalone §5 invocation omits; flagged by orchestrator dispatch note as a known gap in this pre-existing test file, not introduced by this phase
- [x] `2026-07-29T21:46:31Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-29T21:46:31Z` ver `npx tsx cli/gennady.ts lint cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` → pass exit=0
- [x] `2026-07-29T21:46:31Z` ver `npm run test` → pass exit=0
- [x] `2026-07-29T21:46:31Z` ver `tsc --noEmit` → pass exit=0
- [x] `2026-07-29T21:46:31Z` ver `node --import tsx --test --experimental-test-module-mocks cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` → pass exit=0 (actual invocation required to run the mock-module-based file standalone; literal §5 string fails per `tried` line above — same flag gap `npm run test` already resolves project-wide)
- [x] `2026-07-29T21:46:31Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts]; decisions: [submodule-update-mock-key=submodule-update, new-cases=3-verbatim-BDD-names, pre-existing-cases=unchanged]; open: [ticket-§5-node-test-cmd: literal string lacks --experimental-test-module-mocks needed by file's existing mock.module usage — same gap npm run test already covers]

#### Round close

- [ ] `<ts>` DONE
      <!--/SECTION:EXECUTION_LOG-->
