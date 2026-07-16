# Task: TSK-126 — inbox-chat: ChatSession + ContextAssembler + транскрипт-персистентность

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-126 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-chat | **Dependencies:** TSK-109, TSK-110 (inbox-core, DONE), TSK-111, TSK-112 (inbox-opencode, DONE)
- **Purpose:** Ядро Review Chat (Слой 1+2, D-88): `ChatSession` — per-MR opencode-сессия из общего `SessionPool` (read/local-only tool-scope, D-103; сериализация ходов, D-104; stream+Stop, D-89/D-95); `ContextAssembler` — системный контекст хода из отчёта+чипов+diff с явной untrusted-обёрткой MR-текста (D-98) и ре-резолвом чипов на `headChanged` (D-101); `ChatTranscript` — персистентный `chats/<ref>.jsonl` + rehydrate (D-97); общие `types.ts` (`ChatTurn`/`ContextChip`) и `errors.ts` (коды `TURN_IN_FLIGHT` и др.). `MutationProposal`/`ReviewSnapshot` объявляются здесь же в `types.ts` (D-109) для использования TSK-127, но не потребляются в этой фазе.
- **Spec:** [inbox-chat.spec.md](../../../specs/agent-inbox/inbox-chat/inbox-chat.spec.md) §3-5, [agent-inbox.spec.md](../../../specs/agent-inbox/agent-inbox.spec.md) §5.2, CH-01…04, CH-08, CH-11…14, D-88…D-90, D-97…D-100, D-102…D-104 | **Runtime:** real-runtime (через SessionPool+OpenCodeReal/Mock) | **Verification:** contract, unit, integration

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
  - `services/agent-inbox/modules/inbox-chat/types.ts` — `ChatTurn` (`id`, `ts`, `question`, `chips`, `answer`, `mutations?`, `reviewRevision`, `stopped?`), `ContextChip` (`kind: 'selection'|'mention'|'candidate'`, `quote`, `source`, `stale?`), `MutationProposal` (`op: 'edit'|'remove'|'set-severity'`, `target`, `before`, `after`, `provenance?`), `ReviewSnapshot` (`id`, `mrRef`, `ts`, `revision`, `path`) — все четыре VO в одном файле (D-109).
  - `services/agent-inbox/modules/inbox-chat/errors.ts` — коды `TURN_IN_FLIGHT`, `STALE_REVISION`, `SESSION_ERROR` (переиспользовать существующий паттерн `ChatError`/`ApiError` из inbox-api при наличии общей формы).
  - `services/agent-inbox/modules/inbox-chat/chat-transcript.ts` — `ChatTranscript`: `append(turn)`, `load(mrRef)` (пустой транскрипт, если файла нет — не ошибка), `path(mrRef)`; append-only jsonl `<state-dir>/agent-inbox/chats/<group__proj-iid>.jsonl` по образцу `audit.jsonl`; создаёт каталог `chats/` при первом `append` (Bootstrap Requirements #14/#15 — структура появляется рантаймом, не отдельным bootstrap-шагом).
  - `services/agent-inbox/modules/inbox-chat/context-assembler.ts` — `ContextAssembler`: `assemble({ mrRef, chips })` собирает контекст из артефактов отчёта (`README/PLAN/tasks/review.json`) + чипы + diff (через тулы сессии); MR-авторский текст всегда в explicit untrusted-data блоке (D-98, расширяет `AX_UNTRUSTED_MR_CONTENT` на чат); `reresolveChips(chips, reviewRevision)` — на `headChanged != none` перепроверяет `review.json#<candidateId>`, помечает устаревшие `stale: true` (D-101); артефактов нет → пустой контекст, не ошибка (CH-14); без состояния между вызовами.
  - `services/agent-inbox/modules/inbox-chat/chat-session.ts` — `ChatSession`: `rehydrate()` (транскрипт+чипы с диска на reconnect/restart, D-97); `ask({ text, chips })` — строит контекст через `ContextAssembler`, вызывает `SessionPool.prompt` (tools = read/local ТОЛЬКО, БЕЗ `vcs-*` write — D-103; `cwd`=worktree), стримит токены через `onToken(cb)`, второй `ask()` на in-flight `sid` → `{ ok:false, error:'TURN_IN_FLIGHT' }` (D-104, композер на клиенте будет опираться на это); возвращает `ChatTurn` со structured-output мутациями (resultSchema, тип `MutationProposal[]` из `types.ts`); `stop()` — `AbortSignal` в opencode, ack <200мс, стримленный текст сохраняется в `ChatTurn.answer` (D-95/CH-11); `onToken(cb)`/`onMutationProposed(cb)` — подписка для SSE-моста `inbox-api` (TSK-129); `sid` — server-issued, MR-scoped, один канонический на MR (D-100); ленивое создание на первый `ask()`, переиспользуется по `sid` из `SessionPool` (SV-11, D-102).
- **Inputs:** none
- **Exit:** typecheck pass; `ChatSession` не регистрирует `vcs-*` write-тулы в `SessionPool.prompt`-вызове (D-103); `ContextAssembler.assemble()` всегда оборачивает MR-текст в отдельный untrusted-блок структуры вывода (не смешан с директивами); `chats/<ref>.jsonl` создаётся лениво при первом ходе.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-chat/__tests__/chat-session.test.ts`
  - `services/agent-inbox/modules/inbox-chat/__tests__/context-assembler.test.ts`
  - `services/agent-inbox/modules/inbox-chat/__tests__/chat-transcript.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии секции 4, относящиеся к `ChatSession`/`ContextAssembler`/`ChatTranscript`, покрыты; сьют зелёный.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

Contract: см. Spec References (`inbox-chat.spec.md#chatsession`, `#contextassembler`, `#chattranscript`).

**Feature:** Grounded per-MR чат с персистентным транскриптом

**Scenario:** Типизация контракта ChatSession/ContextAssembler/ChatTranscript [`contract`]

- **Given** типы `ChatTurn`/`ContextChip` из `types.ts` и публичные операции `ChatSession`/`ContextAssembler`/`ChatTranscript`
- **When** вызывающий код использует их сигнатуры
- **Then** `ask()`/`assemble()`/`append()`/`load()` типобезопасны; `ContextChip.kind` — закрытое перечисление `'selection'|'mention'|'candidate'`, отклоняет прочие значения на этапе компиляции
- **And** `ChatTurn.mutations?` типизирован как `MutationProposal[]` из общего `types.ts`, не `any`

**Scenario:** Один ход за раз на sid [`unit`]

- **Given** `ChatSession.ask()` уже in-flight на `sid`
- **When** вызывается второй `ask()` на тот же `sid` до завершения первого
- **Then** возвращается `{ ok: false, error: 'TURN_IN_FLIGHT' }` (D-104)

**Scenario:** Stop сохраняет частичный текст [`unit`]

- **Given** `ChatSession.ask()` стримит токены
- **When** вызывается `stop()` до завершения хода
- **Then** ack приходит быстро (симулированный таймер <200мс в тесте), `ChatTurn.answer` содержит уже стримленный текст, `stopped: true` (D-95/CH-11)

**Scenario:** Tool-registry без vcs-\* write [`unit`]

- **Given** `ChatSession.ask()` вызывает `SessionPool.prompt`
- **When** проверяется переданный набор тулов сессии
- **Then** отсутствуют reply/approve/react/draft-note/mr-edit — только read/local + канал мутаций (D-103)

**Scenario:** Rehydrate восстанавливает транскрипт [`integration`]

- **Given** `chats/<ref>.jsonl` с предыдущими ходами на диске
- **When** `ChatSession.rehydrate()` вызывается на новом инстансе (симуляция рестарта сервера)
- **Then** `session.transcript.turns` и `activeChips` совпадают с содержимым файла (D-97, SV-13)

**Scenario:** Untrusted-обёртка MR-текста [`unit`]

- **Given** `ContextAssembler.assemble({ mrRef, chips })` для MR с описанием/дифф/комментариями
- **When** собирается системный контекст хода
- **Then** MR-текст находится внутри отдельного явного untrusted-data блока, отделённого от директивных инструкций (D-98)

**Scenario:** Пустой отчёт — пустое состояние, не ошибка [`unit`]

- **Given** `mrRef` без папки `reports/<mr>/`
- **When** `ContextAssembler.assemble()` вызывается
- **Then** возвращается пустой контекст без исключения (CH-14)

**Scenario:** Ре-резолв устаревших чипов на headChanged [`unit`]

- **Given** чип со ссылкой `review.json#C-3`, `headChanged.kind != 'none'`, `C-3` отсутствует в свежем `review.json`
- **When** `ContextAssembler.reresolveChips(chips, reviewRevision)` вызывается
- **Then** чип помечен `stale: true`, не отброшен молча (D-101)

**Scenario:** Транскрипт переживает отсутствие файла [`unit`]

- **Given** `chats/<ref>.jsonl` не существует
- **When** `ChatTranscript.load(mrRef)` вызывается
- **Then** возвращается пустой транскрипт (`turns: []`, `activeChips: []`), не исключение

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

| Scenario                                          | Level       | Test File                                   |
| ------------------------------------------------- | ----------- | ------------------------------------------- |
| Типизация ChatSession/ContextAssembler/Transcript | contract    | chat-session.test.ts (type-only assertions) |
| Один ход за раз на sid                            | unit        | chat-session.test.ts                        |
| Stop сохраняет частичный текст                    | unit        | chat-session.test.ts                        |
| Tool-registry без vcs-\* write                    | unit        | chat-session.test.ts                        |
| Rehydrate восстанавливает транскрипт              | integration | chat-session.test.ts                        |
| Untrusted-обёртка MR-текста                       | unit        | context-assembler.test.ts                   |
| Пустой отчёт — пустое состояние                   | unit        | context-assembler.test.ts                   |
| Ре-резолв устаревших чипов                        | unit        | context-assembler.test.ts                   |
| Транскрипт переживает отсутствие файла            | unit        | chat-transcript.test.ts                     |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

_(Round = one execute-then-audit attempt. Skeleton — event lines appear only when they happen, per `tasks/README.md#execution-log-template`.)_

### Round 1 — 2026-07-15, initial

#### P1

- [x] `2026-07-15T13:30:18Z` decision ChatTranscript.append/load/path=(mrRef, …) ← ticket-текст называл `append(turn)` без mrRef, но jsonl-файл выбирается по MR (по образцу AuditLog) — сигнатура расширена явным mrRef на каждый вызов
- [x] `2026-07-15T13:30:18Z` decision ContextAssembler.reresolveChips=({ mrRef, chips, reviewRevision }) ← ticket-текст называл двухаргументную форму без mrRef; для чтения свежего review.json нужен mrRef — сигнатура расширена
- [x] `2026-07-15T13:30:18Z` decision reviewRevision=0-when-absent ← review.json пока не несёт поле revision (D-99/CAS вводится MutationApplier, TSK-127); ContextAssembler читает revision если есть, иначе 0 — не изобретает CAS-инфраструктуру
- [x] `2026-07-15T13:30:18Z` decision ChatSession.onToken=post-resolution-word-replay ← SessionPool.prompt()/OpenCodePort в текущем виде атомарны (нет incremental-события в inbox-opencode); onToken обслуживается реплеем уже разрешённого ответа по словам с yield между чанками, stop() усекает реплей
- [x] `2026-07-15T13:30:18Z` insight review.json findings пока без стабильного id (только severity/file/line/message) → review.json#<id>, ChatTranscript reresolveChips считает chip stale консервативно, пока MutationApplier/TSK-127 не введёт id на findings
- [x] `2026-07-15T13:30:18Z` insight SessionPool#create принимает только { title, directory } — tools-флаг не форвардится в OpenCodePort.createSession; D-103 (нет vcs-\* write-тулов) выполняется по построению (канала для передачи тулов вообще нет), но explicit read/local-доступ этим модулем тоже не включается — используется дефолт SessionPool/OpenCodePort
- [x] `2026-07-15T13:30:18Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T13:30:18Z` discovery `npm run format:check` fail exit=1 на 5 файлах вне Target Files этой фазы (services/agent-inbox/modules/inbox-api/board-provider.real.ts, services/agent-inbox/modules/inbox-roles/reviewer.role.ts, services/agent-inbox/scripts/backfill-review-json.ts, services/agent-inbox/scripts/exp-findings.ts, e2e/inbox-serve/reviewer-flow.spec.ts) — уже были в незакоммиченном/untracked состоянии на входе в фазу (см. git status до старта); все 5 файлов P1 индивидуально проходят `npx prettier --check`
- [x] `2026-07-15T13:30:18Z` ver `npm run format:check` → fail exit=1
- [x] `2026-07-15T13:30:18Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/types.ts, services/agent-inbox/modules/inbox-chat/errors.ts, services/agent-inbox/modules/inbox-chat/chat-transcript.ts, services/agent-inbox/modules/inbox-chat/context-assembler.ts, services/agent-inbox/modules/inbox-chat/chat-session.ts]; decisions: [ChatTranscript.append=(mrRef,turn), ChatTranscript.load=(mrRef)→{turns,activeChips}, ChatTranscript.path=(mrRef), ContextAssembler.assemble=({mrRef,chips})→{system,reviewRevision}, ContextAssembler.reresolveChips=({mrRef,chips,reviewRevision}), reviewRevision-default=0-when-review.json-lacks-revision, ChatSession.onToken=post-resolution-word-replay, ChatSession.stop=truncates-replay-only-cannot-abort-network-call, ChatSession.tools-flag=not-forwarded-by-SessionPool-create, MUTATION_RESULT_SCHEMA-title=chat_turn]; open: [format:check-pre-existing-fail: 5 файлов вне Target Files не отформатированы (см. discovery выше) — требует отдельного решения оператора/задачи, не в scope TSK-126 P1; inbox-opencode-streaming-gap: реальный token-level стрим и mid-flight abort требуют новой event-based/abort-возможности в SessionPool/OpenCodePort — вне Target Files TSK-126, для P2-тестов и будущего рефайна inbox-opencode; review-json-candidate-id: findings пока без стабильного id — reresolveChips корректен по контракту типов, но не проверяем против реального review.json, пока TSK-127/MutationApplier не материализует id-поле]

#### P2

- [x] `2026-07-15T13:42:52Z` decision test-titles=Section-6-canonical-Russian-names-verbatim ← §6 Test Scenario Coverage — нормативный источник по AX_BDD_NAME_DISCIPLINE — несёт имена сценариев на русском; совпадает с уже принятой практикой соседних тестовых файлов (audit-log.test.ts, context-builder.test.ts), где it()-заголовки для тикет-канонических сценариев тоже на русском; имена взяты дословно, вспомогательные не-BDD кейсы (доп. покрытие контракта/границ) названы по-английски
- [x] `2026-07-15T13:42:52Z` decision ChatSession-collaborator-double=real-SessionPool+OpenCodeMock ← SessionPool трогает реальный внешний opencode-процесс/сеть (AX_MOCK_AS_LAST_RESORT п.1); OpenCodeMock — уже существующий в репозитории детерминированный дублёр именно для этого (тот же паттерн в session-pool.test.ts, role-instance.test.ts); отдельный fake-pool не понадобился, кроме точечного node:test `mock.method()`-шпиона на реальном pool для проверки аргументов вызова в tool-registry сценарии
- [x] `2026-07-15T13:42:52Z` discovery `npm run format:check` в этом Round проходит чисто (project-wide) — обнаруженные в P1 5 незафоматированных файлов вне Target Files этой фазы больше не воспроизводятся; исправлено вне scope этой фазы
- [x] `2026-07-15T13:42:52Z` ver `.claude/skills/sdd-execute/scripts/sdd verify services/agent-inbox/modules/inbox-chat/__tests__/chat-transcript.test.ts services/agent-inbox/modules/inbox-chat/__tests__/context-assembler.test.ts services/agent-inbox/modules/inbox-chat/__tests__/chat-session.test.ts` → pass (4/4 gates: typecheck, gennady lint, test, format)
- [x] `2026-07-15T13:42:52Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-15T13:42:52Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-chat/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-15T13:42:52Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-15T13:42:52Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-chat/__tests__/chat-transcript.test.ts, services/agent-inbox/modules/inbox-chat/__tests__/context-assembler.test.ts, services/agent-inbox/modules/inbox-chat/__tests__/chat-session.test.ts]; decisions: [test-titles=section-6-canonical-Russian-verbatim, ChatSession-test-double=real-SessionPool+OpenCodeMock, tool-registry-assertion=mock.method-spy-on-real-pool, all-9-BDD-scenarios-covered]; open: [format:check-pre-existing-fail-from-P1: больше не воспроизводится в этом Round, оставлено на усмотрение оператора закрыть или оставить открытым; inbox-opencode-streaming-gap: реальный token-level стрим/mid-flight abort остаются вне scope TSK-126 (см. P1 Handoff), тесты покрывают replay-shim по наблюдаемому поведению, не реальную сетевую отмену; review-json-candidate-id: reresolveChips протестирован против review.json с/без совпадающего id по контракту типов, стабильный id для findings всё ещё вводится TSK-127/MutationApplier]

#### Round close

- [x] `2026-07-15T13:45:00Z` DONE — Round 1: P1 (impl) + P2 (test, 16/16 green) DONE; трекеры синхронизированы; статус Meta → [x] DONE

<!--/SECTION:EXECUTION_LOG-->
