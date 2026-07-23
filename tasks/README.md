# Project Tasks

## Entry Points

- [Specs Portal](../specs/README.md) — Scope Graph + all scope specs.
- Tickets are picked up ONLY via `sdd-execute`. After `[x] DONE`, run `sdd-audit`.

## Project-Wide Conventions

### File-header Convention

Per `AX_FILE_HEADER_TASK_TRACEABILITY`:

```
// @file: <what the file holds>
// @consumers: <consumer-1, consumer-2, ...>
// @tasks: TSK-01, TSK-02
```

### Completion Rule (baseline)

A task cannot transition to `[x] DONE` until ALL of:

1. Every BDD scenario mapped to test ownership in §4 OR has `Deferred Test Ownership: <task-id>`.
2. Verification commands executed; results + exit codes recorded in Execution Log.
3. Canonical case names match real test cases or ticket updated.
4. `Deferred Runtime Scope` recorded if applicable.
5. Every introduced-beyond-Inventory entity logged as `Introduced <Name> because <reason>`.

Task-specific additions live in each ticket's §3.

### Execution Log Template

Per `AX_EXECUTION_LOG_PLAN_VS_FACT`. Each round = one open-to-DONE cycle; append-only; old rounds NEVER edited.

**Plan format (scaffolding pre-fills per ticket):**

```markdown
### Round 1 — <YYYY-MM-DD>, initial

- [ ] `[<ts>]` Task initialized.
- [ ] `[<ts>]` Implementation file: `<path>`.
- [ ] `[<ts>]` Test file: `<path>`.
- [ ] `[<ts>]` Verification: `<command>` → `<pass|fail>` [`exit=<code>`].
- [ ] `[<ts>]` Scenario coverage: `<scenario>` → `<test-file>::<case>`.
- [ ] `[<ts>]` Self-audit: walked loaded rule axioms against generated code. Violations: `<list or "none">`.
- [ ] `[<ts>]` Introduced (if any): `<Entity>` because `<reason>`.
- [ ] `[<ts>]` Tracker synced: `tasks/<scope>/README.md` + `tasks/README.md`.
- [ ] `[<ts>]` Status: [x] DONE.
```

⛔ `[x]` line with any unreplaced `<…>` literal = fabricated done.

### Post-task Hook

After `[x] DONE`, invoke `sdd-audit` on the ticket. Until audit returns PASS, round is closed-but-unverified.

## High-Level DAG

```mermaid
graph TD
    TSK-02 --> TSK-01
    TSK-03 --> TSK-02
    TSK-05 --> TSK-04
    TSK-07 --> TSK-06
    TSK-08 --> TSK-07
    TSK-09 --> TSK-08
    TSK-10 --> TSK-09
    TSK-11 --> TSK-10
    TSK-19 --> TSK-10
    TSK-20 --> TSK-10
    TSK-21 --> TSK-20
    TSK-13 --> TSK-12
    TSK-14 --> TSK-12
    TSK-15 --> TSK-12
    TSK-16 --> TSK-13
    TSK-16 --> TSK-14
    TSK-16 --> TSK-15
    TSK-17 --> TSK-16
    TSK-18 --> TSK-17
    TSK-32 --> TSK-16
    TSK-49[TSK-49: resolveTargets + LintCommand] --> TSK-16
    TSK-50[TSK-50: Tests resolveTargets + integration] --> TSK-49
    TSK-51[TSK-51: DisablesCheck D-007] --> TSK-50
    TSK-52[TSK-52: DisablesCheck purpose] --> TSK-51
    TSK-24 --> TSK-23
    TSK-25 --> TSK-23
    TSK-25 --> TSK-24
    TSK-26 --> TSK-23
    TSK-26 --> TSK-24
    TSK-26 --> TSK-25
    TSK-28 --> TSK-27
    TSK-29 --> TSK-28
    TSK-30 --> TSK-28
    TSK-31 --> TSK-27
    TSK-31 --> TSK-28
    TSK-31 --> TSK-29
    TSK-31 --> TSK-30
    TSK-34 --> TSK-33
    TSK-36 --> TSK-35
    TSK-37 --> TSK-35
    TSK-38 --> TSK-35
    TSK-38 --> TSK-36
    TSK-38 --> TSK-37
    TSK-39 --> TSK-35
    TSK-40 --> TSK-35
    TSK-41 --> TSK-36
    TSK-41 --> TSK-39
    TSK-46 --> TSK-45
    TSK-47 --> TSK-46
    TSK-47 --> TSK-48
    TSK-43 --> TSK-42
    TSK-44 --> TSK-42
    TSK-59[TSK-59: agents-rules command]
    TSK-68[TSK-68: vcs-context-resolver (cli)]
    TSK-68 --> TSK-69
    TSK-68 --> TSK-70
    TSK-67[TSK-67: vcs-client approve (vcs)]
    TSK-67 --> TSK-69
    TSK-69[TSK-69: vcs-approve (cli)]
    TSK-70[TSK-70: refactor VCS commands (cli)]
    TSK-71[TSK-71: resolveDiscussion port+adapter (vcs)]
    TSK-71 --> TSK-72
    TSK-72[TSK-72: vcs-reply resolve/reopen (cli)]
    TSK-138[TSK-138: Bootstrap mr-stats]
    TSK-138 --> TSK-139
    TSK-139[TSK-139: Core mr-stats]
```

## Tracker Index

| Scope             | Type           | Tracker                               | Tasks | Done  |
| ----------------- | -------------- | ------------------------------------- | ----- | ----- |
| dbc               | library        | [README](dbc/README.md)               | 14    | 14/14 |
| cli               | product        | [README](cli/README.md)               | 24    | 23/24 |
| vcs               | product        | [README](vcs/README.md)               | 7     | 7/7   |
| agent-mon         | library        | [README](agent-mon/README.md)         | 7     | 7/7   |
| agent-mon-cli     | product        | [README](agent-mon-cli/README.md)     | 4     | 0/4   |
| infra-npm-publish | infrastructure | [README](infra-npm-publish/README.md) | 3     | 3/3   |
| agent-run         | library        | [README](agent-run/README.md)         | 3     | 3/3   |
| agent-inbox       | product        | [README](agent-inbox/README.md)       | 55    | 52/55 |
| mr-stats          | product        | [README](mr-stats/README.md)          | 2     | 2/2   |

## Decision Log

- **D-201 (2026-07-17, agent-inbox scaffold extend-dag):** TSK-113 (`inbox-roles`) переоткрыт (Reopens: 1) вместо создания нового тикета для «session↔болванка + ToolPolicy» (D-118…D-123 refine). TSK-113 уже владеет `reviewer.role.ts`/`role-instance.ts`/`role-node.ts`/`artifact-validator.ts` (Round 1, DONE) и Round 1 Handoff уже фиксирует открытые разрывы («session узлы не пишут через EffectExecutor», «buildTaskText контракт») ровно в том месте, которое Round 2 закрывает — новый тикет дублировал бы Target Files и контекст. Per `AX_REOPEN_TICKET_FORMAT`: Round 2 добавлен append-only (P5/P6), старые Rounds не тронуты.
- **D-202 (2026-07-17, agent-inbox scaffold extend-dag):** TSK-137 (ArtifactValidator injection-coverage) остаётся ОТДЕЛЬНЫМ тикетом от TSK-113 Round 2, хотя оба трогают `artifact-validator.ts`/`inbox-roles`. Формально это сходится с «sequential split без (C) = overhead» (`AX_DAG_AND_TICKET_BOUNDARIES`), НО: (a) операторски заданная граница DAG явно разделяет «session-исполнение блванки» (TSK-113 Round 2) от «переопределение критерия гейта» (TSK-137) как разные предметные решения (D-118/AI-39 vs §5.3.1 «Гейт-граундинг»/D-86); (b) TSK-137 зависит от РЕЗУЛЬТАТА TSK-113 Round 2 (заполненные болванки с injected-ссылками), не может стартовать параллельно. Раздельные тикеты сохраняют чистую Round-историю TSK-113 (Round 2 не разрастается третьим предметом).
- **D-203 (2026-07-19, agent-inbox tracker sync):** TSK-134/TSK-136/TSK-113(P8) обнаружены с полностью реализованным и протестированным кодом на диске (`context-builder.ts` 12/12 тестов, `services/ai-kit/selector.ts` 29/29, `artifact-validator.ts` injection-coverage 16/16 — TSK-137 уже сам корректно нёс `[x] DONE`), но их Meta Status/Phases Overview всё ещё показывали TODO/IN_PROGRESS — чистое расхождение трекера, не пропущенная работа. Проверено запуском реальных тестов каждого модуля перед правкой статуса (не поверено на слово чекбоксам). Синхронизировано: TSK-113/TSK-134/TSK-136 → `[x] DONE`; `tasks/agent-inbox/README.md` Cascade Table и агрегированный счётчик здесь (41/48 → 45/48) приведены в соответствие.
- **D-204 (2026-07-22, agent-inbox scaffold extend-dag):** TSK-140 (реконсиляция + legacy-artifact recovery, SV-15…SV-18/D-127…D-129) — новый тикет, не reopen TSK-113, тот же паттерн, что D-202 (отдельное предметное решение — «восстановление состояния при старте», а не продолжение «session↔болванка»). Одна impl-фаза (не split на «скан» и «legacy-recovery» отдельно) — эти два куска работы тесно связаны (реконсиляция обнаруживает артефакт → recovery его перепроверяет) и правятся в одном файле/контексте, sequential split без (P)/(C) был бы чистым overhead (`AX_DAG_AND_TICKET_BOUNDARIES`). Acceptance живёт на РЕАЛЬНОМ MR оператора (`vk-workspace/superapp!599`, живой legacy-артефакт, найден live-снимком 2026-07-22), не на синтетической фикстуре (D-116).
- **D-206 (2026-07-22, agent-inbox live-verification):** TSK-145 переоткрыт (Round 2), не новый тикет — живой прогон против реального `hocuspocus/hocuspocus!18` через `gennady inbox serve` (не mock-режим) нашёл, что `getReport`'s disk-fallback путь (`board-provider.real.ts`) хардкодил `role: null`, блокируя author-панель (и саму фичу TSK-144-146) для ЛЮБОГО MR, восстановленного с диска — то есть для каждого MR после рестарта serve. Найдено ТОЛЬКО потому, что верификация шла на реальных данных через реальный production-путь (`gennady inbox serve`), а не на mock dev-seed — оператор явно указал на это как на системную ошибку процесса («это не живые данные»). Фикс: `role` теперь персистится в `review.json` при синтезе (`reviewer.role.ts`) и читается в disk-fallback. Отдельно найдено и зафиксировано: прод-бандл `dist/inbox-serve/` не пересобирается автоматически — нужен явный `npm run inbox-serve:build` перед live-verification через `inbox-serve-real`, иначе тестируется старый JS. Regression-тест на это конкретное расхождение не написан в этом раунде (открытый пункт, см. TSK-145 Round 2 Handoff).
- **D-207 (2026-07-22, agent-inbox live-verification):** TSK-113 переоткрыт (Round 4) — оператор заметил на живом скриншоте README «Поведение — n/a — не предоставлены синтезом» и потребовал разбора вместо плана. Корень — контрактный разрыв, не флаки модели: ни task-text `node_synthesize`/`node_synthesize_delta`, ни системная директива `synthesize.directive.hbs` вообще не просили `reviewReport.behavior`/`scenarios`; оба гейта (`gate_review_synthesis`/`gate_delta_synthesis`) проверяли только truthy `reviewReport`, пустой `{}` проходил. Фикс: промт+директива теперь явно требуют все 4 поля (summary/verdict/behavior/scenarios), гейты проверяют непустые строки реально, а `_fail_reason` (ранее только диагностика) теперь читается обратно в промт retry — гейт-фейл больше не повторяет тот же промт вслепую, это и есть детерминированный «не хватает → доделай» цикл, который просил оператор. 4 фикстуры существующих тестов дополнены (были неполными — тот же баг, зафиксированный тестами). Один pre-existing несвязанный баг мока (`reviewer-disk-artifact.test.ts` сценарий 4) остался, уже 4 раза подтверждён несвязанным в прошлых аудитах.
- **D-208 (2026-07-22, agent-inbox live-verification, продолжено автономно ночью):** Тот же Round 4 TSK-113 довершён живым прогоном на реальном, никогда не разбиравшемся MR `vk-workspace/superapp!523` (выбран вместо `hocuspocus/hocuspocus!18` — оператор явно запретил трогать общее состояние сессии через `rm` вне репозитория; нулевой риск, ничего не нужно было сбрасывать). Фикс D-207 подтверждён end-to-end: реальные «Поведение»/«Сценарии» по реальному диффу, не заглушка. Этим же прогоном найден ВТОРОЙ реальный баг (тот же класс, другое место контракта): линза `node_track_review` вернула текст находки под ключом `summary`, а сборщик (`_normalizeLensFindings`) распознавал только `message`/`detail` — реальная находка (задокументированная в вердикте README!) тихо терялась при сборке `review.json.findings`. Фикс: `summary` добавлен как синоним + промты всех линз явно фиксируют имя поля `message`. Regression-тест написан целенаправленно на этот живой баг. Полная регрессия зелёная (12/12 + 35/38, 1 fail — тот же нетронутый pre-existing баг мока, не эта правка).
