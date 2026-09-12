ВЕРИФИКАЦИЯ (независимая, свежие глаза) — Пачка 1 «Синк больше не удаляет файлы проекта»

Роль: `plan-verifier`. Только чтение проверяемого дерева; единственный записанный файл — этот. Подагенты не запускались.
Объект: дерево `rc-v6`, ветка `lead/sync-no-loss`, 6 коммитов поверх `origin/codex/sdd-v2-rc52-followup` (`2acbe682`).
Проверено: `git -C rc-v6 log --oneline -7` → `ea399ec6`, `823bc840`, `e913d14d`, `b3f927c1`, `5678c307`, `c012e511`, `2acbe682`; `git status --porcelain` пуст; ветка = `lead/sync-no-loss`. ПОДТВЕРЖДЕНО.
Отчёты: `_raw/reports/R-SO-2-SO-2b.md`, `R-SO-7.md`, `R-SO-11.md`, `R-SO-4.md`, `R-SO-6.md`, `R-SO-9.md`, сводный `R-BATCH-01-sync-no-loss.md`.

**Итог одной строкой:** код пачки корректен и безопасен, все регрессионные числа воспроизведены мной один в один, но **описание пачки (заголовок и §1/§6 сводного отчёта) обещает больше, чем сделано** — `gennady sync` по-прежнему удаляет проектные файлы, и я это воспроизвёл на живом временном проекте. Одна блокирующая правка текста, четыре неблокирующих.

---

## A. Полнота: дифф против таблиц файлов

`git -C rc-v6 diff --stat 2acbe682..ea399ec6` → 15 файлов, `+1275 −152`. Совпадает со сводным отчётом §2 («Итого: 15 файлов, +1275/−152») дословно. ПОДТВЕРЖДЕНО.

Покрытие таблицами: 9 не-тестовых файлов — 9 строк таблицы сводного отчёта; 6 тестовых (из них 2 новых: `sync-core-partial-read.test.ts`, `sync-skills-core-partial-read.test.ts`) — одна агрегированная строка «6 тестовых файлов … включая 2 новых». Пересчитано скриптом: 9 + 6 = 15. ПОДТВЕРЖДЕНО.

Покоммитно каждый файл диффа имеет строку в таблице своего отчёта: `c012e511` 4/4, `5678c307` 4/4, `b3f927c1` 3/3, `e913d14d` 4/4, `823bc840` 2/2, `ea399ec6` 5/5. ПОДТВЕРЖДЕНО.

**D-56 (`knowledge.xml` / `PROJECT_OWNED_ENTRIES` не тронуты):** `git diff --name-only 2acbe682..ea399ec6 | grep -iE 'knowledge|directives'` → пусто; `git diff 2acbe682..ea399ec6 | grep PROJECT_OWNED_ENTRIES` → пусто. ПОДТВЕРЖДЕНО.

**Зона пачки 2 не тронута:** `grep -E 'publish|vite.config|npmignore|package.json|package-lock'` по списку файлов → пусто. ПОДТВЕРЖДЕНО.

**Неблокирующее Н-1 (числа в блоках `git diff --stat` пяти отчётов не воспроизводятся).** Отчёты подают эти блоки как фактический вывод команды. Итоговые строки («N files changed, +X, −Y») совпадают везде, но по-файловые счётчики расходятся в пяти отчётах из шести (в `R-SO-2-SO-2b` — совпадают точно):
- `R-SO-7`: заявлено 110/65/101/95 → фактически 122/51/124/74;
- `R-SO-11`: 18/51/27 → 15/61/28;
- `R-SO-4`: 78/66/2/4 → 78/93/2/5;
- `R-SO-6`: 27/19 → 28/18;
- `R-SO-9`: 2/62/21/2/12 → 2/64/42/56/17.
Смысловые таблицы при этом верны: я проверил самое крупное расхождение — `specs/cli/cli.spec.md` в `ea399ec6` (заявлено «2», фактически 56) — это переливка ширины markdown-таблицы prettier из-за одной удлинившейся ячейки; содержательно изменена ровно одна строка `FR-SYNC-19`. ОПРОВЕРГНУТО как «фактический вывод», ПОДТВЕРЖДЕНО как смысл. Правка: пересобрать блоки командой либо снять с них подпись «фактический вывод».

---

## B. Существо по каждой задаче

### SO-2 — манифест единственный источник «что поставили мы»
`sync-skills-core.ts:639` — `const owned = previousManifest ?? adoptPackageInstalled(installedNames ?? [], shippedNames)`; `:640` — `orphansToDelete = orphanCandidates.filter((n) => owned.has(n))`. Состояние «до» проверено: `git show 2acbe682:cli/cmd/sync-skills/sync-skills-core.ts` — `orphansToDelete = filterSkillNames ? … : targetSkillNames`, без сверки владения. Инвариант брифа 3/5 («никогда не удалять по дельте source-vs-target без сверки с манифестом») выполнен. ПОДТВЕРЖДЕНО.
Усыновление при первом sync: `adoptPackageInstalled:130` берёт только имена, которые пакет поставляет сейчас (`shippedNames` из `listAvailableSkillNames`, не из отфильтрованного `sourceSkills`) — на нефильтрованном первом прогоне пересечение «кандидаты в орфаны» × «усыновлённые» пусто, на фильтрованном — тоже. Проверено эмпирически (см. §C, консьюмер 1: `0 deleted`). ПОДТВЕРЖДЕНО.

### SO-2b — внутри скилла удаляются только ранее поставленные имена
`:618-629`: цикл по остатку `targetFiles` гейтуется `isFileOwned(previousManifest, …)` (`:173`), где `previousManifest` прочитан ДО прогона (`:583`) — не тот манифест, который пишется в конце (`:653`). Ключевой инвариант («гейт читает манифест “до”») верен по коду. ПОДТВЕРЖДЕНО.
Сверка с main: `git show d37d5910:cli/cmd/sync-skills/sync-skills-core.ts` — в main внутрискиллового удаления **нет вовсе** (`targetFiles` используется только для сравнения). Утверждение отчёта «новый уровень детализации манифеста, которого не было даже в main» — ПОДТВЕРЖДЕНО. Следствие для протокола: RC даже после SO-2b остаётся агрессивнее main (удаляет манифестированные файлы внутри поддерживаемого скилла, чего main не делает никогда) — это осознанное сохранение зеркальной семантики, но в отчётах не названо.
Остаточный путь потери (наследован из main, владелец — SO-3): `deleteOrphan:470` делает `_rmdir(orphanDir, {recursive: true})` — проектный файл внутри **манифестированного, но выпавшего из пакета** скилла уничтожается вместе с каталогом. В main то же (`_rm(orphanDir, {recursive:true, force:true})`). Не регресс пачки; в отчётах не упомянуто (Н-2).

### SO-7 — частичное чтение не удаляет и печатает предупреждение
`sync-core.ts`: `collectRecursive` пишет упавший префикс в аккумулятор; `scanDirectivesChecked:88`; гейт `isUnderIncompletePrefix:126` вызван в цикле удаления (`:294`); предупреждение `:288-289` — `source could not be fully read, skipping deletion under: <prefix>`. Дополнительно проверил fail-safe для корня: `prefix === ''` блокирует всё удаление. Состояние «до»: `git show 2acbe682:cli/cmd/sync/sync-core.ts` — `catch { return }` без различения. ПОДТВЕРЖДЕНО (и «не удалять», и «не молчать»).
`sync-skills-core.ts`: `scanSkillsChecked:247` → `incompleteSkills`; гейт `:619`. Гранулярность — целый скилл, канала `warnings` у `SyncSkillsResult` нет, поэтому «не молчать» для скиллов не реализовано. Оба отклонения **раскрыты** самим `R-SO-7` §4 пп.1-2 с обоснованием, направление отклонения — консервативное (не удалять). ПОДТВЕРЖДЕНО как раскрытое отклонение, не как выполнение инварианта в полном объёме.
**Неблокирующее Н-3 (порядок SO-1 → SO-7 нарушен, нигде не отмечено).** Бриф 4/5 прямо требует: «порядок: `sync-core.ts` правят SO-1 и SO-7; SO-7 идёт ПОСЛЕ SO-1, отдельным коммитом». SO-1 приостановлена D-56, батч утверждён D-58 «без SO-1», то есть SO-7 легитимно вышла первой — но ни `R-SO-7`, ни сводный отчёт этого не сверяют с брифом. Практическое следствие для будущей SO-1: её правка `sync-core.ts` ложится поверх `scanDirectivesChecked`/`isUnderIncompletePrefix`. Правка: одна строка в §6 сводного отчёта.

### SO-11 — `SDD_RULE_FILE_MISSING` как warning, exit-код не меняется, имя единственное
`shared/sdd/check.ts:2751` — `checkRuleRegistryFilesExist`, `severity: 'warn' as const`, один `Finding` на висячую запись. `grep -rn SDD_RULE_FILE_MISSING` по дереву (без `node_modules`/`dist`) → 3 вхождения, все в `check.ts` + `check.test.ts`; `grep SDD_RULES_REGISTRY_DANGLING` → пусто (инвариант «имя кода единственное», бриф 5/5 и `61 §2.1`). ПОДТВЕРЖДЕНО.
Exit-код: `cli/cmd/sdd-check/sdd-check.types.ts:117` — `errors = findings.filter((f) => f.severity === 'error').length`, `ok = errors === 0`; warn в код выхода не входит. Эмпирически: `sdd-check --all` = те же 198/431, `gate:sdd-check-baseline` exit 0. ПОДТВЕРЖДЕНО.
Отклонение «проверяется только проектный реестр, пакетный fallback — нет» раскрыто в `R-SO-11` §4 п.1 и обосновано (разные пространства путей). ПОДТВЕРЖДЕНО как раскрытое.

### SO-4 — dry-run честно печатает, что будет удалено
Код: `sync-skills-formatter.ts` — единая ветка тела группы, особый случай только `isWholeSkillDeletion` (sentinel `relativePath:''`); сводка `:144-146`. Проверено живым прогоном (§C, консьюмер 2): dry-run печатает `ghost-file.md (would delete)` внутри выжившего `sdd-execute` **и** `- ghost-skill/ (would delete)`; реальный прогон удаляет ровно их, `local-helper.sh` остаётся. ПОДТВЕРЖДЕНО.
**Неблокирующее Н-4 (утверждение «те же счётчики, что и реальный прогон» ОПРОВЕРГНУТО).** Сводный отчёт §2 и `R-SO-4` §1 утверждают, что dry-run-сводка несёт те же числа, что реальная; `sync-skills.spec.md` после правки говорит то же («несёт те же счётчики, что и реальная сводка»). Репро на консьюмере 2:
```
dry-run:  Would sync: 12 added, 1 updated, 0 skipped, 3 deleted. Dry-run: no files written.
реально:  Synced:     12 added, 1 updated, 0 skipped, 2 deleted
```
Причина — `deleteOrphan` в dry-run отдаёт sentinel + запись на каждый файл орфана, а в реальном прогоне только sentinel; формула одна, значения разные при удалении целого скилла. Направление безопасное (превью завышает потерю), сам SO-4 этого не ломал, но формулировка ложна ровно в том классе, который задача чинит. Правка: в спеке и в PR писать «те же поля/формулу», а `deleted` в dry-run назвать числом файлов, не операций.

### SO-6 — тестовые артефакты скилла не уезжают
`EXCLUDED_NAMES = new Set(['.DS_Store','__tests__'])` (`:22`), `isTestArtifact:32` (`/\.(test|spec)\.[cm]?[jt]sx?$/`), применена в файловой ветке `collectSkillFiles:323`. В main — тот же набор и тот же регекс, но фильтр стоит на входе цикла (`main:272`), то есть каталог с именем вида `x.test.ts` в main тоже отсекается, в RC — нет; расхождение мнимое (каталогов с такими именами нет), и `R-SO-6` его прямо называет. Два портированных теста сверены с main **побайтово** (`sed -n '151,176p'` main против `sed -n '129,154p'` RC — идентичны, включая содержимое фикстур и импорт `../../../../../shared/thing.ts`). ПОДТВЕРЖДЕНО.
Эмпирически: после двух прогонов на консьюмере 1 `find .claude/skills -name '__tests__' -o -name '*.test.ts' -o -name '*.spec.*'` → пусто. ПОДТВЕРЖДЕНО.

### SO-9 — `sync-skills` не делает полный `sync` без `--with-directives`
Код: `sync-skills.cmd.ts` — схема `parseArgs` `withDirectives: ['with-directives']`, `withDirectives = args.withDirectives === true || === 'true'`, вызов `syncDirectivesFirst` обёрнут в `if (withDirectives)`. ПОДТВЕРЖДЕНО.
Существующие потребители/e2e: ни один тест не удалён — `git diff … | grep '^-\s*it('` даёт 4 строки, и для всех четырёх найдены переименованные аналоги (`--with-directives syncs directives before skills…`, `--with-directives surfaces directive-mirror warnings…`, `--with-directives --dry-run previews directives block too…`, `dry-run summary line carries counts…`). Добавлено 31 `it(`. e2e-субстринг `Dry-run: no files written` цел — фраза сохранена суффиксом; `cli/__tests__/e2e/sync.e2e.test.ts` + `sync-skills.e2e.test.ts` → 2/2 pass. ПОДТВЕРЖДЕНО.
Документация/спека обновлены: `help.cmd.ts` (текст сверен с фактическим `--help`), `D-M008` переписан целиком с сохранением прежней редакции как отклонённой, mermaid-ребро `D-M008: --with-directives (opt-in, SO-9)`, `FR-SYNC-19` уточнён. ПОДТВЕРЖДЕНО.
Отклонение от приёмки: доска и трек §4.1 требуют **e2e** «`sync-skills <name>` does not mirror-delete directives»; реализовано как интеграционный тест уровня cmd (`sync-skills.cmd.test.ts:447`), файла в `cli/__tests__/e2e/` не добавлено. Поведение я проверил сам на живом проекте (§C) — существо приёмки выполнено, форма — нет. НЕ ПРОВЕРЯЕМО по букве / ПОДТВЕРЖДЕНО по существу.

### Сверка портированных тестов с main построчно
Инвентарь `it(`/`describe(` в `sync-skills-core.test.ts` сопоставлен со main-версией (`git show d37d5910:…`). Все манифест-тесты main перенесены, **кроме одного**: `main:627` `it('lifecycle — install, filtered sync, package removal, retry after a failed prune')`.
**Неблокирующее Н-5.** Приёмка брифа 3/5 и доски — «порт `sync-skills-core.test.ts:377,391,538-627`»; строка 627 — это и есть начало пропущенного теста. `R-SO-2-SO-2b` перечисляет 7 портированных тестов и заявляет диапазон «~main:490-657», то есть претендует на весь диапазон, включая 627 — заявка шире факта. Тест содержателен: четыре последовательных прогона (установка → фильтрованный синк → выпадение скилла из пакета → отказ удаления → повтор) и финальная проверка `existsSync(_targetDir/our-own-skill/SKILL.md)` — самый сильный одиночный регресс-тест на SO-2. Инфраструктура для него в RC уже есть (`manifestNames()`, `installed()`, `refuse()` — `sync-skills-core.test.ts:404-446`); нужен лишь фильтр записей со слэшем в ожиданиях. Правка: либо портировать, либо назвать пропуск и причину. Отсутствие `describe('scanSkillRoots')` (multi-root) — раскрыто и обосновано, претензий нет.

---

## C. Регрессии — все числа перезапущены мной

| Проверка | Заявлено | Мой прогон | Вердикт |
|---|---|---|---|
| `npm --prefix rc-v6 test` | tests 3593 / pass 3583 / fail 0 / skipped 10 | tests 3593, suites 602, pass 3583, fail 0, cancelled 0, skipped 10, duration 43.9s | ПОДТВЕРЖДЕНО |
| `npm --prefix rc-v6 run check` | `ALL PASS (5/5)` | `ALL PASS (5/5)`: type-check 5.4s, test:coverage 54.1s, lint 3.1s, format 2.0s, yagni 0.8s; exit 0 | ПОДТВЕРЖДЕНО |
| `npm run build` | `✓ built` | `✓ built in 3.19s`, exit 0 | ПОДТВЕРЖДЕНО |
| `sdd-check --all` | 198 error / 431 warn | `grep -c ': error:'` → 198, `grep -c ': warn:'` → 431 | ПОДТВЕРЖДЕНО |
| `gate:sdd-check-baseline` | exit 0 | `OK — no error outside the baseline (baseline commit 227c03a8…, tag rc-baseline-1)`, exit 0 | ПОДТВЕРЖДЕНО |
| Флакость `cancelled N` | разовая, среда | у меня `cancelled 0` в обоих прогонах (`test` и `test:coverage`) | НЕ ВОСПРОИЗВЕЛОСЬ (согласуется с версией «среда/REL-15») |

Целевые сьюты: `cli/cmd/sync/__tests__/*.test.ts` + `cli/cmd/sync-skills/__tests__/*.test.ts` → **139/139 pass, 32 suites, fail 0**. e2e `sync.e2e.test.ts` + `sync-skills.e2e.test.ts` → **2/2 pass**. Тег `rc-baseline-1^{commit}` = `227c03a8…` — совпадает с заявленным.

### Живые прогоны на временных проектах (мой сценарий, не из отчётов)
Три временных «потребителя» с симлинком `node_modules/gennady → rc-v6`, реальный `dist/gennady.js`.

**Консьюмер 1 — первый sync у проекта с проектным скиллом и проектными файлами внутри поддерживаемого скилла.** До: `generate-codeowners/SKILL.md` (проектный скилл), `sdd-execute/{PROJECT-NOTES.md, local-helper.sh, SKILL.md}`, `ai/directives/{knowledge.xml, coding/swift-rules.xml}`.
- `sync-skills --dry-run` → `Would sync: 12 added, 1 updated, 0 skipped, 0 deleted`; дерево байт-в-байт то же.
- `sync-skills` (реально) → `Synced: 12 added, 1 updated, 0 skipped, 0 deleted`. Все четыре проектных файла целы. Манифест `.gennady-synced` записан (25 записей: skill-level + file-level).
- Второй прогон — проектные файлы снова целы. `ai/directives/` не тронут (SO-9). Ни одного `__tests__`/`*.test.*` в цели (SO-6).
**Главный инвариант пачки на живом дереве — ПОДТВЕРЖДЕНО.**

**Консьюмер 2 — манифест уже есть (`ghost-skill`, `sdd-execute/ghost-file.md`), плюс непроманифестированный `local-helper.sh`.**
- dry-run: `ghost-file.md (would delete)`, `- ghost-skill/ (would delete)`, `3 deleted`; дерево не изменилось.
- реально: `2 deleted`; `ghost-skill/` снесён, `ghost-file.md` удалён, `local-helper.sh` и `SKILL.md` целы.
- `sync-skills sdd-execute` (узкий вызов): `ai/directives/` не тронут — буквальный сценарий приёмки SO-9. ПОДТВЕРЖДЕНО.
- `sync-skills --with-directives --dry-run`: директивный блок появляется и показывает `- coding/swift-rules.xml (would delete)`, `~ knowledge.xml (would update)` — прежнее разрушительное поведение сохранено ровно за флагом, как и заявлено.
Расхождение счётчиков 3 vs 2 — источник Н-4.

**Консьюмер 3 — `gennady sync` (директивы), проверка объёма заголовка пачки.** До: `knowledge.xml` (проектный реестр из 1 правила), `coding/swift-rules.xml`, `sdd-v2/local-project.xml`.
```
$ node dist/gennady.js sync
Synced: 103 added, 1 updated, 0 skipped (unchanged), 2 deleted
после: knowledge.xml — ПЕРЕЗАПИСАН пакетным (<AiKnowledge ver="2.0">…)
       coding/swift-rules.xml — УДАЛЁН
       sdd-v2/local-project.xml — УДАЛЁН
```
**Это блокирующая находка по тексту (Б-1), см. ниже.**

---

## D. Сводный отчёт как черновик описания PR

Понятность без кодов: §1 и §2 читаются без знания идентификаторов, каждый дефект — одно предложение, таблица «файл → смысл» на месте и покрывает все 15 файлов. ПОДТВЕРЖДЕНО.
Mermaid «было»: все четыре красных узла сверены с `2acbe682` (`orphansToDelete` без владения; безусловное внутрискилловое `deps.unlink`; `catch { return }` в `collectRecursive`; безусловный `syncDirectivesFirst`). ПОДТВЕРЖДЕНО.
Mermaid «стало»: `A2` (`--with-directives`) `sync-skills.cmd.ts` if-ветка; `A4` `:640`; `A6` `:620`; `A4b` `:619` и `sync-core.ts:294`; `A9` — статусы верны, но подпись «счётчики как в реальном прогоне» ложна (Н-4). ПОДТВЕРЖДЕНО кроме `A9`.
Раздел «Предыстория» (§5): все SHA существуют и заголовки совпадают — `d2aaf2a3` (freeze RC snapshot), `48538019` (versioned sdd-check baseline + zero-new-error gate), `85d2fed1` и `d53a56f4` (pre-push), `ecac032a` и `2acbe682` (golden sdd-verify), main `9663c65b` (`ci: remove non-working GitHub workflow`). Также сверены источники переноса: main `d37d5910` (`chore(release): v0.9.0-next.4`), `62172906` (`fix(sdd): harden tooling portability and safe skill sync (#10)`). ПОДТВЕРЖДЕНО, 4 задачи и 6 SHA + main-SHA — верны.

**БЛОКИРУЮЩЕЕ Б-1 — заголовок и §1/§6 обещают больше сделанного.** Пачка называется «Синк больше не удаляет файлы проекта», §1 открывается «Это два открытых issue … (#9.4 …, #24 …)» и «Пачка закрывает потерю данных четырьмя независимыми механизмами защиты». По `20-ISSUES-VERDICTS.md` #24 требует трёх вещей, и первая с третьей (`PROJECT_OWNED_ENTRIES`/`preserved`; зеркальное удаление директив только по манифесту) — это SO-1/SO-3, вне пачки; `61 §1` прямо пишет, что владелец `ISS-13` — SO-1 **+** SO-7 **+** SO-11. Фактически (консьюмер 3) `gennady sync` до сих пор удаляет `coding/swift-rules.xml` и `sdd-v2/local-project.xml` и перезаписывает проектный `knowledge.xml` — тот самый кейс cloud-ios из #24. §6 признаёт только перезапись реестра («реестр по-прежнему перезаписывается»), но **не** удаление файлов правил и проектного overlay внутри пакетных подкаталогов. Отдельно усугубляет то, что SO-9 теперь адресно направляет оператора в этот путь: `--help` — «run `sync` on its own for that», `D-M008` — «Рекомендуемая практика … `gennady sync && gennady sync-skills`».
Правка (обязательна до открытия PR, только текст, кода не касается): переименовать пачку в «`sync-skills` больше не удаляет файлы проекта» (или добавить «часть 1: скилы»); в §1 сказать, что #9.4 закрывается полностью, а #24 — частично (SO-7 + SO-11 из трёх владельцев, SO-1 приостановлена D-56); в §6 добавить воспроизведённый факт про `gennady sync` (2 удалённых проектных файла + перезаписанный реестр) и оговорку к рекомендации в `--help`/`D-M008`.

---

## Итог

**Блокирующее (1):**
- **Б-1** — заголовок пачки и §1/§6 сводного отчёта переоценивают объём: `gennady sync` по-прежнему удаляет проектные файлы правил и overlay и перезаписывает проектный `knowledge.xml` (воспроизведено: `Synced: … 2 deleted`, оба файла GONE), #24 закрыт частично, а новый текст `--help`/`D-M008` направляет оператора именно в эту команду. Правка текстовая, кода не требует.

**Неблокирующее (5):**
- **Н-1** — по-файловые числа в блоках `git diff --stat` пяти отчётов не воспроизводятся (итоги и смысл верны).
- **Н-2** — не назван остаточный путь потери: `deleteOrphan` рекурсивно сносит каталог манифестированного, но выпавшего из пакета скилла вместе с проектными файлами внутри (наследовано из main, владелец SO-3).
- **Н-3** — нарушение порядка «SO-7 после SO-1» из брифа 4/5 легитимно (D-58 «без SO-1»), но нигде не сверено; стоит одной строки в §6.
- **Н-4** — утверждение «dry-run несёт те же счётчики, что реальный прогон» ОПРОВЕРГНУТО репро (3 vs 2); та же формулировка попала в `sync-skills.spec.md`.
- **Н-5** — из портируемого диапазона `main:538-627` пропущен `it('lifecycle — install, filtered sync, package removal, retry after a failed prune')` (main:627) — сильнейший одиночный регресс-тест на SO-2; пропуск не раскрыт, инфраструктура для порта в RC уже есть.

**Подтверждено:** существо всех семи задач по коду и по живым прогонам; отсутствие правок в зоне D-56 и в зоне пачки 2; отсутствие удалённых тестов; побайтовая точность порта SO-6; единственность кода `SDD_RULE_FILE_MISSING` и его `warn`-строгость с неизменным exit-кодом; все шесть регрессионных чисел (3593/3583/0/10, 5/5, 198/431, gate exit 0) воспроизведены мной один в один; 139/139 целевых юнит-тестов и 2/2 e2e; главный инвариант «первый sync у потребителя с проектным скиллом и проектным файлом внутри поддерживаемого скилла ничего не удаляет» — подтверждён на живом временном проекте (`0 deleted`, дважды).

**Конфликты с PR #28** (`lead/release-package`, 7 коммитов от `2acbe682`, голова `f16d7f17`): после `git fetch origin lead/release-package` пересечение `git diff --name-only 2acbe682 ea399ec6` ∩ `git diff --name-only 2acbe682 FETCH_HEAD` — **пусто** (`comm -12` не дал ни строки). `package.json`/`package-lock.json` меняет только PR #28, пачка 1 их не касается — конфликта нет ни текстового, ни семантического. Смежность, не конфликт: `ai/.npmignore` из #28 держит тесты вне tarball, SO-6 держит их вне деплоя — дополняют друг друга; #28 меняет `ai/directives/sdd-v2/**`, которые после SO-9 доедут до потребителя только через отдельный `gennady sync`.

**Рекомендация: открывать PR после правок** — а именно после текстовой правки Б-1 (заголовок + §1 + §6). Код пачки правок не требует и к возврату исполнителю оснований нет; Н-1…Н-5 разумно внести тем же проходом по тексту (Н-5 — по решению Lead: порт теста или явная оговорка о пропуске).

---

## Приложение — команды этой верификации (воспроизводимо)

Дерево исполнителя не изменялось: `git -C rc-v6 status --porcelain` пуст до и после всех прогонов; единственная запись в `.git` — `git fetch origin lead/release-package` (требование проверки E). Записанный файл — только этот.

```
git -C rc-v6 log --oneline -8
git -C rc-v6 diff --stat 2acbe682..ea399ec6
for c in c012e511 5678c307 b3f927c1 e913d14d 823bc840 ea399ec6; do git -C rc-v6 diff --stat $c~1 $c; done
git -C rc-v6 diff --name-only 2acbe682..ea399ec6 | grep -iE 'knowledge|directives|publish|vite.config|npmignore|package'
git -C rc-v6 show 2acbe682:cli/cmd/sync-skills/sync-skills-core.ts   # состояние «было»
git -C rc-v6 show 2acbe682:cli/cmd/sync/sync-core.ts                 # состояние «было»
git -C ~/Developer/gennady show d37d5910:cli/cmd/sync-skills/sync-skills-core.ts        # источник переноса
git -C ~/Developer/gennady show d37d5910:cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts
npm --prefix rc-v6 test
npm --prefix rc-v6 run check
npm --prefix rc-v6 run build && node rc-v6/dist/gennady.js sdd-check --all rc-v6 | grep -c ': error:'
npm --prefix rc-v6 run gate:sdd-check-baseline
(cd rc-v6 && node --import tsx --test --experimental-test-module-mocks \
   cli/cmd/sync/__tests__/*.test.ts cli/cmd/sync-skills/__tests__/*.test.ts)
(cd rc-v6 && node --import tsx --test --experimental-test-module-mocks \
   cli/__tests__/e2e/sync.e2e.test.ts cli/__tests__/e2e/sync-skills.e2e.test.ts)
git -C rc-v6 fetch origin lead/release-package
comm -12 <(git -C rc-v6 diff --name-only 2acbe682 ea399ec6 | sort) \
         <(git -C rc-v6 diff --name-only 2acbe682 FETCH_HEAD | sort)
```

Три живых потребителя собраны скриптами `scratchpad/e2e-consumer{,2,3}.sh` (временные каталоги `consumer1..3`, симлинк `node_modules/gennady → rc-v6`, вызовы через `dist/gennady.js`): консьюмер 1 — первый sync над проектным скиллом и проектными файлами внутри поддерживаемого скилла; консьюмер 2 — sync с уже существующим манифестом (проверка SO-2b/SO-4/SO-9, включая узкий `sync-skills sdd-execute` и opt-in `--with-directives`); консьюмер 3 — `gennady sync` над проектным реестром, файлом правила и overlay (источник находки Б-1).
