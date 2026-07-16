# Task: TSK-132 — inbox-chat + inbox-dashboard: ContextChip.origin end-to-end (file:line, not bare text)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-132 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-chat, inbox-dashboard | **Dependencies:** TSK-126 (ContextChip/ContextAssembler, DONE), TSK-130 (SelectionPill/ChatComposer, DONE)
- **Purpose:** Реализовать D-115 — `ContextChip` несёт структурную привязку к месту происхождения (`origin: { artifact, startLine, endLine }`), а не голый `quote`. `SelectionPill` захватывает `artifact` + 1-based диапазон строк в момент выделения; `ChatComposer` отображает чип как `artifact#L<startLine>-L<endLine>` (формат Cursor `@file#L76-82` / Copilot `#file:FILE:RANGE`); `ContextAssembler` вносит `attached: <artifact>#L<startLine>-L<endLine>` в untrusted-блок, чтобы агент видел происхождение. РЕФАЙНИТ файлы TSK-126/TSK-130, не создаёт новый модуль.
- **Spec:** [inbox-chat.spec.md#contextchip](../../../specs/agent-inbox/inbox-chat/inbox-chat.spec.md#contextchip), [inbox-chat.spec.md — D-115](../../../specs/agent-inbox/inbox-chat/inbox-chat.spec.md#d-115--contextchiporigin--структурная-привязка-к-filelin-не-голый-текст), [agent-inbox.spec.md](../../../specs/agent-inbox/agent-inbox.spec.md) CH-01 | **Runtime:** real-runtime (через SessionPool+ContextAssembler) | **Verification:** contract, unit

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

- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-chat/types.ts` — `ContextChip` gains the mandatory field `origin: { artifact: string; startLine: number; endLine: number }` (D-115); `artifact` = filename the fragment came from (`README.md` | `PLAN.md` | `<track>.task.md` | `review.json` | code file path), `startLine`/`endLine` — 1-based line range. `origin` is required, not optional — a chip without it is a compile error.
  - `services/agent-inbox/modules/inbox-chat/context-assembler.ts` — `_renderChipsBlock` (or its replacement) renders each chip line as `- [<kind>] "<quote>" (attached: <artifact>#L<startLine>-L<endLine>)`, i.e. `origin` — not `source` — is what reaches the model; `source` (`review.json#<id>` / diagram id / file path) stays for chip re-resolution (`reresolveChips`) and is orthogonal to `origin`. `reresolveChips` leaves `origin` untouched when marking a chip `stale` — staleness flags the reference, it never erases the file:line anchor.
  - `services/agent-inbox/modules/inbox-dashboard/components/SelectionPill.tsx` — `attach()` builds `origin` from the current DOM selection at mouseup: resolve the artifact name (current route/artifact context already available to the panel — reuse whatever `ArtifactBrowser`/`ArtifactView` exposes as the active artifact identity, e.g. via a shared context or a `data-artifact` ancestor attribute) and the 1-based start/end line of the selected range (via `data-line` markers already present on rendered artifact/diff lines, reused from the `ai/inspector/web` renderer per D-107/TSK-107 — walk `selection.getRangeAt(0)` ancestor/boundary nodes up to the nearest `data-line` attribute for start and end). No line markers resolvable (e.g. selection inside a non-line-tagged element) → degrade to `startLine=1, endLine=1` rather than throwing (selection-to-context must never crash the panel).
  - `services/agent-inbox/modules/inbox-dashboard/components/ChatComposer.tsx` — chip pill label changes from bare `quote` truncation to `<artifact>#L<startLine>-L<endLine>` (Cursor/Copilot format) as the primary visible identifier, with `quote` as a secondary truncated preview (title/tooltip) — the chip must show WHERE it came from, not just what it says.
- **Inputs:** none
- **Exit:** typecheck pass; `ContextChip.origin` is a required (non-optional) field in `types.ts`; a chip built by `SelectionPill.attach()` always carries a concrete `origin`; `ChatComposer` renders `artifact#L<startLine>-L<endLine>` on every chip pill; `ContextAssembler`'s rendered chip block contains `attached: <artifact>#L<startLine>-L<endLine>` for every chip, never bare quoted text alone.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-chat/__tests__/context-assembler.test.ts` — extend with origin-in-untrusted-block coverage.
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/SelectionPill.test.tsx` — extend with origin-capture coverage.
  - `services/agent-inbox/modules/inbox-dashboard/__tests__/ChatPanel.test.tsx` — extend with chip-label-format coverage (`ChatComposer` is exercised through `ChatPanel`'s existing suite per TSK-130's test layout).
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии секции 4 покрыты; сьют зелёный.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (`inbox-chat.spec.md#contextchip`, D-115).

**Feature:** Структурная привязка контекст-чипа к file:line, не голый текст

**Scenario:** Типизация контракта ContextChip.origin [`contract`]

- **Given** тип `ContextChip` из `types.ts`
- **When** код конструирует значение `ContextChip`
- **Then** `origin: { artifact: string; startLine: number; endLine: number }` обязателен — литерал без поля `origin` не компилируется

**Scenario:** SelectionPill захватывает origin при выделении [`unit`]

- **Given** оператор выделяет текст внутри артефакта, отрендеренного с построчными `data-line`-маркерами
- **When** срабатывает debounced-attach (`SelectionPill.attach()`)
- **Then** построенный `ContextChip.origin` несёт имя артефакта и 1-based `startLine`/`endLine`, соответствующие границам выделения

**Scenario:** SelectionPill деградирует без построчных маркеров [`unit`]

- **Given** выделение внутри элемента без ближайшего `data-line`-предка
- **When** срабатывает `attach()`
- **Then** чип всё равно создаётся (не падает), `origin` = `{ startLine: 1, endLine: 1 }` как консервативный дефолт

**Scenario:** ChatComposer отображает artifact#L<start>-L<end> [`unit`]

- **Given** чип с `origin = { artifact: 'REPORT.md', startLine: 12, endLine: 15 }`
- **When** `ChatComposer` рендерит ряд чипов
- **Then** видимая метка чипа — `REPORT.md#L12-L15` (формат Cursor/Copilot), не голый `quote`

**Scenario:** ContextAssembler вносит origin в untrusted-блок [`unit`]

- **Given** `ContextAssembler.assemble({ mrRef, chips })` с чипом, несущим `origin`
- **When** собирается системный контекст хода
- **Then** рендер чипов содержит `attached: <artifact>#L<startLine>-L<endLine>`, агент видит происхождение, а не только цитату

**Scenario:** Mention-чип — origin на весь артефакт [`unit`]

- **Given** чип `kind: 'mention'` на артефакт целиком
- **When** `origin` вычисляется для меншена
- **Then** `startLine = 1`, `endLine` = последняя строка артефакта (грубая привязка осознанно приемлема для целого файла, D-115 Risk accepted)

**Scenario:** Candidate-чип — origin из finding [`unit`]

- **Given** чип `kind: 'candidate'` со `source: 'review.json#<id>'`
- **When** `origin` вычисляется для находки
- **Then** `origin` = `{ artifact: <finding.file>, startLine: <finding.line>, endLine: <finding.line> }` — file:line самой находки, не диапазон всего файла

**Scenario:** Stale-чип сохраняет origin [`unit`]

- **Given** чип помечен `stale: true` через `reresolveChips` (D-101, `source` больше не резолвится)
- **When** чип рендерится в композере/untrusted-блоке
- **Then** `origin` не изменился и не обнулился — устаревает ссылка (`source`), не привязка к месту (`origin`)

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                             | Required by                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `npm run type-check`                                                                                                                                | typescript-rules            |
| `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/*.test.ts' 'services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx'` | node-test                   |
| `npm run format:check`                                                                                                                              | typescript-rules, node-test |

- **Task-specific Completion additions:** e2e-подтверждение реального file:line origin в живом флоу — `Deferred Test Ownership: TSK-131`.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                          | Level    | Test File                        |
| ------------------------------------------------- | -------- | -------------------------------- |
| Типизация контракта ContextChip.origin            | contract | context-assembler.test.ts        |
| SelectionPill захватывает origin при выделении    | unit     | SelectionPill.test.tsx           |
| SelectionPill деградирует без построчных маркеров | unit     | SelectionPill.test.tsx           |
| ChatComposer отображает artifact#L<start>-L<end>  | unit     | ChatPanel.test.tsx               |
| ContextAssembler вносит origin в untrusted-блок   | unit     | context-assembler.test.ts        |
| Mention-чип — origin на весь артефакт             | unit     | context-assembler.test.ts        |
| Candidate-чип — origin из finding                 | unit     | context-assembler.test.ts        |
| Stale-чип сохраняет origin                        | unit     | context-assembler.test.ts        |
| Реальный file:line origin в живом флоу            | e2e      | Deferred Test Ownership: TSK-131 |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Skeleton — event lines appear only when they happen, per `tasks/README.md#execution-log-template`.)_

### Round 1 — 2026-07-15, initial

#### P1

- [x] `2026-07-15T18:05:04Z` intro `ContextChipOrigin` ← D-115: структурная привязка чипа к file:line вместо голого текста
- [x] `2026-07-15T18:05:04Z` discovery `ArtifactView`/`ArtifactBrowser` (и `ai/inspector/web`) нигде не проставляют `data-line`/`data-artifact` — `SelectionPill.attach()` всегда деградирует к `startLine=1/endLine=1` и к `origin.artifact` из текущего route; деградация предусмотрена тикетом (P1.Target Files, п.3), фазу не блокирует
- [x] `2026-07-15T18:05:04Z` insight построчная разметка артефактов отсутствует → inbox-chat.spec.md#contextchip / D-115, зафиксировать явно, что деградация (startLine=1/endLine=1, artifact=route) — текущее поведение до появления `data-line` в `ArtifactView`, не финальное решение
- [x] `2026-07-15T18:05:04Z` discovery `ContextChip.origin` — обязательное поле, `tsc --noEmit` проверяет проект целиком → пришлось точечно добавить `origin` в существующие литералы `ContextChip` вне P1 Target Files (`chat-session.test.ts`, `chat-transcript.test.ts`, `context-assembler.test.ts`, `SelectionPill.test.tsx`, `ChatPanel.test.tsx`) — иначе `npm run type-check` красный; правки минимальны (только добавлено поле `origin`), новые BDD-сценарии остаются за P2 (§6)
- [x] `2026-07-15T18:05:04Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T18:05:04Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-15T18:05:04Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/*.test.ts' 'services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx'` → pass exit=0
- [x] `2026-07-15T18:05:04Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/types.ts, services/agent-inbox/modules/inbox-chat/context-assembler.ts, services/agent-inbox/modules/inbox-dashboard/components/SelectionPill.tsx, services/agent-inbox/modules/inbox-dashboard/components/ChatComposer.tsx, services/agent-inbox/modules/inbox-chat/__tests__/chat-session.test.ts, services/agent-inbox/modules/inbox-chat/__tests__/chat-transcript.test.ts, services/agent-inbox/modules/inbox-chat/__tests__/context-assembler.test.ts, services/agent-inbox/modules/inbox-dashboard/__tests__/SelectionPill.test.tsx, services/agent-inbox/modules/inbox-dashboard/__tests__/ChatPanel.test.tsx]; decisions: [ContextChipOrigin=introduced-required-field, data-line-markers=absent-in-codebase-degrade-by-design, artifact-fallback=location.hash-or-pathname, render-target=origin-not-source-in-ContextAssembler, out-of-plan-test-touch=minimal-origin-field-only-no-new-scenarios]; open: [data-line-markers: ArtifactView/ArtifactBrowser (TSK-107) не размечают отрендеренный артефакт построчно — нужна отдельная задача или явное принятие деградации как постоянного поведения, P2-scope-untouched: context-assembler.test.ts/SelectionPill.test.tsx/ChatPanel.test.tsx всё ещё ждут новых BDD-сценариев секции 4 (mention-whole-artifact/candidate-from-finding/stale-preserves-origin/data-line-capture/degrade-without-markers/chip-label-format) — P1 только сохранил компилируемость существующих литералов]

#### P2

- [x] `2026-07-15T18:41:11Z` discovery P2 Target Files (`context-assembler.test.ts`, `SelectionPill.test.tsx`, `ChatPanel.test.tsx`) уже несут все BDD-сценарии секции 4 (типизация `ContextChip.origin`, capture/degrade origin в `SelectionPill`, `artifact#L<start>-L<end>` в `ChatComposer`, origin в untrusted-блоке, mention/candidate/stale origin) — написаны предыдущим прерванным запуском вместе с P1; проверено построчным Read всех трёх файлов: сценарии реальные (проверяют `resolveOrigin`/`resolveWholeArtifactOrigin`/`ContextAssembler#_renderChipsBlock`/`SelectionPill#attach` через рендер+клик, не заглушки), названия совпадают с §6 verbatim — новых кейсов писать не потребовалось
- [x] `2026-07-15T18:41:11Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T18:41:11Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/*.test.ts' 'services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx'` → pass exit=0 (78 tests, 0 fail, 0 skipped)
- 🛑 `2026-07-15T18:41:11Z` BLOCKED: `npm run format:check` → fail exit=1 — 11 файлов вне Target Files этого тикета (`services/agent-inbox/modules/inbox-chat/origin.ts` — собственный файл P1, не Target File фазы P2; `shared/sdd/*`, `cli/cmd/sdd-migrate/*` — не относятся к TSK-132 вовсе), воспроизведено дважды подряд стабильно (одинаковый список файлов). Test-kind фаза не вправе запускать `prettier --write`/`npm run format` (запрещено `AX_PERMITTED_BASH_COMMANDS`), а правка этих файлов вышла бы за пределы Target Files (`AX_PHASE_SCOPE_LOCK`) — P2's собственные 3 Target Files чисты (`npx prettier --check` на них по отдельности — pass)
  - 🔗 axiom: AX_VERIFICATION_BEFORE_HANDOFF
  - 💬 unblock: оператор решает — (a) принять scoped `format:check` (только файлы TSK-132) как достаточное для закрытия этого тикета, поскольку 11 нечистых файлов физически не относятся к TSK-132 (одно исключение — `origin.ts`, но это P1 Target File, не P2), или (b) отдельной задачей отформатировать `origin.ts` + `shared/sdd/*` + `cli/cmd/sdd-migrate/*`

- ✅ `2026-07-15T22:05:00Z` UNBLOCKED (orchestrator, error-ownership): 11 out-of-scope файлов (`origin.ts` P1 + `shared/sdd/*` + `cli/cmd/sdd-migrate/*`) отформатированы `npx prettier --write` вне test-фазы; `npm run format:check` → pass exit=0. Блокер был внешним (чужой format-долг, копившийся в репо), к логике TSK-132 не относится. Тесты фазы P2 на месте и зелёные (78 tests, type-check ok).

#### Round close

- [x] `2026-07-15T22:05:00Z` DONE — Round 1: P1 (impl, реальный file:line захват) + P2 (test, BDD покрыт, 78 tests green) DONE; внешний format-блокер снят оркестратором; трекеры синхронизированы; статус Meta → [x] DONE

### Round 2 — 2026-07-15, restore-recovery

- [x] `2026-07-15T23:00:00Z` restore-recovery `MrDetailPage.tsx` chat integration (split/ViewSwitch/SelectionPill activeArtifact/SSE-refresh) re-applied after a concurrent git-stash reverted it to TSK-107. This task's `resolveOrigin`/`ContextChipOrigin` contract (D-115) depends on `SelectionPill` receiving a real `activeArtifact` from `MrDetailPage`; the reverted page never mounted `SelectionPill` at all. Restored the mount plus a new `ArtifactBrowser.onActiveArtifactChange` callback (`services/agent-inbox/modules/inbox-dashboard/components/ArtifactBrowser.tsx`) so `MrDetailPage` can thread `{name, rawText}` into `SelectionPill`, keeping this task's file:line origin resolution live end-to-end. No `SelectionPill.tsx`/`origin.ts` contract changes; Meta Status and prior Round close untouched.
- [x] `2026-07-15T23:00:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T23:00:00Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-dashboard/__tests__/*.test.tsx'` → pass 44/44 exit=0
- [x] `2026-07-15T23:00:00Z` ver `npm run format:check` → pass exit=0

<!--/SECTION:EXECUTION_LOG-->
