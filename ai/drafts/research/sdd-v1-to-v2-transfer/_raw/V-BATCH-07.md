# V-BATCH-07 — независимая верификация пачки 7 «Эвал воспроизводим из чистого клона»

Ветка `lead/eval-reproducible`, HEAD `a157b903`, дерево
`/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad/rc-v6`.
База (merge-base с `origin/codex/sdd-v2-rc52-followup`) — `b964a235` (merge PR #32), подтверждена
командой `git merge-base a157b903 origin/codex/sdd-v2-rc52-followup`. Голова RC — `c9b58636`.
Всё ниже перепроверено мной заново; живые LLM-прогоны не запускались (нет по условию), это отмечено
как НЕ ПРОВЕРЯЕМО там, где важно.

## A. Полнота: диф против таблиц

`git diff --stat b964a235..a157b903` — 54 файла, +2932/−2064. Коммитов **10**, не 9
(`88aa656c`, `6bad9b8f`, `94caa7e0`, `54bca843`, `37da3e6d`, `eadd54b3`, `8809e450`, `6a7d1e34`,
`bafdb756`, `a157b903`).

| Утверждение отчётов | Проверка | Вердикт |
|---|---|---|
| Зона батча — `ai/flow-eval/**`, `package.json`, `.gitignore` | `git diff --name-only … \| grep -v -E '^(ai/flow-eval/\|package\.json$\|\.gitignore$)'` → **одна строка: `ai/flow-sim/README.md`** | ЧАСТИЧНО (правка задекларирована в `R-GAP-E-5.md` §4 п.3 как отклонение, но в сводной таблице «файл → смысл» строки для неё нет) |
| Случайно застейдженные вне-зонные файлы полностью убраны | `37da3e6d` захватил 11 файлов (`cli/cmd/{sdd-check,sdd-task,sdd-verify}/**`, `shared/{common,sdd}/**`); `eadd54b3` вернул 8, `a157b903` — 3. Итоговый диф по ним от базы — **пуст** | ПОДТВЕРЖДЕНО |
| Сводный отчёт: «9 коммитов» | фактически 10 | ОПРОВЕРГНУТО (правка: 10) |
| Сводный отчёт / `R-GAP-E-5`: «было 24 `.md` под `ai/flow-eval/`» | `git ls-tree -r b964a235 -- ai/flow-eval \| grep -c '\.md$'` → 27, из них 2 в `.baseline/` ⇒ **25** | ОПРОВЕРГНУТО (правка: 25; стало 7 + 2 в `.baseline/`) |
| `R-GAP-E-5` §1: «20 удалённых файлов» | `git diff --diff-filter=D … -- 'ai/flow-eval/**.md'` → **21** (перечень в отчёте верный, счётчик — нет) | ОПРОВЕРГНУТО (правка: 21) |
| `package.json`: три новых скрипта + расширенный `test:sdd-flow-eval` | диф: `results:table`, `results:table:check`, `flow-eval:docs-check`; `test:sdd-flow-eval` дополнен `ai/flow-eval/scripts/__tests__/*.test.ts` и `&& bash …/require-developer-repo.test.sh` | ПОДТВЕРЖДЕНО |
| `.gitignore`: `results/` не скрыт, `.results/` скрыт | `git check-ignore -v ai/flow-eval/results/README.md` → exit 1 (не игнорируется); `… .results/foo` → `.gitignore:52` | ПОДТВЕРЖДЕНО |

Каждый файл из `git diff --stat` имеет строку в таблицах отчётов, **кроме `ai/flow-sim/README.md`**
(есть только в `R-GAP-E-5`, нет в сводном) — правка: добавить строку в сводную таблицу.

## B. ГЛАВНОЕ — три «красных» файла: регрессии пачки НЕТ

Отчёт утверждает: `npm test` exit 1, три упавших файла, из них `inbox-review-plan` «консистентно
34/35 упавших при изолированном прогоне (не флейк, перепроверено дважды)».

**Изолированные прогоны (мои, `node --import tsx --test --experimental-test-module-mocks <файл>`):**

| Файл | Мой результат | Вердикт |
|---|---|---|
| `cli/cmd/inbox-review-plan/inbox-review-plan.test.ts` | **35/35 pass**, exit 0, 19.1 с | ОПРОВЕРГНУТО «34/35 упавших изолированно» |
| `cli/cmd/testcov/__tests__/testcov.cmd.test.ts` | **24/24 pass**, exit 0, 15.2 с | ПОДТВЕРЖДЕНО (не поломка) |
| `shared/common/sync/__tests__/deployed-surface.test.ts` | **4/4 pass**, exit 0, 6.4 с | ПОДТВЕРЖДЕНО (не поломка) |

**Полные прогоны `npm test` (мои, два подряд):** прогон 1 — 3901 тест, **0 fail, exit 0**, все три
файла зелёные; прогон 2 — **1 not ok**: `inbox-review-plan.test.ts`, `failureType:
'testTimeoutFailure'`, `error: 'test timed out after 30000ms'`. То есть падение — файловый таймаут
30 с под нагрузкой, а не провал ассертов. При 19 с изолированно запас до порога меньше двукратного.

Диагностика по пунктам задания:

1. **Падает ли на базе без изменений пачки?** Файлы не тронуты пачкой:
   `git diff b964a235..a157b903 -- cli/cmd/inbox-review-plan/ cli/cmd/testcov/ shared/common/sync/`
   пуст. Косвенный вклад пачки — 8 новых unit-файлов (`unit=234` при `topology check`, было 226).
   Я замерил каждый: 0.3–4.1 с, суммарно ~16.5 с последовательно. Для 30-секундных таймаутов
   в тяжёлом слое это не причина. **Не регрессия пачки.**
2. **`deployed-surface` — из-за новых файлов пачки или `dist/**`?** Ни то, ни другое.
   `grep -c 'flow-eval' shared/common/sync/__tests__/deployed-surface.tarball.golden.txt` → **0**:
   поставляемая поверхность вообще не содержит `ai/flow-eval/**`, поэтому ни docs, ни `results/`
   на golden не влияют. Сам golden пачкой не тронут (`git diff … -- shared/common/sync/` пуст),
   тест зелёный изолированно. **Дифф golden отсутствует — обновлять нечего.**
3. **`inbox-review-plan` после ребейза на `c9b58636`?** ДА, исчезнет из `npm test`.
   `git show c9b58636:scripts/test-topology.ts` — `EXPERIMENTAL_ROOTS` содержит
   `'cli/cmd/inbox-review-plan/'`, а `experimental` «never runs as part of
   `deterministic`/`coverage`» (D-60, PR #39). Ветка стоит на `b964a235`, то есть ДО `c640557c`.
   ПОДТВЕРЖДЕНО.
4. **`testcov`** — причина: тот же 30-секундный файловый таймаут под полным параллельным прогоном
   (`OUTER_TEST_CONCURRENCY` до 10 + внутренние подпроцессы); изолированно 15.2 с. `cli/cmd/testcov/`
   в `EXPERIMENTAL_ROOTS` НЕ входит — после ребейза останется, но останется и зелёным вне пиковой
   нагрузки.

**Вердикт B: регрессии пачки нет. Обновление golden поставляемой поверхности не требуется и было бы
неверным.** Действие: ребейз на `c9b58636` (снимает `inbox-review-plan`), остальное — ничего.

**Дополнительно, не в пользу отчёта:** `npm run check` (реальный pre-commit-гейт) у меня **красный
дважды**, exit 1, останов на `test:coverage`: прогон A — 7 not ok, прогон B (в одиночку, без
параллельной нагрузки) — 2 not ok: `cli/__tests__/tool-behavior/bootstrap-path.test.ts` и
`cli/cmd/inbox-review-plan/inbox-review-plan.test.ts`. Утверждение сводного отчёта «`npm run check`
— ALL PASS 5/5» **на моей машине не воспроизводится**; «прошли на каждом из 9 коммитов» —
НЕ ПРОВЕРЯЕМО (исторические прогоны хука). Ни один из этих файлов пачкой не тронут; `bootstrap-path`
уже фигурировал как флак в `R-PERF-test-speed.md`. Правка: снять из отчёта категоричное «5/5»,
заменить на «зелёный при прогоне без параллельной нагрузки; под нагрузкой даёт таймауты в
`bootstrap-path`/`inbox-review-plan`».

`npm run gate:sdd-check-baseline` — **exit 0**, «no error outside the baseline» — ПОДТВЕРЖДЕНО.
`npm run test:sdd-flow-eval` — **177/177, 39 suites, exit 0, `SELF-TEST: PASS`** — ПОДТВЕРЖДЕНО.

## C. Существо

### GAP-E-6 (D-62)

| Утверждение | Первоисточник | Вердикт |
|---|---|---|
| Раннер пишет сырые результаты «всегда» | `cli.ts:452` `persistDurableResult(resultsRoot, …)` внутри `for (const result of results)`, под `if (directory)`; `directory` гарантирован типом `Array<SddEvalScenario & { directory: string }>` | ПОДТВЕРЖДЕНО (по коду; живой прогон — НЕ ПРОВЕРЯЕМО) |
| Файлы: summary.json, judge.md, метрики, срез, модели, бюджет | `results-archive.ts:39-62` `SddEvalDurableSummary`: `model`, `judgeModel`, `budget{concurrency,maxObservations,observeEveryMs,stuckAfter,tailLimit}`, `actions`, `durationMs`, `usage`, `quality`, `specFiles`, `sha`; `judge.md` копируется при `options.judgeFile` | ПОДТВЕРЖДЕНО (всё в одном `summary.json`, отдельных файлов «метрик/среза» нет — по D-62 это допустимо) |
| `.gitignore` не скрывает `results/` | `git check-ignore` (см. §A) | ПОДТВЕРЖДЕНО |
| Формат PR #32 сохранён, исторические числа не потеряны | построчное сравнение `git show c9b58636:…/RESULTS.md` с HEAD: обе таблицы cloud-ios (7+7 строк) и таблица учебных проверок перенесены **байт-в-байт**, заголовки понижены на уровень, добавлена преамбула «Исторические данные … до GAP-E-6» | ПОДТВЕРЖДЕНО |
| Both-way на замороженном summary.json | `results-table.test.ts`: 8 кейсов, включая «changing a number … changes the rendered table» (74→200) и «replaces ONLY the marked region» | ПОДТВЕРЖДЕНО (отчёт пишет «7/7», фактически **8**) |
| `results:table:check` без диффа | мой прогон: `[results-table] up to date (no diff)`, exit 0 | ПОДТВЕРЖДЕНО |
| Шаблон записи в `EXPERIMENTS-LOG.md` | `EXPERIMENTS-LOG.md:6-27` (шаблон + правило append-only), генератор — `results-archive.ts:154-177` | ПОДТВЕРЖДЕНО |

**Находка C-1 (неблокирующая, но чинить).** `results-archive.ts:172` пишет в журнал
`- **Сырые данные:** \`${resultDir}\``, где `resultDir` — **абсолютный** путь (`cli.ts:326-327`:
`join(gennadyRoot ?? process.cwd(), 'ai/flow-eval/results')`, `--gennady-root`/`--results-dir`
проходят через `resolve()`). Шаблон в самом `EXPERIMENTS-LOG.md:21` обещает относительный
`ai/flow-eval/results/<дата>-<сценарий>/`. Первый же живой прогон допишет в коммиченный документ
строку вида `/Users/<имя>/…/ai/flow-eval/results/2026-…` — ровно тот класс утечки домашнего пути,
против которого написан SO-5 (его сканер это не поймает: `ai/flow-eval` вне поставляемой
поверхности). Правка: в `cli.ts` передавать `relative(gennadyRootForResults, resultDir)`, тест
`results-archive.test.ts:163-167` соответственно переписать (сейчас он фиксирует `/tmp/...`, то есть
закрепляет абсолютный путь).

### GAP-E-5 (D-46)

| Утверждение | Проверка | Вердикт |
|---|---|---|
| `docs/EVAL-SPEC.md` заменяет `09-AGENT-BRIEF.md`, части A/B по R4b | `grep '^#' EVAL-SPEC.md` → «Часть A. Для человека» (:18) / «Part B. For the agent» (:214), та же двухчастная форма, что в `_raw/research/R4b-EVAL-SPEC-draft.md` | ПОДТВЕРЖДЕНО |
| Ничего содержательного не удалено молча | извлёк все 12 удалённых `docs/*.md` + 11 журнальных из `b964a235`/`6bad9b8f`, сверил команды и пути. `npm run`-команды: потеряны только `npm run fix` и `npm run test:coverage`, оба — попутные упоминания в устаревших снимках (`j-ROADMAP.md:19`, `06-NEW-EVAL.md:87`). Пути: ни одного живого не потеряно (`reset-ticket.py` жив в `RUNBOOK.md:196-200`). Живые процедуры перенесены: swiftlint host-setup — дословно в `RUNBOOK.md:229+`; гигиена фикстуры E-16 — в `RUNBOOK.md:80-92`; wall-3 — в ledger как finding A7 с `file:line` | ПОДТВЕРЖДЕНО |
| Один словарь правил `R1`/`MIGRATION`/`R-COMPLETE` | `grep -rE '\bR[2-6]\b'` по живым докам → 3 совпадения: `EVAL-SPEC.md:41` (явная оговорка «никаких `R2`…`R6` в коде нет») и две **исторические** записи в append-only `EXPERIMENTS-LOG.md:68,72`. В коде: `quality-gate.ts` — только `R1`/`R-COMPLETE`, `cli.ts:357` — `MIGRATION` | ПОДТВЕРЖДЕНО |
| `verify-eval-docs.ts` реально проверяет каждую команду/путь, `[UNVERIFIED]`=0 не за счёт удаления ссылок | мой прогон: `OK — 2 doc(s), 14 path(s) checked, 11 npm command(s) checked, 0 [UNVERIFIED] markers`, exit 0. Независимо: из 21 уникального `ai/flow-eval/…`-пути в обоих доках несуществующих — **0** (кроме `.results/**` и глобов/плейсхолдеров, исключённых конструктивно) | ПОДТВЕРЖДЕНО по существу, с оговоркой ниже |
| `docs/README.md` ссылается на все оставшиеся доки, `results/`, `RESULTS.md` | `docs/README.md` **удалён**; индексом стал корневой `ai/flow-eval/README.md` — линкует EVAL-SPEC, RUNBOOK, ledger, EXPERIMENTS-LOG, RESULTS, `results/README.md`; все ссылки резолвятся | ПОДТВЕРЖДЕНО по существу (формулировку приёмки надо читать как «корневой README») |

**Находка C-2 (блокирующая, 1 строка).** Приёмка `GAP-E-5` требует «висячих ссылок нет»,
`R-GAP-E-5.md` §3 утверждает «grep на имена удалённых файлов по всему репо — 0 совпадений».
**ОПРОВЕРГНУТО:** `ai/flow-eval/docs/journal/RESULTS.md:111` —
`… — в [`PROGRESS-REPORT.md`](./PROGRESS-REPORT.md).`, а `docs/journal/PROGRESS-REPORT.md` удалён
коммитом `37da3e6d`. Это единственная висячая ссылка во всём корпусе (проверил все 9 живых `.md`
резолвом каждой markdown-ссылки относительно файла и корня). Почему механика не поймала:
`verify-eval-docs.ts:131` по умолчанию проверяет **только** `EVAL-SPEC.md` и `RUNBOOK.md`;
`RESULTS.md`, `EXPERIMENTS-LOG.md`, ledger и корневой `README.md` вне его области.
Правка: убрать/переписать строку 111 (содержание PROGRESS-REPORT свёрнуто в раздел «Что дали
провалы на cloud-ios» прямо над ней) и добавить эти файлы в дефолтный список `parseArgs`.

**Находка C-3 (неблокирующая).** Единая спека противоречит сама себе и D-28: `EVAL-SPEC.md:93` —
«исчерпанный бюджет наблюдений автоматически даёт `fail` независимо от качества работы», тогда как
`EVAL-SPEC.md:265` (часть B), `RUNBOOK.md:105-106` и `results-archive.ts:31-36` фиксируют отдельный
исход `budget-exhausted`. Правка: в части A назвать `budget-exhausted` и сослаться на D-28.

**Находка C-4 (неблокирующая).** `verify-eval-docs.ts` разбирает только inline-код в обратных
кавычках; пути внутри ``` -блоков и любые спаны с пробелом/`$`/`<>` (например
`ai/flow-eval/operator-approve.sh <sandbox>`) не проверяются вовсе. Отсюда «14 path(s) checked» при
21 упомянутом. Я проверил остаток вручную — стального ни одного, но формулировку отчёта «каждая
команда и путь проверены» стоит смягчить до «каждый inline-путь и каждая `npm run`-команда».

### GAP-E-4

Три названных литерала `migration-eval.sh:13,16,21` базовой версии — `GEN_ROOT` (авторский
worktree), `SCENARIO` (`/private/tmp/claude-503/…/mig-cloud-ios.json` чужой сессии), `FX` (без
env-override) — заменены на: вычисление от `SCRIPT_DIR` (`:18`), репо-committed
`ai/flow-eval/scenarios/migration-cloud-ios.scenario.json` с плейсхолдером `__FX__` и
`render_scenario()` (`:24,:41-46`), `FX="${FX:-$HOME/…}"` (`:31`). То же в `roundtrip-eval.sh`
(`GEN_ROOT`, `RT`) и `session-metrics.py` (`DB`/`GEN`/`LEDGER` через `os.environ.get`).
ПОДТВЕРЖДЕНО. Оговорка: `REPO="${REPO:-/Users/k.lebedev/Developer/cloud-ios}"` — литерал авторской
машины — остался в обоих скриптах; вне названных строк, env-переопределяем и прикрыт
`require-developer-repo.sh` с внятным сообщением, но формулировка сводного отчёта «больше не зашиты
на машину автора» шире факта.

**Находка C-5 (блокирующая как расхождение отчёта с приёмкой).** Строка доски `61 §1` для `GAP-E-4`
называет зоной **`scripts/test-topology.ts:19`** и критерием — «`require-developer-repo.test.sh`
**виден гейту**». Фактически шелл-тест подключён только к `npm run test:sdd-flow-eval`, который не
вызывается ни `npm test`, ни `npm run check`, ни хуками `scripts/git-hooks/{pre-commit,pre-push}`
(проверил их содержимое). Коммит `88aa656c` это **честно объявляет** («test-topology.ts is
explicitly out of this batch's zone … the shell test is not yet wired into the top-level `npm test`»),
а `R-GAP-E-4.md` §3 ставит «ВЫПОЛНЕНО», §4 — «Отклонений нет». Правка: перенести дисклеймер из
коммита в отчёт, статус — «ВЫПОЛНЕНО частично», и вынести остаток (`test-topology.ts`) в открытый
вопрос оператору. Заметно, что `ai/flow-eval/` входит в `UNIT_ROOTS` (`test-topology.ts:41`), то есть
все 13 `.ts`-тестов харнесса в главном гейте — не в гейте только `.test.sh`.

### E-16, GAP-E-1b, E-11, E-15, GAP-E-2

| Пункт | Проверка | Вердикт |
|---|---|---|
| E-16: `git status --porcelain` пуст после тестов | после всех моих прогонов (`npm test` ×2, `check` ×2, `test:sdd-flow-eval`, 11 изолированных) — **пусто** | ПОДТВЕРЖДЕНО |
| E-16: тест на секреты | `check-fixture-hygiene.test.ts` 6/6 both-way: чистое дерево, драйф, `.netrc`, вложенный `sub/credentials.json`, ложноположительный `CredentialsStoreImpl.swift`, usage-ошибка exit 2 | ПОДТВЕРЖДЕНО |
| E-16: «абсолютные пути» | скрипт проверяет только драйф и классы секретов; проверки абсолютных путей в нём нет — её и не было в критерии доски `61:205` | ПОДТВЕРЖДЕНО (критерий доски выполнен; см. C-1 про абсолютный путь в журнале) |
| GAP-E-1b: SSE both-way | `evidence-events.test.ts` 5/5 на локальном `node:http`-SSE: непустой поток → ровно те типы; пустой → `[]`; изоляция по `sessionId`; observer `waiting=true/false` | ПОДТВЕРЖДЕНО |
| E-11: go-фикстура both-way | `golang-slugify-golden.test.ts` 4/4: ACCEPT reference, REJECT wrong, REJECT missing, корень остаётся buildable. Гард `goAvailable()` корректно скипает без `go` на PATH | ПОДТВЕРЖДЕНО |
| E-15: замок маршрутизации both-way | `routing-lock-v1-go.test.ts` 4/4; негатив — мутация текста директивы по якорю условия (не по номеру строки) с assert’ом, что якорь найден (не вакуумная мутация); `go.mod` → `golang`, без него → `null` | ПОДТВЕРЖДЕНО |
| GAP-E-2: бюджеты по фазам сверены с `scenarios.json` | `gap-e2-budget-table.test.ts` 3/3; все 5 фаз из `scenarios.json` (`spec-authoring`, `scaffold`, `execute`, `repair`, `task`) покрыты строками таблицы `RUNBOOK.md:98-102`, плюс отдельная строка `migration` | ПОДТВЕРЖДЕНО с оговоркой: тест проверяет **легальность** чисел (`integer >= 1` по `runner.ts`) и покрытие фаз, но не сами числа — «сверка с фактическими лимитами» в этом объёме и возможна, раннер верхнюю границу не enforce-ит (сам `RUNBOOK.md:104` это говорит) |

## D. Регрессии и пересечения

- `test:sdd-flow-eval` — **177/177**, 39 suites, exit 0 (заявлено 177/177 — ПОДТВЕРЖДЕНО).
- `check` 5/5 — **ОПРОВЕРГНУТО** на моей машине (см. §B).
- `gate:sdd-check-baseline` — OK, exit 0 — ПОДТВЕРЖДЕНО.
- `git merge-tree a157b903 X` — **0 конфликтов** для: `origin/codex/sdd-v2-rc52-followup` (`c9b58636`),
  `lead/verify-stacks` (rc-w2), `lead/spec-authoring` (rc-w3), `lead/phase-agent-bounds` (PR #38),
  `lead/journal-round` (PR #40).
- Пересечения по файлам: единственное — `package.json` с `lead/verify-stacks`, и то в другой секции
  (`exports./stack` против блока `scripts`) — сливается чисто. `.gitignore` не пересекается ни с кем.

## E. Сводный отчёт-черновик PR

Понятен без кодов задач: вступление объясняет, что такое эвал и какие три проблемы чинятся, — да.
Таблицы «файл → смысл» и «док → судьба» есть; вторая полна (все 21 удалённый файл имеют строку),
первая — без строки для `ai/flow-sim/README.md`. Открытые вопросы названы честно и по существу
(счёт 19→4, выбор ветки в E-15, неподключённая go-фикстура, процедурная ошибка с `git add -u`).

**Mermaid «прогон → сырые данные → таблица/журнал» — одна стрелка неверна.** Ребро `B --> E`
(«runner → `appendExperimentLogStub`») реального вызова не соответствует: `appendExperimentLogStub`
вызывается из `cli.ts:465` и **только внутри `if (resultDir)`**, то есть зависит от успеха узла C
(`persistDurableResult`), а не от B. Правка: `C --> E` (или `D --> E`). Остальные рёбра сверены и
верны: `A→B` (`cli.ts` → `SddEvalRunner`), `B→C` фактически `cli.ts:452`, `C→D` (`results-archive.ts:97-110`),
`E→F` (`:175`), `D→G` (`results-table.ts` через `readAllDurableSummaries`), `G→H` (`:110-143`
splice в маркеры `RESULTS.md:16,22`).

Прочие числовые правки к отчётам: «9 коммитов» → 10; «24 `.md`» → 25; «20 удалённых» → 21;
`results-table.test.ts` «7/7» → 8/8.

## Итог

**Блокирующее (2, обе дешёвые):**
1. **C-2** — висячая ссылка `ai/flow-eval/docs/journal/RESULTS.md:111` → удалённый
   `PROGRESS-REPORT.md`. Прямо нарушает приёмку `GAP-E-5` («висячих ссылок нет») и опровергает
   утверждение `R-GAP-E-5` §3 о нулевом grep. Чинится одной строкой + расширением дефолтного списка
   в `verify-eval-docs.ts:131`.
2. **C-5** — критерий `GAP-E-4` «`require-developer-repo.test.sh` виден гейту» не выполнен в том
   смысле, в каком записан на доске (зона включала `scripts/test-topology.ts`), при этом
   `R-GAP-E-4.md` §4 говорит «Отклонений нет», хотя коммит `88aa656c` отклонение объявляет.
   Блокирует не код, а **отчёт**: правка формулировки + открытый вопрос оператору.

**Неблокирующее (правки без переоткрытия задач):** C-1 (абсолютный путь в автозаписи
`EXPERIMENTS-LOG.md` — стоит починить до первого живого прогона), C-3 (часть A спеки против D-28 по
`budget-exhausted`), C-4 (охват `verify-eval-docs.ts` уже, чем формулировка), неверное ребро
`B --> E` в mermaid, отсутствующая строка `ai/flow-sim/README.md` в сводной таблице, четыре
числовые правки, снятие категоричного «`npm run check` — ALL PASS 5/5», сужение фразы «раннеры
больше не зашиты на машину автора» (`REPO` остался литералом).

**Подтверждено:** полнота дифа и полная очистка 11 вне-зонных файлов; `results/` в git и
`.results/` в gitignore; постоянная запись на сценарий со всеми полями D-62; сохранность
исторических чисел PR #32 байт-в-байт; both-way генератора таблицы и freshness-гейт;
единый словарь правил `R1`/`MIGRATION`/`R-COMPLETE`; отсутствие потерянных живых фактов из 21
удалённого документа; три мёртвых литерала `migration-eval.sh` устранены; both-way E-16, GAP-E-1b,
E-11, E-15, GAP-E-2; `test:sdd-flow-eval` 177/177; `gate:sdd-check-baseline` OK; ноль конфликтов
с RC-головой и четырьмя параллельными ветками.

**Три красных файла: регрессии пачки НЕТ.** Все три зелены изолированно (35/35, 24/24, 4/4) и в
одном из двух моих полных прогонов `npm test` — зелены все; падение — файловый таймаут 30 с под
параллельной нагрузкой. Golden поставляемой поверхности пачкой не затронут и не содержит
`ai/flow-eval` — **обновлять его не надо и не следует**. Действие: **ребейз на `c9b58636`**, после
которого `inbox-review-plan` уходит в слой `experimental` (D-60) и из `npm test` исчезает;
`testcov`/`bootstrap-path`/`deployed-surface` — известная нагрузочная хрупкость, отдельная задача
трека 33/31 (не этой пачки).

**Рекомендация: PR после правок** — две блокирующие правки (одна строка в `RESULTS.md` + честная
формулировка в `R-GAP-E-4.md`/сводном отчёте), затем ребейз на `c9b58636` и пуш. Возвращать пачку
исполнителю не нужно: по существу все восемь задач выполнены и доказаны.
