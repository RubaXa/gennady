# Task: TSK-97 — `vcs-draft-note --delete-all`

## 1. Meta

- **Task-ID:** TSK-97 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** vcs-draft-note | **Dependencies:** TSK-95 (AI-25 — `--url`); `vcs-draft-note` — существующая команда, меняем только cmd.ts
- **Purpose:** `vcs-draft-note --url <URL> --delete-all` удаляет все черновики. Ответ по контракту AI-22 при ошибках.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-27 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/vcs-draft-note/vcs-draft-note.cmd.ts` — добавить флаг `--delete-all` в `parseArgs` и `countActions`. В `run()`: если `--delete-all` → получить список черновиков через `client.MergeDiscussions.listDraftNotes()`, удалить каждый через `client.MergeDiscussions.deleteDraftNote()`. Вывести `{ deleted: N }`.
  - `cli/cmd/vcs-draft-note/help.ts` — добавить `--delete-all` в help
- **Exit:** `vcs-draft-note --url <URL> --delete-all` — получает список черновиков, удаляет каждый (best-effort). Ответ: `{ deleted: N }` при полном успехе; `{ deleted: N, errors: [{draftId, error}] }` при частичном (часть удалена, часть нет). Если `listDraftNotes()` упал → `{"ok": false, "error": "NETWORK|AUTH", "detail": "..."}` (AI-22). Если черновиков нет → `{ deleted: 0 }`. Ошибка удаления отдельного черновика не блокирует удаление остальных.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `cli/cmd/vcs-draft-note/__tests__/vcs-draft-note.test.ts` — дополнить
- **Exit:** тесты: удаление N черновиков; удаление при 0 черновиков (no-op)

## 4. BDD

- `vcs-draft-note --url <URL> --delete-all` — 3 черновика, все удалены → `{ deleted: 3 }`
- `vcs-draft-note --url <URL> --delete-all` — 3 черновика, 2 удалены, 1 упал (403) → `{ deleted: 2, errors: [{draftId: "...", error: "AUTH"}] }`
- `vcs-draft-note --url <URL> --delete-all` — `listDraftNotes()` упал (сеть) → `{"ok": false, "error": "NETWORK", "detail": "..."}` (AI-22)
- `vcs-draft-note --url <URL> --delete-all` — 0 черновиков → `{ deleted: 0 }`
- Существующие операции (`--list`, `--create`, `--update`, `--delete <id>`, `--publish`) продолжают работать

## 5. Verification

- `npm run typecheck` — pass
- `npm run test -- cli/cmd/vcs-draft-note/__tests__/vcs-draft-note.test.ts` — pass
- `npm run format:check` — pass

## 7. Execution Log

### Round 1

#### P1

- [x] `2026-07-05T09:15:30Z` intro `deleteAllDrafts` ← TSK-97 P1: функция массового удаления черновиков (best-effort)
- [x] `2026-07-05T09:18:25Z` insight ticket §5 команда `npm run typecheck` не существует (скрипт называется `type-check`) → `## 5. Verification`, заменить на `npm run type-check`
- [x] `2026-07-05T09:19:30Z` ver npm run typecheck → fail exit=1
- [x] `2026-07-05T09:19:30Z` ver npm run type-check → pass exit=0
- [x] `2026-07-05T09:19:30Z` ver npm run test -- cli/cmd/vcs-draft-note/__tests__/vcs-draft-note.test.ts → pass exit=0
- [x] `2026-07-05T09:19:30Z` ver npm run format:check → pass exit=0
- [x] `2026-07-05T09:19:30Z` DONE
**Handoff →** artifacts: [cli/cmd/vcs-draft-note/vcs-draft-note.cmd.ts, cli/cmd/vcs-draft-note/help.ts]; decisions: [--delete-all=best-effort, --url=forwarded-to-resolveVcsContext]; open: []

#### P2

- [ ] **Handoff →** artifacts: [vcs-draft-note.test.ts]; decisions: []; open: []
