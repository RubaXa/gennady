# Часть I — B3-sync-ownership-track (аналитик)

# B3 — Трек SYNC-OWNERSHIP: перенос v1 → v2

Read-only аудит. Идентификаторы, пути и строки — verbatim.

- **MAIN (v1)** = `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e` (origin/main `8bb38477`, `0.9.0-next.3`)
- **RC (v2)** = `/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad/rc-v6` (`codex/sdd-v2-rc52-followup`, `package.json.version = 0.8.4`)
- Входы прочитаны: `A1-main-delta.md` §3.3 (S1–S9), §3.4 (R3–R5); `A4-issues-verdicts.md` #9.4, #11, #24.
- Merge-base v2 ↔ main = `46c6d616` (A4 §0). Ни один из sync-фиксов main (`d6479748`, `62172906`, `40d209d8`, `e2b6087c`, `f66a77ee`, `7d48149d`, `f74c8c1d`, `5a237cd5`) не является предком v2.

## 0. Что было реально запущено (воспроизводимо)

| Что | Команда | Результат |
|---|---|---|
| RC unit-тесты трека | `sh -c 'cd <RC> && node --import tsx --test --experimental-test-module-mocks cli/cmd/sync/__tests__/*.test.ts cli/cmd/sync-skills/__tests__/*.test.ts shared/common/sync/__tests__/*.test.ts'` | **140 pass / 0 fail**, 31 suite, 720 ms |
| RC `sync --dry-run` на синтетической фикстуре | `sh -c 'cd <F> && <RC>/node_modules/.bin/tsx <RC>/cli/gennady.ts sync --dry-run'` | см. §1.10 |
| RC `sync-skills --dry-run` там же | то же, `sync-skills --dry-run` | см. §1.10 (сначала печатает полный `sync`!) |
| RC `sync-skills` **реальный** на копии фикстуры | `B3-realrun.sh` | 4 удаления, из них 1 **невидимое в выводе** |
| MAIN `collectAndCompare` + `collectAndCompareSkills` на той же фикстуре | `B3-main-core-driver.ts` (CLI main в этом worktree не стартует — нет `node_modules`, `yaml` не резолвится; ядро вызвано напрямую) | `preserved knowledge.xml`, 0 удалений |
| RC `sync`/`sync-skills --dry-run` на **копии реального дерева messenger** | `B3-messenger-sim.sh` | см. §1.11 |

Скрипты-артефакты (в scratchpad, не в репозиториях): `B3-mkfixture.sh`, `B3-realrun.sh`, `B3-mainrun.sh` (неудачный, зафиксирован), `B3-main-core-driver.ts`, `B3-messenger-sim.sh`.

Замечание по методу: ни `sync`, ни `sync-skills` **не имеют** флага `--target`/`--cwd` — target жёстко `process.cwd()` (`RC/cli/cmd/sync/sync.cmd.ts:75,87`; `RC/cli/cmd/sync-skills/sync-skills.cmd.ts:152,181`). Указать целевой каталог без смены cwd невозможно, поэтому использован `sh -c 'cd <fixture> && …'` — **разрешено, не отклонено**. Одиночный `cd …` в составной bash-команде отклоняется песочницей, `sh -c` — нет.

---

## 1. Матрица инвариантов S1–S9 (+ R3–R5 в части `knowledge.xml`)

### S1 — `knowledge.xml` project-owned, статус `preserved`

**v1:** `PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])` — `MAIN/cli/cmd/sync/sync-core.ts:27`; статус `preserved` — `:239-241`; запись подавлена — `:254`; `SyncFileStatus = 'added'|'updated'|'unchanged'|'preserved'` — `MAIN/cli/cmd/sync/sync.types.ts:8`; шапка «PROJECT-OWNED …» — `MAIN/ai/directives/knowledge.xml:2-7`. Тесты: `MAIN/cli/cmd/sync/__tests__/sync-core.test.ts:223` («preserves a project-owned knowledge.xml that differs: status preserved, never written»), `:242` («seeds knowledge.xml when absent: status added, written»).

**v2:** отсутствует. `RC/cli/cmd/sync/sync.types.ts:6` — `SyncFileStatus = 'added' | 'updated' | 'deleted' | 'unchanged'`; лестница статусов `RC/cli/cmd/sync/sync-core.ts:261-268` не знает project-owned; `grep PROJECT_OWNED` по `RC/cli`, `RC/shared` = 0; `RC/ai/directives/knowledge.xml:1-2` начинается сразу с `<AiKnowledge ver="2.0">` / `<Rules>` — шапки о владении нет.

**Эмпирика:** проектный `knowledge.xml` со Swift-реестром → `~ knowledge.xml (would update)`; после реального прогона первые строки файла — пакетный TS-реестр (`<CheckPhaseOrder>typecheck test lint format</CheckPhaseOrder>`, `Rule id="typescript-rules"`).

**Ужесточающий факт v2 (нового качества):** в v2 реестр читает **сам тулинг**, а не только агент — `RC/shared/sdd/task-authoring-literals.ts:76-91` `loadRuleRegistry()` предпочитает `<repoRoot>/ai/directives/knowledge.xml` и только при его отсутствии падает на пакетную копию; `parseRuleRegistry` (`:60-73`) отдаёт кортежи `id`/`file`, которые `sdd-new` вставляет в каждый новый тикет (`RC/cli/cmd/sdd-new/help.ts:92`, `sdd-new.types.ts:148,314`). Т.е. после первого v2-sync на Swift-проекте **каждый созданный тикет** будет цитировать `typescript-rules`/`svelte5-runes`. В v1 потеря реестра ломала каскад для агента, в v2 она детерминированно портит артефакты.

**Вердикт: НЕ ЗАКРЫТО** (прямой регресс относительно main + усилен машинным потребителем).

### S2 — `resolvePackageDir` находит корень пакета подъёмом до `package.json` с `name === 'gennady'`

**v1:** `MAIN/shared/common/sync/sync-core.shared.ts:10-46`. Тест: `MAIN/shared/common/sync/__tests__/sync-core.shared.test.ts` «resolvePackageDir»; e2e `MAIN/cli/__tests__/e2e/sync-skills.e2e.test.ts` → `registerSyncSkillsCheckoutTests()` «resolves the package from a checkout that has no node_modules/gennady».

**v2:** `RC/shared/common/sync/sync-core.shared.ts:36-59` — три стратегии: (1) `<projectRoot>/node_modules/gennady/<subdir>`; (2) `import.meta.resolve('gennady')` + **отрезание `/dist/…`** (`:47` — ровно та регулярка, которую main заменил подъёмом по `package.json`); (3) `resolveSelfRepoDir` (`:15-28`) — работает только когда **сам** `projectRoot` есть репозиторий gennady. Кейс «CLI запущен из клона/`npm link`, а cwd — чужой проект без `node_modules/gennady`» стратегиями (1)–(3) не покрыт: (1) промах, (2) `pkgFile` = исходник, отрезать `dist` нечего → `join(<путь-к-файлу>, subdir)` не существует, (3) чужой `package.json` ≠ `gennady`. Тесты RC: `RC/cli/cmd/sync/__tests__/sync-core.test.ts:68,78` — только «finds local node_modules/gennady» и «returns null when package not found»; checkout-сценарий и его suite в v2 **удалены** (см. diff `cli/__tests__/e2e/sync-skills.e2e.test.ts`, минус `runFromCheckout` и `registerSyncSkillsCheckoutTests`).

**Вердикт: ЧАСТИЧНО** (для published-install работает; клон/`npm link` — открытая дыра, замка нет).

### S3 — объединение нескольких корней (base + `plugins/*/{directives,skills}`)

**v1:** `scanSourceRoots` — `MAIN/cli/cmd/sync/sync-core.ts:84-132`; `extraSourceDirs` — `MAIN/cli/cmd/sync/sync.types.ts:19`, проброс `sync.cmd.ts:91`, `sync-skills.cmd.ts:101`; `pluginSurfaceDirs` — `MAIN/services/plugins/plugin-assets.ts:43-54`; `files[]` несёт `plugins/*/directives/**/*`, `plugins/*/skills/**/*` (`MAIN/package.json`).

**v2:** ничего из этого нет. `RC/services/plugins/` не существует; `plugins/` в RC отсутствует; `RC/cli/cmd/sync/sync.types.ts` не имеет `extraSourceDirs`; `collectAndCompare` работает по единственному `opts.sourceDir` (`RC/cli/cmd/sync/sync-core.ts:217`); `scanSkills(opts.sourceDir, opts.skillNames)` — один корень (`RC/cli/cmd/sync-skills/sync-skills-core.ts:332`); `RC/package.json.files = ["dist/**/*","README.md","ai/**/*","cli/cmd/orient/README.md"]`.

**Вердикт: НЕПРИМЕНИМО СЕЙЧАС / НЕ ЗАКРЫТО ПРИ ПОРТЕ.** Плагинного слоя в v2 нет вовсе (A4 §0), поэтому «объединение корней» нечего объединять. Но это единственный инвариант трека, который **обязан** вернуться вместе с портом стек-плагинов (трек VERIFY, #9-bonus/#20): без него плагин не сможет поставлять ни директиву, ни скилл.

### S4 — проглоченная ошибка чтения корня не должна опустошать источник и вызывать orphan-удаление

**v1:** `scanAllSkillRoots` — `MAIN/cli/cmd/sync-skills/sync-skills-core.ts:158-190`: только ENOENT/ENOTDIR и только для `index > 0` терпимы, база и EACCES/EIO — фатальны; в `sync` `statSync` обёрнут точечно (`MAIN/cli/cmd/sync/sync-core.ts:95-101,147-152`), чтобы одна битая ссылка не выкосила корень. Тесты: `sync-skills-core.test.ts:237` («tolerates a missing plugin root»), `:246` («throws on an unreadable base root instead of emptying the union (review P1)»), `:265` («throws when a plugin root exists but is unreadable»).

**v2:** дисциплина не просто не портирована — **инвариант нарушен в новом месте.** RC ввёл зеркальное удаление директив (`RC/cli/cmd/sync/sync-core.ts:226-244`), а источник для него собирает `scanDirectives` → `collectRecursive`, где любой отказ `readdirSync` **молча даёт частичный список** (`RC/cli/cmd/sync/sync-core.ts:176-182`: `try { entries = readdirSync(dir) } catch { return }`). Частичный источник + зеркало = удаление в target файлов, которые пакет на самом деле поставляет. В main та же catch-ветка безобидна: там нет удаления, худший исход — недокопировали. Симметрично в `sync-skills`: `scanSkills`/`scanSkillsRecursive` глотает те же ошибки, а `collectAndCompareSkills` из неполного источника выведет orphan-ов (`RC/cli/cmd/sync-skills/sync-skills-core.ts:396-403`).

**Вердикт: НЕ ЗАКРЫТО, состояние хуже v1** (класс ошибки, стоивший инцидента `40d209d8`/`e2b6087c`, воссоздан на директивах).

### S5 — `sync-skills` удаляет только то, что поставил сам (манифест `.claude/skills/.gennady-synced`)

**v1:** `MANIFEST_NAME = '.gennady-synced'` — `MAIN/cli/cmd/sync-skills/sync-skills-core.ts:32`; `readSyncManifest:42`, `writeSyncManifest:62`, `adoptPackageInstalled:96`, `nextManifestNames:115`; применение `:581-600`. Спека: `MAIN/specs/cli/sync-skills/sync-skills.spec.md:5,25-29,103-113,233-234,290,378`. Тесты: `sync-skills-core.test.ts:377` («leaves a project-authored skill alone — it is not in the manifest»), `:391`, `:538`, `:549`, `:563`, `:577`, `:592`, `:606`, `:617`, `:627` («lifecycle — install, filtered sync, package removal, retry after a failed prune»).

**v2:** манифеста нет (`grep gennady-synced` по `RC/cli`, `RC/shared`, `RC/ai`, `RC/specs` = 0). orphan-ами считаются **все** каталоги target, которых нет в source: `RC/cli/cmd/sync-skills/sync-skills-core.ts:396-403`; удаление — `deleteOrphan:192-268` (по умолчанию `rmSync(path,{recursive:true,force:true})`, `RC/cli/cmd/sync-skills/sync-skills.cmd.ts:136`). Спека RC прямо легитимирует потерю: `RC/specs/cli/sync-skills/sync-skills.spec.md:331` — «Orphan-удаление деструктивно: пользовательские скилы, не принадлежащие gennady, будут удалены — это задокументированное поведение»; `:336-343` D-M006 «Orphan-удаление: полная синхронизация» (rsync `--delete`). Тест RC фиксирует именно это: `RC/cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts:244` («detects orphan skills (deleted from source but present in target)»).

**Эмпирика:** на фикстуре — `generate-codeowners/`, `write-uitests/` удалены (ровно issue #9.4). На копии messenger — удалены `lang-lint/`, `run-e2e/`, `uikit-component-generate/` (проектные) плюс `alt-opinion/` и весь v1-набор `sdd-*`.

**Вердикт: НЕ ЗАКРЫТО** (регресс относительно main; спека v2 закрепляет пред-#10 поведение как решение).

### S5-bis — новое в v2: файловое зеркало **внутри** поддерживаемого скилла, невидимое в отчёте

Не входит в S1–S9 (в main такого кода нет), но принадлежит треку и найдено эмпирически.

`RC/cli/cmd/sync-skills/sync-skills-core.ts:377-392`: после копирования пакетных файлов остаток `targetFiles` внутри того же скилла помечается `deleted` и удаляется (`deps.unlink!`). Комментарий `:380-381` объявляет это осознанным («Existing skill directories are mirrors too»).

Форматтер это **скрывает**: в группе с dominant-статусом `updated` печатаются только записи `added|updated` (`RC/cli/cmd/sync-skills/sync-skills-formatter.ts:100-110`); при `added` — тоже только свои (`:88-94`). Строки `deleted` печатаются только когда dominant всей группы = `deleted` (`:111-124`). А `dryRun` вообще не печатает счётчики — только `'Dry-run: no files written.'` (`:147-148`).

Эмпирика (реальный прогон): `.claude/skills/sdd-execute/local-helper.sh` **удалён**, в выводе — только `~ sdd-execute/ SKILL.md`, итог `Synced: 12 added, 1 updated, 0 skipped, 4 deleted` (4 = 3 orphan-каталога + этот файл), имени файла нет нигде. `--dry-run` о нём тоже молчит.

**Вердикт: НЕ ЗАКРЫТО (v2-only дефект).** Молчаливая потеря данных: `--dry-run` не может служить предпросмотром.

### S6 — тесты скилла никогда не деплоятся (`__tests__`, `*.test.*`, `*.spec.*`)

**v1:** `EXCLUDED_NAMES = new Set(['.DS_Store', '__tests__'])` — `MAIN/cli/cmd/sync-skills/sync-skills-core.ts:25`; `isTestArtifact` — `:128`; применение `:272`. Тесты: `sync-skills-core.test.ts:151` («never deploys a skill’s `__tests__` directory»), `:165` («never deploys a stray test file sitting beside the scripts»); плюс `MAIN/scripts/__tests__/deployed-surface.test.ts:74` («ships no test file — those import from this checkout and break a consumer typecheck»).

**v2:** механизм снят: `EXCLUDED_NAMES = new Set(['.DS_Store'])` — `RC/cli/cmd/sync-skills/sync-skills-core.ts:21`; `isTestArtifact` отсутствует; фильтр `:84` = только dot-имена и `.DS_Store`. Сейчас вакуумно безопасно: под `RC/ai/skills/` ровно 14 файлов, ни одного `__tests__`/`*.test.*`. Но `RC/package.json.files` содержит `ai/**/*`, так что первый добавленный тест скилла уедет и в tarball, и в `.claude/skills/` потребителя.

**Вердикт: НЕ ЗАКРЫТО** (латентный регресс: защита удалена, замка нет).

### S7 — golden деплой-поверхности

**v1:** `MAIN/scripts/__tests__/deployed-surface.test.ts` + `deployed-surface.golden.txt` (**80** строк); три `it`: «matches the committed golden file» (`:47`), «ships no test file …» (`:74`), «leaks no developer path into a consumer project» (`:82`). Обновление только через `UPDATE_SURFACE_GOLDEN=1`.

**v2:** каталога `RC/scripts/__tests__/` не существует; `find RC -name 'deployed-surface*'` = 0. Никакого снимка того, что уезжает в проект, нет.

**Эмпирика — почему это не формальность.** Реальная деплой-поверхность RC на фикстуре: **105** файлов в `ai/directives/` + **13** в `.claude/skills/` (12 скиллов) = 118. Среди них найдена утечка dev-пути в **содержимом**:

```
RC/ai/directives/agent-inbox/golden-chat-output.example.md:176
**Артефакты:** [папка отчёта](/Users/k.lebedev/.gennady/agent-inbox/reports/group__proj-510) · …
```

Файл синкается в каждый проект. `SYNC_PATH_RULES` в RC правила для `/Users/<user>/.gennady/` не имеют (`RC/shared/common/sync/path-normalizer.ts:34-96`), поэтому путь уезжает как есть. В main тот же файл существует (`MAIN/ai/directives/agent-inbox/golden-chat-output.example.md`, есть в golden) и **чист** — `grep -rl k.lebedev` по всей синкаемой поверхности main = 0 совпадений.

Отдельно: тест main проверяет утечку только в **именах** путей (`p.includes('/Users/') || p.includes('~/')`, `deployed-surface.test.ts:83`), а не в содержимом — этот конкретный случай он бы тоже не поймал. Для v2 замок нужно строить по содержимому.

**Вердикт: НЕ ЗАКРЫТО** (нет ни golden, ни любой другой проверки; уже есть материальная утечка).

### S8 — нормализация путей и цель установки скиллов

**v1:** `MAIN/shared/common/sync/path-normalizer.ts:34-96`: `SYNC_PATH_RULES` (dev-пути → `ai/directives/`, `npx gennady`, `RULE_PLUGIN_DIRECTIVES` `plugins/<id>/directives/ → ai/directives/`), `SYNC_SKILLS_PATH_RULES` дополнительно `RULE_SKILLS_TILDE` (`~/Developer/gennady/ai/skills/ → .claude/skills/`). Цель — `<cwd>/.claude/skills`.

**v2:** оба набора на месте, `RULE_SKILLS_TILDE` цел, цель по-прежнему проектная (`RC/cli/cmd/sync-skills/sync-skills.cmd.ts:181`). Отличие: `RULE_PLUGIN_DIRECTIVES` отсутствует (согласовано — плагинов нет). Пробел: правила для `/Users/<user>/.gennady/` нет → см. S7. Проверено эмпирически: `~/.claude/skills` в деплой-поверхности RC — 0 вхождений (это и есть основание вердикта «#11 ЗАКРЫТО В V2»), но замка нет и в v2.

**Вердикт: ЧАСТИЧНО** (`RULE_PLUGIN_DIRECTIVES` — НЕПРИМЕНИМО до порта плагинов; правило dev-home отсутствует; contract-теста на `~/` и `/Users/` нет).

### S9 — тесты скилловых скриптов живут в `scripts/__tests__/`, а не под `ai/skills/**`

**v1:** `MAIN/scripts/__tests__/sdd-*.test.ts`; замок — deployed-surface.

**v2:** `RC/ai/skills/**` содержит только `SKILL.md`/`PRD_TEMPLATE.md` — скилловых скриптов нет вовсе (инструменты вызываются как `npx gennady sdd-*`), поэтому «где лежат их тесты» — беспредметно. Каталога `RC/scripts/__tests__/` нет.

**Вердикт: НЕПРИМЕНИМО** (потребность исчезла вместе с `scripts/` внутри скиллов), но охранная функция (S6/S7) исчезла вместе с ней.

### R3 — `knowledge.xml` как реестр правил: language-agnostic родители + PROJECT-OWNED

**v1:** `MAIN/ai/directives/knowledge.xml:2-7` (шапка PROJECT-OWNED), 19 `Rule id`: `result-conventions`, `baseline-rules`, `typescript-rules`, `python-rules`, `go-rules`, `svelte5-runes`, `sveltekit-rules`, `baseline-testing`, `testing-common`, `vitest-rules`, `node-test`, `playwright-cli`, `playwright-e2e`, `storybook-usage`, `svelte-testing`, `eslint-setup`, `git-setup`, `nodejs-npm-setup`, `storybook-setup`; плюс секция `<Directives>` с реестром SDD-директив. Файлы `coding/baseline-rules.xml`, `coding/python-rules.xml`, `coding/go-rules.xml`, `testing/baseline-testing.xml` существуют.

**v2:** `RC/ai/directives/knowledge.xml` — 14 `Rule id`, все Node/TS/Svelte: `typescript-rules`, `svelte5-runes`, `sveltekit-rules`, `testing-common`, `vitest-rules`, `node-test`, `playwright-cli`, `playwright-e2e`, `storybook-usage`, `svelte-testing`, `eslint-setup`, `git-setup`, `nodejs-npm-setup`, `storybook-setup`. Нет `baseline-rules`, `baseline-testing`, `python-rules`, `go-rules`, `result-conventions`; соответствующих файлов в `RC/ai/directives/coding|testing` тоже нет. Секции `<Directives>` нет — единственная секция верхнего уровня `<Rules>` (`grep '^  <[A-Z]'` = `2:  <Rules>`); значит реестр v2 вообще не индексирует SDD-директивы, тогда как `RC/ai/directives/sdd-v2/infra.directive.xml:243` называет `knowledge.xml` «the sole index (`<Rules>` section)».

**Вердикт: НЕ ЗАКРЫТО.** Реестр v2 — TypeScript-only и не project-owned; при этом он машинно читается (`loadRuleRegistry`), т.е. Swift/Go-проект получает пустой или чужой каскад детерминированно.

### R4 — golang-директива/скилл в плагине

**v2:** `plugins/` нет, `sdd-infra-golang` нет, `infra/golang-setup.xml` нет.
**Вердикт: НЕПРИМЕНИМО** (концепта нет; вернётся вместе с S3).

### R5 — scaffold: ссылка на правило обязана резолвиться в `ai/directives/<category>/<rule>.xml`, иначе abort; не-Node scope пишет свои правила и регистрирует их в project-owned реестре

**v1:** `MAIN/ai/directives/sdd/scaffold.directive.xml:74,95,470` (текст директивы, механического теста нет).

**v2:** аналог есть и он **сильнее**, чем в v1, — механический: `parseRuleRegistry` (`RC/shared/sdd/task-authoring-literals.ts:60-73`) бросает `no complete <Rule id="…"><File>…</File></Rule> entries` при пустом реестре и `duplicate rule id "…"` при дубле; `RC/ai/kit/axiom/scaffold/ax-rule-activation-plan.xml:3` объявляет `knowledge.xml` каноническим реестром; `AX_SCOPE_RULES_DECLARATION` даёт оператору выбор skip / research-and-author / defer при отсутствующем правиле (`RC/ai/directives/sdd-v2/infra.directive.xml:83`). Чего нет: (а) проверки, что `<File>` реально существует на диске, (б) права проекта переписать реестр, не потеряв его при следующем sync (см. S1/R3).

**Вердикт: ЧАСТИЧНО** — механика активации правил в v2 лучше v1, но опирается на файл, который sync стирает; «не-Node scope авторит свои правила» в v2 недостижимо, потому что и правило (`coding/swift-rules.xml`), и его регистрация уничтожаются одним прогоном (доказано в §1.10).

### 1.10. Эмпирика: что v2 сделает с проектным деревом (синтетическая фикстура)

Фикстура `<scratchpad>/B3-fixture/consumer` (собрана `B3-mkfixture.sh`), `node_modules/gennady → RC`:

| Артефакт фикстуры | Смысл | RC `sync` | MAIN (ядро напрямую) |
|---|---|---|---|
| `ai/directives/knowledge.xml` (Swift-реестр) | project-owned реестр | `~ updated` → **перезаписан пакетным TS-реестром** | `preserved` |
| `ai/directives/coding/swift-rules.xml` | проектный rule-файл, на который ссылается реестр | `- deleted` | не тронут |
| `ai/directives/coding/typescript-rules.xml` + локальный патч | пропатченная пакетная директива | `~ updated` → **патч потерян** (`grep -c "PROJECT PATCH"` = 0) | `updated` → патч тоже потерян |
| `ai/directives/testing/legacy-xctest.xml` | устаревший синканный файл | `- deleted` (желаемо, но неотличимо от проектного) | не тронут (v1 не чистит устаревшее) |
| `ai/directives/sdd-v2/local-swift-overrides.xml` | проектный файл рядом с пакетными | `- deleted` | не тронут |
| `ai/directives/local/ios.xml` | проектный подкаталог, которого пакет не поставляет | не тронут + `Warning: unknown subdirectory in target (not owned by package, left untouched): local` | не тронут |
| `.claude/skills/generate-codeowners/`, `write-uitests/` | проектные скиллы (кейс #9.4) | `- would delete` → **удалены** | не тронуты (нет манифеста → `adoptPackageInstalled` присваивает только имена, которые пакет поставляет сейчас) |
| `.claude/skills/sdd-discover/` | v1-скилл, которого в v2-пакете нет | `- would delete` | `updated` (main его поставляет) |
| `.claude/skills/sdd-execute/local-helper.sh` | проектный файл внутри поддерживаемого скилла | **удалён молча** (в выводе нет) | не тронут |
| `.claude/skills/.gennady-synced` | манифест владения | не создаётся | создаётся |

Сводка RC: `Synced: 12 added, 1 updated, 0 skipped, 4 deleted`. Сводка MAIN: `Synced: 47 added, 1 updated, 0 skipped (unchanged), 1 preserved (project-owned)`, 0 удалений.

Резюме: **main = безопасный, но протекающий** (не удаляет чужого, но и не чистит своё устаревшее, и перетирает патчи); **RC = агрессивный и теряющий** (чистит устаревшее, но вместе с проектным, и без манифеста/preserved). Хэш-манифеста нет ни там, ни там — патч пакетной директивы теряется в обоих.

Дополнительная опасность связки в v2: `gennady sync-skills` **всегда** сначала выполняет **полный, нефильтрованный** `sync` директив — `syncDirectivesFirst` (`RC/cli/cmd/sync-skills/sync-skills.cmd.ts:67-118`, `opts` без `subdirs`, `:82-86`), вызывается безусловно из `run` (`:154-168`). Значит `gennady sync-skills sdd-execute` — узкий с виду вызов — выполняет самое широкое разрушительное действие в дереве директив. В main `sync-skills` директивы не трогает (`grep syncDirectivesFirst` в `MAIN/cli/cmd/sync-skills/sync-skills.cmd.ts` = 0).

### 1.11. Эмпирика: первый v2-sync на реальном потребителе (копия дерева messenger)

`/Users/k.lebedev/Developer/messenger` прочитан (`ls`/`head`/`cp -R`), не изменён. Дерево: `ai/directives/{coding,infra,language,perf-auditor,sdd,testing}` + `knowledge.xml` (19 `Rule id`, включая проектные `logging-rules`, `uikit-*`); `.claude/skills/` — v1-набор `sdd-*` + `alt-opinion` + собственные `lang-lint`, `run-e2e`, `uikit-component-generate`; `.gennady-synced` отсутствует (синкано 0.8.1, до манифеста).

`RC sync --dry-run` на копии:

- `- coding/logging-rules.xml (would delete)` — **проектный** rule-файл, зарегистрированный в messenger'ском `knowledge.xml` как `logging-rules`;
- `- coding/result-conventions.xml (would delete)` — есть в main, в RC нет; для messenger'а неотличим от проектного;
- `~ knowledge.xml (would update)` — реестр (включая `logging-rules`, `uikit-spec-drafting`, `uikit-component-svelte`, `uikit-component-storybook`, `result-conventions`) заменяется на 14-правильный TS-реестр RC. **Двойная потеря: и файл правила, и его регистрация, одним прогоном;**
- 18 `~ would update` по `coding/`, `infra/`, `testing/` — любые локальные правки этих файлов стираются;
- `Warning: … left untouched: language`, `… perf-auditor`, `… sdd` — три подкаталога выживают.

Последствие последнего пункта — **главный факт про миграцию V1→V2 дерева**: `ai/directives/sdd/` (13 файлов v1-директив) остаётся, рядом появляется `ai/directives/sdd-v2/` (≈95 файлов), а новый `knowledge.xml` не содержит секции `<Directives>` вовсе — реестр не указывает ни на один SDD-набор. Проект получает два конкурирующих комплекта инструкций и реестр, который не разрешает конфликт.

`RC sync-skills --dry-run` на копии: `+ 7` новых (`sdd`, `sdd-code-review`, `sdd-reconcile`, `agent-inbox`, `opencode-get-session`, `prd-interview`, `workspace-permission-setup`), `~ 5` (`sdd-audit`, `sdd-check`, `sdd-critic`, `sdd-execute`, `sdd-scaffold`), и **11 удалений**: `alt-opinion/`, `lang-lint/`, `run-e2e/`, `uikit-component-generate/` (не наши / проектные) + `sdd-continue/`, `sdd-discover/`, `sdd-execute-batch/`, `sdd-fix/`, `sdd-infra/`, `sdd-module-decomposition/`, `sdd-setup/` (v1-скиллы). Удаление v1-скиллов для миграции желательно; удаление трёх проектных — нет; RC их не различает.

### 1.12. Сводная таблица трека

| # | Инвариант (кратко) | v1 | v2 | Вердикт |
|---|---|---|---|---|
| S1 | `knowledge.xml` project-owned / `preserved` | `sync-core.ts:27,239,254` + тест `:223` | нет; `sync.types.ts:6` | **НЕ ЗАКРЫТО** |
| S2 | `resolvePackageDir` подъёмом по `package.json` | `sync-core.shared.ts:10-46` + checkout-e2e | `sync-core.shared.ts:36-59` (`dist`-strip), e2e удалён | **ЧАСТИЧНО** |
| S3 | объединение base + plugin-корней | `sync-core.ts:84-132`, `plugin-assets.ts:43` | плагинов нет | **НЕПРИМЕНИМО** (вернётся с портом) |
| S4 | проглоченная ошибка не опустошает источник | `sync-skills-core.ts:158-190` + 3 теста | нарушено `sync-core.ts:176-182` + зеркало `:226-244` | **НЕ ЗАКРЫТО, хуже v1** |
| S5 | манифест владения скиллами | `sync-skills-core.ts:32,581-600` + 10 тестов | нет; spec `:331,336` легитимирует потерю | **НЕ ЗАКРЫТО** |
| S5-bis | (v2-only) файловое зеркало внутри скилла | — | `sync-skills-core.ts:377-392`, скрыто `formatter.ts:100-110` | **НЕ ЗАКРЫТО (v2-only)** |
| S6 | тесты скилла не деплоятся | `sync-skills-core.ts:25,128,272` + `deployed-surface.test.ts:74` | `EXCLUDED_NAMES` = `{'.DS_Store'}` | **НЕ ЗАКРЫТО (латентно)** |
| S7 | golden деплой-поверхности | `deployed-surface.{test.ts,golden.txt}` (80) | нет вовсе; утечка `/Users/k.lebedev/.gennady/…` | **НЕ ЗАКРЫТО** |
| S8 | нормализация путей, проектная цель скиллов | `path-normalizer.ts:34-96` | есть, минус `RULE_PLUGIN_DIRECTIVES`, минус dev-home | **ЧАСТИЧНО** |
| S9 | тесты скилловых скриптов вне `ai/skills` | `scripts/__tests__/` | скриптов в скиллах нет | **НЕПРИМЕНИМО** |
| R3 | реестр: agnostic-родители + PROJECT-OWNED | `knowledge.xml:2-7`, 19 правил | 14 TS-правил, нет `<Directives>`, нет шапки | **НЕ ЗАКРЫТО** |
| R4 | golang-директива/скилл в плагине | `plugins/golang/**` | нет | **НЕПРИМЕНИМО** |
| R5 | ссылки на правила резолвятся / проект авторит свои | текст `scaffold.directive.xml:74,95,470` | механика сильнее (`task-authoring-literals.ts:60-91`), но опирается на стираемый файл | **ЧАСТИЧНО** |

Итог: ЗАКРЫТО 0 · ЧАСТИЧНО 4 (S2, S8, R5, + S3 условно) · НЕ ЗАКРЫТО 6 (S1, S4, S5, S5-bis, S6, S7, R3 — 7 с R3) · НЕПРИМЕНИМО 3 (S3, S9, R4).

---

## 2. Модель владения: v1 vs v2

### 2.1. v1 (main `8bb38477`)

Две разные модели для двух поверхностей:

| Поверхность | Модель владения | Механизм | Удаление |
|---|---|---|---|
| `ai/directives/**` | «пакет владеет всем, кроме явного исключения» | `PROJECT_OWNED_ENTRIES = {'knowledge.xml'}` (`sync-core.ts:27`), статус `preserved` | **никогда**: `collectAndCompare` только `added|updated|unchanged|preserved` |
| `.claude/skills/**` | «пакет владеет тем, что записал» | манифест `.claude/skills/.gennady-synced` (`sync-skills-core.ts:32`), merge-семантика `nextManifestNames:115` | только имена из манифеста; при первом запуске `adoptPackageInstalled:96` присваивает лишь то, что пакет поставляет **сейчас** |

Прочее в v1: нормализация путей `SYNC_PATH_RULES`/`SYNC_SKILLS_PATH_RULES` (`path-normalizer.ts:34-96`), плагинные корни (`plugin-assets.ts:43`, `scanSourceRoots:84`), `<sdd-path>` вместо `~/.claude/skills/…` в директивах (#11).

Дыры v1: (а) устаревшая директива, снятая с поставки, остаётся в проекте вечно; (б) пропатченная пакетная директива перетирается как `updated` — хэш-манифеста нет; (в) `preserved` покрывает ровно один путь, hard-coded; (г) `specs/cli/sync/sync.spec.md` про `preserved`/плагинные корни **не знает** (`grep preserved|project-owned|plugin` = 0) — спека отстала от кода.

### 2.2. v2 (RC)

Одна модель на обе поверхности, и это модель **зеркала без владения**:

| Поверхность | Модель | Границы зеркала |
|---|---|---|
| `ai/directives/**` | rsync `--delete`, ограниченный подкаталогами, которые пакет поставляет | `listOwnedSubdirs(sourceDir)` (`sync-core.ts:108-120`) → `scanTargetMirrorSpace` (`:134-174`). Внутри owned-подкаталога удаляется **всё**, чего нет в источнике (`:233-244`). Подкаталог, которого пакет не поставляет → `warnings`, не тронут (`:159-163`). Файлы в **корне** `ai/directives/` — кандидаты на удаление только при нефильтрованном прогоне (`:165-170`) |
| `.claude/skills/**` | rsync `--delete` на двух уровнях: целые orphan-скиллы (`sync-skills-core.ts:396-403`) **и** отдельные файлы внутри поддерживаемого скилла (`:377-392`) | ничего не защищено; фильтр по именам сужает только orphan-проход (`:397-399`), но не файловое зеркало и не `syncDirectivesFirst` |

Что появилось хорошего (этого в main нет): (1) устаревший пакетный файл действительно исчезает из проекта — это правильная цель, mirror-семантика её достигает; (2) `warnings` про неизвестный подкаталог — единственный в v2 акт признания, что в target бывает чужое; (3) `syncDirectivesFirst` гарантирует, что скилл не сошлётся на отсутствующую директиву.

Что потеряно: `PROJECT_OWNED_ENTRIES`, `preserved`, манифест скиллов, `isTestArtifact`/`__tests__`, плагинные корни, `extraSourceDirs`, deployed-surface golden, checkout-e2e, дисциплина фатальности ошибок чтения корня.

**Роль `cli/cmd/sdd-sync/`.** К `gennady sync` **отношения не имеет** — только коллизия имени. `sdd-sync` распространяет `Status` тикета в трекеры `*.3-tasks.md` (`RC/cli/cmd/sdd-sync/sdd-sync.cmd.ts:135-244`; спека `RC/specs/cli/sdd-sync/sdd-sync.spec.md:9`): читает `Task-ID`+`Status` из Meta, находит owner-индексы подъёмом от каталога тикета (`discoverIndexes:55-85`, cap 8 hop), правит сегмент Status (`updateTrackerStatus`), перечитывает и верифицирует запись, затем отдельным проходом пересчитывает роллап `Tasks`/`Done` (`recomputeProgress:95-127`). Никаких директив/скиллов/пакета не касается; `sourceDir`/`targetDir`/нормализации там нет. Соответствие v1: это писатель для того, что v1 только **детектировал** — `[TRACKER_SYNC]` в `MAIN/ai/skills/sdd-execute/scripts/check.sh:307-310` (read-only, «task_id / ticket_status / tracker_status / match»), а правил агент по директиве. То есть v2 сделал tracker-sync детерминированным тулом — это улучшение, но к треку SYNC-OWNERSHIP относится только тем, что **два разных `*sync*` в одном CLI сбивают и оператора, и грепы**: `gennady sync` (пакет → проект), `gennady sync-skills` (пакет → проект, и тайно ещё раз `sync`), `gennady sdd-sync` (тикет → трекер).

### 2.3. Оценка трёх предложений akkrat (#24) для v2

| Предложение | Что даёт | Что не решает | Оценка для v2 |
|---|---|---|---|
| **(1) Манифест с хэшами → `locally-modified` + `--force`** | Единственный вариант, различающий «файл, который мы записали и он не изменился» / «мы записали, проект изменил» / «мы не записывали». Закрывает S1 (частично), S4 (зеркало только по манифесту), S5, S5-bis, #24 целиком и пункт (б) дыр v1 (потеря патча). Даёт корректное зеркало: устаревшее наше — удалить, чужое — оставить | Сам не делает `knowledge.xml` особым: реестр, изменённый проектом, станет `locally-modified` и никогда не обновится — что для реестра правильно, но новый пакетный `Rule` до проекта не доедет | **ПРИНЯТЬ как основу.** Единственный механизм, который одинаково работает для директив и скиллов. Стоимость: sha256 на файл + один файл состояния на поверхность |
| **(2) `knowledge.xml` project-owned (`preserved`)** | Дёшево, порт `f74c8c1d` — точечно; в v2 обязательно, потому что реестр читает тулинг (`loadRuleRegistry`, `RC/shared/sdd/task-authoring-literals.ts:76-91`) | Не спасает ни проектный rule-файл (`coding/swift-rules.xml` удаляется зеркалом), ни патч директивы, ни проектные скиллы. На дереве messenger даёт «реестр цел, но `logging-rules.xml` удалён» — реестр с висячей ссылкой | **ПРИНЯТЬ как обязательное дополнение**, не как замену (1). Порядок: сначала (2) — она блокирует релиз, потом (1) |
| **(3) Overlay `ai/directives.local/`** | Даёт проекту место, где sync гарантированно не ходит, без манифеста. В v2 уже есть слабая форма: подкаталог, которого пакет не поставляет, помечается warning и не трогается (`sync-core.ts:159-163`) — эмпирически подтверждено на `ai/directives/local/` и на messenger'ских `language/`, `perf-auditor/`, `sdd/` | Требует, чтобы **читатель** правил умел склеивать два дерева. В v2 читателей два — агент по `<File>`-ссылкам реестра и `parseRuleRegistry`/`loadRuleRegistry`. Первому склейка не нужна (ссылка на `ai/directives.local/x.xml` работает как есть), второму — нужен merge-порядок и дедупликация: `parseRuleRegistry` **бросает** на `duplicate rule id` (`task-authoring-literals.ts:69`), т.е. наивное объединение двух реестров ломает `sdd-new` | **ПРИНЯТЬ ЧАСТИЧНО, как соглашение, не как механизм.** Overlay-каталог для **правил** — да (это уже почти работает и стоит только документации + теста). Overlay для **реестра** (`knowledge.local.xml`) — нет: усложняет `loadRuleRegistry`, вводит правила приоритета и требует дедупа; project-owned реестр (2) дешевле и понятнее |

Дополнительно к трём: **ни одно из них не закрывает S5-bis и S7.** Файловое зеркало внутри скилла и невидимость удалений в выводе — отдельная работа (форматтер + счётчики dry-run), как и golden деплой-поверхности.

---

## 3. Дизайн для v2

### 3.1. Одна модель владения на директивы И скиллы

Три статуса владения на путь, вычисляемые из одного и того же состояния:

```
manifest[<relpath>] = sha256(байты, которые sync записал в прошлый раз)
```

Файлы состояния (dot-имена, все readdir-фильтры уже отбрасывают `.`-имена — тот же приём, что `MANIFEST_NAME` в main):

- `ai/directives/.gennady-synced`
- `.claude/skills/.gennady-synced`

Формат — построчный `<sha256>  <relpath>`, шапка `#`-комментариями (как в `MAIN/cli/cmd/sync-skills/sync-skills-core.ts:66-73`), плюс первая строка `# version: 1` и `# package: gennady@<ver>`. Нечитаемый манифест = отсутствующий (main уже так: `readSyncManifest` возвращает `null`, `:50-52`) — деградация всегда в сторону «ничего не удалять».

Решающая таблица (единая для обеих поверхностей):

| в источнике | в target | в манифесте | sha(target) == manifest | статус | действие |
|---|---|---|---|---|---|
| да | нет | — | — | `added` | записать, обновить манифест |
| да | да | да | да | `unchanged` / `updated` (по sha источника) | записать при различии |
| да | да | да | **нет** | **`locally-modified`** | **не писать**, показать в листинге и в сводке; писать только под `--force` (или `--force <path>`) |
| да | да | **нет** | — | **`adopted-conflict`** | не писать (проект создал файл раньше, чем мы стали его поставлять); `--force` пишет и присваивает |
| да | да | — | — | `project-owned` (см. 3.2) | никогда не писать |
| нет | да | да | да | `deleted` | удалить, снять из манифеста |
| нет | да | да | **нет** | **`stale-modified`** | не удалять, предупредить (это был наш файл, но проект его правил) |
| нет | да | **нет** | — | `foreign` | не трогать, показать в `--verbose` |

Свойства:
- зеркальное удаление становится «удалять только своё неизменённое» — S4/S5/S5-bis закрываются одним правилом;
- первый прогон на дереве без манифеста: всё в target = `foreign`/`adopted-conflict` → **ничего не удаляется и ничего не перетирается**, кроме `added`. Это ровно migration-safe поведение, нужное для messenger/cloud-ios (см. 3.4). Политика `adoptPackageInstalled` из main здесь не нужна: хэш пакета известен, поэтому «target побайтово равен пакетному» → присвоить молча, «отличается» → `adopted-conflict`;
- `--force` — единственный способ потерять данные, и он именуемый (`--force ai/directives/coding/typescript-rules.xml`) либо глобальный (`--force` без аргумента); `--force` **никогда** не расширяет удаление `foreign`/`stale-modified` — для этого отдельный `--prune-foreign` (opt-in, как просил akkrat в #9.4).

Единая реализация: вынести в `shared/common/sync/ownership.ts` (`readOwnershipManifest`, `writeOwnershipManifest`, `classify(source, target, manifest)`), чтобы `cli/cmd/sync/sync-core.ts` и `cli/cmd/sync-skills/sync-skills-core.ts` использовали одну таблицу. Сейчас у них общий только `sync-core.shared.ts` (`resolvePackageDir`, `compareBytes`) и `sync-formatter.shared.ts`.

Overlay — соглашение, а не код: «подкаталог `ai/directives/`, которого пакет не поставляет, синк не трогает» уже есть (`sync-core.ts:159-163`); задокументировать как контракт (рекомендуемое имя — `ai/directives/local/`), зафиксировать тестом и **не** вводить `ai/directives.local/` как второй корень.

### 3.2. Взаимодействие со слоем правил

- `PROJECT_OWNED_ENTRIES = {'knowledge.xml'}` возвращается **и** остаётся сильнее манифеста: реестр не переписывается никогда, `--force` на него не действует (иначе `--force` после первого же конфликта сотрёт Swift-реестр). Обновление реестра — задача агента/директивы, не sync. Шапка PROJECT-OWNED из `MAIN/ai/directives/knowledge.xml:2-7` переносится в `RC/ai/directives/knowledge.xml`.
- Порт R3-содержимого: `coding/baseline-rules.xml`, `testing/baseline-testing.xml`, тонкие `coding/python-rules.xml`, `coding/go-rules.xml`; `typescript-rules` получает `SkipWhen` для не-TS; регистрация — в поставляемом (seed) реестре. Иначе v2 остаётся TypeScript-only на уровне правил, а `loadRuleRegistry` детерминированно вставляет TS-правила в тикеты Swift-проекта.
- Проектный rule-файл (`coding/swift-rules.xml`) переживает sync по общей таблице (`foreign` → не тронут). Нужен дополнительный замок в `sdd-check`: каждый `<Rule><File>` реестра обязан существовать на диске (`SDD_RULE_FILE_MISSING`) — сейчас `parseRuleRegistry` проверяет только уникальность id и непустоту (`RC/shared/sdd/task-authoring-literals.ts:60-73`). Без этого «реестр цел, файл удалён» проходит зелёным.
- `parseRuleRegistry` бросает на дубль id — значит любой будущий merge-механизм реестров обязан дедуплицировать до вызова. Аргумент против overlay-реестра.

### 3.3. Взаимодействие с плагинами / stack-пресетами

Порт `plugins/` (трек VERIFY) обязан вернуть в sync ровно три вещи из main, иначе плагин не сможет поставить ни правило, ни скилл:

1. `extraSourceDirs` + `scanSourceRoots` (`MAIN/cli/cmd/sync/sync-core.ts:84-132`, `sync.types.ts:19`) и `scanAllSkillRoots`/`selectSkills` (`MAIN/cli/cmd/sync-skills/sync-skills-core.ts:158-207`) — с дисциплиной фатальности: отсутствующий плагинный корень терпим, база и EACCES/EIO — фатальны (S4);
2. `pluginSurfaceDirs` (`MAIN/services/plugins/plugin-assets.ts:43-54`) + `files[]`-записи `plugins/*/directives/**/*`, `plugins/*/skills/**/*` + `publish-contents.e2e.test.ts` (иначе tarball теряет плагинные ассеты молча — D-SP-008);
3. `RULE_PLUGIN_DIRECTIVES` в оба набора `path-normalizer.ts` (`plugins/<id>/directives/ → ai/directives/`), иначе синканный текст будет ссылаться на путь, которого у потребителя нет.

Владение при этом не меняется: манифест ключуется по **target-относительному** пути, поэтому неважно, какой корень его дал. Единственное новое правило: смена «поставщика» пути (base ↔ plugin) при неизменных байтах — это `unchanged`, а не `updated`.

### 3.4. Миграция V1→V2 потребительских деревьев

Что первый v2-sync делает **сейчас** (доказано в §1.11 на messenger): удаляет 2 rule-файла (1 проектный), перетирает `knowledge.xml` и 18 директив, оставляет `ai/directives/sdd/` рядом с `sdd-v2/`, удаляет 11 каталогов скиллов, из которых 3 проектных, и не оставляет ни манифеста, ни следа о том, что удалил файл внутри `sdd-execute/`.

Что должен делать. Три решения, которые нужно принять явно (см. §4, D-2):

- **`ai/directives/sdd/` (v1-директивы).** Оставлять «как есть» нельзя: проект получает два комплекта инструкций и реестр, не указывающий ни на один. Удалять зеркалом тоже нельзя — messenger'ский `sdd/` содержит **проектные** файлы (`fix.directive.xml`, `svelte-ui-discovery.directive.xml`), которых нет ни в v1-пакете, ни в v2. Предлагаемое: явный шаг миграции (`gennady sdd-migrate directives` или `sync --migrate-v1`), который (а) сверяет содержимое `ai/directives/sdd/*` с известными хэшами v1-релизов, (б) неизменённые v1-файлы переносит в `ai/directives/.gennady-v1-backup/` (или удаляет по подтверждению), (в) изменённые и незнакомые — оставляет и печатает список, (г) **никогда** не делает этого молча внутри `sync`.
- **`.claude/skills/` v1-набор.** Тот же приём: список известных v1-имён (`sdd-setup`, `sdd-discover`, `sdd-continue`, `sdd-module-decomposition`, `sdd-execute-batch`, `sdd-fix`, `sdd-infra`, `alt-opinion`) удаляется только при совпадении хэшей с известным v1-релизом и только на шаге миграции; всё остальное (`lang-lint`, `run-e2e`, `uikit-component-generate`) не трогается никогда.
- **`knowledge.xml`.** Первый v2-sync его не пишет (project-owned). Секцию `<Directives>` (в реестре v2 её нет вовсе) и переключение `sdd/ → sdd-v2/` делает шаг миграции, показывая diff оператору.

Runbook `RC/ai/directives/sdd-v2/guides/v1-to-v2-migration.md` покрывает только `tasks/ → specs/` и Task-ID (`grep -i 'sync|knowledge|\.claude/skills'` = 0 совпадений) — про дерево директив и скиллов там нет ни слова. Это пробел документации того же размера, что пробел кода.

### 3.5. Тесты, которые надо поставить (замки)

Unit / `contract`-слой (`RC/scripts/test-topology.ts:181-196`: `basename` содержит `contract` → layer `contract`, входит в `npm test`):

| Файл | Кейс |
|---|---|
| `cli/cmd/sync/__tests__/sync-core.test.ts` | `preserves a project-owned knowledge.xml that differs` (порт `MAIN:223`); `seeds knowledge.xml when absent` (`MAIN:242`); `a patched package directive is locally-modified and not written`; `--force writes a locally-modified file`; `a project file in an owned subdir without a manifest entry is not deleted`; `a stale file recorded in the manifest is deleted`; `a stale file recorded in the manifest but modified on disk is kept with a warning`; `a partial source scan never deletes` (мокнуть `readdirSync` на бросок в одном подкаталоге → 0 `deleted`) |
| `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts` | порт `MAIN:377,391,538,549,563,577,592,606,617,627` (весь блок манифеста); `a project file inside a supported skill is not deleted`; `deleting a file inside a supported skill appears in the output` |
| `cli/cmd/sync-skills/__tests__/sync-skills-formatter.test.ts` | `reports a deleted file inside an added/updated skill group`; `dry-run summary carries counts, not just "no files written"` |
| `shared/common/sync/__tests__/ownership.test.ts` (новый) | таблица §3.1 целиком, все 8 строк |
| `shared/common/sync/__tests__/sync-core.shared.test.ts` | `resolves the package from a clone with no node_modules/gennady` (порт checkout-кейса, `MAIN/cli/__tests__/e2e/sync-skills.e2e.test.ts`) |
| `scripts/__tests__/deployed-surface.test.ts` + `deployed-surface.golden.txt` (новые) | порт трёх `it` из main + **четвёртый**: `leaks no developer path into any shipped file` — grep содержимого каждого файла поверхности на `/Users/`, `~/Developer/`, `~/.claude/`, `/Users/<user>/.gennady/`. Сейчас падает на `ai/directives/agent-inbox/golden-chat-output.example.md:176` |
| `cli/__tests__/directive-tool-contract/…` или новый contract-тест | `doesNotMatch(/~\/\.claude\//)` по rendered `ai/directives/**` + `ai/skills/**` (замок для #11, который в v2 закрыт «по построению» и ничем не защищён) |

e2e / `external`-слой (`RC/cli/__tests__/e2e/setup.ts` — реальный `npm pack` + install в temp-проект, `classifyTest` → `external`, входит в `npm test` через `targetsFor('deterministic')`):

| Файл | Кейс |
|---|---|
| `cli/__tests__/e2e/sync.e2e.test.ts` | `keeps a project-owned knowledge.xml across two syncs`; `keeps a project-authored rule file in a package-owned subdir`; `removes a directive the package stopped shipping`; `--dry-run lists every deletion it would perform` |
| `cli/__tests__/e2e/sync-skills.e2e.test.ts` | `leaves a project-authored skill alone` (кейс cloud-ios); `writes .claude/skills/.gennady-synced`; `sync-skills <name> does not mirror-delete directives` (замок против `syncDirectivesFirst` без фильтра); порт `registerSyncSkillsCheckoutTests` |
| `cli/__tests__/e2e/publish-contents.e2e.test.ts` (порт из main) | нужен только после порта плагинов |

### 3.6. Eval-группа G2 — детерминированная, без LLM

G2 = **e2e-корпус «фикстура потребителя → sync → сравнение дерева»**, целиком детерминированный: никакого агента, никакого судьи. Реализация — `cli/__tests__/e2e/` + `setup.ts` (реальный tarball), плюс табличные фикстуры.

Фикстуры (каталоги под `cli/__tests__/e2e/fixtures/consumers/`), каждая = «до» + ожидаемое «после»:

1. `greenfield` — пустой проект: всё `added`, манифест создан, 0 удалений.
2. `patched-directive` — пакетная директива с локальной правкой: `locally-modified`, не записана, exit 0, строка в листинге; повтор с `--force` → записана.
3. `project-owned-registry` — Swift-реестр + `coding/swift-rules.xml`: реестр `preserved`, rule-файл цел (кейс #24 + cloud-ios).
4. `stale-package-file` — файл, записанный прошлым sync и снятый с поставки: удалён; тот же файл, но правленный на диске: сохранён с warning.
5. `project-skills` — `generate-codeowners`, `write-uitests` + файл внутри `sdd-execute/`: ничего не удалено, вывод содержит все затронутые пути (кейс #9.4 + S5-bis).
6. `v1-consumer` — снимок дерева v1-потребителя (обезличенная выжимка из messenger: `ai/directives/{sdd,language,perf-auditor}` + проектные `coding/logging-rules.xml`, скиллы `lang-lint`/`run-e2e`): первый v2-sync **не удаляет ничего**, печатает migration-hint; отдельный тест на `sdd-migrate directives` (это же группа **G4**, V1→V2 миграция — пересечение G2/G4).
7. `linked-checkout` — потребитель без `node_modules/gennady`, CLI из клона: пакет найден (S2).
8. `surface` — не фикстура, а golden: `deployed-surface.golden.txt` + четыре `it` из §3.5.

Метрика G2 — бинарная: `assert.deepEqual(treeAfter, expectedTreeAfter)` по отсортированному списку `<path>\t<sha256>` + `assert` на набор строк вывода. Ни одного судьи, ни одного вызова модели. Ворота: G2 обязана быть зелёной до релиза v2, потому что три из шести НЕ-ЗАКРЫТЫХ инвариантов трека — это потеря чужих данных.

---

## 4. Список задач и решения оператора

### 4.1. Задачи

| id | Цель | Файлы | Тесты | Размер |
|---|---|---|---|---|
| **SO-1** | `knowledge.xml` project-owned: порт `PROJECT_OWNED_ENTRIES` + статус `preserved` (+ шапка в поставляемом реестре) | `RC/cli/cmd/sync/sync-core.ts` (+`PROJECT_OWNED_ENTRIES`, лестница `:261-268`), `sync.types.ts:6` (+`'preserved'`, геттер `preserved`, `summary`), `shared/common/sync/sync-formatter.shared.ts`, `RC/ai/directives/knowledge.xml` (шапка), `specs/cli/sync/sync.spec.md` (решение D-M0xx — в main эта спека про `preserved` тоже молчит, не повторять пробел) | порт `MAIN/cli/cmd/sync/__tests__/sync-core.test.ts:223,242`; e2e `keeps a project-owned knowledge.xml across two syncs` | **S** |
| **SO-2** | Порт манифеста скиллов из `62172906` | `RC/cli/cmd/sync-skills/sync-skills-core.ts` (`MANIFEST_NAME`, `readSyncManifest`, `writeSyncManifest`, `adoptPackageInstalled`, `nextManifestNames`, применение вместо `:396-403`), `sync-skills.types.ts`, `specs/cli/sync-skills/sync-skills.spec.md` (переписать `:331` и D-M006 `:336-343` — сейчас они закрепляют потерю) | порт `MAIN/…/sync-skills-core.test.ts:377,391,538-627`; e2e `leaves a project-authored skill alone` | **S** |
| **SO-3** | Единая модель владения по хэшам: `shared/common/sync/ownership.ts` + статусы `locally-modified`, `adopted-conflict`, `stale-modified`, `foreign`; `--force[ <path>]`, `--prune-foreign`; манифесты `ai/directives/.gennady-synced` и `.claude/skills/.gennady-synced`; зеркальное удаление только по манифесту | новый `shared/common/sync/ownership.ts`; `RC/cli/cmd/sync/sync-core.ts:226-244,261-268`; `RC/cli/cmd/sync-skills/sync-skills-core.ts:377-403`; оба `*.types.ts`, оба формата вывода, `parse-args` обоих cmd; спеки обеих команд | новый `shared/common/sync/__tests__/ownership.test.ts` (таблица §3.1); блок кейсов в обоих `*-core.test.ts`; e2e-фикстуры 2,3,4,5 | **L** |
| **SO-4** | Видимость удалений: печатать `deleted` в группе с dominant `added`/`updated`; счётчики в dry-run сводке | `RC/cli/cmd/sync-skills/sync-skills-formatter.ts:88-124,147-153`; `shared/common/sync/sync-formatter.shared.ts` (dry-run сводка для `sync`) | `sync-skills-formatter.test.ts` (+2 кейса), e2e `--dry-run lists every deletion` | **S** |
| **SO-5** | Deployed-surface golden + проверка утечек **в содержимом**; починить найденную утечку | новый `RC/scripts/__tests__/deployed-surface.{test.ts,golden.txt}`; `RC/ai/directives/agent-inbox/golden-chat-output.example.md:176`; при необходимости правило dev-home в `shared/common/sync/path-normalizer.ts` | 4 `it` (§3.5); `UPDATE_SURFACE_GOLDEN=1` как в main | **M** |
| **SO-6** | Вернуть исключение тестовых артефактов из деплоя скиллов | `RC/cli/cmd/sync-skills/sync-skills-core.ts:21,84` (`EXCLUDED_NAMES` + `isTestArtifact`) | порт `MAIN/…/sync-skills-core.test.ts:151,165`; `it` «ships no test file» из SO-5 | **S** |
| **SO-7** | Устойчивость источника: отказ чтения источника не приводит к удалению | `RC/cli/cmd/sync/sync-core.ts:176-182` (различать «пусто» и «не прочитали»: пробросить флаг `incomplete` и запретить удаление в этом поддереве); аналогично `sync-skills-core.ts` `scanSkills` | `a partial source scan never deletes` (мок `readdirSync`); порт духа `MAIN/…/sync-skills-core.test.ts:246,265` | **M** |
| **SO-8** | `resolvePackageDir`: подъём по `package.json` вместо `dist`-strip; вернуть checkout-e2e | `RC/shared/common/sync/sync-core.shared.ts:36-59` (порт `MAIN/shared/common/sync/sync-core.shared.ts:10-46`) | `shared/common/sync/__tests__/sync-core.shared.test.ts` + e2e `resolves the package from a clone with no node_modules/gennady` | **S** |
| **SO-9** | Разорвать связку `sync-skills` → полный `sync`: либо флаг `--with-directives` (по умолчанию off), либо `syncDirectivesFirst` уважает фильтр и никогда не удаляет | `RC/cli/cmd/sync-skills/sync-skills.cmd.ts:67-118,158-172`; help оба; спека sync-skills | e2e `sync-skills <name> does not mirror-delete directives` | **S** |
| **SO-10** | Порт R3-содержимого реестра: `baseline-rules`, `baseline-testing`, тонкие `python-rules`/`go-rules`, `SkipWhen` у `typescript-rules`; секция `<Directives>` в реестре v2 | `RC/ai/directives/coding/{baseline-rules,python-rules,go-rules}.xml`, `RC/ai/directives/testing/baseline-testing.xml`, `RC/ai/directives/knowledge.xml` | порт `MAIN/scripts/__tests__/testing-rule-contract.test.ts` («rule checkable surface contract»); golden из SO-5 | **M** |
| **SO-11** | `sdd-check`: `<Rule><File>` реестра обязан существовать → `SDD_RULE_FILE_MISSING` | `RC/shared/sdd/check.ts`, `RC/shared/sdd/task-authoring-literals.ts` (или отдельная функция валидации) | `shared/sdd/__tests__/check…` — «reports a registry rule whose file is missing» | **S** |
| **SO-12** | Миграция V1→V2 дерева потребителя: шаг `sdd-migrate directives` (+ skills) с известными хэшами v1-релизов, backup/список, без молчаливого удаления; дописать раздел в `guides/v1-to-v2-migration.md` | новый `RC/cli/cmd/sdd-migrate/**` (расширение) или `RC/cli/cmd/sync/migrate-v1.ts`; `RC/ai/directives/sdd-v2/guides/v1-to-v2-migration.md`; `RC/ai/skills/README.md` (раздел «Синхронизация», `:75-83` — сейчас 4 строки без слова о владении) | e2e-фикстура `v1-consumer` (G2/G4) | **L** |
| **SO-13** | Вернуть плагинные корни в sync — **только вместе с портом `plugins/`** (трек VERIFY) | `RC/cli/cmd/sync/sync-core.ts` (`scanSourceRoots`), `sync.types.ts` (`extraSourceDirs`), `sync-skills-core.ts` (`scanAllSkillRoots`/`selectSkills`), новый `services/plugins/plugin-assets.ts`, `RC/package.json.files`, `shared/common/sync/path-normalizer.ts` (`RULE_PLUGIN_DIRECTIVES`) | порт `MAIN/…/sync-skills-core.test.ts:237,246,265`; `publish-contents.e2e.test.ts`; golden из SO-5 | **M** (заблокирована портом плагинов) |
| **SO-14** | Развести имена: `gennady sync` / `sync-skills` / `sdd-sync` — минимум развести в `help` и в спеке `cli.spec.md`, чтобы «sync» перестал означать три разные вещи | `RC/cli/cmd/*/help.ts`, `RC/cli/gennady.ts` (:140,229,330,334,426), `RC/specs/cli/cli.spec.md` | нет (документационная) | **S** |

Порядок: SO-1, SO-2, SO-6, SO-8, SO-9 (все S, снимают прямые регрессы) → SO-4, SO-5, SO-7, SO-11 → SO-3 (заменяет SO-1/SO-2 надстройкой, не отменяя их) → SO-10, SO-12 → SO-13 после плагинов.

Блокеры релиза v2 (потеря чужих данных): SO-1, SO-2, SO-3, SO-4, SO-9, SO-12.

### 4.2. Решения оператора

**D-1. Как далеко идёт владение.**
1. Только порт main: `preserved` для `knowledge.xml` + манифест имён скиллов; зеркальное удаление директив **выключить** (вернуться к v1-семантике «только add/update»). Дешево, но устаревшие директивы снова живут в проектах вечно, а патчи теряются.
2. Порт main + хэш-манифест для обеих поверхностей (SO-3). Закрывает #24 целиком, требует нового формата состояния и флага `--force`. **Рекомендуется.**
3. Хэш-манифест + overlay-каталог как документированный контракт (`ai/directives/local/`), реестр остаётся единственным project-owned файлом. То же, что (2), плюс дешёвая документация — фактическое поведение `warnings` уже соответствует.
4. Хэш-манифест + overlay-реестр (`knowledge.local.xml`, merge в `loadRuleRegistry`). Максимальная гибкость, но требует правил приоритета и дедупа id (`parseRuleRegistry` бросает на дубль) — сложность в машинно-читаемом пути. **Не рекомендуется.**

**D-2. Что первый v2-sync делает с v1-деревом (`ai/directives/sdd/`, v1-скиллы).**
1. Ничего: оставить рядом, warning. Проект живёт с двумя комплектами директив и реестром, не указывающим ни на один (текущее поведение RC для `sdd/`).
2. Удалить зеркалом. Быстро и грязно: у messenger'а в `sdd/` есть проектные `fix.directive.xml`, `svelte-ui-discovery.directive.xml` — они умрут.
3. Явный шаг миграции по известным хэшам v1-релизов: неизменённые v1-файлы → backup/удаление по подтверждению, изменённые и незнакомые → оставить и перечислить; `sync` сам не делает ничего (SO-12). **Рекомендуется.**
4. `sync` печатает migration-hint и **отказывается** синкать, пока оператор не выполнил шаг миграции (жёсткий гейт). Безопаснее всех, но ломает «поставил пакет — синкнул».

**D-3. Судьба зеркального удаления директив (RC-новшество).**
1. Убрать целиком, вернуть v1-семантику. Теряем правильную цель (устаревшее должно исчезать).
2. Оставить как есть (owned-подкаталоги). Продолжаем удалять проектные rule-файлы — на messenger'е это `coding/logging-rules.xml`.
3. Ограничить манифестом (SO-3): удаляется только то, что мы записали и что не менялось. **Рекомендуется.**
4. Оставить, но перевести в opt-in `--prune` (как akkrat предлагал в #9.4 для скиллов). Проще (3), но по умолчанию проекты копят мусор.

**D-4. Связка `sync-skills` → `sync`.**
1. Оставить как есть: любой `sync-skills` (даже с фильтром одного скилла) делает полный зеркальный sync директив.
2. Уважать фильтр и запретить удаление в этом под-вызове.
3. Сделать директивный проход opt-in (`--with-directives`), по умолчанию off; документировать «сначала `sync`, потом `sync-skills`». **Рекомендуется** — узкая команда не должна выполнять самое широкое действие.
4. Слить в одну команду `gennady sync [--skills]` и убрать `sync-skills` (спека main D-M0xx явно отвергала слияние из-за разной семантики; в v2 семантика сблизилась — обе теперь зеркала).

---

## 5. Приложение — точные ссылки, использованные выше

**RC (v2).** `cli/cmd/sync/sync-core.ts:16` (`EXCLUDED_ENTRIES`), `:108-120` (`listOwnedSubdirs`), `:134-174` (`scanTargetMirrorSpace`, warning `:159-163`, корневые файлы `:165-170`), `:176-182` (`collectRecursive`, проглатывание), `:217` (единственный корень), `:226-244` (зеркальное удаление), `:261-268` (лестница статусов без `preserved`), `:283` (`SyncResult(entries, warnings)`) · `cli/cmd/sync/sync.types.ts:6` · `cli/cmd/sync/sync.cmd.ts:75,87,89-94,107-109` · `cli/cmd/sync-skills/sync-skills-core.ts:21` (`EXCLUDED_NAMES`), `:84`, `:158-181` (`collectOrphanFiles`), `:192-268` (`deleteOrphan`), `:332`, `:377-392` (файловое зеркало), `:396-403` (orphan-набор) · `cli/cmd/sync-skills/sync-skills.cmd.ts:67-118` (`syncDirectivesFirst`), `:136` (`rmSync` по умолчанию), `:154-168`, `:181` · `cli/cmd/sync-skills/sync-skills-formatter.ts:88-124,147-153` · `shared/common/sync/sync-core.shared.ts:15-28,36-59,67-70` · `shared/common/sync/path-normalizer.ts:34-96` · `shared/sdd/task-authoring-literals.ts:46-91` · `cli/cmd/sdd-sync/sdd-sync.cmd.ts:39-51,55-85,95-127,135-244` · `ai/directives/knowledge.xml:1-2` · `ai/directives/agent-inbox/golden-chat-output.example.md:176` · `ai/directives/sdd-v2/infra.directive.xml:83,243,316` · `ai/kit/axiom/scaffold/ax-rule-activation-plan.xml:3` · `ai/skills/README.md:75-83` · `specs/cli/sync/sync.spec.md:34,282-292` · `specs/cli/sync-skills/sync-skills.spec.md:5,19-24,54-57,229,331,336-343` · `specs/cli/sdd-sync/sdd-sync.spec.md:9-25` · `scripts/test-topology.ts:181-196,216-219` · `cli/__tests__/e2e/setup.ts:1-70` · `package.json` (`files`, `scripts.test`)

**MAIN (v1).** `cli/cmd/sync/sync-core.ts:16-21,23-27,84-132,95-101,147-152,217,239-241,254` · `cli/cmd/sync/sync.types.ts:8,19` · `cli/cmd/sync/__tests__/sync-core.test.ts:223,242` · `cli/cmd/sync-skills/sync-skills-core.ts:25,32,42,62,96,115,128,147,158-207,272,520-600` · `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts:151,165,237,246,265,360,377,391,538-627` · `cli/cmd/sync-skills/sync-skills.cmd.ts:19,101` · `shared/common/sync/sync-core.shared.ts:10-46` · `shared/common/sync/path-normalizer.ts:34-96` · `services/plugins/plugin-assets.ts:43-54,65-88` · `scripts/__tests__/deployed-surface.test.ts:14,23-41,47,74,82` + `deployed-surface.golden.txt` (80) · `cli/__tests__/e2e/sync-skills.e2e.test.ts` (`runFromCheckout`, `registerSyncSkillsCheckoutTests`) · `cli/__tests__/e2e/publish-contents.e2e.test.ts:26-46` · `ai/directives/knowledge.xml:2-7` · `ai/skills/sdd-execute/scripts/check.sh:307-310` · `specs/cli/sync-skills/sync-skills.spec.md:5,25-29,103-113,233-234,290,378` · `specs/cli/sync/sync.spec.md` (пробел: `preserved`/плагины не описаны)

**Потребители.** `/Users/k.lebedev/Developer/messenger/ai/directives/{coding/logging-rules.xml, coding/result-conventions.xml, language/, perf-auditor/, sdd/{fix,svelte-ui-discovery}.directive.xml, knowledge.xml}`; `/Users/k.lebedev/Developer/messenger/.claude/skills/{lang-lint,run-e2e,uikit-component-generate}` — прочитаны, не изменены. cloud-ios (akkrat): `generate-codeowners`, `write-uitests`, Swift-реестр в `knowledge.xml` — по фактам задания, воспроизведено фикстурой.


# Часть II — V-B3 (независимый верификатор)

# V-B3 — независимая верификация `B3-sync-ownership-track.md`

Fresh eyes, adversarial, read-only. Ни один tracked-файл не изменён; всё исполнялось на копиях в scratchpad.

- **RC** = `<SP>/rc-v6`, HEAD `11291af5` (`codex/sdd-v2-rc52-followup`), `package.json.version = 0.8.4`. Рабочее дерево чистое (только untracked `.npm-ci-done`).
- **MAIN** = `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`, HEAD `defe1058` (docs-коммит над `8bb38477`), `0.9.0-next.3`. Файлы трека `cli/cmd/sync*`, `shared/common/sync/*`, `scripts/__tests__/deployed-surface.*` не тронуты этим коммитом.
- `<SP>` = `/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad`.

Мои артефакты (все в scratchpad, ни один — в репозиториях): `VB3-mkfixture.sh`, `VB3-snap.sh`, `VB3-run.sh`, `VB3-run2.sh`, `VB3-run-main.sh`, `VB3-messenger.sh`, `VB3-messenger-real.sh`, `VB3-cloudios.sh`, `VB3-s4.sh`, `VB3-s4-skills.sh`, `VB3-s2.sh`, `VB3-s6.sh`, `VB3-registry-probe.ts` + логи `VB3-*.{out,dry,real,before,after,diff}.txt`.

---

## § Итог

**Документ выдерживает проверку по существу.** Все три «новых дефекта v2», утечка dev-пути, предпочтение `loadRuleRegistry` и весь messenger-сценарий воспроизведены независимо, цифра в цифру. Из ~150 проверенных цитат: **CONFIRMED ~140, WRONG-LINE 8 (все ±1–2 строки, ни одна не меняет смысла), REFUTED 2** (обе — про механизм, не про факт).

Что нужно поправить в B3 (по убыванию важности):

1. **S5-bis описан на треть.** Форматтер `sync-skills-formatter.ts` ведёт себя по-разному в трёх ветках, и только одна из них — «скрывает». Две другие **печатают ложь**: в группе с dominant `added` удаляемый файл печатается с меткой `(would add)`; в группе с dominant `deleted` (SKILL.md побайтово совпал + один проектный файл) **живой, сохранённый** `SKILL.md` печатается как удаляемый, а весь поддерживаемый скилл анонсируется как `- <skill>/ (would delete)`. Утверждение B3 «при `added` — тоже только свои (`:88-94`)» — **REFUTED**. Плюс: RC-спека `specs/cli/sync-skills/sync-skills.spec.md:229` прямо утверждает «Смешанные статусы … внутри одного скила невозможны» — код `sync-skills-core.ts:382-391` это опровергает. Спека противоречит коду; в B3 этого нет.
2. **S4 из аргумента стал доказательством, и он катастрофичен.** Один `chmod 000` на **один** подкаталог источника → RC удалил **все 8 живых, корректных, пакетных** файлов из `ai/directives/testing/` потребителя, `exit 0`, ни ошибки, ни warning. MAIN на том же дефекте: **0 удалений, 9 файлов целы**. Скилловая половина: RC **опустошил** `sdd-execute/` потребителя (1 → 0 файлов), MAIN сохранил 12. B3 только рассуждал — теперь это репро.
3. **S2 недооценён.** Вердикт «ЧАСТИЧНО (дыра, замка нет)` неверен: RC при запуске из клона против потребителя без `node_modules/gennady` **падает с `exit 1`** («Error: gennady package not found»), MAIN на том же входе синкает штатно (`exit 0`). Это не латентная дыра, а воспроизводимый функциональный регресс → **НЕ ЗАКРЫТО**.
4. **Пропущен cloud-ios как эмпирика, а он сильнее messenger'а.** Один `gennady sync-skills` на копии akkrat-ветки удаляет **4 из 5** зарегистрированных в его реестре Swift/ObjC-правил (`coding/swift-rules.xml`, `coding/objc-rules.xml`, `infra/swiftlint-setup.xml`, `testing/xctest-rules.xml`) **и** перетирает сам реестр (5 Swift-правил → 14 TS-правил), плюс 25 файлов скиллов, из которых 11 (`sdd-execute/scripts/**`) не названы в выводе ни разу. B3 отнёс cloud-ios к «по фактам задания, воспроизведено фикстурой» — его можно и нужно воспроизвести буквально, через `git archive`.
5. **Арифметика итога в §1.12 сломана.** Строка 208: «ЧАСТИЧНО 4 (S2, S8, R5, + S3 условно)» и «НЕПРИМЕНИМО 3 (S3, S9, R4)» — S3 посчитан дважды; «НЕ ЗАКРЫТО 6 (…)» перечисляет 7 пунктов. Правильно по самой таблице: **НЕ ЗАКРЫТО 7 · ЧАСТИЧНО 3 · НЕПРИМЕНИМО 3 = 13**. С моей поправкой по S2: **НЕ ЗАКРЫТО 8 · ЧАСТИЧНО 2 · НЕПРИМЕНИМО 3**.
6. **Методическая заметка §0 неверна.** «CLI main в этом worktree не стартует — нет `node_modules`, `yaml` не резолвится» — **REFUTED**: `node_modules` в MAIN заполнен (268 пакетов, `node_modules/.bin/tsx` есть), MAIN CLI запускается из этого worktree и даёт end-to-end результат. Я прогнал его напрямую и получил ровно те же сводки, что B3 добыл самописным драйвером (`Synced: 47 added, 1 updated, 0 skipped (unchanged), 1 preserved (project-owned)`), так что **выводы B3 не пострадали** — но обоснование «ядро вызвано напрямую, потому что CLI не стартует» надо снять.
7. **Утечка dev-пути шире.** В синкаемой поверхности она одна (подтверждена). Но `package.json.files = ["dist/**/*","README.md","ai/**/*","cli/cmd/orient/README.md"]` тащит в tarball ещё **5** вхождений `/Users/k.lebedev/…` в `ai/flow-eval/**` (`RUNBOOK.ru.md:36,119`, `roundtrip-eval.sh:19,20,27`, `roundtrip-grade.sh:11,16`, `migration-eval.sh:12,13,21`, `session-metrics.py:20`). `npm pack --dry-run`: **1190 файлов**, из них `ai/kit` 979, `ai/flow-eval` 50, `ai/drafts` 1. Golden в определении main (`deployedSurface()` = только sync-поверхность) их **не поймает** — SO-5 надо расширять до tarball-поверхности либо сужать `files`.
8. **Мелкая арифметика деплой-поверхности.** B3: «105 файлов в `ai/directives/` + 13 в `.claude/skills/` = 118». Реально: пакет пишет **104** директивы (106 в `ai/directives` минус 2 под `architecture/`) + **13** файлов скиллов = **117**; 105-й файл в дереве фикстуры — это уцелевший проектный `local/ios.xml`. Как «счёт дерева фикстуры» 105 верно, как «деплой-поверхность» — нет.
9. **«≈95 файлов `sdd-v2/`» → 73.** Проверено и на RC, и на синканном дереве messenger'а.

Ни одно из этих замечаний не меняет ни одного вердикта матрицы, кроме S2. Все шесть «блокеров релиза» B3 подтверждаю, и **добавляю два**: SO-7 (S4) и SO-8 (S2).

---

## § Цитаты и матрица

### Цитаты — RC (v2)

| Цитата B3 | Статус | Что там на самом деле |
|---|---|---|
| `cli/cmd/sync/sync-core.ts:16` `EXCLUDED_ENTRIES` | CONFIRMED | `new Set(['architecture'])` |
| `sync-core.ts:108-120` `listOwnedSubdirs` | CONFIRMED | функция 108–120 |
| `sync-core.ts:134-174` `scanTargetMirrorSpace` | CONFIRMED | функция 134–174 |
| `sync-core.ts:159-163` warning | CONFIRMED | `warnings.push('unknown subdirectory in target …')` |
| `sync-core.ts:165-170` корневые файлы | CONFIRMED | `else if (st.isFile() && !filtered) files.push(name)` |
| `sync-core.ts:176-182` проглатывание `readdirSync` | CONFIRMED | `try { entries = readdirSync(dir) } catch { return }` |
| `sync-core.ts:217` единственный корень | CONFIRMED | `scanDirectives(opts.sourceDir, opts.subdirs)` |
| `sync-core.ts:226-244` зеркальное удаление | CONFIRMED | 226 — `filtered`, цикл удаления 233–244 |
| `sync-core.ts:261-268` лестница статусов | CONFIRMED | `added / unchanged / updated`, `preserved` отсутствует |
| `sync-core.ts:283` `SyncResult(entries, warnings)` | CONFIRMED | |
| `sync.types.ts:6` `SyncFileStatus` | CONFIRMED | `'added' \| 'updated' \| 'deleted' \| 'unchanged'` |
| `sync.cmd.ts:75,87` target = `process.cwd()` | CONFIRMED | `:75` cwd, `:87` `join(cwd,'ai','directives')` |
| `sync-skills-core.ts:21` `EXCLUDED_NAMES` | **WRONG-LINE** | объявление на `:22`; `:21` — комментарий. `:84` (применение) — CONFIRMED |
| `sync-skills-core.ts:158-181` `collectOrphanFiles` | CONFIRMED | функция 158–182 |
| `sync-skills-core.ts:192-268` `deleteOrphan` | CONFIRMED | функция 192–270 |
| `sync-skills-core.ts:332` `scanSkills(opts.sourceDir, opts.skillNames)` | CONFIRMED | |
| `sync-skills-core.ts:377-392` файловое зеркало внутри скилла | CONFIRMED | `:377` `targetFiles.delete`, цикл удаления 382–391 |
| `sync-skills-core.ts:380-381` комментарий «Existing skill directories are mirrors too» | CONFIRMED | verbatim |
| `sync-skills-core.ts:396-403` orphan-набор | CONFIRMED | |
| `sync-skills-formatter.ts:100-110` ветка `updated` печатает только `added\|updated` | CONFIRMED | фильтр `:100-102`, цикл `:104-110` |
| `sync-skills-formatter.ts:88-94` «при `added` — тоже только свои» | **REFUTED** | `:88` — `for (const e of group.entries.sort(…))` **без фильтра по статусу**: `deleted`-запись печатается, в dry-run с меткой `LABEL_WOULD_ADD` |
| `sync-skills-formatter.ts:111-124` ветка `deleted` | CONFIRMED | печатает **все** записи группы с `relativePath !== ''`, включая `unchanged` |
| `sync-skills-formatter.ts:147-148` dry-run без счётчиков | CONFIRMED | `'Dry-run: no files written.'`; то же в `shared/common/sync/sync-formatter.shared.ts:75` для `sync` |
| `sync-skills.cmd.ts:67-118` `syncDirectivesFirst` | CONFIRMED | функция 67–119 |
| `sync-skills.cmd.ts:82-86` «`opts` без `subdirs`» | **WRONG-LINE** | литерал `opts` на `:84-88`; факт (нет `subdirs`) верен |
| `sync-skills.cmd.ts:154-168` безусловный вызов из `run` | CONFIRMED | |
| `sync-skills.cmd.ts:136` `rmSync(path,{recursive:true,force:true})` | CONFIRMED | |
| `sync-skills.cmd.ts:181` target = `<cwd>/.claude/skills` | CONFIRMED | |
| `shared/common/sync/sync-core.shared.ts:15-28` `resolveSelfRepoDir` | CONFIRMED | |
| `sync-core.shared.ts:36-59` три стратегии | CONFIRMED | |
| `sync-core.shared.ts:47` отрезание `dist` | CONFIRMED | `pkgFile.replace(/[/\\]dist[/\\].*$/, '')` |
| `shared/common/sync/path-normalizer.ts:34-96` | CONFIRMED (нит) | файл 95 строк; правила 34–95, `RULE_PLUGIN_DIRECTIVES` отсутствует, `RULE_SKILLS_TILDE:49` цел |
| `shared/sdd/task-authoring-literals.ts:60-73` `parseRuleRegistry` | **WRONG-LINE** | функция 59–74 |
| `task-authoring-literals.ts:69` бросок `duplicate rule id` | **WRONG-LINE** | `:70` |
| `task-authoring-literals.ts:76-91` `loadRuleRegistry` предпочитает проектный | CONFIRMED | docblock 76–80, функция 81–91; `existsSync(projectRegistry)` → проектный |
| `cli/cmd/sdd-new/help.ts:92` | CONFIRMED | «tuples from `ai/directives/knowledge.xml` …» |
| `cli/cmd/sdd-new/sdd-new.types.ts:148,314` | CONFIRMED как текст | `:148` — текст ошибки `ERR_CLI_SDD_NEW_RULE_REGISTRY_INVALID`, `:314` — manifest-текст. **Но** это не путь вставки в тикет — см. ниже |
| `ai/directives/knowledge.xml:1-2` | CONFIRMED | `<AiKnowledge ver="2.0">` / `<Rules>`; 14 `Rule id` ровно тем списком; `grep '^  <[A-Z]'` = `2:  <Rules>` |
| `ai/directives/agent-inbox/golden-chat-output.example.md:176` | CONFIRMED | verbatim, три `/Users/k.lebedev/.gennady/agent-inbox/reports/group__proj-510…` |
| `ai/directives/sdd-v2/infra.directive.xml:83,243` | CONFIRMED | `:83` `AX_SCOPE_RULES_DECLARATION`, `:243` «the sole index (`<Rules>` section)» |
| `ai/kit/axiom/scaffold/ax-rule-activation-plan.xml:3` | **WRONG-LINE** | `:3` = `<Axiom id="AX_RULE_ACTIVATION_PLAN">`; «canonical rule registry» на `:4` |
| `ai/skills/README.md:75-83` | CONFIRMED | раздел «Синхронизация», 4 команды + 1 фраза, о владении — ни слова |
| `specs/cli/sync-skills/sync-skills.spec.md:331` | CONFIRMED | verbatim, в `Risk accepted` под D-M005 |
| `specs/cli/sync-skills/sync-skills.spec.md:336-343` D-M006 | CONFIRMED | «Полная синхронизация (rsync --delete)», rejected «Сохранение orphan-файлов» |
| `specs/cli/sync/sync.spec.md:34,282-292` | CONFIRMED | `:34` `SyncFormatEntry`, `:286` D-M006 объясняет сужение `EXCLUDED_ENTRIES` |
| `scripts/test-topology.ts:181-196` | CONFIRMED | `basename(file).includes('contract')` на `:181` → `['contract']` |
| `cli/__tests__/e2e/setup.ts:1-70` | CONFIRMED | реальный build+pack+`npm install` в temp-проект |
| `cli/cmd/sdd-sync/sdd-sync.cmd.ts:39-51,55-85,95-127,135-244` | CONFIRMED | `isAllowedOwnerIndex:39`, `discoverIndexes:55`, `recomputeProgress:95`, файл 249 строк. Нит: `updateTrackerStatus` определён в `shared/sdd/tracker.ts:67`, а в `sdd-sync.cmd.ts` только вызывается (`:202`, `:219`) |
| `specs/cli/sdd-sync/sdd-sync.spec.md:9` | CONFIRMED | «Распространение статуса тикета в трекеры `*.3-tasks.md`» |
| `cli/gennady.ts:140,229,330,334,426` | CONFIRMED | `sync`/`sdd-sync` help, `sync`/`sync-skills`/`sdd-sync` dispatch |
| `RC/cli/cmd/sync/__tests__/sync-core.test.ts:68,78` | CONFIRMED | «finds local node_modules/gennady/ai/directives», «returns null when package not found» |
| `RC/cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts:244` | CONFIRMED | «detects orphan skills (deleted from source but present in target)» |
| `grep PROJECT_OWNED` / `grep gennady-synced` по RC = 0 | CONFIRMED | по `cli`, `shared`, `ai`, `specs` |
| checkout-e2e удалён | CONFIRMED | `runFromCheckout` / `registerSyncSkillsCheckoutTests` в `RC/cli/__tests__/e2e/*` = 0 совпадений; в MAIN — `sync-skills.e2e.test.ts:97,109` |
| RC unit-тесты трека 140 pass / 0 fail / 31 suite | CONFIRMED | мой прогон: `# tests 140 / # suites 31 / # pass 140 / # fail 0`, 455 ms |

### Цитаты — MAIN (v1)

| Цитата B3 | Статус |
|---|---|
| `cli/cmd/sync/sync-core.ts:16-21` `EXCLUDED_ENTRIES` (4 записи) | CONFIRMED |
| `sync-core.ts:27` `PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])` | CONFIRMED |
| `sync-core.ts:84-132` `scanSourceRoots` | CONFIRMED |
| `sync-core.ts:95-101,147-152` точечный `try/catch` вокруг `statSync` («review P2») | CONFIRMED |
| `sync-core.ts:217` `extraSourceDirs` | CONFIRMED |
| `sync-core.ts:239-241` `status = 'preserved'` | CONFIRMED |
| `sync-core.ts:254` подавление записи | CONFIRMED (`status !== 'unchanged' && status !== 'preserved'`) |
| `sync.types.ts:8,19` | CONFIRMED |
| `sync-skills-core.ts:25` `EXCLUDED_NAMES = {'.DS_Store','__tests__'}` | CONFIRMED |
| `:32` `MANIFEST_NAME`, `:42` `readSyncManifest`, `:62` `writeSyncManifest`, `:96` `adoptPackageInstalled`, `:115` `nextManifestNames`, `:128` `isTestArtifact`, `:272` применение | CONFIRMED (все шесть) |
| `sync-skills-core.ts:158-190` `scanAllSkillRoots` | CONFIRMED (функция 158–184; дисциплина `index > 0 && (ENOENT\|ENOTDIR)` — verbatim) |
| `sync-skills-core.ts:581-600` применение манифеста | CONFIRMED (`readSyncManifest` `:581`, `writeSyncManifest` `:596-601`) |
| `sync-core.test.ts:223,242` | CONFIRMED verbatim |
| `sync-skills-core.test.ts:151,165,237,246,265,360,377,391,538,549,563,577,592,606,617,627` | CONFIRMED — **все 16 строк verbatim** |
| `shared/common/sync/sync-core.shared.ts:10-46` подъём по `package.json` | CONFIRMED (`packageRootOf`, требует `name === 'gennady'`) |
| `services/plugins/plugin-assets.ts:43-54` `pluginSurfaceDirs` | CONFIRMED |
| `scripts/__tests__/deployed-surface.test.ts:47,74,82` + `:83` фильтр | CONFIRMED verbatim; golden = **80** строк |
| `ai/directives/knowledge.xml:2-7` шапка PROJECT-OWNED | CONFIRMED verbatim; 19 `Rule id`; секции `:8 <Directives>`, `:54 <Rules>` |
| `ai/skills/sdd-execute/scripts/check.sh:307-310` `[TRACKER_SYNC]` | CONFIRMED |
| `specs/cli/sync-skills/sync-skills.spec.md:5,25-29,103-113,233-234,290,378` | CONFIRMED (все) |
| «`specs/cli/sync/sync.spec.md` про `preserved`/плагины не знает» | CONFIRMED и сильнее: `grep -i 'preserved\|project-owned\|plugin\|extraSourceDirs\|knowledge.xml'` по всем 337 строкам = **0** |
| R4: `plugins/golang/**` | CONFIRMED — `plugins/golang/directives/infra/golang-setup.xml`, `plugins/golang/skills/sdd-infra-golang/SKILL.md` (единственные ассеты плагина), и они **материально доехали** до моей фикстуры |

### Матрица — согласие/несогласие

| # | Вердикт B3 | Мой вердикт | Доказательство |
|---|---|---|---|
| S1 | НЕ ЗАКРЫТО | **согласен** | Фикстура B: реестр перезаписан пакетным, `grep -c swift-rules` = 0. MAIN на той же фикстуре: `• knowledge.xml (project-owned, would keep)`, реестр цел (`swift-rules` = 2 вхождения) |
| S2 | ЧАСТИЧНО | **НЕ СОГЛАСЕН → НЕ ЗАКРЫТО** | Потребитель без `node_modules/gennady`, CLI из клона: RC `exit 1` + «Error: gennady package not found. Install it locally: npm i -D gennady»; MAIN `exit 0` + полный список. Функциональный регресс, не латентная дыра |
| S3 | НЕПРИМЕНИМО (вернётся с портом) | **согласен** | В прогоне MAIN на моей фикстуре плагинные ассеты доехали: `+ infra/golang-setup.xml`, `+ sdd-infra-golang/`. В RC `services/plugins/`, `plugins/`, `extraSourceDirs` — нет |
| S4 | НЕ ЗАКРЫТО, хуже v1 | **согласен, усиливаю до репро** | `chmod 000` на `<pkg>/ai/directives/testing` → RC: `Synced: 0 added, 0 updated, 96 skipped, 8 deleted`, 8 живых файлов удалены, `exit 0`, без warning. MAIN на том же: `Synced: 1 added, 1 updated, 38 skipped`, **0 удалений**, 9 файлов целы. Скилловая половина: RC опустошил `sdd-execute/` (1→0), MAIN сохранил 12 |
| S5 | НЕ ЗАКРЫТО | **согласен** | Фикстура D: `generate-codeowners/`, `write-uitests/` удалены. cloud-ios: 11 orphan-скиллов. MAIN: 0 удалений + манифест `.gennady-synced` с 17 именами |
| S5-bis | НЕ ЗАКРЫТО (v2-only) | **согласен по факту, механизм описан на треть** | См. § Новые дефекты, п. 1 |
| S6 | НЕ ЗАКРЫТО (латентно) | **согласен, но не латентно — репро** | Внедрил `__tests__/audit.test.ts`, `helper.test.ts`, `helper.spec.js` в пакетный `sdd-audit`: RC задеплоил **все три** в `.claude/skills/sdd-audit/`; MAIN — **ни один** |
| S7 | НЕ ЗАКРЫТО | **согласен, расширяю** | Утечка в синк-поверхности подтверждена (1 файл). Плюс 5 вхождений в `ai/flow-eval/**`, уезжающих в tarball; `npm pack --dry-run` = 1190 файлов. `grep -rl 'k.lebedev'` по MAIN `ai/directives`+`ai/skills` = 0 — чистота main подтверждена |
| S8 | ЧАСТИЧНО | **согласен** | RC path-normalizer: 8 правил, `RULE_SKILLS_TILDE:49` цел, `RULE_PLUGIN_DIRECTIVES` отсутствует (MAIN `:63`); правила для `/Users/<user>/.gennady/` нет ни там, ни там |
| S9 | НЕПРИМЕНИМО | **согласен с переформулировкой** | В пакете RC скриптов в скиллах нет. **Но у потребителей они есть**: messenger `sdd-execute/scripts/` = 9 файлов, cloud-ios = 11. Именно их выкашивает внутрискилловое зеркало. «Потребность исчезла» верно для пакета, но не для потребителя |
| R3 | НЕ ЗАКРЫТО | **согласен** | 14 TS-правил, `<Directives>` нет, шапки нет. Дополнение: у main `typescript-rules` **уже** имеет `<SkipWhen>` для не-TS (`knowledge.xml:80`) — SO-10 в этой части порт, не дизайн |
| R4 | НЕПРИМЕНИМО | **согласен** | см. выше |
| R5 | ЧАСТИЧНО | **согласен, ужесточаю** | `parseRuleRegistry` бросает не только на дубль id и на пустой реестр, но и когда **любой** `<Rule>` без `<File>`: `parseRuleRegistry('<Rules><Rule id="swift-rules">text only</Rule></Rules>')` → `no complete <Rule id="…"><File>…</File></Rule> entries`. Значит проект, авторящий правила текстом, ломает `gennady sdd-new task` наглухо |

**Правильный итог матрицы:** НЕ ЗАКРЫТО **8** (S1, S2, S4, S5, S5-bis, S6, S7, R3) · ЧАСТИЧНО **2** (S8, R5) · НЕПРИМЕНИМО **3** (S3, S9, R4) · ЗАКРЫТО **0**. Всего 13 строк.

### Поправка к S1/R5: механизм машинного потребителя

B3: «`parseRuleRegistry` отдаёт кортежи `id`/`file`, которые `sdd-new` **вставляет в каждый новый тикет**». Механизм иной: `loadRuleRegistry(process.cwd())` вызывается только для `kind === 'task'` (`sdd-new.cmd.ts:476-478`), результат идёт в `renderTaskAuthoringLiterals` (`task-authoring-literals.ts:119-141`) и оттуда **в stdout** через `renderCreated` (`sdd-new.cmd.ts:553`) как блок «copy exactly; choose applicable rules». Скелет тикета пишется отдельно (`:514-525`) и кортежей не содержит. То есть тикет портит **агент, копирующий подсказку**, а не тул.

Зато детерминированное последствие сильнее того, что B3 назвал: реестр, который не парсится (пустой, или `<Rule>` без `<File>`), даёт `ruleRegistryInvalid` → `ERR_CLI_SDD_NEW_RULE_REGISTRY_INVALID`, `exitCode: 1` (`sdd-new.types.ts:144-151`). Проверено пробой: **`gennady sdd-new task` перестаёт работать вообще.** Предпочтение проектного реестра подтверждено численно: `loadRuleRegistry('/Users/k.lebedev/Developer/messenger')` → **19** кортежей (`result-conventions, logging-rules, …`), `loadRuleRegistry('/nonexistent-repo-root')` → **14** пакетных (`typescript-rules, svelte5-runes, …`). После первого v2-sync первое превращается во второе.

---

## § Репро (моя фикстура)

`VB3-mkfixture.sh` собирает `<SP>/VB3-fixture/base`: `package.json` (`name: swiftly-app`), `node_modules/gennady → RC`, и девять артефактов:

| Артефакт | Смысл |
|---|---|
| `ai/directives/knowledge.xml` | project-owned реестр: `<CheckPhaseOrder>build test swiftlint format</CheckPhaseOrder>`, `Rule id="swift-rules"`, `Rule id="xctest-rules"` |
| `ai/directives/coding/swift-rules.xml` | проектный rule-файл, на который ссылается реестр |
| `ai/directives/coding/typescript-rules.xml` | пакетная директива + локальный патч `<!-- PROJECT PATCH ts -->` |
| `ai/directives/sdd-v2/infra.directive.xml` | пропатченный `sdd-v2/*.xml` (`<!-- PROJECT PATCH sddv2 -->`) |
| `ai/directives/sdd-v2/local-swift-overrides.xml` | проектный файл в пакетном подкаталоге |
| `ai/directives/testing/legacy-xctest.xml` | устаревший ранее-синканный файл |
| `ai/directives/local/ios.xml` | проектный подкаталог, которого пакет не поставляет |
| `ai/directives/project-notes.md` | **проектный файл в корне `ai/directives/`** (в B3 не тестировался) |
| `.claude/skills/{generate-codeowners,write-uitests}/SKILL.md` | проектные скиллы (кейс #9.4) |
| `.claude/skills/sdd-execute/{SKILL.md,local-helper.sh}` | локальный хелпер внутри пакетного скилла; `SKILL.md` побайтово = пакетный |
| `.claude/skills/sdd-discover/SKILL.md` | v1-скилл, которого в v2-пакете нет |

Прогоны — каждый на свежей копии, `sh -c` + `cd` внутри скрипта, снимок `<sha12> <relpath>` до/после.

| Артефакт | RC `sync --dry-run` | RC `sync` (реально) | MAIN `sync` (реально) |
|---|---|---|---|
| `knowledge.xml` (Swift) | `~ (would update)` | **перезаписан** пакетным TS-реестром, `swift-rules` = 0 | `• (project-owned, would keep)` → **цел**, `swift-rules` = 2 |
| `coding/swift-rules.xml` | `- (would delete)` | **удалён** | не тронут |
| `coding/typescript-rules.xml` + патч | `~ (would update)` | патч потерян (`PROJECT PATCH` = 0) | `~ updated`, патч тоже потерян |
| `sdd-v2/infra.directive.xml` + патч | `~ (would update)` | патч потерян | (в v1 файла нет) |
| `sdd-v2/local-swift-overrides.xml` | `- (would delete)` | **удалён** | не тронут |
| `testing/legacy-xctest.xml` | `- (would delete)` | **удалён** (желаемо, но неотличимо от проектного) | не тронут |
| `project-notes.md` (корень) | `- (would delete)` | **удалён** | не тронут |
| `local/ios.xml` | не тронут + `Warning: unknown subdirectory in target (not owned by package, left untouched): local` | цел | цел, без warning |
| `.claude/skills/generate-codeowners/`, `write-uitests/` | `- (would delete)` | **удалены** | целы |
| `.claude/skills/sdd-discover/` | `- (would delete)` | **удалён** | `~ updated` (main его поставляет) |
| `.claude/skills/sdd-execute/local-helper.sh` | см. ниже — **вывод врёт** | **удалён**, `SKILL.md` цел | цел (12 файлов в скилле) |
| `.claude/skills/.gennady-synced` | — | не создаётся | создаётся, 17 имён |

Сводки: RC `sync` — `Synced: 101 added, 3 updated, 0 skipped (unchanged), 4 deleted`; RC `sync-skills` — `Synced: 12 added, 0 updated, 1 skipped, 4 deleted`; MAIN `sync` — `Synced: 47 added, 1 updated, 0 skipped (unchanged), 1 preserved (project-owned)`; MAIN `sync-skills` — `Synced: 29 added, 2 updated, 0 skipped, 0 deleted`. `--dry-run` в обеих системах дерево не тронул (пустой diff снимков).

Резюме B3 «main = безопасный, но протекающий; RC = агрессивный и теряющий; хэш-манифеста нет ни там, ни там» — подтверждаю дословно.

### Три ветки форматтера (фикстура E, `VB3-run2.sh`)

Три скилла, три состояния target, один прогон:

| Скилл | Состояние target | Вывод `--dry-run` и реального прогона | Что реально на диске |
|---|---|---|---|
| `sdd-execute` | `SKILL.md` **отличается** + `local-helper.sh` | `~ sdd-execute/` → `SKILL.md (would update)`. **`local-helper.sh` не назван нигде** | `local-helper.sh` **удалён**, `SKILL.md` перезаписан |
| `sdd-check` | `SKILL.md` **отсутствует**, есть только `PROJECT-NOTES.md` | `+ sdd-check/` → `PROJECT-NOTES.md` **`(would add)`**, `SKILL.md (would add)` | `PROJECT-NOTES.md` **удалён**, `SKILL.md` добавлен |
| `sdd-audit` | `SKILL.md` **побайтово совпадает** + `local.txt` | `- sdd-audit/ (would delete)` → `local.txt`, **`SKILL.md`** | `local.txt` удалён, **`SKILL.md` цел** |

Сводка: `Synced: 11 added, 1 updated, 1 skipped, 3 deleted`.

Итого форматтер даёт три разных неверных представления об одном и том же действии: **скрывает** (ветка `updated`, `:100-110`), **называет удаление добавлением** (ветка `added`, `:88-94`), **называет сохранённый файл удалённым и хоронит живой скилл** (ветка `deleted`, `:111-124`). `--dry-run` не может служить предпросмотром ни в одной из трёх.

---

## § Новые дефекты

### 1. S5-bis: внутрискилловое зеркало + три лживых ветки форматтера — ПОДТВЕРЖДЁН и расширен

Код: `sync-skills-core.ts:382-391` (`entries.push({skillName, relativePath, status:'deleted'})` + `deps.unlink!(join(targetSkillDir, relativePath))`), комментарий-обоснование `:380-381`.

Что B3 описал верно: ветка `updated` форматтера скрывает удаление полностью. Что он пропустил: две другие ветки печатают ложные утверждения (таблица выше). Что он не заметил вовсе:

- **RC-спека противоречит RC-коду.** `specs/cli/sync-skills/sync-skills.spec.md:229`: «`deleted` статус — только на уровне целого скила. Смешанные статусы (часть файлов added, часть deleted) внутри одного скила невозможны.» Фикстура E создаёт ровно такие смешанные статусы в трёх скиллах из трёх. Это не «спека отстала» — это спека, отрицающая существование самого разрушительного нового поведения. Правку спеки надо явно вписать в SO-2/SO-4.
- **Счётчик `deleted` считает записи, не файлы.** На cloud-ios сводка говорит `22 deleted`, а с диска исчезает **25** файлов: в не-dry режиме `deleteOrphan` возвращает **одну** запись на скилл (`:263-269`), файлы внутри orphan-каталога в счёт не входят.

### 2. `sync-skills` всегда сначала гонит полный нефильтрованный `sync` — ПОДТВЕРЖДЁН

`syncDirectivesFirst` (`sync-skills.cmd.ts:67-119`), `opts` без `subdirs` (`:84-88`), безусловный вызов из `run` (`:154-168`). В MAIN `grep syncDirectivesFirst` = 0.

Материальное последствие, воспроизведённое на копии messenger: **один** `gennady sync-skills` (без аргументов) удалил `ai/directives/coding/logging-rules.xml` **и** стёр его регистрацию из `knowledge.xml` (`grep -c logging-rules` = 0) — двойная потеря одной командой, которая по имени вообще не про директивы. Сводки того прогона: `Synced: 83 added, 19 updated, 2 skipped (unchanged), 2 deleted` (директивы) + `Synced: 8 added, 5 updated, 0 skipped, 20 deleted` (скиллы).

Добавлю к оценке B3: `gennady sync-skills sdd-execute` (узкий фильтр) выполняет тот же **нефильтрованный** директивный проход — фильтр `positional` попадает только в `SyncSkillsOptions.skillNames` (`:186`), в `syncDirectivesFirst` он не передаётся вообще.

### 3. S4: проглоченный `readdirSync` + зеркало = удаление живых файлов — ПОДТВЕРЖДЁН, и это худший дефект трека

`collectRecursive` (`sync-core.ts:176-182`) возвращает частичный список, `listOwnedSubdirs` (`:108-120`) при этом всё равно объявляет подкаталог owned (ему хватает `statSync` на самом каталоге), и цикл `:233-244` удаляет всё, чего «нет в источнике».

Проба `VB3-s4.sh`: приватная копия пакета, `chmod 000` на **один** подкаталог `ai/directives/testing`, потребитель = корректно синканное дерево того же пакета.

```
RC:   Synced: 0 added, 0 updated, 96 skipped (unchanged), 8 deleted   → target testing/: 8 → 0 файлов, exit 0
MAIN: Synced: 1 added, 1 updated, 38 skipped (unchanged)              → target testing/: 9 → 9 файлов, exit 0
```

Восемь корректных, пакетных, никем не изменённых файлов уничтожены из-за одной ошибки прав, с нулевым кодом возврата и без единого warning. Это буквально класс инцидента `40d209d8`/`e2b6087c`, воссозданный на директивах — вердикт B3 «состояние хуже v1» подтверждён численно.

Скилловая половина (`VB3-s4-skills.sh`, `chmod 000` на `<pkg>/ai/skills/sdd-execute`): RC — `Synced: 0 added, 0 updated, 12 skipped, 1 deleted`, содержимое `sdd-execute/` у потребителя **опустошено** (1 → 0 файлов, пустой каталог остался); MAIN — `Synced: 1 added, 8 updated, 10 skipped, 0 deleted`, все 12 файлов целы. Оба недокопировали; удаляет только RC.

### 4. Утечка `/Users/k.lebedev/…` — ПОДТВЕРЖДЕНА, шире заявленного

`ai/directives/agent-inbox/golden-chat-output.example.md:176` — verbatim, три ссылки на `/Users/k.lebedev/.gennady/agent-inbox/reports/group__proj-510`. Файл синкается в каждый проект (в моей фикстуре: `+ agent-inbox/golden-chat-output.example.md (would add)`). `SYNC_PATH_RULES` правила под `/Users/<user>/.gennady/` не имеют → уезжает как есть. В MAIN тот же файл существует и чист (`grep -rl 'k.lebedev'` по `MAIN/ai/directives` + `MAIN/ai/skills` = 0).

Сверх B3: `package.json.files` содержит `ai/**/*`, поэтому в tarball уезжают ещё **5** файлов с жёстко прошитыми `/Users/k.lebedev/…`: `ai/flow-eval/RUNBOOK.ru.md:36,119`, `ai/flow-eval/scripts/roundtrip-eval.sh:19,20,27`, `ai/flow-eval/scripts/roundtrip-grade.sh:11,16`, `ai/flow-eval/scripts/migration-eval.sh:12,13,21`, `ai/flow-eval/scripts/session-metrics.py:20`. `npm pack --dry-run`: 1190 файлов (`ai/kit` 979, `ai/flow-eval` 50, `ai/drafts` 1, `ai/directives` 106). Ложноположительных нет: `ai/skills/workspace-permission-setup/SKILL.md:96-100` использует плейсхолдер `/Users/<user>/…` (как и в main). Отдельно проверил, что синканные директивы и скиллы **не** ссылаются на `ai/kit` (`grep -rl 'ai/kit'` = 0), так что 979 файлов `ai/kit` — вес tarball'а, а не битая ссылка у потребителя.

### 5. `loadRuleRegistry` предпочитает проектный `knowledge.xml` — ПОДТВЕРЖДЕНО

`task-authoring-literals.ts:81-91`: `existsSync(projectRegistry)` → `parseRuleRegistry(readFileSync(projectRegistry))`, иначе пакетная копия. Численно: messenger → 19 кортежей, отсутствующий корень → 14. `parseRuleRegistry` бросает на `duplicate rule id "a"`, на `<Rules></Rules>` и на `<Rule>` без `<File>` — все три проверены прямым вызовом.

---

## § Messenger

Копия `ai/directives` + `.claude/skills` из `/Users/k.lebedev/Developer/messenger` в scratchpad (`cp -R`); реальный репозиторий не записывался — контрольная проверка после всех прогонов: `logging-rules.xml` на месте (mtime 12 Jul), `sdd-execute` — все 10 файлов.

Исходное дерево подтверждено: `ai/directives/{coding 9, infra 5, language 3, perf-auditor 5, sdd 13, testing 8}` + `knowledge.xml` в корне (19 `Rule id`, включая `logging-rules`, `result-conventions`, `uikit-spec-drafting`, `uikit-component-svelte`, `uikit-component-storybook`); 16 каталогов в `.claude/skills`; `.gennady-synced` **отсутствует**; `gennady: 0.8.1`.

`RC sync --dry-run` — совпадает с B3 полностью:

- `- coding/logging-rules.xml (would delete)` — проектный rule-файл, зарегистрированный в реестре;
- `- coding/result-conventions.xml (would delete)` — есть в main, в RC нет; для messenger'а неотличим от проектного;
- `~ knowledge.xml (would update)`;
- **19** `~ would update` всего = 18 по `coding/`/`infra/`/`testing/` + `knowledge.xml` (B3 писал «18», имея в виду без реестра — верно);
- 83 `+`, 2 `=`;
- `Warning: … left untouched: language`, `… perf-auditor`, `… sdd`.

`RC sync-skills --dry-run` — тоже точь-в-точь: `+7` (`agent-inbox`, `opencode-get-session`, `prd-interview`, `sdd`, `sdd-code-review`, `sdd-reconcile`, `workspace-permission-setup`), `~5` (`sdd-audit`, `sdd-check`, `sdd-critic`, `sdd-execute`, `sdd-scaffold`), **11 удалений**: `alt-opinion/`, `lang-lint/`, `run-e2e/`, `uikit-component-generate/`, `sdd-continue/`, `sdd-discover/`, `sdd-execute-batch/`, `sdd-fix/`, `sdd-infra/`, `sdd-module-decomposition/`, `sdd-setup/`. Все четыре имени из задания (`ai/directives/coding/logging-rules.xml`, `lang-lint/`, `run-e2e/`, `uikit-component-generate/`) и все 7 v1-скиллов — **подтверждены**.

**Чего в B3 нет, а надо:** на реальном дереве messenger внутрискилловое зеркало молча удаляет **9 файлов** `.claude/skills/sdd-execute/scripts/` — `README.md`, `check-blockers.sh`, `classify-scripts.cjs`, `classify-scripts.ts`, `extract-section.sh`, `lint-artifacts.sh`, `scan.sh`, `sdd`, `verify.sh`. В реальном прогоне (`VB3-messenger-real.sh`) `grep` по всему выводу на любое из этих имён = **0 совпадений**; вывод содержит ровно `~ sdd-execute/ / SKILL.md`. После прогона в каталоге остаётся один `SKILL.md`. Сводка `Synced: 8 added, 5 updated, 0 skipped, 20 deleted` (20 = 11 orphan-скиллов + 9 файлов).

Миграционный факт подтверждён численно: после прогона рядом живут `ai/directives/sdd/` (**13** файлов v1) и `ai/directives/sdd-v2/` (**73** файла, не «≈95»), а новый `knowledge.xml` не содержит секции `<Directives>` вовсе — реестр не указывает ни на один SDD-комплект.

### cloud-ios (akkrat) — сильнее messenger'а, в B3 не воспроизведён

`git archive origin/ap/CLOUDIOS-NOISSUE-swiftlint-exceptions-infra-base -- ai/directives .claude/skills` → 50 директив + 34 файла скиллов в scratchpad. Реестр cloud-ios переписан под Swift: **5** правил — `swift-rules`, `objc-rules`, `xctest-rules`, `git-setup`, `swiftlint-setup` (плюс секция `<Directives>`, `:2`).

`RC sync --dry-run`: **6 удалений** — `coding/objc-rules.xml`, `coding/result-conventions.xml`, `coding/swift-rules.xml`, `infra/golang-setup.xml`, `infra/swiftlint-setup.xml`, `testing/xctest-rules.xml` — и `~ knowledge.xml (would update)`. То есть **4 из 5** правил, на которые ссылается реестр, удаляются, и одновременно уничтожается сам реестр. Выживает ровно `git-setup`. Warnings: `perf-auditor`, `sdd`.

`RC sync-skills` (реально): `Synced: 4 added, 7 updated, 2 skipped (unchanged), 22 deleted`; с диска исчезают **25** файлов, из них **11** — `sdd-execute/scripts/{README.md,_sdd-lib.sh,check-blockers.sh,check.sh,classify-scripts.js,classify-scripts.ts,extract-section.sh,lint-artifacts.sh,scan.sh,sdd,verify.sh}`, ни одно имя не названо в выводе (только `~ sdd-execute/ / SKILL.md`). Также гибнут `generate-codeowners/` вместе с `references/component-team-mapping.md` и `write-uitests/` — ровно issue #9.4.

**Это и есть готовый G2-кейс №3/№6 и лучший аргумент для D-1/D-3.** Рекомендую перенести его в B3 как отдельный подраздел §1.11-bis.

---

## § Дизайн и steelman

### §3.1 — согласуется ли единый хэш-манифест с `.gennady-synced` из main и с `PROJECT_OWNED_ENTRIES`

**Идея верна, но в §3.1 три конкретные дырки.**

1. **Коллизия формата `.gennady-synced`.** В main это **список имён скиллов** (`sync-skills-core.ts:62-77`, `readSyncManifest:42-52`), по строке на имя, с `#`-шапкой. §3.1 предлагает **тот же путь и то же имя** (`.claude/skills/.gennady-synced`) под формат `<sha256>  <relpath>`. Потребитель, уже синканный main 0.9.x (а это ровно та популяция, ради которой всё делается), придёт с v0-манифестом. §3.1 покрывает только безопасную деградацию («нечитаемый = отсутствующий»), а это значит: v2 **выбросит** уже существующую информацию о владении и никогда не подчистит устаревшие пакетные скиллы. Нужен явный v0-reader: строка без sha ⇒ имя из main-манифеста ⇒ «наше, хэш неизвестен» (эквивалент `stale-modified`/`adopted`). Либо новое имя файла. В §3.1 ни того, ни другого.
2. **`project-owned` не закрывает ветку удаления.** §3.2 говорит «реестр не переписывается никогда, `--force` на него не действует». Но строка 6 таблицы §3.1 (`нет в источнике | да в target | да в манифесте | sha совпал → deleted`) сработает на `knowledge.xml`, как только пакет перестанет его поставлять (или поставит под другим путём): seed при первом прогоне даст манифест-запись, а дальше правило «удалить своё неизменённое» уничтожит реестр. Формулировку надо расширить до «никогда не писать **и никогда не удалять**», и в таблице `project-owned` должен быть предикатом-короткозамыкателем, а не строкой.
3. **Таблица §3.1 — не функция от своего ключа.** Строки 3/4 и строка 5 (`project-owned`) имеют пересекающиеся ключи (`—` в колонке «в манифесте»), т.е. результат зависит от порядка проверок, который в тексте не зафиксирован. Для контракт-теста «таблица §3.1 целиком, все 8 строк» (SO-3) это фатально: тест нельзя написать однозначно. Нужно: сначала `project-owned`, потом четыре ветки по (в источнике × в target), внутри — по (в манифесте × sha).

Отдельно: `--prune-foreign` (opt-in) на дереве messenger/cloud-ios уничтожит именно те данные, ради которых всё это делается. Он обязан быть под тем же гейтом известных v1-хэшей, что и SO-12; в §3.1 это не сказано.

Что согласуется хорошо: dot-имя (все `readdir`-фильтры уже отбрасывают `.`-имена — `sync-core.ts:150,185`, `sync-skills-core.ts:36,84,168,337` — проверено), «нечитаемый = отсутствующий» (main так и делает), ключ по target-относительному пути (§3.3) — это действительно снимает вопрос «какой корень дал файл» при порте плагинов.

### Отвергнутый overlay-реестр: `parseRuleRegistry` бросает на дубль — подтверждено, но аргумент завышен

Бросок подтверждён прямым вызовом (`duplicate rule id "a"`). **Однако как аргумент против overlay-реестра это слабо:** `parseRuleRegistry` вызывается по одному файлу за раз, поэтому merge двух реестров с дедупом «проект побеждает» делается до вызова и никакого дубля не создаёт — это ~5 строк, а не архитектурная проблема. Настоящие возражения против `knowledge.local.xml` другие, и они в B3 не названы:

- `parseRuleRegistry` бросает и когда **любой** `<Rule>` без `<File>` — а именно так человек и напишет локальный оверлей; т.е. хрупкость на входе, а не на merge;
- `loadRuleRegistry` сейчас **replace**, не merge (`:81-91`), и его единственный вызов — `sdd-new.cmd.ts:478` с `process.cwd()`; вводя merge, вы вводите порядок приоритета в путь, который у ошибки даёт `exit 1` для всей команды создания тикета;
- у реестра **два** читателя (агент по `<File>`-ссылкам и `parseRuleRegistry`) и они разойдутся: агенту оверлей не нужен, тулу — нужен merge; расхождение придётся тестировать отдельно.

Вывод B3 («overlay для правил — да как соглашение; overlay для реестра — нет») **поддерживаю**, но обоснование надо заменить на три пункта выше. Заодно: «overlay для правил уже почти работает» — подтверждено эмпирически трижды (`local/` в моей фикстуре; `language/`, `perf-auditor/`, `sdd/` на messenger; `perf-auditor/`, `sdd/` на cloud-ios).

### Steelman: «портировать только два фикса main»

Минимальная альтернатива = SO-1 (`PROJECT_OWNED_ENTRIES` + `preserved`) + SO-2 (порт манифеста имён скиллов `62172906`). Что она реально даёт и не даёт — по моим прогонам, не по рассуждению:

**Даёт.** Реестр выживает на messenger и на cloud-ios (5 Swift-регистраций целы). Манифест даёт то же, что даёт MAIN на моей фикстуре и на MAIN-прогоне: `generate-codeowners/`, `write-uitests/`, `lang-lint/`, `run-e2e/`, `uikit-component-generate/`, `alt-opinion/` не удаляются, потому что `adoptPackageInstalled` (`sync-skills-core.ts:96`) при первом прогоне присваивает только то, что пакет отдаёт **сейчас**. Стоимость — два коммита, оба уже написаны и покрыты 16 тестами в main.

**Не даёт (проверено).**

1. cloud-ios всё равно теряет `coding/swift-rules.xml`, `coding/objc-rules.xml`, `infra/swiftlint-setup.xml`, `testing/xctest-rules.xml` — и получает **сохранённый реестр с 4 висячими `<File>`-ссылками**. Для агента это, вероятно, **хуже** потери реестра: каскад указывает на несуществующие файлы, и ничто этого не ловит (SO-11 не сделан). Messenger — то же с `logging-rules`. Значит SO-1 без SO-11 создаёт новый тихий отказ.
2. **SO-2 в формулировке B3 не закрывает S5-bis.** Задача описана как «применение вместо `:396-403`» — то есть манифест гейтит только orphan-проход целых скиллов. Внутрискилловое зеркало `:382-391` остаётся, и `sdd-execute/scripts/` (11 файлов на cloud-ios, 9 на messenger) продолжает исчезать молча. Проверено логикой кода и подтверждено тем, что мой RC-прогон удалил `local-helper.sh` в скилле, который **не** был orphan.
3. S4 не тронут: одна ошибка прав по-прежнему стоит 8 файлов.
4. S2 не тронут: клон/`npm link` по-прежнему `exit 1`.

**Вывод по steelman.** «Только два фикса» — не проходной релизный гейт. Но полноценная **минимальная** альтернатива SO-3 существует и состоит из **четырёх** S-размерных правок, а не из одной L:

- SO-1 (`preserved` для `knowledge.xml`),
- SO-2 (манифест имён скиллов),
- **SO-2b (новая): убрать или загейтить внутрискилловое зеркало `sync-skills-core.ts:382-391`** — минимально: удалять только файлы, чьё имя уже было в манифесте, иначе — не трогать,
- **SO-7 (пробросить `incomplete` из `collectRecursive`/`scanSkills` и запретить удаление в этом поддереве).**

С этими четырьмя оба реальных потребителя переживают первый v2-sync, не потеряв ничего, кроме устаревших **пакетных** файлов. Это стоит записать как **D-1 вариант 1′** — сейчас вариант 1 в §4.2 предлагает вместо этого выключить зеркало директив целиком, то есть выбросить единственное, что v2 сделал правильно.

### §3.3 / §3.4

§3.3 (три вещи, обязательные к возврату вместе с `plugins/`) — подтверждаю пофактно: без `extraSourceDirs`+`scanSourceRoots` плагин не отдаст ни `infra/golang-setup.xml`, ни `sdd-infra-golang/` (в моём MAIN-прогоне оба доехали именно так); без `files[]`-записей они не попадут в tarball; без `RULE_PLUGIN_DIRECTIVES` синканный текст будет ссылаться на `plugins/<id>/directives/…`, которого у потребителя нет. Замечание §3.3 «смена поставщика пути при неизменных байтах — это `unchanged`, а не `updated`» — корректно и, кстати, уже выполняется автоматически, потому что сравнение побайтовое (`compareBytes`, `sync-core.shared.ts:67-70`).

§3.4 — согласен полностью, включая вывод о `guides/v1-to-v2-migration.md` (мой `grep -ci 'sync|knowledge|skills'` = **0**, подтверждено). Добавлю два факта в пользу шага миграции: (а) `cli/cmd/sdd-migrate/` в RC **уже существует** (режимы `anchors` и `plan`, `sdd-migrate.cmd.ts:1-2`), так что «расширение» в SO-12 — правильный адрес, а `sync --migrate-v1` не нужен; (б) для потребителя, уже синканного main 0.9.x, ответ «какие v1-скиллы наши» **уже записан** в его `.claude/skills/.gennady-synced` — шаг миграции обязан прочитать его первым, а к известным хэшам падать только при отсутствии манифеста. В §3.4 манифест main не упомянут вообще.

---

## § Задачи

### SO-1..SO-14 — вменяемость

Список адресный, файлы и строки в нём проверены (см. § Цитаты). Возражения:

| Задача | Возражение |
|---|---|
| **SO-2** | Формулировка «применение вместо `:396-403`» **не закрывает S5-bis**. Нужна отдельная S-задача **SO-2b** на `sync-skills-core.ts:382-391` (сейчас это поведение прикрыто только L-задачей SO-3 и косметической SO-4). Плюс в «Файлы» надо добавить правку `specs/cli/sync-skills/sync-skills.spec.md:229` — эта строка отрицает существование смешанных статусов, которые код создаёт |
| **SO-7** | Размер M завышен для `sync` (проброс одного флага из `collectRecursive`), а разрушительность максимальна из всех: 8 удалённых живых файлов от одного `chmod`. **Должна быть в блокерах релиза** — сейчас её там нет |
| **SO-8** | Не блокер по B3, а по факту это `exit 1` для любого потребителя без `node_modules/gennady` (клон, `npm link`, монорепо с hoisting). Либо в блокеры, либо явно записать «релиз только как published install» |
| **SO-5** | Недоскоупирована. Golden в определении main (`deployedSurface()` = sync-поверхность) не поймает 5 утечек в `ai/flow-eval/**`, уезжающих в tarball через `files: ["ai/**/*"]`. Нужно либо второе golden на `npm pack --dry-run --json` (1190 файлов), либо сузить `files` (это стык с треком B5) |
| **SO-10** | `<SkipWhen>` для `typescript-rules` — не новая работа: в main он уже есть (`ai/directives/knowledge.xml:80`, `<SkipWhen>Config-only task; non-TypeScript language (see python-rules / go-rules); infra-setup without code files</SkipWhen>`). Формулировать как порт |
| **SO-11** | Согласен и подчёркиваю приоритет: без неё SO-1 в одиночку **создаёт** новый тихий отказ (реестр цел, 4 файла удалены — cloud-ios). SO-11 должна идти в одной волне с SO-1, а не во второй |
| **SO-12** | Адрес верный (`cli/cmd/sdd-migrate/` существует), но алгоритм неполон: сначала читать `.claude/skills/.gennady-synced` уже-синканного main-потребителя, и только при его отсутствии сверять известные хэши v1-релизов. Иначе шаг миграции переизобретает данные, которые у потребителя уже есть |
| **SO-14** | Проблема шире «трёх имён»: `sync-skills` **тайно** выполняет `sync` (это уже D-4), а SO-12 добавит четвёртый глагол. Формулировать как «`gennady sync` / `sync-skills` / `sdd-sync` / `sdd-migrate` — четыре разные операции, три из которых называются `*sync*`»; help должен явно писать, что `sync-skills` трогает `ai/directives/` |
| порядок | «SO-3 заменяет SO-1/SO-2 надстройкой» — SO-1 надстройкой не заменяется: §3.2 сам требует, чтобы `project-owned` остался **сильнее** манифеста. Формулировку «заменяет» снять |

Пропущенного из брифа не нашёл: миграция V1→V2 дерева (`ai/directives/sdd/` + v1-скиллы) есть в SO-12 и D-2, наименование `sdd-sync` — в SO-14 и §2.2. Внутри них — пробелы, перечисленные выше.

Блокеры релиза: подтверждаю шесть B3 (SO-1, SO-2, SO-3, SO-4, SO-9, SO-12) и **добавляю SO-2b, SO-7, SO-11**; SO-8 — по решению оператора (см. выше).

### 4 решения оператора

- **D-1.** Рекомендация (2) обоснована. Но нужен **вариант 1′** = SO-1+SO-2+SO-2b+SO-7 (четыре S/M вместо одной L) — он, по моим прогонам, полностью спасает и messenger, и cloud-ios и может уйти в релиз без хэш-манифеста. Вариант 1 в текущей формулировке (выключить зеркало директив) хуже 1′ и хуже (2).
- **D-2.** Рекомендация (3) правильная. Добавить в неё чтение существующего main-манифеста (выше). Вариант (4) (жёсткий гейт) стоит оценить выше, чем «ломает поставил-синкнул»: сейчас первый v2-sync на cloud-ios теряет 4 из 5 правил и 25 файлов скиллов — отказ синкать до миграции дешевле.
- **D-3.** Рекомендация (3) правильная. Формулировку варианта (2) («Продолжаем удалять проектные rule-файлы — на messenger'е это `coding/logging-rules.xml`») усилить: на cloud-ios это 4 файла, и вместе с реестром.
- **D-4.** Рекомендация (3) правильная и, по-моему, недооценена: это S-задача, которая одна снимает самый неожиданный из подтверждённых сценариев потери (узкая команда → широкое разрушение). Стоит поднять её в первую волну вместе с SO-1/SO-2.

### G2 — реалистичность списка фикстур

Восемь фикстур покрывают правильные оси. Возражения:

1. **`v1-consumer` надо разделить на две.** messenger-образная (TS-стек, `sdd/` с проектными файлами, `sdd-execute/scripts/` 9 файлов) и cloud-ios-образная (Swift-реестр из 5 правил, **проектные rule-файлы в пакетных подкаталогах**, `scripts/` 11 файлов, `generate-codeowners/references/`). Это разные режимы отказа; одна фикстура их не поймает. Обе я уже материализовал — можно взять как обезличенную выжимку.
2. **«целиком детерминированный» — завышено.** `cli/__tests__/e2e/setup.ts` делает реальный `npm pack` + `npm install` в temp-проект. Без offline-кеша это зависимость от реестра, т.е. флейк-риск, а не детерминизм. Либо `--offline`/prefetch, либо признать G2 частично внешней.
3. **`assert.deepEqual(treeAfter, expectedTreeAfter)` по `<path>\t<sha256>` — неподъёмная поддержка.** Любое изменение содержимого любой из 104 директив ломает все восемь фикстур. Практичнее: сравнивать **дельту** (множества `created`/`deleted`/`modified` относительно снимка «до») и sha — только для файлов, авторённых самой фикстурой. Это ровно то, чем я мерил (`VB3-snap.sh` + `diff`), и оно устойчиво.
4. **Нет фикстуры на S4.** Самый разрушительный дефект в списке не покрыт. `chmod 000` в e2e ненадёжен (под root не сработает), поэтому это должен быть unit с мокнутым `readdirSync` — B3 упоминает его в §3.5/SO-7, но в G2-корпус не включает. Включить как обязательный гейт.
5. **`surface` (#8) должна покрывать tarball, а не только sync-поверхность** — иначе 5 утечек в `ai/flow-eval/**` пройдут зелёными (см. § Новые дефекты п.4).
6. **Не хватает фикстуры «manifest v0»**: потребитель, синканный main 0.9.x, с name-list `.claude/skills/.gennady-synced` → первый v2-прогон обязан распознать формат и не потерять владение (см. § Дизайн, дырка 1).
7. `project-skills` (#5) сформулирована верно, но её ассерт нужно усилить до «вывод содержит все затронутые пути **и ни один незатронутый**» — иначе ветка `deleted` форматтера (которая печатает уцелевший `SKILL.md` как удалённый) пройдёт тест.

---

## § Правки к B3

Минимальный список редактур, по убыванию важности.

1. **§1.12 / итог (стр. 208): исправить арифметику** → «НЕ ЗАКРЫТО 7 · ЧАСТИЧНО 3 · НЕПРИМЕНИМО 3 (13 строк)»; S3 не считать дважды.
2. **S2: сменить вердикт ЧАСТИЧНО → НЕ ЗАКРЫТО**, добавить репро: RC `exit 1` / MAIN `exit 0` на потребителе без `node_modules/gennady`.
3. **S5-bis: переписать абзац про форматтер.** Убрать «при `added` — тоже только свои (`:88-94`)» (REFUTED), добавить три ветки с наблюдаемым выводом (таблица «Три ветки форматтера» выше), добавить противоречие `specs/cli/sync-skills/sync-skills.spec.md:229` ↔ `sync-skills-core.ts:382-391`, добавить «счётчик `deleted` считает записи, не файлы (22 против 25 на cloud-ios)».
4. **S4: заменить рассуждение на измерение** — `chmod 000` на один подкаталог источника: RC 8 удалённых живых файлов / `exit 0` / без warning, MAIN 0 удалений; скилловая половина 1→0 против 12 целых.
5. **§0: снять неверную методическую заметку.** MAIN CLI в этом worktree запускается (`node_modules` заполнен, `node_modules/.bin/tsx` есть); заменить на «MAIN CLI прогнан напрямую, сводки совпали с драйвером».
6. **§1.11-bis: добавить cloud-ios** (6 удалённых rule-файлов, 4 из 5 регистраций, 25 файлов скиллов, 11 из них молча) — это лучший аргумент главы 4 и готовая G2-фикстура.
7. **§1.10: добавить строку `ai/directives/project-notes.md`** (проектный файл в **корне**, `- deleted` при нефильтрованном прогоне) и строку про пропатченный `sdd-v2/*.xml`.
8. **S7: расширить** до tarball-поверхности (5 утечек в `ai/flow-eval/**`, `npm pack --dry-run` = 1190 файлов) и поправить арифметику «118 → 117 (104+13)».
9. **S1/R5: поправить механизм** — `sdd-new` **печатает** кортежи (`renderTaskAuthoringLiterals` → stdout), не вставляет их в файл тикета; зато нечитаемый реестр даёт `ERR_CLI_SDD_NEW_RULE_REGISTRY_INVALID`, `exit 1`. Добавить, что `parseRuleRegistry` бросает и на `<Rule>` без `<File>`.
10. **§3.1: три правки** — (а) v0-reader для main-формата `.gennady-synced` (или другое имя файла); (б) `project-owned` короткозамыкает **и** ветку удаления; (в) переписать таблицу как упорядоченный набор проверок, иначе контракт-тест SO-3 неоднозначен. Плюс: `--prune-foreign` под тем же гейтом v1-хэшей, что SO-12.
11. **§2.3 / §4.2 D-1: заменить обоснование отказа от overlay-реестра** (дубль id обходится дедупом до вызова) на три реальных возражения; добавить **D-1 вариант 1′** = SO-1+SO-2+SO-2b+SO-7.
12. **§4.1: добавить SO-2b** (гейт внутрискиллового зеркала, S) и **перенести SO-7, SO-11 в блокеры**; снять формулировку «SO-3 заменяет SO-1/SO-2»; в SO-10 пометить `SkipWhen` как порт (`MAIN/ai/directives/knowledge.xml:80`).
13. **§3.6 / G2: семь правок** — разделить `v1-consumer` на messenger- и cloud-ios-образные; снять «целиком детерминированный» (реальный `npm pack`+`install`); заменить полный `deepEqual` дерева на дельту; включить S4-unit в корпус; расширить `surface` до tarball; добавить фикстуру «manifest v0»; усилить ассерт `project-skills` до «и ни один незатронутый путь».
14. **§1.11: цифры** — «≈95 файлов `sdd-v2/`» → **73**; уточнить, что «18 `~ would update`» — это без `knowledge.xml` (всего 19 `~`).
15. **Мелкие WRONG-LINE** (без смысловых последствий, но раз идентификаторы verbatim): `sync-skills-core.ts:21` → `:22`; `sync-skills.cmd.ts:82-86` → `:84-88`; `task-authoring-literals.ts:60-73` → `:59-74`, `:69` → `:70`; `ax-rule-activation-plan.xml:3` → `:4`; `path-normalizer.ts:34-96` для RC → `:34-95` (файл 95 строк); `updateTrackerStatus` определён в `shared/sdd/tracker.ts:67`, а не в `sdd-sync.cmd.ts`.
