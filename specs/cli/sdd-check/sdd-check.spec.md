# Module: `sdd-check`

**Module:** sdd-check · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. [ai/sdd-v2-plan.md](../../../ai/sdd-v2-plan.md))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Механический аудит SDD-артефактов — детерминированная половина `audit`/`check`. `sdd-check --task <ticket>` проверяет один тикет; `--all [root]` обходит `specs/` и проверяет все тикеты + ссылки спек + целостность портала (граф scope'ов: ацикличность, граф↔таблица↔спеки, сироты, висячие связи). Это основной потребитель механики; семантические проверки (closed-world symbol-diff, BDD↔test mapping, rules-cascade resolution, stale-after-pivot) остаются за аудит-АГЕНТОМ — здесь сознательно НЕ реализованы (нужен AST/исполнение тестов). Реверс-спека — `scan.sh`, адаптировано под v2 (co-located `specs/`, `<!--SECTION:-->`).

**Key properties:**

- Pure core — `shared/sdd/check.ts#checkTicket` без I/O; обход ФС и резолв ссылок — в команде
- ESLint-style — `file: severity: code  message` + сводка; exit 1 при наличии error
- Dogfooded — `--all .` проходит по реальным 41 спеке репозитория начисто

**Invariants:**

- exit `1` ⇔ есть хотя бы одна error-находка; warning-и одни → exit 0
- `--all` пропускает `*.3-tasks.md` (трекеры — забота `sdd-sync`) и индексы; тикет = файл с META + EXECUTION_LOG
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

| Name                          | Type         | Purpose                                                                          |
| ----------------------------- | ------------ | -------------------------------------------------------------------------------- |
| `run`                         | Command      | Точка входа CLI: `--task`/`--all`, обход, агрегация, формат                      |
| `walkMd`                      | Utility      | Рекурсивный сбор `.md` под директорией (skip system/build, симлинки)             |
| `checkSpecLinks`              | Utility      | Резолв `](…spec.md)` ссылок спеки на диске                                       |
| `parseGraphEdges`             | Utility      | (`shared/sdd/portal`) рёбра Mermaid-графа портала → `{from,to}[]`                |
| `checkPortal`                 | Utility      | (`shared/sdd/check`) чистые проверки портала (граф/таблица/сироты) → `Finding[]` |
| `checkTicket`                 | Utility      | (`shared/sdd/check`) чистые пер-тикет проверки → `Finding[]`                     |
| `isTicket`                    | Utility      | (`shared/sdd/check`) распознавание тикета по META + EXECUTION_LOG                |
| `formatFindings`              | Utility      | ESLint-style рендер + вывод exit-кода                                            |
| `badInvocation` / `fileError` | Utility      | Билдеры результатов-ошибок                                                       |
| `Finding`                     | Value Object | `{severity, code, file, message}` (`shared/sdd/check`)                           |
| `CheckResult`                 | Value Object | `{text, exitCode}`                                                               |

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
  - Пер-тикет проверки: баланс якорей · обязательные секции (META, EXECUTION_LOG) · наличие Task-ID · парсимость Status · фабрикованный DONE (`[x]` + `<…>`) · DONE при активном BLOCKED · DONE с остаточными плейсхолдерами · граф фаз (deps резолв + ацикличность) · фазы ↔ `PHASE_Pn`-секции · DONE ⇒ все фазы `[x]` · **rule-ссылки фаз резолвятся** (`](…\.xml)` в тикете → файл на диске, `SDD_BROKEN_RULE_LINK`) · **spec-ссылки резолвятся** (`](…spec.md#entity)` в тикете → файл (`SDD_BROKEN_SPEC_REF`, error) + якорь-сущность как heading-slug/SECTION (`SDD_BROKEN_SPEC_ANCHOR`, warn) — чтобы `sdd-extract` воркера не упал)
  - `--all` также: битые `](…spec.md)` ссылки + баланс якорей `.spec.md`; обязательные секции по scope-type; целостность портала (`specs/README.md`): ацикличность графа · граф↔таблица scope'ов · висячие связи · сироты · DONE-scope без файла спеки; **task-DAG** (коллизии Task-ID · deps резолвятся · ацикличность); **tracker↔ticket** (дрифт статуса · тикет без строки · строка без тикета); **module-graph** (`SDD_MODULE_DAG_CYCLE` — цикл в графе зависимостей модулей scope, рёбра из `## 9` Inter-Module Dependencies, объединённые по scope); **module-bloat** (**warn**, advisory, exit 0, `AX_HIERARCHICAL_SPECS`): `SDD_MODULE_OVERSIZED` — инвентарь > порога сущностей (P90=20) → декомпозиция на под-модули; `SDD_MODULE_SPEC_VERBOSE` — спека длиннее порога строк при связном инвентаре → компрессия спеки; **scope-bloat** (**warn**, `AX_SCOPE_STAYS_THIN`): `SDD_SCOPE_BLOATED` — scope-спека несёт модульную деталь (`ENTITY_INVENTORY`/`MODULE_CONTRACTS`); **scope-deps↔портал** (**warn**, B5, `AX_SCOPE_GRAPH_DISCIPLINE`): `SDD_SCOPE_DEP_UNDECLARED` — ребро портала `X --> Y` не отражено в `## 7 Scope Dependencies` спеки X
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

shared/sdd/check.ts      # checkTicket / isTicket (pure mechanical checks) + __tests__/check.test.ts
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

### D-CK004 — Проверка целостности портала в `--all`

- **Status:** active
- **Why:** граф scope'ов раньше нигде механически не проверялся (`root` лишь заявлял «verified by sdd-check»). `--all` теперь проверяет `specs/README.md`: ацикличность, граф↔таблица↔спеки, сироты, висячие связи. Чистое ядро `checkPortal` (вход — таблица scope'ов + рёбра графа + имена spec-папок на диске); fs-сбор папок — в команде. Закрывает дыру UC-6 (сирота при удалении/переименовании scope).
- **Risk accepted:** «нет файла спеки» — ошибка только для DONE-scope; 🚧/планируемые без файла — норма (ещё не авторизованы).

### D-CK003 — `*.3-tasks.md` пропускаются

- **Status:** active
- **Why:** Целостность трекеров (статус строки = статус тикета) — забота `sdd-sync` (он пишет + verify). Дублировать проверку в check — расхождение источников истины.
- **Risk accepted:** Рассинхрон трекера, не пойманный sdd-sync, здесь не всплывёт; покрывается тем, что статусы пишет только sdd-sync.

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

### D-CK011 — B5: scope-deps ↔ портал-граф (`SDD_SCOPE_DEP_UNDECLARED`)

- **Status:** active
- **Why:** портал `## Scope Graph` (mermaid `X --> Y`) — структурная истина зависимостей; спека scope в `## 7 Scope Dependencies` («Depends on: [...]») — свободная форма (имена + wildcard `prefix-*` + проза). `checkScopeDeps` сверяет **направление граф→спека**: каждое ребро портала `<scope> --> <dep>` должно быть отражено в «Depends on» (точное имя ИЛИ wildcard-префикс); непокрытое → warn. Только это направление: спека-сторона слишком шумна для обратной сверки (wildcard/проза дали бы ложные). Проза в строке безвредна — проверяется лишь покрытие рёбер графа, лишние токены не флагают. Рёбра портала предчитываются один раз в `--all`; scope-имя = stem basename файла. Решает прежнюю отложенность B5 (свободная форма) — wildcard-толерантность + односторонность убирают хрупкость.
- **Risk accepted:** warn, не error (свободная форма). Обратное направление (спека заявила dep, которого нет в графе) НЕ ловим. Спека без секции `SCOPE_DEPENDENCIES` (модули, легаси) → пропуск.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/check.ts` (→ `section.ts`, `ticket.ts`), `shared/sdd/portal.ts` (parseScopes + parseGraphEdges), `#logger`
- **Provides to:** `gennady.ts`; вызывается из скилов `audit` / `reconcile` / `check`
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
