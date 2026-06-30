# Module: `sdd-task`

**Module:** sdd-task · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. [ai/sdd-v2-plan.md](../../../ai/sdd-v2-plan.md))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Планировочная поверхность тикета для оркестратора `execute`. `sdd-task <ticket>` извлекает ТОЛЬКО планировочные секции (Meta + Phases Overview + тело каждой фазы + Verification) и собирает per-phase read-manifest (`AX_READ_PER_MANIFEST`): что фаза читает (rules / specs / ticket-секции / target-файлы / gates) и **что НЕ читает**. Оркестратор читает этот вывод вместо всего тикета и не лезет в тела фаз, BDD, спеки, код. **Без Task-ID** `sdd-task` отдаёт **карту исполнения** — детерминированный pickable-набор (готовые сейчас) + заблокированные (чем), посчитанный из трекеров (`pickableTasks`, D-TK004); это карта для LOGIC_SWITCH в `execute` (next / specific / batch). Парсеры тикета вынесены в `shared/sdd/ticket.ts` (переиспользует `sdd-check`).

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

| Name                  | Type         | Purpose                                                                |
| --------------------- | ------------ | ---------------------------------------------------------------------- |
| `run`                 | Command      | Точка входа CLI: извлечение планировочных секций, сборка, формат         |
| `formatPlan`          | Utility      | Рендер планировочной поверхности + per-phase manifest + DO-NOT-READ      |
| `ruleId`              | Utility      | rule-link → rule-id (basename без `.xml`) для матчинга gate                |
| `parseMetaInfo`       | Utility      | (`shared/sdd/ticket`) Meta → taskId/status/purpose/scope/module/deps/specRefs |
| `parsePhasesOverview` | Utility      | (`shared/sdd/ticket`) таблица фаз → `PhaseOverview[]`                     |
| `parsePhaseDetail`    | Utility      | (`shared/sdd/ticket`) тело фазы → objective/rules/targetFiles/inputs/exit  |
| `parseVerification`   | Utility      | (`shared/sdd/ticket`) таблица gate → `Gate[]`                             |
| `badInvocation` / `fileError` / `notATicket` | Utility | Билдеры диагностик                            |
| `MetaInfo` / `SpecRef` / `PhaseOverview` / `PhaseDetail` / `Gate` | Value Object | Структуры тикета (`shared/sdd/ticket`) |
| `TaskOutcome`         | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                 |

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

| Argument         | Type   | Description                          |
| ---------------- | ------ | ------------------------------------ |
| `<ticket-path>`  | string | Путь к тикету → планировочная поверхность одного тикета |
| _(без аргумента)_ | —     | **Карта исполнения**: pickable-набор + заблокированные (детерминированно из трекеров) |

`<ticket-path>` → поверхность одного тикета. Без аргумента → карта исполнения (что готово сейчас + что чем заблокировано), `pickableTasks` (D-TK004) — оркестратор берёт её тулом, не глазами.

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

- **Status:** active
- **Why:** Резолв id → путь — отдельная забота оркестратора (`AX_TASK_RESOLUTION`). К моменту вызова путь известен. Тул остаётся узким и детерминированным.
- **Risk accepted:** Прямой вызов «по id» из CLI не сработает; для флоу это не нужно (оркестратор даёт путь).
- **Update:** часть «выбор pickable-таска — забота оркестратора» СУПЕССИРОВАНА D-TK004 — pickable теперь даёт сам тул (режим-карта), оркестратор не читает трекеры глазами.

### D-TK004 — Режим-карта (без аргумента): детерминированный pickable

- **Status:** active
- **Why:** оркестратор не должен «глазами» читать трекеры, чтобы понять, что готово (детерминизм > догадки — общий принцип флоу). `sdd-task` без Task-ID обходит тикеты → `ticketRef` (status+deps) → `pickableTasks` (`shared/sdd/check`: TODO + все deps DONE; placeholder «None…» = нет deps) → карта (pickable + заблокированные, чем). `execute` LOGIC_SWITCH (next / specific / batch) берёт карту тулом. Снимает нагрузку догадок с агента.
- **Risk accepted:** Meta с прозой в Dependencies (запятые) даёт мусор-deps → тикет ложно blocked; чинится на стороне данных (находка: TSK-55 несёт прозу в deps).

### D-TK003 — Поэтапное извлечение секций фаз

- **Status:** active
- **Why:** Цель тула — не дать оркестратору прочитать весь тикет. Сам тул тоже извлекает каждую фазу отдельной секцией `PHASE_P<n>`, а не общим чтением — выходные manifest'ы по конструкции узкие.
- **Risk accepted:** Нет.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/section.ts`, `shared/sdd/ticket.ts`, `#logger`
- **Provides to:** `gennady.ts`; вызывается из `execute` (STEP_1)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
