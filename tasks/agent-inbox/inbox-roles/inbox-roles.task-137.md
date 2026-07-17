# Task: TSK-137 — inbox-roles: ArtifactValidator injection-coverage grounding

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-137 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-113 (Round 2), TSK-134
- **Purpose:** Для injection-сессий `review_needed` (track/security/code + synthesize) переопределить критерий ArtifactValidator «tool-call сверка» (D-86) на **injection-coverage-ledger**: находки обязаны ссылаться на файлы/сущности из влитого `## Контекст` (TSK-134), не на факт вызова инструмента (низко-раундовая инъекционная сессия иначе ложно валится «мало инструментов»). Tool-call лог сессии остаётся в телеметрии (`phase-timings.jsonl`/`tool-trace.jsonl`, уже пишется `phase-telemetry.ts`) — не в граундинге. Гейт для этих линз = **структура + injection-coverage + mermaid** (3 проверки, не 4). Ветки `reply_needed`/`update-review`/author (вне scope refine) сохраняют существующую tool-call сверку без изменений.
- **Spec References:**
  - Architecture: [§5.3.1 «Гейт-граундинг»](../../../specs/agent-inbox/agent-inbox.spec.md#531-scope-и-инварианты-refine-уточнения-критика-раунд-1)
  - Decision: [D-86](../../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log) (переопределяется для injection-сессий, не отменяется целиком)
  - Contract: [`ArtifactValidator`](../../../specs/agent-inbox/inbox-roles/inbox-roles.spec.md#artifactvalidator) — §4/§5 module spec (описывает tool-call сверку как безусловную; этот тикет вводит условное ветвление по session-kind, module spec не обновляется этим тикетом — расхождение зафиксировано в Decision Log `tasks/agent-inbox/README.md`)
  - Consumer: `services/agent-inbox/modules/inbox-roles/role-instance.ts` (gate-узлы)
- **Runtime Backing:** `not-implemented` (расширяет существующий `real-runtime`-компонент `artifact-validator.ts`, TSK-113)
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None

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

### P1 — impl (injection-coverage-ledger)

- **Objective:** `artifact-validator.ts`: новая проверка `_verifyInjectionCoverage(dir, injectedEntities)` — каждая находка/кандидат в заполненной болванке обязана ссылаться (по `file:line` или имени сущности) на элемент, присутствующий во влитом `## Контекст` (список сущностей/хунков из TSK-134); находка вне инъекции → ошибка. `validate(dir, stage, opts)` для `stage`/`sessionKind` ∈ {`track`, `security`, `code`, `synthesize`} диспетчит `_verifyInjectionCoverage` ВМЕСТО `_verifyToolCallCoverage` (structural + mermaid проверки не трогаются, остаются как есть); для прочих `sessionKind` (`thread_triage`, `delta_review`, `self_review`, `analyze_feedback`) — прежний `_verifyToolCallCoverage` без изменений (regression guard, §5.3.1 scope boundary). Существующий tool-call telemetry-путь (`phase-telemetry.ts`, `gennady inbox stats`, AI-45) не меняется — уже пишет `tool-trace.jsonl` независимо от validate().
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/artifact-validator.ts` (touched)
- **Inputs:** none (consumes the entity list shape produced by TSK-134's `context-builder.ts`, type-level only)
- **Exit:** typecheck pass; для injection-сессий gate = структура + injection-coverage + mermaid (tool-call сверка не вызывается); для out-of-scope веток старое поведение неизменно (regression-тест зелен).

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** unit-покрытие ветвления по `sessionKind` + contract-тест формы injected-entity-ссылки + integration-сценарий на реальных файлах диска (реальная сматериализованная болванка + реальный `## Контекст` + реальные находки, без снапшот-фикстуры review.json).
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts` (touched)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: injected-entity ссылка находки — see Spec References.

**Feature:** ArtifactValidator injection-coverage grounding

**Scenario:** находка со ссылкой на injected-сущность — форма и отказ [`contract`]

- **Given** список injected-сущностей `[{file, line?, symbol?}]` и находка, ссылающаяся на элемент из списка / находка, ссылающаяся на несуществующий элемент
- **When** `_verifyInjectionCoverage(dir, injectedEntities)`
- **Then** для валидной ссылки — `errors` пуст по этой находке
- **And** для находки вне списка — типизированная `ValidateError` с указанием находки и отсутствующей сущности

**Scenario:** injection-сессии не проходят tool-call сверку [`unit`]

- **Given** `stage`/`sessionKind = 'track'`, `toolCalls = []` (инъекционная сессия, ноль tool-call)
- **When** `validate(dir, stage, {sessionKind: 'track'})`
- **Then** `_verifyToolCallCoverage` НЕ вызывается (нет ошибки «файл не открывался агентом» на пустых toolCalls)
- **And** `_verifyInjectionCoverage` вызывается вместо неё

**Scenario:** находка без grounding в инъекции — ошибка [`unit`]

- **Given** заполненная болванка с находкой на файл, отсутствующий во влитом `## Контекст`
- **When** `validate`
- **Then** gate `fail`, ошибка ссылается на конкретную находку

**Scenario:** явное no-findings всё ещё требуется [`unit`]

- **Given** файл из `## Область` без находок и без явной пометки «no findings + причина»
- **When** `validate`
- **Then** gate `fail` (coverage ledger по Scope-файлам сохраняется, D-86 гарантия не теряется)

**Scenario:** out-of-scope ветка не регрессирует [`unit`]

- **Given** `sessionKind = 'thread_triage'` (вне scope refine) с реальными toolCalls
- **When** `validate`
- **Then** прежний `_verifyToolCallCoverage` вызывается как раньше — поведение идентично pre-TSK-137

**Scenario:** реальная материализация — gate на диске [`integration`]

- **Given** реальная временная директория, реальная сматериализованная `tasks/<track>.task.md` (структура из `scaffoldReviewReports`, TSK-134-инъекция `## Контекст` реально записана) + реальные находки, дописанные в файл
- **When** `validate(dir, 'filled', {sessionKind: 'track'})` читает файл с реального fs (не in-memory строка)
- **Then** gate возвращает `ok: true` для находок, ссылающихся на реально инъецированные хунки, и `ok: false` при подмене находки на несуществующий файл

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                           | Required by                 |
| ------------------------------------------------------------------------------------------------- | --------------------------- |
| `npm run type-check`                                                                              | typescript-rules            |
| `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts'` | testing-common, node-test   |
| `npm run format:check`                                                                            | typescript-rules, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                     | Level       | Test File                                                                                   |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Форма injected-entity ссылки + отказ         | contract    | `artifact-validator.test.ts` :: `verifyInjectionCoverage rejects unlisted reference`        |
| Injection-сессии пропускают tool-call сверку | unit        | `artifact-validator.test.ts` :: `validate skips tool-call check for review_needed lenses`   |
| Находка без grounding — ошибка               | unit        | `artifact-validator.test.ts` :: `validate fails on finding outside injected context`        |
| Явное no-findings всё ещё требуется          | unit        | `artifact-validator.test.ts` :: `validate still requires explicit no-findings`              |
| Out-of-scope ветка не регрессирует           | unit        | `artifact-validator.test.ts` :: `validate keeps legacy tool-call check for thread_triage`   |
| Реальная материализация — gate на диске      | integration | `artifact-validator.test.ts` :: `validate grounds against real injected Context on real fs` |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-17, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts'` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
