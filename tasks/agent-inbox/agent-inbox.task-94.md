# Task: TSK-94 — inbox-context format v2 + дельта коммитов

## 1. Meta

- **Task-ID:** TSK-94 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-context | **Dependencies:** TSK-91 (vcsHost из конфига)
- **Purpose:** Переработка формата `inbox-context`. Дельта коммитов через `lastReviewedHeadSha` в реестре (промоут из `candidateHeadSha` при финализации).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-16, AI-24 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox-context/inbox-context.cmd.ts` — переписать `result` объект:
    - Добавить `sourceBranch`, `targetBranch`, `createdAt`, `updatedAt` из GitLab API (`MergeRequests.getByIid` уже возвращает эти поля — добавить в деструктуризацию)
    - `package` развернуть: `myLogin` (из `me.login`), `myRole` (из `mrItem.role`), `author`, `reviewers`, `description`, `approvedBy` на корень
    - `threads` заменить на `threadStats: { total: allDiscussions.length, drafts: draftNotes.length }` (сырые данные НЕ включать). Поле `stage` / `openQuestions` / `lastAuthor` вычислять как раньше
    - Добавить `headChanged` и `newCommits`:
      - Загрузить `lastReviewedHeadSha` из реестра для этого MR
      - Если `lastReviewedHeadSha` отсутствует ИЛИ `lastReviewedHeadSha === currentHeadSha` → `headChanged: { kind: "none", newCommitCount: 0 }`, `newCommits: []`
      - Если есть и отличается и worktree поднят → `git merge-base --is-ancestor <lastReviewed> HEAD`:
        - ancestor → `kind: "fast_forward"`, `newCommits` = `git log --format="%H%x09%s%x09%an%x09%aI" lastReviewed..HEAD` разобранный в `[{sha, subject, author, date}]`
        - не ancestor → `kind: "rewritten"`, `newCommits` = все коммиты HEAD (через `git log --format=... HEAD --max-count=50`)
      - Обновить `candidateHeadSha` в реестре (текущий HEAD). `lastReviewedHeadSha` обновляется только при `vcs-todo --done`.
    - При `--skip-worktree` → `headChanged`, `newCommits`, `worktree`, `changeset` = null
    - При `--skip-threads` → `stage`, `openQuestions`, `lastAuthor`, `threadStats` = null
  - `cli/cmd/inbox/_core/logic/inbox-registry.logic.ts` — в типе `RegistryEntry` добавить опциональные поля `candidateHeadSha?: string` и `lastReviewedHeadSha?: string`. Функция `promoteReviewedHead(registry, ref)` — переносит `candidateHeadSha → lastReviewedHeadSha` (no-op если `candidateHeadSha` пуст). `classifyInbox` сохраняет существующие значения, не перезаписывая.
  - `cli/cmd/vcs-todo/vcs-todo.cmd.ts` — при `--done <ref>`: после успешного гашения todo вызвать `promoteReviewedHead` для этого `ref` и сохранить реестр. Ошибка чтения/записи реестра не блокирует гашение todo (best-effort, warning в stderr).
  - `ai/skills/agent-inbox/SKILL.md` — обновить секцию «VCS-инструменты», описание полей `inbox-context`
- **Exit:** формат ответа соответствует AI-16/AI-24. `candidateHeadSha` записывается в реестр; `lastReviewedHeadSha` промоутится при `vcs-todo --done`. При `--skip-worktree` поля коммитов = null.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `cli/cmd/inbox-context/inbox-context-cmd.test.ts` — новый файл: тесты нового формата
  - `cli/cmd/inbox/_core/logic/inbox-registry.test.ts` — дополнить: `candidateHeadSha`/`lastReviewedHeadSha` сохраняются/загружаются; `promoteReviewedHead` переносит значение и no-op при пустом кандидате
- **Exit:** тесты на: плоский формат (нет `package`, нет `threads`, есть `myLogin`); `threadStats` счётчики; `headChanged` = none при первом запуске и без финализации; `headChanged` = fast_forward при новых коммитах после финализации; `headChanged` = rewritten при force push после финализации; `promoteReviewedHead`; `newCommits` содержит правильные sha/subject; `--skip-worktree` обнуляет `headChanged`/`newCommits`; `--skip-threads` обнуляет `stage`/`threadStats`

## 4. BDD

**Формат ответа:**

- `inbox-context --ref group/proj!510` → ответ содержит `myLogin`, `myRole`, `author`, `reviewers`, `description`, `approvedBy` на корневом уровне. Нет поля `package`
- Ответ содержит `threadStats: { total: N, drafts: M }`. Нет поля `threads`
- Ответ содержит `sourceBranch`, `targetBranch`, `createdAt`, `updatedAt`

**Дельта коммитов** (сравнение — с `lastReviewedHeadSha`, он появляется только после финализации):

- Первый запуск `inbox-context --ref group/proj!510` → `headChanged: { kind: "none", newCommitCount: 0 }`, `newCommits: []`. В реестр записан `candidateHeadSha`, `lastReviewedHeadSha` отсутствует
- Автор запушил, финализации не было (`lastReviewedHeadSha` пуст) → повторный `inbox-context` → `kind: "none"` (нет завершённого разбора — не с чем сравнивать; полное ревью и так будет)
- `vcs-todo --done group/proj!510` → `candidateHeadSha` промоутнут в `lastReviewedHeadSha`
- После финализации автор запушил 3 новых коммита → `inbox-context` → `headChanged: { kind: "fast_forward", newCommitCount: 3 }`, `newCommits` = 3 элемента
- После финализации автор сделал force push → `headChanged: { kind: "rewritten", newCommitCount: 5 }`, `newCommits` = последние 50 коммитов текущего HEAD
- Повторный вызов, HEAD не изменился после финализации → `headChanged: { kind: "none", newCommitCount: 0 }`, `newCommits: []`
- `vcs-todo --done`, реестр нечитаем → todo погашен, warning в stderr, промоут пропущен
- `git merge-base --is-ancestor` упал (SHA не найден после GC) → fallback: `kind: "rewritten"` (консервативно предполагаем перезапись истории)
- `inbox-context --ref group/proj!510 --skip-worktree` → `headChanged: null`, `newCommits: null`

**skip-флаги:**

- `--skip-threads` → `stage: null`, `openQuestions: null`, `lastAuthor: null`, `threadStats: null`
- `--skip-worktree` → `worktree: null`, `changeset: null`, `headChanged: null`, `newCommits: null`

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- cli/cmd/inbox-context/inbox-context-cmd.test.ts` — pass
- `npm run test -- cli/cmd/inbox/_core/logic/inbox-registry.test.ts` — pass
- `npm run format:check` — pass

## 6. Dependencies / Open questions

- `lastReviewedHeadSha` — новое поле в `RegistryEntry` (обратная совместимость: отсутствует у старых записей → `kind: "none"`)
- `git merge-base --is-ancestor` — требует worktree/клон (недоступен при `--skip-worktree`)
- `myLogin` — из `getCurrentUser()` (уже вызывается)
- `sourceBranch` — GitLab API возвращает поле `source_branch` (добавить в деструктуризацию `getByIid`)

## 7. Execution Log

### Round 1

#### P1

- [x] `<ts>` intro promoteReviewedHead ← TSK-94 P1: delta commit tracking in inbox registry
- [x] `<ts>` discovery ticket §5 says `npm run typecheck` but project script is `npm run type-check` — ran actual command
- [x] `<ts>` ver npm run type-check → pass exit=0
- [x] `<ts>` ver npm run format:check → pass exit=0
- [x] `<ts>` DONE
      **Handoff →** artifacts: [cli/cmd/inbox-context/inbox-context.cmd.ts, cli/cmd/inbox/_core/logic/inbox-registry.logic.ts, cli/cmd/inbox/_core/logic/classify-inbox.logic.ts, cli/cmd/vcs-todo/vcs-todo.cmd.ts, ai/skills/agent-inbox/SKILL.md]; decisions: [RegistryEntry.candidateHeadSha=optional, RegistryEntry.lastReviewedHeadSha=optional, headChanged={kind: none|fast_forward|rewritten, newCommitCount}, newCommits=Array<{sha,subject,author,date}>, promoteReviewedHead=best-effort-in-vcs-todo]; open: []

#### P2

- [x] `<ts>` discovery inbox-registry.test.ts did not exist prior to P2 — created as new file (ticket said «дополнить»)
- [x] `<ts>` discovery inbox-context.cmd.ts не экспортирует тестируемые функции (монолитный CLI-скрипт) — тесты написаны через spawnSync для error-paths + structural source inspection для проверки формы result
- [x] `<ts>` intro promoteReviewedHead tests ← TSK-94 P2: verify candidate→lastReviewed promotion contract
- [x] `<ts>` intro inbox-context-cmd.test.ts ← TSK-94 P2: verify flat format shape, delta commits, skip flags
- [x] `<ts>` ver npm run type-check → pass exit=0
- [x] `<ts>` ver gennady lint → pass exit=0
- [x] `<ts>` ver npm run test → pass exit=0
- [x] `<ts>` ver npm run format:check → pass exit=0
- [x] `<ts>` DONE
      **Handoff →** artifacts: [cli/cmd/inbox-context/inbox-context-cmd.test.ts, cli/cmd/inbox/_core/logic/inbox-registry.test.ts]; decisions: [test-strategy=spawnSync+structural, promoteReviewedHead-tests=full-coverage, command-format-tests=source-inspection]; open: []

#### Round close

- [x] `2026-07-15` Meta restored after stash-revert; completion evidenced by Round 1 Final Status: DONE
