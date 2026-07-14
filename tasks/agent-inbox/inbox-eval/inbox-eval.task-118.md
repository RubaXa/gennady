# Task: TSK-118 — inbox-eval: детерминированное ядро (diff-hunk + гейты G1–G10 + отчёт)

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-118 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-eval | **Dependencies:** TSK-113 (ArtifactValidator)
- **Purpose:** Детерминированное ядро эвала reviewer-пайплайна: парсер diff-hunk (файл→диапазоны newLine), реализация гейтов G1–G10 как чистых проверок `{gate, pass, evidence}`, типы+сериализация `eval-report`. Каждый гейт кодирует реальный слом из `SESSION-REFLECTION.md`.
- **Spec:** [inbox-eval.spec.md](../../specs/agent-inbox/inbox-eval/inbox-eval.spec.md) §4 Гейты | **Runtime:** not-implemented | **Verification:** unit

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

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `services/agent-inbox/modules/inbox-eval/diff-hunk.ts` — парсит `git diff --unified=0 base..HEAD -- <file>`, отдаёт карту файл→множество newLine, реально входящих в hunk (для G8). Учитывает особенность GitLab: строки после конца старого файла (см. рефлексию, гипотеза C6).
  - `services/agent-inbox/modules/inbox-eval/gates.ts` — G1..G10 как чистые функции: вход (context/artifacts/diff/proposed-actions), выход `GateResult { gate, pass, evidence }`. G1 base-sha-source, G2 scaffold-cleanup, G3/G5/G6 обёртки над результатом validate, G4 table-pipe-escaped, G7 mermaid (переиспользовать ArtifactValidator, TSK-113), G8 line-in-diff-hunk, G9 body-size-under-waf (порог параметризуем, дефолт 8192), G10 post-idempotent (`effect_applied`).
  - `services/agent-inbox/modules/inbox-eval/eval-report.ts` — типы `StageResult`/`GateResult`/`EvalReport` + сериализация JSON и Markdown; `status = PASS` ⇔ все гейты pass и все стадии done.
- **Exit:** type-check + format pass; гейты — чистые, без сети/диска кроме передаваемых входов (diff-hunk читает git через переданный runner).

<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/modules/inbox-eval/__tests__/diff-hunk.test.ts` — фикстуры diff → диапазоны; строка вне hunk; строка после конца старого файла.
  - `services/agent-inbox/modules/inbox-eval/__tests__/gates.test.ts` — каждый гейт: зелёный кейс + красный кейс с уликой (G1 пересчитанный merge-base≠base; G4 `|` в ячейке; G6 `## Архитектура (C4)`; G8 строка вне hunk; G9 тело >8KB; G10 повтор→0).
  - `services/agent-inbox/modules/inbox-eval/__tests__/eval-report.test.ts` — status=PASS только при всех зелёных; JSON+MD сериализация.
- **Exit:** `npm run test` для модуля pass; каждый гейт покрыт зелёным и красным.

<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. BDD

- GIVEN base≠diff_refs.base_sha WHEN G1 THEN pass=false + evidence(оба SHA)
- GIVEN `|` в ячейке filled-таблицы WHEN G4 THEN pass=false + файл/строка
- GIVEN `## Архитектура (C4)` WHEN G6 THEN pass=false
- GIVEN newLine вне diff-hunk WHEN G8 THEN pass=false + hunk-диапазоны
- GIVEN тело >8192 WHEN G9 THEN pass=false + размер
- GIVEN повторный dry-run WHEN G10 THEN 0 новых (effect_applied)
- GIVEN все гейты зелёные WHEN EvalReport THEN status=PASS

<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/modules/inbox-eval/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

| Scenario                       | Level | Test File           |
| ------------------------------ | ----- | ------------------- |
| diff-hunk: строка в/вне hunk   | unit  | diff-hunk.test.ts   |
| G1..G10 зелёный+красный        | unit  | gates.test.ts       |
| EvalReport status/сериализация | unit  | eval-report.test.ts |

<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — initial

#### P1

- [x] `2026-07-14T12:11:42Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T12:11:42Z` ver `npm run format:check` → fail exit=1 (only pre-existing out-of-scope files: `specs/agent-inbox/inbox-eval/inbox-eval.spec.md`, `tasks/agent-inbox/inbox-eval/inbox-eval.task-119.md`, `tasks/agent-inbox/inbox-eval/inbox-eval.task-120.md`, `tasks/agent-inbox/README.md`; all 3 P1 Target Files are clean per prettier)
- 🛑 `2026-07-14T12:11:42Z` BLOCKED: `npm run format:check` (§5, verbatim) fails project-wide on scaffold-generated spec/task/tracker files this phase may not touch
  - 🔗 axiom: AX_PHASE_SCOPE_LOCK
  - 💬 unblock: оператор запускает `npx prettier --write specs/agent-inbox/inbox-eval/inbox-eval.spec.md tasks/agent-inbox/inbox-eval/inbox-eval.task-119.md tasks/agent-inbox/inbox-eval/inbox-eval.task-120.md tasks/agent-inbox/README.md` (косметика, без смысловых правок) вне scope этой фазы, либо оркестратор явно расширяет Target Files/делегирует эту чистку отдельной задачей
- ✅ `2026-07-14T12:20:00Z` RESOLVED (blocker 2026-07-14T12:11:42Z): оркестратор прогнал `prettier --write` по 4 scaffold-файлам (spec/task-119/task-120/README) вне scope P1 — чисто косметика, без смысловых правок. `npm run format:check` теперь зелёный по всему дереву. P1-код (3 Target Files) был готов и чист; фаза переоткрывается для верификации и закрытия.

#### P1 — re-run: resume after blocker resolution, re-verify only

- [x] `2026-07-14T12:17:08Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T12:17:08Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-eval/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-14T12:17:08Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T12:17:08Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-eval/diff-hunk.ts, services/agent-inbox/modules/inbox-eval/gates.ts, services/agent-inbox/modules/inbox-eval/eval-report.ts]; decisions: [blocker-2026-07-14T12:11:42Z=resolved-by-orchestrator-prettier-write, test-cmd-0-tests=expected (P2 __tests__ dir not yet created)]; open: []

#### P2

- [x] `2026-07-14T12:21:55Z` ver `<sdd-path> verify services/agent-inbox/modules/inbox-eval/__tests__/diff-hunk.test.ts services/agent-inbox/modules/inbox-eval/__tests__/gates.test.ts services/agent-inbox/modules/inbox-eval/__tests__/eval-report.test.ts` → pass exit=0 (4/4 gates: typecheck, gennady lint, test, format)
- [x] `2026-07-14T12:21:55Z` ver `npm run type-check` → pass exit=0
- [x] `2026-07-14T12:21:55Z` ver `npm run test -- 'services/agent-inbox/modules/inbox-eval/__tests__/*.test.ts'` → pass exit=0
- [x] `2026-07-14T12:21:55Z` ver `npm run format:check` → pass exit=0
- [x] `2026-07-14T12:21:55Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-eval/__tests__/diff-hunk.test.ts, services/agent-inbox/modules/inbox-eval/__tests__/gates.test.ts, services/agent-inbox/modules/inbox-eval/__tests__/eval-report.test.ts]; decisions: [tests=28, suites=15, all-green+red-per-gate=true]; open: []

#### Round close

- [x] `2026-07-14T12:25:00Z` all phases DONE (P1 impl, P2 test) — 28 тестов, гейты G1–G10 green+red
- [x] `2026-07-14T12:25:00Z` orchestrator sync trackers → audit pending

<!--/SECTION:EXECUTION_LOG-->
