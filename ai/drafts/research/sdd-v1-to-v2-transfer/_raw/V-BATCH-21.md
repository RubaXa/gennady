ВЕРИФИКАЦИЯ V-BATCH-21 — пачка 21 «Обещания инструмента не шире механизма» (T-B6-28, T-B6-29, T-B6-07, ISS-11)

ВЕРДИКТ: **ПРИНЯТЬ С ПРАВКАМИ**. Механика чистая (все гейты зелёные, все замки отвязываются), но заголовок пачки достигнут не везде: у `T-B6-29` обещание снято в библиотечной копии аксиом, а в живой поставляемой директиве осталось (**B1**), и «grep-замок словаря» по факту — замок на четыре конкретные фразы, который не ловит ни новые обещания теми же словами, ни уже существующие остатки того же класса внутри собственных корней (**B2**). `T-B6-28` и `T-B6-07` — по существу выполнены. `ISS-11` — правомерное сужение по зоне, но заголовок issue не достигнут; строка доски должна стать ЧАСТИЧНО.

Проверяющий: `plan-verifier`. Дерево: `…/scratchpad/rc-w3`, ветка `lead/promises-not-wider`, HEAD `19304ac4`, база `f0c1703f` (PR #45). Источник v1: `/Users/k.lebedev/Developer/gennady` @ `d37d5910`. Ничего в дереве не изменено; мутации выполнялись в отдельной копии `…/scratchpad/mut` (`cp -R rc-w3/ai mut/ai` + `{"type":"module"}`), файлы `rc-w3` после проверки байт-в-байт исходные (`git -C rc-w3 status --short` — пусто).

---

## 1. Что подтверждено

**Диффом.** `git diff --stat f0c1703f..HEAD` — 22 файла, +336/−32. Поштучно совпадает с четырьмя отчётами: `53249aa2` 4 файла (+72/−3), `8b4842ca` 12 (+124/−14), `9c257d2d` 4 (+91/−3), `19304ac4` 4 (+49/−12). **Каждый из 22 файлов имеет строку в таблице `R-BATCH-21` §«Таблица файл → смысл»** (22/22, пересчитано построчно) — пропусков нет.

**Гейты (перезапущены мной, синхронно, `npm --prefix <rc-w3>`).**

| Команда | Результат | exit |
|---|---|---|
| `npm test` | `# tests 3675 / # pass 3667 / # fail 0 / # skipped 8` | 0 |
| `npm run check:directives-fresh` | `✓ ai/directives/** matches a fresh rebuild.` | 0 |
| `npm run audit:sdd-templates` | axiom 28 / contract 28+33 / halt 33+33 / budgets — clean | 0 |
| `npm run gate:sdd-check-baseline` | `OK — no error outside the baseline (227c03a8, rc-baseline-1)` | 0 |
| `npm run check` (сверх брифа) | `[sdd-verify] ✅ ALL PASS (5/5)` type-check/test:coverage/lint/format/yagni | 0 |

**Замки-доказательства (перезапущены мной).** `back-sync-not-promised` 2/2, `assurance-wording-not-overpromised` 2/2, `v1-skill-names-as-triggers` 9/9, `check-diagram-captions` 12/12 — итого 25 pass / 0 fail (`node_modules/.bin/tsx --test <4 файла>`). Числа в отчётах совпадают.

**T-B6-28 по существу (собственный grep по всему дереву, не по двум названным файлам).**
- `sync-from-code` — 0 вхождений вне комментария самого теста (`grep -rn -i "sync-from-code\|sync_from_code"`);
- «приводит спеку и код в согласие» / «into agreement» — единственное вхождение `cli/cmd/sdd-sync/sdd-sync.cmd.ts:130` («bring matching **tracker rows** into agreement»), честное, как и утверждала доска;
- `sdd-sync` в `reconcile.directive.xml` — 0 вхождений;
- `from-code` — реальное имя режима: `reconcile.directive.hbs:7` (`- **from-code** — code ran ahead of the spec…`), `:71`, `:85`. Переименование keyword'а не выдумано.

**T-B6-07 по существу (пересчитано мной, не со слов отчёта).** v1 @ `d37d5910`: `git ls-tree -d ai/skills/` → 16 каталогов, из них `sdd-*` — 12. v2 @ HEAD: `ls ai/skills` → 12 каталогов, из них `sdd-*` — 8 (`sdd`, `sdd-audit`, `sdd-check`, `sdd-code-review`, `sdd-critic`, `sdd-execute`, `sdd-reconcile`, `sdd-scaffold`). Разность — ровно 7 имён: `/sdd-setup`, `/sdd-discover`, `/sdd-continue`, `/sdd-infra`, `/sdd-module-decomposition`, `/sdd-fix`, `/sdd-execute-batch` — тождественна `RETIRED_V1_NAMES` в замке. **Ни одного пропущенного снятого имени.** Число скиллов = 12 до и после пачки (диффом: ни один каталог не добавлен). Обёрток/алиасов нет: `ls cli/cmd` не содержит ни одной команды со снятым именем; ни один `description` не содержит двух владельцев одного имени.

**T-B6-29, диаграммная половина (both-way, D-43).** Подтверждаю отчёт: чекер и тесты созданы **до** этой ветки (`git log -- shared/sdd/__tests__/check-diagram-captions.test.ts` → `f5f8bcd7`, `dd5a87cb`, `383e3f73`; в диффе пачки их нет). Оба направления присутствуют и зелёные: `check-diagram-captions.test.ts:85` «caption citing a requirement ID this spec does not declare → SDD_DIAGRAM_CAPTION_REQ_UNKNOWN» и `:78` «general-purpose Overview caption without any requirement ID → allowed, no findings», плюс `:101` cross-scope-исключение и `:125` объявленный ID → чисто. Код: `shared/sdd/check.ts:2476-2517`. Правило объявлено и авторам: `ai/kit/templates/sdd-v2/formats/diagram-vocabulary.hbs:205,213`.

**Отвязка замков (мутации в копии).**

| # | Мутация | Ожидание | Факт |
|---|---|---|---|
| M1 | `keywords="… from-code, back-sync, …"` в `reconcile.directive.hbs:1` | падает | `not ok 1 - back-sync is never a promised mechanism` ✔ |
| M5 | откат `ax-preflight-blast-radius-scoped.xml:6` на «a target-specific structural proof» | падает | `not ok 1 - assurance wording never overpromises` ✔ |
| M8 | убрать хвост `/sdd-fix` из `ai/skills/sdd-reconcile/SKILL.md:3` | падает | `not ok 1 - retired v1 skill names live only as triggers` ✔ |
| M9 | создать 13-й скилл-обёртку `ai/skills/sdd-fix/SKILL.md` с `/sdd-fix` в description | падает | `not ok 1` (и по счётчику, и по «ровно один владелец») ✔ |
| M10 | создать 13-й скилл без v1-имени | падает | `not ok 1` (счётчик) ✔ |

Ложных срабатываний на легитимных употреблениях не обнаружено: `future-proof` (`ax-product-library-flow.xml:14`), `proven` (`ax-minimal-error-surface.xml:3`, `ax-data-attrs-not-host.xml:5`), canon-ID `AX_E2E_PROOF_SCREENSHOT_ALWAYS`, отрицание «confusion alone NEVER proves…» (`ax-confusion-bug.xml:3`) — все остаются в дереве, замок зелёный. Весь текст замок не глушит.

**Mermaid «стало» — сверено с кодом.** `R-T-B6-28` §2: `KW2 → LOCK`, `AUTH2 → LOCK` — реальны, корни замка `ai/kit`, `ai/directives/sdd-v2`, `ai/skills` (`back-sync-not-promised.test.ts:45`) покрывают и `.hbs`, и `AUTHORING.md`. `R-T-B6-29` §2: все шесть стрелок в `LOCK` реальны (`ai/kit/axiom`, `ai/kit/contract`, `ai/directives/sdd-v2` — `assurance-wording-not-overpromised.test.ts:52`), `VOC` покрыт кейсом 2 (`:68-74`). `R-ISS-11` §2: `Contract-->>PhaseN` реальна (`HANDOFF_FORMAT` включён `execute.directive.hbs` и `phase-execution-protocol.directive.hbs`), а нота честно называет обвязку НЕ РЕАЛИЗОВАННОЙ. Единственная стрелка без file:line — `R-T-B6-07` §2 «оператор пишет `/sdd-fix` → классифицируется маршрутизатором»: это поведение платформы по `description`, в репозитории вызова нет и быть не может; по D-27 вариант (a) это и есть принятый механизм — принимаю, но помечаю как **НЕ ПРОВЕРЯЕМО в коде**.

---

## 2. Находки

### B1 — БЛОКИРУЮЩЕЕ (T-B6-29). Обещание снято в мёртвой копии аксиомы; живая поставляемая директива продолжает обещать

`ai/directives/testing/playwright-e2e.xml` — **9 вхождений** «Proof screenshot(s)», включая `:1` `keywords="… visual-regression, proof-screenshot, self-verify"` (ровно тот класс дефекта, что снят в T-B6-28 keyword'ом `back-sync`), `:7`, `:69`, `:215`, `:222`, `:290`, `:291`, `:326`, `:355`. Строки `:59` и `:65` — **дословные копии тел тех самых двух аксиом**, которые пачка переписала (`ax-e2e-visual-regression-gated.xml:5`, `ax-e2e-proof-screenshot-always.xml:5`). Файл входит в поставку: `shared/common/sync/__tests__/deployed-surface.tarball.golden.txt:106`.

При этом обе переписанные аксиомы **не включены ни в один шаблон**: `grep -rn "ax-e2e-proof-screenshot-always\|ax-e2e-visual-regression-gated" ai/kit/templates` → пусто (включён только `ax-e2e-first` — `infra.directive.hbs:40`); `ai/kit/lint-axioms.ts:209` прямо держит `['AX_E2E_PROOF_SCREENSHOT_ALWAYS', ['infra.directive.xml'], 'unassigned — 40-doc §4.1 row 18']`. Итог: 2 из 6 правок T-B6-29 изменили текст, который до агента не доезжает, а текст, который агент реально читает, обещание сохранил. Плюс пачка **создала новый дрейф** — две копии одного канонического тела аксиомы разошлись.

Воспроизведение:
```
grep -rn -i "proof screenshot\|proof-screenshot" <rc>/ai/directives/testing/playwright-e2e.xml   # 9 строк
grep -rn "ax-e2e-proof-screenshot-always\|ax-e2e-visual-regression-gated" <rc>/ai/kit/templates    # пусто
grep -n "ai/directives/testing/playwright-e2e.xml" <rc>/shared/common/sync/__tests__/deployed-surface.tarball.golden.txt  # :106
```
Правка: перенести ту же переформулировку в `ai/directives/testing/playwright-e2e.xml` (включая keyword `proof-screenshot`), и расширить корень замка с `ai/directives/sdd-v2` до `ai/directives` — иначе замок структурно не способен увидеть этот файл. Альтернатива (хуже): явно записать в отчёте и на доске, что живая копия оставлена сознательно, и завести отдельную задачу — но тогда `T-B6-29` не может закрываться как DONE.

### B2 — БЛОКИРУЮЩЕЕ (T-B6-29). «Grep-замок словаря» — на деле замок на 4 фразы; критерий доски не выполнен

`ai/kit/__tests__/assurance-wording-not-overpromised.test.ts:34-43` банит ровно четыре строки: `structural proof`, `one observable proof`, `proves its requirement`, `proof screenshot`. Доска (`61-TASK-BOARD.md:191`) и трек (`40-TRACK-DIRECTIVES-SKILLS.md:856`) требуют «**grep-замок словаря** assurance», а `62-BATCH-QUEUE.md` §Пачка 21 отдельно предупреждает: «ошибка здесь тихая (обещание останется в одном месте) — доказательство только grep-замком, не чтением».

Мутации (копия дерева, замок зелёный после каждой):
- **M6.** В `ai/kit/axiom/process/ax-preflight-blast-radius-scoped.xml` дописано `The gate proves the requirement is verified and gives 100% confidence; this is proof the spec holds.` → `ok 1 - assurance wording never overpromises`. **Замок не сработал.**
- **M7.** В `ai/kit/contract/spec/requirement-entry-format.xml` дописано `Механизм доказывает требование на 100%: проверено.` → `ok 1`. **Замок не сработал** — при том что `AUTHORING.md:247-248` §13 прямо объявляет русские «доказано»/«проверено»/«100%» предметом правила.

И это не гипотетика — остатки того же класса **уже лежат внутри корней замка** и не пойманы:
- `shared/sdd/templates.ts:1312` → поставляется в `ai/directives/sdd-v2/scaffold.directive.xml:126` и `ai/directives/sdd-v2/formats/task-ticket-structure.xml:96`: «Each scenario is tagged with the requirement **it proves**» — ровно та фраза, которую пачка исправила в `ax-bootstrap-ticket-derivation.xml:24` («proves its requirement» → «exercises its requirement»);
- `ai/directives/sdd-v2/formats/infrastructure-spec-structure.xml:112` — «**proves** the actual write-zone»;
- `ai/kit/templates/sdd-v2/reconcile.directive.hbs:251` — «A **fully verified** spec-only … branch reports completion».

Воспроизведение: `grep -rn "requirement it proves\|proves the actual\|fully verified" <rc>/ai/directives/sdd-v2 <rc>/ai/kit/templates <rc>/shared/sdd/templates.ts`.

Правка (любая из двух, с записью на доске): (а) поднять замок до заявленного — сканировать слова `proof|proves|verified|100%|доказан|проверено` с явным allow-list легитимных употреблений (canon-ID, `future-proof`, `verified <tool>@<version>`, отрицания), и вычистить три остатка выше; либо (б) переформулировать критерий T-B6-29 на доске с «grep-замок словаря» на «регрессионный замок на исправленные вхождения» и завести остаток отдельной строкой. Как есть — заявленный критерий приёмки не достигнут.

### N1 — неблокирующее (T-B6-28). `back-sync` как обещание механизма жив вне корней замка

`ai/flow-sim/scenarios/S8-reconcile-trivial.md:580` и `:627` — «patch the code, **back-sync the spec** (`sdd-sync`)», то есть именно то обещание (спека синхронизируется из кода через `sdd-sync`), которое пачка снимает; `:645` — разбор той же фразы. Корни замка (`ai/kit`, `ai/directives/sdd-v2`, `ai/skills`) туда не достают. **M3:** дописанное `<!-- reconcile can back-sync the spec from code automatically -->` в `ai/directives/testing/playwright-e2e.xml` оставляет замок зелёным — весь `ai/directives/**` вне `sdd-v2` не покрыт. Правка: расширить корень до `ai/directives` (сойдётся с B1) и решить по `ai/flow-sim/**` — либо править сценарий, либо записать его как заведомо исторический трейс. Единственное легитимное вхождение — `specs/cli/cli.spec.md:2471` («не откат/back-sync»), отрицание.

### N2 — неблокирующее (T-B6-28). `sync-from-code` исправлен, но не заперт

Доска и трек называют остаточным дрейфом **оба** слова (`61:190`, `40:855`: «keywords директивы `reconcile.directive.hbs:1` (`sync-from-code`, `back-sync`)»). Исполнитель исправил оба (правомерное расширение, отклонение задокументировано), но замок проверяет только `back-sync`. **M4:** возврат `keywords="reconcile, fix, sync-from-code, …"` → замок зелёный. Правка: добавить `sync-from-code` в отрицаемый набор `back-sync-not-promised.test.ts`.

### N3 — неблокирующее (T-B6-29). Уровень доказательства сканера: механизм есть, объявление до потребителя не доходит; ссылка в §13 неточна

Механизм реален: `services/symbol-index/symbol-index.types.ts:25` `precision: 'exact' | 'approximate'`, `services/symbol-index/select-symbol-index.ts:9` `EXACT_EXTENSIONS = new Set(['.ts', '.tsx'])`, адаптеры `TsSymbolIndexAdapter` (`services/symbol-index/implementations/tree-sitter/ts-symbol-index-adapter.ts:25`, `precision: 'exact'`) и `GrepSymbolIndexAdapter` (`…/implementations/grep/grep-symbol-index-adapter.ts:51`, `precision: 'approximate'`). Но:
1. `AUTHORING.md` §13 приписывает `TsSymbolIndexAdapter` файлу `services/symbol-index/select-symbol-index.ts` — там класса нет, там только таблица расширений. Неточная ссылка в разделе, который сам требует называть вещи по механизму.
2. `precision` **никем не потребляется**: `grep -rn "precision" cli shared` даёт только тест-стаб `cli/cmd/yagni/__tests__/yagni-index.test.ts:161` и посторонние совпадения. Ни одна находка `gennady yagni` уровень не печатает — то есть §13 «Формат находки: называть, каким адаптером получен результат» описывает поведение, которого у тула нет.
3. §13 живёт только в `ai/kit/AUTHORING.md`; **ни одна директива/аксиома на этот файл не ссылается** (все совпадения «AUTHORING» в `ai/directives/**` — несвязанный токен `AUTHORING_SCOPE`). В поставленных директивах словарь употреблён один раз (`ai/directives/sdd-v2/reconcile.directive.xml:44`). Формулировка доски «введено различение …» выполнена на авторском уровне, не на runtime-уровне — это стоит записать явно, чтобы позже не считать иначе.

### N4 — неблокирующее (T-B6-29 / D-43). Половина решения D-43 не механизирована; отчёт это переоценивает

Отчёт `R-T-B6-29.md:132`: «`checkDiagramCaptions` уже реализует **ровно это**». Реализована только вторая половина D-43 (существование процитированного ID). Первая половина — «ID требований **обязательны** в подписях диаграмм требований» — не механизирована и в коде понятия «диаграмма требований» нет: `CAPTION_LINE` (`shared/sdd/check.ts:2456`) списка ID никогда не требует, комментарий рядом прямо говорит, что это «a judgment call, not a mechanical one», а `DIAGRAM_BEARING_SECTIONS` (`:2399`) — четыре секции (`OVERVIEW`, `ARCHITECTURE`, `MODULE_MAP`, `INTER_MODULE_DEPENDENCIES`) без различения по типу диаграммы. Ответ на вопрос «только для диаграмм требований?» — **нет, различения нет**; правило обязательности живёт как авторская грамматика (`formats/diagram-vocabulary.hbs:205,213`), не как чекер. Отдельно: «применяется к новым и мигрируемым спекам» выполняется через severity `warn` для домиграционного формата и `error` для нового (`check.ts:2481`) — это не «применяется одинаково». Правка: в отчёте и на доске записать половину D-43 как «авторское правило, не механизм»; кода пачка здесь не добавила ни строки — это должно быть видно в статусе, чтобы T-B6-29 не была зачтена за работу, которой не было.

### N5 — неблокирующее (T-B6-07). Второй критерий трека не поставлен

`40-TRACK-DIRECTIVES-SKILLS.md:845` требует, помимо триггеров, критерий «the skills spec names only skills that exist on disk» и правку `ai-skills.spec.md:290` (дрейф `sdd-hooks-install`). Не сделано; отчёт честно объявляет сужение зоны. Проверил предмет: `specs/ai-skills/ai-skills.spec.md:290` действительно называет `sdd-hooks-install` среди добавленных, но это тело исторического решения **D-005**, отменённого **D-007** в том же файле (`:305-310`, «12 навыков … удалены»); Decision Log append-only, поэтому это скорее правка плана/формулировки, чем дефект кода. `ai/skills/README.md` — ни одного из 7 снятых имён, дрейфа нет. Третий пункт трека (кейс на регрессию #16) закрыт **не пачкой, а ранее**: `ai/kit/__tests__/directive-activation-announcement.test.ts` = LOCK-3, статус на доске `61:42` — ВЫПОЛНЕНО, PR #34; требование `20-ISSUES-VERDICTS.md:337` «добавить кейс в T-B6-07» избыточно. Остаток для доски: решить судьбу критерия «спека называет только существующие скиллы».

### N6 — неблокирующее (T-B6-07). Счётчик заперт только вверх

`v1-skill-names-as-triggers.test.ts:57-60` — `skillDirs.length <= BASELINE_SKILL_COUNT (12)`. Направление, которое важно для D-27 (не выросло), заперто; удаление скилла проходит молча. Замечание, не дефект задачи.

### N7 — неблокирующее (ISS-11). Сужение по зоне правомерно, но заголовок issue не достигнут; строку доски надо перевести в ЧАСТИЧНО

`20-ISSUES-VERDICTS.md` §#22 «Что требуется в v2» перечисляет пять предметов. Поставлен **один**:
1. грамматика в `ai/kit/contract/process/handoff-format.xml` — **ВЫПОЛНЕНО** (проверено чтением: `decisions` — `key=value(measured|reported|assumed)`, `open` — `id(tag; extent): text`, untagged ⇒ `assumed`);
2. `sdd-log complete` warn на нетегированные — **НЕТ** (`sdd-log.cmd.ts` вне зоны);
3. правило `audit/steps/STEP_2_SEMANTIC.xml` «untagged ⇒ assumed» — **НЕТ** (`audit.directive.hbs` вне зоны);
4. `execute.directive.xml` STEP_3: калибровка по глубине + пометка премисс, которые оркестратор дописывает от себя, — **НЕТ**. Это **центральный пример issue #22** (`20:382`: «центральный пример issue #22 — именно добавленная оркестратором неизмеренная премисса»), и он не тронут;
5. тест `cli/cmd/sdd-log/__tests__` «с тегами принимается, без тегов — warn» — **НЕТ**.

Сценарий G3 при этом — не приёмочный кейс ISS-11, а **эвал-группа** (`50-TRACK-EVAL.md:267-292`); её баром служат `E-02`/`E-05`/`E-09`, ни один из которых пачкой не двигался. Так что «G3 выполняется?» — вопрос не к этой пачке; предметно ISS-11 закрыт на 1/5. Сужение зоны правомерно (бриф прямо запрещает три из четырёх недостающих файлов, а yagni-гейт корректно отверг мёртвые парсеры — `ERR_CLI_YAGNI_UNDERUSED`, воспроизводится логикой гейта: 0 использований в production-коде), но **заголовок ISS-11 «Провенанс в Handoff различает измеренное, сообщённое и предположенное» не достигнут**: тег объявлен как `MAY`, никто его не читает, `COMPLETE_HANDOFF_PAYLOAD_RE` (`sdd-log.types.ts:252`) одинаково принимает тегированное и нет. Мелкое: subject коммита `19304ac4` «Handoff decisions/open entries **carry** a provenance tag» сильнее, чем сам контракт («MAY carry») — в пачке про обещания это стоит поправить в описании PR.

### N8 — неблокирующее. Конфликты по файлам — посчитаны, критичных нет

Пересечение `git diff --name-only f0c1703f..HEAD` с `merge-base(codex/sdd-v2-rc52-followup, <ветка>)..<ветка>`:

| Ветка | Пересечение | Оценка |
|---|---|---|
| `lead/axioms-one-home` (пачка 18) | `infra.directive.xml`, `reconcile.directive.xml` (сгенерированные), `cli/cmd/sdd-log/sdd-log.types.ts` | **`axiom/**` не пересекается**: ветка трогает `ax-mechanical-via-sdd-check`, `ax-stale-after-pivot-verification`, `ax-blocker-resolution-trail`, `ax-reopen-format`, `ax-spec-lifecycle` — ни один из 5 файлов пачки 21. `lint-axioms.ts` пачкой 21 не тронут. Риск низкий |
| `lead/migrator-red-first` (пачка 22) | `infra.directive.xml` (сгенерированный) | пересборкой; риск низкий |
| `lead/reopen-by-cause`, `lead/journal-round` (кандидаты на #48 — оба трогают `sdd-log.types.ts` + `audit.directive.hbs`) | `sdd-log.types.ts` | ханки соседей в базовой нумерации: 8, 12, 43, 77, 91, 121, 125, 154, 175, 409, 472, 764; наш — единственный, `@@ -272,0 +273,7 @@` (комментарий после `isCompleteHandoffPayload`). Перекрытия нет, трёхсторонний мерж должен пройти. `audit.directive.hbs` пачкой 21 не тронут — конфликта по нему нет |
| `lead/phase-agent-bounds` (кандидат на #38) | `execute.directive.xml` (сгенерированный) | наш дифф там — исключительно ripple текста `HANDOFF_FORMAT`; разрешается `npm run build:directives` |
| `lead/eval-honest-outcome`, `lead/eval-reproducible`, `lead/test-flake-deps` | `STEP_4_HANDOFF.xml`, `STEP_1_DERIVE.xml`, `infra.directive.xml` (все сгенерированные) | пересборкой |

`ai/kit/contract/process/handoff-format.xml` — ни одна активная ветка не трогает (B2-14 влита PR #31). Обязательный шаг Lead после любого ребейза: `npm run build:directives && npm run check:directives-fresh`. Утверждение `R-BATCH-21:178` о том, что пересечения с пачкой 15 по факту не случилось, — подтверждаю.

### N9/N10 — косметика

- Доска `61:37` и трек цитируют `sdd-log.types.ts:248-249` для `COMPLETE_HANDOFF_PAYLOAD_RE`; фактически `:252`. Дрейф плана, не исполнителя (отчёт цитирует верно) — поправить в `61-TASK-BOARD.md` и `20-ISSUES-VERDICTS.md`.
- `back-sync-not-promised.test.ts:44` — заголовок кейса называет только `ai/kit/**` и `ai/directives/sdd-v2/**`, тогда как корней три (плюс `ai/skills`).
- `R-T-B6-29.md` диаграмма «стало» указывает `AUTHORING.md:245-269` для §13; фактически раздел 245-277.
- Мой бриф называл D-43 «(диаграммы требований, O-13)»; по `01-INTERVIEW-DECISIONS.md:107` D-43 закрывает **O-10**, а O-13 — про python-пресет (D-44). Сверялся с D-43/O-10.

---

## 3. Правки (что сделать до PR)

1. **B1.** Перенести переформулировку «proof screenshot» → «render-evidence screenshot» в `ai/directives/testing/playwright-e2e.xml` (9 вхождений, включая keyword `proof-screenshot` в `:1`), и расширить корень `assurance-wording-not-overpromised.test.ts:52` с `ai/directives/sdd-v2` до `ai/directives`. Иначе — явно descope с записью на доске, и T-B6-29 не закрывается как DONE.
2. **B2.** Либо поднять замок до «словаря» (слова + allow-list) и вычистить `shared/sdd/templates.ts:1312`, `formats/infrastructure-spec-structure.xml:112`, `reconcile.directive.hbs:251`; либо переформулировать критерий T-B6-29 на доске и завести остаток отдельной строкой.
3. **N1/N2.** Расширить корень `back-sync-not-promised.test.ts:45` до `ai/directives`, добавить `sync-from-code` в отрицаемый набор, решить по `ai/flow-sim/scenarios/S8-reconcile-trivial.md:580,627`.
4. **N3.** Поправить ссылку на `TsSymbolIndexAdapter` в `AUTHORING.md` §13 (`…/implementations/tree-sitter/ts-symbol-index-adapter.ts:25`) и снять фразу «Формат находки: называть, каким адаптером…» либо оговорить, что тул уровень пока не печатает.
5. **N4.** В `R-T-B6-29.md` заменить «чекер уже реализует ровно это» на «реализована половина D-43 (существование ID); обязательность для диаграмм требований — авторское правило, не механизм».
6. **N7.** В описании PR заменить «carry a provenance tag» на формулировку контракта («MAY carry»).

## 4. Остатки для доски

- `T-B6-28` → **ВЫПОЛНЕНО** после правки 3 (расширение корня + `sync-from-code`); в примечание — остаток `ai/flow-sim/**`.
- `T-B6-29` → **не закрывать**, пока не сделаны B1 и B2. В примечание: диаграммная половина (D-43) — закрыта ранее, кода пачкой не добавлено; половина «обязательность ID» — авторское правило; словарь уверенности живёт только в `ai/kit/AUTHORING.md` §13, на который директивы не ссылаются.
- `T-B6-07` → **ВЫПОЛНЕНО**; открытым остаётся критерий трека «спека называет только существующие скиллы» (`specs/ai-skills/ai-skills.spec.md:290`) — либо мелкий фоллоу-ап, либо снятие критерия как исторического Decision-Log-текста (D-005 отменён D-007).
- `ISS-11` → **ЧАСТИЧНО** (1 из 5 предметов §#22). Завести фоллоу-ап с зоной `cli/cmd/sdd-log/sdd-log.cmd.ts` + `ai/kit/templates/sdd-v2/audit.directive.hbs` (`audit/steps/STEP_2_SEMANTIC.xml`) + `execute.directive.hbs` STEP_3 (пометка премисс оркестратора — центральный пример #22); координировать с B2-14 и с PR #48, который те же файлы уже трогает.
- Поправить в плане: `sdd-log.types.ts:248-249` → `:252` (`61-TASK-BOARD.md:37`, `20-ISSUES-VERDICTS.md` §#22).

---

## Итог

**Блокирующее (2).** B1 — `T-B6-29` снял обещание в двух аксиомах, не включённых ни в один шаблон, тогда как живая поставляемая `ai/directives/testing/playwright-e2e.xml` (9 вхождений «proof screenshot», keyword `proof-screenshot`) обещание сохранила, и две копии одного тела аксиомы разошлись. B2 — заявленный «grep-замок словаря» реализован как замок на четыре конкретные фразы: мутации M6/M7 показали, что `proof`/`verified`/`100%` и русские «доказывает/проверено/100%» возвращаются в обещающем контексте при зелёном замке, а три остатка того же класса уже лежат внутри его корней (`shared/sdd/templates.ts:1312` → `scaffold.directive.xml:126`, `formats/task-ticket-structure.xml:96`; `formats/infrastructure-spec-structure.xml:112`; `reconcile.directive.hbs:251`).

**Неблокирующее (10).** N1 `back-sync` жив в `ai/flow-sim/scenarios/S8-reconcile-trivial.md:580,627` и корень замка не покрывает `ai/directives/**` вне `sdd-v2` (M3); N2 `sync-from-code` исправлен, но не заперт (M4); N3 `precision` вычисляется, но не печатается ни одной находкой, §13 ссылается на неверный файл и не достигается из директив; N4 половина D-43 («обязательность ID для диаграмм требований») не механизирована, отчёт это переоценивает; N5 второй критерий трека T-B6-07 не поставлен (кейс #16 закрыт ранее LOCK-3 — не пробел); N6 счётчик скиллов заперт только вверх; N7 ISS-11 закрыт на 1/5 предметов §#22, центральный пример #22 (премиссы оркестратора) не тронут, subject коммита сильнее контракта; N8 конфликтов по `axiom/**` с пачкой 18 нет, `sdd-log.types.ts` не перекрывается по ханкам ни с одной из трёх веток, сгенерированные файлы решаются пересборкой; N9/N10 косметика и дрейф номеров строк в плане.

**Подтверждено.** 22/22 файла диффа имеют строку в таблице; per-commit статистика совпадает со всеми четырьмя отчётами. Все четыре гейта брифа перезапущены мной и зелёные (`npm test` 3667/0/8, `check:directives-fresh`, `audit:sdd-templates`, `gate:sdd-check-baseline`), плюс `npm run check` 5/5. Все пять команд-доказательств перезапущены: 25 pass / 0 fail. Замки отвязываются на всех пяти прямых мутациях (M1, M5, M8, M9, M10) и не дают ложных срабатываний на легитимных `future-proof`/`proven`/canon-ID/отрицаниях. T-B6-28 по существу: `sync-from-code` — 0 вхождений, «into agreement» — только честная строка `sdd-sync.cmd.ts:130`, `from-code` — реальное имя режима. T-B6-07 по существу: 7 снятых имён = точная разность v1 (12 `sdd-*` @ `d37d5910`) и v2 (8), каждое — триггер ровно одного скилла, скиллов 12 до и после, обёрток и алиас-команд нет. Диаграммная половина both-way подтверждена на существующей фикстуре (12/12) и создана не этой пачкой.

---

## Повторная проверка (после правок по вердикту)

**ВЕРДИКТ: ПРИНЯТЬ.** Оба блокирующих (B1, B2) и все адресованные неблокирующие (N1/N2, N3, N4, N7) закрыты по существу и перепроверены мной мутациями и перезапуском гейтов. Кода править не нужно; остаются точечные правки отчётов (P1-P3) и один честный остаток замка (P5).

Проверяющий: `plan-verifier`. Дерево `…/scratchpad/rc-w3`, ветка `lead/promises-not-wider`, HEAD `1d42874c` (= `origin/lead/promises-not-wider`, PR #49), база `f0c1703f` (PR #45). `git -C rc-w3 status --porcelain` — пусто; дерево не изменено. Мутации выполнялись в отдельной копии `…/scratchpad/mut2` (`cp -R rc-w3/ai mut2/ai` + `shared/sdd/templates.ts` + `{"type":"module"}`) и в извлечённом мерж-дереве `…/scratchpad/mt-merged`. Правки: `3fa45b6a` (B1/B2), `4d3b3f4f` (N1/N2), `1d42874c` (N3); дифф `19304ac4..1d42874c` — 11 файлов, +255/−69; полный дифф пачки `f0c1703f..1d42874c` — 28 файлов.

| Находка | Статус | Чем подтверждено |
|---|---|---|
| **B1** — живая `ai/directives/testing/playwright-e2e.xml` обещала «proof screenshot» | **ЗАКРЫТО** | `grep -rn -iE "proof\|proves" ai/directives/testing/playwright-e2e.xml ai/directives/testing/common.xml` → 0 обещающих вхождений в прозе; остались только canon-ID (`AX_E2E_PROOF_SCREENSHOT_ALWAYS`, `DEF_E2E_PROOF_SCREENSHOT`, `PT_E2E_PROOF_SCREENSHOT`, `HOOK_E2E_PROOF_SCREENSHOTS_CAPTURED`), их `\b`-скан не матчит. Keyword строки 1 — `render-evidence-screenshot` (было `proof-screenshot`). Тела `:56-60` и `:62-66` теперь **байт-в-байт** равны телам `ai/kit/axiom/e2e/ax-e2e-visual-regression-gated.xml` и `ax-e2e-proof-screenshot-always.xml` — дрейф двух копий, созданный пачкой, устранён. Дополнительно исправлен `common.xml:199` («It proves an implementation detail» → «exercises»). Мутация **M11** (вернуть «proof screenshot every» в директиву) → `not ok 1 - assurance wording never overpromises`, offender `ai/directives/testing/playwright-e2e.xml` |
| **B1** — корень замка | **ЗАКРЫТО** | `assurance-wording-not-overpromised.test.ts:214-222`: roots = `ai/kit/axiom`, `ai/kit/contract`, `ai/kit/templates`, `ai/kit/AUTHORING.md`, **`ai/directives`** (целиком), `ai/skills`, `shared/sdd/templates.ts` |
| **B1** — golden поставляемой поверхности | **ЗАКРЫТО** | `deployed-surface.tarball.golden.txt` отсутствует в `git diff --name-only f0c1703f..1d42874c`; md5 файла в дереве = md5 версии на `f0c1703f` (`08e4f0d7cd697a5e0209482e50c9dd32`); строка `:106` = `ai/directives/testing/playwright-e2e.xml` на месте |
| **B2** — замок словаря + allow-list | **ЗАКРЫТО** | `BANNED_WORDS` (`:46-51`) — слова, а не фразы: `\b(proof\|proofs\|proves\|proven)\b`, `\bverified\b`, `100%`, `доказан\|доказывает\|проверено`. Мутация **M6** («The gate proves the requirement is verified… 100% proof» в `ax-preflight-blast-radius-scoped.xml`) → `not ok`, offenders `proof/proves/verified/100%`; **M7** («Механизм доказывает требование: проверено.» в `contract/spec/requirement-entry-format.xml`) → `not ok`, offenders `доказывает/проверено`. `ALLOWED` (`:56-175`) — 36 точечных записей, каждая с полем `why`; span-логика (`isAllowed`, `:190`) снимает только совпадения, полностью попавшие в разрешённый спан; **исключений по файлам/каталогам целиком нет** |
| **B2** — три остатка | **ЗАКРЫТО** | `grep -rn "requirement it proves\|proves the actual\|fully verified" ai shared/sdd/templates.ts` → 0. В собранных директивах: `scaffold.directive.xml:126` и `formats/task-ticket-structure.xml:96` — «the requirement it **exercises**»; `formats/infrastructure-spec-structure.xml:112` — «**enforces** the actual write-zone»; `reconcile.directive.xml:342` — «A spec-only branch that cleared review plus operator approval #1, or a bounded-direct branch with its `DIRECT_VERIFICATION_RECEIPT`» (вместо «fully verified»). `check:directives-fresh` зелёный ⇒ сборка синхронна с `.hbs`/`templates.ts` |
| **B2** — ложные срабатывания | **ЗАКРЫТО** | `npm test` — `# tests 3675 / # pass 3667 / # fail 0 / # skipped 8`, exit 0 (см. P4 про флейк); замок зелёный и на дереве, и на мерж-дереве с `lead/axioms-one-home` |
| **N1/N2** | **ЗАКРЫТО** | `back-sync-not-promised.test.ts:55` roots = `ai/kit`, **`ai/directives`**, `ai/skills`; `:28` `BANNED_WORDS = ['back-sync', 'sync-from-code']`. Мутация **M3** (`<!-- reconcile can back-sync the spec from code automatically -->` в `ai/directives/testing/playwright-e2e.xml`) → `not ok`, offender назван; **M4** (возврат `sync-from-code` в keywords `reconcile.directive.hbs:1`) → `not ok`, offender `ai/kit/templates/sdd-v2/reconcile.directive.hbs`. Заголовок кейса (`:54`) теперь называет все три корня — N9 снят. `ai/flow-sim/**` осознанно оставлен остатком (обоснование в `R-BATCH-21` §Остатки п.5) |
| **N3** | **ЗАКРЫТО** | `AUTHORING.md` §13: ссылка → `services/symbol-index/implementations/tree-sitter/ts-symbol-index-adapter.ts` (класс `TsSymbolIndexAdapter` там реально объявлен, `:25`); фраза «Формат находки: называть, каким адаптером…» заменена оговоркой «`precision` … вычисляется на каждый адаптер, но находки `gennady yagni` его пока не печатают — задача-остаток» |
| **N4 / N7** | **ЗАКРЫТО (текстом)** | `R-T-B6-29.md:132` — D-43 записан как «реализована только вторая половина; обязательность ID — авторская грамматика, не чекер»; `R-ISS-11.md:119,124` — ISS-11 ЧАСТИЧНО (1/5), ISS-11b заведён, Lead-инструкция «MAY carry a provenance tag» для описания PR |
| **Гейты** | **ПОДТВЕРЖДЕНО** (перезапущены мной) | `npm test` 3675/3667/0/8 exit 0; `npm run check:directives-fresh` `✓ ai/directives/** matches a fresh rebuild.`; `npm run audit:sdd-templates` axiom 28 / contract 28+33 / halt 33+33 / budgets — чисто; `npm run gate:sdd-check-baseline` `OK — no error outside the baseline (227c03a8, rc-baseline-1)` |
| **Мерж с PR #50** | **ПОДТВЕРЖДЕНО** | локальные `lead/promises-not-wider` = `1d42874c` и `lead/axioms-one-home` = `682d338e` совпадают с `origin/*`; `git merge-tree --write-tree lead/promises-not-wider lead/axioms-one-home` → exit 0, дерево `a65c6d67`, конфликтов нет. Пересечение по 7 файлам (`formats/task-ticket-structure.xml`, `infra/reconcile/scaffold.directive.xml`, `ax-dispatch-via-batch.xml`, `sdd-log.types.ts`, `shared/sdd/templates.ts`). Дополнительно: оба замка прогнаны на **извлечённом мерж-дереве** (`git archive a65c6d67 ai shared/sdd/templates.ts`) — 4/4 pass, то есть после мержа словарный замок не краснеет от текста соседней ветки |

**Новые находки повторной проверки (все неблокирующие).**

- **P1 — устаревшие факты в `R-BATCH-21-promises-not-wider.md`.** `:7` «КОММИТЫ (локальные, НИЧЕГО не запушено)» — ветка запушена, PR #49; `:82` и `:124` — `HEAD=19304ac4` и «после всех 4 коммитов», фактически HEAD `1d42874c`, 7 коммитов. Правка: обновить три места.
- **P2 — файл диффа без строки в таблице.** Дифф пачки — 28 файлов; `ai/directives/testing/common.xml` не упомянут в отчёте ни разу (`grep -c common.xml` → 0), хотя изменён коммитом `3fa45b6a` (`:199` «It proves an implementation detail» → «exercises»). Остальные 27 имеют строку в §«Таблица файл → смысл» либо в §«Правки по вердикту». Правка: добавить строку.
- **P3 — описание замка в отчётах отстало от кода (mermaid «стало» в том числе).** `R-BATCH-21:50` и `R-T-B6-29:23,:88` всё ещё называют `assurance-wording-not-overpromised.test.ts` «grep-замком на 4 конкретные фразы»; узел `LOCK` в mermaid `R-T-B6-29:68` подписан «grep-замок на 4 фразы, roots: axiom/contract/directives» — по коду это словарный замок с 7 корнями и allow-list из 36 записей. Стрелки в обеих диаграммах «стало» реальны, но неполны: нет `shared/sdd/templates.ts`, `ai/directives/testing/playwright-e2e.xml`, `common.xml` → `LOCK2` (все три теперь в корнях). Правка: переподписать узел и добавить три стрелки/строки.
- **P4 — гейт `npm test` не детерминирован (не от этой пачки).** Из четырёх моих полных прогонов два красных: `not ok 78 - cli/cmd/lint/__tests__/lint.cmd.test.ts`, `failureType: 'uncaughtException'`, `error: 'Unable to deserialize cloned data due to invalid or unsupported version.'` (стек — `node:internal/test_runner/runner`), и в красных прогонах суммарное число тестов падает (3660/3666 вместо 3675). Изолированно тот же файл — 31/31 pass ×3. Файлы `cli/**` пачкой не тронуты, так что к содержанию пачки это отношения не имеет, но `R-BATCH-21:171` описывает флейк как единичный эпизод при коммите — по факту он воспроизводится примерно в половине прогонов. Правка: усилить формулировку и завести отдельную строку остатка по флейку runner'а.
- **P5 — остаточная дыра allow-list (честно записать, не чинить в этой пачке).** Записи `` /verified <tool>@<version>|`verified`/ `` (`:105`) и `/100% coverage/` (`:166`) разрешают сам токен где угодно. Мутация **M12** (`<!-- The gate \`verified\` the spec is correct; 100% coverage of intent. -->` в аксиому) → замок зелёный. Это уже, много уже, чем прежние четыре фразы (M6/M7 краснеют), но заявленный «словарь» пропускает обещание, написанное ровно этими двумя разрешёнными токенами. Правка: либо сузить эти две записи до их контекста (`` `verified` `` только рядом с `Execution-Log`/`event`, `100% coverage` только в `eslint-setup.xml`-контексте), либо записать как известный остаток.

**Остатки для доски (без изменений по существу от первой проверки).** `T-B6-28` → ВЫПОЛНЕНО (правка 3 сделана); `T-B6-29` → ВЫПОЛНЕНО (B1 и B2 закрыты; в примечании — D-43-половина как авторское правило, §13 только в `AUTHORING.md`, остаток P5); `T-B6-07` → ВЫПОЛНЕНО (открыт критерий «спека называет только существующие скиллы»); `ISS-11` → ЧАСТИЧНО, follow-up ISS-11b. Правка плана `sdd-log.types.ts:248-249` → `:252` (`61-TASK-BOARD.md:37`, `20-ISSUES-VERDICTS.md` §#22) — по-прежнему не сделана.

### Итог повторной проверки

**Блокирующее — нет.** B1 и B2 закрыты в коде, а не формулировкой: живая поставляемая директива переформулирована и снова совпадает с библиотечными аксиомами, корень замка расширен до всего `ai/directives`, замок стал словарём слов с 36 точечными allow-записями без файловых исключений, три названных остатка вычищены и доехали до собранных директив.

**Неблокирующее (5).** P1 устаревшие HEAD/«не запушено» в сводном отчёте; P2 `ai/directives/testing/common.xml` без строки в таблице файлов; P3 описание замка и узел mermaid «стало» отстали от кода; P4 флейк `lint.cmd.test.ts` воспроизводится в ~половине прогонов `npm test` (не от пачки, но гейт недетерминирован); P5 две широкие allow-записи (`` `verified` ``, `100% coverage`) пропускают мутацию M12.

**Подтверждено.** Все четыре гейта брифа перезапущены мной синхронно и зелёные. Оба замка перезапущены и отвязываются на пяти мутациях (M3, M4, M6, M7, M11) в изолированной копии; дерево `rc-w3` не изменено (`git status --porcelain` пусто до и после). Golden поставляемой поверхности байт-в-байт совпадает с базой `f0c1703f`. `git merge-tree` с `lead/axioms-one-home` (PR #50) конфликтов не даёт, и на извлечённом мерж-дереве оба замка зелёные.
