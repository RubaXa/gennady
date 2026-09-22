# Task: AI-skip-fix — test-honesty: раскатка over-skip + shutdown hygiene (архитектор, same-day)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** AI-skip-fix
- **Status:** [ ] TODO
- **Purpose:** Ретро-тикет на исправление, выполненное архитектором 2026-08-08 после аудита AI-fasttest: агент skip'нул 17 describe-блоков вместо 5 доказанных red. Baseline-прогоном (worktree на HEAD) доказано: eval-driver 3/3, http-server 2/3, bootstrap 2/4, run-mode 2/5 были ЗЕЛЁНЫЕ на момент skip'а. Правило оператора: skip оправдан только при временной недоступности инфраструктуры.
- **Scope:** `agent-inbox`
- **Module:** test-infra
- **Dependencies:** AI-fasttest
- **Spec References:** [RUNBOOK](../../tasks/agent-inbox/RUNBOOK.md) §дисциплина
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`
- **Reopens:** 0
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | test | —    | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

<!--SECTION:PHASE_P1-->

### P1 — test

- **Objective:** Раскатать ошибочно пропущенные зелёные тесты и устранить удерживающие процесс ресурсы.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts`
  - `services/agent-inbox/serve/__tests__/run-mode.test.ts`
  - `services/agent-inbox/serve/__tests__/bootstrap.test.ts`
  - `services/agent-inbox/modules/inbox-api/__tests__/http-server.test.ts`
  - `services/agent-inbox/modules/inbox-roles/__tests__/reviewer.e2e.test.ts`
  - `services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts`
- **Inputs:** Результаты baseline-прогона из Purpose.
- **Exit:** `npm test`, `npm run test:integration`, type-check и lint проходят с документированными инфраструктурными skip.

<!--/SECTION:PHASE_P1-->

## 3. Что сделано (факт)

1. Раскатаны зелёные describe: eval-driver ×3, http-server (SPA fallback, live VCS truth), bootstrap (mock mode, default port, real mode), run-mode (effect dry-run, per-MR result shape).
2. `http-server` 'double start rejects' → переписан под намеренный контракт safe no-op (bootstrap вызывает start() после boot). **Найден источник hang >10 мин всей сьюиты**: упавший `assert.fail` до `server.stop()` оставлял открытый listener.
3. `bootstrap` mock-mode: assertion на legacy-контракт `{roles, unassigned}` → актуальный BoardProjection `{cards, syncState}` (D-306).
4. `bootstrap` after(): `server.stop()` → `gracefulShutdown` (scheduler/opencode таймеры держали процесс); остаточный open-handle срезан `--test-force-exit` в `test:integration`, root-cause вынесен в [IA-health](./inbox-api/inbox-api.task.IA-health.md) P1.
5. `reviewer.e2e.test.ts` — revert к D-116 honest-skip (единственный легитимный skip: нет GITLAB_PERSONAL_TOKEN = инфраструктура недоступна).
6. Оставшиеся RED (run-mode ×3, full-flow, orphan-restart) — маркер `[IA-health]` с честной причиной вместо blanket `[D-216]`.

<!--SECTION:VERIFICATION-->
<!--PHASE_RECEIPTS:v1-->

## 4. Verification (2026-08-08)

| Command                    | Required by | Role  |
| -------------------------- | ----------- | ----- |
| `npm test`                 | P1          | probe |
| `npm run test:integration` | P1          | probe |
| `npm run type-check`       | P1          | extra |
| `npm run lint:contracts`   | P1          | extra |
| `npm run format:check`     | P1          | extra |

<!--/SECTION:VERIFICATION-->

## Execution Log

<!--SECTION:EXECUTION_LOG-->

- 2026-09-21 migrated from v1 — no rounds/phases recorded in v1 format

### Round 1 — 2026-09-21, migration evidence reconciliation

#### P1

- [ ] migration reopened: prior phase evidence is incomplete

#### Round close

- [ ] migration round remains open until every phase has a CLI-owned receipt

<!--/SECTION:EXECUTION_LOG-->
