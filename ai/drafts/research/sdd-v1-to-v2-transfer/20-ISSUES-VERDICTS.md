# 20 — Issues akkrat (#9…#24): вердикты v1 / v2, что требуется, черновики ответов

> Статус: ВЕРИФИЦИРОВАНО и ПРИНЯТО оператором (все 17 вердиктов; каждый не-закрытый → задача; #9.4/#24 — блокеры релиза).

**Политика черновиков.** Все блоки «Черновик ответа akkrat» — **DRAFT**. В GitHub не отправляется ничего без явного OK оператора.

**Что это за документ.** Чистовая версия аудита A4 (issues akkrat против SDD v1 и SDD v2) после независимой перепроверки V-A4. Все обязательные правки верификатора применены в тексте; сырой двухчастный исходник (A4 + отчёт V-A4) сохранён без изменений в [`_raw/20-ISSUES-VERDICTS.raw.md`](_raw/20-ISSUES-VERDICTS.raw.md). Где Часть I и Часть II расходились — **побеждает Часть II**.

**Сводка вердиктов по v2:** ЗАКРЫТО В V2 (по построению) 4 (#9.5, #11, #16, #9.3) · ЧАСТИЧНО 5 (#9.1, #13, #15, #21, #22) · НЕ ЗАКРЫТО 8 (#9.2, #9.4, #9-bonus, #17, #19, #20, #23, #24). Итого 17. Замки-тесты ставятся на 3 (#9.5, #11, #16); #9.3 замка не получает — запирать нечего (см. «Правка таксономии» в §#9.3). Открытых позиций — 13, каждая становится задачей плана `ISS-1…ISS-13`. **Блокеры релиза v2: #9.4 и #24** (прямые регрессы относительно main).

**Корни (см. § Перекрёстные связи):** (1) ни один фикс main по issues не в v2 (merge-base `46c6d616`) — прямые регрессы #9.4, #24, механика #12/#13; (2) v2 «пропитан Node» сильнее v1 — #9.2, #9-bonus, #17, #20; (3) журнал: v2 беднее по Execution Log — #13, #15, #23; (4) провенанс/контекст между агентами — #21, #22; (5) sync без ownership — #9.4, #24, #11; (6) висячие ссылки на аксиомы в сборке директив (`ax-permitted-bash-commands`, `ax-stale-after-pivot-verification`) — #19, #13.

---

## Источники и метод

Read-only аудит + независимая перепроверка. Источники: `gh issue view`, `gh pr view`, `git log/grep` по двум чекаутам, плюс три исполненные репродукции на RC.

- **v1 (main)**: `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`, HEAD `8bb38477`
- **v2 (RC)**: `codex/sdd-v2-rc52-followup` @ `11291af5` (чекаут `scratchpad/rc-v6`)

Легенда вердиктов v2: **ЗАКРЫТО В V2 (по построению)** / **ЧАСТИЧНО** / **НЕ ЗАКРЫТО**. Ярлык «НЕПРИМЕНИМО» из легенды снят как отдельный вердикт — см. «Правка таксономии» в §#9.3.

Eval-группы: **G1** non-Node stack execute+verify · **G2** sync/ownership · **G3** execution-log/conventions integrity execute→audit→critic · **G4** V1→V2 миграция на реальном снапшоте.

Контекст: все issue — от akkrat, полный цикл SDD v1 на Swift/iOS-проекте cloud-ios, `gennady@0.8.4-next.10`, `stack.use: [anystack]` + 3 extraGates (swiftlint / xcodebuild / xctest). Слитые PR akkrat: #10 (portability), #12 (log integrity); PR RubaXa: #8 (critic convergence), #14 (adaptive execution), #18 (rule surfaces). PR #7 (yaml-verify, draft) закрыт без merge; PR #5 — stack plugin system + `gennady verify`.

---

## 0. Структурный факт, определяющий все вердикты по v2

`git merge-base <v2 HEAD 11291af5> <main 8bb38477>` = **46c6d616** (подтверждено независимо). Ни один из коммитов main, закрывших issues akkrat, не является предком v2:
`62172906` (#10), `4a47b9e8` (#12), `90b123e9` (#14), `d6065c36` (#8), `2a0282da` (`verify --wip`), `f74c8c1d` (knowledge.xml project-owned) — все существуют в main и лежат **после** merge-base (`git log --oneline 46c6d616..HEAD`), т.е. в v2 их нет.

Следствие: всё, что v1 закрыл после `46c6d616`, в v2 либо переизобретено независимо, либо отсутствует. Кроме того, в v2 **нет** `services/stack/`, `cli/cmd/verify/`, `gennady.yaml`/`anystack`/`extraGates` — каталоги в RC не существуют (`ls` → No such file or directory), упоминаний в `.ts` — 0; это же зафиксировано самим v2 в `ai/flow-eval/docs/roundtrip-wall3-assessment.md:17-30`. Вместо `gennady verify` — `cli/cmd/sdd-verify`, который исполняет **npm-скрипты** из `package.json` (`shared/sdd/readiness.ts:15-24` `REQUIRED_SCRIPTS`, `sdd-verify.cmd.ts:31-36,226`) плюс §5-строки тикета verbatim (`sdd-verify/phase-run.ts:341`).

Соответствия v1 ↔ v2, использованные ниже:

- `check.sh`/`scan.sh`/`_sdd-lib.sh` ↔ `cli/cmd/sdd-check/sdd-check.cmd.ts` + `shared/sdd/check.ts`, `task-id.ts`, `ticket.ts`
- `verify.sh` + `gennady verify` ↔ `cli/cmd/sdd-verify/*` + `shared/sdd/phase-verification-plan.ts`, `readiness.ts`
- `critic.directive.xml`/`critic-protocol.xml` ↔ `ai/directives/sdd-v2/critic.directive.xml`, `critic-protocol.directive.xml` (из `ai/kit/templates/sdd-v2/*.hbs`)
- Execution Log ↔ `cli/cmd/sdd-log/*` + `shared/sdd/check.ts` (SDD_EXECUTION_LOG_*), `formats/task-ticket-structure.xml`
- `HANDOFF_FORMAT` ↔ `phase-execution-protocol/steps/STEP_4_HANDOFF.xml` + `sdd-log.types.ts:248-249` (регэксп `complete`)
- `AX_PERMITTED_BASH_COMMANDS` ↔ `ai/kit/axiom/process/ax-permitted-bash-commands.xml`
- `sync`/`sync-skills` ↔ `cli/cmd/sync/sync-core.ts`, `cli/cmd/sync-skills/sync-skills-core.ts`, `shared/common/sync/path-normalizer.ts`

---

## #9 — SDD tooling: 5 issues from running the full loop on a Swift project (OPEN)

### #9.1 — `sdd scan`/`sdd check` не видят path-based Task-ID → ложный «зелёный»

**Проблема.** `scaffold.directive.xml` предписывает `TSK-{PREFIX}-{NNN}`, а `scan.sh`/`check.sh`/`_sdd-lib.sh` знают только `TSK-[0-9]+` и глоб `*.task-*.md`. На корректно заскаффолженном scope `tasks_total=0`, `findings=0` — читается как «чисто». Предложение: принимать обе формы ID и оба имени файла; пустой scope не должен быть «зелёным».

**Статус в v1 (main).** Исправлено двумя PR.

- `90b123e9` (#14) — Meta-based discovery по `*.md` и грамматика `TSK-([A-Z][A-Z0-9]*-)?[0-9]+`.
- `62172906` (#10) — строгая грамматика `SDD_TASK_ID_RE='TSK-([A-Z]+-[0-9]{3}|[0-9]+)'` (`ai/skills/sdd-execute/scripts/_sdd-lib.sh:40`; на `:36-39` — комментарий), `:51` `SDD_TASK_ID_BOUNDARY`, `:54-55` `sdd_lib_task_id_valid`, `:84` `sdd_lib_task_id_from_path`; `NO_TICKETS_FOUND` exit 2 (`check.sh:193`) и `TICKET_ID_UNREADABLE` (`check.sh:213`), документированные exit-коды `check.sh:49-50`; whole-token парсинг `@tasks`/tracker (`check.sh:298` `unparseable-ref`, `scan.sh:287,298` через `$SDD_TASK_ID_RE$SDD_TASK_ID_BOUNDARY`).
- Тесты `scripts/__tests__/sdd-task-id.test.ts`: `:93` (discovery `<name>.{PREFIX}-{NNN}.md`), `:144` и `:291` («no tickets → not clean»), `:182` (malformed), `:192` (absent), `:203` (unreadable Meta), `:217`/`:233`/`:250`/`:267` (семейство `TSK-IB-0012`).

**Статус в v2 (RC).** Другая грамматика: `<ACR>-<slug>` — `shared/sdd/task-id.ts:16` `^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$`, `:19` `SLUG_MAX_LEN = 8`. Обнаружение тикетов по содержимому Meta, не по имени файла: `shared/sdd/ticket.ts:128` `metaBody.match(/\*\*Task-ID:\*\*\s*`?([A-Za-z0-9][\w-]*)`?/)` — принимает и `TSK-IB-001` (подтверждено). `SDD_TASK_ID_GRAMMAR` — `shared/sdd/check.ts:888-901`, гейт v1/v2 в `sdd-check.cmd.ts:957` (`:957` — `@invariant` того же гейта; `:1373` — вызов `checkSpecLanguage`, а не грамматики). Legacy-тикеты видны как `SDD_LEGACY_TICKET_UNANCHORED` warn (`check.ts:1324-1330`; тесты `check-legacy-ticket.test.ts:74-89`). Миграция: `migration-plan.ts:261-262` (discovery by content, явно упомянут `<scope>.IB-NN.md`), `id-replace.ts:176` (word-boundary). Тесты `task-id.test.ts`, `check-taskid-grammar.test.ts` — зелёные.

**Дыра сохраняется:** `sdd-check --all` при нуле тикетов молча возвращает 0 findings / exit 0 — обход `mdFiles` в `sdd-check.cmd.ts:1275-1295`, `ticketRefs` (`:1285`) никогда не проверяется на пустоту. Аналога `NO_TICKETS_FOUND` в коде нет: `grep -rn 'NO_TICKETS|checked nothing|NO_SPECS'` по `cli/ shared/ ai/` → единственное вхождение `ai/flow-sim/scenarios/S6-scaffold-ticket.md:244` (`H_NO_SPECS`, сценарий симуляции), в коде — ноль.

- **Дополнительно (V-A4): дрейф help-текста.** `cli/cmd/sdd-migrate/help.ts:14` всё ещё рекламирует легаси-глоб: «`sdd-migrate anchors --all [root]` # every `tasks/**/*.task-*.md`», тогда как реализация ищет по содержимому Meta (`sdd-migrate.cmd.ts:28-52`, комментарий прямо про `<scope>.IB-NN.md`). Это дрейф текста, не дыра — но именно этот текст akkrat прочитает первым при миграции cloud-ios.

**Доказательство исполнением (repro, RC).**

```
$ mkdir -p <scratch>/V-fix/empty/specs
$ node --import tsx <rc>/cli/gennady.ts sdd-check --all <scratch>/V-fix/empty
[sdd-check] ✅ clean — 0 file(s) checked
EXIT=0
```

Дыра воспроизведена буквально: пустой проект → «clean», exit 0.

**Вердикт: ЧАСТИЧНО.**

**Что требуется в v2.** В `sdd-check.cmd.ts` после обхода: `ticketRefs.length === 0 && (all || changed)` → finding `SDD_NO_TICKETS_FOUND` severity error, exit 2 (и аналог для `specs/` без спек). Тест в `shared/sdd/__tests__/check.test.ts`: пустой `specs/` → exit ≠ 0. Отдельно — привести help-текст `sdd-migrate/help.ts:14` в соответствие с content-based реализацией. Eval: **G4** (снапшот cloud-ios с `TSK-IB-001`), **G3**. Effort S.

**Черновик ответа akkrat (DRAFT, не отправляется).**
> Спасибо, это закрыто в main двумя PR: #14 (Meta-based discovery, обе формы ID) и вашим #10 (строгая грамматика, `NO_TICKETS_FOUND`, `TICKET_ID_UNREADABLE`, whole-token парсинг). В v2-ветке грамматика меняется на `<ACR>-<slug>`, тикеты ищутся по Meta, а не по имени файла; `TSK-IB-001` читается как legacy и мигрируется через `sdd-migrate ids`. Две вещи мы у себя нашли благодаря вашему кейсу и поправим в v2: `sdd-check --all` над пустым scope пока не даёт `NO_TICKETS_FOUND`-аналога (воспроизвели: «clean», exit 0), и help `sdd-migrate` всё ещё обещает глоб `tasks/**/*.task-*.md`, хотя реализация давно по Meta.

---

### #9.2 — Orphan-скан `@tasks` смотрит только TS-семейство

**Проблема.** `check.sh` grep с `--include='*.ts' *.js *.sh *.go` — на Swift/ObjC проверка структурно молчит и выглядит как PASS. Предложение: добавить расширения или сделать список конфигурируемым.

**Статус в v1 (main).** Исправлено в `62172906` (#10): `ai/skills/sdd-execute/scripts/check.sh:283-286` — четыре строки `--include`, добавлены `.swift .m .mm .h .kt .java .py .rb .rs .cs .php`. Локирующего теста именно на список расширений нет (`grep -rn swift <main>/scripts/__tests__/` → 0; `sdd-task-id.test.ts:280` покрывает только логику orphan).

**Статус в v2 (RC).** Понятия orphan-`@tasks` нет; ближайшие механизмы структурно слепы на Swift — тот же класс ошибки:

- consumers-grep: `SDD_CONSUMERS_UNRESOLVED`, `sdd-check.cmd.ts:699-701` — ровно `*.ts`, `*.tsx`, `*.js`;
- индекс тест-файлов для BDD_COVERAGE: `sdd-check.cmd.ts:503` — `/\.(test|spec)\.(ts|tsx|js)$/`;
- **третий сканер с зашитым списком языков (пропущено в A4): `gennady yagni`** — `cli/cmd/yagni/help.ts:30-33`: tree-sitter (exact) для `.ts/.tsx`, grep (approximate) для `mts/cts/js/jsx/mjs/cjs/py/go/rb/java`. Swift/ObjC/Kotlin/Rust/C# — нет. При этом `yagni` входит в ladder `profile='full'` (`shared/sdd/phase-verification-plan.ts:47`), т.е. в аудитный прогон. Для «единого списка расширений» это третий потребитель;
- **BDD_COVERAGE на Swift не «молчит», а становится неудовлетворимым (пропущено в A4) — два разных режима отказа, и второй хуже.** `sdd-check.cmd.ts:547` `if (matches.length === 0 && !isDone) continue;` — до `DONE` Swift-тикет с `FooTests.swift` **молча пропускается** (ложный зелёный); на `DONE` он попадает в `checkableEntries` с пустым `caseNamesByFile` → `SDD_BDD_SCENARIO_UNTESTED`, которое **невозможно удовлетворить**, пока индекс не знает `.swift`. То есть Swift-тикет структурно не может дойти до закрытия. Это усиливает вердикт, а не опровергает его.

**Вердикт: НЕ ЗАКРЫТО** (с усилением).

**Что требуется в v2.** Единый список исходных расширений в одном месте (`shared/sdd/source-extensions.ts`), расширяемый проектом (секция в `gennady.yaml` или в `specs/3-tasks.md` conventions); использовать в consumers-grep, в `getTestFileIndex` **и в `yagni`** — три потребителя. Тест: fixture с `Foo.swift` + `FooTests.swift` → consumer резолвится, BDD-имена находятся, `DONE`-тикет закрывается. Eval: **G1**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> В main расширения добавлены вашим #10 (`check.sh:283-286`). В v2 `@tasks`-orphan как отдельной проверки нет, но родственные проверки сканируют только `*.ts/*.tsx/*.js`: `@consumers`, индекс тест-файлов для BDD-покрытия и `gennady yagni` (там свой зашитый список языков, и он входит в аудитный ladder). Хуже того, на Swift это не только «молчит»: до `DONE` запись пропускается, а на `DONE` вылезает `SDD_BDD_SCENARIO_UNTESTED`, которое нечем удовлетворить — тикет структурно не закрывается. Планируем один конфигурируемый список расширений на все три сканера; ваш кейс со `.swift/.m/.mm/.h` берём как фикстуру.

---

### #9.3 — `ai/directives/language/` упоминается, но не поставляется

**Проблема.** `AX_LANG_PASS_ON_WRITE` требует прочитать `ai/directives/language/*`, которых нет в пакете; «never skipped» → первый же spec write стопорится; локальный патч затирается sync.

**Статус в v1 (main).** Исправлено в `62172906` (#10): аксиом `AX_LANG_PASS_ON_WRITE` — `discovery.directive.xml:320-333`, абзац «`ai/directives/language/` is optional … as it is in the published package today … calibrated by `AX_OPERATOR_DIALOGUE_STYLE`» на `:328-332`; тот же абзац — `module-decomposition.directive.xml:327-337`, строка `:333`. Каталога в main по-прежнему нет. Локирующего теста нет.

**Статус в v2 (RC).** Ни `ai/directives/language/`, ни `AX_LANG_PASS_ON_WRITE`, ни `lang-lint` в `ai/ shared/ cli/` (grep = 0). Замена — `checkSpecLanguage`: `shared/sdd/check.ts:1720`, вызывается из `sdd-check.cmd.ts:1193` (`--spec --authoring`), `:1328` и `:1373` (только для `specFlow === 'v2'`); тест `shared/sdd/__tests__/check-language.test.ts` существует.

- **Оговорка (V-A4).** Это **не перенос** lang-lint pass: `checkSpecLanguage` выдаёт `SDD_LANGUAGE_CALQUE` — warn-уровня детектор русских калек/канцелярита (`check.ts:1622,1687,1702`), без калибровки, и он неявно предполагает, что спека написана по-русски. Дефект issue (висячая ссылка блокирует первый spec write) исчез по построению; исходная потребность закрыта другим, более узким предметом.

**Правка таксономии (обязательная правка V-A4 №14).** #11 и #9.3 — один класс: «v1-концепт исчез по построению», но в A4 они были помечены по-разному (ЗАКРЫТО В V2 vs НЕПРИМЕНИМО), и легенда применялась непоследовательно. Выбран **один ярлык на класс — «ЗАКРЫТО В V2 (по построению)»**; «НЕПРИМЕНИМО» удалён из легенды как отдельный вердикт и остаётся только уточнением в скобках. Следствия, зафиксированные оператором: вердикт по существу не меняется (V-A4: «содержательно спора нет»), счёт становится ЗАКРЫТО 4, но **замки-тесты ставятся только на 3** (#9.5, #11, #16) — у #9.3 в v2 нет предмета, который можно запереть тестом (нет аксиома, нет каталога, нет ссылки), поэтому вместо замка за ним закреплена проверка миграции в G4.

**Вердикт: ЗАКРЫТО В V2 (по построению; предмета для замка нет).**

**Что требуется в v2.** По существу — ничего. При миграции v1→v2 (`migration-v1-v2.directive.xml`) убедиться, что локальный патч проекта в `discovery.directive.xml` не переносится. Eval: **G4** (мигрированный проект не тащит ссылку). Effort —.

**Черновик ответа akkrat (DRAFT).**
> В main ссылка стала optional (#10). В v2 этого аксиома нет вообще — не «проверку перенесли», а аксиом удалён: вместо внешнего чтения в `sdd-check` есть узкий механический warn-детектор калек (`SDD_LANGUAGE_CALQUE`). Стопориться нечему, но и полноценного lang-lint pass с калибровкой там нет — это честнее назвать так.

---

### #9.4 — `sync-skills` удаляет проектные скиллы

**Проблема.** `gennady sync-skills` удалил `generate-codeowners/` и `write-uitests/` — не пакетные скиллы — без подтверждения. Предложение: удалять только то, что пакет сам установил (манифест) или `--prune` opt-in.

**Статус в v1 (main).** Исправлено в `62172906` (#10): манифест `cli/cmd/sync-skills/sync-skills-core.ts:32` `const MANIFEST_NAME = '.gennady-synced'` (чтение `:44`, запись `:77`), удаляются только записанные в манифест. Тесты `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts:377` («leaves a project-authored skill alone — it is not in the manifest»), `:391` («prunes nothing on the first run and writes a manifest»), блок манифеста `:538-627` (последний тест блока — `:627` «lifecycle — install, filtered sync, package removal, retry after a failed prune»).

**Статус в v2 (RC).** Фикс не портирован: `grep -rn 'gennady-synced' --include='*.ts'` по RC → **0**. `sync-skills-core.ts:396-404` — `orphansToDelete = targetSkillNames` (всё, чего нет в source), затем `deleteOrphan(...)`; `deleteOrphan` объявлен на `:192`. Тест фиксирует текущее поведение: `__tests__/sync-skills-core.test.ts:244` («detects orphan skills (deleted from source but present in target)»); теста «project-authored» нет. Проектные скиллы cloud-ios будут удалены снова.

**Вердикт: НЕ ЗАКРЫТО** (регресс относительно main). **БЛОКЕР РЕЛИЗА v2.**

**Что требуется в v2.** Портировать коммиты манифеста из #10 (`fix(sync-skills): prune only the skills a previous sync installed` + `keep manifest ownership…`) в `cli/cmd/sync-skills/sync-skills-core.ts`; перенести тесты `:377`, `:391`, `:538-627`. Eval: **G2**. Effort S (cherry-pick с конфликтами в типах).

**Черновик ответа akkrat (DRAFT).**
> В main это ваш #10 — манифест `.claude/skills/.gennady-synced`, удаляется только своё. В v2-ветке фикс ещё не портирован (ветка отошла от main раньше #10), там `sync-skills` до сих пор считает orphan-ом любой каталог target, которого нет в пакете, и удаляет его. Переносим манифест и ваши тесты в v2 — это у нас блокер релиза v2, не «когда-нибудь».

---

### #9.5 — Захардкоженные `model:` в dispatch-промптах

**Проблема.** `model: "sonnet"`/`"haiku"` в `sdd-execute`, `sdd-execute-batch`, `critic.directive.xml`; проект, желающий наследовать модель, вычищает их после каждого sync. Предложение: убрать пин или вынести в конфиг.

**Статус в v1 (main).** Исправлено в `90b123e9` (#14): `grep -rn 'model: *"(sonnet|haiku|opus)"' <main>/ai` → **0**; `ai/skills/sdd-execute/SKILL.md:79` и `:134` — «inherit the caller's configured model». Контрактный тест `scripts/__tests__/sdd-review-lifecycle-contract.test.ts:187` (`it(...)`), ассерция `assert.doesNotMatch(content, /model: "(?:haiku|sonnet|opus)"/)` — `:200`.

- **Усиление (V-A4).** Тест не только запрещает пин: он дополнительно требует `assert.match(content, /inherit\s+the\s+caller's configured model/)` для трёх файлов, **включая `critic.directive.xml`** (`:112-113`). Т.е. в main критик не просто «без пина», а с явным предписанием наследования.

**Статус в v2 (RC).** `grep -rn 'model:' ai/skills ai/directives ai/kit/templates` → **0**; dispatch в `execute.directive.xml:217-237` модель не задаёт. Локирующего теста в v2 нет.

**Вердикт: ЗАКРЫТО В V2** (без замка).

**Что требуется в v2 (замок).** Перенести assertion из `sdd-review-lifecycle-contract.test.ts:200` (вместе с положительной проверкой «inherit the caller's configured model») в `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` или новый contract-тест по `ai/skills/**` и rendered directives. Eval: **G3**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> Закрыто в main (#14): модель наследуется от вызывающего агента. Причём в `critic.directive.xml` там теперь не просто «нет пина», а явное «inherit the caller's configured model», и контрактный тест требует именно эту формулировку в трёх файлах. В v2 пинов нет ни в скиллах, ни в директивах; добавим такой же замок, чтобы строка не вернулась.

---

### #9 (bonus) — `extraGates[].when`: anystack-гейты не умеют объявлять файловую область

**Проблема.** Фаза, правящая только `CODEOWNERS`, тянет `xcodebuild` и весь тест-сьют, потому что `verify <files>` не знает, какие гейты файлы вообще могут задеть. Предложение: опциональный `when: [<glob>…]` на гейт; `verify <files>` сам вычисляет `--only`.

**Статус в v1 (main).** Не исправлено: закрытый список ключей CmdSpec — `services/stack/stack-config.ts:33-45` (`GATE_SPEC_KEYS = ['id','argv','cwd','env','timeout','outputMeansFailure','driftMeansFailure','envFail','requires','fixer']`), без `when`/`paths`; `--only` — точное равенство, `cli/cmd/verify/verify.cmd.ts:69-71` `selectorMatches(...) { return selector.includes(':') ? selector === \`${gate.stack}:${gate.id}\` : selector === gate.id; }`.

**Статус в v2 (RC).** Стек-системы нет вовсе (см. §0): нет `gennady.yaml`, `anystack`, `extraGates`; `sdd-verify` знает только npm-скрипты и §5-строки тикета. Для Swift-проекта это не «гейты не сужаются», а «гейтов нет»: `shared/sdd/readiness.ts:15-24` требует 8 npm-скриптов.

- **Правка формулировки (обязательная правка V-A4 №3).** Утверждение «`phase-context.ts:262` блокирует **все** не-`setup` фазы при `!executionReady`» — переоценка. Реально `cli/cmd/sdd-verify/phase-context.ts:262`: `if (!readiness.executionReady && profile !== 'setup')`, далее — **выход через GATE_QUEUE-исключение** (`:282-285`): если фаза структурно владеет отсутствующим readiness-гейтом, `profile = 'setup'; profileBasis = 'infra-queue-exemption'` (см. `shared/sdd/gate-queue.ts`); иначе `failure(...)`. Т.е. блокируются все не-`setup` фазы, **кроме** тех, что сами создают недостающий гейт. Ровно это написано в собственном документе RC: `ai/flow-eval/docs/roundtrip-wall3-assessment.md:26-27` («Only bootstrap/config/doc phases, or a phase owning a missing gate, are exempt»). Вывод «гейта нет» остаётся верным; механизм в A4 был описан слишком сильно.

**Вердикт: НЕ ЗАКРЫТО** (потребность стала острее).

**Что требуется в v2.** Стек-независимый план гейтов: либо порт `plugins/{node,golang,anystack}` + `stack-config` из main в `phase-verification-plan.ts`/`readiness.ts`, либо минимальная декларация `verify.gates[]` в `gennady.yaml` с `when: [globs]` (дух PR #7). Тест: fixture без `package.json`, с `gennady.yaml` (swiftlint-заглушка) → `sdd-verify --task … --phase …` строит план и пишет receipt. Eval: **G1**. Effort L (общий с #20).

**Черновик ответа akkrat (DRAFT).**
> `when` на гейте в main пока нет. В v2 ситуация другая: стек-плагины и `gennady.yaml` туда ещё не перенесены, `sdd-verify` работает от `package.json`. Перенос стек-независимой верификации в v2 — отдельная работа, и файловая область гейта войдёт в её спецификацию; ваш cloud-ios `gennady.yaml` — эталонная фикстура.

---

## #11 — Директивы зовут `~/.claude/skills/…`, а `sync-skills` ставит в `<cwd>/.claude/skills/` (OPEN)

**Проблема.** Восемь мест в `audit/discovery/phase-execution-protocol/module-decomposition` вызывают `~/.claude/skills/sdd-execute/scripts/sdd` (домашний каталог), тогда как `sync-skills.cmd.ts:97` ставит скиллы в проект, а `SYNC_PATH_RULES` (в отличие от `SYNC_SKILLS_PATH_RULES`) не содержит `RULE_SKILLS_TILDE`. Предложение (автор склоняется к варианту 2): правило нормализации `~/.claude/skills/` → `.claude/skills/` для директив.

**Статус в v1 (main).** Частично: `90b123e9` (#14) заменил вызовы в `audit.directive.xml`/`phase-execution-protocol.xml` на плейсхолдер `<sdd-path>`, который оркестратор подставляет абсолютным путём (`audit.directive.xml:284,410,413,415,443,444,453,506`; `sdd-execute/SKILL.md:17,56,95`). `grep -rn '~/\.claude/skills' <main>/ai` → ровно три вхождения: `ai/directives/sdd/module-decomposition.directive.xml:661` (`extract-section.sh`), `ai/directives/sdd/discovery.directive.xml:614` (`sdd extract`) и `ai/skills/README.md:8` (историческая заметка, не вызов). Правило в `SYNC_PATH_RULES` не добавлено: `shared/common/sync/path-normalizer.ts:84` (объявление), состав `:85-93` — без `RULE_SKILLS_TILDE`, который есть только в `SYNC_SKILLS_PATH_RULES`. Тест деплой-поверхности есть (`scripts/__tests__/deployed-surface.test.ts` + golden, `7d48149d`), но тильду он не ловит.

**Статус в v2 (RC).** `grep -rn '~/\.claude' ai/ cli/ shared/` → **0**. `.claude/skills` встречается только как факт деплоя (`ai/skills/README.md:83`, `ai/flow-eval/provision.ts:1140`, `ai/flow-eval/__tests__/harness.test.ts:237`) — в тексте директив пути к скиллам нет вовсе; все вызовы инструментов — `npx gennady sdd-*`. `sync-skills` по-прежнему проектный. Коллизия невозможна по построению.

**Вердикт: ЗАКРЫТО В V2** (по построению; без замка).

**Что требуется в v2 (замок).** Contract-тест по `ai/**` (rendered directives + skills): `doesNotMatch(/~\/\.claude\//)` и `doesNotMatch(/\.claude\/skills\/sdd-execute\/scripts/)`. Eval: **G2**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> В main после #14 оркестратор передаёт `<sdd-path>` явно, и почти все тильды ушли; два хвоста в `discovery`/`module-decomposition` ещё стоят — поправим. В v2 директивы вызывают инструменты только как `npx gennady sdd-*`, пути к скиллам в тексте нет вовсе. Спасибо за честную пометку «латентно, не инцидент» — так и оценили.

---

## #13 — `Reopens` определён двумя способами (CLOSED)

**Проблема.** `audit.directive.xml:404` требует `Reopens = Round headers − 1`, `AX_REOPEN_TICKET_FORMAT` подразумевает «только аудит-раунды»; раунды открываются и по resume-after-blocker и по `--new-audit-session`. Два аудита подряд требовали 1 и 2 на одном тикете. Предложение (автор: вариант 3) — закрытый словарь причин в заголовке раунда.

**Статус в v1 (main).** Закрыто RubaXa комментарием: `90b123e9` (#14) сделал Reopens evidence-driven. Формулы «Round headers − 1» в main нет; вместо неё `ai/directives/sdd/audit.directive.xml:511` («Reopens metadata — consume `<sdd-path> check --task <Task-ID>` [REOPENS], **do not hand-count**») и `:697` («Meta `Reopens` is the count of persisted `@audit` records whose `triggered-reopen` is not `none`»). Механика: `check.sh:347-421` (`reopens_one`), счёт `:357` `grep -cE '^@audit .* triggered-reopen=Round-[0-9]+'`, двусторонняя причинность через awk `:382-395`. #12 удалил свой конкурирующий producer. Тесты `scripts/__tests__/sdd-check-log.test.ts:230` («counts only audit-triggered reopens»), `:238`, `:319`/`:330`/`:341` (causation, PENDING).

**Статус в v2 (RC).** Формулы нет (`grep 'Round headers'` по `ai/directives/sdd-v2` → 0) — контрадикция снята. Поле существует в шаблонах: `formats/task-ticket-structure.xml:36`, `scaffold.directive.xml:181`, `formats/module-tasks-index.xml:12`, `formats/scope-tasks-index.xml:31`, `shared/sdd/templates.ts:1251`; обновляется вручную reconcile-директивой (`reconcile.directive.xml:113,194,250`); `formats/audit-round.xml` несёт `triggered-reopen=<Round-M+1|none>`. Механической проверки **нет**: `Reopens` не встречается в `shared/sdd/check.ts`, `cli/cmd/sdd-log/*`, `ai/directives/sdd-v2/audit.directive.xml` и `audit/` (подтверждено grep'ом). Словарь причин раунда уже подсказан: `cli/cmd/sdd-log/sdd-log.types.ts:86` (`@param reason Short reason (\`initial\`, \`fix: F-NNN\`, \`resume\`)`).

- **Дополнения (пропущено в A4).** В RC есть `ai/kit/axiom/process/ax-reopen-format.xml:19` (аналог `AX_REOPEN_TICKET_FORMAT`) — единственное место, где формат Meta ещё живёт как правило. И есть `ai/kit/axiom/audit/ax-stale-after-pivot-verification.xml:8` — таблица с «Reopens counter incremented since pivot date | `MAJOR`», т.е. аудитная проверка Reopens формально существует. **Но этот аксиом не собирается ни в один шаблон** (см. #19), поэтому вывод «механической проверки нет» остаётся верным — по другой причине, чем было написано в A4.

**Вердикт: ЧАСТИЧНО** (контрадикция снята, замок отсутствует).

**Что требуется в v2.** Портировать причинную проверку в `check.ts` как `SDD_REOPENS_MISMATCH` (Meta `Reopens` vs число `@audit … triggered-reopen=Round-N` в `## Audit Rounds`, + PENDING когда объявленный Round ещё не создан); `sdd-log round` с причиной из закрытого словаря (`initial | fix: F-NNN | resume | new-audit-session`) — словарь уже подсказан в `sdd-log.types.ts:86`. Дополнительно собрать `ax-stale-after-pivot-verification.xml` в шаблон (общая работа с #19), иначе аудитная проверка Reopens остаётся мёртвой. Тест по образцу `sdd-check-log.test.ts:230-341`. Eval: **G3**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> Как и написано при закрытии: источник истины один — #14, счётчик идёт от `@audit … triggered-reopen`, не от числа заголовков. В v2 формулы «Round headers − 1» нет, но и механическая проверка Meta↔`@audit` пока не перенесена. Заодно нашли у себя, что единственный аксиом в v2, где Reopens вообще проверяется аудитом (`ax-stale-after-pivot-verification`), не собирается ни в одну директиву — чиним сборку и переносим проверку вместе со словарём причин раунда, который вы предлагали третьим вариантом.

---

## #15 — `critic.directive.xml` пишет `### Round N` в тикет и коллизирует с Execution Log (OPEN)

**Проблема.** `## Critic Rounds` / `### Round N — YYYY-MM-DD` в том же файле, что и `### Round N — <date>, <reason>` Execution Log; `[REOPENS]` считал `grep -c '^### Round '` по всему файлу → `MISSING` на никогда не переоткрытом тикете. Две части: (1) namespace заголовка — предложено `### Critic Round N`; (2) счётчик должен быть ограничен регионом Execution Log.

**Статус в v1 (main).** Часть 1 **не исправлена**, часть 2 закрыта — но **не тем механизмом, который называл A4** (обязательные правки V-A4 №1 и №9).

- Часть 1: `ai/directives/sdd/critic.directive.xml:167-169` по-прежнему `Create/append `## Critic Rounds`` → ```### Round N — YYYY-MM-DD``` — точно на указанных строках, не исправлено. Плюс `:25` `AX_SCRATCH_LOG`, `:196-198` (секция сохраняется на не-CLEAN).
- Часть 2 — что реально сделал `4a47b9e8` (#12): **функции `sdd_lib_execution_log` в main не существует ни в HEAD, ни в `4a47b9e8`** (`git grep -n sdd_lib_execution_log 4a47b9e8` → пусто; в HEAD → 0), и **якоря `<!--SECTION:EXECUTION_LOG-->` сознательно не используются** как делимитеры. Реально:
  - `check.sh:557` `/^## 7\. Execution Log/ { inlog = 1; next }` — вход в регион остался **жёстким, на секцию №7**; на `4a47b9e8` он такой же;
  - `check.sh:558` `/^## / { if (inlog) inlog = 0 }` — **это и есть фикс**: любой `## ` закрывает регион, поэтому `## Critic Rounds` больше не оставляет его открытым;
  - `check.sh:544-556` — комментарий, прямо объясняющий, что вход **сознательно не расширяли** до `## <n>. Execution Log` и что якоря `<!--SECTION:EXECUTION_LOG-->` **сознательно не используются** (есть тикеты, чья пара якорей обнимает только заголовок);
  - `[REOPENS]` перестал считать заголовки вовсе (см. #13), поэтому repro из issue (`rounds 2 … MISSING`) невозможен ещё и потому, что колонок `rounds`/`audit_rounds` в выводе больше нет — шапка теперь `# task_id  meta  audit_triggered  verdict` (`check.sh:351`).
  - Тесты: `sdd-check-log.test.ts:511` («leaves the critic section out of the log parse»), `:518` («ends the region at a numbered section too»), `:535` («attributes a finding to its execution round, not to an intervening critic round»).
- **Остаточная дыра в v1, обратная исходной (пропущено в A4): `check.sh:372`** `grep -qE "^### Round ${target}([[:space:]]|$)" "$f"` — проверка «объявленный `triggered-reopen` Round существует» идёт по **всему файлу**, не по региону лога. Критиковский `### Round 2` под `## Critic Rounds` удовлетворит эту проверку за несуществующий execution-раунд. Ложно-отрицательный близнец исходного issue, живой в main HEAD.

**Статус в v2 (RC).** Критик ничего не пишет: `critic.directive.xml:57-63` STEP_3_REPORT — «Never edit, **never persist a round journal**, never ask to continue…». Аудит пишет `### Audit Round N` (`formats/audit-round.xml`) — другое пространство имён. Коллизия для новых тикетов невозможна.

- **Правка цитаты (обязательная правка V-A4 №2).** A4 писал, что `## Critic Rounds` в sdd-v2 «упоминается только как то, что при миграции остаётся в v1-формате (`infra.directive.xml:51`, `interface.directive.xml:48`)». На этих строках — **`AX_SPEC_LIFECYCLE`**, и он говорит противоположное: «Temporary Change Manifest, per-line review marks, **Critic Rounds**, publication state, and migration between V2 subformats **are not part of the specification**», т.е. Critic Rounds как артефактная сущность в v2 отменены. Для вердикта это ещё сильнее в пользу «критик не пишет», но цитата в A4 описывала не то, что там написано.
- **Остаток:** `cli/cmd/sdd-log/sdd-log.types.ts:76-79` `fileContent.match(/^#{3}\s+Round\s+\d+/gm)` — `nextRoundNumber` считает по **всему файлу**, не по секции EXECUTION_LOG → мигрированный v1-тикет с `## Critic Rounds` и `### Round 1 — …` внутри даст следующий раунд со сдвинутым номером.

**Доказательство исполнением (repro, RC).**

```
$ node --import tsx <scratch>/V-fix/nextround.mjs
nextRoundNumber (execution log EMPTY, 2 critic rounds) = 3
```

Фикстура: пустая секция `EXECUTION_LOG` + `## Critic Rounds` с `### Round 1` и `### Round 2`.

**Вердикт: ЧАСТИЧНО** (закрыто для новых тикетов; остаток на миграции).

**Что требуется в v2.** `nextRoundNumber` считать внутри `extractSection(content,'EXECUTION_LOG')` (в `sdd-log.cmd.ts:435` `content` уже под рукой); тест в `cli/cmd/sdd-log/__tests__`: тикет с `## Critic Rounds` + `### Round 3` вне лога → следующий execution-round = 2. В `migration-v1-v2.directive.xml`/`sdd-migrate move` — переименовать legacy `### Round N` внутри `## Critic Rounds` в `### Critic Round N`. Отдельно (для v1, если main ещё поддерживается): сузить `check.sh:372` до региона лога. Eval: **G4**, **G3**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> Про main уточню точнее, чем мы сформулировали сначала: после #12 регион лога **закрывается на любом `## `** (`check.sh:558`), поэтому `## Critic Rounds` больше не оставляет его открытым; а `[REOPENS]` вообще перестал считать `### Round`-заголовки и считает `@audit … triggered-reopen`. Вход в регион остался жёстким `## 7. Execution Log` — сознательно, как вы и написали в комментарии. Заголовок `### Round N` у критика в main пока не переименован. Ещё нашли обратную дыру в main: `check.sh:372` ищет `^### Round <target>` по всему файлу, так что критиковский `### Round 2` подтвердит существование execution-раунда, которого нет. В v2 критик не пишет в артефакт вообще (и Critic Rounds там прямо объявлены не частью спецификации), коллизии нет; единственный хвост — `sdd-log round` нумерует раунды по всему файлу: воспроизвели, на тикете с пустым логом и двумя критиковскими раундами он выдаёт 3. Сужаем до секции лога и добавляем шаг в миграцию.

---

## #16 — Девять скиллов велят объявить `DIRECTIVE ACTIVATED`, который директива запрещает (OPEN)

**Проблема.** `Announce: 🔒 DIRECTIVE ACTIVATED: Sdd…` в SKILL.md; `AX_NO_PROCESS_NARRATION` называет ровно эту строку первым примером запрещённого. В dispatch-шаблоне `sdd-execute` каждый phase-агент встречает противоречие заново. Предложение: убрать announce или заменить на не-запрещённую форму, единообразно.

**Статус в v1 (main).** Не исправлено. `grep -rn 'DIRECTIVE ACTIVATED' <main>/ai` → 7 скиллов с `Announce:`: `sdd-discover:10`, `sdd-continue:10`, `sdd-infra:12`, `sdd-setup:10`, `sdd-fix:10`, `sdd-scaffold:10`, `sdd-module-decomposition:10` (`sdd-execute`/`sdd-execute-batch` баннера не несут — переписаны #14). `git log -S'DIRECTIVE ACTIVATED' 46c6d616..main` — только #14, без правки этих скиллов.

- **Правка счёта (обязательная правка V-A4).** Аксиом с этой строкой лежит в **8** файлах директив, а не в 7: `setup:120`, `phase-execution-protocol:229`, **`svelte-ui-discovery:172`**, `scaffold:347`, `module-decomposition:284`, `discovery:275` и `discovery:524` (вторая формулировка), `fix:181`. A4 недосчитал `svelte-ui-discovery.directive.xml`.
- Заголовок issue говорит «Nine SDD skills», тело — «Ten skills carry an `Announce:` line … nine of them load a directive that bans it»; заголовок этого раздела следует телу issue.

**Статус в v2 (RC).** `grep -rn 'DIRECTIVE ACTIVATED|Announce' <rc>/ai` → только определения аксиома: `ai/directives/sdd-v2/router.directive.xml:130` и `ai/kit/axiom/process/ax-no-process-narration.xml:3`. В `ai/skills/*/SKILL.md` — ноль; скиллы — «thin directive-loaders» без баннера; `ai/skills/sdd-audit/SKILL.md:13` прямо: «Do not narrate directive activation».

**Вердикт: ЗАКРЫТО В V2** (без замка).

**Что требуется в v2 (замок).** Contract-тест по `ai/skills/**/SKILL.md` и rendered `ai/directives/sdd-v2/**`: `doesNotMatch(/DIRECTIVE ACTIVATED/)` в скиллах и dispatch-шаблонах. Eval: **G3**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> В main баннер из семи скиллов ещё не убран — уберём (вариант 1: активация уходит в service line). Уточнение к вашему тексту в нашу же пользу: аксиом, запрещающий эту строку, лежит в восьми директивах, не в семи — мы сами недосчитали `svelte-ui-discovery`. В v2 скиллы баннера не печатают, `sdd-audit` явно запрещает нарратив активации; добавим контрактный тест, чтобы строка не вернулась.

---

## #17 — Вывод прошедшего гейта отбрасывается; сузивший область гейт не может сказать, что он прогнал (OPEN)

**Проблема.** `gate-runner.ts executeGate` на `pass` даёт `output: ""`; `GateResult.output` «retained only for non-passing gates». Гейт `unit-tests`, сужающий прогон по impact-set, печатает `[gate] сужено: …`/`[impact] не прогоняются: …` в stderr — на зелёном прогоне это исчезает; «tests passed» о полном и об одном бандле выглядят одинаково. Предложение: `showOutputOnPass`, либо `[gate]`-префикс, переживающий verdict, либо `--full-output` сохраняет output на pass.

**Статус в v1 (main).** Не исправлено: `services/stack/gate-runner.ts:331` (pass-ветка `outputMeansFailure`, `output: ''`) и `:335` (`proc.status === 0` → `output: ''`); `services/stack/stack.types.ts:186` — «Combined stdout+stderr, **retained only for non-passing gates**»; `--full-output` (`cli/cmd/verify/verify.cmd.ts:90` `fullOutput: ['full-output']`, `:364`) влияет только на усечение в `--json`.

- **Смягчение на уровне инструкции (пропущено в A4).** Директива main уже даёт частичный обход: `ai/directives/sdd/phase-execution-protocol.xml:95` — «`<sdd-path> verify --wip --json <target-files>` — same gates, machine-readable. `results[]` names every gate with its command and status, **passing ones included**; use it when you need to state which gates ran». Issue это не закрывает (гейт по-прежнему не может сказать *своими словами*, что он сузил), но буквальное «прошёл — и ничего нельзя сказать» неверно: идентичность гейтов доступна. Изменилась инструкция, не механизм.

**Статус в v2 (RC).** `gennady verify`/gate-runner отсутствуют (§0). `sdd-verify`: `shared/sdd/phase-receipt.ts:15-25` — `PhaseReceiptCommand = { gate, role, command, exitCode }`, полей `output`/`notes` нет; `cli/cmd/sdd-verify/phase-run.ts:341-352` — успешный шаг пушится без вывода, `:366-373` — вывод печатается только у упавшего шага; `cli/cmd/sdd-verify/help.ts:85-92` — «success → ✅ ALL PASS (N/M), then one line per step». Тот же класс: зелёный §5-гейт `xcodebuild test -only-testing:…` не может сообщить, что прогнал.

**Вердикт: НЕ ЗАКРЫТО.**

**Что требуется в v2.** В `PhaseReceiptCommand` добавить `notes: string[]` — строки stdout/stderr с префиксом `[gate]` (или `[verify]`), сохраняемые независимо от статуса; печатать их в success-summary. Тест в `cli/cmd/sdd-verify/__tests__`: verbatimRunner возвращает exit 0 + `[gate] сужено: A,B` → `receipt.commands[i].notes` содержит строку, summary печатает её. Eval: **G1**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> Согласны с постановкой: «прошёл» без «что именно» — слабый вердикт. Уточнение по main: механизм не менялся, но инструкция уже даёт частичный обход — `phase-execution-protocol.xml:95` предписывает `verify --wip --json`, где `results[]` перечисляет все гейты с командой и статусом, включая проходящие. Своими словами гейт по-прежнему сказать не может. В v2 раннер другой (`sdd-verify` + receipt: `gate/role/command/exitCode`), но эффект тот же — вывод зелёного шага не сохраняется. Планируем конвенцию `[gate]`-префикса: такие строки попадают в receipt и в summary независимо от статуса; это ближе к вашему второму варианту.

---

## #19 — Протокол фазы запрещает любой `git`, а фазам-гейтам нужны throwaway-репозитории (OPEN)

**Проблема.** `AX_PERMITTED_BASH_COMMANDS`/`AX_NARROW_RECON` запрещают `git` целиком; фазы, тестирующие guard-скрипты/lint-гейты/CI-шаги, не могут ничего доказать без `mktemp -d && git init` вне дерева. Фазы «нарушали и раскрывали», аудит пропускал. Предложение: ограничить запрет рабочим деревом проекта, разрешить fixture-репозиторий вне дерева (создан и удалён внутри фазы, путь в `ver`), опционально `git status --porcelain -- <Target Files>`.

**Статус в v1 (main).** Не исправлено: `ai/directives/sdd/phase-execution-protocol.xml:51` — `AX_NARROW_RECON`: «Forbidden: `git status`, `git branch`, `git log`, `git diff`, **or any other git operation**»; `:97` — «**Forbidden:** `git` ANY subcommand (status, branch, log, diff, add, commit)»; `:99` rationale «each git call costs ~100-300ms».

**Статус в v2 (RC).** Прочитан `ai/kit/axiom/process/ax-permitted-bash-commands.xml` целиком (55 строк):

- `:22-31` — `git`/`gh` **чтения** законны только когда шаг директивы «names a real gap» (новые коммиты, история файла), иначе «off the table»; мутирующий git — только шагу publish/commit;
- `:33-38` — «no bash command in this list reaches outside the project root»;
- `:40-47` — «**Temp files stay under `.claude/tmp/`, nowhere else**… The system `/tmp`, `$TMPDIR`, and the repository root are closed»;
- `mktemp` в списке «May run» **отсутствует вовсе** — т.е. fixture запрещён **трижды** (нет `mktemp`, нет git-мутаций, нет выхода за корень), а не дважды, как писал A4; `git init` внутри `.claude/tmp/` — вложенный репозиторий в рабочем дереве, чего аксиом тоже не предусматривает;
- **`:51-54` (пропущено в A4): «Ticket §5 commands are *not* a phase-agent exemption»** — Swift-тикет с `xcodebuild` в §5 фаза не может прогнать сама даже теоретически; их исполняет `sdd-verify`, и он их и так бежит verbatim. Это отдельный барьер для Swift-кейса, помимо запрета `git`/`mktemp`;
- Snapshot §5: `cli/cmd/sdd-verify/help.ts:30` — «Workspace snapshots intentionally exclude .git metadata and installed node_modules tool state; **every other** persistent file or directory is observed» → `.claude/tmp/**` под наблюдением.

**Висячие ссылки в сборке (усилено V-A4 — их две, а не одна).**

- `AX_PERMITTED_BASH_COMMANDS` определён в kit, но **не собран ни в один шаблон**: `grep -rn 'permitted-bash' <rc>/ai/kit/templates/` → **0**; ссылаются на него `execute.directive.xml:53`, `phase-execution-protocol/steps/STEP_3_VERIFY.xml:28`, `audit/steps/STEP_1_MECHANICAL.xml:78`, `infra.directive.xml:417`, `ai/kit/axiom/infra/ax-gitignore-baseline.xml:7`, `ai/kit/axiom/process/ax-verification-before-handoff.xml:15`.
- **Второй несобранный аксиом (пропущено в A4): `ai/kit/axiom/audit/ax-stale-after-pivot-verification.xml`** — `grep -rn 'ax-stale-after-pivot' ai/kit/templates ai/kit/assembly-manifest.json` → **0**; из-за этого пропадает и аудитная проверка Reopens (см. #13).
- **Устаревший комментарий (пропущено в A4): `ai/kit/audit-halt-activation.mjs:138`** утверждает, что `review-lifecycle.directive.hbs` включает `axiom/process/ax-permitted-bash-commands` — в самом `templates/sdd-v2/review-lifecycle.directive.hbs:7-10` включены только четыре других аксиома, и в собранном `ai/directives/sdd-v2/review-lifecycle.directive.xml` строка `AX_PERMITTED_BASH_COMMANDS` встречается 0 раз.
- `ai/kit/lint-axioms.ts:4,97` — проверка ровно одной направленности («defined in BeliefState, referenced by no step/halt/switch/contract»); обратной нет. Поэтому нужен **и** lint «referenced-but-undefined», **и** обратный отчёт «defined-but-never-included-in-a-template» — первый ловит только половину класса.

**Вердикт: НЕ ЗАКРЫТО** (с усилением).

**Что требуется в v2.**

1. Включить `{{> "axiom/process/ax-permitted-bash-commands"}}` в `phase-execution-protocol.directive.hbs` и `ax-stale-after-pivot-verification` — в аудитный шаблон; в `ai/kit/lint-axioms.ts` добавить обе проверки («referenced-but-undefined» и «defined-but-never-included-in-a-template») + тесты в `ai/kit/__tests__/lint-axioms.test.ts`; поправить комментарий `ai/kit/audit-halt-activation.mjs:138`.
2. В аксиом — явное исключение: `git init/add/commit` внутри `.claude/tmp/<fixture>/` (нет `.git` рабочего дерева; путь в `ver`/`decisions`), удаляется в фазе; `mktemp`-эквивалент внутри `.claude/tmp/`; `sdd-verify` snapshot (`phase-run.ts:326-361`) должен игнорировать `.claude/tmp/**`.
3. Разрешить read-only `git status --porcelain -- <Target Files>`.
4. Отдельно решить `:51-54`: либо §5-гейт становится доступен фазе, либо в тикете фиксируется, что §5 исполняет только `sdd-verify` (тогда «фаза доказала» опирается на receipt).

Тест: фаза-фикстура kind=`test` с `§5: bash scripts/guard.sh` над `.claude/tmp/repo` проходит `sdd-verify` без `§5 verification must be read-only`. Eval: **G1**, **G3**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> Пример с TSK-IB-005 убедительный: правило «как написано» и «как применяется» разошлись. В main текст пока прежний. В v2 аксиом переписан (git-чтения допустимы при названном пробеле), но fixture-репозиторий по-прежнему не предусмотрен — и запрещён даже трижды: нет `mktemp`, нет git-мутаций, нет выхода за корень проекта, а scratch разрешён только в `.claude/tmp/`. Плюс там же отдельная строка: команды §5 тикета — не исключение для фазового агента, так что Swift-гейты фаза не прогонит и через §5. Планируем именованное исключение: throwaway-репозиторий в `.claude/tmp/<fixture>`, создаётся и удаляется в фазе, путь в `ver`. И нашли у себя, что этот аксиом в v2 вообще не собирается в директиву (как и второй, аудитный) — чиним сборку и добавляем линт в обе стороны.

---

## #20 — `sdd verify --wip <target-files>` не сужает гейты; `--only` не умеет назвать новый гейт (OPEN)

**Проблема.** (1) `verify.sh:90` передаёт файлы как positional targets `gennady verify`, не как фильтр — с anystack бегут все extraGates; (2) `--only=<gate>` сверяет id целиком — фаза, добавляющая гейт, не может его прогнать; (3) шаблон говорит `sdd verify`, введя двумя строками выше `<SDD_PATH>`. 27 из 96 dispatch-промптов несли ручное предупреждение. Предложение: `<SDD_PATH> verify --wip --only=<гейты из §5 фазы>`; `verify.sh` — либо файлы→фильтр (нужен `paths:` на гейт), либо отказ с сообщением; `--only` по префиксу/глобу с печатью в `--plan`.

**Статус в v1 (main).** Не исправлено по всем трём пунктам: `ai/skills/sdd-execute/scripts/verify.sh:90` (`exec gennady verify "$@"`); `cli/cmd/verify/verify.cmd.ts:69-71` `selectorMatches` — строгое равенство; `ai/skills/sdd-execute/SKILL.md:98` — «MANDATORY before EMIT_HANDOFF: **sdd verify** --wip <target-files>» при `<SDD_PATH>` на `:95`, тогда как директива `phase-execution-protocol.xml:90` уже пишет `<sdd-path> verify --wip <target-files>`.

**Статус в v2 (RC).** `sdd-verify --task <ticket> --phase <P>` (`sdd-verify/help.ts:14`): профиль и точные Target Files выводятся из тикета CLI (`phase-context.ts:35-42,169-183`), `--only` нет (в `cli/cmd/sdd-verify/help.ts` — только `--task/--phase/--profile/--spec`). Лестница — npm-скрипты на весь проект: `shared/sdd/phase-verification-plan.ts:43-49` `verificationGateNames`: `full` → `['type-check','test:coverage','lint','format','yagni']`, `test` → `['fix','type-check','test:coverage']`, иначе `['fix','type-check','test']`; `:252-270` `commandForGate` — единственный файл-зависимый рунг это `fix` → `target-repair` (требует `format:fix`+`lint:fix` как argument-forwarding бриксы), всё остальное `npm run <script>` на весь проект. §5-строки бегут verbatim все применимые (`phase-run.ts:341`). Пункт (3) снят — единая команда `npx gennady sdd-verify`.

- **Правка формулировки (обязательная правка V-A4 №3, та же, что в #9-bonus).** На Swift-проекте: `readiness.ts:15-24` `REQUIRED_SCRIPTS` (8 npm-скриптов) → `executionReady=false` → `phase-context.ts:262` блокирует не-`setup` фазы, **кроме** тех, что структурно владеют отсутствующим readiness-гейтом (`phase-context.ts:282-285`, `shared/sdd/gate-queue.ts` — `profileBasis = 'infra-queue-exemption'`); недостающий скрипт → `status:'missing'`, exit 1 (`sdd-verify.cmd.ts:508-520`). Т.е. отработают только `setup`-фазы (bootstrap/config/doc) и фаза, создающая недостающий гейт; всё прочее упрётся в `executionReady=false`. «Гейт стоит 3 часа» превратилось в «гейта нет» — вывод верен, механизм в A4 был описан слишком сильно.

**Вердикт: НЕ ЗАКРЫТО.**

**Что требуется в v2.** См. #9-bonus: стек-независимый план гейтов в `shared/sdd/phase-verification-plan.ts` + `readiness.ts` (источник — `gennady.yaml`, а не `package.json`), с `when: [globs]` на гейт и автоматическим сужением по Target Files фазы; `--plan` печатает выбранный набор. Тест: Swift-fixture (`gennady.yaml` c 3 гейтами, фаза с Target Files `CODEOWNERS`) → в плане только гейты без `when` или с совпавшим glob. Eval: **G1**. Effort L (общий с #9-bonus).

**Черновик ответа akkrat (DRAFT).**
> По main все три пункта верны и открыты; расхождение `sdd`/`<SDD_PATH>` в шаблоне поправим сразу. В v2 команда одна (`sdd-verify --task --phase`) и файлы фаза не передаёт — CLI берёт их из тикета, так что пункт 3 исчезает. Но стек-плагины в v2 ещё не перенесены, лестница npm-ориентирована, и на Swift-проекте отработают только `setup`-фазы (bootstrap/config/doc) и та фаза, которая сама создаёт недостающий гейт; все остальные упрутся в `executionReady=false`. Перенос стек-независимого verify с файловой областью гейта — приоритет G1 у нас; ваши 27 предупреждений в промптах — лучшее доказательство, что это должно жить в конфиге гейта.

---

## #21 — Изолированный критик не видит конвенции scope (`tasks/README.md`) и переоткрывает решённое (OPEN)

**Проблема.** `AX_ISOLATION`: только артефакт + parent spec. Verification Levels, таксономия `[contract]`, Cascade Table, D-00x живут в `tasks/README.md`/`tasks/<scope>/README.md` — критик их не видит, каждый проход даёт ровно одно отклонённое finding этого класса; оркестратор вырастил преамбулу «settled conventions» (18 dispatch). Цена — 100–130K токенов на раунд. Предложение: добавить в read set секции конвенций, либо обязательный блок `Settled conventions:` в dispatch, заполняемый механически.

**Статус в v1 (main).** Не исправлено: `ai/directives/sdd/critic-protocol.xml:10` («Only artifact + parent spec. No other files»), `critic.directive.xml:10` (AX_ISOLATION_SIGNAL), dispatch `:117` (только `Artifact`, `Parent spec`).

**Статус в v2 (RC).** `critic-protocol.directive.xml:4` AX_ISOLATION расширен: «canonical bounded target-set … + its minimal parent context + the Vision / Goals of its direct NEIGHBOURHOOD … pulled via `npx gennady sdd-extract <dep> VISION` … No other files, no full dependent specs»; `critic.directive.xml:48-53` STEP_2_REVIEW — «only the references required to judge it» (нечётко). Конвенции в v2 переехали: проектные — в `specs/3-tasks.md` (token vocabulary, Baseline Completion Rule), модульные — в `<module>.3-tasks.md` (`formats/module-tasks-index.xml:27` `## Decision Log (module-task level)`, `:30-31` `## Conventions` → «declared once in `specs/3-tasks.md` and inherited here — not repeated»). Таксономия Verification Levels зафиксирована в пакете: `formats/task-ticket-structure.xml:43` и `scaffold.directive.xml:188` — оба буквально `subset of \`contract\` | \`unit\` | \`integration\` | \`e2e\``, что снимает конкретный кейс «`[contract]` из неизвестной таксономии». Но `grep -rn '3-tasks' critic.directive.xml critic-protocol.directive.xml kit/templates/sdd-v2/critic*.hbs` → **0**: ни `specs/3-tasks.md`, ни `<module>.3-tasks.md` не названы в read set критика — D-00x/Cascade-аналог по-прежнему вне поля зрения.

**Вердикт: ЧАСТИЧНО.**

**Что требуется в v2.** В `ai/kit/templates/sdd-v2/critic-protocol.directive.hbs` AX_ISOLATION добавить: «+ `## Conventions`/`## Decision Log` владельца тикета (`<module>.3-tasks.md`) и `specs/3-tasks.md#CONVENTIONS`, через `sdd-extract`»; в router payload критика — эти пути механически (`sdd-task --task-scope` уже знает owning spec). Тест: `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` — rendered critic-protocol содержит `3-tasks.md` в AX_ISOLATION. Eval: **G3**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> Расчёт стоимости раунда убедителен. В main изоляция пока «артефакт + parent spec». В v2 критик уже читает Vision соседей через `sdd-extract`, а конвенции переехали в `specs/3-tasks.md` и `<module>.3-tasks.md`; таксономия Verification Levels теперь фиксирована пакетом, так что именно тот кейс уходит. Добавляем эти файлы в read set явно — ваш первый вариант.

---

## #22 — Handoff и Inputs без провенанса: догадка оркестратора приходит к следующему агенту как измеренный факт (OPEN)

**Проблема.** `decisions: [k=v]`, `open: [id: text]` не различают «измерено / доложено предыдущей фазой / предположено». Аудитор подтверждал вместо того, чтобы измерять; O-13 без «extent» заглушил живую дыру; гипотеза прошла трёх агентов. Предложение: теги `measured|reported|assumed` + extent у `open`; `Inputs:` сохраняет теги; аудит трактует нетегированное как `assumed`; калибровочные строки говорят, что сужают — глубину, не покрытие.

**Статус в v1 (main).** Не исправлено: `phase-execution-protocol.xml:372-375` HANDOFF_FORMAT без тегов; `sdd-execute/SKILL.md:94` `Inputs: <verbatim prior Handoff lines OR "none — first phase">`.

**Статус в v2 (RC).** `phase-execution-protocol/steps/STEP_4_HANDOFF.xml:18-33` — контракт `HANDOFF_FORMAT`: `artifacts` / `decisions: [key=value]` / `open: [id: text]` / `deviations: [id: text]`; тегов провенанса и extent нет. `sdd-log complete` проверяет ровно эти четыре поля регэкспом `COMPLETE_HANDOFF_PAYLOAD_RE` — `cli/cmd/sdd-log/sdd-log.types.ts:248-249` (содержимое `[...]` свободное — теги можно писать, но никто их не определяет и не читает).

Смягчения (подтверждены): контекст фазы формируется механически — `sdd-task <ticket> --phase` печатает verbatim prior Handoffs (`cli/cmd/sdd-task/help.ts:55` «[HANDOFF]: prior completed phases' verbatim Handoff lines», `sdd-task.cmd.ts:422` `parsePhaseHandoffs`), оркестратор «Never summarize, retype, or omit its lifecycle manifest and worker contract» (`execute.directive.xml:223-224`); аудит `audit/steps/STEP_1_MECHANICAL.xml:17` — маппинг гейтов «fixed, **never inferred from the dispatch prompt's wording**», `:68` — «**re-derive the gate yourself** rather than trust the worker's logged `ver` lines».

- **Правка формулировки (обязательная правка V-A4 №5).** «Оркестратор дописал — исключено» **неверно**: `sdd-task --phase` даёт только verbatim-блок прошлых Handoff'ов, а остальную часть dispatch-промпта оркестратор по-прежнему пишет сам (`execute.directive.xml:221-222`: «followed by exact resolved spec/rule excerpts and current Git evidence»), и центральный пример issue #22 — именно **добавленная оркестратором неизмеренная премисса** («Log has a git baseline…»). Механически это не исключено, только запрещено текстом. Исключён **пересказ** прошлых Handoff'ов, не добавление собственных премисс.

**Вердикт: ЧАСТИЧНО.**

**Что требуется в v2.** В `ai/kit/contract/process/handoff-format` — грамматика тегов: `decisions: [k=v(measured|reported|assumed)]`, `open: [id(tag; extent): text]`; `sdd-log complete` — warn (не reject) на нетегированные записи, чтобы не ломать миграцию; `audit/steps/STEP_2_SEMANTIC.xml` — правило «untagged ⇒ assumed; open без extent ⇒ покрывает ничего»; в `execute.directive.xml` STEP_3 — калибровка только по глубине; отдельно — пометка провенанса на премиссах, которые оркестратор добавляет от себя. Тест: `cli/cmd/sdd-log/__tests__` — payload с тегами принимается; без тегов — warn в выводе. Eval: **G3**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> Разбор O-13/O-11 — самый ценный из ваших материалов, он показывает, где теряются раунды. В main грамматика Handoff пока без провенанса. В v2 прошлые Handoff-строки приходят verbatim из CLI (`sdd-task --phase`), так что их **пересказ** исключён; но премиссы, которые оркестратор добавляет от себя («exact resolved spec/rule excerpts and current Git evidence»), по-прежнему ничем не помечены — а это и есть ваш центральный пример. Именно это берём в грамматику: теги `measured/reported/assumed` и extent для `open`, проверка в `sdd-log complete` и правило «без тега = assumed» для аудита.

---

## #23 — В Execution Log нет токена для исправления ранней строки; самодельный `correction` отвергается как `unknown-token` (OPEN)

**Проблема.** Раунды append-only, словарь закрыт (`intro|decision|tried|discovery|insight|verified|ver|BLOCKED|DONE`). Когда число из Round 1 оказывается неверным в Round 3 — редактировать нельзя, оставить — аудит флажит, выдумать токен — чекер отвергает (F-25, три `unknown-token`). «Полу-фикс»: поправлено в одном месте, устарело в четырёх. Предложение: строка `correction | <round>/<phase> <field>: <old> → <new> ← <reason>`; `check.sh` принимает; аудит считает значение с поздним `correction` разрешённым.

**Статус в v1 (main).** Не исправлено: таблица токенов `ai/directives/sdd/scaffold.directive.xml:709-721` закрыта; `check.sh:525-529` — live-set `intro decision tried discovery insight verified ver BLOCKED DONE`, retired `sync file test cov rules recon`, всё остальное — `unknown-token`, засчитывается (`check.sh:502,621`).

**Статус в v2 (RC).**

- **Правка (обязательная правка V-A4 №4): «словарь тот же» — неточно.** В v2 `ver` заменён CLI-владельцем `SDD_PHASE_RECEIPT`, и каноническая формулировка живёт не только в `execute.directive.xml:26` (`intro / decision / tried / discovery / insight / verified / BLOCKED`), а в шаблоне `specs/3-tasks.md`: `shared/sdd/templates.ts:1581` — «`intro <Entity> ← <reason>` · `decision <key>=<value> ← <reason>` · `tried` · `discovery` · `insight` · `verified <tool>@<version>` · CLI-owned `SDD_PHASE_RECEIPT` · `BLOCKED <cause>` · `DONE`».
- Противоречие о владельце словаря подтверждено: `formats/task-ticket-structure.xml:141` — «Token vocabulary lives in `<module>.3-tasks.md`», а `formats/module-tasks-index.xml:30-31` — «declared once in `specs/3-tasks.md` and inherited here — not repeated».
- Механической проверки словаря **нет**: `shared/sdd/check.ts` знает только `SDD_EXECUTION_LOG_ROUND_MISSING` (`:551`), `_PHASE_MISSING` (`:559`), `_PHASE_DUPLICATE` (`:564`), `_PHASE_ORPHAN` (`:571`). `sdd-log <ticket> line "<content>"` принимает любой текст (`sdd-log/help.ts:18`, `sdd-log.types.ts:98` `buildEventLine`) и вставляет его только в текущий раунд («never rewrite prior event lines», `help.ts:72`).
- Порт #12 (детекция записи в закрытый раунд) отсутствует: `grep -rn 'entry-after-close|ENTRY_AFTER_CLOSE|closed round'` по `shared/ cli/` → **0**.

Итог: `correction` не отвергнется — но и не определён, аудит его не понимает, «полу-фикс» никем не ловится.

**Доказательство исполнением (repro, RC) — самодельный токен проходит молча.**

```
$ node --import tsx <scratch>/V-fix/runlog.mjs t.GAT-login.md \
    line "correction R1/P1 baseline: 186 → 185 ← recount" --phase P1
[sdd-log] appended to EXECUTION_LOG:
- [x] `2026-09-07T05:18:36.769Z` correction R1/P1 baseline: 186 → 185 ← recount

$ ROOT=<scratch>/V-fix/log node --import tsx <scratch>/V-fix/runcheck.mjs --task t.GAT-login.md
[sdd-check] ✅ clean — 1 file(s) checked
```

Фикстура тикета несла одновременно самодельный токен `correction` **и** секцию `## Critic Rounds` с `### Round 1` — `sdd-check --task` не сказал ни о том, ни о другом.

- Побочно замечено (к вердикту не относится): `sdd-log line` штампует миллисекундный timestamp `…:36.769Z`, тогда как остальной корпус пишет `…:36Z`/`…Z` — расходится с форматом, который v1-парсер нормализует вручную.

**Вердикт: НЕ ЗАКРЫТО.**

**Что требуется в v2.** (1) Добавить строку `correction` в каноническую таблицу токенов: `ai/kit/templates/sdd-v2/execute.directive.hbs` (`:26`) **и** шаблон `specs/3-tasks.md` в `shared/sdd/templates.ts:1581`; заодно снять противоречие о владельце словаря (`task-ticket-structure.xml:141` vs `module-tasks-index.xml:30-31`). (2) `sdd-log line` — валидация первого слова по словарю (`ERR_CLI_SDD_LOG_UNKNOWN_TOKEN`, exit 2) и для `correction` — проверка, что `<round>/<phase>` существует в EXECUTION_LOG. (3) Порт #12 в `check.ts`: `SDD_EXECUTION_LOG_UNKNOWN_TOKEN`, `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE`. (4) `audit/steps/STEP_2_SEMANTIC.xml` — правило «значение с поздним `correction` = resolved; артефакт со старым значением = finding». Тесты: `cli/cmd/sdd-log/__tests__` (accept/reject), `shared/sdd/__tests__/check.test.ts` (после-close). Eval: **G3**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> Да, «append-only нужен легальный способ ошибиться один раз» — точная формулировка. В main токена нет. В v2 словарь почти тот же (с одной разницей: `ver` заменён CLI-владельцем `SDD_PHASE_RECEIPT`, каноническая таблица переехала в шаблон `specs/3-tasks.md`), но `sdd-log line` его вообще не проверяет — воспроизвели: строка `correction R1/P1 baseline: 186 → 185 ← recount` приписалась молча, и `sdd-check --task` на том же тикете сказал «clean». Это не лучше отказа. Добавляем `correction` в каноническую таблицу, валидацию в `sdd-log`, порт вашей проверки записи в закрытый раунд из #12 и правило для аудита «позднее исправление снимает старую строку, но не устаревшую копию в других артефактах».

---

## #24 — `gennady sync` перезаписывает локально изменённые директивы, включая проектный `knowledge.xml` (OPEN)

**Проблема.** `sync-core.ts` знает `added|unchanged|updated`; `updated` = «пакет отличается от диска» → запись. Нет понятия «локально изменён». cloud-ios потерял 5-правильный Swift-реестр в `knowledge.xml` (каскад правил следующих тикетов шёл от пустого реестра), пять патченных скриптов и `discovery.directive.xml` — трижды. Предложение (любой из трёх): манифест с хэшами → `locally-modified`/`--force`; `knowledge.xml` project-owned; overlay `ai/directives.local/`.

**Статус в v1 (main).** Частично, вариант 2: `f74c8c1d` — `cli/cmd/sync/sync-core.ts:27` `export const PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])`, `:239-241` `else if (PROJECT_OWNED_ENTRIES.has(relativePath)) { status = 'preserved' }`, `:253-254` «`preserved` must NOT be written»; `cli/cmd/sync/sync.types.ts:8` — `'added' | 'updated' | 'unchanged' | 'preserved'` (обратите внимание: **`deleted` в main нет вовсе**). Тест `cli/cmd/sync/__tests__/sync-core.test.ts:223` — «preserves a project-owned knowledge.xml that differs: status preserved, never written». Манифеста хэшей и overlay в main нет — патченная директива по-прежнему перетирается как `updated`.

**Статус в v2 (RC).** Не портировано, и **хуже v1** — подтверждено кодом:

- `cli/cmd/sync/sync.types.ts:6` — `'added' | 'updated' | 'deleted' | 'unchanged'`: **`preserved` отсутствует, `deleted` добавлен**;
- зеркальное удаление: `sync-core.ts:225-244` — `scanTargetMirrorSpace(targetDir, ownedSubdirs, filtered)`, затем `if (sourcePaths.has(relativePath)) continue; entries.push({relativePath, status:'deleted'}); deps.unlink(...)`;
- разбор `scanTargetMirrorSpace`: файлы корня `ai/directives/` попадают в зеркало в нефильтрованном прогоне («Root-level files are only mirror candidates when the whole package … is being synced»), а внутри `ownedSubdirs` (`sdd-v2`, `coding`, `testing`, …) идёт `collectRecursive` — значит и `ai/directives/sdd-v2/local-*.xml` удаляется; `knowledge.xml` есть в пакете (`ls <rc>/ai/directives/` → `knowledge.xml`), идёт как `updated` и перезаписывается;
- не тронуты только неизвестные подкаталоги — они уходят в `warnings` (`:246-249`).

**Вердикт: НЕ ЗАКРЫТО** (регресс относительно main; для cloud-ios поведение хуже v1). **БЛОКЕР РЕЛИЗА v2.**

**Что требуется в v2.** (1) Порт `f74c8c1d` (`PROJECT_OWNED_ENTRIES`, статус `preserved`). (2) Манифест `ai/directives/.gennady-synced` (sha256 последнего записанного) → при расхождении диск ≠ последний-синк статус `locally-modified`: skip + listing + `--force[ <path>]`; `--dry-run` показывает потери. (3) Зеркальное удаление — только файлов из манифеста. Тесты в `cli/cmd/sync/__tests__/sync-core.test.ts`: (a) `knowledge.xml` preserved; (b) патченный `sdd-v2/x.xml` → `locally-modified`, не записан; (c) проектный файл в owned-подкаталоге без записи в манифесте не удаляется. Eval: **G2**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> `knowledge.xml` в main теперь project-owned: создаётся, если нет, и никогда не перезаписывается (статус `preserved` в выводе). Манифест с хэшами для остальных директив — следующий шаг, идея из вашего #10 переносится на `sync` один в один. В v2 это ещё не перенесено, и там sync к тому же зеркальный: `deleted` есть, `preserved` нет, файлы внутри пакетных подкаталогов (включая ваш `local-*.xml`, если положить рядом) удаляются, а `knowledge.xml` идёт как обычный `updated`. Это у нас блокер релиза v2 — переносим и `preserved`, и манифест, иначе ваш кейс с реестром повторится.

---

## Сводная таблица

| Issue | Статус в v1 (main) | Вердикт v2 | Eval | Effort | Задача плана |
|---|---|---|---|---|---|
| #9.1 path-based Task-ID / false green | исправлено (#14 `90b123e9`, #10 `62172906`) | ЧАСТИЧНО (нет `NO_TICKETS_FOUND` в `--all`; дрейф help `sdd-migrate`) | G4, G3 | S | `ISS-1` |
| #9.2 orphan-скан только TS | исправлено (#10, `check.sh:283-286`) | НЕ ЗАКРЫТО (consumers/BDD-index/`yagni` только ts/tsx/js; BDD на `DONE` неудовлетворим) | G1 | S | `ISS-2` |
| #9.3 `ai/directives/language/` | исправлено (#10, optional) | ЗАКРЫТО В V2 (по построению; `checkSpecLanguage` — узкий warn-детектор) | G4 | — | — (замка нет: нет предмета) |
| #9.4 sync-skills удаляет проектные скиллы | исправлено (#10, манифест) | НЕ ЗАКРЫТО (регресс, манифеста нет) | G2 | S | `ISS-3` · **БЛОКЕР РЕЛИЗА v2** |
| #9.5 model pins | исправлено (#14; + явное «inherit») | ЗАКРЫТО В V2 (без замка) | G3 | S | `LOCK-1` (замок-тест) |
| #9 bonus `extraGates[].when` | не исправлено | НЕ ЗАКРЫТО (стека нет) | G1 | L | `ISS-4` |
| #11 `~/.claude/skills` в директивах | частично (#14; 2 хвоста) | ЗАКРЫТО В V2 (`npx gennady`) | G2 | S | `LOCK-2` (замок-тест) |
| #13 Reopens двумя способами (closed) | закрыто (#14; тесты) | ЧАСТИЧНО (нет проверки; аудитный аксиом не собран) | G3 | M | `ISS-5` |
| #15 `### Round N` критика | часть 2 (#12: выход региона + отказ `[REOPENS]`); часть 1 нет; остаток `check.sh:372` | ЧАСТИЧНО (критик не пишет; `nextRoundNumber` по всему файлу) | G4, G3 | S | `ISS-6` |
| #16 `DIRECTIVE ACTIVATED` | не исправлено (7 скиллов; аксиом в 8 директивах) | ЗАКРЫТО В V2 (без замка) | G3 | S | `LOCK-3` (замок-тест) |
| #17 output зелёного гейта | не исправлено (есть смягчение `--json`, `:95`) | НЕ ЗАКРЫТО (receipt без output) | G1 | S | `ISS-7` |
| #19 запрет `git` vs fixture-репо | не исправлено | НЕ ЗАКРЫТО (+ два висячих аксиома; §5 не исключение) | G1, G3 | M | `ISS-8` |
| #20 `verify --wip <files>` / `--only` | не исправлено (3/3) | НЕ ЗАКРЫТО (npm-only ladder; исключение GATE_QUEUE) | G1 | L | `ISS-9` |
| #21 критик не видит конвенции | не исправлено | ЧАСТИЧНО (Vision соседей есть; `3-tasks.md` нет) | G3 | S | `ISS-10` |
| #22 провенанс в Handoff | не исправлено | ЧАСТИЧНО (verbatim Inputs; тегов нет; премиссы оркестратора не помечены) | G3 | M | `ISS-11` |
| #23 токен `correction` | не исправлено | НЕ ЗАКРЫТО (словарь не проверяется вовсе) | G3 | M | `ISS-12` |
| #24 sync перетирает локальное | частично (`f74c8c1d`, только knowledge.xml) | НЕ ЗАКРЫТО (регресс + зеркальное удаление) | G2 | M | `ISS-13` · **БЛОКЕР РЕЛИЗА v2** |

**Итого по v2:** ЗАКРЫТО В V2 4 (#9.5, #11, #16, #9.3) · ЧАСТИЧНО 5 (#9.1, #13, #15, #21, #22) · НЕ ЗАКРЫТО 8 (#9.2, #9.4, #9-bonus, #17, #19, #20, #23, #24) = 17.
**Задач плана:** 13 (`ISS-1…ISS-13`) + 3 замка-теста (`LOCK-1…LOCK-3`). **Блокеры релиза v2:** `ISS-3` (#9.4), `ISS-13` (#24).

---

## § Перекрёстные связи (общие корни)

1. **Ветка v2 отошла от main на `46c6d616` и не впитала ни одного фикса по issues akkrat** (см. §0). Прямые регрессы относительно main: #9.4 (манифест sync-skills), #24 (`preserved` knowledge.xml), #12-механика (запись в закрытый раунд → #23), #13-механика (`[REOPENS]`). Первый шаг для G2/G3 — cherry-pick `62172906`, `4a47b9e8` (адаптация bash→ts), `f74c8c1d`, assertion из `sdd-review-lifecycle-contract.test.ts:200`. Оба блокера релиза (`ISS-3`, `ISS-13`) живут здесь.
2. **«Gena is soaked in Node» в v2 сильнее, чем в v1**: нет `services/stack`, `readiness.ts:15-24` требует 8 npm-скриптов, `phase-context.ts:262` блокирует не-`setup` фазы кроме владеющих отсутствующим гейтом (`:282-285`), consumers/BDD-скан/`yagni` — только ts/tsx/js. Корень для #9.2, #9-bonus, #17, #20 (и косвенно #19 — §5 read-only snapshot + «§5 не исключение»). Один порт стек-независимого verify (main `plugins/*` + `gennady.yaml`) закрывает пласт G1.
3. **Механика vs текст**: v1 закрывал дыры скриптом (`check.sh` [LOG]/[REOPENS]/[TASKID]); в v2 `sdd-check` богаче по структуре спек, но беднее по Execution Log (нет словаря токенов, нет post-close, нет Reopens-причинности) — общий корень #13, #15-остаток, #23. Один модуль `shared/sdd/execution-log.ts` (парсер раундов/фаз/токенов, scoped по EXECUTION_LOG) закрывает три issue и чинит `nextRoundNumber`.
4. **Провенанс/контекст между агентами**: #21 (критик без конвенций) и #22 (Handoff без тегов) — обе про то, что получатель не различает «знаю / мне сказали / предположили». В v2 передача уже механизирована (`sdd-task --phase`, `sdd-extract`), поэтому исправление — грамматика + read set, а не новые процессы; но премиссы, которые оркестратор дописывает от себя, механически не исключены — только запрещены текстом.
5. **Sync как зеркало без ownership**: #9.4, #24, #11 — одна модель «пакет владеет всем target-каталогом». Манифест владения (уже есть в main для skills) — единый механизм для skills и directives.
6. **Висячие ссылки в сборке директив v2 — их две.** `AX_PERMITTED_BASH_COMMANDS` определён в kit, на него ссылаются шесть мест, но он не включён ни в один шаблон (#19); `ax-stale-after-pivot-verification.xml` тоже не включён — из-за чего пропадает единственная в RC аудитная проверка Reopens (#13). Плюс уже неверный комментарий `ai/kit/audit-halt-activation.mjs:138`. `lint-axioms.ts:4,97` проверяет только одну направленность; нужны **обе** — «referenced-but-undefined» и «defined-but-never-included-in-a-template», иначе класс ошибок «инструкция в пакете противоречит другой инструкции» (#15, #16 в v1) воспроизведётся в v2 как «инструкция ссылается на пустоту».

---

## § Снимок открытых issues (GAP-1, снято 2026-09-08)

**Дата снимка:** 2026-09-08. **Метод:** read-only `gh issue list` по `RubaXa/gennady`; **ни одной записи в GitHub не сделано** (создание/правка/закрытие issue — только оператор, см. «Политика черновиков» в шапке документа).

```
$ gh issue list --repo RubaXa/gennady --state open --limit 200 \
    --json number,title,author,createdAt,labels \
    > _raw/issues-snapshot.json
$ gh issue list --repo RubaXa/gennady --state all --limit 200 \
    --json number,title,author,createdAt,labels,state \
    > _raw/issues-snapshot-all.json
```

Артефакты: [`_raw/issues-snapshot.json`](_raw/issues-snapshot.json) (11 открытых), [`_raw/issues-snapshot-all.json`](_raw/issues-snapshot-all.json) (12 всего — 11 `OPEN` + 1 `CLOSED`).

**Открытые на дату снимка:** #24, #23, #22, #21, #20, #19, #17, #16, #15, #11, #9. **Закрытые:** #13.

**Сверка с вердиктами этого документа.**

| Issue (open) | Раздел этого документа | Вердикт v2 | Задача плана |
|---|---|---|---|
| #9 (6 подпунктов: 9.1, 9.2, 9.3, 9.4, 9.5, bonus) | `## #9` | ЧАСТИЧНО / НЕ ЗАКРЫТО / ЗАКРЫТО В V2 — все 6 подпунктов разобраны | `ISS-1`, `ISS-2`, — (9.3 без задачи, предмета нет), `ISS-3`, `LOCK-1`, `ISS-4` |
| #11 | `## #11` | ЗАКРЫТО В V2 (по построению) | `LOCK-2` |
| #15 | `## #15` | ЧАСТИЧНО | `ISS-6` |
| #16 | `## #16` | ЗАКРЫТО В V2 (без замка) | `LOCK-3` |
| #17 | `## #17` | НЕ ЗАКРЫТО | `ISS-7` |
| #19 | `## #19` | НЕ ЗАКРЫТО (с усилением) | `ISS-8` |
| #20 | `## #20` | НЕ ЗАКРЫТО | `ISS-9` |
| #21 | `## #21` | ЧАСТИЧНО | `ISS-10` |
| #22 | `## #22` | ЧАСТИЧНО | `ISS-11` |
| #23 | `## #23` | НЕ ЗАКРЫТО | `ISS-12` |
| #24 | `## #24` | НЕ ЗАКРЫТО (регресс) · **БЛОКЕР РЕЛИЗА** | `ISS-13` |

Для полноты: закрытый #13 тоже разобран (`## #13`, вердикт ЧАСТИЧНО — контрадикция снята, замка нет — задача `ISS-5`); он не входит в 11 открытых, но проверен той же сверкой.

**Итог сверки: пропущенных issue — 0.** Каждый из 11 открытых issue снимка (и закрытый #13 тоже) имеет вердикт в этом документе, приложенный к задаче плана либо к явной пометке «предмета для замка нет» (#9.3). Раздел «§ Снимок» с предварительным вердиктом «нужен разбор» **не заводится** — заводить нечего: множество разобранных issue (12, `20 §Верификация`: «Согласие 17/17» по 17 пунктам из 12 issue) покрывает множество issue снимка (12) без остатка в обе стороны.

Задача **GAP-1**: ВЫПОЛНЕНО (пачка 8, документная часть, 2026-09-08).

---

## § Верификация

**Согласие: 17/17.** Независимый верификатор (V-A4, свежие глаза, read-only, источники открыты заново, а не по указателям A4) не смог опровергнуть ни один ярлык. НЕ СОГЛАСЕН — 0, НЕ МОГУ ПРОВЕРИТЬ — 0. Статусы v1 (main): CONFIRMED 16, REFUTED в части цитаты 1 (#15, часть 2). Оператор принял все 17 вердиктов; каждый не-закрытый пункт стал задачей плана; #9.4 и #24 — блокеры релиза v2.

**Применённые правки (все обязательные из V-A4).**

- Фактические цитаты #15: убраны несуществующая функция `sdd_lib_execution_log` и «якоря `<!--SECTION:EXECUTION_LOG-->`»; вход в регион — `check.sh:557` `/^## 7\. Execution Log/`, фикс #12 — выход на любом `## ` (`:558`) + отказ `[REOPENS]` от подсчёта заголовков (`check.sh:544-556` объясняет, почему якоря не используются). `infra.directive.xml:51` / `interface.directive.xml:48` — это `AX_SPEC_LIFECYCLE` («Critic Rounds … are not part of the specification»), а не миграционная заметка.
- Переоценка в #9-bonus и #20: `phase-context.ts:262` блокирует не-`setup` фазы **кроме** владеющих отсутствующим readiness-гейтом (GATE_QUEUE-исключение `:282-285`, `shared/sdd/gate-queue.ts`).
- #23: снято «словарь тот же» — `ver` заменён CLI-владельцем `SDD_PHASE_RECEIPT`, каноническая таблица — `shared/sdd/templates.ts:1581`.
- #16: аксиом лежит в **8** директивах, не в 7 (добавлен `svelte-ui-discovery.directive.xml:172`).
- Десять сдвинутых ссылок: `_sdd-lib.sh:40` (не `:36-40`) и `:84` (не `:85`); `sdd-check.cmd.ts:503` (не `:504`); `phase-receipt.ts:15-25` (не `:16-24`); `sdd-log.types.ts:248-249` (не `:246-247`); `sync-skills-core.ts` тесты `:538-627` (не `:538-617`); `stack-config.ts:33-45` (не `:43-44`); `sdd-audit/SKILL.md:13` (не `:12`); `router.directive.xml:130` (вторая строка диапазона `:129-130`); `check.sh` live-set `:525-529` (не `:514-518`). Точечно уточнены и производные: `check.sh:193`/`:213`, `check.ts:888-901`, `sdd-check.cmd.ts:957`, `check.ts:1324-1330`, `deleteOrphan` `:192`, `critic.directive.xml:48-53`, `critic.directive.xml:57-63`, `STEP_4_HANDOFF.xml:18-33`, `execute.directive.xml:223-224`, `sync-core.ts:225-244`.
- Шесть правок в черновиках ответов: #15 (регион лога), #20 («не запустится вовсе» → есть `setup` и GATE_QUEUE-исключение), #22 («исключено» → исключён пересказ, не добавленные премиссы), #9.3 («перенесена» → аксиом удалён, вместо него узкий warn-детектор), #17 (опечатка «raннер» → «раннер»), #9.5 (усилено: в main есть явное «inherit the caller's configured model» + контрактный тест).
- Восемь пропущенных аспектов добавлены как под-пункты: третий сканер `gennady yagni` (#9.2), неудовлетворимость BDD_COVERAGE на `DONE` для Swift (#9.2), остаточная дыра `check.sh:372` (#15), второй несобранный аксиом `ax-stale-after-pivot-verification.xml` + устаревший комментарий `audit-halt-activation.mjs:138` + требование обратного линта (#19, ссылка из #13), «§5 — не исключение для фазового агента» `ax-permitted-bash-commands.xml:51-54` (#19), смягчение `verify --wip --json` `phase-execution-protocol.xml:95` (#17), дрейф help `sdd-migrate/help.ts:14` (#9.1), нормализация таксономии #11 vs #9.3 (см. §#9.3).
- Таксономия приведена к одному ярлыку на класс: «ЗАКРЫТО В V2 (по построению)»; «НЕПРИМЕНИМО» снят как отдельный вердикт. Существо вердиктов не изменилось; замки-тесты по решению оператора остаются на трёх (#9.5, #11, #16), у #9.3 предмета для замка нет.

**Репродукции (исполнены на RC `11291af5`; полные блоки — в соответствующих issue).**

```
# #9.1 — пустой scope даёт «clean» / exit 0
node --import tsx <rc>/cli/gennady.ts sdd-check --all <fixture-with-empty-specs>
→ [sdd-check] ✅ clean — 0 file(s) checked ; EXIT=0

# #15 — nextRoundNumber считает критиковские раунды
nextRoundNumber(<ticket: пустой EXECUTION_LOG + '## Critic Rounds' с Round 1, Round 2>) → 3

# #23 — самодельный токен проходит и не ловится
sdd-log <ticket> line "correction R1/P1 baseline: 186 → 185 ← recount" --phase P1 → appended
sdd-check --task <ticket>                                                        → ✅ clean
```

**Прогон тестов RC** (проверка утверждений «pass локально»):

```
$ node --import tsx --test --experimental-test-module-mocks \
    <rc>/shared/sdd/__tests__/task-id.test.ts \
    <rc>/cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts \
    <rc>/shared/sdd/__tests__/check-legacy-ticket.test.ts \
    <rc>/ai/kit/__tests__/lint-axioms.test.ts
# tests 77 · pass 77 · fail 0
```

Все названные тестовые файлы в RC существуют (`check-language.test.ts`, `check-taskid-grammar.test.ts`, `check-legacy-ticket.test.ts`, `stateless-sdd-flow-contract.test.ts`, `lint-axioms.test.ts`).

**Первоисточник.** Двухчастный исходник (Часть I — аудит A4; Часть II — отчёт верификатора V-A4 с таблицами ошибок цитат, сдвинутых ссылок, правок черновиков и § Пропущенное) сохранён verbatim: [`_raw/20-ISSUES-VERDICTS.raw.md`](_raw/20-ISSUES-VERDICTS.raw.md). Пересказ постановки каждого issue сверен с телом issue построчно — искажений не найдено ни в одном.
