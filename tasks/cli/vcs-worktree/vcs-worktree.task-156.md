# Task: TSK-156 — vcs-worktree: детерминированный симлинкинг зависимостей (FR-WT-07)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-156
- **Status:** [x] DONE
- **Purpose:** После создания/переиспользования worktree (`prepareMrWorktree`) детерминированно симлинковать known-dependency-директории из клона-источника (node_modules, monorepo-workspaces, vendor, .venv) по best-effort принципу — worktree становится пригодным для запуска тестов, а не только для чтения диффа. Секреты (`.env*`) намеренно исключены (D-019 доп. решение) — worktree чекаутит код потенциально недоверенного MR-автора
- **Scope:** `cli`
- **Module:** `vcs-worktree`
- **Dependencies:** None
- **Spec References:**
  - Scope spec: [cli.spec.md §4.1.12 FR-WT-07, D-019](../../../specs/cli/cli.spec.md#4112-vcs-worktree-functional-requirements)
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

- **Objective:** Новый модуль `worktree-links.logic.ts` с зашитым в код списком кандидатов на симлинк (Node/JS: `node_modules`, `packages/*/node_modules`/`apps/*/node_modules` при наличии `pnpm-workspace.yaml` или `"workspaces"` в `package.json`; Go: `vendor/`; Python: `.venv`, `venv`, `__pypackages__` — **без** `.env*`, секреты исключены сознательно, см. Meta Purpose / D-019) и функцией `linkWorktreeDependencies(clonePath, worktreePath, fsDeps: WorktreeLinkFsDeps)`: per-candidate `fsDeps.existsSync` в клоне → `fsDeps.symlinkSync` в worktree; кандидат отсутствует → тихий пропуск; ошибка одного `symlinkSync` (try/catch на кандидат) не прерывает обработку остальных и не бросает исключение наружу.
  **DI вместо глобального мока:** `WorktreeLinkFsDeps` — интерфейс `{ existsSync, readdirSync, readFileSync, symlinkSync }`. `worktree-links.logic.ts` НЕ импортирует `node:fs` во время выполнения — только `import type` при необходимости типов (type-only импорты стираются на этапе компиляции, не участвуют в разрешении модуля в рантайме). Функция принимает эти методы параметром, без top-level `import { existsSync, ... } from 'node:fs'`.
  Подключить в `prepareMrWorktree` (`worktree-ops.logic.ts`): добавить необязательный 4-й параметр `linkFsDeps?: WorktreeLinkFsDeps`; если передан — вызвать `linkWorktreeDependencies(clonePath, worktreePath, linkFsDeps)` в конце обеих веток (reuse-success и full-recreate), после `utimes`; если не передан — шаг пропускается (обратная совместимость с существующими вызывающими). `worktree-ops.logic.ts` НЕ добавляет новых импортов из `node:fs` под это — только форвардит переданный объект. Не трогать `core.hooksPath=/dev/null` (FR-WT-02 инвариант).
  Реальные fs-функции подключить ТОЛЬКО в composition root — `vcs-worktree.cmd.ts` (единственное место, специфицированное FR-WT-07): импортировать `existsSync, readdirSync, readFileSync, symlinkSync` из `node:fs` там и передать как `linkFsDeps` в вызов `prepareMrWorktree`. Остальные вызывающие (`cli/cmd/inbox-context/inbox-context.cmd.ts`, `services/agent-inbox/modules/inbox-roles/context-builder.ts`, `services/mr-stats/mr-resolver.ts`) НЕ трогать — они продолжают вызывать `prepareMrWorktree` без 4-го параметра, поведение не меняется (FR-WT-07 — только для `vcs-worktree`, вне их спеки).
  Почему DI, а не расширение мока `node:fs` в существующем `worktree-ops.test.ts`: `mock.module('node:fs', ...)` в node:test подменяет модуль для всего процесса — расширять его named exports пришлось бы вручную при каждом новом импорте из `node:fs` где угодно в дереве. DI устраняет саму проблему: `worktree-ops.test.ts` не должен знать о зависимостях реализации симлинкинга и остаётся нетронутым.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `cli/cmd/vcs-worktree/_core/logic/worktree-links.logic.ts`
  - `cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts`
  - `cli/cmd/vcs-worktree/vcs-worktree.cmd.ts`
- **Inputs:** none
- **Exit:** typecheck pass; `linkWorktreeDependencies` — чистая функция без top-level `node:fs` импорта, вызывается в обеих ветках `prepareMrWorktree` при переданном `linkFsDeps`; `vcs-worktree.cmd.ts` передаёт реальные fs-функции; существующий `worktree-ops.test.ts` проходит без изменений (не входит в Target Files этой фазы)
  <!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Юнит-тесты `linkWorktreeDependencies` на реальной временной ФС (tmpdir clone/worktree пары): кандидат существует → симлинк создан и указывает на клон; кандидат отсутствует → симлинк не создан, ошибки нет; monorepo workspace (`packages/*/node_modules`) → симлинкуется per-package; ошибка создания одного симлинка (напр. занятое имя — файл вместо директории на месте назначения) не прерывает обработку остальных кандидатов и не бросает исключение.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `cli/cmd/vcs-worktree/_core/logic/worktree-links.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии section 4 покрыты; tests pass
  <!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: see Spec References (FR-WT-07).

**Feature:** Детерминированный best-effort симлинкинг зависимостей worktree

**Scenario:** Кандидат существует в клоне [`unit`]

- **Given** клон-источник содержит `node_modules`
- **When** вызван `linkWorktreeDependencies(clonePath, worktreePath, fsDeps)` с реальными fs-функциями
- **Then** в worktree появляется симлинк `node_modules`, указывающий на `node_modules` клона
- **And** содержимое клона доступно из worktree по этому пути

**Scenario:** Кандидат отсутствует в клоне [`unit`]

- **Given** клон-источник не содержит `vendor/`
- **When** вызван `linkWorktreeDependencies(clonePath, worktreePath, fsDeps)`
- **Then** симлинк `vendor` в worktree не создаётся
- **And** функция завершается без ошибки

**Scenario:** Секреты не входят в список кандидатов [`unit`]

- **Given** клон-источник содержит `.env` с реальными значениями
- **When** вызван `linkWorktreeDependencies(clonePath, worktreePath, fsDeps)`
- **Then** симлинк `.env` в worktree НЕ создаётся ни при каких условиях (не входит в список кандидатов)

**Scenario:** Monorepo workspace симлинкуется per-package [`unit`]

- **Given** клон-источник — pnpm-workspace с `packages/a/node_modules` и `packages/b/node_modules`
- **When** вызван `linkWorktreeDependencies(clonePath, worktreePath, fsDeps)`
- **Then** в worktree создаются симлинки `packages/a/node_modules` и `packages/b/node_modules`, каждый указывает на соответствующую директорию клона

**Scenario:** Ошибка одного симлинка не прерывает остальные [`unit`]

- **Given** клон-источник содержит и `node_modules`, и `vendor/`
- **And** `fsDeps.symlinkSync` для `node_modules` брошен как ошибка (несовместимый путь назначения)
- **When** вызван `linkWorktreeDependencies(clonePath, worktreePath, fsDeps)`
- **Then** симлинк `vendor` всё равно создаётся успешно
- **And** функция не бросает исключение

**Scenario:** `prepareMrWorktree` без `linkFsDeps` пропускает шаг симлинкинга [`unit`]

- **Given** вызывающий код (напр. `mr-resolver.ts`) вызывает `prepareMrWorktree(clonePath, iid, worktreePath)` без 4-го аргумента
- **When** worktree подготовлен (reuse или full recreate)
- **Then** `linkWorktreeDependencies` не вызывается, поведение идентично коду до этой задачи
  <!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                            | Required by      |
| ----------------------------------------------------------------------------------- | ----------------- |
| `tsc --noEmit`                                                                       | typescript-rules  |
| `node --import tsx --test cli/cmd/vcs-worktree/_core/logic/worktree-links.test.ts`   | node-test         |

- **Task-specific Completion additions:** None beyond project baseline
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «Кандидат существует в клоне» → `cli/cmd/vcs-worktree/_core/logic/worktree-links.test.ts` :: `symlinks existing candidate`
- Scenario «Кандидат отсутствует в клоне» → `cli/cmd/vcs-worktree/_core/logic/worktree-links.test.ts` :: `skips missing candidate silently`
- Scenario «Секреты не входят в список кандидатов» → `cli/cmd/vcs-worktree/_core/logic/worktree-links.test.ts` :: `never links .env even when present`
- Scenario «Monorepo workspace симлинкуется per-package» → `cli/cmd/vcs-worktree/_core/logic/worktree-links.test.ts` :: `symlinks workspace packages`
- Scenario «Ошибка одного симлинка не прерывает остальные» → `cli/cmd/vcs-worktree/_core/logic/worktree-links.test.ts` :: `does not throw when one candidate fails`
- Scenario «`prepareMrWorktree` без `linkFsDeps` пропускает шаг симлинкинга» → Deferred Test Ownership: TSK-156 (уже покрыто существующим `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts`, который вызывает `prepareMrWorktree` без 4-го аргумента и не входит в Target Files этой задачи — доказательство: набор проходит без изменений после P1)
  <!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Per-phase blocks within a Round. Skeleton is minimal — event lines (`intro` / `decision` / `tried` / `discovery` / `insight` / `BLOCKED`) appear ONLY when the event happens. Token vocabulary in [tasks/README.md#execution-log-template](../../README.md#execution-log-template).)_

### Round 1 — 2026-07-29, initial

#### P1

- [x] `2026-07-29T17:23:42Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-29T17:23:42Z` ver `npx tsx cli/gennady.ts lint cli/cmd/vcs-worktree/_core/logic/worktree-links.logic.ts cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts` → pass exit=0
- 🛑 `2026-07-29T17:23:42Z` BLOCKED: `npm run test` fails — `worktree-ops.test.ts` calls `mock.module('node:fs', { namedExports: { rmSync } })`, which fully replaces `node:fs` for the process; the new import chain (`worktree-ops.logic.ts` → `worktree-links.logic.ts` → `existsSync/readdirSync/readFileSync/symlinkSync` from `node:fs`) resolves against that mock and throws `SyntaxError: The requested module 'node:fs' does not provide an export named 'existsSync'`. Fix requires adding those names to the mock's `namedExports` in `worktree-ops.test.ts`, which is outside this phase's Target Files.
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: расширить `mock.module('node:fs', ...)` в `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` (строки ~75-79), добавив `existsSync, readdirSync, readFileSync, symlinkSync` в `namedExports` (делегируя к реальным одноимённым импортам из `node:fs`) — либо добавить этот файл в Target Files фазы P1/фикс-фазы, либо оператор одобряет точечное расширение мока.
- ✅ `2026-07-29T00:00:00Z` RESOLVED: оператор отклонил расширение мока — вместо этого архитектурный фикс через DI (per `AX_BLOCKER_RESOLUTION_TRAIL`). `linkWorktreeDependencies` больше не импортирует `node:fs` статически; принимает `fsDeps: WorktreeLinkFsDeps` параметром. `prepareMrWorktree` получает необязательный 4-й параметр `linkFsDeps?`, форвардит без собственного импорта из `node:fs`. Реальные fs-функции подключаются только в composition root `vcs-worktree.cmd.ts`. `worktree-ops.test.ts` не трогается — не участвует в Target Files. Заодно из списка кандидатов исключены `.env`/`.env.local`/`.env.development` (риск утечки секретов через код недоверенного MR) — см. Meta Purpose и `specs/cli/cli.spec.md` D-019. Ticket P1 Objective/Target Files/BDD переписаны под новую архитектуру. Фаза перезапускается.

#### P1 — re-run: fix: DI redesign (без .env* кандидатов) per RESOLVED выше

- [x] `2026-07-29T17:34:53Z` intro `WorktreeLinkFsDeps` ← DI-интерфейс для fs-зависимостей `linkWorktreeDependencies`, чтобы модуль не импортировал `node:fs` статически (устраняет конфликт с глобальным `mock.module('node:fs', ...)` в `worktree-ops.test.ts`)
- [x] `2026-07-29T17:34:53Z` decision candidates=`node_modules,vendor,.venv,venv,__pypackages__` (без `.env*`) ← оператор исключил `.env`/`.env.local`/`.env.development` из кандидатов на симлинк — секреты не должны быть достижимы из кода недоверенного MR-автора (D-019)
- [x] `2026-07-29T17:34:53Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-29T17:34:53Z` ver `<sdd-path> verify` typecheck → pass
- [x] `2026-07-29T17:34:53Z` ver `<sdd-path> verify` gennady lint → pass
- [x] `2026-07-29T17:34:53Z` ver `<sdd-path> verify` npm run test (full project) → pass — подтверждает, что `worktree-ops.test.ts` проходит БЕЗ изменений под новым DI-дизайном
- [x] `2026-07-29T17:34:53Z` discovery `<sdd-path> verify` format:check fails project-wide (`prettier --check .`), но исключительно на файлах вне остатка этой фазы: pre-existing dirty `specs/**` (запрещено трогать per `AX_SPEC_NEVER_EDITED`) и на таблице секции 5 текущего тикета (вне `AX_TICKET_WRITE_SCOPE` — не Execution Log/Test Coverage/Phases Overview Status); все 3 Target Files этой фазы индивидуально проходят `prettier --check` чисто
- [x] `2026-07-29T17:34:53Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-worktree/_core/logic/worktree-links.logic.ts, cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts, cli/cmd/vcs-worktree/vcs-worktree.cmd.ts]; decisions: [WorktreeLinkFsDeps=DI-interface, node:fs-import=composition-root-only, candidates=node_modules+vendor+.venv+venv+__pypackages__+workspace-packages, env-candidates=excluded]; open: []

#### P2

- [x] `2026-07-29T17:41:11Z` discovery `linkCandidate` не создаёт родительские директории под symlinkSync-целью — падает с ENOENT если `packages/a/` в worktree отсутствует. В реальности не проблема: worktree — это git checkout, `packages/a/` уже существует (только `node_modules` отсутствует). Фикстура теста воссоздаёт этот инвариант явно (mkdir `packages/<pkg>` в worktree перед вызовом), не меняя логику P1
- [x] `2026-07-29T17:41:11Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-29T17:41:11Z` ver `node --import tsx --test cli/cmd/vcs-worktree/_core/logic/worktree-links.test.ts` → pass exit=0
- [x] `2026-07-29T17:41:11Z` ver `<sdd-path> verify` typecheck → pass
- [x] `2026-07-29T17:41:11Z` ver `<sdd-path> verify` gennady lint → pass
- [x] `2026-07-29T17:41:11Z` ver `<sdd-path> verify` npm run test (full project) → pass
- [x] `2026-07-29T17:41:11Z` discovery `<sdd-path> verify` format:check fails project-wide (`prettier --check .`), но только на pre-existing dirty `specs/**` (запрещено трогать per `AX_SPEC_NEVER_EDITED`) и таблице секции 5 тикета (вне `AX_TICKET_WRITE_SCOPE`) — тот же паттерн, что P1 уже задокументировал; `worktree-links.test.ts` individually проходит `prettier --check` чисто
- [x] `2026-07-29T17:41:11Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-worktree/_core/logic/worktree-links.test.ts]; decisions: [test-fs=real-tmpdir+real-node:fs-fsDeps, symlink-failure-scenario=pre-occupied-destination-file, workspace-fixture=worktree-package-dirs-precreated]; open: []


#### Round close

- [x] `2026-07-29T17:42:00Z` sync cli+root
- [x] `2026-07-29T17:42:00Z` DONE
      <!--/SECTION:EXECUTION_LOG-->
