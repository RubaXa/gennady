# Module: `sdd-task`

**Module:** sdd-task · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Планировочная поверхность тикета для оркестратора `execute`. `sdd-task <ticket-path|Task-ID>` извлекает ТОЛЬКО планировочные секции (Meta + Phases Overview + тело каждой фазы + Verification) и собирает per-phase read-manifest (`AX_READ_PER_MANIFEST`): что фаза читает (rules / specs / ticket-секции / target-файлы / gates) и **что НЕ читает**. Аргумент — путь ИЛИ голый Task-ID (резолвится сканом по Meta, `AX_TASK_RESOLUTION`, D-TK006). Оркестратор читает этот вывод вместо всего тикета и не лезет в тела фаз, BDD, спеки, код. **Без Task-ID** `sdd-task` отдаёт **карту исполнения** — детерминированный pickable-набор (готовые сейчас, каждый со своим путём) + заблокированные (чем, тоже с путём) + строка `root:`, посчитанный из трекеров (`pickableTasks`, D-TK004); это карта для LOGIC_SWITCH в `execute` (next / specific / batch). Парсеры тикета вынесены в `shared/sdd/ticket.ts` (переиспользует `sdd-check`).

**Key properties:**

- Planning-only — Meta, Phases Overview, gates, и per-phase manifest; никогда не тела фаз/код
- Manifest-per-phase — rules фазы + Spec References из Meta + секции (PHASE_P<n>, BDD, VERIFICATION) + target-файлы + DO-NOT-READ
- Gate-matching — каждой фазе сопоставляются gate, чей `Required by` пересекается с rule-id фазы (basename без `.xml`)

**Invariants:**

- Тело каждой фазы извлекается отдельной секцией `PHASE_P<n>` — не общим чтением
- exit `0` поверхность · `1` файл · `2` не тикет (нет Meta) · `4` нет пути
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-task specs/cli/core/core.task-foo.md
[sdd-task] cli-foo — [ ] TODO
Purpose: Build foo
Scope/Module: cli / core
Dependencies: none
Spec References:
  - Contract: FooPort (specs/cli/core/core.spec.md#fooport)

Phases Overview:
  P1 impl  deps=—  status=[ ]

Per-phase read-manifest (AX_READ_PER_MANIFEST):

▸ P1 — impl  [ ]
  objective:   implement foo
  READ rules:  ai/directives/coding/typescript-rules.xml
  READ specs:  specs/cli/core/core.spec.md#fooport
  READ ticket: PHASE_P1, BDD, VERIFICATION
  READ files:  src/foo.ts
  gates:       npm run type-check
  inputs:      none
  DO NOT READ: other phase bodies · code outside READ files · specs beyond the anchors above

Gates (all):
  npm run type-check  ← typescript-rules
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                                                                 | Type         | Purpose                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------- |
| `run`                                                                                | Command      | Точка входа CLI: извлечение планировочных секций, сборка, формат (или `--phase`)                           |
| `formatPlan`                                                                         | Utility      | Рендер планировочной поверхности + per-phase manifest + DO-NOT-READ                                        |
| `formatPhase`                                                                        | Utility      | Рендер компактного контекста одной фазы (`--phase`): gates+hint, exit, filtered read-manifest, `[HANDOFF]` |
| `gateHint`                                                                           | Utility      | Однострочник «как удовлетворить» для gate-команды, по ключевому слову                                      |
| `phaseNotFound`                                                                      | Utility      | Билдер диагностики: неизвестный `--phase`, exit 2                                                          |
| `ruleId`                                                                             | Utility      | rule-link → rule-id (basename без `.xml`) для матчинга gate                                                |
| `parseMetaInfo`                                                                      | Utility      | (`shared/sdd/ticket`) Meta → taskId/status/purpose/scope/module/deps/specRefs                              |
| `parsePhasesOverview`                                                                | Utility      | (`shared/sdd/ticket`) таблица фаз → `PhaseOverview[]`                                                      |
| `parsePhaseDetail`                                                                   | Utility      | (`shared/sdd/ticket`) тело фазы → objective/rules/specRefs/targetFiles/inputs/exit                         |
| `parseVerification`                                                                  | Utility      | (`shared/sdd/ticket`) таблица gate → `Gate[]`                                                              |
| `parsePhaseHandoffs`                                                                 | Utility      | (`shared/sdd/check`) EXECUTION_LOG → phase id → дословная `**Handoff →**`-строка                           |
| `resolveTicketArg`                                                                   | Utility      | Аргумент → содержимое: путь как раньше, либо (не читается + похож на ID) скан по Meta Task-ID (D-TK006)    |
| `withResolutionLine`                                                                 | Utility      | Добавляет строку резолва `[sdd-task] <id> → <path>` к успешному outcome, когда аргумент был ID             |
| `looksLikeTaskId`                                                                    | Utility      | (`shared/sdd/task-id`) грамматика `<ACR>-<slug>` без проверки длины — есть ли смысл резолвить как ID       |
| `badInvocation` / `fileError` / `notATicket` / `unknownIdError` / `ambiguousIdError` | Utility      | Билдеры диагностик                                                                                         |
| `MetaInfo` / `SpecRef` / `PhaseOverview` / `PhaseDetail` / `Gate`                    | Value Object | Структуры тикета (`shared/sdd/ticket`)                                                                     |
| `TaskOutcome`                                                                        | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                                                   |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Planning Surface

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - `<ticket-path>` задан и читается; есть секция `META`
- Postconditions:
  - Вывод содержит Meta-сводку, Phases Overview, per-phase manifest, и все gate
  - Каждой фазе сопоставлены только gate с пересечением `Required by` ∩ rule-id фазы
  - Нет тел фаз / BDD / кода в выводе
- Invariants:
  - Каждая фаза извлекается своей секцией `PHASE_P<n>`
  - Отсутствие секции фазы помечается, не падает

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument                              | Type   | Description                                                                           |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `<ticket-path\|Task-ID>`              | string | Путь к тикету ИЛИ голый Task-ID → планировочная поверхность одного тикета             |
| `<ticket-path\|Task-ID> --phase P<n>` | string | Компактный контекст ОДНОЙ фазы вместо полной поверхности — см. 5.1                    |
| _(без аргумента)_                     | —      | **Карта исполнения**: pickable-набор + заблокированные (детерминированно из трекеров) |

`<ticket-path|Task-ID>` → поверхность одного тикета. Путь читается как раньше; голый Task-ID (грамматика `shared/sdd/task-id.ts`) резолвится сканом дерева по Meta Task-ID (`AX_TASK_RESOLUTION`, D-TK006) — ровно один матч печатает строку резолва `[sdd-task] <id> → <относительный путь>` и продолжает как обычно; несколько матчей → exit 2 со списком кандидатов+путей; ноль → exit 2 со списком известных Task-ID (или «очередь пуста»). Без аргумента → карта исполнения (что готово сейчас + что чем заблокировано), `pickableTasks` (D-TK004) — каждая строка (pickable и blocked) несёт относительный путь тикета и общую строку `root:`, так что карта самодостаточна без второго поиска.

### 5.1 `--phase P<n>` — компактный контекст одной фазы

Печатает только то, что фаза читает: `objective`, `gates` (каждый — с однострочником «как удовлетворить»), `exit`, read-манифест (rules · specs · ticket-секции · target-файлы), и, если это не первая фаза, `[HANDOFF]` — дословные `**Handoff →**`-строки из `EXECUTION_LOG` предыдущих завершённых (`[x]`) фаз, с префиксом `Handoff ←P<k>:`. `READ specs` берёт фазовое поле `Spec Refs` (см. `PHASE_P<n>` в task-ticket-structure), если оно объявлено; иначе — весь список Meta Spec References (обратная совместимость со старыми тикетами без этого поля). Завершается строкой `next:` — прочитать перечисленное, исполнить фазу по протоколу, залогировать `sdd-log` + Handoff-строку. Неизвестный `--phase` → exit 2 с перечнем известных фаз.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-task/
├── index.ts             # Entry point for dynamic import
├── sdd-task.cmd.ts      # Command: extract planning sections, parse, assemble, format
├── sdd-task.types.ts    # error codes, TaskOutcome, ruleId, formatPlan
├── help.ts              # Help text output
└── __tests__/sdd-task.cmd.test.ts

shared/sdd/ticket.ts     # parseMetaInfo / parsePhasesOverview / parsePhaseDetail / parseVerification + __tests__/ticket.test.ts
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**E2E:** отложен (прокси-блок в песочнице). Покрытие: unit (parsers + run) + lint + typecheck + ручной smoke.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-TK001 — Парсеры тикета в `shared/sdd/ticket.ts`

- **Status:** active
- **Why:** `sdd-check` (аудит) парсит те же секции (Meta, Phases, Verification, Spec References). Общее ядро избегает двух расходящихся парсеров одного формата.
- **Risk accepted:** Низкий.

### D-TK002 — Приём пути тикета, не task-id

- **Status:** superseded by D-TK006
- **Why:** Резолв id → путь — отдельная забота оркестратора (`AX_TASK_RESOLUTION`). К моменту вызова путь известен. Тул остаётся узким и детерминированным.
- **Risk accepted:** Прямой вызов «по id» из CLI не сработает; для флоу это не нужно (оркестратор даёт путь).
- **Update:** часть «выбор pickable-таска — забота оркестратора» СУПЕССИРОВАНА D-TK004 — pickable теперь даёт сам тул (режим-карта), оркестратор не читает трекеры глазами. «Прямой вызов по id не сработает» СУПЕССИРОВАНО D-TK006 — живой инцидент показал, что карта сама учит агента звать `sdd-task <id>`, а `run()` это не понимал; тул теперь резолвит id сам.

### D-TK004 — Режим-карта (без аргумента): детерминированный pickable

- **Status:** active
- **Why:** оркестратор не должен «глазами» читать трекеры, чтобы понять, что готово (детерминизм > догадки — общий принцип флоу). `sdd-task` без Task-ID обходит тикеты → `ticketRef` (status+deps) → `pickableTasks` (`shared/sdd/check`: TODO + все deps DONE; placeholder «None…» = нет deps) → карта (pickable + заблокированные, чем). `execute` LOGIC_SWITCH (next / specific / batch) берёт карту тулом. Снимает нагрузку догадок с агента.
- **Risk accepted:** Meta с прозой в Dependencies (запятые) даёт мусор-deps → тикет ложно blocked; чинится на стороне данных (находка: TSK-55 несёт прозу в deps).

### D-TK003 — Поэтапное извлечение секций фаз

- **Status:** active
- **Why:** Цель тула — не дать оркестратору прочитать весь тикет. Сам тул тоже извлекает каждую фазу отдельной секцией `PHASE_P<n>`, а не общим чтением — выходные manifest'ы по конструкции узкие.
- **Risk accepted:** Нет.

### D-TK005 — `--phase P<n>`: компактный контекст фазы, READ specs фазой, Handoff из EXECUTION_LOG

- **Status:** active
- **Why:** живые воркеры реверсили минифицированный `node_modules/gennady`, потому что полная поверхность (`sdd-task <ticket>`) печатала ОДИН список spec-якорей на все фазы и не передавала решения предыдущей фазы (Handoff-строки тонули в `EXECUTION_LOG`). `--phase` даёт узкий, per-phase контекст: gates с однострочным «как удовлетворить», `READ specs` из фазового `Spec Refs` (fallback на весь Meta-список для тикетов без этого поля — обратная совместимость), и `[HANDOFF]` — дословные `**Handoff →**` завершённых фаз, склеенные `parsePhaseHandoffs` (`shared/sdd/check.ts`).
- **Risk accepted:** `Spec Refs` — новое опциональное поле в `PHASE_P<n>`; старые тикеты без него получают фоллбек на полный список, не пустоту.

### D-TK006 — Голый Task-ID резолвится сам (`AX_TASK_RESOLUTION`)

- **Status:** active
- **Why:** живой инцидент — карта (режим без аргумента) отдаёт Task-ID и учит агента «вызови `sdd-task <id>`», но `run()` трактовал любой аргумент как путь: `readFileSync(resolve(ticket))` на голом ID падал file-not-found, агент в панике grep'ал репозиторий. Тул сам заводил в тупик. Фикс: аргумент, не прочитавшийся как путь и совпадающий с грамматикой Task-ID (`shared/sdd/task-id.ts#looksLikeTaskId`), резолвится сканом того же дерева тикетов, что и карта, по Meta Task-ID. Ровно один матч → работает, первой строкой печатает резолв `[sdd-task] <id> → <путь>`; несколько → exit 2 со списком кандидатов+путей; ноль → exit 2 со списком известных ID. Карта дополнительно печатает `root:` и путь на каждой pickable/blocked строке — самодостаточна и без резолва.
- **Risk accepted:** Резолв сканирует всё дерево на каждый вызов с голым ID (как и режим-карта) — цена уже принята D-TK004; коллизия Task-ID (два тикета с одним ID) уже ловится `SDD_TASK_ID_COLLISION` в `sdd-check`, здесь просто не падает необработанно.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/section.ts`, `shared/sdd/ticket.ts`, `#logger`
- **Provides to:** `gennady.ts`; вызывается из `execute` (STEP_1)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
