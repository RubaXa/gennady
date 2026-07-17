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
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

- [x] `2026-07-17T08:49:14Z` intro `MrShape` ← новый Value Object, 6-флаговый контракт статанализа (D-123) по Objective
- [x] `2026-07-17T08:49:14Z` intro `InjectedEntity` ← новый Value Object, структурированное зеркало markdown `## Контекст` для TSK-137
- [x] `2026-07-17T08:49:14Z` intro `computeMrShape` ← продюсер статанализа, потребляется `buildTrackContext` и напрямую тестами (P2)
- [x] `2026-07-17T08:49:14Z` intro `buildTrackContext` ← рендер `## Контекст` + продюсер injectedEntities, подключён в `scaffoldReviewReports`
- [x] `2026-07-17T08:49:14Z` decision worktreePath=опциональный-параметр-scaffoldReviewReports ← тикет называет 4-й параметр `buildTrackContext` как `head`; реальные хунки/коммиты требуют рабочего каталога для git, поэтому реализовано как `worktreePath` (путь, не SHA) — существующий вызов из reviewer.role.ts (вне Target Files этой фазы) не передаёт его и деградирует к старому FILL-плейсхолдеру, регрессии нет
- [x] `2026-07-17T08:49:14Z` decision security-полный-changeset ← вызывающая сторона (`scaffoldReviewReports` через новую приватную `scopeChangesetForTrack`) передаёт в `buildTrackContext` ПОЛНЫЙ changeset MR для трека `security` (NFC-SV-09) и подмножество своего трека для остальных; `buildTrackContext` сам не пересчитывает принадлежность треку
- [x] `2026-07-17T08:49:14Z` decision depManifest-минимальный-список ← набор имён dependency-манифестов в `context-builder.ts` — небольшое самодостаточное подмножество (не импортировано из исчерпывающего многоязычного списка `inbox-review-plan.cmd.ts`) — оставляет inbox-core независимым от cli-слоя; оба списка покрывают `package.json`/lock-файлы, частый случай
- [x] `2026-07-17T08:49:14Z` insight разметка внимания по AI-44 реализована для всех 4 триггеров (newSymbols/isTiny/filterMapChain/nestedLoops) плюс отдельная строка security depth-modulation → §5.3.1, правки спеки не требуются (соответствует уже зафиксированному решению)
- [x] `2026-07-17T08:49:14Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-17T08:49:14Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-17T08:49:14Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-core/context-builder.ts, cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts]; decisions: [worktreePath=опциональный-параметр, security-трек=полный-changeset, depManifest-список=минимальный-самодостаточный]; open: [владелец-P2: в cli/cmd/inbox-review-plan/inbox-review-plan.test.ts существующий сценарий "inline plan" проверяет старый плейсхолдер `<!-- FILL: orchestrator` для `## Контекст` — теперь устарел, так как `--scaffold` всегда передаёт реальный worktreePath и buildTrackContext вливает реальный markdown; P2 должен обновить эту проверку под влитый контент, это в его Target Files/kind=test]

#### P1 — re-run: fix: address audit findings F-01

- [x] `2026-07-17T09:15:00Z` tried F-01 (MAJOR, TASK_ID_DRIFT) — `cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts:4` `@tasks` header не включал TSK-134 → добавлено (append-only, per AX_TASK_ID_INTEGRITY / AX_FILE_HEADER_APPEND_ONLY): `// @tasks: TSK-102, TSK-103, TSK-113, TSK-122, TSK-134`
- [x] `2026-07-17T09:15:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-17T09:15:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-17T09:15:00Z` DONE
      **Handoff →** artifacts: [cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts]; decisions: [F-01=fixed-header-append-only]; open: []

#### P2

- [x] `2026-07-17T08:52:00Z` discovery существующий сценарий "inline plan → single tasks/review.task.md..." в `cli/cmd/inbox-review-plan/inbox-review-plan.test.ts` проверял устаревший FILL-плейсхолдер для `## Контекст` — обновлён под реальный markdown от `buildTrackContext` (P1 Handoff open item)
- [x] `2026-07-17T08:53:00Z` intro `context-builder.test.ts` ← новый файл, unit+contract покрытие `computeMrShape`/`buildTrackContext` (12 BDD-сценариев §4)
- [x] `2026-07-17T08:58:00Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-core/__tests__/context-builder.test.ts'` → pass exit=0
- [x] `2026-07-17T08:58:00Z` ver `npm run test -- 'cli/cmd/inbox-review-plan/inbox-review-plan.test.ts'` → pass exit=0
- [x] `2026-07-17T08:58:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-17T08:58:00Z` ver `gennady lint 2 files` (`<sdd-path> verify` DBC gate) → pass
- 🛑 `2026-07-17T09:00:43Z` BLOCKED: MANDATORY `<sdd-path> verify` gate's `npm run test` (full project suite, auto-discovered) fails — но НЕ из-за файлов этой фазы: 4 сьюта падают, все воспроизводятся изолированно (`node --import tsx --test <file>` на каждом отдельно, без моих тестов рядом) и не имеют кодового пути к `context-builder.ts`/`inbox-review-plan.cmd.ts`: (1) `chat.router.test.ts` :: `ChatRouter — POST /chat/stop` → `HttpServer#start` Port 4206 already in use; (2) `chat-api-client.integration.test.ts` (оба сценария) → `TypeError: Invalid URL` / `Failed to parse URL from /api/mr/.../mutate` — тест-комментарий ожидает `BASE_URL = http://localhost:4174`, а исходник `chat-api-client.ts` объявляет `BASE_URL = ''` (относительный fetch не резолвится в Node/undici без базы) — рассинхрон предшествует этой сессии; (3) `run-mode.test.ts` :: `reviewer graph → real disk materialization...` и `runMrsOnce — real reviewer graph reaches ask-terminal` → после `node_prepare` currentNode остаётся `node_review_fanout` вместо descend в `node_track_review`/`node_ask` — fanout-descend логика `role-engine.ts`, не задета P1/P2 (`materializeReviewScaffold` вызывает `scaffoldReviewReports` БЕЗ `worktreePath`, деградирует безопасно, per P1 Handoff decision). Все 3 модуля (`inbox-api/chat.router`, `inbox-dashboard/chat-api-client`, `serve/run-mode`+`inbox-roles/role-engine`) вне Target Files этой фазы (`AX_PHASE_SCOPE_LOCK`); ticket §5 команды (узкие, по этому тикету) проходят полностью — `context-builder.test.ts` 7/7 + `buildTrackContext` 5/5, `inbox-review-plan.test.ts` весь файл зелёный.
  - 🔗 axiom: AX_VERIFICATION_BEFORE_HANDOFF (Error Ownership addendum) vs AX_PHASE_SCOPE_LOCK
  - 💬 unblock: оператор подтверждает — эти 3 сьюта падают независимо от этого тикета (root cause в `chat-api-client.ts` BASE_URL/относительный fetch, `chat.router.test.ts` порт 4206, `role-engine.ts` fanout-descend) — и либо (a) даёт явное разрешение закрыть Round по узким §5-командам этого тикета (обе цели зелёные), либо (b) заводит отдельные тикеты на 3 найденных дефекта перед закрытием Round
- ✅ `2026-07-17T09:02:31Z` RESOLVED (ref: blocker above, `2026-07-17T09:00:43Z`) ← оператор выбрал вариант (a): Verification-гейт этого тикета — узкие §5-команды (оба `npm run test -- '<file>'` + `npm run type-check` + format/DBC-lint), не полный проектный `npm run test`; 3 найденных дефекта вне Target Files этой фазы, фиксация не открывается здесь
- [x] `2026-07-17T09:02:31Z` discovery `chat.router.test.ts` :: `ChatRouter — POST /chat/stop` падает изолированно (`node --import tsx --test` только на этом файле) → `[HttpServer#start] Port 4206 is already in use`; не связано с `context-builder.ts`/`inbox-review-plan.cmd.ts` — кандидат на отдельный тикет (порт-конфликт теста)
- [x] `2026-07-17T09:02:31Z` discovery `chat-api-client.integration.test.ts` (оба сценария) падает изолированно → `TypeError: Invalid URL` / `Failed to parse URL from /api/mr/.../mutate`; тест-комментарий ожидает `ChatApiClient` `BASE_URL = http://localhost:4174`, исходник `services/agent-inbox/modules/inbox-dashboard/services/chat-api-client.ts` объявляет `BASE_URL = ''` (относительный fetch не резолвится в Node/undici без базы) — рассинхрон предшествует этой сессии, вне Target Files — кандидат на отдельный тикет
- [x] `2026-07-17T09:02:31Z` discovery `run-mode.test.ts` :: `reviewer graph → real disk materialization...` и `runMrsOnce — real reviewer graph reaches ask-terminal` падают изолированно → после `node_prepare` currentNode остаётся `node_review_fanout` вместо descend в `node_track_review`/`node_ask`; `reviewer.role.ts`'s `materializeReviewScaffold` вызывает `scaffoldReviewReports` БЕЗ `worktreePath` (P1 decision, деградирует безопасно) — root cause в fanout-descend `services/agent-inbox/modules/inbox-roles/role-engine.ts`, не в этом тикете — кандидат на отдельный тикет
- [x] `2026-07-17T09:05:00Z` tried `npm run format:check` → fail exit=1 (prettier flagged `context-builder.test.ts`) → fixed via `npx prettier --write` on that file, re-ran clean
- [x] `2026-07-17T09:07:00Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-core/__tests__/context-builder.test.ts'` → pass exit=0
- [x] `2026-07-17T09:07:00Z` ver `npm run test -- 'cli/cmd/inbox-review-plan/inbox-review-plan.test.ts'` → pass exit=0
- [x] `2026-07-17T09:07:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-17T09:07:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-17T09:07:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-core/__tests__/context-builder.test.ts, cli/cmd/inbox-review-plan/inbox-review-plan.test.ts]; decisions: [verification-scope=ticket-§5-only-per-operator, git-fixtures=real-repo-no-mocks-for-buildTrackContext]; open: [chat.router.test.ts: порт 4206 already-in-use — изолированный флейк, requires-own-ticket; chat-api-client.integration.test.ts: BASE_URL='' vs тест ожидает http://localhost:4174 — requires-own-ticket; run-mode.test.ts: role-engine.ts fanout-descend не входит в node_track_review после node_prepare — requires-own-ticket]

#### Round close

- [x] `2026-07-17T09:08:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
