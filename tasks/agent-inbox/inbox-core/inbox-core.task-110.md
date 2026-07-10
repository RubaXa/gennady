# Task: TSK-110 — inbox-core: VcsInboxPort + VcsInboxMock + VcsInboxReal

## 1. Meta

- **Task-ID:** TSK-110 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-core | **Dependencies:** TSK-109 (core state)
- **Purpose:** VCS-интеграция: Port (абстракция) + Mock (dev/e2e) + Real (vcs-client). DI-переключение. CLI-команды (inbox-context, vcs-discussions, vcs-reply, vcs-approve) должны быть доступны как импортируемые функции (рефакторинг CLI при необходимости — scope `cli`).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-06, [inbox-core.spec.md](../../specs/agent-inbox/inbox-core/inbox-core.spec.md) | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

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

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
