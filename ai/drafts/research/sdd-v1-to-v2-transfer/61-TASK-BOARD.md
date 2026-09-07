# 61 — Сводная доска задач (треки 20, 30–50) + волны исполнения + первые пять брифов

> Статус: пишется (черновик). Источники: `01-INTERVIEW-DECISIONS.md` (D-1..D-30), `02-LEAD-DECISIONS.md` (L-1..L-15), `20-ISSUES-VERDICTS.md` (ISS-1..13, LOCK-1..3), `30-TRACK-VERIFY.md` §6 (V-01..V-18 + V-04a), `31-TRACK-CHECK-LOG.md` §4.1 (B2-01..18), `32-TRACK-SYNC-OWNERSHIP.md` §4.1 (SO-1..14 + SO-2b), `33-TRACK-RULES.md` §5 (T-1..T-14), `34-TRACK-RELEASE-PACKAGE.md` §8 (REL-1..14 + REL-15 по D-10/D-30), `40-TRACK-DIRECTIVES-SKILLS.md` §5.1 (T-B6-01..27), `50-TRACK-EVAL.md` §4 (E-00..E-16), `60-ACCEPTANCE.md` (A1..A10), `70-ORCHESTRATION-PROTOCOL.md` (шаблон брифа).
> Легенда решений: **D-N** — глобальное решение оператора (`01-INTERVIEW-DECISIONS.md`); **L-N** — техническое решение Lead (`02-LEAD-DECISIONS.md`, отменяемо оператором); **Q-<трек>** — вопрос оператору внутри трека, ещё без глобального D-номера (см. `00-INDEX.md` §4).
> «Закрывает»: **#N** — issue akkrat; **A1..A10** — критерий приёмки (`60-ACCEPTANCE.md`); **C*/S*/R*/D*/P*/И*/O-N** — инварианты соответствующих треков (C — CHECK-LOG doc31, S/R — SYNC/RULES doc32/33, D — DIRECTIVES doc40 разделы, П/И — VERIFY doc30 инварианты, O-N — открытый вопрос из `00-INDEX.md` §4).

---

## 1. Мастер-таблица задач

Столбцы: **ID** · **Трек** · **Цель** · **Файлы** · **Размер** (S/M/L) · **Зависит от** · **Eval/тест** · **Закрывает** · **Решение** · **Блокер релиза** · **Статус** · **Дубли/связи**.

Статусы: `ГОТОВ К ВЫДАЧЕ` — нет незакрытых зависимостей и нет открытого решения оператора, можно выдавать сейчас; `ЧЕРНОВИК` — зависит от другой задачи плана (пока не выполненной), решений не требует; `ЗАБЛОКИРОВАН <причина>` — стоит открытое решение оператора (D-23/D-24/D-26, открытый Q-* трека) или не полностью выясненная формулировка.

Разделительные строки (`▼ ТРЕК`) — только навигация, не задачи.

| ID | Трек | Цель | Файлы | Размер | Зависит от | Eval/тест | Закрывает | Решение | Блокер релиза | Статус | Дубли/связи |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **▼ ISS/LOCK** | — | — | — | — | — | — | — | — | — | — | — |
| ISS-1 | ISS | `SDD_NO_TICKETS_FOUND` (error, exit 2) на пустом `--all`/`--changed`; поправить дрейф `sdd-migrate/help.ts:14` | `sdd-check.cmd.ts`, `sdd-migrate/help.ts:14` | S | — | G4, G3 | #9.1, C2 | — | нет | владелец задачи — **B2-05** | **дубль B2-05** (владелец); ISS-1 закрывается вместе с ней |
| ISS-2 | ISS | Единый список исходных расширений (Swift/ObjC/…) для consumers/BDD-index/`yagni` | `shared/sdd/source-extensions.ts` | S | — | G1 | #9.2 | — | нет | владелец — **B2-12** | **дубль B2-12** (владелец) |
| ISS-3 | ISS | Манифест orphan-скиллов, чтобы `sync-skills` не удалял проектные скиллы | `sync-skills-core.ts` | S | — | G2 | #9.4, A4 | D-6, D-22 | **ДА** | владелец — **SO-2 + SO-2b** | **дубль SO-2/SO-2b** (владельцы) |
| ISS-4 | ISS | `extraGates[].when` — стек-независимый план гейтов с файловой областью | `phase-verification-plan.ts`, `stack-config.ts` | L | V-07, V-08, V-12 | G1 | #9-bonus | — | нет | владелец — **V-12** (+V-07/V-08) | **дубль V-12** (владелец, часть общего Effort L с #20/ISS-9) |
| ISS-5 | ISS | Причинный `Reopens`: Meta ↔ `@audit … triggered-reopen` | `check.ts` | M | B2-01 | G3 | #13 | — | нет | владелец — **B2-06** | **дубль B2-06** (владелец); companion **T-B6-17** (сборка `ax-stale-after-pivot-verification`) |
| ISS-6 | ISS | `nextRoundNumber` — по секции EXECUTION_LOG, не по файлу; миграция `### Round N` под `## Critic Rounds` → `### Critic Round N` | `sdd-log.types.ts:76-79`, `migration-v1-v2.directive.xml` | S | B2-16 | G4, G3 | #15 | — | нет | владелец — **B2-02** | **дубль B2-02** (владелец) |
| ISS-7 | ISS | Вывод зелёного гейта не теряется: конвенция `[gate] ` | `sdd-verify.types.ts` | S | V-03 | G1 | #17 | D-19 | нет | владелец — **V-14** | **дубль V-14** (владелец) |
| ISS-8 | ISS | Именованное исключение `git`-запрета для throwaway-репозитория в `.claude/tmp/`; §5-гейт как отдельный барьер | `ax-permitted-bash-commands.xml` | M | T-B6-08, T-B6-12 | G1, G3 | #19 | — | нет | ЧЕРНОВИК (после T-B6-08/12) | связан с **T-B6-12** (сборка аксиома), **T-B6-08** (двусторонний lint) |
| ISS-9 | ISS | `verify --wip <files>`/`--only` — файловая область и новый гейт по префиксу/glob | `stack-config.ts`, `verify.cmd.ts` | L | V-03, V-07 | G1 | #20 | — | нет | владелец — **V-12 + V-13** | **дубль V-12/V-13** (владельцы), общий Effort с ISS-4 |
| ISS-10 | ISS | Критик читает `## Conventions`/`## Decision Log` владельца тикета через `sdd-extract` | `critic-protocol.directive.hbs` | S | T-B6-21 (не собирает в мёртвый файл) | G3 | #21 | — | нет | ЧЕРНОВИК | координировать с **T-B6-21/T-B6-03** (тот же файл) |
| ISS-11 | ISS | Грамматика провенанса Handoff: `measured\|reported\|assumed`, extent у `open` | `contract/process/handoff-format`, `sdd-log.types.ts:248-249` | M | — | G3 | #22 | — | нет | ГОТОВ К ВЫДАЧЕ | координировать файлы с **B2-14** (тот же скелет Handoff) |
| ISS-12 | ISS | Токен `correction` в словаре + валидация `sdd-log line` + порт детекции записи в закрытый раунд | `execute.directive.hbs`, `sdd-log.cmd.ts` | M | B2-16 | G3 | #23 | L-1..L-3 | нет | владелец — **B2-03 + B2-04** | **дубль B2-03/B2-04** (владельцы) |
| ISS-13 | ISS | `PROJECT_OWNED_ENTRIES`+`preserved` для `knowledge.xml`; манифест директив; зеркальное удаление только по манифесту | `sync-core.ts` | M | — | G2 | #24, A4 | D-6, D-22 | **ДА** | владелец — **SO-1 + SO-7 + SO-11** | **дубль SO-1/SO-7/SO-11** (владельцы) |
| LOCK-1 | ISS | Замок-тест: `model:` пин никогда не возвращается | `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` | S | — | G3 | #9.5 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| LOCK-2 | ISS | Замок-тест: `~/.claude/skills` не встречается в rendered-директивах | contract-тест по `ai/**` | S | — | G2 | #11 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| LOCK-3 | ISS | Замок-тест: `DIRECTIVE ACTIVATED` не встречается в скиллах/директивах | contract-тест по `ai/skills/**/SKILL.md` | S | — | G3 | #16 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| **▼ V — VERIFY** | — | — | — | — | — | — | — | — | — | — | — |
| V-01 | V | Golden текущего поведения RC verify (ступени, строки команд, receipt, 8 дыр §3.1.3) | `preset-node-golden.test.ts`, `parity-node.test.ts` | M | — | golden-тест | И-1..И-3 (базовый) | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| V-02 | V | Перенос примитивов MAIN verbatim (`env-fail`, `stack-config`, `plugins/{anystack,golang}`) + правка `test-topology.ts`/`tsconfig.json` | `shared/verify/*`, `plugins/**`, `scripts/test-topology.ts` | M | V-01 | детерм. (106 перенесённых тестов) | А6 | — | нет | ЧЕРНОВИК | — |
| V-03 | V | `Gate`/`GateStatus` как данные: `env-fail\|timeout\|violation` | `sdd-verify.types.ts:21-44` | M | V-02 | детерм. | А6 | — | нет | ЧЕРНОВИК | — |
| V-04 | V | `resolvePreset(stack, profile, root, config)` + node-пресет байт-в-байт | `shared/verify/presets/node.ts` | M | V-03 | детерм. + V-01 golden | А6, D-17 | D-17 | нет | ЧЕРНОВИК | — |
| V-04a | V | Источник fingerprint'а (`environmentState`) как обязанность пресета — закрывает И-3 | `phase-receipt.ts:1127-1254` | M | V-04 | детерм. (матрица npm/pnpm/yarn) | И-3 | — | нет | ЧЕРНОВИК | — |
| V-05 | V | Детект стека из репозитория + факт в снапшоте (`STACK=`, `STACK_SOURCE=`) | `shared/verify/stack-detection.ts`, `sdd-state.cmd.ts` | M | V-02 | детерм. | 2.2, 3.2 (роутер) | — | нет | ЧЕРНОВИК | дубль-предупреждение: не путать с директивной половиной **T-B6-06** |
| V-06 | V | Readiness: движок + node-адаптер байт-в-байт + тривиальный anystack-адаптер; снять eval-шим | `readiness.ts:15-24,296-609`, `ladder.ts`, `gate-queue.ts` | L | V-05, V-04a | детерм. + `check:directives-fresh` | А6, D-14 | D-14 | нет | ЧЕРНОВИК | самый большой L в критическом пути |
| V-07 | V | Конфиг-контракт `gennady.yaml` секция `stack:` (deep-merge, провенанс, exit 4) | `shared/verify/stack-config.ts` | M | V-02, V-03 | G1 (fixture-detmig) | А6 | — | нет | ЧЕРНОВИК | трогает спеки (`specs/stack\|config\|plugins/**`) |
| V-08 | V | anystack в фазовой модели: read-only гейты из `gennady.yaml`, фиксированный порядок в `gatePlan` | `shared/verify/presets/anystack.ts` | M | V-07, V-04a | G1 (fixture-detmig) | А6, D-16 | D-16 | нет | ЧЕРНОВИК | первый нестандартный стек (D-16) |
| V-09 | V | golang-пресет: плагин verbatim + маппинг ладдера + `environmentState` | `plugins/golang/**`, `shared/verify/presets/golang.ts` | M | V-05, V-03, V-04a | G1 | А6, D-16 | D-16 | нет | ЧЕРНОВИК | параллелен V-10/V-11 |
| V-10 | V | python-пресет + coverage-адаптер | `plugins/python/**`, `coverage-py-adapter.ts` | M | V-05, V-04a | G1 | А6, D-16, D-25 | D-16, D-25 | нет | ЧЕРНОВИК | параллелен V-09/V-11 |
| V-11 | V | swift-пресет + `xccov`-адаптер + стратегия обхода `workspace-mutation` (10 ГБ DerivedData) | `plugins/swift/**`, `xccov-coverage-adapter.ts` | L | V-05, V-04a | G1 (fixture-detmig) | А6, D-15, D-16 | D-15, D-16 | нет | ЧЕРНОВИК | параллелен V-09/V-10 |
| V-12 | V | `when: [<glob>]` на гейт + сужение по Target Files фазы; отсечённый гейт виден в receipt | `stack-config.ts:34-45`, `phase-context.ts:169-239` | M | V-03, V-07 | G1 | #9-bonus, #20(i), ISS-4, ISS-9 | D-18 | нет | ЧЕРНОВИК | владелец **ISS-4** и части **ISS-9** |
| V-13 | V | `--only/--skip` доступны только `gennady verify`/`--profile full`; запрещены при `--task/--phase` | `verify.cmd.ts:69-71,166-212` | M | V-03, V-07 | G1 | #20(iii), ISS-9 | — | нет | ЧЕРНОВИК | владелец части **ISS-9** |
| V-14 | V | `[gate] `-префикс переживает вердикт; опциональный `showOutputOnPass` | `sdd-verify.types.ts:288-315` | M | V-03 | G1 | #17, ISS-7 | D-19 | нет | ЧЕРНОВИК | владелец **ISS-7** |
| V-15 | V | Директивы/`.hbs`/rules cascade для verify; `baseline-testing.xml` + запись в `knowledge.xml` | `readiness/infra/router/audit/phase-execution-protocol.directive.hbs` | M | V-06 (частично; зависимость от V-05 снята) | `check:directives-fresh` | А6 | — | нет | ЧЕРНОВИК | пересекается текстово с **T-1** (RULES) |
| V-16 | V | Суженные фасады: `gennady verify --plan --json` read-only; `gennady fix` — только с `RepairMutationBoundary` | `cli/cmd/verify/**`, `cli/cmd/fix/**` | S+S | V-04, V-07 | детерм. | D-13, А9 | D-13 (read-only часть); **Q8 открыт** (fix-часть) | нет | ЗАБЛОКИРОВАН Q8 (fix: глагол или флаг) — read-only часть ЧЕРНОВИК | — |
| V-17 | V | Снятие v1-корпуса verify (`verify.sh`, `gennady verify --wip <files>` в директивах/скиллах) | `phase-execution-protocol.xml`, `sdd-execute/SKILL.md`, `verify.sh` | S | V-15, V-16 | детерм. (grep=0) | A5 | 1.1, 3.4, D-27 | нет | ЧЕРНОВИК | часть v1-удаления (волна 5) |
| V-18 | V | Single-flight фазового verify: протокол или lock против ложных мутаций | `sdd-verify/{phase-run,workspace-mutation}.ts` | S/M | V-06 | детерм. или явное решение в спеке | O-4 (частично, связано с D-26) | — | нет | ЧЕРНОВИК | связан с **T-B6-04** (batch-параллель, D-26) |
| **▼ B2 — CHECK-LOG** | — | — | — | — | — | — | — | — | — | — | — |
| B2-16 | B2 | Проставить `<!--PHASE_RECEIPTS:v1-->` на корпусе + `firstRoundPhaseBlockCounts` на «текущий раунд» | `check.ts:219-241`, `group-receipt.ts:298` | M | — | детерм. | D4 (доc31), D-4 (глоб.) | L-2, D-4 | нет | ЧЕРНОВИК | наивысший приоритет трека B2 |
| B2-07 | B2 | `SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE`; `sdd-log close` отказывает без receipt | `check.ts`, `phase-receipt-check.ts`, `sdd-log.types.ts:124-179` | M | B2-16 | детерм. | C6, C10 | D-21 (group receipt в pickable, смежно) | нет | ЧЕРНОВИК | — |
| B2-04 | B2 | `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE`/`_CLOSE_EXTRA_ENTRY`/`_ENTRY_LATER_THAN_CLOSE`/`_ROUND_UNCLOSED` | `check.ts`, `sdd-log.cmd.ts:420,433-469` | M | B2-16, B2-07 | детерм. + golden `DA-lazy-asm` | C6, #23 | L-3 | нет | ЧЕРНОВИК | владеет частью **ISS-12** |
| B2-02 | B2 | `nextRoundNumber` — только секция EXECUTION_LOG; миграция legacy `### Round N` → `### Critic Round N` | `sdd-log.types.ts:76-79`, `group-receipt.ts:64-68` | S (в связке с B2-01) | B2-16 | детерм. | C7, #15, ISS-6 | — | нет | ЧЕРНОВИК | владелец **ISS-6** |
| B2-03 | B2 | `TOKEN_VOCABULARY` — один дом; добавить `correction`; согласовать `ver`/`yagni`/`fix`/`env-fix` | `shared/sdd/execution-log.ts`, `templates.ts:1581` | M | — | детерм. | C11, #23, ISS-12 | L-1 (`ver`) | нет | ГОТОВ К ВЫДАЧЕ | владелец части **ISS-12** |
| B2-01 | B2 | Единый парсер Execution Log (`parseExecutionLog`), консолидирует B2-02/04/07 | новый `shared/sdd/execution-log.ts` | L | B2-02, B2-04, B2-07 | детерм. (существующие сюиты остаются зелёными) | C1..C15 (структурный фундамент) | — | нет | ЧЕРНОВИК | — |
| B2-06 | B2 | Причинный `Reopens`: `parseAuditRounds` + `SDD_REOPENS_MISMATCH`/`_PENDING` | `check.ts`, `sdd-log.cmd.ts:433-435,479` | M | B2-01 | новый `reopens.test.ts` | C8, #13, ISS-5 | D-20 | нет | ЧЕРНОВИК | владелец **ISS-5**; companion **T-B6-17** |
| B2-05 | B2 | `SDD_NO_TICKETS_FOUND` (error, exit 2) для `--all`/`--changed`; P5 (документировать exit 2) + P6 (симметрия `--all`/`--task` на legacy) | `sdd-check.cmd.ts:1275-1295`, `help.ts` | S | — | детерм. | #9.1, C2, ISS-1 | — | нет | ГОТОВ К ВЫДАЧЕ | владелец **ISS-1** |
| B2-08 | B2 | `ax-reopen-format.xml` под структуру v2 (4-колоночная `PHASES_OVERVIEW`, форма реопена по D-20) | `ax-reopen-format.xml`, `reconcile.directive.xml` | M | — | детерм. | C8, D2/D6(doc31) | D-20 | нет | ГОТОВ К ВЫДАЧЕ | — |
| B2-09 | B2 | `parsePhasesOverview` устойчив к v1-заголовкам (щит по именам колонок) | `ticket.ts:202-203`, `sdd-log.types.ts:295-311` | S | — | детерм. (фикстура `cli-lint.task-14.md`) | A1 (самомиграция) | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| B2-10 | B2 | Миграция якорей: `### Phase P1`/`Phases Overview` на уровне `###`; явный отказ без `PHASES_OVERVIEW` | `anchor-inject.ts:12-28`, `migration-plan.ts` | L | — | детерм. (2 фикстуры + 50 уже мигрированных тикетов) | A1, A2 | — | нет | ЧЕРНОВИК (требует инвентаризации 50 тикетов) | — |
| B2-11 | B2 | Синхронизировать `STEP_1_MECHANICAL.xml` с фактическим набором кодов `sdd-check` | `audit/steps/STEP_1_MECHANICAL.xml`, `ax-task-id-integrity.xml` | S | — | `check-directives-fresh` + coverage-тест кодов | D5 (doc31) | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| B2-12 | B2 | Единый `shared/sdd/source-extensions.ts` для consumers/BDD-index; вернуть механический orphan-`@tasks` | новый `source-extensions.ts`, `sdd-check.cmd.ts:503,699-701` | M | — | фикстура `Foo.swift`+`FooTests.swift` | #9.2, ISS-2, G1 | — | нет | ГОТОВ К ВЫДАЧЕ | владелец **ISS-2** |
| B2-13 | B2 | Убрать необеспеченную прозу `TECHNICAL_REPLAN_EXHAUSTED`/кросс-спековую блокировку без реализации | `execute.directive.xml:88-99`, `ax-audit-hook.xml` | M | — | `check-pickable.test.ts` (по выбранному варианту) | D3 (doc31) | D-21 | нет | ЧЕРНОВИК (ждёт выбора варианта D3) | — |
| B2-14 | B2 | Согласовать скелет Handoff (3 копии vs 4-польная запись `complete`) | `task-ticket-structure.xml:147`, `templates.ts:1362`, `phase-block-format.xml:20` | S | — | `templates.test.ts`, `sdd-log.cmd.test.ts:446` | D3(1.12,doc40) | — | нет | ГОТОВ К ВЫДАЧЕ | координировать с **ISS-11** (тот же скелет) |
| B2-15 | B2 | Разгрести долг в RC: дубли `TSK-88`, синхронизировать `specs/3-tasks.md` со словарём/Baseline Rule генератора | `tasks/vcs/vcs-mr-client.task-88.md`, `specs/3-tasks.md:11-12` | S | — | `sdd-check --all .` → 0 `SDD_TASK_ID_COLLISION` | A1 (самомиграция) | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| B2-17 | B2 | Обновить `sdd-log.spec.md`/`sdd-check.spec.md` под фактический код (режимы, коды) | `specs/cli/sdd-log/sdd-log.spec.md:25,119`, `specs/cli/sdd-check/sdd-check.spec.md` | M | — | ручная сверка со списком режимов/кодов | spec-first дисциплина (блокирует остальной трек) | — | нет | ГОТОВ К ВЫДАЧЕ (блокирующее требование) | — |
| B2-18 | B2 | Достроить/удалить 7 неподключённых кирпичей `ai/kit/contract/process/**` | `blocker-format.xml`, `phase-block-format.xml`, др. | S/M | связана с B2-03 | gate «каждый кирпич подключён» | D-словарь (doc31) | — | нет | ЧЕРНОВИК | связан с **B2-03** |
| **▼ SO — SYNC-OWNERSHIP** | — | — | — | — | — | — | — | — | — | — | — |
| SO-1 | SO | `knowledge.xml` project-owned: `PROJECT_OWNED_ENTRIES` + статус `preserved` | `sync-core.ts`, `sync.types.ts:6` | S | — | порт `sync-core.test.ts:223,242` | #24, ISS-13, A4 | D-22 | **ДА** | ГОТОВ К ВЫДАЧЕ | владеет частью **ISS-13**; дубль-предупреждение с **T-4** (RULES) |
| SO-2 | SO | Порт манифеста скиллов из `62172906` (orphan-проход целых скиллов) | `sync-skills-core.ts` | S | — | порт `sync-skills-core.test.ts:377,391,538-627` | #9.4, ISS-3, A4 | D-22 | **ДА** | ГОТОВ К ВЫДАЧЕ | владеет частью **ISS-3** |
| SO-2b | SO | Гейт внутрискиллового файлового зеркала (только ранее-манифестированные имена) | `sync-skills-core.ts:377-392` | S | SO-2 | новый тест «project file inside supported skill never deleted» | #9.4, ISS-3, A4 | D-22 | **ДА** | ГОТОВ К ВЫДАЧЕ | владеет частью **ISS-3** |
| SO-3 | SO | Целевая архитектура: единая хэш-модель владения (`ownership.ts`, `locally-modified`, `--force`) | новый `shared/common/sync/ownership.ts` | L | SO-1, SO-2, SO-2b | новый `ownership.test.ts` + e2e 2,3,4,5,9 | A4, A8 (частично) | D-1(вариант 2, doc32, целевая) | нет — пост-релиз | ЗАБЛОКИРОВАН (пост-релизная архитектура, не в 2.0.0-draft.N) | надстройка над SO-1/SO-2, не замена |
| SO-4 | SO | Правдивая печать `deleted` в dry-run сводке | `sync-skills-formatter.ts:88-124` | S | — | 3 кейса форматтера | — | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| SO-5 | SO | Deployed-surface golden + проверка утечек в содержимом и tarball | новый `scripts/__tests__/deployed-surface.test.ts` | M | — | golden + `npm pack --dry-run` | A5, A9 | — | нет | ГОТОВ К ВЫДАЧЕ | координировать с **T-9** (RULES, тот же golden-паттерн) |
| SO-6 | SO | Вернуть исключение тестовых артефактов из деплоя скиллов | `sync-skills-core.ts:22,84` | S | — | порт `sync-skills-core.test.ts:151,165` | A5 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| SO-7 | SO | Частичное чтение источника не приводит к удалению | `sync-core.ts:176-182`, `sync-skills-core.ts` (scanSkills) | M | — | мок `readdirSync` → «partial scan never deletes» | #24, ISS-13, A4 | D-22 | **ДА** | ГОТОВ К ВЫДАЧЕ | владеет частью **ISS-13**; максимальная разрушительность в треке |
| SO-8 | SO | `resolvePackageDir`: подъём по `package.json`, не strip `dist` | `sync-core.shared.ts:36-59` | S | — | e2e «resolves from clone without node_modules/gennady» | функциональный регресс S2 | нужно уточнение формулировки у оператора (см. 32 §4.2) | по решению оператора | ЧЕРНОВИК (уточнить у Lead/оператора) | — |
| SO-9 | SO | `sync-skills` → полный `sync` только с `--with-directives` (default off) | `sync-skills.cmd.ts:67-118` | S | — | e2e «does not mirror-delete directives» | O-выявленный сценарий потери | L-4 | нет | ГОТОВ К ВЫДАЧЕ | — |
| SO-10 | SO | Порт содержимого реестра: `baseline-rules`/`baseline-testing`/тонкие `python-rules`/`go-rules` в `knowledge.xml` | `ai/directives/coding/*.xml`, `knowledge.xml` | M | — | порт `testing-rule-contract.test.ts` | R3 (doc32) | — | нет | владелец — **T-1** | **дубль T-1** (владелец, RULES-трек) |
| SO-11 | SO | `sdd-check`: `<Rule><File>` реестра обязан существовать → `SDD_RULE_FILE_MISSING` | `check.ts`, `task-authoring-literals.ts` | S | — | «reports registry rule whose file is missing» | #24, ISS-13, A4, A8 | D-22 | **ДА** | ГОТОВ К ВЫДАЧЕ | без неё SO-1 создаёт новый тихий отказ |
| SO-12 | SO | Расширить `sdd-migrate` для миграции v1-дерева потребителя; читать `.gennady-synced` до известных хэшей v1-релизов | `cli/cmd/sdd-migrate/**`, `guides/v1-to-v2-migration.md` | L | SO-1, SO-2 (базовая модель владения) | e2e-фикстуры 6a/6b/9 | A5, O-3 | **D-23 (открыт)** | нет | **ЗАБЛОКИРОВАН D-23** (первый v2-sync над v1-деревом — обсуждение при постановке) | задача на самый конец плана (волна 5) |
| SO-13 | SO | Вернуть плагинные корни в sync (только вместе с портом `plugins/`) | `sync-core.ts` (scanSourceRoots) | M | V-02, V-09/V-10/V-11 (перенос plugins/) | порт `sync-skills-core.test.ts:237,246,265` | A6, A9 | — | нет | ЧЕРНОВИК (ждёт переноса плагинов) | — |
| SO-14 | SO | Развести имена `sync`/`sync-skills`/`sdd-sync`/`sdd-migrate` в help | `cli/cmd/*/help.ts`, `cli.spec.md` | S | — | нет (документационная) | ясность CLI | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| **▼ T — RULES** | — | — | — | — | — | — | — | — | — | — | — |
| T-1 | T | Портировать baseline + языковые правила (`baseline-rules`, `python-rules`, `go-rules`, `baseline-testing`); починить 2 неполных файла RC; сузить `<Triggers>` у `typescript-rules` | `ai/directives/coding/{baseline,python,go}-rules.xml`, `testing/baseline-testing.xml`, `knowledge.xml` | M | Q7(baseline-хуки, doc33) — блокирует | контрактный тест «4 секции», тест резолва зависимостей | A8, D-25 | L-8 (Q7 baseline-хуки), L-11 (7 «выживших» go-правил), D-25 | нет | ЧЕРНОВИК (ждёт Q7/L-8 решения хуков) | владелец **SO-10** (дубль) |
| T-2 | T | *(только R-B)* Слои реестра + единственный модуль слияния (`knowledge.core.xml`/`knowledge.stack.xml`) | новый `shared/sdd/rule-registry.ts` | M | Q1(b), Q2 | `rule-registry.test.ts` | A8 (целевое) | **D-24 (открыт)** | нет — не нужна при R-A′ | **ЗАБЛОКИРОВАН D-24** (слой правил — открытый дизайн) | пост-релиз, целевая архитектура R-B |
| T-3 | T | Детерминированный аудит контракта правила (мейнтейнер + потребитель, один модуль) | новый `shared/sdd/rule-surface.ts`, `ai/kit/audit-rule-surface.ts` | M | Q3, Q4, Q6 | `rule-surface.test.ts`, `audit-rule-surface.test.ts` | A8 | L-6 (модуль в shared/sdd + 2 входа) | нет | ГОТОВ К ВЫДАЧЕ | немедленная мера (§5.2 doc33 п.4) |
| T-4 | T | Владение при `sync`: сохранить проектный реестр и файлы правил (облегчённая версия для R-A′) | `sync-core.ts` (`PROJECT_OWNED_ENTRIES`) | S (R-A′) | — | `sync-core.test.ts` (a,b) | A8, G2 | — | нет | ГОТОВ К ВЫДАЧЕ | **дубль SO-1** (реестр); часть (b, защита файлов правил в owned-категории) — уникальна, координировать с **SO-2b** |
| T-5 | T | Вернуть текст R5 (куда проект пишет своё правило); делегирование инструменту, cap `MINOR` для `RULE_FILE_INCOMPLETE` | `ax-rules-resolution-hard-fail.xml`, `ax-scope-rules-declaration.xml` | S | T-3 | `npm run audit:sdd-templates` | R5 | L-5 (схема snake_case→CamelCase) | нет | ЧЕРНОВИК | — |
| T-6 | T | Убрать фиктивность `SDD_RULES_PHASE_EMPTY` (оба глушителя); решение по `architecture`/`quality` | `rules-cascade.ts:62`, `sdd-check.cmd.ts:429` | S | Q6 | `rules-cascade.test.ts` +кейс | — | L-7 | нет | ГОТОВ К ВЫДАЧЕ | — |
| T-7 | T | *(только R-B)* Миграционный шаг: не возвращать чужой стек при включении слоёв реестра | `sync-core.ts` | M | T-2, T-4, Q2 | фикстуры `cloud-ios`/`messenger` | A8 (целевое) | **D-24 (открыт)** | нет — не нужна при R-A′ | **ЗАБЛОКИРОВАН D-24** | пост-релиз |
| T-8 | T | Facet правил у плагина стека: `knowledge.stack.xml` генерируется, не хранится | `stack.types.ts` (+rules facet), `plugins/{node,golang,anystack}` | L | T-2 (или T-4 при R-A′) + перенос `plugins/`/`services/stack/` | `plugins/*/__tests__/*-rules.test.ts` | A8, G1 | — | нет | ЧЕРНОВИК (ждёт V-09/V-10/V-11) | — |
| T-9 | T | Замок поставляемой поверхности правил (golden-эквивалент `deployed-surface`) | новый golden-тест, включая `knowledge*.xml` | S | — | golden с `UPDATE_SURFACE_GOLDEN=1` | A5, G2 | — | нет | ГОТОВ К ВЫДАЧЕ | координировать каталог с **SO-5** |
| T-10 | T | Переименовать `agents-rules` → `agents-orient` | `cli/cmd/agents-rules/**` → `agents-orient/**` | S | — | перенос теста + «старое имя даёт понятную ошибку» | — | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| T-11 | T | Зарегистрировать три `uikit-*` в реестре или явно исключить из каскадных категорий | `knowledge.xml` (+3 записи) | S | T-3 | тест T-3(d4) | — | — | нет | ЧЕРНОВИК | — |
| T-12 | T | Вернуть блок `<Directives>` в реестр v2 | `knowledge.xml` (+6 записей) | S | T-3 | `<File>`-existence чек T-3(d4) | — | — | нет | ЧЕРНОВИК | ловит висячий `task-scaffolding.directive.xml` у messenger |
| T-13 | T | Детерминированная проверка раскрытия `<RequiresVerification>` алиаса | подмножество T-3(d6) | S | — | тест «каждый алиас встречается в Verification Commands infra-спеки» | — | — | нет | ГОТОВ К ВЫДАЧЕ | немедленная мера (§5.2 doc33 п.6) |
| T-14 | T | *(main-side)* Снять `go-rules.xml`/`python-rules.xml` из блока «Planned» в README | `MAIN/ai/directives/coding/README.md:21-25` | S | T-1 | grep «Planned» пуст | — | — | нет | ЧЕРНОВИК | правка не в RC-ветке, а в main-side README (уточнить применимость) |
| **▼ REL — RELEASE/PACKAGE** | — | — | — | — | — | — | — | — | — | — | — |
| REL-1 | REL | Вернуть publish-before-git порядок в `publish-next.ts` | `scripts/publish-next.ts` | S | — | ручная проверка (нет автотеста) | A9, P4 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| REL-2 | REL | Добавить `.npmignore` (копия main) | `.npmignore` (new) | S | — | `npm pack --dry-run` без test/fixture путей | A9, P1 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| REL-3 | REL | Портировать `executableBin()` chmod-plugin в `vite.config.ts` | `vite.config.ts` | S | — | `ls -la dist/gennady.js` после build | A9 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| REL-4 | REL | Портировать `bundle-smoke.e2e.test.ts` + `publish-contents.e2e.test.ts` под RC `files`/`exports`, включить в `prepublishOnly` | новые e2e-тесты | M | REL-5 (exports решение) | сами тесты | A9 | D-9 | нет | ЧЕРНОВИК (ждёт REL-5) | — |
| REL-5 | REL | Привести `exports`/`main`/`types`/vite entries к консистентному виду по D-9 (CLI+SDD+stack) | `package.json`, `vite.config.ts`, `tsconfig.json` | L | V-02 (перенос `services/stack`/`plugins/*`) | `npm run build && node dist/index.js` smoke | A9, P2 | D-9 | нет | ЧЕРНОВИК (ждёт переноса стек-плагинов) | — |
| REL-6 | REL | Пофиксить pin `yaml` (`^2.9.0`→`2.9.0`) | `package.json` | S | — | build:publish smoke | A9 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| REL-7 | REL | Тест-конкурентность: `=1` или доказать безопасность 6 прогоном | `scripts/test-topology.ts` | M | REL-15 | N-кратный `npm test` | A9, D-10 | **Q2/Q5 открыты**, зависит от REL-15 | нет | **ЗАБЛОКИРОВАН** (Q2/Q5, ждёт вывод REL-15) | — |
| REL-8 | REL | Вернуть `lint` = `format:check && type-check && lint:contracts` в `prepublishOnly` | `package.json` (scripts) | S | — | `npm run prepublishOnly` красный на неотформатированном коде | A9, P4 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| REL-9 | REL | `.github/workflows/ci.yml` вокруг `test-topology.ts` (по D-11) | `.github/workflows/ci.yml` (new) | M | — | CI-прогон на PR | A9 | D-11 | нет | ГОТОВ К ВЫДАЧЕ | — |
| REL-10 | REL | Версионная стратегия: `2.0.0-draft.<N>` (по D-12) | `package.json` (version) | S | — | ручная сверка `npm view gennady versions` | A9, D-12 | D-12 | нет | ГОТОВ К ВЫДАЧЕ | — |
| REL-11 | REL | Устранить/зафиксировать dependency-уязвимости RC (11 шт., в т.ч. прямые `dompurify`/`vite`) | `package.json`, `package-lock.json` | S-M | — | `npm audit --json` = 0 high/critical | A9 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| REL-12 | REL | Re-derive `35a31942` (explicit root в 8 SDD-командах, убрать `process.chdir` из 9 тестов) против текущего RC | 8 SDD-command файлов, 9 тестовых файлов | M | REL-15 | существующие юнит/контракт-тесты + `grep process.chdir`=0 | D-8 | D-8, зависит от REL-15 | нет | **ЗАБЛОКИРОВАН** (ждёт REL-15) | — |
| REL-13 | REL | Re-derive `51195c48` (фикс IPC-флейка `node --test` в точке триггера) против текущего RC | `scripts/test-topology.ts` + узел триггера | M | REL-15 | N-кратный `npm test`, 0 флейков | D-8, D-10 | D-8, зависит от REL-15 | нет | **ЗАБЛОКИРОВАН** (ждёт REL-15) | связан с REL-7/Q5 |
| REL-14 | REL | Re-derive `overrides` `undici`/`esbuild` из `sdd-v2-inbox-transplant` | `package.json`, `package-lock.json` | S | — | `npm audit --json` — undici/esbuild отсутствуют | D-8 | D-8 | нет | ГОТОВ К ВЫДАЧЕ | закрывает 2 из 11 находок REL-11 |
| REL-15 | REL | Аналитическая задача: причина IPC-краша `node --test` — связан ли с agent-mon/agent-inbox; решение по REL-7/12/13 после результата | `scripts/test-topology.ts`, тесты agent-mon/inbox | M | — | диагностика + отчёт с воспроизведением | D-10, D-30 | D-10, D-30 | нет | ГОТОВ К ВЫДАЧЕ (задача на исполнение трека 34, без внешних решений) | предшествует REL-7/12/13 |
| **▼ T-B6 — DIRECTIVES/SKILLS** | — | — | — | — | — | — | — | — | — | — | — |
| T-B6-08 | T-B6 | Замок на висячие ссылки: `lint-axioms` — направленность «referenced-but-undefined», роняет билд, allowlist по L-10 | `ai/kit/lint-axioms.ts`, `build-directives.ts` | M | — | `lint-axioms.test.ts` +5 кейсов | D-словарь §4.1(doc40) | L-10 (Q2 вариант b, allowlist) | нет | ГОТОВ К ВЫДАЧЕ | идёт первой в треке T-B6 |
| T-B6-09 | T-B6 | Kit-скрипты/тесты не зависят от cwd | `lazy-assembly.ts`, `render.ts`, `step-budget-gate.ts` | S | — | 3 теста §0 из чужого cwd | — | — | нет | ГОТОВ К ВЫДАЧЕ | идёт второй в треке T-B6 |
| T-B6-10 | T-B6 | Бюджеты покрывают все директивы (в т.ч. `infra` 9592 → lazy-split) | `assembly-manifest.json`, `step-budget-gate.ts`, `.hbs` монолитов | M | T-B6-08, T-B6-09 | «monolith over ceiling fails gate» | Q6(doc40) | L-12 (единый лимит 8000, после lazy-split) | нет | ЧЕРНОВИК | должна идти до включения гейта на монолиты |
| T-B6-11 | T-B6 | Восстановить D4.4–D4.7: `ax-severity-tagging`/`ax-finding-routing`/`ax-drift-taxonomy` | `axiom/audit/{ax-severity-tagging,ax-finding-routing,ax-drift-taxonomy}.xml` | M | T-B6-08 | «verdict from printed severity table»; «project finding capped MINOR» | D4(doc40 §1.4) | — | нет | ЧЕРНОВИК | — |
| T-B6-12 | T-B6 | Граница фазового агента: `ax-phase-scope-lock`/`ax-permitted-bash-commands`/`ax-blocker-escalation` собраны; `H_BLOCKED`; исправить `audit-halt-activation.mjs:135-141` | `phase-execution-protocol.directive.hbs` | M | T-B6-08 | «phase worker owns failures only inside its own Target Files» | D7(doc40 §1.7), #19, ISS-8 | — | нет | ЧЕРНОВИК | владеет частью **ISS-8** (+ T-B6-27 companion) |
| T-B6-01 | T-B6 | Pivot для product/library: `AX_PIVOT_REQUIRES_SUPERSESSION`, режимы, `H_REWRITE_WITH_DOWNSTREAM` | `scope.directive.hbs`, `module.directive.hbs` | M | T-B6-08 | «pivot supersedes instead of overwriting»; eval `fibonacci-library` | D3/PR#8(doc40 §1.3) | — | нет | ЧЕРНОВИК | — |
| T-B6-02 | T-B6 | Правила закрытого мира в модульный авторинг (5 висячих ссылок) | `module.directive.hbs`, `axiom/{boundary,spec}/*` | S | T-B6-08 | «module decomposition carries closed-world rules» | — | — | нет | ЧЕРНОВИК | — |
| T-B6-03 | T-B6 | `review-lifecycle` STEP_2⇄STEP_3 ограничен `AX_CAP_5`; `ax-default-accept`/`ax-polish-mode` — **после** T-B6-21 | `review-lifecycle.directive.hbs`, `critic-protocol.directive.hbs` | S | T-B6-21 | «bounds review⇄reconcile cycle» | — | — | нет | ЧЕРНОВИК | зависит от **T-B6-21** (иначе собирает в мёртвый файл) |
| T-B6-04 | T-B6 | Batch честен про рабочее дерево: серийные полосы или worktree-на-полосу | `ax-task-parallel.xml`, `execute.directive.hbs` | S | Q3(doc40) | «batch never runs two tickets concurrently in one tree» | O-4 | **D-26 (открыт)** | нет | **ЗАБЛОКИРОВАН D-26** (параллель задач — решать через eval) | companion — снапшот `sdd-verify`, владелец **V-18** |
| T-B6-05 | T-B6 | `AX_DISPATCH_VIA_BATCH` в `reconcile`: execute — единственный владелец audit/code-review | `reconcile.directive.hbs` | S | T-B6-08 | «reconcile dispatches as one execute batch» | — | — | нет | ЧЕРНОВИК | — |
| T-B6-13 | T-B6 | D6 восстановлен: `ax-ssot-traceability` до v1-текста; якорь/литеральный `Given` в `ax-ticket-has-bdd-and-tests` | `ax-ssot-traceability.xml`, `scaffold.directive.hbs` | M | T-B6-08 | «BDD references spec facts by anchor» | D6/8bb38477 (doc40 §1.6) | — | нет | ЧЕРНОВИК | companion — структурная проверка анкора, владелец **B2** |
| T-B6-14 | T-B6 | D9 восстановлен: `AX_ARTIFACT_STYLE_SELF_CHECK` в `scope`/`module` | `scope.directive.hbs`, `module.directive.hbs` | S | T-B6-08 | «every whole-document Write carries style self-check» | D9(doc40 §1.9) | — | нет | ЧЕРНОВИК | — |
| T-B6-15 | T-B6 | D2 восстановлен: «Directive markup — mandatory» первым разделом `AGENTS.md` | `AGENTS.md`, `ai/kit/AUTHORING.md` | S | — | «AGENTS.md declares directive markup before project description» | D2(doc40 §1.2) | — | нет | ГОТОВ К ВЫДАЧЕ | координировать каталог `ai/kit/__tests__/` с **T-9**(RULES) |
| T-B6-16 | T-B6 | Provable-progress: повтор блокирующего набора без нового evidence → halt | `ax-re-dispatch.xml`, `execute.directive.hbs` | M | T-B6-08 | «halts on repeated finding set with no new evidence» | — | — | нет | ЧЕРНОВИК | — |
| T-B6-17 | T-B6 | `[REOPENS]` восстановлен как механическая проверка (код — B2); `ax-stale-after-pivot-verification` собран | `ax-stale-after-pivot-verification.xml`, `audit.directive.hbs` | M | T-B6-08 | тикет `triggered-reopen=Round-2`+`Reopens:0` → finding | #13, ISS-5 | — | нет | ЧЕРНОВИК | companion **B2-06** (код) |
| T-B6-06 | T-B6 | Директивная половина детекта стека: колонка `Stack` в портале, нейтральные примеры Cascade Table, `golang-setup.xml` как rule-файл | `formats/{portal-structure,scope-tasks-index}.xml`, `shared/sdd/portal.ts` | M | V-05, V-06 (B1), T-1 (B4) | «Stack column parses»; «scaffold aborts on unresolvable rule ref» | 3.2/3.3(doc40) | — | нет | ЧЕРНОВИК (ждёт Wave2: V-05/V-06/T-1) | НЕ дублирует V-05/V-06 (те — CLI-половина) |
| T-B6-07 | T-B6 | v1-имена скиллов как триггеры в `description` v2-скиллов (по Q5=вариант c, D-27) | `ai/skills/{sdd,sdd-reconcile,sdd-execute}/SKILL.md` | S | T-B6-08 | «every retired v1 skill name is a trigger in exactly one v2 skill description» | D-27 | D-27 (Q5 вариант c) | нет | ГОТОВ К ВЫДАЧЕ | координировать с **SO** (`sync-skills` тесты) |
| T-B6-18 | T-B6 | Инлайн-аксиомы не расходятся с библиотекой (7 нарушений сегодня) | `.hbs`, `axiom/**` | S | — | новый `axiom-home.test.ts` | — | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| T-B6-19 | T-B6 | Несобранные SDD-релевантные аксиомы помечены `status="draft"` (гибрид Q1=c) | `axiom/**`, `lint-axioms.ts` | S | T-B6-08 | «every axiom is referenced or marked draft» | Q1(doc40) | L-9 (гибрид c) | нет | ЧЕРНОВИК | — |
| T-B6-20 | T-B6 | Conduct-аксиомы гарантированы каждому operator-facing владельцу | `.hbs` (`deps=`), `deps.test.ts` | S | T-B6-26 | «every operator-facing owner declares conduct set» | D1(doc40 §1.1) | — | нет | ЧЕРНОВИК | конкретизируется **T-B6-26** |
| T-B6-21 | T-B6 | `critic-protocol.directive.xml` перестаёт быть сиротой (назван в dispatch или слит) | `review-lifecycle.directive.hbs`, `delta-assembly.ts` | S | — | «every class-3 directive named by dispatch text» | — | — | нет | ГОТОВ К ВЫДАЧЕ | требуется до **T-B6-03**; связан с **ISS-10** |
| T-B6-22 | T-B6 | `recover-from-code.directive.xml` (0 ссылок) перестаёт быть сиротой | `router.directive.hbs` (или удаление) | S | — | «every top-level directive reachable from router» | — | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| T-B6-23 | T-B6 | Инверсия D3.4 устранена: трёхчленный триаж критика (`ARTIFACT_GAP`/`CONTEXT_MISSING`/`NON_BLOCKING_QUESTION`) | `critic-protocol.directive.hbs`, `ax-confusion-bug.xml` | S | — | «confusion alone does not prove underspecification» | D3(doc40 §1.3) | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| T-B6-24 | T-B6 | Область `lint-axioms` расширена на `ai/directives/**` (не только `sdd-v2/**`) | `ai/kit/lint-axioms.ts` | S | T-B6-08 | «dangling refs outside sdd-v2 also reported» | — | — | нет | ЧЕРНОВИК | ловит 3 ссылки `AX_BLOCKER_ESCALATION` вне дерева |
| T-B6-25 | T-B6 | `ax-audit-hook.xml` собран (самый цитируемый висячий аксиом, 5 ссылок) | `ax-audit-hook.xml`, `audit.directive.hbs` | S | T-B6-08 | «round close followed by mandatory audit hook» | — | — | нет | ЧЕРНОВИК | — |
| T-B6-26 | T-B6 | `AX_PROGRESSIVE_DISCLOSURE` — один дом (сегодня 7 копий) | `.hbs` (все operator-facing) | S | — | `deps.test.ts` — REQUIRED_CONDUCT явный | — | — | нет | ГОТОВ К ВЫДАЧЕ | конкретизирует **T-B6-20** |
| T-B6-27 | T-B6 | Комментарий `audit-halt-activation.mjs:135-141` исправлен целиком | `ai/kit/audit-halt-activation.mjs:135-141` | S | (после T-B6-12 по контексту) | ручная проверка + `audit:halts` зелен | — | — | нет | ЧЕРНОВИК | companion **T-B6-12** |
| **▼ E — EVAL** | — | — | — | — | — | — | — | — | — | — | — |
| E-00 | E | Пригодность к CI: агрегированный exit-код `sdd-flow-eval`; `harness.test.ts` вне c8-цепочки; `npm run build` в README | `package.json`, `harness.test.ts` | S | — | 90/90 зелены; «батч с одним fail → exit 1» | A10 | D-28 | нет | ГОТОВ К ВЫДАЧЕ | — |
| E-01 | E | Починить `R1` на реальном репозитории: один предикат «0 error(s) = pass» | `parseSddCheckResult` | S | — | both-way юнит на замороженном выводе | A10 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| E-02 | E | Объявить `completion`/`acceptance` у `slugify-toolchain` | `scenarios.json` | S | — | суита зелёная | — | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| E-03 | E | Re-baseline после `3d5f66a7` (числа до 07.09 — неизвестная сборка) | `metrics-ledger.jsonl` | S | E-00, E-01, E-02 | golden exit 0 + R-COMPLETE, 2 pass | А10 | — | нет | ЧЕРНОВИК | обязателен до любых выводов из старых прогонов |
| E-04 | E | `E-G2-ownership` — 6 both-way кейсов владения | `sync.e2e.test.ts`/`sync-skills.e2e.test.ts` | S | — (не зависит от VERIFY) | 6 assert; dry-run план байт-в-байт | A4, G2 | D-1(doc32, не дублируется здесь) | нет | ГОТОВ К ВЫДАЧЕ | — |
| E-05 | E | `E-G3-log-vocabulary` — 4 both-way группы поверх `execution-log.ts` | синтетические тикеты | M | B2-01 | 4 both-way группы | #13/#15/#23, A7 | — | нет | ЧЕРНОВИК (ждёт B2-01) | — |
| E-06 | E | Полнота мигратора: 3-колоночные §5, `SCOPE_TYPE`, `PHASE_RECEIPTS:v1`+`COVERAGE_POLICY:v1` | `fixture-detmig` | M | E-16 | `sdd-task` принимает; `sdd-state` печатает `SCOPE_TYPE` | A2, D-4 | L-15 (порядок — см. контрадикцию §2) | нет | ЧЕРНОВИК (ждёт E-16) | **контрадикция с L-15**, см. §2 |
| E-07 | E | Бар исполнимости: `SDD_VERIFICATION_TABLE_INVALID` в `MIGRATION_CRITICAL_CODES` | `migration-grade.ts` | S | E-06 | both-way юнит на замороженных выводах | A2 | D-28, L-15 | нет | ЧЕРНОВИК (ждёт E-06; **контрадикция L-15**, см. §2) | — |
| E-08 | E | Прогон миграции на снапшоте с новой информацией (реализуется как часть E-14 или отдельно, по Q2) | зависит от Q2(doc50) | M | Q2(doc50) | MIGRATION grade + executable-бар, 2 pass | A2, D-29 | D-29 (частично; Q2 остаётся) | нет | ЧЕРНОВИК | закрывается через **E-14** по D-29(a) |
| E-09 | E | Первый живой прогон, где R-COMPLETE даёт pass | `slugify-toolchain` | M | E-02, E-03 | R-COMPLETE pass; R1 чист; 2 pass | A10, D-4 | D-4 (grandfather до A1/A2) | нет | ЧЕРНОВИК | — |
| E-10 | E | `E-G1-swift-verify` — детерминированная приёмка `gennady.yaml` | `fixture-detmig` | S-M | V-07, E-16 | 5 пунктов приёмки | A3, G1 | — | нет | ЧЕРНОВИК (ждёт V-07/E-16) | — |
| E-11 | E | Фикстура `golang-slugify` в `provision.ts` | новая фикстура | M | — | golden both-way | A3, G1 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| E-12 | E | `E-G1-go-execute` детерминированный (`STACK`, pickable, receipt, чист) | `golang-slugify` | M | V-04, V-05, V-06, E-11 | 4 пункта both-way | A3, G1 | — | нет | ЧЕРНОВИК (ждёт VERIFY стек) | — |
| E-13 | E | `E-G1-llm-go` — execute на go-фикстуре (единственный LLM-сценарий G1) | `golang-slugify` | M | E-12 | golden exit 0 + R-COMPLETE, 2 pass | A3, G1 | — | нет | ЧЕРНОВИК | — |
| E-14 | E | Самомиграция `gennady` (12 скоупов, 127 тикетов) — обязательный таск | снапшот `main` | L | E-06, E-07, E-16 | MIGRATION grade + executable-бар; закрывает E-08 | A1, D-3 | D-3 (обязателен) | нет | ЧЕРНОВИК (ждёт E-06/07/16) | закрывает **E-08** одновременно |
| E-15 | E | Детерминированный лок маршрутизации на `ai/inspector/core` (v1-раскладка/`go.mod`-ветка) | директивы как есть | S-M | — | both-way | O-1(частично) | — | нет | ГОТОВ К ВЫДАЧЕ | дешёвый, в любой момент |
| E-16 | E | Привести `fixture-detmig`/`rt-regen` в воспроизводимое состояние (`EVAL_FIXTURES_ROOT`, чистое дерево) | `fixture-detmig`, `rt-regen` | S | — | `git status --porcelain` пусто; нет `DIRTY_TREE` | A2, A3, L-13 | L-13 (Q3 вариант a) | нет | ГОТОВ К ВЫДАЧЕ | предпосылка для E-06/E-08/E-10 |

---

## 2. Дедупликация и контрадикции

### 2.1 Дубли (один владелец, остальные — ссылки)

| Пара/группа | Владелец | Что дублируется | Причина выбора владельца |
|---|---|---|---|
| ISS-1 vs B2-05 | **B2-05** | `SDD_NO_TICKETS_FOUND` + документация exit-кода | B2-05 несёт также P5/P6 (доп. проверка симметрии `--all`/`--task`), доказано B1/V-B2 независимой верификацией |
| ISS-2 vs B2-12 | **B2-12** | единый список расширений для consumers/BDD-индекса | формулировки идентичны, B2-12 точнее указывает файлы |
| ISS-3 vs SO-2/SO-2b | **SO-2 + SO-2b** | манифест orphan-скиллов + гейт внутрискиллового зеркала | SO-2b закрывает найденную независимой верификацией дыру S5-bis, которой нет в тексте issue #9.4 |
| ISS-4 vs V-12 (+V-07/V-08) | **V-12** | `extraGates[].when` | V-12 — часть декомпозиции полного verify-трека, ISS-4 текстово идентична |
| ISS-5 vs B2-06 | **B2-06** | причинный `Reopens` | B2-06 — код; T-B6-17 — сборка сопутствующего аксиома (companion, не дубль) |
| ISS-6 vs B2-02 | **B2-02** | `nextRoundNumber` по секции + переименование legacy Round | идентичная формулировка и файлы |
| ISS-7 vs V-14 | **V-14** | `[gate] `-конвенция | V-14 — часть декомпозиции VERIFY |
| ISS-9 vs V-12+V-13 | **V-12 (when) + V-13 (--only/--skip)** | issue #20 распадается на две задачи VERIFY-трека | доказано в V-B1: issue расщепляется на «file scoping» (V-12) и «selector» (V-13) |
| ISS-12 vs B2-03+B2-04 | **B2-03 (словарь) + B2-04 (post-close детекция)** | токен `correction` | B2-03 — словарь, B2-04 — механизм детекции записи-после-close, обе части нужны |
| ISS-13 vs SO-1+SO-7+SO-11 | **SO-1 + SO-7 + SO-11** | `preserved` + устойчивость к частичному чтению + `<File>`-existence замок | доказано в V-B3 как минимальный набор, закрывающий issue #24 целиком без SO-3 |
| SO-10 vs T-1 | **T-1** | порт `baseline-rules`/`baseline-testing`/`python-rules`/`go-rules` в `knowledge.xml` | T-1 (RULES) — полная формулировка с починкой 2 неполных файлов RC и сужением `<Triggers>`; SO-10 (SYNC) — только перенос содержимого реестра, подмножество |
| T-4 vs SO-1 | **SO-1** (для `knowledge.xml`) | `PROJECT_OWNED_ENTRIES`+`preserved` | идентичный код-путь `sync-core.ts`; T-4(b) (защита файлов правил в owned-категории) — уникальная часть, остаётся за T-4, координировать с SO-2b |
| SO-5 vs T-9 | оба нужны, координировать каталог | golden поставляемой поверхности | SO-5 покрывает скиллы+директивы+tarball; T-9 — узкий golden для `knowledge*.xml`+файлов правил; не сливать, но избежать двух параллельных `__tests__`-каталогов (замечание T-B6-15) |
| B2-06 companion T-B6-17 | не дубль, зависимость | причинный Reopens: код (B2-06) vs сборка аксиома (T-B6-17) | оба нужны — B2-06 без T-B6-17 не имеет аудитного триггера, T-B6-17 без B2-06 не имеет механической проверки |
| ISS-10/ISS-11 vs T-B6-21/B2-14 | координация файлов, не дубль | критик-изоляция (ISS-10) правит тот же `critic-protocol.directive.hbs`, что и T-B6-21/T-B6-03; Handoff-грамматика (ISS-11) правит те же файлы, что и B2-14 | разные предметы (read-set критика vs достижимость файла; грамматика тегов vs согласование скелета), но один файл — согласовать порядок правок в брифах |
| V-05 vs T-B6-06 | не дубль | V-05 — CLI/детект стека (`shared/verify/stack-detection.ts`, `sdd-state`); T-B6-06 — директивная половина (портал, Cascade Table, `golang-setup.xml`) | явно разведено в самом доc40: «Не дублирует» |

### 2.2 Контрадикции между треками

1. **Порядок E-06/E-07 (доc50 §4.1, §5 Q5) vs L-15 (доc02).** Doc50 §4.1 порядок: «E-16 → E-06 → E-07 → E-14», §5 Q5 рекомендует (a) «сначала E-06 (полнота), потом E-07 (бар)». Но `02-LEAD-DECISIONS.md` L-15 фиксирует **противоположный** выбор: «Вариант 2: сначала бар red-first (E-07, коды в `MIGRATION_CRITICAL_CODES`), затем полнота мигратора (E-06) — дисциплина red-first уже принята в `session-metrics.py gate`». Doc50 сам отмечает, что после удешевления бара до размера S «рекомендация (a) не так однозначна, как выглядела раньше» — то есть противоречие замечено, но не снято явно. **Требуется решение оператора/Lead перед выдачей брифов E-06/E-07**: либо подтвердить L-15 (red-first, E-07 → E-06) и переписать порядок §4.1 doc50, либо подтвердить doc50 §5 Q5(a) и отменить L-15. В этой доске порядок задач сохранён как в doc50 (E-06 перед E-07) с пометкой контрадикции в обеих строках — **не выдавать бриф по E-06/E-07 до снятия**.
2. **Зависимость B2-07 указана как S в исходном анализе, но пересмотрена самим доc31 до M** («пересмотрено с S — вводит зависимость от читаемой `PHASES_OVERVIEW`») — не контрадикция между треками, но несогласованность внутри одного документа; в доске зафиксирован актуальный размер M.
3. **SO-8 ссылается на «D-2» (доc32 §4.2, локальная нумерация решений трека) в тексте задачи, но локальный D-2 доc32 посвящён «что первый v2-sync делает с v1-деревом» (= глобальный D-23), а не `resolvePackageDir`-регрессии.** Похоже на опечатку/перепутанную ссылку в исходном треке — SO-8 не имеет прямого отношения к теме D-23. Отмечено как задача, требующая уточнения формулировки у Lead перед бенчем (см. таблицу выше, статус ЧЕРНОВИК).
4. **T-B6-04 (batch-параллель) и V-18 (single-flight verify)** оба зависят от одного открытого решения D-26, но заведены в разных треках (40 и 30) с частично разной формулировкой companion-связи — согласовать один бриф на оба, а не выдавать раздельно, чтобы не закрыть один без другого.

---

## 3. Волны исполнения (dependency-ordered)

### Волна 0 — без решений и без зависимостей

Критерий: задача не зависит ни от одной другой задачи плана и не требует решения оператора/Lead. Это «безопасный первый контур» — можно исполнять параллельно, задачи маленькие (в основном S), риск регрессии минимален.

- **VERIFY**: V-01 (golden текущего поведения RC).
- **SYNC**: SO-1, SO-2, SO-2b, SO-7, SO-11 (минимальный блокирующий набор D-22 — все пять не имеют внешних зависимостей друг от друга кроме SO-2b→SO-2 внутри пары), SO-4, SO-6, SO-9, SO-14 (полировка, не блокеры, но тоже без зависимостей).
- **RELEASE**: REL-1 (publish-order), REL-2 (.npmignore), REL-3 (chmod-plugin), REL-6 (yaml pin), REL-8 (lint в prepublishOnly), REL-9 (CI, решение D-11 уже есть), REL-10 (версия, решение D-12 уже есть), REL-11 (npm audit), REL-14 (overrides undici/esbuild), REL-15 (аналитика IPC-краша — не требует решения для *начала*, сама производит решение для REL-7/12/13).
- **CHECK-LOG**: B2-03 (словарь токенов, включая `correction`), B2-05 (`SDD_NO_TICKETS_FOUND`+P5/P6), B2-08 (`ax-reopen-format` под структуру v2, форма реопена уже решена D-20), B2-09 (устойчивость `parsePhasesOverview`), B2-11 (синхронизация `STEP_1_MECHANICAL` с кодом), B2-12 (`source-extensions.ts`), B2-14 (скелет Handoff), B2-15 (разгрести долг RC), B2-17 (актуализация спек `sdd-log`/`sdd-check` — **блокирующее требование** по spec-first дисциплине, должно идти рано).
- **DIRECTIVES/SKILLS**: T-B6-08 (lint referenced-but-undefined + allowlist L-10 — явно назван в примере волны), T-B6-09 (cwd-независимость — прямая предпосылка T-B6-08's тестов), T-B6-15 (D2 в AGENTS.md), T-B6-18 (инлайн-аксиомы), T-B6-21 (critic-protocol не сирота), T-B6-22 (recover-from-code не сирота), T-B6-23 (триаж критика), T-B6-26 (AX_PROGRESSIVE_DISCLOSURE один дом).
- **RULES**: T-3 (аудит контракта правила — немедленная мера §5.2), T-6 (убрать фиктивность SDD_RULES_PHASE_EMPTY), T-9 (замок поставляемой поверхности), T-13 (проверка `<RequiresVerification>` — немедленная мера §5.2).
- **EVAL**: E-00 (CI-пригодность), E-01 (починка R1-предиката), E-02 (completion/acceptance slugify), E-04 (G2-ownership, независим от VERIFY), E-11 (фикстура golang-slugify), E-15 (роутинг-лок), E-16 (воспроизводимость fixture-detmig — предпосылка для всей ветки G4/G1 eval).
- **ISS/LOCK**: LOCK-1, LOCK-2, LOCK-3 (замки-тесты, ничего не трогают кроме добавления тестов).

*Обоснование:* все перечисленные задачи либо (а) явно названы примером в задании («node-parity V-01», «SO-1/SO-2/SO-2b/SO-7/SO-11», «REL-3 .npmignore» — фактически REL-2, «REL publish-order» = REL-1, «lint referenced-but-undefined with allowlist» = T-B6-08, «exit-2 in help» = B2-05/ISS-1), либо (б) по факту разбора зависимостей в §1 не имеют формальной колонки «Зависит от» и не упираются в открытое решение оператора. Крупные многозадачные механизмы (B2-16→B2-07→B2-04→B2-01→B2-06, весь основной корпус T-B6-10..27) намеренно **не** включены в Волну 0, даже если отдельные их элементы теоретически независимы, — они образуют содержательный трек «журнал» и «директивы», вынесенный явно в Волну 3 по заданию; см. §3 Волна 3 обоснование.

### Волна 1 — VERIFY core

- V-02, V-03, V-04, V-04a (строгая цепочка parity + fingerprint).
- Governing: readiness-адаптер уже решён D-14 (интерфейс + node-адаптер + тривиальный anystack сразу) — сама реализация (V-06) идёт в Волне 2, но решение снимает неопределённость до начала Волны 1.
- Параллельно (не зависят от VERIFY): SO-3 таргет-архитектура **не** ставится здесь — она пост-релизная (см. §1); SO-5, SO-8 (после уточнения формулировки), SO-13 (ждёт переноса плагинов, фактически стартует только к концу Волны 2).

*Обоснование:* V-02..V-04a — жёсткая последовательная цепочка (каждая опирается на предыдущую), это ядро всего трека VERIFY и предпосылка для всех стековых пресетов Волны 2.

### Волна 2 — стеки anystack → golang → python → swift + rules baseline/go

- V-05 (детект стека) → V-06 (readiness-движок, самый большой L в критическом пути) — обе нужны до открытия стеков.
- V-07 → V-08 (anystack, первым по D-16 — разблокирует cloud-ios/eval-харнесс).
- V-09 (golang), V-10 (python), V-11 (swift) — параллельно друг другу после V-05/V-04a.
- V-12, V-13, V-14 (issue-фиксы #9-bonus/#20/#17 — зависят от V-03/V-07, тематически часть той же verify-поверхности).
- V-15 (директивы/`.hbs` verify — зависимость от V-05 снята, может идти параллельно).
- V-16 (read-only часть `verify --plan --json`; fix-часть заблокирована открытым Q8), V-18 (single-flight, зависит от V-06).
- T-1 (RULES: baseline+go-rules — явно назван «rules baseline/go» в задании; ждёт решения Q7/L-8 о baseline-хуках).
- SO-10 (дубль-ссылка на T-1, не отдельное исполнение).
- T-B6-06 (директивная половина детекта стека) — стартует только после V-05/V-06/T-1, фактически на стыке Волны 2/3.
- E-10 (swift verify-контракт, после V-07+E-16), E-12/E-13 (go execute, после V-04/V-05/V-06+E-11).

*Обоснование:* весь стек-контур (детект → readiness → пер-стековые пресеты) физически не может параллелиться с Волной 1 (общий движок), но внутри волны стеки идут параллельно друг другу, начиная с anystack (разблокирует cloud-ios-фикстуры для остальных треков раньше всего). Rules baseline/go естественно входит сюда, так как T-B6-06 и multiple E-* задачи Волны 2/4 зависят и от VERIFY, и от RULES одновременно.

### Волна 3 — журнал/receipts (B2-*) и директивы/аксиомы (T-B6-*)

- **B2 (журнал)**: B2-16 (маркер `PHASE_RECEIPTS:v1`, первым — наивысший приоритет трека) → B2-07 → B2-04 → B2-02 (в связке с B2-01) → B2-01 (консолидирующий парсер) → B2-06 (причинный Reopens). Плюс B2-10 (миграция якорей, независим, но объёмный L — инвентаризация 50 тикетов) и B2-13, B2-18 (зависят от согласований словаря/pickable).
- **T-B6 (директивы/аксиомы)**: после Волны 0 (T-B6-08/09/15/18/21/22/23/26) идёт основной корпус: T-B6-10 (бюджеты, после lazy-split), T-B6-11/12/13/14/16/17/25/27 (содержательные аксиомы), T-B6-01/02/03/05/20 (pivot/closed-world/review-cycle/conduct), T-B6-19 (draft-пометка).
- T-B6-04 (batch-параллель) остаётся **заблокирован D-26** внутри этой волны — не исполняется, пока оператор не даст решение (вместе с companion V-18, который сам по себе может исполниться раньше как «протокол» без lock).
- T-B6-07, T-B6-24 — по готовности соседних треков (SO, RULES), тоже в этой волне.
- ISS-8, ISS-10, ISS-11 (директивные issue-фиксы, делят файлы с T-B6-*) — в этой волне.
- RULES: T-2, T-7 (R-B, целевой слой правил) **заблокированы D-24** — не входят ни в одну волну релиза 2.0.0-draft.N, помечены пост-релиз; T-5, T-11, T-12, T-8 (после переноса плагинов из Волны 2) — исполняются здесь.
- E-05 (execution-log vocabulary eval, зависит от B2-01).

*Обоснование:* и журнал (B2), и директивы/аксиомы (T-B6) — оба по прямому указанию задания образуют Волну 3; внутри неё зависимости естественные (B2-16 первым, T-B6-08/09 уже сделаны в Волне 0 как инфраструктурная предпосылка для остального корпуса T-B6).

### Волна 4 — migration completeness + self-migration + acceptance evals

- E-03 (re-baseline, обязателен до любых выводов) → E-06 (полнота мигратора) → E-07 (бар исполнимости — **см. контрадикцию §2.2 п.1**, порядок с E-06 требует подтверждения) → E-09 (первый живой R-COMPLETE pass) → E-14 (самомиграция gennady, обязательна по D-3, закрывает E-08 одновременно).
- E-08 (снапшот с новой информацией, зависит от открытого Q2 doc50) — по умолчанию закрывается через E-14 (D-29 рекомендация (a): только самомиграция + `fixture-mig-run`, без нового снапшота cloud-ios).
- B2-10 (миграция якорей) логически принадлежит и Волне 3 (журнал), и Волне 4 (миграция) — оставлена в Волне 3 по коду, но её **фикстуры** используются в acceptance A1/A2 здесь.
- SO-12 **не входит** в Волну 4, несмотря на тематическую близость к «миграции», — прямое указание D-23 переносит её в Волну 5 («задача на самый конец плана»).
- A1..A10 (`60-ACCEPTANCE.md`) проверяются по факту завершения соответствующих задач; полная сверка критериев приёмки — финальный шаг этой волны.

*Обоснование:* задание явно определяет Волну 4 как «migration completeness + self-migration + acceptance evals (E-*)» — весь трек EVAL, зависящий от завершённого VERIFY/CHECK-LOG/RULES/SYNC (Волны 1–3), логично ложится сюда целиком, кроме уже стартовавших в Волне 0/2 дешёвых независимых E-задач.

### Волна 5 — v1 removal, docs, release 2.0.0-draft.N

- V-17 (снятие v1-корпуса verify).
- SO-12 (миграция v1-дерева потребителя, D-23 — задача открывается только здесь; сначала должна пройти обсуждение открытого вопроса с оператором при её постановке).
- REL-4, REL-5 (exports/публикуемая поверхность, после переноса стек-плагинов из Волны 2), REL-7/12/13 (после результата REL-15 из Волны 0 — фактически могут стартовать раньше формальной Волны 5, но их **закрытие** и решение по Q2/Q5 приходится на финальный релизный проход).
- SO-13 (плагинные корни в sync, после переноса плагинов).
- Финальная сверка A5 (v1 удалён из дерева RC: `ai/directives/sdd/`, v1-скиллы, `verify.sh` — grep-гейт анти-v1 в `npm run check`), A9 (релизный чек-лист целиком), обновление `README`/`ai/skills/README.md`/guides только на v2.
- Публикация `2.0.0-draft.N` (D-12).

*Обоснование:* прямое указание задания; вдобавок SO-12 логически не может стартовать раньше, чем базовая модель владения (SO-1/SO-2, Волна 0) и большая часть остального переноса устоялись — сначала нужно самим не терять файлы при sync, потом учить sync разбираться с v1-деревом потребителя.

---

## 4. Первые пять брифов (Lead → RC)

Все пять — из Волны 0. Шаблон — `70-ORCHESTRATION-PROTOCOL.md`.

### Бриф 1/5 — V-01: golden текущего поведения RC verify

```
БРИФ 30/V-01: node-parity golden

КОНТЕКСТ
- Документ плана: ai/drafts/research/sdd-v1-to-v2-transfer/30-TRACK-VERIFY.md §6
- Источник в main: н/п (это фиксация текущего RC-поведения, не порт)
- Что уже есть в v2: cli/cmd/sdd-verify/**, shared/sdd/phase-verification-plan.ts, phase-receipt.ts

ЦЕЛЬ
Зафиксировать текущее поведение sdd-verify (профили, строки команд, receipt-формат) как golden-тест,
включая 8 известных дыр из §3.1.3 (durationMs, коды выхода, fix-evidence, порядок адаптеров,
расширенная матрица скриптов, golden environmentState, подстроки ⛔/gate-state:, module-mocks) —
без исправления, только фиксация.

ИНВАРИАНТЫ (не нарушать)
- И-1/И-2/И-3 (идентичность receipt, неизменность вывода на pass, честность fingerprint) — не менять
  поведение, только измерять его.
- Не трогать сам sdd-verify/phase-receipt код в этой задаче.

ФАЙЛЫ
- трогать: новые shared/sdd/__tests__/preset-node-golden.test.ts,
  cli/cmd/sdd-verify/__tests__/parity-node.test.ts, golden-фикстуры receipt'а
- не трогать: shared/sdd/phase-verification-plan.ts, phase-receipt.ts, sdd-verify.cmd.ts

ПРИЁМКА
- тесты: golden-JSON по 5 профилям; байтовое сравнение stdout (нормализация durationMs, не
  timestamp'ов); матрица exit-кодов; validatePhaseReceipt на существующем receipt'е
- eval: не требуется (это предпосылка для G1, не сам eval)
- npm run check зелёный

ВОПРОСЫ НАЗАД
- если поведение по одной из 8 дыр §3.1.3 неоднозначно (например exit-код в конкретной ветке
  module-mocks) — остановись и спроси Lead, не угадывай ожидаемое значение.
```

### Бриф 2/5 — SO-1: `knowledge.xml` project-owned

```
БРИФ 32/SO-1: project-owned knowledge.xml (блокер релиза)

КОНТЕКСТ
- Документ плана: ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1
- Источник в main: f74c8c1d (PROJECT_OWNED_ENTRIES, статус preserved)
- Что уже есть в v2: cli/cmd/sync/sync-core.ts:226-244 (зеркальное удаление без ownership),
  sync.types.ts:6 ('added'|'updated'|'deleted'|'unchanged' — 'preserved' отсутствует)

ЦЕЛЬ
Портировать PROJECT_OWNED_ENTRIES + статус 'preserved' из main: knowledge.xml никогда не
перезаписывается и не удаляется, если отличается от пакетного (создаётся, если отсутствует).

ИНВАРИАНТЫ (не нарушать)
- 'preserved' must NOT be written (main sync-core.ts:253-254) — тот же принцип в v2.
- Не расширять PROJECT_OWNED_ENTRIES дальше knowledge.xml в этой задаче (остальное — SO-2/T-4).

ФАЙЛЫ
- трогать: cli/cmd/sync/sync-core.ts (+лестница :261-268), sync.types.ts:6 (+'preserved'),
  sync-formatter.shared.ts, ai/directives/knowledge.xml (шапка PROJECT-OWNED),
  specs/cli/sync/sync.spec.md
- не трогать: cli/cmd/sync-skills/** (это SO-2), плагинные корни (SO-13)

ПРИЁМКА
- тесты: порт sync-core.test.ts:223,242 из main; новый e2e "keeps a project-owned knowledge.xml
  across two syncs"
- eval: G2 — не требуется отдельный сценарий, покрывается E-04 (уже в плане, не создавать новый)
- sdd-check / npm run check зелёные

ВОПРОСЫ НАЗАД
- если в текущем RC-реестре knowledge.xml уже есть записи, которые логически должны стать
  PROJECT-OWNED автоматически при первом sync (не только "не перезаписывать") — остановись,
  это пересекается с SO-3 (целевая архитектура) и не должно решаться неявно в SO-1.
```

### Бриф 3/5 — SO-2 + SO-2b: манифест orphan-скиллов + гейт внутрискиллового зеркала

```
БРИФ 32/SO-2+SO-2b: манифест sync-skills (блокер релиза, закрывает issue #9.4/ISS-3)

КОНТЕКСТ
- Документ плана: ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1;
  ai/drafts/research/sdd-v1-to-v2-transfer/20-ISSUES-VERDICTS.md #9.4 (блокер)
- Источник в main: 62172906 (MANIFEST_NAME = '.gennady-synced', тесты :377,:391,:538-627)
- Что уже есть в v2: cli/cmd/sync-skills/sync-skills-core.ts:396-404 (orphansToDelete = всё, чего
  нет в source — удаляет любой проектный скилл без манифеста); :377-392 (внутрискилловое файловое
  зеркало — самостоятельная находка независимой верификации, S5-bis, не в тексте issue)

ЦЕЛЬ
Два слоя защиты: (1) SO-2 — манифест устанавливает, что "своим" пакет считает только то, что сам
поставил; проектные скиллы (generate-codeowners/, write-uitests/ — кейс из issue) не удаляются.
(2) SO-2b — внутри поддерживаемого скилла удаляется файл, только если его имя уже было в манифесте
предыдущего sync; иначе не трогается.

ИНВАРИАНТЫ (не нарушать)
- Манифест — единственный источник "что мы поставили"; никогда не удалять по дельте
  source-vs-target без сверки с манифестом.

ФАЙЛЫ
- трогать: cli/cmd/sync-skills/sync-skills-core.ts (MANIFEST_NAME, readSyncManifest,
  writeSyncManifest, adoptPackageInstalled, nextManifestNames, deleteOrphan :192,
  внутрискилловое зеркало :377-392), sync-skills.types.ts,
  specs/cli/sync-skills/sync-skills.spec.md:229,331,336-343 (переписать — легитимируют текущую
  потерю)
- не трогать: sync-core.ts (директивы — отдельный owner SO-1/T-4), плагинные корни

ПРИЁМКА
- тесты: порт sync-skills-core.test.ts:377,391,538-627; новый "deleting a file inside a supported
  skill only removes previously-manifested names"; новый "a project file inside a supported skill
  is never deleted"
- eval: G2 — покрывается E-04 (не дублировать новым сценарием)
- npm run check зелёный

ВОПРОСЫ НАЗАД
- если найдётся третий класс потери (не orphan целого скилла, не внутрискилловое зеркало) —
  остановись и опиши его Lead, не расширяй объём задачи самостоятельно.
```

### Бриф 4/5 — SO-7: устойчивость к частичному чтению источника

```
БРИФ 32/SO-7: partial source read never deletes (блокер релиза)

КОНТЕКСТ
- Документ плана: ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1, §0
  (воспроизведённый прогон — "S4")
- Источник в main: н/п (это находка независимой верификации, не порт main-фикса)
- Что уже есть в v2: cli/cmd/sync/sync-core.ts:176-182 (сбой чтения источника не отличается от
  "источник пуст" → удаляет весь целевой поддерево — на реальном прогоне один chmod убил 8 живых
  файлов)

ЦЕЛЬ
Различать "источник пуст" и "источник не прочитан": ошибка чтения (ENOENT/EACCES/др.) выставляет
флаг incomplete и запрещает удаление в этом поддереве вместо трактовки как "всё удалено".

ИНВАРИАНТЫ (не нарушать)
- Fail-safe направление: при любой неопределённости — не удалять, не молчать (напечатать warning).

ФАЙЛЫ
- трогать: cli/cmd/sync/sync-core.ts:176-182, cli/cmd/sync-skills/sync-skills-core.ts (scanSkills,
  тот же класс ошибки)
- не трогать: manifest-логику SO-1/SO-2 (это отдельная задача, не смешивать в одном коммите)

ПРИЁМКА
- тесты: новый "a partial source scan never deletes" (мок readdirSync, кидающий ошибку на части
  дерева); порт духа sync-skills-core.test.ts:246,265
- eval: G2, покрывается E-04
- npm run check зелёный

ВОПРОСЫ НАЗАД
- если поведение "не удалять" должно также блокировать 'added'/'updated' записи в этом же
  прогоне (не только удаления) — остановись, это расширяет объём за пределы issue #24/ISS-13.
```

### Бриф 5/5 — SO-11: `<Rule><File>` существования замок

```
БРИФ 32/SO-11: SDD_RULE_FILE_MISSING (блокер релиза — закрывает SO-1 от нового тихого отказа)

КОНТЕКСТ
- Документ плана: ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1,
  "Минимальная альтернатива SO-3"
- Источник в main: н/п (новая проверка, main её тоже не имеет explicit)
- Что уже есть в v2: shared/sdd/task-authoring-literals.ts:59-91 (parseRuleRegistry/
  loadRuleRegistry читают <Rule><File> без проверки существования файла на диске)

ЦЕЛЬ
sdd-check сообщает SDD_RULE_FILE_MISSING, если запись реестра ссылается на несуществующий файл
правила. Без этой задачи SO-1 (preserved knowledge.xml) может создать новый тихий отказ: реестр
цел, а файлы правил под ним удалены зеркальным sync — как в реальном прогоне на cloud-ios (4 из 5
Swift-правил).

ИНВАРИАНТЫ (не нарушать)
- Не путать с T-3 (полный аудит контракта правила — 4 секции файла, unregistered-чек); эта задача
  — только existence-чек одной ссылки <File>, минимальный и самодостаточный.

ФАЙЛЫ
- трогать: shared/sdd/check.ts (новый код), shared/sdd/task-authoring-literals.ts (если нужно
  прокинуть путь диска)
- не трогать: сам реестр ai/directives/knowledge.xml (это T-1/T-12)

ПРИЁМКА
- тесты: "reports a registry rule whose file is missing"
- eval: не требуется, покрывается детерминированным тестом
- npm run check зелёный; должна идти ПОСЛЕ или ВМЕСТЕ с SO-1 в том же релизном проходе (порядок
  коммитов внутри волны не важен, но обе задачи обязаны попасть в один релизный чек)

ВОПРОСЫ НАЗАД
- нет ожидаемых — задача полностью специфицирована.
```

---

## 5. Счётчики

### 5.1 По трекам

| Трек | Кол-во задач | Из них блокеры релиза |
|---|---|---|
| ISS (issues akkrat, включая дубли-указатели) | 13 (ISS-1..13) | 2 (ISS-3, ISS-13) |
| LOCK (замки-тесты) | 3 | 0 |
| V (VERIFY) | 19 (V-01..V-18 + V-04a) | 0 (но V-15/V-17 — предпосылки A5/A6) |
| B2 (CHECK-LOG) | 18 (B2-01..18) | 0 |
| SO (SYNC-OWNERSHIP) | 15 (SO-1..14 + SO-2b) | 5 (SO-1, SO-2, SO-2b, SO-7, SO-11) |
| T (RULES) | 14 (T-1..14) | 0 |
| REL (RELEASE/PACKAGE) | 15 (REL-1..14 + REL-15) | 0 (все — предпосылки A9, не помечены отдельным блокером) |
| T-B6 (DIRECTIVES/SKILLS) | 27 (T-B6-01..27) | 0 |
| E (EVAL) | 17 (E-00..16) | 0 (E-14 — обязательна по D-3, не «блокер релиза» в узком смысле, а критерий приёмки A1) |
| **Итого** | **141** | **7** |

### 5.2 По размеру

| Размер | Кол-во (оценка по мастер-таблице) |
|---|---|
| S | 74 |
| M | 51 |
| L | 11 |
| S+S / S-M / смешанные | 5 |

*Метод подсчёта:* каждая задача учтена по заявленному в исходном треке размеру; составные (`S+S`, `S-M`) отнесены в отдельную строку, не округлены произвольно ни в одну сторону.

### 5.3 Заблокировано решением оператора

| ID | Открытое решение |
|---|---|
| V-16 (частично, fix-грань) | Q8 (доc30 §7, D-13 породило) — `fix`: глагол или флаг |
| SO-3 | D-1(доc32, вариант 2) — целевая архитектура, не блокер, но не входит в релизные волны |
| SO-12 | **D-23** — первый v2-sync над v1-деревом потребителя |
| T-2, T-7 | **D-24** — слой правил (owner-модель реестра) |
| T-B6-04 | **D-26** — параллель задач в одном дереве |
| REL-7, REL-12, REL-13 | Q2/Q5 (доc34 §9) — тест-конкурентность, ждут результат REL-15 |
| E-06, E-07 | контрадикция doc50/L-15 по порядку (см. §2.2 п.1) — требует снятия перед выдачей |

**Итого заблокировано решением оператора (не считая просто «ждёт другую задачу плана»): 9 задач** (V-16 частично, SO-3, SO-12, T-2, T-7, T-B6-04, REL-7, REL-12, REL-13) + 2 задачи с внутренней контрадикцией документов, требующей разрешения (E-06, E-07).

### 5.4 Волны — размер

| Волна | Кол-во задач |
|---|---|
| Волна 0 | 43 |
| Волна 1 | 4 |
| Волна 2 | ~18 |
| Волна 3 | ~40 |
| Волна 4 | ~11 |
| Волна 5 | ~10 |
| Вне волн (пост-релиз/заблокировано) | ~15 (SO-3, T-2, T-7, и частично дублирующие/companion-строки уже учтены в своих волнах) |

Сумма по волнам не равна ровно 141, так как несколько задач (например SO-13, T-8, T-B6-06) явно висят на границе двух волн («стартует к концу Волны 2 / фактически Волна 3») и посчитаны в волне их фактического начала, а не завершения; дубли-указатели (ISS-*, SO-10) считаются в волне своего владельца, не отдельно.
