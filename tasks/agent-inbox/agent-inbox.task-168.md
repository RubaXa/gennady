# Task: TSK-168 — test-honesty: раскатка over-skip + shutdown hygiene (архитектор, same-day)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-168
- **Status:** [x] DONE
- **Purpose:** Ретро-тикет на исправление, выполненное архитектором 2026-08-08 после аудита TSK-167: агент skip'нул 17 describe-блоков вместо 5 доказанных red. Baseline-прогоном (worktree на HEAD) доказано: eval-driver 3/3, http-server 2/3, bootstrap 2/4, run-mode 2/5 были ЗЕЛЁНЫЕ на момент skip'а. Правило оператора: skip оправдан только при временной недоступности инфраструктуры.
- **Scope:** `agent-inbox`
- **Module:** test-infra
- **Dependencies:** TSK-167
- **Spec References:** [RUNBOOK](RUNBOOK.md) §дисциплина
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Reopens:** 0
<!--/SECTION:META-->

## 2. Что сделано (факт)

1. Раскатаны зелёные describe: eval-driver ×3, http-server (SPA fallback, live VCS truth), bootstrap (mock mode, default port, real mode), run-mode (effect dry-run, per-MR result shape).
2. `http-server` 'double start rejects' → переписан под намеренный контракт safe no-op (bootstrap вызывает start() после boot). **Найден источник hang >10 мин всей сьюиты**: упавший `assert.fail` до `server.stop()` оставлял открытый listener.
3. `bootstrap` mock-mode: assertion на legacy-контракт `{roles, unassigned}` → актуальный BoardProjection `{cards, syncState}` (D-306).
4. `bootstrap` after(): `server.stop()` → `gracefulShutdown` (scheduler/opencode таймеры держали процесс); остаточный open-handle срезан `--test-force-exit` в `test:integration`, root-cause вынесен в [TSK-170](agent-inbox.task-170.md) P1.
5. `reviewer.e2e.test.ts` — revert к D-116 honest-skip (единственный легитимный skip: нет GITLAB_PERSONAL_TOKEN = инфраструктура недоступна).
6. Оставшиеся RED (run-mode ×3, full-flow, orphan-restart) — маркер `[TSK-170]` с честной причиной вместо blanket `[D-216]`.

## 3. Verification (2026-08-08)

- `npm test` → 2551 pass / 0 fail / 4 skipped / 34.9s, exit=0
- `npm run test:integration` → 28 pass / 0 fail / 3 skipped, exit=0 (bootstrap 9/9 включая real-mode opencode spawn)
- `npm run type-check`, `npm run lint:contracts`, prettier — clean
<!--/SECTION:META-->
