# 32 — Трек SYNC-OWNERSHIP: sync, sync-skills, владение, knowledge.xml, deployed surface

> Статус: ВЕРИФИЦИРОВАНО (B3 + V-B3, правки применены). Блокеры релиза: SO-1, SO-2, SO-2b, SO-7, SO-11 (+ D-6). Ждёт решений оператора (§4).

**Как читать.** Это чистый документ: аналитика B3 (Opus) прошла независимую верификацию V-B3 (Opus, свежие глаза, ~150 цитат `file:line` перепроверены по коду плюс собственные повторные прогоны на отдельных копиях фикстур) и все найденные правки применены прямо в тексте — без отдельного «раздела ошибок». Сырые материалы обеих сессий (полный текст B3, полный текст V-B3, включая ход рассуждений и лог прогонов) лежат в `ai/drafts/research/sdd-v1-to-v2-transfer/_raw/32-TRACK-SYNC-OWNERSHIP.raw.md` — обращайтесь туда, если нужна не выжимка, а дословный след верификации по каждой цитате.

Read-only аудит. Идентификаторы, пути и строки — verbatim.

- **MAIN (v1)** = `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e` (origin/main `8bb38477`, `0.9.0-next.3`).
- **RC (v2)** = отдельный чекаут `codex/sdd-v2-rc52-followup` (`package.json.version = 0.8.4`); верификатор работал на независимой копии, HEAD `11291af5` над той же веткой — рабочее дерево чистое, тесты и код трека не тронуты между сессиями.
- Merge-base v2 ↔ main = `46c6d616`. Ни один из sync-фиксов main (`d6479748`, `62172906`, `40d209d8`, `e2b6087c`, `f66a77ee`, `7d48149d`, `f74c8c1d`, `5a237cd5`) не является предком v2.
- Учтено решение оператора **D-6** (см. `01-INTERVIEW-DECISIONS.md`): вердикты `20-ISSUES-VERDICTS.md` приняты целиком, **#9.4 и #24 — блокеры релиза v2** (в этом документе — `ISS-3` и `ISS-13`). Раздел 4 показывает, какой минимальный набор задач трека закрывает оба issue фактически, а не только по формулировке.

Ни `sync`, ни `sync-skills` не имеют флага `--target`/`--cwd` — target жёстко `process.cwd()` (`RC/cli/cmd/sync/sync.cmd.ts:75,87`; `RC/cli/cmd/sync-skills/sync-skills.cmd.ts:152,181`). Все прогоны ниже сделаны через `sh -c 'cd <fixture> && …'` на изолированных копиях в scratchpad — ни один tracked-файл (в т.ч. в `/Users/k.lebedev/Developer/messenger`) не изменён.

---

## 0. Что было реально запущено (воспроизводимо)

| Что | Результат |
|---|---|
| RC unit-тесты трека (`cli/cmd/sync/__tests__`, `cli/cmd/sync-skills/__tests__`, `shared/common/sync/__tests__`) | **140 pass / 0 fail**, 31 suite, ~450–720 ms — воспроизведено дважды, независимо, на двух разных копиях RC, с идентичным счётом |
| RC `sync --dry-run` / `sync-skills --dry-run` на синтетической фикстуре потребителя | см. §1.10 (`sync-skills` сначала печатает полный `sync` — см. §1.11-новое) |
| RC `sync-skills` **реальный** прогон на копии фикстуры | 4 удаления, из них 1 невидимое в выводе (§1.10) |
| MAIN `sync`/`sync-skills` на той же фикстуре | и через прямой вызов ядра, и через прямой запуск CLI — **оба способа дают идентичные сводки**; `node_modules` MAIN заполнен (268 пакетов, `node_modules/.bin/tsx` есть), CLI в этом чекауте запускается штатно |
| RC `sync`/`sync-skills --dry-run` на копии реального дерева `/Users/k.lebedev/Developer/messenger` | §1.11 |
| RC `sync`/`sync-skills` на дереве `git archive` из ветки akkrat (cloud-ios) | §1.11-bis, независимо воспроизведено верификатором |
| Целевой прогон на S4: `chmod 000` на один подкаталог источника (директивы и скиллы отдельно) | §1 S4 — воспроизведено с идентичными числами дважды |
| Целевой прогон на S2: CLI из клона без `node_modules/gennady` против потребителя | §1 S2 — смена вердикта, воспроизведено |
| Внедрение тестовых артефактов (`__tests__`, `*.test.ts`, `*.spec.js`) в пакетный скилл | §1 S6 — воспроизведено |

Методическая поправка: первоначальная заметка «CLI main в этом worktree не стартует» была неверна (REFUTED независимой проверкой) и снята — она не влияла ни на один вывод, потому что прямой вызов ядра и прямой запуск CLI дали одинаковые сводки.

---

## 1. Матрица инвариантов S1–S9 (+ R3–R5 в части `knowledge.xml`)

### S1 — `knowledge.xml` project-owned, статус `preserved`

**v1:** `PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])` — `MAIN/cli/cmd/sync/sync-core.ts:27`; статус `preserved` — `:239-241`; запись подавлена — `:254`; `SyncFileStatus = 'added'|'updated'|'unchanged'|'preserved'` — `MAIN/cli/cmd/sync/sync.types.ts:8`; шапка «PROJECT-OWNED …» — `MAIN/ai/directives/knowledge.xml:2-7`. Тесты: `sync-core.test.ts:223`, `:242`.

**v2:** отсутствует. `RC/cli/cmd/sync/sync.types.ts:6` — `SyncFileStatus` без `preserved`; лестница статусов `RC/cli/cmd/sync/sync-core.ts:261-268` не знает project-owned; `grep PROJECT_OWNED` по `RC/cli`, `RC/shared` = 0; `RC/ai/directives/knowledge.xml:1-2` начинается сразу с `<AiKnowledge ver="2.0">` — шапки о владении нет.

**Эмпирика:** проектный Swift-реестр → `~ knowledge.xml (would update)`; после реального прогона файл заменён пакетным TS-реестром.

**Ужесточающий факт v2:** реестр читает **сам тулинг**, не только агент. `loadRuleRegistry()` (`RC/shared/sdd/task-authoring-literals.ts:76-91`) предпочитает `<repoRoot>/ai/directives/knowledge.xml` и падает на пакетную копию только при его отсутствии; `parseRuleRegistry` (`:59-74`) отдаёт кортежи `id`/`file`. Механизм потребления уточнён верификатором: `loadRuleRegistry` вызывается только для `kind === 'task'` (`sdd-new.cmd.ts:476-478`), результат идёт в `renderTaskAuthoringLiterals` и **печатается в stdout** через `renderCreated` (`sdd-new.cmd.ts:553`) как блок «copy exactly; choose applicable rules») — т.е. тикет портит агент, копирующий подсказку, а не тул напрямую. Зато детерминированное последствие сильнее: реестр, который не парсится (пустой, дубль `id`, или **любой** `<Rule>` без `<File>` — проверено прямым вызовом), даёт `ruleRegistryInvalid` → `ERR_CLI_SDD_NEW_RULE_REGISTRY_INVALID`, `exitCode: 1` (`sdd-new.types.ts:144-151`) — **`gennady sdd-new task` перестаёт работать вообще**. Численно: `loadRuleRegistry('<messenger>')` → 19 кортежей; `loadRuleRegistry('<nonexistent>')` → 14 пакетных. После первого v2-sync первое превращается во второе.

**Вердикт: НЕ ЗАКРЫТО** (прямой регресс относительно main + усилен машинным потребителем).

### S2 — `resolvePackageDir` находит корень пакета подъёмом до `package.json` с `name === 'gennady'`

**v1:** `MAIN/shared/common/sync/sync-core.shared.ts:10-46`; checkout-e2e `registerSyncSkillsCheckoutTests()` («resolves the package from a checkout that has no node_modules/gennady»).

**v2:** `RC/shared/common/sync/sync-core.shared.ts:36-59` — три стратегии: (1) `<projectRoot>/node_modules/gennady/<subdir>`; (2) `import.meta.resolve('gennady')` + отрезание `/dist/…` (`:47`, ровно та регулярка, которую main заменил подъёмом по `package.json`); (3) `resolveSelfRepoDir` (`:15-28`) — только когда сам `projectRoot` есть репозиторий gennady. Кейс «CLI из клона/`npm link`, cwd — чужой проект без `node_modules/gennady`» не покрыт ни одной. Checkout-e2e в v2 удалён (`runFromCheckout`/`registerSyncSkillsCheckoutTests` = 0 совпадений в `RC/cli/__tests__/e2e/*`).

**Репро (переоценка вердикта верификатором):** потребитель без `node_modules/gennady`, CLI запущен из клона: **RC падает с `exit 1`** («Error: gennady package not found. Install it locally: npm i -D gennady»); **MAIN на том же входе синкает штатно, `exit 0`**, полный список. Исходный вердикт B3 «ЧАСТИЧНО (дыра, замка нет)» недооценивал факт — это не латентная дыра, а воспроизводимый функциональный регресс.

**Вердикт: НЕ ЗАКРЫТО** *(изменено с ЧАСТИЧНО по независимой верификации)*.

### S3 — объединение нескольких корней (base + `plugins/*/{directives,skills}`)

**v1:** `scanSourceRoots` — `MAIN/cli/cmd/sync/sync-core.ts:84-132`; `extraSourceDirs` — `sync.types.ts:19`; `pluginSurfaceDirs` — `MAIN/services/plugins/plugin-assets.ts:43-54`; `files[]` несёт `plugins/*/directives/**/*`, `plugins/*/skills/**/*`.

**v2:** ничего из этого нет. `RC/services/plugins/` не существует; `collectAndCompare` работает по единственному `opts.sourceDir` (`RC/cli/cmd/sync/sync-core.ts:217`); `scanSkills` — один корень (`RC/cli/cmd/sync-skills/sync-skills-core.ts:332`).

**Вердикт: НЕПРИМЕНИМО СЕЙЧАС / НЕ ЗАКРЫТО ПРИ ПОРТЕ.** Плагинного слоя в v2 нет вовсе, поэтому «объединение корней» нечего объединять. Единственный инвариант трека, который обязан вернуться вместе с портом стек-плагинов (трек VERIFY) — без него плагин не сможет поставить ни директиву, ни скилл. Подтверждено эмпирически: на MAIN-прогоне плагинные ассеты `plugins/golang/directives/infra/golang-setup.xml` и `plugins/golang/skills/sdd-infra-golang/SKILL.md` доехали до фикстуры именно этим механизмом.

### S4 — проглоченная ошибка чтения корня не должна опустошать источник и вызывать orphan-удаление

**v1:** `scanAllSkillRoots` — `MAIN/cli/cmd/sync-skills/sync-skills-core.ts:158-190`: только ENOENT/ENOTDIR и только для `index > 0` терпимы, база и EACCES/EIO — фатальны; в `sync` `statSync` обёрнут точечно (`:95-101,147-152`). Тесты: `sync-skills-core.test.ts:237,246,265`.

**v2 — дисциплина не портирована, а нарушена в новом месте (новый v2-дефект).** RC ввёл зеркальное удаление директив (`RC/cli/cmd/sync/sync-core.ts:226-244`), а источник для него собирает `collectRecursive`, где любой отказ `readdirSync` **молча даёт частичный список**: `try { entries = readdirSync(dir) } catch { return }` (`:176-182`). Частичный источник + зеркало = удаление файлов, которые пакет на самом деле поставляет. `listOwnedSubdirs` (`:108-120`) при этом всё равно объявляет подкаталог owned — ему хватает `statSync` на самом каталоге. Симметрично в `sync-skills`: `scanSkills`/`scanSkillsRecursive` глотает те же ошибки, `collectAndCompareSkills` из неполного источника выводит orphan-ов (`:396-403`).

**Репро (из аргумента — в измерение).** `chmod 000` на **один** подкаталог источника `ai/directives/testing`, потребитель — корректно синканное дерево того же пакета:

```
RC:   Synced: 0 added, 0 updated, 96 skipped, 8 deleted   → testing/: 8 → 0 файлов, exit 0, без warning
MAIN: Synced: 1 added, 1 updated, 38 skipped              → testing/: 9 → 9 файлов, exit 0, 0 удалений
```

Скилловая половина (`chmod 000` на `<pkg>/ai/skills/sdd-execute`): **RC** — `Synced: 0 added, 0 updated, 12 skipped, 1 deleted`, `sdd-execute/` потребителя опустошён (1 → 0 файлов); **MAIN** — `Synced: 1 added, 8 updated, 10 skipped, 0 deleted`, все 12 файлов целы. Оба недокопировали — удаляет только RC.

Один `chmod 000` на один подкаталог источника уничтожает восемь корректных, никем не изменённых пакетных файлов у потребителя, с нулевым кодом возврата и без единого warning — это класс инцидента `40d209d8`/`e2b6087c`, воссозданный на директивах.

**Вердикт: НЕ ЗАКРЫТО, состояние хуже v1** — самый разрушительный дефект трека.

### S5 — `sync-skills` удаляет только то, что поставил сам (манифест `.claude/skills/.gennady-synced`)

**v1:** `MANIFEST_NAME = '.gennady-synced'` — `sync-skills-core.ts:32`; `readSyncManifest:42`, `writeSyncManifest:62`, `adoptPackageInstalled:96`, `nextManifestNames:115`; применение `:581-600`. Спека `sync-skills.spec.md:5,25-29,103-113,233-234,290,378`. 10 тестов (`sync-skills-core.test.ts:377,391,538,549,563,577,592,606,617,627`).

**v2:** манифеста нет (`grep gennady-synced` по `RC/cli`, `RC/shared`, `RC/ai`, `RC/specs` = 0). orphan-ами считаются **все** каталоги target, которых нет в source: `:396-403`; удаление — `deleteOrphan:192-268` (`rmSync(path,{recursive:true,force:true})`, `sync-skills.cmd.ts:136`). RC-спека прямо легитимирует потерю: `sync-skills.spec.md:331` — «orphan-удаление деструктивно… это задокументированное поведение»; `:336-343` D-M006 «полная синхронизация (rsync `--delete`)». Тест RC фиксирует ровно это: `sync-skills-core.test.ts:244` («detects orphan skills»).

**Эмпирика:** на фикстуре — `generate-codeowners/`, `write-uitests/` удалены (кейс #9.4 = `ISS-3`). На копии messenger — удалены `lang-lint/`, `run-e2e/`, `uikit-component-generate/` (проектные) плюс `alt-opinion/` и весь v1-набор `sdd-*`.

**Вердикт: НЕ ЗАКРЫТО** (регресс относительно main; спека v2 закрепляет пред-#10 поведение как решение).

### S5-bis — файловое зеркало **внутри** поддерживаемого скилла (v2-only) — три ветки форматтера, две из них лгут

Не входит в S1–S9 (в main такого кода нет), но принадлежит треку и найдено эмпирически. **Новый дефект v2.**

Механизм: `sync-skills-core.ts:377-392` — после копирования пакетных файлов остаток `targetFiles` внутри того же скилла помечается `deleted` и удаляется (`deps.unlink!`); комментарий `:380-381` объявляет это осознанным («Existing skill directories are mirrors too»).

Форматтер (`sync-skills-formatter.ts`) ведёт себя по-разному в трёх ветках, и не просто «скрывает» — две из трёх **печатают неверную информацию**, что подтверждено репро на трёх скиллах в одном прогоне:

| Скилл | Состояние target | Что печатает `--dry-run`/реальный вывод | Что реально на диске |
|---|---|---|---|
| dominant `updated` (`SKILL.md` изменён + `local-helper.sh`) | группа `~ sdd-execute/` печатает только `SKILL.md (would update)` (`:100-110`, фильтр только `added\|updated`) | `local-helper.sh` **не назван нигде** | `local-helper.sh` **удалён**, `SKILL.md` перезаписан |
| dominant `added` (`SKILL.md` отсутствует + `PROJECT-NOTES.md`) | группа `+ sdd-check/` печатает `PROJECT-NOTES.md (would add)` **и** `SKILL.md (would add)` (`:88-94` — цикл без фильтра по статусу) | `PROJECT-NOTES.md` показан как добавляемый | `PROJECT-NOTES.md` **удалён** (не добавлен — метка **ложная**), `SKILL.md` добавлен |
| dominant `deleted` (`SKILL.md` побайтово совпал с пакетным + `local.txt`) | группа `- sdd-audit/ (would delete)` печатает **все** записи с `relativePath !== ''`, включая `unchanged` (`:111-124`) | `local.txt` и **`SKILL.md`** оба показаны как удаляемые | `local.txt` удалён, но **`SKILL.md` цел** — живой сохранённый файл объявлен удалённым, весь поддерживаемый скилл анонсирован как `- <skill>/ (would delete)` |

Утверждение исходного черновика «при `added` — тоже только свои (`:88-94`)» было **REFUTED** независимой проверкой: ветка `added` печатает удаляемую запись с меткой `(would add)` — это не молчание, а прямая ложь. `dryRun` вообще не печатает счётчики — только `'Dry-run: no files written.'` (`:147-148`), тот же паттерн в `sync-formatter.shared.ts:75` для `sync`. `--dry-run` не может служить предпросмотром ни в одной из трёх веток.

Дополнительно найдено верификацией:

- **RC-спека прямо противоречит RC-коду.** `specs/cli/sync-skills/sync-skills.spec.md:229`: «`deleted`-статус — только на уровне целого скила. Смешанные статусы… внутри одного скила невозможны.» Смешанные статусы (часть файлов `added`, часть `deleted`) в одном скилле воспроизведены во всех трёх строках таблицы выше. Это не отставшая спека — это спека, отрицающая существование самого разрушительного нового поведения.
- **Счётчик `deleted` считает записи, не файлы.** На cloud-ios (§1.11-bis) сводка говорит `22 deleted`, а с диска исчезает **25** файлов: в не-dry режиме `deleteOrphan` возвращает одну запись на orphan-скилл (`:263-269`), файлы внутри него в счёт не входят.

Эмпирика реального прогона: `.claude/skills/sdd-execute/local-helper.sh` удалён, в выводе — только `~ sdd-execute/ / SKILL.md`, итог `Synced: 12 added, 1 updated, 0 skipped, 4 deleted` (4 = 3 orphan-каталога + этот файл), имени файла нет нигде.

**Вердикт: НЕ ЗАКРЫТО (v2-only дефект).** Молчаливая и лживая потеря данных одновременно.

### S6 — тесты скилла никогда не деплоятся (`__tests__`, `*.test.*`, `*.spec.*`)

**v1:** `EXCLUDED_NAMES = new Set(['.DS_Store', '__tests__'])` — `sync-skills-core.ts:25`; `isTestArtifact` — `:128`; применение `:272`. Тесты `sync-skills-core.test.ts:151,165` + `deployed-surface.test.ts:74`.

**v2:** механизм снят: `EXCLUDED_NAMES = new Set(['.DS_Store'])` — объявление на `RC/cli/cmd/sync-skills/sync-skills-core.ts:22` (уточнено верификатором; `:21` — комментарий), применение `:84`. `isTestArtifact` отсутствует.

**Репро (не только латентно — воспроизведено).** Внедрение `__tests__/audit.test.ts`, `helper.test.ts`, `helper.spec.js` в пакетный `sdd-audit`: RC задеплоил **все три** файла в `.claude/skills/sdd-audit/`; MAIN — ни один. `RC/package.json.files` содержит `ai/**/*`, так что тестовый файл скилла уезжает и в tarball, и в `.claude/skills/` потребителя.

**Вердикт: НЕ ЗАКРЫТО** (защита удалена, замка нет, регресс подтверждён репро, не только теоретически).

### S7 — golden деплой-поверхности

**v1:** `MAIN/scripts/__tests__/deployed-surface.test.ts` + `deployed-surface.golden.txt` (80 строк); три `it`: golden-совпадение (`:47`), «ships no test file» (`:74`), «leaks no developer path into a consumer project» (`:82`, проверяет только **имена** путей, не содержимое). Обновление только через `UPDATE_SURFACE_GOLDEN=1`.

**v2:** каталога `RC/scripts/__tests__/` не существует. Никакого снимка деплой-поверхности нет.

**Эмпирика — уточнённая арифметика.** Пакет пишет **104** директивы (106 в `ai/directives` минус 2 под `architecture/`) + **13** файлов скиллов = **117** (не 118 — 105-й «файл» в исходном счёте фикстуры был уцелевшим проектным `local/ios.xml`, не частью поверхности пакета). Утечка dev-пути в **содержимом**:

```
RC/ai/directives/agent-inbox/golden-chat-output.example.md:176
**Артефакты:** [папка отчёта](/Users/k.lebedev/.gennady/agent-inbox/reports/group__proj-510) · …
```

`SYNC_PATH_RULES` правил для `/Users/<user>/.gennady/` не имеют (`path-normalizer.ts:34-95`), путь уезжает как есть в каждый проект. В MAIN тот же файл существует и чист (`grep -rl k.lebedev` по всей синкаемой поверхности main = 0).

**Утечка шире, чем в исходном черновике.** `RC/package.json.files = ["dist/**/*","README.md","ai/**/*","cli/cmd/orient/README.md"]` тащит в tarball ещё **5 файлов** с жёстко прошитыми `/Users/k.lebedev/…`, не входящих в sync-поверхность: `ai/flow-eval/RUNBOOK.ru.md:36,119`, `ai/flow-eval/scripts/roundtrip-eval.sh:19,20,27`, `ai/flow-eval/scripts/roundtrip-grade.sh:11,16`, `ai/flow-eval/scripts/migration-eval.sh:12,13,21`, `ai/flow-eval/scripts/session-metrics.py:20`. `npm pack --dry-run`: **1190 файлов** (`ai/kit` 979, `ai/flow-eval` 50, `ai/drafts` 1, `ai/directives` 106). Golden в определении main (`deployedSurface()` = только sync-поверхность) их не поймает — вся эта утечка живёт в tarball, а не в том, что попадает в `.claude/skills`/`ai/directives` потребителя. Ложноположительных нет: `ai/skills/workspace-permission-setup/SKILL.md:96-100` использует плейсхолдер `/Users/<user>/…`, как и в main.

**Вердикт: НЕ ЗАКРЫТО** (нет ни golden, ни любой другой проверки; уже есть материальная утечка — и в sync-поверхности, и в tarball).

### S8 — нормализация путей и цель установки скиллов

**v1:** `path-normalizer.ts:34-96`: `SYNC_PATH_RULES` (dev-пути → `ai/directives/`, `npx gennady`, `RULE_PLUGIN_DIRECTIVES`), `SYNC_SKILLS_PATH_RULES` дополнительно `RULE_SKILLS_TILDE`. Цель — `<cwd>/.claude/skills`.

**v2:** оба набора на месте, `RULE_SKILLS_TILDE` цел, цель по-прежнему проектная (`sync-skills.cmd.ts:181`). Отличие: `RULE_PLUGIN_DIRECTIVES` отсутствует (согласовано — плагинов нет). Пробел: правила для `/Users/<user>/.gennady/` нет → см. S7. Файл RC `path-normalizer.ts` — 95 строк (правила `:34-95`, не 96).

**Вердикт: ЧАСТИЧНО** (`RULE_PLUGIN_DIRECTIVES` — НЕПРИМЕНИМО до порта плагинов; правило dev-home отсутствует; contract-теста на `~/` и `/Users/` нет).

### S9 — тесты скилловых скриптов живут в `scripts/__tests__/`, а не под `ai/skills/**`

**v1:** `MAIN/scripts/__tests__/sdd-*.test.ts`; замок — deployed-surface.

**v2:** `RC/ai/skills/**` содержит только `SKILL.md`/`PRD_TEMPLATE.md` — в **пакете** скилловых скриптов нет вовсе (инструменты вызываются как `npx gennady sdd-*`).

**Переформулировка по итогам верификации.** «Потребность исчезла» верно только для пакета. **У потребителей она есть**: messenger `.claude/skills/sdd-execute/scripts/` = 9 файлов, cloud-ios = 11 файлов (см. §1.11, §1.11-bis) — их-то и выкашивает внутрискилловое зеркало S5-bis молча.

**Вердикт: НЕПРИМЕНИМО к пакету**, но охранная функция (S6/S7), которая защищала бы потребительские скрипты, исчезла вместе с ней.

### R3 — `knowledge.xml` как реестр правил: language-agnostic родители + PROJECT-OWNED

**v1:** шапка PROJECT-OWNED (`knowledge.xml:2-7`), 19 `Rule id`, включая `baseline-rules`, `python-rules`, `go-rules`, плюс секция `<Directives>`.

**v2:** 14 `Rule id`, все Node/TS/Svelte. Нет `baseline-rules`, `baseline-testing`, `python-rules`, `go-rules`, `result-conventions`. Секции `<Directives>` нет вовсе (единственная секция верхнего уровня — `<Rules>`), при этом `RC/ai/directives/sdd-v2/infra.directive.xml:243` называет `knowledge.xml` «the sole index (`<Rules>` section)».

**Вердикт: НЕ ЗАКРЫТО.** Реестр v2 — TypeScript-only и не project-owned; машинно читается (`loadRuleRegistry`) — Swift/Go-проект детерминированно получает пустой или чужой каскад.

### R4 — golang-директива/скилл в плагине

**v2:** `plugins/` нет, `sdd-infra-golang` нет.
**Вердикт: НЕПРИМЕНИМО** (концепта нет; вернётся вместе с S3).

### R5 — scaffold: ссылка на правило обязана резолвиться, иначе abort; не-Node scope пишет свои правила

**v1:** `MAIN/ai/directives/sdd/scaffold.directive.xml:74,95,470` (текст директивы, механического теста нет).

**v2:** аналог **сильнее**, чем в v1, и он механический: `parseRuleRegistry` (`task-authoring-literals.ts:59-74`) бросает `no complete <Rule id="…"><File>…</File></Rule> entries` при пустом реестре, при дубле `id` (`:70`), и **при любом `<Rule>` без `<File>`** (уточнено верификатором прямым вызовом — проект, авторящий правило текстом, ломает `sdd-new` наглухо). Чего нет: (а) проверки, что `<File>` реально существует на диске (SO-11); (б) права проекта переписать реестр, не потеряв его при следующем sync (S1/R3).

**Вердикт: ЧАСТИЧНО** — механика активации правил лучше v1, но опирается на файл, который sync стирает, и не проверяет существование целевого файла на диске.

### 1.10. Эмпирика: что v2 сделает с проектным деревом (синтетическая фикстура)

Фикстура `<scratchpad>/fixture/consumer`, `node_modules/gennady → RC`:

| Артефакт фикстуры | Смысл | RC `sync` | MAIN |
|---|---|---|---|
| `ai/directives/knowledge.xml` (Swift-реестр) | project-owned реестр | `~ updated` → **перезаписан** пакетным TS-реестром | `preserved` |
| `ai/directives/coding/swift-rules.xml` | проектный rule-файл, на который ссылается реестр | `- deleted` | не тронут |
| `ai/directives/coding/typescript-rules.xml` + локальный патч | пропатченная пакетная директива | `~ updated` → **патч потерян** | `updated` → патч тоже потерян |
| `ai/directives/sdd-v2/infra.directive.xml` + локальный патч | пропатченный `sdd-v2/*.xml` | `~ updated` → **патч потерян** | (в v1 файла нет) |
| `ai/directives/testing/legacy-xctest.xml` | устаревший синканный файл | `- deleted` (желаемо, но неотличимо от проектного) | не тронут (v1 не чистит устаревшее) |
| `ai/directives/sdd-v2/local-swift-overrides.xml` | проектный файл рядом с пакетными | `- deleted` | не тронут |
| `ai/directives/local/ios.xml` | проектный подкаталог вне поставки | не тронут + `Warning: unknown subdirectory … left untouched: local` | не тронут |
| `ai/directives/project-notes.md` | **проектный файл в корне `ai/directives/`** | `- deleted` при нефильтрованном прогоне | не тронут |
| `.claude/skills/generate-codeowners/`, `write-uitests/` | проектные скиллы (#9.4) | `- would delete` → **удалены** | не тронуты |
| `.claude/skills/sdd-discover/` | v1-скилл, которого в v2-пакете нет | `- would delete` | `updated` (main его поставляет) |
| `.claude/skills/sdd-execute/local-helper.sh` | проектный файл внутри поддерживаемого скилла | **удалён молча** | не тронут |
| `.claude/skills/.gennady-synced` | манифест владения | не создаётся | создаётся |

Сводка RC: `Synced: 12 added, 1 updated, 0 skipped, 4 deleted`. Сводка MAIN: `Synced: 47 added, 1 updated, 0 skipped (unchanged), 1 preserved (project-owned)`, 0 удалений.

**main = безопасный, но протекающий** (не удаляет чужого, но и не чистит устаревшее, и перетирает патчи); **RC = агрессивный и теряющий** (чистит устаревшее, но вместе с проектным, без манифеста/preserved). Хэш-манифеста нет ни там, ни там — патч пакетной директивы теряется в обоих.

Опасность связки (новый v2-дефект, отдельно от S1–S9): `gennady sync-skills` **всегда** сначала выполняет полный, нефильтрованный `sync` директив — `syncDirectivesFirst` (`sync-skills.cmd.ts:67-118`, `opts` без `subdirs` — литерал на `:84-88`), вызывается безусловно из `run` (`:154-168`). `gennady sync-skills sdd-execute` (узкий фильтр) выполняет тот же нефильтрованный директивный проход — фильтр `positional` попадает только в `SyncSkillsOptions.skillNames` (`:186`), в `syncDirectivesFirst` не передаётся вообще. В MAIN `grep syncDirectivesFirst` = 0.

### 1.11. Эмпирика: первый v2-sync на реальном потребителе (копия дерева messenger)

Дерево: `ai/directives/{coding,infra,language,perf-auditor,sdd,testing}` + `knowledge.xml` (19 `Rule id`, включая проектные `logging-rules`, `uikit-*`); `.claude/skills/` — v1-набор `sdd-*` + `alt-opinion` + собственные `lang-lint`, `run-e2e`, `uikit-component-generate`; `.gennady-synced` отсутствует (синкано 0.8.1, до манифеста).

`RC sync --dry-run`:

- `- coding/logging-rules.xml (would delete)` — **проектный** rule-файл, зарегистрированный в `knowledge.xml`;
- `- coding/result-conventions.xml (would delete)` — есть в main, в RC нет; для messenger'а неотличим от проектного;
- `~ knowledge.xml (would update)` — реестр (включая `logging-rules`, `uikit-spec-drafting`, `uikit-component-svelte`, `uikit-component-storybook`, `result-conventions`) заменяется на 14-правильный TS-реестр RC;
- **19** `~ would update` всего = 18 по `coding/`/`infra/`/`testing/` + `knowledge.xml`;
- `Warning: … left untouched: language`, `… perf-auditor`, `… sdd` — три подкаталога выживают.

Главный факт про миграцию V1→V2 дерева: `ai/directives/sdd/` (13 файлов v1-директив) остаётся, рядом появляется `ai/directives/sdd-v2/` (**73 файла**, не «≈95»), а новый `knowledge.xml` не содержит секции `<Directives>` вовсе — реестр не указывает ни на один SDD-набор.

`RC sync-skills --dry-run`: `+7` новых, `~5`, и **11 удалений**: `alt-opinion/`, `lang-lint/`, `run-e2e/`, `uikit-component-generate/` (проектные) + `sdd-continue/`, `sdd-discover/`, `sdd-execute-batch/`, `sdd-fix/`, `sdd-infra/`, `sdd-module-decomposition/`, `sdd-setup/` (v1-скиллы). Удаление v1-скиллов для миграции желательно; удаление трёх проектных — нет; RC их не различает.

**Дополнено верификацией.** На реальном дереве внутрискилловое зеркало молча удаляет **9 файлов** `.claude/skills/sdd-execute/scripts/`: `README.md`, `check-blockers.sh`, `classify-scripts.cjs`, `classify-scripts.ts`, `extract-section.sh`, `lint-artifacts.sh`, `scan.sh`, `sdd`, `verify.sh`. Ни одно имя не встречается в выводе — там только `~ sdd-execute/ / SKILL.md`. Сводка `Synced: 8 added, 5 updated, 0 skipped, 20 deleted` (20 = 11 orphan-скиллов + 9 файлов). Контрольная проверка после прогона подтвердила: реальный `/Users/k.lebedev/Developer/messenger` не изменён (`logging-rules.xml` цел, `sdd-execute` — все 10 файлов).

### 1.11-bis. Эмпирика: cloud-ios (akkrat) — сильнее messenger'а, воспроизведено буквально

Дерево получено `git archive origin/ap/CLOUDIOS-NOISSUE-swiftlint-exceptions-infra-base -- ai/directives .claude/skills` (50 директив + 34 файла скиллов), не по фактам задания, а буквально. Реестр cloud-ios переписан под Swift: **5** правил — `swift-rules`, `objc-rules`, `xctest-rules`, `git-setup`, `swiftlint-setup` (плюс секция `<Directives>`).

`RC sync --dry-run`: **6 удалений** — `coding/objc-rules.xml`, `coding/result-conventions.xml`, `coding/swift-rules.xml`, `infra/golang-setup.xml`, `infra/swiftlint-setup.xml`, `testing/xctest-rules.xml` — и `~ knowledge.xml (would update)`. **4 из 5** правил, на которые ссылается реестр, удаляются **одновременно** с уничтожением самого реестра. Выживает ровно `git-setup`. Warnings: `perf-auditor`, `sdd`.

`RC sync-skills` (реально): `Synced: 4 added, 7 updated, 2 skipped (unchanged), 22 deleted`; с диска исчезают **25** файлов (счётчик считает записи, не файлы — см. S5-bis), из них **11** — `sdd-execute/scripts/{README.md,_sdd-lib.sh,check-blockers.sh,check.sh,classify-scripts.js,classify-scripts.ts,extract-section.sh,lint-artifacts.sh,scan.sh,sdd,verify.sh}`, ни одно имя не названо в выводе (только `~ sdd-execute/ / SKILL.md`). Также гибнут `generate-codeowners/` вместе с `references/component-team-mapping.md` и `write-uitests/` — ровно issue #9.4/`ISS-3`.

Это лучший из двух готовых G2-кейсов и лучший аргумент для §4 D-1/D-3: один `gennady sync-skills` на копии реальной ветки одновременно (а) стирает 4 из 5 Swift/ObjC-правил проекта, (б) стирает регистрацию этих правил в реестре, (в) удаляет 2 проектных скилла, (г) молча выкашивает 11 файлов скриптов внутри поддерживаемого скилла.

### 1.12. Сводная таблица трека

| # | Инвариант (кратко) | v1 | v2 | Вердикт |
|---|---|---|---|---|
| S1 | `knowledge.xml` project-owned / `preserved` | `sync-core.ts:27,239,254` + тест `:223` | нет; `sync.types.ts:6` | **НЕ ЗАКРЫТО** |
| S2 | `resolvePackageDir` подъёмом по `package.json` | `sync-core.shared.ts:10-46` + checkout-e2e | `sync-core.shared.ts:36-59` (`dist`-strip), e2e удалён, `exit 1` вместо `exit 0` | **НЕ ЗАКРЫТО** |
| S3 | объединение base + plugin-корней | `sync-core.ts:84-132`, `plugin-assets.ts:43` | плагинов нет | **НЕПРИМЕНИМО** (вернётся с портом) |
| S4 | проглоченная ошибка не опустошает источник | `sync-skills-core.ts:158-190` + 3 теста | нарушено `sync-core.ts:176-182` + зеркало `:226-244`; репро: 8 живых файлов удалены одним `chmod 000` | **НЕ ЗАКРЫТО, хуже v1** |
| S5 | манифест владения скиллами | `sync-skills-core.ts:32,581-600` + 10 тестов | нет; spec `:331,336` легитимирует потерю | **НЕ ЗАКРЫТО** |
| S5-bis | (v2-only) файловое зеркало внутри скилла | — | `sync-skills-core.ts:377-392`; форматтер лжёт в 2 из 3 веток; спека противоречит коду (`:229`); счётчик считает записи, не файлы | **НЕ ЗАКРЫТО (v2-only)** |
| S6 | тесты скилла не деплоятся | `sync-skills-core.ts:25,128,272` + `deployed-surface.test.ts:74` | `EXCLUDED_NAMES` = `{'.DS_Store'}`; репро — 3 внедрённых тест-файла задеплоены | **НЕ ЗАКРЫТО** |
| S7 | golden деплой-поверхности | `deployed-surface.{test.ts,golden.txt}` (80) | нет вовсе; утечка в sync-поверхности + 5 утечек в tarball (`ai/flow-eval/**`) | **НЕ ЗАКРЫТО** |
| S8 | нормализация путей, проектная цель скиллов | `path-normalizer.ts:34-96` | есть, минус `RULE_PLUGIN_DIRECTIVES`, минус dev-home | **ЧАСТИЧНО** |
| S9 | тесты скилловых скриптов вне `ai/skills` | `scripts/__tests__/` | в пакете скриптов нет; у потребителей есть (9–11 файлов), их выкашивает S5-bis | **НЕПРИМЕНИМО** (к пакету) |
| R3 | реестр: agnostic-родители + PROJECT-OWNED | `knowledge.xml:2-7`, 19 правил | 14 TS-правил, нет `<Directives>`, нет шапки | **НЕ ЗАКРЫТО** |
| R4 | golang-директива/скилл в плагине | `plugins/golang/**` | нет | **НЕПРИМЕНИМО** |
| R5 | ссылки на правила резолвятся / проект авторит свои | текст `scaffold.directive.xml:74,95,470` | механика сильнее, бросает и на `<Rule>` без `<File>`, но опирается на стираемый файл и не проверяет диск | **ЧАСТИЧНО** |

**Итог (арифметика исправлена независимой верификацией):** ЗАКРЫТО **0** · ЧАСТИЧНО **2** (S8, R5) · НЕ ЗАКРЫТО **8** (S1, S2, S4, S5, S5-bis, S6, S7, R3) · НЕПРИМЕНИМО **3** (S3, S9, R4). Всего 13 строк.

---

## 2. Модель владения: v1 vs v2

### 2.1. v1 (main `8bb38477`)

Две разные модели для двух поверхностей:

| Поверхность | Модель владения | Механизм | Удаление |
|---|---|---|---|
| `ai/directives/**` | «пакет владеет всем, кроме явного исключения» | `PROJECT_OWNED_ENTRIES = {'knowledge.xml'}` (`sync-core.ts:27`), статус `preserved` | **никогда**: `collectAndCompare` только `added\|updated\|unchanged\|preserved` |
| `.claude/skills/**` | «пакет владеет тем, что записал» | манифест `.gennady-synced` (`sync-skills-core.ts:32`), merge-семантика `nextManifestNames:115` | только имена из манифеста; при первом запуске `adoptPackageInstalled:96` присваивает лишь то, что пакет поставляет **сейчас** |

Прочее в v1: нормализация путей (`path-normalizer.ts:34-96`), плагинные корни (`plugin-assets.ts:43`, `scanSourceRoots:84`), `<sdd-path>` вместо `~/.claude/skills/…` в директивах (#11).

Дыры v1: (а) устаревшая директива, снятая с поставки, остаётся в проекте вечно; (б) пропатченная пакетная директива перетирается как `updated` — хэш-манифеста нет; (в) `preserved` покрывает ровно один путь, hard-coded; (г) `specs/cli/sync/sync.spec.md` про `preserved`/плагинные корни не знает вовсе (`grep -i 'preserved|project-owned|plugin|extraSourceDirs|knowledge.xml'` по всем 337 строкам = 0) — спека отстала от кода.

### 2.2. v2 (RC)

Одна модель на обе поверхности — «зеркало без владения»:

| Поверхность | Модель | Границы зеркала |
|---|---|---|
| `ai/directives/**` | rsync `--delete`, ограниченный подкаталогами, которые пакет поставляет | `listOwnedSubdirs` (`sync-core.ts:108-120`) → `scanTargetMirrorSpace` (`:134-174`). Внутри owned-подкаталога удаляется всё, чего нет в источнике (`:233-244`). Неизвестный подкаталог → `warnings`, не тронут (`:159-163`). Файлы в корне `ai/directives/` — кандидаты на удаление при нефильтрованном прогоне (`:165-170`) |
| `.claude/skills/**` | rsync `--delete` на двух уровнях: целые orphan-скиллы (`:396-403`) **и** отдельные файлы внутри поддерживаемого скилла (`:377-392`) | ничего не защищено; фильтр по именам сужает только orphan-проход (`:397-399`), не файловое зеркало и не `syncDirectivesFirst` |

Что появилось хорошего (этого в main нет): (1) устаревший пакетный файл действительно исчезает — правильная цель; (2) `warnings` о неизвестном подкаталоге — единственный акт признания, что в target бывает чужое; (3) `syncDirectivesFirst` гарантирует, что скилл не сошлётся на отсутствующую директиву.

Что потеряно: `PROJECT_OWNED_ENTRIES`, `preserved`, манифест скиллов, `isTestArtifact`/`__tests__`, плагинные корни, `extraSourceDirs`, deployed-surface golden, checkout-e2e, дисциплина фатальности ошибок чтения корня.

**Роль `cli/cmd/sdd-sync/`.** К `gennady sync` отношения не имеет — только коллизия имени. `sdd-sync` распространяет `Status` тикета в трекеры `*.3-tasks.md` (`sdd-sync.cmd.ts:135-244`; спека `sdd-sync.spec.md:9`): читает `Task-ID`+`Status`, находит owner-индексы подъёмом от каталога тикета (`discoverIndexes:55-85`), правит сегмент Status (`updateTrackerStatus`, определена в `shared/sdd/tracker.ts:67`, вызывается из `:202,219`), пересчитывает роллап (`recomputeProgress:95-127`). Никаких директив/скиллов/пакета не касается. Соответствие v1: writer для того, что v1 только детектировал (`[TRACKER_SYNC]`, read-only, `MAIN/ai/skills/sdd-execute/scripts/check.sh:307-310`) — улучшение, но к треку относится тем, что **три разных `*sync*`** в одном CLI сбивают и оператора, и грепы: `gennady sync` (пакет → проект), `gennady sync-skills` (пакет → проект, и тайно ещё раз `sync`), `gennady sdd-sync` (тикет → трекер).

### 2.3. Оценка трёх предложений akkrat (#24 / `ISS-13`) для v2

| Предложение | Что даёт | Что не решает | Оценка для v2 |
|---|---|---|---|
| **(1) Манифест с хэшами → `locally-modified` + `--force`** | Единственный вариант, различающий «мы записали, не менялось» / «мы записали, проект изменил» / «мы не записывали». Закрывает S1 (частично), S4 (зеркало только по манифесту), S5, S5-bis и #24 целиком | Сам не делает `knowledge.xml` особым: изменённый проектом реестр станет `locally-modified` и не обновится (правильно для реестра, но новый пакетный `Rule` до проекта не доедет) | **ПРИНЯТЬ как основу.** Единственный механизм, одинаково работающий для директив и скиллов. Стоимость: sha256 на файл + файл состояния на поверхность |
| **(2) `knowledge.xml` project-owned (`preserved`)** | Дёшево, порт `f74c8c1d` точечно; в v2 обязательно, потому что реестр читает тулинг (`loadRuleRegistry`) | Не спасает ни проектный rule-файл (`swift-rules.xml` удаляется зеркалом), ни патч директивы, ни проектные скиллы. На messenger даёт «реестр цел, `logging-rules.xml` удалён» — реестр с висячей ссылкой | **ПРИНЯТЬ как обязательное дополнение**, не как замену (1). Порядок: сначала (2) — блокер релиза, потом (1) |
| **(3) Overlay `ai/directives.local/`** | Место, где sync гарантированно не ходит, без манифеста. В v2 уже есть слабая форма: неизвестный подкаталог → warning, не тронут (`sync-core.ts:159-163`) — подтверждено на `local/`, `language/`, `perf-auditor/`, `sdd/` | Требует, чтобы читатель правил умел склеивать два дерева — их два (агент по `<File>`-ссылкам, `parseRuleRegistry`) | **ПРИНЯТЬ ЧАСТИЧНО, как соглашение.** Overlay для правил — да. Overlay для реестра (`knowledge.local.xml`) — нет |

Обоснование отказа от overlay-реестра **пересмотрено верификацией**: исходный аргумент («`parseRuleRegistry` бросает на дубль `id`») подтверждён, но как довод слаб — дедуп «проект побеждает» до вызова снимает его дёшево (~5 строк). Настоящие возражения три: (а) `parseRuleRegistry` бросает и когда **любой** `<Rule>` без `<File>` — а именно так человек и напишет локальный оверлей, хрупкость на входе, не на merge; (б) `loadRuleRegistry` сейчас **replace**, не merge, единственный вызов — `sdd-new.cmd.ts:478` с `process.cwd()`; merge вводит порядок приоритета в путь, у которого ошибка даёт `exit 1` для всей команды создания тикета; (в) у реестра два читателя (агент, `parseRuleRegistry`), они разойдутся по потребности в merge. Overlay для правил подтверждён эмпирически трижды (`local/` в фикстуре; `language/`, `perf-auditor/`, `sdd/` на messenger; `perf-auditor/`, `sdd/` на cloud-ios).

Ни одно из трёх предложений не закрывает S5-bis и S7 — файловое зеркало внутри скилла и утечка dev-путей отдельная работа (форматтер + счётчики dry-run, golden деплой-поверхности).

---

## 3. Дизайн для v2

### 3.1. Одна модель владения на директивы И скиллы

Три статуса владения на путь, вычисляемые из одного состояния:

```
manifest[<relpath>] = sha256(байты, которые sync записал в прошлый раз)
```

Файлы состояния (dot-имена, все readdir-фильтры уже отбрасывают `.`-имена — `sync-core.ts:150,185`, `sync-skills-core.ts:36,84,168,337`, проверено):

- `ai/directives/.gennady-synced`
- `.claude/skills/.gennady-synced`

Формат — построчный `<sha256>  <relpath>`, шапка `#`-комментариями (как `MAIN/cli/cmd/sync-skills/sync-skills-core.ts:66-73`), плюс первая строка `# version: 1` и `# package: gennady@<ver>`. Нечитаемый манифест = отсутствующий (main уже так: `readSyncManifest` возвращает `null`, `:50-52`) — деградация всегда в сторону «ничего не удалять».

**Три дырки исходного дизайна, найденные независимой верификацией, и их исправление.**

1. **Коллизия формата `.gennady-synced`.** Путь и имя `.claude/skills/.gennady-synced` совпадают с v1-манифестом, но v1-формат — список **имён** (`sync-skills-core.ts:62-77`), а новый — `<sha256>  <relpath>`. Потребитель, синканный main 0.9.x (ровно та популяция, ради которой всё делается), придёт с v0-манифестом; «нечитаемый = отсутствующий» тогда **выбросит** уже существующую информацию о владении и никогда не подчистит устаревшие пакетные скиллы. **Исправление: явный v0-reader.** Строка без sha (просто имя) читается как «наше, хэш неизвестен» — эквивалент нового статуса `stale-modified`: не удалять, предупредить, дождаться, пока новый прогон запишет sha. Только после этого файл переходит в обычный хэш-цикл.
2. **`project-owned` не короткозамыкал ветку удаления.** Если правило сформулировано только как «реестр не переписывается», строка таблицы «нет в источнике / да в target / да в манифесте / sha совпал → `deleted`» сработает на `knowledge.xml`, как только пакет перестанет его поставлять: seed при первом прогоне даст манифест-запись, а дальше «удалить своё неизменённое» уничтожит реестр. **Исправление:** `project-owned` — предикат-короткозамыкатель, проверяемый **первым**, до всех остальных веток: «никогда не писать и никогда не удалять», не строка таблицы.
3. **Таблица была не функцией от своего ключа.** Строки с ключами `project-owned` и «в манифесте / sha» пересекались (`—` в нескольких колонках), результат зависел от незафиксированного порядка проверок — контракт-тест на такую таблицу нельзя написать однозначно. **Исправление:** решение — упорядоченный набор проверок, а не таблица с произвольным порядком строк:

```
0. path ∈ PROJECT_OWNED_ENTRIES?          → never write, never delete (короткое замыкание)
1. path ∈ source, path ∉ target           → added: записать, обновить манифест
2. path ∈ source, path ∈ target:
   2a. path ∈ manifest, sha(target)==manifest[path]  → unchanged/updated по sha источника
   2b. path ∈ manifest, sha(target)!=manifest[path]  → locally-modified: не писать, показать; --force пишет
   2c. path ∉ manifest                                → adopted-conflict: не писать; --force пишет и присваивает
3. path ∉ source, path ∈ target:
   3a. path ∈ manifest, sha(target)==manifest[path]  → deleted: удалить, снять из манифеста
   3b. path ∈ manifest, sha(target)!=manifest[path]  → stale-modified: не удалять, предупредить
   3c. path ∉ manifest                                → foreign: не трогать, показать в --verbose
```

Первый прогон на дереве без манифеста: всё в target = `foreign`/`adopted-conflict` → ничего не удаляется и не перетирается, кроме `added` — ровно migration-safe поведение, нужное для messenger/cloud-ios (§3.4). `adoptPackageInstalled` из main здесь не нужен: хэш пакета известен, «target побайтово равен пакетному» → присвоить молча, «отличается» → `adopted-conflict`.

`--force` — единственный способ потерять данные, именуемый (`--force ai/directives/coding/typescript-rules.xml`) либо глобальный. `--force` **никогда** не расширяет удаление `foreign`/`stale-modified` — для этого отдельный `--prune-foreign` (opt-in, как просил akkrat в #9.4), и он обязан идти **под тем же гейтом известных v1-хэшей**, что и миграционный шаг SO-12: `--prune-foreign` на дереве messenger/cloud-ios без этого гейта уничтожит именно те данные, ради которых вся модель строится.

Единая реализация: `shared/common/sync/ownership.ts` (`readOwnershipManifest`, `writeOwnershipManifest`, `classify(source, target, manifest)`), чтобы `sync-core.ts` и `sync-skills-core.ts` использовали одну последовательность проверок. Сейчас общий только `sync-core.shared.ts` и `sync-formatter.shared.ts`.

Overlay — соглашение, а не код: «подкаталог `ai/directives/`, которого пакет не поставляет, синк не трогает» уже есть (`:159-163`); задокументировать как контракт (рекомендуемое имя — `ai/directives/local/`), закрепить тестом, **не** вводить `ai/directives.local/` как второй корень.

### 3.2. Взаимодействие со слоем правил

- `PROJECT_OWNED_ENTRIES = {'knowledge.xml'}` возвращается **и** остаётся сильнее манифеста: реестр не переписывается никогда, `--force` на него не действует (иначе `--force` после первого же конфликта сотрёт Swift-реестр). Обновление реестра — задача агента/директивы, не sync. Шапка PROJECT-OWNED из `MAIN/ai/directives/knowledge.xml:2-7` переносится в `RC/ai/directives/knowledge.xml`.
- Порт R3-содержимого: `coding/baseline-rules.xml`, `testing/baseline-testing.xml`, тонкие `coding/python-rules.xml`, `coding/go-rules.xml`; `typescript-rules` получает `SkipWhen` для не-TS — **это порт, не новая работа**: в MAIN такой `<SkipWhen>` уже есть (`knowledge.xml:80`: «Config-only task; non-TypeScript language (see python-rules / go-rules); infra-setup without code files»). Регистрация — в поставляемом (seed) реестре. Иначе v2 остаётся TypeScript-only на уровне правил, а `loadRuleRegistry` детерминированно вставляет TS-правила в тикеты Swift-проекта.
- Проектный rule-файл (`coding/swift-rules.xml`) переживает sync по общей последовательности §3.1 (`foreign` → не тронут). Нужен дополнительный замок в `sdd-check`: каждый `<Rule><File>` реестра обязан существовать на диске (`SDD_RULE_FILE_MISSING`, SO-11) — сейчас `parseRuleRegistry` проверяет только уникальность `id`, непустоту и наличие `<File>`-узла, не существование самого файла. Без SO-11 «реестр цел, файл удалён» проходит зелёным.
- `parseRuleRegistry` бросает на дубль `id` — значит любой будущий merge-механизм реестров обязан дедуплицировать до вызова. Аргумент против overlay-реестра (§2.3).

### 3.3. Взаимодействие с плагинами / stack-пресетами

Порт `plugins/` (трек VERIFY) обязан вернуть в sync ровно три вещи из main, иначе плагин не сможет поставить ни правило, ни скилл:

1. `extraSourceDirs` + `scanSourceRoots` (`sync-core.ts:84-132`, `sync.types.ts:19`) и `scanAllSkillRoots`/`selectSkills` (`sync-skills-core.ts:158-207`) — с дисциплиной фатальности (S4): отсутствующий плагинный корень терпим, база и EACCES/EIO фатальны;
2. `pluginSurfaceDirs` (`plugin-assets.ts:43-54`) + `files[]`-записи `plugins/*/directives/**/*`, `plugins/*/skills/**/*` + `publish-contents.e2e.test.ts` (иначе tarball теряет плагинные ассеты молча);
3. `RULE_PLUGIN_DIRECTIVES` в оба набора `path-normalizer.ts` (`plugins/<id>/directives/ → ai/directives/`), иначе синканный текст будет ссылаться на путь, которого у потребителя нет.

Владение при этом не меняется: манифест ключуется по **target-относительному** пути, поэтому неважно, какой корень его дал. Единственное новое правило: смена «поставщика» пути (base ↔ plugin) при неизменных байтах — это `unchanged`, а не `updated` (уже выполняется автоматически, потому что сравнение побайтовое, `compareBytes`, `sync-core.shared.ts:67-70`).

### 3.4. Миграция V1→V2 потребительских деревьев

Что первый v2-sync делает **сейчас** (доказано в §1.11, §1.11-bis): удаляет rule-файлы (в т.ч. проектные), перетирает `knowledge.xml`, оставляет `ai/directives/sdd/` рядом с `sdd-v2/` без указывающей регистрации, удаляет каталоги скиллов (в т.ч. проектные), не оставляет ни манифеста, ни следа удалённых файлов внутри поддерживаемых скиллов.

Что должен делать:

- **`ai/directives/sdd/` (v1-директивы).** Оставлять «как есть» нельзя — два комплекта инструкций и реестр, не указывающий ни на один. Удалять зеркалом тоже нельзя — messenger'ский `sdd/` содержит **проектные** файлы (`fix.directive.xml`, `svelte-ui-discovery.directive.xml`), которых нет ни в v1-, ни в v2-пакете. Явный шаг миграции (`gennady sdd-migrate directives`), который (а) сверяет содержимое `ai/directives/sdd/*` с известными хэшами v1-релизов, (б) неизменённые v1-файлы переносит в `ai/directives/.gennady-v1-backup/` (или удаляет по подтверждению), (в) изменённые и незнакомые — оставляет и печатает список, (г) **никогда** не делает этого молча внутри `sync`.
- **`.claude/skills/` v1-набор.** Тот же приём: список известных v1-имён (`sdd-setup`, `sdd-discover`, `sdd-continue`, `sdd-module-decomposition`, `sdd-execute-batch`, `sdd-fix`, `sdd-infra`, `alt-opinion`) удаляется только при совпадении хэшей с известным v1-релизом и только на шаге миграции; всё остальное (`lang-lint`, `run-e2e`, `uikit-component-generate`) не трогается никогда.
- **`knowledge.xml`.** Первый v2-sync его не пишет (project-owned). Секцию `<Directives>` и переключение `sdd/ → sdd-v2/` делает шаг миграции, показывая diff оператору.

**Уточнено верификацией: адрес и алгоритм.** `RC/cli/cmd/sdd-migrate/` **уже существует** (режимы `anchors` и `plan`) — SO-12 расширяет существующую команду, а не создаёт новую подсистему; `sync --migrate-v1` не нужен. Алгоритм должен сначала прочитать `.claude/skills/.gennady-synced` уже-синканного main-потребителя (там, где формат main 0.9.x — список имён — уже отвечает на вопрос «какие v1-скиллы наши»), и **только при его отсутствии** сверять известные хэши v1-релизов. Иначе шаг миграции переизобретает данные, которые у потребителя уже есть.

Runbook `RC/ai/directives/sdd-v2/guides/v1-to-v2-migration.md` покрывает только `tasks/ → specs/` и Task-ID (`grep -i 'sync|knowledge|\.claude/skills'` = 0) — про дерево директив и скиллов там нет ни слова, дописать раздел.

### 3.5. Тесты, которые надо поставить (замки)

Unit / `contract`-слой (`RC/scripts/test-topology.ts:181-196`, `basename` содержит `contract` → входит в `npm test`):

| Файл | Кейс |
|---|---|
| `cli/cmd/sync/__tests__/sync-core.test.ts` | порт `MAIN:223,242`; `a patched package directive is locally-modified and not written`; `--force writes a locally-modified file`; `a project file in an owned subdir without a manifest entry is not deleted`; `a stale file recorded in the manifest is deleted`; `a stale file recorded in the manifest but modified on disk is kept with a warning`; `a partial source scan never deletes` (мок `readdirSync`) |
| `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts` | порт `MAIN:377,391,538-627`; `a project file inside a supported skill is not deleted`; `deleting a file inside a supported skill appears in the output`; `deleting a file inside a supported skill only removes previously-manifested names` (SO-2b) |
| `cli/cmd/sync-skills/__tests__/sync-skills-formatter.test.ts` | `reports a deleted file inside an added/updated skill group truthfully` (все три ветки); `dry-run summary carries counts, not just "no files written"` |
| `shared/common/sync/__tests__/ownership.test.ts` (новый) | упорядоченный набор проверок §3.1 целиком, включая v0-манифест |
| `shared/common/sync/__tests__/sync-core.shared.test.ts` | `resolves the package from a clone with no node_modules/gennady` (порт checkout-кейса) |
| `scripts/__tests__/deployed-surface.test.ts` + `.golden.txt` (новые) | порт трёх `it` из main + четвёртый: `leaks no developer path into any shipped file` (grep содержимого, не только имён) — сейчас падает на `agent-inbox/golden-chat-output.example.md:176` |
| новый contract-тест | `doesNotMatch(/~\/\.claude\//)` по rendered `ai/directives/**` + `ai/skills/**` (замок для #11, закрытого «по построению», но ничем не защищённого) |

e2e / `external`-слой (`cli/__tests__/e2e/setup.ts` — реальный `npm pack`+install, входит в `npm test` через `targetsFor('deterministic')`):

| Файл | Кейс |
|---|---|
| `cli/__tests__/e2e/sync.e2e.test.ts` | `keeps a project-owned knowledge.xml across two syncs`; `keeps a project-authored rule file in a package-owned subdir`; `removes a directive the package stopped shipping`; `--dry-run lists every deletion it would perform` |
| `cli/__tests__/e2e/sync-skills.e2e.test.ts` | `leaves a project-authored skill alone` (cloud-ios); `writes .claude/skills/.gennady-synced`; `sync-skills <name> does not mirror-delete directives` (замок против `syncDirectivesFirst` без фильтра); порт `registerSyncSkillsCheckoutTests` |
| `cli/__tests__/e2e/publish-contents.e2e.test.ts` (порт) | нужен только после порта плагинов |

Отдельная задача документации: `specs/cli/sync-skills/sync-skills.spec.md:229` («смешанные статусы… невозможны») противоречит коду и должна быть переписана вместе с SO-2/SO-2b.

### 3.6. Eval-группа G2 — детерминированная, без LLM

G2 = e2e-корпус «фикстура потребителя → sync → сравнение дерева». Реализация — `cli/__tests__/e2e/` + `setup.ts` (реальный tarball) + табличные фикстуры.

**Уточнения по итогам верификации, до фикстур.**

- «Целиком детерминированный» — завышенная формулировка: unit/contract-слой детерминирован полностью, но e2e-слой делает реальный `npm pack` + `npm install` в temp-проект (`setup.ts`) — без offline-кеша это зависимость от реестра, т.е. флейк-риск. Нужен либо `--offline`/prefetch кеш, либо явно признать e2e-слой G2 частично внешним.
- Метрика «`assert.deepEqual(treeAfter, expectedTreeAfter)` по `<path>\t<sha256>`» неподъёмна как поддержка: любое изменение содержимого любой из 104 директив ломает все фикстуры разом. Заменить на **дельту**: множества `created`/`deleted`/`modified` относительно снимка «до» + sha только для файлов, авторённых самой фикстурой.
- Самый разрушительный дефект трека (S4) не покрыт готовой фикстурой. `chmod 000` в e2e ненадёжен (под root не сработает) — нужен **unit** с мокнутым `readdirSync`, включённый как обязательный гейт, а не только упомянутый в §3.5.
- `v1-consumer` — одна фикстура на два разных режима отказа, которые её не поймают вместе. Разделить на **две**: messenger-образную (TS-стек, `sdd/` с проектными файлами, `sdd-execute/scripts/` 9 файлов) и cloud-ios-образную (Swift-реестр из 5 правил, проектные rule-файлы в пакетных подкаталогах, `scripts/` 11 файлов, `generate-codeowners/references/`).
- `surface` должна покрывать **tarball**-поверхность (`npm pack --dry-run`), а не только sync-поверхность — иначе 5 утечек в `ai/flow-eval/**` проходят зелёными.
- Не хватает фикстуры **«manifest v0»**: потребитель, синканный main 0.9.x, с name-list `.claude/skills/.gennady-synced` — первый v2-прогон обязан распознать формат и не потерять владение (см. дырка 1 в §3.1).
- `project-skills` — ассерт усилить до «вывод содержит все затронутые пути **и ни одного незатронутого**» — иначе ветка `deleted` форматтера (печатает уцелевший `SKILL.md` как удалённый) проходит зелёным.

Фикстуры (`cli/__tests__/e2e/fixtures/consumers/`), каждая = «до» + ожидаемая дельта «после»:

1. `greenfield` — пустой проект: всё `added`, манифест создан, 0 удалений.
2. `patched-directive` — пакетная директива с локальной правкой: `locally-modified`, не записана, exit 0; повтор с `--force` → записана.
3. `project-owned-registry` — Swift-реестр + `coding/swift-rules.xml`: реестр `preserved`, rule-файл цел (#24 + cloud-ios).
4. `stale-package-file` — файл, снятый с поставки: удалён; тот же файл, но правленный на диске: сохранён с warning.
5. `project-skills` — `generate-codeowners`, `write-uitests` + файл внутри `sdd-execute/`: ничего не удалено, вывод содержит все затронутые пути и ни одного незатронутого (#9.4 + S5-bis).
6a. `v1-consumer-node` — обезличенная выжимка messenger: первый v2-sync не удаляет ничего, печатает migration-hint.
6b. `v1-consumer-swift` — обезличенная выжимка cloud-ios: Swift-реестр из 5 правил + проектные rule-файлы в пакетных подкаталогах; первый v2-sync не удаляет ничего.
7. `linked-checkout` — потребитель без `node_modules/gennady`, CLI из клона: пакет найден (S2).
8. `surface` — golden `deployed-surface.golden.txt` (sync-поверхность) + golden `npm pack --dry-run` (tarball-поверхность) + четыре `it` из §3.5.
9. `manifest-v0` — потребитель с main-формата `.gennady-synced` (список имён): первый v2-sync распознаёт формат, не теряет владение.
10. `partial-source-read` (unit, не e2e) — мокнутый `readdirSync`, бросающий на одном подкаталоге источника: 0 удалений (S4). Обязательный гейт.

Метрика — бинарная дельта (`created`/`deleted`/`modified` множества + набор строк вывода), не полный `deepEqual` дерева. Ворота: G2 обязана быть зелёной до релиза v2, потому что три из восьми НЕ-ЗАКРЫТЫХ инвариантов трека — это потеря чужих данных.

---

## 4. Список задач и решения оператора

### 4.1. Задачи

| id | Цель | Файлы | Тесты | Размер | Блокер релиза |
|---|---|---|---|---|---|
| **SO-1** | `knowledge.xml` project-owned: порт `PROJECT_OWNED_ENTRIES` + статус `preserved` (+ шапка в поставляемом реестре) | `RC/cli/cmd/sync/sync-core.ts` (+лестница `:261-268`), `sync.types.ts:6` (+`'preserved'`), `sync-formatter.shared.ts`, `RC/ai/directives/knowledge.xml` (шапка), `specs/cli/sync/sync.spec.md` | порт `sync-core.test.ts:223,242`; e2e `keeps a project-owned knowledge.xml across two syncs` | S | **ДА** |
| **SO-2** | Порт манифеста скиллов из `62172906` (только orphan-проход целых скиллов — **не закрывает S5-bis сам по себе**, см. SO-2b) | `sync-skills-core.ts` (`MANIFEST_NAME`, `readSyncManifest`, `writeSyncManifest`, `adoptPackageInstalled`, `nextManifestNames`, применение вместо `:396-403`), `sync-skills.types.ts`, **переписать** `specs/cli/sync-skills/sync-skills.spec.md:229` (отрицает существование смешанных статусов) и `:331,336-343` (легитимирует потерю) | порт `sync-skills-core.test.ts:377,391,538-627`; e2e `leaves a project-authored skill alone` | S | **ДА** |
| **SO-2b** (новая) | Загейтить внутрискилловое файловое зеркало `sync-skills-core.ts:377-392`: удалять файл внутри поддерживаемого скилла только если его имя уже было в манифесте предыдущего sync; иначе не трогать | `sync-skills-core.ts:377-392` | новый: «deleting a file inside a supported skill only removes previously-manifested names»; «a project file inside a supported skill is never deleted» | S | **ДА** |
| **SO-3** | Единая модель владения по хэшам: `shared/common/sync/ownership.ts` + статусы `locally-modified`, `adopted-conflict`, `stale-modified`, `foreign`; `--force[ <path>]`, `--prune-foreign`; манифесты обеих поверхностей; зеркальное удаление только по манифесту (§3.1) | новый `ownership.ts`; `sync-core.ts:226-244,261-268`; `sync-skills-core.ts:377-403`; оба `*.types.ts`, оба формата вывода, `parse-args`; спеки обеих команд | новый `ownership.test.ts` (упорядоченный набор §3.1); блок кейсов в обоих `*-core.test.ts`; e2e-фикстуры 2,3,4,5,9 | L | нет — целевая архитектура (D-1), не блокер: минимальный набор SO-1+SO-2+SO-2b+SO-7+SO-11 закрывает `ISS-3`/`ISS-13` без неё (см. «Минимальная альтернатива» ниже) |
| **SO-4** | Видимость удалений: печатать `deleted` в группе с dominant `added`/`updated` **правдиво**; счётчики в dry-run сводке | `sync-skills-formatter.ts:88-124,147-153`; `sync-formatter.shared.ts` | `sync-skills-formatter.test.ts` (+3 кейса, все три ветки); e2e `--dry-run lists every deletion` | S | нет |
| **SO-5** | Deployed-surface golden + проверка утечек **в содержимом** и **в tarball**; починить найденную утечку | новый `RC/scripts/__tests__/deployed-surface.{test.ts,golden.txt}` (+ golden `npm pack --dry-run`); `ai/directives/agent-inbox/golden-chat-output.example.md:176`; при необходимости правило dev-home в `path-normalizer.ts` | 4 `it` + tarball-golden; `UPDATE_SURFACE_GOLDEN=1` | M | нет |
| **SO-6** | Вернуть исключение тестовых артефактов из деплоя скиллов | `sync-skills-core.ts:22,84` (`EXCLUDED_NAMES` + `isTestArtifact`) | порт `sync-skills-core.test.ts:151,165`; `it` «ships no test file» из SO-5 | S | нет |
| **SO-7** | Устойчивость источника: отказ чтения источника не приводит к удалению (S4) | `sync-core.ts:176-182` (различать «пусто» и «не прочитали»: флаг `incomplete`, запретить удаление в этом поддереве); аналогично `sync-skills-core.ts` `scanSkills` | `a partial source scan never deletes` (мок `readdirSync`); порт духа `sync-skills-core.test.ts:246,265` | M — но разрушительность максимальна в треке (8 живых файлов от одного `chmod`) | **ДА** |
| **SO-8** | `resolvePackageDir`: подъём по `package.json` вместо `dist`-strip; вернуть checkout-e2e (S2) | `sync-core.shared.ts:36-59` (порт `MAIN:10-46`) | `sync-core.shared.test.ts` + e2e `resolves the package from a clone with no node_modules/gennady` | S | по решению оператора: S2 — функциональный регресс (`exit 1` вместо `exit 0`), не только латентная дыра; см. D-2 |
| **SO-9** | Разорвать связку `sync-skills` → полный `sync`: флаг `--with-directives` (по умолчанию off), либо `syncDirectivesFirst` уважает фильтр и не удаляет | `sync-skills.cmd.ts:67-118,154-172`; help; спека | e2e `sync-skills <name> does not mirror-delete directives` | S | нет — снимает самый неожиданный сценарий потери, но не закрывает `ISS-3`/`ISS-13` сама по себе; рекомендуется в первой волне вместе с SO-1/SO-2 (см. D-4) |
| **SO-10** | Порт R3-содержимого реестра: `baseline-rules`, `baseline-testing`, тонкие `python-rules`/`go-rules`; `SkipWhen` у `typescript-rules` — **порт** (уже есть в `MAIN/ai/directives/knowledge.xml:80`), не новая работа; секция `<Directives>` в реестре v2 | `RC/ai/directives/coding/{baseline-rules,python-rules,go-rules}.xml`, `testing/baseline-testing.xml`, `knowledge.xml` | порт `testing-rule-contract.test.ts`; golden из SO-5 | M | нет |
| **SO-11** | `sdd-check`: `<Rule><File>` реестра обязан существовать → `SDD_RULE_FILE_MISSING` | `shared/sdd/check.ts`, `task-authoring-literals.ts` | «reports a registry rule whose file is missing» | S | **ДА** — без неё SO-1 в одиночку создаёт новый тихий отказ (реестр цел, файлы правил удалены — cloud-ios) |
| **SO-12** | Миграция V1→V2 дерева: расширение существующего `RC/cli/cmd/sdd-migrate/**` (режимы `anchors`/`plan` уже есть); сначала читать `.claude/skills/.gennady-synced` main-потребителя, только при его отсутствии — известные хэши v1-релизов; дописать `guides/v1-to-v2-migration.md` | `RC/cli/cmd/sdd-migrate/**`; `guides/v1-to-v2-migration.md`; `RC/ai/skills/README.md:75-83` (о владении — ни слова) | e2e-фикстуры 6a/6b/9 | L | нет |
| **SO-13** | Вернуть плагинные корни в sync — только вместе с портом `plugins/` | `sync-core.ts` (`scanSourceRoots`), `sync.types.ts` (`extraSourceDirs`), `sync-skills-core.ts`, новый `services/plugins/plugin-assets.ts`, `package.json.files`, `path-normalizer.ts` (`RULE_PLUGIN_DIRECTIVES`) | порт `sync-skills-core.test.ts:237,246,265`; `publish-contents.e2e.test.ts`; golden из SO-5 | M (заблокирована портом плагинов) | нет |
| **SO-14** | Развести имена: `gennady sync` / `sync-skills` / `sdd-sync` / `sdd-migrate` — четыре разные операции, три называются `*sync*`; `help` должен явно писать, что `sync-skills` трогает `ai/directives/` | `RC/cli/cmd/*/help.ts`, `RC/cli/gennady.ts:140,229,330,334,426`, `RC/specs/cli/cli.spec.md` | нет (документационная) | S | нет |

| **SO-14** *(расширена — 06 §5.2 п.42, `R3:220`)* | дополнение к строке выше: help разводит **не только четыре `*sync*`**, но и `orient` / `agents-orient` / `sdd-orient` / будущий `sdd-rules` — восемь имён, каждое описано одной строкой без пересечения предметов | те же файлы + `cli/cmd/orient/**`, `cli/cmd/agents-orient/**` | grep-замок: каждое из восьми имён в help описано; `sdd-sync` описан как **tracker-status/rollup**, слова `back-sync` как обещания механизма нет | S | нет; критерий **A20**, координировать с `T-B6-28` (тот же словарь) и `T-10` (переименование `agents-rules` → `agents-orient`) |

Порядок: **SO-1, SO-2, SO-2b, SO-7, SO-11** (первая волна, блокеры релиза) → SO-8 (по решению оператора, D-2) → SO-9, SO-4, SO-5, SO-6 → SO-3 (целевая архитектура, **надстройка** над SO-1/SO-2 — не замена: §3.2 требует, чтобы `project-owned` остался сильнее манифеста и в SO-3 тоже) → SO-10, SO-12 → SO-13 после плагинов → SO-14 в любой момент.

### 4.1-bis. Владение файлом: `@spec` вместо `@tasks` — задачи `FO-1..FO-7` (дельта гейта адекватности, **D-40**)

Отдельный подтрек, заведённый гейтом адекватности (`06-ADEQUACY-GAP.md` §5.1 п.5–12, §3.1) и **утверждённый D-40: полный переход на `@spec` в `2.0.0-draft`**, `FO-1..FO-6` — в релиз, `FO-7` — после релиза. Предмет соседний с этим треком (владение), но поверхность другая: не `sync`/`sync-skills`, а **шапка файла и резолвер владения**. Критерий приёмки — **A17**.

| id | Цель | Файлы | Тесты | Размер | Блокер релиза |
|---|---|---|---|---|---|
| **FO-1** | ADR семантики связей файла: `semantic owner` / `planned` / `active` / `blocked` / `history` + **семь evidence-классов**; отменить правило «каждый historical `@tasks` — owning task» для v2 | новый ADR в `specs/**`; постановка `AX_FILE_HEADER_TASK_TRACEABILITY` | ADR принят; ни одно последующее `FO-*` ему не противоречит | M | нет (предпосылка A17); **разблокирована D-40** |
| **FO-2** | Pure core `shared/sdd/file-relations.ts`: exact-path сопоставление `Target Files`/`Deleted Files`, статусы фаз, receipts, cross-check `Spec References` ↔ `@spec` | новый `shared/sdd/file-relations.ts` | `file-relations.test.ts`: **declared и observed разведены**, `declared` никогда не показывается как доказанное изменение (`ownership-plan:57`, предупреждение R2 №9, `R2:394`) | L | нет; **стоимость L не измерена** (06 §6 п.5: зависит от фактического числа коллизий; внешний аудит нашёл 6 конфликтующих групп акронимов в 67 v1-спеках, `R3:155`, на текущем дереве не пересчитывалось) |
| **FO-3** | Адаптер `gennady orient --file` (+ `--history`, versioned `--json`); **нового `sdd-owner` не создавать** | `cli/cmd/orient/**` | `orient --file` резолвит owner; `--history` показывает историю; `--json` версионирован | M | нет |
| **FO-3a** | Снять hard-coded `/^TSK-\d+$/` из парсера шапки: canonical `<ACR>-<slug>` распознаётся, legacy `TSK-NN` остаётся | `cli/cmd/orient/core/extract-header.ts:27-32` | заголовок с `<ACR>-<slug>` распознан; `TSK-NN` по-прежнему распознан | S | нет; вариант-независима, **Волна 0** |
| **FO-4** | `sdd-check`: owner resolution / active collision / spec mismatch для v2 и mixed; **flow-gating** `checkTasksAppendOnly` (`sdd-check.cmd.ts:1226,1233`); **orphan-`@spec`** (передан из переформулированной `B2-12`) | `cli/cmd/sdd-check/sdd-check.cmd.ts:1226,1233`; `shared/sdd/check.ts` | два active writer-а → **fail closed**; orphan-`@spec` → finding | M | нет; **владелец orphan-проверки** (разбор — `61 §2.2` п.8) |
| **FO-5** | Consumers зовут resolver; `reconcile.directive.hbs:116-122` перестаёт reopen-ить по историческому `@tasks`. **В объём по D-40:** аксиома `AX_FILE_HEADER_TASK_TRACEABILITY`, шапка в `templates.ts`, `tasks-append-only`, директива reconcile, парсер `orient/core/extract-header.ts` — правятся под `@spec` | `reconcile.directive.hbs:116-122`; `AX_FILE_HEADER_TASK_TRACEABILITY`; `shared/sdd/templates.ts` (шапка); `tasks-append-only`; `cli/cmd/orient/core/extract-header.ts` | reconcile не переоткрывает по историческому `@tasks`; `npm run audit:sdd-templates` зелен на новой шапке | M | нет |
| **FO-6** | Миграционный адаптер заголовков: legacy `@tasks` → evidence candidates, `@spec` **только из однозначного mapping**, ambiguous → migration report. **Шаг мигратора, механически переписывающий шапки `@tasks` → `@spec` (D-40), принадлежит этой задаче** | `cli/cmd/sdd-migrate/**`; migration report | однозначный mapping → `@spec`; ambiguous → строка в migration report, а **не догадка** | M | нет; предпосылка `E-14` (самомиграция) |
| **FO-7** | Решение о кэше resolver-а — **только по измерениям**, безусловный кэш не вводится | `shared/sdd/file-relations.ts` (кэш) | измерение до/после; без измерения решение не принимается | S | нет — **пост-релиз по D-40**; внесена в `60 §3` |

Порядок: **FO-3a** и **FO-1** (Волна 0, вариант-независимы) → **FO-2** → **FO-3** / **FO-4** / **FO-5** (Волна 3, параллельно после `FO-2`) → **FO-6** (Волна 4, до `E-14`) → **FO-7** (после релиза, по измерениям).

### Минимальная альтернатива SO-3 (D-1, вариант 1′)

Полноценный «портировать main + два фикса» (SO-1+SO-2 без остального) не проходит как релизный гейт: cloud-ios всё равно теряет 4 из 5 rule-файлов и получает реестр с висячими `<File>`-ссылками (SO-11 не сделан → новый тихий отказ); SO-2 в узкой формулировке не закрывает S5-bis (`sdd-execute/scripts/` продолжает исчезать молча); S4 и S2 не тронуты вовсе.

Но существует **минимальная** альтернатива полной хэш-модели SO-3, состоящая из **четырёх S/M-задач**, а не одной L: **SO-1 + SO-2 + SO-2b + SO-7**, усиленная **SO-11** (пятая, тоже S, без которой SO-1 создаёт новый тихий отказ). С этим набором оба реальных потребителя (messenger, cloud-ios) переживают первый v2-sync, не потеряв ничего, кроме устаревших **пакетных** файлов — это подтверждено прогонами обеих сессий на репро-фикстурах.

Это прямо закрывает **D-6**: `ISS-3` (#9.4, sync-skills удаляет проектные скиллы) — через SO-2 (манифест orphan-скиллов) + SO-2b (гейт внутрискиллового зеркала); `ISS-13` (#24, sync перетирает локальное) — через SO-1 (реестр project-owned) + SO-7 (партиальное чтение источника не удаляет) + SO-11 (замок на дефолтные `<File>`-ссылки, чтобы SO-1 не создавал висячий реестр). Отсюда — блокерный набор в шапке документа: **SO-1, SO-2, SO-2b, SO-7, SO-11**. SO-3 остаётся рекомендованной целевой архитектурой (единый хэш-манифест на обе поверхности, `locally-modified`/`--force`) и должна быть сделана как надстройка после релиза, но не обязана блокировать его при выполнении минимального набора.

### 4.2. Решения оператора

**D-1. Как далеко идёт владение.**
1. Только порт main: `preserved` для `knowledge.xml` + манифест имён скиллов; зеркальное удаление директив **выключить**. Дёшево, но устаревшие директивы снова живут в проектах вечно, а патчи теряются. Хуже варианта 1′ и хуже (2).
2. Порт main + хэш-манифест для обеих поверхностей (SO-3). Закрывает #24/`ISS-13` целиком, требует нового формата состояния и `--force`. Рекомендуется как **целевая архитектура**.
3. Хэш-манифест + overlay-каталог как документированный контракт (`ai/directives/local/`), реестр остаётся единственным project-owned файлом. То же, что (2), плюс дешёвая документация — фактическое поведение `warnings` уже соответствует.
4. Хэш-манифест + overlay-реестр (`knowledge.local.xml`, merge в `loadRuleRegistry`). Максимальная гибкость, но требует правил приоритета и дедупа `id`, и `<Rule>` без `<File>` бросает уже на входе — сложность в машинно-читаемом пути. **Не рекомендуется.**
5. **(1′, минимальная альтернатива, рекомендуется как релизный минимум).** SO-1 + SO-2 + SO-2b + SO-7 + SO-11 — четыре S/M-задачи вместо одной L, полностью спасают messenger и cloud-ios по прогонам обеих сессий; SO-3 (вариант 2) остаётся целевой архитектурой следующего шага, а не блокером.

**D-2. Что первый v2-sync делает с v1-деревом (`ai/directives/sdd/`, v1-скиллы).**
1. Ничего: оставить рядом, warning. Проект живёт с двумя комплектами директив и реестром, не указывающим ни на один (текущее поведение RC).
2. Удалить зеркалом. Быстро и грязно: у messenger'а в `sdd/` есть проектные `fix.directive.xml`, `svelte-ui-discovery.directive.xml` — умрут.
3. Явный шаг миграции по известным хэшам v1-релизов, сначала читающий существующий `.gennady-synced` main-потребителя: неизменённые v1-файлы → backup/удаление по подтверждению, изменённые и незнакомые → оставить и перечислить; `sync` сам не делает ничего (SO-12). **Рекомендуется.**
4. `sync` печатает migration-hint и **отказывается** синкать, пока оператор не выполнил шаг миграции (жёсткий гейт). Безопаснее всех, но ломает «поставил пакет — синкнул»; стоит оценивать выше, чем изначально казалось — первый v2-sync на cloud-ios и так теряет 4 из 5 правил и 25 файлов скиллов, отказ синкать до миграции может оказаться дешевле молчаливой потери.

Связано с этим: `--prune-foreign` (§3.1) обязан идти под тем же гейтом известных v1-хэшей, что и SO-12, иначе он уничтожит именно то, что модель защищает.

**D-3. Судьба зеркального удаления директив (RC-новшество).**
1. Убрать целиком, вернуть v1-семантику. Теряем правильную цель (устаревшее должно исчезать).
2. Оставить как есть (owned-подкаталоги). Продолжаем удалять проектные rule-файлы: на messenger'е — `coding/logging-rules.xml`; **на cloud-ios — сразу 4 файла (`swift-rules.xml`, `objc-rules.xml`, `swiftlint-setup.xml`, `xctest-rules.xml`), одновременно с уничтожением самого реестра.**
3. Ограничить манифестом (SO-3/SO-2b): удаляется только то, что мы записали и что не менялось. **Рекомендуется.**
4. Оставить, но перевести в opt-in `--prune` (как akkrat предлагал в #9.4 для скиллов). Проще (3), но по умолчанию проекты копят мусор.

**D-4. Связка `sync-skills` → `sync`.**
1. Оставить как есть: любой `sync-skills` (даже с фильтром одного скилла) делает полный зеркальный sync директив.
2. Уважать фильтр и запретить удаление в этом под-вызове.
3. Сделать директивный проход opt-in (`--with-directives`), по умолчанию off; документировать «сначала `sync`, потом `sync-skills`». **Рекомендуется** — узкая команда не должна выполнять самое широкое действие; это S-задача (SO-9), которая одна снимает самый неожиданный из подтверждённых сценариев потери (`gennady sync-skills sdd-execute` стирает регистрацию правила в реестре), стоит поднять в первую волну вместе с SO-1/SO-2.
4. Слить в одну команду `gennady sync [--skills]` и убрать `sync-skills` (main отвергал слияние из-за разной семантики; в v2 семантика сблизилась — обе теперь зеркала).

---

## 5. Приложение — точные ссылки

**RC (v2).** `cli/cmd/sync/sync-core.ts:16` (`EXCLUDED_ENTRIES`), `:108-120` (`listOwnedSubdirs`), `:134-174` (`scanTargetMirrorSpace`), `:176-182` (`collectRecursive`), `:217` (единственный корень), `:226-244` (зеркальное удаление), `:261-268` (лестница без `preserved`) · `sync.types.ts:6` · `sync.cmd.ts:75,87` · `cli/cmd/sync-skills/sync-skills-core.ts:22` (`EXCLUDED_NAMES`, декларация; применение `:84`), `:158-181` (`collectOrphanFiles`), `:192-268` (`deleteOrphan`), `:332`, `:377-392` (файловое зеркало), `:396-403` (orphan-набор) · `sync-skills.cmd.ts:67-118` (`syncDirectivesFirst`, `opts` без `subdirs` на `:84-88`), `:136` (`rmSync`), `:154-168`, `:181` · `sync-skills-formatter.ts:88-124,147-153` · `shared/common/sync/sync-core.shared.ts:15-28,36-59,67-70` · `path-normalizer.ts:34-95` · `shared/sdd/task-authoring-literals.ts:59-91` (`parseRuleRegistry:59-74`, дубль на `:70`; `loadRuleRegistry:76-91`) · `cli/cmd/sdd-new/help.ts:92`, `sdd-new.cmd.ts:476-478,553`, `sdd-new.types.ts:144-151,314` · `cli/cmd/sdd-sync/sdd-sync.cmd.ts:39-51,55-85,95-127,135-244` · `shared/sdd/tracker.ts:67` (`updateTrackerStatus`) · `ai/directives/knowledge.xml:1-2` · `ai/directives/agent-inbox/golden-chat-output.example.md:176` · `ai/directives/sdd-v2/infra.directive.xml:83,243` · `ai/kit/axiom/scaffold/ax-rule-activation-plan.xml:3-4` · `ai/skills/README.md:75-83` · `specs/cli/sync-skills/sync-skills.spec.md:5,19-24,54-57,229,331,336-343` · `specs/cli/sdd-sync/sdd-sync.spec.md:9-25` · `specs/cli/sync/sync.spec.md:34,282-292` · `scripts/test-topology.ts:181-196` · `cli/__tests__/e2e/setup.ts:1-70` · `cli/cmd/sdd-migrate/sdd-migrate.cmd.ts:1-2` · `package.json` (`files`, `scripts.test`).

**MAIN (v1).** `cli/cmd/sync/sync-core.ts:16-21,23-27,84-132,95-101,147-152,217,239-241,254` · `sync.types.ts:8,19` · `sync-core.test.ts:223,242` · `cli/cmd/sync-skills/sync-skills-core.ts:25,32,42,62,96,115,128,147,158-207,272,520-600` · `sync-skills-core.test.ts:151,165,237,246,265,360,377,391,538-627` · `sync-skills.cmd.ts:19,101` · `shared/common/sync/sync-core.shared.ts:10-46` · `path-normalizer.ts:34-96` · `services/plugins/plugin-assets.ts:43-54,65-88` · `scripts/__tests__/deployed-surface.test.ts:14,23-41,47,74,82` + `.golden.txt` (80) · `cli/__tests__/e2e/sync-skills.e2e.test.ts` (`runFromCheckout`, `registerSyncSkillsCheckoutTests`) · `cli/__tests__/e2e/publish-contents.e2e.test.ts:26-46` · `ai/directives/knowledge.xml:2-7,80` · `ai/skills/sdd-execute/scripts/check.sh:307-310` · `specs/cli/sync-skills/sync-skills.spec.md:5,25-29,103-113,233-234,290,378`.

**Потребители.** `/Users/k.lebedev/Developer/messenger/ai/directives/{coding/logging-rules.xml, coding/result-conventions.xml, language/, perf-auditor/, sdd/{fix,svelte-ui-discovery}.directive.xml, knowledge.xml}`; `.claude/skills/{lang-lint,run-e2e,uikit-component-generate,sdd-execute/scripts/*}` — прочитаны, не изменены, контрольная проверка после прогонов подтвердила целостность. cloud-ios: `git archive origin/ap/CLOUDIOS-NOISSUE-swiftlint-exceptions-infra-base -- ai/directives .claude/skills` — воспроизведено буквально, не по фактам задания.

---

## 6. Итог верификации

**Что проверялось.** Независимая верификация (V-B3, свежие глаза, adversarial, read-only) перепроверила ~150 цитат `file:line` из аналитики B3 по коду обоих чекаутов, повторила все воспроизводимые прогоны на отдельных копиях (unit-тесты RC, синтетическую фикстуру, реальное дерево messenger, S4/S2-репро), и добавила один прогон, которого в B3 не было буквально — cloud-ios через `git archive`.

**Счёт по цитатам:** **CONFIRMED ~140**, **WRONG-LINE 8** (все сдвиги ±1–2 строки, ни одна не меняет смысла — исправлены прямо в тексте выше: `sync-skills-core.ts:21→22`, `sync-skills.cmd.ts:82-86→84-88`, `task-authoring-literals.ts:60-73→59-74` и `:69→70`, `ax-rule-activation-plan.xml:3→4`, `path-normalizer.ts` RC `34-96→34-95`, `updateTrackerStatus` — определена в `tracker.ts:67`, а не в `sdd-sync.cmd.ts`), **REFUTED 2** (обе — про механизм форматтера/методику, не про факт: «при `added` — тоже только свои» и «MAIN CLI не стартует»).

**Что изменилось по существу относительно первого прохода:**

| Правка | Было в B3 | Стало после верификации |
|---|---|---|
| Вердикт S2 | ЧАСТИЧНО | **НЕ ЗАКРЫТО** — функциональный регресс (`exit 1` вместо `exit 0`), не латентная дыра |
| S4 | аргумент/рассуждение | **репро**: `chmod 000` на один подкаталог → 8 живых пакетных файлов удалены, `exit 0`, без warning |
| S5-bis / форматтер | «скрывает при `updated`, скрывает при `added`» | **три ветки, две лгут**: `added` печатает удаление как `(would add)`, `deleted` печатает сохранённый `SKILL.md` как удаляемый; плюс противоречие спеки коду (`:229`) и счётчик «записи ≠ файлы» (22 vs 25) |
| cloud-ios | «по фактам задания, воспроизведено фикстурой» | **воспроизведено буквально** через `git archive`; сильнее messenger'а (4 из 5 rule-файлов + реестр + 25 файлов скиллов одним прогоном) |
| Арифметика §1.12 | S3 посчитан дважды, «НЕ ЗАКРЫТО 6» при 7 перечисленных | **НЕ ЗАКРЫТО 8 · ЧАСТИЧНО 2 · НЕПРИМЕНИМО 3** = 13 строк |
| §3.1 дизайн | таблица с пересекающимися ключами, `.gennady-synced` без учёта v0-формата, `project-owned` не короткозамыкал удаление | упорядоченный набор проверок, явный v0-reader, `project-owned` — предикат первым |
| Overlay-реестр (§2.3) | отвергнут из-за дубля `id` (аргумент слабый) | отвергнут по трём более сильным причинам (хрупкость на `<Rule>` без `<File>`, replace→merge в критичном пути, два расходящихся читателя) |
| Блокеры релиза | 6 задач (SO-1,2,3,4,9,12) | **минимальный набор SO-1+SO-2+SO-2b(новая)+SO-7+SO-11**, закрывающий D-6 (`ISS-3`/`ISS-13`) без обязательного SO-3; SO-3 остаётся целевой архитектурой, не гейтом |
| G2-фикстуры | 8 фикстур, «целиком детерминированный», полный `deepEqual` | 10 фикстур (разделён `v1-consumer`, добавлены `manifest-v0` и unit-гейт S4), e2e-слой признан частично внешним, метрика — дельта, не полный `deepEqual` |

**Воспроизводимость.** RC unit-тесты трека (140/0/31) воспроизведены независимо с идентичным счётом. Синтетическая фикстура, реальное дерево messenger, репро S4 (директивы и скиллы) и репро S2 воспроизведены на отдельных копиях с идентичными числами. cloud-ios воспроизведён впервые буквально в рамках верификации. Ни один вердикт матрицы §1.12 не изменился по итогам верификации, кроме S2.

**Итоговый вывод не изменился в направлении, но сузился в объёме релизного гейта.** v2 остаётся агрессивнее и опаснее v1 на этом треке — «чистит устаревшее, но вместе с проектным, без манифеста». Минимально необходимый и достаточный набор для выполнения решения оператора **D-6** (закрыть #9.4/`ISS-3` и #24/`ISS-13` как блокеры релиза) — пять S/M-задач: **SO-1, SO-2, SO-2b, SO-7, SO-11**. Полная единая хэш-модель владения (SO-3) остаётся рекомендованной целевой архитектурой и должна быть сделана, но не обязана блокировать первый релиз v2 при выполнении минимального набора.

Документ ждёт решений оператора D-1–D-4 (§4.2); после их принятия задачи SO-1..SO-14 (+ SO-2b) могут быть напрямую переданы в `sdd-scaffold`.
