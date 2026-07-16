# Task: TSK-127 — inbox-chat: MutationApplier (revision-CAS + snapshot/undo)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-127 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-chat | **Dependencies:** TSK-126 (types.ts, errors.ts)
- **Purpose:** `MutationApplier` — превью до→после с provenance-тегом на понижение/удаление, источник которого MR-текст (CH-09, D-98); `apply()` снапшотит `review.json` в `reports/<mr>/snapshots/` ДО мутации (D-94), затем compare-and-swap запись по монотонной ревизии (D-99): совпала → пишет + `chat_mutation` в audit (CH-08); устарела → `{ ok:false, error:'STALE_REVISION' }` без модификации файла; `undo()` восстанавливает `review.json` из снапшота, сам undo тоже аудируется. Применяется ТОЛЬКО по явному вызову (никогда во время стрима, CH-11 — урок «streaming committed before user said yes»).
- **Spec:** [inbox-chat.spec.md](../../../specs/agent-inbox/inbox-chat/inbox-chat.spec.md#mutationapplier), [agent-inbox.spec.md](../../../specs/agent-inbox/agent-inbox.spec.md) §5.2, CH-05, CH-08…10, D-93…D-94, D-98…D-99 | **Runtime:** real-runtime | **Verification:** contract, unit, integration

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
  - `services/agent-inbox/modules/inbox-chat/mutation-applier.ts` — `MutationApplier`: `preview(proposal)` → диф до→после; понижение/удаление с источником в MR-тексте несёт видимый `provenance: { groundedInMrText: true, quote }` (CH-09, D-98) — виден ДО клика Apply; `apply(proposal, { mrRef, revision })` → создаёт `ReviewSnapshot` в `reports/<mr>/snapshots/<id>.json` ДО мутации (D-94), затем CAS-запись `review.json` по `revision` (D-99): совпала → атомарная запись + `chat_mutation` audit-событие (`op`/`target`/`before`/`after`, CH-08); не совпала → `review.json` НЕ модифицируется, `{ ok:false, error:'STALE_REVISION' }`; `undo({ mrRef, snapshotId })` → восстанавливает `review.json` из снапшота, аудирует сам undo отдельной записью (переиспользует `AuditLog` из `inbox-core`, `_readDiskReview`/`getReport` паттерн из `BoardProviderReal`); `proposal.op` вне `{edit,remove,set-severity}` (v1) отклоняется до превью (не проходит схему resultSchema) — ход помечается text-only.
- **Inputs:** P1 handoff (TSK-126: `types.ts` — `MutationProposal`, `ReviewSnapshot`; `errors.ts` — `STALE_REVISION`)
- **Exit:** typecheck pass; ни одно применение необратимо (снапшот существует для каждой применённой мутации); CAS-конфликт не модифицирует `review.json`.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-chat/__tests__/mutation-applier.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии секции 4 покрыты; сьют зелёный.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (`inbox-chat.spec.md#mutationapplier`).

**Feature:** Структурные мутации review.json с превью, CAS и undo

**Scenario:** Типизация контракта MutationApplier [`contract`]

- **Given** публичные операции `preview`/`apply`/`undo` и типы `MutationProposal`/`ReviewSnapshot` из `types.ts` (TSK-126)
- **When** вызывающий код использует их сигнатуры
- **Then** `proposal.op` типизирован как закрытое union `'edit'|'remove'|'set-severity'`, отклоняет иные значения на этапе компиляции; `apply()` возвращает дискриминированное `{ ok: true, snapshot: string } | { ok: false, error: 'STALE_REVISION' }`, оба варианта различимы типом

**Scenario:** Успешный apply — снапшот + CAS + аудит [`integration`]

- **Given** валидный `proposal` и совпадающая `revision`
- **When** `apply(proposal, { mrRef, revision })` вызывается
- **Then** снапшот записан ДО мутации, `review.json` обновлён атомарно, `chat_mutation` audit-событие содержит `op`/`target`/`before`/`after` (CH-08)

**Scenario:** CAS-конфликт — устаревшая ревизия [`integration`]

- **Given** `revision` устарела относительно текущего `review.json`
- **When** `apply()` вызывается
- **Then** `review.json` НЕ модифицируется, возвращается `{ ok:false, error:'STALE_REVISION' }` (D-99)

**Scenario:** Undo восстанавливает снапшот [`integration`]

- **Given** ранее применённая мутация со снапшотом
- **When** `undo({ mrRef, snapshotId })` вызывается
- **Then** `review.json` совпадает с содержимым снапшота; сам undo записан в audit отдельной записью (CH-10)

**Scenario:** Provenance-тег на понижение из MR-текста [`unit`]

- **Given** `proposal` — понижение/удаление, чей источник — MR-текст
- **When** `preview(proposal)` вызывается
- **Then** результат несёт `provenance: { groundedInMrText: true, quote }`, видимый ДО клика Apply (CH-09, D-98)

**Scenario:** Невалидный op отклоняется до превью [`unit`]

- **Given** `proposal.op` вне `{edit,remove,set-severity}`
- **When** `preview()`/`apply()` вызывается
- **Then** отклонён до применения, ход помечается text-only

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                         | Required by                 |
| ------------------------------------------------------------------------------- | --------------------------- |
| `npm run type-check`                                                            | typescript-rules            |
| `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/*.test.ts'` | node-test                   |
| `npm run format:check`                                                          | typescript-rules, node-test |

- **Task-specific Completion additions:** none beyond project baseline.

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                                 | Level       | Test File                |
| ---------------------------------------- | ----------- | ------------------------ |
| Типизация контракта MutationApplier      | contract    | mutation-applier.test.ts |
| Успешный apply — снапшот+CAS+аудит       | integration | mutation-applier.test.ts |
| CAS-конфликт — устаревшая ревизия        | integration | mutation-applier.test.ts |
| Undo восстанавливает снапшот             | integration | mutation-applier.test.ts |
| Provenance-тег на понижение из MR-текста | unit        | mutation-applier.test.ts |
| Невалидный op отклоняется до превью      | unit        | mutation-applier.test.ts |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-15, initial

#### P1

- [x] `2026-07-15T14:03:36Z` decision review.json-shape=findings[].id (F-<1-based-index>) + top-level revision (monotonic) ← ход не имел стабильного ключа для CAS-таргетинга; правка согласована с reviewer.role.ts#materializeReviewJson и BoardProviderReal#\_readDiskReview (см. Inputs open)
- [x] `2026-07-15T14:03:36Z` intro `MutationApplier` ← сервис превью/apply/undo для структурных мутаций review.json (P1 deliverable, TSK-127)
- [x] `2026-07-15T14:03:36Z` intro `PreviewResult` ← дискриминированный результат `preview()` — отклоняет op вне v1-набора до применения
- [x] `2026-07-15T14:03:36Z` intro `ApplyResult` ← дискриминированный результат `apply()` — `{ ok:true, snapshot }` | `STALE_REVISION` (D-99)
- [x] `2026-07-15T14:03:36Z` intro `UndoResult` ← дискриминированный результат `undo()` — `{ ok:true }` | `SNAPSHOT_NOT_FOUND`
- [x] `2026-07-15T14:03:36Z` decision chat-audit-role=CHAT_AUDIT_ROLE='chat' ← `AuditEntry#role` обязателен, но во время чата нет активной role-graph ноды
- [x] `2026-07-15T14:03:36Z` decision atomic-write=tmp+rename ← переиспользован паттерн `saveRegistry` (`inbox-registry.logic.ts`) для CAS-записи и undo-восстановления review.json
- [x] `2026-07-15T14:03:36Z` insight BoardProviderReal#\_readDiskReview уже читает JSON через `as`-cast без структурной проверки полей → лишние поля `id`/`revision` не ломают чтение; правка файла не потребовалась, тесты board-provider.real.test.ts зелёные без изменений → inbox-chat.spec.md#mutationapplier, файл не тронут (только verified тестами)
- [x] `2026-07-15T14:03:36Z` ver `.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/modules/inbox-chat/mutation-applier.ts` → pass (4/4 gates: type-check, gennady lint, test, format:check)
- [x] `2026-07-15T14:03:36Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T14:03:36Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-15T14:03:36Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-15T14:03:36Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/mutation-applier.ts, services/agent-inbox/modules/inbox-roles/reviewer.role.ts]; decisions: [review.json-shape=findings[].id+top-level-revision, finding-id-scheme=F-<1-based-index>, chat-audit-role=CHAT_AUDIT_ROLE='chat', atomic-write=tmp+rename, apply-returns=ApplyResult(ChatErrorResponse-based STALE_REVISION), preview-invalid-op=PreviewResult.UNSUPPORTED_OP(local, not ChatErrorCode), apply-invalid-op=throws(fail-fast, not a return variant)]; open: [P2: покрыть все 6 BDD-сценариев секции 4 тестами (mutation-applier.test.ts), включая невалидный op через preview() (ok:false) и через apply() (throw); board-provider.real.ts и inbox-api/types.ts НЕ трогались — revision пока не проброшен в MrDetail/getReport(), это откладывается на роутер чата (TSK-129, MutateRouter)]

#### P2

- [x] `2026-07-15T14:10:19Z` ver `.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/modules/inbox-chat/__tests__/mutation-applier.test.ts` → pass (4/4 gates: type-check, gennady lint, test, format:check)
- [x] `2026-07-15T14:10:19Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T14:10:19Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-15T14:10:19Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-15T14:10:19Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/__tests__/mutation-applier.test.ts]; decisions: [test-context=single-createMutationApplierContext(no-overrides)+seedReviewJson/readReviewJson-fixture-helpers, REF='group/proj!101', contract-case=reuses-CAS-flow(apply-then-stale-apply)-for-discriminated-union-check, invalid-op-case=covers-preview()-ok:false-AND-apply()-throws-in-one-it (single BDD scenario, per-Handoff open item)]; open: []

#### Round close

- [x] `2026-07-15T14:10:00Z` DONE — Round 1: P1 (impl) + P2 (test, 22/22 green) DONE; трекеры синхронизированы; статус Meta → [x] DONE

<!--/SECTION:EXECUTION_LOG-->
