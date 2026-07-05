# Task: TSK-102 — `inbox-review-plan` command + `H_NO_REVIEW_PLAN` gate

## 1. Meta

- **Task-ID:** TSK-102 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-cli + directives + skills | **Dependencies:** TSK-91 (config signal), TSK-94 (inbox-context v2), TSK-95 (--url)
- **Purpose:** Детерминированный план ревью: `inbox-review-plan --path <worktree> --base <sha>` классифицирует diff-файлы по дорожкам (security/logic/ui/tests/docs/config/assets), применяет пороги fan-out (≤6 файлов, ≤300 строк, ≤1 содержательная дорожка → inline; иначе → fan_out). `inbox-context` сигналит `reviewPlanRequired: true`. `arch-interrogation` содержит `H_NO_REVIEW_PLAN`. SKILL.md take шаг 2 переписан на механическое исполнение.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-34 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts` — новая команда: `computeChangeset()` (git diff --numstat + --name-status), `classifyTrack()` (security/logic/ui/tests/docs/config/assets), `buildReviewPlan()` (пороги, ReviewPlan), `run()` (--path, --base, --help)
  - `cli/cmd/inbox-review-plan/index.ts` — точка входа
  - `cli/cmd/inbox-context/inbox-context.cmd.ts` — добавить `reviewPlanRequired: boolean` в ответ (true когда `stage === 'review_needed'` или `(stage === null && myRole === 'reviewer')` + worktree доступен)
  - `cli/gennady.ts` — диспетчеризация `inbox-review-plan` + help-секция
  - `ai/directives/agent-inbox/arch-interrogation.directive.xml` — добавить `H_NO_REVIEW_PLAN` в HaltConditions
  - `ai/skills/agent-inbox-take/SKILL.md` — переписать шаг 2: механическое исполнение, гейт `reviewPlanRequired`, вызов `inbox-review-plan`, диспетчеризация сабагентов строго по трекам. Обновить СТОП-ЧЕК.
  - `ai/skills/agent-inbox/SKILL.md` — добавить `inbox-review-plan` в таблицу VCS-инструментов, обновить описание `inbox-context` (поле `reviewPlanRequired`), добавить гейт в шаг 4.
  - `specs/agent-inbox/agent-inbox.spec.md` — добавить AI-34 в требования + Runtime Backing
- **Exit:** `inbox-review-plan --path <wt> --base <sha>` возвращает `ReviewPlan { mode, tracks[] }`. `reviewPlanRequired` в ответе inbox-context. `H_NO_REVIEW_PLAN` в директиве. SKILL.md take шаг 2 — чисто механический.

### P2 — test

- **Rules:** none
- **Target Files:**
  - `cli/cmd/inbox-review-plan/inbox-review-plan.test.ts` — новый файл
- **Exit:** тесты на: inline (≤6 файлов, ≤300 строк, 1 дорожка), fan_out (>6 файлов), fan_out (>300 строк), fan_out (>1 дорожка), security-файлы выделяются в отдельный трек, классификация по расширениям, assets пропускаются, пустой diff, ошибка при несуществующем worktree, --help

## 4. BDD

**`inbox-review-plan`:**

- 3 .ts файла, 100 строк → mode: "inline", 1 трек (logic)
- 7 .ts файлов, 200 строк → mode: "fan_out", треки по дорожкам
- 4 файла, 500 строк → mode: "fan_out" (строки > 300 даже при ≤6 файлах)
- 2 .ts + 2 .svelte + 1 .test.ts → 3 дорожки → fan_out
- Файл с путём `src/auth/token.ts` → трек "security" (не "logic")
- 5 .md + 2 .json → 0 meaningful треков, mode: "inline"
- Пустой diff (0 файлов) → mode: "inline", tracks: []
- Несуществующий worktree → `{"ok": false, "error": "WORKTREE", "detail": "..."}`, exit ≠ 0
- `--help` → usage текст, exit 0

**`inbox-context`:**

- `stage === 'review_needed'` + worktree → `reviewPlanRequired: true`
- `stage === 'reply_needed'` → `reviewPlanRequired: false`
- `--skip-worktree` → `reviewPlanRequired: false`
- `--skip-threads` + `myRole === 'reviewer'` + worktree → `reviewPlanRequired: true`

**SKILL.md / директивы:**

- take шаг 2 при `reviewPlanRequired: true` → HALT, вызывает `inbox-review-plan`
- take шаг 2 при `reviewPlanRequired: false` → пропускает
- `H_NO_REVIEW_PLAN` в arch-interrogation: `reviewPlanRequired && !reviewPlanLoaded` → STOP
- СТОП-ЧЕК: пункт «план загружен» проверяется

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- cli/cmd/inbox-review-plan/inbox-review-plan.test.ts` — pass
- `xmllint --noout ai/directives/agent-inbox/arch-interrogation.directive.xml` — pass
- `grep "inbox-review-plan" ai/skills/agent-inbox/SKILL.md` — found
- `grep "reviewPlanRequired" ai/skills/agent-inbox-take/SKILL.md` — found
- `grep "H_NO_REVIEW_PLAN" ai/directives/agent-inbox/arch-interrogation.directive.xml` — found

## 7. Execution Log

### Round 1

#### P1

- [ ] **Handoff →** artifacts: [inbox-review-plan.cmd.ts, index.ts, inbox-context.cmd.ts, gennady.ts, arch-interrogation.directive.xml, agent-inbox-take/SKILL.md, agent-inbox/SKILL.md, agent-inbox.spec.md]; decisions: [AI-34, H_NO_REVIEW_PLAN]; open: []

#### P2

- [ ] **Handoff →** artifacts: [inbox-review-plan.test.ts]; decisions: []; open: []
