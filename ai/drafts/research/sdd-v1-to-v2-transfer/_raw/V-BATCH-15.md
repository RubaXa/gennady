ВЕРИФИКАЦИЯ — Пачка 15 «Реопен, блокер и готовность к работе считаются по причине» (V-BATCH-15)

Проверяющий: `plan-verifier` (свежие глаза). Дерево: `rc-v6`, ветка `lead/reopen-by-cause`, база `fcdba417` (голова PR #40), голова `f2c64a56`. Рабочее дерево чистое, 5 коммитов ровно в заявленном порядке и с заявленными `--stat` (8 / 6 / 8 / 11 / 3 файла — сверено покоммитно).
Метод: каждое утверждение отчёта → команда/строка первоисточника → вердикт. Все числа пересчитаны скриптом на свежесобранном `dist/`; связи «стрелка mermaid = реальный вызов» сверены по `file:line`; каждая связка дополнительно проверена **мутацией** (отвязать → упадёт ли замок).

**ВЕРДИКТ: ПРИНЯТЬ С ПРАВКАМИ.** Ядро пачки сделано и подтверждено на реальном тикете, не на синтетике. Но заголовок «…и **готовность к работе** считаются по причине» достигнут не полностью: `sdd-task` — та самая поверхность готовности — новую резолюцию блокера не видит, а две обещанные приёмкой опоры (замок на связку `check.ts` ↔ `## Blocker Trail`; гейт «каждый кирпич подключён») в дереве отсутствуют. Все три правки мелкие.

---

## A. Полнота и достоверность отчётов

`git diff --stat fcdba417..HEAD` → **29 файлов, +965/−115**. Каждый из 29 файлов имеет строку в таблице «файл → смысл» одного из отчётов — пропусков нет (сверено механически, включая 4 удаления и 8 build-output).

Зона: `shared/sdd/**`, `cli/cmd/sdd-log/**`, `ai/kit/**`, `ai/directives/**`. Запретные зоны чисты: `specs/**` — 0 файлов (Usage Waiver не потребовался, что отчёт заявляет и что подтверждается), `ai/flow-eval/**`, `cli/cmd/sync*`, `shared/verify/**` — 0.

Мои прогоны (все — на `rc-v6`, после `npm ci` + `npm run build`):

| Команда | Мой результат | Отчёт | Вердикт |
|---|---|---|---|
| `npm test` | `# tests 3726 / pass 3716 / fail 0 / skipped 10`, exit 0 | то же | ПОДТВЕРЖДЕНО |
| `node dist/gennady.js sdd-check --all . --format json` | **192 error / 1034 warn / 212 files** | то же | ПОДТВЕРЖДЕНО |
| `npm run gate:sdd-check-baseline` | `OK — no error outside the baseline (227c03a8, rc-baseline-1)`, exit 0 | то же | ПОДТВЕРЖДЕНО |
| `npm run check:directives-fresh` | `✓ matches a fresh rebuild`, exit 0 | то же | ПОДТВЕРЖДЕНО |
| `npm run audit:sdd-templates` | все 5 под-аудитов ✓ clean, exit 0 | то же | ПОДТВЕРЖДЕНО |
| `npm run build:directives` | `⚠ 35 dangling axiom(s)` | «было 36 → стало 35» | **ОПРОВЕРГНУТО**, см. F-5 |

---

## B. Заголовок пачки по существу

### B.1 Реопен связан с породившей находкой — ПОДТВЕРЖДЕНО на реальном тикете

`node dist/gennady.js sdd-check --task tasks/vcs/vcs-client/vcs-client.task-71.md`:

```
warn: SDD_REOPENS_MISMATCH  Meta Reopens: 0, но `## Audit Rounds` содержит 1 запись(ей) с triggered-reopen≠none …
warn: SDD_REOPENS_PENDING   Audit Round 1 объявил triggered-reopen=Round-2, но Round 2 ещё не создан …
```

Первоисточник в тикете: `vcs-client.task-71.md:13` (`- **Reopens:** 0`), `:161` (`@audit … triggered-reopen=Round-2 status=FAIL`), `:126` (единственный `### Round 1`). Это ровно сценарий issue #13, пойманный на живом корпусе. Механика: `shared/sdd/execution-log.ts:635` `parseAuditRounds`, `:668` `META_REOPENS_RE`, находки — `shared/sdd/check.ts:441-471` (`#region START_REOPENS`). Стрелки mermaid из `R-B2-06` соответствуют коду (одна неточность в номере строки — F-5).

Both-way по букве приёмки 40-doc §5.1 («`Reopens: 0` → finding; `Reopens: 1` → чисто») закрыт `shared/sdd/__tests__/log-vocabulary-eval.test.ts:112,126` (группа 3 TRIGGER/CLEAN на одном и том же тикете) — ПОДТВЕРЖДЕНО. Мутация M3 (обнулить `parseAuditRounds` в `check.ts`) роняет 3 теста — замок есть.

Закрытый словарь причин раунда работает: `sdd-log … round "because I said so"` → `ERR_CLI_SDD_LOG_BAD_INVOCATION` (`cli/cmd/sdd-log/sdd-log.cmd.ts:476`).

### B.2 `## Blocker Trail` пишется sdd-log и читается sdd-extract — ПОДТВЕРЖДЕНО; читается sdd-task — **ОПРОВЕРГНУТО**

Синтетика both-way, прогнана мной end-to-end на настоящем CLI (тикет `tasks/probe/probe.task-1.md` во временном дереве):

1. `sdd-log … blocker --payload-file … --phase P1` → `- 🛑 … BLOCKED: upstream API unavailable`;
2. `sdd-log … close` → раунд закрыт, `status → DONE`;
3. `sdd-check --task` **до** снятия → `error: SDD_DONE_WITH_ACTIVE_BLOCKER`, 1 error;
4. `sdd-log … resolved "token provisioned by operator" --phase P1` **после закрытия раунда** → успех (старый тупик `ERR_CLI_SDD_LOG_PHASE_NOT_OPEN` исчез), запись `- [x] \`…\` ✅ RESOLVED (Round 1 / P1): …` в новой секции `## Blocker Trail`;
5. `sdd-check --task` **после** → `✅ clean — 1 file(s) checked`, exit 0;
6. повторный `resolved` → `ERR_CLI_SDD_LOG_NO_ACTIVE_BLOCKER`, exit 2.

`sdd-extract tasks/probe/probe.task-1.md#blocker-trail` → возвращает строку резолюции, exit 0. Анкор из строки доски B2-19 работает «из коробки» (`shared/sdd/section.ts:115` `extractHeadingSection` резолвит любой slug) — кода не требовалось, но ни один отчёт этого не проверил и ни один тест этого не запирает (см. остатки).

**А вот `sdd-task` расходится с `sdd-check` на одном и том же тикете** — см. F-1.

### B.3 Семь кирпичей B2-18 — перечислены и разобраны, ПОДТВЕРЖДЕНО; гейт — **ОПРОВЕРГНУТО**

Состояние после пачки проверено независимо: под `ai/kit/contract/process/**` **не осталось ни одного неподключённого файла** (перебор всех `contract/**` × grep включения в `ai/kit/templates`). Три оставленных подключены ровно по одному разу (`blocker-format`, `phase-block-format`, `return-summary-format`), четыре удалены и **не имеют ни одной живой ссылки** в репозитории (единственное совпадение — прозаический пример в комментарии `ai/kit/audit-contract-activation.mjs:70`, безвредно, но слегка устарело).

Но обещанный «гейт «каждый кирпич подключён»» отсутствует — см. F-3.

### B.4 Словарь журнала E-05 — 4 группы both-way, ПОДТВЕРЖДЕНО

`shared/sdd/__tests__/log-vocabulary-eval.test.ts` — 4 `describe` × TRIGGER/CLEAN = 8 тестов, все через `checkTicket`/`nextRoundNumber` на полных синтетических тикетах. Мутация M2 (убрать вызов `unknownTokenLines` из `check.ts:432`) роняет 1 тест — замок есть.

---

## C. +378 предупреждений — разложение и оценка честности сигнала

Разложение по кодам — мой per-finding подсчёт из `--format json` (не из отчёта):

| код | +N | файлов | оценка |
|---|---|---|---|
| `SDD_EXECUTION_LOG_UNKNOWN_TOKEN` | **374** | **26** | честный сигнал о нарушении грамматики, но **у 286 из 374 неверный код и неверное сообщение** — см. F-4 |
| `SDD_REOPENS_MISMATCH` | 3 | 3 | реальные расхождения (`agent-inbox.task-162`, `agent-inbox.task-166`, `vcs-client.task-71`) |
| `SDD_REOPENS_PENDING` | 1 | 1 | реальное (`vcs-client.task-71`) |
| **итого** | **378** | | новых **error** — 0 |

Арифметика сходится: 1034 − 378 = 656 = база `fcdba417` из отчёта.

**Проверка на конкретных тикетах** (требование «3–5 случайных»):

| тикет:строка | строка журнала (сокр.) | что на самом деле |
|---|---|---|
| `agent-inbox.task-159.md:174` | `- [x] 2026-08-06T12:15:00Z decision priority_tiers = …` | токен `decision` — **легальный**; дефект — таймстамп без backticks |
| `mr-stats.task-139.md:319` | `- [x] 2026-07-18T22:50:00Z intro MrStatsOutcome, …` | токен `intro` — **легальный**; тот же дефект |
| `agent-inbox.task-156.md` (30 находок; максимум — `agent-inbox.task-160.md`, 63) | `- [x] 2026-08-06T09:00:48Z intro EventJournal ← …` | то же |
| `cli-testcov.task-66.md:182` | `- [x] \`2026-06-07\` port \`coverage-tree.ts\` → …` | таймстамп в backticks, токен `port` — **действительно вне словаря**, находка честная |
| `agent-inbox.task-157.md` | `- [x] \`2026-08-08T00:26:00Z\` wire BootReadiness …` | то же, честная |

Итог: **допустимо по L-3/D-39** (все 374 строки действительно отклоняются от канонической грамматики; никакие v1-данные не чистились ради зелёного, гейт остался зелёным по ошибкам), но код/текст находки для 76 % случаев неверны — F-4.

**`gate:sdd-check-baseline` смотрит только на ошибки — ПОДТВЕРЖДЕНО** первоисточником: `ai/flow-eval/scripts/sdd-check-baseline-compare.ts:58` (`@invariant Only error-severity findings can fail the gate; any warning — known or new — never does`), `:71`, `:76`; шапка `sdd-check-zero-new-error.ts:3-5`.

**Порога по предупреждениям в плане нет.** Грепом по всем документам плана — ни «порог/бюджет предупреждений», ни аналога; `ai/flow-eval/.baseline/README.md:7-8` прямо говорит, что голый счёт (198/431) записан, но **не является критерием**. При этом warn уже вырос 431 → 1034 (+139 % от среза `rc-baseline-1`), из них +378 — эта пачка. Рекомендация — в остатках.

---

## D. Регрессионные замки — мутационная проверка

Каждая связка отвязана в отдельном временном дереве и прогнана:

| мутация | что отвязано | результат | вердикт |
|---|---|---|---|
| M1 | `check.ts:383-390` → `hasActiveBlocker(logSec.content)` (без Blocker Trail) | **217/217 pass, fail 0** | **ЗАМКА НЕТ** — F-2 |
| M2 | `check.ts:432` перестаёт звать `unknownTokenLines` | 216/217, fail 1 | замок есть |
| M3 | `check.ts:444` перестаёт звать `parseAuditRounds` | 214/217, fail 3 | замок есть |
| M4 | `phase-execution-protocol.directive.hbs` теряет `contract/process/blocker-format` | `audit:contracts` ✓ clean, exit 0; ловит только `check:directives-fresh` (и то как «забыл пересобрать») | **ГЕЙТА НЕТ** — F-3 |
| M4b | в `ai/kit/contract/process/` добавлен новый файл, не включённый ниоткуда | `audit:contracts` exit 0, `build:directives` exit 0, `check:directives-fresh` exit 0 | **ГЕЙТА НЕТ** — F-3 |
| M5 | `audit.directive.hbs` теряет `axiom/audit/ax-stale-after-pivot-verification` | `✗ 5 undefined axiom reference(s)`, `build:directives` **exit 1** | замок есть (T-B6-17 защищён) |

Прогон в M1–M3: `check.test.ts`, `log-vocabulary-eval.test.ts`, `reopens.test.ts`, `check-round-close.test.ts`, `sdd-log.cmd.test.ts`, `sdd-task.cmd.test.ts` (217 тестов).

---

## E. Отклонения исполнителя — оценка

| отклонение | оценка |
|---|---|
| **E-05 вышел за «синтетические тикеты»** и добавил продакшен-код (`unknownTokenLines` + вызов) | **правомерно**. Группа 1 действительно не имела механической проверки; оба файла в общей «Зоне» пачки. Без этого «4 both-way группы» невыполнимы честно. Заявлено открыто. |
| **Новый код `SDD_EXECUTION_LOG_UNKNOWN_TOKEN`** | **правомерно по составу** (31-doc §3.4 прямо перечисляет `unknown-token` среди отсутствующих, владелец — B2-03; разрыв на границе задач починен здесь). Severity `warn` — по L-3. Претензия только к диагностике — F-4. |
| **`AX_BLOCKER_ESCALATION` подключён попутно (B2-18)** | **правомерно по смыслу, но конфликтует с PR #38**, который подключает тот же аксиом в тот же `<BeliefState>` вместе с `H_BLOCKED` и владеет темой границ фазового агента. Слияние даёт реальный конфликт — см. G. |
| **Миграция legacy `✅ RESOLVED` не сделана** | **сужение приёмки строки доски**: `61-TASK-BOARD.md:90` называет `migration-v1-v2.directive.xml` в файлах и «миграционную фикстуру» в «Чем доказываем». Обратная совместимость чтения доказана (`check-round-close.test.ts`, DA-lazy-asm 11/11), релиз это не блокирует (D-39 требует миграции корпуса от E-14, а не от B2-19). → остаток для доски. |
| **`scanBlockerTrail` в `sdd-task` не обновлён** | **НЕ просто «известный побочный эффект»**: это и есть «готовность к работе» из заголовка пачки — F-1, блокирующее. |
| **Severity `SDD_REOPENS_MISMATCH` = warn, хотя `62-BATCH-QUEUE.md` пишет «расхождение — ошибка», а `31-TRACK-CHECK-LOG.md:525` — `error`** | **правомерно по L-3** («вариант 2: warn сейчас, error после инвентаризации долга — B2-15 + golden DA-lazy-asm»), и согласовано с прецедентом соседних кодов. Политика 31-doc:529 («новые коды — error только на receipt-aware тикетах, на legacy — warn») тоже не нарушена. Но текст очереди говорит «ошибка» — нужен явный ОК оператора, иначе через полгода это прочтут как невыполненную приёмку. |

---

## F. Находки

### F-1 — БЛОКИРУЮЩЕЕ. `sdd-task` не видит снятие блокера через `## Blocker Trail`: два инструмента дают противоположный вердикт

`cli/cmd/sdd-task/sdd-task.cmd.ts:422` — `const activeBlockers = logSec.status === 'ok' ? scanBlockerTrail(logSec.content) : [];` — вызов **одним аргументом**, `blockerTrailBody` не передан. Результат уходит в `formatPlan` (`:553`) и определяет и секцию `[BLOCKERS]` (`sdd-task.types.ts:171-176`), и завершающую строку-подсказку оркестратору (`:184`).

Воспроизведение (после шага 4 сценария B.2, на одном и том же файле):

```
Blocker Trail section present: ok
sdd-task.cmd.ts:422 (one arg)  -> active blockers: 1
[ '- 🛑 `2026-09-10T13:47:34.170Z` BLOCKED: upstream API unavailable' ]
check.ts (two args)            -> active blockers: 0
[]
```

То есть `sdd-check --task` говорит `✅ clean`, а `sdd-task` в тот же момент печатает `blockers: ACTIVE 1` и подсказку «сначала сними блокер». Пока агент пользуется старым инлайновым форматом — расхождения нет; как только он выполнит инструкцию новой директивы (`sdd-log resolved`, B2-18 её как раз и прописал фазовому агенту) — тикет становится вечно «не готов к работе». Это прямое опровержение третьей трети заголовка пачки.

**Правка** (3 строки, зона — файл, который пачка и так задевает по смыслу):
```ts
const blockerTrail = extractHeadingSection(content, 'blocker-trail');
const activeBlockers = logSec.status === 'ok'
  ? scanBlockerTrail(logSec.content, blockerTrail.status === 'ok' ? blockerTrail.content : '')
  : [];
```
плюс тест в `cli/cmd/sdd-task/__tests__/sdd-task.cmd.test.ts`: тикет с закрытым 🛑 в логе и ✅ в `## Blocker Trail` → `blockers: none`.

### F-2 — БЛОКИРУЮЩЕЕ. Связка `check.ts` ↔ `## Blocker Trail` не залочена ни одним тестом

Мутация M1: возврат `check.ts:383-390` к однoаргументному `hasActiveBlocker(logSec.content)` оставляет **217/217 тестов зелёными**. `R-B2-19.md` §1 приводит в колонке «Чем доказано» строку «`check.test.ts` (94/94 зелёных без правок в существующих кейсах)» — это доказательство **отсутствия** замка, а не наличия связи: ни один кейс не подаёт `## Blocker Trail` в `checkTicket`. Центральная связка пачки может быть молча отменена любым будущим рефакторингом.

**Правка:** в `shared/sdd/__tests__/check.test.ts` — both-way пара: (а) 🛑 в закрытом раунде + ✅ с обратной ссылкой `(Round N / P<M>)` в `## Blocker Trail` → нет `SDD_BLOCKER_OPEN`/`SDD_DONE_WITH_ACTIVE_BLOCKER`; (б) тот же тикет без секции Blocker Trail → находка присутствует.

### F-3 — БЛОКИРУЮЩЕЕ (по букве приёмки). Гейта «каждый кирпич подключён» не существует

`62-BATCH-QUEUE.md` §Пачка 15 и `61-TASK-BOARD.md:89` называют «Чем доказываем» для B2-18 именно **гейт**. Фактически поставлена разовая ручная уборка. Проверено мутацией M4b: новый файл `ai/kit/contract/process/verifier-orphan-probe.xml`, не включённый ни одним шаблоном, проходит `audit:contracts` (exit 0, «✓ clean»), `build:directives` (exit 0) и `check:directives-fresh` (exit 0). Причина видна в шапке `ai/kit/audit-contract-activation.mjs:4-12`: аудит делает две проверки — «included → activated» и «mentioned → available», но не «file exists → included». `check:directives-fresh` ловит только «забыл пересобрать»: удалить include **и** пересобрать — снова всё зелёное (M4).

**Правка (вариант A, предпочтительный):** PART 3 в `ai/kit/audit-contract-activation.mjs` — перечислить `ai/kit/contract/**/*.xml`, для каждого проверить наличие `{{> "contract/<dir>/<name>"}}` хотя бы в одном шаблоне, с сокращающимся allowlist по образцу `KNOWN_DANGLING_AXIOM_REFS` (сейчас в него попадут ровно два известных сироты: `contract/uikit/spec-structure`, `contract/critic/oc-structured`). Это ровно тот «обратный отчёт defined-but-never-included-in-a-template», которого требует `20-ISSUES-VERDICTS.md:318`.
**Вариант B:** оператор явно снимает слово «гейт» с приёмки B2-18 и заводит его отдельной задачей.

### F-4 — НЕБЛОКИРУЮЩЕЕ (major). 286 из 374 новых предупреждений несут неверный код и неверное сообщение

`shared/sdd/execution-log.ts:507` (`parseLogEvent`): при отсутствии backtick-обёртки таймстампа `ts === null`, а `token` становится **самим таймстампом**. `unknownTokenLines` (`:124-138`) считает такую строку нарушением словаря, и `check.ts:432-437` печатает `Checked event line opens with a token outside the closed vocabulary: "<line>"`.

Мой подсчёт по всем 374 находкам (классификация по `^- \[x\] \`ts\` <token>`):

| класс | N | что реально не так |
|---|---|---|
| таймстамп **в** backticks, первое слово вне словаря | **88** | честное нарушение словаря (`sync` 9, `wire` 7, `remediation:` 6, `Reconcile` 5, `impl` 4, `port`, `созданы`, …) |
| таймстамп **без** backticks | **286** | грамматика штампа; при этом в 268 случаях настоящий токен **легален**: `ver` 75, `intro` 63, `DONE` 52, `decision` 30, `discovery` 16, `tried` 9, `insight` 6 |

Сигнал честный (строка действительно не соответствует грамматике `PHASE_BLOCK_FORMAT`), но диагноз ложный: инженеру, который пойдёт чинить долг, инструмент скажет «выдумал токен» там, где токен канонический. Цена вырастет при флипе L-3 → error (B2-15/B2-20): 286 ошибок окажутся под неправильным кодом, а инвентаризация долга — искажённой.

**Правка:** различать два случая в `unknownTokenLines`/`check.ts` — при `e.ts === null && e.token !== null` выдавать отдельный код (напр. `SDD_EXECUTION_LOG_TIMESTAMP_UNQUOTED`, warn) или как минимум сообщение «timestamp is not backtick-wrapped, so the first word after `- [x]` is read as the token» с показом ожидаемой грамматики. Обе ветки — both-way тестами в `log-vocabulary-eval.test.ts` (группа 1 уже есть, добавить пару).

### F-5 — НЕБЛОКИРУЮЩЕЕ. Числовые доказательства в отчётах не воспроизводятся

1. **«dangling 36 → 35»** (`R-T-B6-17.md` §3.1 и `R-B2-18.md` §5.2) — **ОПРОВЕРГНУТО**. Прогон `build:directives` на `HEAD` → `⚠ 35 dangling axiom(s)`; тот же прогон после `git checkout fcdba417 -- ai/kit ai/directives` → **тоже 35**. Метрика «defined in BeliefState, referenced by no step» этой пачкой не менялась (T-B6-17 даёт −1 включением+ссылкой в `STEP_1_MECHANICAL`, B2-18 даёт +1 двумя аксиомами, из которых оба отреферены в шагах; нетто 0). Настоящее доказательство T-B6-17 — другое и оно сильнее: при отвязке `build:directives` даёт `✗ 5 undefined axiom reference(s)` и **exit 1** (мутация M5). Заменить строку доказательства.
2. **Разложение `SDD_EXECUTION_LOG_UNKNOWN_TOKEN`** (сводный отчёт): заявлено «272 записи без backtick / 102 free-text, 31 файл»; измерено — **286 / 88, 26 файлов**. Заменить.
3. `R-B2-06.md` §2 mermaid: `parseAuditRounds (execution-log.ts:~565)` — фактически `:635`.

### F-6 — НЕБЛОКИРУЮЩЕЕ (low). `SDD_REOPENS_MISMATCH` молчит при отсутствии `## Audit Rounds`

`shared/sdd/check.ts:445` — вся ветка под `if (auditRounds.length > 0)`. Тикет с `- **Reopens:** 3` и без секции `## Audit Rounds` не диагностируется; поведение зафиксировано тестом `reopens.test.ts:129` как ожидаемое. Обратная (переобъявленная) нечестность остаётся невидимой. Сознательный выбор, но его стоит записать как известное ограничение при флипе на error в B2-20.

### F-7 — ИНФО. Мелочи

- `ai/kit/audit-contract-activation.mjs:70` — прозаический комментарий по-прежнему приводит `SIDE_DIVE_FORMAT` как пример; файл удалён B2-18.
- `oldestActiveBlockerRound` (`execution-log.ts:199-233`) не сбрасывает `phase` на границе `### Round N`: строки между заголовком раунда и его первым `#### P<N>` атрибутируются последней фазе предыдущего раунда. На тикетах из скелета недостижимо; фиксирую как известный край.
- `--phase` для `resolved` обязателен (`sdd-log.cmd.ts:245`) — риска пустой обратной ссылки `(Round N / )` нет. ПОДТВЕРЖДЕНО.

---

## G. Конфликты с соседними ветками

Метод: `git merge-tree --write-tree --name-only HEAD origin/<branch>` из `rc-v6` (без изменения веток), плюс пересечение множеств файлов.

| PR | ветка | конфликт | природа |
|---|---|---|---|
| **#38** (пачка 17) | `lead/phase-agent-bounds` | **ДА**: `ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs`, `ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_2_IMPLEMENT.xml` | смысловой: **обе пачки подключают `{{> "axiom/process/ax-blocker-escalation"}}` в один и тот же `<BeliefState>`**; #38 вдобавок вносит `ax-permitted-bash-commands` и halt `H_BLOCKED`, завязанный на тот же аксиом, и правит текст `STEP_2_IMPLEMENT`/`STEP_3_VERIFY`, куда пачка 15 вставила `<ToolCall>` для `sdd-log line`/`blocker`. **Резолюция:** взять `<BeliefState>` и `<HaltConditions>` из #38 (владелец темы границ и остановки), сохранить из пачки 15 строку `<Contracts>` (4 контракта) и прозу+`<ToolCall>` в STEP_2/STEP_3; `ax-blocker-escalation` оставить **в одном** экземпляре; затем `npm run build:directives` и `check:directives-fresh`. |
| **#41** (пачка 19) | `lead/spec-authoring` | **ДА**: `ai/kit/lint-axioms.ts` | одна и та же строка allowlist: пачка 15 **удаляет** строку `AX_STALE_AFTER_PIVOT_VERIFICATION`, #41 её **расширяет** (`+scope.directive.xml`, `+module.directive.xml`). Проверено, что lint глобальный («no `<Axiom id>` defined **anywhere in the build**»): после подключения аксиома в `audit.directive.hbs` строка не нужна вовсе. **Резолюция:** взять удаление пачки 15, правку #41 отбросить как ставшую беспредметной; перепроверить `build:directives` (должен остаться exit 0 без `undefined axiom reference`). |
| **#42** (пачка 11) | `lead/verify-stacks` | ДА: `cli/cmd/sdd-task/sdd-task.cmd.ts` | **не от пачки 15** — этого файла в её диффе нет; конфликт унаследован от стека PR #40. Информационно. NB: правка F-1 сделает этот файл общим и с пачкой 15 — резолвить их вместе. |
| **#43** (пачка 7) | `lead/eval-reproducible` | НЕТ | пересечений файлов нет |
| **#45** (пачка 20) | `lead/review-critic-bounds` | НЕТ | единственное пересечение — build-output `ai/directives/sdd-v2/reconcile.directive.xml`; пробное слияние прошло автоматически, `check:directives-fresh` на результате → `✓ matches a fresh rebuild`. `review-lifecycle`/`critic-protocol` hbs, `ax-isolation`, `ax-default-accept`, `ax-dispatch-via-batch`, `deps.test.ts` пачкой 15 не тронуты. |
| пачка 13 | `shared/verify/**`, `sdd-verify`, `phase-verification-plan.ts` | НЕТ | ни один из этих путей в диффе пачки 15 не встречается |

---

## H. Слияние с обновлённой релизной веткой

Релизная ветка `origin/codex/sdd-v2-rc52-followup` = `e7b5ba1e`, общая база с `lead/reopen-by-cause` — `ade787e6`.

Пробное слияние выполнено во **временном** worktree (`git worktree add --detach`, ветка не тронута; дерево удалено, `git worktree list` это подтверждает).

**Текстовых конфликтов НЕТ.** `git merge --no-commit --no-ff origin/codex/sdd-v2-rc52-followup` → `Auto-merging cli/cmd/sdd-check/phase-receipt-check.ts`, `Auto-merging shared/sdd/check.ts`, `Automatic merge went well`; `git diff --diff-filter=U` пуст.

Смысловая сверка изменений релизной ветки в общих файлах (`git diff ade787e6 origin/codex/sdd-v2-rc52-followup`):

- `shared/sdd/check.ts` — добавлен **новый error-код `SDD_SPEC_HAS_CRITIC_ROUNDS`** внутри `checkSpecStructure` (спеки), под v2-гейтом. С кодами пачки 15 (`checkTicket`: `SDD_REOPENS_*`, `SDD_EXECUTION_LOG_UNKNOWN_TOKEN`) не пересекается ни по функции, ни по региону. Конфликта смыслов нет.
- `cli/cmd/sdd-check/sdd-check.types.ts`, `cli/cmd/sdd-task/sdd-task.types.ts` — переформатирование JSDoc (однострочный `|`-стиль → многострочный). Чисто косметика; пачка 15 этих строк не касается.
- `cli/cmd/sdd-check/phase-receipt-check.ts`, `shared/sdd/phase-receipt.ts`, `phase-verification-plan.ts`, `readiness.ts`, `phase-dependencies.ts`, `markdown-fence.ts` — правки relokated к receipt/verification-plan; с пачкой 15 не пересекаются.

**Результаты прогонов на слитом дереве:**

| проверка | результат |
|---|---|
| `npm run type-check` | чисто |
| `npm run gate:sdd-check-baseline` | `OK — no error outside the baseline` |
| `npm run check:directives-fresh` | `✓ matches a fresh rebuild` |
| `npm test` | **2 fail** |

Разбор двух падений:

1. **Настоящее, требует правки:** `deployed surface (SO-5)` → `npm pack --dry-run ships exactly the frozen tarball file list` (`shared/common/sync/__tests__/deployed-surface.test.ts`). Релизная ветка **завела этот замок заново** (`+1122` строк `deployed-surface.tarball.golden.txt`, `+158` строк теста — файлов не было на момент ветвления, поэтому git не увидел конфликта), и в замороженном списке перечислены все четыре файла, удалённые B2-18. Проверено, что правка ровно механическая: `UPDATE_SURFACE_GOLDEN=1 node --import tsx --test shared/common/sync/__tests__/deployed-surface.test.ts` даёт `1 file changed, 4 deletions(-)` — ровно строки `ai/kit/contract/process/{orchestrator-progress,phase-progress,side-dive,trace-header}-format.xml`. **Это обязательный шаг слияния**, иначе `npm test` на релизной ветке красный.
2. **Флейк, не регрессия:** `cli/cmd/lint/__tests__/lint.cmd.test.ts` → `uncaughtException: Unable to deserialize cloned data due to invalid or unsupported version` (сериализация в раннере). Отдельный прогон того же файла — `# tests 31 / pass 31 / fail 0`.

**Порядок слияния для Lead:** (1) смержить релизную ветку; (2) `UPDATE_SURFACE_GOLDEN=1 npm test` и закоммитить 4 удалённые строки golden; (3) `npm run build:directives && npm run check:directives-fresh`; (4) `npm test`, `npm run gate:sdd-check-baseline`.

---

## I. Предложенные правки (сводно)

Блокирующие (до мержа PR пачки 15):
1. `cli/cmd/sdd-task/sdd-task.cmd.ts:422` — передать тело `## Blocker Trail` в `scanBlockerTrail`; тест в `sdd-task.cmd.test.ts` (F-1).
2. `shared/sdd/__tests__/check.test.ts` — both-way замок на чтение `## Blocker Trail` из `checkTicket` (F-2).
3. Гейт «каждый кирпич подключён»: PART 3 в `ai/kit/audit-contract-activation.mjs` с сокращающимся allowlist — **или** явное решение оператора снять это слово с приёмки B2-18 (F-3).

Правки отчётов (без кода):
4. `R-T-B6-17.md` §3.1 и `R-B2-18.md` §5.2 — убрать недостоверное «dangling 36 → 35», поставить воспроизводимое доказательство: отвязка даёт `✗ 5 undefined axiom reference(s)`, `build:directives` exit 1.
5. `R-BATCH-15-…md` — заменить разложение «272/102, 31 файл» на измеренное «286/88, 26 файлов» и назвать вторую природу правильно (не «free-text журнальные строки», а «таймстамп без backticks, из-за чего штамп читается как токен»).
6. `R-B2-06.md` §2 — `execution-log.ts:~565` → `:635`.

Желательные (в этой же пачке или следующей):
7. Разделить `SDD_EXECUTION_LOG_UNKNOWN_TOKEN` и «таймстамп не в backticks» (F-4).
8. Замок на `sdd-extract <ticket>#blocker-trail` (сейчас работает, но ничем не защищено).

---

## J. Остатки для доски

- **B2-19 (миграция).** Строка `61-TASK-BOARD.md:90` называет `migration-v1-v2.directive.xml` и «миграционную фикстуру»; в пачке не сделано. Завести отдельную задачу «перенос legacy инлайновых `✅ RESOLVED` в `## Blocker Trail`» **или** зафиксировать решением оператора, что чтение обоих форматов — окончательное состояние (тогда правится строка доски и «Чем доказываем»).
- **Порог по предупреждениям.** Его в плане нет вовсе; warn вырос 431 (`rc-baseline-1`) → 1034. До флипа L-3 → error (B2-15/B2-20) нужен либо warn-бюджет в `gate:sdd-check-baseline`, либо явная фиксация «warn не гейтится никогда». Сейчас 374 из 1034 предупреждений — один код с неверной классификацией (F-4), что делает инвентаризацию долга B2-15 недостоверной.
- **Три тикета с реальным долгом Reopens** (`agent-inbox.task-162.md`, `agent-inbox.task-166.md`, `vcs-client.task-71.md`) — чинить точечно или оставить до самомиграции (E-14). Вопрос оператору из отчёта остаётся открытым.
- **Два оставшихся сироты-контракта** вне зоны B2-18: `ai/kit/contract/uikit/spec-structure.xml`, `ai/kit/contract/critic/oc-structured.xml`. Второй пересекается с темой пачки 20 (критик) — стоит адресовать там.
- **Severity `SDD_REOPENS_MISMATCH`.** `62-BATCH-QUEUE.md` («расхождение — ошибка») и `31-TRACK-CHECK-LOG.md:525` (`error`) против L-3 (warn до B2-15/B2-20). Исполнитель выбрал warn — правомерно; нужен явный ОК оператора и, если ОК дан, правка формулировки очереди, чтобы приёмка не читалась как проваленная.
- **`AX_USAGE_WAIVER_DISCIPLINE`** остаётся неподключённым (упоминание убрано из `phase-block-format.xml`) — уже трекается в `lint-axioms.ts` как unassigned, подтверждаю сохранение статуса.
