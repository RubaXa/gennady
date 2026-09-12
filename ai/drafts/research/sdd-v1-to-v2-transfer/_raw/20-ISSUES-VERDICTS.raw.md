# 20 — Issues akkrat (#9…#24): вердикты v1 / v2, что требуется, черновики ответов

> Статус: **ВЕРИФИЦИРОВАНО** (V-A4, Opus, fresh eyes; согласие по всем 17 вердиктам; 3 репродукции на RC подтвердили дыры). Часть I — аудит A4; Часть II — отчёт верификатора с обязательными правками (две фактические ошибки цитат в #15, 10 сдвинутых ссылок, 8 пропущенных аспектов, 6 правок в черновиках ответов).
>
> **Политика:** черновики ответов — DRAFT, в GitHub не отправляются без явного OK оператора.
>
> **Сводка вердиктов по v2:** ЗАКРЫТО 3 (#9.5, #11, #16 — без замка-теста) · ЧАСТИЧНО 5 (#9.1, #13, #15, #21, #22) · НЕ ЗАКРЫТО 8 (#9.2, #9.4, #9-bonus, #17, #19, #20, #23, #24) · НЕПРИМЕНИМО 1 (#9.3). Корни: (1) ни один фикс main по issues не в v2 (merge-base 46c6d616) — прямые регрессы #9.4, #24, механика #12/#13; (2) v2 «пропитан Node» сильнее v1 — #9.2, #9-bonus, #17, #20; (3) журнал: v2 беднее по Execution Log — #13, #15, #23; (4) провенанс/контекст между агентами — #21, #22; (5) sync без ownership — #9.4, #24, #11; (6) висячие ссылки на аксиомы в сборке директив (`ax-permitted-bash-commands`, `ax-stale-after-pivot-verification`) — #19.

---

# Часть I — Аудит (A4)

# A4 — Аудит GitHub-issues akkrat против SDD v1 (main 8bb38477) и SDD v2 (codex/sdd-v2-rc52-followup @ 11291af5)

Read-only аудит. Источники: `gh issue view`, `gh pr view`, `git log/grep` по двум чекаутам.
- **v1 (main)**: `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`
- **v2 (RC)**: `/private/tmp/claude-503/.../scratchpad/rc-v6`

Легенда вердиктов v2: ЗАКРЫТО В V2 / ЧАСТИЧНО / НЕ ЗАКРЫТО / НЕПРИМЕНИМО (v1-концепт отсутствует И потребность исчезла).
Eval-группы: G1 non-Node stack execute+verify · G2 sync/ownership · G3 execution-log/conventions integrity execute→audit→critic · G4 V1→V2 миграция на реальном снапшоте.

Контекст: все issue — от akkrat, полный цикл SDD v1 на Swift/iOS-проекте cloud-ios, `gennady@0.8.4-next.10`, `stack.use: [anystack]` + 3 extraGates (swiftlint / xcodebuild / xctest). Слитые PR akkrat: #10 (portability), #12 (log integrity); PR RubaXa: #8 (critic convergence), #14 (adaptive execution), #18 (rule surfaces). PR #7 (yaml-verify, draft) закрыт без merge; PR #5 — stack plugin system + `gennady verify`.

---

## 0. Структурный факт, определяющий все вердикты по v2

`git merge-base <v2 HEAD 11291af5> <main 8bb38477>` = **46c6d616**. Ни один из коммитов main, закрывших issues akkrat, не является предком v2:
`62172906` (#10), `4a47b9e8` (#12), `90b123e9` (#14), `d6065c36` (#8), `2a0282da` (`verify --wip`), `f74c8c1d` (knowledge.xml project-owned) — все «NOT in v2».
Следствие: всё, что v1 закрыл после 46c6d616, в v2 либо переизобретено независимо, либо отсутствует. Кроме того, в v2 **нет** `services/stack/`, `cli/cmd/verify`, `gennady.yaml`/`anystack`/`extraGates` (ни одного упоминания в `.ts`; это же зафиксировано самим v2 в `ai/flow-eval/docs/roundtrip-wall3-assessment.md:18-30`). Вместо `gennady verify` — `cli/cmd/sdd-verify`, который исполняет **npm-скрипты** из `package.json` (`shared/sdd/readiness.ts:15` `REQUIRED_SCRIPTS`, `sdd-verify.cmd.ts:31-36,226`) плюс §5-строки тикета verbatim (`sdd-verify/phase-run.ts:341`).

Соответствия v1 ↔ v2, использованные ниже:
- `check.sh`/`scan.sh`/`_sdd-lib.sh` ↔ `cli/cmd/sdd-check/sdd-check.cmd.ts` + `shared/sdd/check.ts`, `task-id.ts`, `ticket.ts`
- `verify.sh` + `gennady verify` ↔ `cli/cmd/sdd-verify/*` + `shared/sdd/phase-verification-plan.ts`, `readiness.ts`
- `critic.directive.xml`/`critic-protocol.xml` ↔ `ai/directives/sdd-v2/critic.directive.xml`, `critic-protocol.directive.xml` (из `ai/kit/templates/sdd-v2/*.hbs`)
- Execution Log ↔ `cli/cmd/sdd-log/*` + `shared/sdd/check.ts` (SDD_EXECUTION_LOG_*), `formats/task-ticket-structure.xml`
- `HANDOFF_FORMAT` ↔ `phase-execution-protocol/steps/STEP_4_HANDOFF.xml` + `sdd-log.types.ts:246` (регэксп `complete`)
- `AX_PERMITTED_BASH_COMMANDS` ↔ `ai/kit/axiom/process/ax-permitted-bash-commands.xml`
- `sync`/`sync-skills` ↔ `cli/cmd/sync/sync-core.ts`, `cli/cmd/sync-skills/sync-skills-core.ts`, `shared/common/sync/path-normalizer.ts`

---

## #9 — SDD tooling: 5 issues from running the full loop on a Swift project (OPEN)

### #9.1 — `sdd scan`/`sdd check` не видят path-based Task-ID → ложный «зелёный»

**Проблема.** `scaffold.directive.xml` предписывает `TSK-{PREFIX}-{NNN}`, а `scan.sh`/`check.sh`/`_sdd-lib.sh` знают только `TSK-[0-9]+` и глоб `*.task-*.md`. На корректно заскаффолженном scope `tasks_total=0`, `findings=0` — читается как «чисто». Предложение: принимать обе формы ID и оба имени файла; пустой scope не должен быть «зелёным».

**Статус в v1 (main).** Исправлено двумя PR: `90b123e9` (#14) — Meta-based discovery по `*.md` и грамматика `TSK-([A-Z][A-Z0-9]*-)?[0-9]+`; `62172906` (#10) — строгая грамматика `SDD_TASK_ID_RE='TSK-([A-Z]+-[0-9]{3}|[0-9]+)'` (`ai/skills/sdd-execute/scripts/_sdd-lib.sh:36-40`, `:85`), `NO_TICKETS_FOUND` exit 2 и `TICKET_ID_UNREADABLE` (`check.sh:49-50`, `:185-220`), whole-token парсинг `@tasks`/tracker (`check.sh:289-298`, `scan.sh:195-227,282-297`). Тесты: `scripts/__tests__/sdd-task-id.test.ts` (:93 discovery, :144/:291 «no tickets → not clean», :182 malformed, :192 absent, :203 unreadable, :217-267 `TSK-IB-0012`).

**Статус в v2 (RC).** Другая грамматика: `<ACR>-<slug>` (`shared/sdd/task-id.ts:16`, `SLUG_MAX_LEN=8` :19), обнаружение тикетов по содержимому Meta, не по имени файла (`ticket.ts:128` регэксп `[A-Za-z0-9][\w-]*` — принимает и `TSK-IB-001`), `SDD_TASK_ID_GRAMMAR` только для v2-тикетов под `specs/` (`sdd-check.cmd.ts:963,1374`, `check.ts:895-901`), legacy-тикеты видны как `SDD_LEGACY_TICKET_UNANCHORED` warn (`check.ts:1330`; тесты `check-legacy-ticket.test.ts:74-89`). Миграция: `migration-plan.ts:261-262` (discovery by content, явно упомянут `<scope>.IB-NN.md`), `id-replace.ts:176` (word-boundary). Тесты `task-id.test.ts` (25/25 pass локально), `check-taskid-grammar.test.ts`.
**Дыра сохраняется:** `sdd-check --all` при нуле тикетов молча возвращает 0 findings / exit 0 — обход `mdFiles` в `sdd-check.cmd.ts:1275-1295`, `ticketRefs` (:1285) никогда не проверяется на пустоту; аналога `NO_TICKETS_FOUND` нет (grep `NO_TICKETS|checked nothing` = 0).
**Вердикт: ЧАСТИЧНО.**

**Что требуется в v2.** В `sdd-check.cmd.ts` после обхода: `ticketRefs.length === 0 && (all || changed)` → finding `SDD_NO_TICKETS_FOUND` severity error, exit 2 (и аналог для `specs/` без спек). Тест в `shared/sdd/__tests__/check.test.ts`: пустой `specs/` → exit ≠ 0. Eval: **G4** (снапшот cloud-ios с `TSK-IB-001`), **G3**.

**Черновик ответа akkrat (DRAFT, не отправляется).**
> Спасибо, это закрыто в main двумя PR: #14 (Meta-based discovery, обе формы ID) и вашим #10 (строгая грамматика, `NO_TICKETS_FOUND`, `TICKET_ID_UNREADABLE`, whole-token парсинг). В v2-ветке грамматика меняется на `<ACR>-<slug>`, тикеты ищутся по Meta, а не по имени файла; `TSK-IB-001` читается как legacy и мигрируется через `sdd-migrate ids`. Одну вещь мы у себя нашли благодаря вашему кейсу и добавим в v2: `sdd-check --all` над пустым scope пока не даёт `NO_TICKETS_FOUND`-аналога — ставим в очередь.

### #9.2 — Orphan-скан `@tasks` смотрит только TS-семейство

**Проблема.** `check.sh` grep с `--include='*.ts' *.js *.sh *.go` — на Swift/ObjC проверка структурно молчит и выглядит как PASS. Предложение: добавить расширения или сделать список конфигурируемым.

**Статус в v1 (main).** Исправлено в `62172906` (#10): `ai/skills/sdd-execute/scripts/check.sh:283-286` (+ `.swift .m .mm .h .kt .java .py .rb .rs .cs .php`). Локирующего теста именно на список расширений не найдено (`sdd-task-id.test.ts:280` покрывает только логику orphan).

**Статус в v2 (RC).** Понятия orphan-`@tasks` нет; ближайшие механизмы — `SDD_CONSUMERS_UNRESOLVED` (grep `--include=*.ts,*.tsx,*.js`, `sdd-check.cmd.ts:699-701`) и индекс тест-файлов для BDD_COVERAGE `/\.(test|spec)\.(ts|tsx|js)$/` (`sdd-check.cmd.ts:504`). На Swift-проекте оба структурно слепы (XCTest-файлы не видны → покрытие «не найдено» либо не проверяется). Тот же класс ошибки.
**Вердикт: НЕ ЗАКРЫТО.**

**Что требуется в v2.** Единый список исходных расширений в одном месте (`shared/sdd/source-extensions.ts`), расширяемый проектом (например, секция в `gennady.yaml` или в `specs/3-tasks.md` conventions); использовать в consumers-grep и в `getTestFileIndex`. Тест: fixture с `Foo.swift` + `FooTests.swift` → consumer резолвится, BDD-имена находятся. Eval: **G1**.

**Черновик ответа akkrat (DRAFT).**
> В main расширения добавлены вашим #10 (`check.sh:283-286`). В v2 `@tasks`-orphan как отдельной проверки нет, но родственные проверки (`@consumers`, покрытие BDD-сценариев тест-файлами) тоже сканируют только `*.ts/*.tsx/*.js` — на Swift они молчат. Планируем один конфигурируемый список расширений для всех сканов; ваш кейс со `.swift/.m/.mm/.h` берём как фикстуру.

### #9.3 — `ai/directives/language/` упоминается, но не поставляется

**Проблема.** `AX_LANG_PASS_ON_WRITE` требует прочитать `ai/directives/language/*`, которых нет в пакете; «never skipped» → первый же spec write стопорится; локальный патч затирается sync.

**Статус в v1 (main).** Исправлено в `62172906` (#10): `discovery.directive.xml:328-332` и `module-decomposition.directive.xml:333` — каталог объявлен optional, калибровка падает на `AX_OPERATOR_DIALOGUE_STYLE`. Каталога в main по-прежнему нет. Локирующего теста нет.

**Статус в v2 (RC).** Ни `ai/directives/language/`, ни `AX_LANG_PASS_ON_WRITE`, ни `lang-lint` в `ai/directives/sdd-v2` и `ai/kit/templates` (grep = 0). Языковая проверка спеки выполняется механически: `checkSpecLanguage` (`sdd-check.cmd.ts:1373`, тест `check-language.test.ts`).
**Вердикт: НЕПРИМЕНИМО** (v1-концепт отсутствует; потребность закрыта другим механизмом).

**Что требуется в v2.** Ничего по существу; при миграции v1→v2 (`migration-v1-v2.directive.xml`) убедиться, что локальный патч проекта в `discovery.directive.xml` не переносится. Eval: **G4** (проверка, что мигрированный проект не тащит ссылку).

**Черновик ответа akkrat (DRAFT).**
> В main ссылка стала optional (#10). В v2 этого аксиома нет вообще: проверка языка спеки перенесена в `sdd-check --spec` (механическая, без внешних файлов), так что стопориться нечему.

### #9.4 — `sync-skills` удаляет проектные скиллы

**Проблема.** `gennady sync-skills` удалил `generate-codeowners/` и `write-uitests/` — не пакетные скиллы — без подтверждения. Предложение: удалять только то, что пакет сам установил (манифест) или `--prune` opt-in.

**Статус в v1 (main).** Исправлено в `62172906` (#10): манифест `.claude/skills/.gennady-synced` (`cli/cmd/sync-skills/sync-skills-core.ts:32`), удаляются только записанные в манифест. Тесты `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts:377` («leaves a project-authored skill alone»), `:391`, `:538-617` (merge/failed prune/first run).

**Статус в v2 (RC).** Фикс не портирован: `collectAndCompareSkills` считает orphan-ами **все** каталоги target, которых нет в source, и удаляет их (`sync-skills-core.ts:396-404`, `deleteOrphan` :185-268); манифеста нет (grep `gennady-synced` = 0); тесты фиксируют текущее поведение («detects orphan skills…» `:244`, 30/30 pass локально). Проектные скиллы cloud-ios будут удалены снова.
**Вердикт: НЕ ЗАКРЫТО** (регресс относительно main).

**Что требуется в v2.** Портировать коммиты манифеста из #10 (`fix(sync-skills): prune only the skills a previous sync installed` + `keep manifest ownership…`) в `cli/cmd/sync-skills/sync-skills-core.ts`; перенести тесты `:377,:391,:538-617`. Eval: **G2**. Effort S (cherry-pick с конфликтами в типах).

**Черновик ответа akkrat (DRAFT).**
> В main это ваш #10 — манифест `.claude/skills/.gennady-synced`, удаляется только своё. В v2-ветке фикс ещё не портирован (ветка отошла от main раньше #10), там `sync-skills` до сих пор удаляет любые чужие каталоги. Переносим манифест и ваши тесты в v2 до релиза.

### #9.5 — Захардкоженные `model:` в dispatch-промптах

**Проблема.** `model: "sonnet"`/`"haiku"` в `sdd-execute`, `sdd-execute-batch`, `critic.directive.xml`; проект, желающий наследовать модель, вычищает их после каждого sync. Предложение: убрать пин или вынести в конфиг.

**Статус в v1 (main).** Исправлено в `90b123e9` (#14): `ai/skills/sdd-execute/SKILL.md:79,134` («inherit the caller's configured model»), пинов в `critic.directive.xml` нет. Тест: `scripts/__tests__/sdd-review-lifecycle-contract.test.ts:187-200` (`doesNotMatch /model: "(?:haiku|sonnet|opus)"/`).

**Статус в v2 (RC).** Ни одного `model:`/`"sonnet"`/`"haiku"` в `ai/skills`, `ai/directives/sdd-v2`, `ai/kit/templates/sdd-v2` (grep = 0); dispatch в `execute.directive.xml:217-237` не задаёт модель. Локирующего теста в v2 нет.
**Вердикт: ЗАКРЫТО В V2.**

**Что требуется в v2.** Перенести assertion из `sdd-review-lifecycle-contract.test.ts:200` в `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` (или новый contract-тест по `ai/skills/**` и rendered directives). Eval: **G3**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> Закрыто в main (#14): модель наследуется от вызывающего агента, есть контрактный тест. В v2 пинов нет ни в скиллах, ни в директивах.

### #9 (bonus) — `extraGates[].when`: anystack-гейты не умеют объявлять файловую область

**Проблема.** Фаза, правящая только `CODEOWNERS`, тянет `xcodebuild` и весь тест-сьют, потому что `verify <files>` не знает, какие гейты файлы вообще могут задеть. Предложение: опциональный `when: [<glob>…]` на гейт; `verify <files>` сам вычисляет `--only`.

**Статус в v1 (main).** Не исправлено: `services/stack/stack-config.ts:43-44` — закрытый список ключей CmdSpec без `when`/`paths`; `--only` в `cli/cmd/verify/verify.cmd.ts:69-71` — точное совпадение.

**Статус в v2 (RC).** Стек-системы нет вовсе (см. §0): нет `gennady.yaml`, `anystack`, `extraGates`; `sdd-verify` знает только npm-скрипты и §5-строки тикета. Для Swift-проекта это не «гейты не сужаются», а «гейтов нет»: `readiness.ts:15` требует 8 npm-скриптов, `phase-context.ts:262` блокирует все не-`setup` фазы при `!executionReady`.
**Вердикт: НЕ ЗАКРЫТО** (потребность стала острее).

**Что требуется в v2.** Стек-независимый план гейтов: либо порт `plugins/{node,golang,anystack}` + `stack-config` из main в `phase-verification-plan.ts`/`readiness.ts`, либо минимальная декларация `verify.gates[]` в `gennady.yaml` с `when: [globs]` (дух PR #7). Тест: fixture без `package.json`, с `gennady.yaml` (swiftlint-заглушка) → `sdd-verify --task … --phase …` строит план и пишет receipt. Eval: **G1**. Effort L.

**Черновик ответа akkrat (DRAFT).**
> `when` на гейте в main пока нет. В v2 ситуация другая: стек-плагины и `gennady.yaml` туда ещё не перенесены, `sdd-verify` работает от `package.json`. Перенос стек-независимой верификации в v2 — отдельная работа, и файловая область гейта войдёт в её спецификацию; ваш cloud-ios `gennady.yaml` — эталонная фикстура.

---

## #11 — Директивы зовут `~/.claude/skills/…`, а `sync-skills` ставит в `<cwd>/.claude/skills/` (OPEN)

**Проблема.** Восемь мест в `audit/discovery/phase-execution-protocol/module-decomposition` вызывают `~/.claude/skills/sdd-execute/scripts/sdd` (домашний каталог), тогда как `sync-skills.cmd.ts:97` ставит скиллы в проект, а `SYNC_PATH_RULES` (в отличие от `SYNC_SKILLS_PATH_RULES`) не содержит `RULE_SKILLS_TILDE`. Предложение (автор склоняется к варианту 2): правило нормализации `~/.claude/skills/` → `.claude/skills/` для директив.

**Статус в v1 (main).** Частично: `90b123e9` (#14) заменил вызовы в `audit.directive.xml`/`phase-execution-protocol.xml` на плейсхолдер `<sdd-path>`, который оркестратор подставляет абсолютным путём (`audit.directive.xml:284,410-443`, `sdd-execute/SKILL.md:17,56,95`). Остались два: `discovery.directive.xml:614` и `module-decomposition.directive.xml:661` (`~/.claude/skills/sdd-execute/scripts/…`). Правило в `SYNC_PATH_RULES` не добавлено (`shared/common/sync/path-normalizer.ts:84-93`). Тест деплой-поверхности есть (`scripts/__tests__/deployed-surface.test.ts` + golden, `7d48149d`), но тильду он не ловит (golden содержит 0 таких строк только потому, что аудит-директиву переписали).

**Статус в v2 (RC).** `~/.claude/skills` в `ai/directives`, `ai/skills`, `ai/kit` — 0 вхождений. Все вызовы инструментов — `npx gennady sdd-*` (`ai/skills/*/SKILL.md`, `<ToolCall>` в директивах), т.е. путь к скиллам вообще не нужен; `sync-skills` по-прежнему проектный.
**Вердикт: ЗАКРЫТО В V2** (по построению).

**Что требуется в v2.** Замок: contract-тест по `ai/**` (rendered directives + skills) — `doesNotMatch(/~\/\.claude\//)` и `doesNotMatch(/\.claude\/skills\/sdd-execute\/scripts/)`. Eval: **G2**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> В main после #14 оркестратор передаёт `<sdd-path>` явно, и почти все тильды ушли; два хвоста в `discovery`/`module-decomposition` ещё стоят — поправим. В v2 директивы вызывают инструменты только как `npx gennady sdd-*`, пути к скиллам в тексте нет вовсе. Спасибо за честную пометку «латентно, не инцидент» — так и оценили.

---

## #13 — `Reopens` определён двумя способами (CLOSED)

**Проблема.** `audit.directive.xml:404` требует `Reopens = Round headers − 1`, `AX_REOPEN_TICKET_FORMAT` подразумевает «только аудит-раунды»; раунды открываются и по resume-after-blocker и по `--new-audit-session`. Два аудита подряд требовали 1 и 2 на одном тикете. Предложение (автор: вариант 3) — закрытый словарь причин в заголовке раунда.

**Статус в v1 (main).** Закрыто RubaXa комментарием: `90b123e9` (#14) сделал Reopens evidence-driven — `[REOPENS]` в `check.sh:347-420` считает `@audit … triggered-reopen=Round-N` записи и двустороннюю причинность, `audit.directive.xml:511,697` («consume [REOPENS], do not hand-count»); #12 удалил свой конкурирующий producer. Тесты: `scripts/__tests__/sdd-check-log.test.ts:230` («counts only audit-triggered reopens»), `:238`, `:319-341` (causation, PENDING).

**Статус в v2 (RC).** Поле `Reopens` есть в шаблонах (`formats/task-ticket-structure.xml:36`, `scaffold.directive.xml:181`, `formats/module-tasks-index.xml:12`), обновляется reconcile-директивой вручную (`reconcile.directive.xml:113,194,250`); `formats/audit-round.xml` несёт `triggered-reopen=<Round-M+1|none>`. Но: формулы «Round headers − 1» нет (двойного определения нет) **и** механической проверки нет — `Reopens` не встречается в `shared/sdd/check.ts`, `sdd-log`, `audit.directive.xml`. Контрадикция снята, замок отсутствует.
**Вердикт: ЧАСТИЧНО.**

**Что требуется в v2.** Портировать причинную проверку в `check.ts` как `SDD_REOPENS_MISMATCH` (Meta `Reopens` vs число `@audit … triggered-reopen=Round-N` в `## Audit Rounds`, + PENDING когда объявленный Round ещё не создан); `sdd-log round` с причиной из закрытого словаря (`initial | fix: F-NNN | resume | new-audit-session`) — словарь уже подсказан в `sdd-log.types.ts:86`. Тест по образцу `sdd-check-log.test.ts:230-341`. Eval: **G3**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> Как и написано при закрытии: источник истины один — #14, счётчик идёт от `@audit … triggered-reopen`, не от числа заголовков. В v2 формулы «Round headers − 1» нет, но и механическая проверка Meta↔`@audit` пока не перенесена — переносим вместе со словарём причин раунда, который вы предлагали третьим вариантом.

---

## #15 — `critic.directive.xml` пишет `### Round N` в тикет и коллизирует с Execution Log (OPEN)

**Проблема.** `## Critic Rounds` / `### Round N — YYYY-MM-DD` в том же файле, что и `### Round N — <date>, <reason>` Execution Log; `[REOPENS]` считал `grep -c '^### Round '` по всему файлу → `MISSING` на никогда не переоткрытом тикете. Две части: (1) namespace заголовка — предложено `### Critic Round N`; (2) счётчик должен быть ограничен регионом Execution Log.

**Статус в v1 (main).** Часть 2 закрыта `4a47b9e8` (#12): единое правило региона `sdd_lib_execution_log` (якоря `<!--SECTION:EXECUTION_LOG-->`, либо `## N. Execution Log`, выход на любом `## `), тесты `sdd-check-log.test.ts:507-535` («leaves the critic section out of the log parse», «attributes a finding to its execution round, not to an intervening critic round»). Часть 1 **не исправлена**: `ai/directives/sdd/critic.directive.xml:167-169` по-прежнему `## Critic Rounds` → `### Round N — YYYY-MM-DD`.

**Статус в v2 (RC).** Критик ничего не пишет: `critic.directive.xml:57-62` STEP_3_REPORT — «Never edit, never persist a round journal»; `## Critic Rounds` в sdd-v2 упоминается только как то, что при миграции «остаётся в v1-формате» (`infra.directive.xml:51`, `interface.directive.xml:48`). Аудит пишет `### Audit Round N` (`formats/audit-round.xml`) — другое пространство имён. Коллизия для новых тикетов невозможна.
**Остаток:** `nextRoundNumber` в `cli/cmd/sdd-log/sdd-log.types.ts:76-79` считает `^### Round N` по **всему файлу**, не по секции EXECUTION_LOG → мигрированный v1-тикет с `## Critic Rounds` и `### Round 1 — …` внутри даст следующий раунд с номером +1.
**Вердикт: ЧАСТИЧНО** (закрыто для новых тикетов; остаток на миграции).

**Что требуется в v2.** `nextRoundNumber` считать внутри `extractSection(content,'EXECUTION_LOG')` (аналогично `sdd-log.cmd.ts:435` уже имеет `content` под рукой); тест в `cli/cmd/sdd-log/__tests__`: тикет с `## Critic Rounds` + `### Round 3` вне лога → следующий execution-round = 2. В `migration-v1-v2.directive.xml`/`sdd-migrate move` — переименовать legacy `### Round N` внутри `## Critic Rounds` в `### Critic Round N`. Eval: **G4**, **G3**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> Счётчик в main ограничен регионом лога — это ваш #12, спасибо. Заголовок `### Round N` у критика в main ещё не переименован. В v2 критик не пишет в артефакт вообще, коллизии нет; единственный хвост — `sdd-log round` нумерует раунды по всему файлу, что на мигрированном v1-тикете с `## Critic Rounds` даст сдвиг. Сужаем до секции лога и добавляем шаг в миграцию.

---

## #16 — Девять скиллов велят объявить `DIRECTIVE ACTIVATED`, который директива запрещает (OPEN)

**Проблема.** `Announce: 🔒 DIRECTIVE ACTIVATED: Sdd…` в SKILL.md; `AX_NO_PROCESS_NARRATION` в семи директивах называет ровно эту строку первым примером запрещённого. В dispatch-шаблоне `sdd-execute` каждый phase-агент встречает противоречие заново. Предложение: убрать announce или заменить на не-запрещённую форму, единообразно.

**Статус в v1 (main).** Не исправлено: `Announce: … DIRECTIVE ACTIVATED` в `ai/skills/{sdd-continue,sdd-discover,sdd-fix,sdd-infra,sdd-setup,sdd-scaffold,sdd-module-decomposition}/SKILL.md:10-12` (7 скиллов; execute/execute-batch переписаны #14 без баннера); `No «DIRECTIVE ACTIVATED»` — в 7 директивах `ai/directives/sdd/*.xml`. `git log -S'DIRECTIVE ACTIVATED' 46c6d616..main` — только #14, без правки этих скиллов.

**Статус в v2 (RC).** В `ai/skills/*/SKILL.md` нет `Announce`/`DIRECTIVE ACTIVATED` (grep = 0); скиллы — «thin directive-loaders» без баннера; `sdd-audit/SKILL.md:12` прямо: «Do not narrate directive activation»; аксиом сохранён в `router.directive.xml:129-130`.
**Вердикт: ЗАКРЫТО В V2.**

**Что требуется в v2.** Замок: contract-тест по `ai/skills/**/SKILL.md` и rendered `ai/directives/sdd-v2/**` — `doesNotMatch(/DIRECTIVE ACTIVATED/)` в скиллах и dispatch-шаблонах. Eval: **G3**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> В main баннер из семи скиллов ещё не убран — уберём (вариант 1: активация уходит в service line). В v2 скиллы баннера не печатают, `sdd-audit` явно запрещает нарратив активации; добавим контрактный тест, чтобы строка не вернулась.

---

## #17 — Вывод прошедшего гейта отбрасывается; сузивший область гейт не может сказать, что он прогнал (OPEN)

**Проблема.** `gate-runner.ts executeGate` на `pass` даёт `output: ""`; `GateResult.output` «retained only for non-passing gates». Гейт `unit-tests`, сужающий прогон по impact-set, печатает `[gate] сужено: …`/`[impact] не прогоняются: …` в stderr — на зелёном прогоне это исчезает; «tests passed» о полном и об одном бандле выглядят одинаково. Предложение: `showOutputOnPass`, либо `[gate]`-префикс, переживающий verdict, либо `--full-output` сохраняет output на pass.

**Статус в v1 (main).** Не исправлено: `services/stack/gate-runner.ts:331,335` (`output: ''` в обеих pass-ветках), `services/stack/stack.types.ts:186`; `--full-output` (`cli/cmd/verify/verify.cmd.ts:90,364`) влияет только на truncation в `--json`.

**Статус в v2 (RC).** `gennady verify`/gate-runner отсутствуют (§0). `sdd-verify`: на успехе — одна строка на шаг (`cli/cmd/sdd-verify/help.ts:85-90`), вывод печатается только у упавших шагов (`phase-run.ts:366-373`, help.ts:91); receipt хранит `gate/role/command/exitCode` без output (`shared/sdd/phase-receipt.ts:16-24`). Тот же класс: зелёный §5-гейт `xcodebuild test -only-testing:…` не может сообщить, что прогнал.
**Вердикт: НЕ ЗАКРЫТО.**

**Что требуется в v2.** В `PhaseReceiptCommand` добавить `notes: string[]` — строки stdout/stderr с префиксом `[gate]` (или `[verify]`), сохраняемые независимо от статуса; печатать их в success-summary. Тест в `cli/cmd/sdd-verify/__tests__`: verbatimRunner возвращает exit 0 + `[gate] сужено: A,B` → receipt.commands[i].notes содержит строку, summary печатает её. Eval: **G1**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> Согласны с постановкой: «прошёл» без «что именно» — слабый вердикт. В main пока не менялось. В v2 raннер другой (`sdd-verify` + receipt), но эффект тот же — вывод зелёного шага не сохраняется. Планируем конвенцию `[gate]`-префикса: такие строки попадают в receipt и в summary независимо от статуса; это ближе к вашему второму варианту.

---

## #19 — Протокол фазы запрещает любой `git`, а фазам-гейтам нужны throwaway-репозитории (OPEN)

**Проблема.** `AX_PERMITTED_BASH_COMMANDS`/`AX_NARROW_RECON` запрещают `git` целиком; фазы, тестирующие guard-скрипты/lint-гейты/CI-шаги, не могут ничего доказать без `mktemp -d && git init` вне дерева. Фазы «нарушали и раскрывали», аудит пропускал. Предложение: ограничить запрет рабочим деревом проекта, разрешить fixture-репозиторий вне дерева (создан и удалён внутри фазы, путь в `ver`), опционально `git status --porcelain -- <Target Files>`.

**Статус в v1 (main).** Не исправлено: `ai/directives/sdd/phase-execution-protocol.xml:51` (AX_NARROW_RECON: «any other git operation»), `:97` («`git` ANY subcommand»), `:99` rationale.

**Статус в v2 (RC).** `ai/kit/axiom/process/ax-permitted-bash-commands.xml`: `git`/`gh` **чтения** разрешены только когда шаг директивы «names a real gap» (новые коммиты, история файла), иначе «off the table»; mutating git — только шагу publish/commit; **временные файлы только в `.claude/tmp/` внутри проекта, `/tmp` и `$TMPDIR` закрыты**, «no bash command in this list reaches outside the project root». Т.е. fixture через `mktemp -d` запрещён дважды (git + вне корня), а `git init` внутри `.claude/tmp/` — вложенный репозиторий в рабочем дереве, чего аксиом тоже не предусматривает. Дополнительно: аксиом **не собран** ни в одну директиву — `ax-permitted-bash-commands` отсутствует в `ai/kit/templates/**` и `assembly-manifest.json` (grep = 0), хотя на него ссылаются `phase-execution-protocol/steps/STEP_3_VERIFY.xml:28`, `execute.directive.xml:53`, `audit/steps/STEP_1_MECHANICAL.xml:78` — висячая ссылка; `ai/kit/lint-axioms.ts` ловит неиспользуемые определения, но не неразрешённые ссылки.
**Вердикт: НЕ ЗАКРЫТО.**

**Что требуется в v2.** (1) Включить `{{> "axiom/process/ax-permitted-bash-commands"}}` в `phase-execution-protocol.directive.hbs`; добавить в `ai/kit/lint-axioms.ts` проверку «referenced-but-undefined» + тест в `ai/kit/__tests__/lint-axioms.test.ts`. (2) В аксиом — явное исключение: `git init/add/commit` внутри `.claude/tmp/<fixture>/` (нет `.git` рабочего дерева; путь в `ver`/`decisions`), удаляется в фазе; `sdd-verify` snapshot (`phase-run.ts:326-361`, help.ts «Workspace snapshots… exclude .git metadata») должен игнорировать `.claude/tmp/**`. (3) Разрешить read-only `git status --porcelain -- <Target Files>`. Тест: фаза-фикстура kind=`test` с `§5: bash scripts/guard.sh` над `.claude/tmp/repo` проходит `sdd-verify` без `§5 verification must be read-only`. Eval: **G1**, **G3**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> Пример с TSK-IB-005 убедительный: правило «как написано» и «как применяется» разошлись. В main текст пока прежний. В v2 аксиом переписан (git-чтения допустимы при названном пробеле), но fixture-репозиторий по-прежнему не предусмотрен, а scratch разрешён только в `.claude/tmp/` внутри проекта. Планируем именованное исключение: throwaway-репозиторий в `.claude/tmp/<fixture>`, создаётся и удаляется в фазе, путь в `ver`. Плюс нашли у себя, что этот аксиом в v2 не собирается в директиву — чиним сборку.

---

## #20 — `sdd verify --wip <target-files>` не сужает гейты; `--only` не умеет назвать новый гейт (OPEN)

**Проблема.** (1) `verify.sh:90` передаёт файлы как positional targets `gennady verify`, не как фильтр — с anystack бегут все extraGates; (2) `--only=<gate>` сверяет id целиком — фаза, добавляющая гейт, не может его прогнать; (3) шаблон говорит `sdd verify`, введя двумя строками выше `<SDD_PATH>`. 27 из 96 dispatch-промптов несли ручное предупреждение. Предложение: `<SDD_PATH> verify --wip --only=<гейты из §5 фазы>`; `verify.sh` — либо файлы→фильтр (нужен `paths:` на гейт), либо отказ с сообщением; `--only` по префиксу/глобу с печатью в `--plan`.

**Статус в v1 (main).** Не исправлено по всем трём пунктам: `ai/skills/sdd-execute/scripts/verify.sh:90` (`exec gennady verify "$@"`); `cli/cmd/verify/verify.cmd.ts:69-71` `selectorMatches` — строгое равенство; `ai/skills/sdd-execute/SKILL.md:98` — «`sdd verify --wip <target-files>`» при `<SDD_PATH>` в :95, тогда как директива `phase-execution-protocol.xml:90` уже пишет `<sdd-path> verify --wip`.

**Статус в v2 (RC).** `sdd-verify --task <ticket> --phase <P>` (`sdd-verify/help.ts:14`): профиль и точные Target Files выводятся из тикета CLI (`phase-context.ts:35-42,169-183`), `--only` нет, лестница — npm-скрипты на весь проект, сужение по файлам только для repair-адаптеров (format:fix/lint:fix), §5-строки бегут verbatim все применимые (`phase-run.ts:341`). Пункт (3) снят (единая команда `npx gennady sdd-verify`). Но на Swift-проекте: `readiness.ts:15` `REQUIRED_SCRIPTS` (8 npm-скриптов) → `executionReady=false` → `phase-context.ts:262` блокирует все не-`setup` фазы; недостающий скрипт → `status:'missing'`, exit 1 (`sdd-verify.cmd.ts:508-520`). «Гейт стоит 3 часа» превратилось в «гейта нет».
**Вердикт: НЕ ЗАКРЫТО.**

**Что требуется в v2.** См. #9-bonus: стек-независимый план гейтов в `shared/sdd/phase-verification-plan.ts` + `readiness.ts` (источник — `gennady.yaml`, а не `package.json`), с `when: [globs]` на гейт и автоматическим сужением по Target Files фазы; `--plan` печатает выбранный набор. Тест: Swift-fixture (`gennady.yaml` c 3 гейтами, фаза с Target Files `CODEOWNERS`) → в плане только гейты без `when` или с совпавшим glob. Eval: **G1**. Effort L (общий с #9-bonus).

**Черновик ответа akkrat (DRAFT).**
> По main всё три пункта верны и открыты; расхождение `sdd`/`<SDD_PATH>` в шаблоне поправим сразу. В v2 команда одна (`sdd-verify --task --phase`) и файлы фаза не передаёт — CLI берёт их из тикета, так что пункт 3 исчезает. Но стек-плагины в v2 ещё не перенесены, лестница npm-ориентирована, и на Swift-проекте она сейчас не запустится вовсе. Перенос стек-независимого verify с файловой областью гейта — приоритет G1 у нас; ваши 27 предупреждений в промптах — лучшее доказательство, что это должно жить в конфиге гейта.

---

## #21 — Изолированный критик не видит конвенции scope (`tasks/README.md`) и переоткрывает решённое (OPEN)

**Проблема.** `AX_ISOLATION`: только артефакт + parent spec. Verification Levels, таксономия `[contract]`, Cascade Table, D-00x живут в `tasks/README.md`/`tasks/<scope>/README.md` — критик их не видит, каждый проход даёт ровно одно отклонённое finding этого класса; оркестратор вырастил преамбулу «settled conventions» (18 dispatch). Цена — 100–130K токенов на раунд. Предложение: добавить в read set секции конвенций, либо обязательный блок `Settled conventions:` в dispatch, заполняемый механически.

**Статус в v1 (main).** Не исправлено: `ai/directives/sdd/critic-protocol.xml:10` («Only artifact + parent spec. No other files»), `critic.directive.xml:10` (AX_ISOLATION_SIGNAL), dispatch `:117` (только `Artifact`, `Parent spec`).

**Статус в v2 (RC).** `critic-protocol.directive.xml:4` AX_ISOLATION расширен: bounded target-set + minimal parent + Vision/Goals соседей через `npx gennady sdd-extract <dep> VISION`; `critic.directive.xml:48-51` STEP_2 — «only the references required to judge it» (нечётко). Конвенции в v2 переехали: проектные — в `specs/3-tasks.md` (token vocabulary, Baseline Completion Rule), модульные — в `<module>.3-tasks.md` `## Decision Log`/`## Conventions` (`formats/module-tasks-index.xml:26-31`); таксономия Verification Levels зафиксирована в пакете (`formats/task-ticket-structure.xml:43`, `scaffold.directive.xml:188`), что снимает конкретный кейс «`[contract]` из неизвестной таксономии». Но ни `specs/3-tasks.md`, ни `<module>.3-tasks.md` не названы в read set критика — D-00x/Cascade-аналог по-прежнему вне поля зрения.
**Вердикт: ЧАСТИЧНО.**

**Что требуется в v2.** В `ai/kit/templates/sdd-v2/critic-protocol.directive.hbs` AX_ISOLATION добавить: «+ `## Conventions`/`## Decision Log` владельца тикета (`<module>.3-tasks.md`) и `specs/3-tasks.md#CONVENTIONS`, через `sdd-extract`»; в router payload критика — эти пути механически (`sdd-task --task-scope` уже знает owning spec). Тест: `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` — rendered critic-protocol содержит `3-tasks.md` в AX_ISOLATION. Eval: **G3**. Effort S.

**Черновик ответа akkrat (DRAFT).**
> Расчёт стоимости раунда убедителен. В main изоляция пока «артефакт + parent spec». В v2 критик уже читает Vision соседей через `sdd-extract`, а конвенции переехали в `specs/3-tasks.md` и `<module>.3-tasks.md`; таксономия Verification Levels теперь фиксирована пакетом, так что именно тот кейс уходит. Добавляем эти файлы в read set явно — ваш первый вариант.

---

## #22 — Handoff и Inputs без провенанса: догадка оркестратора приходит к следующему агенту как измеренный факт (OPEN)

**Проблема.** `decisions: [k=v]`, `open: [id: text]` не различают «измерено / доложено предыдущей фазой / предположено». Аудитор подтверждал вместо того, чтобы измерять; O-13 без «extent» заглушил живую дыру; гипотеза прошла трёх агентов. Предложение: теги `measured|reported|assumed` + extent у `open`; `Inputs:` сохраняет теги; аудит трактует нетегированное как `assumed`; калибровочные строки говорят, что сужают — глубину, не покрытие.

**Статус в v1 (main).** Не исправлено: `phase-execution-protocol.xml:372-375` HANDOFF_FORMAT без тегов; `sdd-execute/SKILL.md:94` `Inputs: <verbatim prior Handoff lines>`.

**Статус в v2 (RC).** `phase-execution-protocol/steps/STEP_4_HANDOFF.xml:18-32` — добавлено поле `deviations`, тегов нет; `sdd-log complete` проверяет ровно четыре поля регэкспом `sdd-log.types.ts:246-247` (значения внутри `[...]` свободные — теги можно писать, но никто их не определяет и не читает). Смягчения: контекст фазы формируется механически — `sdd-task <ticket> --phase` печатает verbatim prior Handoffs (`cli/cmd/sdd-task/help.ts:55`, `sdd-task.cmd.ts:422` `parsePhaseHandoffs`), оркестратор «Never summarize, retype, or omit» (`execute.directive.xml:222-224`); аудит `audit/steps/STEP_1_MECHANICAL.xml:17-38` — маппинг гейтов «never inferred from the dispatch prompt's wording», `:68` «re-derive the gate yourself rather than trust the worker's logged ver lines». Это закрывает «оркестратор переписал», но не «фаза записала assumed как факт» и не extent у `open`.
**Вердикт: ЧАСТИЧНО.**

**Что требуется в v2.** В `ai/kit/contract/process/handoff-format` — грамматика тегов: `decisions: [k=v(measured|reported|assumed)]`, `open: [id(tag; extent): text]`; `sdd-log complete` — warn (не reject) на нетегированные записи, чтобы не ломать миграцию; `audit/steps/STEP_2_SEMANTIC.xml` — правило «untagged ⇒ assumed; open без extent ⇒ покрывает ничего»; в `execute.directive.xml` STEP_3 — калибровка только по глубине. Тест: `cli/cmd/sdd-log/__tests__` — payload с тегами принимается; без тегов — warn в выводе. Eval: **G3**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> Разбор O-13/O-11 — самый ценный из ваших материалов, он показывает, где теряются раунды. В main грамматика Handoff пока без провенанса. В v2 Handoff уже собирается и передаётся CLI (`sdd-task --phase`), так что «оркестратор дописал» исключено; теги `measured/reported/assumed` и extent для `open` берём в грамматику `HANDOFF_FORMAT` с проверкой в `sdd-log complete` и правилом «без тега = assumed» для аудита.

---

## #23 — В Execution Log нет токена для исправления ранней строки; самодельный `correction` отвергается как `unknown-token` (OPEN)

**Проблема.** Раунды append-only, словарь закрыт (`intro|decision|tried|discovery|insight|verified|ver|BLOCKED|DONE`). Когда число из Round 1 оказывается неверным в Round 3 — редактировать нельзя, оставить — аудит флажит, выдумать токен — чекер отвергает (F-25, три `unknown-token`). «Полу-фикс»: поправлено в одном месте, устарело в четырёх. Предложение: строка `correction | <round>/<phase> <field>: <old> → <new> ← <reason>`; `check.sh` принимает; аудит считает значение с поздним `correction` разрешённым.

**Статус в v1 (main).** Не исправлено: таблица `ai/directives/sdd/scaffold.directive.xml:709-721` закрыта; `check.sh:514-518` live-set `intro decision tried discovery insight verified ver BLOCKED DONE`, retired `sync file test cov rules recon`, всё остальное — `unknown-token`, засчитывается (`check.sh:502,621`).

**Статус в v2 (RC).** Словарь тот же и закрыт: `execute.directive.xml:26`; по `formats/task-ticket-structure.xml:141` он «lives in `<module>.3-tasks.md`», по `formats/module-tasks-index.xml:30-31` — в `specs/3-tasks.md`. Механической проверки словаря **нет**: `shared/sdd/check.ts` знает только `SDD_EXECUTION_LOG_ROUND_MISSING/PHASE_MISSING/PHASE_DUPLICATE/PHASE_ORPHAN` (`:551-571`); `sdd-log <ticket> line "<content>"` принимает любой текст (`sdd-log/help.ts:18`, `sdd-log.types.ts:98` `buildEventLine`) и вставляет его только в текущий раунд («never rewrite prior event lines», help.ts:72). Детекции записи в закрытый раунд (#12) в v2 нет. Итог: `correction` не отвергнется — но и не определён, аудит его не понимает, «полу-фикс» никем не ловится.
**Вердикт: НЕ ЗАКРЫТО.**

**Что требуется в v2.** (1) Добавить строку `correction` в таблицу токенов: `ai/kit/templates/sdd-v2/execute.directive.hbs` (:26) и шаблон `specs/3-tasks.md` в `shared/sdd/templates.ts`; (2) `sdd-log line` — валидация первого слова по словарю (`ERR_CLI_SDD_LOG_UNKNOWN_TOKEN`, exit 2) и для `correction` — проверка, что `<round>/<phase>` существует в EXECUTION_LOG; (3) порт #12 в `check.ts`: `SDD_EXECUTION_LOG_UNKNOWN_TOKEN`, `SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE`; (4) `audit/steps/STEP_2_SEMANTIC.xml` — правило «значение с поздним `correction` = resolved; артефакт со старым значением = finding». Тесты: `cli/cmd/sdd-log/__tests__` (accept/reject), `shared/sdd/__tests__/check.test.ts` (после-close). Eval: **G3**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> Да, «append-only нужен легальный способ ошибиться один раз» — точная формулировка. В main токена нет. В v2 словарь тот же, но `sdd-log line` его пока не проверяет, так что `correction` пройдёт молча — что не лучше отказа. Добавляем `correction` в каноническую таблицу, валидацию в `sdd-log`, порт вашей проверки записи в закрытый раунд из #12 и правило для аудита «позднее исправление снимает старую строку, но не устаревшую копию в других артефактах».

---

## #24 — `gennady sync` перезаписывает локально изменённые директивы, включая проектный `knowledge.xml` (OPEN)

**Проблема.** `sync-core.ts` знает `added|unchanged|updated`; `updated` = «пакет отличается от диска» → запись. Нет понятия «локально изменён». cloud-ios потерял 5-правильный Swift-реестр в `knowledge.xml` (каскад правил следующих тикетов шёл от пустого реестра), пять патченных скриптов и `discovery.directive.xml` — трижды. Предложение (любой из трёх): манифест с хэшами → `locally-modified`/`--force`; `knowledge.xml` project-owned; overlay `ai/directives.local/`.

**Статус в v1 (main).** Частично, вариант 2: `f74c8c1d` — `PROJECT_OWNED_ENTRIES = {'knowledge.xml'}`, статус `preserved` (создаётся при отсутствии, никогда не перезаписывается) — `cli/cmd/sync/sync-core.ts:23-27,240-254`, `sync.types.ts`, formatter; тест `cli/cmd/sync/__tests__/sync-core.test.ts:223` («preserves a project-owned knowledge.xml that differs»). Манифеста хэшей и overlay нет — патченная директива по-прежнему перетирается как `updated`.

**Статус в v2 (RC).** Не портировано: `cli/cmd/sync/sync-core.ts:243-249` — только `added|unchanged|updated` (`sync.types.ts:6`), `knowledge.xml` — обычный файл корня и перезаписывается каждый sync; вдобавок v2-sync — зеркало: удаляет из target файлы, которых нет в пакете, внутри «owned» подкаталогов (`sync-core.ts:213-234`, тест `sync-core.test.ts:218` «deletes target directives removed from the installed package») — проектный файл, положенный рядом с пакетными (например `ai/directives/sdd-v2/local-*.xml`), будет удалён. Нетронутыми остаются только подкаталоги, которых пакет не поставляет (`:250`).
**Вердикт: НЕ ЗАКРЫТО** (регресс относительно main; для cloud-ios поведение хуже v1).

**Что требуется в v2.** (1) Порт `f74c8c1d` (`PROJECT_OWNED_ENTRIES`, `preserved`); (2) манифест `ai/directives/.gennady-synced` (sha256 последнего записанного) → при расхождении диск≠последний-синк статус `locally-modified`: skip + listing + `--force[ <path>]`; `--dry-run` показывает потери; (3) зеркальное удаление — только файлов из манифеста. Тесты в `cli/cmd/sync/__tests__/sync-core.test.ts`: (a) knowledge.xml preserved; (b) патченный `sdd-v2/x.xml` → `locally-modified`, не записан; (c) проектный файл в owned-подкаталоге без записи в манифесте не удаляется. Eval: **G2**. Effort M.

**Черновик ответа akkrat (DRAFT).**
> `knowledge.xml` в main теперь project-owned: создаётся, если нет, и никогда не перезаписывается (статус `preserved` в выводе). Манифест с хэшами для остальных директив — следующий шаг, идея из вашего #10 переносится на `sync` один в один. В v2 это ещё не перенесено, и там sync к тому же зеркальный (удаляет стало-лишние файлы в своих подкаталогах) — до релиза v2 переносим и `preserved`, и манифест, иначе ваш кейс с реестром повторится.

---

## Сводная таблица

| Issue | Статус в v1 (main) | Вердикт v2 | Eval | Effort |
|---|---|---|---|---|
| #9.1 path-based Task-ID / false green | исправлено (#14 `90b123e9`, #10 `62172906`) | ЧАСТИЧНО (нет `NO_TICKETS_FOUND` в `--all`) | G4, G3 | S |
| #9.2 orphan-скан только TS | исправлено (#10, `check.sh:283-286`) | НЕ ЗАКРЫТО (consumers/BDD-index только ts/tsx/js) | G1 | S |
| #9.3 `ai/directives/language/` | исправлено (#10, optional) | НЕПРИМЕНИМО (`checkSpecLanguage`) | G4 | — |
| #9.4 sync-skills удаляет проектные скиллы | исправлено (#10, манифест) | НЕ ЗАКРЫТО (регресс, манифеста нет) | G2 | S |
| #9.5 model pins | исправлено (#14) | ЗАКРЫТО В V2 (без замка) | G3 | S |
| #9 bonus `extraGates[].when` | не исправлено | НЕ ЗАКРЫТО (стека нет) | G1 | L |
| #11 `~/.claude/skills` в директивах | частично (#14; 2 хвоста) | ЗАКРЫТО В V2 (`npx gennady`) | G2 | S |
| #13 Reopens двумя способами (closed) | закрыто (#14; тесты) | ЧАСТИЧНО (нет формулы, нет проверки) | G3 | M |
| #15 `### Round N` критика | часть 2 (#12); часть 1 нет | ЧАСТИЧНО (критик не пишет; `nextRoundNumber` по всему файлу) | G4, G3 | S |
| #16 `DIRECTIVE ACTIVATED` | не исправлено (7 скиллов) | ЗАКРЫТО В V2 (без замка) | G3 | S |
| #17 output зелёного гейта | не исправлено | НЕ ЗАКРЫТО (receipt без output) | G1 | S |
| #19 запрет `git` vs fixture-репо | не исправлено | НЕ ЗАКРЫТО (+ висячий аксиом) | G1, G3 | M |
| #20 `verify --wip <files>` / `--only` | не исправлено (3/3) | НЕ ЗАКРЫТО (npm-only ladder) | G1 | L |
| #21 критик не видит конвенции | не исправлено | ЧАСТИЧНО (Vision соседей есть; `3-tasks.md` нет) | G3 | S |
| #22 провенанс в Handoff | не исправлено | ЧАСТИЧНО (механический Inputs; тегов нет) | G3 | M |
| #23 токен `correction` | не исправлено | НЕ ЗАКРЫТО (словарь не проверяется вовсе) | G3 | M |
| #24 sync перетирает локальное | частично (`f74c8c1d`, только knowledge.xml) | НЕ ЗАКРЫТО (регресс + зеркальное удаление) | G2 | M |

Итого по v2: ЗАКРЫТО 3 (#9.5, #11, #16) · ЧАСТИЧНО 5 (#9.1, #13, #15, #21, #22) · НЕ ЗАКРЫТО 8 (#9.2, #9.4, #9-bonus, #17, #19, #20, #23, #24) · НЕПРИМЕНИМО 1 (#9.3).

## Перекрёстные связи (общие корни)

1. **Ветка v2 отошла от main на 46c6d616 и не впитала ни одного фикса по issues akkrat** (§0). Прямые регрессы относительно main: #9.4 (манифест sync-skills), #24 (`preserved` knowledge.xml), #12-механика (запись в закрытый раунд → #23), #13-механика ([REOPENS]). Первый шаг для G2/G3 — cherry-pick `62172906`, `4a47b9e8` (адаптация bash→ts), `f74c8c1d`, assertion из `sdd-review-lifecycle-contract.test.ts:200`.
2. **«Gena is soaked in Node» в v2 сильнее, чем в v1**: нет `services/stack`, `readiness.ts:15` требует 8 npm-скриптов, `phase-context.ts:262` блокирует фазы, consumers/BDD-скан только ts/js. Корень для #9.2, #9-bonus, #17, #20 (и косвенно #19 — §5 read-only snapshot). Один порт стек-независимого verify (main `plugins/*` + `gennady.yaml`) закрывает пласт G1.
3. **Механика vs текст**: v1 закрывал дыры скриптом (`check.sh` [LOG]/[REOPENS]/[TASKID]); в v2 `sdd-check` богаче по структуре спек, но беднее по Execution Log (нет словаря токенов, нет post-close, нет Reopens-причинности) — общий корень #13, #15-остаток, #23. Один модуль `shared/sdd/execution-log.ts` (парсер раундов/фаз/токенов, scoped по EXECUTION_LOG) закрывает три issue и чинит `nextRoundNumber`.
4. **Провенанс/контекст между агентами**: #21 (критик без конвенций) и #22 (Handoff без тегов) — обе про то, что получатель не различает «знаю / мне сказали / предположили». В v2 передача уже механизирована (`sdd-task --phase`, `sdd-extract`), поэтому исправление — грамматика + read set, а не новые процессы.
5. **Sync как зеркало без ownership**: #9.4, #24, #11 — одна модель «пакет владеет всем target-каталогом». Манифест владения (уже есть в main для skills) — единый механизм для skills и directives.
6. **Висячие ссылки в сборке директив v2**: `AX_PERMITTED_BASH_COMMANDS` определён в kit, на него ссылаются 3 директивы, но он не включён ни в один шаблон (#19). `lint-axioms.ts` проверяет только обратное направление; нужен referenced-but-undefined lint — иначе класс ошибок «инструкция в пакете противоречит другой инструкции» (#15, #16 в v1) воспроизведётся в v2 как «инструкция ссылается на пустоту».

---

# Часть II — Независимая верификация (V-A4)

# V-A4 — Независимая перепроверка A4 (issues akkrat против SDD v1 / SDD v2)

Проверяющий: свежие глаза, read-only. Проверяемый документ:
`scratchpad/A4-issues-verdicts.md`.
Источники, открытые заново самостоятельно (не по указателям A4):

- issues/PR: `gh issue view N --repo rubaxa/gennady` (#9, #11, #13, #15, #16, #17, #19, #20, #21, #22, #23, #24) — сырьё в `scratchpad/V-issues.txt`;
- MAIN (v1): `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`, HEAD `8bb38477`;
- RC (v2): `scratchpad/rc-v6`, HEAD `11291af5`;
- `git -C <main> merge-base 8bb38477 11291af5` = **46c6d616** — подтверждено, §0 A4 верен.
  Все шесть коммитов, на которые A4 опирается (`62172906`, `4a47b9e8`, `90b123e9`, `d6065c36`,
  `2a0282da`, `f74c8c1d`), существуют в main и лежат **после** merge-base (проверено
  `git log --oneline 46c6d616..HEAD`), т.е. в v2 их нет.
- Отсутствие стека в v2 подтверждено независимо: `services/stack/` и `cli/cmd/verify/` в RC
  **не существуют** (`ls` → No such file or directory), `anystack`/`extraGates`/`gennady.yaml` — 0
  вхождений в `.ts`. Плюс сам RC это фиксирует: `ai/flow-eval/docs/roundtrip-wall3-assessment.md:17-30`.

---

## § Итог

**Вердикты v2: согласен со всеми 17 из 17.** Ни один ярлык (ЗАКРЫТО / ЧАСТИЧНО / НЕ ЗАКРЫТО /
НЕПРИМЕНИМО) я не смог опровергнуть.

| Категория | Кол-во | Issues |
|---|---|---|
| СОГЛАСЕН (вердикт + доказательства сходятся) | 12 | #9.1, #9.2, #9.4, #9.5, #9-bonus, #11, #13, #16, #17, #19, #23, #24 |
| СОГЛАСЕН с вердиктом, но доказательства/формулировки требуют правки | 5 | #9.3 (таксономия), #15 (**ложная ссылка на v1-механизм**), #20 (переоценка блокировки), #21, #22 |
| НЕ СОГЛАСЕН с вердиктом | 0 | — |
| НЕ МОГУ ПРОВЕРИТЬ | 0 | — |

Статусы v1 (main): CONFIRMED — 16, REFUTED (частично) — 1 (**#15, часть 2**), UNVERIFIED — 0.

**Единственное содержательное расхождение** — v1-доказательство по #15:
A4 утверждает, что `4a47b9e8` (#12) ввёл «единое правило региона `sdd_lib_execution_log` (якоря
`<!--SECTION:EXECUTION_LOG-->`, либо `## N. Execution Log`, выход на любом `## `)».
В main такой функции **нет никогда** (`git grep sdd_lib_execution_log 4a47b9e8` → 0; в HEAD → 0),
вход в регион по-прежнему жёсткий `/^## 7\. Execution Log/` (`check.sh:557`), а якоря
`<!--SECTION:EXECUTION_LOG-->` **сознательно не используются** как делимитеры — это написано в
комментарии `check.sh:554-556`. Реально в main расширили только **выход** («ANY `## ` ends the
section», `check.sh:558`), и отдельно убрали подсчёт заголовков из `[REOPENS]`. Вердикт ЧАСТИЧНО от
этого не меняется, но цитата в A4 не выдерживает проверки и её нельзя отдавать akkrat (он знает этот
код — это его PR).

Дополнительно найдено 2 ошибочные цитаты, 10 сдвинутых ссылок, 6 неточных формулировок в черновиках и 8 пропущенных аспектов (см. ниже).

---

## § По каждому issue

### Сводная таблица перепроверки

| Issue | Ядро дефекта (моя формулировка) | Искажён ли в A4 | v1 (main) | v2 вердикт A4 | Моё согласие |
|---|---|---|---|---|---|
| #9.1 | `scan.sh`/`check.sh` знают только `TSK-[0-9]+` и глоб `*.task-*.md`, поэтому корректно заскаффоленный scope даёт `tasks_total=0`/`findings=0`, читаемые как «чисто» | нет | CONFIRMED | ЧАСТИЧНО | СОГЛАСЕН |
| #9.2 | orphan-скан `@tasks` в `check.sh` включает только `*.ts/*.js/*.sh/*.go` → на Swift/ObjC структурно молчит | нет | CONFIRMED | НЕ ЗАКРЫТО | СОГЛАСЕН |
| #9.3 | `AX_LANG_PASS_ON_WRITE` требует читать `ai/directives/language/*`, которого нет в пакете, и запрещает пропуск | нет | CONFIRMED | НЕПРИМЕНИМО | СОГЛАСЕН (таксономия спорна) |
| #9.4 | `sync-skills` считает orphan-ом любой каталог target, которого нет в source, и удаляет проектные скиллы без подтверждения | нет | CONFIRMED | НЕ ЗАКРЫТО | СОГЛАСЕН |
| #9.5 | `model: "sonnet"/"haiku"` захардкожены в 5 местах dispatch-промптов и возвращаются каждым sync | нет | CONFIRMED | ЗАКРЫТО В V2 | СОГЛАСЕН |
| #9-bonus | у anystack-гейта нет `when: [globs]`, поэтому `verify <files>` не может сузить набор гейтов | нет | CONFIRMED (не исправлено) | НЕ ЗАКРЫТО | СОГЛАСЕН |
| #11 | 8 мест в директивах зовут `~/.claude/skills/…`, а `sync-skills` ставит в `<cwd>/.claude/skills/`; `SYNC_PATH_RULES` не содержит `RULE_SKILLS_TILDE` | нет | CONFIRMED (2 хвоста) | ЗАКРЫТО В V2 | СОГЛАСЕН |
| #13 | `Reopens` определён формулой «Round headers − 1» в audit и семантикой «только аудит-раунды» в scaffold; раунды открываются по трём причинам | нет | CONFIRMED | ЧАСТИЧНО | СОГЛАСЕН |
| #15 | критик пишет `### Round N` в тот же файл, что и Execution Log; счётчик считал заголовки по всему файлу | нет | **REFUTED в части цитаты** (см. §Итог) | ЧАСТИЧНО | СОГЛАСЕН с вердиктом |
| #16 | скиллы велят печатать `DIRECTIVE ACTIVATED`, а `AX_NO_PROCESS_NARRATION` называет эту строку первым запрещённым примером | нет | CONFIRMED | ЗАКРЫТО В V2 | СОГЛАСЕН |
| #17 | `GateResult.output` пуст на `pass`, поэтому сузивший область гейт не может сообщить, что он прогнал | нет | CONFIRMED | НЕ ЗАКРЫТО | СОГЛАСЕН |
| #19 | `AX_PERMITTED_BASH_COMMANDS`/`AX_NARROW_RECON` запрещают весь `git`, а фазы-гейты не могут ничего доказать без throwaway-репозитория вне дерева | нет | CONFIRMED | НЕ ЗАКРЫТО | СОГЛАСЕН |
| #20 | `verify.sh` шлёт файлы позиционными таргетами, `--only` сверяет id целиком, шаблон говорит bare `sdd` | нет | CONFIRMED (3/3) | НЕ ЗАКРЫТО | СОГЛАСЕН (формулировка неточна) |
| #21 | изолированный критик не видит конвенций scope (`tasks/README.md`) и переоткрывает решённое | нет | CONFIRMED | ЧАСТИЧНО | СОГЛАСЕН |
| #22 | `decisions`/`open` в Handoff не различают measured / reported / assumed, у `open` нет extent | нет | CONFIRMED | ЧАСТИЧНО | СОГЛАСЕН (формулировка неточна) |
| #23 | Execution Log append-only + закрытый словарь ⇒ нет легального способа поправить строку прошлого раунда; самодельный `correction` отвергался | нет | CONFIRMED | НЕ ЗАКРЫТО | СОГЛАСЕН |
| #24 | `sync` знает только `added/updated/unchanged`, нет понятия «локально изменён», проектный `knowledge.xml` затирается | нет | CONFIRMED (частично закрыт) | НЕ ЗАКРЫТО | СОГЛАСЕН |

Пересказ дефектов в A4 я сверил с телом каждого issue построчно — **искажений постановки не найдено
ни в одном**. Единственная стилистическая придирка: заголовок #16 в issue говорит «Nine SDD skills»,
тело — «Ten skills carry an `Announce:` line … nine of them load a directive that bans it»; A4 берёт
«Девять скиллов», что соответствует телу.

---
### #9.1 — path-based Task-ID / ложный «зелёный»

**v1: CONFIRMED, цитаты почти точны.**
- `ai/skills/sdd-execute/scripts/_sdd-lib.sh:40` — `SDD_TASK_ID_RE='TSK-([A-Z]+-[0-9]{3}|[0-9]+)'`
  (A4 пишет `:36-40` — на 36-39 комментарий, сама строка 40); `:51` `SDD_TASK_ID_BOUNDARY`;
  `:54-55` `sdd_lib_task_id_valid`; `:84` `sdd_lib_task_id_from_path` (A4: `:85` — off-by-one).
- `check.sh:49-50` (документированные exit-коды) ✅, `check.sh:193` `NO_TICKETS_FOUND`,
  `check.sh:213` `TICKET_ID_UNREADABLE` — оба внутри указанного A4 диапазона `:185-220` ✅.
- whole-token парсинг: `check.sh:298` `unparseable-ref`, `scan.sh:287,298` через
  `$SDD_TASK_ID_RE$SDD_TASK_ID_BOUNDARY` ✅.
- Тесты `scripts/__tests__/sdd-task-id.test.ts` — **все семь указанных A4 номеров совпадают
  точно**: `:93` (discovery `<name>.{PREFIX}-{NNN}.md`), `:144` и `:291` («no tickets → not clean»),
  `:182` (malformed), `:192` (absent), `:203` (unreadable Meta), `:217`/`:233`/`:250`/`:267`
  (семейство `TSK-IB-0012`).

**v2: остаток подтверждён ИСПОЛНЕНИЕМ, не только чтением.**
- Грамматика: `shared/sdd/task-id.ts:16` `^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$`, `:19`
  `SLUG_MAX_LEN = 8` — обе ссылки точны.
- Обнаружение по содержимому Meta: `shared/sdd/ticket.ts:128`
  `metaBody.match(/\*\*Task-ID:\*\*\s*`?([A-Za-z0-9][\w-]*)`?/)` — точно `:128` ✅
  (принимает `TSK-IB-001`, подтверждено).
- `SDD_TASK_ID_GRAMMAR` — `shared/sdd/check.ts:888-901` (A4: `:895-901`), гейт v1/v2 в
  `sdd-check.cmd.ts:957` (A4: `:963`/`:1374` — 957 это @invariant того же гейта; 1373 вызов
  `checkSpecLanguage`, не грамматики; лёгкая путаница строк, механизм тот же).
- `SDD_LEGACY_TICKET_UNANCHORED` — `check.ts:1324-1330` ✅.
- Отсутствие аналога `NO_TICKETS_FOUND`: `grep -rn 'NO_TICKETS|checked nothing|NO_SPECS'` по
  `cli/ shared/ ai/` → **единственное вхождение — `ai/flow-sim/scenarios/S6-scaffold-ticket.md:244`
  (`H_NO_SPECS`, сценарий симуляции), в коде — ноль.**

**RUN (repro, RC):**
```
$ mkdir -p <scratch>/V-fix/empty/specs
$ node --import tsx <rc>/cli/gennady.ts sdd-check --all <scratch>/V-fix/empty
[sdd-check] ✅ clean — 0 file(s) checked
EXIT=0
```
Дыра воспроизведена буквально: пустой проект → «clean», exit 0. Вердикт **ЧАСТИЧНО — СОГЛАСЕН**.

### #9.2 — orphan-скан только TS-семейство

**v1: CONFIRMED и точно.** `check.sh:283-286` — четыре строки `--include`, добавлены
`.swift .m .mm .h .kt .java .py .rb .rs .cs .php`. Локирующего теста на список расширений нет:
`grep -rn swift <main>/scripts/__tests__/` → 0. Оценка A4 верна.

**v2: CONFIRMED, и хуже, чем описано.**
- consumers-grep: `cli/cmd/sdd-check/sdd-check.cmd.ts:699-701` — ровно `*.ts`, `*.tsx`, `*.js` ✅
  (ссылка A4 точна).
- индекс тест-файлов: `sdd-check.cmd.ts:503` — `/\.(test|spec)\.(ts|tsx|js)$/` (A4: `:504`,
  off-by-one).
- **A4 не заметил третий сканер с тем же дефектом**: `gennady yagni` —
  `cli/cmd/yagni/help.ts:30-33`: «tree-sitter (exact) for .ts/.tsx … grep (approximate) for
  .mts/.cts, JS variants, Python, Go, Ruby, and Java; supported source extensions:
  ts/tsx/mts/cts/js/jsx/mjs/cjs/py/go/rb/java». Swift/ObjC/Kotlin/Rust/C# — нет. При этом `yagni`
  входит в ladder `profile='full'` (`shared/sdd/phase-verification-plan.ts:47`), т.е. в
  аудитный прогон.
- **A4 смягчил формулировку BDD_COVERAGE зря — там два разных режима отказа**, и второй хуже:
  `sdd-check.cmd.ts:547` `if (matches.length === 0 && !isDone) continue;` — до `DONE` Swift-тикет с
  `FooTests.swift` **молча пропускается** (ложный зелёный), а на `DONE` он попадает в
  `checkableEntries` с пустым `caseNamesByFile` → `SDD_BDD_SCENARIO_UNTESTED`, которое
  **невозможно удовлетворить**, пока индекс не знает `.swift`. Т.е. Swift-тикет не может закрыться
  вовсе. Это усиливает вердикт, а не опровергает его.

Вердикт **НЕ ЗАКРЫТО — СОГЛАСЕН** (с усилением).

### #9.3 — `ai/directives/language/` не поставляется

**v1: CONFIRMED.** `ai/directives/sdd/discovery.directive.xml:320-333` — аксиом
`AX_LANG_PASS_ON_WRITE`, абзац «`ai/directives/language/` is optional … as it is in the published
package today … calibrated by `AX_OPERATOR_DIALOGUE_STYLE`» на строках **328-332** ✅ (точно, как в
A4). `module-decomposition.directive.xml:327-337`, тот же абзац с 333 ✅. Каталог
`ai/directives/language` в main отсутствует ✅. Локирующего теста нет ✅.

**v2: CONFIRMED.** `grep -rn 'directives/language|AX_LANG_PASS_ON_WRITE|lang-lint'` по
`ai/ shared/ cli/` → **0**. Замена: `checkSpecLanguage` — `shared/sdd/check.ts:1720`, вызывается из
`sdd-check.cmd.ts:1193` (`--spec --authoring`), `:1328` и `:1373` (только для `specFlow === 'v2'`);
тест `shared/sdd/__tests__/check-language.test.ts` существует ✅.

**Оговорка к вердикту.** «НЕПРИМЕНИМО» по легенде A4 требует «потребность исчезла». Потребность
(«язык спеки проверяется механически») закрыта **не полностью и другим предметом**:
`checkSpecLanguage` выдаёт `SDD_LANGUAGE_CALQUE` — warn-уровня детектор русских калек/канцелярита
(`check.ts:1622,1687,1702`), а не полный lang-lint pass с калибровкой. И он неявно предполагает, что
спека написана по-русски. Дефект issue (висячая ссылка блокирует первый spec write) — да, исчез по
построению.
**Формально это тот же класс, что #11, где A4 поставил «ЗАКРЫТО В V2 (по построению)» — таксономия
A4 внутренне непоследовательна.** Содержательно спора нет.

### #9.4 — `sync-skills` удаляет проектные скиллы

**v1: CONFIRMED, цитаты точны.**
`cli/cmd/sync-skills/sync-skills-core.ts:32` `const MANIFEST_NAME = '.gennady-synced'`, чтение `:44`,
запись `:77`. Тесты `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts:377` («leaves a
project-authored skill alone — it is not in the manifest») ✅, `:391` («prunes nothing on the first
run and writes a manifest») ✅, блок манифеста `:538-627` (A4 пишет `:538-617`; последний тест блока
— `:627` «lifecycle — install, filtered sync, package removal, retry after a failed prune»).

**v2: CONFIRMED.** `grep -rn 'gennady-synced' --include='*.ts'` по RC → **0**.
`cli/cmd/sync-skills/sync-skills-core.ts:396-404` — `orphansToDelete = targetSkillNames` (всё, чего
нет в source), затем `deleteOrphan(...)`; `deleteOrphan` объявлен на `:192` (A4: `:185-268`).
Тест, фиксирующий текущее поведение: `__tests__/sync-skills-core.test.ts:244` («detects orphan
skills (deleted from source but present in target)») ✅; теста «project-authored» нет.
Вердикт **НЕ ЗАКРЫТО (регресс) — СОГЛАСЕН**.

### #9.5 — захардкоженные `model:`

**v1: CONFIRMED, цитаты точны.** `grep -rn 'model: *"(sonnet|haiku|opus)"' <main>/ai` → **0**.
`ai/skills/sdd-execute/SKILL.md:79` и `:134` — «inherit the caller's configured model» ✅.
Контрактный тест: `scripts/__tests__/sdd-review-lifecycle-contract.test.ts:187` (`it(...)`), сама
ассерция `assert.doesNotMatch(content, /model: "(?:haiku|sonnet|opus)"/)` — `:200` ✅ (обе ссылки A4
точны). Уточнение: тест дополнительно требует `assert.match(content, /inherit\s+the\s+caller's
configured model/)` для трёх файлов, включая `critic.directive.xml`, т.е. в main критик не просто
«без пина», а с явным предписанием наследования — A4 сказал слабее, чем есть.

**v2: CONFIRMED.** `grep -rn 'model:' ai/skills ai/directives ai/kit/templates` → **0**.
Вердикт **ЗАКРЫТО В V2 (без замка) — СОГЛАСЕН**.

### #9 (bonus) — `extraGates[].when`

**v1: CONFIRMED, но ссылка сдвинута.** Закрытый список ключей — `services/stack/stack-config.ts:33-45`
(`GATE_SPEC_KEYS = ['id','argv','cwd','env','timeout','outputMeansFailure','driftMeansFailure',
'envFail','requires','fixer']`); A4 указал `:43-44`, что попадает внутрь массива, но не на его
объявление. `--only` — точное равенство: `cli/cmd/verify/verify.cmd.ts:69-71`
`selectorMatches(...) { return selector.includes(':') ? selector === \`${gate.stack}:${gate.id}\` :
selector === gate.id; }` ✅ — ссылка точна.

**v2: CONFIRMED.** `services/stack/`, `cli/cmd/verify/` отсутствуют; `anystack`/`extraGates` — 0
вхождений в `.ts`. `shared/sdd/readiness.ts:15-24` `REQUIRED_SCRIPTS` — 8 npm-скриптов ✅.

**Неточность A4, повторённая в #20:** «`phase-context.ts:262` блокирует все не-`setup` фазы при
`!executionReady`» — это переоценка. Реально `cli/cmd/sdd-verify/phase-context.ts:262`:
`if (!readiness.executionReady && profile !== 'setup')` — далее следует **выход через
GATE_QUEUE-исключение** (`:282-285`): если фаза структурно владеет отсутствующим readiness-гейтом,
`profile = 'setup'; profileBasis = 'infra-queue-exemption'`. Иначе — `failure(...)`. Т.е.
блокируются все не-`setup` фазы, **кроме** тех, что сами создают недостающий гейт. Ровно это
написано в собственном документе RC: `ai/flow-eval/docs/roundtrip-wall3-assessment.md:26-27` («Only
bootstrap/config/doc phases, or a phase owning a missing gate, are exempt»). Вывод A4 («гейта нет»)
остаётся верным, механизм описан слишком сильно.

Вердикт **НЕ ЗАКРЫТО — СОГЛАСЕН**.

### #11 — `~/.claude/skills/…` в директивах

**v1: CONFIRMED, обе «хвостовые» ссылки точны до строки.**
`grep -rn '~/\.claude/skills' <main>/ai` → ровно три вхождения:
`ai/directives/sdd/module-decomposition.directive.xml:661` (`extract-section.sh`),
`ai/directives/sdd/discovery.directive.xml:614` (`sdd extract`), плюс
`ai/skills/README.md:8` (историческая заметка, не вызов). В `audit.directive.xml` тильд нет —
вместо них `<sdd-path>` (`:284, :410, :413, :415, :443, :444, :453, :506`) ✅.
`shared/common/sync/path-normalizer.ts` — `SYNC_PATH_RULES` (объявление на `:84`, состав `:85-93`)
действительно **без** `RULE_SKILLS_TILDE`, который есть только в `SYNC_SKILLS_PATH_RULES` ✅.

**v2: CONFIRMED.** `grep -rn '~/\.claude' ai/ cli/ shared/` → **0**. `.claude/skills` встречается
только как факт деплоя (`ai/skills/README.md:83`, `ai/flow-eval/provision.ts:1140`,
`ai/flow-eval/__tests__/harness.test.ts:237`) — в тексте директив пути к скиллам нет; вызовы —
`npx gennady sdd-*`. Вердикт **ЗАКРЫТО В V2 — СОГЛАСЕН**.

### #13 — `Reopens` двумя способами (CLOSED)

**v1: CONFIRMED, цитаты точны.** Формулы «Round headers − 1» в main нет; вместо неё
`ai/directives/sdd/audit.directive.xml:511` («Reopens metadata — consume `<sdd-path> check --task
<Task-ID>` [REOPENS], **do not hand-count**») и `:697` («Meta `Reopens` is the count of persisted
`@audit` records whose `triggered-reopen` is not `none`») ✅. Механика:
`check.sh:347-421` (`reopens_one`), счёт `:357`
`grep -cE '^@audit .* triggered-reopen=Round-[0-9]+'`, двусторонняя причинность через awk `:382-395`.
Тесты `scripts/__tests__/sdd-check-log.test.ts:230` («counts only audit-triggered reopens») ✅,
`:238` ✅, `:319`/`:330`/`:341` (causation, PENDING) ✅.

**v2: CONFIRMED.** Формулы нет (`grep 'Round headers'` по `ai/directives/sdd-v2` → 0). Поле
существует в шаблонах: `formats/task-ticket-structure.xml:36`, `scaffold.directive.xml:181`,
`formats/module-tasks-index.xml:12`, `formats/scope-tasks-index.xml:31`, `shared/sdd/templates.ts:1251`;
обновляется вручную reconcile-директивой `:113, :194, :250` ✅. `Reopens` **не встречается** в
`shared/sdd/check.ts`, `cli/cmd/sdd-log/*`, `ai/directives/sdd-v2/audit.directive.xml` и
`audit/` — подтверждено grep'ом ✅.
Словарь причин раунда действительно уже подсказан: `cli/cmd/sdd-log/sdd-log.types.ts:86`
(`@param reason Short reason (\`initial\`, \`fix: F-NNN\`, \`resume\`)`) ✅ — A4 указал `:86` точно.

**Уточнения, которых в A4 нет:**
- В RC есть `ai/kit/axiom/process/ax-reopen-format.xml:19` (аналог `AX_REOPEN_TICKET_FORMAT`) — A4
  его не упомянул, хотя он единственное место, где формат Meta ещё живёт как правило.
- В RC есть `ai/kit/axiom/audit/ax-stale-after-pivot-verification.xml:8` — таблица с
  «Reopens counter incremented since pivot date | `MAJOR`», т.е. аудитная проверка Reopens
  формально существует. **Но этот аксиом не собирается ни в один шаблон** (см. #19), поэтому
  вывод A4 «механической проверки нет» остаётся верным — по другой причине, чем он написал.

Вердикт **ЧАСТИЧНО — СОГЛАСЕН**.

### #15 — `### Round N` критика

**v1: часть 1 CONFIRMED, часть 2 — REFUTED в части цитаты.**
- Часть 1: `ai/directives/sdd/critic.directive.xml:167-169` — `Create/append \`## Critic Rounds\`` /
  ```### Round N — YYYY-MM-DD``` — **точно на указанных строках**, не исправлено ✅. Плюс `:25`
  `AX_SCRATCH_LOG`, `:196-198` (секция сохраняется на не-CLEAN).
- Часть 2: **`sdd_lib_execution_log` в main не существует ни в HEAD, ни в `4a47b9e8`**
  (`git -C <main> grep -n sdd_lib_execution_log 4a47b9e8 -- ai/skills/sdd-execute/scripts/` → пусто).
  Что реально в `check.sh`:
  - `:557` `/^## 7\. Execution Log/ { inlog = 1; next }` — вход **жёстко на секцию №7**, и на
    `4a47b9e8` он такой же (`git show 4a47b9e8:...check.sh | grep -n 'Execution Log/'` → `558`);
  - `:558` `/^## / { if (inlog) inlog = 0 }` — **это и есть фикс**: любой `## ` закрывает регион,
    поэтому `## Critic Rounds` больше не оставляет регион открытым;
  - `:544-556` — комментарий, прямо объясняющий, что вход **сознательно не расширяли** до
    `## <n>. Execution Log` и что якоря `<!--SECTION:EXECUTION_LOG-->` **сознательно не используются**
    как делимитеры (есть тикеты, чья пара якорей обнимает только заголовок).
  - `[REOPENS]` перестал считать заголовки вовсе (см. #13), поэтому repro из issue
    (`rounds 2 … MISSING`) невозможен просто потому, что колонки `rounds`/`audit_rounds` в
    выводе больше нет — шапка теперь `# task_id  meta  audit_triggered  verdict` (`check.sh:351`).
  Тесты, названные A4 (`:507-535`), существуют: `:511` («leaves the critic section out of the log
  parse»), `:518` («ends the region at a numbered section too»), `:535` («attributes a finding to its
  execution round, not to an intervening critic round») ✅.
- **Остаточная дыра в v1, которую A4 пропустил:** `check.sh:372`
  `grep -qE "^### Round ${target}([[:space:]]|$)" "$f"` — проверка «объявленный `triggered-reopen`
  Round существует» идёт по **всему файлу**, не по региону лога. Критиковский
  `### Round 2` под `## Critic Rounds` удовлетворит эту проверку за несуществующий
  execution-раунд. Это ложно-отрицательный близнец исходного issue, живой в main.

**v2: CONFIRMED.** `critic.directive.xml:57-63` STEP_3_REPORT — «Never edit, **never persist a round
journal**, never ask to continue…» ✅. `formats/audit-round.xml` — своё пространство имён
(`### Audit Round`). Остаток: `cli/cmd/sdd-log/sdd-log.types.ts:76-79`
`fileContent.match(/^#{3}\s+Round\s+\d+/gm)` — по всему файлу ✅ (ссылка A4 точна).

**RUN (repro, RC):**
```
$ node --import tsx <scratch>/V-fix/nextround.mjs
nextRoundNumber (execution log EMPTY, 2 critic rounds) = 3
```
(фикстура: пустая секция `EXECUTION_LOG` + `## Critic Rounds` с `### Round 1` и `### Round 2`).

**Ошибка цитаты A4 №2 по этому issue:** A4 пишет, что `## Critic Rounds` в sdd-v2 «упоминается
только как то, что при миграции остаётся в v1-формате (`infra.directive.xml:51`,
`interface.directive.xml:48`)». Прочитал сам: это `AX_SPEC_LIFECYCLE`, и он говорит противоположное
— «Temporary Change Manifest, per-line review marks, **Critic Rounds**, publication state, and
migration between V2 subformats **are not part of the specification**», т.е. Critic Rounds как
артефактная сущность в v2 отменены. Для вердикта это ещё сильнее в пользу «критик не пишет»,
но цитата в A4 описывает не то, что там написано.

Вердикт **ЧАСТИЧНО — СОГЛАСЕН**.

### #16 — `DIRECTIVE ACTIVATED`

**v1: CONFIRMED.** `grep -rn 'DIRECTIVE ACTIVATED' <main>/ai` → 7 скиллов с `Announce:`:
`sdd-discover:10`, `sdd-continue:10`, `sdd-infra:12`, `sdd-setup:10`, `sdd-fix:10`,
`sdd-scaffold:10`, `sdd-module-decomposition:10` ✅ (список A4 совпадает поштучно;
`sdd-execute`/`sdd-execute-batch` баннера не несут — верно).
Уточнение: аксиом с этой строкой лежит в **8** файлах директив, не 7:
`setup:120`, `phase-execution-protocol:229`, `svelte-ui-discovery:172`, `scaffold:347`,
`module-decomposition:284`, `discovery:275` и `discovery:524` (вторая формулировка), `fix:181`.
A4 сказал «в 7 директивах» — недосчитал `svelte-ui-discovery.directive.xml`.

**v2: CONFIRMED.** `grep -rn 'DIRECTIVE ACTIVATED|Announce' <rc>/ai` → только определения аксиома:
`ai/directives/sdd-v2/router.directive.xml:130` и `ai/kit/axiom/process/ax-no-process-narration.xml:3`.
В `ai/skills/*/SKILL.md` — ноль. `ai/skills/sdd-audit/SKILL.md:13` — «Do not narrate directive
activation» (A4: `:12`, off-by-one) ✅. Вердикт **ЗАКРЫТО В V2 — СОГЛАСЕН**.

### #17 — вывод прошедшего гейта отбрасывается

**v1: CONFIRMED, все три ссылки точны.**
`services/stack/gate-runner.ts:331` (`outputMeansFailure`-ветка pass, `output: ''`) и `:335`
(`proc.status === 0` → `output: ''`) ✅; `services/stack/stack.types.ts:186` — «Combined
stdout+stderr, **retained only for non-passing gates**» ✅; `cli/cmd/verify/verify.cmd.ts:90`
(`fullOutput: ['full-output']`) и `:364` (`args.fullOutput === true ? result.output :
truncateOutput(result.output)`) — влияет только на усечение ✅.

**Смягчение, которого A4 не отметил:** в main директива уже даёт частичный обход —
`ai/directives/sdd/phase-execution-protocol.xml:95`: «`<sdd-path> verify --wip --json
<target-files>` — same gates, machine-readable. `results[]` names every gate with its command and
status, **passing ones included**; use it when you need to state which gates ran». Это не закрывает
issue (гейт по-прежнему не может сказать *своими словами*, что он сузил), но «прошёл — и ничего
нельзя сказать» неверно буквально: идентичность гейтов доступна.

**v2: CONFIRMED.** `shared/sdd/phase-receipt.ts:15-25` — `PhaseReceiptCommand = { gate, role,
command, exitCode }`, поля `output`/`notes` нет ✅ (A4: `:16-24`).
`cli/cmd/sdd-verify/phase-run.ts:341-352` — успешный шаг пушится без вывода; `:366-373` — вывод
печатается только у упавшего шага ✅. `cli/cmd/sdd-verify/help.ts:85-92` — «success → ✅ ALL PASS
(N/M), then one line per step» ✅. Вердикт **НЕ ЗАКРЫТО — СОГЛАСЕН**.

### #19 — запрет `git` vs fixture-репозиторий

**v1: CONFIRMED, ссылки точны.** `ai/directives/sdd/phase-execution-protocol.xml:51` —
`AX_NARROW_RECON`: «Forbidden: `git status`, `git branch`, `git log`, `git diff`, **or any other git
operation**» ✅; `:97` — `**Forbidden:** \`git\` ANY subcommand (status, branch, log, diff, add,
commit)` ✅; `:99` rationale «each git call costs ~100-300ms» ✅.

**v2: CONFIRMED целиком, включая висячую ссылку.** Прочитал
`ai/kit/axiom/process/ax-permitted-bash-commands.xml` полностью (55 строк):
- `:22-31` — `git`/`gh` reads законны только когда шаг директивы «names a real gap», иначе «off the
  table»; мутирующий git — только шагу publish/commit ✅;
- `:33-38` — «no bash command in this list reaches outside the project root» ✅;
- `:40-47` — «**Temp files stay under `.claude/tmp/`, nowhere else**… The system `/tmp`, `$TMPDIR`,
  and the repository root are closed» ✅;
- `mktemp` в списке «May run» отсутствует вовсе — т.е. fixture запрещён трижды (нет `mktemp`,
  нет git-мутаций, нет выхода за корень), а не дважды, как пишет A4;
- **дополнительно (A4 не отметил): `:51-54`** — «Ticket §5 commands are **not** a phase-agent
  exemption» — Swift-тикет с `xcodebuild` в §5 фаза не может прогнать сама даже теоретически.
- Висячая ссылка: `grep -rn 'permitted-bash' <rc>/ai/kit/templates/` → **0**;
  `AX_PERMITTED_BASH_COMMANDS` ссылаются `execute.directive.xml:53`,
  `phase-execution-protocol/steps/STEP_3_VERIFY.xml:28`, `audit/steps/STEP_1_MECHANICAL.xml:78`,
  `infra.directive.xml:417`, `ai/kit/axiom/infra/ax-gitignore-baseline.xml:7`,
  `ai/kit/axiom/process/ax-verification-before-handoff.xml:15` — определение не собрано никуда ✅.
- `ai/kit/lint-axioms.ts:4,97` — проверка ровно одной направленности («defined in BeliefState,
  referenced by no step/halt/switch/contract»), обратной нет ✅.
- **Пропущено A4:** `ai/kit/audit-halt-activation.mjs:138` содержит уже неверный комментарий
  «review-lifecycle.directive.hbs includes `axiom/process/ax-permitted-bash-commands`» — в самом
  `templates/sdd-v2/review-lifecycle.directive.hbs:7-10` включены только четыре других аксиома, и
  в собранном `ai/directives/sdd-v2/review-lifecycle.directive.xml` строка
  `AX_PERMITTED_BASH_COMMANDS` встречается 0 раз.
- **Пропущено A4:** это не единственный несобранный аксиом —
  `ai/kit/axiom/audit/ax-stale-after-pivot-verification.xml` тоже не включён ни в один шаблон
  (`grep -rn 'ax-stale-after-pivot' ai/kit/templates ai/kit/assembly-manifest.json` → 0), из-за чего
  пропадает и аудитная проверка Reopens (см. #13).
- Snapshot §5: `cli/cmd/sdd-verify/help.ts:30` — «Workspace snapshots intentionally exclude .git
  metadata and installed node_modules tool state; **every other** persistent file or directory is
  observed» ✅ — т.е. `.claude/tmp/**` под наблюдением, как A4 и предполагает.

Вердикт **НЕ ЗАКРЫТО — СОГЛАСЕН** (с усилением).

### #20 — `verify --wip <files>` / `--only`

**v1: CONFIRMED по всем трём пунктам, ссылки точны.**
`ai/skills/sdd-execute/scripts/verify.sh:90` — `exec gennady verify "$@"` ✅;
`cli/cmd/verify/verify.cmd.ts:69-71` — строгое равенство ✅;
`ai/skills/sdd-execute/SKILL.md:98` — «MANDATORY before EMIT_HANDOFF: **sdd verify** --wip
<target-files>» при `<SDD_PATH>` на `:95` ✅, тогда как директива
`phase-execution-protocol.xml:90` уже пишет `<sdd-path> verify --wip <target-files>` ✅.

**v2: CONFIRMED по механизму.**
`shared/sdd/phase-verification-plan.ts:43-49` — `verificationGateNames`: `full` →
`['type-check','test:coverage','lint','format','yagni']`, `test` → `['fix','type-check',
'test:coverage']`, иначе `['fix','type-check','test']`; `:252-270` `commandForGate` — единственный
файл-зависимый рунг это `fix` → `target-repair` (требует `format:fix`+`lint:fix` как
argument-forwarding бриксы), всё остальное `npm run <script>` на весь проект ✅. `--only` нет
(в `cli/cmd/sdd-verify/help.ts` — только `--task/--phase/--profile/--spec`). §5-строки бегут
verbatim (`phase-run.ts:341`) ✅. Пункт (3) действительно снят.

**Формулировка A4 требует правки** (та же, что в #9-bonus): «`phase-context.ts:262` блокирует все
не-`setup` фазы» → блокирует все, **кроме** владеющих отсутствующим readiness-гейтом
(`phase-context.ts:282-285`, `shared/sdd/gate-queue.ts`). Вердикт **НЕ ЗАКРЫТО — СОГЛАСЕН**.

### #21 — критик не видит конвенции scope

**v1: CONFIRMED** (`critic-protocol.xml:10`, `critic.directive.xml:10`, dispatch `:117` — проверено
по цитатам issue и наличию AX_ISOLATION_SIGNAL в main; расхождений нет).

**v2: CONFIRMED, ссылки точны.**
`ai/directives/sdd-v2/critic-protocol.directive.xml:4` — AX_ISOLATION: «canonical bounded target-set
… + its minimal parent context + the Vision / Goals of its direct NEIGHBOURHOOD … pulled via
`npx gennady sdd-extract <dep> VISION` … No other files, no full dependent specs» ✅.
`critic.directive.xml:48-53` STEP_2_REVIEW — «only the references required to judge it» ✅
(A4: `:48-51`).
Таксономия Verification Levels зафиксирована пакетом: `formats/task-ticket-structure.xml:43` и
`scaffold.directive.xml:188` — оба буквально `subset of \`contract\` | \`unit\` | \`integration\` |
\`e2e\`` ✅ (обе ссылки A4 точны — это тот самый кейс `[contract]` из issue).
Конвенции переехали: `formats/module-tasks-index.xml:27` (`## Decision Log (module-task level)`),
`:30-31` (`## Conventions` → «declared once in `specs/3-tasks.md` and inherited here») ✅.
`grep -rn '3-tasks' critic.directive.xml critic-protocol.directive.xml kit/templates/sdd-v2/critic*.hbs`
→ **0** ✅ — в read set критика этих файлов нет.
Вердикт **ЧАСТИЧНО — СОГЛАСЕН**.

### #22 — провенанс в Handoff / Inputs

**v1: CONFIRMED** (`phase-execution-protocol.xml` HANDOFF_FORMAT без тегов; `SKILL.md:94`
`Inputs: <verbatim prior Handoff lines OR "none — first phase">` — проверено на `:94` ✅).

**v2: CONFIRMED.**
`ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_4_HANDOFF.xml` — контракт
`HANDOFF_FORMAT` на строках 18-33: `artifacts` / `decisions: [key=value]` / `open: [id: text]` /
`deviations: [id: text]`; тегов провенанса и extent нет ✅ (A4: `:18-32`).
`cli/cmd/sdd-log/sdd-log.types.ts:248-249` — `COMPLETE_HANDOFF_PAYLOAD_RE` требует ровно эти четыре
поля, содержимое `[...]` свободно ✅ (A4: `:246-247`, off-by-two).
Смягчения подтверждены: `cli/cmd/sdd-task/help.ts:55` («[HANDOFF]: prior completed phases' verbatim
Handoff lines») ✅, `sdd-task.cmd.ts:422` `parsePhaseHandoffs` ✅,
`execute.directive.xml:223-224` («Never summarize, retype, or omit its lifecycle manifest and worker
contract») ✅, `audit/steps/STEP_1_MECHANICAL.xml:17` («fixed, **never inferred from the dispatch
prompt's wording**») ✅ и `:68` («**re-derive the gate yourself** rather than trust the worker's
logged `ver` lines») ✅.

**Формулировка A4 слишком сильная.** «Оркестратор дописал — исключено» неверно: `sdd-task --phase`
даёт verbatim-блок, но остальную часть dispatch-промпта оркестратор по-прежнему пишет сам
(`execute.directive.xml:221-222`: «followed by exact resolved spec/rule excerpts and current Git
evidence»), и центральный пример issue #22 — именно **добавленная оркестратором неизмеренная
премисса** («Log has a git baseline…»). Механически это не исключено, только запрещено текстом.
Вердикт **ЧАСТИЧНО — СОГЛАСЕН**.

### #23 — нет токена `correction`

**v1: CONFIRMED.** `check.sh:525-529` — live-set `intro decision tried discovery insight verified ver
BLOCKED DONE`, retired `sync file test cov rules recon` (A4: `:514-518`, сдвиг ~11 строк — механизм
тот же). Таблица токенов в `scaffold.directive.xml` (диапазон A4 `:709-721`) закрыта.

**v2: CONFIRMED, ПОДТВЕРЖДЕНО ИСПОЛНЕНИЕМ.**
- Словарь: `execute.directive.xml:26` — `intro / decision / tried / discovery / insight / verified /
  BLOCKED`. **Правка к A4:** «словарь тот же» неточно — `ver` в v2 заменён CLI-владельцем
  `SDD_PHASE_RECEIPT`; каноническая формулировка живёт в шаблоне `specs/3-tasks.md`:
  `shared/sdd/templates.ts:1581` — «`intro <Entity> ← <reason>` · `decision <key>=<value> ← <reason>`
  · `tried` · `discovery` · `insight` · `verified <tool>@<version>` · CLI-owned `SDD_PHASE_RECEIPT`
  · `BLOCKED <cause>` · `DONE`».
- Противоречие о владельце словаря подтверждено: `formats/task-ticket-structure.xml:141` —
  «Token vocabulary lives in `<module>.3-tasks.md`», а `formats/module-tasks-index.xml:30-31` —
  «declared once in `specs/3-tasks.md` and inherited here — not repeated» ✅.
- Механической проверки словаря нет: в `shared/sdd/check.ts` только
  `SDD_EXECUTION_LOG_ROUND_MISSING` (`:551`), `_PHASE_MISSING` (`:559`), `_PHASE_DUPLICATE` (`:564`),
  `_PHASE_ORPHAN` (`:571`) ✅.
- Порт #12 отсутствует: `grep -rn 'entry-after-close|ENTRY_AFTER_CLOSE|closed round'` по
  `shared/ cli/` → **0** ✅.

**RUN (repro, RC) — самодельный токен проходит молча:**
```
$ node --import tsx <scratch>/V-fix/runlog.mjs t.GAT-login.md \
    line "correction R1/P1 baseline: 186 → 185 ← recount" --phase P1
[sdd-log] appended to EXECUTION_LOG:
- [x] `2026-09-07T05:18:36.769Z` correction R1/P1 baseline: 186 → 185 ← recount

$ ROOT=<scratch>/V-fix/log node --import tsx <scratch>/V-fix/runcheck.mjs --task t.GAT-login.md
[sdd-check] ✅ clean — 1 file(s) checked
```
Фикстура тикета несла одновременно самодельный токен `correction` **и** секцию `## Critic Rounds` с
`### Round 1` — `sdd-check --task` не сказал ни о том, ни о другом. Вердикт **НЕ ЗАКРЫТО — СОГЛАСЕН**.
(Побочно замечено: `sdd-log line` штампует миллисекундный timestamp `…:36.769Z`, тогда как весь
остальной корпус пишет `…:36Z`/`…Z` — расходится с форматом, который v1-парсер нормализует
вручную. В A4 не отмечено; к вердикту не относится.)

### #24 — `sync` перезаписывает локальное

**v1: CONFIRMED, ссылки точны.**
`cli/cmd/sync/sync-core.ts:27` — `export const PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])` ✅;
`:239-241` — `else if (PROJECT_OWNED_ENTRIES.has(relativePath)) { status = 'preserved' }` ✅;
`:253-254` — «`preserved` must NOT be written» ✅; `cli/cmd/sync/sync.types.ts:8` —
`'added' | 'updated' | 'unchanged' | 'preserved'` (обратите внимание: **`deleted` в main нет
вовсе**) ✅; тест `cli/cmd/sync/__tests__/sync-core.test.ts:223` — «preserves a project-owned
knowledge.xml that differs: status preserved, never written» ✅.
Манифеста хэшей и overlay в main нет ✅.

**v2: CONFIRMED, и «хуже v1» подтверждается кодом.**
`cli/cmd/sync/sync.types.ts:6` — `'added' | 'updated' | 'deleted' | 'unchanged'` — **`preserved`
отсутствует, `deleted` добавлен** ✅. Зеркальное удаление: `sync-core.ts:225-244` —
`scanTargetMirrorSpace(targetDir, ownedSubdirs, filtered)`, затем `if (sourcePaths.has(relativePath))
continue; entries.push({relativePath, status:'deleted'}); deps.unlink(...)` ✅.
Разобрал сам `scanTargetMirrorSpace`: **файлы корня `ai/directives/` попадают в зеркало в
нефильтрованном прогоне** («Root-level files are only mirror candidates when the whole package …
is being synced»), а внутри `ownedSubdirs` (`sdd-v2`, `coding`, `testing`, …) идёт `collectRecursive`
— значит и `ai/directives/sdd-v2/local-*.xml` удаляется ✅, и `knowledge.xml` (он есть в пакете:
`ls <rc>/ai/directives/` → `knowledge.xml`) идёт как `updated` и перезаписывается ✅.
Не тронуты только неизвестные подкаталоги — они уходят в `warnings` (`:246-249`) ✅.
Вердикт **НЕ ЗАКРЫТО (регресс) — СОГЛАСЕН**.

### Прогон тестов RC (проверка утверждений A4 «pass локально»)

```
$ node --import tsx --test --experimental-test-module-mocks \
    <rc>/shared/sdd/__tests__/task-id.test.ts \
    <rc>/cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts \
    <rc>/shared/sdd/__tests__/check-legacy-ticket.test.ts \
    <rc>/ai/kit/__tests__/lint-axioms.test.ts
# tests 77 · pass 77 · fail 0
```
Все четыре файла зелёные — утверждения A4 о «25/25» и «30/30» по отдельным файлам согласуются с
агрегатом; все названные A4 тестовые файлы в RC существуют (`check-language.test.ts`,
`check-taskid-grammar.test.ts`, `check-legacy-ticket.test.ts`, `stateless-sdd-flow-contract.test.ts`,
`lint-axioms.test.ts`).

---

## § Ошибки в черновиках ответов (DRAFT)

Черновики нельзя отправлять в текущем виде: четыре из них содержат утверждения, которые akkrat
опровергнет по своему же коду.

| # | Фрагмент черновика | Что не так | Как правильно |
|---|---|---|---|
| **#15** | «Счётчик в main **ограничен регионом лога** — это ваш #12» | В main нет регионного правила для входа: `check.sh:557` по-прежнему `/^## 7\. Execution Log/`, якоря сознательно не используются (`:554-556`). Из #12 в main попало другое: **выход** на любом `## ` (`:558`) и полный отказ `[REOPENS]` от подсчёта заголовков | «В main после #12 регион лога закрывается на любом `## `, поэтому `## Critic Rounds` больше не оставляет его открытым; а `[REOPENS]` вообще перестал считать `### Round`-заголовки и считает `@audit … triggered-reopen`. Вход в регион остался жёстким `## 7. Execution Log` — сознательно, как вы и написали в комментарии» |
| **#20** | «на Swift-проекте она сейчас **не запустится вовсе**» | Есть штатное исключение: фазы `bootstrap/config/doc` (profile `setup`) и фаза, структурно владеющая отсутствующим readiness-гейтом (`phase-context.ts:262-289`, `shared/sdd/gate-queue.ts`) — проходят | «…на Swift-проекте отработают только `setup`-фазы и фаза, которая сама создаёт недостающий гейт; все остальные упрутся в `executionReady=false`» |
| **#22** | «Handoff уже собирается и передаётся CLI (`sdd-task --phase`), так что «оркестратор дописал» **исключено**» | `sdd-task --phase` даёт только verbatim-блок прошлых Handoff'ов; остальной dispatch-промпт («exact resolved spec/rule excerpts and current Git evidence», `execute.directive.xml:221-222`) оркестратор пишет сам. Именно этот случай — центральный пример issue | «…прошлые Handoff-строки теперь приходит verbatim из CLI, так что их **пересказ** исключён; но премиссы, которые оркестратор добавляет от себя, по-прежнему ничем не помечены — это и берём в грамматику» |
| **#9.3** | «проверка языка спеки **перенесена** в `sdd-check --spec` (механическая, без внешних файлов)» | `checkSpecLanguage` (`check.ts:1720`) — warn-детектор русских калек/канцелярита (`SDD_LANGUAGE_CALQUE`), а не перенос lang-lint pass; ничего «не переносилось», аксиом просто удалён | «…аксиома с внешним чтением в v2 нет вообще; вместо него в `sdd-check` есть механический warn-детектор калек — стопориться нечему» |
| **#17** | «В v2 **ra**ннер другой» | опечатка: латинские `ra` внутри слова | «раннер» |
| **#9.5** | «пинов в `critic.directive.xml` нет» | В main там не просто нет пина, а есть явное «inherit the caller's configured model» (`:112-113`), и контрактный тест это требует | усилить формулировку |

Остальные черновики (#9.1, #9.2, #9.4, #11, #13, #16, #19, #21, #23, #24, #9-bonus) фактических
ошибок не содержат; #11 корректно воспроизводит и авторскую пометку «латентно, не инцидент».

---

## § Пропущенное (аспекты issues, которые A4 не разобрал)

1. **#9.2 — третий сканер с зашитым списком языков.** `gennady yagni`
   (`cli/cmd/yagni/help.ts:30-33`): tree-sitter для `.ts/.tsx`, grep для
   `mts/cts/js/jsx/mjs/cjs/py/go/rb/java`. Swift/ObjC/Kotlin/Rust/C# нет, а `yagni` входит в
   `profile='full'` ladder (`phase-verification-plan.ts:47`), т.е. в аудитный прогон. Для «единого
   списка расширений», который A4 предлагает, это третий потребитель.
2. **#9.2 — BDD_COVERAGE на Swift не «молчит», а становится неудовлетворимым.**
   `sdd-check.cmd.ts:547` пропускает запись, пока тикет не `DONE`; на `DONE` он даёт
   `SDD_BDD_SCENARIO_UNTESTED`, которое нельзя закрыть, потому что индекс тест-файлов не знает
   `.swift`. То есть Swift-тикет структурно не может дойти до закрытия. Это отдельный, более
   тяжёлый исход, чем «структурно слеп».
3. **#15 — остаточная дыра в v1, обратная исходной.** `check.sh:372` ищет
   `^### Round <target>` по всему файлу: критиковский `### Round 2` под `## Critic Rounds`
   удовлетворит проверку существования триггернутого раунда, которого в логе нет. Ложно-отрицательный
   близнец issue, живой в main HEAD.
4. **#19 / #13 — висячих аксиом два, а не один.** Кроме `ax-permitted-bash-commands.xml` не собран
   `ai/kit/axiom/audit/ax-stale-after-pivot-verification.xml` (единственное место в RC, где Reopens
   вообще проверяется аудитом). Плюс уже неверный комментарий
   `ai/kit/audit-halt-activation.mjs:138`, утверждающий, что `review-lifecycle.directive.hbs`
   включает первый из них. Предложенный A4 lint «referenced-but-undefined» ловит только половину
   класса — нужен и обратный отчёт «defined-but-never-included-in-a-template».
5. **#19 — §5 не является исключением для фазового агента** (`ax-permitted-bash-commands.xml:51-54`).
   Это отдельно бьёт по Swift-кейсу: даже если Swift-гейты записать в §5, фаза их не прогонит; их
   исполняет `sdd-verify`, а он их и так бежит verbatim. A4 разбирает только запрет `git`/`mktemp`.
6. **#17 — частичное смягчение уже есть в v1-директиве.**
   `phase-execution-protocol.xml:95` предписывает `verify --wip --json`, чей `results[]` перечисляет
   все гейты с командой и статусом, «passing ones included». Это не закрывает issue, но статус
   «в main пока не менялось» стоит уточнить: изменилась инструкция, не механизм.
7. **#9.1 — help-текст v2 всё ещё рекламирует легаси-глоб.**
   `cli/cmd/sdd-migrate/help.ts:14`: «`sdd-migrate anchors --all [root]` # every
   `tasks/**/*.task-*.md`». Реализация при этом ищет по содержимому Meta
   (`sdd-migrate.cmd.ts:28-52`, комментарий прямо про `<scope>.IB-NN.md`), т.е. это дрейф текста, а
   не дыра — но именно этот текст akkrat читал бы первым при миграции cloud-ios.
8. **Таксономическая непоследовательность самого A4:** #11 и #9.3 — один класс («v1-концепт исчез по
   построению»), но помечены по-разному (ЗАКРЫТО В V2 vs НЕПРИМЕНИМО). Легенда требует для
   НЕПРИМЕНИМО «потребность исчезла», чего про язык спеки сказать нельзя (она закрыта другим,
   более узким механизмом).

---

## § Рекомендуемые правки к A4

**Обязательные (фактические):**

1. **§#15, «Статус в v1»** — переписать: убрать `sdd_lib_execution_log` и «якоря
   `<!--SECTION:EXECUTION_LOG-->`». Заменить на: вход остался `check.sh:557`
   `/^## 7\. Execution Log/`; фикс = выход на любом `## ` (`:558`) + отказ `[REOPENS]` от подсчёта
   заголовков; комментарий `:544-556` объясняет, почему якоря не используются. Соответственно
   переписать DRAFT #15.
2. **§#15, «Статус в v2»** — исправить цитату `infra.directive.xml:51` /
   `interface.directive.xml:48`: это `AX_SPEC_LIFECYCLE`, и он говорит, что Critic Rounds
   «are not part of the specification», а не «остаются в v1-формате при миграции».
3. **§#9-bonus и §#20** — заменить «`phase-context.ts:262` блокирует все не-`setup` фазы» на
   «блокирует все, кроме `setup` и владеющих отсутствующим readiness-гейтом
   (`phase-context.ts:282-285` + `shared/sdd/gate-queue.ts`)». Синхронно поправить DRAFT #20.
4. **§#23** — снять «словарь тот же»: в v2 `ver` заменён CLI-владельцем `SDD_PHASE_RECEIPT`;
   каноническая таблица — `shared/sdd/templates.ts:1581` (шаблон `specs/3-tasks.md`), не только
   `execute.directive.xml:26`.
5. **DRAFT #22** — «исключено» → «пересказ прошлых Handoff'ов исключён; добавленные оркестратором
   премиссы по-прежнему не помечены».
6. **DRAFT #9.3** — «перенесена» → «аксиом удалён; вместо него узкий warn-детектор калек».
7. **DRAFT #17** — опечатка «raннер».

**Уточнения ссылок (мелкие, но их читает автор issue):**
`_sdd-lib.sh:40` (не `:36-40`) и `:84` (не `:85`); `sdd-check.cmd.ts:503` (не `:504`);
`phase-receipt.ts:15-25` (не `:16-24`); `sdd-log.types.ts:248-249` (не `:246-247`);
`sync-skills-core.ts` тесты `:538-627` (не `:538-617`); `stack-config.ts:33-45` (не `:43-44`);
`sdd-audit/SKILL.md:13` (не `:12`); `router.directive.xml:130` (диапазон `:129-130` — вторая строка);
`check.sh` live-set `:525-529` (не `:514-518`); в #16 директив с аксиомом **8**, не 7
(добавить `svelte-ui-discovery.directive.xml:172`).

**Дополнения по существу (усиливают, а не меняют вердикты):**

8. В §#9.2 добавить `gennady yagni` как третьего потребителя единого списка расширений и
   неудовлетворимость BDD_COVERAGE на `DONE`-тикете Swift-проекта (см. «Пропущенное» 1-2).
9. В §#15 «Статус в v1» добавить остаточную дыру `check.sh:372` (проверка существования
   `### Round <target>` по всему файлу).
10. В §#19 добавить второй несобранный аксиом (`ax-stale-after-pivot-verification.xml`), устаревший
    комментарий `ai/kit/audit-halt-activation.mjs:138` и требование обратного линта
    «defined-but-never-included»; в §#13 сослаться на это как на причину отсутствия аудитной
    проверки Reopens.
11. В §#19 добавить `ax-permitted-bash-commands.xml:51-54` («§5 — не исключение для фазового
    агента») — это отдельный барьер для Swift-гейтов.
12. В §#17 «Статус в v1» добавить `phase-execution-protocol.xml:95` (`verify --wip --json`,
    `results[]` с проходящими гейтами) как частичное смягчение на уровне инструкции.
13. В §#9.1 «Статус в v2» добавить дрейф help-текста `cli/cmd/sdd-migrate/help.ts:14`
    (`tasks/**/*.task-*.md`) при content-based реализации `sdd-migrate.cmd.ts:28-52`.
14. Привести таксономию к одному виду: либо #9.3 → «ЗАКРЫТО В V2 (по построению)» как #11, либо
    #11 → НЕПРИМЕНИМО. Сейчас легенда применена непоследовательно.

**Что подтверждено исполнением и стоит перенести в A4 как repro-строки:**

```
# #9.1 — пустой scope даёт «clean»/exit 0
node --import tsx <rc>/cli/gennady.ts sdd-check --all <fixture-with-empty-specs>
→ [sdd-check] ✅ clean — 0 file(s) checked ; EXIT=0

# #15 — nextRoundNumber считает критиковские раунды
nextRoundNumber(<ticket: пустой EXECUTION_LOG + '## Critic Rounds' с Round 1, Round 2>) → 3

# #23 — самодельный токен проходит и не ловится
sdd-log <ticket> line "correction R1/P1 baseline: 186 → 185 ← recount" --phase P1 → appended
sdd-check --task <ticket>                                                        → ✅ clean
```
