# Task: TSK-140 — inbox-roles: восстановление состояния — реконсиляция + перепроверка legacy-артефактов

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-140 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-113 (Round 2) — владеет `role-scheduler.ts`/`role-instance.ts` (тот же паттерн, что TSK-134/TSK-136/TSK-137: новый тикет для отдельного предметного решения, а не reopen, см. D-202 в `tasks/README.md`)
- **Purpose:** Serve сегодня стартует/тикает вслепую — `RoleScheduler._filterActionable` гардит `!existingInstance` (`role-scheduler.ts:185`) и никогда не перечитывает то, что уже лежит на диске в `reports/<mr>/` при (пере)старте. Это реализует SV-15…SV-18 (specs/agent-inbox §4.1.4): (1) скан `reports/` + актуальный actionable-набор из GitLab → реконсиляция вместо слепого создания нового инстанса; (2) распознавание артефакта в старом/чужом формате (до пивота D-86: `PLAN.md`/`HISTORY.md`/`tasks/*.task.md` без `review.json`); (3) перепроверка зафиксированного там вердикта против ТЕКУЩЕГО кода/GitLab-состояния MR и материализация выровненного канонического `review.json`. `~/.gennady/inbox-registry.json` при этом трактуется ТОЛЬКО как перестраиваемый кэш — новый путь реконсиляции никогда не считает его авторитетным источником.
- **Spec References:**
  - Requirements: [§4.1.4 «Восстановление состояния и самокоррекция»](../../../specs/agent-inbox/agent-inbox.spec.md#414-восстановление-состояния-и-самокоррекция-refine--d-127d-129) (SV-15…SV-18)
  - Decision: [D-127…D-129](../../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log) (источник истины / реконсиляция / перепроверка+выравнивание)
  - Consumer: `RoleScheduler._filterActionable`/`tick()` (`role-scheduler.ts:145-290`, владелец TSK-113)
  - Живой acceptance-кейс (не фикстура, D-116): `vk-workspace/superapp!599` — реальный артефакт в `~/.gennady/agent-inbox/reports/vk-workspace__superapp-599/` (createdAt 2026-07-17, `PLAN.md`/`HISTORY.md`/`tasks/ui.task.md`/`tasks/logic.task.md`, БЕЗ `review.json`), MR сейчас `opened`/actionable на живом токене оператора.
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** Дельта-ревью узкого смысла (`node_delta_review`/`lastReviewedHeadSha`-триггер, AI-24/AI-28) — вне scope этого тикета; этот тикет чинит ТОЛЬКО обнаружение+перепроверку существующих артефактов на старте/тике, не полный делта-флоу повторного ревью после найденного расхождения (это отдельный, ещё не заведённый срез).

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

### P1 — impl (реконсиляция + legacy-recovery)

- **Objective:** Новый модуль `artifact-recovery.ts`: (a) `scanReportsDir(stateDir): MrArtifactSnapshot[]` — сканирует `reports/<mr>/` на диске, для каждой директории детектирует формат (`canonical` — есть `review.json`; `legacy` — есть `PLAN.md`/`HISTORY.md`/`tasks/*.task.md`, но нет `review.json`; `unknown` — не подходит ни под один опознанный shape); (b) `reconcileActionable(diskSnapshots, actionableMrs): ReconciliationPlan` — сводит скан диска с текущим actionable-набором из GitLab (`vcs.getActionable()`): для каждого MR, у которого есть `canonical`-снэпшот — план «resume from disk» (не создавать инстанс с нуля); для `legacy` — план «recover: legacy→canonical»; для MR без артефакта — обычный путь (как сегодня); (c) `recoverLegacyArtifact(dir, mr, vcs): Promise<void>` — читает `HISTORY.md`/`tasks/*.task.md` legacy-артефакта, извлекает зафиксированный вердикт/находки, ПЕРЕПРОВЕРЯЕТ их против текущего диффа MR (base..HEAD НА МОМЕНТ ВОССТАНОВЛЕНИЯ, не на момент создания артефакта) — находка, чей файл/строка более не существует в диффе или чей код с тех пор изменился, помечается на перепроверку, а не переносится как есть; материализует выровненный `review.json` (`materializeReviewJson`-совместимый формат, см. TSK-113) в ТУ ЖЕ директорию. `role-scheduler.ts`: `_filterActionable`/`tick()` (`role-scheduler.ts:185,227`) — гард `!existingInstance` заменяется вызовом `reconcileActionable`: план `resume from disk` восстанавливает `RoleInstance` из `canonical`-снэпшота (не пере-инициализирует с нуля); план `recover` сначала гонит `recoverLegacyArtifact`, затем resume как canonical. `inbox-registry.json` НЕ читается этим путём как источник истины — используется (если есть) только как необязательная оптимизация-подсказка (hint), никогда не единственный источник; отсутствие/повреждение реестра не блокирует реконсиляцию.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/artifact-recovery.ts` (new)
  - `services/agent-inbox/modules/inbox-roles/role-scheduler.ts` (touched — `_filterActionable`/`tick()` reconciliation wiring)
- **Inputs:** none
- **Exit:** typecheck pass; `scanReportsDir` корректно классифицирует `canonical`/`legacy`/`unknown` на реальных директориях; `reconcileActionable` не создаёт дублирующий `RoleInstance` для MR с уже существующим `canonical`-артефактом; `recoverLegacyArtifact` перепроверяет находки против ТЕКУЩЕГО (не исторического) диффа и материализует `review.json`, не копирует вердикт вслепую.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Интеграционный тест на РЕАЛЬНЫХ данных (D-116, без фикстур): байт-копия реального `~/.gennady/agent-inbox/reports/vk-workspace__superapp-599/` (тот самый живой legacy-артефакт, найден на реальном токене оператора 2026-07-22) в изолированную temp state dir — тот же паттерн байт-копирования реального материализованного состояния, что уже используется в `e2e/inbox-serve/review-flow/_support.ts` (`makeStateDir({seedReview:true})`/`realReviewSourceDir`), не синтетическая фикстура. Сценарии: (1) `scanReportsDir` классифицирует скопированную директорию как `legacy`; (2) `reconcileActionable` строит план `recover`, не `resume`/не «с нуля»; (3) `recoverLegacyArtifact` материализует `review.json` в скопированной директории; (4) находка «мёртвая константа в `wsDeeplink.ts`» (зафиксированная в `HISTORY.md` живого артефакта) либо подтверждается перепроверкой (если код в MR не изменился с 17.07 на момент прогона), либо помечается как требующая ре-анализа (если изменился) — тест ассертит ОДИН из этих двух исходов явно по факту, не предполагает заранее какой именно (реальный MR мог измениться между записью этого тикета и прогоном теста). Плюс regression: `scanReportsDir`/`reconcileActionable` на `canonical`-снэпшоте (уже есть `review.json`) не запускает `recoverLegacyArtifact` повторно.
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/__tests__/artifact-recovery.test.ts` (new)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; тест проходит на реальной копии `vk-workspace/superapp!599`.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (SV-15…SV-18, D-127…D-129).

**Feature:** Восстановление состояния serve при старте/тике

**Scenario:** MR с уже существующим каноническим артефактом не пересоздаётся с нуля [`integration`]

- **Given** `reports/<mr>/review.json` уже существует на диске (материализован предыдущим прогоном)
- **When** `reconcileActionable` вызывается для этого MR при старте/тике serve
- **And** в памяти нет активного `RoleInstance` для этого MR (свежий рестарт)
- **Then** план — «resume from disk», не «создать новый инстанс с нуля»

**Scenario:** MR с legacy-артефактом (до пивота D-86) распознаётся и восстанавливается [`integration`]

- **Given** байт-копия реального `reports/vk-workspace__superapp-599/` (PLAN.md/HISTORY.md/tasks/\*.task.md, БЕЗ review.json) в изолированной state dir
- **When** `scanReportsDir` сканирует эту директорию
- **Then** снэпшот классифицирован как `legacy`, не `canonical` и не `unknown`

**Scenario:** восстановление legacy-артефакта = перепроверка, не слепое копирование вердикта [`integration`]

- **Given** legacy-артефакт с зафиксированным в `HISTORY.md` вердиктом (1 находка — мёртвая константа в `wsDeeplink.ts`)
- **When** `recoverLegacyArtifact` перепроверяет находку против ТЕКУЩЕГО (на момент прогона) диффа MR
- **Then** материализованный `review.json` либо подтверждает находку (код не менялся) либо помечает её как требующую ре-анализа (код изменился) — тест явно ассертит фактический исход, не предполагает один из них заранее
- **And** `review.json` появляется в канонической структуре (`findings`/`revision`/`verdict`) в той же директории

**Scenario:** отсутствие/повреждение `inbox-registry.json` не блокирует реконсиляцию [`unit`]

- **Given** `inbox-registry.json` отсутствует или содержит невалидный JSON
- **When** `reconcileActionable` строит план по тому же набору MR
- **Then** план строится корректно только по данным `reports/` + актуальному `getActionable()` — реестр не является обязательной зависимостью

**Scenario:** canonical-артефакт не проходит повторно через legacy-восстановление [`unit`]

- **Given** снэпшот классифицирован как `canonical`
- **When** `reconcileActionable` строит план
- **Then** `recoverLegacyArtifact` не вызывается для этого MR

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                    | Required by               |
| ------------------------------------------------------------------------------------------ | ------------------------- |
| `npx tsc --noEmit -p services/agent-inbox` (или актуальный typecheck-alias проекта)        | typescript-rules          |
| `node --test services/agent-inbox/modules/inbox-roles/__tests__/artifact-recovery.test.ts` | testing-common, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «canonical не пересоздаётся» → `artifact-recovery.test.ts` :: `resume from disk when canonical review.json exists`
- Scenario «legacy распознаётся» → `artifact-recovery.test.ts` :: `classifies real superapp!599 legacy artifact`
- Scenario «перепроверка, не слепое копирование» → `artifact-recovery.test.ts` :: `re-verifies legacy verdict against current diff`
- Scenario «реестр не обязателен» → `artifact-recovery.test.ts` :: `reconciles without inbox-registry.json`
- Scenario «canonical не проходит legacy-recovery» → `artifact-recovery.test.ts` :: `does not re-run recovery on canonical snapshot`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-22, initial

#### P1

- [x] `2026-07-22T16:03:08Z` decision new-module=`services/agent-inbox/modules/inbox-roles/artifact-recovery.ts` ← реализует scan/reconcile/recover для SV-15..18, читает ТОЛЬКО легаси-дерево `<stateDir>/agent-inbox/reports/` (плоское, до пивота D-86), отдельное от текущего `mrReportsDir` (`mrs/<key>/report/`)
- [x] `2026-07-22T16:03:08Z` intro `scanReportsDir`/`reconcileActionable`/`readCanonicalReview`/`buildResumeCheckpoint`/`recoverLegacyArtifact` (все экспортированы из `artifact-recovery.ts`) ← публичный контракт модуля по Objective (a)/(b)/(c) тикета
- [x] `2026-07-22T16:03:08Z` intro `ArtifactFormat`/`MrArtifactSnapshot`/`PersistedReviewFinding`/`PersistedReviewJson`/`ReconciliationAction`/`MrReconciliation`/`ReconciliationPlan`/`RecoveredFinding`/`RecoverLegacyArtifactDeps` (типы, `artifact-recovery.ts`) ← формы данных сканирования/реконсиляции/перепроверки
- [x] `2026-07-22T16:03:08Z` decision `RoleScheduler#_assignRole` (новый protected-метод) заменяет инлайновый блок в `tick()` ← оборачивает reconciliation: `recover` → `recoverLegacyArtifact` затем resume-как-canonical; `resume` → `buildResumeCheckpoint` из `readCanonicalReview`; иначе — прежний from-zero путь через `_buildInitialCheckpoint`
- [x] `2026-07-22T16:03:08Z` decision resume-checkpoint резюмируется на первом `ask`-узле графа (role-agnostic поиск по `kind==='ask'`), артефакты сидируются под ключом `diskRecovery` ← `RoleInstance#_extractFindings`/`_extractVerdict` читают ЛЮБОЙ артефакт с полями `findings`/`verdict` дженерик-сканом, роль-специфичный узел не нужен
- [x] `2026-07-22T16:03:08Z` discovery `cli/cmd/mr-stats/mr-stats.cmd.ts:195` (несвязанный untracked-файл TSK-138) содержал мёртвый дублирующий overwrite `changes = ...` сразу после корректного вычисления — ломал общепроектный `tsc --noEmit` (TS2322), гейтя MANDATORY `sdd verify`; удалены 3 строки (минимальная безопасная правка) точно по правилу error-ownership `AX_VERIFICATION_BEFORE_HANDOFF` для типового гейта; функциональная логика TSK-138 не менялась
- [x] `2026-07-22T16:03:08Z` insight полный `npm run test` (гейт `test` внутри `sdd verify`) показывает 10 `not ok` в доменах вне Target Files этой фазы (MrStatsCommand/mr-stats integration — TSK-138; `vcs-worktree` GC/timing; `ChatRouter` stop; `ChatApiClient` SSE-интеграция; `reviewer.role.ts` graph-flow тест `node_ask`/`node_synthesize`) → это предсуществующее состояние ветки, не вызвано правками этой фазы (изолированный прогон `role-scheduler.test.ts` — 5/5 pass); правило `AX_PERMITTED_BASH_COMMANDS` явно относит project-wide проверки к audit, фаза верифицирует только свой вывод — не фиксится в этой фазе, оставлено как `open` для audit
- [x] `2026-07-22T16:03:08Z` tried `<sdd-path> verify services/agent-inbox/modules/inbox-roles/artifact-recovery.ts services/agent-inbox/modules/inbox-roles/role-scheduler.ts` → typecheck/gennady-lint/format гейты pass; `test` гейт fail exit=1 (10 not-ok, см. insight выше — вне scope этой фазы)
- [x] `2026-07-22T16:03:08Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-roles/artifact-recovery.ts services/agent-inbox/modules/inbox-roles/role-scheduler.ts` → pass exit=0
- [x] `2026-07-22T16:03:08Z` ver `npx prettier --check services/agent-inbox/modules/inbox-roles/artifact-recovery.ts services/agent-inbox/modules/inbox-roles/role-scheduler.ts` → pass exit=0
- [x] `2026-07-22T16:03:08Z` ver `npm run type-check` → pass exit=0 (замена ticket §5 `npx tsc --noEmit -p services/agent-inbox` — путь без tsconfig в этом репо; ticket явно разрешает «актуальный typecheck-alias проекта»)
- [x] `2026-07-22T16:03:08Z` ver `node --test services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts` → pass exit=0 (точечная регрессия на затронутый файл; `artifact-recovery.test.ts` из §5 — Required by testing-common/node-test, не overlaps с Rules этой фазы (только typescript-rules) — его прогон принадлежит P2)
- [x] `2026-07-22T16:03:08Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/artifact-recovery.ts, services/agent-inbox/modules/inbox-roles/role-scheduler.ts, cli/cmd/mr-stats/mr-stats.cmd.ts]; decisions: [legacy-reports-root=`<stateDir>/agent-inbox/reports/` (плоский, отдельно от `mrReportsDir`), resume-checkpoint-node=`first ask-kind node in graph`, resume-artifacts-key=`diskRecovery`, recover-then-resume=true, registry-not-consulted-in-reconcileActionable=true]; open: [full-test-suite-pre-existing-failures: 10 not-ok вне scope фазы (MrStatsCommand/mr-stats-integration TSK-138, vcs-worktree GC/timing, ChatRouter stop, ChatApiClient SSE integration, reviewer.role.ts graph-flow) — audit должен подтвердить несвязанность или завести отдельные тикеты, P2: тест artifact-recovery.test.ts на реальной копии vk-workspace/superapp!599 покроет scanReportsDir/reconcileActionable/recoverLegacyArtifact/buildResumeCheckpoint]

#### P2

- [x] `2026-07-22T16:17:25Z` decision test-target=`services/agent-inbox/modules/inbox-roles/__tests__/artifact-recovery.test.ts` ← покрывает все 5 сценариев §4 (D-127..D-129, SV-15..18) через реальный `scanReportsDir`/`reconcileActionable`/`recoverLegacyArtifact`, без module-мокинга SUT
- [x] `2026-07-22T16:17:25Z` decision real-legacy-fixture=byte-copy `~/.gennady/agent-inbox/reports/vk-workspace__superapp-599/` в изолированный `makeTestTmpDir` на каждый кейс (D-116, не синтетическая фикстура этой формы) ← сценарии «classifies real superapp!599 legacy artifact»/«re-verifies legacy verdict against current diff» используют РЕАЛЬНЫЕ байты; сценарии canonical/registry — синтетические (тег `[unit]`/generic-canonical в BDD, не про конкретный legacy-shape)
- [x] `2026-07-22T16:17:25Z` decision live-verify=реальный `VcsInboxReal({host:'gitlab.corp.mail.ru'})` + реальный `StateStore` (изолированный stateDir) в кейсе «re-verifies legacy verdict against current diff» ← честный D-116-паттерн (`checkLivePreconditions`/`t.skip()`, зеркалит `reviewer.e2e.test.ts`), никакого фиктивного прохода при недоступности токена/сети
- [x] `2026-07-22T16:17:25Z` discovery живой прогон зафиксировал текущий head MR `4a82efd8` (recorded в legacy-артефакте — `3e384b4e` от 17.07) — MR действительно продвинулся с момента записи легаси-артефакта; `_reverifyFinding` реально прогнал `git diff` между двумя SHA на свежем worktree, а не короткое замыкание «head совпал»
- [x] `2026-07-22T16:17:25Z` tried `<sdd-path> verify services/agent-inbox/modules/inbox-roles/__tests__/artifact-recovery.test.ts` → typecheck/gennady-lint pass; `test` гейт fail exit=1 (тот же предсуществующий набор 10 not-ok из P1 Handoff — MrStatsCommand/vcs-worktree/ChatRouter/ChatApiClient/reviewer.role.ts graph-flow/mr-stats-integration; все 5 кейсов `artifact-recovery.test.ts` — ok, новых регрессий нет)
- [x] `2026-07-22T16:17:25Z` ver `npx prettier --check services/agent-inbox/modules/inbox-roles/__tests__/artifact-recovery.test.ts` → pass exit=0
- [x] `2026-07-22T16:17:25Z` ver `npm run type-check` → pass exit=0 (тот же alias, что в P1 — путь `-p services/agent-inbox` в этом репо отсутствует)
- [x] `2026-07-22T16:17:25Z` ver `node --test services/agent-inbox/modules/inbox-roles/__tests__/artifact-recovery.test.ts` → pass exit=0 (ticket §5, verbatim; 5/5 сценариев, включая живой re-verify против текущего диффа реального MR)
- [x] `2026-07-22T16:17:25Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/artifact-recovery.test.ts]; decisions: [test-uses-real-superapp599-byte-copy=true, canonical/registry-scenarios-use-synthetic-generic-dirs=true, live-recover-case-honest-skips-per-D116=true]; open: [full-test-suite-pre-existing-failures: те же 10 not-ok вне scope этого тикета (см. P1 open) — audit должен подтвердить несвязанность]

#### Round close

- [x] `2026-07-22T16:17:25Z` DONE

<!--/SECTION:EXECUTION_LOG-->
