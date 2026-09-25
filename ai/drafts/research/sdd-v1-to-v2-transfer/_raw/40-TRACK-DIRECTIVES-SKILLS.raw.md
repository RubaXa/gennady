# Часть I — B6-directives-skills-track (аналитик)

# B6 — трек DIRECTIVES & SKILLS: аудит переноса SDD v1 → v2

Роли деревьев:

- **MAIN (v1, `origin/main` 8bb38477)** — `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`.
  `ai/directives/sdd/*.xml` (12 директив + `README.md`), `ai/skills/*` (16), `plugins/golang/skills/sdd-infra-golang/SKILL.md`,
  `docs/sdd-flow.md`, `scripts/__tests__/*.test.ts` (11 файлов).
- **RC (v2, `codex/sdd-v2-rc52-followup`)** — `…/scratchpad/rc-v6`.
  `ai/directives/sdd-v2/**` (70 XML, 622 428 байт) из `ai/kit/templates/sdd-v2/**` (30 верхних `.hbs` + `agent-inbox/` + `formats/`),
  `ai/kit/axiom/**` (427 файлов), `ai/skills/*` (12).

Рамка решений оператора (принята как данность, вердикты выставлены внутри неё):

1. Улучшения директив v1 переносятся **как инварианты** (axiom / contract / halt), не как текст.
2. v2 — полная перестройка со **stateless-роутером**; v1-скилл без v2-аналога должен быть **доказан необходимым**
   (то есть должен быть показан use-case, который нельзя закрыть улучшением v2-потока).
3. Выбор инфраструктуры/стека **детектируется из репозитория** (сегодня v2 предполагает node).
4. v1 заморожен: правки идут только в v2.

## 0. Что прогнано в RC (evidence этой сессии, read-only)

Все пять kit-аудитов зелёные (запуск `npm --prefix <rc> run <script>` — `cd` не использовался):

| Прогон | Результат |
|---|---|
| `npm run check:directives-fresh` (`ai/kit/check-directives-fresh.ts`) | `✓ ai/directives/** matches a fresh rebuild.` — сборка не устарела |
| `npm run audit:axioms` (`audit-axiom-activation.mjs`) | `✓ axiom-activation audit clean — 28 template(s) checked.` |
| `npm run audit:contracts` (`audit-contract-activation.mjs`) | `✓ contract-activation audit clean — 28 template(s) + 33 assembled directive(s) checked.` |
| `npm run audit:halts` (`audit-halt-activation.mjs` + `audit-halt-fragments.mjs`) | `✓ halt-activation audit clean — 33 template(s) + 33 assembled directive(s) checked.` |
| `npm run check:directive-budgets` (`step-budget-gate.ts`) | `✓ every lazy directive under ai/directives/sdd-v2/** is within budget.` |
| `ai/kit/__tests__/*.test.ts` (14 файлов) | **185 тестов: 184 pass, 0 fail, 1 skipped** |
| `cli/__tests__/directive-tool-contract/directive-tool-contract.test.ts` | **45 тестов: 45 pass, 0 fail** (6 сюит) |

Важная методическая заметка для следующих прогонов: **все три kit-скрипта и часть kit-тестов
позиционно зависят от cwd**. Запущенные из чужого cwd, `ai/kit/__tests__/build-directives.test.ts`,
`delta-assembly.test.ts` и `skeleton-package-binding.guard.test.ts` дают 3 ложных FAIL
(`resolveAssemblyMode('sdd-v2/audit.directive.xml')` возвращает `monolith` вместо `lazy`, потому что
`ai/kit/assembly-manifest.json` резолвится от cwd). При cwd = корень RC — всё зелено. Это не баг
самих директив, но это ловушка для CI и для аудитора: **тест, который врёт от смены cwd, не является
замком.** См. задачу T-B6-09.

**Главный структурный факт трека.** В RC **нет каталога `scripts/__tests__/`** вообще. Все четыре
контрактных теста MAIN, которые фиксировали инварианты директив v1, физически отсутствуют:

| MAIN-тест | кейсов | в RC |
|---|---|---|
| `scripts/__tests__/critic-directive-contract.test.ts` | 5 | нет |
| `scripts/__tests__/directive-markup-contract.test.ts` | 1 | нет |
| `scripts/__tests__/sdd-adaptive-execution-contract.test.ts` | 6 | нет |
| `scripts/__tests__/sdd-review-lifecycle-contract.test.ts` | 24 | нет |

Замена в v2 — `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` (16 кейсов в 3 сюитах:
`stateless SDD entry contract` · `two artifact approval boundaries` · `stateless execution and
specification format`) + `cli/__tests__/directive-tool-contract/**` (45 кейсов) + 4 kit-аудита.
Пересечение по смыслу — частичное: новые замки держат **statelessness, границы утверждений и
вызываемость инструментов**, но ни один из 36 старых кейсов не перенесён как таковой.

---

## 1. Инварианты директив v1 → v2

Формат строки: инвариант сформулирован как **проверяемое утверждение**; затем носитель в v2 с
`file:line`; вердикт; чем замкнуть.

Вердикты: **ЕСТЬ** · **ЧАСТИЧНО** · **НЕТ** · **НЕПРИМЕНИМО** (модель v2 устранила предмет).

### 1.1 D1 — операторские аксиомы диалога во всех SDD-директивах

**Инвариант.** Каждая директива, которая пишет оператору, несёт (сама или наследует от ядра)
`AX_OPERATOR_DIALOGUE_STYLE`, `AX_NO_PROCESS_NARRATION`, `AX_PROGRESSIVE_DISCLOSURE`,
`AX_DIVERGE_BEFORE_RECOMMEND`; протоколы интервью / критика / визуального словаря существуют
как отдельные загружаемые файлы.

**v1.** Аксиомы дублированы в 7 директивах (`discovery.directive.xml:220,256,274,288`;
`module-decomposition.directive.xml:238,265,283,297`; `scaffold.directive.xml:319,346,360`;
`critic.directive.xml:41`; `fix.directive.xml:144,180,194`; `setup.directive.xml:92,119`;
`phase-execution-protocol.xml:201,228`; `svelte-ui-discovery.directive.xml:106,153,171,185`).
Протоколы: `critic-protocol.xml`, `interview-protocol.xml`, `visual-vocabulary.xml`.

**v2.** Единственное определение — в ядре роутера, остальные наследуют через delta-assembly:
- `ai/directives/sdd-v2/router.directive.xml:8` `AX_OPERATOR_LANGUAGE`, `:68` `AX_OPERATOR_DIALOGUE_STYLE`,
  `:109` `AX_DIALOGUE_DISCIPLINE`, `:120` `AX_OPERATOR_SAFEGUARD`, `:129` `AX_NO_PROCESS_NARRATION`,
  `:135` `AX_OPERATOR_OUTPUT_LIVE_TEXT`, `:141` `AX_DIVERGE_BEFORE_RECOMMEND`, `:158` `AX_SCALE_PROPORTIONAL_DEPTH`.
- Наследование печатается явно: `compression.directive.xml:18`
  «Inherited from the loading directive (already in context): AX_DIALOGUE_DISCIPLINE, AX_EVIDENCE_HYGIENE,
  AX_NO_PROCESS_NARRATION, AX_OPERATOR_LANGUAGE, AX_OPERATOR_SAFEGUARD, …».
- Директивы, загружаемые **вне** роутера (skill → директива напрямую), несут полные копии:
  `audit.directive.xml:27,89`, `code-review.directive.xml:25,87` — это правило класса 1/3 в
  `ai/kit/delta-assembly.ts`, и оно правильное: `sdd-audit`/`sdd-code-review` роутер не проходят.
- Протоколы: `interview-protocol.directive.xml` (447 LOC), `critic-protocol.directive.xml`,
  `formats/diagram-vocabulary.xml` (портирован из `visual-vocabulary.xml`, о чём сказано в его
  `<Mission>`: «ported from the field-tested `messenger` `visual-vocabulary.xml`»).

**Вердикт: ЕСТЬ** — и лучше v1: одно определение вместо восьми копий.

**Замок в v2.** `ai/kit/__tests__/deps.test.ts` уже держит половину: «router exposes a non-trivial
core» + на каждый файл «every declared dep is in the router core». Не хватает обратной проверки:
«каждый **operator-facing** владелец (директива с `ChatOutput`/`Ask`/декартой) либо определяет, либо
объявляет в `deps=` весь набор conduct-аксиом». Добавить кейс в `deps.test.ts` со списком
`REQUIRED_CONDUCT = [AX_OPERATOR_DIALOGUE_STYLE, AX_NO_PROCESS_NARRATION, AX_PROGRESSIVE_DISCLOSURE,
AX_DIVERGE_BEFORE_RECOMMEND, AX_READER_WITHOUT_SESSION_CONTEXT]`.

### 1.2 D2 — директивы это HTML-like prompt markup, а не XML

**Инвариант.** В корневом руководстве агента объявлено, что `ai/directives/**/*.xml` — prompt
markup, а не XML-документы; XML-валидатор к ним не применяется.

**v1.** `AGENTS.md:1-11` — блок «## Directive markup — mandatory» стоит **первым**, до описания
проекта: «Файлы `ai/directives/**/*.xml` … — **HTML-like prompt markup, а не XML-документы**»,
«Не запускай XML parser/validator (`xmllint` и аналоги)». Замок: `directive-markup-contract.test.ts`
(«defines directives as HTML-like prompt text at the start of AGENTS.md»).

**v2.** В `AGENTS.md` RC этого блока **нет** (`grep 'HTML-like\|prompt markup\|xmllint' AGENTS.md` → 0);
`AGENTS.md:1-5` начинается сразу с «## Project description». Факт выжил только в
`ai/kit/AUTHORING.md:8` — «Файлы `.xml` — **не XML**: тело markdown, ничего не экранируется
(`&`, `<`, `>` пишем как есть)», то есть в документе для автора **шаблонов**, который агент,
работающий с проектом, не читает. Тест-замка нет.

**Вердикт: ЧАСТИЧНО** (правило существует, но переехало в файл не того адресата и потеряло замок).
Риск конкретен: агент, увидев `.xml`, тянется к `xmllint`/парсеру и «починит» экранирование —
в v2 это ломает 70 файлов, потому что `<`/`>` в текстах таблиц не экранированы.

**Замок в v2.** Перенести блок в `AGENTS.md` RC (первым разделом) и добавить в
`ai/kit/__tests__/` кейс «AGENTS.md declares directive markup as prompt text before the project
description» + «no repository script invokes an XML validator over ai/directives» (grep по
`scripts/`, `package.json`, `.github/workflows/`).

### 1.3 D3 / PR #8 — граница критика

Пять отдельных инвариантов; в v2 предмет частично устранён сознательно.

| # | Инвариант (проверяемо) | v1 | v2 | Вердикт |
|---|---|---|---|---|
| D3.1 | Критик — read-only: он не редактирует артефакт и не пишет журнал раундов | `critic-protocol.xml:10`; `critic.directive.xml:10` (`AX_ISOLATION_SIGNAL`) | `critic-protocol.directive.xml:5` `AX_READ_ONLY` «NEVER edit files — orchestrator applies edits»; `critic.directive.xml:61-62` «Never edit, never persist a round journal, never ask to continue the same reviewer» | **ЕСТЬ** (усилено) |
| D3.2 | `CLEAN` терминален на любом раунде — минимума раундов нет | `critic.directive.xml:4-27` | `critic.directive.xml:59` «Return literal `CLEAN` or findings ordered by severity»; `critic-protocol.directive.xml:17` | **ЕСТЬ**, но по другой причине: в v2 раундов нет вообще — вызов один |
| D3.3 | Блокирующая находка обязана сослаться на существующее требование и предъявить evidence (`AX_FINDING_EVIDENCE` / `AX_DEFAULT_ACCEPT`) | `critic.directive.xml:81-85` | `critic.directive.xml:59-61` «Each finding names artifact, anchor, violated requirement/invariant, concrete contradiction or omission, and a bounded remediation»; `critic-protocol.directive.xml:17` | **ЕСТЬ** (как требование формата), **НЕТ** в части `AX_DEFAULT_ACCEPT` («сомнение → принять») — `ai/kit/axiom/critic/ax-default-accept.xml` существует и **не собран ни в один шаблон** |
| D3.4 | Непонимание триажируется (`ARTIFACT_GAP` / `CONTEXT_MISSING` / `NON_BLOCKING_QUESTION`), а не превращается в работу | `critic.directive.xml:81-85` | `critic-protocol.directive.xml:4` «Confusion → underspecification, not a question to ask»; `:7` `AX_UNCERTAINTY_IS_SIGNAL`; `critic.directive.xml:61` «Separate unknown external facts from defects» | **ЧАСТИЧНО**: бинарное «непонимание = underspecification» вместо трёхчленного триажа; `ai/kit/axiom/critic/ax-confusion-bug.xml` не собран |
| D3.5 | Пять раундов — аварийный предел (`AX_CAP_5`) | `critic.directive.xml:4-27`; `docs/sdd-flow.md` сценарий 6: «`5 раундов и не CLEAN` → ⛔ MAX_ROUNDS» | `ai/kit/axiom/process/ax-cap-5.xml` существует (7 строк, вплоть до правил «CLEAN недоступен, если раунд внёс правки»), **но `grep AX_CAP_5 ai/directives/sdd-v2` → 0** | **НЕТ** |
| D3.6 | `Polish: off` по умолчанию — мелочи не гонят цикл | `critic.directive.xml:169` | `ai/kit/axiom/critic/ax-polish-mode.xml` не собран; в v2 нигде | **НЕТ** |
| D3.7 | Критик получает ТОЛЬКО артефакт + родительскую спеку (`AX_ISOLATION_SIGNAL`) | `critic-protocol.xml:10` | `critic-protocol.directive.xml:4` `AX_ISOLATION` — расширено: bounded target-set + minimal parent + Vision/Goals соседей через `npx gennady sdd-extract <dep> VISION` | **ЕСТЬ** (сознательно расширено; см. §1.11 про #21) |

**D3.5 — где именно инвариант нужен в v2.** Довод «в v2 критик одноразовый, значит капа не нужна»
верен для скилла `sdd-critic` (`ai/skills/sdd-critic/SKILL.md:9` прямо: «Do not maintain a durable
critic session, automatic five-round loop, or hidden write state»), но **не** для authoring-потока:
`ai/directives/sdd-v2/review-lifecycle.directive.xml:45-55` STEP_3_RECONCILE говорит «Any semantic
edit resets the applicable approval markers to `pending` and therefore requires one fresh STEP_2
review of the new complete target» — то есть цикл STEP_2 ⇄ STEP_3 существует и **ничем не ограничен**.
Ограничен только размер порции: `:34` и `:52` «at most five evidence-backed findings» — это кап на
findings, не на раунды. Практика v1 подтверждает нужду: `messenger`
`tasks/vkt-messenger/provider-v1/provider-v1.task-135.md:369` — «orchestrator accepts this state as
final; hard cap on further automated audit rounds reached».

**Замок в v2.** (а) Включить `{{> "axiom/process/ax-cap-5"}}` в
`ai/kit/templates/sdd-v2/review-lifecycle.directive.hbs` и сослаться на `AX_CAP_5` в STEP_3
(иначе `audit:axioms` не пропустит — он требует ссылку в `ExecutionPlan`). (б) Кейс в
`stateless-sdd-flow-contract.test.ts`, сюита `two artifact approval boundaries`: «bounds the
review⇄reconcile cycle» — rendered `review-lifecycle.directive.xml` содержит `AX_CAP_5` и явную
диспозицию оператора на N-м результате. (в) `ax-default-accept` и `ax-polish-mode` — собрать в
`critic-protocol.directive.hbs` (обе — прямая экономия раундов).

### 1.4 D4 — вердикт аудита вычисляется, а не судится

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| D4.1 | Статус вычисляется из severity по таблице «first matching row wins», и агент печатает, какая строка сработала | `audit/steps/STEP_3_ROUTE.xml:24-36` — три буллета `PASS` / `PASS_RISK` / `FAIL` с точными условиями; **таблицы и требования «print which row matched» нет** | **ЧАСТИЧНО** |
| D4.2 | Три статуса: `PASS` / `PASS_WITH_ACKNOWLEDGED_RISKS` / `FAIL` | `audit/steps/STEP_3_ROUTE.xml:16,27,121`; `execute.directive.xml:136` (`📊 Final: ✅ PASS | ⚠️ PASS_WITH_ACKNOWLEDGED_RISKS | ❌ FAIL`) | **ЕСТЬ** |
| D4.3 | `PASS_WITH_ACKNOWLEDGED_RISKS` требует **прежнего** решения оператора + запись в Decision Log; изолированный аудитор не выдаёт его сам | `audit/steps/STEP_3_ROUTE.xml:16-24` — «never this subagent's own judgment call — it is a fact-check against a PRIOR operator acceptance» | **ЕСТЬ** (сильнее v1: механика liveness-проверки Decision Log описана) |
| D4.4 | `LOW` confidence никогда не даёт `FAIL`, не открывает раунд и не авторизует правку; остаётся `INFO` | v1 `audit.directive.xml:98-104`. В v2 — **нет**: `conf=<H|M|L>` выжил только как поле формата (`code-review.directive.xml:248`, `formats/audit-round.xml:15`); правило отсутствует. `ai/kit/axiom/audit/ax-severity-tagging.xml` — снимок **до** этого улучшения (13 строк против 40+ в v1) | **НЕТ** |
| D4.5 | Определения `MAJOR`/`MINOR` привязаны к «делает ли расхождение поведение/область/владение/верификацию неоднозначным или недоказуемым», а не к «код/проза» | v1 `audit.directive.xml:105-113`. v2 `ai/kit/axiom/audit/ax-severity-tagging.xml:8-9`: `MAJOR` = «protocol violation», `MINOR` = «stylistic or secondary discrepancy» — **старая, огрублённая формулировка** | **НЕТ** |
| D4.6 | Заявленный результат верификации без исполненного evidence = `MAJOR` (не «бумажный дрейф») | v1 `audit.directive.xml:114-115`. v2 — нет в `ax-severity-tagging`; частично компенсировано `audit/steps/STEP_1_MECHANICAL.xml:68` «re-derive the gate yourself rather than trust the worker's logged `ver` lines» | **ЧАСТИЧНО** |
| D4.7 | Находки уровня проекта (`RULE_FILE_INCOMPLETE` и любые «не принадлежит ни одной фазе») входят в таблицу вердикта **capped at MINOR** и маршрутизируются в `rule-file-fix`, никогда не в FAIL этой задачи | v1 `audit.directive.xml:85,125,137,155,164`. В v2: `grep 'RULE_FILE_INCOMPLETE\|rule-file-fix\|capped at' ai/directives/sdd-v2` → **0**; `ai/kit/axiom/audit/ax-finding-routing.xml` (собран в `audit.directive.xml:173`) содержит 13 строк маршрутизации, но строки `RULE_FILE_INCOMPLETE` в нём нет | **НЕТ** |

**Итог D4: ЧАСТИЧНО.** Каркас (три статуса, вычисление, liveness Decision Log) перенесён и в части
D4.3 сделан лучше. Потеряны ровно те четыре правила, которые в v1 были добыты болью: кап `LOW`,
семантическое определение `MAJOR`, «заявленное ≠ доказанное = MAJOR» и кап проектных находок.
Механизм потери один и тот же: **аксиомы в `ai/kit/axiom/audit/` — это снимки v1-текста, взятые до
коммитов `ac2e9d73 cd7f3e01 139448e3`**, о чём честно написано в первой строке каждого файла
(`<!-- source: ai/directives/sdd/audit.directive.xml -->`).

**Замок.** Дописать `ai/kit/axiom/audit/ax-severity-tagging.xml` до v1-состояния (таблица вычисления +
confidence-правило + кап проектных находок), вернуть `RULE_FILE_INCOMPLETE`/`rule-file-fix` в
`ax-finding-routing.xml` и `ax-drift-taxonomy.xml`; кейс в `stateless-sdd-flow-contract.test.ts`:
rendered `audit/steps/STEP_3_ROUTE.xml` содержит правило «LOW never causes FAIL» и «project-scope
finding enters capped at MINOR».

### 1.5 D5 — механическая правда и независимая нумерация аудита

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| D5.1 | Механическая часть аудита читается из `sdd-check`, а не переоткрывается глазами | `audit/steps/STEP_1_MECHANICAL.xml` целиком; 8 обязательных `<ToolCall>` (`sdd-task --group-scope`, `--task-scope`, `sdd-check --task`, `sdd-check --all .`, `sdd-check --changed .`, `sdd-verify --profile full`, `lint --include-tests --spec=`, `lint --spec=`); `:80` «PASS is never the verdict when any gate is red». Аксиом `AX_MECHANICAL_VIA_SDD_CHECK` собран **инлайном в шаблоне** (`ai/kit/templates/sdd-v2/audit.directive.hbs:32` → rendered `audit/steps/STEP_1_MECHANICAL.xml:105`), в обход библиотечной копии `ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml` — два дома у одного id (см. §4.4 п.5) | **ЕСТЬ** |
| D5.2 | Раунды аудита нумеруются независимо от раундов исполнения; заголовок `### Audit Round N — <date>, after Execution Round M` | `ai/directives/sdd-v2/formats/audit-round.xml:13` (shape) и `:39` «`N` increments monotonically across the ticket's lifetime, **independent of Execution Round numbers**» | **ЕСТЬ** |
| D5.3 | Audit Rounds — append-only; прошлые раунды неизменяемы | `formats/audit-round.xml:37` | **ЕСТЬ** |
| D5.4 | PASS без reopen не пишется в тикет (эфемерность) | `formats/audit-round.xml:38`; `audit/steps/STEP_3_ROUTE.xml:61` `AX_EPHEMERAL_OUTPUT` | **ЕСТЬ** |
| D5.5 | `Reopens` в Meta выводится из **персистентной причинности аудита** (`@audit … triggered-reopen != none`), а не из подсчёта заголовков `### Round` | Формат поле есть: `formats/audit-round.xml:15` `triggered-reopen=<Round-M+1|none>`. Но: `grep -rn 'REOPENS\|triggered-reopen' shared/sdd/*.ts cli/cmd/sdd-check/*.ts` → **0** — механической проверки `[REOPENS]` в v2 не существует; и аудитная проверка тоже мертва, потому что `ai/kit/axiom/audit/ax-stale-after-pivot-verification.xml` (единственное место, где живёт строка «Reopens counter incremented since pivot date → `MAJOR`») **не собран ни в один шаблон** | **ЧАСТИЧНО** (формат перенесён, обе проверки — механическая и аудитная — отсутствуют) |
| D5.6 | `EXECUTION_LOG_INCOMPLETE` ловит и запись **после** закрытия раунда | v1 `audit.directive.xml:82`; в v2 таксономия дрейфа — `ai/kit/axiom/audit/ax-drift-taxonomy.xml`, собран в `audit/steps/STEP_2_SEMANTIC.xml`; post-close — в `shared/sdd/check.ts` (см. трек CHECK-LOG) | **ЕСТЬ** (вне этого трека) |

**Замок.** `cli/cmd/sdd-check/__tests__` — кейс `[REOPENS]`: тикет с `## Audit Rounds` и
`triggered-reopen=Round-2`, Meta `Reopens: 0` → finding; Meta `Reopens: 1` → чисто. Плюс собрать
`ax-stale-after-pivot-verification` в `audit.directive.hbs` (это же закрывает висячую ссылку
из четырёх мест, §4.1).

### 1.6 D6 / `8bb38477` — SSOT по ссылке

**Инвариант.** Канонический факт живёт в спеке в одном месте; тикет ссылается на него якорем и
никогда не переписывает литерал. В BDD ожидаемый результат — **ссылка** на якорь спеки, а конкретные
входные данные в `Given` остаются литералами. Аудит выдаёт advisory `INFO` `dangling-spec-ref`, если
якорь не резолвится (только структурно — сравнивать нечего, копии по определению нет).

**v1.** `scaffold.directive.xml:136-145` (`AX_TICKET_HAS_BDD_AND_TESTS`, буллет
«A scenario's expected outcome REFERENCES the spec's canonical fact by anchor … Concrete input
instances in `Given` stay literal»), `:267` (`AX_SSOT_TRACEABILITY` в обобщённой формулировке),
`audit.directive.xml:281` (`dangling-spec-ref`).

**v2.**
- Общая идея есть, но в короткой формулировке: `ai/directives/sdd-v2/scaffold.directive.xml:154`
  и `formats/task-ticket-structure.xml:9` — «Spec content is referenced, never copied
  (`AX_SSOT_TRACEABILITY`)».
- **Сам аксиом не собран**: `ai/kit/axiom/boundary/ax-ssot-traceability.xml` — 4-строчный снимок
  **до** `8bb38477` («The spec is the single source for contract content; a ticket carries
  references, never copies») и `grep '<Axiom id="AX_SSOT_TRACEABILITY"' ai/directives` → 0. То есть
  в двух местах v2 ссылается на идентификатор, определения которого в контексте нет (см. §4.1).
- **BDD-правило отсутствует**: `ai/kit/axiom/scaffold/ax-ticket-has-bdd-and-tests.xml` — форк,
  который получил новые v2-буллеты (`Role=probe`, `:: command \`npm run <script>\``,
  `AX_CONTRACTS_TEXTUAL_AGNOSTIC`), но **потерял** буллет про ссылку по якорю и литеральный `Given`.
- `dangling-spec-ref` в v2 нет (`grep` → 0). Частичная замена — `SDD_SPEC_LINK_BROKEN`-класс
  проверок в `shared/sdd/check.ts` (проверяет ссылки между спеками, не якоря из тикета в спеку).

**Вердикт: ЧАСТИЧНО** — идея названа, оба конкретных механизма (BDD-правило и advisory на
неразрешённый якорь) не перенесены, а несущий аксиом висит.

**Замок.** Обновить `ax-ssot-traceability.xml` до v1-текста и собрать его в
`scaffold.directive.hbs`; вернуть буллет в `ax-ticket-has-bdd-and-tests.xml`; кейс в
`stateless-sdd-flow-contract.test.ts` («ticket BDD references spec facts by anchor and keeps Given
literals»).

### 1.7 D7 / PR #14 — граница фазового агента

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| D7.1 | Фаза пишет только в свои `Target Files`; тикет — состояние оркестратора, не Target File | `phase-execution-protocol/steps/STEP_1_ORIENT.xml:20-25` `AX_PHASE_SCOPE_LOCK`, включая tombstones `Deleted Files` и «The one permitted ticket mutation is the receipt written atomically by the exact `sdd-verify …` command» → иначе `H_OUT_OF_PHASE_WRITE` | **ЕСТЬ** (усилено v2) |
| D7.2 | **ERROR OWNERSHIP:** repo-wide гейт, упавший внутри `Target Files` ДРУГОЙ фазы, — работа той фазы: не писать туда, не считать решённым, не считать своим блокером; записать в Handoff `open:` и продолжить. Везде остальное — твоё, включая файл, который ты не открывал, но чью сборку сломал твой дифф | v1 `phase-execution-protocol.xml:39` (второй абзац `AX_PHASE_SCOPE_LOCK`). В v2 `ai/kit/axiom/process/ax-phase-scope-lock.xml` этого абзаца **нет** совсем | **НЕТ** |
| D7.3 | Разрешённые bash-команды фазы перечислены явно; `git` (любая подкоманда), `npm run lint/format`, prettier, project-wide сканы — запрещены | `ai/kit/axiom/process/ax-permitted-bash-commands.xml` существует (55 строк, переписан для v2: git-чтения допустимы, когда шаг «names a real gap»; temp только в `.claude/tmp/`), **но `grep -rn 'permitted-bash' ai/kit/templates/` → 0** — не собран, при 4 ссылках на `AX_PERMITTED_BASH_COMMANDS` из rendered-дерева | **НЕТ** (висячая ссылка) |
| D7.4 | Эскалация вместо импровизации: типизированный `BLOCKED` c evidence и одним из `RECOVERABLE_TECHNICAL` / `SPEC_GOAL_CONFLICT` / `EXTERNAL_AUTHORITY_REQUIRED` | `ai/kit/axiom/process/ax-blocker-escalation.xml` существует, **не собран** (`grep AX_BLOCKER_ESCALATION ai/directives/sdd-v2` → 0). Скелет `phase-execution-protocol.directive.xml` вообще **без `<HaltConditions>`**. Частичная замена на уровне оркестратора: `execute.directive.xml:166` `H_PHASE_BLOCKED` («Worker names a concrete missing external decision/capability after bounded diagnosis») и `:234` | **ЧАСТИЧНО**: у оркестратора условие есть, у самого worker'а — ни аксиома, ни halt, ни типизации причины |
| D7.5 | Типизированный Handoff по `HANDOFF_FORMAT`; free-form запрещён | `phase-execution-protocol/steps/STEP_4_HANDOFF.xml:14-32` `AX_HANDOFF_TYPED` + `HANDOFF_FORMAT` (`artifacts` / `decisions` / `open` / `deviations`) | **ЕСТЬ** (+ новое поле `deviations`) |
| D7.6 | Проверка перед Handoff обязательна и принадлежит инструменту, а не агенту | `phase-execution-protocol/steps/STEP_3_VERIFY.xml:14-31` `AX_VERIFICATION_BEFORE_HANDOFF` — включая правило «канон покрывает **тело** скрипта, не только имя в §5» | **ЕСТЬ** (сильнее v1) |

**D7.3 дополнение (важно для трека VERIFY).** `ax-permitted-bash-commands.xml:51-54` — «Ticket §5
commands are **not** a phase-agent exemption». То есть даже если бы аксиом собрался, Swift/Go-тикет
с `xcodebuild`/`go test` в §5 фаза сама прогнать не может. Плюс `ai/kit/audit-halt-activation.mjs:138`
несёт уже неверный комментарий «review-lifecycle.directive.hbs includes
`axiom/process/ax-permitted-bash-commands`» — в самом шаблоне подключены четыре других аксиома.

**Замок.** (а) Вернуть абзац ERROR OWNERSHIP в `ax-phase-scope-lock.xml`. (б) Собрать
`ax-permitted-bash-commands` и `ax-blocker-escalation` в `phase-execution-protocol.directive.hbs`,
объявить `H_BLOCKED` в `<HaltConditions>` скелета (иначе `audit:halts` упадёт — и это хорошо).
(в) Кейс в `stateless-sdd-flow-contract.test.ts`, сюита `stateless execution and specification
format`: «bounds a phase worker's failure ownership and permitted commands» — rendered
`STEP_1_ORIENT.xml` содержит правило про чужие Target Files, rendered `STEP_3_VERIFY.xml` содержит
определение `AX_PERMITTED_BASH_COMMANDS`, а не только ссылку.

### 1.8 D8 — Task-ID, reopen-формат, «Round close ≠ DONE», наследование модели

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| D8.1 | Task-ID глобально уникален | `scaffold/steps/STEP_2_MATERIALIZE.xml:13,31` `AX_TASK_ID_UNIQUENESS` | **ЕСТЬ** |
| D8.2 | Формат Task-ID `TSK-{PREFIX}-{NNN}` из счётчика README каталога (legacy `TSK-NN` валиден) | В v2 ID выдаёт `sdd-new`, а формат в директиве упомянут только как элемент словаря (`scaffold.directive.xml:48` «IDs (`<ACR>-DL-N` / `TSK-NN` / `F-NNN` / `P<N>` / `H_*`)»); генерация — `shared/sdd/templates.ts` (`<ACR>-<slug>`, `formats/scope-tasks-index.xml:33`) | **НЕПРИМЕНИМО**: v2 сменил схему ID (`<ACR>-<slug>`), инвариант заменён на «ID выдаёт CLI, а не агент» — что сильнее. Замок — `directive-tool-contract` («scaffold exhaustively maps every legal DAG owner to one exact ticket call») |
| D8.3 | Reopen = **добавленный** Round; прошлые раунды не редактируются; Meta Status → `[ ] TODO`; `Reopens` обновляется; трекеры синхронизируются | `ai/kit/axiom/process/ax-reopen-format.xml`, собран в `reconcile.directive.xml:96`, применён `:192,249` | **ЕСТЬ** |
| D8.4 | Round close ≠ DONE: аудит — отдельный хук после закрытия раунда | `ai/kit/axiom/process/ax-audit-hook.xml` — **не собран**; при этом на `AX_AUDIT_HOOK` ссылаются 5 мест (`audit.directive.xml:8`, `audit/steps/STEP_1_MECHANICAL.xml:86`, `code-review.directive.xml:6`, `execute.directive.xml:60`, `scaffold/steps/STEP_1_DERIVE.xml:31`). Поведенчески правило реализовано жёстче v1: `execute.directive.xml` STEP_5 закрывает раунд и синхронизирует трекеры, STEP_6 диспатчит аудит по **группе** и требует receipt, STEP_7 не закрывает группу без `SDD_GROUP_AUDIT_MISSING`/`SDD_GROUP_REVIEW_MISSING` чистыми | **ЧАСТИЧНО** (поведение есть и лучше; несущий аксиом висит) |
| D8.5 | Модель, сконфигурированная оператором, наследуется каждым свежим reviewer/executor | v1 `scaffold.directive.xml:443` + `sdd-review-lifecycle-contract` «inherits the configured model for every fresh reviewer and executor». В v2: `ai/kit/axiom/critic/ax-critic-model-tier.xml` **не собран**; в rendered-дереве упоминаний модели нет; `execute.directive.xml:183` прямо говорит «Model session identity is …» (не участвует в решении) | **НЕПРИМЕНИМО** по решению v2 (stateless: идентичность сессии/модели не является состоянием). Но issue #9.5 («захардкоженные `model:` в dispatch-промптах») этим не закрыт: он теперь просто нигде не адресован |

### 1.9 D9 — языковой проход при записи спеки

**Инвариант.** Спека не считается «написанной», пока её язык не проверен: перед финальной карточкой
решения выполняется lang-проход по только что записанному файлу; при отсутствии
`ai/directives/language/` проход всё равно выполняется, калиброванный `AX_OPERATOR_DIALOGUE_STYLE`
(«требование к языку никогда не деградирует, деградирует только источник калибровки»);
никогда не пропускается и не предлагается как опция.

**v1.** `discovery.directive.xml:320-333` и `module-decomposition.directive.xml:327` —
`AX_LANG_PASS_ON_WRITE`; применение `discovery:502` шаг 3, `module-decomposition:545` шаг 7.

**v2.** `AX_LANG_PASS_ON_WRITE` не существует; `ai/directives/language/` в RC нет.
Замена по духу — `ai/kit/axiom/process/ax-artifact-style-self-check.xml`
(«Before writing any operator-facing artifact, recall the language rules … This is the author's own
pass, done in the moment of writing»). Собрана в 4 директивы: `infra.directive.xml:207`,
`discover-from-code.directive.xml:37`, `interface.directive.xml`, `recover-from-code.directive.xml`.

**Дыра точно в тех двух местах, откуда инвариант пришёл.** Прямые аналоги v1-`discovery` и
v1-`module-decomposition` — это `scope.directive.xml` и `module.directive.xml`, и они
`AX_ARTIFACT_STYLE_SELF_CHECK` **не несут**: оба объявляют `<BeliefState deps="AX_TOOL_INVOCATION">`
(`scope.directive.xml:8`, `module.directive.xml:8`) — единственную зависимость, — а в ядре роутера
этого аксиома нет (`grep AX_ARTIFACT_STYLE_SELF_CHECK router.directive.xml` → 0). При этом именно эти
два владельца делают единственный whole-document `Write` спеки (`scope.directive.xml:74-86`
STEP_2_FILL).

**Вердикт: ЧАСТИЧНО** — замена есть, но не подключена к двум владельцам, которые пишут спеки
продукта и модулей.

**Замок.** Добавить `AX_ARTIFACT_STYLE_SELF_CHECK` в `deps=` (или в ядро роутера) и сослаться в
STEP_2_FILL `scope`/`module`; кейс в `deps.test.ts`: «every directive that performs a whole-document
Write carries the style self-check».

### 1.10 PR #14 — адаптивное исполнение (шесть поведений)

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| 14.1 | **Provable-progress repeat**: повтор эквивалентного блокирующего набора находок, когда свежий аудит не дал ни нового evidence, ни другой in-scope remediation, → `BLOCKED`, а не ещё один раунд | v1 `ai/skills/sdd-execute/SKILL.md:186-188,281`. В v2 — `grep 'no new evidence\|same finding\|no-progress' ai/directives/sdd-v2/execute.directive.xml` → **0**. Ближайшее: `execute.directive.xml:166` `H_REAL_GATE_RED` — «A declared real verification command remains red after **one** evidence-based correction» (кап на гейт, не на находки); STEP_6 «Rerun affected real gates after correction» — без капа и без детекции непрогресса | **НЕТ** |
| 14.2 | Runtime-утверждения ведомы evidence: аудит перевыводит гейт сам, а не верит логу worker'а | `audit/steps/STEP_1_MECHANICAL.xml:17` («fixed, never inferred from the dispatch prompt's wording»), `:68` («re-derive the gate yourself rather than trust the worker's logged `ver` lines») | **ЕСТЬ** |
| 14.3 | `[REOPENS]` определён из персистентной причинности аудита | см. D5.5 | **ЧАСТИЧНО** |
| 14.4 | Нумерация аудита независима | см. D5.2 | **ЕСТЬ** |
| 14.5 | ERROR OWNERSHIP через scope lock | см. D7.2 | **НЕТ** |
| 14.6 | **Batch = серийный планировщик** одного и того же per-task жизненного цикла; параллельные полосы задач в одном рабочем дереве **запрещены** | v1: `ai/skills/sdd-execute-batch/SKILL.md:3` («scheduling the canonical sdd-execute lifecycle for one task at a time»), `:13` («Why serial lanes: every task currently shares one working tree. Parallel task lanes would mix their …»), `:114` в списке запрещённого — «Parallel task lanes in one working tree». v2: `execute.directive.xml:103` `AX_TASK_PARALLEL` — «Same layer (no inter-dependencies) → **parallel dispatch**»; `:182-183` «parallelize only tickets with disjoint target files and no dependency relation»; то же в `ai/skills/README.md` («Параллель разрешён лишь для задач без dependency relation и с непересекающимися Target Files») | **НЕТ — регрессия**: v2 разрешил ровно то, что v1 запретил после болезненного опыта. Оговорка «disjoint Target Files» не покрывает общее рабочее дерево: `sdd-verify` снимает snapshot всего дерева (`cli/cmd/sdd-verify/help.ts:30` — «every other persistent file or directory is observed»), поэтому две параллельные фазы с непересекающимися Target Files всё равно засветят друг друга как мутацию |

**Замок 14.1.** Ввести `AX_PROVABLE_PROGRESS` (или собрать `ai/kit/axiom/process/ax-re-dispatch.xml`
+ `ax-rejection-reason.xml`, оба сейчас не собраны) и halt `H_NO_PROGRESS` в `execute.directive.hbs`;
кейс в `stateless-sdd-flow-contract.test.ts`.
**Замок 14.6.** Решение оператора (§5, Q3). Если серийность возвращается — правило в
`ax-task-parallel.xml` + кейс «batch never dispatches two tickets into one working tree
concurrently»; если параллель остаётся — обязательный worktree-на-полосу и явное правило в
`AX_TASK_PARALLEL`, иначе snapshot-механика `sdd-verify` даёт ложные VIOLATION.

### 1.11 Issue-инварианты #16 / #21 / #22 / #19

| Issue | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| **#16** | Ни один скилл и ни один dispatch-шаблон не печатает «DIRECTIVE ACTIVATED» (аксиом `AX_NO_PROCESS_NARRATION` называет эту строку первым запрещённым примером) | `grep -rn 'DIRECTIVE ACTIVATED\|Announce' <rc>/ai` → только определение аксиома: `router.directive.xml:130` и `ai/kit/axiom/process/ax-no-process-narration.xml:3`. В `ai/skills/*/SKILL.md` — ноль; `ai/skills/sdd-audit/SKILL.md:12` явно «Do not narrate directive activation». **В v1 остаётся 8 нарушителей**: `ai/skills/{sdd-discover,sdd-continue,sdd-infra,sdd-setup,sdd-fix,sdd-scaffold,sdd-module-decomposition}/SKILL.md:10-12` + `plugins/golang/skills/sdd-infra-golang/SKILL.md:110` | **ЕСТЬ в v2, без замка** |
| **#21** | Изолированный ревьюер видит согласованные конвенции владельца тикета и не переоткрывает решённое | `critic-protocol.directive.xml:4` `AX_ISOLATION` расширен до Vision/Goals соседей через `sdd-extract`; таксономия Verification Levels зафиксирована пакетом (`formats/task-ticket-structure.xml:43`, `scaffold.directive.xml:188` — оба буквально «subset of `contract` \| `unit` \| `integration` \| `e2e`»), что снимает конкретный кейс `[contract]`. Но конвенции в v2 переехали в `specs/3-tasks.md` и `<module>.3-tasks.md` `## Conventions` / `## Decision Log` (`formats/module-tasks-index.xml:27,30-31`), и `grep '3-tasks' critic.directive.xml critic-protocol.directive.xml` → **0** | **ЧАСТИЧНО** |
| **#22** | `decisions`/`open` в Handoff различают `measured` / `reported` / `assumed`; у `open` есть extent; аудит трактует нетегированное как `assumed` | `phase-execution-protocol/steps/STEP_4_HANDOFF.xml:18-32` — четыре поля, тегов нет. Смягчения: контекст фазы формируется механически (`sdd-task <ticket> --phase` печатает verbatim прошлые Handoff'ы), `execute.directive.xml:223-224` «Never summarize, retype, or omit». Но остальную часть dispatch-промпта («exact resolved spec/rule excerpts and current Git evidence», `:221-222`) оркестратор пишет сам — центральный пример issue не закрыт механически, только текстом | **ЧАСТИЧНО** |
| **#19** | Фаза, тестирующая guard-скрипт/CI-шаг, может создать throwaway git-репозиторий, и это названо исключением, а не нарушением | `ax-permitted-bash-commands.xml` (не собран, §1.7 D7.3): `mktemp` в списке «May run» отсутствует, мутирующий git — только шагу publish/commit, temp только в `.claude/tmp/` внутри проекта. Fixture-репозиторий запрещён трижды; исключения нет. Плюс `sdd-verify` snapshot наблюдает `.claude/tmp/**` (`cli/cmd/sdd-verify/help.ts:30`) | **НЕТ** |

### 1.12 Сводка §1

| Группа | ЕСТЬ | ЧАСТИЧНО | НЕТ | НЕПРИМЕНИМО |
|---|---|---|---|---|
| D1 D2 | 1 | 1 | 0 | 0 |
| D3 (7 подпунктов) | 3 | 2 | 2 | 0 |
| D4 (7) | 2 | 2 | 3 | 0 |
| D5 (6) | 5 | 1 | 0 | 0 |
| D6 | 0 | 1 | 0 | 0 |
| D7 (6) | 3 | 1 | 2 | 0 |
| D8 (5) | 2 | 1 | 0 | 2 |
| D9 | 0 | 1 | 0 | 0 |
| PR #14 (6) | 2 | 1 | 3 | 0 |
| #16 #21 #22 #19 | 1 | 2 | 1 | 0 |
| **Итого (46 проверяемых утверждений)** | **19** | **13** | **11** | **2** |

Одна причина объясняет большинство «НЕТ»: **аксиомы в `ai/kit/axiom/**` — это снимки v1-текста,
сделанные до последних улучшений v1, плюс 88 из 180 SDD-релевантных аксиомов вообще не собираются
ни в одну директиву** (§4). Улучшение v1 не «не перенесли решением» — его перенесли в библиотеку и
не подключили к сборке, а `lint-axioms` эту направленность не проверяет.

---

## 2. Скиллы: 12 SDD-скиллов v1 + `sdd-infra-golang` × use-cases × покрытие v2

### 2.0 Основания

**Решение оператора уже записано в самом RC** — `specs/ai-skills/ai-skills.spec.md:289-290`:

> **Was:** 12 SDD-навыков, каждый — отдельная точка входа (`sdd-discover`, `sdd-continue`, `sdd-infra`,
> `sdd-module-decomposition`, `sdd-setup`, `sdd-fix`, `sdd-execute-batch` как отдельный оркестратор от
> `sdd-execute`, плюс `sdd-audit`, `sdd-check`, `sdd-scaffold`, `sdd-critic`, `sdd-execute`).
> **Now:** 9 SDD-навыков. `sdd` — единая дверь-роутер, поглотившая discover/continue/infra/
> module-decomposition/setup через LOGIC_SWITCH на state + intent. `sdd-fix` слился в `sdd-reconcile`
> как режим `mode=fix` … `sdd-execute-batch` слился в `sdd-execute` как batch-режим … Добавился
> `sdd-code-review` … и `sdd-hooks-install` (bootstrap хуков прогресса).

Фактическая раскладка RC — **8** SDD-скиллов (`ai/skills/README.md:3`: «8 SDD-навыков»):
`sdd`, `sdd-scaffold`, `sdd-execute`, `sdd-critic`, `sdd-reconcile`, `sdd-check`, `sdd-audit`,
`sdd-code-review`. **`sdd-hooks-install` в RC отсутствует** (`ls ai/skills | grep hooks` → пусто) —
то есть спека утверждает добавление скилла, которого в дереве нет: факт спеки без runtime-backing
(ровно тот класс, который `ax-runtime-backing-verification` должен ловить, а он в v2 не собран, §4.1).

Маршруты роутера (`ai/directives/sdd-v2/router.directive.xml:373-397`, «Load exactly one owner»,
первое совпадение выигрывает):

| WHEN | → владелец | строка |
|---|---|---|
| v1 AND оператор явно просит миграцию | `migration-v1-v2.directive.xml` | `:374-375` |
| forced `scaffold` | approval #1 или `H_SPEC_NOT_APPROVED`, затем `scaffold.directive.xml` | `:376-377` |
| forced `execute` OR intent `execute` | `execute.directive.xml` | `:378-379` |
| forced `critic` | `critic.directive.xml` | `:380-381` |
| forced `reconcile` | `reconcile.directive.xml` | `:382-383` |
| intent `project-setup` | `root.directive.xml` | `:384-385` |
| intent `recover-from-code` | `discover-from-code.directive.xml` | `:386-387` |
| intent `module-decomposition` | `module.directive.xml` | `:388-389` |
| {new-scope, evolve-scope, multi-scope} + `infrastructure` | `infra.directive.xml` | `:390-391` |
| … + `interface` | `interface.directive.xml` | `:392-393` |
| … + {product, library} | `scope.directive.xml` | `:394-395` |
| OTHERWISE | `H_AMBIGUOUS_INTENT` | `:396` |

Словарь intent'ов — `router.directive.xml:348-349`: `project-setup · new-scope · evolve-scope ·
module-decomposition · multi-scope · recover-from-code · execute`.

**Реальное потребление (messenger, `/Users/k.lebedev/Developer/messenger`, read-only).**
16 скиллов в `.claude/skills/` (13 из gennady + локальные `lang-lint`, `run-e2e`,
`uikit-component-generate`); 341 тикет в 10 scope-каталогах. Упоминания скилла в `specs/` + `tasks/`
(в основном как provenance-штамп в Decision Log — «кто внёс это решение»):

| Скилл | упоминаний | что это доказывает |
|---|---|---|
| `sdd-execute` | 370 | ядро потока |
| **`sdd-fix`** | **228** | Decision Log-записи вида «(`sdd-fix 2026-08-14`)», «`sdd-continue → sdd-fix`», «renamed/split Round 2 (sdd-fix)», «Audit / sdd-fix без такого комментария считает branching drift'ом» — то есть `sdd-fix` реально владел и правками спек, и переоткрытием тикетов, и штампом провенанса |
| `sdd-critic` | 30 | «Verdict: NEEDS_WORK (operator-accepted, sdd-continue)» и т.п. |
| `sdd-scaffold` | 20 | |
| `sdd-check` | 17 | |
| **`sdd-continue`** | **12** | «**Recorded:** session Discovery (`sdd-continue`, **pivot**), vkt-messenger/auth, 2026-07-04», «(`sdd-continue`, **refine**), 2026-07-05», «## 6. Синтез: рекомендуемая целевая модель (вход для `sdd-continue`)» — использованы **оба** режима, и pivot фиксировался в Decision Log |
| `sdd-module-decomposition` | 5 | «`sdd-module-decomposition runtime-host-outbox` зафиксировал `applyRemote` как high-level helper» |
| **`sdd-execute-batch`** | **4** | `tasks/vkt-messenger/README.md:192` «Все 16 live-тикетов исполнены через `sdd-execute-batch`»; `chat-facets-guard-cleanup.VMEN-017.md:127` «оркестратор (`sdd-execute-batch`) решил — расширить Target …»; `outbox-read-mark-coalesce.TDRHO-010.md:207` — batch-оркестратор снял BLOCKED |
| `sdd-discover` | 1 | |
| `sdd-audit`, `sdd-setup`, `sdd-infra`, `sdd-infra-golang` | 0 | не означает «не использовались»: audit запускается внутри execute и оставляет `@audit`-записи, а setup/infra выполняются однократно и текстового следа в артефактах не оставляют |

Дополнительное свидетельство по капу критика из практики:
`tasks/vkt-messenger/provider-v1/provider-v1.task-135.md:369` — «orchestrator accepts this state as
final; **hard cap on further automated audit rounds reached**».

### 2.1 Матрица

Вердикты: **ПОКРЫТО** · **ЧАСТИЧНО** · **ГАП** (→ задача на маршрут/директиву, **не** новый скилл) ·
**НЕ НУЖНО**.

| v1-скилл | Use-case (сценарий `docs/sdd-flow.md` / messenger-evidence) | v2: маршрут + директива (`file:line`) | Вердикт |
|---|---|---|---|
| **`sdd-setup`** | Сценарий 2 (проект с нуля), 4.3: единственный владелец `specs/README.md` — Vision, Scope Graph, Scopes table; идемпотентен; bootstrap `infra-base` | intent `project-setup` → `root.directive.xml` (`router:384-385`). `root.directive.xml:3` «Owner of `specs/README.md` — the Project Portal: Vision + Scope Graph + Scopes table», `:24` `AX_PORTAL_PRIMARY_OWNER` «Other flows MUST NOT rewrite this file», `:316` STEP_3_INFRA_BOOTSTRAP (минимальная `specs/infra-base/infra-base.spec.md` с Tool Stack-таблицей), `:334-336` write/update портала | **ПОКРЫТО** — единственный дефицит в том, что `project-setup` не forced-intent: попасть можно только через классификацию свободного текста в `/sdd`. Оператор, знающий v1, наберёт `/sdd-setup` и получит «нет такого скилла» |
| **`sdd-discover`** | Сценарий 3: новая спека scope любого scope-type, greenfield | {new-scope} × scope-type → `scope.directive.xml` (`router:394-395`) / `infra.directive.xml` (`:390-391`) / `interface.directive.xml` (`:392-393`); интервью — `interview-protocol.directive.xml` (447 LOC) + 4 амплификатора | **ПОКРЫТО** |
| **`sdd-continue`** (refine) | Сценарий 4: добавить требования/контракты/инструменты в существующую спеку. messenger: «(`sdd-continue`, refine), 2026-07-05» | intent `evolve-scope` → тот же владелец. Для infra/interface режимы объявлены прямо: `infra.directive.xml:16` «Modes: greenfield · refine · pivot · rewrite», `:41` «The scope spec is a living document. In `refine` mode any section may be updated in place» | **ПОКРЫТО** для infrastructure/interface |
| **`sdd-continue`** (pivot) | Сценарий 4: **заменить архитектурное решение**, superseded-запись, Pivot Invalidation List, гарантия против переоткрытия закрытого. messenger: «(`sdd-continue`, **pivot**), vkt-messenger/auth, 2026-07-04» — 4 записи | **Для product/library — нет владельца правила.** `AX_PIVOT_REQUIRES_SUPERSESSION` собран в `infra.directive.xml:111`, `interface.directive.xml:84`, `migration-v1-v2.directive.xml:55`, `compression.directive.xml` — и **не** в `scope.directive.xml`/`module.directive.xml`. `H_REWRITE_WITH_DOWNSTREAM` («`rewrite` mode but the scope already has tickets — not v0, use `pivot`») есть только у infra `:231` и interface `:162`. «Pivot Invalidation List» — в `infra`, `interface`, `migration-v1-v2`, `formats/{pivot,product-spec,library-spec,infrastructure-spec}*` и `audit/steps/STEP_2_SEMANTIC.xml`, но **не в `scope.directive.xml`**. При этом `scope.directive.xml:57-58` предписывает «Existing specs are read in full and **replaced as a whole**» — то есть pivot продуктовой спеки в v2 = перезапись файла целиком без правила супрессии, без списка инвалидации и без защиты от уже существующих тикетов. Слот в артефакте есть (`formats/product-spec-structure.xml`), правила у владельца нет | **ГАП** → T-B6-01 |
| **`sdd-module-decomposition`** | 4.3: модульные спеки — closed-world инвентарь сущностей, публичные поверхности, DbC (Ports/Adapters/Services); режимы initial / add-module / refine-module. messenger: 5 упоминаний, модульные спеки существуют | intent `module-decomposition` → `module.directive.xml` (`router:388-389`, 130 LOC) + `formats/{module-spec-structure,entity-inventory-format,entity-surface-format,dbc-contracts,module-map-update}.xml`. `module.directive.xml:55` «Resolve initial/add/refine from disk once» | **ЧАСТИЧНО**: маршрут и форматы есть; правила закрытого мира — `AX_CLOSED_WORLD_INVENTORY`, `AX_ENTITY_SURFACE_COMPLETENESS`, `AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE`, `AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP`, `AX_REFINE_MODULE_PRESERVES_CONTRACTS`, `AX_MODULE_BOUNDARY_BY_OPERATOR`, `AX_HIERARCHICAL_SPECS`, `AX_CONTRACTS_TEXTUAL_AGNOSTIC` — **ни один не собран** (§4.1); три из них при этом **ссылаются** из rendered-форматов. `module.directive.xml` объявляет `deps="AX_TOOL_INVOCATION"` и всё → T-B6-02 |
| **`sdd-critic`** | Сценарий 6: раунды критики до CLEAN / max 5, изоляция, Polish off | forced `critic` → `critic.directive.xml` (`router:380-381`) + `critic-protocol.directive.xml`; `ai/skills/sdd-critic/SKILL.md` | **ЧАСТИЧНО**: одноразовый вызов покрыт полностью и чище v1; цикл сходимости сознательно снят у скилла, но воспроизведён без капа в `review-lifecycle.directive.xml:45-55` (§1.3 D3.5) → T-B6-03 |
| **`sdd-scaffold`** | 4.3: тикеты из спек — DAG, Cascade Table, Tracker Index, BDD, Phases Overview, per-phase Rules; approval #2 | forced `scaffold` → `scaffold.directive.xml` (`router:376-377`) + 7 step-пакетов; Cascade Table — `formats/scope-tasks-index.xml:16-22`; approval #2 — `scaffold/steps/STEP_5_OPERATOR_APPROVAL_2.xml` | **ПОКРЫТО** (форма); дефицит правил разрешения rules — см. §3 и `AX_RULES_RESOLUTION_HARD_FAIL` / `AX_RULES_CASCADE_RESOLUTION` / `AX_RULE_ACTIVATION_PLAN` / `AX_RULES_LOAD_FROM_PHASE_BLOCK` не собраны |
| **`sdd-execute`** | Сценарий 1: одна задача end-to-end; resume по ticked-фазам; PAUSED на блокерах; audit-only resume | forced `execute` → `execute.directive.xml` (`router:378-379`, 8 шагов, 13 `<ToolCall>`) + `phase-execution-protocol` (4 step-пакета) | **ПОКРЫТО** по каркасу; дыры — §1.7 (ERROR OWNERSHIP, permitted-bash, blocker-escalation) и §1.10 (provable-progress) |
| **`sdd-execute-batch`** | Сценарий 5: вся очередь с учётом зависимостей; **серийные полосы** — параллель в одном рабочем дереве запрещена (`SKILL.md:13,114`). messenger: 16 тикетов одним батчем; batch-оркестратор снимал BLOCKED | `execute.directive.xml:181-183` — «`all`/`batch`/`queue` uses every pickable ticket in DAG order per `AX_EXECUTION_ORDER`. Per `AX_TASK_PARALLEL`, parallelize only tickets with disjoint target files and no dependency relation»; `:328-334` STEP_7 refresh map → следующий pickable; `deviation-review.directive.xml` — обзор девиаций один раз после батча | **ЧАСТИЧНО**: как режим — покрыт и лучше (нет второго оркестратора, есть post-batch deviation review); но серийность полос — регрессия (§1.10 п.14.6) → T-B6-04. Отдельный скилл **НЕ НУЖЕН** |
| **`sdd-audit`** | Сценарий 7 / 4.1: аудит завершённой задачи по требованию оператора | Скилл `ai/skills/sdd-audit/SKILL.md` сохранён и осознанно **не** идёт через роутер (`:13-15` «No `sdd-state`/PREFLIGHT gate here by design … This skill is the odd one out in the family on purpose, not by omission»); режимы `per-task` / `per-group`; директива `audit.directive.xml` + 3 step-пакета | **ПОКРЫТО** (v2 добавил group-режим и receipt); содержательные дыры — §1.4 |
| **`sdd-check`** | Сценарий 9: read-only целостность дерева; механика в инструменте, а не в скилле | `ai/skills/sdd-check/SKILL.md` — «does not load a directive — the logic lives entirely in the `sdd-check` tool (`shared/sdd/check.ts`)»; `--task` / `--all`; маршрутизация правок в `/sdd-reconcile` или `/sdd-critic` | **ПОКРЫТО** |
| **`sdd-fix`** | Сценарий 7: findings (code review / `sdd-check` / audit / bug report) → классификация по владельцу → план → согласование с оператором → фиксы → reopen тикетов → dispatch execute → верификация. **messenger: 228 упоминаний** — самый нагруженный после execute | forced `reconcile` → `reconcile.directive.xml` (`router:382-383`, 408 LOC). `:1` keywords «reconcile, fix, sync-from-code, drift, spec-probe, bug-vs-spec-defect, problem-class, blast-radius, back-sync»; `:56` `AX_MODE_AUTO_DETECT_OR_HALT`, `:133` `H_AMBIGUOUS_MODE`, `:147` авто-детект `fix` vs `from-code`; `:96` `AX_REOPEN_FORMAT`, `:192,249` его применение; `:247` `<LogicSwitch on="approved remediation category">`; `:292` `<LogicSwitch on="completed remediation branch">`; `ax-dispatch-via-batch.xml` описывает передачу переоткрытых тикетов в execute как один батч (**но сам аксиом не собран**) | **ПОКРЫТО** и расширено вторым режимом `from-code`. Дефицит: `AX_DISPATCH_VIA_BATCH` (правило «reconcile не диспатчит второе ревью, execute остаётся единственным владельцем audit/code-review группы») **не собран**, хотя это ровно то правило, которое предотвращает двойной аудит → T-B6-05 |
| **`sdd-infra`** | Сценарий 8: tooling (package manager, type-checker, linter, formatter, test runner, git hooks, CI) → infra-спека с Tool Stack и Verification Commands; для Go — переадресация в `sdd-infra-golang` | scope-type `infrastructure` → `infra.directive.xml` (`router:390-391`, 621 LOC, 9592 токена — самая большая директива v2). `:75` обязательные категории `vcs, package-management, git-hooks`; `:315-320` `<LogicSwitch on="stack typicality">` (EXPRESS vs полное интервью); `:83` матчинг инструментов против `knowledge.xml` `<Triggers>`; `:405` Effective Rules per `AX_RULE_ACTIVATION` | **ЧАСТИЧНО**: категории уже стек-агностичные, но конкретные артефакты жёстко node — `:430-432` «The infrastructure scope that first installs dependencies must own Node/npm runtime artifacts (`.nvmrc`, Node fields in `package.json`, `.npmrc`)», `:406` «Every task-owned `package` row names exact `package.json, package-lock.json` Gate Artifacts» → §3 |
| **`sdd-infra-golang`** (plugin) | Сценарий 8: Go-специализация — `gennady verify --plan`, диагностика `TOOLCHAIN_MISSING` / `GOLANGCI_CONFIG_MISSING` / `NESTED_MODULES` / `CONFIG_ERROR`, `gennady.yaml` `stack.golang.{skipGates,overrideGates,extraGates}`, **FAIL vs ENV_FAIL**, «gates never mutate» (`gofmt -l`, `go mod tidy -diff`), «`./...` stops at module boundaries» | **В v2 отсутствует полностью**: нет `plugins/`, нет `gennady verify`, нет per-stack директив, нет go-правил (`ai/directives/coding/go-rules.xml` нет в RC). Единственный узел, где стек мог бы влиять, — `infra.directive.xml:315` `<LogicSwitch on="stack typicality">`, и он выбирает только **глубину интервью** | **ГАП** → §3 + T-B6-06. Как **скилл** — **НЕ НУЖЕН**: содержание делится на (а) знание о стеке → per-stack пресет/директива, (б) правила гейтов → трек VERIFY, (в) 7 «правил, выживших контакт с реальными репозиториями» → аксиомы. Ни одна часть не требует отдельной точки входа для оператора |

Не-SDD скиллы (вне трека, но для полноты ростера): `agent-inbox`, `prd-interview`,
`workspace-permission-setup` есть в обоих; `alt-opinion` есть в MAIN и **отсутствует в RC**;
`opencode-get-session` есть в RC и отсутствует в MAIN; `sdd-code-review` — новый в v2 (v1-аналога
нет: в v1 багхант был частью аудита).

### 2.2 Итог §2

| Вердикт | v1-скиллы |
|---|---|
| **ПОКРЫТО** (6) | `sdd-setup`, `sdd-discover`, `sdd-continue`(refine), `sdd-scaffold`, `sdd-execute`, `sdd-audit`, `sdd-check`, `sdd-fix` → всего 8 из 13 позиций матрицы |
| **ЧАСТИЧНО** (4) | `sdd-module-decomposition`, `sdd-critic`, `sdd-execute-batch`, `sdd-infra` |
| **ГАП** (2) | `sdd-continue`(pivot для product/library), `sdd-infra-golang` |
| **НЕ НУЖНО как отдельный скилл** (2) | `sdd-execute-batch` (режим execute), `sdd-infra-golang` (пресет + аксиомы) |

**Ни один v1-скилл не требует возвращения как скилл.** Все дефициты — это правила и маршруты внутри
v2-владельцев. Единственная эргономическая потеря: пять v1-имён (`/sdd-setup`, `/sdd-discover`,
`/sdd-continue`, `/sdd-infra`, `/sdd-module-decomposition`) больше не существуют как команды, а
`project-setup` / `new-scope` / `evolve-scope` / `module-decomposition` не являются forced-intent —
они выводятся классификацией свободного текста в `/sdd`. Дешёвая мера — не новые скиллы, а
**alias-строки в `description` скилла `sdd`** (там уже есть «"new project", "new scope", …
"module decomposition"», но нет `/sdd-setup`, `/sdd-discover`, `/sdd-continue`, `/sdd-infra`,
`/sdd-module-decomposition` и `/sdd-fix` как узнаваемых триггеров) → T-B6-07.

---

## 3. Детект инфраструктуры/стека в роутере

### 3.1 Сегодняшнее состояние (директивно-скилловая половина; движковая — B1 §4)

| Узел | `file:line` | Что есть |
|---|---|---|
| Роутер: входы preflight-гейта | `router.directive.xml:294-304` (первоисточник `ai/kit/contract/process/readiness-preflight-gate.xml:2-13`) | `LogicSwitch on="FLOW_VERSION · requested AUTHORING_SCOPE line(s) · EXECUTION_READY · GATE_QUEUE · blast radius"` — **стека среди входов нет** |
| Роутер: выбор владельца | `router.directive.xml:390-395` | «инфраструктура» выбирается по **scope-type из портала**, не по репозиторию |
| Роутер: словарь | `router.directive.xml:25-26` | единственные упоминания слова «stack» — строка русского глоссария «тулстек → Tool Stack», `:131` запрет «frame-stack talk», `:191` «Tool Stack» как имя секции. `package.json`/`npm`/`node` в роутере — **0 упоминаний** |
| Портал (артефакт) | `formats/portal-structure.xml:28` | таблица Scopes = `\| Scope \| Type \| Spec \| Description \|` — **колонки стека нет**; в примерах стек протаскивается прозой в `Description` («TS + pnpm + vitest + biome», «Node.js IMAP-сервис») |
| Портал (код) | `shared/sdd/portal.ts:12-23` | `Scope = {name, type, status, description, specPath}` — поля стека нет |
| `sdd-state` (печать) | `cli/cmd/sdd-state/sdd-state.types.ts:108-145` | `FLOW_VERSION=`, `PORTAL=`, `[READINESS]`, `READINESS=`, `EXECUTION_READY=`, `AUTHORING_SCOPE=`, `GATE_QUEUE=` — **строки `STACK=` не существует** |
| Единственная точка решения о стеке | `infra.directive.xml:315-320` `<LogicSwitch on="stack typicality">` | выбирает **только глубину интервью** (EXPRESS vs полное), не стек |
| Node-хардкод в директивах | `infra.directive.xml:406,430-432`; `readiness.directive.xml:4,106,155`; `root.directive.xml` («CODE=absent» = «пусто / только package.json»); `discover-from-code.directive.hbs`; `audit.directive.hbs` — всего 39 файлов `ai/kit/**` содержат `package.json`/`npm run` | текстовая кодировка node |
| Cascade Table (шаблон) | `formats/scope-tasks-index.xml:16-22` | `\| Tier \| coding \| testing \| architecture \| infra \|`; пример-строки — `typescript-rules`, `vitest-rules`, `eslint-setup`, `node-test`, то есть node-только |
| Реестр правил | `ai/directives/knowledge.xml` | RC: `typescript-rules svelte5-runes sveltekit-rules testing-common vitest-rules node-test playwright-cli playwright-e2e storybook-usage svelte-testing eslint-setup git-setup nodejs-npm-setup storybook-setup`. MAIN дополнительно: **`result-conventions`, `baseline-rules`, `python-rules`, `go-rules`, `baseline-testing`** + файлы `ai/directives/coding/{baseline,go,python,result-conventions}-rules.xml`, которых в RC **физически нет** |
| Единственная мультистековая таблица детекта в RC | `ai/skills/workspace-permission-setup/SKILL.md:31-41` | `package.json` / `pyproject.toml`+`requirements.txt` / `Cargo.toml` / `go.mod` / `Gemfile` / `Makefile` / `Dockerfile` / `mise.toml`+`.tool-versions` → per-stack Bash allow-list. Это **разрешения**, не SDD-поток |
| Референс маркеров в коде | `cli/cmd/_shared/prompt/logic/verify-commands/resolve-verify-commands.logic.ts:34-72` | `DETECTOR_ROWS`: `go.mod` → go-команды; `npm-package-json` → три группы скриптов; `Cargo.toml` → cargo. Потребитель один — placeholder'ы промпта; swift/python нет |

**Итог: сегодня стек в v2 не выбирается нигде.** Есть один неявный стек — node, — закодированный
в двух местах: список восьми npm-скриптов (`shared/sdd/readiness.ts:15-24`) и чтение
`<root>/package.json`.

### 3.2 Что именно должен нести роутер / `sdd-state` / портал

Требование операторского решения №3 («стек детектируется из репозитория») распадается на четыре
разных факта, и их нельзя сваливать в один:

| Факт | Кто владелец | Где живёт | Почему не там, где хочется |
|---|---|---|---|
| **F1. Детектированный стек** — что найдено в репозитории по маркерам | `sdd-state` (детектор) | новая строка `STACK=<id[,id…]>` + `STACK_SOURCE=<marker:<file>|config:stack.use>` в блоке `[READINESS]` | Нельзя в портал: портал — авторский артефакт, а F1 — наблюдение. Портал может врать про факт |
| **F2. Объявленный стек scope'а** — что оператор *решил* для этого scope | `infra`-спека scope'а (Tool Stack + Decision Log) | уже есть: `formats/infrastructure-spec-structure.xml`, Tool Stack + Verification Commands | Нельзя в `sdd-state`: это решение, а не наблюдение |
| **F3. Стек scope'а для навигации** — чтобы роутер и scaffold не читали спеку целиком | портал | **новая колонка `Stack`** в таблице Scopes (`formats/portal-structure.xml:28`) + поле `stack?: string` в `shared/sdd/portal.ts:12-23` | Сейчас протащено прозой в `Description` — не парсится |
| **F4. Расхождение F1 ↔ F2/F3** | аудит | новый тип дрейфа в `ax-drift-taxonomy.xml` (`STACK_DRIFT`) | Иначе «в репо go.mod, в спеке node» никто не заметит |

**Роутер: ровно один новый вход, ноль новых ветвей.** `STACK` добавляется в
`readiness-preflight-gate.xml:2-13` как вход `LogicSwitch`'а — рядом с `FLOW_VERSION` и
`EXECUTION_READY`. Новая ветвь не нужна ни одна: `infrastructure` по-прежнему выбирается по
scope-type, а «стек не распознан» закрывается fail-closed правилом «anystack матчит всегда»
(перенос `plugins/anystack/anystack-plugin.ts:24-34` из MAIN). Единственное, что роутер обязан
делать со `STACK`, — **передавать его владельцу как факт payload'а**, не переспрашивая.

Аргумент против «стека как ветви роутера»: роутер stateless и обязан быть узким
(`router.directive.xml:209-230` `KernelGrammar`: «conditions resolve only from data already in
context», «one action per case»). Двенадцать маршрутов × N стеков — это N×12 ветвей и гарантированный
`H_AMBIGUOUS_INTENT`. Стек — параметр владельца, а не критерий выбора владельца.

### 3.3 Как подключаются per-stack директивы (аналог `plugins/golang/directives/infra/golang-setup.xml`)

MAIN держит per-stack знание в `plugins/<stack>/directives/infra/<stack>-setup.xml` (единственный
файл сегодня — `plugins/golang/directives/infra/golang-setup.xml`) + скилл-обёртку
`plugins/golang/skills/sdd-infra-golang/SKILL.md`. В v2 `plugins/` нет.

Перенос без нового скилла — три шва:

1. **Правило как rule-файл в реестре.** `plugins/golang/directives/infra/golang-setup.xml` →
   `ai/directives/infra/golang-setup.xml` + запись `<Rule id="golang-setup">` в
   `ai/directives/knowledge.xml` с `<Triggers>` на `go.mod` / `go.work`. Это уже существующий
   механизм: `infra.directive.xml:83` — «look up each chosen tool in `ai/directives/knowledge.xml`
   `<Rules>`: find every rule whose `<Triggers>` match the tool name or its config artefacts».
   То есть **инфраструктура подключения per-stack знания в v2 уже есть**, в реестре просто нет
   go/python-записей (и нет `baseline-rules`, §3.1).
2. **Аксиомы, а не проза.** Семь «правил, выживших контакт с реальными репозиториями»
   (`sdd-infra-golang/SKILL.md:96-102`) — это инварианты, а не текст скилла:
   `AX_ONE_VERB_EVERY_STACK` (различия в конфиг, не в новые команды), `AX_GATES_NEVER_MUTATE`
   (`gofmt -l`, не `go fmt`; `go mod tidy -diff`, не `tidy`), `AX_SCOPE_BEFORE_DEPTH` (изменённые
   пакеты по умолчанию), `AX_FAIL_VS_ENV_FAIL` (`SKILL.md:85-90` — самое ценное: «An agent that
   "fixes" code in response to `ENV_FAIL` produces confident, wrong diffs»),
   `AX_MODULE_BOUNDARY_STOPS_RECURSION`, `AX_BOUND_EVERYTHING` (обязательный per-gate timeout).
   Из них `AX_FAIL_VS_ENV_FAIL` и `AX_GATES_NEVER_MUTATE` — **стек-агностичные** и должны жить в
   `ai/kit/axiom/infra/`, а не в go-пресете (в v2 частичный аналог — `ax-autofix-preferred`,
   `ax-lint-run-is-mechanical`, `ax-binary-severity`; полного нет).
3. **Диагностики как halt-таблица.** `TOOLCHAIN_MISSING` / `GOLANGCI_CONFIG_MISSING` /
   `NESTED_MODULES` / `CONFIG_ERROR` (`SKILL.md:35-40`) → строки `<HaltConditions>` в
   `readiness.directive.xml` (стек-параметризованные), а не таблица в прозе скилла. Так их поймает
   `audit:halts` (`audit-halt-activation.mjs`: «mentioned → declared» + «declared → used»).

### 3.4 Протяжка в scaffold Cascade Table и в readiness

**Cascade Table.** `formats/scope-tasks-index.xml:17` уже описывает правильную семантику —
«Effective rules for this scope, from the Scope Graph (depends-on transitive closure). Tier order
(low → high on collision): traversed-scopes → target-scope → module → phase». Стек влияет ровно
на одно: **какие rule-файлы резолвятся в клетки**. Три правки:

- строки-примеры `typescript-rules` / `vitest-rules` / `eslint-setup` / `node-test` →
  нейтральные `<coding-rule>` / `<testing-rule>` / `<infra-rule>` (иначе агент копирует node-имена
  в go-проект — это уже наблюдалось в issue #9.3);
- вернуть `baseline-rules` + `baseline-testing` в `knowledge.xml` и в `ai/directives/coding|testing/`
  (в MAIN есть, в RC нет) — именно они дают непустую Cascade Table стеку без своих правил;
- собрать `AX_RULES_RESOLUTION_HARD_FAIL` (сейчас не собран): «All rule references must resolve;
  missing rule = abort … A placeholder rule reference (TBD, `<rule>`, "to be authored", any
  unresolved name) = abort, never write a ticket against it». Без него scaffold в python/go-проекте
  либо напишет тикет против несуществующего `typescript-rules`, либо оставит пустую клетку молча.

**Readiness.** Здесь протяжка обязательна и не косметична: `readiness.directive.xml` целиком
npm (`:1` keywords «package-json, npm-scripts…», `:3-22` восемь точных скриптов, `:106-112`
`npm i -D`, `:209` пример `package.json`). Правка директивы бессмысленна без движка
(`shared/sdd/readiness.ts:15-24` `REQUIRED_SCRIPTS`), поэтому §3 этого трека **зависит от трека
VERIFY**: директива формулирует «манифест выбранного стека объявляет семь обязанностей», движок
отвечает адаптером. Восемь npm-имён скриптов остаются как **node-пресет**, а не как канон.
Уровни `not-ready / provisional / ready` и текст `EXECUTION_READY=` менять нельзя — их парсят три
директивы и `sdd-task`.

**Инвариант, который стоит зафиксировать тестом (общий с B1 §4.4):** `sdd-state`, `sdd-task` и
`sdd-verify`, вызванные на одном корне, обязаны видеть один и тот же `StackDetection` — одна функция,
без повторного эвристического угадывания.

### 3.5 Варианты

**Вариант A — `STACK=` в `sdd-state`, колонка `Stack` в портале, per-stack rule-файлы в реестре.**
Детектор один (`detectStacks(root)`), печатается в `[READINESS]`, попадает во вход
preflight-гейта, портал получает колонку для навигации, per-stack знание входит через уже
существующий механизм `knowledge.xml` `<Triggers>`. Ноль новых ветвей роутера, ноль новых скиллов.
Цена: правки в `sdd-state.types.ts`, `portal.ts`, `formats/portal-structure.xml`,
`readiness-preflight-gate.xml`, `readiness.directive.hbs`, `infra.directive.hbs`,
`scope-tasks-index.xml`, `knowledge.xml` + 4 rule-файла. Риск: расширение печатаемого контракта
`sdd-state` — его текст парсят директивы, поэтому строку добавлять **после** существующих, не
переставляя.

**Вариант B — `gennady.yaml` как объявление, детект только как подсказка.** Стек объявляется
оператором в конфиге (как в MAIN `stack.use`), детект лишь предлагает значение. Плюс: явность,
монорепо-случай решается без эвристик; `sdd-infra-golang/SKILL.md:70-83` показывает, что реальный
потребитель уже писал `gennady.yaml`. Минус: противоречит решению №3 в его буквальном чтении
(«детектируется из репозитория»), и `gennady.yaml` в RC не существует вовсе (A2 §1.2) — то есть
это новая сущность, а не перенос.

**Вариант C — стек как scope-type.** Добавить `scope-type` значения вида `infrastructure-golang`.
Дёшево в роутере (одна ветвь), но ломает ортогональность: scope-type отвечает на «что это за
артефакт», стек — на «на чём это работает»; product-scope на Go получит scope-type `product` и
останется без стека. **Отвергаю.**

**Рекомендация: A, с одной оговоркой из B.** `STACK=` детектируется (A), но `gennady.yaml`
`stack.use`, когда он появится в треке VERIFY, **сужает** кандидатов, а не назначает стек — ровно
как `stack-registry.ts:44-64` в MAIN. Порядок работ: (1) rule-файлы и записи реестра
(`baseline-rules`, `baseline-testing`, `go-rules`, `python-rules` — перенос готовых файлов из MAIN,
S); (2) нейтрализация node-примеров в `scope-tasks-index.xml` + сборка
`AX_RULES_RESOLUTION_HARD_FAIL` (S); (3) `STACK=`/`STACK_SOURCE=` в `sdd-state` + вход гейта (M,
общий с VERIFY); (4) колонка `Stack` в портале (S); (5) деноудизация `readiness.directive` +
`infra.directive` (M, после движка).

Пункты (1), (2), (4) не зависят от трека VERIFY и могут идти сразу.

### 3.6 Решения оператора по §3

- **Q1.** Где живёт объявленный стек: колонка `Stack` в портале (навигация, парсится) / только
  Tool Stack в infra-спеке (один владелец, но требует чтения спеки) / оба с проверкой согласованности
  аудитом (`STACK_DRIFT`)? — *моя рекомендация: третье, потому что расхождение «репо ↔ спека» иначе
  невидимо.*
- **Q2.** Мультистек — норма или ошибка? MAIN считает нормой (`verify.cmd.ts:160-179` — репо может
  быть node+golang). Если норма, `STACK=` — список, и `infra.directive` должен уметь несколько
  Tool Stack-блоков; если ошибка — нужен halt `H_MULTIPLE_STACKS`.
- **Q3.** Восемь npm-скриптов: node-пресет (стек-агностичный канон = «семь обязанностей») или
  канон, от которого стеки отклоняются? Первое дороже, второе оставляет Swift/Go-проект нерабочим
  (issue #20).
- **Q4.** `go-rules` / `python-rules` / `baseline-rules` — переносим из MAIN как есть (готовые
  файлы, S) или переписываем под v2 kit (аксиомы + `.hbs`, M)? Реестр `knowledge.xml`
  project-owned (`f74c8c1d`), поэтому перенос как есть не конфликтует с проектными реестрами.

---

## 4. Сборка директив: висячие ссылки, бюджеты, куда класть перенесённые инварианты

### 4.1 Висячие ссылки на аксиомы (referenced-but-undefined)

`ai/kit/lint-axioms.ts` проверяет **одну** направленность (`:4-6`, `:71-84`
`lintDanglingAxioms`): «every Axiom **defined** in a `<BeliefState>` must be referenced at least
once OUTSIDE BeliefState». Обратной проверки — «каждый `AX_*`, **упомянутый** в директиве, должен
иметь достижимое определение» — нет. И даже существующая проверка **только предупреждает**:
`ai/kit/build-directives.ts:45-46` («runs over the FINAL (post-delta) output and prints warnings
(never fails the build)»), `:153-154` (`console.warn`).

Ирония: для **контрактов** обратная проверка уже реализована и обязательна —
`ai/kit/audit-contract-activation.mjs` PART 2 «mentioned → available», и её мотив в комментарии
файла описан буквально как «a reference into the void». Для **halt'ов** — тоже
(`audit-halt-activation.mjs`, «mentioned → declared»). Для **аксиомов** — нет. Это единственный из
трёх видов брика без двусторонней проверки, и именно в нём потерялось большинство инвариантов v1
(§1.12).

**Полный список: 20 `AX_*`, упомянутых в rendered `ai/directives/sdd-v2/**` и не определённых
нигде в этом дереве** (посчитано скриптом по `<Axiom id="…">` vs `\bAX_[A-Z0-9_]+`; учтено, что
delta-assembly могла вынести определение в родителя — ни для одного из 20 определения нет ни в
одном файле дерева):

| # | Axiom | определение в `ai/kit/axiom/` | ссылок | где ссылаются (`file:line`) |
|---|---|---|---|---|
| 1 | `AX_AUDIT_HOOK` | `process/ax-audit-hook.xml` | 5 | `audit.directive.xml:8`, `audit/steps/STEP_1_MECHANICAL.xml:86`, `code-review.directive.xml:6`, `execute.directive.xml:60`, `scaffold/steps/STEP_1_DERIVE.xml:31` |
| 2 | `AX_PERMITTED_BASH_COMMANDS` | `process/ax-permitted-bash-commands.xml` | 4 | `audit/steps/STEP_1_MECHANICAL.xml:78`, `execute.directive.xml:53`, `infra.directive.xml:417`, `phase-execution-protocol/steps/STEP_3_VERIFY.xml:28` |
| 3 | `AX_STALE_AFTER_PIVOT_VERIFICATION` | `audit/ax-stale-after-pivot-verification.xml` | 4 | `formats/pivot-formats.xml:31`, `infra.directive.xml:117`, `interface.directive.xml:90`, `migration-v1-v2.directive.xml:61` |
| 4 | `AX_DEVIATION_SELF_RESOLVE` | `process/ax-deviation-self-resolve.xml` | 3 | `execute.directive.xml:117,139`, `phase-execution-protocol/steps/STEP_4_HANDOFF.xml:28` |
| 5 | `AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE` | `spec/ax-ports-and-abstractions-discipline.xml` | 5 | `formats/dbc-contracts.xml:112,133`, `formats/entity-surface-format.xml:6,28`, `formats/module-spec-structure.xml:2` |
| 6 | `AX_CONTRACTS_TEXTUAL_AGNOSTIC` | `spec/ax-contracts-textual-agnostic.xml` | 3 | `formats/dbc-contracts.xml:78,131`, `scaffold/steps/STEP_2_MATERIALIZE.xml:66` |
| 7 | `AX_SSOT_TRACEABILITY` | `boundary/ax-ssot-traceability.xml` | 2 | `formats/task-ticket-structure.xml:9`, `scaffold.directive.xml:154` |
| 8 | `AX_CLOSED_WORLD_INVENTORY` | `boundary/ax-closed-world-inventory.xml` | 2 | `audit/steps/STEP_3_ROUTE.xml:48`, `code-review.directive.xml:180` |
| 9 | `AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES` | `audit/ax-rules-compliance-against-activated-rules.xml` | 1 | `audit/steps/STEP_2_SEMANTIC.xml:134` |
| 10 | `AX_RUNTIME_BACKING_EXPLICIT` | `spec/ax-runtime-backing-explicit.xml` | 1 | `formats/product-spec-structure.xml:58` |
| 11 | `AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP` | `spec/ax-scope-spec-module-map-ownership.xml` | 1 | `formats/module-map-update.xml:2` |
| 12 | `AX_YAGNI_OVERENGINEERING_GUARD` | `coding/ax-yagni-overengineering-guard.xml` | 1 | `root.directive.xml:55` |
| 13 | `AX_CATCH_LOG_RECOVER` | `error/ax-catch-log-recover.xml` | 1 | `amplify-observability.directive.xml:43` |
| 14 | `AX_GITIGNORE_BASELINE` | `infra/ax-gitignore-baseline.xml` | 1 | `amplify-security.directive.xml:49` |
| 15 | `AX_E2E_PROOF_SCREENSHOT_ALWAYS` | `e2e/ax-e2e-proof-screenshot-always.xml` | 1 | `infra.directive.xml:98` |
| 16 | `AX_SPEC_PROGRESSIVE_DISCLOSURE` | **нигде** (есть только в `ai/kit/contract/spec/module-spec-markdown-structure.xml` как ссылка) | 6 | `formats/{infrastructure-spec-structure:136, interface-spec-structure:84, library-spec-structure:99, module-spec-structure:4,134, product-spec-structure:114}` |
| 17 | `AX_USAGE_WAIVER_DISCIPLINE` | **нигде** | 3 | `audit.directive.xml:154`, `formats/dbc-contracts.xml:116`, `formats/entity-surface-format.xml:20` |
| 18 | `AX_SPEC_TABLE_IS_INDEX` | **нигде** | 1 | `formats/entity-inventory-format.xml:2` |
| 19 | `AX_STRICT_NULL` | **нигде** (пример ссылается на `ai/directives/coding/typescript-rules.xml#AX_STRICT_NULL` — в этом файле такого якоря тоже нет) | 2 | `audit/steps/STEP_3_ROUTE.xml:131`, `formats/audit-round.xml:31` |
| 20 | `AX_REACTION_IS_A_TOOL_CALL` | определён в **другом** дереве: `ai/directives/agent-inbox/{arch-interrogation,inbox-flow,posting-rules}.directive.xml`, вне read-графа sdd-v2 | 1 | `agent-inbox/track-review.directive.xml:430` |

Три класса, и лечатся они по-разному:

- **Класс I (#1–15, 15 штук)** — определение существует в библиотеке, но ни один `.hbs` его не
  подключает. Лечение: `{{> "axiom/<dir>/<name>"}}` в шаблон-владельца. Это ровно те инварианты,
  которые §1 отметил как НЕТ/ЧАСТИЧНО.
- **Класс II (#16–19, 4 штуки)** — идентификатор придуман по ходу написания контракта, определения
  нет вообще. `AX_SPEC_PROGRESSIVE_DISCLOSURE` и `AX_SPEC_TABLE_IS_INDEX` при этом ссылаются на
  реальные механические проверки (`SDD_SECTION_NOT_FOLDED`, `shared/sdd/check.ts:1890`), то есть это
  «имя правила без правила». Лечение: либо создать аксиом, либо переписать текст на имя проверки.
  `AX_STRICT_NULL` — просто устаревший пример в двух местах.
- **Класс III (#20)** — межтрибная ссылка. Лечение: собрать в `agent-inbox`-шаблон sdd-v2 или
  добавить в `ALLOWLIST_CROSS_DIRECTIVE_REFS`-аналог для аксиомов (как это уже сделано для halt'ов).

**И обратная направленность (то, что lint уже ловит) — 36 предупреждений на сегодняшнем билде**
(вывод `build-directives.ts`, прогон этой сессии): 5 директив `agent-inbox` (по 5–7 аксиомов
каждая: `AX_REVIEW_PURPOSE`, `AX_SIMPLER_ALTERNATIVE`, `AX_COMPLEXITY_BUDGET`, `AX_NO_DUPLICATION`,
`AX_TICKET_DEDUPLICATION`, `AX_ZERO_TRUST_DEFAULT`, `AX_WHOLE_DIFF_ALWAYS`, `AX_CHECKLIST_HYGIENE`,
`AX_UNTRUSTED_MR_CONTENT`, `AX_ENRICH_MINIMAL`, `AX_ENRICH_OPERATOR_LANGUAGE`),
`formats/diagram-vocabulary.xml` (4), `infra`/`interface` (`AX_SPEC_MANDATORY_DIAGRAM`),
`router.directive.xml` (`AX_V2_HAS_NO_INTERNAL_MIGRATION`). Ни одно не роняет билд.

**Масштаб проблемы в целом.** Из 180 SDD-релевантных аксиомов (каталоги `process` 56, `spec` 36,
`audit` 25, `scaffold` 20, `boundary` 16, `critic` 13, `truth` 11, `interview` 3)
**88 не собираются ни в одну директиву `sdd-v2`**:

| Каталог | всего | не собрано | не собранные id |
|---|---|---|---|
| `process` | 56 | **21** | `AX_AUDIT_HOOK AX_BLOCKER_ESCALATION AX_BLOCKER_RESOLUTION_TRAIL AX_CAP_5 AX_COVERAGE_REPORT_BLOCKER_EXPLICIT AX_CROSS_SCOPE_CHANGE AX_DEVIATION_SELF_RESOLVE AX_DISPATCH_VIA_BATCH AX_ENV_FIX_CHANNEL AX_LIVE_LOG AX_NARROW_RECON AX_NO_FOCUSED_OR_SKIPPED_TESTS_ON_MERGE AX_PERMITTED_BASH_COMMANDS AX_RE_DISPATCH AX_REJECTION_REASON AX_RELEASE_READY_DEFAULT AX_REVIEW_VCS_COMMANDS AX_STEP_BY_STEP_APPROVAL AX_STOP_NO_EDITS AX_SURGICAL AX_VERIFY_AND_FINALIZE` |
| `spec` | 36 | **20** | `AX_CONTEXT_TO_CONTRACT AX_CONTRACTS_TEXTUAL_AGNOSTIC AX_DRAFT_READY_FOR_REVIEW AX_DX_FIRST AX_EXACT_SCOPE AX_HANDOFF_TO_MODULE_DECOMPOSITION AX_HIERARCHICAL_SPECS AX_MODULE_BOUNDARY_BY_OPERATOR AX_NO_DATA_LOSS AX_NO_SILENT_OPTION_DROP AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE AX_PRODUCT_LIBRARY_FLOW AX_REFINE_MODULE_PRESERVES_CONTRACTS AX_RUNTIME_BACKING_EXPLICIT AX_RUNTIME_BACKING_IN_CONTRACTS AX_SCOPE_GRAPH_DETECTION AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP AX_SCOPE_STAYS_THIN AX_SCOPE_TYPE_BRANCH AX_SPEC_STRUCTURE` |
| `audit` | 25 | **9** | `AX_BDD_COVERAGE_VERIFICATION AX_COMPLETENESS_CHECK AX_EXECUTION_LOG_VERIFICATION AX_LEARNING_CONTEXT AX_PROVENANCE_IS_A_PRODUCT AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES AX_SEVERITY AX_STALE_AFTER_PIVOT_VERIFICATION AX_TASK_ID_INTEGRITY` |
| `boundary` | 16 | **13** | `AX_CLOSED_WORLD_INVENTORY AX_ENTITY_SURFACE_COMPLETENESS AX_GUARDED_RESULT_BOUNDARY AX_ISOLATION_SIGNAL AX_ISOLATION_THROUGH_PUBLIC_BOUNDARY AX_REFERENCE_OVER_COPY AX_RESULT_PUBLIC_BOUNDARY AX_SCOPE_TYPE_GATE AX_SEMANTIC_LOCATION_OVER_LINES AX_SEMANTIC_SAFETY AX_SPEC_NEVER_EDITED AX_SSOT_TRACEABILITY AX_TICKET_WRITE_SCOPE` |
| `scaffold` | 20 | **10** | `AX_APPEND_ONLY_MODULE_ADD AX_CROSS_SCOPE_TASK_PLACEMENT AX_EXTEND_DAG_PRESERVES_EXISTING_IDS AX_HANDOFF_TO_TASK_SCAFFOLDING AX_PHASES_DECLARED_IN_HEADER AX_RULE_ACTIVATION_PLAN AX_RULES_CASCADE_RESOLUTION AX_RULES_LOAD_FROM_PHASE_BLOCK AX_RULES_RESOLUTION_HARD_FAIL AX_STACK_BASED_FLOW` |
| `critic` | 13 | **8** | `AX_CONFUSION_BUG AX_CRITIC_MODEL_TIER AX_DEFAULT_ACCEPT AX_FINDING_ADDRESSEE AX_GOAL_OWNER_GATE AX_LANGUAGE_LENS AX_POLISH_MODE AX_PRODUCT_ARCHITECT_LENS` |
| `truth` | 11 | **7** | `AX_AUTONOMOUS_RESEARCH AX_FRESHNESS_GUARD AX_LIVE_SOURCE_ONLY AX_NO_UNVERIFIED_FINDINGS AX_PRODUCTION_REALISM AX_REAL_RUN_OVER_PING AX_STALE_MUST_BE_REJECTED` |
| `interview` | 3 | 0 | — |
| **Итого** | **180** | **88** | |

Не все 88 обязаны быть собраны: часть — это осознанно отложенные заготовки. Но **20 из 88 уже
цитируются rendered-директивами**, а ещё десяток (`AX_RULES_RESOLUTION_HARD_FAIL`,
`AX_DISPATCH_VIA_BATCH`, `AX_BLOCKER_ESCALATION`, `AX_TASK_ID_INTEGRITY`, `AX_NO_UNVERIFIED_FINDINGS`,
`AX_STALE_MUST_BE_REJECTED`, `AX_PROVENANCE_IS_A_PRODUCT`) — это ровно инварианты §1. Разница между
«отложенная заготовка» и «потерянный инвариант» сегодня не выражена ничем: одна папка, один статус.

### 4.2 Предложение: `lint-axioms` — проверка «referenced-but-undefined», обязательная

Минимальная правка, точно в существующую архитектуру:

1. В `ai/kit/lint-axioms.ts` добавить `lintUndefinedAxiomRefs(rendered, resolveContext)`:
   для каждой rendered-директивы собрать `\bAX_[A-Z0-9_]+\b` из `outside` + из тел аксиомов, вычесть
   (а) собственные `<Axiom id>`, (б) `deps=` (наследование от загрузчика — уже есть в
   `parseDirective`), (в) `<Axiom id>` каждого родителя по графу `READ_AND_USE_DIRECTIVE` (граф уже
   строится в `build-directives.ts:83-99` для delta-assembly, его надо передать в lint),
   (г) явный `ALLOWLIST_EXTERNAL_RULE_ANCHORS` для ссылок вида
   `ai/directives/coding/<rule>.xml#AX_*` (класс III и `AX_STRICT_NULL`).
2. Направленность делает билд красным (`process.exitCode = 1`), в отличие от текущей
   «defined-but-unreferenced», которая остаётся warning'ом. Обоснование асимметрии:
   несобранное определение — мёртвый груз (стоит токенов), а несуществующее определение при живой
   ссылке — **ложь агенту**: он получает «per `AX_PERMITTED_BASH_COMMANDS`» и не имеет правила,
   которому обязан подчиниться. Это ровно та мотивация, которую `audit-contract-activation.mjs`
   PART 2 уже применяет к контрактам.
3. Тесты в `ai/kit/__tests__/lint-axioms.test.ts` (файл уже имеет 4 сюиты / 13 кейсов, структура
   готова): «reference with no definition anywhere is reported» · «reference satisfied by the
   loading directive's deps is not reported» · «reference satisfied by a parent in the
   READ_AND_USE graph is not reported» · «allowlisted external rule anchor
   (`typescript-rules.xml#AX_*`) is not reported» · «prefix ids do not false-match» (уже есть,
   переиспользовать `mentions`).
4. Отдельно — правило про **статус аксиома в библиотеке**: добавить `status="draft"` в файлы,
   которые сознательно не собираются, и кейс «every axiom file is either referenced by a template
   or marked draft». Это отделяет 68 заготовок от 20 потерянных инвариантов механически, а не
   на глаз.

### 4.3 Бюджеты: текущие размеры против лимитов

Константы — `ai/kit/step-budget-gate.ts:36-45`: `SKELETON_TOKEN_TARGET = 6000` (**soft**, warning),
`SKELETON_TOKEN_LIMIT = 8000` (**hard**, exit 1), `PACKAGE_CHAR_LIMIT = 20 000`,
`PACKAGE_LINE_CHAR_LIMIT = 2000`. Токены считаются `countTokens` из
`shared/common/tokens.ts` (`/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu` — грубая оценка).

**Ключевое ограничение области действия гейта** (`step-budget-gate.ts:24-27`): «A directive counts
as lazily assembled only when its sibling `<name>/steps/` directory exists (DA-REQ-4) — the three
pilots (audit, scaffold, phase-execution-protocol) carry that layout today; **every other directive
stays monolithic and is skipped by the scan**».

Три пилота — в бюджете с запасом:

| Пилот | скелет, токены | против 6000 / 8000 | пакеты (chars / max line) против 20 000 / 2000 |
|---|---|---|---|
| `scaffold.directive.xml` | **5085** | ✔ ниже target | 7 пакетов: 586–6943 c; max line 409 ✔ |
| `audit.directive.xml` | **3180** | ✔ | 3 пакета: 11 370–13 487 c (самый большой — `STEP_1_MECHANICAL` 13 487, 67 % лимита); max line **709** ✔ |
| `phase-execution-protocol.directive.xml` | **891** | ✔ | 4 пакета: 373–2639 c; max line 463 ✔ |

**А вот необюджетированные монолиты — вот где проблема** (замер `countTokens` этой сессии):

| Директива | токены | если бы гейт её сканировал |
|---|---|---|
| `infra.directive.xml` | **9592** | **> hard limit 8000 → exit 1** |
| `root.directive.xml` | **7572** | > target 6000 (warning), в пределах ceiling |
| `migration-v1-v2.directive.xml` | **6741** | > target |
| `router.directive.xml` | **6094** | > target (роутер читается **каждым** входом — это самый дорогой токен в системе) |
| `interview-protocol.directive.xml` | **5925** | ниже target на 75 токенов |
| `interface.directive.xml` | 5587 | ✔ |
| `reconcile.directive.xml` | 5539 | ✔ |
| `execute.directive.xml` | 5270 | ✔ |
| `readiness.directive.xml` | 4215 | ✔ |
| `code-review.directive.xml` | 3934 | ✔ |
| `recover-from-code.directive.xml` | 3590 | ✔ |
| остальные 16 | ≤ 2751 | ✔ |

То есть **бюджет измеряет три самые маленькие директивы и не измеряет самую большую**. `infra` в
1,6 раза превышает то, что для пилота было бы фатальным. Это же и ответ на «как добавить
инварианты, не раздув бюджет»: `infra`, `root`, `migration-v1-v2`, `router` в текущей форме места
не имеют — им нужна lazy-разбивка **до** того, как в них что-то добавят.

### 4.4 Как добавлять перенесённые инварианты, не раздувая бюджеты

Порядок, по возрастанию цены:

1. **Дописать существующий аксиом в библиотеке** — ноль новых токенов, если аксиом уже собран
   (D4.4–D4.7 в `ax-severity-tagging.xml`, D6 в `ax-ticket-has-bdd-and-tests.xml`, D7.2 в
   `ax-phase-scope-lock.xml`). Из 11 «НЕТ» §1 так закрываются **6**.
2. **Собрать уже существующий, но неподключённый аксиом** (класс I §4.1) — +N токенов ровно в тех
   директивах, где он нужен. Дороже всего `AX_PERMITTED_BASH_COMMANDS` (55 строк ≈ 700 токенов) —
   но он нужен в `phase-execution-protocol`, у которого скелет 891 токен и пакеты по 2,6 KB, то есть
   запас 7000 токенов. `AX_CAP_5` (7 строк) в `review-lifecycle` (774 токена) — тривиально.
3. **Положить в ядро роутера** — только для conduct-аксиомов, которые нужны **всем** ветвям
   (`AX_ARTIFACT_STYLE_SELF_CHECK`, D9). Ядро роутера дороже всего: 6094 токена × каждый вход.
   Дешевле объявить его в `deps=` двух владельцев (`scope`, `module`) — delta-assembly вычтет его
   из них, если он в ядре, но **добавит**, если нет; поэтому корректный ход для D9 —
   определить в `scope.directive.hbs` и `module.directive.hbs` локально (два раза × ~130 токенов),
   а не в ядре (один раз × 12 входов).
4. **Lazy-разбивка `infra` / `root` / `migration-v1-v2`** — единственный способ добавить в них
   что-либо. Механика готова: `assembly-manifest.json` уже принимает `"sdd-v2/infra.directive.xml":
   "lazy"`, а `build-directives.ts:120-131` громко упадёт, если у директивы нет `<Step>`-блоков
   (у `infra` их 7+, есть). После разбивки они попадут под `check:directive-budgets` — что и должно
   было случиться с самого начала.
5. **`.hbs`-партиал против инлайна — сегодня не решено, и это второй источник дрейфа.**
   Замер: **63 `AX_*` объявлены инлайном прямо в `.hbs`** (`interview-protocol.directive.hbs` — 6,
   `recover-from-code` — 4, `audit` — 4, `router` — 3, `preflight-protocol` — 3,
   `agent-inbox/enrich` — 11, `agent-inbox/synthesize` — 4, `infra`/`interface`/`migration-v1-v2` — по 1
   и т.д.), минуя библиотеку `ai/kit/axiom/**`. Из них **четыре имеют одноимённый файл в библиотеке**:
   `AX_EVIDENCE_HYGIENE`, `AX_FINDING_ROUTING`, `AX_MECHANICAL_VIA_SDD_CHECK`, `AX_OPERATOR_LANGUAGE` —
   то есть у одного id два дома, и ничто не проверяет, что тексты совпадают. Это зеркальный дефект
   к §4.1: там определение в библиотеке без сборки, здесь — определение в сборке без библиотеки.
   Ни `audit:axioms`, ни `lint-axioms` этого не видят, потому что оба смотрят только на собранный
   выход.
   Правило, которое стоит зафиксировать: **инвариант, который цитируют две и более директивы,
   обязан жить партиалом**; инлайн допустим только для аксиома, локального ровно одному шаблону.
   Проверка: кейс в `ai/kit/__tests__/` — «no axiom id is defined both inline in a template and as a
   library file» + «an axiom inlined in more than one template must be a partial». Без этого перенос
   инвариантов §1 пойдёт по дешёвому пути «вписать в шаблон» и удвоит расхождение.

---

## 5. Список задач и решения оператора

Размеры: **S** ≤ 1 фазы-день · **M** 2–4 · **L** неделя+.
Eval-группа этого трека — **G3** (директивы/скиллы/поток авторинга и исполнения); где нужен
companion в другой группе, он назван отдельно. Сценарии `ai/flow-eval/scenarios.json` (их 7)
покрывают spec-authoring / scaffold / execute / repair / task — то есть G3-задачи проверяемы
существующими фикстурами `fibonacci-library`, `tic-tac-toe`, `slugify-toolchain`,
`broken-specs-repair`.

### 5.1 Задачи

| id | Goal (проверяемо) | Files | Tests | Size | Eval |
|---|---|---|---|---|---|
| **T-B6-08** | **Сначала — замок на висячие ссылки.** `lint-axioms` получает направленность «referenced-but-undefined» и **роняет билд**; 20 ссылок из §4.1 либо разрешаются, либо попадают в явный allowlist внешних rule-анкоров | `ai/kit/lint-axioms.ts`, `ai/kit/build-directives.ts` (передать READ_AND_USE-граф в lint), `ai/kit/AUTHORING.md` §7 | `ai/kit/__tests__/lint-axioms.test.ts` +5 кейсов (нет определения нигде · разрешено через `deps=` · разрешено родителем в графе · allowlist внешнего анкора · префиксы не ложно-матчатся) | **M** | G3 |
| **T-B6-09** | Kit-скрипты и kit-тесты не зависят от cwd: `resolveAssemblyMode` и чтение `assembly-manifest.json` резолвятся от корня пакета, а не от `process.cwd()`; три теста из §0 зелены из любого cwd | `ai/kit/lazy-assembly.ts`, `ai/kit/render.ts` (`KIT`/`OUT_ROOT`), `ai/kit/step-budget-gate.ts`, `ai/kit/check-directives-fresh.ts` | `ai/kit/__tests__/lazy-assembly.test.ts` — кейс «resolves the manifest from the package root regardless of cwd»; прогон трёх файлов §0 из чужого cwd | **S** | G3 |
| **T-B6-10** | Бюджеты покрывают **все** директивы, а не три пилота: `infra` (9592 т.), `root` (7572), `migration-v1-v2` (6741), `router` (6094) переведены в `lazy` в `assembly-manifest.json` и проходят `check:directive-budgets` | `ai/kit/assembly-manifest.json`, `ai/kit/step-budget-gate.ts` (сканировать монолиты тоже, с их собственным лимитом), `ai/kit/templates/sdd-v2/{infra,root,migration-v1-v2,router}.directive.hbs` (Step-блоков достаточно: 9/5/9/3) | `ai/kit/__tests__/step-budget-gate.test.ts` — «a monolith directive over the ceiling fails the gate»; `skeleton-package-binding.guard.test.ts` расширить на новые пилоты | **M** | G3 |
| **T-B6-11** | Инварианты аудита D4.4–D4.7 восстановлены: `ax-severity-tagging` несёт таблицу вычисления «first matching row wins» + «print which row matched» + правило `LOW` + семантическое определение `MAJOR`/`MINOR` + «заявленная верификация без evidence = MAJOR» + кап проектных находок; `RULE_FILE_INCOMPLETE`/`rule-file-fix` вернулись в `ax-finding-routing` и `ax-drift-taxonomy` | `ai/kit/axiom/audit/{ax-severity-tagging,ax-finding-routing,ax-drift-taxonomy}.xml`, `ai/kit/templates/sdd-v2/audit.directive.hbs` | `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` — «audit computes its verdict from a printed severity table», «LOW confidence never causes FAIL», «a project-scope finding enters the verdict capped at MINOR» | **M** | G3 |
| **T-B6-12** | Граница фазового агента полна: ERROR OWNERSHIP вернулся в `ax-phase-scope-lock`; `ax-permitted-bash-commands` и `ax-blocker-escalation` собраны в `phase-execution-protocol`; `H_BLOCKED` объявлен в его `<HaltConditions>`; исправлен неверный комментарий про `review-lifecycle` | `ai/kit/axiom/process/{ax-phase-scope-lock,ax-permitted-bash-commands,ax-blocker-escalation}.xml`, `ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs`, `ai/kit/audit-halt-activation.mjs:138` | `stateless-sdd-flow-contract.test.ts` — «a phase worker owns failures only inside its own Target Files», «the phase protocol defines the permitted command list, not only cites it»; `audit:halts` зелен | **M** | G3 (+ G1 для §5-исключения fixture-репо, issue #19) |
| **T-B6-01** | Pivot для product/library имеет владельца: `scope.directive` и `module.directive` несут `AX_PIVOT_REQUIRES_SUPERSESSION`, режимы `greenfield/refine/pivot/rewrite`, `H_REWRITE_WITH_DOWNSTREAM` и обязанность заполнить Pivot Invalidation List; `AX_REFINE_MODULE_PRESERVES_CONTRACTS` собран в `module` | `ai/kit/templates/sdd-v2/{scope,module}.directive.hbs`, `ai/kit/axiom/spec/{ax-pivot-requires-supersession,ax-refine-module-preserves-contracts}.xml`, `ai/directives/sdd-v2/formats/pivot-formats.xml` (уже готов) | `stateless-sdd-flow-contract.test.ts` — «a product/library pivot supersedes instead of overwriting» + «rewrite mode halts when the scope already has tickets»; eval-сценарий на фикстуре `fibonacci-library` c pivot-интентом | **M** | G3 |
| **T-B6-02** | Правила закрытого мира собраны в модульный авторинг: `AX_CLOSED_WORLD_INVENTORY`, `AX_ENTITY_SURFACE_COMPLETENESS`, `AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE`, `AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP`, `AX_CONTRACTS_TEXTUAL_AGNOSTIC`, `AX_HIERARCHICAL_SPECS`, `AX_MODULE_BOUNDARY_BY_OPERATOR` — в `module.directive.hbs` (или `deps=`); закрывает 4 висячих ссылки из §4.1 | `ai/kit/templates/sdd-v2/module.directive.hbs`, `ai/kit/axiom/{boundary,spec}/*` | `stateless-sdd-flow-contract.test.ts` — «module decomposition carries the closed-world rules it cites»; `lint-axioms` (T-B6-08) зелен | **S** | G3 |
| **T-B6-03** | Цикл `review-lifecycle` STEP_2⇄STEP_3 ограничен: `AX_CAP_5` собран и применён; `ax-default-accept` и `ax-polish-mode` собраны в `critic-protocol` | `ai/kit/templates/sdd-v2/{review-lifecycle,critic-protocol}.directive.hbs`, `ai/kit/axiom/process/ax-cap-5.xml`, `ai/kit/axiom/critic/{ax-default-accept,ax-polish-mode}.xml` | `stateless-sdd-flow-contract.test.ts`, сюита `two artifact approval boundaries` — «bounds the review⇄reconcile cycle and hands the disposition to the operator» | **S** | G3 |
| **T-B6-04** | Batch-режим честен про рабочее дерево: либо серийные полосы возвращены как правило `AX_TASK_PARALLEL` (v1-инвариант), либо параллель требует отдельного worktree на полосу — выбранный вариант зафиксирован тестом | `ai/kit/axiom/process/ax-task-parallel.xml`, `ai/kit/templates/sdd-v2/execute.directive.hbs`, `ai/skills/README.md` | `stateless-sdd-flow-contract.test.ts` — «batch never runs two tickets concurrently in one working tree»; companion в `cli/cmd/sdd-verify/__tests__` (snapshot не ловит чужую полосу) | **S** (после решения Q3) | G3 (+ G1) |
| **T-B6-05** | `AX_DISPATCH_VIA_BATCH` собран в `reconcile`: «execute остаётся единственным владельцем audit/code-review группы; reconcile не диспатчит второе ревью» | `ai/kit/templates/sdd-v2/reconcile.directive.hbs`, `ai/kit/axiom/process/ax-dispatch-via-batch.xml` | `stateless-sdd-flow-contract.test.ts` — «reconcile dispatches reopened tickets as one execute batch and never runs a second review» | **S** | G3 |
| **T-B6-13** | D6 (SSOT по ссылке) восстановлен: `ax-ssot-traceability` обновлён до v1-текста и собран; буллет «expected outcome REFERENCES the spec anchor / `Given` stays literal» вернулся в `ax-ticket-has-bdd-and-tests`; advisory `dangling-spec-ref` появился в аудите | `ai/kit/axiom/boundary/ax-ssot-traceability.xml`, `ai/kit/axiom/scaffold/ax-ticket-has-bdd-and-tests.xml`, `ai/kit/templates/sdd-v2/{scaffold,audit}.directive.hbs` | `stateless-sdd-flow-contract.test.ts` — «ticket BDD references spec facts by anchor and keeps Given literals»; companion в `shared/sdd/__tests__/check.test.ts` для структурной проверки анкора | **M** | G3 (+ G4) |
| **T-B6-14** | D9 восстановлен: `AX_ARTIFACT_STYLE_SELF_CHECK` подключён к `scope` и `module` (двум владельцам whole-document `Write`) и применён в STEP_2_FILL | `ai/kit/templates/sdd-v2/{scope,module}.directive.hbs` | `ai/kit/__tests__/deps.test.ts` — «every directive that performs a whole-document Write carries the style self-check» | **S** | G3 |
| **T-B6-15** | D2 восстановлен: блок «Directive markup — mandatory» стоит первым разделом `AGENTS.md` RC; ни один скрипт/CI-шаг не валидирует `ai/directives/**` XML-парсером | `AGENTS.md`, `ai/kit/AUTHORING.md` (перекрёстная ссылка) | новый `ai/kit/__tests__/directive-markup-contract.test.ts` — «AGENTS.md declares directive markup as prompt text before the project description» + «no repository script invokes an XML validator over ai/directives» | **S** | G3 |
| **T-B6-16** | Provable-progress: повтор эквивалентного блокирующего набора без нового evidence даёт halt, а не новый раунд | `ai/kit/axiom/process/{ax-re-dispatch,ax-rejection-reason}.xml` (собрать) или новый `ax-provable-progress.xml`; `ai/kit/templates/sdd-v2/execute.directive.hbs` (+ `H_NO_PROGRESS` в `<HaltConditions>`) | `stateless-sdd-flow-contract.test.ts` — «execute halts on a repeated finding set with no new evidence instead of opening another round» | **M** | G3 |
| **T-B6-17** | `[REOPENS]` восстановлен как механическая проверка причинности: `Reopens` в Meta сверяется с `@audit … triggered-reopen != none`; `ax-stale-after-pivot-verification` собран (закрывает 4 висячих ссылки) | `shared/sdd/check.ts`, `ai/kit/axiom/audit/ax-stale-after-pivot-verification.xml`, `ai/kit/templates/sdd-v2/audit.directive.hbs` | `shared/sdd/__tests__/check.test.ts` — тикет с `triggered-reopen=Round-2` и `Reopens: 0` → finding; `Reopens: 1` → чисто | **M** | G3 (+ G4) |
| **T-B6-06** | Стек детектируется и влияет на правила (директивно-скилловая половина): `STACK=`/`STACK_SOURCE=` в `sdd-state`, вход `readiness-preflight-gate`, колонка `Stack` в портале, нейтральные примеры Cascade Table, `AX_RULES_RESOLUTION_HARD_FAIL` собран, перенос `baseline-rules` / `baseline-testing` / `go-rules` / `python-rules` / `result-conventions` из MAIN + записи `knowledge.xml`, `golang-setup.xml` как rule-файл с `<Triggers>` на `go.mod` | `cli/cmd/sdd-state/sdd-state.{cmd,types}.ts`, `shared/sdd/portal.ts`, `ai/kit/contract/process/readiness-preflight-gate.xml`, `ai/directives/sdd-v2/formats/{portal-structure,scope-tasks-index}.xml` (через `.hbs`), `ai/kit/axiom/scaffold/ax-rules-resolution-hard-fail.xml`, `ai/directives/knowledge.xml`, `ai/directives/coding/{baseline,go,python,result-conventions}-rules.xml`, `ai/directives/infra/golang-setup.xml`, `ai/kit/templates/sdd-v2/{readiness,infra}.directive.hbs` | `cli/cmd/sdd-state/__tests__` — «prints STACK and STACK_SOURCE from repository markers»; `shared/sdd/__tests__/portal.test.ts` — колонка `Stack` парсится; `stateless-sdd-flow-contract.test.ts` — «scaffold aborts on an unresolvable rule reference»; инвариант «один `StackDetection` для `sdd-state`/`sdd-task`/`sdd-verify`» | **L** (делится: подпункты «правила + примеры + колонка» — S/M и не зависят от трека VERIFY; `STACK=` — M и общий с VERIFY) | G3 (+ G1) |
| **T-B6-07** | v1-имена не теряются как триггеры: `description` скилла `sdd` перечисляет `/sdd-setup`, `/sdd-discover`, `/sdd-continue`, `/sdd-infra`, `/sdd-module-decomposition` как алиасы; `sdd-reconcile` — `/sdd-fix`; `sdd-execute` — `/sdd-execute-batch`. `specs/ai-skills/ai-skills.spec.md:290` исправлена (`sdd-hooks-install` в RC нет) | `ai/skills/sdd/SKILL.md`, `ai/skills/sdd-reconcile/SKILL.md`, `ai/skills/sdd-execute/SKILL.md`, `ai/skills/README.md`, `specs/ai-skills/ai-skills.spec.md` | `cli/cmd/sync-skills/__tests__` или новый кейс: «every retired v1 skill name appears as a trigger in exactly one v2 skill description»; «the skills spec names only skills that exist on disk» | **S** | G3 |
| **T-B6-18** | Инлайн-аксиомы не расходятся с библиотекой: ни один id не определён одновременно инлайном в `.hbs` и файлом в `ai/kit/axiom/**` (сегодня 4: `AX_EVIDENCE_HYGIENE`, `AX_FINDING_ROUTING`, `AX_MECHANICAL_VIA_SDD_CHECK`, `AX_OPERATOR_LANGUAGE`); аксиом, цитируемый ≥2 директивами, обязан быть партиалом | `ai/kit/templates/sdd-v2/**.hbs`, `ai/kit/axiom/**`, `ai/kit/AUTHORING.md` | новый `ai/kit/__tests__/axiom-home.test.ts` — «no axiom id has two homes» + «an axiom used by two or more templates is a partial» | **S** | G3 |
| **T-B6-19** | Библиотека аксиомов различает «заготовку» и «инвариант»: 68 несобранных, не цитируемых аксиомов помечены `status="draft"`; собранность остальных проверяется | `ai/kit/axiom/**` (68 файлов, одна атрибутная правка), `ai/kit/lint-axioms.ts` | `ai/kit/__tests__/lint-axioms.test.ts` — «every axiom file is either referenced by a template or marked draft» | **S** | G3 |
| **T-B6-20** | Conduct-аксиомы гарантированы каждому operator-facing владельцу (D1 замкнут) | `ai/kit/templates/sdd-v2/**.hbs` (`deps=`), `ai/kit/__tests__/deps.test.ts` | `deps.test.ts` — «every operator-facing owner declares or defines the conduct set» | **S** | G3 |

**Порядок.** T-B6-08 и T-B6-09 идут **первыми**: без замка на висячие ссылки и без cwd-независимых
скриптов остальные 18 задач нечем проверить, а половина из них — это ровно «собрать аксиом»,
что T-B6-08 делает обязательным. Затем T-B6-19/T-B6-18 (гигиена библиотеки, S), затем
T-B6-10 (бюджеты — до того, как в `infra`/`root` что-то добавят), затем содержательные
T-B6-11/12/13/14/16/17, затем T-B6-01/02/03/05/20, затем T-B6-06 (после трека VERIFY),
T-B6-04 и T-B6-07 — по решению оператора.

### 5.2 Решения оператора

**Q1. Библиотека аксиомов: 88 несобранных — это долг или заготовка?**
- (a) Всё, что не собрано и не цитируется, — заготовка: пометить `status="draft"`, забыть. Дёшево (S),
  но «забыть» означает потерять 20+ инвариантов v1 сознательно.
- (b) Инвентаризация каждого из 88 с вердиктом перенести / отложить / удалить. Дорого (L), зато
  единственный способ закрыть §1 честно.
- (c) Гибрид: 20 цитируемых (§4.1) + 10 названных в §1 — собрать сейчас (T-B6-08/11/12/13/17);
  остальные 58 — `draft` до появления потребности. **Рекомендую (c).**
- (d) Удалить несобранные файлы целиком: библиотека станет правдой о системе, но 88 текстов v1
  исчезнут безвозвратно, а v1 заморожен.

**Q2. Направленность `lint-axioms` «referenced-but-undefined» — warning или error?**
- (a) Error (exit 1), как у контрактов и halt'ов. Билд станет красным немедленно на 20 ссылках —
  значит T-B6-08 нельзя мержить без T-B6-11/12/13/17 или allowlist'а.
- (b) Error с временным `KNOWN_DANGLING`-allowlist'ом на 20 текущих ссылок, который только
  сокращается. **Рекомендую (b)** — тот же приём, что `ALLOWLIST_CROSS_DIRECTIVE_REFS` в
  `audit-halt-activation.mjs`.
- (c) Warning. Ничего не меняет: сегодняшние 36 warning'ов уже никто не читает.

**Q3. Batch: серийные полосы или параллель?** (регрессия §1.10 п.14.6)
- (a) Вернуть v1-инвариант: одна полоса на рабочее дерево, параллель запрещена. Просто, честно,
  медленнее.
- (b) Оставить параллель, но обязать worktree-на-полосу (`git worktree`) — иначе snapshot
  `sdd-verify` (`help.ts:30` «every other persistent file or directory is observed») даст ложные
  VIOLATION у соседа. Быстрее, но добавляет git-механику в поток, который сейчас git не мутирует.
- (c) Оставить как есть (параллель по disjoint Target Files в одном дереве). **Не рекомендую**:
  это ровно то, что v1 запретил после опыта, и §5-команды тикета (`npm run test`, `xcodebuild`)
  видят всё дерево, а не свои Target Files.

**Q4. `sdd-infra-golang`: как переносим 7 «выживших правил»?**
- (a) Все семь — в `ai/directives/infra/golang-setup.xml` как rule-файл (перенос из MAIN как есть, S).
  Быстро, но `FAIL vs ENV_FAIL` и «gates never mutate» — стек-агностичные инварианты, и они
  останутся спрятанными в go-файле.
- (b) Два стек-агностичных (`AX_FAIL_VS_ENV_FAIL`, `AX_GATES_NEVER_MUTATE`) — в
  `ai/kit/axiom/infra/`, пять go-специфичных — в rule-файл. **Рекомендую (b).**
- (c) Всё в аксиомы с `stack=`-атрибутом. Новый механизм в kit — не оправдан одним стеком.

**Q5. Пять исчезнувших v1-имён скиллов** (`/sdd-setup`, `/sdd-discover`, `/sdd-continue`,
`/sdd-infra`, `/sdd-module-decomposition`) и два поглощённых (`/sdd-fix`, `/sdd-execute-batch`):
- (a) Только алиасы в `description` скилла `sdd` (T-B6-07, S). Ноль новых скиллов, но `/sdd-fix`
  как команда не сработает.
- (b) Тонкие скиллы-обёртки, передающие роутеру forced intent (`project-setup`, `new-scope`,
  `evolve-scope`, `module-decomposition`) — по 18 строк каждый, как существующие пять. Ломает
  решение «роутер — единственная дверь», но эргономически ближе к тому, чем реально пользовались
  (messenger: `sdd-fix` — 228 упоминаний).
- (c) Алиасы + два forced-intent скилла на самое нагруженное (`sdd-fix` → `sdd-reconcile`,
  и `evolve-scope`/pivot как `sdd-continue`). **Рекомендую (c)** — доказательство необходимости
  здесь есть в артефактах реального проекта, а не в гипотезе.

**Q6. Бюджеты: единый лимит для всех директив или два режима?**
- (a) Один лимит 8000 токенов для всех, монолиты сканируются тоже → `infra` (9592) обязан быть
  разбит. **Рекомендую (a)** — иначе гейт измеряет три самые маленькие директивы и молчит про самую
  большую.
- (b) Отдельный, более мягкий лимит для монолитов (например 12 000). Легализует текущее состояние
  и снимает мотивацию разбивать.
- (c) Оставить как есть (гейт только для lazy-пилотов). Тогда добавление любого инварианта в
  `infra`/`root` не встречает никакого препятствия — и это в точности то, как `infra` дорос до 9592.


# Часть II — V-B6 (независимый верификатор)

# V-B6 — независимая верификация трека DIRECTIVES & SKILLS (B6)

Проверяемый документ: `…/scratchpad/B6-directives-skills-track.md` (921 строка).
Деревья: MAIN `…/nice-panini-8aa14e` (`origin/main` 8bb38477) · RC `…/scratchpad/rc-v6`
(`codex/sdd-v2-rc52-followup` 11291af5, рабочее дерево чистое, кроме `?? .npm-ci-done`).
Всё read-only: `git -C`, абсолютные пути, `sh -c 'cd <rc> && …'` только для kit-скриптов.

## § Итог

**Полнота B6.** Документ **завершён**, обрыва по rate-limit нет: §5.1 содержит все 20 задач
(`T-B6-01` … `T-B6-20`, порядок работ сформулирован), §5.2 содержит шесть решений оператора
(`Q1`…`Q6`), последний абзац заканчивается законченным предложением. Ни один раздел не оборван.

**Качество.** Механическая часть (§4) — образцовая: я независимо пересчитал её скриптом и получил
**совпадение до элемента**: те же 20 висячих `AX_*` с теми же файлами/строками, те же 88 несобранных
из 180 SDD-релевантных аксиомов с той же разбивкой по каталогам, те же 63 инлайн-аксиома и ровно те
же 4 id с «двумя домами», те же токен-размеры директив (`infra` 9592, `root` 7572,
`migration-v1-v2` 6741, `router` 6094). Оба прогона зелены. §2 (маршруты роутера) и §3 (детект стека)
подтверждаются построчно; messenger-evidence воспроизводится с точностью до единицы.

**Что нужно править.** Слабое место — §1: одна фактически ложная evidence-строка (D4.7), одна
ложная в мелочи (D2), два неверных v1-`file:line` (D3.3, D3.6), и — главное — **три
недо-оценённых вердикта**:

1. **`critic-protocol.directive.xml` не загружается ничем.** Ни одного
   `READ_AND_USE_DIRECTIVE`, ни упоминания по имени в прозе (в отличие от
   `phase-execution-protocol.directive.xml`, которое `execute.directive.xml:220` называет прямо).
   B6 держит на этом файле вердикты D3.1 / D3.2 / D3.3 / D3.4 / D3.7 и §2-строку `sdd-critic`.
2. **D3.4 — не «частично», а инверсия.** RC `critic-protocol.directive.xml:4` буквально:
   «Confusion → underspecification, not a question to ask» против MAIN `critic-protocol.xml:10`
   «confusion alone never proves that the artifact is underspecified». Это ровно тот пропущенный
   инвариант, который зафиксировал V-A1.
3. **D4.7 — вердикт НЕТ завышен, а его evidence ложен.** `RULE_FILE_INCOMPLETE` в v2 **есть** в
   двух местах; потеряны конкретно кап `MINOR`, адресат `rule-file-fix` и гарантия «never `FAIL`
   for this task».

Плюс два **не найденных B6 сироты/дефекта**: `recover-from-code.directive.xml` (3590 токенов)
недостижим из роутера, и `AX_BLOCKER_ESCALATION` висит ещё и в дереве правил
(`ai/directives/infra/{nodejs-npm-setup,git-setup}.xml`), куда предложенный `lint-axioms` (T-B6-08)
по своей области не заглянет.

Итоговая позиция: **принять B6 с правками из § Правки к B6**. Пересчитанная сводка §1 —
**17 ЕСТЬ / 15 ЧАСТИЧНО / 11 НЕТ / 2 НЕПРИМЕНИМО** вместо 19/13/11/2. Заодно арифметика §1.12:
сумма столбцов = 19+13+11+2 = **45**, а подпись гласит «46 проверяемых утверждений»; сумма размеров
групп тоже 45 (2+7+7+6+1+6+5+1+6+4).

---

## § Инварианты

Колонка «Цитаты» — проверка `file:line` в обе стороны (v1 в MAIN, v2 в RC):
**CONFIRMED** / **WRONG-LINE** / **REFUTED**. Колонка «Вердикт» — мой пересчёт.

| # | Цитаты | Что проверено (evidence) | Вердикт B6 | Мой вердикт |
|---|---|---|---|---|
| **D1** conduct-аксиомы | v2 CONFIRMED, v1 CONFIRMED | MAIN `discovery.directive.xml:220,256,274,288` = `AX_OPERATOR_DIALOGUE_STYLE / AX_DIVERGE_BEFORE_RECOMMEND / AX_NO_PROCESS_NARRATION / AX_PROGRESSIVE_DISCLOSURE` — точно. RC `router.directive.xml:8,68,109,120,129,135,141,158` — все восемь id на месте; `compression.directive.xml:18` Inherited-строка на месте; `audit.directive.xml:27,89` / `code-review.directive.xml:25,87` — полные копии. **Но `AX_PROGRESSIVE_DISCLOSURE` в ядре роутера НЕТ** (`grep` → 0 определений): он определён локально в 7 директивах (`infra:587`, `root:492`, `discover-from-code:197`, `interface:364`, `migration-v1-v2:403`, `readiness:243`, `recover-from-code:253`) и отсутствует у `scope`, `module`, `scaffold`, `execute`, `critic`, `audit`, `code-review`. `AX_READER_WITHOUT_SESSION_CONTEXT` — в ядре (`router:176`) | ЕСТЬ | **ЧАСТИЧНО** — по формулировке самого инварианта B6 (он перечисляет `AX_PROGRESSIVE_DISCLOSURE` в наборе) один из четырёх аксиомов не единичен и не в ядре: 7 копий, и ни одной у двух владельцев, пишущих спеки |
| **D2** prompt markup | v1 CONFIRMED, v2 **REFUTED в мелочи** | MAIN `AGENTS.md:1-11` — блок первым разделом, до «## Project description», формулировки совпадают дословно; замок `scripts/__tests__/directive-markup-contract.test.ts` существует. RC `AGENTS.md:1-3` — сразу «## Project description» ✔; `ai/kit/AUTHORING.md:8` ✔; каталог `scripts/__tests__/` в RC отсутствует ✔. **Но заявленный `grep 'HTML-like\|prompt markup\|xmllint' AGENTS.md → 0` неверен**: `AGENTS.md:59` содержит `xmllint` («запуск parser/validator (включая `xmllint`) по целевому пути») — в разделе MANDATORY HANDOFF PROTOCOL, к директивам не относится | ЧАСТИЧНО | **ЧАСТИЧНО** (вердикт верен; evidence-строку исправить) |
| **D3.1** критик read-only | CONFIRMED (с оговоркой) | RC `critic-protocol.directive.xml:5` `AX_READ_ONLY` — дословно; `critic.directive.xml:57-62` STEP_3_REPORT «Never edit, never persist a round journal, never ask to continue the same reviewer» ✔. MAIN `critic-protocol.xml:9` (`AX_READ_ONLY`), `critic.directive.xml:9-10` — B6 указал `:10` для read-only, там `AX_ISOLATION`/`AX_ISOLATION_SIGNAL` | ЕСТЬ | **ЕСТЬ** — но держится на `critic.directive.xml`, а не на протоколе (см. ниже) |
| **D3.2** CLEAN терминален | CONFIRMED | RC `critic.directive.xml:59` ✔, `critic-protocol.directive.xml:17` ✔ (STEP_3_REPORT). MAIN `AX_CLEAN_TERMINAL` — `critic.directive.xml:12`, а не в диапазоне «:4-27» как единый блок (диапазон включает Mission) | ЕСТЬ | **ЕСТЬ** |
| **D3.3** evidence у находки | v2 CONFIRMED, v1 **WRONG-LINE** | RC `critic.directive.xml:59-61` ✔; `critic-protocol.directive.xml:17` ✔; `ai/kit/axiom/critic/ax-default-accept.xml` существует и не собран ✔ (подтверждено моим скриптом: `AX_DEFAULT_ACCEPT` в списке 88). **v1-цитата `critic.directive.xml:81-85` неверна**: `AX_FINDING_EVIDENCE` — `:16`, `AX_DEFAULT_ACCEPT` — `:17`; строки 81-85 — это `<Pattern>`-блок (`AP_SPIN`, `AP_POLISH_SPIN`, `AP_OVEREDIT`, `AP_CONFUSION_TO_EDIT`, `AP_VAGUE_REJECT`) | ЕСТЬ/НЕТ смешанный | **ЧАСТИЧНО** (как у B6 по существу) |
| **D3.4** триаж непонимания | CONFIRMED, но вердикт занижен | RC `critic-protocol.directive.xml:4` (`AX_ISOLATION`) буквально: «Confusion → underspecification, not a question to ask»; `:7` `AX_UNCERTAINTY_IS_SIGNAL` «"I don't understand X" is valid output. Uncertainty = underspecification». MAIN `critic-protocol.xml:10`: «Missing project context may explain confusion; **confusion alone never proves that the artifact is underspecified** (AX_CONFUSION_TRIAGE)»; `:13` — трёхчленный `ARTIFACT_GAP` / `CONTEXT_MISSING` / `NON_BLOCKING_QUESTION` + «Only ARTIFACT_GAP may become a problem finding, and only after AX_FINDING_PROVENANCE passes». `ax-confusion-bug.xml` не собран ✔ | ЧАСТИЧНО | **НЕТ (инверсия)** — v2 утверждает обратное v1, а не «упрощённое». Совпадает с пропущенным инвариантом из V-A1 |
| **D3.5** кап 5 раундов | CONFIRMED | `grep AX_CAP_5` по **всему** `ai/directives/` → 0 ✔. `ai/kit/axiom/process/ax-cap-5.xml` — 6 строк (B6 пишет 7), содержание совпадает («если раунд внёс правки, CLEAN недоступен»). Незамкнутый цикл подтверждён: `review-lifecycle.directive.xml:34` («at most five evidence-backed findings»), `:50-52` («Any semantic edit resets the applicable approval markers to `pending` and therefore requires one fresh STEP_2 review»), `:53` (второй кап на findings). `ai/skills/sdd-critic/SKILL.md` Mission — дословно как в цитате | НЕТ | **НЕТ** |
| **D3.6** `Polish: off` | v2 CONFIRMED, v1 **WRONG-LINE** | `ax-polish-mode.xml` существует, не собран ✔; в rendered-дереве нет ✔. **v1-цитата `critic.directive.xml:169` неверна**: `AX_POLISH_MODE` — `:27`; `:169` — строка формата журнала «- Mode: <baseline\|verification>» | НЕТ | **НЕТ** |
| **D3.7** изоляция критика | CONFIRMED, вердикт занижен | RC `critic-protocol.directive.xml:4` — расширение через `npx gennady sdd-extract <dep> VISION` ✔. **Но носитель недостижим**: `grep -rn 'critic-protocol' <rc>` по коду/директивам/скиллам не даёт ни одного `READ_AND_USE_DIRECTIVE` и ни одного упоминания по имени; файл числится class 3 в `ai/kit/delta-assembly.ts:52` («no incoming edge» — это ГАРАНТИЯ, охраняемая тестом). У второго class-3 файла консумент есть (`execute.directive.xml:220` «Load `phase-execution-protocol.directive.xml`»), у `critic-protocol` — нет; `review-lifecycle.directive.xml:31` дispatch'ит «one fresh reviewer», не называя протокол; `critic.directive.xml` (66 строк) протокол не упоминает | ЕСТЬ | **ЧАСТИЧНО** — правило сформулировано, но ни один поток его не грузит |
| **D4.1** вердикт вычисляется | CONFIRMED | RC `audit/steps/STEP_3_ROUTE.xml:24-36` — три буллета, таблицы нет, «print which row matched» нет ✔. MAIN `audit.directive.xml:117` — «**Overall status is computed from severities, never judged.** First matching row wins; print which row matched» + таблица `:119+` | ЧАСТИЧНО | **ЧАСТИЧНО** |
| **D4.2** три статуса | CONFIRMED | `STEP_3_ROUTE.xml:16,27` ✔; `execute.directive.xml:136` ✔ | ЕСТЬ | **ЕСТЬ** |
| **D4.3** PASS_RISK от прежнего решения | CONFIRMED | `STEP_3_ROUTE.xml:16-24` дословно, включая liveness-проверку Decision Log через `AX_AUDIT_YAGNI_CROSSCHECK` ✔ | ЕСТЬ | **ЕСТЬ** |
| **D4.4** `LOW` не даёт FAIL | CONFIRMED | MAIN `audit.directive.xml:98-102` — дословно «A `LOW` finding never causes `FAIL`, opens an Execution Round, or authorizes an artifact change». RC: правила нет; `ax-severity-tagging.xml` — 13 строк, первая строка `<!-- source: ai/directives/sdd/audit.directive.xml -->` ✔ | НЕТ | **НЕТ** |
| **D4.5** семантика MAJOR/MINOR | CONFIRMED | MAIN `:104-112` — «`MAJOR` only when it makes required behavior, scope, remediation ownership, or verification ambiguous or unprovable». RC `ax-severity-tagging.xml:8-9,12` — «protocol violation» / «stylistic or secondary discrepancy» ✔ | НЕТ | **НЕТ** |
| **D4.6** заявленная верификация без evidence | CONFIRMED | MAIN `:114-115` ✔. RC — только `audit/steps/STEP_1_MECHANICAL.xml:68` «Always re-derive the gate yourself rather than trust the worker's logged `ver` lines» ✔ | ЧАСТИЧНО | **ЧАСТИЧНО** |
| **D4.7** проектные находки capped at MINOR | **REFUTED (evidence)** | Заявлено «`grep 'RULE_FILE_INCOMPLETE\|rule-file-fix\|capped at' ai/directives/sdd-v2` → 0». Факт: `RULE_FILE_INCOMPLETE` есть **дважды** — `audit/steps/STEP_2_SEMANTIC.xml:134` (строка таксономии, **дословно совпадает** с MAIN `audit.directive.xml:85`) и rendered `audit.directive.xml:188` (строка маршрутизации «ticket update … OR a separate rule-maintenance task»). `capped` → 0 ✔, `rule-file-fix` → 0 ✔. Потеряны: кап (MAIN `:125`), адресат `rule-file-fix` (MAIN `:137`) и гарантия «Never `ticket-update`, never a phase owner, **never `FAIL` for this task**» (MAIN `:155`). Дополнительно неверно «`ax-finding-routing.xml` (собран в `audit.directive.xml:173`)»: библиотечный партиал **не подключён нигде** (`grep 'ax-finding-routing' ai/kit/templates/` → 0), rendered-определение приходит из инлайна `ai/kit/templates/sdd-v2/audit.directive.hbs:104` | НЕТ | **ЧАСТИЧНО** — таксономия и маршрут пережили, кап и «never FAIL» потеряны |
| **D5.1** механическая правда из `sdd-check` | CONFIRMED | `STEP_1_MECHANICAL.xml` — ровно 8 `<ToolCall>` ✔; `:80` «PASS is never the verdict when any gate is red OR any gate …» ✔; `AX_MECHANICAL_VIA_SDD_CHECK` инлайном в `audit.directive.hbs:32` → rendered `:105` ✔, при живом библиотечном файле ✔ | ЕСТЬ | **ЕСТЬ** |
| **D5.2** независимая нумерация | CONFIRMED | `formats/audit-round.xml:13` (shape), `:39` дословно ✔ | ЕСТЬ | **ЕСТЬ** |
| **D5.3** append-only | CONFIRMED | `formats/audit-round.xml:37` ✔ | ЕСТЬ | **ЕСТЬ** |
| **D5.4** PASS без reopen не пишется | CONFIRMED (off-by-one) | `formats/audit-round.xml:38` ✔; `AX_EPHEMERAL_OUTPUT` определён в `STEP_3_ROUTE.xml:**60**`, не `:61` | ЕСТЬ | **ЕСТЬ** |
| **D5.5** `[REOPENS]` из причинности | CONFIRMED | `formats/audit-round.xml:15` — поле `triggered-reopen=<Round-M+1\|none>` ✔; `grep 'REOPENS\|triggered-reopen' shared/sdd/*.ts cli/cmd/sdd-check/*.ts` → 0 ✔; `Reopens` в RC живёт только как колонка трекера и поле Meta (`shared/sdd/templates.ts:1251,1440,1522`) ✔; `ax-stale-after-pivot-verification.xml` не собран ✔ (мой скрипт: 4 висячие ссылки). Дополнение: **v1-носитель проверки — `ai/skills/sdd-execute/scripts/check.sh`** (тесты `scripts/__tests__/sdd-check-log.test.ts:231-342`), B6 его не называет | ЧАСТИЧНО | **ЧАСТИЧНО** |
| **D5.6** post-close запись | не проверял (вне трека) | — | ЕСТЬ | без изменений |
| **D6** SSOT по ссылке | CONFIRMED | MAIN `scaffold.directive.xml:136-145` — буллет «A scenario's expected outcome REFERENCES the spec's canonical fact by anchor … Concrete input instances in `Given` stay literal» на `:145` ✔; `:267` `AX_SSOT_TRACEABILITY` ✔; `audit.directive.xml:281` `dangling-spec-ref` advisory ✔. RC `scaffold.directive.xml:154` и `formats/task-ticket-structure.xml:9` — короткая формулировка ✔; `ai/kit/axiom/boundary/ax-ssot-traceability.xml` — 4-строчный до-`8bb38477` снимок, не собран ✔; `dangling-spec-ref` → 0 ✔; буллет про якорь в `ax-ticket-has-bdd-and-tests.xml` отсутствует ✔ | ЧАСТИЧНО | **ЧАСТИЧНО** |
| **D7.1** scope lock фазы | CONFIRMED | `phase-execution-protocol/steps/STEP_1_ORIENT.xml:20` `AX_PHASE_SCOPE_LOCK`, tombstones + «one permitted ticket mutation … `sdd-verify`» + `H_OUT_OF_PHASE_WRITE` ✔ | ЕСТЬ | **ЕСТЬ** |
| **D7.2** ERROR OWNERSHIP | CONFIRMED | MAIN `phase-execution-protocol.xml:39` — абзац дословно («A repo-wide gate that fails inside ANOTHER phase's `Target Files` is that phase's work … including a file you never opened whose build your diff broke»). RC `ai/kit/axiom/process/ax-phase-scope-lock.xml` — абзаца нет; `grep "ANOTHER phase"` по всему `ai/directives/` → 0 ✔ | НЕТ | **НЕТ** |
| **D7.3** разрешённые bash-команды | CONFIRMED | `ax-permitted-bash-commands.xml` — ровно 55 строк ✔, `grep 'permitted-bash' ai/kit/templates/` → 0 ✔, 4 ссылки из rendered ✔ (мой скрипт: `STEP_1_MECHANICAL:78`, `execute:53`, `infra:417`, `STEP_3_VERIFY:28`), `:51-54` «Ticket §5 commands are **not** a phase-agent exemption» ✔ | НЕТ | **НЕТ** |
| **D7.4** типизированная эскалация | CONFIRMED + усиление | `AX_BLOCKER_ESCALATION` в `ai/directives/sdd-v2/**` → 0 ✔; `phase-execution-protocol.directive.xml` — **ни одного** `<HaltConditions>` ✔ (и в `.hbs` тоже); `execute.directive.xml:166-167` `H_PHASE_BLOCKED` / `H_REAL_GATE_RED` ✔. **Усиление:** `H_BLOCKED` не существует нигде в `phase-execution-protocol*` — значит комментарий `ai/kit/audit-halt-activation.mjs:138-141` неверен **в обеих половинах** (и «review-lifecycle includes ax-permitted-bash-commands», и «`H_BLOCKED` is declared … in phase-execution-protocol.directive.hbs's own `<HaltConditions>`»); B6 называет только первую | ЧАСТИЧНО | **ЧАСТИЧНО** |
| **D7.5** типизированный Handoff | CONFIRMED | `STEP_4_HANDOFF.xml:14` `AX_HANDOFF_TYPED` + `HANDOFF_FORMAT:18-32` с полем `deviations` ✔ | ЕСТЬ | **ЕСТЬ** |
| **D7.6** проверка перед Handoff | CONFIRMED | `STEP_3_VERIFY.xml:14` `AX_VERIFICATION_BEFORE_HANDOFF` ✔ | ЕСТЬ | **ЕСТЬ** |
| **D8.1–D8.3** | не перепроверял поштучно (не в списке фокуса) | — | ЕСТЬ | без изменений |
| **D8.4** Round close ≠ DONE | CONFIRMED | `AX_AUDIT_HOOK` — 5 ссылок ровно по указанным адресам (мой скрипт), определение не собрано ✔ | ЧАСТИЧНО | **ЧАСТИЧНО** |
| **D8.5** наследование модели | CONFIRMED | `ax-critic-model-tier.xml` не собран ✔ (в списке 88); `execute.directive.xml:183` «Model session identity is irrelevant to correctness» ✔ | НЕПРИМЕНИМО | **НЕПРИМЕНИМО** |
| **D9** языковой проход | CONFIRMED | `AX_LANG_PASS_ON_WRITE` → 0, `ai/directives/language/` отсутствует ✔; `AX_ARTIFACT_STYLE_SELF_CHECK` определён ровно в 4 директивах (`infra:207`, `discover-from-code:37`, `interface:140`, `recover-from-code:69`) ✔; `scope.directive.xml:8` и `module.directive.xml:8` — `deps="AX_TOOL_INVOCATION"` и только ✔; `scope.directive.xml:74-86` STEP_2_FILL — один whole-document `Write`, «structural self-check», языкового прохода нет ✔. **Уточнение:** один из 4 носителей (`recover-from-code`) недостижим (см. § Скиллы), то есть фактических носителей 3 | ЧАСТИЧНО | **ЧАСТИЧНО** |
| **14.1** provable-progress | CONFIRMED | MAIN `ai/skills/sdd-execute/SKILL.md:185-190` («No-progress means none of those transitions occurred, including an equivalent blocking set with neither new evidence nor a different in-scope remediation») и `:279-283` (анти-паттерн) ✔. RC: `grep 'no new evidence\|same finding\|no-progress' execute.directive.xml` → 0 ✔; `H_REAL_GATE_RED` — кап на гейт ✔ | НЕТ | **НЕТ** |
| **14.2** runtime-утверждения от evidence | CONFIRMED | `STEP_1_MECHANICAL.xml:17,68` ✔ | ЕСТЬ | **ЕСТЬ** |
| **14.6** batch = серийный планировщик | CONFIRMED + усиление | MAIN `sdd-execute-batch/SKILL.md:3` («one task at a time»), `:13` («Why serial lanes: every task currently shares one working tree»), `:114` («Parallel task lanes in one working tree») ✔. RC `execute.directive.xml:103` `AX_TASK_PARALLEL` ✔, `:182-183` ✔, `ai/skills/README.md:63` ✔, `cli/cmd/sdd-verify/help.ts:30` snapshot ✔. **Усиление:** текст `AX_TASK_PARALLEL` в `execute.directive.xml:103` — «**Tasks critiqued** in DAG layers…» — дословная копия v1-**критиковой** аксиомы (`MAIN critic.directive.xml:26`), перенесённая в исполнение без адаптации глагола. То есть параллель в execute не «решена», а унаследована из чужого контекста | НЕТ (регрессия) | **НЕТ (регрессия)** |
| **#16** нет «DIRECTIVE ACTIVATED» | CONFIRMED | RC: только определение (`router.directive.xml:130`, `ax-no-process-narration.xml:3`) ✔; `ai/skills/sdd-audit/SKILL.md:12` ✔. MAIN: ровно 8 нарушителей — `sdd-{discover,continue,scaffold,fix,infra,module-decomposition,setup}/SKILL.md` + `plugins/golang/skills/sdd-infra-golang/SKILL.md` ✔ | ЕСТЬ | **ЕСТЬ** |
| **#21** конвенции в read-set критика | CONFIRMED | `formats/task-ticket-structure.xml:43` и `scaffold.directive.xml:188` — оба буквально «subset of `contract` \| `unit` \| `integration` \| `e2e`» ✔; `## Conventions` / `## Decision Log` — `formats/module-tasks-index.xml:28-30` (B6 пишет `:27,30-31`) ✔; `grep '3-tasks'` в `critic.directive.xml` и `critic-protocol.directive.xml` → 0 ✔ | ЧАСТИЧНО | **ЧАСТИЧНО** (усугубляется недостижимостью протокола) |
| **#22** `measured/reported/assumed` | CONFIRMED | `STEP_4_HANDOFF.xml:18-32` — четыре поля, тегов нет, у `open` нет extent ✔ | ЧАСТИЧНО | **ЧАСТИЧНО** |
| **#19** git-fixture исключение | CONFIRMED | `ax-permitted-bash-commands.xml`: `mktemp` → 0, `git init` → 0; `:24-29` — git-чтения только когда шаг «names a real gap», мутирующий git — только publish/commit-шагу ✔ | НЕТ | **НЕТ** |

### Дополнительно найденное (не отражено в B6)

1. **`AX_BLOCKER_ESCALATION` висит и вне `sdd-v2`.** Ссылки: `ai/directives/infra/nodejs-npm-setup.xml:89,93` («Halt `H_BLOCKED` per `AX_BLOCKER_ESCALATION`») и `ai/directives/infra/git-setup.xml:100`. Определения нет ни в одном дереве директив. Предложенный `lint-axioms` (T-B6-08) сканирует rendered `sdd-v2/**` — эти три ссылки он не увидит, если область не расширить на `ai/directives/**`.
2. **Инлайн в `>1` шаблоне.** Кроме 4 «двудомных» id, есть 3 аксиома, инлайненных в несколько шаблонов сразу: `AX_NO_DUPLICATION` (4 шаблона), `AX_OPERATOR_LANGUAGE` (2), `AX_SPEC_MANDATORY_DIAGRAM` (2) — прямое подтверждение правила, которое B6 предлагает в §4.4 п.5.
3. **cwd-зависимость воспроизведена.** `sh -c 'cd <scratchpad> && node --experimental-strip-types --test <rc>/ai/kit/__tests__/delta-assembly.test.ts'` → `# pass 10 / # fail 1` (падает «every generated directive file equals the plan-driven render (build is not stale)»); тот же файл из корня RC → `# pass 11 / # fail 0`. Методическая заметка §0 верна.

---

## § Скиллы

**Маршруты роутера — CONFIRMED построчно.** `ai/directives/sdd-v2/router.directive.xml`
STEP_2_ROUTE (`:370-396`, `<Goal>Load exactly one owner</Goal>`), первое совпадение выигрывает.
Все 12 строк таблицы B6 совпали с фактическими номерами (`:374-375` migration, `:376-377` scaffold,
`:378-379` execute, `:380-381` critic, `:382-383` reconcile, `:384-385` root, `:386-387`
discover-from-code, `:388-389` module, `:390-391` infra, `:392-393` interface, `:394-395` scope,
`:396` `H_AMBIGUOUS_INTENT`). Словарь intent'ов `:348-349` ✔. Forced-intents — ровно четыре
(`:345`: «`scaffold`, `execute`, `critic`, or …»), то есть утверждение B6 про `project-setup` /
`new-scope` / `evolve-scope` / `module-decomposition` вне forced-набора **верно**.

**Роcтер RC — CONFIRMED.** `ai/skills/`: 12 каталогов (`sdd`, `sdd-scaffold`, `sdd-execute`,
`sdd-critic`, `sdd-reconcile`, `sdd-check`, `sdd-audit`, `sdd-code-review` + `agent-inbox`,
`opencode-get-session`, `prd-interview`, `workspace-permission-setup`), `README.md:3` «8 SDD-навыков»
✔; `sdd-hooks-install` отсутствует ✔; `alt-opinion` в RC нет ✔; `opencode-get-session` в MAIN нет ✔.

**messenger-evidence — CONFIRMED (read-only, только `ls`/`find`/`grep`).**
`/Users/k.lebedev/Developer/messenger`: `.claude/skills` — ровно 16 (13 из gennady + `lang-lint`,
`run-e2e`, `uikit-component-generate`) ✔; `find tasks -name '*.md'` = **341** ✔; 10 scope-каталогов
✔. Счётчики упоминаний воспроизвелись до единицы: `sdd-fix` **228**, `sdd-critic` 30,
`sdd-scaffold` 20, `sdd-check` 17, `sdd-continue` 12, `sdd-module-decomposition` 5,
`sdd-execute-batch` 4, `sdd-discover` 1, `sdd-audit`/`sdd-setup`/`sdd-infra`/`sdd-infra-golang` 0 ✔.
`sdd-execute` у меня 374 против заявленных 370 — разница ровно 4 = вхождения `sdd-execute-batch`,
то есть B6 корректно вычел их.

| v1-скилл | Проверка носителя v2 | Вердикт B6 | Мой вердикт |
|---|---|---|---|
| `sdd-setup` | `root.directive.xml:3` («Owner of `specs/README.md` — the Project Portal: Vision + Scope Graph + Scopes table»), `:24` `AX_PORTAL_PRIMARY_OWNER` («Other flows MUST NOT rewrite this file»), STEP_3_INFRA_BOOTSTRAP `:316`, портал-write `:334-336` — все CONFIRMED | ПОКРЫТО | **ПОКРЫТО** — согласен, включая оговорку про не-forced `project-setup` |
| `sdd-discover` | `router:394-395` / `:390-391` / `:392-393` ✔; `interview-protocol.directive.xml` ровно **447** строк ✔; 4 амплификатора (`amplify-{nfr,observability,security,storage}`) ✔ | ПОКРЫТО | **ПОКРЫТО** |
| `sdd-continue` (refine) | `infra.directive.xml:16` («Modes: greenfield · refine · pivot · rewrite»), `:41` — CONFIRMED | ПОКРЫТО (для infra/interface) | **ПОКРЫТО** для infrastructure/interface; для product/library слово `refine` у `scope.directive.xml` есть только в классификации режима `:55-56`, при том что `:57-58` предписывает «read in full and replaced as a whole» — то есть refine продуктовой спеки тоже сводится к перезаписи. Формально не гап, но замечание стоит внести в T-B6-01 |
| `sdd-continue` (pivot) | CONFIRMED целиком: `AX_PIVOT_REQUIRES_SUPERSESSION` определён в `infra:111`, `interface:84`, `migration-v1-v2:55` (+ наследуется в `compression:18`) и **не** в `scope`/`module`; `H_REWRITE_WITH_DOWNSTREAM` — только `infra:231` и `interface:162`; «Pivot Invalidation List» — `infra`, `interface`, `migration-v1-v2`, `formats/{pivot,product-spec,library-spec,infrastructure-spec}-*`, `audit/steps/STEP_2_SEMANTIC.xml`, но не `scope.directive.xml`; `scope.directive.xml:57-58` — «Existing specs are read in full and replaced as a whole» | ГАП | **ГАП** — согласен, самый весомый вердикт §2 |
| `sdd-module-decomposition` | `router:388-389` ✔, `module.directive.xml` ровно **130** строк ✔, `:55` ✔, `deps="AX_TOOL_INVOCATION"` и только ✔; все 8 названных аксиомов закрытого мира — в моём списке несобранных ✔; 4 из них ещё и висячие (`AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE`, `AX_CONTRACTS_TEXTUAL_AGNOSTIC`, `AX_CLOSED_WORLD_INVENTORY`, `AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP`) | ЧАСТИЧНО | **ЧАСТИЧНО** |
| `sdd-critic` | `router:380-381` ✔, `critic.directive.xml` 66 строк ✔. **Но `critic-protocol.directive.xml` не грузится ничем** (см. § Инварианты D3.7): половина заявленного покрытия — недостижимый файл | ЧАСТИЧНО | **ЧАСТИЧНО**, но по двум причинам вместо одной: (а) незамкнутый цикл `review-lifecycle`, (б) осиротевший протокол |
| `sdd-scaffold` | `router:376-377` ✔, 7 step-пакетов ✔, `formats/scope-tasks-index.xml:16-22` Cascade Table ✔, `scaffold/steps/STEP_5_OPERATOR_APPROVAL_2.xml` существует ✔; `AX_RULES_RESOLUTION_HARD_FAIL` / `AX_RULES_CASCADE_RESOLUTION` / `AX_RULE_ACTIVATION_PLAN` / `AX_RULES_LOAD_FROM_PHASE_BLOCK` — все четыре в списке несобранных ✔ | ПОКРЫТО (форма) | **ЧАСТИЧНО** — «ПОКРЫТО по форме» при четырёх несобранных правилах резолюции правил вводит в заблуждение в сводке; содержательно текст B6 честен |
| `sdd-execute` | `router:378-379` ✔; `execute.directive.xml` — ровно 8 `<Step>` и 13 `<ToolCall>` ✔; `phase-execution-protocol/steps` — 4 пакета ✔ | ПОКРЫТО (каркас) | **ПОКРЫТО** по каркасу |
| `sdd-execute-batch` | `execute.directive.xml:181-183` ✔, `:328-334` STEP_7 ✔, `deviation-review.directive.xml` существует ✔ | ЧАСТИЧНО + НЕ НУЖЕН как скилл | **ЧАСТИЧНО** — согласен; регрессия серийности подтверждена и усилена (текст `AX_TASK_PARALLEL` — копия критиковой аксиомы) |
| `sdd-audit` | `ai/skills/sdd-audit/SKILL.md:13-15` — дословно «No `sdd-state`/PREFLIGHT gate here by design … This skill is the odd one out in the family on purpose, not by omission» ✔; `audit.directive.xml` + 3 step-пакета ✔ | ПОКРЫТО | **ПОКРЫТО** |
| `sdd-check` | `ai/skills/sdd-check/SKILL.md:9-10` — дословно «`check` does not load a directive — the logic lives entirely in the `sdd-check` tool (`shared/sdd/check.ts`)» ✔ | ПОКРЫТО | **ПОКРЫТО** |
| `sdd-fix` | `router:382-383` ✔; `reconcile.directive.xml` ровно **408** строк ✔; `:1` keywords ✔, `:56` `AX_MODE_AUTO_DETECT_OR_HALT` ✔, `:96` `AX_REOPEN_FORMAT` ✔, `:133` `H_AMBIGUOUS_MODE` ✔, `:147` авто-детект ✔, `:247` и `:292` `<LogicSwitch>` ✔; `AX_DISPATCH_VIA_BATCH` в списке несобранных ✔ | ПОКРЫТО + дефицит | **ПОКРЫТО** |
| `sdd-infra` | `router:390-391` ✔; `infra.directive.xml` 621 строка / **9592 токена** (замер воспроизведён) ✔; `:75` категории ✔, `:83` матчинг по `knowledge.xml` `<Triggers>` ✔, `:317` `<LogicSwitch on="stack typicality">` (B6 пишет `:315-320` — блок начинается на `:317`), `:406` и `:430-432` node-хардкод ✔ | ЧАСТИЧНО | **ЧАСТИЧНО** |
| `sdd-infra-golang` | В RC нет `plugins/`, нет `gennady verify`, нет `ai/directives/coding/go-rules.xml` ✔ (реестр см. § Детект стека) | ГАП + НЕ НУЖЕН как скилл | **ГАП** — согласен, включая разбор на (а) пресет, (б) VERIFY, (в) аксиомы |

**Дефект сводки §2.2.** Таблица подписана «ПОКРЫТО (6)», но перечисляет 8 позиций;
«ГАП (2)» и «НЕ НУЖНО как отдельный скилл (2)» пересекаются по `sdd-infra-golang` и
`sdd-execute-batch`, поэтому «8 + 4 + 2 + 2» не сходится с «13 позиций матрицы». Цифры в скобках
надо привести к списку (8 / 4 / 2, с пометкой «из них 2 — не нужны как скилл»).

**Сирота, не найденный B6.** `ai/directives/sdd-v2/recover-from-code.directive.xml`
(3590 токенов, 4-й носитель `AX_ARTIFACT_STYLE_SELF_CHECK` и один из 7 носителей
`AX_PROGRESSIVE_DISCLOSURE`) **не достижим**: intent `recover-from-code` роутер отправляет в
`discover-from-code.directive.xml` (`router:386-387`), и во всём дереве (`ai/directives`, `ai/skills`,
`cli`, `shared`) нет ни одной ссылки на `recover-from-code.directive`. Это, во-первых, ещё один
пункт к «§4-гигиене сборки», во-вторых — минус один носитель к D9.

---

## § Детект стека и согласованность с B1

### Проверка фактов §3.1 (все CONFIRMED)

| Утверждение B6 | Проверка |
|---|---|
| Стека нет среди входов preflight-гейта | `ai/kit/contract/process/readiness-preflight-gate.xml:2` — `<LogicSwitch on="FLOW_VERSION · requested AUTHORING_SCOPE line(s) · EXECUTION_READY · GATE_QUEUE · blast radius">`, 10 кейсов; стека нет ✔ |
| «Инфраструктура» выбирается по scope-type портала | `router:390-391` ✔ |
| `package.json`/`npm`/`node` в роутере — 0 | подтверждено ✔ |
| Портал-формат без колонки стека | `formats/portal-structure.xml:28` — `\| Scope \| Type \| Spec \| Description \|`; пример-строка `infra-base` несёт «TS + pnpm + vitest + biome» прозой в Description ✔ |
| `shared/sdd/portal.ts:12-23` — `{name,type,status,description,specPath}` | ✔ дословно |
| Строки `STACK=` не существует | `grep 'STACK=' cli shared` → **0** ✔. Уточнение: перечень печатаемых строк в §3.1 неполон — между `READINESS=` и `EXECUTION_READY=` печатается ещё `AUTHORING_READY=` (`sdd-state.types.ts`), это важно для T-B6-06 («добавлять строку после существующих») |
| Единственная точка решения о стеке — `infra.directive.xml:315-320` | блок `<LogicSwitch on="stack typicality">` начинается на `:317`; выбирает EXPRESS vs полное интервью ✔ |
| Cascade Table в примерах node-only | `formats/scope-tasks-index.xml:18` заголовок `\| Tier \| coding \| testing \| architecture \| infra \|`, строки-примеры `typescript-rules`, `vitest-rules`, `eslint-setup`, `node-test` ✔ |
| Реестр `knowledge.xml`: RC 14 id, MAIN +5 | **точное совпадение**: RC = `typescript-rules svelte5-runes sveltekit-rules testing-common vitest-rules node-test playwright-cli playwright-e2e storybook-usage svelte-testing eslint-setup git-setup nodejs-npm-setup storybook-setup`; MAIN = те же + `result-conventions baseline-rules python-rules go-rules baseline-testing`; в RC физически нет `ai/directives/coding/{baseline,go,python,result-conventions}-rules.xml` и `ai/directives/testing/baseline-testing.xml` ✔ |
| `workspace-permission-setup/SKILL.md:31-41` — единственная мультистековая таблица детекта | ✔ 8 строк (`package.json`, `pyproject.toml`/`requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile`, `Makefile`, `Dockerfile`, `mise.toml`/`.tool-versions`) |
| `resolve-verify-commands.logic.ts:34-72` `DETECTOR_ROWS` | ✔ (сверено с B1 §4.3 — совпадает) |

### Оценка вариантов A / B / C

Разбор **F1–F4** (детектированный стек → `sdd-state`; объявленный → infra-спека; навигационный →
портал; расхождение → аудит) я считаю **корректным и лучшим из двух документов**: он единственный
объясняет, почему нельзя положить факт в портал (портал — авторский артефакт, а не наблюдение).
Аргумент «стек — параметр владельца, а не критерий выбора владельца» подкреплён процитированным
`router.directive.xml:209-230` `KernelGrammar` и выдерживает проверку: добавление ветвей на стек
действительно умножает 12 маршрутов.

Отклонение варианта **C** (стек как scope-type) обосновано верно (ортогональность «что это» и
«на чём это работает»). Вариант **B** оценён честно: `gennady.yaml` в RC отсутствует, и это
действительно новая сущность. Рекомендация **A + оговорка B** («`stack.use` сужает, а не
назначает») совпадает с B1 §4.4 п.1, где та же формулировка выведена из
`services/stack/stack-registry.ts:44-64` MAIN. **Согласен с рекомендацией.**

Один незакрытый вопрос, который не задан ни в B6 §3.6, ни в B1 §3.7: **кто владеет колонкой
`Stack` в портале**, если портал по `root.directive.xml:24` `AX_PORTAL_PRIMARY_OWNER` пишет только
`root`, а стек становится известен `infra`-флоу позже. Либо `root` пишет колонку по данным
`sdd-state`, либо нужен явный исключающий буллет к `AX_PORTAL_PRIMARY_OWNER`. Это надо внести в
`Q1` §3.6.

### Противоречия B6 §3 ↔ B1 §4

| # | B6 | B1 | Кто прав |
|---|---|---|---|
| 1 | §3.1: реестр RC содержит 14 правил (полный список) | §4.4 п.7: «в RC зарегистрированы только `typescript-rules`, `sveltekit-rules`, `vitest-rules`» | **B6**. Проверено: 14 `<Rule id=>` в `ai/directives/knowledge.xml` RC. B1 надо исправить |
| 2 | §3.1: MAIN дополнительно несёт `result-conventions`, `baseline-rules`, `python-rules`, `go-rules`, `baseline-testing` (5) | §4.4 п.7: перечисляет 3 (`baseline-rules`, `go-rules`, `python-rules`) | **B6** (5 записей и 5 файлов; `result-conventions.xml` и `baseline-testing.xml` в MAIN есть) |
| 3 | §3.2: колонка `Stack` в портале + поле `stack?` в `portal.ts` — обязательный шов (F3) | §4.4: пять потребителей стека, портала среди них нет | **не противоречие, а разный охват**; но задачи T-B6-06 и B1-задачи по детектору **пересекаются по одному и тому же файлу-источнику** (`detectStacks`) — нужен один владелец, иначе будет два детектора. B1 §4.4 уже формулирует ровно этот инвариант («одна функция, без повторного эвристического угадывания»), B6 §3.4 его дублирует — надо оставить одну формулировку в одном треке |
| 4 | §3.4: восемь npm-скриптов остаются node-пресетом, канон = «семь обязанностей» | §4.2: `REQUIRED_SCRIPTS` — 8 имён; B1 §3.7 Q3 предлагает интерфейс + node-адаптер + anystack-адаптер сразу | согласуется; но **число обязанностей расходится**: B6 говорит «семь обязанностей», список же содержит **восемь** скриптов (`type-check, test, test:coverage, format, format:fix, lint, lint:fix, fix`). Либо назвать восемь, либо объяснить свёртку (`format`/`format:fix` и `lint`/`lint:fix` — это read-only и mutating рунги одной обязанности, тогда обязанностей шесть). Формулировку надо уточнить, иначе она попадёт в директиву как неверное число |
| 5 | §3.5: `anystack` «матчит всегда» — перенос `plugins/anystack/anystack-plugin.ts:24-34` из MAIN | §4.4 п.1 и §3.7 Q6/Q7: то же, плюс порядок стеков | согласуется, B1 детальнее (порядок `anystack → golang → python → swift`) |
| 6 | §3.6 Q2: мультистек — «норма или ошибка?» | §4.4 п.1: «мультистек — нормальный режим, как в v1 (`verify.cmd.ts:160-179`)» | **B1 уже отвечает** на Q2 фактом v1. Q2 стоит переформулировать как «мультистек — норма (факт v1); нужен ли halt для *конфликтующих* манифестов в одном корне» |

Итог по §3: **фактически безупречно, вывод верен, два противоречия с B1 разрешаются в пользу B6**,
одно (число обязанностей) требует правки в самом B6.

---

## § Сборка / аксиомы / бюджеты

### Независимый пересчёт висячих ссылок

Скрипт (свой, не B6): обход всех 70 `.xml` в `ai/directives/sdd-v2/**`, сбор `<Axiom id="…">` как
определений и `\bAX_[A-Z0-9_]+\b` как упоминаний, вычитание определённых **в любом файле дерева**
(это покрывает и наследование через delta-assembly), сверка с библиотекой `ai/kit/axiom/**`.

```
files scanned: 70 | defined in tree: 164 | mentioned ids: 184
DANGLING (mentioned in sdd-v2 tree, not defined there): 20
```

**Совпадение с §4.1 — полное, по всем 20 id, по числу ссылок и по `file:line`.** Список
(в моём порядке; `lib=` — файл библиотеки или `NONE`):

| Axiom | lib | ссылок | адреса |
|---|---|---|---|
| `AX_AUDIT_HOOK` | `process/ax-audit-hook.xml` | 5 | `audit/steps/STEP_1_MECHANICAL.xml:86`, `audit.directive.xml:8`, `code-review.directive.xml:6`, `execute.directive.xml:60`, `scaffold/steps/STEP_1_DERIVE.xml:31` |
| `AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE` | `spec/…` | 5 | `formats/dbc-contracts.xml:112,133`, `formats/entity-surface-format.xml:6,28`, `formats/module-spec-structure.xml:2` |
| `AX_PERMITTED_BASH_COMMANDS` | `process/…` | 4 | `audit/steps/STEP_1_MECHANICAL.xml:78`, `execute.directive.xml:53`, `infra.directive.xml:417`, `phase-execution-protocol/steps/STEP_3_VERIFY.xml:28` |
| `AX_STALE_AFTER_PIVOT_VERIFICATION` | `audit/…` | 4 | `formats/pivot-formats.xml:31`, `infra.directive.xml:117`, `interface.directive.xml:90`, `migration-v1-v2.directive.xml:61` |
| `AX_DEVIATION_SELF_RESOLVE` | `process/…` | 3 | `execute.directive.xml:117,139`, `phase-execution-protocol/steps/STEP_4_HANDOFF.xml:28` |
| `AX_CONTRACTS_TEXTUAL_AGNOSTIC` | `spec/…` | 3 | `formats/dbc-contracts.xml:78,131`, `scaffold/steps/STEP_2_MATERIALIZE.xml:66` |
| `AX_USAGE_WAIVER_DISCIPLINE` | **NONE** | 3 | `audit.directive.xml:154`, `formats/dbc-contracts.xml:116`, `formats/entity-surface-format.xml:20` |
| `AX_SPEC_PROGRESSIVE_DISCLOSURE` | **NONE** | 6 | `formats/{infrastructure-spec-structure:136, interface-spec-structure:84, library-spec-structure:99, module-spec-structure:4,134, product-spec-structure:114}` |
| `AX_SSOT_TRACEABILITY` · `AX_CLOSED_WORLD_INVENTORY` · `AX_STRICT_NULL` | 2 первых есть, `AX_STRICT_NULL` — NONE | по 2 | как в §4.1 |
| `AX_CATCH_LOG_RECOVER` · `AX_E2E_PROOF_SCREENSHOT_ALWAYS` · `AX_GITIGNORE_BASELINE` · `AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES` · `AX_RUNTIME_BACKING_EXPLICIT` · `AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP` · `AX_YAGNI_OVERENGINEERING_GUARD` · `AX_SPEC_TABLE_IS_INDEX` (NONE) · `AX_REACTION_IS_A_TOOL_CALL` (вне дерева) | — | по 1 | как в §4.1 |

Уточнения к §4.1: `AX_SPEC_PROGRESSIVE_DISCLOSURE` действительно упоминается ещё и в
`ai/kit/contract/spec/module-spec-markdown-structure.xml:5` ✔; `AX_REACTION_IS_A_TOOL_CALL`
определён в `ai/directives/agent-inbox/{inbox-flow,arch-interrogation,posting-rules}.directive.xml`
✔ (то есть класс III описан верно).

### Несобранные аксиомы: 88 из 180 — CONFIRMED поштучно

Мой скрипт по каталогам, релевантным SDD: `process` 56/**21**, `spec` 36/**20**, `audit` 25/**9**,
`scaffold` 20/**10**, `boundary` 16/**13**, `critic` 13/**8**, `truth` 11/**7**, `interview` 3/**0** —
итого 180 / **88**. Списки id совпадают с §4.1 **в точности, включая порядок сортировки**.
Для полноты картины (в B6 не указано): вся библиотека — **427** аксиомов, и **322** из них не
собраны ни в одну директиву `sdd-v2` (остальные каталоги — `coding` 29, `svelte` 34, `testing` 39,
`e2e` 24, `storybook` 22, `infra` 28, `uikit` 17, `error` 16, `typescript` 11, `perf` 9, `logging` 4,
`agent-inbox` 1); это правило-ориентированная часть библиотеки, и она объясняет, почему предложение
T-B6-19 «68 файлов помечены `draft`» недооценено по объёму: помечать придётся выборку из 322, а
критерий «SDD-релевантный каталог» в задаче не зафиксирован.

### Инлайн против партиала — CONFIRMED

Мой скрипт по `ai/kit/templates/sdd-v2/**/*.hbs`: **68 вхождений `<Axiom id=>`, 63 различных id**
(B6 говорит «63 инлайном» — совпадает по различным id). Разбивка совпала: `interview-protocol` 6,
`agent-inbox/enrich` 11, `audit` 4, `recover-from-code` 4, `formats/diagram-vocabulary` 4,
`agent-inbox/synthesize` 4, `router` 3, `preflight-protocol` 3, `infra`/`interface`/
`migration-v1-v2` по 1 (не названы в B6: `agent-inbox/track-review` 20, `agent-inbox/security-lens` 5,
`agent-inbox/code-lens` 1).
**«Два дома» — ровно 4 id, как заявлено**: `AX_EVIDENCE_HYGIENE`, `AX_FINDING_ROUTING`,
`AX_MECHANICAL_VIA_SDD_CHECK`, `AX_OPERATOR_LANGUAGE`.
Добавляю к аргументу B6: **3 id инлайнены сразу в >1 шаблоне** — `AX_NO_DUPLICATION` (4),
`AX_OPERATOR_LANGUAGE` (2), `AX_SPEC_MANDATORY_DIAGRAM` (2); это прямое нарушение правила, которое
B6 предлагает («инвариант, который цитируют две и более директивы, обязан жить партиалом»), и
готовый набор кейсов для `axiom-home.test.ts` (T-B6-18).

### Прогоны бюджетов и свежести (эта сессия, `sh -c 'cd <rc> && …'`)

```
$ node --experimental-strip-types ai/kit/step-budget-gate.ts
✓ every lazy directive under ai/directives/sdd-v2/** is within budget.       (exit 0)

$ node --experimental-strip-types ai/kit/check-directives-fresh.ts
✓ ai/directives/** matches a fresh rebuild.                                  (exit 0)
```

Константы CONFIRMED: `step-budget-gate.ts:36-45` — `SKELETON_TOKEN_TARGET = 6000`,
`SKELETON_TOKEN_LIMIT = 8000`, `PACKAGE_CHAR_LIMIT = 20_000`, `PACKAGE_LINE_CHAR_LIMIT = 2000`;
область действия — `:24-27`, дословно «every other directive stays monolithic and is skipped by the
scan» ✔.

**Замер размеров воспроизведён `countTokens` из `shared/common/tokens.ts` — совпадение до токена:**

| Директива | токены | режим |
|---|---|---|
| `infra.directive.xml` | **9592** | monolith (> hard 8000) |
| `root.directive.xml` | **7572** | monolith (> target) |
| `migration-v1-v2.directive.xml` | **6741** | monolith (> target) |
| `router.directive.xml` | **6094** | monolith (> target) |
| `interview-protocol.directive.xml` | 5925 | monolith |
| `interface` 5587 · `reconcile` 5539 · `execute` 5270 | | monolith |
| `scaffold.directive.xml` | **5085** | **lazy** (под target) |
| `readiness` 4215 · `code-review` 3934 · `recover-from-code` 3590 | | monolith |
| `audit.directive.xml` | **3180** | **lazy** |
| `discover-from-code` 2751 · `scope` 1735 · `module` 1721 · 4×`amplify-*` 1158–1433 · `compression` 1237 · `critic` 841 · `review-lifecycle` 774 · `preflight-protocol` 607 · `critic-protocol` 441 · `deviation-review` 320 · `authoring-interactive` 193 | | monolith |
| `phase-execution-protocol.directive.xml` | **891** | **lazy** |

Мелкая правка: «остальные **16** ≤ 2751» — их **14** (всего 28 верхнеуровневых директив: 3 lazy +
25 монолитов, из которых 11 перечислены в таблице B6).
Вывод B6 («бюджет измеряет три самые маленькие директивы и не измеряет самую большую») —
подтверждён численно и является, по-моему, сильнейшим наблюдением §4.

### Оценка предложений §4.2 и §4.4

- `lintUndefinedAxiomRefs` с вычитанием (а) своих `<Axiom id>`, (б) `deps=`, (в) `<Axiom id>`
  родителей по графу `READ_AND_USE_DIRECTIVE`, (г) allowlist внешних rule-анкоров — **корректно**;
  граф действительно уже строится (`ai/kit/delta-assembly.ts`, `build-directives.ts`).
  **Пробел области:** проверка предлагается только для rendered `sdd-v2/**`, но три висячие
  ссылки на `AX_BLOCKER_ESCALATION` живут в `ai/directives/infra/*.xml`; их надо включить в область
  или явно вынести в отдельную задачу.
- Асимметрия «referenced-but-undefined = error, defined-but-unreferenced = warning» обоснована
  верно и по существующему прецеденту (`audit-contract-activation.mjs` PART 2 «mentioned →
  available», `audit-halt-activation.mjs` «mentioned → declared»).
- Порядок цены в §4.4 (дописать собранный аксиом → собрать несобранный → ядро роутера → lazy-split)
  верен; расчёт «`AX_PERMITTED_BASH_COMMANDS` ≈ 700 токенов в скелет 891 при потолке 8000»
  сходится (55 строк). Вывод «D9 определять локально в `scope`/`module`, а не в ядре» —
  арифметически верен (ядро читается каждым входом).

---

## § Задачи

### Полнота §5

**§5 завершён.** 20 задач `T-B6-01`…`T-B6-20` (нумерация не непрерывна по порядку изложения:
в таблице сначала идут `T-B6-08`, `-09`, `-10`, `-11`, `-12`, потом `-01`…`-05`, потом
`-13`…`-20` — это осознанный порядок приоритета, но читателю мешает; стоит добавить колонку
«приоритет» вместо перестановки id). Все 20 несут Goal / Files / Tests / Size / Eval.
6 решений оператора `Q1`…`Q6`, каждое с вариантами и рекомендацией. Абзац «Порядок» есть.
Обрыва нет.

### Трассируемость «вердикт §1 → задача»

Проверил перекрытие: каждый вердикт **НЕТ**/**ЧАСТИЧНО** из §1 имеет владельца.

| §1 | задача |
|---|---|
| D2 | T-B6-15 |
| D3.3 (`ax-default-accept`), D3.5, D3.6 | T-B6-03 |
| D4.1, D4.4–D4.7 | T-B6-11 |
| D5.5, 14.3 | T-B6-17 |
| D6 | T-B6-13 |
| D7.2, D7.3, D7.4, #19 | T-B6-12 |
| D8.4 (`AX_AUDIT_HOOK`) | T-B6-08 (через lint) — **но собрать аксиом не поручено ни одной задаче**: T-B6-08 лишь делает билд красным, а владельца сборки `ax-audit-hook` в §5 нет |
| D9 | T-B6-14 |
| 14.1 | T-B6-16 |
| 14.6 | T-B6-04 (после Q3) |
| #16 | замка нет и задачи нет (вердикт ЕСТЬ, риск регрессии не закрыт) — можно добавить кейс в T-B6-07 |
| #21 | **владельца нет**: ни одна задача не добавляет `specs/3-tasks.md` / `<module>.3-tasks.md` `## Conventions` в read-set ревьюера |
| #22 | **владельца нет**: тегирование `measured/reported/assumed` в `HANDOFF_FORMAT` не поручено |
| §2 `sdd-continue`(pivot) | T-B6-01 |
| §2 `sdd-module-decomposition` | T-B6-02 |
| §2 `sdd-fix` (`AX_DISPATCH_VIA_BATCH`) | T-B6-05 |
| §3 | T-B6-06 |
| §4.1/4.2 | T-B6-08 |
| §4.3 | T-B6-10 |
| §4.4 п.5 | T-B6-18 |
| §4.2 п.4 | T-B6-19 |
| §1.1 замок | T-B6-20 |

### Зависимости от других треков — что заявлено и что пропущено

| Задача | Заявлено в B6 | Фактически |
|---|---|---|
| T-B6-06 | «**L**, делится; `STACK=` — M и общий с VERIFY», «§3 зависит от трека VERIFY» | Верно, но неполно. `STACK=`/`STACK_SOURCE=` — это **B1 V-05** («детект стека из репозитория + факт в снапшоте», файлы `shared/verify/stack-detection.ts`, `cli/cmd/sdd-state/sdd-state.*`), а деноудизация readiness — **B1 V-06**. Половина «правила + реестр» (`baseline-rules`, `baseline-testing`, `go-rules`, `python-rules`, записи `knowledge.xml`, сужение `<Triggers>` у `typescript-rules`) — это **трек RULES, задача T-1** (там же и `<DependsOn>`-замыкание). То есть T-B6-06 сегодня **дублирует V-05, V-06 и T-1**. Нужно разрезать по владельцам: за B6 остаются только директивно-скилловые швы (колонка `Stack` в портале и её формат, нейтрализация примеров Cascade Table, сборка `AX_RULES_RESOLUTION_HARD_FAIL`, деноудизация текстов `infra`/`readiness` **после** движка, `golang-setup.xml` как rule-файл — и то последнее скорее RULES) |
| T-B6-17 | «G3 (+ G4)» | Механическая половина (`shared/sdd/check.ts` + `check.test.ts`) — это трек **CHECK-LOG (B2)**, а не «G4»; в B6 §1.5 D5.6 сам ссылается «см. трек CHECK-LOG», но в задаче трек не назван |
| T-B6-13 | «companion в `shared/sdd/__tests__/check.test.ts`» | Тот же владелец — B2; назвать явно |
| T-B6-04 | «companion в `cli/cmd/sdd-verify/__tests__`» | Это трек **VERIFY** (снапшот `workspace-mutation`); B1 §4.2 уже фиксирует, что снапшот исключает только `.git`/`node_modules` — прямое подтверждение риска. Назвать B1 как владельца companion'а |
| T-B6-09 | — | cwd-независимость `ai/kit/*` затрагивает и `check-directives-fresh`, который вызывается из релизной проверки; стоит свериться с треком RELEASE (B5) на предмет того, кто вызывает kit-скрипты в упаковке |
| T-B6-15 | — | «ни один скрипт/CI не валидирует `ai/directives` XML-парсером» пересекается с **B4 T-9** (замок поставляемой поверхности, там же констатируется отсутствие `scripts/__tests__/` в RC). Один каталог `scripts/__tests__/` создаётся дважды в двух треках — назначить владельца |
| SYNC (B3) | не упомянут | Прямой зависимости не вижу: скиллы синхронизирует `sync-skills`, и T-B6-07 трогает `cli/cmd/sync-skills/__tests__` — это единственная точка касания, её стоит явно согласовать с треком SYNC |

### Пропущенные задачи (мои)

1. **`critic-protocol.directive.xml` — сирота.** Либо назвать его в dispatch-промпте
   (`review-lifecycle.directive.xml` STEP_2 и/или `critic.directive.xml` STEP_2_REVIEW), либо
   слить в `critic.directive.hbs` и удалить class-3-запись из `ai/kit/delta-assembly.ts:52`.
   Замок: тест «каждая class-3 директива названа хотя бы одним dispatch-текстом» — у
   `phase-execution-protocol` он проходит (`execute.directive.xml:220`), у `critic-protocol` нет.
   Без этой задачи T-B6-03 собирает `ax-default-accept`/`ax-polish-mode` в файл, который никто
   не читает.
2. **`recover-from-code.directive.xml` — сирота** (3590 токенов в поставке, ноль ссылок). Решить:
   маршрут (переименовать intent или добавить ветвь) либо удаление.
3. **Восстановить `AX_CONFUSION_TRIAGE`** (инверсия D3.4). Сегодня это не «добрать до трёхчленного
   триажа», а **откатить утверждение**: `AX_ISOLATION:4` и `AX_UNCERTAINTY_IS_SIGNAL:7` прямо
   противоречат v1. Отдельная задача, а не строка в T-B6-03.
4. **Расширить область `lint-axioms` на `ai/directives/**`** (или отдельная задача на три висячие
   ссылки `AX_BLOCKER_ESCALATION` в `ai/directives/infra/{nodejs-npm-setup,git-setup}.xml`).
5. **Собрать `ax-audit-hook`** — 5 ссылок, самый цитируемый висячий аксиом, и ни одна задача его
   не подключает.
6. **`AX_PROGRESSIVE_DISCLOSURE`: один дом.** 7 локальных определений; ни одного у `scope`,
   `module`, `scaffold`, `execute`, `critic`. T-B6-20 закрывает это только если в его Goal
   зафиксирован набор `REQUIRED_CONDUCT` из §1.1 — сегодня Goal сформулирован общо.
7. **Исправить комментарий `ai/kit/audit-halt-activation.mjs:135-141` целиком** — T-B6-12
   упоминает только первую половину («review-lifecycle includes ax-permitted-bash-commands»),
   а вторая («`H_BLOCKED` … declared … in phase-execution-protocol.directive.hbs's own
   `<HaltConditions>`») тоже ложна: `H_BLOCKED` в этом шаблоне отсутствует.

### Оценка §5.2 (решения оператора)

`Q1` (долг vs заготовка, рекомендация «c» — гибрид) — соглашаюсь; но объём варианта (b)
недооценён: инвентаризировать придётся не 88, а выборку из 322 несобранных файлов библиотеки.
`Q2` (рекомендация «b» — error + сокращающийся `KNOWN_DANGLING`) — согласен, прецедент
`ALLOWLIST_CROSS_DIRECTIVE_REFS` реален. `Q3` — вопрос поставлен верно, но выбор (c) отвергнут
слишком мягко: свидетельство против него уже механическое (снапшот `sdd-verify` наблюдает всё
дерево). `Q4` (рекомендация «b») — согласен. `Q5` (рекомендация «c») — согласен, доказательство из
messenger воспроизведено. `Q6` (рекомендация «a», один лимит) — согласен; замечу, что «единый
лимит» без lazy-split немедленно роняет билд на `infra`, поэтому T-B6-10 обязан идти раньше
включения гейта на монолиты (в B6 это следует из порядка, но не сказано прямо).

---

## § Правки к B6

Сгруппировано по обязательности. «Блокирующие» — те, где текст утверждает неверный факт или
недооценивает вердикт.

### Блокирующие (5)

1. **§1.4 D4.7 — переписать evidence и вердикт.** Убрать «`grep 'RULE_FILE_INCOMPLETE|rule-file-fix|capped at' ai/directives/sdd-v2` → 0».
   Факт: `RULE_FILE_INCOMPLETE` присутствует в `audit/steps/STEP_2_SEMANTIC.xml:134` (дословная
   копия MAIN `audit.directive.xml:85`) и в rendered `audit.directive.xml:188` (строка
   маршрутизации). К нулю сводятся только `capped` и `rule-file-fix`. Вердикт **НЕТ → ЧАСТИЧНО**,
   формулировка потери: «кап `MINOR` (MAIN `:125`), адресат `rule-file-fix` (MAIN `:137`) и
   гарантия „never `FAIL` for this task“ (MAIN `:155`)». Там же убрать «`ax-finding-routing.xml`
   (собран в `audit.directive.xml:173`)» — библиотечный партиал не подключён нигде, rendered-текст
   приходит из инлайна `audit.directive.hbs:104`; это делает D4.7 ещё одним примером §4.4 п.5.
2. **§1.3 D3.4 — вердикт ЧАСТИЧНО → НЕТ (инверсия).** Добавить прямое сопоставление
   RC `critic-protocol.directive.xml:4` «Confusion → underspecification, not a question to ask»
   против MAIN `critic-protocol.xml:10` «confusion alone never proves that the artifact is
   underspecified (AX_CONFUSION_TRIAGE)» и MAIN `:13` (трёхчленный триаж + «Only ARTIFACT_GAP may
   become a problem finding»). Сослаться на V-A1.
3. **§1.3 D3.7 и §2 строка `sdd-critic` — учесть, что `critic-protocol.directive.xml` ничем не
   загружается.** Ни `READ_AND_USE_DIRECTIVE`, ни имени в прозе; class 3 в
   `ai/kit/delta-assembly.ts:52` означает «нет входящего ребра» как гарантию, но у второго class-3
   файла консумент есть (`execute.directive.xml:220`), а у этого — нет. D3.7 **ЕСТЬ → ЧАСТИЧНО**;
   в §5 добавить задачу (см. § Задачи, п.1).
4. **§1.1 D1 — вердикт ЕСТЬ → ЧАСТИЧНО.** `AX_PROGRESSIVE_DISCLOSURE`, названный в самом
   инварианте, в ядре роутера отсутствует; он определён локально в 7 директивах
   (`infra:587`, `root:492`, `discover-from-code:197`, `interface:364`, `migration-v1-v2:403`,
   `readiness:243`, `recover-from-code:253`) и отсутствует у `scope`, `module`, `scaffold`,
   `execute`, `critic`, `audit`, `code-review`. Тезис «одно определение вместо восьми копий» верен
   для трёх из четырёх аксиомов набора.
5. **§1.12 — арифметика.** 19+13+11+2 = **45**, а не 46; сумма размеров групп тоже 45. С правками
   1–4 сводка становится **17 / 15 / 11 / 2**.

### Точные (7)

6. **§1.3 D3.3** — v1-цитата `critic.directive.xml:81-85` → `:16` (`AX_FINDING_EVIDENCE`) и `:17`
   (`AX_DEFAULT_ACCEPT`); `:81-85` — блок `<Pattern>` (`AP_SPIN`…`AP_VAGUE_REJECT`), из которого к
   делу относится только `AP_CONFUSION_TO_EDIT:85`, и то к D3.4.
7. **§1.3 D3.6** — v1-цитата `critic.directive.xml:169` → `:27` (`AX_POLISH_MODE`); `:169` — строка
   шаблона журнала.
8. **§1.2 D2** — убрать «`grep 'HTML-like|prompt markup|xmllint' AGENTS.md` → 0»: `xmllint` есть в
   RC `AGENTS.md:59` (раздел MANDATORY HANDOFF PROTOCOL, к директивам не относится). Вердикт не
   меняется, но evidence в текущем виде опровергается одним grep'ом.
9. **§1.5 D5.4** — `AX_EPHEMERAL_OUTPUT` определён в `audit/steps/STEP_3_ROUTE.xml:60`, не `:61`.
   **§1.5 D5.5** — добавить v1-носителя механической проверки: `ai/skills/sdd-execute/scripts/check.sh`
   (тесты `scripts/__tests__/sdd-check-log.test.ts:231-342`), иначе непонятно, что именно потеряно.
10. **§1.3 D3.5** — `ax-cap-5.xml` — 6 строк, не 7. **§2 `sdd-infra`** — `<LogicSwitch on="stack
    typicality">` начинается на `infra.directive.xml:317`. **§1.11 #21** — `## Conventions` /
    `## Decision Log` — `formats/module-tasks-index.xml:28-30`.
11. **§4.3** — «остальные **16** ≤ 2751» → **14** (28 верхнеуровневых директив: 3 lazy + 25
    монолитов, 11 из них перечислены).
12. **§2.2** — привести цифры к списку: ПОКРЫТО **8** (а не 6), ЧАСТИЧНО 4, ГАП 2, и убрать
    двойной счёт «НЕ НУЖНО (2)», который пересекается с ГАП и ЧАСТИЧНО.

### Усиления, которые стоит внести (6)

13. **§1.10 п.14.6** — добавить, что `AX_TASK_PARALLEL` в `execute.directive.xml:103` — дословная
    копия v1-**критиковой** аксиомы (`MAIN critic.directive.xml:26`, «Tasks **critiqued** in DAG
    layers»): в v2 она перенесена в исполнение вместе с глаголом. Это сильнее текущей формулировки
    «v2 разрешил ровно то, что v1 запретил»: правило не пересматривалось, а переехало не туда.
14. **§1.7 D7.4** — комментарий `ai/kit/audit-halt-activation.mjs:135-141` ложен **в обеих
    половинах**: `H_BLOCKED` не существует ни в `phase-execution-protocol.directive.hbs`, ни в
    rendered-дереве.
15. **§4.1/§4.2** — область предлагаемого линта: три висячие ссылки на `AX_BLOCKER_ESCALATION`
    живут в `ai/directives/infra/nodejs-npm-setup.xml:89,93` и `git-setup.xml:100`; линт по
    `sdd-v2/**` их не увидит.
16. **§4.4 п.5** — добавить второй класс дрейфа: 3 аксиома инлайнены сразу в несколько шаблонов
    (`AX_NO_DUPLICATION` ×4, `AX_OPERATOR_LANGUAGE` ×2, `AX_SPEC_MANDATORY_DIAGRAM` ×2) — готовые
    кейсы для `axiom-home.test.ts`.
17. **§3.4** — «семь обязанностей» против `REQUIRED_SCRIPTS` из **восьми** имён
    (`shared/sdd/readiness.ts:15-22`): либо восемь, либо объяснить свёртку read-only/mutating рунгов.
    Иначе неверное число уедет в директиву.
18. **§3.6 Q1** — добавить подвопрос: кто пишет колонку `Stack` в портале при
    `AX_PORTAL_PRIMARY_OWNER` (`root.directive.xml:24` «Other flows MUST NOT rewrite this file»),
    если стек становится известен `infra`-флоу.
19. **§4.2 п.4 / T-B6-19** — «68 заготовок» относится к SDD-выборке; в библиотеке 427 аксиомов, из
    них 322 не собраны — критерий выборки надо зафиксировать в задаче.
20. **§5** — добавить сирот и пропущенные владельцы (см. § Задачи, «Пропущенные задачи», 7 пунктов)
    и назвать треки-владельцев companion-тестов явно (VERIFY = B1 V-05/V-06, RULES = B4 T-1/T-9,
    CHECK-LOG = B2), чтобы T-B6-06/13/15/17 не дублировали чужие задачи.

### Что править НЕ нужно

§4.1 (все 20 висячих ссылок), §4.3 (все числа), §4.4 п.5 (63 инлайна, 4 «двудомных» id), §2
(все маршруты роутера и все `file:line` носителей), §3.1 (весь стол фактов, включая реестр
`knowledge.xml`), §0 (методическая заметка про cwd — воспроизведена), messenger-evidence
(воспроизведена до единицы). Прогоны `step-budget-gate.ts` и `check-directives-fresh.ts` зелены —
факт §0 подтверждён.
