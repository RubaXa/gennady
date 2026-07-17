# Task: TSK-134 — inbox-core: mrShape + инъекция `## Контекст` в трек-болванки

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-134 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-core | **Dependencies:** None
- **Purpose:** Оркестраторный шаг перед сессиями: считать `mrShape` (`newSymbols`, `nestedLoops`, `filterMapChain`, `isTiny`, `securityHits`, `depManifest`) статанализом диффа base..HEAD и влить `## Контекст` в каждую сматериализованную трек-болванку `tasks/<track>.task.md` — хунки диффа, ограниченные файлами трека, число+список коммитов, список сущностей (новые символы), разметка внимания. Реализует AI-40/D-119; `mrShape` — вход для TSK-136 (композиция триггеров) и TSK-113 Round 2 (ToolPolicy per lens).
- **Spec References:**
  - Requirement: [AI-39/AI-40](../../../specs/agent-inbox/agent-inbox.spec.md#413-динамическая-сборка-директив--инъекция-контекста-refine--d118d123)
  - Decision: [D-118/D-119](../../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log)
  - Architecture: [§5.3 / §5.3.1](../../../specs/agent-inbox/agent-inbox.spec.md#53-review-execution-болванка-driven-сессии--динамическая-сборка-директив-d118d123) (граница «наш код ↔ агент», бюджет инъекции диффа, `mrShape` — композиция не выбор)
  - Consumer: `buildReviewPlan`/`scaffoldReviewReports` — [`cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts`](../../../cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None (real git worktree diff exercised at integration level in this ticket; full pipeline through opencode — TSK-113 Round 2)

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

### P1 — impl (mrShape + context-builder)

- **Objective:** новый модуль `context-builder.ts`: `computeMrShape(changeset, diffText): MrShape` (6 флагов статанализом — new exported symbol в диффе, вложенные циклы, цепочка `filter().map()`, tiny-diff по числу строк, security-триггеры по паттернам/путям, тронутый dependency-манифест); экспортированный тип `InjectedEntity = {file: string; line?: number; symbol?: string}` — структурированная форма каждой сущности, которую `buildTrackContext` вливает в разметку; `buildTrackContext(track, changeset, base, head): {markdown: string; injectedEntities: InjectedEntity[]}` — рендерит `## Контекст` (хунки диффа, ограниченные файлами трека из `## Область`, число+список коммитов base..HEAD, список новых символов, разметка внимания по AI-44-триггерам, вычисленным здесь) И параллельно возвращает `injectedEntities` — структурированный список ровно тех файлов/символов, что упомянуты в `markdown` (тот же источник построения, не независимый пересчёт) — это producer, который TSK-137 (`_verifyInjectionCoverage`) потребляет напрямую вместо повторного парсинга markdown. `scaffoldReviewReports` (существующий, минимальное оправданное касание) вызывает `buildTrackContext` при материализации каждой `tasks/<track>.task.md`, вписывает `markdown` в уже созданный скелет (болванка сама не меняется — секция уже объявлена в шаблоне TSK-103/104, сейчас пустая); `injectedEntities` прокидывается вызывающей стороне (TSK-113 Round 2 / TSK-137) наравне с markdown, не отбрасывается.
  - Когда `mrShape.securityHits === true` ИЛИ `mrShape.depManifest === true` — `buildTrackContext('security', ...)` дополнительно вписывает в `## Контекст` отдельную строку разметки внимания, поднимающую приоритет SUPPLY/INJ/SECRET-проб (§5.3.1 depth-modulation: эти два флага не выбирают шаблон, но модулируют глубину контента security-трека).
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/context-builder.ts` (new — exports `MrShape`, `InjectedEntity`, `computeMrShape`, `buildTrackContext`)
  - `cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts` (touched — `scaffoldReviewReports` вызывает `buildTrackContext`, вписывает `.markdown`, пробрасывает `.injectedEntities`)
- **Inputs:** none
- **Exit:** typecheck pass; на реальном diff-фикстуре `## Контекст` каждой сматериализованной трек-болванки непустой и содержит только хунки файлов своего трека (не весь дифф); security-трек получает полный дифф (NFC-SV-09 — без урезания по треку); `buildTrackContext` возвращает `injectedEntities`, поэлементно соответствующий сущностям, упомянутым в `markdown`.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** contract-тест формы `MrShape` + unit-покрытие 6 флагов + инъекции контекста, ограниченной треком + integration на реальном git-репо (fixture с ≥2 реальными коммитами) — реальный `git diff`/`git log`, реальная запись/чтение болванки с диска.
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/__tests__/context-builder.test.ts` (new)
  - `cli/cmd/inbox-review-plan/inbox-review-plan.test.ts` (touched — сценарий инъекции)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; integration-сценарий проходит на реальной fs + реальном git worktree (без мока диффа).

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: `MrShape` — see Spec References (Value Object, новая сущность этого тикета).

**Feature:** mrShape + инъекция `## Контекст`

**Scenario:** MrShape — типизированная форма и отказ на некорректном входе [`contract`]

- **Given** валидный `Changeset` (список файлов+±) и невалидный/пустой changeset
- **When** `computeMrShape(changeset, diffText)`
- **Then** для валидного входа возвращается объект ровно с 6 булевыми полями (`newSymbols`, `nestedLoops`, `filterMapChain`, `isTiny`, `securityHits`, `depManifest`)
- **And** для невалидного входа (`changeset: null`/не-массив) — типизированная ошибка, не молчаливый `undefined`-флаг

**Scenario:** newSymbols — новый экспортируемый символ в диффе [`unit`]

- **Given** дифф добавляет новую экспортируемую функцию/класс/константу
- **When** `computeMrShape`
- **Then** `newSymbols === true`

**Scenario:** isTiny — диф в одну строку [`unit`]

- **Given** дифф изменяет ровно 1 строку в 1 файле
- **When** `computeMrShape`
- **Then** `isTiny === true`

**Scenario:** filterMapChain — цепочка `.filter().map()` [`unit`]

- **Given** дифф добавляет вызов `.filter(...).map(...)` на одной коллекции
- **When** `computeMrShape`
- **Then** `filterMapChain === true`

**Scenario:** nestedLoops — вложенные циклы [`unit`]

- **Given** дифф добавляет цикл внутри цикла
- **When** `computeMrShape`
- **Then** `nestedLoops === true`

**Scenario:** securityHits + depManifest — модуляторы глубины (не селекторы) [`unit`]

- **Given** дифф трогает `package.json`/lock-файл И дифф содержит паттерн секрета/токена
- **When** `computeMrShape`
- **Then** `depManifest === true` И `securityHits === true`
- **And** оба флага НЕ влияют на то, запускается ли security-линза (она безусловна, NFC-SV-09) — модуляторы глубины потребляются TSK-113/inbox-roles, не этим тикетом

**Scenario:** инъекция ограничена файлами трека [`unit`]

- **Given** трек `logic` со списком файлов `A.ts`, `B.ts` из `## Область`; дифф MR трогает также `C.ts` вне трека
- **When** `buildTrackContext('logic', changeset, base, head)`
- **Then** `## Контекст` содержит хунки только `A.ts`/`B.ts`
- **And** не содержит хунков `C.ts`

**Scenario:** security-трек получает полный дифф [`unit`]

- **Given** трек `security` и changeset с файлами из нескольких треков
- **When** `buildTrackContext('security', changeset, base, head)`
- **Then** `## Контекст` содержит хунки ВСЕХ файлов changeset (NFC-SV-09), не только security-трека

**Scenario:** разметка внимания по AI-44-триггерам [`unit`]

- **Given** `mrShape.newSymbols === true` для файла из трека
- **When** `buildTrackContext`
- **Then** `## Контекст` содержит разметку внимания, ссылающуюся на имя нового символа и шаг «нет ли уже такого / тот ли слой» (AI-44)

**Scenario:** injectedEntities — структурированный список соответствует влитой markdown [`unit`]

- **Given** дифф трека `logic` с файлами `A.ts` (новый символ `foo`, строка 12), `B.ts`
- **When** `buildTrackContext('logic', changeset, base, head)`
- **Then** `result.injectedEntities` содержит `{file: 'A.ts', line: 12, symbol: 'foo'}` и запись для `B.ts`
- **And** каждый элемент `injectedEntities` соответствует файлу/символу, реально упомянутому в `result.markdown` (не независимый пересчёт, тот же проход построения)

**Scenario:** securityHits/depManifest поднимают разметку внимания SECURITY-трека [`unit`]

- **Given** `mrShape.securityHits === true` ИЛИ `mrShape.depManifest === true`
- **When** `buildTrackContext('security', changeset, base, head)`
- **Then** `## Контекст` содержит дополнительную строку разметки внимания, поднимающую приоритет SUPPLY/INJ/SECRET-проб (§5.3.1 depth-modulation)
- **And** для `mrShape` без этих флагов такая строка отсутствует

**Scenario:** binary/no-hunk diff — computeMrShape не падает [`unit`]

- **Given** дифф содержит только rename и/или mode-only изменение (без текстовых хунков) для бинарного файла
- **When** `computeMrShape(changeset, diffText)`
- **Then** функция не бросает исключение
- **And** все 6 флагов возвращаются булевыми (`false` там, где сигнал отсутствует, а не `undefined`/throw)

**Scenario:** реальная материализация на реальном git-репо [`integration`]

- **Given** реальный fixture-репозиторий (temp dir, `git init` + ≥2 реальных коммита, реальный diff base..HEAD), реальная файловая система под tmp state-dir
- **When** `scaffoldReviewReports` материализует `tasks/<track>.task.md` для каждого трека
- **Then** на диске (реальное чтение файла, не in-memory снапшот) каждая болванка содержит непустую `## Контекст` с реальным текстом хунков и реальным списком коммитов
- **And** нет ни одного мока git/diff — только реальный `git` бинарь через рабочий каталог

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                       | Required by                 |
| --------------------------------------------------------------------------------------------- | --------------------------- |
| `npm run type-check`                                                                          | typescript-rules            |
| `npm run test -- 'services/agent-inbox/modules/inbox-core/__tests__/context-builder.test.ts'` | testing-common, node-test   |
| `npm run test -- 'cli/cmd/inbox-review-plan/inbox-review-plan.test.ts'`                       | testing-common, node-test   |
| `npm run format:check`                                                                        | typescript-rules, node-test |

- **Task-specific Completion additions:** integration-сценарий обязан гонять реальный `git` в temp-репозитории (fixture ≠ снапшот review.json/мок диффа) — иначе Round не закрывается (D-116).

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                          | Level       | Test File                                                                                                          |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| MrShape — типизированная форма                    | contract    | `context-builder.test.ts` :: `computeMrShape rejects invalid changeset`                                            |
| newSymbols detection                              | unit        | `context-builder.test.ts` :: `newSymbols true on new export`                                                       |
| isTiny detection                                  | unit        | `context-builder.test.ts` :: `isTiny true on single-line diff`                                                     |
| filterMapChain detection                          | unit        | `context-builder.test.ts` :: `filterMapChain true on chain`                                                        |
| nestedLoops detection                             | unit        | `context-builder.test.ts` :: `nestedLoops true on nested for`                                                      |
| securityHits + depManifest modulators             | unit        | `context-builder.test.ts` :: `securityHits and depManifest are depth modulators not selectors`                     |
| инъекция ограничена треком                        | unit        | `context-builder.test.ts` :: `buildTrackContext bounds hunks to track files`                                       |
| security-трек — полный дифф                       | unit        | `context-builder.test.ts` :: `buildTrackContext security gets full changeset`                                      |
| разметка внимания по триггерам                    | unit        | `context-builder.test.ts` :: `buildTrackContext marks attention on newSymbols`                                     |
| injectedEntities соответствует markdown           | unit        | `context-builder.test.ts` :: `buildTrackContext returns injectedEntities matching markdown`                        |
| securityHits/depManifest — доп. разметка SECURITY | unit        | `context-builder.test.ts` :: `buildTrackContext security track adds attention line on securityHits or depManifest` |
| binary/no-hunk diff — не падает                   | unit        | `context-builder.test.ts` :: `computeMrShape does not throw on binary or mode-only diff`                           |
| реальная материализация на git-репо               | integration | `inbox-review-plan.test.ts` :: `scaffoldReviewReports injects real Context section from real git diff`             |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-17, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm run test -- 'services/agent-inbox/modules/inbox-core/__tests__/context-builder.test.ts'` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->
