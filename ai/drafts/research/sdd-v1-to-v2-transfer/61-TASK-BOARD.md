# 61 — Сводная доска задач (треки 20, 30–50) + волны исполнения + первые пять брифов

> Статус: пишется (черновик, ревизия после независимой верификации **V-61** — см. § Итог верификации V-61 в конце документа). Источники: `01-INTERVIEW-DECISIONS.md` (**D-1..D-33**), `02-LEAD-DECISIONS.md` (L-1..L-15), `20-ISSUES-VERDICTS.md` (ISS-1..13, LOCK-1..3), `30-TRACK-VERIFY.md` §6 (V-01..V-18 + V-04a; V-16 расщеплена на V-16a/V-16b, добавлена V-19), `31-TRACK-CHECK-LOG.md` §4.1 (B2-01..18 + B2-19/B2-20), `32-TRACK-SYNC-OWNERSHIP.md` §4.1 (SO-1..14 + SO-2b), `33-TRACK-RULES.md` §5 (T-1..T-14) + **`33a-RULES-EXPLAINER.md`** и **`33b-RULES-VARIANTS.md` §6** (RULES-D1..RULES-D6, переформулировка T-2, отмена T-7 по D-32), `34-TRACK-RELEASE-PACKAGE.md` §8 (REL-1..14 + REL-15 по D-10/D-30 + REL-16), `40-TRACK-DIRECTIVES-SKILLS.md` §5.1 (T-B6-01..27 + T-15 по L-11), `50-TRACK-EVAL.md` §4 (E-00..E-16 + E-17..E-21), `60-ACCEPTANCE.md` (A1..A15), `70-ORCHESTRATION-PROTOCOL.md` (шаблон брифа).
> Абсолютный путь к документам плана в worktree Lead: `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e/ai/drafts/research/sdd-v1-to-v2-transfer/`.
> Легенда решений: **D-N** — глобальное решение оператора (`01-INTERVIEW-DECISIONS.md`); **L-N** — техническое решение Lead (`02-LEAD-DECISIONS.md`, отменяемо оператором); **Q-<трек>** — вопрос оператору внутри трека, ещё без глобального D-номера (см. `00-INDEX.md` §4).
> «Закрывает»: **#N** — issue akkrat; **A1..A10** — критерий приёмки (`60-ACCEPTANCE.md`); **C*/S*/R*/D*/P*/И*/O-N** — инварианты соответствующих треков (C — CHECK-LOG doc31, S/R — SYNC/RULES doc32/33, D — DIRECTIVES doc40 разделы, П/И — VERIFY doc30 инварианты, O-N — открытый вопрос из `00-INDEX.md` §4).

---

## 1. Мастер-таблица задач

Столбцы: **ID** · **Трек** · **Цель** · **Файлы** · **Размер** (S/M/L) · **Зависит от** · **Eval/тест** · **Закрывает** · **Решение** · **Блокер релиза** · **Статус** · **Дубли/связи**.

Статусы: `ГОТОВ К ВЫДАЧЕ` — нет незакрытых зависимостей и нет открытого решения оператора, можно выдавать сейчас; `ЧЕРНОВИК` — зависит от другой задачи плана (пока не выполненной), решений не требует; `ЗАБЛОКИРОВАН <причина>` — стоит открытое решение оператора (D-23/**D-33**/D-26, открытый Q-*/O-* трека) или не полностью выясненная формулировка; `ОТМЕНЕНА <причина>` — задача снята решением оператора, строка сохранена для трассируемости и не считается в счётчиках активных задач. Двойные статусы в одной ячейке запрещены (V-16 расщеплена на V-16a/V-16b именно поэтому).

Трековая предпосылка B2: **все задачи трека B2 зависят от B2-17** (актуализация спек `sdd-log`/`sdd-check`; по правилам самого v2 — spec-first, `31-…md:638`); ребро проставлено в колонке «Зависит от» каждой строки трека.

Разделительные строки (`▼ ТРЕК`) — только навигация, не задачи.

| ID | Трек | Цель | Файлы | Размер | Зависит от | Eval/тест | Закрывает | Решение | Блокер релиза | Статус | Дубли/связи |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **▼ ISS/LOCK** | — | — | — | — | — | — | — | — | — | — | — |
| ISS-1 | ISS | `SDD_NO_TICKETS_FOUND` (error, exit 2) на пустом `--all`/`--changed`; поправить дрейф `sdd-migrate/help.ts:14` | `sdd-check.cmd.ts`, `sdd-migrate/help.ts:14` | S | — | G4, G3 | #9.1, C2 | — | нет | владелец задачи — **B2-05** | **дубль B2-05** (владелец); ISS-1 закрывается вместе с ней |
| ISS-2 | ISS | Единый список исходных расширений (Swift/ObjC/…) для consumers/BDD-index/`yagni` | `shared/sdd/source-extensions.ts` | S | — | G1 | #9.2 | — | нет | владелец — **B2-12** | **дубль B2-12** (владелец) |
| ISS-3 | ISS | Манифест orphan-скиллов, чтобы `sync-skills` не удалял проектные скиллы | `sync-skills-core.ts` | S | — | G2 | #9.4, A4 | D-6, D-22 | указатель (блокеры — владельцы SO-2/SO-2b, отдельно не считается) | владелец — **SO-2 + SO-2b** | **дубль SO-2/SO-2b** (владельцы) |
| ISS-4 | ISS | `extraGates[].when` — стек-независимый план гейтов с файловой областью | `phase-verification-plan.ts`, `stack-config.ts` | L | V-03, V-07 (как у владельца V-12) | G1 | #9-bonus | — | нет | владелец — **V-12** (+V-07/V-08) | **дубль V-12** (владелец, часть общего Effort L с #20/ISS-9) |
| ISS-5 | ISS | Причинный `Reopens`: Meta ↔ `@audit … triggered-reopen` | `check.ts` | M | B2-01 | G3 | #13 | — | нет | владелец — **B2-06** | **дубль B2-06** (владелец); companion **T-B6-17** (сборка `ax-stale-after-pivot-verification`) |
| ISS-6 | ISS | `nextRoundNumber` — по секции EXECUTION_LOG, не по файлу; миграция `### Round N` под `## Critic Rounds` → `### Critic Round N` | `sdd-log.types.ts:76-79`, `migration-v1-v2.directive.xml` | S | B2-16 | G4, G3 | #15 | — | нет | владелец — **B2-02** | **дубль B2-02** (владелец) |
| ISS-7 | ISS | Вывод зелёного гейта не теряется: конвенция `[gate] ` | `sdd-verify.types.ts` | S | V-03 | G1 | #17 | D-19 | нет | владелец — **V-14** | **дубль V-14** (владелец) |
| ISS-8 | ISS | Именованное исключение `git`-запрета для throwaway-репозитория в `.claude/tmp/`; §5-гейт как отдельный барьер | `ax-permitted-bash-commands.xml` | M | T-B6-08, T-B6-12 | G1, G3 | #19 | — | нет | ЧЕРНОВИК (после T-B6-08/12) | связан с **T-B6-12** (сборка аксиома), **T-B6-08** (двусторонний lint) |
| ISS-9 | ISS | `verify --wip <files>`/`--only` — файловая область и новый гейт по префиксу/glob | `stack-config.ts`, `verify.cmd.ts` | L | V-03, V-07 | G1 | #20 | — | нет | владелец — **V-12 + V-13** | **дубль V-12/V-13** (владельцы), общий Effort с ISS-4 |
| ISS-10 | ISS | Критик читает `## Conventions`/`## Decision Log` владельца тикета через `sdd-extract` | `critic-protocol.directive.hbs` | S | T-B6-21 (не собирает в мёртвый файл) | G3 | #21 | — | нет | ЧЕРНОВИК | координировать с **T-B6-21/T-B6-03** (тот же файл) |
| ISS-11 | ISS | Грамматика провенанса Handoff: `measured\|reported\|assumed`, extent у `open` | `contract/process/handoff-format`, `sdd-log.types.ts:248-249` | M | — | G3 | #22 | — | нет | ГОТОВ К ВЫДАЧЕ | координировать файлы с **B2-14** (тот же скелет Handoff) |
| ISS-12 | ISS | Токен `correction` в словаре + валидация `sdd-log line` + порт детекции записи в закрытый раунд | `execute.directive.hbs`, `sdd-log.cmd.ts` | M | B2-16 | G3 | #23 | L-1..L-3 | нет | владелец — **B2-03 + B2-04** | **дубль B2-03/B2-04** (владельцы) |
| ISS-13 | ISS | `PROJECT_OWNED_ENTRIES`+`preserved` для `knowledge.xml`; манифест директив; зеркальное удаление только по манифесту | `sync-core.ts` | M | — | G2 | #24, A4 | D-6, D-22 | указатель (блокеры — владельцы SO-1/SO-7/SO-11, отдельно не считается) | владелец — **SO-1 + SO-7 + SO-11** | **дубль SO-1/SO-7/SO-11** (владельцы) |
| LOCK-1 | LOCK | Замок-тест: `model:` пин никогда не возвращается | `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` | S | — | G3 | #9.5 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| LOCK-2 | LOCK | Замок-тест: `~/.claude/skills` не встречается в rendered-директивах | contract-тест по `ai/**` | S | — | G2 | #11 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| LOCK-3 | LOCK | Замок-тест: `DIRECTIVE ACTIVATED` не встречается в скиллах/директивах | contract-тест по `ai/skills/**/SKILL.md` | S | — | G3 | #16 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| **▼ V — VERIFY** | — | — | — | — | — | — | — | — | — | — | — |
| V-01 | V | Golden текущего поведения RC verify (ступени, строки команд, receipt, 8 дыр §3.1.3) **+ `planTargetRepair`-golden** (`30-…md:495`); golden `environmentState` снимается с замороженной фикстуры, не с корня RC (И-3 фингерпринтит `package.json`, который правят REL-6/REL-8/REL-4); в этой же задаче обновляется ожидание `npm run test:topology` (`unit=211 …`, `50-…md:415`) | `preset-node-golden.test.ts`, `parity-node.test.ts`, `scripts/test-topology.ts` (ожидание) | M | — | golden-тест + `npm run test:topology` | И-1..И-3 (базовый) | — | нет | ГОТОВ К ВЫДАЧЕ | конвенция обновления golden — `UPDATE_*_GOLDEN=1`, как у SO-5/T-9; легальные обновления golden-утверждений принадлежат V-04a/V-12/V-14 |
| V-02 | V | Перенос примитивов MAIN verbatim (`env-fail`, `stack-config`, `plugins/{anystack,golang}`) + правка `test-topology.ts`/`tsconfig.json` | `shared/verify/*`, `plugins/**`, `scripts/test-topology.ts` | M | V-01 | детерм. (106 перенесённых тестов) | А6 | — | нет | ЧЕРНОВИК | — |
| V-03 | V | `Gate`/`GateStatus` как данные: `env-fail\|timeout\|violation` | `sdd-verify.types.ts:21-44` | M | V-02 | детерм. | А6 | — | нет | ЧЕРНОВИК | — |
| V-04 | V | `resolvePreset(stack, profile, root, config)` + node-пресет байт-в-байт | `shared/verify/presets/node.ts` | M | V-03 | детерм. + V-01 golden | А6, D-17 | D-17 | нет | ЧЕРНОВИК | — |
| V-04a | V | Источник fingerprint'а (`environmentState`) как обязанность пресета — закрывает И-3 | `phase-receipt.ts:1127-1254` | M | V-04 | детерм. (матрица npm/pnpm/yarn) | И-3 | — | нет | ЧЕРНОВИК | — |
| V-05 | V | Детект стека из репозитория + факт в снапшоте (`STACK=`, `STACK_SOURCE=`) | `shared/verify/stack-detection.ts`, `sdd-state.cmd.ts` | M | V-02 | детерм. | 2.2, 3.2 (роутер) | — | нет | ЧЕРНОВИК | дубль-предупреждение: не путать с директивной половиной **T-B6-06** |
| V-06 | V | Readiness: движок + node-адаптер байт-в-байт + тривиальный anystack-адаптер; снять eval-шим | `readiness.ts:15-24,296-609`, `ladder.ts`, `gate-queue.ts` | L | V-05, V-04a | детерм. + `check:directives-fresh` | А6, D-14 | D-14 | нет | ЧЕРНОВИК | самый большой L в критическом пути |
| V-07 | V | Конфиг-контракт `gennady.yaml` секция `stack:` (deep-merge, провенанс, exit 4) | `shared/verify/stack-config.ts` | M | V-02, V-03 | G1 (fixture-detmig) | А6 | — | нет | ЧЕРНОВИК | трогает спеки (`specs/stack\|config\|plugins/**`) |
| V-08 | V | anystack в фазовой модели: read-only гейты из `gennady.yaml`, фиксированный порядок в `gatePlan` | `shared/verify/presets/anystack.ts` | M | V-07, V-04a | G1 (fixture-detmig) | А6, D-16 | D-16 | нет | ЧЕРНОВИК | первый нестандартный стек (D-16) |
| V-09 | V | golang-пресет: плагин verbatim + маппинг ладдера + `environmentState` | `plugins/golang/**`, `shared/verify/presets/golang.ts` | M | V-05, V-03, V-04a | G1 | А6, D-16 | D-16 | нет | ЧЕРНОВИК | параллелен V-10/V-11 |
| V-10 | V | python-пресет + coverage-адаптер | `plugins/python/**`, `coverage-py-adapter.ts` | M | V-05, V-04a | G1 | А6, D-16 | D-16 | нет | ЧЕРНОВИК | параллелен V-09/V-11; **D-25 снят** из «Закрывает»/«Решение» (D-25 — про python-*правила*, не про пресет; порядок пресетов задаёт D-16) |
| V-11 | V | swift-пресет + `xccov`-адаптер + стратегия обхода `workspace-mutation` (10 ГБ DerivedData) | `plugins/swift/**`, `xccov-coverage-adapter.ts` | L | V-05, V-04a | G1 (fixture-detmig) | А6, D-15, D-16 | D-15, D-16 | нет | ЧЕРНОВИК | параллелен V-09/V-10 |
| V-12 | V | `when: [<glob>]` на гейт + сужение по Target Files фазы; отсечённый гейт виден в receipt | `stack-config.ts:34-45`, `phase-context.ts:169-239` | M | V-03, V-07 | G1 | #9-bonus, #20(i), ISS-4, ISS-9 | D-18 (частично: валидация «timeout > 10m без `when` → ошибка» — отдельная задача **V-19**) | нет | ЧЕРНОВИК | владелец **ISS-4** и части **ISS-9**; обязателен приёмочный пункт «для репозитория без `gennady.yaml`/`when` план и `gateEvidence` до и после V-12 совпадают побайтово» (D-17, см. §2.2 п.7) |
| V-13 | V | `--only/--skip` доступны только `gennady verify`/`--profile full`; запрещены при `--task/--phase` | `verify.cmd.ts:69-71,166-212` | M | V-03, V-07 | G1 | #20(iii), ISS-9 | — | нет | ЧЕРНОВИК | владелец части **ISS-9** |
| V-14 | V | `[gate] `-префикс переживает вердикт; опциональный `showOutputOnPass` | `sdd-verify.types.ts:288-315` | M | V-03 | G1 | #17, ISS-7 | D-19 | нет | ЧЕРНОВИК — **бриф не выдавать до снятия контрадикции D-19 vs И-2** (§2.2 п.6) | владелец **ISS-7** |
| V-15 | V | Директивы/`.hbs`/rules cascade для verify; `baseline-testing.xml` + запись в `knowledge.xml` | `readiness/infra/router/audit/phase-execution-protocol.directive.hbs` | M | V-06 (частично; зависимость от V-05 снята) | `check:directives-fresh` | А6 | — | нет | ЧЕРНОВИК | пересекается текстово с **T-1** (RULES) |
| V-16a | V | Read-only фасад `gennady verify --plan --json` (входит в релиз по D-13) | `cli/cmd/verify/**` | S | V-04, V-07 | детерм. | D-13, А9 | D-13 | нет | ЧЕРНОВИК (после V-04/V-07; открытых решений нет) | половина расщеплённой V-16 (V-61 §C.2) |
| V-16b | V | `gennady fix` — только с `RepairMutationBoundary`; вне релиза по D-13 | `cli/cmd/fix/**` | S | V-04, V-07 | детерм. | D-13 (отрицательный критерий: в `dist`/`exports`/help нет `gennady fix`) | **O-2 открыт** (`fix` — глагол или флаг). Ссылка «доc30 §7 Q8» неверна: в doc 30 §7 только Q1..Q7 — источник `00-INDEX.md` §4 O-2 + D-13 | нет — пост-релиз | **ЗАБЛОКИРОВАН O-2** | половина расщеплённой V-16 (V-61 §C.2) |
| V-17 | V | Снятие v1-корпуса verify (`verify.sh`, `gennady verify --wip <files>` в директивах/скиллах) | `phase-execution-protocol.xml`, `sdd-execute/SKILL.md`, `verify.sh` | S | V-15, **V-16a** (не V-16b — иначе A5 висит на открытом O-2) | детерм. (grep=0) | A5 | 1.1, 3.4, D-27 | нет | ЧЕРНОВИК | часть v1-удаления (волна 5) |
| V-18 | V | Single-flight фазового verify: протокол или lock против ложных мутаций | `sdd-verify/{phase-run,workspace-mutation}.ts` | S/M | V-06 | детерм. или явное решение в спеке | O-4 (частично, связано с D-26) | — | нет | ЧЕРНОВИК | связан с **T-B6-04** (batch-параллель, D-26); по §2.2 п.4 выдаётся одним брифом с T-B6-04 → перенесена в **Волну 3** |
| V-19 | V | Валидация конфига: гейт с `timeout > 10m` без `when` → ошибка валидации с подсказкой | `shared/verify/stack-config.ts`, `phase-verification-plan.ts` | S | V-07 (сверить с V-12) | детерм. | А6, **D-18** | D-18 | нет | ЧЕРНОВИК (после V-07) | новая задача (V-61 §B): у D-18 не было исполнителя |
| **▼ B2 — CHECK-LOG** | — | — | — | — | — | — | — | — | — | — | — |
| B2-16 | B2 | Проставить `<!--PHASE_RECEIPTS:v1-->` на корпусе + `firstRoundPhaseBlockCounts` на «текущий раунд»; **предикат L-2: тикеты v2-имени `*.task.<ID>.md` проверяются всегда, legacy — только по маркеру** (вариант 3 по L-2, `31-…md:672`) | `check.ts:219-241`, `group-receipt.ts:298` | M | B2-17 (spec-first) | детерм. | D4 (доc31), D-4 (глоб.), L-2 | L-2, D-4 | нет | ЧЕРНОВИК | наивысший приоритет трека B2 |
| B2-07 | B2 | `SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE`; `sdd-log close` отказывает без receipt | `check.ts`, `phase-receipt-check.ts`, `sdd-log.types.ts:124-179` | M | B2-16, B2-17 (spec-first) | детерм. | C6, C10 | D-21 (group receipt в pickable, смежно) | нет | ЧЕРНОВИК | — |
| B2-04 | B2 | `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE`/`_CLOSE_EXTRA_ENTRY`/`_ENTRY_LATER_THAN_CLOSE`/`_ROUND_UNCLOSED` | `check.ts`, `sdd-log.cmd.ts:420,433-469` | M | B2-16, B2-07, B2-17 (spec-first) | детерм. + golden `DA-lazy-asm` | C6, #23 | L-3 | нет | ЧЕРНОВИК | владеет частью **ISS-12** |
| B2-02 | B2 | `nextRoundNumber` — только секция EXECUTION_LOG; миграция legacy `### Round N` → `### Critic Round N` | `sdd-log.types.ts:76-79`, `group-receipt.ts:64-68` | S (в связке с B2-01) | B2-16, B2-17 (spec-first) | детерм. | C7, #15, ISS-6 | — | нет | ЧЕРНОВИК | владелец **ISS-6** |
| B2-03 | B2 | `TOKEN_VOCABULARY` — один дом; добавить `correction`; согласовать `ver`/`yagni`/`fix`/`env-fix` | `shared/sdd/execution-log.ts`, `templates.ts:1581` | M | B2-17 (spec-first) | детерм. | C11, #23, ISS-12 | L-1 (`ver`) | нет | ГОТОВ К ВЫДАЧЕ | владелец части **ISS-12** |
| B2-01 | B2 | Единый парсер Execution Log (`parseExecutionLog`), консолидирует B2-02/04/07 | новый `shared/sdd/execution-log.ts` | L | B2-02, B2-04, B2-07, B2-17 (spec-first) | детерм. (существующие сюиты остаются зелёными) | C1..C15 (структурный фундамент) | — | нет | ЧЕРНОВИК | — |
| B2-06 | B2 | Причинный `Reopens`: `parseAuditRounds` + `SDD_REOPENS_MISMATCH`/`_PENDING` | `check.ts`, `sdd-log.cmd.ts:433-435,479` | M | B2-01, B2-17 (spec-first) | новый `reopens.test.ts` | C8, #13, ISS-5 | D-20 | нет | ЧЕРНОВИК | владелец **ISS-5**; companion **T-B6-17** |
| B2-05 | B2 | `SDD_NO_TICKETS_FOUND` (error, exit 2) для `--all`/`--changed`; P5 (документировать exit 2) + P6 (симметрия `--all`/`--task` на legacy) | `sdd-check.cmd.ts:1275-1295`, `help.ts` | S | B2-17 (spec-first) | детерм. | #9.1, C2, ISS-1 | — | нет | ГОТОВ К ВЫДАЧЕ | владелец **ISS-1** |
| B2-08 | B2 | `ax-reopen-format.xml` под структуру v2 (4-колоночная `PHASES_OVERVIEW`, форма реопена по D-20) | `ax-reopen-format.xml`, `reconcile.directive.xml` | M | B2-17 (spec-first) | детерм. | C8, D2/D6(doc31) | D-20 | нет | ГОТОВ К ВЫДАЧЕ | — |
| B2-09 | B2 | `parsePhasesOverview` устойчив к v1-заголовкам (щит по именам колонок) | `ticket.ts:202-203`, `sdd-log.types.ts:295-311` | S | B2-17 (spec-first) | детерм. (фикстура `cli-lint.task-14.md`) | A1 (самомиграция) | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| B2-10 | B2 | Миграция якорей: `### Phase P1`/`Phases Overview` на уровне `###`; явный отказ без `PHASES_OVERVIEW` | `anchor-inject.ts:12-28`, `migration-plan.ts` | L | B2-17 (spec-first) | детерм. (2 фикстуры + 50 уже мигрированных тикетов) | A1, A2 | — | нет | ЧЕРНОВИК (требует инвентаризации 50 тикетов) | — |
| B2-11 | B2 | Синхронизировать `STEP_1_MECHANICAL.xml` с фактическим набором кодов `sdd-check` | `audit/steps/STEP_1_MECHANICAL.xml`, `ax-task-id-integrity.xml` | S | B2-17 (spec-first) | `check-directives-fresh` + coverage-тест кодов | D5 (doc31) | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| B2-12 | B2 | Единый `shared/sdd/source-extensions.ts` для consumers/BDD-index; вернуть механический orphan-`@tasks` | новый `source-extensions.ts`, `sdd-check.cmd.ts:503,699-701` | M | B2-17 (spec-first) | фикстура `Foo.swift`+`FooTests.swift` | #9.2, ISS-2, G1 | — | нет | ГОТОВ К ВЫДАЧЕ | владелец **ISS-2** |
| B2-13 | B2 | Групповая квитанция учитывается в pickable (вариант 2 doc31 D3, выбран **D-21**); убрать необеспеченную прозу `TECHNICAL_REPLAN_EXHAUSTED`/кросс-спековую блокировку без реализации | `execute.directive.xml:88-99`, `ax-audit-hook.xml` | M | B2-16, B2-17 (spec-first) | `check-pickable.test.ts` | D3 (doc31), D-21, A7 | **D-21 (вариант выбран)** | нет | ГОТОВ К ВЫДАЧЕ после B2-16 (вариант D3 выбран решением D-21) | без B2-16 гейт выключен грандфазерингом |
| B2-14 | B2 | Согласовать скелет Handoff (3 копии vs 4-польная запись `complete`) | `task-ticket-structure.xml:147`, `templates.ts:1362`, `phase-block-format.xml:20` | S | B2-17 (spec-first) | `templates.test.ts`, `sdd-log.cmd.test.ts:446` | D3(1.12,doc40) | — | нет | ГОТОВ К ВЫДАЧЕ | координировать с **ISS-11** (тот же скелет) |
| B2-15 | B2 | Разгрести долг в RC: дубли `TSK-88`, синхронизировать `specs/3-tasks.md` со словарём/Baseline Rule генератора | `tasks/vcs/vcs-mr-client.task-88.md`, `specs/3-tasks.md:11-12` | S | B2-17 (spec-first) | `sdd-check --all .` → 0 `SDD_TASK_ID_COLLISION` | A1 (самомиграция) | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| B2-17 | B2 | Обновить `sdd-log.spec.md`/`sdd-check.spec.md` под фактический код (режимы, коды) | `specs/cli/sdd-log/sdd-log.spec.md:25,119`, `specs/cli/sdd-check/sdd-check.spec.md` | M | — | ручная сверка со списком режимов/кодов | spec-first дисциплина (блокирует остальной трек) | — | нет | ГОТОВ К ВЫДАЧЕ (блокирующее требование) | — |
| B2-18 | B2 | Достроить/удалить 7 неподключённых кирпичей `ai/kit/contract/process/**` | `blocker-format.xml`, `phase-block-format.xml`, др. | S/M | связана с B2-03, B2-17 (spec-first) | gate «каждый кирпич подключён» | D-словарь (doc31) | — | нет | ЧЕРНОВИК | связан с **B2-03** |
| B2-19 | B2 | Секция `## Blocker Trail`: шаблон тикета, `sdd-log resolved` пишет туда с обратной ссылкой на раунд/фазу, анкор для `sdd-extract`, миграция существующих `✅ RESOLVED` | шаблон тикета (`templates.ts`), `sdd-log.cmd.ts`, `sdd-extract`, `scanBlockerTrail`, `migration-v1-v2.directive.xml` | M | B2-01, B2-04, B2-08, B2-17 (spec-first) | `sdd-log.cmd.test.ts` + миграционная фикстура | **A7, A11**, D-20 | D-20 | нет | ЧЕРНОВИК (после B2-01/B2-04/B2-08) | новая задача (V-61 §B): у D-20 в части секции не было исполнителя; B2-01 лишь переносит существующий `scanBlockerTrail` |
| B2-20 | B2 | Переключение `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING` WARN→ERROR (гейт: только после B2-16 и E-14) | `check.ts`, `group-receipt.ts` | S | B2-16, E-14, B2-17 (spec-first) | `check.test.ts` (severity) + `sdd-check --all .` на самомигрированном корпусе | **A13**, D-4, O-6 | D-4 (после мигратора и самомиграции), O-6 | нет | ЧЕРНОВИК (гейт после B2-16 + E-14) | новая задача (V-61 §B): D-4 было единственным решением без исполнителя |
| **▼ SO — SYNC-OWNERSHIP** | — | — | — | — | — | — | — | — | — | — | — |
| SO-1 | SO | `knowledge.xml` project-owned: `PROJECT_OWNED_ENTRIES` + статус `preserved` | `sync-core.ts`, `sync.types.ts:6` | S | — | порт `sync-core.test.ts:223,242` | #24, ISS-13, A4 | D-22 | **ДА** | ГОТОВ К ВЫДАЧЕ | владеет частью **ISS-13**; дубль-предупреждение с **T-4** (RULES) |
| SO-2 | SO | Порт манифеста скиллов из `62172906` (orphan-проход целых скиллов) | `sync-skills-core.ts` | S | — | порт `sync-skills-core.test.ts:377,391,538-627` | #9.4, ISS-3, A4 | D-22 | **ДА** | ГОТОВ К ВЫДАЧЕ (одним брифом с SO-2b) | владеет частью **ISS-3** |
| SO-2b | SO | Гейт внутрискиллового файлового зеркала (только ранее-манифестированные имена) | `sync-skills-core.ts:377-392` | S | SO-2 | новый тест «project file inside supported skill never deleted» | #9.4, ISS-3, A4 | D-22 | **ДА** | ГОТОВ К ВЫДАЧЕ (одним брифом с SO-2 — отчёт RC на оба id, отклонение от «одна задача за раз» осознанное) | владеет частью **ISS-3** |
| SO-3 | SO | Целевая архитектура: единая хэш-модель владения (`ownership.ts`, `locally-modified`, `--force`) | новый `shared/common/sync/ownership.ts` | L | SO-1, SO-2, SO-2b | новый `ownership.test.ts` + e2e 2,3,4,5,9 | A4, A8 (частично) | D-1(вариант 2, doc32, целевая) | нет — пост-релиз | ЗАБЛОКИРОВАН (пост-релизная архитектура, не в 2.0.0-draft.N) | надстройка над SO-1/SO-2, не замена |
| SO-4 | SO | Правдивая печать `deleted` в dry-run сводке | `sync-skills-formatter.ts:88-124` | S | — | 3 кейса форматтера | — | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| SO-5 | SO | Deployed-surface golden + проверка утечек в содержимом и tarball **+ починить найденную утечку** (путь dev-home в `ai/directives/agent-inbox/golden-chat-output.example.md:176`, при необходимости правило в `path-normalizer.ts`) | новый `scripts/__tests__/deployed-surface.test.ts`, `golden-chat-output.example.md:176`, `path-normalizer.ts` | M | — | golden (`UPDATE_SURFACE_GOLDEN=1`) + `npm pack --dry-run` | A5, **A15**, A9 | — | нет | ГОТОВ К ВЫДАЧЕ (Волна 0) | координировать с **T-9** (RULES, тот же golden-паттерн). **Оговорка по D-2**: правка файла в `ai/directives/agent-inbox/**` — это устранение утечки в *поставляемой поверхности*, а не работа над agent-inbox; D-2 не нарушается, RC не обязан останавливаться |
| SO-6 | SO | Вернуть исключение тестовых артефактов из деплоя скиллов | `sync-skills-core.ts:22,84` | S | — | порт `sync-skills-core.test.ts:151,165` | A5 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| SO-7 | SO | Частичное чтение источника не приводит к удалению | `sync-core.ts:176-182`, `sync-skills-core.ts` (scanSkills) | M | — | мок `readdirSync` → «partial scan never deletes» | #24, ISS-13, A4 | D-22 | **ДА** | ГОТОВ К ВЫДАЧЕ | владеет частью **ISS-13**; максимальная разрушительность в треке |
| SO-8 | SO | `resolvePackageDir`: подъём по `package.json`, не strip `dist` | `sync-core.shared.ts:36-59` | S | — | e2e «resolves from clone without node_modules/gennady» | функциональный регресс S2 | нужно решение оператора о релизности S2-регресса (ссылка на «D-2» в 32 §4.2 — опечатка трека, см. §2.2 п.3) | по решению оператора | **ЗАБЛОКИРОВАН (решение оператора: релизность S2-регресса)** | вне волн до решения |
| SO-9 | SO | `sync-skills` → полный `sync` только с `--with-directives` (default off) | `sync-skills.cmd.ts:67-118` | S | — | e2e «does not mirror-delete directives» | O-выявленный сценарий потери | L-4 | нет | ГОТОВ К ВЫДАЧЕ | — |
| SO-10 | SO | Порт содержимого реестра: `baseline-rules`/`baseline-testing`/тонкие `python-rules`/`go-rules` в `knowledge.xml` | `ai/directives/coding/*.xml`, `knowledge.xml` | M | — | порт `testing-rule-contract.test.ts` | R3 (doc32) | — | нет | владелец — **T-1** | **дубль T-1** (владелец, RULES-трек) |
| SO-11 | SO | `sdd-check`: `<Rule><File>` реестра обязан существовать → `SDD_RULE_FILE_MISSING`, **severity `warning` сейчас (L-3), error — после инвентаризации долга** (B2-15 + golden `DA-lazy-asm`) | `check.ts`, `task-authoring-literals.ts` | S | — | «reports registry rule whose file is missing» | #24, ISS-13, A4, A8 | D-22, **L-3** (строгость кода) | **ДА** | ГОТОВ К ВЫДАЧЕ | без неё SO-1 создаёт новый тихий отказ. **Один владелец `<File>`-existence-чека — SO-11**; T-3(d4) не вводит второй код, а переиспользует `SDD_RULE_FILE_MISSING` (см. §2.1) |
| SO-12 | SO | Расширить `sdd-migrate` для миграции v1-дерева потребителя; читать `.gennady-synced` до известных хэшей v1-релизов | `cli/cmd/sdd-migrate/**`, `guides/v1-to-v2-migration.md` | L | SO-1, SO-2 (базовая модель владения) | e2e-фикстуры 6a/6b/9 | A5, O-3 | **D-23 (открыт)** | нет | **ЗАБЛОКИРОВАН D-23** (первый v2-sync над v1-деревом — обсуждение при постановке) | задача на самый конец плана (волна 5) |
| SO-13 | SO | Вернуть плагинные корни в sync (только вместе с портом `plugins/`) | `sync-core.ts` (scanSourceRoots) | M | V-02, V-09/V-10/V-11 (перенос plugins/) | порт `sync-skills-core.test.ts:237,246,265` | A6, A9 | — | нет | ЧЕРНОВИК (ждёт переноса плагинов) | — |
| SO-14 | SO | Развести имена `sync`/`sync-skills`/`sdd-sync`/`sdd-migrate` в help | `cli/cmd/*/help.ts`, `cli.spec.md` | S | — | нет (документационная) | ясность CLI | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| **▼ T — RULES** | — | — | — | — | — | — | — | — | — | — | — |
| T-1 | T | Портировать baseline + языковые правила (`baseline-rules`, `python-rules`, `go-rules`, `baseline-testing`); починить 2 неполных файла RC; сузить `<Triggers>` у `typescript-rules`; `<VerificationHooks>` сразу переписываются под `sdd-verify --task --phase` (L-8) | `ai/directives/coding/{baseline,python,go}-rules.xml`, `testing/baseline-testing.xml`, `knowledge.xml` | M | — | контрактный тест «4 секции», тест резолва зависимостей | A8, D-25 | **L-8 (Q7 закрыт: хуки переписываются под `sdd-verify --task --phase`)**, L-11 (5 go-специфичных правил → rule-файл golang; аксиомная половина — **T-15**), D-25 | нет | **ГОТОВ К ВЫДАЧЕ** (ложная блокировка Q7 снята L-8; разблокирует T-14, T-B6-06 и ветку rules baseline/go Волны 2) | владелец **SO-10** (дубль) |
| T-2 | T | Слои реестра + единственный модуль слияния. **Переформулирована по 33b §6**: слои живут внутри `sdd-rules`, на диске — C-conv (`ai/directives/local/`), а не `knowledge.core.xml`/`knowledge.stack.xml`; модуль `shared/sdd/rule-registry.ts` нужен в любом случае (дедупликация `id` до `parseRuleRegistry`, `task-authoring-literals.ts:70`) | новый `shared/sdd/rule-registry.ts` | M | RULES-D1 (скелет инструмента) | `rule-registry.test.ts` | A8 (целевое, вне релиза) | **D-31, D-33** | нет — пост-релиз | **ЗАБЛОКИРОВАН D-33** (весь блок слоя правил пересматривается перед постановкой задач трека 33 / RULES-D*) | пересекается с **RULES-D2** (тот же модуль); D-24 замещён D-31/D-32/D-33 |
| T-3 | T | Детерминированный аудит контракта правила (мейнтейнер + потребитель, один модуль) | новый `shared/sdd/rule-surface.ts`, `ai/kit/audit-rule-surface.ts` | M | L-5, L-6, L-7 (закрыты) | `rule-surface.test.ts`, `audit-rule-surface.test.ts` | A8 | L-6 (модуль в shared/sdd + 2 входа) | нет | ГОТОВ К ВЫДАЧЕ (вариант-независима по 33 §5.2 / 33b §4 п.1 — **D-33 её не блокирует**) | немедленная мера (§5.2 doc33 п.4). **(d4) `<File>`-existence — код `SDD_RULE_FILE_MISSING` владельца SO-11**, второго кода не вводить (см. §2.1) |
| T-4 | T | Владение при `sync`: сохранить проектный реестр и файлы правил (облегчённая версия для R-A′) | `sync-core.ts` (`PROJECT_OWNED_ENTRIES`) | S (R-A′) | — | `sync-core.test.ts` (a,b) | A8, G2 | **D-22** (минимальный набор), **D-31** (в релиз — режим A) | нет | ГОТОВ К ВЫДАЧЕ (Волна 0; вариант-независима, D-33 не блокирует) | **дубль SO-1** (реестр); часть (b, защита файлов правил в owned-категории) — уникальна, координировать с **SO-2b**; файлы правил внутри каскадных категорий — граница брифа SO-1 |
| T-5 | T | Вернуть текст R5 (куда проект пишет своё правило); делегирование инструменту, cap `MINOR` для `RULE_FILE_INCOMPLETE`; **правка инструкции пакета `ax-rules-load-from-phase-block.xml:3` на CamelCase (L-5)** | `ax-rules-resolution-hard-fail.xml`, `ax-scope-rules-declaration.xml`, **`ax-rules-load-from-phase-block.xml:3`** | S | T-3 | `npm run audit:sdd-templates` | R5 | L-5 (схема snake_case→CamelCase) | нет | ЧЕРНОВИК | — |
| T-6 | T | Убрать фиктивность `SDD_RULES_PHASE_EMPTY` (оба глушителя); `quality` убрать, `architecture` наполнить `ports-adapters`; **согласовать все три списка категорий (L-7), не два** | `rules-cascade.ts:62`, `sdd-check.cmd.ts:429`, `rule-paths.ts`, третий список категорий (`ax-scope-rules-declaration.xml` — координировать с T-5) | S | L-7 (закрыто) | `rules-cascade.test.ts` +кейс | — | L-7 | нет | ГОТОВ К ВЫДАЧЕ (вариант-независима, D-33 не блокирует) | — |
| T-7 | T | *(снята)* Миграционный шаг: не возвращать чужой стек при включении слоёв реестра | `sync-core.ts` | M | — | — | — | **D-32** | нет | **ОТМЕНЕНА (D-32: авто-распознавание legacy заменяет миграционный шаг — 33b §6)** | предмет переходит к **RULES-D5** (легаси-автодетект); строка сохранена для трассируемости, в счётчиках активных задач не учитывается |
| T-8 | T | Facet правил у плагина стека: `knowledge.stack.xml` генерируется, не хранится | `stack.types.ts` (+rules facet), `plugins/{node,golang,anystack}` | L | T-2 (или T-4 при R-A′) + перенос `plugins/`/`services/stack/` | `plugins/*/__tests__/*-rules.test.ts` | A8, G1 | — | нет | ЧЕРНОВИК (ждёт V-09/V-10/V-11) | — |
| T-9 | T | Замок поставляемой поверхности правил (golden-эквивалент `deployed-surface`) | новый golden-тест, включая `knowledge*.xml` | S | — | golden с `UPDATE_SURFACE_GOLDEN=1` | A5, G2 | — | нет | ГОТОВ К ВЫДАЧЕ (вариант-независима, D-33 не блокирует) | координировать каталог с **SO-5** |
| T-10 | T | Переименовать `agents-rules` → `agents-orient` | `cli/cmd/agents-rules/**` → `agents-orient/**` | S | — | перенос теста + «старое имя даёт понятную ошибку» | предпосылка **RULES-D1** (пока `agents-rules` жив, имя `rules` занято командой, печатающей `cli/cmd/orient/README.md` — `agents-rules.cmd.ts:32`, 33b §6) | — | нет | ГОТОВ К ВЫДАЧЕ (**Волна 0**; вариант-независима, D-33 не блокирует) | — |
| T-11 | T | Зарегистрировать три `uikit-*` в реестре или явно исключить из каскадных категорий | `knowledge.xml` (+3 записи) | S | T-3 | тест T-3(d4) | — | — | нет | ЧЕРНОВИК | — |
| T-12 | T | Вернуть блок `<Directives>` в реестр v2 | `knowledge.xml` (+6 записей) | S | T-3 | `<File>`-existence чек T-3(d4) | — | — | нет | ЧЕРНОВИК | ловит висячий `task-scaffolding.directive.xml` у messenger |
| T-13 | T | Детерминированная проверка раскрытия `<RequiresVerification>` алиаса | подмножество T-3(d6) | S | — | тест «каждый алиас встречается в Verification Commands infra-спеки» | предпосылка **RULES-D6** (статус хука `resolved/unresolvable/deferred` поглощает T-13, 33b §6) | — | нет | ГОТОВ К ВЫДАЧЕ (вариант-независима, D-33 не блокирует) | немедленная мера (§5.2 doc33 п.6) |
| T-14 | T | *(main-side)* Снять `go-rules.xml`/`python-rules.xml` из блока «Planned» в README | `MAIN/ai/directives/coding/README.md:21-25` | S | T-1 | grep «Planned» пуст | — | решение оператора (5.5: main заморожен, никаких записей без явного OK) | нет | **ЗАБЛОКИРОВАН (main заморожен, 5.5 — нужен явный OK оператора)** | правка не в RC-ветке, а в main-side README; размещена в Волне 3 с сохранением блокировки |
| RULES-D1 | T | Скелет `gennady sdd-rules`: `--task/--phase`, `--files/--kind`, `--list`, `--format text\|json`, `schema: 1`; выход D-adv (кандидаты + причина + замыкание + хуки) на **одном** слое; человеческая форма совпадает со строкой `READ rules:` (`sdd-task.types.ts:151`) | новый `cli/cmd/sdd-rules/**` | M | T-1, T-10 | детерм. «`sdd-rules --files main.swift --kind impl` не возвращает `typescript-rules`» (33b §6, предпосылки) | A8 (целевое, вне релиза) | **D-31, D-33** | нет — пост-релиз | **ЗАБЛОКИРОВАН D-33** | новая задача из `33b-RULES-VARIANTS.md` §6 |
| RULES-D2 | T | Слои: `shared/sdd/rule-registry.ts` (`parseRegistryLayer`, `mergeRegistryLayers`, дедупликация `id` **до** `parseRuleRegistry`), вклад пресета как слой в памяти | `shared/sdd/rule-registry.ts` | M | RULES-D1, T-8 (для слоя пресета) | `rule-registry.test.ts` | A8 (целевое, вне релиза) | **D-31, D-33** | нет — пост-релиз | **ЗАБЛОКИРОВАН D-33** | пересекается с переформулированной **T-2** |
| RULES-D3 | T | Перегрузка по соглашению: `ai/directives/local/knowledge.xml` + `ai/directives/local/<category>/*.xml`; тест-замок «синк не трогает `local/`» (`sync-core.ts:221-232`); правило «перегружать можно активационные поля и `<File>`» | `ai/directives/local/**`, `sync-core.ts:221-232` | M | RULES-D2, T-4 | тест-замок синка + юнит перегрузки | A8 (целевое, вне релиза) | **D-31 (соглашение C), D-33** | нет — пост-релиз | **ЗАБЛОКИРОВАН D-33** | новая задача из 33b §6 |
| RULES-D4 | T | Интеграция: `sdd-new` печатает набор **фазы** вместо всего реестра; `sdd-task --phase` печатает причину активации; (t2) снапшот + `rulesDigest` в тикете и `sdd-check --rules` с `SDD_RULES_SNAPSHOT_STALE` | `sdd-new.cmd.ts`, `sdd-task.cmd.ts`, `check.ts` | M | RULES-D1, T-3 | детерм. + `sdd-check --rules` | A8 (целевое, вне релиза) | **D-31, D-33** | нет — пост-релиз | **ЗАБЛОКИРОВАН D-33** | новая задача из 33b §6 |
| RULES-D5 | T | Легаси-автодетект по **D-32**: непустой `<Rules>` проектного реестра = режим (A), слои не применяются; строка вывода «N пакетных записей не подключено: …»; фикстуры `cloud-ios` (5 записей, дерево до `5a237cd5`) и `messenger` (19 записей, snake_case) | `shared/sdd/rule-registry.ts`, фикстуры `cloud-ios`/`messenger` | S | RULES-D2 | детерм. на двух фикстурах | A8 (целевое, вне релиза) | **D-32, D-33** | нет — пост-релиз | **ЗАБЛОКИРОВАН D-33** | заменяет отменённую **T-7** |
| RULES-D6 | T | Статус хука по состоянию flow (опция (b) из 33b §5): `resolved/unresolvable/deferred` с причиной из `READINESS=`/`GATE_QUEUE=`; поглощает T-13 | `cli/cmd/sdd-rules/**`, `readiness.ts` | S | RULES-D1, T-13 | детерм. (три статуса) | A8 (целевое, вне релиза) | **D-31, D-33** | нет — пост-релиз | **ЗАБЛОКИРОВАН D-33** | поглощает **T-13** после релиза |
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
| REL-15 | REL | Аналитическая задача: причина IPC-краша `node --test` — связан ли с agent-mon/agent-inbox; решение по REL-7/12/13 после результата | `scripts/test-topology.ts`, тесты agent-mon/inbox | M | — | диагностика + отчёт с воспроизведением | D-10, D-30 | D-10, D-30 | нет | ГОТОВ К ВЫДАЧЕ (задача на исполнение трека 34, без внешних решений) | предшествует REL-7/12/13. Размещение в Волне 0 — сознательное отклонение от D-30 («позже, задачей RC при исполнении трека 34»), потому что REL-7/12/13 от неё зависят; `34-TRACK-RELEASE-PACKAGE.md` §8 обязан получить строку REL-15 |
| REL-16 | REL | Docs-проход A5: `README`, `ai/skills/README.md`, guides описывают только v2; grep-замок анти-v1 расширен на docs | `README.md`, `ai/skills/README.md`, `guides/**`, grep-гейт в `npm run check` | S | V-17, T-B6-07, SO-12 (текст guide) | `grep`-гейт = 0 v1-упоминаний в docs | **A5, A14** | 1.1, 3.4 | нет | ЧЕРНОВИК (Волна 5) | новая задача (V-61 §B): у docs-прохода A5 не было владельца |
| **▼ T-B6 — DIRECTIVES/SKILLS** | — | — | — | — | — | — | — | — | — | — | — |
| T-B6-08 | T-B6 | Замок на висячие ссылки: `lint-axioms` — направленность «referenced-but-undefined», роняет билд, allowlist по L-10 | `ai/kit/lint-axioms.ts`, `build-directives.ts` | M | T-B6-09 (cwd-независимость — предпосылка её тестов) | `lint-axioms.test.ts` +5 кейсов | D-словарь §4.1(doc40) | L-10 (Q2 вариант b, allowlist) | нет | ГОТОВ К ВЫДАЧЕ | идёт первой в треке T-B6 |
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
| T-B6-07 | T-B6 | v1-имена скиллов **только как триггеры в `description`** существующих v2-скиллов; **ни одного нового скилла, ни обёрток, ни алиас-команд** | `ai/skills/{sdd,sdd-reconcile,sdd-execute}/SKILL.md` | S | T-B6-08 | «every retired v1 skill name is a trigger in exactly one v2 skill description»; замок «число скиллов не выросло» | D-27, A5 (частично) | **D-27 (вариант (a): v1-имена только как триггеры в `description`). Вариант (c) doc40 Q5 — «алиасы + два forced-intent скилла» — ОТКЛОНЁН D-27: обёрток и алиасов не делаем** | нет | ЧЕРНОВИК (после T-B6-08; Волна 3) | координировать с **SO** (`sync-skills` тесты). Ссылка на Q5(c) была прямой виолацией D-27 — исправлена по V-61 §A.7 |
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
| T-15 | T-B6 | Аксиомная половина L-11: `AX_FAIL_VS_ENV_FAIL` и `AX_GATES_NEVER_MUTATE` → `ai/kit/axiom/infra/` (стек-агностичные инварианты не живут в файле одного стека) | `ai/kit/axiom/infra/{ax-fail-vs-env-fail,ax-gates-never-mutate}.xml`, `lint-axioms.ts` | S | T-B6-08 | `axiom-home.test.ts` + `lint-axioms` (ноль висячих) | — | **L-11** (вторая половина; go-специфичные 5 правил остаются у T-1) | нет | ЧЕРНОВИК (после T-B6-08; Волна 3) | новая задача (V-61 §B): id из V-61, предмет — трек 40, а не 33; парная к **T-1** |
| **▼ E — EVAL** | — | — | — | — | — | — | — | — | — | — | — |
| E-00 | E | Пригодность к CI: агрегированный exit-код `sdd-flow-eval`; `harness.test.ts` вне c8-цепочки; `npm run build` в README | `package.json`, `harness.test.ts` | S | — | 90/90 зелены; «батч с одним fail → exit 1» | A10 | D-28 | нет | ГОТОВ К ВЫДАЧЕ | — |
| E-01 | E | Починить `R1` на реальном репозитории: один предикат «0 error(s) = pass» | `parseSddCheckResult` | S | — | both-way юнит на замороженном выводе | A10 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| E-02 | E | Объявить `completion`/`acceptance` у `slugify-toolchain` | `scenarios.json` | S | — | суита зелёная | — | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| E-03 | E | Re-baseline после `3d5f66a7` (числа до 07.09 — неизвестная сборка) | `metrics-ledger.jsonl` | S | E-00, E-01, E-02 | golden exit 0 + R-COMPLETE, 2 pass | А10 | — | нет | ЧЕРНОВИК | обязателен до любых выводов из старых прогонов |
| E-04 | E | `E-G2-ownership` — 6 both-way кейсов **целевого** владения | `sync.e2e.test.ts`/`sync-skills.e2e.test.ts` | S | **после/вместе с SO-1, SO-2, SO-2b, SO-7, SO-11** (не зависит от VERIFY) | 6 assert; dry-run план байт-в-байт | A4, G2 | D-1(doc32, не дублируется здесь) | нет | ГОТОВ К ВЫДАЧЕ (внутри Волны 0 — **строго после блокирующей пятёрки SO**) | выполненная раньше SO-*, задача зафиксирует **текущую потерю** вместо целевого поведения; брифы 2–5 ссылают свою eval-приёмку сюда |
| E-05 | E | `E-G3-log-vocabulary` — 4 both-way группы поверх `execution-log.ts` | синтетические тикеты | M | B2-01 | 4 both-way группы | #13/#15/#23, A7 | — | нет | ЧЕРНОВИК (ждёт B2-01) | — |
| E-07 | E | Бар исполнимости (red-first): `SDD_VERIFICATION_TABLE_INVALID` (+ проверки `SCOPE_TYPE`/`PHASE_RECEIPTS:v1`) в `MIGRATION_CRITICAL_CODES` | `migration-grade.ts` | S | E-16 | both-way юнит на замороженных выводах | A2 | D-28, **L-15 (идёт первым, до E-06)** | нет | **ГОТОВ К ВЫДАЧЕ** (после E-16; контрадикция снята — действует L-15) | порядок L-15 применён здесь, в Волне 4 и в §5.3; `50-…md` §4.1 приведён к тому же порядку |
| E-06 | E | Полнота мигратора: 3-колоночные §5, `SCOPE_TYPE`, `PHASE_RECEIPTS:v1`+`COVERAGE_POLICY:v1` | `fixture-detmig` | M | **E-07**, E-16 | `sdd-task` принимает; `sdd-state` печатает `SCOPE_TYPE` | A2, D-4 | **L-15 (после E-07)** | нет | ЧЕРНОВИК (после E-07) | контрадикция снята: бар red-first доказывает дефект до фикса |
| E-08 | E | Прогон миграции на снапшоте с новой информацией (реализуется как часть E-14 или отдельно, по Q2) | зависит от Q2(doc50) | M | Q2(doc50) | MIGRATION grade + executable-бар, 2 pass | A2, D-29 | D-29 (частично; Q2 остаётся) | нет | ЧЕРНОВИК | закрывается через **E-14** по D-29(a) |
| E-09 | E | Первый живой прогон, где R-COMPLETE даёт pass | `slugify-toolchain` | M | E-02, E-03 | R-COMPLETE pass; R1 чист; 2 pass | A10, D-4 | D-4 (grandfather до A1/A2) | нет | ЧЕРНОВИК | — |
| E-10 | E | `E-G1-swift-verify` — детерминированная приёмка `gennady.yaml` | `fixture-detmig` | S-M | V-07, **V-08, V-04a** (проверено: `fixture-detmig`/cloud-ios живёт как `stack.use: [anystack]`; любой пункт, доходящий до квитанции, упирается в anystack-хвост `30-…md:187` и в источник `environmentState`), E-16 | 5 пунктов приёмки | A3, G1 | — | нет | ЧЕРНОВИК (после V-07/V-08/V-04a/E-16) | — |
| E-11 | E | Фикстура `golang-slugify` в `provision.ts` | новая фикстура | M | — | golden both-way | A3, G1 | — | нет | ГОТОВ К ВЫДАЧЕ | — |
| E-12 | E | `E-G1-go-execute` детерминированный (`STACK`, pickable, receipt, чист) | `golang-slugify` | M | V-04, V-05, V-06, **V-09 (golang-пресет)**, **V-04a** (без источника `environmentState` репозиторий без `package.json` не пишет квитанцию вовсе — И-3, `30-…md:123`: немедленный `ERR_CLI_SDD_VERIFY_RECEIPT`), E-11 | 4 пункта both-way | A3, G1 | — | нет | ЧЕРНОВИК (ждёт VERIFY стек) | дефект зависимостей был унаследован из `50-…md` §4.1 дословно |
| E-13 | E | `E-G1-llm-go` — execute на go-фикстуре (единственный LLM-сценарий G1) | `golang-slugify` | M | E-12 | golden exit 0 + R-COMPLETE, 2 pass | A3, G1 | — | нет | ЧЕРНОВИК | — |
| E-14 | E | Самомиграция `gennady` (12 скоупов, 127 тикетов) — обязательный таск | снапшот `main` | L | E-16, E-07, E-06 (порядок по L-15) | MIGRATION grade + executable-бар; закрывает E-08 | A1, D-3 | D-3 (обязателен) | нет | ЧЕРНОВИК (ждёт E-06/07/16) | закрывает **E-08** одновременно |
| E-15 | E | Детерминированный лок маршрутизации на `ai/inspector/core` (v1-раскладка/`go.mod`-ветка) | директивы как есть | S-M | — | both-way | O-1(частично) | — | нет | ГОТОВ К ВЫДАЧЕ | дешёвый, в любой момент |
| E-16 | E | Привести `fixture-detmig`/`rt-regen` в воспроизводимое состояние (`EVAL_FIXTURES_ROOT`, чистое дерево) **+ проверка на файлы класса секретов** (найден `Tools/Artifactory/.netrc` в `fixture-detmig` — L-13) | `fixture-detmig`, `rt-regen` | S | — | `git status --porcelain` пусто; нет `DIRTY_TREE`; **тест «в фикстуре нет файлов класса секретов»** | A2, A3, L-13 | L-13 (Q3 вариант a, включая проверку секретов) | нет | ГОТОВ К ВЫДАЧЕ | предпосылка для **E-07**/E-06/E-08/E-10 |
| E-17 | E | Исход `budget-exhausted` отдельно от `fail`; агрегированный exit-код считается по **детерминированным гейтам**, а не по вердикту судьи; прогоны с исчерпанным бюджетом не красят CI и не входят в статистику | `harness.test.ts`, `runner.ts`, `scenarios.json` | S | E-00 | both-way: «батч с исчерпанным бюджетом → exit 0 + отдельный исход», «батч с fail гейта → exit 1» | **A10, A12**, D-28 | **D-28** (PASS = детерминированные гейты; судья — диагностика), doc50 Q1(b) | нет | ЧЕРНОВИК (после E-00) | новая задача (V-61 §B): исход `budget-exhausted` не поставляла ни одна задача; снимает нестыковку определения E-00 («fail/inconclusive любого сценария → exit 1») с D-28 |
| E-18 | E | Детерминированный аналог E-12 для swift: round-trip `cloud-ios` (`[x] DONE`, receipt без `package.json`-шима, групповая квитанция аудита, R-COMPLETE зелёный) | `fixture-detmig`/`cloud-ios`, `roundtrip-eval.sh` | M | V-07, V-08, V-11, V-04a, E-10, E-16 | 4 пункта both-way (аналог E-12) | **A3** | 2.2, D-15, D-16 | нет | ЧЕРНОВИК (после swift-пресета) | новая задача (V-61 §B): `50-…md` §4.2 прямо пишет «для python/swift детерминированный аналог E-12 пока не запланирован» — либо эта задача, либо явное сужение A3 до go |
| E-19 | E | G2-снимки на копиях реальных потребителей: «дерево до → sync → снимок после» на копиях `messenger` и `cloud-ios` без потерь проектных файлов | новые e2e-фикстуры G2 (вне репозитория, `EVAL_FIXTURES_ROOT`) | M | SO-1, SO-2, SO-2b, SO-7, SO-11, E-04, E-16 (`EVAL_FIXTURES_ROOT` + проверка секретов) | снимок «до/после» байт-в-байт; ноль удалённых проектных файлов | **A4** | D-6, D-22, L-13 | нет | ЧЕРНОВИК (после блокирующей пятёрки SO) | новая задача (V-61 §B): E-04 определён на синтетическом `E2eContext`, а `v1-consumer`/`linked-checkout`/`stale-package-file`/`deployed-surface` отнесены `50-…md` §3.2 к пропускам. Альтернатива — сузить A4 до E-04 + портов тестов SO-* |
| E-20 | E | Удаление `tasks/` после успешной самомиграции — отдельный проверяемый шаг | `tasks/**` (удаление), `sdd-state` | S | E-14 | `sdd-state` → `FLOW_VERSION=v2`; `ls tasks/` отсутствует; `sdd-check --all .` чист | **A1, A14**, D-3 | D-3 | нет | ЧЕРНОВИК (после E-14) | новая задача (V-61 §B): удаление `tasks/` было критерием A1 без исполнителя |
| E-21 | E | Владелец решения **L-14**: одна дешёвая модель `llm-proxy`, роль судьи — диагностика (конфиг `runner.ts`/`judge.ts`, вердикт судьи не влияет на exit-код) | `runner.ts`, `judge.ts`, конфиг моделей эвала | S | — | детерм.: «вердикт судьи не меняет exit-код»; конфиг фиксирует семейство `llm-proxy` | A10, D-28 | **L-14** | нет | ГОТОВ К ВЫДАЧЕ (Волна 0) | новая задача (V-61 §B, предложена там под id `L-14`); альтернатива — внести содержание в E-17 |

---
| P-01 | Вердикт-матрица для 8 инвариантов v1 без вердикта (C16–C20, S10, R6, D10): дополнить `40-TRACK-DIRECTIVES-SKILLS.md` §3 строками «аксиома / остаётся в скилле / не переносится» с доказательством (файл:строка) | 40 / 05 §5 | S | Волна 0 | ГОТОВ К ВЫДАЧЕ (доп. плана, без кода) | — |
| P-02 | Снять противоречие D3/D4 между треками 31 и 40: единый владелец самомиграции и порога WARN→ERROR (B2-20, O-6), перекрёстные ссылки в 31 §4 и 40 §5 | 31 / 40 / 05 §5 | S | Волна 0 | ГОТОВ К ВЫДАЧЕ (доп. плана) | — |
| P-03 | Гейт адекватности плана по внешнему ресёрчу (D-37): R1..R3 → `06-ADEQUACY-GAP.md` → правки доски/приёмки | Lead | M | Волна 0 (до брифа 1/5) | В РАБОТЕ | O-7 |

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
| **SO-11 vs T-3(d4)** | **SO-11** (existence-чек `<File>`) | `<File>`-existence-проверка реестра: SO-11 вводит `SDD_RULE_FILE_MISSING`, T-3(d4) — `SDD_RULES_REGISTRY_DANGLING`; `33-…md` §5.2 п.4 прямо называет это **одной проверкой** | Один владелец кода — SO-11 (S, блокер релиза, идёт в Волне 0 и защищает SO-1 от нового тихого отказа). **T-3 не вводит второй код**: (d4) переиспользует `SDD_RULE_FILE_MISSING` и добавляет только unregistered-часть. Severity кода — `warning` сейчас, error после инвентаризации долга (L-3). Без этого согласования RC реализует одну проверку дважды под двумя именами |
| RULES-D2 vs T-2 | **RULES-D2** (после D-33) | модуль `shared/sdd/rule-registry.ts` (слои + дедупликация `id`) | 33b §6 переформулирует T-2 так, что её предмет целиком укладывается в RULES-D2; обе — пост-релиз и заблокированы D-33, порядок постановки решается при пересмотре блока правил |
| RULES-D5 vs T-7 | **RULES-D5** | не возвращать чужой стек / легаси-режим реестра | D-32 (авто-распознавание legacy) заменяет миграционный шаг → **T-7 ОТМЕНЕНА**, предмет живёт в RULES-D5 |
| T-15 vs T-1 | не дубль, две половины L-11 | 2 стек-агностичных аксиома (`AX_FAIL_VS_ENV_FAIL`, `AX_GATES_NEVER_MUTATE`) vs 5 go-специфичных правил | L-11 разрезан по домам: аксиомы → `ai/kit/axiom/infra/` (трек 40, задача T-15), правила → rule-файл golang (T-1) |
| V-05 vs T-B6-06 | не дубль | V-05 — CLI/детект стека (`shared/verify/stack-detection.ts`, `sdd-state`); T-B6-06 — директивная половина (портал, Cascade Table, `golang-setup.xml`) | явно разведено в самом доc40: «Не дублирует» |

### 2.2 Контрадикции между треками

1. **Порядок E-06/E-07 (доc50 §4.1, §5 Q5) vs L-15 (доc02).** Doc50 §4.1 порядок: «E-16 → E-06 → E-07 → E-14», §5 Q5 рекомендует (a) «сначала E-06 (полнота), потом E-07 (бар)». Но `02-LEAD-DECISIONS.md` L-15 фиксирует **противоположный** выбор: «Вариант 2: сначала бар red-first (E-07, коды в `MIGRATION_CRITICAL_CODES`), затем полнота мигратора (E-06) — дисциплина red-first уже принята в `session-metrics.py gate`». Doc50 сам отмечает, что после удешевления бара до размера S «рекомендация (a) не так однозначна, как выглядела раньше» — то есть противоречие замечено, но не снято явно. **Требуется решение оператора/Lead перед выдачей брифов E-06/E-07**: либо подтвердить L-15 (red-first, E-07 → E-06) и переписать порядок §4.1 doc50, либо подтвердить doc50 §5 Q5(a) и отменить L-15. *(Историческая формулировка. Действует решение ниже: порядок **E-07 → E-06**; ранняя редакция доски держала обратный порядок с пометкой контрадикции в обеих строках.)*

   **СНЯТО (Lead, 2026-09-07):** действует **L-15** — порядок **E-07 (бар red-first, S) → E-06 (полнота мигратора)**. Обоснование: бар после удешевления стоит S, red-first уже принят как дисциплина (`session-metrics.py gate`), и он даёт механическое доказательство дефекта до фикса; при обратном порядке бар вводится «уже зелёным» и не доказывает ничего. Doc 50 §4.1 помечен соответствующей сноской. Брифы E-07/E-06 разблокированы в этом порядке.

   **Разнесено по документу (правка по V-61, ранее применялось только здесь):** мастер-таблица §1 (E-07 → «Зависит от: E-16», `ГОТОВ К ВЫДАЧЕ`; E-06 → «Зависит от: E-07, E-16», `ЧЕРНОВИК`), §3 Волна 4 (`E-03 → E-16 → E-07 → E-06 → E-09 → E-14`), §5.3 (строка E-06/E-07 убрана) и `50-TRACK-EVAL.md` §4.1 (строка E-07 и «Порядок и критический путь» — при сохранённой сноске Lead).
2. **Зависимость B2-07 указана как S в исходном анализе, но пересмотрена самим доc31 до M** («пересмотрено с S — вводит зависимость от читаемой `PHASES_OVERVIEW`») — не контрадикция между треками, но несогласованность внутри одного документа; в доске зафиксирован актуальный размер M.
3. **SO-8 ссылается на «D-2» (доc32 §4.2, локальная нумерация решений трека) в тексте задачи, но локальный D-2 доc32 посвящён «что первый v2-sync делает с v1-деревом» (= глобальный D-23), а не `resolvePackageDir`-регрессии.** Похоже на опечатку/перепутанную ссылку в исходном треке — SO-8 не имеет прямого отношения к теме D-23. Отмечено как задача, требующая уточнения формулировки у Lead перед бенчем (см. таблицу выше, статус ЧЕРНОВИК).
4. **T-B6-04 (batch-параллель) и V-18 (single-flight verify)** оба зависят от одного открытого решения D-26, но заведены в разных треках (40 и 30) с частично разной формулировкой companion-связи — согласовать один бриф на оба, а не выдавать раздельно, чтобы не закрыть один без другого.

   **СНЯТО (правка по V-61):** требование единого брифа сохраняется, а внутреннее противоречие с Волной 2 устранено переносом **V-18 в Волну 3** — туда, где живёт заблокированный companion T-B6-04. Раздельная выдача V-18 запрещена.
5. **D-24 устарел: замещён D-31/D-32/D-33.** Доска до правки держала T-2/T-7 «ЗАБЛОКИРОВАН D-24». Актуально: **D-31** — целевое видение (динамический CLI-справочник `sdd-rules`; в релиз идёт режим (A) как в main; перегрузка — через соглашение (C)); **D-32** — авто-распознавание legacy (непустой проектный реестр = режим (A)), из-за чего **T-7 ОТМЕНЕНА**; **D-33** — весь блок слоя правил (варианты A/B1/B2/C/D, входы инструмента, статус `deferred`) пересматривается **перед** постановкой задач трека 33 / RULES-D*. Поэтому: RULES-D1..RULES-D6 и переформулированная T-2 — `ЗАБЛОКИРОВАН D-33`; шесть вариант-независимых задач (T-3, T-4, T-6, T-9, T-10, T-13) остаются `ГОТОВ К ВЫДАЧЕ` — обоснование (33 §5.2, 33b §4 п.1) внесено прямо в их строки, а не выводится читателем.
6. **D-19 против инварианта И-2: попадают ли `[gate] `-строки в квитанцию.** Три взаимоисключающих утверждения: **D-19** — «в отчёт **и в квитанцию** независимо от статуса»; `30-TRACK-VERIFY.md:203` — «в receipt при этом **ничего не добавляется**, иначе ломается И-2» (там же мотив: вывод на pass может быть принят аудитором за доказательство); приёмочный тест **V-14** на доске — «receipt не меняется (И-2)». `60-ACCEPTANCE.md` A6 встаёт на сторону D-19. **Решение не принято → бриф V-14 не выдавать, критерий A6 в этой части не считать.** Предлагаемая развязка (требует явного пункта Lead или возврата вопроса оператору): `[gate] `-строки кладутся **аддитивным полем уровня документа квитанции** — вне `PhaseReceiptPlan` и вне проекции `gateEvidence`, — а валидатор терпит его отсутствие у старых receipts; И-2 (`30-…md:122`) прямо разрешает обогащение, пока не меняются `name`/`state`/`command`/`provider`. Формулировка A6 на время ожидания ослаблена («попадание в квитанцию — по решению после сверки с И-2»).
7. **D-17 против V-12: «видимый skip» в проекции, которая сверяется байт-в-байт.** V-12 требует, чтобы отсечённая ступень попадала в `gateEvidence` — ровно ту проекцию плана, которая сверяется точным JSON-равенством, включая порядок (`30-…md:122` п. а). Для репозиториев **без** `when`/`gennady.yaml` план обязан остаться байт-идентичным, иначе D-17 нарушен и старые node-квитанции инвалидируются. Обязательный приёмочный пункт (внесён в строку V-12 и в A6): «для репозитория без `gennady.yaml`/`when` план и `gateEvidence` до и после V-12 совпадают побайтово».

---

## 3. Волны исполнения (dependency-ordered)

### Волна 0 — без решений и без зависимостей

Критерий: задача не зависит ни от одной другой задачи плана и не требует решения оператора/Lead. Это «безопасный первый контур» — можно исполнять параллельно, задачи маленькие (в основном S), риск регрессии минимален.

- **VERIFY**: V-01 (golden текущего поведения RC).
- **SYNC**: SO-1, SO-2, SO-2b, SO-7, SO-11 (минимальный блокирующий набор D-22 — все пять не имеют внешних зависимостей друг от друга кроме SO-2b→SO-2 внутри пары), SO-4, SO-5 (deployed-surface golden + починка утечки — **перенесена из Волны 1**: зависимостей нет, статус ГОТОВ К ВЫДАЧЕ), SO-6, SO-9, SO-14 (полировка, не блокеры, но тоже без зависимостей).
- **RELEASE**: REL-1 (publish-order), REL-2 (.npmignore), REL-3 (chmod-plugin), REL-6 (yaml pin), REL-8 (lint в prepublishOnly), REL-9 (CI, решение D-11 уже есть), REL-10 (версия, решение D-12 уже есть), REL-11 (npm audit), REL-14 (overrides undici/esbuild), REL-15 (аналитика IPC-краша — не требует решения для *начала*, сама производит решение для REL-7/12/13).
- **CHECK-LOG**: B2-03 (словарь токенов, включая `correction`), B2-05 (`SDD_NO_TICKETS_FOUND`+P5/P6), B2-08 (`ax-reopen-format` под структуру v2, форма реопена уже решена D-20), B2-09 (устойчивость `parsePhasesOverview`), B2-11 (синхронизация `STEP_1_MECHANICAL` с кодом), B2-12 (`source-extensions.ts`), B2-14 (скелет Handoff), B2-15 (разгрести долг RC), B2-17 (актуализация спек `sdd-log`/`sdd-check` — **блокирующее требование** по spec-first дисциплине, должно идти рано).
- **DIRECTIVES/SKILLS**: T-B6-09 (cwd-независимость — **предпосылка тестов T-B6-08**, ребро внесено в зависимости), T-B6-08 (lint referenced-but-undefined + allowlist L-10 — явно назван в примере волны, идёт сразу после T-B6-09), T-B6-15 (D2 в AGENTS.md), T-B6-18 (инлайн-аксиомы), T-B6-21 (critic-protocol не сирота), T-B6-22 (recover-from-code не сирота), T-B6-23 (триаж критика), T-B6-26 (AX_PROGRESSIVE_DISCLOSURE один дом).
- **RULES**: T-3 (аудит контракта правила — немедленная мера §5.2), T-4 (**внесена в волну**: владение реестром при sync, R-A′, зависимостей нет), T-6 (убрать фиктивность SDD_RULES_PHASE_EMPTY), T-9 (замок поставляемой поверхности), T-10 (**внесена в волну**: `agents-rules` → `agents-orient`; по 33b §6 — предпосылка будущего `sdd-rules`, имя `rules` пока занято), T-13 (проверка `<RequiresVerification>` — немедленная мера §5.2). Все шесть **вариант-независимы** по 33 §5.2 и 33b §4 п.1 — D-33 их не блокирует.
- **EVAL**: E-00 (CI-пригодность), E-01 (починка R1-предиката), E-02 (completion/acceptance slugify), E-04 (G2-ownership, независим от VERIFY, но **строго после SO-1/SO-2/SO-2b/SO-7/SO-11** — иначе фиксирует текущую потерю вместо целевого владения), E-11 (фикстура golang-slugify), E-15 (роутинг-лок), E-16 (воспроизводимость fixture-detmig + проверка секретов по L-13 — предпосылка для всей ветки G4/G1 eval), E-21 (роль судьи — диагностика, L-14).
- **ISS/LOCK**: LOCK-1, LOCK-2, LOCK-3 (замки-тесты, ничего не трогают кроме добавления тестов).

*Обоснование:* все перечисленные задачи либо (а) явно названы примером в задании («node-parity V-01», «SO-1/SO-2/SO-2b/SO-7/SO-11», «REL-3 .npmignore» — фактически REL-2, «REL publish-order» = REL-1, «lint referenced-but-undefined with allowlist» = T-B6-08, «exit-2 in help» = B2-05/ISS-1), либо (б) по факту разбора зависимостей в §1 не имеют формальной колонки «Зависит от» и не упираются в открытое решение оператора. Крупные многозадачные механизмы (B2-16→B2-07→B2-04→B2-01→B2-06, весь основной корпус T-B6-10..27) намеренно **не** включены в Волну 0, даже если отдельные их элементы теоретически независимы, — они образуют содержательный трек «журнал» и «директивы», вынесенный явно в Волну 3 по заданию; см. §3 Волна 3 обоснование.

### Волна 1 — VERIFY core

- V-02, V-03, V-04, V-04a (строгая цепочка parity + fingerprint).
- Governing: readiness-адаптер уже решён D-14 (интерфейс + node-адаптер + тривиальный anystack сразу) — сама реализация (V-06) идёт в Волне 2, но решение снимает неопределённость до начала Волны 1.
- Параллельно (не зависят от VERIFY): ничего. **Правка по V-61:** SO-3 пост-релизная (см. §1); **SO-5 перенесена в Волну 0** (нет зависимостей); **SO-8 ушла вне волн** (ЗАБЛОКИРОВАН — решение оператора о релизности S2-регресса); **SO-13 убрана отсюда** (зависит от V-02 + V-09/V-10/V-11, её место — Волна 5). Волна 1 = ровно четыре задачи.

*Обоснование:* V-02..V-04a — жёсткая последовательная цепочка (каждая опирается на предыдущую), это ядро всего трека VERIFY и предпосылка для всех стековых пресетов Волны 2.

### Волна 2 — стеки anystack → golang → python → swift + rules baseline/go

- V-05 (детект стека) → V-06 (readiness-движок, самый большой L в критическом пути) — обе нужны до открытия стеков.
- V-07 → V-08 (anystack, первым по D-16 — разблокирует cloud-ios/eval-харнесс).
- V-09 (golang), V-10 (python), V-11 (swift) — параллельно друг другу после V-05/V-04a. **Приоритет при конфликте ресурсов задаёт D-16: go → python → swift** (параллель — оптимизация, а не отмена решения о порядке).
- V-12, V-13, V-14 (issue-фиксы #9-bonus/#20/#17 — зависят от V-03/V-07, тематически часть той же verify-поверхности). **V-14 не выдавать** до снятия контрадикции D-19 vs И-2 (§2.2 п.6).
- V-15 (директивы/`.hbs` verify — зависимость от V-05 снята, может идти параллельно).
- **V-16a** (read-only `verify --plan --json`, входит в релиз по D-13), **V-19** (валидация `timeout > 10m` без `when` — D-18). **V-16b** (`fix`) и **V-18** здесь не исполняются: V-16b заблокирована O-2 (вне волн), V-18 перенесена в Волну 3 к companion'у T-B6-04 (§2.2 п.4).
- T-1 (RULES: baseline+go-rules — явно назван «rules baseline/go» в задании; **разблокирована L-8**: `<VerificationHooks>` переписываются под `sdd-verify --task --phase`, отдельного решения по Q7 не требуется).
- SO-10 (дубль-ссылка на T-1, не отдельное исполнение).
- T-B6-06 (директивная половина детекта стека) — стартует только после V-05/V-06/T-1, фактически на стыке Волны 2/3.
- E-10 (swift verify-контракт, после V-07+E-16), E-12/E-13 (go execute, после V-04/V-05/V-06+E-11).

*Обоснование:* весь стек-контур (детект → readiness → пер-стековые пресеты) физически не может параллелиться с Волной 1 (общий движок), но внутри волны стеки идут параллельно друг другу, начиная с anystack (разблокирует cloud-ios-фикстуры для остальных треков раньше всего). Rules baseline/go естественно входит сюда, так как T-B6-06 и multiple E-* задачи Волны 2/4 зависят и от VERIFY, и от RULES одновременно.

### Волна 3 — журнал/receipts (B2-*) и директивы/аксиомы (T-B6-*)

- **B2 (журнал)**: вся ветка стоит на **B2-17** (актуализация спек — spec-first, ребро внесено в каждую строку трека). Далее B2-16 (маркер `PHASE_RECEIPTS:v1` + предикат v2-имени по L-2, первым — наивысший приоритет трека) → B2-07 → B2-04 → B2-02 (в связке с B2-01) → B2-01 (консолидирующий парсер) → B2-06 (причинный Reopens) → **B2-19** (секция `## Blocker Trail` по D-20 — новая задача). Плюс B2-10 (миграция якорей, объёмный L — инвентаризация 50 тикетов) и **B2-13** (групповая квитанция в pickable — ГОТОВ К ВЫДАЧЕ сразу после B2-16, вариант выбран D-21), B2-18.
- **T-B6 (директивы/аксиомы)**: после Волны 0 (T-B6-09/08/15/18/21/22/23/26) идёт основной корпус: T-B6-10 (бюджеты, после lazy-split), T-B6-11/12/13/14/16/17/25/27 (содержательные аксиомы), T-B6-01/02/03/05/20 (pivot/closed-world/review-cycle/conduct), T-B6-19 (draft-пометка), **T-15** (два стек-агностичных аксиома по L-11 → `ai/kit/axiom/infra/`).
- T-B6-04 (batch-параллель) остаётся **заблокирован D-26** внутри этой волны — не исполняется, пока оператор не даст решение; **V-18 перенесена сюда** и выдаётся одним брифом с T-B6-04 (раздельная выдача запрещена, §2.2 п.4).
- T-B6-07 (**ЧЕРНОВИК**, после T-B6-08; только триггеры в `description`, без обёрток — D-27), T-B6-24 — по готовности соседних треков (SO, RULES), тоже в этой волне.
- ISS-8, ISS-10, ISS-11 (директивные issue-фиксы, делят файлы с T-B6-*) — в этой волне.
- RULES: T-5, T-11, T-12, T-8 (после переноса плагинов из Волны 2) — исполняются здесь; **T-14** размещена здесь, но остаётся `ЗАБЛОКИРОВАН` (main заморожен, 5.5 — нужен явный OK оператора). **T-2 и RULES-D1..D6 — вне волн** (пост-релиз, `ЗАБЛОКИРОВАН D-33`); **T-7 ОТМЕНЕНА** (D-32).
- E-05 (execution-log vocabulary eval, зависит от B2-01).

*Обоснование:* и журнал (B2), и директивы/аксиомы (T-B6) — оба по прямому указанию задания образуют Волну 3; внутри неё зависимости естественные (B2-16 первым, T-B6-08/09 уже сделаны в Волне 0 как инфраструктурная предпосылка для остального корпуса T-B6).

### Волна 4 — migration completeness + self-migration + acceptance evals

- E-03 (re-baseline, обязателен до любых выводов) → E-16 (воспроизводимые фикстуры) → **E-07 (бар исполнимости, red-first)** → **E-06 (полнота мигратора)** → E-09 (первый живой R-COMPLETE pass) → E-14 (самомиграция gennady, обязательна по D-3, закрывает E-08 одновременно) → **E-20** (удаление `tasks/` — отдельный проверяемый шаг A1) и **B2-20** (переключение групповых квитанций WARN→ERROR: гейт «после B2-16 и E-14», D-4/O-6). Порядок E-07 → E-06 — по **L-15** (§2.2 п.1), без «требует подтверждения».
- Новые acceptance-задачи этой волны: **E-17** (исход `budget-exhausted`, exit-код по гейтам — D-28/A10), **E-18** (детерминированный swift round-trip под A3), **E-19** (G2-снимки на копиях messenger/cloud-ios под A4).
- E-08 (снапшот с новой информацией, зависит от открытого Q2 doc50) — по умолчанию закрывается через E-14 (D-29 рекомендация (a): только самомиграция + `fixture-mig-run`, без нового снапшота cloud-ios).
- B2-10 (миграция якорей) логически принадлежит и Волне 3 (журнал), и Волне 4 (миграция) — оставлена в Волне 3 по коду, но её **фикстуры** используются в acceptance A1/A2 здесь.
- SO-12 **не входит** в Волну 4, несмотря на тематическую близость к «миграции», — прямое указание D-23 переносит её в Волну 5 («задача на самый конец плана»).
- A1..A10 (`60-ACCEPTANCE.md`) проверяются по факту завершения соответствующих задач; полная сверка критериев приёмки — финальный шаг этой волны.

*Обоснование:* задание явно определяет Волну 4 как «migration completeness + self-migration + acceptance evals (E-*)» — весь трек EVAL, зависящий от завершённого VERIFY/CHECK-LOG/RULES/SYNC (Волны 1–3), логично ложится сюда целиком, кроме уже стартовавших в Волне 0/2 дешёвых независимых E-задач.

### Волна 5 — v1 removal, docs, release 2.0.0-draft.N

- V-17 (снятие v1-корпуса verify; зависит от V-15 + **V-16a**, не от заблокированной V-16b — иначе A5 висит на открытом O-2).
- **REL-16** (docs-проход A5: `README`, `ai/skills/README.md`, guides — только v2; grep-замок анти-v1 расширен на docs).
- SO-12 (миграция v1-дерева потребителя, D-23 — задача открывается только здесь; сначала должна пройти обсуждение открытого вопроса с оператором при её постановке).
- REL-4, REL-5 (exports/публикуемая поверхность, после переноса стек-плагинов из Волны 2), REL-7/12/13 (после результата REL-15 из Волны 0 — фактически могут стартовать раньше формальной Волны 5, но их **закрытие** и решение по Q2/Q5 приходится на финальный релизный проход).
- SO-13 (плагинные корни в sync, после переноса плагинов).
- Финальная сверка A5 (v1 удалён из дерева RC: `ai/directives/sdd/`, v1-скиллы, `verify.sh` — grep-гейт анти-v1 в `npm run check`), A9 (релизный чек-лист целиком), обновление `README`/`ai/skills/README.md`/guides только на v2 — **владелец REL-16**, прозой это больше не держится.
- Публикация `2.0.0-draft.N` (D-12).

*Обоснование:* прямое указание задания; вдобавок SO-12 логически не может стартовать раньше, чем базовая модель владения (SO-1/SO-2, Волна 0) и большая часть остального переноса устоялись — сначала нужно самим не терять файлы при sync, потом учить sync разбираться с v1-деревом потребителя.

### Вне волн (пост-релиз или заблокировано решением)

Ни одна из этих задач не входит в релиз `2.0.0-draft.<N>`; каждая ждёт решения оператора или пост-релизного этапа. Полный перечень (11 строк): **SO-3** (целевая хэш-модель владения, D-22 — пост-релиз), **SO-8** (релизность S2-регресса — решение оператора), **T-2** и **RULES-D1..RULES-D6** (весь блок слоя правил, `ЗАБЛОКИРОВАН D-33`; пересмотр — до постановки, материалы `33a-RULES-EXPLAINER.md`/`33b-RULES-VARIANTS.md`), **V-16b** (`gennady fix`, `ЗАБЛОКИРОВАН O-2`, вне релиза по D-13), **T-7** (`ОТМЕНЕНА` по D-32 — строка сохранена, предмет у RULES-D5).

Отдельно: **T-14** размещена в Волне 3, но остаётся заблокированной (main заморожен, 5.5); **T-B6-04** размещена в Волне 3 и остаётся заблокированной (D-26).

---

## 4. Первые пять брифов (Lead → RC)

Все пять — из Волны 0. Шаблон — `70-ORCHESTRATION-PROTOCOL.md`.

**Общее для всех пяти (внесено по V-61 §D.1):** в КОНТЕКСТ добавлен абсолютный путь к документу плана в worktree Lead (`/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e/ai/drafts/research/sdd-v1-to-v2-transfer/…`); в ПРИЁМКЕ у каждого пункта стоит строка `команда:` (без команды-доказательства отчёт не принимается — протокол §«Доказательства»); везде названы ветка `codex/sdd-v2-rc52-followup` и правило «каждый коммит проходит полный гейт `npm run check`, без `--no-verify`» (протокол §4); `sdd-check` указан рядом с `npm run check`. **Порядок относительно E-04** (брифы 2–5): E-04 пишется **после** того, как поведение SO-* изменено, и фиксирует целевое владение, а не текущую потерю. **Порядок правок `sync-core.ts`**: SO-1 и SO-7 не выдаются одновременно — сначала SO-1 (ownership-лестница), затем SO-7 (fail-safe чтения), в отдельных коммитах.

### Бриф 1/5 — V-01: golden текущего поведения RC verify

```
БРИФ 30/V-01: node-parity golden

КОНТЕКСТ
- Документ плана: ai/drafts/research/sdd-v1-to-v2-transfer/30-TRACK-VERIFY.md §6
  (путь в worktree Lead: /Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e/
   ai/drafts/research/sdd-v1-to-v2-transfer/30-TRACK-VERIFY.md §6; доска — .../61-TASK-BOARD.md §1)
- Источник в main: н/п (это фиксация текущего RC-поведения, не порт)
- Что уже есть в v2: cli/cmd/sdd-verify/sdd-verify.cmd.ts, shared/sdd/phase-verification-plan.ts:152
  (байт-контракт commandForGate), shared/sdd/phase-receipt.ts:1127-1254 (environmentState),
  scripts/test-topology.ts (ожидание unit=211 contract=16 local=51 external=8)
- Ветка: codex/sdd-v2-rc52-followup; каждый коммит проходит полный гейт npm run check, без --no-verify

ЦЕЛЬ
Зафиксировать текущее поведение sdd-verify (профили, строки команд, receipt-формат) как golden-тест,
включая 8 известных дыр из §3.1.3 (durationMs, коды выхода, fix-evidence, порядок адаптеров,
расширенная матрица скриптов, golden environmentState, подстроки ⛔/gate-state:, module-mocks)
и planTargetRepair-golden (30-TRACK-VERIFY.md:495) — без исправления, только фиксация.

ИНВАРИАНТЫ (не нарушать)
- И-1/И-2/И-3 (идентичность receipt, неизменность вывода на pass, честность fingerprint) — не менять
  поведение, только измерять его.
- Не трогать сам sdd-verify/phase-receipt код в этой задаче.
- Golden environmentState снимается ТОЛЬКО с замороженной фикстуры-репозитория, не с корня RC:
  И-3 фингерпринтит тела скриптов, pre*/post*-хуки, транзитивные npm run-хопы и localInputEntries,
  а package.json RC правят REL-6 (yaml pin), REL-8 (lint в prepublishOnly), REL-4 (prepublishOnly) —
  golden с корня будет краснеть от каждой из этих задач.
- Конвенция обновления golden — переменная UPDATE_*_GOLDEN=1 (как у SO-5 и T-9); двух несовместимых
  дисциплин golden-тестов в плане быть не должно.
- Легальные будущие обновления golden-утверждений принадлежат конкретным задачам: V-04a
  (environmentState/матрица пакетных менеджеров), V-12 (видимый skip отсечённого гейта),
  V-14 ([gate] -префикс в вердикте). Обновление этих утверждений ВНЕ названных задач — запрещено;
  внутри них — легально и не считается нарушением parity.

ФАЙЛЫ
- трогать: новые shared/sdd/__tests__/preset-node-golden.test.ts,
  cli/cmd/sdd-verify/__tests__/parity-node.test.ts, golden-фикстуры receipt'а и planTargetRepair,
  замороженная фикстура-репозиторий для environmentState,
  scripts/test-topology.ts (ожидание unit=211 → новое число: тесты добавляются этой же задачей)
- не трогать: shared/sdd/phase-verification-plan.ts, phase-receipt.ts, sdd-verify.cmd.ts

ПРИЁМКА
- тесты: golden-JSON по 5 профилям; команда: npm test -- shared/sdd/__tests__/preset-node-golden.test.ts
- тесты: байтовое сравнение stdout (нормализация durationMs, не timestamp'ов — их в receipt нет);
  команда: npm test -- cli/cmd/sdd-verify/__tests__/parity-node.test.ts
- тесты: матрица exit-кодов + validatePhaseReceipt на существующем receipt'е;
  команда: npm test -- cli/cmd/sdd-verify/__tests__/parity-node.test.ts
- тесты: planTargetRepair-golden; команда: npm test -- shared/sdd/__tests__/preset-node-golden.test.ts
- регрессионная шина эвалов: ожидание топологии обновлено в этой же задаче;
  команда: npm run test:topology (должно быть зелено, без ручного «потом поправим»)
- eval: не требуется (это предпосылка для G1, не сам eval)
- sdd-check / npm run check зелёные; команда: npm run check && npx gennady sdd-check --all .

ВОПРОСЫ НАЗАД
- если поведение по одной из 8 дыр §3.1.3 неоднозначно (например exit-код в конкретной ветке
  module-mocks) — остановись и спроси Lead, не угадывай ожидаемое значение.
- на каком уровне снимать exit-коды и stdout: на чистых функциях плана/рендера или живым фазовым
  прогоном verify (который пишет квитанции и снимки мутаций внутри npm test)? Если из документа
  плана однозначный ответ не следует — остановись и спроси Lead, не выбирай сам.
```

### Бриф 2/5 — SO-1: `knowledge.xml` project-owned

```
БРИФ 32/SO-1: project-owned knowledge.xml (блокер релиза)

КОНТЕКСТ
- Документ плана: ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1
  (путь в worktree Lead: /Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e/
   ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1)
- Ветка: codex/sdd-v2-rc52-followup; каждый коммит проходит полный гейт npm run check, без --no-verify
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
- не трогать: cli/cmd/sync-skills/** (это SO-2), плагинные корни (SO-13),
  файлы правил внутри каскадных категорий (ai/directives/coding/**, testing/**, architecture/**) —
  их защита при sync принадлежит T-4(b), в этой задаче граница проходит по записи knowledge.xml
- порядок: SO-1 и SO-7 правят один файл sync-core.ts и не выдаются одновременно; SO-1 идёт первой,
  SO-7 — следующим отдельным коммитом (манифест-логику SO-2 не смешивать)

ПРИЁМКА
- тесты: порт sync-core.test.ts:223,242 из main; команда: npm test -- cli/cmd/sync/__tests__/sync-core.test.ts
- тесты: новый e2e "keeps a project-owned knowledge.xml across two syncs";
  команда: npm test -- cli/cmd/sync/__tests__/sync.e2e.test.ts
- eval: G2 — отдельный сценарий не создавать, покрывается E-04. Важно: E-04 пишется ПОСЛЕ этой
  задачи и фиксирует целевое владение; если E-04 окажется выполнен раньше — сообщи Lead
- sdd-check / npm run check зелёные; команда: npm run check && npx gennady sdd-check --all .

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
  (путь в worktree Lead: /Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e/
   ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1)
- Ветка: codex/sdd-v2-rc52-followup; каждый коммит проходит полный гейт npm run check, без --no-verify
- ВНИМАНИЕ: этот бриф покрывает ДВЕ задачи доски — SO-2 и SO-2b. Отклонение от протокольного
  «одна задача в RC за раз» осознанное (SO-2 без SO-2b не закрывает S5-bis). Отчёт ожидается
  по формату ОТЧЁТ 32/SO-2+SO-2b — на оба id, с раздельными доказательствами по каждой цели
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
- тесты (SO-2): порт sync-skills-core.test.ts:377,391,538-627;
  команда: npm test -- cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts
- тесты (SO-2b): новый "deleting a file inside a supported skill only removes previously-manifested
  names" и новый "a project file inside a supported skill is never deleted";
  команда: npm test -- cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts
- eval: G2 — покрывается E-04 (не дублировать новым сценарием); E-04 пишется ПОСЛЕ этих задач и
  фиксирует целевое владение, а не текущую потерю
- sdd-check / npm run check зелёные; команда: npm run check && npx gennady sdd-check --all .

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
  (путь в worktree Lead: /Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e/
   ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1)
- Ветка: codex/sdd-v2-rc52-followup; каждый коммит проходит полный гейт npm run check, без --no-verify
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
- порядок: sync-core.ts правят SO-1 и SO-7; SO-7 идёт ПОСЛЕ SO-1, отдельным коммитом, одновременная
  выдача запрещена

ПРИЁМКА
- тесты: новый "a partial source scan never deletes" (мок readdirSync, кидающий ошибку на части
  дерева); команда: npm test -- cli/cmd/sync/__tests__/sync-core.test.ts
- тесты: порт духа sync-skills-core.test.ts:246,265;
  команда: npm test -- cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts
- eval: G2, покрывается E-04 — и E-04 пишется ПОСЛЕ этой задачи (фиксирует целевое поведение)
- sdd-check / npm run check зелёные; команда: npm run check && npx gennady sdd-check --all .

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
  (путь в worktree Lead: /Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e/
   ai/drafts/research/sdd-v1-to-v2-transfer/32-TRACK-SYNC-OWNERSHIP.md §4.1)
- Ветка: codex/sdd-v2-rc52-followup; каждый коммит проходит полный гейт npm run check, без --no-verify
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
- СТРОГОСТЬ КОДА: SDD_RULE_FILE_MISSING вводится как warning (severity=warn), НЕ error.
  Основание — L-3 (02-LEAD-DECISIONS.md): новые коды warn сейчас, error после инвентаризации долга
  (B2-15 + golden DA-lazy-asm). На дереве RC уже 198 ошибок sdd-check --all (31-TRACK-CHECK-LOG.md:676),
  поэтому error немедленно красит npm run check и блокирует всю Волну 0.
- ИМЯ КОДА — единственное для этой проверки: SDD_RULE_FILE_MISSING. T-3(d4) переиспользует его и НЕ
  вводит второй код (SDD_RULES_REGISTRY_DANGLING); doc33 §5.2 п.4 называет это одной проверкой.

ФАЙЛЫ
- трогать: shared/sdd/check.ts (новый код), shared/sdd/task-authoring-literals.ts (если нужно
  прокинуть путь диска)
- не трогать: сам реестр ai/directives/knowledge.xml (это T-1/T-12); модуль shared/sdd/rule-surface.ts
  (это T-3)

ПРИЁМКА
- тесты: "reports a registry rule whose file is missing";
  команда: npm test -- shared/sdd/__tests__/check.test.ts
- тесты: severity проверяется явно (запись класса warning, exit-код не меняется);
  команда: npx gennady sdd-check --all . (0 новых error)
- eval: не требуется, покрывается детерминированным тестом; G2-покрытие — E-04 (после SO-*)
- sdd-check / npm run check зелёные; команда: npm run check && npx gennady sdd-check --all .
- должна идти ПОСЛЕ или ВМЕСТЕ с SO-1 в том же релизном проходе (порядок коммитов внутри волны
  не важен, но обе задачи обязаны попасть в один релизный чек)

ВОПРОСЫ НАЗАД
- если по ходу окажется, что existence-чек невозможно сделать без чтения полного контракта файла
  правила (4 секции) — остановись: это уже T-3, объём задачи не расширять.
- если severity=warn не проходит по каким-то причинам гейта (например код попадает в класс,
  который sdd-check считает блокирующим независимо от severity) — остановись и спроси Lead;
  не переводить код в error самостоятельно (L-3).
```

---

## 5. Счётчики

> Все числа §5 пересчитаны машинно по исправленной мастер-таблице §1 (158 строк; парсинг с учётом экранированных `\|`). Прежние значения (141 / S 74 · M 51 / Волна 0 = 43 / 9 заблокированных) не сходились с таблицей и заменены.

### 5.1 По трекам

| Трек | Кол-во задач | Из них блокеры релиза |
|---|---|---|
| ISS (issues akkrat: 10 дублей-указателей + 3 самостоятельные) | 13 (ISS-1..13) | 0 (ISS-3/ISS-13 — указатели на пятёрку SO, отдельно не считаются) |
| LOCK (замки-тесты) | 3 | 0 |
| V (VERIFY) | 21 (V-01..V-15 + V-04a + V-16a + V-16b + V-17 + V-18 + **V-19**) | 0 (но V-15/V-16a/V-17 — предпосылки A5/A6) |
| B2 (CHECK-LOG) | 20 (B2-01..18 + **B2-19**, **B2-20**) | 0 |
| SO (SYNC-OWNERSHIP) | 15 (SO-1..14 + SO-2b; SO-10 — указатель на T-1) | **5** (SO-1, SO-2, SO-2b, SO-7, SO-11) |
| T (RULES) | 20 (T-1..T-14 + **RULES-D1..RULES-D6**); из них T-7 — `ОТМЕНЕНА` | 0 |
| REL (RELEASE/PACKAGE) | 16 (REL-1..14 + REL-15 + **REL-16**) | 0 (все — предпосылки A9) |
| T-B6 (DIRECTIVES/SKILLS) | 28 (T-B6-01..27 + **T-15**) | 0 |
| E (EVAL) | 22 (E-00..E-16 + **E-17..E-21**) | 0 (E-14 — обязательна по D-3, это критерий A1, а не «блокер релиза» в узком смысле) |
| **Итого строк** | **158** | **5** |

**Блокеров релиза — 5 задач** (SO-1, SO-2, SO-2b, SO-7, SO-11 по D-22), закрывающих **2 issue-блокера** (#9.4, #24). Прежнее «7» было двойным счётом: ISS-3 и ISS-13 — дубли-указатели на эти же пять задач.

Активных задач: **157** (158 строк минус `ОТМЕНЕНА` T-7). Из 158 строк 11 — дубли-указатели (ISS-1..7, ISS-9, ISS-12, ISS-13, SO-10), исполняются в волне своего владельца.

### 5.2 По размеру

Пересчёт по 157 активным строкам (T-7 `ОТМЕНЕНА` исключена; её размер был M).

| Размер | Кол-во |
|---|---|
| S (включая `S (в связке с B2-01)` у B2-02 и `S (R-A′)` у T-4) | **77** |
| M | **64** |
| L | **11** |
| смешанные `S-M`/`S/M` (REL-11, E-10, E-15, B2-18, V-18) | **5** |
| **Итого** | **157** |

*Метод подсчёта:* каждая задача учтена по заявленному в исходном треке размеру; составные (`S-M`, `S/M`) отнесены в отдельную строку, не округлены произвольно ни в одну сторону. Прежнее распределение (S 74 / M 51 / смешанных 5) расходилось с таблицей примерно на восемь задач и делало трек B2 и Волну 0 дешевле, чем они есть (в B2 из 20 задач M/L — одиннадцать). Расщепление V-16 (`S+S`) на V-16a/V-16b убрало последнюю составную запись класса `S+S`.

### 5.3 Заблокировано решением оператора

| ID | Открытое решение |
|---|---|
| V-16b | **O-2** (`fix` — глагол или флаг; `00-INDEX.md` §4 O-2 + D-13). Read-only половина — V-16a — не заблокирована и входит в релиз |
| SO-3 | D-1(доc32, вариант 2) / D-22 — целевая архитектура, пост-релиз |
| SO-8 | решение оператора: релизность функционального регресса S2 |
| SO-12 | **D-23** — первый v2-sync над v1-деревом потребителя |
| T-2 | **D-33** — весь блок слоя правил пересматривается перед постановкой (D-24 замещён D-31/D-32/D-33) |
| T-14 | решение оператора: main заморожен (5.5), правка main-side README без явного OK не делается |
| T-B6-04 | **D-26** — параллель задач в одном дереве (companion V-18 выдаётся тем же брифом) |
| REL-7, REL-12, REL-13 | Q2/Q5 (доc34 §9) / O-5 — тест-конкурентность, ждут результат REL-15 |
| RULES-D1, RULES-D2, RULES-D3, RULES-D4, RULES-D5, RULES-D6 | **D-33** — вход инструмента и варианты A/B1/B2/C/D пересматриваются до постановки (материалы `33a`/`33b`) |

**Итого заблокировано решением оператора: 16 задач.** Отдельно: **T-7 — `ОТМЕНЕНА`** (D-32), в счётчик блокировок не входит. Строка «E-06, E-07 — контрадикция doc50/L-15» **убрана**: контрадикция снята решением L-15 и разнесена по документу (§2.2 п.1). Строка про V-14 в этот счётчик не внесена сознательно: задача не ждёт решения оператора формально, но **её бриф не выдаётся** до снятия контрадикции D-19 vs И-2 (§2.2 п.6) — это отмечено в её статусе.

### 5.4 Волны — размер

Пересчёт по перечислению §3; дубли-указатели (11 строк) считаются в волне владельца, не отдельно. Сумма по волнам = 147 = 158 строк − 11 указателей.

| Волна | Кол-во задач | Что изменилось после V-61 |
|---|---|---|
| Волна 0 | **55** | было объявлено 43 при фактических 51; +SO-5, +T-4, +T-10, +E-21 |
| Волна 1 | **4** | V-02, V-03, V-04, V-04a; SO-5 → Волна 0, SO-8 → вне волн, SO-13 → Волна 5 |
| Волна 2 | **18** | V-16 → V-16a (V-16b вне волн), +V-19, −V-18 (в Волну 3) |
| Волна 3 | **39** | +V-18, +T-14 (с сохранением блокировки), +B2-19, +T-15 |
| Волна 4 | **11** | порядок E-07 → E-06; +B2-20, +E-17, +E-18, +E-19, +E-20 |
| Волна 5 | **9** | +REL-16 (docs-проход A5) |
| Вне волн (пост-релиз/заблокировано/отменено) | **11** | SO-3, SO-8, T-2, T-7 (`ОТМЕНЕНА`), V-16b, RULES-D1..D6 |

Несколько задач (SO-13, T-8, T-B6-06) висят на границе двух волн («стартует к концу Волны 2 / фактически Волна 3») и посчитаны в волне их фактического начала, а не завершения.

### 5.5 По статусам (новый счётчик)

| Статус | Кол-во |
|---|---|
| `ГОТОВ К ВЫДАЧЕ` | **59** |
| `ЧЕРНОВИК` | **71** |
| `ЗАБЛОКИРОВАН` | **16** |
| дубль-указатель (владелец в другом треке) | **11** |
| `ОТМЕНЕНА` | **1** (T-7) |
| **Итого строк** | **158** |

До правок было: ГОТОВ 56 · ЧЕРНОВИК 65 · ЗАБЛОКИРОВАН 9 · указателей 11 = 141. Прирост «готовых» дали снятие ложных блокировок (T-1 по L-8, B2-13 по D-21, E-07 по L-15) и новая задача E-21, минус перевод T-B6-07 в `ЧЕРНОВИК`.

---

## § Итог верификации V-61

> Источник правок: `_raw/V-61-TASK-BOARD.md` (независимая верификация доски и приёмки, свежие глаза, 2026-09-07). Ниже — что именно исправлено в этом документе, в `60-ACCEPTANCE.md` и в `50-TRACK-EVAL.md` §4.1. Верификатор нашёл шесть блокирующих дефектов и около двадцати расхождений меньшего веса; применены все правки его раздела «§ Правки к 61/60».

### 1. Блокирующее (было «не выдавать брифы, пока не исправлено»)

1. **Доска приведена к D-1..D-33.** Шапка, легенда и §2.2 п.5 учитывают D-31 (целевое видение слоя правил, в релиз — режим (A)), D-32 (авто-распознавание legacy) и D-33 (весь блок правил пересматривается перед постановкой). Внесены шесть задач **RULES-D1..RULES-D6** из `33b-RULES-VARIANTS.md` §6 (цели, размеры и зависимости — дословно), все со статусом `ЗАБЛОКИРОВАН D-33`.
2. **T-2 переформулирована** (слои живут внутри `sdd-rules`, на диске — C-conv `ai/directives/local/`; модуль `shared/sdd/rule-registry.ts` нужен в любом случае), статус `ЗАБЛОКИРОВАН D-33`, решение — D-31/D-33. **T-7 ОТМЕНЕНА** по D-32 (строка сохранена, предмет перешёл к RULES-D5). Шесть вариант-независимых задач трека 33 (T-3, T-4, T-6, T-9, T-10, T-13) остались `ГОТОВ К ВЫДАЧЕ` — обоснование (33 §5.2, 33b §4 п.1) внесено прямо в их строки, а не выводится читателем.
3. **L-15 разнесён по всем четырём местам** (был применён в одном): мастер-таблица (E-07 → «Зависит от: E-16», `ГОТОВ К ВЫДАЧЕ`; E-06 → после E-07), §3 Волна 4, §5.3 и `50-TRACK-EVAL.md` §4.1 (строка E-07 + «Порядок и критический путь», сноска Lead сохранена).
4. **Три не пойманные ранее контрадикции внесены и разобраны:** D-19 vs И-2 (§2.2 п.6 — брифы V-14 и критерий A6 в этой части заморожены до решения; предложена развязка через аддитивное поле уровня документа квитанции); D-27 vs ссылка на Q5(c) в T-B6-07 (§1 — вариант (a): v1-имена только как триггеры в `description`, обёрток и алиасов не делаем; иначе RC создал бы два скилла-обёртки); SO-11 vs T-3(d4) (§2.1 — один владелец `<File>`-existence-чека, один код `SDD_RULE_FILE_MISSING`, severity `warning` по L-3). Дополнительно зафиксирована контрадикция D-17 vs V-12 (§2.2 п.7) с обязательным приёмочным пунктом о байтовой идентичности `gateEvidence`.
5. **Ложные блокировки и статусы исправлены:** T-1 разблокирована (L-8 и есть решение по хукам) → `ГОТОВ К ВЫДАЧЕ`, вниз по графу освободились T-14 и T-B6-06; B2-13 разблокирована (вариант D3 выбран D-21) → `ГОТОВ К ВЫДАЧЕ после B2-16`; T-B6-07 переведена в `ЧЕРНОВИК` (незакрытая T-B6-08); SO-8 и T-14 переведены в `ЗАБЛОКИРОВАН` (решения оператора: релизность S2-регресса; main заморожен, 5.5); SO-2b помечена «одним брифом с SO-2»; двойной статус V-16 устранён расщеплением на **V-16a** (read-only `verify --plan --json`, в релиз по D-13) и **V-16b** (`gennady fix`, `ЗАБЛОКИРОВАН O-2`, вне релиза), V-17 переведена на зависимость от V-16a — иначе A5 висела на открытом вопросе оператора.
6. **Счётчики §5 пересчитаны машинно** (см. ниже) и снабжены новым счётчиком по статусам.

### 2. Дозаведённые задачи (у решений не было исполнителя) — 10

`B2-19` (`## Blocker Trail`, D-20) · `B2-20` (WARN→ERROR групповых квитанций, D-4/O-6) · `E-17` (исход `budget-exhausted`, exit-код по гейтам, D-28) · `E-18` (детерминированный swift round-trip под A3) · `E-19` (G2-снимки на копиях messenger/cloud-ios под A4) · `V-19` (валидация «`timeout > 10m` без `when`», D-18) · `T-15` (аксиомная половина L-11 → `ai/kit/axiom/infra/`, трек 40) · `REL-16` (docs-проход A5) · `E-20` (удаление `tasks/` после самомиграции, D-3) · `E-21` (владелец L-14: судья — диагностика; в V-61 предложена под id `L-14`).

### 3. Зависимости и волны

- Дополнены зависимости: `E-12` += V-09, V-04a (без golang-пресета и источника `environmentState` квитанция для go не пишется вовсе — И-3); `E-10` += V-08, V-04a (anystack-хвост `fixture-detmig`); **все задачи трека B2** += `B2-17` (spec-first); `B2-13` += `B2-16`; `T-B6-08` += `T-B6-09`; `E-04` упорядочена **после** SO-1/SO-2/SO-2b/SO-7/SO-11 (иначе фиксирует текущую потерю вместо целевого владения — а на неё ссылаются четыре брифа из пяти).
- Размещены ранее «бездомные» задачи: `T-4`, `T-10` → Волна 0; `T-14` → Волна 3 (блокировка сохранена). `SO-5` перенесена в Волну 0, `SO-13` убрана из Волны 1, `SO-8` ушла вне волн, `V-18` перенесена в Волну 3 к companion'у `T-B6-04` (устранено противоречие §2.2 п.4 с Волной 2). Добавлен явный раздел «Вне волн».
- Возвращены потерянные при переносе детали формулировок: `SO-5` («починить найденную утечку» + оговорка по D-2), `V-01` (`planTargetRepair`-golden, фикстура вместо корня RC, обновление `test-topology`), `B2-16` (предикат v2-имени по L-2), `E-16` (проверка файлов класса секретов по L-13), `T-5`/`T-6` (`ax-rules-load-from-phase-block.xml:3` на CamelCase; согласование **трёх** списков категорий), `V-10` (снят ошибочный D-25), `V-12`/`V-19` (D-18 разделён), `T-1`/`T-15` (L-11 разрезан по домам).
- Исправлена неверная ссылка на «Q8, доc30 §7» (в doc 30 §7 только Q1..Q7): источник — `00-INDEX.md` §4 **O-2** + D-13. Колонка «Трек» у `LOCK-1..3` изменена с `ISS` на `LOCK`. У `ISS-3`/`ISS-13` снята пометка «ДА» в колонке блокера (двойной счёт).

### 4. Числа после правок

- Строк в мастер-таблице — **158** (было 141): +6 `RULES-D*`, +10 дозаведённых задач, +1 от расщепления V-16. Активных задач — **157** (T-7 `ОТМЕНЕНА`).
- Размеры (по 157 активным): **S 77 · M 64 · L 11 · смешанные 5** (было объявлено 74/51/11/5 при фактических 66/58/11/6).
- Статусы: **ГОТОВ К ВЫДАЧЕ 59 · ЧЕРНОВИК 71 · ЗАБЛОКИРОВАН 16 · дубли-указатели 11 · ОТМЕНЕНА 1**.
- Волны: **0 → 55 · 1 → 4 · 2 → 18 · 3 → 39 · 4 → 11 · 5 → 9 · вне волн → 11** (было объявлено 43/4/~18/~40/~11/~10/~15).
- Блокеры релиза — **5 задач** (SO-1, SO-2, SO-2b, SO-7, SO-11), закрывающих 2 issue-блокера (#9.4, #24); прежнее «7» было двойным счётом указателей.

### 5. Приёмка `60-ACCEPTANCE.md`

Добавлена колонка **«задачи-исполнители»** для A1..A10 (без неё три критерия содержали обещания без единой задачи в плане). Исправлено «10 скоупов» → **12 скоупов** (A1). Заведены пять новых критериев: **A11** `## Blocker Trail` (D-20 → B2-19), **A12** `budget-exhausted` (D-28 → E-17), **A13** WARN→ERROR групповых квитанций после самомиграции (D-4 → B2-20), **A14** docs-проход только-v2 + удаление `tasks/` (A5/A1 → REL-16, E-20), **A15** устранение найденной утечки в deployed-surface (SO-5). Под прогоны A3/A4 заведены E-18/E-19; A8 переписан под релизный режим (A) с явным выносом `RULES-D1..D6` за релиз; §4 «Открытые пункты» пересобран (D-24 → D-31/D-32/D-33, добавлены O-2 и O-6).

### 6. Осталось за пределами этого документа (для трек-документов)

- `34-TRACK-RELEASE-PACKAGE.md` §8 обязан получить строку **REL-15** (сейчас id живёт только на доске) и **REL-16**.
- `33-TRACK-RULES.md` §5 должен сослаться на `33b` §6 (переформулировка T-2, отмена T-7, шесть `RULES-D*`).
- `30-TRACK-VERIFY.md` §7: либо внести Q8 явно, либо оставить единственным источником `00-INDEX.md` §4 O-2.
- Открытые вопросы к оператору/Lead, без которых часть плана не двигается: **D-19 vs И-2** (`[gate] ` в квитанции → V-14, A6), **O-2** (`fix`: глагол или флаг → V-16b), **D-33** (весь блок слоя правил → T-2, RULES-D1..D6), релизность **S2**-регресса (SO-8), правка main-side README (T-14, 5.5).
