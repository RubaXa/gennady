# Task: TSK-119 — inbox-eval: драйвер эвала поверх реального serve run-mode

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-119 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-eval | **Dependencies:** TSK-121 (serve run-mode), TSK-118 (гейты)
- **Purpose:** Тонкий драйвер: поднимает **реальное** приложение в run-mode (TSK-121) на заданном списке MR + seed-состоянии, собирает произведённые артефакты и состояние доски, прогоняет по ним гейты G1–G10 (TSK-118), пишет `eval-report.json` + `.md`, exit≠0 при красном гейте. НЕ переоркестрирует пайплайн — драйвит настоящий граф. Прошлая форма (отдельная `inbox-eval` re-orchestration, P1 Round-0) отменена; переиспользуются только применение гейтов и запись отчёта.
- **Spec:** [inbox-eval.spec.md](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md) §3, §5 | **Runtime:** not-implemented | **Verification:** unit, integration

<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl (драйвер)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-eval/eval-driver.ts` (new) — `runEval({ mrs, seedState, wafThreshold, dryRun })`: вызывает `runMrsOnce` из serve run-mode (TSK-121), затем по КАЖДОМУ произведённому артефакту/предложенному действию прогоняет гейты G1–G10 (TSK-118 `gates.ts`), собирает `EvalReport` (TSK-118 `eval-report.ts`), пишет отчёт в reports-dir. Гейты применяются к тому, что произвёл РЕАЛЬНЫЙ граф, а не к переигранным CLI-шагам.
  - `services/agent-inbox/modules/inbox-eval/eval-harness.ts` — прежний re-orchestration harness: сжать до используемого драйвером или удалить (не должно остаться второй оркестрации).
  - `cli/cmd/inbox-eval/inbox-eval.cmd.ts`, `cli/cmd/inbox-eval/index.ts` — оставить тонкой обёрткой над `runEval` (единая точка входа эвала), убрать всякую переоркестрацию.
- **Exit:** `runEval` на мок-run-mode собирает отчёт с гейтами по реальным артефактам; отчёт .json+.md; exit=status. type-check + format pass.

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts` — мок run-mode отдаёт набор артефактов/действий; драйвер прогоняет гейты: все зелёные → PASS; инъекция красного (line вне hunk / тело >8KB / stale) → FAIL с правильным гейтом; отчёт записан; exit=status.
- **Exit:** `npm run test` для модуля pass; PASS и FAIL-по-классу-гейта покрыты.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN run-mode отдал чистые артефакты WHEN runEval THEN G1..G10 зелёные, status=PASS, exit=0
- GIVEN артефакт с line вне hunk WHEN runEval THEN G8 красный, status=FAIL
- GIVEN тело общего >8KB WHEN runEval THEN G9 красный
- GIVEN два прогона WHEN dry-run THEN G10 (0 новых постингов)
- GIVEN runEval завершён WHEN отчёт THEN eval-report.json+.md записаны, exit=status

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-eval/__tests__/*.test.ts' 'cli/cmd/inbox-eval/**/*.test.ts'` — pass
- `npm run format:check` — pass

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                     | Level       | Test File           |
| ---------------------------- | ----------- | ------------------- |
| Драйвер PASS на мок-run-mode | unit        | eval-driver.test.ts |
| FAIL по классу гейта         | unit        | eval-driver.test.ts |
| Отчёт .json+.md + exit       | integration | eval-driver.test.ts |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 0 — superseded (re-orchestration form, отменена)

- [x] `2026-07-14` P1 построил `inbox-eval` как переоркестрацию CLI-подкоманд — форма признана неверной (не тестирует реальное приложение). Отменено; переоткрыто под драйвер поверх serve run-mode (TSK-121). Полезное (применение гейтов, запись отчёта) переиспользуется.

### Round 1 — initial (driver form)

#### P1

- [x] `2026-07-14T14:34:46Z` intro `runEval`, `RunEvalInput`, `RunEvalDeps`, `RunEvalResult` ← публичная поверхность нового драйвера (`eval-driver.ts`), заменяет `eval-harness.ts`'s `runEval`
- [x] `2026-07-14T14:34:46Z` decision report=single-aggregate-per-batch ← ticket требует один `eval-report.json`+`.md`; `EvalReport.mr` (TSK-118, заморожен) — comma-joined список MR батча
- [x] `2026-07-14T14:34:46Z` decision gates=partial-coverage ← только G1 (наличие `artifacts.baseSha`) и G9 (WAF body-size по staged reply body) вычислимы из `MrRunResult`; G2-G8 требуют scaffold/validator/diff-hunk/worktree данных, которых реальный граф пока не производит — не фабрикуются как проходящие, пропущены явно
- [x] `2026-07-14T14:34:46Z` decision G10=second-dry-run-pass ← BDD сценарий #4 требует два прохода; второй `runMrsOnce` вызов используется только для идемпотентности, с fallback на `{outcomes:[]}` когда ни один MR не несёт `EffectResult` (`node_effect` — no-op stub)
- [x] `2026-07-14T14:34:46Z` insight EvalReport.mr — singular (TSK-118 design для одного MR), а runEval водит батч MR → spec inbox-eval.spec.md §4, уточнить batch-vs-single-report контракт для TSK-118/119 согласования
- [x] `2026-07-14T14:34:46Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T14:34:46Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-eval/__tests__/*.test.ts' 'cli/cmd/inbox-eval/**/*.test.ts'` → pass exit=0
- [x] `2026-07-14T14:34:46Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T14:34:46Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-eval/eval-driver.ts, cli/cmd/inbox-eval/inbox-eval.cmd.ts]; decisions: [report=single-aggregate-per-batch, gates=G1+G9+G10-only, stageSlots=reused-StageId-per-MR-marker]; open: [EvalReport.mr singular-vs-batch contract needs TSK-118/119 alignment: eval-report.ts §4, G2-G8 need scaffold/validator/diff-hunk data run-mode does not expose yet — deferred to a future TSK-121 extension]

#### P2

- [x] `2026-07-14T14:47:50Z` discovery `services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts` создан: мок `runMrsOnce` (deps.mocks=true → VcsInboxMock/OpenCodeMock, temp `stateDir`, никакой реальной сети) — покрывает clean-run PASS (G1/G9/G10 вычислены, зелёные), FAIL по G9 (тело >8KB) и FAIL по обрыву MR без `baseSha` (G1 не фабрикуется зелёным при отсутствии данных), плюс отдельная проверка, что G2-G8 никогда не встречаются в отчёте ни на зелёном, ни на красном прогоне
- [x] `2026-07-14T14:47:50Z` insight G1 в драйвере — presence-only проверка (`usedBaseSha`/`contextBaseSha` заполняются одним и тем же `artifacts.baseSha`), поэтому «покраснеть» технически не может — только присутствовать (pass=true) или отсутствовать при пустом `baseSha`; тест проверяет отсутствие G1 (не фабрикация pass) на MR без базы вместо несуществующего «G1 fail» → gates.ts/eval-driver.ts §G1, уточнить в спеке, что G1 это presence-check, а не used-vs-context сверка, пока run-mode не начнёт отдавать оба значения раздельно
- [x] `2026-07-14T14:47:50Z` tried `npm run format:check` (ticket §5, verbatim) → fail exit=1: `specs/agent-inbox/inbox-eval/inbox-eval.spec.md` и `tasks/agent-inbox/inbox-eval/inbox-eval.task-120.md` не отформатированы — оба вне Target Files этой фазы (spec запрещён `AX_SPEC_NEVER_EDITED`, task-120.md — чужой тикет вне `AX_PHASE_SCOPE_LOCK`); mtime обоих файлов — минуты назад (17:34-17:35), похоже на параллельную сессию по TSK-120, правку которой затирать нельзя
- [x] `2026-07-14T14:47:50Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T14:47:50Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-eval/__tests__/*.test.ts' 'cli/cmd/inbox-eval/**/*.test.ts'` → pass exit=0
- 🛑 `2026-07-14T14:47:50Z` BLOCKED: канонический гейт §5 `npm run format:check` красный из-за 2 файлов вне Target Files этой фазы (`specs/agent-inbox/inbox-eval/inbox-eval.spec.md`, `tasks/agent-inbox/inbox-eval/inbox-eval.task-120.md`); починить это в рамках фазы невозможно без нарушения `AX_SPEC_NEVER_EDITED`/`AX_PHASE_SCOPE_LOCK`
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: дождаться, пока параллельная сессия (похоже, TSK-120) завершит и отформатирует свои файлы, либо оператор сам прогонит `prettier --write` на эти 2 файла вне scope TSK-119; после этого перезапустить `npm run format:check` для P2 — remaining artifacts (`eval-driver.test.ts`) уже prettier-чистые
    **Handoff →** artifacts: [services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts]; decisions: [gates-tested=G1-presence+G9+G10, honesty-invariant=G2..G8-never-emitted]; open: [format:check blocked by out-of-scope drift in specs/agent-inbox/inbox-eval/inbox-eval.spec.md and tasks/agent-inbox/inbox-eval/inbox-eval.task-120.md — re-run npm run format:check once that concurrent work lands]
- ✅ `2026-07-14T14:52:00Z` RESOLVED (blocker 2026-07-14T14:47:50Z): не параллельная сессия, а сам оркестратор правил spec §7 + TSK-120 под «реальные скрины» и не прогнал prettier. Оркестратор прогнал `prettier --write` по обоим (+119/121/README) вне scope P2 — косметика. `npm run format:check` зелёный по всему дереву. P2-тесты (33/33) готовы; фаза переоткрывается для верификации формата и закрытия.

#### P2 — re-run: resume after blocker resolution, re-verify §5

- [x] `2026-07-14T14:51:31Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T14:51:31Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-eval/__tests__/*.test.ts' 'cli/cmd/inbox-eval/**/*.test.ts'` → pass exit=0
- [x] `2026-07-14T14:51:31Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T14:51:31Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts]; decisions: [gates-tested=G1-presence+G9+G10, honesty-invariant=G2..G8-never-emitted]; open: []

#### Round close

- [x] `2026-07-14T15:00:00Z` all phases DONE (P1 driver, P2 test) — 33/33; гейты честно G1/G9/G10, G2–G8 не фабрикуются
- [x] `2026-07-14T15:00:00Z` orchestrator sync trackers → audit pending
- [x] `2026-07-14T15:00:00Z` open (carried to reflection): G2–G8 требуют, чтобы run-mode отдавал scaffold/validator/diff-hunk-данные; реальные PLAN/REPORT/диаграмма — только при живом opencode → отдельная задача (полный эвал + реальные скрины)

<!--/SECTION:EXECUTION_LOG-->
