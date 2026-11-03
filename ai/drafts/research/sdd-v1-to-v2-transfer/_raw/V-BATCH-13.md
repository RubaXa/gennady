ВЕРИФИКАЦИЯ ПАЧКИ 13 — «Область проверки известна заранее: что и как проверяем» (V-19, V-12, V-13, V-16a)

Проверяющий: `plan-verifier` (свежие глаза, только чтение кода). Дата: 2026-09-10.
Дерево: `…/scratchpad/rc-w2`, ветка `lead/verify-gate-scope`, HEAD `27a1a2a8`, база `f83a4733`
(голова PR #42 `lead/verify-stacks`). `npm ci` выполнен (697 пакетов). Дерево после всех проверок
осталось чистым и на `27a1a2a8` (`git status --short` пуст).
Проверяемые отчёты: `R-V-19.md`, `R-V-12.md`, `R-V-13.md`, `R-V-16a.md`,
`R-BATCH-13-verify-gate-scope.md`.
Требования: `62-BATCH-QUEUE.md` «### Пачка 13»; `61-TASK-BOARD.md §1` строки 60/61/64/68;
`30-TRACK-VERIFY.md §6` строки 507 (V-12), 508 (V-13), V-16; решения D-13, D-17, D-18, D-49, L-16,
L-24; предыдущий вердикт `_raw/V-BATCH-11.md`.

---

## ВЕРДИКТ: ПРИНЯТЬ С ПРАВКАМИ

Код аддитивен, регрессий не даёт, сливается с обновлённой релизной веткой чисто (текстово и по
смыслу — см. последний раздел). Заявленный баг воспроизведён и действительно закрыт регрессионным
тестом. Заголовок пачки достигнут **по механике** и **не достигнут по одной формулировке** (см.
Б-1). Три блокирующих правки — все текстовые/контрактные, дешёвые; на доску уходит шесть остатков.

---

## 1. Блокирующее (до PR / до закрытия строк доски)

### Б-1. `--help` команды `gennady verify` обещает поведение, которого нет. Severity: высокая

`cli/cmd/verify/help.ts:19-21` печатает:

> `stack` is auto-detected only when `stack.use` is set in gennady.yaml; otherwise `node` (L-24).

Фактически `resolveVerifyPlan` (`cli/cmd/verify/verify.cmd.ts:52-64`) **никогда** не детектирует
стек и не читает `stack:` — поле зашито литералом `stack: 'node'`.

**Воспроизведение (живой CLI, фикстура вне дерева RC):**

```
gennady.yaml:  stack:
                 use: [anystack]
                 anystack:
                   extraGates:
                     - id: swiftlint
                       argv: [swiftlint, lint]
                       timeout: 30m
                       when: ["ios/**/*.swift"]
$ gennady verify --plan --json
{ "profile": "full", "stack": "node", "gates": [ type-check, test:coverage, lint, format, yagni ] }
```

`stack.use: [anystack]` задан явно — по тексту справки должен был сработать детект; напечатан
`node`, гейта `swiftlint` в плане нет. Справка описывает **первую, отброшенную** реализацию:
`R-V-16a §4` прямо говорит, что резолв через `resolvePreset`/`stack.use` был снят как «прямая ложь
read-only планировщика», — но строку справки при этом не поправили. Ни один отчёт этого не
раскрывает. Ирония в том, что это ровно тот дефект, который заголовок пачки обязан закрывать:
пользователь читает справку и не знает, что именно будет проверено.

**Правка:** заменить строку на честную, например: «`stack` is always `node`: the full profile is a
fixed node ladder today and does not read `stack:`/`extraGates` (they reach only the phase path,
V-08/V-08b) — `--plan` reports what will actually run, not the declared stack.» Тип `VerifyPlanGate`
(`verify.types.ts:82-83`) уже сформулирован честно («always `'node'` today») — расходится только
справка.

### Б-2. Пачка закрыла 4 задачи и не тронула ни одной спеки; V-16a — назначенный владелец двух записей `Usage Waiver`. Severity: высокая

`git diff --name-only f83a4733..HEAD | grep -c '^specs/'` → **0**. При этом:

- `specs/cli/verify/verify.spec.md:172` (`<summary>` реестра) и `:234-240` называют **V-16a**
  владельцем записей `StackRun` и `VerifyReport`. Правило самой спеки (§1, Key properties):
  «у каждой записи есть задача-владелец, которая обязана либо провести реальный вызов и снять
  запись, либо **явно пересмотреть её при своём закрытии**». V-05/V-07/V-08 это правило соблюли —
  у каждой записи стоит «**Пересмотрено при закрытии …**». V-16a закрылась, форму MAIN не приняла
  (сделала собственные `VerifyPlanDocument`/`VerifyPlanGate`) и запись не пересмотрела.
- `:200` (`formatDuration`) прямо называет кандидатом-владельцем «V-16 (`gennady verify --plan
  --json`)» — V-16a вышла без печати `timeoutMs`, запись не пересмотрена.
- `:216` (`applyStackConfig`) — **V-12 расширила именно этот символ** (`when`/`targets`), запись не
  обновлена.
- `:13` (Key properties) утверждает: «Модуль **не имеет собственного CLI-входа**». После V-16a это
  ложно — `cli/cmd/verify/**` и есть CLI-вход.
- `specs/cli/sdd-verify/sdd-verify.spec.md`: таблица флагов (`:182`) и публичная поверхность
  (`:135-136`) не знают ни `--only`/`--skip`, ни `resolveGateSelectors`, ни
  `ERR_CLI_SDD_VERIFY_UNKNOWN_SELECTOR`, ни новой ветки `exitCode: 4` в `VerifyOutcome`.

Контекст, который делает это блокирующим, а не косметикой: непосредственно предшествующий коммит
`f83a4733` — «docs(verify): fix waiver-registry numbers…», то есть правка того же реестра по
блокирующему пункту `V-BATCH-11`. Тот же класс дрейфа повторён в следующей же пачке.

**Правка:** один docs-коммит в этой же ветке: пересмотреть 3 записи (`StackRun`, `VerifyReport`,
`formatDuration`), обновить `applyStackConfig`, снять/переформулировать «не имеет собственного
CLI-входа», добавить `--only`/`--skip` и новый код ошибки в спеку `sdd-verify`, пересчитать
`<summary>`.

### Б-3. Приёмочный пункт V-16 «явно маркирует вывод как не-evidence» не выполнен. Severity: средняя

`30-TRACK-VERIFY.md §6`, строка V-16, дословно: «`gennady verify --plan --json` **не пишет**
`SDD_PHASE_RECEIPT` **и явно маркирует вывод как не-evidence**». Первая половина выполнена и
доказана тестом («never writes anything to the fixture»). Вторая — нет:
`VerifyPlanDocument` (`cli/cmd/verify/verify.types.ts:79-86`) = `{ profile, stack, gates }`, никакого
маркера. Оговорка «нет мутирующего фасада» живёт только в прозе `--help`, а потребитель этого
вывода по назначению — CI-репортёр, который справку не читает. Ни один отчёт пункт не упоминает.

**Правка:** добавить в документ поле уровня документа, например `"evidence": false` или
`"kind": "plan"` с DBC-контрактом, и утверждение в `verify.cmd.test.ts`.

---

## 2. Неблокирующее

### Н-1. Взаимоуничтожающиеся `--only`/`--skip` дают зелёный вердикт на нулевой проверке

**Воспроизведено:**

```
$ gennady sdd-verify --profile full --only=yagni --skip=yagni
[sdd-verify] ✅ ALL PASS (0/0)          exit=0
```

Оба селектора матчат, `resolveGateSelectors` возвращает `ok`, пересечение пусто, ошибки нет. То же
даст `--skip=*`. Это родной брат того самого бага `fullFoundationGreen`, который исполнитель нашёл
и починил, и он противоречит собственному инварианту пачки, записанному в `R-V-13 §1`
(«несматчивший selector → `{ok:false}`, **никогда тихий no-op**»). CI, читающий exit 0, решит, что
проект проверен. **Правка:** пустой набор после резолва → exit 4 с сообщением «selectors select no
gate».

### Н-2. «Отсечённый гейт виден в receipt» доказан чтением кода, а не тестом

Дословный приёмочный пункт (`30-TRACK-VERIFY.md:507`): «даёт видимый `skipped: when
(gennady.yaml)`, **записанный в receipt**». Тестами закрыто только состояние **плана**
(`phase-verification-plan.test.ts`, 3 кейса) и регэксп `isReceipt` — косвенно; `R-V-12 §4` это
честно признаёт. Ни один тест не пишет и не перечитывает квитанцию с `SKIPPED_BY_SCOPE`.

Механизм я проследил, он **рабочий**: `phase-run.ts:240` пропускает не-`CONFIGURED`;
`phase-run.ts:467` кладёт в `gateEvidence` **все** гейты плана без фильтра;
`phase-receipt.ts:1416` (regex) их принимает; `phase-receipt-validation.ts:99-106` пересобирает
ожидаемый `gateEvidence` из текущего плана, где `:102` переводит в `PROVEN` только `CONFIGURED`,
оставляя `SKIPPED_BY_SCOPE` как есть, — повторное чтение сходится. Но это моё чтение, а не
доказательство исполнителя. **Правка:** один e2e-кейс поверх существующей anystack-фикстуры
`phase-run.test.ts` (V-08b).

Отдельно: литеральная форма из приёмки — `skipped: when (…)` — существует только на **мёртвом**
пути `applyStackConfig` (`stack-config.ts:648`, `skipped: 'when (${extraSource})'`), у которого,
по признанию `R-V-12 §4`, нет живого потребителя. Живой путь несёт другую (лучшую) форму
`SKIPPED_BY_SCOPE` + `next: 'skipped-by-scope: …'`. Расхождение формулировки приёмки и реализации
надо зафиксировать на доске, а не оставлять в отчёте.

### Н-3. `--only=swiftlint*` — приёмочный пункт V-13 — структурно недостижим в этом релизе

Три факта вместе: `extraGates` попадают только в фазовый путь (V-08/V-08b); `--only`/`--skip` на
фазовом пути запрещены (и это и есть суть V-13); полный профиль — фиксированная node-лестница
`gatesFor`. Следствие: **ни один объявленный в конфиге гейт нельзя выбрать `--only` вообще
никогда**. `R-V-13 §4` раскрывает это как открытый вопрос; доказательство glob-матчинга дано на
подменённом имени (`--only=type*` → `type-check`). Это честная замена, но приёмочный пункт остаётся
невыполненным, и это должно быть строкой доски, а не абзацем в отчёте.

### Н-4. Четвёртая точка падения `resolvePreset(...)!`

`phase-verification-plan.ts:297` (`scopeReasonForGate`) повторяет non-null-assertion соседа
`commandForGate` (`:285`) и вычисляется в цикле **раньше** него. Регресса нет (для стека без
адаптера `TypeError` был и будет), но L-24 перечисляет точки для V-08c/V-09 как «`:53,71,282`» —
после этой пачки актуально «`:53,71,285,297`». Сверено: на `f83a4733` было 3 точки (53/71/282), на
`HEAD` — 4.

### Н-5. Комментарий в коде ссылается на раздел, которого нет по смыслу

`cli/cmd/verify/verify.cmd.ts:44-47` ссылается на `30-TRACK-VERIFY.md §3.0` как на объяснение,
почему `stack.use` не доходит до полного профиля. `§3.0` называется «Критерии и три „жёстких“
инварианта, которые режут варианты» и об этом не говорит. `R-V-16a §4` сам признаёт, что явного
решения на доске нет. **Правка:** сослаться на L-24 + факт `gatesFor`, либо снять ссылку.

### Н-6. Арифметика сводного отчёта

Таблица «файл → смысл» в `R-BATCH-13`: «`*.test.ts` (**8** файлов, новых или дополненных)».
Фактически `git diff --name-only f83a4733..HEAD | grep -cE '\.test\.ts$'` → **6**
(`cli/__tests__/tool-behavior/verify.test.ts`, `cli/cmd/sdd-verify/__tests__/sdd-verify.cmd.test.ts`,
`cli/cmd/verify/__tests__/verify.cmd.test.ts`, `shared/sdd/__tests__/phase-verification-plan.test.ts`,
`shared/verify/__tests__/stack-config.test.ts`, `shared/verify/presets/__tests__/anystack.test.ts`).
15 не-тестовых файлов — все имеют строку в таблице, пропусков нет.

### Н-7. Мой независимый прогон `yagni` — пустой, заявление отчёта непроверяемо

`npm run yagni` на чистом дереве: `✅ clean (**0** changed file(s) scanned)` — гейт смотрит
изменённые файлы, а на HEAD их нет. Отчёт заявляет «6 changed file(s) scanned» на момент коммита;
это состояние воспроизводимо только внутри pre-commit-хука. **НЕ ПРОВЕРЯЕМО** мной независимо;
единственное свидетельство — `check` 5/5 в момент коммита.

### Н-8. Мелочи семантики области

`gateInScope` сверяет `when` только с Target Files и не видит `deletedFiles`; фаза с пустым списком
Target Files отсекает по области **любой** `when`-гейт. Оба поведения защитимы, но нигде не
записаны.

---

## 3. Подтверждено

**Дифф и таблицы.** 21 файл, `1140+/36−`. Все 15 не-тестовых файлов имеют строку в таблице сводного
отчёта. Ссылки `file:line` в отчётах сверены и точны: `sdd-verify.cmd.ts:162` (`gennadyGateCommand`
стал `export`), `:705` (`fullFoundationGreen`), `sdd-verify.types.ts:289` (`resolveGateSelectors`),
`stack-config.ts:429/472/484` (`globToRegex`/`matchesGlob`/`gateInScope`),
`phase-verification-plan.ts:291` (`scopeReasonForGate`), `anystack.ts:52` (`scopeReason`),
`verify.types.ts:261` (`when`), `phase-context.ts:343-355` (вызов `resolvePhaseVerificationPlan` из
диаграммы `R-V-12`).

**Mermaid «стало» — стрелки против кода.** `PLANCLI2 -. gatesFor/gennadyGateCommand .-> FULLCLI2` —
реальный импорт (`verify.cmd.ts:9-10` ← `sdd-verify.types.ts`, `sdd-verify.cmd.ts:162`).
`FULLCLI2 --> SCOPE2` — реальный (`sdd-verify.types.ts:14` импортирует `matchesGlob`).
`RECEIPT2` — реальный (`phase-run.ts:467` → `phase-receipt.ts:1416`). Цепочка
`CFG2 → SCOPE2 → PHASE2 → RECEIPT2` — поток данных, не вызовов (валидатор `gateInScope` не
зовёт); для flowchart допустимо, ложного ребра уровня `V-BATCH-11` нет.

**Команды-доказательства, перезапущенные мной.**

| Команда | Мой вывод | Против отчёта |
|---|---|---|
| `npm --prefix <tree> test` | `# tests 3935 / # pass 3925 / # fail 0 / # cancelled 0 / # skipped 10` | совпадает дословно |
| `npm --prefix <tree> run gate:sdd-check-baseline` | `OK — no error outside the baseline (baseline commit 227c03a8…, tag rc-baseline-1)` | совпадает |
| `npm --prefix <tree> run lint:contracts` | `✅ … no errors` | совпадает |
| `npm --prefix <tree> run build` | `✓ built in 17.42s` | совпадает (время своё) |
| `npm run type-check` (на слитом дереве) | exit 0 | совпадает |
| `git diff f83a4733..HEAD -- '*golden*'` | пусто; ни одного файла с `golden` в диффе вообще | паритет V-01 сохранён |
| `npm --prefix <tree> run yagni` | `✅ clean (0 changed file(s) scanned)` | см. Н-7 |

**Баг `fullFoundationGreen` — воспроизведён.** В одноразовом worktree (ветка `lead/verify-gate-scope`
и `rc-w2` не тронуты; дерево удалено) откачена **только** эта правка к форме `f83a4733`:

```
- ['type-check','test:coverage'].every((name) => results.some(r => r.name===name && r.status==='pass'))
```

Результат: `# tests 97 / # pass 95 / # fail 2`;
`not ok 1 - --only runs exactly the matched gates` → `actual []` против `['npm run lint','npm run
format']`; `not ok 2 - --skip removes exactly the matched gates` теряет `lint`/`format`.
То есть без правки `--only=lint,format` действительно молча не запускал ничего, а регрессионный тест
это ловит. **Уточнение к формулировке отчёта:** на `f83a4733` флагов `--only`/`--skip` не
существовало, поэтому это латентный дефект, ставший достижимым вместе с V-13, а не ранее видимый
пользователю баг. Формулировка `R-V-13` («найден и исправлен») этому соответствует.
На HEAD исправлено, проверено живым CLI: `sdd-verify --profile full --only=format,yagni` →
`✅ ALL PASS (2/2)`, оба гейта реально исполнены.

**Заголовок пачки — план против фактического прогона (живой пример).**

```
$ gennady verify --plan --json
  type-check → npm run type-check   test:coverage → npm run test:coverage
  lint → npm run lint   format → npm run format   yagni → npx --no-install tsx cli/gennady.ts yagni
$ gennady sdd-verify --profile full --skip=test:coverage
  [sdd-verify] ✅ ALL PASS (4/4)
  ✅ type-check (32.8s)  ✅ lint (85.4s)  ✅ format (63.4s)  ✅ yagni (2.1s)
```

Состав, порядок и строки команд плана совпадают с реально исполненным (минус явно отсечённый
гейт). Механически заголовок достигнут.

**V-19 — живая конфигурационная валидация (фикстура вне дерева RC).**

| Конфиг | Вывод | |
|---|---|---|
| `timeout: 30m`, без `when` | exit 4, `stack.anystack.extraGates[0].when: a gate with timeout over 10m must declare "when" (file-scope globs) … add when: ["<glob>", …] or lower timeout to 10m or less` | подсказка называет `when` |
| `timeout: 30m` + `when: [...]` | план печатается, exit 0 | |
| `timeout: 10m` ровно, без `when` | план печатается, exit 0 | граница «over 10m», D-18 соблюдён |
| ключ `whenn:` | exit 4, `unknown key (did you mean "when"?) — known: id, argv, cwd, env, timeout, when, …` | неверный ключ ловится |
| `when: []` | exit 4, `must be a non-empty array of non-empty glob strings` | |

**V-13 — сужение и запреты живьём.** `--only=swiftlint` → exit **4**,
`ERR_CLI_SDD_VERIFY_UNKNOWN_SELECTOR: … matches no gate — known gates: type-check, test:coverage,
lint, format, yagni`. `--task … --phase P1 --only=lint` → exit 4,
`--only/--skip are only valid with --profile full, never with --task/--phase`. Фазовый путь сузить
нельзя не только по парсеру: `phase-run.ts:365` вызывает `run()` без `only`/`skip` вовсе.

**D-13 read-only.** `cli/cmd/verify/**` не содержит исполнения гейта; `cli/gennady.ts` получил
только `case 'verify'` в обоих switch, команды `fix` нет. Тест «never writes anything to the
fixture» реален.

**Прочее.** `matchesGlob` семантически эквивалентен `cli/cmd/lint/checks/utils/glob-match.ts`, как
и заявлено (дублирование, а не импорт, — чтобы `shared/` не зависел от `cli/`); заявление
проверено построчно. Заголовки файлов `@tasks: N/A` — доминирующая конвенция `cli/cmd` (141 из
~200), не нарушение.

**Отклонения исполнителя (пункт 4 задания) — правомерность.**

| Отклонение | Оценка |
|---|---|
| V-19 без `phase-verification-plan.ts` | **правомерно.** D-18 — проверка load-time (`validateGateSpec`/`loadStackConfig`); рантайм-план в ней не участвует, правка там была бы кодом без потребителя. Раскрыто в `R-V-19 §4`. |
| V-12 в `presets/anystack.ts` вместо `phase-context.ts:169-239` | **правомерно.** Ссылки брифа устарели после V-08/V-08b. Сверено: `phase-context.ts:343-355` уже передаёт `current.targets` в план — трогать нечего. Диффа меньше, риска меньше. Раскрыто в `R-V-12 §4`. |
| V-13 только на `sdd-verify --profile full` | **правомерно как сужение.** `gennady verify` по D-13 ничего не исполняет — фильтровать нечего; добавление туда селекторов было бы либо косметикой печати, либо мутирующим фасадом (запрещён D-13/O-2). Но сужение заголовка есть, и оно тянет Н-3 → на доску. |
| V-16a план = node-only | **правомерно и лучше исходного замысла:** план обязан совпадать с исполняемым, а полный профиль сегодня node-only. Это не противоречит L-24 (та про `sdd-task`/`sdd-verify`), но и не покрыто ею — решения оператора на «временно или навсегда» нет → на доску. Побочный эффект: для anystack-репозитория план печатает node-лестницу с `command: null` — формально честно, практически бесполезно. |

---

## 4. Слияние с обновлённой релизной веткой

`origin/codex/sdd-v2-rc52-followup` = `e7b5ba1e` (подтверждено). База слияния с нашей веткой —
`c9726635`; релиз ушёл на 17 коммитов вперёд.

**Конфликтующие файлы: нет.**
`git merge-tree --write-tree HEAD origin/codex/sdd-v2-rc52-followup` → exit 0, дерево
`5f3761f4cc19fb4c18ba2941daed1d92df3bfa9a`, ни одной строки конфликта. Проверено и настоящим
мержем во **временном** worktree (`lead/verify-gate-scope` и `rc-w2` не тронуты; дерево удалено
после проверки, `git worktree list` чист).

**Смыслы не расходятся — проверено предметно, а не только по отсутствию маркеров.**

- `shared/sdd/phase-receipt.ts` — релиз правит **только JSDoc** (однострочные `| @param …`
  разворачиваются в блоки) на `:89`, `:1201`, `:1274`, `:1403`, `:1430`. **Новых полей квитанции
  нет**: `PhaseReceipt`, `gateEvidence`, `isReceipt`, словарь `gate.state` не тронуты. С нашей
  единственной правкой (`:1416`, добавление `SKIPPED_BY_SCOPE` в regex) пересечения по смыслу нет.
- `cli/cmd/sdd-verify/phase-receipt-validation.ts` — тоже только JSDoc (`:18`, `:69`, `:205`).
  Логика `expectedPhaseReceiptPlan`/`phaseReceiptCommandIssue`, на которую опирается V-12 (`:99-106`
  сверяет `gateEvidence` точным `JSON.stringify`), не изменена.
- `shared/sdd/readiness.ts` — JSDoc плюс починка вложенности комментария на `:414-422`.
  `resolveProjectScriptName`, который V-16a использует в `planCommandForGate`, не тронут.
- `package.json` — релиз добавляет `test:experimental`, `eval:migration`, `eval:migration:portal`;
  наша ветка `package.json` не трогает вовсе.

**Реальный риск, который стоило проверить, и он чист.** Релиз переписывает `scripts/test-topology.ts`
(+72) и `shared/common/__tests__/test-topology.test.ts` (+133) — новый слой `experimental`, вывод
agent-inbox/agent-mon из `npm test` (D-60). Пачка 13 приносит два **новых** тест-файла, а доска
(строка V-01) требует, чтобы новый тест-файл классифицировался ровно в один слой. На слитом дереве:

```
npm run test:topology → unit=217 contract=23 local=50 external=8 experimental=135   (ошибок нет)
npm run type-check    → exit 0
npm test              → # tests 3731 / # pass 3723 / # fail 0 / # cancelled 0 / # skipped 8
```

Меньшее общее число тестов — следствие D-60 (перенос experimental из `npm test`), не потеря
покрытия этой пачки: все четыре сюиты пачки присутствуют и зелёные в слитом прогоне —
`gennady verify --plan --json (V-16a)`, `run — --only/--skip narrow the full profile (V-13)`,
`parseVerifyInvocation`, `resolveVerifyPlan — read-only, exactly what sdd-verify --profile full
would run`.

**Вывод:** порядок мержа свободен. Ни перебазирования, ни ручного разведения PR #42 и пачки 13
относительно `e7b5ba1e` не требуется. Флейк `test:coverage` под нагрузкой, описанный в отчётах, у
меня не воспроизвёлся ни разу: три полных прогона (`fail 0`, `cancelled 0`) — это подтверждает
диагноз «окружение под нагрузкой», а не регресс пачки.

---

## 5. Остатки для доски

1. **V-16a — не закрывать без правок Б-1/Б-3** (справка лжёт; маркер «не evidence» отсутствует).
   После правок — `ВЫПОЛНЕНО`.
2. **V-13 — статус `ВЫПОЛНЕНО ЧАСТИЧНО`.** Приёмочный пункт «`--only=swiftlint*` матчит новый
   гейт» структурно недостижим (Н-3). Нужна строка-преемник: «`extraGates`/anystack вживляются в
   полный профиль» (M, зависит от V-08b) — без неё `--only` навсегда ограничен фиксированной
   node-лестницей.
3. **Решение оператора: node-only план — временно или навсегда?** `gennady verify --plan --json`
   для anystack-репозитория печатает node-лестницу с `command: null`. Развязка — та же задача из
   п. 2. Открытый вопрос поднят `R-V-16a §4`, решения на доске нет (D-49/L-16: токен
   `pending-operator`).
4. **V-12 — довесок:** e2e-кейс «квитанция с `SKIPPED_BY_SCOPE` пишется и перечитывается» поверх
   anystack-фикстуры `phase-run.test.ts` (Н-2); плюс фиксация расхождения формулировки приёмки
   (`skipped: when (gennady.yaml)` на мёртвом пути) с реализацией (`SKIPPED_BY_SCOPE` на живом).
5. **L-24 — обновить перечень точек `resolvePreset(...)!`** для V-08c/V-09: было `:53,71,282`,
   стало `:53,71,285,297` (Н-4).
6. **Новая мелкая задача (S):** пустой результат резолва `--only`/`--skip` → exit 4 вместо
   `✅ ALL PASS (0/0)` (Н-1).
7. **Реестр `Usage Waiver`** (`specs/cli/verify/verify.spec.md`): после Б-2 пересчитать `<summary>`;
   у `StackRun`/`VerifyReport` владелец V-16a исчерпан — назначить новый или пометить кандидатами
   на удаление, как и предполагала сама запись.

## 6. Итог

**Блокирующее (3):** Б-1 — `verify --help` обещает детект стека, которого в коде нет
(воспроизведено живьём); Б-2 — ноль правок спек при закрытии 4 задач, включая две записи
`Usage Waiver`, чей владелец — закрываемая V-16a (повтор класса дефекта из `V-BATCH-11`); Б-3 —
приёмочный пункт V-16 «явно маркирует вывод как не-evidence» не выполнен в машинном выводе.
Все три — текстовые/контрактные, чинятся одним коммитом, кода не трогают.

**Неблокирующее (8):** зелёный вердикт на нулевом наборе гейтов при взаимоуничтожающихся
селекторах; «виден в receipt» доказан чтением, не тестом; `--only=swiftlint*` структурно
недостижим; четвёртая точка `resolvePreset(...)!`; ссылка на `§3.0`, которая об этом не говорит;
«8 тест-файлов» вместо 6; `yagni` независимо непроверяем; `when` не видит `deletedFiles`.

**Подтверждено:** 21 файл, все не-тестовые с строкой в таблице; все сверенные `file:line` точны;
mermaid «стало» без ложных рёбер; `npm test` 3935/3925/0/0/10 — дословно как в отчёте;
`gate:sdd-check-baseline` OK; `lint:contracts`, `build` зелёные; golden-паритет с
`lead/verify-stacks` полный (диффа `*golden*` нет вовсе); баг `fullFoundationGreen` воспроизведён
откатом одной правки (`fail 2`, `--only` даёт `[]`) и на HEAD закрыт регрессионным тестом,
подтверждено живым CLI; план `verify --plan --json` совпадает с фактическим прогоном
`sdd-verify --profile full` по составу, порядку и строкам команд; V-19 ловит и долгий гейт без
`when`, и опечатку ключа, и пустой `when`, с корректной границей 10m; `--only`/`--skip` физически
недоступны фазовому пути; все четыре отклонения исполнителя правомерны и раскрыты.

**Слияние с `e7b5ba1e`: конфликтов нет, смыслы не расходятся** — правки релиза в трёх общих
файлах чисто JSDoc-косметические, новых полей квитанции нет; слитое дерево зелёное
(`type-check` 0, `test` `fail 0`, `test:topology` без ошибок, все четыре сюиты пачки на месте).

**Рекомендация: править Б-1..Б-3 в этой же ветке, затем PR.** Код вливать можно как есть —
он аддитивен и регрессий не даёт; на доске V-16a и V-13 до правок не закрывать.
