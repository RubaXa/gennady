# Task: TSK-93 — Worktree reuse + 7-дневный TTL (без явной очистки агентом)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-93 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** vcs-worktree | **Dependencies:** None
- **Purpose:** Worktree переиспользуется при повторном `inbox-context` (fetch + reset вместо delete + create). TTL = 7 дней от последнего обращения. Агент больше не удаляет worktree явно.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-09, AI-23 | **Runtime:** not-implemented | **Verification:** unit

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--SECTION:PHASES-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts` — `prepareMrWorktree()`: при существующем worktree → `git fetch origin +refs/merge-requests/N/head:... && git -C <worktree> reset --hard FETCH_HEAD`. При ошибке fetch **или** reset → fallback на полное пересоздание (delete + add). После успешного создания или обновления → `utimes(worktreePath, now, now)` (best-effort) для обновления mtime. **`gcStaleWorktrees` уже существует в этом файле** — получает TTL как параметр `ttlMs`, вызывается из `inbox-context.cmd.ts`.
  - `cli/cmd/inbox/inbox.cmd.ts` — добавить GC `gcStaleWorktrees(root, WORKTREE_TTL_MS, Date.now())` при запуске (после resolveStateDir, до getActionable). GC — best-effort, ошибки удаления не блокируют inbox.
  - `cli/cmd/inbox-context/inbox-context.cmd.ts` — изменить `WORKTREE_TTL_MS` с `3 * 60 * 60 * 1000` на `7 * 24 * 60 * 60 * 1000` (168ч). Порядок при `inbox-context`: сначала GC `gcStaleWorktrees(root, WORKTREE_TTL_MS, Date.now())` (кроме `--skip-worktree`), затем `prepareMrWorktree` (reuse или создание). GC запускается всегда, кроме `--skip-worktree`.
  - `ai/skills/agent-inbox/SKILL.md` — шаг 9 (Закрытие): убрать `vcs-worktree --cleanup <path>`. Оставить только `vcs-todo --done <ref>`.
  - `ai/skills/agent-inbox-take/SKILL.md` — найти и удалить любое упоминание `vcs-worktree --cleanup` или `worktree cleanup` (вероятно в шаге скаута или финализации). Если cleanup-инструкции нет — пропустить.
- **Exit:** worktree переживает сессии. Повторный `inbox-context` для того же MR — fetch + reset (~секунды) вместо полного пересоздания (~минуты). При ошибке fetch — fallback на recreate. GC по 7-дневному TTL предотвращает неограниченный рост диска. `--cleanup`/`--cleanup-all` у `vcs-worktree` продолжают работать.

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** none
- **Target Files:**
  - `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` — дополнить существующий файл (если нет — создать)
  - `cli/cmd/inbox-context/inbox-context.test.ts` — проверить `WORKTREE_TTL_MS === 7 * 24 * 60 * 60 * 1000`
- **Exit:** тесты на reuse (fetch+reset, не delete+add), создание нового, обновление mtime, GC с 7d TTL (stale удалён, свежий остался), fetch failure → fallback на recreate, TTL-константа.

<!--SECTION:BDD-->

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

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts` — pass
- `npm run test -- cli/cmd/inbox-context/inbox-context.test.ts` — pass
- `npm run format:check` — pass

<!--SECTION:DEPENDENCIES-->

## 6. Dependencies / Open questions

- `gcStaleWorktrees` уже существует в `worktree-ops.logic.ts:178` — получает TTL как параметр `ttlMs`
- `prepareMrWorktree` уже существует там же — требует только изменения логики reuse
- `WORKTREE_TTL_MS` — вынести в `worktree-ops.logic.ts` как экспортируемую константу (и `inbox.cmd.ts`, и `inbox-context.cmd.ts` импортируют её оттуда)
- AI-22 (error contract) — `not-implemented`, WORKTREE-ошибки пока используют существующий throw/console.error; маппинг на AI-22 — отдельный таск
- SKILL.md зеркало `.claude/skills/agent-inbox/` не существует (D42) — правим только `ai/skills/`

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1

#### P1

- [x] 2026-07-05T07:53:30Z intro WORKTREE_TTL_MS ← единая константа TTL (7d, 604800000ms), экспортирована из worktree-ops.logic.ts, импортируется inbox.cmd.ts и inbox-context.cmd.ts
- [x] 2026-07-05T07:53:30Z discovery SKILL.md step 9 already has no vcs-worktree --cleanup — contract satisfied, no change needed
- [x] 2026-07-05T07:53:30Z discovery agent-inbox-take/SKILL.md has no --cleanup mention — contract satisfied, no change needed
- [x] 2026-07-05T07:53:30Z discovery sdd verify blocked by classify-scripts.js CJS/ESM mismatch — fixed by renaming to .cjs + updating verify.sh reference
- [x] 2026-07-05T07:53:30Z discovery pre-existing @invariant word count (51) on resolveBaseSha — shortened to 19 words
- [x] 2026-07-05T07:53:30Z discovery pre-existing anchor typo START_SHALLOW_DEEN → START_SHALLOW_DEEPEN — fixed
- [x] 2026-07-05T07:53:30Z discovery §5 npm run typecheck does not exist as npm script (package.json uses type-check) — ticket §5 references non-existent script name; functional type-checking passed via sdd verify (npm run type-check)
- [x] 2026-07-05T07:53:30Z ver npm run typecheck → fail exit=1
- [x] 2026-07-05T07:53:30Z ver npm run format:check → pass exit=0
- [x] 2026-07-05T07:53:30Z DONE
      **Handoff →** artifacts: [cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts, cli/cmd/inbox/inbox.cmd.ts, cli/cmd/inbox-context/inbox-context.cmd.ts]; decisions: [WORKTREE_TTL_MS=exported-from-worktree-ops, reuse-strategy=fetch+reset-fallback-recreate, mtime-touch=best-effort, gc-on-inbox-startup=best-effort]; open: [TSK-93-1: §5 references npm run typecheck but script is type-check — ticket should be corrected]

#### P2

- [x] 2026-07-05T08:02:21Z ver npm run type-check → pass exit=0
- [x] 2026-07-05T08:02:21Z ver npm run lint:contracts → pass exit=0
- [x] 2026-07-05T08:02:21Z ver npm run test → pass exit=0
- [x] 2026-07-05T08:02:21Z ver npm run format:check → pass exit=0
- [x] 2026-07-05T08:02:21Z ver npm run typecheck → fail exit=1
- [x] 2026-07-05T08:02:21Z ver npm run test -- cli/cmd/vcs-worktree/\_core/logic/worktree-ops.test.ts → pass exit=0
- [x] 2026-07-05T08:02:21Z ver npm run test -- cli/cmd/inbox-context/inbox-context.test.ts → pass exit=0
- [x] 2026-07-05T08:02:21Z ver npm run format:check → pass exit=0
- [x] 2026-07-05T08:02:21Z DONE
      **Handoff →** artifacts: [cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts, cli/cmd/inbox-context/inbox-context.test.ts]; decisions: []; open: [TSK-93-1: §5 npm run typecheck script missing — actual name is type-check]
