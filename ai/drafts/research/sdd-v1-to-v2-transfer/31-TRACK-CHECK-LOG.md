# 31 — Трек CHECK-LOG: sdd check, Execution Log, Task-ID, закрытие раунда, reopens, receipts

> Статус: ВЕРИФИЦИРОВАНО (B2 + V-B2, правки применены). Ждёт решений оператора (§4.2).

**Как читать.** Это чистый документ: аналитика B2 прошла независимую верификацию V-B2 (свежие глаза, read-only, 61 цитата `file:line` перепроверена по коду) и все применимые правки внесены прямо в текст — без отдельного «раздела ошибок». Три находки верификатора (A/B/C), которых не было в исходном B2, встроены в §2 и §3 на своих местах. Шесть пропущенных задач (P1–P6) добавлены в §4.1. Сырые материалы обеих сессий (полный текст B2, полный текст V-B2, включая ход рассуждений) лежат в `ai/drafts/research/sdd-v1-to-v2-transfer/_raw/31-TRACK-CHECK-LOG.raw.md` — обращайтесь туда, если нужна не выжимка, а дословный след верификации по каждой цитате.

Дата анализа: 2026-09-07. Read-only аудит; ни один отслеживаемый файл не изменён ни в одной из сессий.

- **MAIN** (v1, `origin/main` == `8bb38477`): `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`
- **RC** (v2, `codex/sdd-v2-rc52-followup` @ `11291af5`): `…/scratchpad/rc-v6`
- Фикстуры и прогоны аналитика: `…/scratchpad/B2fix/` (`all.txt`, `proj/`, `forge/`, `mig/`, `drive.mjs`, `runtests.mjs`)
- Независимые фикстуры верификатора (написаны с нуля, `B2fix/` не открывался): `…/scratchpad/Vb2/` (`empty/`, `bare/`, `mig/`, `forge/`, `legacy/`, `reopen/`, `t-*.txt`, `rc-all.txt`, `codes-ts.txt`)
- Смежные отчёты: `V-A1.md` (C9-рефутация, регион лога), `V-A4.md` (#9.1, #13, #23)

Вердикты: **ЗАКРЫТО** · **ЧАСТИЧНО** · **НЕ ЗАКРЫТО** · **НЕПРИМЕНИМО** (концепта в v2 нет и потребность исчезла — с указанием, что её заменило).

**Итог верификации в одной строке.** Согласие 21 из 21 вердиктов; 48 CONFIRMED / 10 WRONG-LINE / 3 REFUTED из 61 проверенной цитаты; предложение §3 выживает целиком; случай в целом недооценён B2, а не переоценён — подробности в §5.

---

## 0. Пять фактов, на которых держатся все вердикты ниже

Всё измерено на RC-чекауте, а не выведено из документов. Все пять байт-в-байт воспроизведены независимой верификацией на отдельных, самостоятельно написанных фикстурах (§Репро в `_raw`).

**Ф1. `sdd-check --all` над деревом без тикетов — «чисто», exit 0.**
```
$ node … cli/gennady.ts sdd-check --all B2fix/empty     # specs/README.md, ноль тикетов
[sdd-check] ✅ clean — 1 file(s) checked                → EXIT=0
$ node … cli/gennady.ts sdd-check --all B2fix/bare      # пустой каталог
[sdd-check] ✅ clean — 0 file(s) checked                → EXIT=0
```
Аналога v1-го `NO_TICKETS_FOUND` (exit 2) нет: обход `mdFiles` в `cli/cmd/sdd-check/sdd-check.cmd.ts:1275-1295` заполняет `ticketRefs` (`:1285`), но пустота этого массива нигде не проверяется. `help.ts` объявляет только коды `0 clean / 1 error(s) / 4 bad invocation`.

**Ф2. Единственный настоящий v2-тикет в RC-дереве не имеет ни одного receipt и закрыт с 35 записями после закрытия раунда.**
`specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md` (900 строк, Meta `Status: [x] DONE`, все 10 фаз `[x]`):
- `grep -c SDD_PHASE_RECEIPT` → **0**;
- `#### Round close` + `- [x] 02:03:07 DONE` на строке **768**, после него блоки `#### P3 — re-run:`, `#### P1 — re-run:`, `#### P10 — re-run:` с **35** отмеченными записями, **4** строками `DONE` и **3** строками `**Handoff →**` (строки 769–817), нового `### Round 3` не открыто;
- `sdd-check --all` по этому тикету не выдаёт **ни одной** находки класса LOG/RECEIPT/ROUND (все находки — `SDD_BDD_REQUIREMENT_UNTRACED`, `SDD_BDD_SCENARIO_UNTESTED`, `SDD_VERIFICATION_TABLE_INVALID`).

**Ф3. Реальный словарь токенов в 1,5 раза шире объявленного.** Перепись первых слов 129 событийных строк того же тикета:
```
47 ver · 35 discovery · 15 DONE · 7 ✅ · 6 yagni · 4 intro · 4 decision · 3 fix · 3 env-fix · 2 verified · 2 correction: · 1 insight
```
Объявленный словарь (`shared/sdd/templates.ts:1581`): `intro · decision · tried · discovery · insight · verified · SDD_PHASE_RECEIPT · BLOCKED · DONE`. Вне словаря: `ver` (47!), `yagni`, `fix`, `env-fix`, `correction:` — **61 строка из 129 (47 %)**. В v1 каждая из них — находка `unknown-token` (`check.sh:514-518`). Независимая перепись сошлась до единицы; токен зафиксирован как `correction:` — с двоеточием.

**Ф4. `sdd-log` принимает произвольный токен и пишет после закрытого раунда.** Прогон на фикстуре `B2fix/forge` (канонический скелет + маркер `<!--PHASE_RECEIPTS:v1-->`):
```
line "totallyUnknownToken did a thing" --phase P1        → EXIT=0
complete "artifacts: […]; …" --phase P1                  → EXIT=2  ERR_CLI_SDD_LOG_COMPLETE_STATE: phase P1 has no CLI-owned SDD_PHASE_RECEIPT
line "DONE" --phase P1                                   → EXIT=0   ← обход `complete`
handoff "artifacts: […]; decisions: […]; open: […]; deviations: […]" --phase P1 → EXIT=0
close                                                    → EXIT=0   [sdd-log] status → DONE
phase P2                                                 → EXIT=0   ← блок фазы ПОСЛЕ `#### Round close`
line "correction | Round 1/P1 exit: 1 -> 0"              → EXIT=0   ← запись после закрытия
```
`complete` — единственный режим с гарантией; `line` + `handoff` воспроизводят байтовую форму закрытой фазы без receipt, а `close` пишет `Meta Status → [x] DONE` (`cli/cmd/sdd-log/sdd-log.cmd.ts:485`) не проверив ни одной фазы. Независимый прогон верификатора добавил то, что B2 не записал: на **receipt-aware** тикете `sdd-check` после этой последовательности всё же даёт `SDD_EXECUTION_LOG_PHASE_DUPLICATE` (два блока `#### P2`) и два `SDD_DONE_PHASE_UNCHECKED` — обход не полностью бесшумен (подробности в C6/C12 §1 и §Репро Р4 в `_raw`).

**Ф5. `nextRoundNumber` считает `### Round N` по всему файлу.** Фикстура `B2fix/proj`: `### Round 1` внутри `EXECUTION_LOG` + унаследованный `## Critic Rounds` / `### Round 7` за пределами секции → `nextRoundNumber = 3` (`cli/cmd/sdd-log/sdd-log.types.ts:76-79`). Для сравнения, `memberRoundCount` в `shared/sdd/group-receipt.ts:63-67` ту же величину считает **внутри** `extractSection(content,'EXECUTION_LOG')` — но лишь пока секция читаема (см. уточнение в C7 §1). Асимметрия внутри одного релиза. Живой радиус на RC-дереве измерен в C7/D3 §1 ниже: три тикета, `nextRoundNumber` вернёт на них 3, 3 и 4 вместо 1.

Все релевантные RC-тесты зелёные и воспроизведены независимо, до единицы: `cli/cmd/sdd-log/__tests__/sdd-log.cmd.test.ts` 63/63; `shared/sdd/__tests__/{check,check-phases,check-taskgraph,check-taskid-grammar,check-legacy-ticket,group-receipt,phase-receipt,task-id,section}.test.ts` 160/160; `cli/cmd/sdd-check/__tests__/*` + `sdd-log/__tests__/group-receipt.cmd.test.ts` + `sdd-task` + `sdd-extract` 183/183. Внутренние счётчики `it` разошлись на двух файлах (см. C4 в §1). То есть всё, что ниже помечено «НЕ ЗАКРЫТО», не сломано — оно просто не описано ни одним тестом.

---

## 1. Матрица инвариантов

### C1 — грамматика Task-ID и однозначность разбора

**v1.** `SDD_TASK_ID_RE='TSK-([A-Z]+-[0-9]{3}|[0-9]+)'`, путевая форма — ровно три цифры; парсинг «взять токен целиком, затем проверить с якорями» и граница `([^A-Z0-9-]|$)`, чтобы `TSK-IB-0012` никогда не читался как `TSK-IB-001`. `ai/skills/sdd-execute/scripts/_sdd-lib.sh:36-97`, тесты `scripts/__tests__/sdd-task-id.test.ts`.

**v2.** Грамматика другая: `<ACR>-<slug>` = `^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$` (`shared/sdd/task-id.ts:16`), плюс `SLUG_MAX_LEN = 8` (`:19`), валидатор `validateTaskId` (`:38-46`). Проблема неоднозначности решена не парсингом, а **запретом самой конфигурации**: `findPrefixClashes` (`shared/sdd/task-id.ts:166-177`) → `SDD_TASK_ID_PREFIX_CLASH` (`shared/sdd/check.ts:1392-1406`, без v1/v2-гейта — намеренно, чтобы ловить коллизии в миграции), плюс `SDD_TASK_ID_COLLISION` (`check.ts:1385`). Обнаружение тикетов — по содержимому Meta и по имени `<module>.task.<ID>.md` (`task-id.ts:63` `V2_TASK_FILENAME`), не по глобу. Сама грамматика проверяется только для v2-тикетов под `specs/` — `isV2SpecsTicket` (`cli/cmd/sdd-check/sdd-check.cmd.ts:962`, вызовы `:1194`, `:1374`).
Тесты: `shared/sdd/__tests__/task-id.test.ts`, `check-taskid-grammar.test.ts`, `check-taskgraph.test.ts`.

**Вердикт: ЗАКРЫТО** (механизм иной, потребность закрыта строже: v1 умел безопасно **читать** двусмысленные ID, v2 запрещает их **создавать**).

**Оговорка (не про инвариант, про дерево).** В самом RC-дереве живут 3 `SDD_TASK_ID_COLLISION`, среди них настоящий дубль, подтверждённый построчно: `tasks/vcs/vcs-mr-client/vcs-mr-client.task-88.md:7` и `tasks/dbc/dbc-linter/dbc-linter.task-88.md:7` — оба `**Task-ID:** TSK-88`. Проверка работает, дерево грязное.

### C2 — коды выхода: никогда `findings=0` без проверенного объекта

**v1.** `--task` с плохим или отсутствующим ID → exit 4; дерево без тикетов → `NO_TICKETS_FOUND` exit 2; находки → exit 3. `check.sh:49-54,97-120,160-161,193-199,663-666`.

**v2.** `--task` держится: неизвестный, но ID-образный аргумент → `ERR_CLI_SDD_CHECK_UNKNOWN_ID`, **exit 2**, со списком известных Task-ID; нечитаемый путь → `ERR_CLI_SDD_CHECK_FILE`, **exit 1**; `findings=0` в этих случаях не печатается. `--all` над нулём тикетов → **exit 0 «clean»** (Ф1).

**Вердикт: ЧАСТИЧНО — дыра шире, чем видно по одному прогону.** Ровно та дыра, которую A4 зафиксировал по #9.1, воспроизведена; независимая верификация нашла ещё три грани того же дефекта:
1. **путевой v1-й ID деградирует до «файл не читается».** `TSK-IB-001` не проходит `looksLikeTaskId` (заглавные буквы в слаге запрещены v2-грамматикой) и обрабатывается как нечитаемый путь — `ERR_CLI_SDD_CHECK_FILE` exit 1, без списка известных ID, вместо `UNKNOWN_ID` exit 2. В v1 тот же плохой ID давал exit 4 («bad invocation»), а не «файл не читается»;
2. **exit 2 нигде не задокументирован.** `help.ts:92` объявляет ровно `0 clean / 1 error(s) / 4 bad invocation`; `ERR_CLI_SDD_CHECK_UNKNOWN_ID` возвращает 2, о котором в help — ни слова;
3. **асимметрия `--all` vs `--task` на одном и том же легаси-тикете.** Фикстура с v1-заголовками (`## 1. Meta & Traceability` … `## 5. Execution Log`, `**Task-ID:** TSK-IB-001`): `--all` роутит его в `checkLegacyTicket` (`sdd-check.cmd.ts:1378-1380`) → 0 ошибок, exit 0 (только `SDD_LEGACY_TICKET_UNANCHORED`/`SDD_TRACKER_MISSING_ROW` warn); `--task` на том же самом файле гонит полный `checkTicket` → `SDD_MISSING_META` + `SDD_MISSING_EXECUTION_LOG`, exit 1. Тот же файл — 0 ошибок в одном режиме и 2 ошибки в другом. Это самостоятельный дефект: «зелёный на дереве, красный по одному» — ровно тот false-green, ради которого C2 существует.

### C3 — orphan-скан `@tasks` по 15 расширениям

**v1.** `[TASKID]`: `.ts .js .sh .go .swift .m .mm .h .kt .java .py .rb .rs .cs .php` (`check.sh:282-286`) — 15 расширений (B2 в прозе ошибочно писал «14», хотя перечисляла верно все 15; здесь исправлено).

**v2.** Механической проверки orphan-`@tasks` **нет вообще** — ни кода `SDD_*`, ни грепа. Есть только:
- `SDD_TASKS_APPEND_ONLY_REGRESSION` (`shared/sdd/tasks-append-only.ts:35-51`) — заголовок `@tasks:` не теряет ID, бывший в HEAD; язык-агностично, читает любой файл;
- `SDD_CONSUMERS_UNRESOLVED` — грепает `--include=*.ts --include=*.tsx --include=*.js` (`cli/cmd/sdd-check/sdd-check.cmd.ts:699-701`);
- индекс тест-файлов для BDD — `/\.(test|spec)\.(ts|tsx|js)$/` (`:503`).
Проверка «каждый ID из `@tasks:` имеет тикет» перенесена в агента: `ai/kit/axiom/audit/ax-task-id-integrity.xml` («Each ID has a corresponding `specs/**/*.task.<ID>.md`. Orphan → `TASK_ID_DRIFT` (`MAJOR`)»).

**Вердикт: НЕ ЗАКРЫТО** (механически). Потребность не исчезла: на Swift/ObjC-проекте оба сохранившихся скана структурно молчат — тот же класс ложного зелёного, что в #9.2. Замена в модели v2 — семантический аудитор, но у него нет ни списка расширений, ни детерминированного индекса.

### C4 — таксономия находок `[LOG]`

**v1.** Находки: `unknown-token`, `unclosed-round`, `fabricated-placeholder`, `bad-round-close`, `entry-after-close`, `extra-close-entry`; информационные: `retired-token` (`sync file test cov rules recon`), `round-close-no-timestamp`. `check.sh:21-29,495-651`, 28 тестов в `sdd-check-log.test.ts`.

**v2.** Коды `shared/sdd/check.ts`:

| v1 | v2 | где |
|---|---|---|
| `fabricated-placeholder` | `SDD_FABRICATED_DONE` (error) | `check.ts:485` — `[x]`-строка с неподставленным `<…>`; вокруг него 8 тестов на ложные срабатывания (`check.test.ts:131-283`) |
| — | `SDD_MISSING_EXECUTION_LOG` (error) | `check.ts:448` |
| — | `SDD_DONE_WITH_ACTIVE_BLOCKER` (error) / `SDD_BLOCKER_OPEN` (warn) | `check.ts:493,498`, движок `scanBlockerTrail` (`:249-284`) с пофазным FIFO-пулом |
| — | `SDD_DONE_WITH_PLACEHOLDERS` (warn) | `check.ts:509` |
| — | `SDD_EXECUTION_LOG_ROUND_MISSING` / `_PHASE_MISSING` / `_PHASE_DUPLICATE` / `_PHASE_ORPHAN` | `check.ts:551,559,564,571` — **только Round 1** (`firstRoundPhaseBlockCounts`, `:219-241`) и **только** при маркере `<!--PHASE_RECEIPTS:v1-->` (`:210`, гейт `:547`) |
| `unknown-token`, `retired-token` | **нет** | словаря токенов в коде нет ни в `check.ts`, ни в `sdd-log` (Ф3, Ф4) |
| `unclosed-round` | **нет** | см. C5 |
| `bad-round-close`, `entry-after-close`, `extra-close-entry`, `round-close-no-timestamp` | **нет** | см. C6 |

Тесты: `shared/sdd/__tests__/check.test.ts` (**40 it**, не 44 — независимый пересчёт), `check-phases.test.ts` (**11 it**, не 12, включая `:171` «flags a missing Round 1 for the current receipt-aware contract» и `:184` «grandfathers an older V2 ticket without the receipt schema marker»).

**Вердикт: ЧАСТИЧНО.** Половина про фабрикацию и блокеры — ЗАКРЫТО и даже шире v1 (пофазное спаривание 🛑/✅). Половина про словарь и целостность раунда — НЕ ЗАКРЫТО.

### C5 — `unclosed-round` только при ≥1 отмеченной фазовой строке

**v1.** Раунд без закрытия — находка, но пустой скелет ею не считается (`f8d42a33`, `check.sh` [LOG] awk; тест «says nothing about a round that never ran»).

**v2.** Проверки «раунд открыт и не закрыт» нет. `sdd-log round` ставит `Meta Status → [~] IN_PROGRESS` (`sdd-log.cmd.ts:479`), `close` — `[x] DONE` (`:485`); зависший `IN_PROGRESS` никем не диагностируется — `grep IN_PROGRESS shared/sdd/check.ts cli/cmd/sdd-check/*.ts` даёт ноль. Ложных срабатываний на скелете тоже нет — по той же причине.

**Вердикт: НЕ ЗАКРЫТО.** Опасность частично снята тем, что закрытие теперь пишет CLI, а не агент, но «оркестратор не позвал `close`» остаётся необнаруживаемым, и именно так выглядит незавершённая партия в очереди (`execute.directive.xml:181` `all`/`batch`/`queue`). Воспроизведено независимо: `sdd-log round` на тикете с незакрытым скелетом Round 1 молча открывает следующий раунд.

### C6 — целостность после закрытия раунда

**v1.** Отмеченная запись со штампом позже собственного `Round close` → `entry-after-close`; отмеченная timestamped live-запись **внутри** блока закрытия → `extra-close-entry`; `T09:00Z` и `T09:00:00Z` сравниваются в равной точности. `check.sh:538,567,593-600,643`, 7 тестов «post-close integrity».

**v2.** Нет структурной проверки, и есть два независимых канала записи после закрытия:
1. `line` / `phase` / `handoff` / `blocker` / `resolved` без `--phase` вставляются в `bounds.closeLine` — конец **секции**, то есть после `#### Round close` (`sdd-log.cmd.ts:420`, ветки `:433-469`, вставка `:509-510`). Воспроизведено (Ф4).
2. `completePhase` ищет заголовок фазы в диапазоне `currentRound + 1 … log.closeLine` (`sdd-log.types.ts:319-323`) и **не останавливается** на `#### Round close` — значит блок `#### P3 — re-run:`, созданный после закрытия, считается «текущим раундом» и закрывается штатно.
Второй `close` при этом откажет («current Round is already closed», `sdd-log.types.ts:157`), так что раунд остаётся навсегда закрытым, а работа продолжает в него дописываться. Именно эта картина — в DA-lazy-asm (Ф2).

**Вердикт: НЕ ЗАКРЫТО, но не «нет ничего».** На **receipt-aware** тикете часть подделки всё же ловится: блок фазы, открытый после `#### Round close`, даёт `SDD_EXECUTION_LOG_PHASE_DUPLICATE` (или `_PHASE_ORPHAN`, если id новый), а фиктивное закрытие с незакрытой фазой — `SDD_DONE_PHASE_UNCHECKED` (воспроизведено дважды независимо). Не ловится ничего из этого: (а) **событийная строка** после `Round close` (`correction …` — ни одной находки на receipt-aware тикете) и (б) вообще ничего на **не-receipt-aware** тикете — то есть на всём корпусе RC, где маркер сейчас не несёт ни один тикет (Ф2). Это остаётся самой дорогой потерей трека: пост-закрытие уже произошло на живом артефакте, и никто не увидел даже ту его часть, которую receipt-aware проверка технически ловит.

### C7 — регион Execution Log; `## Critic Rounds` не парсится как лог

**v1.** v1 читал регион по жёсткому входу `/^## 7\. Execution Log/` (`ai/skills/sdd-execute/scripts/check.sh:557`); якоря `<!--SECTION:EXECUTION_LOG-->` сознательно **не** использовались как делимитеры (`check.sh:554-556`, с прямой ссылкой на конкретный файл `cli-sync-skills.task-57.md` как причину не полагаться на них); в `f8d42a33` расширили только **выход** из региона — «любой `## ` завершает секцию» (`:558`). Функции `sdd_lib_execution_log` в MAIN не существует (`grep sdd_lib_execution_log` → 0) — прежняя формулировка про «единое правило региона `sdd_lib_execution_log`» была ошибочной цитатой, унаследованной из более раннего анализа (A4/#15); здесь исправлена.

**v2.** Структурно сильнее: `extractSection` / `findSectionBounds` требуют ровно одну сбалансированную пару маркеров (`shared/sdd/section.ts:141,192`), плюс `SDD_ANCHOR_UNBALANCED` и `SDD_SECTION_OVERLAP` (`check.ts:430,433`) — вложенность и перекрытие секций диагностируются отдельно. `memberRoundCount` (`group-receipt.ts:63-67`, в независимой перепроверке — `:64-68`) корректно сужает счёт до секции — **пока секция читаема**: при `log.status !== 'ok'` та же функция откатывается на подсчёт `### Round` по **всему файлу** (`:65-66`), то есть подпись группового receipt на legacy-члене группы завязана на то же полнофайловое число, что ломает `nextRoundNumber` (см. §2.4). Асимметрия внутри одного релиза шире, чем выглядит на первый взгляд.
**Остаток:** `nextRoundNumber` (`sdd-log.types.ts:76-79`) — единственная функция в цепочке, которая безусловно читает `fileContent` целиком; воспроизведено, `nextRoundNumber = 3` вместо 2 (Ф5).

**Вердикт: ЧАСТИЧНО** — для новых тикетов закрыто; хвост — на мигрированных v1-тикетах, у которых `## Critic Rounds` остаётся как исторический мусор миграции, а не как что-то предписанное директивой. (Прежняя ссылка на `infra.directive.xml:51` как на предписание сохранять `## Critic Rounds` была неверной: этот параграф — `AX_SPEC_LIFECYCLE`, и он говорит ровно обратное — «Temporary Change Manifest, per-line review marks, **Critic Rounds**, publication state, and migration between V2 subformats **are not part of the specification**»; и относится к **спекам**, а не к тикетам.) Измеренный радиус: `## Critic Rounds` с вложенным `### Round N` несут **3 живых тикета** RC-дерева — `tasks/cli/sync-skills/cli-sync-skills.task-56.md` (2 заголовка), `…task-57.md` (2, тот самый файл, который v1-й `check.sh:555` называет по имени как причину не использовать якоря делимитерами — хорошая перекрёстная проверка обеих сторон), `tasks/ai-skills/sdd-skills/sdd-skills.task-61.md` (3); на всех трёх внутри `EXECUTION_LOG` — 0 раундов, значит `nextRoundNumber` вернёт **3, 3 и 4** вместо 1 (воспроизведено).

### C8 — `[REOPENS]`: Meta `Reopens` = число раундов, ВЫЗВАННЫХ аудитом

**v1.** Двусторонняя причинность по записям `@audit … triggered-reopen=Round-N`, вердикты `OK|PENDING|MISMATCH|UNVERIFIABLE`; никогда не «число заголовков − 1». `check.sh:19,347-418`, тесты `sdd-check-log.test.ts:230,238,319-341`.

**v2.** Данные для проверки есть, проверки нет:
- поле `Reopens` объявлено в `formats/task-ticket-structure.xml:36`, `scaffold.directive.xml:181`, `templates.ts:1251`, и как колонка трекеров — `formats/module-tasks-index.xml:12`, `formats/scope-tasks-index.xml:31`, `templates.ts:1440,1522` (и `:1468,1557`);
- машиночитаемая причинность объявлена: `formats/audit-round.xml` — `@audit … after-exec-round=<M> triggered-reopen=<Round-M+1|none>`;
- обновляется вручную агентом: `ai/kit/axiom/process/ax-reopen-format.xml` («Update `Reopens: <new count>`»), `reconcile.directive.xml:113,194,250`;
- в коде: `grep -rn Reopens shared/ cli/` → только шаблоны и заголовки таблиц; в `shared/sdd/check.ts`, `shared/sdd/tracker.ts`, `cli/cmd/sdd-log/**` — **ноль**.

**Вердикт: НЕ ЗАКРЫТО.** Противоречие #13 («Round headers − 1» vs «только аудит-раунды») в v2 снято — формулы «−1» нигде нет; но замка тоже нет, а значит расхождение Meta ↔ `@audit` вернётся молча. Плюс словарь причин раунда так и остался неформализованным: `sdd-log round "<reason>"` принимает любую строку (`sdd-log.cmd.ts:433-435`), подсказка `initial | fix: F-NNN | resume` живёт только в JSDoc `buildRoundHeader` (`sdd-log.types.ts:84`). Третье противоречие обнаружено независимой верификацией: `ax-reopen-format.xml` предписывает `Set ticket Meta Status → [ ] TODO`, а `sdd-log round` фактически пишет `[~] IN_PROGRESS` (`sdd-log.cmd.ts:479`) — статус в тикете и предписание расходятся с первого же реопена, сделанного по аксиоме.

### C9 — `[RULES]`: четыре проверяемые секции в каждом файле правил

**v1.** Каждый не-`*.directive.xml` файл в каскадных категориях обязан нести `<BeliefState>`, `<AntiPatterns>`, `<VerificationHooks>`, `<RewardCriteria>`; отдельный счётчик `rule_findings=`. `check.sh:20,33-43,436-438,663`.

**v2.** Проверяется другое: **замкнутость каскада**, а не наполнение файла — `SDD_RULES_CASCADE_UNRESOLVED` (`shared/sdd/rules-cascade.ts`, объявлено в `cli/cmd/sdd-check/help.ts:49`: «each phase Rules: list is the full `<DependsOn>` closure» + путь-как-доказательство: небезопасный/отсутствующий/симлинк-путь fail-closed). Отдельного `rule_findings=` нет, находка идёт в общий счётчик. Проверки четырёх секций нет (`grep BeliefState shared/ cli/` → 0); она перенесена в аудит — `RULE_FILE_INCOMPLETE` в таксономии (`audit.directive.xml:188` — маршрут «ticket update … OR a separate rule-maintenance task»).

**Вердикт: НЕ ЗАКРЫТО в этой форме.** Потребность частично покрыта иначе (замкнутость каскада — то, чего в v1 не было), но «правило-пустышка проходит зелёным» вернулось. Это стык с треком RULES; здесь фиксирую только то, что `sdd-check` перестал быть его владельцем.

### C10 — `[x] DONE` означает «прошёл аудит»

**v1.** Закрытие раунда ставит `[~] IN_PROGRESS`; `[x] DONE` пишет **только** аудит с вердиктом PASS, он же ре-синхронизирует трекеры; pickability считает по DONE. `ai/skills/sdd-execute/SKILL.md:49-50,124` (дословно: «Set ticket Meta Status → `[~] IN_PROGRESS`. **Not `[x] DONE` — the round is closed, not verified.** … only on audit PASS. Dependents pick on `DONE`»), `tasks/README.md:83`, `scaffold.directive.xml:241` (`AX_AUDIT_HOOK`).

**v2. Инвариант сознательно перевёрнут, и это задокументировано.** `ai/kit/axiom/process/ax-audit-hook.xml`: «A ticket closes on its own phase gates — `[x] DONE` is mechanical close, not verification». `execute.directive.xml:64`: «Enforcement point is the GROUP-COMPLETION boundary, never `sdd-log close` (close precedes audit — requiring a receipt at close would deadlock)». Новый гейт — групповой receipt:
- писатель `sdd-log <group> audit-receipt <verdict>` / `review-receipt` (`sdd-log.cmd.ts:295-299`), отказ пока не все члены `[x] DONE` (`group-receipt.ts:149` в `buildGroupReceipt`), привязка к HEAD и подпись по `[basename, roundCount, done]` (`group-receipt.ts:104-119`, `deriveGroupState`);
- читатель `checkGroupReceipts` (`group-receipt.ts:294-320`) → `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING`;
- реопен (новый `### Round N` у любого члена) инвалидирует подпись → receipt становится stale.

Что при этом **не** удержано:
1. `sdd-log close` пишет `Meta Status → [x] DONE` (`sdd-log.cmd.ts:485`) **без единой проверки**: в Ф4 закрытие прошло при фазе P1 со статусом `[ ]` в Phases Overview и неотмеченным скелетом `- [ ] <ts> DONE`. Ловится это позже и косвенно — `SDD_DONE_PHASE_UNCHECKED` (`check.ts:581`) — и только если строку Overview никто не поправил руками.
2. Находки групповых receipt — **`severity: 'warn'`** (`group-receipt.ts:316`), то есть exit-код не портят.
3. Группа вообще не оценивается, если хотя бы один член без маркера: гейт `every(memberIsReceiptAware)` (`group-receipt.ts:298`). В RC-дереве маркер `<!--PHASE_RECEIPTS:v1-->` не несёт **ни один** тикет (только две спеки и `ai/flow-eval/docs/flow-verification-ledger.md`) — значит проверка сейчас выключена на всём корпусе.
4. `AX_AUDIT_HOOK` обещает: «Until the group's audit returns PASS, TICKETS OF OTHER SPECS that depend on this spec stay blocked». Механически это не так, и не по той причине, что казалось на первый взгляд: `sdd-task --audit-group` (`sdd-task.cmd.ts:239-241` → `shared/sdd/audit-group.ts`) существует, но отвечает на вопрос «все ли члены группы `[x] DONE`», а не «есть ли валидный `SDD_AUDIT_RECEIPT`» (`grep receipt shared/sdd/audit-group.ts` → 0); `pickableTasks` (`check.ts:1349-1364`) смотрит только Meta `Status` и `Dependencies`. Кросс-спековая блокировка — прозаическое обещание без механики с обеих проверенных сторон.

**Усиление (находка B независимой верификации).** Инвариант, который нарушает `sdd-log close`, задокументирован не только в `AX_AUDIT_HOOK`, но и в самом сгенерированном SSOT: `templates.ts:1579,1583` и зеркало `formats/project-tasks-index.xml:18,20` дословно объявляют «Baseline Completion Rule: a Round cannot go `[x] DONE` until — every phase `[x]` with a current CLI-owned verification receipt …» и «until PASS the round is closed-but-unverified and **dependents are blocked**». Это попадает в **каждый** сгенерированный `specs/3-tasks.md`. Итого необеспеченное обещание живёт в **четырёх** местах, а не в одном `AX_AUDIT_HOOK` — проект получает конвенцию, которую `sdd-log close` нарушает первым же вызовом.

**Вердикт: ЧАСТИЧНО.** Как модель — законная замена (аудит группы вместо аудита тикета, receipt вместо галочки). Как замок — слабее v1: v1 не мог написать `DONE` без PASS вообще, v2 пишет `DONE` первым и предупреждает об отсутствии аудита на уровне warn, выключенного грандфазерингом.

### C11 — канонический словарь токенов живёт в одном месте

**v1.** Таблица только в `scaffold.directive.xml:709-721` (`ROUND_CLOSE_FORMAT`), `tasks/README.md:36-44` её зеркалит с явным «single source of truth … must never diverge»; awk-словарь (`check.sh:525`) **включает `ver`**; `sync <scope>+root` — не токен. Тесты «accepts a log using only canonical tokens» / «flags a token outside the vocabulary».

**v2. Не трёхсторонний, а семисторонний дрейф плюс висячий указатель.**

| источник | что говорит | собран в директиву? |
|---|---|---|
| `shared/sdd/templates.ts:1581` (генератор `specs/3-tasks.md`) | `intro · decision · tried · discovery · insight · verified · CLI-owned SDD_PHASE_RECEIPT · BLOCKED · DONE` — **без `ver`, без `yagni`** | да (через сгенерированный файл) |
| `ai/directives/sdd-v2/formats/project-tasks-index.xml:19` | то же самое | да (build-output) |
| `specs/3-tasks.md:12` (фактический файл в репозитории RC) | `… verified · **`ver <cmd> → pass|fail exit=<N>`** · BLOCKED · DONE` — `ver` есть, `SDD_PHASE_RECEIPT` нет | это данные, не директива |
| `ai/kit/axiom/audit/ax-execution-log-verification.xml` | «Token vocabulary in **`scaffold.directive.xml` Execution Log Template**» + «Required per phase block: **`ver`** (one final result), `DONE`, `**Handoff →**`, `intro …`, **`verified` for `config`-kind**, `BLOCKED …`» — **требует** `ver` | да (партиал) |
| `ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml:131` | `EXECUTION_LOG_INCOMPLETE` ⇐ «mandatory closing lines missing (**`ver`** / `DONE` per phase, `DONE` at Round close)» — тоже **требует** `ver` | да |
| `ai/directives/sdd-v2/audit.directive.xml:153` (`AX_AUDIT_YAGNI_CROSSCHECK`) | требует строку **`<ts> yagni <name> ← <reason>`** | да |
| `ai/kit/contract/process/phase-block-format.xml:10-20` | несёт `yagni` (`:11`), не несёт `ver`, трёхполевой Handoff — **седьмой** дом словаря | **НЕТ — партиал никем не подключён** (см. находку A ниже) |

Плюс указатель «где искать словарь» противоречит сам себе, и каждая половина — в двух копиях (xml + генератор): «Token vocabulary lives in `<module>.3-tasks.md`» — `formats/task-ticket-structure.xml:141`, `scaffold.directive.xml:286`, **и `templates.ts:1356`**; «Project-wide conventions (Execution-Log token vocabulary …) are declared once in `specs/3-tasks.md` … not repeated» — `formats/module-tasks-index.xml:31`, **и `templates.ts:1459`**. То есть тикет отправляет читателя в модульный индекс, который прямо говорит, что словаря не несёт, — и `ax-execution-log-verification.xml` отправляет в `scaffold.directive.xml`, где в v2 таблицы нет вовсе.

**Находка A независимой верификации: ни один собранный директив v2 не несёт таблицу токенов.** `ai/kit/contract/process/phase-block-format.xml` — handlebars-партиал, но **ни один `.hbs` его не подключает** (`grep -rn 'contract/process/phase-block-format' ai/kit/templates` → 0). Всего таких неподключённых кирпичей **семь**: `blocker-format`, `orchestrator-progress-format`, `phase-block-format`, `phase-progress-format`, `return-summary-format`, `side-dive-format`, `trace-header-format`. `PHASE_BLOCK_FORMAT` и `BLOCKER_FORMAT` — форматы, на которые ссылается JSDoc самого CLI (`sdd-log.types.ts:226`), — фазовый агент **не читает никогда**. Единственное собранное объявление словаря — `templates.ts:1581` через сгенерированный `specs/3-tasks.md`. Это исчерпывающе объясняет Ф3 (47 % строк вне словаря): агент физически не видит семь из восьми потенциальных источников правил о том, что можно писать в лог.

Дрейф выходит за пределы токенов: **Baseline Completion Rule** тоже разошлась. `templates.ts:1579` / `project-tasks-index.xml:18` требуют «every phase `[x]` **with a current CLI-owned verification receipt**»; фактический `specs/3-tasks.md:11` в RC этой оговорки не несёт — уже сгенерированный SSOT отстал от собственного генератора не в одной строке, а в двух.

**Вердикт: НЕ ЗАКРЫТО, случай сильнее заявленного.** Это же и корень #23: у `correction` нет места, куда его добавить, потому что канонического места нет. Живое следствие — Ф3: 47 % строк вне словаря, включая самый частый токен `ver`, который два документа аудита **требуют**, а собранная таблица токенов **удалила**. Отдельная оговорка: закрытость словаря как **семантическая норма** жива дословно (`ax-execution-log-verification.xml`: «Line with a token outside the vocabulary → `EXECUTION_LOG_INCOMPLETE` (MINOR, «padding»)»). Пропала не норма, а механическая проверка — читать это как «v2 сознательно открыл словарь» неверно.

### C12 — фаза обязана прогнать verify перед Handoff; `ver` == исполненная команда

**v1.** `<sdd-path> verify --wip <target-files>` до `EMIT_HANDOFF`, одна строка `ver` на вызов, per-gate «pass» запрещены, строка команды обязана совпасть с исполненной (иначе `fabricated-verification`). `phase-execution-protocol.xml:90,322,332`.

**v2. Заменено и усилено: доказательство теперь пишет CLI, а не агент.**
- `AX_VERIFICATION_BEFORE_HANDOFF` (`execute.directive.xml:39-40`): «The CLI, not the phase agent, structurally selects and runs the ladder plus every applicable ticket §5 command verbatim, then atomically writes their exact command/role/exit evidence and Target File state as the phase receipt». Тут же, `:42` — «a hand-written `ver` line is not evidence» (важно для D1 в §4.2).
- `sdd-log complete` отказывает без receipt: `if (!receipts.receipts.some(r => r.phase === phaseId)) return { ok:false, detail: 'phase P… has no CLI-owned SDD_PHASE_RECEIPT' }` (`sdd-log.types.ts:284-287`) — воспроизведено, exit 2 (Ф4).
- Receipt несёт хеши плана, окружения и целевых файлов: `phaseReceiptPlanState` (`phase-receipt.ts:91`), `phaseVerificationEnvironmentState` (`:1203`), `phaseReceiptTargetState` (`:1257`), `phaseReceiptTargetEvidence` (`:1294`); только `exit === 0` считается `PROVEN` (`:23`).
- Читатель — `cli/cmd/sdd-check/phase-receipt-check.ts`: `SDD_PHASE_RECEIPT_MISSING` / `_INVALID` / `_INCOMPLETE` / `_STALE_PLAN` / `_STALE_TARGETS`.
Тесты: `shared/sdd/__tests__/phase-receipt.test.ts`, `cli/cmd/sdd-check/__tests__/phase-receipt-check.test.ts`, `sdd-log.cmd.test.ts:382-490` («complete mode — one verified phase-state transition», 6 it).

**Вердикт: ЗАКРЫТО** — с тремя оговорками, каждая из которых сама по себе задача:
1. **Грандфазеринг.** `phase-receipt-check.ts:62`: `if (!schemaAware && !receipts.has(phase.id)) continue;` — тикет без `<!--PHASE_RECEIPTS:v1-->` проходит с отмеченными фазами и нулём receipt. В RC-дереве это **все** тикеты (Ф2).
2. **Обход `complete` — уже, чем казалось.** `line "DONE"` + `handoff "<payload>"` даёт визуально закрытую фазу без receipt (Ф4). Но `SDD_PHASE_RECEIPT_MISSING` в этом случае даже не пытается сработать: `phase-receipt-check.ts:61` начинается с `if (!phase.status.includes('[x]')) continue;` — receipt требуется **только для фазы, уже отмеченной `[x]` в Phases Overview**. Значит дешёвая подделка — это `line "DONE"` + правка Overview руками (тогда receipt потребуется и `_MISSING` сработает); если Overview оставить `[ ]`, сработает `DONE_PHASE_UNCHECKED` (C6). На receipt-aware тикете обход закрыт «по кругу» через два разных гейта, но ни один из них не проверяет прямо, что `- [x] … DONE` и `**Handoff →**` внутри блока фазы написаны именно `complete`.
3. **Строки `ver` остались свободным текстом.** В DA-lazy-asm их 47, и одна из них — `ver … → pass exit=1` (стр. 647), исправленная затем самодельным `correction:` (стр. 648). `complete` их не читает, `sdd-check` не читает, аудит-аксиома требует их наличия. Ложь в `ver` больше не несущая, но и не диагностируемая.

### C13 — `sdd lint` резолвит gennady в рантайме, без литералов путей

**Вердикт: НЕПРИМЕНИМО.** В v2 нет shell-скриптов скилла (`ai/skills/sdd-execute/scripts/*` отсутствует как класс), нет `$GENNADY_HOME`, нет нормализатора путей для скиллов. Есть одна npm-CLI, вызываемая как `npx gennady <cmd>`; `sdd lint` стал `gennady lint` (`package.json` scripts `lint:contracts`). Потребность «команда не должна ломаться после sync-нормализации» исчезла вместе с механикой нормализации.

### C14 — инструменты зовутся через рантайм-плейсхолдер `<sdd-path>`

**Вердикт: НЕПРИМЕНИМО.** `grep -rn 'sdd-path\|~/.claude/skills' ai/directives/sdd-v2/` → **ноль** (перепроверено). Каждый `<ToolCall>` в v2-директивах — литеральный `npx gennady …` (напр. `execute.directive.xml:251,285,312,315`). Плейсхолдер был обходным путём вокруг двух деревьев установки скиллов; в v2 дерева одно.

### C15 — batch — серийный планировщик зависимостей, без своей машины состояний

**v1.** Отдельный скилл `sdd-execute-batch`, один общий worktree, диспатч канонического `sdd-execute` на задачу, повтор только при доказуемом прогрессе, иначе BLOCKED/PAUSED с доказательством.

**v2.** Отдельного batch-артефакта нет — режим свёрнут в `execute.directive.xml`: «Task-ID resolves only that ticket. `all`/`batch`/`queue` uses every pickable ticket in DAG …» (`:181`), «Operator review happens once, after the whole batch and its audits» (`:157`), закрытие очереди — `STEP` на `:325-339`. Одна лестница остановок вместо BLOCKED/PAUSED: `AX_HALT_VS_FAIL_DISTINCTION` (`:88-99`) с классами `RECOVERABLE_TECHNICAL` / `SPEC_GOAL_CONFLICT` / `EXTERNAL_AUTHORITY_REQUIRED` / `TECHNICAL_REPLAN_EXHAUSTED`, плюс `H_PHASE_BLOCKED` (`:166`).
**Дыра:** `TECHNICAL_REPLAN_EXHAUSTED` определён как «**CLI-owned retry budget** consumed», а такого бюджета в CLI нет: `grep -rln 'retry\|Retry' cli/cmd/ shared/sdd/` не даёт ни одного счётчика попыток фазы (совпадения — `sdd-new`, `update-check-worker`, `vcs-job`, `yagni`). Условие остановки дублируется, тоже без бюджета, в `ax-halt-vs-fail-distinction.xml:8` и `return-summary-format.xml:7`. Условие остановки не измеримо, значит «повтор только при доказуемом прогрессе» ничем не обеспечено.

**Вердикт: ЧАСТИЧНО.**

---

### D3 — критик: раунды, изоляция, журнал `## Critic Rounds`

**v1.** Критик пишет в тикет `## Critic Rounds` / `### Round N — date`, свёрнутый на CLEAN (`critic.directive.xml:167-169`, дословно «Create/append `## Critic Rounds`: `### Round N — YYYY-MM-DD`») — источник коллизии #15.

**v2.** Критик **не пишет ничего**: `critic.directive.xml:57-62` STEP_3_REPORT — «Return literal `CLEAN` or findings … **Never edit, never persist a round journal**, never ask to continue the same reviewer, and never declare operator approval». `## Critic Rounds` в `infra.directive.xml:48-52` (`AX_SPEC_LIFECYCLE`) упоминается не как предписание сохранять его, а прямо противоположно — он в списке того, что «not part of the specification», и речь там про **спеки**, а не про тикеты. Пространство имён аудита отдельное: `### Audit Round N` (`formats/audit-round.xml`), нумерация независима от исполнительных раундов («`N` increments monotonically … independent of Execution Round numbers»).

**Вердикт: ЗАКРЫТО** в части коллизии с журналом (обе половины #15: namespace — устранён исчезновением писателя, регион — маркерами C7). Остаток измерен: `## Critic Rounds` с `### Round N` несут **3 живых тикета** RC — `cli-sync-skills.task-56.md` (2 шт.), `task-57.md` (2), `sdd-skills.task-61.md` (3). Все три — с нулём раундов внутри секции лога, т.е. `nextRoundNumber` вернёт **3, 3 и 4** вместо 1.

### D4 — вердикт аудита считается таблицей; project-scope находки капаются MINOR

**v2.** Таксономия и маршрутизация есть и она полнее v1: `AX_FINDING_ROUTING` (`audit.directive.xml:173-201`) — 16 типов находок → владелец ремедиации; `RULE_FILE_INCOMPLETE` маршрутизируется в «ticket update … OR a separate rule-maintenance task» (`:188`, не `:184` — та строка про `EXECUTION_LOG_INCOMPLETE`), то есть не в FAIL этого тикета (принцип v1 сохранён). Формат вердикта — `AUDIT_SESSION_SUMMARY_FORMAT` (`audit/steps/STEP_3_ROUTE.xml:102-135`) со `status=<PASS|PASS_RISK|FAIL>` и `counts=B<n>·M<n>·m<n>·I<n>`.
Механического теста, как и в v1, нет — это текст директивы; счётчик severity считает агент.

**Вердикт: ЗАКРЫТО** (перенесено с расширением; замка не было и нет по обе стороны).

### D5 — аудит берёт механическую истину из `sdd check`; post-close — триггер `EXECUTION_LOG_INCOMPLETE`; нумерация раундов независима

**v2.** Три части расходятся:
- **Единый источник механики — ЗАКРЫТО и усилено.** `ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml`, `audit/steps/STEP_1_MECHANICAL.xml:95-97` — три явных `<ToolCall>`: `sdd-check --task <ticket-path>` (по одному на каждый элемент `AuditContext.tickets`), `sdd-check --all .`, `sdd-check --changed .`; `:106` — «Deterministic mechanical checks are NOT hand-coded in this directive … Take its findings as given; do NOT hand-redo them». Есть даже анти-доверие к воркеру: `:68` «re-derive the gate yourself rather than trust the worker's logged `ver` lines».
- **Независимая нумерация — ЗАКРЫТО.** `formats/audit-round.xml`: `### Audit Round <N> — <date>, after Execution Round <M>`, `after-exec-round=<M>`.
- **Post-close как триггер — НЕ ЗАКРЫТО.** В v2 остался только семантический признак «a previous round was edited (round log is append-only)» (`STEP_2_SEMANTIC.xml:131`); инструмент про это молчит (C6), а «дописано после закрытия» — не то же, что «прошлый раунд отредактирован»: в DA-lazy-asm ни одна прошлая строка не изменена, дописано **после** блока закрытия, и обе формулировки этого не покрывают.
- **Побочно: каталог проверок в директиве устарел.** `STEP_1_MECHANICAL.xml:108-110` перечисляет для `--task` только anchor/Meta/Task-ID/fabricated-DONE/blocker/placeholders/phase-graph/`RULES_CASCADE_CLOSURE`/`BDD_COVERAGE`. `cli/cmd/sdd-check/help.ts` объявляет ещё `BDD_NEGATIVE`, `BDD_TRACE`, `COVERAGE_POLICY`, `PHASE_RECEIPT`; а `--all` дополнительно даёт групповые receipt (`sdd-check.cmd.ts:1385-1407`) и `SDD_TASK_ID_GRAMMAR` (`:1374`) — их в директиве нет. Аудитор не знает, что инструмент уже умеет.

**Вердикт: ЧАСТИЧНО.**

### D6 — SSOT: документ ссылается на факт по якорю и не переписывает литерал

**v2.** Принцип объявлен (`ai/kit/axiom/boundary/ax-ssot-traceability.xml`, `ax-reference-over-copy.xml`) и структурно поддержан `SDD_BROKEN_SPEC_REF` (6 срабатываний на RC-дереве) / `SDD_BROKEN_SPEC_ANCHOR` (11 срабатываний). Но на своём главном объекте в этом треке — словаре токенов Execution Log — он нарушен не четырежды, а **семижды** (см. C11: семь домов словаря, ни один не собран в единую директиву).

**Вердикт: ЧАСТИЧНО** (механика ссылок есть; конкретно словарь лога живёт семью копиями).

### D7 — фазовый агент: запрещённый bash, границы ошибки, типизированный Handoff

**v2.** `ai/kit/axiom/process/ax-permitted-bash-commands.xml` сохранён; `HANDOFF_FORMAT` переехал в `phase-execution-protocol/steps/STEP_4_HANDOFF.xml` и получил **четвёртое** поле `deviations`, которое `sdd-log complete` проверяет регэкспом `^artifacts:\s*\[(.+)\];\s*decisions:\s*\[(.*)\];\s*open:\s*\[(.*)\];\s*deviations:\s*\[(.*)\]$` (`sdd-log.types.ts:246-247`) и отвергает `[...]` (`:253-256,265`). Это строго сильнее v1: форма Handoff теперь машинно обязательна.
**Расхождение.** Трёхполевых копий скелета — **три**, не две: `formats/task-ticket-structure.xml:147`, `templates.ts:1362`, и третья — `ai/kit/contract/process/phase-block-format.xml:20` (неподключённая, находка A в C11). `complete` терпит обе формы на входе (`COMPLETE_HANDOFF_SKELETONS`, `sdd-log.types.ts:253-256`), но **пишет** всегда четырёхполевой. Тикет, заскаффолженный по формату, несёт скелет одной формы, а закрытую строку — другой.
Провенанс (`measured|reported|assumed`) в v2 так и не появился — это #22, вердикт A4 подтверждаю.

**Вердикт: ЧАСТИЧНО.**

### D8 — Task-ID из счётчика README; `AX_REOPEN_TICKET_FORMAT`; Round close ≠ DONE

**v2.** Три части, три разных исхода:
- **ID.** Счётчика в README нет; уникальность считается по дереву — `collectTaskIds` (`task-id.ts:79+`) плюс `checkIdConflicts` / `findPrefixClashes`, отказ на входе в `sdd-new --id`. **ЗАКРЫТО**, механизм лучше (счётчик в README был единой точкой отказа).
- **Формат реопена.** `ax-reopen-format.xml` — прямой перенос из v1 `fix.directive.xml`, и он **несовместим с v2-структурой тикета**: предписанная им таблица — `| Phase | Kind | Status | Target Files | Deps |` (5 колонок), тогда как `PHASES_OVERVIEW` в v2 — `| ID | Kind | Deps | Status |` (`formats/task-ticket-structure.xml:49`), и `parsePhasesOverview` читает позиционно `[id, kind, deps, status]` (`shared/sdd/ticket.ts:203`) с единственным щитом от заголовка `cells[0]?.toLowerCase() === 'id'` (`:202`). Следствия, воспроизведённые независимо и оказавшиеся **хуже**, чем в первом проходе:
  1. Заголовок `| Phase | …` парсится **как фаза** с id `Phase`.
  2. **Колонка Status читается как Deps у КАЖДОЙ строки таблицы, не только у заголовка** — `Phase P3 depends on unknown phase [ ]` — вся 5-колоночная форма ломает не заголовок, а весь позиционный разбор целиком.
  3. `completePhase` требует **ровно одну** строку Overview для фазы и статус ровно `[ ]` (`sdd-log.types.ts:295-311`); `ax-reopen-format.xml` велит «Allocate concrete next-unused PhaseIDs», но не велит добавить строку в Phases Overview — реопен, написанный точно по аксиоме, **не закрывается** через `sdd-log complete` (а с receipt отказал бы вторично: `overviewCells[4]` в 5-колоночной строке — это `Target Files`, а не Status).
  4. Независимо воспроизведённая фикстура дала на такой таблице **шесть+одну** находку `sdd-check`, а не три, как в первом проходе: три `SDD_PHASE_DEP_UNRESOLVED`, три `SDD_PHASE_SECTION_MISSING`, плюс ложный `SDD_EXECUTION_LOG_ROUND_MISSING` (раунд назван `### Round 2`, `firstRoundPhaseBlockCounts` ищет буквально `Round 1` — то же явление, что и находка C в §2/§3 ниже).
  5. **Третье противоречие.** `ax-reopen-format.xml` велит `Set ticket Meta Status → [ ] TODO`, а `sdd-log round` пишет `[~] IN_PROGRESS` (`sdd-log.cmd.ts:479`).
  6. В RC-дереве 5 v1-тикетов несут эту таблицу внутри Execution Log (`tasks/cli/lint/cli-lint.task-14.md:93,131`, `…/alt-opinion/cli-alt-opinion.task-23.md`, `…/sync-skills/cli-sync-skills.task-58.md`, `tasks/dbc/dbc-linter/dbc-linter.task-0{8,9}.md`) — то есть форма живая.
  Плюс сам DA-lazy-asm реопены сделал **не** по аксиоме: не новым `### Round`, а блоками `#### P<N> — re-run: …` внутри уже закрытого Round 2 — форма, которую поддерживает CLI (`sdd-log phase <P> "— re-run: <reason>"`, `sdd-log.types.ts:231`) и которой в аксиоме нет. **Два определения реопена** — рецидив #13 в новой одежде.
- **Round close ≠ DONE.** Инвертировано: `close` пишет `[x] DONE` (`sdd-log.cmd.ts:485`). См. C10.

**Вердикт: ЧАСТИЧНО** (ID — закрыто; формат реопена — НЕ ЗАКРЫТО, внутренне противоречив и его следствия хуже, чем видно по одной фикстуре; «close ≠ DONE» — сознательно отменено).

---

### Сводка

| # | Инвариант v1 | Вердикт v2 | Ключевая ссылка |
|---|---|---|---|
| C1 | грамматика/однозначность Task-ID | ЗАКРЫТО | `task-id.ts:16,19,166`; `check.ts:1385,1401` |
| C2 | нет `findings=0` без проверенного объекта | **ЧАСТИЧНО** (дыра шире) | `sdd-check.cmd.ts:1275-1295`; Ф1; асимметрия `--all`/`--task` |
| C3 | orphan `@tasks` по 15 расширениям | **НЕ ЗАКРЫТО** | нет кода; `sdd-check.cmd.ts:699-701`, `:503` |
| C4 | таксономия `[LOG]` | **ЧАСТИЧНО** | `check.ts:485,493,498,509,551-575` |
| C5 | `unclosed-round` | **НЕ ЗАКРЫТО** | нет проверки `IN_PROGRESS` |
| C6 | целостность после закрытия | **НЕ ЗАКРЫТО** (частично ловится на receipt-aware) | `sdd-log.cmd.ts:420,509-510`; `sdd-log.types.ts:319-323`; Ф2, Ф4 |
| C7 | регион лога / критик вне лога | **ЧАСТИЧНО** | `section.ts:141,192` vs `sdd-log.types.ts:76-79`; Ф5 |
| C8 | причинный `Reopens` | **НЕ ЗАКРЫТО** | `formats/audit-round.xml`; ноль в `check.ts` |
| C9 | четыре секции в файле правил | **НЕ ЗАКРЫТО** (заменено каскадом) | `rules-cascade.ts`; `audit.directive.xml:188` |
| C10 | `[x] DONE` = аудировано | **ЧАСТИЧНО** (перевёрнуто) | `ax-audit-hook.xml`; `group-receipt.ts:316,298,149`; `check.ts:1349` |
| C11 | один дом словаря токенов | **НЕ ЗАКРЫТО** (7 домов) | `templates.ts:1581` vs `specs/3-tasks.md:12` vs `ax-execution-log-verification.xml` vs `phase-block-format.xml:11`; Ф3 |
| C12 | verify перед Handoff, `ver` == исполненное | **ЗАКРЫТО** (сильнее) | `sdd-log.types.ts:284-287`; `phase-receipt.ts`; оговорки: `phase-receipt-check.ts:61-62`, Ф4 |
| C13 | рантайм-резолв gennady в скрипте | НЕПРИМЕНИМО | одна npm-CLI |
| C14 | `<sdd-path>` | НЕПРИМЕНИМО | `npx gennady` литералом |
| C15 | batch — серийный планировщик | **ЧАСТИЧНО** | `execute.directive.xml:181,88-99`; retry-бюджета нет |
| D3 | критик и его журнал | ЗАКРЫТО | `critic.directive.xml:57-62` |
| D4 | таблица вердикта аудита | ЗАКРЫТО | `audit.directive.xml:173-201,188` |
| D5 | механика из `sdd check`, post-close, нумерация | **ЧАСТИЧНО** | `STEP_1_MECHANICAL.xml:95-110`; `STEP_2_SEMANTIC.xml:131` |
| D6 | SSOT по ссылке | **ЧАСТИЧНО** | нарушено семижды на словаре лога (C11) |
| D7 | протокол фазы и Handoff | **ЧАСТИЧНО** | `sdd-log.types.ts:246-256` vs три копии трёхполевого скелета |
| D8 | ID из счётчика, формат реопена, close≠DONE | **ЧАСТИЧНО** | `ax-reopen-format.xml` vs `ticket.ts:202-203`, `sdd-log.types.ts:295-311` |

---

## 2. Модель журнала: v2 против v1

### 2.1 Кто пишет

| | v1 | v2 |
|---|---|---|
| открытие раунда | агент правит markdown | `sdd-log <ticket> round "<reason>"` — номер и дата от CLI (`sdd-log.cmd.ts:433-435`), `Meta Status → [~] IN_PROGRESS` (`:479`) |
| заголовок фазы | агент | `sdd-log <ticket> phase P<N> ["— re-run: …"]` (`sdd-log.types.ts:231`) |
| событийная строка | агент | `sdd-log <ticket> line "<content>" [--phase P<N>]` — штамп времени от CLI (`buildEventLine`, `sdd-log.types.ts:98`) |
| блокер / снятие | агент | `sdd-log … blocker "<reason>" --axiom AX_… --unblock "…" --phase P<N>` (`buildBlockerBlock`, `:371`) и `resolved "<what removed it>" --phase P<N>` (`:391`); `--phase` обязателен для обоих (`sdd-log.cmd.ts:239-242`) |
| Handoff | агент | `sdd-log … handoff "<payload>"` (без штампа, verbatim) или, штатно, `complete` |
| закрытие фазы | агент ставил `[x]` и Handoff | `sdd-log … complete "<4 поля>" --phase P<N>` — атомарно: требует receipt, заменяет **оба** скелета (`- [ ] <ts> DONE` и `**Handoff →** …[...]`) и ставит `[x]` **только** в строке этой фазы в Phases Overview (`sdd-log.types.ts:276-361`) |
| закрытие раунда | агент | `sdd-log … close` — либо заменяет скелет на месте, либо (для динамически открытого раунда) дописывает блок; повторный/неоднозначный отказ (`closeCurrentRound`, `sdd-log.types.ts:124-179`); `Meta Status → [x] DONE` (`sdd-log.cmd.ts:485`) |
| receipt фазы | нет понятия | пишет `sdd-verify --task <t> --phase P<N>` как блок `<!--SDD_PHASE_RECEIPT:…-->` (`shared/sdd/phase-receipt.ts:77-79`) |
| receipt группы | нет понятия | `sdd-log <group> audit-receipt <verdict>` / `review-receipt <verdict>` на **владеющей спеке** (`group-receipt.ts`, `GROUP_RECEIPT_MARKER:15-18`) |
| завершение черновика спеки | нет понятия | `sdd-log <spec> authoring-complete` → одна запись Decision Log (`completeSpecAuthoring`, `sdd-log.types.ts:182`) |

Полный список режимов (`MODES`, `sdd-log.cmd.ts:62-74`): `round · line · close · phase · handoff · blocker · resolved · complete · authoring-complete · audit-receipt · review-receipt`.

Сдвиг принципиальный и в целом в правильную сторону: **штампы времени, номера раундов, статусы и доказательства верификации больше не сочиняются агентом**. Прибавка, которой у v1 не было вовсе: файловая форма всех free-text полей — `--content-file .claude/tmp/<name>` / `--payload-file …json` (точный обычный не-symlink UTF-8 файл под `.claude/tmp/`, ≤32768 байт, удаляется только после успешной записи; проверено 9 тестами `sdd-log.cmd.test.ts:759-966`, включая «consumes only the inode that was read» и «refuses a same-path symlink replacement»). Это закрывает целый класс shell-инъекций, которого в v1 никто не рассматривал.

**Уточнение верификации: два примитива записи, а не один.** `sdd-log` пишет через `writeProvenRepoFile` (`shared/common/repo-file-identity.ts:136`), а receipt фазы пишет `sdd-verify` через приватную (не экспортируемую) `atomicTicketWrite` (`cli/cmd/sdd-verify/phase-run.ts:73`, вызов `:178`). Вне `phase-run.ts` `atomicTicketWrite` не существует; в документах она названа «persistence PRIMITIVE (CLI-owned, atomic, corpus-visible)» (`ai/flow-eval/docs/flow-verification-ledger.md:58`, `flow-verification-redesign.md:119`). Предложение §3 ниже трогает только слой **разбора**, не слой записи — оба примитива остаются как есть (см. §3.5).

### 2.2 Что `sdd-log` отказывается делать

`ERR_CLI_SDD_LOG_*` (`sdd-log.types.ts:13-37`), коды выхода `1 файл / 2 состояние / 4 вызов`:

- `PLACEHOLDER` — любой неподставленный `<…>` в контенте (exit 2), с аккуратной эвристикой inline-code (`hasPlaceholder`, `:59-70`);
- `COMPLETE_STATE` — нет receipt этой фазы; нет `PHASES_OVERVIEW`/`EXECUTION_LOG`; строк фазы в Overview не ровно одна; статус фазы не `[ ]`; в текущем раунде не ровно один блок `#### P<N>`; в блоке не ровно один скелет DONE и один скелет Handoff;
- `CLOSE_STATE` — раунд уже закрыт; блоков закрытия больше одного; блок закрытия не содержит ровно один незакрытый скелет DONE;
- `PHASE_NOT_OPEN` — `--phase` называет фазу без открытого блока (в сообщении перечисляются открытые);
- `MISSING_FLAG` — `blocker` без `--axiom`/`--unblock`; `AXIOM_ID_RE = /^AX_[A-Z0-9_]+$/` (`sdd-log.cmd.ts:77`);
- `PAYLOAD_FILE` — путь/размер/UTF-8/схема; JSON блокера обязан иметь ровно ключи `reason, axiom, unblock`, все непустые однострочные;
- `NO_LOG_SECTION`, `UNKNOWN_ID`, `AMBIGUOUS_ID`, `FILE`, `AUTHORING_STATE`, `GROUP_RECEIPT_STATE`, `BAD_INVOCATION`.

**Чего он не отказывается делать (проверено, Ф4):** принять токен вне словаря; принять `line "DONE"` вместо `complete`; дописать в закрытый раунд; открыть блок фазы после блока закрытия; закрыть раунд с незакрытыми фазами; сосчитать номер раунда по всему файлу.

### 2.3 Что `sdd-check` проверяет про журнал

Коды (`shared/sdd/check.ts`, `cli/cmd/sdd-check/phase-receipt-check.ts`, `shared/sdd/group-receipt.ts`) — независимо переcобраны из кода: `grep -rhoE "'SDD_[A-Z_0-9]+'" shared/ cli/` → 156 уникальных кодов, все ниже перечисленные существуют, лишних нет.

**Ошибки:** `SDD_MISSING_EXECUTION_LOG` · `SDD_MISSING_META` · `SDD_ANCHOR_UNBALANCED` · `SDD_SECTION_OVERLAP` · `SDD_FABRICATED_DONE` · `SDD_DONE_WITH_ACTIVE_BLOCKER` · `SDD_EXECUTION_LOG_ROUND_MISSING` · `SDD_EXECUTION_LOG_PHASE_MISSING` · `SDD_EXECUTION_LOG_PHASE_DUPLICATE` · `SDD_EXECUTION_LOG_PHASE_ORPHAN` · `SDD_DONE_PHASE_UNCHECKED` · `SDD_PHASE_DEP_UNRESOLVED` · `SDD_PHASE_DAG_CYCLE` · `SDD_PHASE_SECTION_MISSING` · `SDD_PHASE_SECTION_ORPHAN` · `SDD_PHASE_RECEIPT_MISSING` · `SDD_PHASE_RECEIPT_INVALID` · `SDD_PHASE_RECEIPT_INCOMPLETE` · `SDD_PHASE_RECEIPT_STALE_PLAN` · `SDD_PHASE_RECEIPT_STALE_TARGETS` · `SDD_TASK_ID_COLLISION` · `SDD_TASK_ID_PREFIX_CLASH` · `SDD_TASK_ID_GRAMMAR` · `SDD_TASKS_APPEND_ONLY_REGRESSION`.

**Предупреждения:** `SDD_MISSING_TASK_ID` · `SDD_STATUS_UNPARSEABLE` · `SDD_BLOCKER_OPEN` · `SDD_DONE_WITH_PLACEHOLDERS` · `SDD_LEGACY_TICKET_UNANCHORED` · `SDD_GROUP_AUDIT_MISSING` · `SDD_GROUP_REVIEW_MISSING` · `SDD_CONSUMERS_UNRESOLVED`. Плюс не названный в первом проходе fail-closed напарник: **`SDD_CONSUMERS_SCAN_FAILED`**.

Отсутствуют, как и было заявлено: любой аналог `unknown-token`, `retired-token`, `unclosed-round`, `entry-after-close`, `extra-close-entry`, `bad-round-close`, `round-close-no-timestamp`, а также `SDD_REOPENS_*` и `SDD_NO_TICKETS_FOUND`.

**Четыре гейта, ограничивающих охват** (первые три — уже были известны, четвёртый добавлен независимой верификацией):
1. `content.includes('<!--PHASE_RECEIPTS:v1-->')` — включает `SDD_EXECUTION_LOG_*` (`check.ts:547`) и `SDD_PHASE_RECEIPT_MISSING` (`phase-receipt-check.ts:62`);
2. `group.members.every(memberIsReceiptAware)` — включает групповые receipt (`group-receipt.ts:298`);
3. `isV2SpecsTicket` — включает `SDD_TASK_ID_GRAMMAR` (`sdd-check.cmd.ts:962,1194,1374`);
4. `phase-receipt-check.ts:53` (`overview.status !== 'ok'` ⇒ пустой список находок) и `:61` (`!phase.status.includes('[x]')` ⇒ пропуск фазы) — выключают receipt-проверки дважды: сначала по читаемости `PHASES_OVERVIEW` (все мигрированные v1-тикеты уровня `##`, см. §2.6), потом по тому, отмечена ли фаза `[x]`. Второй гейт объясняет, почему обход `line "DONE"` без правки Overview не даёт `SDD_PHASE_RECEIPT_MISSING` вовсе (см. C12 оговорка 2).

В RC-дереве маркер не несёт ни один тикет, так что (1) и (2) сейчас выключены полностью (Ф2).

Плюс `firstRoundPhaseBlockCounts` смотрит **только Round 1** (`check.ts:219-241`): третий раунд с лишним, дублирующим или чужим блоком фазы не диагностируется.

**Находка C независимой верификации: включение маркера на нетривиальном раунде даёт ложную находку.** `firstRoundPhaseBlockCounts` ищет буквально `### Round 1`. Воспроизведено на фикстуре с `### Round 2` и маркером → `SDD_EXECUTION_LOG_ROUND_MISSING`. В DA-lazy-asm единственный раунд — `### Round 2` (стр. 607), `### Round 1` **отсутствует**: как только маркер поставят (см. D4 в §4.2), тикет мгновенно покрасится ложной находкой. Это блокирует политику «инвертировать»/«датировать» (D4, варианты 2–3 в §4.2) без предварительной правки функции на «первый **открытый** (текущий) раунд», а не «раунд с номером 1» — задача P1/B2-16 в §4.1.

### 2.4 Receipts

**Фазовый (`SDD_PHASE_RECEIPT`).** `PhaseReceiptPlan` фиксирует канонический путь тикета, id фазы, профиль верификации и причину его выбора, точные Target Files в порядке тикета, tombstones удаляемых путей, применимые команды §Verification, владельца coverage-producer и его отпечаток (`phase-receipt.ts:28-49`). Сам `PhaseReceipt` добавляет `planState`, `targetState`, per-path `targetEvidence`, список фактически исполненных команд и диспозицию гейтов, где `PROVEN` даётся только при `exit === 0` (`:52-70`). Читатель различает четыре класса порчи и подсказывает точную команду перезапуска (`phase-receipt-check.ts:18-33`). Это то, чего в v1 не было ни в каком виде: v1 доверял строке `ver`, написанной агентом.

**Групповой (`SDD_AUDIT_RECEIPT` / `SDD_REVIEW_RECEIPT`).** Долговечный **факт** «группа аудирована/отревьюена, вердикт V, на ref R» на владеющей спеке; находки остаются эфемерными (`AX_EPHEMERAL_OUTPUT`). Подпись — SHA-256 по отсортированным `[basename, roundCount, done]` членов (`group-receipt.ts:104-124`), поэтому новый раунд у любого члена делает receipt stale автоматически; писатель отказывается, пока не все члены `[x] DONE`; запись — через атомарный проверенный примитив, «so a pasted block cannot forge it» (`execute.directive.xml:69-71`). Идея хорошая, но исполнение ослаблено warn-серьёзностью и грандфазерингом (C10).

**Уточнение (см. также C7).** Подпись группы опирается на `memberRoundCount` (`group-receipt.ts:64-68`), а та при нечитаемой секции (`log.status !== 'ok'`) считает по **всему файлу** (`:65-66`) — то есть на legacy-члене группы подпись группового receipt завязана на то же полнофайловое число, что ломает `nextRoundNumber`.

### 2.5 Reopens и нумерация раундов

- `nextRoundNumber` = `(число ^### Round \d+ во всём файле) + 1` (`sdd-log.types.ts:76-79`) — не сужено до секции (Ф5).
- Причина раунда — свободная строка; закрытого словаря (`initial | fix: F-NNN | resume | new-audit-session`) нет ни в грамматике, ни в проверке; `sdd-log.cmd.ts:435` вызывает `buildRoundHeader(nextRoundNumber(content), date, payload)` без валидации.
- `Reopens` в Meta и колонка `Reopens` в трекерах обновляются вручную по `ax-reopen-format.xml` / `reconcile.directive.xml:113,194,250`. Механического сопоставления Meta ↔ `@audit … triggered-reopen=Round-N` нет (C8).
- Аудит-раунды нумеруются независимо и пишутся в `## Audit Rounds` **без** якоря `<!--SECTION:AUDIT_ROUNDS-->` (`formats/task-ticket-structure.xml:158` — только комментарий «AUDIT_ROUNDS appended only after the first reopen-triggering audit»; `grep 'SECTION:AUDIT_ROUNDS' ai/ shared/ specs/` → 0). При этом `ax-task-id-integrity.xml` перечисляет `AUDIT_ROUNDS` среди «Optional names», проверяемых через `npx gennady sdd-extract <ticket> <NAME>» — а этот вызов на неякорной секции всегда вернёт exit 2. Достать её можно только heading-формой `sdd-extract <file>#audit-rounds` (`cli/cmd/sdd-extract/help.ts:13,22`), о которой аксиома не знает.
- Две несовместимые формы реопена (новый `### Round` по `ax-reopen-format.xml` vs `#### P<N> — re-run:` внутри текущего раунда, поддержанное CLI и применённое в DA-lazy-asm) — см. D8.
- **Третье противоречие** `ax-reopen-format.xml`: аксиома предписывает `Set ticket Meta Status → [ ] TODO`, а `sdd-log round` фактически пишет `[~] IN_PROGRESS` (`sdd-log.cmd.ts:479`) — статус в тикете и предписание расходятся с первого же реопена, сделанного точно по аксиоме.

### 2.6 Task-ID: грамматика и legacy

- Грамматика `^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$`, слаг ≤ 8 символов (`task-id.ts:16,19`). Заметьте: v1-й `TSK-64` **проходит** эту грамматику (слаг `64` — из `[a-z0-9]`), а путевой `TSK-IB-001` — **нет** (заглавные в слаге). Поэтому legacy-числовые ID сосуществуют легально, а путевые требуют миграции. Проверено обоими способами: грамматика (`task-id.ts:16`) и прогон (`--task TSK-88` → `UNKNOWN_ID` exit 2 против `--task TSK-IB-001` → `FILE` exit 1).
- Уникальность и «грепо-чистота» — `collectTaskIds`, `checkIdConflicts`, `findPrefixClashes`, `describeIdConflict`, `suggestTaskId` (никогда не подставляется автоматически — «refuse + point at the fix», `task-id.ts:190`).
- Legacy-тикет (plain-заголовки, без маркеров) получает один совет вместо разбора: `SDD_LEGACY_TICKET_UNANCHORED` warn (`check.ts:1324-1336`) — 76 срабатываний на RC-дереве (подтверждено). `checkTicket` для него не запускается вовсе.
- Миграция якорей — `injectAnchors` (`shared/sdd/anchor-inject.ts:73`), сопоставление заголовков — `canonicalName` (`:12-28`). Две границы применимости, обе воспроизведены на реальных файлах RC:
  - `PHASES_OVERVIEW` распознаётся только на уровне `##` (`:21`); старые v1-тикеты (`tasks/dbc/dbc-linter/dbc-linter.task-08.md` — заголовки `## 1. Meta & Traceability … ## 5. Execution Log`) её вообще не имеют. Прогон `injectAnchors` дал `injected: META, BDD, VERIFICATION, TEST_COVERAGE, EXECUTION_LOG` — без `PHASES_OVERVIEW`. Последствие: у мигрированного тикета `overviewSec.status !== 'ok'`, и **весь** блок фазовых/receipt/exec-log проверок (`check.ts:511+`, `checkPhaseReceipts` возвращает `[]` на `phase-receipt-check.ts:53`) молча пропускается, а `sdd-log complete` и `sdd-task --phase` на нём невозможны («ticket has no readable PHASES_OVERVIEW»).
  - `PHASE_P<N>` требует текста, начинающегося ровно с `P<цифры>` (`:15`); v1 писал `### Phase P1 — implementation` (`tasks/cli/lint/cli-lint.task-14.md:67`) — не сматчится. Более новые v1-тикеты писали `### P1 — impl` и мигрируются нормально (50 тикетов под `tasks/` уже якорные, у всех есть `SECTION:PHASES_OVERVIEW` и `SECTION:PHASE_P*`).

### 2.7 Что v1 ловил, а v2 не ловит — сводно

| потеря | доказательство в v2 | цена |
|---|---|---|
| запись после закрытия раунда (`entry-after-close`, `extra-close-entry`, `bad-round-close`) | Ф2 (35 строк, 4 DONE, 3 Handoff после `Round close` в живом тикете), Ф4; частично ловится на receipt-aware через `PHASE_DUPLICATE`/`DONE_PHASE_UNCHECKED` (C6) | журнал перестаёт быть хронологическим доказательством; аудит цитирует строки, которых на момент закрытия не существовало |
| токен вне словаря (`unknown-token`) и вышедший из употребления (`retired-token`) | Ф3 (47 % строк), Ф4 | как **норма** вокабуляр жив дословно (`ax-execution-log-verification.xml`: «token outside the vocabulary → `EXECUTION_LOG_INCOMPLETE` (MINOR)»); пропала не норма, а **механическая проверка**; `ver` — самый частый токен — удалён из собранной таблицы, но требуется двумя документами аудита (C11) |
| причинный `Reopens` | ноль упоминаний в `shared/sdd/**`, `cli/cmd/sdd-log/**` | «сколько раз задачу переоткрывали и почему» перестало быть проверяемым; данные для проверки в тикете уже лежат |
| `NO_TICKETS_FOUND` | Ф1 | пустой или неверно разложенный scope читается как «✅ clean» |
| orphan `@tasks` вне TS-семейства | нет кода; `sdd-check.cmd.ts:699-701`, `:503` | на не-JS-проекте трассируемость код↔тикет структурно не проверяется |
| `unclosed-round` | нет проверки `IN_PROGRESS` | брошенный раунд не отличим от идущего |
| `[x] DONE` ⇒ аудировано | `sdd-log.cmd.ts:485`; `group-receipt.ts:316,298`; `check.ts:1349` | зависимая задача другой спеки может стартовать на неаудированном результате; обещание `AX_AUDIT_HOOK` подкреплено четырьмя необеспеченными местами, а не одним (находка B) |
| четыре секции в файле правил (`rule_findings=`) | нет в `sdd-check` | правило-пустышка проходит зелёным (стык с треком RULES) |

---

## 3. Предложение: один модуль `shared/sdd/execution-log.ts`

### 3.1 Почему один модуль, а не набор заплат

Сейчас знание про Execution Log размазано по четырём владельцам, каждый со своим представлением о регионе и о том, что такое «раунд»:

| владелец | как читает лог | сужен до секции? |
|---|---|---|
| `shared/sdd/check.ts` (`firstRoundPhaseBlockCounts`, `scanBlockerTrail`, `parsePhaseHandoffs`) | `collectHeadings` по телу секции | да (`extractSection`) |
| `cli/cmd/sdd-log/sdd-log.types.ts` (`nextRoundNumber`) | regex по всему файлу | **нет** |
| `cli/cmd/sdd-log/sdd-log.types.ts` (`closeCurrentRound`, `completePhase`, `findPhaseBlockBounds`) | построчно по `findSectionBounds` | да, но `#### Round close` не считается границей |
| `shared/sdd/group-receipt.ts` (`memberRoundCount`) | regex по телу секции, откат на весь файл при нечитаемой секции | частично (см. C7) |

Четыре реализации «найди текущий раунд» уже разошлись (Ф5), и все три отсутствующие проверки (пост-закрытие, словарь, причинный `Reopens`) требуют похожей структуры: раунды → фазовые блоки → блок закрытия → событийные строки с токеном и штампом. Поэтому — один парсер, несколько потребителей.

**Уточнение по декомпозиции.** Не все три «потребителя» в равной мере требуют полного парсера: `SDD_NO_TICKETS_FOUND` (§3.4) вообще не касается журнала — это `ticketRefs.length === 0` в `sdd-check.cmd.ts`, задача B2-05; словарь токенов (`SDD_EXECUTION_LOG_UNKNOWN_TOKEN`, задача B2-03) требует только `TOKEN_VOCABULARY` + «первое слово после штампа»; `checkReopens` (задача B2-06) требует парсер `## Audit Rounds`, а не `EXECUTION_LOG`. Из объёмной задачи консолидации парсера (B2-01) реально зависят только пост-закрытие (B2-04) и `_PHASE_UNRECEIPTED_DONE` (B2-07). Значит **B2-03 и B2-05 не зависят от B2-01** и могут идти первыми — порядок работ пересмотрен в §4.1.

### 3.2 Контракт модуля

```ts
// shared/sdd/execution-log.ts
export type LogTokenKind = 'live' | 'cli-owned' | 'marker';
export type LogEvent = {
  raw: string; line: number;          // 1-based, в координатах файла
  checked: boolean;                    // [x] против [ ]
  ts: string | null;                   // из `…` — как записано
  token: string | null;                // первое слово после штампа
  known: boolean;                      // token ∈ TOKEN_VOCABULARY
  marker: '🛑' | '✅' | null;
};
export type PhaseBlock = {
  id: string; rerun: string | null; start: number; end: number;
  events: LogEvent[]; handoff: { raw: string; line: number; placeholder: boolean } | null;
  done: LogEvent | null;               // отмеченная строка DONE, если есть
};
export type RoundClose = { start: number; done: LogEvent | null };
export type Round = {
  n: number; date: string | null; reason: string | null;
  start: number; end: number; phases: PhaseBlock[]; close: RoundClose | null;
  trailing: LogEvent[];                // всё, что после close внутри этого раунда  ← ядро C6
};
export type ExecutionLog = { rounds: Round[]; orphanEvents: LogEvent[] };

export function parseExecutionLog(content: string): ExecutionLog | null;   // null ⇔ нет чистой секции
export function nextRoundNumber(content: string): number;                  // = rounds.at(-1).n + 1
export const TOKEN_VOCABULARY: ReadonlyMap<string, LogTokenKind>;
export function classifyToken(token: string): LogTokenKind | 'unknown';
export function parseCorrection(raw: string): { round: number; phase: string; field: string; from: string; to: string; reason: string } | null;
export function checkExecutionLog(file: string, content: string): Finding[];
export function parseAuditRounds(content: string): { n: number; afterExecRound: number; triggeredReopen: number | null; verdict: string }[];
export function checkReopens(file: string, content: string): Finding[];
```

Обязательные инварианты парсера, каждый — тест:
1. читает **только** `extractSection(content, 'EXECUTION_LOG')`; `## Critic Rounds`, `## Audit Rounds`, `## Decision Log` невидимы по построению;
2. границы раунда — `### Round <n>` до следующего `###`-или-выше **внутри секции**;
3. `#### Round close` завершает список фаз раунда; всё после него в том же раунде попадает в `Round.trailing` — **не** в последнюю фазу (это ровно то, что сейчас **не** делает `completePhase`, который ищет до `log.closeLine`, `sdd-log.types.ts:319-323`);
4. заголовки внутри fenced-code игнорируются (уже обеспечено `collectHeadings`; тест `check-phases.test.ts:115` это фиксирует — сохранить);
5. `- 🛑` / `- ✅` — маркеры, а не токены (перенести семантику `scanBlockerTrail`, `check.ts:249-284`, включая пофазный FIFO-пул и общий пул для `— re-run:`);
6. пофазная атрибуция строк не зависит от порядка открытия блоков (сохранить поведение `findPhaseBlockBounds`, `sdd-log.types.ts:474`, и его 14 тестов `sdd-log.cmd.test.ts:550-707`);
7. **обязательное условие для `SDD_EXECUTION_LOG_ROUND_MISSING` (следствие находки C)**: определение «раунд без блока Phase 1» переносится на «первый **открытый** (текущий, ещё не закрытый) раунд», а не на «раунд с литеральным номером 1» — иначе включение маркера `PHASE_RECEIPTS:v1` на любом тикете, где текущий раунд не назван `Round 1`, даёт ложную находку (воспроизведено на DA-lazy-asm и на независимой фикстуре).

### 3.3 Словарь токенов — один дом, включая `correction` (#23)

Дом — `TOKEN_VOCABULARY` в этом модуле; `templates.ts`, `formats/project-tasks-index.xml` и `ax-execution-log-verification.xml` его **цитируют**, не переопределяют (снимает C11/D6). Состав по факту (Ф3) плюс требуемое:

| токен | вид | кто пишет | комментарий |
|---|---|---|---|
| `intro` `decision` `tried` `discovery` `insight` | live | фаза | как сейчас |
| `verified` | live | фаза | «инструмент@версия + итог»; аудит требует его для `config`-фаз (`ax-execution-log-verification.xml`) |
| `ver` | live | фаза | **вернуть в таблицу**: 47 из 129 строк, требуется `STEP_2_SEMANTIC.xml:131`, удалён из `templates.ts:1581`. Либо вернуть, либо выпилить требование из аудита — молчаливое расхождение недопустимо |
| `yagni` | live | фаза | требуется `AX_USAGE_WAIVER_DISCIPLINE` (`audit.directive.xml:150-159`); уже объявлен в неподключённом `phase-block-format.xml:11` (седьмой дом, C11) — в собранную таблицу так и не попал |
| `fix` | live | фаза | 3 живых применения; сейчас «unknown» |
| `env-fix` | live | оркестратор | 3 живых применения — починка окружения вне зоны записи фазы |
| **`correction`** | live | фаза/оркестратор | **новое, ответ на #23**: `correction <round>/<phase> <field>: <old> → <new> ← <reason>`. Живой токен в DA-lazy-asm — `correction:` **с двоеточием сразу после слова** (2 применения); грамматику нужно скорректировать (принять опциональное `:`), иначе собственный новый парсер не разберёт две уже существующие строки |
| `BLOCKED` `DONE` | live | фаза / CLI | как сейчас |
| `SDD_PHASE_RECEIPT` | cli-owned | `sdd-verify` | агент не пишет никогда |
| `🛑` `✅` | marker | CLI | не токены |

`correction` — единственный легальный способ ошибиться один раз в append-only журнале. Проверки при записи (`sdd-log line`): первое слово в словаре, иначе `ERR_CLI_SDD_LOG_UNKNOWN_TOKEN` exit 2 с перечислением словаря и подсказкой `correction`; для `correction` дополнительно — `<round>/<phase>` существует в разобранном логе, иначе exit 2. Правило для аудита (`audit/steps/STEP_2_SEMANTIC.xml`): значение с более поздним `correction` считается разрешённым; устаревшая копия того же значения в другом артефакте — по-прежнему находка (`STALE_AFTER_PIVOT` / `EXECUTION_LOG_INCOMPLETE`).

**Уточнение по `ver`.** v1 сам держал `ver` в словаре (`check.sh:525`, `scaffold.directive.xml:719`) — удаление его из v2-таблицы (`templates.ts:1581`) регрессия относительно v1, а не наведение порядка. При этом v2 уже вынес свой вердикт о его доказательной силе: `execute.directive.xml:42` — «Diagnostics may run while fixing, but only the canonical phase command can create completion evidence; a hand-written `ver` line is not evidence». Это готовый аргумент в пользу D1.1 в §4.2 («вернуть `ver` как человеческую заметку рядом с машинным receipt»), а не новая идея — стоит привести именно так.

### 3.4 Новые коды `sdd-check`

| код | severity | условие |
|---|---|---|
| `SDD_EXECUTION_LOG_UNKNOWN_TOKEN` | warn | `LogEvent.known === false` (кроме маркеров) |
| `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE` | error | `Round.trailing` непусто, а следующего `### Round` нет |
| `SDD_EXECUTION_LOG_CLOSE_EXTRA_ENTRY` | error | в `RoundClose` есть отмеченная live-строка помимо `DONE` |
| `SDD_EXECUTION_LOG_ENTRY_LATER_THAN_CLOSE` | error | отмеченная запись со штампом позже `close.done.ts` (сравнение в равной точности — портировать `check.sh:593-600`) |
| `SDD_EXECUTION_LOG_ROUND_UNCLOSED` | warn | у раунда ≥1 отмеченной фазовой строки и нет `close` (C5; пустой скелет молчит) |
| `SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE` | error | в блоке фазы есть отмеченный `DONE`, но нет receipt этой фазы (закрывает обход `complete`, Ф4) |
| `SDD_REOPENS_MISMATCH` / `_PENDING` | error / warn | Meta `Reopens` ≠ число `@audit … triggered-reopen=Round-N` в `## Audit Rounds`; PENDING — объявленный раунд ещё не создан (C8) |
| `SDD_NO_TICKETS_FOUND` | error, exit 2 | `--all`/`--changed`: `ticketRefs.length === 0` (C2/Ф1) |
| `SDD_CORRECTION_TARGET_UNRESOLVED` | error | `correction` ссылается на несуществующий `<round>/<phase>` |

Все новые коды дают ошибку **только** на receipt-aware тикетах (маркер `<!--PHASE_RECEIPTS:v1-->`); на legacy — warn. Это сохраняет уже принятую политику грандфазеринга, а не изобретает новую.

**Условие корректности `SDD_EXECUTION_LOG_ROUND_MISSING` (следствие находки C).** Перенос `firstRoundPhaseBlockCounts` в модуль обязан заменить поиск буквального `### Round 1` на «первый **открытый** раунд» — иначе включение маркера на любом тикете, чей раунд не первый по счёту, даёт ложную находку (воспроизведено на DA-lazy-asm: единственный раунд — `Round 2`). Без этой правки грандфазеринг-политики «инвертировать»/«датировать» (D4.2/D4.3, §4.2) нереализуемы, а строгий CI (D5.3) немедленно покрасит живой артефакт.

### 3.5 Как это ложится на CLI-владение записями

`sdd-log` перестаёт хранить свои представления о логе и переходит на модуль:
- `nextRoundNumber` → реэкспорт из `execution-log.ts` (правит Ф5 в один импорт);
- `closeCurrentRound` → `parseExecutionLog(...).rounds.at(-1).close` вместо построчного поиска;
- `completePhase` → берёт `PhaseBlock` из парсера и **отказывается**, если блок лежит в `Round.trailing` (то есть после закрытия) — `ERR_CLI_SDD_LOG_COMPLETE_STATE: phase block was opened after the Round close; open a new Round`;
- `line` / `handoff` без `--phase` при уже закрытом раунде → **отказ** `ERR_CLI_SDD_LOG_ROUND_CLOSED` exit 2 с двумя выходами: `sdd-log … round "fix: F-NNN"` или `--phase P<N>` (если фаза открыта в новом раунде);
- `close` → отказ, если есть фаза со статусом `[ ]` в Phases Overview или отмеченный `DONE` без receipt: `ERR_CLI_SDD_LOG_CLOSE_STATE: phase P<N> is not completed`;
- `round "<reason>"` → причина из закрытого словаря `initial | fix: <F-NNN|finding-id> | resume | new-audit-session` (подсказка уже есть в JSDoc `sdd-log.types.ts:84`), иначе exit 4.

`sdd-task` берёт `parsePhaseHandoffs` и `scanBlockerTrail` из того же модуля (сейчас импортирует из `check.ts`, `sdd-task.cmd.ts:18`) — переезд без изменения поведения.

**Две оговорки к реализации.**
1. `sdd-log close` должен будет **прочитать receipt, написанный другой командой другим примитивом**. Сейчас `closeCurrentRound` (`sdd-log.types.ts:124-179`) вообще не парсит receipt — в отличие от `completePhase` (`:284`). Добавление «отказать при отмеченном DONE без receipt» вводит в `close` зависимость от `parsePhaseReceipts`, то есть от формата, чей единственный писатель — `sdd-verify`. Это нормально, но это новое связывание, и оно стоит строки в объёме задачи B2-07.
2. `atomicTicketWrite` **не экспортируется** за пределы `cli/cmd/sdd-verify/phase-run.ts:73`. В текущем объёме §3 (только слой разбора) это не понадобится — так и надо зафиксировать, чтобы не выглядело недосмотром.

### 3.6 Тесты, которые это фиксируют

Новый `shared/sdd/__tests__/execution-log.test.ts`:
1. `## Critic Rounds` / `### Round 7` вне секции → `nextRoundNumber` = 2 (регресс Ф5);
2. запись после `#### Round close` → `Round.trailing.length === 1` и `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE`;
3. блок `#### P3 — re-run:` после закрытия → в `trailing`, не в `phases`;
4. `T09:00Z` vs `T09:00:00Z` — не «позже» (портировать кейс v1);
5. `- 🛑` внутри блока и `- ✅` в блоке `— re-run:` той же фазы → блокер закрыт (сохранение семантики `scanBlockerTrail`);
6. `correction: Round 1/P2 exit: 1 → 0 ← перепроверено` (с двоеточием после токена) — парсится, цель существует;
7. `correction: Round 9/P1 …` → `SDD_CORRECTION_TARGET_UNRESOLVED`;
8. `totallyUnknownToken` → `SDD_EXECUTION_LOG_UNKNOWN_TOKEN`;
9. пристойный скелет Round 1 без отмеченных строк → **ни одной** находки (анти-ложное-срабатывание, аналог v1 «says nothing about a round that never ran»);
10. отмеченный `DONE` в блоке фазы без receipt на receipt-aware тикете → `SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE`.

В `cli/cmd/sdd-log/__tests__/sdd-log.cmd.test.ts`: `line`/`handoff` после `close` → exit 2; `close` при незакрытой фазе → exit 2; `round` с причиной вне словаря → exit 4; `line` с неизвестным токеном → exit 2; `line "correction: …"` с валидной целью → exit 0.

В `shared/sdd/__tests__/check.test.ts`: пустое `specs/` → `SDD_NO_TICKETS_FOUND`, exit ≠ 0.

Новый `shared/sdd/__tests__/reopens.test.ts`: Meta `Reopens: 1` + два `triggered-reopen=Round-N` → `SDD_REOPENS_MISMATCH`; объявленный `Round-4` при трёх существующих → PENDING; `triggered-reopen=none` не считается.

**Регресс-фикстура (обязательно).** `DA-lazy-asm` как есть → ожидаемый набор находок фиксируется в golden-файле. Это единственная имеющаяся запись реального v2-прогона; если проверки её не подсвечивают, они бесполезны. В golden-ожидание нужно включить (или явно исключить правкой «первый раунд → текущий») ложный `SDD_EXECUTION_LOG_ROUND_MISSING`, который иначе появится сразу после включения маркера (находка C).

### 3.7 Eval-группа G3 (execution-log / conventions integrity, execute→audit→critic)

Сценарии, которые G3 должна прогонять на снапшоте:
- G3-1: полный `execute` одного тикета с двумя раундами → в логе нет ни одной строки вне словаря, `Reopens` совпадает с числом `triggered-reopen`, все фазы имеют receipt;
- G3-2: попытка дописать в закрытый раунд → отказ CLI, оркестратор открывает новый раунд;
- G3-3: значение из Round 1 оказалось неверным в Round 3 → `correction` записан, аудит считает старую строку разрешённой, а копию значения в спеке — находкой;
- G3-4: пустой scope (ноль тикетов) → `sdd-check --all` даёт `SDD_NO_TICKETS_FOUND`, а не «clean»;
- G3-5: мигрированный v1-тикет с `## Critic Rounds` → следующий раунд нумеруется от лога, не от файла;
- G3-6: фаза с отмеченным `DONE`, написанным `line`, а не `complete` → находка.

G4 (миграция на реальном снапшоте) добирает: тикет с заголовком `| Phase | Kind | Status | Target Files | Deps |` и тикет без `## Phases Overview` (см. 2.6) — оба должны либо мигрироваться корректно, либо явно отказать, но не проходить молча.

### 3.8 Оценка объёма (по элементам)

| элемент | S/M/L |
|---|---|
| `parseExecutionLog` + типы + перенос `scanBlockerTrail`/`parsePhaseHandoffs`/`firstRoundPhaseBlockCounts` | **L** |
| `TOKEN_VOCABULARY` + `classifyToken` + `parseCorrection` | S |
| `SDD_EXECUTION_LOG_UNKNOWN_TOKEN` + валидация в `sdd-log line` | S |
| детекция пост-закрытия (три кода) + отказы в `sdd-log` | M |
| `SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE` | S |
| `checkReopens` + `parseAuditRounds` + словарь причин раунда | M |
| `SDD_NO_TICKETS_FOUND` | S |
| `close` требует завершённости фаз | S |
| приведение словаря к одному дому (`templates.ts`, два `formats/*`, `ax-execution-log-verification.xml`, `ax-usage-waiver-discipline`, `STEP_2_SEMANTIC.xml`, `specs/3-tasks.md`) | M |
| приведение `ax-reopen-format.xml` к v2-структуре (4-колоночная Overview + строки в Phases Overview) | M |
| миграция: `## Critic Rounds` → `### Critic Round N`, распознавание `### Phase P1 —` и уровня-3 `Phases Overview` в `anchor-inject.ts` | M |
| тесты (все перечисленные) | M |

### 3.9 Риски

1. **Существующие тикеты станут красными.** 47 % событийных строк живого v2-тикета вне словаря; 35 строк после закрытия. Митигация: новые коды дают error только при `<!--PHASE_RECEIPTS:v1-->`, на legacy — warn; отдельный флаг `--strict-log` для CI.
2. **Грандфазеринг превращается в постоянное состояние.** Маркер `<!--PHASE_RECEIPTS:v1-->` сейчас не несёт **ни один** тикет в RC, то есть receipt-проверки выключены на всём корпусе, а не на его хвосте. Нужен план проставления маркера (или инверсия: маркер `<!--PHASE_RECEIPTS:none-->` для явно освобождённых, всё остальное — под проверкой) и `sdd-check --all` счётчик «сколько тикетов под грандфазерингом» в сводке, чтобы это перестало быть невидимым. Отдельно: `checkGroupReceipts` требует маркер у **всех** членов группы (`every`, `group-receipt.ts:298`) — постепенная миграция «по тикету» групповых находок не даст вообще, пока не промаркирована вся группа целиком.
3. **`ver` vs `SDD_PHASE_RECEIPT` — решение, а не рефакторинг.** Если `ver` возвращается в словарь, надо описать его отношение к receipt (человеческая заметка против машинного доказательства) и запретить закрывать фазу на одном `ver`. Если не возвращается — вычистить требование из `ax-execution-log-verification.xml` и `STEP_2_SEMANTIC.xml:131` и принять, что 47 существующих строк — legacy.
4. **Отказ `line` после закрытия может заблокировать честный сценарий.** `✅ RESOLVED`, приходящее после закрытия (в DA-lazy-asm их 7), содержательно легитимно. Нужно решить: `resolved` — исключение из запрета, или снятие блокера обязано открывать раунд (см. объединённое решение D2/D6 в §4.2 — они не независимы).
5. **Двойное чтение раунда во время перехода.** Пока `nextRoundNumber` не переехал, `sdd-log` и `group-receipt.ts` считают раунды по-разному, и подпись группового receipt может разойтись с номером нового раунда. Переносить обе функции в одном изменении (см. B2-02 в §4.1).
6. **`--strict` в CI на собственном дереве.** У RC уже 198 ошибок `sdd-check --all` на себе. Добавление кодов без разбора текущего долга сделает гейт неиспользуемым; порядок должен быть «сначала коды в warn + инвентарь долга, потом error».
7. **Включение маркера даёт ложный `SDD_EXECUTION_LOG_ROUND_MISSING`** на любом тикете, чей текущий раунд не назван `Round 1` (находка C, воспроизведено дважды независимо: на DA-lazy-asm — единственный раунд `Round 2`, и на отдельно написанной фикстуре). Правка «первый раунд → текущий раунд» обязана попасть в тот же коммит, что и B2-01/B2-04, иначе политика грандфазеринга D4.2/D4.3 нереализуема, а строгий режим D5.3 включит ложную находку на первом же промаркированном тикете.

---

## 4. Задачи и решения оператора

### 4.1 Задачи

Порядок ниже — не «по номеру», а по **рекомендованной последовательности исполнения**. Прежняя формулировка «B2-01 несёт парсер, на который опираются 02–05» снята: от объединения парсера (B2-01) реально зависят только B2-04 и B2-07; B2-03 и B2-05 от него не зависят вовсе и могут идти первыми. B2-02 идёт в одной связке с B2-01 (один коммит — раздельно тестируется, но не раздельно мержится, см. §3.9 риск 5). Шесть задач, пропущенных в исходном анализе (P1–P6, находки независимой верификации), добавлены: P1–P3 — отдельными задачами `B2-16`–`B2-18`; P4 расширяет объём `B2-15`, P5 и P6 — объём `B2-05` (они дёшевы и лежат в том же коде).

Приоритет по стилману «сначала грандфазеринг, потом рефакторинг» (§5): проставление маркера (`B2-16`) включает пять классов проверок сразу (`SDD_PHASE_RECEIPT_*`, `SDD_EXECUTION_LOG_*`, групповые receipt) за объём M — дешевле и крупнее по эффекту, чем сам парсер, поэтому идёт первым.

| id | цель | файлы | тесты | размер | зависит от |
|---|---|---|---|---|---|
| **B2-16** (=P1) | Проставить `<!--PHASE_RECEIPTS:v1-->` на корпусе (миграция существующих тикетов) + механика, а не только выбор политики | `sdd-migrate` или отдельный шаг миграции; `shared/sdd/check.ts:219-241` (`firstRoundPhaseBlockCounts` → «текущий», не «первый», раунд — находка C); `shared/sdd/group-receipt.ts:298` (`every(memberIsReceiptAware)` — явное поведение при частично промаркированной группе) | фикстура с `### Round 2` + маркер → без ложного `SDD_EXECUTION_LOG_ROUND_MISSING`; групповой receipt на частично промаркированной группе — явный пропуск/предупреждение, не молчание | **M** | — (наивысший приоритет, см. §5) |
| **B2-07** | Закрыть обход `complete`: `SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE`; `sdd-log close` отказывает при фазе со статусом `[ ]` или отмеченным `DONE` без receipt | `shared/sdd/check.ts`; `cli/cmd/sdd-check/phase-receipt-check.ts`; `cli/cmd/sdd-log/sdd-log.types.ts:124-179` (`closeCurrentRound` — новая зависимость от `parsePhaseReceipts`, см. §3.5) | `execution-log.test.ts` кейс 10; `phase-receipt-check.test.ts`; `sdd-log.cmd.test.ts` — `close` при незакрытой фазе → exit 2 | **M** (пересмотрено с S — вводит зависимость от читаемой `PHASES_OVERVIEW`) | B2-16 |
| **B2-04** | Детекция записи после закрытия: `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE`, `_CLOSE_EXTRA_ENTRY`, `_ENTRY_LATER_THAN_CLOSE`, `_ROUND_UNCLOSED`; `sdd-log line/handoff/phase/complete` отказывают на закрытом раунде | `shared/sdd/check.ts`; `cli/cmd/sdd-log/sdd-log.cmd.ts:420,433-469,509-510`; `cli/cmd/sdd-log/sdd-log.types.ts:319-323` | `execution-log.test.ts` кейсы 2–4; `sdd-log.cmd.test.ts` — `line` после `close` → exit 2, `complete` в блок из `trailing` → exit 2; golden-фикстура `DA-lazy-asm` | **M** | B2-16, B2-07 |
| **B2-02** | `nextRoundNumber` сужен до секции `EXECUTION_LOG`; шаг миграции переименовывает legacy `### Round N` внутри `## Critic Rounds` в `### Critic Round N` | `cli/cmd/sdd-log/sdd-log.types.ts:76-79`; `shared/sdd/group-receipt.ts:64-68` (тот же полнофайловый откат, C7); `shared/sdd/migration-move.ts`; `ai/directives/sdd-v2/migration-v1-v2.directive.xml` | `execution-log.test.ts` кейс 1; `sdd-log.cmd.test.ts` — тикет с `## Critic Rounds` + `### Round 3` вне лога → следующий execution-round = 2 | S (в одной связке/коммите с B2-01) | B2-16 |
| **B2-03** | Словарь токенов: `TOKEN_VOCABULARY` в `execution-log.ts` как единственный дом (семь домов → один); `correction` добавлен (с опциональным `:`); `ver`/`yagni`/`fix`/`env-fix` приведены к решению оператора (D1); все документы цитируют, не переопределяют | `shared/sdd/execution-log.ts`; `shared/sdd/templates.ts:1581,1579,1356,1459`; `ai/directives/sdd-v2/formats/project-tasks-index.xml:19`; `formats/task-ticket-structure.xml:141`; `formats/module-tasks-index.xml:31`; `scaffold.directive.xml:286`; `ai/kit/axiom/audit/ax-execution-log-verification.xml`; `ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml:131`; `ai/kit/contract/process/phase-block-format.xml` (седьмой дом, требует также решения B2-18/P3); источники — `.hbs` | `execution-log.test.ts` кейсы 6–8; `templates.test.ts` — сгенерированный `specs/3-tasks.md` содержит ровно словарь из модуля | **M** | — (не зависит от B2-01) |
| **B2-01** | Один парсер Execution Log: `parseExecutionLog` + типы `Round`/`PhaseBlock`/`LogEvent`/`RoundClose`; перенести в него `scanBlockerTrail`, `parsePhaseHandoffs`, `firstRoundPhaseBlockCounts`; `check.ts`, `sdd-log`, `sdd-task`, `group-receipt.ts` переводятся на него — теперь рефакторинг поверх уже работающих проверок, а не их предпосылка | новый `shared/sdd/execution-log.ts`; `shared/sdd/check.ts:207-320,511-585`; `cli/cmd/sdd-log/sdd-log.types.ts:76,124,276,474`; `shared/sdd/group-receipt.ts:63`; `cli/cmd/sdd-task/sdd-task.cmd.ts:18` | новый `shared/sdd/__tests__/execution-log.test.ts` (кейсы 1–5, 9 из §3.6); существующие `check.test.ts:299-416`, `check-phases.test.ts`, `sdd-log.cmd.test.ts:550-707` должны остаться зелёными без правок | **L** | B2-02, B2-04, B2-07 (консолидирует их) |
| **B2-06** | Причинный `Reopens`: `parseAuditRounds` + `checkReopens` → `SDD_REOPENS_MISMATCH` / `_PENDING`; `sdd-log round` принимает причину только из закрытого словаря; третье противоречие (`TODO` vs `IN_PROGRESS`) снято | `shared/sdd/execution-log.ts`; `shared/sdd/check.ts`; `cli/cmd/sdd-log/sdd-log.cmd.ts:433-435,479`; `ai/kit/axiom/process/ax-reopen-format.xml` | новый `shared/sdd/__tests__/reopens.test.ts` (3 кейса из §3.6); `sdd-log.cmd.test.ts` — причина вне словаря → exit 4 | **M** | B2-01 |
| **B2-05** (+P5, P6) | `SDD_NO_TICKETS_FOUND` (error, exit 2) для `--all`/`--changed`; `sdd-check --all` печатает счётчик тикетов под грандфазерингом; **P5** — задокументировать exit 2 (`ERR_CLI_SDD_CHECK_UNKNOWN_ID`) в `help.ts:92`; **P6** — устранить асимметрию `--all`/`--task` на легаси-тикете (0 ошибок/exit 0 против 2 ошибок/exit 1 на одном файле) | `cli/cmd/sdd-check/sdd-check.cmd.ts:1275-1295,1378-1380`; `cli/cmd/sdd-check/help.ts` (коды выхода); `cli/cmd/sdd-check/sdd-check.types.ts` (сводка) | `shared/sdd/__tests__/check.test.ts` — пустое `specs/` → exit ≠ 0; `sdd-check.cmd.test.ts` — фикстура без тикетов; фикстура легаси-тикета — одинаковый набор находок в `--all` и `--task` | S | — |
| **B2-08** | Привести `ax-reopen-format.xml` к структуре v2: 4-колоночная `| ID | Kind | Deps | Status |`, явное требование добавить строки в `PHASES_OVERVIEW`, выбор между «новый `### Round`» и «`#### P<N> — re-run:`» (D2), и снять третье противоречие (`[ ] TODO` vs `[~] IN_PROGRESS`) | `ai/kit/axiom/process/ax-reopen-format.xml`; `ai/directives/sdd-v2/reconcile.directive.xml:113,194,250`; `ai/directives/sdd-v2/formats/task-ticket-structure.xml`; `.hbs`-источники | `sdd-log.cmd.test.ts` — реопен, записанный точно по аксиоме, закрывается `complete`; `check-phases.test.ts` — заголовок `| Phase | …` не читается как фаза, и колонка Status не путается с Deps ни на одной строке | M | — |
| **B2-09** | Устойчивость `parsePhasesOverview` к v1-заголовкам: щит по множеству имён колонок (не только `id`), либо чтение по именам колонок вместо позиций; `completePhase` перестаёт индексировать позицию Status жёстко | `shared/sdd/ticket.ts:202-203`; `cli/cmd/sdd-log/sdd-log.types.ts:295-311` | `ticket.test.ts` — `| Phase | Kind | Status | Target Files | Deps |` не даёт фазы `Phase` и не путает Status с Deps ни на одной строке; фикстура из `tasks/cli/lint/cli-lint.task-14.md` | S | — |
| **B2-10** | Миграция якорей: распознать `### Phase P1 — …` и `Phases Overview` на уровне `###`; при отсутствии `PHASES_OVERVIEW` в мигрируемом тикете — явный отказ/предупреждение, а не тихий пропуск всех фазовых проверок | `shared/sdd/anchor-inject.ts:12-28`; `shared/sdd/migration-plan.ts` | `anchor-inject.test.ts` — фикстуры `tasks/cli/lint/cli-lint.task-14.md` и `tasks/dbc/dbc-linter/dbc-linter.task-08.md`; `check-legacy-ticket.test.ts` | **L** (пересмотрено с M — меняет поведение `sdd-migrate` на 50 уже мигрированных тикетах, требует инвентаризации) | — |
| **B2-11** | Синхронизировать каталог проверок в `STEP_1_MECHANICAL.xml` с фактическим `sdd-check` (добавить `PHASE_RECEIPT`, `BDD_NEGATIVE`, `BDD_TRACE`, `COVERAGE_POLICY`, `SDD_TASK_ID_GRAMMAR`, групповые receipt); поправить `ax-task-id-integrity.xml` в части `AUDIT_ROUNDS` (heading-форма `sdd-extract <file>#audit-rounds`) | `ai/directives/sdd-v2/audit/steps/STEP_1_MECHANICAL.xml:108-110`; `ai/kit/axiom/audit/ax-task-id-integrity.xml`; `.hbs`-источники | `ai/kit/check-directives-fresh.ts` (существующий гейт свежести); тест соответствия «коды в `help.ts` ⊆ коды, перечисленные в директиве» | S | — |
| **B2-12** *(переформулирована после гейта адекватности — **D-40**)* | Единый расширяемый список исходных расширений (`shared/sdd/source-extensions.ts`) для `SDD_CONSUMERS_UNRESOLVED` и индекса тест-файлов. **Orphan-проверка переформулирована с `@tasks` на `@spec`** (ссылка на несуществующую спеку) и **передана владельцу `FO-4`** (полный переход на `@spec` в `2.0.0-draft`); за этой задачей остаётся единый список расширений + **уровень доказательства по языку** (`exact` для ts/tsx, `approximate` для остальных). Orphan-инвариант **flow-gated** и для v2 универсальным не является | новый `shared/sdd/source-extensions.ts`; `cli/cmd/sdd-check/sdd-check.cmd.ts:503,699-701` | `sdd-check.cmd.test.ts` — фикстура `Foo.swift` + `FooTests.swift`: consumer резолвится; orphan-`@spec` (ссылка на несуществующую спеку) → finding; уровень доказательства по языку объявлен | M | ребро на **`FO-4`** (разбор — `61 §2.2` п.8) |
| **B2-21** *(снята — **D-39**)* | flow-aware `checkTicketCoveragePolicy`: мягкий (lenient) режим проверок для v1/mixed — перестановка ветви `if (policy.status === 'legacy')` (`:595`) **перед** `SDD_VERIFICATION_TABLE_INVALID` (`:583-593`) + flow/scope-гейт для вызовов `:1191`, `:1372` (по образцу соседнего `specFlowVersion(...) === 'v2'` на `:1192`) | `cli/cmd/sdd-check/sdd-check.cmd.ts:583-595,1191,1372`; `shared/sdd/flow.ts` | — | S–M | **ОТМЕНЕНА (D-39):** мягкого режима для v1/mixed нет — проверки v2 едины, совместимость обеспечивается **только** мигратором (`E-14`, самомиграция D-3). Предпосылкой `E-07` вместо `B2-21` стал **`GAP-B-1`** (версионированный baseline находок + предикат zero-new-error); frozen-фикстура v1 перешла к **`E-22`**. Строка сохранена для трассируемости. Оговорка, снятая вместе с задачей: формулировка «код, который срабатывает на нетронутом v1» была неполна — ветка срабатывает **и на v2**-тикете (`specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md:532`) |
| **B2-22** *(новая — 06 §5.1 п.4)* | BDD fail-closed: `.skip`/`.todo`/неактивный тест **не считаются observed** (`bdd-coverage.ts:184-192`, регекс `:186`); unparseable row → `unknown/unverified` (сегодня — всегда `warn` **по инварианту** `checkUnparsedCoverageRows`, `:282-296`, вне градации `flowVersion`); зафиксировать поддержанный синтаксис-subset; negative fixtures. **Переход к `unknown` вводится через versioned baseline существующего корпуса, а не сплошным поднятием severity** — масштаб **140 строк** корпуса (измерено V-06), иначе задача мгновенно создаёт 140 новых `unknown` | `shared/sdd/bdd-coverage.ts:184-192,282-296`; negative-фикстуры | негативные фикстуры (`.skip`/`.todo`/неактивный тест не закрывают сценарий; malformed row → `unknown`) **+ фикстура на неудовлетворимость**: swift-тикет с корректной строкой покрытия не должен становиться незакрываемым (`20:505`, обратная сторона #9.2) | M | зависит от **B2-17** (spec-first) и **`GAP-B-1`** (точка отсчёта baseline); проверяется adversarial-корпусом **`E-23`**; критерий **A19**. Оценка «дешёвая» **не подтверждена измерением** (06 §6 п.6): сколько строк корпуса опираются на `.skip`/`.todo`-покрытие — неизвестно |
| **B2-13** | Убрать необеспеченную прозу: либо ввести CLI-бюджет повторов фазы, либо переформулировать `TECHNICAL_REPLAN_EXHAUSTED` (и его дубли в `ax-halt-vs-fail-distinction.xml:8`, `return-summary-format.xml:7`); либо учесть групповой receipt в `pickableTasks`, либо снять обещание кросс-спековой блокировки из `AX_AUDIT_HOOK` | `ai/directives/sdd-v2/execute.directive.xml:88-99`; `ai/kit/axiom/process/ax-audit-hook.xml`; `shared/sdd/check.ts:1349-1364` | `check-pickable.test.ts` — если выбран вариант «учитывать»: зависимая задача другой спеки не pickable без валидного `SDD_AUDIT_RECEIPT` | M | — |
| **B2-14** | Согласовать скелет Handoff: трёхполевой скелет несут **три** копии (`formats/task-ticket-structure.xml:147`, `templates.ts:1362`, неподключённый `phase-block-format.xml:20`) vs четырёхполевая запись `complete` | `ai/directives/sdd-v2/formats/task-ticket-structure.xml:147`; `shared/sdd/templates.ts:1362`; `ai/kit/contract/process/phase-block-format.xml:20`; `cli/cmd/sdd-log/sdd-log.types.ts:253-256` | `templates.test.ts`; `sdd-log.cmd.test.ts:446` (существующий) | S | — |
| **B2-15** (+P4) | Разгрести долг в собственном дереве RC: 3 `SDD_TASK_ID_COLLISION` (в т.ч. настоящий дубль `TSK-88`); синхронизировать `specs/3-tasks.md` с `templates.ts` — **и словарь (`:12` vs `:1581`), и Baseline Completion Rule (`:11` vs `:1579`)** | `tasks/vcs/vcs-mr-client/vcs-mr-client.task-88.md:7`; `tasks/dbc/dbc-linter/dbc-linter.task-88.md:7`; `tasks/cli/update-check/update-check.task-35.md`; `tasks/infra-npm-publish/infra-npm-publish.task-45.md`; `specs/3-tasks.md:11-12` | `sdd-check --all .` — ноль `SDD_TASK_ID_COLLISION`; `specs/3-tasks.md` совпадает с генератором построчно | S | — |
| **B2-17** (=P2) | Обновить нормативные спеки: `specs/cli/sdd-log/sdd-log.spec.md` отстала от кода (`:25` и `:119` перечисляют 8/6 режимов вместо 11 — нет `authoring-complete`, `audit-receipt`, `review-receipt`); `specs/cli/sdd-check/sdd-check.spec.md` (38 кодов) не покрывает добавляемые в этом треке коды | `specs/cli/sdd-log/sdd-log.spec.md:25,119`; `specs/cli/sdd-check/sdd-check.spec.md` | ручная сверка со списком `MODES` (`sdd-log.cmd.ts:62-74`) и списком кодов `help.ts`; по правилам самого v2 (spec-first) без этого остальные задачи трека формально неисполнимы | M | — (блокирующее требование, не косметика) |
| **B2-18** (=P3) | Достроить `ai/kit/contract/process/**` до собранного состояния или явно удалить: 7 неподключённых кирпичей, в т.ч. `phase-block-format` (единственный дом `yagni` и полный скелет фазового блока) и `blocker-format` (формат, на который ссылается сам `sdd-log.types.ts:226`) | `ai/kit/contract/process/{blocker-format,orchestrator-progress-format,phase-block-format,phase-progress-format,return-summary-format,side-dive-format,trace-header-format}.xml`; шаблоны `ai/kit/templates/sdd-v2/**.hbs` | гейт «каждый кирпич подключён хотя бы одним `.hbs`» (`grep -rn 'contract/process/<name>"' ai/kit/templates` не должен давать 0 ни для одного из семи) | S на диагностику, M на решение по каждому | связана с B2-03 (словарь) |

**Формулировка файлов в B2-03, B2-08, B2-11 (замечание верификации).** `ai/directives/**` — build-output от `ai/kit/build-directives.ts`; гейт свежести (`ai/kit/check-directives-fresh.ts`, `package.json:43` → `audit:sdd-templates`) не даёт мержить правки прямо в выходные `.xml` — его шапка описывает именно этот инцидент. Списки файлов этих трёх задач нужно читать как «источник → выход»: например `ai/kit/templates/sdd-v2/formats/project-tasks-index.hbs` → `ai/directives/sdd-v2/formats/project-tasks-index.xml`; `ai/kit/axiom/audit/ax-execution-log-verification.xml` (сам источник, партиал, подключается видом `{{> "axiom/audit/ax-execution-log-verification"}}`) → `audit.directive.xml`.

### 4.2 Решения, которые может принять только оператор

> **Дисклеймер об именах (снятие противоречия P-02, `61:245`).** Ярлыки **D1–D5** ниже — **локальная** нумерация развилок этого раздела (`31 §4.2`), не глобальные решения оператора `D-1..D-51` из `01-INTERVIEW-DECISIONS.md`. Совпадение цифр с локальным «**D3**» и «**D4**» ниже и глобальными **`D-3`** (самомиграция `gennady`, `01-INTERVIEW-DECISIONS.md:67`) и **`D-4`** (порог `group-receipt` WARN→ERROR, `01-INTERVIEW-DECISIONS.md:68`) — случайное и было источником путаницы (вопрос `O-9`, снят задачей **`P-02`**). Для локального **D4** (грандфазеринг: три опции opt-in/invert/dated) единый владелец и решение уже назначены на доске и цитируются здесь, а не переоткрываются: порог WARN→ERROR группового receipt исполняет задача **`B2-20`** (`61:83`; зависит от `B2-16`, **`E-14`**, `B2-17`, `E-22`; критерий **A13**; решение — глобальные **`D-4`**/**`O-6`**), самомиграция — задача **`E-14`** (`61:193`; критерий **A1**; решение — глобальное **`D-3`**, обязательна по **`D-39`** — единственный путь совместимости с v1, мягкого v1/mixed-режима нет). Перекрёстная ссылка в обратную сторону — `40-TRACK-DIRECTIVES-SKILLS.md` §5, строка `P-02`. Три опции локального D4 ниже остаются как **механика маркера** (какая именно CLI-семантика проставления `<!--PHASE_RECEIPTS:v1-->` — не то же самое, что «когда включать» WARN→ERROR, это решает **`B2-20`**), а не как открытый вопрос о владельце.

**D1. Судьба токена `ver` при живом `SDD_PHASE_RECEIPT`.** Сейчас `ver` — 47 из 129 строк живого тикета, требуется двумя документами аудита и отсутствует в собранной таблице токенов; при этом v1 сам держал `ver` в словаре (`check.sh:525`, `scaffold.directive.xml:719`), и v2 уже вынес вердикт о его доказательной силе (`execute.directive.xml:42` — «a hand-written `ver` line is not evidence»).
1. **Вернуть `ver` в словарь** как человеческую заметку рядом с машинным receipt; закрывать фазу по-прежнему может только receipt. Это ровно оформленная в директиве позиция (см. цитату выше). Плюс: ничего не переписывается, аудит остаётся консистентным. Минус: два представления одного факта, риск расхождения между `ver`-строкой и receipt.
2. **Оставить только receipt**, вычистить `ver` из `ax-execution-log-verification.xml` и `STEP_2_SEMANTIC.xml:131`, мигрировать 47 строк в legacy. Плюс: одно доказательство. Минус: это регрессия относительно v1, а не наведение порядка — теряется человекочитаемый след «что именно гонял воркер и что увидел».
3. **`ver` разрешён, но только как `correction`-подобная приписка к receipt** — обязательная ссылка на id receipt. Плюс: связь есть. Минус: самая дорогая по реализации и по дисциплине агента.

**D2/D6. Одна форма реопена и судьба `✅ RESOLVED` после закрытия раунда — решения СВЯЗАНЫ, не независимы.** B2 подавал их как два отдельных вопроса; это не так: `buildResolvedLine` (`sdd-log.types.ts:391`) требует `--phase`, а `--phase` требует **открытого** блока фазы (`ERR_CLI_SDD_LOG_PHASE_NOT_OPEN`) — то есть `resolved` физически не может выполниться, если ни один блок фазы не открыт. В DA-lazy-asm ровно так: 7 строк `✅ RESOLVED` после закрытия лежат в блоках `— re-run:`, открытых после закрытия.

Форма реопена (сначала):
1. **Только новый Round.** Плюс: `Reopens`, групповая подпись и нумерация становятся честными; append-only соблюдён буквально. Минус: раунд на однострочный фикс — тяжело; форма `— re-run:` уже поддержана CLI и покрыта тестами (`sdd-log.cmd.test.ts:543,626`), придётся выпиливать.
2. **Только `— re-run:` внутри раунда.** Плюс: дешёвая петля фикса, соответствует фактической практике. Минус: «раунд» перестаёт быть единицей попытки, `Reopens` и подпись группового receipt (`roundCount`) теряют смысл, C6/C8 нечем измерять.
3. **Две формы с явной границей:** `— re-run:` разрешён **только до** закрытия раунда, после закрытия — обязателен новый Round. Плюс: сохраняет и дешёвую петлю, и осмысленность раунда; ровно эта граница делает C6 проверяемым — на receipt-aware тикете второй блок той же фазы в Round 1 уже сейчас ловится как `SDD_EXECUTION_LOG_PHASE_DUPLICATE` (воспроизведено), то есть внутрираундовый случай не требует нового кода `sdd-check`, только отказа в `sdd-log` и правки `firstRoundPhaseBlockCounts` (B2-16). Минус: агенту надо помнить состояние раунда — снимается отказом CLI.

Судьба `✅ RESOLVED` после закрытия (затем):
1. **`resolved` — исключение из запрета записи после закрытия.** Плюс: сохраняет честный сценарий. Минус: одна легальная дыра в append-only, через которую можно протащить что угодно с маркером ✅.
2. **Снятие блокера обязано открывать раунд.** Плюс: append-only без исключений. Минус: раунд ради одной строки; часть блокеров снимается вообще вне тикета.
3. **Отдельный раздел `## Blocker Trail` вне раундов**, куда `sdd-log resolved` пишет с обратной ссылкой на раунд/фазу. Плюс: и хронология, и append-only целы. Минус: новая секция — правки шаблона, `sdd-extract`, `scanBlockerTrail` и миграции.

**Совместимость.** При варианте 1 («только новый Round») и варианте 2 («только `— re-run:`») выбор по `✅ RESOLVED` остаётся действительно свободным. При варианте 3 («`— re-run:` только до закрытия») **вариант 1 по `RESOLVED` («исключение») механически недостижим**: если блоки после закрытия запрещены, `resolved`, которому нужен открытый блок, никогда не выполнится после закрытия — реальный выбор стоит между вариантами 2 и 3 по `RESOLVED`. Рекомендация: реопен-вариант 3 (сохраняет и петлю, и осмысленность раунда) + `RESOLVED`-вариант 3 (отдельный `## Blocker Trail`, `resolved` пишет туда с обратной ссылкой) — сохраняет и append-only без исключений, и честный сценарий снятия блокера позже.

**D3. Что означает `[x] DONE` в v2** (не путать с глобальным `D-3` — самомиграция `gennady`, владелец `E-14`, см. дисклеймер в начале §4.2). `ax-audit-hook.xml` говорит «mechanical close, not verification», `AX_AUDIT_HOOK` при этом обещает блокировку зависимых задач других спек (задокументировано в четырёх местах — находка B), а `pickableTasks`/`sdd-task --audit-group` эту блокировку не делают.
1. **Оставить как есть**, но снять обещание из всех четырёх мест. Плюс: ноль работы. Минус: неаудированный результат легально распространяется по графу — ровно тот риск, ради которого C10 существовал.
2. **Учесть групповой receipt в `pickableTasks`**: задача другой спеки не pickable, пока владеющая спека зависимости не несёт валидный `SDD_AUDIT_RECEIPT`. Плюс: обещание становится правдой, дешевле полного возврата к C10. Минус: нужен план проставления `<!--PHASE_RECEIPTS:v1-->` (B2-16), иначе гейт выключен грандфазерингом; риск взаимных блокировок на кросс-спековых циклах.
3. **Ввести третий статус** `[~] CLOSED_UNAUDITED` между `IN_PROGRESS` и `DONE`; `DONE` ставит только групповой receipt. Плюс: ближе всего к смыслу C10 и читается глазами. Минус: трогает Meta-грамматику, трекеры, `pickableTasks`, `setMetaStatus`, все шаблоны и весь существующий корпус.

**D4. Политика грандфазеринга** (не путать с глобальным `D-4` — WARN→ERROR, владелец `B2-20`, см. дисклеймер в начале §4.2). Маркер `<!--PHASE_RECEIPTS:v1-->` не несёт ни один тикет в RC, то есть receipt- и exec-log-проверки выключены на всём корпусе, а не на его хвосте.
1. **Оставить opt-in маркер**, добавить в сводку `sdd-check` счётчик «N тикетов под грандфазерингом». Плюс: ничего не ломается, невидимость снимается. Минус: включение остаётся чьей-то будущей задачей.
2. **Инвертировать:** проверять всех, освобождать явным `<!--PHASE_RECEIPTS:none-->`. Плюс: новый тикет под проверкой по умолчанию, долг виден сразу. Минус: одноразовая правка каждого legacy-тикета либо волна находок.
3. **Датировать:** тикеты, созданные после даты X (или под v2-именем `*.task.<ID>.md`), проверяются всегда. Плюс: не требует правки старых файлов. Минус: ещё один неявный гейт версии рядом с `isV2SpecsTicket` и `detectScopeFlowVersion` — третий по счёту.

Уточнение: варианты 2 и 3 требуют предварительной правки `firstRoundPhaseBlockCounts` на «текущий раунд» (задача B2-16) — иначе включение немедленно даёт ложный `SDD_EXECUTION_LOG_ROUND_MISSING` на любом тикете не с первым раундом (находка C, воспроизведено на DA-lazy-asm и независимо).

**D5. Строгость новых кодов и CI.** У RC уже 198 ошибок `sdd-check --all` на собственном дереве.
1. **Все новые коды сразу error.** Плюс: честный гейт с первого дня. Минус: `sdd-check --all .` в CI неиспользуем, пока долг не разобран.
2. **Warn сейчас, error после инвентаризации долга** (B2-15 + golden-фикстура `DA-lazy-asm`). Плюс: измеримый путь. Минус: окно, в котором проверка есть, но не блокирует.
3. **Error только на receipt-aware тикетах, warn на остальных** (как в §3.4). Плюс: новый тикет защищён немедленно, старый не шумит. Минус: связано с D4 — при варианте D4.1 error фактически не срабатывает почти ни на чём, а без правки B2-16 может сразу дать ложную находку (см. D4).

**Задача `P-02`: ВЫПОЛНЕНО (пачка 8, документная часть, 2026-09-08).** Противоречие снято дисклеймером выше + перекрёстной ссылкой на `40-TRACK-DIRECTIVES-SKILLS.md` §5 (строка `P-02`); единый явный владелец — `E-14` (самомиграция, `D-3`) и `B2-20` (порог WARN→ERROR, `D-4`/`O-6`). Локальные развилки D3/D4 этого раздела остаются как есть (механика — не владелец) и решаются оператором в обычном порядке постановки, независимо от глобальных `D-3`/`D-4`.

---

## 5. Итог верификации

**Что проверялось.** Независимая верификация (V-B2, свежие глаза, read-only) перепроверила 61 цитату `file:line` из §1–§4 по коду обоих чекаутов (MAIN, RC) на собственных, самостоятельно написанных фикстурах (`scratchpad/Vb2/`; `B2fix/` аналитика не открывался и не читался), включая byte-for-byte репродукцию всех пяти фактов Ф1–Ф5, все 21 вердикт инвариантов C1–C15/D3–D8, весь модуль-предложение §3 и объём/зависимости 15 исходных задач §4.1.

**Счёт по цитатам:** 48 CONFIRMED, 10 WRONG-LINE (сдвиг строки на 1–16, факт по существу верен — исправлено выше в тексте), 3 REFUTED (утверждение о механизме было неверным, а не только неточным — переписано в C7, D3, C11).

**Счёт по вердиктам:** согласие **21 из 21** — ни один вердикт не опровергнут.
- Подтверждены целиком, без правок доказательств (12): C1, C2, C3, C5, C8, C13, C14, C15, D5, D6, D7, D4.
- Подтверждены с правками доказательств (9): C4, C6, C7, C9, C10, C11, C12, D3, D8.

**Три исправленных утверждения** (не вердикта, а доказательства — уже применены в §1): (1) C7, v1-сторона — снята несуществующая функция `sdd_lib_execution_log`, заменена на измеренный жёсткий вход `check.sh:557` и сознательный отказ от якорей-делимитеров (`:554-556`); (2) C7/D3 — снята неверная ссылка на `infra.directive.xml:51` как на «предписание» сохранять `## Critic Rounds» (аксиома говорит обратное и о спеках, не о тикетах), заменена на измеренный радиус (3 живых тикета); (3) C11 — снято утверждение «токена `yagni` нет ни в одном словаре»: он объявлен в `phase-block-format.xml:11`, седьмом (не шестом) доме словаря.

**Три находки, изменившие картину** (не было в первом проходе анализа, встроены в §2/§3):
- **A** (§2.3, §3.1, C11) — ни один собранный директив v2 не подключает `ai/kit/contract/process/phase-block-format.xml`; всего 7 неподключённых «кирпичей» формата. Это исчерпывающе объясняет Ф3 (47 % строк вне словаря): агент физически не видит их.
- **B** (§2.3/C10) — необеспеченное обещание «Baseline Completion Rule» / блокировки зависимых тикетов живёт в **четырёх** сгенерированных местах (`templates.ts:1579,1583`, `project-tasks-index.xml:18,20`), а не в одном `AX_AUDIT_HOOK`.
- **C** (§2.3, §3.4, §3.9 риск 7) — включение маркера `<!--PHASE_RECEIPTS:v1-->` на тикете, чей раунд не первый по счёту (как DA-lazy-asm — единственный раунд `Round 2`), немедленно даёт ложный `SDD_EXECUTION_LOG_ROUND_MISSING`; это блокирует грандфазеринг-политики D4.2/D4.3 без предварительной правки `firstRoundPhaseBlockCounts` (задача B2-16).

**Тесты (проверены самостоятельно, все три группы совпали до единицы):** 63/63 (`sdd-log.cmd.test.ts`), 160/160 (`shared/sdd/__tests__/{check,check-phases,check-taskgraph,check-taskid-grammar,check-legacy-ticket,group-receipt,phase-receipt,task-id,section}.test.ts`), 183/183 (`cli/cmd/sdd-check`+`sdd-log`+`sdd-task`+`sdd-extract`). Расхождение только во внутренних счётчиках `it`: `check.test.ts` = 40 (не 44), `check-phases.test.ts` = 11 (не 12) — уже исправлено в C4.

**Долг RC на своём дереве:** 198 error, 431 warn, 212 файлов — подтверждено ровно; ноль находок `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING`/`SDD_PHASE_RECEIPT_*`/`SDD_EXECUTION_LOG_*` — грандфазеринг выключил три класса проверок на всём корпусе, а не на его хвосте, как и утверждал исходный анализ.

**Итоговый вывод не изменился, но приоритет работ — да.** Предложение §3 (единый модуль `execution-log.ts`) выживает проверку целиком — ни один инвариант и ни одна из 15 исходных задач не опровергнуты. Но возражение «сначала грандфазеринг, потом рефакторинг» выигрывает спор о **порядке**: проставление маркера `<!--PHASE_RECEIPTS:v1-->` (задача B2-16, бывшая P1) включает пять классов проверок сразу (`SDD_PHASE_RECEIPT_*`, `SDD_EXECUTION_LOG_*`, групповые receipt) за объём M — дешевле и крупнее по эффекту, чем сам парсер. Пост-закрытие уже произошло на живом артефакте (Ф2), и receipt сам по себе его бы не поймал — он привязан к фазе и файлам, а не к хронологии; лечит только `Round.trailing` (B2-04). Рекомендованный порядок исполнения закреплён в §4.1: **B2-16 → B2-07 → B2-04 → B2-02/B2-01 → B2-03 → B2-06**; восемь задач (B2-05, B2-08…B2-15, B2-17, B2-18) независимы и могут идти в любой момент.

Документ ждёт решений оператора по D1, D2/D6 (объединено), D3, D4, D5 (§4.2); после их принятия задачи §4.1 могут быть переданы в `sdd-scaffold`.
