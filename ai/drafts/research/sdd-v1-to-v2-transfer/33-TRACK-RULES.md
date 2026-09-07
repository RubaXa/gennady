# 33 — Трек RULES: слой правил (реестр, каскад, per-stack правила, контракт-тесты)

> Статус: ВЕРИФИЦИРОВАНО (B4 + V-B4, правки применены; рекомендация изменена на R-A′ сейчас / R-B как целевое). Ждёт решений оператора (§4.7).

**Как читать.** Это чистый документ: аналитика B4 (Opus) прошла независимую верификацию V-B4 (Opus, свежие глаза, ~190 привязок `file:line` перепроверены по коду) и найденные правки применены прямо в тексте — без отдельного «раздела ошибок». Из трёх блокирующих опровержений: одно снимает у первой задачи (T-1) статус «независима от VERIFY»; второе меняет диагноз главного дефекта каскада (не «ребро потеряно в прозу», а «второй канал наследования, который механика не читает»); третье подрывает главный эмпирический довод против варианта R-A и приводит к пересмотру рекомендации — **R-A′ сейчас / R-B как целевое состояние**. Сырые материалы обеих сессий (полный текст B4, полный текст V-B4, включая ход рассуждений) лежат в `ai/drafts/research/sdd-v1-to-v2-transfer/_raw/33-TRACK-RULES.raw.md` — обращайтесь туда, если нужна не выжимка, а дословный след верификации по каждой цитате.

Дата анализа: 2026-09-07. Read-only аудит. Источники:

- **MAIN** (v1, `origin/main` == `8bb38477`; рабочий HEAD дерева `f67a8a11`, `check.sh` и `knowledge.xml` между ними не менялись, проверено `git diff --stat`): `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`
- **RC** (v2, ветка `codex/sdd-v2-rc52-followup`): `…/scratchpad/rc-v6`
- Потребители: `cloud-ios` @ `origin/ap/CLOUDIOS-NOISSUE-swiftlint-exceptions-infra-base`; `/Users/k.lebedev/Developer/messenger` (рабочее дерево)
- Прочитано аналитиком до начала: A1 §3.4 (R1–R5) и §1.3 строки 81/89/96/111/113; A2 §5, §9.1, §9.2; A4 #24; B1 §4
- Сверено при верификации: A1 §3.4, V-A1 (C9, MISSED-8), A2 §5, V-A2, B1 §4, B3, V-A4 #24

Все `file:line` даны относительно корня соответствующего чекаута.

---

## 0. Резюме в двенадцати пунктах

1. «Правило» — это XML-подобный файл в `ai/directives/{coding,testing,infra}` (плюс `architecture`, `quality` по предикату), несущий четыре проверяемые секции `<BeliefState>/<AntiPatterns>/<VerificationHooks>/<RewardCriteria>` и опциональный `<DependsOn>`. Реестр `ai/directives/knowledge.xml` отдельно несёт активационные поля `<Triggers>/<SkipWhen>/<ActivationHint>/<CheckPhase>/<RequiresVerification>/<CrossRef>`. Схема **не версионирована** ни в файле правила, ни в реестре — и хуже, чем казалось изначально: сам пакет в текстах директив инструктирует секции в **snake_case** (`<Belief_State>`, `<Anti_Patterns>` — `ax-rules-load-from-phase-block.xml:3`, `audit.directive.xml:243`), тогда как файлы правил пакета написаны в CamelCase. Неверсионированность уже дала расхождение **внутри пакета**, не только у потребителя.
2. Разделение обязанностей стабильно в обеих ветках: **реестр** решает «активируется ли правило» (`<Triggers>`), **файл правила** решает «что именно требуется» (четыре секции) и «что ещё обязательно прочитать». Последнее устроено сложнее, чем выглядит: в файле правила есть **два** канала объявления зависимости — `<DependsOn>` (bullet-список, читается механикой в v2) и `<InheritedBaseline>` (проза/markdown-ссылка, в v2 получила отдельную разрешающую норму рантайма и механически не читается вообще). `<CrossRef>` в реестре — проза для агента, механической силы не имеет ни в v1, ни в v2.
3. В main этот слой доведён до 23/23 полных файлов правил и `rule_findings=0` (прогон §2.1). В RC — 17 файлов правил, из них **два неполных**: `ai/directives/testing/vitest-rules.xml` (нет `<RewardCriteria>`) и `ai/directives/coding/uikit-spec-drafting.xml` (нет `<VerificationHooks>`). Это прямой регресс R1, и **в v2 нет ни одного механизма, который бы это поймал**.
4. Механическая проверка в v1 — bash-секция `[RULES]` в `check.sh` (толерантный скан открывающих тегов) со отдельным счётчиком `rule_findings`; в v2 её нет вовсе. Единственный код правил в v2 — `SDD_RULES_CASCADE_UNRESOLVED` (замыкание `<DependsOn>`, но не `<InheritedBaseline>`) — исчерпывающий grep по всему RC даёт **ровно этот один** код, 11 вхождений в 7 файлах.
5. Контрактный тест v1 `scripts/__tests__/testing-rule-contract.test.ts` — **хардкод-белый список из шести файлов**, а не контракт над категорией. Четыре новых файла (`baseline-rules`, `python-rules`, `go-rules`, `baseline-testing`) в нём отсутствуют и залочены только присутствием в `deployed-surface.golden.txt`. `check.sh` не запускается ни из `npm test`, ни из какого-либо git-хука — **хуков в main нет вовсе** (`scripts/git-hooks/` не существует, `find` по репозиторию пуст, `package.json` не содержит `prepare`/husky); единственный агрегат проверок — `npm run lint` = `format && type-check && lint:contracts`, и `check.sh` в него не входит. То есть R1 в main держится на ручных прогонах.
6. Ownership: main — `PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])` со статусом `preserved`, зеркальных удалений нет вообще. RC — `SyncFileStatus = 'added' | 'updated' | 'deleted' | 'unchanged'`, `knowledge.xml` перезаписывается, а файл правила проекта внутри `coding/`/`testing/`/`infra/` **удаляется** как устаревшая запись зеркала. Уточнение: зеркальное удаление в RC уже сегодня ограничено *поставляемыми* подкаталогами (`sync-core.ts:221-232`, `ownedSubdirs`) — непоставляемая проектная **категория** (например, `language/` у `messenger`) уже не трогается и репортится как `warnings`; под угрозой именно проектный **файл внутри** пакетной категории (`coding/logging-rules.xml`, `coding/swift-rules.xml`). Для потребителя это всё равно хуже v1.
7. Пер-стековое покрытие: main — `baseline-rules` + `python-rules` + `go-rules` + `baseline-testing` (`5a237cd5`) плюс `plugins/golang/directives/infra/golang-setup.xml`; RC — только TS/Svelte/Node-раннеры, ноль правил для python/go/swift/rust. В RC нет и каталога `plugins/`, и (что не было очевидно в первом проходе) нет также каталога `services/stack/` — то есть тип `StackPlugin`/`gateIds` в v2 отсутствует не только как реализация, а как **тип**.
8. Плагин в main возит файл правила, но **не запись в реестре**: `golang-setup` физически доезжает до потребителя как `ai/directives/infra/golang-setup.xml` (`deployed-surface.golden.txt:50`), при этом `<Rule id="golang-setup">` в `knowledge.xml` отсутствует (grep `golang-setup` по main — 30 вхождений в 14 файлах, и ни одного в реестре) — `<Triggers>` его активировать не могут никогда.
9. Реальность потребителя №1 (`cloud-ios`): проект **сам написал** полноценный Swift-реестр (5 правил: `swift-rules`, `objc-rules`, `xctest-rules`, `git-setup`, `swiftlint-setup`), 4 файла правил со всеми четырьмя секциями и `<DependsOn>`, свой `<CheckPhaseOrder>lint build test</CheckPhaseOrder>`, Cascade Table с разбором активации по фазам, и зафиксировал прозой, что `check-command` в их репозитории **не резолвится**. Их дерево при этом стоит на срезе пакета **до** `5a237cd5` — у них физически нет `coding/{baseline-rules,python-rules,go-rules}.xml` и `testing/baseline-testing.xml`, что важно для планирования миграции (T-7).
10. Реальность потребителя №2 (`messenger`): всё дерево правил (8 coding + 7 testing + 4 infra = 19 файлов, не считая `README.md` в каждом каталоге) на **старой snake_case-схеме**. Прогон `check.sh` даёт 19 строк `INCOMPLETE`. RC-парсер `parseRuleDependsOn` на `<Depends_On>` возвращает `[]` — тихое ложно-зелёное замыкание; то же верно и для второго канала — 7 файлов несут `<Depends_On>`, ещё 2 несут `<Inherited_Baseline>`, оба невидимы для механики.
11. Все четыре гипотезы оператора совместимы между собой и решают разные подзадачи: (a) — «откуда берутся стек-правила», (b) — «что читать, когда стек-правила нет», (c) — «кто владеет реестром», (d) — «кто ловит неполный файл». Единственный настоящий конфликт — между (a) и (c). Пятая, не названная в исходном списке гипотеза (R-A′, steelman) показывает, что этот конфликт можно снять дешевле, чем трёхслойным merge: пакет пишет файлы, проект пишет реестр — ровно то, что уже написано в аксиоме `f74c8c1d` и уже практикуется `cloud-ios`.
12. Рекомендация — вариант **R-A′ «Baseline в ядре + project-owned реестр (C1) + файлы пресетов, гейтированные детекцией + `<File>`-existence/unregistered-чек»** (§4.4) как решение **прямо сейчас**: закрывает R1/R2/R3/R5, не требует миграции у живых потребителей, effort M. Вариант **R-B «Реестр как слияние трёх слоёв + baseline в ядре + kit-аудит схемы»** (§4.2) остаётся **целевым состоянием** — принимать его стоит, если пакету реально понадобится обновлять активационную семантику правил у чужих проектов, чего сегодня ни один из двух живых потребителей не требует. Обе рекомендации блокированы одним общим и ранее не замеченным фактом: baseline-хуки вызывают `<sdd-path> verify --wip`, которого в RC не существует (§3.3, Q7).

---

## 1. Факты

### 1.1 Что такое «правило» — схема файла

Файл правила — это XML-подобный (не парсимый XML) документ. Толерантность к «не-XML» зафиксирована прямо в коде: файлы «are HTML-like by design and carry prose such as `<Target Files>` and `Meta<typeof Button>` that no XML parser accepts» (`ai/skills/sdd-execute/scripts/check.sh:35-36`).

Четыре обязательные секции (канон одинаков в v1 и v2):

| Секция | Содержимое | Кто читает |
|---|---|---|
| `<BeliefState>` | `<Axiom id="AX_*">` — инварианты прозой | phase-subagent; audit шаг «residual axioms» |
| `<AntiPatterns>` | `<AntiPattern id="AP_*">` с парой `<Bad>`/`<Instead>` | phase-subagent; audit |
| `<VerificationHooks>` | `<Hook id="HOOK_*">` с `<Purpose>`/`<Command>`/`<Expected>` | phase-subagent; audit; VERIFY (косвенно) |
| `<RewardCriteria>` | плоский список ✅/❌ | audit (первый проход compliance) |

Опциональные секции — их **две**, разного механического статуса:

| Секция | Содержимое | Кто читает |
|---|---|---|
| `<DependsOn>` | bullet-список путей `ai/directives/<category>/<rule>.xml` — «правило архитектурно расширяет» | scaffold (транзитивное замыкание), `sdd-check` в v2 (`SDD_RULES_CASCADE_UNRESOLVED`). **Не обходится в рантайме** |
| `<InheritedBaseline>` | markdown-ссылка/прозаическое указание «read `<other-file>` first» | **только модель**, по разрешающей норме v2 `ax-rules-load-from-phase-block.xml:5-11`: «that declared base is part of the same rule for scoping purposes and MAY be opened too. It is NOT a discovery: log nothing». Механически невидим — `parseRuleDependsOn` (`rules-cascade.ts:41-45`) этот тег не парсит |

Канон формулировок:
- v1: `ai/directives/sdd/audit.directive.xml:230-240` (`AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES`), `:234` про `<DependsOn>` — «Used by scaffolder for transitive closure, by audit for cascade verification — NOT walked at runtime», `:240` «Section presence is NOT judged by eye — `sdd check --task <Task-ID>` emits `[RULES]` … Each `INCOMPLETE` row → one `RULE_FILE_INCOMPLETE`, its `missing` column copied verbatim».
- v2: `ai/kit/axiom/audit/ax-rules-compliance-against-activated-rules.xml:5-12`. **Это не тот же текст**, вопреки первому впечатлению: v2 **убрал** делегирование инструменту («Section presence is NOT judged by eye…») и **поднял severity** — «Required section missing → `RULE_FILE_INCOMPLETE` (`MAJOR`)» против v1, где находка `RULE_FILE_INCOMPLETE` капится до `MINOR` (`audit.directive.xml:125`). Это первая из двух подмен, которые видны только при сопоставлении обеих версий (вторая — маршрутизация, см. R1 в §2).

Пример полного файла (main, стек-агностичный): `ai/directives/coding/baseline-rules.xml` — `<BeliefState>` `:9-46` (6 аксиом `AX_TELEOLOGICAL_NAMING`, `AX_EXPLICIT_FAILURE`, `AX_CONTRACT_AT_SURFACE`, `AX_INTENT_COMMENTS`, `AX_YAGNI_NO_DEFENSE`, `AX_SINGLE_RESPONSIBILITY`), `<AntiPatterns>` `:48-72`, `<VerificationHooks>` `:74-86` (`HOOK_PROJECT_GATE` = `<sdd-path> verify --wip <target-files>`, `HOOK_NO_SCAFFOLD_LEFTOVER`), `<RewardCriteria>` `:88-100`, файл 101 строка, корневой тег `ver="1.0"`.

**Схема не версионирована**, и это сильнее, чем исходно казалось: `ver` не читает ни `check.sh`, ни `rules-cascade.ts` — но сверх того сам пакет пишет секции директив в snake_case (`ax-rules-load-from-phase-block.xml:3` — «Read end-to-end (Mission + Belief_State + Reward_Criteria + Anti_Patterns + Verification_Hooks)»; `ax-rules-compliance-against-activated-rules.xml:16` — «Walk Reward_Criteria, Anti_Patterns, Verification_Hooks»; в main то же — `audit.directive.xml:243`, `phase-execution-protocol.xml:54`). Это сильнейшее доказательство того, что версионирование схемы нужно не только потребителю, но и пакету (см. Q3 в §4.7).

### 1.2 Реестр `ai/directives/knowledge.xml` — схема записи

Реестр несёт **другой** набор полей — активационный, а не проверяемый:

```
<Rule id="<rule-id>">
  <File>ai/directives/<category>/<rule>.xml</File>
  <Purpose>…</Purpose>
  <Triggers>…</Triggers>              <!-- условие активации: файлы/kind фазы -->
  <SkipWhen>…</SkipWhen>              <!-- контр-условие -->
  <ActivationHint>…</ActivationHint>  <!-- когда именно читать -->
  <CheckPhase>typecheck|test|lint|format|<пусто></CheckPhase>
  <RequiresVerification>check-command|<пусто></RequiresVerification>
  <CrossRef id="…">…</CrossRef>       <!-- 0..n; проза, не механика -->
</Rule>
```

Плюс один глобальный `<CheckPhaseOrder>` (main `knowledge.xml:55`, RC `:3`).

Важно: **`<Triggers>/<SkipWhen>/<RequiresVerification>` живут в реестре, а `<DependsOn>`/`<InheritedBaseline>` — в файле правила.** Это два разных пространства фактов, и они рассинхронены by design: `<CrossRef>` в реестре не обязан совпадать с `<DependsOn>` в файле. В RC это уже дало дрейф (A2 §5.2, подтверждено с одной поправкой): `knowledge.xml` объявляет `<CrossRef id="testing-common">` у `vitest-rules`/`node-test`/`svelte5-runes` (**не** у `svelte-testing` — `svelte-testing` несёт `<CrossRef>` на `node-test`/`vitest-rules`/`svelte5-runes`, `RC/knowledge.xml:106-108`), но **ни один из трёх не декларирует `ai/directives/testing/common.xml` в `<DependsOn>`** — значит `checkRulesCascadeClosure` этой зависимости никогда не потребует. В main это починено (`ac2e9d73`): `node-test.xml` и `vitest-rules.xml` несут `<DependsOn> - ai/directives/testing/common.xml`.

Различия шапки и состава реестра:

| | main `knowledge.xml` | RC `knowledge.xml` |
|---|---|---|
| Строк | 250 | 151 |
| Шапка | комментарий `:2-7`: «PROJECT-OWNED … `gennady sync` seeds this file when absent but never overwrites an existing one … The shipped copy is a TypeScript-oriented starting point, not a fixed contract» | нет комментария; сразу `<Rules>` (`:2`) |
| Блок `<Directives>` | есть, 6 записей SDD-директив (`:8-53`) | **нет** |
| `<Rule>` записей | 19 (Coding 7, Testing 8, Infra 4) | 14 (Coding 3, Testing 7, Infra 4) |
| Стек-агностичные родители | `baseline-rules` (`:67-75`), `baseline-testing` (`:129-137`) | нет |
| Языковые правила | `python-rules` (`:85-94`), `go-rules` (`:95-104`) | нет |
| `typescript-rules` `<Triggers>` | `Target Files include .ts / .tsx source files` (`:79`), `<SkipWhen>` `non-TypeScript language (see python-rules / go-rules)` (`:80`) | `Target Files include source code files (not config)` (`:9`), `<SkipWhen>` `Config-only task; infra-setup task without code files` (`:10`) |
| `result-conventions` | есть (`:58-66`) | **нет** (файл удалён в RC) |

Последняя строка таблицы — самая дорогая: в RC **`typescript-rules` активируется на любом исходном файле любого языка**. Python-проект по v2 получит правило TypeScript как «coding»-правило своей фазы, и это не баг реализации, а буквальное чтение `<Triggers>`.

Парсер реестра (только v2): `shared/sdd/task-authoring-literals.ts:59-74` `parseRuleRegistry` — regex `<Rule\s+id="([^"]+)">([\s\S]*?)<\/Rule>` + `<File>`; **бросает** при нуле записей (`:67`) и при дублирующемся `id` (`:70`). Отдельный факт, важный для Q2 в §4.7: `parseRuleRegistry` **молча отбрасывает** запись без `<File>` (`return file ? [...] : []`) — то есть «подавление пакетного правила пустым `<File>`» уже сегодня работает как *тихое игнорирование записи*, без каких-либо правок кода; но это же значит, что опечатка в `<File>` сегодня даёт молчаливое исчезновение правила, без единой находки. `loadRuleRegistry` (`:81-91`): если существует `<repoRoot>/ai/directives/knowledge.xml` — читается он, иначе пакетный. **Слияния нет: либо проектный, либо пакетный.** Потребитель — `cli/cmd/sdd-new/sdd-new.cmd.ts:478`, невалидный реестр = `exitCode: 1` (`sdd-new.types.ts:145`).

### 1.3 Как правило доезжает до тикета

Цепочка одинаковая по форме в v1 и v2, разная по адресам артефактов.

| Шаг | v1 (main) | v2 (RC) |
|---|---|---|
| 1. Реестр читается целиком | `scaffold.directive.xml:470` STEP «Read `ai/directives/knowledge.xml` in full … Read it now — do not defer» | `ai/kit/axiom/scaffold/ax-rule-activation-plan.xml:3` «`ai/directives/knowledge.xml` (`<Rules>` section) is the canonical rule registry» |
| 2. Резолв ссылок или abort | `AX_RULES_RESOLUTION_HARD_FAIL` `scaffold.directive.xml:73-74`; halt `H_MISSING_RULES` (`:441`), `H_RULES_CYCLE` (`:442`) | `ai/kit/axiom/scaffold/ax-rules-resolution-hard-fail.xml:2-4` |
| 3. Каскад по тирам | `AX_RULES_CASCADE_RESOLUTION` `scaffold.directive.xml:77-88` — текст на `:78` говорит «union of 5 tiers», но перечисляет на `:81-84` **четыре** (traversed-scopes, target-scope, module, task) — это устаревшее число, а не действующих 5 тиров | `ax-rules-cascade-resolution.xml:3` — «union of 4 tiers», перечислены те же 4 на `:6-9`. RC здесь **исправил** устаревшее число main, это не делта/регресс |
| 4. Cascade Table (Scope × Categories) | `tasks/<scope>/README.md` (`scaffold.directive.xml:87`, шаблон `:785-801` с блоком `### Rule Sources`) | `specs/<scope>/<scope>.3-tasks.md` (`:12`; формат `ai/directives/sdd-v2/formats/scope-tasks-index.xml:16-22`) |
| 5. Активация на фазу | `AX_RULE_ACTIVATION_PLAN` `scaffold.directive.xml:92-108`, **8 шагов** (`:95`…`:106`) | `ax-rule-activation-plan.xml:3-6` — те же инварианты в сжатом виде |
| 6. Запись в тикет | `Rules:` bullet-список внутри блока фазы, только per-phase (`scaffold.directive.xml:88,260,598-599,611-612`) | `formats/task-ticket-structure.xml:62` «links only, resolved from the cascade; rule content is never inlined», `:80` |
| 7. Verification-таблица | union `<RequiresVerification>` алиасов по всем фазам → таблица тикета (`scaffold.directive.xml:103-108,636-640`) | `ax-rule-activation-plan.xml:6` — «resolves through infra-spec Verification Commands into the ticket-level Verification table; the phase verifier runs only rows whose Required-by intersects the selected phase's `Rules`» |
| 8. Чтение phase-worker'ом | «phase-subagent reads ONLY its phase's block, its phase's Rules, and prior-phase Handoff payloads» (`scaffold.directive.xml:250`); `<DependsOn>` в рантайме не обходится (`:98`); **никакого разрешения читать чужой файл сверх списка нет** | `ai/kit/axiom/scaffold/ax-rules-load-from-phase-block.xml`. **Не «тот же запрет»**: v2 добавил разрешающее исключение (`:5-11`) — если процитированное правило само декларирует транзитивную базу (`<InheritedBaseline>` или прозу «read `<other-file>` first»), эта база считается частью того же правила и **может** быть открыта, «не является находкой, ничего не логируется». В main запрет безусловный (`phase-execution-protocol.xml:54` — «Rules from sibling phases are NOT this phase's concern») |
| 9. Где стек влияет на выбор правил | `plugins/golang/skills/sdd-infra-golang/SKILL.md:109` — «Read in full: …`plugins/golang/directives/infra/golang-setup.xml`» (маршрутизация **прозой в скилле**) | `ai/directives/sdd-v2/infra.directive.xml:83` — «look up each chosen tool in `ai/directives/knowledge.xml` `<Rules>`: find every rule whose `<Triggers>` match the tool name or its config artefacts» |

Три наблюдения по шагу 9. Первое: в v1 связь «стек → правило» существует только как проза скилла: `sdd-infra/SKILL.md:9` маршрутизирует на `sdd-infra-golang`, тот велит прочитать файл правила плагина. Второе: в v2 связь формально сильнее (совпадение `<Triggers>` с именем инструмента), но правил для не-Node инструментов в реестре нет, поэтому совпадать не с чем; а «стека» в v2 не выбирается нигде (B1 §4.1). Третье, самое важное для понимания того, насколько детерминирована порча каскада у не-Node проекта: помимо чтения `<Triggers>` моделью есть **машинная** тропа — `sdd-new` печатает канонические кортежи `id`+href прямо из `loadRuleRegistry` в каждый создаваемый тикет (`RC/cli/cmd/sdd-new/help.ts:92`, `sdd-new.types.ts:314`; воспроизведено прогоном в B3 §1.10). После первого v2-`sync` на Swift-проекте это не «модель может ошибиться в активации», а «CLI детерминированно вписывает `typescript-rules`/`svelte5-runes` в артефакт» — вторая, более жёсткая тропа порчи, помимо семантической активации по `<Triggers>`.

### 1.4 Как правила проверяются

#### v1 — `[RULES]` в `check.sh` + контрактные тесты

Секция `[RULES]` (`ai/skills/sdd-execute/scripts/check.sh:436-491`, счётчик `:664`):

- **Что считается файлом правила** — общий предикат `sdd_lib_is_rule_path` (`ai/skills/sdd-execute/scripts/_sdd-lib.sh:16-19`) над `SDD_RULE_PATH_RE` (`:14`):
  `(^|/)(ai/directives|plugins/[a-z0-9-]+/directives)/(architecture|coding|infra|quality|testing)/[^/]+\.xml$` **и** имя не `*.directive.xml`. То есть 5 категорий (включая `architecture` и `quality`, каталогов для которых в пакете нет/пусто), проектное и плагинное деревья, протоколы исключены.
- **Tree mode** — все файлы правил в дереве (`rule_files_in_tree`, `:442-450`); **task mode** — только те, что цитирует тикет (`rule_files_for_task`, `:453-467`), «активированный» набор, против которого написана аксиома.
- **Как проверяется** — четыре `grep -q '<BeliefState'` / `'<AntiPatterns'` / `'<VerificationHooks'` / `'<RewardCriteria'` (`:481-484`). Скан **открывающего тега без `>`**, то есть `<BeliefState attr=…>` пройдёт, а `<Belief_State>` — нет.
- **Вывод** — TSV `file \t belief \t anti \t hooks \t reward \t verdict(OK|INCOMPLETE) \t missing`.
- **Отдельный счётчик** — `rule_findings=` не смешивается с `findings=`: «a shared rule file is project infrastructure that no single task owns or may edit, so it must not decide a task's verdict» (`:43-45`). Exit 3 при `findings + rule_findings > 0` (`:666`).

Маршрутизация находки в audit v1: `ai/directives/sdd/audit.directive.xml:85` — тип `RULE_FILE_INCOMPLETE`; `:125` — «enters this table capped at `MINOR`»; `:155` — route `rule-file-fix`, «Never `ticket-update`, never a phase owner, never `FAIL` for this task»; `:240` — «Section presence is NOT judged by eye — `sdd check --task <Task-ID>` emits `[RULES]` … Each `INCOMPLETE` row → one `RULE_FILE_INCOMPLETE`, its `missing` column copied verbatim».

Тесты v1:
- `scripts/__tests__/sdd-check-rules.test.ts` (226 строк, 8 кейсов) — тестирует **механику** `[RULES]` на синтетических фикстурах.
- `scripts/__tests__/testing-rule-contract.test.ts` (74 строки, 3 кейса) — тестирует **содержимое реальных файлов**, но по **хардкод-списку из шести**: `coding/result-conventions.xml`, `coding/uikit-spec-drafting.xml`, `testing/common.xml`, `testing/node-test.xml`, `testing/vitest-rules.xml`, `plugins/golang/directives/infra/golang-setup.xml` (`:17-24`). Плюс точечные assert'ы на конкретные ID (`HOOK_RESULT_LINT_RULES`, `AP_UNGUARDED_MUST_AT_BOUNDARY`, `HOOK_DRAFT_REQUIRED_SECTIONS`, `HOOK_GO_VERIFY_CHANGED_SCOPE`, `HOOK_RUN_PROJECT_VERIFICATION`, `AP_ACCEPT_OUTPUT_BY_REWRITING_EXPECTATION`).

**Дыра в v1, которую стоит назвать явно.** `testing-rule-contract.test.ts` — не контракт над категорией, а список. Четыре файла из `5a237cd5` (`coding/baseline-rules.xml`, `coding/python-rules.xml`, `coding/go-rules.xml`, `testing/baseline-testing.xml`) в него **не добавлены**; единственное, что их фиксирует в CI, — присутствие пути в `scripts/__tests__/deployed-surface.golden.txt:37,38,39,73`. А `check.sh` **не вызывается ни из `npm test`, ни из какого-либо git-хука — хуков в main нет вовсе** (`scripts/git-hooks/` не существует; `find -maxdepth 3 -name 'pre-commit*'` = ∅; единственный агрегат — `npm run lint`). Итого: полноту секций у нового файла правил в main не проверяет никто, кроме агента, который вручную запустит `sdd check`.

#### v2 — только замыкание каскада, и только одного из двух каналов

Единственный код правил в RC — `SDD_RULES_CASCADE_UNRESOLVED` (исчерпывающий grep `SDD_RULES_[A-Z_]+` по всему `rc-v6` даёт ровно этот один код, 11 вхождений в 7 файлах). Модуль `shared/sdd/rules-cascade.ts` (82 строки, `@consumers: sdd-check.cmd`), три чистых экспорта:

- `normalizeRulePath(ticketFile, repoRoot, linkTarget)` (`:23-33`) — резолв ссылки bullet'а в repo-root-relative POSIX-путь. Абсолютные формы возвращаются **дословно** намеренно: «Relativizing them first would disguise an absolute injection as traversal» (`:28-30`).
- `parseRuleDependsOn(content)` (`:41-45`) — `/<DependsOn>([\s\S]*?)<\/DependsOn>/`, затем `^\s*-\s+(\S+)` по строкам; `[]` при отсутствии секции. **`<InheritedBaseline>` этой функцией не читается вовсе.**
- `checkRulesCascadeClosure(file, phaseId, rules, depsMap)` (`:56-82`) — DFS; каждая прямая или транзитивная зависимость, отсутствующая в объявленном списке фазы, даёт одну ошибку (дедупликация через `Set`, `:65,72,76`). **Пустой `Rules:` короткозамыкается в `[]` (`:62`) — фаза без правил не флагается никогда.** Второй, независимый глушитель того же случая — `sdd-check.cmd.ts:429` (`if (ruleIds.length === 0) continue;`); плюс фильтр `:427` `.filter(rule => rule.endsWith('.xml'))` молча роняет ссылки без `.xml`. То есть пустой список правил невидим **в двух местах**, а не в одном.

Обвязка: `cli/cmd/sdd-check/sdd-check.cmd.ts` — `selectedRulePhases` (`:298`), `ruleDepsCache` (`:355`), `getRuleDeps` (`:358-392`), `buildRuleDepsMap` (`:394-415`, jsdoc «failed nodes are never treated as proven leaves» — `:394`) — **уже реализует** проверку существования транзитивных зависимостей для правил, цитируемых тикетом: не читаемый узел даёт `ERR_CLI_SDD_CHECK_READ_FAILED` (`:434-447`, «one failed identity produces one diagnostic while omitted transitive evidence still fails closed», `:431-433`).

**Чего в v2 нет:**
- ни одной проверки четырёх секций: grep `BeliefState|AntiPatterns|VerificationHooks|RewardCriteria` по `cli/`, `shared/`, `scripts/` в RC — **ноль вхождений в коде** (только в текстах директив/аксиом);
- `RULE_FILE_INCOMPLETE` существует в v2 только как **тип находки LLM-аудита** (`ax-rules-compliance-against-activated-rules.xml:12`, `ax-drift-taxonomy.xml:17`, `STEP_2_SEMANTIC.xml:134`, `ai/kit/contract/audit/finding-format.xml:5`) — механической подпорки нет;
- маршрутизация в v2 слабее, но **не «мягче»**, как могло бы показаться на первый взгляд — она **жёстче по severity и размытее по маршруту одновременно**: `ai/directives/sdd-v2/audit.directive.xml:188` даёт «ticket update to correct the declared Rules list OR a separate rule-maintenance task», без cap'а и без запрета `ticket-update`, при том что сама находка объявлена `MAJOR` (§1.1). Значит в v2 неполный общий файл правила снова может уронить вердикт конкретной задачи — ровно то, что v1 намеренно запретил тремя формулировками («capped at `MINOR`», «never `FAIL` for this task», route строго `rule-file-fix`);
- аудиты `ai/kit` (`audit:sdd-templates` = `check:directives-fresh` + `audit:axioms` + `audit:contracts` + `audit:halts` + `check:directive-budgets`) не смотрят на файлы правил: единственный, кто упоминает `directives/coding|testing|infra`, — `ai/kit/check-directives-fresh.ts`, и то чтобы **исключить** их из сравнения как не-сборочные (`:25,27,134`);
- перечень механических истин v2 зафиксирован в `ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml` — два списка (`--task`: якоря, Meta, Task-ID, fabricated DONE, граф фаз, покрытие `PHASE_Pn`; `--all`: DAG задач, трекер↔тикет, spec-ссылки, портал). **Ни полноты файла правила, ни согласованности реестра с диском, ни регистра секций в этих списках нет.** Более того, последний абзац прямо отдаёт «rules-cascade resolution» аудиту-модели — но здесь есть внутренний дрейф: `ax-rules-cascade-verification.xml:14` называет `RULES_CASCADE_CLOSURE` механической истиной «per `AX_MECHANICAL_VIA_SDD_CHECK`», а в самих перечнях `ax-mechanical-via-sdd-check.xml:5,6` этой проверки нет — перекрёстная ссылка внутри пакета висячая.

### 1.5 Как правила синхронизируются (ownership)

| Аспект | main (v1) | RC (v2) |
|---|---|---|
| Статусы | `'added' \| 'updated' \| 'unchanged' \| 'preserved'` (`cli/cmd/sync/sync.types.ts:8`) | `'added' \| 'updated' \| 'deleted' \| 'unchanged'` (`sync.types.ts:6`) |
| `knowledge.xml` | `PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])` (`sync-core.ts:27`), комментарий `:23-25`; ветка `:239-241` → `status = 'preserved'`, запись подавляется `:254` | обычный файл корня зеркала; перезаписывается |
| Зеркальное удаление | **нет** (grep `deleted`/`unlink` по `sync-core.ts` — ноль) | есть: `entries.push({ relativePath, status: 'deleted' })` + `deps.unlink` (`sync-core.ts:233-244`) — но **только внутри поставляемых подкаталогов** (`:221-232`, `listOwnedSubdirs`/`scanTargetMirrorSpace`; комментарий `:221-225` — «a target subdirectory the package never shipped is a project customization, left untouched and reported via `warnings`»). Под удар попадает проектный **файл внутри** поставляемой категории, не проектная категория целиком |
| Исключения | `EXCLUDED_ENTRIES = {'architecture', 'dbc-audit.directive.xml', 'dev-review.directive.xml', 'semantic-change-extractor.directive.xml'}` (`sync-core.ts:16-21`) | `EXCLUDED_ENTRIES = new Set(['architecture'])` (`sync-core.ts:16`) |
| Правила плагинов | `extraSourceDirs: pluginSurfaceDirs(_resolvePackageDir(cwd, 'plugins'), 'directives')` (`sync.cmd.ts:91`); слияние корней в `scanSourceRoots([opts.sourceDir, ...extraSourceDirs], …)` (`sync-core.ts:217`); нормализация путей `RULE_PLUGIN_DIRECTIVES` `plugins/<id>/directives/` → `ai/directives/` (`shared/common/sync/path-normalizer.ts:63-66`) | плагинов нет |
| Отчёт | `preserved` виден в выводе и в summary (`sync.types.ts:74-76`) | — |
| Тест-замок | `sync-core.test.ts` «preserves a project-owned knowledge.xml that differs» (`:223`) | `sync-core.test.ts` «deletes target directives removed from the installed package» (`:218`) |

Два скрытых следствия main-механики, релевантные дизайну:
1. `EXCLUDED_ENTRIES` исключает `architecture` из sync — а `SDD_RULE_PATH_RE` считает `architecture` каскадной категорией. Значит проектное правило `ai/directives/architecture/*.xml` в v1 проверяется `[RULES]`, но никогда не приезжает из пакета: это де-факто уже **проектно-владеемая категория**. То же в RC (`EXCLUDED_ENTRIES = {'architecture'}`). `ai/directives/architecture/` содержит только `README.md` в обеих ветках.
2. Слияние `extraSourceDirs` в один `Map` по `relativePath` (`sync-core.ts:217`) означает: два плагина, положившие `infra/<одно-имя>.xml`, тихо перетрут друг друга. Это задокументировано как инвариант для коллизии *источник-vs-база* («the base root wins a path collision», `sync-core.ts:77-78`), но коллизия именно между двумя *плагинами* по-прежнему недиагностируема.

### 1.6 Пер-стековые правила: пакет vs потребители

#### main (v1), 23 файла правил, все четыре секции у всех (прогон §2.1)

| Категория | Файлы |
|---|---|
| `coding` (10) | `baseline-rules`, `typescript-rules`, `python-rules`, `go-rules`, `result-conventions`, `svelte5-runes`, `sveltekit-rules`, `uikit-component-svelte`, `uikit-component-storybook`, `uikit-spec-drafting` |
| `testing` (8) | `baseline-testing`, `common`, `node-test`, `vitest-rules`, `playwright-cli`, `playwright-e2e`, `storybook-usage`, `svelte-testing` |
| `infra` (4) | `eslint-setup`, `git-setup`, `nodejs-npm-setup`, `storybook-setup` |
| plugin (1) | `plugins/golang/directives/infra/golang-setup.xml` |

Граф `<DependsOn>` в main (12 рёбер, воспроизведён верификатором дословно):

```
coding/baseline-rules.xml            ← (лист-родитель)
testing/baseline-testing.xml         ← (лист-родитель)
coding/python-rules.xml       → coding/baseline-rules.xml, testing/baseline-testing.xml
coding/go-rules.xml           → coding/baseline-rules.xml, testing/baseline-testing.xml
coding/svelte5-runes.xml      → coding/typescript-rules.xml
coding/sveltekit-rules.xml    → coding/typescript-rules.xml, coding/svelte5-runes.xml
coding/uikit-component-svelte.xml    → coding/svelte5-runes.xml, coding/uikit-spec-drafting.xml
coding/uikit-component-storybook.xml → testing/storybook-usage.xml, coding/uikit-component-svelte.xml
testing/node-test.xml         → testing/common.xml
testing/vitest-rules.xml      → testing/common.xml
testing/playwright-cli.xml    → coding/typescript-rules.xml
testing/playwright-e2e.xml    → coding/typescript-rules.xml, testing/playwright-cli.xml
testing/svelte-testing.xml    → testing/vitest-rules.xml, coding/svelte5-runes.xml
```

Заметная асимметрия: `coding/typescript-rules.xml` **не** объявляет `<DependsOn> - ai/directives/coding/baseline-rules.xml`, хотя `python-rules` и `go-rules` объявляют, а `knowledge.xml:72` говорит «Language rules (python-rules, go-rules, typescript-rules) inherit this». То есть TS-правило единственное из трёх языковых, у которого наследование baseline объявлено только прозой реестра.

Второе: `python-rules`/`go-rules` тянут `testing/baseline-testing.xml` в `<DependsOn>` **coding**-правила. Замыкание корректно, но любая python-фаза с `python-rules` обязана нести и тестовое правило, даже фаза `kind=impl` без тестовых файлов — осознанный компромисс «толстый лист вместо второго входа», ломающий симметрию «coding-правила отвечают за coding».

#### RC (v2), 17 файлов правил, два неполных

| Файл | belief | anti | hooks | reward | `<DependsOn>` |
|---|---|---|---|---|---|
| `coding/svelte5-runes.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `coding/sveltekit-rules.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `coding/typescript-rules.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `coding/uikit-component-storybook.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `coding/uikit-component-svelte.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| **`coding/uikit-spec-drafting.xml`** | ✔ | ✔ | **✗** | ✔ | — |
| `testing/common.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `testing/node-test.xml` | ✔ | ✔ | ✔ | ✔ | — (несёт `<InheritedBaseline>` `:8`, механически невидим) |
| `testing/playwright-cli.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `testing/playwright-e2e.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `testing/storybook-usage.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `testing/svelte-testing.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| **`testing/vitest-rules.xml`** | ✔ | ✔ | ✔ | **✗** | — (несёт `<InheritedBaseline>` `:8`, механически невидим) |
| `infra/eslint-setup.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `infra/git-setup.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `infra/nodejs-npm-setup.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `infra/storybook-setup.xml` | ✔ | ✔ | ✔ | ✔ | — |

Топ-уровневые теги неполных файлов (доказательство, что это не другое имя секции, а её отсутствие):
- `testing/vitest-rules.xml`: `<Mission>` `:2`, `<InheritedBaseline>` `:8`, `<BeliefState>` `:12`, `<TestPatterns>` `:92`, `<AntiPatterns>` `:253`, `<VerificationHooks>` `:285` — конец файла, `<RewardCriteria>` отсутствует. Ирония: именно этот файл входит в белый список main-теста `testing-rule-contract.test.ts:22,46`.
- `coding/uikit-spec-drafting.xml`: `<DirectiveContext>` `:2`, `<BeliefState>` `:15`, `<DraftingProcedure>` `:117`, `<AntiPatterns>` `:197`, `<RewardCriteria>` `:223` — `<VerificationHooks>` отсутствует. Тоже в белом списке main-теста (`:19,45`).

**Три `uikit-*`-файла недостижимы из реестра вообще**, а не только «через `<DependsOn>` другого правила», как может показаться при беглом чтении: перебор всех 7 `<DependsOn>`-ссылок в RC (`typescript-rules`, `svelte5-runes`, `sveltekit-rules`, `testing/common`, `vitest-rules`, `node-test`, `playwright-cli`, `playwright-e2e`, `storybook-usage`, `svelte-testing`, `eslint-setup`, `git-setup`, `nodejs-npm-setup`, `storybook-setup`) не даёт ни одной ссылки на `uikit-*`. Зависимости идут только внутрь кластера: `uikit-component-storybook` → `storybook-usage` + `uikit-component-svelte`; `uikit-component-svelte` → `svelte5-runes` + `uikit-spec-drafting`. 919 строк (`coding/uikit-component-storybook.xml`, `coding/uikit-component-svelte.xml`, `coding/uikit-spec-drafting.xml`) попадают в тикет **исключительно через тир `task`** (операторское решение) — они не зарегистрированы в `<Rules>` вовсе (см. T-11 в §5).

`ai/directives/architecture/` содержит только `README.md`, при этом формат `formats/scope-tasks-index.xml:21` приводит в примере `ports-adapters` как architecture-правило скоупа. Это **не регресс v2**: дефект унаследован из v1 буквально — `MAIN/scaffold.directive.xml:794` несёт ту же строку Cascade Table, а `:411` даёт **рабочий пример** с Markdown-ссылкой `[ports-adapters](../../../ai/directives/architecture/ports-adapters.xml)`, и `MAIN/ai/directives/architecture/README.md` описывает `ports-adapters.xml` как существующий файл, которого физически нет ни в main, ни в RC. `AX_RULES_RESOLUTION_HARD_FAIL` на этой ссылке должен абортить в обеих ветках.

#### Потребитель `cloud-ios` — что проект написал сам

Реестр (`ai/directives/knowledge.xml` на ветке akkrat, 119 строк): `<Directives>` `:2-46` — копия пакетного блока (6 записей); `<Rules>` `:48` — **полностью переписан**:

| Категория | `<Rule id>` | Файл | `<CheckPhase>` | Примечание из реестра |
|---|---|---|---|---|
| Coding | `swift-rules` | `ai/directives/coding/swift-rules.xml` | `lint` | `<ActivationHint>` предупреждает: «`AP_TRUST_DISABLED_RULE`: force_unwrapping and three sibling rules are inactive in MRCloudApp/.swiftlint.yml, so a clean lint is not evidence about them — those are review-enforced» |
| Coding | `objc-rules` | `ai/directives/coding/objc-rules.xml` | *(пусто)* | «No tool checks these axioms: swiftlint does not read Objective-C and the formatter is off by decision, so compliance is established at review» |
| Testing | `xctest-rules` | `ai/directives/testing/xctest-rules.xml` | `test` | — |
| Infra | `git-setup` | `ai/directives/infra/git-setup.xml` | *(пусто)* | «Two deviations in this repository … Take the discipline, not the examples» — **проект оставил пакетное правило, но переписал его `<ActivationHint>`** |
| Infra | `swiftlint-setup` | `ai/directives/infra/swiftlint-setup.xml` | `lint` | «`AX_RULE_LISTS_ARE_EXCLUSIVE` is currently violated by four rules — `HOOK_RULE_LIST_EXCLUSIVITY` prints the count» |

Плюс собственный `<CheckPhaseOrder>lint build test</CheckPhaseOrder>` (`:54`, с объяснением, почему нет `typecheck` и `format`) и комментарий-предупреждение прямо в реестре (`:56-60`): «`RequiresVerification=check-command` is the composed entry point; here that is `gennady verify` … the alias is resolved through the infra scope spec's Verification Commands, and `specs/infra-base` §4 still numbers its commands V1..V10 without declaring aliases. **Until it does, check-command does not resolve in this repository.**»

Файлы правил проекта — все четыре секции + `<DependsOn>` там, где надо: `swift-rules.xml` (`<Mission>` `:2`, `<BeliefState>` `:12`, `<AntiPatterns>` `:84`, `<VerificationHooks>` `:128`, `<RewardCriteria>` `:151`); `objc-rules.xml` (`<DependsOn>` `:13`); `xctest-rules.xml` (`<DependsOn>` `:16`); `swiftlint-setup.xml` (`<DependsOn>` `:11`). Хуки — реальные команды их гейта: `HOOK_SWIFTLINT` → `gennady verify --only=swiftlint` (`swift-rules.xml:131`), `HOOK_SWIFTLINT_AUTOCORRECT` → `gennady fix` (`:136`), `HOOK_UNIT_TESTS` → `gennady verify --only=unit-tests` (`:141`), `HOOK_FORCE_OPERATORS_MANUAL` → `git diff --unified=0 origin/master -- 'MRCloudApp/**/*.swift' | grep -nE '(as!|try!|\)!|\]!)' || true` (`:146`).

Cascade Table (`tasks/infra-base/README.md`, 69 строк) — по форме ровно v1-шаблон `scaffold.directive.xml:785-801`, по содержанию — разбор реальной активации:

```
| Tier                   | coding      | testing      | architecture | infra            |
| traversed-scopes       | —           | —            | —            | —                |
| infra-base (target)    | swift-rules | xctest-rules | —            | swiftlint-setup  |
| task                   | swift-rules | xctest-rules | —            | swiftlint-setup  |
```

и текст под таблицей, дословно: «`swift-rules` попадает в каскад двумя путями: напрямую на фазах, где правятся `.swift`, и транзитивно через `<DependsOn>` у `swiftlint-setup`»; «Тир `task` собран по фазам, а не по одной»; «вывод по `<Triggers>` даёт пустое множество … Оба правила подключены решением тикета … Чистая альтернатива — дописать в `<Triggers>` … но это правка `knowledge.xml` и файла правила, вне границ скоупа»; «Не активируются: `git-setup` …, `objc-rules` …». Это самое точное описание проблемы тира `task` во всём корпусе — и оно написано потребителем, а не пакетом; ни в v1 (`scaffold.directive.xml:84` — «operator-supplied during ticket generation», без формата), ни в v2 (`ax-rules-cascade-resolution.xml:9` — та же формулировка) у тира `task` нет формата записи причины.

Цена, которую платит `cloud-ios`: в дереве лежат **18** синхронизированных, но не зарегистрированных в их реестре пакетных правил Node/TS — 7 `coding/{result-conventions,svelte5-runes,sveltekit-rules,typescript-rules,uikit-component-storybook,uikit-component-svelte,uikit-spec-drafting}.xml` + 4 `infra/{eslint-setup,golang-setup,nodejs-npm-setup,storybook-setup}.xml` + 7 файлов `testing/` пакета. Важная оговорка для планирования миграции: их дерево — срез пакета **до** `5a237cd5` (на диске нет `coding/{baseline-rules,python-rules,go-rules}.xml`, `testing/baseline-testing.xml`), поэтому после релиза v2 набор незарегистрированных файлов у них изменится, и любая миграция (T-7) должна строиться от того, что пакет **будет** поставлять, а не от текущего среза.

#### Потребитель `messenger` — старая схема секций

Дерево (без учёта `README.md` в каждом каталоге): `coding/` — 8 файлов, включая **проектный `logging-rules.xml`**; `testing/` — 7; `infra/` — 4; итого 19. Плюс своя категория `language/` с проектной директивой `lang-lint.directive.xml` (21 543 байта) + `README.md` + `examples.md`, и `perf-auditor/rules/` (корректно **не** попадает в `[RULES]` — категория вне каскада).

Реестр `messenger/ai/directives/knowledge.xml`: 19 `<Rule>` записей; проектная запись `logging-rules` (`:70-78`); проектная директива зарегистрирована в блоке `<Directives>` — `<File>ai/directives/language/lang-lint.directive.xml</File>` (`:49`). Дрейф: `:26`, внутри блока `<Directives>`, ссылается на `ai/directives/sdd/task-scaffolding.directive.xml`, а в дереве файл называется `scaffold.directive.xml` — **висячая ссылка в проектном реестре**, но именно в той его части (`<Directives>`), которой в реестре v2 нет вообще (см. §3.4).

Главный факт: **вся вокабуляра секций в `messenger` — snake_case.** Частоты топ-уровневых тегов по 19 файлам правил:

```
19  <Belief_State      16  <Reward_Criteria    16  <Mission        16  <Anti_Patterns
15  <Verification_Hooks 13 <Definitions       10  <Code_Patterns   7  <Depends_On
 5  <Workflow_Outline   4  <Setup_Steps        3  <Directive_Context
 2  <Inherited_Baseline
```

`<Inherited_Baseline>` встречается дважды — то есть у `messenger` невидим не только основной канал наследования (`<Depends_On>`, 7 файлов), но и второй, `<Inherited_Baseline>` (2 файла): оба канала одновременно в старом регистре, оба тихо игнорируются механикой RC.

Следствия, обе — доказанные прогоном/чтением кода:
- `check.sh [RULES]` на `messenger` даёт **19 строк `INCOMPLETE` с `missing = BeliefState,AntiPatterns,VerificationHooks,RewardCriteria`** (полный прогон в §2.1). Инструмент говорит «правил нет вообще» там, где правила есть — но в другом регистре;
- RC-парсер `parseRuleDependsOn` (`shared/sdd/rules-cascade.ts:42`) на `<Depends_On>` возвращает `[]`. Значит `checkRulesCascadeClosure` в `messenger` **всегда зелёный** — 7 файлов с объявленными зависимостями невидимы. Это не «нет проверки», это **ложно-положительная проверка**.

Для сравнения: `cloud-ios` синхронизировался позже и стоит на CamelCase-генерации. То есть **регистр секций у потребителя определяется датой последнего `sync`**, миграции нет, а версии схемы, по которой можно было бы отличить одно от другого, не существует.

### 1.7 Сводная таблица: v1 vs v2 vs реальность потребителя

| Свойство | v1 (main `8bb38477`) | v2 (RC) | `cloud-ios` | `messenger` |
|---|---|---|---|---|
| Файлов правил | 23 (вкл. 1 плагинный) | 17 | 4 своих + 18 незарегистрированных пакетных | 19 (1 своё) |
| Все четыре секции | 23/23 (`check.sh` tree: `rule_findings=0`) | **15/17** — `testing/vitest-rules.xml` без `<RewardCriteria>`, `coding/uikit-spec-drafting.xml` без `<VerificationHooks>` | 4/4 у своих | **0/19** (snake_case) |
| Регистр секций | CamelCase | CamelCase (но директивы пакета — snake_case, M-4) | CamelCase | **snake_case** |
| Записей в реестре | 19 (+ блок `<Directives>` 6) | 14 (без `<Directives>`) | 5 (свой `<CheckPhaseOrder>`) | 19 (+ 7 директив, 1 висячая — внутри `<Directives>`) |
| Стек-агностичный baseline | `coding/baseline-rules.xml`, `testing/baseline-testing.xml` | **нет** | нет (не нужен) | нет |
| Языки в реестре | TS, Python, Go (+Svelte/SvelteKit); ни одной задачи под python/go в `tasks/` нет — правила без обратной связи | **только TS** (`<Triggers>` ловят любой язык) | Swift, ObjC | TS + Svelte |
| Механическая проверка секций | `check.sh:436-491` + `_sdd-lib.sh:14`; счётчик `rule_findings` `:664` | **нет** | (тем же `check.sh`) | (тем же `check.sh` → 19 INCOMPLETE) |
| Проверка замыкания зависимостей | прозой аудита, механики нет | `rules-cascade.ts:56-82` → `SDD_RULES_CASCADE_UNRESOLVED`, но читает только `<DependsOn>`, не `<InheritedBaseline>` | — | **ложно-зелёная** по обоим каналам |
| Контрактный тест содержимого | `testing-rule-contract.test.ts` — белый список 6 файлов | **нет** | — | — |
| `RULE_FILE_INCOMPLETE` | тип, cap `MINOR`, route `rule-file-fix` (`audit.directive.xml:85,125,155,240`) | тип, severity `MAJOR`, маршрут размыт (`ax-rules-compliance-against-activated-rules.xml:12`, `audit.directive.xml:188`) | — | — |
| `knowledge.xml` при `sync` | `preserved` | **перезаписывается** | пострадал трижды (A4 #24) | не синхронизировался |
| Правило проекта в пакетной категории | выживает | **удаляется** (только внутри поставляемых подкаталогов) | — | `coding/logging-rules.xml` под угрозой |
| Стек-правила плагина | файл едет, запись в реестре — **нет** | плагинов нет; **нет и `services/stack/`** (тип `StackPlugin` отсутствует) | — | — |
| Cascade Table живёт в | `tasks/<scope>/README.md` | `specs/<scope>/<scope>.3-tasks.md` | `tasks/infra-base/README.md` | — |
| Тиров каскада | 4 фактических (текст ошибочно говорит «5») | 4 (исправлено) | использует 3 из 4 | — |
| Реестр: слияние слоёв | нет (один файл) | нет — «проектный ИЛИ пакетный» | — | — |

### 1.8 `cli/cmd/agents-rules/**` — что это на самом деле

К слою правил **не относится**. `cli/cmd/agents-rules/agents-rules.cmd.ts` (47 строк, идентичен по существу в main и RC) печатает содержимое `cli/cmd/orient/README.md` из установленного пакета: «Prints agent-facing orient documentation from the gennady package README.md» (`:10-11`). Проверяет наличие `node_modules/gennady` (`:19`), резолвит пакет через `import.meta.resolve('gennady')` (`:24`), читает `resolve(packageDir, 'cli/cmd/orient/README.md')` (`:32`), `console.log(content)` (`:41`). Никакого отношения к `knowledge.xml`, `<Rule>`, каскаду или файлам правил. Имя команды («rules» = «правила поведения для агентов») — источник путаницы: в трекере RULES она проходит как ложное срабатывание. **Задача T-10 в §5** — переименовать в `agents-orient` при следующем ломающем изменении CLI.

---

## 2. Инварианты R1–R5 из main: вердикт в v2

Легенда: **ЗАКРЫТО** — инвариант держится в v2 и есть замок; **ЧАСТИЧНО** — держится частью или без замка; **НЕ ЗАКРЫТО** — нарушен или отсутствует; **НЕПРИМЕНИМО** — предмет инварианта в v2 отсутствует по дизайну.

### R1 — все файлы правил каскадных категорий несут четыре проверяемые секции; `sdd check` tree даёт `rule_findings=0`

**Формулировка main** (A1 §3.4): коммиты `d86c49dd` (6 файлов дополнены; новый контрактный тест) + `5a237cd5` (+4 файла, все полные). Замки: `scripts/__tests__/testing-rule-contract.test.ts`, `scripts/__tests__/sdd-check-rules.test.ts`.

**Вердикт в v2: НЕ ЗАКРЫТО (регресс + отсутствие механизма).**

Доказательства:
1. `ai/directives/testing/vitest-rules.xml` в RC заканчивается на `<VerificationHooks>` (`:285`) — `<RewardCriteria>` нет. `ai/directives/coding/uikit-spec-drafting.xml` несёт `<BeliefState>` `:15`, `<DraftingProcedure>` `:117`, `<AntiPatterns>` `:197`, `<RewardCriteria>` `:223` — `<VerificationHooks>` нет.
2. Оба файла — ровно те, что `d86c49dd` в main **починил** и внёс в белый список `testing-rule-contract.test.ts:19,22,45,46`. То есть RC отошёл от main до этого фикса и не впитал его.
3. В RC нет ни одной механической проверки секций: grep `BeliefState|AntiPatterns|VerificationHooks|RewardCriteria` по `cli/`, `shared/`, `scripts/` — ноль вхождений в коде.
4. `RULE_FILE_INCOMPLETE` в v2 — только тип находки LLM-аудита (`ax-rules-compliance-against-activated-rules.xml:12`), без обязательной механической подпорки.
5. Маршрутизация не «мягче» — она изменена по двум осям сразу, в разные стороны: в v1 находка **cap'ится до `MINOR`** (`audit.directive.xml:125`) и жёстко маршрутизируется в `rule-file-fix` с тремя запретами (`:155`); в v2 она объявлена **`MAJOR`** (`ax-rules-compliance-against-activated-rules.xml:12`), а маршрут размыт до «ticket update … OR a separate rule-maintenance task» (`audit.directive.xml:188`), без cap'а и без запрета `ticket-update`. Итог: **жёстче по severity, размытее по маршруту** — неполный общий файл правила в v2 снова способен уронить вердикт задачи, которой этот файл не принадлежит, что v1 специально запретил.

Побочно про main: инвариант там держится, но замок слабый — белый список из 6 файлов, четыре новых файла не покрыты содержательным тестом, `check.sh` не входит ни в `npm test`, ни в какой-либо git-хук (хуков в main нет вовсе).

### R2 — рёбра каскада объявлены, а не описаны прозой: `<DependsOn>` у `vitest-rules`/`node-test` → `testing/common.xml`; у `python-rules`/`go-rules` → `baseline-rules`

**Формулировка main**: `ac2e9d73` + `5a237cd5`; `testing/node-test.xml:8`, `testing/vitest-rules.xml:8`, `coding/go-rules.xml:8`, `coding/python-rules.xml:7`.

**Вердикт в v2: НЕ ЗАКРЫТО в части содержимого, ЗАКРЫТО в части механики.**

- Механика в v2 **сильнее** main: `checkRulesCascadeClosure` (`rules-cascade.ts:56-82`) даёт `SDD_RULES_CASCADE_UNRESOLVED` за каждую недостающую прямую или транзитивную зависимость; в main такой проверки нет вообще, только прозой в `audit.directive.xml:264`. Внутренний конфликт main, который стоит зафиксировать здесь же: `audit.directive.xml:240` называет `<DependsOn>` «optional and unchecked», а `:253/:264` требуют, чтобы правило **обязательно** появлялось в каскаде и заводят находку `RULES_CASCADE_MISMATCH` (`MAJOR`, тег `unresolved-dependency`) — обе формулировки в одном файле директивы противоречат друг другу.
- Содержимое в v2 **не «снова только проза», а другой механический канал, который проверка не читает**: ни `testing/vitest-rules.xml`, ни `testing/node-test.xml` в RC не несут `<DependsOn>` — оба несут `<InheritedBaseline>` (`vitest-rules.xml:8`, `node-test.xml:8`, markdown-ссылка на `./common.xml`), и это объявление имеет силу рантайма по `ax-rules-load-from-phase-block.xml:5-11` (модель обязана открыть указанную базу). Но `parseRuleDependsOn` (`rules-cascade.ts:42`) эту секцию не парсит — то есть **наследование объявлено, но в канале, который замыкание не читает**, и `checkRulesCascadeClosure` тихо считает эти правила листьями. `knowledge.xml` при этом всё равно объявляет `<CrossRef id="testing-common">` у `node-test`/`vitest-rules`/`svelte5-runes` (не у `svelte-testing` — см. §1.2), и это ребро `checkRulesCascadeClosure` никогда не потребует ни при каком канале.
- `python-rules`/`go-rules` в RC отсутствуют физически — ребро к `baseline-rules` неприменимо, потому что нет ни одного, ни другого.
- Дефект механики v2 — `if (rules.length === 0) return []` (`rules-cascade.ts:62`) — фаза с пустым `Rules:` не проверяется вообще, и это дублируется независимым глушителем в `sdd-check.cmd.ts:429`; плюс фильтр `:427` роняет ссылки без `.xml`. Легальный случай по main-аксиоме («A scope that legitimately activates no rules yet declares an empty set (valid)»), но и самый простой способ обойти проверку — молча, в двух местах сразу.

### R3 — реестр регистрирует стек-агностичных родителей и тонкие языковые правила; `typescript-rules` триггерится только на `.ts/.tsx`; шапка объявляет реестр PROJECT-OWNED

**Формулировка main**: `5a237cd5` + `f74c8c1d`; `ai/directives/knowledge.xml:3,67-103,129`.

**Вердикт в v2: НЕ ЗАКРЫТО (все три части).**

| Часть | main | RC |
|---|---|---|
| `baseline-rules` в реестре | `knowledge.xml:67-75` | нет записи, нет файла |
| `baseline-testing` в реестре | `knowledge.xml:129-137` | нет записи, нет файла |
| `python-rules` / `go-rules` | `:85-94` / `:95-104`, оба с `<CrossRef id="baseline-rules">` | нет |
| `typescript-rules` `<Triggers>` сужен | `:79` `.ts / .tsx`; `<SkipWhen>` `:80` «non-TypeScript language (see python-rules / go-rules)» | `:9` «source code files (not config)» — **активируется на `.py`, `.go`, `.swift`** |
| Шапка PROJECT-OWNED | комментарий `:2-7` | нет комментария |

Практический смысл последней строки: v2, применённый к python-проекту, положит в фазу `[typescript-rules](ai/directives/coding/typescript-rules.xml)` — 589 строк TS-специфики — как правило для `.py`-файлов. Эта порча детерминирована не только семантически (модель читает `<Triggers>`), но и машинно: `sdd-new` печатает канонические кортежи прямо из реестра в тикет (`help.ts:92`, `sdd-new.types.ts:314` — см. §1.3, шаг 9).

### R4 — golang-специфика живёт в плагине и синхронизируется потребителю как `ai/directives/infra/golang-setup.xml`; node не поставляет директив

**Формулировка main**: `a336f17b`, `5651c05f`, `d6479748`; `plugins/golang/plugin.json`, `shared/common/sync/path-normalizer.ts:63-65`; замки — `publish-contents.e2e.test.ts`, `sync-skills.e2e` «plugin-owned skills», `deployed-surface.golden.txt`.

**Вердикт в v2: НЕПРИМЕНИМО (в RC нет каталога `plugins/` вовсе) — и это дыра, а не упрощение.**

Что подтверждено в main:
- `plugins/golang/plugin.json` = `{ "id": "golang", "kind": "stack", "entry": "golang-plugin.ts" }`, но сам список поставляемых поверхностей (`directives` в т.ч.) манифест не объявляет напрямую — каталог `directives` приходит из `DEFAULTS` резолвера (`services/plugins/resolve-plugins.ts:24`), а не из `plugin.json`. Это уточняет, но не отменяет цитату `plugins/plugins.spec.md:317` про критерий владения;
- файл правила плагина: `plugins/golang/directives/infra/golang-setup.xml` (184 строки), все четыре секции (`<BeliefState>` `:10`, `<AntiPatterns>` `:134`, `<VerificationHooks>` `:160`, `<RewardCriteria>` `:175`), корневой тег `type="infra-rules"`;
- доставка: `sync.cmd.ts:91` → `sync-core.ts:217` → путь в потребителе `ai/directives/infra/golang-setup.xml` (`deployed-surface.golden.txt:50`), тексты нормализуются `RULE_PLUGIN_DIRECTIVES` (`path-normalizer.ts:63-66`);
- скилл плагина маршрутизируется из `sdd-infra/SKILL.md:9` и на `:109` велит прочитать файл правила;
- node действительно не поставляет директив: `ai/directives/infra/nodejs-npm-setup.xml` остался в `ai/` — критерий владения в `specs/plugins/plugins.spec.md:317`.

**Но инвариант неполон даже в main, и дыра глубже, чем видна на первый взгляд:**
- `<Rule id="golang-setup">` в `ai/directives/knowledge.xml` **отсутствует** (grep `golang-setup` по main: **30 вхождений в 14 файлах** — README, спеки, скилл, тест, golden, — и **ни одного в реестре**). `AX_RULE_ACTIVATION_PLAN` (шаг «evaluate its `<Triggers>` and `<SkipWhen>`») не может его активировать. Правило доезжает до потребителя как файл, но не как участник каскада.
- Тип `StackPlugin` (`services/stack/stack.types.ts:315-335`, `gateIds` на `:332`) несёт `id`, `marker`, `description`, `detect()`, `gateIds`, `verify` — **facet'а правил нет**.
- Дыра глубже, чем «нет `plugins/`»: в RC нет и каталога **`services/stack/`** вовсе (`ls -d rc-v6/services/stack` не существует). Значит `StackPlugin`, `gateIds`, `detect()` в v2 отсутствуют не только как реализация, а **как тип** — вариант R-C (§4.3), который опирается на `gateIds` для раскрытия `<RequiresVerification>`, заблокирован **тремя** отсутствиями (`plugins/`, `services/stack/`, `gennady.yaml`), а не двумя.

### R5 — scaffold: ссылка на правило либо резолвится, либо abort; не-Node скоуп пишет свои правила и вносит их в project-owned реестр; пустой набор правил валиден, висячая ссылка — нет

**Формулировка main**: `f74c8c1d`; `ai/directives/sdd/scaffold.directive.xml:74,95,470`. Замка нет — только текст директивы.

**Вердикт в v2: ЧАСТИЧНО.**

Что сохранилось: `ai/kit/axiom/scaffold/ax-rules-resolution-hard-fail.xml:2-4` несёт «All rule references must resolve; missing rule = abort … Each ref must exist as `ai/directives/<category>/<rule>.xml`. On miss: abort with explicit list. A placeholder rule reference (TBD, `<rule>`, "to be authored", any unresolved name) = abort».

Что **потеряно** относительно main `scaffold.directive.xml:74`: три предложения целиком —

> «The rule set is PROJECT-OWNED (`ai/directives/knowledge.xml`, kept across sync): the shipped rules are TypeScript-oriented, so a non-Node scope authors its own rule files for its stack and lists them — do NOT invent references to package rules that do not exist for the project's language. A scope that legitimately activates no rules yet declares an empty set (valid); this is distinct from a dangling reference (abort).»

В RC этого нет ни в `ax-rules-resolution-hard-fail.xml`, ни в `ax-rule-activation-plan.xml`, ни в `ax-rules-cascade-resolution.xml`, ни в `ai/directives/sdd-v2/scaffold.directive.xml`. Инструкция «пиши свои правила, а не выдумывай ссылки на пакетные» — именно та, которая спасала `cloud-ios`, — исчезла из v2.

Ослабляющий фактор в v2, компенсирующий частично: `ai/kit/axiom/scaffold/ax-scope-rules-declaration.xml:9-14` (источник — `discovery.directive.xml`) сохранил трёхвариантный операторский разбор отсутствующего правила: **skip** / **research-and-author** (WebFetch авторитетных доков → черновик → одобрение оператора → запись в `ai/directives/<category>/<name>.xml`) / **defer**, с `H_MISSING_RULE_FILE` только при отказе оператора выбирать. Это работающая тропа авторинга — но она пишет файл в **пакетную категорию**, которую v2-`sync` затем удаляет **как файл** (не как категорию, см. §1.5) — конфликт между тропой авторинга и механикой sync подтверждён (`sync-core.ts:233-244`).

Пример `ports-adapters` в `formats/scope-tasks-index.xml:21` — не регрессия v2, а перенос дефекта v1 (см. §1.6): `MAIN/scaffold.directive.xml:411,794` несёт тот же пример с той же несуществующей ссылкой.

### Сводка R1–R5

| # | Инвариант | Вердикт в v2 | Главное доказательство |
|---|---|---|---|
| R1 | четыре секции у всех файлов правил; `rule_findings=0` | **НЕ ЗАКРЫТО** | `testing/vitest-rules.xml` без `<RewardCriteria>`; `coding/uikit-spec-drafting.xml` без `<VerificationHooks>`; ноль механических проверок секций в коде RC |
| R2 | рёбра каскада объявлены в `<DependsOn>` | **НЕ ЗАКРЫТО** (содержимое) / **ЗАКРЫТО** (механика) | RC `vitest-rules`/`node-test` объявляют `<InheritedBaseline>`, а не `<DependsOn>`; замыкание читает только второе; `rules-cascade.ts:56-82` + 7/7 тестов |
| R3 | baseline-родители + тонкие языковые правила; узкий `<Triggers>` у TS; шапка PROJECT-OWNED | **НЕ ЗАКРЫТО** | RC `knowledge.xml:9` — TS-правило ловит любой язык; нет `baseline-*`, `python-rules`, `go-rules`; нет шапки; порча усилена машинной тропой `sdd-new` |
| R4 | стек-специфика в плагине, доезжает как `ai/directives/infra/*` | **НЕПРИМЕНИМО** (нет `plugins/` в RC) — и неполон в main: нет `<Rule>`-записи, нет facet'а в `StackPlugin`, а в RC нет и `services/stack/` — тип отсутствует полностью | `services/stack/stack.types.ts:315-335`; grep `golang-setup` в main — 30 вхождений/14 файлов, 0 в реестре |
| R5 | ссылки резолвятся или abort; не-Node скоуп пишет свои правила; пустой набор валиден | **ЧАСТИЧНО** | `ax-rules-resolution-hard-fail.xml` сохранил abort, потерял три предложения про PROJECT-OWNED / свои правила / валидный пустой набор |

### 2.1 Прогоны (evidence, воспроизведены дважды — аналитиком и независимо верификатором, побитово)

**(1) RC — тесты каскада правил.** `node --import tsx --test rc-v6/shared/sdd/__tests__/rules-cascade.test.ts`:

```
# tests 7   # suites 3   # pass 7   # fail 0   # duration_ms 217.97
  checkRulesCascadeClosure
    ok 1 - замыкание полное → без findings
    ok 2 - пропущена прямая зависимость → SDD_RULES_CASCADE_UNRESOLVED
    ok 3 - пропущена транзитивная (второй уровень) зависимость → находка
    ok 4 - пустой список правил → без findings
```

Механика замыкания в v2 корректна и покрыта; кейс 4 фиксирует поведение «пустой список не проверяется» как намеренное (но, как показано в R2, дублируется вторым независимым глушителем в `sdd-check.cmd.ts`, который эти тесты не покрывают).

**(2) MAIN — тесты правил.** `node --import tsx --test scripts/__tests__/testing-rule-contract.test.ts scripts/__tests__/sdd-check-rules.test.ts`:

```
# tests 11   # suites 2   # pass 11   # fail 0   # duration_ms 900.74
```

**(3) MAIN — `check.sh` tree-режим по своему дереву.** 23 строки, все `OK`:

```
[RULES]
# file	belief	anti	hooks	reward	verdict	missing
ai/directives/coding/baseline-rules.xml	1	1	1	1	OK	-
ai/directives/coding/go-rules.xml	1	1	1	1	OK	-
… (ещё 20 строк, все OK) …
plugins/golang/directives/infra/golang-setup.xml	1	1	1	1	OK	-

[SUMMARY]
mode=tree
findings=90
rule_findings=0
```

`rule_findings=0` — R1 в main подтверждён фактическим прогоном (`findings=90` — это TASKID/TRACKER_SYNC/LOG самохостинга, вне трека RULES).

**(4) `messenger` — тот же `check.sh` на реальном потребителе.** 19 строк, все `INCOMPLETE`, `missing = BeliefState,AntiPatterns,VerificationHooks,RewardCriteria`, `findings=718`, `rule_findings=19`.

Причина — единственная: старый регистр секций, см. §1.6. Инструмент, который на живом проекте с 19 корректно написанными правилами говорит «19 нарушений», обучает своих пользователей игнорировать его вывод.

**(5) Статические срезы секций** (полные таблицы в §1.6): main 23/23 полных; RC 15/17; `cloud-ios` свои 4/4 полных; `messenger` 0/19 из-за регистра.

Все пять пунктов независимо воспроизведены верификатором на отдельном прогоне с идентичным результатом, включая частоты snake_case-тегов у `messenger` число в число (с одним дополнением — 2× `<Inherited_Baseline>`, см. §1.6).

---

## 3. Проблема слоя правил

### 3.1 Что ломается у не-Node проекта сегодня

Тропа проекта на Python/Go/Swift, шаг за шагом.

| Шаг тропы | v1 (main) | v2 (RC) |
|---|---|---|
| 1. Discovery/infra выбирает инструменты | работает; `sdd-infra` маршрутизирует на `sdd-infra-golang` только для Go, для Python/Swift ветки нет | работает по scope-type, стек нигде не выбирается (B1 §4.1) |
| 2. Резолв правил под выбранные инструменты | Python/Go: `python-rules`/`go-rules` есть → каскад непустой. Swift/Rust: правил нет → тропа `research-and-author` | `infra.directive.xml:83` ищет правило по `<Triggers>` = имя инструмента; для `ruff`/`mypy`/`go vet`/`swiftlint` таких правил в реестре **нет** → пусто |
| 3. Что попадёт в фазу вместо | `baseline-rules` + языковое правило (Python/Go) — осмысленно | `typescript-rules` (его `<Triggers>` ловит любой исходник) — **осмысленно неверно**, и не только семантически: `sdd-new` печатает кортеж механически (§1.3); либо оператор объявляет пустой набор, и фаза едет без правил вовсе |
| 4. Проект пишет своё правило | тропа `research-and-author` → файл в `ai/directives/<category>/` | та же тропа (`ax-scope-rules-declaration.xml`), сохранена целиком и language-agnostic |
| 5. Проект вносит его в реестр | `knowledge.xml` project-owned → правка выживает | правка **перезаписывается** первым же `gennady sync` |
| 6. Файл правила проекта в пакетной категории | выживает | **удаляется** как устаревшая запись зеркала (только внутри поставляемых подкаталогов, §1.5) |
| 7. Проверка полноты нового правила | `check.sh [RULES]` — вручную, только если регистр секций CamelCase | нет проверки вовсе |
| 8. `<RequiresVerification>` резолвится в команду | через Verification Commands infra-спеки; в `cloud-ios` **не резолвится** | `ax-rule-activation-plan.xml:6`; для не-Node гейт всё равно `npm run <script>` (B1 §4.2) |
| 9. Гейт из `<VerificationHooks>` запускается | хуки — проза для агента; исполняет их агент, не рантайм | то же |

Что реально ломается — три независимых обрыва, упорядоченные по тому, что́ из них блокирует релиз, а что деградация или долг:

**Обрыв 2 (владение) — блокирует релиз.** Написав правила, проект теряет их при следующем обновлении пакета: в v2 — и реестр, и файлы; в v1 — файлы выживают, реестр выживает, но остальное дерево директив по-прежнему перетирается (A4 #24). `cloud-ios` терял реестр трижды.

**Обрыв 1 (содержание) — деградация, не блокер.** Пакет не знает ни одного не-Node стека на уровне правил (v2 — вообще, v1 — знает Python/Go текстом и Go — плагином, но без записи в реестре). Важная оговорка: v1 «знает» Python/Go лишь номинально — `python-rules`/`go-rules` написаны «по интернету» (шапки: «Grounded in: PEP 8, Ruff/mypy docs…»), ни разу не проверены на реальном проекте, и ни одной задачи в `tasks/` под них нет. По маршрутизации (проза скилла) v1 сильнее v2 только на Go; по содержанию (записи реестра) — на четыре файла Python/Go, тоже не подтверждённых практикой.

**Обрыв 3 (проверяемость) — долг.** Слой правил в v2 проверяется только на замыкание объявленного списка, и то лишь для канала `<DependsOn>`. Полнота файла, осмысленность активации, регистр секций — не проверяется никак. В v1 проверка есть, но она (i) не в CI и не в хуках (хуков нет вовсе), (ii) хардкод-белый список для содержимого, (iii) даёт 19 ложных нарушений на живом потребителе из-за неверсионированной схемы.

Отдельно — четвёртый, менее очевидный обрыв: **тир `task` каскада не выводим из `<Triggers>`.** Разбор `cloud-ios` (§1.6) — прямое свидетельство: для фазы, чей `Target Files` — только `CODEOWNERS`, «вывод по `<Triggers>` даёт пустое множество», и оба правила подключены **решением тикета**. Это легальный, но не формализованный режим — ни формата записи причины, ни проверки у тира `task` нет ни в v1, ни в v2.

### 3.2 Гипотеза (a): стек-правила поставляются вместе с пресетом/плагином стека

**Что это значит конкретно.** Плагин стека (v1 `plugins/<id>/`; в v2 — «пресет», которого пока нет) становится владельцем не только гейтов, но и правил своего стека: файлов правил **и записей реестра**.

**Дизайн-эскиз.**

1. Расширить контракт плагина. `services/stack/stack.types.ts:315-335` — добавить необязательный facet:
   ```
   readonly rules?: {
     readonly registryEntries: readonly StackRuleEntry[];   // id, category, file, triggers, skipWhen, checkPhase, requiresVerification, dependsOn
     readonly directiveDir: string;                          // 'directives' — где лежат файлы
   };
   ```
2. Материализация записей. Новая функция `renderRegistryLayer(plugins: readonly StackPlugin[]): string` — рендерит `<Rules>`-фрагмент из facet'ов. Потребители: `sync` (пишет слой на диск), `loadRuleRegistry` (читает слой).
3. Место на диске. **Не** `ai/directives/knowledge.xml` (он project-owned), а отдельный неперекрываемый файл: `ai/directives/knowledge.stack.xml` — «package-owned, перезаписывается всегда, руками не правится».
4. Файлы правил. Механизм уже есть в v1 и работает: `extraSourceDirs` + `scanSourceRoots` + `path-normalizer.ts`. Нужно добавить диагностику коллизии (два плагина, одно имя файла).
5. Активация. Ничего не меняется: `AX_RULE_ACTIVATION_PLAN` уже «signal-based only … zero hardcoded language/tool knowledge».

**Взаимодействие с VERIFY (B1 §4).** Прямая и полезная: если стек определяется один раз (`detectStacks(root, config, registry)`, B1 §4.4 п.1) и печатается как `STACK=`/`STACK_SOURCE=` в `sdd-state` (п.2), то **тот же результат детекции выбирает слой правил** — один факт, один источник. Второй стык — `<RequiresVerification>`: если запись реестра приходит из плагина, плагин может объявлять алиас, который **он же умеет исполнять** (`gateIds`). Это ровно тот разрыв, который зафиксировал `cloud-ios».

**Риски.**
- R-a1: проект теряет право отключить пакетное правило, если слой стека перезаписывается всегда — нужен механизм подавления (см. §3.4).
- R-a2: дубликат `id` между слоями станет **нормой**, а `parseRuleRegistry` на нём бросает — семантика merge обязана быть определена до реализации.
- R-a3: плагинов стеков в RC нет вообще, а **нет и `services/stack/`** (M-8, §2 R4) — гипотеза (a) упирается не только в перенос `plugins/`, но и в перенос базового типа `StackPlugin`. Без него (a) неисполнима.
- R-a4: коллизия имён файлов между плагинами и пакетом — сейчас недиагностируема.

**Effort:** L (без переноса `plugins/` и `services/stack/` в v2 — блокирована; с ними — L поверх).

### 3.3 Гипотеза (b): language-agnostic baseline в ядре

**Что это значит конкретно.** Ядро поставляет 1–2 стек-независимых родительских правила, которые активируются, когда специфичного правила нет; языковые/раннерные правила их наследуют и не повторяют аксиомы.

**Это уже сделано в main** коммитом `5a237cd5`: `ai/directives/coding/baseline-rules.xml` (101 строка, 6 аксиом, 4 антипаттерна, 2 хука, 11 критериев) и `ai/directives/testing/baseline-testing.xml` (89 строк, 5 аксиом, 4 антипаттерна, 2 хука, 10 критериев). Оба стек-агностичны буквально: хук `HOOK_PROJECT_GATE` — `<sdd-path> verify --wip <target-files>`, «гейт, как проект его объявил», без упоминания npm.

**Дизайн-эскиз (перенос в v2 + доведение).**

1. Портировать четыре файла: `ai/directives/coding/{baseline-rules,python-rules,go-rules}.xml`, `ai/directives/testing/baseline-testing.xml`.
2. Портировать записи реестра + сузить `<Triggers>` у `typescript-rules` до `.ts / .tsx` + `<SkipWhen>` «non-TypeScript language».
3. **Замкнуть дыру, которую main оставил:** добавить `<DependsOn> - ai/directives/coding/baseline-rules.xml` в `coding/typescript-rules.xml`.
4. Рассмотреть разделение «толстого листа»: отдельные `testing/pytest-rules.xml` / `testing/gotest-rules.xml` вместо того, чтобы coding-правила тянули `baseline-testing` напрямую — чище по категориям, но +2 файла и +2 записи.
5. Уточнить `<SkipWhen>` baseline: сегодня формулировка требует от активатора рассуждения «а наследует ли специфичное правило»; дублирование текста предотвращает не `<SkipWhen>`, а дисциплина «не переизлагать аксиомы родителя», уже записанная в шапках обоих файлов.

**Взаимодействие с VERIFY — блокирующая зависимость, не «слабая и это плюс».** Первая версия этого раздела считала стык с треком VERIFY нулевым, ссылаясь на то, что baseline не называет ни одного инструмента. Это неверно на уровне механизма: оба хука обоих baseline-правил вызывают команду, которой в RC не существует. `HOOK_PROJECT_GATE` (`coding/baseline-rules.xml:78`) и `HOOK_TESTS_PASS` (`testing/baseline-testing.xml`) несут `<Command>&lt;sdd-path&gt; verify --wip &lt;target-files&gt;</Command>`. В RC `ls rc-v6/cli/cmd/` даёт `sdd-verify`; команды `verify` и флага `--wip` нет (`grep -rn 'verify --wip' rc-v6/{ai,cli,specs}` = ∅, `grep -rn -- '--wip' rc-v6/cli` = ∅). Порт «как есть» ставит в ядро v2 два хука с мёртвой командой — ровно тот класс дефекта, за который справедливо критикуется нерезолвящийся `check-command` у `cloud-ios`. **Портирование baseline не исполняется в изоляции от VERIFY**: либо трек VERIFY поставляет команду, совместимую с `verify --wip`, либо оба `<Command>` переписываются под `sdd-verify` — и тогда это решение по VERIFY, принятое внутри трека RULES (новый вопрос Q7, §4.7). Это общий блокер для T-1 во всех трёх вариантах дизайна ниже (R-A, R-B, R-A′), не только для гипотезы (b) отдельно.

Единственный при этом действительно слабый (в хорошем смысле) стык — `<RequiresVerification>check-command</RequiresVerification>` у обоих baseline-правил: алиас должен раскрываться infra-спекой независимо от выбора по VERIFY, и у `cloud-ios` он сегодня не раскрывается.

**Взаимодействие с SYNC.** Нулевое: это пакетные файлы в пакетных категориях, `preserved` их не касается — пока проект не решит их переопределить.

**Риски.**
- R-b1: ложное чувство покрытия — каскад станет непустым и зелёным, а `baseline-rules` даёт лишь 6 аксиом общего смысла.
- R-b2: `python-rules`/`go-rules` не проверены на реальном python/go-проекте ни разу — правила без обратной связи.
- R-b3: `<RewardCriteria>` `python-rules:84` и `go-rules:87` несут тестовые критерии в coding-правиле — дубль с `baseline-testing`, зародыш дрейфа.

**Effort:** S (портирование 4 файлов + записи, при условии решения Q7), M если п.4 принят.

### 3.4 Гипотеза (c): `knowledge.xml` project-owned — семантика merge реестра

**Что это значит конкретно.** Реестр — артефакт проекта. Пакет (и/или пресет стека) поставляет записи, проект их дополняет и переопределяет. Вопрос — **как именно** «пакет добавляет, проект владеет».

Сегодня семантики merge нет ни в одной ветке: main делает **замену файла целиком** (`PROJECT_OWNED_ENTRIES` — бинарное «есть проектный → пакетный игнорируется полностью»); RC не имеет ни merge, ни владения — `loadRuleRegistry` читает «проектный ИЛИ пакетный», а `sync` перезаписывает проектный.

**Три возможных семантики merge (развилка Q1 в §4.7):**

| Семантика | Правило | Плюс | Минус |
|---|---|---|---|
| **C1. Файл целиком** (main сейчас) | есть `ai/directives/knowledge.xml` → он единственный источник | ноль новой механики; уже работает | проект замораживает пакетные записи навсегда — риск, эмпирика по которому оказалась слабее, чем казалось (см. ниже) |
| **C2. Два файла, один порядок** | `knowledge.stack.xml` (package/preset-owned) + `knowledge.xml` (project-owned); при совпадении `id` проектная запись побеждает; запись с пустым `<File>` = подавление | пакет может обновлять свои записи; проект может переопределить и выключить | правка `parseRuleRegistry`, новый статус в `sync`, обязательный миграционный шаг для существующих потребителей |
| **C3. Overlay-каталог** | `ai/directives.local/` целиком поверх `ai/directives/` | единый механизм для правил, реестра и всех остальных директив | самый большой объём: резолв путей во всех потребителях; двойное дерево путает агента |

**Уточнение верификации по риску C1.** Единственная приведённая эмпирика в пользу «C1 замораживает пакетную часть» — висячая ссылка `messenger/ai/directives/knowledge.xml:26` (`ai/directives/sdd/task-scaffolding.directive.xml`, которого в пакете нет уже давно) — лежит **внутри блока `<Directives>`** (`<Rules>` у `messenger` открывается на `:57`). В реестре v2 блока `<Directives>` **нет вообще** (`RC/knowledge.xml`: единственная верхнеуровневая секция — `<Rules>` на `:2`). То есть предъявленный пример относится к части реестра, которую v2 удалил, и в v2-топологии не воспроизводится автоматически. Риск застывания активационных полей `<Rules>` (`<Triggers>`, `<SkipWhen>`, `<ActivationHint>`, `<CheckPhase>`, `<RequiresVerification>`, `<File>`, `<CrossRef>`) при C1 остаётся правдоподобным, но пока не подтверждён этим примером — см. вариант R-A′ в §4.4, который делает это застывание видимым дешёвым чеком вместо того, чтобы устранять его дорогим merge'ом.

**Дизайн-эскиз C2.**

1. `shared/sdd/rule-registry.ts` (новый модуль): `parseRegistryLayer(content) → RuleRegistryEntry[]`; `mergeRegistryLayers(stackLayer, projectLayer) → { entries, suppressed, overridden }`. Правило слияния: последний слой побеждает по `id`; запись без `<File>` подавляет.
2. `loadRuleRegistry(repoRoot)` читает оба файла и возвращает merge; отсутствие любого слоя легально.
3. `sync`: `knowledge.stack.xml` — обычный package-owned файл; `knowledge.xml` — `preserved`. Плюс манифест из A4 #24 (`.gennady-synced`, статус `locally-modified`, `--force`), зеркальное удаление — только файлов из манифеста.
4. Текст: вернуть в v2 три потерянных предложения R5 (§2), добавить в `ax-scope-rules-declaration.xml` явное указание, в какой файл писать.
5. Отдельная категория для проектных файлов правил (снимает проблему «пакетная категория удаляется») — опционально.

**Риски.**
- R-c1: проектная запись, ссылающаяся на исчезнувший пакетный файл, остаётся висячей — нужна детерминированная проверка «каждый `<File>` merge'а существует» (T-3(d4)).
- R-c2: подавление пустым `<File>` — тихая семантика; альтернатива `<Rule id="…" suppressed="true"/>` читаемее, но добавляет поле схемы. Отдельный факт, важный для дешевизны Q2(a): `parseRuleRegistry` **уже сегодня** молча выбрасывает запись без `<File>` — то есть Q2(a) реализуется правкой нуля строк, но и опечатка в `<File>` навсегда останется тихой.
- R-c3: два файла реестра в одном каталоге — риск, что агент запишет правило не туда.
- R-c4: **обязателен миграционный шаг.** Проекты, у которых уже есть полный проектный `knowledge.xml` (`cloud-ios`, `messenger`), после включения C2 получат **и** пакетный слой обратно — `typescript-rules` снова станет активным в iOS-репозитории. Без миграции C2 = регресс для обоих потребителей.

**Effort:** M (C2), S (C1 = просто порт `f74c8c1d`), L (C3).

### 3.5 Гипотеза (d): контрактные тесты правил переезжают в аудиты `ai/kit`

**Что это значит конкретно.** Проверка «файл правила несёт четыре секции» перестаёт быть bash-скриптом и хардкод-белым списком и становится детерминированным аудитом в семье `npm run audit:sdd-templates`.

**Дизайн-эскиз.**

1. Новый скрипт `ai/kit/audit-rule-surface.ts`. Вход — предикат каскадных категорий, вынесенный в `shared/sdd/rule-paths.ts` как единственное определение. Проверки:
   - **(d1)** четыре секции присутствуют;
   - **(d2)** секции не пустые (≥1 `<Hook id="HOOK_…">` с непустыми `<Command>`/`<Expected>`, ≥1 `<AntiPattern>`, ≥1 `<Axiom>`, ≥1 ✅/❌);
   - **(d3)** каждый `<DependsOn>` (и, желательно, `<InheritedBaseline>`) резолвится и не образует цикла. Уточнение: проверка существования транзитивных зависимостей для правил, **цитируемых тикетом**, уже реализована (`sdd-check.cmd.ts:434-447`, `ERR_CLI_SDD_CHECK_READ_FAILED`) — (d3) должна **расширить** её на пакетное дерево целиком, а не вводить заново;
   - **(d4)** каждый `<File>` в итоговом реестре существует, и каждый файл на диске либо зарегистрирован, либо достижим по объявленному наследованию — ловит и `golang-setup` без записи, и три unregistered `uikit-*`, и висячие ссылки `messenger`;
   - **(d5)** регистр секций: файл в старой схеме диагностируется как **устаревшая схема**, а не «секций нет» — единственная мера, превращающая 19 ложных нарушений `messenger` в один осмысленный вывод;
   - **(d6)** `<RequiresVerification>` алиас встречается хотя бы в одном источнике раскрытия. Алиас объявлен у 17 из 19 записей main и 12 из 14 RC, а раскрытия не проверяет никто ни в одной ветке — это свойство пакета, не локальная проблема `cloud-ios` (см. T-13 в §5.2).
2. Что остаётся LLM-аудиту: `RULES_COMPLIANCE_VIOLATION`, `RULES_CASCADE_MISMATCH`, `INSIGHT_BACKFLOW`. `RULE_FILE_INCOMPLETE` перестаёт быть LLM-находкой и становится выводом (d1)/(d2).
3. Что остаётся в `sdd-check`: `SDD_RULES_CASCADE_UNRESOLVED` (про тикет); плюс новый инфо-код `SDD_RULES_PHASE_EMPTY`, чтобы «фаза без правил» была видна в **обоих** местах, где она сегодня глушится (`rules-cascade.ts:62` и `sdd-check.cmd.ts:429`).

**Риски.**
- R-d1: аудит в пакете ≠ аудит у потребителя — логика обязана быть доступна и из CLI (`gennady sdd-check --rules`).
- R-d2: «непустота» — эвристика, порог нужно откалибровать так, чтобы не ловить намеренно пустые поля (`git-setup`).
- R-d3: (d5) требует версионирования схемы — минимум атрибут `schema="2"` + таблица соответствия.
- R-d4: `SDD_RULE_PATH_RE` называет 5 категорий, `ax-scope-rules-declaration.xml:3-7` — 4 (без `quality`), устаревшая шапка `check.sh:38` — 3. Три разных списка, а не два — Q6 обязана согласовать все три.

**Effort:** M.

### 3.6 Сводка по гипотезам

| Гипотеза | Что решает | Что НЕ решает | Блокеры | Effort |
|---|---|---|---|---|
| **(a)** стек-правила в пресете/плагине | обрыв 1 для стеков с плагином; связь «правило ↔ гейт» через `gateIds` | обрывы 2 и 3; стеки без плагина | нет `plugins/` **и `services/stack/`** в RC → зависит от трека VERIFY | L |
| **(b)** baseline в ядре | обрыв 1 частично и немедленно; уже написано и работает в main | обрывы 2 и 3; глубину покрытия языка | блокирующая зависимость от VERIFY (Q7) — не «нет» | S/M |
| **(c)** реестр project-owned + merge | обрыв 2 полностью; даёт (a) право добавлять записи | обрывы 1 и 3 | семантика merge (Q1) + миграция для существующих потребителей | M |
| **(d)** контракт правил в `ai/kit`-аудиты | обрыв 3 полностью, включая ложные срабатывания `messenger` и невидимость `golang-setup` | обрывы 1 и 2 | доступность аудита в дереве потребителя | M |

Гипотезы **не конкурируют**: (b) → (d) → (c) → (a) — естественный порядок по «цена/эффект». Единственный настоящий конфликт — (a) × (c), и он разрешается введением второго слоя (C2) **или** — дешевле — тем, что (c) вообще не требуется в форме merge (см. вариант R-A′, §4.4).

---

## 4. Варианты дизайна слоя правил

Критерии сравнения (сводная таблица §4.6): **К1** осмысленность каскада для не-Node проекта; **К2** сохранность работы проекта при обновлении пакета; **К3** механическая проверяемость; **К4** единственность источника факта; **К5** цена для существующих потребителей; **К6** независимость от трека VERIFY.

### 4.1 Вариант R-A — «Минимальный порт v1 в v2»

**Идея.** Взять слой правил main как есть и перенести в v2: один `knowledge.xml`, project-owned по C1, стек-правила остаются файлами в пакетных категориях, `[RULES]` переписывается из bash в TS и живёт в `sdd-check`.

**Механика.**
1. Портировать 4 файла baseline + 4 записи реестра; сузить `<Triggers>` у `typescript-rules`; вернуть шапку PROJECT-OWNED.
2. Починить два неполных файла RC; добавить `<DependsOn> - testing/common.xml` в `vitest-rules`/`node-test` (заменяя/дополняя `<InheritedBaseline>`).
3. Портировать `f74c8c1d`: `PROJECT_OWNED_ENTRIES`, статус `preserved`.
4. Портировать `[RULES]` как `checkRuleFileSurface(paths) → Finding[]` + код `SDD_RULES_FILE_INCOMPLETE` в `sdd-check`.
5. Портировать текст R5 (три предложения) в `ax-rules-resolution-hard-fail.xml`.
6. Отключить зеркальное удаление файла правила проекта внутри каскадных категорий.

**Что закрывает.** R1 — да. R2 — да (содержимое + механика). R3 — да. R4 — **нет** (`plugins/` в RC нет). R5 — да.

**Стыки.** VERIFY: п.1-2 наследуют тот же блокер §3.3 (хуки baseline зовут `verify --wip`) — вариант **не** «нулевой стык», как выглядело в первом проходе; остальное действительно не зависит от VERIFY. SYNC: точечные.

**Что происходит у потребителей.** `cloud-ios`: реестр перестаёт затираться — для него R-A почти оптимален. `messenger`: 19 ложных `INCOMPLETE` остаются, второй канал наследования по-прежнему невидим.

**Риски.** Замораживание реестра при C1 (см. уточнение по эмпирике `messenger` в §3.4 — риск правдоподобен, но не подтверждён приведённым примером); (a) остаётся неисполнимой без отдельного слоя; неверсионированная схема остаётся.

**Effort.** M (порт + 6 пунктов), при условии решения Q7.

### 4.2 Вариант R-B — «Три слоя реестра + baseline в ядре + аудит схемы в `ai/kit`» (целевое состояние)

**Идея.** Разделить слой правил на три источника с явным порядком и владельцем, контракт файла правила сделать детерминированным аудитом, доступным и мейнтейнеру, и потребителю. Гипотезы (b) + (c/C2) + (d) целиком; (a) — отдельный поздний этап, который этот вариант делает возможным, но не требует.

**Механика.** Слой 0 — core baseline (`knowledge.core.xml`); слой 1 — stack preset (`knowledge.stack.xml`, package/preset-owned, перезаписывается); слой 2 — project overlay (`knowledge.xml`, `preserved`). Итог = `merge(core, stack, project)`, «последний побеждает по `id`», один модуль `shared/sdd/rule-registry.ts`. Контракт файла — `ai/kit/audit-rule-surface.ts`, доступный и как `npm run audit:rule-surface`, и как `gennady sdd-check --rules`. Версионирование схемы — `schema="2"`.

**Что закрывает.** R1 — да, сильнее main (универсальный аудит вместо белого списка). R2 — да. R3 — да, плюс дыра main (`<DependsOn>` у `typescript-rules`). R4 — подготавливает формат для будущего генератора. R5 — да, механически.

**Стыки.** VERIFY: слой 1 — точка врастания `detectStacks`; (d6) закрывает разрыв `<RequiresVerification>`; **плюс тот же блокер §3.3 для T-1 (baseline-хуки)**, общий для всех вариантов. SYNC: три статуса владения + манифест A4 #24.

**Что происходит у потребителей.** `cloud-ios`: реестр перестаёт затираться, появляется механизм подавления — но **только после обязательного миграционного шага** (R-c4), иначе первый `sync` возвращает Node-правила в активный набор. `messenger`: `SDD_RULES_SCHEMA_LEGACY` вместо 19 ложных `INCOMPLETE`, висячая ссылка становится находкой `SDD_RULES_REGISTRY_DANGLING`.

**Риски.** Наибольший объём из всех вариантов (три новых модуля + новый аудит + переработка sync); R-c4 обязателен — без него вариант **регрессирует** для обоих потребителей; три файла реестра в одном каталоге — риск записи не туда; версионирование схемы — обязательство поддерживать таблицу соответствия навсегда.

**Effort.** L (декомпозируется на 4 независимые задачи S/M — см. §5).

**Почему это целевое состояние, а не рекомендация «сейчас».** Единственный эмпирический довод, который в первом проходе оправдывал немедленный выбор R-B над более дешёвой альтернативой — «C1 у main уже сломал `messenger`» — не подтверждён (§3.4): пострадавшая ссылка лежит в части реестра, которой в v2 нет. Без этого довода R-B выигрывает у более дешёвого варианта только в одном: пакет может **обновлять** активационную семантику правила у проекта, который его уже переопределил. Ни `cloud-ios`, ни `messenger` сегодня в этом не нуждаются. R-B остаётся правильной целью, если и когда эта потребность появится — см. R-A′ ниже как то, что можно сделать вместо неё сейчас.

### 4.3 Вариант R-C — «Слой правил целиком принадлежит пресету стека»

**Идея.** Радикальная: `ai/directives/{coding,testing,infra}` перестаёт быть пакетным каталогом. Правила — часть пресета стека (`plugins/<id>/directives/`), реестр не хранится как файл, а вычисляется CLI из активных пресетов + `gennady.yaml`. Проект переопределяет правила декларативно через конфиг.

**Механика.** `StackPlugin.rules` — обязательный facet; `gennady rules --json` вычисляет набор вместо чтения XML; `rules.suppress`/`rules.add`/`rules.override` в `gennady.yaml`; проектные файлы — в `ai/rules/` (пакет не трогает); `sync` перестаёт возить правила вообще.

**Что закрывает.** R1 — да (через (d) над пресетами). R2 — да, механически. R3 — переформулируется (baseline = пресет `anystack`). R4 — **полностью и правильно**. R5 — да, но иначе (валидатор конфига вместо файловой системы).

**Стыки.** VERIFY: максимальные, но вариант **полностью блокирован** — и не двумя отсутствиями, как казалось в первом проходе, а **тремя**: в RC нет `plugins/`, нет `services/stack/` (§2 R4, M-8) и нет `gennady.yaml` (A2 §9.1). Без всех трёх R-C неисполним, а `gateIds`, на которые он опирается для раскрытия `<RequiresVerification>`, в v2 не с чем связывать — типа `StackPlugin` не существует.

**Что происходит у потребителей.** Оба ломаются одновременно и требуют настоящей миграции; Cascade Table в закрытых тикетах приобретает висячие ссылки. Самый дорогой вариант по К5.

**Риски.** Двойная (на деле — тройная) внешняя зависимость; реестр как вычисляемая величина ломает свойство «агент читает один файл и видит весь набор правил» (`scaffold.directive.xml:470` «Read it now — do not defer»); ломает существующие тикеты; XML-семантика `<Triggers>` в YAML — либо теряет выразительность, либо YAML становится XML в другом синтаксисе.

**Effort.** XL (и по календарю — после VERIFY).

### 4.4 Вариант R-A′ — «Baseline в ядре + project-owned реестр (C1) + файлы пресетов, гейтированные детекцией + детерминированный `<File>`-existence/unregistered-чек» (steelman, рекомендуется сейчас)

**Идея.** R-A с одним содержательным уточнением, прямо следующим из уже принятой в main аксиомы `f74c8c1d`: пер-стековые **файлы** правил приезжают от пресета/плагина стека (механизм уже есть и покрыт golden'ом — `extraSourceDirs`/`scanSourceRoots`/`path-normalizer.ts`), а **записи реестра** пишет проект, потому что реестр его. Ничего не изобретается: `scaffold.directive.xml:74` уже говорит «a non-Node scope authors its own rule files for its stack and lists them», и `cloud-ios` уже живёт по этой схеме руками — 5 записей, свой `<CheckPhaseOrder>`, переписанный `<ActivationHint>` у пакетного `git-setup`.

**Механика.**
1. Baseline в ядре — то же T-1, что и в R-A/R-B: 4 файла + записи, сужение `<Triggers>` у `typescript-rules`.
2. Реестр — C1 «файл целиком» (Q1(a)), без merge, без слоёв.
3. Файлы правил стека — существующий механизм `extraSourceDirs`, но **гейтированный детекцией стека** (`detectStacks`, B1 §4.4 п.1) — без этого условия пакет по-прежнему раздаёт все пресеты всем, как сегодня `golang-setup.xml` оказывается в iOS-репозитории.
4. Единственный новый детерминированный механизм — **`<File>`-existence + unregistered-чек**: (i) каждый `<File>` итогового реестра существует на диске; (ii) каждый файл каскадной категории на диске либо зарегистрирован, либо достижим по объявленному наследованию (`<DependsOn>`/`<InheritedBaseline>`). Ловит `messenger`-дрейф (висячая ссылка), `golang-setup` без записи (R4), три `uikit-*` (§1.6). Effort — S; это подмножество T-3(d4), может быть выделено отдельно.

**Почему это закрывает главный риск C1, не вводя merge.** Аргумент против C1 («проект, тронувший реестр, замораживает пакетную часть») эмпирически не подтверждён (§3.4): единственный пример — висячая ссылка `messenger` — относится к блоку `<Directives>`, которого в v2 нет. Что реально может застыть — восемь коротких активационных полей на правило; содержимое самого файла правила при этом обновляется как обычный пакетный файл. Застывание становится **видимым**, а не тихим, ровно тем чеком из п.4 — то есть C1 + `<File>`-чек ≈ выгода C2 (§4.2) ценой S, а не M+M+M, и без риска R-c4.

**Что при этом отпадает.**
- **Q2 (подавление пакетного правила) снимается с повестки.** Проект, которому не нужен `typescript-rules`, просто не пишет для него запись — `cloud-ios` уже так живёт.
- **T-2 (слои реестра) и T-7 (миграция подавлений) не нужны.**
- **T-4 сокращается**: нужен только порт `f74c8c1d` + отключение зеркального удаления файла правила проекта внутри каскадной категории; трёх статусов владения и манифеста не требуется на первом шаге.
- **Ноль миграции для потребителей (К5).** У `cloud-ios` и `messenger` реестр становится `preserved`, оба продолжают работать как сегодня.

**Обязательные стыки (в отличие от того, как исходно был описан R-A с «нулевым» стыком VERIFY).**
1. Тот же блокер §3.3 (Q7): baseline-хуки зовут `verify --wip`, которого в RC нет — T-1 не исполняется в изоляции ни в одном варианте.
2. «Пресет поставляет свои файлы» имеет смысл только если поставка **гейтится детекцией** (`detectStacks`) — без этого R-A′ ничем не отличается от сегодняшнего `extraSourceDirs`, раздающего всё без разбора. Эта зависимость общая у R-A′ и R-B (аналог R-a3/M-8).

**Где R-A′ слабее R-B (целевого состояния).**
- Пакет не может обновить активационную семантику своего правила у проекта, тронувшего реестр — только сделать застывание видимым, не автоматическим.
- Легаси-схема секций (`messenger`) не лечится владением — лечится независимой мерой (d5)/Q3, которая ортогональна выбору владения и одинаково нужна в обоих вариантах.
- Нет формата, готового стать выходом будущего генератора (`knowledge.stack.xml`) — но пресет, умеющий генерировать записи, сможет положить их в отдельный файл тогда, когда появится; вводить трёхслойный merge заранее — цена сегодня за опцию завтра.

**Effort.** M (T-1 + облегчённый T-4 + `<File>`-чек + гейтинг детекцией) — меньше, чем R-B (L), при равном покрытии R1/R2/R3/R5.

### 4.5 Развилки вне исходного пространства вариантов

Помимо трёх вариантов R-A/R-B/R-C и добавленного R-A′, стоит держать в поле зрения ещё две развилки, которые ни один из четырёх вариантов не решает автоматически:

**(0) «Реестр не зеркалится».** `loadRuleRegistry` (`task-authoring-literals.ts:81-91`) уже читает «проектный на диске ИЛИ пакетный из `node_modules`». Формально достаточно внести `knowledge.xml` в `EXCLUDED_ENTRIES` — и никакой `preserved`, seed, merge или миграция не нужны: пакетный реестр живёт в `node_modules`, проектный — в дереве, конфликта не возникает конструктивно. Цена, которую нужно назвать честно: ломается свойство «агент открывает один файл в дереве и видит весь набор правил» (`scaffold.directive.xml:470` — «Read it now — do not defer»), пока проект не создал свой реестр. (0) не доминирует над C1, но показывает, что «seed + `preserved`» — это цена **агентской читаемости**, а не техническая необходимость, и это стоит держать в уме при ответе на Q1.

**(∞) Развилка `<DependsOn>` vs `<InheritedBaseline>`.** Ни один из четырёх вариантов не решает проблему двух каналов наследования (§1.1, §2 R2). Любой дизайн слоя правил обязан выбрать: либо `<InheritedBaseline>` объявляется прозой-дублем `<DependsOn>` и вычищается из файлов правил, либо он становится вторым официальным механическим каналом, и его читает и `parseRuleDependsOn`, и аудит (d3). Пока выбора нет, `vitest-rules`/`node-test` в v2 остаются «объявленными, но невидимыми» для замыкания, а `messenger` — вдвойне (оба канала в старом регистре).

### 4.6 Сравнение и рекомендация

| Критерий | R-A «порт v1» | R-B «три слоя + аудит» | R-C «правила в пресете» | R-A′ «baseline + C1 + гейтинг + чек» |
|---|---|---|---|---|
| К1 осмысленность каскада для не-Node | средне | средне-хорошо | хорошо | средне-хорошо (то же, что R-B минус слой merge) |
| К2 сохранность работы проекта | хорошо для реестра (C1), плохо для остальных директив | **хорошо** (три статуса + манифест, но требует миграции) | хорошо | **хорошо** (C1 + видимость застывания вместо автоматизма) |
| К3 механическая проверяемость | средне | **хорошо** ((d1)–(d6)) | хорошо, если (d) применён к пресетам | **хорошо** (та же подмножество (d), включая `<File>`-чек) |
| К4 единственность источника | средне (файл заморожен) | **хорошо** (явный merge трёх слоёв) | хорошо (один владелец на стек) | средне-хорошо (один файл, застывание видимо, не автоматически лечится) |
| К5 цена для потребителей | **низкая** | средняя (обязателен миграционный шаг) | **высокая** | **низкая** (ноль миграции) |
| К6 независимость от VERIFY | частичная (T-1 блокирован Q7) | частичная (T-1 блокирован Q7; слой 1 зависит от `detectStacks`) | **нулевая** (блокирован тремя отсутствиями) | частичная (те же два стыка, что у R-B, минус третий) |
| R1/R2/R3/R4/R5 | ✔/✔/✔/✘/✔ | ✔/✔/✔/подготовлен/✔ | ✔/✔/переформулирован/✔/✔ | ✔/✔/✔/подготовлен/✔ |
| Effort | M | L (4×S–M) | XL | **M**, дешевле R-B |

**Рекомендация: R-A′ сейчас, R-B как целевое состояние.**

Почему не R-A в исходном виде: он снимает боль `cloud-ios`, но за счёт того, что пакет физически не может добавить стек-специфичные файлы правил, потому что не гейтирует их детекцией — то же самое дублирование, что и сегодня (`golang-setup.xml` в iOS-репозитории).

Почему не R-B прямо сейчас: главный эмпирический довод в его пользу («C1 уже сломал `messenger`») не подтверждён — пострадавшая ссылка лежит в части реестра, которой в v2 нет (§3.4). Без этого довода R-B даёт то же покрытие R1/R2/R3/R5, что и R-A′, ценой L вместо M и обязательным миграционным шагом, отсутствие которого сам документ называет условием регресса для обоих потребителей.

Почему не R-C: архитектурно самый честный вариант (владелец правил = владелец гейтов = владелец алиасов), и в долгую именно туда стоит идти, но сегодня заблокирован тремя отсутствующими в v2 вещами (`plugins/`, `services/stack/`, `gennady.yaml`), ломает оба живых потребителя и отменяет свойство «реестр читается как один файл».

Почему R-A′: он (i) исполним внутри трека RULES при условии решения Q7 по VERIFY, без ожидания остальной части трека VERIFY; (ii) закрывает R1/R2/R3/R5 наравне с R-B; (iii) не требует миграции ни у одного живого потребителя; (iv) не закрывает дверь в R-B — формат `knowledge.stack.xml` можно ввести позже, когда (и если) пакету реально понадобится обновлять активационную семантику правил у проектов, которые её уже переопределили.

Порядок исполнения: **Q7 (решение по VERIFY-хукам baseline) → T-1 (baseline + фикс двух неполных файлов) → `<File>`-existence/unregistered-чек (подмножество T-3) → T-4 (облегчённая версия: порт `f74c8c1d` + отключение удаления) → детекция стека гейтит `extraSourceDirs` (зависит от трека VERIFY) → [позже, при появлении потребности] переход на R-B.**

### 4.7 Решения, которые может принять только оператор

**Q1. Семантика владения реестром.** (Блокирует T-2, T-4.)
- (a) **C1** — файл целиком, как в main `f74c8c1d`, усиленный `<File>`-existence/unregistered-чеком. Дёшево, ноль миграции, `cloud-ios` доволен, единственный эмпирический пример вреда (`messenger`) не воспроизводится в топологии v2 — **рекомендуется вместе с R-A′**.
- (b) **C2** — два/три слоя, «последний побеждает по `id`», подавление записью без `<File>`. Рекомендуется как **целевое состояние** (R-B), когда появится потребность в обновляемой пакетом семантике. Цена: обязательный миграционный шаг для существующих потребителей, правка `parseRuleRegistry`.
- (c) **C3** — overlay-каталог `ai/directives.local/`. Единый механизм для всех директив, но правка резолва путей во всех потребителях.
- (d) **Гибрид**: C1 сейчас + C2 как следующий шаг, с явным заявлением, что C1 — временный.

**Q2. Подавление пакетного правила проектом.** (Блокирует T-2; напрямую про `cloud-ios`.) **При выборе R-A′/Q1(a) снимается с повестки** — проект просто не пишет запись для ненужного правила, это уже сегодня работает (`parseRuleRegistry` молча игнорирует запись без `<File>`). Если позже принимается R-B/Q1(b):
- (a) запись `<Rule id="…">` без `<File>` = подавление — ноль новой механики, но тихая семантика (опечатка в `<File>` — молчаливое исчезновение правила без находки).
- (b) явный атрибут `<Rule id="…" suppressed="true"/>` — читаемо, +1 поле схемы.
- (c) отдельный блок `<Suppress><Rule id="…"/></Suppress>` — самое явное, +1 элемент схемы.
- (d) подавления нет: проект берёт на себя весь реестр (= C1).

**Q3. Версионирование схемы файла правила.** (Блокирует T-3(d5); напрямую про `messenger`, и, как выяснилось, про сам пакет — директивы v2 инструктируют в snake_case, файлы правил v2 написаны в CamelCase.)
- (a) атрибут `schema="2"` на корневом теге + таблица соответствия snake_case↔CamelCase в аудите.
- (b) аудит принимает оба регистра как эквивалентные (нормализация имён при чтении), без версии — дешевле всего, но следующее переименование опять пройдёт незамеченным.
- (c) одноразовая миграция `gennady rules --migrate-schema`, переписывающая файлы потребителя в CamelCase.
- (d) ничего не делать.

**Q4. Где живёт детерминированная проверка контракта правила.** (Блокирует T-3.)
- (a) только `ai/kit` — дёшево, но потребитель не получает ничего.
- (b) только `sdd-check --rules` — доступно потребителю, но у мейнтейнера вне семьи директивных аудитов.
- (c) **один модуль, два входа** — логика в `shared/sdd/`, вызывается и из `ai/kit`-аудита, и из `sdd-check --rules` — рекомендуется.
- (d) оставить как в v1 (bash + белый список) — не переносимо в v2 (в RC нет `ai/skills/sdd-execute/scripts/`).

**Q5. Что считать «пер-стековым правилом» до появления пресетов.** (Блокирует T-1 в части python/go, T-8.)
- (a) портировать `python-rules`/`go-rules` из main как есть — написаны по документации, не проверены ни на одном реальном проекте (R-b2).
- (b) портировать только baseline, языковые правила писать по тропе `research-and-author` при первом реальном проекте.
- (c) портировать всё + завести на python/go по одной реальной задаче в `tasks/`, чтобы правила получили обратную связь до релиза.
- (d) портировать baseline + `go-rules` (у Go уже есть плагин и обратная связь), python отложить до первого проекта.

**Q6. Судьба категорий `architecture` и `quality`.** (Блокирует T-3 через `shared/sdd/rule-paths.ts`.) Уточнение: списков категорий в пакете сегодня **три**, не два — 5 в `_sdd-lib.sh:14`, 4 в `ax-scope-rules-declaration.xml:3-7` (без `quality`), 3 в устаревшей шапке `check.sh:38`. Q6 обязана согласовать все три, не только предикат с Cascade Table.
- (a) оставить в предикате как «проектные категории», записать явно.
- (b) выпилить `quality` (каталога нет нигде), `architecture` оставить.
- (c) наполнить `architecture` хотя бы одним правилом (`ports-adapters`, на которое уже ссылается шаблон).
- (d) свести к трём категориям (`coding`/`testing`/`infra`), убрать `architecture` из Cascade Table — правит формат таблицы и все существующие Cascade Table у потребителей.

**Q7. Как разрешить блокирующую зависимость T-1 от VERIFY.** (Новый вопрос; блокирует T-1 целиком и, соответственно, гипотезу (b) и все четыре варианта дизайна. Обе baseline-правила вызывают `<sdd-path> verify --wip <target-files>`, которого в RC не существует.)
- (a) дождаться, пока трек VERIFY поставит команду, совместимую с `verify --wip` (например, алиас `sdd-verify --wip`) — тогда T-1 портирует хуки дословно; чисто, но ставит T-1 в очередь после решения по VERIFY.
- (b) переписать оба `<Command>` под существующий `sdd-verify` прямо сейчас, не дожидаясь трека VERIFY — **рекомендуется**, если baseline нужен немедленно; риск — переписать второй раз после решения по VERIFY.
- (c) baseline-хуки временно ссылаются на `<sdd-path> verify` без `--wip` (полный прогон вместо прогона по изменённым файлам) — дешевле переписать, но дороже по времени исполнения на каждой фазе.
- (d) не портировать `<VerificationHooks>` baseline вовсе до решения по VERIFY — нарушает контракт «четыре секции присутствуют и не пусты» (d2), будущий аудит это поймает сам.

---

## 5. Список задач

Размеры: S ≤ 1 сессия, M = 1–2, L > 2. «Проверка» различает **детерминированный тест** (`node:test`, входит в `npm test`) и **LLM-eval** (сценарий `ai/flow-eval`). «Eval-группа»: **G1** — пер-стековые правила (не-Node проект получает осмысленный каскад); **G2** — владение и sync. «—» = закрывается только детерминированными тестами.

Задачи ниже декомпозируют рекомендованный **R-A′**; там, где задача относится только к целевому состоянию **R-B**, это указано отдельно.

| id | Цель | Файлы | Проверка | Eval | Размер | Зависит от |
|---|---|---|---|---|---|---|
| **T-1** | Портировать стек-агностичный baseline и языковые правила в v2; починить два неполных файла RC; замкнуть зависимость там, где реестр обещает наследование | NEW `ai/directives/coding/{baseline-rules,python-rules,go-rules}.xml`, NEW `ai/directives/testing/baseline-testing.xml`; `ai/directives/knowledge.xml` (+4 записи, сузить `<Triggers>` у `typescript-rules`, шапка PROJECT-OWNED); `ai/directives/testing/vitest-rules.xml` (+`<RewardCriteria>`); `ai/directives/testing/node-test.xml`; `ai/directives/coding/uikit-spec-drafting.xml` (+`<VerificationHooks>`); `ai/directives/coding/typescript-rules.xml` (+`<DependsOn> - coding/baseline-rules.xml`); `ai/directives/{coding,testing}/README.md` (см. T-14) | **детерм.**: универсальный контрактный тест «каждый файл каскадных категорий несёт четыре непустые секции»; тест «зависимость каждого правила резолвится и без циклов» | G1 | **M** | **Q7** (VERIFY-зависимость baseline-хуков — блокирует, не «—») |
| **T-2** *(только R-B)* | Ввести слои реестра и единственный модуль слияния | NEW `shared/sdd/rule-registry.ts`; NEW `ai/directives/knowledge.core.xml`, NEW `ai/directives/knowledge.stack.xml`; `ai/directives/knowledge.xml` → тонкий overlay; `task-authoring-literals.ts` (делегирование, дубликат `id` между слоями перестаёт быть ошибкой); `sdd-new.cmd.ts` | **детерм.**: `rule-registry.test.ts` — перекрытие по `id`, подавление, отсутствие слоя, дубликат внутри одного слоя = ошибка | G2 | **M** | Q1(b), Q2; **не нужна при R-A′** |
| **T-3** | Детерминированный аудит контракта правила, доступный и мейнтейнеру, и потребителю | NEW `shared/sdd/rule-paths.ts`; NEW `shared/sdd/rule-surface.ts`; NEW `ai/kit/audit-rule-surface.ts`; `sdd-check.cmd.ts` (флаг `--rules`, коды `SDD_RULES_FILE_INCOMPLETE`, `SDD_RULES_SCHEMA_LEGACY`, `SDD_RULES_REGISTRY_DANGLING`, `SDD_RULES_UNREGISTERED`); `package.json` (`audit:rule-surface`) | **детерм.**: `rule-surface.test.ts` (полный/неполный файл; пустые маркеры; snake_case-фикстура → `SCHEMA_LEGACY`, не `INCOMPLETE`; unregistered-фикстура; dangling `<File>`); `audit-rule-surface.test.ts` (exit-код, формат) | — | **M** | Q3, Q4, Q6. Подмножество (d3): расширить уже существующую проверку `buildRuleDepsMap`/`ERR_CLI_SDD_CHECK_READ_FAILED` на пакетное дерево, не вводить заново |
| **T-4** | Владение при `sync`: сохранить проектный реестр и файлы правил проекта | `cli/cmd/sync/sync-core.ts` (`PROJECT_OWNED_ENTRIES`, отключение удаления проектного файла правила внутри каскадной категории); `sync.types.ts` (+`'preserved'`) | **детерм.**: `sync-core.test.ts` — (a) `knowledge.xml` differs → `preserved`, не записан; (b) проектный файл правила в owned-категории не удаляется. *Для R-B дополнительно*: (c) патченная директива → `locally-modified`, видна в `--dry-run`; (d) `knowledge.stack.xml` перезаписывается всегда — эти два кейса и манифест `.gennady-synced` относятся к T-2/R-B, не к облегчённой версии T-4 | **G2** | **S** (R-A′) / **M** (R-B, с манифестом) | Q1 |
| **T-5** | Вернуть в v2 потерянный текст R5 и явно указать, куда проект пишет своё правило; вернуть делегирование инструменту и cap `MINOR` в маршрутизацию `RULE_FILE_INCOMPLETE` | `ax-rules-resolution-hard-fail.xml` (+3 предложения); `ax-scope-rules-declaration.xml`; `ax-rules-compliance-against-activated-rules.xml` (вернуть «Section presence is NOT judged by eye», снизить `MAJOR`→`MINOR`); `ax-mechanical-via-sdd-check.xml` (дописать полноту файла правила в перечни); `ai/directives/sdd-v2/audit.directive.xml` (маршрут `rule-file-fix`, порт `audit.directive.xml:125,155`) | **детерм.**: `npm run audit:sdd-templates`; тест «`RULE_FILE_INCOMPLETE` не может быть маршрутизирован в `ticket-reopen`/`code-fix`» | — | **S** | T-3 |
| **T-6** | Убрать фиктивность: `SDD_RULES_PHASE_EMPTY` (info) в обоих местах глушения; решение по `architecture`/`quality` | `shared/sdd/rules-cascade.ts:62` **и** `cli/cmd/sdd-check/sdd-check.cmd.ts:429` (оба глушителя пустого `Rules:`, не один); фильтр `:427` (ссылка без `.xml`); `shared/sdd/rule-paths.ts` (по Q6) | **детерм.**: `rules-cascade.test.ts` (+кейс «пустой список → info-находка», покрывающий оба места); тест «каждое правило из примеров форматов существует на диске» (заодно фиксирует `ports-adapters`, унаследованный из v1) | — | **S** | Q6 |
| **T-7** *(только R-B)* | Миграционный шаг для существующих потребителей: не вернуть им чужой стек при включении слоёв | `sync-core.ts` (при первом `sync` с многослойным реестром — дописать подавляющие записи для пакетных `id`, отсутствующих в проектном `knowledge.xml`) | **детерм.**: фикстура `cloud-ios` (5 своих правил, 0 пакетных, **и без `baseline-*`-файлов — дерево предшествует `5a237cd5`**) → после миграции активны только 5; фикстура `messenger` (19 записей, 1 своя) | **G2** | **M** | T-2, T-4, Q2; **не нужна при R-A′** |
| **T-8** *(после трека VERIFY)* | Facet правил у плагина стека: `knowledge.stack.xml` генерируется, а не хранится | `services/stack/stack.types.ts` (+`rules` facet); `plugins/{node,golang,anystack}/*-plugin.ts`; NEW `plugins/python/**`; диагностика коллизии имён файлов | **детерм.**: `plugins/*/__tests__/*-rules.test.ts` (facet полон, `<File>` резолвится); тест «два плагина с одинаковым именем файла → диагностируемая ошибка» | **G1** | **L** | T-2 (или T-4 при R-A′) + перенос **`plugins/` и `services/stack/`** в v2 (M-8: обоих, не только первого) |
| **T-9** | Замок поставляемой поверхности для правил в v2 — в RC нет каталога `scripts/__tests__/` вовсе и нет аналога `deployed-surface.golden.txt` | NEW golden-тест-эквивалент для RC, включая `ai/directives/knowledge*.xml` и все файлы каскадных категорий | **детерм.**: golden-тест с `UPDATE_SURFACE_GOLDEN=1`; «ни одного пути разработчика в поверхности» | **G2** | **S** | — (зависимость от T-2 избыточна — можно вводить первым, зафиксировав текущую поверхность) |
| **T-10** | Переименовать `agents-rules` → `agents-orient` | `cli/cmd/agents-rules/**` → `cli/cmd/agents-orient/**`; регистрация; help-тексты | **детерм.**: существующий тест переносится; тест «старое имя даёт понятную ошибку с указанием нового» | — | **S** | — |
| **T-11** | Зарегистрировать три `uikit-*` в реестре или объявить их не-правилами | `ai/directives/knowledge.xml` (3 записи `<Rule>` **или** вывод файлов из каскадных категорий) | **детерм.**: тест из T-3 (d4) | — | **S** | T-3 |
| **T-12** | Вернуть блок `<Directives>` в реестр v2 | `ai/directives/knowledge.xml` (+6 записей SDD-директив, как в main `:8-53`) | **детерм.**: `<File>`-existence чек из T-3 (d4), распространённый на `<Directive>`-записи (поймал бы висячий `task-scaffolding.directive.xml` у `messenger`) | — | **S** | T-3 |
| **T-13** | Детерминированная проверка раскрытия `<RequiresVerification>` алиаса | Подмножество T-3 (d6), выделено отдельной задачей — см. §5.2, «немедленно» | **детерм.**: тест «каждый уникальный алиас из реестра встречается в Verification Commands infra-спеки» | — | **S** | — |
| **T-14** *(main-side)* | Снять `go-rules.xml`/`python-rules.xml` из блока «Planned» | `MAIN/ai/directives/coding/README.md:21-25`, `testing/README.md:15-21` — идентичны в RC | **детерм.**: `grep` «Planned» не содержит уже поставленных файлов | — | **S** | T-1 |

### 5.1 Eval-группы: что судит модель, а что — тест

**G1 — пер-стековые правила.** Проверяемое утверждение: *не-Node проект получает в фазу осмысленный, непустой и непротиворечивый набор правил.*

| Что | Тип | Почему |
|---|---|---|
| файл правила полон, зависимости резолвятся, реестр ↔ диск согласованы | **детерминированный тест** (T-1, T-3, T-8) | чистая проверка структуры |
| `sdd-new` не печатает `typescript-rules` в тикет python-фикстуры | **детерминированный тест** | это механическая тропа (§1.3, M-9) — `sdd-new` копирует кортежи из реестра, тест не требует модели |
| `typescript-rules` не активируется моделью при построении Cascade Table для `.py`/`.go`/`.swift` | **LLM-eval G1** | `<Triggers>` — свободный текст-условие, активация принципиально семантическая (`AX_RULE_ACTIVATION_PLAN`: «Signal-based only») |
| scaffold python-скоупа кладёт в фазу `baseline-rules` + `python-rules` и не кладёт `typescript-rules` | **LLM-eval G1** | поведение агента на реальном дереве |
| scaffold swift-скоупа, для которого правил нет, идёт по тропе `skip`/`research-and-author`/`defer`, а не выдумывает ссылку | **LLM-eval G1** | ровно тот случай, который R5 описывает текстом |
| фикстуры: python-репозиторий (`pyproject.toml`), go-репозиторий (`go.mod`), swift-репозиторий (`Package.swift`) | **инфраструктура eval** | в RC 14 фикстур, 11 Node + 3 bash/Makefile; ни одной python/go/swift — предпосылка, без которой G1 нечем измерять |

**G2 — владение и sync.** Проверяемое утверждение: *правки проекта в слое правил выживают обновление пакета, а пакетные обновления доезжают.*

| Что | Тип |
|---|---|
| `knowledge.xml` differs → `preserved`, не записан | **детерминированный тест** (T-4) |
| проектный файл правила в owned-категории не удаляется | **детерминированный тест** (T-4) |
| *(R-B)* патченная директива → `locally-modified`; `knowledge.stack.xml` перезаписывается всегда; merge слоёв; миграция подавлений | **детерминированный тест** (T-2, T-7) |
| поставляемая поверхность не потеряла и не приобрела файл правила | **детерминированный тест** (T-9, golden) |
| «агент, которому сказали добавить правило для нового языка, пишет его в проектный реестр, а не в пакетный» | **LLM-eval G2** | единственное в G2, что требует модели — выбор места записи — решение агента, не механика |

**Вывод по evals.** Из четырнадцати задач одиннадцать закрываются детерминированными тестами полностью или в основном; LLM-eval нужен ровно в четырёх точках (три в G1, одна в G2). Прежде чем заводить eval-сценарии G1, нужны python/go/swift фикстуры — их сегодня нет ни одной.

### 5.2 Что стоит сделать немедленно, независимо от выбора варианта

Шесть пунктов не зависят от выбора между R-A′ и R-B (первые три — регресс относительно main, оставшиеся три — дешёвые детерминированные меры, снимающие главные риски обоих вариантов):

1. **`ai/directives/testing/vitest-rules.xml` без `<RewardCriteria>` и `ai/directives/coding/uikit-spec-drafting.xml` без `<VerificationHooks>`** — оба файла в main починены коммитом `d86c49dd`; в RC они неполны. Дефект содержимого пакета, который уедет потребителю с релизом v2.
2. **`ai/directives/knowledge.xml:9` — `<Triggers>` у `typescript-rules`.** Одна строка. Пока она такая, v2 обещает python-проекту правило TypeScript — причём не только семантически, но и механически, через `sdd-new`.
3. **Порт `f74c8c1d`** (`PROJECT_OWNED_ENTRIES` + `preserved`) и **отключение зеркального удаления проектного файла правила внутри каскадной категории**. Без этого релиз v2 гарантированно уничтожит Swift-реестр `cloud-ios` в четвёртый раз, а теперь ещё и их четыре файла правил.
4. **`<File>`-existence + unregistered-чек** (одна проверка, S): ловит `messenger`-дрейф, `golang-setup` без записи, три `uikit-*`, и снимает главный риск C1 — то есть делает Q1 не блокирующим решением, а выбором с известной ценой.
5. **Решение по хукам baseline (Q7)** — без него ни один вариант дизайна не переносит baseline корректно: оба хука вызывают команду, которой в RC не существует.
6. **Детерминированная проверка раскрытия `<RequiresVerification>` алиаса (T-13/d6)** — алиас объявлен у 17 из 19 записей main и 12 из 14 RC, раскрытия не проверяет никто ни в одной ветке; самый дешёвый чек из всех предложенных, и он же превращает нерезолвящийся `check-command` из локального комментария `cloud-ios` в находку пакета для всех потребителей, включая самохостинг.

---

## 6. Итог верификации

**Что проверялось.** Независимая верификация (V-B4, свежие глаза, read-only) перепроверила ~190 привязок `file:line` из §1–§2 по коду двух чекаутов (MAIN, RC) и деревьев двух потребителей (`cloud-ios`, `messenger`), воспроизвела все четыре прогона §2.1, перепроверила вердикты R1–R5 по механизму (а не только по формулировке), оценила полноту пространства вариантов §4 и декомпозицию задач §5 на пропущенные зависимости и файлы.

**Счёт по цитатам:** ~170 CONFIRMED; 15 WRONG-LINE (смещения 1–9 строк, факт в нужном блоке — исправлены прямо в тексте выше); 12 REFUTED / неверно оформлено — из них **три меняют вывод**, девять уточняют формулировку без изменения вывода.

**Три блокирующих опровержения:**

| # | Утверждение до правки | Опровержение | Где исправлено в этом документе |
|---|---|---|---|
| **K** | Порт baseline «остаётся корректным при любом решении по треку VERIFY» — «слабое взаимодействие, и это плюс» | Оба хука baseline (`HOOK_PROJECT_GATE`, `HOOK_TESTS_PASS`) вызывают `<sdd-path> verify --wip <target-files>`; в RC нет ни команды `verify`, ни флага `--wip` (`grep -rn 'verify --wip' rc-v6/{ai,cli,specs}` = ∅) | §3.3, §4.4/§4.6 (все варианты), T-1, новый вопрос Q7 |
| **D/H** | v2 «потерял ребро зависимости в прозу» / «сохранил тот же запрет» на чтение чужих правил | v2 ввёл **второй канал** — `<InheritedBaseline>` (`RC/testing/vitest-rules.xml:8`, `node-test.xml:8`) + разрешающую норму `ax-rules-load-from-phase-block.xml:5-11`, которой в main нет. Дефект реален, но другой: две системы наследования, механика читает одну | §1.1, §1.3, §2 R2, §4.5 (∞) |
| **L** | `messenger` — «живая иллюстрация» замораживания пакетной части реестра при C1 | Единственная эмпирика — висячая ссылка `messenger/knowledge.xml:26` — лежит в блоке `<Directives>`, которого в реестре v2 нет вообще | §3.4, §4.4 (новый вариант R-A′), §4.6 (рекомендация пересмотрена) |

**Счёт по существу:**

| Проверка | Результат |
|---|---|
| R1–R5 | R1/R3 НЕ ЗАКРЫТО, R5 ЧАСТИЧНО — подтверждены прогонами без изменений. R2 — согласие с расщеплением механика/содержимое, обоснование содержимого заменено (H). R4 — НЕПРИМЕНИМО подтверждено, дыра глубже: в RC нет и `services/stack/` (M-8), R-C заблокирован тремя отсутствиями, не двумя |
| Числа §1.6/§1.7 | `messenger` 8/7/4 файла (не 9/8/5 — README.md не в счёт); `cloud-ios` 18 незарегистрированных пакетных правил (не 12); `golang-setup` — 30 вхождений в 14 файлах main (не 14 вхождений); три `uikit-*` недостижимы из реестра вообще (не «только через `<DependsOn>`») |
| Пространство вариантов §4 | Было неполным: не хватало (0) «реестр не зеркалится» и (∞) развилки `<DependsOn>` vs `<InheritedBaseline>`. Добавлен четвёртый вариант R-A′ (steelman), который закрывает R1/R2/R3/R5 ценой M вместо L, без миграции, и становится новой рекомендацией «сейчас» |
| Задачи §5 | Добавлены T-11 (регистрация `uikit-*`), T-12 (возврат `<Directives>` в реестр v2), T-13 (проверка раскрытия `<RequiresVerification>`, вынесена в §5.2), T-14 (README «Planned»). T-6 расширена (два места глушения пустого `Rules:`, не одно, плюс фильтр `.xml`). T-1 помечена зависимой от нового Q7 |
| Воспроизводимость | Все четыре прогона §2.1 воспроизведены побитово независимо: main `check.sh` tree → 23 OK, `rule_findings=0`; `messenger` → 19 `INCOMPLETE`, `rule_findings=19`; RC `rules-cascade.test.ts` → 7/7; main `{testing-rule-contract,sdd-check-rules}.test.ts` → 11/11. Частоты snake_case-тегов `messenger` совпали число в число (плюс уточнение: ещё 2× `<Inherited_Baseline>`, не учтённые в первом проходе) |

**Итоговый вывод изменился в одной точке.** Рекомендация смещена с «R-B прямо сейчас» на **R-A′ сейчас / R-B как целевое состояние**. Причина — не ошибка в описании R-B (он остаётся корректным и самым полным целевым дизайном), а то, что главный довод против более дешёвой альтернативы («C1 замораживает реестр — вот `messenger`») оказался опёрт на пример, которого в топологии v2 не существует (L). После снятия этого довода дешёвая альтернатива — с одним точечным усилением (детерминированный `<File>`-existence/unregistered-чек вместо трёхслойного merge) — закрывает те же четыре инварианта из пяти за M вместо L, без миграционного шага, отсутствие которого сам документ называет условием, при котором R-B «регрессирует для обоих потребителей» (R-c4). Второе по значимости изменение — задача T-1 (порт baseline) в любом варианте дизайна перестаёт быть независимой от VERIFY: без ответа на новый вопрос Q7 ни R-A′, ни R-B, ни исходный R-A не могут корректно перенести два обязательных хука.

Документ ждёт решений оператора по Q1–Q7 (§4.7); после их принятия декомпозиция §5 может быть напрямую превращена в тикеты `sdd-scaffold`.
