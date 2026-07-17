# Task: TSK-136 — services/ai-kit: динамическая сборка директив из ai/kit (селектор + аксиомы-кирпичи)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-136 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** N/A (scope-level, как TSK-116) | **Dependencies:** TSK-134
- **Purpose:** Заменить статичный `NODE_DIRECTIVE_MAP`/`buildNodePrompt` (клейка монолитных `ai/directives/agent-inbox/*.directive.xml`) на селектор `(sessionType, track, mrShape)`, собирающий директиву из `ai/kit` (hbs-база + аддитивная композиция аксиом-кирпичей) — ТОЛЬКО для линз `review_needed` (`track`/`security`/`code`) + `synthesize` (§5.3.1 граница refine). Ветки `reply_needed`/`update-review` и author-граф остаются на статике. Реализует AI-42/43/44, D-121/D-122/D-123.
- **Spec References:**
  - Requirement: [AI-42/AI-43/AI-44](../../specs/agent-inbox/agent-inbox.spec.md#413-динамическая-сборка-директив--инъекция-контекста-refine--d118d123)
  - Decision: [D-121/D-122/D-123](../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log)
  - Architecture: [§5.3.1](../../specs/agent-inbox/agent-inbox.spec.md#531-scope-и-инварианты-refine-уточнения-критика-раунд-1) (mrShape композиция — НЕ дискретный один-шаблон-на-shape; reuse-first аксиом)
  - Consumer: `services/ai-kit/compile.ts` (`buildNodePrompt`) — [current static map](../../services/ai-kit/node-map.ts)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** AI-45 round-trip gate (≤10/lens on ≥2 real MRs) is measured end-to-end in TSK-113 Round 2, not here — this ticket proves correct directive assembly, not the round-trip reduction itself.

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (аксиомы-кирпичи + базовые hbs-шаблоны + селектор)

- **Objective:** (a) четыре новые аксиомы-кирпичи миссии-адекватности (justify-new — в `ai/kit` их нет): `AX_REVIEW_PURPOSE`, `AX_SIMPLER_ALTERNATIVE`, `AX_COMPLEXITY_BUDGET`, `AX_MINIMAL_CHANGE_SUSPICION`; `AX_NO_DUPLICATION` НЕ создаётся заново — переиспользует существующий `ai/kit/axiom/scaffold/ax-ticket-deduplication.xml` принцип (partial-include или прямая ссылка на тот же кирпич — churn избегается); scale-триггер (nestedLoops→complexity-шаг) переиспользует существующий `ai/kit/axiom/process/ax-scale-proportional-depth.xml`. (b) ЧЕТЫРЕ новых базовых hbs-шаблона под `ai/kit/templates/sdd-v2/agent-inbox/` (`track-review.directive.hbs`, `security-lens.directive.hbs`, `synthesize.directive.hbs`, `code-lens.directive.hbs`) — НЕ путать с одноимёнными по духу `code-review.directive.hbs`/`amplify-security.directive.hbs`/`reconcile.directive.hbs` в том же каталоге: те — директивы SDD-воркфлоу (`sdd-code-review`, `sdd-amplify-security`, `sdd-reconcile` скиллы), другой домен контента, `code-lens.directive.hbs` с ними НЕ коллизирует (отдельное имя файла); паттерн hbs+partial-кирпич копируется, содержимое — из существующих `ai/directives/agent-inbox/{arch,code,security}-interrogation.directive.xml` (миграция контента в brick-форму, не с нуля): `track-review.directive.hbs` ← `arch-interrogation.directive.xml`, `security-lens.directive.hbs` ← `security-interrogation.directive.xml`, `code-lens.directive.hbs` ← `code-interrogation.directive.xml` (это база для `track='code'`/`node_code_review` — без неё `selectDirective('session', 'code', mrShape)` не имеет базового шаблона и мигрированный контент `code-interrogation.directive.xml` остаётся невостребованным). (c) `services/ai-kit/selector.ts` — `selectDirective(sessionType, track, mrShape): string`: выбирает базовый hbs-шаблон по `(sessionType, track)` — `track='logic'`→`track-review.directive.hbs`, `track='security'`→`security-lens.directive.hbs`, `track='code'`→`code-lens.directive.hbs`, `sessionType='synthesize'`→`synthesize.directive.hbs` — затем аддитивно доинъецирует partial-кирпичи по 4 флагам `mrShape` (`newSymbols`→dedup-шаг reuse `ax-ticket-deduplication`, `isTiny`→`AX_MINIMAL_CHANGE_SUSPICION`, `filterMapChain`→reduce-шаг, `nestedLoops`→complexity-шаг reuse `ax-scale-proportional-depth`) поверх всегда-включённых `AX_REVIEW_PURPOSE`/`AX_SIMPLER_ALTERNATIVE`/`AX_COMPLEXITY_BUDGET`/`AX_NO_DUPLICATION`; `securityHits`/`depManifest` НЕ читаются этим селектором как ветвящие флаги (per §5.3.1 — они модулируют глубину внутри `security-lens.directive.hbs` контента, не выбор шаблона). (d) `services/ai-kit/compile.ts`/`node-map.ts` (touched) — `buildNodePrompt` маршрутизирует `node_track_review`/`node_security_lens`/`node_code_review`/`node_synthesize` через `selector.ts`; остальные node-id (`node_thread_triage`, `node_delta_review`, `node_synthesize_delta`, `node_self_review`, `node_analyze_feedback`, …) остаются на статичном `NODE_DIRECTIVE_MAP` без изменений (scope boundary §5.3.1). (e) **Debug-дамп (D-124/AI-46):** `selector.ts` экспортирует чистую функцию сборки, а `gennady inbox` получает debug-подкоманду/флаг, дампящую собранную директиву per `(sessionType, track, mrShape)` БЕЗ прогона ревью (для инспекции глазами и как якорь snapshot-тестов) — доказуемость сборки, не «на шару».
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `ai/kit/axiom/agent-inbox/ax-review-purpose.xml` (new)
  - `ai/kit/axiom/agent-inbox/ax-simpler-alternative.xml` (new)
  - `ai/kit/axiom/agent-inbox/ax-complexity-budget.xml` (new)
  - `ai/kit/axiom/agent-inbox/ax-minimal-change-suspicion.xml` (new)
  - `ai/kit/templates/sdd-v2/agent-inbox/track-review.directive.hbs` (new)
  - `ai/kit/templates/sdd-v2/agent-inbox/security-lens.directive.hbs` (new)
  - `ai/kit/templates/sdd-v2/agent-inbox/synthesize.directive.hbs` (new)
  - `ai/kit/templates/sdd-v2/agent-inbox/code-lens.directive.hbs` (new — base for `track='code'`/`node_code_review`, migrated from `ai/directives/agent-inbox/code-interrogation.directive.xml`; distinct file from the pre-existing `code-review.directive.hbs` SDD-skill template, no collision)
  - `services/ai-kit/selector.ts` (new — incl. debug-dump entry for assembled directive, D-124)
  - `services/ai-kit/compile.ts` (touched)
  - `services/ai-kit/node-map.ts` (touched)
  - `cli/cmd/inbox/` (touched — debug-подкоманда/флаг дампа собранной директивы, D-124/AI-46)
- **Inputs:** none (consumes `MrShape` type from TSK-134's `context-builder.ts`, no runtime coupling beyond the type)
- **Exit:** typecheck pass; `selectDirective` produces a rendered directive string that includes the base template + exactly the additive bricks matching a given `mrShape` (verified against `ai/kit/lint-axioms.ts` conventions); `track='code'` resolves to `code-lens.directive.hbs`; all five out-of-scope node-ids (`node_thread_triage`, `node_delta_review`, `node_synthesize_delta`, `node_self_review`, `node_analyze_feedback`) still resolve unchanged through the static map (no regression); debug-дамп выдаёт собранную директиву per `(sessionType, track, mrShape)` без прогона ревью (D-124).

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** unit-покрытие селектора (базовый выбор + аддитивная композиция по каждому из 4 флагов, независимо и в комбинации) + contract-тест на форму собранной директивы + integration-тест реального рендера через `ai/kit/render.ts` (реальные hbs-файлы с диска, не заглушки).
- **Rules:**
  - [testing-common](../../ai/directives/testing/common.xml)
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/ai-kit/__tests__/selector.test.ts` (new) — unit (базовый выбор + per-flag + комбинации) + структурные ассерты вход→композиция
  - `services/ai-kit/__tests__/selector.snapshot.test.ts` (new) — snapshot собранной директивы per `(sessionType, track, mrShape)` (D-124/AI-46)
  - `services/ai-kit/__tests__/compile.test.ts` (touched)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; integration-сценарий рендерит реальные файлы с диска (реальный `ai/kit/render.ts` + реальные hbs/xml, без in-memory заглушки шаблонов).

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: собранная директива — see Spec References (композиция как Value Object: `{base, bricks[]}` → rendered string).

**Feature:** Динамическая сборка директив `(sessionType, track, mrShape)`

**Scenario:** собранная директива — форма и обязательные всегда-включённые кирпичи [`contract`]

- **Given** любой валидный `(sessionType, track, mrShape)` с mrShape без активных флагов
- **When** `selectDirective(sessionType, track, mrShape)`
- **Then** результат — непустая строка, содержащая (в любом порядке) все четыре миссия-адекватность кирпича: `AX_REVIEW_PURPOSE`, `AX_SIMPLER_ALTERNATIVE`, `AX_COMPLEXITY_BUDGET`, `AX_NO_DUPLICATION`
- **And** для неизвестного `sessionType`/`track` — типизированная ошибка, не пустая строка

**Scenario:** базовый выбор по (sessionType, track) [`unit`]

- **Given** `sessionType='session', track='logic'` против `sessionType='session', track='security'`
- **Then** первый рендерит `track-review.directive.hbs`, второй — `security-lens.directive.hbs`; тела различаются

**Scenario:** базовый выбор для track='code' — code-lens.directive.hbs [`unit`]

- **Given** `sessionType='session', track='code'` (узел `node_code_review`)
- **When** `selectDirective('session', 'code', mrShape)`
- **Then** результат рендерит `code-lens.directive.hbs` (не `track-review.directive.hbs`, не коллизирует с SDD-skill `code-review.directive.hbs`)
- **And** тело отличается от `track-review.directive.hbs`/`security-lens.directive.hbs`

**Scenario:** newSymbols → dedup-шаг [`unit`]

- **Given** `mrShape.newSymbols === true`
- **When** `selectDirective`
- **Then** результат содержит dedup-шаг, переиспользующий `ax-ticket-deduplication`

**Scenario:** isTiny → AX_MINIMAL_CHANGE_SUSPICION [`unit`]

- **Given** `mrShape.isTiny === true`
- **When** `selectDirective`
- **Then** результат содержит кирпич `AX_MINIMAL_CHANGE_SUSPICION`

**Scenario:** filterMapChain → reduce-шаг [`unit`]

- **Given** `mrShape.filterMapChain === true`
- **When** `selectDirective`
- **Then** результат содержит шаг «а не reduce?»

**Scenario:** nestedLoops → complexity-шаг [`unit`]

- **Given** `mrShape.nestedLoops === true`
- **When** `selectDirective`
- **Then** результат содержит complexity-шаг, переиспользующий `ax-scale-proportional-depth`

**Scenario:** комбинация нескольких флагов — аддитивно, не эксклюзивно [`unit`]

- **Given** `mrShape.newSymbols === true` И `mrShape.nestedLoops === true`
- **When** `selectDirective`
- **Then** результат содержит ОБА доп. шага одновременно (не последний победивший)

**Scenario:** securityHits/depManifest не влияют на выбор шаблона [`unit`]

- **Given** два вызова с одинаковыми `(sessionType, track)`, различающимися только `securityHits`/`depManifest`
- **When** `selectDirective` для обоих
- **Then** набор аддитивных кирпичей идентичен (эти два флага не читаются селектором как триггеры)

**Scenario:** статичные node-id вне scope не регрессируют, параметризовано по всем пяти [`unit`]

- **Given** каждый из пяти out-of-scope node-id: `node_thread_triage`, `node_delta_review`, `node_synthesize_delta`, `node_self_review`, `node_analyze_feedback`
- **When** `buildNodePrompt(nodeId)` для КАЖДОГО из них (параметризованный тест или один sweep-тест над списком)
- **Then** для ВСЕХ пяти результат идентичен поведению до этого тикета (статичный `NODE_DIRECTIVE_MAP`, без обращения к `selector.ts`)

**Scenario:** реальный рендер с диска [`integration`]

- **Given** реальные файлы `ai/kit/templates/sdd-v2/agent-inbox/*.hbs` + реальные `ai/kit/axiom/agent-inbox/*.xml` на диске (без моков fs/require)
- **When** `selectDirective('session', 'logic', {newSymbols: true, nestedLoops: false, filterMapChain: false, isTiny: false, securityHits: false, depManifest: false})`
- **Then** `ai/kit/render.ts` реально читает и рендерит эти файлы, итоговая строка не содержит нерезолвленных `{{> "..."}}`-партиалов

**Scenario:** snapshot собранной директивы фиксирует композицию (D-124/AI-46) [`unit`]

- **Given** репрезентативный набор входов `(sessionType, track, mrShape)` — по одному на каждый базовый шаблон + комбинации флагов
- **When** `selectDirective` собирает директиву для каждого входа
- **Then** собранная строка побитово совпадает с закоммиченным snapshot'ом; дрейф композиции (не тот кирпич/порядок/потерянный плейсхолдер) валит тест — snapshot обновляется только осознанно

**Scenario:** debug-дамп собранной директивы без прогона ревью (D-124/AI-46) [`integration`]

- **Given** `(sessionType, track, mrShape)` и debug-режим `gennady inbox`
- **When** вызывается дамп собранной директивы (без запуска сессии/ревью)
- **Then** на выход идёт полная собранная директива (база + аддитивные кирпичи + плейсхолдеры `## Контекст`) для инспекции глазами/в тесте — доказуемо, что промт собрался правильно

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                 | Required by                 |
| ------------------------------------------------------- | --------------------------- |
| `npm run type-check`                                    | typescript-rules            |
| `npm run test -- 'services/ai-kit/__tests__/*.test.ts'` | testing-common, node-test   |
| `npm run format:check`                                  | typescript-rules, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                    | Level       | Test File                                                                                                                                                                                                  |
| ------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Форма собранной директивы + всегда-кирпичи  | contract    | `selector.test.ts` :: `selectDirective always includes mission bricks`                                                                                                                                     |
| Базовый выбор по (sessionType, track)       | unit        | `selector.test.ts` :: `selectDirective picks base template by track`                                                                                                                                       |
| Базовый выбор для track='code'              | unit        | `selector.test.ts` :: `selectDirective picks code-lens.directive.hbs for track code`                                                                                                                       |
| newSymbols → dedup                          | unit        | `selector.test.ts` :: `newSymbols adds dedup step`                                                                                                                                                         |
| isTiny → AX_MINIMAL_CHANGE_SUSPICION        | unit        | `selector.test.ts` :: `isTiny adds AX_MINIMAL_CHANGE_SUSPICION`                                                                                                                                            |
| filterMapChain → reduce-шаг                 | unit        | `selector.test.ts` :: `filterMapChain adds reduce step`                                                                                                                                                    |
| nestedLoops → complexity-шаг                | unit        | `selector.test.ts` :: `nestedLoops adds complexity step`                                                                                                                                                   |
| комбинация флагов аддитивна                 | unit        | `selector.test.ts` :: `multiple mrShape flags compose additively`                                                                                                                                          |
| securityHits/depManifest не селекторы       | unit        | `selector.test.ts` :: `securityHits and depManifest do not change brick set`                                                                                                                               |
| статичные node-id не регрессируют (5 узлов) | unit        | `compile.test.ts` :: `static out-of-scope node-ids unaffected by selector` (parametrized/sweep over node_thread_triage, node_delta_review, node_synthesize_delta, node_self_review, node_analyze_feedback) |
| реальный рендер с диска                     | integration | `selector.test.ts` :: `selectDirective renders real hbs+axiom files from disk`                                                                                                                             |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-17, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm run test -- 'services/ai-kit/__tests__/*.test.ts'` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
