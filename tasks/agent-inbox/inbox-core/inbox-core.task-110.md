# Task: TSK-110 — inbox-core: VcsInboxPort + VcsInboxMock + VcsInboxReal

## 1. Meta

- **Task-ID:** TSK-110 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-core | **Dependencies:** TSK-109 (core state)
- **Purpose:** VCS-интеграция: Port (абстракция) + Mock (dev/e2e) + Real (vcs-client). DI-переключение. CLI-команды (inbox-context, vcs-discussions, vcs-reply, vcs-approve) должны быть доступны как импортируемые функции (рефакторинг CLI при необходимости — scope `cli`).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-06, [inbox-core.spec.md](../../specs/agent-inbox/inbox-core/inbox-core.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/vcs-inbox.port.ts` — VcsInboxPort: getActionable, getMrContext, getDiscussions
  - `services/agent-inbox/modules/inbox-core/vcs-inbox.mock.ts` — VcsInboxMock: seed(mrs, contexts), реализация на моках
  - `services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts` — VcsInboxReal: обёртка над vcs-client, нормализация. Вызывает существующие CLI-команды как функции (inbox-context, vcs-discussions, vcs-reply, vcs-approve — per SV-12)
- **Exit:** Mock возвращает seeded данные. Real делает вызовы через существующий vcs-client. Общий интерфейс — взаимозаменяемы.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.mock.test.ts`
  - `services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.port.test.ts` — контракт
- **Exit:** Mock возвращает детерминированные данные. Port-контракт проверен.

## 4. BDD

- GIVEN VcsInboxMock.seed([mr1, mr2]) WHEN getActionable() THEN [mr1, mr2]
- GIVEN VcsInboxReal с токеном WHEN getActionable() THEN HTTP-запрос, нормализованный ответ
- GIVEN VcsInboxReal без сети WHEN getActionable() THEN NETWORK error (AI-22)
- GIVEN Mock имплементирует Port WHEN подстановка Mock вместо Real THEN код потребителя не меняется

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                 | Level | Test File              |
| ------------------------ | ----- | ---------------------- |
| Mock возвращает seeded   | unit  | vcs-inbox.mock.test.ts |
| Port контракт: сигнатуры | unit  | vcs-inbox.port.test.ts |
| error codes (AI-22)      | unit  | vcs-inbox.mock.test.ts |

## 7. Execution Log

### Round 1 — 2026-07-10, initial

#### P1

- [x] `2026-07-10T12:00:00Z` Created `services/agent-inbox/modules/inbox-core/vcs-inbox.port.ts` — VcsInboxPort abstract class: `getActionable()`, `getMrContext(webUrl)`, `getDiscussions(webUrl, opts)`
- [x] `2026-07-10T12:00:00Z` Created `services/agent-inbox/modules/inbox-core/vcs-inbox.mock.ts` — VcsInboxMock implements VcsInboxPort: `seed(mrs, contexts)`, детерминированный возврат seeded данных
- [x] `2026-07-10T12:00:00Z` Created `services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts` — VcsInboxReal: `_resolveInboxClient()` provider-aware factory, методы делегируют к vcs-client
- [x] `2026-07-10T12:05:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-10T12:05:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-10T12:05:00Z` Fix: `_baseUrl` read-before-assign в VcsInboxReal constructor — вынесена инициализация в lazy getter
- [x] `2026-07-10T12:05:00Z` DONE
- [x] **Handoff →** artifacts: [vcs-inbox.port.ts, vcs-inbox.mock.ts, vcs-inbox.real.ts]; decisions: [D_provider_aware_factory=_resolveInboxClient, D_identity_lookup=per-method resolution, D_unsupported_provider_throws=GitHub→error]; open: []

#### P2

- [x] `2026-07-10T12:10:00Z` Created `services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.mock.test.ts` — 13 tests: seeded data возвращается, детерминизм, partial seed, AI-22 коды ошибок, BDD сценарии
- [x] `2026-07-10T12:10:00Z` Created `services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.port.test.ts` — 15 tests: абстрактный контракт, Mock implements Port, Real implements Port, взаимозаменяемость, сигнатуры методов
- [x] `2026-07-10T12:15:00Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-10T12:15:00Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.*.test.ts'` → pass exit=0 (28 tests, 0 fail)
- [x] `2026-07-10T12:15:00Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-10T12:15:00Z` DONE
- [x] **Handoff →** artifacts: [vcs-inbox.mock.test.ts, vcs-inbox.port.test.ts]; decisions: [test_counts=28, mock=13+port=15]; open: []

#### Round close

- [x] `2026-07-10T12:20:00Z` sync inbox-core VCS layer
- [x] `2026-07-10T12:20:00Z` DONE
