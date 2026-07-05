# Task: TSK-100 — Валидация постинга в `vcs-reply`

## 1. Meta

- **Task-ID:** TSK-100 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** vcs-reply | **Dependencies:** TSK-95 (--url)
- **Purpose:** 5 механических проверок в `vcs-reply` до POST. Код гарантирует формат, модель не может забыть.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-31 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/vcs-reply/vcs-reply.cmd.ts` — добавить валидацию перед POST:
    1. `body` нет и это не resolve-only → ошибка. `body` не начинается с 🤖 → авто-дописать префикс
    2. `discussionId` сверить с реальными дискуссиями MR (`getAll()`); нет → ошибка со списком валидных
    3. body содержит ```suggestion-блок → проверить заголовок (числа), блок закрыт, есть `position`
    4. `position.newPath` входит в дифф MR; нет → ошибка
    5. Валидировать весь массив; любая ошибка → не постится ничего, `{"ok": false, "error": "INVALID_ARGS", "detail": [...по элементам...]}` (AI-22)
- **Exit:** vcs-reply проверяет формат до POST. Чек-лист в agent-inbox-post остаётся для смысловых проверок.

### P2 — test

- **Rules:** none
- **Target Files:** `cli/cmd/vcs-reply/vcs-reply.test.ts` — дополнить
- **Exit:** тесты на каждую из 5 проверок + атомарность

## 4. BDD

- body без 🤖 → авто-дописать префикс, запостить
- discussionId выдуманный → `INVALID_ARGS` с перечнем валидных ID
- suggestion-блок без закрытия → `INVALID_ARGS`
- position.newPath не в диффе → `INVALID_ARGS`
- Одна ошибка в массиве из 3 → не запощено ничего

## 5. Verification

- `npm run typecheck` — pass
- `npm run test -- cli/cmd/vcs-reply/vcs-reply.test.ts` — pass
- `npm run format:check` — pass

## 7. Execution Log

### Round 1

#### P1

- [x] `2026-07-05T09:23:35Z` intro `validateReplyItems` ← TSK-100 P1: 5 механических проверок до POST
- [x] `2026-07-05T09:23:35Z` discovery ticket §5 ссылается на несуществующий `cli/cmd/vcs-reply/vcs-reply.test.ts`; актуальные тесты в `__tests__/vcs-reply.*.test.ts` — исправление в P2
- [x] `2026-07-05T09:23:35Z` ver `npm run typecheck` → pass exit=0
- [x] `2026-07-05T09:23:35Z` ver `npm run test -- cli/cmd/vcs-reply/vcs-reply.test.ts` → fail exit=1
- [x] `2026-07-05T09:23:35Z` ver `npm run format:check` → fail exit=1
- [x] `2026-07-05T09:23:35Z` insight format:check: 2 pre-existing warnings в `tasks/agent-inbox/agent-inbox.task-92.md`, `tasks/agent-inbox/agent-inbox.task-97.md` → вне Target Files P1
- [x] `2026-07-05T09:23:35Z` insight 3 теста vcs-reply (`edit`, `mixed`, `resolve+reply`) падают из-за авто-🤖 префикса → ожидания тестов обновить в P2
- [x] `2026-07-05T09:23:35Z` DONE
**Handoff →** artifacts: [cli/cmd/vcs-reply/vcs-reply.cmd.ts]; decisions: [auto-prepend-bot-prefix=body без 🤖 получает префикс, validation-atomic=любая ошибка → INVALID_ARGS, skip-on-unavailable=getAll/getChanges недоступны → проверка пропускается]; open: [P2: обновить ожидания тестов под 🤖 префикс, P2: исправить путь к тестовому файлу в §5]

#### P2

- [ ] **Handoff →** artifacts: [vcs-reply.test.ts]; decisions: []; open: []
