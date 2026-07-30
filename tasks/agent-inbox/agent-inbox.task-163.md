# Task: TSK-163 — inbox-chat: якоря + operator-сессия + мутации

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-163
- **Status:** [ ] TODO
- **Purpose:** Мета-якоря (офсеты+quote re-anchor+stale, нетекстовые элементы), персистентная operator-сессия (read-only, retrieval по якорю, рестарт с дайджестом, история из журнала), мутации через очередь (CAS+снапшот+undo LIFO).
- **Scope:** `agent-inbox`
- **Module:** `inbox-chat`
- **Dependencies:** TSK-162
- **Spec References:**
  - Module spec: [inbox-chat](../../specs/agent-inbox/inbox-chat/inbox-chat.spec.md) §2–§5
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
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

### P1 — impl

- **Objective:** Anchor (сериализация/разрешение: quote-first, offset-fallback, stale, elementId для нетекстовых), OperatorSession (персистентная, read-only тулы, инъекция артефактов по якорю, дайджест-рестарт), ChatHistory (проекция chat_turn журнала), MutationFlow (propose→mutate_artifact задача → MutationApplier CAS+снапшот → отчёт в чат+лента; undo LIFO per artifact; CAS-конфликт = видимая ошибка).
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-chat/anchor.ts`
  - `services/agent-inbox/modules/inbox-chat/operator-session.ts`
  - `services/agent-inbox/modules/inbox-chat/mutation-flow.ts`
  - `services/agent-inbox/modules/inbox-chat/mutation-applier.ts`
- **Inputs:** TSK-162 (роутеры chat/mutate), TSK-159 (маршрут сессий)
- **Exit:** `npm run type-check` exit 0; якорь переживает мутацию (quote re-anchor)
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** тесты якоря (единицы, re-anchor, stale, нетекстовые), истории из журнала, мутаций (CAS, конфликт, undo LIFO), маршрута в сессию-продюсера.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-chat/__tests__/anchor.test.ts`
  - `services/agent-inbox/modules/inbox-chat/__tests__/mutation-flow.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** чат, привязанный к артефактам, а не к тексту

**Scenario:** типинг-контракт Anchor/ChatPort/MutationPort [`contract`]

- **Given** схема якоря {widgetId, artifactPath?, fragment{start,end}, quote} / elementId-вариант
- **When** type-check
- **Then** apply принимает {path, revision, content}; undo(mr, path?)

**Scenario:** якорь разрешается по quote после мутации [`unit`]

- **Given** якорь на фрагмент, артефакт мутирован (офсеты сдвинуты)
- **When** resolve(anchor)
- **Then** фрагмент найден по quote; при отсутствии quote — пометка stale, тред не теряется

**Scenario:** история треда переживает рестарт [`integration`]

- **Given** 3 chat_turn в журнале MR
- **When** рестарт сервера → history(mr)
- **Then** тред полон и в исходном порядке

**Scenario:** CAS-конфликт — видимая ошибка, не тихая перезапись [`integration`]

- **Given** снапшот revision=3, текущая revision=4
- **When** apply({revision:3})
- **Then** ошибка оператору; артефакт не изменён

**Scenario:** undo — LIFO-стек per artifact [`unit`]

- **Given** два снапшота s1, s2 одного артефакта и снапшот другого
- **When** undo() дважды
- **Then** откатаны s2, затем s1 (LIFO); снапшот другого артефакта не тронут

**Scenario:** operator-сессия не может писать [`unit`]

- **Given** персистентная operator-сессия
- **When** вызов write/vcs-write инструмента
- **Then** инструмент недоступен; диск и VCS не изменены

**Scenario:** якорь на нетекстовый элемент [`unit`]

- **Given** якорь {widgetId, elementId} на mermaid-«фото»
- **When** resolve после обновления виджета
- **Then** разрешается по elementId; отсутствующий elementId → stale

**Scenario:** переполнение контекста — прозрачный рестарт [`integration`]

- **Given** operator-сессия с переполненным контекстом, вопрос в полёте
- **When** рестарт с дайджестом
- **Then** вопрос перевыпущен; ответ в том же треде history(mr)
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                          | Required by      |
| ---------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                             | typescript-rules |
| `npm test -- services/agent-inbox/modules/inbox-chat/__tests__/` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- типинг-контракт → `anchor.test.ts` :: `contract: anchor and chat mutation ports`
- re-anchor → `anchor.test.ts` :: `anchor resolves by quote after mutation else stale`
- история → `mutation-flow.test.ts` :: `chat history survives restart via journal`
- CAS → `mutation-flow.test.ts` :: `cas conflict is visible and undo is lifo per artifact`

- read-only → `mutation-flow.test.ts` :: `operator session cannot write`
- elementId-якорь → `anchor.test.ts` :: `non text anchor resolves by elementId else stale`
- рестарт с дайджестом → `mutation-flow.test.ts` :: `context overflow restarts transparently and reissues inflight question`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- inbox-chat/__tests__` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
