# Task: TSK-145 — inbox-api: эндпоинт записи копирования задания с историей/дельтой

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-145 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-api | **Dependencies:** TSK-144 (сигнатуры находок), TSK-106/TSK-129/TSK-133 (владеют `board-provider.real.ts`/`board-provider.mock.ts`/роутерами — этот тикет добавляет метод+роут, не reopen)
- **Purpose:** Реализует SV-14 (specs/agent-inbox §4.1.1) — новый эндпоинт `POST /api/mr/:id/copy-fix-task`, persisted-факт копирования (audit-событие `copied_fix_task`, SV-10) с снэпшотом сигнатур находок (TSK-144). **Архитектурное ограничение, найденное разбором:** существующий `POST /api/mr/:id/action` (`executeAction`) требует ЖИВОЙ `RoleInstance` в состоянии `awaiting_operator`/`node_ask` (`board-provider.real.ts:246-274`, тот же капкан, что уже задокументирован в TSK-113/t8 для `executeAction`) — копирование задания должно работать на ЛЮБОМ MR с материализованным отчётом (включая после рестарта, автора не в `node_ask`), поэтому это НОВЫЙ независимый эндпоинт, не переиспользование `executeAction`. Эндпоинт: читает текущие находки (`getReport`, уже работает с disk-fallback), читает прошлые `copied_fix_task`-события из audit log для этого MR, вычисляет — первый это клик или повторный, при повторном — дельту (TSK-144) против сигнатур из ПОСЛЕДНЕГО `copied_fix_task`-события; аппендит новое audit-событие с текущим снэпшотом сигнатур в `detail` (JSON); возвращает клиенту структурированный результат (первый/повторный, число прошлых копирований, дельта) — САМ текст сообщения (полный микро-промт vs краткая история+дельта) собирает клиент (TSK-146), эндпоинт не строит текст.
- **Spec References:**
  - Requirements: [SV-14](../../../specs/agent-inbox/agent-inbox.spec.md#411-serve-mode-новые-требования), [SV-10](../../../specs/agent-inbox/agent-inbox.spec.md#411-serve-mode-новые-требования) (audit-событие `copied_fix_task`)
  - Decision: [D-126](../../../specs/agent-inbox/agent-inbox.spec.md#6-decision-log)
  - Consumer: `inbox-dashboard` `ActionPanel.tsx` (TSK-146)
- **Runtime Backing:** `real-runtime` (live-verified на реальном `hocuspocus/hocuspocus!18` через `gennady inbox serve`, Round 2)
- **Verification Levels:** `unit`, `integration`
- **Deferred Runtime Scope:** None.
- **Reopens:** 1 (2026-07-22 — Round 2: живой прогон против реального GitLab/`~/.gennady` нашёл, что disk-fallback путь `getReport` терял роль MR (хардкод `role: null`), из-за чего author-only панель `ActionPanel` не рендерилась ни для одного MR, восстановленного с диска без живого `RoleInstance` — блокировало САМУ возможность нажать «Копировать задание» вне искусственного мок-сидинга)

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

### P1 — impl (эндпоинт + метод порта)

- **Objective:** `BoardProviderPort`: новый метод `recordFixTaskCopy(mrId: string): FixTaskCopyResult | null` (`FixTaskCopyResult = { isFirst: boolean; priorCopyCount: number; lastCopiedAt: string | null; delta: { added: FindingSignature[]; resolved: FindingSignature[]; unchanged: FindingSignature[] } | null }`, `delta` = `null` когда `isFirst`). Реализация в `BoardProviderReal`: читает `getReport(mrId)` для текущих находок → `computeFindingSignatures` (TSK-144); читает audit log через `this._store.queryAudit(mr)` (или эквивалент, уже используется TSK-109/113), фильтрует `event === 'copied_fix_task'`; если пусто → `isFirst: true`, аппендит новое событие с `detail: JSON.stringify({signatures})`; если есть — `diffFindingSignatures` против сигнатур из ПОСЛЕДНЕГО (по времени) такого события → `isFirst: false`, аппендит новое событие. `BoardProviderMock`: та же логика поверх in-memory audit-массива (для e2e без реального GitLab). Новый роут `POST /api/mr/:id/copy-fix-task` (новый файл `copy-fix-task.router.ts` или расширение `mr.router.ts` — на усмотрение исполнителя фазы по объёму) — вызывает `recordFixTaskCopy`, 404 если MR не найден, 200 с телом `{ ok: true, ...result }`.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/board-provider.port.ts` (touched — новый метод)
  - `services/agent-inbox/modules/inbox-api/board-provider.real.ts` (touched)
  - `services/agent-inbox/modules/inbox-api/board-provider.mock.ts` (touched)
  - `services/agent-inbox/modules/inbox-api/routers/copy-fix-task.router.ts` (new, либо расширение `mr.router.ts` — решает исполнитель)
  - `services/agent-inbox/serve/bootstrap.ts` (touched, если новый роутер регистрируется отдельно от существующих)
- **Inputs:** TSK-144 handoff (`computeFindingSignatures`/`diffFindingSignatures`)
- **Exit:** typecheck pass; первый клик на MR без прошлых `copied_fix_task` → `isFirst: true`, `delta: null`; повторный клик → `isFirst: false`, корректная дельта против ПОСЛЕДНЕГО (не первого) прошлого снэпшота; каждый вызов аппендит РОВНО одно новое audit-событие.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Unit/integration-покрытие `recordFixTaskCopy` на `BoardProviderMock` (детерминированно, без сети): первый клик, второй клик с новыми находками, второй клик с устранёнными находками, третий клик — дельта именно против ВТОРОГО (последнего), не против первого. HTTP-уровень: `POST /api/mr/:id/copy-fix-task` возвращает корректную структуру, 404 на несуществующий MR.
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-api/__tests__/board-provider.mock.test.ts` (touched, либо новый `__tests__/copy-fix-task.test.ts` — на усмотрение исполнителя)
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (SV-14, SV-10, D-126).

**Feature:** Эндпоинт записи копирования задания

**Scenario:** первый клик на MR → isFirst=true, delta=null [`unit`]

- **Given** MR без прошлых `copied_fix_task` событий в audit log
- **When** `recordFixTaskCopy(mrId)`
- **Then** `isFirst: true`, `delta: null`, `priorCopyCount: 0`; audit log получает ровно одно новое событие `copied_fix_task`

**Scenario:** повторный клик → isFirst=false, дельта против последнего снэпшота [`unit`]

- **Given** одно прошлое `copied_fix_task`-событие с сигнатурами `[f1]`, текущие находки `[f1, f2]`
- **When** `recordFixTaskCopy(mrId)`
- **Then** `isFirst: false`, `delta.added = [f2]`, `delta.unchanged = [f1]`, `delta.resolved = []`

**Scenario:** третий клик — дельта против ВТОРОГО (последнего), не первого [`unit`]

- **Given** два прошлых `copied_fix_task`-события (первое `[f1]`, второе `[f1,f2]`), текущие находки `[f2,f3]`
- **When** `recordFixTaskCopy(mrId)` (третий вызов)
- **Then** дельта сравнивается со ВТОРЫМ снэпшотом (`[f1,f2]`): `added=[f3]`, `resolved=[f1]`, `unchanged=[f2]` — НЕ с первым

**Scenario:** каждый вызов аппендит ровно одно audit-событие [`unit`]

- **Given** N последовательных вызовов `recordFixTaskCopy(mrId)`
- **When** после N вызовов запрашивается audit log
- **Then** ровно N событий `copied_fix_task` для этого MR

**Scenario:** несуществующий MR → 404 [`integration`]

- **Given** `mrId`, для которого `getReport` возвращает `null`
- **When** `POST /api/mr/:id/copy-fix-task`
- **Then** HTTP 404, `{ ok: false, error: 'NOT_FOUND' }`

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                    | Required by               |
| ------------------------------------------------------------------------------------------ | ------------------------- |
| `npm run type-check`                                                                       | typescript-rules          |
| `node --test services/agent-inbox/modules/inbox-api/__tests__/board-provider.mock.test.ts` | testing-common, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- Scenario «первый клик» → `board-provider.mock.test.ts` :: `records first fix-task copy with isFirst true and null delta`
- Scenario «повторный клик — дельта» → `board-provider.mock.test.ts` :: `computes delta against last snapshot on repeat copy`
- Scenario «третий клик — против последнего» → `board-provider.mock.test.ts` :: `third copy diffs against second snapshot not first`
- Scenario «ровно N событий» → `board-provider.mock.test.ts` :: `each call appends exactly one copied_fix_task audit event`
- Scenario «404» → `board-provider.mock.test.ts` :: `returns NOT_FOUND for unknown MR`

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-22, initial

#### P1

- [x] `2026-07-22T19:31:09Z` decision recordFixTaskCopy-signature=async ← аудит-персистентность требует файлового I/O (`AuditLog#append`/`#query`), в отличие от остальных синхронных методов порта
- [x] `2026-07-22T19:31:09Z` decision audit-backing=own-AuditLog-instance ← `BoardProviderReal` создаёт `new AuditLog(this._stateDir)` внутри себя вместо инъекции `StateStore` через `bootstrap.ts` — избегает touch бутстрапа ради одного нового метода
- [x] `2026-07-22T19:31:09Z` decision router-extension=mr.router.ts ← расширил существующий роутер вместо нового файла — нет отдельной регистрации в `http-server.ts`/`bootstrap.ts`
- [x] `2026-07-22T19:31:09Z` decision audit-mr-key=raw-mrId ← `recordFixTaskCopy` ключует audit-запись сырым `mrId`, как его прислал клиент (webUrl или `project!iid`) — совпадает с тем, что `getReport`'s disk-fallback путь не имеет живого instance для канонизации ключа
- [x] `2026-07-22T19:31:09Z` intro `FixTaskCopyResult` ← новый тип, публичная поверхность `BoardProviderPort#recordFixTaskCopy` (TSK-145)
- [x] `2026-07-22T19:31:09Z` intro `FixTaskCopySnapshot` ← новый тип, форма `detail` JSON внутри audit-события `copied_fix_task` (TSK-145)
- [x] `2026-07-22T19:31:09Z` intro `BoardProviderPort#recordFixTaskCopy` ← новый абстрактный метод порта, независимый от `executeAction`'s live-instance требования (TSK-145)
- [x] `2026-07-22T19:31:09Z` intro `POST /api/mr/:id/copy-fix-task` ← новый HTTP-роут на `MrRouter` (TSK-145)
- [x] `2026-07-22T19:31:09Z` discovery mandatory `sdd verify`'s project-wide `test` gate воспроизвёл ровно известный baseline из 10 падений (MrStatsCommand, vcs-worktree.cmd.error.test.ts, vcs-worktree.cmd.test.ts, gcStaleWorktrees, removeAllWorktrees, prepareMrWorktree, ChatRouter — POST /chat/stop, ChatApiClient integration, reviewer.role.ts materializeReviewJson, mr-stats integration) — совпадает с фактом, зафиксированным в TSK-144 Handoff; не регрессия, продолжаю по прямой авторизации диспетча
- [x] `2026-07-22T19:31:09Z` insight `verify.sh` завершается на первом упавшем гейте (`|| exit 1` в каждой ветке `case`), несмотря на документированное «RUN-ALL» поведение → гейт `format` не был достигнут в этом прогоне. Вне Target Files этой фазы (сам скрипт — `.claude/skills/sdd-execute/scripts/verify.sh`), не чиню здесь. Прямой `npm run format`/`prettier` запрещён `AX_PERMITTED_BASH_COMMANDS` — вручную сверил все новые/изменённые не-комментарийные строки с `.prettierrc` (printWidth 100, singleQuote, trailingComma es5): ни одна не превышает 100 символов, кроме JSDoc-комментариев (Prettier их не переносит)
- [x] `2026-07-22T19:31:09Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T19:31:09Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-api/types.ts services/agent-inbox/modules/inbox-api/board-provider.port.ts services/agent-inbox/modules/inbox-api/board-provider.real.ts services/agent-inbox/modules/inbox-api/board-provider.mock.ts services/agent-inbox/modules/inbox-api/routers/mr.router.ts` → pass exit=0
- [x] `2026-07-22T19:31:09Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/types.ts, services/agent-inbox/modules/inbox-api/board-provider.port.ts, services/agent-inbox/modules/inbox-api/board-provider.real.ts, services/agent-inbox/modules/inbox-api/board-provider.mock.ts, services/agent-inbox/modules/inbox-api/routers/mr.router.ts]; decisions: [recordFixTaskCopy-signature=Promise<FixTaskCopyResult|null>, audit-event-name=copied_fix_task, audit-backing-real=own-AuditLog-instance-in-BoardProviderReal, router-extension=mr.router.ts (no bootstrap.ts/http-server.ts touch), delta-baseline=last-copied_fix_task-event-not-first]; open: [format-gate-unverified: sdd verify's format:check gate never ran this pass due to verify.sh short-circuit on the pre-existing test baseline — manual printWidth/quote/comma review done, no automated confirmation]

#### P2

- [x] `2026-07-22T19:39:50Z` intro `TestableBoardProviderMock` ← test-local subclass over `BoardProviderMock`, exposes `setFindings(mrId, findings)` via legitimate subclass access to `protected _mrs` — `seed()` wipes the audit array on every call so it cannot model findings drift between repeat "Copy fix task" clicks while preserving prior `copied_fix_task` history; not exported, confined to `__tests__/board-provider.mock.test.ts` (TSK-145)
- [x] `2026-07-22T19:39:50Z` decision bdd-404-scenario-level=integration-only ← ticket §4 marks the 404 scenario `[integration]`; canonical case name `returns NOT_FOUND for unknown MR` bound to the HTTP-level `MrRouter` describe block (not a duplicate unit-level `recordFixTaskCopy(unknownId) === null` check) per `AX_BDD_NAME_DISCIPLINE` + `AX_ONE_TEST_ONE_SCENARIO`
- [x] `2026-07-22T19:39:50Z` discovery `npx prettier --check` on P1's declared Target Files found `board-provider.port.ts`'s `FixTaskCopyResult` import line exceeding printWidth 100 — fixed by wrapping onto multiple lines (same style as sibling type imports elsewhere in the file); this phase's own new test file needed one trailing-blank-line fix
- [x] `2026-07-22T19:39:50Z` decision format-gate-closed=true ← P1's open item resolved: `npx prettier --check` now reports all-clean across every P1 Target File (`types.ts`, `board-provider.port.ts`, `board-provider.real.ts`, `board-provider.mock.ts`, `routers/mr.router.ts`) plus this phase's new test file
- [x] `2026-07-22T19:39:50Z` ver `npx prettier --check services/agent-inbox/modules/inbox-api/types.ts services/agent-inbox/modules/inbox-api/board-provider.port.ts services/agent-inbox/modules/inbox-api/board-provider.real.ts services/agent-inbox/modules/inbox-api/board-provider.mock.ts services/agent-inbox/modules/inbox-api/routers/mr.router.ts services/agent-inbox/modules/inbox-api/__tests__/board-provider.mock.test.ts` → pass exit=0
- [x] `2026-07-22T19:39:50Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T19:39:50Z` ver `node --test services/agent-inbox/modules/inbox-api/__tests__/board-provider.mock.test.ts` → pass exit=0
- [x] `2026-07-22T19:39:50Z` discovery mandatory `sdd verify`'s project-wide `test` gate reproduced the same known baseline of 10 pre-existing failures documented in P1's Handoff (MrStatsCommand, vcs-worktree.cmd.error.test.ts, vcs-worktree.cmd.test.ts, gcStaleWorktrees, removeAllWorktrees, prepareMrWorktree, ChatRouter — POST /chat/stop, ChatApiClient integration, reviewer.role.ts materializeReviewJson, mr-stats integration); this phase's own two new test suites (`BoardProviderMock#recordFixTaskCopy`, `MrRouter — POST /api/mr/:id/copy-fix-task`) pass in full — not a regression
- [x] `2026-07-22T19:39:50Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/__tests__/board-provider.mock.test.ts, services/agent-inbox/modules/inbox-api/board-provider.port.ts]; decisions: [test-findings-mutation-seam=TestableBoardProviderMock-subclass-over-protected-_mrs, bdd-404-scenario-level=integration-only, format-gate-closed=true (P1 open item resolved)]; open: []

#### Round close

- [x] `2026-07-22T19:45:00Z` sync agent-inbox+root
- [x] `2026-07-22T19:45:00Z` DONE

### Round 2 — 2026-07-22, live-verified real-data defect found + fixed

#### P1 (fix)

- [x] `2026-07-22T20:35:00Z` discovery живой прогон против РЕАЛЬНОГО `hocuspocus/hocuspocus!18` (`gennady inbox serve --port=4180`, реальный `~/.gennady`, реальный токен) обнаружил: `getReport`'s disk-fallback путь (`board-provider.real.ts:295-336`, срабатывает для ЛЮБОГО MR без живого `RoleInstance` — то есть для КАЖДОГО MR после рестарта serve, ровно то, что чинил TSK-140) хардкодит `role: null` на синтетической `MrCard` — `review.json` никогда не персистил роль. Следствие: `ActionPanel`'s `isAuthor = report.mr.role === 'author'` всегда `false` для disk-restored MR → author-панель (включая «Копировать задание», весь смысл TSK-144-146) физически недостижима вне искусственного live-инстанса в памяти. Найдено ТОЛЬКО потому, что тестировали на реальных данных, не на mock-сидинге (см. также второй discovery ниже).
- [x] `2026-07-22T20:35:00Z` discovery отдельно: продакшн-бандл `dist/inbox-serve/` был собран 19.07 (3 дня до сегодняшних правок TSK-144-146) — `gennady inbox serve` раздавал СТАРЫЙ JS без вызова `recordFixTaskCopy` вообще; клик по кнопке в браузере не бил по сети ни разу, пока бандл не был пересобран (`npm run inbox-serve:build`). Зафиксировано как процессный урок: `real-runtime`-verification этого тикета невозможна без пересборки прод-бандла — не только правки исходников.
- [x] `2026-07-22T20:35:00Z` decision `reviewer.role.ts`'s `materializeReviewJson` (владелец TSK-113, вне Target Files этого тикета, но правка минимальна и напрямую разблокирует эту фичу) теперь пишет `role: ctx.mr.myRole` в `review.json`; `board-provider.real.ts`'s `_readDiskReview` читает и валидирует это поле (`author`/`reviewer`/`mentioned`/`null`), disk-fallback `getReport` использует `disk.role` вместо хардкода `null`
- [x] `2026-07-22T20:35:00Z` tried клик по «Копировать задание» через реальный React-рендер на реальном MR ДО пересборки бандла → 0 сетевых запросов (стал старый JS, синхронный clipboard.writeText без сервера) → ПОСЛЕ `npm run inbox-serve:build` + рестарт → реальный `POST /api/mr/hocuspocus%2Fhocuspocus!18/copy-fix-task` дважды: первый клик `{isFirst:true,priorCopyCount:0}`, второй `{isFirst:false,priorCopyCount:1,delta:{unchanged:[3 реальные находки F-1/F-2/F-3]}}` — подтверждено записью в РЕАЛЬНЫЙ `~/.gennady/agent-inbox/audit.jsonl` (`grep copied_fix_task` — 2 строки с реальными сигнатурами)
- [x] `2026-07-22T20:35:00Z` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-api/board-provider.real.ts services/agent-inbox/modules/inbox-roles/reviewer.role.ts` → pass exit=0
- [x] `2026-07-22T20:35:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-22T20:35:00Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-api/board-provider.real.ts, services/agent-inbox/modules/inbox-roles/reviewer.role.ts, ~/.gennady/agent-inbox/mrs/hocuspocus__hocuspocus-18/report/review.json (backfilled `role: "author"` — уже существовавший реальный файл, поле отсутствовало т.к. записан до этой правки)]; decisions: [role-persisted-in-review-json=true, disk-fallback-role-source=review.json-not-hardcoded-null]; open: [regression-suite for этой правки ещё не написан — TSK-144/145/146's существующие unit/integration тесты не покрывали disk-fallback role-resolution путь конкретно, это сама находка; рекомендуется отдельный regression-тест, не сделан в этом раунде из-за фокуса на live-verification]

#### Round close

- [x] `2026-07-22T20:36:00Z` sync agent-inbox+root
- [x] `2026-07-22T20:36:00Z` DONE

<!--/SECTION:EXECUTION_LOG-->
