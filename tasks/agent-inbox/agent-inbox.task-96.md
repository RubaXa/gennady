# Task: TSK-96 — `vcs-discussions` фильтры `--my` и `--with-drafts`

## 1. Meta

- **Task-ID:** TSK-96 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** vcs-discussions | **Dependencies:** TSK-95 (AI-25 — `--url` через `resolveVcsContext`)
- **Purpose:** `vcs-discussions --url <URL> --json --my [--with-drafts]` — фильтр по автору и включение черновиков. Ответ по контракту AI-22 при ошибках.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-26 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

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

- `npm run typecheck` — pass
- `npm run test -- cli/cmd/vcs-discussions/vcs-discussions.test.ts` — pass
- `npm run format:check` — pass

## 7. Execution Log

### Round 1

#### P1

- [ ] **Handoff →** artifacts: [vcs-discussions.cmd.ts, help.ts]; decisions: [D49]; open: []

#### P2

- [ ] **Handoff →** artifacts: [vcs-discussions.test.ts]; decisions: []; open: []
