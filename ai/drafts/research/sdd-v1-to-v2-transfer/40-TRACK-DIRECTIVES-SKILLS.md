# 40 — Трек DIRECTIVES & SKILLS: инварианты v1 → аксиомы v2, скиллы → роутер, детект стека, сборка

> Статус: ВЕРИФИЦИРОВАНО (B6 + V-B6, правки применены). Ждёт решений оператора (§5.2).

## Как читать

Это чистовая версия трека DIRECTIVES & SKILLS после независимой перепроверки. Сырой двухчастный
исходник (аналитик B6 + верификатор V-B6) сохранён без изменений в
[`_raw/40-TRACK-DIRECTIVES-SKILLS.raw.md`](_raw/40-TRACK-DIRECTIVES-SKILLS.raw.md). Все блокирующие
и точные правки из «§ Правки к B6» (Часть II) применены в тексте ниже: 4 изменённых вердикта (D1,
D3.4, D3.7, D4.7), исправленная арифметика §1.12 (**45**, не 46; сводка **17/15/11/2**, не 19/13/11/2),
исправленные `file:line` (D3.3, D3.6, D5.4, ложная evidence-строка D2), исправленная сводка §2.2
(ПОКРЫТО **8**, не «6» с двойным счётом «НЕ НУЖНО (2)»), два ранее не найденных сироты и два усиления
в §4, «семь обязанностей» → **восемь** в §3.4, дедупликация задач §5 против треков VERIFY (B1) /
CHECK-LOG (B2) / RULES (B4) и семь новых задач **T-B6-21…27** на сирот и пропущенных владельцев.

Где чистовой текст расходится с сырым источником — побеждает эта версия (Часть II верификатора
учтена как финальная правка).

---

## 0. Источники, роли деревьев, рамка решений

**Роли деревьев.**

- **MAIN (v1, `origin/main` 8bb38477)** — `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e`.
  `ai/directives/sdd/*.xml` (12 директив + `README.md`), `ai/skills/*` (16),
  `plugins/golang/skills/sdd-infra-golang/SKILL.md`, `docs/sdd-flow.md`,
  `scripts/__tests__/*.test.ts` (11 файлов).
- **RC (v2, `codex/sdd-v2-rc52-followup` 11291af5)** — `…/scratchpad/rc-v6`.
  `ai/directives/sdd-v2/**` (70 XML, 622 428 байт) из `ai/kit/templates/sdd-v2/**` (30 верхних `.hbs`
  + `agent-inbox/` + `formats/`), `ai/kit/axiom/**` (427 файлов), `ai/skills/*` (12).

**Рамка решений оператора** (принята как данность, вердикты выставлены внутри неё):

1. Улучшения директив v1 переносятся **как инварианты** (axiom / contract / halt), не как текст.
2. v2 — полная перестройка со **stateless-роутером**; v1-скилл без v2-аналога должен быть
   **доказан необходимым** (показан use-case, который нельзя закрыть улучшением v2-потока).
3. Выбор инфраструктуры/стека **детектируется из репозитория** (сегодня v2 предполагает node).
4. v1 заморожен: правки идут только в v2.

**Что прогнано в RC (evidence этой сессии, read-only).** Все пять kit-аудитов зелёные
(`npm --prefix <rc> run <script>`, `cd` не использовался):

| Прогон | Результат |
|---|---|
| `check:directives-fresh` | `✓ ai/directives/** matches a fresh rebuild.` |
| `audit:axioms` | `✓ axiom-activation audit clean — 28 template(s) checked.` |
| `audit:contracts` | `✓ contract-activation audit clean — 28 template(s) + 33 assembled directive(s) checked.` |
| `audit:halts` | `✓ halt-activation audit clean — 33 template(s) + 33 assembled directive(s) checked.` |
| `check:directive-budgets` | `✓ every lazy directive under ai/directives/sdd-v2/** is within budget.` |
| `ai/kit/__tests__/*.test.ts` (14 файлов) | 185 тестов: 184 pass, 0 fail, 1 skipped |
| `cli/__tests__/directive-tool-contract/**` | 45 тестов: 45 pass, 0 fail (6 сюит) |

**Методическая ловушка (cwd).** Все три kit-скрипта и часть kit-тестов позиционно зависят от cwd:
запущенные из чужого cwd, `build-directives.test.ts`, `delta-assembly.test.ts` и
`skeleton-package-binding.guard.test.ts` дают 3 ложных FAIL, потому что `assembly-manifest.json`
резолвится от `process.cwd()`. Верификатор воспроизвёл это независимо (`sh -c 'cd <scratchpad> && …
delta-assembly.test.ts'` → `pass 10 / fail 1`; из корня RC → `pass 11 / fail 0`). Не баг директив,
но ловушка для CI и для аудитора — задача **T-B6-09**.

**Главный структурный факт трека.** В RC **нет каталога `scripts/__tests__/`**. Все четыре
контрактных теста MAIN, фиксировавших инварианты директив v1, физически отсутствуют:
`critic-directive-contract.test.ts` (5 кейсов), `directive-markup-contract.test.ts` (1),
`sdd-adaptive-execution-contract.test.ts` (6), `sdd-review-lifecycle-contract.test.ts` (24).
Замена в v2 — `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` (16 кейсов в 3 сюитах) +
`cli/__tests__/directive-tool-contract/**` (45 кейсов) + 4 kit-аудита. Пересечение по смыслу —
частичное: новые замки держат statelessness, границы утверждений и вызываемость инструментов, но
ни один из 36 старых кейсов не перенесён как таковой.

---

## 1. Инварианты директив v1 → v2

Формат строки: инвариант сформулирован как **проверяемое утверждение**; носитель в v2 с `file:line`;
вердикт; чем замкнуть. Вердикты: **ЕСТЬ** · **ЧАСТИЧНО** · **НЕТ** · **НЕПРИМЕНИМО** (модель v2
устранила предмет).

### 1.1 D1 — операторские аксиомы диалога во всех SDD-директивах

**Инвариант.** Каждая директива, которая пишет оператору, несёт (сама или наследует от ядра)
`AX_OPERATOR_DIALOGUE_STYLE`, `AX_NO_PROCESS_NARRATION`, `AX_PROGRESSIVE_DISCLOSURE`,
`AX_DIVERGE_BEFORE_RECOMMEND`; протоколы интервью / критика / визуального словаря существуют как
отдельные загружаемые файлы.

**v1.** Аксиомы дублированы в 7 директивах (`discovery.directive.xml:220,256,274,288`;
`module-decomposition.directive.xml:238,265,283,297`; `scaffold.directive.xml:319,346,360`;
`critic.directive.xml:41`; `fix.directive.xml:144,180,194`; `setup.directive.xml:92,119`;
`phase-execution-protocol.xml:201,228`; `svelte-ui-discovery.directive.xml:106,153,171,185`).
Протоколы: `critic-protocol.xml`, `interview-protocol.xml`, `visual-vocabulary.xml`.

**v2.** Ядро роутера несёт восемь аксиомов: `router.directive.xml:8` `AX_OPERATOR_LANGUAGE`, `:68`
`AX_OPERATOR_DIALOGUE_STYLE`, `:109` `AX_DIALOGUE_DISCIPLINE`, `:120` `AX_OPERATOR_SAFEGUARD`, `:129`
`AX_NO_PROCESS_NARRATION`, `:135` `AX_OPERATOR_OUTPUT_LIVE_TEXT`, `:141` `AX_DIVERGE_BEFORE_RECOMMEND`,
`:158` `AX_SCALE_PROPORTIONAL_DEPTH`. Наследование печатается явно (`compression.directive.xml:18`).
Директивы, загружаемые **вне** роутера (skill → директива напрямую), несут полные копии
(`audit.directive.xml:27,89`, `code-review.directive.xml:25,87`) — правильно, `sdd-audit`/
`sdd-code-review` роутер не проходят. Протоколы: `interview-protocol.directive.xml` (447 LOC),
`critic-protocol.directive.xml`, `formats/diagram-vocabulary.xml` (портирован из
`visual-vocabulary.xml`).

**Вердикт: ЧАСТИЧНО** (V-B6: было ЕСТЬ). Три из четырёх аксиомов набора — единое определение вместо
восьми копий, это верно. Но **`AX_PROGRESSIVE_DISCLOSURE` в ядре роутера НЕТ** (`grep` → 0
определений в `router.directive.xml`): он определён **локально в 7 директивах** (`infra:587`,
`root:492`, `discover-from-code:197`, `interface:364`, `migration-v1-v2:403`, `readiness:243`,
`recover-from-code:253`) и отсутствует у `scope`, `module`, `scaffold`, `execute`, `critic`, `audit`,
`code-review` — ровно у тех владельцев, которые чаще всего пишут оператору длинные артефакты.

**Замок в v2.** `ai/kit/__tests__/deps.test.ts` уже держит половину («router exposes a non-trivial
core» + «every declared dep is in the router core»). Не хватает обратной проверки: «каждый
**operator-facing** владелец либо определяет, либо объявляет в `deps=` весь набор conduct-аксиом».
Добавить кейс со списком `REQUIRED_CONDUCT = [AX_OPERATOR_DIALOGUE_STYLE, AX_NO_PROCESS_NARRATION,
AX_PROGRESSIVE_DISCLOSURE, AX_DIVERGE_BEFORE_RECOMMEND, AX_READER_WITHOUT_SESSION_CONTEXT]` (T-B6-20,
конкретизировано T-B6-26 для `AX_PROGRESSIVE_DISCLOSURE`).

### 1.2 D2 — директивы это HTML-like prompt markup, а не XML

**Инвариант.** В корневом руководстве агента объявлено, что `ai/directives/**/*.xml` — prompt
markup, а не XML-документы; XML-валидатор к ним не применяется.

**v1.** `AGENTS.md:1-11` — блок «## Directive markup — mandatory» стоит **первым**: «Не запускай
XML parser/validator (`xmllint` и аналоги)». Замок: `directive-markup-contract.test.ts`.

**v2.** В `AGENTS.md` RC этого блока нет; `AGENTS.md:1-5` начинается сразу с «## Project
description». Факт выжил только в `ai/kit/AUTHORING.md:8` — документе для автора **шаблонов**,
который агент, работающий с проектом, не читает. Тест-замка нет.

**Вердикт: ЧАСТИЧНО.** Риск конкретен: агент, увидев `.xml`, тянется к `xmllint`/парсеру и
«починит» экранирование — в v2 это ломает 70 файлов. *(V-B6: evidence-строка исходника была ложной
— «`grep 'HTML-like\|prompt markup\|xmllint' AGENTS.md` → 0» неверна: `AGENTS.md:59` содержит
`xmllint`, но в разделе MANDATORY HANDOFF PROTOCOL, не о директивах. Вердикт от этого не меняется.)*

**Замок в v2.** Перенести блок в `AGENTS.md` RC первым разделом; добавить кейс «AGENTS.md declares
directive markup as prompt text before the project description» + «no repository script invokes an
XML validator over ai/directives» (grep по `scripts/`, `package.json`, `.github/workflows/`).

### 1.3 D3 / PR #8 — граница критика

Пять инвариантов; в v2 предмет частично устранён сознательно.

| # | Инвариант | v1 | v2 | Вердикт |
|---|---|---|---|---|
| D3.1 | Критик read-only: не редактирует артефакт, не пишет журнал раундов | `critic-protocol.xml:9` (`AX_READ_ONLY`) | `critic-protocol.directive.xml:5` `AX_READ_ONLY`; `critic.directive.xml:57-62` «Never edit, never persist a round journal, never ask to continue the same reviewer» | **ЕСТЬ** (усилено) |
| D3.2 | `CLEAN` терминален на любом раунде — минимума раундов нет | `critic.directive.xml:12` `AX_CLEAN_TERMINAL` | `critic.directive.xml:59`; `critic-protocol.directive.xml:17` | **ЕСТЬ**, по другой причине: в v2 раундов нет — вызов один |
| D3.3 | Блокирующая находка обязана сослаться на существующее требование и предъявить evidence | `critic.directive.xml:16` (`AX_FINDING_EVIDENCE`), `:17` (`AX_DEFAULT_ACCEPT`) | `critic.directive.xml:59-61`; `critic-protocol.directive.xml:17` | **ЧАСТИЧНО**: формат-требование перенесено, `AX_DEFAULT_ACCEPT` («сомнение → принять») существует в библиотеке и **не собран** ни в один шаблон |
| D3.4 | Непонимание триажируется (`ARTIFACT_GAP` / `CONTEXT_MISSING` / `NON_BLOCKING_QUESTION`), а не превращается в работу | `critic-protocol.xml:10` «confusion alone never proves that the artifact is underspecified (AX_CONFUSION_TRIAGE)»; `:13` трёхчленный триаж, «Only ARTIFACT_GAP may become a problem finding» | `critic-protocol.directive.xml:4` «Confusion → underspecification, not a question to ask»; `:7` `AX_UNCERTAINTY_IS_SIGNAL` «Uncertainty = underspecification» | **НЕТ — инверсия**, не упрощение: v2 буквально утверждает обратное v1. `ax-confusion-bug.xml` не собран |
| D3.5 | Пять раундов — аварийный предел (`AX_CAP_5`) | `critic.directive.xml` Mission; `docs/sdd-flow.md` сценарий 6 «5 раундов и не CLEAN → ⛔ MAX_ROUNDS» | `ax-cap-5.xml` существует (6 строк), `grep AX_CAP_5 ai/directives/sdd-v2` → 0 | **НЕТ** |
| D3.6 | `Polish: off` по умолчанию — мелочи не гонят цикл | `critic.directive.xml:27` `AX_POLISH_MODE` | `ax-polish-mode.xml` не собран; в v2 нигде | **НЕТ** |
| D3.7 | Критик получает ТОЛЬКО артефакт + родительскую спеку (`AX_ISOLATION_SIGNAL`) | `critic-protocol.xml:10` | `critic-protocol.directive.xml:4` `AX_ISOLATION` — расширено: bounded target-set + minimal parent + Vision/Goals соседей через `sdd-extract` | **ЧАСТИЧНО**: правило сформулировано и расширено сознательно (закрывает issue #21), но носитель — файл, который **ничем не загружается** (см. ниже) |

**D3.7 — критично: `critic-protocol.directive.xml` не грузится ничем.** Ни одного
`READ_AND_USE_DIRECTIVE`, ни упоминания по имени в прозе — ни в `critic.directive.xml` (66 строк),
ни в `review-lifecycle.directive.xml` (которое диспатчит «one fresh reviewer», не называя протокол).
Это class 3 в `ai/kit/delta-assembly.ts:52` («no incoming edge»); у второго class-3 файла,
`phase-execution-protocol.directive.xml`, консумент есть (`execute.directive.xml:220` называет его
прямо), у `critic-protocol` — нет. *(V-B6, исходник держал на этом файле D3.1/D3.2/D3.3/D3.4/D3.7 и
строку `sdd-critic` в §2, не отметив недостижимость.)* Задача-владелец — **T-B6-21**.

**D3.5 — где именно инвариант нужен в v2.** «В v2 критик одноразовый, кап не нужен» верно для
скилла `sdd-critic` (`SKILL.md:9`: «Do not maintain a durable critic session, automatic five-round
loop, or hidden write state»), но **не** для authoring-потока: `review-lifecycle.directive.xml:45-55`
STEP_3_RECONCILE — «Any semantic edit resets the applicable approval markers to `pending` and
therefore requires one fresh STEP_2 review» — цикл STEP_2 ⇄ STEP_3 существует и **ничем не
ограничен**; `:34`/`:52` капают только количество findings за проход, не число проходов. Практика
v1: `messenger provider-v1.task-135.md:369` — «hard cap on further automated audit rounds reached».

**Замок в v2.** (а) `{{> "axiom/process/ax-cap-5"}}` в `review-lifecycle.directive.hbs`, ссылка на
`AX_CAP_5` в STEP_3. (б) Кейс в `stateless-sdd-flow-contract.test.ts`, сюита «two artifact approval
boundaries»: «bounds the review⇄reconcile cycle». (в) `ax-default-accept` и `ax-polish-mode` —
собрать в `critic-protocol.directive.hbs`. (г) Отдельно от (а)-(в) — вернуть трёхчленный триаж в
`critic-protocol.directive.xml:4/7` (T-B6-23) и решить достижимость файла (T-B6-21), иначе (в)
собирает правила в файл, который никто не читает.

### 1.4 D4 — вердикт аудита вычисляется, а не судится

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| D4.1 | Статус вычисляется из severity по таблице «first matching row wins», агент печатает, какая строка сработала | `audit/steps/STEP_3_ROUTE.xml:24-36` — три буллета `PASS`/`PASS_RISK`/`FAIL`; таблицы и «print which row matched» нет | **ЧАСТИЧНО** |
| D4.2 | Три статуса: `PASS` / `PASS_WITH_ACKNOWLEDGED_RISKS` / `FAIL` | `STEP_3_ROUTE.xml:16,27,121`; `execute.directive.xml:136` | **ЕСТЬ** |
| D4.3 | `PASS_WITH_ACKNOWLEDGED_RISKS` требует **прежнего** решения оператора + запись в Decision Log | `STEP_3_ROUTE.xml:16-24` — «never this subagent's own judgment call — a fact-check against a PRIOR operator acceptance» | **ЕСТЬ** (сильнее v1: liveness-механика Decision Log описана) |
| D4.4 | `LOW` confidence никогда не даёт `FAIL`, не открывает раунд, не авторизует правку | v1 `audit.directive.xml:98-102` дословно | В v2 — нет; `conf=<H\|M\|L>` выжил только как поле формата; `ax-severity-tagging.xml` — 13-строчный снимок до этого улучшения | **НЕТ** |
| D4.5 | `MAJOR`/`MINOR` привязаны к «поведение/область/владение/верификация неоднозначны или недоказуемы», не к «код/проза» | v1 `:104-112` | `ax-severity-tagging.xml:8-9,12` — «protocol violation» / «stylistic or secondary discrepancy» — старая огрублённая формулировка | **НЕТ** |
| D4.6 | Заявленный результат верификации без исполненного evidence = `MAJOR` | v1 `:114-115` | Нет в `ax-severity-tagging`; частично компенсировано `STEP_1_MECHANICAL.xml:68` «re-derive the gate yourself rather than trust the worker's logged `ver` lines» | **ЧАСТИЧНО** |
| D4.7 | Находки уровня проекта (`RULE_FILE_INCOMPLETE`) capped at MINOR, маршрутизируются в `rule-file-fix`, никогда не в FAIL этой задачи | v1 `:85,125,137,155,164` | `RULE_FILE_INCOMPLETE` **присутствует дважды**: `audit/steps/STEP_2_SEMANTIC.xml:134` (дословная копия MAIN `:85`) и rendered `audit.directive.xml:188` (строка маршрутизации). `capped` → 0, `rule-file-fix` → 0. Потеряны: кап `MINOR` (MAIN `:125`), адресат `rule-file-fix` (MAIN `:137`), гарантия «never `FAIL` for this task» (MAIN `:155`) | **ЧАСТИЧНО** |

*(V-B6: D4.7 было НЕТ на ложной evidence-строке «`grep 'RULE_FILE_INCOMPLETE\|rule-file-fix\|capped
at'` → 0» — неверно, таксономия и маршрутизация выжили, потеряны только три конкретных правила. Там
же снята неточность «`ax-finding-routing.xml` собран в `audit.directive.xml:173`» — библиотечный
партиал не подключён нигде, rendered-текст приходит из инлайна `audit.directive.hbs:104`; это ещё
один пример дефекта §4.4 п.5, «два дома у одного id».)*

**Итог D4: ЧАСТИЧНО** (2 ЕСТЬ / 3 ЧАСТИЧНО / 2 НЕТ). Каркас (три статуса, вычисление, liveness
Decision Log) перенесён и в части D4.3 сделан лучше. Ещё живы (частично) кап проектных находок и
«заявленное ≠ доказанное»; полностью потеряны кап `LOW` и семантическое определение `MAJOR`/`MINOR`.
Один и тот же механизм: **аксиомы в `ai/kit/axiom/audit/` — снимки v1-текста, взятые до коммитов
`ac2e9d73 cd7f3e01 139448e3`**, о чём честно написано в первой строке каждого файла (`<!-- source:
ai/directives/sdd/audit.directive.xml -->`).

**Замок.** Дописать `ax-severity-tagging.xml` до v1-состояния (таблица вычисления + confidence-
правило + кап проектных находок), вернуть `RULE_FILE_INCOMPLETE`/`rule-file-fix`/кап в
`ax-finding-routing.xml` и `ax-drift-taxonomy.xml`; кейс в `stateless-sdd-flow-contract.test.ts`:
rendered `STEP_3_ROUTE.xml` содержит «LOW never causes FAIL» и «project-scope finding capped at
MINOR» (**T-B6-11**).

### 1.5 D5 — механическая правда и независимая нумерация аудита

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| D5.1 | Механическая часть читается из `sdd-check`, не переоткрывается глазами | `audit/steps/STEP_1_MECHANICAL.xml` — 8 обязательных `<ToolCall>`; `:80` «PASS is never the verdict when any gate is red». `AX_MECHANICAL_VIA_SDD_CHECK` собран **инлайном** в `.hbs`, в обход библиотечной копии — два дома у одного id (§4.4 п.5) | **ЕСТЬ** |
| D5.2 | Раунды аудита нумеруются независимо от раундов исполнения | `formats/audit-round.xml:13,39` «`N` increments monotonically … independent of Execution Round numbers» | **ЕСТЬ** |
| D5.3 | Audit Rounds — append-only | `formats/audit-round.xml:37` | **ЕСТЬ** |
| D5.4 | `PASS` без reopen не пишется в тикет (эфемерность) | `formats/audit-round.xml:38`; `AX_EPHEMERAL_OUTPUT` определён в `STEP_3_ROUTE.xml:60` | **ЕСТЬ** |
| D5.5 | `[REOPENS]` в Meta выводится из **персистентной причинности аудита**, а не подсчёта `### Round` | Поле есть: `formats/audit-round.xml:15` `triggered-reopen=<Round-M+1\|none>`. Но `grep -rn 'REOPENS\|triggered-reopen' shared/sdd/*.ts cli/cmd/sdd-check/*.ts` → 0 — механической проверки нет; аудитная проверка тоже мертва (`ax-stale-after-pivot-verification.xml` не собран). v1-носитель проверки — `ai/skills/sdd-execute/scripts/check.sh` (тесты `scripts/__tests__/sdd-check-log.test.ts:231-342`) | **ЧАСТИЧНО** |
| D5.6 | `EXECUTION_LOG_INCOMPLETE` ловит запись **после** закрытия раунда | v1 `audit.directive.xml:82`; v2 таксономия — `ax-drift-taxonomy.xml`, собрана в `STEP_2_SEMANTIC.xml`; post-close — `shared/sdd/check.ts` (трек CHECK-LOG / B2) | **ЕСТЬ** (вне этого трека) |

**Замок.** `cli/cmd/sdd-check/__tests__` — кейс `[REOPENS]`: тикет с `triggered-reopen=Round-2`,
`Reopens: 0` → finding; `Reopens: 1` → чисто (владелец кода — **трек CHECK-LOG / B2**, см. §5).
Плюс собрать `ax-stale-after-pivot-verification` в `audit.directive.hbs` — закрывает висячую ссылку
из четырёх мест (§4.1) — **T-B6-17**.

### 1.6 D6 / `8bb38477` — SSOT по ссылке

**Инвариант.** Канонический факт живёт в спеке в одном месте; тикет ссылается на него якорем и
никогда не переписывает литерал. В BDD ожидаемый результат — ссылка на якорь спеки, конкретные
входные данные в `Given` остаются литералами. Аудит выдаёт advisory `INFO` `dangling-spec-ref`, если
якорь не резолвится.

**v1.** `scaffold.directive.xml:136-145` (`AX_TICKET_HAS_BDD_AND_TESTS`), `:267`
(`AX_SSOT_TRACEABILITY`), `audit.directive.xml:281` (`dangling-spec-ref`).

**v2.** Идея названа коротко: `scaffold.directive.xml:154`, `formats/task-ticket-structure.xml:9` —
«Spec content is referenced, never copied (`AX_SSOT_TRACEABILITY`)». Но **сам аксиом не собран**
(`ai/kit/axiom/boundary/ax-ssot-traceability.xml` — 4-строчный снимок до `8bb38477`, `grep
'<Axiom id="AX_SSOT_TRACEABILITY"'` → 0). **BDD-правило отсутствует**:
`ax-ticket-has-bdd-and-tests.xml` получил новые v2-буллеты, но потерял буллет про ссылку по якорю и
литеральный `Given`. `dangling-spec-ref` в v2 нет.

**Вердикт: ЧАСТИЧНО** — идея названа, оба конкретных механизма (BDD-правило и advisory) не
перенесены, несущий аксиом висит.

**Замок.** Обновить `ax-ssot-traceability.xml` до v1-текста и собрать в `scaffold.directive.hbs`;
вернуть буллет в `ax-ticket-has-bdd-and-tests.xml`; кейс «ticket BDD references spec facts by anchor
and keeps Given literals» (**T-B6-13**; companion структурной проверки анкора — `shared/sdd/
__tests__/check.test.ts`, владелец — **трек CHECK-LOG / B2**).

### 1.7 D7 / PR #14 — граница фазового агента

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| D7.1 | Фаза пишет только в свои `Target Files`; тикет — состояние оркестратора | `phase-execution-protocol/steps/STEP_1_ORIENT.xml:20-25` `AX_PHASE_SCOPE_LOCK`, tombstones, «one permitted ticket mutation — the receipt written atomically by the exact `sdd-verify …` command» → иначе `H_OUT_OF_PHASE_WRITE` | **ЕСТЬ** (усилено v2) |
| D7.2 | **ERROR OWNERSHIP:** repo-wide гейт, упавший в `Target Files` ДРУГОЙ фазы, — не твоя работа: не писать туда, не считать своим; всё остальное — твоё, включая файл, который ты не открывал, но чью сборку сломал твой дифф | v1 `phase-execution-protocol.xml:39`, второй абзац `AX_PHASE_SCOPE_LOCK` — дословно | В v2 `ax-phase-scope-lock.xml` этого абзаца нет совсем (`grep "ANOTHER phase"` по всему дереву → 0) | **НЕТ** |
| D7.3 | Разрешённые bash-команды фазы перечислены явно; git/lint/prettier/project-wide сканы запрещены | `ax-permitted-bash-commands.xml` существует (55 строк, переписан для v2), **но `grep 'permitted-bash' ai/kit/templates/'` → 0** — не собран, при 4 живых ссылках на `AX_PERMITTED_BASH_COMMANDS` из rendered-дерева | **НЕТ** (висячая ссылка) |
| D7.4 | Эскалация вместо импровизации: типизированный `BLOCKED` c evidence и категорией причины | `ax-blocker-escalation.xml` существует, не собран (`grep AX_BLOCKER_ESCALATION ai/directives/sdd-v2` → 0). `phase-execution-protocol.directive.xml` — **вообще без `<HaltConditions>`**. У оркестратора частичная замена: `execute.directive.xml:166` `H_PHASE_BLOCKED`, `:234` | **ЧАСТИЧНО**: у оркестратора условие есть, у worker'а — ни аксиома, ни halt |
| D7.5 | Типизированный Handoff по `HANDOFF_FORMAT`; free-form запрещён | `STEP_4_HANDOFF.xml:14-32` `AX_HANDOFF_TYPED` + `HANDOFF_FORMAT` (+ новое поле `deviations`) | **ЕСТЬ** |
| D7.6 | Проверка перед Handoff обязательна и принадлежит инструменту | `STEP_3_VERIFY.xml:14-31` `AX_VERIFICATION_BEFORE_HANDOFF` — включая «канон покрывает тело скрипта, не только имя» | **ЕСТЬ** (сильнее v1) |

**D7.3 дополнение.** `ax-permitted-bash-commands.xml:51-54` — «Ticket §5 commands are **not** a
phase-agent exemption»: даже если бы аксиом собрался, Swift/Go-тикет с `xcodebuild`/`go test` в §5
фаза сама прогнать не может.

**D7.4 — комментарий врёт в обеих половинах.** `ai/kit/audit-halt-activation.mjs:135-141` утверждает
«review-lifecycle.directive.hbs includes `axiom/process/ax-permitted-bash-commands`» (ложно — в
шаблоне подключены четыре других аксиома) **и** «`H_BLOCKED` is declared … in
phase-execution-protocol.directive.hbs's own `<HaltConditions>`» (тоже ложно: `H_BLOCKED` не
существует нигде в `phase-execution-protocol*`, ни в `.hbs`, ни в rendered-дереве). *(V-B6:
исходник называл только первую половину комментария; вторая — отдельная задача **T-B6-27**.)*

**Замок.** (а) Вернуть абзац ERROR OWNERSHIP в `ax-phase-scope-lock.xml`. (б) Собрать
`ax-permitted-bash-commands` и `ax-blocker-escalation` в `phase-execution-protocol.directive.hbs`,
объявить `H_BLOCKED` в `<HaltConditions>` скелета. (в) Кейс «bounds a phase worker's failure
ownership and permitted commands» (**T-B6-12**, companion к issue #19 — фикстурное исключение для
guard-тестов, см. §1.11).

### 1.8 D8 — Task-ID, reopen-формат, «Round close ≠ DONE», наследование модели

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| D8.1 | Task-ID глобально уникален | `scaffold/steps/STEP_2_MATERIALIZE.xml:13,31` `AX_TASK_ID_UNIQUENESS` | **ЕСТЬ** |
| D8.2 | Формат Task-ID `TSK-{PREFIX}-{NNN}` из счётчика README каталога | v2 сменил схему (`<ACR>-<slug>`, выдаёт `sdd-new`) | **НЕПРИМЕНИМО**: инвариант заменён на «ID выдаёт CLI, а не агент» — сильнее |
| D8.3 | Reopen = добавленный Round; прошлые раунды не редактируются; трекеры синхронизируются | `ax-reopen-format.xml`, собран в `reconcile.directive.xml:96`, применён `:192,249` | **ЕСТЬ** |
| D8.4 | Round close ≠ DONE: аудит — отдельный хук после закрытия раунда | `ax-audit-hook.xml` — **не собран**; 5 живых ссылок (`audit.directive.xml:8`, `STEP_1_MECHANICAL.xml:86`, `code-review.directive.xml:6`, `execute.directive.xml:60`, `scaffold/steps/STEP_1_DERIVE.xml:31`). Поведенчески реализовано жёстче v1 (execute STEP_5–STEP_7) | **ЧАСТИЧНО** (поведение есть и лучше; несущий аксиом висит без владельца — **T-B6-25**) |
| D8.5 | Модель, сконфигурированная оператором, наследуется каждым свежим reviewer/executor | v1 `scaffold.directive.xml:443`; в v2 `ax-critic-model-tier.xml` не собран, `execute.directive.xml:183` «Model session identity is irrelevant to correctness» | **НЕПРИМЕНИМО** по решению v2 (stateless); issue #9.5 этим не закрыт — теперь просто нигде не адресован |

### 1.9 D9 — языковой проход при записи спеки

**Инвариант.** Спека не считается «написанной», пока её язык не проверен: перед финальной карточкой
решения выполняется lang-проход по только что записанному файлу; никогда не пропускается.

**v1.** `discovery.directive.xml:320-333`, `module-decomposition.directive.xml:327` —
`AX_LANG_PASS_ON_WRITE`.

**v2.** `AX_LANG_PASS_ON_WRITE` не существует; `ai/directives/language/` в RC нет. Замена по духу —
`ax-artifact-style-self-check.xml`, собрана в 4 директивы: `infra.directive.xml:207`,
`discover-from-code.directive.xml:37`, `interface.directive.xml:140`, `recover-from-code.directive
.xml:69`. **Дыра точно в тех двух местах, откуда инвариант пришёл**: прямые аналоги v1-`discovery`
и v1-`module-decomposition` — `scope.directive.xml` и `module.directive.xml` — этот аксиом **не
несут**: оба объявляют `deps="AX_TOOL_INVOCATION"` и всё, а в ядре роутера этого аксиома нет. Именно
эти два владельца делают единственный whole-document `Write` спеки (`scope.directive.xml:74-86`
STEP_2_FILL). *(V-B6: один из 4 названных носителей, `recover-from-code`, сам недостижим из роутера
— см. §2 — то есть фактических носителей 3.)*

**Вердикт: ЧАСТИЧНО** — замена есть, но не подключена к двум владельцам, которые пишут спеки
продукта и модулей.

**Замок.** Добавить `AX_ARTIFACT_STYLE_SELF_CHECK` в `deps=` (или в ядро) и сослаться в STEP_2_FILL
`scope`/`module`; кейс «every directive that performs a whole-document Write carries the style
self-check» (**T-B6-14**).

### 1.10 PR #14 — адаптивное исполнение (шесть поведений)

| # | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| 14.1 | **Provable-progress repeat**: повтор эквивалентного блокирующего набора без нового evidence → `BLOCKED`, а не ещё один раунд | v1 `sdd-execute/SKILL.md:186-188,281`. v2: `grep 'no new evidence\|same finding\|no-progress' execute.directive.xml` → 0. Ближайшее — `H_REAL_GATE_RED` (кап на гейт, не на находки) | **НЕТ** |
| 14.2 | Runtime-утверждения ведомы evidence: аудит перевыводит гейт сам | `STEP_1_MECHANICAL.xml:17,68` | **ЕСТЬ** |
| 14.3 | `[REOPENS]` определён из персистентной причинности аудита | см. D5.5 | **ЧАСТИЧНО** |
| 14.4 | Нумерация аудита независима | см. D5.2 | **ЕСТЬ** |
| 14.5 | ERROR OWNERSHIP через scope lock | см. D7.2 | **НЕТ** |
| 14.6 | **Batch = серийный планировщик**; параллельные полосы задач в одном рабочем дереве **запрещены** | v1: `sdd-execute-batch/SKILL.md:3,13,114` — «Why serial lanes: every task currently shares one working tree». v2: `execute.directive.xml:103` `AX_TASK_PARALLEL` — «Same layer (no inter-dependencies) → **parallel dispatch**»; `:182-183`; `ai/skills/README.md:63` | **НЕТ — регрессия**: v2 разрешил ровно то, что v1 запретил после болезненного опыта. «Disjoint Target Files» не покрывает общее рабочее дерево: `sdd-verify` снимает snapshot **всего** дерева (`cli/cmd/sdd-verify/help.ts:30`) |

**14.6 — усиление (V-B6).** Текст `AX_TASK_PARALLEL` в `execute.directive.xml:103` — «Tasks
**critiqued** in DAG layers…» — это **дословная копия v1-критиковой аксиомы**
(`MAIN critic.directive.xml:26`), перенесённая в исполнение без адаптации глагола. Правило не
пересматривалось осознанно — оно переехало не туда: параллель в execute не «решена», а унаследована
из чужого контекста.

**Замок 14.1.** Ввести `AX_PROVABLE_PROGRESS` (или собрать `ax-re-dispatch.xml` +
`ax-rejection-reason.xml`, оба не собраны) и halt `H_NO_PROGRESS` в `execute.directive.hbs`
(**T-B6-16**). **Замок 14.6.** Решение оператора (§5.2 Q3): серийность → правило в
`ax-task-parallel.xml` (переписанное, не унаследованное) + кейс «batch never dispatches two tickets
into one working tree concurrently»; параллель остаётся → обязательный worktree-на-полосу
(**T-B6-04**).

### 1.11 Issue-инварианты #16 / #21 / #22 / #19

| Issue | Инвариант | v2 носитель | Вердикт |
|---|---|---|---|
| **#16** | Ни один скилл/dispatch-шаблон не печатает «DIRECTIVE ACTIVATED» | `grep -rn 'DIRECTIVE ACTIVATED\|Announce' <rc>/ai` → только определение аксиома (`router.directive.xml:130`, `ax-no-process-narration.xml:3`); `ai/skills/*/SKILL.md` — 0; `sdd-audit/SKILL.md:12` явно запрещает. **В v1 остаются 8 нарушителей**: `sdd-{discover,continue,infra,setup,fix,scaffold,module-decomposition}/SKILL.md` + `plugins/golang/skills/sdd-infra-golang/SKILL.md:110` | **ЕСТЬ в v2, без замка** (риск регрессии не закрыт тестом — добавить кейс в T-B6-07) |
| **#21** | Изолированный ревьюер видит согласованные конвенции владельца тикета и не переоткрывает решённое | `critic-protocol.directive.xml:4` `AX_ISOLATION` расширен до Vision/Goals через `sdd-extract`; Verification Levels зафиксирована пакетом (`formats/task-ticket-structure.xml:43`, `scaffold.directive.xml:188`). Но конвенции переехали в `specs/3-tasks.md`/`<module>.3-tasks.md` `## Conventions`/`## Decision Log` (`formats/module-tasks-index.xml:28-30`), и `grep '3-tasks' critic.directive.xml critic-protocol.directive.xml` → 0 | **ЧАСТИЧНО**, усугубляется недостижимостью протокола (D3.7) — владельца задачи в §5 не было (**T-B6-21** закрывает достижимость, но не добавляет `3-tasks` в read-set — отдельный дефицит, см. §5 «Пропущенное») |
| **#22** | `decisions`/`open` в Handoff различают `measured`/`reported`/`assumed`; аудит трактует нетегированное как `assumed` | `STEP_4_HANDOFF.xml:18-32` — четыре поля, тегов нет. Смягчение: `sdd-task <ticket> --phase` печатает verbatim прошлые Handoff'ы, `execute.directive.xml:223-224` «Never summarize, retype, or omit» | **ЧАСТИЧНО** — центральный пример issue не закрыт механически, только текстом; владельца в §5 не было |
| **#19** | Фаза, тестирующая guard-скрипт/CI-шаг, может создать throwaway git-репозиторий — исключение, не нарушение | `ax-permitted-bash-commands.xml` (не собран, D7.3): `mktemp`/`git init` отсутствуют в списке «May run»; мутирующий git — только publish/commit-шагу; temp — только `.claude/tmp/`. Fixture-репозиторий запрещён трижды, исключения нет | **НЕТ** |

### 1.12 Сводка §1

| Группа | ЕСТЬ | ЧАСТИЧНО | НЕТ | НЕПРИМЕНИМО |
|---|---|---|---|---|
| D1 D2 | 0 | 2 | 0 | 0 |
| D3 (7 подпунктов) | 2 | 2 | 3 | 0 |
| D4 (7) | 2 | 3 | 2 | 0 |
| D5 (6) | 5 | 1 | 0 | 0 |
| D6 | 0 | 1 | 0 | 0 |
| D7 (6) | 3 | 1 | 2 | 0 |
| D8 (5) | 2 | 1 | 0 | 2 |
| D9 | 0 | 1 | 0 | 0 |
| PR #14 (6) | 2 | 1 | 3 | 0 |
| #16 #21 #22 #19 | 1 | 2 | 1 | 0 |
| **Итого (45 проверяемых утверждений)** | **17** | **15** | **11** | **2** |

*(V-B6: исходник давал 19/13/11/2 и подписывал сумму «46»; сумма столбцов у исходника уже была 45,
только подпись была неверна. Четыре пересмотренных вердикта — D1 (ЕСТЬ→ЧАСТИЧНО), D3.4
(ЧАСТИЧНО→НЕТ), D3.7 (ЕСТЬ→ЧАСТИЧНО), D4.7 (НЕТ→ЧАСТИЧНО) — сдвигают итог к **17/15/11/2**, сумма
групп по-прежнему **45**.)*

Одна причина объясняет большинство «НЕТ»: **аксиомы в `ai/kit/axiom/**` — снимки v1-текста, сделанные
до последних улучшений v1**, плюс 88 из 180 SDD-релевантных аксиомов вообще не собираются ни в одну
директиву (§4). Улучшение v1 не «не перенесли решением» — его перенесли в библиотеку и не подключили
к сборке, а `lint-axioms` эту направленность не проверяет.

---

## 2. Скиллы: 12 SDD-скиллов v1 + `sdd-infra-golang` × use-cases × покрытие v2

### 2.0 Основания

**Решение оператора уже записано в самом RC** — `specs/ai-skills/ai-skills.spec.md:289-290`: было 12
SDD-навыков, каждый — отдельная точка входа; стало 9 (`sdd` — единая дверь-роутер, `sdd-fix` слился
в `sdd-reconcile`, `sdd-execute-batch` — в `sdd-execute`, добавились `sdd-code-review` и
`sdd-hooks-install`).

Фактическая раскладка RC — **8** SDD-скиллов (`ai/skills/README.md:3`): `sdd`, `sdd-scaffold`,
`sdd-execute`, `sdd-critic`, `sdd-reconcile`, `sdd-check`, `sdd-audit`, `sdd-code-review`.
**`sdd-hooks-install` в RC отсутствует** — спека утверждает добавление скилла, которого в дереве нет.

Маршруты роутера (`router.directive.xml:373-397`, «Load exactly one owner», первое совпадение
выигрывает — все 12 строк **подтверждены построчно верификатором**):

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

Словарь intent'ов — `:348-349`: `project-setup · new-scope · evolve-scope · module-decomposition ·
multi-scope · recover-from-code · execute`. Forced-intents — ровно четыре (`:345`).

**Реальное потребление (messenger, `/Users/k.lebedev/Developer/messenger`, read-only).** 16 скиллов
в `.claude/skills/`; 341 тикет в 10 scope-каталогах (**оба числа подтверждены**). Упоминания:

| Скилл | упоминаний | что доказывает |
|---|---|---|
| `sdd-execute` | 370 (374 без вычета `sdd-execute-batch`) | ядро потока |
| **`sdd-fix`** | **228** | Decision Log-провенанс: правки спек, переоткрытие тикетов |
| `sdd-critic` | 30 | «Verdict: NEEDS_WORK (operator-accepted, sdd-continue)» |
| `sdd-scaffold` | 20 | |
| `sdd-check` | 17 | |
| **`sdd-continue`** | **12** | оба режима использованы: refine и **pivot** (Decision Log) |
| `sdd-module-decomposition` | 5 | |
| **`sdd-execute-batch`** | **4** | «Все 16 live-тикетов исполнены через `sdd-execute-batch`» |
| `sdd-discover` | 1 | |
| `sdd-audit`, `sdd-setup`, `sdd-infra`, `sdd-infra-golang` | 0 | не значит «не использовались» — эти потоки не оставляют текстового следа |

Капа критика из практики: `provider-v1.task-135.md:369` — «hard cap on further automated audit
rounds reached».

### 2.1 Матрица

Вердикты: **ПОКРЫТО** · **ЧАСТИЧНО** · **ГАП** (→ задача на маршрут/директиву, **не** новый скилл) ·
**НЕ НУЖНО**.

| v1-скилл | Use-case | v2: маршрут + директива | Вердикт |
|---|---|---|---|
| **`sdd-setup`** | Единственный владелец `specs/README.md`; идемпотентен; bootstrap `infra-base` | `project-setup` → `root.directive.xml` (`router:384-385`). `:3` владение порталом, `:24` `AX_PORTAL_PRIMARY_OWNER`, `:316` STEP_3_INFRA_BOOTSTRAP | **ПОКРЫТО** — дефицит: `project-setup` не forced-intent, `/sdd-setup` как команда не существует |
| **`sdd-discover`** | Новая спека scope любого типа | {new-scope} × scope-type → `scope`/`infra`/`interface` (`router:390-395`); `interview-protocol.directive.xml` (447 LOC) + 4 амплификатора | **ПОКРЫТО** |
| **`sdd-continue`** (refine) | Добавить требования/контракты в существующую спеку | `evolve-scope` → тот же владелец; для infra/interface режимы объявлены прямо (`infra.directive.xml:16,41`) | **ПОКРЫТО** для infrastructure/interface |
| **`sdd-continue`** (pivot) | Заменить архитектурное решение, superseded-запись, Pivot Invalidation List | `AX_PIVOT_REQUIRES_SUPERSESSION` собран в `infra:111`, `interface:84`, `migration-v1-v2:55` — **не** в `scope`/`module`. `H_REWRITE_WITH_DOWNSTREAM` — только `infra:231`, `interface:162`. `scope.directive.xml:57-58` предписывает «read in full and **replaced as a whole**» — pivot продуктовой спеки = перезапись без супрессии, без списка инвалидации, без защиты от существующих тикетов | **ГАП** → T-B6-01 |
| **`sdd-module-decomposition`** | Модульные спеки: closed-world инвентарь, публичные поверхности, DbC | `module-decomposition` → `module.directive.xml` (130 LOC) + `formats/{module-spec-structure,entity-inventory-format,entity-surface-format,dbc-contracts,module-map-update}.xml` | **ЧАСТИЧНО**: маршрут и форматы есть; `AX_CLOSED_WORLD_INVENTORY`, `AX_ENTITY_SURFACE_COMPLETENESS`, `AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE`, `AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP`, `AX_REFINE_MODULE_PRESERVES_CONTRACTS`, `AX_MODULE_BOUNDARY_BY_OPERATOR`, `AX_HIERARCHICAL_SPECS`, `AX_CONTRACTS_TEXTUAL_AGNOSTIC` — **ни один не собран**, `module.directive.xml` объявляет только `deps="AX_TOOL_INVOCATION"` → T-B6-02 |
| **`sdd-critic`** | Раунды критики до CLEAN / max 5, изоляция, Polish off | forced `critic` → `critic.directive.xml` + `critic-protocol.directive.xml` | **ЧАСТИЧНО** — по двум причинам: (а) незамкнутый цикл `review-lifecycle` (§1.3 D3.5), (б) `critic-protocol.directive.xml` осиротевший носитель (D3.7) → T-B6-03 + T-B6-21 |
| **`sdd-scaffold`** | Тикеты из спек — DAG, Cascade Table, Tracker Index, BDD, Phases Overview | forced `scaffold` → 7 step-пакетов; Cascade Table `formats/scope-tasks-index.xml:16-22`; approval #2 `STEP_5_OPERATOR_APPROVAL_2.xml` | **ПОКРЫТО** по форме; `AX_RULES_RESOLUTION_HARD_FAIL`/`AX_RULES_CASCADE_RESOLUTION`/`AX_RULE_ACTIVATION_PLAN`/`AX_RULES_LOAD_FROM_PHASE_BLOCK` — все четыре не собраны (см. §3) |
| **`sdd-execute`** | Одна задача end-to-end; resume; PAUSED на блокерах | forced `execute` → `execute.directive.xml` (8 шагов, 13 `<ToolCall>`) + `phase-execution-protocol` (4 пакета) | **ПОКРЫТО** по каркасу; дыры — §1.7 и §1.10 |
| **`sdd-execute-batch`** | Вся очередь; **серийные полосы** — параллель в одном дереве запрещена | `execute.directive.xml:181-183` — `AX_TASK_PARALLEL`; `:328-334` STEP_7 → следующий pickable; `deviation-review.directive.xml` — post-batch обзор | **ЧАСТИЧНО** — как режим лучше (единый оркестратор, post-batch review), но серийность — регрессия (§1.10 п.14.6) → T-B6-04. Отдельный скилл **НЕ НУЖЕН** |
| **`sdd-audit`** | Аудит завершённой задачи по требованию | `SKILL.md:13-15` «This skill is the odd one out … on purpose, not by omission»; `audit.directive.xml` + 3 пакета | **ПОКРЫТО** (v2 добавил group-режим и receipt); дыры — §1.4 |
| **`sdd-check`** | Read-only целостность дерева | `SKILL.md:9-10` «logic lives entirely in the `sdd-check` tool» | **ПОКРЫТО** |
| **`sdd-fix`** | Findings → классификация → план → фиксы → reopen → dispatch → верификация. **messenger: 228 упоминаний** | forced `reconcile` → `reconcile.directive.xml` (408 LOC); `:56` `AX_MODE_AUTO_DETECT_OR_HALT`, `:96` `AX_REOPEN_FORMAT`, `:133` `H_AMBIGUOUS_MODE` | **ПОКРЫТО** и расширено режимом `from-code`. Дефицит: `AX_DISPATCH_VIA_BATCH` («reconcile не диспатчит второе ревью») не собран → T-B6-05 |
| **`sdd-infra`** | Tooling-спека: package manager, linter, formatter, CI; Go → `sdd-infra-golang` | `infrastructure` → `infra.directive.xml` (621 LOC, **9592 токена** — самая большая директива v2). `:75` обязательные категории, `:317` `<LogicSwitch on="stack typicality">` | **ЧАСТИЧНО**: категории стек-агностичные, но артефакты жёстко node (`:406,430-432`) → §3 |
| **`sdd-infra-golang`** (plugin) | Go-специализация: `gennady verify --plan`, `FAIL vs ENV_FAIL`, «gates never mutate» | В v2 отсутствует полностью: нет `plugins/`, `gennady verify`, go-правил | **ГАП** → §3 + T-B6-06. Как **скилл** — **НЕ НУЖЕН**: содержание делится на (а) пресет/директива по стеку, (б) правила гейтов → трек VERIFY, (в) 7 «выживших правил» → аксиомы |

Не-SDD скиллы (для полноты ростера): `agent-inbox`, `prd-interview`, `workspace-permission-setup`
есть в обоих; `alt-opinion` есть в MAIN и отсутствует в RC; `opencode-get-session` есть в RC и
отсутствует в MAIN; `sdd-code-review` — новый в v2 (в v1 багхант был частью аудита).

### 2.2 Итог §2

| Вердикт | v1-скиллы |
|---|---|
| **ПОКРЫТО** (8 из 13 позиций) | `sdd-setup`, `sdd-discover`, `sdd-continue`(refine), `sdd-scaffold`, `sdd-execute`, `sdd-audit`, `sdd-check`, `sdd-fix` |
| **ЧАСТИЧНО** (4) | `sdd-module-decomposition`, `sdd-critic`, `sdd-execute-batch`, `sdd-infra` |
| **ГАП** (2) | `sdd-continue`(pivot для product/library), `sdd-infra-golang` |

Из 4 «ЧАСТИЧНО» и 2 «ГАП» — **`sdd-execute-batch`** и **`sdd-infra-golang`** не требуют отдельного
скилла (их дефициты закрываются правилами/маршрутами, не новой точкой входа). *(V-B6: исходник
подписывал таблицу «ПОКРЫТО (6)» при 8 перечисленных позициях и отдельно вёл «НЕ НУЖНО как скилл (2)»,
пересекавшуюся с ГАП/ЧАСТИЧНО — «8+4+2+2» не сходилось с 13 позициями матрицы. Здесь цифры сведены
к списку.)*

**Ни один v1-скилл не требует возвращения как скилл.** Все дефициты — это правила и маршруты внутри
v2-владельцев. Эргономическая потеря: пять v1-имён (`/sdd-setup`, `/sdd-discover`, `/sdd-continue`,
`/sdd-infra`, `/sdd-module-decomposition`) больше не существуют как команды, а `project-setup`/
`new-scope`/`evolve-scope`/`module-decomposition` не forced-intent — выводятся классификацией
свободного текста в `/sdd`. Дешёвая мера — алиас-строки в `description` скилла `sdd` → T-B6-07.

---

## 3. Детект инфраструктуры/стека в роутере

### 3.1 Сегодняшнее состояние

Все строки этой таблицы **подтверждены построчно верификатором**.

| Узел | `file:line` | Что есть |
|---|---|---|
| Роутер: входы preflight-гейта | `router.directive.xml:294-304` (`readiness-preflight-gate.xml:2-13`) | `LogicSwitch on="FLOW_VERSION · requested AUTHORING_SCOPE line(s) · EXECUTION_READY · GATE_QUEUE · blast radius"` — стека среди входов нет |
| Роутер: выбор владельца | `:390-395` | «инфраструктура» выбирается по scope-type из портала, не по репозиторию |
| Роутер: словарь | `:25-26,131,191` | «stack» встречается только как «тулстек → Tool Stack» и «Tool Stack» — секция; `package.json`/`npm`/`node` в роутере — 0 |
| Портал (артефакт) | `formats/portal-structure.xml:28` | `\| Scope \| Type \| Spec \| Description \|` — колонки стека нет; стек протаскивается прозой в `Description` |
| Портал (код) | `shared/sdd/portal.ts:12-23` | `Scope = {name, type, status, description, specPath}` — поля стека нет |
| `sdd-state` (печать) | `cli/cmd/sdd-state/sdd-state.types.ts:108-145` | `FLOW_VERSION=`, `PORTAL=`, `[READINESS]`, `READINESS=`, **`AUTHORING_READY=`** (между `READINESS=` и `EXECUTION_READY=` — не названо в исходнике), `EXECUTION_READY=`, `AUTHORING_SCOPE=`, `GATE_QUEUE=` — строки `STACK=` не существует |
| Единственная точка решения о стеке | `infra.directive.xml:317-320` `<LogicSwitch on="stack typicality">` | выбирает только глубину интервью (EXPRESS vs полное) |
| Node-хардкод | `infra.directive.xml:406,430-432`; `readiness.directive.xml:1,3-22,106-112,209`; 39 файлов `ai/kit/**` содержат `package.json`/`npm run` | текстовая кодировка node |
| Cascade Table (шаблон) | `formats/scope-tasks-index.xml:16-22` | `typescript-rules`, `vitest-rules`, `eslint-setup`, `node-test` — node-только примеры |
| Реестр правил | `ai/directives/knowledge.xml` | RC: **14** id (`typescript-rules svelte5-runes sveltekit-rules testing-common vitest-rules node-test playwright-cli playwright-e2e storybook-usage svelte-testing eslint-setup git-setup nodejs-npm-setup storybook-setup`). MAIN добавляет **5**: `result-conventions baseline-rules python-rules go-rules baseline-testing` — файлов этих категорий в RC физически нет |
| Мультистековая таблица детекта | `ai/skills/workspace-permission-setup/SKILL.md:31-41` | 8 маркеров (`package.json`/`pyproject.toml`+`requirements.txt`/`Cargo.toml`/`go.mod`/`Gemfile`/`Makefile`/`Dockerfile`/`mise.toml`+`.tool-versions`) → per-stack Bash allow-list — это **разрешения**, не SDD-поток |
| Референс маркеров в коде | `resolve-verify-commands.logic.ts:34-72` | `DETECTOR_ROWS`: `go.mod`/`npm-package-json`/`Cargo.toml`; потребитель один — placeholder'ы промпта; swift/python нет |

**Итог: сегодня стек в v2 не выбирается нигде.** Есть один неявный стек — node — закодированный в
восьми npm-скриптах (`shared/sdd/readiness.ts:15-24`) и чтении `<root>/package.json`.

### 3.2 Что именно должен нести роутер / `sdd-state` / портал

Требование №3 («стек детектируется из репозитория») распадается на четыре факта:

| Факт | Владелец | Где живёт | Почему не там, где хочется |
|---|---|---|---|
| **F1. Детектированный стек** — что найдено в репо по маркерам | `sdd-state` (детектор) | новая строка `STACK=<id[,id…]>` + `STACK_SOURCE=<marker:<file>\|config:stack.use>` в `[READINESS]` | Нельзя в портал: портал — авторский артефакт, F1 — наблюдение |
| **F2. Объявленный стек scope'а** — что решил оператор | infra-спека scope'а (Tool Stack + Decision Log) | уже есть: `formats/infrastructure-spec-structure.xml` | Нельзя в `sdd-state`: это решение, не наблюдение |
| **F3. Стек scope'а для навигации** | портал | новая колонка `Stack` в таблице Scopes + поле `stack?: string` в `portal.ts` | Сейчас протащено прозой в `Description` — не парсится |
| **F4. Расхождение F1 ↔ F2/F3** | аудит | новый тип дрейфа `STACK_DRIFT` в `ax-drift-taxonomy.xml` | Иначе «в репо go.mod, в спеке node» никто не заметит |

**Роутер: ровно один новый вход, ноль новых ветвей.** `STACK` добавляется в
`readiness-preflight-gate.xml:2-13` как вход `LogicSwitch`'а. Новая ветвь не нужна: `infrastructure`
по-прежнему выбирается по scope-type, «стек не распознан» закрывается fail-closed правилом
(перенос `plugins/anystack/anystack-plugin.ts:24-34` из MAIN). Роутер только **передаёт** `STACK`
владельцу как факт payload'а, не переспрашивая. Аргумент: роутер stateless и обязан быть узким
(`router.directive.xml:209-230` `KernelGrammar`: «conditions resolve only from data already in
context», «one action per case»); двенадцать маршрутов × N стеков = N×12 ветвей и гарантированный
`H_AMBIGUOUS_INTENT`. Стек — параметр владельца, а не критерий выбора владельца.

**Кто пишет колонку `Stack` в портале?** Открытый вопрос, не заданный в исходной версии: портал по
`AX_PORTAL_PRIMARY_OWNER` (`root.directive.xml:24` «Other flows MUST NOT rewrite this file») пишет
только `root`, а стек становится известен `infra`-флоу позже. Либо `root` пишет колонку по данным
`sdd-state`, либо нужен явный исключающий буллет к `AX_PORTAL_PRIMARY_OWNER` — вынесено в Q1 §3.6.

### 3.3 Как подключаются per-stack директивы

MAIN держит per-stack знание в `plugins/<stack>/directives/infra/<stack>-setup.xml` (сегодня один
файл — `plugins/golang/directives/infra/golang-setup.xml`) + `plugins/golang/skills/sdd-infra-golang/
SKILL.md`. В v2 `plugins/` нет. Перенос без нового скилла — три шва:

1. **Правило как rule-файл в реестре.** `golang-setup.xml` → `ai/directives/infra/golang-setup.xml`
   + запись `<Rule id="golang-setup">` в `knowledge.xml` с `<Triggers>` на `go.mod`/`go.work`.
   Механизм уже существует (`infra.directive.xml:83`) — в реестре просто нет go/python-записей.
2. **Аксиомы, а не проза.** Семь «правил, выживших контакт с реальными репозиториями»
   (`sdd-infra-golang/SKILL.md:96-102`): `AX_ONE_VERB_EVERY_STACK`, `AX_GATES_NEVER_MUTATE`
   (`gofmt -l`, не `go fmt`), `AX_SCOPE_BEFORE_DEPTH`, `AX_FAIL_VS_ENV_FAIL` (`:85-90` — «An agent
   that "fixes" code in response to `ENV_FAIL` produces confident, wrong diffs»),
   `AX_MODULE_BOUNDARY_STOPS_RECURSION`, `AX_BOUND_EVERYTHING`. `AX_FAIL_VS_ENV_FAIL` и
   `AX_GATES_NEVER_MUTATE` — **стек-агностичные**, должны жить в `ai/kit/axiom/infra/`, а не в
   go-пресете (частичные аналоги в v2 — `ax-autofix-preferred`, `ax-lint-run-is-mechanical`,
   `ax-binary-severity`; полного нет).
3. **Диагностики как halt-таблица.** `TOOLCHAIN_MISSING`/`GOLANGCI_CONFIG_MISSING`/
   `NESTED_MODULES`/`CONFIG_ERROR` (`SKILL.md:35-40`) → строки `<HaltConditions>` в
   `readiness.directive.xml` (стек-параметризованные), чтобы их поймал `audit:halts`.

### 3.4 Протяжка в scaffold Cascade Table и в readiness

**Cascade Table.** `formats/scope-tasks-index.xml:17` уже описывает правильную семантику: «Effective
rules for this scope, from the Scope Graph … Tier order (low → high on collision): traversed-scopes
→ target-scope → module → phase». Три правки: (а) строки-примеры `typescript-rules`/`vitest-rules`/
`eslint-setup`/`node-test` → нейтральные `<coding-rule>`/`<testing-rule>`/`<infra-rule>` (иначе агент
копирует node-имена в go-проект — issue #9.3); (б) вернуть `baseline-rules`+`baseline-testing` в
`knowledge.xml` (в MAIN есть, в RC нет) — они дают непустую Cascade Table стеку без своих правил;
(в) собрать `AX_RULES_RESOLUTION_HARD_FAIL` (сейчас не собран): «All rule references must resolve;
missing rule = abort … placeholder rule reference = abort, never write a ticket against it».

**Readiness.** Протяжка обязательна и не косметична: `readiness.directive.xml` целиком npm (`:1`
keywords, `:3-22` **восемь** точных скриптов, `:106-112` `npm i -D`, `:209` пример `package.json`).
Правка директивы бессмысленна без движка (`shared/sdd/readiness.ts:15-24` `REQUIRED_SCRIPTS`),
поэтому §3 **зависит от трека VERIFY**: директива формулирует «манифест выбранного стека объявляет
**восемь** обязанностей» (`type-check, test, test:coverage, format, format:fix, lint, lint:fix, fix`),
движок отвечает адаптером. *(V-B6-правка: исходник говорил «семь обязанностей» при списке из восьми
имён — противоречие снято, называем восемь явно, без свёртки.)* Уровни `not-ready/provisional/ready`
и текст `EXECUTION_READY=` менять нельзя — их парсят три директивы и `sdd-task`.

**Общий инвариант с B1 §4.4:** `sdd-state`, `sdd-task` и `sdd-verify` на одном корне обязаны видеть
один и тот же `StackDetection` — одна функция, без повторного эвристического угадывания. B1 §4.4 уже
формулирует ровно это, §3.4 его дублирует — при исполнении оставить одну формулировку в одном треке
(владелец — B1 V-05, см. §5).

### 3.5 Варианты

**Вариант A — `STACK=` в `sdd-state`, колонка `Stack` в портале, per-stack rule-файлы в реестре.**
Один детектор (`detectStacks(root)`), печатается в `[READINESS]`, входит в preflight-гейт, портал
получает колонку для навигации, per-stack знание — через `knowledge.xml` `<Triggers>`. Ноль новых
ветвей роутера, ноль новых скиллов. Цена: `sdd-state.types.ts`, `portal.ts`,
`formats/portal-structure.xml`, `readiness-preflight-gate.xml`, `readiness.directive.hbs`,
`infra.directive.hbs`, `scope-tasks-index.xml`, `knowledge.xml` + 4 rule-файла. Риск: строку в
`sdd-state` добавлять **после** существующих, не переставляя.

**Вариант B — `gennady.yaml` как объявление, детект только как подсказка.** Плюс: явность, монорепо
без эвристик; `sdd-infra-golang/SKILL.md:70-83` показывает реального потребителя. Минус: буквально
противоречит решению №3, `gennady.yaml` в RC не существует — новая сущность, не перенос.

**Вариант C — стек как scope-type.** Дёшево в роутере, но ломает ортогональность («что это за
артефакт» vs «на чём это работает»); product-scope на Go останется без стека. **Отвергаю.**

**Рекомендация: A, с оговоркой из B.** `STACK=` детектируется (A), но `gennady.yaml` `stack.use`,
когда появится в треке VERIFY, **сужает** кандидатов, а не назначает стек — как `stack-registry.ts
:44-64` в MAIN. Порядок: (1) rule-файлы и записи реестра (перенос из MAIN, S) — не зависит от VERIFY;
(2) нейтрализация node-примеров + сборка `AX_RULES_RESOLUTION_HARD_FAIL` (S) — не зависит от VERIFY;
(3) `STACK=`/`STACK_SOURCE=` в `sdd-state` + вход гейта (M, владелец — B1 V-05); (4) колонка `Stack`
в портале (S) — не зависит от VERIFY; (5) деноудизация `readiness`/`infra` (M, после движка,
владелец — B1 V-06).

### 3.6 Решения оператора по §3

- **Q1.** Где живёт объявленный стек: колонка `Stack` в портале / только Tool Stack в infra-спеке /
  оба с проверкой согласованности (`STACK_DRIFT`)? — *рекомендация: третье.* Подвопрос: кто пишет
  колонку `Stack`, если `AX_PORTAL_PRIMARY_OWNER` резервирует запись в портале за `root`, а стек
  известен `infra`-флоу позже — нужен явный исключающий буллет либо `root` пишет по данным
  `sdd-state`.
- **Q2.** Мультистек — норма или ошибка? MAIN считает нормой (`verify.cmd.ts:160-179`). Если норма —
  `STACK=` список, `infra.directive` умеет несколько Tool Stack-блоков; если ошибка — halt
  `H_MULTIPLE_STACKS`.
- **Q3.** Восемь npm-скриптов: node-пресет (стек-агностичный канон = «восемь обязанностей») или
  канон, от которого стеки отклоняются? Первое дороже, второе оставляет Swift/Go-проект нерабочим
  (issue #20).
- **Q4.** `go-rules`/`python-rules`/`baseline-rules` — переносим из MAIN как есть (S) или переписываем
  под v2 kit (M)? Реестр `knowledge.xml` project-owned (`f74c8c1d`), перенос как есть не конфликтует.

---

## 4. Сборка директив: висячие ссылки, бюджеты, куда класть перенесённые инварианты

### 4.1 Висячие ссылки на аксиомы (referenced-but-undefined)

`ai/kit/lint-axioms.ts` проверяет **одну** направленность (`:71-84` `lintDanglingAxioms`): «every
Axiom **defined** в `<BeliefState>` must be referenced at least once OUTSIDE BeliefState» — и даже
она только предупреждает (`build-directives.ts:45-46,153-154` — `console.warn`, билд не роняет).
Обратной проверки — «каждый упомянутый `AX_*` должен иметь достижимое определение» — нет. Для
**контрактов** и **halt'ов** обратная проверка уже реализована и обязательна
(`audit-contract-activation.mjs` PART 2, `audit-halt-activation.mjs`); для **аксиомов** — нет. Именно
в этой направленности потерялось большинство инвариантов v1 (§1.12).

**Полный список: 20 `AX_*`, упомянутых в rendered `ai/directives/sdd-v2/**` и не определённых нигде
в этом дереве** (независимо пересчитано верификатором — **совпадение до элемента**, по каждому id, по
числу ссылок и по `file:line`; независимый скрипт дал `files scanned: 70 | defined in tree: 164 |
mentioned ids: 184 | dangling: 20`):

| # | Axiom | определение в `ai/kit/axiom/` | ссылок | где ссылаются (`file:line`) |
|---|---|---|---|---|
| 1 | `AX_AUDIT_HOOK` | `process/ax-audit-hook.xml` | 5 | `audit.directive.xml:8`, `audit/steps/STEP_1_MECHANICAL.xml:86`, `code-review.directive.xml:6`, `execute.directive.xml:60`, `scaffold/steps/STEP_1_DERIVE.xml:31` |
| 2 | `AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE` | `spec/…` | 5 | `formats/dbc-contracts.xml:112,133`, `formats/entity-surface-format.xml:6,28`, `formats/module-spec-structure.xml:2` |
| 3 | `AX_PERMITTED_BASH_COMMANDS` | `process/…` | 4 | `audit/steps/STEP_1_MECHANICAL.xml:78`, `execute.directive.xml:53`, `infra.directive.xml:417`, `phase-execution-protocol/steps/STEP_3_VERIFY.xml:28` |
| 4 | `AX_STALE_AFTER_PIVOT_VERIFICATION` | `audit/…` | 4 | `formats/pivot-formats.xml:31`, `infra.directive.xml:117`, `interface.directive.xml:90`, `migration-v1-v2.directive.xml:61` |
| 5 | `AX_DEVIATION_SELF_RESOLVE` | `process/…` | 3 | `execute.directive.xml:117,139`, `phase-execution-protocol/steps/STEP_4_HANDOFF.xml:28` |
| 6 | `AX_CONTRACTS_TEXTUAL_AGNOSTIC` | `spec/…` | 3 | `formats/dbc-contracts.xml:78,131`, `scaffold/steps/STEP_2_MATERIALIZE.xml:66` |
| 7 | `AX_USAGE_WAIVER_DISCIPLINE` | **нигде** | 3 | `audit.directive.xml:154`, `formats/dbc-contracts.xml:116`, `formats/entity-surface-format.xml:20` |
| 8 | `AX_SPEC_PROGRESSIVE_DISCLOSURE` | **нигде** (только ссылка в `ai/kit/contract/spec/module-spec-markdown-structure.xml:5`) | 6 | `formats/{infrastructure-spec-structure:136, interface-spec-structure:84, library-spec-structure:99, module-spec-structure:4,134, product-spec-structure:114}` |
| 9 | `AX_SSOT_TRACEABILITY` | `boundary/…` | 2 | `formats/task-ticket-structure.xml:9`, `scaffold.directive.xml:154` |
| 10 | `AX_CLOSED_WORLD_INVENTORY` | `boundary/…` | 2 | `audit/steps/STEP_3_ROUTE.xml:48`, `code-review.directive.xml:180` |
| 11 | `AX_STRICT_NULL` | **нигде** (пример ссылается на несуществующий якорь) | 2 | `audit/steps/STEP_3_ROUTE.xml:131`, `formats/audit-round.xml:31` |
| 12 | `AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES` | `audit/…` | 1 | `audit/steps/STEP_2_SEMANTIC.xml:134` |
| 13 | `AX_RUNTIME_BACKING_EXPLICIT` | `spec/…` | 1 | `formats/product-spec-structure.xml:58` |
| 14 | `AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP` | `spec/…` | 1 | `formats/module-map-update.xml:2` |
| 15 | `AX_YAGNI_OVERENGINEERING_GUARD` | `coding/…` | 1 | `root.directive.xml:55` |
| 16 | `AX_CATCH_LOG_RECOVER` | `error/…` | 1 | `amplify-observability.directive.xml:43` |
| 17 | `AX_GITIGNORE_BASELINE` | `infra/…` | 1 | `amplify-security.directive.xml:49` |
| 18 | `AX_E2E_PROOF_SCREENSHOT_ALWAYS` | `e2e/…` | 1 | `infra.directive.xml:98` |
| 19 | `AX_SPEC_TABLE_IS_INDEX` | **нигде** | 1 | `formats/entity-inventory-format.xml:2` |
| 20 | `AX_REACTION_IS_A_TOOL_CALL` | определён в **другом** дереве (`ai/directives/agent-inbox/{arch-interrogation,inbox-flow,posting-rules}.directive.xml`) | 1 | `agent-inbox/track-review.directive.xml:430` |

Три класса: **I (#1–14,16–18, 17 штук с определением)** — партиал существует, но не подключён,
лечится `{{> "axiom/<dir>/<name>"}}`; **II (#7,8,11,19, 4 штуки)** — идентификатор придуман без
определения (`AX_SPEC_PROGRESSIVE_DISCLOSURE`/`AX_SPEC_TABLE_IS_INDEX` при этом ссылаются на реальные
механические проверки — `shared/sdd/check.ts:1890` — «имя правила без правила»); **III (#20)** —
межтрибная ссылка, лечится сборкой в `agent-inbox`-шаблон или allowlist'ом.

**Два сироты, не отражённые в исходном списке (V-B6):**

- **`recover-from-code.directive.xml`** (3590 токенов, 4-й носитель `AX_ARTIFACT_STYLE_SELF_CHECK` и
  один из 7 носителей `AX_PROGRESSIVE_DISCLOSURE`) **недостижим**: intent `recover-from-code` роутер
  отправляет в `discover-from-code.directive.xml` (`router:386-387`), и во всём дереве нет ни одной
  ссылки на `recover-from-code.directive` по имени. Задача — **T-B6-22**.
- **`AX_BLOCKER_ESCALATION` висит и вне `ai/directives/sdd-v2`.** Помимо 4 ссылок из таблицы выше,
  ещё три живут в дереве правил: `ai/directives/infra/nodejs-npm-setup.xml:89,93` («Halt `H_BLOCKED`
  per `AX_BLOCKER_ESCALATION`») и `ai/directives/infra/git-setup.xml:100`. Определения нет ни в одном
  дереве директив. Предложенный в §4.2 `lint-axioms` сканирует только rendered `sdd-v2/**` — эти три
  ссылки он не увидит без расширения области. Задача — **T-B6-24**.

**Обратная направленность (то, что lint уже ловит) — 36 предупреждений на сегодняшнем билде**: 5
директив `agent-inbox` (по 5–7 аксиомов), `formats/diagram-vocabulary.xml` (4), `infra`/`interface`
(`AX_SPEC_MANDATORY_DIAGRAM`), `router.directive.xml` (`AX_V2_HAS_NO_INTERNAL_MIGRATION`). Ни одно
не роняет билд.

**Масштаб проблемы в целом.** Из 180 SDD-релевантных аксиомов (`process` 56, `spec` 36, `audit` 25,
`scaffold` 20, `boundary` 16, `critic` 13, `truth` 11, `interview` 3) **88 не собираются ни в одну
директиву `sdd-v2`** — независимо пересчитано верификатором **поштучно, включая порядок сортировки**:

| Каталог | всего | не собрано |
|---|---|---|
| `process` | 56 | **21** |
| `spec` | 36 | **20** |
| `audit` | 25 | **9** |
| `boundary` | 16 | **13** |
| `scaffold` | 20 | **10** |
| `critic` | 13 | **8** |
| `truth` | 11 | **7** |
| `interview` | 3 | 0 |
| **Итого** | **180** | **88** |

Для полноты (не в исходной версии, добавлено верификатором): вся библиотека — **427** аксиомов, и
**322** из них не собраны ни в одну директиву `sdd-v2` (остальные каталоги — `coding` 29, `svelte` 34,
`testing` 39, `e2e` 24, `storybook` 22, `infra` 28, `uikit` 17, `error` 16, `typescript` 11, `perf` 9,
`logging` 4, `agent-inbox` 1). Это меняет объём задачи «пометить заготовки статусом `draft`» (T-B6-19,
Q1) — выборка должна строиться из 322, а не из 88, и критерий «SDD-релевантный каталог» надо
зафиксировать явно.

Не все 88 обязаны быть собраны — часть отложена сознательно. Но **20 из 88 уже цитируются**, а ещё
десяток (`AX_RULES_RESOLUTION_HARD_FAIL`, `AX_DISPATCH_VIA_BATCH`, `AX_BLOCKER_ESCALATION`,
`AX_TASK_ID_INTEGRITY`, `AX_NO_UNVERIFIED_FINDINGS`, `AX_STALE_MUST_BE_REJECTED`,
`AX_PROVENANCE_IS_A_PRODUCT`) — это ровно инварианты §1. Разница между «отложенная заготовка» и
«потерянный инвариант» сегодня не выражена ничем.

### 4.2 Предложение: `lint-axioms` — проверка «referenced-but-undefined», обязательная

1. Добавить `lintUndefinedAxiomRefs(rendered, resolveContext)`: для каждой rendered-директивы
   собрать `\bAX_[A-Z0-9_]+\b`, вычесть (а) собственные `<Axiom id>`, (б) `deps=`, (в) `<Axiom id>`
   каждого родителя по графу `READ_AND_USE_DIRECTIVE` (граф уже строится в
   `build-directives.ts:83-99`, надо передать в lint), (г) `ALLOWLIST_EXTERNAL_RULE_ANCHORS` для
   `ai/directives/coding/<rule>.xml#AX_*` (класс III). **Область по умолчанию — `ai/directives/**`,
   не только `sdd-v2/**`**, иначе три ссылки `AX_BLOCKER_ESCALATION` вне `sdd-v2` не поймать
   (T-B6-24).
2. Направленность делает билд красным (в отличие от текущей «defined-but-unreferenced», остающейся
   warning'ом): несобранное определение — мёртвый груз, несуществующее определение при живой ссылке —
   ложь агенту. Та же мотивация, что у `audit-contract-activation.mjs` PART 2.
3. Тесты в `ai/kit/__tests__/lint-axioms.test.ts` (уже 4 сюиты/13 кейсов): «reference with no
   definition anywhere» · «satisfied by `deps=`» · «satisfied by a parent in the READ_AND_USE graph»
   · «allowlisted external rule anchor» · «prefix ids do not false-match».
4. `status="draft"` для файлов, сознательно не собираемых; кейс «every axiom file is either
   referenced by a template or marked draft» — отделяет заготовки от потерянных инвариантов
   механически (критерий выборки — см. выше, 322 vs 88).

### 4.3 Бюджеты: текущие размеры против лимитов

Константы — `step-budget-gate.ts:36-45`: `SKELETON_TOKEN_TARGET = 6000` (soft), `SKELETON_TOKEN_LIMIT
= 8000` (hard, exit 1), `PACKAGE_CHAR_LIMIT = 20 000`, `PACKAGE_LINE_CHAR_LIMIT = 2000`.

**Область гейта** (`:24-27`): «A directive counts as lazily assembled only when its sibling
`<name>/steps/` directory exists — three pilots (audit, scaffold, phase-execution-protocol) carry
that layout; every other directive stays monolithic and is skipped by the scan». Три пилота — в
бюджете с запасом:

| Пилот | скелет, токены | пакеты (chars / max line) |
|---|---|---|
| `scaffold.directive.xml` | **5085** ✔ | 7 пакетов, 586–6943 c; max line 409 ✔ |
| `audit.directive.xml` | **3180** ✔ | 3 пакета, 11 370–13 487 c (макс. 67% лимита); max line 709 ✔ |
| `phase-execution-protocol.directive.xml` | **891** ✔ | 4 пакета, 373–2639 c; max line 463 ✔ |

**Необюджетированные монолиты — вот где проблема** (замер `countTokens` — совпадение до токена с
независимым пересчётом верификатора):

| Директива | токены | если бы гейт её сканировал |
|---|---|---|
| `infra.directive.xml` | **9592** | **> hard limit 8000 → exit 1** |
| `root.directive.xml` | **7572** | > target |
| `migration-v1-v2.directive.xml` | **6741** | > target |
| `router.directive.xml` | **6094** | > target (читается **каждым** входом) |
| `interview-protocol.directive.xml` | 5925 | ниже target на 75 |
| `interface` 5587 · `reconcile` 5539 · `execute` 5270 · `readiness` 4215 · `code-review` 3934 · `recover-from-code` 3590 | | ✔ |
| остальные **14** | ≤ 2751 | ✔ |

**Бюджет измеряет три самые маленькие директивы и не измеряет самую большую.** `infra` в 1,6 раза
превышает то, что для пилота было бы фатальным. `infra`, `root`, `migration-v1-v2`, `router` в
текущей форме места не имеют — им нужна lazy-разбивка **до** того, как в них что-то добавят.

### 4.4 Как добавлять перенесённые инварианты, не раздувая бюджеты

По возрастанию цены:

1. **Дописать существующий собранный аксиом** — ноль новых токенов (D4.4–D4.7 в
   `ax-severity-tagging.xml`, D6 в `ax-ticket-has-bdd-and-tests.xml`, D7.2 в `ax-phase-scope-lock.xml`).
   Из 11 «НЕТ» §1 так закрываются 6.
2. **Собрать существующий, но неподключённый аксиом** (класс I §4.1) — +N токенов в конкретной
   директиве. Дороже всего `AX_PERMITTED_BASH_COMMANDS` (≈700 токенов) — но у
   `phase-execution-protocol` запас 7000 токенов.
3. **Положить в ядро роутера** — только для conduct-аксиомов, нужных **всем** ветвям
   (D9). Ядро дороже всего — 6094 токена × каждый вход; дешевле объявить в `deps=` двух владельцев
   (`scope`, `module`) — delta-assembly вычтет его из них, если он в ядре, но добавит, если нет.
   Корректный ход для D9 — определить локально в `scope.directive.hbs` и `module.directive.hbs`
   (2×~130 токенов), а не в ядре (1×12 входов).
4. **Lazy-разбивка `infra`/`root`/`migration-v1-v2`** — единственный способ добавить в них
   что-либо. Механика готова: `assembly-manifest.json` уже принимает `"lazy"`,
   `build-directives.ts:120-131` упадёт, если у директивы нет `<Step>`-блоков (у `infra` их 7+).
5. **`.hbs`-партиал против инлайна — второй источник дрейфа.** Замер (подтверждён верификатором
   независимо: **68 вхождений `<Axiom id=>`, 63 различных id**): аксиомы объявлены инлайном прямо в
   `.hbs` — `interview-protocol` 6, `agent-inbox/enrich` 11, `agent-inbox/track-review` 20,
   `audit`/`recover-from-code` по 4, `agent-inbox/synthesize` 4, `router`/`preflight-protocol` по 3,
   `agent-inbox/security-lens` 5 и т.д., минуя `ai/kit/axiom/**`. **Четыре id имеют одноимённый файл
   в библиотеке** — «два дома»: `AX_EVIDENCE_HYGIENE`, `AX_FINDING_ROUTING`,
   `AX_MECHANICAL_VIA_SDD_CHECK`, `AX_OPERATOR_LANGUAGE`; ничто не проверяет совпадение текстов.
   **Усиление (V-B6): ещё 3 id инлайнены сразу в >1 шаблоне** — `AX_NO_DUPLICATION` (4 шаблона),
   `AX_OPERATOR_LANGUAGE` (2), `AX_SPEC_MANDATORY_DIAGRAM` (2) — готовые кейсы, прямое нарушение
   правила ниже. Правило: **инвариант, цитируемый ≥2 директивами, обязан жить партиалом**; инлайн —
   только для аксиома, локального ровно одному шаблону. Проверка: «no axiom id is defined both
   inline in a template and as a library file» + «an axiom inlined in more than one template must be
   a partial» (**T-B6-18**).

**Прогоны бюджета и свежести — оба зелены**, независимо воспроизведены верификатором:
`step-budget-gate.ts` → `✓ every lazy directive … is within budget.`; `check-directives-fresh.ts` →
`✓ ai/directives/** matches a fresh rebuild.`

---

## 5. Список задач и решения оператора

Размеры: **S** ≤ 1 фазы-день · **M** 2–4 · **L** неделя+. Eval-группа этого трека — **G3**
(директивы/скиллы/поток авторинга и исполнения); companion в другой группе назван отдельно. Сценарии
`ai/flow-eval/scenarios.json` (7 шт.) покрывают spec-authoring/scaffold/execute/repair/task —
G3-задачи проверяемы существующими фикстурами `fibonacci-library`, `tic-tac-toe`,
`slugify-toolchain`, `broken-specs-repair`.

### 5.1 Задачи

Владельцы соседних треков указаны там, где задача этого трека раньше дублировала их: **VERIFY = B1**
(`V-05` детект стека в снапшоте, `V-06` деноудизация readiness), **CHECK-LOG = B2** (механика
`shared/sdd/check.ts` + `check.test.ts`), **RULES = B4** (`T-1` перенос baseline/языковых правил,
`T-9` замок поставляемой поверхности правил).

| id | Goal (проверяемо) | Files | Tests | Size | Eval |
|---|---|---|---|---|---|
| **T-B6-08** | **Сначала — замок на висячие ссылки.** `lint-axioms` получает направленность «referenced-but-undefined» и **роняет билд**; область — `ai/directives/**` (не только `sdd-v2/**`, чтобы поймать и три ссылки `AX_BLOCKER_ESCALATION` вне дерева, см. T-B6-24); 20 ссылок §4.1 либо разрешаются, либо попадают в явный allowlist | `ai/kit/lint-axioms.ts`, `ai/kit/build-directives.ts` (передать READ_AND_USE-граф), `ai/kit/AUTHORING.md` §7 | `lint-axioms.test.ts` +5 кейсов | **M** | G3 |
| **T-B6-09** | Kit-скрипты/тесты не зависят от cwd: `resolveAssemblyMode` и чтение `assembly-manifest.json` резолвятся от корня пакета; три теста из §0 зелены из любого cwd | `ai/kit/lazy-assembly.ts`, `ai/kit/render.ts`, `ai/kit/step-budget-gate.ts`, `ai/kit/check-directives-fresh.ts` | «resolves the manifest from the package root regardless of cwd»; прогон трёх файлов §0 из чужого cwd | **S** | G3 |
| **T-B6-10** | Бюджеты покрывают все директивы: `infra` (9592), `root` (7572), `migration-v1-v2` (6741), `router` (6094) переведены в `lazy` и проходят `check:directive-budgets` | `ai/kit/assembly-manifest.json`, `ai/kit/step-budget-gate.ts`, `ai/kit/templates/sdd-v2/{infra,root,migration-v1-v2,router}.directive.hbs` (Step-блоков достаточно: 9/5/9/3) | «a monolith directive over the ceiling fails the gate»; `skeleton-package-binding.guard.test.ts` расширить | **M** | G3 |
| **T-B6-11** | D4.4–D4.7 восстановлены: `ax-severity-tagging` несёт «first matching row wins» + «print which row matched» + правило `LOW` + семантика `MAJOR`/`MINOR` + «заявленная верификация без evidence = MAJOR» + кап проектных находок; `RULE_FILE_INCOMPLETE`/`rule-file-fix`/кап — в `ax-finding-routing` и `ax-drift-taxonomy` | `ai/kit/axiom/audit/{ax-severity-tagging,ax-finding-routing,ax-drift-taxonomy}.xml`, `audit.directive.hbs` | «audit computes its verdict from a printed severity table», «LOW confidence never causes FAIL», «project-scope finding capped at MINOR» | **M** | G3 |
| **T-B6-12** | Граница фазового агента полна: ERROR OWNERSHIP вернулся в `ax-phase-scope-lock`; `ax-permitted-bash-commands`/`ax-blocker-escalation` собраны; `H_BLOCKED` объявлен; **оба ложных абзаца** `audit-halt-activation.mjs:135-141` исправлены (см. также T-B6-27) | `ax-phase-scope-lock.xml`, `ax-permitted-bash-commands.xml`, `ax-blocker-escalation.xml`, `phase-execution-protocol.directive.hbs`, `audit-halt-activation.mjs:135-141` | «a phase worker owns failures only inside its own Target Files», «the phase protocol defines the permitted command list»; `audit:halts` зелен | **M** | G3 (+ G1 для §5-исключения fixture-репо, issue #19) |
| **T-B6-01** | Pivot для product/library имеет владельца: `scope`/`module` несут `AX_PIVOT_REQUIRES_SUPERSESSION`, режимы `greenfield/refine/pivot/rewrite`, `H_REWRITE_WITH_DOWNSTREAM`, Pivot Invalidation List; `AX_REFINE_MODULE_PRESERVES_CONTRACTS` собран в `module` | `ai/kit/templates/sdd-v2/{scope,module}.directive.hbs`, `ax-pivot-requires-supersession.xml`, `ax-refine-module-preserves-contracts.xml`, `formats/pivot-formats.xml` (готов) | «a product/library pivot supersedes instead of overwriting» + «rewrite halts when the scope already has tickets»; eval на `fibonacci-library` c pivot-интентом | **M** | G3 |
| **T-B6-02** | Правила закрытого мира собраны в модульный авторинг: `AX_CLOSED_WORLD_INVENTORY`, `AX_ENTITY_SURFACE_COMPLETENESS`, `AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE`, `AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP`, `AX_CONTRACTS_TEXTUAL_AGNOSTIC`, `AX_HIERARCHICAL_SPECS`, `AX_MODULE_BOUNDARY_BY_OPERATOR` — в `module.directive.hbs`; закрывает 4 висячих ссылки §4.1 | `module.directive.hbs`, `ai/kit/axiom/{boundary,spec}/*` | «module decomposition carries the closed-world rules it cites»; T-B6-08 зелен | **S** | G3 |
| **T-B6-03** | Цикл `review-lifecycle` STEP_2⇄STEP_3 ограничен: `AX_CAP_5` собран и применён; `ax-default-accept`/`ax-polish-mode` собраны в `critic-protocol` **после** T-B6-21 (иначе собирает в недостижимый файл) | `review-lifecycle.directive.hbs`, `critic-protocol.directive.hbs`, `ax-cap-5.xml`, `ax-default-accept.xml`, `ax-polish-mode.xml` | «bounds the review⇄reconcile cycle and hands the disposition to the operator» | **S** | G3 |
| **T-B6-04** | Batch честен про рабочее дерево: либо серийные полосы возвращены как `AX_TASK_PARALLEL`, **переписанный, не унаследованный из критиковой аксиомы** (§1.10), либо параллель требует worktree на полосу — зафиксировано тестом | `ax-task-parallel.xml`, `execute.directive.hbs`, `ai/skills/README.md` | «batch never runs two tickets concurrently in one working tree»; companion — снапшот `sdd-verify` не ловит чужую полосу, владелец companion'а — **трек VERIFY / B1** | **S** (после Q3) | G3 (+ B1) |
| **T-B6-05** | `AX_DISPATCH_VIA_BATCH` собран в `reconcile`: execute — единственный владелец audit/code-review группы | `reconcile.directive.hbs`, `ax-dispatch-via-batch.xml` | «reconcile dispatches reopened tickets as one execute batch and never runs a second review» | **S** | G3 |
| **T-B6-13** | D6 восстановлен: `ax-ssot-traceability` обновлён до v1-текста и собран; буллет про якорь/литеральный `Given` вернулся в `ax-ticket-has-bdd-and-tests`; advisory `dangling-spec-ref` в аудите | `ax-ssot-traceability.xml`, `ax-ticket-has-bdd-and-tests.xml`, `scaffold.directive.hbs`, `audit.directive.hbs` | «ticket BDD references spec facts by anchor and keeps Given literals»; структурная проверка анкора — **companion, владелец CHECK-LOG / B2** (`shared/sdd/__tests__/check.test.ts`) | **M** | G3 (+ B2) |
| **T-B6-14** | D9 восстановлен: `AX_ARTIFACT_STYLE_SELF_CHECK` подключён к `scope` и `module` и применён в STEP_2_FILL | `scope.directive.hbs`, `module.directive.hbs` | «every directive that performs a whole-document Write carries the style self-check» | **S** | G3 |
| **T-B6-15** | D2 восстановлен: блок «Directive markup — mandatory» — первым разделом `AGENTS.md` RC; ни один скрипт/CI не валидирует `ai/directives/**` XML-парсером. Каталог `ai/kit/__tests__/` для нового кейса — координировать с **RULES / B4 T-9**, который тоже создаёт `scripts/__tests__/`-эквивалент, чтобы не завести два параллельных каталога-замка | `AGENTS.md`, `ai/kit/AUTHORING.md` | новый `directive-markup-contract.test.ts` — «AGENTS.md declares directive markup as prompt text before the project description» + «no repository script invokes an XML validator over ai/directives» | **S** | G3 (+ B4) |
| **T-B6-16** | Provable-progress: повтор эквивалентного блокирующего набора без нового evidence → halt, не новый раунд | `ax-re-dispatch.xml`+`ax-rejection-reason.xml` (или новый `ax-provable-progress.xml`), `execute.directive.hbs` (+ `H_NO_PROGRESS`) | «execute halts on a repeated finding set with no new evidence instead of opening another round» | **M** | G3 |
| **T-B6-17** | `[REOPENS]` восстановлен как механическая проверка причинности (владелец кода — **CHECK-LOG / B2**); `ax-stale-after-pivot-verification` собран (закрывает 4 висячих ссылки, за это отвечает B6) | `ax-stale-after-pivot-verification.xml`, `audit.directive.hbs` (B6); `shared/sdd/check.ts` (B2) | тикет `triggered-reopen=Round-2` + `Reopens: 0` → finding; `Reopens: 1` → чисто (тест — B2) | **M** | G3 (+ B2) |
| **T-B6-06** | Директивно-скилловая половина детекта стека: колонка `Stack` в портале (+формат), нейтральные примеры Cascade Table, `AX_RULES_RESOLUTION_HARD_FAIL` собран, `golang-setup.xml` как rule-файл с `<Triggers>` на `go.mod`. **Не дублирует**: `STACK=`/`STACK_SOURCE=` в `sdd-state` — **B1 V-05**; деноудизация `readiness`/`infra` — **B1 V-06**; перенос `baseline-rules`/`baseline-testing`/`go-rules`/`python-rules`/`result-conventions` + записи `knowledge.xml` — **B4 T-1** | `formats/{portal-structure,scope-tasks-index}.xml` (через `.hbs`), `shared/sdd/portal.ts`, `ax-rules-resolution-hard-fail.xml`, `ai/directives/infra/golang-setup.xml` | колонка `Stack` парсится (`portal.test.ts`); «scaffold aborts on an unresolvable rule reference» | **M** (сужен относительно исходной L — часть вынесена в B1/B4) | G3 (+ B1, B4) |
| **T-B6-07** | v1-имена не теряются как триггеры: `description` скилла `sdd` перечисляет `/sdd-setup`, `/sdd-discover`, `/sdd-continue`, `/sdd-infra`, `/sdd-module-decomposition`; `sdd-reconcile` — `/sdd-fix`; `sdd-execute` — `/sdd-execute-batch`; кейс на риск регрессии #16 («DIRECTIVE ACTIVATED» не должно вернуться); `ai-skills.spec.md:290` исправлена (`sdd-hooks-install` в RC нет) | `ai/skills/sdd/SKILL.md`, `sdd-reconcile/SKILL.md`, `sdd-execute/SKILL.md`, `ai/skills/README.md`, `specs/ai-skills/ai-skills.spec.md` | «every retired v1 skill name appears as a trigger in exactly one v2 skill description»; «the skills spec names only skills that exist on disk»; координировать с **SYNC / B3** (`cli/cmd/sync-skills/__tests__`) | **S** | G3 (+ B3) |
| **T-B6-18** | Инлайн-аксиомы не расходятся с библиотекой: ни один id не определён одновременно инлайном и файлом (сегодня 4: `AX_EVIDENCE_HYGIENE`, `AX_FINDING_ROUTING`, `AX_MECHANICAL_VIA_SDD_CHECK`, `AX_OPERATOR_LANGUAGE`; ещё 3 инлайнены в >1 шаблоне: `AX_NO_DUPLICATION`, `AX_OPERATOR_LANGUAGE`, `AX_SPEC_MANDATORY_DIAGRAM`); аксиом, цитируемый ≥2 директивами, обязан быть партиалом | `ai/kit/templates/sdd-v2/**.hbs`, `ai/kit/axiom/**`, `AUTHORING.md` | новый `axiom-home.test.ts` — «no axiom id has two homes» + «an axiom used by two or more templates is a partial» | **S** | G3 |
| **T-B6-19** | Библиотека различает «заготовку» и «инвариант»: несобранные SDD-релевантные аксиомы (88 из 180, критерий каталога зафиксирован явно — не вся библиотека из 322) помечены `status="draft"` | `ai/kit/axiom/**`, `ai/kit/lint-axioms.ts` | «every axiom file is either referenced by a template or marked draft» | **S** | G3 |
| **T-B6-20** | Conduct-аксиомы гарантированы каждому operator-facing владельцу (D1 замкнут); `REQUIRED_CONDUCT` из §1.1 зафиксирован явно в Goal и в тесте | `ai/kit/templates/sdd-v2/**.hbs` (`deps=`), `deps.test.ts` | «every operator-facing owner declares or defines the conduct set» | **S** | G3 |
| **T-B6-21** | **Новая.** `critic-protocol.directive.xml` перестаёт быть сиротой: либо назван в dispatch-промпте (`review-lifecycle` STEP_2 и/или `critic.directive.xml` STEP_2_REVIEW), либо слит в `critic.directive.hbs` с удалением class-3-записи из `delta-assembly.ts:52` | `review-lifecycle.directive.hbs` и/или `critic.directive.hbs`, `ai/kit/delta-assembly.ts` | «every class-3 directive is named by at least one dispatch text» — сегодня проходит только для `phase-execution-protocol` (`execute.directive.xml:220`) | **S** | G3 |
| **T-B6-22** | **Новая.** `recover-from-code.directive.xml` (3590 токенов, 0 ссылок) перестаёт быть сиротой: либо роутер получает ветвь/переименование intent на этот файл, либо файл удаляется как мёртвый вес | `router.directive.hbs` (или удаление файла) | «every top-level sdd-v2 directive is reachable from at least one router branch or explicit dispatch» | **S** | G3 |
| **T-B6-23** | **Новая.** Инверсия D3.4 устранена: `critic-protocol.directive.xml:4,7` возвращает трёхчленный триаж (`ARTIFACT_GAP`/`CONTEXT_MISSING`/`NON_BLOCKING_QUESTION`, «confusion alone never proves underspecification», «only ARTIFACT_GAP may become a problem finding»); `ax-confusion-bug.xml` собран | `critic-protocol.directive.hbs`, `ax-confusion-bug.xml` | «confusion alone does not prove underspecification — three-way triage is applied before any finding is raised» | **S** | G3 |
| **T-B6-24** | **Новая.** Область `lint-axioms` расширена на `ai/directives/**` (не только `sdd-v2/**`), чтобы поймать 3 дополнительные висячие ссылки `AX_BLOCKER_ESCALATION` в `ai/directives/infra/{nodejs-npm-setup,git-setup}.xml` | `ai/kit/lint-axioms.ts` | «dangling axiom refs outside ai/directives/sdd-v2 are also reported» | **S** | G3 |
| **T-B6-25** | **Новая.** `ax-audit-hook.xml` (`AX_AUDIT_HOOK`) собран — самый цитируемый висячий аксиом (5 ссылок), без владельца в исходном списке задач | `ax-audit-hook.xml`, `audit.directive.hbs`, `code-review.directive.hbs`, `execute.directive.hbs`, `scaffold.directive.hbs` | T-B6-08 (lint) зелен на этой ссылке; «round close is followed by a mandatory audit hook, never treated as DONE» | **S** | G3 |
| **T-B6-26** | **Новая.** `AX_PROGRESSIVE_DISCLOSURE` — один дом: сегодня 7 локальных копий (`infra`, `root`, `discover-from-code`, `interface`, `migration-v1-v2`, `readiness`, `recover-from-code`), ни одной у `scope`/`module`/`scaffold`/`execute`/`critic`/`audit`/`code-review`. Конкретизирует T-B6-20 набором `REQUIRED_CONDUCT` | `ai/kit/templates/sdd-v2/**.hbs` | `deps.test.ts` — набор `REQUIRED_CONDUCT` перечислен явно и проверяется по всем operator-facing владельцам | **S** | G3 |
| **T-B6-27** | **Новая.** Комментарий `ai/kit/audit-halt-activation.mjs:135-141` исправлен целиком: обе половины сегодня ложны («review-lifecycle includes ax-permitted-bash-commands» и «`H_BLOCKED` … declared … in phase-execution-protocol.directive.hbs's own `<HaltConditions>`») — либо текст комментария приведён в соответствие с фактическим состоянием до T-B6-12, либо (после T-B6-12) комментарий подтверждает уже верный факт | `ai/kit/audit-halt-activation.mjs:135-141` | ручная проверка соответствия комментария rendered-дереву; `audit:halts` остаётся зелёным | **S** | G3 |

**Порядок.** T-B6-08 и T-B6-09 идут **первыми**: без замка на висячие ссылки и без cwd-независимых
скриптов остальные задачи нечем проверить. Затем T-B6-19/T-B6-18 (гигиена библиотеки, S), затем
T-B6-10 (бюджеты — до того, как в `infra`/`root` что-то добавят), затем T-B6-21 (достижимость
`critic-protocol` — до T-B6-03, иначе тот собирает в мёртвый файл), затем содержательные
T-B6-11/12/13/14/16/17/23/25/27, затем T-B6-01/02/03/05/20/26, затем T-B6-06 (после B1 V-05/V-06 и
B4 T-1), T-B6-04/07/15/22/24 — по решению оператора или по готовности соседних треков.

### 5.2 Решения оператора

**Q1. Библиотека аксиомов: несобранные — это долг или заготовка?**
- (a) Всё несобранное и нецитируемое — заготовка: `status="draft"`, забыть. Дёшево (S), но «забыть»
  означает потерять 20+ инвариантов v1 сознательно.
- (b) Инвентаризация каждого файла с вердиктом перенести/отложить/удалить. Дорого — и объём выше, чем
  казалось: не 88, а выборка из **322** несобранных файлов всей библиотеки (§4.1).
- (c) Гибрид: 20 цитируемых (§4.1) + названные в §1 — собрать сейчас (T-B6-08/11/12/13/17/25);
  остальные — `draft` до появления потребности, критерий выборки зафиксирован в задаче. **Рекомендую (c).**
- (d) Удалить несобранные файлы целиком: библиотека станет правдой о системе, но тексты v1 исчезнут
  безвозвратно, а v1 заморожен.

**Q2. Направленность `lint-axioms` «referenced-but-undefined» — warning или error?**
- (a) Error немедленно. Билд станет красным на 20 ссылках — T-B6-08 нельзя мержить без
  T-B6-11/12/13/17/25 или allowlist'а.
- (b) Error с временным `KNOWN_DANGLING`-allowlist'ом на текущие ссылки, который только сокращается.
  **Рекомендую (b)** — приём, уже применённый в `ALLOWLIST_CROSS_DIRECTIVE_REFS`
  (`audit-halt-activation.mjs`).
- (c) Warning. Ничего не меняет: сегодняшние 36 warning'ов уже никто не читает.

**Q3. Batch: серийные полосы или параллель?** (регрессия §1.10 п.14.6)
- (a) Вернуть v1-инвариант: одна полоса на рабочее дерево, параллель запрещена. Просто, честно,
  медленнее.
- (b) Оставить параллель, но обязать worktree-на-полосу — иначе snapshot `sdd-verify` (`help.ts:30`
  «every other persistent file or directory is observed») даёт ложные VIOLATION у соседа. Быстрее, но
  добавляет git-механику в поток, который сейчас git не мутирует.
- (c) Оставить как есть (параллель по disjoint Target Files в одном дереве). **Не рекомендую**: это
  ровно то, что v1 запретил после болезненного опыта, а §5-команды тикета видят всё дерево, а не
  только свои Target Files — снапшот-механика делает конфликт механически неизбежным, не только
  вероятным.

**Q4. `sdd-infra-golang`: как переносим 7 «выживших правил»?**
- (a) Все семь — в `ai/directives/infra/golang-setup.xml` как rule-файл (S). Быстро, но
  `AX_FAIL_VS_ENV_FAIL` и «gates never mutate» — стек-агностичные инварианты, остаются спрятанными в
  go-файле.
- (b) Два стек-агностичных (`AX_FAIL_VS_ENV_FAIL`, `AX_GATES_NEVER_MUTATE`) — в `ai/kit/axiom/infra/`,
  пять go-специфичных — в rule-файл. **Рекомендую (b).**
- (c) Всё в аксиомы с `stack=`-атрибутом. Новый механизм в kit — не оправдан одним стеком.

**Q5. Пять исчезнувших v1-имён скиллов и два поглощённых:**
- (a) Только алиасы в `description` скилла `sdd` (T-B6-07, S). Ноль новых скиллов, но `/sdd-fix` как
  команда не сработает.
- (b) Тонкие скиллы-обёртки, передающие роутеру forced intent — по 18 строк каждый. Ломает решение
  «роутер — единственная дверь», но эргономически ближе к тому, чем реально пользовались (messenger:
  `sdd-fix` — 228 упоминаний).
- (c) Алиасы + два forced-intent скилла на самое нагруженное (`sdd-fix` → `sdd-reconcile`,
  `evolve-scope`/pivot как `sdd-continue`). **Рекомендую (c)** — доказательство необходимости есть в
  артефактах реального проекта.

**Q6. Бюджеты: единый лимит для всех директив или два режима?**
- (a) Один лимит 8000 токенов для всех, монолиты сканируются тоже → `infra` (9592) обязан быть
  разбит. **Рекомендую (a)** — иначе гейт измеряет три самые маленькие директивы и молчит про самую
  большую. Оговорка: «единый лимит» без предварительного lazy-split (T-B6-10) немедленно роняет билд
  на `infra` — T-B6-10 обязан идти раньше включения гейта на монолиты.
- (b) Отдельный, более мягкий лимит для монолитов (например 12 000). Легализует текущее состояние и
  снимает мотивацию разбивать.
- (c) Оставить как есть (гейт только для lazy-пилотов). Тогда добавление любого инварианта в
  `infra`/`root` не встречает никакого препятствия — и это в точности то, как `infra` дорос до 9592.

---

## Итог верификации

B6 (аналитик) — фактологически прочный документ по независимой оценке V-B6: механическая часть (§4)
воспроизведена **до элемента** — те же 20 висячих `AX_*` с теми же `file:line`, те же 88 несобранных
из 180 SDD-релевантных аксиомов с той же разбивкой по каталогам, те же 63 инлайн-аксиома и ровно те
же 4 id с «двумя домами», те же токен-размеры директив (`infra` 9592, `root` 7572, `migration-v1-v2`
6741, `router` 6094). Маршруты роутера (§2) и детект стека (§3) подтверждены построчно;
messenger-evidence воспроизведена с точностью до единицы. Прогоны `step-budget-gate.ts` и
`check-directives-fresh.ts` зелены.

Найдено верификатором и применено в этом чистовике:

1. **4 пересмотренных вердикта** — D1 (ЕСТЬ→ЧАСТИЧНО: `AX_PROGRESSIVE_DISCLOSURE` не в ядре роутера,
   7 локальных копий), D3.4 (ЧАСТИЧНО→НЕТ: не упрощение триажа, а прямая инверсия v1-текста),
   D3.7 (ЕСТЬ→ЧАСТИЧНО: правило верно сформулировано, но носитель — недостижимый файл), D4.7
   (НЕТ→ЧАСТИЧНО: исходная evidence-строка была ложной — таксономия и маршрут `RULE_FILE_INCOMPLETE`
   выжили, потеряны только кап/адресат/гарантия).
2. **Исправленная арифметика §1.12**: сводка **17 ЕСТЬ / 15 ЧАСТИЧНО / 11 НЕТ / 2 НЕПРИМЕНИМО**
   вместо 19/13/11/2, при той же корректной сумме групп (45, не «46» как было подписано).
3. **Исправленные `file:line`**: D3.3 v1-цитата → `:16`/`:17` (не `:81-85`), D3.6 → `:27` (не `:169`),
   D5.4 `AX_EPHEMERAL_OUTPUT` → `:60` (не `:61`), D2 — снята ложная evidence-строка про `AGENTS.md`.
4. **Исправленная сводка §2.2**: ПОКРЫТО **8** (не «6» при 8 перечисленных позициях), с явным
   списком, вместо пересекающихся категорий «ГАП (2)» / «НЕ НУЖНО (2)».
5. **Два ранее не найденных сироты и два усиления в §4**: `recover-from-code.directive.xml` (3590
   токенов, недостижим из роутера) и три дополнительные ссылки `AX_BLOCKER_ESCALATION` вне
   `ai/directives/sdd-v2` (в `ai/directives/infra/{nodejs-npm-setup,git-setup}.xml`, вне области
   предложенного lint-а); `AX_TASK_PARALLEL` (§1.10, 14.6) — дословная копия v1-критиковой аксиомы,
   перенесённая не туда; ложный комментарий `audit-halt-activation.mjs:135-141` — в обеих половинах,
   не в одной.
6. **«Семь обязанностей» → восемь** (§3.4): формулировка приведена в соответствие с фактическим
   списком `REQUIRED_SCRIPTS` (`type-check, test, test:coverage, format, format:fix, lint, lint:fix,
   fix`).
7. **Дедупликация §5 против соседних треков**: T-B6-06 сужен и явно ссылается на владельцев B1
   (`V-05` детект стека, `V-06` деноудизация readiness) и B4 (`T-1` перенос rule-файлов) вместо
   повторения их работы; T-B6-13/17 явно называют B2 (CHECK-LOG) владельцем механики
   `shared/sdd/check.ts`; T-B6-04 называет B1 владельцем companion-теста снапшота; T-B6-15
   координируется с B4 `T-9` по каталогу `scripts/__tests__/`-эквивалента; T-B6-07 согласован с B3
   (SYNC) по `sync-skills`.
8. **Семь новых задач T-B6-21…27** — по одной на каждый пропущенный владения пункт: сирота-протокол
   (`critic-protocol.directive.xml`), сирота-директива (`recover-from-code.directive.xml`),
   восстановление `AX_CONFUSION_TRIAGE` (отмена инверсии D3.4), расширение области `lint-axioms` на
   `ai/directives/**`, сборка `ax-audit-hook` (самый цитируемый висячий аксиом, 5 ссылок, ранее без
   владельца), единый дом `AX_PROGRESSIVE_DISCLOSURE` (конкретизация T-B6-20), починка комментария
   `audit-halt-activation.mjs:135-141`.

Задачи из исходного списка (за вычетом уточнений выше) и все шесть операторских решений Q1–Q6 прошли
проверку без содержательных нареканий за пределами уже перечисленного. Итоговый список задач трека:
**T-B6-01…27**. Операторские решения: **Q1…Q6** (§5.2) + четыре решения внутри §3.6. Блокеров,
специфичных для этого трека, за пределами уже перечисленных изменений вердиктов §1 не выявлено.
