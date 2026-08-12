# Module: `sdd-check`

**Module:** sdd-check · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Механический аудит SDD-артефактов — детерминированная половина `audit`/`check`. `sdd-check --task <ticket>` проверяет один тикет; `--all [root]` обходит `specs/` и проверяет все тикеты + ссылки спек + целостность портала (граф scope'ов: ацикличность, граф↔таблица↔спеки, сироты, висячие связи). Это основной потребитель механики; семантические проверки (closed-world symbol-diff, BDD↔test mapping, rules-cascade resolution, stale-after-pivot) остаются за аудит-АГЕНТОМ — здесь сознательно НЕ реализованы (нужен AST/исполнение тестов). Реверс-спека — `scan.sh`, адаптировано под v2 (co-located `specs/`, `<!--SECTION:-->`).

**Key properties:**

- Pure core — `shared/sdd/check.ts#checkTicket` без I/O; обход ФС и резолв ссылок — в команде
- ESLint-style — `file: severity: code  message` + сводка; exit 1 при наличии error
- Dogfooded — `--all .` проходит по реальным 41 спеке репозитория начисто

**Invariants:**

- exit `1` ⇔ есть хотя бы одна error-находка; warning-и одни → exit 0
- `--all` распознаёт Tracker Index по содержимому (таблица Task-ID/Status), не по имени файла — покрывает и `*.3-tasks.md`, и легаси `tasks/<scope>/README.md`; сверяет со статусом тикета (см. постусловия, tracker↔ticket); тикет (v2) = файл с META + EXECUTION_LOG маркерами; легаси-тикет (v1) = те же заголовки как голый markdown (`## N. Meta`/`## N. Execution Log`), Task-ID/Status читаются, но полная структурная проверка недоступна без якорей (см. D-CK012)
- exit `4` без `--task`/`--all`
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-check --all .
[sdd-check] ✅ clean — 41 file(s) checked
# exit 0

$ npx gennady sdd-check --task specs/cli/core/core.task-foo.md
specs/cli/core/core.task-foo.md: error: SDD_FABRICATED_DONE  Checked [x] line with an unreplaced placeholder: "- [x] `<ts>` ver `<cmd>` → pass"
specs/cli/core/core.task-foo.md: warn: SDD_DONE_WITH_PLACEHOLDERS  Status is DONE but unreplaced <…> scaffold placeholders remain.

[sdd-check] 1 error(s), 1 warning(s) across 1 file(s)
# exit 1
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                          | Type         | Purpose                                                                                                                   |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `run`                         | Command      | Точка входа CLI: `--task`/`--all`, обход, агрегация, формат                                                               |
| `walkMd`                      | Utility      | Рекурсивный сбор `.md` под директорией (skip system/build, симлинки)                                                      |
| `checkSpecLinks`              | Utility      | Резолв `](…spec.md)` ссылок спеки на диске                                                                                |
| `parseGraphEdges`             | Utility      | (`shared/sdd/portal`) рёбра Mermaid-графа портала → `{from,to}[]`                                                         |
| `checkPortal`                 | Utility      | (`shared/sdd/check`) чистые проверки портала (граф/таблица/сироты) → `Finding[]`                                          |
| `checkTicket`                 | Utility      | (`shared/sdd/check`) чистые пер-тикет проверки → `Finding[]`                                                              |
| `isTicket`                    | Utility      | (`shared/sdd/check`) распознавание тикета (v2) по META + EXECUTION_LOG маркерам                                           |
| `isLegacyTicket`              | Utility      | (`shared/sdd/check`) распознавание легаси-тикета (v1) по голым заголовкам Meta/Execution Log (`legacyHeaderBody`)         |
| `legacyTicketRef`             | Utility      | (`shared/sdd/check`) Task-ID/Status/deps легаси-тикета → `TicketRef`                                                      |
| `checkLegacyTicket`           | Utility      | (`shared/sdd/check`) один warn `SDD_LEGACY_TICKET_UNANCHORED` вместо лавины формат-находок                                |
| `checkSpecHierarchy`          | Utility      | (`shared/sdd/check`) module↔parent-index сверка по всему дереву → `SDD_MODULE_NOT_IN_INDEX`/`SDD_PARENT_MODULE_NOT_INDEX` |
| `legacyHeaderBody`            | Utility      | (`shared/sdd/anchor-inject`) тело канонического v1-заголовка (без якорей)                                                 |
| `formatFindings`              | Utility      | ESLint-style рендер + вывод exit-кода                                                                                     |
| `badInvocation` / `fileError` | Utility      | Билдеры результатов-ошибок                                                                                                |
| `Finding`                     | Value Object | `{severity, code, file, message}` (`shared/sdd/check`)                                                                    |
| `CheckResult`                 | Value Object | `{text, exitCode}`                                                                                                        |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Mechanical Audit

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - Ровно один режим: `--task <ticket>` или `--all [root]`
- Postconditions:
  - Пер-тикет проверки: баланс якорей · обязательные секции (META, EXECUTION_LOG) · наличие Task-ID · парсимость Status · фабрикованный DONE (`[x]` + `<…>`; `[x]` внутри инлайн-кода — `` `[x]` `` — НЕ считается чекбоксом, только литеральный markdown-чекбокс вне бэктиков, см. D-CK002) · DONE при активном BLOCKED (`SDD_DONE_WITH_ACTIVE_BLOCKER`, error) · открытый BLOCKED на любом другом статусе (`SDD_BLOCKER_OPEN`, warn — незакрытый блокер репортится всегда, не только на DONE, чтобы execute-оркестратор мог опираться на тул, а не на ручной скан лога) · DONE с остаточными плейсхолдерами · граф фаз (deps резолв + ацикличность) · фазы ↔ `PHASE_Pn`-секции · DONE ⇒ все фазы `[x]` · **rule-ссылки фаз резолвятся** (`](…\.xml)` в тикете → файл на диске, `SDD_BROKEN_RULE_LINK`) · **spec-ссылки резолвятся** (`](…spec.md#entity)` в тикете → файл (`SDD_BROKEN_SPEC_REF`, error) + якорь-сущность как heading-slug/SECTION (`SDD_BROKEN_SPEC_ANCHOR`, warn) — чтобы `sdd-extract` воркера не упал) · **BDD_COVERAGE** (`TEST_COVERAGE` секция тикета, `shared/sdd/bdd-coverage.ts`): `SDD_BDD_SCENARIO_UNTESTED` — заявленный `it()`/`test()` не найден в тест-файле (severity по `flowVersion`, см. D-CK014); `SDD_BDD_DEFERRED_TO_SELF` — строка `Deferred Test Ownership:` указывает на Task-ID самого тикета (error, всегда — самоделегирование прячет отсутствующее покрытие, не откладывает его); `SDD_BDD_COVERAGE_ROW_UNPARSED` — строка секции похожа на coverage-ряд (начинается с `-`), но не матчит ни `→ \`file\` :: \`case\``ни валидный`Deferred Test Ownership:` (warn, всегда — сегодня такая строка тихо пропадает из проверки, см. D-CK014)
  - `--all` также: битые `](…spec.md)` ссылки + баланс якорей `.spec.md`; обязательные секции по scope-type; целостность портала (`specs/README.md`): ацикличность графа · граф↔таблица scope'ов · висячие связи · сироты · DONE-scope без файла спеки; **task-DAG** (коллизии Task-ID · deps резолвятся · ацикличность, покрывает и v2-, и легаси-тикеты — см. ниже); **легаси-тикет** (v1, голые заголовки `## N. Meta`/`## N. Execution Log`, без `<!--SECTION-->` — `isLegacyTicket`): полный `checkTicket` (маркер-зависимый) не гонится — вместо лавины `SDD_MISSING_META`/`SDD_MISSING_EXECUTION_LOG` один advisory `SDD_LEGACY_TICKET_UNANCHORED`; Task-ID/Status/Dependencies читаются из голового Meta-заголовка (`legacyHeaderBody`, `legacyTicketRef`) и участвуют в task-DAG и tracker↔ticket на равных с v2-тикетами (см. D-CK012); **tracker↔ticket** (Tracker Index распознаётся по содержимому — таблица Task-ID/Status, — не по имени файла, покрывает и `*.3-tasks.md`, и легаси `tasks/<scope>/README.md`; статус сравнивается без учёта backtick-обёртки ячейки; `SDD_TRACKER_STATUS_DRIFT` — дрифт статуса в любую сторону (тикет обгоняет трекер ИЛИ трекер обгоняет тикет) — всегда error; `SDD_TRACKER_MISSING_ROW`/`SDD_TRACKER_ORPHAN_ROW` — по образцу `SDD_BDD_SCENARIO_UNTESTED`: warn на v1 (легаси-scope терпит вычищенные из трекера superseded-тикеты), error на v2); **module-graph** (`SDD_MODULE_DAG_CYCLE` — цикл в графе зависимостей модулей scope, рёбра из `## 9` Inter-Module Dependencies, объединённые по scope); **module-bloat** (**warn**, advisory, exit 0, `AX_HIERARCHICAL_SPECS`): `SDD_MODULE_OVERSIZED` — инвентарь > порога сущностей (P90=20) → декомпозиция на под-модули; `SDD_MODULE_SPEC_VERBOSE` — спека длиннее порога строк при связном инвентаре → компрессия спеки; **scope-bloat** (**warn**, `AX_SCOPE_STAYS_THIN`): `SDD_SCOPE_BLOATED` — scope-спека несёт модульную деталь (`ENTITY_INVENTORY`/`MODULE_CONTRACTS`); **scope-deps↔портал** (**warn**, B5, `AX_SCOPE_GRAPH_DISCIPLINE`): `SDD_SCOPE_DEP_UNDECLARED` — ребро портала `X --> Y` не отражено в `## 7 Scope Dependencies` спеки X; **иерархия спек** (severity по `flowVersion` модуля/родителя — warn на v1, error на v2, `AX_HIERARCHICAL_SPECS`/`AX_SCOPE_STAYS_THIN`): `SDD_MODULE_NOT_IN_INDEX` — модульная спека на диске не сматчена markdown-ссылкой из ближайшего предка-спеки выше по дереву (namespace-директории без своей спеки — легально, поиск идёт выше); `SDD_PARENT_MODULE_NOT_INDEX` — модульная спека, под чьей директорией есть дочерние модульные спеки (любая глубина), всё ещё несёт `ENTITY_INVENTORY`/`MODULE_CONTRACTS` — родитель обязан стать тонким индексом (рекурсия `SDD_SCOPE_BLOATED` на уровень модуля)
  - exit 1 при ≥1 error; иначе 0
- Invariants:
  - `checkTicket` чист (без I/O); кросс-файловое — в команде
  - Плейсхолдер `/<[A-Za-z…][^>\s]*>/` — НЕ матчит HTML-маркеры секций (`<!--…-->`)

**Deferred (audit-агент, семантика):** closed-world symbol-diff (код↔Inventory), BDD↔test substance, rules-cascade resolution, stale-after-pivot, runtime-backing real-vs-stub. Требуют AST / запуска тестов / суждения — не механика. (Task-DAG, tracker-sync, граф фаз, exec-log completeness, anchors `.spec.md` — теперь механически в туле; см. постусловия.)

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Flag / Arg        | Type    | Description                                                                                                                           |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `--task <ticket>` | string  | Проверить один тикет                                                                                                                  |
| `--all`           | boolean | Проверить все тикеты + спеки под `specs/`                                                                                             |
| `[project-root]`  | string  | Корень для `--all` (cwd по умолчанию); обходит `specs/` под ним ИЛИ саму папку — `--all specs/<scope>` скоупит проверку на один scope |

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-check/
├── index.ts             # Entry point for dynamic import
├── sdd-check.cmd.ts     # Command: --task/--all, walkMd, checkSpecLinks, aggregate
├── sdd-check.types.ts   # error codes, CheckResult, formatFindings
├── help.ts              # Help text output
└── __tests__/sdd-check.cmd.test.ts

shared/sdd/check.ts      # checkTicket/isTicket (v2) + isLegacyTicket/legacyTicketRef/checkLegacyTicket (v1) + __tests__/check.test.ts, check-legacy-ticket.test.ts
shared/sdd/anchor-inject.ts  # injectAnchors + legacyHeaderBody (shared header/span logic) + __tests__/anchor-inject.test.ts
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**E2E:** отложен (прокси-блок в песочнице). Покрытие: unit (pure + run) + lint + typecheck + dogfood `--all .` (41 спека, clean).

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-CK001 — Граница: механика в тул, семантика в аудит-агент

- **Status:** active
- **Why:** Полный контракт аудита включает symbol-diff/BDD↔test/cascade — это AST + исполнение + суждение. Тул берёт детерминированную часть (структура, статусы, фабрикованный DONE, битые ссылки); семантику оставляет агенту, который и так читает код/тесты. Так тул прост, быстр, тестируем без сети.
- **Risk accepted:** `--all` clean ≠ «семантически верно» — это явно задокументировано (help + spec); агент остаётся обязательным.

### D-CK002 — Плейсхолдер-регэксп исключает HTML-маркеры

- **Status:** active
- **Why:** Наивный `/<[^>\s]+>/` матчит `<!--SECTION:…-->`, давая ложный DONE_WITH_PLACEHOLDERS на КАЖДОМ тикете (поймано юнит-тестом). Скаффолд-плейсхолдеры начинаются с буквы/`…`, маркеры — с `!`/`/`: `/<[A-Za-z…][^>\s]*>/`.
- **Risk accepted:** Нет.

### D-CK014 — `SDD_FABRICATED_DONE` игнорирует `[x]` внутри инлайн-кода; два новых кода BDD_COVERAGE

- **Status:** active
- **Why:** Свежий тикет из `TASK_SKELETON` (`shared/sdd/templates.ts`) даёт ложный `SDD_FABRICATED_DONE` на строке-подсказке Execution Log — она содержит и `` `[x]` ``, и `` `<…>` `` внутри бэктиков как иллюстрацию правила, не как реальный чекбокс. Проверка теперь матчит `[x]` только на строке БЕЗ инлайн-код-спанов (`` `…` `` вырезаются перед тестом), а плейсхолдер — на исходной строке (реальный `[x] \`<ts>\``— плейсхолдер конвенционально в бэктиках рядом с чекбоксом — продолжает ловиться). Отдельно —`bdd-coverage.ts`тихо пропускал два класса реальных проблем: (1)`Deferred Test Ownership:`строка, чей Task-ID == Task-ID самого тикета — самоделегирование, прячущее отсутствующее покрытие вместо честной пометки`TODO`/реальной передачи другому тикету → `SDD_BDD_DEFERRED_TO_SELF`(error, не градуируется по`flowVersion`— единичная настоящая находка, не легаси-шум); (2) строка`## Test Scenario Coverage`, похожая на ряд (`-`-префикс), но не матчащая ни arrow-форму, ни валидный `Deferred Test Ownership:`— раньше исчезала без следа из`parseTestCoverage`, теперь `findUnparsedCoverageRows`/`checkUnparsedCoverageRows`дают`SDD_BDD_COVERAGE_ROW_UNPARSED` (warn, тоже не градуируется — единичная находка).
- **Risk accepted:** Нет — оба нового кода репортят реальные, а не легаси-переходные, проблемы; severity фиксирована умышленно, без v1/v2-градации (в отличие от `SDD_BDD_SCENARIO_UNTESTED`).

### D-CK004 — Проверка целостности портала в `--all`

- **Status:** active
- **Why:** граф scope'ов раньше нигде механически не проверялся (`root` лишь заявлял «verified by sdd-check»). `--all` теперь проверяет `specs/README.md`: ацикличность, граф↔таблица↔спеки, сироты, висячие связи. Чистое ядро `checkPortal` (вход — таблица scope'ов + рёбра графа + имена spec-папок на диске); fs-сбор папок — в команде. Закрывает дыру UC-6 (сирота при удалении/переименовании scope).
- **Risk accepted:** «нет файла спеки» — ошибка только для DONE-scope; 🚧/планируемые без файла — норма (ещё не авторизованы).

### D-CK003 — `*.3-tasks.md` пропускаются

- **Status:** superseded by D-CK012
- **Why:** Целостность трекеров (статус строки = статус тикета) — забота `sdd-sync` (он пишет + verify). Дублировать проверку в check — расхождение источников истины.
- **Superseded because:** На практике `sdd-sync` пишет статус, но не verify'ит существующий рассинхрон — трекер может обогнать тикет (строка `DONE`, Meta тикета всё ещё `TODO`) незамеченно. Реальный кейс: `tasks/cli/README.md` заявлял TSK-58 `DONE`, сам тикет стоял `TODO` — `sdd-check --all` это не поймал (см. D-CK012). Дублирование источников истины — не аргумент против механической сверки; `checkTrackers` уже существовал (сверка добавлена позже без обновления этой записи) и был просто не подключён.

### D-CK005 — Мягкие сигналы раздувания модуля (два кода, warn)

- **Status:** active
- **Why:** раздувание реально на уровне модуля, и предел держит ТУЛ, не проза (аксиома лишь называет правило, просто). Два детерминированных сигнала → два средства: `SDD_MODULE_OVERSIZED` (инвентарь > порога сущностей → мир большой → **декомпозиция** на под-модули); `SDD_MODULE_SPEC_VERBOSE` (спека > порога строк при связном инвентаре → не велик, просто многословно → **компрессия**). Оба — **warn** (exit 0), не error: тул подсвечивает и говорит ЧТО подходит, оператор решает. Срабатывают на границах `module`-сессии (вход `add-module`/`refine-module` + закрытие STEP_6) и в `--all`. Пороги — именованные константы на ХВОСТЕ (~P90) реального распределения: ловят выброс, а не верхнюю четверть (совет, срабатывающий на четверти спек — шум). **750 строк** (хвост LOC спеков). **20 сущностей** — откалибровано по 63 инвентарям: медиана 9, Q3 14, P90 20, max 50; старое 12 стояло между медианой и Q3 → флагало ~треть модулей (здоровое ядро); 20 = P90 ловит только реальные выбросы (верх корзины 16-30 + три монстра: activity-monitor 50, types 44, utils 32). VERBOSE→компрессия не дробит (уплотняет прозу), ложное срабатывание безвредно; риск «мельчения» несёт только OVERSIZED→декомпозиция. На уровне scope счётчика НЕТ: граница **категориальная** (см. D-CK010 — scope несёт модульную деталь), а не размерная.
- **Risk accepted:** пороги приблизительны (счёт строк таблицы / строк файла); длинный decision-log может ложно поднять LOC — допустимо, это совет, решает оператор + директива.

### D-CK007 — Rule-ссылки тикетов резолвятся (`SDD_BROKEN_RULE_LINK`)

- **Status:** active
- **Why:** scaffold пишет в фазы тикета markdown-ссылки на rule-файлы (`[ai/directives/<cat>/<rule>.xml](path)`); резолв проверялся только агентом во время scaffold (`H_MISSING_RULE_FILE`) и воркером в рантайме (`H_MISSING_RULE_FILE` в phase-execution). Удалённый/переименованный/опечатанный rule-файл всплывал лишь при исполнении. Теперь `sdd-check` на тикетах резолвит `](…\.xml)`-ссылки (зеркало `SDD_BROKEN_SPEC_LINK`) — shift-left на close scaffold (`sdd-check --all .`). Плейсхолдеры формата (`](<relative-path>)`) не матчатся: цель ссылки не оканчивается на `.xml`.
- **Risk accepted:** ловит любую битую `.xml`-ссылку в тикете, не только rule (приемлемо — все `.xml`-ссылки тикета должны резолвиться).

### D-CK008 — Spec-ссылки тикета резолвятся (spec→task→execute консистентность)

- **Status:** active
- **Why:** тикет несёт Spec References `](…spec.md#entity)` на сущности спеки; sdd-task кладёт их в read-manifest, воркер делает `sdd-extract`. Если сущность переименована / спека перенесена — ссылка висит, извлечение падает в рантайме. `sdd-check` на тикетах резолвит: **файл** (`SDD_BROKEN_SPEC_REF`, error — однозначно) + **якорь** как heading-slug (lowercase, не-словарные→убрать, пробелы→`-`) ИЛИ `<!--SECTION:X-->` (`SDD_BROKEN_SPEC_ANCHOR`, **warn** — slug-эвристика хрупка на сигнатурах, не валим гейт). Замыкает цепочку spec→task→execute механически на close.
- **Risk accepted:** slug-эвристика может не сматчить заголовок со сложной пунктуацией/сигнатурой → ложный warn (не error); калибруется.

### D-CK006 — Граф модулей: только цикл, без dangling

- **Status:** active
- **Why:** `## 9 Inter-Module Dependencies` несёт структурированный Mermaid-граф (`<module> --> <sibling>`), парсится тем же `parseGraphEdges`, что портал (пунктирные cross-scope `.->` он игнорирует). Рёбра модульных спек объединяются по scope → `hasCycle`. Цикл (`SDD_MODULE_DAG_CYCLE`, error) — реальная архитектурная проблема, ловится надёжно, ложных срабатываний нет (цикл есть цикл). **Dangling-проверку (конец ребра = сосед-модуль) НЕ делаем:** граф легально содержит не-модульные узлы — точки входа (`index.ts`, `gennady.ts`) и шаренные либы (`shared/common/…`); требовать резолва в сосед-модуль → ложные срабатывания. Резолв связей — за аудит-агентом.
- **Risk accepted:** опечатка в имени соседа (не цикл) здесь не всплывёт — это семантика, ловит агент/оператор. Группировка по первому сегменту после `specs/`; вложенные под-модули объединяются в граф своего scope.

### D-CK009 — Перекрытие секций: стек поверх баланса (`SDD_SECTION_OVERLAP`)

- **Status:** active
- **Why:** `SDD_ANCHOR_UNBALANCED` считает только количество open/close на имя — interleaving проходит мимо: `A открыта · B открыта · A закрыта · B закрыта` балансируется по счёту (A 1/1, B 1/1), но `sdd-extract` тянет ровно одну **плоскую** секцию и на пересечении ломается. `sectionOverlaps` ведёт стек: open-при-открытой (вложенность) и close не-вершины (interleave) → `SDD_SECTION_OVERLAP` (error). SDD-секции плоские (правило формата A8: под-секции не оборачиваются), поэтому глубина стека > 1 — всегда дефект. Проверка в обоих входах — тикеты (`checkTicket`) и спеки (`checkSpecStructure`).
- **Risk accepted:** при незакрытой секции возможен двойной сигнал (и UNBALANCED по счёту, и OVERLAP) — оба верны, не шум.

### D-CK010 — Scope-bloat: scope несёт модульную деталь (`SDD_SCOPE_BLOATED`)

- **Status:** active
- **Why:** `AX_SCOPE_STAYS_THIN` — scope остаётся тонким индексом, а `ENTITY_INVENTORY`/`MODULE_CONTRACTS` (инвентарь сущностей, DbC) живут ТОЛЬКО в модулях. Проверка **категориальная**, не размытый порог: scope-спека, несущая эти секции, → `SDD_SCOPE_BLOATED` (warn). Классификатор уточнён: модуль = по маркеру `MODULE_VISION` (а не по `ENTITY_INVENTORY`, иначе раздутый scope маскировался под модуль); scope = есть `SCOPE_TYPE`, нет `MODULE_VISION`. Формат v2 (`product/library/...-spec-structure`) фиксирует: scope несёт `SCOPE_TYPE…MODULE_MAP…HANDOFF`, но НЕ инвентарь/контракты — отсюда правило. Спроектировано от формата kit, не от легаси-спек репо.
- **Risk accepted:** модульная спека с унаследованным `SCOPE_TYPE` родителя + `ENTITY_INVENTORY` не ловится как bloat (правильно — у неё есть `MODULE_VISION`). Легаси-спеки без SECTION-маркеров проверка не трогает (не мигрируем).

### D-CK012 — Tracker Index: распознавание по содержимому + severity-градация по `flowVersion`

- **Status:** active
- **Supersedes:** D-CK003
- **Why:** `--all` классифицировал Tracker Index по имени файла (`*.3-tasks.md`/`*.2-tasks.md`) — ни один файл в репозитории так не называется, весь трекер-трафик живёт в `tasks/<scope>/README.md`; `checkTrackers` существовал, но получал пустой массив строк, поэтому не срабатывал ни в одну сторону. Реальный пропуск: `tasks/cli/README.md` строка TSK-58 `DONE`, тикет `orient.task-55.md` (`TSK-55`) — `TODO`; трекер обогнал тикет незамеченно. Классификация переведена на содержимое (`isTrackerIndex` — таблица Task-ID/Status), покрывает и легаси README, и будущий `*.3-tasks.md`. Отдельно найден и починен формат-баг: `parseTrackerRows` оставляет Status-ячейку сырой (с backtick — `sdd-sync` пишет обратно байт-в-байт), а Meta тикета — без backtick; `checkTrackers`' `norm()` их не срезал → лавина ложного `SDD_TRACKER_STATUS_DRIFT` (34 находки на реальном дереве, из них 32 — чисто формат). После обеих правок реальный дрифт — 2 находки (TSK-55 — подтверждённый живой баг; TSK-88 — побочный эффект существующей коллизии Task-ID между scope, уже отдельно `SDD_TASK_ID_COLLISION`).
- **Risk accepted:** Включение классификации вскрыло другой существующий разрыв: v1-тикеты без `<!--SECTION:-->`-разметки (`isTicket` их не узнаёт) дают `SDD_TRACKER_ORPHAN_ROW`/`SDD_TRACKER_MISSING_ROW` шумом на легаси-дереве (55 + 15 находок) — включая намеренно вычищенные из трекера superseded-тикеты (`agent-inbox` TSK-156…170). Смягчено по образцу `SDD_BDD_SCENARIO_UNTESTED`: `SDD_TRACKER_STATUS_DRIFT` — всегда error (редкий, всегда genuine после того как обе стороны разрешились); `SDD_TRACKER_MISSING_ROW`/`SDD_TRACKER_ORPHAN_ROW` — `warn` на v1 (default), `error` на v2 (`TicketRef.flowVersion`/`TrackerRowRef.flowVersion`, из `ticketFlowVersion`). Сам разрыв `isTicket` на legacy-разметке — не тронут, отдельная задача.
- **Update (isLegacyTicket закрыл разрыв):** легаси-тикеты (v1, голые заголовки `## N. Meta`/`## N. Execution Log`) теперь распознаются отдельно (`isLegacyTicket`) и участвуют в task-DAG/tracker↔ticket через `legacyTicketRef` (Task-ID/Status/Dependencies из `legacyHeaderBody`, без полного `checkTicket` — см. Module Contracts). Было (обход слепой к легаси, 125 файлов) → стало (76 легаси-тикетов видимы, 201 файл): `SDD_TRACKER_ORPHAN_ROW` 55 → 2 (обе находки — реальный дрифт: трекер-строка без тикета на диске); `SDD_TRACKER_MISSING_ROW` 15 → 37 (рост, не шум — легаси-тикеты, которых раньше не было в `ticketRefs`, теперь честно сверяются с трекером; большая часть — намеренно вычищенные из трекера superseded-тикеты, `agent-inbox` TSK-156…170, задокументированные в `tasks/agent-inbox/README.md`). Т.к. `MISSING_ROW` остаётся массовым и содержит легитимные (задокументированные) исключения, а не только настоящий дрифт, безусловный `error` для него НЕ введён — flowVersion-градация (D-CK012) остаётся. `ORPHAN_ROW` теперь единичный и настоящий на всём дереве, но severity-функция общая для обоих кодов (`severityOf`) — раздельная градация — YAGNI, пока `ORPHAN_ROW` не даёт собственного мотивированного кейса.

### D-CK011 — B5: scope-deps ↔ портал-граф (`SDD_SCOPE_DEP_UNDECLARED`)

- **Status:** active
- **Why:** портал `## Scope Graph` (mermaid `X --> Y`) — структурная истина зависимостей; спека scope в `## 7 Scope Dependencies` («Depends on: [...]») — свободная форма (имена + wildcard `prefix-*` + проза). `checkScopeDeps` сверяет **направление граф→спека**: каждое ребро портала `<scope> --> <dep>` должно быть отражено в «Depends on» (точное имя ИЛИ wildcard-префикс); непокрытое → warn. Только это направление: спека-сторона слишком шумна для обратной сверки (wildcard/проза дали бы ложные). Проза в строке безвредна — проверяется лишь покрытие рёбер графа, лишние токены не флагают. Рёбра портала предчитываются один раз в `--all`; scope-имя = stem basename файла. Решает прежнюю отложенность B5 (свободная форма) — wildcard-толерантность + односторонность убирают хрупкость.
- **Risk accepted:** warn, не error (свободная форма). Обратное направление (спека заявила dep, которого нет в графе) НЕ ловим. Спека без секции `SCOPE_DEPENDENCIES` (модули, легаси) → пропуск.

### D-CK013 — Иерархия спек: module↔parent-index сверка (`SDD_MODULE_NOT_IN_INDEX`/`SDD_PARENT_MODULE_NOT_INDEX`)

- **Status:** active
- **Why:** `AX_HIERARCHICAL_SPECS`/`AX_SCOPE_STAYS_THIN` описывали правило прозой без механической проверки: ни одна проверка не ловила орфан-модуль (спека на диске, не упомянутая в Module Map/ссылках родителя) и не проверяла, что родительский модуль с дочерними модулями стал тонким индексом (рекурсия `SDD_SCOPE_BLOATED` на уровень модуля). `checkSpecHierarchy` (пер `checkBddCoverage` — вход весь набор spec-файлов дерева, а не один файл) находит ближайшего предка-спеку выше по каталогам (namespace-директории без своей спеки — легально, пропускаются транспарентно) и проверяет: (1) родитель ссылается на модуль markdown-ссылкой `](…spec.md)`; (2) если у модуля есть дочерние модули на любой глубине, сам он не несёт `ENTITY_INVENTORY`/`MODULE_CONTRACTS`.
- **Risk accepted:** ссылка ловится текстовым матчем `]\(…spec.md\)` резолвнутым относительно директории родителя — форматирование ссылки (относительный путь любой формы) не важно, но ссылка ДОЛЖНА резолвиться в тот же файл; ссылка на модуль текстом без markdown-синтаксиса не засчитывается (осознанно — механика, не NLP).

### `getRuleDeps`

- **Usage Waiver:** Читает и парсит `<DependsOn>` одного rule-файла, memoized — изолирует I/O-границу от обхода графа (`buildRuleDepsMap`); rule-файлы общие для многих тикетов в `--all`, читаются не более раза.

### `buildRuleDepsMap`

- **Usage Waiver:** Разворачивает набор seed-правил в полный транзитивный `<DependsOn>`-граф — изолирует обход графа от чтения отдельного файла (`getRuleDeps`).

### `getTestFileIndex`

- **Usage Waiver:** Строит один раз индекс basename → путь(и) для всех `*.test.*`/`*.spec.*` файлов репо — изолирует обход директорий от поиска тестового файла по имени (используется в BDD_COVERAGE для всех тикетов `--all`).

### `getTestCaseNames`

- **Usage Waiver:** Читает и извлекает имена `it()`/`test()` одного тестового файла, memoized — изолирует I/O от индекса файлов (`getTestFileIndex`).

### `checkFileConsumersResolvable`

- **Usage Waiver:** Запускает grep-проверку `@consumers:` для одного файла — изолирует I/O-обёртку (запуск grep, чтение файла) от чистой классификации записей (`checkConsumersResolvable`).

### `findRepoRoot`

- **Usage Waiver:** Поднимается до ближайшего `package.json` — нужна, потому что сканируемый корень `--all` может быть вложенным поддеревом, а не настоящим корнем репозитория.

### `ticketFlowVersion`

- **Usage Waiver:** Определяет flowVersion тикета по сегменту `tasks/<scope>/` — в отличие от `specFlowVersion` (сегмент `specs/<scope>/`), у тикета нет `specs`-сегмента для привязки, поэтому нужна отдельная функция с явно переданным `repoRoot`.

### `splitConsumerEntries`

- **Usage Waiver:** Экспортирована отдельно для изолированного юнит-теста алгоритма depth-tracking comma-split (разбор `@consumers:` с учётом вложенных скобок) без остального парсинга заголовка.

### `checkTableCells`

- **Usage Waiver:** Экспортирована для прямых юнит-тестов политики таблиц (16 кейсов в `check-spec-structure.test.ts`); в продакшен-коде вызывается один раз из `checkSpecStructure`.

### `SENTENCE_BREAK`

- **Usage Waiver:** Регексп границы предложения (конец фразы + заглавная буква) для эвристики «многословная ячейка таблицы» в `checkTableCells`; вынесен как модульная константа, чтобы граница была видна отдельно от логики проверки.

### `isTrackerIndex`

- **Usage Waiver:** Классификация Tracker Index по содержимому (Task-ID/Status таблица), а не по имени файла — вынесена отдельной функцией с собственным JSDoc, чтобы ветка `--all` не несла многострочный комментарий (лимит `RegionCommentCheck`); единственный вызов внутри цикла обхода.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/check.ts` (→ `section.ts`, `ticket.ts`), `shared/sdd/portal.ts` (parseScopes + parseGraphEdges), `#logger`
- **Provides to:** `gennady.ts`; вызывается из скилов `audit` / `reconcile` / `check`
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
