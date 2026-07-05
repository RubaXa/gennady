# Task: TSK-97 — `vcs-draft-note --delete-all`

## 1. Meta

- **Task-ID:** TSK-97 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** vcs-draft-note | **Dependencies:** TSK-95 (AI-25 — `--url`); `vcs-draft-note` — существующая команда, меняем только cmd.ts
- **Purpose:** `vcs-draft-note --url <URL> --delete-all` удаляет все черновики. Ответ по контракту AI-22 при ошибках.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-27 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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

- `npm run type-check` — pass
- `npm run test -- cli/cmd/vcs-draft-note/__tests__/vcs-draft-note.test.ts` — pass
- `npm run format:check` — pass

## 7. Execution Log

### Round 1

#### P1

- [x] `2026-07-05T09:15:30Z` intro `deleteAllDrafts` ← TSK-97 P1: функция массового удаления черновиков (best-effort)
- [x] `2026-07-05T09:18:25Z` insight ticket §5 команда `npm run typecheck` не существует (скрипт называется `type-check`) → `## 5. Verification`, заменить на `npm run type-check`
- [x] `2026-07-05T09:19:30Z` ver npm run typecheck → fail exit=1
- [x] `2026-07-05T09:19:30Z` ver npm run type-check → pass exit=0
- [x] `2026-07-05T09:19:30Z` ver npm run test -- cli/cmd/vcs-draft-note/**tests**/vcs-draft-note.test.ts → pass exit=0
- [x] `2026-07-05T09:19:30Z` ver npm run format:check → pass exit=0
- [x] `2026-07-05T09:19:30Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-draft-note/vcs-draft-note.cmd.ts, cli/cmd/vcs-draft-note/help.ts]; decisions: [--delete-all=best-effort, --url=forwarded-to-resolveVcsContext]; open: []

#### P2

- [x] `2026-07-05T09:29:07Z` intro `mockFetchSequence` ← TSK-97 P2: queue-based fetch mock для тестирования нескольких последовательных API-вызовов в одном тесте
- [x] `2026-07-05T09:32:45Z` ver npm run typecheck → fail exit=1
- [x] `2026-07-05T09:32:45Z` ver npm run type-check → pass exit=0
- [x] `2026-07-05T09:31:30Z` ver npm run test -- cli/cmd/vcs-draft-note/**tests**/vcs-draft-note.test.ts → pass exit=0
- [x] `2026-07-05T09:33:00Z` discovery npm run format:check → fail exit=1: 7 pre-existing style issues in non-target files (inbox config tests, 5 task markdowns); target file clean
- [x] `2026-07-05T09:33:00Z` DONE
      **Handoff →** artifacts: [cli/cmd/vcs-draft-note/__tests__/vcs-draft-note.test.ts]; decisions: [mock-fetch-sequence=queue-based, delete-all-tests=5-BDD-scenarios]; open: [F1: npm run format:check fails project-wide (7 non-target files), F2: 7 pre-existing test failures in inbox config tests]

## Audit Rounds

### Audit Round 1 — 2026-07-05, after Execution Round 1

```
@audit task=TSK-97 round=1 after-exec-round=1 triggered-reopen=none status=FAIL counts=B1·M1·m1·I2 phases_to_fix=[P1]
F-01 | sev=B | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=— | src=AX_TASK_ID_INTEGRITY | route=ticket-update | act=добавить `<!--SECTION:META-->`/`<!--/SECTION:META-->` и остальные секционные якоря в тикет (META, PHASES_OVERVIEW, PHASE_P1, PHASE_P2, BDD, VERIFICATION, EXECUTION_LOG) — все 7 обязательных секций не имеют якорей, sdd extract возвращает ANCHOR_NOT_FOUND
F-02 | sev=M | type=EXECUTION_LOG_INCOMPLETE | conf=H | loc=tickets/agent-inbox/agent-inbox.task-97.md:5 | src=ticket§1 | route=ticket-update | act=обновить Meta.Status с `[ ] TODO` на `[x] DONE` — все фазы завершены
F-03 | sev=I | type=INSIGHT_BACKFLOW | conf=H | loc=specs/agent-inbox/agent-inbox.spec.md:153 | src=spec§4.4 AI-27 | route=spec-edit | act=обновить статус `vcs-draft-note --delete-all (AI-27)` с `not-implemented` на `real-runtime (проверено)` — фича реализована, тесты проходят
F-04 | sev=I | type=INSIGHT_BACKFLOW | conf=M | loc=tickets/agent-inbox/agent-inbox.task-97.md:43 | src=P1 insight log | route=ticket-update | act=заменить `npm run typecheck` на `npm run type-check` в §5 Verification — инсайт залогирован но тикет не обновлён
F-05 | sev=m | type=RULES_COMPLIANCE_VIOLATION | conf=H | loc=cli/cmd/vcs-draft-note/vcs-draft-note.cmd.ts:278 | src=AX_LOG_MESSAGE_PURITY | route=code-fix | act=заменить `'{ "deleted": 0 }\n'` (ручная строка с пробелами) на `JSON.stringify({ deleted: 0 }) + '\n'` для единообразного JSON-форматирования с остальными выводами
```
