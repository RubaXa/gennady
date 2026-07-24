# Task: TSK-149 — два pre-existing флейка run-mode → детерминированно зелёные

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-149 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-serve | **Dependencies:** TSK-147 (настоящий worktree, чтобы реальный reviewer-граф фанился и materialize писал артефакты)
- **Purpose:** Сделать детерминированно зелёными два pre-existing флейка в `run-mode.test.ts`: «real reviewer graph reaches ask-terminal» (падает `actual:'idle'`) и «disk materialization → BoardProviderReal round-trip» (падает `currentNode:'node_synthesize'` вместо `'node_ask'`). Корень (зафиксирован в D-212) — деградация реального графа в git-free temp-dir: без worktree `node_prepare` не строит changeset, фан-аут/синтез не доходят до `node_ask`. НЕ ослаблять ассерты.
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None
- **Spec References:**
  - Падающие тесты: [run-mode.test.ts](../../services/agent-inbox/serve/__tests__/run-mode.test.ts)
  - Реальный граф: [`ReviewerRole.graph`](../../services/agent-inbox/modules/inbox-roles/reviewer.role.ts)
  - Материализация: [`materializeReviewScaffold`/`materializeSynthesisReadme`](../../services/agent-inbox/modules/inbox-roles/reviewer.role.ts)
  - Прецедент: [tasks/README.md#D-212](../README.md)

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | test | —    | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — test

- **Objective:** Сначала подтвердить фактический корень по логам прогона (`_prepareWorktreeAndChangeset` degraded / `headChanged` undefined / фан-аут не стартует), не угадывая. Затем дать двум тестам настоящий git-worktree из фикстуры TSK-147 так, чтобы реальный граф прошёл `node_prepare → fanout → synthesize → gate → node_ask` и materialize записал PLAN.md/README.md/review.json. Ассерты (`state:'awaiting_operator'`, `currentNode:'node_ask'`, наличие артефактов) сохранить как есть. **Adaptive:** если worktree-путь не устраняет деградацию (иная причина), зафиксировать реальный корень `discovery`-строкой и либо чинить его, либо gated `skip` с явной причиной — но только после того, как корень доказан логами, не раньше.
- **Rules:**
  - [testing/node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/serve/__tests__/run-mode.test.ts`
- **Inputs:** TSK-147 handoff
- **Exit:** оба ранее падавших теста зелёные без ослабления ассертов (или доказанный-и-задокументированный skip); весь файл проходит.

<!--/SECTION:PHASE_P1-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References.

**Feature:** реальный reviewer-граф в тесте доходит до терминала

**Scenario:** ask-terminal достигается при настоящем worktree [`integration`]

- **Given** MR с ролью reviewer и настоящий git-worktree (фикстура TSK-147) с реальным changeset
- **When** `runMrsOnce` прогоняет реальный граф ревьювера (dry-run)
- **Then** `state === 'awaiting_operator'`, `board.currentNode === 'node_ask'`
- **And** `proposedActions` застейджены (ассерт не ослаблен)

**Scenario:** materialize пишет реальные артефакты и BoardProviderReal их читает [`integration`]

- **Given** реальный граф дошёл до `gate_review_synthesis` при настоящем worktree
- **When** пройден синтез-гейт
- **Then** PLAN.md/README.md/review.json на диске, `BoardProviderReal.readArtifact` возвращает README с реальным `mermaid`-блоком (не «FILL: orchestrator»)

**Scenario:** корень деградации доказан до правки [`integration`]

- **Given** тест падал `actual:'idle'`/`node_synthesize`
- **When** диагностируется причина
- **Then** реальный корень зафиксирован по логам (`discovery`-строка), правка адресует именно его — не подгонка ассерта

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                          | Required by       |
| -------------------------------------------------------------------------------- | ----------------- |
| `node --import tsx --test services/agent-inbox/serve/__tests__/run-mode.test.ts` | testing/node-test |

- **Task-specific Completion additions:** прогон завершается без зависаний; `repos.json` seeding сохранён; ассерты не ослаблены (проверяется на аудите).

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «ask-terminal при worktree» → `run-mode.test.ts` :: `runMrsOnce — real reviewer graph reaches ask-terminal (review_needed)`
- Scenario «materialize + BoardProviderReal» → `run-mode.test.ts` :: `reviewer graph → real disk materialization → BoardProviderReal round-trip (TSK-122 P3 real-proof)`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = один execute-then-audit проход.)_

### Round 1 — 2026-07-23, initial

#### P1

- [x] `2026-07-23T13:31:59Z` discovery оба падения НЕ вызваны git-free деградацией (D-212 гипотеза не подтвердилась): `_prepareWorktreeAndChangeset` деградирует одинаково и в проходящих (SV-23/SV-24), и в падающих тестах — деградация безобидна, граф продолжает работать без worktree. Реальный корень — коммит 55c2571 добавил `REQUIRED_REVIEW_REPORT_FIELDS = ['summary','verdict','behavior','scenarios']` в `gate_review_synthesis`/`gate_delta_synthesis` (`_missingReviewReportFields`), а оба теста сидировали `node_synthesize` без полей `behavior`/`scenarios` (тест 1 — ещё и без `summary`) → гейт всегда `fail` → тест 1 крутится до исчерпания `restartMax` и деградирует до `idle`; тест 2 (ручной `instance.step()`) видит откат `gate_review_synthesis → node_synthesize` за один шаг вместо `node_ask`.
- [x] `2026-07-23T13:31:59Z` decision fix-target=mock-seed-data ← корень в тестовых сидах OpenCodeMock, не в графе/materialize/worktree; PLAN.md/README.md уже пишутся без реального git-worktree (materializeReviewScaffold/materializeSynthesisReadme используют только seeded changesetFiles из checkpoint) — createGitFixture (TSK-147) не потребовался, deps остаётся open ниже.
- [x] `2026-07-23T13:31:59Z` tried git-worktree-фикстура (createGitFixture) для устранения деградации → отклонено: деградация не была причиной падений (см. discovery); правка сидов оказалась достаточной и минимальной.
- [x] `2026-07-23T13:31:59Z` ver `npx tsc --noEmit` → pass exit=0
- [x] `2026-07-23T13:31:59Z` ver `node --import tsx --test services/agent-inbox/serve/__tests__/run-mode.test.ts` → pass exit=0
- [x] `2026-07-23T13:31:59Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/serve/__tests__/run-mode.test.ts]; decisions: [root-cause=missing-required-reviewReport-fields-in-mock-seed(not-git-degradation), git-fixture-needed=false]; open: [TSK-147-git-fixture: created but unused by this phase — real root was unrelated to worktree presence; still valid for future git-dependent tests]

#### Round close

- [x] `2026-07-23T13:45:00Z` sync agent-inbox+root
- [x] `2026-07-23T13:45:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
