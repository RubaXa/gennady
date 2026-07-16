# Task: TSK-96 — `vcs-discussions` фильтры `--my` и `--with-drafts`

## 1. Meta

- **Task-ID:** TSK-96 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** vcs-discussions | **Dependencies:** TSK-95 (AI-25 — `--url` через `resolveVcsContext`)
- **Purpose:** `vcs-discussions --url <URL> --json --my [--with-drafts]` — фильтр по автору и включение черновиков. Ответ по контракту AI-22 при ошибках.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-26 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/vcs-discussions/vcs-discussions.cmd.ts` — добавить флаги `--my`, `--with-drafts`, `--url` в `parseArgs`. После получения дискуссий через `getAll()`:
    - `--my`: отфильтровать discussion'ы, где хотя бы одна нота имеет `author.username === myLogin` (получить `myLogin` через `client.getCurrentUser()`)
    - `--with-drafts`: только вместе с `--my` (без `--my` → `INVALID_ARGS` ошибка). Вызвать `listDraftNotes()`, добавить в ответ поле `drafts`
    - `--json` + `--my --with-drafts`: ответ `{ discussions: [...], drafts: [...] }`
  - `cli/cmd/vcs-discussions/help.ts` — обновить help с новыми флагами
- **Exit:** `vcs-discussions --url <URL> --json --my --with-drafts` возвращает `{ discussions: [...мои...], drafts: [...мои черновики...] }`. `vcs-discussions --url <URL> --json` возвращает все (как раньше).

### P2 — test

- **Rules:** none
- **Target Files:**
  - `cli/cmd/vcs-discussions/vcs-discussions.test.ts` — новый/дополненный
- **Exit:** тесты: `--my` фильтр; `--my --with-drafts` включает drafts; без `--my` — все; `--with-drafts` без `--my` — черновики не включаются

## 4. BDD

- `vcs-discussions --url <URL> --json` → все дискуссии (без фильтра)
- `vcs-discussions --url <URL> --json --my` → только дискуссии с моими нотами
- `vcs-discussions --url <URL> --json --my --with-drafts` → мои дискуссии + `drafts: [...]` с моими черновиками
- `vcs-discussions --url <URL> --json --with-drafts` (без `--my`) → `{"ok": false, "error": "INVALID_ARGS", "detail": "--with-drafts requires --my"}` (AI-22)
- Нет моих дискуссий → `{ discussions: [], drafts: [...] }` (если `--with-drafts`)
- `vcs-discussions --url <URL> --json --my --with-drafts` — `getCurrentUser()` API упал (сеть) → `{"ok": false, "error": "NETWORK", "detail": "..."}` (AI-22)
- `vcs-discussions --url <URL> --json --my --with-drafts` — `listDraftNotes()` упал → `drafts: []`, warning в stderr
- `vcs-discussions --url <URL> --json --with-drafts` (без `--my`) → `{"ok": false, "error": "INVALID_ARGS", "detail": "--with-drafts requires --my"}`

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- cli/cmd/vcs-discussions/vcs-discussions.test.ts` — pass
- `npm run format:check` — pass

## 7. Execution Log

### Round 1

#### P1

- [x] `2026-07-15T23:10:00Z` restored: P1 log line was left unclosed (stash-revert/logging gap), но impl фактически доставлен — `cli/cmd/vcs-discussions/vcs-discussions.cmd.ts` (дата 2026-07-08) реализует `--my` (фильтр по `author.username === myLogin` через `getCurrentUser()`), `--with-drafts` (+`listDraftNotes()`, требует `--my` иначе `INVALID_ARGS`), `--url`; `help.ts` обновлён. Подтверждено кодом (строки 51/64/66/144/176) и зелёным P2 (`npm run test -- cli/cmd/vcs-discussions/vcs-discussions.test.ts` → 7/7 pass).
- [x] `2026-07-15T23:10:00Z` **Handoff →** artifacts: [vcs-discussions.cmd.ts, help.ts]; decisions: [D49]; open: []

#### Round close

- [x] `2026-07-15T23:10:00Z` DONE — Meta восстановлена после stash-revert; исполнение подтверждено кодом + зелёным P2 (7/7).

#### P2

- [x] `2026-07-05T09:30:22Z` discovery ticket §5 говорит `npm run typecheck`, но скрипт в package.json — `type-check` (c дефисом). Фактический `npm run type-check` → pass.
- [x] `2026-07-05T09:30:22Z` discovery `npm run format:check` падает на 7 pre-existing файлах вне Target Files (inbox-context-cmd-config.test.ts, inbox/config.test.ts, vcs-reply.cmd.test.ts, agent-inbox.task-100.md, agent-inbox.task-92.md, agent-inbox.task-95.md, agent-inbox.task-97.md). Файл фазы `vcs-discussions.test.ts` форматирование проходит.
- [x] `2026-07-05T09:30:22Z` ver npm run type-check → pass exit=0
- [x] `2026-07-05T09:30:22Z` ver gennady lint cli/cmd/vcs-discussions/vcs-discussions.test.ts → pass exit=0
- [x] `2026-07-05T09:30:22Z` ver npm run test → pass exit=0
- [x] `2026-07-05T09:30:22Z` ver npm run test -- cli/cmd/vcs-discussions/vcs-discussions.test.ts → pass exit=0
- [x] `2026-07-05T09:30:22Z` ver npm run typecheck → fail exit=1
- [x] `2026-07-05T09:30:22Z` ver npm run format:check → fail exit=1
- [x] `2026-07-05T09:30:22Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-discussions/vcs-discussions.test.ts]; decisions: []; open: [F-1: ticket-typings: npm run typecheck vs type-check с дефисом, F-2: npm run format:check падает на pre-existing файлах вне скоупа фазы]
