# Task: TSK-156 — Bootstrap: журнал событий + per-MR layout

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-156
- **Status:** [ ] TODO
- **Purpose:** Фундамент v2: append-only журнал `events.jsonl` (строчный append, seq/cursor, fsync), глобальный системный журнал, layout `mrs/<mr>/`, registry-поля (`lastReadAt`, `capabilities`), reuse-инвентарь B3.
- **Scope:** `agent-inbox`
- **Module:** `inbox-core`
- **Dependencies:** None
- **Spec References:**
  - Module spec: [inbox-core](../../specs/agent-inbox/inbox-core/inbox-core.spec.md) §2 (JournalPort), §3, §6
  - Bootstrap: [root §12](../../specs/agent-inbox/agent-inbox.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind      | Deps | Status |
| --- | --------- | ---- | ------ |
| P1  | bootstrap | —    | [ ]    |
| P2  | test      | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — bootstrap

- **Objective:** EventJournal (append/read/since(cursor), seq per MR, O_APPEND+fsync, отброс битого хвоста), глобальный журнал `agent-inbox/events.jsonl`, registry-поля (`lastReadAt`, `capabilities`) в `inbox-registry.ts`, reuse-проверка B3 (импорты OutcomeClassifier/PhaseTelemetry/EffectExecutor/context-builder/MutationApplier/VCS разрешаются).
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/event-journal.ts`
  - `services/agent-inbox/modules/inbox-core/inbox-registry.ts`
- **Inputs:** none
- **Exit:** `npm run type-check` exit 0; `which opencode` exit 0 (B1); reuse-импорты резолвятся (B3)
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** unit+integration тесты журнала (append/seq/since, конкурентные писатели сериализованы, битый хвост, глобальный журнал).
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/__tests__/event-journal.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлу exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** журнал событий как единственный источник истины

**Scenario:** типинг-контракт JournalEntry/JournalPort [`contract`]

- **Given** схема записи `{ts, seq, mr, kind, payload}` и порты append/read/since
- **When** type-check контракта
- **Then** kind замкнут (10 значений), seq: number, cursor=seq

**Scenario:** append присваивает монотонный seq per MR [`unit`]

- **Given** пустой журнал MR
- **When** 3 append подряд
- **Then** seq = 1,2,3; `since(1)` вернул записи 2,3 и nextCursor=3

**Scenario:** конкурентные продюсеры не теряют записи [`integration`]

- **Given** два async-писателя (sync + queue) в один файл
- **When** 50 параллельных append
- **Then** 50 целых строк, seq без пропусков (in-process сериализация, не tmp+rename)

**Scenario:** битый хвост после краха отбрасывается [`unit`]

- **Given** файл с обрезанной последней строкой
- **When** read()
- **Then** читаются только целые записи, журнал остаётся appendable

**Scenario:** MR-less события идут в глобальный журнал [`unit`]

- **Given** событие kind=system (boot)
- **When** append без mr
- **Then** запись в `agent-inbox/events.jsonl` с `mr='system'`

**Scenario:** seq переживает рестарт без дублей [`integration`]

- **Given** журнал MR с 3 fsync-записями
- **When** рестарт процесса, переоткрытие, append
- **Then** новая запись — seq=4; записи 1–3 целы; дублей seq нет

**Scenario:** журналы MR изолированы [`unit`]

- **Given** журналы MR-A и MR-B
- **When** чередующиеся append
- **Then** независимые seq 1..N; since() MR-A не возвращает записей MR-B

**Scenario:** битый/отсутствующий реестр не ломает загрузку [`integration`]

- **Given** `inbox-registry.json` удалён или бит
- **When** чтение при boot
- **Then** кэш пересобирается из GitLab+журналов; lastReadAt/capabilities дефолтятся; throw отсутствует
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                               | Required by      |
| ------------------------------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                                                  | typescript-rules |
| `npm test -- services/agent-inbox/modules/inbox-core/__tests__/event-journal.test.ts` | node-test        |

- **Task-specific Completion additions:** `which opencode` exit 0 записан в лог (B1)
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- типинг-контракт → `event-journal.test.ts` :: `contract: journal entry envelope and port signatures`
- seq per MR → `event-journal.test.ts` :: `append assigns monotonic seq and since(cursor) paginates`
- конкурентные писатели → `event-journal.test.ts` :: `concurrent appends are serialized without loss`
- битый хвост → `event-journal.test.ts` :: `truncated tail is discarded on replay`
- глобальный журнал → `event-journal.test.ts` :: `mr-less events go to global system journal`

- seq переживает рестарт → `event-journal.test.ts` :: `seq survives restart without reuse`
- изоляция MR → `event-journal.test.ts` :: `journals are isolated per MR`
- битый реестр → `event-journal.test.ts` :: `broken registry rebuilds safely from gitlab and journals`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- event-journal.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
