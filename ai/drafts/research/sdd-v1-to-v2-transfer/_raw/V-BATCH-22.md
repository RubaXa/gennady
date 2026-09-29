ВЕРИФИКАЦИЯ V-BATCH-22 — пачка 22 «Мигратор сначала доказывает дефект, потом лечит» (E-03, E-07, E-06, E-09)

ВЕРДИКТ: **ВЕРНУТЬ НА ДОРАБОТКУ ПО ОДНОМУ ПУНКТУ, ОСТАЛЬНОЕ ПРИНЯТЬ С ПРАВКАМИ**. Дисциплина red-first (L-15) соблюдена не на словах: я независимо воспроизвёл красный бар на срезе `03d661d5` и зелёный на `5fcf286a`, и на срезе E-07 мигратор того времени физически не мог его починить. Все шесть гейтов брифа зелёные. Но новая функция `scaffoldFirstRound`, включённая в обычный путь `sdd-migrate anchors --write`, **молча стирает содержимое Execution Log мигрируемого тикета** (**B-1**) — это прямое противоречие приёмке будущей `B2-10` («ни один не затронутый блок не переписан») и уже зафиксированному в репозитории инварианту `anchor-inject.test.ts:107`; на `E-14` (127 реальных тикетов) это потеря истории. Отдельно: бар `E-07` ловит только **внесённые**, а не оставшиеся находки (**B-2**), а «квитанции» в правиле завершённости проверяются подстрокой без вердикта и провенанса (**B-3**) — судья в прогонах `E-09` прав по существу, это дыра в «завершённости», а не только дефект харнесса.

Проверяющий: `plan-verifier`. Дерево: `…/scratchpad/rc-w7`, ветка `lead/migrator-red-first`, HEAD `bc2e8d34`, база `c51cab65` (PR #43). Живые LLM-прогоны не запускались — проверка по сохранённым `results/**` и по сохранённым (`--keep`) песочницам. Ничего в дереве не изменено: временный worktree `…/scratchpad/v22-e07` (детач на `03d661d5`) удалён, `git -C rc-w7 status --short` — пусто, HEAD `bc2e8d34`. Пробы выполнялись во временных каталогах через `…/scratchpad/probe/*.mts`.

---

## 1. Что подтверждено

**Полнота таблиц файлов.** `git diff --name-only c51cab65..HEAD` — **25 файлов**. Каждый имеет строку в таблице «Файлы» одного из `R-E-03/07/06/09` (проверено скриптом: 14 по полному пути, 11 — каталоги прогонов, записанные брейс-нотацией `…/{summary.json,judge.md}`). Пропусков нет. Покоммитные `--stat` совпадают с заявленными: `58aba32f` 14 файлов, `03d661d5` 3, `5fcf286a` 5, `bc2e8d34` 7. Порядок коммитов `E-03 → E-07 → E-06 → E-09` соответствует L-15.

**Гейты брифа (перезапущены мной синхронно, `npm --prefix <rc-w7>`).**

| Команда | Результат | exit |
|---|---|---|
| `npm test` | `# tests 3702 / # pass 3693 / # fail 0 / # cancelled 1 / # skipped 8` | 0 |
| `npm run gate:sdd-check-baseline` | `OK — no error outside the baseline (227c03a8…, tag rc-baseline-1)` | 0 |
| `npm run flow-eval:docs-check` | `OK — 8 doc(s), 48 path(s), 12 link(s), 15 npm command(s), 0 [UNVERIFIED]` | 0 |
| `npm run results:table:check` | `[results-table] up to date (no diff)` | 0 |
| `npm run build` | `✓ built in 2.79s` | 0 |
| `npm run format` (сверх брифа) | `All matched files use Prettier code style!` | 0 |
| `npm run type-check` (сверх брифа) | чисто | 0 |
| `npm run test:sdd-flow-eval` | `# tests 211 / # pass 210 / # fail 1` | 1 |

Единственный фейл — `ai/flow-eval/__tests__/harness.test.ts:198` «provisioner gives fixture scenarios unique isolated directories», предсуществующий (R-BATCH-07), файл в `V2_GATE_EXCLUDED_NAMES`. Не регрессия пачки.

**Юниты поштучно (перезапущены мной, `node_modules/.bin/tsx --test`).** `migration-grade.test.ts` 11/11 · `fixture-detmig.test.ts` 4/4 · `sdd-migrate.cmd.test.ts` 16/16 · `anchor-inject.test.ts` 8/8. Суммарно 39/39 (см. **B-7** о том, как эти числа поданы в отчётах).

**Red-first ПО СУЩЕСТВУ — главная проверка (мой прогон, не со слов отчёта).** Отдельный worktree `git worktree add --detach … 03d661d5`; вход — фикстура `core.task.DETMIG-1.md`, взятая как ДАННЫЕ (немигрированный тикет: все анкоры v2 есть, таблица 2-колоночная, маркеров нет).

| Срез | `sdd-check --task` ДО | мигратор того среза | `sdd-check --task` ПОСЛЕ |
|---|---|---|---|
| `03d661d5` (E-07, до E-06) | exit 1, `SDD_VERIFICATION_TABLE_INVALID`; `computeMigrationGrade({},'FLOW_VERSION=v2',…)` → `pass=false`, `introduced` содержит этот код | `skip … — already anchored / no canonical sections`, **0 written** | exit 1, `SDD_VERIFICATION_TABLE_INVALID` **остался** |
| `bc2e8d34` (HEAD) | то же самое | `+ … — VERIFICATION table (2-col → 3-col, Role added), PHASE_RECEIPTS:v1 marker, Execution Log Round 1 (scaffolded, all unchecked)`, **1 written** | `SDD_VERIFICATION_TABLE_INVALID` **исчез**; остались только предсуществующие `SDD_BROKEN_SPEC_REF`, `SDD_BDD_MISSING_NEGATIVE`, `ERR_CLI_SDD_CHECK_READ_FAILED` |

Бар был красным до фикса и на немигрированной фикстуре, и после прогона тогдашнего мигратора — то есть введён не «уже зелёным». Тезис пачки ПОДТВЕРЖДЁН.

**Коды в `MIGRATION_CRITICAL_CODES`** (`ai/flow-eval/migration-grade.ts:43-49`): к трём прежним добавлены `SDD_VERIFICATION_TABLE_INVALID` и `SDD_COVERAGE_POLICY_INVALID`. Словарь правил `MIGRATION` в `docs/EVAL-SPEC.md` приведён к пяти кодам в обеих частях (A и B) — `flow-eval:docs-check` зелёный.

**`SCOPE_TYPE` — заявление R-E-07 §4 п.1 ПОДТВЕРЖДЕНО.** Собственный обход `shared/sdd/check.ts` и `cli/cmd/sdd-check/**`: отдельного finding-кода за некорректный/отсутствующий `SCOPE_TYPE` в `sdd-check` нет. `SCOPE_TYPE` только читается (`check.ts:1779`, `:1817`, `:1954`, `:2290`, `:2564`), а ошибки идут под чужими кодами (`SDD_SPEC_SECTION_MISSING`, `SDD_SCOPE_NO_DATA_FLOW`); канонический литерал разбирает `shared/sdd/module-specs.ts:93-111`, но возвращает `reason`-строку, не код. Добавлять в `MIGRATION_CRITICAL_CODES` сейчас нечего — исполнитель прав, вопрос остаётся открытым для Lead.

**E-06, приёмка на РЕАЛЬНОМ CLI (мой прогон на фикстуре, а не через `parseVerificationTable` напрямую).** Мини-проект с порталом, спекой и директивами; тикет `fixture-detmig` положен в `specs/demo/core/`:
- `sdd-task DETMIG-1` **ДО** миграции → `ok=false`, `ERR_CLI_SDD_TASK_VERIFICATION_INVALID … Verification table line 1: expected header Command | Required by | Role`;
- `sdd-migrate anchors <ticket> --write` → 3 правки;
- `sdd-task DETMIG-1` **ПОСЛЕ** → `ok=true`, печатает полный план (`Phases Overview`, per-phase read-manifest P1/P2). «`sdd-task` принимает» — **ПОДТВЕРЖДЕНО**, причём сильнее, чем в отчёте;
- `sdd-state <root>` → `FLOW_VERSION=v2` и `[SCOPES]` строка `demo	library	done	demo scope	specs/demo/demo.spec.md`. «Печатает тип скоупа» — **ПОДТВЕРЖДЕНО**. Оговорка отчёта верна: тип берётся из ПОРТАЛЬНОЙ таблицы (`cli/cmd/sdd-state/sdd-state.types.ts:171,179`), не из маркера `<!--SECTION:SCOPE_TYPE-->` спеки, и код этой пачкой не менялся.

**Незатронутые блоки (byte-diff мигрированного тикета против исходного).** `upgradeVerificationTable` меняет **только** область между `<!--SECTION:VERIFICATION-->`/`<!--/SECTION:VERIFICATION-->`; META, PHASES_OVERVIEW, PHASE_P1/P2, BDD, TEST_COVERAGE, DECISION_LOG — байт-в-байт исходные. Ранний выход при отсутствии анкоров (`anchor-inject.ts:234-236`) и идемпотентность для уже 3-колоночной таблицы (`HDR_2COL` не совпадает) — корректны. **Исключение — Execution Log, см. B-1.**

**E-09 — независимая перепроверка R-COMPLETE, а не чтение отчёта.** Обе песочницы прогонов сохранены (`--keep`) и на диске. Я вызвал `checkCompletion`/`checkR1Structure` из `ai/flow-eval/quality-gate.ts` напрямую на них:

| Прогон | R-COMPLETE | R1 |
|---|---|---|
| `2026-09-10-slugify-toolchain` | `pass:true` — `artifact built + ticket DONE + round closed + receipts` | `pass:true` — `sdd-check --all clean` |
| `2026-09-10-slugify-toolchain-2` | `pass:true` — то же | `pass:true` — то же |

«R-COMPLETE pass ×2, R1 чист» — **ПОДТВЕРЖДЕНО механически**. `metrics-ledger.jsonl` независимо подтверждает те же сигналы для обоих прогонов (`"ticket_status": "[x] DONE"`, `round_closed/impl_receipt/audit_receipt/review_receipt` — все `true`).

**D-45/D-28 — вердикт судьи не влияет на exit — ПОДТВЕРЖДЕНО КОДОМ.** `ai/flow-eval/cli.ts:228-232`: `computeAggregateExitCode` падает только на `verdict === 'worker-error'` либо `quality?.pass === false`; вердикт судьи в вычислении не участвует. В сохранённых `summary.json` обоих прогонов `verdict:"fail"`, `outcome:"fail"`, но `quality:{rule:"R1",pass:true}` ⇒ агрегированный exit 0. Заявление отчёта «gate: pass · batch outcome: exit 0» согласуется с сохранёнными данными.

**Конфликты по файлам.** Для каждой ветки считал `git diff --name-only $(git merge-base <ветка> HEAD)..<ветка>` и пересекал с 25 файлами пачки: `lead/phase-agent-bounds` (#38), `lead/journal-round` (#40), `lead/spec-authoring` (#41), `lead/verify-stacks` (#42), `lead/review-critic-bounds` (#45), `lead/verify-gate-scope` (#46), `lead/reopen-by-cause` (#48), `lead/promises-not-wider` (#49), `lead/axioms-one-home` — **пересечений ноль по всем девяти**. `shared/sdd/anchor-inject.ts` и `cli/cmd/sdd-migrate/**` не трогает ни одна из них.

---

## 2. Находки

### B-1 — БЛОКИРУЮЩАЯ. Мигратор молча стирает Execution Log

**Файл:строка.** `shared/sdd/anchor-inject.ts:191` — `const nextLines = [...lines.slice(0, startIdx + 1), '', ...round, ...lines.slice(endIdx)];`. Вызов в обычном пути записи: `cli/cmd/sdd-migrate/sdd-migrate.cmd.ts:302-304`.

**Что происходит.** `scaffoldFirstRound` **выбрасывает всё** между `<!--SECTION:EXECUTION_LOG-->` и `<!--/SECTION:EXECUTION_LOG-->` и подставляет каркас. Единственный сторож — `if (/^###\s+Round\s+\d/m.test(content))` (`:172`). Тело без заголовка `### Round <N>` — любое, в том числе с реальной историей — уничтожается. Докблок `:158-159` («only a v1-migrated **placeholder** body … is replaced») описывает поведение неверно: слова `placeholder` в проверке нет.

**Воспроизведение (мой прогон).** Беру ту же фикстуру, заменяю строку журнала на реальную v1-историю из трёх строк, гоняю `sdd-migrate anchors <ticket> --write` на HEAD:

```
history "@alice" survived: false
history "off-by-one" survived: false
history "@bob" survived: false
history "DECISION: keep sync API" survived: false
```

То же видно и на самой фикстуре: в мигрированном тикете исчезли строка `- 2026-09-07 migrated from v1 — no rounds/phases recorded in v1 format` и канонический курсивный комментарий про «fabricated DONE».

**Почему блокирует.**
1. Прямое противоречие приёмке **B2-10** (`61-TASK-BOARD.md:84`): «изменение якорей — патч; **ни один не затронутый блок не переписан** (побайтовое сравнение вне зоны правки)». Пачка 22 правит ровно те же файлы (`anchor-inject.ts`, `cli/cmd/sdd-migrate/**`) и вносит поведение, которое B2-10 обязана будет откатить.
2. Противоречит уже существующему и зелёному инварианту репозитория: `shared/sdd/__tests__/anchor-inject.test.ts:107` — «does nothing when an Execution Log section already exists (**real content preserved**)». Инвариант утверждён для `scaffoldExecutionLog`, а `scaffoldFirstRound` вызывается сразу за ним в том же `anchors --write` и его ломает. Тест не падает лишь потому, что проверяет функцию в отдельности.
3. `E-14` — самомиграция 12 скоупов / 127 тикетов, где Execution Log непустой. Потеря необратима и незаметна: отчёт мигратора пишет `Execution Log Round 1 (scaffolded, all unchecked)`, ни слова об удалении.

**Правка.** `scaffoldFirstRound` должен ДОБАВЛЯТЬ каркас, сохраняя прежнее тело (например, вставлять `### Round 1` после существующего текста), либо — при непустом теле — отказываться от правки и писать об этом в отчёт мигратора отдельной строкой. Плюс тест в `anchor-inject.test.ts`: «непустой Execution Log сохранён побайтово при добавлении Round-1 каркаса».

### B-2 — существенная, неблокирующая. Бар E-07 ловит только ВНЕСЁННЫЕ находки, не оставшиеся

**Файл:строка.** `ai/flow-eval/migration-grade.ts:110` — `const pass = flowV2 && criticalIntroduced.length === 0;`, где `diffIntroduced` (`:78-91`) считает код только при `count - baseline > 0`.

**Воспроизведение.** На срезе `03d661d5` мой прогон: при baseline `{}` → `grade.pass=false`; при baseline = снимок ДО миграции → `grade.pass=true`, `introduced=[]` — **при том, что мигратор не написал ни байта и `SDD_VERIFICATION_TABLE_INVALID` никуда не делся**. Тест `migration-grade.test.ts` «pre-existing (baseline) occurrences of either code are backlog, not a NEW migration failure» фиксирует это сознательно, и `EVAL-SPEC.md` формулирует правило честно («не внёс новых находок … относительно baseline»).

**Почему важно.** Формулировка доски «Бар исполнимости» и заголовок пачки читаются сильнее, чем механизм: на `E-14` миграция, которая НЕ починит ни одной таблицы, пройдёт бар `MIGRATION` с `pass=true`. Приёмка A2 («миграция реального проекта должна давать исполнимые тикеты») этим баром не обеспечивается.

**Правка (документная, кода не требует).** В строку `E-07` доски и в `50-TRACK-EVAL.md` добавить: «бар ловит только внесённые находки; требование “ноль ОСТАВШИХСЯ `SDD_VERIFICATION_TABLE_INVALID` после самомиграции” принадлежит `E-14`/`E-22` и этим баром не покрыто».

### B-3 — существенная. Дыра в правиле завершённости, а не только дефект харнесса (ответ на вопрос брифа)

Судья дал `fail` на обоих прогонах. Разбираю два его наблюдения раздельно.

**(а) `spec-schema=invalid` — ДЕФЕКТ ХАРНЕССА/ФИКСТУРЫ, судья прав в наблюдении, неправ в выводе.** Подтверждаю независимо: мой собственный прогон `sdd-state` на синтетическом мини-проекте (см. §1) даёт ту же диагностику `invalid  specs/demo/demo.spec.md  BOOTSTRAP_REQUIREMENTS must have exactly one paired section; found 0` — то есть это свойство генератора спек, а не execute-фазы. Уже вынесено отдельным `spawn_task` (R-BATCH-22 §Отклонения п.4а). Согласен: не дефект пачки.

**(б) «Самозаверенные квитанции» — ДЫРА В «ЗАВЕРШЁННОСТИ», а не дефект харнесса.**
- `ai/flow-eval/quality-gate.ts:149-150`: `auditReceipt: spec.includes('SDD_AUDIT_RECEIPT')`, `reviewReceipt: spec.includes('SDD_REVIEW_RECEIPT')` — проверяется **присутствие подстроки**. Ни `verdict`, ни провенанс не читаются: квитанция с `"verdict": "FAIL"` прошла бы так же.
- Сохранённые квитанции обоих прогонов (`…/slugify-toolchain/specs/slugify/core/core.spec.md:140-172`) записаны одной исполняющей сессией с разницей **5 секунд** (`ts` `16:41:22.634` и `16:41:27.026`) и несут **байт-в-байт одинаковую** `signature` `sha256:af6b4064156fdafd7e70504fb9c2ac7329fe393a1a15db889cb5c0d2f5667b81` для аудита и для ревью. Подпись не различает две разные проверки и ничего не удостоверяет.
- `quality-gate.ts:146`: `artifactExists: readRel(sandboxDir, t.artifact) !== ''`. В фикстуре `slugify-toolchain` файл `src/slugify.ts` **уже закоммичен** при провижининге (`git show HEAD:src/slugify.ts` в песочнице → `export function slugify(value: string): string { return value; }`, коммит `e31b6b4 chore: initialize eval fixture`). Нога «артефакт собран» выполнена ДО начала работы воркера.
- Побочно: заявление судьи «в DIFF только `src/slugify.test.ts`» — ОПРОВЕРГНУТО, `git diff --stat` в песочнице показывает и `src/slugify.ts | 27 +++`; это дефект упаковки доказательств для судьи (третье, отдельное наблюдение).

**Вывод.** Приёмка `E-09` («R-COMPLETE pass; R1 чист; 2 pass») выполнена **буквально и механически** — я это воспроизвёл. Но формулировку R-BATCH-22 «первый живой прогон, где **полное правило завершённости** дало реальный `pass`» надо ослабить: правило в нынешнем виде не отличает независимо заверенную работу от самозаверенной и не отличает собранный артефакт от предустановленной заглушки.

**Правка.** Строку `E-09` закрыть как ВЫПОЛНЕНО с оговоркой; завести задачу доски (см. §4).

### B-4 — средняя. D-62(в) не выполнен для трёх прогонов E-03

`ai/flow-eval/docs/journal/EXPERIMENTS-LOG.md` — три записи `## 2026-09-10 — infra-log-summary (pass/pass)` несут `**Гипотеза/зачем:** _(заполнить)_` и `**Итог:** _(заполнить)_`. D-62(в) требует «журнал экспериментов пополняется **записью** на прогон», а не автозаготовкой. Обе записи `E-09` заполнены — то есть исполнитель E-09 стандарт выдержал, исполнитель E-03 нет. R-E-03 §1 помечает эту строку «(append-only, не редактируется вручную)», что противоречит собственной практике E-09.
**Правка:** дописать «Гипотеза/зачем» и «Итог» в три записи `infra-log-summary`.

### B-5 — средняя. Ledger не сшивается с сырыми данными; метки прогонов E-03 перепутаны

`ai/flow-eval/results/metrics-ledger.jsonl`:
- строка 1 `"run": "E-03-golden-infra-log-summary-2"` несёт `reasoning_tokens 1390 / output_tokens 1560` — это числа `results/2026-09-10-infra-log-summary-**3**/summary.json`;
- строка 2 `"run": "E-03-golden-infra-log-summary-3"` несёт `1250 / 1399` — числа `…-infra-log-summary-**2**/summary.json`.

Для `E-09` сшивка верна (`15964/7523` → `…-slugify-toolchain`, `7840/8566` → `…-2`), то есть метрика одна и та же и расхождение — реальная перестановка меток. Сшивать вообще приходится по токенам: в `summary.json` нет ни `session`, ни ссылки на запись ledger, в ledger нет ссылки на каталог результатов.
**Правка:** поменять метки местами; отдельной задачей — поле связи (`results_dir`/`session`) в обе стороны.

### B-6 — средняя. Генерируемая RESULTS.md утверждает обратное тезису пачки

`ai/flow-eval/docs/journal/RESULTS.md` — строка `| slugify-toolchain | 2 | 20 | ~5 мин | ~89 000 | Не проходит (0/2) |`. Постоянный, генерируемый артефакт репозитория (D-62(б)) считает «Состояние» **по вердикту судьи**, то есть по диагностике, что противоречит D-28/D-45. Читатель репозитория видит «Не проходит (0/2)» ровно там, где пачка заявляет первый успех механического бара; исторический раздел выше про тот же сценарий говорит «Проходит до конца, тесты зелёные».
**Правка:** `ai/flow-eval/scripts/results-table.ts` должен брать «Состояние» из `quality.pass` / агрегированного exit-кода, а вердикт судьи выносить отдельной колонкой или сноской. Остаток для доски.

### B-7 — низкая. Числа в отчётах не сходятся с прогоном

- `R-E-06.md:10` — «`shared/sdd/__tests__/anchor-inject.test.ts` **39/39** pass». Мой прогон: **8/8**. 39 — это сумма ЧЕТЫРЁХ файлов (16+8+11+4).
- `R-E-06.md:55` и `R-BATCH-22…md:81` — «три файла → **39/39**». Мой прогон трёх названных файлов: **35** (16+8+11).
- `R-E-09.md:71` — «`npm test` → `# tests 3713 / # pass 3705`». Мой прогон: `# tests 3702 / # pass 3693 / # fail 0 / # cancelled 1 / # skipped 8`, exit 0.

### B-8 — низкая. У двух новых экспортов нет собственных юнит-тестов, и отчёт утверждает обратное

`shared/sdd/anchor-inject.ts` вырос на 164 строки (`upgradeVerificationTable:230`, `scaffoldFirstRound:165`), но `shared/sdd/__tests__/anchor-inject.test.ts` **этой пачкой не тронут** (его нет в `git diff --stat`) и не упоминает ни одну из двух функций (`grep` — 0 вхождений). Поэтому `R-E-06.md:75-77` («логика в `anchor-inject.ts`, юнит-тесты `anchor-inject.test.ts` покрывают её отдельно») — **ОПРОВЕРГНУТО**. Ветка `COVERAGE_POLICY:v1` + `Coverage Owner Phase` (`anchor-inject.ts:262-283`) не покрыта **нигде**: фикстура `fixture-detmig` coverage-строки не содержит, `sdd-migrate.cmd.test.ts` этот путь не трогает.
**Правка:** либо добавить юниты на обе функции (обязательно — ветку coverage-policy и сохранение непустого Execution Log из **B-1**), либо переформулировать §4 п.2 честно.

### B-9 — низкая. file:line в mermaid «стало» частью указывают на дореформенные строки

Сами **стрелки верны** — я сверил каждую с кодом: `sdd-migrate.cmd.ts:298` действительно вызывает `upgradeVerificationTable`, `:302-304` — `scaffoldFirstRound` (под условием `tableChanges.includes('phase-receipts')`); `cli.ts:386` → `checkR1Structure`, `:395` → `checkCompletion`, `:397` — условие неперезаписи, `:228` — `computeAggregateExitCode`. Все четыре ссылки на `cli.ts` **точны**. Неверны следующие якоря:

| Ссылка в отчёте | Фактически |
|---|---|
| `migration-grade.ts:31-42` (Set, «стало») | `43-49` (`31-42` — комментарий; `31-35` было верно ДО правки) |
| `migration-grade.ts:64` — `diffIntroduced` | `78` (`64` — до правки) |
| `migration-grade.ts:84` — `computeMigrationGrade` | `98` (`84` — до правки) |
| `anchor-inject.ts:238` — `upgradeVerificationTable` | `230` |
| `anchor-inject.ts:167` — `scaffoldFirstRound` | `165` |
| `anchor-inject.ts:73` / `:124` — `injectAnchors` / `scaffoldExecutionLog` | `76` / `127` |
| `quality-gate.ts:142` подписано «{rule:'R-COMPLETE', pass:true}» | `142` — объявление `checkCompletion`; ветка `pass:true` на `110` |

Три ссылки на `migration-grade.ts` в диаграммах «**стало**» — это номера строк файла ДО коммита `03d661d5`.

### B-10 — низкая. Сценарный файл прогонов E-09 не сохранён

`R-E-09.md:66` называет вход `--scenario-file e09-scenario.json`; такого файла нет ни в дереве, ни в истории (`git log --all -- ai/flow-eval/e09-scenario.json` — пусто). Вывод «R-COMPLETE вообще запускался» держится: встроенный `ai/flow-eval/scenarios.json` объявляет для `slugify-toolchain` блок `completion` (`artifact: src/slugify.ts`, `ticket`, `spec`), так что `cli.ts:394` срабатывает. Но точный вход прогона по D-62 невоспроизводим.
**Правка:** либо закоммитить сценарный файл рядом с сырыми данными, либо сослаться на встроенный сценарий и указать только переопределённые флаги.

### B-11 — не находка, уточнение статуса E-03

`summary.json` всех трёх прогонов `infra-log-summary` **не содержат поля `quality` вообще** (golden-сценарий: ни `R1`, ни `R-COMPLETE`) и сняты на sha `c51cab65` — то есть на базе, до коммита E-03. Половина приёмки «golden exit 0 + правило завершённости, 2 прогона» закрыта не самим E-03, а совместно с E-09; R-E-03 §4 п.3 это признаёт осознанно. Строка доски E-03 должна отразить именно это, иначе выглядит как невыполненный пункт.

---

## 3. Правки (что сделать до PR)

1. **B-1, блокирующая, код.** Переделать `scaffoldFirstRound` (`shared/sdd/anchor-inject.ts:165-193`) так, чтобы непустое тело Execution Log сохранялось; при невозможности — отказ от правки с явной строкой в отчёте мигратора. Привести докблок `:158-159` в соответствие с поведением. Добавить тест на побайтовое сохранение непустого тела.
2. **B-8, код/тесты.** Юниты на `upgradeVerificationTable` и `scaffoldFirstRound` в `shared/sdd/__tests__/anchor-inject.test.ts`, включая ветку `coverage-policy`; либо снять утверждение `R-E-06.md:75-77`.
3. **B-4, данные.** Заполнить «Гипотеза/зачем» и «Итог» в трёх записях `infra-log-summary` в `EXPERIMENTS-LOG.md`.
4. **B-5, данные.** Поменять местами метки `E-03-golden-infra-log-summary-2` / `-3` в `ai/flow-eval/results/metrics-ledger.jsonl`.
5. **B-7, B-9, B-10, отчёты.** Исправить числа тестов (8/8, 35, 3702/3693/1 cancelled), номера строк в mermaid «стало», и снять/уточнить ссылку на `e09-scenario.json`.
6. **B-2, B-3, формулировки.** Ослабить в `R-BATCH-22` фразы «бар исполнимости» и «полное правило завершённости дало реальный pass» до того, что механизм действительно делает.

---

## 4. Остатки для доски

1. **Новая задача (B-3):** «`R-COMPLETE` читает вердикт и провенанс квитанции, а не подстроку» — `quality-gate.ts:149-150` (проверять `verdict`, отличать записавшего от исполнителя) и `:146` (артефакт сравнивать с исходным состоянием фикстуры, а не с пустой строкой; `slugify-toolchain` поставляет заглушку в `e31b6b4`). Владелец — трек E, предпосылка для честного `A10`.
2. **Новая задача (B-6):** «Колонка “Состояние” в `RESULTS.md` считается по механическому гейту, не по вердикту судьи» — `ai/flow-eval/scripts/results-table.ts`; вердикт судьи — отдельная колонка. Основание: D-28, D-45.
3. **Новая задача (B-5):** «Сшивка ledger ↔ сырые данные прогона» — поле `results_dir`/`session` в обе стороны, чтобы `metrics-ledger.jsonl` и `results/<дата>-<сценарий>/summary.json` соединялись механически, а не по совпадению токенов. Основание: D-62.
4. **Правка строки `E-07`** (`61-TASK-BOARD.md:202`) и `50-TRACK-EVAL.md` §4.1: бар покрывает только внесённые находки (**B-2**); «ноль оставшихся `SDD_VERIFICATION_TABLE_INVALID`» — предмет `E-14`/`E-22`, не `E-07`. Там же зафиксировать закрытый вопрос по `SCOPE_TYPE`: отдельного кода `sdd-check` нет, добавлять в `MIGRATION_CRITICAL_CODES` нечего (подтверждено).
5. **Правка строки `E-06`** (`:203`): «`sdd-state` печатает `SCOPE_TYPE`» выполнено через ПОРТАЛЬНУЮ таблицу (`sdd-state.types.ts:171,179`), не через маркер спеки, и не на самой `fixture-detmig` (у неё owning spec домыслен). Если приёмка имела в виду сверку портального типа с маркером спеки — это не сделано, нужен отдельный бриф.
6. **Правка строки `E-03`** (`:199`): «правило завершённости» закрыто совместно с `E-09`; три прогона `infra-log-summary` — golden, без `quality` в `summary.json` (**B-11**). Плюс открытый вопрос интерпретации `metrics-ledger.jsonl` (перенос в постоянный `results/` + обобщение `state_metrics`) — требует подтверждения Lead.
7. **Отметка для пачки 16 (B2-10, B2-19b), стыковка.** Пачка 22 занимает те же файлы: в `shared/sdd/anchor-inject.ts` появились два новых экспорта (`upgradeVerificationTable:230`, `scaffoldFirstRound:165`) и новые импорты из `./section.ts` и `./ticket.ts` (файл перестал быть беззависимым); в `cli/cmd/sdd-migrate/sdd-migrate.cmd.ts` путь `anchors` получил регион `START_TABLE_UPGRADE`/`END_TABLE_UPGRADE` (`:297-305`), условие `skip` расширено на `tableChanges.length === 0` (`:307`), отчёт — четырьмя новыми строками (`:312-317`). Dry-run по умолчанию сохранён (правка только под `--write`). **B2-10 обязана будет починить или переписать `scaffoldFirstRound`** — её приёмка «ни один не затронутый блок не переписан» этим кодом нарушена (**B-1**); если B-1 чинится в пачке 22, B2-10 достаётся уже совместимая база. Конфликтов с PR #38/#40/#41/#42/#45/#46/#48/#49 и `lead/axioms-one-home` нет — пересечение имён файлов пустое.
8. **`.prettierignore` теперь исключает весь `ai/flow-eval/docs/journal/RESULTS.md`**, включая рукописные исторические разделы (побочный эффект правки E-03). Альтернатива «научить `results-table.ts` паддить как prettier» осознанно не выбрана — отдельная мелкая задача, если признаётся нужной.

---

## Итог

**Блокирующее (1).** **B-1** — `sdd-migrate anchors --write` молча уничтожает содержимое Execution Log мигрируемого тикета (`shared/sdd/anchor-inject.ts:191`, вызов `sdd-migrate.cmd.ts:302-304`); воспроизведено на реальной v1-истории; нарушает приёмку `B2-10` и собственный инвариант репозитория `anchor-inject.test.ts:107`; на `E-14` — необратимая потеря истории 127 тикетов.

**Неблокирующее (10).** **B-2** бар ловит только внесённые находки, не оставшиеся (`migration-grade.ts:110`) — формулировки доски сильнее механизма. **B-3** правило завершённости проверяет квитанции подстрокой без вердикта и провенанса (`quality-gate.ts:149-150`), а «артефакт собран» удовлетворён предустановленной заглушкой (`quality-gate.ts:146`) — наблюдение судьи о самозаверенных квитанциях справедливо. **B-4** три записи `EXPERIMENTS-LOG.md` остались автозаготовками `_(заполнить)_` (D-62(в)). **B-5** метки прогонов E-03 в ledger перепутаны, сшивки с сырыми данными нет. **B-6** генерируемая `RESULTS.md` считает «Состояние» по вердикту судьи вопреки D-28/D-45. **B-7** числа тестов в трёх отчётах (39/39 вместо 8/8 и 35; 3713/3705 вместо 3702/3693). **B-8** у двух новых экспортов нет собственных юнитов, ветка `coverage-policy` не покрыта нигде, отчёт утверждает обратное. **B-9** семь file:line-якорей в mermaid «стало» указывают на дореформенные строки (стрелки при этом верны). **B-10** сценарный файл прогонов E-09 не сохранён. **B-11** статус E-03 нуждается в уточнении: «правило завершённости» закрыто совместно с E-09.

**Подтверждено.** Порядок L-15 соблюдён по существу, а не по датам коммитов: на срезе `03d661d5` бар красный на немигрированной фикстуре и остаётся красным после прогона тогдашнего мигратора («0 written»), на HEAD — зелёный, потому что мигратор реально доработан (мой прогон в отдельном detached-worktree). `SDD_VERIFICATION_TABLE_INVALID` и `SDD_COVERAGE_POLICY_INVALID` в `MIGRATION_CRITICAL_CODES` (`migration-grade.ts:43-49`); отсутствие отдельного кода за `SCOPE_TYPE` подтверждено обходом `check.ts`/`module-specs.ts`. Both-way юниты зелёные (11/11, 4/4, 16/16, 8/8). E-06: реальный `sdd-task DETMIG-1` отвергает тикет до миграции и принимает после, `sdd-state` печатает `demo library done`; кроме Execution Log мигратор не трогает ни одного блока. E-09: я сам перезапустил `checkCompletion`/`checkR1Structure` на обеих сохранённых песочницах — `R-COMPLETE pass ×2`, `R1 pass ×2`; вердикт судьи `fail` не влияет на exit по конструкции `cli.ts:228-232` (D-45/D-28). Все 25 файлов диффа имеют строку в таблицах отчётов. Гейты: `npm test` exit 0 (0 fail), `gate:sdd-check-baseline` OK, `flow-eval:docs-check` OK, `results:table:check` up to date, `npm run build` exit 0, дополнительно `format` и `type-check` чисты; единственный фейл `test:sdd-flow-eval` — предсуществующий `harness.test.ts`. Конфликтов по файлам с PR #38/#40/#41/#42/#45/#46/#48/#49 и `lead/axioms-one-home` нет.

---

## Повторная проверка

**ВЕРДИКТ: ПРИНЯТЬ.** Блокирующая **B-1** закрыта; все десять неблокирующих закрыты либо честно
переведены в остатки самим отчётом. Дерево `…/scratchpad/rc-w7`, ветка `lead/migrator-red-first`,
HEAD `e80d09fc` (9 коммитов поверх `c51cab65` = PR #43; правки: `4d6bc235`, `6ab789d2`, `5fe7189c`,
`9ac58e1f`, `e80d09fc`), `git status --short` пусто до и после проверки. Живые LLM-прогоны не
запускались: перепроверка E-09 сделана механически на сохранённых песочницах. Мутации выполнялись во
временном worktree `…/scratchpad/v22r/mutwt` (детач на `e80d09fc`), удалён (`git worktree list` его не
содержит, `worktree prune` выполнен).

### Находка → статус

| Находка | Статус | Чем проверено (мой прогон, не со слов отчёта) |
|---|---|---|
| **B-1** (блокирующая) — `scaffoldFirstRound` стирал Execution Log | **ЗАКРЫТА** | Воспроизвёл свой сценарий из вердикта на HEAD: фикстура `fixture-detmig` с реальной v1-историей из четырёх маркеров (`@alice`, `off-by-one`, `@bob`, `DECISION: keep sync API`) → `sdd-migrate anchors <ticket> --write` → **все четыре маркера на месте** (было `survived: false` ×4), канонический курсивный комментарий про «fabricated DONE» тоже. Байтовое сравнение: вне зон `VERIFICATION`/`EXECUTION_LOG` файл **идентичен побайтово**; старое тело журнала — точный байтовый ПРЕФИКС нового (+249 байт каркаса после него), то есть патч, а не перезапись. Мутация (вернуть `nextLines` к безусловному варианту без `existingBody`) → красный ровно на новом тесте «REGRESSION — real v1 Execution Log history survives byte-for-byte…» (17/17 → 16/17). Инвариант `anchor-inject.test.ts` «does nothing when an Execution Log section already exists (**real content preserved**)» жив — **сместился с `:107` на `:112`**, зелёный. `scaffoldFirstRound` при пустом теле ведёт себя как раньше (отдельный тест), идемпотентность по `### Round N` сохранена. |
| **B-2** — бар ловил только внесённые находки | **ЗАКРЫТА** | Коды разделены на `MIGRATION_STRUCTURAL_CODES` (baseline-diff, 3 старых) и `MIGRATION_EXECUTABILITY_CODES` (по ОСТАВШИМСЯ в `after`), `migration-grade.ts:54-66`, `:115-149`. Мой прогон точного репро из вердикта: baseline = снимок ДО миграции, `after` = он же (мигратор не написал ни байта) → **`pass=false`**, `introduced=[]`, `executabilityRemaining=[{SDD_VERIFICATION_TABLE_INVALID,1}]` (было `pass=true`). Both-way: `after` действительно чист → `pass=true`; «усохло 5→1» → `pass=false`; структурный долг 7→2 по-прежнему терпится (`pass=true`); нога `flowV2` жива (`FLOW_VERSION=v1` → `pass=false`). Юниты 13/13. |
| **B-3** — квитанции проверялись подстрокой | **ЗАКРЫТА в заявленном объёме** | `checkReceipt` (`quality-gate.ts`) парсит JSON-блок, требует `kind` == маркер, явный `"verdict":"PASS"`, и свежесть подписи через `deriveGroupState`/`groupReceiptIssue`, импортированные **без изменений** из `shared/sdd/group-receipt.ts` (файл этой пачкой не тронут — проверено `git diff --name-only`). `artifactWasProduced` сравнивает файл с КОРНЕВЫМ коммитом песочницы (`git rev-list --max-parents=0`, затем `git diff --quiet <root> -- <artifact>`), с откатом на «непусто» вне git. Мутация обратно (подстрока + `readRel !== ''`) → красными становятся ровно 5 новых тестов (18/18 → 13/18): non-PASS verdict, kind-mismatch, stale signature, malformed JSON, «артефакт не менялся с корневого коммита». Механическая перепроверка на сохранённых песочницах: `-3` (`…/e09-sandboxes/run1`) → `R-COMPLETE pass:false — no group audit receipt on spec (no receipt recorded); no group code-review receipt…`, `-4` (`run2`) → `R-COMPLETE pass:true — artifact built + ticket DONE + round closed + receipts (verdict + provenance checked)`. Совпадает с `summary.json` обоих прогонов и с логикой `cli.ts:397` (`-4` записан как `quality.rule:"R1"` именно потому, что `rc.pass===true` не перезаписывает — отчёт это сам раскрывает, §Остатки п.3). Заявление отчёта «квитанции ДВУХ ОРИГИНАЛЬНЫХ прогонов остаются валидны по новому правилу» — **проверено мной отдельно** на их песочницах (`/private/var/…/sdd-flow-eval-root.JYLQwO` и `.4VWq69`): оба по-прежнему `pass:true`. |
| **B-4** — три записи `EXPERIMENTS-LOG.md` были `_(заполнить)_` | **ЗАКРЫТА** | `grep '_(заполнить)_'` даёт только строки 11/19/20 — это описание ФОРМАТА в шапке файла, не записи. Все три записи `infra-log-summary` несут содержательные «Гипотеза/зачем» и «Итог»; первый прогон честно помечен разведочным (без `--keep`, golden вручную не проверялся) и не входит в «2 golden-прогона» приёмки E-03. |
| **B-5** — метки прогонов E-03 перепутаны | **ЗАКРЫТА (см. C-1)** | Пересчёт скриптом по `reasoning_tokens`/`output_tokens`: `E-03-golden-infra-log-summary-2` → 1250/1399 = `results/2026-09-10-infra-log-summary-2/summary.json`; `-3` → 1390/1560 = `…-summary-3`. Сшивка верна. Поле связи (`results_dir`/`session` в обе стороны) как и было — остаток доски, не чинилось. |
| **B-6** — `RESULTS.md` считала «Состояние» по судье | **ЗАКРЫТА** | `results-table.ts`: `gateBucket` повторяет фолд `computeAggregateExitCode` (`cli.ts:229-232`: `worker-error` \|\| `quality.pass===false` → fail), плюс `budget-exhausted` и `undetermined` для прогонов без `quality`. Колонки теперь «Состояние (мех.)» и «Судья (диагностика)». Мой независимый пересчёт по четырём `summary.json`: механически pass 3 / fail 1 из 4, судья pass 1/4 — ровно то, что стоит в строке `slugify-toolchain`; `infra-log-summary` → «нет мех. гейта (3)» (у всех трёх нет поля `quality` — это и был мой **B-11**). `results:table:check` — `up to date (no diff)`. |
| **B-7** — числа тестов | **ЗАКРЫТА (см. C-3)** | Исправлено на 8/8, 35/35 (16+8+11), 24/24 (16+8), 3702/3693/1 cancelled — с явной привязкой «на момент коммита». Числа сходятся с моими прогонами тех же файлов на соответствующих срезах. |
| **B-8** — у новых экспортов не было юнитов | **ЗАКРЫТА** | `anchor-inject.test.ts` вырос с 8 до 17 тестов: 4 на `scaffoldFirstRound` (включая репро B-1) + 5 на `upgradeVerificationTable`, в том числе both-way ветка `coverage-policy` (однозначный случай минтит `COVERAGE_POLICY:v1` с реальной owner-фазой; два coverage-ряда — не минтит). 17/17 зелёные. |
| **B-9** — file:line в mermaid | **ЗАКРЫТА в основном (см. C-3)** | Каждый якорь сверен мной с соответствующим срезом: `anchor-inject.ts:230`/`:165` @`5fcf286a` ✓, `:76`/`:127` ✓, `migration-grade.ts:78` и `:43-49` @`03d661d5` ✓, `:31-35` @`c51cab65` ✓, `:98` @`5fcf286a` ✓, `quality-gate.ts:142`/`:110` и `cli.ts:228`/`:386`/`:395`/`:397` @`bc2e8d34` ✓, `diffIntroduced:95` @HEAD ✓. Стрелки (реальные вызовы) перепроверены ещё в первом круге и не менялись. |
| **B-10** — `e09-scenario.json` не сохранён | **ЗАКРЫТА** | Вместо дублирующего коммита зафиксирован точный рецепт (единственный элемент `scenarios.json` с `id==="slugify-toolchain"`, без переопределений) в `R-E-09.md` §4 п.3a; блок `completion` (`artifact: src/slugify.ts`, `ticket`, `spec`) я прочитал в `scenarios.json` и использовал для собственной перепроверки — воспроизводимо. |
| **B-11** — статус E-03 | **ЗАКРЫТА** | Отражено и в `RESULTS.md` («нет мех. гейта (3) — см. golden/verify.sh вручную»), и в записях журнала: три `infra-log-summary` — golden, без `quality` в `summary.json`. |

### Новые находки этого круга (все неблокирующие)

- **C-1 (низкая, класс B-5).** Новая строка ledger `E-09-slugify-toolchain-3-post-hardening` несёт
  `reasoning_tokens 11916 / output_tokens 8992`, тогда как `results/2026-09-10-slugify-toolchain-3/summary.json`
  даёт `15010 / 13139`. Остальные пять строк сходятся с их `summary.json` **точно** (`-1` 15964/7523,
  `-2` 7840/8566, `-4` 9569/10290, E-03 `-2` 1250/1399, `-3` 1390/1560), то есть метрика одна и та же
  и расхождение реально. Скорее всего строка снята с чужой/недочитанной сессии (прогон `-3` — со
  `status:"running"`, срезан по бюджету). В отчётах не оговорено. Ещё одно основание для задачи доски
  «сшивка ledger ↔ сырые данные» (остаток №3 первого круга).
- **C-2 (низкая).** Обе новые строки ledger (`-3`, `-4`) несут `ticket_status:"?"`, `round_closed:false`,
  `audit_receipt:false`, `review_receipt:false` — для `-4` это **прямо противоречит** проверенному мной
  состоянию песочницы (тикет `[x] DONE`, раунд закрыт, обе квитанции валидны). Причина механическая:
  `session-metrics.py`'s `state_metrics()` вызван без `--ticket/--spec` на `slugify-toolchain`, `_read`
  вернул пусто. Отчёт это **сам раскрывает** (§Остатки п.4) и обоснованно не чинит (файл вне зоны
  брифа), но неверные значения остаются в постоянном артефакте D-62.
- **C-3 (низкая, хвост B-9).** Три остаточных номера строк: `R-E-06.md:48` — `anchor-inject.ts:243`
  для `upgradeVerificationTable` на HEAD, фактически `:240`; `R-E-09.md:39` (диаграмма «было») —
  `quality-gate.ts:52` для `checkR1Structure`, фактически `:55` и на `c51cab65`, и на `bc2e8d34`;
  `R-E-07.md:41` — `migration-grade.ts:54-65` для трёх Set'ов, фактически `:54-66`.
- **C-4 (тривиальная).** В записи `slugify-toolchain-4` в `EXPERIMENTS-LOG.md` потеряны пробелы вокруг
  инлайн-кода (`` `kind`matches ``, `` `verdict`is ``, `` `gate: pass`, `batch outcome: exit 0`. Judge
  verdict: `pass`too ``) — читаемость постоянного журнала.

### Остаток B-3, который правкой НЕ закрывался (и это верно)

Подпись квитанции — это `sha256` от переисчисленного состояния группы (`group-receipt.ts:112-126`),
то есть защита от протухания и подделки состояния, а НЕ удостоверение личности проверяющего. Поэтому
аудит и ревью одной и той же группы законно несут байт-в-байт одинаковую `signature`, и обе
оригинальные песочницы E-09 (где аудит и ревью записаны одной исполняющей сессией с разницей 5 секунд)
**по-прежнему проходят** ужесточённое правило — я это проверил. Наблюдение судьи о самозаверенности
остаётся в силе; «отличать записавшего от исполнителя» — предмет задачи доски №1 первого круга, она не
входила в объём этой правки и корректно не заявлена закрытой.

### Гейты и совместимость (мои прогоны на `e80d09fc`)

| Команда | Результат | exit |
|---|---|---|
| `npm test` | `# tests 3733 / # pass 3725 / # fail 0 / # cancelled 0 / # skipped 8` | 0 |
| `npm run build` | `✓ built in 3.77s` | 0 |
| `npm run gate:sdd-check-baseline` | `OK — no error outside the baseline (227c03a8…, tag rc-baseline-1)` | 0 |
| `npm run flow-eval:docs-check` | `OK — 8 doc(s), 51 path(s), 12 link(s), 15 npm command(s), 0 [UNVERIFIED]` | 0 |
| `npm run results:table:check` | `[results-table] up to date (no diff)` | 0 |
| `npm run format` / `npm run type-check` (сверх брифа) | чисто | 0 |

Числа `npm test` совпадают с заявленными в отчёте до единицы. Первые два моих прогона дали 1 и 2
«not ok» — это `cli/cmd/lint/__tests__/lint.cmd.test.ts` и `cli/cmd/testcov/__tests__/testcov.cmd.test.ts`
с `failureType: 'testTimeoutFailure'`, `test timed out after 30000ms`, под нагрузкой моих же
параллельных прогонов; оба файла поштучно зелёные (`lint.cmd.test.ts` 31/31), третий прогон без
посторонней нагрузки — exit 0, 0 fail. Класс известный (R-BATCH-03), не регрессия пачки.

Полнота таблиц файлов: `git diff --name-only c51cab65..HEAD` — **34 файла** (было 25 до правок), каждый
имеет упоминание в `R-BATCH-22`/`R-E-03`/`R-E-06`/`R-E-07`/`R-E-09`; четыре файла новых прогонов
(`…-slugify-toolchain-{3,4}/{summary.json,judge.md}`) покрыты строкой каталога прогона в таблице
«E-09 до/после ужесточения» — та же брейс-конвенция, что и раньше.

`git merge-tree --write-tree HEAD <ветка>` — **exit 0, конфликтов ноль** по всем девяти:
`lead/phase-agent-bounds` (#38), `lead/journal-round` (#40), `lead/spec-authoring` (#41),
`lead/verify-stacks` (#42), `lead/review-critic-bounds` (#45), `lead/verify-gate-scope` (#46),
`lead/reopen-by-cause` (#48), `lead/promises-not-wider` (#49), `lead/axioms-one-home` (#50).

### Стыковка с пачкой 16 (B2-10 / B2-19b): что теперь в `anchor-inject.ts`

Файл вырос **143 → 317 строк**. Было три экспорта (`legacyHeaderBody:54`, `injectAnchors:76`,
`scaffoldExecutionLog:127` — номера совпадают с базой) — стало пять плюс экспортируемый тип:
добавлены `scaffoldFirstRound:167` и `upgradeVerificationTable:240`, тип
`VerificationUpgradeChange:227` (`'table' | 'phase-receipts' | 'coverage-policy'`). Файл перестал быть
беззависимым: появились `import { extractSection } from './section.ts'` и
`import { parsePhasesOverview } from './ticket.ts'` (строки 5-6). `scaffoldFirstRound` теперь
**патч, а не перезапись**: сохраняет существующее тело `EXECUTION_LOG` побайтово и дописывает каркас
Round-1 после него; срабатывает только при наличии `<!--PHASE_RECEIPTS:v1-->` и непустом `phaseIds`,
идемпотентен по `### Round <N>`. Приёмка **B2-10** («ни один не затронутый блок не переписан,
побайтовое сравнение вне зоны правки») этим кодом больше **не нарушается** — B2-10 достаётся уже
совместимая база, откатывать нечего. `shared/sdd/migration-plan.ts` этой пачкой **не тронут**.
`cli/cmd/sdd-migrate/sdd-migrate.cmd.ts` — +24/−3: регион `START_TABLE_UPGRADE`/`END_TABLE_UPGRADE`
(`:297-305`), `skip` расширен на `tableChanges.length === 0`, отчёт — четырьмя новыми строками;
dry-run по умолчанию сохранён. Тестовый бюджет файла: `anchor-inject.test.ts` 8 → 17 тестов.

### Итог повторной проверки

**Блокирующее: нет.** B-1 закрыта по существу — воспроизведено, побайтово, с обратной мутацией.

**Неблокирующее (4, все новые и мелкие).** **C-1** строка ledger `-3-post-hardening` не сходится с
`summary.json` по токенам (единственная из шести). **C-2** обе новые строки ledger несут
`ticket_status:"?"`/квитанции `false`, что для прогона `-4` противоречит проверенному состоянию
песочницы (раскрыто самим отчётом, не чинилось — файл вне зоны брифа). **C-3** три остаточных
file:line-номера в `R-E-06.md:48`, `R-E-09.md:39`, `R-E-07.md:41`. **C-4** потерянные пробелы вокруг
инлайн-кода в записи `slugify-toolchain-4` журнала.

**Подтверждено.** Все десять неблокирующих находок первого круга закрыты или честно переведены в
остатки. Дисциплина честности выдержана: перезапуск E-09 после ужесточения дал **1 pass / 1 fail**, и
это записано как есть — в отчёт, в `EXPERIMENTS-LOG.md`, в `RESULTS.md` («Смешанно: pass 3, fail 1/4»)
и в ledger; правило не подгонялось под зелёный. Прогон `-3` — честный «недоведённый до receipt-шага»
исход (квитанций нет вообще, старая подстрочная проверка тоже дала бы fail), прогон `-4` — валидные
квитанции с проверенным вердиктом и свежей подписью; оба вывода я перепроверил механически, вызвав
`checkCompletion` на сохранённых песочницах. Колонка «Состояние (мех.)» считается по `quality.pass`
тем же фолдом, что и `computeAggregateExitCode`, судья вынесен отдельной колонкой (D-28/D-45). Шесть
гейтов зелёные, дерево чисто, конфликтов с девятью открытыми PR нет. **Пачку 22 можно отдавать в PR.**
