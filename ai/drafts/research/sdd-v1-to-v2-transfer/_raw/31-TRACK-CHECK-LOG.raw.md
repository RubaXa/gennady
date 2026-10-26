# Часть I — B2-check-log-track (аналитик)

# B2 — трек CHECK-LOG: `sdd check` / Execution Log / Task-ID / закрытие раунда / reopens / receipts

Аудит переноса SDD v1 → v2. Только чтение; ни один отслеживаемый файл не изменён.

- **MAIN (v1)** — `origin/main` `8bb38477`: `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`
- **RC (v2)** — `codex/sdd-v2-rc52-followup`: `/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad/rc-v6`
- Фикстуры и сырые прогоны этого отчёта: `…/scratchpad/B2fix/` (`all.txt`, `proj/`, `forge/`, `mig/`, `drive.mjs`, `runtests.mjs`)

Вердикты: **ЗАКРЫТО** · **ЧАСТИЧНО** · **НЕ ЗАКРЫТО** · **НЕПРИМЕНИМО** (концепта в v2 нет И потребность исчезла — с указанием, что её заменило).

---

## 0. Пять фактов, на которых держатся все вердикты ниже

Всё измерено на RC-чекауте, а не выведено из документов.

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
47 ver · 35 discovery · 15 DONE · 7 ✅ · 6 yagni · 4 intro · 4 decision · 3 fix · 3 env-fix · 2 verified · 2 correction · 1 insight
```
Объявленный словарь (`shared/sdd/templates.ts:1581`): `intro · decision · tried · discovery · insight · verified · SDD_PHASE_RECEIPT · BLOCKED · DONE`. Вне словаря: `ver` (47!), `yagni`, `fix`, `env-fix`, `correction` — **61 строка из 129 (47 %)**. В v1 каждая из них — находка `unknown-token` (`check.sh:514-518`).

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
`complete` — единственный режим с гарантией; `line` + `handoff` воспроизводят байтовую форму закрытой фазы без receipt, а `close` пишет `Meta Status → [x] DONE` (`cli/cmd/sdd-log/sdd-log.cmd.ts:485`) не проверив ни одной фазы.

**Ф5. `nextRoundNumber` считает `### Round N` по всему файлу.** Фикстура `B2fix/proj`: `### Round 1` внутри `EXECUTION_LOG` + унаследованный `## Critic Rounds` / `### Round 7` за пределами секции → `nextRoundNumber = 3` (`cli/cmd/sdd-log/sdd-log.types.ts:76-79`). Для сравнения, `memberRoundCount` в `shared/sdd/group-receipt.ts:63-67` ту же величину считает **внутри** `extractSection(content,'EXECUTION_LOG')`. Асимметрия внутри одного релиза.

Все релевантные RC-тесты зелёные: `cli/cmd/sdd-log/__tests__/sdd-log.cmd.test.ts` 63/63; `shared/sdd/__tests__/{check,check-phases,check-taskgraph,check-taskid-grammar,check-legacy-ticket,group-receipt,phase-receipt,task-id,section}.test.ts` 160/160; `cli/cmd/sdd-check/__tests__/*` + `sdd-log/__tests__/group-receipt.cmd.test.ts` + `sdd-task` + `sdd-extract` 183/183. То есть всё, что ниже помечено «НЕ ЗАКРЫТО», не сломано — оно просто не описано ни одним тестом.

---

## 1. Матрица инвариантов

### C1 — грамматика Task-ID и однозначность разбора

**v1.** `SDD_TASK_ID_RE='TSK-([A-Z]+-[0-9]{3}|[0-9]+)'`, путевая форма — ровно три цифры; парсинг «взять токен целиком, затем проверить с якорями» и граница `([^A-Z0-9-]|$)`, чтобы `TSK-IB-0012` никогда не читался как `TSK-IB-001`. `ai/skills/sdd-execute/scripts/_sdd-lib.sh:36-97`, тесты `scripts/__tests__/sdd-task-id.test.ts`.

**v2.** Грамматика другая: `<ACR>-<slug>` = `^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$` (`shared/sdd/task-id.ts:16`), плюс `SLUG_MAX_LEN = 8` (`:19`), валидатор `validateTaskId` (`:38-46`). Проблема неоднозначности решена не парсингом, а **запретом самой конфигурации**: `findPrefixClashes` (`shared/sdd/task-id.ts:166-177`) → `SDD_TASK_ID_PREFIX_CLASH` (`shared/sdd/check.ts:1392-1406`, без v1/v2-гейта — намеренно, чтобы ловить коллизии в миграции), плюс `SDD_TASK_ID_COLLISION` (`check.ts:1385`). Обнаружение тикетов — по содержимому Meta и по имени `<module>.task.<ID>.md` (`task-id.ts:63` `V2_TASK_FILENAME`), не по глобу. Сама грамматика проверяется только для v2-тикетов под `specs/` — `isV2SpecsTicket` (`cli/cmd/sdd-check/sdd-check.cmd.ts:962`, вызовы `:1194`, `:1374`).
Тесты: `shared/sdd/__tests__/task-id.test.ts`, `check-taskid-grammar.test.ts`, `check-taskgraph.test.ts`.

**Вердикт: ЗАКРЫТО** (механизм иной, потребность закрыта строже: v1 умел безопасно **читать** двусмысленные ID, v2 запрещает их **создавать**).

**Оговорка (не про инвариант, про дерево).** В самом RC-дереве живут 3 `SDD_TASK_ID_COLLISION`, среди них настоящий дубль: `tasks/vcs/vcs-mr-client/vcs-mr-client.task-88.md:7` и `tasks/dbc/dbc-linter/dbc-linter.task-88.md:7` — оба `**Task-ID:** TSK-88`. Проверка работает, дерево грязное.

### C2 — коды выхода: никогда `findings=0` без проверенного объекта

**v1.** `--task` с плохим или отсутствующим ID → exit 4; дерево без тикетов → `NO_TICKETS_FOUND` exit 2; находки → exit 3. `check.sh:49-54,97-120,160-161,193-199,663-666`.

**v2.** `--task` держится: неизвестный, но ID-образный аргумент → `ERR_CLI_SDD_CHECK_UNKNOWN_ID`, **exit 2**, со списком известных Task-ID; нечитаемый путь → `ERR_CLI_SDD_CHECK_FILE`, **exit 1**; `findings=0` в этих случаях не печатается. `--all` над нулём тикетов → **exit 0 «clean»** (Ф1).

**Вердикт: ЧАСТИЧНО.** Ровно та дыра, которую A4 зафиксировал по #9.1, воспроизведена; она хуже v1-й, потому что даже полностью пустой корень отвечает «✅ clean — 0 file(s) checked».

### C3 — orphan-скан `@tasks` по 14 расширениям

**v1.** `[TASKID]`: `.ts .js .sh .go .swift .m .mm .h .kt .java .py .rb .rs .cs .php` (`check.sh:282-286`).

**v2.** Механической проверки orphan-`@tasks` **нет вообще** — ни кода `SDD_*`, ни грепа. Есть только:
- `SDD_TASKS_APPEND_ONLY_REGRESSION` (`shared/sdd/tasks-append-only.ts:33-51`) — заголовок `@tasks:` не теряет ID, бывший в HEAD; язык-агностично, читает любой файл;
- `SDD_CONSUMERS_UNRESOLVED` — грепает `--include=*.ts --include=*.tsx --include=*.js` (`cli/cmd/sdd-check/sdd-check.cmd.ts:699-701`);
- индекс тест-файлов для BDD — `/\.(test|spec)\.(ts|tsx|js)$/` (`:504`).
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

Тесты: `shared/sdd/__tests__/check.test.ts` (44 it), `check-phases.test.ts` (12 it, включая `:171` «flags a missing Round 1 for the current receipt-aware contract» и `:184` «grandfathers an older V2 ticket without the receipt schema marker»).

**Вердикт: ЧАСТИЧНО.** Половина про фабрикацию и блокеры — ЗАКРЫТО и даже шире v1 (пофазное спаривание 🛑/✅). Половина про словарь и целостность раунда — НЕ ЗАКРЫТО.

### C5 — `unclosed-round` только при ≥1 отмеченной фазовой строке

**v1.** Раунд без закрытия — находка, но пустой скелет ею не считается (`f8d42a33`, `check.sh` [LOG] awk; тест «says nothing about a round that never ran»).

**v2.** Проверки «раунд открыт и не закрыт» нет. `sdd-log round` ставит `Meta Status → [~] IN_PROGRESS` (`sdd-log.cmd.ts:479`), `close` — `[x] DONE` (`:485`); зависший `IN_PROGRESS` никем не диагностируется — `grep IN_PROGRESS shared/sdd/check.ts cli/cmd/sdd-check/*.ts` даёт ноль. Ложных срабатываний на скелете тоже нет — по той же причине.

**Вердикт: НЕ ЗАКРЫТО.** Опасность частично снята тем, что закрытие теперь пишет CLI, а не агент, но «оркестратор не позвал `close`» остаётся необнаруживаемым, и именно так выглядит незавершённая партия в очереди (`execute.directive.xml:181` `all`/`batch`/`queue`).

### C6 — целостность после закрытия раунда

**v1.** Отмеченная запись со штампом позже собственного `Round close` → `entry-after-close`; отмеченная timestamped live-запись **внутри** блока закрытия → `extra-close-entry`; `T09:00Z` и `T09:00:00Z` сравниваются в равной точности. `check.sh:538,567,593-600,643`, 7 тестов «post-close integrity».

**v2.** Нет ничего, и есть два независимых канала записи после закрытия:
1. `line` / `phase` / `handoff` / `blocker` / `resolved` без `--phase` вставляются в `bounds.closeLine` — конец **секции**, то есть после `#### Round close` (`sdd-log.cmd.ts:405`, ветки `:433-469`, вставка `:504-506`). Воспроизведено (Ф4).
2. `completePhase` ищет заголовок фазы в диапазоне `currentRound + 1 … log.closeLine` (`sdd-log.types.ts:314-330`) и **не останавливается** на `#### Round close` — значит блок `#### P3 — re-run:`, созданный после закрытия, считается «текущим раундом» и закрывается штатно.
Второй `close` при этом откажет («current Round is already closed», `sdd-log.types.ts:157`), так что раунд остаётся навсегда закрытым, а работа продолжает в него дописываться. Именно эта картина — в DA-lazy-asm (Ф2).

**Вердикт: НЕ ЗАКРЫТО.** Самая дорогая потеря трека: она уже произошла на живом артефакте, и её никто не увидел.

### C7 — регион Execution Log; `## Critic Rounds` не парсится как лог

**v1.** Единое правило региона `sdd_lib_execution_log` (якоря `<!--SECTION:EXECUTION_LOG-->` либо `## N. Execution Log`, выход на любом `## `). Тесты `sdd-check-log.test.ts:507-535`.

**v2.** Структурно сильнее: `extractSection` / `findSectionBounds` требуют ровно одну сбалансированную пару маркеров (`shared/sdd/section.ts:141,192`), плюс `SDD_ANCHOR_UNBALANCED` и `SDD_SECTION_OVERLAP` (`check.ts:430-435`) — вложенность и перекрытие секций диагностируются отдельно. `memberRoundCount` (`group-receipt.ts:63-67`) корректно сужает счёт до секции.
**Остаток:** `nextRoundNumber` (`sdd-log.types.ts:76-79`) — единственная функция в цепочке, которая читает `fileContent` целиком; воспроизведено, `nextRoundNumber = 3` вместо 2 (Ф5).

**Вердикт: ЧАСТИЧНО** (для новых тикетов закрыто; хвост — ровно на мигрированном v1-тикете, у которого `## Critic Rounds` остаётся, как это прямо предписано `infra.directive.xml:51` / `interface.directive.xml:48`).

### C8 — `[REOPENS]`: Meta `Reopens` = число раундов, ВЫЗВАННЫХ аудитом

**v1.** Двусторонняя причинность по записям `@audit … triggered-reopen=Round-N`, вердикты `OK|PENDING|MISMATCH|UNVERIFIABLE`; никогда не «число заголовков − 1». `check.sh:19,347-418`, тесты `sdd-check-log.test.ts:230,238,319-341`.

**v2.** Данные для проверки есть, проверки нет:
- поле `Reopens` объявлено в `formats/task-ticket-structure.xml:36`, `scaffold.directive.xml:181`, `templates.ts:1251`, и как колонка трекеров — `formats/module-tasks-index.xml:12`, `formats/scope-tasks-index.xml:31`, `templates.ts:1440,1522`, `migration-move.ts:161,258`;
- машиночитаемая причинность объявлена: `formats/audit-round.xml` — `@audit … after-exec-round=<M> triggered-reopen=<Round-M+1|none>`;
- обновляется вручную агентом: `ai/kit/axiom/process/ax-reopen-format.xml` («Update `Reopens: <new count>`»), `reconcile.directive.xml:113,194,250`;
- в коде: `grep -rn Reopens shared/ cli/` → только шаблоны и заголовки таблиц; в `shared/sdd/check.ts`, `shared/sdd/tracker.ts`, `cli/cmd/sdd-log/**` — **ноль**.

**Вердикт: НЕ ЗАКРЫТО.** Противоречие #13 («Round headers − 1» vs «только аудит-раунды») в v2 снято — формулы «−1» нигде нет; но замка тоже нет, а значит расхождение Meta ↔ `@audit` вернётся молча. Плюс словарь причин раунда так и остался неформализованным: `sdd-log round "<reason>"` принимает любую строку (`sdd-log.cmd.ts:433-435`), подсказка `initial | fix: F-NNN | resume` живёт только в JSDoc `buildRoundHeader` (`sdd-log.types.ts:84`).

### C9 — `[RULES]`: четыре проверяемые секции в каждом файле правил

**v1.** Каждый не-`*.directive.xml` файл в каскадных категориях обязан нести `<BeliefState>`, `<AntiPatterns>`, `<VerificationHooks>`, `<RewardCriteria>`; отдельный счётчик `rule_findings=`. `check.sh:20,33-43,436-494,664`.

**v2.** Проверяется другое: **замкнутость каскада**, а не наполнение файла — `SDD_RULES_CASCADE_UNRESOLVED` (`shared/sdd/rules-cascade.ts`, объявлено в `cli/cmd/sdd-check/help.ts`: «each phase Rules: list is the full `<DependsOn>` closure» + путь-как-доказательство: небезопасный/отсутствующий/симлинк-путь fail-closed). Отдельного `rule_findings=` нет, находка идёт в общий счётчик. Проверки четырёх секций нет; она перенесена в аудит — `RULE_FILE_INCOMPLETE` в таксономии (`audit.directive.xml:184` — маршрут «ticket update … OR a separate rule-maintenance task»).

**Вердикт: НЕ ЗАКРЫТО в этой форме.** Потребность частично покрыта иначе (замкнутость каскада — то, чего в v1 не было), но «правило-пустышка проходит зелёным» вернулось. Это стык с треком RULES; здесь фиксирую только то, что `sdd-check` перестал быть его владельцем.

### C10 — `[x] DONE` означает «прошёл аудит»

**v1.** Закрытие раунда ставит `[~] IN_PROGRESS`; `[x] DONE` пишет **только** аудит с вердиктом PASS, он же ре-синхронизирует трекеры; pickability считает по DONE. `sdd-execute/SKILL.md:49-50,124`, `scaffold.directive.xml:241` (`AX_AUDIT_HOOK`).

**v2. Инвариант сознательно перевёрнут, и это задокументировано.** `ai/kit/axiom/process/ax-audit-hook.xml`: «A ticket closes on its own phase gates — `[x] DONE` is mechanical close, not verification». `execute.directive.xml:64`: «Enforcement point is the GROUP-COMPLETION boundary, never `sdd-log close` (close precedes audit — requiring a receipt at close would deadlock)». Новый гейт — групповой receipt:
- писатель `sdd-log <group> audit-receipt <verdict>` / `review-receipt` (`sdd-log.cmd.ts:295-299`), отказ пока не все члены `[x] DONE` (`group-receipt.ts:150` в `buildGroupReceipt`), привязка к HEAD и подпись по `[basename, roundCount, done]` (`group-receipt.ts:104-119`, `deriveGroupState`);
- читатель `checkGroupReceipts` (`group-receipt.ts:294-320`) → `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING`;
- реопен (новый `### Round N` у любого члена) инвалидирует подпись → receipt становится stale.

Что при этом **не** удержано:
1. `sdd-log close` пишет `Meta Status → [x] DONE` (`sdd-log.cmd.ts:485`) **без единой проверки**: в Ф4 закрытие прошло при фазе P1 со статусом `[ ]` в Phases Overview и неотмеченным скелетом `- [ ] <ts> DONE`. Ловится это позже и косвенно — `SDD_DONE_PHASE_UNCHECKED` (`check.ts:581`) — и только если строку Overview никто не поправил руками.
2. Находки групповых receipt — **`severity: 'warn'`** (`group-receipt.ts:297`), то есть exit-код не портят.
3. Группа вообще не оценивается, если хотя бы один член без маркера: `if (!group.members.every((m) => memberIsReceiptAware(m.content))) continue;` (`group-receipt.ts:299`). В RC-дереве маркер `<!--PHASE_RECEIPTS:v1-->` не несёт **ни один** тикет (только две спеки и `ai/flow-eval/docs/flow-verification-ledger.md`) — значит проверка сейчас выключена на всём корпусе.
4. `AX_AUDIT_HOOK` обещает: «Until the group's audit returns PASS, TICKETS OF OTHER SPECS that depend on this spec stay blocked». Механически это не так: `pickableTasks` (`check.ts:1349-1364`) смотрит только Meta `Status` и `Dependencies`; ни `checkGroupReceipts`, ни `groupReceiptIssue` из `cli/cmd/sdd-task/sdd-task.cmd.ts:109` не вызываются. Кросс-спековая блокировка — проза.

**Вердикт: ЧАСТИЧНО.** Как модель — законная замена (аудит группы вместо аудита тикета, receipt вместо галочки). Как замок — слабее v1: v1 не мог написать `DONE` без PASS вообще, v2 пишет `DONE` первым и предупреждает об отсутствии аудита на уровне warn, выключенного грандфазерингом.

### C11 — канонический словарь токенов живёт в одном месте

**v1.** Таблица только в `scaffold.directive.xml:711-721` (`ROUND_CLOSE_FORMAT`), `tasks/README.md` её зеркалит; `sync <scope>+root` — не токен. Тесты «accepts a log using only canonical tokens» / «flags a token outside the vocabulary».

**v2. Трёхсторонний дрейф плюс висячий указатель.**

| источник | что говорит |
|---|---|
| `shared/sdd/templates.ts:1581` (генератор `specs/3-tasks.md`) | `intro · decision · tried · discovery · insight · verified · CLI-owned SDD_PHASE_RECEIPT · BLOCKED · DONE` |
| `ai/directives/sdd-v2/formats/project-tasks-index.xml:19` | то же самое |
| `specs/3-tasks.md:12` (фактический файл в репозитории RC) | `… verified · **`ver <cmd> → pass|fail exit=<N>`** · BLOCKED · DONE` — `ver` есть, `SDD_PHASE_RECEIPT` нет |
| `ai/kit/axiom/audit/ax-execution-log-verification.xml` | «Token vocabulary in **`scaffold.directive.xml` Execution Log Template**» + «Required per phase block: **`ver`** (one final result), `DONE`, `**Handoff →**`, `intro …`, **`verified` for `config`-kind**, `BLOCKED …`» |
| `ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml:131` | `EXECUTION_LOG_INCOMPLETE` ⇐ «mandatory closing lines missing (**`ver`** / `DONE` per phase, `DONE` at Round close)» |
| `ai/directives/sdd-v2/audit.directive.xml:150-159` (`AX_USAGE_WAIVER_DISCIPLINE`) | требует строку **`<ts> yagni <name> ← <reason>`** — токена `yagni` нет ни в одном словаре |

Плюс указатель «где искать словарь» противоречит сам себе: `formats/task-ticket-structure.xml:141` и `scaffold.directive.xml:286` — «Token vocabulary lives in `<module>.3-tasks.md`»; `formats/module-tasks-index.xml:31` — «Project-wide conventions (Execution-Log token vocabulary …) are declared once in `specs/3-tasks.md` and inherited here — **not repeated**». То есть тикет отправляет читателя в модульный индекс, который прямо говорит, что словаря не несёт. И `ax-execution-log-verification.xml` отправляет в `scaffold.directive.xml`, где в v2 таблицы нет вовсе.

**Вердикт: НЕ ЗАКРЫТО.** Это же и корень #23: у `correction` нет места, куда его добавить, потому что канонического места нет. Живое следствие — Ф3: 47 % строк вне словаря, включая самый частый токен `ver`, который аудит-аксиома **требует**, а таблица токенов **удалила**.

### C12 — фаза обязана прогнать verify перед Handoff; `ver` == исполненная команда

**v1.** `<sdd-path> verify --wip <target-files>` до `EMIT_HANDOFF`, одна строка `ver` на вызов, per-gate «pass» запрещены, строка команды обязана совпасть с исполненной (иначе `fabricated-verification`). `phase-execution-protocol.xml:90,322,332`.

**v2. Заменено и усилено: доказательство теперь пишет CLI, а не агент.**
- `AX_VERIFICATION_BEFORE_HANDOFF` (`execute.directive.xml:55-58`): «The CLI, not the phase agent, structurally selects and runs the ladder plus every applicable ticket §5 command verbatim, then atomically writes their exact command/role/exit evidence and Target File state as the phase receipt».
- `sdd-log complete` отказывает без receipt: `if (!receipts.receipts.some(r => r.phase === phaseId)) return { ok:false, detail: 'phase P… has no CLI-owned SDD_PHASE_RECEIPT' }` (`sdd-log.types.ts:284-287`) — воспроизведено, exit 2 (Ф4).
- Receipt несёт хеши плана, окружения и целевых файлов: `phaseReceiptPlanState` (`phase-receipt.ts:91`), `phaseVerificationEnvironmentState` (`:1203`), `phaseReceiptTargetState` (`:1257`), `phaseReceiptTargetEvidence` (`:1294`); только `exit === 0` считается `PROVEN` (`:23`).
- Читатель — `cli/cmd/sdd-check/phase-receipt-check.ts`: `SDD_PHASE_RECEIPT_MISSING` / `_INVALID` / `_INCOMPLETE` / `_STALE_PLAN` / `_STALE_TARGETS`.
Тесты: `shared/sdd/__tests__/phase-receipt.test.ts`, `cli/cmd/sdd-check/__tests__/phase-receipt-check.test.ts` (323 стр.), `sdd-log.cmd.test.ts:382-490` («complete mode — one verified phase-state transition», 6 it, включая «fails without this phase receipt and leaves every byte untouched» и «rejects a receipt owned by another phase»).

**Вердикт: ЗАКРЫТО** — с тремя оговорками, каждая из которых сама по себе задача:
1. **Грандфазеринг.** `phase-receipt-check.ts:62`: `if (!schemaAware && !receipts.has(phase.id)) continue;` — тикет без `<!--PHASE_RECEIPTS:v1-->` проходит с отмеченными фазами и нулём receipt. В RC-дереве это **все** тикеты (Ф2).
2. **Обход `complete`.** `line "DONE"` + `handoff "<payload>"` даёт визуально закрытую фазу без receipt (Ф4). Ничто не проверяет, что `- [x] … DONE` и `**Handoff →**` внутри блока фазы написаны именно `complete`.
3. **Строки `ver` остались свободным текстом.** В DA-lazy-asm их 47, и одна из них — `ver … → pass exit=1` (стр. 647), исправленная затем самодельным `correction:` (стр. 648). `complete` их не читает, `sdd-check` не читает, аудит-аксиома требует их наличия. Ложь в `ver` больше не несущая, но и не диагностируемая.

### C13 — `sdd lint` резолвит gennady в рантайме, без литералов путей

**Вердикт: НЕПРИМЕНИМО.** В v2 нет shell-скриптов скилла (`ai/skills/sdd-execute/scripts/*` отсутствует как класс), нет `$GENNADY_HOME`, нет нормализатора путей для скиллов. Есть одна npm-CLI, вызываемая как `npx gennady <cmd>`; `sdd lint` стал `gennady lint` (`package.json` scripts `lint:contracts`). Потребность «команда не должна ломаться после sync-нормализации» исчезла вместе с механикой нормализации.

### C14 — инструменты зовутся через рантайм-плейсхолдер `<sdd-path>`

**Вердикт: НЕПРИМЕНИМО.** `grep -rn 'sdd-path\|~/.claude/skills' ai/directives/sdd-v2/` → **ноль**. Каждый `<ToolCall>` в v2-директивах — литеральный `npx gennady …` (напр. `execute.directive.xml:251,285,312,315`). Плейсхолдер был обходным путём вокруг двух деревьев установки скиллов; в v2 дерева одно.

### C15 — batch — серийный планировщик зависимостей, без своей машины состояний

**v1.** Отдельный скилл `sdd-execute-batch`, один общий worktree, диспатч канонического `sdd-execute` на задачу, повтор только при доказуемом прогрессе, иначе BLOCKED/PAUSED с доказательством.

**v2.** Отдельного batch-артефакта нет — режим свёрнут в `execute.directive.xml`: «Task-ID resolves only that ticket. `all`/`batch`/`queue` uses every pickable ticket in DAG …» (`:181`), «Operator review happens once, after the whole batch and its audits» (`:157`), закрытие очереди — `STEP` на `:325-339`. Одна лестница остановок вместо BLOCKED/PAUSED: `AX_HALT_VS_FAIL_DISTINCTION` (`:88-99`) с классами `RECOVERABLE_TECHNICAL` / `SPEC_GOAL_CONFLICT` / `EXTERNAL_AUTHORITY_REQUIRED` / `TECHNICAL_REPLAN_EXHAUSTED`, плюс `H_PHASE_BLOCKED` (`:166`).
**Дыра:** `TECHNICAL_REPLAN_EXHAUSTED` определён как «**CLI-owned retry budget** consumed», а такого бюджета в CLI нет: `grep -rln 'retry\|Retry' cli/cmd/ shared/sdd/` не даёт ни одного счётчика попыток фазы (совпадения — `sdd-new`, `update-check-worker`, `vcs-job`, `yagni`). Условие остановки не измеримо, значит «повтор только при доказуемом прогрессе» ничем не обеспечено.

**Вердикт: ЧАСТИЧНО.**

---

### D3 — критик: раунды, изоляция, журнал `## Critic Rounds`

**v1.** Критик пишет в тикет `## Critic Rounds` / `### Round N — date`, свёрнутый на CLEAN (`critic.directive.xml:167-169`) — источник коллизии #15.

**v2.** Критик **не пишет ничего**: `critic.directive.xml:57-62` STEP_3_REPORT — «Return literal `CLEAN` or findings … **Never edit, never persist a round journal**, never ask to continue the same reviewer, and never declare operator approval». `## Critic Rounds` упоминается только как то, что остаётся в v1-формате при миграции (`infra.directive.xml:51`, `interface.directive.xml:48`). Пространство имён аудита отдельное: `### Audit Round N` (`formats/audit-round.xml`), нумерация независима от исполнительных раундов («`N` increments monotonically … independent of Execution Round numbers»).

**Вердикт: ЗАКРЫТО** в части коллизии с журналом (обе половины #15: namespace — устранён исчезновением писателя, регион — маркерами C7). Единственный остаток — `nextRoundNumber` (C7/Ф5) на мигрированном тикете.

### D4 — вердикт аудита считается таблицей; project-scope находки капаются MINOR

**v2.** Таксономия и маршрутизация есть и она полнее v1: `AX_FINDING_ROUTING` (`audit.directive.xml:169-199`) — 16 типов находок → владелец ремедиации; `RULE_FILE_INCOMPLETE` маршрутизируется в «ticket update … OR a separate rule-maintenance task», то есть не в FAIL этого тикета (принцип v1 сохранён). Формат вердикта — `AUDIT_SESSION_SUMMARY_FORMAT` (`audit/steps/STEP_3_ROUTE.xml:102-135`) со `status=<PASS|PASS_RISK|FAIL>` и `counts=B<n>·M<n>·m<n>·I<n>`.
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

**v2.** Принцип объявлен (`ai/kit/axiom/boundary/ax-ssot-traceability.xml`, `ax-reference-over-copy.xml`) и структурно поддержан `SDD_BROKEN_SPEC_REF` / `SDD_BROKEN_SPEC_ANCHOR` (11 + 6 срабатываний на самом RC-дереве). Но на своём главном объекте в этом треке — словаре токенов Execution Log — он нарушен четырежды (C11): три расходящихся копии и два взаимно противоречащих указателя.

**Вердикт: ЧАСТИЧНО** (механика ссылок есть; конкретно словарь лога живёт копиями).

### D7 — фазовый агент: запрещённый bash, границы ошибки, типизированный Handoff

**v2.** `ai/kit/axiom/process/ax-permitted-bash-commands.xml` сохранён; `HANDOFF_FORMAT` переехал в `phase-execution-protocol/steps/STEP_4_HANDOFF.xml` и получил **четвёртое** поле `deviations`, которое `sdd-log complete` проверяет регэкспом `^artifacts:\s*\[(.+)\];\s*decisions:\s*\[(.*)\];\s*open:\s*\[(.*)\];\s*deviations:\s*\[(.*)\]$` (`sdd-log.types.ts:246-247`) и отвергает `[...]` (`:263-265`). Это строго сильнее v1: форма Handoff теперь машинно обязательна.
**Расхождение:** скелет в `formats/task-ticket-structure.xml:147` и в `templates.ts:1362` — трёхполевой `**Handoff →** artifacts: [...]; decisions: [...]; open: [...]`, без `deviations`. `complete` терпит оба (`COMPLETE_HANDOFF_SKELETONS`, `sdd-log.types.ts:253-256`), но **пишет** всегда четырёхполевой. Тикет, заскаффолженный по формату, несёт скелет одной формы, а закрытую строку — другой.
Провенанс (`measured|reported|assumed`) в v2 так и не появился — это #22, вердикт A4 подтверждаю.

**Вердикт: ЧАСТИЧНО.**

### D8 — Task-ID из счётчика README; `AX_REOPEN_TICKET_FORMAT`; Round close ≠ DONE

**v2.** Три части, три разных исхода:
- **ID.** Счётчика в README нет; уникальность считается по дереву — `collectTaskIds` (`task-id.ts:79+`) плюс `checkIdConflicts` / `findPrefixClashes`, отказ на входе в `sdd-new --id`. **ЗАКРЫТО**, механизм лучше (счётчик в README был единой точкой отказа).
- **Формат реопена.** `ax-reopen-format.xml` — прямой перенос из v1 `fix.directive.xml`, и он **несовместим с v2-структурой тикета**: предписанная им таблица — `| Phase | Kind | Status | Target Files | Deps |` (5 колонок, ID во второй позиции по смыслу), тогда как `PHASES_OVERVIEW` в v2 — `| ID | Kind | Deps | Status |` (`formats/task-ticket-structure.xml:49`), и `parsePhasesOverview` читает позиционно `[id, kind, deps, status]` (`shared/sdd/ticket.ts:202`) с единственным щитом от заголовка `cells[0]?.toLowerCase() === 'id'` (`:201`). Следствия:
  1. Заголовок `| Phase | …` парсится **как фаза** с id `Phase`; воспроизведено на фикстуре `B2fix/forge` — `SDD_PHASE_DEP_UNRESOLVED  Phase Phase depends on unknown phase Kind`, `SDD_PHASE_SECTION_MISSING  Phase Phase …`, `SDD_EXECUTION_LOG_PHASE_MISSING  … #### Phase …`.
  2. `completePhase` требует **ровно одну** строку Overview для фазы и статус ровно `[ ]` (`sdd-log.types.ts:295-311`, `overviewCells[4]`). `ax-reopen-format.xml` велит «Allocate concrete next-unused PhaseIDs in the ticket», но не велит добавить строку в Phases Overview — реопен, написанный точно по аксиоме, **не закрывается** через `sdd-log complete`.
  3. В RC-дереве 5 v1-тикетов несут эту таблицу внутри Execution Log (`tasks/cli/lint/cli-lint.task-14.md:93,131`, `…/alt-opinion/cli-alt-opinion.task-23.md`, `…/sync-skills/cli-sync-skills.task-58.md`, `tasks/dbc/dbc-linter/dbc-linter.task-0{8,9}.md`) — то есть форма живая.
  Плюс сам DA-lazy-asm реопены сделал **не** по аксиоме: не новым `### Round`, а блоками `#### P<N> — re-run: …` внутри уже закрытого Round 2 — форма, которую поддерживает CLI (`sdd-log phase <P> "— re-run: <reason>"`, `sdd-log.types.ts:231`) и которой в аксиоме нет. **Два определения реопена** — рецидив #13 в новой одежде.
- **Round close ≠ DONE.** Инвертировано: `close` пишет `[x] DONE` (`sdd-log.cmd.ts:485`). См. C10.

**Вердикт: ЧАСТИЧНО** (ID — закрыто; формат реопена — НЕ ЗАКРЫТО и внутренне противоречив; «close ≠ DONE» — сознательно отменено).

---

### Сводка

| # | Инвариант v1 | Вердикт v2 | Ключевая ссылка |
|---|---|---|---|
| C1 | грамматика/однозначность Task-ID | ЗАКРЫТО | `task-id.ts:16,19,166`; `check.ts:1385,1401` |
| C2 | нет `findings=0` без проверенного объекта | **ЧАСТИЧНО** | `sdd-check.cmd.ts:1275-1295`; Ф1 |
| C3 | orphan `@tasks` по 14 расширениям | **НЕ ЗАКРЫТО** | нет кода; `sdd-check.cmd.ts:699-701`, `:504` |
| C4 | таксономия `[LOG]` | **ЧАСТИЧНО** | `check.ts:485,493,498,509,551-575` |
| C5 | `unclosed-round` | **НЕ ЗАКРЫТО** | нет проверки `IN_PROGRESS` |
| C6 | целостность после закрытия | **НЕ ЗАКРЫТО** | `sdd-log.cmd.ts:405,504`; `sdd-log.types.ts:314-330`; Ф2, Ф4 |
| C7 | регион лога / критик вне лога | **ЧАСТИЧНО** | `section.ts:141,192` vs `sdd-log.types.ts:76-79`; Ф5 |
| C8 | причинный `Reopens` | **НЕ ЗАКРЫТО** | `formats/audit-round.xml`; ноль в `check.ts` |
| C9 | четыре секции в файле правил | **НЕ ЗАКРЫТО** (заменено каскадом) | `rules-cascade.ts`; `audit.directive.xml:184` |
| C10 | `[x] DONE` = аудировано | **ЧАСТИЧНО** (перевёрнуто) | `ax-audit-hook.xml`; `group-receipt.ts:297,299`; `check.ts:1349` |
| C11 | один дом словаря токенов | **НЕ ЗАКРЫТО** | `templates.ts:1581` vs `specs/3-tasks.md:12` vs `ax-execution-log-verification.xml`; Ф3 |
| C12 | verify перед Handoff, `ver` == исполненное | **ЗАКРЫТО** (сильнее) | `sdd-log.types.ts:284-287`; `phase-receipt.ts`; оговорки: `phase-receipt-check.ts:62`, Ф4 |
| C13 | рантайм-резолв gennady в скрипте | НЕПРИМЕНИМО | одна npm-CLI |
| C14 | `<sdd-path>` | НЕПРИМЕНИМО | `npx gennady` литералом |
| C15 | batch — серийный планировщик | **ЧАСТИЧНО** | `execute.directive.xml:181,88-99`; retry-бюджета нет |
| D3 | критик и его журнал | ЗАКРЫТО | `critic.directive.xml:57-62` |
| D4 | таблица вердикта аудита | ЗАКРЫТО | `audit.directive.xml:169-199` |
| D5 | механика из `sdd check`, post-close, нумерация | **ЧАСТИЧНО** | `STEP_1_MECHANICAL.xml:95-110`; `STEP_2_SEMANTIC.xml:131` |
| D6 | SSOT по ссылке | **ЧАСТИЧНО** | нарушено на словаре лога (C11) |
| D7 | протокол фазы и Handoff | **ЧАСТИЧНО** | `sdd-log.types.ts:246-256` vs `task-ticket-structure.xml:147` |
| D8 | ID из счётчика, формат реопена, close≠DONE | **ЧАСТИЧНО** | `ax-reopen-format.xml` vs `ticket.ts:201-202`, `sdd-log.types.ts:295-311` |

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

Полный список режимов (`MODES`, `sdd-log.cmd.ts:61-74`): `round · line · close · phase · handoff · blocker · resolved · complete · authoring-complete · audit-receipt · review-receipt`.

Сдвиг принципиальный и в целом в правильную сторону: **штампы времени, номера раундов, статусы и доказательства верификации больше не сочиняются агентом**. Прибавка, которой у v1 не было вовсе: файловая форма всех free-text полей — `--content-file .claude/tmp/<name>` / `--payload-file …json` (точный обычный не-symlink UTF-8 файл под `.claude/tmp/`, ≤32768 байт, удаляется только после успешной записи; проверено 9 тестами `sdd-log.cmd.test.ts:759-966`, включая «consumes only the inode that was read» и «refuses a same-path symlink replacement»). Это закрывает целый класс shell-инъекций, которого в v1 никто не рассматривал.

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

Коды (`shared/sdd/check.ts`, `cli/cmd/sdd-check/phase-receipt-check.ts`, `shared/sdd/group-receipt.ts`):

**Ошибки:** `SDD_MISSING_EXECUTION_LOG` · `SDD_MISSING_META` · `SDD_ANCHOR_UNBALANCED` · `SDD_SECTION_OVERLAP` · `SDD_FABRICATED_DONE` · `SDD_DONE_WITH_ACTIVE_BLOCKER` · `SDD_EXECUTION_LOG_ROUND_MISSING` · `SDD_EXECUTION_LOG_PHASE_MISSING` · `SDD_EXECUTION_LOG_PHASE_DUPLICATE` · `SDD_EXECUTION_LOG_PHASE_ORPHAN` · `SDD_DONE_PHASE_UNCHECKED` · `SDD_PHASE_DEP_UNRESOLVED` · `SDD_PHASE_DAG_CYCLE` · `SDD_PHASE_SECTION_MISSING` · `SDD_PHASE_SECTION_ORPHAN` · `SDD_PHASE_RECEIPT_MISSING` · `SDD_PHASE_RECEIPT_INVALID` · `SDD_PHASE_RECEIPT_INCOMPLETE` · `SDD_PHASE_RECEIPT_STALE_PLAN` · `SDD_PHASE_RECEIPT_STALE_TARGETS` · `SDD_TASK_ID_COLLISION` · `SDD_TASK_ID_PREFIX_CLASH` · `SDD_TASK_ID_GRAMMAR` · `SDD_TASKS_APPEND_ONLY_REGRESSION`.

**Предупреждения:** `SDD_MISSING_TASK_ID` · `SDD_STATUS_UNPARSEABLE` · `SDD_BLOCKER_OPEN` · `SDD_DONE_WITH_PLACEHOLDERS` · `SDD_LEGACY_TICKET_UNANCHORED` · `SDD_GROUP_AUDIT_MISSING` · `SDD_GROUP_REVIEW_MISSING` · `SDD_CONSUMERS_UNRESOLVED`.

Три гейта, ограничивающих охват:
1. `content.includes('<!--PHASE_RECEIPTS:v1-->')` — включает `SDD_EXECUTION_LOG_*` (`check.ts:547`) и `SDD_PHASE_RECEIPT_MISSING` (`phase-receipt-check.ts:62`);
2. `group.members.every(memberIsReceiptAware)` — включает групповые receipt (`group-receipt.ts:299`);
3. `isV2SpecsTicket` — включает `SDD_TASK_ID_GRAMMAR` (`sdd-check.cmd.ts:962,1194,1374`).
В RC-дереве маркер не несёт ни один тикет, так что (1) и (2) сейчас выключены полностью (Ф2).

Плюс `firstRoundPhaseBlockCounts` смотрит **только Round 1** (`check.ts:219-241`): третий раунд с лишним, дублирующим или чужим блоком фазы не диагностируется.

### 2.4 Receipts

**Фазовый (`SDD_PHASE_RECEIPT`).** `PhaseReceiptPlan` фиксирует канонический путь тикета, id фазы, профиль верификации и причину его выбора, точные Target Files в порядке тикета, tombstones удаляемых путей, применимые команды §Verification, владельца coverage-producer и его отпечаток (`phase-receipt.ts:28-49`). Сам `PhaseReceipt` добавляет `planState`, `targetState`, per-path `targetEvidence`, список фактически исполненных команд и диспозицию гейтов, где `PROVEN` даётся только при `exit === 0` (`:52-70`). Читатель различает четыре класса порчи и подсказывает точную команду перезапуска (`phase-receipt-check.ts:18-33`). Это то, чего в v1 не было ни в каком виде: v1 доверял строке `ver`, написанной агентом.

**Групповой (`SDD_AUDIT_RECEIPT` / `SDD_REVIEW_RECEIPT`).** Долговечный **факт** «группа аудирована/отревьюена, вердикт V, на ref R» на владеющей спеке; находки остаются эфемерными (`AX_EPHEMERAL_OUTPUT`). Подпись — SHA-256 по отсортированным `[basename, roundCount, done]` членов (`group-receipt.ts:104-124`), поэтому новый раунд у любого члена делает receipt stale автоматически; писатель отказывается, пока не все члены `[x] DONE`; запись — через атомарный проверенный примитив, «so a pasted block cannot forge it» (`execute.directive.xml:69-71`). Идея хорошая, но исполнение ослаблено warn-серьёзностью и грандфазерингом (C10).

### 2.5 Reopens и нумерация раундов

- `nextRoundNumber` = `(число ^### Round \d+ во всём файле) + 1` (`sdd-log.types.ts:76-79`) — не сужено до секции (Ф5).
- Причина раунда — свободная строка; закрытого словаря (`initial | fix: F-NNN | resume | new-audit-session`) нет ни в грамматике, ни в проверке.
- `Reopens` в Meta и колонка `Reopens` в трекерах обновляются вручную по `ax-reopen-format.xml` / `reconcile.directive.xml:113,194,250`. Механического сопоставления Meta ↔ `@audit … triggered-reopen=Round-N` нет (C8).
- Аудит-раунды нумеруются независимо и пишутся в `## Audit Rounds` **без** якоря `<!--SECTION:AUDIT_ROUNDS-->` (`formats/task-ticket-structure.xml:158` — только комментарий «AUDIT_ROUNDS appended only after the first reopen-triggering audit»). При этом `ax-task-id-integrity.xml` перечисляет `AUDIT_ROUNDS` среди «Optional names», проверяемых через `npx gennady sdd-extract <ticket> <NAME>` — а этот вызов на неякорной секции всегда вернёт exit 2. Достать её можно только heading-формой `sdd-extract <file>#audit-rounds` (`cli/cmd/sdd-extract/help.ts:13,22`), о которой аксиома не знает.
- Две несовместимые формы реопена (новый `### Round` по `ax-reopen-format.xml` vs `#### P<N> — re-run:` внутри текущего раунда, поддержанное CLI и применённое в DA-lazy-asm) — см. D8.

### 2.6 Task-ID: грамматика и legacy

- Грамматика `^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$`, слаг ≤ 8 символов (`task-id.ts:16,19`). Заметьте: v1-й `TSK-64` **проходит** эту грамматику (слаг `64` — из `[a-z0-9]`), а путевой `TSK-IB-001` — **нет** (заглавные в слаге). Поэтому legacy-числовые ID сосуществуют легально, а путевые требуют миграции.
- Уникальность и «грепо-чистота» — `collectTaskIds`, `checkIdConflicts`, `findPrefixClashes`, `describeIdConflict`, `suggestTaskId` (никогда не подставляется автоматически — «refuse + point at the fix», `task-id.ts:190`).
- Legacy-тикет (plain-заголовки, без маркеров) получает один совет вместо разбора: `SDD_LEGACY_TICKET_UNANCHORED` warn (`check.ts:1324-1336`) — 76 срабатываний на RC-дереве. `checkTicket` для него не запускается вовсе.
- Миграция якорей — `injectAnchors` (`shared/sdd/anchor-inject.ts:73`), сопоставление заголовков — `canonicalName` (`:12-28`). Две границы применимости, обе воспроизведены на реальных файлах RC:
  - `PHASES_OVERVIEW` распознаётся только на уровне `##` (`:21`); старые v1-тикеты (`tasks/dbc/dbc-linter/dbc-linter.task-08.md` — заголовки `## 1. Meta & Traceability … ## 5. Execution Log`) её вообще не имеют. Прогон `injectAnchors` дал `injected: META, BDD, VERIFICATION, TEST_COVERAGE, EXECUTION_LOG` — без `PHASES_OVERVIEW`. Последствие: у мигрированного тикета `overviewSec.status !== 'ok'`, и **весь** блок фазовых/receipt/exec-log проверок (`check.ts:511-585`, `checkPhaseReceipts` возвращает `[]` на `:53`) молча пропускается, а `sdd-log complete` и `sdd-task --phase` на нём невозможны («ticket has no readable PHASES_OVERVIEW»).
  - `PHASE_P<N>` требует текста, начинающегося ровно с `P<цифры>` (`:15`); v1 писал `### Phase P1 — implementation` (`tasks/cli/lint/cli-lint.task-14.md:67`) — не сматчится. Более новые v1-тикеты писали `### P1 — impl` и мигрируются нормально (50 тикетов под `tasks/` уже якорные, у всех есть `SECTION:PHASES_OVERVIEW` и `SECTION:PHASE_P*`).

### 2.7 Что v1 ловил, а v2 не ловит — сводно

| потеря | доказательство в v2 | цена |
|---|---|---|
| запись после закрытия раунда (`entry-after-close`, `extra-close-entry`, `bad-round-close`) | Ф2 (35 строк, 4 DONE, 3 Handoff после `Round close` в живом тикете), Ф4 | журнал перестаёт быть хронологическим доказательством; аудит цитирует строки, которых на момент закрытия не существовало |
| токен вне словаря (`unknown-token`) и вышедший из употребления (`retired-token`) | Ф3 (47 % строк), Ф4 | словарь перестал быть закрытым; `ver` — самый частый токен — удалён из таблицы, но требуется аудит-аксиомой |
| причинный `Reopens` | ноль упоминаний в `shared/sdd/**`, `cli/cmd/sdd-log/**` | «сколько раз задачу переоткрывали и почему» перестало быть проверяемым; данные для проверки в тикете уже лежат |
| `NO_TICKETS_FOUND` | Ф1 | пустой или неверно разложенный scope читается как «✅ clean» |
| orphan `@tasks` вне TS-семейства | нет кода; `sdd-check.cmd.ts:699-701`, `:504` | на не-JS-проекте трассируемость код↔тикет структурно не проверяется |
| `unclosed-round` | нет проверки `IN_PROGRESS` | брошенный раунд не отличим от идущего |
| `[x] DONE` ⇒ аудировано | `sdd-log.cmd.ts:485`; `group-receipt.ts:297,299`; `check.ts:1349` | зависимая задача другой спеки может стартовать на неаудированном результате; обещание `AX_AUDIT_HOOK` не подкреплено |
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
| `shared/sdd/group-receipt.ts` (`memberRoundCount`) | regex по телу секции | да |

Четыре реализации «найди текущий раунд» уже разошлись (Ф5), и все три отсутствующие проверки (пост-закрытие, словарь, причинный `Reopens`) требуют **одной и той же** структуры: раунды → фазовые блоки → блок закрытия → событийные строки с токеном и штампом. Поэтому — один парсер, три потребителя.

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
3. `#### Round close` завершает список фаз раунда; всё после него в том же раунде попадает в `Round.trailing` — **не** в последнюю фазу (это ровно то, что сейчас делает `completePhase`, `sdd-log.types.ts:314-330`);
4. заголовки внутри fenced-code игнорируются (уже обеспечено `collectHeadings`; тест `check-phases.test.ts:115` это фиксирует — сохранить);
5. `- 🛑` / `- ✅` — маркеры, а не токены (перенести семантику `scanBlockerTrail`, `check.ts:249-284`, включая пофазный FIFO-пул и общий пул для `— re-run:`);
6. пофазная атрибуция строк не зависит от порядка открытия блоков (сохранить поведение `findPhaseBlockBounds`, `sdd-log.types.ts:474`, и его 14 тестов `sdd-log.cmd.test.ts:550-707`).

### 3.3 Словарь токенов — один дом, включая `correction` (#23)

Дом — `TOKEN_VOCABULARY` в этом модуле; `templates.ts`, `formats/project-tasks-index.xml` и `ax-execution-log-verification.xml` его **цитируют**, не переопределяют (снимает C11/D6). Состав по факту (Ф3) плюс требуемое:

| токен | вид | кто пишет | комментарий |
|---|---|---|---|
| `intro` `decision` `tried` `discovery` `insight` | live | фаза | как сейчас |
| `verified` | live | фаза | «инструмент@версия + итог»; аудит требует его для `config`-фаз (`ax-execution-log-verification.xml`) |
| `ver` | live | фаза | **вернуть в таблицу**: 47 из 129 строк, требуется `STEP_2_SEMANTIC.xml:131`, удалён из `templates.ts:1581`. Либо вернуть, либо выпилить требование из аудита — молчаливое расхождение недопустимо |
| `yagni` | live | фаза | требуется `AX_USAGE_WAIVER_DISCIPLINE` (`audit.directive.xml:150-159`), в таблице отсутствует |
| `fix` | live | фаза | 3 живых применения; сейчас «unknown» |
| `env-fix` | live | оркестратор | 3 живых применения — починка окружения вне зоны записи фазы |
| **`correction`** | live | фаза/оркестратор | **новое, ответ на #23**: `correction <round>/<phase> <field>: <old> → <new> ← <reason>` |
| `BLOCKED` `DONE` | live | фаза / CLI | как сейчас |
| `SDD_PHASE_RECEIPT` | cli-owned | `sdd-verify` | агент не пишет никогда |
| `🛑` `✅` | marker | CLI | не токены |

`correction` — единственный легальный способ ошибиться один раз в append-only журнале. Проверки при записи (`sdd-log line`): первое слово в словаре, иначе `ERR_CLI_SDD_LOG_UNKNOWN_TOKEN` exit 2 с перечислением словаря и подсказкой `correction`; для `correction` дополнительно — `<round>/<phase>` существует в разобранном логе, иначе exit 2. Правило для аудита (`audit/steps/STEP_2_SEMANTIC.xml`): значение с более поздним `correction` считается разрешённым; устаревшая копия того же значения в другом артефакте — по-прежнему находка (`STALE_AFTER_PIVOT` / `EXECUTION_LOG_INCOMPLETE`).

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

### 3.5 Как это ложится на CLI-владение записями

`sdd-log` перестаёт хранить свои представления о логе и переходит на модуль:
- `nextRoundNumber` → реэкспорт из `execution-log.ts` (правит Ф5 в один импорт);
- `closeCurrentRound` → `parseExecutionLog(...).rounds.at(-1).close` вместо построчного поиска;
- `completePhase` → берёт `PhaseBlock` из парсера и **отказывается**, если блок лежит в `Round.trailing` (то есть после закрытия) — `ERR_CLI_SDD_LOG_COMPLETE_STATE: phase block was opened after the Round close; open a new Round`;
- `line` / `handoff` без `--phase` при уже закрытом раунде → **отказ** `ERR_CLI_SDD_LOG_ROUND_CLOSED` exit 2 с двумя выходами: `sdd-log … round "fix: F-NNN"` или `--phase P<N>` (если фаза открыта в новом раунде);
- `close` → отказ, если есть фаза со статусом `[ ]` в Phases Overview или отмеченный `DONE` без receipt: `ERR_CLI_SDD_LOG_CLOSE_STATE: phase P<N> is not completed`;
- `round "<reason>"` → причина из закрытого словаря `initial | fix: <F-NNN|finding-id> | resume | new-audit-session` (подсказка уже есть в JSDoc `sdd-log.types.ts:84`), иначе exit 4.

`sdd-task` берёт `parsePhaseHandoffs` и `scanBlockerTrail` из того же модуля (сейчас импортирует из `check.ts`, `sdd-task.cmd.ts:18`) — переезд без изменения поведения.

### 3.6 Тесты, которые это фиксируют

Новый `shared/sdd/__tests__/execution-log.test.ts`:
1. `## Critic Rounds` / `### Round 7` вне секции → `nextRoundNumber` = 2 (регресс Ф5);
2. запись после `#### Round close` → `Round.trailing.length === 1` и `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE`;
3. блок `#### P3 — re-run:` после закрытия → в `trailing`, не в `phases`;
4. `T09:00Z` vs `T09:00:00Z` — не «позже» (портировать кейс v1);
5. `- 🛑` внутри блока и `- ✅` в блоке `— re-run:` той же фазы → блокер закрыт (сохранение семантики `scanBlockerTrail`);
6. `correction Round 1/P2 exit: 1 → 0 ← перепроверено` — парсится, цель существует;
7. `correction Round 9/P1 …` → `SDD_CORRECTION_TARGET_UNRESOLVED`;
8. `totallyUnknownToken` → `SDD_EXECUTION_LOG_UNKNOWN_TOKEN`;
9. пристойный скелет Round 1 без отмеченных строк → **ни одной** находки (анти-ложное-срабатывание, аналог v1 «says nothing about a round that never ran»);
10. отмеченный `DONE` в блоке фазы без receipt на receipt-aware тикете → `SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE`.

В `cli/cmd/sdd-log/__tests__/sdd-log.cmd.test.ts`: `line`/`handoff` после `close` → exit 2; `close` при незакрытой фазе → exit 2; `round` с причиной вне словаря → exit 4; `line` с неизвестным токеном → exit 2; `line "correction …"` с валидной целью → exit 0.

В `shared/sdd/__tests__/check.test.ts`: пустое `specs/` → `SDD_NO_TICKETS_FOUND`, exit ≠ 0.

Новый `shared/sdd/__tests__/reopens.test.ts`: Meta `Reopens: 1` + два `triggered-reopen=Round-N` → `SDD_REOPENS_MISMATCH`; объявленный `Round-4` при трёх существующих → PENDING; `triggered-reopen=none` не считается.

**Регресс-фикстура (обязательно).** `DA-lazy-asm` как есть → ожидаемый набор находок фиксируется в golden-файле. Это единственная имеющаяся запись реального v2-прогона; если проверки её не подсвечивают, они бесполезны.

### 3.7 Eval-группа G3 (execution-log / conventions integrity, execute→audit→critic)

Сценарии, которые G3 должна прогонять на снапшоте:
- G3-1: полный `execute` одного тикета с двумя раундами → в логе нет ни одной строки вне словаря, `Reopens` совпадает с числом `triggered-reopen`, все фазы имеют receipt;
- G3-2: попытка дописать в закрытый раунд → отказ CLI, оркестратор открывает новый раунд;
- G3-3: значение из Round 1 оказалось неверным в Round 3 → `correction` записан, аудит считает старую строку разрешённой, а копию значения в спеке — находкой;
- G3-4: пустой scope (ноль тикетов) → `sdd-check --all` даёт `SDD_NO_TICKETS_FOUND`, а не «clean»;
- G3-5: мигрированный v1-тикет с `## Critic Rounds` → следующий раунд нумеруется от лога, не от файла;
- G3-6: фаза с отмеченным `DONE`, написанным `line`, а не `complete` → находка.

G4 (миграция на реальном снапшоте) добирает: тикет с заголовком `| Phase | Kind | Status | Target Files | Deps |` и тикет без `## Phases Overview` (см. 2.6) — оба должны либо мигрироваться корректно, либо явно отказать, но не проходить молча.

### 3.8 Оценка объёма

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
2. **Грандфазеринг превращается в постоянное состояние.** Маркер `<!--PHASE_RECEIPTS:v1-->` сейчас не несёт **ни один** тикет в RC, то есть receipt-проверки выключены на всём корпусе, а не на его хвосте. Нужен план проставления маркера (или инверсия: маркер `<!--PHASE_RECEIPTS:none-->` для явно освобождённых, всё остальное — под проверкой) и `sdd-check --all` счётчик «сколько тикетов под грандфазерингом» в сводке, чтобы это перестало быть невидимым.
3. **`ver` vs `SDD_PHASE_RECEIPT` — решение, а не рефакторинг.** Если `ver` возвращается в словарь, надо описать его отношение к receipt (человеческая заметка против машинного доказательства) и запретить закрывать фазу на одном `ver`. Если не возвращается — вычистить требование из `ax-execution-log-verification.xml` и `STEP_2_SEMANTIC.xml:131` и принять, что 47 существующих строк — legacy.
4. **Отказ `line` после закрытия может заблокировать честный сценарий.** `✅ RESOLVED`, приходящее после закрытия (в DA-lazy-asm их 7), содержательно легитимно. Нужно решить: `resolved` — исключение из запрета, или снятие блокера обязано открывать раунд.
5. **Двойное чтение раунда во время перехода.** Пока `nextRoundNumber` не переехал, `sdd-log` и `group-receipt.ts` считают раунды по-разному, и подпись группового receipt может разойтись с номером нового раунда. Переносить обе функции в одном изменении.
6. **`--strict` в CI на собственном дереве.** У RC уже 198 ошибок `sdd-check --all` на себе. Добавление кодов без разбора текущего долга сделает гейт неиспользуемым; порядок должен быть «сначала коды в warn + инвентарь долга, потом error».

---

## 4. Задачи и решения оператора

### 4.1 Задачи

Порядок — по зависимостям: B2-01 несёт парсер, на который опираются 02–05.

| id | цель | файлы | тесты | размер |
|---|---|---|---|---|
| **B2-01** | Один парсер Execution Log: `parseExecutionLog` + типы `Round`/`PhaseBlock`/`LogEvent`/`RoundClose`; перенести в него `scanBlockerTrail`, `parsePhaseHandoffs`, `firstRoundPhaseBlockCounts`; `check.ts`, `sdd-log`, `sdd-task`, `group-receipt.ts` переводятся на него | новый `shared/sdd/execution-log.ts`; `shared/sdd/check.ts:207-320,511-585`; `cli/cmd/sdd-log/sdd-log.types.ts:76,124,276,474`; `shared/sdd/group-receipt.ts:63`; `cli/cmd/sdd-task/sdd-task.cmd.ts:18` | новый `shared/sdd/__tests__/execution-log.test.ts` (кейсы 1–5, 9 из §3.6); существующие `check.test.ts:299-416`, `check-phases.test.ts`, `sdd-log.cmd.test.ts:550-707` должны остаться зелёными без правок | **L** |
| **B2-02** | `nextRoundNumber` сужен до секции `EXECUTION_LOG`; шаг миграции переименовывает legacy `### Round N` внутри `## Critic Rounds` в `### Critic Round N` | `cli/cmd/sdd-log/sdd-log.types.ts:76-79`; `shared/sdd/migration-move.ts`; `ai/directives/sdd-v2/migration-v1-v2.directive.xml` | `execution-log.test.ts` кейс 1; `sdd-log.cmd.test.ts` — тикет с `## Critic Rounds` + `### Round 3` вне лога → следующий execution-round = 2 | **S** |
| **B2-03** | Словарь токенов: `TOKEN_VOCABULARY` в `execution-log.ts` как единственный дом; `correction` добавлен; `ver`/`yagni`/`fix`/`env-fix` приведены к решению оператора (D1); все документы цитируют, не переопределяют | `shared/sdd/execution-log.ts`; `shared/sdd/templates.ts:1581`; `ai/directives/sdd-v2/formats/project-tasks-index.xml:19`; `formats/task-ticket-structure.xml:141`; `formats/module-tasks-index.xml:31`; `scaffold.directive.xml:286`; `ai/kit/axiom/audit/ax-execution-log-verification.xml`; `ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml:131`; `ai/kit/templates/sdd-v2/*.hbs` — источники всех перечисленных `.xml` | `execution-log.test.ts` кейсы 6–8; `templates.test.ts` — сгенерированный `specs/3-tasks.md` содержит ровно словарь из модуля | **M** |
| **B2-04** | Детекция записи после закрытия: `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE`, `_CLOSE_EXTRA_ENTRY`, `_ENTRY_LATER_THAN_CLOSE`, `_ROUND_UNCLOSED`; `sdd-log line/handoff/phase/complete` отказывают на закрытом раунде | `shared/sdd/check.ts`; `cli/cmd/sdd-log/sdd-log.cmd.ts:405,433-469,504`; `cli/cmd/sdd-log/sdd-log.types.ts:314-330` | `execution-log.test.ts` кейсы 2–4; `sdd-log.cmd.test.ts` — `line` после `close` → exit 2, `complete` в блок из `trailing` → exit 2; golden-фикстура `DA-lazy-asm` | **M** |
| **B2-05** | `SDD_NO_TICKETS_FOUND` (error, exit 2) для `--all`/`--changed`; `sdd-check --all` печатает счётчик тикетов под грандфазерингом | `cli/cmd/sdd-check/sdd-check.cmd.ts:1275-1295`; `cli/cmd/sdd-check/help.ts` (коды выхода); `cli/cmd/sdd-check/sdd-check.types.ts` (сводка) | `shared/sdd/__tests__/check.test.ts` — пустое `specs/` → exit ≠ 0; `sdd-check.cmd.test.ts` — фикстура без тикетов | **S** |
| **B2-06** | Причинный `Reopens`: `parseAuditRounds` + `checkReopens` → `SDD_REOPENS_MISMATCH` / `_PENDING`; `sdd-log round` принимает причину только из закрытого словаря | `shared/sdd/execution-log.ts`; `shared/sdd/check.ts`; `cli/cmd/sdd-log/sdd-log.cmd.ts:433-435`; `ai/kit/axiom/process/ax-reopen-format.xml` | новый `shared/sdd/__tests__/reopens.test.ts` (3 кейса из §3.6); `sdd-log.cmd.test.ts` — причина вне словаря → exit 4 | **M** |
| **B2-07** | Закрыть обход `complete`: `SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE`; `sdd-log close` отказывает при фазе со статусом `[ ]` или отмеченным `DONE` без receipt | `shared/sdd/check.ts`; `cli/cmd/sdd-check/phase-receipt-check.ts`; `cli/cmd/sdd-log/sdd-log.types.ts:124-179` | `execution-log.test.ts` кейс 10; `phase-receipt-check.test.ts`; `sdd-log.cmd.test.ts` — `close` при незакрытой фазе → exit 2 | **S** |
| **B2-08** | Привести `ax-reopen-format.xml` к структуре v2: 4-колоночная `| ID | Kind | Deps | Status |`, явное требование добавить строки в `PHASES_OVERVIEW`, и выбор между «новый `### Round`» и «`#### P<N> — re-run:`» (D2) | `ai/kit/axiom/process/ax-reopen-format.xml`; `ai/directives/sdd-v2/reconcile.directive.xml:113,194,250`; `ai/directives/sdd-v2/formats/task-ticket-structure.xml`; `.hbs`-источники | `sdd-log.cmd.test.ts` — реопен, записанный точно по аксиоме, закрывается `complete`; `check-phases.test.ts` — заголовок `| Phase | …` не читается как фаза | **M** |
| **B2-09** | Устойчивость `parsePhasesOverview` к v1-заголовкам: щит по множеству имён колонок (не только `id`), либо чтение по именам колонок вместо позиций; `completePhase` перестаёт индексировать `overviewCells[4]` жёстко | `shared/sdd/ticket.ts:196-218`; `cli/cmd/sdd-log/sdd-log.types.ts:295-311` | `ticket.test.ts` — `| Phase | Kind | Status | Target Files | Deps |` не даёт фазы `Phase`; фикстура из `tasks/cli/lint/cli-lint.task-14.md` | **S** |
| **B2-10** | Миграция якорей: распознать `### Phase P1 — …` и `Phases Overview` на уровне `###`; при отсутствии `PHASES_OVERVIEW` в мигрируемом тикете — явный отказ/предупреждение, а не тихий пропуск всех фазовых проверок | `shared/sdd/anchor-inject.ts:12-28`; `shared/sdd/migration-plan.ts` | `anchor-inject.test.ts` — фикстуры `tasks/cli/lint/cli-lint.task-14.md` и `tasks/dbc/dbc-linter/dbc-linter.task-08.md`; `check-legacy-ticket.test.ts` | **M** |
| **B2-11** | Синхронизировать каталог проверок в `STEP_1_MECHANICAL.xml` с фактическим `sdd-check` (добавить `PHASE_RECEIPT`, `BDD_NEGATIVE`, `BDD_TRACE`, `COVERAGE_POLICY`, `SDD_TASK_ID_GRAMMAR`, групповые receipt); поправить `ax-task-id-integrity.xml` в части `AUDIT_ROUNDS` (heading-форма `sdd-extract <file>#audit-rounds`) | `ai/directives/sdd-v2/audit/steps/STEP_1_MECHANICAL.xml:108-110`; `ai/kit/axiom/audit/ax-task-id-integrity.xml`; `.hbs`-источники | `ai/kit/check-directives-fresh.ts` (существующий гейт свежести); тест соответствия «коды в `help.ts` ⊆ коды, перечисленные в директиве» | **S** |
| **B2-12** | Единый расширяемый список исходных расширений (`shared/sdd/source-extensions.ts`) для `SDD_CONSUMERS_UNRESOLVED` и индекса тест-файлов; вернуть механический orphan-`@tasks` поверх него | новый `shared/sdd/source-extensions.ts`; `cli/cmd/sdd-check/sdd-check.cmd.ts:504,699-701` | `sdd-check.cmd.test.ts` — фикстура `Foo.swift` + `FooTests.swift`: consumer резолвится, `@tasks` без тикета → orphan | **M** |
| **B2-13** | Убрать необеспеченную прозу: либо ввести CLI-бюджет повторов фазы, либо переформулировать `TECHNICAL_REPLAN_EXHAUSTED`; либо учесть групповой receipt в `pickableTasks`, либо снять обещание кросс-спековой блокировки из `AX_AUDIT_HOOK` (D3, D4) | `ai/directives/sdd-v2/execute.directive.xml:88-99`; `ai/kit/axiom/process/ax-audit-hook.xml`; `shared/sdd/check.ts:1349-1364` | `check-pickable.test.ts` — если выбран вариант «учитывать»: зависимая задача другой спеки не pickable без валидного `SDD_AUDIT_RECEIPT` | **M** |
| **B2-14** | Согласовать скелет Handoff: трёхполевой скелет в шаблонах vs четырёхполевая запись `complete` | `ai/directives/sdd-v2/formats/task-ticket-structure.xml:147`; `shared/sdd/templates.ts:1362`; `cli/cmd/sdd-log/sdd-log.types.ts:253-256` | `templates.test.ts`; `sdd-log.cmd.test.ts:446` (существующий) | **S** |
| **B2-15** | Разгрести долг в собственном дереве RC: 3 `SDD_TASK_ID_COLLISION` (в т.ч. настоящий дубль `TSK-88`), `specs/3-tasks.md:12` отстал от `templates.ts:1581` | `tasks/vcs/vcs-mr-client/vcs-mr-client.task-88.md:7`; `tasks/dbc/dbc-linter/dbc-linter.task-88.md:7`; `tasks/cli/update-check/update-check.task-35.md`; `tasks/infra-npm-publish/infra-npm-publish.task-45.md`; `specs/3-tasks.md` | `sdd-check --all .` — ноль `SDD_TASK_ID_COLLISION` | **S** |

### 4.2 Решения, которые может принять только оператор

**D1. Судьба токена `ver` при живом `SDD_PHASE_RECEIPT`.** Сейчас `ver` — 47 из 129 строк живого тикета, требуется двумя документами аудита и отсутствует в таблице токенов.
1. **Вернуть `ver` в словарь** как человеческую заметку рядом с машинным receipt; закрывать фазу по-прежнему может только receipt. Плюс: ничего не переписывается, аудит остаётся консистентным. Минус: два представления одного факта, риск расхождения между `ver`-строкой и receipt.
2. **Оставить только receipt**, вычистить `ver` из `ax-execution-log-verification.xml` и `STEP_2_SEMANTIC.xml:131`, мигрировать 47 строк в legacy. Плюс: одно доказательство. Минус: теряется человекочитаемый след «что именно гонял воркер и что увидел».
3. **`ver` разрешён, но только как `correction`-подобная приписка к receipt** — обязательная ссылка на id receipt. Плюс: связь есть. Минус: самая дорогая по реализации и по дисциплине агента.

**D2. Одна форма реопена.** Сейчас две: `ax-reopen-format.xml` требует новый `### Round N` с фазовой таблицей; CLI поддерживает `#### P<N> — re-run: <reason>` внутри текущего раунда, и именно так реально сделан DA-lazy-asm.
1. **Только новый Round.** Плюс: `Reopens`, групповая подпись и нумерация становятся честными; append-only соблюдён буквально. Минус: раунд на однострочный фикс — тяжело; форма `— re-run:` уже поддержана CLI и покрыта тестами (`sdd-log.cmd.test.ts:543,626`), придётся выпиливать.
2. **Только `— re-run:` внутри раунда.** Плюс: дешёвая петля фикса, соответствует фактической практике. Минус: «раунд» перестаёт быть единицей попытки, `Reopens` и подпись группового receipt (`roundCount`) теряют смысл, C6/C8 нечем измерять.
3. **Две формы с явной границей:** `— re-run:` разрешён **только до** закрытия раунда, после закрытия — обязателен новый Round. Плюс: сохраняет и дешёвую петлю, и осмысленность раунда; ровно эта граница делает C6 проверяемым. Минус: агенту надо помнить состояние раунда — снимается отказом CLI (B2-04).

**D3. Что означает `[x] DONE` в v2.** `ax-audit-hook.xml` говорит «mechanical close, not verification», `AX_AUDIT_HOOK` при этом обещает блокировку зависимых задач других спек, а `pickableTasks` её не делает.
1. **Оставить как есть**, но снять обещание из аксиомы. Плюс: ноль работы. Минус: неаудированный результат легально распространяется по графу — ровно тот риск, ради которого C10 существовал.
2. **Учесть групповой receipt в `pickableTasks`**: задача другой спеки не pickable, пока владеющая спека зависимости не несёт валидный `SDD_AUDIT_RECEIPT`. Плюс: обещание становится правдой, дешевле полного возврата к C10. Минус: нужен план проставления `<!--PHASE_RECEIPTS:v1-->`, иначе гейт выключен грандфазерингом; риск взаимных блокировок на кросс-спековых циклах.
3. **Ввести третий статус** `[~] CLOSED_UNAUDITED` между `IN_PROGRESS` и `DONE`; `DONE` ставит только групповой receipt. Плюс: ближе всего к смыслу C10 и читается глазами. Минус: трогает Meta-грамматику, трекеры, `pickableTasks`, `setMetaStatus`, все шаблоны и весь существующий корпус.

**D4. Политика грандфазеринга.** Маркер `<!--PHASE_RECEIPTS:v1-->` не несёт ни один тикет в RC, то есть receipt- и exec-log-проверки выключены на всём корпусе, а не на его хвосте.
1. **Оставить opt-in маркер**, добавить в сводку `sdd-check` счётчик «N тикетов под грандфазерингом». Плюс: ничего не ломается, невидимость снимается. Минус: включение остаётся чьей-то будущей задачей.
2. **Инвертировать:** проверять всех, освобождать явным `<!--PHASE_RECEIPTS:none-->`. Плюс: новый тикет под проверкой по умолчанию, долг виден сразу. Минус: одноразовая правка каждого legacy-тикета либо волна находок.
3. **Датировать:** тикеты, созданные после даты X (или под v2-именем `*.task.<ID>.md`), проверяются всегда. Плюс: не требует правки старых файлов. Минус: ещё один неявный гейт версии рядом с `isV2SpecsTicket` и `detectScopeFlowVersion` — третий по счёту.

**D5. Строгость новых кодов и CI.** У RC уже 198 ошибок `sdd-check --all` на собственном дереве.
1. **Все новые коды сразу error.** Плюс: честный гейт с первого дня. Минус: `sdd-check --all .` в CI неиспользуем, пока долг не разобран.
2. **Warn сейчас, error после инвентаризации долга** (B2-15 + golden-фикстура `DA-lazy-asm`). Плюс: измеримый путь. Минус: окно, в котором проверка есть, но не блокирует.
3. **Error только на receipt-aware тикетах, warn на остальных** (как в §3.4). Плюс: новый тикет защищён немедленно, старый не шумит. Минус: связано с D4 — при варианте D4.1 error фактически не срабатывает ни на чём.

**D6. `✅ RESOLVED` после закрытия раунда.** В DA-lazy-asm семь таких строк, содержательно легитимных (блокер снят другой фазой позже).
1. **`resolved` — исключение из запрета записи после закрытия.** Плюс: сохраняет честный сценарий. Минус: одна легальная дыра в append-only, через которую можно протащить что угодно с маркером ✅.
2. **Снятие блокера обязано открывать раунд.** Плюс: append-only без исключений. Минус: раунд ради одной строки; часть блокеров снимается вообще вне тикета.
3. **Отдельный раздел `## Blocker Trail` вне раундов**, куда `sdd-log resolved` пишет с обратной ссылкой на раунд/фазу. Плюс: и хронология, и append-only целы. Минус: новая секция — правки шаблона, `sdd-extract`, `scanBlockerTrail` и миграции.


# Часть II — V-B2 (независимый верификатор)

# V-B2 — независимая перепроверка B2 (трек CHECK-LOG)

Проверяющий: свежие глаза, read-only, ни один отслеживаемый файл не изменён.
Проверяемый документ: `scratchpad/B2-check-log-track.md` (623 строки).

Источники, открытые заново самостоятельно (не по указателям B2):

- **MAIN (v1)** `origin/main` `8bb38477`: `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`
- **RC (v2)** `codex/sdd-v2-rc52-followup` `11291af5`: `…/scratchpad/rc-v6`
- Мои собственные фикстуры и прогоны: `…/scratchpad/Vb2/` (`empty/`, `bare/`, `mig/`, `forge/`, `legacy/`, `reopen/`, `t-*.txt`, `rc-all.txt`) — каталог `B2fix/` аналитика **не использовался и не читался**.
- Смежные отчёты: `V-A1.md` (C9-рефутация, регион лога), `V-A4.md` (#9.1, #13, #23).

---

## § Итог

**Вердикты B2: согласен с 21 из 21.** Ни один ярлык (ЗАКРЫТО / ЧАСТИЧНО / НЕ ЗАКРЫТО / НЕПРИМЕНИМО) я не смог опровергнуть. Предложение **выживает** — и на моих данных оно скорее недооценено, чем переоценено: §3 занижает масштаб C11 и C6-грандфазеринга.

| Категория | Кол-во | Пункты |
|---|---|---|
| СОГЛАСЕН, доказательства выдержали проверку целиком | 12 | C1, C2, C3, C5, C8, C13, C14, C15, D5, D6, D7, D4 |
| СОГЛАСЕН с вердиктом, доказательства требуют правки | 9 | C4, C6, C7, C9, C10, C11, C12, D3, D8 |
| НЕ СОГЛАСЕН с вердиктом | 0 | — |
| НЕ МОГУ ПРОВЕРИТЬ | 0 | — |

**Статус цитат** (61 проверенная ссылка): CONFIRMED — 48, WRONG-LINE — 10, REFUTED — 3.

**Три опровергнутых утверждения** (не вердикта, а доказательства):

1. **C7, v1-сторона — REFUTED.** «Единое правило региона `sdd_lib_execution_log` (якоря `<!--SECTION:EXECUTION_LOG-->` либо `## N. Execution Log`)» — в main такой функции нет (`grep sdd_lib_execution_log` → 0). Вход в регион жёстко захардкожен: `/^## 7\. Execution Log/` (`ai/skills/sdd-execute/scripts/check.sh:557`), а якоря **сознательно не используются** как делимитеры — это написано в комментарии `check.sh:554-556` со ссылкой на конкретный файл `cli-sync-skills.task-57.md`. Это та же ошибочная цитата, что V-A1/V-A4 уже опровергли в A4 по #15; B2 её унаследовал. Отдавать akkrat в этом виде нельзя — это его собственный PR.
2. **C7/D3 — MIS-READING.** «`## Critic Rounds` … остаётся в v1-формате при миграции, как это прямо предписано `infra.directive.xml:51` / `interface.directive.xml:48`». Читаю `infra.directive.xml:48-52`: это `AX_SPEC_LIFECYCLE`, и он говорит ровно противоположное — «Temporary Change Manifest, per-line review marks, **Critic Rounds**, publication state, and migration between V2 subformats **are not part of the specification**». Плюс речь про **спеки**, а не про тикеты. Ничто в v2 не предписывает сохранять `## Critic Rounds` в тикете; он там просто исторический мусор.
3. **C11 — «токена `yagni` нет ни в одном словаре» — REFUTED.** `yagni` объявлен в каноническом скелете фазового блока: `ai/kit/contract/process/phase-block-format.xml:11` — `- [x] \`<ts>\` yagni <name> ← <reason>   <!-- AX_USAGE_WAIVER_DISCIPLINE -->`. Это **седьмой** дом словаря, и он делает случай B2 сильнее, а не слабее (см. §Модель журнала).

**Три находки, которых в B2 нет и которые меняют картину:**

- **A. Ни один собранный документ v2 не несёт таблицу токенов.** `ai/kit/contract/process/phase-block-format.xml` — handlebars-партиал, но **ни один `.hbs` его не подключает**: `grep -rn 'contract/process/phase-block-format' ai/kit/templates` → 0. Всего таких неподключённых кирпичей 7: `blocker-format`, `orchestrator-progress-format`, `phase-block-format`, `phase-progress-format`, `return-summary-format`, `side-dive-format`, `trace-header-format`. То есть `PHASE_BLOCK_FORMAT` и `BLOCKER_FORMAT` — форматы, на которые ссылается JSDoc самого CLI (`sdd-log.types.ts:226`) — фазовый агент **не читает никогда**. Единственное собранное объявление словаря — `templates.ts:1581` → сгенерированный `specs/3-tasks.md`. Ф3 (47 % строк вне словаря) этим объясняется исчерпывающе.
- **B. `templates.ts:1579` и `formats/project-tasks-index.xml:18` объявляют ровно тот инвариант, который нарушает `sdd-log close`.** «Baseline Completion Rule: a Round cannot go `[x] DONE` until — every phase `[x]` with a current CLI-owned verification receipt …» — и это попадает в каждый сгенерированный `specs/3-tasks.md`. То же с обещанием блокировки: `templates.ts:1583` / `project-tasks-index.xml:20` — «until PASS the round is closed-but-unverified and **dependents are blocked**». Итого необеспеченное обещание живёт в **четырёх** местах, а не в одном `AX_AUDIT_HOOK` (C10.4).
- **C. Включение маркера `<!--PHASE_RECEIPTS:v1-->` даст ложный `SDD_EXECUTION_LOG_ROUND_MISSING`.** `firstRoundPhaseBlockCounts` ищет буквально `### Round 1`; в DA-lazy-asm единственный раунд — `### Round 2` (стр. 607), `### Round 1` **отсутствует**. Воспроизведено на фикстуре `Vb2/reopen`: тикет с `### Round 2` и маркером даёт `SDD_EXECUTION_LOG_ROUND_MISSING`. Это ломает D4-варианты 2 и 3 (инверсия / датирование) без предварительной правки `firstRoundPhaseBlockCounts`.

**Тесты (проверены самостоятельно, все три группы совпали до единицы):** 63/63, 160/160, 183/183. Единственное расхождение — счётчики `it` внутри файлов: `check.test.ts` = **40**, не 44; `check-phases.test.ts` = **11**, не 12.

**Долг RC на своём дереве: 198 error, 431 warn, 212 файлов** — цифра B2 подтверждена ровно.

---

## § Матрица

Статус цитат: CONFIRMED / WRONG-LINE (факт верен, номер строки сдвинут) / REFUTED (утверждение не подтверждается).

| # | Вердикт B2 | Цитаты v1 | Цитаты v2 | Мой вердикт | Комментарий |
|---|---|---|---|---|---|
| **C1** | ЗАКРЫТО | CONFIRMED — `_sdd-lib.sh:40` (`SDD_TASK_ID_RE`), граница `:51` (`SDD_TASK_ID_BOUNDARY`), тесты `scripts/__tests__/sdd-task-id.test.ts` существуют | CONFIRMED — `task-id.ts:16,19,38,63,166`; `check.ts:1385,1392-1406` (включая комментарий «no v1/v2 gating … exactly the collision this rule exists to catch during migration»); `sdd-check.cmd.ts:962,1194,1374` | **ЗАКРЫТО — СОГЛАСЕН** | Дубль `TSK-88` подтверждён построчно: оба файла, строка 7, `- **Task-ID:** TSK-88` |
| **C2** | ЧАСТИЧНО | CONFIRMED — `check.sh` даёт exit 3 при находках (`:666`), `rule_findings` отдельно (`:663`) | ≈CONFIRMED — `mdFiles` собирается `:1276`, `ticketRefs` объявлен `:1285`, обход `:1295` (B2 «:1275-1295» — приемлемо); `help.ts:92` объявляет ровно `0/1/4` | **ЧАСТИЧНО — СОГЛАСЕН, дыра ШИРЕ** | Три добавки ниже (§Репро) |
| **C3** | НЕ ЗАКРЫТО | CONFIRMED — `check.sh:282-286`, но расширений **15**, не 14 (сама B2 перечисляет 15) | CONFIRMED — `tasks-append-only.ts:35-51`; `sdd-check.cmd.ts:699-701`; тест-индекс `:503` (B2 «:504»); `ax-task-id-integrity.xml` («Orphan → `TASK_ID_DRIFT` (`MAJOR`)») дословно | **НЕ ЗАКРЫТО — СОГЛАСЕН** | Единственная правка — «14»→«15» в C3 и Сводке |
| **C4** | ЧАСТИЧНО | CONFIRMED — `check.sh:22-24` (перечень kinds), `:495-651`, 28 `it` в `sdd-check-log.test.ts`, retired-набор `sync file test cov rules recon` (`:528`) | CONFIRMED все 10 номеров: `check.ts:448,485,493,498,509,551,559,564,571,581`; движки `:219`, `:249`; маркер `:210`, гейт `:547` | **ЧАСТИЧНО — СОГЛАСЕН** | Счётчики тестов завышены: 40 (не 44) и 11 (не 12). `check-phases.test.ts:171,184,115` — дословно верны |
| **C5** | НЕ ЗАКРЫТО | CONFIRMED — тест «says nothing about a round that never ran» `sdd-check-log.test.ts:210`, `unclosed-round` `check.sh:635` | CONFIRMED — `grep IN_PROGRESS shared/sdd/check.ts cli/cmd/sdd-check/*.ts` → **0**; `sdd-log.cmd.ts:479,485`; `execute.directive.xml:181` дословно | **НЕ ЗАКРЫТО — СОГЛАСЕН** | Прямо воспроизведено: `sdd-log round` на тикете с незакрытым скелетом Round 1 открывает следующий раунд молча |
| **C6** | НЕ ЗАКРЫТО | CONFIRMED — `entry-after-close` `check.sh:567,643`; `extra-close-entry` `:600`; `norm_ts` (равная точность) `:538-545` | **2× WRONG-LINE** — `insertLine = bounds.closeLine` на `:420` (не `:405`; `:405` — вывод `complete`), splice на `:510` (не `:504-506`); ветки `:433-469` CONFIRMED; `sdd-log.types.ts:319-323` (B2 «:314-330») и `:157` CONFIRMED | **НЕ ЗАКРЫТО — СОГЛАСЕН, но «нет ничего» СЛИШКОМ СИЛЬНО** | На receipt-aware тикете пост-закрытие **частично ловится**: моя фикстура `Vb2/forge` дала `SDD_EXECUTION_LOG_PHASE_DUPLICATE` (блок `#### P2` после `Round close`) и два `SDD_DONE_PHASE_UNCHECKED`. Не ловится: событийные **строки** после закрытия — и всё остальное на не-receipt-aware корпусе (= весь RC) |
| **C7** | ЧАСТИЧНО | **REFUTED** — см. §Итог п.1 | CONFIRMED — `section.ts:141,192`; `check.ts:430,433`; `nextRoundNumber` `sdd-log.types.ts:76-79` дословно; `memberRoundCount` `:64-68` (B2 «:63-67») | **ЧАСТИЧНО — СОГЛАСЕН** | Асимметрия УЖЕ, чем сказано: `memberRoundCount` при `log.status !== 'ok'` откатывается на **весь файл** (`group-receipt.ts:65-66`) — тот же дефект. Плюс MIS-READING `infra.directive.xml:51` (см. §Итог п.2). Радиус поражения квантифицирован ниже |
| **C8** | НЕ ЗАКРЫТО | CONFIRMED (по V-A4 #13) | CONFIRMED — `templates.ts:1251,1440,1522` + `:1468,:1557` (B2 их не назвал), `migration-move.ts:161,258`, `module-tasks-index.xml:12`, `scope-tasks-index.xml:31`, `scaffold.directive.xml:181`, `formats/task-ticket-structure.xml:36`; `formats/audit-round.xml` (`after-exec-round`, `triggered-reopen`) дословно; `grep Reopens shared/ cli/` — **только** шаблоны и заголовки, ноль логики | **НЕ ЗАКРЫТО — СОГЛАСЕН** | JSDoc-подсказка `initial / fix: F-NNN / resume` — действительно единственная, `sdd-log.types.ts:84` |
| **C9** | НЕ ЗАКРЫТО (заменено каскадом) | CONFIRMED — `check.sh:20`, `:436-438` («activated rule files expose the four checkable sections»), `rule_findings=` `:663` (B2 «:664») | **WRONG-LINE** — маршрутизация `RULE_FILE_INCOMPLETE` на `audit.directive.xml:188`, **не `:184`** (`:184` — это `EXECUTION_LOG_INCOMPLETE`). Остальное CONFIRMED: `rules-cascade.ts` существует, `help.ts:49` объявляет `RULES_CASCADE_CLOSURE`, `grep BeliefState shared/ cli/` → 0 | **НЕ ЗАКРЫТО — СОГЛАСЕН** | Ярлык «НЕ ЗАКРЫТО в этой форме» точен |
| **C10** | ЧАСТИЧНО (перевёрнуто) | CONFIRMED и сильнее — `sdd-execute/SKILL.md:124` дословно: «Set ticket Meta Status → `[~] IN_PROGRESS`. **Not `[x] DONE` — the round is closed, not verified.** … only on audit PASS. Dependents pick on `DONE`»; `tasks/README.md:83` то же; `scaffold.directive.xml:241` `AX_AUDIT_HOOK` | **1× REFUTED + 3× WRONG-LINE** — `groupReceiptIssue` в `sdd-task.cmd.ts` **не вызывается вообще** (`:109` — это `pickableTasks`); `severity: 'warn'` на `group-receipt.ts:316` (не `:297`); грандфазеринг-гейт `:298` (не `:299`); отказ `buildGroupReceipt` `:149` (не `:150`). CONFIRMED: `ax-audit-hook.xml` и `execute.directive.xml:64` дословно; `pickableTasks` `check.ts:1349-1364` — только Status+Dependencies | **ЧАСТИЧНО — СОГЛАСЕН** | Суть п.4 верна и **шире**: `sdd-task --audit-group` существует (`audit-group.ts` через `sdd-task.cmd.ts:239-241`), но отвечает «все ли члены DONE», а не «есть ли PASS-receipt» — `grep receipt shared/sdd/audit-group.ts` → 0. Плюс находка B (§Итог) |
| **C11** | НЕ ЗАКРЫТО | CONFIRMED — таблица `scaffold.directive.xml:709-721`, зеркало `tasks/README.md:36-44` с явным «single source of truth … must never diverge»; awk-словарь `check.sh:525` **включает `ver`** | CONFIRMED все 6 источников дословно (`templates.ts:1581`, `project-tasks-index.xml:19`, `specs/3-tasks.md:12`, `ax-execution-log-verification.xml`, `STEP_2_SEMANTIC.xml:131`, `audit.directive.xml:153`) + **REFUTED** про `yagni` | **НЕ ЗАКРЫТО — СОГЛАСЕН, случай СИЛЬНЕЕ** | Домов **семь**, не шесть; дрейф не только в токенах, но и в Baseline Completion Rule (`specs/3-tasks.md:11` без «with a current CLI-owned verification receipt» против `templates.ts:1579`); противоречивых указателей **четыре** (+`templates.ts:1356` и `:1459`); словарь **не собран ни в один директив** (находка A) |
| **C12** | ЗАКРЫТО (сильнее) | CONFIRMED — `phase-execution-protocol.xml:90` («Must run: verification commands from ticket §5 …»), `:322-332` (одна `ver`-строка на вызов, «per-gate «pass» line reports a result it never printed … `fabricated-verification`», self-check «command string identical to the bash invocation») — прочитано дословно | **WRONG-LINE** — `AX_VERIFICATION_BEFORE_HANDOFF` на `execute.directive.xml:39-40`, **не `:55-58`** (`:57` — это `AX_GROUP_AUDIT_LEAVES_A_RECEIPT`); текст цитаты дословно верен. CONFIRMED: `sdd-log.types.ts:284-287`; `phase-receipt.ts:28,52,63,91,1203,1257,1294`; `phase-receipt-check.ts:62` (`if (!schemaAware && !receipts.has(phase.id)) continue;`), `:53` | **ЗАКРЫТО — СОГЛАСЕН** | Оговорка 2 нуждается в сужении: `phase-receipt-check.ts:61` начинается с `if (!phase.status.includes('[x]')) continue;` — receipt требуется **только для отмеченной в Overview фазы**, поэтому обход `line "DONE"` не порождает `SDD_PHASE_RECEIPT_MISSING` вовсе. Плюс `execute.directive.xml:42` — «a hand-written `ver` line is not evidence» — прямо относится к D1 и в B2 не назван |
| **C13** | НЕПРИМЕНИМО | — | CONFIRMED — `ai/skills/` в RC нет как класса | **НЕПРИМЕНИМО — СОГЛАСЕН** | |
| **C14** | НЕПРИМЕНИМО | — | CONFIRMED — `grep -rn 'sdd-path\|~/.claude/skills' ai/directives/sdd-v2/` → **0** (проверено) | **НЕПРИМЕНИМО — СОГЛАСЕН** | |
| **C15** | ЧАСТИЧНО | CONFIRMED (наличие v1-скилла `sdd-execute-batch`) | CONFIRMED — `execute.directive.xml:181`, `:98` («`TECHNICAL_REPLAN_EXHAUSTED`: CLI-owned retry budget consumed») дословно; `grep retry cli/cmd shared/sdd` — ни одного счётчика попыток фазы (совпадения: `vcs-job`, `update-check-worker`, `sdd-extract`-подсказки, `testcov`) | **ЧАСТИЧНО — СОГЛАСЕН** | Дублируется в `ax-halt-vs-fail-distinction.xml:8` и `return-summary-format.xml:7` — оба тоже без бюджета |
| **D3** | ЗАКРЫТО | CONFIRMED — `critic.directive.xml:167-169` дословно («Create/append `## Critic Rounds`: `### Round N — YYYY-MM-DD`») | CONFIRMED — `critic.directive.xml:57-62` дословно; `formats/audit-round.xml` («`N` increments monotonically … independent of Execution Round numbers») + **MIS-READING** `infra.directive.xml:51` | **ЗАКРЫТО — СОГЛАСЕН** | Радиус остатка измерен: `## Critic Rounds` с `### Round N` несут **3 живых тикета** RC — `cli-sync-skills.task-56.md` (2 шт.), `task-57.md` (2), `sdd-skills.task-61.md` (3). Все три — с нулём раундов внутри секции лога, т.е. `nextRoundNumber` вернёт **3, 3, 4** вместо 1 |
| **D4** | ЗАКРЫТО | — | **WRONG-LINE** — `AX_FINDING_ROUTING` на `audit.directive.xml:173-201` (B2 «:169-199»); `RULE_FILE_INCOMPLETE` на `:188` (не `:184`). CONFIRMED: `AUDIT_SESSION_SUMMARY_FORMAT` в `STEP_3_ROUTE.xml:102-135` | **ЗАКРЫТО — СОГЛАСЕН** | «замка не было и нет по обе стороны» — верно |
| **D5** | ЧАСТИЧНО | — | CONFIRMED все четыре: три `<ToolCall>` `sdd-check` на `STEP_1_MECHANICAL.xml:95,96,97`; `AX_MECHANICAL_VIA_SDD_CHECK` «Take its findings as given; do NOT hand-redo them» `:106`; анти-доверие к `ver` `:68`; устаревший каталог `:108-110` — сверено с `help.ts:47-67`, действительно нет `PHASE_RECEIPT`, `BDD_NEGATIVE`, `BDD_TRACE`, `COVERAGE_POLICY`, групповых receipt и `SDD_TASK_ID_GRAMMAR`; `STEP_2_SEMANTIC.xml:131` дословно | **ЧАСТИЧНО — СОГЛАСЕН** | Формулировка «дописано после закрытия ≠ прошлый раунд отредактирован» точна и важна |
| **D6** | ЧАСТИЧНО | — | CONFIRMED — `ax-ssot-traceability.xml`, `ax-reference-over-copy.xml` существуют; счётчики **перепутаны местами**: `SDD_BROKEN_SPEC_REF` = **6**, `SDD_BROKEN_SPEC_ANCHOR` = **11** (B2 «11 + 6» в обратном порядке) | **ЧАСТИЧНО — СОГЛАСЕН** | «нарушен четырежды» → по моему счёту **семижды** (см. C11) |
| **D7** | ЧАСТИЧНО | — | CONFIRMED — `ax-permitted-bash-commands.xml` существует; `HANDOFF_FORMAT` в `phase-execution-protocol/steps/STEP_4_HANDOFF.xml` с четвёртым полем `deviations` дословно; `sdd-log.types.ts:246-247,253-256,265` дословно; трёхполевой скелет `task-ticket-structure.xml:147` и `templates.ts:1362` | **ЧАСТИЧНО — СОГЛАСЕН** | Трёхполевых копий **три**, не две: третья — `contract/process/phase-block-format.xml:20` (неподключённая, находка A) |
| **D8** | ЧАСТИЧНО | — | CONFIRMED — `ax-reopen-format.xml` дословно (5-колоночная таблица, «Allocate concrete next-unused PhaseIDs», «Update `Reopens: <new count>`»); `formats/task-ticket-structure.xml:49`; 5 живых v1-тикетов с этой таблицей подтверждены поимённо. **WRONG-LINE** — щит заголовка `ticket.ts:202` (B2 «:201»), позиционный разбор `:203` (B2 «:202»), `overviewCells[4]` `:308` | **ЧАСТИЧНО — СОГЛАСЕН, следствия ХУЖЕ** | Моя фикстура (§Репро) даёт **не три, а шесть+одну** находки, включая `Phase P3 depends on unknown phase [ ]` для **каждой** строки — колонка Status читается как Deps у всех рядов, а не только у заголовка. Плюс третье противоречие: `ax-reopen-format.xml` велит `Meta Status → [ ] TODO`, а `sdd-log round` пишет `[~] IN_PROGRESS` (`sdd-log.cmd.ts:479`) |

---

## § Репро

Все прогоны — в свежем каталоге `…/scratchpad/Vb2/`, фикстуры написаны с нуля (`B2fix/` не открывался). CLI звался как `node --import <rc>/node_modules/tsx/dist/loader.mjs <rc>/cli/gennady.ts` из cwd фикстуры.

### Р1. Ноль тикетов → `sdd-check --all` (Ф1) — **CONFIRMED побайтово**

```
$ sdd-check --all Vb2/empty      # только specs/README.md с Vision/Scope Graph/Scopes
[sdd-check] ✅ clean — 1 file(s) checked                  EXIT=0
$ sdd-check --all Vb2/bare       # пустой каталог
[sdd-check] ✅ clean — 0 file(s) checked                  EXIT=0
```

### Р2. Дыра C2 **шире**, чем в B2 — три добавки

```
$ sdd-check --task ZZZ-nope       (v2-грамматика, тикета нет)
[sdd-check] ERR_CLI_SDD_CHECK_UNKNOWN_ID: ZZZ-nope … «очередь пуста»   EXIT=2
$ sdd-check --task TSK-88         (легаси-числовой, грамматику проходит)
[sdd-check] ERR_CLI_SDD_CHECK_UNKNOWN_ID: TSK-88                        EXIT=2
$ sdd-check --task TSK-IB-001     (путевой v1-ID, грамматику НЕ проходит)
[sdd-check] ERR_CLI_SDD_CHECK_FILE: TSK-IB-001 … «Cannot read the ticket»  EXIT=1
```

1. **Путевой v1-ID деградирует до `ERR_CLI_SDD_CHECK_FILE` exit 1 без списка известных ID.** Именно та форма, которая была нормой в v1 (`TSK-IB-001`), не попадает в `looksLikeTaskId` (заглавные в слаге) и обрабатывается как нечитаемый путь. В v1 плохой ID давал exit 4 — то есть «bad invocation», а не «файл не читается».
2. **Exit 2 нигде не задокументирован.** `help.ts:92` объявляет ровно `0 clean / 1 error(s) / 4 bad invocation`; `ERR_CLI_SDD_CHECK_UNKNOWN_ID` возвращает 2.
3. **Дерево с одним полностью нечитаемым легаси-тикетом — тоже «чисто», exit 0.** Фикстура `Vb2/legacy/tasks/ib/ib.IB-001.md` (v1-заголовки `## 1. Meta & Traceability` … `## 5. Execution Log`, `**Task-ID:** TSK-IB-001`):

```
$ sdd-check --all .
warn: SDD_LEGACY_TICKET_UNANCHORED …
warn: SDD_TRACKER_MISSING_ROW …
[sdd-check] 0 error(s), 2 warning(s) across 1 file(s)                     EXIT=0

$ sdd-check --task tasks/ib/ib.IB-001.md          # тот же файл, режим --task
error: SDD_MISSING_META …
error: SDD_MISSING_EXECUTION_LOG …
[sdd-check] 2 error(s)                                                    EXIT=1
```

Асимметрия режимов: **тот же файл — 0 ошибок в `--all` и 2 ошибки в `--task`.** `--all` роутит легаси в `checkLegacyTicket` (`sdd-check.cmd.ts:1378-1380`), `--task` гонит полный `checkTicket`. Это самостоятельный дефект, которого в B2 нет: «зелёный на дереве, красный по одному» — ровно тот false-green, ради которого C2 существует.

### Р3. `## Critic Rounds` и `nextRoundNumber` (Ф5) — **CONFIRMED**

Фикстура `Vb2/mig/t.task.VER-crit.md`: `### Round 1` внутри `EXECUTION_LOG` + `## Critic Rounds` / `### Round 7` за пределами секции.

```
$ sdd-log t.task.VER-crit.md round "fix: F-001"
[sdd-log] appended to EXECUTION_LOG:
### Round 3 — 2026-09-07, fix: F-001
[sdd-log] status → IN_PROGRESS                                            EXIT=0
```

Побочно: новый раунд вставлен **после** маркера `<!--PHASE_RECEIPTS:v1-->`, так что маркер оказывается посреди журнала.

Живой радиус (измерено на дереве RC):

| тикет | всего `^### Round` | внутри `EXECUTION_LOG` | `nextRoundNumber` даст |
|---|---|---|---|
| `tasks/cli/sync-skills/cli-sync-skills.task-56.md` | 2 | 0 | **3** вместо 1 |
| `tasks/cli/sync-skills/cli-sync-skills.task-57.md` | 2 | 0 (якоря обнимают только заголовок) | **3** вместо 1 |
| `tasks/ai-skills/sdd-skills/sdd-skills.task-61.md` | 3 | 0 | **4** вместо 1 |

`task-57.md` — тот самый файл, который v1-й `check.sh:555` называет по имени как причину не использовать якоря делимитерами. Хорошая перекрёстная проверка обеих сторон.

### Р4. Неизвестный токен, обход `complete`, запись в закрытый раунд (Ф4) — **CONFIRMED, коды выхода сошлись все**

Фикстура `Vb2/forge/t.task.VER-forge.md`: канонический скелет (`| ID | Kind | Deps | Status |`, P1+P2, `#### Round close`, маркер `<!--PHASE_RECEIPTS:v1-->`).

```
line "totallyUnknownToken did a thing" --phase P1                 EXIT=0
complete "artifacts: […]; decisions: […]; open: […]; deviations: […]" --phase P1
    ERR_CLI_SDD_LOG_COMPLETE_STATE: phase P1 has no CLI-owned SDD_PHASE_RECEIPT   EXIT=2
line "DONE" --phase P1                                            EXIT=0   ← обход complete
handoff "artifacts: […]; …; deviations: [none]" --phase P1         EXIT=0
close      → [sdd-log] status → DONE                              EXIT=0
phase P2   → блок #### P2 ПОСЛЕ #### Round close                  EXIT=0
line "correction | Round 1/P1 exit: 1 -> 0"                       EXIT=0   ← запись после закрытия
```

Итог в файле: `Meta Status: [x] DONE`, **при этом обе строки Phases Overview остались `[ ]`**, скелет P2 `- [ ] \`<ts>\` DONE` не заменён, `#### P2` встречается дважды. То есть `close` прошёл при **двух** незакрытых фазах — на одну хуже, чем в B2.

**Чего B2 не записал** — что видит после этого `sdd-check`:

```
$ sdd-check --task t.task.VER-forge.md
warn:  SDD_DONE_WITH_PLACEHOLDERS
error: SDD_PHASE_SECTION_MISSING  (P1, P2 — шум фикстуры)
error: SDD_EXECUTION_LOG_PHASE_DUPLICATE  Execution Log Round 1 has 2 `#### P2` blocks
error: SDD_DONE_PHASE_UNCHECKED (P1)
error: SDD_DONE_PHASE_UNCHECKED (P2)                                      EXIT=1
```

Вывод, уточняющий C6 и C12.2: **на receipt-aware тикете подделка не проходит бесшумно** — блок фазы после закрытия ловится как `PHASE_DUPLICATE` (или `PHASE_ORPHAN`, если id новый), а фиктивное закрытие — как `DONE_PHASE_UNCHECKED`. Не ловится:

- **событийная строка** после `Round close` (`correction …` — ни одной находки);
- всё это на **не-receipt-aware** тикете, то есть на всём корпусе RC;
- `SDD_PHASE_RECEIPT_MISSING` не срабатывает даже с маркером, потому что `phase-receipt-check.ts:61` пропускает фазу, не отмеченную `[x]` в Overview. Дешёвая подделка — это `line "DONE"` + правка Overview руками; тогда receipt потребуется. Оставить Overview `[ ]` — сработает `DONE_PHASE_UNCHECKED`. То есть на receipt-aware тикете обход закрыт «по кругу», а на legacy — открыт полностью.

### Р5. Реопен по `ax-reopen-format.xml` (D8) — **следствия хуже, чем в B2**

Фикстура `Vb2/reopen/t.task.VER-reop.md`: `PHASES_OVERVIEW` = таблица из аксиомы дословно (`| Phase | Kind  | Status | Target Files | Deps |`), лог = `### Round 2 — …, fix: F-001` с `#### P3`, маркер `<!--PHASE_RECEIPTS:v1-->`.

```
$ sdd-check --task t.task.VER-reop.md
error: SDD_PHASE_DEP_UNRESOLVED   Phase Phase depends on unknown phase Status.
error: SDD_PHASE_DEP_UNRESOLVED   Phase P3 depends on unknown phase [ ].
error: SDD_PHASE_DEP_UNRESOLVED   Phase P4 depends on unknown phase [ ].
error: SDD_PHASE_SECTION_MISSING  Phase Phase …
error: SDD_PHASE_SECTION_MISSING  Phase P3 …
error: SDD_PHASE_SECTION_MISSING  Phase P4 …
error: SDD_EXECUTION_LOG_ROUND_MISSING  Current receipt-aware ticket has no `### Round 1` …
                                                                          EXIT=1
```

Три уточнения к D8:

1. Заголовок читается как фаза `Phase` — CONFIRMED (B2 сообщает «depends on unknown phase Kind», у меня `Status`; зависит от того, где в 5-колоночной таблице стоит третья ячейка — сути не меняет).
2. **Колонка Status читается как Deps у КАЖДОЙ строки**, не только у заголовка: `Phase P3 depends on unknown phase [ ]`. B2 этого не заметил, а это значит, что 5-колоночная форма ломает не заголовок, а весь разбор.
3. **`SDD_EXECUTION_LOG_ROUND_MISSING` — ложное срабатывание на легитимном реопене.** Раунд назван `### Round 2`, `firstRoundPhaseBlockCounts` ищет буквально `Round 1` и, не найдя, возвращает `null`. То же будет с DA-lazy-asm, у которого единственный раунд — `### Round 2` (стр. 607), как только маркер поставят. Это блокирующее условие для D4-вариантов 2 и 3.

Плюс `complete` на этой фикстуре отказывает ожидаемо (`ERR_CLI_SDD_LOG_COMPLETE_STATE: phase P3 has no CLI-owned SDD_PHASE_RECEIPT`), но даже с receipt он бы отказал вторично: `overviewCells[4]` в 5-колоночной строке — это `Target Files`, а не Status.

### Р6. Ф2 и Ф3 на `DA-lazy-asm` — **CONFIRMED, перепись сошлась до единицы**

```
$ wc -l …/directive-assembly.task.DA-lazy-asm.md            → 900
$ grep -c SDD_PHASE_RECEIPT                                  → 0
$ grep -c 'PHASE_RECEIPTS:v1'                                → 0
Meta :8  - **Status:** [x] DONE
^### Round …                                                 → ТОЛЬКО «### Round 2» (стр. 607)
#### Round close                                             → стр. 768
после 768: 35 строк `- [x]`, 4 терминальных DONE, 3 **Handoff →**
```

Перепись первого слова 129 событийных строк (мой независимый прогон):

```
47 ver · 35 discovery · 15 DONE · 7 ✅ · 6 yagni · 4 intro · 4 decision · 3 fix · 3 env-fix · 2 verified · 2 correction: · 1 insight
```

Вне словаря `templates.ts:1581`: `ver`+`yagni`+`fix`+`env-fix`+`correction:` = **61 из 129 = 47 %**. Совпадает с B2 полностью. Токен — `correction:` с двоеточием (в таблице B2 без него).

`sdd-check --task` по этому тикету: **38 error + 1 warn**, все — `SDD_BDD_REQUIREMENT_UNTRACED` (37), `SDD_BDD_SCENARIO_UNTESTED` (1), `SDD_VERIFICATION_TABLE_INVALID` (1). **Ни одной** находки класса LOG / RECEIPT / ROUND. CONFIRMED.

Уточнение к Ф2: блок `#### P5 — re-run:` (стр. 715) стоит **до** закрытия, а `#### P3/P1/P10 — re-run:` (772/786/806) — **после**. B2 пишет «реопены сделал … блоками `#### P<N> — re-run:` внутри уже закрытого Round 2» — верно для трёх из четырёх.

### Р7. Тесты RC — **все три группы сошлись до единицы**

```
node --import tsx --test --experimental-test-module-mocks cli/cmd/sdd-log/__tests__/sdd-log.cmd.test.ts
  → # tests 63  # pass 63  # fail 0   (8 suites)

… shared/sdd/__tests__/{check,check-phases,check-taskgraph,check-taskid-grammar,
  check-legacy-ticket,group-receipt,phase-receipt,task-id,section}.test.ts
  → # tests 160  # pass 160  # fail 0  (28 suites)

… cli/cmd/sdd-check/__tests__/{group-receipt.check,phase-receipt-check,sdd-check.cmd}.test.ts
  + cli/cmd/sdd-log/__tests__/group-receipt.cmd.test.ts
  + cli/cmd/sdd-task/__tests__/sdd-task.cmd.test.ts
  + cli/cmd/sdd-extract/__tests__/sdd-extract.cmd.test.ts
  → # tests 183  # pass 183  # fail 0  (16 suites)
```

Расхождение только во внутренних счётчиках: `check.test.ts` = **40 it** (B2: 44), `check-phases.test.ts` = **11 it** (B2: 12).

### Р8. Долг RC — **CONFIRMED**

```
$ sdd-check --all .    →  198 error(s), 431 warning(s) across 212 file(s)   EXIT=1
```

Гистограмма (топ): 140 `SDD_BDD_COVERAGE_ROW_UNPARSED` (warn), 76 `SDD_LEGACY_TICKET_UNANCHORED` (warn), 70 `SDD_BDD_SCENARIO_UNTESTED`, 47 `SDD_VERIFICATION_TABLE_INVALID`, 44 `SDD_FABRICATED_DONE`, 37 `SDD_BDD_REQUIREMENT_UNTRACED`, 18 `SDD_DEP_UNRESOLVED`, 11 `SDD_DONE_WITH_PLACEHOLDERS`, 9 `SDD_SECTION_OVERLAP`, 3 `SDD_TASK_ID_COLLISION`, 3 `SDD_ANCHOR_UNBALANCED`.

**Ноль** `SDD_GROUP_AUDIT_MISSING`, `SDD_GROUP_REVIEW_MISSING`, `SDD_PHASE_RECEIPT_*`, `SDD_EXECUTION_LOG_*` — грандфазеринг выключил три класса проверок на всём корпусе, как и утверждает B2. Цифры 76 (`LEGACY_TICKET_UNANCHORED`) и 3 (`TASK_ID_COLLISION`) подтверждены.

---

## § Модель журнала

### Кто пишет — §2.1 верна

Все 11 режимов подтверждены (`MODES`, `sdd-log.cmd.ts:62-74`; B2 «:61-74» — off-by-one на открывающей скобке). Пофазные требования подтверждены: `--phase` обязателен для `blocker`/`resolved` (`:239-242`) и для `complete` (`:236`). `ERR_CLI_SDD_LOG_*` — 13 кодов на `:13-37`, CONFIRMED. Файловая форма (`--content-file` / `--payload-file`) и её 9 тестов — CONFIRMED.

**Одно уточнение к §2.1 и к §3.5**: в v2 **два** примитива записи в тикет, а не один.

- `sdd-log` пишет через `writeProvenRepoFile` (`shared/common/repo-file-identity.ts:136`);
- receipt фазы пишет `sdd-verify` через **приватную** (не экспортируемую) `atomicTicketWrite` (`cli/cmd/sdd-verify/phase-run.ts:73`, вызов `:178`).

`atomicTicketWrite` вне `phase-run.ts` не существует; в документах (`ai/flow-eval/docs/flow-verification-ledger.md:58`, `flow-verification-redesign.md:119`) он назван «persistence PRIMITIVE (CLI-owned, atomic, corpus-visible)». Это надо назвать в §3.5 (см. §Дизайн).

### Где живёт словарь — семь домов, ни один не собран

| # | источник | `ver` | `yagni` | `SDD_PHASE_RECEIPT` | Handoff | собран в директиву? |
|---|---|---|---|---|---|---|
| 1 | `shared/sdd/templates.ts:1581` (генератор `specs/3-tasks.md`) | **нет** | нет | да | — | да (через сгенерированный файл) |
| 2 | `ai/directives/sdd-v2/formats/project-tasks-index.xml:19` | **нет** | нет | да | — | да (build-output от `formats/project-tasks-index.hbs`) |
| 3 | `specs/3-tasks.md:12` (фактический файл RC) | **да** | нет | **нет** | — | это данные, не директива |
| 4 | `ai/kit/axiom/audit/ax-execution-log-verification.xml` | **требует** | нет | нет | требует `**Handoff →**` | да (партиал в `audit.directive.hbs`) |
| 5 | `ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml:131` | **требует** | нет | нет | — | да |
| 6 | `ai/directives/sdd-v2/audit.directive.xml:153` (`AX_AUDIT_YAGNI_CROSSCHECK`) | — | **требует** | — | — | да |
| 7 | `ai/kit/contract/process/phase-block-format.xml:10-20` | **нет** | **да** | «CLI-owned receipt appears here» | **3 поля** | **НЕТ — партиал никем не подключён** |

Плюс два взаимно противоречащих указателя, каждый в двух копиях (xml + генератор):

- «Token vocabulary lives in `<module>.3-tasks.md`» — `formats/task-ticket-structure.xml:141`, `scaffold.directive.xml:286`, **и `templates.ts:1356`**;
- «Project-wide conventions (Execution-Log token vocabulary …) are declared once in `specs/3-tasks.md` … not repeated» — `formats/module-tasks-index.xml:31`, **и `templates.ts:1459`**.

Дрейф выходит за пределы токенов: **Baseline Completion Rule** тоже разошлась. `templates.ts:1579` / `project-tasks-index.xml:18` требуют «every phase `[x]` **with a current CLI-owned verification receipt**»; фактический `specs/3-tasks.md:11` в RC этой оговорки не несёт. То есть уже сгенерированный SSOT отстал от собственного генератора не в одной строке, а в двух.

**Отдельно — уточнение к §2.7.** «Словарь перестал быть закрытым» верно только механически. Как **семантическое** правило он жив дословно: `ax-execution-log-verification.xml` — «Line with a token outside the vocabulary → `EXECUTION_LOG_INCOMPLETE` (MINOR, «padding»)». Пропала не норма, а проверка. Формулировать надо так — иначе выглядит, будто v2 сознательно открыл словарь.

### Коды `SDD_*` — §2.3 верна и почти полна

Собрал независимо: `grep -rhoE "'SDD_[A-Z_0-9]+'" shared/ cli/` → 156 уникальных кодов. Все 24 «ошибки» и 8 «предупреждений» из §2.3 существуют, ни одного лишнего. Не назван один: **`SDD_CONSUMERS_SCAN_FAILED`** (fail-closed напарник `SDD_CONSUMERS_UNRESOLVED`). Отсутствуют, как и сказано: любой аналог `unknown-token`, `retired-token`, `unclosed-round`, `entry-after-close`, `extra-close-entry`, `bad-round-close`, `round-close-no-timestamp`, а также `SDD_REOPENS_*` и `SDD_NO_TICKETS_FOUND`.

Три гейта охвата подтверждены: `check.ts:547` (маркер), `group-receipt.ts:298` (`every(memberIsReceiptAware)`), `isV2SpecsTicket` (`sdd-check.cmd.ts:962` → `:1194`, `:1374`). Плюс **четвёртый, в B2 не названный**: `phase-receipt-check.ts:53` — `if (overview.status !== 'ok') return [];` и `:61` — `if (!phase.status.includes('[x]')) continue;`. Первый выключает receipt-проверки на любом тикете без читаемой `PHASES_OVERVIEW` (все мигрированные v1-тикеты уровня `##`, см. §2.6), второй — на любой не отмеченной фазе.

### Receipts — §2.4 верна

`PhaseReceiptPlan` `phase-receipt.ts:28-49`, `PhaseReceipt` `:52-70`, `PROVEN` только при `exit === 0` (`:63`, `:1248`), хеши `:91`, `:1203`, `:1257`, `:1294`. Групповой: `GROUP_RECEIPT_MARKER:15`, подпись по `[basename, roundCount, done]` `:47`/`:102`/`:112`, отказ пока не все DONE `:149`, читатель `:294-322`, `severity: 'warn'` `:316`, грандфазеринг `:298`. Всё CONFIRMED.

Одна оговорка к §2.4/C7: подпись группы опирается на `memberRoundCount` (`:64-68`), а тот при нечитаемой секции считает по **всему файлу** — то есть на legacy-члене подпись группы завязана на то же полнофайловое число, что ломает `nextRoundNumber`. B2 подаёт `memberRoundCount` как корректный контрпример; корректен он только на якорном тикете.

### Reopens — §2.5 верна, плюс третье противоречие

`nextRoundNumber` = полнофайловый счёт (`:76-79`) — CONFIRMED. Свободная строка причины — CONFIRMED (`:435` вызывает `buildRoundHeader(nextRoundNumber(content), date, payload)` без валидации). Ноль механики Reopens — CONFIRMED. `## Audit Rounds` без якоря `<!--SECTION:AUDIT_ROUNDS-->` — CONFIRMED (`grep 'SECTION:AUDIT_ROUNDS' ai/ shared/ specs/` → 0), heading-форма `sdd-extract <file>#audit-rounds` существует (`cli/cmd/sdd-extract/help.ts:13,22`), аксиома о ней не знает (`ax-task-id-integrity.xml` предписывает форму `sdd-extract <ticket> <NAME>`) — CONFIRMED.

**Добавка:** `ax-reopen-format.xml` предписывает `Set ticket Meta Status → \`[ ] TODO\``, а `sdd-log round` пишет `[~] IN_PROGRESS` (`sdd-log.cmd.ts:479`). Это **третье** расхождение аксиомы реопена с v2-механикой (после 5-колоночной таблицы и отсутствия строки в `PHASES_OVERVIEW`), и его надо внести в B2-08/D2.

### Task-ID: грамматика и legacy — §2.6 верна

`TSK-64` проходит грамматику, `TSK-IB-001` — нет: проверено обоими способами (грамматика `task-id.ts:16`; прогон `--task TSK-88` → UNKNOWN_ID exit 2 против `--task TSK-IB-001` → FILE exit 1). Границы `anchor-inject.ts:15,21` и последствие «`overviewSec.status !== 'ok'` ⇒ весь блок фазовых/receipt-проверок молчит» — CONFIRMED кодом (`check.ts:511+` под `if (overviewSec.status === 'ok')`, `phase-receipt-check.ts:53`).

---

## § Дизайн и steelman

### Согласуется ли §3 с CLI-владением записями и `atomicTicketWrite`

**Да, конфликта нет** — но по причине, которую §3 не проговаривает: предложение затрагивает только **слой разбора**, а не слой записи. `parseExecutionLog` читает; писать продолжают `writeProvenRepoFile` (`sdd-log`) и `atomicTicketWrite` (`sdd-verify`). Ни один из новых отказов §3.5 не требует нового примитива.

Два места, где это надо назвать явно, иначе задача B2-07 недооценена:

1. `sdd-log close` должен будет **прочитать receipt, написанный другой командой другим примитивом**. Сейчас `closeCurrentRound` (`sdd-log.types.ts:124-179`) вообще не парсит receipt — в отличие от `completePhase` (`:284`). Добавление «отказать при отмеченном DONE без receipt» вводит в `close` зависимость от `parsePhaseReceipts`, то есть от формата, чей единственный писатель — `sdd-verify`. Это нормально, но это новое связывание, и оно стоит строки в B2-07.
2. `atomicTicketWrite` **не экспортируется** (`cli/cmd/sdd-verify/phase-run.ts:73`). Если §3 когда-нибудь понадобится атомарная запись из `shared/sdd/`, придётся его поднимать. В текущем объёме — не понадобится; так и надо написать, чтобы не выглядело недосмотром.

### Конфликт с групповыми receipt и грандфазерингом `PHASE_RECEIPTS:v1`

**Конфликта нет; есть незамеченная зависимость и одна ловушка.**

- §3.4 наследует политику «error только на receipt-aware, warn на legacy». Это ровно та политика, которая уже применена в `check.ts:547`, `phase-receipt-check.ts:62`, `group-receipt.ts:298`. Последовательно.
- Но `checkGroupReceipts` требует, чтобы маркер несли **все** члены группы (`every`). Значит любая новая проверка, привязанная к маркеру, включается на группе только целиком — постепенная миграция «по тикету» не даст групповых находок вообще. §3.9 п.2 это упоминает («нужен план проставления маркера»), но не связывает с `every`. Надо связать.
- **Ловушка, которой в §3.9 нет** (моя находка C): проставить маркер на существующем тикете, у которого раунд не первый, — значит получить ложный `SDD_EXECUTION_LOG_ROUND_MISSING` (воспроизведено, Р5). `firstRoundPhaseBlockCounts` ищет литеральный `Round 1`. Поскольку §3 всё равно переносит эту функцию в `parseExecutionLog` (B2-01), правку «текущий раунд, а не первый» надо сделать в том же изменении, иначе D4-варианты 2/3 нереализуемы, а D5-вариант 3 включит проверку, которая сразу же покрасит DA-lazy-asm ложной находкой.

### Отвергнутая более простая альтернатива — да, одна, и её отвергли зря

§3.1 обосновывает «один парсер, три потребителя» через дрейф четырёх реализаций. Обоснование верное, но §3 нигде не рассматривает **разделение**: три отсутствующие проверки не в равной мере требуют полного парсера.

- `SDD_NO_TICKETS_FOUND` (§3.4) вообще не касается журнала — это `ticketRefs.length === 0` в `sdd-check.cmd.ts`. Он попал в B2-05 корректно, но в §3.1 подаётся как часть «одной и той же структуры», чем не является.
- `SDD_EXECUTION_LOG_UNKNOWN_TOKEN` и валидация токена в `sdd-log line` требуют только `TOKEN_VOCABULARY` + «первое слово после штампа». Это S-задача, полностью независимая от `Round`/`PhaseBlock`.
- `checkReopens` требует парсер `## Audit Rounds`, а не `EXECUTION_LOG`.

То есть из L-задачи B2-01 реально зависят только пост-закрытие (B2-04) и `_PHASE_UNRECEIPTED_DONE` (B2-07). Это стоит сказать прямо: **B2-03, B2-05, B2-06 можно поставить раньше B2-01** и получить три из семи новых кодов до большого рефакторинга. §4.1 утверждает обратное («B2-01 несёт парсер, на который опираются 02–05») — и для 03 и 05 это неверно.

### Steelman: «не делать ничего, кроме WARN-кодов»

Сильнейшая версия возражения:

> Все семь потерянных проверок v1 — про **форму журнала**, а v2 сознательно перенёс центр тяжести с формы на **доказательство**. `SDD_PHASE_RECEIPT` с хешами плана, окружения и целевых файлов — это то, чего ни одна из семи проверок не давала и не могла дать: v1 верил строке `ver`, написанной агентом, и ловил только её синтаксис. Вернуть словарь и пост-закрытие — значит вложить L+M+M в проверку того, что журнал **выглядит** правильно, вместо того чтобы включить проверку того, что работа **доказана**. Единственный дефект, который стоит денег, — грандфазеринг: маркер не несёт ни один тикет, значит receipt-проверки выключены на 100 % корпуса. Поставьте маркер — и получите больше гарантий, чем от всего §3.

Что я в этом принимаю:

- Приоритет верен. **D4 дороже, чем B2-01.** Проставленный маркер включает `SDD_PHASE_RECEIPT_MISSING/INVALID/INCOMPLETE/STALE_*`, `SDD_EXECUTION_LOG_ROUND/PHASE_*` и групповые receipt — пять классов сразу, за S-объём (плюс правка `Round 1` → текущий раунд). §4.1 не содержит задачи «поставить маркер», а D4 отдан оператору как выбор политики. Это перевёрнутый приоритет: D4 — самая дешёвая и самая крупная победа трека.
- `SDD_EXECUTION_LOG_UNKNOWN_TOKEN` в warn — почти бесполезен на текущем корпусе (47 % строк). Как гейт он заработает только после D1.

Где steelman ломается — три места, и B2 их закрывает:

1. **Пост-закрытие уже произошло на живом артефакте, и receipt его не поймал бы.** В DA-lazy-asm 35 отмеченных строк, 4 DONE и 3 Handoff после `#### Round close`. Receipt привязан к фазе и файлам, а не к хронологии: он не отличает «доказано в раунде 2» от «доказано после того, как раунд 2 объявлен закрытым». Аудит цитирует строки, которых на момент закрытия не существовало. Никакой маркер этого не лечит — лечит только `Round.trailing`.
2. **`ver` — не косметика, а требование двух собранных документов аудита** (`ax-execution-log-verification.xml`, `STEP_2_SEMANTIC.xml:131`), и одновременно удалённый из таблицы токенов. Пока это расхождение живо, `EXECUTION_LOG_INCOMPLETE` — недетерминированная находка: аудитор обязан требовать строку, которой словарь не разрешает. Это не «форма», это неработающий гейт. Причём v2 сам уже вынес вердикт: `execute.directive.xml:42` — «a hand-written `ver` line is not evidence». То есть D1-вариант 1 («вернуть `ver` как человеческую заметку») в директиве **уже** оформлен; надо лишь дописать его в таблицу.
3. **`close` пишет `[x] DONE`, не проверив ни одной фазы** — и это противоречит Baseline Completion Rule в четырёх местах (находка B). Это не про форму журнала; это про то, что статус тикета не значит того, что о нём написано во всех сгенерированных конвенциях. B2-07 — S-объём.

**Вывод по steelman.** Возражение выигрывает спор о **порядке**, а не о **содержании**. Правильная последовательность: D4 (маркер + `Round 1`→текущий) → B2-07 (`close` требует завершённости) → B2-04 (пост-закрытие) → B2-02 (`nextRoundNumber`) → D1 + B2-03 (словарь) → B2-01 (объединение парсера, уже как рефакторинг, а не как предпосылка) → B2-06 (Reopens). B2-05, B2-09, B2-10, B2-14, B2-15 — независимы и могут идти в любой момент.

### Прочие замечания к §3

- **§3.2, инвариант 3** («`#### Round close` завершает список фаз раунда; всё после него → `Round.trailing`») — точно то, что нужно, и точно то, чего сейчас нет (`completePhase` ищет до `log.closeLine`, `sdd-log.types.ts:319-323`). Хорошо.
- **§3.3, `correction`.** Живой токен — `correction:` с двоеточием (2 применения в DA-lazy-asm). Предлагаемая B2 грамматика `correction <round>/<phase> <field>: <old> → <new> ← <reason>` двоеточия после токена не имеет — то есть существующие две строки не пройдут собственный новый парсер. Мелочь, но её надо назвать в задаче B2-03.
- **§3.4, `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE`** с условием «`trailing` непусто, **а следующего `### Round` нет**» — это делает находку невозможной ровно в том случае, который уже случился: в DA-lazy-asm следующего раунда нет, значит находка сработает. Хорошо. Но обратный случай (дописали в закрытый Round 1, потом открыли Round 2) молчит навсегда. Это сознательная поблажка или недосмотр — надо решить явно.
- **§3.6, регресс-фикстура DA-lazy-asm** — правильно и обязательно. Добавить в golden ожидание ложного `SDD_EXECUTION_LOG_ROUND_MISSING` (или его исчезновение после правки «Round 1»→текущий).
- **§3.9 п.4 (`✅ RESOLVED` после закрытия)** — семь строк подтверждаю (перепись: 7 `✅`). Замечу, что `buildResolvedLine` (`sdd-log.types.ts:391`) требует `--phase`, а `--phase` требует **открытого** блока фазы (`ERR_CLI_SDD_LOG_PHASE_NOT_OPEN`); значит в DA-lazy-asm эти 7 строк попали в блоки `— re-run:`, открытые после закрытия. То есть D6 неразделим с D2: вариант D2.3 («`— re-run:` только до закрытия») автоматически делает D6.1 невозможным. B2 подаёт их как независимые решения — это не так.

---

## § Задачи

### Зависимости — в основном верны, две неточности

1. **«B2-01 несёт парсер, на который опираются 02–05» — неверно для 03 и 05.** B2-03 (словарь) нуждается только в `TOKEN_VOCABULARY` + первом слове строки; B2-05 (`SDD_NO_TICKETS_FOUND`) журнала не касается вообще. Реально от B2-01 зависят B2-04 и B2-07.
2. **B2-02 и B2-01 нельзя разделять** — это §3.9 п.5 говорит верно, но в таблице §4.1 B2-02 стоит отдельной S-задачей. Либо слить в B2-01, либо явно записать «выполняется в одном коммите с B2-01». Плюс B2-02 должна тронуть `group-receipt.ts:64-68` (fallback на весь файл) — сейчас в её списке файлов есть `group-receipt.ts` только в B2-01.

### Пропущенные задачи

- **P1. Проставить `<!--PHASE_RECEIPTS:v1-->` на корпусе (миграция существующих тикетов).** В §4.1 её нет; в §4.2 она превращена в D4-выбор политики. Но независимо от политики нужна **механика**: `sdd-migrate` или отдельный шаг, который добавляет маркер и приводит тикет к receipt-aware форме, включая правку `firstRoundPhaseBlockCounts` (`Round 1` → текущий раунд, иначе ложное `SDD_EXECUTION_LOG_ROUND_MISSING`, Р5) и `every(memberIsReceiptAware)` (группа включается только целиком). Размер — M. Это, по steelman, самая ценная задача трека.
- **P2. Обновить спеки под `specs/cli/**`.** `specs/cli/sdd-log/sdd-log.spec.md` и `specs/cli/sdd-check/sdd-check.spec.md` **существуют** и являются нормативными: `sdd-log.spec.md:25` перечисляет ровно 8 режимов (`round`/`line`/`close`/`phase`/`handoff`/`blocker`/`resolved`/`complete`) — то есть уже отстала от 11 в коде (нет `authoring-complete`, `audit-receipt`, `review-receipt`); `sdd-log.spec.md:119` повторяет тот же устаревший список без `resolved`/`complete`. `sdd-check.spec.md` перечисляет 38 кодов `SDD_*`. Ни одна из 15 задач B2 не правит эти файлы, хотя каждая добавляет код или режим. По правилам самого v2 (spec-first) без этого задачи неисполнимы. Размер — M, и это блокирующее требование, а не косметика.
- **P3. Достроить `ai/kit/contract/process/**` до собранного состояния или удалить.** 7 неподключённых кирпичей, в том числе `phase-block-format` (единственный дом `yagni` и единственный полный скелет фазового блока) и `blocker-format` (формат, который реализует `sdd-log blocker`). `grep -rn 'contract/process/<name>"' ai/kit/templates` → 0 для всех семи. Пока это так, никакая правка словаря в `phase-block-format.xml` не попадёт ни в один директив, а B2-03 будет править файл, которого агент не читает. Размер — S на диагностику (гейт «каждый кирпич подключён хотя бы одним `.hbs`»), M на решение по каждому.
- **P4. Синхронизировать `templates.ts:1579` ↔ `specs/3-tasks.md:11`** (Baseline Completion Rule, не только токены). B2-15 упоминает «`specs/3-tasks.md:12` отстал от `templates.ts:1581`» — только строку токенов. Отстала и строка выше.
- **P5. Задокументировать exit 2 в `cli/cmd/sdd-check/help.ts:92`.** Код возвращается (`ERR_CLI_SDD_CHECK_UNKNOWN_ID`), в help его нет. S, ложится в B2-05.
- **P6. Согласовать поведение `--all` и `--task` на легаси-тикете** (Р2, п.3): один и тот же файл — 0 ошибок и exit 0 в `--all`, 2 ошибки и exit 1 в `--task`. S; ложится в B2-05 рядом с `SDD_NO_TICKETS_FOUND`.

### `.hbs` и `check:directives-fresh` — B2 права, но формулировку надо усилить

Проверено: `ai/directives/**` — build-output от `ai/kit/build-directives.ts`; гейт свежести существует (`package.json:43` → `ai/kit/check-directives-fresh.ts`, в цепочке `audit:sdd-templates`, `package.json:48`); источники — `ai/kit/templates/sdd-v2/**.hbs` **плюс** партиалы `ai/kit/{axiom,contract,pattern,anti-pattern,definition,hook}/**` (подключение вида `{{> "axiom/audit/ax-audit-reads-code"}}`, `{{> "contract/process/question-format"}}`).

Отсюда: списки файлов в B2-03, B2-08, B2-11 перечисляют **выходы** (`ai/directives/sdd-v2/formats/project-tasks-index.xml:19`, `formats/task-ticket-structure.xml:141`, `scaffold.directive.xml:286`, `STEP_1_MECHANICAL.xml:108-110`, `STEP_2_SEMANTIC.xml:131`) наравне с источниками. Править их напрямую — ровно тот сценарий, ради которого `check-directives-fresh.ts` написан (его шапка описывает именно этот инцидент). Надо переписать в форме «источник → выход»: например `ai/kit/templates/sdd-v2/formats/project-tasks-index.hbs` → `ai/directives/sdd-v2/formats/project-tasks-index.xml`, `ai/kit/axiom/audit/ax-execution-log-verification.xml` (партиал, сам источник) → `audit.directive.xml`.

### Оценки объёма — согласен, кроме двух

- **B2-07 (`close` требует завершённости) — не S, а M.** Вводит в `closeCurrentRound` зависимость от `parsePhaseReceipts` и от `PHASES_OVERVIEW` (которой у мигрированных тикетов нет), плюс требует решить, что делать с тикетом без читаемой Overview — сейчас `close` на нём работает, а после правки должен либо отказать, либо пропустить проверку.
- **B2-10 (миграция якорей) — не M, а L**, если включает «явный отказ при отсутствии `PHASES_OVERVIEW`»: это меняет поведение `sdd-migrate` на 50 уже мигрированных тикетах и требует инвентаризации, у скольких из них Overview уровня `###`.

### Решения оператора D1–D6 — сформулированы корректно; три уточнения

- **D1.** Вариант 1 (вернуть `ver`) уже частично оформлен в директиве: `execute.directive.xml:42` — «Diagnostics may run while fixing, but only the canonical phase command can create completion evidence; **a hand-written `ver` line is not evidence**». Это ровно D1.1 («человеческая заметка рядом с машинным receipt»), и его надо привести как аргумент, а не как новую идею. Кроме того v1 держал `ver` в словаре (`check.sh:525`, `scaffold.directive.xml:719`) — то есть D1.2 («вычистить `ver`») это регрессия относительно v1, а не «наведение порядка».
- **D2.** Вариант 3 («`— re-run:` только до закрытия») **уже частично обеспечен механикой**: на receipt-aware тикете второй блок той же фазы в Round 1 ловится как `SDD_EXECUTION_LOG_PHASE_DUPLICATE` (воспроизведено, Р4). То есть D2.3 не требует нового кода на стороне `sdd-check` для внутрираундового случая — только отказа в `sdd-log` и правки `firstRoundPhaseBlockCounts` на «текущий раунд».
- **D6 не независим от D2** (см. §Дизайн): `resolved` требует `--phase`, `--phase` требует открытого блока; значит после запрета блоков после закрытия (D2.3) вариант D6.1 («`resolved` — исключение») механически недостижим без ещё одной поблажки. Варианты надо переписать как решение по паре (D2, D6).

---

## § Правки к B2

Порядок — по цене ошибки.

### Обязательные (искажают факт)

1. **C7, v1-сторона — удалить `sdd_lib_execution_log`.** Заменить на: «v1 читал регион по жёсткому входу `/^## 7\. Execution Log/` (`check.sh:557`); якоря `<!--SECTION:EXECUTION_LOG-->` сознательно **не** использовались как делимитеры (`check.sh:554-556`, с прямой ссылкой на `cli-sync-skills.task-57.md`); в `f8d42a33` расширили только **выход** — «ANY `## ` ends the section» (`:558`)». Это делает v2 сильнее, чем B2 сейчас утверждает: v1 сам порождал ложный зелёный на тикетах, нумерующих секцию не 7-й (комментарий `:552` называет цифру — 49 непрочитанных `unknown-token`).
2. **C7/D3 — снять «как это прямо предписано `infra.directive.xml:51`».** `AX_SPEC_LIFECYCLE` говорит, что Critic Rounds **не часть спецификации**, и относится к спекам, а не к тикетам. Заменить на измеренный факт: «`## Critic Rounds` с `### Round N` несут 3 живых тикета RC — `cli-sync-skills.task-56.md`, `task-57.md`, `sdd-skills.task-61.md`; `nextRoundNumber` вернёт на них 3, 3 и 4 вместо 1».
3. **C11 — снять «токена `yagni` нет ни в одном словаре».** Добавить седьмую строку в таблицу: `ai/kit/contract/process/phase-block-format.xml:10-20` — несёт `yagni`, **не** несёт `ver`, несёт трёхполевой Handoff, и **не подключён ни одним `.hbs`**. Добавить абзац: ни один собранный директив v2 не несёт таблицу токенов; единственное собранное объявление — `templates.ts:1581` через сгенерированный `specs/3-tasks.md`. Это корень Ф3, и он сильнее нынешней формулировки «трёхсторонний дрейф».
4. **C10, п.4 — убрать `sdd-task.cmd.ts:109`.** `groupReceiptIssue` в `sdd-task.cmd.ts` не импортируется и не вызывается; `:109` — это `pickableTasks(refs)`. Правильная формулировка: «`sdd-task --audit-group` (`sdd-task.cmd.ts:239-241` → `shared/sdd/audit-group.ts`) отвечает «все ли члены `[x] DONE`», а не «есть ли валидный `SDD_AUDIT_RECEIPT`» (`grep receipt shared/sdd/audit-group.ts` → 0); `pickableTasks` (`check.ts:1349-1364`) смотрит только Meta `Status` и `Dependencies`».
5. **C6 — заменить «Нет ничего» на измеренное.** «На receipt-aware тикете блок фазы, открытый после `#### Round close`, ловится как `SDD_EXECUTION_LOG_PHASE_DUPLICATE`/`_PHASE_ORPHAN`, а фиктивное закрытие — как `SDD_DONE_PHASE_UNCHECKED` (воспроизведено). Не ловится: событийная строка после закрытия — и всё перечисленное на не-receipt-aware тикете, то есть на всём корпусе RC».
6. **C3 — «14 расширений» → «15»** (в заголовке C3 и в Сводке); сама B2 перечисляет 15.
7. **C4 — счётчики тестов:** `check.test.ts` — **40 it** (не 44), `check-phases.test.ts` — **11 it** (не 12).
8. **D6 — счётчики местами:** `SDD_BROKEN_SPEC_REF` = 6, `SDD_BROKEN_SPEC_ANCHOR` = 11.

### Сдвинутые ссылки (WRONG-LINE, 10)

| где в B2 | сказано | фактически |
|---|---|---|
| C6 | `sdd-log.cmd.ts:405` (вставка в `bounds.closeLine`) | `:420` (`:405` — вывод `complete`) |
| C6 | `sdd-log.cmd.ts:504-506` (вставка) | `:509-510` |
| C9, Сводка | `audit.directive.xml:184` (`RULE_FILE_INCOMPLETE`) | `:188` (`:184` — `EXECUTION_LOG_INCOMPLETE`) |
| C9 | `check.sh:664` (`rule_findings=`) | `:663` |
| C10 | `group-receipt.ts:297` (`severity: 'warn'`) | `:316` |
| C10 | `group-receipt.ts:299` (гейт `every`) | `:298` |
| C10 | `group-receipt.ts:150` (отказ, не все DONE) | `:149` |
| C12 | `execute.directive.xml:55-58` (`AX_VERIFICATION_BEFORE_HANDOFF`) | `:39-40` (`:57` — `AX_GROUP_AUDIT_LEAVES_A_RECEIPT`) |
| D4 | `audit.directive.xml:169-199` (`AX_FINDING_ROUTING`) | `:173-201` |
| D8 | `ticket.ts:201` / `:202` | `:202` (щит) / `:203` (позиционный разбор) |

Мелкие (можно не править, но лучше): `check.ts:219-241`/`249-284` → функции на `:219`/`:249`; `group-receipt.ts:63-67` → `:64-68`; `tasks-append-only.ts:33-51` → `:35-51`; `sdd-check.cmd.ts:504` → `:503`; `sdd-log.cmd.ts:61-74` → `:62-74`; `sdd-log.types.ts:314-330` → `:319-323`.

### Усиления (факты, которых нет, а они меняют выводы)

9. **В C10 и §2.7 — четыре копии необеспеченного обещания**, не одна: `ax-audit-hook.xml` («TICKETS OF OTHER SPECS … stay blocked»), `templates.ts:1583`, `formats/project-tasks-index.xml:20`, и (для Baseline Completion Rule) `templates.ts:1579` + `project-tasks-index.xml:18`. Последние две попадают в каждый сгенерированный `specs/3-tasks.md` — то есть проект получает конвенцию, которую `sdd-log close` нарушает первым же вызовом.
10. **В §3.9 добавить риск 7: включение маркера даёт ложный `SDD_EXECUTION_LOG_ROUND_MISSING`** на любом тикете, чей раунд не `Round 1` (DA-lazy-asm: единственный раунд — `### Round 2`, стр. 607). Воспроизведено. Правку «первый раунд → текущий раунд» надо внести в B2-01/B2-04, иначе D4.2 и D4.3 нереализуемы, а D5.3 включит ложную находку.
11. **В C7/§2.4 — `memberRoundCount` тоже полнофайловый** при `log.status !== 'ok'` (`group-receipt.ts:65-66`). Значит подпись группового receipt на legacy-члене завязана на то же число, что ломает `nextRoundNumber`; асимметрия уже, чем сказано, а связка B2-02 ↔ B2-01 обязательнее.
12. **В C12/§2.3 — четвёртый и пятый гейты охвата**: `phase-receipt-check.ts:53` (`overview.status !== 'ok'` ⇒ пусто) и `:61` (`!phase.status.includes('[x]')` ⇒ пропуск). Второй объясняет, почему обход `line "DONE"` **не** даёт `SDD_PHASE_RECEIPT_MISSING`.
13. **В D8/B2-08 — третье противоречие `ax-reopen-format.xml`:** «Set ticket Meta Status → `[ ] TODO`» против `sdd-log round` → `[~] IN_PROGRESS` (`sdd-log.cmd.ts:479`).
14. **В D8 — 5-колоночная Overview ломает КАЖДУЮ строку, не только заголовок**: `Phase P3 depends on unknown phase [ ]` (Р5). И `complete` отказал бы вторично на `overviewCells[4]` = `Target Files`.
15. **В D1 — привести `execute.directive.xml:42`** («a hand-written `ver` line is not evidence») и v1-й факт, что `ver` был в словаре (`check.sh:525`, `scaffold.directive.xml:719`): D1.2 — регрессия относительно v1, а не уборка.
16. **В §2.7 — уточнить про словарь:** закрытость словаря как **норма** жива (`ax-execution-log-verification.xml`: «Line with a token outside the vocabulary → `EXECUTION_LOG_INCOMPLETE` (MINOR)»); пропала **проверка**. Сейчас читается как будто v2 отменил норму.
17. **В §2.1/§3.5 — назвать два примитива записи:** `writeProvenRepoFile` (`shared/common/repo-file-identity.ts:136`, владелец `sdd-log`) и приватный `atomicTicketWrite` (`cli/cmd/sdd-verify/phase-run.ts:73`, владелец `sdd-verify`). §3 их не трогает (заменяется только разбор) — сказать это прямо, чтобы не выглядело недосмотром; и отметить, что B2-07 вводит в `close` новую зависимость от `parsePhaseReceipts`.
18. **В §2.3 — добавить `SDD_CONSUMERS_SCAN_FAILED`** (fail-closed напарник `SDD_CONSUMERS_UNRESOLVED`).
19. **В §3.3/B2-03 — живой токен `correction:` с двоеточием** (2 применения); предлагаемая грамматика без двоеточия не разберёт существующие строки.
20. **В §4.2 — D2 и D6 объединить в одно решение по паре**: `resolved` требует `--phase`, `--phase` требует открытого блока, значит D2.3 делает D6.1 механически недостижимым.

### Пропущенные задачи — добавить в §4.1

- **P1** проставление `<!--PHASE_RECEIPTS:v1-->` + правка «первый раунд → текущий» + учёт `every(memberIsReceiptAware)` — **M**, наивысший приоритет (см. steelman).
- **P2** обновление `specs/cli/sdd-log/sdd-log.spec.md` (уже отстала: 8 режимов в `:25` и 6 в `:119` против 11 в коде) и `specs/cli/sdd-check/sdd-check.spec.md` (38 кодов) — **M**, блокирующее по правилам самого v2.
- **P3** подключение или удаление 7 неподключённых кирпичей `ai/kit/contract/process/` (`phase-block-format`, `blocker-format`, `orchestrator-progress-format`, `phase-progress-format`, `return-summary-format`, `side-dive-format`, `trace-header-format`) + гейт «каждый кирпич подключён» — **S/M**.
- **P4** синхронизация Baseline Completion Rule `templates.ts:1579` ↔ `specs/3-tasks.md:11` (в B2-15 сейчас только строка токенов) — **S**.
- **P5** exit 2 в `cli/cmd/sdd-check/help.ts:92` — **S**, в B2-05.
- **P6** согласование `--all` и `--task` на легаси-тикете (0 ошибок/exit 0 против 2 ошибок/exit 1 на одном файле) — **S**, в B2-05.

### Правки зависимостей §4.1

- Снять «B2-01 … на который опираются 02–05»: **B2-03 и B2-05 от B2-01 не зависят** и могут идти первыми.
- **B2-02 слить с B2-01** (или пометить «один коммит») и добавить в её файлы `shared/sdd/group-receipt.ts:64-68`.
- Переоценить **B2-07 → M**, **B2-10 → L**.
- Дописать рекомендуемый порядок: D4/P1 → B2-07 → B2-04 → B2-02 → D1+B2-03 → B2-01 → B2-06.

---

### Приложение: где лежат мои прогоны

```
scratchpad/Vb2/empty/        фикстура «портал без тикетов»           → r-empty.txt
scratchpad/Vb2/bare/         пустой каталог                          → r-bare.txt
scratchpad/Vb2/mig/          Round 1 в логе + Critic Rounds/Round 7  (Ф5)
scratchpad/Vb2/forge/        канонический скелет + маркер            (Ф4 + sdd-check)
scratchpad/Vb2/legacy/       tasks/ib/ib.IB-001.md, путевой v1-ID     (C2)
scratchpad/Vb2/reopen/       5-колоночная Overview из ax-reopen-format (D8)
scratchpad/Vb2/t-sddlog.txt  63/63
scratchpad/Vb2/t-shared.txt  160/160
scratchpad/Vb2/t-cmd.txt     183/183
scratchpad/Vb2/rc-all.txt    sdd-check --all . → 198 error / 431 warn / 212 files
scratchpad/Vb2/codes-ts.txt  156 уникальных SDD_* кодов в shared/ + cli/
```
