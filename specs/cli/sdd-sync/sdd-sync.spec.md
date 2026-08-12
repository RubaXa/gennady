# Module: `sdd-sync`

**Module:** sdd-sync · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Распространение статуса тикета в трекеры `*.3-tasks.md`. `execute` (STEP_4) и `reconcile` (STEP_6) вызывают `sdd-sync <ticket>`; тул читает `Task-ID` + `Status` из Meta тикета и приводит строку этого Task-ID в каждом трекере (module → scope → project) к этому статусу, **с пост-проверкой записи** (`AX_VERIFY_AND_FINALIZE`). Колонка Status ищется по заголовку, не по индексу (в module-трекере она 4-я, в scope-трекере 5-я).

**Key properties:**

- Header-located column — `updateTrackerStatus` находит `Task-ID`/`Status` по шапке таблицы; переносимо между разными формами трекеров
- Surgical — переписывается только сегмент Status совпавшей строки; прочие ячейки/строки байт-в-байт нетронуты
- Verified — после записи файл перечитывается и проверяется, что строка уже в синке (иначе exit 1)
- Walk-up discovery — без явных индексов синкаются все `*.3-tasks.md` от каталога тикета вверх

**Invariants:**

- Идемпотентно: совпадающий статус → `in-sync`, файл не трогается
- exit `0` синк (отчёт) · `1` файл тикета / verify-fail · `2` Meta без Task-ID/Status · `4` нет тикета
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-sync specs/cli/core/core.task-foo.md
[sdd-sync] cli-foo → [x] DONE
  updated:    specs/cli/core/core.3-tasks.md
  in-sync:    specs/cli/cli.3-tasks.md
  no-row:     specs/3-tasks.md

# --- явные индексы ---
$ npx gennady sdd-sync ticket.md module.3-tasks.md scope.3-tasks.md
[sdd-sync] cli-foo → [x] DONE
  updated:    module.3-tasks.md
  updated:    scope.3-tasks.md
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                        | Type         | Purpose                                                                    |
| ------------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| `run`                                       | Command      | Точка входа CLI: Meta → Task-ID/Status, обнаружение индексов, синк, verify |
| `discoverIndexes`                           | Utility      | Сбор `*.3-tasks.md` от каталога тикета вверх (cap 8)                       |
| `parseMeta`                                 | Utility      | (`shared/sdd/tracker`) Task-ID + Status из тела Meta                       |
| `updateTrackerStatus`                       | Utility      | (`shared/sdd/tracker`) хирургическая правка ячейки Status по Task-ID       |
| `extractSection`                            | Utility      | (`shared/sdd/section`) извлечение Meta                                     |
| `badInvocation` / `fileError` / `metaError` | Utility      | Билдеры диагностик                                                         |
| `TicketMeta`                                | Value Object | `{ taskId, status }` (оба nullable)                                        |
| `TrackerUpdate`                             | Type         | ok(text, changed) либо fail(`no_table`/`task_not_found`)                   |
| `SyncOutcome`                               | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                   |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Status Propagation

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - `<ticket>` задан; Meta содержит парсимые `Task-ID` + `Status`
- Postconditions:
  - В каждом трекере строка Task-ID получает статус тикета; прочее нетронуто
  - Совпадающий статус → `in-sync` (без записи); строки нет → `no-row`; таблицы нет → `no-table`
  - После записи verify подтверждает синк, иначе exit 1
- Invariants:
  - Колонка Status определяется по шапке (не по фиксированному индексу)
  - Хирургическая правка: только сегмент Status совпавшей строки

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument      | Type   | Description                                                 |
| ------------- | ------ | ----------------------------------------------------------- |
| `<ticket>`    | string | Тикет-источник статуса (читается Meta)                      |
| `[index ...]` | string | Явные трекеры; без них — авто-обход вверх по `*.3-tasks.md` |

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-sync/
├── index.ts             # Entry point for dynamic import
├── sdd-sync.cmd.ts      # Command: Meta → status, discover indexes, update + verify each
├── sdd-sync.types.ts    # error codes, SyncOutcome, diagnostic builders
├── help.ts              # Help text output
└── __tests__/sdd-sync.cmd.test.ts

shared/sdd/tracker.ts    # parseMeta + updateTrackerStatus (header-located, surgical) + __tests__/tracker.test.ts
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**E2E:** отложен (прокси-блок в песочнице). Покрытие: unit (pure + run) + lint + typecheck.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-SY001 — Колонка Status по заголовку, не по индексу

- **Status:** active
- **Why:** module-трекер (`Task-ID|Title|Dependencies|Status|Reopens`) и scope-трекер (`…|Module|Dependencies|Status|Reopens`) держат Status в разных колонках. Поиск по шапке делает один код корректным для обоих и устойчивым к смене формата.
- **Risk accepted:** Нет.

### D-SY002 — Хирургическая правка только ячейки Status

- **Status:** active
- **Why:** Переписывать всю строку — шумный diff и риск задеть Title со спецсимволами. Правится только сегмент `raw[statusCol+1]` по сырому split('|'); остальное байт-в-байт.
- **Risk accepted:** Зависит от наличия ведущего `|` (трекер-строки всегда с него начинаются — guard есть).

### D-SY003 — Walk-up обнаружение индексов + явный override

- **Status:** active
- **Why:** Резолв task-id → пути сложен; co-located layout кладёт module/scope/project индексы по пути тикета вверх. Авто-обход (cap 8) покрывает типовой случай; явные пути — для детерминизма и тестов.
- **Risk accepted:** Обход поднимается до корня ФС (cap 8) — лишние `*.3-tasks.md` вне дерева теоретически попали бы; на практике их там нет, а `no-row` безвреден.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/section.ts`, `shared/sdd/tracker.ts`, `#logger`
- **Provides to:** `gennady.ts`; вызывается из `execute` (STEP_4) и `reconcile` (STEP_6)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
