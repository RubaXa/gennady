# Task: TSK-137 — inbox-roles: ArtifactValidator injection-coverage grounding

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-137 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-roles | **Dependencies:** TSK-113 (Round 2), TSK-134 (producer of `InjectedEntity[]` — `buildTrackContext`'s `injectedEntities` output is the real input to `_verifyInjectionCoverage`, not a type-only reference)
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
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (injection-coverage-ledger)

- **Objective:** `artifact-validator.ts`: новая проверка `_verifyInjectionCoverage(dir, injectedEntities)` — `injectedEntities: InjectedEntity[]` (тип из TSK-134's `context-builder.ts`, `{file, line?, symbol?}`) — это РЕАЛЬНЫЙ вывод `buildTrackContext(...).injectedEntities` (TSK-134), передаваемый вызывающей стороной (gate-узел `role-instance.ts`) как есть — конкретно через `ctx.injectedEntities` поля `NodeContext`, провизию которого делает TSK-113 P5 (этот тикет `role-instance.ts` НЕ трогает, только `artifact-validator.ts`); `_verifyInjectionCoverage` НЕ парсит `## Контекст` markdown заново для восстановления списка сущностей — консьюмер структурированного producer'а TSK-134, не markdown re-parse. Каждая находка/кандидат в заполненной болванке обязана ссылаться (по `file:line` или имени сущности) на элемент этого списка; находка вне инъекции → ошибка. `validate(dir, stage, opts)` для `stage`/`sessionKind` ∈ {`track`, `security`, `code`, `synthesize`} диспетчит `_verifyInjectionCoverage` ВМЕСТО `_verifyToolCallCoverage` (structural + mermaid проверки не трогаются, остаются как есть); для прочих `sessionKind` (`thread_triage`, `delta_review`, `self_review`, `analyze_feedback`) — прежний `_verifyToolCallCoverage` без изменений (regression guard, §5.3.1 scope boundary). Существующий tool-call telemetry-путь (`phase-telemetry.ts`, `gennady inbox stats`, AI-45) не меняется — уже пишет `tool-trace.jsonl` независимо от validate().
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-roles/artifact-validator.ts` (touched)
- **Inputs:** TSK-134 handoff (`context-builder.ts` — `buildTrackContext(...).injectedEntities`, real runtime producer, not type-level only)
- **Exit:** typecheck pass; для injection-сессий gate = структура + injection-coverage + mermaid (tool-call сверка не вызывается); `_verifyInjectionCoverage` вызывается с `injectedEntities`, реально пришедшим из TSK-134's `buildTrackContext` (та же болванка, тот же прогон), не с отдельно распарсенным/hand-built списком; для out-of-scope веток старое поведение неизменно (regression-тест зелен).

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

**Scenario:** реальная материализация — gate на диске, injectedEntities из реального TSK-134 producer'а [`integration`]

- **Given** реальная временная директория, реальная сматериализованная `tasks/<track>.task.md` (структура из `scaffoldReviewReports`, TSK-134's `buildTrackContext` реально вызван на реальном diff-фикстуре — `## Контекст` записан на диск И `injectedEntities` из ТОГО ЖЕ вызова сохранён/передан вызывающей стороне) + реальные находки, дописанные в файл
- **When** `validate(dir, 'filled', {sessionKind: 'track', injectedEntities})` читает болванку с реального fs (не in-memory строка) и использует переданный `injectedEntities` как есть (без повторного парсинга `## Контекст`)
- **Then** gate возвращает `ok: true` для находок, ссылающихся на элементы реального `injectedEntities` (тот же список, что породил `## Контекст`), и `ok: false` при подмене находки на несуществующий файл

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

| Scenario                                                                                  | Level       | Test File                                                                                                          |
| ----------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Форма injected-entity ссылки + отказ                                                      | contract    | `artifact-validator.test.ts` :: `verifyInjectionCoverage rejects unlisted reference`                               |
| Injection-сессии пропускают tool-call сверку                                              | unit        | `artifact-validator.test.ts` :: `validate skips tool-call check for review_needed lenses`                          |
| Находка без grounding — ошибка                                                            | unit        | `artifact-validator.test.ts` :: `validate fails on finding outside injected context`                               |
| Явное no-findings всё ещё требуется                                                       | unit        | `artifact-validator.test.ts` :: `validate still requires explicit no-findings`                                     |
| Out-of-scope ветка не регрессирует                                                        | unit        | `artifact-validator.test.ts` :: `validate keeps legacy tool-call check for thread_triage`                          |
| Реальная материализация — gate на диске, injectedEntities из реального TSK-134 producer'а | integration | `artifact-validator.test.ts` :: `validate grounds against real injectedEntities from buildTrackContext on real fs` |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-17, initial

#### P1

- [x] `2026-07-17T16:43:29Z` discovery `artifact-validator.ts` уже содержит полную реализацию P1 (`SessionKind`, `ValidateOpts`, `INJECTION_GROUNDED_SESSION_KINDS`-диспетчинг в `validate()`, `_parseCandidateRows`, `_verifyInjectionCoverage`) от прерванной предыдущей сессии; код прочитан целиком, переписывание не требуется — Objective/Exit удовлетворены как есть.
- [x] `2026-07-17T16:43:29Z` intro `SessionKind` ← закрытое множество session-kind значений `NodeContext`, по которым `validate()` выбирает метод граундинга (TSK-137)
- [x] `2026-07-17T16:43:29Z` intro `ValidateOpts` ← типизированный объект опций (`sessionKind` + `injectedEntities` + `toolCalls`), заменяет голый массив `toolCalls` для injection-граундированных вызовов, сохраняя обратную совместимость через `Array.isArray` (TSK-137)
- [x] `2026-07-17T16:43:29Z` decision dispatch-branch=sessionKind∈INJECTION_GROUNDED_SESSION_KINDS ← одна точка входа `validate()` остаётся совместимой с легаси голым массивом `toolCalls`
- [x] `2026-07-17T16:43:29Z` decision injection-grounding-match=file-path-или-symbol-substring ← `candidate.file` совпадает/endsWith/is-endsWith-of `entity.file`, либо `candidate.problem` содержит `entity.symbol`
- [x] `2026-07-17T16:43:29Z` discovery `role-instance.ts` (TSK-113 Round 2) вызывает только универсальный `GateNode.verify(ctx)`; ни один production-вызов не создаёт `ArtifactValidator` и не вызывает `.validate(...)` нигде в репозитории кроме `artifact-validator.test.ts`. `NodeContext` (`role-node.ts`) несёт реальное, провязанное поле `injectedEntities?: InjectedEntity[]` (заполняется `RoleInstance#_buildContext` из `buildTrackContext`, TSK-134/TSK-113 P5), но поля `sessionKind` на `NodeContext` нет и продюсера для него нет — диспетчинг, построенный в этой фазе, достижим сейчас только через ручной `ValidateOpts` в тестах, не через реальный путь исполнения gate-узла. Провязка вызова gate-узла в `role-instance.ts` (передача `{sessionKind, injectedEntities}`) вне Target Files этого тикета (только `artifact-validator.ts`) — зафиксировано как открытый пункт для отдельной задачи, не блокер этой фазы.
- [x] `2026-07-17T16:43:29Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-17T16:43:29Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts'` → pass exit=0
- [x] `2026-07-17T16:43:29Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-17T16:43:29Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/artifact-validator.ts]; decisions: [dispatch-branch=sessionKind∈INJECTION_GROUNDED_SESSION_KINDS, injection-grounding-match=file-path-or-symbol-substring]; open: [role-instance-gate-wiring: gate-node call site в role-instance.ts не передаёт {sessionKind, injectedEntities} в ArtifactValidator#validate — sessionKind не провязан в NodeContext, диспетчинг этой фазы недостижим в production до отдельной задачи на провязку]

#### P2

- [x] `2026-07-17T17:00:35Z` discovery `artifact-validator.test.ts` уже содержал 3 describe-блока (coverage ledger, tool-call cross-check, mermaid validity, TSK-113); ни один тест не покрывал P1's injection-coverage ветвление — все 6 BDD-сценариев §4 требовали нового кода.
- [x] `2026-07-17T17:00:35Z` decision candidateRows-factory-extension=taskContent() получил опциональный `candidateRows?: string[]` (дефолт `[EMPTY_CANDIDATES_ROW]`, обратная совместимость с существующими вызовами сохранена) ← нужен способ вписать реальные строки-кандидаты для injection-coverage сценариев без ломки существующих unit-тестов
- [x] `2026-07-17T17:00:35Z` decision integration-scenario-materialization=реальный git-репозиторий (temp dir) + `buildReviewPlan` + `scaffoldReviewReports(..., worktreePath)` → реальный `## Контекст` + реальный `injectedEntities`; синтез (README с mermaid, Находки/Вердикт/status=filled) дописан поверх материализованного скаффолда, т.к. `validate(dir,'filled')` требует полностью валидный отчёт (диаграмма, заполненные секции) для `ok: true`, не только injection-coverage срез
- [x] `2026-07-17T17:00:35Z` discovery первая версия integration-негативного сценария (bad-file swap) ложно проходила: `problem`-ячейка кандидата содержала имя символа (`realFn`), и `_verifyInjectionCoverage`'s symbol-substring fallback заземлял находку даже после подмены файла на несуществующий — исправлено (problem-текст без имени символа, grounding только через file-match)
- [x] `2026-07-17T17:00:35Z` tried `<sdd-path> verify <target-file>` (доп. supplemental gate) → typecheck + gennady DBC lint прошли зелено (typecheck 3741ms, lint 1 файл 493ms); процесс завис на этапе test/format gates (окружение — вложенный npm-подпроцесс не возвращал управление в background-shell) и был прерван вручную; test/format уже независимо подтверждены точными §5-командами ниже
- [x] `2026-07-17T17:00:35Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-17T17:00:35Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts'` → pass exit=0
- [x] `2026-07-17T17:00:35Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-17T17:00:35Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-roles/__tests__/artifact-validator.test.ts]; decisions: [candidateRows-factory-extension=taskContent() accepts optional candidateRows override, integration-scenario-materialization=real git repo + buildReviewPlan + scaffoldReviewReports(worktreePath) + real buildTrackContext injectedEntities]; open: [role-instance-gate-wiring: carried from P1 — gate-node call site in role-instance.ts still does not pass {sessionKind, injectedEntities} into ArtifactValidator#validate, unrelated to this ticket's Target Files]

#### Round close

- [x] `2026-07-17T17:00:35Z` DONE

<!--/SECTION:EXECUTION_LOG-->
