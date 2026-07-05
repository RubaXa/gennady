# Task: TSK-93 — Worktree reuse + 7-дневный TTL (без явной очистки агентом)

## 1. Meta

- **Task-ID:** TSK-93 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** vcs-worktree | **Dependencies:** None
- **Purpose:** Worktree переиспользуется при повторном `inbox-context` (fetch + reset вместо delete + create). TTL = 7 дней от последнего обращения. Агент больше не удаляет worktree явно.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-09, AI-23 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts` — `prepareMrWorktree()`: при существующем worktree → `git fetch origin +refs/merge-requests/N/head:... && git -C <worktree> reset --hard FETCH_HEAD`. При ошибке fetch **или** reset → fallback на полное пересоздание (delete + add). После успешного создания или обновления → `utimes(worktreePath, now, now)` (best-effort) для обновления mtime. **`gcStaleWorktrees` уже существует в этом файле** — получает TTL как параметр `ttlMs`, вызывается из `inbox-context.cmd.ts`.
  - `cli/cmd/inbox/inbox.cmd.ts` — добавить GC `gcStaleWorktrees(root, WORKTREE_TTL_MS, Date.now())` при запуске (после resolveStateDir, до getActionable). GC — best-effort, ошибки удаления не блокируют inbox.
  - `cli/cmd/inbox-context/inbox-context.cmd.ts` — изменить `WORKTREE_TTL_MS` с `3 * 60 * 60 * 1000` на `7 * 24 * 60 * 60 * 1000` (168ч). Порядок при `inbox-context`: сначала GC `gcStaleWorktrees(root, WORKTREE_TTL_MS, Date.now())` (кроме `--skip-worktree`), затем `prepareMrWorktree` (reuse или создание). GC запускается всегда, кроме `--skip-worktree`.
  - `ai/skills/agent-inbox/SKILL.md` — шаг 9 (Закрытие): убрать `vcs-worktree --cleanup <path>`. Оставить только `vcs-todo --done <ref>`.
  - `ai/skills/agent-inbox-take/SKILL.md` — найти и удалить любое упоминание `vcs-worktree --cleanup` или `worktree cleanup` (вероятно в шаге скаута или финализации). Если cleanup-инструкции нет — пропустить.
- **Exit:** worktree переживает сессии. Повторный `inbox-context` для того же MR — fetch + reset (~секунды) вместо полного пересоздания (~минуты). При ошибке fetch — fallback на recreate. GC по 7-дневному TTL предотвращает неограниченный рост диска. `--cleanup`/`--cleanup-all` у `vcs-worktree` продолжают работать.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` — дополнить существующий файл (если нет — создать)
  - `cli/cmd/inbox-context/inbox-context.test.ts` — проверить `WORKTREE_TTL_MS === 7 * 24 * 60 * 60 * 1000`
- **Exit:** тесты на reuse (fetch+reset, не delete+add), создание нового, обновление mtime, GC с 7d TTL (stale удалён, свежий остался), fetch failure → fallback на recreate, TTL-константа.

## 4. BDD

- Worktree для MR `group/proj!510` создан → mtime = сейчас
- Через 1 день: `inbox-context --ref group/proj!510` → worktree найден, `git fetch` + `reset --hard`, mtime обновлён, changeset вычислен
- `inbox-context --ref group/proj!510`: `git fetch` успешен, но `git reset --hard` падает (lock/permission) → fallback на delete + recreate
- `inbox-context --ref group/proj!510`: `git fetch` падает (сеть/auth/MR удалён/lock) → fallback на delete + recreate
- `inbox-context --ref group/proj!510`: и fetch, и recreate падают → `WORKTREE` error (AI-22)
- `utimes(worktreePath)` падает (permission denied) → операция продолжается, ошибка подавлена, worktree создан/обновлён
- Через 8 дней без обращений: `inbox-context --ref group/proj!510` → GC удаляет stale worktree → `prepareMrWorktree` создаёт новый
- `inbox-context --ref group/proj!510 --skip-worktree` → GC не запускается, worktree не создаётся и не трогается
- `prepareMrWorktree` для нового MR (worktree нет) → создаёт, touch mtime
- `inbox --reset` → удаляет все worktrees (pre-existing, regression only)
- GC находит stale worktree, `rm -rf` падает (permission denied) → ошибка залогирована, `inbox`/`inbox-context` не заблокирован
- `vcs-worktree --cleanup <path>` → удаляет конкретный worktree

## 5. Verification

- `npm run typecheck` — pass
- `npm run test -- cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` — pass
- `npm run test -- cli/cmd/inbox-context/inbox-context.test.ts` — pass
- `npm run format:check` — pass

## 6. Dependencies / Open questions

- `gcStaleWorktrees` уже существует в `worktree-ops.logic.ts:178` — получает TTL как параметр `ttlMs`
- `prepareMrWorktree` уже существует там же — требует только изменения логики reuse
- `WORKTREE_TTL_MS` — вынести в `worktree-ops.logic.ts` как экспортируемую константу (и `inbox.cmd.ts`, и `inbox-context.cmd.ts` импортируют её оттуда)
- AI-22 (error contract) — `not-implemented`, WORKTREE-ошибки пока используют существующий throw/console.error; маппинг на AI-22 — отдельный таск
- SKILL.md зеркало `.claude/skills/agent-inbox/` не существует (D42) — правим только `ai/skills/`

## 7. Execution Log

### Round 1

#### P1

- [ ] **Handoff →** artifacts: [worktree-ops.logic.ts, inbox-context.cmd.ts, SKILL.md, agent-inbox-take/SKILL.md]; decisions: [D46]; open: []

#### P2

- [ ] **Handoff →** artifacts: [worktree-ops.test.ts, inbox-context.test.ts]; decisions: []; open: []
