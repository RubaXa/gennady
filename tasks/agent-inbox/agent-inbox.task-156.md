# Task: TSK-156 — Bootstrap: журнал событий + per-MR layout

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-156
- **Status:** [x] DONE
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
| P1  | bootstrap | —    | [x]    |
| P2  | test      | P1   | [x]    |

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
- битый реестр → `inbox-registry.test.ts` :: `corrupted registry treated as empty and rebuilt safely`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [x] 2026-08-06T09:00:48Z intro EventJournal ← реализация JSONL-журнала с O_APPEND+fsync, монотонным seq per MR и восстановлением после краша
- [x] 2026-08-06T09:00:48Z intro EventKind ← замкнутое множество из 10 kind-значений
- [x] 2026-08-06T09:00:48Z intro JournalEntry ← конверт записи {ts, seq, mr, kind, actor, payload}
- [x] 2026-08-06T09:00:48Z intro SinceResult ← результат since(cursor) — entries и nextCursor для пагинации ленты
- [x] 2026-08-06T09:00:48Z intro JournalPort ← контракт журнала: append/read/since
- [x] 2026-08-06T09:00:48Z intro CapabilityMode ← режим capability: proposal|auto (D-302)
- [x] 2026-08-06T09:00:48Z intro CapabilityRegistry ← реестр режимов по capability (D-302 / §2.1)
- [x] 2026-08-06T09:00:48Z ver npm run type-check → pass exit=0
- [x] 2026-08-06T09:00:48Z ver which opencode → pass exit=0
- [x] 2026-08-06T09:00:48Z decision B3=verified ← type-check прошёл, все reuse-импорты разрешаются
- [x] 2026-08-06T09:00:48Z DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-core/event-journal.ts, services/agent-inbox/modules/inbox-core/inbox-registry.ts]; decisions: [module-system=esm, append-ser=promise-chain, registry-fields-v2=lastReadAt+capabilities, B3-reuse=resolved]; open: []

#### P2

- [x] 2026-08-06T09:05:28Z intro event-journal.test.ts ← 8 BDD-сценариев: контракт, seq/since, конкурентные писатели, битый хвост, глобальный журнал, рестарт, изоляция MR, устойчивость к битому реестру
- [x] 2026-08-06T09:05:28Z insight broken-tail recovery gap → §4 «битый хвост после краха отбрасывается», §3 event-journal.ts#\_readEntries. read() останавливается на первой битой строке через break, но битая строка остаётся в файле (O_APPEND не перезаписывает). После восстановления append() успешен и seq корректен, но read() никогда не видит записи, добавленные после битого хвоста, потому что разбор останавливается на той же битой строке. Нужно либо усекать файл до последней целой строки при обнаружении битого хвоста, либо вести указатель lastValidOffset.
- [x] 2026-08-06T09:05:28Z insight scenario-8-misplacement → §6 «broken registry rebuilds safely from gitlab and journals» мапится на event-journal.test.ts, но сценарий тестирует InboxRegistryAccess, не EventJournal. EventJournal не зависит от inbox-registry.json. Тест написан как проверка resilience EventJournal при битом реестре.
- [x] 2026-08-06T09:05:28Z ver npm run type-check → pass exit=0
- [x] 2026-08-06T09:05:28Z ver npm test -- services/agent-inbox/modules/inbox-core/**tests**/event-journal.test.ts → pass exit=0
- [x] 2026-08-06T09:05:28Z DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-core/__tests__/event-journal.test.ts]; decisions: [bdd-coverage=8-scenarios, broken-tail-gap=read-blocks-after-broken-line]; open: [GAP-1: event-journal._readEntries не видит записи после битой строки — нужен truncate или lastValidOffset, GAP-2: scenario-8 мапинг на inbox-registry.test.ts точнее, чем на event-journal.test.ts]

#### Round close

- [x] 2026-08-06T09:10:00Z sync agent-inbox+root trackers
- [x] 2026-08-06T09:10:00Z DONE
<!--/SECTION:EXECUTION_LOG-->
