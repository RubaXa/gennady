# Task: TSK-103 — `inbox-review-plan --scaffold` / `--validate`: документный конвейер ревью

## 1. Meta

- **Task-ID:** TSK-103 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** inbox-review-plan | **Dependencies:** TSK-102 (существующая команда review-plan — расширяем её)
- **Purpose:** План ревью материализуется в документы: `--scaffold` создаёт болванки задач для каждого сабагента (механика: файлы, статусы, схемы таблиц), `--validate` детерминированно проверяет заполненность и схему. Механика создаёт структуру, оркестратор добавляет смысл, агенты заполняют, код валидирует.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-36, AI-08 | **Runtime:** not-implemented | **Verification:** unit

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox/_core/logic/state-paths.logic.ts` — добавить `reportsRoot(stateDir)` → `<stateDir>/agent-inbox/reports` и `mrReportsDir(stateDir, ref, headSha)` → `<reportsRoot>/<group__proj-iid>/<headSha7>` (нейминг как у worktrees: `/` → `__`).
  - `cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts` — два новых режима:
    - **`--scaffold --ref <ref>`** (в дополнение к текущим `--path`/`--base`): после построения `ReviewPlan` записать в `mrReportsDir`:
      - `PLAN.md` — frontmatter (`ref`, `headSha`, `base`, `mode`, `createdAt`) + таблица дорожек (track · files · lines · focus · status);
      - `tasks/<track>.task.md` — по болванке на дорожку (`mode: inline` → ОДНА болванка `tasks/review.task.md` со всеми файлами). Frontmatter: `{ ref, headSha, track, files: [...], status: scaffolded }`. Секции (фиксированный порядок): `## Scope` (prefilled механикой: список файлов + diff-статы + focus-пробы) · `## Context` (`<!-- FILL: orchestrator — смысл, сущности, prior threads, цели -->`) · `## Findings` (`<!-- FILL: agent -->`) · `## Candidates` (prefilled заголовок таблицы: `| ID | Файл | Строка | Проблема | Ось | Kind | Severity |`) · `## Verdict` (`<!-- FILL: agent -->`);
      - `README.md` — болванка сборки (секции: Обзор · Архитектура · Вердикты · Кандидаты · Треды), заполняет оркестратор;
      - `HISTORY.md` — уровнем выше (`<reportsRoot>/<group__proj-iid>/HISTORY.md`), создать если нет; НЕ перезаписывать (append-only, пишет оркестратор).
      - Вывод в JSON: `{ scaffolded: true, dir, plan: "<PLAN.md path>", tasks: [...] }`.
    - **`--validate <dir> [--stage enriched|filled]`** (default `filled`) — детерминированные проверки, вывод `{ok: true}` либо `{ok: false, errors: [{file, error}]}` + exit ≠ 0:
      - `enriched`: каждый task-файл имеет `status: enriched|filled`; `## Context` непуст или содержит `n/a — <причина>`;
      - `filled`: `status: filled`; `## Findings`/`## Verdict` непусты или `n/a — <причина>`; таблица `## Candidates` — заголовок соответствует схеме, `Kind` ∈ {new-line-comment, reply-to-thread, correction-reply, awaiting-my-reply, suggestion}, `Ось` ∈ {A–G, NAT, IDIOM, LIT, DEP, GLOBAL, TEST, SEC, BIZ, TYPO, CAUSE, LAYER, CHURN, FIGHT, RIPPLE, INPUT, PATH, AUTHZ, SECRET, SUPPLY, BLAST, INJ}; `headSha` frontmatter каждого task == `headSha` из PLAN.md (stale-защита); все ` ```mermaid `-блоки закрыты.
      - Валидируется только структура и словари токенов — НЕ длина текста (защита от «мусора ради валидации» — качеством занимаются директивы).
  - `cli/cmd/inbox/inbox.cmd.ts` — `--reset` дополнительно чистит `reportsRoot(stateDir)`.
  - `cli/cmd/inbox-review-plan/help.ts` (или help-секция в cmd) — описать `--scaffold`/`--validate`.
- **Exit:** scaffold создаёт полный набор документов с prefilled-механикой; validate ловит каждое нарушение схемы с точным указанием файла и ошибки; повторный scaffold на тот же headSha — идемпотентен (не затирает заполненные секции: если task-файл существует и `status != scaffolded` → пропустить с warning).

### P2 — test

- **Rules:** none
- **Target Files:** `cli/cmd/inbox-review-plan/inbox-review-plan.test.ts` — дополнить
- **Exit:** тесты на scaffold (fan_out → N болванок; inline → одна; идемпотентность), validate по каждому правилу, reset чистит reports

## 4. BDD

**Scaffold:**

- fan_out-план с дорожками security+logic+tests → `PLAN.md` + `tasks/security.task.md` + `tasks/logic.task.md` + `tasks/tests.task.md` + `README.md`; `HISTORY.md` создан уровнем выше
- inline-план → единственная `tasks/review.task.md` со всеми файлами
- Каждая болванка: frontmatter со `status: scaffolded`, `## Scope` заполнен файлами и статами, `## Context`/`## Findings`/`## Verdict` — FILL-маркеры
- Повторный `--scaffold`, task-файл уже `status: filled` → файл не перезаписан, warning
- `HISTORY.md` существует → не перезаписан

**Validate:**

- Все task-файлы `filled`, секции заполнены, токены валидны → `{ok: true}`, exit 0
- `--stage enriched`, один task со `status: scaffolded` → `{ok: false, errors: [...]}`, exit ≠ 0
- `## Context` пустой без `n/a` → ошибка с именем файла и секции
- `Kind: typo-fix` (не из словаря) → ошибка `invalid Kind token`
- `Ось: X` (не из словаря) → ошибка `invalid Ось token`
- task-файл с `headSha` ≠ headSha PLAN.md → ошибка `stale report`
- Незакрытый ` ```mermaid `-блок → ошибка `unclosed mermaid block`
- `## Findings` содержит `n/a — нет модификаций` → валидно (n/a с причиной разрешён)

**Reset:**

- `inbox --reset` → директория `<stateDir>/agent-inbox/reports` удалена

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- cli/cmd/inbox-review-plan/inbox-review-plan.test.ts` — pass
- `npm run format:check` — pass

## 7. Execution Log

### Round 1 — 2026-07-05, initial

#### P1

- [x] `2026-07-07T10:51:10Z` intro `reportsRoot` ← мех. путь `<stateDir>/agent-inbox/reports`, база для scaffold/validate/`inbox --reset` (TSK-103, AI-08)
- [x] `2026-07-07T10:51:10Z` intro `mrReportsDir` ← per-MR/per-headSha каталог отчётов, нейминг как у worktrees (TSK-103, AI-36)
- [x] `2026-07-07T10:51:10Z` decision headSha=git-rev-parse-HEAD-at-worktree ← `--scaffold` не принимает `--head-sha`; worktree уже стоит на голове MR (`vcs-worktree` контракт), поэтому headSha читается из самого worktree
- [x] `2026-07-07T10:51:10Z` decision inlineTrack=review ← inline-режим объединяет файлы всех треков плана в одну болванку `tasks/review.task.md`
- [x] `2026-07-07T10:51:10Z` decision idempotency=status-gate ← повторный `--scaffold` пропускает task-файл с warning в stderr, если `status` уже не `scaffolded`; PLAN.md/README.md/HISTORY.md — свои правила перезаписи (PLAN.md всегда, README/HISTORY только при отсутствии)
- [x] `2026-07-07T10:51:10Z` decision candidatesHeaderMatch=normalized-columns ← `--validate` сравнивает trimmed-ячейки заголовка таблицы Candidates со схемой колонок, не байтовое совпадение строки — терпимо к форматированию агента
- [x] `2026-07-07T10:51:10Z` ver /Users/k.lebedev/Developer/gennady/.claude/skills/sdd-execute/scripts/sdd verify cli/cmd/inbox/\_core/logic/state-paths.logic.ts cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts cli/cmd/inbox/inbox.cmd.ts → pass exit=0
- [x] `2026-07-07T10:51:10Z` ver npm run type-check → pass exit=0
- [x] `2026-07-07T10:51:10Z` ver npm run test -- cli/cmd/inbox-review-plan/inbox-review-plan.test.ts → pass exit=0
- [x] `2026-07-07T10:51:10Z` ver npm run format:check → pass exit=0
- [x] `2026-07-07T10:51:10Z` DONE
      **Handoff →** artifacts: [cli/cmd/inbox/\_core/logic/state-paths.logic.ts, cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts, cli/cmd/inbox/inbox.cmd.ts]; decisions: [D57, headSha=git-rev-parse-HEAD-at-worktree, inlineTrack=review, idempotency=status-gate, candidatesHeaderMatch=normalized-columns]; open: [O1: нет автотестов на --scaffold/--validate/--reset — P2 покрывает; O2: help.ts не создан, help-секция расширена инлайн в inbox-review-plan.cmd.ts]

#### P2

- [x] `2026-07-07T11:03:19Z` discovery P1 ver/Handoff строки в task-103.md ломали `npm run format:check` (неэкранированный `_core` вне backticks, `**Handoff →**` без 6-пробельного отступа под списком, как в остальных тикетах) — точечно исправлено экранирование/отступ без изменения контента P1, иначе MANDATORY §5 format:check gate не проходил ни для одной последующей фазы
- [x] `2026-07-07T11:03:19Z` ver /Users/k.lebedev/Developer/gennady/.claude/skills/sdd-execute/scripts/sdd verify cli/cmd/inbox-review-plan/inbox-review-plan.test.ts → pass exit=0
- [x] `2026-07-07T11:03:19Z` ver npm run type-check → pass exit=0
- [x] `2026-07-07T11:03:19Z` ver npm run test -- cli/cmd/inbox-review-plan/inbox-review-plan.test.ts → pass exit=0
- [x] `2026-07-07T11:03:19Z` ver npm run format:check → pass exit=0
- [x] `2026-07-07T11:03:19Z` DONE
      **Handoff →** artifacts: [cli/cmd/inbox-review-plan/inbox-review-plan.test.ts]; decisions: [scaffold-tests=git-fixture-fanout+inline+idempotent+history-not-overwritten, validate-tests=8-schema-rules-per-BDD, reset-test=spawns-inbox-cmd-with-state-dir]; open: []

#### Round close

- [x] `2026-07-07T11:05:00Z` sync agent-inbox+root
- [x] `2026-07-07T11:05:00Z` DONE
