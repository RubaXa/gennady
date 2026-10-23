# Часть I — B4-rules-track (аналитик)

# B4 — Трек RULES: слой правил (факты, инварианты R1–R5, дизайн)

**Роль:** аналитик трека RULES аудита переноса SDD v1→v2. Режим read-only.
**MAIN (v1):** `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e` @ `8bb38477`.
**RC (v2):** `…/scratchpad/rc-v6` (ветка `codex/sdd-v2-rc52-followup`).
**Потребители:** `cloud-ios` @ `origin/ap/CLOUDIOS-NOISSUE-swiftlint-exceptions-infra-base`; `/Users/k.lebedev/Developer/messenger` (рабочее дерево).
**Прочитано до начала:** A1 §3.4 (R1–R5) и §1.3 строки 81/89/96/111/113; A2 §5, §9.1, §9.2; A4 #24; B1 §4.

---

## 0. Резюме в двенадцати пунктах

1. «Правило» — это XML-файл в `ai/directives/{coding,testing,infra}` (плюс `architecture`, `quality` по предикату), несущий четыре проверяемые секции `<BeliefState>/<AntiPatterns>/<VerificationHooks>/<RewardCriteria>` и опциональный `<DependsOn>`. Реестр `ai/directives/knowledge.xml` отдельно несёт активационные поля `<Triggers>/<SkipWhen>/<ActivationHint>/<CheckPhase>/<RequiresVerification>/<CrossRef>`. Схема **не версионирована** ни в файле правила, ни в реестре.
2. Разделение обязанностей стабильно в обеих ветках: **реестр** решает «активируется ли правило» (`<Triggers>`), **файл правила** решает «что именно требуется» (четыре секции) и «что ещё обязательно прочитать» (`<DependsOn>`). `<CrossRef>` — проза для агента, механической силы не имеет ни в v1, ни в v2.
3. В main этот слой доведён до 23/23 полных файлов правил и `rule_findings=0` (прогон §2.1). В RC — 17 файлов правил, из них **два неполных**: `ai/directives/testing/vitest-rules.xml` (нет `<RewardCriteria>`) и `ai/directives/coding/uikit-spec-drafting.xml` (нет `<VerificationHooks>`). Это прямой регресс R1, и **в v2 нет ни одного механизма, который бы это поймал**.
4. Механическая проверка в v1 — bash-секция `[RULES]` в `check.sh` (толерантный скан открывающих тегов) со отдельным счётчиком `rule_findings`; в v2 её нет вовсе. Единственный код правил в v2 — `SDD_RULES_CASCADE_UNRESOLVED` (замыкание `<DependsOn>`), 7/7 тестов зелёные (§2.1).
5. Контрактный тест v1 `scripts/__tests__/testing-rule-contract.test.ts` — **хардкод-белый список из шести файлов**, а не контракт над категорией. Четыре новых файла (`baseline-rules`, `python-rules`, `go-rules`, `baseline-testing`) в нём отсутствуют и залочены только присутствием в `deployed-surface.golden.txt`. `check.sh` не запускается ни в `npm test`, ни в pre-commit — то есть R1 в main держится на ручных прогонах.
6. Ownership: main — `PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])` со статусом `preserved`, зеркальных удалений нет вообще. RC — `SyncFileStatus = 'added' | 'updated' | 'deleted' | 'unchanged'`, `knowledge.xml` перезаписывается, а файл правила проекта внутри `coding/`/`testing/`/`infra/` **удаляется** как устаревшая запись зеркала. Для потребителя это хуже v1.
7. Пер-стековое покрытие: main — `baseline-rules` + `python-rules` + `go-rules` + `baseline-testing` (`5a237cd5`) плюс `plugins/golang/directives/infra/golang-setup.xml`; RC — только TS/Svelte/Node-раннеры, ноль правил для python/go/swift/rust. В RC нет и каталога `plugins/`.
8. Плагин в main возит файл правила, но **не запись в реестре**: `golang-setup` физически доезжает до потребителя как `ai/directives/infra/golang-setup.xml` (`deployed-surface.golden.txt:50`), при этом `<Rule id="golang-setup">` в `knowledge.xml` отсутствует — `<Triggers>` его активировать не могут никогда. Тип `StackPlugin` (`services/stack/stack.types.ts:315-335`) не имеет facet'а правил вообще.
9. Реальность потребителя №1 (`cloud-ios`): проект **сам написал** полноценный Swift-реестр (5 правил: `swift-rules`, `objc-rules`, `xctest-rules`, `git-setup`, `swiftlint-setup`), 4 файла правил со всеми четырьмя секциями и `<DependsOn>`, свой `<CheckPhaseOrder>lint build test</CheckPhaseOrder>`, Cascade Table с разбором активации по фазам. И тут же зафиксировал, что `check-command` в их репозитории **не резолвится** — алиас некому раскрыть.
10. Реальность потребителя №2 (`messenger`): всё дерево правил (19 файлов) на **старой snake_case-схеме** — `<Belief_State>`, `<Anti_Patterns>`, `<Verification_Hooks>`, `<Reward_Criteria>`, `<Depends_On>`. Прогон `check.sh` даёт 19 строк `INCOMPLETE` с четырьмя отсутствующими секциями каждая (§2.1). RC-парсер `parseRuleDependsOn` на `<Depends_On>` возвращает `[]` — то есть **тихое ложно-зелёное** замыкание каскада.
11. Все четыре гипотезы оператора совместимы между собой и решают разные подзадачи: (a) — «откуда берутся стек-правила», (b) — «что читать, когда стек-правила нет», (c) — «кто владеет реестром», (d) — «кто ловит неполный файл». Единственный настоящий конфликт — между (a) и (c): пакет/плагин хочет добавлять записи в реестр, а проект хочет им владеть; это требует явной семантики merge (§3.4).
12. Рекомендация — вариант **R-B «Реестр как слияние трёх слоёв + baseline в ядре + kit-аудит схемы»** (§4.2): три слоя (core-baseline → stack-preset → project-overlay), `knowledge.xml` остаётся project-owned, стек-правила приходят из пресета в отдельный неперекрываемый каталог, а четырёхсекционный контракт становится детерминированным аудитом в `ai/kit` над *всеми* файлами категорий, а не белым списком.

---

## 1. Факты

### 1.1 Что такое «правило» — схема файла

Файл правила — это XML-подобный (не парсимый XML) документ. Толерантность к «не-XML» зафиксирована прямо в коде: файлы «are HTML-like by design and carry prose such as `<Target Files>` and `Meta<typeof Button>` that no XML parser accepts» (`ai/skills/sdd-execute/scripts/check.sh:35-37`).

Четыре обязательные секции (канон одинаков в v1 и v2):

| Секция | Содержимое | Кто читает |
|---|---|---|
| `<BeliefState>` | `<Axiom id="AX_*">` — инварианты прозой | phase-subagent; audit шаг «residual axioms» |
| `<AntiPatterns>` | `<AntiPattern id="AP_*">` с парой `<Bad>`/`<Instead>` | phase-subagent; audit |
| `<VerificationHooks>` | `<Hook id="HOOK_*">` с `<Purpose>`/`<Command>`/`<Expected>` | phase-subagent; audit; VERIFY (косвенно) |
| `<RewardCriteria>` | плоский список ✅/❌ | audit (первый проход compliance) |

Опциональная секция:

| `<DependsOn>` | bullet-список путей `ai/directives/<category>/<rule>.xml` — «правило архитектурно расширяет» | scaffold (транзитивное замыкание), audit/`sdd-check` (проверка замыкания). **Не обходится в рантайме** |

Канон формулировок:
- v1: `ai/directives/sdd/audit.directive.xml:230-240` (`AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES`), особенно `:234` про `<DependsOn>` и `:240` «`<DependsOn>` is optional and unchecked».
- v2: `ai/kit/axiom/audit/ax-rules-compliance-against-activated-rules.xml:5-12` — тот же текст, включая «Required sections: … Required section missing → `RULE_FILE_INCOMPLETE` (`MAJOR`)».

Пример полного файла (main, стек-агностичный): `ai/directives/coding/baseline-rules.xml` — `<BeliefState>` `:9-46` (6 аксиом `AX_TELEOLOGICAL_NAMING`, `AX_EXPLICIT_FAILURE`, `AX_CONTRACT_AT_SURFACE`, `AX_INTENT_COMMENTS`, `AX_YAGNI_NO_DEFENSE`, `AX_SINGLE_RESPONSIBILITY`), `<AntiPatterns>` `:48-72`, `<VerificationHooks>` `:74-86` (`HOOK_PROJECT_GATE` = `<sdd-path> verify --wip <target-files>`, `HOOK_NO_SCAFFOLD_LEFTOVER`), `<RewardCriteria>` `:88-100`.

**Схема не версионирована.** Корневой тег несёт `ver="1.0"` (`baseline-rules.xml:1`), но это версия *содержимого правила*, а не схемы секций. Ни `check.sh`, ни `rules-cascade.ts` не читают `ver`. Следствие — §1.6 (двe схемы у потребителей) и риск R-3 в §3.

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

Важно: **`<Triggers>/<SkipWhen>/<RequiresVerification>` живут в реестре, а `<DependsOn>` — в файле правила.** Это два разных пространства фактов, и они рассинхронены by design: `<CrossRef>` в реестре не обязан совпадать с `<DependsOn>` в файле. В RC это уже дало дрейф (A2 §5.2): `knowledge.xml` объявляет `<CrossRef id="testing-common">` у `vitest-rules`/`node-test`/`svelte-testing`, но **ни один из трёх не декларирует `ai/directives/testing/common.xml` в `<DependsOn>`** — значит `checkRulesCascadeClosure` этой зависимости никогда не потребует. В main это починено (`ac2e9d73`): `node-test.xml` и `vitest-rules.xml` несут `<DependsOn> - ai/directives/testing/common.xml`.

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

Парсер реестра (только v2): `shared/sdd/task-authoring-literals.ts:59-79` `parseRuleRegistry` — regex `<Rule\s+id="([^"]+)">([\s\S]*?)<\/Rule>` + `<File>`; **бросает** при нуле записей и при дублирующемся `id` (`:67,71`). `loadRuleRegistry` (`:81-91`): если существует `<repoRoot>/ai/directives/knowledge.xml` — читается он, иначе пакетный. **Слияния нет: либо проектный, либо пакетный.** Потребитель — `cli/cmd/sdd-new/sdd-new.cmd.ts:478`, невалидный реестр = exit 1 (`sdd-new.types.ts:148`).

### 1.3 Как правило доезжает до тикета

Цепочка одинаковая по форме в v1 и v2, разная по адресам артефактов.

| Шаг | v1 (main) | v2 (RC) |
|---|---|---|
| 1. Реестр читается целиком | `scaffold.directive.xml:470` STEP «Read `ai/directives/knowledge.xml` in full … Read it now — do not defer» | `ai/kit/axiom/scaffold/ax-rule-activation-plan.xml:3` «`ai/directives/knowledge.xml` (`<Rules>` section) is the canonical rule registry» |
| 2. Резолв ссылок или abort | `AX_RULES_RESOLUTION_HARD_FAIL` `scaffold.directive.xml:73-74`; halt `H_MISSING_RULES` (`:441`), `H_RULES_CYCLE` (`:442`) | `ai/kit/axiom/scaffold/ax-rules-resolution-hard-fail.xml:2-4` |
| 3. Каскад по тирам | `AX_RULES_CASCADE_RESOLUTION` `scaffold.directive.xml:77-88` — **5 тиров** (traversed-scopes, target-scope, module, task + «later overrides earlier») | `ax-rules-cascade-resolution.xml` — **4 тира** (traversed-scopes, target-scope, module, task) |
| 4. Cascade Table (Scope × Categories) | `tasks/<scope>/README.md` (`scaffold.directive.xml:87`, шаблон `:785-801` с блоком `### Rule Sources`) | `specs/<scope>/<scope>.3-tasks.md` (`ax-rules-cascade-resolution.xml`; формат `ai/directives/sdd-v2/formats/scope-tasks-index.xml:16-22`) |
| 5. Активация на фазу | `AX_RULE_ACTIVATION_PLAN` `scaffold.directive.xml:92-108`, 7 шагов; шаг 4 — транзитивное замыкание `<DependsOn>` | `ax-rule-activation-plan.xml:3-6` — те же инварианты в сжатом виде |
| 6. Запись в тикет | `Rules:` bullet-список внутри блока фазы, только per-phase (`scaffold.directive.xml:88,260,598-599,611-612`) | `formats/task-ticket-structure.xml:62` «links only, resolved from the cascade; rule content is never inlined», `:80` |
| 7. Verification-таблица | union `<RequiresVerification>` алиасов по всем фазам → таблица тикета (`scaffold.directive.xml:103-108,636-640`) | `ax-rule-activation-plan.xml:6` — «resolves through infra-spec Verification Commands into the ticket-level Verification table; the phase verifier runs only rows whose Required-by intersects the selected phase's `Rules`» |
| 8. Чтение phase-worker'ом | «phase-subagent reads ONLY its phase's block, its phase's Rules, and prior-phase Handoff payloads» (`scaffold.directive.xml:250`); `<DependsOn>` в рантайме не обходится (`:98`) | `ai/kit/axiom/scaffold/ax-rules-load-from-phase-block.xml`; тот же запрет |
| 9. Где стек влияет на выбор правил | `plugins/golang/skills/sdd-infra-golang/SKILL.md:109` — «Read in full: …`plugins/golang/directives/infra/golang-setup.xml`» (маршрутизация **прозой в скилле**) | `ai/directives/sdd-v2/infra.directive.xml:83` — «look up each chosen tool in `ai/directives/knowledge.xml` `<Rules>`: find every rule whose `<Triggers>` match the tool name or its config artefacts» |

Два наблюдения по шагу 9. В v1 связь «стек → правило» существует только как проза скилла: `sdd-infra/SKILL.md:9` маршрутизирует на `sdd-infra-golang`, тот велит прочитать файл правила плагина. В v2 связь формально сильнее (совпадение `<Triggers>` с именем инструмента), но правил для не-Node инструментов в реестре нет, поэтому совпадать не с чем; а «стека» в v2 не выбирается нигде (B1 §4.1).

### 1.4 Как правила проверяются

#### v1 — `[RULES]` в `check.sh` + контрактные тесты

Секция `[RULES]` (`ai/skills/sdd-execute/scripts/check.sh:436-491`, счётчик `:664`):

- **Что считается файлом правила** — общий предикат `sdd_lib_is_rule_path` (`ai/skills/sdd-execute/scripts/_sdd-lib.sh:16-19`) над `SDD_RULE_PATH_RE` (`:14`):
  `(^|/)(ai/directives|plugins/[a-z0-9-]+/directives)/(architecture|coding|infra|quality|testing)/[^/]+\.xml$` **и** имя не `*.directive.xml`. То есть 5 категорий (включая `architecture` и `quality`, каталогов для которых в пакете нет/пусто), проектное и плагинное деревья, протоколы исключены.
- **Tree mode** — все файлы правил в дереве (`rule_files_in_tree`, `:449-457`); **task mode** — только те, что цитирует тикет (`rule_files_for_task`, `:460-474`), «активированный» набор, против которого написана аксиома.
- **Как проверяется** — четыре `grep -q '<BeliefState'` / `'<AntiPatterns'` / `'<VerificationHooks'` / `'<RewardCriteria'` (`:488-491`). Скан **открывающего тега без `>`**, то есть `<BeliefState attr=…>` пройдёт, а `<Belief_State>` — нет.
- **Вывод** — TSV `file \t belief \t anti \t hooks \t reward \t verdict(OK|INCOMPLETE) \t missing`.
- **Отдельный счётчик** — `rule_findings=` не смешивается с `findings=`: «a shared rule file is project infrastructure that no single task owns or may edit, so it must not decide a task's verdict» (`:43-45`). Exit 3 при `findings + rule_findings > 0` (`:667`).

Маршрутизация находки в audit v1: `ai/directives/sdd/audit.directive.xml:85` — тип `RULE_FILE_INCOMPLETE`; `:125` — «enters this table capped at `MINOR`»; `:155` — route `rule-file-fix`, «Never `ticket-update`, never a phase owner, never `FAIL` for this task»; `:240` — «Section presence is NOT judged by eye — `sdd check --task <Task-ID>` emits `[RULES]` … Each `INCOMPLETE` row → one `RULE_FILE_INCOMPLETE`, its `missing` column copied verbatim».

Тесты v1:
- `scripts/__tests__/sdd-check-rules.test.ts` (226 строк, 8 кейсов) — тестирует **механику** `[RULES]` на синтетических фикстурах: OK-строка, один предикат для tree и task режимов, перечисление отсутствующих секций, исключение `*.directive.xml`, игнор категорий вне каскада (`ai/directives/perf-auditor/rules/x.xml`), отдельный счётчик, task-mode только цитируемые, игнор цитируемых SDD-протоколов.
- `scripts/__tests__/testing-rule-contract.test.ts` (74 строки, 3 кейса) — тестирует **содержимое реальных файлов**, но по **хардкод-списку из шести**: `coding/result-conventions.xml`, `coding/uikit-spec-drafting.xml`, `testing/common.xml`, `testing/node-test.xml`, `testing/vitest-rules.xml`, `plugins/golang/directives/infra/golang-setup.xml` (`:17-24`). Плюс точечные assert'ы на конкретные ID (`HOOK_RESULT_LINT_RULES`, `AP_UNGUARDED_MUST_AT_BOUNDARY`, `HOOK_DRAFT_REQUIRED_SECTIONS`, `HOOK_GO_VERIFY_CHANGED_SCOPE`, `HOOK_RUN_PROJECT_VERIFICATION`, `AP_ACCEPT_OUTPUT_BY_REWRITING_EXPECTATION`) — это защита от «поставили пустые маркеры секций».

**Дыра в v1, которую стоит назвать явно.** `testing-rule-contract.test.ts` — не контракт над категорией, а список. Четыре файла из `5a237cd5` (`coding/baseline-rules.xml`, `coding/python-rules.xml`, `coding/go-rules.xml`, `testing/baseline-testing.xml`) в него **не добавлены**; единственное, что их фиксирует в CI, — присутствие пути в `scripts/__tests__/deployed-surface.golden.txt:37,38,39,73`. А `check.sh` **не вызывается ни из `npm test`, ни из `scripts/git-hooks/pre-commit`** (grep по обоим — ноль вхождений). Итого: полноту секций у нового файла правил в main не проверяет никто, кроме агента, который вручную запустит `sdd check`.

#### v2 — только замыкание каскада

Единственный код правил в RC — `SDD_RULES_CASCADE_UNRESOLVED`. Модуль `shared/sdd/rules-cascade.ts` (82 строки, `@consumers: sdd-check.cmd`), три чистых экспорта:

- `normalizeRulePath(ticketFile, repoRoot, linkTarget)` (`:23-33`) — резолв ссылки bullet'а в repo-root-relative POSIX-путь. Абсолютные формы (`/…`, `C:\…`) возвращаются **дословно** намеренно: «Relativizing them first would disguise an absolute injection as traversal» (`:28-30`).
- `parseRuleDependsOn(content)` (`:41-45`) — `/<DependsOn>([\s\S]*?)<\/DependsOn>/`, затем `^\s*-\s+(\S+)` по строкам; `[]` при отсутствии секции.
- `checkRulesCascadeClosure(file, phaseId, rules, depsMap)` (`:56-82`) — DFS; каждая прямая или транзитивная зависимость, отсутствующая в объявленном списке фазы, даёт одну ошибку. **Пустой `Rules:` короткозамыкается в `[]` (`:62`) — фаза без правил не флагается никогда.**

Обвязка: `cli/cmd/sdd-check/sdd-check.cmd.ts` — `selectedRulePhases` (`:298`), `getRuleDeps`/`ruleDepsCache` (`:384-392`), `buildRuleDepsMap` (`:395-415`) с гарантией «failed nodes are never treated as proven leaves» (`:415`), `checkTicketRulesCascade` (`:417-…`), вызовы из per-ticket пути (`:1181`) и из `--all` (`:1370`).

**Чего в v2 нет:**
- ни одной проверки четырёх секций: grep `BeliefState|AntiPatterns|VerificationHooks|RewardCriteria` по `cli/`, `shared/`, `scripts/` в RC — **ноль вхождений в коде** (только в текстах директив/аксиом);
- `RULE_FILE_INCOMPLETE` существует в v2 только как **тип находки LLM-аудита** (`ai/kit/axiom/audit/ax-rules-compliance-against-activated-rules.xml:12`, `ai/kit/axiom/audit/ax-drift-taxonomy.xml:17`, `ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml:134`, `ai/kit/contract/audit/finding-format.xml:5`) — механической подпорки нет, и `ax-rules-cascade-verification.xml` прямо велит аудитору «take that finding as given, do NOT open rule files and walk `<DependsOn>` by hand» **только** про замыкание, а про секции — «audit proceeds with available sections»;
- маршрутизация в v2 слабее: `ai/directives/sdd-v2/audit.directive.xml:188` — «ticket update to correct the declared Rules list OR a separate rule-maintenance task». Формулировки v1 «capped at `MINOR`», «never `FAIL` for this task», route `rule-file-fix` в RC нет;
- аудиты `ai/kit` (`audit:sdd-templates` = `check:directives-fresh` + `audit:axioms` + `audit:contracts` + `audit:halts` + `check:directive-budgets`) не смотрят на файлы правил: единственный, кто упоминает `directives/coding|testing|infra`, — `ai/kit/check-directives-fresh.ts`, и то чтобы **исключить** их из сравнения как не-сборочные (`:25,27,134`);
- перечень механических истин v2 зафиксирован в `ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml` — два списка (`sdd-check --task`: якоря, Meta, Task-ID, fabricated DONE, граф фаз, покрытие `PHASE_Pn`; `sdd-check --all`: DAG задач, трекер↔тикет, spec-ссылки, портал). **Ни полноты файла правила, ни согласованности реестра с диском, ни регистра секций в этих списках нет.** Более того, последний абзац прямо отдаёт «rules-cascade resolution» аудиту-модели («Audit owns only what the tool cannot decide mechanically: … rules-cascade resolution …») — то есть в v2 весь слой правил, кроме замыкания объявленного списка, признан немеханизируемым по определению.

### 1.5 Как правила синхронизируются (ownership)

| Аспект | main (v1) | RC (v2) |
|---|---|---|
| Статусы | `'added' \| 'updated' \| 'unchanged' \| 'preserved'` (`cli/cmd/sync/sync.types.ts:8`) | `'added' \| 'updated' \| 'deleted' \| 'unchanged'` (`cli/cmd/sync/sync.types.ts:6`) |
| `knowledge.xml` | `PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])` (`sync-core.ts:27`), комментарий `:23-25` — «a non-Node project rewrites it for its own stack (Python, Go, Swift, …), and blindly restoring the package's TypeScript registry silently wiped that work»; ветка `:70-72` → `status = 'preserved'`, запись подавляется `:85` | обычный файл корня зеркала; перезаписывается |
| Зеркальное удаление | **нет** (grep `deleted`/`unlink` по `cli/cmd/sync/sync-core.ts` — ноль) | есть: `entries.push({ relativePath, status: 'deleted' })` (`sync-core.ts:235`) — проектный файл правила внутри `coding/`/`testing/`/`infra/` удаляется |
| Исключения | `EXCLUDED_ENTRIES = {'architecture', 'dbc-audit.directive.xml', 'dev-review.directive.xml', 'semantic-change-extractor.directive.xml'}` (`sync-core.ts:16-21`) | `EXCLUDED_ENTRIES = new Set(['architecture'])` (`sync-core.ts:16`) |
| Правила плагинов | `extraSourceDirs: pluginSurfaceDirs(_resolvePackageDir(cwd, 'plugins'), 'directives')` (`cli/cmd/sync/sync.cmd.ts:91`); слияние корней в `scanSourceRoots([opts.sourceDir, ...extraSourceDirs], …)` (`sync-core.ts:217`); нормализация путей в текстах `RULE_PLUGIN_DIRECTIVES` `plugins/<id>/directives/` → `ai/directives/` (`shared/common/sync/path-normalizer.ts:63-66`) | плагинов нет |
| Отчёт | `preserved` виден в выводе и в summary: `p > 0 ? …, ${p} preserved (project-owned)` (`sync.types.ts:74-76`) | — |
| Тест-замок | `cli/cmd/sync/__tests__/sync-core.test.ts` «preserves a project-owned knowledge.xml that differs» | `sync-core.test.ts` «deletes target directives removed from the installed package» |

Два скрытых следствия main-механики, релевантные дизайну:
1. `EXCLUDED_ENTRIES` исключает `architecture` из sync — а `SDD_RULE_PATH_RE` считает `architecture` каскадной категорией. Значит проектное правило `ai/directives/architecture/*.xml` в v1 проверяется `[RULES]`, но никогда не приезжает из пакета: это де-факто уже **проектно-владеемая категория**.
2. Слияние `extraSourceDirs` в один `Map` по `relativePath` (`sync-core.ts:217`) означает: два плагина, положившие `infra/<одно-имя>.xml`, тихо перетрут друг друга — коллизия не диагностируется. Пока плагинов три и файл один, это латентно.

### 1.6 Пер-стековые правила: пакет vs потребители

#### main (v1), 23 файла правил, все четыре секции у всех (прогон §2.1)

| Категория | Файлы |
|---|---|
| `coding` (10) | `baseline-rules`, `typescript-rules`, `python-rules`, `go-rules`, `result-conventions`, `svelte5-runes`, `sveltekit-rules`, `uikit-component-svelte`, `uikit-component-storybook`, `uikit-spec-drafting` |
| `testing` (8) | `baseline-testing`, `common`, `node-test`, `vitest-rules`, `playwright-cli`, `playwright-e2e`, `storybook-usage`, `svelte-testing` |
| `infra` (4) | `eslint-setup`, `git-setup`, `nodejs-npm-setup`, `storybook-setup` |
| plugin (1) | `plugins/golang/directives/infra/golang-setup.xml` |

Граф `<DependsOn>` в main:

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

Заметная асимметрия: `coding/typescript-rules.xml` **не** объявляет `<DependsOn> - ai/directives/coding/baseline-rules.xml`, хотя `python-rules` и `go-rules` объявляют, а `knowledge.xml:72` говорит «Language rules (python-rules, go-rules, typescript-rules) inherit this». То есть TS-правило единственное из трёх языковых, у которого наследование baseline объявлено только прозой реестра. Механически: TS-фаза не обязана нести `baseline-rules` в списке.

Второе: `python-rules`/`go-rules` тянут `testing/baseline-testing.xml` в `<DependsOn>` **coding**-правила. Замыкание корректно, но это означает, что любая python-фаза с `python-rules` обязана нести и тестовое правило, даже фаза `kind=impl` без тестовых файлов. Это осознанный компромисс «толстый лист вместо второго входа», но он ломает симметрию «coding-правила отвечают за coding».

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
| `testing/node-test.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `testing/playwright-cli.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `testing/playwright-e2e.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `testing/storybook-usage.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `testing/svelte-testing.xml` | ✔ | ✔ | ✔ | ✔ | ✔ |
| **`testing/vitest-rules.xml`** | ✔ | ✔ | ✔ | **✗** | — |
| `infra/eslint-setup.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `infra/git-setup.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `infra/nodejs-npm-setup.xml` | ✔ | ✔ | ✔ | ✔ | — |
| `infra/storybook-setup.xml` | ✔ | ✔ | ✔ | ✔ | — |

Топ-уровневые теги неполных файлов (доказательство, что это не другое имя секции, а её отсутствие):
- `testing/vitest-rules.xml`: `<Mission>` `:2`, `<InheritedBaseline>` `:8`, `<BeliefState>` `:12`, `<TestPatterns>` `:92`, `<AntiPatterns>` `:253`, `<VerificationHooks>` `:285` — конец файла, `<RewardCriteria>` отсутствует. Ирония: именно этот файл входит в белый список main-теста `testing-rule-contract.test.ts:22,46`.
- `coding/uikit-spec-drafting.xml`: `<DirectiveContext>` `:2`, `<BeliefState>` `:15`, `<DraftingProcedure>` `:117`, `<AntiPatterns>` `:197`, `<RewardCriteria>` `:223` — `<VerificationHooks>` отсутствует. Тоже в белом списке main-теста (`:19,45`).

Не зарегистрированы в RC-реестре, но лежат на диске: `coding/uikit-component-storybook.xml`, `coding/uikit-component-svelte.xml`, `coding/uikit-spec-drafting.xml` (A2 §5.1) — достижимы только через `<DependsOn>` другого правила. `ai/directives/architecture/` содержит только `README.md`, при этом формат `formats/scope-tasks-index.xml:21` приводит в примере `ports-adapters` как architecture-правило скоупа — то есть шаблон называет правило, которого в пакете нет, и `AX_RULES_RESOLUTION_HARD_FAIL` на нём должен абортить.

#### Потребитель `cloud-ios` — что проект написал сам

Реестр (`ai/directives/knowledge.xml` на ветке akkrat): `<Directives>` — копия пакетного блока; `<Rules>` — **полностью переписан**:

| Категория | `<Rule id>` | Файл | `<CheckPhase>` | Примечание из реестра |
|---|---|---|---|---|
| Coding | `swift-rules` | `ai/directives/coding/swift-rules.xml` | `lint` | `<ActivationHint>` предупреждает: «`AP_TRUST_DISABLED_RULE`: force_unwrapping and three sibling rules are inactive in MRCloudApp/.swiftlint.yml, so a clean lint is not evidence about them — those are review-enforced» |
| Coding | `objc-rules` | `ai/directives/coding/objc-rules.xml` | *(пусто)* | «No tool checks these axioms: swiftlint does not read Objective-C and the formatter is off by decision, so compliance is established at review» |
| Testing | `xctest-rules` | `ai/directives/testing/xctest-rules.xml` | `test` | — |
| Infra | `git-setup` | `ai/directives/infra/git-setup.xml` | *(пусто)* | «Two deviations in this repository … Take the discipline, not the examples» — **проект оставил пакетное правило, но переписал его `<ActivationHint>`** |
| Infra | `swiftlint-setup` | `ai/directives/infra/swiftlint-setup.xml` | `lint` | «`AX_RULE_LISTS_ARE_EXCLUSIVE` is currently violated by four rules — `HOOK_RULE_LIST_EXCLUSIVITY` prints the count» |

Плюс:
- собственный `<CheckPhaseOrder>lint build test</CheckPhaseOrder>` с объяснением, почему нет `typecheck` и `format`;
- комментарий-предупреждение прямо в реестре: «`RequiresVerification=check-command` is the composed entry point; here that is `gennady verify` … the alias is resolved through the infra scope spec's Verification Commands, and `specs/infra-base` §4 still numbers its commands V1..V10 without declaring aliases. **Until it does, check-command does not resolve in this repository.**»

Файлы правил проекта — все четыре секции + `<DependsOn>` там, где надо: `swift-rules.xml` (`<Mission>` `:2`, `<BeliefState>` `:12`, `<AntiPatterns>` `:84`, `<VerificationHooks>` `:128`, `<RewardCriteria>` `:151`); `objc-rules.xml` (`<DependsOn>` `:13`); `xctest-rules.xml` (`<DependsOn>` `:16`); `swiftlint-setup.xml` (`<DependsOn>` `:11`). Хуки — реальные команды их гейта: `gennady verify --only=swiftlint`, `gennady fix`, `gennady verify --only=unit-tests`, и компенсирующая проверка `git diff --unified=0 origin/master -- 'MRCloudApp/**/*.swift' | grep -nE '(as!|try!|\)!|\]!)'` для аксиомы, которую линтер не покрывает.

Cascade Table (`tasks/infra-base/README.md`) — по форме ровно v1-шаблон `scaffold.directive.xml:785-801`, по содержанию — разбор реальной активации:

```
| Tier                   | coding      | testing      | architecture | infra            |
| traversed-scopes       | —           | —            | —            | —                |
| infra-base (target)    | swift-rules | xctest-rules | —            | swiftlint-setup  |
| task                   | swift-rules | xctest-rules | —            | swiftlint-setup  |
```

и текст под таблицей: «`swift-rules` попадает в каскад двумя путями: напрямую на фазах, где правятся `.swift`, и транзитивно через `<DependsOn>` у `swiftlint-setup`»; «Тир `task` собран по фазам, а не по одной»; «вывод по `<Triggers>` даёт пустое множество … Оба правила подключены решением тикета … Чистая альтернатива — дописать в `<Triggers>` … но это правка `knowledge.xml` и файла правила, вне границ скоупа». Это **самое точное описание проблемы тира `task`, какое есть во всём корпусе** — и оно написано потребителем, а не пакетом.

Цена, которую платит `cloud-ios`: в дереве лежат 12 синхронизированных, но не зарегистрированных в их реестре пакетных правил Node/TS — `coding/{result-conventions,svelte5-runes,sveltekit-rules,typescript-rules,uikit-component-storybook,uikit-component-svelte,uikit-spec-drafting}.xml`, `infra/{eslint-setup,golang-setup,nodejs-npm-setup,storybook-setup}.xml` и весь `testing/` пакета. Мусор в iOS-репозитории, который `[RULES]` в tree-режиме всё равно проверяет.

#### Потребитель `messenger` — старая схема секций

Дерево: `coding/` (9 файлов, включая **проектный `logging-rules.xml`**), `testing/` (8), `infra/` (5), плюс **своя категория `language/`** с проектной директивой `lang-lint.directive.xml` (21 543 байта) + `README.md` + `examples.md`, и `perf-auditor/rules/`.

Реестр `messenger/ai/directives/knowledge.xml`: 19 `<Rule>` записей; проектная запись `logging-rules` (`:70-78`); проектная директива зарегистрирована в блоке `<Directives>` — `<File>ai/directives/language/lang-lint.directive.xml</File>` (`:49`). Дрейф: `:26` ссылается на `ai/directives/sdd/task-scaffolding.directive.xml`, а в дереве файл называется `scaffold.directive.xml` — **висячая ссылка в проектном реестре**, следствие того, что реестр project-owned, а имена пакетных директив меняются.

Главный факт: **вся вокабуляра секций в `messenger` — snake_case.** Частоты топ-уровневых тегов по 19 файлам правил:

```
19  <Belief_State      16  <Reward_Criteria    16  <Mission        16  <Anti_Patterns
15  <Verification_Hooks 13 <Definitions       10  <Code_Patterns   7  <Depends_On
 5  <Workflow_Outline   4  <Setup_Steps        3  <Directive_Context …
```

Следствия, обе — доказанные прогоном/чтением кода:
- `check.sh [RULES]` на `messenger` даёт **19 строк `INCOMPLETE` с `missing = BeliefState,AntiPatterns,VerificationHooks,RewardCriteria`** (полный прогон в §2.1). Инструмент говорит «правил нет вообще» там, где правила есть — но в другом регистре;
- RC-парсер `parseRuleDependsOn` (`shared/sdd/rules-cascade.ts:42`) на `<Depends_On>` возвращает `[]`. Значит `checkRulesCascadeClosure` в `messenger` **всегда зелёный** — 7 файлов с объявленными зависимостями невидимы. Это не «нет проверки», это **ложно-положительная проверка**.

Для сравнения: `cloud-ios` синхронизировался позже и стоит на CamelCase-генерации (`coding/typescript-rules.xml` там: `<Mission>`, `<BeliefState>`, `<Definitions>`, `<CodePatterns>`, `<AntiPatterns>`, `<VerificationHooks>`, `<RewardCriteria>`). То есть **регистр секций у потребителя определяется датой последнего `sync`**, миграции нет, а версии схемы, по которой можно было бы отличить одно от другого, не существует.

### 1.7 Сводная таблица: v1 vs v2 vs реальность потребителя

| Свойство | v1 (main `8bb38477`) | v2 (RC) | `cloud-ios` | `messenger` |
|---|---|---|---|---|
| Файлов правил | 23 (вкл. 1 плагинный) | 17 | 4 своих + 19 пакетных | 19 (1 своё) |
| Все четыре секции | 23/23 (`check.sh` tree: `rule_findings=0`) | **15/17** — `testing/vitest-rules.xml` без `<RewardCriteria>`, `coding/uikit-spec-drafting.xml` без `<VerificationHooks>` | 4/4 у своих | **0/19** (snake_case) |
| Регистр секций | CamelCase | CamelCase | CamelCase | **snake_case** |
| Записей в реестре | 19 (+ блок `<Directives>` 6) | 14 (без `<Directives>`) | 5 (свой `<CheckPhaseOrder>`) | 19 (+ 7 директив, 1 висячая) |
| Стек-агностичный baseline | `coding/baseline-rules.xml` `:1-101`, `testing/baseline-testing.xml` `:1-89` | **нет** | нет (не нужен — весь набор свой) | нет |
| Языки в реестре | TS, Python, Go (+Svelte/SvelteKit) | **только TS** (`<Triggers>` ловят любой язык) | Swift, ObjC | TS + Svelte |
| `typescript-rules` `<Triggers>` | `.ts / .tsx` (`knowledge.xml:79`) | `source code files (not config)` (`:9`) | не зарегистрировано | `.ts/.tsx`-подобное |
| Механическая проверка секций | `check.sh:436-491` + `_sdd-lib.sh:14`; счётчик `rule_findings` `:664` | **нет** | (тем же `check.sh`) | (тем же `check.sh` → 19 INCOMPLETE) |
| Проверка замыкания `<DependsOn>` | прозой аудита (`audit.directive.xml:264`), механики нет | `shared/sdd/rules-cascade.ts:56-82` → `SDD_RULES_CASCADE_UNRESOLVED` | — | **ложно-зелёная** (`<Depends_On>`) |
| Контрактный тест содержимого | `testing-rule-contract.test.ts` — белый список 6 файлов | **нет** | — | — |
| `RULE_FILE_INCOMPLETE` | тип + cap `MINOR` + route `rule-file-fix` (`audit.directive.xml:85,125,155,240`) | только тип находки LLM-аудита (`ax-rules-compliance-against-activated-rules.xml:12`) | — | — |
| `knowledge.xml` при `sync` | `preserved` (`sync-core.ts:27,70-72,85`) | **перезаписывается** | пострадал трижды (A4 #24) | не синхронизировался |
| Правило проекта в пакетной категории | выживает (main не удаляет) | **удаляется** (`sync-core.ts:235`) | — | `coding/logging-rules.xml` под угрозой |
| Стек-правила плагина | файл едет (`sync.cmd.ts:91` → `deployed-surface.golden.txt:50`), запись в реестре — **нет** | плагинов нет | — | — |
| Cascade Table живёт в | `tasks/<scope>/README.md` (`scaffold.directive.xml:87`) | `specs/<scope>/<scope>.3-tasks.md` (`formats/scope-tasks-index.xml:16`) | `tasks/infra-base/README.md` | — |
| Тиров каскада | 5 (`scaffold.directive.xml:77-88`) | 4 (`ax-rules-cascade-resolution.xml`) | использует 3 из 4 | — |
| Реестр: слияние слоёв | нет (один файл) | нет — «проектный ИЛИ пакетный» (`task-authoring-literals.ts:81-91`) | — | — |

### 1.8 `cli/cmd/agents-rules/**` — что это на самом деле

К слою правил **не относится**. `cli/cmd/agents-rules/agents-rules.cmd.ts` (47 строк, идентичен по существу в main и RC) печатает содержимое `cli/cmd/orient/README.md` из установленного пакета: «Prints agent-facing orient documentation from the gennady package README.md» (`:10-11`). Проверяет наличие `node_modules/gennady` (`:20`), резолвит пакет через `import.meta.resolve('gennady')` (`:25`), читает `resolve(packageDir, 'cli/cmd/orient/README.md')` (`:33`), `console.log(content)` (`:41`). Никакого отношения к `knowledge.xml`, `<Rule>`, каскаду или файлам правил. Имя команды («rules» = «правила поведения для агентов», т.е. инструкция по ориентированию) — источник путаницы: в трекере RULES она проходит как ложное срабатывание. **Рекомендация к §5: переименовать в `agents-orient` (или `orient --agents`) при следующем ломающем изменении CLI, иначе каждый следующий аудит будет тратить время на этот файл.**

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
4. `RULE_FILE_INCOMPLETE` в v2 — только тип находки LLM-аудита (`ai/kit/axiom/audit/ax-rules-compliance-against-activated-rules.xml:12`), без обязательной механической подпорки (`AX_MECHANICAL_VIA_SDD_CHECK` покрывает только замыкание, см. `ax-rules-cascade-verification.xml`).
5. `RULE_FILE_INCOMPLETE` в v2 маршрутизируется мягче и неоднозначнее: `ai/directives/sdd-v2/audit.directive.xml:188` — «ticket update … OR a separate rule-maintenance task». Гарантии v1 («capped at `MINOR`», «never `FAIL` for this task», route строго `rule-file-fix`) в v2 нет.

Побочно про main: инвариант там держится, но замок слабый — белый список из 6 файлов, четыре новых файла не покрыты содержательным тестом, `check.sh` не входит ни в `npm test`, ни в `scripts/git-hooks/pre-commit`.

### R2 — рёбра каскада объявлены, а не описаны прозой: `<DependsOn>` у `vitest-rules`/`node-test` → `testing/common.xml`; у `python-rules`/`go-rules` → `baseline-rules`

**Формулировка main**: `ac2e9d73` + `5a237cd5`; `testing/node-test.xml:8`, `testing/vitest-rules.xml:8`, `coding/go-rules.xml:8`, `coding/python-rules.xml:7`.

**Вердикт в v2: НЕ ЗАКРЫТО в части содержимого, ЗАКРЫТО в части механики.**

- Механика в v2 **сильнее** main: `checkRulesCascadeClosure` (`shared/sdd/rules-cascade.ts:56-82`) даёт `SDD_RULES_CASCADE_UNRESOLVED` за каждую недостающую прямую или транзитивную зависимость; в main такой проверки нет вообще, только прозой в `audit.directive.xml:264`.
- Содержимое в v2 **хуже**: ни `testing/vitest-rules.xml`, ни `testing/node-test.xml` в RC не несут `<DependsOn>` (см. таблицу §1.6) — при том, что `knowledge.xml` объявляет `<CrossRef id="testing-common">` у обоих. Ребро, которое `ac2e9d73` сделал механическим, в RC снова только проза.
- `python-rules`/`go-rules` в RC отсутствуют физически — ребро к `baseline-rules` неприменимо, потому что нет ни одного, ни другого.
- Дополнительный дефект механики v2, который стоит зафиксировать: `if (rules.length === 0) return []` (`rules-cascade.ts:62`) — фаза, объявившая пустой `Rules:`, не проверяется вообще. Это легальный случай по main-аксиоме («A scope that legitimately activates no rules yet declares an empty set (valid)»), но он же — самый простой способ обойти проверку.

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

Практический смысл последней строки: v2, применённый к python-проекту, положит в фазу `[typescript-rules](ai/directives/coding/typescript-rules.xml)` — 589 строк TS-специфики — как правило для `.py`-файлов, и ни одна проверка этого не заметит (`sdd-check` проверяет только замыкание объявленного списка, не осмысленность активации).

### R4 — golang-специфика живёт в плагине и синхронизируется потребителю как `ai/directives/infra/golang-setup.xml`; node не поставляет директив

**Формулировка main**: `a336f17b`, `5651c05f`, `d6479748`; `plugins/golang/plugin.json`, `shared/common/sync/path-normalizer.ts:63-65`; замки — `publish-contents.e2e.test.ts`, `sync-skills.e2e` «plugin-owned skills», `deployed-surface.golden.txt`.

**Вердикт в v2: НЕПРИМЕНИМО (в RC нет каталога `plugins/` вовсе) — и это дыра, а не упрощение.**

Что подтверждено в main:
- `plugins/golang/plugin.json` = `{ "id": "golang", "kind": "stack", "entry": "golang-plugin.ts" }`;
- файл правила плагина: `plugins/golang/directives/infra/golang-setup.xml` (184 строки), все четыре секции (`<BeliefState>` `:10`, `<AntiPatterns>` `:134`, `<VerificationHooks>` `:160`, `<RewardCriteria>` `:175`), корневой тег `type="infra-rules"`;
- доставка: `cli/cmd/sync/sync.cmd.ts:91` `extraSourceDirs: pluginSurfaceDirs(…, 'directives')` → `sync-core.ts:217` `scanSourceRoots([sourceDir, ...extraSourceDirs])` → путь в потребителе `ai/directives/infra/golang-setup.xml` (`scripts/__tests__/deployed-surface.golden.txt:50`), тексты нормализуются `RULE_PLUGIN_DIRECTIVES` (`shared/common/sync/path-normalizer.ts:63-66`);
- скилл плагина `plugins/golang/skills/sdd-infra-golang/SKILL.md` маршрутизируется из `ai/skills/sdd-infra/SKILL.md:9` и на `:109` велит прочитать файл правила;
- node действительно не поставляет директив: `ai/directives/infra/nodejs-npm-setup.xml` остался в `ai/` — критерий владения зафиксирован в `specs/plugins/plugins.spec.md:317` («`golang-setup.xml` ссылается на `gennady verify`, гейты и `skipGates` 27 раз и переехал; `nodejs-npm-setup.xml` — общая дисциплина Node-рантайма, ноль таких ссылок, остался»).

**Но инвариант неполон даже в main, и это ключевой факт для §3(a):**
- `<Rule id="golang-setup">` в `ai/directives/knowledge.xml` **отсутствует** (grep `golang-setup` по main: 14 вхождений — README, спеки, скилл, тест, golden — и **ни одного в реестре**). Значит `<Triggers>`/`<SkipWhen>`/`<CheckPhase>`/`<RequiresVerification>` для этого правила не объявлены, и `AX_RULE_ACTIVATION_PLAN` (шаг 3 — «evaluate its `<Triggers>` and `<SkipWhen>`») не может его активировать. Правило доезжает до потребителя как файл, но не как участник каскада; попасть в тикет оно может только через тир `task` (операторское решение) или через `<DependsOn>` другого правила.
- Тип `StackPlugin` (`services/stack/stack.types.ts:315-335`) несёт `id`, `marker`, `description`, `detect()`, `gateIds`, `verify` — **facet'а правил нет**. Плагин не может объявить ни свои `<Rule>`-записи, ни baseline, ни какие категории он покрывает. Связь «стек → правила» в v1 существует только как конвенция каталога и проза скилла.

### R5 — scaffold: ссылка на правило либо резолвится, либо abort; не-Node скоуп пишет свои правила и вносит их в project-owned реестр; пустой набор правил валиден, висячая ссылка — нет

**Формулировка main**: `f74c8c1d`; `ai/directives/sdd/scaffold.directive.xml:74,95,470`. Замка нет — только текст директивы.

**Вердикт в v2: ЧАСТИЧНО.**

Что сохранилось: `ai/kit/axiom/scaffold/ax-rules-resolution-hard-fail.xml:2-4` несёт «All rule references must resolve; missing rule = abort … Each ref must exist as `ai/directives/<category>/<rule>.xml`. On miss: abort with explicit list. A placeholder rule reference (TBD, `<rule>`, "to be authored", any unresolved name) = abort».

Что **потеряно** относительно main `scaffold.directive.xml:74`: три предложения целиком —

> «The rule set is PROJECT-OWNED (`ai/directives/knowledge.xml`, kept across sync): the shipped rules are TypeScript-oriented, so a non-Node scope authors its own rule files for its stack and lists them — do NOT invent references to package rules that do not exist for the project's language. A scope that legitimately activates no rules yet declares an empty set (valid); this is distinct from a dangling reference (abort).»

В RC этого нет ни в `ax-rules-resolution-hard-fail.xml`, ни в `ax-rule-activation-plan.xml`, ни в `ax-rules-cascade-resolution.xml`, ни в `ai/directives/sdd-v2/scaffold.directive.xml`. То есть **инструкция «пиши свои правила, а не выдумывай ссылки на пакетные» из v2 исчезла**, и это именно та инструкция, которая спасала `cloud-ios`.

Ослабляющий фактор в v2, компенсирующий частично: `ai/kit/axiom/scaffold/ax-scope-rules-declaration.xml` (источник — `discovery.directive.xml`) сохранил трёхвариантный операторский разбор отсутствующего правила: **skip** / **research-and-author** (WebFetch авторитетных доков → черновик → одобрение оператора → запись в `ai/directives/<category>/<name>.xml`) / **defer**, с `H_MISSING_RULE_FILE` только при отказе оператора выбирать. Это и есть работающая тропа авторинга — но она пишет файл в **пакетную категорию**, которую v2-`sync` затем удаляет (`sync-core.ts:235`). То есть в RC тропа авторинга и механика sync прямо конфликтуют.

Дополнительно: `ai/directives/sdd-v2/formats/scope-tasks-index.xml:21` приводит в примере Cascade Table architecture-правило `ports-adapters`, файла `ai/directives/architecture/ports-adapters.xml` в пакете нет — шаблон учит писать ссылку, на которой `AX_RULES_RESOLUTION_HARD_FAIL` должен абортить.

### Сводка R1–R5

| # | Инвариант | Вердикт в v2 | Главное доказательство |
|---|---|---|---|
| R1 | четыре секции у всех файлов правил; `rule_findings=0` | **НЕ ЗАКРЫТО** | `testing/vitest-rules.xml` без `<RewardCriteria>`; `coding/uikit-spec-drafting.xml` без `<VerificationHooks>`; ноль механических проверок секций в коде RC |
| R2 | рёбра каскада объявлены в `<DependsOn>` | **НЕ ЗАКРЫТО** (содержимое) / **ЗАКРЫТО** (механика) | RC `vitest-rules`/`node-test` без `<DependsOn>`; но `rules-cascade.ts:56-82` + 7/7 тестов |
| R3 | baseline-родители + тонкие языковые правила; узкий `<Triggers>` у TS; шапка PROJECT-OWNED | **НЕ ЗАКРЫТО** | RC `knowledge.xml:9` — TS-правило ловит любой язык; нет `baseline-*`, `python-rules`, `go-rules`; нет шапки |
| R4 | стек-специфика в плагине, доезжает как `ai/directives/infra/*` | **НЕПРИМЕНИМО** (нет `plugins/` в RC) — и неполон в main: нет `<Rule>`-записи, нет facet'а в `StackPlugin` | `services/stack/stack.types.ts:315-335`; grep `golang-setup` ∩ `knowledge.xml` = ∅ |
| R5 | ссылки резолвятся или abort; не-Node скоуп пишет свои правила; пустой набор валиден | **ЧАСТИЧНО** | `ax-rules-resolution-hard-fail.xml` сохранил abort, потерял три предложения про PROJECT-OWNED / свои правила / валидный пустой набор |

### 2.1 Прогоны (evidence этой сессии, всё read-only)

**(1) RC — тесты каскада правил.** `node --import tsx --test rc-v6/shared/sdd/__tests__/rules-cascade.test.ts`:

```
# tests 7   # suites 3   # pass 7   # fail 0   # duration_ms 217.97
  checkRulesCascadeClosure
    ok 1 - замыкание полное → без findings
    ok 2 - пропущена прямая зависимость → SDD_RULES_CASCADE_UNRESOLVED
    ok 3 - пропущена транзитивная (второй уровень) зависимость → находка
    ok 4 - пустой список правил → без findings
```

Вывод: механика замыкания в v2 корректна и покрыта. Кейс 4 фиксирует поведение «пустой список не проверяется» как намеренное.

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
ai/directives/coding/python-rules.xml	1	1	1	1	OK	-
ai/directives/coding/result-conventions.xml	1	1	1	1	OK	-
… (svelte5-runes, sveltekit-rules, typescript-rules, uikit-component-storybook,
    uikit-component-svelte, uikit-spec-drafting, eslint-setup, git-setup,
    nodejs-npm-setup, storybook-setup, baseline-testing, common, node-test,
    playwright-cli, playwright-e2e, storybook-usage, svelte-testing, vitest-rules) …
plugins/golang/directives/infra/golang-setup.xml	1	1	1	1	OK	-

[SUMMARY]
mode=tree
findings=90
rule_findings=0
```

`rule_findings=0` — R1 в main подтверждён фактическим прогоном. (`findings=90` — это TASKID/TRACKER_SYNC/LOG самохостинга, вне трека RULES.)

**(4) `messenger` — тот же `check.sh` на реальном потребителе.** 19 строк, все `INCOMPLETE`:

```
[RULES]
# file	belief	anti	hooks	reward	verdict	missing
ai/directives/coding/logging-rules.xml	0	0	0	0	INCOMPLETE	BeliefState,AntiPatterns,VerificationHooks,RewardCriteria
ai/directives/coding/result-conventions.xml	0	0	0	0	INCOMPLETE	BeliefState,AntiPatterns,VerificationHooks,RewardCriteria
ai/directives/coding/svelte5-runes.xml	0	0	0	0	INCOMPLETE	…
ai/directives/coding/sveltekit-rules.xml	0	0	0	0	INCOMPLETE	…
ai/directives/coding/typescript-rules.xml	0	0	0	0	INCOMPLETE	…
ai/directives/coding/uikit-component-storybook.xml	0	0	0	0	INCOMPLETE	…
ai/directives/coding/uikit-component-svelte.xml	0	0	0	0	INCOMPLETE	…
ai/directives/coding/uikit-spec-drafting.xml	0	0	0	0	INCOMPLETE	…
ai/directives/infra/eslint-setup.xml	0	0	0	0	INCOMPLETE	…
ai/directives/infra/git-setup.xml	0	0	0	0	INCOMPLETE	…
ai/directives/infra/nodejs-npm-setup.xml	0	0	0	0	INCOMPLETE	…
ai/directives/infra/storybook-setup.xml	0	0	0	0	INCOMPLETE	…
ai/directives/testing/common.xml	0	0	0	0	INCOMPLETE	…
ai/directives/testing/node-test.xml	0	0	0	0	INCOMPLETE	…
ai/directives/testing/playwright-cli.xml	0	0	0	0	INCOMPLETE	…
ai/directives/testing/playwright-e2e.xml	0	0	0	0	INCOMPLETE	…
ai/directives/testing/storybook-usage.xml	0	0	0	0	INCOMPLETE	…
ai/directives/testing/svelte-testing.xml	0	0	0	0	INCOMPLETE	…
ai/directives/testing/vitest-rules.xml	0	0	0	0	INCOMPLETE	…
```

Причина — единственная: старый регистр секций (`<Belief_State>` и т.д.), см. §1.6. **Это не «правила плохие», это инструмент, не знающий, что схема переименовывалась.** Инструмент, который на живом проекте с 19 корректно написанными правилами говорит «19 нарушений», обучает своих пользователей игнорировать его вывод.

**(5) Статические срезы секций** (полные таблицы в §1.6): main 23/23 полных; RC 15/17; `cloud-ios` свои 4/4 полных; `messenger` 0/19 из-за регистра.

---

## 3. Проблема слоя правил

### 3.1 Что ломается у не-Node проекта сегодня

Тропа проекта на Python/Go/Swift, шаг за шагом, с указанием, где именно она обрывается.

| Шаг тропы | v1 (main) | v2 (RC) |
|---|---|---|
| 1. Discovery/infra выбирает инструменты | работает; `sdd-infra` маршрутизирует на `sdd-infra-golang` только для Go (`ai/skills/sdd-infra/SKILL.md:9`), для Python/Swift ветки нет | работает по scope-type, стек нигде не выбирается (B1 §4.1: «сегодня "стек" в v2 не выбирается нигде») |
| 2. Резолв правил под выбранные инструменты | Python/Go: `python-rules`/`go-rules` есть → каскад непустой. Swift/Rust: правил нет → тропа `research-and-author` | `infra.directive.xml:83` ищет правило по `<Triggers>` = имя инструмента; для `ruff`/`mypy`/`go vet`/`swiftlint` таких правил в реестре **нет** → пусто |
| 3. Что попадёт в фазу вместо | `baseline-rules` + языковое правило (Python/Go) — осмысленно | `typescript-rules` (его `<Triggers>` `:9` ловит любой исходник) — **осмысленно неверно**; либо оператор объявляет пустой набор, и тогда фаза едет без правил вовсе |
| 4. Проект пишет своё правило | `ax-scope-rules-declaration` / `discovery.directive.xml` тропа `research-and-author` → файл в `ai/directives/<category>/` | та же тропа (`ai/kit/axiom/scaffold/ax-scope-rules-declaration.xml`) |
| 5. Проект вносит его в реестр | `knowledge.xml` project-owned → правка выживает (`sync-core.ts:27`) | правка **перезаписывается** первым же `gennady sync` |
| 6. Файл правила проекта в пакетной категории | выживает (main не удаляет) | **удаляется** как устаревшая запись зеркала (`sync-core.ts:235`) |
| 7. Проверка полноты нового правила | `check.sh [RULES]` — но только вручную, и только если регистр секций CamelCase | нет проверки вовсе |
| 8. `<RequiresVerification>` резолвится в команду | через Verification Commands infra-спеки; в `cloud-ios` **не резолвится** (их же комментарий в реестре) | `ax-rule-activation-plan.xml:6`; для не-Node гейт всё равно `npm run <script>` (B1 §4.2) |
| 9. Гейт из `<VerificationHooks>` запускается | хуки — проза для агента; исполняет их агент, не рантайм | то же |

Итого три независимых обрыва:

**Обрыв 1 (содержание).** Пакет не знает ни одного не-Node стека на уровне правил (v2 — вообще, v1 — знает Python/Go текстом и Go — плагином, но без записи в реестре). Проект обязан написать 2–5 файлов правил (`cloud-ios` написал 4) — это несколько сотен строк осмысленного текста, каждый раз с нуля.

**Обрыв 2 (владение).** Написав их, проект теряет их при следующем обновлении пакета: в v2 — и реестр, и файлы; в v1 — файлы выживают, реестр выживает, но **всё остальное дерево директив по-прежнему перетирается** (A4 #24: манифеста хэшей и overlay нет, «патченная директива по-прежнему перетирается как `updated`»). `cloud-ios` терял реестр трижды.

**Обрыв 3 (проверяемость).** Слой правил в v2 проверяется только на замыкание объявленного списка. Ни «полон ли файл правила», ни «осмысленна ли активация», ни «совпадает ли регистр секций со схемой пакета» не проверяется. А в v1 проверка есть, но она (i) не в CI, (ii) хардкод-белый список для содержимого, (iii) даёт 19 ложных нарушений на живом потребителе из-за неверсионированной схемы.

Отдельно стоит назвать четвёртый, менее очевидный: **тир `task` каскада не выводим из `<Triggers>`.** Разбор `cloud-ios` (`tasks/infra-base/README.md`, блок под Cascade Table) — прямое свидетельство: для фазы, чей `Target Files` — только `CODEOWNERS`, «вывод по `<Triggers>` даёт пустое множество», и оба правила подключены **решением тикета**, потому что «предмет фазы — защита линт-гейта». Механика активации формально сигнальная, а на практике оператор регулярно доопределяет набор руками — и это нигде не отмечено как легальный, ожидаемый режим (в отличие от тира `task`, который существует, но не имеет ни формата записи причины, ни проверки).

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
   `StackRuleEntry` — типизированный аналог `<Rule>`, чтобы запись реестра была **данными плагина**, а не текстом, который надо вручную вклеить в `knowledge.xml`.
2. Материализация записей. Новая функция `renderRegistryLayer(plugins: readonly StackPlugin[]): string` рядом с `shared/sdd/task-authoring-literals.ts` — рендерит `<Rules>`-фрагмент из facet'ов. Потребители: `sync` (пишет слой на диск), `loadRuleRegistry` (читает слой).
3. Место на диске. **Не** `ai/directives/knowledge.xml` (он project-owned), а отдельный неперекрываемый файл: `ai/directives/knowledge.stack.xml` — «package-owned, перезаписывается всегда, руками не правится». Проект видит его, но не редактирует; свои правки кладёт в `knowledge.xml`.
4. Файлы правил. Механизм уже есть в v1 и работает: `cli/cmd/sync/sync.cmd.ts:91` `extraSourceDirs` + `sync-core.ts:217` + `shared/common/sync/path-normalizer.ts:63-66`. Нужно добавить диагностику коллизии (два плагина, одно имя файла) — сейчас `Map` тихо перетирает.
5. Активация. Ничего не меняется: `AX_RULE_ACTIVATION_PLAN` уже «signal-based only … zero hardcoded language/tool knowledge» — ему всё равно, из какого слоя пришла запись.

**Файлы, которые правятся.**
`services/stack/stack.types.ts` (тип); `plugins/golang/golang-plugin.ts` + `plugins/node/node-plugin.ts` + `plugins/anystack/anystack-plugin.ts` (facet'ы; anystack — пустой); `plugins/index.ts` (без изменений); `cli/cmd/sync/sync-core.ts` + `sync.cmd.ts` (слой + коллизии); `shared/sdd/task-authoring-literals.ts` (`loadRuleRegistry` читает два файла); `scripts/__tests__/deployed-surface.golden.txt` (+ `knowledge.stack.xml`); новые файлы правил `plugins/golang/directives/coding/go-rules.xml`, `plugins/node/directives/coding/typescript-rules.xml` (переезд), `plugins/python/**` (новый плагин).

**Взаимодействие с VERIFY (B1 §4).** Прямая и полезная: B1 §4.4 п.7 уже называет перенос `baseline`/`go`/`python` файлов «обязательной частью "стек детектируется и влияет на правила"». Если стек определяется один раз (`detectStacks(root, config, registry)`, B1 §4.4 п.1) и печатается как `STACK=`/`STACK_SOURCE=` в `sdd-state` (п.2), то **тот же результат детекции выбирает слой правил** — один факт, один источник, шесть потребителей вместо пяти. Более того, это закрывает инвариант B1 («`sdd-state`, `sdd-task`, `sdd-verify` обязаны видеть один и тот же `StackDetection`») ещё и для scaffold: каскад перестаёт быть седьмой правдой о стеке.
Второй стык — `<RequiresVerification>`: если запись реестра приходит из плагина, плагин может объявлять алиас, который **он же умеет исполнять** (`gateIds` уже есть в `StackPlugin:328`). Это ровно тот разрыв, который зафиксировал `cloud-ios` («check-command does not resolve in this repository»): сегодня алиас объявляет реестр, а раскрывает infra-спека, и никто не проверяет, что раскрытие существует.

**Взаимодействие с SYNC ownership.** Разделение «package-owned слой (`knowledge.stack.xml`, всегда перезаписывается) + project-owned слой (`knowledge.xml`, `preserved`)» снимает главный конфликт: пакет получает право добавлять записи, не трогая проектных. Требует, чтобы `sync` умел писать файл, которого нет в исходном дереве как файла (генерируемый артефакт) — сегодня `sync` только копирует.

**Риски.**
- R-a1: **Проект теряет право отключить пакетное правило.** Если слой стека перезаписывается всегда, `cloud-ios` не сможет выкинуть `typescript-rules` из активного набора — только заглушить его `<SkipWhen>`, которого он не контролирует. Нужен механизм подавления в project-слое (см. §3.4).
- R-a2: `parseRuleRegistry` (`task-authoring-literals.ts:67,71`) бросает на дубликате `id` — при двух слоях дубликат станет **нормой** (проект переопределяет пакетное правило). Семантика merge обязана быть определена до реализации, иначе `sdd-new` начнёт падать с exit 1.
- R-a3: Плагинов стеков в RC нет вообще, а в main есть три (`anystack`, `golang`, `node`) — гипотеза (a) в v2 упирается в задачу «перенести plugins/ в v2», то есть в трек VERIFY (B1 §3, вариант A′). Без него (a) неисполнима.
- R-a4: Коллизия имён файлов между плагинами и пакетом (`infra/git-setup.xml` у двух источников) — сейчас недиагностируема.

**Effort:** L (без переноса `plugins/` в v2 — блокирована; с ним — L поверх).

### 3.3 Гипотеза (b): language-agnostic baseline в ядре

**Что это значит конкретно.** Ядро поставляет 1–2 стек-независимых родительских правила, которые активируются, когда специфичного правила нет; языковые/раннерные правила их наследуют через `<DependsOn>` и не повторяют аксиомы.

**Это уже сделано в main** коммитом `5a237cd5` и является самой дешёвой из четырёх гипотез: `ai/directives/coding/baseline-rules.xml` (101 строка, 6 аксиом, 4 антипаттерна, 2 хука, 11 критериев) и `ai/directives/testing/baseline-testing.xml` (89 строк, 5 аксиом, 4 антипаттерна, 2 хука, 10 критериев). Оба стек-агностичны буквально: хук `HOOK_PROJECT_GATE` — `<sdd-path> verify --wip <target-files>`, то есть «гейт, как проект его объявил», без упоминания npm; `HOOK_NO_SCAFFOLD_LEFTOVER` и `HOOK_NO_SKIPS` — `rg` по изменённым файлам.

**Дизайн-эскиз (перенос в v2 + доведение).**

1. Портировать четыре файла: `ai/directives/coding/{baseline-rules,python-rules,go-rules}.xml`, `ai/directives/testing/baseline-testing.xml` (в RC отсутствуют физически).
2. Портировать записи реестра: `knowledge.xml` `<Rule id="baseline-rules">`, `<Rule id="baseline-testing">`, `<Rule id="python-rules">`, `<Rule id="go-rules">` + сузить `<Triggers>` у `typescript-rules` до `.ts / .tsx` и дописать `<SkipWhen>` «non-TypeScript language».
3. **Замкнуть дыру, которую main оставил:** добавить `<DependsOn> - ai/directives/coding/baseline-rules.xml` в `coding/typescript-rules.xml`. Сегодня из трёх языковых правил только TS не объявляет наследование механически, хотя `knowledge.xml:72` его декларирует.
4. Рассмотреть разделение «толстого листа»: `python-rules`/`go-rules` тянут `testing/baseline-testing.xml` в `<DependsOn>` **coding**-правила. Альтернатива — отдельные `testing/pytest-rules.xml` / `testing/gotest-rules.xml` с `<DependsOn> - baseline-testing`, а `coding/*-rules` зависят только от `coding/baseline-rules`. Это чище по категориям, но +2 файла и +2 записи реестра.
5. Уточнить `<SkipWhen>` baseline: сегодня `knowledge.xml:71` — «a more specific language rule already covers the file and inherits this». Формулировка корректна, но требует от активатора рассуждения «а наследует ли». Механически надёжнее: baseline активируется **всегда** для source-файлов, а специфичное правило добавляется сверху; дублирование текста предотвращает не `<SkipWhen>`, а дисциплина «не переизлагать аксиомы родителя» (она уже записана в шапках обоих файлов).

**Файлы:** 4 новых XML + `ai/directives/knowledge.xml` (+~42 строки) + `deployed-surface.golden.txt` (+4) + `ai/directives/coding/README.md` (убрать `go-rules.xml`/`python-rules.xml` из блока «Planned» — они уже существуют) + `ai/directives/testing/README.md` (то же для `pytest.xml`/`go-test.xml`, если п.4 принят).

**Взаимодействие с VERIFY.** Слабое и это плюс: baseline не называет ни одного инструмента, только `<sdd-path> verify --wip <target-files>`. То есть baseline остаётся корректным при любом решении по треку VERIFY. Единственный стык: `<RequiresVerification>check-command</RequiresVerification>` у обоих baseline-правил (`knowledge.xml:74,136`) — алиас всё ещё должен раскрываться infra-спекой, и у `cloud-ios` он не раскрывается.

**Взаимодействие с SYNC.** Нулевое: это пакетные файлы в пакетных категориях, `preserved` их не касается — **пока проект не решит их переопределить**. Тогда включается §3.4.

**Риски.**
- R-b1: **Ложное чувство покрытия.** `baseline-rules` — 6 аксиом общего инженерного смысла. Для python-проекта этого мало, но каскад станет непустым, и `sdd-check` будет зелёным. Есть риск, что проекты перестанут писать свои правила, потому что «правило же есть». Мера — `<ActivationHint>` уже говорит «Language rules … inherit this — read the specific one too», но это проза.
- R-b2: `python-rules`/`go-rules` в main написаны «по интернету» (шапки: «Grounded in: PEP 8, Ruff/mypy docs, PyPA packaging guides», «Effective Go, Go Code Review Comments, go.dev/blog/go1.13-errors»). Они не проверены на реальном python/go-проекте ни разу — ни одной задачи в `tasks/` под них нет. Это правила без обратной связи.
- R-b3: `<RewardCriteria>` `python-rules:85` («Tests use pytest with `@pytest.mark.parametrize`») и `go-rules:87` («Table-driven tests … stdlib `testing` only at baseline») — это **тестовые** критерии в **coding**-правиле. Дубль с `baseline-testing`, зародыш дрейфа.

**Effort:** S (портирование 4 файлов + записи), M если п.4 принят.

### 3.4 Гипотеза (c): `knowledge.xml` project-owned — семантика merge реестра

**Что это значит конкретно.** Реестр — артефакт проекта. Пакет (и/или пресет стека) поставляет записи, проект их дополняет и переопределяет. Вопрос, который надо решить: **как именно** «пакет добавляет, проект владеет».

Сегодня семантики merge нет ни в одной ветке:
- main: **замена файла целиком** — `PROJECT_OWNED_ENTRIES` даёт бинарное «есть проектный → пакетный игнорируется полностью». Значит проект, добавивший одно правило Swift, автоматически замораживает всю пакетную часть реестра на версии, которая была на момент seed. `messenger` — живая иллюстрация: его реестр ссылается на `ai/directives/sdd/task-scaffolding.directive.xml`, которого в пакете нет уже давно (файл называется `scaffold.directive.xml`).
- RC: слияния нет и владения нет — `loadRuleRegistry` (`task-authoring-literals.ts:81-91`) читает «проектный ИЛИ пакетный», а `sync` перезаписывает проектный.

**Три возможных семантики merge (это и есть развилка для оператора, Q3 в §4.5):**

| Семантика | Правило | Плюс | Минус |
|---|---|---|---|
| **C1. Файл целиком** (как main сейчас) | есть `ai/directives/knowledge.xml` → он единственный источник | ноль новой механики; уже работает | проект замораживает пакетные записи навсегда; дрейф как в `messenger` |
| **C2. Два файла, один порядок** | `ai/directives/knowledge.stack.xml` (package/preset-owned, всегда перезаписывается) + `ai/directives/knowledge.xml` (project-owned). Итоговый реестр = concat, при совпадении `id` **проектная запись побеждает**; проектная запись с пустым `<File>` = **подавление** пакетной | пакет может обновлять свои записи; проект может переопределить и выключить; ровно два файла, порядок очевиден | требует правки `parseRuleRegistry` (дубликат `id` перестаёт быть ошибкой), нового статуса в `sync`, объяснения в двух шапках |
| **C3. Overlay-каталог** | `ai/directives.local/` целиком поверх `ai/directives/` (предложение (3) из A4 #24) | единый механизм для правил, реестра и всех остальных директив | самый большой объём: резолв путей во всех потребителях (`check.sh`, `rules-cascade.ts`, `loadRuleRegistry`, `sdd-new`, scaffold-текст); двойное дерево путает агента |

**Дизайн-эскиз C2 (рекомендуемый).**

1. `shared/sdd/rule-registry.ts` (новый модуль, чистый): `parseRegistryLayer(content) → RuleRegistryEntry[]` (расширить существующий `parseRuleRegistry`, чтобы он возвращал ещё `category` и полный набор активационных полей); `mergeRegistryLayers(stackLayer, projectLayer) → { entries, suppressed, overridden }`. Правило слияния — одно, объявленное явно: **последний слой побеждает по `id`; запись без `<File>` подавляет**.
2. `loadRuleRegistry(repoRoot)` читает оба файла и возвращает результат merge; отсутствие любого слоя легально.
3. `sync`: `knowledge.stack.xml` — обычный package-owned файл (`added|updated|unchanged`); `knowledge.xml` — `preserved` (порт `f74c8c1d`). Дополнительно порт манифеста из A4 #24 п.2 для всех остальных директив (`ai/directives/.gennady-synced`, статус `locally-modified`, `--force`), и **зеркальное удаление только файлов из манифеста** — иначе проектное правило в `coding/` продолжит исчезать.
4. Текст: вернуть в v2 три потерянных предложения R5 (§2, R5) в `ax-rules-resolution-hard-fail.xml`, добавить в `ax-scope-rules-declaration.xml` явное указание, в какой из двух файлов записывать новое правило (`knowledge.xml`, не `knowledge.stack.xml`), и куда кладётся файл правила проекта.
5. Отдельная категория для проектных файлов правил (снимает проблему «пакетная категория удаляется»): либо `ai/directives/project/<category>/`, либо (дешевле и уже полу-легально) закрепить, что проектные правила лежат в тех же `coding/`/`testing/`/`infra/`, но защищены манифестом п.3. Первое чище для sync, второе — не ломает `SDD_RULE_PATH_RE` и Cascade Table.

**Файлы:** `shared/sdd/rule-registry.ts` (новый) + `shared/sdd/task-authoring-literals.ts` (делегирование) + `cli/cmd/sync/{sync-core,sync.types,sync.cmd}.ts` + `shared/common/sync/sync-formatter.shared.ts` + `ai/directives/knowledge.xml` (шапка) + `ai/directives/knowledge.stack.xml` (новый) + `ai/kit/axiom/scaffold/{ax-rules-resolution-hard-fail,ax-scope-rules-declaration}.xml` + `ai/kit/templates/sdd-v2/*.hbs` (пересборка) + `deployed-surface.golden.txt`.

**Взаимодействие с VERIFY.** Косвенное: если пресет стека поставляет свой слой реестра (гипотеза (a)), то `knowledge.stack.xml` — **выход** пресета, и его содержимое зависит от `detectStacks` (B1 §4.4 п.1). Тогда порядок операций фиксируется: детекция → слой стека → merge с проектным → каскад. Это добавляет `STACK=` в число входов scaffold, ровно как B1 §4.4 п.8 добавляет его в `READINESS_PREFLIGHT_GATE`.

**Риски.**
- R-c1: **Дрейф проектного реестра от пакетных переименований.** C2 не лечит его полностью: проектная запись, ссылающаяся на исчезнувший пакетный файл, остаётся висячей. Нужна проверка «каждый `<File>` в итоговом merge существует» — детерминированный тест/чек, не LLM (см. §3.5, задача T-5).
- R-c2: Подавление через пустой `<File>` — тихая семантика. Альтернатива — явный атрибут `<Rule id="…" suppressed="true"/>`; читаемее, но добавляет поле в схему.
- R-c3: Два файла с похожими именами в одном каталоге — реальная вероятность, что агент запишет правило не туда. Мера: шапка `knowledge.stack.xml` первой строкой — «PACKAGE-OWNED. Do not edit: `gennady sync` overwrites this file. Project overrides go to `knowledge.xml`.»
- R-c4: Совместимость. Проекты, у которых уже есть полный проектный `knowledge.xml` (`cloud-ios`, `messenger`), после включения C2 получат **и** пакетный слой обратно — то есть `typescript-rules` снова станет активным в iOS-репозитории. Нужен миграционный шаг: при первом `sync` с C2 в проектный реестр дописываются подавляющие записи для всех пакетных `id`, которых в нём нет. Иначе C2 = регресс для обоих потребителей.

**Effort:** M (C2), S (C1 = просто порт `f74c8c1d`), L (C3).

### 3.5 Гипотеза (d): контрактные тесты правил переезжают в аудиты `ai/kit`

**Что это значит конкретно.** Проверка «файл правила несёт четыре секции» перестаёт быть bash-скриптом (`check.sh [RULES]`) и хардкод-белым списком (`testing-rule-contract.test.ts`) и становится детерминированным аудитом в семье `npm run audit:sdd-templates`, наравне с `audit:axioms`, `audit:contracts`, `audit:halts`, `check:directive-budgets`.

**Почему это правильное место.** Существующие аудиты `ai/kit` уже делают ровно этот класс работы над директивами: `audit-axiom-activation.mjs` проверяет, что каждый определённый аксиом активирован; `audit-contract-activation.mjs` — то же для контрактов; `check-directives-fresh.ts` — что собранное дерево совпадает с шаблонами. Все они запускаются одной командой из `package.json:48`, все детерминированные, все дают exit-код. Проверка схемы правила — тот же жанр.

**Дизайн-эскиз.**

1. Новый скрипт `ai/kit/audit-rule-surface.mjs` (или `.ts` в стиле `check-directives-fresh.ts`). Вход — каталоги каскадных категорий (тот же предикат, что `SDD_RULE_PATH_RE`, но в TS: **вынести в `shared/sdd/rule-paths.ts` как единственное определение**, чтобы `check.sh`-эквивалент и аудит не расходились). Проверки:
   - **(d1)** четыре секции присутствуют — открывающий и закрывающий тег;
   - **(d2)** секции не пустые: `<VerificationHooks>` содержит ≥1 `<Hook id="HOOK_…">` с непустыми `<Command>` и `<Expected>`; `<AntiPatterns>` — ≥1 `<AntiPattern id="AP_…">` с `<Bad>` и `<Instead>`; `<BeliefState>` — ≥1 `<Axiom id="AX_…">`; `<RewardCriteria>` — ≥1 ✅ и ≥1 ❌. Это ровно то, что сегодня закрывают точечные assert'ы `testing-rule-contract.test.ts:51-57,67-71`, но универсально;
   - **(d3)** каждый `<DependsOn>` bullet резолвится в существующий файл и не образует цикла (`H_RULES_CYCLE` без запуска scaffold);
   - **(d4)** каждый `<File>` в итоговом реестре (после merge, §3.4) существует, и каждый файл правила на диске либо зарегистрирован, либо достижим по `<DependsOn>` — **это ловит и `golang-setup` без записи, и три unregistered `uikit-*`**;
   - **(d5)** регистр секций: файл, несущий `<Belief_State>`/`<Anti_Patterns>`/`<Verification_Hooks>`/`<Reward_Criteria>`/`<Depends_On>`, диагностируется как **устаревшая схема** с явным сообщением и предложением миграции, а не как «секций нет». Это единственная мера, которая превращает 19 ложных нарушений `messenger` в один осмысленный вывод;
   - **(d6)** `<RequiresVerification>` алиас, объявленный записью реестра, встречается хотя бы в одном источнике раскрытия (infra-спека Verification Commands / пресет стека) — «`check-command` does not resolve in this repository» становится находкой пакета, а не комментарием потребителя.
2. Что остаётся LLM-аудиту: `RULES_COMPLIANCE_VIOLATION` (нарушил ли код аксиому/антипаттерн — irreducibly semantic), `RULES_CASCADE_MISMATCH` (пере-выведение активации из тиров — `ax-rules-cascade-verification.xml` прямо это признаёт своей работой), `INSIGHT_BACKFLOW` (предложить новое правило). `RULE_FILE_INCOMPLETE` **перестаёт быть LLM-находкой** и становится выводом аудита (d1)/(d2), как в v1 он был выводом `check.sh`.
3. Что остаётся в `sdd-check`: `SDD_RULES_CASCADE_UNRESOLVED` (замыкание объявленного списка тикета — это про тикет, а не про пакет; место верное). Плюс, желательно, новый код `SDD_RULES_PHASE_EMPTY` **как info**, чтобы «фаза без правил» была видна, а не невидима (`rules-cascade.ts:62`).

**Разделение ответственности после (d):**

| Проверка | Где | Детерминированная? |
|---|---|---|
| четыре секции, непустые | `ai/kit/audit-rule-surface` | да |
| `<DependsOn>` резолвится / без циклов | `ai/kit/audit-rule-surface` | да |
| реестр ↔ диск (unregistered / dangling) | `ai/kit/audit-rule-surface` | да |
| устаревшая схема секций | `ai/kit/audit-rule-surface` | да |
| алиас `<RequiresVerification>` раскрывается | `ai/kit/audit-rule-surface` | да |
| замыкание `Rules:` в тикете | `cli/cmd/sdd-check` → `SDD_RULES_CASCADE_UNRESOLVED` | да |
| фаза без правил | `cli/cmd/sdd-check` → `SDD_RULES_PHASE_EMPTY` (info) | да |
| активация соответствует `<Triggers>` × Target Files | audit (LLM) → `RULES_CASCADE_MISMATCH` | нет |
| код нарушает аксиому/антипаттерн | audit (LLM) → `RULES_COMPLIANCE_VIOLATION` | нет |
| правило нужно, но его нет | audit (LLM) → `INSIGHT_BACKFLOW` | нет |

**Файлы:** `ai/kit/audit-rule-surface.ts` (новый) + `shared/sdd/rule-paths.ts` (новый, единственное определение каскадных категорий) + `package.json` (`audit:rule-surface`, добавить в `audit:sdd-templates`) + `scripts/git-hooks/pre-commit` (включить, если решено) + `ai/kit/axiom/audit/ax-rules-compliance-against-activated-rules.xml` (`RULE_FILE_INCOMPLETE` объявляется механическим) + `ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml` (расширить оба перечня механических истин; убрать из «Audit owns only what the tool cannot decide mechanically» ту часть rules-cascade, которая стала детерминированной) + удаление `scripts/__tests__/testing-rule-contract.test.ts` в его текущем виде (белый список заменяется универсальным аудитом; точечные assert'ы на конкретные ID сохраняются как отдельный небольшой тест «наиболее важные хуки не выродились»).

**Взаимодействие с VERIFY.** Через (d6): проверка раскрытия алиаса требует знать, кто раскрывает — infra-спека или пресет стека. Если трек VERIFY выберет пресеты (B1 §3.6 A′), (d6) читает пресет; если нет — только infra-спеку, и находка у `cloud-ios` останется, но станет видимой.
**Взаимодействие с SYNC.** (d4) и (d5) обязаны уметь работать **в дереве потребителя**, а не только в репозитории пакета: именно там живут проектные правила и устаревшие схемы. Значит аудит должен быть доступен как подкоманда CLI (`gennady sdd-check --rules` или `gennady rules-audit`), а не только как `npm run` внутри пакета. Это отличие от остальных `ai/kit`-аудитов, которые запускаются только у мейнтейнера.

**Риски.**
- R-d1: **Аудит в пакете ≠ аудит у потребителя.** `ai/kit` — инструментарий мейнтейнера; путь к нему в потребителе не гарантирован. Если (d) реализовать только как `npm run` в репозитории gennady, `messenger`/`cloud-ios` не получат ничего. Обязательное требование: та же логика доступна из CLI.
- R-d2: (d2) «секции не пустые» — эвристика. Файл с одним фиктивным `<Hook id="HOOK_X"><Command>true</Command></Hook>` пройдёт. Порог «непустоты» надо выбрать так, чтобы он ловил `d86c49dd`-класс дефектов («поставили пустые маркеры»), но не требовал от `git-setup` придумывать хуки, которых у VCS нет (в main у `git-setup` `<CheckPhase>` и `<RequiresVerification>` пустые намеренно).
- R-d3: (d5) требует зафиксировать **обе** схемы как известные — то есть фактически ввести версионирование схемы, которого сейчас нет. Минимальный вариант: атрибут `schema="2"` на корневом теге, отсутствие = схема 1 (snake_case) или 1.5 (CamelCase без гарантии), и таблица соответствия имён.
- R-d4: `SDD_RULE_PATH_RE` включает категории `architecture` и `quality`, каталогов для которых нет (а `architecture` ещё и исключён из sync `EXCLUDED_ENTRIES`). Перенос предиката в TS обязан решить, что с ними: остаются как «проектные категории» (тогда описать это) или выпиливаются.

**Effort:** M.

### 3.6 Сводка по гипотезам

| Гипотеза | Что решает | Что НЕ решает | Блокеры | Effort |
|---|---|---|---|---|
| **(a)** стек-правила в пресете/плагине | обрыв 1 (содержание) для стеков, у которых есть плагин; связь «правило ↔ гейт» через `gateIds` | обрывы 2 и 3; стеки без плагина | нет `plugins/` в RC → зависит от трека VERIFY | L |
| **(b)** baseline в ядре | обрыв 1 частично и **немедленно** — непустой осмысленный каскад для любого языка; уже написано и работает в main | обрывы 2 и 3; глубину покрытия конкретного языка | нет | S |
| **(c)** реестр project-owned + merge | обрыв 2 полностью; даёт (a) право добавлять записи | обрывы 1 и 3 | требует решения по семантике merge (Q3) и миграции для существующих потребителей | M |
| **(d)** контракт правил в `ai/kit`-аудиты | обрыв 3 полностью, включая ложные срабатывания у `messenger` и невидимость `golang-setup` | обрывы 1 и 2 | требует доступности аудита в дереве потребителя | M |

Гипотезы **не конкурируют**: (b) → (c) → (d) → (a) — это естественный порядок по «цена/эффект», и каждый шаг делает следующий дешевле. Единственный настоящий конфликт — (a) × (c): пакет хочет писать записи в реестр, проект хочет им владеть; он разрешается введением второго слоя (C2 в §3.4), и это решение обязано быть принято **до** реализации (a).

---

## 4. Варианты дизайна слоя правил

Три варианта разобраны с одинаковой строгостью по одному шаблону: идея → механика → файлы → что закрывает из R1–R5 → стыки VERIFY/SYNC → что происходит у `cloud-ios` и `messenger` → риски → тесты → effort.

Общие критерии сравнения (по ним же итоговая таблица §4.4):
- **К1 Осмысленность каскада для не-Node проекта** — что попадёт в фазу python/swift-проекта.
- **К2 Сохранность работы проекта при обновлении пакета.**
- **К3 Механическая проверяемость** (детерминированные проверки vs LLM).
- **К4 Единственность источника факта** (сколько мест знают, какие правила у стека).
- **К5 Цена для существующих потребителей** (миграция `cloud-ios`, `messenger`).
- **К6 Независимость от трека VERIFY.**

### 4.1 Вариант R-A — «Минимальный порт v1 в v2»

**Идея.** Взять слой правил main как есть и перенести в v2. Никакой новой архитектуры: один `knowledge.xml`, project-owned по принципу «файл целиком» (C1), стек-правила остаются файлами в пакетных категориях, `[RULES]` переписывается из bash в TS и живёт в `sdd-check`.

**Механика.**
1. Портировать 4 файла правил (`coding/{baseline-rules,python-rules,go-rules}.xml`, `testing/baseline-testing.xml`) и 4 записи реестра; сузить `<Triggers>` у `typescript-rules`; вернуть шапку PROJECT-OWNED.
2. Починить два неполных файла RC (`testing/vitest-rules.xml` → `<RewardCriteria>`; `coding/uikit-spec-drafting.xml` → `<VerificationHooks>`); добавить `<DependsOn> - testing/common.xml` в `vitest-rules` и `node-test`.
3. Портировать `f74c8c1d`: `PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml'])`, статус `preserved`, показ в summary.
4. Портировать `[RULES]` как функцию `checkRuleFileSurface(paths) → Finding[]` в `shared/sdd/` + код `SDD_RULES_FILE_INCOMPLETE` в `sdd-check`, tree- и task-режимы как в `check.sh` (`--all` — все файлы категорий; per-ticket — только цитируемые).
5. Портировать текст R5 (три предложения) в `ax-rules-resolution-hard-fail.xml`.
6. Отключить зеркальное удаление внутри каскадных категорий (иначе п.1–5 не спасают проектный файл правила).

**Файлы.** 4 новых XML; `ai/directives/knowledge.xml`; `ai/directives/testing/vitest-rules.xml`; `ai/directives/coding/uikit-spec-drafting.xml`; `ai/directives/testing/node-test.xml`; `shared/sdd/rule-surface.ts` (новый); `cli/cmd/sdd-check/sdd-check.cmd.ts`; `cli/cmd/sync/{sync-core,sync.types}.ts`; `shared/common/sync/sync-formatter.shared.ts`; `ai/kit/axiom/scaffold/ax-rules-resolution-hard-fail.xml` + пересборка `ai/kit/templates/sdd-v2/*.hbs`; `deployed-surface.golden.txt`-эквивалент (в RC его нет — см. §5 T-9).

**Что закрывает.** R1 — да (файлы + механика). R2 — да (содержимое + механика уже есть). R3 — да. R4 — **нет** (нет `plugins/`, `golang-setup` остаётся вне реестра и в v2 вообще отсутствует). R5 — да (текст возвращается).

**Стыки.** VERIFY: **нулевые** — вариант ничего не знает про стек, `<RequiresVerification>` остаётся нераскрытым у `cloud-ios`. SYNC: точечные (одна запись в `PROJECT_OWNED_ENTRIES` + выключение удаления в каскадных категориях).

**Что происходит у потребителей.** `cloud-ios`: реестр перестаёт затираться (главная боль снята), но пакетные Node-правила по-прежнему приезжают файлами и по-прежнему не могут быть выключены иначе как отсутствием в проектном реестре — что как раз и работает при C1. **Для `cloud-ios` R-A почти оптимален.** `messenger`: ничего не меняется — 19 ложных `INCOMPLETE` остаются, `<Depends_On>` остаётся невидимым для `rules-cascade.ts`.

**Риски.**
- Замораживание реестра при C1 (дрейф `messenger` воспроизводится у каждого следующего проекта, который тронет реестр).
- (a) остаётся неисполнимой: пакет физически не имеет места, куда добавить запись, не затронув проектный файл.
- Неверсионированная схема остаётся: следующее переименование секции даст новый `messenger`.
- `[RULES]` в `sdd-check` — правильное место для тикета, но неправильное для «пакет проверяет свой собственный слой»: у мейнтейнера это будет запускаться только вместе с `sdd-check --all`.

**Тесты (детерминированные).** `shared/sdd/__tests__/rule-surface.test.ts` (полные/неполные фикстуры, `*.directive.xml` исключён, категории вне каскада игнорируются, отдельный счётчик); `cli/cmd/sync/__tests__/sync-core.test.ts` (+«preserves a project-owned knowledge.xml that differs», +«does not delete a project rule file inside an owned category»); контрактный тест «все файлы категорий несут четыре секции» — **обязательно универсальный, не белый список** (иначе воспроизводим дыру main).

**Effort.** M (порт + 6 пунктов).

### 4.2 Вариант R-B — «Три слоя реестра + baseline в ядре + аудит схемы в `ai/kit`» (рекомендуемый)

**Идея.** Разделить слой правил на три *источника* с явным порядком и явным владельцем, а контракт файла правила сделать детерминированным аудитом, доступным и мейнтейнеру, и потребителю. Гипотезы (b) + (c/C2) + (d) целиком; (a) — отдельный поздний этап, который этот вариант **делает возможным**, но не требует.

**Механика.**

*Слой 0 — core baseline (package-owned, всегда).* `coding/baseline-rules.xml`, `testing/baseline-testing.xml` — стек-агностичные родители, ни одного упоминания инструмента. Регистрируются в `knowledge.core.xml`.

*Слой 1 — stack preset (package/preset-owned, перезаписывается).* Файлы правил стека + записи реестра. Материализуется в `ai/directives/knowledge.stack.xml`. Сегодня наполняется из статических пакетных файлов (`typescript-rules`, `vitest-rules`, `node-test`, `eslint-setup`, `nodejs-npm-setup`, `python-rules`, `go-rules`, …); после переноса `plugins/` в v2 — из facet'а `StackPlugin.rules` (гипотеза (a)) без изменения формата на диске.

*Слой 2 — project overlay (project-owned, `preserved`).* `ai/directives/knowledge.xml`. Записи проекта; запись с тем же `id` побеждает; запись без `<File>` подавляет пакетную.

Итоговый реестр = `merge(core, stack, project)`, «последний побеждает по `id`». Один модуль знает это правило: `shared/sdd/rule-registry.ts`.

*Контракт файла правила* — `ai/kit/audit-rule-surface.ts`, доступный двумя входами: `npm run audit:rule-surface` (в составе `audit:sdd-templates`) и `gennady sdd-check --rules [--root <dir>]` (в дереве потребителя). Проверки (d1)–(d6) из §3.5. Предикат каскадных категорий — единственное определение в `shared/sdd/rule-paths.ts`.

*Версионирование схемы* — атрибут `schema="2"` на корневом теге файла правила; отсутствие = легаси, диагностируется отдельным сообщением с таблицей соответствия snake_case → CamelCase.

**Файлы.** Новые: `ai/directives/coding/{baseline-rules,python-rules,go-rules}.xml`, `ai/directives/testing/baseline-testing.xml`, `ai/directives/knowledge.core.xml`, `ai/directives/knowledge.stack.xml`, `shared/sdd/rule-registry.ts`, `shared/sdd/rule-paths.ts`, `ai/kit/audit-rule-surface.ts`. Правятся: `ai/directives/knowledge.xml` (становится тонким overlay + шапка), `shared/sdd/task-authoring-literals.ts` (делегирует), `cli/cmd/sdd-check/sdd-check.cmd.ts` (флаг `--rules`, коды `SDD_RULES_FILE_INCOMPLETE`, `SDD_RULES_SCHEMA_LEGACY`, `SDD_RULES_REGISTRY_DANGLING`, `SDD_RULES_UNREGISTERED`, `SDD_RULES_PHASE_EMPTY`), `cli/cmd/sync/{sync-core,sync.types,sync.cmd}.ts` + `shared/common/sync/sync-formatter.shared.ts` (три статуса владения + манифест A4 #24), `package.json`, `ai/kit/axiom/scaffold/{ax-rules-resolution-hard-fail,ax-scope-rules-declaration,ax-rules-cascade-resolution}.xml`, `ai/kit/axiom/audit/ax-rules-compliance-against-activated-rules.xml`, `ai/directives/testing/vitest-rules.xml`, `ai/directives/coding/{uikit-spec-drafting,typescript-rules}.xml`, `ai/directives/testing/node-test.xml`, `ai/directives/{coding,testing}/README.md`, шаблоны `ai/kit/templates/sdd-v2/*.hbs`.

**Что закрывает.** R1 — да, и сильнее main (универсальный аудит вместо белого списка, доступный у потребителя). R2 — да. R3 — да, плюс `<DependsOn>` у `typescript-rules` (дыра main). R4 — **подготавливает**: формат `knowledge.stack.xml` — это то, что плагин будет генерировать; без плагинов слой просто статический. R5 — да, и механически (dangling `<File>` становится находкой аудита, а не только abort'ом scaffold).

**Стыки.**
*VERIFY (B1 §4).* Слой 1 — точка врастания детекции стека: `detectStacks` (B1 §4.4 п.1) выбирает, какой набор записей материализуется; `STACK=` из `sdd-state` (п.2) становится входом scaffold так же, как он становится входом `READINESS_PREFLIGHT_GATE` (п.8). Инвариант B1 («один `StackDetection` для `sdd-state`/`sdd-task`/`sdd-verify`») расширяется на scaffold. Проверка (d6) закрывает разрыв `<RequiresVerification>` ↔ Verification Commands, который `cloud-ios` описал как «check-command does not resolve in this repository».
*SYNC.* Три статуса владения вместо двух: package-owned (`knowledge.core.xml`, `knowledge.stack.xml`, файлы правил слоёв 0/1) → `added|updated|unchanged`; project-owned (`knowledge.xml`) → `preserved`; locally-modified (все прочие директивы, по манифесту `ai/directives/.gennady-synced`) → `locally-modified` + `--force`. Зеркальное удаление — только файлов, перечисленных в манифесте. Это ровно предложения (1)+(2) из A4 #24, объединённые.

**Что происходит у потребителей.** `cloud-ios`: (i) реестр перестаёт затираться; (ii) их 4 файла правил перестают быть под угрозой удаления; (iii) появляется механизм подавления — они дописывают в свой `knowledge.xml` подавляющие записи для `typescript-rules`, `eslint-setup`, `storybook-*`, `nodejs-npm-setup`, `golang-setup` и перестают тащить чужой стек; (iv) (d6) даёт им находку про нераскрытый `check-command` из инструмента, а не из их собственного комментария. Обязателен миграционный шаг (R-c4), иначе первый `sync` вернёт Node-правила в активный набор.
`messenger`: (i) `SDD_RULES_SCHEMA_LEGACY` вместо 19 ложных `INCOMPLETE` — один осмысленный вывод с таблицей переименований; (ii) их `<Depends_On>` перестаёт быть тихо-невидимым (аудит скажет прямо, что зависимости не читаются); (iii) `coding/logging-rules.xml` и категория `language/` защищены манифестом; (iv) висячая ссылка `sdd/task-scaffolding.directive.xml` в их реестре становится находкой `SDD_RULES_REGISTRY_DANGLING`.

**Риски.**
- Наибольший объём из трёх (три новых модуля + новый аудит + переработка sync).
- R-c4 (миграция подавлений) — если её не сделать, вариант **регрессирует** для обоих потребителей.
- Три файла реестра в одном каталоге — риск, что агент запишет не туда (мера: шапки + (d4), который скажет «запись в package-owned слое, которой нет в пресете»).
- Версионирование схемы фиксирует легаси навсегда: таблицу соответствия придётся поддерживать.
- Пороги «непустоты» секций (R-d2) — источник ложных срабатываний на намеренно-пустых полях (`git-setup`).

**Тесты (все детерминированные).** `shared/sdd/__tests__/rule-registry.test.ts` (merge: перекрытие по `id`, подавление пустым `<File>`, отсутствие слоя, дубликат внутри одного слоя = ошибка); `shared/sdd/__tests__/rule-paths.test.ts` (предикат: 5 категорий, `*.directive.xml`, плагинное дерево, вне каскада); `ai/kit/__tests__/audit-rule-surface.test.ts` ((d1)–(d6) по фикстурам, включая snake_case-фикстуру и unregistered-фикстуру); `cli/cmd/sync/__tests__/sync-core.test.ts` (три статуса, манифест, удаление только по манифесту); `cli/cmd/sdd-check/__tests__/` (новые коды, `--rules` в дереве без пакета).

**Effort.** L (но декомпозируется на 4 независимые задачи размера S/M — см. §5).

### 4.3 Вариант R-C — «Слой правил целиком принадлежит пресету стека»

**Идея.** Радикальная: `ai/directives/{coding,testing,infra}` перестаёт быть пакетным каталогом. Правила — часть пресета стека, живут в `plugins/<id>/directives/`, реестр вообще не хранится как файл в проекте, а вычисляется CLI из активных пресетов + `gennady.yaml`. Проект переопределяет правила декларативно через конфиг, а не через XML-реестр.

**Механика.**
1. `StackPlugin.rules` (см. §3.2) — обязательный facet для `kind: "stack"`; `anystack` несёт слой 0 (baseline), то есть baseline становится «правилами стека `anystack`», который «матчит всегда» (`plugins/anystack/anystack-plugin.ts:24-34`).
2. Реестр не материализуется на диск: `gennady rules --json` печатает вычисленный набор; scaffold/audit/`sdd-new` получают его через CLI, а не читают XML.
3. Проектные переопределения — секция `rules` в `gennady.yaml` рядом с `stack`: `rules.suppress: [typescript-rules]`, `rules.add: [{ id, category, file, triggers, … }]`, `rules.override: { <id>: { triggers, skipWhen } }`. Схема валидируется строго, как `stack` сейчас (`services/stack/stack-config.ts`; «verify refuses to run on a config it does not understand (exit 4)» — `plugins/golang/skills/sdd-infra-golang/SKILL.md`).
4. Файлы правил проекта — в проектном каталоге, объявленном конфигом (`rules.dir`, по умолчанию `ai/rules/`), который пакет не трогает никогда.
5. `sync` перестаёт возить правила вообще: `ai/directives/` остаётся только для SDD-директив/протоколов.

**Файлы.** `services/stack/stack.types.ts`; все три `plugins/*/`; новый `plugins/python/`, `plugins/swift/`; `services/stack/stack-config.ts` (+`rules`); новая команда `cli/cmd/rules/`; `shared/sdd/rule-registry.ts` (вычисление, не парсинг файла); `cli/cmd/sync/**` (выпиливание категорий правил); `cli/cmd/sdd-new`, `cli/cmd/sdd-check` (источник реестра); массовая правка текстов — все места, где директивы говорят «`ai/directives/<category>/<rule>.xml`» и «read `ai/directives/knowledge.xml`» (в main таких вхождений в `scaffold.directive.xml` ≈ 15, в RC — вся семья `ai/kit/axiom/scaffold/*` + `formats/scope-tasks-index.xml` + `infra.directive.xml:83`).

**Что закрывает.** R1 — да, если аудит (d) применяется к пресетам. R2 — да, механически (правила и `<DependsOn>` — данные плагина, типизированные). R3 — переформулируется: baseline = пресет `anystack`. R4 — **полностью и правильно** (это и есть R4, доведённый до конца: и файл, и запись, и `gateIds`, и алиас — у одного владельца). R5 — да, но иначе: «резолвится» проверяется валидатором конфига, а не файловой системой.

**Стыки.**
*VERIFY.* Максимальные и в хорошем смысле: правила и гейты становятся одним артефактом одного владельца, `<RequiresVerification>` алиас раскрывается через `gateIds` того же плагина. Но вариант **полностью блокирован** треком VERIFY: без переноса `plugins/` + `gennady.yaml` в v2 (которых там нет вовсе — «`gennady.yaml` **does not exist in the RC**», A2 §9.1) он неисполним.
*SYNC.* Радикально упрощается: категории правил уходят из зоны ответственности `sync`, `PROJECT_OWNED_ENTRIES` для `knowledge.xml` становится ненужным (файла нет).

**Что происходит у потребителей.** Оба ломаются одновременно и требуют настоящей миграции: `cloud-ios` переносит 4 файла правил в `ai/rules/` и переписывает реестр в `gennady.yaml` (или пишет `plugins/swift/` — что было бы правильным итогом, но это работа над пакетом, а не над проектом); `messenger` — то же для 1 своего файла + категории `language/`, плюс миграция схемы секций. Cascade Table в тикетах у обоих становится ссылками на несуществующие пути → все закрытые тикеты приобретают висячие ссылки. **Это самый дорогой вариант по К5.**

**Риски.**
- Двойная зависимость: от переноса `plugins/` и от появления `gennady.yaml` в v2. Оба — не трек RULES.
- Реестр как вычисляемая величина ломает главное свойство сегодняшнего дизайна: **агент может прочитать один файл и увидеть весь набор правил**. Замена — `gennady rules --json`, то есть агент обязан уметь запустить CLI там, где раньше читал файл. Для `scaffold` это приемлемо, для «человек открыл репозиторий и понял правила» — нет.
- Ломает существующие тикеты у потребителей (висячие ссылки в закрытых артефактах).
- Правила в `gennady.yaml` — это XML-семантика (`<Triggers>` — свободный текст-условие), переложенная в YAML: либо теряется выразительность, либо YAML становится XML в другом синтаксисе.

**Тесты.** Валидатор `rules`-секции конфига (строгий, exit 4); `plugins/*/__tests__/*-rules.test.ts` (facet каждого плагина полон и резолвится); `services/stack/__tests__/rule-resolution.test.ts` (merge пресетов + конфига, детерминированный порядок); e2e «`gennady rules --json` в фикстурном репозитории каждого стека».

**Effort.** XL (и по календарю — после VERIFY).

### 4.4 Сравнение и рекомендация

| Критерий | R-A «порт v1» | R-B «три слоя + аудит» | R-C «правила в пресете» |
|---|---|---|---|
| К1 осмысленность каскада для не-Node | средне (baseline + python/go есть; swift/rust — нет) | средне-хорошо (то же + подавление чужого стека) | хорошо (пресет на стек) |
| К2 сохранность работы проекта | хорошо для реестра (C1), плохо для остальных директив | **хорошо** (три статуса + манифест) | хорошо (правила вне зоны sync) |
| К3 механическая проверяемость | средне (порт `[RULES]`, белый список не устранён по умолчанию) | **хорошо** ((d1)–(d6), доступно у потребителя) | хорошо, если (d) применён к пресетам |
| К4 единственность источника | средне (один файл, но замороженный) | **хорошо** (один модуль merge, три явных слоя) | хорошо (один владелец на стек) |
| К5 цена для потребителей | **низкая** (почти ноль) | средняя (нужен миграционный шаг подавлений) | **высокая** (переезд файлов + висячие ссылки в тикетах) |
| К6 независимость от VERIFY | **полная** | полная для (b)+(c)+(d); (a) отложена | **нулевая** (блокирован) |
| R1/R2/R3/R4/R5 | ✔/✔/✔/✘/✔ | ✔/✔/✔/подготовлен/✔ | ✔/✔/переформулирован/✔/✔ |
| Effort | M | L (4×S–M) | XL |

**Рекомендация: R-B**, с оговорками.

Почему не R-A: он снимает боль `cloud-ios` (реестр не затирается) и закрывает четыре инварианта из пяти, но оставляет три вещи, каждая из которых воспроизведёт текущую ситуацию через один релиз. Первая — C1 «файл целиком»: проект, тронувший реестр, замораживает пакетную часть, и `messenger` с висячей ссылкой на `task-scaffolding.directive.xml` — это уже случившееся будущее. Вторая — неверсионированная схема: следующее переименование секции даст новую партию ложных `INCOMPLETE`. Третья — проверка остаётся недоступной потребителю, а именно у потребителя живут проектные правила.

Почему не R-C: он архитектурно самый честный (владелец правил = владелец гейтов = владелец алиасов), и в долгую именно туда стоит идти, но сегодня он блокирован двумя отсутствующими в v2 вещами (`plugins/`, `gennady.yaml`), ломает оба живых потребителя и отменяет свойство «реестр читается как файл», которое активно используется директивами (`scaffold.directive.xml:470` «Read it now — do not defer»).

Почему R-B: он (i) исполним целиком внутри трека RULES, без ожидания VERIFY; (ii) даёт формат `knowledge.stack.xml`, который **и есть** выход будущего пресета, то есть R-C становится не переписыванием, а заменой генератора одного файла; (iii) единственный, кто лечит `messenger` (легаси-схема) и невидимость `golang-setup` (unregistered) — оба дефекта не адресуются ни R-A, ни R-C; (iv) декомпозируется на четыре независимо ценных задачи, из которых первая (порт baseline) даёт эффект немедленно.

Порядок исполнения R-B: **T-1 (baseline + фикс двух неполных файлов) → T-3 (аудит схемы) → T-2 (merge слоёв) → T-4 (sync-владение) → [позже, после VERIFY] T-8 (facet плагина)**. T-1 и T-3 независимы и могут идти параллельно; T-2 обязателен до T-4, потому что статусы владения определяются слоями.

### 4.5 Решения, которые может принять только оператор

**Q1. Семантика владения реестром.** (Блокирует T-2, T-4.)
- (a) **C1** — файл целиком, как в main `f74c8c1d`. Дёшево, ноль миграции, `cloud-ios` доволен. Цена: замораживание пакетной части у любого проекта, тронувшего реестр (подтверждённый дефект `messenger`).
- (b) **C2** — два/три слоя, «последний побеждает по `id`», подавление записью без `<File>`. Рекомендуется. Цена: миграционный шаг подавлений для существующих потребителей (иначе регресс), правка `parseRuleRegistry`.
- (c) **C3** — overlay-каталог `ai/directives.local/`. Единый механизм для всех директив, но правка резолва путей во всех потребителях и двойное дерево в глазах агента.
- (d) **Гибрид**: C1 сейчас (порт `f74c8c1d`) + C2 как следующий шаг, с явным заявлением, что C1 — временный. Дешёвый старт, но два раза трогаем `sync` и `loadRuleRegistry`.

**Q2. Подавление пакетного правила проектом.** (Блокирует T-2; напрямую про `cloud-ios`.)
- (a) Запись `<Rule id="…">` **без `<File>`** = подавление. Не расширяет схему, но семантика тихая.
- (b) Явный атрибут `<Rule id="…" suppressed="true"/>`. Читаемо, +1 поле схемы.
- (c) Отдельный блок `<Suppress><Rule id="…"/></Suppress>`. Самое явное, +1 элемент схемы.
- (d) Подавления нет: проект, которому не нужно пакетное правило, обязан выбрать C1. Дёшево, но фиксирует, что «выключить одно правило» = «взять на себя весь реестр».

**Q3. Версионирование схемы файла правила.** (Блокирует T-3(d5); напрямую про `messenger`.)
- (a) Атрибут `schema="2"` на корневом теге + таблица соответствия snake_case↔CamelCase в аудите; легаси диагностируется, но принимается.
- (b) Аудит принимает **оба** регистра как эквивалентные (нормализация имён при чтении), без версии. Дешевле всего, лечит и `check.sh`-эквивалент, и `parseRuleDependsOn`; цена — схема остаётся неявной, и следующее переименование опять пройдёт незамеченным.
- (c) Одноразовая миграция: `gennady rules --migrate-schema` переписывает файлы потребителя в CamelCase; после этого поддерживается только новая схема. Чисто, но требует записи в дерево потребителя.
- (d) Ничего не делать: `messenger` живёт с 19 ложными нарушениями до следующего `sync`, который перезапишет пакетные файлы (18 из 19) и оставит только `logging-rules.xml`. Самое дешёвое и самое обучающее-игнорировать-вывод.

**Q4. Где живёт детерминированная проверка контракта правила.** (Блокирует T-3.)
- (a) Только `ai/kit` (`npm run audit:rule-surface` в `audit:sdd-templates`). Дёшево, но потребитель не получает ничего (риск R-d1).
- (b) Только `sdd-check` (флаг `--rules`, коды `SDD_RULES_*`). Доступно потребителю, но у мейнтейнера запускается не в семье директивных аудитов.
- (c) **Один модуль, два входа** — логика в `shared/sdd/`, вызывается и из `ai/kit`-аудита, и из `sdd-check --rules`. Рекомендуется. Цена: чуть больше обвязки.
- (d) Оставить как в v1: bash-скрипт + белый список. Ноль работы, но не переносимо в v2 (в RC нет `ai/skills/sdd-execute/scripts/`).

**Q5. Что считать «пер-стековым правилом» до появления пресетов.** (Блокирует T-1 в части python/go, T-8.)
- (a) Портировать `python-rules`/`go-rules` из main как есть — они написаны по документации, но не проверены ни на одном реальном проекте (риск R-b2).
- (b) Портировать только baseline (`baseline-rules`, `baseline-testing`), а языковые правила писать по тропе `research-and-author` при первом реальном проекте. Меньше непроверенного текста в пакете, но каждый python-проект начинает с нуля.
- (c) Портировать всё + завести на python/go по одной реальной задаче в `tasks/`, чтобы правила получили обратную связь до релиза.
- (d) Портировать baseline + `go-rules` (у Go уже есть плагин, гейты и скилл — обратная связь есть), python отложить до первого проекта.

**Q6. Судьба категорий `architecture` и `quality`.** (Блокирует T-3 через `shared/sdd/rule-paths.ts`.)
- (a) Оставить в предикате как «проектные категории», где пакет не поставляет ничего, и записать это явно (сегодня `architecture` уже так себя ведёт: в `EXCLUDED_ENTRIES` для sync, но в `SDD_RULE_PATH_RE` для проверки).
- (b) Выпилить `quality` (каталога нет нигде, ни в пакете, ни у потребителей), `architecture` оставить.
- (c) Наполнить `architecture` хотя бы одним правилом (`ports-adapters`, на которое уже ссылается шаблон `formats/scope-tasks-index.xml:21`), тогда категория перестаёт быть фиктивной.
- (d) Свести к трём категориям (`coding`/`testing`/`infra`) и убрать `architecture` из Cascade Table — но тогда правится и формат таблицы, и все существующие Cascade Table у потребителей.

---

## 5. Список задач

Декомпозиция рекомендованного R-B. Размеры: S ≤ 1 сессия, M = 1–2, L > 2. Столбец «Проверка» различает **детерминированный тест** (обычный `node:test`, попадает в `npm test`) и **LLM-eval** (сценарий `ai/flow-eval`, судится моделью). Столбец «Eval-группа»: **G1** — пер-стековые правила (не-Node проект получает осмысленный каскад); **G2** — владение и sync (правки проекта выживают обновление пакета). «—» = задача закрывается только детерминированными тестами и eval не нужен.

| id | Цель | Файлы | Проверка | Eval | Размер | Зависит от |
|---|---|---|---|---|---|---|
| **T-1** | Портировать стек-агностичный baseline и языковые правила в v2; починить два неполных файла RC; замкнуть `<DependsOn>` там, где реестр обещает наследование | NEW `ai/directives/coding/{baseline-rules,python-rules,go-rules}.xml`, NEW `ai/directives/testing/baseline-testing.xml`; `ai/directives/knowledge.xml` (+4 записи, сузить `<Triggers>` у `typescript-rules`, шапка PROJECT-OWNED); `ai/directives/testing/vitest-rules.xml` (+`<RewardCriteria>`, +`<DependsOn> - testing/common.xml`); `ai/directives/testing/node-test.xml` (+`<DependsOn>`); `ai/directives/coding/uikit-spec-drafting.xml` (+`<VerificationHooks>`); `ai/directives/coding/typescript-rules.xml` (+`<DependsOn> - coding/baseline-rules.xml`); `ai/directives/{coding,testing}/README.md` (убрать реализованное из «Planned») | **детерм.**: универсальный контрактный тест «каждый файл каскадных категорий несёт четыре непустые секции» (замена белого списка); тест «`<DependsOn>` каждого правила резолвится и без циклов» | G1 | **M** | — |
| **T-2** | Ввести слои реестра и единственный модуль слияния | NEW `shared/sdd/rule-registry.ts` (`parseRegistryLayer`, `mergeRegistryLayers`); NEW `ai/directives/knowledge.core.xml`, NEW `ai/directives/knowledge.stack.xml`; `ai/directives/knowledge.xml` → тонкий overlay + шапка; `shared/sdd/task-authoring-literals.ts` (`loadRuleRegistry` делегирует, `parseRuleRegistry` перестаёт падать на дубликате `id` между слоями); `cli/cmd/sdd-new/sdd-new.cmd.ts` (источник тюплов) | **детерм.**: `shared/sdd/__tests__/rule-registry.test.ts` — перекрытие по `id`, подавление, отсутствие слоя, дубликат внутри одного слоя = ошибка, детерминированный порядок | G2 | **M** | Q1, Q2 |
| **T-3** | Детерминированный аудит контракта правила, доступный и мейнтейнеру, и потребителю | NEW `shared/sdd/rule-paths.ts` (единственное определение каскадных категорий, замена `SDD_RULE_PATH_RE`); NEW `shared/sdd/rule-surface.ts` ((d1)–(d5)); NEW `ai/kit/audit-rule-surface.ts` (вход мейнтейнера); `cli/cmd/sdd-check/sdd-check.cmd.ts` (флаг `--rules`, коды `SDD_RULES_FILE_INCOMPLETE`, `SDD_RULES_SCHEMA_LEGACY`, `SDD_RULES_REGISTRY_DANGLING`, `SDD_RULES_UNREGISTERED`); `package.json` (`audit:rule-surface` в `audit:sdd-templates`) | **детерм.**: `shared/sdd/__tests__/rule-surface.test.ts` (полный/неполный файл; пустые маркеры секций; `*.directive.xml` исключён; вне каскада игнорируется; snake_case-фикстура → `SCHEMA_LEGACY`, не `INCOMPLETE`; unregistered-фикстура; dangling `<File>`); `ai/kit/__tests__/audit-rule-surface.test.ts` (exit-код, формат вывода) | — | **M** | Q3, Q4, Q6 |
| **T-4** | Владение при `sync`: три статуса + манифест; зеркальное удаление только по манифесту | `cli/cmd/sync/sync-core.ts` (`PROJECT_OWNED_ENTRIES`, манифест `ai/directives/.gennady-synced` sha256, удаление только записей манифеста); `cli/cmd/sync/sync.types.ts` (+`'preserved'`, +`'locally-modified'`); `cli/cmd/sync/sync.cmd.ts` (`--force[ <path>]`); `shared/common/sync/sync-formatter.shared.ts` (вывод и summary) | **детерм.**: `cli/cmd/sync/__tests__/sync-core.test.ts` — (a) project-owned `knowledge.xml` differs → `preserved`, не записан; (b) патченный `sdd-v2/*.xml` → `locally-modified`, не записан, виден в `--dry-run`; (c) проектный файл правила в owned-категории без записи в манифесте не удаляется; (d) `knowledge.stack.xml` перезаписывается всегда | **G2** | **M** | T-2, Q1 |
| **T-5** | Вернуть в v2 потерянный текст R5 и явно указать, куда проект пишет своё правило | `ai/kit/axiom/scaffold/ax-rules-resolution-hard-fail.xml` (+3 предложения про PROJECT-OWNED, «не выдумывай ссылки на пакетные правила», «пустой набор валиден ≠ висячая ссылка»); `ai/kit/axiom/scaffold/ax-scope-rules-declaration.xml` (в какой слой реестра и в какой каталог писать); `ai/kit/axiom/audit/ax-rules-compliance-against-activated-rules.xml` (`RULE_FILE_INCOMPLETE` — механическая истина из T-3, не глазомер); `ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml` (дописать полноту файла правила и согласованность реестра в перечни механических истин); `ai/directives/sdd-v2/audit.directive.xml` (маршрут `rule-file-fix`, cap `MINOR` — порт формулировок main `audit.directive.xml:125,155`); пересборка `ai/kit/templates/sdd-v2/*.hbs` | **детерм.**: `npm run audit:sdd-templates` (свежесть + активация аксиом); тест «`RULE_FILE_INCOMPLETE` не может быть маршрутизирован в `ticket-reopen`/`code-fix`» по тексту директивы (в стиле main `sdd-review-lifecycle-contract.test.ts`) | — | **S** | T-3 |
| **T-6** | Убрать фиктивность: `SDD_RULES_PHASE_EMPTY` (info) и решение по `architecture`/`quality` | `shared/sdd/rules-cascade.ts` (пустой `Rules:` → info вместо тихого `[]`); `cli/cmd/sdd-check/sdd-check.cmd.ts`; `shared/sdd/rule-paths.ts` (по Q6); `ai/directives/sdd-v2/formats/scope-tasks-index.xml:21` (пример `ports-adapters` — либо завести файл, либо заменить пример) | **детерм.**: `shared/sdd/__tests__/rules-cascade.test.ts` (+кейс «пустой список → одна info-находка»); тест «каждое правило, названное в примерах форматов, существует на диске» | — | **S** | Q6 |
| **T-7** | Миграционный шаг для существующих потребителей: не вернуть им чужой стек | `cli/cmd/sync/sync-core.ts` (при первом `sync` с многослойным реестром — дописать в проектный `knowledge.xml` подавляющие записи для пакетных `id`, которых в нём нет); либо отдельная подкоманда `gennady rules --seed-suppressions` | **детерм.**: тест на фикстуре, воспроизводящей `cloud-ios` (5 своих правил, 0 пакетных) → после миграции активны только 5; тест на фикстуре `messenger` (19 записей, 1 своя) | **G2** | **M** | T-2, T-4, Q2 |
| **T-8** | *(после трека VERIFY)* facet правил у плагина стека: `knowledge.stack.xml` генерируется, а не хранится | `services/stack/stack.types.ts` (+`rules` facet); `plugins/{node,golang,anystack}/*-plugin.ts`; NEW `plugins/python/**`; `cli/cmd/sync/sync.cmd.ts` (генерация слоя); диагностика коллизии имён файлов между плагинами (`sync-core.ts:217`) | **детерм.**: `plugins/*/__tests__/*-rules.test.ts` (facet полон, все `<File>` резолвятся, `<DependsOn>` замкнут); тест «два плагина с одинаковым именем файла правила → диагностируемая ошибка, не тихая перезапись» | **G1** | **L** | T-2, перенос `plugins/` в v2 |
| **T-9** | Замок поставляемой поверхности для правил в v2. В RC **нет каталога `scripts/__tests__/` вовсе** и нет аналога `deployed-surface.golden.txt` — то есть сегодня добавление/потеря файла правила в поставке ничем не фиксируется | NEW `scripts/__tests__/deployed-surface.{test.ts,golden.txt}`-эквивалент для RC, включая `ai/directives/knowledge.{core,stack}.xml` и все файлы каскадных категорий | **детерм.**: golden-тест с `UPDATE_SURFACE_GOLDEN=1`; проверка «ни одного пути разработчика в поверхности» (порт main `deployed-surface.test.ts`) | **G2** | **S** | T-2 |
| **T-10** | Переименовать `agents-rules` → `agents-orient`, чтобы команда перестала попадать в трек RULES | `cli/cmd/agents-rules/**` → `cli/cmd/agents-orient/**`; регистрация команды; `cli/cmd/orient/README.md`; help-тексты | **детерм.**: существующий `agents-rules.cmd.test.ts` переносится; тест «старое имя даёт понятную ошибку с указанием нового» | — | **S** | — |

### 5.1 Eval-группы: что судит модель, а что — тест

**G1 — пер-стековые правила.** Проверяемое утверждение: *не-Node проект получает в фазу осмысленный, непустой и непротиворечивый набор правил.*

| Что | Тип | Почему |
|---|---|---|
| файл правила полон, `<DependsOn>` резолвится, реестр ↔ диск согласованы | **детерминированный тест** (T-1, T-3, T-8) | чистая проверка структуры, модель тут не нужна |
| `typescript-rules` **не** активируется для `.py`/`.go`/`.swift` | **детерминированный тест** над `<Triggers>`/`<SkipWhen>` как строками? — **нет**: `<Triggers>` — свободный текст-условие, его исполняет модель. Значит **LLM-eval G1** | активация принципиально семантическая (`AX_RULE_ACTIVATION_PLAN`: «Signal-based only») |
| scaffold python-скоупа кладёт в фазу `baseline-rules` + `python-rules` и не кладёт `typescript-rules` | **LLM-eval G1** | это поведение агента на реальном дереве, а не свойство файла |
| scaffold swift-скоупа, для которого правил нет, идёт по тропе `skip`/`research-and-author`/`defer`, а не выдумывает ссылку | **LLM-eval G1** | ровно тот случай, который R5 описывает текстом и который сегодня ничем не закрыт |
| фикстуры: python-репозиторий (`pyproject.toml`), go-репозиторий (`go.mod`), swift-репозиторий (`Package.swift`) | **инфраструктура eval** | в RC 14 фикстур, из них 11 Node и 3 bash/Makefile; ни одной python/go/swift (A2 §9.1). **Без новых фикстур G1 нечем измерять** — это предпосылка, а не часть задачи |

**G2 — владение и sync.** Проверяемое утверждение: *правки проекта в слое правил выживают обновление пакета, а пакетные обновления доезжают.*

| Что | Тип | Почему |
|---|---|---|
| `knowledge.xml` differs → `preserved`, не записан | **детерминированный тест** (T-4) | |
| патченная директива → `locally-modified`, не записана, видна в `--dry-run` | **детерминированный тест** (T-4) | |
| проектный файл правила в owned-категории не удаляется | **детерминированный тест** (T-4) | |
| `knowledge.stack.xml` перезаписывается всегда | **детерминированный тест** (T-4) | |
| merge слоёв: перекрытие, подавление, порядок | **детерминированный тест** (T-2) | |
| миграция подавлений на фикстурах `cloud-ios`/`messenger` | **детерминированный тест** (T-7) | |
| поставляемая поверхность не потеряла и не приобрела файл правила | **детерминированный тест** (T-9, golden) | |
| *«агент, которому сказали добавить правило для нового языка, пишет его в проектный слой, а не в пакетный»* | **LLM-eval G2** | единственное в G2, что требует модели: выбор места записи — решение агента, а не механика |

**Вывод по evals:** из десяти задач **девять закрываются детерминированными тестами полностью или в основном**; LLM-eval нужен ровно в четырёх точках (три в G1 — активация, python-каскад, тропа отсутствующего правила; одна в G2 — куда агент пишет новое правило). Это соответствует общему выводу трека: слой правил — почти целиком механическая дисциплина, которую в v2 просто перестали проверять механически. Прежде чем заводить eval-сценарии G1, нужны python/go/swift фикстуры — их сегодня нет ни одной.

### 5.2 Что стоит сделать немедленно, независимо от выбора варианта

Три пункта не зависят ни от Q1–Q6, ни от трека VERIFY, и каждый — регресс относительно main:

1. **`ai/directives/testing/vitest-rules.xml` без `<RewardCriteria>` и `ai/directives/coding/uikit-spec-drafting.xml` без `<VerificationHooks>`** — оба файла в main починены коммитом `d86c49dd` и внесены в контрактный тест; в RC они неполны. Это дефект содержимого пакета, который уедет потребителю с релизом v2.
2. **`ai/directives/knowledge.xml:9` — `<Triggers>` у `typescript-rules`.** Одна строка. Пока она такая, v2 обещает python-проекту правило TypeScript.
3. **Порт `f74c8c1d`** (`PROJECT_OWNED_ENTRIES` + `preserved`) и **отключение зеркального удаления внутри каскадных категорий**. Без этого релиз v2 гарантированно уничтожит Swift-реестр `cloud-ios` в четвёртый раз, а теперь ещё и их четыре файла правил.


# Часть II — V-B4 (независимый верификатор)

# V-B4 — независимая верификация B4 (трек RULES)

**Роль:** независимый верификатор (fresh eyes, adversarial). Режим read-only, ни один трекируемый файл не изменён.
**Документ под проверкой:** `…/scratchpad/B4-rules-track.md` (883 строки).
**Базы:** MAIN — `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e` (`origin/main` = `8bb38477`; рабочий HEAD дерева — `f67a8a11`, `check.sh` и `knowledge.xml` между ними не менялись, проверено `git diff --stat 8bb38477 HEAD`). RC — `…/scratchpad/rc-v6` (`codex/sdd-v2-rc52-followup`).
**Потребители:** `cloud-ios` @ `origin/ap/CLOUDIOS-NOISSUE-swiftlint-exceptions-infra-base`; `/Users/k.lebedev/Developer/messenger` (рабочее дерево).
**Сверено с:** A1 §3.4, V-A1 (C9, MISSED-8), A2 §5, V-A2, B1 §4, B3, V-A4 #24.

---

## § Итог

1. **B4 — сильный документ по фактуре и слабый по нескольким рамкам.** Из ~190 привязок `file:line` в §1–§2 подтверждены полностью **~170**; 15 — WRONG-LINE (смещения 1–9 строк, факт в нужном блоке); **12 позиций содержательно неверны или неверно оформлены** (перечень ниже). Все четыре прогона §2.1 воспроизведены **побитово** (23 OK / `rule_findings=0` в main; 19 `INCOMPLETE` / `rule_findings=19` в messenger; 7/7 RC-тестов; 11/11 main-тестов).
2. **Три главных содержательных дефекта** (каждый меняет вывод, а не формулировку):
   - **K.** §3.3 утверждает, что порт baseline «остаётся корректным при любом решении по треку VERIFY». **Опровергнуто:** оба baseline-файла в `<VerificationHooks>` вызывают `<sdd-path> verify --wip <target-files>`, а в RC **нет ни команды `verify`, ни флага `--wip`** (в `rc-v6/cli/cmd/` есть `sdd-verify`, `verify` отсутствует; `grep -rn 'verify --wip' rc-v6/{ai,cli,specs}` = ∅). Т-1 не «S без стыков», а задача с **жёсткой зависимостью** от трека VERIFY либо с переписыванием двух хуков.
   - **D/H.** v2 не «потерял ребро `<DependsOn>` в прозу»: он ввёл **второй канал объявления** — `<InheritedBaseline>` (`RC/ai/directives/testing/vitest-rules.xml:8`, `node-test.xml:8`) плюс **новую разрешающую норму рантайма** `ax-rules-load-from-phase-block.xml:5-11` («One legal extension … that declared base … MAY be opened too»), которой в main нет вовсе (`MAIN/ai/directives/sdd/phase-execution-protocol.xml:54` — только запрет). Дефект реален, но он другой: **две системы наследования, из которых механическая читает только одну**.
   - **L/steelman.** Единственная эмпирика против варианта C1 («реестр целиком project-owned замораживает пакетную часть») — висячая ссылка `messenger/ai/directives/knowledge.xml:26` — лежит в блоке `<Directives>` (`<Rules>` начинается на `:57`), **которого в v2 нет вообще**. Ключевой аргумент «почему не R-A» опирается на дефект в половине реестра, которую v2 удалил.
3. **Вердикты R1–R5 в целом принимаю**: R1 НЕ ЗАКРЫТО, R3 НЕ ЗАКРЫТО, R5 ЧАСТИЧНО — согласен и подтверждаю прогонами. R2 — согласен с расщеплением «механика ЗАКРЫТО / содержимое НЕ ЗАКРЫТО», но обоснование содержимого требует замены на `<InheritedBaseline>`. R4 — согласен (НЕПРИМЕНИМО + дыра), и дыра **глубже**: в RC нет не только `plugins/`, но и `services/stack/`, т.е. `StackPlugin`/`gateIds`, на которые B4 вешает и (a), и R-C, в v2 отсутствуют как тип.
4. **Факты §1 подтверждаю почти целиком.** Схема четырёх секций, активационные поля реестра, `SDD_RULE_PATH_RE` из пяти категорий (B4 здесь прав и согласуется с опровержением C9 в V-A1), единственный код `SDD_RULES_CASCADE_UNRESOLVED` в RC (grep: 11 вхождений, 7 файлов, других `SDD_RULES_*` нет), 15/17 полных файлов в RC, 23/23 в main, 4/4 своих у `cloud-ios`, 0/19 у `messenger` — всё воспроизведено.
5. **Что `checkRulesCascadeClosure` действительно обеспечивает** (`rules-cascade.ts:56-82`, 7/7 тестов зелёные): дедуплицированное множество недостающих зависимостей по DFS над `depsMap`; **не** проверяет существование файлов (это делает вызывающий `buildRuleDepsMap`), **не** проверяет осмысленность активации, **не** трогает пустой список. B4 описал верно, но пропустил, что пустой список глушится **дважды** — ещё и в `sdd-check.cmd.ts:429`.
6. **`<CrossRef>` vs `<DependsOn>` (A2 §5.2) — истинно** по существу, с одной поправкой: `svelte-testing` в RC несёт `<CrossRef>` на `node-test`/`vitest-rules`/`svelte5-runes`, а **не** на `testing-common` (`RC/knowledge.xml:106-108`). B4 воспроизвёл неточность A2 дословно; V-A2 её уже зафиксировал.
7. **Cascade Table v1 vs v2 подтверждён**, но «5 тиров против 4» — **артефакт чтения**: `MAIN/scaffold.directive.xml:78` пишет «union of 5 tiers», а перечисляет на `:81-84` **четыре**. RC (`ax-rules-cascade-resolution.xml:3`) написал 4 и перечислил 4, т.е. **исправил** устаревшее число main. Подавать это как регресс/делту нельзя.
8. **Не-Node реальность описана точно и местами лучше, чем в исходниках пакета.** Реестр `cloud-ios`, их `<CheckPhaseOrder>lint build test</CheckPhaseOrder>` (`:54`), комментарий про нерезолвящийся `check-command`, четыре полных файла правил, разбор тира `task` в `tasks/infra-base/README.md` — всё сверено дословно. Числовые ошибки только в двух местах (§F, §G ниже).
9. **Главный пропуск §3:** порча каскада у Swift-проекта в v2 **детерминирована машинно**, а не только семантически — `sdd-new` печатает кортежи `id`+href прямо из реестра в каждый тикет (`RC/cli/cmd/sdd-new/help.ts:92`, `sdd-new.types.ts:314`; см. B3 §1.10). B4 упоминает `loadRuleRegistry` как потребителя, но в §3.1 шаг 3 списывает всё на чтение `<Triggers>`.
10. **Варианты §4 сравнены честно, но пространство неполно.** Отсутствует четвёртый, самый дешёвый вариант: **реестр вообще не зеркалить в дерево** — `loadRuleRegistry` (`task-authoring-literals.ts:81-91`) уже реализует fallback «проектный ИЛИ пакетный из `node_modules`», поэтому достаточно внести `knowledge.xml` в `EXCLUDED_ENTRIES`; ни `preserved`, ни seed, ни merge не нужны. Steelman простого варианта (ниже) при этом обходит R-B по К5/К6 и по effort, а разрыв по К3 закрывается одной проверкой «каждый `<File>` реестра существует» (та же, что просит B3 SO-10).
11. **§5: две задачи отсутствуют, одна недооценена.** Нет задачи «зарегистрировать три `uikit-*` в реестре» (T-3 (d4) их только **обнаруживает**); нет задачи «вернуть блок `<Directives>` в реестр v2» (B3 SO-10 её называет, `RC/infra.directive.xml:243` называет `knowledge.xml` «the sole index», а индексировать директивы там нечем). T-6 занижена: пустой `Rules:` глушится в двух местах.
12. **Рекомендация по документу:** B4 годен как основание для решений после правок §K, §D/H, §L, §B/C, §E и добавления двух задач. Рекомендацию «R-B» я бы **не принимал в текущем виде**: она обоснована аргументом, который опровергнут (§L), и её первая задача T-1 объявлена независимой от VERIFY, чем не является (§K). Корректный порядок — сначала §5.2 (три немедленных пункта) + «реестр не зеркалить» + проверка существования `<File>`, и только потом решать Q1/Q2.

---

## § Цитаты и вердикты R1–R5

### Сводка по привязкам §1–§2

| Категория | Кол-во | Комментарий |
|---|---|---|
| **CONFIRMED** | ~170 | включая все дословные цитаты из `scaffold.directive.xml`, `audit.directive.xml`, `ax-*.xml`, реестров main/RC/cloud-ios, `rules-cascade.ts`, `sync-core.ts`, `plugins.spec.md:317`, `deployed-surface.golden.txt`, всех файлов правил `cloud-ios` |
| **WRONG-LINE** | 15 | факт верен, строка смещена (список ниже) |
| **REFUTED / неверно оформлено** | 12 | список ниже; из них 3 меняют вывод |

### WRONG-LINE (факт верен, строка не та)

| # | B4 | Фактически |
|---|---|---|
| 1 | `check.sh` `rule_files_in_tree` `:449-457` | `:442-450` |
| 2 | `check.sh` `rule_files_for_task` `:460-474` | `:453-467` |
| 3 | `check.sh` четыре `grep -q` `:488-491` | `:481-484` |
| 4 | `check.sh` exit 3 `:667` | `:666` (файл — 666 строк) |
| 5 | `check.sh` цитата «HTML-like by design» `:35-37` | `:35-36` (`:37` — пустой комментарий) |
| 6 | `sync-core.ts` ветка `status = 'preserved'` `:70-72` | `:239-241` (`:70-72` — `resolvePackageDir`) |
| 7 | `sync-core.ts` подавление записи `:85` | `:254` (`status !== 'unchanged' && status !== 'preserved'`) |
| 8 | `task-authoring-literals.ts` `parseRuleRegistry` `:59-79`, throw на дубликате `:71` | функция `:59-74`; throw на дубликате `:70`; `:71` — `ids.add` |
| 9 | `sdd-new.types.ts:148` = «exit 1» | `exitCode: 1` на `:145`; `:148` — строка с путём реестра |
| 10 | `sdd-check.cmd.ts` `getRuleDeps`/`ruleDepsCache` `:384-392` | `ruleDepsCache` `:355`, `getRuleDeps` `:358-392` |
| 11 | `sdd-check.cmd.ts` «failed nodes are never treated as proven leaves» `:415` | `:394` (jsdoc `buildRuleDepsMap`); `:415` — `}` |
| 12 | `stack.types.ts` `gateIds` `:328` | `:332` |
| 13 | `agents-rules.cmd.ts` `:20` / `:25` / `:33` | `:19` (`existsSync`) / `:24` (`import.meta.resolve`) / `:32` (`readmePath`) |
| 14 | `AX_RULE_ACTIVATION_PLAN` `:92-108` — «7 шагов» | диапазон верен, шагов **8** (`:95`…`:106`) |
| 15 | `plugins.spec.md:317` — «критерий владения» | строка верна; но `plugins/golang/plugin.json` **не** объявляет поверхностей (см. V-A1 §R4): каталог `directives` приходит из `DEFAULTS` в `services/plugins/resolve-plugins.ts:24`. B4 цитирует manifest корректно, но механизм доставки описан не полностью |

### REFUTED / неверно оформлено

**A. `scripts/git-hooks/pre-commit` не существует.** §1.4 и §5 T-3 ссылаются на этот файл («grep по обоим — ноль вхождений», «включить, если решено»). В main нет ни `scripts/git-hooks/`, ни любого `pre-commit` вне `node_modules` (`find -maxdepth 3 -name 'pre-commit*'` = ∅; `package.json` не содержит `prepare`/husky). **Вывод B4 при этом усиливается:** `check.sh` не вызывается не только из `npm test`, но и вообще ни из какого хука, потому что хуков нет. Правка: заменить ссылку на «в main нет pre-commit-хука вовсе; единственный агрегат — `npm run lint` = `format && type-check && lint:contracts` (`package.json`)».

**B. §1.1: «v2 — тот же текст, включая „Required section missing → `RULE_FILE_INCOMPLETE` (`MAJOR`)“».** Это **не** тот же текст. main `audit.directive.xml:240`: «Section presence is NOT judged by eye — `sdd check --task <Task-ID>` emits `[RULES]` … Each `INCOMPLETE` row → one `RULE_FILE_INCOMPLETE`, its `missing` column copied verbatim». RC `ax-rules-compliance-against-activated-rules.xml:12`: «Required sections: … Required section missing → `RULE_FILE_INCOMPLETE` (`MAJOR`)». v2 **удалил** делегирование инструменту и **добавил** severity `MAJOR`. Это ровно та подмена, которую §1.4 описывает как «нет механической подпорки» — но §1.1 её маскирует словами «тот же текст».

**C. §2 R1 п.5: «`RULE_FILE_INCOMPLETE` в v2 маршрутизируется мягче».** Неверно по знаку. В v1 находка **cap'ится до `MINOR`** (`audit.directive.xml:125`) и жёстко маршрутизируется в `rule-file-fix` с тремя запретами (`:155`). В v2 она объявлена **`MAJOR`** (`ax-rules-compliance-against-activated-rules.xml:12`), а маршрут размыт до «ticket update … OR a separate rule-maintenance task» (`audit.directive.xml:188`). Корректная формулировка: **жёстче по severity, размытее по маршруту, без cap и без запрета на `ticket-update`** — то есть в v2 неполный общий файл правила снова может уронить вердикт конкретной задачи, что v1 специально запретил.

**D. §1.3 шаг 8: «`ax-rules-load-from-phase-block.xml`; тот же запрет».** Опровергнуто. RC-версия (`:5-11`) содержит норму, которой в main нет: «One legal extension: when a cited rule file itself declares a transitive base — an explicit `InheritedBaseline` block, or text stating "read `<other-file>` first" — that declared base is part of the same rule for scoping purposes and MAY be opened too. It is NOT a discovery: log nothing». main (`phase-execution-protocol.xml:54`) — только «Open ONLY rule files listed under this phase's `Rules:` bullet list … Rules from sibling phases are NOT this phase's concern».

**E. §1.6: три `uikit-*` «достижимы только через `<DependsOn>` другого правила».** Опровергнуто перебором: `<DependsOn>` в RC несут ровно 7 файлов, и ни один зарегистрированный (`typescript-rules`, `svelte5-runes`, `sveltekit-rules`, `testing-common`, `vitest-rules`, `node-test`, `playwright-cli`, `playwright-e2e`, `storybook-usage`, `svelte-testing`, `eslint-setup`, `git-setup`, `nodejs-npm-setup`, `storybook-setup`) не ссылается на `uikit-*`. Зависимости идут только внутрь кластера: `uikit-component-storybook` → `storybook-usage` + `uikit-component-svelte`; `uikit-component-svelte` → `svelte5-runes` + `uikit-spec-drafting`. То есть 919 LOC **недостижимы из реестра вообще** — попасть в тикет они могут исключительно через тир `task` (решение оператора). Это строго хуже, чем описано, и усиливает (d4).

**F. §1.6 (`messenger`): «coding/ (9 файлов), testing/ (8), infra/ (5)».** Фактически 8 / 7 / 4 (`ls`): в каждый каталог посчитан `README.md`. Итог 19 (который B4 использует везде дальше) верен.

**G. §1.6 (`cloud-ios`): «12 синхронизированных, но не зарегистрированных пакетных правил».** Собственное перечисление B4 даёт 7 (`coding/`) + 4 (`infra/`) + «весь `testing/` пакета» = 7, итого **18**. По дереву ветки: 7 coding + 4 infra + 7 testing = 18. Число 12 не следует ни из чего.

**H. §2 R2: «Ребро, которое `ac2e9d73` сделал механическим, в RC снова только проза».** Неточно. См. §D: RC `vitest-rules.xml:8` и `node-test.xml:8` объявляют `<InheritedBaseline>` с Markdown-ссылкой на `./common.xml`, и это объявление имеет силу рантайма по `ax-rules-load-from-phase-block.xml`. main несёт **оба** — `<DependsOn>` (`:8`) **и** `<InheritedBaseline>` (`:12+`). RC потерял только механически читаемый из них. Корректная формулировка: **в v2 наследование объявлено, но в канале, который `parseRuleDependsOn` (`rules-cascade.ts:42`) не читает** — то есть замыкание тихо считает эти правила листьями.

**I. §1.6/§2 R5: висячий `ports-adapters` как дефект шаблона v2.** Дефект унаследован из v1 и в v1 хуже: `MAIN/scaffold.directive.xml:794` — та же строка Cascade Table, а `:411` — **рабочий пример** с Markdown-ссылкой `[ports-adapters](../../../ai/directives/architecture/ports-adapters.xml)`; `MAIN/ai/directives/architecture/` содержит только `README.md` (в котором `ports-adapters.xml` описан как существующий). Подавать `formats/scope-tasks-index.xml:21` как регресс v2 нельзя — это перенос дефекта.

**J. §1.2/§2 R2: `<CrossRef id="testing-common">` у `svelte-testing`.** Нет: `RC/knowledge.xml:106-108` — `node-test`, `vitest-rules`, `svelte5-runes`. Вывод (замыкание никогда не потребует `common.xml`) верен и подтверждён.

**K. §3.3: «Взаимодействие с VERIFY. Слабое и это плюс».** Опровергнуто, критично. `MAIN/ai/directives/coding/baseline-rules.xml` `HOOK_PROJECT_GATE` `<Command>&lt;sdd-path&gt; verify --wip &lt;target-files&gt;</Command>`; `MAIN/ai/directives/testing/baseline-testing.xml` `HOOK_TESTS_PASS` — та же команда. В RC: `ls rc-v6/cli/cmd/` даёт `sdd-verify`, команды `verify` нет; `grep -rn '\-\-wip' rc-v6/cli` = ∅; `grep -rn 'verify --wip' rc-v6/{ai,cli,specs}` = ∅. Порт «как есть» ставит в ядро два хука с несуществующей командой — ровно тот класс дефекта, за который B4 (справедливо) критикует `cloud-ios`-овский нерезолвящийся `check-command`.

**L. §3.4: `messenger` как «живая иллюстрация» замораживания реестра при C1.** Висячая ссылка `ai/directives/sdd/task-scaffolding.directive.xml` — на `messenger/ai/directives/knowledge.xml:26`, внутри блока `<Directives>` (`<Rules>` открывается на `:57`). Блока `<Directives>` в реестре v2 **нет** (`RC/knowledge.xml`: единственная верхнеуровневая секция — `<Rules>` на `:2`). Значит единственный предъявленный эмпирический вред C1 относится к части реестра, которую v2 удалил, и в v2-топологии он не воспроизводится автоматически. Это подрывает главный аргумент «почему не R-A» (§4.4).

### Пропущенное (MISSED)

- **M-1.** Пустой `Rules:` глушится **дважды**: `rules-cascade.ts:62` **и** `sdd-check.cmd.ts:429` (`if (ruleIds.length === 0) continue;`), плюс фильтр `:427` `.filter(rule => rule.endsWith('.xml'))` — ссылка без `.xml` выпадает из проверки молча. T-6 должна править оба места и фильтр.
- **M-2.** v2 **уже** проверяет существование транзитивных зависимостей: `buildRuleDepsMap` (`:395-415`) собирает `ReadIssue` по нечитаемым узлам, `checkTicketRulesCascade:434-447` эмитит `ERR_CLI_SDD_CHECK_READ_FAILED` для dependency-only узлов («one failed identity produces one diagnostic while omitted transitive evidence still fails closed», `:431-433`). §3.5 (d3) частично уже реализовано — для правил, цитируемых тикетом; для пакетного дерева нет.
- **M-3.** Внутренний дрейф v2: `ax-rules-cascade-verification.xml:14` называет `RULES_CASCADE_CLOSURE` механической истиной «per `AX_MECHANICAL_VIA_SDD_CHECK`», но в перечнях самой `ax-mechanical-via-sdd-check.xml` (`:5` для `--task`, `:6` для `--all`) её нет. Перекрёстная ссылка висячая. B4 цитирует оба файла, но противоречия не называет.
- **M-4.** **Пакет сам говорит в snake_case.** `RC/ax-rules-load-from-phase-block.xml:3` — «Read end-to-end (Mission + Belief_State + Reward_Criteria + Anti_Patterns + Verification_Hooks)»; `RC/ax-rules-compliance-against-activated-rules.xml:16` — «Walk Reward_Criteria, Anti_Patterns, Verification_Hooks»; в main то же (`audit.directive.xml:243`, `phase-execution-protocol.xml:54`). То есть расхождение схем — не только беда потребителя: **директивы пакета инструктируют агента старой вокабулярой, а файлы правил пакета написаны новой**. Это сильнейшее доказательство для Q3 и (d5), и B4 его не использует.
- **M-5.** Категорий в пакете **три разных списка**: 5 в `_sdd-lib.sh:14` (`architecture|coding|infra|quality|testing`), 4 в `RC/ax-scope-rules-declaration.xml:3-7` (coding/testing/architecture/infra — `quality` нет) и в колонках Cascade Table, 3 в устаревшей шапке `check.sh:38`. Q6 обязана согласовать три, а не два.
- **M-6.** Дрейф имени тира в v2: `ax-rules-cascade-resolution.xml:9` — 4-й тир `task`; `formats/scope-tasks-index.xml:17` — «traversed-scopes → target-scope → module → **phase**». Шаблон и аксиома называют один тир по-разному.
- **M-7.** Коллизия корней в `scanSourceRoots` **документирована как инвариант**, а не случайна: `MAIN/sync-core.ts:77-78` — «the base root wins a path collision». Гонка двух *плагинов* по-прежнему недиагностируема (это и есть суть замечания B4 §1.5 п.2), но формулировка «коллизия не диагностируется» должна ссылаться именно на плагин↔плагин.
- **M-8.** В RC нет **и** `services/stack/` (`ls -d rc-v6/services/stack` = не существует). Значит `StackPlugin`, `gateIds`, `detect()` в v2 не существуют как тип — R-C заблокирован **тремя** отсутствиями (`plugins/`, `services/stack/`, `gennady.yaml`), а не двумя, и механизм раскрытия `<RequiresVerification>` через `gateIds`, на который R-C опирается, в v2 не с чем связывать.
- **M-9.** Порча каскада в v2 машинно-детерминирована: `sdd-new` печатает «canonical rule ID+href tuples from `ai/directives/knowledge.xml`» в каждый создаваемый тикет (`RC/cli/cmd/sdd-new/help.ts:92`, `sdd-new.types.ts:314`; B3 §1.10 воспроизвёл это прогоном). §3.1 шаг 3 объясняет попадание `typescript-rules` в Swift-фазу только чтением `<Triggers>`; вторая, более жёсткая тропа — CLI.
- **M-10.** У `cloud-ios` на диске **нет** `coding/{baseline-rules,python-rules,go-rules}.xml` и `testing/baseline-testing.xml` (`git ls-tree -r`): их последний sync **предшествует** `5a237cd5`. Для T-7 это значит, что их дерево — не «реестр перезаписан», а срез пакета до baseline-коммита; миграция должна это учитывать.
- **M-11.** `loadRuleRegistry` (`task-authoring-literals.ts:81-91`) **уже** реализует «проектный на диске ИЛИ пакетный из `node_modules`». Это делает доступным вариант владения, который §3.4 и §4 не рассматривают: **не зеркалить реестр в дерево вообще** (см. steelman).

### Вердикты R1–R5

| # | Вердикт B4 | Мой вердикт | Обоснование / поправка |
|---|---|---|---|
| **R1** | НЕ ЗАКРЫТО | **СОГЛАСЕН** | Воспроизведено: RC 15/17 (`testing/vitest-rules.xml` без `<RewardCriteria>`, топ-теги `:2,8,12,92,253,285`, файл 326 строк; `coding/uikit-spec-drafting.xml` без `<VerificationHooks>`, топ-теги `:2,15,117,197,223`, 238 строк). Оба — в белом списке main-теста (`:19,22,45,46`), т.е. RC отошёл до `d86c49dd`. Механических проверок секций в `rc-v6/{cli,shared}` — **0** (`grep` = 0). main: `check.sh` tree → 23 OK, `rule_findings=0` (прогон воспроизведён). Поправки: **B** (не «тот же текст»), **C** (не «мягче»), **A** (нет pre-commit-хука вовсе) |
| **R2** | НЕ ЗАКРЫТО (содержимое) / ЗАКРЫТО (механика) | **СОГЛАСЕН по расщеплению, обоснование содержимого требует замены** | Механика: `rules-cascade.ts:56-82`, 7/7 тестов (3 suite, 4 кейса в `checkRulesCascadeClosure`) — подтверждено прогоном. Граф `<DependsOn>` main воспроизведён **дословно** (11 файлов, все 12 рёбер таблицы §1.6 совпадают); асимметрия `typescript-rules` без `<DependsOn>` подтверждена. Поправки: **H/D** (`<InheritedBaseline>` вместо «проза»), **J** (`svelte-testing` не CrossRef'ит `testing-common`), **M-3** (висячая ссылка на `AX_MECHANICAL_VIA_SDD_CHECK`), **M-1** (второй глушитель пустого списка). Плюс, как просит V-A1 MISSED-8: зафиксировать противоречие main `audit.directive.xml:240` («optional and unchecked») ↔ `:253/:264` («MUST also appear … `RULES_CASCADE_MISMATCH` `MAJOR` tagged `unresolved-dependency`») — B4 цитирует обе строки в разных местах, но конфликт не называет |
| **R3** | НЕ ЗАКРЫТО (все три части) | **СОГЛАСЕН** | Реестр main: 19 записей (Coding 7 / Testing 8 / Infra 4), `baseline-rules :67-75`, `baseline-testing :129-137`, `python-rules :85-94`, `go-rules :95-104`, `result-conventions :58-66`, шапка `:2-7`, `<Directives>` `:8-53` (6 записей), `<CheckPhaseOrder>` `:55` — всё дословно. RC: 14 записей (3/7/4), `<Rules>` `:2`, `<CheckPhaseOrder>` `:3`, `typescript-rules` `<Triggers>` `:9` = «Target Files include source code files (not config)», `<SkipWhen>` `:10` — дословно. Добавить **M-9** (машинная тропа через `sdd-new`) |
| **R4** | НЕПРИМЕНИМО + дыра в main | **СОГЛАСЕН, дыра глубже** | `plugins/golang/plugin.json` = `{id, kind, entry}` ✓; `golang-setup.xml` 184 строки, `type="infra-rules"`, секции `:10/:134/:160/:175` ✓; доставка `sync.cmd.ts:91` → `sync-core.ts:217` → `deployed-surface.golden.txt:50` ✓; `path-normalizer.ts:63-66` ✓; `sdd-infra/SKILL.md:9` → `sdd-infra-golang/SKILL.md:109` ✓; `plugins.spec.md:317` ✓. `grep golang-setup` по `knowledge.xml` = **0** ✓ (уточнение: 30 вхождений в 14 файлах, а не «14 вхождений»). `StackPlugin` `:315-335` без facet'а правил ✓ (`gateIds` на `:332`). Добавить **M-8** (в RC нет `services/stack/`) и **M-15/§15** (поверхности плагина приходят из `DEFAULTS` резолвера, а не из манифеста) |
| **R5** | ЧАСТИЧНО | **СОГЛАСЕН** | Три потерянных предложения — дословно на `MAIN/scaffold.directive.xml:74`, и в RC (`ax-rules-resolution-hard-fail.xml:3`) их нет ✓. `ax-scope-rules-declaration.xml:9-14` сохранил skip / research-and-author / defer + `H_MISSING_RULE_FILE` ✓. Конфликт «тропа авторинга пишет в пакетную категорию, которую sync удаляет» подтверждён (`RC/sync-core.ts:233-244`). Поправки: **I** (`ports-adapters` — наследство v1, не регресс v2); уточнение: RC-зеркало удаляет только файлы внутри **поставляемых** подкаталогов (`:221-227`, `ownedSubdirs`/`scanTargetMirrorSpace`), поэтому проектная **категория** (`messenger/ai/directives/language/`) уже сегодня не трогается и «warnings» о ней сообщается — под угрозой именно проектный файл в `coding/`/`testing/`/`infra/` |

---

## § Факты

### Схема файла правила — подтверждено

Четыре секции и их семантика (§1.1) — CONFIRMED. Канон main: `audit.directive.xml:230` (аксиома), `:234` (`<DependsOn>` → «Used by scaffolder for transitive closure, by audit for cascade verification — NOT walked at runtime»), `:235-238` (четыре секции), `:240` (делегирование `sdd check` + «`<DependsOn>` is optional and unchecked»). Пример полноты: `coding/baseline-rules.xml` — `<BeliefState>` `:9-46` (6 аксиом, все шесть ID совпадают), `<AntiPatterns>` `:48-72`, `<VerificationHooks>` `:74-86` (`HOOK_PROJECT_GATE`, `HOOK_NO_SCAFFOLD_LEFTOVER`), `<RewardCriteria>` `:88-100`, файл 101 строка, корневой тег `ver="1.0"` — **всё дословно**.

«Схема не версионирована» — CONFIRMED и **сильнее, чем в B4**: `ver` не читает ни `check.sh`, ни `rules-cascade.ts`, а сверх того сам пакет в директивах пишет секции в snake_case (M-4). То есть неверсионированность уже дала расхождение **внутри пакета**, не только у потребителя.

Толерантность парсинга — CONFIRMED дословно: `check.sh:35-36` «these files are HTML-like by design and carry prose such as `<Target Files>` and `Meta<typeof Button>` that no XML parser accepts»; предикат `_sdd-lib.sh:14` `SDD_RULE_PATH_RE` + `:16-19` `sdd_lib_is_rule_path` — **пять** категорий, плагинное дерево, исключение `*.directive.xml`. B4 здесь прав и согласуется с опровержением C9 в V-A1.

### Семантика элементов реестра — подтверждено, с одной поправкой

| Элемент | Где живёт | Кто исполняет | Проверено |
|---|---|---|---|
| `<Triggers>` / `<SkipWhen>` | **реестр** | модель (scaffold, `AX_RULE_ACTIVATION_PLAN` шаг 3: «Signal-based only — no hardcoded language/tool knowledge») | ✓ `MAIN/scaffold.directive.xml:97`; `RC/ax-rule-activation-plan.xml:4` |
| `<ActivationHint>` / `<Purpose>` | реестр | модель | ✓ |
| `<CheckPhase>` | реестр + один глобальный `<CheckPhaseOrder>` | модель; `cloud-ios` переопределил порядок под себя (`:54`) | ✓ |
| `<RequiresVerification>` | реестр | раскрывается **infra-спекой** (Verification Commands) → таблица §5 тикета; halt `H_VERIFICATION_COMMAND_MISSING` (`MAIN/scaffold.directive.xml:104-105`) | ✓; у `cloud-ios` не раскрывается — их собственный комментарий в реестре |
| `<CrossRef>` | реестр, 0..n | **никто** — проза | ✓ 15 вхождений в main, 13 в RC |
| `<DependsOn>` | **файл правила** | scaffold (замыкание) + `sdd-check` в v2 (`SDD_RULES_CASCADE_UNRESOLVED`) | ✓ |
| `<InheritedBaseline>` | **файл правила** | **только модель**, по норме `RC/ax-rules-load-from-phase-block.xml:5-11`; механически невидим | ✓ — **B4 этот элемент не описал вовсе** |

Разделение «реестр решает, активируется ли; файл решает, что требуется» — CONFIRMED. Утверждение A2 §5.2 (`<CrossRef>` ≠ `<DependsOn>`, замыкание никогда не потребует `common.xml`) — **истинно**; поправка только в составе тройки (§J).

Парсер реестра (только v2): `parseRuleRegistry` `:59-74` — regex `<Rule\s+id="([^"]+)">([\s\S]*?)<\/Rule>` + `<File>`, throw при нуле записей (`:67`) и при дубликате `id` (`:70`); `loadRuleRegistry` `:81-91` — «проектный ИЛИ пакетный», слияния нет. Потребитель `sdd-new.cmd.ts:478`, ошибка → `ERR_CLI_SDD_NEW_RULE_REGISTRY_INVALID`, `exitCode: 1` (`sdd-new.types.ts:145`). **Всё CONFIRMED.** Добавить: `parseRuleRegistry` **молча выбрасывает** запись без `<File>` (`return file ? [...] : []`) — то есть «подавление пустым `<File>`» из Q2(a) уже сегодня работает как *игнорирование*, что делает Q2(a) дешевле, чем B4 оценивает, но и опаснее (опечатка в `<File>` = тихое исчезновение правила, без находки).

### Cascade Table: v1 vs v2 — подтверждено, «5 тиров» снять

| | v1 (main) | v2 (RC) |
|---|---|---|
| Аксиома | `scaffold.directive.xml:77` `AX_RULES_CASCADE_RESOLUTION` | `ai/kit/axiom/scaffold/ax-rules-cascade-resolution.xml` (источник — тот же файл) |
| Число тиров | текст `:78` — «union of **5** tiers», перечислено `:81-84` — **4** | `:3` — «union of **4** tiers», перечислено `:6-9` — **4** |
| Где живёт таблица | `tasks/<scope>/README.md` (`:87`), шаблон `:785-801` с `### Rule Sources` (`:798`) | `specs/<scope>/<scope>.3-tasks.md` (`:12`), формат `formats/scope-tasks-index.xml:16-22` |
| Per-phase `Rules:` | `:88`, `:260`, шаблон `:598-599`, `:611-612` | `formats/task-ticket-structure.xml:62` («links only … rule content is never inlined»), `:80` |
| Verification-таблица | union `<RequiresVerification>` `:103-108`, шаблон `:634-640` | `ax-rule-activation-plan.xml:6` |
| Чтение реестра | `:470` «Read `ai/directives/knowledge.xml` in full … Read it now — do not defer» | `ax-rule-activation-plan.xml:3` |
| Halts | `H_MISSING_RULES` `:441`, `H_RULES_CYCLE` `:442` | `H_MISSING_RULE_FILE` (`ax-scope-rules-declaration.xml:14`) |

Все привязки — CONFIRMED дословно. **Правка:** «5 тиров в v1 против 4 в v2» — не делта, а исправленное в RC устаревшее число main (§7 Итога). Дополнительно — M-6: `formats/scope-tasks-index.xml:17` называет 4-й тир `phase`, аксиома — `task`.

Как строится таблица: в v1 и в v2 — **моделью по инструкции директивы**, ни в одной ветке нет кода, который бы её генерировал или проверял. `shared/sdd/rules-cascade.ts` (v2) к Cascade Table отношения не имеет: он проверяет только замыкание **уже объявленного** per-phase списка в тикете. B4 это утверждает и это подтверждено.

### `SDD_RULES_*` в RC — исчерпывающий grep

`grep -rhoE 'SDD_RULES_[A-Z_]+'` по всему `rc-v6` (кроме `node_modules`) даёт **ровно один** код: `SDD_RULES_CASCADE_UNRESOLVED`, 11 вхождений в 7 файлах — `shared/sdd/rules-cascade.ts`, `shared/sdd/__tests__/rules-cascade.test.ts`, `cli/cmd/sdd-check/sdd-check.cmd.ts`, `cli/cmd/sdd-check/__tests__/sdd-check.cmd.test.ts`, `ai/directives/sdd-v2/audit/steps/STEP_1_MECHANICAL.xml`, `.../STEP_2_SEMANTIC.xml`, `ai/kit/axiom/audit/ax-rules-cascade-verification.xml`. **CONFIRMED** — B4 прав. (Родственные коды, которые B4 предлагает в §4.2/§5, — `SDD_RULES_FILE_INCOMPLETE`, `SDD_RULES_SCHEMA_LEGACY`, `SDD_RULES_REGISTRY_DANGLING`, `SDD_RULES_UNREGISTERED`, `SDD_RULES_PHASE_EMPTY` — в RC отсутствуют, т.е. это новые коды, а не порт.)

Также CONFIRMED: `grep 'BeliefState|AntiPatterns|VerificationHooks|RewardCriteria'` по `rc-v6/cli` + `rc-v6/shared` = **0**; в RC есть каталог `scripts/`, но нет `scripts/__tests__/`; аналога `deployed-surface.golden.txt` в RC нет нигде (`find` = ∅) — основание T-9 подтверждено.

### Что `checkRulesCascadeClosure` реально обеспечивает (прогон)

Прогон по заданию: `node --import tsx --test --experimental-test-module-mocks rc-v6/shared/sdd/__tests__/rules-cascade*.test.ts` → `# tests 7 # suites 3 # pass 7 # fail 0`. Состав: `parseRuleDependsOn` (2 кейса), `normalizeRulePath` (1), `checkRulesCascadeClosure` (4: полное замыкание; пропущенная прямая; пропущенная транзитивная 2-го уровня; пустой список). **Совпадает с §2.1 B4 дословно.**

Обеспечивает:
- одна находка `SDD_RULES_CASCADE_UNRESOLVED` (`severity: 'error'`) **на каждую уникальную** недостающую зависимость (дедупликация через `Set`, `:65,72,76`);
- DFS по `depsMap`, отсутствующий ключ = «дальше зависимостей не знаем» (`:71` `depsMap.get(r) ?? []`) — «fail closed» обеспечивается не здесь, а вызывающим (`buildRuleDepsMap` + `ERR_CLI_SDD_CHECK_READ_FAILED`, M-2);
- чистая функция, ни одного обращения к ФС.

**Не** обеспечивает: существование файлов (делает вызывающий); осмысленность активации; регистр секций (`parseRuleDependsOn` на `<Depends_On>` вернёт `[]` — подтверждено кодом `:42` и 7 файлами `messenger` с `<Depends_On>`); проверку пустого списка (`:62`, дублируется `sdd-check.cmd.ts:429`); ссылки без `.xml` (отфильтрованы `:427`).

### Полнота секций: числа (прогоны)

| Дерево | Полных / всего | Прогон |
|---|---|---|
| main | **23 / 23** | `bash check.sh <main>` → 23 строки `OK`, `findings=90`, `rule_findings=0`, exit 3 — **побитово как в B4 §2.1(3)** |
| RC | **15 / 17** | статический скан: `testing/vitest-rules.xml` `RewardCriteria=0`; `coding/uikit-spec-drafting.xml` `VerificationHooks=0`; остальные 15 — `1 1 1 1`. Таблица §1.6 B4 совпадает **построчно** |
| `cloud-ios` (свои) | **4 / 4** | `swift-rules` `:2/:12/:84/:128/:151`, `objc-rules` (+`<DependsOn>` `:13`), `xctest-rules` (+`:16`), `swiftlint-setup` (+`:11`) — все привязки B4 дословно верны |
| `messenger` | **0 / 19** | `bash check.sh <messenger>` → 19 строк `INCOMPLETE` с `missing = BeliefState,AntiPatterns,VerificationHooks,RewardCriteria`, `findings=718`, `rule_findings=19` — **побитово как в B4 §2.1(4)** |

Частоты snake_case-тегов у `messenger` (19 файлов) совпадают с блоком B4 **число в число**: 19 `<Belief_State`, 16 `<Reward_Criteria`, 16 `<Mission`, 16 `<Anti_Patterns`, 15 `<Verification_Hooks`, 13 `<Definitions`, 10 `<Code_Patterns`, 7 `<Depends_On`, 5 `<Workflow_Outline`, 4 `<Setup_Steps`, 3 `<Directive_Context`. Добавить: **2 × `<Inherited_Baseline`** — т.е. и второй канал наследования у `messenger` в старом регистре, и он тоже невидим.

Прогон main-тестов: `node --import tsx --test scripts/__tests__/{testing-rule-contract,sdd-check-rules}.test.ts` → `# tests 11 # suites 2 # pass 11` — совпадает. Белый список `testing-rule-contract.test.ts:17-24` — ровно шесть файлов, как у B4; точечные assert'ы `:51-57` и `:67-71` — все шесть ID подтверждены. Четыре файла из `5a237cd5` в тесте отсутствуют; в golden они есть (`:37,38,39,73`), `golang-setup` как `ai/directives/infra/golang-setup.xml` — `:50`. **CONFIRMED.**

### Ownership (§1.5) — подтверждено, с уточнением зоны удаления

main: `SyncFileStatus` `:8` (`added|updated|unchanged|preserved`), `PROJECT_OWNED_ENTRIES` `:27` + комментарий `:23-25`, ветка `preserved` `:239-241`, подавление записи `:254`, summary `sync.types.ts:74-76`, `EXCLUDED_ENTRIES` `:16-21`, `extraSourceDirs` `sync.cmd.ts:91` → `scanSourceRoots` `:217`, нормализация `path-normalizer.ts:63-66`, тест-замок `sync-core.test.ts:223`. Удалений нет (`grep deleted|unlink|rmSync` = **0**). RC: `SyncFileStatus` `:6`, `EXCLUDED_ENTRIES` `:16`, `status: 'deleted'` + `deps.unlink` `:233-244`, тест-замок `:218`; `PROJECT_OWNED`/`preserved`/`extraSourceDirs`/`RULE_PLUGIN_DIRECTIVES` — **отсутствуют**. Всё CONFIRMED.

**Уточнение, которое меняет одну строку §4.2:** зеркальное удаление в RC ограничено `ownedSubdirs` (`:226-232`, `listOwnedSubdirs`/`scanTargetMirrorSpace`), и комментарий `:221-225` прямо говорит: «a target subdirectory the package never shipped is a project customization, left untouched and reported via `warnings`». Значит категория `messenger/ai/directives/language/` **уже сегодня** не удаляется — обещание R-B «категория `language/` защищена манифестом» описывает то, что и так работает. Под угрозой ровно то, что B4 называет в §1.7: проектный файл **внутри** поставляемой категории (`coding/logging-rules.xml`, `coding/swift-rules.xml`).

Наблюдение B4 «`architecture` исключён из sync, но считается каскадной категорией» — CONFIRMED (`sync-core.ts:17` vs `_sdd-lib.sh:14`), и в RC то же (`EXCLUDED_ENTRIES = {'architecture'}`), т.е. это уже де-факто project-owned категория в обеих ветках. `ai/directives/architecture/` содержит только `README.md` **и в main, и в RC**.

---

## § Не-Node реальность

### Что B4 описал верно

**Реестр `cloud-ios`** (`ai/directives/knowledge.xml`, 119 строк на ветке akkrat) — сверен построчно и подтверждён целиком:
- блок `<Directives>` `:2-46` — копия пакетного (6 записей: `setup`, `discovery`, `module-decomposition`, `scaffold`, `phase-execution-protocol`, `audit`);
- `<Rules>` `:48`, собственный `<CheckPhaseOrder>lint build test</CheckPhaseOrder>` `:54` с объяснением «No standalone typecheck: the build checks types. No format phase, by decision»;
- предупреждение о нерезолвящемся алиасе — дословно как у B4: «Until it does, check-command does not resolve in this repository» (комментарий `:56-60`);
- пять записей: `swift-rules` `:63` (`<CheckPhase>lint`), `objc-rules` `:74` (пустые `<CheckPhase>`/`<RequiresVerification>`), `xctest-rules` `:86` (`test`), `git-setup` `:98` (пакетное правило с **переписанным** `<ActivationHint>`: «Two deviations in this repository … Take the discipline, not the examples»), `swiftlint-setup` `:107` (`lint`);
- цитаты `AP_TRUST_DISABLED_RULE` и `AX_RULE_LISTS_ARE_EXCLUSIVE` — дословно.

**Файлы правил `cloud-ios`** — 4/4 полных, привязки B4 совпадают символ-в-символ. Хуки — реальные команды их гейта: `HOOK_SWIFTLINT` → `gennady verify --only=swiftlint` (`swift-rules.xml:131`), `HOOK_SWIFTLINT_AUTOCORRECT` → `gennady fix` (`:136`), `HOOK_UNIT_TESTS` → `gennady verify --only=unit-tests` (`:141`), `HOOK_FORCE_OPERATORS_MANUAL` → `git diff --unified=0 origin/master -- 'MRCloudApp/**/*.swift' | grep -nE '(as!|try!|\)!|\]!)' || true` (`:146`). Всё CONFIRMED.

**Cascade Table `cloud-ios`** (`tasks/infra-base/README.md`, 69 строк) — CONFIRMED дословно, включая обе цитаты («вывод по `<Triggers>` даёт пустое множество», «Оба правила подключены решением тикета, потому что предмет фазы — защита линт-гейта», «Чистая альтернатива — дописать в `<Triggers>` … но это правка `knowledge.xml` и файла правила, вне границ скоупа») и строку «Не активируются: `git-setup` …, `objc-rules` …». Оценка B4 («самое точное описание проблемы тира `task` во всём корпусе») — **согласен**, это подтверждается тем, что в самом пакете формата записи причины для тира `task` нет ни в v1 (`scaffold.directive.xml:84` — «operator-supplied during ticket generation», без формата), ни в v2 (`ax-rules-cascade-resolution.xml:9` — та же формулировка).

**Реальность `messenger`** — CONFIRMED: 19 файлов правил в старой схеме, проектное `coding/logging-rules.xml` (реестр `:70-78`), проектная категория `language/` с `lang-lint.directive.xml` (21 543 байта) + `README.md` + `examples.md`, регистрация директивы в `<Directives>` на `:49`, висячая ссылка `sdd/task-scaffolding.directive.xml` на `:26`, `perf-auditor/rules/` (корректно **не** попадает в `[RULES]` — категория вне каскада). Оба следствия подтверждены: 19 ложных `INCOMPLETE` (прогон) и тихое ложно-зелёное замыкание (`parseRuleDependsOn` `:42` не видит `<Depends_On>`, а у `messenger` таких 7 файлов).

### Что B4 описал неверно или неполно

1. **Механизм порчи в v2 назван не полностью (M-9).** Тропа §3.1 шаг 3 «`typescript-rules` активируется, потому что его `<Triggers>` ловят любой исходник» — верна, но это **вторая по жёсткости** тропа. Первая: `sdd-new` печатает `id`+href кортежи прямо из `loadRuleRegistry` в каждый создаваемый тикет (`help.ts:92`, `sdd-new.types.ts:314`). После первого v2-`sync` на Swift-проекте это не «модель может ошибиться в активации», а «CLI детерминированно вписывает `typescript-rules`/`svelte5-runes` в артефакт». Это ровно вывод B3 §1.10, и он сильнее, чем то, что стоит в B4.

2. **Зона удаления шире, чем нужно, и уже — чем описано.** См. § Факты: проектная **категория** (`language/`) уже не удаляется, удаляется проектный **файл в поставляемой категории**. Строку §4.2 «категория `language/` защищена манифестом» надо снять — она обещает несуществующую проблему решённой.

3. **`cloud-ios` стоит на срезе пакета до `5a237cd5` (M-10).** В их дереве нет `coding/{baseline-rules,python-rules,go-rules}.xml` и `testing/baseline-testing.xml`. Значит утверждение §1.6 «12 (или 18) синхронизированных, но не зарегистрированных пакетных правил» описывает **старый** набор, а после релиза v2 они получат другой. Для T-7 это ключевой вход: миграция подавлений должна строиться не от «того, что у них лежит», а от «того, что пакет поставит».

4. **Числа §F и §G** (`messenger` 9/8/5 вместо 8/7/4; `cloud-ios` «12» вместо 18).

5. **Что *не* ломается, а B4 подразумевает поломку.** `sdd-infra/SKILL.md:9` действительно маршрутизирует только Go, для Python/Swift ветки нет — CONFIRMED. Но `ax-scope-rules-declaration.xml:9-14` (тропа skip / research-and-author / defer, «never a halt, never an autonomous task») в v2 **сохранена целиком** и она language-agnostic. То есть у не-Node проекта в v2 есть рабочая тропа авторинга; ломается не она, а **сохранность результата** (обрыв 2) и **отсутствие baseline** (обрыв 1). Формулировка §3.1 это допускает, но три «независимых обрыва» стоило бы упорядочить по тому, какой из них блокирует релиз: обрыв 2 (владение) — да, блокирует; обрыв 1 (содержание) — деградация; обрыв 3 (проверяемость) — долг.

6. **Обрыв 1 в v2 частично мнимый для Python/Go и полностью реален для Swift.** `infra.directive.xml:83` («look up each chosen tool in `knowledge.xml`: find every rule whose `<Triggers>` match the tool name or its config artefacts») — CONFIRMED. Но в v1 «стек → правило» для Python тоже существует только как запись реестра, а маршрут скилла есть только для Go. То есть по содержанию v1 сильнее v2 ровно на четыре файла + четыре записи, а по маршрутизации — только на Go-плагин. B4 это говорит, но сводная строка §1.7 «Языки в реестре: v1 — TS, Python, Go» может читаться как «v1 умеет Python», чего нет: ни одной задачи в `tasks/` под python/go в main нет (R-b2, подтверждено).

### Проверяемое утверждение, которое стоит добавить в §3

`<RequiresVerification>check-command</RequiresVerification>` объявлен у **обоих** baseline-правил main (`knowledge.xml:74`, `:136`) и у **17 из 19** записей реестра main (пустой — только у `git-setup` и `storybook-setup`), а раскрывается только infra-спекой. В RC — **12 из 14**. Ни в v1, ни в v2 нет проверки «алиас раскрываем». Значит дефект, который `cloud-ios` описал прозой, — **не их локальная проблема, а свойство пакета**, и (d6) закрывает его для всех, включая самохостинг. Это самый дешёвый детерминированный чек из всех предложенных в §3.5 (одна проверка «каждый уникальный алиас из реестра встречается в Verification Commands infra-спеки») и его стоило вынести в §5.2 к трём немедленным пунктам.

---

## § Варианты и steelman

### Полнота пространства вариантов

B4 разбирает три варианта (R-A порт v1, R-B три слоя + аудит, R-C правила в пресете) по одному шаблону и по шести критериям. Шаблон применён **честно и симметрично**: у каждого варианта есть разделы «что закрывает из R1–R5», «стыки VERIFY/SYNC», «что происходит у обоих потребителей», «риски», «тесты», «effort». Отрицательные стороны рекомендованного варианта названы прямо (наибольший объём, R-c4 «без миграции — регресс», риск записи не в тот файл, вечная поддержка таблицы легаси-имён). По честности сравнения претензий нет.

**Пространство, однако, не полно — не хватает двух позиций:**

**(0) «Реестр не зеркалится».** `loadRuleRegistry` (`task-authoring-literals.ts:81-91`) уже читает «проектный на диске ИЛИ пакетный из `node_modules`». Достаточно внести `knowledge.xml` в `EXCLUDED_ENTRIES` — и никакой `preserved`, seed, merge, статус или миграция не нужны: пакетный реестр живёт в `node_modules`, проектный — в дереве, конфликта не возникает конструктивно. **Цена, которую надо назвать честно:** ломается свойство «агент открывает один файл в дереве и видит весь набор» (`scaffold.directive.xml:470` «Read it now — do not defer»), пока проект не создал свой реестр. Поэтому (0) не доминирует C1, но должен быть в таблице: он показывает, что «seed + preserved» — это цена **агентской читаемости**, а не техническая необходимость, и это меняет разговор про Q1.

**(∞) Развилка «две системы наследования».** Ни один из трёх вариантов не решает `<DependsOn>` vs `<InheritedBaseline>` (§D/H). Любой дизайн слоя правил обязан выбрать: либо `<InheritedBaseline>` объявляется прозой-дублем `<DependsOn>` и вычищается, либо он становится вторым механическим каналом и его читает и `parseRuleDependsOn`, и аудит. Пока выбора нет, `vitest-rules`/`node-test` в v2 остаются «объявленными, но невидимыми», а `messenger` — вдвойне (`<Depends_On>` **и** `<Inherited_Baseline>`).

### Steelman простого варианта: «baseline в ядре + project-owned реестр + пер-стековые файлы от пресетов, без новых механизмов»

Назову его **R-A′**. Это R-A с одним содержательным уточнением: пер-стековые **файлы** правил приезжают от пресета/плагина (механизм уже есть), а **записи реестра** пишет проект — потому что реестр его.

**Почему это не компромисс, а прямое следствие принятой аксиомы.** `f74c8c1d` (сообщение коммита, дословно): «Scaffold's rules axiom documents the registry as project-owned and tells a non-Node scope to author its own rules rather than reference package rules that don't exist for its language». `scaffold.directive.xml:74`: «a non-Node scope authors its own rule files for its stack **and lists them**». Аксиома уже говорит: **пакет поставляет материал, проект составляет реестр.** R-A′ ничего не изобретает — он доводит до конца то, что main решил, и то, что `cloud-ios` **уже сделал руками** (5 записей, свой `<CheckPhaseOrder>`, переписанный `<ActivationHint>` у пакетного `git-setup`).

**Что при этом получается бесплатно:**
- **Подавление (Q2) — не нужно как механизм.** Проект, которому не нужен `typescript-rules`, просто не пишет запись. `cloud-ios` уже так живёт. Q2 целиком снимается с повестки; Q1 сводится к «C1» без альтернатив; T-2, T-7 и половина T-4 исчезают.
- **Файлы пресета уже доезжают.** `sync.cmd.ts:91` `extraSourceDirs: pluginSurfaceDirs(...)` → `sync-core.ts:217` → `deployed-surface.golden.txt:50` — работает, покрыто golden'ом и e2e. Ничего нового.
- **Ноль миграции (К5).** Оба потребителя не трогаются: у `cloud-ios` реестр становится `preserved`, у `messenger` — тоже, оба продолжают работать как сегодня.
- **Полная независимость от VERIFY (К6)** — с одной поправкой ниже.

**Как R-A′ закрывает разрыв, за который B4 отвергает R-A.** Аргумент B4 — «C1 замораживает пакетную часть реестра, `messenger` уже пострадал». Разбор:
1. Эмпирика опровергнута (§L): висячая ссылка `messenger` — в блоке `<Directives>`, которого в v2 нет.
2. Что реально может застыть в `<Rules>` — восемь коротких полей на правило (`<Purpose>`, `<Triggers>`, `<SkipWhen>`, `<ActivationHint>`, `<CheckPhase>`, `<RequiresVerification>`, `<File>`, `<CrossRef>`). Содержимое правила при этом обновляется как обычный пакетный файл — застывает только **активационная семантика**.
3. Застывание становится **видимым** одной детерминированной проверкой, которая уже нужна по B3 SO-10 и по (d4): «каждый `<File>` итогового реестра существует» + «каждый файл каскадной категории на диске либо зарегистрирован, либо достижим по объявленному наследованию». Это ловит и `messenger`-дрейф, и `golang-setup` без записи, и три `uikit-*` (§E). Effort — S, не L.
4. Итог: **C1 + `<File>`-чек ≈ выгода C2 при S вместо M+M+M**, и без риска R-c4 (который B4 сам называет «если не сделать — вариант регрессирует для обоих потребителей»).

**Единственный реальный стык R-A′ с VERIFY, и он обязателен.** Сегодня `extraSourceDirs` — это **все** плагины без разбора: именно поэтому в iOS-репозитории лежит `ai/directives/infra/golang-setup.xml`. «Пресет поставляет свои файлы» имеет смысл только если поставка **гейтится детекцией**, т.е. требует `detectStacks` из B1 §4.4 п.1. Без этого R-A′ раздаёт всем всё — то же, что сегодня. Это единственная зависимость от VERIFY, и она общая для R-A′ и R-B (у B4 §3.2 R-a3 названа аналогично).

**Второй обязательный стык — тот же, что у R-B и не назван у B4 (§K):** порт baseline в v2 требует, чтобы `<sdd-path> verify --wip <target-files>` в v2 существовал, либо чтобы оба хука были переписаны под `sdd-verify`. Это не «слабый стык», это блокер T-1.

**Где R-A′ реально слабее R-B:**
- пакет не может обновить активационную семантику своего правила у проекта, тронувшего реестр (мера — п.3 выше: видимость вместо автоматизма);
- легаси-схема секций (`messenger`) не лечится — но она и в R-B лечится не merge'ем слоёв, а (d5), которая ортогональна выбору владения; (d5) можно взять и в R-A′ без C2;
- нет формата, который в будущем станет выходом пресета (аргумент B4 «(iii) `knowledge.stack.xml` — это то, что плагин будет генерировать»). Контраргумент: пресет, который умеет **генерировать** записи, сможет так же положить их в отдельный файл тогда, когда появится; предварительно вводить трёхслойный merge под будущий генератор — это цена сегодня за опцию завтра.

**Вывод по steelman.** R-A′ (= (b) baseline в ядре + C1 + файлы от пресетов, гейтированные детекцией + `<File>`/unregistered-чек) закрывает R1, R2, R3, R5, подготавливает R4 не хуже R-B, стоит **M вместо L**, снимает два из шести операторских вопросов (Q1 → C1, Q2 → снят) и не требует миграционного шага, отсутствие которого превращает R-B в регресс. Я бы рекомендовал **его**, а R-B оставил как описание целевого состояния на случай, если пакету действительно понадобится обновлять активационную семантику у чужих проектов — потребность, которая ни в одном из двух живых потребителей пока не проявилась.

### Соответствие вариантов аксиоме `f74c8c1d` и threading'у B1

| Вариант | Аксиома «не-Node скоуп сам пишет свои правила» | Threading стека (B1 §4.4) |
|---|---|---|
| **R-A** | соблюдает буквально (это и есть `f74c8c1d`) | не использует вовсе — файлы пресетов раздаются всем (дефект `golang-setup.xml` в iOS остаётся) |
| **R-A′** (steelman) | соблюдает буквально и доводит до конца («пакет поставляет, проект составляет») | использует минимально и по назначению: `detectStacks` гейтит `extraSourceDirs`; `STACK=` в `sdd-state` — один источник, как требует инвариант B1 |
| **R-B** | соблюдает **условно**: пакетный слой возвращается в итоговый набор, и без T-7 `cloud-ios` снова получает `typescript-rules` активным — т.е. буква аксиомы нарушается, интенция сохраняется только при выполненной миграции | использует: слой 1 материализуется по результату детекции; корректно расширяет инвариант B1 на scaffold |
| **R-C** | заменяет артефакт: «свои правила» → `rules.add` в `gennady.yaml`; интенция сохраняется, файл-реестр исчезает | максимально, но заблокирован тремя отсутствиями в v2 (`plugins/`, `services/stack/`, `gennady.yaml`) — M-8 |

---

## § Задачи

### Зависимости от треков VERIFY и SYNC — что B4 указал верно и что пропустил

| Задача | Зависимость по B4 | Фактическая зависимость |
|---|---|---|
| **T-1** порт baseline + фикс двух неполных файлов | «—» (нет зависимостей), effort M, стык с VERIFY «слабый и это плюс» | **НЕВЕРНО.** Жёсткая зависимость: `HOOK_PROJECT_GATE` (`baseline-rules.xml:75-80`) и `HOOK_TESTS_PASS` (`baseline-testing.xml`) вызывают `<sdd-path> verify --wip <target-files>`; в RC ни `verify`, ни `--wip` нет (§K). Либо трек VERIFY даёт `verify`, либо T-1 переписывает оба `<Command>` под `sdd-verify` — и тогда это уже решение по VERIFY, принятое внутри трека RULES. **Развилку надо вынести в Q-вопросы.** |
| **T-2** слои реестра | Q1, Q2 | верно; добавить: `parseRuleRegistry` уже **молча игнорирует** запись без `<File>`, значит Q2(a) реализуется правкой нуля строк, но и опечатка в `<File>` навсегда останется тихой — это аргумент за Q2(b)/(c) |
| **T-3** аудит контракта | Q3, Q4, Q6 | верно; добавить Q-вопрос по M-5 (три разных списка категорий в пакете, не два) и учесть M-2 (проверка существования транзитивных зависимостей для цитируемых правил **уже есть** — (d3) должна расширять её на пакетное дерево, а не вводить заново). Убрать из файлового списка `scripts/git-hooks/pre-commit` (§A) |
| **T-4** владение при sync | T-2, Q1 | верно. Уточнить зону: зеркальное удаление уже сегодня не касается непоставляемых подкаталогов (`RC/sync-core.ts:221-227`), поэтому кейс (c) теста надо формулировать как «проектный файл **внутри** `coding/`», а не «проектная категория» |
| **T-5** возврат текста R5 | T-3 | верно. Добавить: вернуть также «Section presence is NOT judged by eye» (§B) и cap `MINOR` (§C) — иначе `RULE_FILE_INCOMPLETE` в v2 остаётся `MAJOR` и способен уронить вердикт задачи, которой файл правила не принадлежит |
| **T-6** `SDD_RULES_PHASE_EMPTY` + `architecture`/`quality` | Q6 | верно, но **занижена**: править надо `rules-cascade.ts:62` **и** `sdd-check.cmd.ts:429`, плюс решить, что делать с фильтром `:427` (ссылка без `.xml` выпадает молча). Пример `ports-adapters` — унаследован из v1 (§I), поэтому задача должна чинить и `MAIN/scaffold.directive.xml:411,794`, если main остаётся живой веткой |
| **T-7** миграция подавлений | T-2, T-4, Q2 | верно; вход задачи надо строить от «что пакет поставит», а не от «что у потребителя лежит» (M-10: дерево `cloud-ios` — срез до `5a237cd5`). В R-A′ задача **не нужна** |
| **T-8** facet правил у плагина | T-2 + перенос `plugins/` | **уточнить:** в RC нет и `services/stack/` (M-8), т.е. переносить надо `services/stack/**` + `plugins/**`, а не только второе |
| **T-9** golden поставляемой поверхности | T-2 | подтверждено: в RC нет ни `scripts/__tests__/`, ни какого-либо `deployed-surface*` (`find` = ∅). Зависимость от T-2 избыточна — golden можно вводить первым, и он тогда зафиксирует **текущую** поверхность до любых правок |
| **T-10** переименование `agents-rules` | — | верно и уместно; §1.8 подтверждён целиком (47 строк, читает `cli/cmd/orient/README.md`, к слою правил не относится) |

### Пропущенные задачи

**T-11 (S) — зарегистрировать три `uikit-*` в реестре или объявить их не-правилами.** `coding/uikit-component-storybook.xml`, `coding/uikit-component-svelte.xml`, `coding/uikit-spec-drafting.xml` (919 LOC по A2) **недостижимы из реестра вообще** (§E): ни `<Triggers>`, ни `<DependsOn>` любого зарегистрированного правила до них не доходит. T-3 (d4) их только **обнаружит** — задачи, которая устраняет причину, в §5 нет. Решение — одно из двух: три записи в `<Rules>` (тогда `uikit-spec-drafting` попадает в T-1 как файл, которому нужен `<VerificationHooks>` не «для галочки», а потому что он активируется) либо вывод их из каскадных категорий. Файлы: `ai/directives/knowledge.xml`; замок — тест из T-3 (d4).

**T-12 (S) — вернуть блок `<Directives>` в реестр v2.** `RC/ai/directives/sdd-v2/infra.directive.xml:243` называет `knowledge.xml` «the sole index (`<Rules>` section)», а в RC реестр индексирует **только** правила: `<Directives>` нет (единственная верхнеуровневая секция — `<Rules>` на `:2`), тогда как main несёт 6 записей (`:8-53`) и `cloud-ios`/`messenger` их у себя держат. B3 SO-10 эту задачу называет; в §5 B4 её нет, хотя §1.2 факт фиксирует. Файлы: `ai/directives/knowledge.xml`; замок — тот же `<File>`-existence чек из T-3 (d4), распространённый на `<Directive>`-записи (он же поймал бы висячий `task-scaffolding.directive.xml` у `messenger`).

**T-13 (S) — детерминированная проверка раскрытия `<RequiresVerification>`.** B4 держит её внутри T-3 как (d6). Учитывая, что алиас `check-command` объявлен у 17 из 19 записей main и 12 из 14 RC, а раскрытия не проверяет никто ни в одной ветке, и что это единственная находка, которую потребитель вынужден был записать прозой в собственный реестр, — её стоит вынести отдельной задачей и в §5.2 (немедленные), а не прятать шестым пунктом в аудит размера M.

**T-14 (S, main-side) — снять `go-rules.xml`/`python-rules.xml` из блока «Planned».** `MAIN/ai/directives/coding/README.md:21-25` до сих пор перечисляет как «Planned» файлы, поставленные в `5a237cd5`; `testing/README.md:15-21` — то же для `pytest.xml`/`go-test.xml`. В RC оба README **идентичны** main. B4 упоминает это в файловом списке §3.3, но в таблицу §5 не выносит; для T-1 это часть определения «готово».

### Eval-группы (§5.1) — согласен, с одной поправкой

Разделение «детерминированный тест vs LLM-eval» выполнено корректно, и вывод «девять из десяти задач закрываются детерминированно» соответствует фактам. Предпосылка «без python/go/swift фикстур G1 нечем измерять» — верна.

Поправка: строка «`typescript-rules` **не** активируется для `.py`/`.go`/`.swift` → только LLM-eval» — **неполна**. Часть этого утверждения детерминируема прямо сейчас: `sdd-new` печатает кортежи из реестра механически (M-9), поэтому тест «на python-фикстуре `sdd-new task …` не печатает `typescript-rules`» — обычный `node:test`, не eval. LLM нужен только для второй половины (выбор правил моделью при построении Cascade Table). Это переносит одну из четырёх точек eval в детерминированную зону.

### Что стоит сделать немедленно (§5.2) — согласен, плюс два

Три пункта B4 подтверждены фактами и прогонами:
1. два неполных файла в RC — подтверждено статическим сканом;
2. `RC/knowledge.xml:9` `<Triggers>` у `typescript-rules` — подтверждено дословно;
3. порт `f74c8c1d` + отключение зеркального удаления внутри каскадных категорий — подтверждено кодом обеих ветвей и эмпирикой B3.

Добавить:
4. **`<File>`-existence + unregistered-чек** (одна проверка, S): ловит `messenger`-дрейф, `golang-setup` без записи, три `uikit-*`, и снимает главный риск C1 — то есть делает Q1 не блокирующим.
5. **Решение по хукам baseline** (§K): без него пункт «портировать baseline» невыполним корректно ни в одном варианте.

---

## § Правки к B4

Порядок — по убыванию влияния на выводы.

### Блокирующие (меняют вывод или рекомендацию)

1. **§3.3 «Взаимодействие с VERIFY» и §5 T-1 «Зависит от: —»** → переписать по §K. Формулировка: «Оба baseline-файла в `<VerificationHooks>` вызывают `<sdd-path> verify --wip <target-files>` (`coding/baseline-rules.xml:78`, `testing/baseline-testing.xml`). В RC команды `verify` и флага `--wip` не существует (`rc-v6/cli/cmd/` содержит `sdd-verify`; `grep -rn 'verify --wip' rc-v6` = ∅). Порт «как есть» ставит в ядро два хука с мёртвой командой. T-1 зависит от решения по VERIFY либо включает переписывание обоих `<Command>`.» Добавить как **Q7**.
2. **§4.4 «Почему не R-A», первый абзац** → снять аргумент про `messenger` по §L, либо переформулировать: «висячая ссылка в `messenger` относится к блоку `<Directives>`, которого в v2 нет; риск застывания активационной семантики `<Rules>` реален, но эмпирики по нему пока нет, и он полностью покрывается детерминированным `<File>`/unregistered-чеком (S), а не merge'ем слоёв (M+M)». После этой правки рекомендация §4.4 должна быть пересмотрена: см. R-A′ в § Варианты и steelman.
3. **§2 R2 и §1.2, абзац про дрейф** → заменить «в RC снова только проза» на §D/H: `<InheritedBaseline>` (`RC/vitest-rules.xml:8`, `node-test.xml:8`) + новая норма `ax-rules-load-from-phase-block.xml:5-11`, которой в main нет. Добавить в §1.1/§1.2 таблицу элементов строку `<InheritedBaseline>` (файл правила; исполняет только модель; механически невидим). Это же — новый пункт развилок (см. (∞)).
4. **§2 R1 п.5 «маршрутизируется мягче»** → по §C: в v2 `MAJOR` (`ax-rules-compliance-against-activated-rules.xml:12`) против v1 cap `MINOR` (`audit.directive.xml:125`); маршрут размыт (`audit.directive.xml:188`), запрет `ticket-update` снят. Формулировка: «жёстче по severity, размытее по маршруту, без cap и без `rule-file-fix`».
5. **§1.1** → снять «тот же текст, включая …» по §B; сказать прямо, что v2 заменил делегирование инструменту на глазомер и поднял severity.
6. **§1.6** → по §E: три `uikit-*` **недостижимы из реестра вообще** (перебор всех 7 `<DependsOn>` в RC), попасть в тикет могут только через тир `task`. Добавить задачу T-11.
7. **§1.3 шаг 8 и §1.6/§2 R5** → §D (v2 добавил разрешающую норму, а не сохранил «тот же запрет») и §I (`ports-adapters` — наследство v1: `MAIN/scaffold.directive.xml:411,794`, `MAIN/ai/directives/architecture/` тоже только `README.md`).

### Существенные (факт неверен, вывод сохраняется)

8. **§1.4, §5 T-3** → убрать `scripts/git-hooks/pre-commit`: файла и хуков в main нет вовсе (§A). Заменить на «единственный агрегат — `npm run lint` = `format && type-check && lint:contracts`; `check.sh` не входит ни в него, ни в `npm test`».
9. **§1.3 строка 3 и §1.7 строка «Тиров каскада»** → снять «5 против 4»: main пишет 5, перечисляет 4 (`:78` vs `:81-84`); RC исправил. Добавить M-6 (шаблон `formats/scope-tasks-index.xml:17` называет 4-й тир `phase`, аксиома — `task`).
10. **§1.6 (`messenger`)** → 8 / 7 / 4 файла вместо 9 / 8 / 5 (§F). Добавить `2 × <Inherited_Baseline>` в таблицу частот.
11. **§1.6 (`cloud-ios`)** → 18 вместо 12 (§G); добавить M-10 (нет baseline-файлов ⇒ срез до `5a237cd5`).
12. **§2 R4 и §4.3** → добавить M-8: в RC нет `services/stack/`, т.е. `StackPlugin`, `gateIds`, `detect()` в v2 отсутствуют как тип; R-C блокирован тремя отсутствиями. Добавить M-15/§15: поверхности плагина резолвятся из `DEFAULTS` (`services/plugins/resolve-plugins.ts:24`), а не из `plugin.json`.
13. **§3.1 шаг 3 и §3.4** → добавить M-9: `sdd-new` печатает кортежи реестра в каждый тикет (`RC/cli/cmd/sdd-new/help.ts:92`, `sdd-new.types.ts:314`); порча Swift-каскада машинно-детерминирована, а не только семантическая.
14. **§1.5 п.2 и §4.2** → M-7: коллизия корней документирована как «base root wins» (`MAIN/sync-core.ts:77-78`); недиагностируема именно коллизия плагин↔плагин. И снять из §4.2 обещание «категория `language/` защищена манифестом» — она уже защищена (`RC/sync-core.ts:221-227`).
15. **§1.4** → добавить M-3: `ax-rules-cascade-verification.xml:14` ссылается на `AX_MECHANICAL_VIA_SDD_CHECK` как на источник `RULES_CASCADE_CLOSURE`, а в перечнях `ax-mechanical-via-sdd-check.xml:5,6` этой проверки нет — висячая перекрёстная ссылка внутри v2.
16. **§1.1/§3.5(d5)/Q3** → добавить M-4: пакет сам инструктирует в snake_case (`RC/ax-rules-load-from-phase-block.xml:3`, `RC/ax-rules-compliance-against-activated-rules.xml:16`, `MAIN/audit.directive.xml:243`, `MAIN/phase-execution-protocol.xml:54`). Это сильнейшее доказательство необходимости версионирования схемы и оно не использовано.
17. **§3.5(d3)** → M-2: проверка существования транзитивных зависимостей для правил, цитируемых тикетом, **уже реализована** (`sdd-check.cmd.ts:434-447`, `ERR_CLI_SDD_CHECK_READ_FAILED`); (d3) должна её расширить на пакетное дерево, а не вводить заново.
18. **§4.5 Q6** → M-5: списков категорий три (5 / 4 / 3), не два.
19. **§5 T-6** → M-1: пустой `Rules:` глушится в `rules-cascade.ts:62` **и** `sdd-check.cmd.ts:429`; плюс фильтр `:427` роняет ссылки без `.xml`.
20. **§5** → добавить T-11 (регистрация `uikit-*`), T-12 (возврат `<Directives>`), T-13 (чек раскрытия алиаса — в §5.2), T-14 (README «Planned»).
21. **§4** → добавить вариант (0) «реестр не зеркалится» и развилку (∞) «две системы наследования».

### Косметические

22. WRONG-LINE 1–15 из § Цитаты; плюс `python-rules` `<RewardCriteria>` про pytest — `:84`, не `:85`.
23. §1.2 «`parseRuleRegistry` `:59-79`» → `:59-74`; «throw на дубликате `:71`» → `:70`; «exit 1 `sdd-new.types.ts:148`» → `:145`.
24. §2 R4 «grep `golang-setup` по main: 14 вхождений» → 30 вхождений в 14 файлах.
25. §1.2/§2 R2 → `svelte-testing` не несёт `<CrossRef id="testing-common">` (§J).
26. §1.3 «7 шагов» у `AX_RULE_ACTIVATION_PLAN` → 8.
27. Добавить, что `parseRuleRegistry` **молча отбрасывает** `<Rule>` без `<File>` — это делает Q2(a) бесплатным по коду и одновременно объясняет, почему опечатка в `<File>` сегодня не даёт находки.

### Что править не нужно

- Перечень **пяти** каскадных категорий (§1.4) — верен и согласуется с опровержением C9 в V-A1.
- Все четыре прогона §2.1 — воспроизведены побитово, включая `findings=90` и `rule_findings=19`.
- Граф `<DependsOn>` main (§1.6) — 12 рёбер, все дословно.
- Весь блок `cloud-ios` (реестр, файлы, хуки, Cascade Table) — дословно, кроме числа 12 (§G).
- Частоты snake_case-тегов `messenger` — число в число.
- §1.8 (`agents-rules` не относится к слою правил) — подтверждён целиком; рекомендация T-10 уместна.
- Оценка «слой правил — почти целиком механическая дисциплина, которую в v2 перестали проверять механически» — подтверждена: единственный `SDD_RULES_*` код в RC один, проверок секций ноль, `AX_MECHANICAL_VIA_SDD_CHECK` отдал rules-cascade модели.
